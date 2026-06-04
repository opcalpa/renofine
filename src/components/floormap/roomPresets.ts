import { Home, UtensilsCrossed, BedDouble, Bath, DoorOpen, WashingMachine } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface RoomPreset {
  value: string;
  labelKey: string;
  defaultName: string;
  color: string;
  icon: LucideIcon;
}

export const ROOM_PRESETS: RoomPreset[] = [
  { value: "kitchen", labelKey: "roomPresets.kitchen", defaultName: "Kök", color: "#FDE68A", icon: UtensilsCrossed },
  { value: "bedroom", labelKey: "roomPresets.bedroom", defaultName: "Sovrum", color: "#BAE6FD", icon: BedDouble },
  { value: "livingRoom", labelKey: "roomPresets.livingRoom", defaultName: "Vardagsrum", color: "#D9F99D", icon: Home },
  { value: "bathroom", labelKey: "roomPresets.bathroom", defaultName: "Badrum", color: "#C4B5FD", icon: Bath },
  { value: "hallway", labelKey: "roomPresets.hallway", defaultName: "Hall", color: "#FED7AA", icon: DoorOpen },
  { value: "laundry", labelKey: "roomPresets.laundry", defaultName: "Tvättstuga", color: "#A5F3FC", icon: WashingMachine },
];

/**
 * A project room that can be drawn onto the plan. Mirrors the `rooms` table —
 * these are the rooms the user already created for the project (Rumshantering).
 */
export interface ProjectRoomOption {
  id: string;
  name: string;
  color?: string;
}

/**
 * Best-effort color for a room name by matching a known preset (case-insensitive).
 * Lets project rooms inherit a sensible fill even though the rooms table has no color.
 */
export function presetColorForName(name: string): string | undefined {
  const n = name.trim().toLowerCase();
  return ROOM_PRESETS.find(p => p.defaultName.toLowerCase() === n)?.color;
}

/** Best-effort icon for a room name by matching a known preset (case-insensitive). */
export function presetIconForName(name: string): LucideIcon {
  const n = name.trim().toLowerCase();
  return ROOM_PRESETS.find(p => p.defaultName.toLowerCase() === n)?.icon ?? Home;
}
