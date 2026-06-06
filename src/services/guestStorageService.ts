/**
 * Guest Storage Service
 * Handles localStorage CRUD operations for guest mode data
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  GuestProject,
  GuestRoom,
  GuestTask,
  GuestFloorPlan,
  GuestModeState,
  GuestStorageUsage,
} from '@/types/guest.types';
import { GUEST_MAX_PROJECTS, GUEST_STORAGE_LIMIT } from '@/types/guest.types';

// Storage keys
const KEYS = {
  mode: 'renofine_guest_mode',
  projects: 'renofine_guest_projects',
  rooms: (projectId: string) => `renofine_guest_rooms_${projectId}`,
  tasks: (projectId: string) => `renofine_guest_tasks_${projectId}`,
  floorPlans: (projectId: string) => `renofine_guest_floorplans_${projectId}`,
};

// Helper to safely parse JSON from localStorage
function safeJsonParse<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Helper to safely stringify and save to localStorage
function safeJsonSave(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ============ Guest Mode State ============

export function getGuestModeState(): GuestModeState {
  return safeJsonParse<GuestModeState>(KEYS.mode, { isGuest: false, guestId: null });
}

export function enterGuestMode(): string {
  const guestId = uuidv4();
  const state: GuestModeState = { isGuest: true, guestId };
  safeJsonSave(KEYS.mode, state);
  return guestId;
}

export function exitGuestMode(): void {
  localStorage.removeItem(KEYS.mode);
}

export function isInGuestMode(): boolean {
  return getGuestModeState().isGuest;
}

// ============ Projects ============

export function getGuestProjects(): GuestProject[] {
  return safeJsonParse<GuestProject[]>(KEYS.projects, []);
}

export function getGuestProject(projectId: string): GuestProject | null {
  const projects = getGuestProjects();
  return projects.find((p) => p.id === projectId) || null;
}

export function saveGuestProject(project: Omit<GuestProject, 'id' | 'created_at'>): GuestProject | null {
  const projects = getGuestProjects();

  // Check project limit
  if (projects.length >= GUEST_MAX_PROJECTS) {
    return null;
  }

  const newProject: GuestProject = {
    ...project,
    id: uuidv4(),
    created_at: new Date().toISOString(),
  };

  projects.unshift(newProject); // Add to beginning (most recent first)

  if (safeJsonSave(KEYS.projects, projects)) {
    return newProject;
  }
  return null;
}

export function updateGuestProject(projectId: string, updates: Partial<GuestProject>): GuestProject | null {
  const projects = getGuestProjects();
  const index = projects.findIndex((p) => p.id === projectId);

  if (index === -1) return null;

  projects[index] = { ...projects[index], ...updates };

  if (safeJsonSave(KEYS.projects, projects)) {
    return projects[index];
  }
  return null;
}

export function deleteGuestProject(projectId: string): boolean {
  const projects = getGuestProjects();
  const filtered = projects.filter((p) => p.id !== projectId);

  if (filtered.length === projects.length) return false;

  // Also delete associated rooms, tasks, and floor plans
  localStorage.removeItem(KEYS.rooms(projectId));
  localStorage.removeItem(KEYS.tasks(projectId));
  localStorage.removeItem(KEYS.floorPlans(projectId));

  return safeJsonSave(KEYS.projects, filtered);
}

export function canCreateGuestProject(): boolean {
  return getGuestProjects().length < GUEST_MAX_PROJECTS;
}

// ============ Rooms ============

export function getGuestRooms(projectId: string): GuestRoom[] {
  return safeJsonParse<GuestRoom[]>(KEYS.rooms(projectId), []);
}

export function getGuestRoom(projectId: string, roomId: string): GuestRoom | null {
  const rooms = getGuestRooms(projectId);
  return rooms.find((r) => r.id === roomId) || null;
}

export function saveGuestRoom(projectId: string, room: Omit<GuestRoom, 'id' | 'project_id' | 'created_at'>): GuestRoom | null {
  const rooms = getGuestRooms(projectId);

  const newRoom: GuestRoom = {
    ...room,
    id: uuidv4(),
    project_id: projectId,
    created_at: new Date().toISOString(),
  };

  rooms.push(newRoom);

  if (safeJsonSave(KEYS.rooms(projectId), rooms)) {
    return newRoom;
  }
  return null;
}

export function updateGuestRoom(projectId: string, roomId: string, updates: Partial<GuestRoom>): GuestRoom | null {
  const rooms = getGuestRooms(projectId);
  const index = rooms.findIndex((r) => r.id === roomId);

  if (index === -1) return null;

  rooms[index] = { ...rooms[index], ...updates };

  if (safeJsonSave(KEYS.rooms(projectId), rooms)) {
    return rooms[index];
  }
  return null;
}

export function deleteGuestRoom(projectId: string, roomId: string): boolean {
  const rooms = getGuestRooms(projectId);
  const filtered = rooms.filter((r) => r.id !== roomId);

  if (filtered.length === rooms.length) return false;

  // Also delete associated tasks
  const tasks = getGuestTasks(projectId);
  const filteredTasks = tasks.filter((t) => t.room_id !== roomId);
  safeJsonSave(KEYS.tasks(projectId), filteredTasks);

  return safeJsonSave(KEYS.rooms(projectId), filtered);
}

// ============ Tasks ============

export function getGuestTasks(projectId: string): GuestTask[] {
  return safeJsonParse<GuestTask[]>(KEYS.tasks(projectId), []);
}

export function getGuestTask(projectId: string, taskId: string): GuestTask | null {
  const tasks = getGuestTasks(projectId);
  return tasks.find((t) => t.id === taskId) || null;
}

export function saveGuestTask(projectId: string, task: Omit<GuestTask, 'id' | 'project_id' | 'created_at'>): GuestTask | null {
  const tasks = getGuestTasks(projectId);

  const newTask: GuestTask = {
    ...task,
    id: uuidv4(),
    project_id: projectId,
    created_at: new Date().toISOString(),
  };

  tasks.push(newTask);

  if (safeJsonSave(KEYS.tasks(projectId), tasks)) {
    return newTask;
  }
  return null;
}

export function updateGuestTask(projectId: string, taskId: string, updates: Partial<GuestTask>): GuestTask | null {
  const tasks = getGuestTasks(projectId);
  const index = tasks.findIndex((t) => t.id === taskId);

  if (index === -1) return null;

  tasks[index] = { ...tasks[index], ...updates };

  if (safeJsonSave(KEYS.tasks(projectId), tasks)) {
    return tasks[index];
  }
  return null;
}

export function deleteGuestTask(projectId: string, taskId: string): boolean {
  const tasks = getGuestTasks(projectId);
  const filtered = tasks.filter((t) => t.id !== taskId);

  if (filtered.length === tasks.length) return false;

  return safeJsonSave(KEYS.tasks(projectId), filtered);
}

// ============ Floor Plans ============

export function getGuestFloorPlans(projectId: string): GuestFloorPlan[] {
  return safeJsonParse<GuestFloorPlan[]>(KEYS.floorPlans(projectId), []);
}

export function saveGuestFloorPlan(projectId: string, name: string, shapes: string): GuestFloorPlan | null {
  const plans = getGuestFloorPlans(projectId);

  const newPlan: GuestFloorPlan = {
    id: uuidv4(),
    project_id: projectId,
    name,
    shapes,
    created_at: new Date().toISOString(),
  };

  plans.push(newPlan);

  if (safeJsonSave(KEYS.floorPlans(projectId), plans)) {
    return newPlan;
  }
  return null;
}

export function updateGuestFloorPlan(projectId: string, planId: string, updates: Partial<GuestFloorPlan>): GuestFloorPlan | null {
  const plans = getGuestFloorPlans(projectId);
  const index = plans.findIndex((p) => p.id === planId);

  if (index === -1) return null;

  plans[index] = { ...plans[index], ...updates };

  if (safeJsonSave(KEYS.floorPlans(projectId), plans)) {
    return plans[index];
  }
  return null;
}

// ============ Storage Management ============

export function getStorageUsage(): GuestStorageUsage {
  let used = 0;

  // Calculate total storage used by guest data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('renofine_guest_')) {
      const value = localStorage.getItem(key);
      if (value) {
        used += key.length + value.length;
      }
    }
  }

  // Convert to bytes (rough estimate, UTF-16 uses 2 bytes per character)
  used = used * 2;

  return {
    used,
    limit: GUEST_STORAGE_LIMIT,
    percentage: Math.round((used / GUEST_STORAGE_LIMIT) * 100),
  };
}

export function isNearStorageLimit(): boolean {
  const { percentage } = getStorageUsage();
  return percentage >= 80;
}

export function clearAllGuestData(): void {
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('renofine_guest_')) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

// ============ Migration Helpers ============

export function hasGuestProjectsToMigrate(): boolean {
  const state = getGuestModeState();
  if (!state.isGuest && !state.guestId) return false;

  const projects = getGuestProjects();
  return projects.length > 0;
}

export function getAllGuestData() {
  const projects = getGuestProjects();
  const allRooms: Record<string, GuestRoom[]> = {};
  const allTasks: Record<string, GuestTask[]> = {};
  const allFloorPlans: Record<string, GuestFloorPlan[]> = {};

  projects.forEach((project) => {
    allRooms[project.id] = getGuestRooms(project.id);
    allTasks[project.id] = getGuestTasks(project.id);
    allFloorPlans[project.id] = getGuestFloorPlans(project.id);
  });

  return {
    projects,
    rooms: allRooms,
    tasks: allTasks,
    floorPlans: allFloorPlans,
  };
}

// ============ Guided Setup (guest-local) ============

export interface GuidedSetupGuestInput {
  projectName: string;
  address?: string;
  postalCode?: string;
  city?: string;
  rooms: Array<{
    name: string;
    area_sqm?: number;
    width_mm?: number;
    height_mm?: number;
    ceiling_height_mm?: number;
  }>;
  tasks: Array<{
    workTypeLabel: string;
    roomName: string | null;
  }>;
}

/**
 * Guest-local equivalent of createProjectFromGuidedSetup — builds a project,
 * its rooms and tasks in localStorage so guests get the full guided wizard
 * before signing up. The existing guest→account migration handles the rest.
 * Returns null when the guest project limit is reached.
 */
export function createGuestProjectFromGuidedSetup(
  input: GuidedSetupGuestInput
): { projectId: string } | null {
  const project = saveGuestProject({
    name: input.projectName || 'My renovation',
    description: null,
    status: 'planning',
    address: input.address || null,
    postal_code: input.postalCode || null,
    city: input.city || null,
    project_type: null,
    start_date: null,
    finish_goal_date: null,
    total_budget: null,
  });

  if (!project) return null;

  const roomNameToId: Record<string, string> = {};
  for (const room of input.rooms) {
    const savedRoom = saveGuestRoom(project.id, {
      name: room.name,
      room_type: null,
      status: 'existing',
      area_sqm: room.area_sqm ?? null,
      floor_number: null,
      notes: null,
      width_mm: room.width_mm ?? null,
      height_mm: room.height_mm ?? null,
      ceiling_height_mm: room.ceiling_height_mm ?? null,
    });
    if (savedRoom) roomNameToId[room.name.toLowerCase()] = savedRoom.id;
  }

  for (const task of input.tasks) {
    const roomId = task.roomName ? roomNameToId[task.roomName.toLowerCase()] || null : null;
    saveGuestTask(project.id, {
      room_id: roomId,
      title: task.workTypeLabel,
      description: null,
      status: 'to_do',
      priority: null,
      due_date: null,
    });
  }

  return { projectId: project.id };
}

// Storage keys export for migration service
export const GUEST_STORAGE_KEYS = KEYS;
