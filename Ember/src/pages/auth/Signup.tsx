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

    // Update full_name on the auto-created profile
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
      <div style={styles.card}>
        <h1 style={styles.title}>Create your account</h1>
        <p style={styles.subtitle}>Start building your verified profile</p>

        {error && <div style={styles.error}>{error}</div>}

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
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
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
            style={loading ? { ...styles.button, opacity: 0.6 } : styles.button}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f3ee',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '500',
    marginBottom: '4px',
    color: '#1a1714',
  },
  subtitle: {
    fontSize: '14px',
    color: '#8a837a',
    marginBottom: '24px',
  },
  error: {
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: '3px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#991b1b',
    marginBottom: '16px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#1a1714',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '14px',
    outline: 'none',
    color: '#1a1714',
    backgroundColor: '#fff',
  },
  toggle: {
    display: 'flex',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  toggleActive: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#1a1714',
    color: '#fff',
    border: 'none',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  toggleInactive: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#fff',
    color: '#8a837a',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
  },
  button: {
    marginTop: '8px',
    padding: '11px',
    backgroundColor: '#1a1714',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  footer: {
    marginTop: '20px',
    fontSize: '13px',
    color: '#8a837a',
    textAlign: 'center',
  },
  link: {
    color: '#c8943a',
    textDecoration: 'none',
    fontWeight: '500',
  },
}