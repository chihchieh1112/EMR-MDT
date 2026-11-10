/* 維護檔表定義（2026-10-18）：store 的 masterSave／masterRemove、maintenance.js 的表單與驗證器都讀這一份。
   每表宣告欄位型別與限制；B 目錄來源欄不在這裡（唯讀，不可寫）。表名與欄名對照 G9，見各表 g9 註記。 */
(function (root) {
  'use strict';
  const KINDS = ['medication', 'service', 'supply', 'diet'];
  const AUDIT = ['createdBy', 'createdAt', 'updatedBy', 'updatedAt'];
  // 代碼表（2026-10-24，B3）：一份 B 目錄代碼表一列，鍵是目錄種類；快照版本、來源檔、筆數、雜湊由匯入產生（唯讀），這裡只登錄它對應的衛生部或國際標準。
  const CODE_SYSTEMS = [['icd', 'ICD-10 diagnoses'], ['route', 'Routes of administration'], ['unit', 'Units of measure'], ['service', 'Services, labs & exams'], ['supply', 'Medical supplies'], ['diet', 'Diet orders'], ['medication', 'Medications'], ['treatment-result', 'Treatment results']];
  const PUBLISHERS = [['UNCONFIRMED', 'Unconfirmed'], ['BYT', 'Ministry of Health shared code set'], ['INTL', 'International standard'], ['LOCAL', 'Hospital-defined']];
  function codeSystemCheck(out, must) { must(!['BYT', 'INTL'].includes(out.publisher) || out.standard_ref, 'Code system version: enter the standard reference for a Ministry of Health or international code set'); }
  // 臨床選項（2026-10-24）：院內自訂的選單，先放兒科病歷出生與成長史四組；之後院方 B 目錄沒有、需要自建的選項也放這張（G9 clinical_option）。
  const CLINICAL_VALUE_SETS = [['birth_method', 'Birth method'], ['feeding_method', 'Feeding'], ['childcare_setting', 'Childcare'], ['vaccine', 'Vaccines received'], ['procedure_type', 'Procedure type'], ['patient_flag', 'Special marker']];
  // 初始選項照衛生部兒科病歷範本的常見寫法，待院方確認；院方可在字典改名、排序或停用。[代碼, 組, 英, 越, 中]
  const CLINICAL_OPTION_SEED = [
    ['BM_VAGINAL', 'birth_method', 'Vaginal delivery', 'Đẻ thường', '自然產'],
    ['BM_CESAREAN', 'birth_method', 'Caesarean section', 'Đẻ mổ', '剖腹產'],
    ['BM_INDUCED', 'birth_method', 'Induced labour', 'Đẻ chỉ huy', '引產／催生'],
    ['BM_INSTRUMENTAL', 'birth_method', 'Instrument-assisted (forceps / vacuum)', 'Can thiệp thủ thuật (forceps / giác hút)', '器械助產（產鉗、真空吸引）'],
    ['BM_OTHER', 'birth_method', 'Other', 'Khác', '其他'],
    ['BM_UNKNOWN', 'birth_method', 'Unknown', 'Không rõ', '不詳'],
    ['FD_BREAST', 'feeding_method', 'Breast milk', 'Sữa mẹ', '母乳'],
    ['FD_FORMULA', 'feeding_method', 'Formula (artificial feeding)', 'Nuôi nhân tạo', '人工餵養（配方奶）'],
    ['FD_MIXED', 'feeding_method', 'Mixed', 'Hỗn hợp', '混合'],
    ['CC_HOME', 'childcare_setting', 'At home', 'Tại nhà', '在家'],
    ['CC_DAYCARE', 'childcare_setting', 'Nursery / kindergarten', 'Nhà trẻ / mẫu giáo', '托嬰中心／幼兒園'],
    ['CC_OTHER', 'childcare_setting', 'Other', 'Khác', '其他'],
    ['VX_BCG', 'vaccine', 'Tuberculosis (BCG)', 'Lao (BCG)', '結核（BCG）'],
    ['VX_POLIO', 'vaccine', 'Polio', 'Bại liệt', '小兒麻痺'],
    ['VX_MEASLES', 'vaccine', 'Measles', 'Sởi', '麻疹'],
    ['VX_PERTUSSIS', 'vaccine', 'Pertussis', 'Ho gà', '百日咳'],
    ['VX_TETANUS', 'vaccine', 'Tetanus', 'Uốn ván', '破傷風'],
    ['VX_DIPHTHERIA', 'vaccine', 'Diphtheria', 'Bạch hầu', '白喉'],
    // 2026-11-01 擴大免疫計畫疫苗與兒科 ICU 常見床邊處置：第 6 欄是排序，排在原有選項之間；已在用的選項組不回補（院方維護的清單為準），新安裝才有。
    ['VX_HEPB', 'vaccine', 'Hepatitis B', 'Viêm gan B', 'B 型肝炎', 181],
    ['VX_HIB', 'vaccine', 'Haemophilus influenzae type b (Hib)', 'Hib (Haemophilus influenzae týp b)', 'b 型嗜血桿菌（Hib）', 182],
    ['VX_JE', 'vaccine', 'Japanese encephalitis', 'Viêm não Nhật Bản', '日本腦炎', 183],
    ['VX_RUBELLA', 'vaccine', 'Rubella', 'Rubella', '德國麻疹', 184],
    ['VX_ROTA', 'vaccine', 'Rotavirus', 'Tiêu chảy do Rota virus', '輪狀病毒', 185],
    // 處置紀錄（Procedure Note）的處置類型（2026-10-25）：ICU 床邊常見處置，待院方確認；PROC_ETT 會打開插管兩格，PROC_OTHER 要自行輸入。
    ['PROC_ETT', 'procedure_type', 'Endotracheal intubation', 'Đặt nội khí quản', '氣管插管'],
    ['PROC_CVC', 'procedure_type', 'Central venous catheter insertion', 'Đặt catheter tĩnh mạch trung tâm', '中心靜脈導管置入'],
    ['PROC_ART', 'procedure_type', 'Arterial line insertion', 'Đặt catheter động mạch', '動脈導管置入'],
    ['PROC_CHEST_TUBE', 'procedure_type', 'Chest tube insertion', 'Đặt dẫn lưu màng phổi', '胸管置入'],
    ['PROC_THORACENTESIS', 'procedure_type', 'Thoracentesis', 'Chọc hút dịch màng phổi', '胸腔穿刺'],
    ['PROC_PARACENTESIS', 'procedure_type', 'Paracentesis', 'Chọc hút dịch màng bụng', '腹腔穿刺'],
    ['PROC_LP', 'procedure_type', 'Lumbar puncture', 'Chọc dò tủy sống', '腰椎穿刺'],
    ['PROC_PERICARDIO', 'procedure_type', 'Pericardiocentesis', 'Chọc hút dịch màng ngoài tim', '心包膜穿刺'],
    ['PROC_BRONCHOSCOPY', 'procedure_type', 'Bronchoscopy', 'Nội soi phế quản', '支氣管鏡檢查'],
    ['PROC_EXTUBATION', 'procedure_type', 'Extubation', 'Rút nội khí quản', '拔除氣管內管'],
    ['PROC_ECMO', 'procedure_type', 'ECMO cannulation', 'Đặt ống ECMO', 'ECMO 置管', 331],
    ['PROC_DIALYSIS_CATH', 'procedure_type', 'Dialysis / CRRT catheter insertion', 'Đặt catheter lọc máu', '血液透析／CRRT 導管置入', 332],
    ['PROC_PD_CATH', 'procedure_type', 'Peritoneal dialysis catheter insertion', 'Đặt catheter lọc màng bụng', '腹膜透析導管置入', 333],
    ['PROC_IO', 'procedure_type', 'Intraosseous access', 'Đặt kim truyền trong xương', '骨內針置入', 334],
    ['PROC_BMA', 'procedure_type', 'Bone marrow aspiration', 'Chọc hút tủy xương', '骨髓穿刺', 335],
    ['PROC_CARDIOVERSION', 'procedure_type', 'Cardioversion / defibrillation', 'Sốc điện chuyển nhịp / phá rung', '心臟整流／去顫電擊', 336],
    ['PROC_OTHER', 'procedure_type', 'Other', 'Khác', '其他'],
    // 特殊註記（2026-10-31）：我方自己的資料（HIS 沒有這個欄位），每筆有開始與結束；過敏另有結構，不放這裡。管路、呼吸器、隔離預設在置頂列顯示第 N 天；DNR 只有醫師能新增與撤銷。
    ['ISO', 'patient_flag', 'Contact isolation', 'Cách ly tiếp xúc', '接觸隔離'],
    ['DNR', 'patient_flag', 'DNR', 'Không hồi sinh tim phổi (DNR)', 'DNR 不施行心肺復甦'],
    ['FALL', 'patient_flag', 'High fall risk', 'Nguy cơ té ngã cao', '高跌倒風險'],
    ['LINE', 'patient_flag', 'Central line', 'Đường truyền tĩnh mạch trung tâm', '中心導管'],
    ['VENT', 'patient_flag', 'Ventilator', 'Thở máy', '呼吸器'],
    ['RESTRICT', 'patient_flag', 'Fluid restriction', 'Hạn chế dịch', '限水']];
  // ---- 可選清單（2026-11-08）：能選的欄位一律用下拉，不自由輸入 ----
  // FHIR TimingAbbreviation（Timing.code）與 EventTiming（Timing.repeat.when）。
  const TIMING_CODES = [['QD', 'QD · Daily'], ['BID', 'BID · Twice daily'], ['TID', 'TID · Three times daily'], ['QID', 'QID · Four times daily'], ['AM', 'AM · Every morning'], ['PM', 'PM · Every afternoon'], ['QOD', 'QOD · Every other day'],
    ['Q1H', 'Q1H · Every hour'], ['Q2H', 'Q2H · Every 2 hours'], ['Q3H', 'Q3H · Every 3 hours'], ['Q4H', 'Q4H · Every 4 hours'], ['Q6H', 'Q6H · Every 6 hours'], ['Q8H', 'Q8H · Every 8 hours'], ['BED', 'BED · At bedtime'], ['WK', 'WK · Weekly'], ['MO', 'MO · Monthly']];
  const EVENT_TIMING = [['WAKE', 'WAKE · After waking'], ['MORN', 'MORN · Morning'], ['NOON', 'NOON · Noon'], ['AFT', 'AFT · Afternoon'], ['EVE', 'EVE · Evening'], ['NIGHT', 'NIGHT · Night'], ['HS', 'HS · Before sleep'],
    ['C', 'C · With a meal'], ['CM', 'CM · With breakfast'], ['CD', 'CD · With lunch'], ['CV', 'CV · With dinner'], ['AC', 'AC · Before a meal'], ['ACM', 'ACM · Before breakfast'], ['ACD', 'ACD · Before lunch'], ['ACV', 'ACV · Before dinner'],
    ['PC', 'PC · After a meal'], ['PCM', 'PCM · After breakfast'], ['PCD', 'PCD · After lunch'], ['PCV', 'PCV · After dinner']];
  // 常用 SNOMED CT 給藥途徑碼（FHIR SNOMED CT Route Codes）；院方要用清單外的碼再加列。
  const SNOMED_ROUTES = [['26643006', '26643006 · Oral'], ['37839007', '37839007 · Sublingual'], ['54471007', '54471007 · Buccal'], ['127492001', '127492001 · Nasogastric'], ['47625008', '47625008 · Intravenous'],
    ['78421000', '78421000 · Intramuscular'], ['34206005', '34206005 · Subcutaneous'], ['60213007', '60213007 · Intraosseous'], ['72607000', '72607000 · Intrathecal'], ['404820008', '404820008 · Epidural'],
    ['447694001', '447694001 · Respiratory tract'], ['46713006', '46713006 · Nasal'], ['54485002', '54485002 · Ophthalmic'], ['10547007', '10547007 · Otic'], ['6064005', '6064005 · Topical'], ['45890007', '45890007 · Transdermal'],
    ['37161004', '37161004 · Rectal'], ['16857009', '16857009 · Vaginal']];
  // 常用 UCUM 單位：可量測單位用 UCUM 本碼，計數單位用大括號註記。
  const UCUM_UNITS = [['mg', 'mg'], ['ug', 'ug (microgram)'], ['g', 'g'], ['kg', 'kg'], ['mL', 'mL'], ['L', 'L'], ['[iU]', '[iU] (international unit)'], ['U', 'U (unit)'], ['meq', 'meq'], ['mmol', 'mmol'],
    ['{ampule}', '{ampule}'], ['{vial}', '{vial}'], ['{tablet}', '{tablet}'], ['{capsule}', '{capsule}'], ['{bottle}', '{bottle}'], ['{bag}', '{bag}'], ['{sachet}', '{sachet}'], ['{tube}', '{tube}'], ['{drop}', '{drop}'], ['{puff}', '{puff}'],
    ['{patch}', '{patch}'], ['{suppository}', '{suppository}'], ['{dose}', '{dose}'], ['{pack}', '{pack}']];
  const tables = {
    // 科常用：一部門一列，list 的順序就是 sort_order。寫入權限：管理者或該部門的部門管理員。
    deptFavorite: {label: 'Department favorites', g9: 'catalog_favorite (scope=DEPARTMENT, owner_org_id, catalog_key, sort_order)', keyed: true, guard: 'deptAdmin',
      fields: [{name: 'list', label: 'Items', type: 'keys', kinds: KINDS, max: 100}]},
    // 流程表項目（2026-10-31）：部門管理員勾選本科護理流程表要記錄的項目與順序；項目庫在 flowsheet.js。
    deptFlowsheet: {label: 'Department flowsheet items', g9: 'flowsheet_template (department_code, item_key, sort_order)', keyed: true, guard: 'deptAdmin',
      fields: [{name: 'items', label: 'Items', type: 'text'}]},

    // ---- 藥品維護檔（2026-10-18 精簡；2026-11-08 明細改成一頁六段）：只留開立與用藥安全會讀的欄位；調劑、藥袋、儲位、外觀屬 FPT HIS 藥局，不在這裡 ----
    // 開立設定：預設值、上限、小數位、管灌／剝半限制；ATC 覆寫三欄在「屬性」頁籤顯示，同一列存。
    medicationKnowledge: {label: 'Prescribing settings', g9: 'medication_knowledge', keyed: true, parentKind: 'medication', guard: 'admin', check: knowledgeCheck, fields: [
      // 預設途徑、頻率、醫囑單位（2026-10-23）：只能從字典選，選項見 fieldChoices。
      {name: 'default_route_code', label: 'Default route', type: 'catalogKey', kind: 'route'},
      {name: 'default_frequency_code', label: 'Default frequency', type: 'frequency'},
      {name: 'order_unit_code', label: 'Order unit', type: 'unit'},
      {name: 'decimal_places', label: 'Decimal places', type: 'number', min: 0, max: 3, integer: true},
      {name: 'max_single_dose', label: 'Max single dose', type: 'number', min: 0},
      {name: 'max_daily_dose', label: 'Max daily dose', type: 'number', min: 0},
      {name: 'no_crush', label: 'Do not crush', type: 'bool'},
      {name: 'no_split', label: 'Do not split', type: 'bool'},
      {name: 'no_tube', label: 'Not for tube administration', type: 'bool'},
      {name: 'atc_code', label: 'ATC code (fills a blank in HIS)', type: 'atc', max: 8},
      {name: 'atc_source', label: 'ATC source', type: 'enum', options: [['HIS', 'HIS value'], ['LOCAL', 'Local override']]},
      {name: 'atc_note', label: 'ATC note', type: 'text'},
      {name: 'effective_from', label: 'Effective from', type: 'date'},
      {name: 'effective_to', label: 'Effective to', type: 'date'}]},
    // 每公斤劑量上限（2026-10-18）：一列＝一個體重（可再加年齡）區間；下限含、上限不含。上限＝每公斤值 × 病人最新體重，再以絕對上限封頂；
    // 多列同時符合時每列都檢核（等於取最嚴）。FHIR：MedicationKnowledge.indicationGuideline.dosingGuideline（patientCharacteristic weight／age ＋ dosage）。
    medicationWeightDose: {label: 'Per-kg dose limits', g9: 'medication_weight_dose (new; FHIR MedicationKnowledge.indicationGuideline.dosingGuideline)', keyed: false, parent: 'medication', guard: 'admin', check: weightDoseRowCheck, fields: [
      {name: 'medication', label: 'Medication', type: 'catalogKey', kind: 'medication', required: true},
      {name: 'weight_min_kg', label: 'Weight from (kg)', type: 'number', min: 0}, {name: 'weight_max_kg', label: 'Weight below (kg)', type: 'number', min: 0},
      {name: 'age_min', label: 'Age from', type: 'number', min: 0}, {name: 'age_max', label: 'Age below', type: 'number', min: 0},
      {name: 'age_unit', label: 'Age unit', type: 'enum', options: [['d', 'days'], ['mo', 'months'], ['a', 'years']]},
      {name: 'dose_unit_code', label: 'Dose unit', type: 'unit', units: 'measurable', required: true},
      {name: 'max_single_per_kg', label: 'Max single dose per kg', type: 'number', min: 0}, {name: 'max_daily_per_kg', label: 'Max daily dose per kg', type: 'number', min: 0},
      {name: 'absolute_max_single', label: 'Cap per dose', type: 'number', min: 0}, {name: 'absolute_max_daily', label: 'Cap per day', type: 'number', min: 0},
      {name: 'effective_from', label: 'Effective from', type: 'date'}, {name: 'effective_to', label: 'Effective to', type: 'date'}]},
    medicationDoseConversion: {label: 'Dose conversion', g9: 'medication_dose_conversion', keyed: false, parent: 'medication', guard: 'admin', unique: [['medication', 'order_unit_code', 'dispense_unit_code']], fields: [
      {name: 'medication', label: 'Medication', type: 'catalogKey', kind: 'medication', required: true},
      {name: 'order_unit_code', label: 'Order unit', type: 'unit', required: true}, {name: 'dispense_unit_code', label: 'Dispense unit', type: 'unit', required: true},
      {name: 'factor', label: 'Factor', type: 'number', required: true, min: 0.0001}]},
    // 開立規則：住院供應狀態（一藥一列）、醫令限制、醫囑注意事項。療程天數上限只放在供應狀態。
    medicationSupplyStatus: {label: 'Inpatient supply status', g9: 'medication_supply_status', keyed: true, parentKind: 'medication', guard: 'admin', fields: [
      {name: 'status', label: 'Status', type: 'enum', required: true, options: [['normal', 'Normal'], ['stopped', 'Stopped'], ['restricted', 'Restricted']]},
      {name: 'default_days', label: 'Default days', type: 'number', min: 0, integer: true}, {name: 'max_days', label: 'Max days per order', type: 'number', min: 0, integer: true},
      {name: 'message', label: 'Message to prescriber', type: 'text'},
      {name: 'effective_from', label: 'Effective from', type: 'date'}, {name: 'effective_to', label: 'Effective to', type: 'date'}]},
    medicationOrderRestriction: {label: 'Order restrictions', g9: 'medication_order_restriction', keyed: false, parent: 'medication', guard: 'admin', check: restrictionCheck, fields: [
      {name: 'medication', label: 'Medication', type: 'catalogKey', kind: 'medication', required: true},
      {name: 'restriction_type', label: 'Restriction', type: 'enum', required: true, options: [['role', 'Prescriber role'], ['department', 'Department'], ['specialty', 'Specialty'], ['approval', 'Requires approval'], ['indication', 'Indication required']]},
      {name: 'value', label: 'Value', type: 'text', required: true, max: 120, choicesBy: 'restriction_type'}, {name: 'message', label: 'Message to prescriber', type: 'text'},
      {name: 'effective_from', label: 'Effective from', type: 'date'}, {name: 'effective_to', label: 'Effective to', type: 'date'}]},
    medicationCaution: {label: 'Order notes', g9: 'medication_caution', keyed: false, parent: 'medication', guard: 'admin', fields: [
      {name: 'medication', label: 'Medication', type: 'catalogKey', kind: 'medication', required: true},
      {name: 'text', label: 'Text', type: 'text', required: true, max: 1000},
      {name: 'effective_from', label: 'Effective from', type: 'date', required: true}, {name: 'effective_to', label: 'Effective to', type: 'date'}]},
    // 屬性：開立會標示的四種；配藥端屬性（小兒 TPN、TPN 原料、專案申請）屬 HIS 藥局。
    // 2026-11-08 拿掉 A09 腎、A10 肝劑量調整：沒有配套的劑量表只是標籤（見 docs/reference/藥品維護欄位_標準對照.md）。
    medicationAttribute: {label: 'Attributes', g9: 'medication_attribute + attribute_type', keyed: false, parent: 'medication', guard: 'admin', unique: [['medication', 'attribute_code']], fields: [
      {name: 'medication', label: 'Medication', type: 'catalogKey', kind: 'medication', required: true},
      {name: 'attribute_code', label: 'Attribute', type: 'enum', required: true, options: [['A01', 'A01 Chemotherapy'], ['A04', 'A04 Restricted antibiotic'], ['A05', 'A05 Blood product'], ['A08', 'A08 High-alert medication']]},
      {name: 'note', label: 'Note', type: 'text'}]},
    medicationInteraction: {label: 'Interactions', g9: 'medication_interaction (drug pair)', keyed: false, parent: 'medication', guard: 'admin', unique: [['medication', 'interacting_medication']], check: (out, must) => must(out.medication !== out.interacting_medication, 'A drug cannot interact with itself; pick another drug'), fields: [
      {name: 'medication', label: 'Medication', type: 'catalogKey', kind: 'medication', required: true},
      {name: 'interacting_medication', label: 'Interacting medication', type: 'catalogKey', kind: 'medication', required: true, picker: true},
      {name: 'severity', label: 'Severity', type: 'enum', required: true, options: [['contraindicated', 'Contraindicated'], ['high', 'High'], ['moderate', 'Moderate'], ['low', 'Low']]},
      {name: 'category', label: 'Alert title', type: 'text', max: 60}, {name: 'description', label: 'Summary', type: 'text', required: true, max: 1000},
      {name: 'handling', label: 'Handling strategy', type: 'text', max: 1000}, {name: 'monitoring', label: 'Monitoring', type: 'text', max: 400}, {name: 'reference', label: 'Reference', type: 'text', max: 200}]},

    // ---- 字典：頻率（含住院服藥時間）、途徑、單位 ----
    frequency: {label: 'Frequency', g9: 'medication_frequency', keyed: true, idPattern: /^[A-Z0-9]{1,16}$/, guard: 'admin', fields: [
      {name: 'desc_en', label: 'Description (EN)', type: 'text', required: true, max: 120}, {name: 'desc_vi', label: 'Description (VI)', type: 'text', max: 120}, {name: 'desc_zh', label: 'Description (ZH)', type: 'text', max: 120},
      {name: 'fhir_timing_code', label: 'FHIR timing code', type: 'text', max: 8, choices: TIMING_CODES},
      {name: 'timing_frequency', label: 'Times', type: 'number', min: 1, integer: true}, {name: 'timing_period', label: 'Per period', type: 'number', min: 0},
      {name: 'timing_period_unit', label: 'Period unit', type: 'enum', options: [['min', 'min'], ['h', 'h'], ['d', 'd'], ['wk', 'wk'], ['mo', 'mo']]},
      {name: 'when_code', label: 'Event timing', type: 'text', max: 16, choices: EVENT_TIMING},
      {name: 'as_needed', label: 'As needed (PRN)', type: 'bool'}, {name: 'is_long_term', label: 'Long-term use', type: 'bool'},
      {name: 'extend_hours', label: 'Extension hours', type: 'number', min: 0, integer: true}, {name: 'his_times_per_day', label: 'HIS times per day', type: 'number', min: 0, integer: true},
      {name: 'active', label: 'Active', type: 'bool'}, {name: 'effective_to', label: 'Effective to', type: 'date'}]},
    frequencyAdminTime: {label: 'Administration times', g9: 'frequency_admin_time', keyed: false, parent: 'frequency_code', guard: 'admin', unique: [['frequency_code', 'seq']], fields: [
      {name: 'frequency_code', label: 'Frequency', type: 'text', required: true, max: 16},
      {name: 'seq', label: 'Sequence', type: 'number', required: true, min: 1, integer: true},
      {name: 'dispense_time', label: 'Dispense time', type: 'time', required: true}, {name: 'admin_time', label: 'Administration time', type: 'time', required: true},
      {name: 'nonmed_exec_time', label: 'Non-medication execution time', type: 'time'}]},
    route: {label: 'Route', g9: 'medication_route', keyed: true, parentKind: 'route', guard: 'admin', fields: [
      {name: 'desc_en', label: 'Description (EN)', type: 'text', max: 120}, {name: 'desc_zh', label: 'Description (ZH)', type: 'text', max: 120},
      {name: 'route_category', label: 'Category', type: 'enum', options: [['W', 'W External'], ['C', 'C Injection'], ['K', 'K Oral'], ['X', 'X Other']]},
      {name: 'snomed_code', label: 'SNOMED CT route', type: 'text', max: 18, choices: SNOMED_ROUTES}, {name: 'active', label: 'Active', type: 'bool'}]},
    // ---- 醫令與檢驗品項的本地擴充：B 目錄來源欄唯讀，這裡只放顯示名、分類覆寫、可開立、排序；檢驗另有檢體、分類、參考範圍、回報時效 ----
    serviceExt: {label: 'Order item extension', g9: 'service_catalog (new columns name_en override, order_category_override, is_orderable, sort_order)', keyed: true, parentKind: ['service', 'supply', 'diet'], guard: 'admin', fields: [
      {name: 'name_en', label: 'Display name (EN)', type: 'text', max: 200},
      {name: 'order_category_override', label: 'Order category override', type: 'enum', options: [['lab', 'Lab tests'], ['imaging', 'Exams'], ['care', 'Care orders']]},
      {name: 'is_orderable', label: 'Open for ordering', type: 'bool'},
      {name: 'sort_order', label: 'Sort order within group', type: 'number', min: 0, integer: true}]},
    labItem: {label: 'Lab item definition', g9: 'lab_item_definition (new; FHIR ObservationDefinition)', keyed: true, parentKind: 'service', requireLab: true, guard: 'admin', fields: [
      {name: 'specimen_code', label: 'Specimen', type: 'enum', options: [['Hematology', 'Blood (hematology)'], ['Arterial blood', 'Arterial blood'], ['Urine', 'Urine'], ['Sputum', 'Sputum'], ['CSF', 'CSF'], ['Stool', 'Stool'], ['Swab', 'Swab'], ['N/A', 'N/A']]},
      {name: 'lab_category', label: 'Lab category', type: 'enum', options: [['Biochemistry', 'Biochemistry'], ['Hematology', 'Hematology'], ['Blood gas', 'Blood gas'], ['Microbiology', 'Microbiology'], ['Imaging', 'Imaging'], ['Immunology', 'Immunology'], ['Coagulation', 'Coagulation']]},
      {name: 'reference_text', label: 'Reference range', type: 'text', max: 120}, {name: 'reference_unit_code', label: 'Reference unit', type: 'text', max: 16},
      {name: 'turnaround_minutes', label: 'Turnaround (minutes)', type: 'number', min: 0, integer: true},
      {name: 'effective_from', label: 'Effective from', type: 'date'}, {name: 'effective_to', label: 'Effective to', type: 'date'}]},
    unit: {label: 'Unit', g9: 'medication_unit', keyed: true, parentKind: 'unit', guard: 'admin', fields: [
      {name: 'desc_en', label: 'Description (EN)', type: 'text', max: 120}, {name: 'ucum_code', label: 'UCUM code', type: 'text', max: 16, choices: UCUM_UNITS}, {name: 'active', label: 'Active', type: 'bool'}]},
    codeSystem: {label: 'Code system version', g9: 'code_system_version (publisher, standard_ref, standard_version, effective_from, effective_to, note)', keyed: true, keys: CODE_SYSTEMS.map(x => x[0]), guard: 'admin', check: codeSystemCheck, fields: [
      {name: 'publisher', label: 'Publisher', type: 'enum', required: true, options: PUBLISHERS},
      {name: 'standard_ref', label: 'Standard reference (e.g. decision number)', type: 'text', max: 64}, {name: 'standard_version', label: 'Standard version', type: 'text', max: 32},
      {name: 'effective_from', label: 'Effective from', type: 'date'}, {name: 'effective_to', label: 'Effective to', type: 'date'}, {name: 'note', label: 'Note', type: 'text', max: 400}]},
    // 臨床選項：病歷存的是代碼，所以只能停用不能刪，選項組建立後也不能改。
    // ATC 群名（2026-11-01）：院方在字典維護中／越文群名；一碼十四群預先帶 WHO 英文原名。G9 atc_code。
    atcGroup: {label: 'ATC group', g9: 'atc_code', keyed: true, idPattern: /^[A-Z]([0-9]{2})?$/, idHint: 'One letter (level 1) or a letter and two digits (level 2)', noRemove: true, guard: 'admin', fields: [
      {name: 'name_en', label: 'WHO name (EN)', type: 'text', required: true, max: 120}, {name: 'name_vi', label: 'Name (VI)', type: 'text', max: 120}, {name: 'name_zh', label: 'Name (ZH)', type: 'text', max: 120},
      {name: 'active', label: 'Active', type: 'bool'}]},
    clinicalOption: {label: 'Clinical option', g9: 'clinical_option', keyed: true, idPattern: /^[A-Z][A-Z0-9_]{1,23}$/, idHint: '2–24 uppercase letters, digits or underscores', noRemove: true, guard: 'admin', fields: [
      {name: 'value_set', label: 'Option set', type: 'enum', required: true, options: CLINICAL_VALUE_SETS},
      {name: 'desc_en', label: 'Description (EN)', type: 'text', required: true, max: 120}, {name: 'desc_vi', label: 'Description (VI)', type: 'text', max: 120}, {name: 'desc_zh', label: 'Description (ZH)', type: 'text', max: 120},
      {name: 'sort_order', label: 'Sort order', type: 'number', min: 0, integer: true},
      {name: 'count_days', label: 'Show day count (special markers)', type: 'bool'},
      {name: 'active', label: 'Active', type: 'bool'}]}
  };
  const ATC_SEED = [['A', 'Alimentary tract and metabolism'], ['B', 'Blood and blood forming organs'], ['C', 'Cardiovascular system'], ['D', 'Dermatologicals'], ['G', 'Genito-urinary system and sex hormones'], ['H', 'Systemic hormonal preparations'], ['J', 'Antiinfectives for systemic use'], ['L', 'Antineoplastic and immunomodulating agents'], ['M', 'Musculo-skeletal system'], ['N', 'Nervous system'], ['P', 'Antiparasitic products, insecticides and repellents'], ['R', 'Respiratory system'], ['S', 'Sensory organs'], ['V', 'Various']];
  // 依介面語言取院方維護的 ATC 群名；沒有該語言就用 WHO 英文原名；沒維護或停用回傳 null，由呼叫端退回內建名。
  function atcGroupName(state, code, lang) {
    const row = ((state && state.master && state.master.atcGroup) || {})[String(code || '').toUpperCase()];
    if (!row || row.active === false) return null;
    return (lang === 'zh' && row.name_zh) || (lang === 'vi' && row.name_vi) || row.name_en || null;
  }
  // 某一組的選項，依排序；keep 是已寫進病歷的代碼，停用了也要列出來才看得到原值。
  function clinicalOptions(state, set, keep) {
    const rows = (state && state.master && state.master.clinicalOption) || {}, extra = new Set([].concat(keep || []));
    return Object.entries(rows).filter(([id, r]) => r && r.value_set === set && (r.active !== false || extra.has(id)))
      .map(([id, r]) => ({id, ...r})).sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.id.localeCompare(b.id));
  }
  // 依介面語言取名稱；該語言沒填退回英文，字典查不到就顯示代碼本身。
  function clinicalOptionText(state, id, lang) {
    const r = ((state && state.master && state.master.clinicalOption) || {})[id];
    if (!r) return String(id || '');
    return (lang === 'zh' && r.desc_zh) || (lang === 'vi' && r.desc_vi) || r.desc_en || id;
  }
  // 藥品明細（2026-11-08 重整）：不分頁籤，一頁由上而下六段，每段先寫出現在的設定，按 Edit 才展開表單。[代碼, 標題, 這一段寫的表]。
  const DRUG_SECTIONS = [['ordering', 'Ordering defaults', ['medicationKnowledge']],
    ['limits', 'Dose limits', ['medicationWeightDose']],
    ['conversion', 'Dose conversion', ['medicationDoseConversion']],
    ['rules', 'Availability and restrictions', ['medicationSupplyStatus', 'medicationOrderRestriction', 'medicationCaution']],
    ['flags', 'Drug flags', ['medicationAttribute']],
    ['interaction', 'Safety class and interactions', ['medicationInteraction']]];

  function ensure(master) {
    const m = master && typeof master === 'object' && !Array.isArray(master) ? master : {};
    for (const t of Object.keys(tables)) if (!m[t] || typeof m[t] !== 'object' || Array.isArray(m[t])) m[t] = {};
    return m;
  }

  // 依表定義清洗一列：未知欄位、必填、型別、範圍、目錄鍵存在且啟用、生效期先後。回傳乾淨的列（不含稽核欄）。
  function validate(table, id, row, ctx) {
    const def = tables[table], must = ctx.must, label = f => f.label || f.name;
    must(def, 'Unknown maintenance table: ' + table);
    const names = new Set(def.fields.map(f => f.name)), out = {};
    for (const k of Object.keys(row || {})) { if (AUDIT.includes(k)) continue; must(names.has(k), 'Unknown field for ' + def.label + ': ' + k); }
    for (const f of def.fields) {
      let v = row ? row[f.name] : undefined;
      switch (f.type) {
        case 'text': v = String(v ?? '').trim(); must(!f.required || v, label(f) + ' is required'); must(v.length <= (f.max || 400), label(f) + ' is too long'); if (f.choices && v) must(f.choices.some(o => o[0] === v), label(f) + ': choose a value from the list'); out[f.name] = v || null; break;
        case 'atc': v = String(v ?? '').trim().toUpperCase(); must(!v || atcChoices(ctx.clinical).some(g => g[1].some(o => o[0] === v)), label(f) + ': choose an ATC code used in catalog B'); out[f.name] = v || null; break;
        case 'number': {
          if (v === '' || v === undefined || v === null) { must(!f.required, label(f) + ' is required'); out[f.name] = null; break; }
          const num = Number(v); must(Number.isFinite(num), label(f) + ' must be a number');
          if (f.min !== undefined) must(num >= f.min, label(f) + ' must be at least ' + f.min);
          if (f.max !== undefined) must(num <= f.max, label(f) + ' must be at most ' + f.max);
          if (f.integer) must(Number.isInteger(num), label(f) + ' must be a whole number');
          out[f.name] = num; break; }
        case 'bool': out[f.name] = String(v ?? '').split(',').some(x => ['1', 'true', 'on'].includes(x.trim())); break;
        case 'date': v = String(v ?? '').trim(); must(!v || /^\d{4}-\d\d-\d\d$/.test(v), label(f) + ' must be YYYY-MM-DD'); must(!f.required || v, label(f) + ' is required'); out[f.name] = v || null; break;
        case 'time': v = String(v ?? '').trim(); must(!v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), label(f) + ' must be HH:mm'); must(!f.required || v, label(f) + ' is required'); out[f.name] = v || null; break;
        case 'enum': v = String(v ?? '').trim(); must(!f.required || v, label(f) + ' is required'); must(!v || f.options.some(o => o[0] === v), label(f) + ': invalid value'); out[f.name] = v || null; break;
        case 'catalogKey': {
          v = String(v ?? '').trim();
          if (!v) { must(!f.required, label(f) + ' is required'); out[f.name] = null; break; }
          // 可填目錄鍵或代碼（例如 medication:50631 或 26ET19）；存的一律是鍵。
          let e = ctx.clinical.snapshot(v); if (!e && ctx.clinical.catalog) { const hit = ctx.clinical.catalog.entries.find(x => (!f.kind || x.kind === f.kind) && String(x.code).toLowerCase() === v.toLowerCase()); if (hit) { e = hit; v = hit.key; } }
          must(e && e.active && (!f.kind || e.kind === f.kind), label(f) + ': item not found or inactive in catalog B: ' + v);
          if (f.kind === 'route') { const loc = ((ctx.state && ctx.state.master && ctx.state.master.route) || {})[v]; must(!(loc && loc.active === false), 'Route “' + (e.zh || e.name) + '” is inactive in the route dictionary; choose another'); }
          out[f.name] = v; break; }
        case 'frequency': {
          v = String(v ?? '').trim().toUpperCase();
          if (!v) { must(!f.required, label(f) + ' is required'); out[f.name] = null; break; }
          const r = ((ctx.state && ctx.state.master && ctx.state.master.frequency) || {})[v];
          must(r, 'Frequency code not found in the dictionary: ' + v); must(r.active !== false, 'Frequency “' + v + '” is inactive in the frequency dictionary; choose another');
          must(fieldChoices(f, ctx.state, ctx.clinical)[0][1].some(o => o[0] === v), 'Frequency “' + v + '” is not a scheduled frequency in the order dialog; choose another');
          out[f.name] = v; break; }
        case 'unit': {
          v = String(v ?? '').trim();
          if (!v) { must(!f.required, label(f) + ' is required'); out[f.name] = null; break; }
          // 大小寫與別名（µg、ug）不同也算同一個單位；存的一律是選項上的寫法。
          const want = fold(UNIT_ALIASES[fold(v)] || v), hit = fieldChoices(f, ctx.state, ctx.clinical).flatMap(g => g[1]).find(o => fold(o[0]) === want);
          must(hit, f.units === 'measurable' ? label(f) + ': “' + v + '” is not a measurable unit; choose one of ' + MEASURABLE_UNITS.join(', ')
            : label(f) + ': “' + v + '” is not an active unit in the unit dictionary; choose a listed unit');
          out[f.name] = hit[0]; break; }
        case 'keys': {
          const list = Array.isArray(v) ? v : String(v ?? '').split(',');
          const clean = [...new Set(list.map(x => String(x).trim()).filter(Boolean))];
          must(clean.length <= (f.max || 100), label(f) + ': at most ' + (f.max || 100) + ' items');
          clean.forEach(k => { const e = ctx.clinical.snapshot(k); must(e && e.active && (!f.kinds || f.kinds.includes(e.kind)), 'Item not found or inactive in catalog B: ' + k); });
          out[f.name] = clean; break; }
        case 'json': out[f.name] = v === undefined ? null : v; break;
        default: out[f.name] = v ?? null;
      }
    }
    if (names.has('effective_from') && names.has('effective_to') && out.effective_from && out.effective_to) must(out.effective_from <= out.effective_to, 'Effective-to cannot be earlier than effective-from');
    if (def.check) def.check(out, must, id, ctx);
    return out;
  }

  // 表層唯一鍵（例如同藥同屬性只能一列）。
  function uniqueCheck(def, rows, id, out, must) {
    for (const combo of def.unique || []) {
      const clash = Object.entries(rows).find(([k, r]) => k !== id && combo.every(f => String(r[f] ?? '') === String(out[f] ?? '')));
      must(!clash, def.label + ': a record with the same ' + combo.join(' + ') + ' already exists');
    }
  }

  // ---- 開立端讀維護檔（2026-10-18）：S11 卡片、左欄清單與 store 的 cartAdd／catalogOrder 都用這一份，畫面與寫入判斷不會各算各的。----
  // day 是比對 effective_from／effective_to 的日期（開立生效日）；沒給就用示範日。
  const DEMO_DAY = '2026-08-31';
  const effectiveOn = (row, day) => !!row && (!row.effective_from || row.effective_from <= day) && (!row.effective_to || row.effective_to >= day);
  const rowsOf = (master, table, key) => Object.entries((master && master[table]) || {}).filter(([, r]) => r && r.medication === key).map(([id, r]) => ({id, ...r}));
  const fold = v => String(v || '').trim().toLowerCase();
  // 卡片與清單上標示的屬性（維護檔只收這六種）。
  const ATTRIBUTE_TAGS = {A08: 'High alert', A04: 'Restricted antibiotic', A01: 'Chemotherapy', A05: 'Blood product'};
  const RESTRICTION_TYPES = ['role', 'department', 'specialty', 'approval', 'indication'];
  function prescribing(state, key, day) {
    const d = day || DEMO_DAY, master = (state && state.master) || {};
    const raw = (master.medicationKnowledge || {})[key] || null;
    const knowledge = raw && effectiveOn(raw, d) ? raw : null;
    const rawSupply = (master.medicationSupplyStatus || {})[key] || null;
    const supply = rawSupply && effectiveOn(rawSupply, d) ? rawSupply : null;
    const attributes = rowsOf(master, 'medicationAttribute', key).map(r => r.attribute_code).filter(code => ATTRIBUTE_TAGS[code]);
    const cautions = rowsOf(master, 'medicationCaution', key).filter(r => effectiveOn(r, d));
    const restrictions = rowsOf(master, 'medicationOrderRestriction', key).filter(r => effectiveOn(r, d) && RESTRICTION_TYPES.includes(r.restriction_type));
    const conversions = rowsOf(master, 'medicationDoseConversion', key);
    const unit = (knowledge && knowledge.order_unit_code) || null;
    return {knowledge, supply, attributes, cautions, restrictions, conversions,
      stopped: !!(supply && supply.status === 'stopped'),
      defaults: {route: (knowledge && knowledge.default_route_code) || null, frequency: (knowledge && knowledge.default_frequency_code) || null, unit,
        days: supply && supply.default_days ? supply.default_days : null},
      maxDays: supply && Number.isFinite(supply.max_days) && supply.max_days > 0 ? supply.max_days : null,
      conversion: conversions.find(c => unit && fold(c.order_unit_code) === fold(unit)) || conversions[0] || null};
  }
  // 給藥量（2026-10-25）：醫囑上的單位與換算列的醫囑單位相同（不分大小寫）才算，劑量 × 係數取到小數第 3 位；store 建醫囑、開立卡片與給藥畫面共用。FHIR MedicationRequest.dispenseRequest.quantity。
  function dispenseQuantity(conv, dose) {
    const v = Number(dose && dose.value), f = Number(conv && conv.factor);
    if (!conv || !dose || !Number.isFinite(v) || v < 0 || !(f > 0) || fold(conv.order_unit_code) !== fold(dose.unit)) return null;
    return {value: Math.round(v * f * 1000) / 1000, unit: conv.dispense_unit_code, factor: f};
  }
  const dispenseText = q => q && Number.isFinite(Number(q.value)) ? q.value + ' ' + q.unit : '';
  // 身分／部門／專科限制：拿開立者的 role／title／department／specialty 比對 value（不分大小寫）。回傳沒通過的列。
  function restrictionBlocks(rx, actor) {
    const a = actor || {};
    return (rx.restrictions || []).filter(r => {
      const v = fold(r.value);
      if (r.restriction_type === 'role') return !(v === fold(a.role) || v === fold(a.title));
      if (r.restriction_type === 'department') return v !== fold(a.department);
      if (r.restriction_type === 'specialty') return v !== fold(a.specialty);
      return false;
    });
  }
  const restrictionText = r => ({role: 'Only “' + r.value + '” may prescribe', department: 'Only department “' + r.value + '” may prescribe', specialty: 'Only specialty “' + r.value + '” may prescribe',
    approval: 'Approval required: ' + r.value, indication: 'Indication required: ' + r.value}[r.restriction_type] || r.restriction_type) + (r.message ? ' — ' + r.message : '');
  // ATC 本地覆寫（2026-10-18）：atc_source＝LOCAL 且有 atc_code、且開立屬性列在當天有效時，用藥安全以覆寫值比對；否則用 HIS 值。
  // 2026-11-08：本地 ATC 只補 HIS 沒有的；HIS 有值時一律用 HIS（代碼錯了回報 HIS 修正），舊資料的覆寫不生效。
  function effectiveAtc(state, key, hisAtc, day) {
    const k = ((state && state.master && state.master.medicationKnowledge) || {})[key];
    return !String(hisAtc || '').trim() && k && k.atc_source === 'LOCAL' && k.atc_code && effectiveOn(k, day || DEMO_DAY) ? String(k.atc_code).trim().toUpperCase() : String(hisAtc || '');
  }
  function knowledgeCheck(out, must, id, ctx) {
    if (out.atc_source !== 'LOCAL' || !out.atc_code) return;
    const e = ctx && ctx.clinical && ctx.clinical.snapshot ? ctx.clinical.snapshot(id) : null, his = String((e && e.atc) || '').trim();
    if (!his) return;
    // 改規則前存下的覆寫（同一個值還留在列上）：存檔時改回 HIS，不擋其他欄位的修改。
    const prev = (((ctx.state || {}).master || {}).medicationKnowledge || {})[id];
    if (prev && prev.atc_source === 'LOCAL' && String(prev.atc_code || '').trim() === out.atc_code) { out.atc_source = 'HIS'; out.atc_code = his; return; }
    must(false, `This drug already has ATC ${his} from HIS; a local ATC only fills a blank. Report corrections to HIS`);
  }
  // 待開清單項（帶 key／atc）與既有醫囑（帶 catalog）都換成生效 ATC 再交給 ICUDrugSafety；不改原物件。
  function withLocalAtc(state, items, day) {
    return (items || []).map(it => {
      if (!it || it.kind !== 'medication') return it;
      const src = it.catalog || it, atc = effectiveAtc(state, src.key, src.atc, day);
      if (atc === String(src.atc || '')) return it;
      return it.catalog ? {...it, catalog: {...it.catalog, atc}} : {...it, atc};
    });
  }
  // 管灌與剝半（2026-10-18）：經管灌給藥只適用口服途徑。2026-11-01 院方定案：不可管灌、不可磨粉的藥經管灌直接擋下（block）；不可剝半的藥劑量不是醫囑單位的整數時填理由。
  const TUBE_ROUTE_CODES = ['1.01'];
  function preparationIssues(knowledge, order) {
    const k = knowledge || {}, o = order || {}, out = [];
    if (o.viaTube && k.no_tube) out.push({ruleId: 'PREP-NO-TUBE', label: 'Not for tube administration', block: true});
    if (o.viaTube && k.no_crush) out.push({ruleId: 'PREP-NO-CRUSH', label: 'Do not crush; tube administration requires crushing', block: true});
    if (k.no_split && o.sameUnit && Number.isFinite(o.dose) && !Number.isInteger(o.dose)) out.push({ruleId: 'PREP-NO-SPLIT', label: 'Do not split; dose is not a whole order unit'});
    return out;
  }
  // ---- 每公斤劑量上限（2026-10-18）：S11 卡片、app.js 即時判斷、store 的 catalogOrder 與用藥安全涵蓋範圍共用這一份 ----
  const present = v => v !== null && v !== undefined && v !== '';
  const round3 = v => Math.round(v * 1000) / 1000;
  // 一列的跨欄檢查：至少一個每公斤值；數值都要大於 0；有年齡界限就要單位；下限小於上限。
  function weightDoseRowCheck(out, must) {
    must(present(out.max_single_per_kg) || present(out.max_daily_per_kg), 'Per-kg dose limits: enter a max single or max daily dose per kg');
    [['max_single_per_kg', 'Max single dose per kg'], ['max_daily_per_kg', 'Max daily dose per kg'], ['absolute_max_single', 'Cap per dose'], ['absolute_max_daily', 'Cap per day']].forEach(([k, l]) => must(!present(out[k]) || out[k] > 0, l + ' must be greater than 0'));
    must(!(present(out.age_min) || present(out.age_max)) || out.age_unit, 'Per-kg dose limits: age unit is required when an age bound is set');
    if (present(out.age_min) && present(out.age_max)) must(out.age_min < out.age_max, 'Age from must be lower than age below');
    if (present(out.weight_min_kg) && present(out.weight_max_kg)) must(out.weight_min_kg < out.weight_max_kg, 'Weight from must be lower than weight below');
  }
  // 劑量體重（2026-10-18 使用者裁示）：入院體重（Admission weight，TDL.1285，入院資料帶入）優先，沒有才取最新一筆體重量測（Weight，TDL.0097）；
  // 都沒有回 null，不拿任何預設值補，也不設過期門檻。basis 記是哪一種。
  // 劑量體重（2026-10-22）：入院體重與體重量測同列比較，取量測時間最新的一筆；幾天前以開立日（day）算；超過設定的門檻標 stale，不擋開立。
  const DEFAULT_STALE_DAYS = 7, DEFAULT_STALE_DAYS_INFANT = 3;
  const dayDiff = (later, earlier) => { const a = String(later || '').slice(0, 10), b = String(earlier || '').slice(0, 10);
    if (!/^\d{4}-\d\d-\d\d$/.test(a) || !/^\d{4}-\d\d-\d\d$/.test(b)) return null;
    const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
    return Math.floor((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000); };
  // 體重過期門檻依年齡（2026-11-01 定案）：未滿 1 歲 3 天、其他 7 天，兩個都是系統參數、由我方設定；沒有出生日期照一般門檻。
  const staleDaysOf = (state, patient, day) => { const st = (state && state.settings) || {}, years = patient ? ageIn(patient.birthDate, day, 'y') : null;
    if (years !== null && years < 1) { const i = Number(st.dosingWeightStaleDaysInfant); return Number.isInteger(i) && i > 0 ? i : DEFAULT_STALE_DAYS_INFANT; }
    const v = Number(st.dosingWeightStaleDays); return Number.isInteger(v) && v > 0 ? v : DEFAULT_STALE_DAYS; };
  function dosingWeight(state, pid, day) {
    const obs = ((state && state.observations) || []).filter(o => o && o.p === pid && !o.voided && Number(o.value) > 0 && (o.kind === 'Admission weight' || o.kind === 'Weight'));
    const w = obs.reduce((a, b) => !a || String(b.at || '') >= String(a.at || '') ? b : a, null);
    if (!w) return null;
    const ageDays = dayDiff(day || DEMO_DAY, w.at), staleDays = staleDaysOf(state, ((state && state.patients) || []).find(p => p && p.id === pid), day);
    return {kg: Number(w.value), at: w.at || null, id: w.id || null, basis: w.kind === 'Admission weight' ? 'admission' : 'measured', ageDays, staleDays, stale: ageDays !== null && ageDays > staleDays};
  }
  // EMR整合MDT demo（P2）：體表面積（Mosteller，√(cm×kg/3600)，2 位小數）取最近一次身高與劑量體重；沒有身高就沒有 BSA。
  function bodySurface(state, pid, day) {
    const w = dosingWeight(state, pid, day); if (!w) return null;
    const hs = ((state && state.observations) || []).filter(o => o && o.p === pid && !o.voided && o.kind === 'Height' && Number(o.value) > 0);
    const h = hs.reduce((a, b) => !a || String(b.at || '') >= String(a.at || '') ? b : a, null); if (!h) return null;
    const m2 = Math.round(Math.sqrt(Number(h.value) * w.kg / 3600) * 100) / 100;
    return {m2, kg: w.kg, cm: Number(h.value), weightId: w.id, heightId: h.id || null, weightAt: w.at, heightAt: h.at || null, stale: !!w.stale};
  }
  const weightLabel = w => (w.basis === 'admission' ? 'admission weight ' : 'measured weight ') + w.kg + ' kg';
  const weightAgeText = w => w.ageDays === null || w.ageDays === undefined ? 'date unknown' : w.ageDays <= 0 ? 'today' : w.ageDays === 1 ? '1 day ago' : w.ageDays + ' days ago';
  const weightStaleText = w => !w || !w.stale ? null : 'Weight may be outdated: ' + (w.basis === 'admission' ? 'recorded ' : 'weighed ') + w.ageDays + ' days ago (threshold ' + w.staleDays + ' days); confirm before relying on per-kg dosing';
  // 字典下拉（2026-10-23）：預設途徑、預設頻率、醫囑／調劑／每公斤劑量單位只能從字典選；維護表單與 validate 共用這一份。回傳 [[群組標題, [[值, 顯示]]]]，不適用的欄位回 null。
  // 可量測單位＝每公斤開立開放的質量、活性與物質量單位（UCUM 可表達）；B 計量單位目錄沒有 mcg、IU、mEq、mmol，所以另列一組，目錄裡同名的（Mg）併進這組。
  // G9：這 7 個是 medication_unit 的種子列（is_measurable＝true，G9_種子資料.csv）；單位欄存單位名稱、不設外鍵。
  const MEASURABLE_UNITS = ['mg', 'mcg', 'g', 'U', 'IU', 'mEq', 'mmol'];
  const UNIT_ALIASES = {'µg': 'mcg', ug: 'mcg'};
  // 限制的值依類型給選項（2026-11-08）：身分、科別、專科從員工與上線科別取；需核准、需適應症是給開立者看的文字，沒有清單。
  function restrictionChoices(state) {
    const people = Object.values((state && state.people) || {}), uniq = list => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const TX = typeof module !== 'undefined' ? require('./order-taxonomy.js') : root.ICUOrderTaxonomy;
    const depts = uniq([...((state && state.settings && state.settings.departments) || []).map(d => d.name), ...((TX && TX.departments) || []).map(d => d[1]), ...people.filter(p => p.role !== 'admin').map(p => p.department)]);
    return {role: [['doctor', 'Doctor'], ['nurse', 'Nurse'], ...uniq(people.filter(p => p.role !== 'admin').map(p => p.title)).map(t => [t, t])],
      department: depts.map(d => [d, d]), specialty: uniq(people.map(p => p.specialty)).map(t => [t, t])};
  }
  function restrictionCheck(out, must, id, ctx) {
    const list = restrictionChoices(ctx && ctx.state)[out.restriction_type];
    if (list) must(list.some(o => fold(o[0]) === fold(out.value)), `Restriction value “${out.value}” is not in the list for this type; choose one`);
  }
  function atcChoices(clinical) {
    const entries = (clinical && clinical.catalog && clinical.catalog.entries) || [], codes = [...new Set(entries.filter(e => e.kind === 'medication' && e.atc).map(e => String(e.atc).trim().toUpperCase()))].filter(c => /^[A-Z]\d\d[A-Z]{2}\d\d$/.test(c)).sort();
    return ATC_SEED.map(([L, name]) => [L + ' · ' + name, codes.filter(c => c[0] === L).map(c => [c, c])]).filter(g => g[1].length);
  }
  function fieldChoices(f, state, clinical) {
    const M = (state && state.master) || {}, entries = (clinical && clinical.catalog && clinical.catalog.entries) || [];
    if (f.choices) return [[null, f.choices]];
    if (f.type === 'atc') return atcChoices(clinical);
    const off = (table, key) => !!(M[table] && M[table][key] && M[table][key].active === false);
    // 預設頻率只列開立視窗排定頻率選單有的（store 的頻率表；PRN、STAT 是給藥模式，不是排定頻率），字典停用的不列。
    if (f.type === 'frequency') { const S = typeof module !== 'undefined' ? require('./store.js') : root.ICUStore, table = new Set(((S && S.timingGroups) || []).flatMap(([, list]) => list.map(o => o[0])));
      return [[null, Object.entries(M.frequency || {}).filter(([k]) => table.has(k) && !off('frequency', k)).map(([k, r]) => [k, r && r.desc_en ? k + ' · ' + r.desc_en : k])]]; }
    if (f.type === 'catalogKey' && f.kind === 'route') return [[null, entries.filter(e => e.kind === 'route' && e.active && !off('route', e.key)).map(e => [e.key, e.code + ' ' + (e.zh || e.name)])]];
    if (f.type !== 'unit') return null;
    const measurable = ['Measurable units', MEASURABLE_UNITS.map(u => [u, u])];
    if (f.units === 'measurable') return [measurable];
    const seen = new Set([...MEASURABLE_UNITS.map(fold), ...Object.keys(UNIT_ALIASES)]);
    const names = entries.filter(e => e.kind === 'unit' && e.active && !off('unit', e.key)).map(e => String(e.name || '').trim())
      .filter(n => n && !seen.has(fold(n)) && seen.add(fold(n))).sort((a, b) => a.localeCompare(b, 'vi'));
    return [measurable, ['Unit dictionary', names.map(n => [n, n])]];
  }
  // 每公斤輸入（2026-10-22）：每次 mg/kg 或每日 mg/kg/day 分次；算出的絕對劑量照小數位取整；單位只開放質量與活性單位（＝上面的可量測單位，維護的每公斤上限也只能選這些）。
  const PER_KG_UNITS = [...MEASURABLE_UNITS.map(fold), ...Object.keys(UNIT_ALIASES)];
  const perKgUnitOk = unit => PER_KG_UNITS.includes(fold(unit));
  function perKgDose(o) {
    const perDay = o.mode === 'daily' ? Number(o.perDay) : 1;
    const raw = round3(Number(o.perKg) * Number(o.kg) / perDay);
    const dec = Number.isInteger(o.decimals) ? o.decimals : 3, f = Math.pow(10, dec);
    const value = Math.round(raw * f) / f;
    return {raw, value, perDay: o.mode === 'daily' ? perDay : null};
  }
  const UNIT_HOURS = {min: 1 / 60, h: 1, d: 24, wk: 168, mo: 720};
  // 體重更新後回看（2026-10-22）：尚未停用的藥囑若用的不是目前這筆劑量體重，以目前體重重算每公斤上限；只回報超過的，不改醫囑也不要求處理。
  function weightRecheck(state, pid, day) {
    const w = dosingWeight(state, pid, day);
    if (!w) return null;
    const orders = ((state && state.orders) || []).filter(o => o && o.p === pid && o.kind === 'medication' && !['stopped', 'cancelled'].includes(o.clinical) && o.dosingWeight && o.dosingWeight.observation && o.dosingWeight.observation !== w.id && o.catalog && o.catalog.key);
    const list = orders.map(o => {
      const wd = weightDose(state, o.catalog.key, pid, day);
      if (!wd || wd.status !== 'checked') return null;
      const m = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(String(o.dose || ''));
      if (!m) return null;
      const dose = {value: Number(m[1]), unit: m[2]}, mode = o.dosing && o.dosing.mode;
      const rep = o.dosageInstruction && o.dosageInstruction[0] && o.dosageInstruction[0].timing && o.dosageInstruction[0].timing.repeat;
      const perDay = mode === 'scheduled' && rep && rep.frequency ? rep.frequency * 24 / (rep.period * UNIT_HOURS[rep.periodUnit]) : mode === 'once' ? 1 : null;
      const daily = mode === 'prn' ? (o.dosing.maxPerDay || null) : perDay !== null ? dose.value * perDay : null;
      const r = weightDoseIssues(wd, dose, daily);
      return r.over.length ? {id: o.id, name: (o.catalog && o.catalog.zh) || o.name, dose: o.dose, previous: o.dosingWeight, over: r.over} : null;
    }).filter(Boolean);
    return {weight: w, orders: list};
  }
  const weightRecheckText = r => 'Based on the latest weight (' + r.weight.kg + ' kg, ' + String(r.weight.at || '').replace('T', ' ') + '), ' + r.orders.length + ' current medication order(s) exceed the per-kg limit';
  // 足齡：天＝相差天數；月與歲＝滿幾個月／幾歲。沒有出生日期回 null。
  function ageIn(birthDate, day, unit) {
    const b = String(birthDate || '').slice(0, 10), d = String(day || DEMO_DAY).slice(0, 10);
    if (!/^\d{4}-\d\d-\d\d$/.test(b)) return null;
    const [by, bm, bd] = b.split('-').map(Number), [dy, dm, dd] = d.split('-').map(Number);
    if (unit === 'd') return Math.floor((Date.UTC(dy, dm - 1, dd) - Date.UTC(by, bm - 1, bd)) / 86400000);
    const months = (dy - by) * 12 + (dm - bm) - (dd < bd ? 1 : 0);
    return unit === 'mo' ? months : Math.floor(months / 12);
  }
  const capAt = (v, cap) => round3(present(cap) ? Math.min(v, cap) : v);
  // 這個藥對這位病人的每公斤上限。沒維護回 null；status：checked／no-weight／no-band（體重或年齡不在任何區間）／no-birth-date（區間要年齡但沒有出生日期）。
  function weightDose(state, key, pid, day) {
    const d = day || DEMO_DAY, rows = rowsOf(state && state.master, 'medicationWeightDose', key).filter(r => effectiveOn(r, d));
    if (!rows.length) return null;
    const weight = dosingWeight(state, pid, d);
    if (!weight) return {status: 'no-weight', weight: null, limits: []};
    const patient = ((state && state.patients) || []).find(x => x.id === pid) || {};
    let needsBirth = false;
    const limits = rows.filter(r => {
      if (present(r.age_min) || present(r.age_max)) {
        const age = ageIn(patient.birthDate, d, r.age_unit);
        if (age === null) { needsBirth = true; return false; }
        if ((present(r.age_min) && age < r.age_min) || (present(r.age_max) && age >= r.age_max)) return false;
      }
      return !(present(r.weight_min_kg) && weight.kg < r.weight_min_kg) && !(present(r.weight_max_kg) && weight.kg >= r.weight_max_kg);
    }).map(r => ({id: r.id, unit: r.dose_unit_code, perKgSingle: present(r.max_single_per_kg) ? r.max_single_per_kg : null, perKgDaily: present(r.max_daily_per_kg) ? r.max_daily_per_kg : null,
      capSingle: present(r.absolute_max_single) ? r.absolute_max_single : null, capDaily: present(r.absolute_max_daily) ? r.absolute_max_daily : null,
      single: present(r.max_single_per_kg) ? capAt(r.max_single_per_kg * weight.kg, r.absolute_max_single) : present(r.absolute_max_single) ? r.absolute_max_single : null,
      daily: present(r.max_daily_per_kg) ? capAt(r.max_daily_per_kg * weight.kg, r.absolute_max_daily) : present(r.absolute_max_daily) ? r.absolute_max_daily : null}));
    return {status: limits.length ? 'checked' : needsBirth ? 'no-birth-date' : 'no-band', weight, limits};
  }
  const weightDoseReason = wd => !wd || wd.status === 'checked' ? null : wd.status === 'no-weight' ? 'No admission weight or measured weight recorded for this patient'
    : wd.status === 'no-birth-date' ? 'The maintained bands need the patient’s age, but no birth date is recorded' : 'The ' + weightLabel(wd.weight) + ' is outside every maintained band';
  const limitBasis = (l, which, w) => { const perKg = which === 'single' ? l.perKgSingle : l.perKgDaily, cap = which === 'single' ? l.capSingle : l.capDaily, per = which === 'single' ? '' : '/day';
    if (perKg === null) return ' (cap ' + cap + ' ' + l.unit + per + ')';
    return ' (' + perKg + ' ' + l.unit + '/kg' + per + ' × ' + weightLabel(w) + (cap !== null && perKg * w.kg > cap ? ', capped at ' + cap + ' ' + l.unit + per : '') + ')'; };
  // 比對劑量：over 是超過的規則（要填說明）；unchecked 是沒能檢核的原因（記在醫囑上，不算通過）。上限以該列的劑量單位計，單位不同不宣稱已檢核。
  function weightDoseIssues(wd, dose, daily) {
    if (!wd) return {over: [], unchecked: null};
    if (wd.status !== 'checked') return {over: [], unchecked: weightDoseReason(wd)};
    const unit = fold(dose && dose.unit), v = Number(dose && dose.value), same = wd.limits.filter(l => fold(l.unit) === unit);
    if (!same.length) return {over: [], unchecked: 'Dose unit “' + ((dose && dose.unit) || '') + '” differs from the per-kg limit unit “' + wd.limits[0].unit + '”'};
    const strictest = k => same.filter(l => l[k] !== null).sort((a, b) => a[k] - b[k])[0], over = [], w = wd.weight;
    const s = strictest('single'), t = strictest('daily');
    if (s && Number.isFinite(v) && v > s.single) over.push({ruleId: 'DOSE-MAX-KG-SINGLE', label: 'Exceeds per-kg maximum single dose', detail: v + ' ' + dose.unit + ' > ' + s.single + ' ' + s.unit + limitBasis(s, 'single', w), ratio: v / s.single});
    if (t && daily !== null && daily !== undefined && Number.isFinite(daily) && daily > t.daily) over.push({ruleId: 'DOSE-MAX-KG-DAILY', label: 'Exceeds per-kg maximum daily dose', detail: round3(daily) + ' ' + dose.unit + '/day > ' + t.daily + ' ' + t.unit + '/day' + limitBasis(t, 'daily', w), ratio: daily / t.daily});
    return {over, unchecked: null};
  }

  // 明顯超量（2026-11-01 院方定案）：劑量達上限（單次、每日、每公斤）的 10 倍以上直接擋下，不能填理由開立。
  const OVERDOSE_BLOCK_RATIO = 10;

  // 代碼表快照（唯讀）：版本、來源檔、各檔筆數與 SHA-256，全部取自 B 目錄匯入的 catalog.js。
  const codeSystemCache = new Map();
  function codeSystemInfo(catalog, kind) {
    if (!catalog) return {version: '—', rows: 0, files: []};
    const key = catalog.version + ':' + kind;
    if (!codeSystemCache.has(key)) { const files = [...new Set(catalog.entries.filter(e => e.kind === kind).map(e => e.source))].sort();
      codeSystemCache.set(key, {version: catalog.version, rows: (catalog.counts || {})[kind] || 0, files: files.map(file => ({file, rows: (catalog.sources[file] || {}).rows || 0, sha256: (catalog.sources[file] || {}).sha256 || ''}))}); }
    return codeSystemCache.get(key);
  }

  // 維護的藥對藥交互作用列（帶列 id），交給 ICUDrugSafety.assess 的 extraRules。
  const interactionRows = state => Object.entries((state && state.master && state.master.medicationInteraction) || {}).map(([id, r]) => ({id, ...r}));

  const api = {tables, ensure, validate, uniqueCheck, KINDS, AUDIT, DRUG_SECTIONS, restrictionChoices, TIMING_CODES, EVENT_TIMING, SNOMED_ROUTES, UCUM_UNITS, prescribing, dispenseQuantity, dispenseText, restrictionBlocks, restrictionText, interactionRows, effectiveOn, ATTRIBUTE_TAGS, DEMO_DAY, bodySurface,
    effectiveAtc, withLocalAtc, TUBE_ROUTE_CODES, preparationIssues, OVERDOSE_BLOCK_RATIO, dosingWeight, weightLabel, ageIn, weightDose, weightDoseIssues, weightDoseReason,
    weightAgeText, weightStaleText, CODE_SYSTEMS, PUBLISHERS, codeSystemInfo, CLINICAL_VALUE_SETS, CLINICAL_OPTION_SEED, ATC_SEED, atcGroupName, clinicalOptions, clinicalOptionText, MEASURABLE_UNITS, fieldChoices, PER_KG_UNITS, perKgUnitOk, perKgDose, staleDaysOf, weightRecheck, weightRecheckText, DEFAULT_STALE_DAYS, DEFAULT_STALE_DAYS_INFANT};
  if (typeof module !== 'undefined') module.exports = api; else root.ICUMasterSchema = api;
})(typeof window !== 'undefined' ? window : globalThis);
