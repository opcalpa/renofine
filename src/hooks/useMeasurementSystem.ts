import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MeasurementSystem } from "@/components/floormap/types";
import {
  formatLength,
  formatArea,
  formatCoverage,
  getSystemUnits,
  getSystemDefaultUnit,
  getAreaUnitLabel,
  convertFromMM,
  convertAreaFromMmSq,
  convertAreaFromSqm,
  formatAreaFromSqm,
  formatVolumeFromM3,
} from "@/components/floormap/utils/units";

/**
 * Detect default measurement system from browser locale.
 * US, Myanmar, Liberia use imperial; everyone else metric.
 */
function detectDefaultSystem(): MeasurementSystem {
  const lang = navigator.language || "en";
  const isImperial = /^en-(US|LR|MM)$/i.test(lang);
  return isImperial ? "imperial" : "metric";
}

const STORAGE_KEY = "renofine_measurement_system";

/**
 * Hook providing the user's measurement system preference + formatting helpers.
 *
 * Priority: profile DB → localStorage → browser locale detection.
 */
export function useMeasurementSystem() {
  const [system, setSystem] = useState<MeasurementSystem>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "metric" || stored === "imperial") return stored;
    return detectDefaultSystem();
  });

  // Hydrate from profile on mount
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("measurement_system")
        .eq("user_id", user.id)
        .single();
      if (data?.measurement_system) {
        const ms = data.measurement_system as MeasurementSystem;
        setSystem(ms);
        localStorage.setItem(STORAGE_KEY, ms);
      }
    })();
  }, []);

  const updateSystem = useCallback(async (newSystem: MeasurementSystem) => {
    setSystem(newSystem);
    localStorage.setItem(STORAGE_KEY, newSystem);
    // Persist to profile
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ measurement_system: newSystem } as Record<string, unknown>)
      .eq("user_id", user.id);
  }, []);

  return {
    system,
    updateSystem,
    isImperial: system === "imperial",
    // Formatting helpers bound to current system
    fmtLength: (mm: number) => formatLength(mm, system),
    fmtArea: (mmSq: number) => formatArea(mmSq, system),
    // Area/volume already expressed in m²/m³ (e.g. room.dimensions.area_sqm).
    fmtAreaSqm: (sqm: number, decimals?: number) => formatAreaFromSqm(sqm, system, decimals),
    convertAreaSqm: (sqm: number) => convertAreaFromSqm(sqm, system),
    fmtVolumeM3: (m3: number, decimals?: number) => formatVolumeFromM3(m3, system, decimals),
    fmtCoverage: (sqmPerLiter: number) => formatCoverage(sqmPerLiter, system),
    areaLabel: getAreaUnitLabel(system),
    units: getSystemUnits(system),
    defaultUnit: getSystemDefaultUnit(system),
    convertLength: (mm: number) => convertFromMM(mm, getSystemDefaultUnit(system)),
    convertArea: (mmSq: number) => convertAreaFromMmSq(mmSq, system),
  };
}
