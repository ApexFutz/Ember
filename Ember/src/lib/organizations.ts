// Data-access for enterprise organizations: membership, members, invitations,
// and the two-way invite handshake. Privileged steps go through SECURITY DEFINER
// RPCs (see supabase/migrations/20260601100000_organizations.sql).
import { supabase } from './supabase'

export type MemberRole = 'admin' | 'member'
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

export interface Organization {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface Membership {
  org: Organization
  role: MemberRole
}

export interface OrgMember {
  recruiter_id: string
  member_role: MemberRole
  created_at: string
  full_name: string | null
}

export interface OrgInvitation {
  id: string
  org_id: string
  email: string
  member_role: MemberRole
  status: InviteStatus
  created_at: string
  organizations?: { name: string } | null
}

/** The caller's current organization + role (first membership; single-org UI). */
export async function getMyMembership(): Promise<Membership | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('organization_members')
    .select('member_role, organizations(*)')
    .eq('recruiter_id', user.id)
    .limit(1)
    .maybeSingle()
  if (error || !data || !data.organizations) return null
  return { org: data.organizations as unknown as Organization, role: data.member_role as MemberRole }
}

/** Members of an org (joined with profile names). */
export async function getMembers(orgId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('recruiter_id, member_role, created_at, profiles(full_name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((m: any) => ({
    recruiter_id: m.recruiter_id,
    member_role: m.member_role,
    created_at: m.created_at,
    full_name: m.profiles?.full_name ?? null,
  }))
}

/** Invitations sent by an org (admin view). */
export async function getSentInvitations(orgId: string): Promise<OrgInvitation[]> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OrgInvitation[]
}

/** Pending invitations addressed to the signed-in user's email. */
export async function getMyPendingInvites(): Promise<OrgInvitation[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return []
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*, organizations(name)')
    .eq('status', 'pending')
    .ilike('email', user.email)
  if (error) throw error
  return (data ?? []) as OrgInvitation[]
}

export async function createOrganization(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_organization', { p_name: name })
  if (error) throw error
  return data as string
}

export async function acceptInvite(id: string): Promise<void> {
  const { error } = await supabase.rpc('accept_invitation', { p_invite: id })
  if (error) throw error
}

export async function declineInvite(id: string): Promise<void> {
  const { error } = await supabase.rpc('decline_invitation', { p_invite: id })
  if (error) throw error
}

export async function inviteMember(orgId: string, email: string, role: MemberRole): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('organization_invitations').upsert({
    org_id: orgId,
    email: email.trim().toLowerCase(),
    member_role: role,
    status: 'pending',
    invited_by: user?.id ?? null,
    responded_at: null,
  }, { onConflict: 'org_id,email' })
  if (error) throw error
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.from('organization_invitations').update({ status: 'revoked' }).eq('id', id)
  if (error) throw error
}

export async function removeMember(orgId: string, recruiterId: string): Promise<void> {
  const { error } = await supabase.from('organization_members').delete()
    .eq('org_id', orgId).eq('recruiter_id', recruiterId)
  if (error) throw error
}

export async function setMemberRole(orgId: string, recruiterId: string, role: MemberRole): Promise<void> {
  const { error } = await supabase.from('organization_members').update({ member_role: role })
    .eq('org_id', orgId).eq('recruiter_id', recruiterId)
  if (error) throw error
}

export async function renameOrg(orgId: string, name: string): Promise<void> {
  const { error } = await supabase.from('organizations').update({ name }).eq('id', orgId)
  if (error) throw error
}
