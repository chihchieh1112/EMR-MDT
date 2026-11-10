/* EMR整合MDT demo 示範人員種子（2026-11-10，P1）。store.js 與 login.js 共用；登入頁讀不到瀏覽器儲存時退回這裡。
   全部虛構的英文姓名（見 demo規劃建議_v0.2 第 3 節）；帳號 username ＝ 名首字母＋姓。
   身分 role：doctor／nurse／admin 照原型；allied（營養、臨床藥學、復健、社工）是 demo 新增，原型的 guard 對這個身分一律唯讀，
   職類照會的寫入在 P3 才開。patients 是本班照護名單（與 seed-oncology.js 的照護關係一致）。 */
(function (root) {
  'use strict';
  const ALL = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12'];
  const MERCER = ['P03', 'P05', 'P06', 'P07', 'P08', 'P10', 'P12'];
  const GRANT = ['P01', 'P04', 'P09', 'P11'];
  const base = {status: 'active', deptAdmin: false};
  const COUNCIL = 'Demo Medical Council';
  const NURSING = 'Demo Nursing Council';
  const ALLIED = 'Demo Allied Health Council';
  const license = (n, issuer) => [{id: 'LIC-' + n, number: 'DEMO-' + n, issuer, validFrom: '2024-01-01', validTo: null, source: 'M', createdBy: 'seed', createdAt: '2026-01-01T00:00:00.000Z'}];
  const doc = (username, name, title, department, shift, patients, extra) => ({...base, licenses: license(username.toUpperCase(), COUNCIL), username, name, title, role: 'doctor', shift, patients, department, ...(extra || {})});
  const rn = (username, name, title, shift, patients, extra) => ({...base, licenses: license(username.toUpperCase(), NURSING), username, name, title, role: 'nurse', shift, patients, department: 'Oncology', ...(extra || {})});
  const allied = (username, name, title, department) => ({...base, licenses: license(username.toUpperCase(), ALLIED), username, name, title, role: 'allied', shift: 'D1', patients: [], department});
  const people = {
    // 腫瘤內科（Oncology Ward A）
    mercer: doc('dmercer', 'Dr. Daniel Mercer', 'Medical oncologist · attending', 'Oncology', 'D1', MERCER),
    grant: doc('ogrant', 'Dr. Oliver Grant', 'Medical oncologist · attending', 'Oncology', 'D1', GRANT),
    brooks: doc('hbrooks', 'Dr. Hannah Brooks', 'Medical oncology resident · MDT secretary', 'Oncology', 'D1', ALL),
    sutton: doc('msutton', 'Dr. Mark Sutton', 'Medical oncologist · night shift', 'Oncology', 'D2', MERCER),
    hartley: doc('whartley', 'Dr. William Hartley', 'Head of Medical Oncology', 'Oncology', 'D1', [], {deptAdmin: true}),
    // 其他科醫師（乳癌團隊成員）
    ashford: doc('rashford', 'Dr. Richard Ashford', 'Head of Breast Surgery · MDT chair', 'Breast Surgery', 'D1', ['P02']),
    kemp: doc('akemp', 'Dr. Andrew Kemp', 'Breast surgeon · deputy chair', 'Breast Surgery', 'D1', []),
    finch: doc('lfinch', 'Dr. Laura Finch', 'Radiation oncologist', 'Radiation Oncology', 'D1', []),
    price: doc('sprice', 'Dr. Samuel Price', 'Radiologist', 'Diagnostic Imaging', 'D1', []),
    webb: doc('cwebb', 'Dr. Caroline Webb', 'Pathologist', 'Pathology', 'D1', []),
    cole: doc('ncole', 'Dr. Nathan Cole', 'Nuclear medicine physician', 'Nuclear Medicine', 'D1', []),
    hale: doc('vhale', 'Dr. Victor Hale', 'Plastic and reconstructive surgeon', 'Plastic Surgery', 'D1', []),
    marsh: doc('fmarsh', 'Dr. Fiona Marsh', 'Cardiologist · consultant', 'Cardiology', 'CONSULT-CV', ALL, {specialty: 'Cardiology', consultationOnly: true}),
    // 護理
    carter: rn('ecarter', 'Emily Carter, RN', 'Registered nurse · day shift', 'N1', ['P03', 'P05', 'P07', 'P08', 'P10']),
    fletcher: rn('lfletcher', 'Liam Fletcher, RN', 'Registered nurse · day shift', 'N1', ['P01', 'P02', 'P04', 'P06', 'P09', 'P11', 'P12']),
    shaw: rn('oshaw', 'Olivia Shaw, RN', 'Registered nurse · evening shift', 'N2', ALL),
    quinn: rn('nquinn', 'Nora Quinn, RN', 'Registered nurse · night shift', 'N3', ALL),
    whitfield: rn('gwhitfield', 'Grace Whitfield, RN', 'Case coordinator nurse · MDT coordinator', 'N1', []),
    blake: rn('sblake', 'Susan Blake, RN', 'Head Nurse · Oncology Ward A', 'N1', [], {deptAdmin: true}),
    // 職類（P1 唯讀；P3 開職類照會）
    morgan: allied('amorgan', 'Alice Morgan, PharmD', 'Clinical pharmacist', 'Clinical Pharmacy'),
    lowry: allied('mlowry', 'Megan Lowry, RD', 'Dietitian', 'Nutrition'),
    wheeler: allied('jwheeler', 'James Wheeler, PT', 'Physiotherapist', 'Rehabilitation'),
    booth: allied('nbooth', 'Natalie Booth, MSW', 'Social worker', 'Social Work'),
    // 系統管理者
    admin: {...base, username: 'pnielsen', name: 'Paul Nielsen', title: 'IT administrator', role: 'admin', shift: 'ADMIN', patients: ALL, department: 'IT department'}
  };
  function isActive(who) {
    return !!who && who.status !== 'disabled';
  }
  const api = {STORAGE_KEY: (root.DEMO && root.DEMO.storageKey) || 'emr-mdt-demo-v1', people, isActive};
  if (typeof module !== 'undefined') module.exports = api; else root.ICUStaffSeed = api;
})(typeof window !== 'undefined' ? window : globalThis);
