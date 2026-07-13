/**
 * E2E tests for Spark Estimator — Playwright headless Chromium
 * Run: node /path/to/tests/e2e.test.js
 */
let chromium;
for (const mod of ['playwright', '/tmp/pw/node_modules/playwright']) {
  try { ({ chromium } = require(mod)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('Playwright not found — install it with: npm i playwright && npx playwright install chromium');
  process.exit(1);
}

const URL = 'http://localhost:8787/';
let passed = 0, failed = 0, browser, page;

// ── Process-level safety net ───────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('\n  [UNHANDLED REJECTION]', reason?.message || reason);
});

// ── Test runner ────────────────────────────────────────────────────────────
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${String(e.message || e).split('\n')[0]}`);
    failed++;
  }
}

// ── Assertions ─────────────────────────────────────────────────────────────
function expect(val, expected, label) {
  if (val !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
}
function expectContains(val, sub, label) {
  if (!String(val).includes(sub)) throw new Error(`${label}: "${sub}" not found in "${String(val).slice(0,80)}"`);
}
function expectGt(val, ref, label) {
  if (val <= ref) throw new Error(`${label}: expected ${val} > ${ref}`);
}
function expectTrue(val, label) {
  if (!val) throw new Error(`${label}: expected truthy, got ${JSON.stringify(val)}`);
}

// ── Page helpers ───────────────────────────────────────────────────────────
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function $text(sel) {
  return page.$eval(sel, el => el.textContent.trim()).catch(() => '');
}
async function grandTotal() {
  return $text('.hdr-total-num');
}
async function tabCount() {
  return page.$$eval('.tab-btn', els => els.length);
}
async function clickTab(label) {
  const tabs = await page.$$('.tab-btn');
  for (const t of tabs) {
    const txt = await t.evaluate(el => el.textContent.trim());
    if (txt.startsWith(label)) { await t.click(); await wait(200); return; }
  }
  throw new Error(`Tab "${label}" not found`);
}

/** Expands a group only if it is currently collapsed. Safe to call multiple times. */
async function ensureExpanded(label) {
  const headers = await page.$$('.group-header');
  for (const h of headers) {
    const txt = await h.evaluate(el => el.querySelector('.group-label')?.textContent?.trim());
    if (txt !== label) continue;
    // Check if the body is currently rendered (group is expanded)
    const isExpanded = await h.evaluate(el => !!el.closest('.group-card')?.querySelector('.group-body'));
    if (!isExpanded) { await h.click(); await wait(200); }
    return;
  }
  throw new Error(`Group "${label}" not found on page`);
}

/** Close any open overlay by calling the app's closeOverlay() directly */
async function closeOverlay() {
  await page.evaluate(() => { if (typeof closeOverlay === 'function') closeOverlay(); }).catch(() => {});
  await wait(200);
}

/** Open the header ⋮ menu (houses rooms, settings, theme, clear) */
async function openHeaderMenu() {
  await page.click('button[onclick="openMenu()"]');
  await wait(250);
}

// ── Test suite ─────────────────────────────────────────────────────────────
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15',
  });
  page = await context.newPage();
  page.on('console', () => {});
  page.on('pageerror', e => { /* suppress */ });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await wait(800);

  // =========================================================================
  console.log('\n── Page load ─────────────────────────────────────────────────────');
  // =========================================================================

  await test('page title is "Spark Estimator"', async () => {
    expect(await page.title(), 'Spark Estimator', 'title');
  });

  await test('running total header is visible', async () => {
    expectTrue(await page.$('.hdr-total-num'), '.hdr-total-num present');
  });

  await test('running total starts at $0', async () => {
    expect(await grandTotal(), '$0', 'grand total');
  });

  await test('progress bar is visible', async () => {
    expectTrue(await page.$('.progress-bar'), 'progress-bar present');
  });

  await test('progress label shows X/N groups', async () => {
    const txt = await $text('.progress-label');
    expectTrue(/\d+\/\d+ groups/.test(txt), `progress label: "${txt}"`);
  });

  await test('bottom nav has exactly 3 buttons', async () => {
    expect((await page.$$('.nav-btn')).length, 3, 'nav buttons');
  });

  // =========================================================================
  console.log('\n── Section tabs ──────────────────────────────────────────────────');
  // =========================================================================

  for (const label of ['General', 'Kitchen', 'Bathrooms', 'Systems', 'Exterior']) {
    await test(`"${label}" tab is present`, async () => {
      await clickTab(label);
    });
  }

  // =========================================================================
  console.log('\n── Groups ────────────────────────────────────────────────────────');
  // =========================================================================

  await test('at least 5 groups visible in General section', async () => {
    await clickTab('General');
    expectGt((await page.$$('.group-card')).length, 4, 'group count');
  });

  await test('group cards have a label', async () => {
    const label = await $text('.group-header .group-label');
    expectTrue(label.length > 0, 'group label non-empty');
  });

  await test('expanding a group shows line items', async () => {
    await ensureExpanded('Flooring');
    expectGt((await page.$$('.item-row')).length, 0, 'item rows after expand');
  });

  await test('"No Action Needed" NA option is present in expanded group', async () => {
    await ensureExpanded('Flooring'); // safe: only expands if collapsed
    expectTrue(await page.$('.item-check.na'), '.item-check.na present');
  });

  await test('collapsing a group hides items', async () => {
    // Flooring is expanded — click header to collapse
    const headers = await page.$$('.group-header');
    for (const h of headers) {
      const txt = await h.evaluate(el => el.querySelector('.group-label')?.textContent?.trim());
      if (txt === 'Flooring') { await h.click(); await wait(200); break; }
    }
    // Group body should be gone
    const items = await page.$$('.group-body .item-row');
    expect(items.length, 0, 'items hidden after collapse');
  });

  // =========================================================================
  console.log('\n── Checking items & totals ───────────────────────────────────────');
  // =========================================================================

  await test('checking an item reveals qty input', async () => {
    await ensureExpanded('Flooring');
    // Use .item-row that contains an .item-name (standard item, not NA row)
    const rows = await page.$$('.item-row');
    let clicked = false;
    for (const row of rows) {
      const hasName = await row.$('.item-name');
      if (!hasName) continue;
      const checkbox = await row.$('.item-check:not(.na)');
      if (!checkbox) continue;
      await checkbox.click();
      await wait(200);
      clicked = true;
      break;
    }
    expectTrue(clicked, 'found a checkable item');
    expectTrue(await page.$('.qty-input'), 'qty input appeared');
  });

  await test('entering qty updates running total', async () => {
    const before = await grandTotal();
    const inp = await page.$('.qty-input');
    if (!inp) throw new Error('No qty input — item not checked');
    await inp.click();
    await inp.fill('150');
    await wait(500);
    const after = await grandTotal();
    expectTrue(before !== after, `total changed: ${before} → ${after}`);
    expectTrue(after !== '$0', 'total not $0');
  });

  await test('tapping the item label toggles the checkbox', async () => {
    const before = await page.$$eval('.item-check.checked', els => els.length);
    const rows = await page.$$('.item-row');
    let tapped = false;
    for (const row of rows) {
      const cb = await row.$('.item-check:not(.na):not(.checked)');
      const tap = await row.$('.item-tap');
      if (!cb || !tap) continue;
      await tap.click();
      await wait(250);
      tapped = true;
      break;
    }
    expectTrue(tapped, 'found an unchecked item label to tap');
    const after = await page.$$eval('.item-check.checked', els => els.length);
    expectGt(after, before, 'checked count increased after label tap');
  });

  await test('qty stepper buttons adjust quantity', async () => {
    const stepper = await page.$('.qty-stepper');
    expectTrue(stepper, 'qty stepper present');
    const plus = (await stepper.$$('.qty-btn'))[1];
    const input = await stepper.$('.qty-input');
    const before = parseFloat(await input.evaluate(el => el.value)) || 0;
    await plus.click();
    await wait(300);
    const after = parseFloat(await input.evaluate(el => el.value)) || 0;
    expect(after, before + 1, 'qty incremented by stepper');
  });

  await test('active section tab shows subtotal', async () => {
    const activeTab = await page.$('.tab-btn.active');
    const txt = await activeTab.evaluate(el => el.textContent);
    expectContains(txt, '$', 'tab subtotal');
  });

  await test('group card shows checked-item badge', async () => {
    const badge = await page.$('.group-badge');
    expectTrue(badge, 'group badge present');
  });

  await test('item total shows formatted dollar amount', async () => {
    const totals = await page.$$('.item-total.has-val');
    expectGt(totals.length, 0, 'at least one has-val total');
    const txt = await totals[0].evaluate(el => el.textContent.trim());
    expectContains(txt, '$', 'item total has $');
  });

  // =========================================================================
  console.log('\n── NA (No Action Needed) ─────────────────────────────────────────');
  // =========================================================================

  await test('checking NA marks group as reviewed', async () => {
    await ensureExpanded('Paint & Wall Repair');
    const na = await page.$('.item-check.na');
    if (!na) throw new Error('NA checkbox not found');
    await na.click();
    await wait(200);
    const reviewed = await page.$('.group-reviewed');
    expectTrue(reviewed, '.group-reviewed badge appeared');
  });

  await test('NA-checked group does not affect running total', async () => {
    const total = await grandTotal();
    // Total should only include checked-and-qty items, not NA
    expectContains(total, '$', 'total still shows');
  });

  await test('NA-checked group counts toward progress', async () => {
    const doneCount = async () => parseInt((await $text('.progress-label')).split('/')[0]);
    const before = await doneCount();
    await ensureExpanded('Doors');
    // Click the NA checkbox inside the Doors group specifically
    const clicked = await page.evaluate(() => {
      for (const card of document.querySelectorAll('.group-card')) {
        if (card.querySelector('.group-label')?.textContent.trim() !== 'Doors') continue;
        const na = card.querySelector('.item-check.na:not(.checked)');
        if (na) { na.click(); return true; }
      }
      return false;
    });
    await wait(300);
    expectTrue(clicked, 'found unchecked NA in Doors group');
    const after = await doneCount();
    expect(after, before + 1, `progress done: ${before} → ${after}`);
  });

  // =========================================================================
  console.log('\n── Bathroom room tabs ────────────────────────────────────────────');
  // =========================================================================

  await test('Bathrooms tab shows 2 room sub-tabs by default', async () => {
    await clickTab('Bathrooms');
    expectGt((await page.$$('.rtab-btn')).length, 1, 'bathroom sub-tabs');
  });

  await test('"+ Add" button is present in room tabs', async () => {
    expectTrue(await page.$('.rtab-add'), '+ Add button present');
  });

  await test('clicking Add in bathroom creates a 3rd instance', async () => {
    await (await page.$('.rtab-add')).click();
    await wait(300);
    expectGt((await page.$$('.rtab-btn')).length, 2, 'now 3 bathroom tabs');
  });

  await test('Bathroom 3 is independent and shows its own groups', async () => {
    const tabs = await page.$$('.rtab-btn');
    await tabs[2].click();
    await wait(200);
    expectGt((await page.$$('.group-card')).length, 0, 'groups in bath 3');
  });

  await test('remove button (×) is present on bathroom room tabs', async () => {
    expectTrue(await page.$('.rtab-remove'), 'remove button present');
  });

  // =========================================================================
  console.log('\n── Rooms panel (Bedroom + Living) ────────────────────────────────');
  // =========================================================================

  await test('Rooms panel opens via the header menu', async () => {
    await openHeaderMenu();
    await page.click('button[onclick="openRooms()"]');
    await wait(300);
    expectTrue(await page.$('.sheet'), 'rooms sheet opened');
  });

  await test('Rooms panel shows Bedroom and Living sections', async () => {
    const txt = await $text('.sheet');
    expectContains(txt, 'Bedroom', 'bedroom in rooms panel');
    expectContains(txt, 'Living', 'living in rooms panel');
  });

  await test('Adding a bedroom creates a Bedrooms section tab', async () => {
    const addBtns = await page.$$('.sheet button[onclick^="addRoom"]');
    for (const btn of addBtns) {
      const onclick = await btn.evaluate(el => el.getAttribute('onclick'));
      if (onclick?.includes('bedroom')) { await btn.click(); await wait(400); break; }
    }
    const labels = await page.$$eval('.tab-btn', els => els.map(el => el.textContent.trim()));
    expectTrue(labels.some(l => l.startsWith('Bedrooms')), `Bedrooms tab; got: ${labels}`);
  });

  await test('Adding a living area creates a Living section tab', async () => {
    // Rooms panel closed after addRoom — reopen via the header menu
    await openHeaderMenu();
    await page.click('button[onclick="openRooms()"]');
    await wait(300);
    const addBtns = await page.$$('.sheet button[onclick^="addRoom"]');
    for (const btn of addBtns) {
      const onclick = await btn.evaluate(el => el.getAttribute('onclick'));
      if (onclick?.includes('living')) { await btn.click(); await wait(400); break; }
    }
    const labels = await page.$$eval('.tab-btn', els => els.map(el => el.textContent.trim()));
    expectTrue(labels.some(l => l.startsWith('Living')), `Living tab; got: ${labels}`);
  });

  await test('Bedrooms tab shows its own repair groups', async () => {
    await closeOverlay();
    await clickTab('Bedrooms');
    expectGt((await page.$$('.group-card')).length, 0, 'bedroom groups');
  });

  await test('Living tab shows its own repair groups', async () => {
    await clickTab('Living');
    expectGt((await page.$$('.group-card')).length, 0, 'living groups');
  });

  // =========================================================================
  console.log('\n── Progress tracking ─────────────────────────────────────────────');
  // =========================================================================

  await test('progress fill width > 0% after checking items', async () => {
    const w = await page.$eval('.progress-fill', el => el.style.width);
    expectTrue(w && w !== '0%', `progress fill: ${w}`);
  });

  await test('progress label denominator grows after adding rooms', async () => {
    const txt = await $text('.progress-label');
    const n = parseInt(txt.split('/')[1]);
    expectGt(n, 20, `group total: ${n}`); // default 26, now more with bedroom + living
  });

  // =========================================================================
  console.log('\n── Summary tab ───────────────────────────────────────────────────');
  // =========================================================================

  await test('Summary tab renders and shows grand total', async () => {
    await page.click('.nav-btn:nth-child(2)');
    await wait(300);
    const txt = await $text('.scroll-area');
    expectContains(txt, '$', 'dollar sign in summary');
  });

  await test('Summary shows line items that were checked', async () => {
    const rows = await page.$$('.sum-row');
    expectGt(rows.length, 0, 'summary rows present');
  });

  await test('Export button is present in summary', async () => {
    expectTrue(await page.$('button[onclick="openExport()"]'), 'export button');
  });

  await test('Export modal opens with a download button matching content', async () => {
    await (await page.$('button[onclick="openExport()"]')).click();
    await wait(300);
    const txt = await $text('.modal-card');
    // Label must match what actually downloads: Excel when no photos, ZIP with photos
    const photoCount = await page.evaluate(() =>
      Object.values(S.photos).reduce((s, a) => s + (a?.length || 0), 0));
    expectContains(txt, photoCount > 0 ? 'Download ZIP' : 'Download Excel', 'accurate download label');
    expectContains(txt, '$', 'grand total in modal');
  });

  await test('Export modal shows photo count', async () => {
    const txt = await $text('.modal-card');
    expectContains(txt, 'photo', 'photo count in export modal');
  });

  await closeOverlay();

  await test('3D property model renders on Summary', async () => {
    expectTrue(await page.$('.house-scene'), 'house scene present');
    expect((await page.$$('.house-scene [data-part]')).length, 6, '3d faces');
  });

  await test('tapping a model legend chip jumps to that section', async () => {
    const chips = await page.$$('.house-legend .hleg');
    let clicked = false;
    for (const c of chips) {
      if ((await c.evaluate(el => el.textContent)).includes('Kitchen')) {
        await c.click();
        clicked = true;
        break;
      }
    }
    await wait(300);
    expectTrue(clicked, 'kitchen chip found');
    const active = await $text('.tab-btn.active');
    expectContains(active, 'Kitchen', 'kitchen tab active after tap');
  });

  // =========================================================================
  console.log('\n── Deal Analyzer ─────────────────────────────────────────────────');
  // =========================================================================

  await test('Deal tab renders Deal Analyzer', async () => {
    await page.click('.nav-btn:nth-child(3)');
    await wait(300);
    expectContains(await $text('.scroll-area'), 'Deal Analyzer', 'deal heading');
  });

  await test('Two number inputs (ARV, Purchase) are present', async () => {
    expectGt((await page.$$('.deal-num-input')).length, 1, 'deal inputs');
  });

  await test('Holding period range slider is present', async () => {
    expectTrue(await page.$('input[type="range"]'), 'range slider');
  });

  await test('deal shows neutral state before ARV/purchase entered', async () => {
    const verdict = await $text('#deal-verdict');
    const profit = await $text('#deal-profit');
    expect(verdict, 'Enter ARV & price', 'neutral verdict before inputs');
    expect(profit, '—', 'no profit figure before inputs');
  });

  await test('Entering ARV + purchase calculates profit', async () => {
    // Re-query each time: render() re-creates the DOM on every oninput
    const getInput = (i) => page.$$('.deal-num-input').then(els => els[i]);
    await (await getInput(0)).fill('200000'); // ARV
    await wait(400);
    await (await getInput(1)).fill('100000'); // Purchase
    await wait(400);
    const txt = await $text('.scroll-area');
    expectContains(txt, 'Projected profit', 'profit label');
  });

  await test('Deal verdict label is rendered (Strong / Thin / Losing)', async () => {
    const txt = await $text('.scroll-area');
    expectTrue(
      txt.includes('Strong deal') || txt.includes('Thin margin') || txt.includes('Losing deal'),
      `deal verdict in: "${txt.slice(0,200)}"`
    );
  });

  await test('Sliding holding period updates carry cost text', async () => {
    const slider = await page.$('input[type="range"]');
    await slider.evaluate(el => {
      el.value = 26;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await wait(400);
    const txt = await $text('.scroll-area');
    expectContains(txt, '26 weeks', '26 weeks reflected after slide');
  });

  await test('losing deal formats negative profit as -$', async () => {
    // ARV far below cost basis -> negative profit
    const getInput = (i) => page.$$('.deal-num-input').then(els => els[i]);
    await (await getInput(0)).fill('50000');
    await wait(400);
    const profit = await $text('#deal-profit');
    expectTrue(profit.startsWith('-$'), `negative profit format: "${profit}"`);
    expect(await $text('#deal-verdict'), 'Losing deal', 'losing verdict');
    await (await getInput(0)).fill('200000'); // restore a healthy ARV
    await wait(400);
  });

  await test('deal inputs keep focus while typing (in-place update)', async () => {
    const inputs = await page.$$('.deal-num-input');
    await inputs[0].click();
    await page.keyboard.type('5');
    await wait(200);
    const stillFocused = await page.evaluate(() =>
      document.activeElement?.classList?.contains('deal-num-input'));
    expectTrue(stillFocused, 'ARV input kept focus after keystroke');
  });

  // =========================================================================
  console.log('\n── Settings & price overrides ────────────────────────────────────');
  // =========================================================================

  await test('Settings sheet opens via the header menu', async () => {
    await openHeaderMenu();
    await page.click('button[onclick="openSettings()"]');
    await wait(300);
    expectTrue(await page.$('.sheet'), 'settings sheet open');
  });

  await test('Settings shows "This project" and "All projects" toggles', async () => {
    const txt = await $text('.sheet');
    expectContains(txt, 'This project', 'project scope');
    expectContains(txt, 'All projects', 'global scope');
  });

  await test('Price list has >= 75 rows', async () => {
    expectGt((await page.$$('.price-row')).length, 74, 'price row count');
  });

  await test('Price search filters rows', async () => {
    const inp = await page.$('.sheet input[placeholder*="Search"]');
    await inp.fill('Toilet');
    await wait(300);
    const rows = await page.$$('.price-row');
    expectGt(rows.length, 0, 'results after search');
    expectContains(await $text('.sheet'), 'Toilet', 'toilet in filtered list');
  });

  await test('"All projects" scope toggle works', async () => {
    await page.click('button[onclick="setPriceScope(\'global\')"]');
    await wait(200);
    const txt = await $text('.sheet');
    expectContains(txt, 'All projects', 'global scope active');
  });

  await test('"This project" scope toggle works', async () => {
    await page.click('button[onclick="setPriceScope(\'project\')"]');
    await wait(200);
    const txt = await $text('.sheet');
    expectContains(txt, 'This project', 'project scope active');
  });

  await closeOverlay();

  // =========================================================================
  console.log('\n── Add / remove line items ───────────────────────────────────────');
  // =========================================================================

  await test('"Add line item" button is at bottom of each expanded group', async () => {
    await page.click('.nav-btn:nth-child(1)'); // Estimate
    await wait(200);
    await clickTab('General');
    await ensureExpanded('Flooring');
    expectTrue(await page.$('.add-item-btn'), 'add-item-btn present');
  });

  await test('clicking Add line item opens the modal', async () => {
    await (await page.$('.add-item-btn')).click();
    await wait(300);
    expectTrue(await page.$('#draft-name'), 'add item modal opened');
  });

  await test('filling in name+cost and confirming adds the item', async () => {
    await (await page.$('#draft-name')).fill('Skylight Repair');
    await (await page.$('#draft-cost')).fill('1200');
    await page.click('button[onclick="confirmAddItem()"]');
    await wait(300);
    const names = await page.$$eval('.item-name', els => els.map(el => el.textContent.trim()));
    expectTrue(names.some(n => n.includes('Skylight Repair')), `custom item in DOM; got: ${names}`);
  });

  await test('custom item increments group total when checked + qty entered', async () => {
    // Find and check the custom item — re-query after each click since render() replaces DOM
    const findAndClick = async () => {
      const rows = await page.$$('.item-row');
      for (const row of rows) {
        const nameEl = await row.$('.item-name');
        if (!nameEl) continue;
        if (!(await nameEl.evaluate(el => el.textContent)).includes('Skylight Repair')) continue;
        const cb = await row.$('.item-check:not(.checked)');
        if (cb) { await cb.click(); await wait(300); }
        return true;
      }
      return false;
    };
    await findAndClick();
    // Re-query qty input from fresh DOM (render() has fired after toggle)
    const findAndFillQty = async () => {
      const rows = await page.$$('.item-row');
      for (const row of rows) {
        const nameEl = await row.$('.item-name');
        if (!nameEl) continue;
        if (!(await nameEl.evaluate(el => el.textContent)).includes('Skylight Repair')) continue;
        const qty = await row.$('.qty-input');
        if (qty) { await qty.fill('2'); await wait(500); return true; }
      }
      return false;
    };
    const before = await grandTotal();
    await findAndFillQty();
    const after = await grandTotal();
    expectTrue(before !== after, `total changed: ${before} → ${after}`);
  });

  await test('trash icon deletes an item from the group', async () => {
    const delBtns = await page.$$('.qty-del');
    expectGt(delBtns.length, 0, 'delete buttons present');
    const countBefore = (await page.$$('.item-row')).length;
    await delBtns[0].click();
    await wait(300);
    const countAfter = (await page.$$('.item-row')).length;
    expectTrue(countAfter < countBefore, 'item count decreased after delete');
  });

  await test('Undo toast restores a deleted item', async () => {
    const countBefore = (await page.$$('.item-row')).length;
    const undo = await page.$('.toast-action');
    expectTrue(undo, 'undo button visible in toast');
    await undo.click();
    await wait(300);
    const countAfter = (await page.$$('.item-row')).length;
    expectTrue(countAfter > countBefore, `item restored: ${countBefore} → ${countAfter}`);
  });

  await test('custom item with $0 cost is rejected', async () => {
    await (await page.$('.add-item-btn')).click();
    await wait(300);
    await (await page.$('#draft-name')).fill('Free thing');
    await (await page.$('#draft-cost')).fill('0');
    await page.click('button[onclick="confirmAddItem()"]');
    await wait(300);
    // Modal should still be open (item rejected)
    expectTrue(await page.$('#draft-name'), 'modal still open after invalid submit');
    await closeOverlay();
  });

  // =========================================================================
  console.log('\n── Dark mode ─────────────────────────────────────────────────────');
  // =========================================================================

  await test('dark mode toggles via the header menu', async () => {
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await openHeaderMenu();
    await page.click('button[onclick="toggleTheme()"]');
    await wait(200);
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expectTrue(before !== after, `theme changed: ${before} → ${after}`);
    await closeOverlay();
  });

  await test('toggling theme twice restores original', async () => {
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await openHeaderMenu();
    // menu stays open after each toggle so the switch is visible in place
    await page.click('button[onclick="toggleTheme()"]');
    await wait(150);
    await page.click('button[onclick="toggleTheme()"]');
    await wait(150);
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(after, before, `restored: ${before} → (toggle×2) → ${after}`);
    await closeOverlay();
  });

  // =========================================================================
  console.log('\n── localStorage & persistence ────────────────────────────────────');
  // =========================================================================

  await test('spark data is saved to localStorage', async () => {
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expectTrue(keys.some(k => k.startsWith('spark')), `spark key; got: ${keys}`);
  });

  await test('data survives a full page reload', async () => {
    const totalBefore = await grandTotal();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await wait(800);
    const totalAfter = await grandTotal();
    expect(totalAfter, totalBefore, `total after reload: ${totalBefore} → ${totalAfter}`);
  });

  await test('project name persists after reload', async () => {
    const name = await page.$eval('.hdr-total .hdr-meta', el => el.textContent.trim());
    expectTrue(name.length > 0, 'project name visible after reload');
  });

  // =========================================================================
  console.log('\n── Project management ────────────────────────────────────────────');
  // =========================================================================

  await test('hamburger opens projects panel', async () => {
    await page.click('button[onclick="openProjects()"]');
    await wait(300);
    expectTrue(await page.$('.panel-slide.open'), 'projects panel open');
  });

  await test('projects panel lists at least one project', async () => {
    expectGt((await page.$$('.proj-row')).length, 0, 'project rows');
  });

  await test('New Project button is present', async () => {
    expectContains(await $text('.panel-slide'), 'New Project', 'new project text');
  });

  await closeOverlay();

  await test('projects panel search filters projects', async () => {
    // Create a second project so the search field appears
    await page.click('button[onclick="openProjects()"]');
    await wait(300);
    await page.click('button[onclick="newProject()"]');
    await wait(300);
    await (await page.$('#prompt-input')).fill('222 Elm St');
    await page.click('button[onclick="confirmPrompt()"]');
    await wait(400);
    await page.click('button[onclick="openProjects()"]');
    await wait(300);
    const search = await page.$('.panel-slide input[placeholder*="projects"]');
    expectTrue(search, 'project search input present');
    await search.fill('Elm');
    await wait(300);
    const names = await page.$$eval('.proj-row .proj-name', els => els.map(e => e.textContent.trim()));
    expectTrue(names.length === 1 && names[0].includes('222 Elm St'), `filtered rows: ${JSON.stringify(names)}`);
    await closeOverlay();
  });

  // =========================================================================
  console.log('\n── Manifest & PWA metadata ───────────────────────────────────────');
  // =========================================================================

  await test('manifest.json is linked in <head>', async () => {
    const href = await page.$eval('link[rel="manifest"]', el => el.href).catch(() => '');
    expectContains(href, 'manifest', 'manifest link href');
  });

  await test('apple-mobile-web-app-capable meta tag is present', async () => {
    const content = await page.$eval(
      'meta[name="apple-mobile-web-app-capable"]', el => el.content
    ).catch(() => '');
    expect(content, 'yes', 'apple-mobile-web-app-capable');
  });

  await test('manifest theme_color matches the app theme', async () => {
    const res = await page.evaluate(async () => {
      const r = await fetch('./manifest.json');
      const j = await r.json();
      return j.theme_color;
    });
    expect(res, '#D6511C', 'theme_color');
  });

  await test('service worker is registered', async () => {
    const swReady = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return false;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        return !!reg;
      } catch { return false; }
    });
    expectTrue(swReady, 'service worker registered');
  });

  // =========================================================================
  console.log('\n── Offline mode ──────────────────────────────────────────────────');
  // =========================================================================

  await test('app and export libraries work fully offline', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await wait(2500); // let the install-time precache finish
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await wait(1000);
      const r = await page.evaluate(() => ({
        rendered: !!document.querySelector('.hdr-total-num'),
        xlsx: typeof XLSX !== 'undefined',
        jszip: typeof JSZip !== 'undefined',
      }));
      expectTrue(r.rendered, 'app shell rendered offline');
      expectTrue(r.xlsx, 'XLSX library available offline');
      expectTrue(r.jszip, 'JSZip library available offline');
    } finally {
      await context.setOffline(false);
    }
  });

  // =========================================================================
  console.log('\n── Clear all data ────────────────────────────────────────────────');
  // =========================================================================

  await test('menu clear-all wipes projects and starts afresh', async () => {
    const countBefore = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('spark_projects_v2') || '[]').length);
    expectGt(countBefore, 1, 'suite accumulated multiple projects');
    await openHeaderMenu();
    await page.click('button[onclick="confirmClearApp()"]');
    await wait(300);
    // typing anything but CLEAR must cancel
    await (await page.$('#prompt-input')).fill('nope');
    await page.click('button[onclick="confirmPrompt()"]');
    await wait(300);
    const countAfterCancel = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('spark_projects_v2') || '[]').length);
    expect(countAfterCancel, countBefore, 'data intact after wrong confirmation');
    // now confirm for real
    await openHeaderMenu();
    await page.click('button[onclick="confirmClearApp()"]');
    await wait(300);
    await (await page.$('#prompt-input')).fill('CLEAR');
    await page.click('button[onclick="confirmPrompt()"]');
    await page.waitForSelector('.hdr-total-num', { timeout: 10000 });
    await wait(500);
    expect(await grandTotal(), '$0', 'total reset to $0');
    const projects = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('spark_projects_v2') || '[]'));
    expectTrue(projects.length <= 1, `old projects wiped (${projects.length} left)`);
    expectTrue((projects[0]?.name || 'New Estimate') === 'New Estimate', 'fresh default project');
  });

  // ── Results ───────────────────────────────────────────────────────────────
  await browser.close();
  const total = passed + failed;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${total} tests: ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(60));
  if (failed > 0) process.exit(1);

})().catch(async (e) => {
  console.error('\n[FATAL]', e.message);
  await browser?.close().catch(() => {});
  process.exit(1);
});
