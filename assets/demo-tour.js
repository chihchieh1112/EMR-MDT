/* EMR整合MDT demo：導覽模式（2026-11-10，P4）。左下角浮動面板，照 README 的兩條故事線逐步帶看：
   A 團隊會議 MDT（Margaret Ellis，14 步）、B 個案跨團隊會議（Harold Whitmore，9 步）。每一步寫「切換誰、到哪一頁、按什麼」，「Go to this step」直接帶到該頁與該身分。
   進度存在 localStorage（emr-mdt-tour-v1）；網址加 ?tour=1 自動展開。面板掛在 body 下、#app 之外。步驟文字中英文都在這裡（不走字典），面板標籤走 i18n。 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const KEY = 'emr-mdt-tour-v1';
  const E = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const lang = () => (root.ICUi18n && root.ICUi18n.lang ? root.ICUi18n.lang() : 'en');
  const ROUTES = [
    {id: 'mdt', en: 'Route A · Team meeting (MDT) · Margaret Ellis (A03)', zh: 'A 線 · 團隊會議 MDT · Margaret Ellis（A03）', steps: [
      {who: 'mercer', url: {view: 'overview', p: 'P03'}, en: 'Open Margaret Ellis (A03). The “Team meeting (MDT)” card shows the proposal draft created from the adopted consult and 6/8 data readiness.', zh: '打開 Margaret Ellis（A03）總覽：「團隊會議 MDT」卡顯示由照會採納產生的提案草稿，資料齊備 6/8。'},
      {who: 'mercer', url: {view: 'notes', careWork: 'consultation', p: 'P03'}, en: 'Consults & care › Specialist consult: the Breast Surgery reply (CS-1102-04) is adopted. Click “Open MDT proposal draft”.', zh: '照護 › 專科照會：乳房外科回覆 CS-1102-04 已採納，點「Open MDT proposal draft」。'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'propose', mdtCase: 'MDT-1103-06', p: 'P03'}, en: 'Proposal page: team suggested from the diagnosis, session W44, question brought in from the consult. Submit to the agenda (it is after the deadline, so the coordinator confirms).', zh: '提案頁：團隊依診斷建議、會期 W44、問題由照會帶入；送出排入議程（逾截止，由協調人確認）。'},
      {who: 'whitfield', url: {view: 'mdt', mdtTab: 'agenda', mdtTeam: 'breast', p: 'P03'}, en: 'As coordinator Grace Whitfield: the case is #1 and flagged late — click “Confirm for agenda”.', zh: '切換協調人 Grace Whitfield：第 1 案標示逾截止，點「Confirm for agenda」。'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'pack', mdtCase: 'MDT-1103-06', p: 'P03'}, en: 'Summary pack: 8 items read live from the record. Record the patient’s wishes → 7/8; only the echocardiogram (LVEF) is missing.', zh: '摘要包：8 項即時讀病歷；填病人意願 → 7/8，只缺心臟超音波（LVEF）。'},
      {who: 'price', url: {view: 'mdt', mdtTab: 'prefillEdit', mdtCase: 'MDT-1103-06', p: 'P03'}, en: 'Optional pre-meeting input: as Dr. Price (Imaging) fill in the imaging pre-fill and send. Other disciplines’ pre-fills become visible only after you send yours.', zh: '選配會前預填：切換影像科 Dr. Price 填寫並送出；送出自己的才看得到他科。'},
      {who: 'whitfield', url: {view: 'mdt', mdtTab: 'prefill', mdtCase: 'MDT-1103-06', p: 'P03'}, en: 'Coordinator’s pre-fill overview: 7/8 sent, question tallies, points for discussion, reminders to those who have not filled in.', zh: '協調人的預填總表：7/8 已送出、問題票數、會中待討論、提醒未填者。'},
      {who: 'brooks', url: {view: 'mdt', mdtTab: 'agenda', mdtTeam: 'breast', p: 'P03'}, en: 'As secretary Dr. Brooks: open Demo controls → jump to 11-04 14:00, then “Start the meeting” (freezes the summary packs as the meeting version).', zh: '切換秘書 Dr. Brooks：Demo controls 跳到 11-04 14:00，按「Start the meeting」凍結摘要包。'},
      {who: 'brooks', url: {view: 'mdt', mdtTab: 'record', mdtCase: 'MDT-1103-06', p: 'P03'}, en: 'Discussion record: B.3 opinions are brought in from pre-fills (edits show as a diff); write the B.4 conclusion and the action plan.', zh: '討論紀錄：B.3 由預填帶入（修改會標差異）；填 B.4 結論與處置計畫。'},
      {who: 'ashford', url: {view: 'mdt', mdtTab: 'record', mdtCase: 'MDT-1103-06', p: 'P03'}, en: 'As chair Dr. Ashford: confirm your own opinion, then “Confirm and lock record v1” — hand-off tasks are created and the excerpt is filed in the patient record.', zh: '切換主席 Dr. Ashford：確認自己的意見，按「Confirm and lock record v1」— 產生交接任務、摘錄進病歷。'},
      {who: 'brooks', url: {view: 'mdt', mdtTab: 'record', mdtCase: 'MDT-1103-06', mdtPrint: '1', p: 'P03'}, en: 'Print preview of the meeting record (A4, neutral form name).', zh: '會議紀錄列印預覽（A4，中性表單名稱）。'},
      {who: 'finch', url: {view: 'mdt', mdtTab: 'tasks', mdtCase: 'MDT-1103-06', p: 'P03'}, en: 'As Dr. Finch (Radiation Oncology): receive your hand-off task.', zh: '切換放腫科 Dr. Finch：接收交接任務。'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'tasks', mdtCase: 'MDT-1103-06', p: 'P03'}, en: 'As Dr. Mercer: receive task 1 → “Order per conclusion” → doxorubicin 60 mg/m² (BSA 1.60 → 96 mg) → confirm. The task becomes “Adopted · ordered” and the order carries the MDT source.', zh: '切回 Dr. Mercer：接收任務 1 →「Order per conclusion」→ doxorubicin 每 m² 60（BSA 1.60 → 96 mg）→ 確認；任務變「已採納開單」，醫囑帶 MDT 來源。'},
      {who: 'hartley', url: {view: 'mdt', mdtTab: 'dashboard', p: 'P03'}, en: 'Dashboard: live indicators plus eight-week demo figures; AI assistance, remote MDT and automatic enrolment are listed only as roadmap. Demo controls can also return the echo report → 8/8.', zh: '儀表板：即時指標＋八週示範數字；AI 輔助、遠距 MDT、自動排入只列為 roadmap。Demo controls 可讓心臟超音波回報 → 8/8。'}]},
    {id: 'care', en: 'Route B · Case conference · Harold Whitmore (A06)', zh: 'B 線 · 個案跨團隊會議 · Harold Whitmore（A06）', steps: [
      {who: 'mercer', url: {view: 'notes', careWork: 'allied', p: 'P06'}, en: 'Harold Whitmore (A06): Consults & care › Allied-health consult — four template-based consults this admission. The request form shows template items and auto-filled data; a second open consult to the same discipline is refused.', zh: 'Harold Whitmore（A06）：照護 › 職類照會 — 本次住院四張範本式照會；開單表單有範本勾選項與系統帶入，同職類未結案不能再開。'},
      {who: 'booth', url: {view: 'tasks', p: 'P06'}, en: 'As social worker Natalie Booth: My to-dos is the Social Work worklist. Complete the reply for RF-1103-04 (flag: difficult discharge) and sign and send.', zh: '切換社工 Natalie Booth：待辦即社工工作清單；完成 RF-1103-04 回覆（註記困難出院）並簽名送出。'},
      {who: 'mercer', url: {view: 'notes', careWork: 'team', p: 'P06'}, en: 'Team overview: the meeting prompt is met (4 consults ≥ 3, difficult discharge). Each reply card shows the attending’s decision; adopted ones carry the consult as order source. Click “Start case conference”.', zh: '團隊總覽：召開提示成立（4 張 ≥ 3、困難出院）；每張回覆卡有主治決定，採納的醫囑帶照會來源。按「Start case conference」。'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'caseDecide', p: 'P06'}, en: 'Decision to convene: topic, reasons, questions and participants are pre-filled; the level is determined by the system (within-department: allied-health disciplines do not count). Send for Head of Department approval.', zh: '召開判斷：主題、原因、問題、與會者已帶入；層級由系統判定（科內：職類不計科數）；送科主任核准。'},
      {who: 'hartley', url: {view: 'mdt', mdtTab: 'cases', p: 'P06'}, en: 'As Head of Department Dr. Hartley: Case meetings → open the request → “Approve the request”.', zh: '切換科主任 Dr. Hartley：個案會議 → 開啟申請 →「Approve the request」。'},
      {who: 'blake', url: {view: 'mdt', mdtTab: 'cases', p: 'P06'}, en: 'As head nurse Susan Blake (department coordinator): open the request → confirm time and send invitations.', zh: '切換護理長 Susan Blake（科內協調人）：開啟申請 → 確認時間並送邀請。'},
      {who: 'brooks', url: {view: 'mdt', mdtTab: 'cases', p: 'P06'}, en: 'As secretary Dr. Brooks: open the conference record — B.3 brings in the allied-health replies; write the conclusion and the plan, send to the chair. Then as Dr. Hartley “Confirm and lock” (tasks, excerpt, family meeting scheduled automatically).', zh: '切換秘書 Dr. Brooks：開啟會議紀錄 — B.3 帶入職類回覆；填結論與計畫送主席；再切 Dr. Hartley 鎖定（任務、摘錄、自動排家庭會議）。'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'cases', mdtFilter: 'family', p: 'P06'}, en: 'Family meeting record: attendees pre-filled, the points explained cite the conclusion; record the decisions and open items; family representative confirmation + attending e-signature complete it (2/2).', zh: '家庭會議紀錄：出席名單帶入、說明引用結論；記錄決定與待辦；家屬代表確認＋主治電子簽後完成（2/2）。'},
      {who: 'admin', url: {view: 'settings', tab: 'levels'}, en: 'Maintenance settings (read-only in this demo): consultation levels & signatures and the consult form templates.', zh: '維護設定（demo 唯讀）：會診層級與簽章、照會表單範本。'}]}
  ];
  const readState = () => { try { return Object.assign({route: 'mdt', step: 0, open: false}, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return {route: 'mdt', step: 0, open: false}; } };
  const st = readState();
  if (/[?&]tour=1/.test(location.search)) st.open = true;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } };
  const route = () => ROUTES.find(r => r.id === st.route) || ROUTES[0];
  const personName = k => { try { const s = JSON.parse(localStorage.getItem((root.DEMO || {}).storageKey || '') || 'null'); return s && s.people && s.people[k] ? s.people[k].name : ({mercer: 'Dr. Daniel Mercer', whitfield: 'Grace Whitfield, RN', price: 'Dr. Samuel Price', brooks: 'Dr. Hannah Brooks', ashford: 'Dr. Richard Ashford', finch: 'Dr. Laura Finch', hartley: 'Dr. William Hartley', booth: 'Natalie Booth, MSW', blake: 'Susan Blake, RN', admin: 'Paul Nielsen (administrator)'})[k] || k; } catch (e) { return k; } };
  const box = document.createElement('aside'); box.id = 'demo-tour'; box.className = 'demo-tour'; box.setAttribute('aria-label', 'Guided tour');
  document.body.appendChild(box);
  function render() {
    const r = route(), i = Math.min(Math.max(0, st.step), r.steps.length - 1), s = r.steps[i], L = lang() === 'zh' ? 'zh' : 'en';
    box.innerHTML = `<button type="button" class="demo-tour-toggle" data-tour="toggle" aria-expanded="${st.open}">${st.open ? '✕' : '▶'} <span>Guided tour</span></button>` +
      (!st.open ? '' : `<section class="demo-tour-panel"><header><strong>Guided tour</strong><nav class="demo-tour-routes">${ROUTES.map(x => `<button type="button" class="${x.id === r.id ? 'is-on' : ''}" data-tour="route" data-route="${x.id}" data-no-i18n>${E(x.id === 'mdt' ? 'A' : 'B')}</button>`).join('')}</nav></header>
        <p class="demo-tour-route" data-no-i18n>${E(r[L])}</p>
        <p class="demo-tour-step"><b data-no-i18n>${i + 1} / ${r.steps.length}</b> <span class="demo-tour-who">Switch to <b data-no-i18n>${E(personName(s.who))}</b></span></p>
        <p class="demo-tour-text" data-no-i18n>${E(s[L])}</p>
        <div class="demo-tour-row"><button type="button" class="secondary" data-tour="prev" ${i === 0 ? 'disabled' : ''}>Previous step</button><button type="button" data-tour="go">Go to this step</button><button type="button" class="secondary" data-tour="next" ${i === r.steps.length - 1 ? 'disabled' : ''}>Next step</button></div>
        <div class="demo-tour-row demo-tour-foot"><a href="guide.html" target="_blank" rel="noopener">Guide (one page)</a><button type="button" class="secondary demo-tour-danger" data-tour="reset">Restart demo data</button></div>
        <p class="demo-tour-hint">All patients, staff and data in this demo are fictitious. MDT write actions in this demo are for demonstration only and are not part of the phase 1 scope.</p></section>`);
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]'); if (!b) return; const k = b.dataset.tour, r = route();
    if (k === 'toggle') { st.open = !st.open; save(); render(); return; }
    if (k === 'route') { st.route = b.dataset.route; st.step = 0; save(); render(); return; }
    if (k === 'prev') { st.step = Math.max(0, st.step - 1); save(); render(); return; }
    if (k === 'next') { st.step = Math.min(r.steps.length - 1, st.step + 1); save(); render(); return; }
    if (k === 'go') { const s = r.steps[Math.min(st.step, r.steps.length - 1)]; const params = {...s.url, actor: s.who}; if (params.p) params.encounter = 'ENC-' + params.p; location.hash = '#' + new URLSearchParams(params).toString(); return; }
    if (k === 'reset') { if (confirm('Clear this browser’s demo changes and start over? Feedback notes are kept.')) { try { localStorage.removeItem((root.DEMO || {}).storageKey || 'emr-mdt-demo-v3'); } catch (err) { /* ignore */ } location.hash = '#view=overview&p=P03&actor=mercer'; location.reload(); } return; }
  });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-ui-lang]')) setTimeout(render, 0); }, true);
  render();
  root.ICUDemoTour = {routes: ROUTES, state: st, render};
})(typeof window !== 'undefined' ? window : globalThis);
