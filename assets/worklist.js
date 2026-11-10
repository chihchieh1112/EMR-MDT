/* 我的待辦（護囑執行清單）純推導層：由醫師有效醫囑 × 本班執行紀錄算出每位病人的執行項目與狀態。
   沒有 store action、不寫入；頻率只解析原型會寫入的字串，換算不出來的只顯示原字串，不推定次數。 */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' ? require('./clinical.js') : root.ICUClinical;
  const TAX = typeof module !== 'undefined' ? require('./order-taxonomy.js') : root.ICUOrderTaxonomy;
  const W = typeof module !== 'undefined' ? require('./workflow.js') : root.ICUWorkflow;
  const S = typeof module !== 'undefined' ? require('./master-schema.js') : root.ICUMasterSchema;
  const injection = /注射|施打|針|inject|tiêm|\bIV\b|\bIM\b/i; // 與 orders.js 同一規則

  function parseFrequency(f) {
    const s = String(f || '').toUpperCase();
    if (!s) return null;
    if (/STAT|本次|術前一次|睡前一次|\bHS\b|\bONCE\b/.test(s)) return {once: true};
    const q = s.match(/Q(\d+)H/);
    if (q) return {intervalHours: Number(q[1])};
    if (/\bQD\b|每日 ?1 次|ONCE DAILY/.test(s)) return {perDay: 1};
    if (/\bBID\b|每日 ?2 次|TWICE DAILY/.test(s)) return {perDay: 2};
    if (/\bTID\b|每日 ?3 次|3 TIMES DAILY/.test(s)) return {perDay: 3};
    if (/\bQID\b|每日 ?4 次|4 TIMES DAILY/.test(s)) return {perDay: 4};
    return null; // PRN／連續輸注／QOD／每週／自訂
  }

  // 本班應執行次數：只有能直接換算的才給數字；「每日 n 次」依院方給藥時程，不推定。
  function dueCount(order, bounds, allExecutions) {
    const f = parseFrequency(order.frequency);
    const raw = order.frequency || 'Frequency not provided';
    if (!f || !bounds) return {count: null, text: raw};
    if (f.once) return {count: allExecutions.some(e => e.status === 'done') ? 0 : 1, text: 'Single dose'};
    const hours = (bounds[1] - bounds[0]) / 3600000;
    if (f.intervalHours) return {count: Math.max(1, Math.floor(hours / f.intervalHours)), text: `Every ${f.intervalHours} h`};
    return {count: null, text: `Daily ×${f.perDay} · per shift dosing schedule`};
  }

  function actionLabel(order, cat) {
    if (cat === 'medication') return injection.test(order.route || '') ? 'Injection' : 'Administration';
    if (cat === 'lab' || cat === 'imaging') return 'Collect / send specimen';
    return 'Administration';
  }

  const latestOf = list => list.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;

  function itemStatus(order, due, inShift) {
    if (order.clinical !== 'active') return 'blocked';
    const latest = latestOf(inShift);
    const done = inShift.filter(e => e.status === 'done').length;
    if (!latest) return 'pending';
    if (latest.status === 'held') return 'held';
    if (latest.status === 'notDone') return 'notDone';
    return due.count !== null && done < due.count ? 'partial' : 'done';
  }

  // 顯示文字照 FHIR R5 MedicationAdministration.status（completed／on-hold／not-done／in-progress）；尚無紀錄的是依 Timing 排定、未執行。
  const statusText = {pending: 'Scheduled', partial: 'In progress', done: 'Completed', held: 'On hold', notDone: 'Not done', blocked: 'HIS not accepted, cannot perform'};

  function build(state, actorId, actor) {
    const confirmed = !!state.confirmed[actorId];
    const scopePatients = actor.patients || [];
    const patients = state.patients
      .filter(p => !confirmed || scopePatients.includes(p.id))
      .sort((a, b) => String(a.bed).localeCompare(String(b.bed), 'en', {numeric: true}));
    const bounds = actor.consultationOnly || !C.shiftTimes(actor) ? null : C.bounds('shift', actor);
    const groups = patients.map(p => {
      const items = state.orders.filter(o => o.p === p.id && o.clinical === 'active').map(order => {
        const all = state.executions.filter(e => e.order === order.id && e.version === order.version);
        const inShift = all.filter(e => C.within(e.at, bounds));
        const cat = TAX.categoryOfOrder(order);
        const due = dueCount(order, bounds, all);
        const status = itemStatus(order, due, inShift);
        return {order, category: cat, typeLabel: TAX.labelOf(cat), actionLabel: actionLabel(order, cat), executable: order.clinical === 'active',
          due, doneCount: inShift.filter(e => e.status === 'done').length, inShift, all, lastExecution: latestOf(all), status, statusText: statusText[status]};
      });
      const counts = items.reduce((n, i) => { n[i.status] = (n[i.status] || 0) + 1; return n; }, {});
      const tasks = state.tasks.filter(t => t.p === p.id && t.owner === actorId && t.status !== 'done');
      const doctor = {
        // 醫囑不用簽（2026-11-01）：沒有草稿了；改列主治要回看的藥囑（量了新體重後超過每公斤上限）。
        recheck: W.isAttending(state, p.id, actorId) && S && S.weightRecheck ? ((S.weightRecheck(state, p.id) || {}).orders || []) : [],
        pendingReports: state.reports.filter(r => r.p === p.id && r.status === 'pending'),
        consults: (state.consultations || []).filter(x => x.p === p.id && x.assignee === actorId && x.status === 'requested')
      };
      return {patient: p, items, counts, tasks, doctor, canNurse: W.canNurse(state, p.id, actorId)};
    });
    return {scope: confirmed ? 'assigned' : 'all', bounds, groups};
  }

  // 首頁依角色分開（2026-11-02）：醫師、護理師、會診醫師、管理者各看自己這一班要先處理的事；只推導、不寫入。
  // 「我的病人」＝跟登入者有有效照護關係（含主治）或指派給他的會診；其餘本科病人在「全科」切換後看得到。
  function roleOf(actor) {
    if (!actor) return 'doctor';
    if (actor.role === 'admin') return 'admin';
    if (actor.consultationOnly) return 'consult';
    return actor.role === 'nurse' ? 'nurse' : 'doctor';
  }

  // 新結果只算最近 24 小時回來、我還沒讀過的異常（依來源旗標）；更早的在病人頁檢驗分頁看。
  function home(state, actorId) {
    const actor = state.people[actorId] || {};
    const role = roleOf(actor);
    const now = C.millis(state.demoClock);
    const today = String(state.demoClock || '').slice(0, 10);
    const live = state.patients.filter(p => !p.dischargedAt);
    const consults = (state.consultations || []).filter(x => x.assignee === actorId && x.status === 'requested');
    const mineSet = new Set(live.filter(p => (state.relationships || []).some(r => r.p === p.id && r.actor === actorId && r.active)
      || (role === 'doctor' && W.attending(state, p.id) === actorId)
      || (state.consultations || []).some(x => x.p === p.id && x.assignee === actorId)
      || (p.pendingReceive && p.pendingReceive.nurse === actorId)).map(p => p.id));
    const intake = (state.handovers || []).filter(h => h.receiver === actorId && h.role === actor.role
      && !(state.receipts || []).some(r => r.handover === h.id) && !(state.handovers || []).some(x => x.replaces === h.id)).map(h => h.p);
    intake.forEach(pid => mineSet.add(pid));
    const per = {};
    const cell = pid => per[pid] || (per[pid] = {results: 0, progressToday: false, due: 0, consult: null});
    const counts = {intake: new Set(intake).size, results: 0, noProgress: 0, sign: 0, consults: consults.length, due: 0, tasks: 0, recheck: 0};
    if (role === 'doctor') {
      state.reports.filter(r => mineSet.has(r.p) && r.status === 'returned' && r.at && C.millis(r.at) <= now && now - C.millis(r.at) <= 864e5
        && (r.components || []).some(c => C.resultClass(c) === 'abnormal')
        && !(r.seen || []).some(x => x.actor === actorId && x.version === r.version)).forEach(r => { cell(r.p).results++; counts.results++; });
      mineSet.forEach(pid => {
        const written = state.notes.some(n => n.p === pid && !n.voided && (n.noteType || (n.soap ? 'progress' : '')) === 'progress' && String(n.clinicalAt || '').slice(0, 10) === today);
        cell(pid).progressToday = written;
        if (!written) counts.noProgress++;
        if (W.isAttending(state, pid, actorId) && S && S.weightRecheck) counts.recheck += ((S.weightRecheck(state, pid) || {}).orders || []).length;
      });
      counts.sign = state.notes.filter(n => n.author === actorId && !n.voided && n.reviewStatus !== 'completed' && !state.notes.some(y => y.replaces === n.id)).length;
    }
    if (role === 'nurse') {
      build(state, actorId, actor).groups.filter(g => g.canNurse && mineSet.has(g.patient.id)).forEach(g => {
        const n = g.items.filter(i => i.status === 'pending' || i.status === 'partial').length;
        cell(g.patient.id).due = n; counts.due += n;
      });
    }
    if (role === 'consult') consults.forEach(x => { cell(x.p).consult = x; });
    counts.tasks = state.tasks.filter(t => t.owner === actorId && t.status !== 'done').length;
    const focus = {
      intake: new Set(intake),
      results: new Set(Object.keys(per).filter(k => per[k].results)),
      noProgress: new Set([...mineSet].filter(k => role === 'doctor' && !cell(k).progressToday)),
      due: new Set(Object.keys(per).filter(k => per[k].due)),
      consults: new Set(consults.map(x => x.p))
    };
    return {role, mine: [...mineSet], per, counts, focus};
  }

  const api = {build, parseFrequency, dueCount, itemStatus, statusText, home, roleOf};
  if (typeof module !== 'undefined') module.exports = api; else root.ICUWorklist = api;
})(globalThis);
