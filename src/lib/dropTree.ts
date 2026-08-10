/**
 * Read files from a drag-and-drop DataTransfer, walking dropped folders
 * recursively (webkitGetAsEntry). Shared primitive so both the files batch
 * upload and Renaida's folder ingest read a dropped project folder the same
 * way — no duplicated tree-walk, no importing a heavy dialog to reuse it.
 */

export interface DroppedFile {
  file: File;
  /** Preserves folder structure from the drag (e.g. "Badrum/offert.pdf"). */
  relativePath: string;
}

export async function readDroppedItems(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const results: DroppedFile[] = [];

  // Try webkitGetAsEntry for folder support.
  const items = Array.from(dataTransfer.items);
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => e != null);

  if (entries.length > 0) {
    for (const entry of entries) {
      await readEntry(entry, '', results);
    }
  } else {
    // Fallback: plain files (no folder support in this browser/context).
    const files = Array.from(dataTransfer.files);
    for (const file of files) {
      results.push({ file, relativePath: file.name });
    }
  }

  return results;
}

async function readEntry(
  entry: FileSystemEntry,
  basePath: string,
  results: DroppedFile[],
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    // Skip hidden files and placeholders (.DS_Store, dotfiles).
    if (!file.name.startsWith('.')) {
      results.push({ file, relativePath: basePath + file.name });
    }
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const subEntries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    for (const sub of subEntries) {
      await readEntry(sub, basePath + entry.name + '/', results);
    }
  }
}
