# Renofine

AI renovation platform, live at [renofine.com](https://renofine.com).

Renofine lets a homeowner and a craftsman run the same renovation project together, from first sketch to final walkthrough. It covers floor planning, budgets, materials and purchasing, and team collaboration, and a multilingual translation agent lets both sides work in their own language, the exact problem that started it: repainting my kids' room with a painter I could not communicate with.

Built solo, idea to production, with Claude Code. Live with real beta users.

## What it does

- Project and room management with a live dashboard
- Visual floor planner: 2D drawing plus 3D preview, snapping, elevation views, a symbol library
- Budget management and cost tracking per room and project
- Materials lists and purchase requests
- Team collaboration with role-based access
- Multilingual support (Swedish, English, German, Spanish, French)

## Stack

- TypeScript, React 18, Vite
- TailwindCSS, Radix UI and shadcn
- TanStack Query, Zustand, React Hook Form, Zod
- Supabase (Postgres, Auth, Row Level Security, Realtime, Edge Functions)
- Fabric.js and React Three Fiber for the floor planner
- i18next for internationalisation

## Local development

```bash
npm install
npm run dev
```

Requires a Supabase project and a `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Database migrations live in `supabase/migrations/`.

---

Carl Palmquist · [carlpalmquist.com](https://carlpalmquist.com)
