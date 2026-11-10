/* 介面三語顯示層。程式、store、驗證器一律以英文為正本；瀏覽器顯示時才依所選語言把畫面文字換成中文或越文。
   字典在 i18n-dict.js（[英, 中, 越]，含 {0} 的是樣式句）。選擇記在 localStorage 'icu.lang'，第一次開啟預設中文；網址可加 ?lang=vi。
   不翻：textarea／input 的值、datalist、[data-no-i18n]、.preserve-lines（病程與交班內文），以及字典裡沒有的文字（示範資料、主檔名稱）。 */
(function(root){
'use strict';
const dict=((typeof module!=='undefined'&&typeof require==='function')?require('./i18n-dict.js'):root.ICUI18nDict)||{entries:[],scoped:[],ignore:[]};
// EMR整合MDT demo：DEMO.langs／DEMO.defaultLang 可只開 EN／中文、預設英文；沒有 DEMO 時同原型（三語、預設中文）。
const DEMO_I18N=(typeof globalThis!=='undefined'&&globalThis.DEMO)||{};
const LANGS=Array.isArray(DEMO_I18N.langs)&&DEMO_I18N.langs.length?DEMO_I18N.langs.slice():['zh','en','vi'],DEFAULT=LANGS.includes(DEMO_I18N.defaultLang)?DEMO_I18N.defaultLang:(LANGS.includes('zh')?'zh':LANGS[0]),KEY='icu.lang';
const HTML_LANG={zh:'zh-Hant',en:'en',vi:'vi'};
const NAMES={zh:['中文','中文'],en:['EN','English'],vi:['VI','Tiếng Việt']};
const PH=/\{(\d+)\}/g,HAS_PH=/\{\d+\}/;
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const ws=s=>s.replace(/\s+/g,' ');
const exact={zh:new Map(),vi:new Map()},reverse=new Map(),patterns=[],scoped=new Map();
for(const [en,zh,vi] of dict.entries){
  if(HAS_PH.test(en)){
    const order=[];
    const src='^'+en.split(/(\{\d+\})/).map(part=>{const m=part.match(/^\{(\d+)\}$/);if(m){order.push(+m[1]);return '([\\s\\S]*?)';}return escRe(part);}).join('')+'$';
    const fixed=en.replace(PH,'');
    if(/[A-Za-z]{2,}/.test(fixed))patterns.push({en,re:new RegExp(src),order,zh,vi,weight:fixed.length});
  }else{
    if(zh)exact.zh.set(en,zh);
    if(vi)exact.vi.set(en,vi);
    if(zh&&zh!==en)reverse.set(zh,en);
    if(vi&&vi!==en)reverse.set(vi,en);
  }
}
patterns.sort((a,b)=>b.weight-a.weight);
for(const [sel,en,zh,vi] of dict.scoped||[]){if(!scoped.has(en))scoped.set(en,[]);scoped.get(en).push({sel,zh,vi});}
const ignore=new Set(dict.ignore||[]);
const cache={zh:new Map(),vi:new Map()};
const norm=l=>LANGS.includes(l)?l:DEFAULT;

// 翻譯一段文字；保留前後空白。翻不到時原樣回傳。
function translate(text,lang){
  lang=norm(lang);
  if(lang==='en'||text==null)return text;
  const s=String(text),m=s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if(!m[2])return s;
  const out=core(ws(m[2]),lang,0);
  return out==null?s:m[1]+out+m[3];
}
function core(s,lang,depth){
  if(depth>4||!/[A-Za-z]/.test(s))return null;
  const c=cache[lang];
  if(c.has(s))return c.get(s);
  let r=exact[lang].get(s);
  if(r===undefined)r=byPattern(s,lang,depth);
  if(r==null)r=byRules(s,lang,depth);
  if(c.size<50000)c.set(s,r??null);
  return r??null;
}
// 插入值翻譯後若接在文字後面（不是句首或分隔符號後），越文改成小寫開頭（Mẫu vào viện，不是 Mẫu Vào viện）；縮寫與專有名詞（第二個字母也大寫）不動。
const sub=(v,lang,depth,mid)=>{let t=core(v.trim(),lang,depth+1);if(t==null)return v;if(mid&&lang==='vi'&&/^\p{Lu}\p{Ll}/u.test(t))t=t[0].toLowerCase()+t.slice(1);return v.replace(v.trim(),t);};
function byPattern(s,lang,depth){
  for(const p of patterns){
    const m=p.re.exec(s);
    if(!m||!p[lang])continue;
    return p[lang].replace(PH,(_,k,at,whole)=>{const i=p.order.indexOf(+k);return i<0?'':sub(m[i+1],lang,depth,/[\p{L},]\s*$/u.test(whole.slice(0,at)));});
  }
  return null;
}
// 通用規則：「 · 」「 | 」「 — 」「 → 」「 – 」「 / 」「–」分段、「標籤: 值」、結尾的 (n)／冒號／刪節號、開頭的符號、「已知詞 + 數值」（如 Heart rate 96 /min）、「已知詞 (單位)」。
function byRules(s,lang,depth){
  for(const sep of [' · ',' | ',' — ',' → ',' – ',' / ','–']){
    if(!s.includes(sep))continue;
    const parts=s.split(sep);let changed=false;
    const out=parts.map(p=>{const t=core(p,lang,depth+1);if(t!=null){changed=true;return t;}return p;});
    if(changed)return out.join(sep);
  }
  let m=s.match(/^([^:：]{1,60}?):\s+([\s\S]+)$/);
  if(m){const l=core(m[1],lang,depth+1);if(l!=null)return l+(lang==='zh'?'：':': ')+sub(m[2],lang,depth);}
  m=s.match(/^([\s\S]+?)(\s*)(\(\d+\)|\(\d+\/\d+\)|:|…|\.\.\.|\s\*|\*|\.)$/);
  if(m){const t=core(m[1],lang,depth+1);if(t!=null)return t+m[2]+(m[3]===':'&&lang==='zh'?'：':m[3]);}
  m=s.match(/^([+←→↑↓✓✔•·▸▾▴×✕⚠!#\-–]+\s*)([\s\S]+)$/);
  if(m){const t=core(m[2],lang,depth+1);if(t!=null)return m[1]+t;}
  m=s.match(/^(\d+\s+)([\s\S]+)$/);
  if(m){const t=core(m[2],lang,depth+1);if(t!=null)return m[1]+t;}
  m=s.match(/^([\s\S]+?)\s*(\([^()]*\))$/);
  if(m){const t=exact[lang].get(m[1]);if(t!=null)return t+' '+m[2];}
  m=s.match(/^([A-Za-z][^\d:：·|]*?)\s+([-+<>≤≥~]?\d[\s\S]*|v\d[\s\S]*)$/);
  if(m){const t=exact[lang].get(m[1]);if(t!=null)return t+' '+m[2];}
  return null;
}

const api={translate,LANGS,DEFAULT,KEY,patterns:()=>patterns.length,entries:()=>exact.zh.size,hasExact:(en,lang)=>exact[norm(lang)].has(en),isIgnored:s=>ignore.has(s)};
if(typeof document==='undefined'){if(typeof module!=='undefined')module.exports=api;else root.ICUi18n=api;return;}

// ---- 瀏覽器層 ----
const SKIP='script,style,textarea,noscript,datalist,[data-no-i18n],.preserve-lines';
const ATTRS=['title','placeholder','aria-label','alt','data-label','label'];
const textRec=new WeakMap(),attrRec=new WeakMap(),missing=new Map();
let lang=readLang();
function readLang(){
  try{const q=new URLSearchParams(location.search).get('lang');if(LANGS.includes(q)){try{localStorage.setItem(KEY,q);}catch(e){}return q;}}catch(e){}
  try{const v=localStorage.getItem(KEY);if(LANGS.includes(v))return v;}catch(e){}
  return DEFAULT;
}
// 越文主檔名稱、純代碼縮寫不算漏翻。
const VI_MARK=/[ăâđêôơưĂÂĐÊÔƠƯ]|[\u1EA0-\u1EF9]|[àáảãạèẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/i;
const looksEnglish=s=>/[A-Za-z]{2,}/.test(s)&&!VI_MARK.test(s)&&!/[\u3400-\u9fff]/.test(s)&&!/^[A-Z0-9₀-₉\s.,:;/+\-–()%·×≥≤<>=°]+$/.test(s);
function note(src){
  const k=ws(src.trim());
  if(!k||!looksEnglish(k)||ignore.has(k))return;
  const r=missing.get(k);
  if(r)r.count++;else missing.set(k,{count:1,where:(location.hash.match(/(?:^|[#&])view=([^&]*)/)||[,location.pathname.split('/').pop()])[1]});
}
function scopedFor(el,src){
  const list=scoped.get(ws(src.trim()));
  if(!list||!el)return null;
  for(const x of list)if(el.closest(x.sel))return x[lang]||null;
  return null;
}
function sourceOf(cur,rec){
  if(rec&&cur===rec.out)return rec.src;
  const t=cur.trim(),back=reverse.get(ws(t));
  return back!==undefined?cur.replace(t,back):cur;
}
function render(src,el){
  if(lang==='en')return src;
  const sc=scopedFor(el,src);
  if(sc){const t=src.trim();return src.replace(t,sc);}
  const out=translate(src,lang);
  if(out===src)note(src);
  return out;
}
function doText(n){
  const p=n.parentElement;
  if(!p||p.closest(SKIP))return;
  const cur=n.nodeValue;
  if(!cur||!cur.trim())return;
  const src=sourceOf(cur,textRec.get(n)),out=render(src,p);
  textRec.set(n,{src,out});
  if(out!==cur)n.nodeValue=out;
}
function doAttr(el,name){
  if(!el.hasAttribute(name)||el.closest(SKIP))return;
  if(name==='label'&&el.tagName!=='OPTGROUP'&&el.tagName!=='OPTION')return;
  const cur=el.getAttribute(name);
  if(!cur||!cur.trim())return;
  let recs=attrRec.get(el);if(!recs){recs={};attrRec.set(el,recs);}
  const src=sourceOf(cur,recs[name]),out=render(src,el);
  recs[name]={src,out};
  if(out!==cur)el.setAttribute(name,out);
}
function doElement(el){
  for(const a of ATTRS)if(el.hasAttribute(a))doAttr(el,a);
  if(el.hasAttribute('data-lang-switch'))fillSwitch(el);
}
function walk(node){
  if(!node)return;
  if(node.nodeType===3){doText(node);return;}
  if(node.nodeType!==1)return;
  if(node.closest(SKIP)){if(node.hasAttribute('data-lang-switch'))fillSwitch(node);return;}
  doElement(node);
  const tw=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:x=>{if(x.nodeType===1&&x.matches(SKIP)){if(x.hasAttribute('data-lang-switch'))fillSwitch(x);return NodeFilter.FILTER_REJECT;}return NodeFilter.FILTER_ACCEPT;}});
  for(let x=tw.nextNode();x;x=tw.nextNode()){if(x.nodeType===3)doText(x);else doElement(x);}
}
// 切換鈕：任何帶 data-lang-switch 的元素都會被填入三顆按鈕。
function fillSwitch(el){
  const html=LANGS.map(l=>`<button type="button" data-ui-lang="${l}" title="${NAMES[l][1]}" aria-pressed="${l===lang}">${NAMES[l][0]}</button>`).join('');
  if(el.innerHTML!==html)el.innerHTML=html;
  if(!el.hasAttribute('role'))el.setAttribute('role','group');
  el.setAttribute('aria-label','語言 · Language · Ngôn ngữ');
}
function setLang(l){
  l=norm(l);lang=l;
  try{localStorage.setItem(KEY,l);}catch(e){}
  document.documentElement.lang=HTML_LANG[l];
  walk(document.documentElement);
}
document.documentElement.lang=HTML_LANG[lang];
const mo=new MutationObserver(list=>{for(const m of list){
  if(m.type==='childList')m.addedNodes.forEach(walk);
  else if(m.type==='characterData')doText(m.target);
  else if(m.type==='attributes')doAttr(m.target,m.attributeName);
}});
mo.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS});
walk(document.documentElement);
document.addEventListener('DOMContentLoaded',()=>walk(document.documentElement));
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-ui-lang]');if(!b)return;e.preventDefault();setLang(b.dataset.uiLang);});
const nativeConfirm=root.confirm&&root.confirm.bind(root);
if(nativeConfirm)root.confirm=msg=>nativeConfirm(translate(String(msg??''),lang));
root.ICUi18n=Object.assign(api,{
  lang:()=>lang,setLang,
  t:s=>translate(s,lang),
  translateNode:walk,
  missing:()=>[...missing.entries()].sort((a,b)=>b[1].count-a[1].count).map(([text,r])=>({text,count:r.count,where:r.where})),
  resetMissing:()=>missing.clear()
});
})(globalThis);
