/**
 * How many model calls a piece of work actually made.
 *
 * Every token-saving in the import pipeline has so far been argued rather than
 * measured — "roughly a third fewer calls", "halves the cost of a quote". That
 * is a guess dressed as a number, and the next optimisation deserves better
 * than a guess to aim at.
 *
 * Counting requests counts calls: each edge function in that pipeline makes
 * exactly one model call per request (the two fetch branches in
 * extract-document-text and process-document-v2 are image-vs-PDF, and only one
 * of them runs).
 *
 * A log is created per run and threaded down. A module-level counter would leak
 * between drops and quietly report the wrong number the second time — which is
 * worse than no number at all, because it looks like one.
 *
 * Dependency-free on purpose: the modules that count live next to a Supabase
 * client, and a measurement you cannot test without a network is not a
 * measurement worth trusting.
 */

export interface ModelCallLog {
  /**
   * Calls actually made. A file skipped for being already imported contributes
   * nothing here, which is exactly how that saving should be visible: as an
   * absence.
   */
  total: number;
  /** Per edge function, so the next look knows where the cost actually sits. */
  byKind: Record<string, number>;
}

export function makeModelCallLog(): ModelCallLog {
  return { total: 0, byKind: {} };
}

/** Record one call. `log` is optional so callers outside a run cost nothing. */
export function noteModelCall(log: ModelCallLog | undefined, kind: string): void {
  if (!log) return;
  log.total += 1;
  log.byKind[kind] = (log.byKind[kind] ?? 0) + 1;
}

/**
 * The breakdown, biggest first: "classify-document 62 · process-floorplan 3".
 * Shown as a tooltip, so the headline number can be read at a glance and the
 * question "where did they go?" still has an answer.
 */
export function describeModelCalls(log: ModelCallLog): string {
  // A tooltip must never take the page down with it: a log restored from an
  // older shape (or a journal written by a previous build) can be missing this
  // map, and Object.entries(undefined) throws.
  if (!log?.byKind) return '';
  return Object.entries(log.byKind)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, n]) => `${kind} ${n}`)
    .join(' · ');
}

/**
 * Calls per file read — the number that actually says whether a saving landed.
 * A raw total rises with the size of the folder; this does not.
 * Returns null when nothing was read, rather than dividing by zero.
 */
export function callsPerFile(log: ModelCallLog, filesRead: number): number | null {
  if (filesRead <= 0) return null;
  return Math.round((log.total / filesRead) * 10) / 10;
}

/**
 * The cost of one run, flattened for analytics.
 *
 * Shared so every place that reports a drop reports the SAME shape — two call
 * sites inventing their own property names is how a metric becomes two metrics
 * that cannot be compared, which is worse than not measuring at all.
 *
 * `calls_per_file` is the number to chart: the total rises with the size of the
 * folder, the ratio only moves when the pipeline itself gets cheaper. The
 * per-function counts ride along as `calls_<name>` so a jump can be traced to
 * the function that caused it without another release.
 */
export function modelCallProperties(
  log: ModelCallLog | undefined,
  filesRead: number
): Record<string, number> {
  if (!log) return {};
  const props: Record<string, number> = {
    model_calls: log.total,
    files_read: filesRead,
  };
  const perFile = callsPerFile(log, filesRead);
  if (perFile !== null) props.calls_per_file = perFile;
  for (const [kind, n] of Object.entries(log.byKind)) {
    props[`calls_${kind.replace(/-/g, '_')}`] = n;
  }
  return props;
}
