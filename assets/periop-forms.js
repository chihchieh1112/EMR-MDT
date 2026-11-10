/* 圍術期紀錄的表單定義與檢核（2026-09-26）。
   手術室沒有系統可串接，ICU 醫護照紙本手動登錄；每張表的欄位、分節與規則照表單字典（A3）或院方原始檔。
   純資料與純函式，不含 DOM；畫面（workspace.js）、寫入（workflow.js）與驗證器共用同一份定義。 */
(function (root) {
  'use strict';
  const people = v => [...new Set(String(v || '').split(/[、,，;；\n]/).map(x => x.trim()).filter(Boolean))];
  const num = v => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))) ? null : Number(v);
  const sum = list => list.map(num).filter(v => v !== null).reduce((a, b) => a + b, 0);
  const YN = [['yes', 'Yes'], ['no', 'No']];
  const ANESTHESIA = [['General anesthesia', 'General anesthesia'], ['Local anesthesia', 'Local / regional anesthesia'], ['Premedication', 'Premedication'], ['Other', 'Other']];   // TDL.0677
  const SURGERY_TYPES = [['1A', 'Class 1A'], ['1B', 'Class 1B'], ['1C', 'Class 1C'], ['2A', 'Class 2A'], ['2B', 'Class 2B'], ['2C', 'Class 2C'], ['3A', 'Class 3A'], ['3B', 'Class 3B'], ['3C', 'Class 3C'], ['DBA', 'Special class A'], ['DBB', 'Special class B'], ['DBC', 'Special class C']];
  const score = (k, label, opts) => ({k, t: 'score', label, req: true, opts});

  // ---------------------------------------------------------------- 麻醉紀錄 I-E-02-004
  const anesthesia = {
    id: 'anesthesia', code: 'I-E-02-004', title: 'Anesthesia record', vi: 'Phiếu Gây mê hồi sức', source: 'Form dictionary A3, rows 1384–1451',
    dateKey: 'surgeryDate', signerKey: 'signer',
    sections: [
      {title: 'Patient information', fields: [
        {k: 'weight', t: 'number', label: 'Weight', unit: 'kg', req: true, min: 0, gt: true},
        {k: 'abo', t: 'select', label: 'Blood type', opts: [['A', 'A'], ['B', 'B'], ['AB', 'AB'], ['O', 'O'], ['Unknown', 'Unknown']]},
        {k: 'rh', t: 'select', label: 'Rh', opts: [['Rh+', 'Rh+'], ['Rh-', 'Rh-'], ['Unknown', 'Unknown']]}]},
      {title: 'Surgery information', fields: [
        {k: 'category', t: 'select', label: 'Surgery category', opts: SURGERY_TYPES, other: true},
        {k: 'surgeryDate', t: 'date', label: 'Surgery date', req: true, notFuture: true, notBeforeAdmission: true},
        {k: 'diagnosis', t: 'area', label: 'Diagnosis', req: true, hint: 'Multiple diagnoses allowed'},
        {k: 'position', t: 'text', label: 'Position / posture', req: true, hint: 'e.g., supine'},
        {k: 'method', t: 'text', label: 'Surgical method', req: true}]},
      {title: 'Anesthesia technique', fields: [
        {k: 'anesthesiaMethod', t: 'select', label: 'Anesthesia method', req: true, opts: ANESTHESIA, other: true},
        {k: 'intubated', t: 'check', label: 'Endotracheal intubation'},
        {k: 'ettSize', t: 'text', label: 'ETT size', when: {k: 'intubated', v: true}},
        {k: 'ettDepth', t: 'number', label: 'Depth', unit: 'cm', when: {k: 'intubated', v: true}},
        {k: 'ettCuff', t: 'check', label: 'Cuffed', when: {k: 'intubated', v: true}},
        {k: 'auscultation', t: 'text', label: 'Lung auscultation', when: {k: 'intubated', v: true}},
        {k: 'mask', t: 'check', label: 'Mask anesthesia'},
        {k: 'regional', t: 'check', label: 'Local anesthesia'},
        {k: 'regionalType', t: 'text', label: 'Anesthesia type / site', when: {k: 'regional', v: true}},
        {k: 'premed', t: 'check', label: 'Premedication'},
        {k: 'premedDrug', t: 'text', label: 'Premedication drug', when: {k: 'premed', v: true}}]},
      {title: 'Performing team', fields: [
        {k: 'surgeons', t: 'people', label: 'Surgical team doctors', req: true},
        {k: 'anesthetists', t: 'people', label: 'Anesthesia team doctors', req: true}]},
      {title: 'Pre-op assessment', fields: [
        {k: 'asa', t: 'select', label: 'ASA', req: true, opts: [['1', 'ASA 1'], ['2', 'ASA 2'], ['3', 'ASA 3'], ['4', 'ASA 4']]},
        {k: 'fullStomach', t: 'yesno', label: 'Full stomach / emergency', hint: 'Leave blank if not emergency'},
        {k: 'difficultAirway', t: 'yesno', label: 'Difficult intubation', req: true, noteWhenYes: true},
        {k: 'allergy', t: 'yesno', label: 'Allergy', noteWhenYes: true},
        {k: 'history', t: 'area', label: 'Anesthesia-related history / medications'}]},
      {title: 'Concurrent procedures', fields: [
        {k: 'procedures', t: 'multi', label: 'Concurrent procedures', opts: [['Endotracheal intubation', 'Endotracheal intubation'], ['Caudal block', 'Caudal block'], ['Plexus block', 'Plexus block'], ['Arterial line', 'Arterial line'], ['Central venous catheter', 'Central venous catheter'], ['Urinary catheter', 'Urinary catheter']]}]},
      {title: 'Vital signs monitoring', fields: [
        {k: 'vitals', t: 'repeat', label: 'Vital signs', rows: 6, minRows: 1, fields: [
          {k: 'at', t: 'datetime', label: 'Time', req: true},
          {k: 'pulse', t: 'number', label: 'Pulse', req: true},
          {k: 'sbp', t: 'number', label: 'Systolic BP', req: true},
          {k: 'dbp', t: 'number', label: 'Diastolic BP', req: true}]}]},
      {title: 'Intraop monitoring', fields: [
        {k: 'intraop', t: 'repeat', label: 'Intraop monitoring', rows: 4, fields: [
          {k: 'at', t: 'datetime', label: 'Time', req: true},
          {k: 'temp', t: 'number', label: 'Temperature °C'},
          {k: 'bloodLoss', t: 'number', label: 'Blood loss ml'},
          {k: 'urine', t: 'number', label: 'Urine output ml'},
          {k: 'cvp', t: 'number', label: 'CVP mmHg', neg: true}]}]},
      {title: 'Respiratory monitoring', fields: [
        {k: 'resp', t: 'repeat', label: 'Respiratory monitoring', rows: 4, fields: [
          {k: 'at', t: 'datetime', label: 'Time', req: true},
          {k: 'machine', t: 'text', label: 'Anesthesia machine'},
          {k: 'rr', t: 'number', label: 'breaths/min'},
          {k: 'vt', t: 'number', label: 'Tidal volume ml'},
          {k: 'pip', t: 'number', label: 'Pressure cmH₂O'},
          {k: 'mode', t: 'text', label: 'Ventilation mode'},
          {k: 'etco2', t: 'number', label: 'EtCO₂'},
          {k: 'spo2', t: 'number', label: 'SpO₂ %', max: 100}]}]},
      {title: 'SEVO monitoring', fields: [
        {k: 'sevo', t: 'repeat', label: 'SEVO', rows: 3, fields: [
          {k: 'at', t: 'datetime', label: 'Time', req: true},
          {k: 'conc', t: 'number', label: 'Concentration %', max: 100},
          {k: 'flow', t: 'number', label: 'Gas flow L/min'}]}]},
      {title: 'Intraop medications', fields: [
        {k: 'drugs', t: 'repeat', label: 'Intraop medications', rows: 6, fields: [
          {k: 'name', t: 'text', label: 'Drug name', req: true},
          {k: 'route', t: 'text', label: 'Route'},
          {k: 'kind', t: 'select', label: 'Administration type', req: true, opts: [['bolus', 'IV push'], ['infusion', 'Infusion']]},
          {k: 'at', t: 'datetime', label: 'Administration time'},
          {k: 'start', t: 'datetime', label: 'Infusion start'},
          {k: 'end', t: 'datetime', label: 'Infusion end'},
          {k: 'dose', t: 'text', label: 'Dose / rate', req: true, hint: 'Include unit'}]}]},
      {title: 'IV fluids & blood products', fields: [
        {k: 'fluids', t: 'repeat', label: 'IV fluids', rows: 4, fields: [
          {k: 'name', t: 'text', label: 'Name', req: true},
          {k: 'type', t: 'select', label: 'Type', req: true, opts: [['IV fluids', 'IV fluids'], ['Blood products', 'Blood products']]},
          {k: 'at', t: 'datetime', label: 'Recorded at', req: true},
          {k: 'amount', t: 'number', label: 'Amount ml', req: true, gt: true}]}]},
      {title: 'Conclusion', fields: [{k: 'conclusion', t: 'area', label: 'Comments and conclusion'}]},
      {title: 'Confirm', fields: [
        {k: 'signedAt', t: 'datetime', label: 'Signed at', req: true, notFuture: true},
        {k: 'signer', t: 'signer', label: 'Signing anesthesiologist', team: 'anesthetists'}]}
    ],
    computed: [
      {label: 'Total blood loss', unit: 'ml', fn: d => (d.intraop || []).some(r => num(r.bloodLoss) !== null) ? sum((d.intraop || []).map(r => r.bloodLoss)) : null},
      {label: 'Total urine output', unit: 'ml', fn: d => (d.intraop || []).some(r => num(r.urine) !== null) ? sum((d.intraop || []).map(r => r.urine)) : null},
      {label: 'Total IV fluids', unit: 'ml', fn: d => (d.fluids || []).some(r => r.type === 'IV fluids') ? sum((d.fluids || []).filter(r => r.type === 'IV fluids').map(r => r.amount)) : null},
      {label: 'Total blood products', unit: 'ml', fn: d => (d.fluids || []).some(r => r.type === 'Blood products') ? sum((d.fluids || []).filter(r => r.type === 'Blood products').map(r => r.amount)) : null},
      {label: 'Total IV push doses', fn: d => drugTotals(d.drugs) || null}
    ],
    // SEVO 總量不計算：紀錄只有濃度與流量，沒有每次用量。
    check(d, must) {
      (d.drugs || []).forEach((r, i) => {
        const where = 'Intraop medication row ' + (i + 1);
        if (r.kind === 'bolus') must(r.at, where + ': IV push requires an administration time');
        if (r.kind === 'infusion') { must(r.start, where + ': infusion requires a start time'); must(!r.end || r.end >= r.start, where + ': infusion end cannot be earlier than start'); }
        must(/[a-zA-Zµμ%]/.test(r.dose), where + ': dose / rate must include a unit');
      });
    },
    list: [['Surgery date', d => d.surgeryDate], ['Surgical method', d => d.method], ['Anesthesia method', d => d.anesthesiaMethod], ['ASA', d => d.asa ? 'ASA ' + d.asa : ''], ['Anesthesiologist', d => d.signer]],
    prefill: (p, sg) => sg ? {surgeryDate: String(sg.performedAt || '').slice(0, 10), diagnosis: sg.preDiagnosis || '', method: sg.procedure || '', category: sg.category || '', anesthesiaMethod: sg.anesthesia || '',
      surgeons: (sg.surgeons || []).map(x => x.name).join(', '), anesthetists: (sg.anesthetists || []).join(', ')} : {}
  };
  // 推注藥品同名同單位才加總；輸注是速率，不加成總劑量。
  function drugTotals(rows) {
    const map = new Map();
    (rows || []).filter(r => r.kind === 'bolus').forEach(r => {
      const m = String(r.dose || '').match(/^\s*([\d.]+)\s*(\S+)/); if (!m) return;
      const key = r.name + '|' + m[2]; map.set(key, (map.get(key) || 0) + Number(m[1]));
    });
    return [...map.entries()].map(([k, v]) => k.split('|')[0] + ' ' + (Math.round(v * 1000) / 1000) + ' ' + k.split('|')[1]).join('; ');
  }

  // ---------------------------------------------------------------- 開心手術後交接單（院方原始檔 BM1，中譯 C4）
  const handover = {
    id: 'cardiacHandover', code: 'BM1', title: 'Post–open-heart surgery handover form', vi: 'Phiếu bàn giao người bệnh sau phẫu thuật tim hở', source: 'Hospital source file BM1 (translation in C_clinical pathway/C4); not in the 76-form dictionary',
    dateKey: 'handoverAt', note: 'Open-heart surgery patients only',
    sections: [
      {title: 'Header', fields: [
        {k: 'handoverAt', t: 'datetime', label: 'Handover time', req: true, notFuture: true},
        {k: 'intraopAllergy', t: 'text', label: 'Intraop allergy or history of anaphylaxis'}]},
      {title: 'A. Surgeon', fields: [
        {k: 'weight', t: 'number', label: 'Weight', unit: 'kg', gt: true},
        {k: 'diagnosis', t: 'area', label: 'Diagnosis', req: true},
        {k: 'history', t: 'area', label: 'Interventional / surgical history'},
        {k: 'preopImaging', t: 'area', label: 'Latest pre-op echo / CT / cardiac cath results'},
        {k: 'procedure', t: 'area', label: 'Detailed description of surgery performed', req: true},
        {k: 'drains', t: 'area', label: 'Mediastinal and pleural drains'},
        {k: 'pacing', t: 'area', label: 'Pacing wires, current rhythm, pacemaker settings'},
        {k: 'pressureLines', t: 'area', label: 'Intracardiac pressure lines'},
        {k: 'postopEcho', t: 'area', label: 'Post-op echo (highlight abnormalities)'},
        {k: 'surgicalPlan', t: 'area', label: 'Post-op treatment plan'}]},
      {title: 'B. Anesthesiologist / perfusionist', fields: [
        {k: 'preop24', t: 'select', label: '24 h pre-op', opts: [['Mechanical ventilation', 'Mechanical ventilation'], ['Spontaneous breathing', 'Spontaneous breathing']]},
        {k: 'preop24Note', t: 'area', label: '24 h pre-op status'},
        {k: 'preopLabs', t: 'area', label: 'Pre-op abnormal labs, paraclinical results'},
        {k: 'maskVent', t: 'select', label: 'Mask ventilation', opts: [['Easy', 'Easy'], ['Difficult', 'Difficult']]},
        {k: 'maskVentReason', t: 'text', label: 'Reason for difficult mask ventilation', when: {k: 'maskVent', v: 'Difficult'}, req: true},
        {k: 'ettType', t: 'text', label: 'ETT type'},
        {k: 'ettDepth', t: 'number', label: 'ETT depth', unit: 'cm'},
        {k: 'ettEase', t: 'select', label: 'Endotracheal intubation', opts: [['Easy', 'Easy'], ['Difficult', 'Difficult']]},
        {k: 'ettReason', t: 'text', label: 'Reason for difficult intubation', when: {k: 'ettEase', v: 'Difficult'}, req: true},
        {k: 'artSite', t: 'text', label: 'Arterial line site'},
        {k: 'artGauge', t: 'text', label: 'Arterial cannula size (G)'},
        {k: 'pivc', t: 'select', label: 'Peripheral IV', opts: [['None', 'None'], ['Yes', 'Yes']]},
        {k: 'pivcCount', t: 'int', label: 'Number of peripheral IVs', when: {k: 'pivc', v: 'Yes'}},
        {k: 'pivcSite', t: 'text', label: 'Peripheral IV sites', when: {k: 'pivc', v: 'Yes'}},
        {k: 'cvcSite', t: 'text', label: 'CVC site'},
        {k: 'cvcSize', t: 'number', label: 'CVC size', unit: 'F'},
        {k: 'cvcLumen', t: 'int', label: 'CVC lumens'},
        {k: 'cvcDepth', t: 'number', label: 'CVC depth', unit: 'cm'},
        {k: 'regional', t: 'text', label: 'Local anesthesia'},
        {k: 'preCpb', t: 'area', label: 'Pre-CPB status / issues'},
        {k: 'cpbMin', t: 'number', label: 'CPB time', unit: 'min'},
        {k: 'clampMin', t: 'number', label: 'Aortic cross-clamp time', unit: 'min'},
        {k: 'lowFlowMin', t: 'number', label: 'Low-flow time', unit: 'min'},
        {k: 'arrestMin', t: 'number', label: 'Circulatory arrest time', unit: 'min'},
        {k: 'lowestTemp', t: 'number', label: 'Lowest temperature', unit: '°C'},
        {k: 'cpbDifficulty', t: 'area', label: 'Difficulties starting / weaning CPB and management'},
        {k: 'lastHct', t: 'number', label: 'Pre-wean Hct', unit: '%', max: 100},
        {k: 'lastAct', t: 'number', label: 'Pre-wean ACT', unit: 's'},
        {k: 'postCpbCourse', t: 'area', label: 'Course from CPB wean to ICU transfer'},
        {k: 'adrenalin', t: 'number', label: 'Adrenalin', unit: 'mcg/kg/p'},
        {k: 'dopamin', t: 'number', label: 'Dopamin', unit: 'mcg/kg/p'},
        {k: 'milrinone', t: 'number', label: 'Milrinone', unit: 'mcg/kg/p'},
        {k: 'cacl2', t: 'number', label: 'CaCl2', unit: 'mg/kg/h'},
        {k: 'otherDrugs', t: 'text', label: 'Other drugs post-CPB'},
        {k: 'prbc', t: 'number', label: 'Post-CPB PRBC', unit: 'ml'},
        {k: 'plt', t: 'number', label: 'Post-CPB PLT', unit: 'ml'},
        {k: 'ffp', t: 'number', label: 'Post-CPB FFP', unit: 'ml'},
        {k: 'cryo', t: 'number', label: 'Post-CPB Cryo', unit: 'ml'},
        {k: 'extubated', t: 'select', label: 'ETT before transfer', req: true, opts: [['Removed', 'Removed'], ['In place', 'In place']]},
        {k: 'avpu', t: 'select', label: 'AVPU', opts: [['A', 'A'], ['V', 'V'], ['P', 'P'], ['U', 'U']]},
        {k: 'pupils', t: 'text', label: 'Pupils (bilateral)'},
        {k: 'pupilSize', t: 'text', label: 'Pupil size'},
        {k: 'lightReflex', t: 'text', label: 'Light reflex'},
        {k: 'hr', t: 'number', label: 'Pulse', unit: '/min'},
        {k: 'bp', t: 'text', label: 'Blood pressure', unit: 'mmHg', hint: 'e.g., 90/50'},
        {k: 'cvp', t: 'number', label: 'CVP', neg: true},
        {k: 'spo2', t: 'number', label: 'SpO₂', unit: '%', max: 100},
        {k: 'temp', t: 'number', label: 'Temperature', unit: '°C'},
        {k: 'ventMode', t: 'text', label: 'Ventilator mode', when: {k: 'extubated', v: 'In place'}},
        {k: 'ventPressure', t: 'text', label: 'P / PEEP', when: {k: 'extubated', v: 'In place'}},
        {k: 'ventRate', t: 'number', label: 'Ventilator rate', when: {k: 'extubated', v: 'In place'}},
        {k: 'fio2', t: 'number', label: 'FiO₂', unit: '%', max: 100, when: {k: 'extubated', v: 'In place'}},
        {k: 'abxName', t: 'text', label: 'Last antibiotic'},
        {k: 'abxAt', t: 'datetime', label: 'Last antibiotic time'},
        {k: 'abxDose', t: 'number', label: 'Last antibiotic dose', unit: 'mg/kg'},
        {k: 'maintenance', t: 'text', label: 'Maintenance anesthetic'},
        {k: 'lastRelaxant', t: 'text', label: 'Last muscle relaxant dose'},
        {k: 'reversal', t: 'text', label: 'Muscle relaxant reversal'},
        {k: 'postCpbUrine', t: 'number', label: 'Urine output after CPB', unit: 'ml'},
        {k: 'diuretic', t: 'text', label: 'Diuretic'},
        {k: 'abgPh', t: 'number', label: 'pH'}, {k: 'abgPco2', t: 'number', label: 'pCO2'}, {k: 'abgPo2', t: 'number', label: 'pO2'},
        {k: 'abgNa', t: 'number', label: 'Na+'}, {k: 'abgK', t: 'number', label: 'K+'}, {k: 'abgCa', t: 'number', label: 'Ca++'},
        {k: 'abgGlu', t: 'number', label: 'Glu'}, {k: 'abgLac', t: 'number', label: 'Lac'}, {k: 'abgHct', t: 'number', label: 'Hct'},
        {k: 'abgHco3', t: 'number', label: 'HCO3'}, {k: 'abgBe', t: 'number', label: 'BE', neg: true}, {k: 'abgSo2', t: 'number', label: 'SO2c', max: 100},
        {k: 'actPre', t: 'number', label: 'Pre-CPB ACT', unit: 's'}, {k: 'actPost', t: 'number', label: 'Post-CPB ACT', unit: 's'},
        {k: 'pltPre', t: 'number', label: 'Pre-op platelets'}, {k: 'pltPost', t: 'number', label: 'Post-op platelets'},
        {k: 'leftPrbc', t: 'number', label: 'Remaining PRBC', unit: 'ml'}, {k: 'leftPrbcAt', t: 'datetime', label: 'PRBC issue / opening time'},
        {k: 'leftPlt', t: 'number', label: 'Remaining PLT', unit: 'ml'}, {k: 'leftPltAt', t: 'datetime', label: 'PLT issue / opening time'},
        {k: 'leftFfp', t: 'number', label: 'Remaining FFP', unit: 'ml'}, {k: 'leftFfpAt', t: 'datetime', label: 'FFP issue / opening time'},
        {k: 'leftCryo', t: 'number', label: 'Remaining Cryo', unit: 'ml'}, {k: 'leftCryoAt', t: 'datetime', label: 'Cryo issue / opening time'},
        {k: 'handoverDrugs', t: 'area', label: 'Handover medications'},
        {k: 'otherNotes', t: 'area', label: 'Other notes'}]},
      {title: 'C. Surgical ICU doctor + nurse', fields: [
        {k: 'icuSurgery', t: 'text', label: 'Surgery'},
        {k: 'residual', t: 'area', label: 'Residual lesions'},
        {k: 'comorbid', t: 'area', label: 'Comorbidities'},
        {k: 'cvStatus', t: 'area', label: 'CV: current hemodynamic status'},
        {k: 'cvDrugs', t: 'area', label: 'CV: BP and rhythm control drugs'},
        {k: 'cvPacer', t: 'area', label: 'CV: pacemaker settings and indications'},
        {k: 'goalBp', t: 'text', label: 'Target BP', unit: 'mmHg'}, {k: 'goalHr', t: 'text', label: 'Target pulse', unit: '/min'},
        {k: 'goalCvp', t: 'text', label: 'Target CVP'}, {k: 'goalLap', t: 'text', label: 'Target LAP'}, {k: 'goalPap', t: 'text', label: 'Target PAP'},
        {k: 'cvPlan', t: 'area', label: 'CV: treatment plan (vasoactives, intake / output…)'},
        {k: 'respStatus', t: 'area', label: 'Respiratory: current status'},
        {k: 'goalSpo2', t: 'text', label: 'Target SpO₂'}, {k: 'goalPao2', t: 'text', label: 'Target PaO2'}, {k: 'goalPco2', t: 'text', label: 'Target pCO2'}, {k: 'goalPeep', t: 'text', label: 'Target PEEP'},
        {k: 'weanPlan', t: 'area', label: 'Ventilator weaning plan'},
        {k: 'neuroStatus', t: 'area', label: 'Neuro: current status (consciousness, pupils)'},
        {k: 'fentanyl', t: 'text', label: 'Fentanyl'}, {k: 'midazolam', t: 'text', label: 'Midazolam'}, {k: 'dexmed', t: 'text', label: 'Dexmedetomidine'}, {k: 'paracetamol', t: 'text', label: 'Paracetamol'},
        {k: 'atracurium', t: 'text', label: 'Atracurium'}, {k: 'cisatracurium', t: 'text', label: 'Cisatracurium'},
        {k: 'renalPlan', t: 'area', label: 'Renal: diuretic or dialysis plan'},
        {k: 'bleedRisk', t: 'area', label: 'Hematology: bleeding risk'},
        {k: 'transfusion', t: 'area', label: 'Hematology: RBC and platelet transfusion thresholds'},
        {k: 'anticoag', t: 'area', label: 'Hematology: anticoagulation plan'},
        {k: 'abxPlan', t: 'repeat', label: 'Antibiotic plan', rows: 3, fields: [
          {k: 'name', t: 'text', label: 'Drug name', req: true}, {k: 'dose', t: 'text', label: 'Dose'}, {k: 'stopAt', t: 'datetime', label: 'Stop time'}]},
        {k: 'nutrition', t: 'area', label: 'IV fluids, electrolytes, nutrition'},
        {k: 'otherIssues', t: 'area', label: 'Other issues'},
        {k: 'nurseUnderstood', t: 'yesno', label: 'ICU nurse understands the treatment plan', req: true},
        {k: 'nurseCanAnswer', t: 'yesno', label: 'ICU nurse can answer related questions', req: true},
        {k: 'teamAgreed', t: 'yesno', label: 'Whole team agrees with this handover', req: true}]},
      {title: 'Signatures', fields: [
        {k: 'signAnesthetist', t: 'text', label: 'Anesthesiologist', req: true},
        {k: 'signSurgeon', t: 'text', label: 'Surgeon', req: true},
        {k: 'signPerfusionist', t: 'text', label: 'Perfusionist', hint: 'Required if CPB was used'},
        {k: 'signIcuDoctor', t: 'text', label: 'Surgical ICU doctor', req: true},
        {k: 'signIcuNurse', t: 'text', label: 'Surgical ICU nurse', req: true}]}
    ],
    check(d, must) {
      must(num(d.cpbMin) === null || !d.cpbMin || d.signPerfusionist, 'Perfusionist must sign when CPB time is entered');
      must(num(d.clampMin) === null || num(d.cpbMin) === null || num(d.clampMin) <= num(d.cpbMin), 'Aortic cross-clamp time cannot exceed CPB time');
    },
    list: [['Handover time', d => String(d.handoverAt || '').replace('T', ' ')], ['Surgery performed', d => d.procedure], ['CPB / clamp', d => d.cpbMin !== '' && d.cpbMin !== undefined ? d.cpbMin + ' / ' + (d.clampMin ?? '—') + ' min' : '—'], ['ETT on transfer', d => d.extubated], ['Team agreed', d => ({yes: 'Yes', no: 'No'})[d.teamAgreed] || '']],
    prefill: (p, sg) => sg ? {diagnosis: sg.postDiagnosis || '', procedure: [sg.procedure, sg.steps].filter(Boolean).join('\n'), icuSurgery: sg.procedure || '', signSurgeon: (sg.surgeons || []).find(x => x.role === 'primary')?.name || '', signAnesthetist: (sg.anesthetists || [])[0] || ''} : {}
  };

  // ---------------------------------------------------------------- 術中管路置入紀錄 I-E-03-002
  // 原名「處置紀錄（管路置入）」；2026-10-25 新增 ICU 床邊的處置紀錄（Procedure Note）後改名，免得兩張都叫處置紀錄。
  const procedure = {
    id: 'procedure', code: 'I-E-03-002', title: 'Intra-op line placement record', vi: 'Phiếu thủ thuật (Khoa GMHS Tim mạch)', source: 'Form dictionary A3, rows 1472–1508',
    dateKey: 'performedDate', signerKey: 'signer',
    sections: [
      {title: 'General information', fields: [
        {k: 'diagnosis', t: 'area', label: 'Diagnosis', req: true, hint: 'Multiple diagnoses allowed'},
        {k: 'toDepartment', t: 'text', label: 'Receiving department', req: true},
        {k: 'plannedSurgery', t: 'area', label: 'Planned surgery'},
        {k: 'anesthesiaMethod', t: 'select', label: 'Anesthesia method', req: true, opts: ANESTHESIA, other: true}]},
      {title: 'Performing team', fields: [
        {k: 'surgeons', t: 'people', label: 'Lead surgeon', req: true},
        {k: 'anesthetists', t: 'people', label: 'Anesthesiologist performing procedure', req: true}]},
      {title: '1. Endotracheal intubation', fields: [
        {k: 'intubation', t: 'yesno', label: 'Endotracheal intubation', req: true},
        {k: 'midazolam', t: 'number', label: 'Midazolam', unit: 'µg/kg', when: {k: 'intubation', v: 'yes'}},
        {k: 'ketamin', t: 'number', label: 'Ketamin', unit: 'mg/kg', when: {k: 'intubation', v: 'yes'}},
        {k: 'propofol', t: 'number', label: 'Propofol', unit: 'mg/kg', when: {k: 'intubation', v: 'yes'}},
        {k: 'fentanyl', t: 'number', label: 'Fentanyl', unit: 'µg/kg', when: {k: 'intubation', v: 'yes'}},
        {k: 'rocuronium', t: 'number', label: 'Rocuronium', unit: 'mg/kg', when: {k: 'intubation', v: 'yes'}},
        {k: 'atracurium', t: 'number', label: 'Atracurium', unit: 'mg/kg', when: {k: 'intubation', v: 'yes'}},
        {k: 'bagO2', t: 'number', label: 'Bag O₂', unit: '%', max: 100, when: {k: 'intubation', v: 'yes'}},
        {k: 'bagFlow', t: 'number', label: 'Bag flow', unit: 'l/min', when: {k: 'intubation', v: 'yes'}},
        {k: 'ettSize', t: 'text', label: 'ETT size', when: {k: 'intubation', v: 'yes'}},
        {k: 'ettDepth', t: 'number', label: 'ETT depth', unit: 'cm', when: {k: 'intubation', v: 'yes'}},
        {k: 'ettUsed', t: 'int', label: 'ETTs used', unit: 'units', when: {k: 'intubation', v: 'yes'}}]},
      {title: '2. Arterial line', fields: [
        {k: 'arterial', t: 'yesno', label: 'Arterial line placed', req: true},
        {k: 'arterialSite', t: 'text', label: 'Insertion site', when: {k: 'arterial', v: 'yes'}},
        {k: 'g24', t: 'int', label: '24G IV cannula', unit: 'units', when: {k: 'arterial', v: 'yes'}},
        {k: 'g22', t: 'int', label: '22G IV cannula', unit: 'units', when: {k: 'arterial', v: 'yes'}}]},
      {title: '3. Central venous catheter', fields: [
        {k: 'cvc', t: 'yesno', label: 'Central venous catheter placed', req: true},
        {k: 'cvcDepth', t: 'number', label: 'Catheter depth', unit: 'cm', when: {k: 'cvc', v: 'yes'}},
        {k: 'cvcSite', t: 'text', label: 'Catheter site', when: {k: 'cvc', v: 'yes'}},
        {k: 'cvcSets', t: 'int', label: 'Catheter sets', unit: 'sets', when: {k: 'cvc', v: 'yes'}},
        {k: 'cvcSize', t: 'number', label: 'Catheter size', unit: 'F', when: {k: 'cvc', v: 'yes'}},
        {k: 'cvcLumen', t: 'int', label: 'Lumens', when: {k: 'cvc', v: 'yes'}, positive: true}]},
      {title: '4. Urinary catheter', fields: [
        {k: 'foley', t: 'yesno', label: 'Urinary catheter placed', req: true},
        {k: 'foleyType', t: 'text', label: 'Urinary catheter type', when: {k: 'foley', v: 'yes'}},
        {k: 'foleySize', t: 'number', label: 'Urinary catheter size', unit: 'F', when: {k: 'foley', v: 'yes'}},
        {k: 'foleyDepth', t: 'number', label: 'Urinary catheter depth', unit: 'cm', when: {k: 'foley', v: 'yes'}}]},
      {title: 'Confirm', fields: [
        {k: 'performedDate', t: 'date', label: 'Procedure date', req: true, notFuture: true, notBeforeAdmission: true},
        {k: 'signer', t: 'signer', label: 'Surgeon', team: 'anesthetists', teamAlso: 'surgeons'}]}
    ],
    list: [['Procedure date', d => d.performedDate], ['Placed', d => [['intubation', 'Endotracheal intubation'], ['arterial', 'Arterial line'], ['cvc', 'CVC'], ['foley', 'Urinary catheter']].filter(([k]) => d[k] === 'yes').map(([, t]) => t).join(', ') || 'None'], ['CVC site', d => d.cvc === 'yes' ? [d.cvcSite, d.cvcSize ? d.cvcSize + 'F' : '', d.cvcLumen ? d.cvcLumen + ' lumens' : ''].filter(Boolean).join(' ') : '—'], ['Surgeon', d => d.signer]],
    prefill: (p, sg) => sg ? {diagnosis: sg.preDiagnosis || '', plannedSurgery: sg.procedure || '', anesthesiaMethod: sg.anesthesia || '', surgeons: (sg.surgeons || []).filter(x => x.role === 'primary').map(x => x.name).join(', '), anesthetists: (sg.anesthetists || []).join(', '), performedDate: String(sg.performedAt || '').slice(0, 10), toDepartment: 'ICU'} : {toDepartment: 'ICU'}
  };

  // ---------------------------------------------------------------- 體外循環紀錄（摘要）I-E-04-001
  const cpbIn = [['inOxygenator', 'Intake – oxygenator'], ['inHemoconc', 'Intake – hemoconcentration'], ['inExtra', 'Intake – additional'], ['inCpg', 'Intake – CPG'], ['inPerfusate', 'Intake – perfusate']];
  const cpbOut = [['outOxygenator', 'Output – oxygenator'], ['outUrine', 'Output – urine'], ['outUltra', 'Output – ultrafiltrate'], ['outSuction', 'Output – suction'], ['outOther', 'Output – other']];
  const cpb = {
    id: 'cpb', code: 'I-E-04-001', title: 'CPB record (summary)', vi: 'Theo dõi chạy máy tim phổi nhân tạo', source: 'Form dictionary A3, rows 1617–1723; covers only fluid balance, CPB summary, ICU transfer medications, procedures, and confirmation (047–075); hourly perfusion data not recorded',
    dateKey: 'runDate', signerKey: 'performer',
    sections: [
      {title: 'General information', fields: [{k: 'surgery', t: 'area', label: 'Surgery', req: true}]},
      {title: 'Fluid balance', fields: [...cpbIn, ...cpbOut].map(([k, label]) => ({k, t: 'number', label, unit: 'ml'}))},
      {title: 'CPB summary', fields: [
        {k: 'runMin', t: 'number', label: 'Run time', unit: 'min'},
        {k: 'clampMin', t: 'number', label: 'Aortic cross-clamp time', unit: 'min'},
        {k: 'assistMin', t: 'number', label: 'Assist time', unit: 'min'},
        {k: 'arrestMin', t: 'number', label: 'Circulatory arrest', unit: 'min'},
        {k: 'lowestRectal', t: 'number', label: 'Lowest rectal temp', unit: '°C', min: 10, max: 42},
        {k: 'defib', t: 'yesno', label: 'Defibrillation', noteWhenYes: true, noteOptional: true},
        {k: 'restart', t: 'yesno', label: 'CPB restart', noteWhenYes: true, noteOptional: true}]},
      {title: 'ICU transfer medications', fields: [
        {k: 'dopamine', t: 'number', label: 'Dopamine', unit: 'µg/kg/min'},
        {k: 'noradrenaline', t: 'number', label: 'Noradrenaline', unit: 'µg/kg/min'},
        {k: 'otherDrugs', t: 'area', label: 'Other drugs on ICU transfer', hint: 'Drug, dose, and route'}]},
      {title: 'Procedure', fields: [
        {k: 'filterDuring', t: 'check', label: 'Filtration during run'}, {k: 'filterAfter', t: 'check', label: 'Filtration after run'},
        {k: 'bloodTyping', t: 'check', label: 'Blood typing'}, {k: 'hypothermia', t: 'check', label: 'Controlled hypothermia'}]},
      {title: 'Confirm', fields: [
        {k: 'runDate', t: 'date', label: 'Date', req: true, notFuture: true, notBeforeAdmission: true},
        {k: 'performer', t: 'text', label: 'Performed by', req: true}]}
    ],
    computed: [
      {label: 'Total intake', unit: 'ml', fn: d => cpbIn.some(([k]) => num(d[k]) !== null) ? sum(cpbIn.map(([k]) => d[k])) : null},
      {label: 'Total output', unit: 'ml', fn: d => cpbOut.some(([k]) => num(d[k]) !== null) ? sum(cpbOut.map(([k]) => d[k])) : null},
      {label: 'Fluid balance (in – out)', unit: 'ml', fn: d => [...cpbIn, ...cpbOut].some(([k]) => num(d[k]) !== null) ? sum(cpbIn.map(([k]) => d[k])) - sum(cpbOut.map(([k]) => d[k])) : null}
    ],
    check(d, must) { must(num(d.clampMin) === null || num(d.runMin) === null || num(d.clampMin) <= num(d.runMin), 'Aortic cross-clamp time cannot exceed run time'); },
    list: [['Date', d => d.runDate], ['Run / clamp', d => (d.runMin ?? '—') + ' / ' + (d.clampMin ?? '—') + ' min'], ['Fluid balance', d => { const v = cpb.computed[2].fn(d); return v === null ? '—' : v + ' ml'; }], ['Performed by', d => d.performer]],
    prefill: (p, sg) => sg ? {surgery: sg.procedure || '', runDate: String(sg.performedAt || '').slice(0, 10)} : {}
  };

  // ---------------------------------------------------------------- 麻醉甦醒評分表 I-E-03-004
  const recovery = {
    id: 'recovery', code: 'I-E-03-004', title: 'Anesthesia recovery score', vi: 'Bảng điểm hồi tỉnh', source: 'Form dictionary A3, rows 1546–1595',
    dateKey: 'handoverAt', signerKey: 'anesthetist',
    sections: [
      {title: 'General information', fields: [
        {k: 'department', t: 'text', label: 'Department', req: true},
        {k: 'toDepartment', t: 'text', label: 'Receiving department', req: true},
        {k: 'fromDepartment', t: 'text', label: 'Transferring department', req: true}]},
      {title: 'Patient information', fields: [{k: 'weight', t: 'number', label: 'Weight', unit: 'kg', req: true, gt: true}]},
      {title: 'Surgery information', fields: [
        {k: 'preDiagnosis', t: 'area', label: 'Pre-op diagnosis', req: true},
        {k: 'method', t: 'area', label: 'Surgical procedure', req: true},
        {k: 'anesthesiaMethod', t: 'select', label: 'Anesthesia method', req: true, opts: ANESTHESIA, other: true},
        {k: 'anesthesiaAt', t: 'datetime', label: 'Anesthesia time', req: true}]},
      {title: 'Recovery score', fields: [
        {k: 'scores', t: 'repeat', label: 'Recovery score', rows: 4, minRows: 1, fields: [
          {k: 'at', t: 'datetime', label: 'Assessment time', req: true},
          score('conscious', 'Consciousness', [['2', '2 Fully awake'], ['1', '1 Opens eyes to stimulus'], ['0', '0 No response']]),
          score('breathing', 'Respiration', [['2', '2 Regular deep breathing / SpO₂>95%'], ['1', '1 Weak breathing / SpO₂<95%'], ['0', '0 Apneic / needs support']]),
          {k: 'rr', t: 'int', label: 'breaths/min'},
          score('motor', 'Motor', [['2', '2 Spontaneous'], ['1', '1 On stimulus'], ['0', '0 Unable to move']]),
          score('circulation', 'Circulation', [['2', '2 BP normal / <20%'], ['1', '1 Drop 50%'], ['0', '0 Drop 60%']]),
          {k: 'pulse', t: 'int', label: 'Pulse'},
          score('color', 'Skin color', [['2', '2 Pink'], ['1', '1 Dusky'], ['0', '0 Pale / cyanotic']]),
          {k: 'temp', t: 'number', label: 'Temperature'},
          {k: 'drain', t: 'int', label: 'Drainage ml'}, {k: 'drainColor', t: 'text', label: 'Drainage color'},
          {k: 'urine', t: 'int', label: 'Urine ml'}]}]},
      {title: 'Recovery confirmation', fields: [
        {k: 'anesthetist', t: 'text', label: 'Anesthesiologist', req: true},
        {k: 'assistant', t: 'text', label: 'Anesthesia assistant', req: true},
        {k: 'handoverAt', t: 'datetime', label: 'Post-recovery handover time', req: true, notFuture: true},
        {k: 'receiver', t: 'text', label: 'Received by', req: true}]},
      {title: 'Ward transfer score', fields: [
        {k: 'ward', t: 'text', label: 'Ward', req: true},
        {k: 'neuro', t: 'select', label: 'Neurological', req: true, opts: [['Awake', 'Awake'], ['Rousable to voice', 'Rousable to voice']]},
        {k: 'breathingGood', t: 'check', label: 'Breathing well'}, {k: 'canCough', t: 'check', label: 'Able to cough'}, {k: 'pinkLips', t: 'check', label: 'Pink lips'},
        {k: 'spo2Over95', t: 'check', label: 'SpO₂ above 95%'}, {k: 'goodAir', t: 'check', label: 'Good air entry on auscultation'},
        {k: 'wardPulse', t: 'number', label: 'Pulse', unit: '/min', req: true},
        {k: 'pulseRegular', t: 'yesno', label: 'Regular pulse', req: true},
        {k: 'wardSbp', t: 'number', label: 'Systolic BP', req: true}, {k: 'wardDbp', t: 'number', label: 'Diastolic BP', req: true},
        {k: 'wardTemp', t: 'number', label: 'Temperature', unit: '°C', req: true},
        {k: 'wardRr', t: 'number', label: 'Respiration', unit: '/min', req: true}]},
      {title: 'Bleeding monitoring', fields: [
        {k: 'bleedDrain', t: 'int', label: 'Drain output', unit: 'ml'}, {k: 'bleedDrainColor', t: 'text', label: 'Drainage color'},
        {k: 'bleedUrine', t: 'int', label: 'Urine output', unit: 'ml'}, {k: 'bleedUrineColor', t: 'text', label: 'Urine color'},
        {k: 'dressingSoaked', t: 'yesno', label: 'Wound dressing soaked through', req: true},
        {k: 'postopLabs', t: 'area', label: 'Post-op lab results'}]},
      {title: 'Handover to ward', fields: [
        {k: 'giver', t: 'text', label: 'Handed over by', req: true},
        {k: 'wardHandoverAt', t: 'datetime', label: 'Ward handover time', req: true, notFuture: true},
        {k: 'wardReceiver', t: 'text', label: 'Received by (ward)', req: true}]}
    ],
    computed: [{label: 'Last recovery total score', unit: '/10', fn: d => { const last = lastScore(d); return last ? last.total : null; }}],
    check(d, must) {
      const rows = (d.scores || []);
      rows.forEach((r, i) => must(!d.anesthesiaAt || r.at >= d.anesthesiaAt, 'Recovery score row ' + (i + 1) + ': assessment time cannot be earlier than anesthesia time'));
      const last = rows.map(r => r.at).sort().at(-1);
      must(!last || !d.handoverAt || d.handoverAt >= last, 'Post-recovery handover time cannot be earlier than the last assessment');
      must(!d.handoverAt || !d.wardHandoverAt || d.wardHandoverAt >= d.handoverAt, 'Ward handover time cannot be earlier than post-recovery handover time');
    },
    list: [['Post-recovery handover', d => String(d.handoverAt || '').replace('T', ' ')], ['Last total score', d => { const l = lastScore(d); return l ? l.total + '/10' : '—'; }], ['Ward', d => d.ward], ['Anesthesiologist', d => d.anesthetist]],
    prefill: (p, sg) => ({department: 'Anesthesiology & recovery', toDepartment: 'ICU', ward: p.ward || '', ...(sg ? {preDiagnosis: sg.preDiagnosis || '', method: sg.procedure || '', anesthesiaMethod: sg.anesthesia || '', anesthetist: (sg.anesthetists || [])[0] || ''} : {})})
  };
  const rowTotal = r => ['conscious', 'breathing', 'motor', 'circulation', 'color'].reduce((n, k) => n + (num(r[k]) || 0), 0);
  function lastScore(d) { const rows = (d.scores || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at))); const r = rows.at(-1); return r ? {at: r.at, total: rowTotal(r)} : null; }

  // ---------------------------------------------------------------- 處置紀錄 Procedure Note（2026-10-25）
  // 床邊處置，一份記一項；院方沒有對應的表單代碼，不對應手術。2026-10-31 起是病程（Progress note）的第 4 種類型，照護醫師與實際執行的受邀他科醫師能寫。
  // 處置類型取臨床選項 procedure_type，選「其他」自行輸入；插管前麻醉與插管只在選氣管插管時出現、也才收。
  const PROC_ETT = 'PROC_ETT', PROC_OTHER = 'PROC_OTHER';
  const procedureNote = {
    id: 'procedureNote', code: '', title: 'Procedure note', vi: '', source: 'Bedside procedure note; no hospital form code',
    dateKey: 'performedAt', signerKey: 'performer', noSurgeryLink: true, doctorsOnly: true, hideInactive: true,
    sections: [
      {title: '1. Procedure', fields: [
        {k: 'procedureType', t: 'option', set: 'procedure_type', label: 'Procedure type', req: true},
        {k: 'procedureTypeOther', t: 'text', label: 'Other procedure type', req: true, when: {k: 'procedureType', v: PROC_OTHER}},
        {k: 'performedAt', t: 'datetime', label: 'Performed at', req: true, notFuture: true, notBeforeAdmission: true},
        {k: 'performer', t: 'text', label: 'Performing doctor', req: true}]},
      {title: '2. Indication', fields: [{k: 'indication', t: 'area', label: 'Indication for procedure', req: true}]},
      {title: '3. Procedure details', fields: [
        {k: 'site', t: 'text', label: 'Site'},
        {k: 'equipment', t: 'text', label: 'Equipment'},
        {k: 'technique', t: 'area', label: 'Technique'},
        {k: 'preIntubationAnesthesia', t: 'area', label: 'Pre-intubation anesthesia', req: true, when: {k: 'procedureType', v: PROC_ETT}},
        {k: 'intubation', t: 'area', label: 'Intubation', req: true, when: {k: 'procedureType', v: PROC_ETT}},
        {k: 'course', t: 'select', label: 'Course', req: true, opts: [['smooth', '1. Smooth'], ['notSmooth', '2. Not smooth']]},
        {k: 'courseNote', t: 'area', label: 'What did not go smoothly', req: true, when: {k: 'course', v: 'notSmooth'}}]},
      {title: '4. Post-procedure complications', fields: [
        {k: 'complication', t: 'yesno', label: 'Complications', req: true, noteWhenYes: true}]}
    ],
    // 清單第二欄的處置類型要查臨床選項名稱，由畫面傳進 o.option。
    list: [['Performed at', d => String(d.performedAt || '').replace('T', ' ')], ['Procedure type', (d, o) => d.procedureType === PROC_OTHER ? d.procedureTypeOther : (o && o.option ? o.option(d.procedureType) : d.procedureType)],
      ['Course', d => ({smooth: '1. Smooth', notSmooth: '2. Not smooth'})[d.course] || ''], ['Complications', d => ({yes: 'Yes', no: 'No'})[d.complication] || ''], ['Performing doctor', d => d.performer]],
    prefill: (p, sg, who) => ({performer: (who && who.name) || ''})
  };

  // 處置紀錄不再是手術分頁的分頁籤（2026-10-31）：表單定義留在這裡，給病程撰寫頁與存檔檢核共用。
  const FORMS = [anesthesia, handover, procedure, cpb, recovery];
  const byId = Object.fromEntries([...FORMS, procedureNote].map(f => [f.id, f]));
  const flat = form => form.sections.flatMap(s => s.fields);
  const isEmpty = v => v === '' || v === null || v === undefined || v === false || (Array.isArray(v) && !v.length);
  const active = (f, d) => !f.when || d[f.when.k] === f.when.v;

  // 讀一個欄位的原始值 → 正規化後的值；格式錯誤直接擋下。
  function parse(f, raw, label, must, env) {
    const s = String(raw ?? '').trim();
    switch (f.t) {
      // 臨床選項：只收啟用中的選項代碼；沒給選項來源時（離線重跑檢核）只看格式。
      case 'option': if (s === '') return ''; must(env && env.options ? env.options(f.set).some(o => o.id === s) : /^[A-Z][A-Z0-9_]{1,23}$/.test(s), `${label}: “${s}” is not an active option`); return s;
      case 'check': return raw === true || raw === 'on' || raw === '1' || raw === 'true';
      case 'multi': { const allowed = f.opts.map(o => o[0]); return (Array.isArray(raw) ? raw : s.split(',')).map(x => String(x).trim()).filter(x => allowed.includes(x)); }
      case 'number': case 'int': {
        if (s === '') return '';
        must(Number.isFinite(Number(s)), label + ' must be a number');
        const v = Number(s);
        if (f.t === 'int') must(Number.isInteger(v), label + ' must be a whole number');
        if (!f.neg) must(v >= (f.min ?? 0), label + ' cannot be less than ' + (f.min ?? 0));
        if (f.gt) must(v > 0, label + ' must be greater than 0');
        if (f.positive) must(v >= 1, label + ' must be at least 1');
        if (f.max !== undefined) must(v <= f.max, label + ' cannot be greater than ' + f.max);
        return v;
      }
      case 'date': if (s === '') return ''; must(/^\d{4}-\d\d-\d\d$/.test(s), label + ' has an invalid date format'); return s;
      case 'datetime': if (s === '') return ''; must(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s), label + ' has an invalid time format'); return s;
      case 'yesno': if (s === '') return ''; must(['yes', 'no'].includes(s), label + ' must be Yes or No'); return s;
      case 'score': if (s === '') return ''; must(f.opts.some(o => o[0] === s), label + ' has an invalid score'); return Number(s);
      case 'select': if (s === '') return ''; if (!f.other) must(f.opts.some(o => o[0] === s), label + ' is not one of the options'); return s.slice(0, 200);
      default: return s.slice(0, 4000);
    }
  }
  // 把畫面送來的 payload 依表單定義檢核並正規化；不在定義裡的欄位一律不收。
  function validate(formId, payload, env) {
    const form = byId[formId]; const must = env.must; must(form, 'Invalid perioperative record type');
    const d = {};
    for (const f of flat(form)) {
      if (f.t === 'repeat') {
        const rows = [];
        for (let i = 0; i < f.rows; i++) {
          const row = {}; f.fields.forEach(sf => { row[sf.k] = parse(sf, payload[f.k + ':' + i + ':' + sf.k], f.label + ' row ' + (i + 1) + ', “' + sf.label + '”', must, env); });
          if (Object.values(row).every(isEmpty)) continue;
          f.fields.forEach(sf => must(!sf.req || !isEmpty(row[sf.k]), f.label + ' row ' + (i + 1) + ': please fill in ' + sf.label));
          rows.push(row);
        }
        must(rows.length >= (f.minRows || 0), f.label + ' requires at least ' + f.minRows + (f.minRows === 1 ? ' row' : ' rows'));
        d[f.k] = rows;
      } else {
        d[f.k] = parse(f, payload[f.k], f.label, must, env);
        if (f.t === 'yesno' && f.noteWhenYes) d[f.k + 'Note'] = String(payload[f.k + 'Note'] ?? '').trim().slice(0, 2000);
      }
    }
    for (const f of flat(form)) {
      if (f.t === 'repeat') continue;
      if (!active(f, d)) { d[f.k] = f.t === 'check' ? false : f.t === 'multi' ? [] : ''; continue; }   // 條件不成立的欄位清空，不留舊值
      if (f.req && f.t !== 'signer') must(!isEmpty(d[f.k]), 'Required: ' + f.label);
      if (f.t === 'yesno' && f.noteWhenYes && !f.noteOptional) must(d[f.k] !== 'yes' || d[f.k + 'Note'], f.label + ': details are required when “Yes” is selected');
      if ((f.t === 'date' || f.t === 'datetime') && d[f.k]) {
        if (f.notFuture) must(d[f.k].slice(0, f.t === 'date' ? 10 : 16) <= String(env.now).slice(0, f.t === 'date' ? 10 : 16), f.label + ' cannot be later than now');
        if (f.notBeforeAdmission && env.admitted) must(d[f.k].slice(0, 10) >= String(env.admitted).slice(0, 10), f.label + ' cannot be earlier than the admission date');
      }
      if (f.t === 'people') d[f.k] = people(d[f.k]).join(', ');
      if (f.t === 'signer') {
        const team = [...people(d[f.team]), ...people(d[f.teamAlso])];
        d[f.k] = d[f.k] || team[0] || '';
        must(d[f.k], 'Required: ' + f.label);
        must(team.includes(d[f.k]), f.label + ' must be a member of the performing team');
      }
    }
    if (form.check) form.check(d, must);
    return d;
  }
  // 存下的紀錄 → 表單欄位（修訂時回填、驗證器重跑檢核用）。
  function toPayload(formId, data) {
    const out = {};
    for (const f of flat(byId[formId])) {
      const v = data[f.k];
      if (f.t === 'repeat') (v || []).forEach((row, i) => f.fields.forEach(sf => { const x = row[sf.k]; out[f.k + ':' + i + ':' + sf.k] = x === true ? 'on' : x === false ? '' : String(x ?? ''); }));
      else if (f.t === 'check') out[f.k] = v ? 'on' : '';
      else if (f.t === 'multi') out[f.k] = (v || []).join(',');
      else out[f.k] = String(v ?? '');
      if (f.t === 'yesno' && f.noteWhenYes) out[f.k + 'Note'] = String(data[f.k + 'Note'] ?? '');
    }
    return out;
  }
  const api = {FORMS, byId, procedureNote, flat, validate, toPayload, active, people, drugTotals, lastScore, rowTotal};
  if (typeof module !== 'undefined') module.exports = api; else root.ICUPeriopForms = api;
})(globalThis);
