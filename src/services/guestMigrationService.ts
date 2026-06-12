/**
 * Guest Migration Service
 * Handles migrating guest data from localStorage to Supabase when user logs in
 */

import { supabase } from '@/integrations/supabase/client';
import {
  getAllGuestData,
  clearAllGuestData,
  hasGuestProjectsToMigrate,
  exitGuestMode,
} from './guestStorageService';
import type { MigrationResult, GuestProject } from '@/types/guest.types';

export { hasGuestProjectsToMigrate };

/**
 * Migrate guest onboarding settings (language + user type) to the user's profile.
 * Called after successful login/signup, before project migration.
 */
export async function migrateGuestOnboardingToProfile(profileId: string): Promise<void> {
  const guestUserType = localStorage.getItem("guest_user_type");
  const guestLanguage = localStorage.getItem("i18nextLng");

  const updates: Record<string, unknown> = {};
  if (guestUserType) {
    updates.onboarding_user_type = guestUserType;
    // The guest already picked role + language in the guest welcome flow —
    // don't make them redo it in the post-signup welcome modal.
    updates.onboarding_welcome_completed = true;
  }
  if (guestLanguage) updates.language_preference = guestLanguage;

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", profileId);

  if (error) {
    console.error("Failed to migrate guest onboarding settings:", error);
  }
}

export async function migrateGuestProjects(
  profileId: string,
  projectIdsToMigrate?: string[]
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    migratedProjects: 0,
    migratedRooms: 0,
    migratedTasks: 0,
    newProjectIds: [],
    errors: [],
  };

  try {
    // First migrate onboarding settings
    await migrateGuestOnboardingToProfile(profileId);

    // Get the auth user ID for created_by_user_id
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    const guestData = getAllGuestData();

    // Filter projects if specific IDs are provided
    const projectsToMigrate = projectIdsToMigrate
      ? guestData.projects.filter((p) => projectIdsToMigrate.includes(p.id))
      : guestData.projects;

    if (projectsToMigrate.length === 0) {
      result.success = true;
      return result;
    }

    // Map to track old guest IDs to new database IDs
    const projectIdMap = new Map<string, string>();
    const roomIdMap = new Map<string, string>();

    // Migrate projects
    for (const guestProject of projectsToMigrate) {
      try {
        const { data: newProject, error } = await supabase
          .from('projects')
          .insert({
            name: guestProject.name,
            description: guestProject.description,
            status: guestProject.status || 'planning',
            owner_id: profileId,
            address: guestProject.address,
            postal_code: guestProject.postal_code,
            city: guestProject.city,
            project_type: guestProject.project_type,
            start_date: guestProject.start_date,
            total_budget: guestProject.total_budget,
            currency: 'SEK',
          })
          .select()
          .single();

        if (error) {
          result.errors.push(`Project "${guestProject.name}": ${error.message}`);
          continue;
        }

        projectIdMap.set(guestProject.id, newProject.id);
        result.newProjectIds.push(newProject.id);
        result.migratedProjects++;

        // Migrate rooms for this project
        // Supabase rooms table only has: name, description, dimensions, floor_plan_position
        // Guest rooms have: name, room_type, status, area_sqm, floor_number, notes
        // We map area_sqm into dimensions JSONB and notes into description
        const guestRooms = guestData.rooms[guestProject.id] || [];
        for (const guestRoom of guestRooms) {
          try {
            const dimensions: Record<string, unknown> = {};
            if (guestRoom.area_sqm) {
              dimensions.area_sqm = guestRoom.area_sqm;
            }

            const { data: newRoom, error: roomError } = await supabase
              .from('rooms')
              .insert({
                project_id: newProject.id,
                name: guestRoom.name,
                description: guestRoom.notes,
                dimensions: Object.keys(dimensions).length > 0 ? dimensions : null,
              })
              .select()
              .single();

            if (roomError) {
              result.errors.push(`Room "${guestRoom.name}": ${roomError.message}`);
              continue;
            }

            roomIdMap.set(guestRoom.id, newRoom.id);
            result.migratedRooms++;
          } catch (roomErr) {
            result.errors.push(`Room "${guestRoom.name}": ${(roomErr as Error).message}`);
          }
        }

        // Migrate tasks for this project
        const guestTasks = guestData.tasks[guestProject.id] || [];
        for (const guestTask of guestTasks) {
          try {
            // Map room_id to new ID if it exists
            const newRoomId = guestTask.room_id ? roomIdMap.get(guestTask.room_id) : null;

            const { error: taskError } = await supabase
              .from('tasks')
              .insert({
                project_id: newProject.id,
                room_id: newRoomId || null,
                title: guestTask.title,
                description: guestTask.description,
                status: guestTask.status || 'to_do',
                priority: guestTask.priority || 'medium',
                due_date: guestTask.due_date,
                created_by_user_id: profileId,
              });

            if (taskError) {
              result.errors.push(`Task "${guestTask.title}": ${taskError.message}`);
              continue;
            }

            result.migratedTasks++;
          } catch (taskErr) {
            result.errors.push(`Task "${guestTask.title}": ${(taskErr as Error).message}`);
          }
        }
      } catch (projErr) {
        result.errors.push(`Project "${guestProject.name}": ${(projErr as Error).message}`);
      }
    }

    // If all requested projects were migrated, clear guest data
    if (result.migratedProjects === projectsToMigrate.length) {
      clearAllGuestData();
      exitGuestMode();
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (error) {
    result.errors.push(`Migration failed: ${(error as Error).message}`);
    return result;
  }
}

export function getGuestProjectsForMigration(): GuestProject[] {
  const guestData = getAllGuestData();
  return guestData.projects;
}
