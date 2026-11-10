/* EMR整合MDT demo：英文腫瘤病房示範資料集（2026-11-10，P1）。
   取代 Smart Ward 原型 store.js 的兒科 ICU 種子（store.seed() 看到 root.ICUDemoSeed 就改用這裡的 state()）。
   全部虛構：病人、人員、數值、報告文字都是示範用，不是任何醫院的資料，也不是用藥建議。
   人名照 demo規劃建議_v0.2 第 3 節；時間線照 46 張行銷畫面的 Hoa／A06 正典（11-02 入院 → 11-04 14:00 乳癌團隊會議 → 11-05 採納開單 → 11-06 開始治療）。
   示範時鐘 2026-11-04（週三）09:40。
   載入順序：catalog.js 之後、clinical.js 之前（只用 root.ICUCatalog 取目錄快照，不依賴其他模組）。 */
(function (root) {
  'use strict';
  const CLOCK = '2026-11-04T09:40:00+07:00';
  const cat = () => root.ICUCatalog;
  const snap = key => { const c = cat(); const e = c.entries.find(x => x.key === key); return e ? {...e, catalogVersion: c.version, sourceSHA256: (c.sources[e.source] || {}).sha256} : null; };
  const icd = code => { const e = snap('icd:' + code); return e ? {key: e.key, code: e.code, english: e.english, name: e.name, source: e.source} : {key: 'icd:' + code, code, english: code, name: code, source: 'demo'}; };
  const copy = x => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- 病人 ----
  // flags：ISO 保護隔離、DNR、FALL 跌倒高風險、LINE 中央靜脈導管／人工血管、VENT、RESTRICT（store 初始化時會搬成 patientFlags）。
  const PATIENTS = [
    {id: 'P01', name: 'Walter Hughes', birthDate: '1965-03-18', gender: 'male', bed: 'A01', mrn: '26-101233', enc: 'N26110100371', admitted: '2026-11-01', admissionTime: '2026-11-01T10:20', entry: '2026-11-01T11:05',
      icd: 'C34.1', secondary: ['I10'], problem: 'Right upper lobe lung adenocarcinoma, cT3N2M0 stage IIIB · chemotherapy cycle 2, day 3', flags: [], attending: 'grant', primaryNurse: 'fletcher'},
    {id: 'P02', name: 'Claire Bennett', birthDate: '1979-02-18', gender: 'female', bed: 'A02', mrn: '26-103920', enc: 'N26110100377', admitted: '2026-11-01', admissionTime: '2026-11-01T14:00', entry: '2026-11-01T14:40', surgeryDate: '2026-11-02',
      icd: 'C50.9', secondary: [], problem: 'Left breast invasive ductal carcinoma · post-op day 2 after modified radical mastectomy (11-02) · final histology pending', flags: [], attending: 'grant', primaryNurse: 'fletcher', surgeon: 'ashford'},
    {id: 'P03', name: 'Margaret Ellis', birthDate: '1974-03-12', gender: 'female', bed: 'A03', mrn: '26-104512', enc: 'N26110200418', admitted: '2026-11-02', admissionTime: '2026-11-02T09:30', entry: '2026-11-02T10:15',
      icd: 'C50.4', secondary: ['I10', 'Z80.3'], problem: 'Right breast invasive ductal carcinoma, cT2N1M0 stage IIB, ER 90% / PR 60% / HER2 1+ / Ki-67 30% · treatment planning · breast cancer MDT 11-04 14:00', flags: [], attending: 'mercer', primaryNurse: 'carter',
      allergy: {text: 'Iodinated contrast medium (iohexol)', ingredient: 'Iohexol', manifestation: 'Mild rash after CT on 2026-10-27', severity: 'mild', criticality: 'low'},
      demographics: {ethnicity: null, nationality: 'Demo country', occupation: 'Secondary school teacher', address: '12 Elm Street, Demo City', telecom: '000 000 0103 (demo)'},
      related: [{name: 'Robert Ellis', relationship: 'Spouse', telecom: '000 000 0104 (demo)', occupation: 'Engineer', educationLevel: null}]},
    {id: 'P04', name: 'Raymond Foster', birthDate: '1968-07-30', gender: 'male', bed: 'A04', mrn: '26-100544', enc: 'N26110200391', admitted: '2026-11-02', admissionTime: '2026-11-02T08:10', entry: '2026-11-02T08:50',
      icd: 'C22.0', secondary: ['B18.1'], problem: 'Hepatocellular carcinoma, BCLC stage B · day 1 after transarterial chemoembolisation (11-03)', flags: [], attending: 'grant', primaryNurse: 'fletcher'},
    {id: 'P05', name: 'Dorothy Palmer', birthDate: '1960-01-22', gender: 'female', bed: 'A05', mrn: '26-097310', enc: 'N26103100355', admitted: '2026-10-31', admissionTime: '2026-10-31T11:00', entry: '2026-10-31T11:45',
      icd: 'C50.3', secondary: ['G62.0'], problem: 'Left breast invasive lobular carcinoma, cT2N0M0 stage IIA · docetaxel cycle 3 · peripheral neuropathy grade 3 · high fall risk', flags: ['FALL'], attending: 'mercer', primaryNurse: 'carter'},
    {id: 'P06', name: 'Harold Whitmore', birthDate: '1956-04-09', gender: 'male', bed: 'A06', mrn: '26-099102', enc: 'N26110200409', admitted: '2026-11-02', admissionTime: '2026-11-02T09:50', entry: '2026-11-02T10:30',
      icd: 'C18.7', secondary: ['E11.9', 'R63.4', 'G62.0', 'Z95.828'], problem: 'Sigmoid colon adenocarcinoma, post-op pT3N1b · adjuvant FOLFOX cycle 4 (11-03) · 9.6% weight loss in 2 months · oxaliplatin neuropathy grade 2, high fall risk', flags: ['FALL', 'LINE'], attending: 'mercer', primaryNurse: 'fletcher',
      demographics: {ethnicity: null, nationality: 'Demo country', occupation: 'Retired bus driver', address: '48 Harbour Road, Demo City', telecom: '000 000 0106 (demo)'},
      related: [{name: 'Edith Whitmore', relationship: 'Spouse (68, knee osteoarthritis)', telecom: '000 000 0107 (demo)', occupation: 'Retired', educationLevel: null}, {name: 'Thomas Whitmore', relationship: 'Son (works out of town)', telecom: '000 000 0108 (demo)', occupation: 'Technician', educationLevel: null}]},
    {id: 'P07', name: 'Sophie Harland', birthDate: '1988-05-02', gender: 'female', bed: 'A07', mrn: '26-102877', enc: 'N26110300426', admitted: '2026-11-03', admissionTime: '2026-11-03T08:40', entry: '2026-11-03T09:20',
      icd: 'C50.9', secondary: ['Z95.828'], problem: 'Left breast invasive ductal carcinoma, cT3N1M0 stage IIIA, HER2-positive · response evaluation after 4 cycles of neoadjuvant chemotherapy', flags: ['LINE'], attending: 'mercer', primaryNurse: 'carter'},
    {id: 'P08', name: 'Rachel Dawson', birthDate: '1982-07-21', gender: 'female', bed: 'A08', mrn: '26-098771', enc: 'N26110300431', admitted: '2026-11-03', admissionTime: '2026-11-03T10:00', entry: '2026-11-03T10:35',
      icd: 'C50.9', secondary: ['Z95.828'], problem: 'Right breast invasive ductal carcinoma grade 3, cT2N1M0 stage IIB · neoadjuvant AC cycle 1, day 1 (11-04)', flags: ['LINE'], attending: 'mercer', primaryNurse: 'carter'},
    {id: 'P09', name: 'George Pritchard', birthDate: '1961-09-14', gender: 'male', bed: 'A09', mrn: '26-095488', enc: 'N26102800312', admitted: '2026-10-28', admissionTime: '2026-10-28T16:30', entry: '2026-10-28T17:10',
      icd: 'C34.9', secondary: ['C79.5', 'Z66', 'Z51.5'], problem: 'Squamous cell lung cancer, stage IV with bone metastases · immunotherapy · pain control · do-not-resuscitate order recorded', flags: ['DNR'], attending: 'grant', primaryNurse: 'fletcher'},
    {id: 'P10', name: 'Helen Barlow', birthDate: '1975-06-05', gender: 'female', bed: 'A10', mrn: '26-104001', enc: 'N26110300440', admitted: '2026-11-03', admissionTime: '2026-11-03T15:00', entry: '2026-11-03T15:30',
      icd: 'C50.2', secondary: [], problem: 'Right breast invasive ductal carcinoma, cT1cN0M0 stage IA · breast-conserving surgery with sentinel node biopsy scheduled 11-05', flags: [], attending: 'mercer', primaryNurse: 'carter', surgeon: 'ashford'},
    {id: 'P11', name: 'Peter Linton', birthDate: '1971-11-11', gender: 'male', bed: 'A11', mrn: '26-098004', enc: 'N26103000338', admitted: '2026-10-30', admissionTime: '2026-10-30T09:00', entry: '2026-10-30T09:40',
      icd: 'C15.3', secondary: ['E46'], problem: 'Oesophageal squamous cell carcinoma, stage III · concurrent chemoradiotherapy week 3 · nasogastric feeding · malnutrition', flags: [], attending: 'grant', primaryNurse: 'fletcher'},
    {id: 'P12', name: 'Judith Carver', birthDate: '1967-05-02', gender: 'female', bed: 'A12', mrn: '26-096655', enc: 'N26110200402', admitted: '2026-11-02', admissionTime: '2026-11-02T13:20', entry: '2026-11-02T14:00',
      icd: 'C50.8', secondary: ['D70.1', 'Z90.1'], problem: 'Left breast invasive ductal carcinoma, post-op pT2N2a stage IIIA · febrile neutropenia after adjuvant chemotherapy · protective isolation', flags: ['ISO'], attending: 'mercer', primaryNurse: 'fletcher'}
  ];
  const ALL = PATIENTS.map(p => p.id);

  function buildPatient(x) {
    const main = icd(x.icd);
    const conditions = [{id: 'DX-' + x.id, code: {...main, kind: 'icd', active: true}, category: 'encounter-diagnosis', clinicalStatus: 'active', verificationStatus: 'confirmed', onset: x.admitted, recordedDate: x.admitted, recorder: x.attending, source: 'Demo data (fictional)'}]
      .concat((x.secondary || []).map((c, i) => ({id: 'DX-' + x.id + '-' + (i + 2), code: {...icd(c), kind: 'icd', active: true}, category: 'encounter-diagnosis', rank: 'secondary', clinicalStatus: 'active', verificationStatus: 'confirmed', onset: x.admitted, recordedDate: x.admitted, recorder: x.attending, source: 'Demo data (fictional)'})));
    const allergies = x.allergy ? [{id: 'ALG-' + x.id, substanceKind: 'ingredient', code: {text: x.allergy.text}, ingredient: x.allergy.ingredient, drugClass: '', type: 'allergy', category: 'medication', criticality: x.allergy.criticality || 'low',
      clinicalStatus: 'active', verificationStatus: 'confirmed', reaction: {manifestation: x.allergy.manifestation, severity: x.allergy.severity}, recordedDate: x.admitted, recorder: x.attending, source: 'Demo data (fictional)'}] : [];
    const allergyStatus = allergies.length ? 'recorded' : 'none-known';
    return {id: x.id, name: x.name, birthDate: x.birthDate, gender: x.gender, ward: 'A', bed: x.bed, visitNo: x.enc, identifier: x.mrn, admitted: x.admitted, admissionTime: x.admissionTime, admittedAt: x.entry,
      departmentEntryTime: x.entry, icuEntryTime: x.entry, department: 'Oncology', attending: '', surgeryDate: x.surgeryDate || null, icd: main, problem: x.problem, flags: [...x.flags],
      encounter: 'ENC-' + x.id, episode: 'ONC-' + x.id, admitSource: x.id === 'P12' ? 'emd' : 'outp', entryPoint: x.id === 'P12' ? 'EMERGENCY' : 'OUTPATIENT', admissionCountForCondition: 1, archiveId: 'DEMO-ARC-' + x.id,
      demographics: x.demographics || null, relatedPersons: x.related || [], allergies, allergyStatus, allergyConfirmedBy: allergies.length ? null : x.attending, allergyConfirmedAt: allergies.length ? null : x.admissionTime,
      conditions, allergy: allergies.length ? allergies.map(a => a.code.text + ' (' + a.reaction.manifestation + ')').join(', ') : 'No known allergies (confirmed by the care team)'};
  }

  // ----------------------------------------------------------- 照護關係 ----
  function relationships() {
    const rows = [];
    PATIENTS.forEach(x => {
      rows.push({p: x.id, actor: x.attending, role: 'attending', active: true, startedAt: x.entry, by: 'seed', via: 'AdmissionCreated'});
      rows.push({p: x.id, actor: 'brooks', role: 'care', active: true, startedAt: x.entry, by: 'seed', via: 'assign'});
      rows.push({p: x.id, actor: x.primaryNurse, role: 'primaryNurse', active: true, startedAt: x.entry, by: 'seed', via: 'receive'});
      rows.push({p: x.id, actor: 'shaw', role: 'nurse', active: true, startedAt: x.entry, by: 'seed', via: 'assign'});
      rows.push({p: x.id, actor: 'quinn', role: 'nurse', active: true, startedAt: x.entry, by: 'seed', via: 'assign'});
      if (x.surgeon) rows.push({p: x.id, actor: x.surgeon, role: 'surgeon', active: true, startedAt: x.entry, by: 'seed', via: 'assign'});
    });
    return rows;
  }

  // ----------------------------------------------------------- 量測 ----
  const obs = [];
  let obsSeq = 0;
  const nurseAt = at => { const h = Number(at.slice(11, 13)); return h >= 7 && h < 15 ? null : h >= 15 && h < 23 ? 'shaw' : 'quinn'; };
  function vitals(p, rows, dayNurse) {
    rows.forEach(([at, T, P, R, SBP, DBP, SpO2]) => {
      const actor = nurseAt(at) || dayNurse;
      [['Temperature', T, '°C'], ['Heart rate', P, '/min'], ['Respiratory rate', R, '/min'], ['SpO₂', SpO2, '%']].forEach(([kind, value, unit]) => {
        if (value === null || value === undefined) return;
        obs.push({id: 'OBS-' + p + '-' + (++obsSeq), p, kind, value, unit, at, actor, source: 'Demo observation (fictional)'});
      });
      if (SBP) obs.push({id: 'OBS-' + p + '-' + (++obsSeq), p, kind: 'Blood pressure', value: null, unit: 'mmHg', at, actor, source: 'Demo observation (fictional)', components: [{definition: 'TDL.0094', value: SBP}, {definition: 'TDL.0095', value: DBP}]});
    });
  }
  function measure(p, kind, value, unit, at, actor, source) { obs.push({id: 'OBS-' + p + '-' + (++obsSeq), p, kind, value, unit, at, actor: actor || null, source: source || 'Demo observation (fictional)'}); }

  // Margaret Ellis：11-02 08:00 起每 6 小時，9 個時間點（照 46 張畫面的 VITALS 結構）
  vitals('P03', [
    ['2026-11-02T08:00', 36.6, 82, 17, 138, 84, 98], ['2026-11-02T14:00', 36.8, 84, 18, 142, 86, 98], ['2026-11-02T20:00', 36.9, 80, 16, 136, 82, 98],
    ['2026-11-03T02:00', 36.5, 76, 16, 128, 78, 97], ['2026-11-03T08:00', 36.6, 78, 16, 132, 80, 98], ['2026-11-03T14:00', 36.8, 82, 17, 138, 84, 98],
    ['2026-11-03T20:00', 36.9, 80, 17, 134, 82, 97], ['2026-11-04T02:00', 36.5, 74, 16, 126, 76, 98], ['2026-11-04T08:00', 36.7, 80, 17, 130, 80, 98]], 'carter');
  measure('P03', 'Height', 158, 'cm', '2026-11-02T08:00', 'carter');
  measure('P03', 'Weight', 58.6, 'kg', '2026-11-02T08:00', 'carter');
  measure('P03', 'Weight', 58.4, 'kg', '2026-11-04T08:00', 'carter');
  // Harold Whitmore：體重趨勢（門診兩筆＋入院），每日生命徵象
  measure('P06', 'Weight', 57.5, 'kg', '2026-09-03T10:00', null, 'Clinic visit (demo)');
  measure('P06', 'Weight', 54.1, 'kg', '2026-10-10T10:00', null, 'Clinic visit (demo)');
  measure('P06', 'Height', 165, 'cm', '2026-11-02T10:30', 'fletcher');
  measure('P06', 'Weight', 52.0, 'kg', '2026-11-02T10:30', 'fletcher');
  vitals('P06', [['2026-11-02T14:00', 36.7, 88, 18, 124, 76, 97], ['2026-11-03T08:00', 36.5, 86, 18, 118, 72, 97], ['2026-11-03T20:00', 37.0, 92, 18, 116, 70, 96], ['2026-11-04T08:00', 36.6, 90, 18, 120, 74, 97]], 'fletcher');
  // 其餘病人：入院後每日一筆（今天 08:00 必有），數值依情境
  const DAILY = {
    P01: [['2026-11-02T08:00', 36.8, 88, 18, 130, 80, 95], ['2026-11-03T08:00', 37.1, 92, 20, 128, 78, 94], ['2026-11-04T08:00', 36.9, 90, 19, 132, 80, 95]],
    P02: [['2026-11-02T14:00', 36.9, 94, 18, 118, 72, 97], ['2026-11-03T08:00', 37.3, 90, 18, 122, 76, 98], ['2026-11-04T08:00', 36.8, 84, 16, 124, 78, 98]],
    P04: [['2026-11-03T14:00', 37.6, 96, 18, 134, 84, 97], ['2026-11-04T08:00', 37.4, 92, 18, 130, 82, 97]],
    P05: [['2026-11-03T08:00', 36.6, 78, 16, 146, 88, 98], ['2026-11-04T08:00', 36.7, 80, 16, 142, 86, 98]],
    P07: [['2026-11-03T14:00', 36.6, 76, 16, 112, 70, 99], ['2026-11-04T08:00', 36.5, 74, 16, 114, 72, 99]],
    P08: [['2026-11-03T14:00', 36.7, 80, 16, 120, 76, 99], ['2026-11-04T08:00', 36.6, 82, 16, 118, 74, 99], ['2026-11-04T09:30', 36.7, 86, 17, 122, 76, 98]],
    P09: [['2026-11-03T08:00', 36.9, 96, 22, 110, 68, 93], ['2026-11-04T08:00', 37.0, 98, 22, 108, 66, 92]],
    P10: [['2026-11-03T16:00', 36.5, 72, 16, 126, 80, 99], ['2026-11-04T08:00', 36.4, 70, 16, 124, 78, 99]],
    P11: [['2026-11-03T08:00', 36.8, 90, 18, 116, 72, 96], ['2026-11-04T08:00', 36.9, 92, 18, 114, 70, 96]],
    P12: [['2026-11-02T14:00', 38.6, 108, 22, 104, 62, 96], ['2026-11-03T08:00', 38.1, 102, 20, 108, 66, 97], ['2026-11-03T20:00', 37.6, 96, 18, 110, 68, 97], ['2026-11-04T08:00', 37.2, 90, 18, 114, 72, 98]]
  };
  const DAY_NURSE = {P01: 'fletcher', P02: 'fletcher', P04: 'fletcher', P05: 'carter', P07: 'carter', P08: 'carter', P09: 'fletcher', P10: 'carter', P11: 'fletcher', P12: 'fletcher'};
  Object.entries(DAILY).forEach(([p, rows]) => vitals(p, rows, DAY_NURSE[p]));
  [['P01', 68.5, 172], ['P02', 60.2, 160], ['P04', 71.0, 170], ['P05', 63.8, 157], ['P07', 55.0, 163], ['P08', 62.0, 160], ['P09', 58.4, 174], ['P10', 57.2, 161], ['P11', 59.8, 170], ['P12', 55.0, 156]].forEach(([p, w, h]) => {
    const x = PATIENTS.find(q => q.id === p); measure(p, 'Weight', w, 'kg', x.entry, DAY_NURSE[p]); measure(p, 'Height', h, 'cm', x.entry, DAY_NURSE[p]);
  });
  measure('P11', 'Weight', 61.0, 'kg', '2026-10-30T09:40', 'fletcher');

  // ----------------------------------------------------------- 報告 ----
  const rangeOf = ref => { const t = String(ref || ''), lt = t.match(/^\s*<\s*([\d.]+)/); if (lt) return {high: Number(lt[1]), strict: true}; const all = [...t.matchAll(/([\d.]+)\s*-\s*([\d.]+)/g)]; return all.length ? {low: Math.min(...all.map(m => Number(m[1]))), high: Math.max(...all.map(m => Number(m[2])))} : null; };
  const flagOf = (value, ref) => { const v = Number(value), r = rangeOf(ref); if (value === null || value === undefined || value === '' || !Number.isFinite(v) || !r) return null; if (r.strict ? v >= r.high : v > r.high) return 'H'; return r.low !== undefined && v < r.low ? 'L' : 'N'; };
  // 子項 id 只留分析物代碼（DEMO-WBC），同一分析物在不同日期的報告才會在檢驗矩陣排成同一列。
  const comp = (id, name, unit, value, reference, category, specimen) => ({id: 'DEMO-' + String(id).split('-').pop(), name, unit, value, reference, category: category || 'Biochemistry', specimen: specimen || 'Hematology', interpretation: flagOf(value, reference), interpretationSource: 'Demo laboratory flag (fictional)', mapping: 'Demo mapping'});
  const reports = [];
  function lab(id, p, key, at, comps, extra) { reports.push({id, p, kind: 'Lab', status: 'returned', version: 1, text: null, at, collectedAt: extra && extra.collectedAt || at.slice(0, 11) + '06:00', seen: [], processed: [], catalog: snap(key), components: comps, sourceFlags: 2, order: (extra && extra.order) || null, source: 'Demo laboratory result (fictional)', ...(extra || {})}); }
  function exam(id, p, key, examType, at, text, impression, reporter, extra) { reports.push({id, p, kind: 'Exam', examType, status: 'returned', version: 1, at, collectedAt: (extra && extra.collectedAt) || at, seen: [], processed: [], catalog: {...snap(key)}, components: [], text, impression, reporter, order: (extra && extra.order) || null, source: 'Demo report (fictional); text only, no image integration', ...(extra || {})}); }
  function pending(id, p, key, examType, order, note) { reports.push({id, p, kind: examType ? 'Exam' : 'Lab', examType: examType || undefined, status: 'pending', version: 1, at: null, collectedAt: null, seen: [], processed: [], catalog: {...snap(key)}, components: [], text: null, order: order || null, source: 'Demo pending report (fictional)', note: note || null}); }
  const CBC = (id, p, at, wbc, anc, hb, plt, extra) => lab(id, p, 'service:L001', at, [comp(id + '-WBC', 'White blood cells', '10^9/L', wbc, '4.0 - 10.0', 'Hematology'), comp(id + '-ANC', 'Neutrophils (absolute)', '10^9/L', anc, '1.5 - 7.0', 'Hematology'), comp(id + '-HB', 'Haemoglobin', 'g/dL', hb, 'F: 12.0-16.0, M: 13.5-17.5', 'Hematology'), comp(id + '-PLT', 'Platelets', '10^9/L', plt, '150 - 400', 'Hematology')], extra);
  const LFT = (id, p, at, ast, alt, alp, bili) => lab(id, p, 'service:L003', at, [comp(id + '-AST', 'AST', 'U/L', ast, '10 - 40'), comp(id + '-ALT', 'ALT', 'U/L', alt, '7 - 56'), comp(id + '-ALP', 'Alkaline phosphatase', 'U/L', alp, '40 - 130'), comp(id + '-TBIL', 'Total bilirubin', 'mg/dL', bili, '0.2 - 1.2')]);
  const RFT = (id, p, at, cr, egfr, urea) => lab(id, p, 'service:L004', at, [comp(id + '-CR', 'Creatinine', 'mg/dL', cr, 'M: 0.7-1.3, F: 0.6-1.1'), comp(id + '-EGFR', 'eGFR (CKD-EPI)', 'mL/min/1.73m²', egfr, '90 - 150'), comp(id + '-UREA', 'Urea', 'mmol/L', urea, '2.5 - 7.1')]);
  const ELEC = (id, p, at, na, k, cl) => lab(id, p, 'service:L005', at, [comp(id + '-NA', 'Sodium', 'mmol/L', na, '136 - 145'), comp(id + '-K', 'Potassium', 'mmol/L', k, '3.5 - 5.1'), comp(id + '-CL', 'Chloride', 'mmol/L', cl, '98 - 107')]);
  const GLU = (id, p, at, v) => lab(id, p, 'service:L008', at, [comp(id + '-GLU', 'Glucose, fasting', 'mmol/L', v, '3.9 - 5.6')]);
  const ALB = (id, p, at, v) => lab(id, p, 'service:L007', at, [comp(id + '-ALB', 'Albumin', 'g/L', v, '35 - 50')]);
  const CRP = (id, p, at, v) => lab(id, p, 'service:L013', at, [comp(id + '-CRP', 'C-reactive protein', 'mg/L', v, '< 5')]);
  const CA153 = (id, p, at, v) => lab(id, p, 'service:L020', at, [comp(id + '-CA153', 'CA 15-3', 'U/mL', v, '< 30')]);
  const CEA = (id, p, at, v) => lab(id, p, 'service:L021', at, [comp(id + '-CEA', 'CEA', 'ng/mL', v, '< 3.0')]);
  const COAG = (id, p, at, inr, aptt) => lab(id, p, 'service:L002', at, [comp(id + '-INR', 'INR', '', inr, '0.8 - 1.2', 'Hematology'), comp(id + '-APTT', 'APTT', 's', aptt, '25 - 37', 'Hematology')]);

  // Margaret Ellis：四個抽血日（10-14 門診、10-27 CT 前、11-02 入院、11-03 化療前基準）
  [['10-14', '2026-10-14T09:00', [6.4, 3.8, 12.9, 242], [22, 19, 78, 0.5], [0.72, 94, 4.6], [139, 4.0, 103], 5.4, 38, 2.0],
   ['10-27', '2026-10-27T08:30', [6.0, 3.5, 12.6, 236], [23, 20, 80, 0.6], [0.70, 96, 4.4], [138, 4.1, 104], 5.6, null, null],
   ['11-02', '2026-11-02T11:00', [6.1, 3.5, 12.7, 240], [24, 21, 82, 0.6], [0.71, 95, 4.5], [138, 4.1, 103], 5.8, 41, 2.1],
   ['11-03', '2026-11-03T07:10', [6.2, 3.6, 12.8, 238], [24, 21, 81, 0.6], [0.70, 95, 4.5], [139, 4.0, 104], 5.7, null, null]].forEach(([tag, at, cbc, lft, rft, elec, glu, ca, cea]) => {
    const id = 'R-P03-' + tag.replace('-', '');
    CBC(id + '-CBC', 'P03', at, ...cbc, tag === '11-03' ? {order: 'O-P03-LABPRE'} : undefined); LFT(id + '-LFT', 'P03', at, ...lft); RFT(id + '-RFT', 'P03', at, ...rft); ELEC(id + '-ELEC', 'P03', at, ...elec); GLU(id + '-GLU', 'P03', at, glu);
    if (ca !== null) CA153(id + '-CA153', 'P03', at, ca);
    if (cea !== null) CEA(id + '-CEA', 'P03', at, cea);
  });
  exam('R-P03-MAMMO', 'P03', 'service:X002', 'Mammography', '2026-10-14T11:30', 'Bilateral digital mammography. Right breast: 3.2 cm spiculated mass in the upper-outer quadrant with associated pleomorphic microcalcifications. Left breast: no suspicious finding. Breast density category C.', 'Right upper-outer quadrant mass, BI-RADS 4C. Tissue diagnosis recommended.', 'Dr. Samuel Price (Diagnostic Imaging)');
  exam('R-P03-US', 'P03', 'service:X003', 'Ultrasound', '2026-10-14T12:10', 'Right breast: hypoechoic irregular mass 3.2 × 2.4 cm at 10 o\'clock, 4 cm from the nipple, with posterior shadowing. Right axilla: one lymph node with cortical thickening 5 mm, fatty hilum preserved. Left breast and axilla unremarkable.', 'Right breast mass 3.2 cm, BI-RADS 4C; one indeterminate right axillary node. Core biopsy and axillary FNA recommended.', 'Dr. Samuel Price (Diagnostic Imaging)');
  exam('R-P03-CNB', 'P03', 'service:L050', 'Pathology report', '2026-10-22T16:20', 'Right breast, 10 o\'clock, ultrasound-guided core needle biopsy (14G ×4), biopsy date 2026-10-17.\nHistological type: invasive ductal carcinoma, no special type (NST).\nGrade: Nottingham grade 2 (score 6/9: tubules 3, nuclear pleomorphism 2, mitoses 1).\nLymphovascular invasion: not identified in the cores.\nIn-situ component: DCIS, intermediate grade, approximately 10%.', 'Invasive ductal carcinoma (NST), grade 2. See immunohistochemistry panel.', 'Dr. Caroline Webb (Pathology)', {collectedAt: '2026-10-17T10:30', structured: {histology: 'Invasive ductal carcinoma (NST)', grade: 'Grade 2 (Nottingham 6/9)', lvi: 'Not identified', dcis: 'Intermediate grade, ~10%'}});
  exam('R-P03-IHC', 'P03', 'service:L051', 'Pathology report', '2026-10-22T16:40', 'Immunohistochemistry on core biopsy (2026-10-17).\nOestrogen receptor: positive, 90% of tumour nuclei, strong intensity (Allred 8/8).\nProgesterone receptor: positive, 60%, moderate intensity (Allred 6/8).\nHER2: score 1+ (negative); ISH not indicated.\nKi-67 proliferation index: 30%.', 'ER-positive, PR-positive, HER2-negative, Ki-67 30% — luminal B-like (HER2-negative).', 'Dr. Caroline Webb (Pathology)', {collectedAt: '2026-10-17T10:30', structured: {er: '90% (Allred 8/8)', pr: '60% (Allred 6/8)', her2: 'IHC 1+ (negative)', ki67: '30%', subtype: 'Luminal B-like (HER2-negative)'}});
  exam('R-P03-CT', 'P03', 'service:X007', 'CT', '2026-10-28T15:40', 'CT chest, abdomen and pelvis with intravenous contrast (2026-10-27). Right breast mass 3.2 cm as known. Right axillary lymph node 1.1 cm short axis. No supraclavicular or internal mammary adenopathy. Lungs: no nodules. Liver: 0.6 cm simple cyst segment VI, no suspicious lesion. Adrenals, bones: no metastasis. Note: mild skin rash after contrast administration, recorded as contrast allergy.', 'No evidence of distant metastasis (M0). Right axillary node 1.1 cm, suspicious.', 'Dr. Samuel Price (Diagnostic Imaging)', {collectedAt: '2026-10-27T14:30'});
  exam('R-P03-BONE', 'P03', 'service:X012', 'Nuclear medicine', '2026-10-30T13:00', 'Whole-body bone scan (Tc-99m MDP). Physiological tracer distribution. Mild degenerative uptake at L4–L5 facet joints. No focal lesion suspicious for metastasis.', 'No scintigraphic evidence of bone metastasis.', 'Dr. Nathan Cole (Nuclear Medicine)');
  exam('R-P03-ECG', 'P03', 'service:X015', 'ECG', '2026-11-02T11:20', '12-lead ECG: sinus rhythm 80/min, normal axis, PR 160 ms, QRS 88 ms, QTc 420 ms. No ST-T change.', 'Normal ECG.', 'Dr. Daniel Mercer');
  pending('R-P03-ECHO', 'P03', 'service:X014', 'Echocardiography', 'O-P03-ECHO', 'Scheduled 2026-11-05 08:30 (Cardiology echo lab). Required before anthracycline chemotherapy.');
  // Harold Whitmore
  CBC('R-P06-1102-CBC', 'P06', '2026-11-02T11:30', 4.8, 2.6, 11.2, 198);
  LFT('R-P06-1102-LFT', 'P06', '2026-11-02T11:30', 30, 28, 96, 0.7);
  RFT('R-P06-1102-RFT', 'P06', '2026-11-02T11:30', 1.0, 78, 6.0);
  ELEC('R-P06-1102-ELEC', 'P06', '2026-11-02T11:30', 136, 3.6, 101);
  ALB('R-P06-1102-ALB', 'P06', '2026-11-02T11:30', 32);
  GLU('R-P06-1102-GLU', 'P06', '2026-11-02T11:30', 9.8);
  CEA('R-P06-1102-CEA', 'P06', '2026-11-02T11:30', 4.8);
  lab('R-P06-1103-POC', 'P06', 'service:L009', '2026-11-03T17:30', [comp('R-P06-1103-POC-1', 'Capillary glucose (pre-dinner)', 'mmol/L', 14.2, '3.9 - 7.8')], {collectedAt: '2026-11-03T17:25'});
  lab('R-P06-1104-POC', 'P06', 'service:L009', '2026-11-04T07:00', [comp('R-P06-1104-POC-1', 'Capillary glucose (fasting)', 'mmol/L', 10.4, '3.9 - 7.8')], {collectedAt: '2026-11-04T06:55'});
  // Rachel Dawson
  CBC('R-P08-1104-CBC', 'P08', '2026-11-04T07:00', 5.9, 3.2, 12.4, 230);
  LFT('R-P08-1104-LFT', 'P08', '2026-11-04T07:00', 20, 18, 70, 0.5);
  RFT('R-P08-1104-RFT', 'P08', '2026-11-04T07:00', 0.68, 102, 4.0);
  exam('R-P08-ECHO', 'P08', 'service:X014', 'Echocardiography', '2026-11-01T10:40', 'Transthoracic echocardiography. Normal LV size and wall thickness; LVEF 62% (biplane Simpson). No regional wall motion abnormality. Valves structurally normal. No pericardial effusion.', 'Normal study; LVEF 62%. Suitable for anthracycline chemotherapy.', 'Dr. Fiona Marsh (Cardiology)');
  // Judith Carver
  CBC('R-P12-1102-CBC', 'P12', '2026-11-02T14:40', 1.9, 0.8, 10.6, 142);
  CRP('R-P12-1102-CRP', 'P12', '2026-11-02T14:40', 86);
  CBC('R-P12-1104-CBC', 'P12', '2026-11-04T07:00', 2.6, 1.1, 10.4, 150);
  CRP('R-P12-1104-CRP', 'P12', '2026-11-04T07:00', 41);
  reports.push({id: 'R-P12-BCULT', p: 'P12', kind: 'Lab', status: 'returned', version: 1, at: '2026-11-04T08:30', collectedAt: '2026-11-02T14:30', seen: [], processed: [], catalog: snap('service:L030'), components: [], text: 'Blood culture ×2 (peripheral and port): no growth at 48 hours. Final report at 5 days.', sourceFlags: 2, order: 'O-P12-BCULT', source: 'Demo microbiology result (fictional)'});
  // Helen Barlow（術前）
  CBC('R-P10-1103-CBC', 'P10', '2026-11-03T16:30', 6.8, 4.0, 13.4, 262);
  COAG('R-P10-1103-COAG', 'P10', '2026-11-03T16:30', 1.0, 29);
  ELEC('R-P10-1103-ELEC', 'P10', '2026-11-03T16:30', 140, 4.2, 104);
  exam('R-P10-ECG', 'P10', 'service:X015', 'ECG', '2026-11-03T16:50', '12-lead ECG: sinus rhythm 70/min, normal intervals, no acute change.', 'Normal ECG.', 'Dr. Hannah Brooks');
  exam('R-P10-CXR', 'P10', 'service:X001', 'X-ray', '2026-11-03T17:20', 'Chest X-ray PA: clear lung fields, normal cardiac silhouette, no pleural effusion.', 'Normal chest X-ray.', 'Dr. Samuel Price (Diagnostic Imaging)');
  // Raymond Foster、Peter Linton
  LFT('R-P04-1104-LFT', 'P04', '2026-11-04T07:00', 86, 74, 142, 1.4);
  CBC('R-P04-1104-CBC', 'P04', '2026-11-04T07:00', 7.2, 4.8, 11.8, 168);
  ALB('R-P11-1103-ALB', 'P11', '2026-11-03T07:00', 29);
  ELEC('R-P11-1103-ELEC', 'P11', '2026-11-03T07:00', 137, 3.3, 100);
  CBC('R-P11-1103-CBC', 'P11', '2026-11-03T07:00', 3.4, 1.8, 10.2, 160);
  // Sophie Harland：評估檢查待回
  pending('R-P07-CT', 'P07', 'service:X007', 'CT', 'O-P07-CT', 'Scheduled 2026-11-04 13:00.');
  pending('R-P07-US', 'P07', 'service:X003', 'Ultrasound', 'O-P07-US', 'Scheduled 2026-11-04 11:00.');

  // ----------------------------------------------------------- 醫囑與執行 ----
  const orders = [], executions = [];
  const ROUTE = {oral: ['route:913', 'Oral'], iv: ['route:996316', 'Intravenous injection'], inf: ['route:912', 'Intravenous infusion'], pump: ['route:994086', 'Continuous infusion (pump)'], sc: ['route:1313', 'Subcutaneous injection'], tube: ['route:9104', 'Enteral tube']};
  function med(id, p, key, dose, route, frequency, start, author, extra) {
    const s = snap(key), r = ROUTE[route];
    orders.push({id, p, version: 1, name: s ? s.name : key, catalog: s, kind: 'medication', dose, route: r[1], routeCatalog: snap(r[0]), frequency, orderedAt: (extra && extra.orderedAt) || start, start, end: (extra && extra.end) || null,
      clinical: 'active', local: 'signed', his: 'accepted', occurrence: id + '-V1-D1', author, source: 'Demo order (fictional); not clinical advice', ...(extra || {})});
  }
  function svc(id, p, key, frequency, start, author, extra) {
    const s = snap(key);
    orders.push({id, p, version: 1, name: s ? s.name : key, catalog: s, kind: s ? s.kind : 'service', dose: '1 time', route: s && s.isLab ? 'Lab' : 'Department', frequency, orderedAt: (extra && extra.orderedAt) || start, start, end: (extra && extra.end) || null,
      clinical: 'active', local: 'signed', his: s && s.isLab ? 'accepted' : 'none', occurrence: id + '-V1-D1', author, source: 'Demo order (fictional)', ...(extra || {})});
  }
  function done(order, at, actor, actual, route, extra) { executions.push({id: 'E-' + order + '-' + at.slice(5, 16).replace(/[-T:]/g, ''), p: orders.find(o => o.id === order).p, order, version: 1, occurrence: order + '-V1-D1', at, recorded: at, actor, status: 'done', actual, route, reason: '', identityConfirmed: true, review: null, ...(extra || {})}); }

  // Margaret Ellis
  med('O-P03-AMLO', 'P03', 'medication:D090', '5 mg (1 tablet)', 'oral', 'QD (once daily)', '2026-11-02T10:30', 'mercer', {source: 'Home medication continued on admission (demo)'});
  svc('O-P03-ECHO', 'P03', 'service:X014', 'Once now', '2026-11-03T09:40', 'mercer', {source: 'Baseline LVEF before anthracycline chemotherapy (demo)'});
  svc('O-P03-LABPRE', 'P03', 'service:L001', 'Once now', '2026-11-03T06:30', 'mercer', {source: 'Pre-chemotherapy baseline labs (demo)'});
  svc('O-P03-PORT', 'P03', 'service:P001', 'Once pre-op', '2026-11-05T13:00', 'mercer', {orderedAt: '2026-11-04T09:20', source: 'Central venous port before vesicant chemotherapy (demo)'});
  done('O-P03-AMLO', '2026-11-03T08:10', 'carter', '5 mg (1 tablet)', 'Oral');
  done('O-P03-AMLO', '2026-11-04T08:05', 'carter', '5 mg (1 tablet)', 'Oral');
  // Harold Whitmore：FOLFOX 第 4 週期 D1（11-03），5-FU 幫浦到 11-05 10:30
  med('O-P06-OXALI', 'P06', 'medication:D010', '130 mg (85 mg/m² × 1.55 m²)', 'inf', 'Once now', '2026-11-03T10:00', 'mercer', {orderedAt: '2026-11-03T08:30', end: '2026-11-03T12:30', dosing: {mode: 'once', bsa: 1.55, perM2: 85}});
  med('O-P06-LEUCO', 'P06', 'medication:D014', '620 mg (400 mg/m²)', 'inf', 'Once now', '2026-11-03T10:00', 'mercer', {orderedAt: '2026-11-03T08:30', end: '2026-11-03T12:30'});
  med('O-P06-FUBOL', 'P06', 'medication:D012', '620 mg (400 mg/m²)', 'iv', 'Once now', '2026-11-03T12:15', 'mercer', {orderedAt: '2026-11-03T08:30', end: '2026-11-03T12:30'});
  med('O-P06-FUINF', 'P06', 'medication:D011', '3,720 mg (2,400 mg/m²) over 46 h', 'pump', 'Continuous infusion', '2026-11-03T12:30', 'mercer', {orderedAt: '2026-11-03T08:30', end: '2026-11-05T10:30', dosing: {mode: 'infusion', frequency: 'Continuous infusion', rate: 'Elastomeric pump 46 h'}});
  med('O-P06-ONDAN', 'P06', 'medication:D040', '8 mg (4 mL)', 'iv', 'Once pre-op', '2026-11-03T09:30', 'mercer', {orderedAt: '2026-11-03T08:30', end: '2026-11-03T10:00'});
  med('O-P06-DEXA', 'P06', 'medication:D045', '8 mg (2 mL)', 'iv', 'Once pre-op', '2026-11-03T09:30', 'mercer', {orderedAt: '2026-11-03T08:30', end: '2026-11-03T10:00'});
  med('O-P06-ONS', 'P06', 'medication:D064', '200 mL (1 bottle)', 'oral', 'BID (twice daily)', '2026-11-03T15:00', 'mercer', {orderedAt: '2026-11-03T15:00', source: 'Adopted from the dietitian consult reply RF-1103-01 (demo)', refSource: 'RF-1103-01'});
  med('O-P06-METF', 'P06', 'medication:D122', '500 mg (1 tablet)', 'oral', 'BID (twice daily)', '2026-11-02T12:00', 'mercer', {source: 'Home medication continued on admission (demo)'});
  svc('O-P06-POC', 'P06', 'service:L009', 'QID (4 times daily)', '2026-11-02T12:00', 'mercer');
  svc('O-P06-FALL', 'P06', 'service:P008', 'Continuous monitoring', '2026-11-02T11:00', 'mercer');
  svc('O-P06-PORTCARE', 'P06', 'service:P002', 'QW (once weekly)', '2026-11-03T09:00', 'mercer');
  svc('O-P06-PHYSIO', 'P06', 'service:P014', 'BID (twice daily)', '2026-11-04T10:00', 'mercer', {orderedAt: '2026-11-04T09:35', source: 'Adopted from the physiotherapy consult reply RF-1103-03 (demo)', refSource: 'RF-1103-03'});
  svc('O-P06-WALKER', 'P06', 'supply:S006', 'Once now', '2026-11-04T10:00', 'mercer', {orderedAt: '2026-11-04T09:35', source: 'Adopted from the physiotherapy consult reply RF-1103-03 (demo)', refSource: 'RF-1103-03'});
  done('O-P06-ONDAN', '2026-11-03T09:35', 'fletcher', '8 mg (4 mL)', 'Intravenous injection');
  done('O-P06-DEXA', '2026-11-03T09:36', 'fletcher', '8 mg (2 mL)', 'Intravenous injection');
  done('O-P06-OXALI', '2026-11-03T10:05', 'fletcher', '130 mg', 'Intravenous infusion', {witness: 'carter'});
  done('O-P06-LEUCO', '2026-11-03T10:05', 'fletcher', '620 mg', 'Intravenous infusion');
  done('O-P06-FUBOL', '2026-11-03T12:15', 'fletcher', '620 mg', 'Intravenous injection', {witness: 'carter'});
  done('O-P06-FUINF', '2026-11-03T12:30', 'fletcher', 'Pump connected, 3,720 mg over 46 h', 'Continuous infusion (pump)', {witness: 'carter'});
  done('O-P06-METF', '2026-11-04T08:00', 'fletcher', '500 mg (1 tablet)', 'Oral');
  done('O-P06-ONS', '2026-11-04T08:10', 'fletcher', '200 mL (1 bottle)', 'Oral');
  // Rachel Dawson：AC 第 1 週期 D1（11-04）
  med('O-P08-APREP', 'P08', 'medication:D043', '125 mg (1 capsule, day 1)', 'oral', 'Once pre-op', '2026-11-04T08:30', 'mercer', {orderedAt: '2026-11-03T16:00'});
  med('O-P08-ONDAN', 'P08', 'medication:D040', '8 mg (4 mL)', 'iv', 'Once pre-op', '2026-11-04T08:30', 'mercer', {orderedAt: '2026-11-03T16:00'});
  med('O-P08-DEXA', 'P08', 'medication:D045', '12 mg (3 mL)', 'iv', 'Once pre-op', '2026-11-04T08:30', 'mercer', {orderedAt: '2026-11-03T16:00'});
  med('O-P08-DOXO', 'P08', 'medication:D001', '100 mg (60 mg/m² × 1.66 m²)', 'inf', 'Once now', '2026-11-04T09:00', 'mercer', {orderedAt: '2026-11-03T16:00', dosing: {mode: 'once', bsa: 1.66, perM2: 60}, source: 'AC cycle 1 day 1 · breast cancer team regimen set (demo)'});
  med('O-P08-CYCLO', 'P08', 'medication:D003', '1,000 mg (600 mg/m² × 1.66 m²)', 'inf', 'Once now', '2026-11-04T09:20', 'mercer', {orderedAt: '2026-11-03T16:00', dosing: {mode: 'once', bsa: 1.66, perM2: 600}, source: 'AC cycle 1 day 1 · breast cancer team regimen set (demo)'});
  med('O-P08-ONDANPO', 'P08', 'medication:D041', '8 mg (1 tablet)', 'oral', 'BID (twice daily)', '2026-11-05T08:00', 'mercer', {orderedAt: '2026-11-03T16:00', end: '2026-11-07T20:00'});
  svc('O-P08-EXTRAV', 'P08', 'service:P013', 'Continuous monitoring', '2026-11-04T09:00', 'mercer', {orderedAt: '2026-11-03T16:00'});
  done('O-P08-APREP', '2026-11-04T08:30', 'carter', '125 mg (1 capsule)', 'Oral');
  done('O-P08-ONDAN', '2026-11-04T08:40', 'carter', '8 mg (4 mL)', 'Intravenous injection');
  done('O-P08-DEXA', '2026-11-04T08:41', 'carter', '12 mg (3 mL)', 'Intravenous injection');
  done('O-P08-DOXO', '2026-11-04T09:05', 'carter', '100 mg via port, slow push over 15 min; blood return confirmed', 'Intravenous infusion', {witness: 'fletcher'});
  // Judith Carver：發燒性嗜中性球低下
  med('O-P12-PIPTAZ', 'P12', 'medication:D101', '4.5 g', 'inf', 'Q8H (every 8 h)', '2026-11-02T15:00', 'mercer');
  med('O-P12-FILG', 'P12', 'medication:D060', '300 µg', 'sc', 'QD (once daily)', '2026-11-02T15:00', 'mercer');
  med('O-P12-PARA', 'P12', 'medication:D071', '1 g (100 mL)', 'inf', 'PRN (as needed)', '2026-11-02T15:00', 'mercer', {dosing: {mode: 'prn', prnIndication: 'Temperature ≥ 38.5 °C', prnInterval: '6 h', prnMax: '4 g/24 h'}});
  svc('O-P12-ISO', 'P12', 'service:P009', 'Continuous monitoring', '2026-11-02T14:30', 'mercer');
  svc('O-P12-BCULT', 'P12', 'service:L030', 'Once now', '2026-11-02T14:30', 'mercer');
  svc('O-P12-CBC', 'P12', 'service:L001', 'QD (once daily)', '2026-11-03T06:00', 'mercer');
  done('O-P12-PIPTAZ', '2026-11-03T14:00', 'fletcher', '4.5 g', 'Intravenous infusion');
  done('O-P12-PIPTAZ', '2026-11-03T22:00', 'shaw', '4.5 g', 'Intravenous infusion');
  done('O-P12-PIPTAZ', '2026-11-04T06:00', 'quinn', '4.5 g', 'Intravenous infusion');
  done('O-P12-FILG', '2026-11-04T08:30', 'fletcher', '300 µg', 'Subcutaneous injection');
  done('O-P12-PARA', '2026-11-02T15:20', 'shaw', '1 g (100 mL)', 'Intravenous infusion', {reason: 'Temperature 38.6 °C'});
  // Claire Bennett：術後 D2
  med('O-P02-PARA', 'P02', 'medication:D071', '1 g (100 mL)', 'inf', 'Q6H (every 6 h)', '2026-11-02T12:00', 'ashford', {end: '2026-11-05T12:00'});
  med('O-P02-ENOX', 'P02', 'medication:D135', '40 mg (0.4 mL)', 'sc', 'QD (once daily)', '2026-11-02T20:00', 'ashford');
  svc('O-P02-DRAIN', 'P02', 'service:P026', 'TID (3 times daily)', '2026-11-02T12:00', 'ashford');
  svc('O-P02-HIST', 'P02', 'service:L053', 'Once now', '2026-11-02T11:30', 'ashford');
  pending('R-P02-HIST', 'P02', 'service:L053', 'Pathology report', 'O-P02-HIST', 'Expected 2026-11-09.');
  done('O-P02-PARA', '2026-11-04T08:00', 'fletcher', '1 g (100 mL)', 'Intravenous infusion');
  done('O-P02-ENOX', '2026-11-03T20:00', 'shaw', '40 mg', 'Subcutaneous injection');
  // Walter Hughes
  med('O-P01-ONDAN', 'P01', 'medication:D041', '8 mg (1 tablet)', 'oral', 'BID (twice daily)', '2026-11-02T08:00', 'grant', {end: '2026-11-05T20:00'});
  med('O-P01-PARA', 'P01', 'medication:D070', '500 mg (1 tablet)', 'oral', 'PRN (as needed)', '2026-11-01T12:00', 'grant', {dosing: {mode: 'prn', prnIndication: 'Pain or temperature ≥ 38 °C', prnInterval: '6 h', prnMax: '4 g/24 h'}});
  done('O-P01-ONDAN', '2026-11-04T08:00', 'fletcher', '8 mg (1 tablet)', 'Oral');
  // Raymond Foster
  med('O-P04-PARA', 'P04', 'medication:D070', '1,000 mg (2 tablets)', 'oral', 'Q6H (every 6 h)', '2026-11-03T14:00', 'grant', {end: '2026-11-06T14:00'});
  med('O-P04-ONDAN', 'P04', 'medication:D040', '8 mg (4 mL)', 'iv', 'PRN (as needed)', '2026-11-03T14:00', 'grant', {dosing: {mode: 'prn', prnIndication: 'Nausea', prnInterval: '8 h', prnMax: '24 mg/24 h'}});
  svc('O-P04-LFT', 'P04', 'service:L003', 'QD (once daily)', '2026-11-04T06:00', 'grant');
  done('O-P04-PARA', '2026-11-04T08:00', 'fletcher', '1,000 mg (2 tablets)', 'Oral');
  // Dorothy Palmer
  med('O-P05-GABA', 'P05', 'medication:D077', '300 mg (1 capsule)', 'oral', 'TID (3 times daily)', '2026-11-01T08:00', 'mercer');
  svc('O-P05-FALL', 'P05', 'service:P008', 'Continuous monitoring', '2026-10-31T12:00', 'mercer');
  svc('O-P05-PHYSIO', 'P05', 'service:P014', 'QD (once daily)', '2026-11-02T10:00', 'mercer');
  done('O-P05-GABA', '2026-11-04T08:00', 'carter', '300 mg (1 capsule)', 'Oral');
  // Sophie Harland
  svc('O-P07-CT', 'P07', 'service:X007', 'Once now', '2026-11-03T10:00', 'mercer');
  svc('O-P07-US', 'P07', 'service:X003', 'Once now', '2026-11-03T10:00', 'mercer');
  // George Pritchard
  med('O-P09-MORSR', 'P09', 'medication:D074', '30 mg (1 tablet)', 'oral', 'BID (twice daily)', '2026-10-29T08:00', 'grant');
  med('O-P09-MORSC', 'P09', 'medication:D073', '5 mg (0.5 mL)', 'sc', 'PRN (as needed)', '2026-10-29T08:00', 'grant', {dosing: {mode: 'prn', prnIndication: 'Breakthrough pain', prnInterval: '2 h', prnMax: '6 doses/24 h'}});
  med('O-P09-LACT', 'P09', 'medication:D112', '15 mL', 'oral', 'BID (twice daily)', '2026-10-29T08:00', 'grant');
  med('O-P09-PEMBRO', 'P09', 'medication:D021', '200 mg', 'inf', 'Once now', '2026-11-14T10:00', 'grant', {orderedAt: '2026-11-03T11:00', source: 'Next immunotherapy cycle, every 3 weeks (demo)'});
  svc('O-P09-PALL', 'P09', 'service:P029', 'Once now', '2026-11-03T11:00', 'grant');
  done('O-P09-MORSR', '2026-11-04T08:00', 'fletcher', '30 mg (1 tablet)', 'Oral');
  done('O-P09-LACT', '2026-11-04T08:00', 'fletcher', '15 mL', 'Oral');
  // Helen Barlow：11-05 手術
  svc('O-P10-NPO', 'P10', 'diet:T005', 'Continuous monitoring', '2026-11-05T00:00', 'ashford', {orderedAt: '2026-11-03T16:00', source: 'Pre-operative fasting from midnight (demo)'});
  med('O-P10-CEFAZ', 'P10', 'medication:D108', '1 g', 'iv', 'Once pre-op', '2026-11-05T07:00', 'ashford', {orderedAt: '2026-11-03T16:00'});
  svc('O-P10-BCS', 'P10', 'service:P022', 'Once pre-op', '2026-11-05T08:00', 'ashford', {orderedAt: '2026-11-03T16:00'});
  svc('O-P10-SLNB', 'P10', 'service:P023', 'Once pre-op', '2026-11-05T08:00', 'ashford', {orderedAt: '2026-11-03T16:00'});
  // Peter Linton
  svc('O-P11-ENTERAL', 'P11', 'diet:T006', 'Q4H (every 4 h)', '2026-10-31T08:00', 'grant', {source: '250 mL per feed via nasogastric tube (demo)'});
  svc('O-P11-NG', 'P11', 'service:P011', 'Q4H (every 4 h)', '2026-10-31T08:00', 'grant');
  med('O-P11-OMEP', 'P11', 'medication:D111', '40 mg', 'iv', 'QD (once daily)', '2026-10-30T12:00', 'grant');
  svc('O-P11-RT', 'P11', 'service:P019', 'QD (once daily)', '2026-10-20T14:00', 'grant', {source: 'External beam radiotherapy, fraction 11 of 28 today (demo)'});
  svc('O-P11-DIET', 'P11', 'service:P015', 'Once now', '2026-11-03T10:00', 'grant');
  done('O-P11-OMEP', '2026-11-04T08:00', 'fletcher', '40 mg', 'Intravenous injection');
  done('O-P11-ENTERAL', '2026-11-04T08:00', 'fletcher', '250 mL', 'Enteral tube');

  // ----------------------------------------------------------- 照會（S15 一對一）----
  const consultations = [
    {id: 'CS-1102-04', p: 'P03', specialty: 'Breast Surgery', urgency: 'routine', assignee: 'ashford', subject: 'Right breast IDC cT2N1M0: surgery first, or neoadjuvant chemotherapy?',
      question: 'Right breast IDC (NST) grade 2, 3.2 cm, one suspicious axillary node (1.1 cm), ER 90% / PR 60% / HER2 1+ / Ki-67 30%, CT and bone scan M0. The patient wishes to keep her breast. Please advise whether to operate first or start neoadjuvant chemotherapy, and comment on breast conservation.',
      requester: 'mercer', requestedAt: '2026-11-02T14:10', status: 'completed',
      recommendation: 'Both upfront surgery and neoadjuvant chemotherapy are reasonable. Given the 3.2 cm tumour, node-positive disease and the patient\'s wish for breast conservation, I recommend neoadjuvant chemotherapy first and reassessment of breast-conserving surgery after response. Suggest listing her for the breast cancer MDT meeting on 11-04 to agree the sequence.',
      responder: 'ashford', respondedAt: '2026-11-03T09:20',
      adoption: {decision: 'adopt', note: 'Adopted. Case to be proposed to the breast cancer MDT meeting on 2026-11-04 (proposal draft MDT-1103-06).', actor: 'mercer', at: '2026-11-03T10:05'},
      source: 'Demo consultation (fictional)'},
    {id: 'CS-1102-05', p: 'P03', specialty: 'Cardiology', urgency: 'routine', assignee: 'marsh', subject: 'Cardiac assessment before anthracycline chemotherapy; hypertension on amlodipine',
      question: 'Planned neoadjuvant chemotherapy includes doxorubicin. Please arrange echocardiography (LVEF) and assess cardiovascular risk. Currently on amlodipine 5 mg, BP 128–142 / 78–86.',
      requester: 'mercer', requestedAt: '2026-11-02T14:30', status: 'requested', recommendation: null, responder: null, respondedAt: null, source: 'Demo consultation (fictional); overdue against the 24-hour hospital rule'},
    {id: 'CS-1103-07', p: 'P12', specialty: 'Cardiology', urgency: 'urgent', assignee: 'marsh', subject: 'Sinus tachycardia 108/min with fever; on adjuvant chemotherapy with prior anthracycline',
      question: 'Febrile neutropenia day 1, HR 108, BP 104/62. Prior cumulative doxorubicin 240 mg/m². Please review ECG and advise whether echocardiography is needed now.',
      requester: 'mercer', requestedAt: '2026-11-02T16:00', status: 'completed', recommendation: 'Tachycardia is consistent with fever and volume depletion; ECG shows sinus tachycardia without ischaemic change. No urgent echocardiography needed; repeat ECG when afebrile and arrange routine echo before the next anthracycline cycle.',
      responder: 'marsh', respondedAt: '2026-11-02T18:40', adoption: {decision: 'adopt', note: 'Repeat ECG when afebrile; echo booked before next cycle.', actor: 'mercer', at: '2026-11-03T08:15'}, source: 'Demo consultation (fictional)'}
  ];

  // ----------------------------------------------------------- 病歷（病程 SOAP）----
  const notes = [];
  const soapText = soap => ['S', 'O', 'A', 'P'].map(k => k + ': ' + soap[k]).join('\n\n');
  function soap(id, p, clinicalAt, author, s, status) {
    const signed = status !== 'draft';
    notes.push({id, p, kind: 'Progress', noteType: 'progress', progressKind: 'soap', soap: s, text: soapText(s), sections: null, diagnoses: [], clinicalAt, at: clinicalAt, author, version: 1,
      status: signed ? 'signed' : 'draft', reviewStatus: signed ? 'completed' : 'saved', signedAt: signed ? clinicalAt : null, references: [], copyTrace: null, source: 'Demo progress note (fictional)'});
  }
  soap('N-P03-1102', 'P03', '2026-11-02T16:00', 'mercer', {
    S: 'Admitted for treatment planning of a newly diagnosed right breast cancer. Palpable right breast lump for 2 months; no pain. Wishes to keep her breast if possible. Hypertension on amlodipine. Mother treated for breast cancer at 61.',
    O: 'Right upper-outer quadrant mass 3 cm, mobile; one palpable right axillary node. BP 138/84, HR 82, afebrile. Core biopsy 10-17: IDC (NST) G2, ER 90%, PR 60%, HER2 1+, Ki-67 30%. CT CAP 10-27 and bone scan 10-30: no distant metastasis. ECG normal.',
    A: 'Right breast IDC cT2N1M0, clinical stage IIB, luminal B-like (HER2-negative). Candidate for neoadjuvant chemotherapy versus upfront surgery; cardiac assessment needed before anthracycline.',
    P: 'Specialist consult to Breast Surgery (sequence of treatment); cardiology consult and echocardiography for baseline LVEF; pre-chemotherapy baseline labs 11-03; discuss at breast cancer MDT 11-04; genetic counselling referral to be considered (family history).'});
  soap('N-P03-1103', 'P03', '2026-11-03T10:30', 'mercer', {
    S: 'Comfortable. Understands that the team will discuss the order of surgery and chemotherapy tomorrow; keen on breast conservation.',
    O: 'Vitals stable (BP 132/80, HR 78). Baseline labs 11-03: WBC 6.2, ANC 3.6, Hb 12.8, PLT 238, creatinine 0.70, liver function normal. Echocardiography scheduled 11-05 08:30.',
    A: 'Breast surgery consult replied 09:20: neoadjuvant chemotherapy first, reassess breast conservation after response; recommends MDT discussion. Adopted 10:05 and proposed to the breast cancer MDT meeting 11-04 (MDT-1103-06).',
    P: 'Await MDT decision 11-04 14:00; echocardiography 11-05; complete the patient-preference section of the case summary pack; cardiology consult reply still pending (reminder sent).'});
  soap('N-P03-1104', 'P03', '2026-11-04T08:30', 'mercer', {
    S: 'Slept well; asking what to expect at the team meeting this afternoon.',
    O: 'T 36.7, HR 80, BP 130/80, SpO₂ 98%. Weight 58.4 kg, height 158 cm, BSA 1.60 m². Breast and axillary findings unchanged.',
    A: 'Stable; all MDT case summary items available except echocardiography (scheduled 11-05).',
    P: 'Present at breast cancer MDT 14:00; central venous port insertion booked 11-05 13:00 if chemotherapy is agreed; explain the plan to patient and husband after the meeting.'}, 'draft');
  soap('N-P06-1103', 'P06', '2026-11-03T13:40', 'mercer', {
    S: 'Day 1 of FOLFOX cycle 4. Appetite poor for 2 months, early satiety; tingling in both feet; one fall at home on 10-25 without injury. Wife is the main carer (68, knee osteoarthritis).',
    O: 'Weight 52.0 kg (57.5 kg two months ago, −9.6%), BMI 19.1. Albumin 32 g/L, glucose 9.8 mmol/L, Hb 11.2. Morse fall score 55. Reduced vibration sense both feet, grade 2 sensory neuropathy.',
    A: 'Sigmoid colon adenocarcinoma pT3N1b on adjuvant FOLFOX; malnutrition with significant weight loss; oxaliplatin neuropathy grade 2; high fall risk; steroid-worsened hyperglycaemia; probable difficult discharge.',
    P: 'Allied-health consults: dietitian, clinical pharmacy (dexamethasone and glucose, oxaliplatin dose), physiotherapy (mobility, walking aid), social work (home support). Oxaliplatin given at 85 mg/m² today; consider 25% dose reduction next cycle. Capillary glucose QID.'});
  soap('N-P06-1104', 'P06', '2026-11-04T08:20', 'mercer', {
    S: 'Tolerating the 5-FU pump; no nausea. Tired. Worried about managing at home.',
    O: 'T 36.6, HR 90, BP 120/74. Fasting capillary glucose 10.4 mmol/L. Pump running, port site clean.',
    A: 'Dietitian reply adopted (oral supplement started 11-03). Physiotherapy reply this morning: walker and twice-daily sessions — adopted. Social work flagged a difficult discharge. Four allied-health consults this admission: consider a case conference before discharge.',
    P: 'Continue FOLFOX; pump off 11-05 10:30. Decide on a case conference today (team overview). Discuss glucose management with clinical pharmacy. Discharge target 11-06 if safe.'});
  soap('N-P08-1104', 'P08', '2026-11-04T08:10', 'mercer', {
    S: 'Ready for first chemotherapy; anxious but well informed. Consent signed 11-03.',
    O: 'T 36.6, HR 82, BP 118/74. Weight 62.0 kg, height 160 cm, BSA 1.66 m². ANC 3.2, PLT 230, creatinine 0.68, LVEF 62% (11-01). Port in situ, flushed.',
    A: 'Right breast IDC G3 cT2N1M0 IIB. Fit for neoadjuvant AC cycle 1 day 1.',
    P: 'AC: doxorubicin 100 mg + cyclophosphamide 1,000 mg today with aprepitant / ondansetron / dexamethasone premedication; extravasation observation; oral ondansetron days 2–4; nurse education on neutropenic precautions; cycle 2 on 11-25.'});
  soap('N-P12-1104', 'P12', '2026-11-04T08:00', 'mercer', {
    S: 'Feels better; no rigors overnight. Eating small meals.',
    O: 'T 37.2 (max 37.6 overnight), HR 90, BP 114/72. WBC 2.6, ANC 1.1, CRP 41 (from 86). Blood cultures no growth at 48 h. Port site clean.',
    A: 'Febrile neutropenia after adjuvant chemotherapy, improving on piperacillin/tazobactam and filgrastim; cultures negative so far.',
    P: 'Continue antibiotics until ANC > 1.5 and afebrile 48 h; continue filgrastim; daily CBC; maintain protective isolation; plan to discuss radiotherapy timing at the breast cancer MDT when recovered.'});
  soap('N-P02-1104', 'P02', '2026-11-04T08:40', 'grant', {
    S: 'Post-op day 2. Pain 3/10 on regular paracetamol; mobilising.',
    O: 'T 36.8, HR 84, BP 124/78. Wound clean; drain 60 mL serous in 24 h.',
    A: 'Recovering well after left modified radical mastectomy. Final histology expected 11-09.',
    P: 'Continue analgesia and enoxaparin; drain removal when < 30 mL/24 h; physiotherapy for shoulder mobility; adjuvant plan at MDT after histology.'});

  // ----------------------------------------------------------- 交班（前一班醫師 → 當班醫師）----
  const handovers = [];
  [['P03', 'Stable overnight; BP 126/76 at 02:00.', 'Newly diagnosed right breast IDC cT2N1M0 IIB; MDT this afternoon 14:00.', 'No acute issues; echo still pending (11-05).', 'Confirm cardiology consult reply; complete MDT summary pack; discuss plan with patient after the meeting.'],
   ['P05', 'No falls; neuropathic pain controlled on gabapentin.', 'Breast ILC on docetaxel cycle 3; neuropathy grade 3; high fall risk.', 'Stable; mobilising with assistance.', 'Physiotherapy today; consider docetaxel dose reduction or switch at MDT.'],
   ['P06', 'Capillary glucose 14.2 at 17:30 yesterday, 10.4 this morning; pump running.', 'Sigmoid colon cancer on FOLFOX cycle 4; weight loss, neuropathy, fall risk.', 'Hyperglycaemia on dexamethasone; difficult discharge flagged by social work.', 'Review glucose plan with pharmacy; physiotherapy reply due this morning; decide on a case conference.'],
   ['P07', 'Comfortable; no events.', 'HER2-positive breast cancer after 4 cycles of neoadjuvant chemotherapy; response evaluation.', 'Awaiting CT and ultrasound today.', 'Chase imaging results; book MDT discussion for surgical planning.'],
   ['P08', 'Consent signed; premedication prescribed for 08:30.', 'Right breast IDC G3 cT2N1M0 IIB; neoadjuvant AC cycle 1 day 1 today.', 'Fit for chemotherapy; LVEF 62%, ANC 3.2.', 'Supervise first doxorubicin dose (vesicant via port); extravasation observation; review before discharge tomorrow.'],
   ['P10', 'Pre-op checks complete; fasting from midnight tonight for 11-05.', 'Right breast IDC cT1cN0M0 IA; breast-conserving surgery and sentinel node biopsy 11-05.', 'Fit for surgery; labs and ECG normal.', 'Confirm theatre time with Dr. Ashford; cefazolin on call.'],
   ['P12', 'Tmax 37.6 overnight; no rigors; cultures negative at 48 h.', 'Febrile neutropenia after adjuvant chemotherapy; protective isolation.', 'Improving; ANC 1.1 this morning.', 'Continue piperacillin/tazobactam and filgrastim; daily CBC; review antibiotics when ANC > 1.5.']].forEach(([pid, S, B, A, R], i) => {
    const pt = PATIENTS.find(x => x.id === pid);
    const text = ['I: ' + [pt.bed, pt.name, pt.mrn].join(' · '), 'S: ' + S, 'B: ' + B, 'A: ' + A, 'R: ' + R].join('\n');
    handovers.push({id: 'H-D2-' + (i + 1), p: pid, role: 'doctor', shift: 'D2', author: 'sutton', receiver: 'mercer', version: 1, replaces: null, reason: null, batch: 'H-D2-1104', format: 'ISBAR', attendingTransferred: false,
      text, summary: text, at: '2026-11-04T06:50', clinicalAt: '2026-11-04T07:00', scheduled: '07:00', tasks: [], orders: [], reports: []});
  });

  // ----------------------------------------------------------- 工作、手術、設定 ----
  const tasks = [
    {id: 'T-P03-ECHO', p: 'P03', title: 'Follow up echocardiography (LVEF) result — scheduled 11-05 08:30', source: 'O-P03-ECHO', owner: 'mercer', status: 'waiting', evidence: null, history: []},
    {id: 'T-P03-CONS', p: 'P03', title: 'Cardiology consult overdue (24-hour rule) — reminder sent, escalate if no reply by noon', source: 'CS-1102-05', owner: 'mercer', status: 'open', evidence: null, history: []},
    {id: 'T-P06-DC', p: 'P06', title: 'Discharge planning — confirm home care arrangements with social work before 11-06', source: 'N-P06-1104', owner: 'mercer', status: 'open', evidence: null, history: []},
    {id: 'T-P08-ADM', p: 'P08', title: 'Complete AC cycle 1 day 1 administration record (cyclophosphamide pending)', source: 'O-P08-CYCLO', owner: 'carter', status: 'open', evidence: null, history: []},
    {id: 'T-P02-HIST', p: 'P02', title: 'Follow up final histology (expected 11-09)', source: 'O-P02-HIST', owner: 'grant', status: 'waiting', evidence: null, history: []},
    {id: 'T-P07-IMG', p: 'P07', title: 'Review response-evaluation CT and ultrasound (today)', source: 'O-P07-CT', owner: 'mercer', status: 'waiting', evidence: null, history: []}
  ];
  const surgeries = [{id: 'DEMO-OR-P02-1', p: 'P02', performedAt: '2026-11-02T08:40', ward: 'A', bed: 'A02', preDiagnosis: 'Left breast invasive ductal carcinoma, cT2N1M0 (demo)', postDiagnosis: 'Left breast invasive ductal carcinoma with axillary node involvement; final histology pending (demo)',
    procedure: 'Left modified radical mastectomy with axillary lymph node dissection (demo)', category: 'MRM', anesthesia: 'General anaesthesia', surgeons: [{name: 'Dr. Richard Ashford', role: 'primary'}, {name: 'Dr. Andrew Kemp', role: 'assistant'}], anesthetists: ['Dr. Thomas Reid'], diagram: [],
    steps: 'Elliptical skin incision; mastectomy flaps raised; breast removed off pectoralis fascia; level I–II axillary dissection with preservation of the long thoracic and thoracodorsal nerves; haemostasis; two closed-suction drains; layered closure. Blood loss 150 mL. (demo)',
    signedDate: '2026-11-02', signer: 'Dr. Richard Ashford', author: 'ashford', version: 1, replaces: null, reason: null, at: '2026-11-02T04:30:00.000Z', status: 'saved', form: 'Operative record', source: 'Demo data (fictional)'}];
  const settings = {version: 1, graceHours: 0, dosingWeightStaleDays: 7, dosingWeightStaleDaysInfant: 3, ioDayStart: '00:00',
    departments: [{name: 'Oncology', hisKey: 'department:9001', hisCode: 'ONC', hisName: 'Oncology Ward A', live: true}, {name: 'Breast Surgery', hisKey: 'department:9002', hisCode: 'BRS', hisName: 'Breast Surgery Ward', live: true}]};

  function state() {
    return copy({schema: 1, revision: 0, seq: 100, scenario: 'normal', confirmed: {}, drafts: {}, audit: [], demoClock: CLOCK,
      patients: PATIENTS.map(buildPatient), relationships: relationships(), favorites: {}, orders, executions, observations: obs, reports, tasks, notes,
      infusionChecks: [], handovers, receipts: [], communications: [], goals: [], careFocuses: [], consultations, admissionPool: [], surgeries, periop: [], settings, settingsHistory: [], hisOutbox: []});
  }

  // ----------------------------------------------------------- 給 clinical／taxonomy／orders 用的對照 ----
  const labDefs = {
    'service:L001': [['WBC', 'White blood cells', '10^9/L', [6.2, 5.8, 6.0], '4.0 - 10.0'], ['ANC', 'Neutrophils (absolute)', '10^9/L', [3.6, 3.2, 3.4], '1.5 - 7.0'], ['HB', 'Haemoglobin', 'g/dL', [12.8, 12.5, 12.6], 'F: 12.0-16.0, M: 13.5-17.5'], ['PLT', 'Platelets', '10^9/L', [238, 230, 225], '150 - 400']],
    'service:L003': [['AST', 'AST', 'U/L', [24, 22, 25], '10 - 40'], ['ALT', 'ALT', 'U/L', [21, 20, 22], '7 - 56'], ['ALP', 'Alkaline phosphatase', 'U/L', [81, 80, 82], '40 - 130'], ['TBIL', 'Total bilirubin', 'mg/dL', [0.6, 0.6, 0.7], '0.2 - 1.2']],
    'service:L004': [['CR', 'Creatinine', 'mg/dL', [0.70, 0.72, 0.71], 'M: 0.7-1.3, F: 0.6-1.1'], ['EGFR', 'eGFR (CKD-EPI)', 'mL/min/1.73m²', [95, 94, 96], '90 - 150'], ['UREA', 'Urea', 'mmol/L', [4.5, 4.6, 4.4], '2.5 - 7.1']],
    'service:L005': [['NA', 'Sodium', 'mmol/L', [139, 138, 140], '136 - 145'], ['K', 'Potassium', 'mmol/L', [4.0, 4.1, 4.0], '3.5 - 5.1'], ['CL', 'Chloride', 'mmol/L', [104, 103, 104], '98 - 107']],
    'service:L007': [['ALB', 'Albumin', 'g/L', [40, 38, 39], '35 - 50']],
    'service:L008': [['GLU', 'Glucose, fasting', 'mmol/L', [5.7, 5.8, 5.6], '3.9 - 5.6']],
    'service:L009': [['POC', 'Capillary glucose', 'mmol/L', [8.4, 9.1, 7.8], '3.9 - 7.8']],
    'service:L013': [['CRP', 'C-reactive protein', 'mg/L', [4, 6, 3], '< 5']],
    'service:L020': [['CA153', 'CA 15-3', 'U/mL', [41, 38, 36], '< 30']],
    'service:L021': [['CEA', 'CEA', 'ng/mL', [2.1, 2.0, 2.2], '< 3.0']],
    'service:L002': [['INR', 'INR', '', [1.0, 1.1, 1.0], '0.8 - 1.2'], ['APTT', 'APTT', 's', [29, 30, 28], '25 - 37']]
  };
  const labMeta = {
    'service:L001': {category: 'Hematology', specimen: 'Hematology'}, 'service:L002': {category: 'Hematology', specimen: 'Hematology'},
    'service:L003': {category: 'Biochemistry', specimen: 'Hematology'}, 'service:L004': {category: 'Biochemistry', specimen: 'Hematology'}, 'service:L005': {category: 'Biochemistry', specimen: 'Hematology'},
    'service:L007': {category: 'Biochemistry', specimen: 'Hematology'}, 'service:L008': {category: 'Biochemistry', specimen: 'Hematology'}, 'service:L009': {category: 'Biochemistry', specimen: 'Hematology'},
    'service:L013': {category: 'Biochemistry', specimen: 'Hematology'}, 'service:L020': {category: 'Biochemistry', specimen: 'Hematology'}, 'service:L021': {category: 'Biochemistry', specimen: 'Hematology'},
    'service:L030': {category: 'Microbiology', specimen: 'Hematology'}, 'service:L031': {category: 'Microbiology', specimen: 'Urine'}, 'service:L032': {category: 'Microbiology', specimen: 'Sputum'}
  };
  const taxonomy = {
    departments: [['01', 'Oncology'], ['02', 'Breast Surgery'], ['03', 'Radiation Oncology'], ['04', 'Diagnostic Imaging'], ['05', 'Pathology'], ['06', 'Nuclear Medicine'], ['07', 'Cardiology'], ['08', 'Clinical Pharmacy'], ['09', 'Nutrition'], ['10', 'Rehabilitation'], ['11', 'Social Work']],
    doctorDefaults: ['medication:D070', 'medication:D041', 'medication:D045', 'medication:D090', 'service:L001', 'service:L003', 'service:L004', 'service:X001', 'service:X014'],
    departmentDefaults: {
      'Oncology': ['service:L001', 'service:L003', 'service:L004', 'service:L005', 'service:L020', 'service:X007', 'service:X014', 'medication:D040', 'medication:D045', 'medication:D060'],
      'Breast Surgery': ['service:P021', 'service:P022', 'service:P023', 'service:L053', 'service:X003', 'medication:D071', 'medication:D135'],
      'Radiation Oncology': ['service:X009', 'service:P018', 'service:P019'],
      'Cardiology': ['service:X014', 'service:X015', 'service:L015', 'service:L016']
    },
    imagingGroups: ['X-RAY', 'MAMMOGRAPHY', 'ULTRASOUND', 'CT', 'MRI', 'NUCLEAR MEDICINE', 'ECHOCARDIOGRAPHY', 'ECG', 'ENDOSCOPY']
  };
  // 醫囑組套（patient/orders.js 的 mainSets 格式：主套 → 組套 → 品項）；院方未核定的示範內容。
  const orderSets = [
    {id: 'BUNDLE-BREAST', name: 'Breast cancer team · chemotherapy and endocrine regimens', source: 'Breast cancer team regimen sets (demo; version 2026-09)', gaps: [], groups: [
      {id: 'GRP-AC', name: 'AC q21d ×4 — doxorubicin 60 mg/m² + cyclophosphamide 600 mg/m², with antiemetic premedication (high emetogenic)', keys: ['medication:D001', 'medication:D003', 'medication:D043', 'medication:D040', 'medication:D045']},
      {id: 'GRP-PACLI', name: 'Paclitaxel 80 mg/m² weekly ×12, with premedication', keys: ['medication:D006', 'medication:D045', 'medication:D048', 'medication:D049']},
      {id: 'GRP-HER2', name: 'HER2-positive: trastuzumab + pertuzumab q21d', keys: ['medication:D015', 'medication:D016']},
      {id: 'GRP-ENDO', name: 'Adjuvant endocrine therapy', keys: ['medication:D030', 'medication:D031', 'medication:D032']}]},
    {id: 'BUNDLE-PRECHEMO', name: 'Pre-chemotherapy baseline and vesicant safety', source: 'Oncology ward protocol (demo)', gaps: [], groups: [
      {id: 'GRP-PRE-LAB', name: 'Baseline labs: CBC, liver, renal, electrolytes, glucose', keys: ['service:L001', 'service:L003', 'service:L004', 'service:L005', 'service:L008']},
      {id: 'GRP-PRE-CARD', name: 'Cardiac baseline before anthracycline: echocardiography (LVEF) and ECG', keys: ['service:X014', 'service:X015']},
      {id: 'GRP-PRE-PORT', name: 'Central venous access and vesicant precautions', keys: ['service:P001', 'service:P002', 'service:P013', 'supply:S001']}]},
    {id: 'BUNDLE-CRC', name: 'Colorectal team · adjuvant chemotherapy', source: 'Colorectal team regimen sets (demo)', gaps: [], groups: [
      {id: 'GRP-FOLFOX', name: 'FOLFOX q14d — oxaliplatin 85 mg/m², leucovorin 400 mg/m², 5-FU 400 mg/m² bolus + 2,400 mg/m² over 46 h', keys: ['medication:D010', 'medication:D014', 'medication:D012', 'medication:D011', 'medication:D040', 'medication:D045', 'supply:S005']},
      {id: 'GRP-CAPE', name: 'Capecitabine 1,250 mg/m² BID days 1–14 q21d', keys: ['medication:D013']}]},
    {id: 'BUNDLE-SUPPORT', name: 'Supportive care', source: 'Oncology ward protocol (demo)', gaps: [], groups: [
      {id: 'GRP-FN', name: 'Febrile neutropenia: cultures, broad-spectrum antibiotic, G-CSF, protective isolation', keys: ['service:L030', 'service:L001', 'medication:D101', 'medication:D060', 'service:P009']},
      {id: 'GRP-NAUSEA', name: 'Delayed nausea and vomiting', keys: ['medication:D041', 'medication:D047', 'medication:D050']},
      {id: 'GRP-PAIN', name: 'Cancer pain ladder', keys: ['medication:D070', 'medication:D080', 'medication:D074', 'medication:D073', 'medication:D077']},
      {id: 'GRP-FALLS', name: 'Falls prevention and mobility', keys: ['service:P008', 'service:P014', 'supply:S006']}]}
  ];

  root.ICUDemoSeed = {version: 'P1 · 2026-11-10', clock: CLOCK, now: '2026-11-04T19:00', state, labDefs, labMeta, taxonomy, orderSets, patients: ALL, settings};
  if (typeof module !== 'undefined') module.exports = root.ICUDemoSeed;
})(globalThis);
