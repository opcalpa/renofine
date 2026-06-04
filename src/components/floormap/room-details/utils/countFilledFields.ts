import type { RoomFormData, FloorSpec, CeilingSpec, WallSpec, JoinerySpec, ElectricalSpec, HeatingSpec } from "../types";

/**
 * Counts filled fields in each section of the room form.
 * Returns an object with { filled, total } for each section.
 */
export function countFilledFields(formData: RoomFormData) {
  // Helper to count non-empty values in an object
  const countFilled = (obj: Record<string, unknown> | undefined, keys: string[]): { filled: number; total: number } => {
    if (!obj) return { filled: 0, total: keys.length };

    let filled = 0;
    for (const key of keys) {
      const value = obj[key];
      if (value !== undefined && value !== null && value !== "" &&
          !(Array.isArray(value) && value.length === 0)) {
        filled++;
      }
    }
    return { filled, total: keys.length };
  };

  // Identity section: name, status, priority, ceiling_height_mm, area, width, depth
  const identity = {
    filled: [
      formData.name,
      formData.status,
      formData.priority && formData.priority !== "medium" ? formData.priority : null,
      formData.ceiling_height_mm,
      formData.area_sqm,
      formData.width_mm,
      formData.depth_mm,
    ].filter((v) => v !== undefined && v !== null && v !== "" && v !== 0).length,
    total: 7,
  };

  // Floor & Ceiling section
  const floorSpec = formData.floor_spec as FloorSpec | undefined;
  const ceilingSpec = formData.ceiling_spec as CeilingSpec | undefined;

  const floorFields = countFilled(floorSpec, ["material", "specification", "treatments", "skirting_type", "skirting_color"]);
  const ceilingFields = countFilled(ceilingSpec, ["material", "color", "molding_type"]);

  const floorCeiling = {
    filled: floorFields.filled + ceilingFields.filled,
    total: floorFields.total + ceilingFields.total,
  };

  // Walls & Joinery section
  const wallSpec = formData.wall_spec as WallSpec | undefined;
  const joinerySpec = formData.joinery_spec as JoinerySpec | undefined;

  const wallFields = countFilled(wallSpec, ["treatments", "main_color", "has_accent_wall", "accent_wall_color"]);
  const joineryFields = countFilled(joinerySpec, ["door_type", "trim_type"]);

  const wallsJoinery = {
    filled: wallFields.filled + joineryFields.filled,
    total: wallFields.total + joineryFields.total,
  };

  // Electrical & Heating section
  const electricalSpec = formData.electrical_spec as ElectricalSpec | undefined;
  const heatingSpec = formData.heating_spec as HeatingSpec | undefined;

  // outlet_types/lighting_types moved to the room_items list (E2); only series is edited here.
  const electricalFields = countFilled(electricalSpec, ["series"]);
  const heatingFields = countFilled(heatingSpec, ["type"]);

  const electricalHeating = {
    filled: electricalFields.filled + heatingFields.filled,
    total: electricalFields.total + heatingFields.total,
  };

  return {
    identity,
    floorCeiling,
    wallsJoinery,
    electricalHeating,
  };
}

/**
 * Returns a summary of all filled specifications for the room.
 * Used in the summary section to show what has been specified.
 */
export function getFilledSummary(formData: RoomFormData): Array<{ category: string; items: string[] }> {
  const summary: Array<{ category: string; items: string[] }> = [];

  // Floor
  const floorSpec = formData.floor_spec as FloorSpec | undefined;
  if (floorSpec) {
    const floorItems: string[] = [];
    if (floorSpec.material) floorItems.push(`material: ${floorSpec.material}`);
    if (floorSpec.specification) floorItems.push(floorSpec.specification);
    if (floorSpec.treatments?.length) floorItems.push(`behandling: ${floorSpec.treatments.join(", ")}`);
    if (floorSpec.skirting_type) floorItems.push(`sockel: ${floorSpec.skirting_type}`);
    if (floorItems.length > 0) {
      summary.push({ category: "floor", items: floorItems });
    }
  }

  // Ceiling
  const ceilingSpec = formData.ceiling_spec as CeilingSpec | undefined;
  if (ceilingSpec) {
    const ceilingItems: string[] = [];
    if (ceilingSpec.material) ceilingItems.push(`material: ${ceilingSpec.material}`);
    if (ceilingSpec.color) ceilingItems.push(`färg: ${ceilingSpec.color}`);
    if (ceilingSpec.molding_type) ceilingItems.push(`taklist: ${ceilingSpec.molding_type}`);
    if (ceilingItems.length > 0) {
      summary.push({ category: "ceiling", items: ceilingItems });
    }
  }

  // Walls
  const wallSpec = formData.wall_spec as WallSpec | undefined;
  if (wallSpec) {
    const wallItems: string[] = [];
    if (wallSpec.treatments?.length) wallItems.push(`behandling: ${wallSpec.treatments.join(", ")}`);
    if (wallSpec.main_color) wallItems.push(`färg: ${wallSpec.main_color}`);
    if (wallSpec.has_accent_wall && wallSpec.accent_wall_color) {
      wallItems.push(`fondvägg: ${wallSpec.accent_wall_color}`);
    }
    if (wallItems.length > 0) {
      summary.push({ category: "walls", items: wallItems });
    }
  }

  // Joinery
  const joinerySpec = formData.joinery_spec as JoinerySpec | undefined;
  if (joinerySpec) {
    const joineryItems: string[] = [];
    if (joinerySpec.door_type) joineryItems.push(`dörr: ${joinerySpec.door_type}`);
    if (joinerySpec.trim_type) joineryItems.push(`lister: ${joinerySpec.trim_type}`);
    if (joineryItems.length > 0) {
      summary.push({ category: "joinery", items: joineryItems });
    }
  }

  // Electrical
  const electricalSpec = formData.electrical_spec as ElectricalSpec | undefined;
  if (electricalSpec) {
    const electricalItems: string[] = [];
    if (electricalSpec.series) electricalItems.push(`serie: ${electricalSpec.series}`);
    if (electricalSpec.outlet_types?.length) electricalItems.push(`uttag: ${electricalSpec.outlet_types.length} typer`);
    if (electricalSpec.lighting_types?.length) electricalItems.push(`belysning: ${electricalSpec.lighting_types.length} typer`);
    if (electricalItems.length > 0) {
      summary.push({ category: "electrical", items: electricalItems });
    }
  }

  // Heating
  const heatingSpec = formData.heating_spec as HeatingSpec | undefined;
  if (heatingSpec?.type) {
    summary.push({ category: "heating", items: [`typ: ${heatingSpec.type}`] });
  }

  return summary;
}
