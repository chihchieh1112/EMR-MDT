/* EMR整合MDT demo：MDT 模組的規則層（2026-11-10，P2；P3 加職類照會、會前預填、個案會議與家庭會議）。
   state.mdt 的讀取（齊備檢核、議程、任務狀態、指標、召開提示、會議層級）與寫入（store.dispatch 轉進來的 mdt*／ref*／case*／family* 動作）都在這裡；畫面在 mdt-ui.js。
   掛進原型的兩個點：store.js 的 dispatch 在 switch 的 default 之前呼叫 handle()；workflow.guard 對這些動作改呼叫這裡的 guard()。
   權限簡化版：提案限可開醫囑的醫師；紀錄限秘書與主席；鎖定限主席；任務限負責人或其科別；職類照會回覆限該職類；召開限照護醫師；核准限科主任；排程限科內協調人（護理長）或秘書。
   所有寫入只供示範，不代表一期範圍；資料全部虛構。 */
(function (root) {
  'use strict';
  const W = () => root.ICUWorkflow, TZ = () => root.ICUTimeZone;
  const copy = x => JSON.parse(JSON.stringify(x));

  // ---- 字典（英文正本；中文在 demo-dict.js）----
  const ITEMS = [['pathology', 'Pathology'], ['biomarkers', 'Biomarkers'], ['staging', 'Staging'], ['imaging', 'Imaging'], ['labs', 'Baseline labs'], ['performance', 'Performance status'], ['cardiac', 'Cardiac function'], ['wishes', 'Patient wishes']];
  const TYPE = {new: 'New diagnosis', postop: 'Post-operative', change: 'Plan change / progression', preop: 'Pre-operative', goals: 'Goals of care'};
  const STATUS = {draft: ['Draft', 'muted'], submitted: ['On agenda', 'info'], discussed: ['In discussion', 'warning'], concluded: ['Concluded', 'success'], deferred: ['Deferred', 'muted'], withdrawn: ['Withdrawn', 'muted']};
  const TASK_STATE = {pending: ['Awaiting receipt', 'warning'], received: ['Received', 'info'], adopted: ['Adopted · ordered', 'info'], started: ['Treatment started', 'success'], done: ['Completed', 'success'], unable: ['Could not be carried out', 'danger']};
  const TASK_FLOW = ['pending', 'received', 'adopted', 'started', 'done'];
  const ROLE = {chair: 'Chair', secretary: 'Secretary', coordinator: 'Coordinator', core: 'Core member', byCase: 'By case'};
  const ATTEND = {every: 'Every meeting', staging: 'Staging cases', reconstruction: 'Reconstruction cases', drug: 'Regimen or dose questions'};
  const MODE = {present: 'Present', video: 'By video', absent: 'Absent', pending: 'No reply yet'};
  const KIND = {treatment: 'Treatment', referral: 'Referral', operational: 'Operational', followup: 'Follow-up'};
  const SESSION = {concluded: ['Concluded', 'success'], inProgress: ['In progress', 'warning'], scheduled: ['Scheduled', 'info'], open: ['Open for proposals', 'muted']};
  // P3
  const REF_STATUS = {draft: ['Drafting', 'muted'], requested: ['Awaiting reply', 'warning'], inProgress: ['In progress', 'info'], replied: ['Replied', 'success'], closed: ['Closed', 'muted']};
  const REF_DECISION = {adopt: ['Adopted · ordered', 'success'], ack: ['Acknowledged', 'info'], decline: ['Not adopted', 'danger']};
  const CONF_KIND = {team: 'Case conference', multi: 'Multi-physician consultation', family: 'Family meeting', deferred: 'No meeting for now'};
  const CONF_STATUS = {draft: ['Draft', 'muted'], pendingApproval: ['Awaiting Head of Department approval', 'warning'], approved: ['Approved · to be scheduled', 'info'], scheduled: ['Scheduled', 'info'], inProgress: ['In progress', 'warning'], review: ['Record awaiting chair confirmation', 'warning'], concluded: ['Concluded', 'success'], completed: ['Completed', 'success'], deferred: ['No meeting for now', 'muted']};
  const PREFILL_STATUS = {sent: ['Sent', 'success'], draft: ['Draft', 'warning'], none: ['Not filled', 'muted'], late: ['Sent · late', 'info']};
  const OUT_OF_FIELD = 'Outside own field, no view';
  const TEAM_KEYS = root.ICUDemoSeed && root.ICUDemoSeed.mdt ? root.ICUDemoSeed.mdt().teams.map(t => t.id) : ['breast', 'lung', 'liver', 'colorectal'];

  const owns = a => /^(mdt|ref|case|family)[A-Z]/.test(String(a || ''));
  const ensure = s => { if (!s.mdt && root.ICUDemoSeed && root.ICUDemoSeed.mdt) s.mdt = root.ICUDemoSeed.mdt(); if (!s.mdt) s.mdt = {teams: [], sessions: [], proposals: [], records: [], tasks: [], log: [], dash: null, demoEvents: {}}; const m = s.mdt;
    for (const k of ['log', 'refs', 'conferences', 'prefills', 'disciplines']) if (!Array.isArray(m[k])) m[k] = [];
    if (!m.rules) m.rules = {trigger: 3, slots: ['07:50', '13:30', '17:00'], topics: [], reasons: [], goals: [], categories: [], noMeetingReasons: [], levels: [], signatures: [], prefillHoursBefore: 2};
    if (!Array.isArray(m.statusSet)) m.statusSet = ['Accepted', 'Not accepted', 'Pending', 'Awaiting attending’s order', 'Accepted and closed', 'Closed'];
    return m; };
  // 醫院牆上時間（示範時鐘）：寫進紀錄的時間戳一律用這個，不用瀏覽器的現在。
  const wallNow = s => { const ms = TZ().millis(String(s.demoClock || '')); return Number.isFinite(ms) ? TZ().wall(ms).slice(0, 16) : '2026-11-04T09:40'; };
  const today = s => wallNow(s).slice(0, 10);
  const days = (from, to) => Math.round((Date.parse(String(to).slice(0, 10)) - Date.parse(String(from).slice(0, 10))) / 864e5);
  const plusHours = (wall, h) => { const d = new Date(Date.parse(String(wall).slice(0, 16) + ':00Z') + h * 3600e3); return d.toISOString().slice(0, 16); };
  const hoursBetween = (a, b) => Math.round((Date.parse(String(b).slice(0, 16) + ':00Z') - Date.parse(String(a).slice(0, 16) + ':00Z')) / 36e5 * 10) / 10;

  // ---- 查詢 ----
  const teamOf = (s, id) => ensure(s).teams.find(t => t.id === id) || null;
  const sessionOf = (s, id) => ensure(s).sessions.find(x => x.id === id) || null;
  const proposalOf = (s, id) => ensure(s).proposals.find(x => x.id === id) || null;
  const recordOf = (s, id) => ensure(s).records.find(x => x.id === id) || null;
  const taskOf = (s, id) => ensure(s).tasks.find(x => x.id === id) || null;
  const recordForProposal = (s, pid) => ensure(s).records.filter(r => r.proposal === pid && r.status !== 'superseded').sort((a, b) => b.version - a.version)[0] || null;
  const recordsForProposal = (s, pid) => ensure(s).records.filter(r => r.proposal === pid).sort((a, b) => b.version - a.version);
  const memberRole = (team, a) => { const m = ((team && team.members) || []).find(x => x.who === a); return m ? m.role : null; };
  const isMember = (team, a) => !!memberRole(team, a);
  const isOfficer = (team, a) => ['chair', 'secretary', 'coordinator'].includes(memberRole(team, a));
  const patientOf = (s, pr) => pr && pr.p ? s.patients.find(x => x.id === pr.p) || null : null;
  const suggestTeam = (s, p) => { const pt = s.patients.find(x => x.id === p); const code = (pt && pt.icd && pt.icd.code) || ''; const t = ensure(s).teams.find(t => (t.icdPrefixes || []).some(pre => code.startsWith(pre))); return t ? t.id : ((ensure(s).teams[0] || {}).id || ''); };
  const upcoming = (s, teamId) => ensure(s).sessions.filter(x => x.team === teamId && ['scheduled', 'open', 'inProgress'].includes(x.status)).sort((a, b) => a.date.localeCompare(b.date));
  const sessionsOf = (s, teamId) => ensure(s).sessions.filter(x => x.team === teamId).sort((a, b) => a.date.localeCompare(b.date));
  const agenda = (s, sessionId) => ensure(s).proposals.filter(x => x.session === sessionId && !['draft', 'withdrawn'].includes(x.status)).sort((a, b) => (a.seq || 99) - (b.seq || 99));
  const activeProposals = (s, p) => ensure(s).proposals.filter(x => x.p === p && !['concluded', 'withdrawn', 'deferred'].includes(x.status));
  const proposalsFor = (s, p) => ensure(s).proposals.filter(x => x.p === p).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const tasksFor = (s, p) => ensure(s).tasks.filter(x => x.p === p);
  const caseName = pr => pr.external ? pr.external.name : '';
  // 任務狀態：已採納開單的任務，醫囑有一筆給藥完成就算「已開始」（不改資料，顯示時算）。
  const taskState = (s, t) => { if (t.state === 'adopted' && (t.orderIds || []).length && (s.executions || []).some(e => t.orderIds.includes(e.order) && e.status === 'done')) return 'started'; return t.state; };
  const overdue = (s, t) => !['done', 'unable'].includes(taskState(s, t)) && !!t.due && t.due < today(s);
  const taskFor = (s, id, p) => { const t = taskOf(s, id); return !!t && t.p === p; };
  // P3 查詢
  const disciplineOf = (s, id) => ensure(s).disciplines.find(d => d.id === id) || null;
  const refOf = (s, id) => ensure(s).refs.find(r => r.id === id) || null;
  const refsFor = (s, p) => ensure(s).refs.filter(r => r.p === p).sort((a, b) => String(a.requestedAt || '').localeCompare(String(b.requestedAt || '')));
  const refFor = (s, id, p) => { const r = refOf(s, id); return !!r && r.p === p; };
  const confOf = (s, id) => ensure(s).conferences.find(c => c.id === id) || null;
  const confsFor = (s, p) => ensure(s).conferences.filter(c => c.p === p).sort((a, b) => String(a.at || a.decidedAt || '').localeCompare(String(b.at || b.decidedAt || '')));
  const prefillsFor = (s, pid) => ensure(s).prefills.filter(x => x.proposal === pid);
  const prefillOf = (s, pid, who) => ensure(s).prefills.find(x => x.proposal === pid && x.who === who) || null;
  // 職類帳號屬於哪個職類：範本的 staff 名單優先，否則比對科別名稱。
  const myDiscipline = (s, a) => { const who = s.people[a]; if (!who) return null; const m = ensure(s); return m.disciplines.find(d => (d.staff || []).includes(a)) || m.disciplines.find(d => d.unit === who.department || d.name === who.department || (d.id === 'physio' && who.department === 'Rehabilitation')) || null; };
  const headOfDept = (s, dept) => Object.keys(s.people).find(k => { const x = s.people[k]; return x.role === 'doctor' && x.deptAdmin && x.department === dept && x.active !== false; }) || null;
  const coordinatorOf = (s, dept) => Object.keys(s.people).find(k => { const x = s.people[k]; return x.role === 'nurse' && x.deptAdmin && x.department === dept && x.active !== false; }) || null;
  const secretaryDefault = (s, dept) => { const t = ensure(s).teams.find(t => t.members.some(m => m.role === 'secretary' && (s.people[m.who] || {}).department === dept)); return t ? t.members.find(m => m.role === 'secretary').who : null; };
  // 會議層級：病人科別＋有專科照會的醫師科別；職類（營養、藥學、復健、社工）不計科數。
  const levelFor = (s, p) => { const pt = s.patients.find(x => x.id === p) || {}; const depts = new Set([pt.department].filter(Boolean));
    (s.consultations || []).filter(c => c.p === p).forEach(c => { const d = (s.people[c.assignee] || {}).department; if (d) depts.add(d); });
    const n = depts.size, id = n <= 1 ? 'dept' : n === 2 ? 'inter' : 'hospital'; const rule = (ensure(s).rules.levels || []).find(l => l.id === id) || {id, name: id};
    return {id, rule, departments: [...depts], count: n}; };
  // 召開提示：這次住院的職類照會數 ≥ 院規、或社工標「困難出院」；已在常設團隊議程不提示；已有召開決定就顯示結果。
  const prompt = (s, p) => { const m = ensure(s), refs = refsFor(s, p).filter(r => r.status !== 'draft'); const flags = [...new Set(refs.flatMap(r => [...(r.interim && r.interim.flags || []), ...(r.reply && r.reply.flags || [])]))];
    const onAgenda = activeProposals(s, p).find(x => x.status !== 'draft') || null; const decided = confsFor(s, p).filter(c => ['team', 'deferred'].includes(c.kind)).slice(-1)[0] || null;
    const met = refs.length >= (m.rules.trigger || 3) || flags.some(f => (m.rules.promptFlags || []).includes(f));
    return {count: refs.length, flags, onAgenda, decided, met, show: met && !onAgenda && !decided}; };

  // ---- 摘要包 8 項：即時讀病歷（住院）或固定內容（門診 packFixed）----
  function item(s, pr, k) {
    const p = pr.p, pt = s.patients.find(x => x.id === p) || {}; const reps = (s.reports || []).filter(r => r.p === p);
    const key = r => (r.catalog && r.catalog.key) || ''; const returned = r => r.status === 'returned';
    const latest = list => list.slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0];
    const d = at => String(at || '').slice(0, 10);
    switch (k) {
      case 'pathology': { const r = latest(reps.filter(x => returned(x) && ['service:L050', 'service:L053'].includes(key(x)))); if (!r) return {ok: false, text: 'No histology report on file', source: {view: 'results', labView: 'exams'}};
        const st = r.structured || {}; return {ok: true, text: [st.histology, st.grade, st.lvi ? 'LVI: ' + st.lvi : '', st.dcis ? 'DCIS: ' + st.dcis : ''].filter(Boolean).join(' · ') || r.impression || '', at: r.at, ref: r.id, source: {view: 'results', labView: 'exams', result: r.id}}; }
      case 'biomarkers': { const r = latest(reps.filter(x => returned(x) && ['service:L051', 'service:L052'].includes(key(x)))); if (!r) return {ok: false, text: 'No receptor / HER2 panel on file', source: {view: 'results', labView: 'exams'}};
        const st = r.structured || {}; return {ok: true, text: [st.er ? 'ER ' + st.er : '', st.pr ? 'PR ' + st.pr : '', st.her2 ? 'HER2 ' + st.her2 : '', st.ki67 ? 'Ki-67 ' + st.ki67 : '', st.subtype || ''].filter(Boolean).join(' · ') || r.impression || '', at: r.at, ref: r.id, source: {view: 'results', labView: 'exams', result: r.id}}; }
      case 'staging': { const m = String(pt.problem || '').match(/\b[cpy]{0,2}T[0-9a-z]+ ?N[0-9a-z]+ ?M[0-9a-z]+\b(?: [^·]*?stage [IVX0-4ABC]+)?/i); const ct = latest(reps.filter(x => returned(x) && ['service:X007', 'service:X013'].includes(key(x)))); const bone = latest(reps.filter(x => returned(x) && key(x) === 'service:X012'));
        return {ok: !!m && !!ct, text: [m ? m[0].trim() : 'No TNM stage recorded', ct ? (ct.examType || 'CT') + ' ' + d(ct.at) + ': ' + (ct.impression || '') : 'No staging CT / PET-CT on file', bone ? 'Bone scan ' + d(bone.at) + ': ' + (bone.impression || '') : ''].filter(Boolean).join(' · '), at: ct && ct.at, ref: ct && ct.id, source: {view: 'results', labView: 'exams'}}; }
      case 'imaging': { const list = reps.filter(x => returned(x) && x.kind === 'Exam' && ['Mammography', 'Ultrasound', 'CT', 'MRI', 'X-ray', 'Nuclear medicine', 'PET-CT'].includes(x.examType)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
        if (!list.length) return {ok: false, text: 'No imaging report on file', source: {view: 'results', labView: 'exams'}}; return {ok: true, text: list.slice(0, 4).map(r => r.examType + ' ' + d(r.at) + ': ' + (r.impression || '')).join(' · '), at: list[0].at, ref: list[0].id, source: {view: 'results', labView: 'exams'}}; }
      case 'labs': { const cbc = latest(reps.filter(x => returned(x) && key(x) === 'service:L001')), lft = latest(reps.filter(x => returned(x) && key(x) === 'service:L003')), rft = latest(reps.filter(x => returned(x) && key(x) === 'service:L004'));
        const age = cbc ? days(cbc.at, today(s)) : null, fresh = !!cbc && age !== null && age <= 14;
        const comp = (r, id) => { const c = r && (r.components || []).find(x => x.id === 'DEMO-' + id); return c ? c.name.replace(/\s*\(.*\)/, '') + ' ' + c.value + (c.interpretation && c.interpretation !== 'N' ? ' (' + c.interpretation + ')' : '') : ''; };
        return {ok: fresh, text: cbc ? [d(cbc.at) + (fresh ? '' : ' (older than 14 days)'), comp(cbc, 'WBC'), comp(cbc, 'ANC'), comp(cbc, 'HB'), comp(cbc, 'PLT'), comp(rft, 'CR'), comp(lft, 'ALT'), comp(lft, 'TBIL')].filter(Boolean).join(' · ') : 'No baseline blood tests on file', at: cbc && cbc.at, ref: cbc && cbc.id, source: {view: 'results'}}; }
      case 'performance': return pr.ecog !== '' && pr.ecog !== undefined && pr.ecog !== null ? {ok: true, text: 'ECOG ' + pr.ecog, source: null} : {ok: false, text: 'ECOG performance status not recorded in the proposal', source: null};
      case 'cardiac': { const echo = latest(reps.filter(x => returned(x) && key(x) === 'service:X014')), ecg = latest(reps.filter(x => returned(x) && key(x) === 'service:X015')), pend = reps.find(x => x.status === 'pending' && key(x) === 'service:X014');
        if (echo) return {ok: true, text: 'Echocardiography ' + d(echo.at) + ': ' + (echo.impression || '') + (ecg ? ' · ECG ' + d(ecg.at) + ': ' + (ecg.impression || '') : ''), at: echo.at, ref: echo.id, source: {view: 'results', labView: 'exams', result: echo.id}};
        return {ok: false, text: (ecg ? 'ECG ' + d(ecg.at) + ': ' + (ecg.impression || '') + ' · ' : '') + 'LVEF not yet available' + (pend ? ' — ' + (pend.note || 'echocardiography pending') : ''), source: {view: 'results', labView: 'exams'}}; }
      case 'wishes': return pr.wishes && String(pr.wishes).trim() ? {ok: true, text: pr.wishes, source: null} : {ok: false, text: 'Patient preference not yet recorded (ask the patient / family before the meeting)', source: null};
    }
    return {ok: false, text: ''};
  }
  function readiness(s, pr) {
    if (!pr) return {items: [], ok: 0, total: ITEMS.length, missing: []};
    const items = pr.external ? ITEMS.map(([k, label]) => { const f = (pr.packFixed || {})[k] || {ok: false, text: ''}; return {key: k, label, ok: !!f.ok, text: f.text || '', source: null}; }) : ITEMS.map(([k, label]) => ({key: k, label, ...item(s, pr, k)}));
    const ok = items.filter(x => x.ok).length;
    return {items, ok, total: items.length, missing: items.filter(x => !x.ok)};
  }
  // 既往、過敏、現行用藥、家屬：摘要包的補充卡（不計入 8 項）。
  function history(s, pr) {
    const pt = patientOf(s, pr); if (!pt) return null;
    const conds = (pt.conditions || []).filter(c => c.rank === 'secondary').map(c => c.code.code + ' ' + (c.code.english || c.code.name));
    const meds = (s.orders || []).filter(o => o.p === pt.id && o.kind === 'medication' && o.clinical === 'active').map(o => o.name + ' ' + (o.dose || '') + ' · ' + (o.frequency || ''));
    return {comorbidities: conds, allergy: pt.allergy, meds, family: (pt.relatedPersons || []).map(r => r.name + ' (' + r.relationship + ')')};
  }
  function suggestSummary(s, pr) {
    const pt = patientOf(s, pr); if (!pt) return pr && pr.external ? pr.external.dx : '';
    const r = readiness(s, pr), age = pt.birthDate ? Math.floor(days(pt.birthDate, today(s)) / 365.25) : '';
    const get = k => (r.items.find(x => x.key === k) || {}).text || '';
    return [pt.name + ', ' + (age ? age + '-year-old ' : '') + (pt.gender || '') + '. ' + (pt.problem || ''), 'Pathology: ' + get('pathology'), 'Biomarkers: ' + get('biomarkers'), 'Staging: ' + get('staging'), 'Baseline labs: ' + get('labs'), get('performance'), 'Cardiac: ' + get('cardiac'), 'Patient wishes: ' + get('wishes')].filter(Boolean).join('\n');
  }
  // 病人一句話摘要（職類照會的臨床摘要、個案會議 B.1）：年齡性別＋病情＋最近病程的 A 段。
  function patientSummary(s, p) {
    const pt = s.patients.find(x => x.id === p); if (!pt) return '';
    const age = pt.birthDate ? Math.floor(days(pt.birthDate, today(s)) / 365.25) + '-year-old ' : '';
    const note = (s.notes || []).filter(n => n.p === p && n.soap && !n.voided).sort((a, b) => String(b.clinicalAt || b.at).localeCompare(String(a.clinicalAt || a.at)))[0];
    return age + (pt.gender || '') + ', ' + (pt.problem || '') + (note && note.soap.A ? ' Latest assessment: ' + note.soap.A : '');
  }
  // 指標（26 儀表板）
  function metrics(s, teamId) {
    const m = ensure(s), t = today(s), since = new Date(Date.parse(t) - 56 * 864e5).toISOString().slice(0, 10);
    const props = m.proposals.filter(x => (!teamId || x.team === teamId) && !['draft', 'withdrawn'].includes(x.status));
    const concluded = props.filter(x => x.status === 'concluded'), sessions = m.sessions.filter(x => (!teamId || x.team === teamId) && x.status === 'concluded' && x.date >= since);
    const tasks = m.tasks.filter(x => !teamId || x.team === teamId), due = tasks.filter(x => x.due && x.due <= t);
    const onTime = due.filter(x => ['done', 'started', 'adopted'].includes(taskState(s, x))).length, over = tasks.filter(x => overdue(s, x)).length;
    const ready = props.filter(x => readiness(s, x).ok === ITEMS.length).length;
    return {discussed: concluded.length, onAgenda: props.filter(x => ['submitted', 'discussed'].includes(x.status)).length, sessions: sessions.length, ready, proposals: props.length, readyRate: props.length ? Math.round(ready / props.length * 100) : 0, tasks: tasks.length, due: due.length, onTime, onTimeRate: due.length ? Math.round(onTime / due.length * 100) : 0, overdue: over};
  }
  // 會前預填統計（22b）：邀請名單、各人狀態、問題票數、會中待討論點。
  function prefillStats(s, pr) {
    const inv = pr.prefillInvite || {members: [], reminders: {}}, sess = sessionOf(s, pr.session), deadline = sess ? plusHours(sess.date + 'T' + sess.time, -((ensure(s).rules.prefillHoursBefore) || 2)) : null;
    const rows = (inv.members || []).map(who => { const pf = prefillOf(s, pr.id, who); const st = !pf ? 'none' : pf.status === 'sent' ? (deadline && pf.at > deadline ? 'late' : 'sent') : 'draft'; return {who, pf, status: st, reminders: (inv.reminders || {})[who] || 0}; });
    const sent = rows.filter(r => r.status === 'sent' || r.status === 'late'), drafts = rows.filter(r => r.status === 'draft'), none = rows.filter(r => r.status === 'none');
    const qs = (pr.questions || []).map(q => { const answers = sent.map(r => ({who: r.who, a: (r.pf.answers || {})[q.id] || ''})).filter(x => x.a); const tally = {}; answers.forEach(x => { tally[x.a] = (tally[x.a] || 0) + 1; });
      return {q, answers, tally, answered: answers.filter(x => x.a !== OUT_OF_FIELD).length, outside: answers.filter(x => x.a === OUT_OF_FIELD).length}; });
    const discuss = sent.filter(r => r.pf.discuss).map(r => ({who: r.who, text: r.pf.discuss}));
    return {rows, sent, drafts, none, qs, discuss, deadline, invite: inv};
  }
  // 預填 → B.3 意見的文字：本科重點＋有回答的問題＋會中待討論。
  const composeOpinion = (pr, pf) => { if (!pf) return ''; const parts = [pf.own]; (pr.questions || []).forEach(q => { const a = (pf.answers || {})[q.id]; if (a && a !== OUT_OF_FIELD) parts.push(q.id + ': ' + a); }); if ((pf.tests || []).length) parts.push('Recommended tests: ' + pf.tests.join('; ')); if (pf.discuss) parts.push('For discussion: ' + pf.discuss); return parts.filter(Boolean).join(' '); };
  // 字詞層級差異（23b：會中修改的 ins／del）：最長共同子序列。
  function wordDiff(a, b) {
    const x = String(a || '').split(/(\s+)/).filter(Boolean), y = String(b || '').split(/(\s+)/).filter(Boolean), n = x.length, m = y.length;
    if (n * m > 250000) return [{t: '-', s: a}, {t: '+', s: b}];
    const L = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0; const push = (t, s) => { const last = out[out.length - 1]; if (last && last.t === t) last.s += s; else out.push({t, s}); };
    while (i < n && j < m) { if (x[i] === y[j]) { push('=', x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { push('-', x[i]); i++; } else { push('+', y[j]); j++; } }
    while (i < n) push('-', x[i++]); while (j < m) push('+', y[j++]);
    return out;
  }
  // 我的 MDT 待辦：提案草稿、逾截止確認、任務、未確認意見、出席回覆；P3：待決定的職類照會回覆、待核准／待排程／待確認的個案會議、未送出的預填、職類的待接收。
  function todos(s, a) {
    const m = ensure(s), out = [], who = s.people[a] || {};
    m.proposals.filter(x => x.status === 'draft' && x.proposer === a).forEach(x => out.push({kind: 'proposal', id: x.id, p: x.p, text: 'Complete and submit proposal ' + x.id, tone: 'warning'}));
    m.proposals.filter(x => x.status === 'submitted' && x.late && !x.lateConfirmed && memberRole(teamOf(s, x.team), a) === 'coordinator').forEach(x => out.push({kind: 'late', id: x.id, p: x.p, text: 'Confirm late proposal ' + x.id + ' for the agenda', tone: 'warning'}));
    m.tasks.filter(x => x.owner === a && !['done', 'unable'].includes(taskState(s, x))).forEach(x => out.push({kind: 'task', id: x.id, p: x.p, text: (taskState(s, x) === 'pending' ? 'Receive task: ' : 'Follow up task: ') + x.text, tone: overdue(s, x) ? 'danger' : taskState(s, x) === 'pending' ? 'warning' : 'info', overdue: overdue(s, x)}));
    m.records.filter(r => r.status === 'draft').forEach(r => (r.opinions || []).filter(o => o.who === a && !o.confirmed).forEach(() => out.push({kind: 'opinion', id: r.proposal, p: r.p, text: 'Confirm your opinion in record ' + r.id, tone: 'warning'})));
    m.proposals.filter(x => ['submitted', 'discussed'].includes(x.status) && x.prefill && x.prefillInvite && x.prefillInvite.members.includes(a)).forEach(x => { const pf = prefillOf(s, x.id, a); if (!pf || pf.status !== 'sent') out.push({kind: 'prefill', id: x.id, p: x.p, text: 'Pre-meeting input for case ' + x.id + (pf ? ' (draft saved)' : ''), tone: 'warning'}); });
    m.sessions.filter(x => ['scheduled', 'open'].includes(x.status) && isMember(teamOf(s, x.team), a) && !x.attendance[a]).forEach(x => out.push({kind: 'attendance', id: x.id, team: x.team, text: 'Reply attendance: ' + (teamOf(s, x.team) || {}).name + ' ' + x.date + ' ' + x.time, tone: 'muted'}));
    if (who.role === 'doctor') {
      m.refs.filter(r => r.status === 'replied' && !r.decision && r.p && W().canWrite(s, r.p, a)).forEach(r => out.push({kind: 'ref', id: r.id, p: r.p, text: 'Allied-health consult reply awaiting your decision: ' + ((disciplineOf(s, r.discipline) || {}).name || r.discipline) + ' ' + r.id, tone: 'warning'}));
      m.conferences.filter(c => c.status === 'pendingApproval' && headOfDept(s, (s.patients.find(x => x.id === c.p) || {}).department) === a).forEach(c => out.push({kind: 'conf', id: c.id, p: c.p, text: 'Approve case conference request ' + c.id, tone: 'warning'}));
      m.conferences.filter(c => c.status === 'review' && c.chair === a).forEach(c => out.push({kind: 'conf', id: c.id, p: c.p, text: 'Confirm case conference record ' + c.id, tone: 'warning'}));
      s.patients.forEach(pt => { if (W().isAttending(s, pt.id, a)) { const pr = prompt(s, pt.id); if (pr.show) out.push({kind: 'prompt', id: pt.id, p: pt.id, text: 'Meeting prompt: ' + pr.count + ' allied-health consults this admission — decide on a case conference', tone: 'info'}); } });
    }
    if (who.role === 'nurse') m.conferences.filter(c => c.status === 'approved' && (c.organiser === a || coordinatorOf(s, (s.patients.find(x => x.id === c.p) || {}).department) === a)).forEach(c => out.push({kind: 'conf', id: c.id, p: c.p, text: 'Schedule case conference ' + c.id + ' and send invitations', tone: 'warning'}));
    if (who.role === 'allied') { const d = myDiscipline(s, a); m.refs.filter(r => d && r.discipline === d.id && ['requested', 'inProgress'].includes(r.status)).forEach(r => out.push({kind: 'refReply', id: r.id, p: r.p, text: (r.status === 'requested' ? 'Pick up consult ' : 'Complete reply for consult ') + r.id, tone: r.status === 'requested' ? 'warning' : 'info'})); }
    return out;
  }

  // ---- 權限（取代 workflow.guard 對這些動作的檢查）----
  function guard(s, action, a, p, payload) {
    const must = (b, msg) => { if (!b) throw Error(msg); }; const person = s.people[a]; must(person && person.active !== false, 'This staff member is deactivated or does not exist');
    if (action === 'mdtDemoEvent') return;
    must(person.role !== 'admin', 'Admin accounts cannot perform MDT actions');
    const pr = (payload.proposal && proposalOf(s, payload.proposal)) || (payload.id && proposalOf(s, payload.id)) || null;
    const team = pr ? teamOf(s, pr.team) : payload.team ? teamOf(s, payload.team) : payload.session ? teamOf(s, (sessionOf(s, payload.session) || {}).team) : null;
    const ref = /^ref/.test(action) ? (payload.id ? refOf(s, payload.id) : null) : null;
    const conf = /^(case|family)/.test(action) ? (payload.id ? confOf(s, payload.id) : null) : null;
    const dept = pid => (s.patients.find(x => x.id === pid) || {}).department;
    switch (action) {
      case 'mdtPropose': must(s.patients.some(x => x.id === p), 'A valid patient is required'); must(person.role === 'doctor' && W().canOrder(s, p, a), 'Only doctors caring for this patient can propose a case'); if (pr) must(pr.proposer === a || W().isAttending(s, pr.p, a), 'Only the proposer or the doctor on duty can edit this proposal'); return;
      case 'mdtWithdraw': must(pr, 'Proposal not found'); must(pr.proposer === a || (pr.p && W().isAttending(s, pr.p, a)) || isOfficer(team, a), 'Only the proposer, the doctor on duty or team officers can withdraw a proposal'); return;
      case 'mdtWishesSave': must(pr, 'Proposal not found'); must(pr.proposer === a || (pr.p && (W().canWrite(s, pr.p, a) || W().canNurse(s, pr.p, a))) || isOfficer(team, a), 'Only the care team can record the patient’s wishes'); return;
      case 'mdtProposalConfirm': must(pr, 'Proposal not found'); must(isOfficer(team, a), 'Only the coordinator, secretary or chair can confirm a late proposal'); return;
      case 'mdtAttendanceReply': must(team, 'Team not found'); must(isMember(team, a), 'Only team members can reply'); return;
      case 'mdtAttendanceMark': case 'mdtSessionStart': case 'mdtSessionConclude': must(team, 'Team not found'); must(isOfficer(team, a), 'Only the chair, secretary or coordinator can do this'); return;
      case 'mdtOpinionSave': must(pr && team, 'Case not found'); must(isMember(team, a) || (pr.p && W().canWrite(s, pr.p, a)), 'Only team members can record opinions'); if (payload.who && payload.who !== a) must(['secretary', 'chair'].includes(memberRole(team, a)), 'Only the secretary or chair can write on behalf of another member'); return;
      case 'mdtOpinionConfirm': must(pr && team, 'Case not found'); must(payload.who === a, 'Each member confirms only their own opinion'); return;
      case 'mdtConclusionSave': case 'mdtPlanSave': must(pr && team, 'Case not found'); must(['secretary', 'chair'].includes(memberRole(team, a)), 'Only the secretary or chair can edit the meeting record'); return;
      case 'mdtRecordLock': must(pr && team, 'Case not found'); must(memberRole(team, a) === 'chair', 'Only the chair confirms and locks the record'); return;
      case 'mdtRecordRevise': must(pr && team, 'Case not found'); must(['secretary', 'chair'].includes(memberRole(team, a)), 'Only the secretary or chair can open a revision'); return;
      case 'mdtTaskAccept': case 'mdtTaskComplete': case 'mdtTaskUnable': { const t = taskOf(s, payload.id); must(t, 'Task not found'); must(t.owner === a || W().isDeptStaff(s, a, t.dept) || (person.role === 'allied' && person.department === t.dept), 'Only the task owner or staff of ' + t.dept + ' can update this task'); return; }
      case 'mdtRepropose': { const t = taskOf(s, payload.id); must(t && t.p, 'Task not found'); must(person.role === 'doctor' && W().canOrder(s, t.p, a), 'Only doctors caring for this patient can propose a case'); return; }
      // P3 會前預填
      case 'mdtPrefillSave': must(pr && team, 'Case not found'); must(isMember(team, a) || ((pr.prefillInvite || {members: []}).members.includes(a)), 'Only invited team members can enter pre-meeting input'); return;
      case 'mdtPrefillRemind': must(pr && team, 'Case not found'); must(isOfficer(team, a) || pr.proposer === a, 'Only the coordinator, secretary, chair or proposer can send reminders'); return;
      // P3 職類照會
      case 'refRequest': must(s.patients.some(x => x.id === p), 'A valid patient is required'); must(person.role === 'doctor' && W().canWrite(s, p, a), 'Only doctors caring for this patient can request an allied-health consult'); return;
      case 'refAddQuestion': case 'refDecide': must(ref, 'Consult not found'); must(person.role === 'doctor' && W().canWrite(s, ref.p, a), 'Only the doctor on duty or care doctors of this patient can do this'); return;
      case 'refPickUp': case 'refInterim': case 'refReply': { must(ref, 'Consult not found'); const d = myDiscipline(s, a); must(person.role === 'allied' && d && d.id === ref.discipline, 'Only ' + ((disciplineOf(s, ref.discipline) || {}).name || 'that discipline') + ' staff can reply to this consult'); return; }
      // P3 個案會議
      case 'caseDecide': must(s.patients.some(x => x.id === p), 'A valid patient is required'); must(person.role === 'doctor' && W().canWrite(s, p, a), 'Only the doctor on duty or care doctors can decide on a case conference'); return;
      case 'caseApprove': must(conf, 'Case conference not found'); must(headOfDept(s, dept(conf.p)) === a, 'Only the Head of Department approves a case conference'); return;
      case 'caseSchedule': must(conf, 'Case conference not found'); must(coordinatorOf(s, dept(conf.p)) === a || conf.organiser === a || conf.secretary === a, 'Only the department coordinator or secretary schedules the meeting'); return;
      case 'caseAttendanceMark': case 'caseRecordSave': case 'casePlanSave': case 'caseRecordSend': must(conf, 'Case conference not found'); must(conf.secretary === a || conf.chair === a, 'Only the secretary or chair edits the record'); return;
      case 'caseOpinionSave': must(conf, 'Case conference not found'); must(conf.secretary === a || conf.chair === a || (payload.who === a && (conf.participants || []).some(x => x.who === a)), 'Only participants record opinions; the secretary may write on a participant’s behalf'); if (payload.who && payload.who !== a) must(conf.secretary === a || conf.chair === a, 'Only the secretary or chair can write on behalf of another participant'); return;
      case 'caseOpinionConfirm': must(conf, 'Case conference not found'); must(payload.who === a, 'Each participant confirms only their own opinion'); return;
      case 'caseRecordLock': must(conf, 'Case conference not found'); must(conf.chair === a, 'Only the chair confirms and locks the record'); return;
      case 'familyMeetingCreate': must(s.patients.some(x => x.id === p), 'A valid patient is required'); must((person.role === 'doctor' && W().canWrite(s, p, a)) || person.role === 'allied' || coordinatorOf(s, dept(p)) === a, 'Only the care team can arrange a family meeting'); return;
      case 'familyMeetingSave': case 'familyMeetingSign': must(conf && conf.kind === 'family', 'Family meeting not found'); must((person.role === 'doctor' && W().canWrite(s, conf.p, a)) || person.role === 'allied' || coordinatorOf(s, dept(conf.p)) === a || W().canNurse(s, conf.p, a), 'Only the care team records the family meeting'); return;
    }
    throw Error('Unsupported MDT action');
  }

  // ---- 寫入 ----
  function handle(n, action, a, payload, env) {
    if (!owns(action)) return false;
    const {must, text} = env; const opt = env.opt || ((v, label) => { const t = String(v ?? '').trim(); must(t.length <= 5000, (label || 'Content') + ' is too long'); return t; });
    const m = ensure(n), now = wallNow(n), dayNow = today(n), people = n.people, person = people[a] || {};
    const log = (ref, event, extra) => m.log.push({at: now, by: a, action, ref, event, ...(extra || {})});
    const nextId = (prefix, list) => { const base = prefix + '-' + dayNow.slice(5, 7) + dayNow.slice(8, 10) + '-'; let i = list.filter(x => x.id.startsWith(base)).length + 1, cand; do { cand = base + String(i++).padStart(2, '0'); } while (list.some(x => x.id === cand)); return cand; };
    const nm = k => (people[k] || {}).name || k || '—';
    const pr = (payload.proposal && proposalOf(n, payload.proposal)) || (payload.id && proposalOf(n, payload.id)) || null;
    const snapshot = (x, stage) => { x.packSnapshots = x.packSnapshots || []; x.packSnapshots.push({at: now, by: a, stage, items: readiness(n, x).items.map(i => ({key: i.key, ok: i.ok, text: i.text, ref: i.ref || null, at: i.at || null}))}); };
    const multi = v => Array.isArray(v) ? v : String(v || '').split(',').map(x => x.trim()).filter(Boolean);
    const lines = v => String(v || '').split('\n').map(x => x.trim()).filter(Boolean);
    // 摘錄進病歷：病程紀錄一筆（S 來源、O 摘要、A 結論、P 處置計畫），已簽；建議經主治採納才成醫囑。
    const excerpt = (noteId, p, title, summary, conclusion, planText, refId) => { const soap = {S: title, O: summary || '(no summary recorded)', A: conclusion, P: planText + '\nTeam recommendations become orders only after adoption by the doctor on duty.'};
      n.notes.push({id: noteId, p, kind: 'Progress', noteType: 'progress', progressKind: 'soap', soap, text: ['S', 'O', 'A', 'P'].map(k => k + ': ' + soap[k]).join('\n\n'), sections: null, diagnoses: [], clinicalAt: now, at: now, author: a, version: 1, status: 'signed', reviewStatus: 'completed', signedAt: now, references: [refId], copyTrace: null, source: 'Meeting record excerpt (demo)', mdtRecord: refId}); return noteId; };
    // 會議紀錄草稿（團隊會議）：沒有就開一份；有預填的個案把已送出的預填帶進 B.3。
    const recordDraft = x => { let r = m.records.find(r => r.proposal === x.id && r.status === 'draft'); if (r) return r;
      const prev = recordsForProposal(n, x.id)[0]; r = {id: nextId('REC', m.records), proposal: x.id, p: x.p || null, team: x.team, session: x.session, version: prev ? prev.version + 1 : 1, status: 'draft', summary: '', opinions: [], conclusion: '', consensus: 'unanimous', dissent: '', actions: [], createdAt: now, createdBy: a};
      if (x.prefill) prefillsFor(n, x.id).filter(pf => pf.status === 'sent').forEach(pf => r.opinions.push({who: pf.who, text: composeOpinion(x, pf), confirmed: false, by: pf.who, at: pf.at, fromPrefill: {at: pf.at, text: composeOpinion(x, pf)}}));
      m.records.push(r); if (x.status === 'submitted') x.status = 'discussed'; x.record = r.id; return r; };
    // 個案會議紀錄草稿：職類照會的回覆帶進 B.3（來源 ref），主治與護理師留空待會中填。
    const caseDraft = c => { if (c.record && c.record.status !== 'locked') return c.record; if (c.record && c.record.status === 'locked') return c.record;
      const p = c.p; const ops = [];
      (c.participants || []).forEach(pt => { if (['chair', 'secretary', 'coordinator'].includes(pt.role)) return; const ref = (c.refs || []).map(id => refOf(n, id)).find(r => r && r.assignee === pt.who && r.status === 'replied');
        if (ref) ops.push({who: pt.who, text: replySummary(n, ref), confirmed: false, by: pt.who, at: ref.repliedAt, source: 'ref', ref: ref.id, fromPrefill: {at: ref.repliedAt, text: replySummary(n, ref)}}); });
      c.record = {version: 1, status: 'draft', summary: patientSummary(n, p), opinions: ops, conclusion: '', consensus: 'unanimous', dissent: '', actions: [], createdAt: now, createdBy: a}; return c.record; };
    const pushTasks = (ownerRef, p, team, actions, label) => actions.forEach(ac => { let t = m.tasks.find(x => x[ownerRef.key] === ownerRef.id && x.seq === ac.seq && !['done', 'unable'].includes(x.state));
      if (t) { Object.assign(t, {kind: ac.kind, text: ac.text, owner: ac.owner, dept: ac.dept, due: ac.due}); t.log.push({at: now, by: a, event: 'revised'}); }
      else m.tasks.push({id: 'MT-' + label + '-' + ac.seq, [ownerRef.key]: ownerRef.id, record: ownerRef.record || null, proposal: ownerRef.key === 'proposal' ? ownerRef.id : null, conference: ownerRef.key === 'conference' ? ownerRef.id : null, p, team: team || null, seq: ac.seq, kind: ac.kind, text: ac.text, owner: ac.owner, dept: ac.dept, due: ac.due, state: ac.state || 'pending', orderIds: ac.orderIds || [], createdAt: now, log: [{at: now, by: a, event: 'created'}]}); });
    const planRows = () => { const rows = []; for (let i = 1; i <= 8; i++) { const t = opt(payload['text:' + i], 'Action ' + i); if (!t) continue; const kind = KIND[payload['kind:' + i]] ? payload['kind:' + i] : 'treatment'; const owner = String(payload['owner:' + i] || ''); must(people[owner], 'Select an owner for action ' + i); const due = String(payload['due:' + i] || ''); must(/^\d{4}-\d\d-\d\d$/.test(due), 'Enter a due date for action ' + i); rows.push({seq: rows.length + 1, kind, text: t, owner, dept: people[owner].department || '', due, state: 'pending'}); } return rows; };
    const ref = /^ref/.test(action) && payload.id ? refOf(n, payload.id) : null;
    const conf = /^(case|family)/.test(action) && payload.id ? confOf(n, payload.id) : null;
    switch (action) {
      // ---------------- 團隊會議 MDT（P2）----------------
      case 'mdtPropose': {
        const p = payload.p, teamId = String(payload.team || ''), team = teamOf(n, teamId); must(team, 'Select a team');
        const sessionId = String(payload.session || ''), sess = sessionOf(n, sessionId); must(sess && sess.team === teamId && ['scheduled', 'open', 'inProgress'].includes(sess.status), 'Select an upcoming session of this team');
        const submit = payload.submit === '1' || payload.submit === true;
        const q = submit ? text(payload.question, 'Clinical question for the team') : opt(payload.question, 'Clinical question');
        const type = TYPE[payload.type] ? payload.type : 'new', urgency = ['routine', 'urgent'].includes(payload.urgency) ? payload.urgency : 'routine';
        const presenter = people[payload.presenter] && people[payload.presenter].role === 'doctor' ? payload.presenter : a;
        let x = pr;
        if (x) { must(x.p === p, 'Proposal does not belong to this patient'); must(['draft', 'submitted'].includes(x.status), 'This proposal can no longer be edited'); }
        else { x = {id: nextId('MDT', m.proposals), p, createdAt: now, proposer: a, status: 'draft', source: payload.consultSource ? {kind: 'consult', id: String(payload.consultSource)} : {kind: 'manual'}}; m.proposals.push(x); }
        if (x.source && x.source.kind === 'consult') { const c = (n.consultations || []).find(y => y.id === x.source.id); must(!c || c.p === p, 'Consultation source does not belong to this patient'); }
        Object.assign(x, {team: teamId, session: sessionId, type, urgency, question: q, reason: opt(payload.reason, 'Reason for proposal'), presenter, ecog: opt(payload.ecog, 'ECOG'), wishes: opt(payload.wishes, 'Patient wishes'), prefill: payload.prefill === 'on' || payload.prefill === true, updatedAt: now, updatedBy: a});
        // 預填的問題（P3）：提案時可寫三題；沒寫就用臨床問題當 Q1（文字題）。
        const qs = []; for (let i = 1; i <= 3; i++) { const t = opt(payload['q' + i], 'Question ' + i); if (t) qs.push({id: 'Q' + i, text: t, type: payload['q' + i + 'type'] === 'choice' ? 'choice' : 'text', options: payload['q' + i + 'type'] === 'choice' ? lines(String(payload['q' + i + 'opts'] || '').replace(/;/g, '\n')) : undefined}); }
        if (qs.length) x.questions = qs; else if (!x.questions) x.questions = [{id: 'Q1', text: q || 'Clinical question', type: 'text'}];
        if (x.prefill && !x.prefillInvite) x.prefillInvite = {by: a, at: now, members: team.members.filter(mm => mm.role !== 'byCase' || mm.attend === 'drug').map(mm => mm.who), reminders: {}};
        if (submit) {
          const late = !!(sess.proposalDeadline && now > sess.proposalDeadline); x.late = late; if (late && x.lateConfirmed === undefined) x.lateConfirmed = false;
          if (x.status === 'draft') { x.status = 'submitted'; x.submittedAt = now; if (!x.seq) x.seq = agenda(n, sessionId).filter(y => y.id !== x.id).reduce((mx, y) => Math.max(mx, y.seq || 0), 0) + 1; }
          snapshot(x, 'submitted'); log(x.id, 'submitted', {session: sessionId});
        } else log(x.id, pr ? 'draft-updated' : 'draft-created');
        n.lastMdt = {kind: 'proposal', id: x.id, submitted: submit}; break; }
      case 'mdtWithdraw': { must(pr, 'Proposal not found'); must(!['concluded', 'withdrawn'].includes(pr.status), 'This proposal cannot be withdrawn'); pr.status = 'withdrawn'; pr.withdrawn = {by: a, at: now, reason: text(payload.reason, 'Reason for withdrawal')}; log(pr.id, 'withdrawn'); break; }
      case 'mdtWishesSave': { must(pr, 'Proposal not found'); must(!['concluded', 'withdrawn'].includes(pr.status), 'The record is concluded; add a new proposal if the patient’s wishes change'); pr.wishes = text(payload.wishes, 'Patient wishes'); if (payload.ecog !== undefined) pr.ecog = opt(payload.ecog, 'ECOG'); pr.wishesBy = a; pr.wishesAt = now; log(pr.id, 'wishes-saved'); break; }
      case 'mdtProposalConfirm': { must(pr, 'Proposal not found'); must(pr.status === 'submitted', 'Only submitted proposals can be confirmed'); pr.lateConfirmed = true; pr.lateConfirmedBy = a; pr.lateConfirmedAt = now; log(pr.id, 'late-confirmed'); break; }
      case 'mdtAttendanceReply': { const sess = sessionOf(n, payload.session); must(sess, 'Session not found'); must(MODE[payload.mode] && payload.mode !== 'pending', 'Choose present, by video or absent'); sess.attendance = sess.attendance || {}; sess.attendance[a] = payload.mode; if (sess.replies) delete sess.replies[a]; log(sess.id, 'attendance-reply', {mode: payload.mode}); break; }
      case 'mdtAttendanceMark': { const sess = sessionOf(n, payload.session); must(sess, 'Session not found'); must(people[payload.who], 'Member not found'); must(MODE[payload.mode] && payload.mode !== 'pending', 'Choose present, by video or absent'); sess.attendance = sess.attendance || {}; sess.attendance[payload.who] = payload.mode; log(sess.id, 'attendance-marked', {who: payload.who, mode: payload.mode}); break; }
      case 'mdtSessionStart': { const sess = sessionOf(n, payload.session); must(sess, 'Session not found'); must(['scheduled', 'open'].includes(sess.status), 'This session has already started or concluded'); sess.status = 'inProgress'; sess.startedAt = now; agenda(n, sess.id).forEach(x => { if (x.status === 'submitted') { x.status = 'discussed'; snapshot(x, 'meeting'); } }); log(sess.id, 'session-started'); break; }
      case 'mdtSessionConclude': { const sess = sessionOf(n, payload.session); must(sess, 'Session not found'); must(sess.status === 'inProgress', 'Start the session before concluding it'); sess.status = 'concluded'; sess.concludedAt = now; agenda(n, sess.id).forEach(x => { if (x.status === 'discussed' && !recordForProposal(n, x.id)) x.status = 'deferred'; }); log(sess.id, 'session-concluded'); break; }
      case 'mdtOpinionSave': { must(pr, 'Case not found'); const r = recordDraft(pr); const who = payload.who && people[payload.who] ? payload.who : a; const t = text(payload.text, 'Opinion');
        const o = r.opinions.find(x => x.who === who); if (o) Object.assign(o, {text: t, confirmed: who === a, by: a, at: now, edited: !!(o.fromPrefill && o.fromPrefill.text !== t)}); else r.opinions.push({who, text: t, confirmed: who === a, by: a, at: now}); log(r.id, 'opinion-saved', {who}); break; }
      case 'mdtOpinionConfirm': { must(pr, 'Case not found'); const r = recordDraft(pr); const o = r.opinions.find(x => x.who === payload.who); must(o, 'No opinion recorded for you yet'); o.confirmed = true; o.confirmedAt = now; log(r.id, 'opinion-confirmed', {who: payload.who}); break; }
      case 'mdtConclusionSave': { must(pr, 'Case not found'); const r = recordDraft(pr); r.summary = opt(payload.summary, 'Case summary'); r.conclusion = opt(payload.conclusion, 'Conclusion'); r.consensus = ['unanimous', 'majority'].includes(payload.consensus) ? payload.consensus : 'unanimous'; r.dissent = opt(payload.dissent, 'Dissenting view'); must(r.summary || r.conclusion, 'Enter the case summary or the conclusion'); r.updatedAt = now; r.updatedBy = a; log(r.id, 'conclusion-saved'); break; }
      case 'mdtPlanSave': { must(pr, 'Case not found'); const r = recordDraft(pr); r.actions = planRows(); r.updatedAt = now; r.updatedBy = a; log(r.id, 'plan-saved', {count: r.actions.length}); break; }
      case 'mdtRecordLock': { must(pr, 'Case not found'); const r = m.records.find(r => r.proposal === pr.id && r.status === 'draft'); must(r, 'No draft record to lock');
        must(String(r.conclusion || '').trim(), 'Enter the team’s conclusion before locking'); must(r.actions.length, 'Enter at least one action in the plan before locking'); must(r.opinions.length, 'Record at least one member’s opinion before locking');
        const sess = sessionOf(n, pr.session), team = teamOf(n, pr.team);
        r.status = 'locked'; r.lockedBy = a; r.lockedAt = now; r.recordedBy = r.recordedBy || r.createdBy; r.attendance = copy((sess && sess.attendance) || {}); r.pack = (pr.packSnapshots || []).slice(-1)[0] || null;
        pr.status = 'concluded'; pr.record = r.id; pr.concludedAt = now;
        pushTasks({key: 'proposal', id: pr.id, record: r.id}, pr.p || null, pr.team, r.actions, r.id.slice(4));
        if (pr.p) r.excerptNote = excerpt('N-MDT-' + pr.p + '-' + r.id.slice(4) + (r.version > 1 ? '-v' + r.version : ''), pr.p, 'Multidisciplinary team meeting (' + ((team || {}).name || 'team') + ') ' + (sess ? sess.date + ' ' + sess.time : '') + ' — record ' + r.id + ' v' + r.version + ' excerpt. Case ' + pr.id + '. Chair: ' + nm(a) + '; recorded by ' + nm(r.recordedBy) + '.', r.summary, 'Conclusion (' + r.consensus + '): ' + r.conclusion + (r.dissent ? '\nDissenting view: ' + r.dissent : ''), r.actions.map(ac => ac.seq + '. [' + KIND[ac.kind] + '] ' + ac.text + ' — ' + nm(ac.owner) + ' (' + ac.dept + '), due ' + ac.due).join('\n'), r.id);
        log(r.id, 'locked', {version: r.version}); n.lastMdt = {kind: 'record', id: r.id}; break; }
      case 'mdtRecordRevise': { must(pr, 'Case not found'); const cur = recordForProposal(n, pr.id); must(cur && cur.status === 'locked', 'Only a locked record can be revised'); must(!m.records.some(r => r.proposal === pr.id && r.status === 'draft'), 'A revision is already open');
        const nx = copy(cur); nx.id = nextId('REC', m.records); nx.version = cur.version + 1; nx.status = 'draft'; nx.supersedes = cur.id; nx.reason = text(payload.reason, 'Reason for revision'); nx.createdAt = now; nx.createdBy = a; delete nx.lockedBy; delete nx.lockedAt; delete nx.excerptNote; delete nx.pack;
        m.records.push(nx); cur.status = 'superseded'; cur.supersededBy = nx.id; pr.status = 'discussed'; pr.record = nx.id; log(nx.id, 'revision-opened', {from: cur.id}); break; }
      case 'mdtTaskAccept': { const t = taskOf(n, payload.id); must(t, 'Task not found'); must(t.state === 'pending', 'This task has already been received'); t.state = 'received'; t.receivedBy = a; t.receivedAt = now; t.log.push({at: now, by: a, event: 'received'}); log(t.id, 'task-received'); break; }
      case 'mdtTaskComplete': { const t = taskOf(n, payload.id); must(t, 'Task not found'); must(!['done', 'unable'].includes(t.state), 'This task is already closed'); must(t.state !== 'pending', 'Receive the task before completing it'); t.state = 'done'; t.doneBy = a; t.doneAt = now; t.evidence = text(payload.evidence, 'Completion evidence'); t.log.push({at: now, by: a, event: 'done'}); log(t.id, 'task-done'); break; }
      case 'mdtTaskUnable': { const t = taskOf(n, payload.id); must(t, 'Task not found'); must(!['done', 'unable'].includes(t.state), 'This task is already closed'); t.state = 'unable'; t.unableBy = a; t.unableAt = now; t.reason = text(payload.reason, 'Reason it could not be carried out'); t.log.push({at: now, by: a, event: 'unable'}); log(t.id, 'task-unable'); break; }
      case 'mdtRepropose': { const t = taskOf(n, payload.id); must(t && t.p, 'Task not found'); const rec = t.record ? recordOf(n, t.record) : null; const teamId = t.team || suggestTeam(n, t.p); const sessions = upcoming(n, teamId); must(sessions.length, 'No upcoming session for this team');
        const x = {id: nextId('MDT', m.proposals), p: t.p, team: teamId, session: sessions[0].id, type: 'change', urgency: 'routine', status: 'draft', createdAt: now, proposer: a, presenter: a, source: {kind: 'task', id: t.id}, previous: t.record || t.conference || null,
          question: 'Change in condition after the team conclusion' + (rec ? ' of ' + String(rec.lockedAt || '').slice(0, 10) + ' (' + t.record + ')' : '') + ': ' + text(payload.reason, 'What has changed'), reason: 'Re-proposal from follow-up task ' + t.id, ecog: '', wishes: '', prefill: true, questions: [{id: 'Q1', text: 'What should change in the plan?', type: 'text'}]};
        m.proposals.push(x); t.log.push({at: now, by: a, event: 'reproposed', proposal: x.id}); log(x.id, 'reproposed', {task: t.id}); n.lastMdt = {kind: 'proposal', id: x.id, submitted: false}; break; }
      // ---------------- P3 會前預填（22b／22c）----------------
      case 'mdtPrefillSave': { must(pr, 'Case not found'); must(pr.prefill, 'Pre-meeting input is not enabled for this case'); must(['submitted', 'discussed'].includes(pr.status), 'Pre-meeting input is open only while the case is on the agenda');
        const submit = payload.submit === '1' || payload.submit === true; let pf = prefillOf(n, pr.id, a); if (!pf) { pf = {proposal: pr.id, who: a, status: 'draft', createdAt: now}; m.prefills.push(pf); }
        const answers = {}; (pr.questions || []).forEach(q => { const v = String(payload['a:' + q.id] ?? '').trim(); if (q.type === 'choice') { if (v === OUT_OF_FIELD) answers[q.id] = v; else if ((q.options || []).includes(v)) answers[q.id] = v; else if (v) answers[q.id] = v; } else { const mode = String(payload['m:' + q.id] || ''); answers[q.id] = mode === 'outside' ? OUT_OF_FIELD : opt(v, q.id); } });
        Object.assign(pf, {answers, own: submit ? text(payload.own, 'Own-discipline assessment') : opt(payload.own, 'Own-discipline assessment'), tests: lines(payload.tests), discuss: opt(payload.discuss, 'For discussion in the meeting'), stance: opt(payload.stance, 'Stance on the proposed stage'), at: now, status: submit ? 'sent' : 'draft'});
        if (submit) { pf.sentAt = now; const r = m.records.find(r => r.proposal === pr.id && r.status === 'draft'); if (r && !r.opinions.some(o => o.who === a)) r.opinions.push({who: a, text: composeOpinion(pr, pf), confirmed: false, by: a, at: now, fromPrefill: {at: now, text: composeOpinion(pr, pf)}}); }
        log(pr.id, submit ? 'prefill-sent' : 'prefill-draft', {who: a}); n.lastMdt = {kind: 'prefill', id: pr.id, submitted: submit}; break; }
      case 'mdtPrefillRemind': { must(pr, 'Case not found'); const inv = pr.prefillInvite || (pr.prefillInvite = {by: a, at: now, members: [], reminders: {}}); inv.reminders = inv.reminders || {}; const targets = inv.members.filter(who => { const pf = prefillOf(n, pr.id, who); return !pf || pf.status !== 'sent'; }); targets.forEach(who => { inv.reminders[who] = (inv.reminders[who] || 0) + 1; }); inv.lastReminderAt = now; log(pr.id, 'prefill-reminded', {count: targets.length}); n.lastMdt = {kind: 'remind', id: pr.id, count: targets.length}; break; }
      // ---------------- P3 職類照會（09b／09c／09d）----------------
      case 'refRequest': { const p = payload.p, d = disciplineOf(n, String(payload.discipline || '')); must(d, 'Select a discipline');
        const open = refsFor(n, p).find(r => r.discipline === d.id && ['requested', 'inProgress'].includes(r.status)); must(!open, 'A consult to ' + d.name + ' is already open (' + (open || {}).id + '); add your question to it instead of opening a new form');
        const submit = payload.submit === '1' || payload.submit === true, urgency = payload.urgency === 'urgent' ? 'urgent' : 'routine';
        const items = {}; (d.request || []).forEach(([k, label]) => { if (payload['item:' + k] === 'on' || payload['item:' + k] === true || payload['item:' + k] === '1') items[k] = opt(payload['note:' + k], label) || '✓'; });
        must(!submit || Object.keys(items).length, 'Tick at least one consult item');
        let r = payload.draft ? refOf(n, String(payload.draft)) : refsFor(n, p).find(x => x.discipline === d.id && x.status === 'draft');
        if (!r) { r = {id: nextId('RF', m.refs), p, discipline: d.id, requester: a, status: 'draft', createdAt: now, log: [{at: now, by: a, event: 'draft'}]}; m.refs.push(r); }
        Object.assign(r, {urgency, items, summary: submit ? text(payload.summary, 'Clinical summary') : opt(payload.summary, 'Clinical summary'), phone: submit ? text(payload.phone, 'Requester’s contact number') : opt(payload.phone, 'Contact number'), updatedAt: now});
        if (submit) { r.status = 'requested'; r.requestedAt = now; r.due = plusHours(now, (d.dueHours || {})[urgency] || (urgency === 'urgent' ? 4 : 24)); r.assignee = (d.staff || [])[0] || null; r.log.push({at: now, by: a, event: 'requested'}); }
        log(r.id, submit ? 'ref-requested' : 'ref-draft'); n.lastMdt = {kind: 'ref', id: r.id, submitted: submit}; break; }
      case 'refAddQuestion': { must(ref, 'Consult not found'); must(['requested', 'inProgress'].includes(ref.status), 'This consult is no longer open'); ref.addenda = ref.addenda || []; ref.addenda.push({at: now, by: a, text: text(payload.text, 'Additional question')}); ref.log.push({at: now, by: a, event: 'question-added'}); log(ref.id, 'ref-question'); break; }
      case 'refPickUp': { must(ref, 'Consult not found'); must(ref.status === 'requested', 'This consult has already been picked up'); ref.status = 'inProgress'; ref.assignee = a; ref.pickedAt = now; ref.log.push({at: now, by: a, event: 'picked'}); log(ref.id, 'ref-picked'); break; }
      case 'refInterim': { must(ref, 'Consult not found'); must(['requested', 'inProgress'].includes(ref.status), 'This consult is no longer open'); if (ref.status === 'requested') { ref.status = 'inProgress'; ref.assignee = a; ref.pickedAt = now; } ref.interim = {at: now, by: a, note: text(payload.note, 'Interim note'), flags: multi(payload.flags)}; ref.reply = ref.reply || {}; ref.reply.flags = multi(payload.flags); ref.log.push({at: now, by: a, event: 'interim', flags: multi(payload.flags)}); log(ref.id, 'ref-interim'); break; }
      case 'refReply': { must(ref, 'Consult not found'); must(['requested', 'inProgress'].includes(ref.status), 'This consult has already been replied to'); const d = disciplineOf(n, ref.discipline); must(d, 'Template not found');
        const submit = payload.submit === '1' || payload.submit === true; const reply = ref.reply || {};
        (d.reply || []).forEach(([k, label, type, options]) => { if (type === 'multi') reply[k] = multi(payload['r:' + k]); else if (type === 'choice') { const v = String(payload['r:' + k] || ''); reply[k] = (options || []).includes(v) ? v : (reply[k] || ''); } else if (type === 'status') { const v = String(payload['r:' + k] || ''); reply[k] = m.statusSet.includes(v) ? v : (reply[k] || 'Accepted'); } else reply[k] = submit && ['assessment', 'result', 'review'].includes(k) ? text(payload['r:' + k], label) : opt(payload['r:' + k], label); });
        ref.reply = reply; if (ref.status === 'requested') { ref.status = 'inProgress'; ref.assignee = a; ref.pickedAt = now; }
        if (submit) { ref.status = 'replied'; ref.repliedAt = now; ref.responder = a; ref.signedAt = /sign/i.test(d.signature || '') && !/not needed/i.test(d.signature || '') ? now : null; ref.log.push({at: now, by: a, event: 'replied'}); } else ref.log.push({at: now, by: a, event: 'reply-draft'});
        log(ref.id, submit ? 'ref-replied' : 'ref-reply-draft'); n.lastMdt = {kind: 'ref', id: ref.id, submitted: submit, replied: submit}; break; }
      case 'refDecide': { must(ref, 'Consult not found'); must(ref.status === 'replied', 'The consult has not been replied to yet'); const kind = ['adopt', 'ack', 'decline'].includes(payload.decision) ? payload.decision : 'ack'; const note = kind === 'decline' ? text(payload.note, 'Reason for not adopting') : opt(payload.note, 'Decision note');
        ref.decision = {kind, by: a, at: now, note, orders: (ref.decision && ref.decision.orders) || []}; ref.log.push({at: now, by: a, event: kind}); log(ref.id, 'ref-decision', {kind}); n.lastMdt = {kind: 'refDecision', id: ref.id, decision: kind}; break; }
      // ---------------- P3 個案會議（29–31）----------------
      case 'caseDecide': { const p = payload.p; must(s_has(n, p), 'A valid patient is required'); const decision = payload.decision === 'defer' ? 'defer' : 'meet'; const refIds = refsFor(n, p).filter(r => r.status !== 'draft').map(r => r.id); const lv = levelFor(n, p), dept = (n.patients.find(x => x.id === p) || {}).department;
        if (decision === 'defer') { const reason = String(payload.reason || '') === 'Other (specify)' ? text(payload.reasonOther, 'Reason') : (m.rules.noMeetingReasons || []).includes(String(payload.reason || '')) ? String(payload.reason) : text(payload.reason, 'Reason for not meeting');
          const c = {id: nextId('CC', m.conferences), p, kind: 'deferred', status: 'deferred', proposer: a, decidedAt: now, reason, refs: refIds, log: [{at: now, by: a, event: 'deferred'}]}; m.conferences.push(c); log(c.id, 'case-deferred'); n.lastMdt = {kind: 'conf', id: c.id, deferred: true}; break; }
        const topic = (m.rules.topics || []).some(t => t[0] === String(payload.topic)) ? String(payload.topic) : ((m.rules.topics || [])[0] || ['001'])[0];
        const questions = lines(payload.questions); must(questions.length, 'Enter at least one consultation question');
        const date = String(payload.date || ''); must(/^\d{4}-\d\d-\d\d$/.test(date), 'Choose a proposed date'); const slot = (m.rules.slots || []).includes(String(payload.slot)) ? String(payload.slot) : (m.rules.slots || ['07:50'])[0];
        const chair = headOfDept(n, dept) || a, secretary = secretaryDefault(n, dept) || null, organiser = coordinatorOf(n, dept) || null;
        const participants = [{who: chair, role: 'chair'}]; if (secretary) participants.push({who: secretary, role: 'secretary'}); participants.push({who: a, role: 'attending'});
        refIds.map(id => refOf(n, id)).forEach(r => { if (r && r.assignee && !participants.some(x => x.who === r.assignee)) participants.push({who: r.assignee, role: 'member', ref: r.id}); });
        multi(payload.participants).forEach(who => { if (people[who] && !participants.some(x => x.who === who)) participants.push({who, role: people[who].role === 'nurse' ? 'nurse' : 'member'}); });
        const pn = (n.relationships || []).find(r => r.p === p && r.role === 'primaryNurse' && r.active); if (pn && !participants.some(x => x.who === pn.actor)) participants.push({who: pn.actor, role: 'nurse'}); if (organiser && !participants.some(x => x.who === organiser)) participants.push({who: organiser, role: 'coordinator'});
        const c = {id: nextId('CC', m.conferences), p, kind: 'team', topic, level: lv.id, departments: lv.departments, status: 'pendingApproval', proposer: a, decidedAt: now, proposedAt: date + 'T' + slot, place: opt(payload.place, 'Location') || 'Medical Oncology discussion room', chair, secretary, organiser, approver: chair,
          reasons: multi(payload.reasons), goals: multi(payload.goals), categories: multi(payload.categories), questions, refs: refIds, participants, followFamily: payload.followFamily === 'on' || payload.followFamily === true || payload.followFamily === '1', record: null, log: [{at: now, by: a, event: 'decided'}]};
        m.conferences.push(c); log(c.id, 'case-requested'); n.lastMdt = {kind: 'conf', id: c.id}; break; }
      case 'caseApprove': { must(conf, 'Case conference not found'); must(conf.status === 'pendingApproval', 'This request is not awaiting approval'); conf.status = 'approved'; conf.approvedBy = a; conf.approvedAt = now; conf.log.push({at: now, by: a, event: 'approved'}); log(conf.id, 'case-approved'); break; }
      case 'caseSchedule': { must(conf, 'Case conference not found'); must(['approved', 'scheduled'].includes(conf.status), 'Approve the request before scheduling'); const at = String(payload.at || conf.proposedAt || ''); must(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(at), 'Enter the meeting date and time'); conf.at = at; conf.place = opt(payload.place, 'Location') || conf.place; conf.status = 'scheduled'; conf.scheduledBy = a; conf.scheduledAt = now; conf.invitedAt = now; conf.log.push({at: now, by: a, event: 'scheduled'}); log(conf.id, 'case-scheduled'); break; }
      case 'caseAttendanceMark': { must(conf, 'Case conference not found'); must(people[payload.who], 'Participant not found'); must(MODE[payload.mode] && payload.mode !== 'pending', 'Choose present, by video or absent'); const r = caseDraft(conf); must(r.status !== 'locked', 'The record is locked'); r.attendance = r.attendance || {}; r.attendance[payload.who] = payload.mode; if (conf.status === 'scheduled') conf.status = 'inProgress'; log(conf.id, 'case-attendance', {who: payload.who}); break; }
      case 'caseOpinionSave': { must(conf, 'Case conference not found'); const r = caseDraft(conf); must(r.status !== 'locked', 'The record is locked'); const who = payload.who && people[payload.who] ? payload.who : a; const t = text(payload.text, 'Opinion'); const o = r.opinions.find(x => x.who === who);
        if (o) Object.assign(o, {text: t, confirmed: who === a, by: a, at: now, edited: !!(o.fromPrefill && o.fromPrefill.text !== t)}); else r.opinions.push({who, text: t, confirmed: who === a, by: a, at: now, source: 'spoken'}); if (conf.status === 'scheduled') conf.status = 'inProgress'; log(conf.id, 'case-opinion', {who}); break; }
      case 'caseOpinionConfirm': { must(conf, 'Case conference not found'); const r = caseDraft(conf); const o = r.opinions.find(x => x.who === payload.who); must(o, 'No opinion recorded for you yet'); o.confirmed = true; o.confirmedAt = now; o.signedAt = now; log(conf.id, 'case-opinion-confirmed', {who: payload.who}); break; }
      case 'caseRecordSave': { must(conf, 'Case conference not found'); const r = caseDraft(conf); must(r.status !== 'locked', 'The record is locked'); r.summary = opt(payload.summary, 'Case summary'); r.conclusion = opt(payload.conclusion, 'Conclusion'); r.consensus = ['unanimous', 'majority'].includes(payload.consensus) ? payload.consensus : 'unanimous'; r.dissent = opt(payload.dissent, 'Dissenting view'); must(r.summary || r.conclusion, 'Enter the case summary or the conclusion'); r.updatedAt = now; r.updatedBy = a; if (conf.status === 'scheduled') conf.status = 'inProgress'; log(conf.id, 'case-record-saved'); break; }
      case 'casePlanSave': { must(conf, 'Case conference not found'); const r = caseDraft(conf); must(r.status !== 'locked', 'The record is locked'); r.actions = planRows(); r.updatedAt = now; r.updatedBy = a; log(conf.id, 'case-plan-saved', {count: r.actions.length}); break; }
      case 'caseRecordSend': { must(conf, 'Case conference not found'); const r = caseDraft(conf); must(r.status !== 'locked', 'The record is locked'); must(String(r.conclusion || '').trim(), 'Enter the conclusion before sending to the chair'); r.status = 'review'; r.sentAt = now; r.sentBy = a; conf.status = 'review'; conf.log.push({at: now, by: a, event: 'record-sent'}); log(conf.id, 'case-record-sent'); break; }
      case 'caseRecordLock': { must(conf, 'Case conference not found'); const r = conf.record; must(r && r.status !== 'locked', 'No record to lock'); must(String(r.conclusion || '').trim(), 'Enter the conclusion before locking'); must(r.actions.length, 'Enter at least one action in the plan before locking'); must(r.opinions.length, 'Record at least one opinion before locking');
        r.status = 'locked'; r.lockedBy = a; r.lockedAt = now; r.version = r.version || 1; r.opinions.forEach(o => { if (!o.signedAt) o.signedAt = o.confirmed ? now : null; }); conf.status = 'concluded'; conf.concludedAt = now;
        pushTasks({key: 'conference', id: conf.id}, conf.p, null, r.actions, 'C' + conf.id.slice(3));
        const pt = n.patients.find(x => x.id === conf.p) || {}; const topic = ((m.rules.topics || []).find(t => t[0] === conf.topic) || [conf.topic, ''])[1];
        conf.excerptNote = excerpt('N-CC-' + conf.p + '-' + conf.id.slice(3), conf.p, 'Case conference (' + topic + ') ' + String(conf.at || '').replace('T', ' ') + ' — record ' + conf.id + ' v' + r.version + ' excerpt. Level: ' + ((levelFor(n, conf.p).rule || {}).name || conf.level) + '. Chair: ' + nm(a) + '; recorded by ' + nm(conf.secretary) + '.', r.summary, 'Conclusion (' + r.consensus + '): ' + r.conclusion + (r.dissent ? '\nDissenting view: ' + r.dissent : ''), r.actions.map(ac => ac.seq + '. [' + KIND[ac.kind] + '] ' + ac.text + ' — ' + nm(ac.owner) + ' (' + ac.dept + '), due ' + ac.due).join('\n'), conf.id);
        if (conf.followFamily && !m.conferences.some(c => c.kind === 'family' && c.follows === conf.id)) { const fmAt = String(conf.at || now).slice(0, 10) + 'T13:30'; m.conferences.push({id: nextId('FM', m.conferences), p: conf.p, kind: 'family', status: 'scheduled', follows: conf.id, topicText: 'Follows the ' + String(conf.at || '').slice(5, 10) + ' case conference', at: fmAt, place: conf.place + ' + video', chair: (n.relationships || []).find(x => x.p === conf.p && x.role === 'attending' && x.active)?.actor || conf.proposer, createdBy: a, createdAt: now, attendees: [], explained: '', views: '', decisions: '', openItems: [], signatures: [], log: [{at: now, by: a, event: 'scheduled-after-conference'}]}); }
        conf.log.push({at: now, by: a, event: 'locked'}); log(conf.id, 'case-locked'); n.lastMdt = {kind: 'conf', id: conf.id, locked: true, patient: pt.name}; break; }
      // ---------------- P3 家庭會議（32）----------------
      case 'familyMeetingCreate': { const p = payload.p; const at = String(payload.at || ''); must(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(at), 'Enter the meeting date and time'); const fm = {id: nextId('FM', m.conferences), p, kind: 'family', status: 'scheduled', follows: payload.follows && confOf(n, payload.follows) ? String(payload.follows) : null, topicText: opt(payload.topic, 'Topic') || 'Family meeting', at, place: opt(payload.place, 'Location') || 'Ward interview room', chair: a, createdBy: a, createdAt: now, attendees: [], explained: '', views: '', decisions: '', openItems: [], signatures: [], log: [{at: now, by: a, event: 'scheduled'}]}; m.conferences.push(fm); log(fm.id, 'family-scheduled'); n.lastMdt = {kind: 'conf', id: fm.id}; break; }
      case 'familyMeetingSave': { must(conf, 'Family meeting not found'); must(conf.status !== 'completed', 'The family meeting record is locked');
        const att = []; for (let i = 1; i <= 8; i++) { const name = opt(payload['name:' + i], 'Name'); if (!name) continue; att.push({role: opt(payload['role:' + i], 'Role') || 'Family', name, relation: opt(payload['relation:' + i], 'Relationship'), mode: ['Present', 'Video', 'Absent'].includes(payload['mode:' + i]) ? payload['mode:' + i] : 'Present'}); }
        const items = []; for (let i = 1; i <= 6; i++) { const t = opt(payload['item:' + i], 'Item'); if (!t) continue; const owner = String(payload['itemOwner:' + i] || ''); must(people[owner], 'Select an owner for open item ' + i); const due = String(payload['itemDue:' + i] || ''); must(/^\d{4}-\d\d-\d\d$/.test(due), 'Enter a deadline for open item ' + i); items.push({text: t, owner, due}); }
        Object.assign(conf, {attendees: att.length ? att : conf.attendees, explained: opt(payload.explained, 'Points explained'), views: opt(payload.views, 'Views of patient and family'), decisions: opt(payload.decisions, 'Consensus and decisions'), openItems: items, end: /^\d\d:\d\d$/.test(String(payload.end || '')) ? String(payload.end) : conf.end, updatedAt: now, updatedBy: a}); if (conf.status === 'scheduled') conf.status = 'inProgress'; conf.log.push({at: now, by: a, event: 'record-saved'}); log(conf.id, 'family-saved'); break; }
      case 'familyMeetingSign': { must(conf, 'Family meeting not found'); must(conf.status !== 'completed', 'The family meeting record is locked'); must(String(conf.decisions || '').trim(), 'Record the consensus and decisions before signing');
        const role = text(payload.role, 'Signing role'), name = role === 'Attending' ? nm(a) : text(payload.name, 'Name of the person signing'); const req = ['Family representative', 'Attending'].includes(role) ? 'Required' : 'Optional'; const method = role === 'Attending' || role === 'Social Work' ? 'E-signature' : (payload.method === 'remote' ? 'Remote electronic confirmation (SMS code)' : 'Handwriting pad');
        if (role === 'Attending') must(person.role === 'doctor' && W().canWrite(n, conf.p, a), 'Only the attending signs as attending');
        conf.signatures = (conf.signatures || []).filter(x => x.role !== role); conf.signatures.push({role, name, req, method, at: now, who: role === 'Attending' ? a : null, recordedBy: a}); conf.log.push({at: now, by: a, event: 'signed', role});
        const hasFamily = conf.signatures.some(x => x.role === 'Family representative'), hasAtt = conf.signatures.some(x => x.role === 'Attending');
        if (hasFamily && hasAtt) { conf.status = 'completed'; conf.lockedAt = now; const pt = n.patients.find(x => x.id === conf.p) || {};
          conf.excerptNote = excerpt('N-FM-' + conf.p + '-' + conf.id.slice(3), conf.p, 'Family meeting ' + String(conf.at || '').replace('T', ' ') + ' — record ' + conf.id + ' excerpt. Chair: ' + nm(conf.chair) + '. Attendees: ' + (conf.attendees || []).map(x => x.name + ' (' + (x.relation || x.role) + ')').join(', ') + '.', 'Points explained: ' + (conf.explained || '—') + '\nViews of patient and family: ' + (conf.views || '—'), 'Consensus and decisions: ' + conf.decisions, (conf.openItems || []).map((it, i) => (i + 1) + '. ' + it.text + ' — ' + nm(it.owner) + ', due ' + it.due).join('\n') || '(no open items)', conf.id);
          pushTasks({key: 'conference', id: conf.id}, conf.p, null, (conf.openItems || []).map((it, i) => ({seq: i + 1, kind: 'followup', text: it.text, owner: it.owner, dept: (people[it.owner] || {}).department || '', due: it.due})), 'F' + conf.id.slice(3));
          conf.log.push({at: now, by: a, event: 'locked'}); n.lastMdt = {kind: 'conf', id: conf.id, locked: true, patient: pt.name}; } else n.lastMdt = {kind: 'conf', id: conf.id, signed: role};
        log(conf.id, 'family-signed', {role}); break; }
      // 示範事件（demo-only，不是功能）：讓示範時鐘往前跳，或讓待回的報告回來。
      case 'mdtDemoEvent': { const ev = (m.demoEvents || {})[payload.event];
        if (payload.event === 'clock') { const to = String(payload.to || ''); must(/^2026-\d\d-\d\dT\d\d:\d\d$/.test(to), 'Enter a valid demo time'); must(to >= now, 'Demo time cannot go backward'); n.demoClock = TZ().zoned(to + ':00'); log('clock', 'demo-clock', {to}); break; }
        must(ev, 'Unknown demo event');
        if (ev.report) { const r = (n.reports || []).find(x => x.id === ev.report); must(r, 'Report not found'); must(r.status === 'pending', 'This report has already been returned'); Object.assign(r, {status: 'returned', at: ev.at, collectedAt: ev.at, text: ev.text, impression: ev.impression, reporter: ev.reporter, source: 'Demo report (fictional); returned by demo event'});
          (n.tasks || []).filter(t => t.source === r.order && t.status !== 'done').forEach(t => { t.history.push({from: t.status, to: 'done', actor: a, at: now}); t.status = 'done'; t.evidence = 'Report returned (demo event)'; }); }
        if (ev.clock && TZ().millis(ev.clock) > TZ().millis(n.demoClock)) n.demoClock = ev.clock;
        ev.done = true; log(payload.event, 'demo-event'); break; }
      default: throw Error('Unsupported MDT action');
    }
    return true;
  }
  const s_has = (n, p) => (n.patients || []).some(x => x.id === p);
  // 回覆摘要（個案會議 B.3 帶入、09d 卡片）：回覆欄位串成一段。
  function replySummary(s, r) { const d = disciplineOf(s, r.discipline); if (!r.reply || !d) return r.interim ? r.interim.note : ''; return (d.reply || []).filter(([k, , type]) => !['status'].includes(type) && r.reply[k] && String(r.reply[k]).trim()).map(([k, , type]) => Array.isArray(r.reply[k]) ? r.reply[k].join(', ') : String(r.reply[k]).replace(/\n/g, '; ')).join(' ').trim(); }
  // 原型動作之後的連動：帶 mdtSource 的開單讓任務變「已採納開單」；帶 refSource 的開單讓職類照會回覆變「已採納開單」。
  function after(n, action, a, payload) {
    if (action !== 'catalogOrder') return; const now = wallNow(n);
    if (payload.mdtSource) { const t = taskOf(n, payload.mdtSource); if (t) { const ids = (n.orders || []).filter(o => o.mdtSource === t.id).map(o => o.id); t.orderIds = [...new Set([...(t.orderIds || []), ...ids])]; if (['pending', 'received'].includes(t.state)) { t.state = 'adopted'; t.adoptedBy = a; t.adoptedAt = now; } t.log.push({at: now, by: a, event: 'adopted', orders: ids}); ensure(n).log.push({at: now, by: a, action: 'catalogOrder', ref: t.id, event: 'adopted', orders: ids}); } }
    if (payload.refSource) { const r = refOf(n, payload.refSource); if (r) { const ids = (n.orders || []).filter(o => o.refSource === r.id).map(o => o.id); r.decision = r.decision && r.decision.kind === 'adopt' ? r.decision : {kind: 'adopt', by: a, at: now, note: (r.decision && r.decision.note) || 'Adopted and ordered', orders: []}; r.decision.orders = [...new Set([...(r.decision.orders || []), ...ids])]; r.log.push({at: now, by: a, event: 'ordered', orders: ids}); ensure(n).log.push({at: now, by: a, action: 'catalogOrder', ref: r.id, event: 'adopted', orders: ids}); } }
  }

  const api = {owns, ensure, guard, handle, after, readiness, history, suggestSummary, patientSummary, metrics, todos, taskState, overdue, taskFor, refFor, teamOf, sessionOf, proposalOf, recordOf, taskOf, recordForProposal, recordsForProposal, agenda, upcoming, sessionsOf, activeProposals, proposalsFor, tasksFor, suggestTeam, memberRole, isMember, isOfficer, patientOf, caseName, wallNow, today, days, hoursBetween, plusHours, teamKeys: () => TEAM_KEYS.slice(),
    disciplineOf, refOf, refsFor, confOf, confsFor, prefillsFor, prefillOf, myDiscipline, headOfDept, coordinatorOf, secretaryDefault, levelFor, prompt, prefillStats, composeOpinion, replySummary, wordDiff,
    ITEMS, TYPE, STATUS, TASK_STATE, TASK_FLOW, ROLE, ATTEND, MODE, KIND, SESSION, REF_STATUS, REF_DECISION, CONF_KIND, CONF_STATUS, PREFILL_STATUS, OUT_OF_FIELD};
  if (typeof module !== 'undefined') module.exports = api; else root.ICUMdtCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
