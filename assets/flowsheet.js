/* 護理流程表（2026-10-31）：院方 I-D-01-003「一級照護病人觀察與照護表」的項目庫、科別範本、病人額外列與出入量計算。
   量測照舊存 observation（kind＝項目鍵），一欄＝一個時點，一次存；畫面在 patient/vitals.js，寫入在 store.js flowsheetSave。 */
(function (root) {
  'use strict';
  const TZ = typeof module !== 'undefined' ? require('./timezone.js') : root.ICUTimeZone;
  const GROUPS = [['vitals', 'Vital signs & neuro'], ['resp', 'Respiratory'], ['output', 'Output'], ['intake', 'Intake'], ['drugs', 'Medications'], ['care', 'Care']];
  // [項目鍵（observation kind）, 分組, 標籤, 型別, 單位, 其他]；型別：number 數值、bp 收縮／舒張、code 選項、text 文字、volume 量（mL 或 g，算進出入量）。
  const ITEMS = [
    ['SpO₂', 'vitals', 'SpO₂', 'number', '%', {min: 0, max: 100, step: 1}],
    ['Respiratory rate', 'vitals', 'Respiratory rate', 'number', '/min', {min: 0, max: 150, step: 1}],
    ['Heart rate', 'vitals', 'Heart rate', 'number', '/min', {min: 0, max: 300, step: 1}],
    ['Temperature', 'vitals', 'Temperature', 'number', '°C', {min: 25, max: 45, step: 0.1}],
    ['CVP', 'vitals', 'CVP', 'number', 'mmHg', {min: -10, max: 60, step: 1}],
    ['ICP', 'vitals', 'ICP', 'number', 'mmHg', {min: -10, max: 100, step: 1}],
    ['Weight', 'vitals', 'Weight', 'number', 'kg', {min: 0.3, max: 300, step: 0.01}],
    ['Blood pressure', 'vitals', 'Blood pressure', 'bp', 'mmHg', {}],
    ['Consciousness', 'vitals', 'Consciousness (AVPU)', 'code', '', {options: [['A', 'Alert'], ['V', 'Responds to voice'], ['P', 'Responds to pain'], ['U', 'Unresponsive'], ['SED', 'Sedated']]}],
    ['Seizures / muscle tone', 'vitals', 'Seizures / muscle tone', 'text', '', {}],
    ['Pupils', 'vitals', 'Pupils (mm)', 'text', '', {}],
    ['Ventilation mode', 'resp', 'Ventilation mode', 'code', '', {options: [['RA', 'Room air'], ['O2', 'Oxygen'], ['HFNC', 'High-flow nasal cannula'], ['CPAP', 'CPAP'], ['NIV', 'Non-invasive ventilation'], ['SIMV', 'SIMV'], ['AC', 'Assist-control'], ['PSV', 'Pressure support'], ['HFO', 'HFO']]}],
    ['Ventilator rate', 'resp', 'Rate F / Hz (HFO)', 'number', '', {min: 0, max: 200, step: 0.1}],
    ['PIP', 'resp', 'PIP', 'number', 'cmH₂O', {min: 0, max: 80, step: 1}],
    ['PEEP', 'resp', 'PEEP', 'number', 'cmH₂O', {min: 0, max: 40, step: 1}],
    ['MAP', 'resp', 'MAP', 'number', 'cmH₂O', {min: 0, max: 60, step: 1}],
    ['Tidal volume / amplitude', 'resp', 'Vt (mL) / amplitude (HFO)', 'number', '', {min: 0, max: 2000, step: 1}],
    ['Ti / I:E', 'resp', 'Ti – I:E', 'text', '', {}],
    ['FiO₂', 'resp', 'FiO₂', 'number', '%', {min: 21, max: 100, step: 1}],
    ['ETT', 'resp', 'ETT size / fixation', 'text', '', {}],
    ['Gastric aspirate', 'output', 'Gastric aspirate', 'volume', 'mL', {attr: [['GREEN', 'Green'], ['BLACK', 'Black'], ['MILK', 'Milk']]}],
    ['Pleural drainage', 'output', 'Pleural drainage', 'volume', 'mL', {}],
    ['Other drainage', 'output', 'Other drainage', 'volume', 'mL', {}],
    ['Urine', 'output', 'Urine', 'volume', 'mL', {}],
    ['Stool', 'output', 'Stool', 'volume', 'g', {attr: [['MECONIUM', 'Meconium'], ['YELLOW', 'Yellow'], ['BLOOD', 'Blood']]}],
    ['IV fluids', 'intake', 'IV fluids', 'volume', 'mL', {}],
    ['Blood products', 'intake', 'Blood / blood products', 'volume', 'mL', {}],
    ['Feeds / oral', 'intake', 'Feeds / oral', 'volume', 'mL', {}],
    ['Medications', 'drugs', 'Medications (administration record)', 'mar', '', {}],
    ['Phototherapy', 'care', 'Phototherapy', 'code', '', {options: [['ON', 'On'], ['OFF', 'Off']]}],
    ['Position', 'care', 'Position', 'code', '', {options: [['PRONE', 'Prone'], ['SUPINE', 'Supine'], ['RIGHT', 'Right side'], ['LEFT', 'Left side']]}],
    ['Abdominal distension', 'care', 'Abdomen', 'code', '', {options: [['YES', '+ Distended'], ['NO', '− Not distended']]}],
    ['Skin, eye and umbilical care', 'care', 'Skin, eye and umbilical care', 'code', '', {options: [['DONE', 'Done']]}]
  ].map(([key, group, label, type, unit, extra]) => ({key, group, label, type, unit, ...extra}));
  const byKey = Object.fromEntries(ITEMS.map(i => [i.key, i]));
  const BASIC = ['Temperature', 'Heart rate', 'Respiratory rate', 'Blood pressure', 'SpO₂', 'Weight'];
  // 科別範本：ICU 預設整張 I-D-01-003，其他科預設基本生命徵象；部門管理員在維護設定改（master.deptFlowsheet，鍵 dept:<科別>）。
  function templateKeys(state, department) {
    const row = state && state.master && state.master.deptFlowsheet && state.master.deptFlowsheet['dept:' + department];
    if (row && Array.isArray(row.items)) return row.items.filter(k => byKey[k]);
    return department === 'ICU' ? ITEMS.map(i => i.key) : BASIC.slice();
  }
  // 病人額外列（2026-10-31）：只給出量、入量（例如第二條胸管）；一列一個鍵 extra:<id>。
  const extraRows = patient => ((patient && patient.flowsheetRows) || []).filter(r => !r.removed).map(r => ({key: 'extra:' + r.id, group: r.group, label: r.label, type: 'volume', unit: r.unit || 'mL', extra: true}));
  function itemsFor(state, patient) {
    const keys = templateKeys(state, patient && patient.department);
    const base = keys.map(k => byKey[k]);
    return [...base, ...extraRows(patient)];
  }
  // 一天從幾點算起（全院設定，預設 00:00）；三班各 8 小時。
  const dayStartOf = state => { const v = String(state && state.settings && state.settings.ioDayStart || '00:00'); return /^\d\d:\d\d$/.test(v) ? v : '00:00'; };
  function periods(state, nowAt) {
    const start = dayStartOf(state), nowMs = TZ.millis(nowAt), wall = TZ.wall(nowMs);
    let dayMs = TZ.millis(wall.slice(0, 10) + 'T' + start);
    if (dayMs > nowMs) dayMs -= 864e5;
    const z = ms => TZ.wall(ms).slice(0, 16);
    const shifts = [0, 1, 2].map(i => ({label: z(dayMs + i * 288e5).slice(11) + '–' + z(dayMs + (i + 1) * 288e5).slice(11), from: z(dayMs + i * 288e5), to: z(dayMs + (i + 1) * 288e5)}));
    return {day: {label: '24 h', from: z(dayMs), to: z(dayMs + 864e5)}, shifts};
  }
  // 出入量：入量＝入量組的量；出量＝出量組的量（便以 g 計入）；尿量 mL/kg/h＝尿量 ÷ 劑量體重 ÷ 已過的小時數。
  function ioTotals(state, patient, period, nowAt, weightKg) {
    const items = itemsFor(state, patient), groupOf = Object.fromEntries(items.map(i => [i.key, i.group]));
    const from = TZ.millis(period.from), to = Math.min(TZ.millis(period.to), TZ.millis(nowAt));
    const obs = (state.observations || []).filter(o => o.p === patient.id && !o.voided && Number.isFinite(Number(o.value)) && o.value !== null && o.value !== '' && TZ.millis(o.at) >= from && TZ.millis(o.at) < TZ.millis(period.to) && TZ.millis(o.at) <= TZ.millis(nowAt));
    const sum = g => obs.filter(o => groupOf[o.kind] === g).reduce((n, o) => n + Number(o.value), 0);
    const intake = sum('intake'), output = sum('output'), urine = obs.filter(o => o.kind === 'Urine').reduce((n, o) => n + Number(o.value), 0);
    const hours = Math.max(0, (to - from) / 36e5);
    const urineRate = weightKg && hours > 0 ? Math.round(urine / weightKg / hours * 100) / 100 : null;
    return {intake, output, balance: intake - output, urine, urineRate, hours: Math.round(hours * 10) / 10};
  }
  const api = {GROUPS, ITEMS, byKey, BASIC, templateKeys, extraRows, itemsFor, dayStartOf, periods, ioTotals};
  if (typeof module !== 'undefined') module.exports = api; else root.ICUFlowsheet = api;
})(globalThis);
