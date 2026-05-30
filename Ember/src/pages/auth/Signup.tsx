import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Signup() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'recruiter' | 'candidate'>('candidate')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role }
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id)
    }

    if (role === 'recruiter') {
      navigate('/recruiter/dashboard')
    } else {
      navigate('/candidate/dashboard')
    }

    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.content}>
        <div style={styles.header}>
          <div style={styles.logo}>
            <span style={styles.logoText}>Ember</span>
            <span style={styles.logoDot}>.</span>
          </div>
          <h2 style={styles.tagline}>Recruitment made simple</h2>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h1 style={styles.title}>Create your account</h1>
            <p style={styles.subtitle}>Start your professional journey</p>
          </div>

          {error && (
            <div style={styles.error}>
              <div style={styles.errorIcon}>⚠</div>
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSignup} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>I am a</label>
              <div style={styles.toggle}>
                <button
                  type="button"
                  onClick={() => setRole('candidate')}
                  style={role === 'candidate' ? styles.toggleActive : styles.toggleInactive}
                >
                  Candidate
                </button>
                <button
                  type="button"
                  onClick={() => setRole('recruiter')}
                  style={role === 'recruiter' ? styles.toggleActive : styles.toggleInactive}
                >
                  Recruiter
                </button>
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Your full name"
                required
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                ...(loading ? styles.buttonDisabled : {}),
              }}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div style={styles.divider} />

          <p style={styles.footer}>
            Already have an account?{' '}
            <Link to="/login" style={styles.link}>
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <div style={styles.accent} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--color-bg-primary)',
    position: 'relative',
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(109, 93, 252, 0.08) 0%, transparent 70%)',
    top: '-100px',
    right: '-100px',
    pointerEvents: 'none',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  header: {
    textAlign: 'center',
    marginBottom: '48px',
  },
  logo: {
    marginBottom: '16px',
  },
  logoText: {
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.02em',
    fontFamily: 'var(--font-display)',
  },
  logoDot: {
    fontSize: '32px',
    color: 'var(--color-primary)',
    fontFamily: 'var(--font-display)',
  },
  tagline: {
    fontSize: '16px',
    color: 'var(--color-text-secondary)',
    fontWeight: '500',
    letterSpacing: '0.02em',
  },
  card: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-xl)',
    padding: '40px',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
    width: '100%',
  },
  cardHeader: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
    fontFamily: 'var(--font-display)',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  error: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#fca5a5',
    marginBottom: '24px',
  },
  errorIcon: {
    fontSize: '18px',
    flexShrink: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--color-text-primary)',
    letterSpacing: '0.01em',
  },
  input: {
    padding: '11px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    outline: 'none',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    fontFamily: 'var(--font-primary)',
    transition: 'all var(--transition-fast)',
  },
  toggle: {
    display: 'flex',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-bg-tertiary)',
  },
  toggleActive: {
    flex: 1,
    padding: '10px',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
  toggleInactive: {
    flex: 1,
    padding: '10px',
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    border: 'none',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
  button: {
    marginTop: '4px',
    padding: '12px 16px',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    boxShadow: '0 4px 12px rgba(109, 93, 252, 0.3)',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  divider: {
    height: '1px',
    background: 'var(--color-border-light)',
    margin: '24px 0',
  },
  footer: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
  },
  link: {
    color: 'var(--color-primary)',
    textDecoration: 'none',
    fontWeight: '600',
    transition: 'color var(--transition-fast)',
  },
}