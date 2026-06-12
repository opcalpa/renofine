/**
 * Guest Mode Types
 * Types for managing guest user data stored in localStorage
 */

export interface GuestProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  project_type?: string | null;
  total_budget?: number | null;
  start_date?: string | null;
  finish_goal_date?: string | null;
}

export interface GuestRoom {
  id: string;
  project_id: string;
  name: string;
  room_type: string | null;
  status: string;
  area_sqm: number | null;
  floor_number: number | null;
  notes: string | null;
  created_at: string;
  // Dimension fields for inline editing (matching Supabase Room model)
  width_mm: number | null;
  height_mm: number | null;  // depth
  ceiling_height_mm: number | null;
}

export interface GuestTask {
  id: string;
  project_id: string;
  room_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  created_at: string;
}

export interface GuestFloorPlan {
  id: string;
  project_id: string;
  name: string;
  shapes: string; // JSON stringified FloorMapShape[]
  created_at: string;
}

export interface GuestModeState {
  isGuest: boolean;
  guestId: string | null;
}

export interface GuestStorageUsage {
  used: number;
  limit: number;
  percentage: number;
}

export interface MigrationResult {
  success: boolean;
  migratedProjects: number;
  migratedRooms: number;
  migratedTasks: number;
  newProjectIds: string[];
  errors: string[];
}

export const GUEST_MAX_PROJECTS = 3;
export const GUEST_STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB in bytes
