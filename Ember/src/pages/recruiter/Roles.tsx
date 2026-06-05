import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { RailLayout, RailCard } from '../../components/RailLayout'

type RoleStatus = 'draft' | 'active' | 'archived'
type LocationType = 'remote' | 'hybrid' | 'onsite'

interface Role {
  id: string
  title: string
  department: string | null
  location: LocationType
  description: string | null
  status: RoleStatus
  created_at: string
}

export default function RecruiterRoles() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roles
    return roles.filter(role =>
      [role.title, role.department ?? '', role.description ?? '', role.location, role.status]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [roles, search])

  useEffect(() => {
    fetchRoles()
  }, [user])

  async function fetchRoles() {
    if (!user) return
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('recruiter_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) setRoles(data)
    setLoading(false)
  }

  async function toggleStatus(role: Role) {
    const newStatus: RoleStatus = role.status === 'active' ? 'draft' : 'active'
    const { error } = await supabase
      .from('roles')
      .update({ status: newStatus })
      .eq('id', role.id)

    if (!error) {
      setRoles(prev =>
        prev.map(r => r.id === role.id ? { ...r, status: newStatus } : r)
      )
    }
  }

  async function archiveRole(id: string) {
    const { error } = await supabase
      .from('roles')
      .update({ status: 'archived' })
      .eq('id', id)

    if (!error) {
      setRoles(prev => prev.filter(r => r.id !== id))
    }
  }

  const statusColors: Record<RoleStatus, { bg: string; color: string }> = {
    draft: { bg: 'rgba(154, 154, 168, 0.12)', color: '#9a9aa8' },
    active: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981' },
    archived: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' },
  }

  if (loading) return <div style={styles.loading}>Loading roles...</div>

  const statusCounts = {
    active: roles.filter(r => r.status === 'active').length,
    draft: roles.filter(r => r.status === 'draft').length,
    archived: roles.filter(r => r.status === 'archived').length,
  }

  const rail = roles.length > 0 ? (
    <>
      <RailCard title="Role status">
        <div style={styles.railList}>
          {(['active', 'draft', 'archived'] as RoleStatus[]).map(s => (
            <div key={s} style={styles.railRow}>
              <span style={{
                ...styles.railDot,
                backgroundColor: statusColors[s].color,
              }} />
              <span style={styles.railRowName}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
              <span style={styles.railRowNum}>{statusCounts[s]}</span>
            </div>
          ))}
        </div>
      </RailCard>
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
          <h1 style={styles.title}>Roles</h1>
          <p style={styles.subtitle}>
            Manage your job postings and rulesets.
          </p>
        </div>
        <button
          onClick={() => navigate('/recruiter/roles/new')}
          style={styles.newBtn}
        >
          + New role
        </button>
      </div>

      {roles.length > 0 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search roles by title, department, location…"
          style={styles.searchInput}
        />
      )}

      {roles.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No roles yet</p>
          <p style={styles.emptyText}>
            Create your first role to start receiving verified candidates.
          </p>
          <button
            onClick={() => navigate('/recruiter/roles/new')}
            style={styles.newBtn}
          >
            + Create your first role
          </button>
        </div>
      ) : filteredRoles.length === 0 ? (
        <div style={styles.noMatch}>
          No roles match “{search.trim()}”.
        </div>
      ) : (
        <div style={styles.list}>
          {filteredRoles.map(role => (
            <div key={role.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <div style={styles.cardTitle}>{role.title}</div>
                  <div style={styles.cardMeta}>
                    {role.department && <span>{role.department} · </span>}
                    <span style={{ textTransform: 'capitalize' }}>
                      {role.location}
                    </span>
                    <span> · Posted {new Date(role.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <span style={{
                  ...styles.statusBadge,
                  backgroundColor: statusColors[role.status].bg,
                  color: statusColors[role.status].color,
                }}>
                  {role.status.charAt(0).toUpperCase() + role.status.slice(1)}
                </span>
              </div>

              {role.description && (
                <p style={styles.cardDesc}>{role.description}</p>
              )}

              <div style={styles.cardActions}>
                <button
                  onClick={() => navigate(`/recruiter/roles/${role.id}/ruleset`)}
                  style={styles.actionBtn}
                >
                  {role.status === 'draft' ? 'Edit ruleset' : 'View ruleset'}
                </button>
                <button
                  onClick={() => toggleStatus(role)}
                  style={styles.actionBtn}
                >
                  {role.status === 'active' ? 'Set to draft' : 'Set active'}
                </button>
                <button
                  onClick={() => archiveRole(role.id)}
                  style={{ ...styles.actionBtn, color: 'var(--color-error)' }}
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </RailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '760px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 'var(--space-8)',
  },
  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 var(--space-2)',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  newBtn: {
    padding: '10px 20px',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  loading: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-secondary)',
    padding: 'var(--space-10)',
  },
  searchInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-secondary)',
    outline: 'none',
    fontFamily: 'var(--font-primary)',
    marginBottom: 'var(--space-4)',
  },
  noMatch: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--space-10)',
    textAlign: 'center',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
  },
  empty: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--space-12)',
    textAlign: 'center',
    boxShadow: 'var(--shadow-md)',
  },
  emptyTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 var(--space-2)',
    fontFamily: 'var(--font-display)',
  },
  emptyText: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-secondary)',
    margin: '0 0 var(--space-6)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  card: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--space-6)',
    boxShadow: 'var(--shadow-md)',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 'var(--space-3)',
    gap: 'var(--space-3)',
  },
  cardTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    marginBottom: 'var(--space-1)',
    fontFamily: 'var(--font-display)',
  },
  cardMeta: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
  },
  statusBadge: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--weight-semibold)',
    padding: '4px 11px',
    borderRadius: '999px',
    flexShrink: 0,
    letterSpacing: '0.02em',
  },
  cardDesc: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
    margin: '0 0 var(--space-4)',
  },
  cardActions: {
    display: 'flex',
    gap: 'var(--space-2)',
    borderTop: '1px solid var(--color-border-light)',
    paddingTop: 'var(--space-4)',
    marginTop: 'var(--space-1)',
  },
  actionBtn: {
    padding: '7px 14px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontWeight: 'var(--weight-medium)',
  },
  railList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  railRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  railDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  railRowName: { flex: 1, fontSize: '13px', color: 'var(--color-text-primary)' },
  railRowNum: { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-secondary)' },
  railActions: { display: 'flex', flexDirection: 'column', gap: '8px' },
  railActionPrimary: { padding: '9px 14px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  railAction: { padding: '9px 14px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: '500', color: 'var(--color-text-secondary)', cursor: 'pointer' },
}