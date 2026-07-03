// Deterministic scorers for the agent-route router.
//
// The router fails dangerously in three ways: (1) it INVENTS an id (proposes a
// change to a task/room that doesn't exist), (2) it HALLUCINATES an action on
// input it should have flagged as unknown, (3) it MISSES or MISROUTES a clear
// instruction. So we score id-integrity, "unknown over wrong guess", and
// recall/precision over expected actions — not summary wording.

// update_task and set_progress are the same family ("change a task's state").
// Accept either when a case expects one of them, as long as the taskId matches.
const STATE_FAMILY = new Set(["update_task", "set_progress"]);

function actionRefs(action) {
  const refs = [];
  if (typeof action.taskId === "string") refs.push(["task", action.taskId]);
  if (typeof action.roomId === "string") refs.push(["room", action.roomId]);
  if ((action.target === "task" || action.target === "room") && typeof action.targetId === "string") {
    refs.push([action.target, action.targetId]);
  }
  return refs;
}

function matches(expected, action) {
  const typeOk =
    STATE_FAMILY.has(expected.type) && STATE_FAMILY.has(action.type)
      ? true
      : expected.type === action.type;
  if (!typeOk) return false;

  if (expected.taskId && action.taskId !== expected.taskId) return false;
  if (expected.roomId && action.roomId !== expected.roomId) return false;
  if (expected.itemIncludes && !((action.item || action.itemText || "").toLowerCase().includes(expected.itemIncludes.toLowerCase()))) return false;
  if (expected.titleIncludes && !(action.title || "").toLowerCase().includes(expected.titleIncludes.toLowerCase())) return false;
  if (expected.quantity != null && Number(action.quantity) !== Number(expected.quantity)) return false;
  if (expected.hours != null && Number(action.hours) !== Number(expected.hours)) return false;
  if (expected.progressMin != null && !(Number(action.progress) >= expected.progressMin)) return false;
  if (expected.progressMax != null && !(Number(action.progress) <= expected.progressMax)) return false;
  return true;
}

export function scoreRouterCase(c, context, proposals) {
  const taskIds = new Set(context.tasks.map((t) => t.id));
  const roomIds = new Set(context.rooms.map((r) => r.id));
  const valid = { task: taskIds, room: roomIds };

  const list = Array.isArray(proposals) ? proposals : [];
  const actionable = list.filter((p) => p.action && p.action.type !== "unknown");

  // id-integrity: every referenced id must exist
  const inventedIds = [];
  for (const p of list) {
    if (!p.action) continue;
    for (const [kind, id] of actionRefs(p.action)) {
      if (!valid[kind].has(id)) inventedIds.push(`${p.action.type}:${kind}=${id}`);
    }
  }

  const critical = [];
  for (const inv of inventedIds) critical.push(`invented ${inv}`);

  // forbidden task ids (wrong-room / wrong-task traps)
  const forbid = new Set(c.forbidTaskIds || []);
  for (const p of actionable) {
    if (p.action.taskId && forbid.has(p.action.taskId)) critical.push(`touched forbidden ${p.action.taskId}`);
  }

  let recall = { found: 0, expected: 0 };
  let falsePositives = 0;

  // Borra-class trap: work with NO matching task must not produce a CONFIDENT task
  // mutation (it should be unknown/create_task, or a low-confidence pick the UI won't auto-apply).
  if (c.expectNoConfidentTaskMutation) {
    const bad = list.filter((p) =>
      p.action && (p.action.type === "set_progress" || p.action.type === "update_task") &&
      (typeof p.matchConfidence !== "number" || p.matchConfidence >= 0.7));
    for (const b of bad) critical.push(`confident mutation on unmatched work (${b.action.type}, mc=${b.matchConfidence ?? "none"})`);
    const ok = bad.length === 0 && inventedIds.length === 0;
    return { id: c.id, kind: "no-confident-mutation", ok, recall, falsePositives: 0, inventedIds, critical };
  }

  if (c.expectUnknown) {
    // Must not produce an actionable proposal on un-routable input
    if (actionable.length > 0) critical.push(`hallucinated ${actionable.length} action(s) on unknown input`);
    const ok = actionable.length === 0 && inventedIds.length === 0;
    return { id: c.id, kind: "unknown", ok, recall, falsePositives: actionable.length, inventedIds, critical };
  }

  if (c.expectEmpty) {
    falsePositives = actionable.length; // chit-chat → any action is a false positive
    const ok = actionable.length === 0 && inventedIds.length === 0;
    return { id: c.id, kind: "empty", ok, recall, falsePositives, inventedIds, critical };
  }

  // expect[]: recall over expected actions
  const expected = c.expect || [];
  recall.expected = expected.length;
  const usedIdx = new Set();
  for (const exp of expected) {
    const idx = actionable.findIndex((p, i) => !usedIdx.has(i) && matches(exp, p.action));
    if (idx >= 0) {
      usedIdx.add(idx);
      recall.found++;
    }
  }
  falsePositives = actionable.length - usedIdx.size;

  if (expected.length === 1 && recall.found === 0) critical.push("missed the only expected action");

  const ok = critical.length === 0 && recall.found === recall.expected && falsePositives === 0;
  return { id: c.id, kind: "expect", ok, recall, falsePositives, inventedIds, critical };
}
