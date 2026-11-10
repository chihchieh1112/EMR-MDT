/* ICU collaboration rules. Pure helpers; all mutations are committed by store.dispatch. */
(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const PF=typeof module!=='undefined'?require('./periop-forms.js'):root.ICUPeriopForms;
const TZ=typeof module!=='undefined'?require('./timezone.js'):root.ICUTimeZone;
const MS=()=>typeof module!=='undefined'?require('./master-schema.js'):root.ICUMasterSchema;
const labels={attending:'Doctor on duty',care:'In-department care',consult:'Interdepartmental consultation',nurse:'Nursing care',primaryNurse:'Primary nurse',surgeon:'Surgeon'};
// 離開 ICU（2026-10-27）：轉科送 3.5 TransferCreated；出院、自動出院、轉院、死亡送 3.6 DischargeCreated，代碼照 D7 §4.3 dischargeDisposition（FHIR discharge-disposition，2026-10-28）；轉科不是 leaveType，用 dept-transfer。
const LEAVE_TYPES=[['dept-transfer','Transfer to another department','3.5 TransferCreated'],['home','Discharged home','3.6 DischargeCreated'],['aadvice','Left against medical advice','3.6 DischargeCreated'],['absconded','Left without notice','3.6 DischargeCreated'],['other-hcf','Transferred to another hospital','3.6 DischargeCreated'],['exp','Died','3.6 DischargeCreated']];
// 性別照 D7 §4.1（FHIR administrative-gender）；畫面顯示標籤。
const GENDERS=[['male','Male'],['female','Female'],['other','Other'],['unknown','Unknown']]; const genderLabel=g=>{const x=GENDERS.find(r=>r[0]===g);return x?x[1]:g;};
const DISPOSITIONS=LEAVE_TYPES.map(([k,t])=>[k,t]);
// 治療結果：D7 §4.4 代碼，第二欄是 B 目錄 42 號 KetQuaDieuTri 的代碼（選單顯示 B 目錄名稱）。
const TREATMENT_RESULTS=[['CURED','Khoi','Cured'],['IMPROVED','Giam','Improved'],['UNCHANGED','KhongThayDoi','Unchanged'],['WORSE','NangHon','Worse'],['DEATH','TuVong','Death'],['UNDETERMINED','Khac','Undetermined'],['PROGNOSIS_SEVERE_HOME','HHXV','Severe prognosis, taken home by family']];
// 紙本 02/BV-01 封面第 17、26、25 項與 B 段「Hồ sơ, phim, ảnh」表。
const TRANSFER_LEVELS=[['HIGHER','Higher-level facility'],['LOWER','Lower-level facility'],['SPECIALIST','Specialist facility']];
const DEATH_CAUSES=[['DISEASE','Due to the disease'],['TREATMENT','Due to a treatment complication'],['OTHER','Other']];
const PATHOLOGY=[['BENIGN','Benign'],['SUSPICIOUS','Suspicious'],['MALIGNANT','Malignant']];
const FILM_KINDS=[['xray','X-ray'],['ct','CT scanner'],['ultrasound','Ultrasound'],['lab','Laboratory'],['other','Other'],['total','Whole record']];
// 全院（2026-10-31）：使用本系統的科別、是否已上線與對應的 HIS 科別；系統參數，由我方在各科上線時設定（2026-11-08 起沒有畫面）。
const defaults={graceHours:0,dosingWeightStaleDays:7,dosingWeightStaleDaysInfant:3,ioDayStart:'00:00',departments:(root.ICUDemoSeed&&root.ICUDemoSeed.settings&&copy(root.ICUDemoSeed.settings.departments))||[{name:'ICU',hisKey:'department:1',hisCode:'HSCC',hisName:'Khoa Điều trị tích cực Nội khoa',live:true},{name:'Cardiac surgery',hisKey:'department:2840',hisCode:'NTM',hisName:'Khoa Ngoại tim mạch [TT Tim mạch]',live:true}],categories:[['medication','Medication orders'],['lab','Lab tests'],['imaging','Exams'],['care','Care orders']],templates:{admission:'{{Name}} ({{Gender}} / {{Age}}), MRN {{MRN}}, {{Ward}} {{Bed}}.\nAdmitted {{Admission date}}; admission diagnosis: {{Admission diagnosis}}.\nAllergy: {{Allergy}}.\nReason for admission:\nClinical course:',progress:'{{Name}} ({{Ward}} {{Bed}}), hospital day {{Length of stay}}.\nS Subjective\nO Objective\nA Assessment\nP Plan',discharge:'{{Name}} ({{Gender}} / {{Age}}), MRN {{MRN}}.\nAdmitted {{Admission date}}; admission diagnosis: {{Admission diagnosis}}.\nPathological process and clinical course:\nTreatment:\nCondition at discharge:'}};
// 前一班交給本班、尚未被接收的交班：登入時由首頁「承接交班」視窗逐床確認。
// 只在全新示範狀態建立一次；接收與否由 receive 決定，未接收前病人仍算在交出者身上。
const INTAKE=[['A','Low BP overnight; vasopressor increased, stable by morning.','Post-op day 1 after aortic dissection repair; arterial line and central venous catheter in place.','Hemodynamically stable but needs close monitoring; focus on catheter care.','Continue monitoring BP and urine output; assess arterial line removal today.'],
 ['B','Ventilator settings unchanged overnight; SpO2 maintained.','Day 3 intubated for acute respiratory failure; in isolation.','Oxygenation improved; consider weaning support.','Ventilator weaning assessment scheduled today; maintain isolation precautions.'],
 ['D','No recurrence of chest pain overnight.','Day 4 after procedure for myocardial infarction; DNR signed.','Pain well controlled; family understands the decision not to resuscitate.','Continue monitoring cardiac rhythm; update family as needed.']];
// 護理交班同樣逐床交給指定護理師，接收後才算完成。
const INTAKE_N=[['A','Overnight repositioning and line care done; no pressure injuries.','Post-op day 1 after aortic dissection repair; arterial line and central venous catheter in place.','Lines well secured; continue monitoring peripheral circulation.','Continue repositioning every 2 h; document catheter site condition.'],
 ['C','One fever episode overnight treated with antipyretics; temperature stable by morning.','Hospital day 3 for pneumonia; high fall risk.','Temperature improved; still needs assistance with mobility.','Continue monitoring temperature; stay with patient whenever out of bed.']];
function seedIntakeHandovers(s){
 if(s.handovers.length)return;
 const push=(prefix,list,role,shift,author,receiver,format)=>list.forEach(([pid,S,B,A,R],i)=>{
  const patient=s.patients.find(x=>x.id===pid);if(!patient)return;
  const parts=format==='ISBAR'?{I:[patient.bed,patient.name,patient.identifier,patient.problem].filter(Boolean).join(' · '),S,B,A,R}:{S,B,A,R};
  const text=Object.entries(parts).map(([k,v])=>k+': '+v).join('\n');
  s.handovers.push({id:prefix+(i+1),p:pid,role,shift,author,receiver,version:1,replaces:null,reason:null,
   batch:prefix+'BATCH',format,attendingTransferred:false,text,summary:text,
   at:'2026-08-31T06:50',clinicalAt:'2026-08-31T07:00',scheduled:'07:00+1',
   tasks:[],orders:copy(s.orders.filter(o=>o.p===pid&&o.clinical==='active')),reports:copy(s.reports.filter(r=>r.p===pid&&r.status==='pending'))});});
 push('H-IN',INTAKE,'doctor','D2','doctorNext','doctor','ISBAR');
 push('H-NIN',INTAKE_N,'nurse','N2','nurseNext','nurse','SBAR');}
function init(s,actors){
 s.workflowVersion=2;
 s.people=s.people||copy(actors);for(const [k,a] of Object.entries(actors))if(!s.people[k])s.people[k]=copy(a);
 // 全院（2026-10-31）：示範帳號的科別照種子更新一次（ICU 主治改屬 ICU）。
 if(!s.hospitalWide){for(const [k,a] of Object.entries(actors))if(s.people[k]&&a.department)s.people[k].department=a.department;s.hospitalWide=true;}
 if(!s.relationships){s.relationships=[];for(const p of s.patients){const attending='doctor';s.relationships.push({p:p.id,actor:attending,role:'attending',active:true});for(const [k,a] of Object.entries(actors)){if(k!==attending&&a.patients.includes(p.id)&&!a.consultationOnly&&a.role!=='admin')s.relationships.push({p:p.id,actor:k,role:a.role==='nurse'?'nurse':k==='surgeon'?'surgeon':'care',active:true});}}
  seedIntakeHandovers(s);}
 // 主要護理師（2026-10-30）：舊資料的護理照護關係不分主次，每位病人把第一筆有效的護理關係轉成主要護理師，只做一次。
 if(!s.primaryNurseRole){for(const pt of s.patients){if(s.relationships.some(r=>r.p===pt.id&&r.role==='primaryNurse'&&r.active))continue;const r=s.relationships.find(r=>r.p===pt.id&&r.role==='nurse'&&r.active);if(r)r.role='primaryNurse';}s.primaryNurseRole=true;}
 // 醫囑簽署即生效（2026-10-30）：舊資料裡已簽署、還在等 HIS 的醫囑直接生效；處置、照護等非檢驗醫囑一期不送 HIS。只做一次。
 if(!s.ordersActiveOnSign){for(const o of s.orders||[]){if(o.local==='signed'&&o.clinical==='draft')o.clinical='active';if(o.local==='signed'&&o.kind!=='medication'&&!o.signatureExempt&&['notSent','sent','unknown'].includes(o.his))o.his='none';}s.ordersActiveOnSign=true;}
 // 醫囑不用簽（2026-11-01 院方定案）：舊資料還在草稿的醫囑直接生效，藥囑排進每日處方，其他一期不送 HIS。只做一次。
 if(!s.ordersNoSignature){for(const o of s.orders||[]){if(o.local==='draft'&&o.clinical==='draft'){o.local='signed';o.clinical='active';o.signedAt=o.signedAt||o.orderedAt||null;o.his=o.kind==='medication'?'notSent':'none';}}s.ordersNoSignature=true;}
 s.settings=s.settings||copy(defaults);s.settings.version=s.settings.version||1;s.settingsHistory=s.settingsHistory||[];s.settings.categories=(s.settings.categories&&s.settings.categories.length===defaults.categories.length&&s.settings.categories.every(c=>defaults.categories.some(x=>x[0]===c[0])))?s.settings.categories:copy(defaults.categories);s.settings.templates=s.settings.templates||copy(defaults.templates);if(s.settings.dosingWeightStaleDays===undefined)s.settings.dosingWeightStaleDays=defaults.dosingWeightStaleDays;if(s.settings.dosingWeightStaleDaysInfant===undefined)s.settings.dosingWeightStaleDaysInfant=defaults.dosingWeightStaleDaysInfant;if(!Array.isArray(s.settings.departments))s.settings.departments=copy(defaults.departments);if(!s.settings.ioDayStart)s.settings.ioDayStart=defaults.ioDayStart;if(!s.ioDayMidnight){if(s.settings.ioDayStart==='07:00')s.settings.ioDayStart=defaults.ioDayStart;s.ioDayMidnight=true;}
 // 一期拿掉（2026-10-28）：取整差異門檻、藥卡預設輸入方式、病歷保存年限；舊資料一併清掉。
 for(const k of ['doseRoundingWarnPct','perKgDefaultMode','retention'])delete s.settings[k];
 for(const k of ['surgeries','diagnoses','signatureRecords','periop','hisOutbox'])s[k]=s[k]||[];
 // 特殊註記（2026-10-31）：改成我方自己的資料，一筆一個註記、有開始與結束；舊資料病人身上的代碼搬成進行中的註記（來源記 HIS 帶入），過敏另有結構不搬。只做一次。
 if(!s.flagsAsRecords){s.patientFlags=s.patientFlags||[];for(const pt of s.patients)for(const code of (pt.flags||[]))if(code!=='ALG'&&!s.patientFlags.some(f=>f.p===pt.id&&f.code===code))s.patientFlags.push({id:'FLG-'+pt.id+'-'+code,p:pt.id,code,start:pt.icuEntryTime||(pt.admitted?pt.admitted+'T00:00':null),end:null,note:'',source:'H',recordedBy:null,recordedAt:null});s.flagsAsRecords=true;}
 // 處置紀錄搬進病程（2026-10-31）：手術分頁存的處置紀錄改成 Progress note 的處置紀錄類型；編號、版本、作者、修訂原因與作廢照留，原本存檔即生效所以視為已簽。只做一次。
 if(!s.procedureNotesInProgress){s.notes=s.notes||[];for(const x of s.periop.filter(x=>x.form==='procedureNote')){const d=copy(x.data||{});s.notes.push({id:x.id,p:x.p,kind:'Procedure note',noteType:'progress',progressKind:'procedure',text:Object.entries(d).map(([k,v])=>k+': '+v).join('\n\n'),soap:null,sections:d,diagnoses:[],clinicalAt:d.performedAt||x.at,author:x.author,version:x.version||1,replaces:x.replaces||undefined,reason:x.reason||undefined,status:'signed',signedAt:x.at,at:x.at,references:[],copyTrace:null,source:'Moved from the procedure note on the surgery page',...(x.voided?{voided:copy(x.voided)}:{})});}
  s.periop=s.periop.filter(x=>x.form!=='procedureNote');for(const k of Object.keys(s.drafts||{}))if(k.endsWith(':periop:procedureNote'))delete s.drafts[k];s.procedureNotesInProgress=true;}
 s.archives=s.archives||{};s.demoClock=TZ.zoned(s.demoClock||'2026-08-31T09:00:00');
 // 帳號與權限欄（2026-10-18）：舊資料補 username／status／deptAdmin／生效期；active 由 status 與生效期對示範時鐘推導，既有 active!==false 的檢查全部沿用。
 {const clockDate=String(s.demoClock).slice(0,10);for(const [k,who] of Object.entries(s.people)){const seed=actors[k]||{};if(!who.username)who.username=seed.username||k;if(!Array.isArray(who.licenses))who.licenses=copy(seed.licenses||[]);if(!who.status)who.status='active';if(typeof who.deptAdmin!=='boolean')who.deptAdmin=!!seed.deptAdmin;delete who.effectiveFrom;delete who.effectiveTo;delete who.start;delete who.end;who.active=who.status==='active';}}
 for(const p of s.patients){p.attending=s.people[attending(s,p.id)]?.name||'No doctor on duty assigned';}
 for(const coll of ['orders','notes'])for(const x of (s[coll]||[]))if(!x.stay){const pt=s.patients.find(q=>q.id===x.p);if(pt)x.stay=stayAt(pt,x.orderedAt||x.start||x.clinicalAt||x.at);}
 for(const [pid,archive] of Object.entries(s.archives)){if(archive.status==='grace'&&archiveState(s,pid)==='sealed'){archive.status='sealed';archive.sealedAt=now(s);archive.documents=latestNotes(s,pid).map(n=>({id:n.id,version:n.version}));}}
 return s;
}
const relations=(s,p,a)=>s.relationships.filter(r=>r.p===p&&r.actor===a&&r.active);
// 入科歸屬（2026-11-08）：醫囑與病歷記下開立或書寫時的那一段入科（G9 episode_id）。原型沒有入科主鍵，用第幾段（已結束的 stays 筆數＋1）、科別與 HIS archiveId 表示。
const currentStay=pt=>({seq:((pt&&pt.stays)||[]).length+1,department:(pt&&pt.department)||null,archiveId:(pt&&pt.archiveId)||null});
const stayAt=(pt,when)=>{const list=(pt&&pt.stays)||[],t=when?TZ.millis(when):NaN;for(let i=0;i<list.length;i++){if(Number.isFinite(t)&&list[i].to&&t<TZ.millis(list[i].to))return {seq:i+1,department:list[i].department||null,archiveId:list[i].archiveId||null};}return currentStay(pt);};
const attending=(s,p)=>s.relationships.find(r=>r.p===p&&r.role==='attending'&&r.active)?.actor;
// 開醫囑不限主治（2026-09-26）：看得到這位病人的醫師（主治、科內、手術醫師、受邀會診醫師）都能開、停、取消。
const canOrder=(s,p,a)=>s.people[a]?.role==='doctor'&&s.people[a].active!==false&&assigned(s,p,a);
const isAttending=(s,p,a)=>s.people[a]?.role==='doctor'&&attending(s,p)===a;
const canWrite=(s,p,a)=>s.people[a]?.role==='doctor'&&relations(s,p,a).some(r=>['attending','care'].includes(r.role));
// 處置紀錄（2026-10-31 起是病程的一種）：照護醫師之外，實際執行處置的受邀他科醫師（例如外科來放胸管）也能寫；護理師不行。
const canWriteProcedure=(s,p,a)=>canWrite(s,p,a)||(s.people[a]?.role==='doctor'&&s.people[a].active!==false&&(s.consultations||[]).some(c=>c.p===p&&c.assignee===a));
const canNurse=(s,p,a)=>s.people[a]?.role==='nurse'&&relations(s,p,a).some(r=>r.role==='nurse'||r.role==='primaryNurse');
// 主要護理師（2026-10-30）：每位病人同時只有一位；入科後由任一 ICU 護理師在病人頁指定，之後每次護理交班換成接班者。
// 換下來的人改回一般護理照護關係（同醫師交接主治後保留科內照護）；接手的人原本的一般護理關係結束，一人只掛一種。
const primaryNurseOf=(s,p)=>s.relationships.find(r=>r.p===p&&r.role==='primaryNurse'&&r.active)?.actor;
const isIcuNurse=x=>!!x&&x.role==='nurse'&&x.active!==false&&!x.consultationOnly&&x.department==='ICU';
// 全院（2026-10-31）：每位員工屬於一個科（不設支援科）；病人目前在哪一科記在 patient.department。
const isDeptStaff=(s,a,dept,role)=>{const x=s.people[a];return !!x&&x.active!==false&&!x.consultationOnly&&!!dept&&x.department===dept&&(role?x.role===role:['doctor','nurse'].includes(x.role));};
const liveDepartment=(s,hisKey)=>((s.settings&&s.settings.departments)||[]).find(d=>d.live&&d.hisKey===hisKey)||null;
// 特殊註記的顯示（2026-10-31）：進行中的註記，名稱取臨床選項；管路、呼吸器、隔離（或選項勾了顯示天數）算第 N 天，開始當天第 1 天。
const FLAG_TONES={DNR:'dark',ISO:'warning',FALL:'warning'},FLAG_DAYS=['LINE','VENT','ISO'];
const activeFlags=(s,p)=>(s.patientFlags||[]).filter(f=>f.p===p&&!f.end).sort((x,y)=>String(x.start||'').localeCompare(String(y.start||'')));
const flagView=(s,f,lang)=>{const opt=((s.master&&s.master.clinicalOption)||{})[f.code],M=MS(),label=M&&opt?M.clinicalOptionText(s,f.code,lang||'en'):f.code;
 const counts=opt&&opt.count_days!==undefined?!!opt.count_days:FLAG_DAYS.includes(f.code),day=counts&&f.start?CL().admissionDay(String(f.start).slice(0,10),String(now(s)||'').slice(0,10)):null;return {label,tone:FLAG_TONES[f.code]||'info',day};};
const setPrimaryNurse=(s,p,to,by,via,stamp)=>{const end=r=>{r.active=false;r.endedAt=stamp;r.endedBy=by;};
 s.relationships.filter(r=>r.p===p&&r.role==='primaryNurse'&&r.active).forEach(r=>{end(r);if(r.actor!==to&&!relations(s,p,r.actor).some(x=>x.role==='nurse'))s.relationships.push({p,actor:r.actor,role:'nurse',active:true,startedAt:stamp,by,via});});
 s.relationships.filter(r=>r.p===p&&r.actor===to&&r.role==='nurse'&&r.active).forEach(end);
 s.relationships.push({p,actor:to,role:'primaryNurse',active:true,startedAt:stamp,by,via});
 const who=s.people[to];who.patients=who.patients||[];if(!who.patients.includes(p))who.patients.push(p);if(s.confirmed&&s.confirmed[to]&&!s.confirmed[to].patients.includes(p))s.confirmed[to].patients.push(p);};
// 當班醫師（2026-11-08，越南沒有主治）：同一時間一位，醫師交班換成接班醫師、接收時可改；換下的醫師改為科內照護（keepCare），和主要護理師一樣。內部鍵沿用 attending，對應 G9 DUTY_DOCTOR。
const setDutyDoctor=(s,p,to,by,via,stamp,keepCare)=>{const end=r=>{r.active=false;r.endedAt=stamp;r.endedBy=by;};
 s.relationships.filter(r=>r.p===p&&r.role==='attending'&&r.active).forEach(r=>{end(r);if(keepCare&&r.actor!==to&&!relations(s,p,r.actor).some(x=>x.role==='care'))s.relationships.push({p,actor:r.actor,role:'care',active:true,startedAt:stamp,by,via});});
 s.relationships.filter(r=>r.p===p&&r.actor===to&&r.role==='care'&&r.active).forEach(end);
 s.relationships.push({p,actor:to,role:'attending',active:true,startedAt:stamp,by,via});
 const who=s.people[to];who.patients=who.patients||[];if(!who.patients.includes(p))who.patients.push(p);if(s.confirmed&&s.confirmed[to]&&!s.confirmed[to].patients.includes(p))s.confirmed[to].patients.push(p);
 const pt=s.patients.find(x=>x.id===p);if(pt)pt.attending=who.name;};
// 手術紀錄沒有手術室來源，由照護這位病人的醫師或護理師照紙本補登（不含受邀會診醫師）。
const canSurgery=(s,p,a)=>canWrite(s,p,a)||canNurse(s,p,a)||relations(s,p,a).some(r=>r.role==='surgeon');
// 重送 HIS（2026-11-02）：該科醫護或正在照護的人；病人離開或封存後仍要能補送離開訊息，所以不看病歷狀態。
const canResendHis=(s,p,a)=>{const pt=s.patients.find(x=>x.id===p),person=s.people[a];return !!pt&&!!person&&person.role!=='admin'&&(isDeptStaff(s,a,pt.department)||canWrite(s,p,a)||canNurse(s,p,a));};
const assigned=(s,p,a)=>relations(s,p,a).length>0||(s.consultations||[]).some(c=>c.p===p&&c.assignee===a);
// 科常用的維護權：管理者全部可維護；勾了部門管理員的醫護只能維護自己部門（G9 practitioner_organization.can_maintain_dept_catalog）。
const canMaintainDept=(s,a,department)=>{const who=s.people[a];return !!who&&who.active!==false&&(who.role==='admin'||(!!who.deptAdmin&&!!department&&who.department===department));};
const now=s=>s.demoClock;
// 離開 ICU 送 HIS 的訊息（D7 §5.9 TransferCreated、§5.10 DischargeCreated）；原型只記在示範佇列，不真的送。
// 送 HIS 的人員一律帶 HIS 帳號（G9 user_account.username，與 HIS 人員帳號相同），不帶原型內部代號（2026-10-30）。
const hisAccount=(s,a)=>(a&&s.people[a]&&s.people[a].username)||a||null;
// D7 的 datetime 帶 +07:00；醫院牆上時間與 ISO 時間點都先換成毫秒再轉回醫院時區。
const hisTime=t=>{const ms=TZ.millis(t);return Number.isFinite(ms)?TZ.zoned(TZ.wall(ms).slice(0,16)+':00'):null;};
const CL=()=>typeof module!=='undefined'?require('./clinical.js'):root.ICUClinical;
// 目前主要診斷：與病人總覽同一套（最新照護目標帶的診斷，其次主檔 ICD，再其次問題描述）。
const currentDx=(s,patient)=>{const g=(s.goals||[]).filter(x=>x.p===patient.id&&x.diagnosis).sort((x,y)=>TZ.millis(y.at)-TZ.millis(x.at))[0],d=g?g.diagnosis:patient.icd;return d?{code:d.code||null,name:d.english||d.name||null}:{code:null,name:patient.problem||null};};
// 檢驗檢查（2026-10-30）：免簽，開立即送 HIS ServiceRequestCreated（D7 §5.13），同一批一張需求單。示範資料沒有的值送 null，正式系統由 G9 對應欄位帶。
const serviceRequestMessage=(s,patient,labs,meta,msgId,stamp)=>{const dx=currentDx(s,patient),clinical=CL();
 const lines=labs.map(o=>{const key=o.catalog&&o.catalog.key,spec=key&&clinical&&clinical.labInfo?clinical.labInfo(key,s).specimen:null;return {smartIcuLineId:o.id,serviceCode:(o.catalog&&o.catalog.code)||null,performingPlaceCode:null,specimen:o.catalog&&o.catalog.isLab&&spec&&spec!=='Not provided by source'?spec:null,scheduledTime:hisTime(o.start)};});
 const note=labs.map(o=>o.clinicalInfo).filter(Boolean).join('; ')||null;
 return {id:msgId,api:'ServiceRequestCreated',section:'4.3',p:patient.id,at:stamp,status:'queued',orders:labs.map(o=>o.id),payload:{encounterNumber:patient.visitNo||patient.encounter||null,archiveId:patient.archiveId||null,smartIcuOrderId:meta.batch,requester:meta.requester,requestTime:hisTime(meta.at),requestRoomCode:patient.ward||null,priority:meta.priority||'routine',diagnostic:dx.name,diagnosticIcd:dx.code,note:note,services:lines}};};
// 頻率（C25，2026-11-07）：醫囑頻率文字開頭是頻率字典的代碼（QD、Q8H、PRN、STAT…）就送 frequencyCode（D7 §4.18）；frequency 是每日次數，只有每天給的頻率才有。開立畫面仍存顯示文字，對不上字典（例如 Once now、QW、連續輸注）時兩欄送 null。
const hisFrequency=(s,o)=>{const k=(String(o.frequency||'').match(/^[A-Za-z0-9]+(?=\s|\(|$)/)||[])[0],f=k&&((s.master||{}).frequency||{})[k];if(!f||f.active===false)return {frequencyCode:null,frequency:null};const hourly=f.timing_period_unit==='h'&&f.timing_period&&24%f.timing_period===0?24/f.timing_period*(f.timing_frequency||1):null;return {frequencyCode:k,frequency:f.his_times_per_day??hourly};};
// 每日處方（2026-10-30）：藥囑簽署即生效、護理師照給，不等 HIS；每天一次、每位病人一張 PrescriptionCreated（D7 §5.11，DAILY）送 HIS 計費與藥局調劑。
const prescriptionMessage=(s,patient,orders,meta,msgId,stamp)=>{
 const lines=orders.map(o=>{const dr=(o.dosageInstruction&&o.dosageInstruction[0])||{},q=((dr.doseAndRate||[])[0]||{}).doseQuantity||{},d=o.dosing||{};return {smartIcuLineId:o.id,medicationCode:(o.catalog&&o.catalog.code)||null,priority:o.priority||'routine',doseQuantity:q.value??null,doseUnit:q.unit||null,dosageInstructionRoute:(o.routeCatalog&&o.routeCatalog.code)||null,...hisFrequency(s,o),timingText:o.frequency||null,asNeeded:!!d.asNeeded,asNeededReason:d.asNeeded?(d.indication||null):null,maxDosePerDay:d.asNeeded&&d.maxPerDay!=null?d.maxPerDay:null,startTime:hisTime(o.start),endTime:o.end?hisTime(o.end):null,quantity:(o.dispenseQuantity&&o.dispenseQuantity.value)??null,dispenseUnit:(o.dispenseQuantity&&o.dispenseQuantity.unit)||null,dispenseStockCode:null,medicationConsultationRequest:false,dosageInstruction:dr.text||o.dose||null};});
 const note=(s.notes||[]).filter(n=>n.p===patient.id&&!n.voided&&n.status==='signed'&&(n.noteType==='progress'||n.soap)).sort((x,y)=>TZ.millis(y.clinicalAt||y.at)-TZ.millis(x.clinicalAt||x.at))[0],progress=note?String(note.text||'').slice(0,4000):null;
 return {id:msgId,api:'PrescriptionCreated',section:'4.1',p:patient.id,at:stamp,status:'queued',orders:orders.map(o=>o.id),payload:{encounterNumber:patient.visitNo||patient.encounter||null,archiveId:patient.archiveId||null,smartIcuOrderId:msgId,prescriptionKind:'DAILY',requester:meta.requester,prescriptionTime:meta.from,periodStart:meta.from,periodEnd:meta.to,progressNote:progress,medications:lines}};};
const leaveMessage=(s,patient,leave,msgId,stamp)=>{const p=patient.id,secondary=s.diagnoses.filter(x=>x.p===p&&x.stage===(leave.type==='dept-transfer'?'transfer':'discharge')&&x.rank==='secondary'&&x.active).map(x=>x.diagnosis.code);
 const common={encounterNumber:patient.visitNo||patient.encounter||null,doctorUsername:hisAccount(s,leave.by),treatmentResult:leave.treatmentResult};
 if(leave.type==='dept-transfer')return {id:msgId,api:'TransferCreated',section:'3.5',p,at:stamp,status:'queued',payload:{...common,archiveId:patient.archiveId||null,changeDepartmentTime:leave.at,fromDepartmentCode:patient.department||null,departmentCode:leave.toDepartment.code,roomCode:leave.toWard||null,bedCode:leave.toBed||null,transferDiagnosis:leave.diagnosis.name,transferDiagnosisIcd:leave.diagnosis.code,transferDiagnosisExtraIcd:secondary}};
 const death=leave.death;return {id:msgId,api:'DischargeCreated',section:'3.6',p,at:stamp,status:'queued',payload:{...common,dischargeDisposition:leave.type,dischargeTime:leave.at,dischargeDiagnosis:leave.diagnosis.name,dischargeDiagnosisIcd:leave.diagnosis.code,dischargeDiagnosisExtraIcd:secondary,
  receivingFacility:leave.receivingFacility?leave.receivingFacility.code:null,transferLevel:leave.transferLevel||null,
  deathCauseCategory:death?death.causeCategory:null,deathCauseIcd:death&&death.cause?death.cause.code:null,deathWithin24h:death?death.within24h:null,autopsy:death?death.autopsy==='yes':null,autopsyDiagnosisIcd:death&&death.autopsyDiagnosis?death.autopsyDiagnosis.code:null}};};
const archiveState=(s,p)=>{const a=s.archives[p];if(!a)return 'open';if(a.status==='grace'&&Date.parse(now(s))>=Date.parse(a.dueAt)&&latestNotes(s,p).every(n=>n.reviewStatus==='completed')&&!Object.keys(s.drafts).some(k=>k.split(':')[1]===p&&/:(recordWriter|note)/.test(k)))return 'sealed';return a.status;};
const latestNotes=(s,p)=>s.notes.filter(n=>n.p===p&&!n.voided&&!s.notes.some(x=>x.replaces===n.id));
function noteLabel(n){return n.voided?'Voided':n.reviewStatus==='completed'?'Confirmed':n.status==='signed'?'Signed · To confirm':'Saved · To confirm';}
// 執業證（2026-10-24，B2）：取指定日有效、生效日最新的一張；沒有就是 null，簽章照簽但記無證號。
const licenseOf=(s,a,day)=>{const d=String(day||now(s)).slice(0,10);return (s.people[a]?.licenses||[]).filter(l=>l.validFrom<=d&&(!l.validTo||l.validTo>=d)).sort((x,y)=>String(y.validFrom).localeCompare(String(x.validFrom)))[0]||null;};
// 作廢（2026-10-24，C2）：病歷文件（含護理紀錄）、手術與圍術期紀錄、人工補登的檢驗檢查結果、護理量測。只有作者本人、只作廢最新版、病歷完成封存流程前；
// 作廢與還原都要填原因，舊版本與歷程照留。作廢的紀錄不列入預設清單、圖表、劑量體重、交班與封存必備文件。
const VOIDABLE={note:'notes',surgery:'surgeries',periop:'periop',report:'reports',observation:'observations'};
const authorOf=(kind,x)=>kind==='report'?x.enteredBy:kind==='observation'?x.actor:x.author;
// 補在待回醫囑上的人工結果：作廢時把這些欄位收進 voidedEntries，報告回到補登前（待回）。
const STAMP=['status','at','collectedAt','recordedAt','text','components','impression','entry','enteredBy','source'];
const pickStamp=x=>Object.fromEntries(STAMP.map(k=>[k,x[k]===undefined?null:copy(x[k])]));
function voidedRecords(s,p){const out=[];
 for(const kind of ['note','surgery','periop','observation'])for(const x of (s[VOIDABLE[kind]]||[]))if(x.p===p&&x.voided)out.push({kind,id:x.id,rec:x,voided:x.voided});
 for(const r of s.reports||[]){if(r.p!==p)continue;if(r.voided)out.push({kind:'report',id:r.id,rec:r,voided:r.voided});for(const e of r.voidedEntries||[])if(!e.restored)out.push({kind:'report',id:e.id,rec:{...r,...e.entry},voided:e.voided});}
 return out.sort((a,b)=>String(b.voided.at).localeCompare(String(a.voided.at)));}
// 離開後還能做的；換床、再次離開由各自的檢查給更明確的訊息。
const AFTER_LEAVE=['signNote','reviewNote','amendNote','voidRecord','restoreRecord','readReport','processReport','archiveComplete','autopsyRecord','dischargePatient','bedChange'];
function guard(s,action,a,p,payload){
 const must=(b,m)=>{if(!b)throw Error(m);};const person=s.people[a];must(person&&person.active!==false,'This staff member is deactivated or does not exist');
 // EMR整合MDT demo（P2）：mdt* 動作的權限由 mdt-core.js 判斷（提案限可開醫囑的醫師、紀錄限秘書與主席、鎖定限主席、任務限負責人或其科別）。
 if(root.ICUMdtCore&&root.ICUMdtCore.owns(action)){root.ICUMdtCore.guard(s,action,a,p,payload);return;}
 const global=['confirmRoster','scenario','reset','retrySave','signatureSave','settingsSave','personSave','relationshipSave','clockAdvance','hisAdmission','hisDailyBatch','masterSave','masterRemove','logout','prefSave'];
 if(global.includes(action))return;
 if(['handover','receive','handoverPublishBatch'].includes(action)&&!p)return;
 must(s.patients.some(x=>x.id===p),'A valid patient is required');
 if(action==='hisResend'){must(canResendHis(s,p,a),'Only doctors and nurses of this department or this patient\'s care team can resend to HIS');return;}
 // 指定主要護理師不需要先有照護關係：入科時還沒有護理師照護這位病人。
 if(action==='primaryNurseSave'){const pt=s.patients.find(x=>x.id===p);must(isDeptStaff(s,a,pt.department),'Only doctors and nurses of '+pt.department+' can assign the primary nurse');return;}
 // 接收（2026-10-31）：待接收的病人由接收科的醫師或護理師接收；這時他們跟病人還沒有照護關係。
 if(action==='receivePatient'){const pt=s.patients.find(x=>x.id===p);must(pt.pendingReceive,'This patient is not waiting to be received');must(isDeptStaff(s,a,pt.pendingReceive.department),'Only doctors and nurses of '+pt.pendingReceive.department+' can receive this patient');return;}
 if(action==='readReport'){must(person.role!=='admin','Admin accounts cannot perform clinical actions');return;}
 if(action==='consultRespond'){const request=s.consultations.find(x=>x.id===payload.id);must(request&&request.p===p&&request.assignee===a,'This consult is not assigned to the current user');}must(assigned(s,p,a),person.consultationOnly?'Role restriction: consulting physicians can only reply to assigned consults':'Role restriction: you have no active care relationship with this patient');
 if(action==='consultRespond'){const request=s.consultations.find(x=>x.id===payload.id);must(request&&request.p===p&&request.assignee===a,'This consult is not assigned to the current user');}
 const state=archiveState(s,p);
 if(state==='sealed')must(['amendNote','signNote','reviewNote'].includes(action),'Medical record is sealed; only amendments and their sign-off are allowed');
 if(state==='sealed'&&['signNote','reviewNote'].includes(action))must(s.notes.some(n=>n.id===payload.id&&n.p===p&&n.addendum),'After sealing, only amendments can be signed off');
 // 離開後整本病歷唯讀（2026-11-02）：只剩補簽、修正、作廢還原、讀回來得晚的結果與追蹤、死亡病人補解剖診斷、完成歸檔，以及病歷暫存（暫存會擋歸檔，要能存或清掉）；醫囑、執行、量測、護理紀錄、交班一律擋。
 if((s.patients.find(x=>x.id===p)||{}).dischargedAt)must(AFTER_LEAVE.includes(action)||(action==='saveDraft'&&String(payload.kind||'').startsWith('recordWriter')),'This patient has left; the record is read-only except sign-off, amendments and late results');
 if(['voidRecord','restoreRecord'].includes(action))must(state==='open','Records can only be voided or restored before the medical record is completed for archiving; after that, add an amendment');
 const orderActions=['cartAdd','cartAddSet','cartRemove','cartClear','catalogOrder','order','signOrder','hisResponse','cancelOrder','stopOrder','reviewExecution','processReport','consultRequest','reorderTransferred'];
 if(orderActions.includes(action))must(canOrder(s,p,a),'Role restriction: only doctors may order / handle order items');
 if(['consultAdopt','archiveComplete','dischargePatient'].includes(action))must(isAttending(s,p,a),'Role restriction: doctor on duty for this patient only');
 if(action==='labResultManual')must(canOrder(s,p,a)||canNurse(s,p,a),'Role restriction: only doctors or nurses caring for this patient can enter lab and exam results');
 if(['recordNote','copyPreviousProgress','goal','careFocus','diagnosisSave'].includes(action))must(canWrite(s,p,a)||(action==='recordNote'&&payload.noteType==='progress'&&payload.progressKind==='procedure'&&canWriteProcedure(s,p,a)),'Role restriction: only the doctor on duty or in-department care doctors can write; consulting physicians should reply with recommendations');
 if(['execute','infusion','measure','measureBP','measureSet'].includes(action))must(canNurse(s,p,a),'Role restriction: care nurse of this patient only');
 if(action==='note')must(canWrite(s,p,a)||canNurse(s,p,a),'Role restriction: give recommendations through a consultation reply');
 if(action==='saveDraft'){
  const k=String(payload.kind||'');must(/^(recordWriter:(admission|progress|discharge|progress\.acceptance|progress\.transfer|progress\.procedure)|note|orderDetails|handover|surgery|periop:(anesthesia|cardiacHandover|procedure|cpb|recovery))$/.test(k),'Invalid draft type');
  if(k==='note')must(canWrite(s,p,a)||canNurse(s,p,a),'Only care team doctors and nurses can save note drafts');if(k==='handover')must(canWrite(s,p,a)||canNurse(s,p,a),'Only care team doctors and nurses can save handover drafts');
  if(k==='orderDetails')must(canOrder(s,p,a),'Role restriction: only doctors can place orders');
  if(k.startsWith('recordWriter'))must(canWrite(s,p,a)||(k==='recordWriter:progress.procedure'&&canWriteProcedure(s,p,a)),'Role restriction: only care team doctors can write');
  if(k==='surgery'||k.startsWith('periop:'))must(canSurgery(s,p,a),'Only doctors or nurses caring for this patient can enter surgical and perioperative records');if(PF.byId[k.slice(7)]?.doctorsOnly)must(canWrite(s,p,a),'Only care team doctors can enter procedure notes');
 }
}
// 單一病人交班版本（handoverPublish 與 handoverPublishBatch 共用）。批次時 must 訊息帶病人 id；任一病人失敗整批不 commit。
// 入科資料（2026-10-28）：由 HIS 入 ICU 的病人要有體重（含入院體重）與身高才能交班；回傳還缺的項目。之前就在 ICU 的病人不檢查。
const entryMissing=(s,p)=>{const patient=s.patients.find(x=>x.id===p);if(!patient||!patient.icuEntry)return [];const has=kinds=>(s.observations||[]).some(o=>o.p===p&&!o.voided&&kinds.includes(o.kind)&&Number(o.value)>0);return [has(['Weight','Admission weight'])?'':'Weight',has(['Height'])?'':'Height'].filter(Boolean);};
const bedName=(s,p)=>{const x=s.patients.find(q=>q.id===p);return x?x.bed+' '+x.name:p;};
function publishOne(s,a,p,d,env,batch){const {must,text,timestamp,id,at}=env,person=s.people[a];
 must(s.patients.some(x=>x.id===p),'A valid patient is required: '+p);
 must(canWrite(s,p,a)||canNurse(s,p,a),'Only care team doctors and nurses can hand over: '+p);
 {const miss=entryMissing(s,p);must(!miss.length,'Complete the entry data on the patient page before handover: '+bedName(s,p)+' ('+miss.join(', ')+')');}
 const receiver=s.people[d.receiver];must(receiver&&receiver.role===person.role&&d.receiver!==a&&!receiver.consultationOnly&&receiver.role!=='admin'&&receiver.active!==false,'Patient '+p+': assign an incoming clinician with the same role');
 // 接班者尚未照護此病人時，交班本身就是承接：建立照護關係並列入其名單（2026-09-11 R6；主治不因此異動）。
 if(person.role==='doctor'&&!canWrite(s,p,d.receiver))s.relationships.push({p,actor:d.receiver,role:'care',active:true,startedAt:at(),by:a,via:'handover'});
 // 護理交班（2026-10-30）：接班護理師成為主要護理師，交出者改回一般護理照護關係；接班者已是主要護理師（例如更正版本）就不動。
 const primaryNurseTransferred=person.role==='nurse'&&primaryNurseOf(s,p)!==d.receiver;
 if(primaryNurseTransferred)setPrimaryNurse(s,p,d.receiver,a,'handover',at());
 receiver.patients=receiver.patients||[];if(!receiver.patients.includes(p))receiver.patients.push(p);if(s.confirmed[d.receiver]&&!s.confirmed[d.receiver].patients.includes(p))s.confirmed[d.receiver].patients.push(p);
 const prior=d.replaces?s.handovers.find(h=>h.id===d.replaces&&(!h.p||h.p===p)):null;must(!d.replaces||prior,'Handover version to amend not found: '+p);
 if(prior)must(prior.author===a&&!s.handovers.some(x=>x.replaces===prior.id),'You can only amend your own latest handover version: '+p);
  // 每班獨立一筆（2026-11-01）：只能更正這一班自己送的交班；上一班的已經是獨立紀錄。
  if(prior){const C=CL(),shiftNow=C.shiftStartOf&&C.shiftStartOf(person,s.demoClock);must(!shiftNow||C.shiftStartOf(person,prior.clinicalAt||prior.at)===shiftNow,'A handover from an earlier shift cannot be amended; hand over this shift as a new record: '+p);}
 // 交班內容是一大格（2026-09-26）：醫師標 ISBAR、護理標 SBAR，段落由書寫者自己寫，系統不拆格、不帶入。
 const format=person.role==='doctor'?'ISBAR':'SBAR';
 const body=text(d.text,(batch?'Patient '+p+' · ':'')+format+' handover content');
 // 醫師交班（2026-11-08）：沒有主治，接班醫師成為當班醫師，換下的醫師改為科內照護；接班者已是當班醫師（例如更正版本）就不動。
 const attendingTransferred=person.role==='doctor'&&attending(s,p)!==d.receiver;
 if(attendingTransferred)setDutyDoctor(s,p,d.receiver,a,'handover',at(),true);
 const tasks=s.tasks.filter(t=>t.p===p&&t.status!=='done'&&(t.owner===a||(prior?.tasks||[]).some(x=>x.id===t.id)));
 s.handovers.push({id:id('H'),p,role:person.role,shift:person.shift,author:a,receiver:d.receiver,version:prior?prior.version+1:1,replaces:prior?.id||null,reason:prior?text(d.reason,'Reason for amendment'):null,batch:batch||null,format,attendingTransferred,primaryNurseTransferred,text:body,summary:body,at:at(),clinicalAt:timestamp(d.clinicalAt),scheduled:person.end,tasks:copy(tasks),orders:copy(s.orders.filter(o=>o.p===p&&o.clinical==='active'&&!s.executions.some(e=>e.order===o.id&&e.status==='done'))),reports:copy(s.reports.filter(r=>r.p===p&&r.status==='pending'))});
 delete s.drafts[a+':'+p+':handover'];}
function handle(s,action,a,d,env){
 const {must,text,timestamp,id,at,get,clinical}=env,p=d.p,person=s.people[a];
 const primary=()=>must(isAttending(s,p,a),'Doctor on duty for this patient only');
 const admin=()=>must(person.role==='admin','Only administrators can change maintenance settings');
 const signature=n=>{const lic=licenseOf(s,a);const sig={id:id('SIG'),actor:a,at:at(),document:n.id,version:n.version,image:s.people[a]?.signature?.image||null,method:'Demo identity confirmation (not a formal e-signature)',license:lic?lic.number:null,licenseId:lic?lic.id:null};s.signatureRecords.push(sig);return sig;};
 switch(action){
 case 'signatureSave':{const who=s.people[a],img=String(d.image||'').trim();if(d.remove==='1'){who.signature=null;break;}must(img,'Choose a signature image first');must(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(img),'Signature must be a PNG or JPEG image');must(img.length<=300000,'Signature image is too large; use an image under 200 KB');who.signature={image:img,updatedAt:at()};break;}
 case 'settingsSave':admin();s.settingsHistory.push({...copy(s.settings),changedBy:a,changedAt:at()});s.settings.version+=1;
 // 出入量的一天從幾點算起（全院設定；2026-11-01 院方定為 00:00，舊資料的 07:00 預設值一次改成 00:00）。
 if(d.ioDayStart!==undefined){must(/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.ioDayStart)),'Intake and output day start must be HH:MM');s.settings.ioDayStart=String(d.ioDayStart);}
 // 全院（2026-10-31）：科別名稱、對應 HIS 科別與是否已上線；病人還在的科不能拿掉。
 if(Object.keys(d).some(k=>k.startsWith('deptName:'))){const rows=[];for(let i=0;i<60;i++){const name=String(d['deptName:'+i]??'').trim();if(!name)continue;const hisKey=String(d['deptHis:'+i]||'').trim(),e=clinical.snapshot(hisKey);must(e&&e.kind==='department'&&e.active,'Department '+name+': select the HIS department');must(!rows.some(r=>r.name===name),'Duplicate department: '+name);must(!rows.some(r=>r.hisKey===hisKey),'Two departments map to the same HIS department: '+e.name);rows.push({name,hisKey,hisCode:e.code,hisName:e.name,live:['on','1','true'].includes(String(d['deptLive:'+i]))});}
  must(rows.some(r=>r.live),'At least one department must be live');for(const pt of s.patients)if(!pt.dischargedAt)must(rows.some(r=>r.live&&r.name===pt.department)&&(!pt.pendingReceive||rows.some(r=>r.live&&r.name===pt.pendingReceive.department)),'Patients are still in '+pt.department+'; keep it live');s.settings.departments=rows;}
must(['0','24'].includes(String(d.graceHours)),'Transition period supports only demo values 0 or 24 h');s.settings.graceHours=Number(d.graceHours);if(d.dosingWeightStaleDays!==undefined){const v=Number(d.dosingWeightStaleDays);must(Number.isInteger(v)&&v>=1&&v<=90,'Dosing weight stale threshold must be a whole number of days from 1 to 90');s.settings.dosingWeightStaleDays=v;}if(d.dosingWeightStaleDaysInfant!==undefined){const v=Number(d.dosingWeightStaleDaysInfant);must(Number.isInteger(v)&&v>=1&&v<=90,'Dosing weight stale threshold under 1 year must be a whole number of days from 1 to 90');s.settings.dosingWeightStaleDaysInfant=v;}for(const k of Object.keys(defaults.templates))s.settings.templates[k]=text(d[k],k+' template');if(d.categoryOrder){const keys=String(d.categoryOrder).split(',');must(keys.length===defaults.categories.length&&new Set(keys).size===keys.length&&keys.every(k=>defaults.categories.some(c=>c[0]===k)),'Category order must include every category with no duplicates');s.settings.categories=keys.map(k=>[k,text(d['category:'+k]||s.settings.categories.find(c=>c[0]===k)?.[1],k+' category name')]);}break;
 // 員工維護（2026-10-18）：同一個動作新增或修改。帳號唯一且不可改；身分只有醫師／護理師／管理者；部門管理員是旗標不是身分；停用用 status，不刪資料（2026-10-28 拿掉生效日、失效日與班別起訖）。
 case 'personSave':{admin();
  const ROLES=['doctor','nurse','admin'],flag=v=>String(v??'').split(',').map(x=>x.trim()).some(x=>['1','true','on'].includes(x)),dateOk=v=>!v||/^\d{4}-\d\d-\d\d$/.test(v);
  const isNew=!d.actor;const username=String(d.username||(isNew?'':(s.people[d.actor]?.username||d.actor))).trim();
  must(/^[A-Za-z][A-Za-z0-9_-]{1,15}$/.test(username),'Username: 2–16 letters, digits, - or _, starting with a letter');
  must(!Object.entries(s.people).some(([k,x])=>k!==d.actor&&(k.toLowerCase()===username.toLowerCase()||String(x.username||'').toLowerCase()===username.toLowerCase())),'This username is already in use');
  let who;if(isNew){who=s.people[username]={username,patients:[],createdBy:a,createdAt:at()};}else{who=s.people[d.actor];must(who,'Select a valid staff member');must(String(who.username||d.actor)===username,'The username of an existing account cannot be changed');}
  const prevRole=who.role;const role=d.role===undefined?who.role:String(d.role);must(ROLES.includes(role),'Role must be doctor, nurse or administrator');
  const consultationOnly=d.consultationOnly===undefined?!!who.consultationOnly:flag(d.consultationOnly);must(!consultationOnly||role==='doctor','Only doctors can be consultation-only');
  if(!isNew&&role!==who.role){const live=s.relationships.filter(r=>r.actor===d.actor&&r.active);must(!live.length||(role!=='admin'&&live.every(r=>['nurse','primaryNurse'].includes(r.role)===(role==='nurse'))),'This person still has active care relationships that do not fit the new role; end them in Patient care relationships first');}
  const status=d.status===undefined?(who.status||'active'):String(d.status);must(['active','disabled'].includes(status),'Status must be active or disabled');
  const willBeActive=status==='active';
  if(!isNew&&d.actor===a){must(willBeActive,'You cannot deactivate your own account');must(role==='admin','You cannot remove your own administrator role');}
  if(!isNew&&who.role==='admin'&&(role!=='admin'||!willBeActive))must(Object.entries(s.people).some(([k,x])=>k!==d.actor&&x.role==='admin'&&x.active!==false),'At least one active administrator must remain');
  who.name=text(d.name,'Name');who.department=text(d.department,'Department');
  if(d.title!==undefined)who.title=String(d.title).trim().slice(0,80)||undefined;if(d.specialty!==undefined)who.specialty=String(d.specialty).trim().slice(0,80)||undefined;
  who.role=role;who.consultationOnly=consultationOnly||undefined;who.deptAdmin=role==='admin'?false:(d.deptAdmin===undefined?!!who.deptAdmin:flag(d.deptAdmin));
  who.status=status;who.active=willBeActive;
  // 班別代碼：管理者 ADMIN、照會 CONSULT；醫護換職類或原本沒有班別時給預設 D1／N1，其餘保留原值。
  if(role==='admin')who.shift='ADMIN';else if(consultationOnly){if(!String(who.shift||'').startsWith('CONSULT'))who.shift='CONSULT';}else if(!who.shift||role!==prevRole||who.shift==='ADMIN'||String(who.shift).startsWith('CONSULT'))who.shift=role==='doctor'?'D1':'N1';
  // 執業證（2026-10-24，B2）：證號、發證機關、生效日一起填；同號只改機關與日期，換號新增一列、舊證保留。管理者沒有執業證。
  who.licenses=Array.isArray(who.licenses)?who.licenses:[];
  const lic={number:String(d.licenseNumber??'').trim(),issuer:String(d.licenseIssuer??'').trim(),from:String(d.licenseFrom??'').trim(),to:String(d.licenseTo??'').trim()};
  if(lic.number||lic.issuer||lic.from||lic.to){must(role!=='admin','Administrators do not hold practice licenses');must(/^[A-Za-z0-9][A-Za-z0-9\/.\-]{2,31}$/.test(lic.number),'Practice license number: 3–32 letters, digits, / . or -');
   must(lic.issuer,'Required: License issuer');must(lic.from,'Required: License valid from');must(dateOk(lic.from)&&dateOk(lic.to),'Dates must be YYYY-MM-DD');must(!lic.to||lic.from<=lic.to,'License valid-to cannot be earlier than valid-from');
   const key=lic.number.toUpperCase(),self=isNew?username:d.actor,last=who.licenses[who.licenses.length-1];
   must(!Object.entries(s.people).some(([k,x])=>k!==self&&(x.licenses||[]).some(l=>String(l.number).toUpperCase()===key)),'This practice license number belongs to another staff member');
   if(last&&String(last.number).toUpperCase()===key)Object.assign(last,{number:lic.number,issuer:lic.issuer,validFrom:lic.from,validTo:lic.to||null,updatedBy:a,updatedAt:at()});
   else{must(!who.licenses.some(l=>String(l.number).toUpperCase()===key),'This license number is already in this person\'s license history');who.licenses.push({id:id('LIC'),number:lic.number,issuer:lic.issuer,validFrom:lic.from,validTo:lic.to||null,source:'M',createdBy:a,createdAt:at()});}}
  who.updatedBy=a;who.updatedAt=at();s.lastPersonId=isNew?username:d.actor;break;}
 // 每日送 HIS（2026-10-30，示範按鈕）：正式系統每天固定時間自動送；每位病人一張，涵蓋接下來 24 小時有效的藥囑。藥囑早已生效，送不送得出去都不影響給藥。
 case 'hisDailyBatch':{const z=ms=>TZ.zoned(TZ.wall(ms).slice(0,16)+':00'),fromMs=TZ.millis(now(s)||at()),toMs=fromMs+864e5,from=z(fromMs),to=z(toMs),sent=[];
  for(const patient of s.patients){if(patient.dischargedAt)continue;const pid=patient.id;
   if((s.hisOutbox||[]).some(m=>m.api==='PrescriptionCreated'&&m.p===pid&&m.payload.periodStart===from))continue;
   const orders=s.orders.filter(o=>o.p===pid&&o.kind==='medication'&&o.local==='signed'&&o.clinical==='active'&&TZ.millis(o.start)<toMs&&(!o.end||TZ.millis(o.end)>fromMs));if(!orders.length)continue;
   const msg=prescriptionMessage(s,patient,orders,{requester:hisAccount(s,attending(s,pid)),from,to},id('HIS'),at());orders.forEach(o=>{o.his='sent';o.hisBatch=msg.id;});(s.hisOutbox=s.hisOutbox||[]).push(msg);sent.push(pid);}
  must(sent.length,'No medication orders to send to HIS for this period, or the batch for this period was already sent');s.lastHisBatch={at:at(),from,patients:sent};break;}
 // 主要護理師（2026-10-31）：該科醫師與護理師都能指定，也能隨時改；被選的人限該科在職護理師。護理交班照樣換成接班者。
 case 'primaryNurseSave':{const patient=s.patients.find(x=>x.id===p);must(!patient.dischargedAt,'The patient has left; the primary nurse can no longer be changed');must(!patient.pendingReceive||patient.pendingReceive.via==='transfer','Receive the patient first; the primary nurse is chosen when receiving');const to=String(d.nurse||'');must(isDeptStaff(s,to,patient.department,'nurse'),'Choose an active nurse of '+patient.department);const cur=primaryNurseOf(s,p);must(cur!==to,'This nurse is already the primary nurse');setPrimaryNurse(s,p,to,a,cur?'change':'assign',at());break;}
 // 接收（2026-10-31）：HIS 3.3 送來或本系統轉科的病人先待接收；接收時選床（和預定的不同就送 3.4）、主要護理師（必選）與到床時間，當班醫師預帶 HIS 帶來的醫師、可改，待指定或內部轉科時必選（2026-11-08）。
 // 內部轉科在接收這一刻才完成：先送 3.5（changeDepartmentTime＝到床時間）與原科未送的藥囑最後一批，原科醫囑在轉科時間停止、原科照護關係結束。
 case 'receivePatient':{const patient=s.patients.find(x=>x.id===p),pend=patient.pendingReceive,dept=pend.department,transfer=pend.via==='transfer';
  const ward=String(d.ward||'').trim(),bed=String(d.bed||'').trim();must(ward&&bed,'Enter the ward and bed');
  must(!s.patients.some(x=>x.id!==p&&!x.dischargedAt&&(x.bed===bed||(x.pendingReceive&&x.pendingReceive.bed===bed))),'Bed is still occupied: '+bed);
  const nurse=String(d.nurse||'');must(isDeptStaff(s,nurse,dept,'nurse'),'Choose the primary nurse: an active nurse of '+dept);
  const arrived=timestamp(d.arrivedAt);must(!now(s)||TZ.millis(arrived)<=TZ.millis(now(s)),'Arrival time cannot be later than now');must(arrived.slice(0,10)>=String(patient.admitted||'').slice(0,10),'Arrival time cannot be earlier than the admission date');
  let attendingId=null;if(transfer)must(TZ.millis(arrived)>=TZ.millis(pend.at),'Arrival cannot be earlier than the transfer request');
  if(transfer||pend.attendingPending||d.attending){attendingId=String(d.attending||'');must(isDeptStaff(s,attendingId,dept,'doctor'),'Choose the doctor on duty: an active doctor of '+dept);}
  const body=[['Weight','weight',300,'Weight must be greater than 0 and at most 300 kg'],['Height','height',250,'Height must be greater than 0 and at most 250 cm']].map(([kind,k,max,msg])=>{const raw=String(d[k]??'').trim();if(raw==='')return null;const v=Number(raw);must(Number.isFinite(v)&&v>0&&v<=max,msg);return [kind,v];}).filter(Boolean);
  if(transfer){const from=patient.department;
   // 先送原科最後一張 4.1（帶原科 archiveId），再送 3.5（D7 §5.9，決策單 B13）
   const unsent=s.orders.filter(o=>o.p===p&&o.kind==='medication'&&o.local==='signed'&&o.clinical==='active'&&o.his!=='sent');
   if(unsent.length){const msg=prescriptionMessage(s,patient,unsent,{requester:hisAccount(s,attending(s,p)),from:patient.departmentEntryTime||patient.icuEntryTime||arrived,to:arrived},id('HIS'),at());msg.final=true;unsent.forEach(o=>{o.his='sent';o.hisBatch=msg.id;});s.hisOutbox.push(msg);}
   s.hisOutbox.push(leaveMessage(s,patient,{...pend.leave,at:arrived,toWard:ward,toBed:bed},id('HIS'),at()));
   const stopped=[];s.orders.filter(o=>o.p===p&&o.clinical==='active').forEach(o=>{o.clinical='stopped';o.end=arrived;o.stop={actor:a,at:at(),reason:'Transferred to '+dept};stopped.push(o.id);});
   s.relationships.filter(r=>r.p===p&&r.active).forEach(r=>{r.active=false;r.endedAt=arrived;r.endedBy=a;r.endedVia='transfer';});
   (patient.stays=patient.stays||[]).push({department:from,from:patient.departmentEntryTime||patient.icuEntryTime||null,to:arrived,archiveId:patient.archiveId||null});
   patient.archiveId='ARC-'+p+'-'+(patient.stays.length+1);patient.department=dept;patient.transferredOrders={at:arrived,from,orders:stopped,reordered:[]};
   s.relationships.push({p,actor:attendingId,role:'attending',active:true,startedAt:arrived,by:a,via:'transfer'});const att=s.people[attendingId];att.patients=att.patients||[];if(!att.patients.includes(p))att.patients.push(p);
   if(s.confirmed&&s.confirmed[attendingId]&&!s.confirmed[attendingId].patients.includes(p))s.confirmed[attendingId].patients.push(p);patient.attending=att.name;}
  else if(ward!==pend.ward||bed!==pend.bed)s.hisOutbox.push({id:id('HIS'),api:'LocationChanged',section:'3.4',p,at:at(),status:'queued',payload:{encounterNumber:patient.visitNo||patient.encounter||null,archiveId:patient.archiveId||null,departmentCode:dept,roomCode:ward,bedCode:bed,changeTime:arrived,changedBy:hisAccount(s,a)}});
  if(!transfer&&attendingId&&attending(s,p)!==attendingId)setDutyDoctor(s,p,attendingId,a,'receive',arrived,false);
  patient.ward=ward;patient.bed=bed;patient.departmentEntryTime=arrived;if(!transfer){patient.icuEntryTime=arrived;patient.admittedAt=arrived;patient.icuEntry={via:'AdmissionCreated',message:pend.message,at:arrived};}
  patient.locations=[{ward,bed,from:arrived,by:a,at:at()}];setPrimaryNurse(s,p,nurse,a,'receive',arrived);
  body.forEach(([kind,v])=>s.observations.push({id:id('O'),p,kind,value:v,unit:kind==='Weight'?'kg':'cm',at:arrived,recorded:at(),actor:a,source:'observation',entry:'intake'}));
  (patient.received=patient.received||[]).push({via:pend.via,department:dept,from:pend.fromDepartment||null,arrived,by:a,at:at()});patient.pendingReceive=null;
  if(patient.icuEntry&&!patient.icuEntry.completedAt&&!entryMissing(s,p).length){patient.icuEntry.completedAt=at();patient.icuEntry.completedBy=a;}break;}
 // 特殊註記（2026-10-31）：該科照護醫師與護理師新增、結束；DNR 只有醫師能新增與撤銷。同一種註記同時只有一筆進行中。
 case 'flagAdd':{must(canWrite(s,p,a)||canNurse(s,p,a),'Only doctors or nurses caring for this patient can record special markers');const code=String(d.code||''),opt=((s.master&&s.master.clinicalOption)||{})[code];must(opt&&opt.value_set==='patient_flag'&&opt.active!==false,'Choose an active special marker');
  if(code==='DNR')must(canWrite(s,p,a),'Only care doctors can record DNR');must(!(s.patientFlags||[]).some(f=>f.p===p&&f.code===code&&!f.end),'This marker is already active');const start=timestamp(d.start);must(!now(s)||TZ.millis(start)<=TZ.millis(now(s)),'The start time cannot be later than now');
  (s.patientFlags=s.patientFlags||[]).push({id:id('FLG'),p,code,start,end:null,note:String(d.note||'').trim().slice(0,200),source:'M',recordedBy:a,recordedAt:at()});break;}
 case 'flagEnd':{must(canWrite(s,p,a)||canNurse(s,p,a),'Only doctors or nurses caring for this patient can end special markers');const f=(s.patientFlags||[]).find(x=>x.id===d.id&&x.p===p);must(f&&!f.end,'Marker not found or already ended');if(f.code==='DNR')must(canWrite(s,p,a),'Only care doctors can revoke DNR');
  const end=timestamp(d.end);must(!f.start||TZ.millis(end)>=TZ.millis(f.start),'The end time cannot be earlier than the start');must(!now(s)||TZ.millis(end)<=TZ.millis(now(s)),'The end time cannot be later than now');f.end=end;f.endedBy=a;f.endedAt=at();break;}
 // 取消轉科（2026-10-31）：接收之前，原科照護醫師可以取消。
 case 'transferCancel':{const patient=s.patients.find(x=>x.id===p);must(patient.pendingReceive&&patient.pendingReceive.via==='transfer','No transfer is waiting to be received');must(canWrite(s,p,a),'Only the sending care doctors can cancel the transfer');(patient.transferCancels=patient.transferCancels||[]).push({...patient.pendingReceive,cancelledAt:at(),cancelledBy:a});patient.pendingReceive=null;break;}
 // 轉入前有效醫囑（2026-10-31）：接收科醫師勾選要續用的，重開成接收科的新醫囑（新的 archiveId，簽署即生效）。
 case 'reorderTransferred':{const patient=s.patients.find(x=>x.id===p),t=patient.transferredOrders;must(t&&t.orders.length,'No orders from before the transfer');const ids=[...new Set(String(d.orders||'').split(',').map(x=>x.trim()).filter(Boolean))];must(ids.length,'Tick at least one order to continue');
  for(const oid of ids){must(t.orders.includes(oid)&&!t.reordered.includes(oid),'Not in the pre-transfer list or already continued: '+oid);const o=get('orders',oid),nx=copy(o);for(const k of ['hisBatch','stop','end','reviewed'])delete nx[k];
   Object.assign(nx,{id:id('ORD'),version:1,start:TZ.wall(TZ.millis(now(s))).slice(0,16),clinical:'active',local:'signed',his:o.kind==='medication'?'notSent':o.his==='none'?'none':'notSent',orderedAt:at(),author:a,continuedFrom:o.id,source:'Continued after transfer from '+t.from});nx.stay=currentStay(s.patients.find(q=>q.id===p));s.orders.push(nx);t.reordered.push(oid);}break;}
 case 'relationshipSave':{admin();must(s.patients.some(x=>x.id===p),'Patient does not exist');const who=s.people[d.actor];must(who&&Object.hasOwn(labels,d.role),'Invalid staff member or care role');must(['nurse','primaryNurse'].includes(d.role)?who.role==='nurse':who.role==='doctor','Staff type does not match care role');if(d.active==='0'){must(d.role!=='attending','The doctor on duty cannot be removed directly; assign a new doctor on duty');s.relationships.filter(r=>r.p===p&&r.actor===d.actor&&r.role===d.role&&r.active).forEach(r=>{r.active=false;r.endedAt=at();});}else if(d.role==='primaryNurse'){if(primaryNurseOf(s,p)!==d.actor)setPrimaryNurse(s,p,d.actor,a,'admin',at());}else{if(d.role==='attending')s.relationships.filter(r=>r.p===p&&r.role==='attending'&&r.active).forEach(r=>{r.active=false;r.endedAt=at();});if(!relations(s,p,d.actor).some(r=>r.role===d.role))s.relationships.push({p,actor:d.actor,role:d.role,active:true,startedAt:at(),by:a});}break;}
 case 'clockAdvance':{admin();const next=timestamp(d.clock);must(TZ.millis(next)>=TZ.millis(s.demoClock),'Demo time cannot go backward');s.demoClock=TZ.zoned(next+':00');for(const [pid,v] of Object.entries(s.archives))if(archiveState(s,pid)==='sealed'){v.status='sealed';v.sealedAt=v.dueAt||v.sealedAt;}break;}
 case 'diagnosisSave':{const keys=[...new Set(String(d.keys||d.key||'').split(',').map(x=>x.trim()).filter(Boolean))];must(keys.length,'Select at least one ICD-10');must(['admission','icu','discharge'].includes(d.stage),'Invalid diagnosis stage');must(['primary','secondary'].includes(d.rank),'Invalid principal / secondary designation');
  keys.forEach((key,i)=>{const diagnosis=clinical.snapshot(key);must(diagnosis&&diagnosis.kind==='icd'&&diagnosis.active,'Select a valid ICD-10: '+key);must(!s.diagnoses.some(x=>x.p===p&&x.stage===d.stage&&x.key===key&&x.active),'This stage already has the same diagnosis: '+diagnosis.code);
   // 多選時只有第一個能是主要診斷，其餘自動為次要。
   const rank=d.rank==='primary'&&i===0?'primary':'secondary';if(rank==='primary')s.diagnoses.filter(x=>x.p===p&&x.stage===d.stage&&x.rank==='primary'&&x.active).forEach(x=>{x.active=false;});s.diagnoses.push({id:id('DX'),p,stage:d.stage,rank,key,diagnosis,actor:a,at:at(),active:true});});break;}
 case 'consultAdopt':{primary();const c=get('consultations',d.id);must(c.status==='completed','Consultation not yet replied');must(!c.adoption,'This recommendation already has a follow-up action');must(['adopt','decline','follow'].includes(d.decision),'Invalid adoption decision');c.adoption={decision:d.decision,note:text(d.note,'Adoption note'),actor:a,at:at()};break;}
 case 'stopOrder':{const o=get('orders',d.id);must(o.clinical==='active','Only active orders can be stopped');const end=timestamp(d.end);must(end>o.start,'Stop time must be after start');must(!s.executions.some(e=>e.order===o.id&&e.status==='done'&&e.at>=end),'Stop time cannot be earlier than a completed administration');o.clinical='stopped';o.end=end;o.stop={actor:a,at:at(),reason:text(d.reason,'Reason for stopping')};break;}
 case 'surgerySave':{must(canSurgery(s,p,a),'Only doctors or nurses caring for this patient can enter operative records');const patient=s.patients.find(x=>x.id===p);
  const prior=d.replaces?get('surgeries',d.replaces):null;if(prior){must(!prior.voided,'This record has been voided; restore it first');must(!s.surgeries.some(x=>x.replaces===prior.id),'Revise from the latest version');}
  const opt=v=>String(v??'').trim().slice(0,4000);
  const performedAt=timestamp(d.performedAt);must(performedAt.slice(0,10)>=String(patient.admitted||'').slice(0,10),'Surgery / procedure time cannot be earlier than admission time');
  const names=v=>[...new Set(String(v||'').split(/[、,，;；\n]/).map(x=>x.trim()).filter(Boolean))];
  const primarySurgeon=text(d.surgeon,'Surgeon / proceduralist (primary)'),assistants=names(d.assistants).filter(x=>x!==primarySurgeon);
  const surgeons=[{name:primarySurgeon,role:'primary'},...assistants.map(name=>({name,role:'assistant'}))];
  must(/^2026-\d\d-\d\d$/.test(d.signedDate||''),'Enter the sign date');must(d.signedDate>=performedAt.slice(0,10),'Sign date cannot be earlier than the surgery / procedure date');must(d.signedDate<=String(now(s)).slice(0,10),'Sign date cannot be later than today');
  const signer=String(d.signer||'').trim()||primarySurgeon;must(surgeons.some(x=>x.name===signer),'Signer must be a surgeon / proceduralist on the performing team');
  let diagram=[];if(d.diagram){try{diagram=JSON.parse(d.diagram);}catch(e){diagram=null;}must(Array.isArray(diagram)&&diagram.length<=3&&diagram.every(x=>typeof x==='string'&&/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(x)&&x.length<=600000),'Surgical diagram accepts images only, up to 3');}
  const rec={performedAt,ward:opt(d.ward)||patient.ward||'',bed:opt(d.bed)||patient.bed||'',preDiagnosis:text(d.preDiagnosis,'Pre-op / pre-procedure diagnosis'),postDiagnosis:text(d.postDiagnosis,'Post-op / post-procedure diagnosis'),
   procedure:text(d.procedure,'Surgery / procedure method'),category:opt(d.category),anesthesia:opt(d.anesthesia),surgeons,anesthetists:names(d.anesthetists),diagram,steps:text(d.steps,'Surgery / procedure steps'),signedDate:d.signedDate,signer};
  s.surgeries.push({...rec,id:id('OR'),p,author:a,version:prior?prior.version+1:1,replaces:prior?.id||null,reason:prior?text(d.reason,'Reason for revision'):null,status:'saved',at:at(),form:'I-E-03-001',source:'Manually entered by clinicians (no OR system source)'});delete s.drafts[a+':'+p+':surgery'];break;}
 // 圍術期紀錄（2026-09-26）：麻醉紀錄、開心手術後交接單、處置紀錄（管路置入）、體外循環摘要、麻醉甦醒評分。
 // 欄位與規則在 periop-forms.js；照護醫護照紙本手動登錄，存檔即生效，修訂存新版本。
 case 'periopSave':{must(canSurgery(s,p,a),'Only doctors or nurses caring for this patient can enter perioperative records');const form=String(d.periopForm||'');must(PF.FORMS.some(f=>f.id===form),form==='procedureNote'?'Procedure notes are written as a progress note type':'Invalid perioperative record type');if(PF.byId[form].doctorsOnly)must(canWrite(s,p,a),'Only care team doctors can enter procedure notes');const patient=s.patients.find(x=>x.id===p);
  const prior=d.replaces?get('periop',d.replaces):null;if(prior){must(!prior.voided,'This record has been voided; restore it first');must(prior.form===form,'Record type differs from the original version');must(!s.periop.some(x=>x.replaces===prior.id),'Revise from the latest version');}
  const data=PF.validate(form,d,{must,now:now(s),admitted:patient.admittedAt||patient.admitted,options:(set,keep)=>MS().clinicalOptions(s,set,keep)});
  const surgeryId=PF.byId[form].noSurgeryLink?'':String(d.surgeryId||'');if(surgeryId)must(s.surgeries.some(x=>x.id===surgeryId&&x.p===p),'Linked operative record does not exist');
  s.periop.push({id:id('PO'),p,form,code:PF.byId[form].code,data,surgeryId:surgeryId||null,author:a,version:prior?prior.version+1:1,replaces:prior?.id||null,reason:prior?text(d.reason,'Reason for revision'):null,at:at(),source:'Manually entered by clinicians (no OR system source)'});
  delete s.drafts[a+':'+p+':periop:'+form];break;}
 case 'handoverPublish':publishOne(s,a,p,d,env,null);break;
case 'handoverPublishBatch':{const ids=String(d.patients||'').split(',').map(x=>x.trim()).filter(Boolean);must(ids.length,'Include at least one patient');must(new Set(ids).size===ids.length,'Duplicate patients in handover list');
 // 沒有接班者的病人整批擋下，而且直接講出是哪幾床；逐列指定優先於「整批交給誰」。
 const noReceiver=ids.filter(pid=>!String(d['receiver:'+pid]||d.receiver||'').trim());
 must(!noReceiver.length,'No incoming clinician assigned: '+noReceiver.map(pid=>{const x=s.patients.find(q=>q.id===pid);return x?x.bed+' '+x.name:pid;}).join(', ')+'; select these patients, assign an incoming clinician and save draft, or set “Hand over all to”.');
 const noEntry=ids.filter(pid=>entryMissing(s,pid).length);
 must(!noEntry.length,'Complete the entry data on the patient page before handover: '+noEntry.map(pid=>bedName(s,pid)+' ('+entryMissing(s,pid).join(', ')+')').join(', '));
 const batch=id('HB');ids.forEach(pid=>publishOne(s,a,pid,{text:d['text:'+pid],receiver:d['receiver:'+pid]||d.receiver,clinicalAt:d.clinicalAt,replaces:d['replaces:'+pid]||'',reason:d.reason,transferAttending:d.transferAttending},env,batch));break;}
case 'signNote':{const n=get('notes',d.id);must(!n.voided,'This record has been voided; restore it first');must(n.author===a&&n.status==='draft','You can only sign your own unsigned drafts');must(!s.notes.some(x=>x.replaces===n.id),'Sign the latest version');n.status='signed';n.reviewStatus='pending';n.signedAt=at();n.signature=signature(n);break;}
  // 確認＝作者本人看過列印預覽後簽名定版。本院沒有「住院醫師簽完送主治核定」這一段，也沒有代簽或代核。
 case 'reviewNote':{const n=get('notes',d.id);must(!n.voided,'This record has been voided; restore it first');must(n.author===a,'You can only confirm records you wrote; this hospital does not allow signing or reviewing on behalf of others');must(!s.notes.some(x=>x.replaces===n.id),'Confirm the latest version');must(n.reviewStatus!=='completed','This version is already confirmed');
  if(!n.signature){n.status='signed';n.signedAt=n.signedAt||at();n.signature=signature(n);}  // 確認完成一定留下作者簽名
  n.reviewStatus='completed';n.review={actor:a,at:at(),decision:'complete'};break;}
 case 'amendNote':{const n=get('notes',d.id);must(!n.voided,'This record has been voided; restore it first');must(n.author===a&&n.status==='signed'&&!s.notes.some(x=>x.replaces===n.id),'You can only amend your own latest signed note');const soap=d.format==='soap'?Object.fromEntries(['S','O','A','P'].map(k=>[k,text(d[k],k+' amended section')])):null;const body=soap?clinical.soapText(soap):text(d.text,'Amended full text');const sections=soap&&n.sections?{...copy(n.sections),...soap}:null;s.notes.push({...copy(n),id:id('DOC'),replaces:n.id,version:n.version+1,status:'draft',reviewStatus:'saved',text:body,sections,soap,reason:text(d.reason,'Reason for amendment'),at:at(),signature:null,approvalSignature:null,review:null,signedAt:null,addendum:archiveState(s,p)==='sealed'});break;}
 // 離開 ICU（2026-10-27）：轉科要先核定轉出摘要，其餘要先核定出院摘要；送出就結束 ICU 這一段，記一筆送 HIS 的訊息（示範佇列）。
 case 'dischargePatient':{primary();const patient=s.patients.find(x=>x.id===p);must(!patient.dischargedAt,'This patient has already left');
  const type=String(d.leaveType||'');must(LEAVE_TYPES.some(x=>x[0]===type),'Select how the patient leaves');const docs=latestNotes(s,p);
  if(type==='dept-transfer')must(docs.some(n=>n.noteType==='progress'&&n.progressKind==='transfer'&&n.reviewStatus==='completed'),'Complete transfer note approval first');
  else must(docs.some(n=>n.noteType==='discharge'&&n.reviewStatus==='completed'),'Complete discharge summary approval first');
  const leftAt=timestamp(d.at);must(leftAt>=patient.admitted,'Discharge cannot be earlier than admission');must(!patient.icuEntryTime||TZ.millis(leftAt)>=TZ.millis(patient.icuEntryTime),'Leaving cannot be earlier than entering the department');
  const result=String(d.treatmentResult||'');must(TREATMENT_RESULTS.some(x=>x[0]===result),'Select the treatment result');
  must((type==='exp')===(result==='DEATH'),type==='exp'?'A patient who died has the treatment result Death':'The treatment result Death applies only when the patient died');
  const icd=(key,label,required)=>{const k=String(key||'').trim();if(!k){must(!required,`${label} is required`);return null;}const x=clinical.snapshot(k);must(x&&x.kind==='icd'&&x.active,`${label}: select a valid ICD-10 code`);return {key:x.key,code:x.code,name:x.name,english:x.english||''};};
  const leave={type,at:leftAt,treatmentResult:result,diagnosis:icd(d.leaveDiagnosis,type==='dept-transfer'?'Diagnosis at transfer':'Discharge diagnosis',true),by:a,recordedAt:at()};
  if(type==='dept-transfer'){const dept=clinical.snapshot(String(d.toDepartment||''));must(dept&&dept.kind==='department'&&dept.active,'Select the receiving department');leave.toDepartment={key:dept.key,code:dept.code,name:dept.name};}
  if(type==='other-hcf'){const level=String(d.transferLevel||'');must(TRANSFER_LEVELS.some(x=>x[0]===level),'Select the transfer level');const f=clinical.snapshot(String(d.receivingFacility||''));must(f&&f.kind==='facility'&&f.active,'Select the receiving hospital');leave.transferLevel=level;leave.receivingFacility={key:f.key,code:f.code,name:f.name};}
  if(type==='exp'){const cause=String(d.deathCauseCategory||'');must(DEATH_CAUSES.some(x=>x[0]===cause),'Select the death cause category');const autopsy=String(d.autopsy||'');must(['yes','no'].includes(autopsy),'State whether an autopsy is done');
   // 入院 24 小時內或之後由住院時間與死亡時間算，不讓醫師選；HIS 沒給住院時間就記為無法判定。
   const admitted=patient.admissionTime?TZ.millis(patient.admissionTime):NaN,hours=Number.isFinite(admitted)?(TZ.millis(leftAt)-admitted)/3600000:null;
   leave.death={causeCategory:cause,cause:icd(d.deathCause,'Main cause of death',true),within24h:hours===null?null:hours<=24,autopsy,autopsyDiagnosis:autopsy==='yes'?icd(d.autopsyDiagnosis,'Autopsy diagnosis',false):null};}
  const stage=type==='dept-transfer'?'transfer':'discharge';if(!s.diagnoses.some(x=>x.p===p&&x.stage===stage&&x.rank==='primary'&&x.active&&x.key===leave.diagnosis.key)){s.diagnoses.filter(x=>x.p===p&&x.stage===stage&&x.rank==='primary'&&x.active).forEach(x=>{x.active=false;});s.diagnoses.push({id:id('DX'),p,stage,rank:'primary',key:leave.diagnosis.key,diagnosis:clinical.snapshot(leave.diagnosis.key),actor:a,at:at(),active:true});}
  // 轉到已上線的科（2026-10-31）：不離開本系統，病人先在接收科待接收；原科照護到接收為止，接收時才送 3.5。
  if(type==='dept-transfer'){
   // B16（2026-11-08）：轉科一律由原科先填接收房床；上線科之間接收時可確認或改，3.5 帶接收時的房床。
   const toWard=String(d.toWard||'').trim(),toBed=String(d.toBed||'').trim();must(toWard&&toBed,'Enter the receiving ward and bed');
   const live=liveDepartment(s,leave.toDepartment.key);if(live){must(live.name!==patient.department,'The patient is already in '+live.name);must(!patient.pendingReceive,'A transfer is already waiting to be received');patient.pendingReceive={via:'transfer',department:live.name,fromDepartment:patient.department,ward:toWard,bed:toBed,at:leftAt,by:a,leave};break;}
   leave.toWard=toWard;leave.toBed=toBed;}
  patient.dischargedAt=leftAt;patient.dischargeDisposition=type;patient.dischargeBy=a;patient.leave=leave;
  (s.hisOutbox=s.hisOutbox||[]).push(leaveMessage(s,patient,leave,id('HIS'),at()));break;}
 case 'autopsyRecord':{primary();const patient=s.patients.find(x=>x.id===p);const death=patient.leave&&patient.leave.death;must(death&&death.autopsy==='yes','Autopsy diagnosis applies only to a patient who died and had an autopsy');must(archiveState(s,p)==='open','This medical record has already entered the sealing process');
  const k=String(d.autopsyDiagnosis||'').trim(),x=k?clinical.snapshot(k):null;must(x&&x.kind==='icd'&&x.active,'Autopsy diagnosis: select a valid ICD-10 code');death.autopsyDiagnosis={key:x.key,code:x.code,name:x.name,english:x.english||''};death.autopsyRecordedBy=a;death.autopsyRecordedAt=at();break;}
 // ICU 內換床（2026-10-27）：照護醫師或照護護理師登錄，記位置歷程並送 3.4 LocationChanged（示範佇列）。
 // 沒回應的用同一個 Idempotency-Key 重送（D7 §2.4）；拒收過的同一個 key 只會拿回原本的拒收，所以用新 key 再送一次，兩則互相連結。
 case 'hisResend':{const m=(s.hisOutbox||[]).find(x=>x.id===d.id&&x.p===p);must(m,'This HIS message was not found');must(['failed','rejected'].includes(m.status)&&!m.replacedBy,'Only messages HIS has not received can be resent');
  if(m.status==='failed'){m.status='queued';m.resentBy=a;m.resentAt=at();break;}
  const again={...JSON.parse(JSON.stringify(m)),id:id('HIS'),at:at(),status:'queued',attempts:0,sentAt:null,lastError:null,replaces:m.id,resentBy:a,resentAt:at()};m.replacedBy=again.id;s.hisOutbox.push(again);break;}
 case 'bedChange':{const patient=s.patients.find(x=>x.id===p);must(!patient.dischargedAt,'This patient has left; the bed cannot be changed');must(canWrite(s,p,a)||canNurse(s,p,a),'Only doctors or nurses caring for this patient can change the bed');
  const ward=String(d.ward||'').trim(),bed=String(d.bed||'').trim();must(ward&&bed,'Enter the new ward and bed');must(!(ward===patient.ward&&bed===patient.bed),'The new bed is the same as the current bed');
  must(!s.patients.some(x=>x.id!==p&&x.bed===bed&&!x.dischargedAt),'Bed is still occupied by an inpatient: '+bed);
  const when=timestamp(d.at),history=patient.locations=patient.locations||[{ward:patient.ward,bed:patient.bed,from:patient.icuEntryTime||(patient.admitted?patient.admitted+'T00:00':''),by:null}];
  must(!history.at(-1).from||TZ.millis(when)>TZ.millis(history.at(-1).from),'The move must be later than the previous bed assignment');must(!now(s)||TZ.millis(when)<=TZ.millis(now(s)),'The move time cannot be in the future');
  history.push({ward,bed,from:when,by:a,at:at()});patient.ward=ward;patient.bed=bed;
  (s.hisOutbox=s.hisOutbox||[]).push({id:id('HIS'),api:'LocationChanged',section:'3.4',p,at:at(),status:'queued',payload:{encounterNumber:patient.visitNo||patient.encounter||null,archiveId:patient.archiveId||null,departmentCode:patient.department||null,roomCode:ward,bedCode:bed,changeTime:when,changedBy:hisAccount(s,a)}});break;}
 case 'archiveComplete':{primary();const patient=s.patients.find(x=>x.id===p);must(patient.dischargedAt,'Record a demo discharge first');must(archiveState(s,p)==='open','This medical record has already entered the sealing process');const docs=latestNotes(s,p);const transferred=patient.dischargeDisposition==='dept-transfer';must(['admission','progress'].every(t=>docs.some(n=>(n.noteType||(n.soap?'progress':''))===t&&n.reviewStatus==='completed'))&&docs.some(n=>(transferred?n.noteType==='progress'&&n.progressKind==='transfer':n.noteType==='discharge')&&n.reviewStatus==='completed'),transferred?'Required documents: admission note, progress note and transfer note must all be approved':'Required documents: admission note, progress note and discharge summary must all be approved');must(docs.every(n=>n.reviewStatus==='completed'),'Some documents are unapproved or returned');must(!Object.keys(s.drafts).some(k=>k.split(':')[1]===p&&/:(recordWriter|note)/.test(k)),'Some record drafts are held locally; save and approve them first');
  // 文件影像移交表（02/BV-01 B 段 Hồ sơ, phim, ảnh）：各類張數選填；有填張數就要指定接收人，交付人是按封存的人。
  const counts={};FILM_KINDS.forEach(([k])=>{const t=String(d['film:'+k]??'').trim();if(!t)return;must(/^\d+$/.test(t)&&Number(t)<=999,'Sheet counts must be whole numbers from 0 to 999');counts[k]=Number(t);});
  const otherText=String(d.filmOtherText||'').trim();must(!otherText||counts.other!==undefined,'Enter the number of sheets for “Other”');const receiver=String(d.receivedBy||'').trim();
  if(Object.keys(counts).length){must(receiver&&s.people[receiver]&&s.people[receiver].active!==false,'Select who receives the records');must(receiver!==a,'The person handing over cannot also receive the records');}else must(!receiver,'Enter at least one sheet count before naming a receiver');
  const hours=s.settings.graceHours;s.archives[p]={status:hours?'grace':'sealed',actor:a,at:at(),dueAt:new Date(Date.parse(now(s))+hours*3600000).toISOString(),sealedAt:hours?null:at(),signature:signature({id:patient.encounter,version:s.revision+1}),documents:docs.map(n=>({id:n.id,version:n.version})),handover:Object.keys(counts).length?{counts,otherText,handedBy:a,receivedBy:receiver,at:at()}:null};break;}
 case 'voidRecord':case 'restoreRecord':{const kind=String(d.kind||''),table=VOIDABLE[kind];must(table,'Invalid record type');const voiding=action==='voidRecord',raw=String(d.id||'');
  const entryId=kind==='report'&&raw.includes('#')?raw:null,x=get(table,entryId?raw.split('#')[0]:raw),reason=text(d.reason,voiding?'Reason for voiding':'Reason for restoring');
  if(entryId){const e=(x.voidedEntries||[]).find(v=>v.id===entryId&&!v.restored);must(e&&!voiding,'Voided entry not found');must(e.entry.enteredBy===a,'Only the author can restore this record');must(x.status==='pending','A newer result has already been entered for this order; this entry cannot be restored');
   x.backfill={before:pickStamp(x)};Object.assign(x,copy(e.entry));e.restored={actor:a,at:at(),reason};break;}
  must(authorOf(kind,x)===a,voiding?'Only the author can void this record':'Only the author can restore this record');
  if(['note','surgery','periop'].includes(kind))must(!s[table].some(v=>v.replaces===x.id),'Only the latest version can be voided or restored');
  if(voiding){must(!x.voided,'This record is already voided');
   if(kind==='report'){must(x.entry==='manual'&&x.status==='returned','Only manually entered results can be voided; results from the HIS are read-only');
    if(x.backfill){x.voidedEntries=x.voidedEntries||[];x.voidedEntries.push({id:x.id+'#'+(x.voidedEntries.length+1),entry:pickStamp(x),voided:{actor:a,at:at(),reason,statusBefore:x.status}});Object.assign(x,copy(x.backfill.before));delete x.backfill;x.version=(x.version||1)+1;break;}
    x.voided={actor:a,at:at(),reason,statusBefore:x.status};x.status='entered-in-error';break;}
   if(kind==='observation')must(x.kind!=='Admission weight','Admission weight comes from the HIS and cannot be voided');
   x.voided={actor:a,at:at(),reason,statusBefore:x.status||null};break;}
  must(x.voided,'This record is not voided');x.voidHistory=[...(x.voidHistory||[]),{...x.voided,restoredBy:a,restoredAt:at(),restoreReason:reason}];if(kind==='report')x.status=x.voided.statusBefore||'returned';delete x.voided;break;}
 default:return false;
 }
 return true;
}
root.ICUWorkflow={init,relations,attending,currentStay,stayAt,assigned,canResendHis,canOrder,isAttending,canWrite,canNurse,primaryNurseOf,isIcuNurse,hisAccount,serviceRequestMessage,prescriptionMessage,canSurgery,canWriteProcedure,isDeptStaff,liveDepartment,activeFlags,flagView,canMaintainDept,archiveState,latestNotes,noteLabel,labels,now,guard,handle,DISPOSITIONS,LEAVE_TYPES,TREATMENT_RESULTS,TRANSFER_LEVELS,DEATH_CAUSES,GENDERS,genderLabel,PATHOLOGY,FILM_KINDS,licenseOf,entryMissing,VOIDABLE,authorOf,pickStamp,voidedRecords};
if(typeof module!=='undefined')module.exports=root.ICUWorkflow;
})(globalThis);
