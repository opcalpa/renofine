# Renofine evals

A small, real eval suite that measures whether Renofine's AI features actually work — consistently, and across models. This is the discipline that turns "Claude said it looks good" into "here is the number, on this golden set, over time."

Features covered:
- **`translate-task-content`** — translating renovation work instructions to any language (the feature Renofine was born from when a painter used ceiling paint on the walls). Runner: `run.mjs`.
- **`generate-work-checklist`** — generating the on-site, step-by-step work checklist for a task (safe ordering, respects the room spec, no purchasing steps). Runner: `run-checklist.mjs`.
- **`parse-renovation-description`** — free-text → structured plan (rooms, work types, property fields). The extraction eval: scores recall/precision over rooms & work types, object fields, and the conservative global-vs-per-room rule — because a wrong extraction silently corrupts a user's project. Runner: `run-extraction.mjs`.

## Why this exists

Two things you can prove with this:
1. **Correctness & consistency** — the AI preserves instruction meaning and never mangles color codes / measurements / brand names. Run it twice, run it next month: same bar.
2. **Model/provider selection on evidence** — run the identical suite against `gpt-4o-mini`, `gpt-4o`, `claude-*` and read off which is good enough at the lowest cost. That answers "should we switch model or provider?" with data, not vibes.

## How it scores (three layers)

1. **Deterministic structure** — valid JSON, all ids and checklist items preserved, array counts intact. (`lib/scorers.mjs`)
2. **Deterministic verbatim** — terms that must NOT be translated (NCS/RAL color codes, measurements like `60x60 cm`, brand names like `Gyproc ProMix Lite`) must appear unchanged in the output.
3. **LLM-as-judge** — a strict reviewer compares source vs translation and flags *critical meaning failures* (ceiling↔wall paint, inverted/dropped safety steps), scoring 1–5. (in `run.mjs`)

The golden set lives in `dataset/translate-task-content.json` — 8 cases, each loaded with the traps that matter in construction.

## Run it

```bash
# from the Renofine repo root
export OPENAI_API_KEY=sk-...            # required
export ANTHROPIC_API_KEY=sk-ant-...     # only if comparing a claude model

# translate-task-content
node evals/run.mjs                                  # gpt-4o-mini, langs pl,en,uk, judge gpt-4o
node evals/run.mjs --models gpt-4o-mini,gpt-4o      # compare two models
node evals/run.mjs --langs pl,en --no-judge         # fast & free (deterministic only)
node evals/run.mjs --cases ceiling-vs-wall-paint    # one case, debugging

# generate-work-checklist (same flags)
node evals/run-checklist.mjs                                       # gpt-4o-mini, langs sv,en,pl, judge gpt-4o
node evals/run-checklist.mjs --langs sv --no-judge                 # fast & free (deterministic only)
node evals/run-checklist.mjs --cases bathroom-waterproof-before-tile

# parse-renovation-description (extraction — recall/precision + hallucination guard)
node evals/run-extraction.mjs                                      # gpt-4o-mini, judge gpt-4o
node evals/run-extraction.mjs --no-judge                           # deterministic only (cheap)
node evals/run-extraction.mjs --cases global-vs-perroom-trap

# head-to-head: our domain engine vs commodity translation (the moat-proof)
export DEEPL_API_KEY=...:fx                                        # optional; deepl engine skipped if unset
node evals/run-baseline.mjs                                        # renofine vs generic-llm vs deepl, langs pl,de
node evals/run-baseline.mjs --engines renofine,deepl --langs pl --no-judge
```

### Head-to-head (`run-baseline.mjs`) — why it exists
The deep-research verdict (2026-06) is that the moat is **not** translation (DeepL/LLMs commoditize that) but **construction-domain accuracy**. This runner proves it: it runs the same golden set through three engines —
- **renofine** — the production domain prompt (don't-translate codes, preserve meaning),
- **generic-llm** — the same model with a naive "just translate this JSON" prompt (isolates the prompt's value from the model's),
- **deepl** — raw DeepL machine translation (the commodity competitor).

The story to look for: renofine holds **verbatim** high and **critical** at 0 while deepl/generic-llm drop color codes or flip ceiling↔wall meaning. That gap is the sales demo. DeepL's free tier (`...:fx` key) covers this suite many times over.

Results are printed as a summary table and saved to `evals/results/translate-<timestamp>.json` (and `checklist-<timestamp>.json`) for regression history.

## Reading the summary

```
model            struct   verbatim   judge   critical   errors
gpt-4o-mini        100%      100%    4.71/5        1        0
```

- **struct** — % of runs with valid, structure-preserving JSON (table stakes; should be 100%).
- **verbatim** — % of must-not-translate terms left unchanged (a single broken color code can cost a contractor a wall).
- **judge** — average meaning-preservation score (aim ≥ 4.5).
- **critical** — count of dangerous/incorrect instruction translations (the number you want at 0).

## Keeping it honest

- The prompt builders in `lib/prompt.mjs` mirror production (`supabase/functions/translate-task-content/index.ts` and `supabase/functions/generate-work-checklist/index.ts`). If production changes, update here and re-run — otherwise the eval lies. The checklist runner also matches production's generation temperature (0.3).
- These are **prompt-level** evals (synthetic task content, direct model call), not full end-to-end pipeline tests (no Supabase auth / DB). That's the deliberate first step: it isolates AI quality cheaply. A pipeline smoke test can come later.

### Checklist scoring layers
1. **struct** — valid `{title, items[]}` with non-empty steps (table stakes; should be 100%).
2. **count** — % of runs with 4–10 steps (the production prompt's rule; surfaced separately so an out-of-range count is visible without failing struct).
3. **verbatim** — color codes / measurements / brand names from the room spec that must appear unchanged (e.g. `NCS S 0500-N`, `14 mm`, `Kährs Ek Nouveau Snow`).
4. **judge** — a strict reviewer scores 1–5 on safe ordering (waterproofing before tile, masking before paint), correct material vs spec, on-site-only (no purchasing steps), and per-case `criticalRequirements`. **critical** counts dangerous/forbidden steps — aim 0.

## Extending

Add a new feature by copying the pattern: a `dataset/<feature>.json` golden set + a runner that builds the production prompt and applies scorers. Good next candidates: `parse-renovation-description`, `classify-document`.
