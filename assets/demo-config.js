/* EMR整合MDT demo 設定（2026-11-10）。最先載入；原型程式用 globalThis.DEMO 判斷，沒有這個物件時行為同原型。
   P2：MDT 模組上線（mdtPlaceholder=false）、儲存鍵換 v2（資料集多了 state.mdt）、介面只開 EN／中文、預設英文。 */
(function (root) {
  'use strict';
  root.DEMO = {
    version: 'P4.1 · 2026-11-11',
    name: 'EMR · Smart MDT',
    hospital: 'Demo Hospital',
    unit: 'Oncology',
    tagline: 'Demo Hospital · Oncology',
    logo: 'assets/brand-icon.svg',
    defaultActor: 'mercer',
    storageKey: 'emr-mdt-demo-v4',
    mdtPlaceholder: false,
    hideHis: true,
    neutralForms: true,
    langs: ['en', 'zh'],
    defaultLang: 'en',
    // 回饋回傳：Google Apps Script 網頁應用程式網址（/exec）；空字串＝只存瀏覽器。部署方式見 _build/feedback-apps-script.gs。
    feedbackEndpoint: ''
  };
})(globalThis);
