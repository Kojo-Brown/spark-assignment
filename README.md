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
- Searchable project list, with saved date and estimate total on every row
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

### Photo Capture & Serial Numbers
- Attach photos to any serial-number item (Furnace, A/C, Water Heater, Fridge, etc.)
- Camera trigger works on Android (file input + capture attribute) and iOS
- Photos are compressed before storage to stay within `localStorage` limits
- Each photo can be removed individually
- **Serial number capture** — after a photo is taken the app runs a best-effort OCR pass (Tesseract.js, lazy-loaded) and extracts the serial number; a tappable badge shows the result and can be edited or entered manually at any time. Serials are included in the Excel export and in photo filenames.

### Export
- **ZIP download** containing an Excel `.xlsx` cost breakdown and all walkthrough photos
- Excel file: every checked item, quantity, unit cost, line total, section subtotals, grand total, and a captured serial-numbers table
- Photo filenames include the room, item name, and serial number for easy triage
- If no photos, exports a standalone `.xlsx` directly — and the button says so: **Download Excel** with no photos, **Download ZIP** once photos are attached
- Formatted with brand-colored section headers, styled columns, and grand total row
- Works fully offline — the export libraries are precached by the service worker

### Design
- **Emerald & gold theme** — gradient hero total card, warm-stone light mode, deep-forest dark mode
- Every icon is a real inline SVG — no emoji glyphs anywhere in the UI
- Built for one-thumb use in the field: tapping an item's label toggles it (not just the checkbox), and every quantity field has −/+ stepper buttons
- Safe-area-aware header, tabs, and nav for notched phones

### 3D Property Model (Creative Addition)
An interactive CSS-3D house on the Summary tab — zero libraries, fully offline:
- Each face maps to a walkthrough section: roof = Exterior, foundation = Systems, walls = General / Kitchen / Bathrooms / Bed & Living
- Faces fill with emerald as their section's groups are checked or reviewed — progress you can see at a glance
- Legend chips show live percent complete and cost per section
- Drag to rotate (gentle idle spin until touched; respects `prefers-reduced-motion`); tap any face or chip to jump straight to that section

### Deal Analyzer (Creative Addition)
A built-in profit calculator that pulls the live repair total from the walkthrough and lets agents estimate the deal's margin before they leave the driveway:
- Enter ARV (After Repair Value) and purchase price
- Slide the holding period (2–52 weeks); carry cost auto-calculates at 1.5% monthly
- Projected profit, ROI, and a deal verdict ("Strong deal / Thin margin / Losing deal")
- Stacked cost bar showing purchase / repairs / carry / profit breakdown

### PWA
- Service worker with stale-while-revalidate caching — full offline support, and deployed fixes reach installed devices on the next launch
- CDN libraries (xlsx, JSZip, fonts) are precached so export works offline
- Web app manifest + apple-touch-icon — installable to home screen on Android and iOS
- Dark mode (auto-detects system preference, toggle in header)
- Smooth slide-in panel and bottom-sheet modals

## Libraries Used

All loaded via CDN — no build step required:

| Library | Purpose |
|---------|---------|
| [xlsx-js-style](https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/) | Formatted Excel export |
| [JSZip](https://cdn.jsdelivr.net/npm/jszip@3.10.1/) | Bundle Excel + photos into ZIP |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | Serial number OCR (lazy-loaded on first photo) |
| [Geist](https://fonts.google.com/specimen/Geist) | Typography (Google Fonts) |

## File Structure

```
spark-assignment/
├── index.html      # Complete app — single self-contained file
├── manifest.json   # PWA manifest
├── sw.js           # Service worker (offline support)
├── tests/
│   ├── unit.test.js   # Pure-logic tests (node tests/unit.test.js)
│   └── e2e.test.js    # Playwright browser tests
└── README.md
```

## Testing

```bash
# Unit tests — no dependencies
node tests/unit.test.js

# E2E tests — needs Playwright and a local server on :8787
npm i playwright && npx playwright install chromium
python3 -m http.server 8787 &
node tests/e2e.test.js
```

## Design Decisions

**Single-file first.** All logic, styles, and data live in `index.html`. The service worker and manifest are the only additional files because the browser requires them to be separate for PWA installation.

**No framework.** Vanilla JS with string-template rendering. The state object is mutated directly; `render()` regenerates the DOM from scratch on each state change, except for hot paths — quantity inputs, the Deal Analyzer, and the price search — which patch only the affected DOM nodes so inputs never lose focus and sliders stay smooth.

**Per-instance state keys.** Every item is stored as `${instanceId}:${itemId}` in the items map. This means the same repair item (e.g., vinyl plank flooring) can be independently tracked across Bathroom 1, Bathroom 2, Bedroom 1, etc. without any key collisions.

**Room architecture expanded.** The reference app only had bathrooms as multi-instance rooms. This version adds Bedrooms and Living/Common Areas, each with their own repair groups (Flooring, Paint, Doors, Closet / Lighting). Interior/General retains the house-wide groups while room-specific costs are now tracked per instance.

## AI Tooling

Built entirely with Claude Code (Anthropic). The design prototype was imported via the Claude Design MCP. Claude wrote all code based on the contest brief, pricing CSV, and design files provided in the project folder.
