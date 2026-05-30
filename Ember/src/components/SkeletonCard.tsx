import React from 'react'

export default function SkeletonCard() {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.line, width: '40%' }} />
      <div style={{ ...styles.line, width: '70%' }} />
      <div style={{ ...styles.line, width: '55%' }} />
      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '24px',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
    line: {
    height: '12px',
    backgroundColor: '#ddd6cc',
    borderRadius: '3px',
    animation: 'shimmer 1.5s ease-in-out infinite',
  },
}