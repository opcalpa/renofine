# Renofine · Status per modul

Senast uppdaterad: 9 maj 2026 · **v2.0.0**

Statusnivåer:
- 🟢 **Klar** — full feature parity mot kodbasen, parity-rapport finns
- 🟡 **Delvis** — design finns men parity-audit ej körd, eller luckor identifierade
- 🔴 **Saknas** — ingen design ännu

## Sidor och moduler

| Modul | Status | Filer | Anteckningar |
|---|---|---|---|
| **Brand / Logotyp** | 🟢 Klar | `01-brand/` | Mark, lockup, monogram, ikoner, OG-bild, brand-guide |
| **Roadmap** | 🟢 Klar | `00-roadmap/Feature-roadmap.html` | P0-P3 prioritering över alla moduler |
| **Inventory** | 🟢 Klar | `00-roadmap/Feature-inventory.html` | Komplett feature-lista per sida |
| **Landing** | 🟡 Delvis | `02-pages/Landing/design.html` | Skiss, ej parity-auditad |
| **Start (Homeowner)** | 🟡 Delvis | `02-pages/Start-Homeowner/design.html` | 3 lägen via Tweaks, ej parity-auditad |
| **Start (Contractor)** | 🟡 Delvis | `02-pages/Start-Contractor/design.html` | 3 lägen via Tweaks, ej parity-auditad |
| **Rum** | 🟢 Klar | `02-pages/Rum/design.html` + `parity.html` | Desktop list + drawer + mobil bottom-sheet, alla 7 tabs |
| **Offert** | 🟢 Klar | `02-pages/Offert/design.html` + `parity.html` | 9 scener inkl. ImportRoom, CreateClient, ShareQuote |
| **Faktura** | 🟢 Klar | `02-pages/Faktura/design.html` + `parity.html` | 8 scener inkl. MethodDialog, Procent, Klart arbete, RecordPayment, Share |
| **ÄTA** | 🟢 Klar | (ingår i Offert/Faktura) | `is_ata`-flagga — ingen separat sida i kodbasen, täckt av Offert Scen 6 |
| **Project Detail · Översikt** | 🔴 Saknas | — | Nästa runda (A) |
| **Project Detail · Tasks** | 🔴 Saknas | — | Nästa runda (B) |
| **Project Detail · Floor map** | 🔴 Saknas | — | Nästa runda (C) |
| **Project Detail · Inköp / Dokument / Aktivitet** | 🔴 Saknas | — | Nästa runda (D) |
| **Project Detail · Inbjudningar / Klientvy** | 🔴 Saknas | — | Nästa runda (E) |
| **Profil & inställningar** | 🔴 Saknas | — | Profile.tsx, väntar |
| **Worker view / närvaro** | 🔴 Saknas | — | WorkerView, AttendanceCheckIn, väntar |
| **Klientregister** | 🔴 Saknas | — | ClientRegistry, väntar |
| **Intake-förfrågningar** | 🔴 Saknas | — | IntakeRequests, FindProfessionals, väntar |
| **Customer-flöden (publika länkar)** | 🔴 Saknas | — | CustomerIntake, InvitationResponse, väntar |

## Vad jag rekommenderar härnäst

Vi har klarat alla **dokument-moduler** (offert, faktura, ÄTA) och **rum**. Kvar finns en stor klump kring **projektnav-sidan** (Project Detail). Det är 58 KB i koden och 5 separata flikar — för stort att göra i en runda utan kvalitetsförlust.

**Föreslagen ordning (rundor A-E):**

1. **Runda A — Översikt-fliken** · statusbar, timeline, kostnadskort, snabbåtgärder. Det är "första intrycket" av ett projekt.
2. **Runda B — Tasks-fliken** · kanban + listvy + Task-detail-drawer.
3. **Runda C — Floor map** · ritverktyg, mätlinjal, väggritning.
4. **Runda D — Inköp + Dokument + Aktivitetsflöde** · administrativa flikar.
5. **Runda E — Inbjudningar + Klientvy** · åtkomstkontroll + den publika kundvyn.

Efter Project Detail väntar Profil, Worker view, Klientregister, Intake-flöden — men de är mindre och kan göras parallellt eller utifrån prioritet.
