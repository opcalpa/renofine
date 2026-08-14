# Renofine · Handoff Changelog

Versionssystem: `vMAJOR.MINOR.PATCH`

- **MAJOR** — strukturomläggning av hela paketet
- **MINOR** — ny modul klar (parity-runda landad, en 🔴/🟡 → 🟢)
- **PATCH** — justeringar inom en redan-klar modul, eller dokumentationsfix

För Claude Code: be alltid att läsa **senaste versionen** av filerna — version syns i `STATUS.md`, `README.md` och `index.html` (header).

---

## v2.0.0 · 9 maj 2026 — Strukturomläggning

**Major:** Komplett städning av handoff-paketet.

- Ny mappstruktur: `00-roadmap/` · `01-brand/` · `02-pages/<Modul>/` · `03-source/`
- Lade till `STATUS.md` som single source of truth (🟢🟡🔴 per modul)
- Lade till `index.html` som visuell länksida med statusbadges
- Lade till `CHANGELOG.md` (denna fil) + versions-system
- Migrerade alla v2-arbeten (Offert, Faktura, Rum) + första-skisser (Landing, Start-Homeowner, Start-Contractor)

**Klara moduler vid release:**

- 🟢 Brand / Logotyp
- 🟢 Roadmap + Inventory
- 🟢 Rum (full parity)
- 🟢 Offert (9 scener inkl. ImportRoom, CreateClient, ShareQuote)
- 🟢 Faktura (8 scener inkl. MethodDialog, Procent, Klart arbete, RecordPayment, Share)
- 🟡 Landing, Start-Homeowner, Start-Contractor (skiss, ej parity-auditad)

---

## Tidigare (v1.x — ej versionerat)

Innan v2 fanns en platt `handoff/`-mapp utan versioning. v1-paketet låstes vid Rum v2-leveransen och saknade alla efterföljande v2-arbeten. v1 är ersatt av v2.0.0 och bör inte användas vidare.
