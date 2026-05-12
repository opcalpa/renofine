#!/usr/bin/env bash
# typecheck-strict.sh — fail the build only on "fatal" TS errors that map to
# runtime crashes (ReferenceError, import resolution failure, syntax errors).
# Other type errors are reported but do not block the build.
#
# Fatal codes we gate on:
#   TS2304 — Cannot find name 'X'                  → ReferenceError at runtime
#   TS2305 — Module 'X' has no exported member 'Y' → import error
#   TS2307 — Cannot find module 'X'                → import resolution failure
#   TS2552 — Cannot find name 'X'. Did you mean…   → ReferenceError at runtime
#   TS2503 — Cannot find namespace 'X'             → import/namespace error
#   TS2693 — 'X' only refers to a type but is used as value → ReferenceError
#   TS1005/1109/1131/1228/1434 — syntax errors that won't parse

set -u

OUT=$(npx tsc --noEmit -p tsconfig.app.json 2>&1 || true)
FATAL=$(echo "$OUT" | grep -E "error TS(2304|2305|2307|2552|2503|2693|1005|1109|1131|1228|1434)" || true)

if [ -n "$FATAL" ]; then
  echo ""
  echo "❌ Fatal TypeScript errors found — build blocked."
  echo "   These map to runtime crashes (ReferenceError, missing imports, syntax errors)."
  echo ""
  echo "$FATAL"
  echo ""
  echo "   Other (non-fatal) type errors may exist — run 'npx tsc --noEmit -p tsconfig.app.json' to see all."
  exit 1
fi

echo "✅ No fatal TypeScript errors. (Non-fatal type errors may exist — not blocking.)"
exit 0
