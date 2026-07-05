import { supabase } from "@/integrations/supabase/client";

const DEMO_PROJECT_MARKER = "demo_project";

/**
 * Get the user's demo project id, or null if none exists
 */
export async function getDemoProjectId(ownerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("project_type", DEMO_PROJECT_MARKER)
    .limit(1);

  if (error) {
    console.error("Error checking for demo project:", error);
    return null;
  }

  return data?.[0]?.id ?? null;
}

/**
 * Check if a user already has a demo project
 */
export async function hasDemoProject(ownerId: string): Promise<boolean> {
  return (await getDemoProjectId(ownerId)) !== null;
}

/**
 * Seed a demo project for new users (both homeowners and contractors)
 * Uses a database function for reliable seeding that bypasses RLS
 * Returns the project ID if successful, null otherwise
 */
export async function seedDemoProject(ownerId: string, language?: string): Promise<string | null> {
  try {
    // Call the database function to seed the demo project
    const { data, error } = await supabase.rpc("seed_demo_project_for_user", {
      p_owner_id: ownerId,
      p_language: language || navigator.language?.split("-")[0] || "sv",
    });

    if (error) {
      console.error("Error seeding demo project:", error);
      return null;
    }

    return data as string | null;
  } catch (error) {
    console.error("Error seeding demo project:", error);
    return null;
  }
}

/**
 * Check if a project is a demo project (includes both user-specific and public demos)
 */
export function isDemoProject(projectType: string | null | undefined): boolean {
  return projectType === DEMO_PROJECT_MARKER || projectType === 'public_demo';
}

/**
 * Refresh demo project task dates to be relative to today
 * This ensures the timeline always shows relevant example data
 * Only affects demo projects - regular user projects are not touched
 */
export async function refreshDemoProjectDates(ownerId: string): Promise<void> {
  try {
    // The seed function now also updates dates for existing demo projects
    await supabase.rpc("seed_demo_project_for_user", {
      p_owner_id: ownerId,
    });
  } catch (error) {
    // Silent fail - this is a nice-to-have, not critical
    console.error("Error refreshing demo project dates:", error);
  }
}
