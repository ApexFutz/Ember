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

// A pending status transition awaiting confirmation in the modal.
type PendingAction =
  | { kind: 'publish'; role: Role }
  | { kind: 'archive'; role: Role; inProgress: number }
  | { kind: 'reactivate'; role: Role }

export default function RecruiterRoles() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<RoleStatus>('active')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [working, setWorking] = useState(false)

  const filteredRoles = useMemo(() => {
    const byTab = roles.filter(r => r.status === tab)
    const q = search.trim().toLowerCase()
    if (!q) return byTab
    return byTab.filter(role =>
      [role.title, role.department ?? '', role.description ?? '', role.location, role.status]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [roles, search, tab])

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

  // Count candidates with an in-flight (incomplete) submission for this role.
  async function countInProgress(roleId: string): Promise<number> {
    const { count } = await supabase
      .from('role_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', roleId)
      .in('status', ['in_progress', 'submitted'])
    return count ?? 0
  }

  async function setStatus(role: Role, newStatus: RoleStatus) {
    const { error } = await supabase
      .from('roles')
      .update({ status: newStatus })
      .eq('id', role.id)
    if (!error) {
      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, status: newStatus } : r))
    }
    return !error
  }

  // Open the right confirmation flow for a transition.
  function requestPublish(role: Role) { setPending({ kind: 'publish', role }) }
  function requestReactivate(role: Role) { setMenuOpen(null); setPending({ kind: 'reactivate', role }) }
  async function requestArchive(role: Role) {
    const inProgress = await countInProgress(role.id)
    setPending({ kind: 'archive', role, inProgress })
  }

  async function confirmPending() {
    if (!pending) return
    setWorking(true)
    const target: RoleStatus = pending.kind === 'archive' ? 'archived' : 'active'
    await setStatus(pending.role, target)
    setWorking(false)
    // Jump to the tab the role just moved to, so it stays visible.
    setTab(target)
    setPending(null)
  }

  const statusColors: Record<RoleStatus, { bg: string; color: string }> = {
    draft: { bg: 'var(--color-neutral-soft)', color: 'var(--color-text-secondary)' },
    active: { bg: 'var(--color-success-soft)', color: 'var(--color-success)' },
    archived: { bg: 'var(--color-error-soft)', color: 'var(--color-error)' },
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
        <>
          <div style={styles.tabs}>
            {(['active', 'draft', 'archived'] as RoleStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setTab(s)}
                style={tab === s ? { ...styles.tab, ...styles.tabActive } : styles.tab}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)} ({statusCounts[s]})
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search roles by title, department, location…"
            style={styles.searchInput}
          />
        </>
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
          {search.trim()
            ? `No ${tab} roles match “${search.trim()}”.`
            : `No ${tab} roles.`}
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
                  onClick={() => navigate(`/recruiter/roles/${role.id}/analytics`)}
                  style={styles.actionBtn}
                >
                  View Analytics
                </button>

                {role.status === 'draft' && (
                  <button
                    onClick={() => requestPublish(role)}
                    style={{ ...styles.actionBtn, ...styles.actionPrimary }}
                  >
                    Publish
                  </button>
                )}

                {role.status === 'active' && (
                  <button
                    onClick={() => requestArchive(role)}
                    style={{ ...styles.actionBtn, color: 'var(--color-error)' }}
                  >
                    Archive
                  </button>
                )}

                {role.status === 'archived' && (
                  <div style={styles.menuWrap}>
                    <button
                      onClick={() => setMenuOpen(menuOpen === role.id ? null : role.id)}
                      style={styles.actionBtn}
                    >
                      Manage ▾
                    </button>
                    {menuOpen === role.id && (
                      <>
                        <div style={styles.menuBackdrop} onClick={() => setMenuOpen(null)} />
                        <div style={styles.menu}>
                          <button
                            onClick={() => requestReactivate(role)}
                            style={styles.menuItem}
                          >
                            Reactivate
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pending && (() => {
        const blocked = pending.kind === 'archive' && pending.inProgress > 0
        const copy = pending.kind === 'publish'
          ? { title: 'Publish role?', body: 'This will make the role visible to candidates.', cta: 'Publish' }
          : pending.kind === 'reactivate'
          ? { title: 'Reactivate role?', body: 'This will make the role visible to candidates again.', cta: 'Reactivate' }
          : { title: 'Archive role?', body: 'Candidates will no longer be able to apply.', cta: 'Archive' }
        return (
          <div style={styles.overlay} onClick={() => !working && setPending(null)}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <h2 style={styles.modalTitle}>{copy.title}</h2>
              <p style={styles.modalBody}>{copy.body}</p>
              <p style={styles.modalRole}>{pending.role.title}</p>

              {blocked && (
                <div style={styles.warn}>
                  ⚠ {pending.inProgress} candidate{pending.inProgress === 1 ? '' : 's'}{' '}
                  {pending.inProgress === 1 ? 'has' : 'have'} an assessment in progress for this role.
                  Archiving will cut off {pending.inProgress === 1 ? 'their' : 'their'} ability to submit.
                </div>
              )}

              <div style={styles.modalActions}>
                <button onClick={() => setPending(null)} disabled={working} style={styles.modalCancel}>
                  Cancel
                </button>
                <button
                  onClick={confirmPending}
                  disabled={working}
                  style={{
                    ...styles.modalConfirm,
                    ...(pending.kind === 'archive' ? styles.modalConfirmDanger : {}),
                    ...(working ? { opacity: 0.6 } : {}),
                  }}
                >
                  {working ? 'Working…' : blocked ? `${copy.cta} anyway` : copy.cta}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
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
    color: 'var(--color-on-primary)',
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
  actionPrimary: {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: '1px solid var(--color-primary)',
  },
  tabs: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
  },
  tab: {
    padding: '7px 14px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: '999px',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontWeight: 'var(--weight-medium)',
  },
  tabActive: {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    borderColor: 'var(--color-primary)',
  },
  menuWrap: { position: 'relative', display: 'inline-block' },
  menuBackdrop: { position: 'fixed', inset: 0, zIndex: 9 },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    zIndex: 10,
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    minWidth: '140px',
    padding: '4px',
  },
  menuItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 'var(--space-4)',
  },
  modal: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--space-6)',
    maxWidth: '420px',
    width: '100%',
    boxShadow: 'var(--shadow-xl)',
  },
  modalTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 var(--space-2)',
    fontFamily: 'var(--font-display)',
  },
  modalBody: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    margin: '0 0 var(--space-2)',
    lineHeight: 1.5,
  },
  modalRole: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 var(--space-4)',
  },
  warn: {
    background: 'var(--color-warning-soft, var(--color-error-soft))',
    border: '1px solid var(--color-warning-soft, var(--color-error-soft))',
    borderRadius: 'var(--radius-md)',
    padding: '10px 14px',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-warning-text, var(--color-error-text))',
    lineHeight: 1.5,
    marginBottom: 'var(--space-4)',
  },
  modalActions: {
    display: 'flex',
    gap: 'var(--space-2)',
    justifyContent: 'flex-end',
  },
  modalCancel: {
    padding: '9px 18px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  modalConfirm: {
    padding: '9px 18px',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
  },
  modalConfirmDanger: {
    backgroundColor: 'var(--color-error)',
  },
  railList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  railRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  railDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  railRowName: { flex: 1, fontSize: '13px', color: 'var(--color-text-primary)' },
  railRowNum: { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-secondary)' },
  railActions: { display: 'flex', flexDirection: 'column', gap: '8px' },
  railActionPrimary: { padding: '9px 14px', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  railAction: { padding: '9px 14px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: '500', color: 'var(--color-text-secondary)', cursor: 'pointer' },
}