# Paste this into Claude Code

Copy everything between the fences below and paste it as your opening message. Make sure the `design_handoff_dashboard_redesign/` folder is at the root of your repo (or adjust the path references) before starting.

---

```
I want you to implement a dashboard redesign in this React + Vite codebase.

The full design handoff is in `./design_handoff_dashboard_redesign/`. Start by reading:

1. `design_handoff_dashboard_redesign/README.md` — full spec, tokens, component contracts, definition of done.
2. `design_handoff_dashboard_redesign/design_files/tokens.css` — all design tokens. Lift the `:root` / `[data-theme="paper"]` block into the app's global CSS verbatim.
3. `design_handoff_dashboard_redesign/design_files/dashboard.jsx` — canonical reference for the main dashboard.
4. `design_handoff_dashboard_redesign/design_files/shared.jsx` — AppHeader, icons, small shared pieces.
5. `design_handoff_dashboard_redesign/screenshots/01-canonical.png` — the target visual.

Scope for this first pass: **only the canonical signed-in dashboard view** (the state a returning user lands on with active projects). Skip modals, mobile, onboarding, empty/loading states — those come later.

Before writing code:

1. Survey the repo. Identify the existing styling approach (Tailwind / CSS Modules / plain CSS), the current dashboard route / page file, and any existing primitive components (Button, Card, Chip, Input, Avatar) I should reuse. Tell me what you find.
2. Propose a plan: which files you'll create, which you'll modify, how you'll integrate the tokens (e.g. extend the Tailwind config vs. drop them into a global stylesheet), and whether you'll add the Google Fonts via `index.html` or the existing font loader. Wait for me to approve before writing code.

Non-negotiables:

- Use the tokens in `tokens.css` verbatim. Do not invent new color values or swap OKLCH for hex.
- Load Inter Tight, Fraunces, and JetBrains Mono. Greeting + stat numbers + section titles must render in Fraunces; eyebrows in JetBrains Mono uppercase; body in Inter Tight.
- Money and counts use tabular numerals.
- Keep all Swedish copy exactly as in the design source.
- If the repo already has a `<Button>` / `<Card>` / `<Chip>` primitive, reuse it — add a variant if needed, but don't fork into a parallel component family.

When you're done, run the app, screenshot the dashboard at 1280px wide, and compare against `screenshots/01-canonical.png`. Fix visible diffs before asking for review.
```

---

## Before you run Claude Code

1. Unzip `design_handoff_dashboard_redesign.zip` at the root of your repo.
2. Make sure your dev server works (`npm run dev` or equivalent).
3. Open a Claude Code session in the repo root.
4. Paste the prompt above.
5. Let Claude Code survey first — approve its plan before it starts writing files.
