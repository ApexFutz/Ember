import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// Self-contained email-notification opt-in/out. Writes profiles.email_notifications
// directly (independent of the surrounding profile form) and refreshes auth state.
export default function NotificationToggle() {
  const { user, profile, refreshProfile } = useAuth()
  const enabled = profile?.email_notifications !== false
  const [saving, setSaving] = useState(false)

  async function toggle() {
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({ email_notifications: !enabled }).eq('id', user.id)
    await refreshProfile()
    setSaving(false)
  }

  return (
    <div style={styles.card}>
      <div>
        <p style={styles.title}>Email notifications</p>
        <p style={styles.sub}>
          Get notified about new submissions, status changes, and messages.
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        aria-pressed={enabled}
        style={{ ...styles.switch, ...(enabled ? styles.switchOn : styles.switchOff) }}
      >
        <span style={{ ...styles.knob, ...(enabled ? styles.knobOn : styles.knobOff) }} />
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px 24px', boxShadow: 'var(--shadow-md)',
    marginBottom: '20px',
  },
  title: { fontSize: '15px', fontWeight: '600', color: 'var(--color-text-primary)', margin: '0 0 4px' },
  sub: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 },
  switch: {
    position: 'relative', width: '44px', height: '24px', borderRadius: '999px',
    border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background var(--transition-fast)',
  },
  switchOn: { background: 'var(--color-primary)' },
  switchOff: { background: 'var(--color-border)' },
  knob: {
    position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%',
    background: '#fff', transition: 'left var(--transition-fast)',
  },
  knobOn: { left: '22px' },
  knobOff: { left: '2px' },
}
