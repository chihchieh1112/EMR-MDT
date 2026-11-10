/* Two-level order categories over the B catalog snapshot.
   The B catalog has no 主分類／次分類／常用 fields — it only carries `kind`, `isLab` and a single
   Vietnamese `group` string on services. Everything below is an explicit mapping layer so the
   picker can look like a Taiwanese CPOE without inventing catalog data. Original group names are
   kept verbatim; no unapproved Chinese translations are added. */
(function (root) {
  'use strict';
  const clinical = typeof module !== 'undefined' ? require('./clinical.js') : root.ICUClinical;
  const catalog = clinical.catalog;

  const startsWithAny = (value, prefixes) => prefixes.some(prefix => String(value || '').trim().toUpperCase().startsWith(prefix.toUpperCase()));
  // EMR整合MDT demo（2026-11-10）：英文示範目錄的檢查群組名、科別與常用清單由資料集提供。
  const SEED = (root.ICUDemoSeed && root.ICUDemoSeed.taxonomy) || null;
  const IMAGING_GROUPS = ['CT-SCANNER','X-QUANG','SPECT','CỘNG HƯỞNG TỪ','SIÊU ÂM','NỘI SOI','ĐIỆN NÃO','ĐIỆN TIM','ĐIỆN CƠ','THÍNH HỌC','NIỆU ĐỘNG HỌC','TEST'].concat((SEED && SEED.imagingGroups) || []);

  // 主分類. `match` runs against a catalog entry; first match wins, in this order.
  // 2026-11-08：醫囑只有四種——藥囑、檢驗、檢查、照護；手術、處置、衛材、飲食與其他服務都是照護（G9 service_request.category）。
  const categories = [
    {id:'medication', label:'Medication orders', hint:'Catalog B 38_Medications', match:e=>e.kind==='medication'},
    {id:'lab', label:'Lab tests', hint:'isLab or XN / blood groups', match:e=>e.kind==='service'&&(e.isLab===true||startsWithAny(e.group,['XN','Máu']))},
    {id:'imaging', label:'Exams', hint:'Imaging and functional test groups', match:e=>e.kind==='service'&&startsWithAny(e.group,IMAGING_GROUPS)},
    {id:'care', label:'Care orders', hint:'Every other service, supply and diet item: procedures, surgery, supplies, diet', match:e=>e.kind==='service'||e.kind==='supply'||e.kind==='diet'}
  ];
  // 套餐 is a UI construct, not a catalog kind — it has no `match` and is handled by orders.js.
  const setCategory = {id:'set', label:'Order sets', hint:'Built-in demo order sets; not approved by the hospital'};

  const categoryIds = categories.map(c => c.id).concat(setCategory.id);
  // 舊分類（2026-11-08 以前）存在本地分類覆寫與網址裡：labimaging 分不出檢驗或檢查，改回依規則判斷；其餘都是照護。
  const LEGACY = {procedure:'care', surgery:'care', supply:'care', diet:'care', other:'care'};
  const isDiagnostic = id => id === 'lab' || id === 'imaging';
  const orderable = new Set(['medication','service','supply','diet']); // route/unit/icd are field pickers, not orders.

  // 醫令品項本地擴充（2026-10-18）：分類覆寫、可開立、英文顯示名、排序。state 由 store／app 綁進來，呼叫端不必逐一傳。
  let boundState = null;
  const bindState = state => { boundState = state || null; };
  const extOf = (entry, state) => { const st = state || boundState; return entry && st && st.master && st.master.serviceExt ? (st.master.serviceExt[entry.key] || null) : null; };
  const isOrderable = (entry, state) => { const ext = extOf(entry, state); return !(ext && ext.is_orderable === false); };
  const displayName = (entry, state) => { const ext = extOf(entry, state); return (ext && ext.name_en) || (entry && (entry.zh || entry.name)) || ''; };
  const sortOrderOf = (key, state) => { const st = state || boundState; const ext = st && st.master && st.master.serviceExt && st.master.serviceExt[key]; return ext && Number.isFinite(ext.sort_order) ? ext.sort_order : null; };
  function categoryOfEntry(entry, state) {
    if (!entry || !orderable.has(entry.kind)) return null;
    const ext = extOf(entry, state);
    const override = ext && ext.order_category_override ? (LEGACY[ext.order_category_override] || ext.order_category_override) : null;
    if (override && categories.some(c => c.id === override)) return override;
    const hit = categories.find(c => c.match(entry));
    return hit ? hit.id : 'care';
  }

  // Order records carry a frozen `catalog` snapshot; fall back to `kind` for the legacy seeds.
  function categoryOfOrder(order) {
    if (!order) return 'care';
    const fromCatalog = order.catalog && categoryOfEntry(order.catalog);
    if (fromCatalog) return fromCatalog;
    if (order.kind === 'medication') return 'medication';
    if (order.catalog && order.catalog.isLab) return 'lab';
    return 'care';
  }

  const labelOf = id => (categories.find(c => c.id === id) || (id === setCategory.id ? setCategory : null) || {label:'Other'}).label;

  // --- group index (次層分群，對應參考畫面的綠色群組標題) -------------------------
  let groups = null;
  function buildGroups() {
    if (groups) return groups;
    groups = {};
    categoryIds.forEach(id => {groups[id] = new Map();});
    catalog.entries.forEach(entry => {
      const category = categoryOfEntry(entry);
      if (!category) return;
      const name = entry.kind === 'service' ? (entry.group || 'Group not provided by source') : defaultGroup(entry);
      const bucket = groups[category];
      if (!bucket.has(name)) bucket.set(name, []);
      bucket.get(name).push(entry.key);
    });
    Object.values(groups).forEach(bucket => bucket.forEach(list => list.sort()));
    return groups;
  }
  function defaultGroup(entry) {
    if (entry.kind === 'medication') return entry.atc ? 'ATC ' + String(entry.atc).slice(0, 1) : 'ATC not labeled';
    if (entry.kind === 'supply') return 'Supplies & consumables';
    if (entry.kind === 'diet') return 'Diet items';
    return 'Group not provided by source';
  }

  // Returns [{name, total, keys}] for one 主分類, honouring an optional keyword filter.
  function groupsFor(category, query = '', perGroup = 60) {
    const bucket = buildGroups()[category];
    if (!bucket) return [];
    const words = String(query || '').trim();
    return [...bucket.entries()].map(([name, keys]) => {
      const filtered = (words ? keys.filter(key => clinical.matches(key, words)) : keys).slice().sort((a, b) => { const x = sortOrderOf(a), y = sortOrderOf(b); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return x - y; });
      return {name, total: filtered.length, keys: filtered.slice(0, perGroup)};
    }).filter(group => group.total > 0).sort((a, b) => b.total - a.total);
  }

  // --- 醫師常用／科常用 -----------------------------------------------------------
  // Nothing in the B catalog marks these (specs.js S11-A-03 records 「科常用需院核准」).
  // These seeded lists are demo defaults; users add their own via the store's toggleFavorite.
  const departments = (SEED && SEED.departments) || [
    ['01', 'Cardiac surgery'], ['02', 'Pulmonology'], ['03', 'Pediatrics'],
    ['04', 'Neurosurgery'], ['05', 'Infectious diseases'], ['06', 'ICU']
  ];
  const doctorDefaults = (SEED && SEED.doctorDefaults) || [
    'medication:44978', 'medication:50631', 'medication:43636',
    'service:1020', 'service:646', 'service:680', 'service:11352', 'service:685', 'service:537'
  ];
  const departmentDefaults = (SEED && SEED.departmentDefaults) || {
    'Cardiac surgery': ['service:1020', 'service:646', 'service:537', 'service:4151', 'medication:43636'],
    'Pulmonology': ['service:537', 'service:1020', 'service:10242', 'service:11352'],
    'Pediatrics': ['service:1020', 'service:685', 'medication:50631'],
    'Neurosurgery': ['service:12219', 'service:1020', 'service:646'],
    'Infectious diseases': ['service:11352', 'service:1020', 'service:646'],
    'ICU': ['service:1020', 'service:646', 'service:680', 'service:537', 'service:685']
  };
  // 示範病人的 department 寫成 'ICU'，上表用中文科別名；沒有這組別名，部門常用對所有示範病人都是空的。
  departmentDefaults.ICU = departmentDefaults['ICU'];

  function record(stored, owner) {
    const raw = stored[owner];
    if (Array.isArray(raw)) return {on: raw, off: []};
    return {on: (raw && raw.on) || [], off: (raw && raw.off) || []};
  }
  function favouriteKeys(scope, state, actorId, actor) {
    const stored = (state && state.favorites) || {};
    const department = (actor && actor.department) || 'Department not specified';
    const owner = scope === 'department' ? 'dept:' + department : 'actor:' + actorId;
    // 科常用維護檔（2026-10-18）：部門管理員存過清單後以清單為正本（有序、不併示範預設）；沒存過才用 on／off＋預設。
    if (scope === 'department') { const saved = state && state.master && state.master.deptFavorite && state.master.deptFavorite[owner]; if (saved && Array.isArray(saved.list)) return dedupe(saved.list); }
    const defaults = scope === 'department' ? (departmentDefaults[department] || []) : doctorDefaults;
    const {on, off} = record(stored, owner);
    return dedupe(defaults.concat(on)).filter(key => !off.includes(key));
  }
  function isFavourite(scope, state, actorId, actor, key) {
    return favouriteKeys(scope, state, actorId, actor).includes(key);
  }
  const dedupe = list => [...new Set(list)].filter(Boolean);

  // 執行頻率 was a free-text box, which made two orders for the same schedule read differently.
  // These are the strings the prototype writes; they are display conventions, not an approved
  // hospital frequency master, and the store still keeps `frequency` as a plain string.
  const frequencies = [
    ['Immediate & single dose', [['STAT (immediately)','STAT (immediately)'],['Once now','Once now'],['Once pre-op','Once pre-op'],['Once at bedtime (HS)','Once at bedtime (HS)']]],
    ['Fixed daily times', [['QD (once daily)','QD (once daily)'],['BID (twice daily)','BID (twice daily)'],['TID (3 times daily)','TID (3 times daily)'],['QID (4 times daily)','QID (4 times daily)']]],
    ['Fixed interval', [['Q2H (every 2 h)','Q2H (every 2 h)'],['Q4H (every 4 h)','Q4H (every 4 h)'],['Q6H (every 6 h)','Q6H (every 6 h)'],['Q8H (every 8 h)','Q8H (every 8 h)'],['Q12H (every 12 h)','Q12H (every 12 h)']]],
    ['Interval (days)', [['QOD (every other day)','QOD (every other day)'],['Three times a week','Three times a week'],['QW (once weekly)','QW (once weekly)']]],
    ['As needed', [['PRN (as needed)','PRN (as needed)']]],
    ['Continuous', [['Continuous infusion','Continuous infusion'],['Continuous monitoring','Continuous monitoring']]]
  ];
  const CUSTOM_FREQUENCY = '__custom__';

  // --- 藥品篩選：ATC 藥理群、給藥途徑、劑型 ------------------------------------------
  //     B 目錄的藥品只有 code／name／unit／strength／ingredient／atc／routeId，沒有分類欄位，
  //     所以三個篩選都直接從既有欄位統計出來，不另建分類主檔、不自行翻譯 ATC 名稱。
  //     ATC 一碼群名用 WHO ATC 的英文原名；中文群名要院方核定後才可顯示。
  const atcMajor = {
    A:'Alimentary tract and metabolism', B:'Blood and blood forming organs',
    C:'Cardiovascular system', D:'Dermatologicals',
    G:'Genito-urinary system and sex hormones', H:'Systemic hormonal preparations',
    J:'Antiinfectives for systemic use', L:'Antineoplastic and immunomodulating agents',
    M:'Musculo-skeletal system', N:'Nervous system',
    P:'Antiparasitic products, insecticides and repellents', R:'Respiratory system',
    S:'Sensory organs', V:'Various'
  };
  const medications = () => catalog.entries.filter(e => e.kind === 'medication' && e.active);
  let drugFacets = null;
  // 兩碼才是醫師腦中的分類（J01 全身性抗菌劑、C03 利尿劑）；一碼太粗，一個群幾百筆。
  function facets() {
    if (drugFacets) return drugFacets;
    const atc = new Map(), routes = new Map(), forms = new Map();
    const bump = (map, key) => { if (key) map.set(key, (map.get(key) || 0) + 1); };
    medications().forEach(entry => {
      const code = String(entry.atc || '').trim().toUpperCase();
      bump(atc, code.length >= 3 ? code.slice(0, 3) : '');
      bump(routes, String(entry.routeId || '').trim());
      bump(forms, String(entry.unit || '').trim());
    });
    const sortByCount = map => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    drugFacets = {
      atc: [...atc.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, total]) => ({code, total, major: code[0], majorLabel: atcMajor[code[0]] || 'ATC level 1 not labeled by source'})),
      routes: sortByCount(routes).map(([id, total]) => ({id, total, entry: catalog.entries.find(e => e.kind === 'route' && String(e.id) === id) || null})),
      forms: sortByCount(forms).map(([name, total]) => ({name, total}))
    };
    return drugFacets;
  }
  // 一筆藥品是否通過三個篩選；每個篩選都是「all＝不篩」。
  function matchesDrugFilter(entry, filter) {
    if (!filter) return true;
    const atc = String(entry.atc || '').trim().toUpperCase();
    if (filter.atc && filter.atc !== 'all' && !atc.startsWith(filter.atc)) return false;
    if (filter.route && filter.route !== 'all' && String(entry.routeId || '') !== filter.route) return false;
    if (filter.form && filter.form !== 'all' && String(entry.unit || '') !== filter.form) return false;
    return true;
  }

  root.ICUOrderTaxonomy = {
    categories, setCategory, categoryIds, labelOf,
    categoryOfEntry, categoryOfOrder, groupsFor, isDiagnostic, LEGACY,
    departments, favouriteKeys, isFavourite,
    frequencies, CUSTOM_FREQUENCY, atcMajor, facets, matchesDrugFilter,
    bindState, isOrderable, displayName, sortOrderOf, extOf,
    defaultCategory: 'medication'
  };
  if (typeof module !== 'undefined') module.exports = root.ICUOrderTaxonomy;
})(globalThis);
