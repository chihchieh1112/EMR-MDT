/* EMR整合MDT demo 專用字典（2026-11-10）。在 i18n-dict.js 之後、i18n.js 之前載入，把 demo 新增的英文字串補上中文與越南文。
   每列 [英文正本, 中文, 越文]；含 {0} 的是樣式句。原型的 i18n-dict.js 不改，方便之後對照原型新版。
   P2：MDT 模組（議程、團隊、摘要包、紀錄、任務、儀表板、提案、入口）的中文；越文留空（demo 只開 EN／中文）。 */
(function (root) {
  'use strict';
  const dict = root.ICUI18nDict;
  if (!dict || !Array.isArray(dict.entries)) return;
  const add = [
    ['EMR · Smart MDT | {0}', 'EMR · Smart MDT｜{0}', 'EMR · Smart MDT | {0}'],
    ['Staff Sign-In | EMR · Smart MDT', '員工登入｜EMR · Smart MDT', 'Đăng nhập nhân viên | EMR · Smart MDT'],
    ['Demo Hospital · Oncology', '示範醫院 · 腫瘤醫療', 'Bệnh viện mẫu · Ung bướu'],
    ['Demo Hospital', '示範醫院', 'Bệnh viện mẫu'],
    ['EMR + MDT demo', 'EMR＋MDT 示範', 'Bản demo EMR + MDT'],
    ['One record, from the ward to the tumour board', '同一份病歷，從病房到團隊會議', 'Một hồ sơ bệnh án, từ khoa phòng đến hội chẩn đa chuyên khoa'],
    ['Propose · Prepare · Decide · Follow up', '提案 · 會前 · 決定 · 追蹤', 'Đề xuất · Chuẩn bị · Quyết định · Theo dõi'],
    ['All patients, staff and data in this demo are fictitious.', '本 demo 的病人、人員與資料全部虛構。', 'Mọi người bệnh, nhân viên và dữ liệu trong bản demo đều là giả định.'],
    ['MDT write actions in this demo are for demonstration only and are not part of the phase 1 scope.', '本 demo 的 MDT 寫入功能僅供示範，不代表一期交付範圍。', 'Các thao tác ghi MDT trong bản demo chỉ để minh họa, không thuộc phạm vi giai đoạn 1.'],
    ['MDT module under construction (demo P2): proposal from the EMR, teams and sessions, weekly agenda, case summary pack, meeting record with chair’s conclusion and action plan, hand-off tasks and dashboard.', 'MDT 模組重建中（demo P2）：從 EMR 提案、團隊與會期、本週議程、個案摘要包、含主席結論與處置計畫的會議紀錄、交接任務與儀表板。', ''],
    ['The prototype’s read-only MDT pages are hidden in this demo until the rebuilt module replaces them.', '原型的 MDT 唯讀頁面在重建完成前先隱藏。', ''],
    ['Oncology', '腫瘤內科', 'Ung bướu'], ['Breast Surgery', '乳房外科', 'Ngoại Vú'], ['Radiation Oncology', '放射腫瘤科', 'Xạ trị'], ['Diagnostic Imaging', '影像診斷科', 'Chẩn đoán hình ảnh'],
    ['Pathology', '病理科', 'Giải phẫu bệnh'], ['Nuclear Medicine', '核醫科', 'Y học hạt nhân'], ['Cardiology', '心臟內科', 'Tim mạch'], ['Plastic Surgery', '整形外科', 'Phẫu thuật tạo hình'],
    ['Allied health', '職類（營養、藥學、復健、社工）', 'Cận lâm sàng / nghề phụ trợ'],
    ['Clinical Pharmacy', '臨床藥學', 'Dược lâm sàng'], ['Nutrition', '營養', 'Dinh dưỡng'], ['Rehabilitation', '復健', 'Phục hồi chức năng'], ['Social Work', '社工', 'Công tác xã hội'],
    // ---- P2 MDT：分頁與共用 ----
    ["This week's agenda", '本週議程', ''], ['Teams and sessions', '團隊與會期', ''], ['Past meetings', '歷次會議', ''], ['Follow-up tasks', '交接追蹤', ''], ['Dashboard', '儀表板', ''],
    ['Demo controls · demo time', '示範控制 · 示範時間', ''], ['Jump demo time:', '跳到示範時間：', ''], ['Meeting time 11-04 14:00', '開會時間 11-04 14:00', ''], ['Next morning 11-05 09:10', '隔天早上 11-05 09:10', ''], ['Treatment day 11-06 09:30', '治療日 11-06 09:30', ''],
    ['Receive echo report (LVEF 60%) · 11-05 08:50', '收到心臟超音波報告（LVEF 60%）· 11-05 08:50', ''], ['Echo report received (LVEF 60%)', '心臟超音波報告已回（LVEF 60%）', ''],
    ['Summary pack', '摘要包', ''], ['Record', '紀錄', ''], ['Start record', '開始紀錄', ''], ['Tasks', '任務', ''], ['Records', '紀錄', ''], ['Agenda', '議程', ''], ['Print', '列印', ''],
    ['Available', '已備', ''], ['Missing', '缺', ''], ['Late · confirmed', '逾截止 · 已確認', ''], ['Late · awaiting coordinator', '逾截止 · 待協調人確認', ''], ['Late proposal · confirmed', '逾截止提案 · 已確認', ''], ['Late proposal · awaiting coordinator', '逾截止提案 · 待協調人確認', ''],
    ['Urgent', '急件', ''], ['Draft', '草稿', ''], ['On agenda', '已排入議程', ''], ['In discussion', '討論中', ''], ['Concluded', '已結論', ''], ['Deferred', '延後', ''], ['Withdrawn', '已撤回', ''], ['New proposal', '新提案', ''],
    ['Scheduled', '已排定', ''], ['In progress', '進行中', ''], ['Open for proposals', '開放提案', ''],
    ['New diagnosis', '新診斷', ''], ['Post-operative', '術後', ''], ['Plan change / progression', '計畫變更／疾病進展', ''], ['Pre-operative', '術前', ''], ['Goals of care', '照護目標', ''],
    ['Chair', '主席', ''], ['Secretary', '秘書', ''], ['Coordinator', '協調人', ''], ['Core member', '核心成員', ''], ['By case', '依個案', ''],
    ['Every meeting', '每次會議', ''], ['Staging cases', '分期個案', ''], ['Reconstruction cases', '重建個案', ''], ['Regimen or dose questions', '處方或劑量問題', ''],
    ['Present', '出席', ''], ['By video', '視訊', ''], ['Absent', '缺席', ''], ['No reply yet', '尚未回覆', ''],
    ['Treatment', '治療', ''], ['Referral', '轉介', ''], ['Operational', '行政', ''], ['Follow-up', '追蹤', ''],
    ['Awaiting receipt', '待接收', ''], ['Received', '已接收', ''], ['Adopted · ordered', '已採納開單', ''], ['Treatment started', '已開始治療', ''], ['Completed', '已完成', ''], ['Could not be carried out', '無法執行', ''], ['Overdue', '逾期', ''],
    ['Pathology', '病理', ''], ['Biomarkers', '生物標記', ''], ['Staging', '分期', ''], ['Imaging', '影像', ''], ['Baseline labs', '基準檢驗', ''], ['Performance status', '體能狀態', ''], ['Cardiac function', '心臟功能', ''], ['Patient wishes', '病人意願', ''],
    // ---- 議程 ----
    ['Date and time', '日期時間', ''], ['Room', '地點', ''], ['Proposal deadline', '提案截止', ''], ['Your attendance reply:', '您的出席回覆：', ''],
    ['Start the meeting (record attendance, freeze summary packs)', '開始會議（記錄出席、凍結摘要包版本）', ''], ['Conclude the meeting', '結束會議', ''],
    ['Cases on the agenda', '議程個案', ''], ['Data complete (8/8)', '資料齊備（8/8）', ''], ['Data missing', '資料未齊', ''], ['Late proposals to confirm', '待確認的逾截止提案', ''], ['Attendance replies', '出席回覆', ''],
    ['All cases', '全部個案', ''], ['Data complete', '資料齊備', ''], ['Patient', '病人', ''], ['Diagnosis · type', '診斷 · 類型', ''], ['Clinical question', '臨床問題', ''], ['Proposed by', '提案人', ''], ['Data readiness', '資料齊備', ''], ['Status', '狀態', ''],
    ['Confirm for agenda', '確認排入議程', ''], ['Follow-up of last session', '上週結論追蹤', ''], ['Case', '個案', ''], ['Conclusion', '結論', ''], ['Hand-off tasks', '交接任務', ''],
    ['{0} of {1} cases', '{0}／{1} 案', ''],
    // ---- 團隊 ----
    ['Regular session', '固定會期', ''], ['Remote attendance', '遠端出席', ''], ['Quorum', '法定出席', ''], ['Covers (ICD-10)', '涵蓋診斷（ICD-10）', ''], ['Pre-meeting prefill by specialty', '會前各職類預填', ''],
    ['Enabled · each core specialty can enter findings before the meeting (shown in P3)', '啟用 · 各核心職類可在會前填入所見（P3 展示）', ''], ['Team settings · read-only', '團隊設定 · 唯讀', ''],
    ['Members', '成員', ''], ['Member', '成員', ''], ['Department', '科別', ''], ['Role', '角色', ''], ['Attends', '出席規則', ''], ['Reply', '回覆', ''], ['Sessions', '會期', ''], ['Week', '週次', ''], ['Date', '日期', ''], ['Cases', '個案數', ''],
    ['Last 8 weeks', '近 8 週', ''], ['Cases discussed', '討論個案數', ''], ['Data complete at the meeting', '開會時資料齊備率', ''], ['Conclusions carried out on time', '結論準時執行率', ''], ['Core member attendance', '核心成員出席率', ''],
    ['Demo figure', '示範數字', ''], ['Live from this demo', '本 demo 即時計算', ''], ['On the agenda now', '目前議程個案', ''], ['Data complete now', '目前資料齊備率', ''], ['Overdue hand-off tasks', '逾期交接任務', ''],
    // ---- 歷次會議 ----
    ['Attendance', '出席', ''], ['Concluded at', '結束時間', ''], ['Locked', '已鎖定', ''], ['No concluded sessions for this team yet.', '這個團隊還沒有已結論的會期。', ''],
    // ---- 任務 ----
    ['All follow-up tasks', '全部交接任務', ''], ['All teams', '全部團隊', ''], ['Mine', '我的', ''], ['My department', '我的科別', ''], ['Adopted / started', '已採納／已開始', ''],
    ['Hand-off tasks from team conclusions', '團隊結論的交接任務', ''],
    ['Tasks are created when the chair locks a record. The owner (or that department) receives the task; treatment tasks are carried out by the doctor on duty through order entry, where the order keeps the MDT conclusion as its source. Recommendations become orders only after adoption.', '主席鎖定紀錄時產生任務；由負責人（或其科別）接收。治療類任務由主治從開立頁執行，醫囑保留 MDT 結論來源。建議經採納後才成為醫囑。', ''],
    ['Receive task', '接收任務', ''], ['Order per conclusion', '依結論開單', ''], ['Add further orders', '再開立醫囑', ''], ['Mark complete', '標記完成', ''], ['Completion evidence', '完成佐證', ''], ['Confirm done', '確認完成', ''],
    ['Could not carry out', '無法執行', ''], ['Reason', '原因', ''], ['Record reason', '記錄原因', ''], ['Re-propose (condition changed)', '病情變化再提案', ''], ['What has changed since the conclusion', '結論之後有什麼變化', ''], ['Create new proposal', '建立新提案', ''],
    ['Kind', '類型', ''], ['Owner', '負責人', ''], ['Due', '到期', ''], ['Orders', '醫囑', ''], ['Activity ({0})', '操作紀錄（{0}）', ''], ['No tasks match this filter.', '沒有符合篩選的任務。', ''],
    // ---- 儀表板 ----
    ['Live indicators', '即時指標', ''], ['Computed from the current demo state (all teams).', '由目前 demo 狀態即時計算（全部團隊）。', ''], ['Cases concluded (this demo state)', '已結論個案（目前狀態）', ''], ['Cases on agendas now', '目前議程個案', ''], ['Due tasks on time', '到期任務準時率', ''],
    ['Eight-week indicators', '八週指標', ''], ['Demo figures for illustration; a deployment computes them from meeting records and orders.', '示範數字僅供說明；正式部署時由會議紀錄與醫囑計算。', ''],
    ['Proposal to meeting, median', '提案到開會中位數', ''], ['Meeting to treatment start, median', '開會到開始治療中位數', ''], ['Target ≤ 7 days', '目標 ≤ 7 天', ''], ['Target ≤ 3 days', '目標 ≤ 3 天', ''], ['Target ≥ 85%', '目標 ≥ 85%', ''], ['Lowest: Nuclear Medicine', '最低：核醫科', ''], ['Decided not to convene', '決定不召開', ''], ['Reasons recorded for all', '皆有記錄原因', ''],
    ['Cases per week', '每週個案數', ''], ['By team', '依團隊', ''], ['Team', '團隊', ''], ['Discussed (8 wk)', '討論數（8 週）', ''], ['On time', '準時', ''], ['Overdue tasks now', '目前逾期任務', ''],
    ['Most often missing at the meeting', '開會時最常缺的資料', ''], ['Item', '項目', ''], ['Last 8 weeks (demo)', '近 8 週（示範）', ''], ['On agendas now (live)', '目前議程（即時）', ''],
    // ---- 個案標頭、摘要包 ----
    ['Proposal', '提案', ''], ['Discussion and conclusion', '討論與結論', ''], ['Chair confirmation', '主席確認', ''], ['Team · session', '團隊 · 會期', ''], ['Type', '類型', ''], ['Presenter', '報告人', ''], ['Source', '來源', ''], ['Proposed from the ward', '病房提出', ''],
    ['Case summary pack · 8 items read live from the record', '個案摘要包 · 8 項即時讀病歷', ''], ['complete', '齊備', ''], ['Open in the record', '到病歷查看', ''],
    ['Items are read from the record each time the page opens; the version submitted with the proposal and the version shown at the meeting are kept as snapshots.', '每次開啟都重新讀取病歷；提案送出與開會時的版本另存快照。', ''],
    ['History, allergies and current medications', '既往、過敏與現行用藥', ''], ['Comorbidities', '共病', ''], ['Allergies', '過敏', ''], ['Active medications', '現行用藥', ''], ['Family / contacts', '家屬／聯絡人', ''], ['Read live from the record', '即時讀自病歷', ''],
    ['Case data (outpatient)', '個案資料（門診）', ''], ['Outpatient case: data items were entered with the proposal; no inpatient record to read.', '門診個案：資料隨提案填入，沒有住院病歷可讀。', ''],
    ['Patient wishes and performance status', '病人意願與體能狀態', ''], ['ECOG performance status (0–4)', 'ECOG 體能狀態（0–4）', ''], ['Patient wishes and priorities (as discussed with the patient / family)', '病人意願與優先考量（與病人／家屬討論後填寫）', ''], ['Save', '儲存', ''], ['Not recorded', '未記錄', ''],
    ['Open discussion record', '開啟討論紀錄', ''], ['Enter discussion record', '進入討論紀錄', ''], ['Print pre-meeting pack', '列印會前資料', ''], ['Edit proposal', '編輯提案', ''],
    // ---- 紀錄 ----
    ['No record yet. The secretary or chair opens the record during the meeting.', '尚無紀錄。由秘書或主席在會議中開始紀錄。', ''],
    ['A. Attendance', 'A. 出席', ''], ['B.1 Data reviewed', 'B.1 檢視資料', ''], ['version frozen at the meeting', '開會時凍結的版本', ''], ['latest snapshot', '最新快照', ''], ['Content', '內容', ''], ['Source / time', '來源／時間', ''],
    ['B.2 Case summary and B.4 Conclusion', 'B.2 個案摘要與 B.4 結論', ''], ['B.2 Case summary (pre-filled from the record; edit as discussed)', 'B.2 個案摘要（由病歷帶入，依討論修改）', ''], ['B.4 Team conclusion and treatment recommendation', 'B.4 團隊結論與治療建議', ''],
    ['Consensus', '共識', ''], ['Unanimous', '一致', ''], ['Majority (dissenting view recorded)', '多數（記錄不同意見）', ''], ['Majority', '多數', ''], ['Dissenting view (if any)', '不同意見（如有）', ''], ['Save summary and conclusion', '儲存摘要與結論', ''],
    ['B.2 Case summary', 'B.2 個案摘要', ''], ['B.4 Team conclusion', 'B.4 團隊結論', ''],
    ['B.3 Opinions by specialty', 'B.3 各科意見', ''], ['each member confirms their own text; the secretary may enter text on a member’s behalf', '各成員確認自己的意見；秘書可代為輸入', ''], ['Confirmed by member', '本人已確認', ''], ['Entered · not confirmed', '已輸入 · 未確認', ''], ['No opinion yet', '尚無意見', ''], ['Opinion', '意見', ''], ['Save opinion', '儲存意見', ''], ['Confirm my opinion', '確認我的意見', ''],
    ['B.4 Action plan', 'B.4 處置計畫', ''], ['each row becomes a hand-off task when the chair locks the record', '主席鎖定後每一列成為一件交接任務', ''], ['Action', '處置', ''], ['Save action plan', '儲存處置計畫', ''], ['State', '狀態', ''],
    ['Conclusion entered', '已填結論', ''], ['At least one action in the plan', '處置計畫至少一項', ''], ['At least one opinion recorded', '至少一位成員意見', ''], ['All opinions confirmed', '所有意見已確認', ''],
    ['Print record', '列印紀錄', ''], ['Open a revision', '開啟修訂版', ''], ['Reason for revision', '修訂原因', ''], ['Print draft', '列印草稿', ''], ['Member view', '成員檢視', ''], ['Read-only', '唯讀', ''],
    ['Recommendations become orders only after adoption by the doctor on duty.', '建議經主治採納後才成為醫囑。', ''],
    // ---- 列印 ----
    ['Print preview', '列印預覽', ''], ['Print / save as PDF', '列印／存成 PDF', ''], ['Multidisciplinary team meeting record', '多專科團隊會議紀錄', ''], ['Case summary pack (pre-meeting)', '個案摘要包（會前）', ''], ['Multidisciplinary team meeting', '多專科團隊會議', ''],
    ['Appendix · Action plan and hand-off', '附錄 · 處置計畫與交接', ''], ['Team recommendations become orders only after adoption by the doctor on duty.', '團隊建議經主治採納後才成為醫囑。', ''],
    // ---- 提案 ----
    ['Propose to team meeting (MDT)', '排入團隊會議 MDT', ''], ['Proposal to the team meeting', '團隊會議提案', ''], ['Patient overview', '病人總覽', ''],
    ['The team is suggested from the principal diagnosis; the next session of that team is pre-selected. A proposal after the deadline is still accepted and flagged for the coordinator to confirm.', '依主診斷建議團隊，並預選該團隊的下一次會期。逾截止的提案仍可送出，標示給協調人確認。', ''],
    ['Team (suggested from the diagnosis)', '團隊（依診斷建議）', ''], ['Session', '會期', ''], ['Proposal type', '提案類型', ''], ['Urgency', '急迫程度', ''], ['Routine', '一般', ''], ['Urgent (next available session)', '急件（最近一次會期）', ''], ['Presenter at the meeting', '會議報告人', ''],
    ['Clinical question for the team', '要請團隊決定的臨床問題', ''], ['Reason for proposal', '提案理由', ''], ['Patient wishes and priorities (can be completed before the meeting)', '病人意願與優先考量（可在會前補填）', ''],
    ['Enable pre-meeting prefill by specialty for this case', '本案開啟會前各職類預填', ''], ['Submit to the agenda now (untick to save as a draft)', '立即送出排入議程（取消勾選則存為草稿）', ''], ['Save / submit proposal', '儲存／送出提案', ''], ['Create proposal', '建立提案', ''],
    ['Data readiness for the summary pack', '摘要包資料齊備', ''], ['available now · missing items do not block the proposal; the pack is read live', '目前可用 · 缺項不阻擋提案；摘要包即時讀取', ''], ['Previous team conclusions for this patient', '這位病人先前的團隊結論', ''],
    ['Only doctors caring for this patient can propose a case to a team meeting.', '只有照護這位病人的醫師能提案。', ''], ['No upcoming session', '沒有即將到來的會期', ''],
    // ---- EMR 入口 ----
    ['Team meeting (MDT)', '團隊會議 MDT', ''], ['Not proposed', '尚未提案', ''], ['Complete and submit proposal', '補完並送出提案', ''], ['Propose again', '再次提案', ''], ['Last conclusion', '最近結論', ''],
    ['Open MDT proposal draft', '開啟 MDT 提案草稿', ''], ['Open MDT case', '開啟 MDT 個案', ''], ['Propose to MDT', '排入 MDT', ''], ['Team meeting (MDT) items', '團隊會議 MDT 事項', ''], ['No MDT items for you right now.', '目前沒有您的 MDT 事項。', ''],
    ['Task', '任務', ''], ['Reply attendance:', '回覆出席：', ''],
    // ---- 開立：BSA ----
    ['Per m² (BSA)', '每 m²（體表面積）', ''], ['Per m²', '每 m²', ''], ['Per kg', '每公斤', ''], ['Enter the per-m² dose', '請輸入每 m² 劑量', ''], ['Per-m² dose', '每 m² 劑量', ''], ['Dose entry', '劑量輸入', ''], ['Absolute dose', '絕對劑量', ''], ['Per kg per dose', '每公斤每次', ''], ['Per kg per day', '每公斤每日', ''],
    // ---- P3：六個固定用詞與分頁 ----
    ['Specialist consult', '專科照會', ''], ['Allied-health consult', '職類照會', ''], ['Team overview', '團隊總覽', ''], ['Multi-physician consultation', '院內會診', ''], ['Case conference', '個案跨團隊會議', ''], ['Family meeting', '家庭會議', ''], ['Case meetings', '個案會議', ''], ['No meeting for now', '暫不召開', ''],
    ['Request allied-health consult', '開立職類照會', ''], ['Discipline replies', '職類回覆', ''], ['Decision to convene', '召開判斷', ''], ['Task tracking', '任務追蹤', ''],
    // 職類照會
    ['Allied-health consults this admission', '本次住院的職類照會', ''], ['Sent', '已送出', ''], ['Drafting', '填寫中', ''], ['Replied', '已回覆', ''], ['Consult form', '照會單', ''], ['Discipline', '職類', ''], ['Reason for consult (summary)', '照會原因（摘要）', ''], ['Reply due', '回覆期限', ''],
    ['Awaiting reply', '待回覆', ''], ['In progress', '處理中', ''], ['Closed', '已結案', ''], ['Acknowledged', '已知悉', ''], ['Not adopted', '不採納', ''],
    ['Template', '範本', ''], ['Urgency', '急迫程度', ''], ['Assignment (template setting)', '派案（範本設定）', ''], ['Consult content', '照會內容', ''], ['items come from the template; the hospital edits them in Consult form settings', '項目來自範本，院方在「照會表單」維護', ''],
    ['Filled in automatically', '系統自動帶入', ''], ['read-only, with source and time', '唯讀，附來源與時間', ''], ['Clinical summary (filled in by the system, editable)', '臨床摘要（系統帶入，可修改）', ''], ['Requester’s contact number (required)', '照會醫師聯絡分機（必填）', ''], ['Expected reply', '預計回覆', ''],
    ['Send consult now (untick to save a draft)', '立即送出照會（取消勾選則存草稿）', ''], ['Add a question', '追加問題', ''], ['Additional question', '追加的問題', ''], ['Add question', '追加', ''], ['Pick up', '接案', ''], ['Interim note and flags', '初評與註記', ''], ['Interim note', '初評', ''], ['Save interim note', '儲存初評', ''], ['Sign and send now (untick to save a draft)', '立即簽名送出（取消勾選則存草稿）', ''],
    ['Record decision of doctor on duty', '記錄主治決定', ''], ['Decision', '決定', ''], ['Adopt (then order with the consult as source)', '採納（再以此照會為來源開單）', ''], ['Acknowledge', '知悉', ''], ['Do not adopt (reason required)', '不採納（需填原因）', ''], ['Decision note', '決定說明', ''], ['Record decision', '記錄決定', ''], ['Order per recommendation', '依建議開單', ''], ['Attending confirmation pending', '待主治確認', ''], ['Attending confirmation: after the full reply', '主治確認：完整回覆後', ''],
    ['Three kinds of consultation', '三種照會會診', ''], ['Kind', '種類', ''], ['Description', '說明', ''],
    ['Team overview · cross-team consult platform', '團隊總覽 · 跨團隊照會平台', ''], ['Meeting prompt met', '召開提示成立', ''], ['Start case conference', '啟動個案跨團隊會議', ''], ['Decide later (record a reason)', '稍後決定（記錄原因）', ''], ['Answered', '已回覆', ''], ['Awaiting attending confirmation', '待主治確認', ''], ['ISBAR lookup', 'ISBAR 查詢', ''], ['AI team summary (roadmap)', 'AI 團隊摘要（roadmap）', ''],
    ['Timeline', '時間軸', ''], ['Other collaboration for this patient', '這位病人的其他協作', ''], ['Standing-team agenda', '常設團隊議程', ''], ['Not on agenda', '未排入議程', ''], ['None yet', '尚無', ''], ['None', '無', ''],
    ['consult worklist', '照會工作清單', ''], ['To pick up', '待接案', ''], ['Follow-up', '追蹤', ''], ['Reply', '回覆', ''], ['reply form', '回覆表單', ''], ['Patient overview', '病人總覽', ''],
    // 個案會議
    ['Requested or scheduled', '申請中或已排定', ''], ['Records awaiting chair confirmation', '待主席確認的紀錄', ''], ['Concluded or completed', '已結論或已完成', ''], ['Multi-physician consultations', '院內會診', ''],
    ['Topic / reason', '主題／原因', ''], ['Level', '層級', ''], ['Time', '時間', ''], ['Location', '地點', ''], ['Pre-meeting materials', '會前資料', ''], ['Attending', '主治', ''], ['Request', '申請', ''], ['Decision record', '決定紀錄', ''],
    ['Meeting records to review', '待確認的會議紀錄', ''], ['Meeting prompt', '召開提示', ''], ['Awaiting the attending’s decision', '待主治決定', ''], ['Decide', '判斷', ''],
    ['Within-department', '科內', ''], ['Inter-department', '跨科', ''], ['Hospital-wide', '全院', ''], ['Inter-hospital', '跨院', ''], ['On-call', '值班', ''],
    ['Awaiting Head of Department approval', '待科主任核准', ''], ['Approved · to be scheduled', '已核准 · 待排程', ''], ['Record awaiting chair confirmation', '紀錄待主席確認', ''], ['Draft', '草稿', ''],
    ['Hold a meeting — fill in the details below and send to the Head of Department for approval', '召開會議 — 填寫下方會議細節，送科主任核准', ''], ['No meeting for now — a reason is required; it is saved as a decision record and appears in the case meetings list', '暫不召開 — 需填原因；存成決定紀錄並列在個案會議清單', ''],
    ['Reason for not meeting (if “no meeting for now”)', '不召開的原因（選「暫不召開」時）', ''], ['Other reason (specify)', '其他原因（請說明）', ''], ['Meeting details', '會議細節', ''], ['Meeting topic', '會議主題', ''], ['Proposed date', '建議日期', ''], ['Fixed time slot', '固定時段', ''],
    ['Follow with a family meeting (separate record, scheduled automatically once the record is locked)', '接續家庭會議（另立紀錄，紀錄鎖定後自動排程）', ''], ['Reason for meeting', '召開原因', ''], ['Meeting goals', '會議目標', ''], ['Discussion categories', '討論類別', ''], ['Consultation questions (one per line)', '會診問題（每行一題）', ''], ['Participants', '與會人員', ''], ['Discipline / role', '職類／角色', ''], ['Name', '姓名', ''],
    ['Add participants (hold Ctrl / ⌘ to select several)', '加入與會人員（按住 Ctrl／⌘ 可多選）', ''], ['Level (determined by the system from the rules table)', '層級（系統依規則表判定）', ''], ['View rules table', '看規則表', ''], ['Clinical departments involved', '涉及的臨床科別', ''], ['Approval', '核准', ''], ['Organising and scheduling', '組織與排程', ''], ['Planning office', '企劃室', ''], ['After sending', '送出後', ''],
    ['Send request (Head of Department approval) / record decision', '送出申請（科主任核准）／記錄決定', ''],
    ['Head of Department approval', '科主任核准', ''], ['Approve the request', '核准申請', ''], ['Scheduling and invitations', '排程與邀請', ''], ['Meeting date and time', '會議日期時間', ''], ['Confirm time and send invitations', '確認時間並送出邀請', ''],
    ['Case conference record', '個案跨團隊會議紀錄', ''], ['Multi-physician consultation record', '院內會診紀錄', ''], ['A. Meeting details', 'A. 會議資料', ''], ['Present', '出席', ''], ['Signature', '簽名', ''], ['B.1 Case summary', 'B.1 個案摘要', ''], ['read-only citation', '唯讀引用', ''], ['B.2 Consultation questions', 'B.2 會診問題', ''], ['B.3 Opinions by department', 'B.3 各科意見', ''], ['B.4 Conclusion', 'B.4 結論', ''],
    ['Appendix · Action plan', '附錄 · 處置計畫', ''], ['Content', '內容', ''], ['Deadline', '期限', ''], ['Signatures and version', '簽名與版本', ''], ['Send to chair for confirmation', '送主席確認', ''], ['Back to case meetings', '回個案會議清單', ''], ['Attending’s decision', '主治決定', ''], ['Attending’s decisions', '主治決定', ''], ['Conclusion item', '結論項目', ''], ['To decide', '待決定', ''], ['Order', '醫囑', ''],
    ['Confirm brought-in reply', '確認帶入的回覆', ''], ['Brought in', '帶入', ''], ['Signed', '已簽名', ''], ['To confirm', '待確認', ''],
    // 家庭會議
    ['Family meeting record', '家庭會議紀錄', ''], ['Time and place', '時間地點', ''], ['Follows', '接續', ''], ['Filing', '歸檔', ''], ['Role', '角色', ''], ['Relationship / discipline', '關係／職類', ''], ['Points explained', '說明事項', ''], ['Views of patient and family', '病人與家屬意見', ''], ['Consensus and decisions', '共識與決定', ''], ['Open items and follow-up tasks', '待辦與追蹤', ''], ['Item', '事項', ''],
    ['Meeting ended at (HH:MM)', '會議結束時間（HH:MM）', ''], ['Save family meeting record', '儲存家庭會議紀錄', ''], ['Requirement', '要求', ''], ['Method', '方式', ''], ['Required', '必簽', ''], ['Optional', '選簽', ''], ['Sign (e-signature)', '簽名（電子簽章）', ''], ['Sign', '簽名', ''], ['Record confirmation (SMS code)', '記錄確認（簡訊驗證碼）', ''], ['Record signature (pad)', '記錄簽名（手寫板）', ''], ['Pending', '待簽', ''], ['Not signed', '未簽', ''], ['Save the record first', '請先儲存紀錄', ''], ['Completed', '已完成', ''],
    ['Family representative', '家屬代表', ''], ['Main carer', '主要照顧者', ''], ['Patient', '病人', ''], ['Records', '紀錄', ''], ['Family', '家屬', ''], ['Interpreter', '通譯', ''], ['Video', '視訊', ''],
    // 會前預填
    ['Pre-meeting input by discipline', '會前各職類預填', ''], ['Pre-meeting input', '會前預填', ''], ['Pre-meeting input (optional)', '會前預填（可選）', ''], ['Optional feature · on for this case', '可選功能 · 本案開啟', ''], ['Invited', '已邀請', ''], ['Deadline', '截止', ''], ['Visibility', '可見範圍', ''], ['Other disciplines’ pre-fills visible only after sending your own', '送出自己的預填後才看得到他科', ''],
    ['Remind those who have not filled in', '提醒尚未填寫者', ''], ['My pre-fill', '我的預填', ''], ['Edit my pre-fill', '修改我的預填', ''], ['Continue my draft', '繼續我的草稿', ''], ['Print pre-meeting materials', '列印會前資料', ''], ['Go to discussion record', '進入討論紀錄', ''],
    ['Invited disciplines', '邀請職類', ''], ['Not filled', '未填', ''], ['For discussion in the meeting', '會中待討論', ''], ['Proposal questions · pre-meeting positions', '提案問題 · 會前立場', ''], ['the system only counts; it draws no conclusion', '系統只計數，不下結論', ''], ['Pre-fill summary', '預填總表', ''], ['by discipline', '依職類', ''], ['Discipline · member', '職類 · 成員', ''], ['Key points from own discipline', '本科重點', ''], ['Pre-fill rules', '預填規則', ''],
    ['1 · Own-discipline assessment', '1 · 本科評估', ''], ['Assessment', '評估', ''], ['Agrees with the proposed stage?', '同意提案的分期？', ''], ['2 · Opinion on the proposal questions', '2 · 對提案問題的意見', ''], ['Give an opinion', '表達意見', ''], ['Outside own field, no view', '非本科範圍，無意見', ''], ['3 · Recommended additional tests', '3 · 建議補做的檢查', ''], ['Tests', '檢查', ''], ['4 · For discussion in the meeting', '4 · 會中待討論', ''], ['Points to raise', '要提出的點', ''], ['Send pre-fill now (untick to save as a draft)', '立即送出預填（取消勾選則存草稿）', ''],
    ['Proposal details', '提案資料', ''], ['Invited by', '邀請人', ''], ['Cited from summary pack', '引用自摘要包', ''], ['Other disciplines’ pre-fills', '他科預填', ''], ['Pre-filled', '已預填', ''], ['Confirm pre-fill', '確認預填', ''], ['Edited in meeting', '會中修改', ''], ['Sent · late', '已送出 · 逾時', ''],
    ['B.2 Consultation questions and pre-meeting positions', 'B.2 會診問題與會前立場', ''], ['pre-meeting input page', '會前預填頁', ''],
    // 設定
    ['Consult forms', '照會表單', ''], ['Levels & signatures', '會診層級與簽章', ''], ['Consultation level rules', '會診層級規則', ''], ['Criterion', '判準', ''], ['Proposal', '提出', ''], ['Secretary', '秘書', ''], ['Case conference settings', '個案會議設定', ''], ['Setting', '設定', ''], ['Value', '內容', ''], ['Signature settings (by document)', '簽章設定（依文件）', ''], ['Document', '文件', ''], ['Who signs', '簽名者', ''], ['Basis', '依據', ''],
    ['Replying unit', '回覆單位', ''], ['Assignment', '派案', ''], ['Filing and signature', '歸檔與簽章', ''], ['Regulatory note', '法規註記', ''], ['Request form fields', '照會單欄位', ''], ['Reply form fields', '回覆表單欄位', ''], ['Version', '版本', ''], ['Published', '已發布', ''], ['Approved', '核准', ''], ['Explanation', '說明', ''], ['Default filing and signature by discipline', '各職類預設歸檔與簽章', ''], ['Label', '欄位', ''], ['Type', '型別', ''], ['No.', '序', ''], ['Auto-fill source', '自動帶入來源', ''],
    ['Roadmap · not in this release', 'Roadmap · 本版不做', ''], ['AI-assisted drafts', 'AI 輔助草稿', ''], ['Remote and inter-hospital MDT', '遠距與跨院 MDT', ''], ['Automatic enrolment and PACS images', '自動排入與 PACS 影像', ''], ['Roadmap', 'Roadmap', ''],
    // ---- P4：回饋面板與導覽 ----
    ['Feedback', '回饋', ''], ['Page feedback', '本頁回饋', ''], ['Fits our workflow', '符合', ''], ['Needs change', '要改', ''], ['Not needed', '不需要', ''], ['Save for this page', '儲存本頁回饋', ''], ['All feedback', '全部回饋', ''],
    ['Stored only in this browser; export or copy to send it back. Each page keeps one verdict (saving again replaces it).', '只存在這台瀏覽器；匯出或複製後寄回。每一頁保留一個判斷（再存會覆蓋）。', ''], ['Saved for this page.', '本頁回饋已儲存。', ''],
    ['Export JSON', '匯出 JSON', ''], ['Export CSV', '匯出 CSV', ''], ['Copy as text', '複製文字', ''], ['Back', '返回', ''], ['Clear all', '全部清除', ''], ['Remove', '移除', ''], ['Page', '頁面', ''], ['Verdict', '判斷', ''], ['Note', '意見', ''],
    ['No feedback saved yet. Use the three buttons on any page.', '還沒有回饋；在任何一頁用三顆按鈕留下判斷。', ''], ['Send the exported file (or the copied text) back to us; it contains only your verdicts and notes, no patient data.', '把匯出的檔案（或複製的文字）寄回給我們；內容只有您的判斷與意見，沒有病人資料。', ''],
    ['What should change, and why? (optional)', '要改什麼、為什麼？（選填）', ''], ['Clear all saved feedback in this browser?', '清除這台瀏覽器的全部回饋？', ''],
    // ---- P4.1（2026-11-11）：導覽修訂、示範控制按鈕完整字串（避免逐字拆譯成「第 conference 案」）----
    ['Back to start', '回到起點', ''], ['Dock panel', '面板歸位', ''], ['Drag to move', '拖曳可移動', ''], ['⠿ Guided tour', '⠿ 導覽模式', ''],
    ['MDT meeting · 11-04 14:00', 'MDT 會議 · 11-04 14:00', ''], ['Case conference · 11-05 07:50', '個案會議 · 11-05 07:50', ''], ['Family meeting · 11-05 13:30', '家庭會議 · 11-05 13:30', ''], ['Treatment day · 11-06 09:30', '治療日 · 11-06 09:30', ''],
    ['Receive echo report (LVEF 60%) · 11-05 08:50', '收到心臟超音波報告（LVEF 60%）· 11-05 08:50', ''], ['Echo report received (LVEF 60%)', '心臟超音波報告已收到（LVEF 60%）', ''],
    ['each row becomes a hand-off task when the chair locks the record · rows suggested from the pre-fills; edit or clear them freely', '主席鎖定紀錄時每一列成為交接任務 · 各列依預填先建議，可自行修改或清空', ''],
    ['Confirm and lock record v{0}', '確認並鎖定紀錄 v{0}', ''], ['{0} opinion(s) not yet confirmed by the member (warning only)', '{0} 位成員的意見尚未由本人確認（僅提醒）', ''], ['Create v{0} draft', '建立 v{0} 草稿', ''],
    ['All patients, staff and data in this demo are fictitious. MDT write actions in this demo are for demonstration only and are not part of the phase 1 scope.', '本示範的病人、人員與資料全部虛構。MDT 寫入功能僅供示範，不代表一期交付範圍。', ''],
    ['Guided tour', '導覽模式', ''], ['Switch to', '切換身分', ''], ['Previous step', '上一步', ''], ['Next step', '下一步', ''], ['Go to this step', '前往這一步', ''], ['Guide (one page)', '一頁操作說明', ''], ['Restart demo data', '重置示範資料', ''],
    ['Clear this browser’s demo changes and start over? Feedback notes are kept.', '清除這台瀏覽器的示範變更並重來？回饋會保留。', '']
  ];
  const seen = new Set(dict.entries.map(e => e[0]));
  for (const row of add) if (!seen.has(row[0])) { dict.entries.push(row); seen.add(row[0]); }
})(globalThis);
