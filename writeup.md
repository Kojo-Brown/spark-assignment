# Spark Estimator — Submission Writeup
**Kojo Brown · kojo@email.com · github.com/Kojo-Brown/spark-assignment**

---

## 1. Most Interesting Design Decision

**The state key architecture that makes multi-room work.**

Every repair item in the app is stored as a single flat key: `{instanceId}:{itemId}`. For example, `bath_1:ba-04` and `bath_2:ba-04` are independent entries — the same toilet line item tracked separately for Bathroom 1 and Bathroom 2. Adding a third bathroom, a bedroom, or a living area just pushes new instance IDs onto the section; no special-casing, no nested structure, no migration.

This design paid off when the brief asked for Bedrooms and Living Areas to be decoupled from Interior/General. I didn't restructure the data model — I created new section types pointing at new group definitions, and the existing key scheme handled the rest. Every calculation, export row, and progress counter already operated on keys, so multi-room support was additive rather than a rewrite.

The UX implication: agents can add and remove rooms freely mid-walkthrough because rooms are just instance lists. Removing a room deletes its key prefix from state. Adding one initializes an empty key set. There is no hidden data, no orphaned cost.

---

## 2. What Is Broken or Fragile

**Photo storage hits localStorage limits fast.** Photos are compressed and stored as base64 strings in `localStorage`. A single compressed JPEG is ~80–120KB. Ten photos across a walkthrough can push toward the 5MB limit on Safari. The app now warns the agent with a toast when a save has to drop photos, but the durable fix is IndexedDB for binary blobs.

**Serial OCR is best-effort.** The Tesseract pass runs on the compressed photo and appliance labels vary wildly — glare, curved surfaces, and dot-matrix prints defeat it. The regex prefers explicit "S/N:" prefixes and falls back to the longest alphanumeric run, so false positives are possible. Every detected serial is therefore shown as an editable badge rather than trusted silently, and the first scan needs a network connection to fetch the OCR engine.

**The render model is rebuild-by-default.** Checking an item regenerates the whole view. It's fast at this DOM size and the hot paths (qty typing, Deal Analyzer, price search) are patched in place, but a much larger price list would eventually need keyed diffing.

---

## 3. Creative Additions — Deal Analyzer & Serial OCR

The Deal Analyzer is a live profit calculator embedded in a third tab alongside the walkthrough and summary.

**Why I built it:** An acquisition agent standing in a house already has two numbers in their head — what they think the house will sell for after repairs (ARV) and what they're planning to offer. The app already has the third number: the live repair total from the walkthrough. Connecting all three takes thirty seconds of input and immediately answers the question every walkthrough is really about: *does this deal make money?*

**What it does:** Enter ARV and purchase price. Slide the holding period (2–52 weeks). The app calculates carry cost at 1.5% monthly, adds it to purchase + repairs, subtracts from ARV, and shows projected profit, ROI percentage, and a verdict label (Strong deal / Thin margin / Losing deal). A stacked bar breaks the cost basis into four segments: purchase, repairs, carry, and profit.

**The practical value:** Agents currently have to leave the property, open a spreadsheet, and run the math later. With the Deal Analyzer, a go/no-go decision happens before they walk out the door — while the property context is still fresh. The repair estimate feeds it automatically; they only type two numbers.

**Serial number OCR** (the "significant plus" from the brief): when an agent photographs a furnace or water heater label, the app lazy-loads Tesseract.js, OCRs the photo in-browser, and extracts the serial number — preferring explicit "S/N:" prefixes, falling back to the longest alphanumeric run. The result appears as a tappable, editable badge; serials flow into the Excel export as a dedicated table and into photo filenames. No server, and after the first use the OCR engine is cached for offline work.

---

## 4. What I'd Ship Next (Two More Days)

**Day 1 — IndexedDB photo storage + per-group notes.** Move photo blobs out of `localStorage` into IndexedDB so a full walkthrough (30+ photos) never hits the quota, with the same export path. Add a free-text notes field to each group for flagging things that don't fit a line item (e.g., "previous water damage visible under sink").

**Day 2 — Shareable export link.** Right now the only output is a ZIP download. I'd add a "Copy share link" button that encodes the full project state as a compressed, base64-encoded URL fragment — no server required, just `LZString` compression. The recipient opens the link and sees a read-only summary they can open in the same app.

---

## 5. AI Tooling

This project was built entirely using **Claude Code** (Anthropic's CLI). I used it to:
- Read and interpret the contest brief, pricing CSV, and design prototype
- Write the initial implementation and all subsequent iterations
- Debug rendering bugs, fix the price scope toggle logic, and refactor the prompt/confirm dialogs to mobile-safe custom modals
- Generate the PWA icons from the provided logo using macOS `sips`

The design prototype was imported via the Claude Design MCP, which gave Claude direct access to the Figma-equivalent spec including color variables, animation names, and overlay dimensions. Every line of code was written or reviewed through Claude Code. I treated it as a pair programmer: I described the architecture decisions and it executed them. I caught and corrected several of its assumptions — particularly around localStorage limits, the partial re-render strategy for qty inputs, and the mobile-safe modal requirement.

AI handled speed. I handled judgment.
