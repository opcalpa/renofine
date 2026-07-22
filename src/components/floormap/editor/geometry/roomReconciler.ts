/**
 * Room reconciliation — keeps room shapes in sync with the wall graph.
 *
 * After any wall mutation, detected faces (closed wall loops) are matched
 * against existing room shapes: matched rooms get their polygon and area
 * updated in place (id/roomId/name survive → the rooms-table bridge and
 * room_items links stay intact), new faces become new auto-rooms, and
 * auto-rooms whose loop disappeared are flagged detached — never deleted,
 * so no estimation data is silently lost.
 */

import { v4 as uuidv4 } from 'uuid';
import { FloorMapShape, PolygonCoordinates } from '../../types';
import { useFloorMapStore } from '../../store';
import { Patch, makeUpdatePatch } from '../core/patches';
import { getWallGraph, Face } from './wallGraph';
import { worldToMm } from '../core/units';

interface Point {
  x: number;
  y: number;
}

const MIN_ROOM_M2 = 0.5;

function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonsEqual(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => Math.abs(p.x - b[i].x) < 0.01 && Math.abs(p.y - b[i].y) < 0.01);
}

function faceAreaM2(face: Face): number {
  const mm2 = worldToMm(1) * worldToMm(1) * face.area;
  return mm2 / 1_000_000;
}

/**
 * Compute patches that bring room shapes in line with the current wall
 * faces. Pure with respect to the store — the executor applies the patches.
 */
export function buildRoomReconcilePatches(shapes: FloorMapShape[]): Patch[] {
  const planId = useFloorMapStore.getState().currentPlanId;
  const graph = getWallGraph(shapes, planId);
  const faces = graph.faces.filter((f) => faceAreaM2(f) >= MIN_ROOM_M2);

  const rooms = shapes.filter(
    (s) => s.type === 'room' && (s.planId === planId || !s.planId)
  );

  const patches: Patch[] = [];
  const matchedRoomIds = new Set<string>();
  const usedFaces = new Set<Face>();

  // Match faces to existing rooms: room centroid inside face, or face
  // centroid inside room polygon; prefer the closest area ratio.
  for (const face of faces) {
    let best: { room: FloorMapShape; score: number } | null = null;
    for (const room of rooms) {
      if (matchedRoomIds.has(room.id)) continue;
      const points = (room.coordinates as PolygonCoordinates)?.points;
      if (!points?.length) continue;
      const roomCentroid = {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        y: points.reduce((s, p) => s + p.y, 0) / points.length,
      };
      const overlaps =
        pointInPolygon(roomCentroid, face.points) || pointInPolygon(face.centroid, points);
      if (!overlaps) continue;
      let roomArea = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        roomArea += points[i].x * points[j].y - points[j].x * points[i].y;
      }
      roomArea = Math.abs(roomArea) / 2;
      const ratio = roomArea > 0 ? Math.min(roomArea, face.area) / Math.max(roomArea, face.area) : 0;
      if (!best || ratio > best.score) best = { room, score: ratio };
    }

    if (best) {
      matchedRoomIds.add(best.room.id);
      usedFaces.add(face);
      const existingPoints = (best.room.coordinates as PolygonCoordinates).points;
      const areaM2 = faceAreaM2(face);
      const areaChanged = Math.abs((best.room.area ?? 0) - areaM2) > 0.01;
      if (!polygonsEqual(existingPoints, face.points) || areaChanged || best.room.metadata?.detached) {
        patches.push(
          makeUpdatePatch(best.room, {
            coordinates: { points: face.points },
            area: parseFloat(areaM2.toFixed(2)),
            metadata: { ...best.room.metadata, detached: undefined },
          })
        );
      }
    }
  }

  // New faces → new auto-rooms.
  let roomCounter = rooms.length;
  for (const face of faces) {
    if (usedFaces.has(face)) continue;
    roomCounter += 1;
    const shape: FloorMapShape = {
      id: uuidv4(),
      type: 'room',
      coordinates: { points: face.points },
      name: `Rum ${roomCounter}`,
      area: parseFloat(faceAreaM2(face).toFixed(2)),
      planId: planId || undefined,
      metadata: { autoDetected: true, needsNaming: true },
      zIndex: -10,
    };
    patches.push({ op: 'add', shape });
  }

  // Auto-rooms whose loop vanished → flag detached (keep the shape).
  for (const room of rooms) {
    if (matchedRoomIds.has(room.id)) continue;
    if (room.metadata?.autoDetected && !room.metadata?.detached) {
      patches.push(
        makeUpdatePatch(room, { metadata: { ...room.metadata, detached: true } })
      );
    }
  }

  return patches;
}
