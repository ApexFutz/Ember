import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { toast, extractMessage } from '../../lib/toast'

interface Analytics {
  started: number
  submitted: number
  dropoff_rate: number
  avg_completion_s: number | null
  fastest_completion_s: number | null
  pct_with_paste: number
  avg_paste: number
  status: { pending_review: number; reviewed: number; moved_forward: number; passed: number }
  total_submissions: number
}

// Flag submissions completed faster than this as suspiciously quick.
const SUSPICIOUS_FAST_S = 120

const STATUS_META: { key: keyof Analytics['status']; label: string; color: string }[] = [
  { key: 'pending_review', label: 'Pending', color: 'var(--color-primary)' },
  { key: 'reviewed', label: 'Reviewed', color: 'var(--color-info-text)' },
  { key: 'moved_forward', label: 'Advanced', color: 'var(--color-success)' },
  { key: 'passed', label: 'Rejected', color: 'var(--color-text-secondary)' },
]

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  if (m < 1) return `${s}s`
  return `${m}m ${(s % 60).toString().padStart(2, '0')}s`
}

export default function RoleAnalytics() {
  const { roleId } = useParams<{ roleId: string }>()
  const navigate = useNavigate()
  const [roleTitle, setRoleTitle] = useState<string>('')
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!roleId) return
    async function load() {
      setLoading(true)
      const { data: role } = await supabase.from('roles').select('title').eq('id', roleId).maybeSingle()
      if (role) setRoleTitle(role.title)

      const { data: result, error: rpcErr } = await supabase.rpc('role_analytics', { p_role_id: roleId })
      if (rpcErr) {
        setError(rpcErr.message)
        toast.error('Could not load analytics', extractMessage(rpcErr))
      } else {
        setData(result as Analytics)
        setUpdatedAt(new Date())
      }
      setLoading(false)
    }
    load()
  }, [roleId])

  if (loading) return <div style={styles.loading}>Loading analytics…</div>

  if (error) return (
    <div style={styles.page}>
      <button onClick={() => navigate('/recruiter/roles')} style={styles.backBtn}>← Back to roles</button>
      <div style={styles.errorCard}>
        <p style={styles.errorTitle}>Couldn't load analytics</p>
        <p style={styles.errorSub}>{error}</p>
      </div>
    </div>
  )

  if (!data) return null

  const fastestFlag = data.fastest_completion_s != null && data.fastest_completion_s < SUSPICIOUS_FAST_S
  const funnelMax = Math.max(1, data.started)

  return (
    <div style={styles.page}>
      <button onClick={() => navigate('/recruiter/roles')} style={styles.backBtn}>← Back to roles</button>

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{roleTitle || 'Role'} · Analytics</h1>
          <p style={styles.subtitle}>
            {updatedAt && `Last updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
      </div>

      {data.started === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No activity yet</p>
          <p style={styles.emptySub}>
            Once candidates start this role's assessment, funnel and integrity stats will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Funnel stat cards */}
          <p style={styles.sectionLabel}>Funnel</p>
          <div style={styles.statGrid}>
            <Stat num={String(data.started)} label="Started assessment" />
            <Stat num={String(data.submitted)} label="Submitted" />
            <Stat num={`${Math.round(data.dropoff_rate * 100)}%`} label="Drop-off rate" />
            <Stat num={formatDuration(data.avg_completion_s)} label="Avg completion time" />
          </div>

          {/* Funnel stepped bar */}
          <div style={styles.funnelCard}>
            <div style={styles.funnelStep}>
              <div style={styles.funnelHead}>
                <span style={styles.funnelName}>Started</span>
                <span style={styles.funnelNum}>{data.started}</span>
              </div>
              <div style={styles.funnelTrack}>
                <div style={{ ...styles.funnelBar, width: `${(data.started / funnelMax) * 100}%`, background: 'var(--color-primary)' }} />
              </div>
            </div>
            <div style={styles.funnelStep}>
              <div style={styles.funnelHead}>
                <span style={styles.funnelName}>Submitted</span>
                <span style={styles.funnelNum}>{data.submitted}</span>
              </div>
              <div style={styles.funnelTrack}>
                <div style={{ ...styles.funnelBar, width: `${(data.submitted / funnelMax) * 100}%`, background: 'var(--color-success)' }} />
              </div>
            </div>
          </div>

          {/* Integrity signals */}
          <p style={styles.sectionLabel}>Integrity signals</p>
          <div style={styles.statGrid}>
            <Stat num={`${Math.round(data.pct_with_paste * 100)}%`} label="Submissions with a large paste" />
            <Stat num={data.avg_paste.toFixed(1)} label="Avg paste events / submission" />
            <Stat
              num={formatDuration(data.fastest_completion_s)}
              label="Fastest submission"
              flag={fastestFlag ? 'Suspiciously fast' : undefined}
            />
          </div>

          {/* Status breakdown */}
          <p style={styles.sectionLabel}>Status breakdown</p>
          <div style={styles.breakdownCard}>
            {data.total_submissions === 0 ? (
              <p style={styles.emptySub}>No submissions to review yet.</p>
            ) : (
              STATUS_META.map(s => {
                const count = data.status[s.key]
                const pct = data.total_submissions > 0 ? (count / data.total_submissions) * 100 : 0
                return (
                  <div key={s.key} style={styles.breakdownRow}>
                    <span style={styles.breakdownLabel}>{s.label}</span>
                    <div style={styles.breakdownTrack}>
                      <div style={{ ...styles.breakdownBar, width: `${pct}%`, background: s.color }} />
                    </div>
                    <span style={styles.breakdownCount}>{count}</span>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ num, label, flag }: { num: string; label: string; flag?: string }) {
  return (
    <div style={styles.statCard}>
      <span style={styles.statNum}>{num}</span>
      <span style={styles.statLabel}>{label}</span>
      {flag && <span style={styles.statFlag}>⚠ {flag}</span>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '780px' },
  loading: { padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '14px' },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-sm)', cursor: 'pointer', padding: 0, marginBottom: '16px', display: 'block',
  },
  header: { marginBottom: '28px' },
  title: { fontSize: 'var(--text-3xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 6px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 },
  sectionLabel: {
    fontSize: '12px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)', margin: '24px 0 12px',
  },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' },
  statCard: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px',
    boxShadow: 'var(--shadow-md)',
  },
  statNum: { fontSize: '30px', fontWeight: '600', color: 'var(--color-primary)', fontFamily: 'var(--font-display)', lineHeight: 1 },
  statLabel: { fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '500' },
  statFlag: { fontSize: '11px', fontWeight: '600', color: 'var(--color-error-text)', marginTop: '2px' },
  funnelCard: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '16px',
    boxShadow: 'var(--shadow-md)',
  },
  funnelStep: { display: 'flex', flexDirection: 'column', gap: '6px' },
  funnelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  funnelName: { fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '500' },
  funnelNum: { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-secondary)' },
  funnelTrack: { height: '10px', borderRadius: '999px', background: 'var(--color-bg-tertiary)', overflow: 'hidden' },
  funnelBar: { height: '100%', borderRadius: '999px', minWidth: '2px', transition: 'width var(--transition-base)' },
  breakdownCard: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
    boxShadow: 'var(--shadow-md)',
  },
  breakdownRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  breakdownLabel: { fontSize: '13px', color: 'var(--color-text-primary)', width: '80px', flexShrink: 0 },
  breakdownTrack: { flex: 1, height: '10px', borderRadius: '999px', background: 'var(--color-bg-tertiary)', overflow: 'hidden' },
  breakdownBar: { height: '100%', borderRadius: '999px', minWidth: '2px' },
  breakdownCount: { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-secondary)', width: '28px', textAlign: 'right' },
  empty: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '48px', textAlign: 'center', boxShadow: 'var(--shadow-md)',
  },
  emptyTitle: { fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)' },
  emptySub: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 },
  errorCard: {
    background: 'var(--color-error-soft)', border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-xl)', padding: '24px',
  },
  errorTitle: { fontSize: '15px', fontWeight: '600', color: 'var(--color-error-text)', margin: '0 0 6px' },
  errorSub: { fontSize: '13px', color: 'var(--color-error-text)', margin: 0 },
}
