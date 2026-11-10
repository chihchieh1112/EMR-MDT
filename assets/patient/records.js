/* Structured clinical-note writer with source-aware autofill. No clinical inference. */
(function (root) {
  'use strict';

  // 第四欄是「什麼時候寫」：三個分頁本來只有中英文名，看不出住院期間的先後順序。
  const types = [
    ['admission','Admission Note','Admission note','S07','At admission'],
    ['progress','Progress Note','Progress note','S08','Daily during stay'],
    ['discharge','Discharge Note','Discharge summary','S20','At discharge']
  ];
  // Progress Note 的類型（2026-10-25）：每日 SOAP 之外，轉入 ICU 寫轉入摘要、轉出 ICU 寫轉出摘要；三種都算當天的病程，用下拉選單切換，預設每日 SOAP。
  // 2026-10-31：處置紀錄從手術分頁搬來，是第 4 種類型，也算當天的病程；受邀他科醫師只能寫這一種。
  const PROGRESS_KINDS = [['soap','Daily SOAP'],['acceptance','Acceptance Note'],['transfer','Transfer Note'],['procedure','Procedure Note']];
  const kindOf = note => (note && note.progressKind) || 'soap';
  // 轉入／轉出摘要各七段：前五段相同，後兩段各自不同。[段落鍵, 標題, 角色]
  const SUMMARY_COMMON = [['admitReason','Reason for admission','write'],['courseSummary','Course of illness or treatment','write'],['keyFindings','Key exam findings','write'],
    ['invasiveRecords','Invasive procedure reports / operative records','check'],['currentTreatment','Current medications and other treatment','check']];
  const SUMMARY_SECTIONS = {
    acceptance: [...SUMMARY_COMMON, ['transferInReason','Reason for transfer in','write'], ['carePlan','Treatment plan','decide']],
    transfer: [...SUMMARY_COMMON, ['transferOutReason','Reason for transfer out','write'], ['precautions','Precautions','decide']]
  };
  // 身體診察分系統，對齊院方 02/BV-01「III. Khám bệnh — 2. Các cơ quan」的分段。
  const EXAM_SYSTEMS = [
    ['examCirculatory','Cardiovascular','Tuần hoàn'],
    ['examRespiratory','Respiratory','Hô hấp'],
    ['examDigestive','Gastrointestinal','Tiêu hoá'],
    ['examRenal','Renal · urinary · reproductive','Thận - Tiết niệu - Sinh dục'],
    ['examNeuro','Neurological','Thần kinh'],
    ['examMusculoskeletal','Muscles · bones · joints','Cơ - Xương - Khớp'],
    ['examOther','ENT & eyes · oral · nutrition · skin and other','Tai-Mũi-Họng, Răng-Hàm-Mặt, Mắt, Dinh dưỡng, Da liễu']
  ];
  // 身體診察數值（2026-10-27）：[段落鍵, 量測種類, 標籤, 單位, 必填, 最小, 最大]；對兒科病歷 TDL.0092–0097（必填）與 TDL.0089–0091（選填）。
  const MEASURE_FIELDS = [
    ['vsPulse','Heart rate','Pulse','/min',true,0,300],['vsTemperature','Temperature','Temperature','°C',true,25,45],
    ['vsSystolic','Systolic BP','SBP','mmHg',true,0,300],['vsDiastolic','Diastolic BP','DBP','mmHg',true,0,250],
    ['vsRespiration','Respiratory rate','Respiratory rate','/min',true,0,150],['vsWeight','Weight','Weight','kg',true,0.3,300],
    ['bodyHeight','Height','Height','cm',false,20,250],['bodyChest','Chest circumference','Chest circumference','cm',false,10,200],['bodyHead','Head circumference','Head circumference','cm',false,10,80]
  ];
  // 每一段的 HIS 來源說明（2026-10-24 起不在畫面上顯示，寫在 PRD S07／S08／S20 §5）。
  // 出生與成長史（2026-10-24）：兒科病歷 I-A-01-001-070～087 的段落鍵，全部選填。
  const BIRTH_KEYS = ['birthOrder','paraTerm','paraPreterm','paraAbortion','paraLiving','birthMethod','birthWeight','congenitalAnomaly','congenitalAnomalyDetail',
    'devMental','devMotor','devOtherIllness','feedingMethod','weaningMonth','childcareSetting','vaccines','vaccinesOther'];
  // 維護範本可用的代入項；來源全部是清單頁「新增病人」當次登錄的資料。
  const TEMPLATE_KEYS = [
    ['Name',      c => c.patient.name],
    ['MRN',    c => c.patient.identifier],
    ['Encounter no.', c => c.patient.visitNo],
    ['Ward',      c => c.patient.ward],
    ['Bed',      c => c.patient.bed],
    ['Gender',   c => root.ICUWorkflow.genderLabel(c.patient.gender)],
    ['Sex',      c => root.ICUWorkflow.genderLabel(c.patient.gender)],   // 舊範本的代入名，保留相容；清單只列 Gender
    ['Date of birth',  c => c.patient.birthDate],
    ['Age',      c => ageText(c.patient.birthDate, c.asOf)],
    ['Admission date',  c => c.patient.admitted],
    ['ICU admission time', c => c.patient.admittedAt && String(c.patient.admittedAt).replace('T',' ')],
    ['Length of stay',  c => stayDays(c.patient.admitted, c.asOf)],
    ['Admission diagnosis',  c => admissionDiagnosisText(c.patient)],
    ['Allergy',      c => c.patient.allergy],
    ['Doctor on duty',  c => c.patient.attending]
  ];
  const educationSets = [
    {id:'EDU-SET-MED-01',name:'Medications and warning signs',text:'Explained that discharge medications must be taken per the drug name, dose, and frequency on the official prescription; if discomfort, suspected allergy, or inability to take medications as planned occurs, seek help using the contact information provided by the hospital.'},
    {id:'EDU-SET-WOUND-01',name:'Wound and line / tube care',text:'Explained how to observe the wound or lines / tubes as instructed by the care team, keep them clean, and not remove them; contact the care team for redness, swelling, discharge, bleeding, or other abnormalities.'},
    {id:'EDU-SET-FOLLOW-01',name:'Follow-up visits and when to seek help',text:'Explained the follow-up date, department, and documents to bring; if symptoms worsen or warning signs listed by the hospital appear, return early or seek emergency help as instructed on the education sheet.'}
  ];
  const href = (route, changes) => '#'+new URLSearchParams({...route,...changes}).toString();
  const own = (value, key, fallback='') => Object.prototype.hasOwnProperty.call(value,key) ? value[key] : fallback;
  const when = at => String(at||'Time not provided').replace('T',' ');
  const dayOf = at => String(at||'').slice(0,10);

  function ageText(birthDate, asOf) {
    if(!/^\d{4}-\d\d-\d\d$/.test(String(birthDate||'')))return '';
    const born=new Date(birthDate+'T00:00:00'), now=new Date((dayOf(asOf)||birthDate)+'T00:00:00');
    if(Number.isNaN(now-born)||now<born)return '';
    let years=now.getFullYear()-born.getFullYear();
    const before=now.getMonth()<born.getMonth()||(now.getMonth()===born.getMonth()&&now.getDate()<born.getDate());
    if(before)years-=1;
    if(years>=1)return years+' y';
    const months=Math.max(0,(now.getFullYear()-born.getFullYear())*12+now.getMonth()-born.getMonth()-(now.getDate()<born.getDate()?1:0));
    return months>=1?months+' months':Math.round((now-born)/86400000)+' days';
  }
  function stayDays(admitted, asOf) {
    if(!/^\d{4}-\d\d-\d\d$/.test(String(admitted||''))||!dayOf(asOf))return '';
    const diff=Math.floor((new Date(dayOf(asOf)+'T00:00:00')-new Date(admitted+'T00:00:00'))/86400000);
    return diff>=0?String(diff+1):'';
  }
  function admissionDiagnosisText(patient) {
    const list=(patient.conditions||[]).map(x=>x.code).filter(Boolean);
    if(list.length)return list.map(c=>c.code+' '+(c.zh||c.name)).join('; ');
    if(patient.icd)return patient.icd.code+' '+(patient.icd.english||patient.icd.name||'');
    return patient.problem||'';
  }

  function latestVitals(state, patientId) {
    const wanted=['Heart rate','Blood pressure','Temperature','Respiratory rate','SpO₂'];
    return wanted.map(kind=>{
      const item=state.observations.filter(x=>x.p===patientId&&!x.voided&&x.kind===kind).sort((a,b)=>root.ICUClinical.millis(b.at)-root.ICUClinical.millis(a.at))[0];
      if(!item)return null;
      const value=kind==='Blood pressure'?(item.components||[]).map(x=>x.value??'Missing').join('/'):(item.value??'Missing');
      return {id:item.id,text:`${kind} ${value} ${item.unit||''} (${when(item.at)})`,source:item.source||'observation'};
    }).filter(Boolean);
  }

  function reportName(report) {
    return report.catalog?.zh||report.catalog?.name||report.kind||report.id;
  }

  // 報告的數值一項一段（每段各自翻譯）；檢查是文字報告，取前 120 字。畫面與帶入都不寫報告編號。
  const reportValues = report => (report.components||[]).map(c=>`${c.name||c.id} ${c.value??'Missing'} ${c.unit||''}${c.interpretation?' ['+c.interpretation+']':''}`.trim());
  const reportTime = report => report.status==='pending'?'Pending result':when(report.at);
  function reportLine(report) {
    const values=reportValues(report).join(', ');
    const text=report.examType&&report.text?' | '+String(report.text).slice(0,120):'';
    return `${reportName(report)} | ${reportTime(report)}${values?' | '+values:''}${text}`;
  }
  function reportItem(report) {
    const name=reportName(report), time=reportTime(report), values=reportValues(report), text=report.examType&&report.text?String(report.text).slice(0,120):'';
    return {id:report.id,name,metas:[[time],...(values.length?[values]:[]),...(text?[[text]]:[])],
      parts:[{t:[name,time]},...(values.length?[{t:values,j:', '}]:[]),...(text?[{t:[text]}]:[])]};
  }

  function orderExecutionSummary(state, patientId, actors, label) {
    const executions=state.executions.filter(x=>x.p===patientId);
    return state.orders.filter(o=>o.p===patientId&&executions.some(e=>e.order===o.id)).map(order=>{
      const done=executions.filter(e=>e.order===order.id).map(e=>`${when(e.at)} ${actors[e.actor]?.name||'Performer not provided by source'} ${label(e.status)} ${e.actual||''} ${e.route||''}`.trim()).join('; ');
      return `${order.catalog?.zh||order.name} | ${order.dose} / ${order.route} / ${order.frequency} | ${done}`;
    });
  }

  // 已執行次數（2026-10-24）：從開立累計到病歷時間。已給、暫停、未給分開數，暫停與未給逐筆附時間與原因——醫師要看得到之前發生過什麼。
  // 檢驗檢查看報告回來了沒；連續輸注看護理的速率紀錄，不算次數。回傳的每一段都是可翻譯的英文句。
  const shortWhen = at => String(at||'').slice(5,16).replace('T',' ');
  function executionParts(state, order, category, asOf) {
    const C=root.ICUClinical, cut=C.millis(asOf), upTo=at=>!!at&&C.millis(at)<=cut, byTime=(a,b)=>C.millis(a.at)-C.millis(b.at);
    if(order.dosing?.mode==='infusion'){
      const checks=(state.infusionChecks||[]).filter(x=>x.order===order.id&&upTo(x.at)).sort(byTime);
      if(!checks.length)return ['No infusion record yet'];
      const last=checks.at(-1), rate=`${last.rate} ${last.unit}`, ordered=String(order.dosing.rate||'').replace(/\s+/g,'');
      const differs=!!ordered&&ordered!==rate.replace(/\s+/g,'');
      return [`Infusion records ${checks.length}, latest ${shortWhen(last.at)} rate ${rate}`+(differs&&last.reason?` (${last.reason})`:'')];
    }
    if(['lab','imaging'].includes(category)){
      const linked=(state.reports||[]).filter(r=>r.order===order.id&&r.status!=='entered-in-error');
      const reported=linked.filter(r=>r.status!=='pending'&&upTo(r.at)).length, pending=linked.length-reported, parts=[];
      if(reported)parts.push(reported===1?'Reported 1 time':`Reported ${reported} times`);
      if(pending)parts.push(`Pending reports: ${pending}`);
      return parts.length?parts:['Not yet reported'];
    }
    const med=order.kind==='medication', list=(state.executions||[]).filter(e=>e.order===order.id&&upTo(e.at)).sort(byTime);
    const done=list.filter(e=>e.status==='done').length, held=list.filter(e=>e.status==='held'), skipped=list.filter(e=>e.status==='notDone');
    const events=xs=>xs.map(e=>shortWhen(e.at)+(e.reason?' '+e.reason:'')).join('; '), parts=[];
    if(done)parts.push(med?(done===1?'Given 1 time':`Given ${done} times`):(done===1?'Done 1 time':`Done ${done} times`));
    if(held.length)parts.push(held.length===1?`Held 1 time (${events(held)})`:`Held ${held.length} times (${events(held)})`);
    if(skipped.length)parts.push(med?(skipped.length===1?`Not given 1 time (${events(skipped)})`:`Not given ${skipped.length} times (${events(skipped)})`)
      :(skipped.length===1?`Not done 1 time (${events(skipped)})`:`Not done ${skipped.length} times (${events(skipped)})`));
    return parts.length?parts:[med?'No dose given yet':'Not yet done'];
  }

  // 病程當日的醫囑：當天新開的、當天停用的一定列出，加上當天仍在作用中的。
  // 範圍以「病歷紀錄時間」那一天為準，不是今天——補寫昨天的病程要看到的是昨天的醫囑。
  // 醫囑要寫成「開了什麼」而不是一串編號：品項名一行，劑量／途徑／頻率一行。
  // 藥品一定帶頻率——PRN 與連續輸注光看「頻率」欄看不出條件，所以把適應條件、間隔、上限、速率一併攤開。
  function orderMeta(order) {
    const parts = [order.dose, order.route, order.frequency].map(x => String(x||'').trim()).filter(Boolean);
    const d = order.dosing || {};
    if (d.mode === 'prn') {
      const prn = [d.indication && 'Indication: '+d.indication, d.minInterval && 'Min. interval '+d.minInterval,
        d.maxPerDay && '24 h max '+d.maxPerDay+' '+(d.maxUnit||'time')].filter(Boolean);
      if (prn.length) parts.push(prn.join(' · '));
    }
    if (d.mode === 'infusion') {
      const inf = [d.rate && 'Rate '+d.rate, d.concentration && 'Concentration '+d.concentration].filter(Boolean);
      if (inf.length) parts.push(inf.join(' · '));
    }
    return parts.join(' / ');
  }

  // 引用區的醫囑一列（2026-10-24）：照醫囑頁醫師看到的樣子——品名、劑量／途徑／頻率，再加開立時間與已執行次數；不寫來源說明與編號。
  // 檢驗醫囑只寫品名，重複開立的才帶頻率。當天停用的另標，帶入時附停用原因。
  const repeating = freq => !!freq && !/once|single|stat|immediately/i.test(freq);
  function ordersOfDay(state, patientId, day, asOf) {
    const taxonomy=root.ICUOrderTaxonomy;
    const start=day+'T00:00', end=day+'T23:59';
    return state.orders.filter(o=>o.p===patientId&&o.local!=='cancelled').map(order=>{
      const opened=dayOf(order.orderedAt||order.start)===day;
      const stoppedAt=order.stop?.at||(order.clinical==='stopped'||order.clinical==='cancelled'?order.end:null);
      const stopped=dayOf(stoppedAt)===day;
      const running=order.clinical==='active'&&String(order.start||'')<=end&&(!order.end||String(order.end)>=start);
      if(!opened&&!stopped&&!running)return null;
      const category=taxonomy?taxonomy.categoryOfOrder(order):'other';
      const name=order.catalog?.zh||order.name||order.id;
      const meta=['lab','imaging'].includes(category)?(repeating(order.frequency)?order.frequency:''):orderMeta(order);
      const ordered=order.orderedAt?`Ordered at ${when(order.orderedAt).slice(0,16)}`:'Order time not provided';
      const done=executionParts(state,order,category,asOf||end);
      const reason=stopped?order.stop?.reason||'':'';
      const stopText=stopped?(reason?`Stopped today (reason: ${reason})`:'Stopped today'):'';
      return {id:order.id,name,category,running,mark:stopped?'Stopped today':'',
        metas:[...(meta?[[meta]]:[]),[ordered,...done],...(reason?[[`Reason for stopping: ${reason}`]]:[])],
        parts:[{t:[name,meta].filter(Boolean)},{t:[ordered]},{t:done,j:';'},...(stopText?[{t:[stopText]}]:[])]};
    }).filter(Boolean);
  }

  // 維護範本：把 {{代入項}} 換成這位病人的病人資料；查不到就明寫未提供，不留空白也不猜。
  function fillTemplate(ctx, raw) {
    const missing=[], used=[];
    const text=String(raw||'').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (all, name) => {
      const entry=TEMPLATE_KEYS.find(x=>x[0]===name);
      if(!entry){missing.push(name);return ' ('+name+': no such placeholder)';}
      const value=String(entry[1](ctx)??'').trim();
      if(!value){missing.push(name);return name+'Not provided';}
      used.push(name);return value;
    });
    return {text,missing:[...new Set(missing)],used:[...new Set(used)]};
  }

  function autoData(ctx) {
    const {state,patient,actors}=ctx;
    const timeline=(root.ICUPatientTimelineData?.[patient.id]||[]), encounterHistory=timeline.filter(x=>['Outpatient','Emergency'].includes(x[1]));
    const vitals=latestVitals(state,patient.id), reports=state.reports.filter(x=>x.p===patient.id&&x.status!=='entered-in-error').slice().sort((a,b)=>root.ICUClinical.millis(b.at)-root.ICUClinical.millis(a.at));
    const surgeryList=(state.surgeries||[]).filter(x=>x.p===patient.id&&!x.voided&&!state.surgeries.some(y=>y.replaces===x.id));const surgery=surgeryList.at(-1)||null, executedOrders=orderExecutionSummary(state,patient.id,actors,ctx.label);
    const staged=(stage)=>(state.diagnoses||[]).filter(x=>x.p===patient.id&&x.stage===stage&&x.active).sort((a,b)=>(a.rank==='primary'?-1:1)-(b.rank==='primary'?-1:1));const stageText=stage=>staged(stage).map(x=>x.diagnosis.code+' '+(x.diagnosis.english||x.diagnosis.zh||x.diagnosis.name)).join('; ');const diagnoses=staged('admission').length?staged('admission'):state.goals.filter(x=>x.p===patient.id&&x.diagnosis).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    const admissionDiagnosis=diagnoses[0]?.diagnosis ? `${diagnoses[0].diagnosis.code} ${diagnoses[0].diagnosis.english||diagnoses[0].diagnosis.zh||diagnoses[0].diagnosis.name}` : admissionDiagnosisText(patient);
    const dayOrders=ordersOfDay(state,patient.id,dayOf(ctx.asOf)||patient.admitted||'',ctx.asOf);
    const latestSigned=pred=>state.notes.filter(x=>x.p===patient.id&&!x.voided&&x.status==='signed'&&pred(x)&&!state.notes.some(y=>y.replaces===x.id)).sort((a,b)=>root.ICUClinical.millis(b.clinicalAt||b.at)-root.ICUClinical.millis(a.clinicalAt||a.at))[0]||null;
    const latest=kind=>state.scenario==='missing'?null:root.ICUClinical.latestMeasure(state,patient.id,kind);
    const measures={...Object.fromEntries(MEASURE_FIELDS.map(([k,kind])=>[k,latest(kind)])),spo2:latest('SpO₂')};
    const priorAdmission=latestSigned(x=>x.noteType==='admission'), priorAcceptance=latestSigned(x=>x.noteType==='progress'&&kindOf(x)==='acceptance');
    // 轉入／轉出摘要（2026-10-25）：侵入性檢查與手術帶本次住院的手術紀錄與處置紀錄；現在使用藥物帶病歷時間仍在作用中的藥物與其它醫囑（檢驗檢查不算治療）。
    const procNotes=state.notes.filter(x=>x.p===patient.id&&x.noteType==='progress'&&kindOf(x)==='procedure'&&!x.voided&&!state.notes.some(y=>y.replaces===x.id)).map(x=>({data:x.sections||{}}));
    const optText=code=>root.ICUMasterSchema?root.ICUMasterSchema.clinicalOptionText(state,code,'en'):code;
    const procLine=x=>[x.data.procedureType==='PROC_OTHER'?x.data.procedureTypeOther:optText(x.data.procedureType),when(x.data.performedAt),
      x.data.course==='notSmooth'?'Course: not smooth':'Course: smooth',x.data.complication==='yes'?`Complications: ${x.data.complicationNote||'yes'}`:'Complications: none'].join(' | ');
    const invasive=[...surgeryList.map(x=>x.procedure+' | '+when(x.performedAt||x.start)+' | Post-op diagnosis: '+(x.postDiagnosis||'')),...procNotes.map(procLine)];
    const treating=dayOrders.filter(o=>o.running&&!o.mark&&!['lab','imaging'].includes(o.category));
    const summary={admitReason:'',courseSummary:'',keyFindings:'',
      invasiveRecords:invasive.length?invasive.join('\n'):'No surgery / procedure record entered yet for this admission; cannot be assumed no surgery.',
      currentTreatment:treating.length?treating.map(o=>o.parts[0].t.join(' ')).join('\n'):'No active medication or other orders at the record time',
      transferInReason:'',carePlan:'',transferOutReason:'',precautions:'',
      references:[...surgeryList.map(x=>x.id),...procNotes.map(x=>x.id),...treating.map(o=>o.id)]};
    // 第 1、2 段可從前一份文件帶入：轉入摘要帶已簽入院病歷的入院理由與病程經過；轉出摘要先找已簽轉入摘要，沒有才退回入院病歷。
    const fromAdmission=priorAdmission?{note:priorAdmission,label:'Insert from admission note',keys:{admitReason:'CC',courseSummary:'PI'}}:null;
    const summarySource={acceptance:fromAdmission,
      transfer:priorAcceptance?{note:priorAcceptance,label:'Insert from acceptance note',keys:{admitReason:'admitReason',courseSummary:'courseSummary'}}:fromAdmission};
    return {
      timeline,encounterHistory,vitals,reports,surgery,executedOrders,diagnoses,dayOrders,priorAdmission,summarySource,
      acceptance:summary,transfer:summary,
      encounterText:encounterHistory.length?encounterHistory.map(x=>`${x[0]} ${x[1]}: ${x[2]} (${x[3]})`).join('\n'):'',
      admission:{
        CC:encounterHistory.filter(x=>x[1]==='Emergency').at(-1)?.[2]||patient.problem||'',
        illnessDay:'',
        PI:'',PH:'',PHFamily:'',
        ...Object.fromEntries(MEASURE_FIELDS.map(([k])=>[k,measures[k]?String(measures[k].value):''])),
        vitalSummary:measures.spo2?`SpO₂ ${measures.spo2.value} % (${when(measures.spo2.at)})`:'',
        examGeneral:'',plannedTests:'',summary:'',initialAssessment:'',differential:'',prognosis:'',treatmentPlan:'',
        ...Object.fromEntries(BIRTH_KEYS.map(k=>[k,''])),
        references:[...encounterHistory.map(x=>x[3]),...Object.values(measures).filter(Boolean).map(x=>x.sourceId||x.id)]
      },
      progress:{
        S:'',O:vitals.map(x=>x.text).join('\n'),A:patient.problem||'',P:'',
        references:vitals.map(x=>x.id)
      },
      discharge:{
        admissionDate:patient.admitted||'',admissionDiagnosis,dischargeDate:patient.dischargedAt?.slice(0,10)||'',dischargeDiagnosis:stageText('discharge'),
        course:'',
        labsSummary:reports.length?reports.map(reportLine).join('\n'):'No lab / exam source yet for this admission; cannot be assumed not performed.',
        treatmentMethod:'',
        proceduresSummary:surgeryList.length?surgeryList.map(x=>x.procedure+' | '+String(x.performedAt||x.start||'').replace('T',' ')+' | Post-op diagnosis: '+(x.postDiagnosis||'')).join('\n'):'No surgery / procedure record entered yet for this admission; cannot be assumed no surgery.',
        ordersSummary:executedOrders.length?executedOrders.join('\n'):'No administration record of orders yet for this admission; placed orders cannot substitute for it.',
        dischargeCondition:'',followup:'',referral:'',adverseEvent:'',complication:'',pathology:'',
        dischargeReadiness:'',dischargeBarriers:'',dischargeFollowup:'',
        educationAudience:'Patient and primary caregiver',educationContent:'',educationTeachBack:'',
        references:[...reports.map(x=>x.id),...(surgeryList.length?surgeryList.map(x=>x.id):surgery?['DEMO-OR-A1']:[]),...state.executions.filter(x=>x.p===patient.id).map(x=>x.id)]
      }
    };
  }

  // --- 層級：每一段都標明「第幾步、填了沒」-------------------------------
  // 編輯區切成有編號的步驟。角色標籤只留「系統帶入 · 請核對」——那是要醫師動手核對的；醫師自己寫、自己判斷的段落不再標（2026-10-24）。
  const ROLES = {
    check: {label: 'System-filled · please review', hint: 'Filled from currently available sources; the doctor must still review each section'}
  };
  // 佔位字串（「尚待…」「來源未提供」）不算已填，否則每一段一開啟就都顯示完成。
  const PLACEHOLDER = /^(尚待|尚未|本次住院尚未|門\/?急診病歷來源未提供|生命徵象來源未提供|Not yet |No [^;.]* yet for this admission|No active medication or other orders at the record time|Outpatient[^;.]*not provided by source|Vital signs not provided by source)/;
  const filled = value => {
    const text = String(value ?? '').trim();
    return text.length > 0 && !PLACEHOLDER.test(text) && !/not provided by source/i.test(text);
  };
  const stepState = values => {
    const done = values.filter(filled).length;
    return {done, total: values.length, complete: done === values.length};
  };

  // 步驟標頭已經有名稱時，欄位就不再重複顯示一次標籤（仍保留 aria-label 給輔助科技）。
  const plainArea = (name, ariaLabel, value) => `<textarea name="${esc(name)}" aria-label="${esc(ariaLabel)}" required>${esc(value ?? '')}</textarea>`;
  // 選填欄位一律附「（選填）」，不要讓醫師以為每一格都得填才送得出去。
  const optArea = (name, title, value) => `<label>${esc(title)}<span class="field-optional">Optional</span><textarea name="${esc(name)}">${esc(value ?? '')}</textarea></label>`;
  const optField = (name, title, value) => `<label>${esc(title)}<span class="field-optional">Optional</span><input name="${esc(name)}" type="text" value="${esc(value ?? '')}"></label>`;
  // 有標題的必填欄位：同一段有兩格時（預後、治療方針）各自要有標題，不能只靠段落名稱。
  const reqArea = (name, title, value) => `<label>${esc(title)}<textarea name="${esc(name)}" required>${esc(value ?? '')}</textarea></label>`;

  function step(index, options) {
    const {title, role, hint, values = [], body} = options;
    const info = ROLES[role];
    const state = stepState(values);
    const mark = values.length
      ? `<span class="record-step-state ${state.complete ? 'is-done' : state.done ? 'is-part' : 'is-todo'}">${state.complete ? 'Filled' : state.done ? state.done + '/' + state.total + ' filled' : 'To fill'}</span>`
      : '';
    return `<section class="record-step tone-${role}" data-step-fields="${esc((options.fields || []).join(','))}" aria-labelledby="step-${index}-title">
      <header class="record-step-head"><span class="record-step-no" aria-hidden="true">${index}</span>
        <div class="record-step-title"><h3 id="step-${index}-title">${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ''}</div>
        ${info ? `<span class="record-step-role" title="${esc(info.hint)}">${esc(info.label)}</span>` : ''}${mark}</header>
      <div class="record-step-body">${body}</div></section>`;
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tr = s => root.ICUi18n && root.ICUi18n.t ? root.ICUi18n.t(s) : s;

  // 右側引用區：分成生命徵象、藥囑、檢驗檢查、其它醫囑四類，各自知道要引用到哪一欄。
  // 36/BV2 的右欄 Chỉ định（醫囑）對應的是 P，不是 O：量測進 O，開了什麼藥、什麼檢查、什麼處置進 P。
  const REF_TARGETS = {
    admission: {vitals:['vitalSummary','Vital signs field'], reports:['summary','Summary'], medication:null, other:null},
    progress:  {vitals:['O','O'], reports:['P','P'], medication:['P','P'], other:['P','P']},
    discharge: {vitals:['dischargeCondition','Condition at discharge'], reports:['labsSummary','Labs & exams summary'], medication:['treatmentMethod','Treatment method'], other:['treatmentMethod','Treatment method']},
    // 轉入／轉出摘要：量測與報告進「檢查重要發現」，藥物與其它醫囑進「現在使用藥物及其他治療」。
    acceptance: {vitals:['keyFindings','Key exam findings'], reports:['keyFindings','Key exam findings'], medication:['currentTreatment','Current medications and other treatment'], other:['currentTreatment','Current medications and other treatment']},
    transfer: {vitals:['keyFindings','Key exam findings'], reports:['keyFindings','Key exam findings'], medication:['currentTreatment','Current medications and other treatment'], other:['currentTreatment','Current medications and other treatment']}
  };

  // 右側引用區改成分頁籤（2026-10-24）：一類一頁、點一下就到，不必往下捲；游標進到哪一欄就切到能帶進那一欄的一類。
  // 逐筆勾選：勾了就只引用勾到的，一筆都沒勾就整頁引用。帶入時每一段各自翻譯，段與段之間用「｜」。
  const REF_TABS = [['vitals','Vital signs'],['medication','Medications'],['labs','Labs & exams'],['other','Care orders']];
  const refTabState = {};
  function refRow(item) {
    const metas=(item.metas||[]).map(m=>`<span class="ref-item-meta">${[].concat(m).map(x=>`<span>${esc(x)}</span>`).join(' · ')}</span>`).join('');
    return `<li class="ref-row"><label class="ref-pick-label"><input type="checkbox" class="ref-pick" data-id="${esc(item.id)}" data-parts="${esc(JSON.stringify(item.parts))}"><span class="ref-item"><b>${esc(item.name)}</b>${metas}</span></label>${item.mark?`<span class="pill warning">${esc(item.mark)}</span>`:''}</li>`;
  }

  function sourceAside(ctx, auto) {
    const {empty,route}=ctx, current=ctx.refKey||ctx.writerType;
    const targets=REF_TARGETS[current]||REF_TARGETS.progress, orders=auto.dayOrders;
    const groups={
      vitals:{target:targets.vitals,lists:[['',auto.vitals.map(x=>({id:x.id,name:x.text,parts:[{t:[x.text]}]}))]]},
      medication:{target:targets.medication,lists:[['',orders.filter(o=>o.category==='medication')]]},
      labs:{target:targets.reports,lists:[['Orders',orders.filter(o=>['lab','imaging'].includes(o.category))],['Reports',auto.reports.slice(0,8).map(reportItem)]]},
      other:{target:targets.other,lists:[['',orders.filter(o=>!['medication','lab','imaging'].includes(o.category))]]}
    };
    const tabs=REF_TABS.filter(([k])=>groups[k].target), count=k=>groups[k].lists.reduce((n,[,list])=>n+list.length,0);
    const total=tabs.reduce((n,[k])=>n+count(k),0);
    if(route.recRef==='0')return `<aside class="record-reference collapsed" aria-label="Reference data for writing (collapsed)"><a class="ref-expand" href="${esc(href(route,{recRef:'1',record:''}))}" title="Expand reference data" aria-expanded="false"><span aria-hidden="true">◂</span><span class="ref-expand-text">Reference data ${total}</span></a></aside>`;
    const active=tabs.some(([k])=>k===refTabState[current])?refTabState[current]:tabs[0][0];
    const bar=tabs.map(([k,label])=>`<button type="button" role="tab" class="ref-tab${k===active?' active':''}" id="reftab-${k}" aria-controls="refpanel-${k}" aria-selected="${k===active}" data-ref-tab="${k}" data-ref-field="${esc(groups[k].target[0])}" data-ref-type="${esc(current)}">${esc(label)}<span class="ref-count">${count(k)}</span></button>`).join('');
    const panels=tabs.map(([k])=>{const g=groups[k],[field,fieldLabel]=g.target;
      const body=count(k)
        ? g.lists.filter(([,list])=>list.length).map(([title,list])=>`${title?`<h3 class="ref-sub">${esc(title)}</h3>`:''}<ul class="source-list ref-picks">${list.map(refRow).join('')}</ul>`).join('')
          +`<button type="button" class="secondary" data-writer-insert="${esc(field)}" data-insert-scope="refpanel-${k}" data-insert-note="Inserted into ${esc(fieldLabel)}; if nothing is checked, the whole group is inserted.">Insert checked into ${esc(fieldLabel)}</button>`
        : empty('No records to cite.');
      return `<section class="ref-group" id="refpanel-${k}" role="tabpanel" aria-labelledby="reftab-${k}"${k===active?'':' hidden'}>${body}</section>`;}).join('');
    return `<aside class="record-reference" aria-label="Reference data for writing">
      <div class="record-reference-head"><div class="row between"><h2>Citable data</h2><a class="ref-collapse" href="${esc(href(route,{recRef:'0',record:''}))}" title="Collapse reference data to widen the writing area" aria-label="Collapse reference data"><span aria-hidden="true">▸</span></a></div>
      <div class="ref-tabs" role="tablist" aria-label="Citable data">${bar}</div></div>
      ${panels}
    </aside>`;
  }

  // 分頁籤只在瀏覽器裡切換顯示，不重畫頁面（正在寫的內容不受影響），並記住每種病歷最後看的那一頁。
  function showRefTab(aside, key) {
    if(!aside)return;
    aside.querySelectorAll('[data-ref-tab]').forEach(b=>{const on=b.dataset.refTab===key;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));if(on)refTabState[b.dataset.refType]=key;});
    aside.querySelectorAll('[role="tabpanel"]').forEach(p=>{p.hidden=p.id!=='refpanel-'+key;});
  }
  // PARA 碼跟著四格即時更新：足月-早產-流產-存活，沒填的寫「–」。
  const paraCode = values => values.some(x=>String(x??'').trim()!=='') ? 'PARA '+values.map(x=>String(x??'').trim()||'–').join('-') : '';
  if(root.document&&root.document.addEventListener){
    const doc=root.document;
    doc.addEventListener('click',e=>{
      const tab=e.target.closest&&e.target.closest('[data-ref-tab]');
      if(tab){showRefTab(tab.closest('.record-reference'),tab.dataset.refTab);return;}
      // 沿用前次入院病歷的出生與成長史：直接填回各格（覆蓋），來源編號記進引用。
      const fill=e.target.closest&&e.target.closest('[data-writer-fill]');
      if(!fill)return;
      const form=doc.querySelector('[data-form="recordNote"]');if(!form)return;
      const data=JSON.parse(fill.dataset.writerFill||'{}');
      Object.entries(data).forEach(([name,value])=>{
        if(name==='vaccines'){const list=String(value||'').split(',');form.querySelectorAll('input[type="checkbox"][name="vaccines"]').forEach(box=>{box.checked=list.includes(box.value);});return;}
        const el=form.elements.namedItem(name);if(el&&!el.length)el.value=value;
      });
      form.querySelectorAll('[data-para-code]').forEach(out=>{out.textContent=paraCode(['paraTerm','paraPreterm','paraAbortion','paraLiving'].map(n=>form.elements.namedItem(n)?.value));});
      form.dispatchEvent(new Event('input',{bubbles:true}));
    });
    // 游標進到某一欄，就切到能帶進這一欄的那一類；目前那一頁本來就帶進這一欄時不動（例如停在 P 欄的檢驗檢查）。
    doc.addEventListener('focusin',e=>{
      const el=e.target;if(!el||!el.name||!el.closest||!el.closest('[data-form="recordNote"]'))return;
      const aside=doc.querySelector('.record-reference:not(.collapsed)');if(!aside)return;
      const current=aside.querySelector('.ref-tab.active');if(current&&current.dataset.refField===el.name)return;
      const hit=[...aside.querySelectorAll('.ref-tab')].find(b=>b.dataset.refField===el.name);
      if(hit)showRefTab(aside,hit.dataset.refTab);
    });
    doc.addEventListener('input',e=>{
      const group=e.target.closest&&e.target.closest('.para-group');if(!group)return;
      const out=group.querySelector('[data-para-code]');if(out)out.textContent=paraCode([...group.querySelectorAll('input')].map(x=>x.value));
    });
    // 病程類型下拉選單：換類型就換一張表單，各類型的暫存分開放，不互相覆蓋。
    doc.addEventListener('change',e=>{
      const pick=e.target.closest&&e.target.closest('select[data-progress-kind]');if(!pick)return;
      const opt=pick.selectedOptions&&pick.selectedOptions[0];if(opt&&opt.dataset.href)root.location.hash=opt.dataset.href;
    });
  }

  // 出生與成長史（2026-10-24）：兒科病歷 I-A-01-001-070～087，放在過去病史裡、接在家族史後面；整塊選填，不算進這一段的完成狀態。
  // 身體診察數值格：帶入最近一筆量測，醫師核對後可改；BMI 由體重與身高即時算，不存。
  function measureGrid(v) {
    const C=root.ICUClinical, bmi=C.bmi(v('vsWeight'),v('bodyHeight'));
    const cell=([k,,label,unit,required,min,max])=>`<label>${esc(label)}${required?'':'<span class="field-optional">Optional</span>'}<span class="record-measure-input"><input name="${k}" type="number" inputmode="decimal" min="${min}" max="${max}" step="0.1" value="${esc(v(k))}"${required?' required':''}><small>${esc(unit)}</small></span></label>`;
    return `<div class="record-measure-grid" data-bmi-scope>${MEASURE_FIELDS.map(cell).join('')}<div class="record-bmi"><span>BMI</span><b data-bmi-output data-no-i18n>${bmi===null?'—':esc(bmi)}</b><small>kg/m²</small></div></div>`;
  }

  // BMI 隨體重或身高輸入即時更新（只顯示，不存）。
  if (root.document && root.document.addEventListener) root.document.addEventListener('input', e => {
    const scope = e.target.closest && e.target.closest('[data-bmi-scope]');
    if (!scope || !['vsWeight', 'bodyHeight'].includes(e.target.name)) return;
    const value = name => (scope.querySelector(`[name="${name}"]`) || {}).value, bmi = root.ICUClinical.bmi(value('vsWeight'), value('bodyHeight')), out = scope.querySelector('[data-bmi-output]');
    if (out) out.textContent = bmi === null ? '—' : String(bmi);
  });

  function birthHistoryBlock(ctx, v) {
    const S=root.ICUMasterSchema, state=ctx.state, lang=root.ICUi18n&&root.ICUi18n.lang?root.ICUi18n.lang():'en';
    const num=(name,title,min,max)=>`<label>${esc(title)}<input name="${name}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${esc(v(name))}"></label>`;
    const line=(name,title)=>`<label>${esc(title)}<input name="${name}" type="text" value="${esc(v(name))}"></label>`;
    const long=(name,title)=>`<label>${esc(title)}<textarea name="${name}">${esc(v(name))}</textarea></label>`;
    const options=(set,keep)=>S?S.clinicalOptions(state,set,keep):[];
    const label=o=>esc(S.clinicalOptionText(state,o.id,lang))+(o.active===false?' ('+esc(tr('Inactive'))+')':'');
    const choose=(name,title,set)=>{const cur=v(name);return `<label>${esc(title)}<select name="${name}"><option value="">—</option>${options(set,cur?[cur]:[]).map(o=>`<option value="${esc(o.id)}"${o.id===cur?' selected':''}>${label(o)}</option>`).join('')}</select></label>`;};
    const anomaly=v('congenitalAnomaly'), vaccines=String(v('vaccines')||'').split(',').filter(Boolean);
    const para=['paraTerm','paraPreterm','paraAbortion','paraLiving'];
    return `<section class="birth-history" aria-labelledby="birth-history-title"><h4 id="birth-history-title">Birth and growth history<span class="field-optional">Optional</span></h4>
      <div class="bh-group"><h5>Birth</h5><div class="bh-grid">
        ${num('birthOrder','Birth order (child no.)',1,20)}
        <fieldset class="para-group"><legend>Para (mother's obstetric history)</legend><div class="para-inputs">${num('paraTerm','Term',0,30)}${num('paraPreterm','Preterm',0,30)}${num('paraAbortion','Abortion / miscarriage',0,30)}${num('paraLiving','Living',0,30)}</div><output class="para-code" data-para-code>${esc(paraCode(para.map(v)))}</output></fieldset>
        ${choose('birthMethod','Birth method','birth_method')}
        ${num('birthWeight','Birth weight (g)',300,7000)}
        <label>Congenital anomaly<select name="congenitalAnomaly"><option value="">—</option><option value="no"${anomaly==='no'?' selected':''}>No</option><option value="yes"${anomaly==='yes'?' selected':''}>Yes</option></select></label>
        ${line('congenitalAnomalyDetail','Anomaly details')}
      </div></div>
      <div class="bh-group"><h5>Development</h5><div class="bh-grid">${long('devMental','Mental development')}${long('devMotor','Motor development')}${line('devOtherIllness','Other illnesses during growth')}</div></div>
      <div class="bh-group"><h5>Feeding and care</h5><div class="bh-grid">${choose('feedingMethod','Feeding','feeding_method')}${num('weaningMonth','Weaned at month',0,60)}${choose('childcareSetting','Childcare','childcare_setting')}</div></div>
      <div class="bh-group"><h5>Immunization</h5><fieldset class="vaccine-group"><legend>Vaccines received</legend><input type="hidden" name="vaccines" value=""><div class="vaccine-list">${options('vaccine',vaccines).map(o=>`<label class="check"><input type="checkbox" name="vaccines" value="${esc(o.id)}"${vaccines.includes(o.id)?' checked':''}>${label(o)}</label>`).join('')}</div></fieldset>${line('vaccinesOther','Other vaccines')}</div>
    </section>`;
  }

  // 沿用前次入院病歷的出生與成長史：只帶前次有填的欄位，前次空白的不清掉醫師這次已填的內容。
  const priorBirth = note => Object.fromEntries(BIRTH_KEYS.map(k=>[k,String(note.sections?.[k]??'')]).filter(([,v])=>v));

  function admissionEditor(ctx,auto,draft) {
    const {route,field,area,source,table,empty,act}=ctx;
    // 多選 ICD：route.writerIcds 是這次操作中的勾選（'-' 代表清空）；沒有操作時依草稿或系統帶入。
    const fallback=String(own(draft,'diagnosisKeys',own(draft,'diagnosisKey',auto.diagnoses.map(x=>x.diagnosis?.key).filter(Boolean).join(','))))||'';
    const selectedKeys=[...new Set((route.writerIcds==='-'?'':(route.writerIcds||fallback)).split(',').map(x=>x.trim()).filter(Boolean))];
    const selected=selectedKeys.map(key=>root.ICUClinical.snapshot(key)).filter(Boolean);
    const search=root.ICUClinical.search('icd',route.writerIcdQuery||'',0), rows=search.rows.slice(0,10);
    const v = key => own(draft,key,auto.admission[key]);
    const chips=selected.length?`<ul class="icd-chips">${selected.map((d,i)=>`<li class="icd-chip${i===0?' primary':''}"><b>${esc(d.code)}</b><span>${esc(d.english||d.zh||d.name)}</span><em>${i===0?'Principal diagnosis':'Secondary diagnosis'}</em><button type="button" class="icd-remove" data-writer-icd-remove="${esc(d.key)}" aria-label="Remove ${esc(d.code)}">✕</button></li>`).join('')}</ul>`:'';
    const examRows=EXAM_SYSTEMS.map(([key,zh])=>optArea(key,zh,v(key))).join('');
    return `<input type="hidden" name="diagnosisKeys" value="${esc(selectedKeys.join(','))}">
      ${step(1,{title:'Reason for admission',role:'write',values:[v('CC')],fields:['CC'],
        body:`<div class="record-form-grid">${plainArea('CC','Reason for admission',v('CC'))}${optField('illnessDay','Day of illness at admission',v('illnessDay'))}</div>
        ${auto.admission.CC?`<button type="button" class="secondary" data-writer-insert="CC" data-source-ids="${esc(ctx.patient.id)}" data-insert-text="${esc(admissionDiagnosisText(ctx.patient))}">Insert admission diagnosis</button>`:''}`})}
      ${step(2,{title:'Course of illness',role:'write',values:[v('PI')],fields:['PI'],
        body:`<div class="record-form-grid">${plainArea('PI','Course of illness',v('PI'))}</div>
        ${auto.encounterText?`<button type="button" class="secondary" data-writer-insert="PI" data-source-ids="${esc(auto.encounterHistory.map(x=>x[3]).join(','))}" data-insert-text="${esc(auto.encounterText)}">Insert outpatient / ED visit records</button>`:''}`})}
      ${step(3,{title:'Past history',role:'write',values:[v('PH')],fields:['PH'],
        body:`<div class="record-form-grid">${plainArea('PH','Past history · personal',v('PH'))}${optArea('PHFamily','Past history · family',v('PHFamily'))}</div>
        ${birthHistoryBlock(ctx,v)}
        ${auto.priorAdmission?`<button type="button" class="secondary" data-writer-insert="PH" data-source-ids="${esc(auto.priorAdmission.id)}" data-insert-text="${esc(auto.priorAdmission.sections?.PH||'')}" data-writer-fill="${esc(JSON.stringify(priorBirth(auto.priorAdmission)))}">Reuse ${esc(auto.priorAdmission.id)} past history</button>`:''}`})}
      ${step(4,{title:'Physical examination',role:'check',values:[...MEASURE_FIELDS.filter(x=>x[4]).map(([k])=>v(k)),v('examGeneral')],fields:[...MEASURE_FIELDS.filter(x=>x[4]).map(([k])=>k),'examGeneral'],
        body:`${measureGrid(v)}<div class="record-form-grid">${plainArea('examGeneral','General findings (consciousness, skin and mucosa, lymph nodes, thyroid)',v('examGeneral'))}${optArea('vitalSummary','Other vital signs (e.g. SpO₂, ventilation)',v('vitalSummary'))}</div>
        <details class="exam-systems"><summary>System findings (${EXAM_SYSTEMS.length} sections, all optional)</summary><div class="record-form-grid">${examRows}</div></details>`})}
      ${step(5,{title:'Pending labs & exams and summary',role:'write',values:[v('summary')],fields:['summary'],
        body:`<div class="record-form-grid">${optArea('plannedTests','Pending labs and exams',v('plannedTests'))}${plainArea('summary','Summary',v('summary'))}</div>`})}
      ${step(6,{title:'Initial assessment and diagnosis',role:'decide',values:[selected.length?'x':'',v('initialAssessment')],fields:['diagnosisKeys','initialAssessment'],
        body:`<section class="embedded-picker"><div class="row between"><div><h4>Admission diagnosis / ICD-10 (multi-select)</h4><p>At least one is required; the first is the principal diagnosis.</p></div><span class="pill">${selected.length} items</span></div>${chips}
        <div class="inline-search">${field('writerIcdQuery','Search ICD-10',route.writerIcdQuery||'')}<button type="button" class="secondary" data-writer-icd-search>Search</button></div>${rows.length?table(['ICD-10 candidates','Select'],rows.map(item=>[`<strong>${esc(item.code)}</strong><br>${esc(item.english||item.zh||item.name)}`,`<label class="check"><input type="checkbox" name="writer-icd-choice" value="${esc(item.key)}" ${selectedKeys.includes(item.key)?'checked':''} ${item.active?'':'disabled'}>Add diagnosis</label>`])):empty('No matching ICD-10 candidates; adjust the keywords.')}</section>
        <div class="record-form-grid">${plainArea('initialAssessment','Initial assessment narrative',v('initialAssessment'))}${optArea('differential','Differential diagnosis',v('differential'))}</div>`})}
      ${step(7,{title:'Prognosis and treatment direction',role:'decide',values:[v('prognosis'),v('treatmentPlan')],fields:['prognosis','treatmentPlan'],
        body:`<div class="record-form-grid">${reqArea('prognosis','Prognosis',v('prognosis'))}${reqArea('treatmentPlan','Treatment direction',v('treatmentPlan'))}</div>`})}`;
  }

  function progressEditor(ctx,auto,draft) {
    const v = key => own(draft,key,auto.progress[key]);
    const copiedSections=Array.isArray(draft.copiedSections)&&draft.copiedSections.length?draft.copiedSections:Object.keys(draft.copySnapshot||{S:1,O:1,A:1,P:1});
    const copied=draft.copiedFrom
      ? `<p class="notice">Copied ${esc(copiedSections.join(', '))} from ${esc(draft.copiedFrom)} (${draft.copySource==='admission'?'subjective history from the admission note':'earlier progress note'}); on save, the copy time and the sections changed afterwards are recorded.</p>`
      : '';
    const soap=[
      ['S','Subjective (S)','write',copied],
      ['O','Objective (O)','check',''],
      ['A','Assessment (A)','decide',''],
      ['P','Plan (P)','write','']
    ].map(([key,title,role,extra],index)=>step(index+1,{title,role,values:[v(key)],fields:[key],
      body:`${extra}<div class="record-form-grid">${plainArea(key,title,v(key))}</div>`})).join('');
    return `<div class="record-steps">${soap}</div>`;
  }

  // 轉入摘要／轉出摘要（2026-10-25）：七段都必填；第 1、2 段可從前一份文件帶入，第 4、5 段系統帶入請核對，其餘由右側引用或醫師自寫。
  function summaryEditor(ctx,auto,draft,kind) {
    const v = key => own(draft,key,auto[kind][key]), src=auto.summarySource[kind];
    const bring = key => {
      const from=src&&src.keys[key], value=from?String(src.note.sections?.[from]||'').trim():'';
      return value?`<button type="button" class="secondary" data-writer-insert="${esc(key)}" data-source-ids="${esc(src.note.id)}" data-insert-text="${esc(value)}">${esc(src.label)}</button>`:'';
    };
    const steps=SUMMARY_SECTIONS[kind].map(([key,title,role],index)=>step(index+1,{title,role,values:[v(key)],fields:[key],
      body:`<div class="record-form-grid">${plainArea(key,title,v(key))}</div>${bring(key)}`})).join('');
    return `<div class="record-steps">${steps}</div>`;
  }

  function dischargeEditor(ctx,auto,draft) {
    const {area,field}=ctx;
    const v = key => own(draft,key,auto.discharge[key]);
    const setCards=educationSets.map(item=>`<article class="education-set"><div><strong>${esc(item.name)}</strong></div><p>${esc(item.text)}</p><button type="button" class="secondary" data-writer-insert="educationContent" data-source-ids="${esc(item.id)}" data-insert-kind="template" data-insert-text="${esc(item.text)}">Insert this set</button></article>`).join('');
    const W=root.ICUWorkflow,yn=(name,title)=>`<label>${esc(title)}<select name="${name}" required>${[['','Select…'],['no','No'],['yes','Yes']].map(([k,t])=>`<option value="${k}"${v(name)===k?' selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
    const pathology=`<label>${esc('Biopsy pathology')}<span class="field-optional">Optional</span><select name="pathology">${[['','Not done'],...(W?W.PATHOLOGY:[])].map(([k,t])=>`<option value="${k}"${v('pathology')===k?' selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
    return `${step(1,{title:'Admission and discharge details',role:'write',values:[v('admissionDate'),v('dischargeDate'),v('admissionDiagnosis'),v('dischargeDiagnosis'),v('adverseEvent'),v('complication')],fields:['admissionDate','dischargeDate','admissionDiagnosis','dischargeDiagnosis','adverseEvent','complication'],
        body:`<div class="record-form-grid two-column">${field('admissionDate','Admission date',v('admissionDate'),'date','required')}${field('dischargeDate','Discharge date',v('dischargeDate'),'date','required')}${area('admissionDiagnosis','Admission diagnosis',v('admissionDiagnosis'))}${area('dischargeDiagnosis','Discharge diagnosis (principal and secondary)',v('dischargeDiagnosis'))}</div>
        <div class="record-form-grid three-column">${yn('adverseEvent','Medical incident during this stay')}${yn('complication','Complication during this stay')}${pathology}</div>`})}
      ${step(2,{title:'Pathological course and clinical evolution',role:'write',values:[v('course')],fields:['course'],
        body:`<div class="record-form-grid">${plainArea('course','Pathological course and clinical progression',v('course'))}</div>`})}
      ${step(3,{title:'Diagnostically relevant labs & exams summary',role:'check',values:[v('labsSummary')],fields:['labsSummary'],
        body:`<div class="record-form-grid">${plainArea('labsSummary','Labs & exams summary',v('labsSummary'))}</div>`})}
      ${step(4,{title:'Treatment method',role:'check',values:[v('treatmentMethod'),v('proceduresSummary'),v('ordersSummary')],fields:['treatmentMethod','proceduresSummary','ordersSummary'],
        body:`<div class="record-form-grid">${plainArea('treatmentMethod','Treatment method',v('treatmentMethod'))}${area('proceduresSummary','Major surgeries / procedures',v('proceduresSummary'))}${area('ordersSummary','Details of administered orders',v('ordersSummary'))}</div>`})}
      ${step(5,{title:'Condition at discharge',role:'decide',hint:'Actual condition at discharge, not the treatment goal.',values:[v('dischargeCondition')],fields:['dischargeCondition'],
        body:`<div class="record-form-grid">${plainArea('dischargeCondition','Condition at discharge',v('dischargeCondition'))}</div>`})}
      ${step(6,{title:'Follow-up treatment and referral',role:'write',values:[v('followup')],fields:['followup'],
        body:`<div class="record-form-grid">${plainArea('followup','Follow-up treatment and orders',v('followup'))}${optArea('referral','Referral recommendations',v('referral'))}</div>`})}
      ${step(7,{title:'Discharge preparation and patient education',role:'write',values:[v('dischargeReadiness'),v('educationAudience'),v('educationContent')],fields:['dischargeReadiness','educationAudience','educationContent'],
        body:`<div class="record-form-grid">${plainArea('dischargeReadiness','Discharge / transition readiness',v('dischargeReadiness'))}${optArea('dischargeBarriers','Current barriers and open items',v('dischargeBarriers'))}${optArea('dischargeFollowup','Follow-up and transition arrangements',v('dischargeFollowup'))}</div>
        <section class="education-sets"><div class="row between"><div><h4>Patient education sets</h4></div><span class="pill">${educationSets.length} sets</span></div><div class="education-set-grid">${setCards}</div></section>
        <div class="record-form-grid education-fields">${field('educationAudience','Education audience',v('educationAudience'),'text','required')}${plainArea('educationContent','Education content this time',v('educationContent'))}${optArea('educationTeachBack','Teach-back / items needing re-explanation',v('educationTeachBack'))}</div>`})}`;
  }


  // 複製來源選單（2026-10-18）：左列已簽病程（最近的預選），住院病歷排最後且只能帶 S；右邊勾要帶的段。
  // 這個 dialog 要放在 recordNote 表單之外，自己是一張表單，送 copyPreviousProgress。
  function copyNoteDialog(ctx,sources,admission,clinicalDate) {
    const {actors,esc}=ctx;
    const firstLine=t=>String(t||'').split('\n').map(x=>x.trim()).filter(Boolean)[0]||'';
    const who=x=>actors[x.author]?.name||'Author not provided by source';
    const rows=sources.map((x,i)=>{const sec=x.sections||x.soap||{};return `<label class="check copy-source"><input type="radio" name="sourceId" value="${esc(x.id)}" ${i===0?'checked':''} data-only-s="0"><span><b>${esc(when(x.clinicalAt||x.at))}</b> · ${esc(who(x))} · Progress note v${x.version||1}<small>${esc(firstLine(sec.S).slice(0,120)||'S not written')}</small></span></label>`;}).join('');
    const adm=admission?`<label class="check copy-source"><input type="radio" name="sourceId" value="${esc(admission.id)}" ${sources.length?'':'checked'} data-only-s="1"><span><b>${esc(when(admission.clinicalAt||admission.at))}</b> · ${esc(who(admission))} · Admission note<small>Subjective history only → S</small></span></label>`:'';
    const onlyS=!sources.length;
    const boxes=[['S','Subjective (S)'],['O','Objective (O)'],['A','Assessment (A)'],['P','Plan (P)']].map(([k,t])=>`<label class="check"><input type="checkbox" name="sections" value="${k}" checked ${onlyS&&k!=='S'?'disabled':''}>${t}</label>`).join('');
    return `<dialog id="copy-note-dialog" class="entry-dialog copy-note-dialog" aria-labelledby="copy-note-title"><div class="dialog-head"><div><h2 id="copy-note-title">Copy from an earlier note</h2><p>Pick one signed note, then choose the sections to copy; copied sections replace the text in those fields.</p></div><button type="button" class="secondary" data-dialog-close="copy-note-dialog">Cancel</button></div><div data-dialog-message></div><form data-form="copyPreviousProgress" data-extra='${esc(JSON.stringify({clinicalDate}))}'><input type="hidden" name="sections" value=""><fieldset class="copy-sources"><legend>Source (${sources.length+(admission?1:0)})</legend>${rows}${adm}</fieldset><fieldset class="copy-sections"><legend>Sections to copy</legend><div class="row">${boxes}</div></fieldset><div class="row between"><small>The admission note can only be copied into S.</small><button type="submit">Copy selected sections</button></div></form></dialog>`;
  }

  function history(ctx) {
    const {state,patient,actors,esc,badge,source,act,empty}=ctx;
    const records=state.notes.filter(x=>x.p===patient.id&&!x.voided&&(x.noteType||x.soap)).slice().sort((a,b)=>root.ICUClinical.millis(b.clinicalAt||b.at)-root.ICUClinical.millis(a.clinicalAt||a.at)).slice(0,10);
    if(!records.length)return empty('No medical record versions to display yet.');
    return records.map(item=>{const title=(item.noteType==='progress'&&kindOf(item)!=='soap'?item.kind:types.find(x=>x[0]===(item.noteType||'progress'))?.[2])||item.kind, trace=item.copyTrace, education=item.sections?.educationContent;
      return `<article class="history" id="record-${esc(item.id)}"><div class="row between"><strong>${esc(item.id+' · '+title+' v'+item.version)}</strong>${badge(root.ICUWorkflow.noteLabel(item))}</div>${source((actors[item.author]?.name||'Author not provided by source')+' · Record time '+when(item.clinicalAt||item.at))}<p class="record-excerpt">${esc(((kindOf(item)==='procedure'?item.sections?.indication:'')||item.sections?.A||item.sections?.CC||item.sections?.course||item.text||'').slice(0,180))}</p>${education?`<details class="education-history"><summary>Discharge planning and education</summary><p><strong>Audience: </strong>${esc(item.sections.educationAudience||'Not provided')}</p><p class="preserve-lines">${esc(education)}</p><p><strong>Teach-back: </strong>${esc(item.sections.educationTeachBack||'Not provided')}</p></details>`:''}${trace?`<p class="notice">Copied ${esc((trace.sections||[]).join(', ')||'S, O, A, P')} from ${esc(trace.from)} (${trace.source==='admission'?'admission note subjective history':'earlier progress note'}); sections changed afterwards: ${esc(trace.changedSections?.join(', ')||'Not yet modified')}.</p>`:''}<details><summary>Source citations (${(item.references||[]).length})</summary>${source((item.references||[]).join(', ')||'No cited sources recorded')}</details>${item.author===ctx.route.actor&&item.status==='draft'?act('signNote','Simulated sign '+item.id,{id:item.id}):''}</article>`;
    }).join('');
  }

  // 打字時就地更新「填了沒」：只換那一顆標籤，不重畫整頁。
  function refreshStep(section) {
    const chip = section.querySelector('.record-step-state');
    const names = String(section.dataset.stepFields || '').split(',').filter(Boolean);
    if (!chip || !names.length) return;
    const form = section.closest('form');
    if (!form) return;
    const values = names.map(name => {
      const el = form.elements.namedItem(name);
      return el && !el.length ? el.value : el && el.length ? el[0].value : '';
    });
    const state = stepState(values);
    chip.className = 'record-step-state ' + (state.complete ? 'is-done' : state.done ? 'is-part' : 'is-todo');
    chip.textContent = state.complete ? 'Filled' : state.done ? state.done + '/' + state.total + ' filled' : 'To fill';
  }
  root.ICURecordSteps = {refreshStep};

  // 處置紀錄撰寫（2026-10-31）：欄位與條件欄位照 periop-forms.js 的 procedureNote，和舊的手術分頁同一份畫法；新建時處置醫師預帶自己。
  function procedureEditor(ctx,editNote,stored) {
    const PFm=root.ICUPeriopForms,form=PFm.procedureNote;
    const base=editNote?{...PFm.toPayload('procedureNote',editNote.sections||{}),...(stored.editOf===editNote.id?stored:{})}:(stored.editOf||!Object.keys(stored).length?PFm.toPayload('procedureNote',form.prefill(ctx.patient,null,{name:ctx.actor.name})):stored);
    return `<div class="record-proc">${root.ICUWorkspace.periopSections(ctx.state,form,base)}</div>`;
  }

  root.ICUPatientViews.register('records', function (ctx0) {
    const {state,patient,actor,route,esc,badge,source,empty,field}=ctx0, editNote=ctx0.editNote||null;
    // 受邀他科醫師（2026-10-31）：只能寫處置紀錄，撰寫頁固定在 Progress Note 的處置紀錄。
    const procOnly=!ctx0.canWrite&&!!root.ICUWorkflow&&root.ICUWorkflow.canWriteProcedure(state,patient.id,route.actor)&&(!editNote||kindOf(editNote)==='procedure');
    const current=procOnly?'progress':editNote?(editNote.noteType||'progress'):(types.some(x=>x[0]===route.writerType)?route.writerType:'progress');
    // 病程類型：修改既有病歷時跟著原文件，新建時看下拉選單，預設每日 SOAP。轉入／轉出摘要與處置紀錄的暫存各自分開放。
    const kind=current!=='progress'?'':editNote?kindOf(editNote):procOnly?'procedure':(PROGRESS_KINDS.some(x=>x[0]===route.progressKind)?route.progressKind:'soap');
    const procKind=kind==='procedure', summaryKind=kind&&kind!=='soap'&&!procKind?kind:'', draftKind=kind&&kind!=='soap'?current+'.'+kind:current;
    const stored=state.drafts[route.actor+':'+patient.id+':recordWriter:'+draftKind]||{};
    // 修改既有病歷（2026-09-11 R6）：以該版本內容為底，只疊上屬於同一次修改的暫存；新建時忽略屬於修改流程的暫存。
    const draft=editNote?{...(editNote.sections||{}),clinicalAt:editNote.clinicalAt,diagnosisKeys:(editNote.diagnoses||[]).map(d=>d.key).join(','),referenceIds:(editNote.references||[]).join(','),...(stored.editOf===editNote.id?stored:{})}:(stored.editOf?{}:stored);
    // 「病歷紀錄時間」決定要看哪一天的醫囑與病人年齡／住院天數，所以先把它算出來再算自動帶入。
    const asOf=own(draft,'clinicalAt','2026-08-31T09:00');
    const ctx={...ctx0,asOf,writerType:current,refKey:summaryKind||current}, auto=autoData(ctx);
    const autoRefs=procKind?[]:auto[summaryKind||current].references||[], refs=procKind?'':own(draft,'referenceIds',autoRefs.join(','));
    const typeName=(kind&&kind!=='soap'?PROGRESS_KINDS.find(x=>x[0]===kind)[1]:types.find(x=>x[0]===current)?.[1]);
    const editBanner=editNote?`<div class="notice record-edit-banner"><div><b>Editing ${esc(editNote.id)} v${editNote.version}</b> (${esc(typeName||editNote.kind)} · ${esc(actor.name)}). Saving creates v${editNote.version+1}; the original version is kept for reference${editNote.status==='signed'?'; this version is signed, so a reason for amendment and re-signing are required':''}.</div><a class="button secondary" href="${esc(href(route,{noteId:editNote.id,edit:'',record:''}))}">Cancel editing</a></div>`:'';
    const tabs=types.map(([value,en,zh,screen,whenText],index)=>`<a href="${esc(href(route,{writerType:value,screen,progressKind:'',writerIcd:'',writerIcdQuery:'',record:''}))}" class="${current===value?'active':''}" ${current===value?'aria-current="page"':''}><span class="type-order" aria-hidden="true">${index+1}</span><strong>${esc(zh)}</strong><span class="type-when">${esc(whenText)}</span></a>`).join('');
    if(!ctx.canWrite&&!procOnly)return `<section class="card accent"><div class="row between"><div><h2>Medical record writing</h2><p>The doctor on duty and in-department care doctors can write admission notes, SOAP notes, and discharge summaries; other staff can view saved versions.</p></div>${badge('View-only access')}</div>${source('Signed in as: '+actor.name)}</section>`;
    const body=current==='admission'?admissionEditor(ctx,auto,draft):current==='progress'?(procKind?procedureEditor(ctx,editNote,stored):summaryKind?summaryEditor(ctx,auto,draft,summaryKind):progressEditor(ctx,auto,draft)):dischargeEditor(ctx,auto,draft);
    const refOpen=route.recRef!=='0';
    const tpl=fillTemplate(ctx,state.settings.templates[current]);
    const tplTarget=current==='progress'?'S':current==='admission'?'PI':'course';
    const tplLabel=current==='progress'?'Subjective':current==='admission'?'Course of illness':'Pathological course and clinical evolution';
    const tplNote=(tpl.missing.length?'Placeholders not found, filled as “Not provided”: '+tpl.missing.join(', ')+'.':'')
      +(tpl.used.length?'Patient data filled in: '+tpl.used.join(', ')+'.':'');
    const tplButton=`<button type="button" class="secondary" data-writer-insert="${tplTarget}" data-insert-text="${esc(tpl.text)}" data-source-ids="TEMPLATE-${current}-v${state.settings.version||1}" data-insert-kind="template" data-insert-note="${esc('Maintenance template inserted into '+tplLabel+'.'+tplNote)}" title="${esc(tpl.text)}">Insert maintenance template</button>`;
    // 病程的帶入鈕（2026-10-18）：開選單，從已簽、未被新版取代的病程挑一份、勾要帶的 S／O／A／P；住院病歷只能帶 S。沒有任何來源才退回維護範本。
    const live=x=>!x.voided&&!state.notes.some(y=>y.replaces===x.id),newest=(a,b)=>root.ICUClinical.millis(b.clinicalAt||b.at)-root.ICUClinical.millis(a.clinicalAt||a.at);
    // 只有每日 SOAP 能複製：轉入／轉出摘要不是 SOAP，不當來源，也不開複製選單與維護範本。
    const copySources=state.notes.filter(x=>x.p===patient.id&&x.status==='signed'&&(x.noteType==='progress'||x.soap)&&kindOf(x)==='soap'&&live(x)&&(!editNote||x.id!==editNote.id)).sort(newest);
    const admissionSource=state.notes.filter(x=>x.p===patient.id&&x.noteType==='admission'&&x.status==='signed'&&live(x)).sort(newest)[0]||null;
    const canCopy=current==='progress'&&!summaryKind&&!!(copySources.length||admissionSource);
    const bringIn=summaryKind||procKind?'':canCopy?`<button type="button" class="secondary" data-dialog-open="copy-note-dialog">Copy from earlier note…</button>`:tplButton;
    const copyDialog=canCopy?copyNoteDialog(ctx,copySources,admissionSource,dayOf(asOf)||'2026-08-31'):'';
    // 列印的是已存檔的版本：正在修改就印那一份，新建時印這個類型最近一份，都沒有就停用。
    const printable=editNote||state.notes.filter(x=>x.p===patient.id&&!x.voided&&(x.noteType||'progress')===current&&(current!=='progress'||kindOf(x)===kind)&&!state.notes.some(y=>y.replaces===x.id)).sort((a,b)=>root.ICUClinical.millis(b.clinicalAt||b.at)-root.ICUClinical.millis(a.clinicalAt||a.at))[0];
    const printButton=printable
      ? `<a class="button secondary" href="${esc(href(route,{view:'print',printType:'note',printId:printable.id,record:''}))}">Print record</a>`
      : `<button type="button" class="secondary" disabled title="No saved version of this type yet, nothing to print">Print record</button>`;
    const toolbar=`<div class="record-tools">${printButton}${bringIn}</div>`;
    const kindPicker=current==='progress'?`<label class="record-kind">Progress note type<select data-progress-kind${editNote?' disabled':''}>${PROGRESS_KINDS.filter(([k])=>!procOnly||k==='procedure').map(([k,t])=>`<option value="${k}" data-href="${esc(href(route,{progressKind:k,record:''}))}"${k===kind?' selected':''}>${esc(t)}</option>`).join('')}</select></label><input type="hidden" name="progressKind" value="${esc(kind)}">`:'';
    return `${editNote?editBanner:procOnly?'':`<nav class="record-type-tabs" aria-label="Record type">${tabs}</nav>`}
      <div class="record-writer-layout${procKind?' ref-none':refOpen?'':' ref-collapsed'}"><section class="card record-editor"><form data-form="recordNote" data-record-type="${esc(current)}" data-draft-kind="recordWriter:${esc(draftKind)}"><input type="hidden" name="noteType" value="${esc(current)}"><input type="hidden" name="referenceIds" value="${esc(refs)}"><input type="hidden" name="editOf" value="${esc(editNote?editNote.id:'')}"><div class="record-meta-bar">${kindPicker}${field('clinicalAt','Record time',asOf,'datetime-local','required')}<span class="record-meta-author">Author ${esc(actor.name)}</span>${editNote&&editNote.status==='signed'?field('reason','Reason for amendment',own(draft,'reason',''),'text','required'):''}${toolbar}</div>${body}<div class="record-savebar"><button type="button" class="secondary" data-ui="saveDraft" data-value="${esc(JSON.stringify({kind:'recordWriter:'+draftKind}))}">Save draft</button><button type="submit">${editNote?'Save as new version v'+(editNote.version+1):'Save record'}</button></div></form></section>${procKind?'':sourceAside(ctx,auto)}</div>${copyDialog}
      `;
  });
})(globalThis);
