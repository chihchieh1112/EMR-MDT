/* Vital signs tab (N03). 2026-11-08: read first, for the doctor on rounds.
   Top: stacked lanes — one lane per measurement on one shared time axis, each with its own scale; chips above pick the lanes
   (only items with values in the range appear; the choice is remembered per user via store.prefSave). Hovering or the arrow keys
   draw one line through every lane and read each lane's value at that moment with its own measurement time (trend.js).
   Below: intake and output, the nursing flowsheet (only rows with values in the range), and the growth chart (collapsed) with
   the body measurements table. Nurses record a column from a side panel. Labels are English keys; i18n.js translates them on
   screen. No imputation, no normal ranges, no self-judged abnormal colouring (N03). */
(function (root) {
  'use strict';

  const label = {'Temperature':'Temperature','Heart rate':'Heart rate','Respiratory rate':'Respiratory rate','Blood pressure':'Blood pressure','SpO₂':'SpO₂','Systolic BP':'SBP','Diastolic BP':'DBP','Weight':'Weight','Height':'Height','Head circumference':'Head circumference','Chest circumference':'Chest circumference'};
  const ranges = [['1d','1 day'],['3d','3 days'],['5d','5 days'],['7d','7 days'],['30d','1 month']];
  const defaultRange = '1d';
  const rangeKeys = ['Temperature','Heart rate','Respiratory rate','Blood pressure','SpO₂','TPR'];
  // Lanes: which flowsheet item types can be drawn, the default set, and the scale bases (common clinical span, widened by data).
  const LANE_TYPES = ['number','bp','volume','code'];
  const BASIC_LANES = ['Heart rate','Blood pressure','SpO₂','Respiratory rate','Temperature'];
  const FALLBACK_ITEMS = [['Heart rate','number','/min'],['Blood pressure','bp','mmHg'],['SpO₂','number','%'],['Respiratory rate','number','/min'],['Temperature','number','°C'],['Weight','number','kg']].map(([key, type, unit]) => ({key, type, unit, label: key, group: 'vitals'}));
  const SCALES = {'Temperature':[[35,41],0.5],'Heart rate':[[50,130],10],'Respiratory rate':[[10,30],5],'Blood pressure':[[40,140],20],'SpO₂':[[85,100],5]};
  const BODY = [['Weight','Weight (kg)'],['Height','Height (cm)'],['Head circumference','Head circumference (cm)'],['Chest circumference','Chest circumference (cm)']];
  const href = (route, changes) => '#'+new URLSearchParams({...route, ...changes}).toString();
  const C = () => root.ICUClinical;
  const tr = s => root.ICUi18n && root.ICUi18n.t ? root.ICUi18n.t(s) : s;
  const num = v => v === null || v === undefined || v === '' ? null : Number(v);

  // route.vitalRanges keeps the compact "key:range,key:range" form for old links; the sheet uses one range under the key TPR.
  function readRanges(route) {
    const map = {};
    String(route.vitalRanges || '').split(',').filter(Boolean).forEach(pair => {
      const [metric, range] = pair.split(':');
      if (rangeKeys.includes(metric) && ranges.some(([value]) => value === range)) map[metric] = range;
    });
    return map;
  }
  function sheetRange(route) {
    const map = readRanges(route);
    return map.TPR || rangeKeys.map(metric => map[metric]).find(Boolean) || defaultRange;
  }
  function writeRange(route, range) {
    const map = readRanges(route);
    rangeKeys.forEach(metric => delete map[metric]);
    map.TPR = range;
    return Object.entries(map).map(([key, value]) => key + ':' + value).join(',');
  }

  function handoverMarkers(ctx){const s=ctx.state;return [...[...new Set(Object.values(s.people).filter(a=>a.role==='nurse').map(a=>(C().shiftTimes(a)||[])[1]).filter(Boolean))].map(end=>({at:'2026-08-31T'+end.slice(0,5),name:'Shift end '+end})),...s.handovers.filter(h=>h.role==='nurse'&&(h.p===ctx.patient.id||(h.tasks||[]).some(t=>t.p===ctx.patient.id))).flatMap(h=>[{at:h.clinicalAt||h.at,name:'Handed over '+h.id},...s.receipts.filter(r=>r.handover===h.id).map(r=>({at:r.clinicalAt||r.at,name:'Received '+h.id}))])];}

  // ---- Lanes --------------------------------------------------------------------------------------------------------------
  // Items that can be a lane: this department's flowsheet numbers, blood pressure, volumes and options (text and medications are not drawn).
  function laneItems(state, patient) {
    const FS = root.ICUFlowsheet;
    const items = (FS ? FS.itemsFor(state, patient) : FALLBACK_ITEMS).filter(it => LANE_TYPES.includes(it.type));
    const rank = it => { const i = BASIC_LANES.indexOf(it.key); return i < 0 ? BASIC_LANES.length : i; };
    return items.map((it, i) => ({it, i})).sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i).map(x => x.it);
  }
  function laneObs(state, patient) {
    if (state.scenario === 'missing') return [];
    return state.observations.filter(o => o.p === patient.id && !o.voided && o.kind !== 'Admission weight');
  }
  // One point per measurement time; when the same item was recorded twice at one time, the last record wins.
  function lanePoints(it, obs) {
    const byAt = new Map();
    obs.filter(o => o.kind === it.key).sort((a, b) => C().millis(a.at) - C().millis(b.at)).forEach(o => byAt.set(o.at, o));
    const list = [...byAt.values()];
    if (it.type === 'bp') return list.filter(o => Array.isArray(o.components)).map(o => {
      const part = def => num((o.components.find(c => c.definition === def) || {}).value);
      return {at: o.at, sys: part('TDL.0094'), dia: part('TDL.0095')};
    });
    if (it.type === 'code') return list.filter(o => o.code).map(o => ({at: o.at, code: o.code, text: tr(((it.options || []).find(x => x[0] === o.code) || [, o.code])[1])}));
    return list.map(o => ({at: o.at, value: num(o.value)}));
  }
  const hasValue = (it, p) => it.type === 'bp' ? Number.isFinite(p.sys) && Number.isFinite(p.dia) : it.type === 'code' ? !!p.code : Number.isFinite(p.value);
  const pointText = (it, p) => it.type === 'bp' ? p.sys + '/' + p.dia : it.type === 'code' ? p.text : String(p.value);

  function selectedLanes(state, actorId) {
    const saved = state.prefs && state.prefs[actorId] && state.prefs[actorId].vitalLanes;
    return Array.isArray(saved) ? saved : BASIC_LANES.slice();
  }

  function lanesCard(ctx, bounds, range) {
    const {state, route, patient, esc, empty, badge} = ctx;
    const obs = laneObs(state, patient);
    const all = laneItems(state, patient).map(it => {
      const points = lanePoints(it, obs).filter(p => hasValue(it, p));
      const latest = points.at(-1);
      const scale = SCALES[it.key];
      return {it, points, inRange: points.filter(p => C().within(p.at, bounds)),
        lane: {key: it.key, name: it.label, unit: it.unit || '', kind: it.type, extra: !!it.extra, range: scale ? scale[0] : null, step: scale ? scale[1] : null, points,
          latest: latest ? {text: pointText(it, latest), at: latest.at} : null}};
    });
    const withData = all.filter(x => x.inRange.length);
    const chosen = selectedLanes(state, route.actor);
    const drawn = withData.filter(x => chosen.includes(x.it.key));
    // Chips: only items with values in this range; picks without values here ride along as hidden inputs so they are not lost.
    const shown = new Set(withData.map(x => x.it.key));
    const chips = withData.map(x => `<label class="lane-chip"><input type="checkbox" name="value" value="${esc(x.it.key)}"${chosen.includes(x.it.key) ? ' checked' : ''}><span${x.it.extra ? ' data-no-i18n' : ''}>${esc(x.it.label)}</span></label>`).join('');
    const kept = chosen.filter(k => !shown.has(k)).map(k => `<input type="hidden" name="value" value="${esc(k)}">`).join('');
    const picker = withData.length ? `<form class="lane-picker" data-form="prefSave" data-extra="${esc(JSON.stringify({key: 'vitalLanes'}))}"><span class="filter-label">Show</span>${chips}${kept}</form>` : '';
    const markers = route.showHandover === '0' ? [] : handoverMarkers(ctx);
    const times = new Set(drawn.flatMap(x => x.inRange.map(p => p.at)));
    const body = !withData.length
      ? empty('No values to plot in this range; absence is not normality.')
      : !drawn.length
        ? empty('Pick at least one item above to draw its lane.')
        : root.ICUTrend.drawLanes({lanes: drawn.map(x => x.lane), bounds, markers, mode: route.plot, label: 'Trends on one time axis; use the left and right arrow keys to read each time', latestLabel: 'Latest value'});
    const legend = drawn.length && markers.some(m => C().within(m.at, bounds)) ? `<p class="lane-legend"><span class="lane-legend-mark" aria-hidden="true"></span>Nursing shift boundary / handover</p>` : '';
    const rangeChips = ranges.map(([value, text]) => `<a class="filter-chip${range === value ? ' active' : ''}" data-keep-filter href="${esc(href(route, {vitalRanges: writeRange(route, value), record: ''}))}"${range === value ? ' aria-current="true"' : ''}>${esc(text)}</a>`).join('');
    const markerOn = route.showHandover !== '0';
    const markerChip = `<a class="filter-chip${markerOn ? ' active' : ''}" data-keep-filter href="${esc(href(route, {showHandover: markerOn ? '0' : '1', record: ''}))}"${markerOn ? ' aria-current="true"' : ''}>Nursing handover points</a>`;
    return `<section class="vital-card vital-lanes-card" id="vital-lanes">
      <header class="vital-head"><h2 class="vital-name">Trends</h2><div class="vital-range">${rangeChips}${markerChip}${badge(times.size + ' time points')}</div><div class="vital-actions">${recordPanel(ctx)}</div></header>
      ${picker}${body}${legend}</section>`;
  }

  // ---- Recording (nurse) --------------------------------------------------------------------------------------------------
  // One column of the flowsheet, saved at once from a side panel next to the lanes; the lanes update after saving.
  function recordPanel(ctx) {
    const {state, patient, actor, esc} = ctx, FS = root.ICUFlowsheet;
    if (!ctx.canNurse) return actor && actor.role === 'nurse' ? `<span class="vital-add-hint">Not this patient’s nurse — cannot add measurements</span>` : '';
    if (!FS || !ctx.form) return '';
    const items = FS.itemsFor(state, patient), nowAt = String(state.demoClock || '').slice(0, 16);
    const input = it => {
      if (it.type === 'bp') return `<label class="fs-in">${esc(it.label)}<span class="fs-bp"><input name="v:${esc(it.key)}:sys" type="number" min="0" inputmode="decimal" aria-label="SBP">/<input name="v:${esc(it.key)}:dia" type="number" min="0" inputmode="decimal" aria-label="DBP"></span></label>`;
      if (it.type === 'code') return `<label class="fs-in">${esc(it.label)}<select name="v:${esc(it.key)}"><option value="">—</option>${it.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`;
      if (it.type === 'text') return `<label class="fs-in">${esc(it.label)}<input name="v:${esc(it.key)}" maxlength="80"></label>`;
      const attr = it.attr ? `<select name="a:${esc(it.key)}" aria-label="${esc(it.label)}"><option value="">—</option>${it.attr.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>` : '';
      return `<label class="fs-in"><span${it.extra ? ' data-no-i18n' : ''}>${esc(it.label)}</span><span class="fs-num"><input name="v:${esc(it.key)}" type="number" step="${esc(it.step || 'any')}" inputmode="decimal"><small data-no-i18n>${esc(it.unit || '')}</small>${attr}</span></label>`;
    };
    const groups = FS.GROUPS.map(([g, title]) => { const list = items.filter(i => i.group === g && i.type !== 'mar'); return list.length ? `<fieldset class="fs-fieldset"><legend>${esc(title)}</legend><div class="fs-fields">${list.map(input).join('')}</div></fieldset>` : ''; }).join('');
    return `<details class="side-panel" id="vital-record"><summary class="button">Record this time</summary><div class="side-panel-sheet" role="region" aria-labelledby="vital-record-title"><header class="side-panel-head"><h2 id="vital-record-title">Record this time</h2><button type="button" class="tertiary" data-panel-close>Close</button></header><div class="side-panel-body">${ctx.form('flowsheetSave', `${ctx.field('at', 'Time', nowAt, 'datetime-local', 'required')}${groups}`, 'Save column')}</div></div></details>`;
  }

  // ---- Intake and output ---------------------------------------------------------------------------------------------------
  // Three 8-hour shifts and 24 h from the hospital-wide day start; urine per kg uses the dosing weight.
  function ioCard(ctx) {
    const {state, patient, esc, source} = ctx, FS = root.ICUFlowsheet;
    if (!FS) return '';
    const nowAt = String(state.demoClock || '').slice(0, 16), per = FS.periods(state, nowAt), dw = root.ICUMasterSchema && root.ICUMasterSchema.dosingWeight ? root.ICUMasterSchema.dosingWeight(state, patient.id) : null;
    const cols = [...per.shifts, per.day], tot = cols.map(p => FS.ioTotals(state, patient, p, nowAt, dw ? dw.kg : null));
    const table = `<div class="table-wrap"><table class="dense-table fs-io"><thead><tr><th scope="col">Intake and output</th>${cols.map(p => `<th scope="col" data-no-i18n>${esc(p.label)}</th>`).join('')}</tr></thead><tbody>`
      + [['Total intake (mL)', t => t.intake], ['Total output (mL)', t => t.output], ['Balance (mL)', t => (t.balance > 0 ? '+' : '') + t.balance], ['Urine (mL/kg/h)', t => t.urineRate === null ? '—' : t.urineRate]]
        .map(([l, f]) => `<tr><th scope="row">${esc(l)}</th>${tot.map(t => `<td data-no-i18n>${esc(f(t))}</td>`).join('')}</tr>`).join('')
      + `</tbody></table></div>`;
    return `<article class="vital-card io-card" id="vital-io"><header class="vital-head"><h2 class="vital-name">Intake and output</h2>${source('Day starts at ' + FS.dayStartOf(state) + '; urine per kg uses the dosing weight' + (dw ? ' ' + dw.kg + ' kg' : ' (none recorded)') + '.')}</header>${table}</article>`;
  }

  // ---- Nursing flowsheet (hospital form I-D-01-003) ------------------------------------------------------------------------
  // Items as rows, times as columns (oldest left); only rows with values in the range are listed, so the sheet stays as long as the
  // patient's actual monitoring. The medication rows come from the administration record, read-only.
  function nursingFlowsheet(ctx, bounds) {
    const {state, patient, actors, esc, empty} = ctx, FS = root.ICUFlowsheet;
    if (!FS) return '';
    const items = FS.itemsFor(state, patient), keys = new Set(items.map(i => i.key));
    const obs = state.scenario === 'missing' ? [] : state.observations.filter(o => o.p === patient.id && !o.voided && keys.has(o.kind) && C().within(o.at, bounds));
    const mar = items.some(i => i.type === 'mar') ? (state.executions || []).filter(e => e.p === patient.id && e.status === 'done' && C().within(e.at, bounds)) : [];
    const times = [...new Set([...obs.map(o => o.at), ...mar.map(e => e.at)])].sort((a, b) => C().millis(a) - C().millis(b));
    const opt = (list, code) => ((list || []).find(o => o[0] === code) || [, code])[1];
    const cell = (it, at) => {
      if (it.type === 'bp') { const o = obs.filter(x => x.kind === 'Blood pressure' && x.at === at).at(-1); return o && o.components ? `<span data-no-i18n>${esc(o.components.map(c => c.value).join('/'))}</span>` : ''; }
      const o = obs.filter(x => x.kind === it.key && x.at === at).at(-1); if (!o) return '';
      if (it.type === 'code') return `<span>${esc(opt(it.options, o.code))}</span>`;
      if (it.type === 'text') return `<span data-no-i18n>${esc(o.text)}</span>`;
      return `<span data-no-i18n>${esc(o.value)}</span>${o.attr ? ` <small>${esc(opt(it.attr, o.attr))}</small>` : ''}`;
    };
    const head = `<tr><th scope="col" class="fs-item">Item</th>${times.map(t => `<th scope="col" class="fs-time" data-no-i18n>${esc(String(t).slice(5, 16).replace('T', ' '))}</th>`).join('')}</tr>`;
    const rows = FS.GROUPS.map(([g, title]) => {
      let body = '';
      items.filter(i => i.group === g).forEach(it => {
        if (it.type === 'mar') {
          const orders = [...new Set(mar.map(e => e.order))].map(id => (state.orders || []).find(o => o.id === id)).filter(Boolean);
          body += orders.map(o => `<tr class="fs-mar"><th scope="row" class="fs-item"><span data-no-i18n>${esc(o.name)}</span></th>${times.map(t => { const e = mar.find(x => x.order === o.id && x.at === t); return `<td>${e ? `<span data-no-i18n>${esc(e.actual && e.actual.dose ? e.actual.dose : '✓')}</span>` : ''}</td>`; }).join('')}</tr>`).join('');
          return;
        }
        if (!obs.some(o => o.kind === it.key)) return;
        body += `<tr><th scope="row" class="fs-item"><span${it.extra ? ' data-no-i18n' : ''}>${esc(it.label)}</span>${it.unit ? ` <small data-no-i18n>${esc(it.unit)}</small>` : ''}</th>${times.map(t => `<td>${cell(it, t)}</td>`).join('')}</tr>`;
      });
      return body ? `<tr class="fs-group"><th scope="rowgroup" colspan="${times.length + 1}">${esc(title)}</th></tr>${body}` : '';
    }).join('');
    const who = t => [...new Set([...obs.filter(o => o.at === t).map(o => o.actor), ...mar.filter(e => e.at === t).map(e => e.actor)])].map(a => (actors[a] || {}).name || 'Recorder not supplied').join(', ');
    const nurseRow = `<tr class="fs-nurse"><th scope="row" class="fs-item">Recorded by</th>${times.map(t => `<td data-no-i18n>${esc(who(t))}</td>`).join('')}</tr>`;
    const grid = times.length ? `<div class="table-wrap fs-wrap"><table class="dense-table fs-grid"><thead>${head}</thead><tbody>${rows}${nurseRow}</tbody></table></div>` : empty('No flowsheet values in this range; absence is not normality.');
    let actions = '';
    if (ctx.canNurse && ctx.form) actions = `<details class="vital-add fs-row-add"><summary class="button secondary">Add intake or output row</summary><div class="vital-add-panel">${ctx.form('flowsheetRowAdd', `${ctx.field('label', 'Row name', '', 'text', 'required')}<label>Group<select name="group"><option value="output">Output</option><option value="intake">Intake</option></select></label><label>Unit<select name="unit"><option value="mL">mL</option><option value="g">g</option></select></label>`, 'Add row')}</div></details>${voidEntries(ctx)}`;
    return `<article class="vital-card fs-card" id="vital-flowsheet"><header class="vital-head"><h2 class="vital-name">Nursing flowsheet</h2><div class="vital-actions">${actions}</div></header>${grid}</article>`;
  }

  // Void (2026-10-24, C2): nurses list and void only what they entered; voided values leave the lanes, flowsheet, growth chart and
  // dosing weight, and can be restored from the Medical record tab.
  function voidEntries(ctx) {
    const {state, patient, route, esc} = ctx, W = root.ICUWorkflow;
    if (!ctx.canNurse || !W || W.archiveState(state, patient.id) !== 'open') return '';
    const mine = state.observations.filter(o => o.p === patient.id && o.actor === route.actor && !o.voided && o.kind !== 'Admission weight').sort((a, b) => C().millis(b.at) - C().millis(a.at)).slice(0, 30);
    if (!mine.length) return '';
    const value = o => o.components ? o.components.map(x => x.value).join('/') : o.code || o.text || o.value;
    const choices = mine.map(o => `<option value="${esc(o.id)}">${esc(String(o.at).replace('T', ' '))} · ${esc(label[o.kind] || o.kind)} · ${esc(value(o))} ${esc(o.unit || '')}</option>`).join('');
    return `<details class="vital-void"><summary class="button secondary">Void a measurement I entered</summary><div class="vital-add-panel"><p class="source">Only for a value entered in error. Voided measurements are kept and can be restored from the Medical record tab until the record is completed for archiving.</p>${ctx.form('voidRecord', `<div class="vital-void-grid"><label>Measurement<select name="id" required>${choices}</select></label>${ctx.field('reason', 'Reason for voiding', '', 'text', 'required')}</div>`, 'Void', {kind: 'observation', p: patient.id})}</div></details>`;
  }

  // ---- Growth chart and body measurements (collapsed) ---------------------------------------------------------------------
  // Weight, height and head circumference by age over the whole history (not the lanes' range); only the patient's own points,
  // no percentiles. Admission weight is not a measurement. The body measurements table lists every weight, height, head and chest
  // circumference with its recorder; chest circumference is listed here only.
  const GROWTH = [['Weight', '#047e5c'], ['Height', '#8d5702'], ['Head circumference', '#5c4493']];
  function bodyTable(ctx) {
    const {state, patient, actors, esc} = ctx;
    const obs = state.scenario === 'missing' ? [] : state.observations.filter(o => o.p === patient.id && !o.voided && BODY.some(([kind]) => kind === o.kind));
    if (!obs.length) return '';
    const map = new Map();
    obs.forEach(o => { const row = map.get(o.at) || {at: o.at, items: [], byKind: {}}; row.items.push(o); row.byKind[o.kind] = o; map.set(o.at, row); });
    const rows = [...map.values()].sort((a, b) => C().millis(b.at) - C().millis(a.at)).map(row => {
      const people = [...new Set(row.items.map(item => actors[item.actor]?.name || 'Recorder not supplied'))].join(', ') + (row.items.some(item => item.entry === 'intake') ? ' · ' + 'Entered as entry data' : '');
      return `<tr><td class="col-date">${esc(row.at.replace('T', ' '))}</td>
        ${BODY.map(([kind]) => `<td class="col-num">${row.byKind[kind] ? esc(row.byKind[kind].value ?? 'missing') : '<span class="muted">—</span>'}</td>`).join('')}
        <td>${esc(people)}</td></tr>`;
    }).join('');
    return `<h3 class="vital-flow-title">Body measurements</h3><div class="table-wrap vital-flow-wrap"><table class="dense-table vital-flow"><thead><tr><th scope="col">Time</th>${BODY.map(([, text]) => `<th scope="col">${text}</th>`).join('')}<th scope="col">Recorded by</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function bodyEntry(ctx) {
    const {esc, state} = ctx;
    if (!ctx.canNurse || !ctx.form) return '';
    const nowAt = String(state.demoClock || '').slice(0, 16) || '2026-08-31T09:00';
    const f = (name, text, unit, step) => `<label class="vital-add-field">${esc(text)}<span class="vital-add-input"><input name="${name}" type="number" min="0" step="${step}" inputmode="decimal"><small>${esc(unit)}</small></span></label>`;
    return `<details class="vital-add"><summary class="button secondary">Add body measurement</summary><div class="vital-add-panel">${ctx.form('measureSet', `<div class="vital-add-grid">${ctx.field('at', 'Measured at', nowAt, 'datetime-local', 'required')}${f('weight', 'Weight', 'kg', '0.1')}${f('height', 'Height', 'cm', '0.1')}${f('headCircumference', 'Head circumference', 'cm', '0.1')}${f('chestCircumference', 'Chest circumference', 'cm', '0.1')}</div>`, 'Save measurement')}</div></details>`;
  }
  function growthCard(ctx) {
    const {state, patient, esc, empty, badge} = ctx;
    const born = C().millis(String(patient.birthDate || '') + 'T00:00');
    const obs = state.scenario === 'missing' ? [] : state.observations.filter(o => o.p === patient.id && !o.voided && GROWTH.some(([kind]) => kind === o.kind));
    const body = !Number.isFinite(born) ? empty('Date of birth not supplied; the growth chart needs age.')
      : root.ICUTrend.drawGrowth({born, panels: GROWTH.map(([kind, color]) => ({name: label[kind], unit: C().units[kind], color, points: obs.filter(o => o.kind === kind).map(o => ({at: o.at, value: o.value}))}))});
    const w = C().latestMeasure(state, patient.id, 'Weight'), h = C().latestMeasure(state, patient.id, 'Height'), bmi = state.scenario === 'missing' || !w || !h ? null : C().bmi(w.value, h.value);
    const bmiText = bmi === null ? `<span class="growth-bmi">BMI <b>—</b><small>${esc(tr('Needs a weight and a height'))}</small></span>`
      : `<span class="growth-bmi">BMI <b data-no-i18n>${esc(bmi)} kg/m²</b><small data-no-i18n>${esc(tr('Weight'))} ${esc(w.value)} kg · ${esc(String(w.at).replace('T', ' '))} / ${esc(tr('Height'))} ${esc(h.value)} cm · ${esc(String(h.at).replace('T', ' '))}</small></span>`;
    return `<details class="vital-card growth-card" id="vital-growth"><summary class="vital-head growth-summary"><span class="vital-headline"><span class="vital-name">Growth chart</span>${bmiText}</span>${badge(obs.length + ' readings')}</summary>${body}${bodyTable(ctx)}<div class="vital-actions">${bodyEntry(ctx)}</div></details>`;
  }

  root.ICUPatientViews.register('vitals', function (ctx) {
    const {route} = ctx;
    const range = sheetRange(route);
    const bounds = C().bounds(range);
    return `<section class="vital-list">
        ${lanesCard(ctx, bounds, range)}
        ${ioCard(ctx)}
        ${nursingFlowsheet(ctx, bounds)}
        ${growthCard(ctx)}
      </section>`;
  });
})(globalThis);
