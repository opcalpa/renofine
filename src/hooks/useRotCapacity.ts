import { useEffect, useState } from "react";
import { DEFAULT_ROT_CAPACITY, type RotCapacity } from "@/lib/rot";
import { fetchRotCapacity } from "@/services/rotCapacityService";

/**
 * Projektets ROT-utrymme för dokumentytorna.
 *
 * Returnerar defaulten (en person, årets tak) tills uppslaget svarat, så ett
 * dokument aldrig renderas med ett OTAKAT avdrag ens under laddningen.
 */
export function useRotCapacity(
  projectId: string | null | undefined,
  year?: number,
): RotCapacity {
  const [capacity, setCapacity] = useState<RotCapacity>(DEFAULT_ROT_CAPACITY);

  useEffect(() => {
    let cancelled = false;
    fetchRotCapacity(projectId, year).then((c) => {
      if (!cancelled) setCapacity(c);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, year]);

  return capacity;
}
