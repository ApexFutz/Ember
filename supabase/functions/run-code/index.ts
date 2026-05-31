// Edge Function: run-code
// Executes candidate JavaScript against ruleset tests inside an in-process
// QuickJS WASM sandbox (no network, no infra, isolated from secrets).
// - Hidden test bodies are loaded server-side (service role) and NEVER returned
//   to the client.
// - mode 'practice': runs only visible tests, returns per-test results.
// - mode 'submit':   runs all tests, computes a score + metrics, and writes them
//   to the submissions row (keyed by assessment_id) so the score can't be forged.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { newQuickJSWASMModuleFromVariant } from 'https://esm.sh/quickjs-emscripten-core@0.29.2'
import quickjsVariant from 'https://esm.sh/@jitl/quickjs-singlefile-browser-release-sync@0.29.2'
import {
  buildProgram,
  parseResults,
  type Runtime,
  type TestCase,
  type TestResult,
} from './harness.ts'
import { deriveSkills, tierFromStats } from './skills.ts'

const EXEC_TIMEOUT_MS = 5000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Run a self-contained JS program in a fresh QuickJS context, capturing
// console.log output. The candidate code cannot reach Deno APIs or env.
let quickjsModule: Promise<Awaited<ReturnType<typeof newQuickJSWASMModuleFromVariant>>> | null = null
function getQuickJSModule() {
  if (!quickjsModule) quickjsModule = newQuickJSWASMModuleFromVariant(quickjsVariant)
  return quickjsModule
}

async function runJs(program: string): Promise<{ stdout: string; error: string | null }> {
  const QuickJS = await getQuickJSModule()
  const vm = QuickJS.newContext()
  const out: string[] = []
  try {
    const logFn = vm.newFunction('log', (...args) => {
      out.push(args.map(a => String(vm.dump(a))).join(' '))
    })
    const consoleObj = vm.newObject()
    vm.setProp(consoleObj, 'log', logFn)
    vm.setProp(vm.global, 'console', consoleObj)
    consoleObj.dispose()
    logFn.dispose()

    const deadline = Date.now() + EXEC_TIMEOUT_MS
    vm.runtime.setInterruptHandler(() => Date.now() > deadline)

    const result = vm.evalCode(program)
    let error: string | null = null
    if (result.error) {
      error = String(vm.dump(result.error))
      result.error.dispose()
    } else {
      result.value.dispose()
    }
    return { stdout: out.join('\n'), error }
  } finally {
    vm.dispose()
  }
}

async function runTest(runtime: Runtime, files: any[], test: TestCase): Promise<TestResult[]> {
  if (runtime !== 'node') {
    return [{ name: test.name, passed: false, message: 'Only the JavaScript (Node) runtime is supported currently.' }]
  }
  const program = buildProgram(runtime, files, test)
  let stdout = ''
  let error: string | null = null
  try {
    ({ stdout, error } = await runJs(program))
  } catch (e) {
    return [{ name: test.name, passed: false, message: `runner error: ${(e as Error).message}` }]
  }
  const parsed = parseResults(stdout)
  // No marker lines at all → the program threw before any assertion ran.
  if (parsed.length === 0) {
    return [{ name: test.name, passed: false, message: (error ?? 'no output').slice(0, 300) }]
  }
  return parsed
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify the caller is an authenticated user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)

    const { role_id, files, mode, assessment_id } = await req.json()
    if (!role_id || !Array.isArray(files)) return json({ error: 'bad request' }, 400)

    const { data: ruleset } = await admin
      .from('rulesets')
      .select('runtime, tests, stack_tags, task_type')
      .eq('role_id', role_id)
      .single()

    const runtime: Runtime = (ruleset?.runtime as Runtime) ?? 'node'
    const allTests: TestCase[] = Array.isArray(ruleset?.tests) ? ruleset!.tests : []

    if (mode === 'practice') {
      const visible = allTests.filter(t => !t.hidden)
      const results: TestResult[] = []
      for (const t of visible) results.push(...(await runTest(runtime, files, t)))
      return json({ results })
    }

    if (mode === 'submit') {
      if (!assessment_id) return json({ error: 'assessment_id required' }, 400)

      const results: TestResult[] = []
      for (const t of allTests) results.push(...(await runTest(runtime, files, t)))
      const total = results.length
      const passed = results.filter(r => r.passed).length
      const score = total > 0 ? passed / total : null

      // Derive integrity/effort metrics from the recorded logs + timing.
      const { data: logRow } = await admin
        .from('assessment_logs')
        .select('log')
        .eq('assessment_id', assessment_id)
        .maybeSingle()
      const log: any[] = Array.isArray(logRow?.log) ? logRow!.log : []
      const editCount = log.length
      const pasteCount = log.filter(e => e?.type === 'paste').length

      const { data: assessment } = await admin
        .from('assessments')
        .select('created_at, submitted_at')
        .eq('id', assessment_id)
        .single()
      let durationS: number | null = null
      if (assessment?.created_at && assessment?.submitted_at) {
        durationS = Math.round(
          (new Date(assessment.submitted_at).getTime() - new Date(assessment.created_at).getTime()) / 1000,
        )
      }

      const metrics = { edit_count: editCount, paste_count: pasteCount, duration_s: durationS }

      await admin
        .from('submissions')
        .update({ score, tests_passed: passed, tests_total: total, metrics })
        .eq('assessment_id', assessment_id)

      // Attribute the result to the candidate's skill profile (only when scored).
      if (score !== null) {
        const skills = deriveSkills(ruleset?.stack_tags, ruleset?.task_type ?? '')
        for (const skill of skills) {
          const { data: existing } = await admin
            .from('candidate_skills')
            .select('evidence_count, score_sum')
            .eq('candidate_id', user.id)
            .eq('skill', skill.slug)
            .maybeSingle()

          const evidenceCount = (existing?.evidence_count ?? 0) + 1
          const scoreSum = Number(existing?.score_sum ?? 0) + score
          const tier = tierFromStats(scoreSum / evidenceCount, evidenceCount)

          await admin.from('candidate_skills').upsert({
            candidate_id: user.id,
            skill: skill.slug,
            label: skill.label,
            evidence_count: evidenceCount,
            score_sum: scoreSum,
            tier,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'candidate_id,skill' })
        }
      }

      return json({ tests_passed: passed, tests_total: total, score })
    }

    return json({ error: 'unknown mode' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message ?? 'internal error' }, 500)
  }
})
