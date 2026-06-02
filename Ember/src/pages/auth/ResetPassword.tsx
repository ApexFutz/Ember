import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // null = checking, true = recovery session present, false = invalid/expired link
  const [ready, setReady] = useState<boolean | null>(null)

  useEffect(() => {
    let settled = false
    const markReady = () => { settled = true; setReady(true) }

    // supabase-js auto-detects the recovery token in the URL and establishes a session.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) markReady()
    })

    // If no recovery session materializes shortly, the link is invalid/expired.
    const timer = setTimeout(() => { if (!settled) setReady(false) }, 2000)

    return () => { sub.subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setDone(true)
    setLoading(false)
    setTimeout(() => navigate('/login'), 2000)
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
          {ready === false ? (
            <>
              <div style={styles.cardHeader}>
                <h1 style={styles.title}>Link expired</h1>
                <p style={styles.subtitle}>This password reset link is invalid or has expired.</p>
              </div>
              <p style={styles.footer}>
                <Link to="/forgot-password" style={styles.link}>Request a new link</Link>
              </p>
            </>
          ) : done ? (
            <>
              <div style={styles.cardHeader}>
                <h1 style={styles.title}>Password updated</h1>
                <p style={styles.subtitle}>Redirecting you to sign in…</p>
              </div>
              <p style={styles.footer}>
                <Link to="/login" style={styles.link}>Sign in now</Link>
              </p>
            </>
          ) : ready === null ? (
            <div style={styles.cardHeader}>
              <h1 style={styles.title}>Reset password</h1>
              <p style={styles.subtitle}>Verifying your reset link…</p>
            </div>
          ) : (
            <>
              <div style={styles.cardHeader}>
                <h1 style={styles.title}>Set a new password</h1>
                <p style={styles.subtitle}>Choose a new password for your account.</p>
              </div>

              {error && (
                <div style={styles.error}>
                  <div style={styles.errorIcon}>⚠</div>
                  <div>{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.field}>
                  <label style={styles.label}>New password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={styles.input} />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Confirm password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required style={styles.input} />
                </div>

                <button type="submit" disabled={loading} style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}>
                  {loading ? 'Updating...' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <div style={styles.accent} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-primary)', position: 'relative', overflow: 'hidden' },
  accent: { position: 'absolute', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(249, 115, 22, 0.1) 0%, transparent 70%)', top: '-100px', right: '-100px', pointerEvents: 'none' },
  content: { position: 'relative', zIndex: 1, width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { textAlign: 'center', marginBottom: '48px' },
  logo: { marginBottom: '16px' },
  logoText: { fontSize: '32px', fontWeight: '700', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' },
  logoDot: { fontSize: '32px', color: 'var(--color-primary)', fontFamily: 'var(--font-display)' },
  tagline: { fontSize: '16px', color: 'var(--color-text-secondary)', fontWeight: '500', letterSpacing: '0.02em' },
  card: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-xl)', padding: '40px', backdropFilter: 'blur(10px)', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)', width: '100%' },
  cardHeader: { marginBottom: '32px' },
  title: { fontSize: '28px', fontWeight: '600', color: 'var(--color-text-primary)', marginBottom: '8px', fontFamily: 'var(--font-display)' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.6 },
  error: { display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', padding: '12px 16px', fontSize: '14px', color: '#fca5a5', marginBottom: '24px' },
  errorIcon: { fontSize: '18px', flexShrink: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  field: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '500', color: 'var(--color-text-primary)', letterSpacing: '0.01em' },
  input: { padding: '11px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '14px', outline: 'none', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)', fontFamily: 'var(--font-primary)', transition: 'all var(--transition-fast)' },
  button: { marginTop: '4px', padding: '12px 16px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all var(--transition-fast)', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)' },
  buttonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  footer: { fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center' },
  link: { color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '600', transition: 'color var(--transition-fast)' },
}
