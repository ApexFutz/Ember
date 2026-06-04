import React from 'react'

/**
 * Two-column page layout: a readable-width main column plus a sticky right
 * "context rail" of page-specific widgets. The rail hides below 1100px via the
 * `.context-rail` media rule in index.css.
 */
export function RailLayout({ children, rail }: { children: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div style={styles.row}>
      <div style={styles.main}>{children}</div>
      {rail && (
        <aside className="context-rail" style={styles.rail}>
          {rail}
        </aside>
      )}
    </div>
  )
}

/** A styled widget card for the rail, with an uppercase label header. */
export function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.card}>
      <p style={styles.cardLabel}>{title}</p>
      {children}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '32px',
    width: '100%',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  rail: {
    width: '300px',
    flexShrink: 0,
    position: 'sticky',
    top: '32px',
    alignSelf: 'flex-start',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  card: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '18px 20px',
    boxShadow: 'var(--shadow-md)',
  },
  cardLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    margin: '0 0 14px',
  },
}
