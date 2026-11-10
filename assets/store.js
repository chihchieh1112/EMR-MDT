/* ICU day prototype: one mutation boundary. No network, real users or clinical rules. */
(function (root) {
  'use strict';
  const clinical=typeof module!=='undefined'?require('./clinical.js'):root.ICUClinical;
  const workflow=typeof module!=='undefined'?require('./workflow.js'):root.ICUWorkflow;
const FS=()=>typeof module!=='undefined'?require('./flowsheet.js'):root.ICUFlowsheet;
  const rxSafety=typeof module!=='undefined'?require('./drug-safety.js'):root.ICUDrugSafety;
  const taxonomy=typeof module!=='undefined'?require('./order-taxonomy.js'):root.ICUOrderTaxonomy;
  const schema=typeof module!=='undefined'?require('./master-schema.js'):root.ICUMasterSchema;
  const TZ=typeof module!=='undefined'?require('./timezone.js'):root.ICUTimeZone;
  // 檢驗檢查醫囑不經簽署與 HIS 送出，開立即為護理端可執行（2026-09-14 R8）。
  const isLabImaging=order=>['lab','imaging'].includes(taxonomy.categoryOfOrder(order));
  // 醫囑一旦可執行就同時開出一筆待回報告與一件追蹤工作；報告自帶識別碼，不沿用醫囑編號。
  function openLabRequest(n,order,actorId,id,stamp){
    n.reports.push({id:id('R'),p:order.p,kind:'Lab / exam',status:'pending',version:1,text:null,at:null,seen:[],processed:[],catalog:order.catalog||null,order:order.id,components:[]});
    n.tasks.push({id:id('T'),p:order.p,title:'Follow up '+order.id+' pending result',source:order.id,owner:actorId,status:'waiting',evidence:null,history:[]});
  }
  const clone = x => JSON.parse(JSON.stringify(x));
  // Special markers (特殊註記). Demo-only; a real deployment sources these from HIS.
  const flagTypes = {
    ALG:{label:'Allergy', tone:'danger'},
    ISO:{label:'Contact isolation', tone:'warning'},
    DNR:{label:'DNR', tone:'dark'},
    FALL:{label:'High fall risk', tone:'warning'},
    LINE:{label:'Central line', tone:'info'},
    VENT:{label:'Ventilator', tone:'info'},
    RESTRICT:{label:'Fluid restriction', tone:'info'}
  };
  // --- 過敏與問題清單：欄位取自 FHIR R4 AllergyIntolerance 與 Condition 的必要子集 -------
  //     值域用 FHIR 的原始代碼（active／confirmed／severe…），顯示層才翻中文；
  //     這是資料結構的對齊，不代表已有 FHIR 介接或院方核定的過敏主檔。
  const allergyValues = {
    clinicalStatus:['active','inactive','resolved'],
    verificationStatus:['unconfirmed','confirmed','refuted','entered-in-error'],
    type:['allergy','intolerance'],
    category:['medication','food','environment','biologic'],
    criticality:['low','high','unable-to-assess'],
    severity:['mild','moderate','severe'],
    substanceKind:['medication','ingredient','class']
  };
  const conditionValues = {
    clinicalStatus:['active','recurrence','relapse','inactive','remission','resolved'],
    verificationStatus:['unconfirmed','provisional','differential','confirmed','refuted','entered-in-error'],
    category:['problem-list-item','encounter-diagnosis']
  };
  const allergyStatuses = ['unknown','none-known','recorded'];

  // --- 藥囑的給藥欄位對齊 FHIR R5 Dosage／Timing（2026-09-26）-----------------------------------
  //     頻率＝Timing.code（TimingAbbreviation）展開成 Timing.repeat 的 frequency／period／periodUnit；
  //     療程＝Timing.repeat.boundsDuration；需要時＝asNeeded＋asNeededFor＋maxDosePerPeriod；
  //     連續輸注＝doseAndRate.rateQuantity；單次＝Timing.repeat.count 1；STAT 是 MedicationRequest.priority，不是頻率。
  //     途徑沿用院方 B 目錄（FHIR 對 route 的綁定是 Example，院方代碼即可）；給藥方法用 FHIR R5 的 SNOMED CT 值域。
  const UCUM = 'http://unitsofmeasure.org', SCT = 'http://snomed.info/sct';
  const TIMING_ABBR = 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation';
  const TIMING_C = 'http://terminology.hl7.org/CodeSystem/timing-abbreviation';
  // UnitsOfTime（Required binding）只收這幾個代碼。
  const unitsOfTime = {min:'min', h:'h', d:'days', wk:'weeks', mo:'months'};
  const unitHours = {min:1/60, h:1, d:24, wk:168, mo:720};
  // [選項鍵, FHIR 代碼（null＝TimingAbbreviation 沒有這個代碼，只送結構）, 中文, repeat]
  const timingGroups = [
    ['Fixed daily times', [['QD','QD','Once daily',{frequency:1,period:1,periodUnit:'d'}],['BID','BID','Twice daily',{frequency:2,period:1,periodUnit:'d'}],
      ['TID','TID','3 times daily',{frequency:3,period:1,periodUnit:'d'}],['QID','QID','4 times daily',{frequency:4,period:1,periodUnit:'d'}]]],
    ['Fixed interval', [['Q1H','Q1H','Every 1 h',{frequency:1,period:1,periodUnit:'h'}],['Q2H','Q2H','Every 2 h',{frequency:1,period:2,periodUnit:'h'}],
      ['Q3H','Q3H','Every 3 h',{frequency:1,period:3,periodUnit:'h'}],['Q4H','Q4H','Every 4 h',{frequency:1,period:4,periodUnit:'h'}],
      ['Q6H','Q6H','Every 6 h',{frequency:1,period:6,periodUnit:'h'}],['Q8H','Q8H','Every 8 h',{frequency:1,period:8,periodUnit:'h'}],
      ['Q12H',null,'Every 12 h',{frequency:1,period:12,periodUnit:'h'}]]],
    ['Interval (days)', [['QOD','QOD','Every other day',{frequency:1,period:2,periodUnit:'d'}],['3xWK',null,'Three times a week',{frequency:3,period:1,periodUnit:'wk'}],
      ['WK','WK','Once a week',{frequency:1,period:1,periodUnit:'wk'}],['MO','MO','Once a month',{frequency:1,period:1,periodUnit:'mo'}]]]
  ];
  const timingOptions = Object.fromEntries(timingGroups.flatMap(([,list]) => list.map(([key,code,label,repeat]) => [key, {code, label, repeat}])));
  const timingLabel = key => { const t = timingOptions[key]; return t ? (t.code ? t.code + ' (' + t.label + ')' : t.label) : key; };
  // EventTiming（Required binding）；不能和 timeOfDay 並用，本畫面不提供 timeOfDay。
  const eventTimings = {AC:'Before meals', PC:'After meals', C:'With meals', HS:'At bedtime', MORN:'Morning', NOON:'Noon', EVE:'Evening', NIGHT:'Night'};
  const priorities = {routine:'Routine', urgent:'Urgent', asap:'ASAP', stat:'STAT'};
  // SNOMED CT Administration Method（FHIR R5 值域 is-a 736665006）。
  const methods = {'738995006':['Swallow','Swallow'], '738992009':['Chew','Chew'], '740685003':['Inject','Inject'], '764794000':['Infuse','Infusion'],
    '740666001':['Inhale','Inhale'], '738996007':['Spray','Spray'], '738994005':['Instill','Instill'], '738991002':['Apply','Apply'],
    '738993004':['Insert','Placed'], '738990001':['Administer','Administer']};
  const rateUnits = {'mL/h':'mL/h', 'mg/h':'mg/h', 'ug/min':'mcg/min', 'ug/kg/min':'mcg/kg/min', 'mg/kg/h':'mg/kg/h', 'U/h':'U/h', 'meq/h':'mEq/h'};
  const boundsUnits = {d:'days', wk:'weeks', mo:'months'};
  const intervalUnits = {h:'h', min:'min', d:'days'};
  const ucum = (value, code, unit) => ({value, unit: unit || code, system: UCUM, code});

  // --- 時程類型：決定「在起訖之間怎麼給」，每一種對到 FHIR 的不同元素。頻率只屬於「排定重複」。
  const dosingModes = {
    once:      {label:'Single dose', frequency:'Single dose'},
    scheduled: {label:'Scheduled', frequency:null},
    prn:       {label:'PRN (as needed)', frequency:'PRN (as needed)'},
    infusion:  {label:'Continuous infusion', frequency:'Continuous infusion'}
  };

  function buildDosing(mode, entry, payload, must, text, dose) {
    const key = entry.key, num = k => String(payload[k + ':' + key] ?? '').trim();
    if (mode === 'once') {
      const stat = payload['priority:' + key] === 'stat';
      return {mode, frequency: stat ? 'STAT (immediate, single dose)' : dosingModes.once.frequency, timing: {repeat: {count: 1}}};
    }
    if (mode === 'infusion') {
      const raw = num('rate');
      must(raw !== '' && Number.isFinite(Number(raw)) && Number(raw) > 0, 'Continuous infusion requires a rate (a number greater than 0); it cannot be given without a rate');
      const unit = rateUnits[num('rateUnit')] ? num('rateUnit') : 'mL/h';
      return {mode, frequency: dosingModes.infusion.frequency, rate: raw + ' ' + rateUnits[unit], concentration: num('concentration'),
        rateQuantity: ucum(Number(raw), unit, rateUnits[unit]),
        timing: {code: {coding: [{system: TIMING_C, code: 'C', display: 'Continuous'}], text: 'Continuous infusion'}}};
    }
    if (mode === 'prn') {
      const indication = num('prnIndication');
      must(indication !== '', 'PRN requires an indication: when it may be given');
      const interval = num('prnInterval'), intervalUnit = intervalUnits[num('prnIntervalUnit')] ? num('prnIntervalUnit') : 'h';
      must(interval !== '' && Number.isFinite(Number(interval)) && Number(interval) > 0, 'PRN requires a minimum dosing interval (a number greater than 0)');
      const max = num('prnMax');
      must(max !== '' && Number.isFinite(Number(max)) && Number(max) > 0, 'PRN requires a 24 h maximum dose (greater than 0)');
      must(Number(max) >= dose.value, '24 h maximum dose cannot be less than the single dose');
      return {mode, frequency: dosingModes.prn.frequency, indication, minInterval: 'Every ' + interval + ' ' + intervalUnits[intervalUnit], maxPerDay: Number(max), maxUnit: dose.unit,
        asNeeded: true, asNeededFor: [{text: indication}],
        maxDosePerPeriod: [{numerator: {value: Number(max), unit: dose.unit}, denominator: ucum(24, 'h')}],
        timing: {repeat: {frequency: 1, period: Number(interval), periodUnit: intervalUnit}}};
    }
    // 排定重複：選一個 TimingAbbreviation，或自訂「每 N 單位 M 次」。
    const choice = num('frequency');
    must(choice !== '', 'Select a frequency for each medication');
    let repeat, code = null, label;
    if (choice === '__custom__') {
      const times = num('freqCount'), period = num('freqPeriod'), unit = num('freqUnit');
      must(/^\d+$/.test(times) && Number(times) >= 1 && Number(times) <= 24, 'Custom frequency: count must be a whole number from 1–24');
      must(period !== '' && Number.isFinite(Number(period)) && Number(period) > 0, 'Custom frequency: interval must be greater than 0');
      must(['h','d','wk','mo'].includes(unit), 'Custom frequency: invalid interval unit');
      repeat = {frequency: Number(times), period: Number(period), periodUnit: unit};
      label = times + '× every ' + period + ' ' + unitsOfTime[unit];
    } else {
      const def = timingOptions[choice];
      must(def, '“' + choice + '” is not in the frequency table; choose another or use custom');
      repeat = {...def.repeat}; code = def.code; label = timingLabel(choice);
    }
    const when = num('when');
    if (when) { must(eventTimings[when], 'Invalid administration timing code'); repeat.when = [when]; }
    const rawBound = num('days'), boundUnit = boundsUnits[num('daysUnit')] ? num('daysUnit') : 'd';
    must(rawBound === '' || (Number.isFinite(Number(rawBound)) && Number(rawBound) > 0 && Number(rawBound) * unitHours[boundUnit] <= 365 * 24),
      'Duration must be greater than 0 and no more than 365 days; leave blank to continue until stopped');
    const bound = rawBound === '' ? null : Number(rawBound);
    // 療程內至少要能排出一次給藥：次數 × 療程 ÷ 間隔 ≥ 1。
    if (bound) must(repeat.frequency * bound * unitHours[boundUnit] / (repeat.period * unitHours[repeat.periodUnit]) >= 1,
      '“' + label + '” with a ' + bound + ' ' + boundsUnits[boundUnit] + ' course yields no administration times in that period; adjust the frequency or duration');
    if (bound) repeat.boundsDuration = ucum(bound, boundUnit, boundsUnits[boundUnit]);
    return {mode, frequency: label + (when ? ' · ' + eventTimings[when] : ''), days: bound && boundUnit === 'd' ? bound : null, bounds: bound ? {value: bound, unit: boundUnit} : null,
      timing: {...(code ? {code: {coding: [{system: TIMING_ABBR, code}], text: label}} : {}), repeat}};
  }
  // 起 + 療程（boundsDuration）→ 訖。起訖一律用絕對時間，不用「住院第幾天」。
  function endFromBounds(start, value, unit) {
    // 把牆上時間當成 UTC 欄位做日曆加減，結果與瀏覽器所在時區無關。
    const at = new Date(TZ.millis(start) + TZ.OFFSET_MS);
    if (unit === 'mo') at.setUTCMonth(at.getUTCMonth() + value); else at.setUTCDate(at.getUTCDate() + value * (unit === 'wk' ? 7 : 1));
    return at.toISOString().slice(0, 16);
  }
  // 人讀得懂的一句話（Dosage.text：規格要求一律要有，且要和結構化欄位一致）。
  function dosageText(dose, route, method, dosing) {
    const parts = [dose.value + ' ' + dose.unit, route ? route.name : '', method ? methods[method][1] : '', dosing.frequency];
    if (dosing.mode === 'prn') parts.push('Indication: ' + dosing.indication, dosing.minInterval + ' max once', '24 h max ' + dosing.maxPerDay + ' ' + dose.unit);
    if (dosing.mode === 'infusion') parts.push('Rate ' + dosing.rate, dosing.concentration ? 'Concentration ' + dosing.concentration : '');
    if (dosing.bounds) parts.push('For ' + dosing.bounds.value + ' ' + boundsUnits[dosing.bounds.unit]);
    return parts.filter(Boolean).join(', ');
  }
  const pickValue = (list, value, fallback) => list.includes(String(value||'')) ? String(value) : fallback;

  // 認列時就把來源帶入的 ICD 收進本次住院的問題清單；照護目標與用藥檢核都讀這一份，不各自再問一次。
  function parseConditions(keys, actorId, onset, recordedAt, must, id) {
    const list = String(keys||'').split(',').map(x=>x.trim()).filter(Boolean).filter((x,i,all)=>all.indexOf(x)===i);
    must(list.length <= 20, 'Up to 20 admission diagnosis codes at a time');
    return list.map(token => {
      // 接受目錄鍵（icd:123）或 ICD 代碼（N18、N18.4）；兩者都要在 B 目錄裡查得到。
      const key = token.startsWith('icd:') ? token
        : (clinical.catalog.entries.find(e => e.kind === 'icd' && e.active && String(e.code).toUpperCase() === token.toUpperCase()) || {}).key;
      const code = key ? clinical.snapshot(key) : null;
      must(code && code.kind === 'icd' && code.active, 'ICD code not found: '+token);
      return {id: id('DX'), code, category: 'encounter-diagnosis', clinicalStatus: 'active',
        verificationStatus: 'confirmed', onset, recordedDate: recordedAt, recorder: actorId,
        source: 'Pending ICU admission pool (demo), not the HIS diagnosis master'};
    });
  }

  // 病人列上的單行過敏摘要：三種狀態各自有不同意義，不能都寫成同一句。
  function allergyText(status, allergies, confirmedBy) {
    if (status === 'none-known') return confirmedBy ? 'No known allergies (confirmed by the care team)' : 'Source records no known allergies';
    if (status !== 'recorded' || !allergies.length) return 'Not recorded by source; do not assume no allergies';
    return allergies.map(a => a.code.text + ' (' + a.reaction.manifestation + ')').join(', ');
  }

  const demoPatients = [
    {id:'A', name:'Fictional patient A', birthDate:'2012-05-10', ward:'201', bed:'201A', visitNo:'O26083000101', identifier:'DEMO-A', admitted:'2026-08-30', department:'ICU', attending:'Demo doctor · Chen', surgeryDate:'2026-08-30', icd:{key:'icd:3793', code:'I71.0', english:'Dissection of aorta [any part]', name:'Tách thành động mạch chủ [bất kỳ đoạn nào]', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Post-op care (illustrative)', flags:['ALG','LINE']},
    {id:'B', name:'Fictional patient B', birthDate:'2021-04-02', ward:'201', bed:'201B', visitNo:'O26082800112', identifier:'DEMO-B', admitted:'2026-08-28', department:'ICU', attending:'Demo doctor · Lin', surgeryDate:null, icd:{key:'icd:4179', code:'J96.0', english:'Acute respiratory failure', name:'Suy hô hấp [tiến triển] cấp tính', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Respiratory support follow-up (illustrative)', flags:['ISO','VENT']},
    {id:'C', name:'Fictional patient C', birthDate:'2018-09-15', ward:'201', bed:'201C', visitNo:'O26082900133', identifier:'DEMO-C', admitted:'2026-08-29', department:'ICU', attending:'Demo doctor · Wang', surgeryDate:null, icd:{key:'icd:3989', code:'J18.9', english:'Pneumonia, unspecified', name:'Viêm phổi, không xác định', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Bedside care (illustrative)', flags:['FALL']},
    {id:'D', name:'Fictional patient D', birthDate:'2011-12-01', ward:'202', bed:'202A', visitNo:'O26082700144', identifier:'DEMO-D', admitted:'2026-08-27', department:'ICU', attending:'Demo doctor · Chen', surgeryDate:'2026-08-27', icd:{key:'icd:11722', code:'I21.9', english:'Acute myocardial infarction, unspecified', name:'Nhồi máu cơ tim cấp tính, không xác định', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Post-op circulation monitoring (illustrative)', flags:['DNR','LINE']},
    {id:'E', name:'Fictional patient E', birthDate:'2019-06-20', ward:'202', bed:'202B', visitNo:'O26082500155', identifier:'DEMO-E', admitted:'2026-08-25', department:'ICU', attending:'Demo doctor · Zhang', surgeryDate:'2026-08-26', icd:{key:'icd:7997', code:'S06.9', english:'Intracranial injury, unspecified', name:'Tổn thương nội sọ, không xác định', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Post-op consciousness assessment (illustrative)', flags:['FALL']},
    {id:'F', name:'Fictional patient F', birthDate:'2023-02-11', ward:'202', bed:'202C', visitNo:'O26082300166', identifier:'DEMO-F', admitted:'2026-08-23', department:'ICU', attending:'Demo doctor · Wang', surgeryDate:null, icd:{key:'icd:15486', code:'R50.9', english:'Fever, unspecified', name:'Sốt, không xác định', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Fever of unknown origin (illustrative)', flags:[]},
    {id:'G', name:'Fictional patient G', birthDate:'2016-01-25', ward:'203', bed:'203A', visitNo:'O26082000177', identifier:'DEMO-G', admitted:'2026-08-20', department:'ICU', attending:'Demo doctor · Chen', surgeryDate:'2026-08-21', icd:{key:'icd:3698', code:'I50.9', english:'Heart failure, unspecified', name:'Suy tim, không xác định', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Post-op breathing exercises (illustrative)', flags:['VENT','RESTRICT']},
    {id:'H', name:'Fictional patient H', birthDate:'2024-07-07', ward:'203', bed:'203B', visitNo:'O26081800188', identifier:'DEMO-H', admitted:'2026-08-18', department:'ICU', attending:'Demo doctor · Li', surgeryDate:null, icd:{key:'icd:228', code:'A41.9', english:'Sepsis, unspecified', name:'Nhiễm trùng hệ thống, không xác định', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Infection source follow-up (illustrative)', flags:['ISO','ALG']},
    {id:'I', name:'Fictional patient I', ward:'203', bed:'203C', visitNo:'O26081500199', identifier:'DEMO-I', admitted:'2026-08-15', department:'ICU', attending:'Demo doctor · Lin', surgeryDate:null, icd:{key:'icd:4078', code:'J44.9', english:'Chronic obstructive pulmonary disease, unspecified', name:'Bệnh phổi tắc nghẽn mạn tính, không xác định', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Long-term respiratory support (illustrative)', flags:['VENT','DNR']},
    {id:'J', name:'Fictional patient J', birthDate:'2025-07-15', ward:'203', bed:'203D', visitNo:'O26081200210', identifier:'DEMO-J', admitted:'2026-08-12', department:'ICU', attending:'Demo doctor · Wang', surgeryDate:null, icd:{key:'icd:12971', code:'E87.6', english:'Hypokalaemia', name:'Hạ kali máu', source:'B/1_外部標準碼/20_ICD10診斷碼.csv'}, problem:'Nutrition and growth follow-up (illustrative)', flags:['RESTRICT']}
  ];
  const ALL_DEMO_PATIENTS = demoPatients.map(x=>x.id);
  // HIS 帶進來的行政與入院資料（2026-10-27，D7 §5.1–5.3 欄位名）：全部虛構；G–J 刻意不給，示範「HIS 未提供」。
  const demoHis = {
    A:{admissionTime:'2026-08-30T07:40',icuEntryTime:'2026-08-30T18:00',admitSource:'emd',entryPoint:'EMERGENCY',admissionCountForCondition:1,archiveId:'DEMO-ARC-A1',
      demographics:{ethnicity:'Kinh',nationality:'Viet Nam',occupation:'Student',address:'Demo address 1, Demo commune, Demo province',telecom:'0000 000 101 (demo)'},
      relatedPersons:[{name:'Fictional guardian A',relationship:'Mother',telecom:'0000 000 102 (demo)',occupation:'Office worker',educationLevel:'12/12'}],
      coverage:{patientType:'BHYT',coverages:[{coverageNumber:'TE1-DEMO-000101',coverageBenefitRate:100,coverageStartDate:'2026-01-01',coverageEndDate:'2026-12-31',coverageRegisteredFacility:'Demo facility',coverageStatus:'1'}]},
      referralDiagnosis:null,emergencyDiagnosis:{code:'I71.0',name:'Dissection of aorta [any part]'}},
    B:{admissionTime:'2026-08-28T10:15',icuEntryTime:'2026-08-28T14:30',admitSource:'hosp-trans',entryPoint:'EMERGENCY',admissionCountForCondition:2,archiveId:'DEMO-ARC-B1',
      demographics:{ethnicity:'Tày',nationality:'Viet Nam',occupation:'Child under school age',address:'Demo address 2, Demo commune, Demo province',telecom:'0000 000 201 (demo)'},
      relatedPersons:[{name:'Fictional guardian B1',relationship:'Father',telecom:'0000 000 202 (demo)',occupation:'Farmer',educationLevel:'9/12'},{name:'Fictional guardian B2',relationship:'Mother',telecom:'0000 000 203 (demo)',occupation:'Trader',educationLevel:'12/12'}],
      coverage:{patientType:'BHYT',coverages:[{coverageNumber:'TE1-DEMO-000201',coverageBenefitRate:100,coverageStartDate:'2026-01-01',coverageEndDate:'2026-12-31',coverageRegisteredFacility:'Demo facility',coverageStatus:'1'}]},
      referralDiagnosis:{code:'J18.9',name:'Pneumonia, unspecified',facility:'Demo provincial hospital'},emergencyDiagnosis:{code:'J96.0',name:'Acute respiratory failure'}},
    C:{admissionTime:'2026-08-29T21:05',icuEntryTime:'2026-08-29T23:40',admitSource:'emd',entryPoint:'EMERGENCY',admissionCountForCondition:1,archiveId:'DEMO-ARC-C1',
      demographics:{ethnicity:'Kinh',nationality:'Viet Nam',occupation:'Student',address:'Demo address 3, Demo commune, Demo province',telecom:null},
      relatedPersons:[{name:'Fictional guardian C',relationship:'Grandparent',telecom:'0000 000 302 (demo)',occupation:null,educationLevel:null}],
      coverage:{patientType:'SELF_PAY',coverages:[]},referralDiagnosis:null,emergencyDiagnosis:{code:'J18.9',name:'Pneumonia, unspecified'}},
    D:{admissionTime:'2026-08-27T08:00',icuEntryTime:'2026-08-27T16:20',admitSource:'outp',entryPoint:'OUTPATIENT',admissionCountForCondition:3,archiveId:'DEMO-ARC-D1',
      demographics:{ethnicity:'Kinh',nationality:'Viet Nam',occupation:'Student',address:'Demo address 4, Demo commune, Demo province',telecom:'0000 000 401 (demo)'},
      relatedPersons:[{name:'Fictional guardian D',relationship:'Mother',telecom:'0000 000 402 (demo)',occupation:'Teacher',educationLevel:'12/12'}],
      coverage:{patientType:'BHYT',coverages:[{coverageNumber:'HS4-DEMO-000401',coverageBenefitRate:80,coverageStartDate:'2026-01-01',coverageEndDate:'2026-09-30',coverageRegisteredFacility:'Demo facility',coverageStatus:'1'}]},referralDiagnosis:null,emergencyDiagnosis:null},
    E:{admissionTime:'2026-08-25T09:30',icuEntryTime:'2026-08-26T13:10',admitSource:'hosp-trans',entryPoint:'DIRECT',admissionCountForCondition:1,archiveId:'DEMO-ARC-E1',
      demographics:{ethnicity:'H’Mông',nationality:'Viet Nam',occupation:'Child under school age',address:'Demo address 5, Demo commune, Demo province',telecom:null},
      relatedPersons:[],coverage:{patientType:'BHYT',coverages:[{coverageNumber:'TE1-DEMO-000501',coverageBenefitRate:100,coverageStartDate:'2026-01-01',coverageEndDate:'2026-12-31',coverageRegisteredFacility:'Demo facility',coverageStatus:'1'}]},
      referralDiagnosis:{code:'Q21.0',name:'Ventricular septal defect',facility:'Demo provincial hospital'},emergencyDiagnosis:null},
    F:{admissionTime:'2026-08-23T02:50',icuEntryTime:'2026-08-23T04:15',admitSource:'emd',entryPoint:'EMERGENCY',admissionCountForCondition:1,archiveId:'DEMO-ARC-F1',
      demographics:{ethnicity:'Kinh',nationality:'Viet Nam',occupation:'Child under school age',address:'Demo address 6, Demo commune, Demo province',telecom:'0000 000 601 (demo)'},
      relatedPersons:[{name:'Fictional guardian F',relationship:'Mother',telecom:'0000 000 602 (demo)',occupation:'Factory worker',educationLevel:'9/12'}],
      coverage:{patientType:'BHYT',coverages:[{coverageNumber:'TE1-DEMO-000601',coverageBenefitRate:100,coverageStartDate:'2026-01-01',coverageEndDate:'2026-12-31',coverageRegisteredFacility:'Demo facility',coverageStatus:'2'}]},referralDiagnosis:null,emergencyDiagnosis:{code:'R50.9',name:'Fever, unspecified'}}
  };
  // 待入 ICU 病人池（2026-09-26）：院方系統透過 API 通知「哪些人要進 ICU」，推進來的就是這一池。
  // 身分、入院與診斷由來源帶入，認列者只補主治、主要護理師與床位。還在等待進 ICU 的病人沒有床位，所以來源不帶病房病床。
  // 以下為虛構示範資料，不是 HIS 實際格式。
  const demoPool = [
    {id:'ADM-01', name:'Fictional patient K', identifier:'DEMO-K', visitNo:'O26083100301', birthDate:'2019-03-14', gender:'male', admitted:'2026-08-31', fromDepartment:'Emergency', department:'Cardiac surgery', ward:'CS1', bed:'CS1-01', doctorUsername:'D002', admitSource:'emd', entryPoint:'EMERGENCY', pushedAt:'2026-08-31T08:40',
      problem:'Septic shock, transferred from emergency', icds:'A41.9', allergyStatus:'unknown', flags:['ISO']},
    {id:'ADM-02', name:'Fictional patient L', identifier:'DEMO-L', visitNo:'O26083100302', birthDate:'2024-11-02', gender:'female', admitted:'2026-08-30', fromDepartment:'Cardiac surgery', department:'ICU', ward:'204', bed:'204B', doctorUsername:'D001', admitSource:'other', entryPoint:'DIRECT', pushedAt:'2026-08-31T08:55',
      problem:'Transferred after coronary artery bypass grafting', icds:'I21.9', allergyStatus:'recorded', flags:['ALG','LINE'], admissionWeight:12.4, admissionWeightAt:'2026-08-30T09:10',
      allergies:[{substanceKind:'ingredient', text:'Ibuprofen', manifestation:'Urticaria', severity:'moderate', criticality:'low', verificationStatus:'confirmed'}]},
    {id:'ADM-03', name:'Fictional patient M', identifier:'DEMO-M', visitNo:'O26083100303', birthDate:'2016-07-21', gender:'male', admitted:'2026-08-31', fromDepartment:'Neurosurgery', department:'Cardiac surgery', ward:'CS1', bed:'CS1-02', doctorUsername:'D002', admitSource:'other', entryPoint:'DIRECT', pushedAt:'2026-08-31T09:05',
      problem:'Post-op observation for intracranial hemorrhage', icds:'S06.9', allergyStatus:'none-known', flags:['FALL']},
    {id:'ADM-04', name:'Fictional patient N', identifier:'DEMO-N', visitNo:'O26082900304', birthDate:'2013-01-30', gender:'female', admitted:'2026-08-29', fromDepartment:'Pulmonology ward', department:'ICU', ward:'205', bed:'205B', doctorUsername:'D001', admitSource:'other', entryPoint:'DIRECT', pushedAt:'2026-08-31T09:20',
      problem:'Acute respiratory failure, transferred after deterioration on ward', icds:'J96.0', allergyStatus:'unknown', flags:['VENT']}
  ];
  const seedPool = () => demoPool.map(x => ({...clone(x), status:'queued', source:'HIS AdmissionCreated (demo)'}));
  // 手術與圍術期紀錄的示範資料（2026-09-26）：讓院方看到手動登錄後長什麼樣子。全部是虛構內容，欄位照 periop-forms.js 與 I-E-03-001。
  // 已有儲存的瀏覽器用 id 補上缺的，不覆寫使用者自己登錄或修訂的紀錄。
  const demoSurgeries = () => [{"id":"DEMO-OR-A1","p":"A","performedAt":"2026-08-30T13:40","ward":"201","bed":"201A","preDiagnosis":"Stanford type A aortic dissection (fictional demo)","procedure":"Ascending aorta and hemiarch replacement (fictional demo)","category":"DBA","anesthesia":"General anesthesia","anesthetists":["Demo anesthesiologist · Pham"],"diagram":["data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0ODAiIGhlaWdodD0iMzIwIiB2aWV3Qm94PSIwIDAgNDgwIDMyMCI+PHJlY3Qgd2lkdGg9IjQ4MCIgaGVpZ2h0PSIzMjAiIGZpbGw9IiNmZmZmZmYiLz48dGV4dCB4PSIxNiIgeT0iMzAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjMTgzNjQxIj5Bc2NlbmRpbmcgYW9ydGEgYW5kIGhlbWlhcmNoIHJlcGxhY2VtZW50IChpbGx1c3RyYXRpdmUsIGZpY3Rpb25hbCk8L3RleHQ+PHBhdGggZD0iTTIxMCAyOTAgQyAyMTAgMjEwLCAxOTYgMTYwLCAyMzYgMTE4IEMgMjc2IDc4LCAzMzggNzgsIDM2OCAxMTggTCAzNjggMjkwIiBmaWxsPSJub25lIiBzdHJva2U9IiNiOWM2Y2IiIHN0cm9rZS13aWR0aD0iMjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxwYXRoIGQ9Ik0yMTAgMjYyIEMgMjEwIDIxMCwgMTk2IDE2MCwgMjM2IDExOCBDIDI2MiA5MiwgMjkyIDgyLCAzMTggODYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzBlN2M5MCIgc3Ryb2tlLXdpZHRoPSIyNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGxpbmUgeDE9IjE1MCIgeTE9IjE5NiIgeDI9IjIwMiIgeTI9IjE4MiIgc3Ryb2tlPSIjMGU3YzkwIiBzdHJva2Utd2lkdGg9IjIiLz48dGV4dCB4PSIzNiIgeT0iMjA0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzBlN2M5MCI+MjggbW0gZ3JhZnQ8L3RleHQ+PHRleHQgeD0iMzc4IiB5PSIyNTAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjEzIiBmaWxsPSIjNTQ2Yjc1Ij5EZXNjZW5kaW5nIGFvcnRhPC90ZXh0Pjwvc3ZnPg=="],"steps":"Median sternotomy; cardiopulmonary bypass via femoral artery and right atrial cannulation; hemiarch replacement under deep hypothermic circulatory arrest for 28 min using a 28 mm graft; chest closed after hemostasis, 2 mediastinal drains placed. (fictional demo)","signedDate":"2026-08-30","signer":"Demo surgeon · Chou","postDiagnosis":"Stanford type A aortic dissection (fictional demo)","surgeons":[{"name":"Demo surgeon · Chou","role":"primary"}],"author":"nurse","version":1,"replaces":null,"reason":null,"at":"2026-08-30T11:10:00.000Z","status":"saved","form":"I-E-03-001","source":"Fictional demo data (example of manual entry by clinical staff)"},{"id":"DEMO-OR-A2","p":"A","performedAt":"2026-08-30T13:40","ward":"201","bed":"201A","preDiagnosis":"Stanford type A aortic dissection (fictional demo)","procedure":"Ascending aorta and hemiarch replacement (fictional demo)","category":"DBA","anesthesia":"General anesthesia","anesthetists":["Demo anesthesiologist · Pham"],"diagram":["data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0ODAiIGhlaWdodD0iMzIwIiB2aWV3Qm94PSIwIDAgNDgwIDMyMCI+PHJlY3Qgd2lkdGg9IjQ4MCIgaGVpZ2h0PSIzMjAiIGZpbGw9IiNmZmZmZmYiLz48dGV4dCB4PSIxNiIgeT0iMzAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjMTgzNjQxIj5Bc2NlbmRpbmcgYW9ydGEgYW5kIGhlbWlhcmNoIHJlcGxhY2VtZW50IChpbGx1c3RyYXRpdmUsIGZpY3Rpb25hbCk8L3RleHQ+PHBhdGggZD0iTTIxMCAyOTAgQyAyMTAgMjEwLCAxOTYgMTYwLCAyMzYgMTE4IEMgMjc2IDc4LCAzMzggNzgsIDM2OCAxMTggTCAzNjggMjkwIiBmaWxsPSJub25lIiBzdHJva2U9IiNiOWM2Y2IiIHN0cm9rZS13aWR0aD0iMjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxwYXRoIGQ9Ik0yMTAgMjYyIEMgMjEwIDIxMCwgMTk2IDE2MCwgMjM2IDExOCBDIDI2MiA5MiwgMjkyIDgyLCAzMTggODYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzBlN2M5MCIgc3Ryb2tlLXdpZHRoPSIyNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGxpbmUgeDE9IjE1MCIgeTE9IjE5NiIgeDI9IjIwMiIgeTI9IjE4MiIgc3Ryb2tlPSIjMGU3YzkwIiBzdHJva2Utd2lkdGg9IjIiLz48dGV4dCB4PSIzNiIgeT0iMjA0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzBlN2M5MCI+MjggbW0gZ3JhZnQ8L3RleHQ+PHRleHQgeD0iMzc4IiB5PSIyNTAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjEzIiBmaWxsPSIjNTQ2Yjc1Ij5EZXNjZW5kaW5nIGFvcnRhPC90ZXh0Pjwvc3ZnPg=="],"steps":"Median sternotomy; cardiopulmonary bypass via femoral artery and right atrial cannulation; hemiarch replacement under deep hypothermic circulatory arrest for 28 min using a 28 mm graft; chest closed after hemostasis, 2 mediastinal drains placed. (fictional demo)","signedDate":"2026-08-30","signer":"Demo surgeon · Chou","postDiagnosis":"Stanford type A aortic dissection, ascending aortic intimal tear (fictional demo)","surgeons":[{"name":"Demo surgeon · Chou","role":"primary"},{"name":"Demo surgeon · Le","role":"assistant"}],"author":"doctor","version":2,"replaces":"DEMO-OR-A1","reason":"Added assistant and post-op diagnosis","at":"2026-08-31T00:20:00.000Z","status":"saved","form":"I-E-03-001","source":"Fictional demo data (example of manual entry by clinical staff)"},{"id":"DEMO-OR-D1","p":"D","performedAt":"2026-08-27T09:15","ward":"202","bed":"202A","preDiagnosis":"Acute myocardial infarction, three-vessel coronary stenosis (fictional demo)","postDiagnosis":"Same as pre-op","procedure":"Coronary artery bypass grafting ×3 (LIMA-LAD, SVG-OM, SVG-RCA) (fictional demo)","category":"1A","anesthesia":"General anesthesia","surgeons":[{"name":"Demo surgeon · Chou","role":"primary"},{"name":"Demo surgeon · Le","role":"assistant"}],"anesthetists":["Demo anesthesiologist · Pham"],"diagram":[],"steps":"Median sternotomy, left internal mammary artery and great saphenous vein harvested; three bypasses completed on cardiopulmonary bypass; chest closed and mediastinal drains placed. (fictional demo)","signedDate":"2026-08-27","signer":"Demo surgeon · Chou","author":"doctor","version":1,"replaces":null,"reason":null,"at":"2026-08-27T07:30:00.000Z","status":"saved","form":"I-E-03-001","source":"Fictional demo data (example of manual entry by clinical staff)"},{"id":"DEMO-OR-E1","p":"E","performedAt":"2026-08-26T21:30","ward":"202","bed":"202B","preDiagnosis":"Traumatic intracranial hemorrhage (fictional demo)","postDiagnosis":"Left acute subdural hematoma (fictional demo)","procedure":"Left craniotomy and hematoma evacuation (fictional demo)","category":"1B","anesthesia":"General anesthesia","surgeons":[{"name":"Demo neurosurgeon · Huang","role":"primary"}],"anesthetists":["Demo anesthesiologist · Nguyen"],"diagram":[],"steps":"Left frontotemporoparietal craniotomy, approx. 60 ml subdural hematoma evacuated; 1 subdural drain placed after hemostasis. (fictional demo)","signedDate":"2026-08-27","signer":"Demo neurosurgeon · Huang","author":"nurseWard","version":1,"replaces":null,"reason":null,"at":"2026-08-27T02:00:00.000Z","status":"saved","form":"I-E-03-001","source":"Fictional demo data (example of manual entry by clinical staff)"},{"id":"DEMO-OR-G1","p":"G","performedAt":"2026-08-21T08:30","ward":"203","bed":"203A","preDiagnosis":"Severe mitral regurgitation with heart failure (fictional demo)","postDiagnosis":"Same as pre-op","procedure":"Mitral valve replacement (27 mm mechanical valve) (fictional demo)","category":"DBB","anesthesia":"General anesthesia","surgeons":[{"name":"Demo surgeon · Chou","role":"primary"}],"anesthetists":["Demo anesthesiologist · Pham"],"diagram":[],"steps":"Median sternotomy; mitral valve replaced via left atriotomy on cardiopulmonary bypass; chest closed and drains placed. (fictional demo)","signedDate":"2026-08-21","signer":"Demo surgeon · Chou","author":"doctor","version":1,"replaces":null,"reason":null,"at":"2026-08-21T06:00:00.000Z","status":"saved","form":"I-E-03-001","source":"Fictional demo data (example of manual entry by clinical staff)"}];
  const demoPeriop = () => [{"id":"DEMO-PO-A-ANES","p":"A","form":"anesthesia","code":"I-E-02-004","data":{"weight":62,"abo":"O","rh":"Rh+","category":"DBA","surgeryDate":"2026-08-30","diagnosis":"Stanford type A aortic dissection (fictional demo)","position":"Supine","method":"Ascending aorta and hemiarch replacement (fictional demo)","anesthesiaMethod":"General anesthesia","intubated":true,"ettSize":"7.5","ettDepth":22,"ettCuff":true,"auscultation":"Breath sounds symmetric bilaterally","mask":false,"regional":false,"regionalType":"","premed":true,"premedDrug":"Midazolam 2 mg IV","surgeons":"Demo surgeon · Chou, Demo surgeon · Le","anesthetists":"Demo anesthesiologist · Pham","asa":"4","fullStomach":"","difficultAirway":"no","difficultAirwayNote":"","allergy":"yes","allergyNote":"Penicillins: urticaria and angioedema","history":"Hypertension for 10 years, on regular medication (fictional demo)","procedures":["Endotracheal intubation","Arterial line","Central venous catheter","Urinary catheter"],"vitals":[{"at":"2026-08-30T13:20","pulse":92,"sbp":148,"dbp":86},{"at":"2026-08-30T13:50","pulse":84,"sbp":112,"dbp":64},{"at":"2026-08-30T16:40","pulse":96,"sbp":94,"dbp":52},{"at":"2026-08-30T17:20","pulse":88,"sbp":108,"dbp":62}],"intraop":[{"at":"2026-08-30T15:00","temp":24.5,"bloodLoss":"","urine":120,"cvp":6},{"at":"2026-08-30T17:00","temp":36.1,"bloodLoss":650,"urine":260,"cvp":9}],"resp":[{"at":"2026-08-30T13:30","machine":"Dräger (demo)","rr":12,"vt":450,"pip":18,"mode":"VCV","etco2":36,"spo2":99},{"at":"2026-08-30T17:10","machine":"Dräger (demo)","rr":14,"vt":450,"pip":20,"mode":"VCV","etco2":38,"spo2":98}],"sevo":[{"at":"2026-08-30T13:40","conc":1.5,"flow":2},{"at":"2026-08-30T16:50","conc":1,"flow":2}],"drugs":[{"name":"Fentanyl","route":"IV","kind":"bolus","at":"2026-08-30T13:25","start":"","end":"","dose":"200 mcg"},{"name":"Propofol","route":"IV","kind":"bolus","at":"2026-08-30T13:25","start":"","end":"","dose":"80 mg"},{"name":"Rocuronium","route":"IV","kind":"bolus","at":"2026-08-30T13:27","start":"","end":"","dose":"50 mg"},{"name":"Heparin","route":"IV","kind":"bolus","at":"2026-08-30T14:05","start":"","end":"","dose":"18000 IU"},{"name":"Fentanyl","route":"IV","kind":"bolus","at":"2026-08-30T15:10","start":"","end":"","dose":"100 mcg"},{"name":"Noradrenaline","route":"CVC","kind":"infusion","at":"","start":"2026-08-30T16:45","end":"","dose":"0.08 mcg/kg/min"}],"fluids":[{"name":"Ringer lactate","type":"IV fluids","at":"2026-08-30T14:00","amount":1000},{"name":"NaCl 0.9%","type":"IV fluids","at":"2026-08-30T16:00","amount":500},{"name":"Packed red blood cells PRBC","type":"Blood products","at":"2026-08-30T16:30","amount":500},{"name":"Fresh frozen plasma FFP","type":"Blood products","at":"2026-08-30T16:50","amount":400}],"conclusion":"Anesthesia uneventful; Noradrenaline support required after weaning from bypass; transferred to ICU intubated. (fictional demo)","signedAt":"2026-08-30T18:00","signer":"Demo anesthesiologist · Pham"},"surgeryId":"DEMO-OR-A2","author":"nurse","version":1,"replaces":null,"reason":null,"at":"2026-08-30T12:10:00.000Z","source":"Fictional demo data (example of manual entry by clinical staff)"},{"id":"DEMO-PO-A-HO","p":"A","form":"cardiacHandover","code":"BM1","data":{"handoverAt":"2026-08-30T18:10","intraopAllergy":"None","weight":62,"diagnosis":"Stanford type A aortic dissection, ascending aortic intimal tear (fictional demo)","history":"No history of cardiac surgery","preopImaging":"CT: ascending aortic dissection extending to the aortic arch; echocardiography EF 55%, mild aortic regurgitation (fictional demo)","procedure":"Ascending aorta and hemiarch replacement, 28 mm graft (fictional demo)","drains":"Mediastinal drains ×2 (28 Fr)","pacing":"Atrial and ventricular pacing wires, 1 set each; sinus rhythm 88/min; pacemaker DDD 80 on standby","pressureLines":"Left atrial pressure line (LAP)","postopEcho":"Post-op TEE: mild aortic regurgitation, no pericardial effusion","surgicalPlan":"Keep systolic BP 100–120 mmHg; record drain output hourly, notify surgery if >200 ml/h","preop24":"Spontaneous breathing","preop24Note":"Awake, chest pain controlled with Morphine","preopLabs":"Cr 1.3 mg/dL; Hb 11.8 g/dL (fictional demo)","maskVent":"Easy","maskVentReason":"","ettType":"7.5 cuffed","ettDepth":22,"ettEase":"Easy","ettReason":"","artSite":"Right radial artery","artGauge":"20","pivc":"Yes","pivcCount":2,"pivcSite":"Left dorsal hand, right forearm","cvcSite":"Right internal jugular vein","cvcSize":8.5,"cvcLumen":3,"cvcDepth":15,"regional":"","preCpb":"Hypertensive, controlled with Nicardipine","cpbMin":186,"clampMin":112,"lowFlowMin":0,"arrestMin":28,"lowestTemp":22,"cpbDifficulty":"Required Noradrenaline 0.08 mcg/kg/min on weaning from bypass","lastHct":28,"lastAct":480,"postCpbCourse":"Hemostasis took approx. 60 min; drain output decreased after PRBC 500 ml and FFP 400 ml","adrenalin":"","dopamin":5,"milrinone":0.3,"cacl2":10,"otherDrugs":"Noradrenaline 0.08 mcg/kg/min","prbc":500,"plt":"","ffp":400,"cryo":"","extubated":"In place","avpu":"U","pupils":"Symmetric","pupilSize":"2 mm","lightReflex":"Yes","hr":88,"bp":"108/62","cvp":9,"spo2":99,"temp":36.2,"ventMode":"SIMV-PC","ventPressure":"18/5","ventRate":14,"fio2":50,"abxName":"Cefazolin","abxAt":"2026-08-30T16:30","abxDose":30,"maintenance":"Propofol 2 mg/kg/h","lastRelaxant":"Rocuronium 20 mg (15:40)","reversal":"Not given","postCpbUrine":380,"diuretic":"Furosemide 10 mg","abgPh":7.36,"abgPco2":41,"abgPo2":188,"abgNa":139,"abgK":4.2,"abgCa":1.12,"abgGlu":9.8,"abgLac":2.6,"abgHct":29,"abgHco3":23,"abgBe":-2,"abgSo2":99,"actPre":118,"actPost":132,"pltPre":210,"pltPost":112,"leftPrbc":250,"leftPrbcAt":"2026-08-30T17:40","leftPlt":"","leftPltAt":"","leftFfp":200,"leftFfpAt":"2026-08-30T17:40","leftCryo":"","leftCryoAt":"","handoverDrugs":"Noradrenaline, Milrinone, Dopamin infusing; Propofol sedation","otherNotes":"Penicillin allergy; family briefed outside the OR","icuSurgery":"Ascending aorta and hemiarch replacement","residual":"Residual descending aortic dissection, managed conservatively","comorbid":"Hypertension","cvStatus":"Requires Noradrenaline and Dopamin support","cvDrugs":"Nicardipine on standby","cvPacer":"DDD 80 on standby; activate if heart rate below 60","goalBp":"100–120 (systolic)","goalHr":"80–100","goalCvp":"8–12","goalLap":"8–12","goalPap":"","cvPlan":"Wean Noradrenaline gradually; keep fluid balance negative by 200–500 ml in the first 24 h","respStatus":"SIMV-PC, FiO₂ 50%, SpO₂ 99%","goalSpo2":">95%","goalPao2":">80","goalPco2":"35–45","goalPeep":"5","weanPlan":"Assess for extubation 6–12 h post-op once hemodynamically stable and bleeding controlled","neuroStatus":"Sedated, pupils symmetric 2 mm","fentanyl":"1 mcg/kg/h","midazolam":"","dexmed":"","paracetamol":"15 mg/kg q6h","atracurium":"","cisatracurium":"","renalPlan":"Give Furosemide if urine output below 0.5 ml/kg/h for 2 consecutive hours","bleedRisk":"High: after deep hypothermic circulatory arrest","transfusion":"Hb <8 g/dL: transfuse RBCs; PLT <50k with bleeding: transfuse platelets","anticoag":"No anticoagulation within 24 h post-op","abxPlan":[{"name":"Cefazolin","dose":"30 mg/kg q8h","stopAt":"2026-09-01T16:30"}],"nutrition":"Start enteral nutrition on post-op day 1","otherIssues":"","nurseUnderstood":"yes","nurseCanAnswer":"yes","teamAgreed":"yes","signAnesthetist":"Demo anesthesiologist · Pham","signSurgeon":"Demo surgeon · Chou","signPerfusionist":"Demo perfusionist · Dao","signIcuDoctor":"Demo ICU doctor · Chen","signIcuNurse":"Demo nurse · Day shift"},"surgeryId":"DEMO-OR-A2","author":"doctor","version":1,"replaces":null,"reason":null,"at":"2026-08-30T12:30:00.000Z","source":"Fictional demo data (example of manual entry by clinical staff)"},{"id":"DEMO-PO-A-PROC","p":"A","form":"procedure","code":"I-E-03-002","data":{"diagnosis":"Stanford type A aortic dissection (fictional demo)","toDepartment":"ICU","plannedSurgery":"Ascending aorta and hemiarch replacement","anesthesiaMethod":"General anesthesia","surgeons":"Demo surgeon · Chou","anesthetists":"Demo anesthesiologist · Pham","intubation":"yes","midazolam":30,"ketamin":"","propofol":1.5,"fentanyl":3,"rocuronium":0.8,"atracurium":"","bagO2":100,"bagFlow":8,"ettSize":"7.5","ettDepth":22,"ettUsed":1,"arterial":"yes","arterialSite":"Right radial artery","g24":"","g22":1,"cvc":"yes","cvcDepth":15,"cvcSite":"Right internal jugular vein","cvcSets":1,"cvcSize":8.5,"cvcLumen":3,"foley":"yes","foleyType":"Foley 2-way","foleySize":14,"foleyDepth":"","performedDate":"2026-08-30","signer":"Demo anesthesiologist · Pham"},"surgeryId":"DEMO-OR-A2","author":"nurse","version":1,"replaces":null,"reason":null,"at":"2026-08-30T12:40:00.000Z","source":"Fictional demo data (example of manual entry by clinical staff)"},{"id":"DEMO-PO-A-CPB","p":"A","form":"cpb","code":"I-E-04-001","data":{"surgery":"Ascending aorta and hemiarch replacement (fictional demo)","inOxygenator":1400,"inHemoconc":"","inExtra":500,"inCpg":1200,"inPerfusate":300,"outOxygenator":600,"outUrine":380,"outUltra":1800,"outSuction":200,"outOther":"","runMin":186,"clampMin":112,"assistMin":35,"arrestMin":28,"lowestRectal":22,"defib":"yes","defibNote":"Ventricular fibrillation after cross-clamp release, defibrillated once at 10 J","restart":"no","restartNote":"","dopamine":5,"noradrenaline":0.08,"otherDrugs":"Milrinone 0.3 mcg/kg/min","filterDuring":true,"filterAfter":true,"bloodTyping":false,"hypothermia":true,"runDate":"2026-08-30","performer":"Demo perfusionist · Dao"},"surgeryId":"DEMO-OR-A2","author":"nurse","version":1,"replaces":null,"reason":null,"at":"2026-08-30T12:50:00.000Z","source":"Fictional demo data (example of manual entry by clinical staff)"},{"id":"DEMO-PO-E-ANES","p":"E","form":"anesthesia","code":"I-E-02-004","data":{"weight":70,"abo":"A","rh":"Rh+","category":"1B","surgeryDate":"2026-08-26","diagnosis":"Traumatic intracranial hemorrhage (fictional demo)","position":"Supine, head turned to the right","method":"Left craniotomy and hematoma evacuation (fictional demo)","anesthesiaMethod":"General anesthesia","intubated":true,"ettSize":"7.5","ettDepth":23,"ettCuff":true,"auscultation":"Bilaterally symmetric","mask":false,"regional":false,"regionalType":"","premed":false,"premedDrug":"","surgeons":"Demo neurosurgeon · Huang","anesthetists":"Demo anesthesiologist · Nguyen","asa":"3","fullStomach":"yes","difficultAirway":"no","difficultAirwayNote":"","allergy":"no","allergyNote":"","history":"","procedures":["Endotracheal intubation","Arterial line","Urinary catheter"],"vitals":[{"at":"2026-08-26T21:15","pulse":104,"sbp":162,"dbp":90},{"at":"2026-08-26T22:30","pulse":86,"sbp":128,"dbp":74},{"at":"2026-08-26T23:40","pulse":88,"sbp":134,"dbp":76}],"intraop":[{"at":"2026-08-26T23:30","temp":36.3,"bloodLoss":300,"urine":450,"cvp":""}],"resp":[{"at":"2026-08-26T21:40","machine":"Dräger (demo)","rr":14,"vt":500,"pip":17,"mode":"VCV","etco2":32,"spo2":100}],"sevo":[{"at":"2026-08-26T21:40","conc":1.2,"flow":2}],"drugs":[{"name":"Propofol","route":"IV","kind":"bolus","at":"2026-08-26T21:12","start":"","end":"","dose":"150 mg"},{"name":"Fentanyl","route":"IV","kind":"bolus","at":"2026-08-26T21:12","start":"","end":"","dose":"150 mcg"},{"name":"Rocuronium","route":"IV","kind":"bolus","at":"2026-08-26T21:13","start":"","end":"","dose":"50 mg"},{"name":"Mannitol 20%","route":"IV","kind":"bolus","at":"2026-08-26T21:35","start":"","end":"","dose":"250 ml"}],"fluids":[{"name":"NaCl 0.9%","type":"IV fluids","at":"2026-08-26T22:00","amount":1500}],"conclusion":"Rapid sequence intubation; intracranial pressure well controlled intra-op; transferred to ICU intubated for neuro observation. (fictional demo)","signedAt":"2026-08-26T23:50","signer":"Demo anesthesiologist · Nguyen"},"surgeryId":"DEMO-OR-E1","author":"nurseWard","version":1,"replaces":null,"reason":null,"at":"2026-08-27T02:20:00.000Z","source":"Fictional demo data (example of manual entry by clinical staff)"},{"id":"DEMO-PO-E-REC","p":"E","form":"recovery","code":"I-E-03-004","data":{"department":"Anesthesiology & recovery","toDepartment":"ICU","fromDepartment":"Operating room","weight":70,"preDiagnosis":"Traumatic intracranial hemorrhage (fictional demo)","method":"Left craniotomy and hematoma evacuation (fictional demo)","anesthesiaMethod":"General anesthesia","anesthesiaAt":"2026-08-26T21:10","scores":[{"at":"2026-08-26T23:55","conscious":1,"breathing":1,"rr":14,"motor":1,"circulation":2,"pulse":88,"color":2,"temp":36.4,"drain":30,"drainColor":"Dark red","urine":150},{"at":"2026-08-27T00:25","conscious":1,"breathing":2,"rr":16,"motor":1,"circulation":2,"pulse":84,"color":2,"temp":36.6,"drain":20,"drainColor":"Dark red","urine":80}],"anesthetist":"Demo anesthesiologist · Nguyen","assistant":"Demo anesthesia assistant · Ding","handoverAt":"2026-08-27T00:35","receiver":"Demo nurse · Day shift 2","ward":"202","neuro":"Rousable to voice","breathingGood":true,"canCough":false,"pinkLips":true,"spo2Over95":true,"goodAir":true,"wardPulse":84,"pulseRegular":"yes","wardSbp":132,"wardDbp":78,"wardTemp":36.6,"wardRr":16,"bleedDrain":20,"bleedDrainColor":"Dark red","bleedUrine":80,"bleedUrineColor":"Pale yellow","dressingSoaked":"no","postopLabs":"Hb 12.1 g/dL; Na 141 mmol/L (fictional demo)","giver":"Demo anesthesia assistant · Ding","wardHandoverAt":"2026-08-27T00:45","wardReceiver":"Demo nurse · Day shift 2"},"surgeryId":"DEMO-OR-E1","author":"nurseWard","version":1,"replaces":null,"reason":null,"at":"2026-08-27T02:40:00.000Z","source":"Fictional demo data (example of manual entry by clinical staff)"}];


  // 示範人員（含帳號、身分、部門管理員旗標）移到 staff-seed.js，登入頁共用同一份（2026-10-18）。
  const staffSeed=typeof module!=='undefined'?require('./staff-seed.js'):root.ICUStaffSeed;
  const actors = clone(staffSeed.people);
  function seed() {
    // EMR整合MDT demo（2026-11-10）：有英文腫瘤病房資料集時改用它，原型的兒科 ICU 種子不載入。
    if(root.ICUDemoSeed)return clinical.enrich(root.ICUDemoSeed.state());
    return clinical.enrich({schema:1, revision:0, seq:100, scenario:'normal', confirmed:{}, drafts:{}, audit:[],
patients:demoPatients.map((x,i)=>{
        const allergies=x.flags.includes('ALG')?[{id:'ALG-'+x.id, substanceKind:'class', code:{text:'Penicillin antibiotics'}, ingredient:'', drugClass:'penicillin',
          type:'allergy', category:'medication', criticality:'high', clinicalStatus:'active', verificationStatus:'confirmed',
          reaction:{manifestation:'Urticaria and angioedema', severity:'severe'}, recordedDate:x.admitted, recorder:'doctor',
          source:'Demo data, not the hospital allergy master'}]:[];
        const allergyStatus=allergies.length?'recorded':'unknown';
        const conditions=x.icd?[{id:'DX-'+x.id, code:{...x.icd, kind:'icd', active:true}, category:'encounter-diagnosis',
          clinicalStatus:'active', verificationStatus:'confirmed', onset:x.admitted, recordedDate:x.admitted, recorder:'doctor',
          source:'Demo data, not the hospital diagnosis master'}]:[];
        return {...x,...clone(demoHis[x.id]||{}),flags:[...x.flags],encounter:'ENC-'+x.id,episode:'ICU-'+x.id,allergies,allergyStatus,conditions,
          allergy:allergyText(allergyStatus,allergies)};
      }),
      favorites:{},
      orders:[{id:'M1',p:'A',version:1,name:'Demo medication A (not a prescription)',kind:'medication',dose:'1 demo unit',route:'Demo route',frequency:'Once now (demo)',start:'2026-08-31T08:00',end:null,clinical:'active',local:'signed',his:'accepted',occurrence:'M1-V1-D1'},
        {id:'M0',p:'A',version:1,name:'Stopped demo medication',kind:'medication',dose:'1 demo unit',route:'Demo route',frequency:'Once now (demo)',start:'2026-08-30T07:00',end:'2026-08-31T06:00',clinical:'stopped',local:'signed',his:'accepted',occurrence:'M0-V1-D1'},
        {id:'C1',p:'A',version:1,name:'Bedside care demo',kind:'care',dose:'Once',route:'Bedside',frequency:'Once now (demo)',start:'2026-08-31T08:00',end:null,clinical:'active',local:'signed',his:'accepted',occurrence:'C1-V1-D1'}],
      executions:[{id:'E0',p:'A',order:'M0',version:1,occurrence:'M0-V1-D1',at:'2026-08-31T05:00',recorded:'2026-08-31T05:05',actor:'nurse',status:'done',actual:'1 demo unit',route:'Demo route',reason:'',review:null}],
      observations:[{id:'O1',p:'A',kind:'Heart rate',value:102,unit:'/min',at:'2026-08-31T06:00',actor:'nurse',source:'observation'}, {id:'O2',p:'A',kind:'Heart rate',value:100,unit:'/min',at:'2026-08-31T08:00',actor:'nurse',source:'observation'}],
      reports:[{id:'L1',p:'A',kind:'Lab',status:'returned',version:1,text:'Demo result reported; no treatment thresholds included',at:'2026-08-31T08:00',seen:[],processed:[]},{id:'L2',p:'A',kind:'Lab',status:'pending',version:1,text:null,at:null,seen:[],processed:[]},{id:'I1',p:'A',kind:'Imaging report',status:'returned',version:1,text:'Illustrative imaging text report; no PACS image integration',at:'2026-08-31T07:30',seen:[],processed:[]}],
      tasks:[{id:'T-L2',p:'A',title:'Follow up L2 pending result',source:'L2',owner:'doctor',status:'waiting',evidence:null,history:[]},{id:'T-N',p:'A',title:'Complete this shift\'s bedside care record',source:'C1',owner:'nurse',status:'open',evidence:null,history:[]}],
      notes:[], infusionChecks:[], handovers:[], receipts:[], communications:[], goals:[], careFocuses:[], consultations:[], admissionPool:seedPool(), surgeries:demoSurgeries(), periop:demoPeriop()});
  }
  // Existing browsers hold the 3-patient CICU roster. Backfill the new identity fields and
  // add the missing demo beds without touching anything the user created.
  function upgradePatients(s){
    if(!Array.isArray(s.patients))return s;
    if(root.ICUDemoSeed)return s; // demo 資料集：不補原型的示範病人
    demoPatients.forEach(demo=>{
      const existing=s.patients.find(x=>x.id===demo.id);
      if(!existing){s.patients.push({...demo,flags:[...demo.flags],encounter:'ENC-'+demo.id,episode:'ICU-'+demo.id,allergy:demo.flags.includes('ALG')?'Demo allergy flag; actual item not recorded by source':'Not recorded by source; do not assume no allergies'});return;}
      if(/^CICU-/.test(existing.bed||''))existing.bed=demo.bed;
      existing.ward=existing.ward||demo.ward;
      existing.bed=existing.bed||demo.bed;
      existing.visitNo=existing.visitNo||demo.visitNo;
      existing.department='ICU';
      existing.attending=existing.attending||demo.attending;
      if(!existing.icd&&demo.icd)existing.icd={...demo.icd};
      if(!existing.birthDate&&demo.birthDate)existing.birthDate=demo.birthDate;
      if(existing.surgeryDate===undefined)existing.surgeryDate=demo.surgeryDate;
      if(!Array.isArray(existing.flags))existing.flags=[...demo.flags];
      Object.entries(demoHis[demo.id]||{}).forEach(([k,v])=>{if(existing[k]===undefined)existing[k]=clone(v);});
    });
    return s;
  }
  // 維護檔示範種子（2026-10-18）：頻率字典由開立選單的頻率表產生；三個示範藥給一列開立屬性。標示示範、非院方核定；只在沒種過時做一次。
  function seedMaster(st){st.master=schema.ensure(st.master);if(st.masterSeeded&&st.masterSeededKg&&st.masterSeededRx&&st.masterSeededOpt&&st.masterSeededAtc&&st.masterSeededDemo&&(st.masterSeededOptSets||[]).length>=new Set(schema.CLINICAL_OPTION_SEED.map(x=>x[1])).size)return st;const stamp=new Date().toISOString(),audit={createdBy:'seed',createdAt:stamp,updatedBy:'seed',updatedAt:stamp};
    if(!Object.keys(st.master.frequency).length){timingGroups.forEach(([,list])=>list.forEach(([key,code,label,repeat])=>{st.master.frequency[key]={desc_en:label,desc_vi:null,desc_zh:null,fhir_timing_code:code,timing_frequency:repeat.frequency,timing_period:repeat.period,timing_period_unit:repeat.periodUnit,when_code:null,as_needed:false,is_long_term:false,extend_hours:null,his_times_per_day:repeat.periodUnit==='d'&&repeat.period===1?repeat.frequency:null,active:true,effective_to:null,...audit};}));
      st.master.frequency.PRN={desc_en:'As needed',desc_vi:null,desc_zh:null,fhir_timing_code:null,timing_frequency:null,timing_period:null,timing_period_unit:null,when_code:null,as_needed:true,is_long_term:false,extend_hours:null,his_times_per_day:null,active:true,effective_to:null,...audit};
      st.master.frequency.STAT={desc_en:'Immediately, single dose',desc_vi:null,desc_zh:null,fhir_timing_code:null,timing_frequency:1,timing_period:null,timing_period_unit:null,when_code:null,as_needed:false,is_long_term:false,extend_hours:null,his_times_per_day:null,active:true,effective_to:null,...audit};
      [['QD',1,'08:00','09:00'],['BID',1,'08:00','09:00'],['BID',2,'17:00','18:00'],['TID',1,'08:00','09:00'],['TID',2,'12:00','13:00'],['TID',3,'17:00','18:00']].forEach(([code,seq,dispense,admin])=>{st.master.frequencyAdminTime['MXSEED-'+code+'-'+seq]={frequency_code:code,seq,dispense_time:dispense,admin_time:admin,nonmed_exec_time:admin,...audit};});}
    if(!Object.keys(st.master.medicationKnowledge).length){['medication:44978','medication:50631','medication:43636'].forEach(key=>{const e=clinical.entry(key);if(!e)return;st.master.medicationKnowledge[key]={default_route_code:e.routeId?'route:'+e.routeId:null,default_frequency_code:null,order_unit_code:e.unit||null,decimal_places:0,max_single_dose:null,max_daily_dose:null,no_crush:false,no_split:false,no_tube:false,atc_code:e.atc||null,atc_source:'HIS',atc_note:null,effective_from:'2026-01-01',effective_to:null,...audit};});}
    // 每公斤上限示範列（2026-10-22）：三個常見兒科用藥的教科書每公斤值，只為示範與驗證，不是院方核定劑量；已種過示範資料的瀏覽器也補種一次。
    if(!st.masterSeededKg){st.master.medicationWeightDose=st.master.medicationWeightDose||{};
      [['medication:50631',15,60,1000,4000],['medication:33667',2.5,7.5,null,null],['medication:27841',15,60,2000,null]].forEach(([key,single,daily,capS,capD],i)=>{if(!clinical.entry(key))return;
        st.master.medicationWeightDose['MXSEED-KG-'+(i+1)]={medication:key,weight_min_kg:null,weight_max_kg:null,age_min:null,age_max:null,age_unit:null,dose_unit_code:'mg',max_single_per_kg:single,max_daily_per_kg:daily,absolute_max_single:capS,absolute_max_daily:capD,effective_from:'2026-01-01',effective_to:null,...audit};
        const k=st.master.medicationKnowledge[key];if(k){k.order_unit_code='mg';k.decimal_places=1;}else{const e=clinical.entry(key);st.master.medicationKnowledge[key]={default_route_code:e.routeId?'route:'+e.routeId:null,default_frequency_code:null,order_unit_code:'mg',decimal_places:1,max_single_dose:null,max_daily_dose:null,no_crush:false,no_split:false,no_tube:false,atc_code:e.atc||null,atc_source:'HIS',atc_note:null,effective_from:'2026-01-01',effective_to:null,...audit};}});
      st.masterSeededKg=true;}
    // 維護檔示範列（2026-10-23）：讓 demo 看得到維護檔觸發的提示：高警訊與管制抗生素標籤、住院停止供應、需核准、單次／每日上限。數值與訊息只供示範，未經藥劑部核定；同藥同表已有維護值就不覆蓋，已種過示範資料的瀏覽器也補種一次。
    if(!st.masterSeededRx){const M=st.master,has=key=>!!clinical.entry(key);['medicationAttribute','medicationSupplyStatus','medicationOrderRestriction','medicationKnowledge'].forEach(t=>{M[t]=M[t]||{};});
      [['medication:34889','A08'],['medication:40715','A08'],['medication:40946','A08'],['medication:45884','A08'],['medication:33233','A08'],['medication:33281','A04']].forEach(([key,code],i)=>{if(!has(key)||Object.values(M.medicationAttribute).some(r=>r&&r.medication===key&&r.attribute_code===code))return;M.medicationAttribute['MXSEED-ATTR-'+(i+1)]={medication:key,attribute_code:code,note:null,...audit};});
      if(has('medication:33084')&&!M.medicationSupplyStatus['medication:33084'])M.medicationSupplyStatus['medication:33084']={status:'stopped',default_days:null,max_days:null,message:'Out of stock at the inpatient pharmacy; order Cefotaxime 1000 (22CT46) instead',effective_from:'2026-01-01',effective_to:null,...audit};
      if(has('medication:33281')&&!Object.values(M.medicationOrderRestriction).some(r=>r&&r.medication==='medication:33281'))M.medicationOrderRestriction['MXSEED-RST-1']={medication:'medication:33281',restriction_type:'approval',value:'Infectious diseases consultant',message:'Enter the approval number from the consult reply',effective_from:'2026-01-01',effective_to:null,...audit};
      if(has('medication:34826')&&!M.medicationKnowledge['medication:34826']){const e=clinical.entry('medication:34826');M.medicationKnowledge['medication:34826']={default_route_code:e.routeId?'route:'+e.routeId:null,default_frequency_code:null,order_unit_code:'mg',decimal_places:1,max_single_dose:8,max_daily_dose:24,no_crush:false,no_split:false,no_tube:false,atc_code:e.atc||null,atc_source:'HIS',atc_note:null,effective_from:'2026-01-01',effective_to:null,...audit};}
      st.masterSeededRx=true;}
    // 臨床選項種子（2026-10-24）：兒科病歷出生與成長史的初始選項，待院方確認；同代碼已有就不覆蓋，已種過示範資料的瀏覽器也補種一次。
    {const allSets=[...new Set(schema.CLINICAL_OPTION_SEED.map(x=>x[1]))],done=new Set(st.masterSeededOpt?(st.masterSeededOptSets||['birth_method','feeding_method','childcare_setting','vaccine']):[]);if(allSets.some(x=>!done.has(x))){const rows=st.master.clinicalOption;schema.CLINICAL_OPTION_SEED.forEach(([id,set,en,vi,zh,order],i)=>{if(!done.has(set)&&!rows[id])rows[id]={value_set:set,desc_en:en,desc_vi:vi,desc_zh:zh,sort_order:order||(i+1)*10,active:true,...audit};});st.masterSeededOpt=true;st.masterSeededOptSets=allSets;}}
    // ATC 一碼群名（2026-11-01）：只在第一次帶 WHO 英文原名，之後由院方維護，不回補。
    if(!st.masterSeededAtc){const rows=st.master.atcGroup;(schema.ATC_SEED||[]).forEach(([id,en])=>{if(!rows[id])rows[id]={name_en:en,active:true,...audit};});st.masterSeededAtc=true;}
    // 維護畫面示範資料（2026-11-08）：讓藥品明細每一段、途徑與單位字典都看得到內容。六個兒科常用藥（美羅培南、頭孢曲松、萬古黴素、健大黴素、芬太尼、帝拔癲口服液）
    // 的開立預設、每公斤上限、換算、限制、注意事項、標記與交互作用；途徑的 SNOMED CT 碼、單位的 UCUM 碼。數值取教科書兒科劑量，只供示範，未經藥劑部核定；已有資料的不覆蓋，已種過示範資料的瀏覽器也補種一次。
    if(!st.masterSeededDemo){const M=st.master,has=key=>!!clinical.entry(key),same=(t,key,f)=>Object.values(M[t]||{}).some(r=>r&&r.medication===key&&f(r));
      ['medicationKnowledge','medicationWeightDose','medicationDoseConversion','medicationSupplyStatus','medicationOrderRestriction','medicationCaution','medicationAttribute','medicationInteraction','route','unit'].forEach(t=>{M[t]=M[t]||{};});
      const know=(key,v)=>{if(!has(key)||M.medicationKnowledge[key])return;const e=clinical.entry(key);M.medicationKnowledge[key]={default_route_code:e.routeId?'route:'+e.routeId:null,default_frequency_code:null,order_unit_code:e.unit||null,decimal_places:0,max_single_dose:null,max_daily_dose:null,no_crush:false,no_split:false,no_tube:false,atc_code:e.atc||null,atc_source:'HIS',atc_note:null,effective_from:'2026-01-01',effective_to:null,...v,...audit};};
      const row=(t,id,key,v,dup)=>{if(!has(key)||M[t][id]||(dup&&same(t,key,dup)))return;M[t][id]={medication:key,...v,...audit};};
      const kg=(id,key,v)=>row('medicationWeightDose',id,key,{weight_min_kg:null,weight_max_kg:null,age_min:null,age_max:null,age_unit:null,dose_unit_code:'mg',max_single_per_kg:null,max_daily_per_kg:null,absolute_max_single:null,absolute_max_daily:null,effective_from:'2026-01-01',effective_to:null,...v});
      const conv=(id,key,from,to,factor)=>row('medicationDoseConversion',id,key,{order_unit_code:from,dispense_unit_code:to,factor},r=>r.order_unit_code===from&&r.dispense_unit_code===to);
      const note=(id,key,text)=>row('medicationCaution',id,key,{text,effective_from:'2026-01-01',effective_to:null},r=>r.text===text);
      const flag=(id,key,code)=>row('medicationAttribute',id,key,{attribute_code:code,note:null},r=>r.attribute_code===code);
      const rule=(id,key,type,value,message)=>row('medicationOrderRestriction',id,key,{restriction_type:type,value,message,effective_from:'2026-01-01',effective_to:null},r=>r.restriction_type===type&&r.value===value);
      const pair=(id,key,other,v)=>{if(has(other))row('medicationInteraction',id,key,{interacting_medication:other,...v,reference:'Demo value; pharmacy to confirm'},r=>r.interacting_medication===other);};
      const MERO='medication:33795',CEF='medication:30868',VANCO='medication:27841',GENTA='medication:33667',FENT='medication:35438',VALP='medication:50317';
      know(MERO,{default_route_code:'route:912',default_frequency_code:'Q8H',order_unit_code:'mg',max_single_dose:2000,max_daily_dose:6000});
      kg('MXDEMO-KG-1',MERO,{age_max:3,age_unit:'mo',max_single_per_kg:20,max_daily_per_kg:60});
      kg('MXDEMO-KG-2',MERO,{age_min:3,age_unit:'mo',max_single_per_kg:40,max_daily_per_kg:120,absolute_max_single:2000,absolute_max_daily:6000});
      conv('MXDEMO-CONV-1',MERO,'mg','Lọ',0.002);
      rule('MXDEMO-RST-1',MERO,'approval','Infectious diseases consultant','Priority antibiotic group 1: approve before the first dose, or within 24 h if started out of hours');
      note('MXDEMO-NOTE-1',MERO,'Lowers valproate levels within a day; avoid giving with valproate');
      flag('MXDEMO-ATTR-1',MERO,'A04');
      pair('MXDEMO-RX-1',MERO,VALP,{severity:'high',category:'Valproate levels drop',description:'Carbapenems lower valproic acid levels quickly; seizures may return',handling:'Avoid the combination: choose another antibiotic or antiepileptic. If it cannot be avoided, check valproate levels',monitoring:'Valproate level, seizures'});
      know(CEF,{default_route_code:'route:912',default_frequency_code:'QD',order_unit_code:'mg',max_single_dose:4000,max_daily_dose:4000});
      kg('MXDEMO-KG-3',CEF,{age_max:28,age_unit:'d',max_single_per_kg:50,max_daily_per_kg:50});
      kg('MXDEMO-KG-4',CEF,{age_min:28,age_unit:'d',max_single_per_kg:100,max_daily_per_kg:100,absolute_max_single:4000,absolute_max_daily:4000});
      conv('MXDEMO-CONV-2',CEF,'mg','Lọ',0.001);
      note('MXDEMO-NOTE-2',CEF,'Do not give with calcium-containing IV solutions to neonates (precipitation risk)');
      if(has(CEF)&&!M.medicationSupplyStatus[CEF])M.medicationSupplyStatus[CEF]={status:'restricted',default_days:null,max_days:null,message:'Limited stock this month; Poltraxon 1g (21PT16) is the same drug',effective_from:'2026-08-01',effective_to:null,...audit};
      conv('MXDEMO-CONV-3',VANCO,'mg','Lọ',0.002);
      note('MXDEMO-NOTE-3',VANCO,'Infuse over at least 60 minutes; check the trough level before the fourth dose');
      flag('MXDEMO-ATTR-2',VANCO,'A04');
      rule('MXDEMO-RST-2',VANCO,'approval','Infectious diseases consultant','Priority antibiotic group 1: record the approval number');
      pair('MXDEMO-RX-2',VANCO,GENTA,{severity:'moderate',category:'Kidney and ear toxicity add up',description:'Both drugs harm the kidneys and the inner ear; the risk adds up',handling:'Use together only when both are needed; dose by levels',monitoring:'Creatinine, urine output, trough levels of both drugs'});
      conv('MXDEMO-CONV-4',GENTA,'mg','Ống',0.025);
      note('MXDEMO-NOTE-4',GENTA,'Give once daily; check the trough level before the third dose');
      know(FENT,{default_route_code:'route:996316',order_unit_code:'mcg'});
      kg('MXDEMO-KG-5',FENT,{dose_unit_code:'mcg',max_single_per_kg:2,absolute_max_single:100});
      conv('MXDEMO-CONV-5',FENT,'mcg','Ống',0.002);
      note('MXDEMO-NOTE-5',FENT,'Push boluses over 3–5 minutes; a fast push can cause chest wall rigidity');
      flag('MXDEMO-ATTR-3',FENT,'A08');
      rule('MXDEMO-RST-3',FENT,'department','ICU','Bolus doses outside ICU need an anaesthetist');
      know(VALP,{default_route_code:'route:913',default_frequency_code:'BID',order_unit_code:'mg'});
      kg('MXDEMO-KG-6',VALP,{max_daily_per_kg:60,absolute_max_daily:3000});
      note('MXDEMO-NOTE-6',VALP,'Check liver function before starting; avoid if a mitochondrial disease is suspected');
      [['route:913','Oral','K','26643006'],['route:932','Intramuscular injection','C','78421000'],['route:1313','Subcutaneous injection','C','34206005'],['route:996316','Intravenous injection','C','47625008'],['route:912','Intravenous infusion','C','47625008'],['route:994086','Infusion','C','47625008'],['route:916','Sublingual','K','37839007'],['route:428','Rectal','X','37161004'],['route:1271','Topical','W','6064005']]
        .forEach(([key,en,cat,code])=>{if(clinical.entry(key)&&!M.route[key])M.route[key]={desc_en:en,desc_zh:null,route_category:cat,snomed_code:code,active:true,...audit};});
      [['unit:1','Ampoule','{ampule}'],['unit:3','Vial','{vial}'],['unit:4','Tablet','{tablet}'],['unit:6','Bottle','{bottle}'],['unit:8','Sachet','{sachet}'],['unit:17','Millilitre','mL'],['unit:12','Gram','g'],['unit:7','Litre','L']]
        .forEach(([key,en,ucum])=>{if(clinical.entry(key)&&!M.unit[key])M.unit[key]={desc_en:en,ucum_code:ucum,active:true,...audit};});
      st.masterSeededDemo=true;}
    st.masterSeeded=true;return st;}
  function createStore(storage, key=(root.DEMO&&root.DEMO.storageKey)||'icu-day-v2') {
    let state=upgradePatients(seed()), persistent=!!storage, problem='', unsaved=false;
    if(storage) try {storage.setItem(key+'-probe','1'); storage.removeItem(key+'-probe'); const raw=storage.getItem(key); if(raw){const v=JSON.parse(raw); if(v.schema!==1||!Array.isArray(v.patients)||!Array.isArray(v.tasks)||!v.drafts||!Array.isArray(v.handovers)) throw Error('Incompatible data version or structure'); state=clinical.enrich(upgradePatients(v));}} catch(e){persistent=false;problem='Unable to read or use storage: '+e.message+'. Held locally for this session only; original data not overwritten.';}
    if(!state.favorites) state.favorites={};
    seedMaster(state);
    if(!Array.isArray(state.admissionPool)) state.admissionPool=seedPool();
    // 入 ICU 改由 HIS AdmissionCreated 直接帶床位與主治（2026-10-28）：舊的待認列項目補上示範床位，狀態改名。
    state.admissionPool.forEach(e=>{const demo=demoPool.find(x=>x.id===e.id);if(demo)for(const k of ['ward','bed','doctorUsername','admitSource','entryPoint'])if(e[k]===undefined)e[k]=demo[k];if(e.status==='waiting')e.status='queued';if(e.status==='claimed')e.status='received';});
    for(const [k,make] of [['surgeries',demoSurgeries],['periop',demoPeriop]]){if(!Array.isArray(state[k]))state[k]=[];make().forEach(r=>{const cur=state[k].find(x=>x.id===r.id);if(!cur){state[k].push(r);return;}
      // 示範手術的示意圖（英文標示）：只換示範資料本身，使用者登錄或修訂的紀錄不動。
      if(k==='surgeries'&&cur.source===r.source&&Array.isArray(r.diagram)&&JSON.stringify(cur.diagram)!==JSON.stringify(r.diagram))cur.diagram=[...r.diagram];});}
    workflow.init(state,actors);taxonomy.bindState(state);
    // 展示期間（2026-10-08）：登入即視為已確認本班照護名單，不再要求先按「確認照護名單」才能寫入。
    const ensureConfirmed=(s,id)=>{if(s.confirmed[id])return;const who=(s.people&&s.people[id])||actors[id];if(!who)return;s.confirmed[id]={patients:[...(who.patients||[])],shift:who.shift,actor:id,at:new Date().toISOString(),source:'Auto-confirmed at sign-in (demo)'};};
    Object.keys(actors).forEach(id=>ensureConfirmed(state,id));
    // 未送出的這一批（2026-10-24）：只存在這台裝置、依醫師＋病人分開（drafts 的 cart／orderDetails），cartMeta 記最後一次修改的示範時間。
    // 醫師送出交班、或 24 小時沒動就清掉，另留 cartCleared 一行說明清了什麼、為什麼；下次加入品項時說明就拿掉。
    const CART_TTL=24*3600000, CART_PARTS=['cart','orderDetails','cartMeta'];
    function clearCarts(n,pick,reason){Object.keys(n.drafts).forEach(k=>{const [actor,pid,kind]=k.split(':');if(kind!=='cart'||!pick(actor,pid))return;
      const items=(n.drafts[k]||[]).map(e=>e.zh||e.name);CART_PARTS.forEach(x=>delete n.drafts[actor+':'+pid+':'+x]);
      if(items.length)n.drafts[actor+':'+pid+':cartCleared']={at:n.demoClock,reason,items};});}
    function dispatch(action, actorId, payload={}) {
      // 操作者查 state.people，不查硬編種子：維護檔新增的員工也能操作（2026-10-18）。
      const n=clone(state), a=n.people[actorId], p=payload.p;
      if(!a) throw Error('Unknown staff account');
      // EMR整合MDT demo（P2）：mdt* 動作的病人檢查與權限在 mdt-core.js 自己做。
      const mdtOwned=!!(root.ICUMdtCore&&root.ICUMdtCore.owns(action));
      if(!mdtOwned && !['confirmRoster','scenario','retrySave','reset','handover','receive','handoverPublishBatch','signatureSave','settingsSave','personSave','relationshipSave','clockAdvance','hisAdmission','hisDailyBatch','masterSave','masterRemove','logout','prefSave'].includes(action) && !n.patients.some(x=>x.id===p)) throw Error('Action requires a valid patient and encounter');
      workflow.guard(n,action,actorId,p,payload);
      if(p && payload.encounter && payload.encounter!=='ENC-'+p) throw Error('Patient and encounter do not match');
      const requireRole=role=>{if(a.role!==role)throw Error('Role restriction: this action is limited to role '+(role==='doctor'?'Doctor':'Nurse'));};
      // 開醫囑不限主治：看得到這位病人的醫師都能開（2026-09-26）。
      const requireDoctor=()=>{requireRole('doctor');must(workflow.canOrder(n,p,actorId),'Role restriction: only doctors may order / handle order items');};
      const must=(ok,msg)=>{if(!ok)throw Error(msg);};
      const text=(v,label)=>{must(typeof v==='string'&&v.trim().length>0,'Required: '+label);must(v.length<=5000,'Content too long');return v.trim();};
      // 選填欄位：沒填就是沒填，不補預設字串，也不當成已填。
      const opt=(v,label)=>{const t=String(v??'').trim();must(t.length<=5000,(label||'Content')+' is too long');return t;};
      const fold=v=>String(v||'').trim().toLowerCase();
      // 供應狀態（2026-10-18）：住院 stopped 的藥不能放進待開清單，也不能建立草稿；訊息帶維護檔的提示。
      const notStopped=e=>{if(!e||e.kind!=='medication')return;const rx=schema.prescribing(n,e.key);must(!rx.stopped,'“'+(e.zh||e.name)+'” is stopped for inpatient supply in the medication maintenance file'+(rx.supply&&rx.supply.message?' ('+rx.supply.message+')':'')+'; it cannot be ordered');};
      const timestamp=(v)=>{must(/^2026-\d\d-\d\dT\d\d:\d\d$/.test(v||'')&&!Number.isNaN(Date.parse(v)),'Enter a valid demo actual time');return v;};
      const get=(list,id)=>{const v=n[list].find(x=>x.id===id);must(v,'Source record not found');must(!v.p||v.p===p,'Source does not belong to the current patient');return v;};
      const id=prefix=>prefix+(++n.seq), at=()=>new Date().toISOString();
      const touchCart=(added=false)=>{n.drafts[actorId+':'+p+':cartMeta']={at:n.demoClock||TZ.zoned('2026-08-31T09:00:00')};if(added)delete n.drafts[actorId+':'+p+':cartCleared'];};
      // 品項加入或移除時清掉它在卡片上留下的欄位值（含用藥安全提示的處理）：重新加入要從預填開始，不沿用移除前填的。
      const dropItemFields=key=>{const dk=actorId+':'+p+':orderDetails',d=n.drafts[dk];if(d)n.drafts[dk]=Object.fromEntries(Object.entries(d).filter(([f])=>!f.slice(f.indexOf(':')+1).split('|').includes(key)));};
      if(!['confirmRoster','scenario','saveDraft','reset','retrySave','signatureSave','settingsSave','personSave','relationshipSave','clockAdvance','hisAdmission','hisDailyBatch','masterSave','masterRemove','logout','prefSave'].includes(action)) ensureConfirmed(n,actorId);
      // 科常用清單（2026-10-18）：第一次寫入時從舊的 on／off＋示範預設物化成一份有序清單，之後以清單為正本。
      const deptFav={list:dept=>{n.master=schema.ensure(n.master);const rec=n.master.deptFavorite['dept:'+dept];return rec?[...rec.list]:taxonomy.favouriteKeys('department',n,actorId,{department:dept});},
        save:(dept,list)=>{const owner='dept:'+dept;const row=schema.validate('deptFavorite',owner,{list},{must,clinical,state:n});const prev=n.master.deptFavorite[owner];n.master.deptFavorite[owner]={...row,createdBy:prev?prev.createdBy:actorId,createdAt:prev?prev.createdAt:at(),updatedBy:actorId,updatedAt:at()};n.lastMaster={table:'deptFavorite',id:owner};}};
      const outboxBefore=(n.hisOutbox||[]).length;
      if(!workflow.handle(n,action,actorId,payload,{must,text,timestamp,id,at,get,clinical}))switch(action){
        // 個人偏好（2026-11-08）：生命徵象分頁要畫哪幾條軌，依使用者記住，換病人、換裝置都一樣；不是臨床資料，不記稽核。
        case 'prefSave': {must(payload.key==='vitalLanes','Unknown preference');const list=[...new Set(String(payload.value??'').split(',').map(k=>k.trim()).filter(Boolean))];must(list.length<=60,'Too many items');list.forEach(k=>must(/^extra:[\w-]{1,40}$/.test(k)||(FS().byKey[k]&&FS().byKey[k].type!=='mar'&&FS().byKey[k].type!=='text'),'Unknown measurement item: '+k));n.prefs=n.prefs&&typeof n.prefs==='object'?n.prefs:{};n.prefs[actorId]={...(n.prefs[actorId]||{}),vitalLanes:list,updatedAt:at()};break;}
        case 'confirmRoster': n.confirmed[actorId]={patients:[...a.patients],shift:a.shift,actor:actorId,at:at(),source:'Demo hospital pre-assignment'};break;
        case 'scenario': must(['normal','saveFailure','missing','timeout','hisRejected'].includes(payload.value),'Unknown scenario');n.scenario=payload.value;break;
        case 'saveDraft': must(p,'Draft must be linked to a patient');n.drafts[actorId+':'+p+':'+payload.kind]=clone(payload.data);if(payload.kind==='orderDetails')touchCart();break;
        case 'retrySave': break;
        case 'toggleFavorite': {const scope=payload.scope==='department'?'department':'doctor';const key=text(payload.key,'Item key');must(clinical.snapshot(key),'Item not found; favorites accept only existing items from catalog B');
          // 部門範圍（2026-10-18）：需部門管理員或管理者，寫進科常用清單；個人常用維持 on／off。
          if(scope==='department'){const dept=String(payload.department||a.department||'').trim();must(dept,'Department is required');must(workflow.canMaintainDept(n,actorId,dept),'Only this department\'s administrators or system administrators can maintain department favorites');const cur=deptFav.list(dept);const wantOn=payload.on!==false;deptFav.save(dept,wantOn?(cur.includes(key)?cur:[...cur,key]):cur.filter(k=>k!==key));break;}
          const owner='actor:'+actorId;n.favorites=n.favorites||{};const raw=n.favorites[owner];const rec=Array.isArray(raw)?{on:[...raw],off:[]}:{on:[...(raw&&raw.on||[])],off:[...(raw&&raw.off||[])]};const wantOn=payload.on!==false;
          // Seeded defaults live in the UI layer, so removals are recorded explicitly rather than by absence.
          rec.on=rec.on.filter(x=>x!==key);rec.off=rec.off.filter(x=>x!==key);
          if(wantOn){must(rec.on.length<60,'Custom favorites are limited to 60 items');rec.on.push(key);}else rec.off.push(key);
          n.favorites[owner]=rec;break;}
        case 'task': n.tasks.push({id:id('T'),p,title:text(payload.title,'Task description'),source:payload.source||'manual',owner:actorId,status:'open',evidence:null,history:[]});break;
        case 'taskStatus': {const t=get('tasks',payload.id);must(t.owner===actorId,'Only the current owner can update this task');must(['accepted','waiting','done'].includes(payload.status),'Invalid task status');if(payload.status==='done'){const r=n.reports.find(x=>x.id===t.source)||n.reports.find(x=>x.order===t.source);must(!r||r.status==='returned'&&r.processed.length>0,'Pending result has no follow-up action yet; cannot close');t.evidence=text(payload.evidence,'Completion evidence');}t.history.push({from:t.status,to:payload.status,actor:actorId,at:at()});t.status=payload.status;break;}
        case 'measure': {requireRole('nurse');const kind=text(payload.kind,'Item');const units=clinical.units;must(units[kind],'Unsupported measurement');must(payload.value!==''&&Number.isFinite(Number(payload.value))&&Number(payload.value)>=0,'Enter a non-negative value');n.observations.push({id:id('O'),p,kind,value:Number(payload.value),unit:units[kind],at:timestamp(payload.at),recorded:at(),actor:actorId,source:'observation'});break;}
        // 手動新增一次量測（尚未串接 IoT 設備）：同一時點的多個項目在同一筆交易寫入；血壓維持父子項。
        case 'measureSet': {requireRole('nurse');const time=timestamp(payload.at);const units=clinical.units;let count=0;const num=v=>String(v??'').trim();
          [['Temperature',payload.temperature],['Heart rate',payload.pulse],['Respiratory rate',payload.respiration],['SpO₂',payload.spo2],['Weight',payload.weight],['Height',payload.height],['Head circumference',payload.headCircumference],['Chest circumference',payload.chestCircumference]].forEach(([kind,v])=>{if(num(v)==='')return;must(Number.isFinite(Number(v))&&Number(v)>=0,kind+' requires a non-negative value');n.observations.push({id:id('O'),p,kind,value:Number(v),unit:units[kind],at:time,recorded:at(),actor:actorId,source:'observation',entry:'manual'});count++;});
          const sys=num(payload.systolic),dia=num(payload.diastolic);if(sys!==''||dia!==''){must(sys!==''&&dia!==''&&Number.isFinite(Number(sys))&&Number.isFinite(Number(dia))&&Number(sys)>=0&&Number(dia)>=0,'Blood pressure requires both systolic BP and diastolic BP (non-negative values)');n.observations.push({id:id('O'),p,kind:'Blood pressure',unit:'mmHg',value:null,components:[{definition:'TDL.0094',value:Number(sys)},{definition:'TDL.0095',value:Number(dia)}],at:time,recorded:at(),actor:actorId,source:'observation / observation_component',entry:'manual'});count++;}
          must(count>0,'Enter at least one measurement');break;}
        // 入科（2026-10-28；2026-10-31 改全院）：HIS 送 AdmissionCreated（D7 §5.2）帶科別、病房、床位與主治帳號；收到就建病人並佔住床位，標「待接收」。
        // 主治照 HIS（必須是該科在職醫師），醫師可先開醫囑；該科醫師或護理師接收時選床、主要護理師與到床時間（workflow receivePatient）。HIS 有帶體重就記入院體重。
        case 'hisAdmission': {const e=(n.admissionPool||[]).find(x=>x.id===String(payload.id||''));must(e,'HIS admission message not found');must(e.status==='queued','This HIS admission has already been received');
          const ward=String(e.ward||'').trim(),bed=String(e.bed||'').trim();must(ward&&bed,'HIS did not send a room and bed: '+e.name);
          const dept=String(e.department||'ICU');must(((n.settings&&n.settings.departments)||[]).some(d=>d.live&&d.name===dept),'Department not using Smart Ward yet: '+dept+' ('+e.name+')');
          must(!n.patients.some(x=>!x.dischargedAt&&(x.bed===bed||(x.pendingReceive&&x.pendingReceive.bed===bed))),'Bed still occupied in Smart Ward; resolve it with HIS: '+bed+' ('+e.name+')');
          must(!n.patients.some(x=>x.identifier===e.identifier),'MRN already exists: '+e.identifier+' ('+e.name+')');
          const hit=Object.entries(n.people).find(([,x])=>x.username===e.doctorUsername),attendingId=hit&&hit[1].role==='doctor'&&!hit[1].consultationOnly&&hit[1].active!==false&&hit[1].department===dept?hit[0]:null;
          // 主治待指定（2026-11-05，D7 v2.2）：HIS 帶的帳號不是該科在職醫師（多半是急診或門診開住院單的醫師）時照收，接收時由接收者指定主治。
          // 送來時就選主要護理師（2026-11-02）：先記在待接收上，列進該護理師的「我的病人」、接收時預選；照護關係仍在接收時才開始。
          const nurseId=String(payload.nurse||'');must(!nurseId||workflow.isDeptStaff(n,nurseId,dept,'nurse'),'Choose the primary nurse: an active nurse of '+dept);
          const att=n.people[attendingId],icuAt=String(n.demoClock||'').slice(0,16),pid=id('P');
            const allergies=e.allergyStatus==='recorded'?(e.allergies||[]).map(x=>({id:id('ALG'),substanceKind:x.substanceKind||'ingredient',code:{text:x.text},ingredient:x.substanceKind==='class'?'':x.text,drugClass:x.drugClass||'',
              type:'allergy',category:'medication',criticality:x.criticality||'unable-to-assess',clinicalStatus:'active',verificationStatus:x.verificationStatus||'unconfirmed',
              reaction:{manifestation:x.manifestation,severity:x.severity||'moderate'},recordedDate:e.admitted,recorder:null,source:e.source})):[];
            const allergyStatus=allergyStatuses.includes(e.allergyStatus)?e.allergyStatus:'unknown';
            const conditions=parseConditions(e.icds,actorId,e.admitted,at(),must,id).map(c=>({...c,source:e.source}));
          n.patients.push({id:pid,name:e.name,ward,bed,visitNo:e.visitNo,identifier:e.identifier,admitted:e.admitted,department:dept,pendingReceive:{via:'AdmissionCreated',department:dept,ward,bed,at:icuAt,message:e.id,...(attendingId?{}:{attendingPending:true,hisDoctor:e.doctorUsername||null})},attending:att?att.name:null,surgeryDate:null,surgery:null,problem:e.problem,
            flags:[],encounter:'ENC-'+pid,episode:'ICU-'+pid,allergies,allergyStatus,conditions,allergy:allergyText(allergyStatus,allergies),birthDate:e.birthDate||null,gender:e.gender||null,
            fromDepartment:e.fromDepartment||null,admitSource:e.admitSource||null,entryPoint:e.entryPoint||null,admittedBy:null,registeredAt:at(),pool:e.id,source:e.source,icuEntry:{via:'AdmissionCreated',message:e.id,at:icuAt}});
          if(Number(e.admissionWeight)>0)n.observations.push({id:id('O'),p:pid,kind:'Admission weight',definition:'TDL.1285',value:Number(e.admissionWeight),unit:'kg',at:e.admissionWeightAt||e.admitted+'T00:00',recorded:at(),actor:null,source:e.source});
          if(att){n.relationships.push({p:pid,actor:attendingId,role:'attending',active:true,startedAt:at(),by:null,via:'AdmissionCreated'});
          att.patients=att.patients||[];if(!att.patients.includes(pid))att.patients.push(pid);}
          for(const who of [attendingId,'admin'])if(who&&n.confirmed[who]&&!n.confirmed[who].patients.includes(pid))n.confirmed[who].patients.push(pid);
          if(nurseId)n.patients.find(x=>x.id===pid).pendingReceive.nurse=nurseId;
          e.status='received';e.receivedAt=at();e.patient=pid;n.lastAdmitted=pid;break;}
        // 入科資料（2026-10-28）：補 HIS 沒帶的體重與身高；可分次補，補齊才算完成。照護醫師或照護護理師都能補。
        // 護理流程表（2026-10-31）：一欄一個時點一次存，項目照病人所在科的範本與病人額外列；量測照舊存 observation，選項存代碼、文字存原文，出入量的性狀存 attr。
        case 'flowsheetSave': {must(workflow.canNurse(n,p,actorId),'Role restriction: care nurse of this patient only');const pt=n.patients.find(x=>x.id===p),time=timestamp(payload.at),nowAt=String(n.demoClock||'').slice(0,16);must(!nowAt||time<=nowAt,'The time cannot be later than now');let count=0;
          for(const it of FS().itemsFor(n,pt)){if(it.type==='mar')continue;
            if(it.type==='bp'){const sys=String(payload['v:'+it.key+':sys']??'').trim(),dia=String(payload['v:'+it.key+':dia']??'').trim();if(sys===''&&dia==='')continue;must(sys!==''&&dia!==''&&Number(sys)>=0&&Number(dia)>=0&&Number(sys)>=Number(dia),'Blood pressure requires both systolic and diastolic values; systolic cannot be lower than diastolic');
              n.observations.push({id:id('O'),p,kind:'Blood pressure',unit:'mmHg',value:null,components:[{definition:'TDL.0094',value:Number(sys)},{definition:'TDL.0095',value:Number(dia)}],at:time,recorded:at(),actor:actorId,source:'observation / observation_component',entry:'flowsheet'});count++;continue;}
            const raw=String(payload['v:'+it.key]??'').trim();if(raw==='')continue;const rec={id:id('O'),p,kind:it.key,unit:it.unit||'',at:time,recorded:at(),actor:actorId,source:'observation',entry:'flowsheet'};
            if(it.type==='number'||it.type==='volume'){const v=Number(raw),min=it.type==='volume'?0:it.min,max=it.type==='volume'?5000:it.max;must(Number.isFinite(v)&&v>=min&&v<=max,it.label+' must be a number from '+min+' to '+max);rec.value=v;const attr=String(payload['a:'+it.key]||'').trim();if(attr){must((it.attr||[]).some(o=>o[0]===attr),it.label+': invalid option');rec.attr=attr;}}
            else if(it.type==='code'){must((it.options||[]).some(o=>o[0]===raw),it.label+': invalid option');rec.value=null;rec.code=raw;}
            else{rec.value=null;rec.text=raw.slice(0,80);}
            n.observations.push(rec);count++;}
          must(count>0,'Enter at least one value');break;}
        // 病人額外列（2026-10-31）：只給出量、入量（例如第二條胸管），單位 mL 或 g；拿掉的列已記的量照留。
        case 'flowsheetRowAdd': case 'flowsheetRowRemove': {must(workflow.canNurse(n,p,actorId),'Role restriction: care nurse of this patient only');const pt=n.patients.find(x=>x.id===p);pt.flowsheetRows=pt.flowsheetRows||[];
          if(action==='flowsheetRowAdd'){const label=text(payload.label,'Row name').slice(0,60),group=String(payload.group||''),unit=String(payload.unit||'mL');must(['output','intake'].includes(group),'Extra rows are for intake or output');must(['mL','g'].includes(unit),'Unit must be mL or g');must(!pt.flowsheetRows.some(r=>!r.removed&&r.label===label),'A row with this name already exists');pt.flowsheetRows.push({id:id('FR'),label,group,unit,by:actorId,at:at()});}
          else{const r=pt.flowsheetRows.find(x=>x.id===payload.id&&!x.removed);must(r,'Row not found');r.removed=true;r.removedBy=actorId;r.removedAt=at();}break;}
        // 過敏（2026-10-31）：HIS 帶入的唯讀；照護醫師與護理師可以補登（記登錄者，來源 Smart Ward），或確認無已知過敏；「未記錄」與「確認無過敏」分開。一期不回送 HIS。
        case 'allergySave': case 'allergyNone': {must(workflow.canWrite(n,p,actorId)||workflow.canNurse(n,p,actorId),'Only doctors or nurses caring for this patient can record allergies');const pt=n.patients.find(x=>x.id===p);pt.allergies=pt.allergies||[];
          if(action==='allergyNone'){must(!pt.allergies.some(x=>x.clinicalStatus==='active'),'Allergies are recorded; you cannot confirm no known allergies');pt.allergyStatus='none-known';pt.allergyConfirmedBy=actorId;pt.allergyConfirmedAt=at();}
          else{const substance=text(payload.substance,'Allergen'),reaction=String(payload.reaction||'').trim().slice(0,200),severity=['mild','moderate','severe'].includes(payload.severity)?payload.severity:'moderate';
            pt.allergies.push({id:id('ALG'),substanceKind:'ingredient',code:{text:substance},ingredient:substance,drugClass:'',type:'allergy',category:'medication',criticality:'unable-to-assess',clinicalStatus:'active',verificationStatus:'unconfirmed',reaction:{manifestation:reaction||'Reaction not recorded',severity},recordedDate:String(n.demoClock||'').slice(0,10),recorder:actorId,source:'Smart Ward'});pt.allergyStatus='recorded';pt.allergyConfirmedBy=null;}
          pt.allergy=allergyText(pt.allergyStatus,pt.allergies,pt.allergyConfirmedBy);break;}
        case 'entrySave': {must(workflow.canWrite(n,p,actorId)||workflow.canNurse(n,p,actorId),'Only doctors or nurses caring for this patient can complete entry data');
          const pt=n.patients.find(x=>x.id===p);must(pt.icuEntry,'This patient has no entry data to complete');must(workflow.entryMissing(n,p).length,'Entry data is already complete');
          const nowAt=String(n.demoClock||'').slice(0,16);let count=0;
          for(const [kind,key,atKey,max,range,late] of [['Weight','weight','weightAt',300,'Weight must be greater than 0 and at most 300 kg','Weight: the measured-at time cannot be later than now'],['Height','height','heightAt',250,'Height must be greater than 0 and at most 250 cm','Height: the measured-at time cannot be later than now']]){const raw=String(payload[key]??'').trim();if(raw==='')continue;const v=Number(raw);
            must(Number.isFinite(v)&&v>0&&v<=max,range);const when=timestamp(String(payload[atKey]||'').trim());must(!nowAt||when<=nowAt,late);
            n.observations.push({id:id('O'),p,kind,value:v,unit:clinical.units[kind],at:when,recorded:at(),actor:actorId,source:'observation',entry:'intake'});count++;}
          must(count>0,'Enter the weight or the height');if(!workflow.entryMissing(n,p).length){pt.icuEntry.completedAt=at();pt.icuEntry.completedBy=actorId;}break;}
        case 'measureBP': {requireRole('nurse');const components=[['TDL.0094',payload.systolic],['TDL.0095',payload.diastolic]].map(([definition,v])=>{must(v!==''&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=0,'Enter non-negative actual values for both blood pressure components');return {definition,value:Number(v)};});n.observations.push({id:id('O'),p,kind:'Blood pressure',unit:'mmHg',value:null,components,at:timestamp(payload.at),recorded:at(),actor:actorId,source:'observation / observation_component'});break;}
        case 'cartAdd': {requireDoctor();const e=clinical.snapshot(payload.key);must(e&&['service','medication'].includes(e.kind)&&e.active,'Item does not exist, is inactive, or is reference only');must(taxonomy.isOrderable(e,n),'This item is closed for ordering in the order-item maintenance file');notStopped(e);const k=actorId+':'+p+':cart';const cart=n.drafts[k]||[];must(!cart.some(x=>x.key===e.key),'Item is already in the pending order list; order repeat doses separately');
          // 從既有醫囑加入（2026-11-08）：記下是哪一張，卡片照它帶上次的劑量、途徑與頻率；不是這位病人、這個品項的就不記。
          const last=payload.fromOrder?n.orders.find(o=>o.id===String(payload.fromOrder)&&o.p===p&&o.catalog&&o.catalog.key===e.key):null;
          dropItemFields(e.key);cart.push(last?{...e,fromOrder:last.id}:e);n.drafts[k]=cart;touchCart(true);break;}
        case 'cartAddSet': {requireDoctor();must(Array.isArray(payload.keys)&&payload.keys.length>0&&payload.keys.length<=40,'Invalid order set contents');const entries=payload.keys.map(key=>clinical.snapshot(key));must(entries.every(e=>e&&['service','medication'].includes(e.kind)&&e.active),'Order set contains items that do not exist, are inactive, or are reference only');entries.forEach(notStopped);const k=actorId+':'+p+':cart',cart=n.drafts[k]||[];
          // 記下這一筆是從哪個主套／組套開出來的；catalogOrder 會把它搬到醫囑上，不混進 B 目錄快照。
          const from=payload.setId?{main:String(payload.setId),mainName:String(payload.setName||''),group:String(payload.groupId||''),groupName:String(payload.groupName||'')}:null;
          entries.forEach(e=>{if(!cart.some(x=>x.key===e.key)){dropItemFields(e.key);cart.push(from?{...e,fromSet:from}:e);}});n.drafts[k]=cart;touchCart(true);break;}
        case 'cartRemove': {requireDoctor();const k=actorId+':'+p+':cart';n.drafts[k]=(n.drafts[k]||[]).filter(x=>x.key!==payload.key);dropItemFields(String(payload.key||''));touchCart();break;}
        case 'cartClear': {requireDoctor();[...CART_PARTS,'cartCleared'].forEach(x=>delete n.drafts[actorId+':'+p+':'+x]);break;}
        case 'catalogOrder': {requireDoctor();const k=actorId+':'+p+':cart',cart=n.drafts[k]||[];must(cart.length>0,'Select an item first');
          const subject=n.patients.find(x=>x.id===p)||null;
          // 用藥安全提示在寫入這一端重算一次：禁忌必須填覆寫理由，需處理者必須選處理方式。
          // 前端有沒有顯示不影響這裡的判斷，畫面漏掉不等於檢核通過。
          const atcDay=String(payload.start||'').slice(0,10)||undefined;
          const conflicts=(rxSafety?rxSafety.assess(schema.withLocalAtc(n,cart,atcDay),schema.withLocalAtc(n,n.orders.filter(o=>o.p===p),atcDay),subject,schema.interactionRows(n)):[]).filter(c=>c.involvesCart);
          const stamp=at();
          const safety=conflicts.map(c=>{
            const base={pair:c.pair,ruleId:c.ruleId,severity:c.severity,label:c.label,kind:c.kind,by:actorId,at:stamp};
            if(rxSafety.needsOverride(c)){const reason=String(payload['rxOverride:'+c.pair]||'').trim();
              must(reason.length>0,'“'+c.label+'” is contraindicated; an override reason is required to add the order');
              return {...base,decision:'override',reason};}
            if(rxSafety.needsHandling(c)){const raw=text(payload['rxHandling:'+c.pair],'Medication safety alert handling');
              const reason=String(payload['rxReason:'+c.pair]||'').trim();
              must(raw!=='__other__'||reason.length>0,'When “Other” is selected, a handling note is required');
              return {...base,decision:'handled',handling:raw==='__other__'?'Other':raw,reason};}
            return {...base,decision:'shown'};});
          const start=timestamp(payload.start),orderedAt=at(),batch=id('BATCH');
          const batchEnd=payload.end?timestamp(payload.end):null;
          must(!batchEnd||batchEnd>start,'End time must be after start');
          const items=cart.map(e=>{const current=clinical.snapshot(e.key);must(current&&current.active,'Item is inactive or not found; select again');
            const med=e.kind==='medication';if(med)notStopped(e);
            // 維護檔（2026-10-18）：這個藥在生效日當天的開立屬性；途徑、頻率、單位沒填就用維護的預設值，填了以醫師填的為準。
            const rx=med?schema.prescribing(n,e.key,String(payload['start:'+e.key]||payload.start||'').slice(0,10)||undefined):null;
            const pl=med?{...payload}:payload;
            if(med){if(!String(pl['route:'+e.key]||'').trim()&&rx.defaults.route)pl['route:'+e.key]=rx.defaults.route;if(!String(pl['frequency:'+e.key]||'').trim()&&rx.defaults.frequency)pl['frequency:'+e.key]=rx.defaults.frequency;if(!String(pl['unit:'+e.key]||'').trim()&&rx.defaults.unit)pl['unit:'+e.key]=rx.defaults.unit;}
            const route=med?clinical.snapshot(pl['route:'+e.key]):null;
            if(med)must(route&&route.kind==='route'&&route.active,'Manually select a valid route');
            // 目錄對品項標了預設途徑；不一致不阻擋，但要標記並留存（例如針劑被開成口服、腸溶錠走鼻胃管）。
            const routeMismatch=!!(med&&e.routeId&&route&&String(route.id)!==String(e.routeId));
            // 經管灌給藥（2026-10-18）：B 目錄沒有管灌途徑，以口服途徑加「經管灌」表示；只適用口服。
            const viaTube=!!med&&['1','on','true'].includes(String(pl['tube:'+e.key]||'').trim().toLowerCase());
            if(viaTube)must(schema.TUBE_ROUTE_CODES.includes(String(route.code)),'Tube administration for “'+(e.zh||e.name)+'” applies to the oral route only; choose the oral route or untick tube administration');
            const mode=med?(dosingModes[pl['mode:'+e.key]]?String(pl['mode:'+e.key]):'scheduled'):'once';
            // 每公斤輸入（2026-10-22）：doseMode＝absolute／dose（每次 mg/kg）／daily（每日 mg/kg/day 分次）。絕對劑量仍是正本：畫面算過的 qty 不採信，這裡用劑量體重重算一次。
            const nm=e.zh||e.name,dayOf=String(pl['start:'+e.key]||payload.start||'').slice(0,10)||undefined;
            const doseMode=med&&['dose','daily','bsa'].includes(String(pl['doseMode:'+e.key]||''))?String(pl['doseMode:'+e.key]):'absolute';
            const dose=med?(()=>{const qty=String(pl['qty:'+e.key]??'').trim(),unit=String(pl['unit:'+e.key]??'').trim();
                must(unit!=='','Enter a unit for each medication');
                if(doseMode!=='absolute')return {value:null,unit};
                must(qty!==''&&Number.isFinite(Number(qty))&&Number(qty)>0,'Enter a quantity for each medication (greater than 0)');return {value:Number(qty),unit};})():null;
            let dosePerKg=null;const perKgLines=[];
            const applyPerKg=perDay=>{const raw=String(pl['perKg:'+e.key]??'').trim();
              must(schema.perKgUnitOk(dose.unit),'Per-kg dosing for “'+nm+'” is available only for mg, mcg, g, U, IU, mEq or mmol; enter the dose directly for unit “'+dose.unit+'”');
              must(raw!==''&&Number.isFinite(Number(raw))&&Number(raw)>0,'Enter a per-kg dose for “'+nm+'” (greater than 0)');
              const dw=schema.dosingWeight(n,p,dayOf);must(dw,'Per-kg dosing for “'+nm+'” needs a dosing weight; record a weight first or enter the dose directly');
              if(doseMode==='daily'){must(mode==='scheduled','Per-kg-per-day dosing for “'+nm+'” applies only to scheduled repeats; use per kg per dose for once, PRN or continuous infusion');
                must(perDay!==null&&perDay>=1,'Per-kg-per-day dosing for “'+nm+'” needs a frequency with at least one dose per day; use per kg per dose instead');}
              const dec=rx.knowledge&&Number.isInteger(rx.knowledge.decimal_places)?rx.knowledge.decimal_places:3;
              const calc=schema.perKgDose({perKg:Number(raw),mode:doseMode,kg:dw.kg,perDay,decimals:dec});
              must(calc.value>0,'The calculated dose for “'+nm+'” rounds to 0; adjust the per-kg dose or the maintained decimal places');
              dose.value=calc.value;dosePerKg={mode:doseMode,value:Number(raw),unit:dose.unit+'/kg'+(doseMode==='daily'?'/day':''),kg:dw.kg,weightObservation:dw.id,perDay:calc.perDay,raw:calc.raw,rounded:calc.value};
              };
            // EMR整合MDT demo（P2）：體表面積劑量（mg/m²，Mosteller）——化療醫囑的常態；每公斤欄位借用為每平方公尺值。
            let dosePerBsa=null;
            const applyBsa=()=>{const raw=String(pl['perKg:'+e.key]??'').trim();
              must(schema.perKgUnitOk(dose.unit),'Per-m² dosing for “'+nm+'” is available only for mg, mcg, g, U, IU, mEq or mmol; enter the dose directly for unit “'+dose.unit+'”');
              must(raw!==''&&Number.isFinite(Number(raw))&&Number(raw)>0,'Enter a per-m² dose for “'+nm+'” (greater than 0)');
              const bsa=schema.bodySurface?schema.bodySurface(n,p,dayOf):null;must(bsa,'Per-m² dosing for “'+nm+'” needs a recorded height and weight; record them first or enter the dose directly');
              const dec=rx.knowledge&&Number.isInteger(rx.knowledge.decimal_places)?rx.knowledge.decimal_places:1;const f=Math.pow(10,dec);const rawDose=Number(raw)*bsa.m2;const value=Math.round(rawDose*f)/f;
              must(value>0,'The calculated dose for “'+nm+'” rounds to 0; adjust the per-m² dose');
              dose.value=value;dosePerBsa={value:Number(raw),unit:dose.unit+'/m²',bsa:bsa.m2,kg:bsa.kg,cm:bsa.cm,formula:'Mosteller',weightObservation:bsa.weightId,heightObservation:bsa.heightId,raw:Math.round(rawDose*1000)/1000,rounded:value};};
            if(doseMode==='dose')applyPerKg(null);else if(doseMode==='bsa')applyBsa();
            // 字典停用（2026-10-18）：停用的頻率或途徑不能用在新醫囑；B 目錄本身的停用另在上面檢查。
            if(med){const localRoute=n.master&&n.master.route&&route&&n.master.route[route.key];must(!(localRoute&&localRoute.active===false),'Route “'+(route.zh||route.name)+'” is inactive in the route dictionary; choose another');
              if(mode==='scheduled'){const choice=String(pl['frequency:'+e.key]||'').trim();const dict=n.master&&n.master.frequency&&n.master.frequency[choice];must(!(dict&&dict.active===false),'Frequency “'+choice+'” is inactive in the frequency dictionary; choose another');}}
            const dosing=med?buildDosing(mode,e,pl,must,text,dose):{mode:'once',frequency:text(pl['frequency:'+e.key]||'Once now','Frequency for each order')};
            // 劑量上限與小數位（2026-10-18）：小數位超過維護值直接擋；超過單次／每日上限要填說明才能建立草稿，說明連同規則留在醫囑上。
            // 每日總量＝單次劑量 × 每日次數（排定重複由 Timing.repeat 換算；需要時取 24 h 上限；單次＝一次；連續輸注不比對）。上限以醫囑單位計，單位不同時不宣稱已檢核。
            const doseLines=[],name=e.zh||e.name;
            const rep=med&&dosing.timing&&dosing.timing.repeat;
            const perDay=!med?null:dosing.mode==='scheduled'&&rep?rep.frequency*24/(rep.period*unitHours[rep.periodUnit]):dosing.mode==='once'?1:null;
            if(doseMode==='daily')applyPerKg(perDay);
            perKgLines.forEach(l=>doseLines.push(l));
            const daily=!med?null:dosing.mode==='prn'?dosing.maxPerDay:perDay!==null?dose.value*perDay:null;
            const reason=String(pl['doseReason:'+e.key]||'').trim();
            const overLine=o=>{must(!(o.ratio>=schema.OVERDOSE_BLOCK_RATIO),'“'+name+'” '+o.label.toLowerCase()+' ('+o.detail+'); '+Math.round(o.ratio*10)/10+'× the maximum — doses of 10× or more cannot be ordered');must(reason.length>0,'“'+name+'” '+o.label.toLowerCase()+' ('+o.detail+'); a reason is required to add the order');doseLines.push({pair:e.key+'|DOSE|'+o.ruleId,ruleId:o.ruleId,severity:'high',label:o.label,kind:'dose',basis:o.detail,by:actorId,at:stamp,decision:'override',reason});};
            if(med&&rx.knowledge){const k=rx.knowledge;
              if(Number.isInteger(k.decimal_places)){const dec=(String(dose.value).split('.')[1]||'').length;must(dec<=k.decimal_places,'Dose for “'+name+'” allows at most '+k.decimal_places+' decimal place(s)');}
              const sameUnit=!k.order_unit_code||fold(dose.unit)===fold(k.order_unit_code);
              const over=[];
              if(sameUnit&&k.max_single_dose&&dose.value>k.max_single_dose)over.push({ruleId:'DOSE-MAX-SINGLE',label:'Exceeds maximum single dose',detail:dose.value+' '+dose.unit+' > '+k.max_single_dose+' '+(k.order_unit_code||dose.unit),ratio:dose.value/k.max_single_dose});
              if(sameUnit&&k.max_daily_dose&&daily!==null&&daily>k.max_daily_dose)over.push({ruleId:'DOSE-MAX-DAILY',label:'Exceeds maximum daily dose',detail:(Math.round(daily*1000)/1000)+' '+dose.unit+'/day > '+k.max_daily_dose+' '+(k.order_unit_code||dose.unit),ratio:daily/k.max_daily_dose});
              over.forEach(overLine);
              if(!sameUnit&&(k.max_single_dose||k.max_daily_dose))doseLines.push({pair:e.key+'|DOSE|UNIT',ruleId:'DOSE-UNIT',severity:'low',label:'Dose limit not checked',kind:'dose',basis:'Dose unit “'+dose.unit+'” differs from the order unit “'+k.order_unit_code+'”',by:actorId,at:stamp,decision:'shown'});
              const prepReason=String(pl['prepReason:'+e.key]||'').trim();
              schema.preparationIssues(k,{viaTube,dose:dose.value,sameUnit}).forEach(o=>{must(!o.block,'“'+name+'”: '+o.label.toLowerCase()+'; cannot be given via feeding tube — choose another drug or route');must(prepReason.length>0,'“'+name+'”: '+o.label.toLowerCase()+'; a reason is required to add the order');doseLines.push({pair:e.key+'|PREP|'+o.ruleId,ruleId:o.ruleId,severity:'high',label:o.label,kind:'preparation',basis:viaTube&&o.ruleId!=='PREP-NO-SPLIT'?'Ordered via feeding tube':'Dose '+dose.value+' '+dose.unit,by:actorId,at:stamp,decision:'override',reason:prepReason});});}
            // 每公斤劑量上限（2026-10-18）：用病人最新一筆體重算；超過與單次／每日上限共用同一個說明欄。沒有體重、區間外、沒有出生日期或單位不同記為未檢核並留在醫囑上，不算通過。
            const wd=med?schema.weightDose(n,e.key,p,String(pl['start:'+e.key]||payload.start||'').slice(0,10)||undefined):null;
            if(wd){const r=schema.weightDoseIssues(wd,dose,daily);r.over.forEach(overLine);
              if(r.unchecked)doseLines.push({pair:e.key+'|DOSE|DOSE-KG-NOT-CHECKED',ruleId:'DOSE-KG-NOT-CHECKED',severity:'low',label:'Per-kg dose limit not checked',kind:'dose',basis:r.unchecked,by:actorId,at:stamp,decision:'shown'});}
            // 劑量體重過期（2026-10-22）：用到體重（每公斤上限或每公斤輸入）且超過門檻時留一條參考列，不擋。
            const dwUsed=(wd&&wd.weight)||(dosePerKg?schema.dosingWeight(n,p,dayOf):null);
            if(dwUsed&&dwUsed.stale)doseLines.push({pair:e.key+'|DOSE|DOSE-WEIGHT-STALE',ruleId:'DOSE-WEIGHT-STALE',severity:'low',label:'Dosing weight may be outdated',kind:'dose',basis:schema.weightStaleText(dwUsed),by:actorId,at:stamp,decision:'shown'});
            // priority 對所有醫囑都收（MedicationRequest.priority／ServiceRequest.priority 同一值域）；沒選＝routine。
            const priority=priorities[pl['priority:'+e.key]]?String(pl['priority:'+e.key]):'routine';
            const method=med?String(pl['method:'+e.key]||'').trim():'';if(method)must(methods[method],'Invalid administration method code');
            const oid=id(med?'M':'L');const {fromSet,fromOrder,...snapshot}=e;const lab=['lab','imaging'].includes(taxonomy.categoryOfEntry(current));
            const itemStart=pl['start:'+e.key]?timestamp(pl['start:'+e.key]):start;
            const rawEnd=String(pl['end:'+e.key]||'').trim();
            must(!(rawEnd&&dosing.bounds),'An item cannot have both a duration and an end time; enter only one');
            // 訖留空＝持續到停用為止，這是住院醫囑的常態；填了療程（boundsDuration）就由起算出訖。
            const itemEnd=rawEnd?timestamp(rawEnd):(dosing.bounds?endFromBounds(itemStart,dosing.bounds.value,dosing.bounds.unit):batchEnd);
            must(!itemEnd||itemEnd>itemStart,'End time must be after each item\'s start time');
            // 醫令限制與供應天數上限（2026-10-18）：身分／部門／專科不符直接擋；需核准、需適應症要填並留在醫囑上；療程不得超過最大天數（沒填訖＝持續到停用，也算超過）。
            const rxLines=[];
            if(med){const a=n.people[actorId]||{},name=e.zh||e.name;
              schema.restrictionBlocks(rx,a).forEach(r=>must(false,'Order restriction for “'+name+'”: '+schema.restrictionText(r)));
              rx.restrictions.filter(r=>r.restriction_type==='approval').forEach(r=>{const v=String(pl['rxApproval:'+e.key]||'').trim();must(v,'“'+name+'” requires approval ('+r.value+'); enter the approval reference');rxLines.push({pair:e.key+'|RST|'+r.id,ruleId:'RST-APPROVAL',severity:'high',label:'Approval required',kind:'restriction',basis:schema.restrictionText(r),by:actorId,at:stamp,decision:'approved',reason:v});});
              rx.restrictions.filter(r=>r.restriction_type==='indication').forEach(r=>{const v=String(pl['rxIndication:'+e.key]||'').trim();must(v,'“'+name+'” requires an indication ('+r.value+'); enter the indication');rxLines.push({pair:e.key+'|RST|'+r.id,ruleId:'RST-INDICATION',severity:'high',label:'Indication required',kind:'restriction',basis:schema.restrictionText(r),by:actorId,at:stamp,decision:'indication',reason:v});});
              if(rx.maxDays){const days=dosing.bounds?dosing.bounds.value*unitHours[dosing.bounds.unit]/24:itemEnd?(Date.parse(itemEnd)-Date.parse(itemStart))/864e5:null;must(days!==null&&days<=rx.maxDays,'“'+name+'” is limited to '+rx.maxDays+' days per order; enter a duration or end time within that limit');}}
            // 給藥單位換算：醫囑單位對得上維護的換算列時，一併記下給藥量（FHIR dispenseRequest.quantity）。
            const dq=med?schema.dispenseQuantity(rx.conversion,dose):null;
            return {id:oid,p,version:1,name:e.name,kind:e.kind,catalog:snapshot,fromSet:fromSet||null,batch,
              dose:med?dose.value+' '+dose.unit:'1 '+(/^l[ầa]n$/i.test(e.unit||'')?'time':(e.unit||'time')),
              route:med?(route.zh||route.name):(e.isLab?'Lab':'Exam / procedure'),routeCatalog:route,routeMismatch,
              priority,
              // FHIR R5 MedicationRequest.dosageInstruction；途徑用院方 B 目錄代碼，給藥方法用 SNOMED CT。
              ...(viaTube?{viaTube:true}:{}),
              dosageInstruction:med?[{text:dosageText(dose,route,method,dosing)+(dosePerKg?' ('+dosePerKg.value+' '+dosePerKg.unit+' × '+dosePerKg.kg+' kg'+(dosePerKg.mode==='daily'?' ÷ '+dosePerKg.perDay+'/day':'')+')':'')+(dosePerBsa?' ('+dosePerBsa.value+' '+dosePerBsa.unit+' × '+dosePerBsa.bsa+' m²)':'')+(viaTube?', via feeding tube':''),timing:dosing.timing,
                ...(viaTube?{additionalInstruction:[{text:'Via enteral feeding tube'}]}:{}),
                ...(dosing.asNeeded?{asNeeded:true,asNeededFor:dosing.asNeededFor}:{}),
                route:{coding:[{system:'urn:hospital:B:56_給藥途徑',code:String(route.code),display:route.name}],text:route.name},
                ...(method?{method:{coding:[{system:SCT,code:method,display:methods[method][0]}],text:methods[method][1]}}:{}),
                doseAndRate:[{type:{coding:[{system:'http://terminology.hl7.org/CodeSystem/dose-rate-type',code:'ordered'}]},doseQuantity:{value:dose.value,unit:dose.unit},...(dosing.rateQuantity?{rateQuantity:dosing.rateQuantity}:{})},
                  ...(dosePerKg?[{type:{coding:[{system:'http://terminology.hl7.org/CodeSystem/dose-rate-type',code:'calculated'}]},doseQuantity:{value:dosePerKg.value,unit:dosePerKg.unit}}]:[]),
                  ...(dosePerBsa?[{type:{coding:[{system:'http://terminology.hl7.org/CodeSystem/dose-rate-type',code:'calculated'}]},doseQuantity:{value:dosePerBsa.value,unit:dosePerBsa.unit}}]:[])],
                ...(dosing.maxDosePerPeriod?{maxDosePerPeriod:dosing.maxDosePerPeriod}:{})}]:undefined,
              dosing:lab?{mode:'once',frequency:'Once now'}:(({timing,asNeededFor,maxDosePerPeriod,rateQuantity,...rest})=>rest)(dosing),frequency:lab?'Once now':dosing.frequency,orderedAt,start:itemStart,end:itemEnd,
              consultSource:payload.consultSource||null,mdtSource:payload.mdtSource||null,refSource:payload.refSource||null,clinical:'active',local:'signed',signedAt:orderedAt,signatureExempt:lab,his:lab?'accepted':med?'notSent':'none',
              occurrence:oid+'-V1-D1',author:actorId,stay:workflow.currentStay(subject),
              clinicalInfo:String(payload.clinicalInfo||'').trim().slice(0,5000),
              ...(med&&rx.attributes.length?{attributes:rx.attributes}:{}),
              ...(dwUsed?{dosingWeight:{kg:dwUsed.kg,at:dwUsed.at,observation:dwUsed.id,basis:dwUsed.basis,ageDays:dwUsed.ageDays,stale:!!dwUsed.stale}}:{}),
              ...(dosePerKg?{dosePerKg}:{}),
              ...(dosePerBsa?{dosePerBsa}:{}),
              ...(dq?{dispenseQuantity:dq}:{}),
              safety:safety.concat(doseLines||[],rxLines||[])};});
          if(payload.consultSource)must(n.consultations.some(c=>c.id===payload.consultSource&&c.p===p&&c.adoption?.decision==='adopt'),'Consultation source must be an adopted recommendation for the same patient');
          // EMR整合MDT demo（P2）：醫囑可帶團隊會議結論的交接任務為來源；任務必須屬於同一位病人。
          if(payload.mdtSource)must(root.ICUMdtCore&&root.ICUMdtCore.taskFor(n,String(payload.mdtSource),p),'MDT source must be a hand-off task of the same patient');
          if(payload.refSource)must(root.ICUMdtCore&&root.ICUMdtCore.refFor(n,String(payload.refSource),p),'Allied-health consult source must belong to the same patient');
          n.orders.push(...items);
          // 檢驗檢查（2026-10-30）：免簽，開立即送 HIS ServiceRequestCreated（D7 §5.13，同一批一張需求單）；HIS 同步回傳需求單號就可執行。原型只記在示範佇列，不真的送。
          {const labs=items.filter(o=>o.signatureExempt);if(labs.length){const pt=n.patients.find(x=>x.id===p),orderNumber=id('REQ');labs.forEach(o=>{o.hisOrderNumber=orderNumber;o.sentAt=orderedAt;});
            (n.hisOutbox=n.hisOutbox||[]).push(workflow.serviceRequestMessage(n,pt,labs,{batch,requester:workflow.hisAccount(n,actorId),at:orderedAt,priority:labs[0].priority},id('HIS'),at()));}}
          // 醫囑不用簽（2026-11-01 院方定案）：確認加入就生效；檢驗檢查與其他服務醫囑同時開待回報告與追蹤工作。
          const openedAt=at();items.filter(o=>o.his==='accepted'||(o.kind==='service'&&!o.signatureExempt)).forEach(o=>openLabRequest(n,o,actorId,id,openedAt));
          delete n.drafts[k];delete n.drafts[actorId+':'+p+':orderDetails'];delete n.drafts[actorId+':'+p+':cartMeta'];delete n.drafts[actorId+':'+p+':cartCleared'];break;}
        case 'infusion': {requireRole('nurse');const o=get('orders',payload.id);must(o.local==='signed','No verifiable order source');must(o.clinical!=='cancelled','This order was cancelled by the doctor; infusion cannot be recorded');must(payload.rate!==''&&Number.isFinite(Number(payload.rate))&&Number(payload.rate)>=0,'Enter a valid observed rate');n.infusionChecks.push({id:id('INF'),p,order:o.id,orderVersion:o.version,rate:Number(payload.rate),unit:text(payload.unit,'Rate unit'),at:timestamp(payload.at),actor:actorId,reason:text(payload.reason,'Observation and discrepancy notes')});break;}
        case 'execute': {requireRole('nurse');const o=get('orders',payload.id);must(o.local==='signed','This order is not signed yet, so it cannot be carried out');must(o.clinical!=='cancelled','This order was cancelled by the doctor; cannot be administered');must(!n.executions.some(e=>e.occurrence===o.occurrence&&e.status==='done'),'This dose already has a completed record; do not administer again');const time=timestamp(payload.at);must(time>=o.start&&(!o.end||time<o.end),'Actual time is outside this order version\'s effective period');must(['done','held','notDone'].includes(payload.status),'Invalid administration status');const identityConfirmed=payload.identityConfirmed===true||payload.identityConfirmed==='on';if(payload.status==='done'&&o.kind==='medication')must(identityConfirmed,'Confirm patient identity before administration');// 高警訊藥雙人核對（2026-11-01 院方定案）：A08 的藥記為已給時，要選另一位在職護理師當核對者。
const highAlert=o.kind==='medication'&&(o.attributes||[]).includes('A08');if(payload.status==='done'&&highAlert){const w=n.people[payload.witness];must(w&&w.role==='nurse'&&w.active!==false&&payload.witness!==actorId,'High-alert medication: choose the second nurse who double-checked it');}
const dosed=payload.status==='done'&&o.kind==='medication';const actual=dosed?text(payload.actual,'Dose'):null;const route=dosed?text(payload.route,'Route'):null;const differs=payload.status!=='done'||(dosed&&(actual!==o.dose||route!==o.route));const reason=differs?text(payload.reason,'Status reason (variance, on hold or not done)'):payload.reason||'';n.executions.push({id:id('E'),p,order:o.id,version:o.version,occurrence:o.occurrence,at:time,recorded:at(),actor:actorId,status:payload.status,actual,route,reason,identityConfirmed:payload.status==='done'&&o.kind==='medication'?true:undefined,witness:payload.status==='done'&&highAlert?payload.witness:undefined,review:null});break;}
        case 'reviewExecution': {requireDoctor();const e=get('executions',payload.id);must(['reviewed','difference'].includes(payload.outcome),'Select a review outcome');e.reviewHistory=e.reviewHistory||[];if(e.review)e.reviewHistory.push(clone(e.review));e.review={actor:actorId,at:at(),outcome:payload.outcome,note:text(payload.note,'Basis for review')};break;}
        case 'order': {requireDoctor();const oid=id(payload.kind==='service'?'L':'M');n.orders.push({id:oid,p,version:1,name:text(payload.name,'Order content'),kind:payload.kind==='service'?'service':'medication',dose:text(payload.dose,'Quantity and unit'),route:text(payload.route,'Route / exam type'),frequency:text(payload.frequency,'Frequency'),orderedAt:at(),start:timestamp(payload.start),end:null,clinical:'active',local:'signed',signedAt:at(),his:payload.kind==='service'?'none':'notSent',occurrence:oid+'-V1-D1',author:actorId,stay:workflow.currentStay(n.patients.find(x=>x.id===p))});if(payload.kind==='service')openLabRequest(n,n.orders.at(-1),actorId,id,at());break;}
        // 醫囑不用簽（2026-11-01），也不連病程（2026-11-08）：病程撰寫時由右側引用區帶入藥囑文字，醫囑本身不存病程關聯。
        case 'signOrder': {requireDoctor();must(false,'Orders take effect as soon as they are added; there is nothing to sign');break;}
                case 'hisResponse': {requireDoctor();const o=get('orders',payload.id);must(['sent','unknown'].includes(o.his),'No submitted orders awaiting confirmation');if(n.scenario==='timeout'){o.his='unknown';break;}must(['accepted','rejected'].includes(payload.status),'Invalid HIS response');/* HIS 回覆只記計費結果，不影響醫囑生效與給藥（2026-10-30）。 */o.his=payload.status;o.hisRespondedAt=at();break;}
        case 'cancelOrder': {requireDoctor();const o=get('orders',payload.id);must(o.clinical!=='cancelled','This order has already been cancelled');must(!n.executions.some(e=>e.order===o.id&&e.status==='done'),'A completed administration record exists, so it cannot be cancelled; order a stop order instead');
          // 檢驗檢查只要還沒採檢／執行就能停止；報告一旦回覆就只能判讀處理，不能當作沒發生過。
          const lab=isLabImaging(o),linked=n.reports.filter(r=>r.order===o.id||r.id===o.id);
          must(!lab||!linked.some(r=>r.status==='returned'),'Report already returned, so it cannot be stopped; close it by recording interpretation and follow-up instead');
          // 已簽署生效的醫囑，取消必須留下原因；未簽署的草稿不強制。
          const needsReason=o.local==='signed';const reason=needsReason?text(payload.reason,'Reason for cancellation'):String(payload.reason||'').trim();
          o.cancel={actor:actorId,at:at(),reason,fromLocal:o.local,fromHis:o.his};o.clinical='cancelled';o.end=o.end||at();
          if(lab){const stamp=o.cancel.at;
            linked.filter(r=>r.status==='pending').forEach(r=>{r.status='cancelled';r.cancelledAt=stamp;r.cancelledBy=actorId;});
            n.tasks.filter(t=>t.source===o.id&&t.status!=='done').forEach(t=>{t.history.push({from:t.status,to:'done',actor:actorId,at:stamp});t.status='done';t.evidence='Order stopped: '+reason;});}
          break;}
        case 'reportReturn': {const r=get('reports',payload.id);must(r.status==='pending','Report already returned');r.status='returned';r.at=timestamp(payload.at||'2026-08-31T17:00');r.recordedAt=at();r.text='Simulated backfilled result; not real clinical data';r.components=clinical.demoComponents(r.catalog?.key);r.collectedAt=null;r.source='Demo source report, not real HIS';break;}
        // 手動登錄檢驗檢查結果（2026-09-26）：還不確定院方有沒有可串接的 API，醫師或護理師照紙本或外部報告登錄。
        // 可補上一筆待回報告（連回原醫囑），或新增一筆沒有醫囑關聯的結果。正常／異常只看登錄者選的旗標，系統不依參考範圍自行判定。
        case 'labResultManual': {const kind=payload.kind==='exam'?'exam':'lab';const collectedAt=timestamp(payload.collectedAt),reportAt=timestamp(payload.at);must(reportAt>=collectedAt,'Report time cannot be earlier than collection / exam time');
          const target=payload.reportId?get('reports',payload.reportId):null;if(target)must(target.status==='pending','This report has already been returned; it cannot be backfilled');
          const flags=['','N','H','L','HH','LL','A'];const components=[];
          const info=target&&target.catalog&&target.catalog.key?clinical.labInfo(target.catalog.key,n):{};
          const category=clinical.labCategories.includes(payload.category)?payload.category:(info.category||'Uncategorized'),specimen=clinical.labSpecimens.includes(payload.specimen)?payload.specimen:(info.specimen||'Not provided by source');
          if(kind==='lab'){for(let i=0;i<12;i++){const name=String(payload['cName:'+i]||'').trim(),raw=String(payload['cValue:'+i]??'').trim();if(!name&&raw==='')continue;
              must(name,' row '+(i+1)+' has a value but no lab test name');must(raw!=='','“'+name+'” has no lab value; delete this row if it was not done');
              const flag=String(payload['cFlag:'+i]||'');must(flags.includes(flag),'“'+name+'” has an invalid flag');
              components.push({id:'MAN:'+name.toUpperCase(),name,value:Number.isFinite(Number(raw))?Number(raw):raw,unit:String(payload['cUnit:'+i]||'').trim(),reference:String(payload['cRef:'+i]||'').trim()||null,interpretation:flag||null,category,specimen,mapping:'Manually entered, not a HIS indicator code'});}
            must(components.length,'Enter at least one lab test and value');}
          const reportText=kind==='exam'?text(payload.text,'Full exam result text'):String(payload.text||'').trim().slice(0,5000)||null;
          const catalog=target?target.catalog:(payload.key?clinical.snapshot(payload.key):null);if(payload.key&&!target)must(catalog&&catalog.kind==='service'&&catalog.active,'Lab / exam item does not exist or is inactive');
          const name=catalog?(catalog.zh||catalog.name):target?(target.kind||target.id):text(payload.name,'Lab / exam item');
          const stamp={status:'returned',at:reportAt,collectedAt,recordedAt:at(),text:reportText,components,impression:String(payload.impression||'').trim()||null,entry:'manual',enteredBy:actorId,source:'Manual entry · '+a.name};
          if(target){target.backfill={before:workflow.pickStamp(target)};Object.assign(target,stamp);}
          else n.reports.push({id:id('R'),p,kind:kind==='exam'?'Exam':'Lab',...(kind==='exam'?{examType:['Imaging','Ultrasound','Endoscopy','ECG','Other'].includes(payload.examType)?payload.examType:'Other'}:{}),version:1,seen:[],processed:[],catalog:catalog||{name,zh:name},order:null,...stamp});
          break;}
        case 'readReport': {const r=get('reports',payload.id);must(n.scenario!=='missing'&&r.status==='returned','Source missing or report not returned; cannot mark as read');must(!r.seen.some(x=>x.actor===actorId&&x.version===r.version),'You have already marked this version as read');r.seen.push({actor:actorId,at:at(),version:r.version});break;}
        case 'processReport': {requireDoctor();const r=get('reports',payload.id);must(n.scenario!=='missing'&&r.status==='returned','Source missing or report not returned; cannot interpret');r.processed.push({actor:actorId,at:at(),version:r.version,note:text(payload.note,'Follow-up record')});break;}
        case 'goal': {must(workflow.canWrite(n,p,actorId),'Care team doctors only');const diagnosis=payload.icd?clinical.snapshot(payload.icd):null;if(payload.icd)must(diagnosis&&diagnosis.kind==='icd'&&diagnosis.active,'Select a valid ICD catalog entry');n.goals.push({diagnosis,id:id('G'),p,problem:text(payload.problem,'Problem'),assessment:payload.assessment?text(payload.assessment,'Assessment'):null,goal:text(payload.goal,'Plan'),actor:actorId,at:at()});break;}
        case 'careFocus': {must(workflow.canWrite(n,p,actorId),'Care team doctors only');n.careFocuses=n.careFocuses||[];n.careFocuses.push({id:id('FOCUS'),p,text:text(payload.text,'Care focus'),actor:actorId,at:at()});break;}
        case 'communication': n.communications.push({id:id('C'),p,kind:payload.kind||'Family communication',recipient:text(payload.recipient,'Communicated with (fictional)'),text:text(payload.text,'Communication content'),actor:actorId,at:at()});break;
        case 'consultRequest': {requireDoctor();n.consultations=n.consultations||[];const assignee=n.people[payload.assignee];must(assignee&&assignee.role==='doctor'&&payload.assignee!==actorId,'Select a valid consult department and person');n.consultations.push({id:id('CONS'),p,specialty:assignee.specialty||assignee.department,urgency:['routine','urgent'].includes(payload.urgency)?payload.urgency:'routine',assignee:payload.assignee,subject:String(payload.subject||'').trim().slice(0,80)||null,question:text(payload.question,'Reason for consult and question'),requester:actorId,requestedAt:at(),status:'requested',recommendation:null,responder:null,respondedAt:null});break;}
        case 'consultRespond': {requireRole('doctor');const consult=get('consultations',payload.id);must(consult.assignee===actorId,'This consult is not assigned to the current user');must(consult.status==='requested','This consult has already been replied to');consult.recommendation=text(payload.recommendation,'Consult recommendation');consult.responder=actorId;consult.respondedAt=at();consult.status='completed';break;}
        case 'note': {let soap=null;if(payload.format==='soap'){requireRole('doctor');soap=Object.fromEntries(['S','O','A','P'].map(k=>[k,text(payload[k],k+' section')]));}const body=soap?clinical.soapText(soap):text(payload.text,'Note content');n.notes.push({id:id('DOC'),p,kind:a.role==='doctor'?'Progress':'Nursing note',text:body,soap,clinicalAt:payload.clinicalAt?timestamp(payload.clinicalAt):at(),author:actorId,stay:workflow.currentStay(n.patients.find(x=>x.id===p)),version:1,status:'draft',at:at(),references:n.observations.filter(o=>o.p===p&&!o.voided).map(o=>o.id)});delete n.drafts[actorId+':'+p+':note'];break;}
        case 'copyPreviousProgress': {must(workflow.canWrite(n,p,actorId),'Care team doctors only');const clinicalDate=/^2026-\d\d-\d\d$/.test(payload.clinicalDate||'')?payload.clinicalDate:'2026-08-31';
          const key=actorId+':'+p+':recordWriter:progress',existing=n.drafts[key]||{},base={...existing,writerType:'progress',clinicalAt:existing.clinicalAt||clinicalDate+'T09:00'};
          const SOAP=['S','O','A','P'],live=d=>!d.voided&&!n.notes.some(y=>y.replaces===d.id),isProgress=d=>d.p===p&&d.status==='signed'&&(d.noteType==='progress'||d.soap)&&(d.progressKind||'soap')==='soap'&&live(d);
          const refsWith=ids=>[...new Set([...String(existing.referenceIds||'').split(','),...ids])].map(x=>x.trim()).filter(Boolean).join(',');
          // 住院病歷只有主觀病史可帶進 S：入院理由、病程經過、本人與家族病史——其餘三段本來就不是主觀資料。
          const subjectiveOf=adm=>{const a=adm.sections||{};return [['Reason for admission',a.CC],['Course of illness',a.PI],['Past medical history (personal)',a.PH],['Past medical history (family)',a.PHFamily]].filter(x=>String(x[1]||'').trim()).map(x=>x[0]+': '+x[1]).join('\n');};
          const fromAdmission=adm=>{const subjective=subjectiveOf(adm);must(subjective,'This admission note has no subjective history to import');n.drafts[key]={...base,S:subjective,copiedFrom:adm.id,copySource:'admission',copiedSections:['S'],copySnapshot:{S:subjective},copiedAt:at(),referenceIds:refsWith([adm.id])};};
          // 指定來源（2026-10-18）：從清單選一份已簽、未被新版取代的病程，再勾要帶哪幾段；只覆寫勾選的段，其餘保留。住院病歷只能帶 S。
          if(payload.sourceId){const src=n.notes.find(d=>d.id===payload.sourceId);must(src&&src.p===p,'Copy source not found for this patient');must(src.status==='signed','Only signed notes can be copied');must(live(src),'This version has been superseded; copy from the latest version');
            const wanted=String(payload.sections||'').split(',').map(x=>x.trim()).filter(Boolean);must(wanted.length&&wanted.every(k=>SOAP.includes(k)),'Select at least one of S, O, A, P to copy');
            if(src.noteType==='admission'){must(wanted.length===1&&wanted[0]==='S','The admission note can only be copied into S');fromAdmission(src);break;}
            must((src.noteType==='progress'||src.soap)&&(src.progressKind||'soap')==='soap','Copy source must be a daily SOAP progress note or an admission note');const prior=src.sections||src.soap||{};must(wanted.every(k=>typeof prior[k]==='string'),'The selected sections are missing in the source note');
            const picked=Object.fromEntries(SOAP.filter(k=>wanted.includes(k)).map(k=>[k,prior[k]]));
            n.drafts[key]={...base,...picked,copiedFrom:src.id,copySource:'progress',copiedSections:Object.keys(picked),copySnapshot:picked,copiedAt:at(),referenceIds:refsWith(src.references||[])};break;}
          // 沒指定來源：沿用一鍵帶入——有前一日病程就整份複製，沒有才退到住院病歷的主觀病史。
          const previous=n.notes.filter(d=>isProgress(d)&&String(d.clinicalAt||d.at).slice(0,10)<clinicalDate).sort((x,y)=>clinical.millis(y.clinicalAt||y.at)-clinical.millis(x.clinicalAt||x.at))[0];
          if(previous){const prior=previous.sections||previous.soap;must(prior&&SOAP.every(k=>typeof prior[k]==='string'),'Previous progress note lacks a complete SOAP structure');
            n.drafts[key]={...base,S:prior.S,O:prior.O,A:prior.A,P:prior.P,copiedFrom:previous.id,copySource:'progress',copiedSections:[...SOAP],copySnapshot:{S:prior.S,O:prior.O,A:prior.A,P:prior.P},copiedAt:at(),referenceIds:[...(previous.references||[])].join(',')};break;}
          const admission=n.notes.filter(d=>d.p===p&&d.noteType==='admission'&&d.status==='signed'&&live(d)&&clinical.millis(d.clinicalAt||d.at)<=clinical.millis(clinicalDate+'T23:59')).sort((x,y)=>clinical.millis(y.clinicalAt||y.at)-clinical.millis(x.clinicalAt||x.at))[0];
          must(admission,'No signed progress note from the previous day and no signed admission note to import subjective history from');
          fromAdmission(admission);break;}
        case 'recordNote': {
          // 出生與成長史（2026-10-24）：兒科病歷 I-A-01-001-070～087，全部選填；選單存臨床選項代碼，停用的不能存；先天畸形選「有」才寫描述。
          const birthHistory=pl=>{const whole=(v,label,min,max)=>{const t=String(v??'').trim();if(!t)return '';must(/^\d+$/.test(t)&&Number(t)>=min&&Number(t)<=max,`${label} must be a whole number from ${min} to ${max}`);return String(Number(t));};
            const options=(n.master&&n.master.clinicalOption)||{},pick=(v,set,label)=>{const t=String(v??'').trim();if(!t)return '';const r=options[t];must(r&&r.value_set===set&&r.active!==false,`${label}: “${t}” is not an active option`);return t;};
            const anomaly=String(pl.congenitalAnomaly??'').trim(),detail=String(pl.congenitalAnomalyDetail??'').trim();must(['','no','yes'].includes(anomaly),'Invalid congenital anomaly answer');
            if(anomaly==='yes')must(detail,'Describe the congenital anomaly');else must(!detail,'Congenital anomaly details are recorded only when the answer is Yes');
            const vaccines=[...new Set(String(pl.vaccines??'').split(',').map(x=>x.trim()).filter(Boolean))].map(x=>pick(x,'vaccine','Vaccines received'));
            return {birthOrder:whole(pl.birthOrder,'Birth order',1,20),paraTerm:whole(pl.paraTerm,'Para · term',0,30),paraPreterm:whole(pl.paraPreterm,'Para · preterm',0,30),paraAbortion:whole(pl.paraAbortion,'Para · abortion / miscarriage',0,30),paraLiving:whole(pl.paraLiving,'Para · living',0,30),
              birthMethod:pick(pl.birthMethod,'birth_method','Birth method'),birthWeight:whole(pl.birthWeight,'Birth weight (g)',300,7000),congenitalAnomaly:anomaly,congenitalAnomalyDetail:detail,
              devMental:opt(pl.devMental,'Mental development'),devMotor:opt(pl.devMotor,'Motor development'),devOtherIllness:opt(pl.devOtherIllness,'Other illnesses during growth'),
              feedingMethod:pick(pl.feedingMethod,'feeding_method','Feeding'),weaningMonth:whole(pl.weaningMonth,'Weaned at month',0,60),childcareSetting:pick(pl.childcareSetting,'childcare_setting','Childcare'),
              vaccines:vaccines.join(','),vaccinesOther:opt(pl.vaccinesOther,'Other vaccines')};};
          // 身體診察數值（2026-10-27）：脈搏、體溫、血壓、呼吸、體重必填（TDL.0092–0097），身高、胸圍、頭圍選填（TDL.0089–0091）；BMI 只算不存。
          const measured=pl=>{const num=(k,label,min,max,required)=>{const t=String(pl[k]??'').trim();if(!t){must(!required,`${label} is required`);return '';}must(/^\d+(\.\d+)?$/.test(t)&&Number(t)>=min&&Number(t)<=max,`${label} must be a number from ${min} to ${max}`);return String(Number(t));};
            const out={vsPulse:num('vsPulse','Pulse (/min)',0,300,true),vsTemperature:num('vsTemperature','Temperature (°C)',25,45,true),vsSystolic:num('vsSystolic','Systolic BP (mmHg)',0,300,true),vsDiastolic:num('vsDiastolic','Diastolic BP (mmHg)',0,250,true),vsRespiration:num('vsRespiration','Respiratory rate (/min)',0,150,true),vsWeight:num('vsWeight','Weight (kg)',0.3,300,true),
              bodyHeight:num('bodyHeight','Height (cm)',20,250,false),bodyChest:num('bodyChest','Chest circumference (cm)',10,200,false),bodyHead:num('bodyHead','Head circumference (cm)',10,80,false)};
            must(Number(out.vsSystolic)>=Number(out.vsDiastolic),'Systolic BP cannot be lower than diastolic BP');return out;};
          // 出院摘要第 1 步（2026-10-27）：醫療意外、併發症必答是／否；切片病理選填（02/BV-01 封面第 23、25 項）。
          const dischargeFlags=pl=>{const yn=(k,label)=>{const t=String(pl[k]??'').trim();must(['yes','no'].includes(t),`${label}: answer Yes or No`);return t;};const path=String(pl.pathology??'').trim();must(!path||workflow.PATHOLOGY.some(x=>x[0]===path),'Invalid pathology result');
            return {adverseEvent:yn('adverseEvent','Medical incident'),complication:yn('complication','Complication'),pathology:path};};
          must(workflow.canWrite(n,p,actorId)||(payload.noteType==='progress'&&payload.progressKind==='procedure'&&workflow.canWriteProcedure(n,p,actorId)),'Care team doctors only');must(['admission','progress','discharge'].includes(payload.noteType),'Invalid medical record type');const type=payload.noteType,clinicalAt=timestamp(payload.clinicalAt),references=String(payload.referenceIds||'').split(',').map(x=>x.trim()).filter(Boolean).filter((x,i,list)=>list.indexOf(x)===i);let sections,soap=null,kind,diagnoses=[];
          // 病程類型（2026-10-25）：每日 SOAP、轉入摘要、轉出摘要；後兩種各七段、全部必填，暫存各自分開放。2026-10-31 加處置紀錄，欄位與檢核照 periop-forms.js 的 procedureNote。
          const progressKind=type==='progress'?String(payload.progressKind||'soap'):null;if(type==='progress')must(['soap','acceptance','transfer','procedure'].includes(progressKind),'Invalid progress note type');const draftKind=progressKind&&progressKind!=='soap'?type+'.'+progressKind:type;
          if(type==='admission'){const dxKeys=[...new Set(String(payload.diagnosisKeys||payload.diagnosisKey||'').split(',').map(x=>x.trim()).filter(Boolean))];must(dxKeys.length>0,'Select at least one ICD-10 diagnosis code; the first is the principal diagnosis');
            sections={CC:text(payload.CC,'Reason for admission'),illnessDay:opt(payload.illnessDay,'Day of illness at admission'),PI:text(payload.PI,'Course of illness'),PH:text(payload.PH,'Past medical history (personal)'),PHFamily:opt(payload.PHFamily,'Past medical history (family)'),
              ...measured(payload),vitalSummary:opt(payload.vitalSummary,'Other vital signs'),examGeneral:text(payload.examGeneral,'Physical exam (general)'),
              examCirculatory:opt(payload.examCirculatory,'Cardiovascular'),examRespiratory:opt(payload.examRespiratory,'Respiratory'),examDigestive:opt(payload.examDigestive,'Gastrointestinal'),examRenal:opt(payload.examRenal,'Renal / genitourinary'),examNeuro:opt(payload.examNeuro,'Neurological'),examMusculoskeletal:opt(payload.examMusculoskeletal,'Musculoskeletal'),examOther:opt(payload.examOther,'ENT, oral, nutrition, skin and other'),
              plannedTests:opt(payload.plannedTests,'Pending labs & exams'),summary:text(payload.summary,'Summary'),initialAssessment:text(payload.initialAssessment,'Initial assessment'),differential:opt(payload.differential,'Differential diagnosis'),prognosis:text(payload.prognosis,'Prognosis'),treatmentPlan:text(payload.treatmentPlan,'Treatment plan'),...birthHistory(payload)};
            kind='Admission note';dxKeys.forEach(key=>{const diagnosis=clinical.snapshot(key);must(diagnosis&&diagnosis.kind==='icd'&&diagnosis.active,'Select a valid ICD-10 diagnosis code: '+key);diagnoses.push(diagnosis);references.push(diagnosis.key);});}
          if(type==='progress'&&progressKind==='soap'){sections={S:text(payload.S,'S Subjective'),O:text(payload.O,'O Objective'),A:text(payload.A,'A Assessment'),P:text(payload.P,'P Plan')};soap={S:sections.S,O:sections.O,A:sections.A,P:sections.P};kind='Progress note';}
          if(type==='progress'&&progressKind==='procedure'){const PFm=typeof module!=='undefined'?require('./periop-forms.js'):root.ICUPeriopForms,pt=n.patients.find(x=>x.id===p);
            sections=PFm.validate('procedureNote',payload,{must,now:workflow.now(n),admitted:pt.admittedAt||pt.admitted,options:(set,keep)=>schema.clinicalOptions(n,set,keep)});kind='Procedure note';}
          if(type==='progress'&&(progressKind==='acceptance'||progressKind==='transfer')){const common={admitReason:text(payload.admitReason,'Reason for admission'),courseSummary:text(payload.courseSummary,'Course of illness or treatment'),keyFindings:text(payload.keyFindings,'Key exam findings'),invasiveRecords:text(payload.invasiveRecords,'Invasive procedure reports / operative records'),currentTreatment:text(payload.currentTreatment,'Current medications and other treatment')};
            sections=progressKind==='acceptance'?{...common,transferInReason:text(payload.transferInReason,'Reason for transfer in'),carePlan:text(payload.carePlan,'Treatment plan')}:{...common,transferOutReason:text(payload.transferOutReason,'Reason for transfer out'),precautions:text(payload.precautions,'Precautions')};kind=progressKind==='acceptance'?'Acceptance note':'Transfer note';}
          if(type==='discharge'){sections={admissionDate:text(payload.admissionDate,'Admission date'),admissionDiagnosis:text(payload.admissionDiagnosis,'Admission diagnosis'),dischargeDate:text(payload.dischargeDate,'Discharge date'),dischargeDiagnosis:text(payload.dischargeDiagnosis,'Discharge diagnosis'),...dischargeFlags(payload),
              course:text(payload.course,'Pathological course and clinical evolution'),labsSummary:text(payload.labsSummary,'Summary of diagnostically relevant labs & exams'),treatmentMethod:text(payload.treatmentMethod,'Treatment method'),proceduresSummary:text(payload.proceduresSummary,'Major surgeries and procedures'),ordersSummary:text(payload.ordersSummary,'Orders performed'),
              dischargeCondition:text(payload.dischargeCondition,'Condition at discharge'),followup:text(payload.followup,'Follow-up treatment and orders'),referral:opt(payload.referral,'Referral recommendations'),
              dischargeReadiness:text(payload.dischargeReadiness,'Discharge readiness'),dischargeBarriers:opt(payload.dischargeBarriers,'Discharge barriers'),dischargeFollowup:opt(payload.dischargeFollowup,'Follow-up and transition preparation'),
              educationAudience:text(payload.educationAudience,'Education audience'),educationContent:text(payload.educationContent,'Education content'),educationTeachBack:opt(payload.educationTeachBack,'Teach-back')};kind='Discharge summary';}
          const body=soap?clinical.soapText(soap):Object.entries(sections).map(([k,v])=>k+': '+v).join('\n\n'),draft=n.drafts[actorId+':'+p+':recordWriter:'+draftKind]||{},copyTrace=type==='progress'&&progressKind==='soap'&&draft.copiedFrom?{from: draft.copiedFrom,source:draft.copySource||'progress',copiedAt:draft.copiedAt||null,sections:Array.isArray(draft.copiedSections)&&draft.copiedSections.length?[...draft.copiedSections]:Object.keys(draft.copySnapshot||{}),changedSections:Object.keys(draft.copySnapshot||{}).filter(k=>String(draft.copySnapshot?.[k]||'')!==String(sections[k]||''))}:null;
          // 修改既有病歷（出院前、只能改自己寫的）：存成新版本、舊版本原文保留；已簽署者須填更正原因。
          let prior=null;if(payload.editOf){prior=get('notes',payload.editOf);must(!prior.voided,'This record has been voided; restore it first');must(prior.author===actorId,'You can only edit your own notes');must(!n.notes.some(x=>x.replaces===prior.id),'Edit from the latest version');must((prior.noteType||(prior.soap?'progress':''))===type,'Medical record type differs from the original version');if(type==='progress')must((prior.progressKind||'soap')===progressKind,'Progress note type differs from the original version');must(!n.patients.find(x=>x.id===p).dischargedAt,'Patient has been discharged, so the record can no longer be edited; use the amended-version workflow instead');must(prior.reviewStatus!=='completed','Approved records must use the amended-version workflow');if(prior.status==='signed')text(payload.reason,'Reason for amendment');}
          n.notes.push({id:id('DOC'),p,kind,noteType:type,...(progressKind?{progressKind}:{}),text:body,soap,sections,diagnoses,clinicalAt,author:actorId,stay:prior&&prior.stay?prior.stay:workflow.currentStay(n.patients.find(x=>x.id===p)),version:prior?prior.version+1:1,replaces:prior?prior.id:undefined,reason:prior?String(payload.reason||'').trim()||null:undefined,status:'draft',reviewStatus:prior?'saved':undefined,at:at(),references:[...new Set(references)],copyTrace,source:prior?'Note editor; edited from '+prior.id+' v'+prior.version:'Note editor; auto-filled content reviewed and saved by the doctor'});delete n.drafts[actorId+':'+p+':recordWriter:'+draftKind];break;}
        case 'signNote': {const d=get('notes',payload.id);must(d.author===actorId&&d.status==='draft','You can only sign your own unsigned drafts');d.status='signed';d.signedAt=at();break;}
        case 'amendNote': {const d=get('notes',payload.id);must(d.author===actorId&&d.status==='signed','You can only amend your own signed notes');let soap=null;if(payload.format==='soap'){requireRole('doctor');soap=Object.fromEntries(['S','O','A','P'].map(k=>[k,text(payload[k],k+' amended section')]));}n.notes.push({...clone(d),id:id('DOC'),replaces:d.id,version:d.version+1,status:'draft',soap,text:soap?clinical.soapText(soap):text(payload.text,'Amended content'),reason:text(payload.reason,'Reason for amendment'),clinicalAt:d.clinicalAt||d.at,at:at(),signedAt:null});break;}
        case 'handover': {{const noEntry=(a.patients||[]).filter(pid=>workflow.entryMissing(n,pid).length);must(!noEntry.length,'Complete the entry data on the patient page before handover: '+noEntry.map(pid=>{const x=n.patients.find(q=>q.id===pid);return x?x.bed+' '+x.name+' ('+workflow.entryMissing(n,pid).join(', ')+')':pid;}).join(', '));}const prior=payload.replaces?n.handovers.find(h=>h.id===payload.replaces):null;if(prior)must(prior.author===actorId&& !n.handovers.some(h=>h.replaces===prior.id),'You can only amend your own latest handover version');const receiver=a.role==='doctor'?'doctorNext':'nurseNext';must(receiver!==actorId,'This demo covers only day shift handing over to the next shift');const previousIds=new Set(prior?prior.tasks.map(t=>t.id):[]);const tasks=n.tasks.filter(t=>(t.owner===actorId||previousIds.has(t.id))&&t.status!=='done');n.handovers.push({id:id('H'),role:a.role,shift:a.shift,author:actorId,receiver,version:prior?prior.version+1:1,replaces:prior?.id||null,summary:text(payload.summary,'Handover summary'),reason:prior?text(payload.reason,'Reason for amendment'):null,at:at(),tasks:tasks.map(clone)});break;}
        case 'receive': {const h=n.handovers.find(x=>x.id===payload.id);must(h&&h.receiver===actorId&&h.role===a.role,'Handover recipient or role does not match');must(!n.handovers.some(x=>x.replaces===h.id),'This version has been amended; accept the latest version');must(!n.receipts.some(x=>x.handover===h.id),'This version has already been accepted');if(payload.clinicalAt&&h.clinicalAt)must(timestamp(payload.clinicalAt)>=h.clinicalAt,'Acceptance time cannot be earlier than handover');n.receipts.push({handover:h.id,version:h.version,actor:actorId,at:at(),...(payload.clinicalAt?{clinicalAt:timestamp(payload.clinicalAt)}:{})});h.tasks.forEach(snapshot=>{const t=n.tasks.find(t=>t.id===snapshot.id);if(t&&t.owner===h.author&&t.status!=='done'){t.history.push({fromOwner:t.owner,toOwner:actorId,handover:h.id,at:at()});t.owner=actorId;}});break;}
        // 維護檔通用寫入（2026-10-18）：表與欄位照 master-schema.js 白名單；管理者可寫全部，科常用另允許該部門的部門管理員。
        case 'masterSave': case 'masterRemove': {const table=String(payload.table||''),def=schema.tables[table];must(def,'Unknown maintenance table: '+table);n.master=schema.ensure(n.master);const rows=n.master[table];let id=String(payload.id||'').trim();
          if(def.guard==='deptAdmin'){must(id.startsWith('dept:')&&id.length>5,'Department is required');must(workflow.canMaintainDept(n,actorId,id.slice(5)),'Only this department\'s administrators or system administrators can maintain department favorites');}
          else must(a.role==='admin','Only administrators can change maintenance files');
          if(action==='masterRemove'){must(rows[id],'Record not found');must(!def.noRemove,'This entry cannot be deleted; set it inactive instead');delete rows[id];n.lastMaster={table,id:'',removed:id};break;}
          // 流程表項目（2026-10-31）：部門管理員勾選本科要記錄的項目並排順序；鍵 dept:<科別>，存項目鍵清單。
          if(table==='deptFlowsheet'){const items=[...new Set(String(payload.items||'').split(',').map(x=>x.trim()).filter(Boolean))];must(items.length,'Choose at least one item');items.forEach(k=>must(FS().byKey[k],'Unknown flowsheet item: '+k));const prev=rows[id]||{};rows[id]={items,createdBy:prev.createdBy||actorId,createdAt:prev.createdAt||at(),updatedBy:actorId,updatedAt:at()};n.lastMaster={table,id};break;}
          if(table==='deptFavorite'){const dept=id.slice(5),key=String(payload.key||'').trim(),cur=deptFav.list(dept);let list;
            if(payload.op==='add'){must(key,'Item key is required');must(!cur.includes(key),'This item is already in the department favorites');list=[...cur,key];}
            else if(payload.op==='remove'){must(cur.includes(key),'This item is not in the department favorites');list=cur.filter(k=>k!==key);}
            else if(payload.op==='move'){const i=cur.indexOf(key),j=i+(Number(payload.direction)<0?-1:1);must(i>=0,'This item is not in the department favorites');list=[...cur];if(j>=0&&j<cur.length){[list[i],list[j]]=[list[j],list[i]];}}
            else list=payload.data&&payload.data.list!==undefined?payload.data.list:payload.list;
            deptFav.save(dept,list);break;}
          const data=payload.data&&typeof payload.data==='object'?payload.data:Object.fromEntries(Object.entries(payload).filter(([k])=>!['table','id','p','encounter'].includes(k)));
          if(!def.keyed&&!id)id='MX'+(++n.seq);must(id,'Record key is required');
          if(def.keyed&&def.parentKind){const e=clinical.snapshot(id),kinds=Array.isArray(def.parentKind)?def.parentKind:[def.parentKind];must(e&&kinds.includes(e.kind),'Catalog item not found: '+id);if(def.requireLab)must(e.isLab,'Only lab items can have a lab definition: '+id);}
          if(def.idPattern){id=id.toUpperCase();must(def.idPattern.test(id),def.label+' code: '+(def.idHint||'1–16 uppercase letters or digits'));}if(def.keys)must(def.keys.includes(id),`Unknown code system: ${id}`);
          if(table==='frequencyAdminTime'){const code=String(data.frequency_code||(rows[id]&&rows[id].frequency_code)||'');must(n.master.frequency[code],'Frequency code not found in the dictionary: '+code);}
          const prev=rows[id]||null;const known=new Set(def.fields.map(f=>f.name));const row=schema.validate(table,id,{...(prev?Object.fromEntries(Object.entries(prev).filter(([k])=>known.has(k))):{}),...data},{must,clinical,state:n});
          if(def.parent)must(row[def.parent],def.label+': the parent item is required');if(table==='clinicalOption'&&prev)must(prev.value_set===row.value_set,'The option set of an existing option cannot be changed');schema.uniqueCheck(def,rows,id,row,must);
          rows[id]={...row,createdBy:prev?prev.createdBy:actorId,createdAt:prev?prev.createdAt:at(),updatedBy:actorId,updatedAt:at()};n.lastMaster={table,id};break;}
        case 'reset': {const fresh=seedMaster(seed());Object.keys(actors).forEach(id=>ensureConfirmed(fresh,id));Object.keys(n).forEach(k=>delete n[k]);Object.assign(n,fresh);break;}
        // 登出（2026-11-01 院方定案）：共用電腦上這個人所有病人的未送出這一批一起清掉，下次打開開立頁說明清了什麼。
        case 'logout': break;
        default:if(mdtOwned&&root.ICUMdtCore.handle(n,action,actorId,payload,{must,text,opt,timestamp,id,at,get,clinical}))break;throw Error('Unsupported simulated action');
      }
      // EMR整合MDT demo（P2）：原型動作之後的 MDT 連動（帶 mdtSource 的開單 → 任務「已採納開單」）。
      if(root.ICUMdtCore)root.ICUMdtCore.after(n,action,actorId,payload);
      // 送 HIS 失敗（2026-11-02）：示範「HIS 逾時」時，這次排入或重送的訊息重試 3 次仍沒回應；「HIS 拒收」時 HIS 回 4xx。兩種都留在佇列，只在病人頁標示。
      if(['timeout','hisRejected'].includes(n.scenario))(n.hisOutbox||[]).filter((m,i)=>m.status==='queued'&&(i>=outboxBefore||(action==='hisResend'&&m.id===payload.id))).forEach(m=>{const late=n.scenario==='timeout';m.status=late?'failed':'rejected';m.attempts=(m.attempts||0)+(late?4:1);m.sentAt=at();m.lastError=late?'Timeout: no response within 10 s, retried 3 times':'UNKNOWN_CODE: a code in this message is not in the HIS code table';});
      if(['handover','handoverPublish','handoverPublishBatch'].includes(action)&&a.role==='doctor')clearCarts(n,actor=>actor===actorId,'handover');
      if(action==='logout')clearCarts(n,actor=>actor===actorId,'logout');
      if(action==='clockAdvance'){const now=TZ.millis(n.demoClock);clearCarts(n,(actor,pid)=>{const m=n.drafts[actor+':'+pid+':cartMeta'];return !!m&&now-TZ.millis(m.at)>=CART_TTL;},'expired');}
      workflow.init(n,actors);n.master=schema.ensure(n.master);taxonomy.bindState(n);
      n.revision=state.revision+1;if(action!=='prefSave')n.audit.push({id:'A'+n.revision,action,actor:actorId,p:p||null,at:at(),...(payload.table?{table:String(payload.table),id:String(payload.id||(n.lastMaster&&n.lastMaster.id)||'')}:{})});
      // Transaction is committed to memory even if persistence fails, with an explicit warning.
      state=n;unsaved=true;
      try {if(n.scenario==='saveFailure')throw Error('Simulated save failure');if(!persistent)throw Error(problem||'Browser storage unavailable');const disk=storage.getItem(key);if(disk&&JSON.parse(disk).revision>n.revision-1)throw Error('Another tab has a newer version; keep your on-screen content and refresh');storage.setItem(key,JSON.stringify(n));unsaved=false;problem='';}
      catch(e){problem=e.message+'; changes are held locally for this session only and may be lost on refresh.';}
      return {saved:!unsaved,message:unsaved?problem:'Saved in this browser (simulated)'};
    }
    return {read:()=>clone(state),dispatch,status:()=>({persistent,unsaved,problem}),actors:clone(state.people)};
  }
  const api={createStore,seed,actors,flagTypes,dosingModes,timingGroups,timingLabel,unitsOfTime,eventTimings,priorities,methods,rateUnits,boundsUnits,intervalUnits,allergyValues,conditionValues,allergyStatuses};if(typeof module!=='undefined')module.exports=api;else root.ICUStore=api;
})(typeof window!=='undefined'?window:globalThis);
