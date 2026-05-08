import {
  ChefHat,
  Bath,
  Sofa,
  Bed,
  DoorOpen,
  Box,
  Briefcase,
  WashingMachine,
  Shirt,
  Trees,
  Car,
  ArrowDownToLine,
  ArrowUpToLine,
  Utensils,
  Users,
  Gamepad2,
  Home,
  type LucideIcon,
} from "lucide-react";

interface RoomTypeMatch {
  icon: LucideIcon;
  /** lower-case keywords (Swedish + English) that imply this type */
  match: string[];
}

// Order matters: more specific keywords first (kök before kontor for "köksö-kontor")
const ROOM_TYPE_TABLE: RoomTypeMatch[] = [
  { icon: ChefHat, match: ["kök", "kitchen", "kokvrå", "kitchenette"] },
  { icon: Bath, match: ["badrum", "bathroom", "bath", "wc", "toalett", "toilet", "duschrum", "dusch"] },
  { icon: Bed, match: ["sovrum", "bedroom", "barnrum", "kid", "childroom"] },
  { icon: Sofa, match: ["vardagsrum", "living", "tv-rum", "lounge", "salong"] },
  { icon: Utensils, match: ["matsal", "dining", "matplats"] },
  { icon: Users, match: ["familjerum", "family", "allrum"] },
  { icon: Gamepad2, match: ["lekrum", "playroom"] },
  { icon: DoorOpen, match: ["entré", "entry", "entrance", "hall", "hallway", "korridor", "vestibul"] },
  { icon: Briefcase, match: ["kontor", "office", "arbetsrum", "study"] },
  { icon: WashingMachine, match: ["tvättstuga", "tvätt", "laundry"] },
  { icon: Shirt, match: ["klädkammare", "walk-in", "garderob", "closet", "wardrobe"] },
  { icon: Box, match: ["förråd", "storage", "skåp"] },
  { icon: Car, match: ["garage", "carport"] },
  { icon: ArrowDownToLine, match: ["källare", "basement"] },
  { icon: ArrowUpToLine, match: ["vind", "loft", "attic"] },
  { icon: Trees, match: ["altan", "patio", "balkong", "balcony", "uteplats"] },
  { icon: Home, match: ["gäst", "guest"] },
];

const FALLBACK_ICON = Home;

export function getRoomTypeIcon(name: string | null | undefined): LucideIcon {
  if (!name) return FALLBACK_ICON;
  const n = name.toLowerCase();
  for (const row of ROOM_TYPE_TABLE) {
    if (row.match.some((kw) => n.includes(kw))) return row.icon;
  }
  return FALLBACK_ICON;
}
