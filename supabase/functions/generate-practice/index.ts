// Edge Function: generate-practice
// Picks a skill gap for the caller, asks Claude to generate a difficulty-scaled
// JavaScript practice task (description + starter files + tests), and stores it
// as a practice_tasks row. Returns only the new task id.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.69.0'

type Tier = 'beginner' | 'intermediate' | 'advanced'
const TIER_ORDER: Tier[] = ['beginner', 'intermediate', 'advanced']

function nextTier(current: Tier | null): Tier {
  if (!current) return 'intermediate' // no evidence yet → start mid
  const i = TIER_ORDER.indexOf(current)
  return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)]
}

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

// Cost guardrails: each generation is a paid Anthropic API call.
const MAX_TASKS_PER_HOUR = 10        // per-candidate cap on paid generations
const REUSE_WINDOW_HOURS = 24        // reuse an unsolved same-skill task within this window

// Stable instructions — cached so repeated generations are cheap.
const SYSTEM = `You generate short, self-contained coding practice tasks for the Ember assessment platform.

Hard constraints:
- Language is plain JavaScript that runs on Node with NO imports, NO require, and NO npm packages. Only language built-ins.
- The candidate writes plain functions in a single file. Starter files give a skeleton with TODOs.
- Tests are assertion lines using a provided helper: emberAssert(name, condition). They run AFTER the candidate's code in the same scope, so they call the functions the starter file declares.
- Each test object is { name, content, hidden }. "content" is one or more lines of JS using emberAssert. Provide at least one visible test (hidden:false) and at least two hidden tests (hidden:true) covering edge cases.
- Do NOT define emberAssert yourself; it is injected. Do NOT console.log in tests.
- Keep the task solvable in 10–20 minutes and scoped to the named skill and difficulty tier.

Difficulty tiers: beginner = single straightforward function; intermediate = multiple cases / basic data structures; advanced = non-trivial algorithm or edge-case-heavy logic.

Example test content: "emberAssert('adds positives', add(2, 3) === 5)"

Respond ONLY with the structured JSON object.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    console.log('generate-practice invoked; anthropic key present:', !!anthropicKey)
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const body = await req.json().catch(() => ({}))
    const requestedSkill: string | undefined = body?.skill

    // Guardrail 1 — per-candidate hourly rate limit (caps paid API spend).
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentCount } = await admin
      .from('practice_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', user.id)
      .gte('created_at', hourAgo)
    if ((recentCount ?? 0) >= MAX_TASKS_PER_HOUR) {
      return json({ error: 'Practice generation limit reached. Try again later.' }, 429)
    }

    // Pick the target skill + tier (adaptive: gap + level).
    const { data: skills } = await admin
      .from('candidate_skills')
      .select('skill, label, tier, evidence_count')
      .eq('candidate_id', user.id)

    let skillSlug: string
    let skillLabel: string
    let currentTier: Tier | null = null

    const list = (skills ?? []) as { skill: string; label: string; tier: Tier; evidence_count: number }[]
    if (requestedSkill) {
      const match = list.find(s => s.skill === requestedSkill)
      skillSlug = requestedSkill
      skillLabel = match?.label ?? requestedSkill
      currentTier = match?.tier ?? null
    } else if (list.length > 0) {
      // Weakest gap: lowest tier, then least evidence.
      const sorted = [...list].sort((a, b) =>
        TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.evidence_count - b.evidence_count)
      skillSlug = sorted[0].skill
      skillLabel = sorted[0].label
      currentTier = sorted[0].tier
    } else {
      // No profile yet — a sensible general default.
      skillSlug = 'javascript'
      skillLabel = 'JavaScript'
      currentTier = null
    }

    const targetTier = nextTier(currentTier)

    // Guardrail 2 — reuse a recent unsolved task for this skill instead of
    // paying for a new generation. Find the candidate's latest task for the
    // skill in the window, and reuse it if it has no submitted attempt yet.
    const reuseSince = new Date(Date.now() - REUSE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    const { data: recentTasks } = await admin
      .from('practice_tasks')
      .select('id')
      .eq('candidate_id', user.id)
      .eq('skill', skillSlug)
      .gte('created_at', reuseSince)
      .order('created_at', { ascending: false })
      .limit(1)
    const candidateTask = recentTasks?.[0]
    if (candidateTask) {
      const { count: attemptCount } = await admin
        .from('practice_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('practice_task_id', candidateTask.id)
      if ((attemptCount ?? 0) === 0) {
        return json({ id: candidateTask.id, reused: true })
      }
    }

    // Generate the task.
    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        task_description: { type: 'string' },
        starter_files: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: { name: { type: 'string' }, content: { type: 'string' } },
            required: ['name', 'content'],
          },
        },
        tests: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: { name: { type: 'string' }, content: { type: 'string' }, hidden: { type: 'boolean' } },
            required: ['name', 'content', 'hidden'],
          },
        },
      },
      required: ['task_description', 'starter_files', 'tests'],
    }

    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema },
      },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Generate a ${targetTier} practice task for the skill "${skillLabel}". The task must exercise ${skillLabel} specifically.`,
      }],
    } as any)

    const textBlock = (msg.content as any[]).find(b => b.type === 'text')
    if (!textBlock?.text) return json({ error: 'generation failed' }, 502)
    const parsed = JSON.parse(textBlock.text)

    const { data: inserted, error: insertErr } = await admin
      .from('practice_tasks')
      .insert({
        candidate_id: user.id,
        skill: skillSlug,
        skill_label: skillLabel,
        tier: targetTier,
        task_description: parsed.task_description,
        starter_files: parsed.starter_files ?? [],
        runtime: 'node',
        tests: parsed.tests ?? [],
      })
      .select('id')
      .single()

    if (insertErr) return json({ error: insertErr.message }, 500)
    return json({ id: inserted.id })
  } catch (e) {
    console.error('generate-practice error:', (e as Error).stack ?? (e as Error).message ?? String(e))
    return json({ error: (e as Error).message ?? 'internal error' }, 500)
  }
})
