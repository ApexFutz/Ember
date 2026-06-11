import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import EmptyState from '../../components/EmptyState.tsx'
import SkeletonCard from '../../components/SkeletonCard.tsx'
import { RailLayout, RailCard } from '../../components/RailLayout'

interface Role {
  id: string
  title: string
  department: string | null
  location: string
  description: string | null
  salary_min: number | null
  salary_max: number | null
  created_at: string
  profiles: {
    company_name: string | null
    full_name: string | null
    company_logo_url: string | null
  }
  rulesets: {
    stack_tags: string[]
    task_type: string
    time_limit_mins: number
    ai_allowed: boolean
    estimated_duration_minutes: number | null
  } | null
}

interface Submission {
  role_id: string
}

// "Posted X days ago" style relative timestamp from a post date.
function formatRelative(dateStr: string) {
  const then = new Date(dateStr).getTime()
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'Posted today'
  if (days === 1) return 'Posted 1 day ago'
  if (days < 7) return `Posted ${days} days ago`
  if (days < 14) return 'Posted 1 week ago'
  if (days < 30) return `Posted ${Math.floor(days / 7)} weeks ago`
  if (days < 60) return 'Posted 1 month ago'
  return `Posted ${Math.floor(days / 30)} months ago`
}

// Up to two initials from the company (or recruiter) name for the fallback avatar.
function companyInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatTaskType(taskType: string) {
  return taskType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const TASK_TYPES = ['build_a_feature', 'fix_a_bug', 'refactor_code', 'write_tests', 'other']
const LOCATIONS = ['remote', 'hybrid', 'onsite']
const COMP_THRESHOLDS = [50000, 100000, 150000, 200000] // "$Xk+" filter options

function formatK(n: number) {
  return `$${Math.round(n / 1000)}k`
}

function formatComp(min: number | null, max: number | null): string | null {
  if (min && max) return `${formatK(min)}–${formatK(max)}`
  if (min) return `${formatK(min)}+`
  if (max) return `Up to ${formatK(max)}`
  return null
}

export default function CandidateRoles() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [roles, setRoles] = useState<Role[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [taskTypeFilter, setTaskTypeFilter] = useState('all')
  const [aiFilter, setAiFilter] = useState('all') // all | allowed | not_allowed
  const [compFilter, setCompFilter] = useState('all') // 'all' | threshold string

  useEffect(() => {
    async function load() {
      // Fetch active roles with recruiter profile and ruleset
      const { data: rolesData } = await supabase
        .from('roles')
        .select(`
          id,
          title,
          department,
          location,
          description,
          salary_min,
          salary_max,
          created_at,
          profiles (
            company_name,
            full_name,
            company_logo_url
          ),
          rulesets (
            stack_tags,
            task_type,
            time_limit_mins,
            ai_allowed,
            estimated_duration_minutes
          )
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (rolesData) setRoles(rolesData as any)

      // Fetch candidate's existing submissions
      if (user) {
        const { data: subData } = await supabase
          .from('submissions')
          .select('role_id')
          .eq('candidate_id', user.id)

        if (subData) setSubmissions(subData)
      }

      setLoading(false)
    }
    load()
  }, [user])

  function hasSubmitted(roleId: string) {
    return submissions.some(s => s.role_id === roleId)
  }

  function isProfileComplete() {
    return !!(
      profile &&
      (profile as any).headline &&
      (profile as any).bio &&
      (profile as any).skills?.length > 0
    )
  }

  function handleStartAssessment(roleId: string) {
    navigate(`/assessment/${roleId}`)
  }

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return roles.filter(role => {
      if (locationFilter !== 'all' && role.location !== locationFilter) return false
      if (taskTypeFilter !== 'all' && role.rulesets?.task_type !== taskTypeFilter) return false
      if (aiFilter !== 'all') {
        const allowed = role.rulesets?.ai_allowed ?? false
        if (aiFilter === 'allowed' && !allowed) return false
        if (aiFilter === 'not_allowed' && allowed) return false
      }
      if (compFilter !== 'all') {
        const threshold = Number(compFilter)
        const top = role.salary_max ?? role.salary_min // best available upper signal
        if (top == null || top < threshold) return false
      }
      if (q) {
        const company = role.profiles?.company_name ?? role.profiles?.full_name ?? ''
        const haystack = [
          role.title,
          company,
          role.department ?? '',
          role.description ?? '',
          ...(role.rulesets?.stack_tags ?? []),
        ].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [roles, search, locationFilter, taskTypeFilter, aiFilter, compFilter])

  const filtersActive = search.trim() !== '' || locationFilter !== 'all' || taskTypeFilter !== 'all' || aiFilter !== 'all' || compFilter !== 'all'

  function clearFilters() {
    setSearch('')
    setLocationFilter('all')
    setTaskTypeFilter('all')
    setAiFilter('all')
    setCompFilter('all')
  }

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Open Roles</h1>
        <p style={styles.subtitle}>Browse active opportunities. Complete the assessment to apply.</p>
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )

  const profileComplete = isProfileComplete()
  const rail = roles.length > 0 ? (
    <>
      <RailCard title="Your profile">
        {profileComplete ? (
          <p style={styles.railNote}><span style={styles.railOk}>✓</span> Profile complete — you're ready to apply.</p>
        ) : (
          <>
            <p style={styles.railNote}>Add a headline, bio, and a skill to start assessments.</p>
            <button onClick={() => navigate('/candidate/profile')} style={styles.railActionPrimary}>Complete profile</button>
          </>
        )}
      </RailCard>
      <RailCard title="Your activity">
        <p style={styles.railBig}>
          <span style={styles.railBigNum}>{submissions.length}</span> assessment{submissions.length !== 1 ? 's' : ''} submitted
        </p>
        <button onClick={() => navigate('/candidate/assessments')} style={styles.railAction}>View my assessments</button>
      </RailCard>
      <RailCard title="Sharpen your skills">
        <p style={styles.railNote}>Practice generated tasks to build your skill profile.</p>
        <button onClick={() => navigate('/candidate/skills')} style={styles.railAction}>Go to skills</button>
      </RailCard>
    </>
  ) : null

  return (
    <RailLayout rail={rail}>
      <div style={styles.header}>
        <h1 style={styles.title}>Open Roles</h1>
        <p style={styles.subtitle}>
          Browse active opportunities. Complete the assessment to apply.
        </p>
      </div>

      {!isProfileComplete() && (
        <div style={styles.profileWarning}>
          <strong>Complete your profile first.</strong> Add a headline, bio, and at least one skill before starting an assessment.{' '}
          <span
            onClick={() => navigate('/candidate/profile')}
            style={styles.warningLink}
          >
            Go to profile →
          </span>
        </div>
      )}

      {roles.length > 0 && (
        <div style={styles.filterBar}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search roles, companies, stack…"
            style={styles.searchInput}
          />
          <div style={styles.filterControls}>
            <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={styles.select}>
              <option value="all">All locations</option>
              {LOCATIONS.map(l => (
                <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
            <select value={taskTypeFilter} onChange={e => setTaskTypeFilter(e.target.value)} style={styles.select}>
              <option value="all">All task types</option>
              {TASK_TYPES.map(t => (
                <option key={t} value={t}>{formatTaskType(t)}</option>
              ))}
            </select>
            <select value={aiFilter} onChange={e => setAiFilter(e.target.value)} style={styles.select}>
              <option value="all">Any AI policy</option>
              <option value="allowed">AI allowed</option>
              <option value="not_allowed">AI not allowed</option>
            </select>
            <select value={compFilter} onChange={e => setCompFilter(e.target.value)} style={styles.select}>
              <option value="all">Any compensation</option>
              {COMP_THRESHOLDS.map(t => (
                <option key={t} value={t}>{formatK(t)}+</option>
              ))}
            </select>
            {filtersActive && (
              <button onClick={clearFilters} style={styles.clearBtn}>Clear</button>
            )}
          </div>
        </div>
      )}

      {roles.length > 0 && (
        <p style={styles.resultCount}>
          {filteredRoles.length} of {roles.length} role{roles.length !== 1 ? 's' : ''}
        </p>
      )}

      {roles.length === 0 ? (
        <EmptyState
          title="No active roles right now"
          message="Check back soon — new roles are added regularly."
        />
      ) : filteredRoles.length === 0 ? (
        <EmptyState
          title="No roles match your filters"
          message="Try adjusting your search or clearing the filters."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      ) : (
        <div style={styles.roleList}>
          {filteredRoles.map(role => {
            const submitted = hasSubmitted(role.id)
            const profileComplete = isProfileComplete()

            return (
              <div key={role.id} style={styles.roleCard}>
                {/* Card header */}
                <div style={styles.cardTop}>
                  {(() => {
                    const company = role.profiles?.company_name ?? role.profiles?.full_name ?? 'Unknown company'
                    const logo = role.profiles?.company_logo_url
                    return (
                  <div style={styles.companyAvatar} title={company}>
                    {logo
                      ? <img src={logo} alt="" style={styles.companyAvatarImg} />
                      : <span style={styles.companyAvatarInitials}>{companyInitials(company)}</span>
                    }
                  </div>
                    )
                  })()}
                  <div style={styles.cardMeta}>
                    <h2 style={styles.roleTitle}>{role.title}</h2>
                    <p style={styles.roleMeta}>
                      {role.profiles?.company_name ?? role.profiles?.full_name ?? 'Unknown company'}
                      {' · '}
                      <span style={styles.locationBadge}>{role.location}</span>
                      {role.department && ` · ${role.department}`}
                      {' · '}
                      {formatRelative(role.created_at)}
                    </p>
                    {formatComp(role.salary_min, role.salary_max) && (
                      <span style={styles.compBadge}>
                        {formatComp(role.salary_min, role.salary_max)}
                      </span>
                    )}
                  </div>

                  {/* CTA button */}
                  {submitted ? (
                    <div style={styles.submittedBadge}>Already submitted</div>
                  ) : (
                    <button
                      onClick={() => handleStartAssessment(role.id)}
                      disabled={!profileComplete}
                      style={profileComplete
                        ? styles.startBtn
                        : { ...styles.startBtn, ...styles.startBtnDisabled }
                      }
                      title={!profileComplete ? 'Complete your profile first' : ''}
                    >
                      Start assessment →
                    </button>
                  )}
                </div>

                {/* Description */}
                {role.description && (
                  <p style={styles.description}>{role.description}</p>
                )}

                {/* Ruleset summary */}
                {role.rulesets ? (
                  <div style={styles.rulesetRow}>
                    {/* Stack tags */}
                    <div style={styles.rulesetSection}>
                      <span style={styles.rulesetLabel}>Stack</span>
                      <div style={styles.tagRow}>
                        {role.rulesets.stack_tags?.length > 0
                          ? role.rulesets.stack_tags.map(tag => (
                              <span key={tag} style={styles.tag}>{tag}</span>
                            ))
                          : <span style={styles.rulesetValue}>Not specified</span>
                        }
                      </div>
                    </div>

                    {/* Task type */}
                    <div style={styles.rulesetSection}>
                      <span style={styles.rulesetLabel}>Task</span>
                      <span style={styles.rulesetValue}>
                        {formatTaskType(role.rulesets.task_type)}
                      </span>
                    </div>

                    {/* Time limit */}
                    <div style={styles.rulesetSection}>
                      <span style={styles.rulesetLabel}>Time</span>
                      <span style={styles.rulesetValue}>
                        {role.rulesets.time_limit_mins} minutes
                      </span>
                    </div>

                    {/* Estimated duration (recruiter's expectation, if set) */}
                    {role.rulesets.estimated_duration_minutes != null && (
                      <div style={styles.rulesetSection}>
                        <span style={styles.rulesetLabel}>Est. duration</span>
                        <span style={styles.rulesetValue}>
                          ~{role.rulesets.estimated_duration_minutes} min
                        </span>
                      </div>
                    )}

                    {/* AI policy */}
                    <div style={styles.rulesetSection}>
                      <span style={styles.rulesetLabel}>AI</span>
                      <span style={{
                        ...styles.aiBadge,
                        ...(role.rulesets.ai_allowed
                          ? styles.aiBadgeAllowed
                          : styles.aiBadgeNotAllowed)
                      }}>
                        {role.rulesets.ai_allowed ? 'Allowed' : 'Not allowed'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={styles.noRuleset}>
                    Ruleset not yet defined by recruiter.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </RailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '900px' },
  loading: { padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '14px' },
  header: { marginBottom: '32px' },
  title: { fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 },
  profileWarning: {
    background: 'var(--color-warning-soft)',
    border: '1px solid var(--color-warning-soft)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
    fontSize: '13px',
    color: 'var(--color-warning-text)',
    marginBottom: '24px',
    lineHeight: '1.6',
  },
  warningLink: {
    cursor: 'pointer',
    color: 'var(--color-primary)',
    fontWeight: '600',
  },
  filterBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  searchInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-secondary)',
    outline: 'none',
    fontFamily: 'var(--font-primary)',
  },
  filterControls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
  },
  select: {
    padding: '9px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-secondary)',
    cursor: 'pointer',
    outline: 'none',
    fontWeight: '500',
  },
  clearBtn: {
    padding: '9px 14px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontWeight: '500',
  },
  resultCount: {
    fontSize: '12px',
    color: 'var(--color-text-tertiary)',
    margin: '0 0 16px',
  },
  empty: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-lg)',
    padding: '48px',
    textAlign: 'center',
  },
  emptyTitle: { fontSize: '16px', fontWeight: '500', color: 'var(--color-text-primary)', margin: '0 0 8px' },
  emptySubtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 },
  roleList: { display: 'flex', flexDirection: 'column', gap: '16px' },
  roleCard: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '28px',
    transition: 'all var(--transition-base)',
    boxShadow: 'var(--shadow-md)',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '20px',
    marginBottom: '16px',
  },
  cardMeta: { flex: 1 },
  companyAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  companyAvatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  companyAvatarInitials: { fontSize: '15px', fontWeight: '700', color: 'var(--color-on-primary)', fontFamily: 'var(--font-display)' },
  roleTitle: { fontSize: '18px', fontWeight: '600', color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)' },
  roleMeta: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: '1.5' },
  locationBadge: { color: 'var(--color-text-primary)' },
  compBadge: {
    display: 'inline-block',
    marginTop: '8px',
    padding: '3px 10px',
    backgroundColor: 'var(--color-success-soft)',
    color: 'var(--color-success-text)',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
  },
  description: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
    margin: '0 0 20px',
  },
  startBtn: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    boxShadow: 'var(--shadow-primary)',
    transition: 'all var(--transition-fast)',
  },
  startBtnDisabled: {
    backgroundColor: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-secondary)',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  submittedBadge: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  rulesetRow: {
    display: 'flex',
    gap: '32px',
    flexWrap: 'wrap',
    paddingTop: '20px',
    borderTop: '1px solid var(--color-border-light)',
  },
  rulesetSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  rulesetLabel: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  },
  rulesetValue: {
    fontSize: '13px',
    color: 'var(--color-text-primary)',
    fontWeight: '500',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  tag: {
    display: 'inline-block',
    padding: '4px 11px',
    backgroundColor: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border)',
    borderRadius: '999px',
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    fontWeight: '500',
  },
  aiBadge: {
    display: 'inline-block',
    padding: '4px 11px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
  },
  aiBadgeAllowed: {
    backgroundColor: 'var(--color-warning-soft)',
    color: 'var(--color-warning-text)',
  },
  aiBadgeNotAllowed: {
    backgroundColor: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-secondary)',
  },
  noRuleset: {
    fontSize: '12px',
    color: 'var(--color-text-tertiary)',
    fontStyle: 'italic',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border-light)',
  },
  railNote: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 12px' },
  railOk: { color: 'var(--color-success)', fontWeight: 700 },
  railBig: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 12px' },
  railBigNum: { fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-display)' },
  railActionPrimary: { padding: '9px 14px', width: '100%', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  railAction: { padding: '9px 14px', width: '100%', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer' },
}