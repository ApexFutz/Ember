import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

type Availability = 'available' | 'open' | 'not_looking'

interface ProfileForm {
  full_name: string
  headline: string
  bio: string
  github_url: string
  linkedin_url: string
  portfolio_url: string
  skills: string[]
  availability: Availability
}

const availabilityOptions: { value: Availability; label: string; color: string }[] = [
  { value: 'available', label: 'Available', color: 'var(--color-success)' },
  { value: 'open', label: 'Open to offers', color: 'var(--color-warning)' },
  { value: 'not_looking', label: 'Not looking', color: 'var(--color-text-secondary)' },
]

export default function CandidateProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const [form, setForm] = useState<ProfileForm>({
    full_name: '',
    headline: '',
    bio: '',
    github_url: '',
    linkedin_url: '',
    portfolio_url: '',
    skills: [],
    availability: 'available',
  })
  const [skillInput, setSkillInput] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing profile data
  useEffect(() => {
    if (!profile) return
    setForm({
      full_name: profile.full_name ?? '',
      headline: (profile as any).headline ?? '',
      bio: (profile as any).bio ?? '',
      github_url: (profile as any).github_url ?? '',
      linkedin_url: (profile as any).linkedin_url ?? '',
      portfolio_url: (profile as any).portfolio_url ?? '',
      skills: (profile as any).skills ?? [],
      availability: (profile as any).availability ?? 'available',
    })
    if ((profile as any).photo_url) {
      setPhotoPreview((profile as any).photo_url)
    }
  }, [profile])

  function handleChange(field: keyof ProfileForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function addSkill() {
    const trimmed = skillInput.trim()
    if (!trimmed || form.skills.includes(trimmed)) return
    setForm(prev => ({ ...prev, skills: [...prev.skills, trimmed] }))
    setSkillInput('')
  }

  function removeSkill(skill: string) {
    setForm(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))
  }

  function handleSkillKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSkill()
    }
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      let photo_url = (profile as any)?.photo_url ?? null

      // Upload photo if changed
      if (photoFile) {
        const filePath = `${user.id}/avatar.jpg`
        const { error: uploadError } = await supabase.storage
          .from('profile-photos')
          .upload(filePath, photoFile, { upsert: true })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('profile-photos')
          .getPublicUrl(filePath)

        photo_url = urlData.publicUrl
      }

      // Save profile
      const { error: saveError } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name,
          headline: form.headline,
          bio: form.bio,
          github_url: form.github_url,
          linkedin_url: form.linkedin_url,
          portfolio_url: form.portfolio_url,
          skills: form.skills,
          availability: form.availability,
          photo_url,
        })
        .eq('id', user.id)

      if (saveError) throw saveError

      setSaved(true)
      await refreshProfile()
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const currentAvailability = availabilityOptions.find(
    o => o.value === form.availability
  )

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Your Profile</h1>
        <p style={styles.subtitle}>
          This is what recruiters see. Keep it sharp.
        </p>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {saved && <div style={styles.success}>Profile saved successfully.</div>}

      <div style={styles.grid}>
        {/* Left column */}
        <div style={styles.left}>

          {/* Photo upload */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Profile photo</p>
            <div style={styles.photoRow}>
              <div style={styles.photoCircle}>
                {photoPreview
                  ? <img src={photoPreview} alt="profile" style={styles.photoImg} />
                  : <span style={styles.photoInitial}>
                      {form.full_name?.charAt(0).toUpperCase() ?? '?'}
                    </span>
                }
              </div>
              <div>
                <label style={styles.uploadBtn}>
                  Choose photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoChange}
                    style={{ display: 'none' }}
                  />
                </label>
                <p style={styles.uploadHint}>JPG, PNG or WebP. Max 2MB.</p>
              </div>
            </div>
          </div>

          {/* Availability */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Availability status</p>
            <div style={styles.availRow}>
              {availabilityOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleChange('availability', opt.value)}
                  style={{
                    ...styles.availBtn,
                    ...(form.availability === opt.value
                      ? { backgroundColor: opt.color, color: 'var(--color-on-primary)', borderColor: opt.color }
                      : {}),
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={styles.availHint}>
              Currently:{' '}
              <strong style={{ color: currentAvailability?.color }}>
                {currentAvailability?.label}
              </strong>
            </p>
          </div>

          {/* Skills */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Skills</p>
            <div style={styles.skillInputRow}>
              <input
                type="text"
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={handleSkillKeyDown}
                placeholder="e.g. React, Python, SQL"
                style={styles.input}
              />
              <button onClick={addSkill} style={styles.addBtn}>Add</button>
            </div>
            <div style={styles.skillTags}>
              {form.skills.map(skill => (
                <span key={skill} style={styles.skillTag}>
                  {skill}
                  <button
                    onClick={() => removeSkill(skill)}
                    style={styles.removeSkill}
                  >
                    ×
                  </button>
                </span>
              ))}
              {form.skills.length === 0 && (
                <p style={styles.emptySkills}>No skills added yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={styles.right}>
          <div style={styles.card}>
            <p style={styles.cardLabel}>Basic info</p>

            <div style={styles.field}>
              <label style={styles.label}>Full name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => handleChange('full_name', e.target.value)}
                placeholder="Your full name"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Headline</label>
              <input
                type="text"
                value={form.headline}
                onChange={e => handleChange('headline', e.target.value)}
                placeholder="e.g. Full Stack Developer"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Bio{' '}
                <span style={styles.charCount}>
                  {form.bio.length}/280
                </span>
              </label>
              <textarea
                value={form.bio}
                onChange={e => {
                  if (e.target.value.length <= 280) {
                    handleChange('bio', e.target.value)
                  }
                }}
                placeholder="A short bio about you and what you're looking for"
                style={styles.textarea}
                rows={4}
              />
            </div>
          </div>

          <div style={styles.card}>
            <p style={styles.cardLabel}>Links</p>

            <div style={styles.field}>
              <label style={styles.label}>GitHub</label>
              <input
                type="url"
                value={form.github_url}
                onChange={e => handleChange('github_url', e.target.value)}
                placeholder="https://github.com/username"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>LinkedIn</label>
              <input
                type="url"
                value={form.linkedin_url}
                onChange={e => handleChange('linkedin_url', e.target.value)}
                placeholder="https://linkedin.com/in/username"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Portfolio</label>
              <input
                type="url"
                value={form.portfolio_url}
                onChange={e => handleChange('portfolio_url', e.target.value)}
                placeholder="https://yourportfolio.com"
                style={styles.input}
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={saving
              ? { ...styles.saveBtn, opacity: 0.6 }
              : styles.saveBtn}
          >
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '900px',
  },
  header: {
    marginBottom: '36px',
  },
  title: {
    fontSize: 'var(--text-4xl)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 8px',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  error: {
    background: 'var(--color-error-soft)',
    border: '1px solid var(--color-error-soft)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 16px',
    fontSize: '13px',
    color: 'var(--color-error-text)',
    marginBottom: '24px',
  },
  success: {
    background: 'var(--color-success-soft)',
    border: '1px solid var(--color-success-soft)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 16px',
    fontSize: '13px',
    color: 'var(--color-success-text)',
    marginBottom: '24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '300px 1fr',
    gap: '28px',
    alignItems: 'start',
  },
  left: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  right: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  card: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '24px',
    boxShadow: 'var(--shadow-md)',
  },
  cardLabel: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    margin: '0 0 20px',
  },
  photoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  photoCircle: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
    boxShadow: 'var(--shadow-md)',
  },
  photoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  photoInitial: {
    fontSize: '28px',
    fontWeight: '600',
    color: 'var(--color-on-primary)',
    fontFamily: 'var(--font-display)',
  },
  uploadBtn: {
    display: 'inline-block',
    padding: '9px 16px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    cursor: 'pointer',
    marginBottom: '8px',
    fontWeight: '500',
    transition: 'all var(--transition-fast)',
  },
  uploadHint: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  availRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '16px',
  },
  availBtn: {
    padding: '10px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    cursor: 'pointer',
    textAlign: 'left',
    fontWeight: '500',
    transition: 'all var(--transition-fast)',
  },
  availHint: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  skillInputRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '16px',
  },
  skillTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  skillTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 12px',
    backgroundColor: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border)',
    borderRadius: '999px',
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    fontWeight: '500',
  },
  removeSkill: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    fontSize: '16px',
    padding: '0',
    lineHeight: 1,
    transition: 'color var(--transition-fast)',
  },
  emptySkills: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '20px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    display: 'flex',
    justifyContent: 'space-between',
  },
  charCount: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    fontWeight: '400',
  },
  input: {
    padding: '11px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-primary)',
    transition: 'all var(--transition-fast)',
  },
  textarea: {
    padding: '11px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'var(--font-primary)',
    transition: 'all var(--transition-fast)',
  },
  addBtn: {
    padding: '10px 18px',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: 'var(--shadow-primary)',
    transition: 'all var(--transition-fast)',
  },
  saveBtn: {
    padding: '12px 16px',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
    boxShadow: 'var(--shadow-primary)',
    transition: 'all var(--transition-fast)',
  },
}