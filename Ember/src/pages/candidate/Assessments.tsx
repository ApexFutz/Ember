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
  pending_review: { label: 'Pending review', color: '#b45309', bg: '#fef3c7' },
  reviewed: { label: 'Reviewed', color: '#1e40af', bg: '#dbeafe' },
  moved_forward: { label: 'Moved forward', color: '#2d6a4f', bg: '#d8f3dc' },
  passed: { label: 'Not selected', color: '#6b7280', bg: '#f3f4f6' },
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
  page: { maxWidth: '860px' },
  header: { marginBottom: '28px' },
  title: { fontSize: '24px', fontWeight: '500', color: '#1a1714', margin: '0 0 4px' },
  subtitle: { fontSize: '14px', color: '#8a837a', margin: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleTitle: { fontSize: '15px', fontWeight: '500', color: '#1a1714', margin: '0 0 4px' },
  date: { fontSize: '13px', color: '#8a837a', margin: 0 },
  statusBadge: {
    fontSize: '12px',
    fontWeight: '500',
    padding: '4px 12px',
    borderRadius: '2px',
  },
}