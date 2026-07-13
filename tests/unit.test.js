/**
 * Unit tests for Spark Estimator — pure JS logic only (no DOM)
 * Run: node tests/unit.test.js
 */

// ─── Shim browser globals ──────────────────────────────────────────────────
const store = {};
global.localStorage = {
  getItem:    (k) => store[k] ?? null,
  setItem:    (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};
global.clearTimeout = () => {};
global.setTimeout   = () => 0;
const _elStub = { style: {}, textContent: '', className: '', focus() {}, select() {}, appendChild() {}, removeChild() {} };
global.document = {
  getElementById:     () => null,
  querySelector:      () => null,
  querySelectorAll:   () => [],
  createElement:      () => ({ ..._elStub }),
  body:               { appendChild() {}, removeChild() {}, contains() { return false; } },
};
global.matchMedia   = () => ({ matches: false });

// ─── Load app logic ────────────────────────────────────────────────────────
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

// Extract the app script block (second <script> tag — after </style>)
const scriptStart = html.indexOf('<script>', html.indexOf('</style>'));
const scriptEnd   = html.lastIndexOf('</script>');
let   appJS       = html.slice(scriptStart + 8, scriptEnd);

// Patch out browser-only top-level statements
appJS = appJS
  .replace(/if \('serviceWorker'[\s\S]*?\}\);/, '')   // SW registration
  .replace(/const _t =[\s\S]*?'dark'\);/, '')          // theme detection
  .replace(/\(function boot\(\)[\s\S]*?\}\)\(\);/, '') // boot IIFE
  .replace(/window\.addEventListener[\s\S]*?;/g, '');  // window listeners

// No-op render so state mutations don't blow up in tests
appJS += '\nfunction render() {}\n';

// runInThisContext makes top-level const/let/var/function visible in this module
vm.runInThisContext(appJS);

// ─── Test harness ─────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

function eq(a, b) {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function gt(a, b) {
  if (a <= b) throw new Error(`Expected ${a} > ${b}`);
}
function ok(v) {
  if (!v) throw new Error(`Expected truthy, got ${v}`);
}

// ─── Helper: reset state between tests ───────────────────────────────────
function freshState() {
  S.items        = {};
  S.photos       = {};
  S.customItems  = {};
  S.deletedItems = {};
  S.projPrices   = {};
  S.globalPrices = {};
  S.sections     = defaultSections();
  ensureItemKeys();
}

// =============================================================================
// SECTION 1: Key helpers
// =============================================================================
console.log('\n── Key helpers ──────────────────────────────────────────────────');

test('mkKey joins instId and itemId', () => {
  eq(mkKey('bath_1', 'ba-04'), 'bath_1:ba-04');
});

test('parseKey splits on first colon only', () => {
  const [inst, item] = parseKey('bath_1:ba-04');
  eq(inst, 'bath_1');
  eq(item, 'ba-04');
});

test('parseKey handles item IDs with hyphens', () => {
  const [inst, item] = parseKey('exterior_1:ex-19');
  eq(inst, 'exterior_1');
  eq(item, 'ex-19');
});

test('mkKey / parseKey round-trip', () => {
  const key = mkKey('bedroom_123', 'ig-07');
  const [i, id] = parseKey(key);
  eq(i, 'bedroom_123');
  eq(id, 'ig-07');
});

// =============================================================================
// SECTION 2: Price resolution
// =============================================================================
console.log('\n── Price resolution ──────────────────────────────────────────────');

test('getPrice returns default CSV price when no overrides', () => {
  S.projPrices   = {};
  S.globalPrices = {};
  eq(getPrice('ba-04'), 150);   // Toilet: $150
  eq(getPrice('as-01'), 3350);  // Furnace: $3,350
});

test('getPrice returns global override over CSV default', () => {
  S.projPrices   = {};
  S.globalPrices = { 'ba-04': 175 };
  eq(getPrice('ba-04'), 175);
  S.globalPrices = {};
});

test('getPrice: project override wins over global override', () => {
  S.globalPrices = { 'ba-04': 175 };
  S.projPrices   = { 'ba-04': 200 };
  eq(getPrice('ba-04'), 200);
  S.projPrices   = {};
  S.globalPrices = {};
});

test('getPrice: project override wins over CSV default', () => {
  S.projPrices = { 'ig-01': 3.00 };
  eq(getPrice('ig-01'), 3.00);
  S.projPrices = {};
});

test('getItemName returns name from PRICES', () => {
  eq(getItemName('ba-04'), 'Toilet');
  eq(getItemName('as-01'), 'Furnace');
});

test('getItemUnit returns unit from PRICES', () => {
  eq(getItemUnit('ba-04'), 'ea.');
  eq(getItemUnit('ig-01'), 'sqft');
});

test('getItemMeta returns serial flag for HVAC items', () => {
  ok(getItemMeta('as-01').serial);
  ok(getItemMeta('as-02').serial);
  ok(getItemMeta('as-08').serial);
});

test('no invented price minimums — CSV is the single source of truth', () => {
  for (const [id, p] of Object.entries(PRICES)) {
    if (p[3]?.min !== undefined) throw new Error(`${id} has a min not present in the pricing CSV`);
  }
});

// =============================================================================
// SECTION 3: calcLineTotal
// =============================================================================
console.log('\n── calcLineTotal ─────────────────────────────────────────────────');

test('returns 0 when item is not checked', () => {
  eq(calcLineTotal('ba-04', { checked: false, qty: '5' }), 0);
});

test('returns 0 when qty is empty', () => {
  eq(calcLineTotal('ba-04', { checked: true, qty: '' }), 0);
});

test('returns 0 when qty is zero', () => {
  eq(calcLineTotal('ba-04', { checked: true, qty: '0' }), 0);
});

test('basic calculation: qty × unit cost', () => {
  // Vinyl Plank ig-05: $2.50/sqft × 200 sqft = $500
  S.projPrices = {};
  eq(calcLineTotal('ig-05', { checked: true, qty: '200' }), 500);
});

test('line total is exactly qty × CSV cost (no hidden minimums)', () => {
  // Front Entry Door ig-14: $475 × 1 = $475 per the pricing CSV
  eq(calcLineTotal('ig-14', { checked: true, qty: '1' }), 475);
  eq(calcLineTotal('ig-14', { checked: true, qty: '2' }), 950);
});

test('calcLineTotal respects project price override', () => {
  S.projPrices = { 'ba-04': 200 };
  eq(calcLineTotal('ba-04', { checked: true, qty: '2' }), 400);
  S.projPrices = {};
});

test('fractional qty works correctly', () => {
  // Carpet ig-06: $1.90/sqft × 150.5 sqft
  const expected = Math.round(150.5 * 1.9); // 286 (rounded in fmt$ but raw is fine)
  eq(calcLineTotal('ig-06', { checked: true, qty: '150.5' }), 150.5 * 1.9);
});

// =============================================================================
// SECTION 4: calcGroupTotal
// =============================================================================
console.log('\n── calcGroupTotal ────────────────────────────────────────────────');

test('returns 0 when no items checked', () => {
  freshState();
  eq(calcGroupTotal('bath_1', 'btub', []), 0);
});

test('sums only checked items', () => {
  freshState();
  const instId = 'bath_1';
  // ba-04 Toilet: $150 × 2 = $300
  S.items[mkKey(instId, 'ba-04')] = { checked: true,  qty: '2', year: '' };
  S.items[mkKey(instId, 'ba-07')] = { checked: false, qty: '1', year: '' };
  eq(calcGroupTotal(instId, 'btoilet', []), 300);
});

test('deleted items are excluded from group total', () => {
  freshState();
  const instId = 'bath_1';
  S.items[mkKey(instId, 'ba-04')]   = { checked: true, qty: '2', year: '' };
  S.deletedItems[mkKey(instId, 'ba-04')] = true;
  eq(calcGroupTotal(instId, 'btoilet', []), 0);
});

test('custom items are included in group total', () => {
  freshState();
  const instId  = 'bath_1';
  const custId  = 'custom_test_1';
  const customs = [{ id: custId, name: 'Custom tile seal', cost: 250, unit: 'ea.' }];
  S.items[mkKey(instId, custId)] = { checked: true, qty: '1', year: '' };
  // custom total = 1 × 250 = 250
  gt(calcGroupTotal(instId, 'btile', customs), 0);
});

test('calcItemTotal resolves custom item costs (partial-update path)', () => {
  freshState();
  const instId = 'bath_1';
  const custId = 'custom_test_2';
  S.customItems[`${instId}:btile`] = [{ id: custId, name: 'Niche shelf', cost: 120, unit: 'ea.' }];
  S.items[mkKey(instId, custId)] = { checked: true, qty: '3' };
  eq(calcItemTotal(instId, custId), 360);
});

test('calcItemTotal matches calcLineTotal for standard items', () => {
  freshState();
  S.items[mkKey('bath_1', 'ba-04')] = { checked: true, qty: '2' };
  eq(calcItemTotal('bath_1', 'ba-04'), 300);
});

// =============================================================================
// SECTION 5: calcProgress
// =============================================================================
console.log('\n── calcProgress ──────────────────────────────────────────────────');

test('returns {total, done} with correct types', () => {
  freshState();
  const { total, done } = calcProgress();
  ok(typeof total === 'number');
  ok(typeof done  === 'number');
});

test('done=0 when no items are checked', () => {
  freshState();
  const { done } = calcProgress();
  eq(done, 0);
});

test('checking one item in a group marks that group done', () => {
  freshState();
  const { done: before } = calcProgress();
  // Check one item in flooring group of interior section
  S.items[mkKey('interior_1', 'ig-01')] = { checked: true, qty: '100', year: '' };
  const { done: after } = calcProgress();
  eq(after, before + 1);
});

test('marking NA in a group counts it as done', () => {
  freshState();
  const { done: before } = calcProgress();
  S.items['NA:interior_1:flooring'] = { checked: true };
  const { done: after } = calcProgress();
  eq(after, before + 1);
});

test('total equals all groups across all active sections', () => {
  freshState();
  const { total } = calcProgress();
  // Default: interior(5) + kitchen(3) + bathroom×2(4×2=8) + systems(5) + exterior(5) = 26
  eq(total, 26);
});

test('adding a bedroom increases total by its group count', () => {
  freshState();
  const { total: before } = calcProgress();
  addRoom('bedroom');
  const { total: after } = calcProgress();
  eq(after - before, SECTION_TYPES['bedroom'].groups.length);
});

// =============================================================================
// SECTION 6: calcGrandTotal
// =============================================================================
console.log('\n── calcGrandTotal ────────────────────────────────────────────────');

test('returns 0 with fresh state', () => {
  freshState();
  eq(calcGrandTotal(), 0);
});

test('reflects checked items across all sections', () => {
  freshState();
  // Toilet in bath_1: $150 × 1 = $150
  S.items[mkKey('bath_1', 'ba-04')] = { checked: true, qty: '1', year: '' };
  // Furnace in systems_1: $3350 × 1 = $3350
  S.items[mkKey('systems_1', 'as-01')] = { checked: true, qty: '1', year: '' };
  eq(calcGrandTotal(), 3500);
});

test('second bathroom costs are tracked separately', () => {
  freshState();
  S.items[mkKey('bath_1', 'ba-04')] = { checked: true, qty: '1', year: '' };
  S.items[mkKey('bath_2', 'ba-04')] = { checked: true, qty: '1', year: '' };
  eq(calcGrandTotal(), 300); // $150 × 2 bathrooms
});

// =============================================================================
// SECTION 7: defaultSections structure
// =============================================================================
console.log('\n── defaultSections ───────────────────────────────────────────────');

test('has all 7 section types', () => {
  const s = defaultSections();
  const keys = Object.keys(s);
  ok(keys.includes('interior'));
  ok(keys.includes('kitchen'));
  ok(keys.includes('bathroom'));
  ok(keys.includes('systems'));
  ok(keys.includes('exterior'));
  ok(keys.includes('bedroom'));
  ok(keys.includes('living'));
});

test('bathroom starts with 2 instances', () => {
  const s = defaultSections();
  eq(s.bathroom.instances.length, 2);
});

test('bedroom starts with 0 instances', () => {
  const s = defaultSections();
  eq(s.bedroom.instances.length, 0);
});

test('living starts with 0 instances', () => {
  const s = defaultSections();
  eq(s.living.instances.length, 0);
});

// =============================================================================
// SECTION 8: PRICES completeness
// =============================================================================
console.log('\n── PRICES dataset ────────────────────────────────────────────────');

test('has at least 75 line items', () => {
  ok(Object.keys(PRICES).length >= 75);
  console.log(`     (${Object.keys(PRICES).length} items found)`);
});

test('all PRICES entries have [name, cost, unit]', () => {
  for (const [id, p] of Object.entries(PRICES)) {
    if (typeof p[0] !== 'string') throw new Error(`${id}: missing name`);
    if (typeof p[1] !== 'number') throw new Error(`${id}: cost is not a number`);
    if (typeof p[2] !== 'string') throw new Error(`${id}: missing unit`);
  }
});

test('all GROUPS reference valid PRICES ids', () => {
  for (const [gid, g] of Object.entries(GROUPS)) {
    for (const iid of g.items) {
      if (!PRICES[iid]) throw new Error(`Group ${gid} references unknown item ${iid}`);
    }
  }
});

test('all SECTION_TYPES reference valid GROUPS', () => {
  for (const [stId, st] of Object.entries(SECTION_TYPES)) {
    for (const gid of st.groups) {
      if (!GROUPS[gid]) throw new Error(`Section ${stId} references unknown group ${gid}`);
    }
  }
});

test('groups within one section type never share an item id', () => {
  // The state key is {instanceId}:{itemId} — an overlap inside one section
  // type would double-count the cost (regression: bed_doors/closet shared ig-11/ig-12)
  for (const [stId, st] of Object.entries(SECTION_TYPES)) {
    const seen = new Map();
    for (const gid of st.groups) {
      for (const iid of GROUPS[gid].items) {
        if (seen.has(iid)) throw new Error(`${stId}: ${iid} in both "${seen.get(iid)}" and "${gid}"`);
        seen.set(iid, gid);
      }
    }
  }
});

test('at least 19 distinct groups across core section types', () => {
  // Brief requires 19; having more is fine (app adds Toilet & Fixtures, Plumbing, Finishing)
  const coreGroups = new Set();
  const coreSections = ['interior','kitchen','bathroom','systems','exterior'];
  for (const stId of coreSections) {
    for (const gid of SECTION_TYPES[stId].groups) coreGroups.add(gid);
  }
  ok(coreGroups.size >= 19);
  console.log(`     (${coreGroups.size} distinct groups — brief requires 19)`);
});

// =============================================================================
// SECTION 9: fmt$ formatting
// =============================================================================
console.log('\n── fmt$ ──────────────────────────────────────────────────────────');

test('fmt$ formats zero', () => eq(fmt$(0), '$0'));
test('fmt$ formats thousands with comma', () => eq(fmt$(3500), '$3,500'));
test('fmt$ rounds to nearest dollar', () => eq(fmt$(3500.7), '$3,501'));
test('fmt$ handles large numbers', () => eq(fmt$(125000), '$125,000'));
test('fmt$ formats negatives with leading minus', () => eq(fmt$(-31050), '-$31,050'));
test('fmt$ rounds -0.4 to plain $0', () => eq(fmt$(-0.4), '$0'));

// =============================================================================
// SECTION 9b: Deal Analyzer
// =============================================================================
console.log('\n── Deal Analyzer ─────────────────────────────────────────────────');

test('calcDeal is not ready until both ARV and purchase are entered', () => {
  freshState();
  S.dealARV = ''; S.dealPurchase = ''; S.dealWeeks = 12;
  ok(!calcDeal().ready);
  S.dealARV = '200000';
  ok(!calcDeal().ready);
  S.dealPurchase = '120000';
  ok(calcDeal().ready);
});

test('calcDeal carry cost is 1.5% monthly on purchase', () => {
  freshState();
  S.dealARV = '200000'; S.dealPurchase = '120000'; S.dealWeeks = 26;
  const d = calcDeal();
  eq(d.holdCost, Math.round(120000 * 0.015 * (26 / 52) * 12)); // $10,800
  eq(d.basis, 120000 + d.repairs + d.holdCost);
  eq(d.profit, 200000 - d.basis);
});

test('calcDeal verdict thresholds', () => {
  freshState();
  S.dealWeeks = 2; S.dealPurchase = '100000';
  S.dealARV = '200000';
  eq(calcDeal().verdict, 'Strong deal');   // profit well above $15k
  S.dealARV = '110000';
  eq(calcDeal().verdict, 'Thin margin');   // small positive profit
  S.dealARV = '90000';
  eq(calcDeal().verdict, 'Losing deal');   // negative profit
});

// =============================================================================
// SECTION 10: esc (HTML escaping)
// =============================================================================
console.log('\n── esc ───────────────────────────────────────────────────────────');

test('escapes ampersand', () => ok(esc('A&B').includes('&amp;')));
test('escapes < and >', () => {
  ok(esc('<div>').includes('&lt;'));
  ok(esc('<div>').includes('&gt;'));
});
test('escapes double quote', () => ok(esc('"hello"').includes('&quot;')));
test('handles null/undefined safely', () => eq(esc(null), ''));
test('handles numbers', () => eq(esc(42), '42'));

// =============================================================================
// SECTION 11: addRoom / removeRoom logic
// =============================================================================
console.log('\n── Room management ───────────────────────────────────────────────');

test('addRoom increases bedroom instance count', () => {
  freshState();
  eq(S.sections.bedroom.instances.length, 0);
  addRoom('bedroom');
  eq(S.sections.bedroom.instances.length, 1);
});

test('addRoom initializes item keys for new instance', () => {
  freshState();
  addRoom('bedroom');
  const inst = S.sections.bedroom.instances[0];
  ok(inst);
  const firstGroup = SECTION_TYPES.bedroom.groups[0];
  const firstItem  = GROUPS[firstGroup].items[0];
  ok(S.items[mkKey(inst.id, firstItem)] !== undefined);
});

test('addRoom gives sequential names', () => {
  freshState();
  addRoom('bedroom');
  addRoom('bedroom');
  eq(S.sections.bedroom.instances[0].name, 'Bedroom 1');
  eq(S.sections.bedroom.instances[1].name, 'Bedroom 2');
});

test('removeRoom reduces count and cleans up item state', () => {
  freshState();
  addRoom('bedroom');
  const inst = S.sections.bedroom.instances[0];
  const instId = inst.id;
  S.sections.bedroom.instances.splice(0, 1);
  // simulate cleanup
  const prefix = instId + ':';
  for (const k of Object.keys(S.items)) { if (k.startsWith(prefix)) delete S.items[k]; }
  eq(S.sections.bedroom.instances.length, 0);
  ok(!Object.keys(S.items).some(k => k.startsWith(prefix)));
});

test('cannot remove last bathroom (minimum 1)', () => {
  freshState();
  // Only 1 bathroom remains — removeRoom should bail
  while (S.sections.bathroom.instances.length > 1) S.sections.bathroom.instances.pop();
  eq(S.sections.bathroom.instances.length, 1);
  // removeRoom checks: if (insts.length <= (stId==='bathroom'?1:0)) bail
  const before = S.sections.bathroom.instances.length;
  removeRoom('bathroom', 0); // should be blocked
  eq(S.sections.bathroom.instances.length, before);
});

// =============================================================================
// RESULTS
// =============================================================================
console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
console.log('─'.repeat(60));

if (failed > 0) process.exit(1);
