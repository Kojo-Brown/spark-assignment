# Spark Estimator — Submission Writeup
**Kojo Brown · kojobro67@gmail.com · [Live demo](https://kojo-brown.github.io/spark-assignment/) · [github.com/Kojo-Brown/spark-assignment](https://github.com/Kojo-Brown/spark-assignment)**

---

## 1. Most Interesting Design Decision

**A flat state-key architecture that makes multi-room support free.** Every repair item is stored under one key: `{instanceId}:{itemId}` — so `bath_1:ba-04` and `bath_2:ba-04` are independent toilets in independent bathrooms. Adding a third bathroom, a bedroom, or a living area just pushes a new instance id onto a section; every calculation, export row, and progress counter already operates on keys, so the brief's "decouple Bedrooms and Living from Interior/General" requirement was additive, not a rewrite. Removing a room deletes its key prefix — no hidden data, no orphaned cost. The UX consequence: agents add and remove rooms freely mid-walkthrough and the running total is always exactly the sum of what's on screen.

## 2. What Is Broken or Fragile

**Photo storage rides the localStorage quota.** Compressed JPEGs are ~80–120KB as base64; a photo-heavy walkthrough can approach Safari's ~5MB cap. The app degrades gracefully (a toast warns and the estimate itself always survives), but the durable fix is IndexedDB for binary blobs. **Serial OCR is best-effort:** glare, curves, and dot-matrix labels defeat Tesseract, and the first scan needs a network fetch of the engine — so every detected serial is an editable badge, never silently trusted. **Rendering is rebuild-by-default:** fast at this DOM size, and hot paths (qty, deal inputs, searches) patch in place, but a much larger catalog would need keyed diffing.

## 3. Creative Additions & Why

**Deal Analyzer** — an agent in a driveway has ARV and offer price in their head; the app already has the third number (live repair total). Two inputs plus a holding-period slider produce carry cost (1.5%/mo), total basis, projected profit, ROI, and a Strong/Thin/Losing verdict — the go/no-go answered before leaving the property. **3D Property Model** — a CSS-3D house (no libraries, offline) on the Summary tab where roof = Exterior, foundation = Systems, and the walls = General/Kitchen/Bathrooms/Bed+Living. Faces fill with color as sections are reviewed, and tapping a face jumps to that section — progress you can read at a glance, doubling as navigation. **Serial OCR** (the brief's "significant plus") — photos are OCR'd in-browser and serials flow into the Excel export and photo filenames.

## 4. What I'd Ship Next (Two More Days)

**Day 1 — IndexedDB photo storage + per-group notes.** Move photo blobs out of localStorage so a 30-photo walkthrough never hits quota, same export path; add a free-text note per group for issues that don't fit a line item ("water damage under sink"). **Day 2 — Shareable read-only link.** Encode the full project as a compressed URL fragment (LZString, no server) so an agent can text the team a link that opens as a read-only summary in the same app.

## 5. AI Tooling

Built entirely with **Claude Code** (Anthropic): it read the brief, pricing CSV, and reference app, wrote and iterated every feature, and drove headless-browser verification of each change (down to hand-checked math in the Excel output). I directed the architecture and caught its wrong assumptions — localStorage limits, focus-loss on re-render, mobile-safe modals. The test suites it maintained (63 unit + 83 Playwright e2e) gated every commit. AI supplied speed; I supplied judgment.
