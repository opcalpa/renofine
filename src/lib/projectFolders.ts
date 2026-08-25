/**
 * Where a project's files live, as pure string logic.
 *
 * Deliberately free of every dependency — `buildImportSession` is a
 * deterministic module that must stay testable without a Supabase client, and
 * pulling the upload service in for one path helper was enough to break that.
 * The service imports from here; nothing here imports the service.
 */

/**
 * The folder a whole dropped batch's unrecognised files share.
 *
 * The `other` category maps to "" — the project's root — and for a single
 * upload that is fine. For a dropped folder it is the whole problem: twenty
 * files the reader could not place end up loose among everything the project
 * already had, which is the same pile the person dropped, only moved. Dated so
 * a drop stays one reviewable, reversible thing.
 */
export function importFolderName(when: Date): string {
  const iso = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(
    when.getDate()
  ).padStart(2, '0')}`;
  return `/Import ${iso}`;
}

/**
 * The folder part of an archived file's path, as it reads in Files.
 * `projects/<id>/Kvitton/1234-x.pdf` → `/Kvitton`; a file in the root → "".
 */
export function folderOfPath(projectId: string, path: string): string {
  const prefix = `projects/${projectId}/`;
  if (!path.startsWith(prefix)) return '';
  const rest = path.slice(prefix.length);
  const cut = rest.lastIndexOf('/');
  return cut === -1 ? '' : `/${rest.slice(0, cut)}`;
}

/** The path one file gets when it is filed into `folder`, keeping its name. */
export function pathInFolder(projectId: string, path: string, folder: string): string {
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  return `projects/${projectId}${folder}/${fileName}`;
}
