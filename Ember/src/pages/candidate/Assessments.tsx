import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import EmptyState from '../../components/EmptyState'
import SkeletonCard from '../../components/SkeletonCard'

type SubmissionStatus = 'pending_review' | 'reviewed' | 'moved_forward' | 'passed'

interface MyAssessment {
  id: string
  role_id: string
  status: SubmissionStatus
  submitted_at: string
  role_title: string
}

interface InProgressAssessment {
  id: string
  role_id: string
  role_title: string
  startedMs: number
  limitSeconds: number
}

function formatRemaining(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

const statusConfig: Record<SubmissionStatus, { label: string; color: string; bg: string }> = {
  pending_review: { label: 'Pending review', color: 'var(--color-warning-text)', bg: 'var(--color-warning-soft)' },
  reviewed: { label: 'Reviewed', color: 'var(--color-info-text)', bg: 'var(--color-info-soft)' },
  moved_forward: { label: 'Moved forward', color: 'var(--color-success)', bg: 'var(--color-success-soft)' },
  passed: { label: 'Not selected', color: 'var(--color-text-secondary)', bg: 'var(--color-neutral-soft)' },
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

export default function CandidateAssessments() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [assessments, setAssessments] = useState<MyAssessment[]>([])
  const [inProgress, setInProgress] = useState<InProgressAssessment[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  // Tick so the "time remaining" countdown stays live and flips to expired.
  useEffect(() => {
    if (inProgress.length === 0) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [inProgress.length])

  useEffect(() => {
    if (!user) return
    async function load() {
      const { data } = await supabase
        .from('submissions')
        .select('id, role_id, status, submitted_at, roles(title)')
        .eq('candidate_id', user!.id)
        .order('submitted_at', { ascending: false })

      if (data) {
        setAssessments(data.map((s: any) => ({
          id: s.id,
          role_id: s.role_id,
          status: s.status,
          submitted_at: s.submitted_at,
          role_title: s.roles?.title ?? 'Unknown role',
        })))
      }

      // In-progress attempts (resumable). Ruleset is joined via the role.
      const { data: ipData } = await supabase
        .from('assessments')
        .select('id, role_id, started_at, roles(title, rulesets(time_limit_seconds, time_limit_mins))')
        .eq('candidate_id', user!.id)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })

      if (ipData) {
        setInProgress(ipData.map((a: any) => {
          const rs = Array.isArray(a.roles?.rulesets) ? a.roles.rulesets[0] : a.roles?.rulesets
          const limit = rs?.time_limit_seconds ?? (rs?.time_limit_mins ?? 0) * 60
          return {
            id: a.id,
            role_id: a.role_id,
            role_title: a.roles?.title ?? 'Unknown role',
            startedMs: new Date(a.started_at).getTime(),
            limitSeconds: limit,
          }
        }))
      }
      setLoading(false)
    }
    load()
  }, [user])

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>My Assessments</h1>
        <p style={styles.subtitle}>Track the status of every assessment you've submitted.</p>
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>My Assessments</h1>
        <p style={styles.subtitle}>Track the status of every assessment you've submitted.</p>
      </div>

      {inProgress.length > 0 && (
        <div style={styles.section}>
          <p style={styles.sectionLabel}>In Progress</p>
          <div style={styles.list}>
            {inProgress.map(a => {
              const remaining = a.limitSeconds - (now - a.startedMs) / 1000
              const expired = remaining <= 0
              return (
                <div key={a.id} style={styles.card}>
                  <div>
                    <p style={styles.roleTitle}>{a.role_title}</p>
                    <p style={{ ...styles.date, ...(expired ? styles.expiredText : {}) }}>
                      {expired ? '⏱ Time expired' : `⏱ ${formatRemaining(remaining)} remaining`}
                    </p>
                  </div>
                  {expired ? (
                    <span style={styles.expiredBadge}>Time Expired</span>
                  ) : (
                    <button
                      onClick={() => navigate(`/assessment/${a.role_id}`)}
                      style={styles.continueBtn}
                    >
                      Continue →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {assessments.length === 0 && inProgress.length === 0 ? (
        <EmptyState
          title="No assessments yet"
          message="Browse open roles and complete an assessment to get started."
          actionLabel="Browse roles"
          onAction={() => navigate('/candidate/roles')}
        />
      ) : assessments.length === 0 ? null : (
        <div style={styles.section}>
          {inProgress.length > 0 && <p style={styles.sectionLabel}>Submitted</p>}
          <div style={styles.list}>
          {assessments.map(a => {
            const cfg = statusConfig[a.status]
            return (
              <div key={a.id} style={styles.card}>
                <div>
                  <p style={styles.roleTitle}>{a.role_title}</p>
                  <p style={styles.date}>Submitted {formatDate(a.submitted_at)}</p>
                </div>
                <span style={{ ...styles.statusBadge, color: cfg.color, backgroundColor: cfg.bg }}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '900px' },
  header: { marginBottom: '32px' },
  title: { fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 },
  section: { marginBottom: '28px' },
  sectionLabel: {
    fontSize: '12px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)', margin: '0 0 12px',
  },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  continueBtn: {
    padding: '8px 18px', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: '600',
    cursor: 'pointer', flexShrink: 0,
  },
  expiredBadge: {
    fontSize: '12px', fontWeight: '600', padding: '5px 12px', borderRadius: '999px',
    color: 'var(--color-error-text)', background: 'var(--color-error-soft)',
    border: '1px solid var(--color-error)', flexShrink: 0,
  },
  expiredText: { color: 'var(--color-error-text)', fontWeight: '600' },
  card: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'all var(--transition-base)',
    boxShadow: 'var(--shadow-md)',
  },
  roleTitle: { fontSize: '15px', fontWeight: '600', color: 'var(--color-text-primary)', margin: '0 0 6px' },
  date: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 },
  statusBadge: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '5px 12px',
    borderRadius: '999px',
    letterSpacing: '0.02em',
  },
}