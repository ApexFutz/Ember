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
    maxWidth: '600px',
  },
  header: {
    marginBottom: '28px',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#8a837a',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '0',
    marginBottom: '16px',
    display: 'block',
  },
  title: {
    fontSize: '24px',
    fontWeight: '500',
    color: '#1a1714',
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#8a837a',
    margin: 0,
  },
  error: {
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: '3px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#991b1b',
    marginBottom: '20px',
  },
  card: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '24px',
    marginBottom: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '20px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#1a1714',
    display: 'flex',
    justifyContent: 'space-between',
  },
  charCount: {
    fontSize: '11px',
    color: '#8a837a',
    fontWeight: '400',
  },
  input: {
    padding: '9px 12px',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '14px',
    color: '#1a1714',
    backgroundColor: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '9px 12px',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '14px',
    color: '#1a1714',
    backgroundColor: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'system-ui, sans-serif',
  },
  locationRow: {
    display: 'flex',
    gap: '8px',
  },
  locationBtn: {
    flex: 1,
    padding: '9px',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '13px',
    color: '#8a837a',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  locationBtnActive: {
    backgroundColor: '#1a1714',
    color: '#fff',
    borderColor: '#1a1714',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  draftBtn: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '13px',
    color: '#4a453f',
    cursor: 'pointer',
  },
  activeBtn: {
    padding: '10px 20px',
    backgroundColor: '#1a1714',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
}