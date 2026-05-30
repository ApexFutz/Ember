import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

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
    draft: { bg: '#f0ece6', color: '#8a837a' },
    active: { bg: '#d8f3dc', color: '#2d6a4f' },
    archived: { bg: '#fee2e2', color: '#991b1b' },
  }

  if (loading) return <div style={styles.loading}>Loading roles...</div>

  return (
    <div style={styles.page}>
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
      ) : (
        <div style={styles.list}>
          {roles.map(role => (
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
                  style={{ ...styles.actionBtn, color: '#991b1b' }}
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
    marginBottom: '32px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '500',
    color: '#1a1714',
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#8a837a',
    margin: 0,
  },
  newBtn: {
    padding: '9px 18px',
    backgroundColor: '#1a1714',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    flexShrink: 0,
  },
  loading: {
    fontSize: '14px',
    color: '#8a837a',
    padding: '40px',
  },
  empty: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '48px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#1a1714',
    margin: '0 0 8px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#8a837a',
    margin: '0 0 24px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    background: '#fff',
    border: '1px solid #ddd6cc',
    borderRadius: '4px',
    padding: '20px',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '10px',
    gap: '12px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#1a1714',
    marginBottom: '4px',
  },
  cardMeta: {
    fontSize: '13px',
    color: '#8a837a',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: '500',
    padding: '3px 10px',
    borderRadius: '2px',
    flexShrink: 0,
  },
  cardDesc: {
    fontSize: '13px',
    color: '#4a453f',
    lineHeight: '1.6',
    margin: '0 0 16px',
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    borderTop: '1px solid #f0ece6',
    paddingTop: '14px',
    marginTop: '4px',
  },
  actionBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #ddd6cc',
    borderRadius: '3px',
    fontSize: '12px',
    color: '#4a453f',
    cursor: 'pointer',
  },
}