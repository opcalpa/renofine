/**
 * Properties ("Adresser") — one home, many projects over time.
 *
 * Single source for every address decision: how two addresses are considered
 * the same, how a project finds or creates its property, and how it is moved
 * between them. Creation paths call `resolvePropertyForProject`; pickers call
 * `listMyProperties`; the settings dialog calls `assignProjectToProperty`.
 *
 * Linking is always BEST EFFORT. A project must never fail to be created
 * because its address could not be resolved — an unlinked project is a normal,
 * self-healing state (the user can assign it afterwards).
 */

import { supabase } from '@/integrations/supabase/client';
import { canManageProperty } from './propertyMemberService';
import { groupSimilarAddresses, looksLikeSameAddress } from '@/lib/addressMatch';

/**
 * Three states, of which a person only ever picks two: NULL means "not answered
 * yet", and it is the honest default for an address the app inferred rather
 * than was told about.
 */
export type ResidenceStatus = 'current' | 'former';

/**
 * P2: how the home is HELD — not what it looks like.
 *
 * `AIPropertyType` (apartment/villa/townhouse/summerhouse) on a project draft
 * is BUILDING form and says nothing about this: an ägarlägenhet is an
 * apartment you own outright, a summer house is normally äganderätt. Never
 * derive one from the other.
 *
 * NULL means "not answered". It decides which identifiers ROT asks for — and,
 * for a hyresrätt, that ROT does not apply at all.
 */
export type Tenure = 'bostadsratt' | 'aganderatt' | 'hyresratt';

export interface PropertyRow {
  id: string;
  owner_id: string;
  residence_status: ResidenceStatus | null;
  updated_at: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  property_designation: string | null;
  tenure: Tenure | null;
  brf_name: string | null;
  brf_org_number: string | null;
  apartment_number: string | null;
}

/**
 * One column list, so a property looks the same wherever it is read. Two
 * lists drift, and a page reading the short one silently loses a field the
 * rest of the app is already writing.
 */
export const PROPERTY_COLUMNS =
  'id, owner_id, residence_status, updated_at, name, address, postal_code, city, country, property_designation, tenure, brf_name, brf_org_number, apartment_number';

export interface PropertyWithProjectCount extends PropertyRow {
  /** Projects on this address that are not soft-deleted. */
  liveProjectCount: number;
}

export interface ResolvePropertyInput {
  ownerProfileId: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  propertyDesignation?: string | null;
  /** Used as the property name when there is no usable address. */
  fallbackName: string;
}

/**
 * The grouping key. MUST stay identical to the backfill migration
 * (20260824100100) so a project created today lands on the same property a
 * backfilled sibling did: lower(btrim(address)) | btrim(postal_code).
 *
 * Only exact matches group automatically. Near-matches ("Storg. 5" vs
 * "Storgatan 5") are deliberately left apart — they become merge suggestions,
 * because a wrong grouping lies with numbers on the address summary.
 */
export function propertyAddressKey(
  address: string | null | undefined,
  postalCode: string | null | undefined
): string | null {
  const addr = (address ?? '').trim();
  if (!addr) return null;
  return `${addr.toLowerCase()}|${(postalCode ?? '').trim()}`;
}

/** A human label for an address, falling back to its name. */
export function propertyLabel(p: Pick<PropertyRow, 'name' | 'address' | 'city'>): string {
  const parts = [p.address, p.city].filter(Boolean).join(', ');
  return parts || p.name;
}

/**
 * True when the property actually carries a street address.
 *
 * The backfill named address-less properties after their project, so a home can
 * legitimately be labelled "Kitchen!". That is honest about sparse data but
 * reads as broken unless the UI says so — callers use this to add "no address
 * set" rather than presenting a project name as if it were an address.
 */
export function hasRealAddress(p: Pick<PropertyRow, 'address'>): boolean {
  return Boolean(p.address && p.address.trim());
}

/**
 * Every property the signed-in user may write to. RLS decides the set, so this
 * already includes properties shared to them once membership goes live (S4) —
 * no client-side owner filter on purpose.
 */
export async function listMyProperties(): Promise<PropertyRow[]> {
  const { data, error } = await supabase
    .from('properties')
    .select(PROPERTY_COLUMNS)
    .is('archived_at', null)
    .order('name');

  if (error) {
    console.error('listMyProperties failed:', error);
    return [];
  }
  return data ?? [];
}

/**
 * Properties with a count of their live projects.
 *
 * The count matters for the picker and the address list: after the backfill
 * most users have properties whose only projects are soft-deleted, and those
 * must not present themselves as real addresses.
 */
export async function listMyPropertiesWithCounts(): Promise<PropertyWithProjectCount[]> {
  const properties = await listMyProperties();
  if (properties.length === 0) return [];

  const { data, error } = await supabase
    .from('projects')
    .select('property_id')
    .in('property_id', properties.map((p) => p.id))
    .is('deleted_at', null);

  if (error) {
    console.error('listMyPropertiesWithCounts failed:', error);
    return properties.map((p) => ({ ...p, liveProjectCount: 0 }));
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.property_id) continue;
    counts.set(row.property_id, (counts.get(row.property_id) ?? 0) + 1);
  }
  return properties.map((p) => ({ ...p, liveProjectCount: counts.get(p.id) ?? 0 }));
}

/** How many live projects share this address (used for the card hint). */
export async function countLiveProjectsOnProperty(propertyId: string): Promise<number> {
  const { count, error } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .is('deleted_at', null);

  if (error) {
    console.error('countLiveProjectsOnProperty failed:', error);
    return 0;
  }
  return count ?? 0;
}

export async function createProperty(
  input: ResolvePropertyInput
): Promise<string | null> {
  const address = (input.address ?? '').trim();
  const { data, error } = await supabase
    .from('properties')
    .insert({
      owner_id: input.ownerProfileId,
      name: address || input.fallbackName,
      address: address || null,
      postal_code: (input.postalCode ?? '').trim() || null,
      city: (input.city ?? '').trim() || null,
      country: input.country ?? null,
      property_designation: (input.propertyDesignation ?? '').trim() || null,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('createProperty failed:', error);
    return null;
  }
  return data.id;
}

export interface UpdatePropertyInput {
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  propertyDesignation: string | null;
  /** P2 — omit to leave unchanged; pass null to clear. */
  tenure?: Tenure | null;
  brfName?: string | null;
  brfOrgNumber?: string | null;
  apartmentNumber?: string | null;
}

/**
 * Edit an address's own details.
 *
 * Needed because the backfill named address-less properties after their
 * project ("Kitchen!"), and until now nothing in the app could correct that.
 * It matters beyond cosmetics: `propertyAddressKey` reads the PROPERTY's
 * address, so an address left blank here can never group future projects.
 *
 * RLS decides who may write (owner or admin member) — no client-side check.
 */
export async function updateProperty(
  propertyId: string,
  input: UpdatePropertyInput
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    name: input.name.trim(),
    address: input.address?.trim() || null,
    postal_code: input.postalCode?.trim() || null,
    city: input.city?.trim() || null,
    property_designation: input.propertyDesignation?.trim() || null,
  };
  // P2 fields are optional on the input: a caller that does not know about
  // tenure (the older create/settings paths) must not blank it out.
  if ('tenure' in input) patch.tenure = input.tenure ?? null;
  if ('brfName' in input) patch.brf_name = input.brfName?.trim() || null;
  if ('brfOrgNumber' in input) patch.brf_org_number = input.brfOrgNumber?.trim() || null;
  if ('apartmentNumber' in input) patch.apartment_number = input.apartmentNumber?.trim() || null;

  const { error } = await supabase
    .from('properties')
    .update(patch)
    .eq('id', propertyId);

  if (error) {
    console.error('updateProperty failed:', error);
    return false;
  }
  return true;
}

/**
 * Find the property this project belongs to, creating one when nothing matches.
 *
 * Returns null instead of throwing: callers link best-effort and must keep
 * working when this fails.
 */
export async function resolvePropertyForProject(
  input: ResolvePropertyInput
): Promise<string | null> {
  try {
    const key = propertyAddressKey(input.address, input.postalCode);

    if (key) {
      const existing = await listMyProperties();
      const match = existing.find(
        (p) => propertyAddressKey(p.address, p.postal_code) === key
      );
      if (match) return match.id;
    }

    return await createProperty(input);
  } catch (error) {
    console.error('resolvePropertyForProject failed:', error);
    return null;
  }
}

/**
 * Link a project to a property. Best effort — logs and reports failure rather
 * than throwing, so a creation flow can carry on without its address.
 */
export async function assignProjectToProperty(
  projectId: string,
  propertyId: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .update({ property_id: propertyId })
    .eq('id', projectId);

  if (error) {
    console.error('assignProjectToProperty failed:', error);
    return false;
  }
  return true;
}

/**
 * The whole link step for a freshly created project, in one call.
 * Never throws; returns the property id when it worked.
 */
export async function linkNewProjectToProperty(
  projectId: string,
  input: ResolvePropertyInput
): Promise<string | null> {
  const propertyId = await resolvePropertyForProject(input);
  if (!propertyId) return null;
  const ok = await assignProjectToProperty(projectId, propertyId);
  return ok ? propertyId : null;
}


/**
 * Addresses that look like the same home (S5).
 *
 * The trigger is deliberately narrow: BOTH sides must hold a live project.
 * That is the only situation where the split actually lies — an address page
 * showing part of what a home cost, with nothing on screen saying so. A
 * duplicate whose every project is deleted shows no wrong number, so proposing
 * a merge for it would be tidying dressed up as a warning.
 *
 * Nothing is ever merged automatically; this only produces the question.
 */
export interface MergeSuggestion {
  properties: PropertyWithProjectCount[];
  /** Whose addresses these are — the card needs it to know what it may offer. */
  myProfileId: string;
  /** Addresses the user administers without owning them. */
  adminPropertyIds: Set<string>;
}

export async function findMergeSuggestions(): Promise<MergeSuggestion[]> {
  const [properties, profileId, adminPropertyIds] = await Promise.all([
    listMyPropertiesWithCounts(),
    getMyProfileId(),
    listAdminPropertyIds(),
  ]);
  if (!profileId) return [];

  // Owned OR administered — deliberately including the household case the plan
  // calls the epic's most dangerous bug (§11.3): the partner who was invited as
  // an admin is the only person who can SEE both halves of the split home, so
  // she has to be the one who is offered the fix. Viewers are excluded: read
  // access is not a mandate to reshape someone's address.
  const manageable = properties.filter(
    (p) => p.liveProjectCount > 0 && (p.owner_id === profileId || adminPropertyIds.has(p.id))
  );
  if (manageable.length < 2) return [];

  return groupSimilarAddresses(manageable).map((group) => ({
    properties: group,
    myProfileId: profileId,
    adminPropertyIds,
  }));
}

export async function getMyProfileId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  return data?.id ?? null;
}

/** Addresses the signed-in user administers (accepted admin membership). */
async function listAdminPropertyIds(): Promise<Set<string>> {
  const profileId = await getMyProfileId();
  if (!profileId) return new Set();

  const { data, error } = await supabase
    .from('property_members')
    .select('property_id')
    .eq('member_profile_id', profileId)
    .eq('role', 'admin')
    .not('accepted_at', 'is', null);

  if (error) {
    console.error('listAdminPropertyIds failed:', error);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.property_id));
}

/** The suggestion this address belongs to, or null when it looks unique. */
export async function findMergeGroupFor(propertyId: string): Promise<MergeSuggestion | null> {
  const groups = await findMergeSuggestions();
  return groups.find((g) => g.properties.some((p) => p.id === propertyId)) ?? null;
}

/**
 * Existing addresses that look like the one being typed — used to offer the
 * match BEFORE a duplicate is created, which is cheaper for everyone than
 * merging afterwards.
 */
export function findSimilarProperties<T extends PropertyRow>(
  candidates: T[],
  draft: { address?: string | null; postalCode?: string | null; city?: string | null }
): T[] {
  const probe = {
    address: draft.address ?? null,
    name: null,
    postal_code: draft.postalCode ?? null,
    city: draft.city ?? null,
  };
  return candidates.filter((p) => looksLikeSameAddress(p, probe));
}

/**
 * Fold one address into another: its projects and members move, then it is
 * deleted. Runs as one database transaction (`merge_properties`) — half a merge
 * would split a home's history again, only invisibly this time.
 *
 * Returns the number of projects that moved, or null when the merge failed.
 */
export async function mergeProperties(
  sourceId: string,
  targetId: string
): Promise<number | null> {
  const { data, error } = await supabase.rpc('merge_properties', {
    p_source_id: sourceId,
    p_target_id: targetId,
  });

  if (error) {
    console.error('mergeProperties failed:', error);
    return null;
  }
  return typeof data === 'number' ? data : 0;
}


/**
 * The order addresses belong in: lived in, then unanswered, then left behind.
 *
 * Inside the unanswered middle the most recently touched comes first, so the
 * throwaway addresses a new account creates while poking around sink on their
 * own — without anyone having to label them.
 */
const STATUS_RANK: Record<string, number> = { current: 0, former: 2 };

export function compareByResidence(a: PropertyRow, b: PropertyRow): number {
  const rank = (p: PropertyRow) => STATUS_RANK[p.residence_status ?? ''] ?? 1;
  const byStatus = rank(a) - rank(b);
  if (byStatus !== 0) return byStatus;
  return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
}

/**
 * Record whether the household lives at this address.
 *
 * Always reversible — marking a home as left must never be a one-way door, and
 * `null` puts it back to unanswered rather than inventing a third answer.
 */
export async function setResidenceStatus(
  propertyId: string,
  status: ResidenceStatus | null
): Promise<boolean> {
  const { error } = await supabase
    .from('properties')
    .update({ residence_status: status })
    .eq('id', propertyId);

  if (error) {
    console.error('setResidenceStatus failed:', error);
    return false;
  }
  return true;
}

/**
 * The address a project sits on, with the fields ROT needs, plus the project's
 * own legacy `property_designation` as a fallback.
 *
 * Read-only and unguarded on purpose: a builder on the project must SEE what
 * the ROT claim still needs even though they may not edit the address. Writing
 * is a separate question, answered by `getManageablePropertyForProject`.
 */
export async function getPropertyContextForProject(projectId: string): Promise<{
  property: PropertyRow | null;
  fallbackDesignation: string | null;
  tracksRot: boolean;
} | null> {
  const { data: proj, error } = await supabase
    .from('projects')
    .select('property_id, property_designation, tracks_rot')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !proj) return null;

  const row = proj as { property_id?: string | null; property_designation?: string | null; tracks_rot?: boolean | null };
  let property: PropertyRow | null = null;
  if (row.property_id) {
    const { data } = await supabase
      .from('properties')
      .select(PROPERTY_COLUMNS)
      .eq('id', row.property_id)
      .maybeSingle();
    property = (data as PropertyRow | null) ?? null;
  }
  return {
    property,
    fallbackDesignation: row.property_designation ?? null,
    tracksRot: row.tracks_rot !== false,
  };
}

/**
 * The address this project sits on, IF the person may write to its papers.
 *
 * Returns null for a project without an address, and for anyone below
 * owner/household-admin — the trusted-builder role (S4 insyn) can see a
 * project's files but never the home's. One engine, so "may I move this
 * document to the home?" is answered the same way wherever it is asked.
 */
export async function getManageablePropertyForProject(
  projectId: string
): Promise<{ id: string; name: string } | null> {
  // Two plain reads rather than an embed: PostgREST returns an embedded parent
  // as an object or an array depending on how it reads the relation, and this
  // is not worth a shape guess.
  const { data: proj, error: projError } = await supabase
    .from('projects')
    .select('property_id')
    .eq('id', projectId)
    .maybeSingle();
  if (projError || !proj?.property_id) return null;

  const { data: prop, error: propError } = await supabase
    .from('properties')
    .select('id, name, address, city')
    .eq('id', proj.property_id)
    .maybeSingle();
  if (propError || !prop) return null;

  if (!(await canManageProperty(prop.id))) return null;

  return { id: prop.id, name: propertyLabel(prop) };
}
