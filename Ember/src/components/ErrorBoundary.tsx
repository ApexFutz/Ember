import React from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
  info: React.ErrorInfo | null
}

const isDev = import.meta.env.DEV

// Top-level error boundary. Catches render/lifecycle exceptions anywhere in the
// React tree and shows a recoverable fallback instead of a blank white screen.
// Note: this does NOT catch errors in event handlers or async callbacks — those
// surface through the toast system (see lib/toast.ts).
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info })
    console.error('Uncaught error in React tree:', error, info)
    // Best-effort production monitoring. Failures here must never throw.
    if (!isDev) {
      void this.report(error, info)
    }
  }

  async report(error: Error, info: React.ErrorInfo) {
    try {
      const { data } = await supabase.auth.getUser()
      await supabase.from('client_errors').insert({
        user_id: data.user?.id ?? null,
        message: error.message,
        stack: error.stack ?? null,
        component_stack: info.componentStack ?? null,
        url: window.location.href,
      })
    } catch {
      /* monitoring is best-effort — swallow */
    }
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    // A short, copyable code so users can reference an error in a demo/support.
    const code = `${error.name}: ${error.message}`.slice(0, 120)

    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠</div>
          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.body}>
            An unexpected error occurred. You can reload the page to try again.
          </p>
          <code style={styles.code}>{code}</code>
          <button style={styles.button} onClick={() => window.location.reload()}>
            Reload
          </button>
          {isDev && (
            <pre style={styles.stack}>
              {error.stack}
              {info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ''}
            </pre>
          )}
        </div>
      </div>
    )
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'var(--color-bg-primary, #14110e)',
  },
  card: {
    maxWidth: '560px',
    width: '100%',
    background: 'var(--color-bg-secondary, #1e1916)',
    border: '1px solid var(--color-border, #2e2820)',
    borderRadius: 'var(--radius-xl, 16px)',
    padding: '40px',
    textAlign: 'center',
    boxShadow: 'var(--shadow-md)',
  },
  icon: { fontSize: '40px', marginBottom: '12px' },
  title: {
    fontSize: '22px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #f2ede6)',
    margin: '0 0 10px',
    fontFamily: 'var(--font-display, sans-serif)',
  },
  body: {
    fontSize: '14px',
    color: 'var(--color-text-secondary, #a8a097)',
    margin: '0 0 20px',
    lineHeight: 1.6,
  },
  code: {
    display: 'block',
    fontSize: '12px',
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--color-error-text, #f87171)',
    background: 'var(--color-error-soft, rgba(239,68,68,0.12))',
    border: '1px solid var(--color-error-soft, rgba(239,68,68,0.12))',
    borderRadius: 'var(--radius-md, 8px)',
    padding: '10px 12px',
    margin: '0 0 24px',
    wordBreak: 'break-word',
  },
  button: {
    padding: '11px 24px',
    backgroundColor: 'var(--color-primary, #f97316)',
    color: 'var(--color-on-primary, #fff)',
    border: 'none',
    borderRadius: 'var(--radius-md, 8px)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  stack: {
    marginTop: '24px',
    textAlign: 'left',
    fontSize: '11px',
    lineHeight: 1.5,
    color: 'var(--color-text-tertiary, #6b6359)',
    background: 'var(--color-bg-tertiary, #14110e)',
    border: '1px solid var(--color-border, #2e2820)',
    borderRadius: 'var(--radius-md, 8px)',
    padding: '14px',
    overflow: 'auto',
    maxHeight: '280px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
}
