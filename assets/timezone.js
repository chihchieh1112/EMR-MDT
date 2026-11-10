/* Hospital time zone: BVNTW is in Hanoi, UTC+7 all year (Vietnam has no daylight saving). */
(function(root){
  'use strict';
  // 唯一的時區設定。示範資料與表單裡沒有時區尾碼的時間字串（'2026-08-31T08:00'）一律是醫院牆上時間。
  const NAME='Asia/Ho_Chi_Minh', OFFSET='+07:00', OFFSET_MS=7*3600000;
  const SUFFIX=/(Z|[+-]\d\d:\d\d)$/;
  // 牆上時間 → 絕對毫秒；已帶時區尾碼的照原樣解析。
  function millis(at){return Date.parse(SUFFIX.test(at||'')?at:at+OFFSET);}
  // 絕對毫秒 → 牆上時間 'YYYY-MM-DDTHH:MM'，不受瀏覽器或 Node 所在時區影響。
  function wall(ms){return new Date(ms+OFFSET_MS).toISOString().slice(0,16);}
  // 牆上時間補上醫院時區尾碼；舊資料存的別的位移只換尾碼，牆上時間不動。
  function zoned(at){return String(at).replace(/[+-]\d\d:\d\d$/,'')+OFFSET;}
  // 顯示用（2026-11-07）：full 是明細、滑過提示與列印用的完整時間 'YYYY-MM-DD HH:MM'；short 是清單用的短時間，
  // 與 today（牆上日期 YYYY-MM-DD）同一天只寫 HH:MM，同一年寫 DD/MM HH:MM，跨年寫 DD/MM/YYYY HH:MM。不是日期的字串原樣傳回。
  const DATE=/^\d{4}-\d\d-\d\d/;
  function full(at){const s=String(at??'');if(!DATE.test(s))return s;return (SUFFIX.test(s)?wall(millis(s)):s.slice(0,16)).replace('T',' ');}
  function short(at,today){const s=String(at??'');if(!DATE.test(s))return s;const w=full(s),d=w.slice(0,10),t=w.slice(11,16),day=String(today||'').slice(0,10);
    const date=d.slice(8,10)+'/'+d.slice(5,7)+(d.slice(0,4)===day.slice(0,4)?'':'/'+d.slice(0,4));
    return d===day?(t||date):(t?date+' '+t:date);}
  const api={NAME,OFFSET,OFFSET_MS,millis,wall,zoned,full,short};
  root.ICUTimeZone=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
