import React, { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  getMyMembership, getMembers, getSentInvitations, getMyPendingInvites,
  createOrganization, acceptInvite, declineInvite, inviteMember, revokeInvite,
  removeMember, setMemberRole, renameOrg,
  type Membership, type OrgMember, type OrgInvitation, type MemberRole,
} from '../../lib/organizations'

export default function Organization() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [sentInvites, setSentInvites] = useState<OrgInvitation[]>([])
  const [myInvites, setMyInvites] = useState<OrgInvitation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // form state
  const [newOrgName, setNewOrgName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('member')

  async function load() {
    setLoading(true)
    try {
      const [m, invites] = await Promise.all([getMyMembership(), getMyPendingInvites()])
      setMembership(m)
      setMyInvites(invites)
      if (m) {
        const [mem, sent] = await Promise.all([
          getMembers(m.org.id),
          m.role === 'admin' ? getSentInvitations(m.org.id) : Promise.resolve([]),
        ])
        setMembers(mem)
        setSentInvites(sent)
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); await load() }
    catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  const isAdmin = membership?.role === 'admin'
  const pendingSent = sentInvites.filter(i => i.status === 'pending')

  if (loading) return <div style={styles.loading}>Loading…</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Team</h1>
        <p style={styles.subtitle}>Manage your organization, recruiters, and invitations.</p>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Invitations addressed to me */}
      {myInvites.length > 0 && (
        <div style={styles.card}>
          <p style={styles.cardLabel}>Invitations</p>
          {myInvites.map(inv => (
            <div key={inv.id} style={styles.row}>
              <div>
                <span style={styles.rowName}>{inv.organizations?.name ?? 'An organization'}</span>
                <span style={styles.rowSub}>invited you as {inv.member_role}</span>
              </div>
              <div style={styles.rowActions}>
                <button disabled={busy} onClick={() => run(() => acceptInvite(inv.id))} style={styles.btnPrimary}>Accept</button>
                <button disabled={busy} onClick={() => run(() => declineInvite(inv.id))} style={styles.btn}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No org → create one */}
      {!membership && (
        <div style={styles.card}>
          <p style={styles.cardLabel}>Create an organization</p>
          <p style={styles.hint}>Start a team, then invite recruiters to join. You'll be the admin.</p>
          <div style={styles.inlineForm}>
            <input
              value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
              placeholder="Organization name"
              style={styles.input}
            />
            <button
              disabled={busy || !newOrgName.trim()}
              onClick={() => run(async () => { await createOrganization(newOrgName.trim()); setNewOrgName('') })}
              style={styles.btnPrimary}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Org panel */}
      {membership && (
        <>
          <div style={styles.card}>
            <div style={styles.orgHead}>
              <div>
                <p style={styles.cardLabel}>Organization</p>
                {isAdmin ? (
                  <input
                    defaultValue={membership.org.name}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== membership.org.name) run(() => renameOrg(membership.org.id, v)) }}
                    style={styles.orgNameInput}
                  />
                ) : (
                  <p style={styles.orgName}>{membership.org.name}</p>
                )}
              </div>
              <span style={styles.roleBadge}>{membership.role}</span>
            </div>
          </div>

          {/* Members */}
          <div style={styles.card}>
            <p style={styles.cardLabel}>Members ({members.length})</p>
            <div style={styles.list}>
              {members.map(m => {
                const isMe = m.recruiter_id === user?.id
                return (
                  <div key={m.recruiter_id} style={styles.row}>
                    <div>
                      <span style={styles.rowName}>{m.full_name ?? 'Recruiter'}{isMe ? ' (you)' : ''}</span>
                      <span style={styles.rowSub}>{m.member_role}</span>
                    </div>
                    {isAdmin && !isMe && (
                      <div style={styles.rowActions}>
                        <button disabled={busy} onClick={() => run(() => setMemberRole(membership.org.id, m.recruiter_id, m.member_role === 'admin' ? 'member' : 'admin'))} style={styles.btn}>
                          {m.member_role === 'admin' ? 'Make member' : 'Make admin'}
                        </button>
                        <button disabled={busy} onClick={() => run(() => removeMember(membership.org.id, m.recruiter_id))} style={styles.btnDanger}>Remove</button>
                      </div>
                    )}
                    {!isAdmin && isMe && (
                      <button disabled={busy} onClick={() => run(() => removeMember(membership.org.id, m.recruiter_id))} style={styles.btnDanger}>Leave</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Admin: invite + pending invitations */}
          {isAdmin && (
            <div style={styles.card}>
              <p style={styles.cardLabel}>Invite a recruiter</p>
              <p style={styles.hint}>They'll see the invitation in their Team page and must accept it.</p>
              <div style={styles.inlineForm}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="recruiter@company.com"
                  style={styles.input}
                />
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as MemberRole)} style={styles.select}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  disabled={busy || !inviteEmail.trim()}
                  onClick={() => run(async () => { await inviteMember(membership.org.id, inviteEmail, inviteRole); setInviteEmail('') })}
                  style={styles.btnPrimary}
                >
                  Invite
                </button>
              </div>

              {pendingSent.length > 0 && (
                <div style={{ ...styles.list, marginTop: '16px' }}>
                  {pendingSent.map(inv => (
                    <div key={inv.id} style={styles.row}>
                      <div>
                        <span style={styles.rowName}>{inv.email}</span>
                        <span style={styles.rowSub}>pending · {inv.member_role}</span>
                      </div>
                      <button disabled={busy} onClick={() => run(() => revokeInvite(inv.id))} style={styles.btn}>Revoke</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-md)',
  marginBottom: '16px',
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '760px' },
  loading: { padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '14px' },
  header: { marginBottom: '24px' },
  title: { fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 },
  error: { background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '13px', color: 'var(--color-error)', marginBottom: '16px' },
  card,
  cardLabel: { fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: '0 0 12px' },
  hint: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: '-6px 0 12px', lineHeight: 1.5 },
  orgHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  orgName: { fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', margin: 0 },
  orgNameInput: { fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '6px 10px', outline: 'none' },
  roleBadge: { fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px', textTransform: 'capitalize', color: 'var(--color-primary-light)', background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.3)' },
  list: { display: 'flex', flexDirection: 'column', gap: '8px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)' },
  rowName: { fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', marginRight: '8px' },
  rowSub: { fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'capitalize' },
  rowActions: { display: 'flex', gap: '8px', flexShrink: 0 },
  inlineForm: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  input: { flex: 1, minWidth: '200px', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '14px', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)', outline: 'none' },
  select: { padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)', cursor: 'pointer', outline: 'none' },
  btnPrimary: { padding: '9px 16px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btn: { padding: '9px 14px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDanger: { padding: '9px 14px', background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 500, color: 'var(--color-error)', cursor: 'pointer', whiteSpace: 'nowrap' },
}
