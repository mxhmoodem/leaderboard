'use strict';

/* ===================================================================
   HSBC Sustainability Tracker — Leaderboard tab
   Single-page client app. All state lives in the URL hash (#leaderboard?...)
   so back/forward navigation works without a framework.
   =================================================================== */

/* ====================== CONSTANTS / THRESHOLDS ====================== */

const CATEGORIES = [
  'Automotive', 'Construction', 'Consulting', 'Electronics', 'Energy',
  'Finance', 'Food & Beverage', 'IT Services', 'Logistics',
  'Pharmaceuticals', 'Telecoms', 'Textiles',
];
const AREAS = ['Corporate', 'Distribution', 'IT', 'Manufacturing', 'Operations', 'R&D'];
const REGIONS = ['Americas', 'EMEA', 'APAC'];
const PERIODS = ['This quarter', 'Last quarter', 'YTD', 'TTM'];

const COUNTRY_TO_REGION = {
  GB: 'EMEA', DE: 'EMEA', FR: 'EMEA', NL: 'EMEA', CH: 'EMEA', SE: 'EMEA', ES: 'EMEA', IT: 'EMEA', AE: 'EMEA', ZA: 'EMEA',
  US: 'Americas', CA: 'Americas', BR: 'Americas', MX: 'Americas',
  CN: 'APAC', JP: 'APAC', KR: 'APAC', IN: 'APAC', SG: 'APAC', AU: 'APAC', HK: 'APAC',
};

const THRESHOLDS = {
  Finance:         [['esg','>=',78], ['governance','>=',75]],
  Energy:          [['esg','>=',65], ['renewable','>=',70], ['scope3','<=',95000]],
  Pharmaceuticals: [['esg','>=',70], ['governance','>=',70], ['waste','>=',65]],
  Electronics:     [['esg','>=',68], ['scope3','<=',85000], ['renewable','>=',55]],
  Automotive:      [['esg','>=',66], ['scope3','<=',120000], ['waste','>=',60]],
  Construction:    [['esg','>=',62], ['waste','>=',55], ['water','<=',900000]],
  Consulting:      [['esg','>=',75], ['governance','>=',72], ['diversity','>=',70]],
  'Food & Beverage':[['esg','>=',64], ['water','<=',800000], ['waste','>=',60]],
  'IT Services':   [['esg','>=',72], ['renewable','>=',60], ['diversity','>=',65]],
  Logistics:       [['esg','>=',64], ['scope3','<=',110000], ['renewable','>=',50]],
  Telecoms:        [['esg','>=',68], ['renewable','>=',60], ['governance','>=',68]],
  Textiles:        [['esg','>=',60], ['water','<=',750000], ['waste','>=',55]],
};

const METRIC_LABELS = {
  esg: 'Global score', renewable: 'Renewable electricity', scope3: 'Scope 3 emissions',
  water: 'Water usage', waste: 'Waste diverted', diversity: 'Workforce diversity',
  governance: 'Governance',
};

const METRIC_UNITS = {
  renewable: '%', waste: '%', diversity: '/100', governance: '/100', esg: '/100',
  scope3: ' tCO₂e', water: ' m³',
};

// Direction: false = higher is better; true = lower is better.
const LOWER_IS_BETTER = { scope3: true, water: true };

const PAGE_SIZE = 20;
const UPDATED_DATE = '14 May 2026';

/* ====================== GLOBAL SCORE RUBRIC ======================
   Balanced-ESG weights. Each sub-score is 0–100, percentile-ranked
   within sector. Final = Σ(weight × subScore) × confidenceFactor.
================================================================= */
const SCORE_WEIGHTS = {
  emissionsIntensity: 0.30, // HSBC-attributed tCO₂e per £ spend
  emissionsAbsolute:  0.10, // total tCO₂e footprint
  renewables:         0.15,
  water:              0.10,
  waste:              0.10,
  diversity:          0.10,
  governance:         0.15, // includes disclosure / data quality / targets
};

const CONFIDENCE_FACTOR = {
  Assured: 1.00,
  'Self-reported': 0.90,
  Estimated: 0.80,
};

// Sector ESG-risk index (higher = more inherent risk; lowers score modestly)
const SECTOR_RISK = {
  Energy: 'High', Automotive: 'High', Construction: 'High', Textiles: 'High',
  Pharmaceuticals: 'Medium', Electronics: 'Medium', Logistics: 'Medium',
  'Food & Beverage': 'Medium', Telecoms: 'Medium',
  Finance: 'Low', Consulting: 'Low', 'IT Services': 'Low',
};

/* ============================ HELPERS ============================ */

function rng(seed) {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 100000) / 100000; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = (n, d = 0) => { const k = Math.pow(10, d); return Math.round(n * k) / k; };

function gradeFor(esg) {
  if (esg >= 85) return 'A+';
  if (esg >= 78) return 'A';
  if (esg >= 70) return 'B+';
  if (esg >= 62) return 'B';
  if (esg >= 55) return 'C+';
  if (esg >= 45) return 'C';
  return 'D';
}
function gradeBand(g) {
  if (g.startsWith('A')) return 'grade-A';
  if (g.startsWith('B')) return 'grade-B';
  if (g.startsWith('C')) return 'grade-C';
  return 'grade-D';
}

function fmtMetric(metric, v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (metric === 'scope3') return Math.round(v).toLocaleString('en-GB');
  if (metric === 'water') return (v / 1000).toFixed(0) + 'k';
  if (metric === 'esg' || metric === 'governance' || metric === 'diversity') return Math.round(v);
  return Math.round(v) + '%';
}
function fmtUnit(metric) { return METRIC_UNITS[metric] || ''; }

function metricValue(supplier, metric) { return supplier.metrics[metric]; }

/* ===================== SUPPLIER DATA GENERATION ===================== */

const REAL_NAMES = [
  ['Meridian Capital Partners','Finance','Corporate','GB'],
  ['Atlas Energy Solutions','Energy','Operations','DE'],
  ['Helios Pharmaceuticals','Pharmaceuticals','R&D','CH'],
  ['Nordic Electronics AB','Electronics','Manufacturing','SE'],
  ['Apex Logistics Group','Logistics','Distribution','NL'],
  ['Cascade Textiles Ltd','Textiles','Manufacturing','IN'],
  ['Vanguard IT Services','IT Services','IT','US'],
  ['Sterling Auto Holdings','Automotive','Manufacturing','JP'],
  ['Lumen Telecoms','Telecoms','Corporate','GB'],
  ['Beacon Construction PLC','Construction','Operations','GB'],
  ['Harvest Foods International','Food & Beverage','Distribution','US'],
  ['Quantum Consulting Partners','Consulting','Corporate','US'],
  ['Phoenix Industries Ltd','Energy','Operations','AE'],
  ['Silvercrest Pharma','Pharmaceuticals','Manufacturing','DE'],
  ['Cobalt Microsystems','Electronics','R&D','KR'],
  ['Westwind Logistics','Logistics','Distribution','CA'],
  ['Saffron Garments Co','Textiles','Manufacturing','IN'],
  ['Optima Digital','IT Services','IT','GB'],
  ['DriveCore Mobility','Automotive','R&D','DE'],
  ['Polaris Networks','Telecoms','IT','US'],
  ['Granite Build Group','Construction','Operations','AU'],
  ['Verdant Food Co','Food & Beverage','Operations','BR'],
  ['Pinnacle Advisory','Consulting','Corporate','CH'],
  ['Northstar Finance','Finance','Corporate','HK'],
  ['Solaris Power Co','Energy','Operations','ES'],
  ['Caduceus Therapeutics','Pharmaceuticals','R&D','US'],
  ['Lattice Semiconductor Ltd','Electronics','Manufacturing','SG'],
  ['Horizon Shipping','Logistics','Distribution','SG'],
  ['Indigo Apparel','Textiles','Manufacturing','CN'],
  ['ByteWorks Cloud','IT Services','IT','US'],
  ['Velocity Motors','Automotive','Manufacturing','MX'],
  ['Echo Comms','Telecoms','Corporate','FR'],
  ['Summit Build Co','Construction','Operations','US'],
  ['Pure Beverage Group','Food & Beverage','Distribution','GB'],
  ['Catalyst Strategy','Consulting','Corporate','SG'],
  ['Bridgewater Banking','Finance','Corporate','US'],
  ['Aurora Renewables','Energy','R&D','GB'],
  ['Medix Labs','Pharmaceuticals','Manufacturing','IN'],
  ['Quark Devices','Electronics','R&D','JP'],
  ['Trailblaze Freight','Logistics','Distribution','US'],
  ['Tessera Fabrics','Textiles','Manufacturing','IT'],
  ['Cipher Systems','IT Services','IT','DE'],
  ['Volt Automotive','Automotive','R&D','CN'],
  ['Skyline Telecom','Telecoms','Operations','ZA'],
  ['Foundry Construction','Construction','Manufacturing','CA'],
  ['Orchard Foods','Food & Beverage','Operations','NL'],
  ['Crestline Consulting','Consulting','Corporate','GB'],
  ['Equinox Finance','Finance','Corporate','SG'],
  ['Greenwave Energy','Energy','Operations','BR'],
  ['Vital Pharma','Pharmaceuticals','R&D','GB'],
];

function buildSuppliers() {
  const r = rng(20260514);
  return REAL_NAMES.map((tup, i) => {
    const [name, category, area, country] = tup;
    const id = 'SUP-' + String(1000 + i * 17 % 9000 + Math.floor(r() * 50)).padStart(4, '0');

    // Synthesise metrics with category-tilted baselines.
    const base = (lo, hi) => lo + r() * (hi - lo);
    let renewable, scope3, water, waste, diversity, governance;
    switch (category) {
      case 'Energy':
        renewable = base(40, 95); scope3 = base(60000, 160000); water = base(200000, 1000000);
        waste = base(40, 80); diversity = base(40, 80); governance = base(50, 85); break;
      case 'Finance': case 'Consulting':
        renewable = base(50, 95); scope3 = base(8000, 35000); water = base(20000, 100000);
        waste = base(50, 90); diversity = base(55, 90); governance = base(55, 92); break;
      case 'Pharmaceuticals':
        renewable = base(45, 80); scope3 = base(30000, 90000); water = base(200000, 700000);
        waste = base(45, 85); diversity = base(50, 85); governance = base(55, 88); break;
      case 'Electronics':
        renewable = base(35, 85); scope3 = base(45000, 120000); water = base(150000, 600000);
        waste = base(40, 85); diversity = base(45, 80); governance = base(50, 85); break;
      case 'Automotive':
        renewable = base(25, 75); scope3 = base(90000, 200000); water = base(180000, 700000);
        waste = base(45, 85); diversity = base(40, 75); governance = base(50, 82); break;
      case 'Logistics':
        renewable = base(30, 75); scope3 = base(70000, 180000); water = base(20000, 90000);
        waste = base(40, 80); diversity = base(40, 75); governance = base(45, 80); break;
      case 'Textiles':
        renewable = base(25, 70); scope3 = base(40000, 110000); water = base(400000, 1200000);
        waste = base(35, 75); diversity = base(45, 75); governance = base(45, 78); break;
      case 'Food & Beverage':
        renewable = base(35, 80); scope3 = base(35000, 95000); water = base(300000, 1100000);
        waste = base(45, 85); diversity = base(50, 80); governance = base(50, 82); break;
      case 'Construction':
        renewable = base(25, 65); scope3 = base(50000, 140000); water = base(400000, 1300000);
        waste = base(40, 80); diversity = base(35, 70); governance = base(45, 78); break;
      case 'Telecoms':
        renewable = base(45, 88); scope3 = base(20000, 80000); water = base(40000, 150000);
        waste = base(50, 88); diversity = base(48, 82); governance = base(55, 86); break;
      case 'IT Services':
        renewable = base(55, 95); scope3 = base(12000, 45000); water = base(20000, 90000);
        waste = base(55, 90); diversity = base(55, 85); governance = base(55, 88); break;
      default:
        renewable = base(40, 80); scope3 = base(30000, 90000); water = base(100000, 500000);
        waste = base(50, 80); diversity = base(50, 80); governance = base(50, 80);
    }

    renewable = round(renewable);
    scope3 = round(scope3);
    water = round(water);
    waste = round(waste);
    diversity = round(diversity);
    governance = round(governance);

    // HSBC spend with this supplier (£m). Drives intensity calc.
    const spendGBP = round(base(0.4, 18) * 1_000_000);

    // Disclosure / data-quality score (0–100). Composite of typical signals.
    const disclosure = clamp(round(
      governance * 0.45 +
      (renewable > 50 ? 18 : 8) +
      (scope3 < 90000 ? 18 : 8) +
      (diversity > 55 ? 12 : 6) +
      base(-4, 6)
    ), 0, 100);

    // Confidence band — higher governance/disclosure → more assured data.
    const confidence = disclosure >= 78 ? 'Assured'
                     : disclosure >= 58 ? 'Self-reported'
                     : 'Estimated';

    return {
      id, name, category, area, country,
      region: COUNTRY_TO_REGION[country] || 'EMEA',
      isViewer: false,
      spendGBP,
      confidence,
      metrics: { renewable, scope3, water, waste, diversity, governance, disclosure, esg: 0 },
      // Filled in by computeGlobalScores once we can percentile-rank across the cohort.
      subScores: {},
      trend: [], delta: 0,
      rank: 0, gates: [], hasStamp: false,
    };
  });
}

/* ===================== GLOBAL SCORING ENGINE =====================
   Percentile-rank each metric within its sector (like-with-like),
   apply weights, then multiply by data-confidence factor.
================================================================ */

function percentileRank(values, value, lowerIsBetter) {
  // Returns 0–100. 100 = best in cohort.
  if (values.length <= 1) return 75; // neutral baseline if no peers
  const sorted = [...values].sort((a, b) => a - b);
  const idx = sorted.findIndex(v => v >= value);
  const position = idx === -1 ? sorted.length : idx;
  const pct = (position / (sorted.length - 1)) * 100;
  return clamp(lowerIsBetter ? 100 - pct : pct, 0, 100);
}

function sectorRiskScore(category) {
  const band = SECTOR_RISK[category] || 'Medium';
  return band === 'Low' ? 100 : band === 'Medium' ? 70 : 40;
}

function computeGlobalScores(suppliers) {
  // Build sector cohorts (or fall back to whole cohort for tiny sectors).
  const bySector = {};
  for (const s of suppliers) (bySector[s.category] ||= []).push(s);

  for (const s of suppliers) {
    const peers = (bySector[s.category] && bySector[s.category].length >= 4)
      ? bySector[s.category] : suppliers;

    const intensity = s.metrics.scope3 / Math.max(s.spendGBP / 1_000_000, 0.1); // tCO₂e per £m
    const peerIntensities = peers.map(p => p.metrics.scope3 / Math.max(p.spendGBP / 1_000_000, 0.1));

    const sub = {
      emissionsIntensity: round(percentileRank(peerIntensities, intensity, true)),
      emissionsAbsolute:  round(percentileRank(peers.map(p => p.metrics.scope3), s.metrics.scope3, true)),
      renewables:         round(percentileRank(peers.map(p => p.metrics.renewable), s.metrics.renewable, false)),
      water:              round(percentileRank(peers.map(p => p.metrics.water), s.metrics.water, true)),
      waste:              round(percentileRank(peers.map(p => p.metrics.waste), s.metrics.waste, false)),
      diversity:          round(percentileRank(peers.map(p => p.metrics.diversity), s.metrics.diversity, false)),
      governance:         round(percentileRank(peers.map(p => p.metrics.governance), s.metrics.governance, false)),
      sectorRisk:         sectorRiskScore(s.category),
      disclosure:         s.metrics.disclosure,
      intensityValue:     round(intensity, 2),
    };

    // Weighted overall (pre-confidence)
    const overallRaw =
      sub.emissionsIntensity * SCORE_WEIGHTS.emissionsIntensity +
      sub.emissionsAbsolute  * SCORE_WEIGHTS.emissionsAbsolute +
      sub.renewables         * SCORE_WEIGHTS.renewables +
      sub.water              * SCORE_WEIGHTS.water +
      sub.waste              * SCORE_WEIGHTS.waste +
      sub.diversity          * SCORE_WEIGHTS.diversity +
      sub.governance         * SCORE_WEIGHTS.governance;

    const confFactor = CONFIDENCE_FACTOR[s.confidence] ?? 0.85;
    const overall = clamp(round(overallRaw * confFactor), 0, 100);

    s.subScores = sub;
    s.metrics.esg = overall;       // global score replaces old ESG composite
    s.overallRaw = round(overallRaw);
    s.confFactor = confFactor;
  }

  // Build 12-month trend now that the global score exists.
  const r = rng(20260514 + 1);
  for (const s of suppliers) {
    const base = (lo, hi) => lo + r() * (hi - lo);
    const trend = [];
    let t = clamp(s.metrics.esg - base(-4, 8), 30, 95);
    for (let m = 0; m < 12; m++) {
      t += base(-2.4, 2.4);
      trend.push(round(clamp(t, 30, 98), 1));
    }
    trend[11] = s.metrics.esg;
    s.trend = trend;
    s.delta = round(trend[11] - trend[8], 1);
  }
}

/* ===================== STAMP / THRESHOLD ENGINE ===================== */

function computeGates(supplier) {
  const rules = THRESHOLDS[supplier.category] || [];
  return rules.map(([metric, op, threshold]) => {
    const value = metricValue(supplier, metric);
    const pass = op === '>=' ? value >= threshold : value <= threshold;
    let progress;
    if (op === '>=') progress = clamp(value / threshold, 0, 1);
    else progress = clamp((threshold * 2 - value) / (threshold * 2 - threshold), 0, 1);
    return { metric, op, threshold, value, pass, progress };
  });
}
function computeStamps(suppliers) {
  for (const s of suppliers) {
    s.gates = computeGates(s);
    s.hasStamp = s.gates.length > 0 && s.gates.every(g => g.pass);
  }
}

function recomputeRanks(suppliers, metric) {
  const sorted = [...suppliers].sort((a, b) => {
    const av = metricValue(a, metric), bv = metricValue(b, metric);
    return LOWER_IS_BETTER[metric] ? av - bv : bv - av;
  });
  sorted.forEach((s, i) => { s.rank = i + 1; });
  return sorted;
}

/* ===================== APP STATE / URL ROUTING ===================== */

const state = {
  suppliers: [],
  filters: {
    category: 'All', area: 'All', region: 'All', period: 'This quarter',
    rankBy: 'esg', stampedOnly: false, page: 1,
  },
  persona: 'supplier',     // 'supplier' | 'admin'
  privacy: 'blur',         // 'codename' | 'blur' | 'redact'
  viewerId: null,
  expandedId: null,
  aiOpen: true,
  chat: [],
};

function readHash() {
  // URL: #leaderboard?category=Finance&rankBy=esg...
  const raw = location.hash || '#leaderboard';
  const [tab, qs] = raw.replace(/^#/, '').split('?');
  const params = new URLSearchParams(qs || '');
  return { tab: tab || 'leaderboard', params };
}
function writeHash(tab, filtersOverride) {
  const f = filtersOverride || state.filters;
  const params = new URLSearchParams();
  if (f.category !== 'All') params.set('category', f.category);
  if (f.area !== 'All') params.set('area', f.area);
  if (f.region !== 'All') params.set('region', f.region);
  if (f.period !== 'This quarter') params.set('period', f.period);
  if (f.rankBy !== 'esg') params.set('rankBy', f.rankBy);
  if (f.stampedOnly) params.set('stamped', '1');
  if (f.page > 1) params.set('page', String(f.page));
  const qs = params.toString();
  const newHash = '#' + tab + (qs ? '?' + qs : '');
  if (location.hash !== newHash) history.pushState(null, '', newHash);
}
function applyHash() {
  const { tab, params } = readHash();
  state.filters.category = params.get('category') || 'All';
  state.filters.area = params.get('area') || 'All';
  state.filters.region = params.get('region') || 'All';
  state.filters.period = params.get('period') || 'This quarter';
  state.filters.rankBy = params.get('rankBy') || 'esg';
  state.filters.stampedOnly = params.get('stamped') === '1';
  state.filters.page = Math.max(1, parseInt(params.get('page') || '1', 10));
  setActiveTab(tab);
  return tab;
}

function setActiveTab(tab) {
  document.querySelectorAll('.tab').forEach(el => {
    el.classList.toggle('is-active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(el => {
    el.classList.toggle('is-active', el.dataset.panel === tab);
  });
}

/* ====================== FILTERING / SORTING ====================== */

function applyFilters() {
  const f = state.filters;
  let list = state.suppliers;
  if (f.category !== 'All') list = list.filter(s => s.category === f.category);
  if (f.area !== 'All') list = list.filter(s => s.area === f.area);
  if (f.region !== 'All') list = list.filter(s => s.region === f.region);
  if (f.stampedOnly) list = list.filter(s => s.hasStamp || s.isViewer);
  return recomputeRanks(list, f.rankBy);
}

/* ============================ RENDERING ============================ */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function nameCell(supplier) {
  const viewer = state.suppliers.find(s => s.id === state.viewerId);
  const sameOrg = supplier.id === state.viewerId;
  const seeRealName = state.persona === 'admin' || sameOrg;
  let nameHTML;
  if (seeRealName) {
    nameHTML = `<span class="name-real">${escapeHTML(supplier.name)}</span>`;
  } else if (state.privacy === 'redact') {
    nameHTML = `<span class="name-redact" aria-label="redacted">${' '.repeat(14)}</span>`;
  } else if (state.privacy === 'blur') {
    nameHTML = `<span class="name-blur">${escapeHTML(supplier.name)}</span>`;
  } else {
    nameHTML = `<span class="name-codename">${supplier.id}</span>`;
  }
  const youPill = sameOrg ? `<span class="you-pill">YOU</span>` : '';
  return `<div class="supplier-cell">${youPill}${nameHTML}</div>`;
  // eslint-disable-next-line no-unused-vars
  void viewer;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[ch]));
}

function hexagonStamp(granted, size = 18) {
  if (granted) {
    return `<svg class="stamp-seal is-granted" width="${size}" height="${size}" viewBox="0 0 64 64" aria-label="HSBC Stamp - awarded">
      <circle cx="32" cy="32" r="27" fill="#fff" stroke="#DB0011" stroke-width="3"/>
      <circle cx="32" cy="32" r="22" fill="none" stroke="#DB0011" stroke-width="1.6" stroke-dasharray="2.5 2.5"/>
      <g transform="translate(32 18) scale(.28)">
        <polygon points="-24,0 0,-24 24,0 0,24" fill="#DB0011"/>
        <polygon points="-24,0 0,-24 0,0" fill="#fff"/>
        <polygon points="24,0 0,24 0,0" fill="#fff"/>
      </g>
      <text x="32" y="12.5" text-anchor="middle" font-size="6.5" font-weight="700" fill="#DB0011" font-family="Public Sans, Arial, sans-serif">HSBC</text>
      <text x="32" y="53" text-anchor="middle" font-size="6.2" font-weight="700" fill="#DB0011" font-family="Public Sans, Arial, sans-serif">VERIFIED</text>
      <g transform="rotate(-12 32 32)">
        <rect x="7" y="25" width="50" height="14" rx="2" fill="#fff" stroke="#DB0011" stroke-width="2.5"/>
        <text x="32" y="35.2" text-anchor="middle" font-size="11" font-weight="800" fill="#DB0011" font-family="Public Sans, Arial, sans-serif">APPROVED</text>
      </g>
    </svg>`;
  }
  return `<svg class="stamp-seal" width="${size}" height="${size}" viewBox="0 0 64 64" aria-label="HSBC Stamp - not awarded">
    <circle cx="32" cy="32" r="27" fill="#fff" stroke="#c7c7c7" stroke-width="3"/>
    <circle cx="32" cy="32" r="22" fill="none" stroke="#c7c7c7" stroke-width="1.6" stroke-dasharray="3 3"/>
    <g transform="rotate(-12 32 32)">
      <rect x="9" y="25" width="46" height="14" rx="2" fill="#fff" stroke="#c7c7c7" stroke-width="2.2"/>
      <text x="32" y="35" text-anchor="middle" font-size="10" font-weight="800" fill="#b6b6b6" font-family="Public Sans, Arial, sans-serif">PENDING</text>
    </g>
  </svg>`;
  if (granted) {
    return `<svg class="stamp-hex" width="${size}" height="${size}" viewBox="0 0 32 32" aria-label="HSBC Stamp — awarded">
      <polygon points="16,1.5 30.5,9.5 30.5,22.5 16,30.5 1.5,22.5 1.5,9.5" fill="none" stroke="#DB0011" stroke-width="1.4"/>
      <polygon points="16,4 28,10.5 28,21.5 16,28 4,21.5 4,10.5" fill="#DB0011"/>
      <polygon points="16,5.5 26.5,11.3 26.5,20.7 16,26.5 5.5,20.7 5.5,11.3" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.8"/>
      <path d="M10.5 16.2 L14.5 20 L21.5 12.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  return `<svg class="stamp-hex" width="${size}" height="${size}" viewBox="0 0 32 32" aria-label="HSBC Stamp — not awarded">
    <polygon points="16,1.5 30.5,9.5 30.5,22.5 16,30.5 1.5,22.5 1.5,9.5" fill="none" stroke="#c5c5c5" stroke-width="1.4" stroke-dasharray="2 2"/>
    <text x="16" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#c5c5c5" font-family="Public Sans, sans-serif">—</text>
  </svg>`;
}

function sparklinePath(values, w, h, color) {
  if (!values || values.length === 0) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const dx = (w - 2) / (n - 1);
  const pts = values.map((v, i) => {
    const x = 1 + i * dx;
    const y = h - 1 - ((v - min) / range) * (h - 2);
    return [x, y];
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = line + ` L ${pts[pts.length-1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
  const lastY = pts[pts.length-1][1].toFixed(1);
  const lastX = pts[pts.length-1][0].toFixed(1);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${area}" fill="${color}" opacity="0.10"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="2" fill="${color}"/>
  </svg>`;
}

/* --- global score hero (the supplier's overall, weighted, confidence-adjusted score) --- */
function renderGlobalScore() {
  const el = $('#global-score');
  const viewer = state.suppliers.find(s => s.id === state.viewerId);
  if (!viewer || !el) return;

  const overall = viewer.metrics.esg;
  const grade = gradeFor(overall);
  const sub = viewer.subScores;
  const sectorPeers = state.suppliers.filter(s => s.category === viewer.category);
  const sortedByScore = [...sectorPeers].sort((a, b) => b.metrics.esg - a.metrics.esg);
  const sectorRank = sortedByScore.findIndex(s => s.id === viewer.id) + 1;
  const globalSorted = [...state.suppliers].sort((a, b) => b.metrics.esg - a.metrics.esg);
  const globalRank = globalSorted.findIndex(s => s.id === viewer.id) + 1;
  const total = state.suppliers.length;

  const trendColor = viewer.delta >= 0 ? '#1f8a5b' : '#DB0011';
  const deltaSym = viewer.delta > 0 ? '+' : '';
  const deltaArrow = viewer.delta > 0 ? '▲' : viewer.delta < 0 ? '▼' : '–';

  // Weighted contributions (each sub × its weight) → next-best-action.
  const components = [
    { key: 'emissionsIntensity', label: 'HSBC-attributed emissions (intensity)', weight: SCORE_WEIGHTS.emissionsIntensity, score: sub.emissionsIntensity },
    { key: 'emissionsAbsolute',  label: 'Absolute emissions footprint',          weight: SCORE_WEIGHTS.emissionsAbsolute,  score: sub.emissionsAbsolute },
    { key: 'renewables',         label: 'Renewable electricity',                 weight: SCORE_WEIGHTS.renewables,         score: sub.renewables },
    { key: 'water',              label: 'Water usage',                           weight: SCORE_WEIGHTS.water,              score: sub.water },
    { key: 'waste',              label: 'Waste diverted',                        weight: SCORE_WEIGHTS.waste,              score: sub.waste },
    { key: 'diversity',          label: 'Workforce diversity',                   weight: SCORE_WEIGHTS.diversity,          score: sub.diversity },
    { key: 'governance',         label: 'ESG governance / disclosure',           weight: SCORE_WEIGHTS.governance,         score: sub.governance },
  ];

  const subBars = components.map(c => {
    const contribution = (c.score * c.weight).toFixed(1);
    return `<div class="gs-sub-row">
      <span class="gs-sub-label">${c.label} <span class="gs-sub-weight">(${Math.round(c.weight * 100)}%)</span></span>
      <span class="gs-sub-track"><span class="gs-sub-fill" style="width:${c.score}%"></span></span>
      <span class="gs-sub-val">${c.score}<span class="gs-sub-unit">/100</span></span>
      <span class="gs-sub-contrib">+${contribution}</span>
    </div>`;
  }).join('');

  // Next-best-action = component where moving the score by 20 points gives the biggest gain.
  const weakest = [...components].sort((a, b) => (a.score * a.weight) - (b.score * b.weight))[0];
  const liftPts = round(Math.min(20, 100 - weakest.score) * weakest.weight * viewer.confFactor, 1);

  // Confidence badge styling
  const confClass = viewer.confidence === 'Assured' ? 'is-assured'
                  : viewer.confidence === 'Self-reported' ? 'is-selfrep'
                  : 'is-estimated';

  // Stamp gate progress
  const gatesTotal = viewer.gates.length;
  const gatesPass = viewer.gates.filter(g => g.pass).length;

  // Intensity comparison vs sector median (lower = better)
  const sectorIntensities = sectorPeers.map(s => s.subScores.intensityValue).sort((a,b) => a - b);
  const medIntensity = sectorIntensities[Math.floor(sectorIntensities.length / 2)] || 0;
  const intensityDelta = ((sub.intensityValue - medIntensity) / Math.max(medIntensity, 0.01)) * 100;

  el.innerHTML = `
    <div class="gs-card">
      <div class="gs-left">
        <div class="gs-eyebrow">Your global sustainability score</div>
        <div class="gs-dial">
          <svg viewBox="0 0 120 120" width="160" height="160" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#f0f0f0" stroke-width="10"/>
            <circle cx="60" cy="60" r="52" fill="none"
              stroke="${overall >= 78 ? '#1f8a5b' : overall >= 62 ? '#c98a00' : '#DB0011'}"
              stroke-width="10" stroke-linecap="round"
              stroke-dasharray="${(overall / 100) * 326.7} 326.7"
              transform="rotate(-90 60 60)"/>
            <text x="60" y="58" text-anchor="middle" font-size="28" font-weight="700" font-family="Public Sans, sans-serif" fill="#1a1a1a">${overall}</text>
            <text x="60" y="76" text-anchor="middle" font-size="9" letter-spacing="1" fill="#666" font-family="Public Sans, sans-serif">OUT OF 100</text>
          </svg>
          <div class="gs-grade-wrap">
            <span class="gs-grade grade ${gradeBand(grade)}">${grade}</span>
            <span class="gs-confidence ${confClass}" title="Data confidence — ${(viewer.confFactor * 100).toFixed(0)}% multiplier applied">
              ${viewer.confidence}
            </span>
          </div>
        </div>
        <div class="gs-meta">
          <div class="gs-meta-row">
            <span class="gs-meta-label">Sector rank</span>
            <span class="gs-meta-val">#${sectorRank}<span class="gs-meta-sub">/${sectorPeers.length} ${escapeHTML(viewer.category)}</span></span>
          </div>
          <div class="gs-meta-row">
            <span class="gs-meta-label">Global rank</span>
            <span class="gs-meta-val">#${globalRank}<span class="gs-meta-sub">/${total}</span></span>
          </div>
          <div class="gs-meta-row">
            <span class="gs-meta-label">Quarter</span>
            <span class="gs-meta-val" style="color:${trendColor}">${deltaArrow} ${deltaSym}${viewer.delta}</span>
          </div>
          <div class="gs-meta-row">
            <span class="gs-meta-label">HSBC Stamp</span>
            <span class="gs-meta-val">${viewer.hasStamp ? '✓ Granted' : `${gatesPass}/${gatesTotal} gates`}</span>
          </div>
        </div>
      </div>

      <div class="gs-right">
        <div class="gs-right-head">
          <h3>Score breakdown · weighted by HSBC's balanced-ESG rubric</h3>
          <p class="gs-right-sub">
            Each sub-score is percentile-ranked against your sector peers (${escapeHTML(viewer.category)}, ${sectorPeers.length} suppliers),
            then weighted and multiplied by your data-confidence factor (×${viewer.confFactor.toFixed(2)}).
          </p>
        </div>
        <div class="gs-subscores">${subBars}</div>

        <div class="gs-context">
          <div class="gs-context-cell">
            <div class="gs-ctx-label">Emissions intensity</div>
            <div class="gs-ctx-val">${sub.intensityValue} <span class="gs-ctx-unit">tCO₂e / £m spend</span></div>
            <div class="gs-ctx-meta ${intensityDelta < 0 ? 'good' : 'warn'}">
              ${intensityDelta < 0 ? '▼' : '▲'} ${Math.abs(intensityDelta).toFixed(0)}% vs sector median (${medIntensity})
            </div>
          </div>
          <div class="gs-context-cell">
            <div class="gs-ctx-label">HSBC spend (TTM)</div>
            <div class="gs-ctx-val">£${(viewer.spendGBP / 1_000_000).toFixed(1)}<span class="gs-ctx-unit">m</span></div>
            <div class="gs-ctx-meta">Tier ${viewer.spendGBP > 8_000_000 ? '1 — strategic' : '2 — long-tail'}</div>
          </div>
          <div class="gs-context-cell">
            <div class="gs-ctx-label">Sector risk</div>
            <div class="gs-ctx-val">${SECTOR_RISK[viewer.category] || 'Medium'}</div>
            <div class="gs-ctx-meta">${sub.sectorRisk}/100 contribution</div>
          </div>
          <div class="gs-context-cell gs-nba">
            <div class="gs-ctx-label">Next best action</div>
            <div class="gs-ctx-val gs-nba-val">${weakest.label}</div>
            <div class="gs-ctx-meta">Moving this sub-score +20 → ≈ +${liftPts} pts on global score</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* --- viewer summary strip --- */
function renderSummaryStrip() {
  const viewer = state.suppliers.find(s => s.id === state.viewerId);
  if (!viewer) { $('#summary-strip').innerHTML = ''; return; }

  const filtered = applyFilters();
  const total = filtered.length;
  const viewerRow = filtered.find(s => s.id === viewer.id) || viewer;
  const inGroup = !!filtered.find(s => s.id === viewer.id);
  const positionLabel = inGroup ? `#${viewerRow.rank}` : '—';
  const pctTop = inGroup ? Math.max(1, Math.round((viewerRow.rank / total) * 100)) : null;
  const deltaSign = viewer.delta > 0 ? 'up' : viewer.delta < 0 ? 'down' : '';
  const deltaArrow = viewer.delta > 0 ? '▲' : viewer.delta < 0 ? '▼' : '–';
  const trendColor = viewer.delta >= 0 ? '#1f8a5b' : '#DB0011';
  const grade = gradeFor(viewer.metrics.esg);
  const gates = viewer.gates;
  const passCount = gates.filter(g => g.pass).length;
  const gatesHTML = gates.map(g => {
    const pct = Math.round(g.progress * 100);
    return `<div class="gate-row ${g.pass ? 'pass' : ''}">
      <span class="gate-label">${METRIC_LABELS[g.metric]}</span>
      <span class="gate-bar"><span class="gate-bar-fill" style="width:${pct}%"></span></span>
      <span>${g.pass ? '✓' : pct + '%'}</span>
    </div>`;
  }).join('');

  $('#summary-strip').innerHTML = `
    <div class="summary-cell">
      <div class="label">Your position</div>
      <div class="value">${positionLabel}<span class="value-sub">/${total}</span></div>
      <div class="meta">${pctTop != null ? `Top ${pctTop}% · ` : ''}${escapeHTML(viewer.name)}</div>
    </div>
    <div class="summary-cell">
      <div class="label">Quarter change</div>
      <div class="value"><span class="${deltaSign === 'up' ? 'delta-up' : deltaSign === 'down' ? 'delta-down' : ''}">${deltaArrow} ${Math.abs(viewer.delta)}</span> <span class="value-sub">pts</span></div>
      ${sparklinePath(viewer.trend, 120, 26, trendColor)}
    </div>
    <div class="summary-cell">
      <div class="label">Renewable mix</div>
      <div class="value">${viewer.metrics.renewable}<span class="value-sub">%</span></div>
      <div class="meta">Target ≥ ${THRESHOLDS[viewer.category]?.find(t => t[0] === 'renewable')?.[2] ?? '—'}%</div>
    </div>
    <div class="summary-cell">
      <div class="label">ESG composite</div>
      <div class="value">${viewer.metrics.esg}<span class="grade ${gradeBand(grade)}">${grade}</span></div>
      <div class="meta">Sector median: ${sectorMedian(viewer.category, 'esg')}</div>
    </div>
    <div class="summary-cell stamp-cell">
      <div class="label">HSBC Stamp · ${viewer.category}</div>
      <div class="value" style="font-size:15px;display:flex;align-items:center;gap:6px;">
        ${hexagonStamp(viewer.hasStamp, 42)}
        <span>${viewer.hasStamp ? 'Granted' : `${passCount}/${gates.length} gates`}</span>
      </div>
      <div class="gates">${gatesHTML}</div>
    </div>
  `;
}

function sectorMedian(category, metric) {
  const arr = state.suppliers.filter(s => s.category === category).map(s => s.metrics[metric]).sort((a,b) => a - b);
  if (arr.length === 0) return '—';
  const m = arr[Math.floor(arr.length / 2)];
  return fmtMetric(metric, m);
}

/* --- leaderboard table --- */
function renderTable() {
  const sorted = applyFilters();
  const f = state.filters;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (f.page > totalPages) f.page = totalPages;

  const start = (f.page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  // Pin viewer row if outside the page.
  const viewerRow = sorted.find(s => s.id === state.viewerId);
  let pinViewer = false;
  if (viewerRow && !pageRows.find(s => s.id === viewerRow.id)) pinViewer = true;

  const body = $('#lb-body');
  body.innerHTML = pageRows.map(s => renderRow(s, f.rankBy)).join('')
    + (pinViewer ? renderDividerRow() + renderRow(viewerRow, f.rankBy) : '');

  // Mark active sort column
  $$('.lb-table thead th').forEach(th => {
    th.classList.toggle('is-sortcol', th.dataset.col === f.rankBy);
  });

  // Page info / pager
  const end = Math.min(start + PAGE_SIZE, sorted.length);
  $('#page-info').textContent = sorted.length === 0
    ? 'No suppliers match these filters'
    : `Showing ${start + 1}–${end} of ${sorted.length}`;
  renderPager(totalPages);

  // Meta strip
  const stamped = sorted.filter(s => s.hasStamp).length;
  $('#meta-stamped').textContent = stamped;
  $('#meta-total').textContent = sorted.length;
  $('#f-stamped-count').textContent = stamped;
  $('#meta-date').textContent = UPDATED_DATE;

  // Re-bind row clicks (delegated, but expand panel re-renders too).
  if (state.expandedId) {
    const tr = body.querySelector(`tr[data-id="${state.expandedId}"]`);
    if (tr) tr.classList.add('is-open');
  }
}

function renderDividerRow() {
  return `<tr class="divider-row"><td colspan="11">· · ·</td></tr>`;
}

function renderRow(s, sortMetric) {
  const isViewer = s.id === state.viewerId;
  const grade = gradeFor(s.metrics.esg);
  const opened = state.expandedId === s.id;
  const sameOrg = s.id === state.viewerId;
  const seeRealValues = state.persona === 'admin' || sameOrg;
  const privacyMask = (raw) => {
    if (seeRealValues) return raw;
    if (state.privacy === 'redact') return `<span class="name-redact" aria-label="redacted">${' '.repeat(8)}</span>`;
    if (state.privacy === 'codename') return `<span class="name-codename">—</span>`;
    return `<span class="name-blur">${raw}</span>`; // default: blur
  };
  const td = (metric) => {
    const val = fmtMetric(metric, s.metrics[metric]);
    const display = metric === 'scope3' ? privacyMask(val) : val;
    return `<td class="td-num ${metric === sortMetric ? 'is-sortcol' : ''}">${display}</td>`;
  };
  return `
    <tr class="row ${isViewer ? 'is-viewer' : ''}" data-id="${s.id}">
      <td><span class="rank-pill">#${s.rank}</span></td>
      <td class="td-supplier">${nameCell(s)}</td>
      <td class="td-sector">
        <div class="sector-cat">${escapeHTML(s.category)}</div>
        <div class="sector-area">${escapeHTML(s.area)}</div>
      </td>
      ${td('renewable')}
      ${td('scope3')}
      ${td('water')}
      ${td('waste')}
      ${td('diversity')}
      <td class="td-num ${sortMetric === 'esg' ? 'is-sortcol' : ''}">
        <span>${Math.round(s.metrics.esg)}</span>
        <span class="grade ${gradeBand(grade)}">${grade}</span>
      </td>
      <td class="td-stamp">${hexagonStamp(s.hasStamp, 30)}</td>
      <td class="td-exp" data-act="expand">${opened ? '▴' : '▾'}</td>
    </tr>
    <tr class="expand-row ${opened ? 'is-open' : ''}" data-expand-for="${s.id}">
      <td colspan="11">${opened ? renderExpandPanel(s) : ''}</td>
    </tr>
  `;
}

function renderExpandPanel(s) {
  const trendColor = s.delta >= 0 ? '#1f8a5b' : '#DB0011';
  const trendSvg = sparklinePath(s.trend, 280, 60, trendColor);

  const metrics = ['renewable', 'scope3', 'water', 'waste', 'diversity', 'governance'];
  const bars = metrics.map(m => {
    let pct;
    if (LOWER_IS_BETTER[m]) {
      const maxRange = m === 'scope3' ? 200000 : 1300000;
      pct = clamp(100 - (s.metrics[m] / maxRange) * 100, 0, 100);
    } else {
      pct = clamp(s.metrics[m], 0, 100);
    }
    return `<div class="metric-bar">
      <span class="mb-label">${METRIC_LABELS[m]}</span>
      <span class="mb-track"><span class="mb-fill" style="width:${pct.toFixed(0)}%"></span></span>
      <span class="mb-value">${fmtMetric(m, s.metrics[m])}${fmtUnit(m).startsWith(' ') ? '' : fmtUnit(m)}</span>
    </div>`;
  }).join('');

  const disclosures = [
    ['CDP Climate disclosure', s.metrics.governance > 60],
    ['Modern Slavery statement', s.metrics.diversity > 55],
    ['Net-Zero target published', s.metrics.renewable > 50],
    ['Board ESG oversight', s.metrics.governance > 65],
    ['Scope 3 inventory', s.metrics.scope3 < 100000],
  ].map(([txt, ok]) => `<li>
    <span class="${ok ? 'tick' : 'miss'}">${ok ? '✓' : '✕'}</span>
    <span>${txt}</span>
  </li>`).join('');

  const gates = s.gates.map(g => {
    const targetTxt = `${g.op} ${fmtMetric(g.metric, g.threshold)}${fmtUnit(g.metric)}`;
    const valTxt = `${fmtMetric(g.metric, g.value)}${fmtUnit(g.metric)}`;
    return `<div class="gate-card ${g.pass ? 'is-pass' : 'is-fail'}">
      <div class="gc-label">${METRIC_LABELS[g.metric]}</div>
      <div class="gc-status">${g.pass ? 'PASS' : 'FAIL'}</div>
      <div class="gc-detail">Current ${valTxt} · Target ${targetTxt}</div>
    </div>`;
  }).join('') || `<div class="muted">No category-specific gates configured.</div>`;

  return `
    <div class="expand-inner">
      <div class="expand-block">
        <h4>12-month ESG trend</h4>
        ${trendSvg}
        <div class="muted" style="margin-top:6px;font-family:var(--font-mono);font-size:10.5px;">
          Q-1: ${s.trend[8]} → Q0: ${s.trend[11]} (${s.delta >= 0 ? '+' : ''}${s.delta} pts)
        </div>
      </div>
      <div class="expand-block">
        <h4>Metric breakdown</h4>
        <div class="metric-bars">${bars}</div>
      </div>
      <div class="expand-block">
        <h4>HSBC Stamp criteria · ${escapeHTML(s.category)}</h4>
        <div class="stamp-criteria">${gates}</div>
        <h4 style="margin-top:14px;">Disclosures</h4>
        <ul class="disclosures">${disclosures}</ul>
      </div>
    </div>
  `;
}

function renderPager(totalPages) {
  const p = state.filters.page;
  const pager = $('#pager');
  if (totalPages <= 1) { pager.innerHTML = ''; return; }
  const buttons = [];
  buttons.push(`<button data-pg="prev" ${p === 1 ? 'disabled' : ''}>‹</button>`);
  for (let i = 1; i <= totalPages; i++) {
    buttons.push(`<button data-pg="${i}" class="${i === p ? 'is-active' : ''}">${i}</button>`);
  }
  buttons.push(`<button data-pg="next" ${p === totalPages ? 'disabled' : ''}>›</button>`);
  pager.innerHTML = buttons.join('');
}

/* ===================== AI COACH ===================== */

function renderAISnapshot() {
  const viewer = state.suppliers.find(s => s.id === state.viewerId);
  if (!viewer) return;
  const filtered = applyFilters();
  const rank = filtered.find(s => s.id === viewer.id)?.rank ?? '—';
  const deltaSign = viewer.delta > 0 ? 'up' : viewer.delta < 0 ? 'down' : '';
  const deltaSym = viewer.delta > 0 ? '+' : '';
  const trendColor = viewer.delta >= 0 ? '#1f8a5b' : '#DB0011';
  $('#ai-snapshot').innerHTML = `
    <div class="snap-cell">
      <div class="snap-label">Rank</div>
      <div class="snap-val">#${rank}</div>
    </div>
    <div class="snap-cell">
      <div class="snap-label">ESG</div>
      <div class="snap-val">${viewer.metrics.esg}<span class="snap-val-sm">/100</span></div>
    </div>
    <div class="snap-cell">
      <div class="snap-label">Δ Quarter</div>
      <div class="snap-val" style="color:${trendColor}">${deltaSym}${viewer.delta}</div>
      ${sparklinePath(viewer.trend, 84, 16, trendColor)}
    </div>
  `;
}

function renderAIGoal() {
  const viewer = state.suppliers.find(s => s.id === state.viewerId);
  if (!viewer) return;
  const el = $('#ai-goal');

  if (viewer.hasStamp) {
    el.classList.add('is-stamped');
    el.innerHTML = `
      <div class="goal-head">
        <span class="goal-title">HSBC Stamp · ${escapeHTML(viewer.category)}</span>
        <span class="goal-tag">GRANTED</span>
      </div>
      <div class="goal-metric">All stamp gates passing ✓</div>
      <div class="goal-note">You've cleared every threshold for your category. Focus on widening your lead — your nearest peer is ${nearestPeerGap(viewer)}.</div>
    `;
    return;
  }
  el.classList.remove('is-stamped');

  // Pick blocking gate furthest from passing.
  const blocking = viewer.gates.filter(g => !g.pass)
    .sort((a, b) => a.progress - b.progress);
  if (blocking.length === 0) { el.innerHTML = ''; return; }
  const g = blocking[0];
  const pct = Math.round(g.progress * 100);
  const projection = projectRankIfClosed(viewer, g);
  el.innerHTML = `
    <div class="goal-head">
      <span class="goal-title">Closest goal · stamp gate</span>
      <span class="goal-tag">HIGH IMPACT</span>
    </div>
    <div class="goal-metric">${METRIC_LABELS[g.metric]}</div>
    <div class="goal-vals">
      <strong>${fmtMetric(g.metric, g.value)}${fmtUnit(g.metric)}</strong>
      → ${g.op} ${fmtMetric(g.metric, g.threshold)}${fmtUnit(g.metric)}
    </div>
    <div class="goal-bar"><span class="goal-bar-fill" style="width:${pct}%"></span></div>
    <div class="goal-note">
      Close this gate to qualify for the HSBC Stamp. Projected new rank:
      <strong>#${projection.rank}</strong>.
    </div>
    <div class="goal-cta">
      <button class="btn btn-primary" data-ai="set-goal">Set as Q3 goal</button>
      <button class="btn btn-ghost" data-ai="how">How?</button>
    </div>
  `;
}

function nearestPeerGap(viewer) {
  const peers = state.suppliers.filter(s => s.category === viewer.category && s.id !== viewer.id);
  if (peers.length === 0) return 'unavailable';
  const ahead = peers.filter(p => p.metrics.esg > viewer.metrics.esg).sort((a,b) => a.metrics.esg - b.metrics.esg)[0];
  if (!ahead) return 'already leading the sector';
  return `${(ahead.metrics.esg - viewer.metrics.esg).toFixed(1)} ESG pts above you`;
}

/* Deterministic what-if model — moves the viewer's value, recomputes rank. */
function projectRankIfClosed(viewer, gate) {
  const clone = JSON.parse(JSON.stringify(state.suppliers));
  const target = clone.find(s => s.id === viewer.id);
  target.metrics[gate.metric] = gate.threshold;
  // Re-run the full global-score engine so sector percentiles update too.
  computeGlobalScores(clone);
  for (const s of clone) {
    s.gates = computeGates(s);
    s.hasStamp = s.gates.length > 0 && s.gates.every(gt => gt.pass);
  }
  const f = state.filters;
  let list = clone;
  if (f.category !== 'All') list = list.filter(s => s.category === f.category);
  if (f.area !== 'All') list = list.filter(s => s.area === f.area);
  if (f.region !== 'All') list = list.filter(s => s.region === f.region);
  const sorted = recomputeRanks(list, f.rankBy);
  const newRank = sorted.find(s => s.id === viewer.id)?.rank ?? '—';
  return { rank: newRank, newEsg: target.metrics.esg, gainedStamp: target.hasStamp };
}

/* What-if for an arbitrary metric value (used by "If I hit 90% renewable") */
function projectRankForMetric(viewer, metric, newValue) {
  const fakeGate = { metric, op: '>=', threshold: newValue, value: newValue, pass: true, progress: 1 };
  return projectRankIfClosed(viewer, fakeGate);
}

/* === Chat thread === */

function pushMessage(role, html) {
  state.chat.push({ role, html });
  const t = $('#ai-thread');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = `<div class="bubble">${html}</div>`;
  t.appendChild(div);
  t.scrollTop = t.scrollHeight;
}

function streamMessage(html, onDone) {
  // Simple two-step fake stream: typing dots → final message.
  const t = $('#ai-thread');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.innerHTML = `<div class="bubble"><span class="dots">…</span></div>`;
  t.appendChild(div);
  t.scrollTop = t.scrollHeight;
  setTimeout(() => {
    div.querySelector('.bubble').innerHTML = html;
    t.scrollTop = t.scrollHeight;
    if (onDone) onDone();
  }, 420);
}

function aiIntro() {
  const viewer = state.suppliers.find(s => s.id === state.viewerId);
  if (!viewer) return;
  const filtered = applyFilters();
  const rank = filtered.find(s => s.id === viewer.id)?.rank ?? '—';
  const total = filtered.length;
  const pct = rank !== '—' ? Math.round((rank / total) * 100) : '—';
  const missing = viewer.gates.filter(g => !g.pass).length;
  const stampSentence = viewer.hasStamp
    ? `You hold the <strong>HSBC Stamp</strong> for ${escapeHTML(viewer.category)} suppliers.`
    : `You are <strong>${missing} gate${missing === 1 ? '' : 's'} short</strong> of the HSBC Stamp for ${escapeHTML(viewer.category)} suppliers.`;
  pushMessage('assistant', `Hi ${escapeHTML(viewer.name.split(' ')[0])} — you're currently ranked <strong>#${rank}</strong> out of ${total} on the composite ESG score, putting you in the top ${pct}%. ${stampSentence}`);
}

/* AI prompt handlers — every numeric claim comes from a deterministic
   "tool call" (state, gates, what-if model), not from free text. */

const AI_HANDLERS = {
  stamp() {
    const v = state.suppliers.find(s => s.id === state.viewerId);
    if (v.hasStamp) return `Your category (<strong>${escapeHTML(v.category)}</strong>) gates are all passing. The Stamp is granted. <span class="citation">tool: stamp-service</span>`;
    const missing = v.gates.filter(g => !g.pass);
    const items = missing.map(g => `<li><strong>${METRIC_LABELS[g.metric]}</strong> — currently ${fmtMetric(g.metric, g.value)}${fmtUnit(g.metric)}, target ${g.op} ${fmtMetric(g.metric, g.threshold)}${fmtUnit(g.metric)}</li>`).join('');
    return `To earn the HSBC Stamp for <strong>${escapeHTML(v.category)}</strong>, close these gates:<ul>${items}</ul><span class="citation">tool: stamp-service</span>`;
  },
  peers() {
    const v = state.suppliers.find(s => s.id === state.viewerId);
    const peers = state.suppliers.filter(s => s.category === v.category);
    const median = (m) => { const arr = peers.map(s => s.metrics[m]).sort((a,b) => a-b); return arr[Math.floor(arr.length/2)]; };
    const med = { esg: median('esg'), governance: median('governance'), scope3: median('scope3'), renewable: median('renewable') };
    const above = (m) => v.metrics[m] >= med[m];
    const leads = [], trails = [];
    for (const m of ['esg', 'governance', 'renewable']) {
      const d = v.metrics[m] - med[m];
      if (Math.abs(d) < 2) continue;
      (d > 0 ? leads : trails).push(`<strong>${METRIC_LABELS[m]}</strong> (${d > 0 ? '+' : ''}${d.toFixed(0)} vs median)`);
    }
    const ds3 = v.metrics.scope3 - med.scope3;
    if (Math.abs(ds3) > 2000) {
      (ds3 < 0 ? leads : trails).push(`<strong>Scope 3</strong> (${ds3 < 0 ? '−' : '+'}${Math.abs(Math.round(ds3/1000))}k tCO₂e vs median)`);
    }
    const sorted = recomputeRanks(peers, 'esg');
    const myRank = sorted.find(s => s.id === v.id).rank;
    return `Among <strong>${escapeHTML(v.category)}</strong> peers (${peers.length} suppliers), you're <strong>#${myRank}</strong> by composite ESG.
      ${leads.length ? '<br>You <strong>lead</strong> on ' + leads.join(', ') + '.' : ''}
      ${trails.length ? '<br>You <strong>trail</strong> on ' + trails.join(', ') + '.' : ''}
      <span class="citation">tool: peer-aggregate</span> ${above('esg') ? '' : ''}`;
  },
  actions() {
    const v = state.suppliers.find(s => s.id === state.viewerId);
    const ACTIONS = {
      renewable: [
        { name: 'On-site solar PV install', gain: 4.2, capex: '£1.8M', payback: '5.4 yrs' },
        { name: 'PPA with offshore wind generator', gain: 5.1, capex: '£0.3M / yr opex', payback: '0 yrs' },
        { name: 'Energy efficiency retrofit (HVAC + lighting)', gain: 1.8, capex: '£0.6M', payback: '3.2 yrs' },
      ],
      scope3: [
        { name: 'Engage top-20 tier-2 suppliers on CBAM data', gain: 3.0, capex: '£0.15M', payback: 'reputation' },
        { name: 'Switch primary freight lane to rail/short-sea', gain: 2.4, capex: '£0.4M opex', payback: '2.1 yrs' },
        { name: 'Replace gas company fleet with EV', gain: 1.6, capex: '£2.4M', payback: '6.0 yrs' },
      ],
      water: [
        { name: 'Closed-loop process water at largest plant', gain: 2.2, capex: '£3.1M', payback: '7.4 yrs' },
        { name: 'Greywater reuse retrofit', gain: 1.1, capex: '£0.9M', payback: '5.5 yrs' },
        { name: 'Drought-zone supplier reallocation', gain: 1.4, capex: 'negligible', payback: '0' },
      ],
      waste: [
        { name: 'Mandatory take-back on packaging', gain: 2.0, capex: '£0.3M', payback: '3.2 yrs' },
        { name: 'Switch to mono-material plastics', gain: 1.6, capex: '£0.8M', payback: '4.1 yrs' },
        { name: 'On-site composting + anaerobic digestion', gain: 1.4, capex: '£1.2M', payback: '5.8 yrs' },
      ],
      diversity: [
        { name: 'Apprentice programme in under-represented regions', gain: 1.9, capex: '£0.4M / yr', payback: 'social' },
        { name: 'Board diversity target binding by FY26', gain: 1.2, capex: 'governance', payback: 'reputation' },
        { name: 'Pay equity audit + remediation', gain: 1.3, capex: '£0.2M', payback: 'compliance' },
      ],
      governance: [
        { name: 'CSRD-aligned double-materiality assessment', gain: 2.6, capex: '£0.25M', payback: 'compliance' },
        { name: 'TCFD scenario analysis (1.5/2/3°C)', gain: 1.9, capex: '£0.18M', payback: 'compliance' },
        { name: 'Independent ESG audit committee', gain: 1.7, capex: '£0.1M / yr', payback: 'governance' },
      ],
    };
    // Weakest metric = lowest progress, but skip ESG (which is derived).
    const candidates = ['renewable', 'scope3', 'water', 'waste', 'diversity', 'governance'];
    let weakest = candidates[0], worstScore = 1;
    for (const m of candidates) {
      const score = LOWER_IS_BETTER[m]
        ? 1 - clamp(v.metrics[m] / (m === 'scope3' ? 200000 : 1300000), 0, 1)
        : v.metrics[m] / 100;
      if (score < worstScore) { worstScore = score; weakest = m; }
    }
    const top = ACTIONS[weakest] || ACTIONS.renewable;
    const items = top.map(a => `<li><strong>${a.name}</strong> — +${a.gain} ESG · capex ${a.capex} · payback ${a.payback}</li>`).join('');
    return `Your weakest metric is <strong>${METRIC_LABELS[weakest]}</strong>. Highest-impact moves from the curated action library:<ul>${items}</ul><span class="citation">tool: action-library(${weakest})</span>`;
  },
  whatif() {
    const v = state.suppliers.find(s => s.id === state.viewerId);
    const proj = projectRankForMetric(v, 'renewable', 90);
    return `If you hit <strong>90% renewable electricity</strong>, our model projects you'd move from <strong>#${v.rank}</strong> to <strong>#${proj.rank}</strong>. ESG composite: <strong>${v.metrics.esg} → ${Math.round(proj.newEsg)}</strong>. ${proj.gainedStamp && !v.hasStamp ? 'You\'d also qualify for the <strong>HSBC Stamp</strong>.' : ''} <br>Indicative capex ~£2.1M, payback ~4.2 yrs. <span class="citation">tool: whatif-model</span>`;
  },
  regulatory() {
    const v = state.suppliers.find(s => s.id === state.viewerId);
    const RULES = {
      Finance: ['CSRD (FY25 reporting)', 'EU Taxonomy alignment disclosure', 'TCFD-mandatory (UK FCA)', 'SFDR Article 8/9 if marketing funds'],
      Energy: ['CSRD (FY24 large)', 'EU ETS quota compliance', 'CBAM (EU import scope from 2026)', 'TCFD/IFRS S2 transition plan'],
      Pharmaceuticals: ['CSRD', 'EU REACH continued obligations', 'Modern Slavery Act statement', 'EFPIA disclosure code'],
      Electronics: ['CSRD', 'CBAM (steel/aluminium components)', 'WEEE compliance', 'EU Battery Regulation'],
      Automotive: ['CSRD', 'EU CO₂ fleet targets', 'CBAM', 'Battery Regulation (BEV/HEV)'],
      Construction: ['CSRD', 'EU Taxonomy: substantial-contribution check', 'EPBD (Energy Performance of Buildings)'],
      Consulting: ['CSRD (large group level)', 'SECR (UK)', 'Modern Slavery Act statement'],
      'Food & Beverage': ['CSRD', 'EU Deforestation Regulation (EUDR)', 'PPWR packaging rules', 'Modern Slavery Act'],
      'IT Services': ['CSRD', 'NIS2 / DORA (if financial-services clients)', 'TCFD'],
      Logistics: ['CSRD', 'CBAM', 'EU CountEmissionsEU (delegate act 2026)', 'SECR (UK)'],
      Telecoms: ['CSRD', 'EU Code of Conduct for Energy Efficiency in Data Centres', 'TCFD'],
      Textiles: ['CSRD', 'EU Strategy for Sustainable & Circular Textiles', 'EUDR for natural fibres', 'Modern Slavery Act'],
    };
    const list = (RULES[v.category] || []).map(r => `<li>${r}</li>`).join('');
    return `Sector-relevant disclosure obligations for <strong>${escapeHTML(v.category)}</strong>:<ul>${list}</ul><span class="citation">tool: regulatory-rules-engine</span>`;
  },
};

function handleAIPrompt(key) {
  const v = state.suppliers.find(s => s.id === state.viewerId);
  if (!v) return;
  const userText = {
    stamp: 'What do I need for the HSBC Stamp?',
    peers: 'How do I compare to peers?',
    actions: 'Top 3 actions to climb',
    whatif: 'If I hit 90% renewable, where would I rank?',
    regulatory: 'Flag regulatory risks for my sector',
  }[key];
  pushMessage('user', escapeHTML(userText));
  streamMessage(AI_HANDLERS[key]());
}

function handleAIFreeform(text) {
  pushMessage('user', escapeHTML(text));
  // Crude routing: detect keywords, fall through to grounded data summary.
  const t = text.toLowerCase();
  if (/who.*#?1|who.*top|name.*top|name.*winner|who.*leader|who is/.test(t)) {
    streamMessage(`Supplier identities are protected — only their metrics are visible. The top-ranked supplier in your filter view has an ESG of <strong>${applyFilters()[0]?.metrics.esg ?? '—'}</strong>. <span class="citation">policy: anonymise-peers</span>`);
    return;
  }
  if (t.includes('stamp')) return streamMessage(AI_HANDLERS.stamp());
  if (t.includes('peer') || t.includes('rank')) return streamMessage(AI_HANDLERS.peers());
  if (t.includes('action') || t.includes('improve') || t.includes('climb')) return streamMessage(AI_HANDLERS.actions());
  if (t.includes('regul') || t.includes('csrd') || t.includes('tcfd') || t.includes('secr')) return streamMessage(AI_HANDLERS.regulatory());
  if (/(if|what.?if|hit|reach|achieve|90|80|70).*(%|renew|scope|emission|water|waste)/.test(t)) {
    return streamMessage(AI_HANDLERS.whatif());
  }
  // Grounded fallback — only the viewer's own numbers.
  const v = state.suppliers.find(s => s.id === state.viewerId);
  streamMessage(`I'm grounded on your organisation's data only — composite ESG <strong>${v.metrics.esg}/100</strong>, rank <strong>#${v.rank}</strong>, ${v.hasStamp ? 'Stamp granted' : `${v.gates.filter(g => !g.pass).length} gate(s) short of Stamp`}. Try one of the suggested prompts for a deeper view. <span class="citation">tool: viewer-rag</span>`);
}

/* ===================== EVENT WIRING ===================== */

function populateSelect(el, items, currentValue, prefix) {
  el.innerHTML = ['All', ...items].map(v =>
    `<option value="${escapeHTML(v)}" ${v === currentValue ? 'selected' : ''}>${prefix}${v}</option>`
  ).join('');
}
function populateSelectPlain(el, items, currentValue) {
  el.innerHTML = items.map(v =>
    `<option value="${escapeHTML(v)}" ${v === currentValue ? 'selected' : ''}>${escapeHTML(v)}</option>`
  ).join('');
}

function bind() {
  // Tab clicks (router via hash)
  $$('.tab').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = a.dataset.tab;
      writeHash(tab);
      setActiveTab(tab);
    });
  });
  window.addEventListener('popstate', () => { applyHash(); rerenderAll(); });
  window.addEventListener('hashchange', () => { applyHash(); rerenderAll(); });

  // Filters
  const filterControls = [
    ['category', '#f-category'],
    ['area', '#f-area'],
    ['region', '#f-region'],
    ['period', '#f-period'],
    ['rankBy', '#f-rankby'],
  ];
  for (const [key, sel] of filterControls) {
    const el = $(sel);
    if (!el) continue;
    el.addEventListener('change', () => {
      state.filters[key] = el.value;
      state.filters.page = 1;
      writeHash('leaderboard');
      rerenderAll();
    });
  }
  $('#f-stamped').addEventListener('click', () => {
    state.filters.stampedOnly = !state.filters.stampedOnly;
    state.filters.page = 1;
    $('#f-stamped').setAttribute('aria-pressed', String(state.filters.stampedOnly));
    writeHash('leaderboard');
    rerenderAll();
  });

  // Sort by clicking column headers (numeric columns only)
  $$('.lb-table thead th[data-col]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      state.filters.rankBy = th.dataset.col;
      $('#f-rankby').value = th.dataset.col;
      state.filters.page = 1;
      writeHash('leaderboard');
      rerenderAll();
    });
  });

  // Row expand (event delegation — any click on the row toggles, except buttons/links)
  $('#lb-body').addEventListener('click', (e) => {
    if (e.target.closest('a, button, input')) return;
    const row = e.target.closest('tr.row');
    if (!row) return;
    const id = row.dataset.id;
    state.expandedId = state.expandedId === id ? null : id;
    renderTable();
  });

  // Pager
  $('#pager').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pg]');
    if (!b) return;
    const totalPages = Math.max(1, Math.ceil(applyFilters().length / PAGE_SIZE));
    const v = b.dataset.pg;
    if (v === 'prev') state.filters.page = Math.max(1, state.filters.page - 1);
    else if (v === 'next') state.filters.page = Math.min(totalPages, state.filters.page + 1);
    else state.filters.page = parseInt(v, 10);
    writeHash('leaderboard');
    rerenderAll();
  });

  // CSV export
  $('#btn-export').addEventListener('click', exportCSV);
  $('#btn-compare').addEventListener('click', () => {
    alert('Compare mode is a stub. Wire to multi-select on rows in v1.1.');
  });

  // AI sidebar
  $('#ai-prompts').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-prompt]');
    if (!b) return;
    handleAIPrompt(b.dataset.prompt);
  });
  $('#ai-input-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#ai-input');
    const txt = inp.value.trim();
    if (!txt) return;
    inp.value = '';
    handleAIFreeform(txt);
  });
  $('#ai-goal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ai]');
    if (!b) return;
    if (b.dataset.ai === 'set-goal') {
      pushMessage('user', 'Set the closest gate as my Q3 goal.');
      streamMessage(`Goal added to your Action plan. I'll surface progress every fortnight and ping you if you fall behind the trajectory needed to close it before Q3 close. <span class="citation">tool: action-plan-service</span>`);
    } else if (b.dataset.ai === 'how') {
      handleAIPrompt('actions');
    }
  });

  // Dev bar
  $('#dev-persona').addEventListener('change', (e) => {
    state.persona = e.target.value;
    renderTable();
    renderSummaryStrip();
  });
  $('#dev-privacy').addEventListener('change', (e) => {
    state.privacy = e.target.value;
    renderTable();
  });
  $('#dev-viewer').addEventListener('change', (e) => {
    state.suppliers.forEach(s => s.isViewer = false);
    state.viewerId = e.target.value;
    const v = state.suppliers.find(s => s.id === state.viewerId);
    if (v) v.isViewer = true;
    state.chat = [];
    $('#ai-thread').innerHTML = '';
    rerenderAll();
    aiIntro();
  });
  $('#dev-ai-open').addEventListener('change', (e) => {
    state.aiOpen = e.target.checked;
    $('#ai-sidebar').classList.toggle('is-closed', !state.aiOpen);
  });
}

/* ====================== CSV EXPORT ====================== */

function exportCSV() {
  const rows = applyFilters();
  const cols = ['rank', 'id', 'name', 'category', 'area', 'region', 'country',
                'renewable', 'scope3', 'water', 'waste', 'diversity', 'governance', 'esg',
                'grade', 'hasStamp'];
  const header = cols.join(',');
  const lines = rows.map(s => {
    const sameOrg = s.id === state.viewerId;
    const reveal = state.persona === 'admin' || sameOrg;
    const safeName = reveal ? s.name : s.id;
    const values = [
      s.rank, s.id, csvEscape(safeName), s.category, s.area, s.region, s.country,
      s.metrics.renewable, s.metrics.scope3, s.metrics.water, s.metrics.waste,
      s.metrics.diversity, s.metrics.governance, s.metrics.esg,
      gradeFor(s.metrics.esg), s.hasStamp,
    ];
    return values.join(',');
  });
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hsbc-leaderboard-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
function csvEscape(s) {
  const str = String(s);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

/* ====================== RENDER ENTRY ====================== */

function rerenderAll() {
  syncFilterControls();
  renderGlobalScore();
  renderTable();
  renderSummaryStrip();
  renderAISnapshot();
  renderAIGoal();
}

function syncFilterControls() {
  $('#f-category').value = state.filters.category;
  $('#f-area').value = state.filters.area;
  $('#f-region').value = state.filters.region;
  $('#f-period').value = state.filters.period;
  $('#f-rankby').value = state.filters.rankBy;
  $('#f-stamped').setAttribute('aria-pressed', String(state.filters.stampedOnly));
}

function init() {
  // Build data
  state.suppliers = buildSuppliers();
  computeGlobalScores(state.suppliers);
  computeStamps(state.suppliers);
  recomputeRanks(state.suppliers, 'esg');

  // Pick the viewer (default: Meridian Capital Partners).
  const defaultViewer = state.suppliers.find(s => s.name === 'Meridian Capital Partners')
    || state.suppliers[0];
  state.viewerId = defaultViewer.id;
  defaultViewer.isViewer = true;

  // Populate selects
  populateSelect($('#f-category'), CATEGORIES, 'All', 'Category: ');
  populateSelect($('#f-area'), AREAS, 'All', 'Area: ');
  populateSelect($('#f-region'), REGIONS, 'All', 'Region: ');
  populateSelectPlain($('#f-period'), PERIODS, 'This quarter');
  // Dev viewer chooser
  $('#dev-viewer').innerHTML = state.suppliers.map(s =>
    `<option value="${s.id}" ${s.id === state.viewerId ? 'selected' : ''}>${escapeHTML(s.name)} (${s.category})</option>`
  ).join('');

  bind();

  // Route to current hash
  applyHash();
  if (!location.hash) location.hash = '#leaderboard';
  syncFilterControls();
  rerenderAll();
  aiIntro();
}

document.addEventListener('DOMContentLoaded', init);
