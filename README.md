# Spark Estimator

A mobile-first Progressive Web App for the Spark Homes acquisition team. Agents walk through properties on their phones, check off needed repairs, enter quantities, attach photos, and get a real-time cost estimate — then export the whole package as a ZIP containing an Excel spreadsheet and all walkthrough photos.

## Live Demo

Open `index.html` in any modern browser, or serve the folder locally:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Features

### Core
- **75+ repair line items** organized into 5 sections and 19 collapsible groups
- **Multi-room support** — Bathrooms (default 2), Bedrooms, and Living/Common Areas each support multiple instances added on the fly
- **No Action Needed** option in every group, so agents can explicitly mark a group as reviewed
- **Running total** visible at all times, with per-section and per-group subtotals
- **Progress bar** across all groups in all sections

### Project Management
- Create, rename, and delete multiple projects
- Switch between projects without losing data
- All data persisted in `localStorage` — works fully offline

### Pricing
- **Per-project price overrides** — change a unit cost for this job only
- **Global price overrides** — update standard pricing that rolls out to all new estimates
- Searchable price list with 100+ items
- Reset to default pricing at any time

### Add / Remove Items
- Delete any existing line item from any group (per-project)
- Add custom line items to any group with a name, unit cost, and unit type

### Photo Capture
- Attach photos to any serial-number item (Furnace, A/C, Water Heater, Fridge, etc.)
- Camera trigger works on Android (file input + capture attribute) and iOS
- Photos are compressed before storage to stay within `localStorage` limits
- Each photo can be removed individually

### Export
- **ZIP download** containing an Excel `.xlsx` cost breakdown and all walkthrough photos
- Excel file: every checked item, quantity, unit cost, line total, section subtotals, and grand total
- If no photos, exports a standalone `.xlsx` directly
- Formatted with color-coded section headers, styled columns, and grand total row

### Deal Analyzer (Creative Addition)
A built-in profit calculator that pulls the live repair total from the walkthrough and lets agents estimate the deal's margin before they leave the driveway:
- Enter ARV (After Repair Value) and purchase price
- Slide the holding period (2–52 weeks); carry cost auto-calculates at 1.5% monthly
- Projected profit, ROI, and a deal verdict ("Strong deal / Thin margin / Losing deal")
- Stacked cost bar showing purchase / repairs / carry / profit breakdown

### PWA
- Service worker for full offline support
- Web app manifest — installable to home screen on Android and iOS
- Dark mode (auto-detects system preference, toggle in header)
- Smooth slide-in panel and bottom-sheet modals

## Libraries Used

All loaded via CDN — no build step required:

| Library | Purpose |
|---------|---------|
| [xlsx-js-style](https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/) | Formatted Excel export |
| [JSZip](https://cdn.jsdelivr.net/npm/jszip@3.10.1/) | Bundle Excel + photos into ZIP |
| [Geist](https://fonts.google.com/specimen/Geist) | Typography (Google Fonts) |

## File Structure

```
spark-assignment/
├── index.html      # Complete app — single self-contained file
├── manifest.json   # PWA manifest
├── sw.js           # Service worker (offline support)
└── README.md
```

## Design Decisions

**Single-file first.** All logic, styles, and data live in `index.html`. The service worker and manifest are the only additional files because the browser requires them to be separate for PWA installation.

**No framework.** Vanilla JS with string-template rendering. The state object is mutated directly; `render()` regenerates the DOM from scratch on each state change, except for quantity inputs where `updateTotalsInPlace()` patches only the affected totals to avoid focus-loss.

**Per-instance state keys.** Every item is stored as `${instanceId}:${itemId}` in the items map. This means the same repair item (e.g., vinyl plank flooring) can be independently tracked across Bathroom 1, Bathroom 2, Bedroom 1, etc. without any key collisions.

**Room architecture expanded.** The reference app only had bathrooms as multi-instance rooms. This version adds Bedrooms and Living/Common Areas, each with their own repair groups (Flooring, Paint, Doors, Closet / Lighting). Interior/General retains the house-wide groups while room-specific costs are now tracked per instance.

## AI Tooling

Built entirely with Claude Code (Anthropic). The design prototype was imported via the Claude Design MCP. Claude wrote all code based on the contest brief, pricing CSV, and design files provided in the project folder.
