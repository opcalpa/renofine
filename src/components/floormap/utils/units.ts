import { Unit, MeasurementSystem } from '../types';

// Conversion factors to mm
const UNIT_TO_MM: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4,
  ft: 304.8,
  yd: 914.4,
};

// Conversion factors from mm
const MM_TO_UNIT: Record<Unit, number> = {
  mm: 1,
  cm: 0.1,
  m: 0.001,
  inch: 1 / 25.4,
  ft: 1 / 304.8,
  yd: 1 / 914.4,
};

/**
 * Convert from mm to specified unit
 */
export const convertFromMM = (valueMM: number, toUnit: Unit): number => {
  return valueMM * MM_TO_UNIT[toUnit];
};

/**
 * Convert from specified unit to mm
 */
export const convertToMM = (value: number, fromUnit: Unit): number => {
  return value * UNIT_TO_MM[fromUnit];
};

/**
 * Format value with unit
 */
export const formatWithUnit = (valueMM: number, unit: Unit, decimals: number = 1): string => {
  const converted = convertFromMM(valueMM, unit);
  return `${converted.toFixed(decimals)} ${getUnitLabel(unit)}`;
};

/**
 * Get short unit label for display
 */
export const getUnitLabel = (unit: Unit): string => {
  const labels: Record<Unit, string> = {
    mm: 'mm',
    cm: 'cm',
    m: 'm',
    inch: 'in',
    ft: 'ft',
    yd: 'yd',
  };
  return labels[unit];
};

/**
 * Get unit display name (full)
 */
export const getUnitDisplayName = (unit: Unit): string => {
  const names: Record<Unit, string> = {
    mm: 'Millimeters',
    cm: 'Centimeters',
    m: 'Meters',
    inch: 'Inches',
    ft: 'Feet',
    yd: 'Yards',
  };
  return names[unit];
};

/**
 * Get default grid size for unit (in mm)
 */
export const getDefaultGridSize = (unit: Unit): number => {
  const defaults: Record<Unit, number> = {
    mm: 100,      // 100mm
    cm: 100,      // 10cm
    m: 1000,      // 1m
    inch: 25.4,   // 1 inch
    ft: 304.8,    // 1 foot
    yd: 914.4,    // 1 yard
  };
  return defaults[unit];
};

/**
 * Get available units for a measurement system
 */
export const getSystemUnits = (system: MeasurementSystem): Unit[] => {
  return system === 'imperial' ? ['inch', 'ft', 'yd'] : ['mm', 'cm', 'm'];
};

/**
 * Get default unit for a measurement system
 */
export const getSystemDefaultUnit = (system: MeasurementSystem): Unit => {
  return system === 'imperial' ? 'ft' : 'mm';
};

// ── Area conversion ──

const SQ_MM_TO_SQ_M = 1e-6;
const SQ_MM_TO_SQ_FT = 1.07639e-5;
const SQ_M_TO_SQ_FT = 10.7639;

/**
 * Format area (input in mm²) for display
 */
export const formatArea = (areaMmSq: number, system: MeasurementSystem): string => {
  if (system === 'imperial') {
    const sqFt = areaMmSq * SQ_MM_TO_SQ_FT;
    return `${sqFt.toFixed(1)} sq ft`;
  }
  const sqM = areaMmSq * SQ_MM_TO_SQ_M;
  return `${sqM.toFixed(1)} m²`;
};

/**
 * Convert area from mm² to display unit value
 */
export const convertAreaFromMmSq = (areaMmSq: number, system: MeasurementSystem): number => {
  return system === 'imperial' ? areaMmSq * SQ_MM_TO_SQ_FT : areaMmSq * SQ_MM_TO_SQ_M;
};

/**
 * Convert an area already expressed in m² (e.g. room.dimensions.area_sqm)
 * to the display unit value (m² stays m², imperial → sq ft).
 */
export const convertAreaFromSqm = (areaSqm: number, system: MeasurementSystem): number => {
  return system === 'imperial' ? areaSqm * SQ_M_TO_SQ_FT : areaSqm;
};

/**
 * Format an area given in m² for display in the active system.
 * Fixes the "imperial label on a raw m² number" class of bug — always
 * convert the value, never just swap the unit label.
 */
export const formatAreaFromSqm = (
  areaSqm: number,
  system: MeasurementSystem,
  decimals: number = 1,
): string => {
  const value = convertAreaFromSqm(areaSqm, system);
  return `${value.toFixed(decimals)} ${getAreaUnitLabel(system)}`;
};

/**
 * Get area unit label
 */
export const getAreaUnitLabel = (system: MeasurementSystem): string => {
  return system === 'imperial' ? 'sq ft' : 'm²';
};

// ── Volume conversion ──

const CU_M_TO_CU_FT = 35.3147;

/** Get volume unit label */
export const getVolumeUnitLabel = (system: MeasurementSystem): string => {
  return system === 'imperial' ? 'ft³' : 'm³';
};

/**
 * Format a volume given in m³ for display in the active system.
 * (m³ stays m³, imperial → ft³.)
 */
export const formatVolumeFromM3 = (
  volumeM3: number,
  system: MeasurementSystem,
  decimals: number = 1,
): string => {
  const value = system === 'imperial' ? volumeM3 * CU_M_TO_CU_FT : volumeM3;
  return `${value.toFixed(decimals)} ${getVolumeUnitLabel(system)}`;
};

// ── Smart length formatting (auto-picks best unit) ──

/**
 * Format a length in mm using the best unit for the measurement system.
 * Metric: mm < 10 → mm, < 1000 → cm, else → m
 * Imperial: < 1 ft → in, < 100 ft → ft + in, else → ft
 */
export const formatLength = (valueMM: number, system: MeasurementSystem): string => {
  if (system === 'imperial') {
    const totalInches = valueMM / 25.4;
    if (totalInches < 12) {
      return `${totalInches.toFixed(1)} in`;
    }
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    if (inches < 0.1) {
      return `${feet} ft`;
    }
    return `${feet}' ${Math.round(inches)}"`;
  }

  // Metric
  if (valueMM < 10) return `${valueMM.toFixed(1)} mm`;
  if (valueMM < 1000) return `${(valueMM / 10).toFixed(1)} cm`;
  return `${(valueMM / 1000).toFixed(2)} m`;
};

// ── Coverage conversion (paint etc.) ──

/**
 * Convert coverage rate between systems.
 * Metric: m²/L, Imperial: sq ft/gallon (1 gallon = 3.78541 L)
 */
export const formatCoverage = (sqmPerLiter: number, system: MeasurementSystem): string => {
  if (system === 'imperial') {
    // 1 m² = 10.7639 sq ft, 1 gallon = 3.78541 L
    const sqFtPerGallon = sqmPerLiter * 10.7639 * 3.78541;
    return `${Math.round(sqFtPerGallon)} sq ft/gal`;
  }
  return `${sqmPerLiter.toFixed(1)} m²/L`;
};
