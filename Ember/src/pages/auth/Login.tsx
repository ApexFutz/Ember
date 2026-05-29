import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Fetch profile to get role and redirect accordingly
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profile?.role === 'recruiter') {
      navigate('/recruiter/dashboard')
    } else {
      navigate('/candidate/dashboard')
    }

    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Welcome back</h1>
        <p style={styles.subtitle}>Sign in to your account</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleLogin} style={styles.form}>
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
              placeholder="••••••••"
              required
              style={styles.input}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={loading ? { ...styles.button, opacity: 0.6 } : styles.button}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={styles.footer}>
          Don't have an account?{' '}
          <Link to="/signup" style={styles.link}>Sign up</Link>
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