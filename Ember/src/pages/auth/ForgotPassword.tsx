import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { toast, extractMessage } from '../../lib/toast'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    // Don't reveal whether the email exists — show success either way.
    if (error && error.status && error.status >= 500) {
      setError(error.message)
      toast.error('Could not send reset email', extractMessage(error))
      setLoading(false)
      return
    }

    setSent(true)
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
          {sent ? (
            <>
              <div style={styles.cardHeader}>
                <h1 style={styles.title}>Check your email</h1>
                <p style={styles.subtitle}>
                  If an account exists for <strong>{email}</strong>, we've sent a link to reset your password.
                </p>
              </div>
              <p style={styles.footer}>
                <Link to="/login" style={styles.link}>Back to sign in</Link>
              </p>
            </>
          ) : (
            <>
              <div style={styles.cardHeader}>
                <h1 style={styles.title}>Reset password</h1>
                <p style={styles.subtitle}>Enter your email and we'll send you a reset link.</p>
              </div>

              {error && (
                <div style={styles.error}>
                  <div style={styles.errorIcon}>⚠</div>
                  <div>{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} style={styles.form}>
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

                <button
                  type="submit"
                  disabled={loading}
                  style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>

              <div style={styles.divider} />

              <p style={styles.footer}>
                Remembered it?{' '}
                <Link to="/login" style={styles.link}>Back to sign in</Link>
              </p>
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
  accent: { position: 'absolute', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, var(--color-primary-soft) 0%, transparent 70%)', top: '-100px', right: '-100px', pointerEvents: 'none' },
  content: { position: 'relative', zIndex: 1, width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { textAlign: 'center', marginBottom: '48px' },
  logo: { marginBottom: '16px' },
  logoText: { fontSize: '32px', fontWeight: '700', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' },
  logoDot: { fontSize: '32px', color: 'var(--color-primary)', fontFamily: 'var(--font-display)' },
  tagline: { fontSize: '16px', color: 'var(--color-text-secondary)', fontWeight: '500', letterSpacing: '0.02em' },
  card: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-xl)', padding: '40px', backdropFilter: 'blur(10px)', boxShadow: 'var(--shadow-xl)', width: '100%' },
  cardHeader: { marginBottom: '32px' },
  title: { fontSize: '28px', fontWeight: '600', color: 'var(--color-text-primary)', marginBottom: '8px', fontFamily: 'var(--font-display)' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.6 },
  error: { display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'var(--color-error-soft)', border: '1px solid var(--color-error-soft)', borderRadius: 'var(--radius-md)', padding: '12px 16px', fontSize: '14px', color: 'var(--color-error-text)', marginBottom: '24px' },
  errorIcon: { fontSize: '18px', flexShrink: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  field: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '500', color: 'var(--color-text-primary)', letterSpacing: '0.01em' },
  input: { padding: '11px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '14px', outline: 'none', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)', fontFamily: 'var(--font-primary)', transition: 'all var(--transition-fast)' },
  button: { marginTop: '4px', padding: '12px 16px', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all var(--transition-fast)', boxShadow: 'var(--shadow-primary)' },
  buttonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  divider: { height: '1px', background: 'var(--color-border-light)', margin: '24px 0' },
  footer: { fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center' },
  link: { color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '600', transition: 'color var(--transition-fast)' },
}
