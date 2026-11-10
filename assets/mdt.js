/* 團隊會議 MDT（2026-11-08）：側欄「Team meeting (MDT)」進入，六個子分頁＋個案摘要包、HC-05 紀錄、列印。
   內容移植自 MDT畫面 示範稿（腫瘤醫院行銷版），改寫成本原型的病人與人員。一期不做寫入：
   會議、議程、結論與任務是本檔的固定示範資料，不經 store.dispatch、不進 G9；摘要包的引用項目則即時讀病歷（store 的 state），
   病歷沒有的才用本檔的示範引用，兩者都沒有就顯示「Not yet available」。這支只組 HTML；node 可 require 供驗證器渲染。 */
(function (root) {
  'use strict';
  const W = () => typeof module !== 'undefined' ? require('./workflow.js') : root.ICUWorkflow;
  const TZ = () => typeof module !== 'undefined' ? require('./timezone.js') : root.ICUTimeZone;
  const E = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const h = (c, d) => '#' + new URLSearchParams({...c.route, record: '', preview: '0', ...d}).toString();
  const IC = (n, o) => root.ICUIcons ? root.ICUIcons.svg(n, o) : '';
  const D = x => `<span data-no-i18n>${E(x)}</span>`;

  // ---- 示範資料（全部虛構）。人員優先引用 state.people 的帳號（who），院外或還沒建帳號的職類用示範姓名（name＋dept）。 ----
  const TEAMS = [
    {id: 'heart', name: 'Pediatric heart team', weekday: 'Wednesday', time: '14:00–16:00', location: 'Meeting room 3 + video (hybrid)', level: 'Inter-department',
      deputy: 'Demo cardiac surgeon · Tran', deadline: '1 working day before, 12:00', members: [
        {who: 'surgeon', role: 'chair', attend: 'every', reply: 'attending'},
        {who: 'doctorWard', role: 'secretary', attend: 'every', reply: 'attending'},
        {who: 'consultCardiology', role: 'core', attend: 'every', reply: 'attending'},
        {who: 'doctor', role: 'core', attend: 'every', reply: 'attending'},
        {name: 'Demo anesthesiologist · Ly', dept: 'Anesthesia', role: 'core', attend: 'every', reply: 'video'},
        {name: 'Demo radiologist · Pham', dept: 'Imaging', role: 'core', attend: 'every', reply: 'pending'},
        {name: 'Demo clinical pharmacist · Do', dept: 'Pharmacy', role: 'byCase', attend: 'drug', reply: 'pending'},
        {name: 'Demo dietitian · Ha', dept: 'Nutrition', role: 'byCase', attend: 'growth', reply: 'attending'},
        {name: 'Demo social worker · Mai', dept: 'Social work', role: 'byCase', attend: 'family', reply: 'attending'},
        {name: 'Demo case coordinator · Lan', dept: 'Nursing', role: 'coordinator', attend: 'every', reply: 'attending'}]},
    {id: 'airway', name: 'Long-term ventilation team', weekday: 'Tuesday', time: '13:30–15:00', location: 'ICU meeting room', level: 'Inter-department',
      deputy: 'Demo ICU doctor · Next shift', deadline: '1 working day before, 12:00', members: [
        {who: 'doctor', role: 'chair', attend: 'every', reply: 'attending'},
        {who: 'doctorNext', role: 'secretary', attend: 'every', reply: 'attending'},
        {name: 'Demo pulmonologist · Vu', dept: 'Pulmonology', role: 'core', attend: 'every', reply: 'attending'},
        {name: 'Demo physiotherapist · Son', dept: 'Rehabilitation', role: 'core', attend: 'every', reply: 'attending'},
        {name: 'Demo dietitian · Ha', dept: 'Nutrition', role: 'core', attend: 'every', reply: 'pending'},
        {name: 'Demo social worker · Mai', dept: 'Social work', role: 'byCase', attend: 'family', reply: 'attending'},
        {who: 'nurse', role: 'coordinator', attend: 'every', reply: 'attending'}]},
    {id: 'neuro', name: 'Neurotrauma team', weekday: 'Thursday', time: '14:00–15:30', location: 'Meeting room 2', level: 'Inter-department',
      deputy: 'Demo ICU doctor · Chen', deadline: '1 working day before, 12:00', members: [
        {name: 'Demo neurosurgeon · Bao', dept: 'Neurosurgery', role: 'chair', attend: 'every', reply: 'attending'},
        {who: 'doctor', role: 'secretary', attend: 'every', reply: 'attending'},
        {name: 'Demo radiologist · Pham', dept: 'Imaging', role: 'core', attend: 'every', reply: 'attending'},
        {name: 'Demo physiotherapist · Son', dept: 'Rehabilitation', role: 'core', attend: 'every', reply: 'pending'},
        {name: 'Demo case coordinator · Lan', dept: 'Nursing', role: 'coordinator', attend: 'every', reply: 'attending'}]},
    {id: 'infection', name: 'Infection and antimicrobial team', weekday: 'Friday', time: '11:00–12:00', location: 'ICU meeting room + video', level: 'Inter-department',
      deputy: 'Demo ICU doctor · Chen', deadline: '1 working day before, 12:00', members: [
        {who: 'consultInfectious', role: 'chair', attend: 'every', reply: 'attending'},
        {who: 'doctor', role: 'secretary', attend: 'every', reply: 'attending'},
        {name: 'Demo microbiologist · Quan', dept: 'Microbiology', role: 'core', attend: 'every', reply: 'video'},
        {name: 'Demo clinical pharmacist · Do', dept: 'Pharmacy', role: 'core', attend: 'every', reply: 'attending'},
        {who: 'nurse', role: 'coordinator', attend: 'every', reply: 'attending'}]}];

  // 會期：每支團隊每週自動產生；W35 已開完，W36 是本週（示範時鐘 2026-08-31 週一）。
  const MEETINGS = [
    {id: 'HEART-W35', team: 'heart', week: 35, date: '2026-08-26', status: 'concluded'},
    {id: 'HEART-W36', team: 'heart', week: 36, date: '2026-09-02', status: 'thisWeek', packsSent: '2026-09-01 14:00'},
    {id: 'HEART-W37', team: 'heart', week: 37, date: '2026-09-09', status: 'open', proposed: 1},
    {id: 'HEART-W38', team: 'heart', week: 38, date: '2026-09-16', status: 'open'},
    {id: 'HEART-W39', team: 'heart', week: 39, date: '2026-09-23', status: 'open'},
    {id: 'AIR-W36', team: 'airway', week: 36, date: '2026-09-01', status: 'thisWeek', packsSent: '2026-08-31 13:30'},
    {id: 'AIR-W37', team: 'airway', week: 37, date: '2026-09-08', status: 'open'},
    {id: 'NEURO-W36', team: 'neuro', week: 36, date: '2026-09-03', status: 'thisWeek'},
    {id: 'NEURO-W37', team: 'neuro', week: 37, date: '2026-09-10', status: 'open'},
    {id: 'INF-W36', team: 'infection', week: 36, date: '2026-09-04', status: 'thisWeek'},
    {id: 'INF-W37', team: 'infection', week: 37, date: '2026-09-11', status: 'open'}];

  // 議程個案。cite＝病歷沒有時的示範引用（代表 PACS／LIS／外院資料）；wishes 沒填就是尚未取得。
  const CASES = [
    {id: 'MDT-0902-01', meeting: 'HEART-W36', seq: 1, p: 'A', type: 'postop', proposer: 'surgeon', proposedAt: '2026-08-31T08:20',
      question: ['Blood pressure target and beta-blocker plan after the repair', 'Timing of follow-up CT angiography', 'Screening for a connective tissue disorder'],
      wishes: {text: 'Parents want to understand long-term follow-up and whether siblings need screening.', by: 'doctor', at: '2026-08-31T08:40'}},
    {id: 'MDT-0902-02', meeting: 'HEART-W36', seq: 2, p: 'D', type: 'postop', proposer: 'consultCardiology', proposedAt: '2026-08-30T16:10', previous: 'MDT-0826-02',
      question: ['When to wean milrinone after bypass grafting', 'Screening for familial hypercholesterolaemia in the patient and family'],
      cite: {imaging: {text: 'Echocardiography: LV ejection fraction 45%, grafts patent on Doppler, no new wall-motion abnormality', ref: 'ECHO-2026-08-0331', at: '2026-08-29T10:00'},
        meds: {text: 'Milrinone infusion, aspirin, furosemide', ref: 'Medication orders', at: '2026-08-31T08:00'}}},
    {id: 'MDT-0902-03', meeting: 'HEART-W36', seq: 3, p: 'G', type: 'change', proposer: 'doctor', proposedAt: '2026-08-31T07:45', previous: 'MDT-0826-01',
      question: ['Two failed extubation trials: another trial or a tracheostomy', 'Referral for heart transplant assessment'],
      cite: {imaging: {text: 'Echocardiography: LV ejection fraction 30%, mechanical mitral prosthesis functioning normally', ref: 'ECHO-2026-08-0402', at: '2026-08-30T09:30'},
        labs: {text: 'BNP 1,850 pg/mL; lactate 1.4 mmol/L; sodium 131 mmol/L', ref: 'LAB 2026-08-31 06:00', at: '2026-08-31T06:00'},
        meds: {text: 'Milrinone, furosemide, spironolactone, enalapril, warfarin', ref: 'Medication orders', at: '2026-08-31T08:00'}},
      wishes: {text: 'Parents prefer another extubation trial before a tracheostomy; open to transplant assessment.', by: 'doctor', at: '2026-08-31T07:50'}},
    {id: 'MDT-0901-01', meeting: 'AIR-W36', seq: 1, p: 'B', type: 'new', proposer: 'doctor', proposedAt: '2026-08-30T11:00',
      question: ['Extubation readiness', 'Post-extubation support: high-flow oxygen or non-invasive ventilation'],
      cite: {meds: {text: 'Midazolam and fentanyl infusions, ceftriaxone', ref: 'Medication orders', at: '2026-08-31T08:00'}},
      wishes: {text: 'Mother asks to stay at the bedside during extubation.', by: 'nurse', at: '2026-08-30T15:00'}},
    {id: 'MDT-0901-02', meeting: 'AIR-W36', seq: 2, p: 'I', type: 'goals', proposer: 'doctor', proposedAt: '2026-08-29T17:30',
      question: ['Tracheostomy or continued ventilation', 'Goals of care with the family under the DNR order'],
      cite: {imaging: {text: 'Chest CT: diffuse air trapping, no new consolidation', ref: 'RIS-2026-08-1187', at: '2026-08-27T14:00'},
        meds: {text: 'Salbutamol and ipratropium nebulisation, budesonide', ref: 'Medication orders', at: '2026-08-31T08:00'}}},
    {id: 'MDT-0903-01', meeting: 'NEURO-W36', seq: 1, p: 'E', type: 'postop', proposer: 'doctor', proposedAt: '2026-08-31T08:05',
      question: ['Removal of ICP monitoring', 'Rehabilitation plan and criteria for return to the ward'],
      cite: {imaging: {text: 'Head CT: evacuated hematoma, no rebleeding, midline shift resolved', ref: 'RIS-2026-08-1302', at: '2026-08-30T08:00'},
        labs: {text: 'Sodium 138 mmol/L; platelets 210 G/L; INR 1.1', ref: 'LAB 2026-08-31 06:00', at: '2026-08-31T06:00'},
        meds: {text: 'Levetiracetam, paracetamol', ref: 'Medication orders', at: '2026-08-31T08:00'}},
      wishes: {text: 'Family agrees with early rehabilitation; asks about school return.', by: 'doctor', at: '2026-08-31T08:10'}},
    {id: 'MDT-0904-01', meeting: 'INF-W36', seq: 1, p: 'H', type: 'new', proposer: 'consultInfectious', proposedAt: '2026-08-31T08:30',
      question: ['Source control', 'Antibiotic de-escalation once cultures return'],
      cite: {labs: {text: 'Blood culture: gram-negative rods, identification pending; CRP 186 mg/L', ref: 'LAB 2026-08-30 22:00', at: '2026-08-30T22:00'},
        weight: {text: '7.6 kg', ref: 'Admission weight (HIS)', at: '2026-08-18T10:00'},
        meds: {text: 'Meropenem, vancomycin', ref: 'Medication orders', at: '2026-08-31T08:00'}},
      wishes: {text: 'Parents informed of the isolation plan.', by: 'nurse', at: '2026-08-30T18:00'}},
    {id: 'MDT-0904-02', meeting: 'INF-W36', seq: 2, p: 'F', type: 'new', proposer: 'doctor', proposedAt: '2026-08-31T08:35',
      question: ['Echocardiography to exclude endocarditis', 'Is a bone marrow examination needed'],
      cite: {imaging: {text: 'Abdominal ultrasound: mild splenomegaly, no abscess', ref: 'RIS-2026-08-1250', at: '2026-08-28T15:00'},
        labs: {text: 'CRP 64 mg/L; ferritin 980 ng/mL; three blood cultures negative', ref: 'LAB 2026-08-31 06:00', at: '2026-08-31T06:00'},
        meds: {text: 'Paracetamol as needed', ref: 'Medication orders', at: '2026-08-31T08:00'}},
      wishes: {text: 'Parents agree to further tests; ask that blood draws be grouped.', by: 'doctor', at: '2026-08-31T08:40'}},
    // 上週（W35）已開完的兩案：紀錄、附錄任務與操作紀錄。
    {id: 'MDT-0826-01', meeting: 'HEART-W35', seq: 1, p: 'G', type: 'postop', proposer: 'doctor', proposedAt: '2026-08-24T16:00',
      question: ['Persistent low cardiac output on post-op day 5', 'Ventilator weaning plan', 'Further imaging'],
      record: {slot: '14:20–14:50', form: 'hybrid', version: 1, chairAt: '2026-08-26T15:05', excerptAt: '2026-08-26T15:08', packAt: '2026-08-26 10:05',
        summary: 'Patient G, 10 years, post-op day 5 after mechanical mitral valve replacement for severe mitral regurgitation with heart failure. Ventilated, on milrinone. Echo 08-25: LV ejection fraction 28%, prosthesis functioning normally. Lactate 2.1 mmol/L. Weight 32 kg on admission. Parents present daily and want everything explained before decisions.',
        attendance: [{m: 0, mode: 'present', at: '15:05'}, {m: 1, mode: 'present', at: '15:06'}, {m: 2, mode: 'present', at: '14:58'}, {m: 3, mode: 'present', at: '14:59'}, {m: 4, mode: 'video', at: '15:00'},
          {m: 5, mode: 'video', at: '15:01'}, {m: 6, mode: 'absent'}, {m: 7, mode: 'present', at: '15:02'}, {m: 8, mode: 'present', at: '15:02'}, {m: 9, mode: 'present', at: '15:03'}],
        opinions: [{m: 0, at: '14:24', text: 'Prosthesis functions well on echo; no surgical target now. Support medically and reassess in one week.'},
          {m: 2, at: '14:28', text: 'Continue milrinone; start low-dose enalapril once lactate normalises. Warfarin for the mechanical valve, target INR 2.5–3.5. Repeat echo in one week before any transplant referral.'},
          {m: 3, at: '14:32', text: 'Daily spontaneous breathing trial once inotrope score is below 10; plan extubation to high-flow oxygen.'},
          {m: 5, at: '14:36', text: 'Repeat echocardiography can be done at the bedside; no further imaging needed now.'},
          {m: 7, at: '14:40', text: 'Fluid-restricted high-energy feeds; weigh weekly.'},
          {m: 8, at: '14:43', text: 'Parents are anxious about a tracheostomy; arrange a family meeting this week.'}],
        conclusion: {dx: 'Severe mitral regurgitation with heart failure; low cardiac output after mechanical mitral valve replacement; ventilated', goal: 'Recovery of cardiac function and extubation', decision: 'Continue milrinone and wean as function allows; warfarin to target INR; daily breathing trials; repeat echo in one week; fluid-restricted feeds; family meeting this week; transplant assessment if no recovery within two weeks.',
          pending: 'Repeat echocardiography', consensus: 'Unanimous (9 of 10 present)', dissent: 'None', explained: 'Doctor on duty explained the plan to the parents on 08-26 at 17:00.'},
        plan: [
          {n: 1, text: 'Continue milrinone; wean once lactate is normal and echo function improves', kind: 'treatment', m: 2, due: '2026-08-28', state: 'started',
            log: [['2026-08-26T15:30', 2, 'received'], ['2026-08-26T16:00', 3, 'adopted'], ['2026-08-26T16:30', 3, 'started']]},
          {n: 2, text: 'Daily spontaneous breathing trial; first extubation when inotrope score is below 10', kind: 'treatment', m: 3, due: '2026-08-29', state: 'started', note: 'Trials on 08-28 and 08-30 failed; re-proposed to the 09-02 meeting',
            log: [['2026-08-26T15:30', 3, 'received'], ['2026-08-27T08:00', 3, 'adopted'], ['2026-08-28T09:00', 3, 'started']]},
          {n: 3, text: 'Repeat echocardiography in one week to reassess LV function', kind: 'operational', m: 5, due: '2026-09-02', state: 'received', note: 'Scheduled 09-01 10:00',
            log: [['2026-08-26T16:20', 5, 'received']]},
          {n: 4, text: 'Fluid-restricted high-energy feeds; weekly weight', kind: 'operational', m: 7, due: '2026-08-28', state: 'done',
            log: [['2026-08-26T15:40', 7, 'received'], ['2026-08-27T10:00', 7, 'done']]},
          {n: 5, text: 'Refer for heart transplant assessment if no recovery within two weeks', kind: 'operational', m: 2, due: '2026-09-09', state: 'pending', log: []},
          {n: 6, text: 'Family meeting to explain the plan and a possible tracheostomy', kind: 'operational', m: 8, due: '2026-08-28', state: 'pending', log: []}]}},
    {id: 'MDT-0826-02', meeting: 'HEART-W35', seq: 2, p: 'D', type: 'preop', proposer: 'consultCardiology', proposedAt: '2026-08-25T09:10',
      question: ['Three-vessel coronary stenosis: bypass grafting or staged stenting', 'Post-op support plan'],
      record: {slot: '14:50–15:10', form: 'hybrid', version: 1, chairAt: '2026-08-26T15:20', excerptAt: '2026-08-26T15:22', packAt: '2026-08-26 10:05',
        summary: 'Patient D, 14 years, admitted with acute myocardial infarction. Coronary angiography: three-vessel stenosis. LDL cholesterol 9.8 mmol/L. Troponin peaked 08-25. LV ejection fraction 40%. Haemodynamically stable on low-dose milrinone.',
        attendance: [{m: 0, mode: 'present', at: '15:20'}, {m: 1, mode: 'present', at: '15:21'}, {m: 2, mode: 'present', at: '15:12'}, {m: 3, mode: 'present', at: '15:13'}, {m: 4, mode: 'video', at: '15:14'},
          {m: 5, mode: 'video', at: '15:15'}, {m: 6, mode: 'absent'}, {m: 7, mode: 'absent'}, {m: 8, mode: 'absent'}, {m: 9, mode: 'present', at: '15:16'}],
        opinions: [{m: 0, at: '14:54', text: 'Three-vessel disease suits bypass grafting; slot available tomorrow.'},
          {m: 2, at: '14:58', text: 'Agree; stenting would need several stages. Continue milrinone peri-operatively; troponin and echo daily for three days after surgery.'},
          {m: 4, at: '15:01', text: 'Standard cardiac anaesthesia; expect two days of ventilation.'},
          {m: 5, at: '15:04', text: 'Grafts can be checked by echo Doppler; CT angiography only if symptoms return.'}],
        conclusion: {dx: 'Acute myocardial infarction with three-vessel coronary stenosis; suspected familial hypercholesterolaemia', goal: 'Revascularisation and recovery of LV function', decision: 'Coronary bypass grafting on 08-27; post-op ICU monitoring with milrinone; lipid and genetic work-up before ward transfer.',
          pending: 'None', consensus: 'Unanimous (7 of 10 present)', dissent: 'None', explained: 'Surgeon explained the operation to the parents on 08-26 at 16:00; consent signed.'},
        plan: [
          {n: 1, text: 'Coronary bypass grafting on 08-27', kind: 'treatment', m: 0, due: '2026-08-27', state: 'started',
            log: [['2026-08-26T15:30', 0, 'received'], ['2026-08-26T15:40', 0, 'adopted'], ['2026-08-27T07:30', 0, 'started']]},
          {n: 2, text: 'Post-op ICU monitoring with milrinone; troponin and echo daily for three days', kind: 'treatment', m: 3, due: '2026-08-27', state: 'started',
            log: [['2026-08-26T15:35', 3, 'received'], ['2026-08-27T13:00', 3, 'adopted'], ['2026-08-27T13:30', 3, 'started']]},
          {n: 3, text: 'Lipid profile and genetic testing for familial hypercholesterolaemia', kind: 'operational', m: 2, due: '2026-09-05', state: 'received', note: 'Sample sent 08-29',
            log: [['2026-08-26T16:20', 2, 'received']]}]}}];

  // 個案會議（臨時召開）：跨領域團隊會議、家庭會議、院內會診，以及暫不召開的決定。
  const CASE_MEETINGS = [
    {p: 'J', kind: 'team', topic: 'Discharge preparation case conference', level: 'Within department', at: '2026-09-01T13:30', place: 'ICU meeting room', status: 'scheduled', replies: '2 / 3', owner: 'doctor'},
    {p: 'B', kind: 'team', topic: 'Difficult care case conference', level: 'Within department', at: '2026-08-29T13:30', place: 'ICU meeting room', status: 'review', replies: '3 / 3', owner: 'doctor', submitted: '2026-08-29T15:20'},
    {p: 'I', kind: 'family', topic: 'Goals of care under the DNR order', level: '', at: '2026-08-29T16:00', place: 'Family meeting room', status: 'completed', signed: '2 / 2', owner: 'doctor'},
    {p: 'H', kind: 'hoiChan', topic: 'Treatment difficulty, cross-department', level: 'Inter-department', at: '2026-08-28T14:00', place: 'Meeting room 2 + video', status: 'concluded', owner: 'consultInfectious'},
    {p: 'G', kind: 'family', topic: 'Follows the heart team decision', level: '', at: '', place: '', status: 'toSchedule', owner: 'doctor'},
    {p: 'C', kind: 'deferred', topic: 'Consult opinions agree; plan is clear', level: '', at: '2026-08-30T10:20', place: '', status: 'deferred', replies: '2', owner: 'doctor'}];

  // 儀表板：近 8 週的示範數字（逾期任務與個案數由上面的資料即時算）。
  // 數值與單位分開（d＝天、%＝百分比），單位才翻得到。
  const DASH = {period: '07-06 – 08-30', kpis: [
    [41, '', 'Cases discussed (8 weeks)', 'All four teams'],
    [2.5, 'd', 'Proposal to meeting, median', 'Target ≤ 7 days'],
    [1, 'd', 'Meeting to treatment start, median', 'Target ≤ 3 days'],
    [87, '%', 'Conclusions carried out on time', 'Target ≥ 85%'],
    [81, '%', 'Data complete at the meeting', 'Most often missing: family wishes'],
    [93, '%', 'Core member attendance', 'Lowest: Imaging'],
    [6, '', 'Decided not to convene', 'Reasons recorded for all']],
    weekly: [['W29', 4], ['W30', 6], ['W31', 5], ['W32', 7], ['W33', 4], ['W34', 6], ['W35', 5], ['W36', 4]],
    teams: [['heart', 18, 2, 1, 89, 84, 95], ['airway', 11, 3, 2, 85, 76, 92], ['neuro', 7, 2, 1, 88, 82, 91], ['infection', 5, 1, 0, 84, 80, 94]],
    missing: [['Family wishes', 9], ['Weight', 7], ['Imaging', 5], ['Labs', 3]]};
  const unit = (v, u) => u === 'd' ? (v === 1 ? `${v} day` : `${v} days`) : u === '%' ? `${v}%` : String(v);

  // ---- 顯示用標籤 ----
  const TABS = [['agenda', "This week's agenda"], ['cases', 'Case meetings'], ['teams', 'Teams and sessions'], ['records', 'Past meetings'], ['tasks', 'Follow-up tasks'], ['dashboard', 'Dashboard']];
  const ROLE = {chair: 'Chair', secretary: 'Secretary', coordinator: 'Coordinator', core: 'Core member', byCase: 'By case'};
  const ATTEND = {every: 'Every meeting', drug: 'When the drug plan changes', growth: 'Growth or feeding issues', family: 'Family or discharge issues'};
  const REPLY = {attending: ['Attending', 'success'], video: ['By video', 'info'], pending: ['No reply yet', 'warning']};
  const MODE = {present: 'Present', video: 'By video', absent: 'Absent'};
  const TYPE = {postop: 'Post-op', change: 'Plan change', new: 'New problem', preop: 'Pre-op', goals: 'Goals of care'};
  const KIND = {treatment: 'Treatment', operational: 'Operational'};
  const STATE = {pending: ['Awaiting receipt', 'warning'], received: ['Received', 'info'], adopted: ['Adopted and ordered', 'info'], started: ['Started', 'success'], done: ['Completed', 'success']};
  const LOG = {received: 'Received the task', adopted: 'Adopted by the doctor on duty and ordered', started: 'Recorded treatment start', done: 'Marked complete'};
  const CM_KIND = {team: 'Interdisciplinary team meeting', family: 'Family meeting', hoiChan: 'In-hospital consultation', deferred: 'Not convened'};
  const CM_STATUS = {scheduled: ['Scheduled', 'info'], review: ['Record awaiting chair confirmation', 'warning'], completed: ['Completed', 'success'], concluded: ['Concluded', 'success'], toSchedule: ['To schedule', 'warning'], deferred: ['Not convened', 'muted']};
  const SESSION = {concluded: ['Concluded · follow-up', 'success'], thisWeek: ['This week', 'info'], open: ['Open for proposals', 'muted']};
  const ITEMS = [['dx', 'Diagnosis'], ['surgery', 'Operative record'], ['imaging', 'Imaging'], ['labs', 'Labs'], ['support', 'Organ support'], ['weight', 'Weight'], ['meds', 'Current medications'], ['wishes', 'Family wishes']];
  const FLOW = [['proposal', 'Proposal'], ['pack', 'Summary pack'], ['record', 'Discussion and conclusion'], ['handover', 'Handover'], ['follow', 'Follow-up']];

  // ---- 共用 ----
  const teamOf = id => TEAMS.find(t => t.id === id) || TEAMS[0];
  const meetingOf = id => MEETINGS.find(m => m.id === id);
  const caseOf = id => CASES.find(x => x.id === id);
  const casesIn = mid => CASES.filter(x => x.meeting === mid).sort((a, b) => a.seq - b.seq);
  const today = c => TZ().wall(TZ().millis(c.state.demoClock)).slice(0, 10);
  const days = (from, to) => Math.round((TZ().millis(to + 'T00:00') - TZ().millis(from + 'T00:00')) / 86400000);
  // 不帶時區尾碼的是醫院牆上時間；帶尾碼的系統戳記換算成醫院當地時間（timezone.js）。
  const hm = t => { const v = String(t || ''); return (/(Z|[+-]\d\d:\d\d)$/.test(v) ? TZ().wall(TZ().millis(v)) : v).replace('T', ' ').slice(5, 16); };
  const md = d => String(d || '').slice(5, 10);
  const pill = (t, tone) => `<span class="pill ${tone || ''}">${E(t)}</span>`;
  const memberName = (c, m) => m ? (m.who ? (c.state.people[m.who] || {}).name || '—' : m.name) : '—';
  const memberDept = (c, m) => m ? (m.who ? (c.state.people[m.who] || {}).department || '—' : m.dept) : '—';
  const personName = (c, id) => (c.state.people[id] || {}).name || id || '—';
  const patient = (c, id) => c.state.patients.find(p => p.id === id);
  const ageOf = (c, p) => {
    if (!p || !p.birthDate) return '';
    const n = days(p.birthDate, today(c));
    return n >= 365 ? `${Math.floor(n / 365.25)} years old` : `${Math.floor(n / 30.44)} mo`;
  };
  const dxOf = p => p && p.icd ? `${p.icd.code} · ${p.icd.english || p.icd.name}` : '';
  const ptLink = (c, p, label) => p ? `<a href="${E(h(c, {view: 'overview', p: p.id, encounter: 'ENC-' + p.id}))}" data-no-i18n>${E(label || p.name)}</a>` : '—';
  const card = (title, body, extra = '', cls = '') => `<section class="card ${cls}"><div class="row between"><h2>${title}</h2>${extra}</div>${body}</section>`;
  const table = (heads, rows, cls = '') => `<div class="table-wrap"><table class="dense-table ${cls}"><thead><tr>${heads.map(x => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const dl = rows => `<dl class="mdt-facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const go = (c, d) => E(h(c, {view: 'mdt', mdtPrint: '', ...d}));
  // 一期只看不寫：動作鈕照樣擺在該擺的位置，但停用並說明。
  const later = t => `<button type="button" class="secondary compact-button" disabled title="Not available in phase 1">${E(t)}</button>`;

  // ---- 摘要包：8 項依序先讀病歷，再用示範引用；都沒有就是尚未取得。 ----
  function pack(c, cs) {
    const s = c.state, p = patient(c, cs.p), cite = cs.cite || {}, out = {};
    if (!p) return {items: ITEMS.map(([key, label]) => ({key, label, ok: false})), ready: 0, missing: ITEMS.map(x => x[1])};
    const latest = (list, at = x => x.at) => list.filter(at).sort((a, b) => String(at(b)).localeCompare(String(at(a))))[0];
    // plain＝介面文字（會翻譯）；其餘 text 是病歷內容，原樣顯示。refName＝來源是人名或單號，不翻。
    if (p.icd) out.dx = {text: dxOf(p) + (p.problem ? ' · ' + p.problem : ''), ref: 'HIS admission', at: p.admissionTime || p.admitted};
    const op = latest((s.surgeries || []).filter(x => x.p === p.id && !(s.surgeries || []).some(y => y.replaces === x.id)), x => x.performedAt);
    if (op) out.surgery = {text: op.procedure || op.postDiagnosis || '', ref: `${op.id} v${op.version || 1}`, refName: true, at: op.performedAt};
    else if (!p.surgeryDate) out.surgery = {plain: true, na: true, text: 'Not applicable: no surgery this stay'};
    const img = latest((s.reports || []).filter(r => r.p === p.id && r.kind !== 'Lab'));
    if (img) out.imaging = {text: img.text, ref: img.id, refName: true, at: img.at};
    const labs = (s.reports || []).filter(r => r.p === p.id && r.kind === 'Lab'), lab = latest(labs);
    if (lab) out.labs = {plain: true, text: `${labs.length} lab reports`, ref: lab.id, refName: true, at: lab.at};
    const lang = root.ICUi18n && root.ICUi18n.lang ? root.ICUi18n.lang() : 'en';
    const flags = W().activeFlags(s, p.id).map(f => W().flagView(s, f, lang).label);
    out.support = flags.length ? {text: flags.join(' · '), ref: 'Special markers', at: ''} : {plain: true, text: 'No organ support recorded', ref: 'Special markers', at: ''};
    const wt = latest((s.observations || []).filter(o => o.p === p.id && /^(Admission )?[Ww]eight$/.test(o.kind)));
    const pre = latest((s.periop || []).filter(x => x.p === p.id && (x.data || {}).weight));
    if (wt) out.weight = {text: `${wt.value} ${wt.unit || 'kg'}`, ref: wt.kind, at: wt.at};
    else if (pre) out.weight = {text: `${pre.data.weight} kg`, ref: 'Pre-op assessment', at: pre.at};
    const meds = (s.orders || []).filter(o => o.p === p.id && o.kind === 'medication' && !['stopped', 'cancelled', 'discontinued'].includes(o.status));
    if (meds.length) out.meds = {text: meds.map(o => (o.catalog && o.catalog.zh) || o.name).filter(Boolean).slice(0, 4).join(', ') + (meds.length > 4 ? ' …' : ''), ref: `${meds.length} medication orders`, at: ''};
    if (cs.wishes) out.wishes = {text: cs.wishes.text, ref: personName(c, cs.wishes.by), refName: true, at: cs.wishes.at};
    ['imaging', 'labs', 'weight', 'meds'].forEach(k => { if (!out[k] && cite[k]) out[k] = {...cite[k], cited: true}; });
    const items = ITEMS.map(([key, label]) => ({key, label, ok: !!out[key], ...(out[key] || {})}));
    return {items, ready: items.filter(x => x.ok).length, missing: items.filter(x => !x.ok).map(x => x.label)};
  }

  // ---- 任務：逾期以示範時鐘的醫院日期判斷（期限過了還在待接收或已接收）。 ----
  const overdueDays = (c, t) => (t.state === 'pending' || t.state === 'received') && t.due < today(c) ? days(t.due, today(c)) : 0;
  const allTasks = () => CASES.filter(x => x.record).flatMap(x => x.record.plan.map(t => ({...t, caseId: x.id, p: x.p, team: meetingOf(x.meeting).team})));

  function head(c) {
    const tab = TABS.some(t => t[0] === c.route.mdtTab) ? c.route.mdtTab : 'agenda';
    const nav = `<nav class="record-subtabs maint-tabs" aria-label="MDT sections">${TABS.map(([k, t]) => `<a href="${go(c, {mdtTab: k, mdtCase: ''})}" class="${tab === k ? 'active' : ''}"${tab === k ? ' aria-current="page"' : ''}>${E(t)}</a>`).join('')}</nav>`;
    return {tab, nav: nav + `<p class="notice info mdt-demo-note">View only: MDT is not in phase 1. Meetings, conclusions and tasks are fixed demo data; the summary pack reads each patient's record. Nothing on these pages is saved.</p>`};
  }

  function flow(c, cs, current) {
    const rec = !!cs.record, link = {proposal: {mdtTab: 'agenda', mdtCase: cs.id}, pack: {mdtTab: 'agenda', mdtCase: cs.id}, record: rec ? {mdtTab: 'records', mdtCase: cs.id} : null, handover: rec ? {mdtTab: 'tasks', mdtCase: cs.id} : null, follow: rec ? {mdtTab: 'tasks', mdtCase: cs.id} : null};
    const at = FLOW.findIndex(f => f[0] === current);
    return `<ol class="mdt-flow" aria-label="MDT steps">${FLOW.map(([k, t], i) => {
      const cls = i < at ? 'done' : i === at ? 'current' : '';
      const body = `<b data-no-i18n>${i + 1}</b><span>${E(t)}</span>`;
      return `<li class="${cls}"${i === at ? ' aria-current="step"' : ''}>${link[k] && i !== at ? `<a href="${go(c, link[k])}">${body}</a>` : body}</li>`;
    }).join('')}</ol>`;
  }

  function caseHead(c, cs, title) {
    const p = patient(c, cs.p), m = meetingOf(cs.meeting), t = teamOf(m.team);
    const allergy = p && (p.allergies || []).length ? p.allergies.map(a => (a.code || {}).text).filter(Boolean).join(', ') : '';
    return `<nav class="breadcrumb" aria-label="Current location"><a href="${go(c, {mdtCase: ''})}">Team meeting (MDT)</a><span aria-hidden="true">›</span><span aria-current="page">${E(title)}</span></nav>`
      + `<section class="card mdt-case-head"><div class="mdt-case-id">${p ? `<span class="bed-number" data-no-i18n>${E(p.bed)}</span>` : ''}<h2>${ptLink(c, p)}</h2>${p ? `<span>${E(ageOf(c, p))}</span><span data-no-i18n>${E(dxOf(p))}</span>` : ''}${allergy ? `<span class="pill danger">Allergy: ${D(allergy)}</span>` : ''}</div>`
      + `<p class="muted"><span>${E(t.name)}</span> · ${D(m.date + ' ' + t.time.slice(0, 5))} · <span>Case ${cs.seq}</span> · ${pill(TYPE[cs.type])}</p>`
      + `<div class="row">${p ? `<a class="button secondary compact-button" href="${E(h(c, {view: 'overview', p: p.id, encounter: 'ENC-' + p.id}))}">Open patient record</a>` : ''}</div></section>`;
  }

  // ---- 本週議程 ----
  function agenda(c) {
    if (c.route.mdtCase && caseOf(c.route.mdtCase)) return summaryPack(c, caseOf(c.route.mdtCase));
    const team = teamOf(c.route.mdtTeam), m = MEETINGS.find(x => x.team === team.id && x.status === 'thisWeek');
    const chair = team.members.find(x => x.role === 'chair'), sec = team.members.find(x => x.role === 'secretary'), coord = team.members.find(x => x.role === 'coordinator');
    const list = m ? casesIn(m.id).map(cs => ({cs, pk: pack(c, cs)})) : [];
    const filter = ['ready', 'missing'].includes(c.route.mdtFilter) ? c.route.mdtFilter : 'all';
    const shown = list.filter(x => filter === 'all' || (filter === 'ready' ? !x.pk.missing.length : x.pk.missing.length));
    const replies = team.members.filter(x => x.reply !== 'pending').length;
    const last = MEETINGS.find(x => x.team === team.id && x.status === 'concluded');
    const lastTasks = last ? allTasks().filter(t => meetingOf(caseOf(t.caseId).meeting).id === last.id) : [];
    const open = lastTasks.filter(t => t.state !== 'done').length, overdue = allTasks().filter(t => t.team === team.id && overdueDays(c, t)).length;
    const lead = list.map(x => days(String(x.cs.proposedAt).slice(0, 10), m.date)).sort((a, b) => a - b), median = lead.length ? lead[Math.floor((lead.length - 1) / 2)] : 0;
    const chips = TEAMS.map(t => `<a class="filter-chip ${t.id === team.id ? 'active' : ''}" href="${go(c, {mdtTeam: t.id, mdtFilter: ''})}"${t.id === team.id ? ' aria-current="true"' : ''}>${E(t.name)}</a>`).join('');
    const fchips = [['all', 'All', list.length], ['ready', 'Data complete', list.filter(x => !x.pk.missing.length).length], ['missing', 'Data incomplete', list.filter(x => x.pk.missing.length).length]]
      .map(([k, t, n]) => `<a class="filter-chip ${filter === k ? 'active' : ''}" href="${go(c, {mdtFilter: k})}">${E(t)} <span class="tab-count" data-no-i18n>${n}</span></a>`).join('');
    const meeting = m ? card(`<span>${E(team.name)}</span> · ${D(m.date)} <span>${E(team.weekday)}</span> ${D(team.time)}`,
      dl([['Chair', D(memberName(c, chair))], ['Secretary', D(memberName(c, sec))], ['Coordinator', D(memberName(c, coord))], ['Fixed session', `<span>${E(team.weekday)}</span> ${D(team.time)}`],
        ['Location', E(team.location)], ['Attendance replies', `<span>${replies} / ${team.members.length}</span>`], ['Summary packs', m.packsSent ? `<span>Sent ${E(m.packsSent)}</span>` : '<span>Sent 24 hours before the meeting</span>']])
      + `<div class="row">${later('Propose a case')}${later('Print pre-meeting packs')}${later('Start the meeting record')}</div>`, pill(`Week ${m.week}`, 'info'), 'mdt-meeting') : '';
    const missingAll = [...new Set(list.flatMap(x => x.pk.missing))];
    const kpi = `<div class="mdt-kpis">${[[list.length, 'Cases this week', ''], [list.filter(x => x.pk.missing.length).length, 'Data incomplete', missingAll.join(' · ')],
      [open, "Last week's conclusions in progress", last ? `${md(last.date)} meeting` : ''], [overdue, 'Overdue tasks', ''], [unit(median, 'd'), 'Proposal to meeting, median', 'Target ≤ 7 days']]
      .map(([v, t, sub]) => `<div class="mdt-kpi"><b>${E(v)}</b><span>${E(t)}</span>${sub ? `<small>${E(sub)}</small>` : ''}</div>`).join('')}</div>`;
    const rows = shown.map(({cs, pk}) => {
      const p = patient(c, cs.p);
      return `<tr><td data-no-i18n>${cs.seq}</td><td class="mdt-patient">${p ? `<span class="bed-number" data-no-i18n>${E(p.bed)}</span> ` : ''}${ptLink(c, p)} <small>${E(ageOf(c, p))}</small><small class="mdt-dx" data-no-i18n>${E(dxOf(p))}</small></td><td>${pill(TYPE[cs.type])}</td>`
        + `<td><ul class="mdt-questions" data-no-i18n>${cs.question.map(q => `<li>${E(q)}</li>`).join('')}</ul></td><td data-no-i18n>${E(personName(c, cs.proposer))}</td>`
        + `<td><span class="mdt-ready ${pk.missing.length ? 'warn' : 'ok'}"><b data-no-i18n>${pk.ready}/8</b></span>${pk.missing.length ? `<br><small class="mdt-missing"><span>Missing items</span> ${pk.missing.map(x => `<span>${E(x)}</span>`).join(' ')}</small>` : '<br><small>All 8 cited</small>'}<br><a href="${go(c, {mdtCase: cs.id})}">Summary pack</a></td>`
        + `<td>${pk.missing.length ? pill('Data incomplete', 'warning') : pill('To discuss', 'info')}</td></tr>`;
    });
    const agendaCard = card('Agenda', `<div class="filter-row">${fchips}</div>` + (rows.length ? table(['No.', 'Patient', 'Proposal type', 'Questions to discuss', 'Proposer', 'Data ready (8 items)', 'Status'], rows, 'mdt-agenda')
      : '<div class="empty">No cases on this agenda.</div>') + '<p class="source">The 8 items are cited from the patient record; anything missing shows as “Not yet available”.</p>', '<small class="muted">Ordered by proposal time</small>');
    const att = card('Pre-meeting reminder and attendance', table(['Department', 'Member', 'Role', 'Reply'], team.members.map(x => `<tr><td>${E(memberDept(c, x))}</td><td data-no-i18n>${E(memberName(c, x))}</td><td>${E(ROLE[x.role])}</td><td>${pill(REPLY[x.reply][0], REPLY[x.reply][1])}</td></tr>`))
      + '<p class="source">Reminders go out 24 hours before the meeting and again 2 hours before to anyone who has not replied.</p>');
    const track = last ? card(`<span>Last week's conclusions</span> · ${D(md(last.date))}`, lastTasks.length ? table(['Patient', 'Task', 'Owner department', 'Deadline', 'Status'], lastTasks.slice().sort((a, b) => overdueDays(c, b) - overdueDays(c, a)).map(t => {
      const p = patient(c, t.p), od = overdueDays(c, t), cs = caseOf(t.caseId);
      return `<tr><td>${ptLink(c, p)}</td><td data-no-i18n>${E(t.text)}</td><td>${E(memberDept(c, teamOf(meetingOf(cs.meeting).team).members[t.m]))}</td><td data-no-i18n>${E(md(t.due))}</td><td>${od ? pill(`Overdue ${od} days`, 'danger') : pill(STATE[t.state][0], STATE[t.state][1])}</td></tr>`;
    })) + '<p class="source">A conclusion is a recommendation: treatment tasks become orders only after the doctor on duty adopts them.</p>' : '<div class="empty">No conclusions last week.</div>') : '';
    return `<div class="filter-row mdt-team-chips" aria-label="Teams">${chips}</div>` + meeting + kpi + agendaCard + `<div class="mdt-two">${att}${track}</div>`;
  }

  function summaryPack(c, cs) {
    const pk = pack(c, cs), m = meetingOf(cs.meeting);
    const info = card('Proposal', dl([['Proposer', `${D(personName(c, cs.proposer))} · ${D(hm(cs.proposedAt))}`], ['Questions to discuss', `<ol class="mdt-questions" data-no-i18n>${cs.question.map(q => `<li>${E(q)}</li>`).join('')}</ol>`],
      ['Data ready', `<span data-no-i18n>${pk.ready} / 8</span>${pk.missing.length ? ` <small class="mdt-missing"><span>Missing items</span> ${pk.missing.map(x => `<span>${E(x)}</span>`).join(' ')}</small>` : ''}`]]
      .concat(cs.previous ? [['Previous decision', `<a href="${go(c, {mdtTab: 'records', mdtCase: cs.previous})}" data-no-i18n>${E(cs.previous)}</a>`]] : []))
      + `<div class="row">${cs.record ? `<a class="button secondary compact-button" href="${go(c, {mdtTab: 'records', mdtCase: cs.id})}">Open the meeting record</a>` : later('Start the meeting record')}${later('Print pre-meeting packs')}</div>`);
    const chips = `<div class="mdt-ready-chips">${pk.items.map(x => `<span class="pill ${x.ok ? 'success' : 'warning'}">${x.ok ? IC('check', {size: 14}) : IC('alert-triangle', {size: 14})}<span>${E(x.label)}</span></span>`).join('')}</div>`;
    const src = x => (x.ref || x.at) ? `<p class="source">${x.ref ? (x.refName ? D(x.ref) : `<span>${E(x.ref)}</span>`) : ''}${x.ref && x.at ? ' · ' : ''}${x.at ? D(hm(x.at)) : ''}</p>` : '';
    const cards = pk.items.map(x => `<section class="mdt-pack-item ${x.ok ? '' : 'missing'}"><h3>${E(x.label)}</h3>${x.ok ? (x.cited ? pill('Cited from source system', 'muted') : x.na ? '' : pill('From the patient record', 'success')) : pill('Not yet available', 'warning')}`
      + (x.ok ? (x.plain ? `<p>${E(x.text)}</p>` : `<p data-no-i18n>${E(x.text)}</p>`) + src(x) : '') + '</section>').join('');
    const frozen = cs.record ? `<p class="notice info"><span>Pack cited at the meeting</span> ${D(cs.record.packAt)} · <span>Items below show the record today</span></p>` : '';
    return caseHead(c, cs, 'Summary pack') + flow(c, cs, 'pack') + frozen + info + card('Summary pack · 8 items', chips + `<div class="mdt-pack-grid">${cards}</div><p class="source">The pack only cites the record; nothing is retyped. Section B.1 of the meeting record cites this pack.</p>`);
  }

  // ---- 個案會議 ----
  function caseMeetings(c) {
    const n = k => CASE_MEETINGS.filter(x => x.status === k).length;
    const kpi = `<div class="mdt-kpis">${[[n('scheduled') + n('toSchedule'), 'Scheduled or to schedule'], [n('review'), 'Record awaiting chair confirmation'], [n('completed') + n('concluded'), 'Concluded or completed'], [n('deferred'), 'Not convened']]
      .map(([v, t]) => `<div class="mdt-kpi"><b data-no-i18n>${v}</b><span>${E(t)}</span></div>`).join('')}</div>`;
    const rows = CASE_MEETINGS.map(x => {
      const p = patient(c, x.p);
      return `<tr><td>${p ? `<span class="bed-number" data-no-i18n>${E(p.bed)}</span>` : '—'}</td><td>${ptLink(c, p)}</td><td>${E(CM_KIND[x.kind])}</td><td>${x.kind === 'deferred' ? `<span>Reason: ${E(x.topic)}</span>` : E(x.topic)}</td><td>${x.level ? E(x.level) : '—'}</td>`
        + `<td data-no-i18n>${x.at ? E(hm(x.at)) : '—'}</td><td>${x.place ? E(x.place) : '—'}</td><td>${pill(CM_STATUS[x.status][0], CM_STATUS[x.status][1])}${x.signed ? `<br><small>Required signatures ${E(x.signed)}</small>` : ''}</td>`
        + `<td>${x.replies ? `<small>${x.kind === 'deferred' ? `Discipline consults ${E(x.replies)}` : `Discipline replies ${E(x.replies)}`}</small>` : '—'}</td><td data-no-i18n>${E(personName(c, x.owner))}</td></tr>`;
    });
    const review = CASE_MEETINGS.filter(x => x.status === 'review').map(x => { const p = patient(c, x.p); return `<li>${ptLink(c, p, p ? p.bed + ' ' + p.name : '')} · <span>${E(x.topic)}</span> · <span>Secretary submitted</span> ${D(hm(x.submitted))} ${later('Remind the chair')}</li>`; }).join('');
    return kpi + card('Case meetings', table(['Bed', 'Patient', 'Kind', 'Topic or reason', 'Level', 'Time', 'Location', 'Status', 'Pre-meeting input', 'Doctor on duty'], rows)
      + '<p class="source">“Not convened” is a record too: who decided, when and why. Family meetings have their own record and do not use HC-05.</p>')
      + `<div class="mdt-two">${card('Records awaiting chair review', `<ul class="mdt-list">${review}</ul><p class="source">The record locks as v1 once the chair confirms; each plan row then becomes a task.</p>`)}`
      + card('Prompts to convene', `<ul class="mdt-list"><li>${ptLink(c, patient(c, 'G'))} · <span>Three discipline consults</span> · <span>Already on the heart team agenda for 09-02, so no separate prompt</span></li></ul><p class="source">A prompt appears at three or more discipline consults, or when social work flags a difficult discharge.</p>`) + '</div>';
  }

  // ---- 團隊與會期 ----
  function teams(c) {
    const team = teamOf(c.route.mdtTeam);
    const side = `<nav class="mdt-team-list" aria-label="Standing teams">${TEAMS.map(t => { const ch = t.members.find(x => x.role === 'chair'); return `<a href="${go(c, {mdtTeam: t.id})}" class="${t.id === team.id ? 'active' : ''}"${t.id === team.id ? ' aria-current="true"' : ''}><b>${E(t.name)}</b><small><span>${E(t.weekday)}</span> ${D(t.time.slice(0, 5))} · <span>${t.members.length} members</span></small><small data-no-i18n>${E(memberName(c, ch))}</small></a>`; }).join('')}${later('Add a team')}</nav>`;
    const members = card(`<span>${E(team.name)}</span> · <span>Members</span>`, table(['Department', 'Member', 'Role', 'Attends'], team.members.map(x => `<tr><td>${E(memberDept(c, x))}</td><td data-no-i18n>${E(memberName(c, x))}</td><td>${E(ROLE[x.role])}</td><td>${E(ATTEND[x.attend])}</td></tr>`))
      + '<p class="source">A meeting is valid only when every core department is present.</p>');
    const chair = team.members.find(x => x.role === 'chair'), sec = team.members.find(x => x.role === 'secretary'), coord = team.members.find(x => x.role === 'coordinator');
    const session = card('Fixed session', dl([['Meeting schedule', `<span>${E(team.weekday)}</span> ${D(team.time)}`], ['Location', E(team.location)], ['Chair', `${D(memberName(c, chair))} · <span>Deputy</span> ${D(team.deputy)}`], ['Secretary', D(memberName(c, sec))], ['Coordinator', D(memberName(c, coord))],
      ['Proposal deadline', E(team.deadline)], ['Reminders', '<span>24 hours before; again 2 hours before to anyone who has not replied</span>'], ['Level', `<span>${E(team.level)}</span> · <span>chaired at head-of-department level</span>`]])
      + table(['Session', 'Date', 'Agenda', 'Status'], MEETINGS.filter(m => m.team === team.id).map(m => { const n = casesIn(m.id).length || m.proposed || 0; return `<tr><td>${E(`Week ${m.week}`)}</td><td data-no-i18n>${E(m.date)}</td><td>${n ? `<span>${n} cases</span>` : '—'}</td><td>${pill(SESSION[m.status][0], SESSION[m.status][1])}</td></tr>`; })), '<small class="muted">Created automatically 8 weeks ahead</small>');
    const rules = card('Meeting rules', table(['Setting', 'Value', 'Notes'], [
      ['Goes to the meeting by default', 'Post-op complex cases, plan changes, goals of care', 'Coordinator can adjust the agenda'],
      ['Data check', '8 items: diagnosis, operative record, imaging, labs, organ support, weight, current medications, family wishes', 'Missing items show as “Not yet available”, never blank'],
      ['Record format', 'HC-05 consultation record with a plan appendix', 'National form structure; hospital layout can be adjusted'],
      ['Signatures', 'Chair, secretary and members', 'Locked once the chair confirms; changes create a new version'],
      ['Force of the conclusion', 'Recommendation; the doctor on duty adopts and orders', 'Treatment tasks need adoption before any order'],
      ['Default deadlines', 'Treatment 7 days, operational 14 days', 'Overdue tasks are flagged and notified']].map(r => `<tr>${r.map(x => `<td>${E(x)}</td>`).join('')}</tr>`)));
    return `<div class="mdt-teams">${side}<div class="mdt-team-main">${members}${session}${rules}</div></div>`;
  }

  // ---- 歷次會議與 HC-05 紀錄 ----
  function records(c) {
    const cs = caseOf(c.route.mdtCase);
    if (cs && cs.record) return c.route.mdtPrint === '1' ? printRecord(c, cs) : hc05(c, cs);
    const past = MEETINGS.filter(m => m.status === 'concluded');
    return past.map(m => { const t = teamOf(m.team); return card(`<span>${E(t.name)}</span> · ${D(m.date + ' ' + t.time)}`, table(['No.', 'Bed', 'Patient', 'Diagnosis', 'Conclusion', 'Version', 'Tasks', 'Actions'], casesIn(m.id).map(x => {
      const p = patient(c, x.p), r = x.record;
      return `<tr><td data-no-i18n>${x.seq}</td><td>${p ? `<span class="bed-number" data-no-i18n>${E(p.bed)}</span>` : '—'}</td><td>${ptLink(c, p)}</td><td data-no-i18n>${E(dxOf(p))}</td><td data-no-i18n>${E(r.conclusion.decision)}</td><td><span data-no-i18n>v${r.version}</span> · <span>Chair confirmed</span> ${D(hm(r.chairAt))}</td><td data-no-i18n>${r.plan.length}</td>`
        + `<td class="mdt-actions"><a href="${go(c, {mdtTab: 'records', mdtCase: x.id})}">Record</a> <a href="${go(c, {mdtTab: 'tasks', mdtCase: x.id})}">Tasks</a></td></tr>`;
    })), pill(`Week ${m.week}`, 'muted')); }).join('') || '<div class="empty">No past meetings.</div>';
  }

  function hc05(c, cs) {
    const r = cs.record, m = meetingOf(cs.meeting), t = teamOf(m.team), mem = i => t.members[i];
    const present = r.attendance.filter(a => a.mode !== 'absent').length;
    const sec = (code, title, vi, body) => `<section class="mdt-hc05-sec"><h3><span data-no-i18n>${code}</span> · <span>${E(title)}</span> <small data-no-i18n>${E(vi)}</small></h3>${body}</section>`;
    const status = `${pill('v' + r.version, 'muted')} ${pill(`Chair confirmed ${hm(r.chairAt)}`, 'success')} ${pill(`Excerpt filed to the record ${hm(r.excerptAt)}`, 'success')}`;
    const a = sec('A', 'Meeting information', 'Hành chính', dl([['Date and time', D(`${m.date} ${t.time} · ${r.slot}`)], ['Format', E(r.form === 'hybrid' ? 'Hybrid (in room and by video)' : 'In person')], ['Level', `<span>${E(t.level)}</span> · <span>${E(t.name)}</span>`],
      ['Chair / secretary', D(`${memberName(c, t.members.find(x => x.role === 'chair'))} / ${memberName(c, t.members.find(x => x.role === 'secretary'))}`)], ['Attendance', `<span data-no-i18n>${present} / ${r.attendance.length}</span>`]])
      + table(['Department', 'Member', 'Role', 'Attendance', 'Signature'], r.attendance.map(x => `<tr><td>${E(memberDept(c, mem(x.m)))}</td><td data-no-i18n>${E(memberName(c, mem(x.m)))}</td><td>${E(ROLE[mem(x.m).role])}</td><td>${E(MODE[x.mode])}</td><td>${x.at ? `<span data-no-i18n>✓ ${E(x.at)}</span>` : '—'}</td></tr>`)));
    const b1 = sec('B.1', 'Patient information and summary', 'Tóm tắt bệnh án', `<p class="preserve-lines">${E(r.summary)}</p><p class="source"><span>Cites the summary pack of</span> ${D(r.packAt)} · <span>missing items stay “Not yet available”</span></p>`);
    const b2 = sec('B.2', 'Questions', 'Vấn đề hội chẩn', `<ol class="mdt-questions" data-no-i18n>${cs.question.map(q => `<li>${E(q)}</li>`).join('')}</ol>`);
    const b3 = sec('B.3', 'Opinions by department', 'Ý kiến các chuyên khoa', table(['Department · speaker', 'Opinion', 'Signature'], r.opinions.map(o => `<tr><td><span>${E(memberDept(c, mem(o.m)))}</span> · ${D(memberName(c, mem(o.m)))}</td><td data-no-i18n>${E(o.text)}</td><td data-no-i18n>✓ ${E(o.at)}</td></tr>`)));
    const k = r.conclusion;
    const b4 = sec('B.4', 'Conclusion', 'Kết luận', dl([['Diagnosis confirmed', D(k.dx)], ['Goal of treatment', D(k.goal)], ['Treatment decision', D(k.decision)], ['Tests still pending', D(k.pending)], ['Consensus', D(k.consensus)], ['Dissenting opinions', D(k.dissent)], ['Explained to the family', D(k.explained)]]));
    const plan = sec('Appendix', 'Plan of care: each row becomes a task', 'Phụ lục', table(['No.', 'Content', 'Type', 'Owner department', 'Owner', 'Deadline'], r.plan.map(p => `<tr><td data-no-i18n>${p.n}</td><td data-no-i18n>${E(p.text)}</td><td>${pill(KIND[p.kind], p.kind === 'treatment' ? 'info' : 'muted')}</td><td>${E(memberDept(c, mem(p.m)))}</td><td data-no-i18n>${E(memberName(c, mem(p.m)))}</td><td data-no-i18n>${E(p.due)}</td></tr>`))
      + '<p class="source">Treatment rows need the doctor on duty to adopt and order them; operational rows are carried out once the owner department receives them.</p>');
    const sign = card('Signatures and version', dl([['Chair', `${D(memberName(c, t.members.find(x => x.role === 'chair')))} · ${D(hm(r.chairAt))} · <span>Electronic signature</span>`], ['Secretary', `${D(memberName(c, t.members.find(x => x.role === 'secretary')))} · ${D(hm(r.excerptAt))} · <span>Electronic signature</span>`],
      ['Members signed', `<span data-no-i18n>${r.attendance.filter(x => x.at).length - 2} / ${present - 2}</span>`]])
      + `<div class="row"><a class="button secondary compact-button" href="${go(c, {mdtTab: 'records', mdtCase: cs.id, mdtPrint: '1'})}">${IC('printer', {size: 16})}<span>Print HC-05</span></a>${later('Create a revised version')}<a class="button compact-button" href="${go(c, {mdtTab: 'tasks', mdtCase: cs.id})}">Follow-up tasks</a></div>`);
    return caseHead(c, cs, 'Discussion and conclusion') + flow(c, cs, 'record') + card(`<span>Discussion and conclusion</span> · <span>HC-05</span>`, a + b1 + b2 + b3 + b4 + plan, `<span class="row">${status}</span>`, 'mdt-hc05') + sign;
  }

  function printRecord(c, cs) {
    const r = cs.record, m = meetingOf(cs.meeting), t = teamOf(m.team), p = patient(c, cs.p), mem = i => t.members[i];
    const chair = t.members.find(x => x.role === 'chair'), sec = t.members.find(x => x.role === 'secretary');
    const crumbs = `<nav class="breadcrumb" aria-label="Current location"><a href="${go(c, {mdtCase: ''})}">Team meeting (MDT)</a><span aria-hidden="true">›</span><a href="${go(c, {mdtPrint: ''})}">Discussion and conclusion</a><span aria-hidden="true">›</span><span aria-current="page">Print preview</span></nav>`;
    const sheet = `<article class="print-sheet mdt-print"><header><div><small>WARD CARE · Demo medical record</small><h1 data-no-i18n>BIÊN BẢN HỘI CHẨN</h1><p>Consultation record (HC-05)</p></div></header>`
      + `<div class="print-identity" data-no-i18n>${E(p ? p.name : '')} · ${E(p ? p.bed : '')} · ${E(p ? p.identifier : '')} · ${E(dxOf(p))}<br>${E(t.name)} · ${E(m.date + ' ' + r.slot)}</div>`
      + `<h3>B.2 · <span>Questions</span></h3><ol data-no-i18n>${cs.question.map(q => `<li>${E(q)}</li>`).join('')}</ol>`
      + `<h3>B.1 · <span>Patient information and summary</span></h3><p class="preserve-lines">${E(r.summary)}</p>`
      + `<h3>B.3 · <span>Opinions by department</span></h3><table><tbody>${r.opinions.map(o => `<tr><td>${E(memberDept(c, mem(o.m)))}</td><td data-no-i18n>${E(o.text)}</td><td data-no-i18n>${E(memberName(c, mem(o.m)))}</td></tr>`).join('')}</tbody></table>`
      + `<h3>B.4 · <span>Conclusion</span></h3><p data-no-i18n>${E(r.conclusion.decision)}</p>`
      + `<h3><span>Appendix</span> · <span>Plan of care</span></h3><table><tbody>${r.plan.map(x => `<tr><td data-no-i18n>${x.n}</td><td data-no-i18n>${E(x.text)}</td><td>${E(memberDept(c, mem(x.m)))}</td><td data-no-i18n>${E(x.due)}</td></tr>`).join('')}</tbody></table>`
      + `<div class="mdt-print-sign"><div><b>Chair</b><span data-no-i18n>${E(memberName(c, chair))}</span></div><div><b>Secretary</b><span data-no-i18n>${E(memberName(c, sec))}</span></div><div><b>Members</b><span data-no-i18n>${r.attendance.filter(x => x.at).length - 2}</span></div></div>`
      + `<footer data-no-i18n>${E(cs.id)} · v${r.version} · ${E(hm(r.chairAt))}</footer></article>`;
    return crumbs + `<div class="print-toolbar"><button type="button" data-ui="printNow" data-value="{}">Print / save as PDF</button><span>A4 · Fictional demo · Save as PDF from the browser's print dialog</span></div>` + sheet;
  }

  // ---- 交接追蹤 ----
  function tasks(c) {
    const withRec = CASES.filter(x => x.record);
    const cs = caseOf(c.route.mdtCase) && caseOf(c.route.mdtCase).record ? caseOf(c.route.mdtCase) : withRec[0];
    const r = cs.record, m = meetingOf(cs.meeting), t = teamOf(m.team), mem = i => t.members[i];
    const plan = r.plan.map(x => ({...x, od: overdueDays(c, x)}));
    const n = f => plan.filter(f).length;
    const stats = `<div class="mdt-kpis">${[[plan.length, 'Tasks'], [n(x => x.state !== 'pending'), 'Received'], [n(x => x.kind === 'treatment' && ['adopted', 'started'].includes(x.state)), 'Adopted and ordered'], [n(x => ['started', 'done'].includes(x.state)), 'Started or completed'], [n(x => x.state === 'pending'), 'Awaiting receipt'], [n(x => x.od), 'Overdue']]
      .map(([v, l]) => `<div class="mdt-kpi"><b data-no-i18n>${v}</b><span>${E(l)}</span></div>`).join('')}</div>`;
    const steps = k => k === 'treatment' ? ['pending', 'received', 'adopted', 'started'] : ['pending', 'received', 'done'];
    const taskCards = plan.map(x => {
      const seq = steps(x.kind), at = seq.indexOf(x.state);
      return `<article class="mdt-task ${x.od ? 'overdue' : ''}"><header><b data-no-i18n>${x.n}</b><p data-no-i18n>${E(x.text)}</p>${x.od ? pill(`Overdue ${x.od} days`, 'danger') : pill(STATE[x.state][0], STATE[x.state][1])}</header>`
        + dl([['Type', E(KIND[x.kind])], ['Owner department', E(memberDept(c, mem(x.m)))], ['Owner', D(memberName(c, mem(x.m)))], ['Deadline', D(x.due)]])
        + `<ol class="mdt-state">${seq.map((s, i) => `<li class="${i < at ? 'done' : i === at ? 'current' : ''}">${E(STATE[s][0])}</li>`).join('')}</ol>`
        + (x.log.length ? `<p class="source">${x.log.map(([when, who, what]) => `<span data-no-i18n>${E(hm(when))}</span> <span>${E(LOG[what])}</span>`).join(' → ')}${x.note ? ` · ${D(x.note)}` : ''}</p>` : `<p class="source"><span>Sent</span> ${D(hm(r.excerptAt))} · <span>Not yet received</span></p>`)
        + `<div class="row">${x.state === 'pending' ? later('Receive the task') : x.state === 'done' || x.state === 'started' ? '' : later('Record completion')}${x.state === 'done' || x.state === 'started' ? '' : later('Cannot follow the conclusion (give a reason)')}</div></article>`;
    }).join('');
    const pick = `<div class="filter-row" aria-label="Decided cases">${withRec.map(x => { const p = patient(c, x.p); return `<a class="filter-chip ${x.id === cs.id ? 'active' : ''}" href="${go(c, {mdtCase: x.id})}"><span data-no-i18n>${E(md(meetingOf(x.meeting).date) + ' · ' + (p ? p.bed + ' ' + p.name : x.id))}</span></a>`; }).join('')}</div>`;
    const head = card(`<span>Decision summary</span> · ${ptLink(c, patient(c, cs.p))} · <span>${E(t.name)}</span> ${D(md(m.date))}`, `<p data-no-i18n>${E(r.conclusion.decision)}</p><p class="source"><span data-no-i18n>v${r.version}</span> · <span>Chair</span> ${D(memberName(c, t.members.find(x => x.role === 'chair')))} · ${D(hm(r.chairAt))}</p>`
      + `<div class="row"><a class="button secondary compact-button" href="${go(c, {mdtTab: 'records', mdtCase: cs.id})}">View the decision</a>${later('Re-propose after a change (links this decision)')}</div>`);
    const board = card(`<span>Team follow-up status</span> · <span>last 4 weeks</span>`, table(['Meeting', 'Patient', 'Tasks', 'Received', 'Started or completed', 'Overdue'], withRec.map(x => {
      const pl = x.record.plan;
      return `<tr><td data-no-i18n>${E(md(meetingOf(x.meeting).date))}</td><td>${ptLink(c, patient(c, x.p))}</td><td data-no-i18n>${pl.length}</td><td data-no-i18n>${pl.filter(y => y.state !== 'pending').length}</td><td data-no-i18n>${pl.filter(y => ['started', 'done'].includes(y.state)).length}</td><td data-no-i18n>${pl.filter(y => overdueDays(c, y)).length}</td></tr>`;
    })));
    const log = plan.flatMap(x => x.log.map(([when, who, what]) => [when, who, `Task ${x.n}`, what])).concat([[r.excerptAt, 1, '', 'sent'], [r.chairAt, 0, '', 'confirmed']]).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    const LOG2 = {...LOG, sent: `Sent ${plan.length} tasks; HC-05 excerpt filed to the record`, confirmed: 'Chair confirmed the conclusion and locked it'};
    const audit = card(`<span>Activity log</span> · <span data-no-i18n>${log.length}</span>`, table(['Time', 'Who', 'What'], log.map(([when, who, task, what]) => `<tr><td data-no-i18n>${E(hm(when))}</td><td data-no-i18n>${E(memberName(c, mem(who)))}</td><td>${task ? `<span>${E(task)}</span>: ` : ''}<span>${E(LOG2[what])}</span></td></tr>`)));
    return pick + flow(c, cs, 'follow') + head + stats + `<div class="mdt-task-grid">${taskCards}</div>` + `<div class="mdt-two">${board}${audit}</div>`;
  }

  // ---- 儀表板 ----
  function dashboard(c) {
    const od = allTasks().map(t => ({...t, od: overdueDays(c, t)})).filter(t => t.od);
    const kpis = DASH.kpis.concat([[od.length, '', 'Overdue tasks', 'Notified to the owner department and the coordinator']]);
    const tiles = `<div class="mdt-kpis mdt-kpis-wide">${kpis.map(([v, u, t, sub]) => `<div class="mdt-kpi"><b>${E(unit(v, u))}</b><span>${E(t)}</span><small>${E(sub)}</small></div>`).join('')}</div>`;
    const max = Math.max(...DASH.weekly.map(x => x[1]));
    const weekly = card('Cases discussed per week', `<ul class="mdt-bars">${DASH.weekly.map(([w, n]) => `<li><span data-no-i18n>${E(w)}</span><span class="mdt-bar"><i style="width:${Math.round(n / max * 100)}%"></i></span><b data-no-i18n>${n}</b></li>`).join('')}</ul>`);
    const teamRows = table(['Team', 'Cases', 'Proposal to meeting', 'Meeting to treatment', 'On-time follow-through', 'Data complete', 'Attendance'], DASH.teams.map(([id, n, toMeet, toTreat, ...pct]) => `<tr><td>${E(teamOf(id).name)}</td><td data-no-i18n>${n}</td><td>${E(unit(toMeet, 'd'))}</td><td>${E(unit(toTreat, 'd'))}</td>${pct.map(x => `<td data-no-i18n>${E(unit(x, '%'))}</td>`).join('')}</tr>`));
    const missing = card('Most often missing at the meeting', `<ul class="mdt-bars">${DASH.missing.map(([k, n]) => `<li><span>${E(k)}</span><span class="mdt-bar"><i style="width:${Math.round(n / DASH.missing[0][1] * 100)}%"></i></span><b data-no-i18n>${n}</b></li>`).join('')}</ul><p class="source">The coordinator receives the missing-item list before the proposal deadline.</p>`);
    const overdue = card('Overdue tasks', od.length ? table(['Patient', 'Task', 'Owner department', 'Deadline', 'Overdue'], od.map(t => { const cs = caseOf(t.caseId), tm = teamOf(meetingOf(cs.meeting).team); return `<tr><td>${ptLink(c, patient(c, t.p))}</td><td data-no-i18n>${E(t.text)}</td><td>${E(memberDept(c, tm.members[t.m]))}</td><td data-no-i18n>${E(md(t.due))}</td><td>${pill(`${t.od} days`, 'danger')}</td></tr>`; })) : '<div class="empty">No overdue tasks.</div>');
    return card(`<span>MDT dashboard</span> · <span>All teams</span>`, `<p class="muted"><span>Last 8 weeks</span> ${D('(' + DASH.period + ')')} · <span>Figures are computed from proposals, agendas, records and tasks; nothing is reported separately. Demo figures.</span></p>`, later('Export XLSX')) + tiles
      + `<div class="mdt-two">${weekly}${missing}</div>` + card('Indicators by team', teamRows + '<p class="source">On-time follow-through = tasks started or completed by their deadline ÷ all tasks.</p>') + overdue;
  }

  function render(c) {
    const {tab, nav} = head(c);
    const body = tab === 'cases' ? caseMeetings(c) : tab === 'teams' ? teams(c) : tab === 'records' ? records(c) : tab === 'tasks' ? tasks(c) : tab === 'dashboard' ? dashboard(c) : agenda(c);
    return nav + `<div class="mdt-page">${body}</div>`;
  }

  const api = {render, tabs: TABS, pack, overdueDays, data: {TEAMS, MEETINGS, CASES, CASE_MEETINGS}};
  if (typeof module !== 'undefined') module.exports = api; else root.ICUMdt = api;
})(typeof window !== 'undefined' ? window : globalThis);
