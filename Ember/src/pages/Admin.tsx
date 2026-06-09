import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  isAdmin, adminListFounders, adminListInviteCodes,
  type FounderRow, type InviteCodeRow,
} from '../lib/founding'

export default function Admin() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [founders, setFounders] = useState<FounderRow[]>([])
  const [codes, setCodes] = useState<InviteCodeRow[]>([])

  useEffect(() => {
    async function load() {
      const ok = await isAdmin()
      setAllowed(ok)
      if (ok) {
        const [f, c] = await Promise.all([adminListFounders(), adminListInviteCodes()])
        setFounders(f)
        setCodes(c)
      }
    }
    load()
  }, [])

  if (allowed === null) return <div style={styles.centered}>Loading…</div>

  if (!allowed) return (
    <div style={styles.centered}>
      <div style={styles.notAuth}>
        <h1 style={styles.naTitle}>Not authorized</h1>
        <p style={styles.naSub}>This area is restricted.</p>
        <Link to="/" style={styles.link}>← Back</Link>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      <div style={styles.inner}>
        <h1 style={styles.title}>Admin</h1>
        <p style={styles.subtitle}>Founding recruiter program overview.</p>

        <div style={styles.card}>
          <p style={styles.cardLabel}>Founding recruiters ({founders.length})</p>
          {founders.length === 0 ? (
            <p style={styles.empty}>None yet.</p>
          ) : (
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Name</th><th style={styles.th}>Joined</th></tr></thead>
              <tbody>
                {founders.map(f => (
                  <tr key={f.id}>
                    <td style={styles.td}>{f.full_name ?? '—'}</td>
                    <td style={styles.td}>{new Date(f.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={styles.card}>
          <p style={styles.cardLabel}>Invite codes ({codes.length})</p>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Code</th><th style={styles.th}>Uses</th><th style={styles.th}>Last used</th></tr></thead>
            <tbody>
              {codes.map(c => (
                <tr key={c.code}>
                  <td style={{ ...styles.td, fontFamily: 'var(--font-mono)' }}>{c.code}</td>
                  <td style={styles.td}>{c.uses}/{c.max_uses}</td>
                  <td style={styles.td}>{c.used_at ? new Date(c.used_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-primary)', padding: '48px 24px' },
  inner: { maxWidth: '720px', margin: '0 auto' },
  centered: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-primary)' },
  notAuth: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '48px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' },
  naTitle: { fontSize: '22px', fontWeight: 600, margin: '0 0 8px', fontFamily: 'var(--font-display)' },
  naSub: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: '0 0 20px' },
  link: { color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 },
  title: { fontSize: '28px', fontWeight: 600, margin: '0 0 8px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: '0 0 28px' },
  card: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '24px', boxShadow: 'var(--shadow-md)', marginBottom: '20px' },
  cardLabel: { fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: '0 0 16px' },
  empty: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '8px 10px', color: 'var(--color-text-tertiary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--color-border)' },
  td: { padding: '10px', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border-light)' },
}
