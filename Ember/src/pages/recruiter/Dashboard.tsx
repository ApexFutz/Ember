import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import EmptyState from '../../components/EmptyState.tsx'
import { RailLayout, RailCard } from '../../components/RailLayout'

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
  score: number | null
  tests_passed: number | null
  tests_total: number | null
  replay_viewed: boolean
}

interface RoleGroup {
  role_id: string
  role_title: string
  submissions: Submission[]
}

const statusOptions: { value: SubmissionStatus; label: string; color: string; bg: string }[] = [
  { value: 'pending_review', label: 'Pending review', color: '#fb923c', bg: 'rgba(249, 115, 22, 0.12)' },
  { value: 'reviewed', label: 'Reviewed', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.12)' },
  { value: 'moved_forward', label: 'Moved forward', color: '#34d399', bg: 'rgba(16, 185, 129, 0.12)' },
  { value: 'passed', label: 'Passed', color: '#9a9aa8', bg: 'rgba(154, 154, 168, 0.12)' },
]

const availabilityColors: Record<string, string> = {
  available: '#34d399',
  open: '#fb923c',
  not_looking: '#9a9aa8',
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

    // Fetch replay-viewed flags (not exposed on the view) and merge in.
    const rows = data ?? []
    const ids = rows.map((s: any) => s.id)
    const viewed = new Set<string>()
    if (ids.length > 0) {
      const { data: flags } = await supabase
        .from('submissions')
        .select('id, replay_viewed')
        .in('id', ids)
      for (const f of flags ?? []) {
        if (f.replay_viewed) viewed.add(f.id)
      }
    }
    for (const s of rows) (s as any).replay_viewed = viewed.has(s.id)

    // Group by role
    const groups: Record<string, RoleGroup> = {}
    for (const sub of rows) {
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
    // Gate: can't move a submission off "pending review" until the replay was opened.
    const current = roleGroups.flatMap(g => g.submissions).find(s => s.id === submissionId)
    if (current && current.status === 'pending_review' && status !== 'pending_review' && !current.replay_viewed) {
      return
    }
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
  async function startThread(candidateId: string, roleId: string) {
    if (!user) return

    const { data: existing } = await supabase
      .from('threads')
      .select('id')
      .eq('recruiter_id', user.id)
      .eq('candidate_id', candidateId)
      .eq('role_id', roleId)
      .maybeSingle()

    if (!existing) {
      await supabase
        .from('threads')
        .insert({
          recruiter_id: user.id,
          candidate_id: candidateId,
          role_id: roleId,
        })
    }

    navigate('/recruiter/messages')
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

  // ── Rail data (computed from already-loaded submissions) ──
  const funnel = statusOptions.map(o => ({
    ...o,
    count: allSubmissions.filter(s => s.status === o.value).length,
  }))
  const needsAttention = allSubmissions.filter(s => s.status === 'pending_review' && !s.replay_viewed)
  const topRoles = [...roleGroups]
    .sort((a, b) => b.submissions.length - a.submissions.length)
    .slice(0, 4)
  const maxFunnel = Math.max(1, ...funnel.map(f => f.count))

  const rail = totalCount > 0 ? (
    <>
      <RailCard title="Pipeline">
        <div style={styles.funnel}>
          {funnel.map(f => (
            <div key={f.value} style={styles.funnelRow}>
              <div style={styles.funnelHead}>
                <span style={styles.funnelLabel}>{f.label}</span>
                <span style={styles.funnelCount}>{f.count}</span>
              </div>
              <div style={styles.funnelTrack}>
                <div style={{ ...styles.funnelBar, width: `${(f.count / maxFunnel) * 100}%`, backgroundColor: f.color }} />
              </div>
            </div>
          ))}
        </div>
      </RailCard>

      <RailCard title="Needs your attention">
        {needsAttention.length === 0 ? (
          <p style={styles.railEmpty}>All caught up — every pending submission has been reviewed.</p>
        ) : (
          <>
            <p style={styles.railBig}>
              <span style={styles.railBigNum}>{needsAttention.length}</span> awaiting your replay
            </p>
            <div style={styles.railList}>
              {needsAttention.slice(0, 3).map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/recruiter/submissions/${s.id}/replay`)}
                  style={styles.railRowBtn}
                >
                  <span style={styles.railRowName}>{s.candidate_name ?? 'Candidate'}</span>
                  <span style={styles.railRowSub}>{s.role_title}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </RailCard>

      {topRoles.length > 0 && (
        <RailCard title="Top roles">
          <div style={styles.railList}>
            {topRoles.map(g => (
              <div key={g.role_id} style={styles.railRow}>
                <span style={styles.railRowName}>{g.role_title}</span>
                <span style={styles.railRowSub}>{g.submissions.length}</span>
              </div>
            ))}
          </div>
        </RailCard>
      )}

      <RailCard title="Quick actions">
        <div style={styles.railActions}>
          <button onClick={() => navigate('/recruiter/roles/new')} style={styles.railActionPrimary}>+ New role</button>
          <button onClick={() => navigate('/recruiter/library')} style={styles.railAction}>Assessment library</button>
        </div>
      </RailCard>
    </>
  ) : null

  return (
    <RailLayout rail={rail}>
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
        {totalCount === 0 && (
        <EmptyState
          title="No submissions yet"
          message="Once candidates complete assessments for your roles, they'll appear here ready to review."
          actionLabel="Manage your roles"
          onAction={() => navigate('/recruiter/roles')}
        />
      )}
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
                          <div style={styles.badgeRow}>
                            {/* Status badge */}
                            <span style={{
                              ...styles.statusBadge,
                              ...getStatusStyle(sub.status),
                            }}>
                              {statusOptions.find(o => o.value === sub.status)?.label}
                            </span>

                            {/* Score badge */}
                            {sub.tests_total != null && sub.tests_total > 0 && (
                              <span style={{
                                ...styles.statusBadge,
                                ...((sub.score ?? 0) >= 1
                                  ? { color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.12)' }
                                  : { color: '#fb923c', backgroundColor: 'rgba(249, 115, 22, 0.12)' }),
                              }}>
                                {sub.tests_passed}/{sub.tests_total} tests · {Math.round((sub.score ?? 0) * 100)}%
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={styles.actions}>
                            <button
                              onClick={() => navigate(`/recruiter/submissions/${sub.id}/replay`)}
                              style={styles.replayBtn}
                            >
                              Watch replay →
                            </button>
                            <button
                              onClick={() => startThread(sub.candidate_id, sub.role_id)}
                              style={styles.replayBtn}
                            >
                              Message
                            </button>

                            {(() => {
                              const locked = sub.status === 'pending_review' && !sub.replay_viewed
                              return (
                                <select
                                  value={sub.status}
                                  onChange={e => updateStatus(sub.id, e.target.value as SubmissionStatus)}
                                  disabled={updatingId === sub.id || locked}
                                  title={locked ? 'Watch the replay before changing this status' : ''}
                                  style={locked ? { ...styles.statusSelect, opacity: 0.5, cursor: 'not-allowed' } : styles.statusSelect}
                                >
                                  {statusOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              )
                            })()}
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
    </RailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '900px' },
  loading: { padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '14px' },
  header: { marginBottom: '32px' },
  title: { fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 var(--space-2)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-6)' },
  statsRow: { display: 'flex', gap: 'var(--space-4)' },
  statCard: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '110px',
    boxShadow: 'var(--shadow-md)',
  },
  statNum: { fontSize: '32px', fontWeight: '600', color: 'var(--color-primary)', fontFamily: 'var(--font-display)' },
  statLabel: { fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '500' },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '1px solid var(--color-border-light)',
    paddingBottom: '0',
  },
  tab: {
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '-1px',
    transition: 'all var(--transition-fast)',
  },
  tabActive: {
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid var(--color-primary)',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '-1px',
  },
  tabBadge: {
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '999px',
  },
  emptyTab: {
    padding: '48px',
    textAlign: 'center',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
  },
  groups: { display: 'flex', flexDirection: 'column', gap: '24px' },
  group: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-md)',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 24px',
    borderBottom: '1px solid var(--color-border-light)',
    backgroundColor: 'var(--color-bg-tertiary)',
  },
  groupTitle: { fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)', margin: 0, fontFamily: 'var(--font-display)' },
  groupCount: { fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '500' },
  submissionList: { display: 'flex', flexDirection: 'column' },
  subCard: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border-light)',
    transition: 'background var(--transition-fast)',
  },
  subTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  candidateRow: { display: 'flex', alignItems: 'center', gap: '14px' },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitial: { fontSize: '15px', fontWeight: '600', color: '#fff', fontFamily: 'var(--font-display)' },
  candidateName: { fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)', margin: '0 0 4px' },
  candidateHeadline: { fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0 },
  subRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' },
  availBadge: { fontSize: '12px', fontWeight: '600' },
  subDate: { fontSize: '12px', color: 'var(--color-text-secondary)' },
  subBottom: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  statusBadge: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 12px',
    borderRadius: '999px',
    letterSpacing: '0.02em',
  },
  actions: { display: 'flex', alignItems: 'center', gap: '10px' },
  replayBtn: {
    padding: '8px 14px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all var(--transition-fast)',
  },
  statusSelect: {
    padding: '8px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    cursor: 'pointer',
    outline: 'none',
    fontWeight: '500',
    transition: 'all var(--transition-fast)',
  },
  // Rail widgets
  funnel: { display: 'flex', flexDirection: 'column', gap: '12px' },
  funnelRow: { display: 'flex', flexDirection: 'column', gap: '5px' },
  funnelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  funnelLabel: { fontSize: '12px', color: 'var(--color-text-secondary)' },
  funnelCount: { fontSize: '12px', fontWeight: '600', color: 'var(--color-text-primary)' },
  funnelTrack: { height: '6px', borderRadius: '999px', backgroundColor: 'var(--color-bg-tertiary)', overflow: 'hidden' },
  funnelBar: { height: '100%', borderRadius: '999px', minWidth: '2px' },
  railEmpty: { fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 },
  railBig: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 12px' },
  railBigNum: { fontSize: '20px', fontWeight: '700', color: 'var(--color-primary)', fontFamily: 'var(--font-display)' },
  railList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  railRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
  railRowBtn: { display: 'flex', flexDirection: 'column', gap: '2px', background: 'none', border: 'none', padding: '6px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left', width: '100%' },
  railRowName: { fontSize: '13px', fontWeight: '500', color: 'var(--color-text-primary)' },
  railRowSub: { fontSize: '12px', color: 'var(--color-text-secondary)' },
  railActions: { display: 'flex', flexDirection: 'column', gap: '8px' },
  railActionPrimary: { padding: '9px 14px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  railAction: { padding: '9px 14px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: '500', color: 'var(--color-text-secondary)', cursor: 'pointer' },
}