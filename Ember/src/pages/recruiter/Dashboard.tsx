import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

type SubmissionStatus = 'pending_review' | 'reviewed' | 'moved_forward' | 'passed'

interface Submission {
  id: string
  role_id: string
  candidate_id: string
  assessment_id: string
  status: SubmissionStatus
  submitted_at: string
  recruiter_notes: string | null
  candidate_name: string | null
  candidate_headline: string | null
  candidate_photo: string | null
  availability: string | null
  role_title: string
}

interface RoleGroup {
  role_id: string
  role_title: string
  submissions: Submission[]
}

const statusOptions: { value: SubmissionStatus; label: string; color: string; bg: string }[] = [
  { value: 'pending_review', label: 'Pending review', color: '#b45309', bg: '#fef3c7' },
  { value: 'reviewed', label: 'Reviewed', color: '#1e40af', bg: '#dbeafe' },
  { value: 'moved_forward', label: 'Moved forward', color: '#2d6a4f', bg: '#d8f3dc' },
  { value: 'passed', label: 'Passed', color: '#6b7280', bg: '#f3f4f6' },
]

const availabilityColors: Record<string, string> = {
  available: '#2d6a4f',
  open: '#b45309',
  not_looking: '#6b7280',
}

const availabilityLabels: Record<string, string> = {
  available: 'Available',
  open: 'Open to offers',
  not_looking: 'Not looking',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

export default function RecruiterDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [roleGroups, setRoleGroups] = useState<RoleGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    loadSubmissions()
  }, [user])

  async function loadSubmissions() {
    const { data, error } = await supabase
      .from('submission_details')
      .select('*')
      .eq('recruiter_id', user!.id)
      .order('submitted_at', { ascending: false })

    if (error) {
      console.error('Error loading submissions:', error.message)
      setLoading(false)
      return
    }

    // Group by role
    const groups: Record<string, RoleGroup> = {}
    for (const sub of (data ?? [])) {
      if (!groups[sub.role_id]) {
        groups[sub.role_id] = {
          role_id: sub.role_id,
          role_title: sub.role_title,
          submissions: [],
        }
      }
      groups[sub.role_id].submissions.push(sub)
    }

    setRoleGroups(Object.values(groups))
    setLoading(false)
  }

  async function updateStatus(submissionId: string, status: SubmissionStatus) {
    setUpdatingId(submissionId)

    await supabase
      .from('submissions')
      .update({ status })
      .eq('id', submissionId)

    setRoleGroups(prev => prev.map(group => ({
      ...group,
      submissions: group.submissions.map(sub =>
        sub.id === submissionId ? { ...sub, status } : sub
      )
    })))

    setUpdatingId(null)
  }

  function getStatusStyle(status: SubmissionStatus) {
    const opt = statusOptions.find(o => o.value === status)
    return opt ? { color: opt.color, backgroundColor: opt.bg } : {}
  }

  const allSubmissions = roleGroups.flatMap(g => g.submissions)
  const pendingCount = allSubmissions.filter(s => s.status === 'pending_review').length
  const totalCount = allSubmissions.length

  const filteredGroups = roleGroups.map(group => ({
    ...group,
    submissions: activeTab === 'pending'
      ? group.submissions.filter(s => s.status === 'pending_review')
      : group.submissions,
  })).filter(group => group.submissions.length > 0)

  if (loading) return <div style={styles.loading}>Loading submissions...</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>
            {totalCount === 0
              ? 'No submissions yet — share your active roles to get started.'
              : `${totalCount} total submission${totalCount !== 1 ? 's' : ''} across ${roleGroups.length} role${roleGroups.length !== 1 ? 's' : ''}.`
            }
          </p>
        </div>

        {/* Stats row */}
        {totalCount > 0 && (
          <div style={styles.statsRow}>
            <div style={styles.statCard}>
              <span style={styles.statNum}>{pendingCount}</span>
              <span style={styles.statLabel}>Pending review</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statNum}>
                {allSubmissions.filter(s => s.status === 'moved_forward').length}
              </span>
              <span style={styles.statLabel}>Moved forward</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statNum}>{totalCount}</span>
              <span style={styles.statLabel}>Total</span>
            </div>
          </div>
        )}
      </div>

      {totalCount > 0 && (
        <>
          {/* Tabs */}
          <div style={styles.tabs}>
            <button
              onClick={() => setActiveTab('pending')}
              style={activeTab === 'pending' ? styles.tabActive : styles.tab}
            >
              Pending review
              {pendingCount > 0 && (
                <span style={styles.tabBadge}>{pendingCount}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('all')}
              style={activeTab === 'all' ? styles.tabActive : styles.tab}
            >
              All submissions
            </button>
          </div>

          {/* Submission groups */}
          {filteredGroups.length === 0 ? (
            <div style={styles.emptyTab}>
              No pending submissions — all caught up.
            </div>
          ) : (
            <div style={styles.groups}>
              {filteredGroups.map(group => (
                <div key={group.role_id} style={styles.group}>
                  <div style={styles.groupHeader}>
                    <h2 style={styles.groupTitle}>{group.role_title}</h2>
                    <span style={styles.groupCount}>
                      {group.submissions.length} submission{group.submissions.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div style={styles.submissionList}>
                    {group.submissions.map(sub => (
                      <div key={sub.id} style={styles.subCard}>
                        <div style={styles.subTop}>
                          {/* Candidate info */}
                          <div style={styles.candidateRow}>
                            <div style={styles.avatar}>
                              {sub.candidate_photo
                                ? <img src={sub.candidate_photo} alt="" style={styles.avatarImg} />
                                : <span style={styles.avatarInitial}>
                                    {sub.candidate_name?.charAt(0).toUpperCase() ?? '?'}
                                  </span>
                              }
                            </div>
                            <div>
                              <p style={styles.candidateName}>
                                {sub.candidate_name ?? 'Unknown candidate'}
                              </p>
                              <p style={styles.candidateHeadline}>
                                {sub.candidate_headline ?? 'No headline'}
                              </p>
                            </div>
                          </div>

                          {/* Right side */}
                          <div style={styles.subRight}>
                            {/* Availability */}
                            {sub.availability && (
                              <span style={{
                                ...styles.availBadge,
                                color: availabilityColors[sub.availability],
                              }}>
                                {availabilityLabels[sub.availability]}
                              </span>
                            )}

                            {/* Submitted date */}
                            <span style={styles.subDate}>
                              Submitted {formatDate(sub.submitted_at)}
                            </span>
                          </div>
                        </div>

                        <div style={styles.subBottom}>
                          {/* Status badge */}
                          <span style={{
                            ...styles.statusBadge,
                            ...getStatusStyle(sub.status),
                          }}>
                            {statusOptions.find(o => o.value === sub.status)?.label}
                          </span>

                          {/* Actions */}
                          <div style={styles.actions}>
                            <button
                              onClick={() => navigate(`/recruiter/submissions/${sub.id}/replay`)}
                              style={styles.replayBtn}
                            >
                              Watch replay →
                            </button>

                            <select
                              value={sub.status}
                              onChange={e => updateStatus(sub.id, e.target.value as SubmissionStatus)}
                              disabled={updatingId === sub.id}
                              style={styles.statusSelect}
                            >
                              {statusOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '860px' },
  loading: { padding: '2rem', color: '#8a837a', fontSize: '14px' },
  header: { marginBottom: '28px' },
  title: { fontSize: '24px', fontWeight: '500', color: '#1a1714', margin: '0 0 4px' },
  subtitle: { fontSize: '14px', color: '#8a837a', margin: '0 0 20px' },
  statsRow: { display: 'flex', gap: '12px' },
  statCard: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '100px',
  },
  statNum: { fontSize: '28px', fontWeight: '500', color: '#1a1714' },
  statLabel: { fontSize: '12px', color: '#8a837a' },
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    borderBottom: '1px solid #ddd6cc',
    paddingBottom: '0',
  },
  tab: {
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: '14px',
    color: '#8a837a',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '-1px',
  },
  tabActive: {
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #1a1714',
    fontSize: '14px',
    color: '#1a1714',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '-1px',
  },
  tabBadge: {
    backgroundColor: '#c8943a',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '500',
    padding: '1px 6px',
    borderRadius: '999px',
  },
  emptyTab: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '14px',
    color: '#8a837a',
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
  },
  groups: { display: 'flex', flexDirection: 'column', gap: '24px' },
  group: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #f0ece6',
    backgroundColor: '#faf8f5',
  },
  groupTitle: { fontSize: '15px', fontWeight: '500', color: '#1a1714', margin: 0 },
  groupCount: { fontSize: '12px', color: '#8a837a' },
  submissionList: { display: 'flex', flexDirection: 'column' },
  subCard: {
    padding: '16px 20px',
    borderBottom: '1px solid #f0ece6',
  },
  subTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  candidateRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#c8943a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitial: { fontSize: '14px', fontWeight: '500', color: '#fff' },
  candidateName: { fontSize: '14px', fontWeight: '500', color: '#1a1714', margin: '0 0 2px' },
  candidateHeadline: { fontSize: '12px', color: '#8a837a', margin: 0 },
  subRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' },
  availBadge: { fontSize: '12px', fontWeight: '500' },
  subDate: { fontSize: '12px', color: '#8a837a' },
  subBottom: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    fontSize: '12px',
    fontWeight: '500',
    padding: '3px 10px',
    borderRadius: '2px',
  },
  actions: { display: 'flex', alignItems: 'center', gap: '8px' },
  replayBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '12px',
    color: '#1a1714',
    cursor: 'pointer',
  },
  statusSelect: {
    padding: '6px 10px',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '12px',
    color: '#1a1714',
    backgroundColor: '#fff',
    cursor: 'pointer',
    outline: 'none',
  },
}