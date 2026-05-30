import React from 'react'

interface EmptyStateProps {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div style={styles.wrapper}>
      <p style={styles.title}>{title}</p>
      <p style={styles.message}>{message}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} style={styles.action}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-xl)',
    padding: '60px 48px',
    textAlign: 'center',
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    margin: '0 0 12px',
  },
  message: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    margin: '0 0 28px',
    lineHeight: '1.6',
  },
  action: {
    padding: '11px 24px',
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
}