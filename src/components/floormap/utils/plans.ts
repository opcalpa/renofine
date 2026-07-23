import { supabase } from '@/integrations/supabase/client';
import { FloorMapPlan, FloorMapShape } from '../types';
import { toast } from 'sonner';
import {
  saveShapesToLocalStorage,
  loadShapesFromLocalStorage,
  savePlansToLocalStorage,
  loadPlansFromLocalStorage,
  isOnline,
} from './localStorage';

/**
 * Load all plans for a project
 */
export const loadPlansFromDB = async (projectId: string): Promise<FloorMapPlan[]> => {
  try {
    // Try loading from database if online
    if (isOnline()) {
      const { data, error } = await (supabase as any)
        .from('floor_map_plans')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const plans = (data || []).map((dbPlan: any) => ({
        id: dbPlan.id,
        projectId: dbPlan.project_id,
        name: dbPlan.name,
        isDefault: dbPlan.is_default,
        viewSettings: dbPlan.view_settings,
        createdAt: dbPlan.created_at,
        updatedAt: dbPlan.updated_at,
      }));

      // Cache to localStorage
      savePlansToLocalStorage(projectId, plans);
      return plans;
    } else {
      // Load from localStorage if offline
      const cachedPlans = loadPlansFromLocalStorage(projectId);
      if (cachedPlans) {
        toast.info('Loaded from offline cache');
        return cachedPlans;
      }
      return [];
    }
  } catch (error) {
    console.error('Error loading plans:', error);
    
    // Fallback to localStorage on error
    const cachedPlans = loadPlansFromLocalStorage(projectId);
    if (cachedPlans) {
      toast.warning('Using offline cache due to connection error');
      return cachedPlans;
    }
    
    toast.error('Failed to load floor plans');
    return [];
  }
};

/**
 * Create a new plan
 */
export const createPlanInDB = async (
  projectId: string,
  name: string
): Promise<FloorMapPlan | null> => {
  try {
    const { data, error } = await (supabase as any)
      .from('floor_map_plans')
      .insert({
        project_id: projectId,
        name,
        is_default: false,
      })
      .select()
      .single();

    if (error) throw error;

    toast.success('Floor plan created');
    return {
      id: data.id,
      projectId: data.project_id,
      name: data.name,
      isDefault: data.is_default,
      viewSettings: data.view_settings,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error('Error creating plan:', error);
    toast.error('Failed to create floor plan');
    return null;
  }
};

/**
 * Update plan details
 */
export const updatePlanInDB = async (
  planId: string,
  updates: Partial<FloorMapPlan>
): Promise<boolean> => {
  try {
    const dbUpdates: any = {};
    
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.isDefault !== undefined) dbUpdates.is_default = updates.isDefault;
    if (updates.viewSettings !== undefined) dbUpdates.view_settings = updates.viewSettings;

    const { error } = await (supabase as any)
      .from('floor_map_plans')
      .update(dbUpdates)
      .eq('id', planId);

    if (error) throw error;

    toast.success('Floor plan updated');
    return true;
  } catch (error) {
    console.error('Error updating plan:', error);
    toast.error('Failed to update floor plan');
    return false;
  }
};

/**
 * Delete a plan
 */
export const deletePlanFromDB = async (planId: string): Promise<boolean> => {
  try {
    const { error } = await (supabase as any)
      .from('floor_map_plans')
      .delete()
      .eq('id', planId);

    if (error) throw error;

    toast.success('Floor plan deleted');
    return true;
  } catch (error) {
    console.error('Error deleting plan:', error);
    toast.error('Failed to delete floor plan');
    return false;
  }
};

/**
 * Set a plan as default
 */
export const setDefaultPlan = async (
  projectId: string,
  planId: string
): Promise<boolean> => {
  try {
    // First, unset all defaults for this project
    await (supabase as any)
      .from('floor_map_plans')
      .update({ is_default: false })
      .eq('project_id', projectId);

    // Then set the new default
    const { error } = await (supabase as any)
      .from('floor_map_plans')
      .update({ is_default: true })
      .eq('id', planId);

    if (error) throw error;

    toast.success('Default plan set');
    return true;
  } catch (error) {
    console.error('Error setting default plan:', error);
    toast.error('Failed to set default plan');
    return false;
  }
};

/**
 * Load shapes for a specific plan
 */
export const loadShapesForPlan = async (planId: string): Promise<FloorMapShape[]> => {
  // Loading shapes for plan
  
  try {
    // Try loading from database if online
    if (isOnline()) {
      // Fetching from database
      const { data, error } = await (supabase as any)
        .from('floor_map_shapes')
        .select('*')
        .eq('plan_id', planId);

      if (error) {
        console.error('❌ Error loading shapes from database:', error);
        throw error;
      }

      const shapes = (data || []).map((dbShape: any) => ({
        id: dbShape.id,
        type: dbShape.shape_type,
        planId: dbShape.plan_id,
        coordinates: dbShape.shape_data?.points || dbShape.shape_data?.coordinates || {},
        color: dbShape.color || dbShape.shape_data?.fillColor,
        strokeColor: dbShape.stroke_color || dbShape.shape_data?.strokeColor,
        fillColor: dbShape.shape_data?.fillColor,
        text: dbShape.shape_data?.text,
        thicknessMM: dbShape.shape_data?.thicknessMM,
        heightMM: dbShape.shape_data?.heightMM,
        name: dbShape.shape_data?.name,
        roomId: dbShape.room_id,
        symbolType: dbShape.shape_data?.symbolType,
        metadata: dbShape.shape_data?.metadata,
        // Image-specific properties
        imageUrl: dbShape.shape_data?.imageUrl,
        imageOpacity: dbShape.shape_data?.imageOpacity,
        locked: dbShape.shape_data?.locked,
        zIndex: dbShape.shape_data?.zIndex,
        // View mode property
        shapeViewMode: dbShape.shape_data?.shapeViewMode,
        // Parent wall reference for elevation shapes
        parentWallId: dbShape.shape_data?.parentWallId,
        // Notes
        notes: dbShape.shape_data?.notes,
        // Material properties
        material: dbShape.shape_data?.material,
        materialSpec: dbShape.shape_data?.materialSpec,
        treatment: dbShape.shape_data?.treatment,
        treatmentColor: dbShape.shape_data?.treatmentColor,
        manufacturer: dbShape.shape_data?.manufacturer,
        productCode: dbShape.shape_data?.productCode,
        // Wall-relative positioning (for elevation objects like outlets, switches)
        wallRelative: dbShape.shape_data?.wallRelative,
        // Rotation + object/opening fields; rotation falls back to the copy
        // in metadata for rows saved while the top-level field was dropped
        rotation: dbShape.shape_data?.rotation ?? dbShape.shape_data?.metadata?.rotation,
        objectCategory: dbShape.shape_data?.objectCategory,
        openingKind: dbShape.shape_data?.openingKind,
        positionOnWall: dbShape.shape_data?.positionOnWall,
        openingDirection: dbShape.shape_data?.openingDirection,
        area: dbShape.shape_data?.area,
        surfaceTint: dbShape.shape_data?.surfaceTint,
      }));

      // Mapped shapes successfully

      // Cache to localStorage
      saveShapesToLocalStorage(planId, shapes);
      return shapes;
    } else {
      // Load from localStorage if offline
      const cachedShapes = loadShapesFromLocalStorage(planId);
      if (cachedShapes) {
        toast.info('Loaded shapes from offline cache');
        return cachedShapes;
      }
      return [];
    }
  } catch (error) {
    console.error('Error loading shapes for plan:', error);
    
    // Fallback to localStorage on error
    const cachedShapes = loadShapesFromLocalStorage(planId);
    if (cachedShapes) {
      toast.warning('Using offline cache due to connection error');
      return cachedShapes;
    }
    
    return [];
  }
};

/**
 * Save shapes for a specific plan
 */
export const saveShapesForPlan = async (
  planId: string,
  shapes: FloorMapShape[]
): Promise<boolean> => {
  // Saving shapes for plan
  
  // Always save to localStorage first (instant feedback)
  saveShapesToLocalStorage(planId, shapes);

  // If offline, inform user and return success
  if (!isOnline()) {
    // Offline mode, skipping database save
    toast.warning('Changes saved offline. Will sync when back online.');
    return true;
  }

  try {
    // Get the project_id from the plan first (required for RLS)
    const { data: planData, error: planError } = await (supabase as any)
      .from('floor_map_plans')
      .select('project_id')
      .eq('id', planId)
      .single();

    if (planError) {
      console.error('❌ Error fetching plan:', planError);
      throw planError;
    }
    if (!planData?.project_id) {
      console.error('❌ Plan not found or missing project_id');
      throw new Error('Plan not found or missing project_id');
    }
    
    // Found project_id

    // Upsert shapes (UPDATE existing or INSERT new) - much safer than DELETE + INSERT
    if (shapes.length > 0) {
      const shapesToUpsert = shapes.map((shape) => ({
        id: shape.id,
        project_id: planData.project_id, // CRITICAL: Required for RLS
        plan_id: planId,
        shape_type: shape.type,
        color: shape.color || null,
        stroke_color: shape.strokeColor || null,
        shape_data: {
          coordinates: shape.coordinates,
          points: shape.coordinates, // Legacy compatibility
          strokeColor: shape.strokeColor,
          fillColor: shape.fillColor,
          text: shape.text,
          thicknessMM: shape.thicknessMM,
          heightMM: shape.heightMM,
          name: shape.name,
          notes: shape.notes,
          symbolType: shape.symbolType,
          metadata: shape.metadata,
          // Image-specific properties
          imageUrl: shape.imageUrl,
          imageOpacity: shape.imageOpacity,
          locked: shape.locked,
          zIndex: shape.zIndex,
          // View mode property
          shapeViewMode: shape.shapeViewMode,
          // Parent wall reference for elevation shapes
          parentWallId: shape.parentWallId,
          // Material properties
          material: shape.material,
          materialSpec: shape.materialSpec,
          treatment: shape.treatment,
          treatmentColor: shape.treatmentColor,
          manufacturer: shape.manufacturer,
          productCode: shape.productCode,
          // Wall-relative positioning (for elevation objects like outlets, switches)
          wallRelative: shape.wallRelative,
          // Rotation + object/opening fields (dropped before 2026-07 — losing
          // rotation made wall-snapped objects "lie down" after a reload)
          rotation: shape.rotation,
          objectCategory: shape.objectCategory,
          openingKind: shape.openingKind,
          positionOnWall: shape.positionOnWall,
          openingDirection: shape.openingDirection,
          area: shape.area,
          surfaceTint: shape.surfaceTint,
        },
        room_id: shape.roomId || null,
      }));

      const { error: upsertError } = await (supabase as any)
        .from('floor_map_shapes')
        .upsert(shapesToUpsert, { 
          onConflict: 'id',  // Use ID as unique key
          ignoreDuplicates: false  // Update existing rows
        });

      if (upsertError) {
        console.error('❌ Error upserting shapes:', upsertError);
        throw upsertError;
      }
      // Upserted shapes successfully
      
      // Clean up: Delete shapes that are in DB but not in our current state
      // This handles shapes that were deleted in the UI
      const currentShapeIds = shapes.map(s => s.id);
      // Cleaning up deleted shapes

      // First, get all shapes in DB for this plan (including room_id so we can clear floor_plan_position)
      const { data: dbShapes } = await (supabase as any)
        .from('floor_map_shapes')
        .select('id, room_id')
        .eq('plan_id', planId);

      if (dbShapes && dbShapes.length > 0) {
        const shapesToDelete = dbShapes.filter((s: any) => !currentShapeIds.includes(s.id));

        if (shapesToDelete.length > 0) {
          const idsToDelete = shapesToDelete.map((s: any) => s.id);
          const { error: cleanupError } = await (supabase as any)
            .from('floor_map_shapes')
            .delete()
            .in('id', idsToDelete);

          if (cleanupError) {
            // Non-critical cleanup error - don't throw
          }

          // Clear floor_plan_position on rooms whose shapes were deleted
          const roomIdsToClear = shapesToDelete
            .filter((s: any) => s.room_id)
            .map((s: any) => s.room_id);
          if (roomIdsToClear.length > 0) {
            await (supabase as any)
              .from('rooms')
              .update({ floor_plan_position: null })
              .in('id', roomIdsToClear);
          }
        }
      }
    } else {
      // No shapes = delete all shapes for this plan
      // First get room_ids to clear before deleting
      const { data: remainingShapes } = await (supabase as any)
        .from('floor_map_shapes')
        .select('room_id')
        .eq('plan_id', planId);

      const { error: deleteError } = await (supabase as any)
        .from('floor_map_shapes')
        .delete()
        .eq('plan_id', planId);

      if (deleteError) {
        throw deleteError;
      }

      // Clear floor_plan_position on all affected rooms
      const roomIdsToClear = (remainingShapes || [])
        .filter((s: any) => s.room_id)
        .map((s: any) => s.room_id);
      if (roomIdsToClear.length > 0) {
        await (supabase as any)
          .from('rooms')
          .update({ floor_plan_position: null })
          .in('id', roomIdsToClear);
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Error saving shapes for plan:', error);
    toast.warning('Saved offline. Changes will sync when connection is restored.');
    return true; // Return true since we saved to localStorage
  }
};

/**
 * Merge multiple plans into one
 */
export const mergePlans = async (
  projectId: string,
  planIds: string[],
  newName: string
): Promise<FloorMapPlan | null> => {
  try {
    // Load all shapes from all selected plans
    const allShapes: FloorMapShape[] = [];
    
    for (const planId of planIds) {
      const shapes = await loadShapesForPlan(planId);
      allShapes.push(...shapes);
    }

    // Create new plan
    const newPlan = await createPlanInDB(projectId, newName);
    if (!newPlan) return null;

    // Save all merged shapes to the new plan
    await saveShapesForPlan(newPlan.id, allShapes);

    toast.success(`Merged ${planIds.length} plans into "${newName}"`);
    return newPlan;
  } catch (error) {
    console.error('Error merging plans:', error);
    toast.error('Failed to merge plans');
    return null;
  }
};
