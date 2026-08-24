/**
 * What ROT asks for at this project's home, loaded once (P2).
 *
 * Shared by the block that shows it and by the readiness check that counts it,
 * so "ROT-uppgifter klara" and the list under it can never disagree — the bug
 * this replaces was exactly that kind of split: the check asked for a
 * fastighetsbeteckning from everyone, including the bostadsrätt owners who
 * cannot have one.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getPropertyContextForProject,
  type PropertyRow,
} from '@/services/propertyService';
import { canManageProperty } from '@/services/propertyMemberService';
import { rotIdentifierStatus, type RotIdentifierStatus } from '@/lib/rotIdentifiers';

export interface RotIdentifiersState {
  loaded: boolean;
  /** The address this project sits on, or null when it has none. */
  property: PropertyRow | null;
  /** Whether this person may write to the address (owner or household admin). */
  canManage: boolean;
  tracksRot: boolean;
  status: RotIdentifierStatus;
  reload: () => Promise<void>;
}

export function useRotIdentifiers(projectId: string | null | undefined): RotIdentifiersState {
  const [loaded, setLoaded] = useState(false);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [fallbackDesignation, setFallbackDesignation] = useState<string | null>(null);
  const [tracksRot, setTracksRot] = useState(true);
  const [canManage, setCanManage] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) {
      setLoaded(true);
      return;
    }
    const context = await getPropertyContextForProject(projectId);
    if (!context) {
      setLoaded(true);
      return;
    }
    setProperty(context.property);
    setFallbackDesignation(context.fallbackDesignation);
    setTracksRot(context.tracksRot);
    setCanManage(context.property ? await canManageProperty(context.property.id) : false);
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return {
    loaded,
    property,
    canManage,
    tracksRot,
    status: rotIdentifierStatus(property, fallbackDesignation),
    reload,
  };
}
