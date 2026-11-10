/* 表格式交班（整班一次送出、逐病人一列）純推導層：由照護名單 × 醫囑 × 本班執行 × 報告 × 工作 × 交班版本
   算出每位病人一列。不寫入、不含 DOM；node 可 require 供驗證器使用。 */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' ? require('./clinical.js') : root.ICUClinical;
  const W = typeof module !== 'undefined' ? require('./workflow.js') : root.ICUWorkflow;
  const byTime = (a, b) => String(a.at || '').localeCompare(String(b.at || ''));

  function diagnosisOf(s, pid) {
    const dx = (s.diagnoses || []).filter(d => d.p === pid && d.active !== false);
    const pick = stage => dx.filter(d => d.stage === stage).sort((a, b) => (a.rank === 'primary' ? -1 : 1) - (b.rank === 'primary' ? -1 : 1))[0];
    const hit = pick('icu') || pick('admission') || dx[0];
    const label = hit && (hit.diagnosis?.zh || hit.diagnosis?.name || hit.diagnosis?.code || hit.name || hit.key);
    if (label) return String(label);
    const p = s.patients.find(x => x.id === pid);
    return p?.problem || '';
  }

  function latestVitals(s, pid) {
    const flat = C.flatten(s.observations.filter(o => o.p === pid && !o.voided)).sort((a, b) => byTime(b, a));
    const out = [];
    ['Temperature','Heart rate','Respiratory rate','Systolic BP','Diastolic BP','SpO₂'].forEach(kind => { const hit = flat.find(o => o.kind === kind); if (hit) out.push({kind, value: hit.value, unit: hit.unit || C.units[kind] || '', at: hit.at}); });
    return out;
  }

  function rows(s, actorId) {
    const actor = s.people[actorId];
    if (!actor || actor.role === 'admin' || actor.consultationOnly) return [];
    const b = C.shiftTimes(actor) ? C.bounds('shift', actor) : null;
    const may = pid => actor.role === 'doctor' ? W.canWrite(s, pid, actorId) : W.canNurse(s, pid, actorId);
    const mine = (actor.patients || []).filter(pid => s.patients.some(p => p.id === pid) && may(pid));
    return mine.map(pid => {
      const patient = s.patients.find(p => p.id === pid);
      const orders = s.orders.filter(o => o.p === pid && o.clinical === 'active');
      const ex = s.executions.filter(e => e.p === pid && C.within(e.at, b));
      const done = ex.filter(e => e.status === 'done').sort(byTime);
      const notDone = ex.filter(e => e.status !== 'done').sort(byTime);
      const pendingOrders = orders.filter(o => !s.executions.some(e => e.order === o.id && e.status === 'done'));
      const reports = s.reports.filter(r => r.p === pid && r.status === 'pending');
      const tasks = s.tasks.filter(t => t.p === pid && t.status !== 'done');
      const versions = s.handovers.filter(h => h.p === pid && h.role === actor.role);
      const latestOf = list => list.filter(h => !versions.some(v => v.replaces === h.id)).sort(byTime).at(-1) || null;
      // 每班獨立一筆（2026-11-01 院方定案）：只有這一班自己送過的才算「已交出」，再送出是更正；上一班的不算，這一班送出是新的一筆。
      const shiftNow = C.shiftStartOf ? C.shiftStartOf(actor, s.demoClock) : null, thisShift = h => !shiftNow || C.shiftStartOf(actor, h.clinicalAt || h.at) === shiftNow;
      const latestOut = latestOf(versions.filter(h => h.author === actorId && thisShift(h)));
      const incoming = versions.filter(h => h.receiver === actorId && !versions.some(v => v.replaces === h.id) && !s.receipts.some(r => r.handover === h.id));
      // 今天最早寫的交班（2026-10-18 ditto 來源）：本人優先，其次同角色；取最早那一版的原文，之後的更正版不算。「今天」依示範時鐘與交班的臨床時間。
      const today = String(s.demoClock || '').slice(0, 10);
      const todays = versions.filter(h => String(h.clinicalAt || h.at).slice(0, 10) === today).sort((a, b) => String(a.clinicalAt || a.at).localeCompare(String(b.clinicalAt || b.at)));
      const firstToday = todays.find(h => h.author === actorId) || todays[0] || null;
      return {
        p: pid, patient, diagnosis: diagnosisOf(s, pid), bounds: b,
        orders, pendingOrders, done, notDone, reports, tasks, vitals: latestVitals(s, pid),
        draft: s.drafts[actorId + ':' + pid + ':handover'] || (latestOut ? {text: latestOut.text ?? latestOut.summary, receiver: latestOut.receiver} : {}),
        latestOut, receipt: latestOut ? s.receipts.find(r => r.handover === latestOut.id) || null : null, incoming, firstToday,
        drafts: s.orders.filter(o => o.p === pid && o.local === 'draft' && o.clinical !== 'cancelled' && o.author === actorId),
        goal: (s.goals || []).filter(g => g.p === pid).sort(byTime).at(-1) || null
      };
    });
  }

  function receivers(s, actorId) {
    const a = s.people[actorId];
    return Object.entries(s.people).filter(([id, x]) => id !== actorId && x.role === a.role && !x.consultationOnly && x.role !== 'admin' && x.active !== false).map(([id, x]) => [id, x.name + (x.shift ? ' · ' + x.shift : '')]);
  }

  const api = {rows, receivers, diagnosisOf, latestVitals};
  if (typeof module !== 'undefined') module.exports = api; else root.ICUHandoverTable = api;
})(globalThis);
