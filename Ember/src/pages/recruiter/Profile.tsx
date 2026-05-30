import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

interface ProfileForm {
  full_name: string
  company_name: string
  job_title: string
  bio: string
  recruiter_linkedin_url: string
}

export default function RecruiterProfile() {
  const { user, profile } = useAuth()
  const [form, setForm] = useState<ProfileForm>({
    full_name: '',
    company_name: '',
    job_title: '',
    bio: '',
    recruiter_linkedin_url: '',
  })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setForm({
      full_name: profile.full_name ?? '',
      company_name: (profile as any).company_name ?? '',
      job_title: (profile as any).job_title ?? '',
      bio: (profile as any).bio ?? '',
      recruiter_linkedin_url: (profile as any).recruiter_linkedin_url ?? '',
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

  async function handleSave() {
    if (!user) return
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      let photo_url = (profile as any)?.photo_url ?? null

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

      const { error: saveError } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name,
          company_name: form.company_name,
          job_title: form.job_title,
          bio: form.bio,
          recruiter_linkedin_url: form.recruiter_linkedin_url,
          photo_url,
        })
        .eq('id', user.id)

      if (saveError) throw saveError

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Your Profile</h1>
        <p style={styles.subtitle}>
          Candidates will see this when reviewing your role postings.
        </p>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {saved && <div style={styles.success}>Profile saved successfully.</div>}

      <div style={styles.grid}>
        {/* Left column */}
        <div style={styles.left}>

          {/* Photo */}
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

          {/* Company info */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Company</p>

            <div style={styles.field}>
              <label style={styles.label}>Company name</label>
              <input
                type="text"
                value={form.company_name}
                onChange={e => handleChange('company_name', e.target.value)}
                placeholder="e.g. Acme Corp"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Your job title</label>
              <input
                type="text"
                value={form.job_title}
                onChange={e => handleChange('job_title', e.target.value)}
                placeholder="e.g. Senior Recruiter"
                style={styles.input}
              />
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
              <label style={styles.label}>
                Bio{' '}
                <span style={styles.charCount}>{form.bio.length}/280</span>
              </label>
              <textarea
                value={form.bio}
                onChange={e => {
                  if (e.target.value.length <= 280) {
                    handleChange('bio', e.target.value)
                  }
                }}
                placeholder="Tell candidates a bit about you and what you look for"
                style={styles.textarea}
                rows={4}
              />
            </div>
          </div>

          <div style={styles.card}>
            <p style={styles.cardLabel}>Links</p>

            <div style={styles.field}>
              <label style={styles.label}>LinkedIn</label>
              <input
                type="url"
                value={form.recruiter_linkedin_url}
                onChange={e => handleChange('recruiter_linkedin_url', e.target.value)}
                placeholder="https://linkedin.com/in/username"
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