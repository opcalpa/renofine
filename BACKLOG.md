# Renofine Backlog

Live backlog för Renofine — **en samlad sanning** för allt: produkt/features, tagna
byggbeslut OCH go-to-market (FB-grupper, outreach, demo-videos). Läses och skrivs av
pappens Developer-flik. Format: se /Users/calpa/Developer/PA/BACKLOG_FORMAT.md

Detaljplaner för många items bor i /Users/calpa/Developer/Renofine/.claude/memory/project_*.md
(Claudes minne). Levererat flyttas till `status: done` och loggas i `.claude/memory/shiplog.md`.

## Goals
- Bli verktyget en byggare eller projektledare faktiskt öppnar varje dag i ett pågående projekt
- Beta till betalande: landa de första betalande projekten
- Behåll kärnan vass, ingen feature utan tydlig användarnytta

---
id: fb-grupper-outreach
status: todo
priority: P1
tags: [growth, launch]
created: 2026-06-12
---
## Facebook-grupper: posta + värva betatestare
Posta i bygg- och hemägargrupper under 1–2 veckor för att få 20–30 betatestare.
Spelbok + grupplista i `.claude/briefs/fb-launch-kit.md`, 10 unika postvarianter i
`.claude/briefs/fb-post-varianter.md`. Regler: max 2–3 grupper/dag, läs gruppregler
(admin-DM vid reklamförbud), alltid bild, svara inom en timme, titta på PostHog-recordings
samma kväll. Kvällscoach-rutin aktiv (Google Calendar 19:30). Logga utfall i kit-tabellen.

---
id: demo-videos
status: todo
priority: P2
tags: [growth, launch]
created: 2026-06-12
---
## Spela in 3 demo-videos
Bullet-scripts i PA: `projects/renomate/demo-videos-scripts.md`. Demoprojekt finns redan i appen.
1. "Vad är Renofine?" (60–90 sek) — prioritera först
2. Hemägare-genomgång (2–3 min)
3. Byggare-genomgång (2–3 min)
Verktyg: Loom eller QuickTime. Använd i FB-poster + landningssida.

---
id: vc-peter-muir
status: todo
priority: P3
tags: [growth]
---
## Svara Peter Muir (33East VC)
Draft finns i PA: `projects/renomate/vc-pitch.md`. Uppföljning på inkommande VC-intresse.

---
id: proffs-bygglet-gap
status: todo
priority: P2
tags: [feature, pro]
---
## Proffs-flödet — kvarvarande Bygglet-gap
Fas 1–6, 8, 10+ levererade. Kvar: **E-post-ingest för fakturor** (P2), **Fortnox API**
(kräver partnerskap), **Arbetsorder + GPS**, **EDI-följesedlar** (grossist-partnerskap),
**Factoring** (partnerskap), XML→Skatteverket för personalliggare.
Detaljer: `.claude/memory/reference_competitor_bygglet.md`

---
id: role-based-ux-audit
status: todo
priority: P2
tags: [feature, ux]
---
## Role-based UX audit — per-tab visibility
Route guards + CTA gating klart. Kvar: per-tab visibility för alla 4 inbjudna roller
(inkl. läck-fix L3: PurchaseOrderDetailSheet visar vendor_name/price_total omaskat för
UE-medlem Mode None). Detaljer: `.claude/memory/project_role_based_ux_audit.md`

---
id: ai-onboarding-edge-cases
status: todo
priority: P2
tags: [feature, ai]
---
## AI-onboarding — edge cases
Quote-upload MVP klar. Robustera: inga rum/tasks extraheras → vad händer? Felmeddelanden?
Edit-preview innan create? Detaljer: `.claude/memory/project_ai_onboarding_flow.md`

---
id: role-separation-arkitektur
status: todo
priority: P3
tags: [refactor, architecture]
---
## Role-separation arkitektur
Separata komponentträd för hemägare/proffs. Beslut taget, ej implementerat. ~1 vecka.
Detaljer: `.claude/memory/project_role_separation_architecture.md`

---
id: unified-purchase-budget
status: todo
priority: P3
tags: [refactor]
---
## Unified purchase + budget — slutför
Materialbudget + inköpsorder som samma data på tidsaxel. Block 1–6 levererade.
Kvar: split-rad-funktion (Block 5, deferred) + sunset V1 process-document (~2v wait).
Detaljer: `.claude/memory/project_unified_purchase_budget_model.md`

---
id: unified-document-extraction
status: todo
priority: P3
tags: [refactor, ai]
---
## Unified document extraction
Slå ihop process-receipt + process-document till en endpoint med union-schema. ~2 dagar.
Detaljer: `.claude/memory/project_unified_document_extraction.md`

---
id: drop-total-budget-column
status: todo
priority: P3
tags: [cleanup, db]
---
## Droppa projects.total_budget-kolumnen
Separat migration efter att budget-split verifierats i prod ett tag. Bakåtkompat-skydd
tills allt UI-arbete bekräftats.

---
id: post-activation-guidance
status: todo
priority: P3
tags: [feature, ux]
---
## Post-activation guidance
Guida ägare att fylla i rumsdetaljer efter aktivering.
Detaljer: `.claude/memory/project_post_activation_guidance.md`

---
id: intake-form-redesign
status: todo
priority: P3
tags: [feature, ux]
---
## Intake-form redesign
Fritext-AI istället för checkboxar. 4 steg: berätta → rum → bilder → kontakt.
Detaljer: `.claude/memory/project_intake_redesign_plan.md`

---
id: batch-smart-tolk
status: todo
priority: P3
tags: [feature, ai]
---
## Batch Smart Tolk
Bulk-tolkning av 50+ filer. Progress bar, sammanfattningstabell, smart filnamnsbyte.
Detaljer: `.claude/memory/project_batch_smart_tolk.md`

---
id: joel-beta-features
status: todo
priority: P3
tags: [feature]
---
## Joel beta-features
DM via avatar-click, quote→tasks structured extraction, canvas↔room bidirectional linking.
Detaljer: `.claude/memory/project_joel_beta_features.md`

---
id: alla-rum-shortcut
status: todo
priority: P3
tags: [feature, ux]
---
## "Alla rum" UX-shortcut
Multi-select rooms i planning/quotes/wizard. "Alla rum" visas när alla rooms valda.
Detaljer: `.claude/memory/project_alla_rum_feature.md`

---
id: taskstab-toolbar-layout
status: todo
priority: P3
tags: [feature, ux]
---
## TasksTab toolbar-layout
Filter + add-knapp ovanför timeline. Detail-toolbar mellan sektionerna.
Detaljer: `.claude/memory/project_tasks_tab_toolbar_layout.md`

---
id: landing-page-v2
status: todo
priority: P3
tags: [growth, ux]
---
## Landing Page v2
Editorial redesign. Redo att implementera.
Detaljer: `.claude/memory/project_landing_page_v2.md`

---
id: i18n-locale-audit
status: todo
priority: P3
tags: [cleanup, i18n]
---
## i18n locale-audit + ROT-lokalisering per marknad
Granska översättningar, ROT-stöd per marknad (SE klar).
Detaljer: `.claude/memory/project_i18n_locale_audit.md`

---
id: ai-verification-pass
status: todo
priority: P4
tags: [ai, idea]
---
## AI verification pass (2-pass actor-critic)
Bygg endast om anti-lazy-prompt inte räcker långsiktigt. ~halvdag.
Detaljer: `.claude/memory/project_ai_verification_pass.md`

---
id: start-page-redesign
status: todo
priority: P4
tags: [ux, idea]
---
## Start page redesign
Utöver dashboard A/B (som är pausad). Detaljer: `.claude/memory/project_start_page_redesign.md`

---
id: post-project-phase
status: todo
priority: P4
tags: [feature, idea]
---
## Post-project phase
Garantibevakning, manualer, underhållsläge efter avslutat projekt.
Detaljer: `.claude/memory/project_post_project_phase.md`

---
id: feedback-pipeline
status: todo
priority: P4
tags: [feature, idea]
---
## In-app feedback pipeline
In-app feedback → `user_feedback`-tabell. Detaljer: `.claude/memory/project_feedback_pipeline.md`

---
id: tax-deduction-multicountry
status: todo
priority: P4
tags: [feature, idea]
---
## Tax deduction multi-country (Fas 2)
Generalisera ROT till DE/US. Detaljer: `.claude/memory/project_tax_deduction_framework.md`

---
id: files-page-part2
status: todo
priority: P4
tags: [refactor, idea]
---
## Files page Part 2
Extrahera table views ur 2500-radig fil. Detaljer: `.claude/memory/project_files_ux_review.md`

---
id: sharing-team-merge
status: todo
priority: P4
tags: [idea, parked]
---
## Delning + Team merge
Diskussion parkerad. Sharing levererad. Detaljer: `.claude/memory/project_sharing_team_merge.md`

---
id: seo-www-apex-redirect
status: done
priority: P2
tags: [growth, seo]
updated: 2026-06-17
---
## SEO: www→apex 301-redirect (Cloudflare)
GSC "Duplicate without user-selected canonical" — www + apex svarade båda 200. Satte
Single Redirect-regel via Cloudflare API (www.renofine.com → https://renofine.com, 301,
path+query bevaras). letsrenomate.com redirectade redan. Verifierat live.

---
id: seo-canonical-sitemap
status: done
priority: P2
tags: [growth, seo]
pr: 2cefc31
updated: 2026-06-17
---
## SEO: canonical-taggar + sitemap
Self-referencing `<link rel="canonical">` (hårdkodad apex-host → täcker även
renomate.pages.dev) via ny `<Canonical>`-komponent + statisk fallback i index.html.
Plus sitemap.xml (8 publika sidor) + Sitemap-direktiv i robots.txt. Deployad & verifierat
live på apex + pages.dev. **Kvar (manuellt): GSC → "Validate Fix" + skicka in sitemap.**

---
id: guest-signup-migration
status: done
priority: P1
tags: [bugfix, onboarding]
pr: d359c4b
updated: 2026-06-12
---
## Gäst-projekt följer med vid signup
Gäst-wizardens projekt försvann vid signup (migration kollades bara på /auth + kolumnnamn-bugg
language_preference). Fix: auto-migrera vid signup + säkerhetsnät på /start. E2E-verifierat.

---
id: edge-functions-cors-deploy
status: done
priority: P3
tags: [cleanup, ops]
updated: 2026-06-17
---
## Deploya edge functions (localhost:5002 CORS)
29 funktioner fick localhost:5002 i CORS-listan. Deployade alla via supabase functions deploy,
verifierat CORS reflekterar både ny origin + prod. Prod oförändrat.
