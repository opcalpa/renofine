/**
 * In-memory handoff for a dropped folder that must survive a navigation.
 *
 * Dropping a folder on the project LIST but choosing "add to an existing
 * project" means the files have to reach the project page. File objects aren't
 * serializable state, so they ride in a module-level stash instead of the URL
 * or router state — the same pattern the attachment registry uses in
 * documentCapture.ts. Single-shot: taking it clears it.
 */

import type { DroppedFile } from '@/lib/dropTree';

let stash: { projectId: string; files: DroppedFile[] } | null = null;

export function stashDroppedFolder(projectId: string, files: DroppedFile[]): void {
  stash = { projectId, files };
}

/** Returns (and clears) the stash if it was meant for this project. */
export function takeDroppedFolder(projectId: string): DroppedFile[] | null {
  if (!stash || stash.projectId !== projectId) return null;
  const { files } = stash;
  stash = null;
  return files;
}

export function clearDroppedFolder(): void {
  stash = null;
}
