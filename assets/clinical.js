/* Read-only catalog projections and explicitly synthetic data, not a clinical rules engine. */
(function(root){
  'use strict';
  const catalog=typeof module!=='undefined'?require('./catalog.js'):root.ICUCatalog;
  const TZ=typeof module!=='undefined'?require('./timezone.js'):root.ICUTimeZone;
  const byKey=new Map(catalog.entries.map(e=>[e.key,e]));
  const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  const index=new Map(catalog.entries.map(e=>[e.key,fold([e.code,e.name,e.zh,e.english,e.ingredient,e.atc,e.inputCode,e.reportCode].join(' '))]));
  function search(kind,q='',page=0){
    const words=fold(q).trim().split(/\s+/).filter(Boolean);
    const rows=catalog.entries.filter(e=>(kind==='lab'?e.kind==='service'&&e.isLab:e.kind===kind)&&words.every(w=>index.get(e.key).includes(w)));
    const pages=Math.max(1,Math.ceil(rows.length/20)), current=Math.min(Math.max(0,page),pages-1);
    return {rows:rows.slice(current*20,current*20+20),count:rows.length,page:current,pages};
  }
  // Folded keyword match against one catalog key; shared by the categorised order picker.
  function matches(key,q=''){const hay=index.get(key);if(hay===undefined)return false;const words=fold(q).trim().split(/\s+/).filter(Boolean);return words.every(w=>hay.includes(w));}
  function entry(key){return byKey.get(key)||null;}
  function snapshot(key){const e=byKey.get(key);return e?JSON.parse(JSON.stringify({...e,catalogVersion:catalog.version,sourceSHA256:catalog.sources[e.source]?.sha256})):null;}
  const millis=TZ.millis;
  // The demo has a fixed "now"; every relative range is measured back from it.
  // EMR整合MDT demo（2026-11-10）：示範「現在」改由資料集給（2026-11-04）；沒有資料集時照原型。
  const DEMO_NOW=(root.ICUDemoSeed&&root.ICUDemoSeed.now)||'2026-08-31T19:00';
  const DEMO_DAY=DEMO_NOW.slice(0,10);
  const shiftDate=n=>{const d=new Date(Date.UTC(+DEMO_DAY.slice(0,4),+DEMO_DAY.slice(5,7)-1,+DEMO_DAY.slice(8,10)+n));return d.toISOString().slice(0,10);};
  const relativeDays={'1d':1,'3d':3,'5d':5,'7d':7,'14d':14,'30d':30,'1m':30,'3m':90,'6m':180,'1y':365,'2y':730};
  // 班別時間（2026-10-28）：由系統班別表依班別代碼定義（G9 care_shift），不記在員工資料；+1 表示隔天結束。
  const SHIFT_TIMES={D1:['07:00','19:00'],D2:['19:00','07:00+1'],N1:['07:30','15:30'],N2:['15:30','23:30'],N3:['23:30','07:30+1'],OR:['07:00','19:00']};
  const shiftTimes=actor=>(actor&&SHIFT_TIMES[actor.shift])||null;
  // 交班每班獨立一筆（2026-11-01）：某時刻屬於這個人哪一班，回傳那一班開始的醫院牆上時間；沒有班別或時間無效回傳 null。
  const shiftStartOf=(actor,when)=>{const t=shiftTimes(actor),ms=millis(String(when||''));if(!t||!Number.isFinite(ms))return null;const w=TZ.wall(ms).slice(0,16),day=w.slice(0,10);if(w.slice(11,16)>=t[0])return day+'T'+t[0];
    const prev=new Date(Date.UTC(+day.slice(0,4),+day.slice(5,7)-1,+day.slice(8,10)-1)).toISOString().slice(0,10);return prev+'T'+t[0];};
  function bounds(window,actor){
    if(!window||window==='all')return null;
    if(relativeDays[window]!==undefined){const end=millis(DEMO_NOW)+3600000;return [end-relativeDays[window]*86400000,end];}
    if(window==='shift'&&actor){const t=shiftTimes(actor);if(t)return [millis(DEMO_DAY+'T'+t[0]),millis((t[1].includes('+1')?shiftDate(1):DEMO_DAY)+'T'+t[1].replace('+1',''))];}
    return [millis(shiftDate(-1)+'T19:00'),millis(DEMO_DAY+'T19:00')];
  }
  function rangeBounds(range){return bounds(range,null);}
  // 住院天數與術後天數（2026-10-24）：置頂列與時間軸日標頭共用。一律用醫院牆上日期；入院當天是第 1 天，手術當天是 POD 0。
  const dayDiff=(from,to)=>{const a=millis(String(from).slice(0,10)+'T00:00'),b=millis(String(to).slice(0,10)+'T00:00');return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000):null;};
  function admissionDay(admitted,day=DEMO_NOW){if(!/^\d{4}-\d\d-\d\d/.test(String(admitted||'')))return null;const d=dayDiff(admitted,day);return d===null?null:Math.max(1,d+1);}
  // 手術日：病人主檔的手術日與手動登錄的手術紀錄（作廢、已被修正的不算）一起比，取不晚於當天的最近一次。
  function surgeryDates(state,patient){const all=state.surgeries||[];return [patient.surgeryDate,patient.surgery&&patient.surgery.start,...all.filter(x=>x.p===patient.id&&!x.voided&&x.performedAt&&!all.some(y=>y.replaces===x.id)).map(x=>x.performedAt)].map(x=>String(x||'').slice(0,10)).filter(x=>/^\d{4}-\d\d-\d\d$/.test(x)).sort();}
  function lastSurgery(state,patient,day=DEMO_NOW){const d=String(day).slice(0,10);return surgeryDates(state,patient).filter(x=>x<=d).at(-1)||'';}
  function postOpDay(state,patient,day=DEMO_NOW){const date=lastSurgery(state,patient,day);return date?{pod:dayDiff(date,day),date}:null;}
  // 目前診斷：最新一次目標設定帶的診斷，其次是主檔 ICD，再其次是問題描述；都沒有就回空字串，由畫面標示未提供。
  function currentDiagnosis(state,patient){const latest=(state.goals||[]).filter(g=>g.p===patient.id).sort((a,b)=>millis(b.at)-millis(a.at))[0];if(latest&&latest.diagnosis)return [latest.diagnosis.code,latest.diagnosis.english||latest.diagnosis.name].filter(Boolean).join(' · ');if(patient.icd)return [patient.icd.code,patient.icd.english||patient.icd.name].filter(Boolean).join(' · ');return (latest&&latest.problem)||patient.problem||'';}
  const within=(at,b)=>!b||Number.isFinite(millis(at))&&millis(at)>=b[0]&&millis(at)<b[1];
  const units={'Heart rate':'/min','Temperature':'°C','Respiratory rate':'/min','SpO₂':'%','Weight':'kg','Height':'cm','Head circumference':'cm','Chest circumference':'cm','Intake':'mL','Output':'mL'};
  // 最近一筆量測（2026-10-27）：入院病歷身體診察與 BMI 用；作廢與入院體重不算。
  function latestMeasure(state,p,kind){return flatten((state.observations||[]).filter(o=>o.p===p&&!o.voided&&o.kind!=='Admission weight')).filter(o=>o.kind===kind&&o.value!==null&&o.value!==undefined&&o.value!=='').sort((a,b)=>millis(b.at)-millis(a.at))[0]||null;}
  // BMI 只即時算、不存：體重 kg ÷ 身高 m²，取一位小數；缺任一項或數值不合理就不算。
  function bmi(weight,height){const w=Number(weight),h=Number(height)/100;return Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0?Math.round(w/(h*h)*10)/10:null;}
  function flatten(observations){return observations.flatMap(o=>o.kind==='Blood pressure'?(o.components||[]).map(c=>({...o,id:o.id+':'+c.definition,sourceId:o.id,kind:c.definition==='TDL.0094'?'Systolic BP':'Diastolic BP',value:c.value,unit:'mmHg'})):[o]);}
  // [shortId, 中文名, 單位, 展示數值, 參考範圍文字]
  // 參考範圍 is DISPLAY ONLY. Abnormal/normal is decided solely by the source flag in resultClass().
  const labDefs={
    'service:1020':[['WBC','White blood cells', '10^9/L', [11.2,10.4,9.8],'4.0 - 10.0'],['Hb','Hemoglobin','g/dL',[12.1,11.9,12.0],'M: 13.5-17.5, F: 12.0-16.0'],['PLT','Platelets','10^9/L',[210,205,208],'150 - 400']],
    'service:646':[['Na','Sodium','mmol/L',[138,139,140],'136 - 145'],['K','Potassium','mmol/L',[4.1,null,4.0],'Plasma: 3.4 - 4.5'],['Cl','Chloride','mmol/L',[103,104,104],'98 - 107']],
    'service:680':[['Cr','Creatinine','µmol/L',[76,78,75],'M: 62-115, F: 53-97']],
    'service:11352':[['CRP','C-reactive protein','mg/L',[24,22,19],'< 5']],
    'service:685':[['Glucose','Blood glucose','mmol/L',[5.9,6.1,5.8],'Fasting 3.9 - 5.6']],
    'service:537':[['pH','pH','',[7.39,7.40,7.41],'7.35 - 7.45'],['PaCO2','PaCO₂','mmHg',[39,40,38],'35 - 45']]
  };
  const labMeta={
    'service:1020':{category:'Hematology', specimen:'Hematology'},
    'service:646':{category:'Biochemistry', specimen:'Hematology'},
    'service:680':{category:'Biochemistry', specimen:'Hematology'},
    'service:11352':{category:'Biochemistry', specimen:'Hematology'},
    'service:685':{category:'Biochemistry', specimen:'Hematology'},
    'service:537':{category:'Blood gas', specimen:'Arterial blood'}
  };
  if(root.ICUDemoSeed){Object.assign(labDefs,root.ICUDemoSeed.labDefs||{});Object.assign(labMeta,root.ICUDemoSeed.labMeta||{});}
  const labCategories=['Biochemistry','Hematology','Blood gas','Microbiology','Imaging'];
  const labSpecimens=['Hematology','Arterial blood','Urine','Sputum','N/A'];
  // 檢驗品項的分類與檢體：先讀維護檔（lab_item_definition），沒有才用內建示範對照（2026-10-18）。
  function labInfo(key,state){const base=labMeta[key]||{category:'Uncategorized', specimen:'Not provided by source'};const ext=state&&state.master&&state.master.labItem&&state.master.labItem[key];if(!ext)return base;return {category:ext.lab_category||base.category, specimen:ext.specimen_code||base.specimen, reference:ext.reference_text||null, referenceUnit:ext.reference_unit_code||null, turnaroundMinutes:ext.turnaround_minutes??null, maintained:true};}
  const decimalsOf=v=>{const t=String(v);return t.includes('.')?t.split('.')[1].length:0;};
  const drift=(base,i)=>{if(base===null||base===undefined)return null;const pct=((i*7)%11-5)/100;const d=decimalsOf(base);return Number((base*(1+pct)).toFixed(d));};
  // pH 是對數尺度，±5% 會漂到 7.0 以下或 7.7 以上；改用 ±0.10（2026-11-02）。
  const phDrift=(base,i)=>base===null||base===undefined?null:Number((base+(((i*7)%11)-5)*0.02).toFixed(2));
  // 示範來源旗標（2026-11-02）：虛構檢驗系統依數值與參考範圍給 H／L／N，跟真實回傳一致；系統本身仍只讀來源旗標，不自己判斷。
  // 分性別的範圍取兩者的最寬界限；「< x」到 x 就算高。
  const rangeOf=ref=>{const t=String(ref||''),lt=t.match(/^\s*<\s*([\d.]+)/);if(lt)return {high:Number(lt[1]),strict:true};const all=[...t.matchAll(/([\d.]+)\s*-\s*([\d.]+)/g)];return all.length?{low:Math.min(...all.map(m=>Number(m[1]))),high:Math.max(...all.map(m=>Number(m[2])))}:null;};
  const sourceFlag=c=>{const v=Number(c.value),r=rangeOf(c.reference);if(c.value===null||c.value===undefined||c.value===''||!Number.isFinite(v)||!r)return null;if(r.strict?v>=r.high:v>r.high)return 'H';return r.low!==undefined&&v<r.low?'L':'N';};
  function demoComponents(key,i=2){
    const info=labInfo(key);
    return (labDefs[key]||[]).map(([id,name,unit,values,reference])=>({
      id:'DEMO-'+id, name, unit,
      value:id==='pH'?phDrift(values[i%values.length],i):drift(values[i%values.length],i),
      reference:reference||null, category:info.category, specimen:info.specimen,
      interpretation:null, mapping:'Product demo mapping; not an approved HIS indicator code'
    }));
  }
  const demoDataVersion='20261108-icumon';
  // Deterministic (never Math.random) so repeated enrich() calls produce identical demo history.
  const wave=(i,period,amp)=>Math.sin(i/period*Math.PI*2)*amp;
  const stamp=(dayBack,hour)=>TZ.wall(millis('2026-08-31T00:00')-dayBack*86400000+hour*3600000);
  // Vitals deep enough that the 1/3/5/7 day and 1 month ranges actually differ.
  const vitalPlan=[
    ['A',30],['B',30],['C',30],['D',30],['E',30],['F',30],['G',30],['H',30],['I',30],['J',30]
  ];
  const vitalShapes=[
    ['Heart rate',96,[10,4]],['Temperature',36.8,[0.5,0.2]],['Respiratory rate',18,[3,1]],['SpO₂',97,[1.5,0.6]]
  ];
  function addLongVitals(s){
    vitalPlan.forEach(([pid,days])=>{
      if(!s.patients.some(x=>x.id===pid))return;
      for(let d=days;d>=0;d--)[2,8,14,20].forEach((hour,slot)=>{
        if(d===0&&hour>14)return; // 展示時鐘 2026-08-31 19:00；當天只到 14:00
        const at=stamp(d,hour), step=d*4+slot;
        vitalShapes.forEach(([kind,base,[slow,fast]],j)=>{
          const id='DEMOH-'+pid+'-'+j+'-'+d+'-'+slot;
          if(s.observations.some(x=>x.id===id))return;
          const raw=base+wave(step,26,slow)+wave(step,4,fast);
          const value=Number(raw.toFixed(kind==='Temperature'?1:0));
          s.observations.push({id,p:pid,kind,value,unit:units[kind],at,actor:'nurse',source:'Fictional historical baseline; not device data'});
        });
        const bpId='DEMOH-'+pid+'-BP-'+d+'-'+slot;
        if(!s.observations.some(x=>x.id===bpId))s.observations.push({id:bpId,p:pid,kind:'Blood pressure',value:null,unit:'mmHg',at,actor:'nurse',source:'Fictional historical baseline; not device data',
          components:[{definition:'TDL.0094',value:Math.round(122+wave(step,22,12)+wave(step,5,4))},{definition:'TDL.0095',value:Math.round(74+wave(step,22,7)+wave(step,5,3))}]});
      });
    });
  }
  // 示範 ICU 監測（2026-11-08，N03 分軌）：A 術後兩天、每 2 小時一欄——呼吸器 SIMV → PSV → 拔管改 HFNC，FiO₂、PEEP、意識、CVP、尿量與點滴；
  // 虛構資料，不是設備資料；讓分軌疊圖看得出多項一起變化，以及缺值（拔管後沒有 PEEP）斷線。
  function addIcuMonitoring(s){
    if(!s.patients.some(x=>x.id==='A'))return;
    const add=(slot,at,kind,unit,v)=>{const id='DEMOM-A-'+kind+'-'+slot;if(s.observations.some(x=>x.id===id))return;s.observations.push({id,p:'A',kind,unit,at,actor:'nurse',source:'Fictional ICU monitoring baseline; not device data',entry:'flowsheet',...v});};
    let slot=0;
    for(let d=2;d>=0;d--)for(let hour=0;hour<24;hour+=2){
      if((d===2&&hour<20)||(d===0&&hour>18))continue;
      const at=stamp(d,hour),i=slot++,mode=i<16?'SIMV':i<19?'PSV':'HFNC';
      add(i,at,'Ventilation mode','',{value:null,code:mode});
      add(i,at,'FiO₂','%',{value:mode==='SIMV'?(i<8?45:40):mode==='PSV'?35:30});
      if(mode!=='HFNC')add(i,at,'PEEP','cmH₂O',{value:mode==='SIMV'?6:5});
      add(i,at,'Consciousness','',{value:null,code:mode==='SIMV'?'SED':mode==='PSV'?'V':'A'});
      add(i,at,'CVP','mmHg',{value:Math.round(10+wave(i,9,2)+wave(i,3,0.6))});
      add(i,at,'Urine','mL',{value:Math.round(40+wave(i,7,10))});
      add(i,at,'IV fluids','mL',{value:50});
    }
  }
  // Lab draws spread over two years so 14天內／一個月／三個月／六個月／一年／二年 differ.
  const labHistoryPlan={
    A:{keys:['service:1020','service:646','service:680','service:11352','service:685','service:537'], daysBack:[1,3,6,10,18,45,120,300,600]},
    B:{keys:['service:1020','service:646','service:537'], daysBack:[1,5,25,90]},
    C:{keys:['service:1020','service:685'], daysBack:[2,12,60]},
    D:{keys:['service:646','service:680'], daysBack:[1,8,40]}
  };
  function addLabHistory(s){
    Object.entries(labHistoryPlan).forEach(([pid,plan])=>{
      if(!s.patients.some(x=>x.id===pid))return;
      plan.keys.forEach((key,j)=>plan.daysBack.forEach((dayBack,i)=>{
        const id='DEMOH-L-'+pid+'-'+j+'-'+i,old=s.reports.find(x=>x.id===id);
        if(old&&old.sourceFlags===2)return;
        const at=stamp(dayBack,9), collectedAt=stamp(dayBack,7);
        const components=demoComponents(key,i+j).map((c,k)=>{
            // Flags are supplied by the (synthetic) source, exactly as a real feed would; resultClass() reads only these.
            // 每 11 筆留一筆沒旗標（只留在範圍內的值），示範來源沒給旗標時顯示「未判讀」。
            const n=i+j+k;
            const flag=sourceFlag(c);return {...c,interpretation:n%11===0&&flag==='N'?null:flag,interpretationSource:'Fictional source flag (not system-determined)'};
          });
        // 2026-11-02 之前的示範歷史旗標是輪流指派、跟數值無關；只重算這批虛構報告的數值與旗標，已讀、處理紀錄保留。
        if(old){old.components=components;old.sourceFlags=2;return;}
        s.reports.push({id,p:pid,kind:'Lab',status:'returned',version:1,
          text:'Fictional historical result; B item is real, values and sub-item mapping are demo data.',
          at,collectedAt,seen:[],processed:[],catalog:snapshot(key),sourceFlags:2,
          components,order:null,
          source:'Product demo historical data; not linked to a HIS order'});
      }));
    });
  }
  // 示範體重（2026-10-18）：入院體重來自入院資料（TDL.1285），體重量測是護理量測（TDL.0097）；虛構數值，不是院方資料。
  const demoWeights=[['B','Admission weight',18.5,'2026-08-28T10:00'],['G','Admission weight',32,'2026-08-20T10:00'],['J','Admission weight',9.8,'2026-08-12T10:00'],
    ['B','Weight',17.9,'2026-08-31T08:00'],['E','Weight',24.6,'2026-08-30T08:00'],['F','Weight',15.2,'2026-08-31T08:00']];
  function addDemoWeights(s){demoWeights.forEach(([pid,kind,value,at])=>{const id='DEMO-W-'+pid+'-'+(kind==='Weight'?'M':'ADM');
    if(!s.patients.some(x=>x.id===pid)||s.observations.some(x=>x.id===id))return;
    s.observations.push(kind==='Weight'?{id,p:pid,kind,value,unit:'kg',at,actor:'nurse',source:'Fictional demo weight; not device data'}:{id,p:pid,kind,definition:'TDL.1285',value,unit:'kg',at,actor:null,source:'Fictional admission data (demo); not HIS data'});});}
  // 示範生長歷史（2026-10-24）：一年內每季一筆身高、頭圍（TDL.0089、TDL.0091），讓生長曲線看得出形狀；虛構數值，不是 HIS 門診紀錄。
  // 體重歷史只給原本就有較新體重的病人，最新一筆不變，劑量體重（取最新）不受影響；I 沒有出生日期，示範無法依年齡作圖。
  const growthDays=[365,270,180,90];
  const demoGrowth={
    A:[null,[154.5,156,157.5,159],[54,54.1,54.2,54.3]],
    B:[[16.3,16.8,17.3,17.8],[104,105.6,107.2,108.8],[49.9,50,50.2,50.3]],
    C:[null,[121,122.4,123.9,125.3],[51.4,51.5,51.6,51.7]],
    D:[null,[160,161.3,162.6,163.8],[54.5,54.6,54.7,54.8]],
    E:[[22,22.7,23.4,24],[116,117.5,119,120.5],[50.9,51,51.2,51.3]],
    F:[[13.2,13.7,14.2,14.7],[91,93,95,96.8],[48.5,48.8,49,49.2]],
    G:[[29,29.8,30.6,31.4],[134.5,136,137.4,138.8],[52.4,52.5,52.6,52.7]],
    H:[null,[76,79,81.8,84.5],[46,46.6,47.1,47.6]],
    J:[[4.6,6.9,8.2,9.2],[56,63.5,68.5,72.5],[38.5,42,44,45.3]]
  };
  function addDemoGrowth(s){Object.entries(demoGrowth).forEach(([pid,rows])=>{if(!s.patients.some(x=>x.id===pid))return;
    [['Weight','W'],['Height','H'],['Head circumference','HC']].forEach(([kind,key],j)=>(rows[j]||[]).forEach((value,i)=>{const id='DEMO-G-'+pid+'-'+key+'-'+i;
      if(!s.observations.some(x=>x.id===id))s.observations.push({id,p:pid,kind,value,unit:units[kind],at:stamp(growthDays[i],10),actor:null,source:'Fictional growth history (demo); not HIS outpatient data'});}));});}
  function enrich(s){
    s.careFocuses=Array.isArray(s.careFocuses)?s.careFocuses:[];
    s.consultations=Array.isArray(s.consultations)?s.consultations:[];
    s.favorites=s.favorites&&typeof s.favorites==='object'?s.favorites:{};
    // EMR整合MDT demo：資料集自己完整，不加原型的合成歷史（原型的 A–J 病人不存在）。
    if(root.ICUDemoSeed){s.demoDataVersion=demoDataVersion;s.demoWorkflowVersion=workflowVersion;s.demoCatalogVersion=catalog.version;return s;}
    if(s.demoDataVersion===demoDataVersion)return enrichWorkflow(s);
    // Add synthetic baseline records only. Never overwrite prior actions, reports, notes or identities.
    const times=['2026-08-30T20:00','2026-08-31T00:00','2026-08-31T04:00','2026-08-31T12:00','2026-08-31T16:00','2026-08-31T18:00'];
    const metrics=[['Heart rate',[108,106,104,99,97,96]],['Temperature',[37.1,37.2,37.3,37.1,37,36.9]],['Respiratory rate',[20,20,19,19,18,18]],['SpO₂',[97,98,97,98,98,98]]];
    metrics.forEach(([kind,values],j)=>times.forEach((at,i)=>{const id='DEMO-O-'+j+'-'+i;if(!s.observations.some(x=>x.id===id))s.observations.push({id,p:'A',kind,value:values[i],unit:units[kind],at,actor:'nurse',source:'Fictional demo baseline; not device data'});}));
    times.forEach((at,i)=>{const id='DEMO-BP-'+i;if(!s.observations.some(x=>x.id===id))s.observations.push({id,p:'A',kind:'Blood pressure',value:null,unit:'mmHg',at,actor:'nurse',source:'Fictional demo baseline; not device data',components:[{definition:'TDL.0094',value:120+i},{definition:'TDL.0095',value:72+i}]});});
    ['service:1020','service:646','service:680','service:11352','service:685'].forEach((key,j)=>['2026-08-31T00:30','2026-08-31T08:30','2026-08-31T16:30'].forEach((at,i)=>{
      const id='DEMO-L-'+j+'-'+i,old=s.reports.find(x=>x.id===id);
      // 2026-11-02：示範來源依參考範圍給旗標；之前沒旗標的這批只補旗標，數值不動。
      const flagged=list=>list.map(c=>({...c,interpretation:sourceFlag(c),interpretationSource:'Fictional source flag (not system-determined)'}));
      if(old){if(old.sourceFlags!==2&&Array.isArray(old.components)){old.components=flagged(old.components);old.sourceFlags=2;}return;}
      s.reports.push({id,p:'A',kind:'Lab',status:'returned',version:1,text:'Fictional multi-item result; B item is real, results and sub-item mapping are demo data.',at,collectedAt:at.replace(':30',':00'),seen:[],processed:[],catalog:snapshot(key),components:flagged(demoComponents(key,i)),sourceFlags:2,order:null,source:'Product demo data; not linked to a HIS order'});
    }));
    addLongVitals(s);
    addIcuMonitoring(s);
    addLabHistory(s);
    addDemoWeights(s);
    addDemoGrowth(s);
    s.demoCatalogVersion=catalog.version;
    s.demoDataVersion=demoDataVersion;
    return enrichWorkflow(s);
  }
  const workflowVersion='20261028-tl';
  function enrichWorkflow(s){
    // Upgrade only untouched legacy placeholder examples. User-created or edited orders are never replaced.
    const oral=snapshot('medication:44978'), oralRoute=snapshot('route:913'), oralNext=snapshot('medication:50631');
    const injection=snapshot('medication:43636'), injectionRoute=snapshot('route:996316');
    const m1=s.orders.find(o=>o.id==='M1');
    if(m1&&m1.name==='Demo medication A (not a prescription)')Object.assign(m1,{name:'Ibufar 200 (Ibuprofen 200 mg)',catalog:{...oral,zh:'Ibufar 200 (Ibuprofen 200 mg)'},dose:'200 mg (1 tablet)',route:'Oral',routeCatalog:oralRoute,frequency:'BID (twice daily)',orderedAt:m1.orderedAt||'2026-08-31T07:45',author:m1.author||'doctor',source:'Fictional existing order; drug item taken from B drug catalog snapshot; not clinical advice'});
    const m0=s.orders.find(o=>o.id==='M0');
    if(m0&&m0.name==='Stopped demo medication')Object.assign(m0,{name:'Vinrolac 30 mg (Ketorolac 30 mg/2 mL)',catalog:{...injection,zh:'Vinrolac 30 mg (Ketorolac 30 mg/2 mL)'},dose:'30 mg (2 mL)',route:'Intravenous injection (IV)',routeCatalog:injectionRoute,frequency:'QID (4 times daily)',orderedAt:m0.orderedAt||'2026-08-30T06:45',author:m0.author||'doctor',source:'Fictional historical order; drug item taken from B drug catalog snapshot; not clinical advice'});
    s.executions.filter(e=>['M0','M1'].includes(e.order)&&e.actual==='1 demo unit'&&e.route==='Demo route').forEach(e=>Object.assign(e,e.order==='M1'?{actual:'200 mg (1 tablet)',route:'Oral'}:{actual:'30 mg (2 mL)',route:'Intravenous injection (IV)'}));
    if(!s.orders.some(o=>o.id==='M2'))s.orders.push({id:'M2',p:'A',version:1,name:'Vinrolac 30 mg (Ketorolac 30 mg/2 mL)',catalog:{...injection,zh:'Vinrolac 30 mg (Ketorolac 30 mg/2 mL)'},kind:'medication',dose:'30 mg (2 mL)',route:'Intravenous injection (IV)',routeCatalog:injectionRoute,frequency:'QID (4 times daily)',orderedAt:'2026-08-31T07:50',start:'2026-08-31T08:00',end:null,clinical:'active',local:'signed',his:'accepted',occurrence:'M2-V1-D1',author:'doctor',progressNote:'DEMO-SOAP-0831',source:'Fictional order due for administration; drug item taken from B drug catalog snapshot; not clinical advice'});
    if(!s.orders.some(o=>o.id==='M3'))s.orders.push({id:'M3',p:'A',version:1,name:'Efferalgan 300 mg (Paracetamol)',catalog:{...oralNext,zh:'Efferalgan 300 mg (Paracetamol)'},kind:'medication',dose:'300 mg (1 tablet)',route:'Oral',routeCatalog:oralRoute,frequency:'BID (twice daily)',orderedAt:'2026-08-31T08:05',start:'2026-08-31T08:00',end:null,clinical:'active',local:'signed',his:'accepted',occurrence:'M3-V1-D1',author:'doctor',progressNote:'DEMO-SOAP-0831',source:'Fictional order due for administration; drug item taken from B drug catalog snapshot; not clinical advice'});
    // 檢查（影像、內視鏡、超音波、心電圖）示範報告（2026-09-11 R6）：文字結果、無數值子項；與檢驗分頁分開呈現。冪等：已存在就不重加。
    const exams=[
      {id:'DEMO-X-A-01',p:'A',examType:'Imaging (X-ray)',key:'service:2512',zh:'Chest X-ray, frontal (bedside)',at:'2026-08-31T07:40',collectedAt:'2026-08-31T07:10',text:'Bedside chest X-ray (frontal): both lung fields well expanded; mild infiltrate in the right lower lung field; cardiac silhouette within normal size; central venous catheter tip in the superior vena cava; no pneumothorax or pleural effusion.',impression:'Mild right lower lung infiltrate; clinical follow-up recommended.',reporter:'Demo radiologist'},
      {id:'DEMO-US-A-01',p:'A',examType:'Ultrasound',key:'service:8919',zh:'Bedside ultrasound (cardiac)',at:'2026-08-30T19:50',collectedAt:'2026-08-30T19:30',text:'Bedside echocardiography: LV systolic function visually estimated at about 55%, no obvious regional wall motion abnormality; no pericardial effusion; IVC diameter about 1.8 cm, respiratory variation under 50%.',impression:'Systolic function preserved; volume status acceptable.',reporter:'Demo intensivist'},
      {id:'DEMO-EGD-A-01',p:'A',examType:'Endoscopy (gastroscopy)',key:'service:4592',zh:'Upper GI endoscopy (gastroscopy)',at:'2026-08-31T11:20',collectedAt:'2026-08-31T10:30',text:'Upper GI endoscopy: esophageal mucosa normal, no varices; one superficial ulcer of about 0.8 cm in the gastric antrum, Forrest III, no active bleeding; duodenal bulb and second part normal.',impression:'Superficial antral ulcer (Forrest III); PPI therapy recommended with follow-up in 6–8 weeks.',reporter:'Demo gastroenterologist'},
      {id:'DEMO-ECG-A-01',p:'A',examType:'ECG',key:'service:8070',zh:'Bedside 12-lead ECG',at:null,collectedAt:null,text:null,pending:true},
      {id:'DEMO-X-B-01',p:'B',examType:'Imaging (X-ray)',key:'service:2512',zh:'Chest X-ray, frontal (bedside)',at:'2026-08-31T06:30',collectedAt:'2026-08-31T06:05',text:'Bedside chest X-ray: diffuse bilateral infiltrates, predominantly in the lower lung fields; endotracheal tube tip about 3 cm above the carina; no pneumothorax.',impression:'Bilateral infiltrates, consistent with the respiratory support condition.',reporter:'Demo radiologist'}
    ];
    exams.forEach(x=>{if(s.reports.some(r=>r.id===x.id)||!s.patients.some(p=>p.id===x.p))return;s.reports.push({id:x.id,p:x.p,kind:'Exam',examType:x.examType,status:x.pending?'pending':'returned',version:1,at:x.at,collectedAt:x.collectedAt,seen:[],processed:[],catalog:{...snapshot(x.key),zh:x.zh},components:[],text:x.text,impression:x.impression||null,reporter:x.reporter||null,order:null,source:'Fictional exam text report; item taken from B catalog snapshot; not integrated with PACS / endoscopy system'});});
    // 寫病歷引用區示範（2026-10-24）：昨天開、今天停的 M0 補三筆給藥紀錄（一筆暫停附原因），再加一筆連續輸注與兩筆護理速率紀錄。虛構資料；同 id 已有就不再加，不動使用者的紀錄。
    if(s.orders.some(o=>o.id==='M0'&&o.p==='A'))[['DEMO-E-M0-1','2026-08-30T11:00','done',''],['DEMO-E-M0-2','2026-08-30T17:00','held','Systolic BP 78 mmHg; held per doctor on duty'],['DEMO-E-M0-3','2026-08-30T23:00','done','']].forEach(([id,at,status,reason])=>{
      if(!s.executions.some(e=>e.id===id))s.executions.push({id,p:'A',order:'M0',version:1,occurrence:'M0-V1-D1',at,recorded:at.replace(':00',':05'),actor:'nurse',status,actual:status==='done'?'30 mg (2 mL)':null,route:status==='done'?'Intravenous injection (IV)':null,reason,review:null});});
    // 舊示範醫囑沒帶開立時間（C1、DEMO-LAB-ORDER-01）：引用區要寫開立時間，只在沒有時補上示範值。
    [['C1','2026-08-31T07:40'],['DEMO-LAB-ORDER-01','2026-08-31T07:55']].forEach(([id,at])=>{const o=s.orders.find(x=>x.id===id&&x.p==='A');if(o&&!o.orderedAt)o.orderedAt=at;});
    const fluid=snapshot('medication:33620'),fluidRoute=snapshot('route:994086');
    if(fluid&&s.patients.some(p=>p.id==='A')&&!s.orders.some(o=>o.id==='DEMO-INF-A-01'))s.orders.push({id:'DEMO-INF-A-01',p:'A',version:1,name:'Natri clorid 0.9% 500 mL (Sodium chloride 0.9%)',catalog:{...fluid,zh:'Natri clorid 0.9% 500 mL (Sodium chloride 0.9%)'},kind:'medication',dose:'500 mL',route:'Intravenous infusion',routeCatalog:fluidRoute,frequency:'Continuous infusion',dosing:{mode:'infusion',frequency:'Continuous infusion',rate:'40 mL/h',concentration:null},orderedAt:'2026-08-31T06:30',start:'2026-08-31T06:45',end:null,clinical:'active',local:'signed',his:'accepted',occurrence:'DEMO-INF-A-01-V1-D1',author:'doctor',progressNote:'DEMO-SOAP-0831',source:'Fictional continuous infusion order; drug item taken from B drug catalog snapshot; not clinical advice'});
    if(s.orders.some(o=>o.id==='DEMO-INF-A-01'))[['DEMO-INF-A-01-C1','2026-08-31T07:00',40,'Running as ordered'],['DEMO-INF-A-01-C2','2026-08-31T08:45',35,'Pump showed 35 mL/h; reset to the ordered 40 mL/h']].forEach(([id,at,rate,reason])=>{
      if(!s.infusionChecks.some(x=>x.id===id))s.infusionChecks.push({id,p:'A',order:'DEMO-INF-A-01',orderVersion:1,rate,unit:'mL/h',at,actor:'nurse',reason});});
    if(!s.consultations.some(c=>c.id==='DEMO-CONS-01'))s.consultations.push({id:'DEMO-CONS-01',p:'A',specialty:'Cardiology',assignee:'consultCardiology',question:'Please review the post-op care data for this admission and provide cardiology follow-up recommendations (fictional demo).',requester:'doctor',requestedAt:'2026-08-31T08:20',status:'requested',recommendation:null,responder:null,respondedAt:null,source:'Fictional consult workflow demo'});
    if(s.demoWorkflowVersion===workflowVersion)return s;
    // Incremental, idempotent synthetic history; never replace previously saved records.
    const histories=[
      ['DEMO-SOAP-0830','2026-08-30T09:00',{S:'Previous day\'s chief complaint summary from handover; demo only.',O:'Previous day\'s vital signs and lab sources must be reviewed separately; this demo progress note does not fabricate measurements.',A:'Post-op observation issues under ongoing follow-up; no automatic severity grading.',P:'Next shift to review open tasks and result progress; formal treatment requires separate orders.'}],
      ['DEMO-SOAP-0830B','2026-08-30T14:30',{S:'Back from the operating room after aortic repair; intubated and sedated (fictional).',O:'Post-op vital signs and drains are charted on the Vital signs and Surgery pages; this demo note does not restate measurements.',A:'Early post-op course after aortic repair; hemodynamics under close observation.',P:'Follow post-op labs and chest imaging; review analgesia and sedation with the night team.'}],
      ['DEMO-SOAP-0830C','2026-08-30T20:30',{S:'Evening review after the bedside ultrasound (fictional).',O:'Ultrasound report is available under Labs & imaging.',A:'Ultrasound reviewed; no change to the post-op plan.',P:'Overnight labs as ordered; call the doctor on duty for any new bleeding.'}],
      ['DEMO-SOAP-0831A','2026-08-31T04:00',{S:'Night review; overnight labs have returned (fictional).',O:'Overnight lab results are on Labs & imaging.',A:'Overnight results reviewed; plan morning chest X-ray and analgesia adjustment.',P:'Order the morning chest X-ray and maintenance fluid; adjust analgesia at morning rounds.'}],
      ['DEMO-SOAP-0831','2026-08-31T08:00',{S:'Today\'s rounds data compiled manually by the doctor (fictional).',O:'Raw measurements are available on the Vital signs page; some labs are still pending result.',A:'Current issues: post-op observation, pending lab results.',P:'Confirm each result, document interpretation, and hand open tasks to the next shift; no treatment thresholds set.'}]
    ];
    histories.forEach(([id,clinicalAt,soap])=>{if(!s.notes.some(n=>n.id===id))s.notes.push({id,p:'A',kind:'Progress',soap,text:soapText(soap),clinicalAt,at:clinicalAt,author:'doctor',version:1,status:'signed',signedAt:clinicalAt,references:[],source:'Fictional historical progress note; signing is simulated only'});});
    const oid='DEMO-LAB-ORDER-01',rid='DEMO-LAB-FLAGS-01';
    if(!s.orders.some(o=>o.id===oid))s.orders.push({id:oid,p:'A',kind:'service',name:'Complete blood count (flag filter demo)',catalog:snapshot('service:1020'),version:1,dose:'1 time',route:'Lab',frequency:'Once now',orderedAt:'2026-08-31T07:55',start:'2026-08-31T08:00',end:null,clinical:'active',local:'signed',his:'accepted',occurrence:oid+'-V1-D1',author:'doctor',progressNote:'DEMO-SOAP-0831',source:'Fictional existing order; acceptance status simulated only'});
    if(!s.reports.some(r=>r.id===rid))s.reports.push({id:rid,p:'A',kind:'Lab',catalog:snapshot('service:1020'),order:oid,status:'returned',version:1,at:'2026-08-31T10:00',collectedAt:'2026-08-31T09:30',seen:[],processed:[],text:'Normal / abnormal filter demo; flags are provided directly by the fictional source, not derived from values or reference ranges.',source:'Fictional report and source flags; not a real clinical determination',components:demoComponents('service:1020',1).map((c,i)=>({...c,interpretation:['H','N',null][i],interpretationSource:'Fictional source flag (not system-determined)'}))});
    s.demoWorkflowVersion=workflowVersion;
    return s;
  }
  const soapText=soap=>['S','O','A','P'].map(k=>k+': '+soap[k]).join('\n\n');
  function resultClass(c){
    if(c.value===null||c.value===undefined||c.value==='')return 'unknown';
    if(['H','L','HH','LL','A','AA'].includes(c.interpretation))return 'abnormal';
    return c.interpretation==='N'?'normal':'unknown';
  }
  function orderCategory(o){return o.kind==='medication'?'medication':'medical';}
  function labEntries(s,p,bounds){
    const reports=s.reports.filter(r=>r.p===p&&!r.examType);
    const orders=s.orders.filter(o=>o.p===p&&(o.catalog?.isLab||(!o.catalog&&o.kind==='service')));
    const entries=[];
    function addReport(r,o){
      if(r.status==='entered-in-error'||r.status!=='pending'&&!within(r.at,bounds))return;
      const base={order:o,report:r,catalog:r.catalog||o?.catalog,at:r.at};
      if(r.status==='pending')entries.push({...base,classification:'pending',name:'Pending result',value:null});
      else if(r.components?.length)r.components.forEach(c=>entries.push({...base,...c,classification:resultClass(c)}));
      else entries.push({...base,classification:'unknown',name:'Text report / no numeric sub-items',value:null});
    }
    orders.forEach(o=>{
      const linked=reports.filter(r=>r.order===o.id);
      if(linked.length)linked.forEach(r=>addReport(r,o));
      else if(within(o.start,bounds))entries.push({order:o,report:null,catalog:o.catalog,classification:'unavailable',name:o.clinical==='active'?'Linked result not yet available':'No result generated yet',value:null,at:null});
    });
    reports.filter(r=>!orders.some(o=>r.order===o.id)).forEach(r=>addReport(r,null));
    return entries;
  }
  const api={catalog,search,matches,entry,snapshot,latestMeasure,bmi,bounds,rangeBounds,SHIFT_TIMES,shiftTimes,shiftStartOf,within,millis,units,flatten,demoComponents,enrich,resultClass,orderCategory,labEntries,soapText,labInfo,labCategories,labSpecimens,admissionDay,lastSurgery,postOpDay,currentDiagnosis,DEMO_NOW};
  if(typeof module!=='undefined')module.exports=api;else root.ICUClinical=api;
})(globalThis);
