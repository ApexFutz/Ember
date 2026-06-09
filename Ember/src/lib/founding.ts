// Founding-recruiter program helpers (invite codes, welcome flag, admin).
import { supabase } from './supabase'

/** Pre-signup validation — does this code exist and have a use left? (no mutation) */
export async function checkInviteCode(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_invite_code', { p_code: code })
  if (error) return false
  return data === true
}

/** Consume a code and flag the signed-in user as a founding recruiter. Throws on invalid. */
export async function redeemInviteCode(code: string): Promise<void> {
  const { error } = await supabase.rpc('redeem_invite_code', { p_code: code })
  if (error) throw error
}

/** Mark the welcome modal as seen for the signed-in user. */
export async function markWelcomeSeen(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('profiles').update({ has_seen_welcome: true }).eq('id', user.id)
}

export async function isAdmin(): Promise<boolean> {
  const { data } = await supabase.rpc('is_admin')
  return data === true
}

export interface FounderRow { id: string; full_name: string | null; created_at: string }
export interface InviteCodeRow { code: string; max_uses: number; uses: number; used_by: string | null; used_at: string | null }

export async function adminListFounders(): Promise<FounderRow[]> {
  const { data, error } = await supabase.rpc('admin_list_founders')
  if (error) throw error
  return (data ?? []) as FounderRow[]
}

export async function adminListInviteCodes(): Promise<InviteCodeRow[]> {
  const { data, error } = await supabase.rpc('admin_list_invite_codes')
  if (error) throw error
  return (data ?? []) as InviteCodeRow[]
}
