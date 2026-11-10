/* EMR整合MDT demo：MDT 模組的示範狀態（2026-11-10，P2）。
   在 seed-oncology.js 之後載入，把 root.ICUDemoSeed.state() 包一層，多出 state.mdt 這一片：
   團隊與會期（20）、本週議程（21）、提案草稿 MDT-1103-06（09p）、上週 10-28 已結論的紀錄與交接任務（23／25）、儀表板的示範數字（26）。
   時間線照 46 張畫面的正典：11-03 10:05 採納照會並產生提案草稿 → 11-04 14:00 乳癌團隊會議第 1 案 → 11-05 採納開單 → 11-06 開始治療。
   全部虛構；寫入動作只供示範，不是一期範圍。 */
(function (root) {
  'use strict';
  const seed = root.ICUDemoSeed;
  if (!seed || typeof seed.state !== 'function') return;
  const copy = x => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- 團隊（20 團隊與會期）----
  // 成員用帳號鍵；role：chair 主席、secretary 秘書、coordinator 協調人、core 核心成員、byCase 依個案。
  const TEAMS = [
    {id: 'breast', name: 'Breast cancer team', short: 'Breast', icdPrefixes: ['C50', 'D05'], weekday: 'Wednesday', time: '14:00', duration: '120 min', room: 'Conference room 3 (Oncology building, 2F)', video: 'Video link available for members off site',
      deadline: 'Proposals by 12:00 the day before; late proposals need the coordinator’s confirmation', quorum: 'Chair (or deputy) + surgery, medical oncology, radiation oncology, imaging, pathology',
      members: [
        {who: 'ashford', role: 'chair', attend: 'every'}, {who: 'kemp', role: 'byCase', attend: 'every', note: 'Deputy chair'}, {who: 'brooks', role: 'secretary', attend: 'every'}, {who: 'whitfield', role: 'coordinator', attend: 'every'},
        {who: 'mercer', role: 'core', attend: 'every'}, {who: 'grant', role: 'core', attend: 'every'}, {who: 'finch', role: 'core', attend: 'every'}, {who: 'price', role: 'core', attend: 'every'}, {who: 'webb', role: 'core', attend: 'every'},
        {who: 'cole', role: 'byCase', attend: 'staging', note: 'Bone scan / PET-CT cases'}, {who: 'hale', role: 'byCase', attend: 'reconstruction', note: 'Reconstruction cases'}, {who: 'morgan', role: 'byCase', attend: 'drug', note: 'Regimen or dose questions'}],
      metrics: {discussed: 18, complete: 95, onTime: 91, attendance: 96}},
    {id: 'lung', name: 'Lung cancer team', short: 'Lung', icdPrefixes: ['C34', 'C33', 'C45'], weekday: 'Tuesday', time: '15:00', duration: '90 min', room: 'Conference room 2', video: 'Video link available',
      deadline: 'Proposals by 12:00 the day before', quorum: 'Chair + thoracic surgery, medical oncology, radiation oncology, imaging, pathology',
      members: [{who: 'hartley', role: 'chair', attend: 'every'}, {who: 'brooks', role: 'secretary', attend: 'every'}, {who: 'whitfield', role: 'coordinator', attend: 'every'}, {who: 'grant', role: 'core', attend: 'every'}, {who: 'finch', role: 'core', attend: 'every'}, {who: 'price', role: 'core', attend: 'every'}, {who: 'webb', role: 'core', attend: 'every'}, {who: 'cole', role: 'byCase', attend: 'staging'}],
      metrics: {discussed: 12, complete: 88, onTime: 86, attendance: 92}},
    {id: 'liver', name: 'Liver cancer team', short: 'Liver', icdPrefixes: ['C22', 'C23', 'C24'], weekday: 'Thursday', time: '13:30', duration: '90 min', room: 'Conference room 2', video: 'Video link available',
      deadline: 'Proposals by 12:00 the day before', quorum: 'Chair + hepatobiliary surgery, medical oncology, interventional radiology, imaging, pathology',
      members: [{who: 'hartley', role: 'chair', attend: 'every'}, {who: 'brooks', role: 'secretary', attend: 'every'}, {who: 'whitfield', role: 'coordinator', attend: 'every'}, {who: 'grant', role: 'core', attend: 'every'}, {who: 'price', role: 'core', attend: 'every'}, {who: 'webb', role: 'core', attend: 'every'}, {who: 'cole', role: 'byCase', attend: 'staging'}],
      metrics: {discussed: 7, complete: 90, onTime: 89, attendance: 90}},
    {id: 'colorectal', name: 'Colorectal cancer team', short: 'Colorectal', icdPrefixes: ['C18', 'C19', 'C20', 'C21'], weekday: 'Friday', time: '14:00', duration: '90 min', room: 'Conference room 3', video: 'Video link available',
      deadline: 'Proposals by 12:00 the day before', quorum: 'Chair + colorectal surgery, medical oncology, radiation oncology, imaging, pathology',
      members: [{who: 'hartley', role: 'chair', attend: 'every'}, {who: 'brooks', role: 'secretary', attend: 'every'}, {who: 'whitfield', role: 'coordinator', attend: 'every'}, {who: 'mercer', role: 'core', attend: 'every'}, {who: 'finch', role: 'core', attend: 'every'}, {who: 'price', role: 'core', attend: 'every'}, {who: 'webb', role: 'core', attend: 'every'}, {who: 'morgan', role: 'byCase', attend: 'drug'}],
      metrics: {discussed: 9, complete: 86, onTime: 84, attendance: 93}}
  ];

  // ---------------------------------------------------------------- 會期 ----
  // W43＝10-28（已結論，交接追蹤進行中）；W44＝11-04 14:00（本週，示範時鐘 11-04 09:40 → 會前）；W45＝11-11（開放提案）。
  const SESSIONS = [
    {id: 'S-BREAST-W43', team: 'breast', week: 'W43', date: '2026-10-28', time: '14:00', end: '16:05', room: 'Conference room 3', status: 'concluded', chair: 'ashford', secretary: 'brooks', startedAt: '2026-10-28T14:02', concludedAt: '2026-10-28T16:05',
      attendance: {ashford: 'present', brooks: 'present', whitfield: 'present', mercer: 'present', grant: 'present', finch: 'present', price: 'video', webb: 'present', cole: 'absent', kemp: 'present'}},
    {id: 'S-BREAST-W44', team: 'breast', week: 'W44', date: '2026-11-04', time: '14:00', end: '16:00', room: 'Conference room 3', status: 'scheduled', chair: 'ashford', secretary: 'brooks', proposalDeadline: '2026-11-03T12:00',
      attendance: {ashford: 'present', brooks: 'present', whitfield: 'present', mercer: 'present', grant: 'present', finch: 'present', price: 'video', webb: 'present', kemp: 'present', hale: 'present'}, replies: {cole: 'pending', morgan: 'pending'}},
    {id: 'S-BREAST-W45', team: 'breast', week: 'W45', date: '2026-11-11', time: '14:00', end: '16:00', room: 'Conference room 3', status: 'open', chair: 'ashford', secretary: 'brooks', proposalDeadline: '2026-11-10T12:00', attendance: {}},
    {id: 'S-LUNG-W44', team: 'lung', week: 'W44', date: '2026-11-03', time: '15:00', end: '16:30', room: 'Conference room 2', status: 'concluded', chair: 'hartley', secretary: 'brooks', startedAt: '2026-11-03T15:03', concludedAt: '2026-11-03T16:20', attendance: {hartley: 'present', brooks: 'present', whitfield: 'present', grant: 'present', finch: 'present', price: 'present', webb: 'video'}},
    {id: 'S-LUNG-W45', team: 'lung', week: 'W45', date: '2026-11-10', time: '15:00', end: '16:30', room: 'Conference room 2', status: 'open', chair: 'hartley', secretary: 'brooks', proposalDeadline: '2026-11-09T12:00', attendance: {}},
    {id: 'S-LIVER-W44', team: 'liver', week: 'W44', date: '2026-11-05', time: '13:30', end: '15:00', room: 'Conference room 2', status: 'scheduled', chair: 'hartley', secretary: 'brooks', proposalDeadline: '2026-11-04T12:00', attendance: {}},
    {id: 'S-CRC-W44', team: 'colorectal', week: 'W44', date: '2026-11-06', time: '14:00', end: '15:30', room: 'Conference room 3', status: 'scheduled', chair: 'hartley', secretary: 'brooks', proposalDeadline: '2026-11-05T12:00', attendance: {}}
  ];

  // ---------------------------------------------------------------- 提案／議程個案 ----
  // status：draft 草稿 → submitted 已送出（議程）→ discussed 已討論（紀錄中）→ concluded 已結論（紀錄鎖定）；deferred 延後。
  // p 有值＝住院病人（讀病歷算齊備）；external＝門診個案（資料項目寫死在 pack）。
  const PROPOSALS = [
    // 本週 11-04 第 1–5 案（21 本週議程：主角 Hoa 的草稿在 09p 送出後變成第 1 案；這裡先給 5 案，送出後 6 案）
    {id: 'MDT-1103-06', p: 'P03', team: 'breast', session: 'S-BREAST-W44', seq: 1, status: 'draft', type: 'new', urgency: 'routine',
      question: 'Right breast IDC cT2N1M0, luminal B-like (HER2-negative), patient wishes breast conservation: neoadjuvant chemotherapy first or upfront surgery? Regimen and sequence; axillary management; genetics referral.',
      reason: 'Newly diagnosed stage IIB breast cancer; specialist consult (Breast Surgery, 11-03) recommends team discussion to agree the treatment sequence.',
      proposer: 'mercer', presenter: 'mercer', createdAt: '2026-11-03T10:05', source: {kind: 'consult', id: 'CS-1102-04'}, ecog: '1', wishes: '', prefill: true,
      lateProposal: true, previous: null,
      // 紀錄頁處置計畫的預設列（demo-only）：讓導覽第 9 步不用自己想要填什麼，第 12 步 Dr. Finch 才有任務可接收；秘書可改可刪。
      suggestedActions: [
        {kind: 'treatment', text: 'Start neoadjuvant AC cycle 1 (doxorubicin 60 mg/m² + cyclophosphamide 600 mg/m²) once LVEF ≥ 50%', owner: 'mercer', due: '2026-11-06'},
        {kind: 'referral', text: 'Radiotherapy planning consultation after surgery (whole-breast RT if breast-conserving; regional nodes if pN ≥ 1)', owner: 'finch', due: '2026-11-18'},
        {kind: 'operational', text: 'Arrange genetic counselling and BRCA1/2 germline testing (family history)', owner: 'whitfield', due: '2026-11-11'}]},
    {id: 'MDT-1030-02', p: 'P02', team: 'breast', session: 'S-BREAST-W44', seq: 2, status: 'submitted', type: 'postop', urgency: 'routine',
      question: 'Left breast IDC after modified radical mastectomy (11-02), clinical N1: adjuvant systemic therapy and radiotherapy plan pending final histology (expected 11-09).',
      reason: 'Post-operative adjuvant planning.', proposer: 'ashford', presenter: 'ashford', createdAt: '2026-10-30T11:20', submittedAt: '2026-10-30T11:25', source: {kind: 'manual'}, ecog: '0', wishes: 'Wants to return to work within 3 months; prefers the shortest effective treatment.', prefill: false},
    {id: 'MDT-1031-03', external: {name: 'Eleanor Whitby', mrn: '23-088104', birthDate: '1966-08-21', gender: 'female', clinic: 'Breast surgery clinic', dx: 'C50.9 · Chest-wall recurrence 3 years after mastectomy'}, team: 'breast', session: 'S-BREAST-W44', seq: 3, status: 'submitted', type: 'change', urgency: 'routine',
      question: 'Chest-wall recurrence 3 years after mastectomy and adjuvant endocrine therapy: local excision + radiotherapy versus systemic therapy first; restaging needed.',
      reason: 'Recurrence confirmed on punch biopsy 10-29.', proposer: 'ashford', presenter: 'ashford', createdAt: '2026-10-31T09:00', submittedAt: '2026-10-31T09:10', source: {kind: 'manual'}, ecog: '1', wishes: '',
      packFixed: {pathology: {ok: true, text: 'Punch biopsy 10-29: recurrent invasive carcinoma, ER+ PR− HER2 0'}, staging: {ok: false, text: 'Restaging CT and bone scan not yet done'}, biomarkers: {ok: true, text: 'ER 80% / PR 0% / HER2 0 / Ki-67 25%'}, imaging: {ok: false, text: 'Chest-wall ultrasound only'}, labs: {ok: true, text: 'CBC and biochemistry 10-29 normal'}, performance: {ok: true, text: 'ECOG 1'}, cardiac: {ok: false, text: 'No echocardiography on file'}, wishes: {ok: false, text: ''}}, prefill: false},
    {id: 'MDT-1101-04', p: 'P07', team: 'breast', session: 'S-BREAST-W44', seq: 4, status: 'submitted', type: 'change', urgency: 'routine',
      question: 'HER2-positive stage IIIA after 4 cycles of neoadjuvant chemotherapy with dual HER2 blockade: response assessment and surgical plan (breast conservation feasibility, axillary surgery).',
      reason: 'Response evaluation imaging due 11-04.', proposer: 'mercer', presenter: 'mercer', createdAt: '2026-11-01T10:40', submittedAt: '2026-11-01T10:45', source: {kind: 'manual'}, ecog: '0', wishes: 'Prefers breast conservation if oncologically safe.', prefill: false},
    {id: 'MDT-1102-05', external: {name: 'Patricia Lowe', mrn: '26-105880', birthDate: '1971-02-14', gender: 'female', clinic: 'Breast surgery clinic', dx: 'C50.4 · Right breast IDC, cT1cN0M0 stage IA, HER2 2+ (equivocal)'}, team: 'breast', session: 'S-BREAST-W44', seq: 5, status: 'submitted', type: 'new', urgency: 'routine',
      question: 'Stage IA breast cancer with HER2 2+ on immunohistochemistry: surgery first; HER2 ISH pending — adjuvant plan depends on result.',
      reason: 'New diagnosis; outpatient.', proposer: 'ashford', presenter: 'ashford', createdAt: '2026-11-02T09:30', submittedAt: '2026-11-02T09:35', source: {kind: 'manual'}, ecog: '0', wishes: 'Wants to discuss breast conservation and the need for chemotherapy.',
      packFixed: {pathology: {ok: true, text: 'Core biopsy 10-24: IDC (NST) grade 2'}, staging: {ok: true, text: 'cT1cN0M0; no distant staging indicated at stage IA'}, biomarkers: {ok: false, text: 'ER 70% / PR 40% / HER2 2+ (equivocal) — ISH result pending'}, imaging: {ok: true, text: 'Mammography and ultrasound 10-20; MRI 10-30'}, labs: {ok: true, text: 'CBC and biochemistry 10-30 normal'}, performance: {ok: true, text: 'ECOG 0'}, cardiac: {ok: true, text: 'Echocardiography 10-31: LVEF 64%'}, wishes: {ok: true, text: 'Recorded'}}, prefill: false},
    // 上週 10-28 已結論的兩案（追蹤表：Frances Doyle、Beatrice Holt）＋住院的 Rachel Dawson（A08，結論 AC 已開始）與 Judith Carver（A12，放療評估逾期）
    {id: 'MDT-1023-01', p: 'P08', team: 'breast', session: 'S-BREAST-W43', seq: 1, status: 'concluded', type: 'new', urgency: 'routine',
      question: 'Right breast IDC grade 3 cT2N1M0: neoadjuvant regimen.', reason: 'New diagnosis.', proposer: 'mercer', presenter: 'mercer', createdAt: '2026-10-23T09:00', submittedAt: '2026-10-23T09:05', source: {kind: 'manual'}, ecog: '0', wishes: 'Agrees to chemotherapy; wishes to discuss fertility preservation.', record: 'REC-1028-01'},
    {id: 'MDT-1023-02', p: 'P12', team: 'breast', session: 'S-BREAST-W43', seq: 2, status: 'concluded', type: 'postop', urgency: 'routine',
      question: 'Left breast IDC pT2N2a after mastectomy: adjuvant chemotherapy and post-mastectomy radiotherapy.', reason: 'Post-operative adjuvant planning.', proposer: 'mercer', presenter: 'mercer', createdAt: '2026-10-23T09:30', submittedAt: '2026-10-23T09:35', source: {kind: 'manual'}, ecog: '1', wishes: 'Recorded', record: 'REC-1028-02'},
    {id: 'MDT-1024-03', external: {name: 'Frances Doyle', mrn: '24-071522', birthDate: '1962-12-02', gender: 'female', clinic: 'Medical oncology clinic', dx: 'C50.9 · Metastatic breast cancer, bone and liver'}, team: 'breast', session: 'S-BREAST-W43', seq: 3, status: 'concluded', type: 'change', urgency: 'routine',
      question: 'Progression on first-line endocrine therapy + CDK4/6 inhibitor: next-line options.', reason: 'Progression on imaging 10-20.', proposer: 'grant', presenter: 'grant', createdAt: '2026-10-24T10:00', submittedAt: '2026-10-24T10:05', source: {kind: 'manual'}, ecog: '1', wishes: 'Wishes to continue active treatment; priority on quality of life.', record: 'REC-1028-03'},
    {id: 'MDT-1024-04', external: {name: 'Beatrice Holt', mrn: '25-093377', birthDate: '1958-05-27', gender: 'female', clinic: 'Breast surgery clinic', dx: 'D05.1 · DCIS, high grade, 4.5 cm'}, team: 'breast', session: 'S-BREAST-W43', seq: 4, status: 'concluded', type: 'preop', urgency: 'routine',
      question: 'Extensive high-grade DCIS: mastectomy with immediate reconstruction versus breast conservation.', reason: 'Pre-operative planning.', proposer: 'ashford', presenter: 'ashford', createdAt: '2026-10-24T11:00', submittedAt: '2026-10-24T11:05', source: {kind: 'manual'}, ecog: '0', wishes: 'Prefers mastectomy with immediate reconstruction.', record: 'REC-1028-04'},
    // 肺癌團隊 11-03 已結論（Walter Hughes、George Pritchard），給儀表板與「全院」數字一點真實感
    {id: 'MDT-1030-05', p: 'P01', team: 'lung', session: 'S-LUNG-W44', seq: 1, status: 'concluded', type: 'change', urgency: 'routine', question: 'Stage IIIB lung adenocarcinoma: consolidation after chemoradiotherapy; molecular results.', reason: 'Plan change.', proposer: 'grant', presenter: 'grant', createdAt: '2026-10-30T10:00', submittedAt: '2026-10-30T10:05', source: {kind: 'manual'}, ecog: '1', wishes: 'Recorded', record: 'REC-1103-05'},
    {id: 'MDT-1030-06', p: 'P09', team: 'lung', session: 'S-LUNG-W44', seq: 2, status: 'concluded', type: 'goals', urgency: 'routine', question: 'Stage IV squamous cell lung cancer with bone metastases: goals of care, palliative radiotherapy for pain.', reason: 'Goals of care.', proposer: 'grant', presenter: 'grant', createdAt: '2026-10-30T10:30', submittedAt: '2026-10-30T10:35', source: {kind: 'manual'}, ecog: '3', wishes: 'Comfort-focused care; do-not-resuscitate order recorded.', record: 'REC-1103-06'}
  ];

  // ---------------------------------------------------------------- 已鎖定的會議紀錄（23／24 結構：A 出席 → B.1 資料 → B.2 摘要 → B.3 逐人意見 → B.4 結論與處置 → 附錄任務）----
  const plan = (seq, kind, text, owner, dept, due, state) => ({seq, kind, text, owner, dept, due, state});
  const RECORDS = [
    {id: 'REC-1028-01', proposal: 'MDT-1023-01', p: 'P08', team: 'breast', session: 'S-BREAST-W43', version: 1, status: 'locked',
      summary: 'Right breast IDC grade 3, cT2 (2.8 cm) N1 M0, ER 20% / PR 0% / HER2 0, Ki-67 60% (triple-negative-like behaviour). ECOG 0. Baseline LVEF 65%. Wishes to discuss fertility preservation.',
      opinions: [{who: 'webb', text: 'Grade 3, Ki-67 60%; low ER expression — treat biologically as triple-negative.', confirmed: true}, {who: 'price', text: 'Single axillary node 1.4 cm, suspicious; no distant disease.', confirmed: true}, {who: 'ashford', text: 'Neoadjuvant chemotherapy first; breast conservation likely after response.', confirmed: true}, {who: 'mercer', text: 'AC ×4 followed by weekly paclitaxel ×12 (consider carboplatin); refer for fertility counselling before cycle 1.', confirmed: true}, {who: 'finch', text: 'Radiotherapy decision after surgery.', confirmed: true}],
      conclusion: 'Neoadjuvant chemotherapy: AC q21d ×4 → weekly paclitaxel ×12; reassess after 4 cycles. Fertility counselling before cycle 1. Surgery planned after completion.',
      consensus: 'unanimous', dissent: '',
      actions: [plan(1, 'treatment', 'Start AC cycle 1 (doxorubicin 60 mg/m² + cyclophosphamide 600 mg/m²) with antiemetic premedication', 'mercer', 'Oncology', '2026-11-04', 'started'),
        plan(2, 'referral', 'Fertility counselling referral before cycle 1', 'mercer', 'Oncology', '2026-10-31', 'done'),
        plan(3, 'operational', 'Central venous port insertion', 'ashford', 'Breast Surgery', '2026-11-02', 'done'),
        plan(4, 'followup', 'Response assessment ultrasound after cycle 4', 'price', 'Diagnostic Imaging', '2027-01-15', 'received')],
      lockedBy: 'ashford', lockedAt: '2026-10-28T15:05', recordedBy: 'brooks', excerptNote: 'N-MDT-P08-1028'},
    {id: 'REC-1028-02', proposal: 'MDT-1023-02', p: 'P12', team: 'breast', session: 'S-BREAST-W43', version: 1, status: 'locked',
      summary: 'Left breast IDC pT2N2a (5/14 nodes) after mastectomy 10-10, ER 60% / PR 30% / HER2 0, Ki-67 25%. ECOG 1. LVEF 62%.',
      opinions: [{who: 'webb', text: 'pT2N2a, margins clear, LVI present.', confirmed: true}, {who: 'mercer', text: 'Adjuvant chemotherapy (AC-T) then endocrine therapy.', confirmed: true}, {who: 'finch', text: 'Post-mastectomy radiotherapy to chest wall and regional nodes after chemotherapy; radiotherapy assessment within 2 weeks.', confirmed: true}, {who: 'ashford', text: 'Agree.', confirmed: true}],
      conclusion: 'Adjuvant AC ×4 → paclitaxel; post-mastectomy radiotherapy after chemotherapy; adjuvant endocrine therapy 5–10 years.',
      consensus: 'unanimous', dissent: '',
      actions: [plan(1, 'treatment', 'Start adjuvant AC cycle 1', 'mercer', 'Oncology', '2026-10-30', 'started'),
        plan(2, 'referral', 'Radiation oncology assessment for post-mastectomy radiotherapy', 'finch', 'Radiation Oncology', '2026-11-03', 'received'),
        plan(3, 'followup', 'Genetic counselling (age < 60, node-positive)', 'mercer', 'Oncology', '2026-11-14', 'pending')],
      lockedBy: 'ashford', lockedAt: '2026-10-28T15:20', recordedBy: 'brooks', excerptNote: 'N-MDT-P12-1028'},
    {id: 'REC-1028-03', proposal: 'MDT-1024-03', team: 'breast', session: 'S-BREAST-W43', version: 1, status: 'locked',
      summary: 'Metastatic ER-positive breast cancer, bone and liver; progression on letrozole + CDK4/6 inhibitor after 14 months. ECOG 1. Liver function normal.',
      opinions: [{who: 'grant', text: 'Switch to fulvestrant-based therapy or chemotherapy depending on PIK3CA / ESR1 status; send liquid biopsy.', confirmed: true}, {who: 'price', text: 'Two new liver lesions, bone disease stable.', confirmed: true}, {who: 'finch', text: 'No indication for palliative radiotherapy at present.', confirmed: true}],
      conclusion: 'Send PIK3CA / ESR1 testing; start fulvestrant while awaiting results; review in 2 weeks; continue bone-protective therapy.',
      consensus: 'majority', dissent: 'Dr. Mercer: would start capecitabine now given liver progression; noted.',
      actions: [plan(1, 'treatment', 'Start fulvestrant 500 mg IM day 1, 15, 29 then monthly', 'grant', 'Oncology', '2026-10-31', 'started'),
        plan(2, 'followup', 'PIK3CA / ESR1 testing (liquid biopsy) and review at clinic 11-11', 'grant', 'Oncology', '2026-11-11', 'received')],
      lockedBy: 'ashford', lockedAt: '2026-10-28T15:40', recordedBy: 'brooks'},
    {id: 'REC-1028-04', proposal: 'MDT-1024-04', team: 'breast', session: 'S-BREAST-W43', version: 1, status: 'locked',
      summary: 'High-grade DCIS 4.5 cm, left breast, multicentric on MRI. ECOG 0. Patient prefers mastectomy with immediate reconstruction.',
      opinions: [{who: 'ashford', text: 'Mastectomy with sentinel node biopsy; immediate reconstruction feasible.', confirmed: true}, {who: 'hale', text: 'Implant-based immediate reconstruction suitable; consult booked.', confirmed: true}, {who: 'webb', text: 'High-grade DCIS with comedonecrosis; no invasion in cores.', confirmed: true}],
      conclusion: 'Left mastectomy with sentinel node biopsy and immediate implant-based reconstruction; surgery within 4 weeks; endocrine therapy to be decided after final histology.',
      consensus: 'unanimous', dissent: '',
      actions: [plan(1, 'operational', 'Schedule mastectomy + reconstruction (joint list) within 4 weeks', 'ashford', 'Breast Surgery', '2026-11-25', 'received'),
        plan(2, 'referral', 'Plastic surgery pre-operative consult', 'hale', 'Plastic Surgery', '2026-11-06', 'received')],
      lockedBy: 'ashford', lockedAt: '2026-10-28T15:55', recordedBy: 'brooks'},
    {id: 'REC-1103-05', proposal: 'MDT-1030-05', p: 'P01', team: 'lung', session: 'S-LUNG-W44', version: 1, status: 'locked',
      summary: 'Stage IIIB lung adenocarcinoma, EGFR/ALK negative, PD-L1 60%; completed concurrent chemoradiotherapy 10-20 with good partial response.', opinions: [{who: 'grant', text: 'Consolidation immunotherapy for 12 months.', confirmed: true}, {who: 'finch', text: 'No further radiotherapy; pneumonitis surveillance.', confirmed: true}], conclusion: 'Consolidation immunotherapy; CT every 3 months.', consensus: 'unanimous', dissent: '',
      actions: [plan(1, 'treatment', 'Start consolidation immunotherapy (cycle 1 on 11-05)', 'grant', 'Oncology', '2026-11-05', 'adopted'), plan(2, 'followup', 'CT chest at 3 months', 'price', 'Diagnostic Imaging', '2027-02-03', 'received')], lockedBy: 'hartley', lockedAt: '2026-11-03T16:00', recordedBy: 'brooks'},
    {id: 'REC-1103-06', proposal: 'MDT-1030-06', p: 'P09', team: 'lung', session: 'S-LUNG-W44', version: 1, status: 'locked',
      summary: 'Stage IV squamous cell lung cancer with painful bone metastases; ECOG 3; do-not-resuscitate order recorded; immunotherapy second line.', opinions: [{who: 'grant', text: 'Continue immunotherapy if tolerated; palliative care integration.', confirmed: true}, {who: 'finch', text: 'Single-fraction palliative radiotherapy 8 Gy to the right hip.', confirmed: true}], conclusion: 'Palliative radiotherapy 8 Gy ×1; palliative care team involvement; goals-of-care discussion documented.', consensus: 'unanimous', dissent: '',
      actions: [plan(1, 'treatment', 'Palliative radiotherapy 8 Gy single fraction right hip', 'finch', 'Radiation Oncology', '2026-11-06', 'received'), plan(2, 'referral', 'Palliative care team consult', 'grant', 'Oncology', '2026-11-04', 'done')], lockedBy: 'hartley', lockedAt: '2026-11-03T16:15', recordedBy: 'brooks'}
  ];

  // ---------------------------------------------------------------- 交接任務（25）：由紀錄附錄產生；這裡把上週的任務展開，含一件逾期（A12 放療評估 11-03 到期未接收 → 已接收但未完成）----
  // state：pending 待接收 → received 已接收 → adopted 已採納開單 → started 已開始 → done 完成；unable 無法執行（寫原因）。
  const TASKS = [];
  RECORDS.forEach(r => r.actions.forEach(a => TASKS.push({id: 'MT-' + r.id.slice(4) + '-' + a.seq, record: r.id, proposal: r.proposal, p: r.p || null, team: r.team, seq: a.seq, kind: a.kind, text: a.text, owner: a.owner, dept: a.dept, due: a.due, state: a.state,
    createdAt: r.lockedAt, log: [{at: r.lockedAt, by: r.recordedBy, event: 'created'}].concat(['received', 'adopted', 'started', 'done'].slice(0, ['pending', 'received', 'adopted', 'started', 'done'].indexOf(a.state)).map((ev, i) => ({at: r.lockedAt.slice(0, 10) + 'T' + (16 + i) + ':' + (10 + i * 7) + ':00', by: a.owner, event: ev})))})));
  // 幾件任務補上醫囑連結（已採納開單／已開始）
  const link = (id, orderId) => { const t = TASKS.find(x => x.id === id); if (t) t.orderId = orderId; };
  link('MT-1028-01-1', 'O-P08-DOXO');

  // ---------------------------------------------------------------- 儀表板（26）：示範數字；討論數、齊備率、逾期由資料即時算，其餘標示為示範數字 ----
  const DASH = {period: '2026-09-07 – 2026-11-01 (8 weeks)',
    kpis: [[2.1, 'd', 'Proposal to meeting, median', 'Target ≤ 7 days'], [1.4, 'd', 'Meeting to treatment start, median', 'Target ≤ 3 days'], [89, '%', 'Conclusions carried out on time', 'Target ≥ 85%'], [93, '%', 'Core member attendance', 'Lowest: Nuclear Medicine'], [4, '', 'Decided not to convene', 'Reasons recorded for all']],
    weekly: [['W36', 5], ['W37', 7], ['W38', 6], ['W39', 8], ['W40', 5], ['W41', 7], ['W42', 6], ['W43', 6]],
    missing: [['Patient wishes', 8], ['Cardiac function (echo)', 6], ['Staging imaging', 5], ['Biomarkers', 3]]};

  // 示範事件（demo-only）：心臟超音波回報（LVEF 60%），讓 8/8 齊備；由 mdt-core 的 mdtDemoEvent 寫進 reports。
  const DEMO_EVENTS = {
    echo: {report: 'R-P03-ECHO', at: '2026-11-05T08:50', clock: '2026-11-05T09:00:00+07:00', text: 'Transthoracic echocardiography (2026-11-05 08:30). Left ventricle normal size, wall thickness 10 mm; LVEF 60% (biplane Simpson). No regional wall motion abnormality. Right ventricle normal. Valves: trivial mitral regurgitation. No pericardial effusion. GLS −19%.', impression: 'Normal left ventricular systolic function, LVEF 60%. No contraindication to anthracycline from a cardiac standpoint; repeat echo after cycle 4.', reporter: 'Dr. Fiona Marsh (Cardiology)'}
  };

  // 已鎖定的紀錄把當次會期的出席凍結進來（鎖定時系統也是這樣做）。
  RECORDS.forEach(r => { const s = SESSIONS.find(x => x.id === r.session); if (s && !r.attendance) r.attendance = copy(s.attendance || {}); });
  function mdtState() {
    return copy({version: 'P2 · 2026-11-10', teams: TEAMS, sessions: SESSIONS, proposals: PROPOSALS, records: RECORDS, tasks: TASKS, dash: DASH, demoEvents: DEMO_EVENTS, log: []});
  }
  const baseState = seed.state;
  seed.state = function () { const s = baseState(); s.mdt = mdtState(); return s; };
  seed.mdt = mdtState;
  seed.version = 'P2 · 2026-11-10';
})(typeof window !== 'undefined' ? window : globalThis);
