import React, { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import EmptyState from '../../components/EmptyState'
import { RailLayout, RailCard } from '../../components/RailLayout'
import {
  DIFFICULTIES,
  listLibraryAssessments,
  createLibraryAssessment,
  type Difficulty,
  type LibraryAssessment,
} from '../../lib/assessmentLibrary'

const difficultyColors: Record<Difficulty, { color: string; bg: string }> = {
  Beginner: { color: '#34d399', bg: 'rgba(16, 185, 129, 0.12)' },
  Intermediate: { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
  Advanced: { color: '#fb923c', bg: 'rgba(249, 115, 22, 0.15)' },
  Expert: { color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' },
}

const emptyForm = {
  title: '',
  skill_tag: '',
  difficulty: 'Intermediate' as Difficulty,
  description: '',
  estimated_time_minutes: '',
  problem_statement: '',
  success_criteria: '',
}

export default function Library() {
  const { user } = useAuth()
  const [items, setItems] = useState<LibraryAssessment[]>([])
  const [loading, setLoading] = useState(true)
  const [skillFilter, setSkillFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await listLibraryAssessments({
        difficulty: difficultyFilter === 'all' ? undefined : (difficultyFilter as Difficulty),
        skillTag: skillFilter.trim() || undefined,
      })
      setItems(data)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [skillFilter, difficultyFilter])

  async function handleCreate() {
    if (!user || !form.title.trim() || !form.skill_tag.trim()) {
      setError('Title and skill tag are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createLibraryAssessment({
        title: form.title.trim(),
        skill_tag: form.skill_tag.trim(),
        difficulty: form.difficulty,
        description: form.description.trim() || null,
        estimated_time_minutes: form.estimated_time_minutes ? parseInt(form.estimated_time_minutes) : null,
        problem_statement: form.problem_statement.trim() || null,
        success_criteria: form.success_criteria.trim() || null,
        codebase: [],
      }, user.id)
      setForm(emptyForm)
      setShowForm(false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  function set<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const skillCounts = Object.entries(
    items.reduce<Record<string, number>>((acc, a) => {
      acc[a.skill_tag] = (acc[a.skill_tag] ?? 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const rail = items.length > 0 ? (
    <>
      <RailCard title="By difficulty">
        <div style={styles.railList}>
          {DIFFICULTIES.map(d => (
            <div key={d} style={styles.railRow}>
              <span style={{ ...styles.railDot, backgroundColor: difficultyColors[d].color }} />
              <span style={styles.railRowName}>{d}</span>
              <span style={styles.railRowNum}>{items.filter(a => a.difficulty === d).length}</span>
            </div>
          ))}
        </div>
      </RailCard>
      {skillCounts.length > 0 && (
        <RailCard title="By skill">
          <div style={styles.railList}>
            {skillCounts.map(([tag, count]) => (
              <div key={tag} style={styles.railRow}>
                <span style={styles.railRowName}>{tag}</span>
                <span style={styles.railRowNum}>{count}</span>
              </div>
            ))}
          </div>
        </RailCard>
      )}
    </>
  ) : null

  return (
    <RailLayout rail={rail}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Assessment Library</h1>
          <p style={styles.subtitle}>Reusable assessments you can bundle into any role.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={styles.newBtn}>
          {showForm ? 'Cancel' : '+ New assessment'}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {showForm && (
        <div style={styles.formCard}>
          <div style={styles.formGrid}>
            <label style={styles.field}>
              <span style={styles.label}>Title</span>
              <input value={form.title} onChange={e => set('title', e.target.value)} style={styles.input} placeholder="e.g. Debounce a function" />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>Skill tag</span>
              <input value={form.skill_tag} onChange={e => set('skill_tag', e.target.value)} style={styles.input} placeholder="e.g. JavaScript" />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>Difficulty</span>
              <select value={form.difficulty} onChange={e => set('difficulty', e.target.value as Difficulty)} style={styles.input}>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.label}>Estimated time (mins)</span>
              <input type="number" value={form.estimated_time_minutes} onChange={e => set('estimated_time_minutes', e.target.value)} style={styles.input} placeholder="e.g. 45" />
            </label>
          </div>
          <label style={styles.field}>
            <span style={styles.label}>Description</span>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} style={styles.textarea} rows={2} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Problem statement</span>
            <textarea value={form.problem_statement} onChange={e => set('problem_statement', e.target.value)} style={styles.textarea} rows={3} placeholder="What the candidate is asked to do." />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Success criteria</span>
            <textarea value={form.success_criteria} onChange={e => set('success_criteria', e.target.value)} style={styles.textarea} rows={2} placeholder="What a correct solution looks like." />
          </label>
          <button onClick={handleCreate} disabled={saving} style={saving ? { ...styles.saveBtn, opacity: 0.6 } : styles.saveBtn}>
            {saving ? 'Saving…' : 'Create assessment'}
          </button>
        </div>
      )}

      <div style={styles.filterRow}>
        <input
          value={skillFilter}
          onChange={e => setSkillFilter(e.target.value)}
          placeholder="Filter by skill tag…"
          style={styles.filterInput}
        />
        <select value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)} style={styles.select}>
          <option value="all">All difficulties</option>
          {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No assessments yet"
          message="Create your first reusable assessment to start building your library."
          actionLabel="New assessment"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div style={styles.grid}>
          {items.map(a => {
            const d = difficultyColors[a.difficulty] ?? difficultyColors.Intermediate
            return (
              <div key={a.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={styles.cardTitle}>{a.title}</span>
                  <span style={{ ...styles.diffBadge, color: d.color, backgroundColor: d.bg }}>{a.difficulty}</span>
                </div>
                <div style={styles.cardMeta}>
                  <span style={styles.skillTag}>{a.skill_tag}</span>
                  {a.estimated_time_minutes != null && (
                    <span style={styles.metaText}>{a.estimated_time_minutes} min</span>
                  )}
                </div>
                {a.description && <p style={styles.cardDesc}>{a.description}</p>}
              </div>
            )
          })}
        </div>
      )}
    </RailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '900px' },
  loading: { padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '14px' },
  headerRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' },
  title: { fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 },
  newBtn: { padding: '10px 18px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  error: { background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '13px', color: 'var(--color-error)', marginBottom: '16px' },
  formCard: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-md)', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' },
  input: { padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  textarea: { padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--font-primary)', lineHeight: 1.5 },
  saveBtn: { padding: '12px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer', alignSelf: 'flex-start', paddingLeft: '24px', paddingRight: '24px' },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '16px' },
  filterInput: { flex: 1, padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-secondary)', outline: 'none' },
  select: { padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-secondary)', cursor: 'pointer', outline: 'none', fontWeight: '500' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' },
  card: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: '10px' },
  cardTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' },
  cardTitle: { fontSize: '15px', fontWeight: '600', color: 'var(--color-text-primary)' },
  diffBadge: { fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap' },
  cardMeta: { display: 'flex', alignItems: 'center', gap: '10px' },
  skillTag: { fontSize: '12px', padding: '3px 10px', backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '999px', color: 'var(--color-text-primary)', fontWeight: '500' },
  metaText: { fontSize: '12px', color: 'var(--color-text-secondary)' },
  cardDesc: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 },
  railList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  railRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  railDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  railRowName: { flex: 1, fontSize: '13px', color: 'var(--color-text-primary)' },
  railRowNum: { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-secondary)' },
}
