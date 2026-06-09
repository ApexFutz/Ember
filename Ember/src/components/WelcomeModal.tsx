import React from 'react'

/** One-time welcome shown to founding recruiters on first login. */
export default function WelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.badge}>FOUNDING RECRUITER</div>
        <h1 style={styles.title}>Welcome to the inner circle.</h1>
        <p style={styles.lede}>
          You're one of Ember's founding recruiters — not a beta tester, a partner. You're helping shape
          how great engineers get hired.
        </p>

        <div style={styles.section}>
          <p style={styles.sectionLabel}>What you get</p>
          <ul style={styles.list}>
            <li><strong>Locked-in founding pricing</strong> — your rate never goes up.</li>
            <li><strong>A direct line to the team</strong> — your feedback ships.</li>
            <li>Early access to everything we build.</li>
          </ul>
        </div>

        <div style={styles.section}>
          <p style={styles.sectionLabel}>What we ask</p>
          <ul style={styles.list}>
            <li>Share honest feedback as you use Ember.</li>
            <li>Keep at least one active role running.</li>
          </ul>
        </div>

        <button onClick={onDismiss} style={styles.cta}>Let's go →</button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  modal: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-primary-soft-border)', borderRadius: 'var(--radius-xl)', padding: '40px', maxWidth: '520px', width: '100%', boxShadow: 'var(--shadow-xl)' },
  badge: { display: 'inline-block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-primary)', background: 'var(--color-primary-soft)', border: '1px solid var(--color-primary-soft-border)', borderRadius: '999px', padding: '5px 12px', marginBottom: '20px' },
  title: { fontSize: '30px', fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)', margin: '0 0 12px', letterSpacing: '-0.02em' },
  lede: { fontSize: '15px', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 24px' },
  section: { marginBottom: '20px' },
  sectionLabel: { fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: '0 0 8px' },
  list: { margin: 0, paddingLeft: '20px', fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.8 },
  cta: { marginTop: '8px', width: '100%', padding: '13px', background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '15px', fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--shadow-primary)' },
}
