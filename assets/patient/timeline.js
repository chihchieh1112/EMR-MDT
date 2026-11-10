/* Patient timeline (2026-10-25; redesigned 2026-10-28 after the clinical-course mockup in docs/reference/).
   Signed progress notes are the cut points of the clinical course. The left column lists the cut points of one hospital day;
   the right panel opens one of them with what happened from that note until the next one: labs, imaging and exams,
   medications, procedures, consults and other orders. A read-only projection of existing records — it stores nothing.
   Labels are English keys; i18n.js translates them on screen. */
(function (root) {
  'use strict';
  const C = root.ICUClinical || (typeof module !== 'undefined' ? require('../clinical.js') : null);
  const TZ = root.ICUTimeZone || (typeof module !== 'undefined' ? require('../timezone.js') : null);
  const TAX = () => root.ICUOrderTaxonomy || (typeof module !== 'undefined' ? require('../order-taxonomy.js') : null);
  const WF = () => root.ICUWorkflow || (typeof module !== 'undefined' ? require('../workflow.js') : null);

  // 右側分頁；第一頁是切點本身的病程紀錄，其餘是這段期間的事件。分頁鍵寫在網址（tlTab）。
  const TABS = [['note', 'Progress note'], ['labs', 'Labs'], ['imaging', 'Imaging & exams'], ['meds', 'Medications'], ['procedures', 'Care & surgery'], ['consults', 'Consults'], ['other', 'Other orders'], ['adt', 'Admission & transfer']];
  const ITEM_TABS = TABS.slice(1).map(t => t[0]);
  const SHORT = {labs: 'Lab', imaging: 'Imaging', meds: 'Med', procedures: 'Proc', consults: 'Consult', other: 'Other', adt: 'Transfers'};
  const KIND_LABEL = {soap: 'Progress note', acceptance: 'Acceptance Note', transfer: 'Transfer Note'};
  const SOAP = [['S', 'Subjective'], ['O', 'Objective'], ['A', 'Assessment'], ['P', 'Plan']];
  // 應該即時記錄的給藥，寫入晚於臨床時間超過這個分鐘數就標補登。
  const LATE_MINUTES = 30;

  // 不帶時區尾碼的是醫院牆上時間；帶尾碼的系統戳記換算成醫院當地時間。
  const wall = t => { if (!t) return ''; const v = String(t).replace(' ', 'T'); return /(Z|[+-]\d\d:\d\d)$/.test(v) ? TZ.wall(TZ.millis(v)) : v.slice(0, 16); };
  const minutesBetween = (a, b) => (TZ.millis(b) - TZ.millis(a)) / 60000;
  const firstLine = t => String(t || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const clip = (t, n = 140) => t.length > n ? t.slice(0, n - 1) + '…' : t;
  const nameOf = (state, id) => (id && state.people[id] && state.people[id].name) || '';
  const has = v => v !== null && v !== undefined && v !== '';
  const live = (list, x) => !x.voided && !list.some(y => y.replaces === x.id && !y.voided && y.status !== 'draft');
  const byTime = (a, b) => a.at.localeCompare(b.at) || String(a.id).localeCompare(String(b.id));
  const noteType = x => x.noteType || (x.soap ? 'progress' : x.kind === 'Nursing note' ? 'nursing' : 'progress');

  // 切點：已簽的病程紀錄（含轉入／轉出摘要）。草稿、作廢、被新版取代的、護理紀錄、入院病歷與出院摘要都不是切點。
  function cutPoints(state, patient) {
    const notes = state.notes.filter(x => x.p === patient.id);
    return notes.filter(x => x.status === 'signed' && live(notes, x) && noteType(x) === 'progress')
      .map(x => ({id: x.id, note: x, at: wall(x.clinicalAt || x.at)})).filter(x => x.at).sort(byTime);
  }

  // 事件：每筆歸到一個分頁。醫囑用開立時間，結果掛在原醫囑上；HIS 送來、我方沒有醫囑的結果用報告時間；
  // 給藥、停用、取消、手術用各自發生的時間；會診用申請時間，回覆掛在申請上。
  function items(state, patient) {
    const pid = patient.id, out = [];
    const push = (tab, e) => { if (e.at) out.push({tab, notes: [], actor: '', link: null, ...e}); };
    const late = (at, recorded) => recorded && minutesBetween(at, wall(recorded)) > LATE_MINUTES ? [['Late entry {0}', wall(recorded)]] : [];
    const orders = state.orders.filter(o => o.p === pid && o.local !== 'draft');
    const reports = state.reports.filter(r => r.p === pid && r.status !== 'entered-in-error');
    const tabOf = o => { const T = TAX(), c = T ? T.categoryOfOrder(o) : o.kind === 'medication' ? 'medication' : 'other';
      return c === 'medication' ? 'meds' : c === 'lab' ? 'labs' : c === 'imaging' ? 'imaging' : c === 'care' ? 'procedures' : 'other'; };
    const orderLink = o => o.kind === 'medication' ? {view: 'orders', orderKind: 'medication', record: o.id} : {view: 'otherOrders', orderKind: 'all', record: o.id};
    const nameOfOrder = o => o.catalog?.zh || o.name;

    orders.forEach(o => {
      const tab = tabOf(o), at = wall(o.orderedAt || o.start), start = wall(o.start);
      if (tab === 'labs' || tab === 'imaging') {
        push(tab, {id: o.id, at, name: nameOfOrder(o), order: o, report: reports.filter(r => r.order === o.id).sort((a, b) => (b.version || 1) - (a.version || 1))[0] || null, actor: nameOf(state, o.author)});
        return;
      }
      push(tab, {id: o.id, at, label: 'Order placed', text: [nameOfOrder(o), o.dose, o.route, o.frequency].filter(Boolean).join(' · '), actor: nameOf(state, o.author), link: orderLink(o),
        notes: start && start !== at ? [['Starts {0}', start]] : []});
      if (o.clinical === 'stopped' && o.end) push(tab, {id: o.id + ':stopped', at: wall(o.end), label: 'Stopped', text: nameOfOrder(o), actor: nameOf(state, o.stoppedBy), link: orderLink(o)});
      if (o.clinical === 'cancelled' && o.cancel) push(tab, {id: o.id + ':cancelled', at: wall(o.cancel.at), label: 'Cancelled', text: [nameOfOrder(o), o.cancel.reason].filter(Boolean).join(' — '), actor: nameOf(state, o.cancel.actor), link: orderLink(o)});
    });

    reports.filter(r => !(r.order && orders.some(o => o.id === r.order)) && r.status === 'returned' && r.at).forEach(r => {
      push(r.kind === 'Lab' ? 'labs' : 'imaging', {id: r.id, at: wall(r.at), name: r.catalog?.zh || r.catalog?.name || r.examType || r.kind, order: null, report: r, actor: r.reporter || ''});
    });

    state.executions.filter(x => x.p === pid).forEach(x => {
      const o = orders.find(y => y.id === x.order), tab = o ? tabOf(o) : 'meds';
      if (tab === 'labs' || tab === 'imaging') return;
      const at = wall(x.at), label = x.status === 'done' ? 'Administered' : x.status === 'held' ? 'Held' : 'Not administered';
      const text = [o ? nameOfOrder(o) : x.order, x.status === 'done' ? [x.actual, x.route].filter(Boolean).join(' · ') : '', x.reason].filter(Boolean).join(' — ');
      push(tab, {id: x.id, at, label, text, actor: nameOf(state, x.actor), link: o ? orderLink(o) : null, notes: late(at, x.recorded)});
    });

    const surgeries = (state.surgeries || []).filter(x => x.p === pid && x.performedAt);
    surgeries.filter(x => live(surgeries, x)).forEach(x => {
      const lead = (x.surgeons || []).find(s => s.role === 'primary') || (x.surgeons || [])[0];
      push('procedures', {id: x.id, at: wall(x.performedAt), label: 'Surgery / procedure', text: x.procedure || '', actor: lead ? lead.name : '', link: {view: 'rounds'},
        notes: x.replaces || x.version > 1 ? [['Corrected']] : []});
    });

    (state.consultations || []).filter(x => x.p === pid).forEach(x => {
      push('consults', {id: x.id, at: wall(x.requestedAt), label: 'Consult requested', text: [x.specialty, clip(firstLine(x.question))].filter(Boolean).join(': '), actor: nameOf(state, x.requester),
        link: {view: 'notes', careWork: 'consultation', record: x.id},
        reply: x.respondedAt ? {at: wall(x.respondedAt), text: clip(firstLine(x.recommendation)), actor: nameOf(state, x.responder)} : null});
    });
    // 入出轉（2026-10-31 補回；同日改全院）：每次接收（HIS 入科或本系統轉入）、本科內換床、離開，依發生時間歸段，放在入出轉分頁。
    const locs = patient.locations || [], W = WF();
    const icuAt = wall(patient.icuEntryTime || patient.admittedAt), firstBed = locs[0] || {ward: patient.ward, bed: patient.bed};
    const received = patient.received || [];
    received.forEach((r, i) => push('adt', {id: pid + ':in:' + i, at: wall(r.arrived), label: r.via === 'transfer' ? 'Transferred in' : 'Received', text: [r.department, r.from ? '← ' + r.from : '', i === received.length - 1 ? [firstBed.ward, firstBed.bed].filter(Boolean).join(' · ') : ''].filter(Boolean).join(' · '), actor: nameOf(state, r.by)}));
    if (icuAt && !received.length) push('adt', {id: pid + ':icu', at: icuAt, label: 'Entered the department', text: [firstBed.ward, firstBed.bed].filter(Boolean).join(' · '), actor: nameOf(state, patient.admittedBy)});
    locs.slice(1).forEach((x, i) => push('adt', {id: pid + ':bed:' + (i + 1), at: wall(x.from), label: 'Bed changed',
      text: `${locs[i].bed} → ${x.bed}` + (x.ward !== locs[i].ward ? ` (${x.ward})` : ''), actor: nameOf(state, x.by)}));
    if (patient.dischargedAt) {
      const lv = patient.leave || {}, type = W && (W.LEAVE_TYPES || []).find(x => x[0] === patient.dischargeDisposition), result = W && (W.TREATMENT_RESULTS || []).find(x => x[0] === lv.treatmentResult);
      const where = lv.toDepartment ? lv.toDepartment.name : lv.receivingFacility ? lv.receivingFacility.name : '', dx = lv.diagnosis ? lv.diagnosis.code + ' ' + (lv.diagnosis.english || lv.diagnosis.name) : '';
      push('adt', {id: pid + ':out', at: wall(patient.dischargedAt), label: type ? type[1] : 'Left the department', text: [where, dx].filter(Boolean).join(' · '), actor: nameOf(state, patient.dischargedBy),
        link: {view: 'records', writerType: 'discharge'}, notes: result ? [['Treatment result: {0}', result[2]]] : []});
    }
    return out.sort(byTime);
  }

  // 入院日前的事件不列；入院日缺漏就不設下限。
  const admitStart = patient => /^\d{4}-\d\d-\d\d/.test(String(patient.admitted || '')) ? String(patient.admitted).slice(0, 10) + 'T00:00' : '';

  // 分段：每個切點收「這份病程之後、下一份之前」的事件；第一份病程之前的事件另成一段，有事件才出現。
  function groups(state, patient) {
    const cuts = cutPoints(state, patient), from = admitStart(patient);
    const list = items(state, patient).filter(e => !from || e.at >= from);
    const bucket = (lo, hi) => { const mine = list.filter(e => (!lo || e.at >= lo) && (!hi || e.at < hi)); return Object.fromEntries(ITEM_TABS.map(t => [t, mine.filter(e => e.tab === t)])); };
    const out = [], first = cuts[0] ? cuts[0].at : '';
    const pre = bucket('', first), preList = ITEM_TABS.flatMap(t => pre[t]).sort(byTime);
    if (preList.length) out.push({id: 'pre', note: null, at: preList[0].at, until: first, items: pre});
    cuts.forEach((c, i) => { const next = cuts[i + 1] ? cuts[i + 1].at : ''; out.push({id: c.id, note: c.note, at: c.at, until: next, items: bucket(c.at, next)}); });
    return out;
  }

  const kindLabel = g => g.note ? KIND_LABEL[g.note.progressKind || 'soap'] || 'Progress note' : 'Before the first progress note';
  // 卡片摘要：SOAP 取評估第一行；轉入／轉出摘要取病程摘要或轉入／轉出原因第一行；都沒有取全文第一行。
  const gist = note => { const s = note.soap || note.sections || {}; return clip(firstLine(s.A || s.assessment || s.courseSummary || s.transferInReason || s.transferOutReason || note.text), 120); };
  const href = (route, changes) => '#' + new URLSearchParams({...route, record: '', ...changes}).toString();

  function render(ctx) {
    const {state, patient, route, esc} = ctx;
    const all = groups(state, patient);
    if (!all.length) return `<section class="card patient-timeline"><div class="empty">No signed progress note or events in this admission yet.</div></section>`;
    const days = [...new Set(all.map(g => g.at.slice(0, 10)))].sort();
    const picked = all.find(g => g.id === route.tlEvent);
    const day = picked ? picked.at.slice(0, 10) : days.includes(route.tlDay) ? route.tlDay : days.at(-1);
    const today = all.filter(g => g.at.slice(0, 10) === day);
    const g = picked || today.at(-1), index = all.indexOf(g);
    const tabs = g.note ? TABS : TABS.slice(1);
    const tab = tabs.some(t => t[0] === route.tlTab) ? route.tlTab : g.note ? 'note' : (tabs.find(t => g.items[t[0]].length) || tabs[0])[0];
    const go = x => href(route, {tlDay: x.at.slice(0, 10), tlEvent: x.id, tlTab: '', tlItem: ''});
    const stamp = w => w.slice(0, 10) === g.at.slice(0, 10) ? w.slice(11, 16) : w.slice(5, 16).replace('T', ' ');
    const noteText = n => esc(n.length > 1 ? n[0].replace('{0}', /^\d{4}-/.test(n[1]) ? stamp(n[1]) : n[1]) : n[0]);

    // 篩選列：檢視日期與住院天數、POD
    const stay = C.admissionDay(patient.admitted, day), pod = C.postOpDay(state, patient, day);
    const picker = `<label class="tl-date">Review date<select data-href-select>${days.map(d => `<option value="${esc(href(route, {tlDay: d, tlEvent: '', tlTab: '', tlItem: ''}))}"${d === day ? ' selected' : ''} data-no-i18n>${esc(d)}</option>`).join('')}</select></label>`
      + (stay === null ? '' : `<span class="tl-tag">${esc(`Hospital day ${stay}`)}</span>`) + (pod ? `<span class="tl-tag tl-pod">${esc(`POD ${pod.pod}`)}</span>` : '');

    // 左欄：當天的切點，依時間先後
    const counts = x => ITEM_TABS.filter(t => x.items[t].length).map(t => `<span class="tl-count tl-count-${t}">${esc(SHORT[t])} <b data-no-i18n>${x.items[t].length}</b></span>`).join('');
    const numbered = today.filter(x => x.note);
    const cards = today.map(x => `<a class="tl-cut${x.note ? '' : ' tl-cut-pre'}${x === g ? ' active' : ''}" href="${esc(go(x))}"${x === g ? ' aria-current="true"' : ''}>`
      + (x.note ? `<span class="tl-cut-line"><span class="tl-num" data-no-i18n>${numbered.indexOf(x) + 1}</span><time data-no-i18n>${esc(x.at.slice(11, 16))}</time><b>${esc(kindLabel(x))}</b></span>`
        : `<span class="tl-cut-line"><b>${esc(kindLabel(x))}</b></span>`)
      + (x.note ? `<span class="tl-gist" data-no-i18n>${esc(gist(x.note))}</span>` : '') + (counts(x) ? `<span class="tl-counts">${counts(x)}</span>` : '') + `</a>`).join('');

    // 右側：切點標頭、上下一個、分頁
    const prev = all[index - 1], next = all[index + 1];
    const navLink = (x, label, sign) => x ? `<a class="button secondary tl-nav" href="${esc(go(x))}" aria-label="${esc(label)}">${sign}</a>` : `<span class="button secondary tl-nav" aria-disabled="true" aria-label="${esc(label)}">${sign}</span>`;
    const head = `<div class="tl-detail-head"><div><h2>${esc(kindLabel(g))}</h2><p class="tl-detail-time"><time data-no-i18n>${esc(g.note ? g.at.replace('T', ' ') : g.at.slice(0, 10))}</time>`
      + (g.note ? `<span data-no-i18n>${esc(nameOf(state, g.note.author))}</span>` : '') + (g.until ? `<span>${esc(`Until ${g.until.replace('T', ' ')}`)}</span>` : '') + `</p></div>`
      + `<div class="tl-navs">${navLink(prev, 'Previous event', '‹')}${navLink(next, 'Next event', '›')}</div></div>`;
    const tabBar = `<nav class="record-subtabs tl-tabs" aria-label="Clinical event sections">${tabs.map(([k, t]) => `<a href="${esc(href(route, {tlDay: day, tlEvent: g.id, tlTab: k, tlItem: ''}))}" class="${tab === k ? 'active' : ''}"${tab === k ? ' aria-current="page"' : ''}>${esc(t)}${k === 'note' ? '' : `<span class="tab-count${g.items[k].length ? '' : ' is-zero'}" data-no-i18n>${g.items[k].length}</span>`}</a>`).join('')}</nav>`;

    let body;
    if (tab === 'note') {
      const n = g.note, s = n.soap || {}, corrected = n.replaces || n.version > 1;
      const rows = (n.progressKind || 'soap') === 'soap' && SOAP.some(([k]) => has(s[k]))
        ? SOAP.map(([k, t]) => `<div class="tl-row"><strong>${esc(t)}</strong><p class="preserve-lines" data-no-i18n>${esc(s[k] || '')}</p></div>`).join('')
        : `<p class="preserve-lines" data-no-i18n>${esc(n.text || '')}</p>`;
      body = `<div class="tl-note-body">${rows}<p class="tl-meta">${n.signedAt ? `<span>${esc(`Signed ${wall(n.signedAt).replace('T', ' ')}`)}</span>` : ''}${corrected ? `<span class="pill">${esc('Corrected')}</span>` : ''}`
        + `<a href="${esc(href(route, {view: 'records', note: n.id, record: n.id}))}">Open in Records</a></p></div>`;
    } else if (!g.items[tab].length) {
      body = '<div class="empty">Nothing recorded in this period.</div>';
    } else if (tab === 'labs' || tab === 'imaging') {
      const list = g.items[tab], sel = list.find(x => x.id === route.tlItem) || list[0], lab = tab === 'labs';
      const flags = r => r ? [...new Set((r.components || []).map(c => c.interpretation).filter(v => v && !/^n(ormal)?$/i.test(v)))].join(', ') : '';
      const resultText = r => !r || r.status !== 'returned' ? '—' : lab
        ? ((r.components || []).filter(c => has(c.value)).slice(0, 3).map(c => [c.name, c.value, c.unit].filter(has).join(' ')).join(' · ') || firstLine(r.text))
        : clip(firstLine(r.impression || r.text), 90);
      const status = r => !r || r.status === 'pending' ? 'Pending' : r.version > 1 ? 'Corrected' : 'Resulted';
      const rowHref = x => href(route, {tlDay: day, tlEvent: g.id, tlTab: tab, tlItem: x.id});
      const table = `<div class="table-wrap tl-results-wrap"><table class="dense-table tl-results"><thead><tr><th scope="col">${esc(lab ? 'Test' : 'Exam')}</th><th scope="col">Result</th><th scope="col">Flag / status</th><th scope="col">Ordered at</th><th scope="col">Report time</th></tr></thead><tbody>`
        + list.map(x => { const r = x.report, f = flags(r);
          return `<tr data-open="${esc(rowHref(x).slice(1))}"${x === sel ? ' class="is-selected" aria-current="true"' : ''}><td><a href="${esc(rowHref(x))}" data-no-i18n>${esc(x.name)}</a></td><td data-no-i18n>${esc(resultText(r))}</td>`
            + `<td>${f ? `<span class="pill warning" data-no-i18n>${esc(f)}</span> ` : ''}<span class="pill">${esc(status(r))}</span></td><td data-no-i18n>${x.order ? esc(stamp(x.at)) : '—'}</td><td data-no-i18n>${r && r.status === 'returned' && r.at ? esc(stamp(wall(r.at))) : '—'}</td></tr>`; }).join('')
        + '</tbody></table></div>';
      const r = sel.report;
      const comps = r && r.status === 'returned' && lab && (r.components || []).length
        ? `<table class="dense-table"><thead><tr><th scope="col">Item</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Flag</th></tr></thead><tbody>${r.components.map(c => `<tr><td data-no-i18n>${esc(c.name)}</td><td data-no-i18n>${esc(has(c.value) ? c.value : '—')}</td><td data-no-i18n>${esc(c.unit || '')}</td><td>${(f => f ? `<span class="pill warning" data-no-i18n>${esc(f)}</span>` : '')(/^n(ormal)?$/i.test(c.interpretation || '') ? '' : c.interpretation || '')}</td></tr>`).join('')}</tbody></table>`
        : r && r.status === 'returned' ? `<p class="preserve-lines" data-no-i18n>${esc(r.impression || r.text || '')}</p>` : `<p>${esc('Result pending')}</p>`;
      const times = [sel.order ? ['Ordered {0}', sel.at] : null, r && r.collectedAt ? [lab ? 'Collected {0}' : 'Performed {0}', wall(r.collectedAt)] : null, r && r.status === 'returned' && r.at ? ['Reported {0}', wall(r.at)] : null].filter(Boolean);
      body = table + `<div class="tl-selected"><strong data-no-i18n>${esc(sel.name)}</strong>${comps}<p class="tl-meta">${times.map(t => `<span>${noteText(t)}</span>`).join('')}${r && r.reporter ? `<span data-no-i18n>${esc(r.reporter)}</span>` : ''}`
        + `${r ? `<a href="${esc(href(route, {view: 'results', record: r.id}))}">Open in Labs &amp; imaging</a>` : ''}</p></div>`;
    } else {
      const tone = l => ['Stopped', 'Cancelled', 'Held', 'Not administered'].includes(l) ? ' warning' : l === 'Administered' ? '' : ' tl-pill-neutral';
      body = `<ol class="tl-items">${g.items[tab].map(x => `<li><time data-no-i18n>${esc(stamp(x.at))}</time><span class="tl-label-cell"><span class="pill${tone(x.label)}">${esc(x.label)}</span></span><span class="tl-item-body">`
        + (x.text ? x.link ? `<a href="${esc(href(route, x.link))}" data-no-i18n>${esc(x.text)}</a>` : `<span data-no-i18n>${esc(x.text)}</span>` : '')
        + x.notes.map(n => `<small class="tl-note">${noteText(n)}</small>`).join('')
        + (tab === 'consults' ? x.reply ? `<span class="tl-reply"><b>${esc(`Replied ${stamp(x.reply.at)}`)}</b><span data-no-i18n>${esc(x.reply.text)}</span><small data-no-i18n>${esc(x.reply.actor)}</small></span>` : `<span class="tl-reply"><b>${esc('Awaiting reply')}</b></span>` : '')
        + `</span><span class="tl-actor"${x.actor ? ' data-no-i18n' : ''}>${esc(x.actor || 'Performer not supplied')}</span></li>`).join('')}</ol>`;
    }

    return `<section class="patient-timeline"><div class="filter-row tl-filters">${picker}</div><div class="tl-layout">`
      + `<aside class="card tl-cuts" aria-label="Clinical course"><h2>Clinical course<span class="tab-count" data-no-i18n>${numbered.length}</span></h2>${cards}</aside>`
      + `<section class="card tl-detail">${head}${tabBar}<div class="tl-content">${body}</div></section></div></section>`;
  }

  root.ICUPatientTimeline = {cutPoints, items, groups, TABS, ITEM_TABS, LATE_MINUTES};
  if (root.ICUPatientViews) root.ICUPatientViews.register('timeline', render);
  if (typeof module !== 'undefined') module.exports = root.ICUPatientTimeline;
})(globalThis);
