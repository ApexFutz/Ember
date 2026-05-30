import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type TaskType = 'build_a_feature' | 'fix_a_bug' | 'refactor_code' | 'write_tests' | 'other'
type TimeLimit = 30 | 45 | 60 | 90

interface RulesetForm {
  stack_tags: string[]
  task_type: TaskType
  task_description: string
  time_limit_mins: TimeLimit
  ai_allowed: boolean
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
  loading: { padding: '2rem', color: '#8a837a' },
  header: { marginBottom: '32px' },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#8a837a',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '0',
    marginBottom: '12px',
    display: 'block',
  },
  title: { fontSize: '24px', fontWeight: '500', color: '#1a1714', margin: '0 0 4px' },
  subtitle: { fontSize: '14px', color: '#8a837a', margin: 0 },
  error: {
    background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '3px',
    padding: '10px 14px', fontSize: '13px', color: '#991b1b', marginBottom: '20px',
  },
  success: {
    background: '#d8f3dc', border: '1px solid #a8d5b5', borderRadius: '3px',
    padding: '10px 14px', fontSize: '13px', color: '#2d6a4f', marginBottom: '20px',
  },
  columns: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' },
  left: { display: 'flex', flexDirection: 'column', gap: '16px' },
  right: { display: 'flex', flexDirection: 'column', gap: '16px' },
  card: { background: '#fff', border: '1px solid #ddd6cc', borderRadius: '4px', padding: '20px' },
  cardLabel: {
    fontSize: '11px', fontWeight: '500', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: '#8a837a', margin: '0 0 6px',
  },
  cardHint: { fontSize: '12px', color: '#8a837a', margin: '0 0 16px', lineHeight: '1.5' },
  taskOptions: { display: 'flex', flexDirection: 'column', gap: '8px' },
  taskOption: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    padding: '10px 12px', border: '1px solid #ddd6cc', borderRadius: '3px',
    background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
  },
  taskOptionActive: { borderColor: '#1a1714', backgroundColor: '#f7f3ee' },
  taskOptionLabel: { fontSize: '13px', fontWeight: '500', color: '#1a1714' },
  taskOptionDesc: { fontSize: '12px', color: '#8a837a' },
  timeOptions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  timeOption: {
    padding: '10px', border: '1px solid #ddd6cc', borderRadius: '3px',
    background: '#fff', cursor: 'pointer', fontSize: '13px', color: '#8a837a',
    transition: 'all 0.15s',
  },
  timeOptionActive: {
    borderColor: '#1a1714', backgroundColor: '#1a1714', color: '#fff',
  },
  tagInputRow: { display: 'flex', gap: '8px', marginBottom: '12px' },
  input: {
    padding: '9px 12px', border: '1px solid #ddd6cc', borderRadius: '3px',
    fontSize: '14px', color: '#1a1714', backgroundColor: '#fff', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  },
  addBtn: {
    padding: '9px 16px', backgroundColor: '#1a1714', color: '#fff',
    border: 'none', borderRadius: '3px', fontSize: '13px', cursor: 'pointer', flexShrink: 0,
  },
  tags: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  tag: {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '4px 10px', backgroundColor: '#f0ece6', border: '1px solid #ddd6cc',
    borderRadius: '2px', fontSize: '12px', color: '#1a1714',
  },
  removeTag: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#8a837a', fontSize: '14px', padding: '0', lineHeight: 1,
  },
  emptyTags: { fontSize: '12px', color: '#8a837a', margin: 0 },
  textarea: {
    padding: '9px 12px', border: '1px solid #ddd6cc', borderRadius: '3px',
    fontSize: '14px', color: '#1a1714', backgroundColor: '#fff', outline: 'none',
    width: '100%', boxSizing: 'border-box', resize: 'vertical',
    fontFamily: 'system-ui, sans-serif',
  },
  charCount: { fontSize: '11px', color: '#8a837a', margin: '6px 0 0', textAlign: 'right' },
  aiToggleRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  aiOption: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    padding: '10px 12px', border: '1px solid #ddd6cc', borderRadius: '3px',
    background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
  },
  aiOptionActive: { borderColor: '#1a1714', backgroundColor: '#1a1714' },
  aiOptionActiveGold: { borderColor: '#c8943a', backgroundColor: '#c8943a' },
  aiOptionTitle: { fontSize: '13px', fontWeight: '500', color: '#1a1714' },
  aiOptionDesc: { fontSize: '11px', color: '#8a837a' },
  saveBtn: {
    padding: '11px', backgroundColor: '#1a1714', color: '#fff',
    border: 'none', borderRadius: '3px', fontSize: '14px',
    fontWeight: '500', cursor: 'pointer', width: '100%',
  },
}