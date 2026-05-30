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
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '48px',
    textAlign: 'center',
  },
  title: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#1a1714',
    margin: '0 0 8px',
  },
  message: {
    fontSize: '14px',
    color: '#8a837a',
    margin: '0 0 20px',
    lineHeight: '1.6',
  },
  action: {
    padding: '9px 20px',
    backgroundColor: '#1a1714',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
}