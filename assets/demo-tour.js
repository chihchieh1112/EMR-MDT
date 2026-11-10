/* EMR整合MDT demo：導覽模式（2026-11-10 P4；2026-11-11 修訂）。左下角浮動面板，照 README 的兩條故事線逐步帶看：
   A 團隊會議 MDT（Margaret Ellis，14 步）、B 個案跨團隊會議（Harold Whitmore，9 步）。每一步寫「切換誰、到哪一頁、按什麼、要自己填什麼、要先做哪一步」，
   「Go to this step」直接帶到該頁與該身分；「Back to start」回到第 1 步。面板可拖曳（抓標題列或圓鈕），位置存 localStorage；「Dock」歸位。
   按鈕名稱用 ICUi18n 翻成目前介面語言，測試者在中文介面也找得到。進度存 localStorage（emr-mdt-tour-v1）；網址加 ?tour=1 自動展開。
   面板掛在 body 下、#app 之外。步驟文字中英文都在這裡（不走字典），面板標籤走 i18n。 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const KEY = 'emr-mdt-tour-v1', POS = 'emr-mdt-tour-pos-v1', FB_POS = 'emr-mdt-fb-pos-v1';
  const E = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const lang = () => (root.ICUi18n && root.ICUi18n.lang ? root.ICUi18n.lang() : 'en');
  const ui = s => (lang() === 'zh' && root.ICUi18n && root.ICUi18n.t ? root.ICUi18n.t(s) : s);
  const CLOCK_TIP = {en: 'Demo time: the demo runs on its own clock (it starts at 2026-11-04 09:40), not your computer’s time. Buttons that depend on time (start the meeting, hold the conference, receive a report) only appear once the demo clock has reached that time. Open the grey line “Demo controls · demo time …” at the top of any MDT page and press a jump button; the clock only moves forward, and “Restart demo data” brings it back to the start.',
    zh: '示範時間：demo 有自己的時鐘（從 2026-11-04 09:40 開始），不是你電腦的時間。跟時間有關的按鈕（開始會議、召開個案會議、收到報告）要等示範時鐘到了才會出現。在任何 MDT 頁面最上方點灰色那行「示範控制 · 示範時間 …」展開，再按跳轉按鈕；時鐘只能往前，「重置示範資料」會回到起點。'};
  const ROUTES = [
    {id: 'mdt', en: 'Route A · Team meeting (MDT) · Margaret Ellis (A03)', zh: 'A 線 · 團隊會議 MDT · Margaret Ellis（A03）', steps: [
      {who: 'mercer', url: {view: 'overview', p: 'P03'},
        en: 'Open Margaret Ellis (A03). The “Team meeting (MDT)” card shows a proposal draft created from the adopted consult, with data readiness 6/8. Nothing to do on this step — just look.',
        zh: '打開 Margaret Ellis（A03）總覽。「團隊會議 MDT」卡顯示由照會採納產生的提案草稿，資料齊備 6/8。這一步只看，不用操作。'},
      {who: 'mercer', url: {view: 'notes', careWork: 'consultation', p: 'P03'}, press: ['Open MDT proposal draft'],
        en: 'Consults & care › Specialist consult. In the Breast Surgery consult card (CS-1102-04), on the line “Decision of doctor on duty: Adopted”, click the link named below.',
        zh: '照護 › 專科照會。在乳房外科照會卡（CS-1102-04）「當班醫師處理：採納」那一行，點下面這個連結。'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'propose', mdtCase: 'MDT-1103-06', p: 'P03'}, press: ['Save / submit proposal'],
        en: 'Proposal page: team (suggested from the diagnosis), session W44 and the clinical question are pre-filled from the consult. Keep “Submit to the agenda now” ticked and press the button. The deadline has passed, so the coordinator confirms it in the next step.',
        zh: '提案頁：團隊（依診斷建議）、會期 W44、臨床問題都由照會帶入。保持「立即送出排入議程」勾選，按下面的按鈕。已逾截止，所以下一步由協調人確認。'},
      {who: 'whitfield', url: {view: 'mdt', mdtTab: 'agenda', mdtTeam: 'breast', p: 'P03'}, press: ['Confirm for agenda'], needs: [3],
        en: 'As coordinator Grace Whitfield: Margaret Ellis is case #1 with the tag “Late · awaiting coordinator”. In the last column of that row press the button.',
        zh: '切換協調人 Grace Whitfield：Margaret Ellis 是第 1 案，標示「逾截止 · 待協調人確認」。在那一列最後一欄按下面的按鈕。'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'pack', mdtCase: 'MDT-1103-06', p: 'P03'}, press: ['Save'],
        type: {en: 'Patient wishes, e.g. “Wishes to keep the breast; worried about hair loss and cost.”', zh: '病人意願，例如「希望保留乳房；擔心掉髮與費用」。'},
        en: 'Summary pack: 8 items are read live from the record. Scroll down to “Patient wishes”, type the wishes and press Save → readiness 7/8; only the echocardiogram (LVEF) is still missing.',
        zh: '摘要包：8 項即時讀病歷。往下捲到「病人意願」，填入後按儲存 → 齊備 7/8，只剩心臟超音波（LVEF）。'},
      {who: 'price', url: {view: 'mdt', mdtTab: 'prefillEdit', mdtCase: 'MDT-1103-06', p: 'P03'}, press: ['Save'], needs: [3],
        type: {en: 'Box 1 “Assessment”, e.g. “Primary tumour 3.2 cm; two suspicious axillary nodes; no distant metastasis on CT.” Q1–Q3: pick an answer or leave “Outside own field”.', zh: '第 1 格「本科評估」，例如「原發腫瘤 3.2 cm；腋下兩顆可疑淋巴結；CT 無遠端轉移」。Q1–Q3 選一個答案或維持「非本科範圍」。'},
        en: 'Optional pre-meeting input, as Dr. Price (Imaging). This page is also reachable from Price’s My to-dos → “Pre-meeting input for case MDT-1103-06”. Fill the form, keep “Send pre-fill now” ticked and press Save. Other disciplines’ pre-fills (right column, 🔒) unlock only after you send yours.',
        zh: '選配的會前預填，身分是影像科 Dr. Price。這一頁也可以從 Price 的待辦「Pre-meeting input for case MDT-1103-06」進來。填好表單，保持「立即送出預填」勾選，按儲存。右欄他科預填（🔒）要送出自己的才看得到。'},
      {who: 'whitfield', url: {view: 'mdt', mdtTab: 'prefill', mdtCase: 'MDT-1103-06', p: 'P03'}, press: ['Remind those who have not filled in'],
        en: 'Coordinator’s pre-fill overview: “Sent 7 / 8” if you did step 6 (6 / 8 otherwise — Dr. Cole, Nuclear Medicine, never fills in). Question tallies, points for discussion, and the reminder button (optional).',
        zh: '協調人的預填總表：做了第 6 步會顯示「已送出 7 / 8」（沒做則 6 / 8；核醫 Dr. Cole 一直沒填）。有問題票數、會中待討論，以及提醒未填者的按鈕（可按可不按）。'},
      {who: 'brooks', url: {view: 'mdt', mdtTab: 'agenda', mdtTeam: 'breast', p: 'P03'}, press: ['MDT meeting · 11-04 14:00', 'Start the meeting (record attendance, freeze summary packs)'], tip: CLOCK_TIP,
        en: 'As secretary Dr. Brooks. First move the demo clock: at the top of the page click the grey line “Demo controls · demo time 2026-11-04 09:40” to expand it, then press the first jump button. The session card then shows the “Start the meeting” button — press it (attendance is recorded and the summary packs are frozen).',
        zh: '切換秘書 Dr. Brooks。先調示範時鐘：點頁面最上方灰色那行「示範控制 · 示範時間 2026-11-04 09:40」展開，按第一個跳轉按鈕。會期卡片隨即出現「開始會議」按鈕，按下去（記錄出席、凍結摘要包）。'},
      {who: 'brooks', url: {view: 'mdt', mdtTab: 'record', mdtCase: 'MDT-1103-06', p: 'P03'}, press: ['Save summary and conclusion', 'Save action plan'], needs: [8],
        type: {en: 'B.4 conclusion, e.g. “Neoadjuvant AC ×4 → weekly paclitaxel ×12 once LVEF ≥ 50%; reassess breast conservation after cycle 4; genetics referral.” The action plan rows are already suggested — keep or edit.', zh: 'B.4 結論，例如「術前 AC ×4 → 每週 paclitaxel ×12，LVEF ≥ 50% 才開始；第 4 週期後重新評估保乳；轉介遺傳諮詢」。處置計畫三列已先建議好，可保留或修改。'},
        en: 'Discussion record, three things: (1) B.2 / B.4 — the case summary is pre-filled; type the team conclusion and press “Save summary and conclusion”. (2) B.4 Action plan — three rows are suggested from the pre-fills (row 1 chemotherapy · Dr. Mercer, row 2 radiotherapy planning · Dr. Finch, row 3 genetics referral · Grace Whitfield); press “Save action plan”. (3) B.3 — opinions are brought in from the pre-fills; if you edit one, the change shows as a diff.',
        zh: '討論紀錄，做三件事：(1) B.2／B.4：個案摘要已帶入；填團隊結論，按「儲存摘要與結論」。(2) B.4 處置計畫：三列已依預填建議（第 1 列化療 · Dr. Mercer，第 2 列放療規劃 · Dr. Finch，第 3 列遺傳諮詢 · Grace Whitfield）；按「儲存處置計畫」。(3) B.3：各科意見由預填帶入；改了會標出差異。'},
      {who: 'ashford', url: {view: 'mdt', mdtTab: 'record', mdtCase: 'MDT-1103-06', p: 'P03'}, press: ['Confirm pre-fill', 'Confirm and lock record v1'], needs: [9],
        en: 'As chair Dr. Ashford: in B.3 find your own card (Breast Surgery) and press “Confirm pre-fill”; then at the bottom press “Confirm and lock record v1”. One hand-off task per plan row is created and an excerpt is filed in the patient record.',
        zh: '切換主席 Dr. Ashford：在 B.3 找到自己的卡（乳房外科）按「確認預填」；再到最下方按「確認並鎖定紀錄 v1」。每一列處置計畫產生一筆交接任務，摘錄進病歷。'},
      {who: 'brooks', url: {view: 'mdt', mdtTab: 'record', mdtCase: 'MDT-1103-06', mdtPrint: '1', p: 'P03'},
        en: 'Print preview of the meeting record (A4, neutral form name). Just look; use the browser’s print if you like.',
        zh: '會議紀錄列印預覽（A4，中性表單名稱）。只看；要印可用瀏覽器列印。'},
      {who: 'finch', url: {view: 'mdt', mdtTab: 'tasks', mdtCase: 'MDT-1103-06', p: 'P03'}, press: ['Receive task'], needs: [10],
        en: 'As Dr. Finch (Radiation Oncology): the task from plan row 2 shows “Awaiting receipt” — press “Receive task”. (If you removed Dr. Finch from the plan in step 9 there is nothing to receive here; skip.)',
        zh: '切換放腫科 Dr. Finch：處置計畫第 2 列的任務顯示「待接收」，按「接收任務」。（如果第 9 步把 Dr. Finch 那列刪掉了，這裡就沒有任務，跳過即可。）'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'tasks', mdtCase: 'MDT-1103-06', p: 'P03'}, press: ['Receive task', 'Order per conclusion'], needs: [10],
        type: {en: 'On the order page: pick doxorubicin from the breast bundle, dose mode “Per m²”, dose 60 → the page shows BSA 1.60 → 96 mg; confirm the order.', zh: '開立頁：從乳癌組套選 doxorubicin，劑量模式「每 m²」，劑量 60 → 頁面顯示 BSA 1.60 → 96 mg；確認開立。'},
        en: 'As Dr. Mercer: on task 1 press “Receive task”, then “Order per conclusion”. Place the order as described below. Back on this page task 1 becomes “Adopted · ordered” and the order carries the MDT conclusion as its source.',
        zh: '切回 Dr. Mercer：任務 1 按「接收任務」，再按「依結論開立」。照下面說明開立。回到這一頁，任務 1 變成「已採納 · 已開立」，醫囑帶 MDT 結論來源。'},
      {who: 'hartley', url: {view: 'mdt', mdtTab: 'dashboard', p: 'P03'}, press: ['Receive echo report (LVEF 60%) · 11-05 08:50'], tip: CLOCK_TIP,
        en: 'Dashboard: live indicators plus eight-week demo figures. AI assistance, remote MDT and automatic enrolment appear only as roadmap. Optional: open Demo controls and press the echo button — the cardiac report arrives and Margaret’s readiness becomes 8/8.',
        zh: '儀表板：即時指標＋八週示範數字。AI 輔助、遠距 MDT、自動排入只列為 roadmap。可選：展開示範控制，按心臟超音波那顆按鈕，報告回來後 Margaret 的齊備變 8/8。'}]},
    {id: 'care', en: 'Route B · Case conference · Harold Whitmore (A06)', zh: 'B 線 · 個案跨團隊會議 · Harold Whitmore（A06）', steps: [
      {who: 'mercer', url: {view: 'notes', careWork: 'allied', p: 'P06'},
        en: 'Harold Whitmore (A06): Consults & care › Allied-health consult — four template-based consults this admission. Below the list, the request form shows template items and auto-filled data; a second open consult to the same discipline is refused. Just look.',
        zh: 'Harold Whitmore（A06）：照護 › 職類照會 — 本次住院四張範本式照會。清單下方的開單表單有範本勾選項與系統帶入資料；同職類未結案不能再開。這一步只看。'},
      {who: 'booth', url: {view: 'tasks', p: 'P06'}, press: ['Save'],
        type: {en: 'The reply form: fill the assessment / plan boxes (e.g. “Lives alone, daughter abroad; home care to be arranged before discharge”), tick the flag “Difficult discharge”.', zh: '回覆表單：填評估／計畫（例如「獨居，女兒在國外；出院前需安排居家照護」），勾選註記「困難出院」。'},
        en: 'As social worker Natalie Booth: My to-dos is the Social Work worklist and RF-1103-04 (Harold Whitmore) is selected. Fill the reply form, keep “Sign and send now” ticked and press Save.',
        zh: '切換社工 Natalie Booth：待辦就是社工工作清單，已選到 RF-1103-04（Harold Whitmore）。填回覆表單，保持「立即簽名送出」勾選，按儲存。'},
      {who: 'mercer', url: {view: 'notes', careWork: 'team', p: 'P06'}, press: ['Start case conference'], needs: [2],
        en: 'Team overview: the meeting prompt is met (4 consults ≥ 3, difficult discharge). Each reply card shows the attending’s decision; adopted ones carry the consult as the order source. Press the button.',
        zh: '團隊總覽：召開提示成立（4 張 ≥ 3、困難出院）。每張回覆卡有主治決定，採納的醫囑帶照會來源。按下面的按鈕。'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'caseDecide', p: 'P06'}, press: ['Send request (Head of Department approval) / record decision'],
        en: 'Decision to convene: topic, reasons, questions and participants are pre-filled; the level is determined by the system (within department — allied-health disciplines do not count). Keep “Hold a meeting” and press the send button at the bottom.',
        zh: '召開判斷：主題、原因、問題、與會者已帶入；層級由系統判定（科內：職類不計科數）。維持「召開會議」，按最下方的送出按鈕。'},
      {who: 'hartley', url: {view: 'mdt', mdtTab: 'cases', p: 'P06'}, press: ['Approve the request'], needs: [4],
        en: 'As Head of Department Dr. Hartley: Case meetings → open the new request for Harold Whitmore (status “Awaiting approval”) → press the button.',
        zh: '切換科主任 Dr. Hartley：個案會議 → 開啟 Harold Whitmore 的新申請（狀態「待核准」）→ 按下面的按鈕。'},
      {who: 'blake', url: {view: 'mdt', mdtTab: 'cases', p: 'P06'}, press: ['Confirm time and send invitations'], needs: [5],
        en: 'As head nurse Susan Blake (department coordinator): open the same request — date, time and location are proposed — and press the button. Invitations go out.',
        zh: '切換護理長 Susan Blake（科內協調人）：開啟同一份申請，日期、時間、地點已帶入，按下面的按鈕。邀請送出。'},
      {who: 'brooks', url: {view: 'mdt', mdtTab: 'cases', p: 'P06'}, press: ['Save summary and conclusion', 'Save action plan', 'Send to chair for confirmation', 'Confirm and lock record v1'], needs: [6], tip: CLOCK_TIP,
        type: {en: 'Conclusion, e.g. “Discharge 11-07 once home care is confirmed; nutrition supplement; fall-prevention training; social work to follow costs.” Action plan row 1, e.g. “Discharge preparation and family education” (owner: the nurse).', zh: '結論，例如「居家照護確認後 11-07 出院；營養補充；跌倒預防訓練；社工追蹤費用」。處置計畫第 1 列，例如「出院準備與家屬衛教」（負責人：護理師）。'},
        en: 'As secretary Dr. Brooks: open the conference record — B.3 brings in the allied-health replies. Type the conclusion and save; fill at least one action-plan row and save; then “Send to chair for confirmation”. Then switch to Dr. Hartley (chair, via the account menu or the next “Go to this step” with his name) and press “Confirm and lock record v1” — tasks, the excerpt and the family meeting are created.',
        zh: '切換秘書 Dr. Brooks：開啟會議紀錄，B.3 帶入職類回覆。填結論並儲存；至少填一列處置計畫並儲存；再按「送主席確認」。然後切換到主席 Dr. Hartley（右上帳號選單切換）按「確認並鎖定紀錄 v1」，產生任務、摘錄與家庭會議。'},
      {who: 'mercer', url: {view: 'mdt', mdtTab: 'cases', mdtFilter: 'family', p: 'P06'}, press: ['Save family meeting record', 'Record confirmation (SMS code)', 'Sign (e-signature)'], needs: [7], tip: CLOCK_TIP,
        type: {en: 'Consensus and decisions, e.g. “Discharge 11-07 after home care is confirmed; daughter stays the first week; social work applies for subsidy.”', zh: '共識與決定，例如「居家照護確認後 11-07 出院；第一週女兒陪同；社工協助申請補助」。'},
        en: 'Family meeting record (Case meetings › filter “Family meeting”, open the one for Harold Whitmore): attendees are pre-filled and the points explained cite the conclusion. Type the decisions and save. Then in the signature table press “Record confirmation (SMS code)” for the family representative and “Sign (e-signature)” for the attending → completed 2 / 2.',
        zh: '家庭會議紀錄（個案會議 › 篩選「家庭會議」，開啟 Harold Whitmore 那一筆）：出席名單已帶入，說明引用結論。填決定並儲存。再到簽名表：家屬代表按「記錄確認（簡訊碼）」、主治按「簽名（電子簽章）」→ 完成 2 / 2。'},
      {who: 'admin', url: {view: 'settings', tab: 'levels'},
        en: 'Maintenance settings (read-only in this demo): consultation levels & signatures and the consult form templates.',
        zh: '維護設定（demo 唯讀）：會診層級與簽章、照會表單範本。'}]}
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
    const r = route(), i = Math.min(Math.max(0, st.step), r.steps.length - 1), s = r.steps[i], L = lang() === 'zh' ? 'zh' : 'en', zh = L === 'zh';
    const press = s.press && s.press.length ? `<p class="demo-tour-press" data-no-i18n><b>${zh ? '要按：' : 'Click:'}</b> ${s.press.map(x => `<kbd>${E(ui(x))}</kbd>`).join(zh ? ' → ' : ' → ')}</p>` : '';
    const type = s.type ? `<p class="demo-tour-type" data-no-i18n><b>✍ ${zh ? '要自己填：' : 'You type:'}</b> ${E(s.type[L])}</p>` : '';
    const needs = s.needs && s.needs.length ? `<p class="demo-tour-needs" data-no-i18n>⚠ ${zh ? '要先做完第 ' + s.needs.join('、') + ' 步（同一個瀏覽器）' : 'Needs step ' + s.needs.join(', ') + ' done first (same browser)'}</p>` : '';
    const tip = s.tip ? `<details class="demo-tour-tip"><summary data-no-i18n>${zh ? 'ⓘ 示範時間怎麼用' : 'ⓘ How demo time works'}</summary><p data-no-i18n>${E(s.tip[L])}</p></details>` : '';
    box.innerHTML = `<button type="button" class="demo-tour-toggle" data-tour="toggle" aria-expanded="${st.open}" title="${zh ? '拖曳可移動' : 'Drag to move'}">${st.open ? '✕' : '▶'} <span>Guided tour</span></button>` +
      (!st.open ? '' : `<section class="demo-tour-panel"><header title="${zh ? '拖曳可移動' : 'Drag to move'}"><strong>⠿ Guided tour</strong><nav class="demo-tour-routes">${ROUTES.map(x => `<button type="button" class="${x.id === r.id ? 'is-on' : ''}" data-tour="route" data-route="${x.id}" data-no-i18n title="${E(x[L])}">${E(x.id === 'mdt' ? 'A' : 'B')}</button>`).join('')}<button type="button" class="demo-tour-dock" data-tour="dock" title="Dock panel">↙</button></nav></header>
        <p class="demo-tour-route" data-no-i18n>${E(r[L])}</p>
        <p class="demo-tour-step"><b data-no-i18n>${i + 1} / ${r.steps.length}</b> <span class="demo-tour-who">Switch to <b data-no-i18n>${E(personName(s.who))}</b></span></p>
        <p class="demo-tour-text" data-no-i18n>${E(s[L])}</p>${press}${type}${needs}${tip}
        <div class="demo-tour-row"><button type="button" class="secondary" data-tour="prev" ${i === 0 ? 'disabled' : ''}>Previous step</button><button type="button" data-tour="go" title="${zh ? '切換身分並打開這一步的頁面' : 'Switches the role and opens this step’s page'}">Go to this step</button><button type="button" class="secondary" data-tour="next" ${i === r.steps.length - 1 ? 'disabled' : ''}>Next step</button></div>
        <p class="demo-tour-hint" data-no-i18n>${zh ? '「前往這一步」會自動切換身分並打開該頁；再照上面文字操作。' : '“Go to this step” switches the role and opens the page; then follow the text above.'}</p>
        <div class="demo-tour-row demo-tour-foot"><button type="button" class="secondary" data-tour="start" ${i === 0 ? 'disabled' : ''}>Back to start</button><a href="guide.html" target="_blank" rel="noopener">Guide (one page)</a><button type="button" class="secondary demo-tour-danger" data-tour="reset">Restart demo data</button></div>
        <p class="demo-tour-hint">All patients, staff and data in this demo are fictitious. MDT write actions in this demo are for demonstration only and are not part of the phase 1 scope.</p></section>`);
  }
  function goTo(s) { const params = {...s.url, actor: s.who}; if (params.p) params.encounter = 'ENC-' + params.p; location.hash = '#' + new URLSearchParams(params).toString(); }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]'); if (!b) return; const k = b.dataset.tour, r = route();
    if (k === 'toggle') { st.open = !st.open; save(); render(); return; }
    if (k === 'route') { st.route = b.dataset.route; st.step = 0; save(); render(); return; }
    if (k === 'prev') { st.step = Math.max(0, st.step - 1); save(); render(); return; }
    if (k === 'next') { st.step = Math.min(r.steps.length - 1, st.step + 1); save(); render(); return; }
    if (k === 'start') { st.step = 0; save(); render(); goTo(r.steps[0]); return; }
    if (k === 'go') { goTo(r.steps[Math.min(st.step, r.steps.length - 1)]); return; }
    if (k === 'dock') { dock(box, POS); return; }
    if (k === 'reset') { if (confirm('Clear this browser’s demo changes and start over? Feedback notes are kept.')) { try { localStorage.removeItem((root.DEMO || {}).storageKey || 'emr-mdt-demo-v4'); } catch (err) { /* ignore */ } location.hash = '#view=overview&p=P03&actor=mercer'; location.reload(); } return; }
  });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-ui-lang]')) setTimeout(render, 0); }, true);

  // ---- 拖曳（面板可移動，避免擋住要操作的畫面）----
  function place(el, x, y) {
    const r = el.getBoundingClientRect(), w = Math.min(r.width, innerWidth), h = Math.min(r.height, innerHeight);
    x = Math.max(0, Math.min(x, innerWidth - w)); y = Math.max(0, Math.min(y, innerHeight - h));
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.classList.add('is-moved');
    return {x, y};
  }
  function dock(el, key) { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; el.classList.remove('is-moved'); try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  function draggable(el, handleSel, key) {
    if (!el) return;
    let drag = null;
    try { const p = JSON.parse(localStorage.getItem(key) || 'null'); if (p && typeof p.x === 'number') place(el, p.x, p.y); } catch (e) { /* ignore */ }
    // 移動與放開都聽在 document 上（游標跳出面板也跟得上）；超過 5px 才算拖曳，所以按鈕的 click 不受影響。
    const move = e => { if (!drag || e.pointerId !== drag.id) return; if (!drag.moved) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return; drag.moved = true; } place(el, e.clientX - drag.dx, e.clientY - drag.dy); e.preventDefault(); };
    const end = e => { if (!drag || e.pointerId !== drag.id) return; const moved = drag.moved; drag = null; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); if (moved) { const r = el.getBoundingClientRect(); try { localStorage.setItem(key, JSON.stringify({x: r.left, y: r.top})); } catch (err) { /* ignore */ } el.dataset.dragged = '1'; setTimeout(() => { delete el.dataset.dragged; }, 50); } };
    el.addEventListener('pointerdown', e => { const h = e.target.closest(handleSel); if (!h || e.button !== 0 || e.target.closest('button:not(.demo-tour-toggle):not(.demo-fb-toggle), a, input, select, textarea')) return; const r = el.getBoundingClientRect(); drag = {id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false}; document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end); });
    el.addEventListener('click', e => { if (el.dataset.dragged) { e.stopPropagation(); e.preventDefault(); } }, true);
    window.addEventListener('resize', () => { if (el.classList.contains('is-moved')) { const r = el.getBoundingClientRect(); place(el, r.left, r.top); } });
    // 展開／收合後高度改變：仍留在畫面內
    new MutationObserver(() => { if (el.classList.contains('is-moved')) { const r = el.getBoundingClientRect(); if (r.bottom > innerHeight || r.right > innerWidth) place(el, r.left, r.top); } }).observe(el, {childList: true});
  }
  render();
  draggable(box, '.demo-tour-panel header, .demo-tour-toggle', POS);
  draggable(document.getElementById('demo-feedback'), '.demo-fb-panel header, .demo-fb-toggle', FB_POS);
  root.ICUDemoTour = {routes: ROUTES, state: st, render};
})(typeof window !== 'undefined' ? window : globalThis);
