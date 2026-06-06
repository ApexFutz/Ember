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
  const [loading, setLoading] = useState(true)

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

      {assessments.length === 0 ? (
        <EmptyState
          title="No assessments yet"
          message="Browse open roles and complete an assessment to get started."
          actionLabel="Browse roles"
          onAction={() => navigate('/candidate/roles')}
        />
      ) : (
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
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '900px' },
  header: { marginBottom: '32px' },
  title: { fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
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