import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { STARTER_TEMPLATES, type StarterTemplate } from '../../lib/starterTemplates'
import type { Runtime, TestCase } from '../../lib/testHarness'

type TaskType = 'build_a_feature' | 'fix_a_bug' | 'refactor_code' | 'write_tests' | 'other'
type TimeLimit = 30 | 45 | 60 | 90

interface RulesetForm {
  stack_tags: string[]
  task_type: TaskType
  task_description: string
  time_limit_mins: TimeLimit
  ai_allowed: boolean
  starter_template: StarterTemplate
  runtime: Runtime
  tests: TestCase[]
}

const runtimeOptions: { value: Runtime; label: string }[] = [
  { value: 'node', label: 'JavaScript (Node)' },
  { value: 'python', label: 'Python' },
]

const TEST_STUBS: Record<Runtime, string> = {
  node: "emberAssert('adds two numbers', add(2, 3) === 5)",
  python: "ember_assert('adds two numbers', add(2, 3) == 5)",
}

const taskTypeOptions: { value: TaskType; label: string; description: string }[] = [
  { value: 'build_a_feature', label: 'Build a feature', description: 'Candidate builds something new from a spec' },
  { value: 'fix_a_bug', label: 'Fix a bug', description: 'Candidate diagnoses and fixes broken code' },
  { value: 'refactor_code', label: 'Refactor code', description: 'Candidate improves existing code quality' },
  { value: 'write_tests', label: 'Write tests', description: 'Candidate writes test coverage for existing code' },
  { value: 'other', label: 'Other', description: 'Custom task type' },
]

const timeLimitOptions: { value: TimeLimit; label: string }[] = [
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '60 minutes' },
  { value: 90, label: '90 minutes' },
]

export default function Ruleset() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [role, setRole] = useState<{ title: string } | null>(null)
  const [form, setForm] = useState<RulesetForm>({
    stack_tags: [],
    task_type: 'build_a_feature',
    task_description: '',
    time_limit_mins: 60,
    ai_allowed: false,
    starter_template: 'blank',
    runtime: 'node',
    tests: [],
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    async function load() {
      // Load role title
      const { data: roleData } = await supabase
        .from('roles')
        .select('title')
        .eq('id', id)
        .single()

      if (roleData) setRole(roleData)

      // Load existing ruleset if one exists
      const { data: rulesetData } = await supabase
        .from('rulesets')
        .select('*')
        .eq('role_id', id)
        .single()

      if (rulesetData) {
        setForm({
          stack_tags: rulesetData.stack_tags ?? [],
          task_type: rulesetData.task_type ?? 'build_a_feature',
          task_description: rulesetData.task_description ?? '',
          time_limit_mins: rulesetData.time_limit_mins ?? 60,
          ai_allowed: rulesetData.ai_allowed ?? false,
          starter_template: rulesetData.starter_template ?? 'blank',
          runtime: rulesetData.runtime ?? 'node',
          tests: rulesetData.tests ?? [],
        })
      }

      setLoading(false)
    }
    load()
  }, [id])

  function addTag() {
    const trimmed = tagInput.trim()
    if (!trimmed || form.stack_tags.includes(trimmed)) return
    setForm(prev => ({ ...prev, stack_tags: [...prev.stack_tags, trimmed] }))
    setTagInput('')
  }

  function removeTag(tag: string) {
    setForm(prev => ({ ...prev, stack_tags: prev.stack_tags.filter(t => t !== tag) }))
  }

  function addTest() {
    setForm(prev => ({
      ...prev,
      tests: [
        ...prev.tests,
        { name: `Test ${prev.tests.length + 1}`, content: TEST_STUBS[prev.runtime], hidden: false },
      ],
    }))
  }

  function updateTest(index: number, patch: Partial<TestCase>) {
    setForm(prev => ({
      ...prev,
      tests: prev.tests.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }))
  }

  function removeTest(index: number) {
    setForm(prev => ({ ...prev, tests: prev.tests.filter((_, i) => i !== index) }))
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  async function handleSave() {
    if (!id) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error: saveError } = await supabase
      .from('rulesets')
      .upsert({
        role_id: id,
        stack_tags: form.stack_tags,
        task_type: form.task_type,
        task_description: form.task_description,
        time_limit_mins: form.time_limit_mins,
        ai_allowed: form.ai_allowed,
        starter_template: form.starter_template,
        runtime: form.runtime,
        tests: form.tests,
      }, { onConflict: 'role_id' })

    if (saveError) {
      setError(saveError.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }

    setSaving(false)
  }

  if (loading) return <div style={styles.loading}>Loading...</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button onClick={() => navigate('/recruiter/roles')} style={styles.backBtn}>
          ← Back to roles
        </button>
        <h1 style={styles.title}>Ruleset Builder</h1>
        <p style={styles.subtitle}>
          {role?.title} — define what candidates will actually be asked to do.
        </p>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {saved && <div style={styles.success}>Ruleset saved. Candidates can now practice against it.</div>}

      <div style={styles.columns}>
        {/* Left */}
        <div style={styles.left}>

          {/* Task type */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Task type</p>
            <p style={styles.cardHint}>What kind of work will the candidate be doing?</p>
            <div style={styles.taskOptions}>
              {taskTypeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm(prev => ({ ...prev, task_type: opt.value }))}
                  style={{
                    ...styles.taskOption,
                    ...(form.task_type === opt.value ? styles.taskOptionActive : {}),
                  }}
                >
                  <span style={styles.taskOptionLabel}>{opt.label}</span>
                  <span style={styles.taskOptionDesc}>{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Time limit */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Time limit</p>
            <p style={styles.cardHint}>How long does the candidate have to complete the assessment?</p>
            <div style={styles.timeOptions}>
              {timeLimitOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm(prev => ({ ...prev, time_limit_mins: opt.value }))}
                  style={{
                    ...styles.timeOption,
                    ...(form.time_limit_mins === opt.value ? styles.timeOptionActive : {}),
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Starter codebase */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Starter codebase</p>
            <p style={styles.cardHint}>
              Give the candidate a surrounding codebase to work in. Their assessment becomes an
              answer to this scaffold.
            </p>
            <div style={styles.taskOptions}>
              {STARTER_TEMPLATES.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm(prev => ({ ...prev, starter_template: opt.value }))}
                  style={{
                    ...styles.taskOption,
                    ...(form.starter_template === opt.value ? styles.taskOptionActive : {}),
                  }}
                >
                  <span style={styles.taskOptionLabel}>{opt.label}</span>
                  <span style={styles.taskOptionDesc}>{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Runtime */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Runtime</p>
            <p style={styles.cardHint}>
              Language the candidate's code runs in when tests execute.
            </p>
            <div style={styles.timeOptions}>
              {runtimeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm(prev => ({ ...prev, runtime: opt.value }))}
                  style={{
                    ...styles.timeOption,
                    ...(form.runtime === opt.value ? styles.timeOptionActive : {}),
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={styles.right}>

          {/* Stack tags */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Tech stack</p>
            <p style={styles.cardHint}>What technologies should the candidate be comfortable with?</p>
            <div style={styles.tagInputRow}>
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="e.g. React, Node, PostgreSQL"
                style={styles.input}
              />
              <button onClick={addTag} style={styles.addBtn}>Add</button>
            </div>
            <div style={styles.tags}>
              {form.stack_tags.map(tag => (
                <span key={tag} style={styles.tag}>
                  {tag}
                  <button onClick={() => removeTag(tag)} style={styles.removeTag}>×</button>
                </span>
              ))}
              {form.stack_tags.length === 0 && (
                <p style={styles.emptyTags}>No technologies added yet</p>
              )}
            </div>
          </div>

          {/* Task description */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Task description</p>
            <p style={styles.cardHint}>
              Describe exactly what the candidate will be asked to build, fix, or do.
              Be specific — this is the actual work they'd do on day one.
            </p>
            <textarea
              value={form.task_description}
              onChange={e => {
                if (e.target.value.length <= 500) {
                  setForm(prev => ({ ...prev, task_description: e.target.value }))
                }
              }}
              placeholder="e.g. Build a filterable product listing component in React that fetches from a mock API endpoint, handles loading and error states, and allows filtering by category..."
              style={styles.textarea}
              rows={6}
            />
            <p style={styles.charCount}>{form.task_description.length}/500</p>
          </div>

          {/* AI policy */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>AI usage policy</p>
            <p style={styles.cardHint}>
              If allowed, all AI inputs are logged and visible to you in the replay.
            </p>
            <div style={styles.aiToggleRow}>
              <button
                onClick={() => setForm(prev => ({ ...prev, ai_allowed: false }))}
                style={{
                  ...styles.aiOption,
                  ...(!form.ai_allowed ? styles.aiOptionActive : {}),
                }}
              >
                <span style={styles.aiOptionTitle}>Not allowed</span>
                <span style={styles.aiOptionDesc}>Candidate must work independently</span>
              </button>
              <button
                onClick={() => setForm(prev => ({ ...prev, ai_allowed: true }))}
                style={{
                  ...styles.aiOption,
                  ...(form.ai_allowed ? styles.aiOptionActiveGold : {}),
                }}
              >
                <span style={styles.aiOptionTitle}>Allowed</span>
                <span style={styles.aiOptionDesc}>AI inputs logged and visible in replay</span>
              </button>
            </div>
          </div>

          {/* Tests */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Tests</p>
            <p style={styles.cardHint}>
              Assertions run against the candidate's code. Use <code>{form.runtime === 'python' ? 'ember_assert(name, cond)' : 'emberAssert(name, cond)'}</code>.
              Visible tests let candidates self-check; hidden tests are used to score the submission.
            </p>

            <div style={styles.testList}>
              {form.tests.map((test, i) => (
                <div key={i} style={styles.testItem}>
                  <div style={styles.testItemHead}>
                    <input
                      type="text"
                      value={test.name}
                      onChange={e => updateTest(i, { name: e.target.value })}
                      placeholder="Test name"
                      style={styles.testNameInput}
                    />
                    <label style={styles.hiddenToggle}>
                      <input
                        type="checkbox"
                        checked={test.hidden}
                        onChange={e => updateTest(i, { hidden: e.target.checked })}
                      />
                      Hidden
                    </label>
                    <button onClick={() => removeTest(i)} style={styles.removeTest}>×</button>
                  </div>
                  <textarea
                    value={test.content}
                    onChange={e => updateTest(i, { content: e.target.value })}
                    placeholder={TEST_STUBS[form.runtime]}
                    style={styles.testTextarea}
                    rows={3}
                    spellCheck={false}
                  />
                </div>
              ))}
              {form.tests.length === 0 && (
                <p style={styles.emptyTags}>No tests yet — add one to enable scoring.</p>
              )}
            </div>

            <button onClick={addTest} style={styles.addTestBtn}>+ Add test</button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={saving ? { ...styles.saveBtn, opacity: 0.6 } : styles.saveBtn}
          >
            {saving ? 'Saving...' : 'Save ruleset'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '900px' },
  loading: { padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '14px' },
  header: { marginBottom: '32px' },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '0',
    marginBottom: '12px',
    display: 'block',
  },
  title: { fontSize: 'var(--text-3xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 var(--space-2)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: 0 },
  error: {
    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '13px',
    color: 'var(--color-error)', marginBottom: '20px',
  },
  success: {
    background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '13px',
    color: 'var(--color-success)', marginBottom: '20px',
  },
  columns: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)', alignItems: 'start' },
  left: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' },
  right: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' },
  card: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-md)' },
  cardLabel: {
    fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-2)',
  },
  cardHint: { fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-4)', lineHeight: '1.5' },
  taskOptions: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  taskOption: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    padding: '11px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-tertiary)', cursor: 'pointer', textAlign: 'left', transition: 'all var(--transition-fast)',
  },
  taskOptionActive: { borderColor: 'var(--color-primary)', backgroundColor: 'rgba(249, 115, 22, 0.1)' },
  taskOptionLabel: { fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)' },
  taskOptionDesc: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' },
  timeOptions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
  timeOption: {
    padding: '11px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-tertiary)', cursor: 'pointer', fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    color: 'var(--color-text-secondary)', transition: 'all var(--transition-fast)',
  },
  timeOptionActive: {
    borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary)', color: '#fff',
    boxShadow: '0 2px 8px rgba(249, 115, 22, 0.25)',
  },
  tagInputRow: { display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' },
  input: {
    padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  addBtn: {
    padding: '10px 18px', backgroundColor: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer', flexShrink: 0,
  },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' },
  tag: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
    padding: '5px 10px', backgroundColor: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.3)',
    borderRadius: '999px', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', color: 'var(--color-primary)',
  },
  removeTag: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--color-primary)', fontSize: 'var(--text-base)', padding: '0', lineHeight: 1,
  },
  emptyTags: { fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', margin: 0 },
  textarea: {
    padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)',
    outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical',
    fontFamily: 'var(--font-primary)', lineHeight: 1.6,
  },
  charCount: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: 'var(--space-2) 0 0', textAlign: 'right' },
  aiToggleRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
  aiOption: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    padding: '11px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-tertiary)', cursor: 'pointer', textAlign: 'left', transition: 'all var(--transition-fast)',
  },
  aiOptionActive: { borderColor: 'var(--color-primary)', backgroundColor: 'rgba(249, 115, 22, 0.1)' },
  aiOptionActiveGold: { borderColor: 'var(--color-primary)', backgroundColor: 'rgba(249, 115, 22, 0.1)' },
  aiOptionTitle: { fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)' },
  aiOptionDesc: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' },
  saveBtn: {
    padding: '12px', backgroundColor: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)',
    fontWeight: 'var(--weight-semibold)', cursor: 'pointer', width: '100%',
  },
  testList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' },
  testItem: {
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)',
  },
  testItemHead: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' },
  testNameInput: {
    flex: 1, padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-secondary)',
    outline: 'none',
  },
  hiddenToggle: {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  removeTest: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--color-text-tertiary)', fontSize: 'var(--text-lg)', padding: '0 4px', lineHeight: 1,
  },
  testTextarea: {
    width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-secondary)',
    outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--font-mono)', lineHeight: 1.5,
  },
  addTestBtn: {
    padding: '8px 14px', background: 'transparent', border: '1px dashed var(--color-border)',
    borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
    cursor: 'pointer', fontWeight: 'var(--weight-medium)',
  },
}