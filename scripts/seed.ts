/**
 * Seed script — populates a Supabase instance with realistic end-to-end test data
 * covering the full hiring loop: users, roles, rulesets, assessments, keystroke
 * logs, submissions, and a message thread.
 *
 * Usage:
 *   1. Add SUPABASE_SERVICE_ROLE_KEY to the root .env (Supabase dashboard →
 *      Project Settings → API → service_role key). The URL is reused from
 *      VITE_SUPABASE_URL.
 *   2. npm run seed
 *
 * Idempotent: every entity is matched on a natural key (email, title, FK pair)
 * and reused if it already exists, so running it repeatedly never duplicates rows.
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load the root .env (for SUPABASE_SERVICE_ROLE_KEY) and the app's Ember/.env
// (for the project URL via VITE_SUPABASE_URL). Root values take precedence.
dotenv.config()
dotenv.config({ path: 'Ember/.env' })

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    '✗ Missing env. Need SUPABASE_URL (or VITE_SUPABASE_URL) and ' +
      'SUPABASE_SERVICE_ROLE_KEY in .env.',
  )
  process.exit(1)
}

// Service-role client bypasses RLS — required for cross-user seeding.
const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = 'password123'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Create (or reuse) an auth user with a confirmed email so login works at once. */
async function ensureUser(email: string, role: 'recruiter' | 'candidate', fullName: string) {
  // listUsers is paginated; 200 is plenty for a seed DB.
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (listErr) throw listErr

  let user = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role, full_name: fullName },
    })
    if (error) throw error
    user = data.user
    console.log(`  + created user ${email}`)
  } else {
    console.log(`  = user ${email} exists`)
  }
  return user!
}

/** Upsert the profile row for a user (the trigger may have created a bare row). */
async function ensureProfile(id: string, fields: Record<string, unknown>) {
  const { error } = await db.from('profiles').upsert({ id, ...fields }, { onConflict: 'id' })
  if (error) throw error
}

/** Find a role by (recruiter, title) or create it. */
async function ensureRole(recruiterId: string, role: Record<string, unknown>) {
  const { data: existing } = await db
    .from('roles')
    .select('id')
    .eq('recruiter_id', recruiterId)
    .eq('title', role.title as string)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data, error } = await db
    .from('roles')
    .insert({ recruiter_id: recruiterId, ...role })
    .select('id')
    .single()
  if (error) throw error
  console.log(`  + role "${role.title}"`)
  return data.id as string
}

/** Find an assessment by (role, candidate) or create it. */
async function ensureAssessment(roleId: string, candidateId: string, fields: Record<string, unknown>) {
  const { data: existing } = await db
    .from('assessments')
    .select('id')
    .eq('role_id', roleId)
    .eq('candidate_id', candidateId)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data, error } = await db
    .from('assessments')
    .insert({ role_id: roleId, candidate_id: candidateId, ...fields })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

// Build a keystroke log by "typing" target text sequentially, so replaying the
// log reconstructs exactly `finalContent`. Optionally injects one paste event.
function buildLog(file: string, target: string, opts: { withPaste?: boolean } = {}) {
  const log: any[] = []
  let content = ''
  let t = Date.now() - 25 * 60 * 1000 // started ~25 min ago

  const pasteAt = opts.withPaste ? Math.floor(target.length * 0.4) : -1
  const pasteBlock =
    '\n  // pasted helper\n  const memo = new Map();\n  const cached = (k, f) => memo.has(k) ? memo.get(k) : (memo.set(k, f()), memo.get(k));\n'

  for (let i = 0; i < target.length; i++) {
    if (i === pasteAt) {
      t += 400
      log.push({ timestamp: t, file, type: 'paste', content: pasteBlock, position: content.length })
      content += pasteBlock
    }
    const ch = target[i]
    t += 60 + Math.floor(Math.random() * 90) // 60–150ms between keys
    log.push({ timestamp: t, file, type: 'insert', content: ch, position: content.length })
    content += ch
  }
  return { log, finalContent: content }
}

async function ensureLog(assessmentId: string, log: any[], finalized: boolean) {
  const { data: existing } = await db
    .from('assessment_logs')
    .select('id')
    .eq('assessment_id', assessmentId)
    .maybeSingle()
  if (existing) {
    await db.from('assessment_logs').update({ log, finalized }).eq('assessment_id', assessmentId)
  } else {
    await db.from('assessment_logs').insert({ assessment_id: assessmentId, log, finalized })
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Ember test data…\n')

  // 1. Users + profiles
  console.log('Users:')
  const recruiter = await ensureUser('recruiter@test.ember', 'recruiter', 'Riley Recruiter')
  const alice = await ensureUser('alice@test.ember', 'candidate', 'Alice Anderson')
  const bob = await ensureUser('bob@test.ember', 'candidate', 'Bob Baker')

  await ensureProfile(recruiter.id, {
    role: 'recruiter',
    full_name: 'Riley Recruiter',
    company_name: 'Acme Corp',
    headline: 'Talent Lead at Acme Corp',
  })
  await ensureProfile(alice.id, {
    role: 'candidate',
    full_name: 'Alice Anderson',
    username: 'alice',
    headline: 'Frontend Engineer · React & TypeScript',
    availability: 'open',
  })
  await ensureProfile(bob.id, {
    role: 'candidate',
    full_name: 'Bob Baker',
    username: 'bob',
    headline: 'Full-stack Engineer · Node & Postgres',
    availability: 'available',
  })

  // 2. Roles
  console.log('Roles:')
  const frontendRole = await ensureRole(recruiter.id, {
    title: 'Frontend Engineer',
    department: 'Engineering',
    location: 'remote',
    description: 'Build delightful, accessible UI for Acme Corp’s flagship product.',
    salary_min: 120000,
    salary_max: 160000,
    status: 'active',
  })
  await ensureRole(recruiter.id, {
    title: 'Backend Engineer',
    department: 'Engineering',
    location: 'hybrid',
    description: 'Design resilient services and APIs. (Draft — not yet published.)',
    salary_min: 130000,
    salary_max: 170000,
    status: 'draft',
  })
  await ensureRole(recruiter.id, {
    title: 'Data Analyst',
    department: 'Data',
    location: 'onsite',
    description: 'Turn product data into decisions. (Archived role.)',
    salary_min: 95000,
    salary_max: 125000,
    status: 'archived',
  })

  // 3. Ruleset on the active role
  console.log('Ruleset:')
  const { error: rsErr } = await db.from('rulesets').upsert(
    {
      role_id: frontendRole,
      stack_tags: ['React', 'TypeScript'],
      task_type: 'build_a_feature',
      task_description:
        'Implement a debounced search box that filters a list of users by name and highlights matches.',
      time_limit_mins: 60,
      ai_allowed: false,
      starter_template: 'blank',
      runtime: 'node',
      issue_title: 'Add debounced user search',
      problem_statement:
        'Users complain the search filters on every keystroke and feels janky. Add a 300ms debounce, ' +
        'case-insensitive matching, and wrap matched substrings in <mark>. Export `filterUsers(users, query)` ' +
        'from solution.js so the tests can verify the matching logic.',
      tests: [
        { name: 'matches case-insensitively', content: "import { filterUsers } from './solution.js'", hidden: false },
        { name: 'returns all on empty query', content: '// hidden grading test', hidden: true },
      ],
      codebase: [
        { name: 'solution.js', content: 'export function filterUsers(users, query) {\n  // TODO\n}\n' },
        { name: 'users.js', content: "export const users = ['Ada', 'Alan', 'Grace', 'Linus']\n" },
      ],
    },
    { onConflict: 'role_id' },
  )
  if (rsErr) throw rsErr
  console.log('  = ruleset on Frontend Engineer')

  // 4. Alice — fully submitted assessment with ~200 log entries + 1 paste
  console.log('Assessments + logs:')
  const aliceSolution =
    "export function filterUsers(users, query) {\n" +
    "  const q = query.trim().toLowerCase();\n" +
    "  if (!q) return users.map(u => ({ name: u, html: u }));\n" +
    "  return users\n" +
    "    .filter(u => u.toLowerCase().includes(q))\n" +
    "    .map(u => {\n" +
    "      const i = u.toLowerCase().indexOf(q);\n" +
    "      const html = u.slice(0, i) + '<mark>' + u.slice(i, i + q.length) + '</mark>' + u.slice(i + q.length);\n" +
    "      return { name: u, html };\n" +
    "    });\n" +
    "}\n"
  const aliceBuilt = buildLog('solution.js', aliceSolution, { withPaste: true })
  const aliceAssessment = await ensureAssessment(frontendRole, alice.id, {
    status: 'submitted',
    files: [{ name: 'solution.js', content: aliceBuilt.finalContent }],
    time_limit_mins: 60,
    submitted_at: new Date().toISOString(),
  })
  await ensureLog(aliceAssessment, aliceBuilt.log, true)
  const alicePastes = aliceBuilt.log.filter(e => e.type === 'paste').length
  console.log(`  = Alice: submitted, ${aliceBuilt.log.length} log entries, ${alicePastes} paste`)

  // Bob — in-progress assessment with a partial log (no paste, not finalized)
  const bobPartial = "export function filterUsers(users, query) {\n  const q = query.toLowerCase();\n  return users.fil"
  const bobBuilt = buildLog('solution.js', bobPartial)
  const bobAssessment = await ensureAssessment(frontendRole, bob.id, {
    status: 'in_progress',
    files: [{ name: 'solution.js', content: bobBuilt.finalContent }],
    time_limit_mins: 60,
  })
  await ensureLog(bobAssessment, bobBuilt.log, false)
  console.log(`  = Bob: in_progress, ${bobBuilt.log.length} log entries`)

  // 5. Alice's submission (pending review)
  console.log('Submissions:')
  const { data: existingSub } = await db
    .from('submissions')
    .select('id')
    .eq('role_id', frontendRole)
    .eq('candidate_id', alice.id)
    .eq('assessment_id', aliceAssessment)
    .maybeSingle()
  if (!existingSub) {
    const { error } = await db.from('submissions').insert({
      role_id: frontendRole,
      candidate_id: alice.id,
      assessment_id: aliceAssessment,
      status: 'pending_review',
    })
    if (error) throw error
    console.log('  + Alice submission (pending_review)')
  } else {
    console.log('  = Alice submission exists')
  }

  // 6. Thread + 3 messages between recruiter and Alice
  console.log('Messages:')
  let threadId: string
  const { data: existingThread } = await db
    .from('threads')
    .select('id')
    .eq('recruiter_id', recruiter.id)
    .eq('candidate_id', alice.id)
    .eq('role_id', frontendRole)
    .maybeSingle()
  if (existingThread) {
    threadId = existingThread.id
  } else {
    const { data, error } = await db
      .from('threads')
      .insert({ recruiter_id: recruiter.id, candidate_id: alice.id, role_id: frontendRole })
      .select('id')
      .single()
    if (error) throw error
    threadId = data.id
  }

  // Only seed messages if the thread is empty (keeps it idempotent).
  const { count: msgCount } = await db
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId)
  if (!msgCount) {
    const base = Date.now() - 60 * 60 * 1000
    const { error } = await db.from('messages').insert([
      {
        thread_id: threadId, sender_id: recruiter.id, read: true,
        content: 'Hi Alice — really impressed with your Frontend Engineer submission!',
        created_at: new Date(base).toISOString(),
      },
      {
        thread_id: threadId, sender_id: alice.id, read: true,
        content: 'Thanks Riley! I enjoyed the debounce challenge. Happy to walk through my approach.',
        created_at: new Date(base + 5 * 60 * 1000).toISOString(),
      },
      {
        thread_id: threadId, sender_id: recruiter.id, read: false,
        content: 'Perfect. Are you free for a 30-min call this week?',
        created_at: new Date(base + 10 * 60 * 1000).toISOString(),
      },
    ])
    if (error) throw error
    console.log('  + 3 messages (2 recruiter, 1 Alice)')
  } else {
    console.log('  = thread already has messages')
  }

  // 7. Demo mode: dedicated read-only recruiter + candidate, data built by the
  // reset_demo_data() SQL function (single source of truth, also run nightly).
  console.log('Demo mode:')
  const demoPassword = process.env.DEMO_PASSWORD || 'demo-ember-readonly'
  const demoRecruiter = await ensureUser('demo@ember.dev', 'recruiter', 'Demo Recruiter')
  const demoCandidate = await ensureUser('demo-candidate@ember.dev', 'candidate', 'Jordan Rivera')
  // Demo recruiter signs in with a known password via the edge function.
  await db.auth.admin.updateUserById(demoRecruiter.id, { password: demoPassword })
  await db.from('app_settings').upsert([
    { key: 'demo_user_id', value: demoRecruiter.id },
    { key: 'demo_candidate_id', value: demoCandidate.id },
  ], { onConflict: 'key' })
  const { error: resetErr } = await db.rpc('reset_demo_data')
  if (resetErr) console.warn(`  ! reset_demo_data failed: ${resetErr.message}`)
  else console.log('  = demo data built (demo@ember.dev)')

  console.log('\n✓ Seed complete.')
  console.log('  Recruiter: recruiter@test.ember / password123')
  console.log('  Candidates: alice@test.ember, bob@test.ember / password123')
  console.log(`  Demo recruiter: demo@ember.dev / ${demoPassword} (set DEMO_PASSWORD env to match the edge function)`)
}

main().catch(err => {
  console.error('\n✗ Seed failed:', err.message ?? err)
  process.exit(1)
})
