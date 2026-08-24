/**
 * Household sharing on an address (S4).
 *
 * Two roles, and the difference is deliberate:
 *   admin  — the other adults in the home. Full rights over the CONTENT of
 *            every project on the address, including inviting more people.
 *   viewer — read-only insight, for the case Carl described: a trusted builder
 *            who may see what earlier builders did in this home.
 *
 * Owner-exclusive actions (delete the address, remove the owner, transfer) are
 * enforced in the DATABASE, not here — see 20260824100000. The UI mirrors those
 * rules for clarity, never as the only guard.
 */

import { supabase } from '@/integrations/supabase/client';

export type PropertyRole = 'admin' | 'viewer';

export interface PropertyMember {
  id: string;
  property_id: string;
  member_profile_id: string | null;
  invited_email: string | null;
  role: PropertyRole;
  invitation_token: string;
  accepted_at: string | null;
  created_at: string;
  /** Filled in from profiles when the invite has been accepted. */
  displayName?: string | null;
  displayEmail?: string | null;
}

export async function listPropertyMembers(propertyId: string): Promise<PropertyMember[]> {
  const { data, error } = await supabase
    .from('property_members')
    .select('id, property_id, member_profile_id, invited_email, role, invitation_token, accepted_at, created_at')
    .eq('property_id', propertyId)
    .order('created_at');

  if (error) {
    console.error('listPropertyMembers failed:', error);
    return [];
  }

  const rows = (data ?? []) as PropertyMember[];
  const profileIds = rows.map((r) => r.member_profile_id).filter(Boolean) as string[];
  if (profileIds.length === 0) return rows;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', profileIds);

  type ProfileRow = { id: string; name: string | null; email: string | null };
  const byId = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p] as const)
  );
  return rows.map((r) => {
    const p = r.member_profile_id ? byId.get(r.member_profile_id) : undefined;
    return { ...r, displayName: p?.name ?? null, displayEmail: p?.email ?? null };
  });
}

export interface InviteResult {
  ok: boolean;
  /** The link to hand to the invitee. */
  inviteUrl?: string;
  error?: string;
}

/**
 * Invite someone to an address.
 *
 * The invite is bound to the email: `accept_property_invitation` refuses a
 * mismatch. An address carries a household's full renovation and cost history,
 * so a forwarded link must not be enough on its own.
 */
export async function invitePropertyMember(
  propertyId: string,
  email: string,
  role: PropertyRole
): Promise<InviteResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { ok: false, error: 'empty-email' };

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle()
    : { data: null };

  const { data, error } = await supabase
    .from('property_members')
    .insert({
      property_id: propertyId,
      invited_email: trimmed,
      role,
      invited_by: profile?.id ?? null,
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    })
    .select('invitation_token')
    .single();

  if (error || !data) {
    console.error('invitePropertyMember failed:', error);
    return { ok: false, error: error?.message };
  }

  return {
    ok: true,
    inviteUrl: `${window.location.origin}/address-invite/${data.invitation_token}`,
  };
}

export async function updateMemberRole(memberId: string, role: PropertyRole): Promise<boolean> {
  const { error } = await supabase.from('property_members').update({ role }).eq('id', memberId);
  if (error) {
    console.error('updateMemberRole failed:', error);
    return false;
  }
  return true;
}

export async function removePropertyMember(memberId: string): Promise<boolean> {
  const { error } = await supabase.from('property_members').delete().eq('id', memberId);
  if (error) {
    console.error('removePropertyMember failed:', error);
    return false;
  }
  return true;
}

/**
 * Accept an invitation. Runs as a SECURITY DEFINER RPC because the invitee
 * cannot read the row that invites them — they are not a member yet.
 * Returns the property id on success.
 */
export async function acceptPropertyInvitation(
  token: string
): Promise<{ ok: true; propertyId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('accept_property_invitation', { p_token: token });
  if (error) {
    console.error('acceptPropertyInvitation failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, propertyId: data as string };
}

/** Is the signed-in user the owner of this property? Used only to shape the UI. */
export async function isPropertyOwner(propertyId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('user_owns_property', { p_property_id: propertyId });
  if (error) {
    console.error('isPropertyOwner failed:', error);
    return false;
  }
  return data === true;
}
