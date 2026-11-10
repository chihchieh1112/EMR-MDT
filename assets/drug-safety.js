/* 用藥安全提示（示範規則表）。
   這不是商用藥物交互作用資料庫，也不是院方核定的用藥規則：規則寫在下面的 rules 陣列裡，
   全部以 B 目錄快照既有的 ATC 碼與成分欄位比對，沒有任何推論或機器判定。
   顯示的處理方式是「可選的處理選項」，由醫師人工決定並記錄，系統不代為決策。 */
(function (root) {
  'use strict';

  // --- 藥理類別：以 B 目錄既有的 ATC 前綴比對，不另建藥品分類主檔 -------------------
  const classes = {
    nsaid:      {label:'NSAID analgesics', atc:['M01A','N02BA01','B01AC06']},
    anticoag:   {label:'Anticoagulants', atc:['B01AA','B01AB','B01AE','B01AF','B01AX']},
    antiplate:  {label:'Antiplatelets', atc:['B01AC']},
    warfarin:   {label:'Warfarin', atc:['B01AA03']},
    ssri:       {label:'SSRI antidepressants', atc:['N06AB']},
    steroid:    {label:'Systemic corticosteroids', atc:['H02AB']},
    acearb:     {label:'ACEI / ARB', atc:['C09A','C09B','C09C','C09D']},
    ksparing:   {label:'Potassium-sparing diuretics', atc:['C03D']},
    potassium:  {label:'Potassium supplements', atc:['A12BA','B05XA01']},
    loop:       {label:'Loop diuretics', atc:['C03C']},
    thiazide:   {label:'Thiazide diuretics', atc:['C03A','C03B']},
    aminogly:   {label:'Aminoglycoside antibiotics', atc:['J01G']},
    glycopep:   {label:'Vancomycin / glycopeptides', atc:['J01XA']},
    macrolide:  {label:'Macrolide antibiotics', atc:['J01FA']},
    quinolone:  {label:'Fluoroquinolone antibiotics', atc:['J01M']},
    tetracyc:   {label:'Tetracycline antibiotics', atc:['J01A']},
    qt:         {label:'QT-prolonging drugs', atc:['J01FA','J01M','N05AD01','C01BD01','A04AA01','N05AH03','J02AC']},
    opioid:     {label:'Opioid analgesics', atc:['N02A','N01AH']},  // N01AH：麻醉用鴉片（fentanyl 等），ICU 當鎮痛鎮靜用（2026-10-23）
    benzo:      {label:'Benzodiazepines / sedatives', atc:['N05BA','N05CD','N03AE01']},
    statin:     {label:'Statins (lipid-lowering)', atc:['C10AA']},
    digoxin:    {label:'Digoxin', atc:['C01AA05']},
    theophyl:   {label:'Theophylline', atc:['R03DA','R03DC']},
    cation:     {label:'Polyvalent cation products (Ca / Mg / Al / Fe / Zn)', atc:['A02AA','A02AB','A02AC','A02AD','A12AA','A12CC','B03A','A12CB']},
    ppi:        {label:'Proton pump inhibitors', atc:['A02BC']},
    metformin:  {label:'Metformin', atc:['A10BA02']},
    betablock:  {label:'Beta blockers', atc:['C07']},
    penicillin: {label:'Penicillin antibiotics', atc:['J01C']},
    cephalo:    {label:'Cephalosporin antibiotics', atc:['J01D']},
    carbapenem: {label:'Carbapenem antibiotics', atc:['J01DH']},
    sulfonyl:   {label:'Sulfonylureas (glucose-lowering)', atc:['A10BB','A10BD']}
  };

  // --- 診斷群組：以 B 目錄 ICD-10 碼前綴比對，和上面的 ATC 前綴同一個做法 -------------
  //     ICD 目錄有一萬多筆，逐碼寫規則不可行；規則一律寫在群組上。
  const conditionGroups = {
    ckd:        {label:'Chronic kidney disease', icd:['N18']},
    aki:        {label:'Acute kidney injury', icd:['N17']},
    gibleed:    {label:'GI bleeding / ulcer', icd:['K92','K25','K26','K27','K28']},
    ichbleed:   {label:'Intracranial hemorrhage', icd:['I60','I61','I62','S06']},
    asthma:     {label:'Asthma', icd:['J45','J46']},
    copd:       {label:'COPD', icd:['J44']},
    respfail:   {label:'Respiratory failure', icd:['J96']},
    heartfail:  {label:'Heart failure', icd:['I50']},
    arrhythmia: {label:'Arrhythmia / conduction block', icd:['I44','I45','I47','I49']},
    hyperk:     {label:'Hyperkalemia', icd:['E87.5']},
    hepatic:    {label:'Hepatic impairment', icd:['K70','K71','K72','K74']},
    pregnancy:  {label:'Pregnancy', icd:['O','Z34','Z33']},
    diabetes:   {label:'Diabetes', icd:['E10','E11','E13','E14']},
    epilepsy:   {label:'Epilepsy', icd:['G40','G41']},
    shock:      {label:'Shock', icd:['R57']}
  };

  // --- 規則表：每條規則的風險敘述、可選處理方式與監測項目都要人工核定後才可上線 -------
  // severity: high = 建立草稿前需人工選擇處理方式；moderate／low = 提示但不擋。
  const rules = [
    {id:'RX-DUAL-01', a:'nsaid', b:'nsaid', severity:'high',
     risk:'Ordering two NSAIDs together is duplicate therapy: analgesia does not add up, but GI bleeding and kidney injury risks do.',
     handling:['Stop one; keep only one NSAID','Change one to as needed (PRN) with a maximum number of doses','Keep both at reduced doses and add gastric mucosal protection'],
     monitor:'Hb, Cr, urine output, upper GI symptoms'},
    {id:'RX-BLEED-01', a:'nsaid', b:'anticoag', severity:'high',
     risk:'Both affect coagulation or the gastric mucosa; combined use adds up GI and other bleeding risks.',
     handling:['Stop one (stop the NSAID first; switch to another analgesic strategy)','Keep both, add gastric mucosal protection, and shorten the course','Keep current order; set separate bleeding monitoring and stop criteria'],
     monitor:'Hb / Hct, platelets, coagulation, fecal occult blood, melena or bloody drainage'},
    {id:'RX-BLEED-02', a:'nsaid', b:'antiplate', severity:'high',
     risk:'NSAID plus antiplatelet increases GI bleeding risk.',
     handling:['Stop one','Add gastric mucosal protection and shorten the NSAID course','Keep current order; set separate bleeding monitoring and stop criteria'],
     monitor:'Hb, platelets, upper GI symptoms'},
    {id:'RX-BLEED-03', a:'warfarin', b:'quinolone', severity:'high',
     risk:'The antibiotic may enhance the anticoagulant effect of Warfarin and raise INR.',
     handling:['Switch to an antibiotic with fewer interactions','Continue with a shorter antibiotic course and more frequent INR monitoring','Temporarily adjust Warfarin dose and schedule a recheck'],
     monitor:'INR (once 2–3 days after starting and once 2–3 days after stopping the antibiotic), bleeding signs'},
    {id:'RX-BLEED-04', a:'warfarin', b:'macrolide', severity:'high',
     risk:'Macrolides inhibit metabolism and may enhance the anticoagulant effect of Warfarin.',
     handling:['Switch to an antibiotic with fewer interactions','Increase INR monitoring frequency','Temporarily adjust Warfarin dose and schedule a recheck'],
     monitor:'INR, bleeding signs'},
    {id:'RX-BLEED-05', a:'ssri', b:'nsaid', severity:'moderate',
     risk:'SSRI plus NSAID increases upper GI bleeding risk.',
     handling:['Stop one','Add gastric mucosal protection','Keep current order and document a monitoring plan'],
     monitor:'Upper GI symptoms, Hb'},
    {id:'RX-RENAL-01', a:'nsaid', b:'acearb', severity:'high',
     risk:'NSAID plus ACEI / ARB reduces renal blood flow; with a concurrent diuretic, acute kidney injury risk rises further.',
     handling:['Stop one (stop the NSAID first)','Keep current order and track renal function and urine output daily','Adjust dose and shorten the course'],
     monitor:'Cr, eGFR, K, daily urine output and weight'},
    {id:'RX-RENAL-02', a:'nsaid', b:'loop', severity:'moderate',
     risk:'NSAIDs blunt diuretic and antihypertensive effects and increase kidney injury risk.',
     handling:['Stop one','Keep current order and track urine output and weight','Adjust diuretic dose'],
     monitor:'Urine output, weight, Cr, Na'},
    {id:'RX-K-01', a:'acearb', b:'ksparing', severity:'high',
     risk:'Both raise serum potassium; combined use carries a risk of hyperkalemia.',
     handling:['Stop one','Keep current order and schedule a potassium recheck','Adjust dose and limit potassium-containing IV fluids'],
     monitor:'K (recheck within 24–72 h of ordering), ECG'},
    {id:'RX-K-02', a:'acearb', b:'potassium', severity:'high',
     risk:'ACEI / ARB with potassium supplementation can raise potassium rapidly.',
     handling:['Hold potassium supplementation','Reduce supplementation rate and total amount, then recheck','Keep current order and monitor more closely'],
     monitor:'K, ECG, urine output'},
    {id:'RX-K-03', a:'ksparing', b:'potassium', severity:'high',
     risk:'A potassium-sparing diuretic with potassium supplementation markedly increases hyperkalemia risk.',
     handling:['Hold potassium supplementation','Stop one','Keep current order and monitor more closely'],
     monitor:'K, ECG'},
    {id:'RX-OTO-01', a:'aminogly', b:'loop', severity:'high',
     risk:'Aminoglycoside plus loop diuretic worsens ototoxicity and nephrotoxicity.',
     handling:['Stop one','Separate administration times and reduce doses','Keep current order and schedule drug level and renal function monitoring'],
     monitor:'Cr, urine output, hearing and tinnitus complaints, drug levels (if available)'},
    {id:'RX-NEPH-01', a:'aminogly', b:'glycopep', severity:'high',
     risk:'Combining two nephrotoxic antibiotics adds up acute kidney injury risk.',
     handling:['Stop one or switch to another antibiotic','Continue combination therapy but adjust doses for renal function','Decide after scheduling drug level monitoring'],
     monitor:'Cr, eGFR, urine output, drug levels (if available)'},
    {id:'RX-RESP-01', a:'opioid', b:'benzo', severity:'high',
     risk:'Opioids combined with sedative-hypnotics worsen respiratory depression and oversedation.',
     handling:['Stop one','Reduce both doses and stagger administration times','Keep current order and increase respiratory and consciousness monitoring frequency'],
     monitor:'Respiratory rate, SpO₂, sedation score, need for a reversal agent'},
    {id:'RX-QT-01', a:'qt', b:'qt', severity:'moderate',
     risk:'Both orders are QT-prolonging drugs; combined use increases arrhythmia risk.',
     handling:['Stop one or switch drugs','Keep current order and track ECG and electrolytes','Stagger administration times'],
     monitor:'ECG QTc, K, Mg, Ca'},
    {id:'RX-DIG-01', a:'digoxin', b:'loop', severity:'moderate',
     risk:'Diuretic-induced hypokalemia increases the risk of Digoxin toxicity.',
     handling:['Supplement and track potassium','Adjust diuretic dose','Keep current order and schedule Digoxin level monitoring'],
     monitor:'K, Mg, ECG, Digoxin level (if available)'},
    {id:'RX-STATIN-01', a:'statin', b:'macrolide', severity:'moderate',
     risk:'Macrolides inhibit Statin metabolism, increasing myopathy and rhabdomyolysis risk.',
     handling:['Hold the Statin during the antibiotic course','Switch to an antibiotic with fewer interactions','Keep current order and track CK and muscle symptoms'],
     monitor:'CK, muscle pain or weakness complaints, urine color'},
    {id:'RX-THEO-01', a:'theophyl', b:'quinolone', severity:'moderate',
     risk:'The antibiotic inhibits Theophylline metabolism and may cause excessive levels.',
     handling:['Switch to an antibiotic with fewer interactions','Reduce Theophylline dose','Keep current order and track drug levels'],
     monitor:'Theophylline level, heart rate, nausea, seizure signs'},
    {id:'RX-ABS-01', a:'quinolone', b:'cation', severity:'moderate',
     risk:'Polyvalent cations chelate with the antibiotic, markedly reducing oral absorption.',
     handling:['Stagger administration (2 h before or 4–6 h after the antibiotic)','Switch to IV administration','Hold cation products'],
     monitor:'Infection treatment response; drug levels if needed'},
    {id:'RX-ABS-02', a:'tetracyc', b:'cation', severity:'moderate',
     risk:'Polyvalent cations reduce absorption of Tetracycline antibiotics.',
     handling:['Stagger administration times','Switch to IV administration','Hold cation products'],
     monitor:'Infection treatment response'},
    {id:'RX-GI-01', a:'nsaid', b:'steroid', severity:'moderate',
     risk:'NSAID with systemic corticosteroids increases GI ulcer and bleeding risk.',
     handling:['Stop one','Add gastric mucosal protection','Keep current order and document a monitoring plan'],
     monitor:'Upper GI symptoms, Hb, fecal occult blood'}

  ];

  // --- 藥品 × 診斷規則表：severity 'contraindicated' 需填覆寫理由才能建立草稿 ---------
  //     這裡只寫「診斷讓這個藥不該開」的禁忌；「開了藥卻沒有對應診斷」屬於給付核刪，
  //     不是用藥安全問題，不放進這張表。
  const conditionRules = [
    {id:'DX-GI-01', drug:'nsaid', cond:'gibleed', severity:'contraindicated',
     risk:'Patient has a history of GI bleeding or ulcer; NSAIDs directly worsen mucosal injury and rebleeding risk.',
     handling:['Switch to another analgesic strategy (Acetaminophen, local or nerve block)','Use only after confirming bleeding is controlled and adding gastric mucosal protection','Keep current order and set bleeding monitoring and stop criteria'],
     monitor:'Hb / Hct, fecal occult blood, melena or bloody drainage, epigastric pain'},
    {id:'DX-GI-02', drug:'anticoag', cond:'gibleed', severity:'contraindicated',
     risk:'Active or recent GI bleeding with anticoagulation carries a high rebleeding risk.',
     handling:['Hold anticoagulation and evaluate reversal','Switch to a lower-intensity anticoagulation strategy','Start only after the bleeding source is managed, with recheck criteria set'],
     monitor:'Hb, platelets, coagulation, vital signs'},
    {id:'DX-ICH-01', drug:'anticoag', cond:'ichbleed', severity:'contraindicated',
     risk:'Anticoagulants in patients with intracranial hemorrhage may cause hematoma expansion.',
     handling:['Hold anticoagulation and evaluate reversal','Confirm with neurosurgery when it can be started','Keep current order and schedule follow-up imaging'],
     monitor:'Consciousness, pupils, follow-up brain imaging, coagulation'},
    {id:'DX-RENAL-01', drug:'nsaid', cond:'ckd', severity:'high',
     risk:'In chronic kidney disease, NSAIDs reduce renal blood flow and may further worsen renal function.',
     handling:['Switch to another analgesic strategy','Adjust dose to renal function and shorten the course','Keep current order and track renal function and urine output daily'],
     monitor:'Cr, eGFR, daily urine output and weight, K'},
    {id:'DX-RENAL-02', drug:'nsaid', cond:'aki', severity:'contraindicated',
     risk:'NSAIDs during acute kidney injury may prolong or worsen the injury.',
     handling:['Stop NSAID; switch to another analgesic strategy','Reassess after renal function recovers'],
     monitor:'Cr, eGFR, daily urine output'},
    {id:'DX-RENAL-03', drug:'aminogly', cond:'ckd', severity:'high',
     risk:'Aminoglycosides in renal impairment raise the risk of drug accumulation, nephrotoxicity, and ototoxicity.',
     handling:['Switch to another antibiotic','Adjust dose and interval to renal function','Decide after scheduling drug level monitoring'],
     monitor:'Cr, eGFR, urine output, hearing and tinnitus complaints, drug levels (if available)'},
    {id:'DX-RENAL-04', drug:'metformin', cond:'ckd', severity:'high',
     risk:'Metformin in renal impairment carries a risk of lactic acidosis; contraindicated in severe kidney disease.',
     handling:['Stop Metformin; switch to another glucose-lowering strategy','Check eGFR, then adjust dose per hospital policy','Keep current order and monitor lactate and renal function'],
     monitor:'eGFR, lactate, blood glucose, pH'},
    {id:'DX-RENAL-05', drug:'acearb', cond:'aki', severity:'high',
     risk:'ACEI / ARB during acute kidney injury lowers glomerular perfusion pressure and may prolong the injury.',
     handling:['Hold and reassess after renal function recovers','Reduce dose and monitor daily','Keep current order and monitor renal function and K more often'],
     monitor:'Cr, eGFR, K, daily urine output'},
    {id:'DX-K-01', drug:'ksparing', cond:'hyperk', severity:'contraindicated',
     risk:'Potassium-sparing diuretics in existing hyperkalemia will raise K further, with a risk of fatal arrhythmia.',
     handling:['Stop potassium-sparing diuretic','Treat hyperkalemia first; reassess after recheck'],
     monitor:'K, ECG'},
    {id:'DX-K-02', drug:'potassium', cond:'hyperk', severity:'contraindicated',
     risk:'Potassium supplementation in existing hyperkalemia may cause fatal arrhythmia.',
     handling:['Stop potassium supplementation','Switch to potassium-lowering treatment and recheck'],
     monitor:'K, ECG, urine output'},
    {id:'DX-K-03', drug:'acearb', cond:'hyperk', severity:'high',
     risk:'ACEI / ARB raises K; the risk is higher with existing hyperkalemia.',
     handling:['Hold and treat hyperkalemia first','Reduce dose and schedule K recheck','Keep current order and limit potassium-containing IV fluids'],
     monitor:'K, ECG'},
    {id:'DX-RESP-01', drug:'betablock', cond:'asthma', severity:'high',
     risk:'Beta-blockers may induce bronchospasm; patients with asthma are at risk of acute exacerbation.',
     handling:['Switch to a more cardioselective beta-blocker or another antihypertensive strategy','Stop and switch to an alternative drug','Keep current order; have bronchodilators ready and monitor'],
     monitor:'Breathing pattern, wheezing, SpO₂, peak expiratory flow'},
    {id:'DX-RESP-02', drug:'opioid', cond:'respfail', severity:'high',
     risk:'Opioid analgesics in respiratory failure worsen respiratory depression.',
     handling:['Reduce dose and extend dosing interval','Switch to non-opioid analgesia','Keep current order; increase respiratory monitoring and have a reversal agent ready'],
     monitor:'Respiratory rate, SpO₂, blood CO₂, level of consciousness'},
    {id:'DX-RESP-03', drug:'benzo', cond:'respfail', severity:'high',
     risk:'Sedative-hypnotics in respiratory failure worsen hypoventilation.',
     handling:['Reduce dose or stop','Switch to another sedation strategy','Keep current order and increase respiratory and consciousness monitoring frequency'],
     monitor:'Respiratory rate, SpO₂, blood CO₂, sedation score'},
    {id:'DX-CARD-01', drug:'betablock', cond:'arrhythmia', severity:'high',
     risk:'Beta-blockers with existing conduction block or bradycardia may cause more severe bradycardia.',
     handling:['Stop and switch to another strategy','Reduce dose and continue ECG monitoring','Keep current order and have rhythm support ready'],
     monitor:'Heart rate, ECG, blood pressure'},
    {id:'DX-CARD-02', drug:'qt', cond:'arrhythmia', severity:'high',
     risk:'QT-prolonging drugs in patients with a history of arrhythmia increase the risk of arrhythmia.',
     handling:['Switch to an alternative that does not prolong QT','Keep current order and track ECG and electrolytes','Stagger administration times and reduce dose'],
     monitor:'ECG QTc, K, Mg, Ca'},
    {id:'DX-HF-01', drug:'nsaid', cond:'heartfail', severity:'high',
     risk:'NSAIDs cause sodium and water retention and may worsen heart failure.',
     handling:['Switch to another analgesic strategy','Shorten the course and monitor fluid status','Keep current order and monitor weight and urine output daily'],
     monitor:'Weight, urine output, breathing pattern, lower-limb edema'},
    {id:'DX-PREG-01', drug:'acearb', cond:'pregnancy', severity:'contraindicated',
     risk:'ACEI / ARB in pregnancy causes fetal renal and skull developmental abnormalities.',
     handling:['Stop and switch to an antihypertensive safe in pregnancy'],
     monitor:'Blood pressure, fetal ultrasound, amniotic fluid volume'},
    {id:'DX-PREG-02', drug:'warfarin', cond:'pregnancy', severity:'contraindicated',
     risk:'Warfarin crosses the placenta; use in pregnancy carries teratogenic and fetal bleeding risk.',
     handling:['Switch to a pregnancy-compatible anticoagulant such as low-molecular-weight heparin'],
     monitor:'Coagulation, fetal ultrasound'},
    {id:'DX-HEP-01', drug:'statin', cond:'hepatic', severity:'moderate',
     risk:'Statins in hepatic impairment increase the risk of hepatotoxicity and myopathy.',
     handling:['Hold Statin until liver function improves','Reduce dose and monitor','Keep current order and monitor liver function and CK'],
     monitor:'AST / ALT, bilirubin, CK'},
    {id:'DX-DM-01', drug:'steroid', cond:'diabetes', severity:'moderate',
     risk:'Systemic corticosteroids raise blood glucose; diabetic patients may need their glucose-lowering therapy adjusted.',
     handling:['Increase glucose monitoring and set adjustment rules in advance','Shorten the steroid course','Keep current order and request endocrinology consultation'],
     monitor:'Pre- and post-meal blood glucose, ketones (if needed)'},
    {id:'DX-EPI-01', drug:'quinolone', cond:'epilepsy', severity:'moderate',
     risk:'Fluoroquinolones lower the seizure threshold.',
     handling:['Switch to another antibiotic','Keep current order and confirm antiepileptic drug levels are adequate','Increase frequency of neuro checks'],
     monitor:'Seizure frequency, antiepileptic drug levels (if available)'},
    {id:'DX-SHOCK-01', drug:'metformin', cond:'shock', severity:'contraindicated',
     risk:'Metformin in shock or tissue hypoperfusion markedly increases the risk of lactic acidosis.',
     handling:['Stop Metformin; control glucose with insulin'],
     monitor:'Lactate, pH, blood glucose, perfusion markers'}
  ];

  const norm = v => String(v || '').trim().toUpperCase();
  const atcOf = item => norm(item && (item.atc || (item.catalog && item.catalog.atc)));
  const ingredientOf = item => String((item && (item.ingredient || (item.catalog && item.catalog.ingredient))) || '').trim().toLowerCase();
  const nameOf = item => (item && (item.zh || item.name)) || 'Drug name not provided by source';
  const routeIdOf = item => String((item && (item.routeId || (item.catalog && item.catalog.routeId))) || '').trim();

  function classesOf(item) {
    const atc = atcOf(item);
    if (!atc) return [];
    return Object.keys(classes).filter(id => classes[id].atc.some(prefix => atc.startsWith(norm(prefix))));
  }
  // 一個 ICD 碼可能落在多個群組（例如 N18.5 同時是慢性腎病）；全部回傳，規則各自比對。
  function conditionGroupsOf(code) {
    const icd = norm(code);
    if (!icd) return [];
    return Object.keys(conditionGroups).filter(id => conditionGroups[id].icd.some(prefix => icd.startsWith(norm(prefix))));
  }

  // --- 四級嚴重度 ------------------------------------------------------------------
  // contraindicated：要填覆寫理由才能建立草稿；high：要選處理方式；moderate：卡片內顯示不打斷；
  // low：收在展開明細。分級與對應行為屬院方用藥安全政策，見待討論議題。
  const severities = ['contraindicated', 'high', 'moderate', 'low'];
  const severityRank = {contraindicated: 0, high: 1, moderate: 2, low: 3};
  const severityLabel = s => ({contraindicated: 'Contraindicated', high: 'Action required', moderate: 'Caution', low: 'Info'}[s] || s);
  const needsOverride = c => c.severity === 'contraindicated';
  const needsHandling = c => c.severity === 'high';
  const downgrade = s => severities[Math.min(severityRank[s] + 1, severities.length - 1)];

  // 把待開清單與病人現行醫囑攤平成同一種比對單位。
  function subjectsFromCart(cart) {
    return (cart || []).filter(e => e.kind === 'medication').map(e => ({
      id: e.key, key: e.key, name: nameOf(e), atc: atcOf(e), ingredient: ingredientOf(e),
      origin: 'cart', originLabel: 'Pending order', classes: classesOf(e)
    }));
  }
  function subjectsFromOrders(orders) {
    return (orders || [])
      // 醫囑加入即生效（2026-11-01），不等 HIS 受理：新開、還沒進每日處方的藥囑也要比對（2026-11-02）。
      .filter(o => o.kind === 'medication' && o.clinical === 'active')
      .map(o => ({
        id: o.id, key: o.catalog && o.catalog.key, name: o.catalog ? nameOf(o.catalog) : o.name,
        atc: atcOf(o), ingredient: ingredientOf(o), origin: 'order', originLabel: 'Current order ' + o.id,
        detail: [o.dose, o.route, o.frequency].filter(Boolean).join(' · '), classes: classesOf(o),
        start: o.start || null, end: o.end || null
      }));
  }

  // --- 病人端來源：過敏（FHIR AllergyIntolerance 子集）與問題清單（FHIR Condition 子集）------
  function activeAllergies(patient) {
    return ((patient && patient.allergies) || []).filter(a =>
      (a.clinicalStatus || 'active') === 'active' &&
      !['refuted', 'entered-in-error'].includes(a.verificationStatus || 'unconfirmed'));
  }
  function activeConditions(patient) {
    return ((patient && patient.conditions) || []).filter(c =>
      (c.clinicalStatus || 'active') === 'active' &&
      !['refuted', 'entered-in-error'].includes(c.verificationStatus || 'unconfirmed'));
  }

  // --- 交叉過敏：對 A 類過敏的人用 B 類也可能反應。清單要院方藥師核定後才可上線。
  const crossSensitivity = {
    penicillin: ['cephalo', 'carbapenem'],
    cephalo: ['penicillin', 'carbapenem'],
    carbapenem: ['penicillin', 'cephalo']
  };

  // --- 藥 × 過敏：直接命中（同品項／同成分／同類別）是禁忌；交叉過敏低一級 -----------------
  //     成分只做字串相等比對，複方藥與不同寫法比不出來，所以類別層不可省略。
  const ALLERGY_LAYERS = {
    product:    {label: 'Same item as allergy record', base: 'contraindicated'},
    ingredient: {label: 'Same ingredient as allergy record', base: 'contraindicated'},
    klass:      {label: 'In a drug class listed in allergy record', base: 'contraindicated'},
    cross:      {label: 'Possible cross-allergy with a class in allergy record', base: 'high'}
  };
  function allergyLayer(subject, allergy) {
    if (allergy.substanceKind === 'medication' && allergy.code && allergy.code.key && allergy.code.key === subject.key) return 'product';
    const ing = String(allergy.ingredient || '').trim().toLowerCase();
    if (ing && subject.ingredient && ing === subject.ingredient) return 'ingredient';
    if (!allergy.drugClass) return null;
    if (subject.classes.includes(allergy.drugClass)) return 'klass';
    if ((crossSensitivity[allergy.drugClass] || []).some(id => subject.classes.includes(id))) return 'cross';
    return null;
  }
  // 嚴重度由「反應型態與危急度」決定，不由藥決定；未確診的過敏降一級，但仍然要顯示。
  function allergySeverity(layer, allergy) {
    const severe = allergy.criticality === 'high' || (allergy.reaction && allergy.reaction.severity === 'severe');
    let level = ALLERGY_LAYERS[layer].base;
    if (!severe) level = downgrade(level);
    if ((allergy.verificationStatus || 'unconfirmed') === 'unconfirmed') level = downgrade(level);
    return level;
  }
  function allergyConflicts(cartItems, patient) {
    const list = activeAllergies(patient);
    const out = [];
    cartItems.forEach(subject => {
      list.forEach(allergy => {
        const layer = allergyLayer(subject, allergy);
        if (!layer) return;
        const reaction = allergy.reaction || {};
        const detail = [reaction.manifestation, reaction.severity ? 'Reaction ' + reaction.severity : '',
          allergy.criticality ? 'Criticality ' + allergy.criticality : '',
          allergy.verificationStatus || ''].filter(Boolean).join(' · ');
        out.push({
          pair: subject.id + '|ALG|' + allergy.id, ruleId: 'ALG-' + layer.toUpperCase(),
          severity: allergySeverity(layer, allergy), kind: 'allergy', involvesCart: true,
          label: 'Allergy conflict', basis: ALLERGY_LAYERS[layer].label,
          left: subject,
          right: {id: allergy.id,
            name: (allergy.code && (allergy.code.text || allergy.code.zh || allergy.code.name)) || allergy.ingredient || 'Allergen not provided by source',
            originLabel: 'Allergy record', detail},
          risk: 'Pending medication: ' + ALLERGY_LAYERS[layer].label + '; may trigger the allergic reaction again.',
          handling: ['Switch to an alternative with no cross-allergy concern', 'Confirm this allergy record is wrong and amend it in patient data', 'Clinically necessary: have emergency drugs ready and increase observation'],
          monitor: 'Skin, breathing pattern and wheezing, blood pressure; observe closely for 30 min after administration'
        });
      });
    });
    return out;
  }

  // --- 藥 × 診斷：以診斷群組比對，只寫禁忌，不寫「缺適應症」（那是給付問題）---------------
  function conditionConflicts(cartItems, patient) {
    const conditions = activeConditions(patient).map(c => {
      const code = (c.code && c.code.code) || '';
      return {id: c.id, code, name: (c.code && (c.code.zh || c.code.english || c.code.name)) || 'Diagnosis name not provided by source',
        groups: conditionGroupsOf(code)};
    });
    const out = [];
    cartItems.forEach(subject => {
      conditions.forEach(condition => {
        conditionRules.forEach(rule => {
          if (!subject.classes.includes(rule.drug) || !condition.groups.includes(rule.cond)) return;
          out.push({
            pair: subject.id + '|DX|' + condition.id + '|' + rule.id, ruleId: rule.id,
            severity: rule.severity, kind: 'condition', involvesCart: true,
            label: classes[rule.drug].label + ' × ' + conditionGroups[rule.cond].label,
            basis: 'ATC ' + (subject.atc || 'Not provided') + ' × ICD ' + (condition.code || 'Not provided'),
            left: subject,
            right: {id: condition.id, name: condition.name, originLabel: 'Problem list', detail: condition.code},
            risk: rule.risk, handling: rule.handling, monitor: rule.monitor
          });
        });
      });
    });
    return out;
  }

  const pairKey = (a, b, ruleId) => [a.id, b.id].sort().join('|') + '|' + ruleId;

  // 維護檔的藥對藥交互作用列（master.medicationInteraction）：成對存一列，比對時雙向；處理方式用分號或換行分開。
  const splitHandling = text => String(text || '').split(/\s*[;\n]\s*/).map(x => x.trim()).filter(Boolean);
  function maintainedConflict(row, x, y, involvesCart) {
    const a = row.medication, b = row.interacting_medication;
    if (!a || !b) return null;
    const direct = x.key === a && y.key === b, reverse = x.key === b && y.key === a;
    if (!direct && !reverse) return null;
    const left = direct ? x : y, right = direct ? y : x;
    const ruleId = 'MX-' + (row.id || a + '~' + b);
    return {pair: pairKey(x, y, ruleId), ruleId, severity: severityRank[row.severity] !== undefined ? row.severity : 'moderate', kind: 'interaction', involvesCart,
      label: row.category || 'Maintained interaction', left, right,
      basis: 'Maintained drug pair' + (row.reference ? ' · ' + row.reference : ''),
      risk: row.description || 'No summary maintained', handling: splitHandling(row.handling).length ? splitHandling(row.handling) : ['Stop one', 'Confirm intentional combination; record reason'],
      monitor: row.monitoring || 'Not specified', maintained: true};
  }

  // 每一筆結果都要能回答：跟「誰」衝突、為什麼、可以怎麼處理、要監測什麼。
  // extraRules（2026-10-18）：維護檔的藥對藥列，由 store 以 master.medicationInteraction 傳入，和內建規則集一起比對。
  function assess(cart, orders, patient, extraRules) {
    const cartItems = subjectsFromCart(cart);
    const orderItems = subjectsFromOrders(orders);
    const all = cartItems.concat(orderItems);
    const found = new Map();
    const add = conflict => { if (!found.has(conflict.pair)) found.set(conflict.pair, conflict); };

    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const x = all[i], y = all[j];
        const involvesCart = x.origin === 'cart' || y.origin === 'cart';

        if (x.ingredient && x.ingredient === y.ingredient) {
          add({pair: pairKey(x, y, 'RX-DUP-01'), ruleId: 'RX-DUP-01', severity: 'high', kind: 'duplicate', involvesCart,
            label: 'Duplicate ingredient', left: x, right: y, basis: 'Same ingredient field: ' + x.ingredient,
            risk: 'Both orders contain the same ingredient; doses add up and may cause overdose.',
            handling: ['Stop one', 'Merge into one order and recalculate total dose', 'Confirm intentional split dosing; record reason and total daily dose'],
            monitor: 'Total daily dose, toxicity markers for this ingredient'});
          continue;
        }
        if (x.atc && x.atc === y.atc) {
          add({pair: pairKey(x, y, 'RX-DUP-02'), ruleId: 'RX-DUP-02', severity: 'high', kind: 'duplicate', involvesCart,
            label: 'Duplicate ATC code', left: x, right: y, basis: 'Same ATC: ' + x.atc,
            risk: 'Both orders share the same 5-level ATC code; they may be different items with the same ingredient.',
            handling: ['Stop one', 'Merge into one order', 'Confirm intentional combination; record reason'],
            monitor: 'Total daily dose'});
        } else if (x.atc && y.atc && x.atc.slice(0, 4) === y.atc.slice(0, 4) && x.atc.slice(0, 4).length === 4) {
          add({pair: pairKey(x, y, 'RX-DUP-03'), ruleId: 'RX-DUP-03', severity: 'moderate', kind: 'duplicate', involvesCart,
            label: 'Duplicate therapeutic class', left: x, right: y, basis: 'Same first 4 ATC characters: ' + x.atc.slice(0, 4),
            risk: 'Both orders are in the same therapeutic class; efficacy may not add up, but side effects do.',
            handling: ['Stop one', 'Confirm intentional combination (e.g., dual antibiotic coverage); record reason', 'Adjust dose'],
            monitor: 'Class-common side effects and total daily dose'});
        }
        rules.forEach(rule => {
          const direct = x.classes.includes(rule.a) && y.classes.includes(rule.b);
          const reverse = x.classes.includes(rule.b) && y.classes.includes(rule.a);
          if (!direct && !reverse) return;
          if (rule.a === rule.b && x.id === y.id) return;
          const left = direct ? x : y, right = direct ? y : x;
          add({pair: pairKey(x, y, rule.id), ruleId: rule.id, severity: rule.severity, kind: 'interaction', involvesCart,
            label: classes[rule.a].label + ' × ' + classes[rule.b].label,
            left, right,
            basis: 'ATC ' + (left.atc || 'Not provided') + ' × ' + (right.atc || 'Not provided'),
            risk: rule.risk, handling: rule.handling, monitor: rule.monitor});
        });
        (extraRules || []).forEach(row => { const c = maintainedConflict(row, x, y, involvesCart); if (c) add(c); });
      }
    }
    allergyConflicts(cartItems, patient).forEach(add);
    conditionConflicts(cartItems, patient).forEach(add);
    return [...found.values()].sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.ruleId.localeCompare(b.ruleId));
  }

  // 無法比對的品項與來源要講清楚，不能讓「沒有提示」被讀成「已檢查過沒問題」。
  // knowledge（2026-10-18）：master.medicationKnowledge；有維護單次／每日上限的藥才算檢核過劑量上限。
  // weightDose（2026-10-18）：{藥品鍵: ICUMasterSchema.weightDose 的結果}；有維護每公斤上限、且這位病人算得出上限的藥才算檢核過每公斤上限。
  const kgReason = {'no-weight': 'no admission or measured weight recorded', 'no-band': 'patient outside every maintained band', 'no-birth-date': 'age bands need a birth date'};
  function coverage(cart, patient, knowledge, weightDose) {
    const meds = (cart || []).filter(e => e.kind === 'medication');
    const missing = meds.filter(e => !atcOf(e));
    const gaps = [];
    const noLimit = meds.filter(e => { const k = knowledge && knowledge[e.key]; return !(k && (k.max_single_dose || k.max_daily_dose)); });
    if (noLimit.length) gaps.push('Maximum dose not maintained for ' + noLimit.length + ' medication(s); dose-limit check not covered');
    if (missing.length) gaps.push('ATC code missing for ' + missing.length + ' medication(s); interactions and diagnosis contraindications not checked');
    const allergyStatus = (patient && patient.allergyStatus) || 'unknown';
    if (allergyStatus === 'unknown') gaps.push('Allergy history not recorded; allergy check not covered');
    else if (allergyStatus === 'recorded' && !activeAllergies(patient).length) gaps.push('No active allergy records; allergy check not covered');
    if (!activeConditions(patient).length) gaps.push('No active ICD diagnosis in problem list; diagnosis contraindication check not covered');
    const wd = weightDose || {}, noKg = meds.filter(e => !wd[e.key]), kgOpen = meds.filter(e => wd[e.key] && wd[e.key].status !== 'checked');
    if (noKg.length) gaps.push('Dose limits per kg not covered for ' + noKg.length + ' medication(s): no per-kg limit maintained');
    if (kgOpen.length) gaps.push('Per-kg dose limit not checked for ' + kgOpen.length + ' medication(s): ' + [...new Set(kgOpen.map(e => kgReason[wd[e.key].status] || wd[e.key].status))].join('; '));
    return {total: meds.length, checked: meds.length - missing.length, missing: missing.map(nameOf), gaps};
  }

  root.ICUDrugSafety = {
    classes, rules, conditionGroups, conditionRules, crossSensitivity,
    assess, coverage, classesOf, conditionGroupsOf,
    severities, severityRank, severityLabel, needsOverride, needsHandling,
    activeAllergies, activeConditions, routeIdOf
  };
  if (typeof module !== 'undefined') module.exports = root.ICUDrugSafety;
})(globalThis);
