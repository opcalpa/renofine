// ---------------------------------------------------------------------------
// Shared types and constants for the Inspiration feature
// ---------------------------------------------------------------------------

export interface InspirationSectionProps {
  projectId: string;
  currency: string;
  isPlanning?: boolean;
}

export type DisplaySize = "sm" | "md" | "lg";
export type CropPosition =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top left"
  | "top right"
  | "bottom left"
  | "bottom right";
export type FitMode = "cover" | "contain";
export type CropShape = "landscape" | "square" | "portrait" | "circle";

export interface InspoPhoto {
  id: string;
  url: string;
  caption: string | null;
  source: string;
  sourceUrl: string | null;
  roomId: string | null;
  roomName: string | null;
  displaySize: DisplaySize;
  sortOrder: number;
  cropPosition: CropPosition;
  fitMode: FitMode;
  cropZoom: number;
  cropOffsetX: number;
  cropOffsetY: number;
  cropShape: CropShape;
  gridColSpan: number;
  gridRowSpan: number;
}

export interface InspoRoom {
  id: string;
  name: string;
}

export interface MaterialCard {
  id: string;
  name: string;
  price: number;
  roomId: string | null;
  roomName: string | null;
  photoUrl: string | null;
}

export const BA_SOURCES = new Set(["before", "during", "after"]);

export const MOODBOARD_BACKGROUNDS = [
  { id: "white", color: "#ffffff", label: "Pure White" },
  { id: "linen", color: "#F3EDE4", label: "Warm Linen" },
  { id: "greige", color: "#D6CFC7", label: "Soft Greige" },
  { id: "sage", color: "#C5CDB0", label: "Pale Sage" },
  { id: "mauve", color: "#C4AEAD", label: "Dusty Mauve" },
  { id: "charcoal", color: "#4A4A48", label: "Warm Charcoal" },
  { id: "navy", color: "#1E2A3A", label: "Deep Navy" },
  { id: "black", color: "#141414", label: "Rich Black" },
] as const;

export const hexLuminance = (hex: string) => {
  const h = hex.replace("#", "");
  return (
    (parseInt(h.substring(0, 2), 16) || 0) * 0.299 +
    (parseInt(h.substring(2, 4), 16) || 0) * 0.587 +
    (parseInt(h.substring(4, 6), 16) || 0) * 0.114
  );
};

/** Extract stable storage path from Supabase URL for consistent comment threading. */
export function stablePhotoEntityId(
  url: string,
  fallbackId: string,
): string {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/projects\/[a-f0-9-]+\/(.+)/);
    if (match) return `photo:${match[1]}`;
  } catch {
    /* use fallback */
  }
  return fallbackId;
}
