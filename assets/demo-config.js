/* EMR整合MDT demo 設定（2026-11-10）。最先載入；原型程式用 globalThis.DEMO 判斷，沒有這個物件時行為同原型。
   P2：MDT 模組上線（mdtPlaceholder=false）、儲存鍵換 v2（資料集多了 state.mdt）、介面只開 EN／中文、預設英文。 */
(function (root) {
  'use strict';
  root.DEMO = {
    version: 'P4 · 2026-11-10',
    name: 'EMR · Smart MDT',
    hospital: 'Demo Hospital',
    unit: 'Oncology',
    tagline: 'Demo Hospital · Oncology',
    logo: 'assets/brand-icon.svg',
    defaultActor: 'mercer',
    storageKey: 'emr-mdt-demo-v3',
    mdtPlaceholder: false,
    hideHis: true,
    neutralForms: true,
    langs: ['en', 'zh'],
    defaultLang: 'en'
  };
})(globalThis);
