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
  { value: 'available', label: 'Available', color: '#2d6a4f' },
  { value: 'open', label: 'Open to offers', color: '#b45309' },
  { value: 'not_looking', label: 'Not looking', color: '#6b7280' },
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
                      ? { backgroundColor: opt.color, color: '#fff', borderColor: opt.color }
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
    maxWidth: '860px',
  },
  header: {
    marginBottom: '32px',
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
  success: {
    background: '#d8f3dc',
    border: '1px solid #a8d5b5',
    borderRadius: '3px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#2d6a4f',
    marginBottom: '20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    gap: '20px',
    alignItems: 'start',
  },
  left: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  right: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  card: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '20px',
  },
  cardLabel: {
    fontSize: '11px',
    fontWeight: '500',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#8a837a',
    margin: '0 0 16px',
  },
  photoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  photoCircle: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: '#c8943a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  photoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  photoInitial: {
    fontSize: '24px',
    fontWeight: '500',
    color: '#fff',
  },
  uploadBtn: {
    display: 'inline-block',
    padding: '7px 14px',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '13px',
    color: '#1a1714',
    cursor: 'pointer',
    marginBottom: '6px',
  },
  uploadHint: {
    fontSize: '11px',
    color: '#8a837a',
    margin: 0,
  },
  availRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  availBtn: {
    padding: '8px 12px',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '13px',
    color: '#8a837a',
    backgroundColor: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  },
  availHint: {
    fontSize: '12px',
    color: '#8a837a',
    margin: 0,
  },
  skillInputRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  skillTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  skillTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    backgroundColor: '#f0ece6',
    border: '1px solid #ddd6cc',
    borderRadius: '2px',
    fontSize: '12px',
    color: '#1a1714',
  },
  removeSkill: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#8a837a',
    fontSize: '14px',
    padding: '0',
    lineHeight: 1,
  },
  emptySkills: {
    fontSize: '12px',
    color: '#8a837a',
    margin: 0,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '16px',
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
  addBtn: {
    padding: '9px 16px',
    backgroundColor: '#1a1714',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    fontSize: '13px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  saveBtn: {
    padding: '11px',
    backgroundColor: '#1a1714',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    width: '100%',
  },
}