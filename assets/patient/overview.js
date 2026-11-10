/* Patient overview (2026-09-14 R7; own tab since 2026-10-23): latest vital signs, care team, safety facts, the key care timeline (newest first),
   cross-specialty work and handover, and one recent clinical-orders table. Identity and admission facts live in the shared patient pin (2026-10-24). Labels are English keys; i18n.js translates them on screen. */
(function (root) {
  'use strict';
  // 近一個月的就醫與照護日程：門診、急診、手術，以及轉入 ICU（開案）。
  // 值都是虛構展示資料；D–J 由入院日推算，讓每位病人打開都看得到完整日程。
  const timelines = {
    A: [
      ['2026-08-26 10:20', 'Outpatient', 'Cardiac surgery clinic assessment'],
      ['2026-08-30 08:40', 'Emergency', 'Emergency assessment for pre-operative deterioration'],
      ['2026-08-30 13:40', 'Surgery', 'Surgery completed, moved to recovery'],
      ['2026-08-30 18:10', 'ICU admission', 'Transferred to CICU after surgery — episode opened']
    ],
    B: [
      ['2026-08-28 14:10', 'Outpatient', 'Respiratory clinic follow-up'],
      ['2026-08-30 15:20', 'Emergency', 'Admitted after assessment for dyspnoea'],
      ['2026-08-30 20:00', 'ICU admission', 'Transferred to CICU for respiratory support — episode opened']
    ],
    C: [
      ['2026-08-29 09:30', 'Outpatient', 'Paediatric clinic assessment'],
      ['2026-08-30 17:15', 'Inpatient', 'Transferred to CICU after ward assessment'],
      ['2026-08-30 21:10', 'ICU admission', 'CICU episode opened']
    ]
  };
  const shift = (day, days, time) => {
    const base = root.ICUTimeZone.millis(day + 'T00:00:00');
    if (!Number.isFinite(base)) return '';
    return root.ICUTimeZone.wall(base - days * 86400000).slice(0, 10) + ' ' + time;
  };
  // 示範用的門診與急診：相對於入院日往前推，因此每位病人都落在近一個月內。
  const clinicPlan = [[5, '10:40', 'Outpatient', 'Specialty clinic follow-up'], [0, '07:30', 'Emergency', 'Emergency assessment before admission']];

  root.ICUPatientTimelineData = timelines;
  // 認列的病人沒有示範時程表：由登錄資料整理門診、急診、入院、手術與轉入 ICU。
  // 每個事件都給明確時刻才能正確排序；轉入 ICU 排在手術之後（術後才進 ICU）。
  function derivedTimeline(patient, state) {
    const out = [], t = v => String(v || '').replace('T', ' ');
    // 手術取病人頁手動登錄的最近一次手術紀錄（2026-09-26 起沒有手術室來源）；舊資料的 patient.surgery 仍讀得到。
    const records = (state.surgeries || []).filter(x => x.p === patient.id && !x.voided && x.performedAt && !(state.surgeries || []).some(y => y.replaces === x.id));
    const last = records.sort((a, b) => String(a.performedAt).localeCompare(String(b.performedAt))).at(-1);
    const sg = patient.surgery || (last ? {start: last.performedAt, procedure: last.procedure} : null);
    const admitted = patient.admitted || '';
    if (!admitted) return out;
    clinicPlan.forEach(([days, time, kind, title]) => { const at = shift(admitted, days, time); if (at) out.push([at, kind, title]); });
    out.push([admitted + ' 08:30', 'Inpatient', 'Admission registered' + (patient.department ? ' (' + patient.department + ')' : '')]);
    const surgeryStart = (sg && sg.start) ? t(sg.start) : patient.surgeryDate ? patient.surgeryDate + ' 09:00' : '';
    if (surgeryStart) out.push([surgeryStart, 'Surgery', ((sg && sg.procedure) || 'Surgery') + (sg && sg.end ? ', ended ' + t(sg.end).slice(11, 16) : '')]);
    const icuArrival = (sg && sg.icuArrival) ? t(sg.icuArrival) : patient.admittedAt ? t(patient.admittedAt) : (surgeryStart.slice(0, 10) || admitted) + ' 18:00';
    // 2026-10-31 全院：接收的那一科；ICU 照舊叫 ICU admission。
    out.push([icuArrival, patient.department && patient.department !== 'ICU' ? 'Ward admission' : 'ICU admission', 'Received into ' + (patient.department || 'ICU') + ' \u2014 episode opened']);
    return out.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }
  const href = (route, changes) => '#'+new URLSearchParams({...route, ...changes}).toString();

  // Every overview card collapses from its own title row.
  function quadCard(title, summaryExtra, body, opts) {
    const o = opts || {};
    return `<section class="card quad-card${o.accent ? ' accent' : ''}"><details${o.open === false ? '' : ' open'} class="quad-details quad-card-details"><summary><span class="quad-title">${title}</span>${summaryExtra || ''}</summary>${body}</details></section>`;
  }

  // 卡片裡的動作一律是次要按鈕；整頁只有置頂列的「新增醫囑」是實心主色（2026-11-01 設計系統）。
  const quiet = html => String(html).replace('<button type="submit">', '<button type="submit" class="secondary compact-button">');
  // 特殊註記（2026-10-31）：一筆一列，寫開始、天數與登錄者；照護醫護可結束與新增，DNR 只有醫師。
  function flagPills(ctx, patient) {
    const {esc, state, route} = ctx, W = root.ICUWorkflow, lang = root.ICUi18n && root.ICUi18n.lang ? root.ICUi18n.lang() : 'en';
    const list = W.activeFlags(state, patient.id), may = W.canWrite(state, patient.id, route.actor) || W.canNurse(state, patient.id, route.actor), doctor = W.canWrite(state, patient.id, route.actor);
    const now = String(state.demoClock || '').slice(0, 16), people = state.people || {};
    const rows = list.map(f => { const v = W.flagView(state, f, lang); const end = may && ctx.form && (f.code !== 'DNR' || doctor) ? quiet(ctx.form('flagEnd', `<input type="hidden" name="id" value="${esc(f.id)}"><input type="hidden" name="end" value="${esc(now)}">`, 'End marker')) : '';
      return `<li class="flag-row"><span class="flag-pill tone-${esc(v.tone)}"><span data-no-i18n>${esc(v.label)}</span>${v.day ? ` <small>${esc('Day ' + v.day)}</small>` : ''}</span><span class="source" data-no-i18n>${esc(String(f.start || '').replace('T', ' '))} · ${esc(f.recordedBy ? (people[f.recordedBy] || {}).name || f.recordedBy : 'HIS')}</span>${end}</li>`; }).join('');
    const M = root.ICUMasterSchema, options = M ? M.clinicalOptions(state, 'patient_flag', []).filter(o => !list.some(f => f.code === o.id) && (o.id !== 'DNR' || doctor)) : [];
    const add = may && ctx.form && options.length ? `<details class="flag-add"><summary class="button secondary">Add special marker</summary>${ctx.form('flagAdd', `<label>Special marker<select name="code" required data-no-i18n><option value="">—</option>${options.map(o => `<option value="${esc(o.id)}">${esc(M.clinicalOptionText(state, o.id, lang))}</option>`).join('')}</select></label>${ctx.field ? ctx.field('start', 'Started at', now, 'datetime-local', 'required') : ''}`, 'Save special marker')}</details>` : '';
    return (list.length ? `<ul class="flag-list">${rows}</ul>` : '<span class="flag-none">No special markers recorded (not a statement of no risk)</span>') + add;
  }
  // 過敏（2026-10-31）：一筆一列標來源（HIS 或 Smart Ward 與登錄者）；照護醫護可補登或確認無已知過敏。
  function allergyBlock(ctx, patient) {
    const {esc, state, route} = ctx, W = root.ICUWorkflow, people = state.people || {}, may = (W.canWrite(state, patient.id, route.actor) || W.canNurse(state, patient.id, route.actor)) && ctx.form;
    const list = (patient.allergies || []).filter(a => a.clinicalStatus === 'active');
    const rows = list.map(a => `<li><span data-no-i18n>${esc(a.code.text)} (${esc(a.reaction && a.reaction.manifestation || '')})</span> <small class="source" data-no-i18n>${esc(a.source === 'Smart Ward' ? 'Smart Ward · ' + ((people[a.recorder] || {}).name || '') : 'HIS')}</small></li>`).join('');
    const body = list.length ? `<ul class="allergy-list">${rows}</ul>` : `<p class="allergy-line">${esc(patient.allergy)}${patient.allergyConfirmedBy ? ` <small class="source" data-no-i18n>${esc((people[patient.allergyConfirmedBy] || {}).name || '')}</small>` : ''}</p>`;
    const add = may ? `<details class="allergy-add"><summary class="button secondary">Add allergy</summary>${ctx.form('allergySave', `${ctx.field('substance', 'Allergen', '', 'text', 'required')}${ctx.field('reaction', 'Reaction', '', 'text', '')}<label>Severity<select name="severity"><option value="mild">Mild</option><option value="moderate" selected>Moderate</option><option value="severe">Severe</option></select></label>`, 'Save allergy')}</details>${list.length || patient.allergyStatus === 'none-known' ? '' : quiet(ctx.form('allergyNone', '', 'Confirm no known allergies'))}` : '';
    return `<div class="allergy-block"><strong>Allergies and key warnings:</strong>${body}${add}</div>`;
  }
  // 2026-11-08：特殊註記與過敏的明細、結束、新增與補登移到置頂列（點標籤展開），每個分頁都用得到；這裡只提供畫法。
  root.ICUPatientSafety = {flagPills, allergyBlock};

  // 近期臨床摘要：醫囑內容、執行頻率、分類、執行過的人員。檢驗檢查本身就是醫囑的一種，同一張表列出。
  const categoryOf = order => order.kind === 'medication' ? 'Medication' : order.catalog?.isLab ? 'Lab' : order.kind === 'care' ? 'Care' : 'Procedure / imaging';
  function clinicalOrders(ctx, limit) {
    const {state, patient, actors, route, esc, badge, empty} = ctx;
    const all = state.orders.filter(order => order.p === patient.id).sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')));
    if (!all.length) return empty('No orders recorded for this patient yet.');
    // 體重更新後回看（2026-10-22）：和開立視窗同一條參考列，護理師量完體重後在這裡看得到；不重算、不要求處理。
    const S = root.ICUMasterSchema || (typeof module !== 'undefined' ? require('../master-schema.js') : null), recheck = S && S.weightRecheck ? S.weightRecheck(state, patient.id) : null;
    const recheckNote = recheck && recheck.orders.length ? `<details class="rx-line tone-low rx-recheck" data-rx-recheck open><summary><strong class="rx-level">Info</strong><span class="rx-kind">${esc(S.weightRecheckText(recheck))}</span></summary><ul>${recheck.orders.map(o => `<li>${esc(o.name + ' · ' + o.dose + ' (ordered at ' + o.previous.kg + ' kg): ')}${o.over.map(x => `<span class="rx-recheck-over">${esc(x.label)}</span> — <span data-no-i18n>${esc(x.detail)}</span>`).join('; ')}</li>`).join('')}</ul><p class="source">Existing orders are not recalculated; review them when you next prescribe.</p></details>` : '';
    const shown = all.slice(0, limit);
    const rows = shown.map(order => {
      const runs = state.executions.filter(item => item.order === order.id);
      const people = [...new Set(runs.map(item => actors[item.actor]?.name).filter(Boolean))];
      const target = href(route, {view: 'otherOrders', orderKind: 'all', record: order.id});
      return `<tr><td><a href="${esc(target)}"><strong>${esc(order.catalog?.zh || order.name)}</strong></a><small class="order-instruction">${esc((order.dose || 'dose not supplied') + ' · ' + (order.route || 'route not supplied'))}</small></td>
        <td>${esc(order.frequency || 'not supplied')}</td>
        <td>${badge(categoryOf(order))}</td>
        <td>${people.length ? esc(people.join(', ')) : '<span class="muted">No one has performed it yet</span>'}</td></tr>`;
    }).join('');
    return recheckNote + `<div class="table-wrap"><table class="dense-table"><thead><tr><th scope="col">Order</th><th scope="col">Frequency</th><th scope="col">Category</th><th scope="col">Performed by</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + (all.length > shown.length ? `<p class="source">Showing the ${shown.length} most recent of ${all.length}; the full list is on the Orders tab.</p>` : '');
  }

  // 最近一次生命徵象（2026-10-23 拆頁）：每項取最新一筆與其時間，不受範圍限制、不判異常；圖與流程表在 Vital signs 分頁。
  const VITAL_KEYS = [['Temperature', 'T'], ['Heart rate', 'P'], ['Respiratory rate', 'R'], ['Blood pressure', 'BP'], ['SpO₂', 'SpO₂'], ['Weight', 'Weight']];
  function latestVitals(ctx) {
    const {state, patient, esc, empty, link} = ctx;
    const C = root.ICUClinical, open = link('bedside', 'Open vital signs');
    if (state.scenario === 'missing') return `<section class="overview-vitals" aria-label="Latest vital signs"><span class="filter-label">Latest vital signs</span>${empty('Source missing: vitals for this period not available; do not treat as no abnormality.')}${open}</section>`;
    const flat = C.flatten(state.observations.filter(o => o.p === patient.id && !o.voided && o.kind !== 'Admission weight'));
    const newest = kind => flat.filter(o => o.kind === kind).sort((a, b) => C.millis(b.at) - C.millis(a.at))[0];
    const items = VITAL_KEYS.map(([kind]) => {
      if (kind !== 'Blood pressure') { const o = newest(kind); return o ? {at: o.at, text: (o.value ?? '—') + ' ' + (C.units[kind] || o.unit || '')} : null; }
      const sys = newest('Systolic BP'); if (!sys) return null;
      const dia = flat.find(o => o.kind === 'Diastolic BP' && (sys.sourceId ? o.sourceId === sys.sourceId : o.at === sys.at));
      return {at: sys.at, text: (sys.value ?? '—') + '/' + (dia?.value ?? '—') + ' mmHg'};
    });
    const chips = items.map((it, i) => `<span class="ov-vital"><b>${esc(VITAL_KEYS[i][1])}</b>${it ? `<span data-no-i18n>${esc(it.text.trim())}</span><small data-no-i18n>${esc(String(it.at).slice(5, 16).replace('T', ' '))}</small>` : '<span class="muted">—</span>'}</span>`).join('');
    return `<section class="overview-vitals" aria-label="Latest vital signs"><span class="filter-label">Latest vital signs</span>${items.some(Boolean) ? chips : empty('No vital signs recorded yet; absence is not normality.')}${open}</section>`;
  }

  // 病人與住院資料（2026-10-27）：HIS 帶進來的行政資料（3.1 病人、3.3 轉入、3.7 健保），唯讀；沒給的寫「HIS 未提供」。
  // 入院來源照 D7 §4.2（FHIR admit-source；self 是我方補的代碼）。
  const ADMIT_SOURCES = {'hosp-trans': 'Referred from another facility', self: 'Self-presented', emd: 'From the emergency department', outp: 'From an outpatient clinic', other: 'Other'};
  const ENTRY_POINTS = {EMERGENCY: 'Emergency department', OUTPATIENT: 'Outpatient clinic', DIRECT: 'Directly to the treating department'};
  const PATIENT_TYPES = {BHYT: 'Health insurance (BHYT)', SELF_PAY: 'Self-pay', FREE: 'Exempt', OTHER: 'Other'};
  function hisCard(ctx, patient) {
    const {esc, empty, badge} = ctx, missing = '<span class="muted">Not provided by HIS</span>';
    const val = x => x === null || x === undefined || x === '' ? missing : `<span data-no-i18n>${esc(x)}</span>`;
    const coded = (map, x) => x ? esc(map[x] || x) : missing;
    const dl = rows => `<dl class="his-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
    const demo = patient.demographics || {}, people = patient.relatedPersons, cov = patient.coverage;
    const stay = dl([['Admitted to hospital', val(patient.admissionTime && patient.admissionTime.replace('T', ' '))], ['Entered this department', val((patient.departmentEntryTime || patient.icuEntryTime) && (patient.departmentEntryTime || patient.icuEntryTime).replace('T', ' '))],
      ['Admission source', coded(ADMIT_SOURCES, patient.admitSource)], ['Entry point', coded(ENTRY_POINTS, patient.entryPoint)],
      ['Admissions for this condition', val(patient.admissionCountForCondition)], ['Archive no.', val(patient.archiveId)]]);
    const moves = (patient.locations || []).length > 1 ? `<h4>Bed history in this department</h4><ol class="his-moves">${patient.locations.map(x => `<li data-no-i18n>${esc(String(x.from || '').replace('T', ' '))} · ${esc(x.ward)} · ${esc(x.bed)}</li>`).join('')}</ol>` : '';
    const person = dl([['Ethnicity', val(demo.ethnicity)], ['Nationality', val(demo.nationality)], ['Occupation', val(demo.occupation)], ['Address', val(demo.address)], ['Phone', val(demo.telecom)]]);
    const family = Array.isArray(people) ? (people.length ? `<div class="table-wrap"><table class="dense-table"><thead><tr><th scope="col">Name</th><th scope="col">Relationship</th><th scope="col">Phone</th><th scope="col">Occupation</th><th scope="col">Education</th></tr></thead><tbody>${people.map(x => `<tr><td>${val(x.name)}</td><td>${val(x.relationship)}</td><td>${val(x.telecom)}</td><td>${val(x.occupation)}</td><td>${val(x.educationLevel)}</td></tr>`).join('')}</tbody></table></div>` : empty('HIS sent no family contacts.')) : `<p>${missing}</p>`;
    const cards = cov ? `<p><b>${esc('Patient type')}</b> ${coded(PATIENT_TYPES, cov.patientType)}</p>${(cov.coverages || []).length ? `<div class="table-wrap"><table class="dense-table"><thead><tr><th scope="col">Card number</th><th scope="col">Benefit</th><th scope="col">Valid</th><th scope="col">Registered facility</th><th scope="col">Status</th></tr></thead><tbody>${cov.coverages.map(x => `<tr><td>${val(x.coverageNumber)}</td><td data-no-i18n>${esc(x.coverageBenefitRate)}%</td><td data-no-i18n>${esc(x.coverageStartDate)} – ${esc(x.coverageEndDate)}</td><td>${val(x.coverageRegisteredFacility)}</td><td>${esc(String(x.coverageStatus) === '1' ? 'Active' : 'Inactive')}</td></tr>`).join('')}</tbody></table></div>` : empty('No insurance card on record.')}` : `<p>${missing}</p>`;
    // 收合時標題下一行摘要：入院來源、對象、第一位家屬聯絡人（2026-11-01）。
    const first = Array.isArray(people) && people[0], gist = [patient.admitSource ? `<span>${esc(ADMIT_SOURCES[patient.admitSource] || patient.admitSource)}</span>` : '', cov && cov.patientType ? `<span>${esc(PATIENT_TYPES[cov.patientType] || cov.patientType)}</span>` : '', first && first.name ? `<span data-no-i18n>${esc(first.name + (first.relationship ? ' (' + first.relationship + ')' : ''))}</span>` : ''].filter(Boolean);
    return quadCard('Patient and admission data', badge('HIS') + (gist.length ? `<span class="quad-summary">${gist.join('<i aria-hidden="true">·</i>')}</span>` : `<span class="quad-summary muted">Not provided by HIS</span>`), `<div class="his-grid"><section><h4>Admission</h4>${stay}${moves}</section><section><h4>Patient</h4>${person}</section></div><h4>Family contacts</h4>${family}<h4>Insurance</h4>${cards}`, {open: false});
  }
  // 依階段列診斷：轉診單位、門急診由 HIS 帶入；入院、入 ICU、轉出、出院取診斷登錄（入院沒有登錄時取 HIS 入院診斷）。
  function stagedDiagnoses(ctx, patient) {
    const {state, esc} = ctx, dx = (state.diagnoses || []).filter(x => x.p === patient.id && x.active);
    const fromStage = stage => dx.filter(x => x.stage === stage).sort((a, b) => (a.rank === 'primary' ? -1 : 1) - (b.rank === 'primary' ? -1 : 1)).map(x => x.diagnosis.code + ' ' + (x.diagnosis.english || x.diagnosis.name));
    const his = x => x ? [x.code + ' ' + x.name + (x.facility ? ' (' + x.facility + ')' : '')] : [];
    const rows = [['Referring facility', his(patient.referralDiagnosis)], ['Outpatient / emergency', his(patient.emergencyDiagnosis)],
      ['Hospital admission', fromStage('admission').length ? fromStage('admission') : patient.icd ? [patient.icd.code + ' ' + (patient.icd.english || patient.icd.name)] : []],
      ['This department', fromStage('icu')], ['Transfer out', fromStage('transfer')], ['Discharge', fromStage('discharge')]];
    // 2026-11-08：只列有資料的階段，不再一排「—」。
    const shown = rows.filter(([, list]) => list.length);
    return shown.length ? `<dl class="dx-stages">${shown.map(([k, list]) => `<div><dt>${esc(k)}</dt><dd>${list.map(t => `<span data-no-i18n>${esc(t)}</span>`).join('<br>')}</dd></div>`).join('')}</dl>` : '<p class="muted dx-none">No diagnosis recorded yet</p>';
  }

  root.ICUPatientViews.register('overview', function (ctx) {
    const {patient, state, esc, badge, empty, link, helpers} = ctx;
    // 重要照護日程（2026-10-24）：最新的在最上面，和病人時間軸同一個方向。
    const events = (timelines[patient.id] || derivedTimeline(patient, state)).slice().sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    const summaries = root.ICUPatientCareSummaries || {};

    // 2026-11-08 依層級重排：身分、警示與照護團隊在置頂列；這裡由上往下是「上一班之後」（最新生命徵象、交班），
    // 現在在做的事（近期臨床醫囑，主欄）與住院經過（有資料的診斷階段、重要事件，側欄），最下面收合行政資料與跨科溝通。
    return `<section class="overview-now" aria-label="Since the last shift">${latestVitals(ctx)}
      <div class="overview-handover"><span class="filter-label">Handover</span><div class="overview-handover-list">${helpers.handoverNotes()}</div>${link('handover', 'Open shift handover')}</div></section>
    <div class="overview-layout">
      <div class="overview-main">
        ${root.ICUMdtDemo ? root.ICUMdtDemo.overviewCard(ctx) : ''}
        ${quadCard('Recent clinical orders', badge(state.orders.filter(order => order.p === patient.id).length + ' orders'), clinicalOrders(ctx, 10))}
      </div>
      <div class="overview-side">
        ${quadCard('Hospital course', badge(events.length + ' events'), `
          ${stagedDiagnoses(ctx, patient)}
          <ol class="clinical-timeline flat">${events.map(([at, kind, title]) => `<li><time>${esc(at)}</time><div class="row"><strong>${esc(title)}</strong>${badge(kind, kind === 'Emergency')}</div></li>`).join('') || empty('No clinical timeline recorded for this episode.')}</ol><div class="row">${link('timeline', 'Open full timeline', {tlDay: '', tlEvent: '', tlTab: '', tlItem: ''})}</div>`)}
      </div>
    </div>
    <div class="overview-layout overview-more">
      ${hisCard(ctx, patient)}
      ${quadCard('Shared care and communication', '', `
        <h4>Shared care across specialties</h4>${summaries.consultation ? summaries.consultation(ctx) : empty('Care summary module not loaded.')}
        <h4>Necessary communication</h4>${summaries.communication ? summaries.communication(ctx) : empty('Care summary module not loaded.')}
        <div class="row">${link('notes', 'Open shared-care history')}${link('orders', 'Check order history')}</div>`, {open: false})}
    </div>`;
  });
})(globalThis);
