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
import { groupSimilarAddresses, looksLikeSameAddress } from '@/lib/addressMatch';

export interface PropertyRow {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  property_designation: string | null;
}

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
    .select('id, owner_id, name, address, postal_code, city, country, property_designation')
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
  const { error } = await supabase
    .from('properties')
    .update({
      name: input.name.trim(),
      address: input.address?.trim() || null,
      postal_code: input.postalCode?.trim() || null,
      city: input.city?.trim() || null,
      property_designation: input.propertyDesignation?.trim() || null,
    })
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
export async function findMergeSuggestions(): Promise<PropertyWithProjectCount[][]> {
  const [properties, profileId] = await Promise.all([
    listMyPropertiesWithCounts(),
    getMyProfileId(),
  ]);
  if (!profileId) return [];

  // Own addresses only. An address shared to you as admin can be edited but
  // never merged (`merge_properties` requires ownership of both), and offering
  // a merge that the database will refuse is worse than not offering it.
  const mine = properties.filter((p) => p.owner_id === profileId && p.liveProjectCount > 0);
  if (mine.length < 2) return [];
  return groupSimilarAddresses(mine);
}

async function getMyProfileId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  return data?.id ?? null;
}

/** The group this address belongs to, or null when it looks unique. */
export async function findMergeGroupFor(
  propertyId: string
): Promise<PropertyWithProjectCount[] | null> {
  const groups = await findMergeSuggestions();
  return groups.find((g) => g.some((p) => p.id === propertyId)) ?? null;
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
