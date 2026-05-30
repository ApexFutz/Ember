import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import EmptyState from '../../components/EmptyState.tsx'
import SkeletonCard from '../../components/SkeletonCard.tsx'

interface Role {
  id: string
  title: string
  department: string | null
  location: string
  description: string | null
  created_at: string
  profiles: {
    company_name: string | null
    full_name: string | null
  }
  rulesets: {
    stack_tags: string[]
    task_type: string
    time_limit_mins: number
    ai_allowed: boolean
  } | null
}

interface Submission {
  role_id: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

function formatTaskType(taskType: string) {
  return taskType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function CandidateRoles() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [roles, setRoles] = useState<Role[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)

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
          created_at,
          profiles (
            company_name,
            full_name
          ),
          rulesets (
            stack_tags,
            task_type,
            time_limit_mins,
            ai_allowed
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

  return (
    <div style={styles.page}>
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

      {roles.length === 0 ? (
        <EmptyState
          title="No active roles right now"
          message="Check back soon — new roles are added regularly."
        />
      ) : (
        <div style={styles.roleList}>
          {roles.map(role => {
            const submitted = hasSubmitted(role.id)
            const profileComplete = isProfileComplete()

            return (
              <div key={role.id} style={styles.roleCard}>
                {/* Card header */}
                <div style={styles.cardTop}>
                  <div style={styles.cardMeta}>
                    <h2 style={styles.roleTitle}>{role.title}</h2>
                    <p style={styles.roleMeta}>
                      {role.profiles?.company_name ?? role.profiles?.full_name ?? 'Unknown company'}
                      {' · '}
                      <span style={styles.locationBadge}>{role.location}</span>
                      {role.department && ` · ${role.department}`}
                      {' · Posted '}
                      {formatDate(role.created_at)}
                    </p>
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
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '860px' },
  loading: { padding: '2rem', color: '#8a837a', fontSize: '14px' },
  header: { marginBottom: '28px' },
  title: { fontSize: '24px', fontWeight: '500', color: '#1a1714', margin: '0 0 4px' },
  subtitle: { fontSize: '14px', color: '#8a837a', margin: 0 },
  profileWarning: {
    background: '#fef9c3',
    border: '1px solid #fde047',
    borderRadius: '3px',
    padding: '12px 16px',
    fontSize: '13px',
    color: '#854d0e',
    marginBottom: '24px',
    lineHeight: '1.6',
  },
  warningLink: {
    cursor: 'pointer',
    textDecoration: 'underline',
    fontWeight: '500',
  },
  empty: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '48px',
    textAlign: 'center',
  },
  emptyTitle: { fontSize: '16px', fontWeight: '500', color: '#1a1714', margin: '0 0 8px' },
  emptySubtitle: { fontSize: '14px', color: '#8a837a', margin: 0 },
  roleList: { display: 'flex', flexDirection: 'column', gap: '16px' },
  roleCard: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '24px',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '12px',
  },
  cardMeta: { flex: 1 },
  roleTitle: { fontSize: '17px', fontWeight: '500', color: '#1a1714', margin: '0 0 6px' },
  roleMeta: { fontSize: '13px', color: '#8a837a', margin: 0, lineHeight: '1.5' },
  locationBadge: { color: '#1a1714' },
  description: {
    fontSize: '13px',
    color: '#4a453f',
    lineHeight: '1.6',
    margin: '0 0 16px',
  },
  startBtn: {
    padding: '9px 18px',
    backgroundColor: '#1a1714',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  startBtnDisabled: {
    backgroundColor: '#ddd6cc',
    color: '#8a837a',
    cursor: 'not-allowed',
  },
  submittedBadge: {
    padding: '9px 18px',
    backgroundColor: '#f0ece6',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '13px',
    color: '#8a837a',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  rulesetRow: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap',
    paddingTop: '16px',
    borderTop: '1px solid #f0ece6',
  },
  rulesetSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  rulesetLabel: {
    fontSize: '10px',
    fontWeight: '500',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#8a837a',
  },
  rulesetValue: {
    fontSize: '13px',
    color: '#1a1714',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  tag: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#f0ece6',
    border: '1px solid #ddd6cc',
    borderRadius: '2px',
    fontSize: '12px',
    color: '#1a1714',
  },
  aiBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '2px',
    fontSize: '12px',
    fontWeight: '500',
  },
  aiBadgeAllowed: {
    backgroundColor: '#fef3c7',
    color: '#b45309',
  },
  aiBadgeNotAllowed: {
    backgroundColor: '#f0ece6',
    color: '#8a837a',
  },
  noRuleset: {
    fontSize: '12px',
    color: '#8a837a',
    fontStyle: 'italic',
    paddingTop: '12px',
    borderTop: '1px solid #f0ece6',
  },
}