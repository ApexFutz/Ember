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
  duration_s: number | null
  paste_count: number | null
}

// Recruiter-facing status filters (maps the DB statuses to demo-friendly labels).
type StatusFilter = 'all' | SubmissionStatus
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'moved_forward', label: 'Advanced' },
  { key: 'passed', label: 'Rejected' },
]

type SortKey = 'submitted_at' | 'candidate_name' | 'duration' | 'paste_count'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'submitted_at', label: 'Submitted' },
  { key: 'candidate_name', label: 'Candidate' },
  { key: 'duration', label: 'Completion time' },
  { key: 'paste_count', label: 'Paste events' },
]

// Above this count we'd switch to server-side pagination (see loadSubmissionsPage).
const CLIENT_SORT_LIMIT = 200

interface DashboardFilters {
  status: StatusFilter
  role: string // role_id or 'all'
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
}
const FILTERS_KEY = 'ember.dashboard.filters'
const DEFAULT_FILTERS: DashboardFilters = {
  status: 'all', role: 'all', sortKey: 'submitted_at', sortDir: 'desc',
}

function loadFilters(): DashboardFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY)
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_FILTERS
}

interface RoleGroup {
  role_id: string
  role_title: string
  submissions: Submission[]
}

const statusOptions: { value: SubmissionStatus; label: string; color: string; bg: string }[] = [
  { value: 'pending_review', label: 'Pending review', color: 'var(--color-primary-light)', bg: 'var(--color-primary-soft)' },
  { value: 'reviewed', label: 'Reviewed', color: 'var(--color-info-text)', bg: 'var(--color-info-soft)' },
  { value: 'moved_forward', label: 'Moved forward', color: 'var(--color-success-text)', bg: 'var(--color-success-soft)' },
  { value: 'passed', label: 'Passed', color: 'var(--color-text-secondary)', bg: 'var(--color-neutral-soft)' },
]

const availabilityColors: Record<string, string> = {
  available: 'var(--color-success-text)',
  open: 'var(--color-primary-light)',
  not_looking: 'var(--color-text-secondary)',
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
  const [filters, setFilters] = useState<DashboardFilters>(loadFilters)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    loadSubmissions()
  }, [user])

  // Persist filters for the session so they survive navigating away and back.
  useEffect(() => {
    try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters)) } catch { /* ignore */ }
  }, [filters])

  function patchFilters(patch: Partial<DashboardFilters>) {
    setFilters(prev => ({ ...prev, ...patch }))
  }

  // Clicking a sort header toggles direction if it's already active.
  function toggleSort(key: SortKey) {
    setFilters(prev => prev.sortKey === key
      ? { ...prev, sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc' }
      : { ...prev, sortKey: key, sortDir: key === 'candidate_name' ? 'asc' : 'desc' })
  }

  // Server-side pagination stub — wired in once a recruiter exceeds
  // CLIENT_SORT_LIMIT submissions. Until then everything is sorted client-side.
  // async function loadSubmissionsPage(page: number, pageSize = 50) {
  //   const from = page * pageSize
  //   return supabase.from('submission_details').select('*')
  //     .eq('recruiter_id', user!.id)
  //     .order('submitted_at', { ascending: false })
  //     .range(from, from + pageSize - 1)
  // }

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

    // Fetch replay-viewed flags + metrics (not exposed on the view) and merge in.
    const rows = data ?? []
    const ids = rows.map((s: any) => s.id)
    const viewed = new Set<string>()
    const metricsById = new Map<string, any>()
    if (ids.length > 0) {
      const { data: flags } = await supabase
        .from('submissions')
        .select('id, replay_viewed, metrics')
        .in('id', ids)
      for (const f of flags ?? []) {
        if (f.replay_viewed) viewed.add(f.id)
        metricsById.set(f.id, f.metrics)
      }
    }
    for (const s of rows) {
      (s as any).replay_viewed = viewed.has(s.id)
      const m = metricsById.get(s.id)
      ;(s as any).duration_s = m?.duration_s ?? null
      ;(s as any).paste_count = m?.paste_count ?? null
    }

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

  // Roles available in the Role dropdown (only roles that have submissions).
  const roleOptions = roleGroups.map(g => ({ id: g.role_id, title: g.role_title }))

  // Apply role filter first; status-tab counts reflect the chosen role.
  const roleScoped = filters.role === 'all'
    ? allSubmissions
    : allSubmissions.filter(s => s.role_id === filters.role)

  const statusCounts: Record<StatusFilter, number> = {
    all: roleScoped.length,
    pending_review: roleScoped.filter(s => s.status === 'pending_review').length,
    reviewed: roleScoped.filter(s => s.status === 'reviewed').length,
    moved_forward: roleScoped.filter(s => s.status === 'moved_forward').length,
    passed: roleScoped.filter(s => s.status === 'passed').length,
  }

  const statusScoped = filters.status === 'all'
    ? roleScoped
    : roleScoped.filter(s => s.status === filters.status)

  // Client-side sort while under the limit; beyond it, loadSubmissionsPage would
  // hand sorting/pagination to the server (stub above).
  const clientSide = totalCount <= CLIENT_SORT_LIMIT
  const dir = filters.sortDir === 'asc' ? 1 : -1
  const visibleSubmissions = (clientSide ? [...statusScoped] : statusScoped).sort((a, b) => {
    if (!clientSide) return 0
    switch (filters.sortKey) {
      case 'candidate_name':
        return dir * (a.candidate_name ?? '').localeCompare(b.candidate_name ?? '')
      case 'duration':
        return dir * ((a.duration_s ?? Infinity) - (b.duration_s ?? Infinity))
      case 'paste_count':
        return dir * ((a.paste_count ?? 0) - (b.paste_count ?? 0))
      default: // submitted_at
        return dir * (new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
    }
  })

  const filtersActive = filters.status !== 'all' || filters.role !== 'all'

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
          {/* Status filter bar + role dropdown */}
          <div style={styles.filterBar}>
            <div style={styles.tabs}>
              {STATUS_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => patchFilters({ status: f.key })}
                  style={filters.status === f.key ? styles.tabActive : styles.tab}
                >
                  {f.label}
                  <span style={filters.status === f.key ? styles.tabBadge : styles.tabBadgeMuted}>
                    {statusCounts[f.key]}
                  </span>
                </button>
              ))}
            </div>

            <select
              value={filters.role}
              onChange={e => patchFilters({ role: e.target.value })}
              style={styles.roleSelect}
            >
              <option value="all">All roles</option>
              {roleOptions.map(r => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </div>

          {/* Sort headers */}
          <div style={styles.sortBar}>
            <span style={styles.sortLabel}>Sort by</span>
            {SORT_OPTIONS.map(o => {
              const active = filters.sortKey === o.key
              return (
                <button
                  key={o.key}
                  onClick={() => toggleSort(o.key)}
                  style={active ? { ...styles.sortBtn, ...styles.sortBtnActive } : styles.sortBtn}
                >
                  {o.label}
                  <span style={styles.sortArrow}>{active ? (filters.sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </button>
              )
            })}
          </div>

          {/* Results */}
          {visibleSubmissions.length === 0 ? (
            <div style={styles.emptyTab}>
              <p style={styles.noResultsTitle}>No results</p>
              <p style={styles.noResultsSub}>No submissions match the current filters.</p>
              {filtersActive && (
                <button
                  onClick={() => patchFilters({ status: 'all', role: 'all' })}
                  style={styles.clearLink}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div style={styles.listCard}>
              {visibleSubmissions.map(sub => (
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
                          {sub.role_title} · {sub.candidate_headline ?? 'No headline'}
                        </p>
                      </div>
                    </div>

                    {/* Right side */}
                    <div style={styles.subRight}>
                      {sub.availability && (
                        <span style={{
                          ...styles.availBadge,
                          color: availabilityColors[sub.availability],
                        }}>
                          {availabilityLabels[sub.availability]}
                        </span>
                      )}
                      <span style={styles.subDate}>
                        Submitted {formatDate(sub.submitted_at)}
                      </span>
                    </div>
                  </div>

                  <div style={styles.subBottom}>
                    <div style={styles.badgeRow}>
                      <span style={{ ...styles.statusBadge, ...getStatusStyle(sub.status) }}>
                        {statusOptions.find(o => o.value === sub.status)?.label}
                      </span>

                      {sub.tests_total != null && sub.tests_total > 0 && (
                        <span style={{
                          ...styles.statusBadge,
                          ...((sub.score ?? 0) >= 1
                            ? { color: 'var(--color-success-text)', backgroundColor: 'var(--color-success-soft)' }
                            : { color: 'var(--color-primary-light)', backgroundColor: 'var(--color-primary-soft)' }),
                        }}>
                          {sub.tests_passed}/{sub.tests_total} tests · {Math.round((sub.score ?? 0) * 100)}%
                        </span>
                      )}

                      {sub.duration_s != null && (
                        <span style={styles.metaChip}>⏱ {Math.round(sub.duration_s / 60)}m</span>
                      )}
                      {sub.paste_count != null && sub.paste_count > 0 && (
                        <span style={{ ...styles.metaChip, ...styles.metaChipFlag }}>
                          📋 {sub.paste_count} paste{sub.paste_count !== 1 ? 's' : ''}
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
  filterBar: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '16px',
    borderBottom: '1px solid var(--color-border-light)',
    flexWrap: 'wrap',
  },
  roleSelect: {
    padding: '8px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    cursor: 'pointer',
    outline: 'none',
    fontWeight: '500',
    marginBottom: '8px',
    maxWidth: '220px',
  },
  sortBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  sortLabel: { fontSize: '12px', color: 'var(--color-text-tertiary)', fontWeight: '600', marginRight: '2px' },
  sortBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '6px 12px', background: 'transparent',
    border: '1px solid var(--color-border)', borderRadius: '999px',
    fontSize: '12px', fontWeight: '500', color: 'var(--color-text-secondary)', cursor: 'pointer',
  },
  sortBtnActive: {
    backgroundColor: 'var(--color-primary-soft)',
    borderColor: 'var(--color-primary)',
    color: 'var(--color-primary-light)',
    fontWeight: '600',
  },
  sortArrow: { fontSize: '10px', opacity: 0.8 },
  listCard: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-md)',
  },
  metaChip: {
    fontSize: '12px', fontWeight: '500', color: 'var(--color-text-secondary)',
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-light)',
    padding: '4px 10px', borderRadius: '999px',
  },
  metaChipFlag: {
    color: 'var(--color-error-text)', background: 'var(--color-error-soft)',
    borderColor: 'var(--color-error)',
  },
  noResultsTitle: { fontSize: '15px', fontWeight: '600', color: 'var(--color-text-primary)', margin: '0 0 6px' },
  noResultsSub: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 12px' },
  clearLink: {
    background: 'none', border: 'none', color: 'var(--color-primary-light)',
    fontSize: '13px', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline', padding: 0,
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    paddingBottom: '0',
    flexWrap: 'wrap',
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
    color: 'var(--color-on-primary)',
    fontSize: '11px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '999px',
  },
  tabBadgeMuted: {
    backgroundColor: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-secondary)',
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
  avatarInitial: { fontSize: '15px', fontWeight: '600', color: 'var(--color-on-primary)', fontFamily: 'var(--font-display)' },
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
  railActionPrimary: { padding: '9px 14px', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  railAction: { padding: '9px 14px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: '500', color: 'var(--color-text-secondary)', cursor: 'pointer' },
}