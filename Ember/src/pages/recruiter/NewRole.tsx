import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

type LocationType = 'remote' | 'hybrid' | 'onsite'

export default function NewRole() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '',
    department: '',
    location: 'remote' as LocationType,
    description: '',
    salary_min: '',
    salary_max: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(status: 'draft' | 'active') {
    if (!user) return
    if (!form.title.trim()) {
      setError('Role title is required')
      return
    }

    setSaving(true)
    setError(null)

    const { data, error: saveError } = await supabase
      .from('roles')
      .insert({
        recruiter_id: user.id,
        title: form.title,
        department: form.department || null,
        location: form.location,
        description: form.description || null,
        salary_min: form.salary_min ? parseInt(form.salary_min) : null,
        salary_max: form.salary_max ? parseInt(form.salary_max) : null,
        status,
      })
      .select()
      .single()

    if (saveError) {
      setError(saveError.message)
      setSaving(false)
      return
    }

    // Navigate to ruleset builder for this role
    navigate(`/recruiter/roles/${data.id}/ruleset`)
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button
          onClick={() => navigate('/recruiter/roles')}
          style={styles.backBtn}
        >
          ← Back to roles
        </button>
        <div style={styles.stepBadge}>Step 1 of 2 · Role basics</div>
        <h1 style={styles.title}>New role</h1>
        <p style={styles.subtitle}>
          Start with the basics. You'll define the assessment ruleset next.
        </p>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <div style={styles.field}>
          <label style={styles.label}>Role title *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => handleChange('title', e.target.value)}
            placeholder="e.g. Frontend Engineer"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Department</label>
          <input
            type="text"
            value={form.department}
            onChange={e => handleChange('department', e.target.value)}
            placeholder="e.g. Engineering"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Location</label>
          <div style={styles.locationRow}>
            {(['remote', 'hybrid', 'onsite'] as LocationType[]).map(loc => (
              <button
                key={loc}
                onClick={() => handleChange('location', loc)}
                style={{
                  ...styles.locationBtn,
                  ...(form.location === loc
                    ? styles.locationBtnActive
                    : {}),
                }}
              >
                {loc.charAt(0).toUpperCase() + loc.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Compensation range (annual, USD)</label>
          <div style={styles.salaryRow}>
            <div style={styles.salaryInputWrap}>
              <span style={styles.salaryPrefix}>$</span>
              <input
                type="number"
                value={form.salary_min}
                onChange={e => handleChange('salary_min', e.target.value)}
                placeholder="Min"
                style={styles.salaryInput}
              />
            </div>
            <span style={styles.salaryDash}>–</span>
            <div style={styles.salaryInputWrap}>
              <span style={styles.salaryPrefix}>$</span>
              <input
                type="number"
                value={form.salary_max}
                onChange={e => handleChange('salary_max', e.target.value)}
                placeholder="Max"
                style={styles.salaryInput}
              />
            </div>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>
            Description{' '}
            <span style={styles.charCount}>
              {form.description.length}/500
            </span>
          </label>
          <textarea
            value={form.description}
            onChange={e => {
              if (e.target.value.length <= 500) {
                handleChange('description', e.target.value)
              }
            }}
            placeholder="A short description of the role and what you're looking for"
            style={styles.textarea}
            rows={5}
          />
        </div>
      </div>

      <div style={styles.actions}>
        <button
          onClick={() => handleSave('draft')}
          disabled={saving}
          style={saving
            ? { ...styles.draftBtn, opacity: 0.6 }
            : styles.draftBtn}
        >
          Save as draft
        </button>
        <button
          onClick={() => handleSave('active')}
          disabled={saving}
          style={saving
            ? { ...styles.activeBtn, opacity: 0.6 }
            : styles.activeBtn}
        >
          {saving ? 'Saving...' : 'Save & build ruleset →'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '620px',
  },
  header: {
    marginBottom: 'var(--space-8)',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    padding: '0',
    marginBottom: 'var(--space-4)',
    display: 'block',
  },
  stepBadge: {
    display: 'inline-block',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-primary)',
    marginBottom: 'var(--space-3)',
  },
  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 var(--space-2)',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-secondary)',
    margin: 0,
    lineHeight: 1.5,
  },
  error: {
    background: 'var(--color-error-soft)',
    border: '1px solid var(--color-error-soft)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 14px',
    fontSize: '13px',
    color: 'var(--color-error)',
    marginBottom: '20px',
  },
  card: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--space-8)',
    marginBottom: 'var(--space-5)',
    boxShadow: 'var(--shadow-md)',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-6)',
  },
  label: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    color: 'var(--color-text-primary)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    fontWeight: '400',
  },
  input: {
    padding: '10px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '10px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'var(--font-primary)',
    lineHeight: 1.6,
  },
  locationRow: {
    display: 'flex',
    gap: '8px',
  },
  locationBtn: {
    flex: 1,
    padding: '10px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    cursor: 'pointer',
  },
  locationBtnActive: {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    borderColor: 'var(--color-primary)',
    boxShadow: 'var(--shadow-primary)',
  },
  salaryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  salaryInputWrap: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    alignItems: 'center',
  },
  salaryPrefix: {
    position: 'absolute',
    left: '12px',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    pointerEvents: 'none',
  },
  salaryInput: {
    padding: '10px 14px 10px 26px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  salaryDash: {
    color: 'var(--color-text-secondary)',
    fontSize: '14px',
  },
  actions: {
    display: 'flex',
    gap: 'var(--space-3)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  draftBtn: {
    padding: '11px 22px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  activeBtn: {
    padding: '11px 22px',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
  },
}