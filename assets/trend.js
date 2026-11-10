/* Native SVG, actual timestamps, independent units, no imputation or clinical thresholds. */
(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./clinical.js'):root.ICUClinical;
  const TZ=typeof module!=='undefined'?require('./timezone.js'):root.ICUTimeZone;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock=t=>TZ.wall(t).slice(5).replace('T',' ');
  const colors=['#047e5c','#8d5702'];
  function domain(series,events,bounds){
    if(bounds)return bounds;
    const times=[...series.flatMap(s=>s.points),...events].map(p=>C.millis(p.at)).filter(Number.isFinite);
    if(!times.length)return null;
    let lo=Math.min(...times),hi=Math.max(...times);
    if(lo===hi){lo-=3600000;hi+=3600000;}
    return [lo,hi+1];
  }
  function draw({series,events=[],markers=[],bounds=null,mode='line',href=()=>'',note,emptyText='No measurements in this time window; do not assume normal.',noValuesText='No plottable values; see the table for missing / qualitative results.'}){
    const d=domain(series,events,bounds);
    if(!d)return `<p class="empty">${esc(emptyText)}</p>`;
    const x=t=>60+(C.millis(t)-d[0])/(d[1]-d[0])*780;
    const ticks=Array.from({length:5},(_,i)=>d[0]+(d[1]-d[0])*i/4);
    const axis=y=>ticks.map((t,i)=>`<line x1="${60+i*195}" x2="${60+i*195}" y1="20" y2="${y}" stroke="#d4ddda"/><text x="${60+i*195}" y="${y+19}" text-anchor="${i===0?'start':i===4?'end':'middle'}">${clock(t)}</text>`).join('');
    const panels=series.map(s=>{
      const points=s.points.filter(p=>C.within(p.at,d)).sort((a,b)=>C.millis(a.at)-C.millis(b.at));
      const values=points.map(p=>p.value).filter(v=>typeof v==='number'&&Number.isFinite(v));
      if(!values.length)return `<div class="trend-panel"><h3>${esc(s.name)} · ${esc(s.unit)}</h3><p>${esc(noValuesText)}</p></div>`;
      // 檢驗（2026-10-31）：series.band 是結果自帶的參考範圍，刻度要涵蓋它；生命徵象不給 band，不畫正常範圍。
      const band=s.band&&Number.isFinite(s.band.lo)&&Number.isFinite(s.band.hi)&&s.band.hi>s.band.lo?s.band:null;
      let lo=Math.min(...values,...(band?[band.lo]:[])),hi=Math.max(...values,...(band?[band.hi]:[]));const pad=(hi-lo)*.15||Math.max(Math.abs(hi)*.05,1);lo-=pad;hi+=pad;
      const y=v=>130-(v-lo)/(hi-lo)*100;
      const groups=[...new Set(points.map(p=>p.line||s.name))];
      // Dense ranges (a month of 4-hourly vitals) would otherwise be a wall of overlapping markers.
      const r=points.length>90?2:points.length>45?2.5:points.length>22?3.5:5;
      let svg=axis(140)+markers.filter(m=>C.within(m.at,d)).map(m=>`<g><title>${esc(m.name+' · '+m.at)}</title><line x1="${x(m.at)}" x2="${x(m.at)}" y1="20" y2="140" stroke="#03739f" stroke-width="2" stroke-dasharray="4 4"/><text x="${x(m.at)+4}" y="16" fill="#03739f">${esc(m.name)}</text></g>`).join('');
      if(band)svg+=`<rect class="trend-band" x="60" width="780" y="${y(band.hi)}" height="${y(band.lo)-y(band.hi)}"><title>${esc('Reference range '+band.text)}</title></rect>`;
      for(let i=0;i<3;i++){const v=lo+(hi-lo)*i/2;svg+=`<text x="53" y="${y(v)+4}" text-anchor="end">${Number(v.toFixed(2))}</text>`;}
      groups.forEach((group,j)=>{
        const pts=points.filter(p=>(p.line||s.name)===group);let chunk=[];const chunks=[];
        pts.forEach(p=>{if(typeof p.value!=='number'||!Number.isFinite(p.value)){if(chunk.length)chunks.push(chunk);chunk=[];}else chunk.push(p);});if(chunk.length)chunks.push(chunk);
        if(mode==='line')chunks.forEach(c=>{if(c.length>1)svg+=`<polyline points="${c.map(p=>x(p.at)+','+y(p.value)).join(' ')}" fill="none" stroke="${colors[j%2]}" stroke-width="2" ${j?'stroke-dasharray="6 3"':''}/>`;});
        pts.filter(p=>typeof p.value==='number'&&Number.isFinite(p.value)).forEach(p=>{const title=`${group} ${p.value} ${s.unit} · ${p.at} · ${p.sourceId||p.id}${p.flag?' · abnormal per source flag':''}`;svg+=`<a href="${esc(href(p))}" aria-label="${esc(title)}"><title>${esc(title)}</title>${p.flag?`<circle class="trend-flag" cx="${x(p.at)}" cy="${y(p.value)}" r="${r+3}"/>`:''}<circle cx="${x(p.at)}" cy="${y(p.value)}" r="${r}" fill="${j?'white':colors[0]}" stroke="${colors[j%2]}" stroke-width="${r<3?1:2}"/></a>`;});
      });
      return `<div class="trend-panel"><h3>${esc(s.name)} <small>${esc(s.unit)} · ${groups.map((g,i)=>esc(g)+(i?' ○ dashed':' ● solid')).join(' / ')}</small></h3><svg viewBox="0 0 900 175" role="img" aria-label="${esc(s.name)} trend on an actual time axis; values and sources in the table below">${svg}</svg></div>`;
    }).join('');
    const visible=events.filter(e=>C.within(e.at,d));
    const lanes=['Scheduled orders','Actual','Results'];
    const laneSVG=visible.length?`<div class="trend-panel"><h3>Reference events <small>Shares the time axis above; time order does not imply causation</small></h3><svg viewBox="0 0 900 175" role="img" aria-label="Scheduled orders, actual administration and results in separate lanes">${axis(140)}${lanes.map((l,i)=>`<text x="62" y="${35+i*40}">${l}</text>`).join('')}${visible.map(e=>{const y=45+lanes.indexOf(e.lane)*40;return `<a href="${esc(href(e))}" aria-label="${esc(e.lane+' '+e.id+' '+e.at)}"><title>${esc(e.lane+' '+e.id+' '+e.at+' '+e.name)}</title><circle cx="${x(e.at)}" cy="${y}" r="5" fill="${e.lane==='Scheduled orders'?'white':'#047e5c'}" stroke="#047e5c" ${e.lane==='Scheduled orders'?'stroke-dasharray="2 2"':''}/></a>`;}).join('')}</svg></div>`:'';
    return `<div class="trend-stack">${panels}${laneSVG}</div>${note===undefined?`<p class="source">${mode==='line'?'Lines connect only recorded values and break at missing values; no interpolation.':'Scatter plot shows only recorded values.'} Reference range not provided; no normal range is drawn and no abnormal values are inferred. Local demo time zone UTC+08; hospital time zone to be confirmed.</p>`:note}`;
  }
  // --- TPR 合併大圖：體溫、脈搏、呼吸疊在同一張圖，但每一項各有自己的刻度欄 -------------------
  // series: [{key, name, unit, axis:'left'|'right', shape, cls, range:[lo,hi], step, points:[{at,value,...}]}]
  // 每一項用自己的 range/step 取整成刻度帶，所以呼吸不會因為與脈搏共用一條軸而被壓成平線；
  // 刻度欄的顏色與該項的線同色，讀者才知道哪一欄對應哪一條線。
  // 不插補、不畫正常範圍（observations 沒有來源旗標，依 N03 不自行判定異常）。
  const numeric=v=>typeof v==='number'&&Number.isFinite(v);
  function chunksOf(points){const chunks=[];let chunk=[];points.forEach(p=>{if(!numeric(p.value)){if(chunk.length)chunks.push(chunk);chunk=[];}else chunk.push(p);});if(chunk.length)chunks.push(chunk);return chunks;}
  function shapeOf(shape,cx,cy,r,cls){
    if(shape==='triangle')return `<polygon class="${cls}" points="${cx},${cy-r-1} ${cx-r-1},${cy+r} ${cx+r+1},${cy+r}"/>`;
    if(shape==='square')return `<rect class="${cls}" x="${cx-r}" y="${cy-r}" width="${2*r}" height="${2*r}"/>`;
    return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
  }
  // 刻度帶：以該項的預設區間為底，再擴到足以涵蓋實際數值，並對齊 step 的整數倍。
  function band(range,values,step){
    const unit=step||1;let lo=range?range[0]:0,hi=range?range[1]:unit;
    if(values.length){lo=Math.min(lo,Math.floor(Math.min(...values)/unit)*unit);hi=Math.max(hi,Math.ceil(Math.max(...values)/unit)*unit);}
    if(hi<=lo)hi=lo+unit;
    return [lo,hi];
  }
  const tickText=(v,step)=>(step||1)<1?v.toFixed(1):String(Math.round(v));
  function drawTPR({series,markers=[],bounds=null,mode='line',emptyText='No values in this window; absence is not normality.'}){
    const d=domain(series,[],bounds);
    if(!d)return `<p class="empty">${esc(emptyText)}</p>`;
    const top=22,bottom=200,colW=46;
    const lefts=series.filter(s=>s.axis==='left'),rights=series.filter(s=>s.axis!=='left');
    const x0=Math.max(48,lefts.length*colW+8),x1=900-Math.max(28,rights.length*colW+8);
    const x=t=>x0+(C.millis(t)-d[0])/(d[1]-d[0])*(x1-x0);
    let svg=Array.from({length:5},(_,i)=>{const t=d[0]+(d[1]-d[0])*i/4,cx=x0+(x1-x0)*i/4;
      return `<line x1="${cx}" x2="${cx}" y1="${top}" y2="${bottom}" stroke="#d4ddda"/><text x="${cx}" y="${bottom+19}" text-anchor="${i===0?'start':i===4?'end':'middle'}">${clock(t)}</text>`;}).join('');
    svg+=markers.filter(m=>C.within(m.at,d)).map(m=>`<g><title>${esc(m.name+' · '+m.at)}</title><line x1="${x(m.at)}" x2="${x(m.at)}" y1="${top}" y2="${bottom}" stroke="#03739f" stroke-width="2" stroke-dasharray="4 4"/><text x="${x(m.at)+4}" y="${top-7}" fill="#03739f">${esc(m.name)}</text></g>`).join('');
    const scale=new Map();
    [[lefts,'left'],[rights,'right']].forEach(([list,side])=>list.forEach((s,i)=>{
      const values=s.points.filter(p=>C.within(p.at,d)).map(p=>p.value).filter(numeric);
      const [lo,hi]=band(s.range,values,s.step);
      const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
      scale.set(s,y);
      const cx=side==='left'?x0-10-i*colW:x1+10+i*colW,anchor=side==='left'?'end':'start';
      for(let k=0;k<=4;k++){const v=lo+(hi-lo)*k/4;svg+=`<text x="${cx}" y="${y(v)+4}" text-anchor="${anchor}" class="tpr-scale ${esc(s.cls)}-axis">${esc(tickText(v,s.step))}</text>`;}
      svg+=`<text x="${cx}" y="13" text-anchor="${anchor}" class="tpr-scale ${esc(s.cls)}-axis">${esc((s.key?s.key+' ':'')+s.unit)}</text>`;
    }));
    const count=Math.max(0,...series.map(s=>s.points.filter(p=>C.within(p.at,d)).length));
    const r=count>90?2.5:count>45?3:count>22?4:5.5;
    series.forEach(s=>{
      const y=scale.get(s);
      const pts=s.points.filter(p=>C.within(p.at,d)).sort((a,b)=>C.millis(a.at)-C.millis(b.at));
      if(mode==='line')chunksOf(pts).forEach(c=>{if(c.length>1)svg+=`<polyline class="${esc(s.cls)}" points="${c.map(p=>x(p.at)+','+y(p.value)).join(' ')}"/>`;});
      pts.filter(p=>numeric(p.value)).forEach(p=>{const title=`${s.name} ${p.value} ${s.unit} · ${p.at}`;svg+=`<g><title>${esc(title)}</title>${shapeOf(s.shape,x(p.at),y(p.value),r,s.cls)}</g>`;});
    });
    const glyph={circle:'●',triangle:'▲',square:'■'};
    const legend=`<div class="tpr-legend">${series.map(s=>`<span class="${esc(s.cls)}-legend"><b>${glyph[s.shape]||'●'}</b> ${esc(s.name)} (${esc(s.unit)})</span>`).join('')}${markers.length?'<span><b style="color:#03739f">┆</b> Nursing shift boundary / handover</span>':''}</div>`;
    return `<div class="trend-panel tpr-panel"><svg viewBox="0 0 900 240" role="img" aria-label="${esc(series.map(s=>s.name).join(', '))} over time; each measurement has its own scale. Values and recorders are in the flow sheet below.">${svg}</svg>${legend}</div>`;
  }
  // 生長曲線（2026-10-24）：橫軸是年齡（由出生日期算，至少一年），每項一張小圖共用同一段年齡；只畫病人自己的點，不畫百分位、不判異常、不插補。
  const MONTH=30.4375*86400000;
  const ageText=m=>{const y=Math.floor(m/12),mo=Math.floor(m-y*12);return y&&mo?y+' y '+mo+' mo':y?y+' y':mo+' mo';};
  function drawGrowth({born,panels,emptyText='No measurement yet'}){
    const ageOf=at=>(C.millis(at)-born)/MONTH;
    const ages=panels.flatMap(p=>p.points).filter(q=>typeof q.value==='number'&&Number.isFinite(q.value)).map(q=>ageOf(q.at)).filter(Number.isFinite);
    if(!ages.length)return `<p class="empty">${esc(emptyText)}</p>`;
    let lo=Math.min(...ages),hi=Math.max(...ages);if(hi-lo<12)lo=hi-12;const pad=(hi-lo)*.03;lo=Math.max(0,lo-pad);hi+=pad;
    const x=a=>48+(a-lo)/(hi-lo)*360,ticks=[lo,(lo+hi)/2,hi];
    return `<div class="growth-panels">${panels.map(p=>{
      const head=`<h4 class="growth-title">${esc(p.name)}<small>${esc(p.unit)}</small></h4>`;
      const pts=p.points.filter(q=>typeof q.value==='number'&&Number.isFinite(q.value)).map(q=>({...q,age:ageOf(q.at)})).filter(q=>Number.isFinite(q.age)).sort((a,b)=>a.age-b.age);
      if(!pts.length)return `<div class="growth-panel">${head}<p class="empty">${esc(emptyText)}</p></div>`;
      let vlo=Math.min(...pts.map(q=>q.value)),vhi=Math.max(...pts.map(q=>q.value));const vpad=(vhi-vlo)*.15||Math.max(vhi*.05,1);vlo-=vpad;vhi+=vpad;
      const y=v=>132-(v-vlo)/(vhi-vlo)*120;
      let svg=ticks.map((t,i)=>`<line x1="${x(t)}" x2="${x(t)}" y1="12" y2="132" stroke="#d4ddda"/><text class="growth-age" x="${x(t)}" y="152" text-anchor="${['start','middle','end'][i]}">${esc(ageText(t))}</text>`).join('');
      for(let i=0;i<3;i++){const v=vlo+(vhi-vlo)*i/2;svg+=`<text x="42" y="${y(v)+4}" text-anchor="end">${Number(v.toFixed(1))}</text>`;}
      if(pts.length>1)svg+=`<polyline points="${pts.map(q=>x(q.age)+','+y(q.value)).join(' ')}" fill="none" stroke="${esc(p.color)}" stroke-width="2"/>`;
      pts.forEach(q=>{svg+=`<circle cx="${x(q.age)}" cy="${y(q.value)}" r="4" fill="${esc(p.color)}"><title>${esc(q.value+' '+p.unit+' · '+String(q.at).replace('T',' ')+' · '+ageText(q.age))}</title></circle>`;});
      return `<div class="growth-panel">${head}<svg class="growth-svg" viewBox="0 0 420 160" role="img" aria-label="${esc(p.name)}">${svg}</svg></div>`;
    }).join('')}</div>`;
  }
  // --- 分軌疊圖（2026-11-08，N03）：每項一條軌、共用一條時間軸，醫師一眼對照多項怎麼一起變。 -------------------
  // lanes: [{key, name, unit, kind:'number'|'bp'|'volume'|'code', range, step, points, latest:{text, at}|null, extra}]
  //   number／volume 的點 {at, value}；bp 的點 {at, sys, dia}；code 的點 {at, code, text}。
  // 每條軌各自的刻度（有常見區間的以它為底、數值超出就擴大）；只連已記的值、缺值斷線、不插補、不畫正常範圍、不判異常。
  // SVG 用 preserveAspectRatio="none" 撐滿軌寬，線與點用 non-scaling-stroke（app.css），所以字與點不會被拉扁；字一律用 HTML。
  const LANE_W=1000;
  const laneHeight=kind=>kind==='code'?24:48;
  const laneText=v=>Math.abs(v)>=10?String(Math.round(v)):String(Number(v.toFixed(1)));
  function laneScale(l,pts){
    const values=(l.kind==='bp'?pts.flatMap(p=>[p.sys,p.dia]):pts.map(p=>p.value)).filter(numeric);
    if(l.kind==='volume'){const top=Math.max(1,...values);const unit=top>100?50:10;return [0,Math.ceil(top/unit)*unit];}
    if(l.range)return band(l.range,values,l.step);
    if(!values.length)return [0,1];
    // 沒有常見區間的項目：依範圍內的值取整到 1、2、2.5、5 的倍數，刻度讀得出來。
    let lo=Math.min(...values),hi=Math.max(...values);if(hi===lo){const d=Math.max(Math.abs(hi)*.1,1);lo-=d;hi+=d;}
    const raw=(hi-lo)/4,mag=Math.pow(10,Math.floor(Math.log10(raw))),st=[1,2,2.5,5,10].map(f=>f*mag).find(s=>s>=raw);
    return [Math.floor(lo/st)*st,Math.ceil(hi/st)*st];
  }
  const dot=(x,y)=>`<line class="lane-dot" x1="${x}" x2="${x}" y1="${y}" y2="${y}"/>`;
  // 讀值：每條軌取時間 ≤ ms 的最後一筆（沒量到就是前一筆，標它自己的時間）；範圍內沒有更早的就是沒有。
  function readAt(lanes,ms){
    return lanes.map(l=>{let hit=null;for(const p of l.pts){if(p[0]<=ms)hit=p;else break;}return {key:l.key,text:hit?hit[1]:'—',at:hit?hit[0]:null,y:hit?hit[2]:null};});
  }
  function laneTimes(lanes){return [...new Set(lanes.flatMap(l=>l.pts.map(p=>p[0])))].sort((a,b)=>a-b);}
  function drawLanes({lanes,bounds,markers=[],mode='line',label='Trends',latestLabel='Latest value'}){
    const d=bounds;
    if(!d||!lanes.length)return '';
    const span=d[1]-d[0],X=at=>Number(((C.millis(at)-d[0])/span*LANE_W).toFixed(1)),pct=at=>((C.millis(at)-d[0])/span*100).toFixed(2);
    const marks=markers.filter(m=>C.within(m.at,d));
    const payload=[];
    const newest=lanes.map(l=>l.latest&&C.millis(l.latest.at)).filter(Number.isFinite).reduce((a,b)=>Math.max(a,b),-Infinity);
    const rows=lanes.map(l=>{
      const H=laneHeight(l.kind),pts=l.points.filter(p=>C.within(p.at,d)).sort((a,b)=>C.millis(a.at)-C.millis(b.at));
      let svg=[1,2,3].map(i=>`<line class="lane-grid" x1="${i*LANE_W/4}" x2="${i*LANE_W/4}" y1="0" y2="${H}"/>`).join('');
      svg+=marks.map(m=>`<line class="lane-marker" x1="${X(m.at)}" x2="${X(m.at)}" y1="0" y2="${H}"/>`).join('');
      let scale='',codes='';
      if(l.kind==='code'){
        svg+=`<line class="lane-base" x1="0" x2="${LANE_W}" y1="${H/2}" y2="${H/2}"/>`+pts.map(p=>dot(X(p.at),H/2)).join('');
        // 選項只在改變的那一點標代碼，滑過讀值時看全名。
        codes=pts.filter((p,i)=>!i||pts[i-1].code!==p.code).map(p=>`<span class="lane-tag" style="left:${pct(p.at)}%" data-no-i18n>${esc(p.code)}</span>`).join('');
        payload.push({key:l.key,pts:pts.map(p=>[C.millis(p.at),p.text,50])});
      } else {
        const [lo,hi]=laneScale(l,pts),Y=v=>Number(((H-5)-(v-lo)/(hi-lo)*(H-10)).toFixed(1)),yp=v=>Number((Y(v)/H*100).toFixed(1));
        scale=`<span>${esc(l.step?tickText(hi,l.step):laneText(hi))}</span><span>${esc(l.step?tickText(lo,l.step):laneText(lo))}</span>`;
        if(l.kind==='volume'){
          const ok=pts.filter(p=>numeric(p.value));
          svg+=ok.map(p=>`<line class="lane-bar" x1="${X(p.at)}" x2="${X(p.at)}" y1="${Y(0)}" y2="${Y(p.value)}"/>`).join('');
          payload.push({key:l.key,pts:ok.map(p=>[C.millis(p.at),String(p.value),yp(p.value)])});
        } else if(l.kind==='bp'){
          const ok=pts.filter(p=>numeric(p.sys)&&numeric(p.dia));
          if(mode==='line')['sys','dia'].forEach(k=>chunksOf(pts.map(p=>({at:p.at,value:p[k]}))).forEach(c=>{if(c.length>1)svg+=`<polyline class="lane-line lane-${k}" points="${c.map(p=>X(p.at)+','+Y(p.value)).join(' ')}"/>`;}));
          svg+=ok.map(p=>`<line class="lane-bp" x1="${X(p.at)}" x2="${X(p.at)}" y1="${Y(p.sys)}" y2="${Y(p.dia)}"/>${dot(X(p.at),Y(p.sys))}${dot(X(p.at),Y(p.dia))}`).join('');
          payload.push({key:l.key,pts:ok.map(p=>[C.millis(p.at),p.sys+'/'+p.dia,yp(p.sys)])});
        } else {
          const ok=pts.filter(p=>numeric(p.value));
          if(mode==='line')chunksOf(pts).forEach(c=>{if(c.length>1)svg+=`<polyline class="lane-line" points="${c.map(p=>X(p.at)+','+Y(p.value)).join(' ')}"/>`;});
          svg+=ok.map(p=>dot(X(p.at),Y(p.value))).join('');
          payload.push({key:l.key,pts:ok.map(p=>[C.millis(p.at),String(p.value),yp(p.value)])});
        }
      }
      const latest=l.latest;
      return `<div class="lane lane-${esc(l.kind)}" data-key="${esc(l.key)}">`
        +`<div class="lane-name"><span${l.extra?' data-no-i18n':''}>${esc(l.name)}</span>${l.unit?` <small data-no-i18n>${esc(l.unit)}</small>`:''}</div>`
        +`<div class="lane-scale" aria-hidden="true" data-no-i18n>${scale}</div>`
        +`<div class="lane-plot"><svg class="lane-svg" viewBox="0 0 ${LANE_W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${svg}</svg>${codes}</div>`
        +`<div class="lane-value" data-no-i18n><b data-lane-value>${esc(latest?latest.text:'—')}</b><small data-lane-at>${esc(latest&&C.millis(latest.at)!==newest?clock(C.millis(latest.at)):'')}</small></div></div>`;
    }).join('');
    const ticks=Array.from({length:5},(_,i)=>`<span style="left:${i*25}%">${esc(clock(d[0]+span*i/4))}</span>`).join('');
    const marksHtml=marks.map(m=>`<span class="lane-mark" style="left:${pct(m.at)}%">${esc(m.name)}</span>`).join('');
    const head=`<div class="lane-head"><span></span><span></span><div class="lane-marks">${marksHtml}</div><span class="lane-head-value" data-lane-head>${esc(latestLabel)}${Number.isFinite(newest)?` <small data-no-i18n>${esc(clock(newest))}</small>`:''}</span></div>`;
    const axis=`<div class="lane-axis" aria-hidden="true"><span></span><span></span><div class="lane-ticks" data-no-i18n>${ticks}</div><span></span></div>`;
    return `<div class="lanes" tabindex="0" role="group" aria-label="${esc(label)}" data-lanes="${esc(JSON.stringify({lo:d[0],hi:d[1],lanes:payload}))}">${head}${rows}${axis}<div class="lane-cursor" hidden></div><p class="visually-hidden" aria-live="polite" data-lane-live></p></div>`;
  }
  // 滑過或用左右鍵：一條直線貫穿所有軌，每條軌在右欄標出那一刻的值與它自己的量測時間；離開就回到最新值。
  function bindLanes(doc){
    let active=null;
    const data=box=>{if(!box._lanes){try{box._lanes=JSON.parse(box.dataset.lanes||'{}');}catch(e){box._lanes={lanes:[]};}box._times=laneTimes(box._lanes.lanes||[]);}return box._lanes;};
    const clear=box=>{if(!box)return;box.classList.remove('reading');delete box.dataset.cursor;const cur=box.querySelector('.lane-cursor');if(cur)cur.hidden=true;
      const head=box.querySelector('[data-lane-head]');if(head&&head._html!==undefined)head.innerHTML=head._html;box.querySelectorAll('.lane-ring').forEach(r=>{r.hidden=true;});
      box.querySelectorAll('.lane').forEach(row=>{const v=row.querySelector('[data-lane-value]'),a=row.querySelector('[data-lane-at]');if(v&&v.dataset.orig!==undefined){v.textContent=v.dataset.orig;a.textContent=a.dataset.orig;}});
      if(active===box)active=null;};
    const show=(box,ms)=>{const dt=data(box),plot=box.querySelector('.lane-plot'),rows=box.querySelectorAll('.lane');if(!plot||!rows.length)return;
      const f=(ms-dt.lo)/(dt.hi-dt.lo);if(!(f>=0&&f<=1))return clear(box);
      const br=box.getBoundingClientRect(),pr=plot.getBoundingClientRect(),first=rows[0].getBoundingClientRect(),last=rows[rows.length-1].getBoundingClientRect();
      const cur=box.querySelector('.lane-cursor');cur.hidden=false;cur.style.top=(first.top-br.top)+'px';cur.style.height=(last.bottom-first.top)+'px';cur.style.transform=`translateX(${(pr.left-br.left+f*pr.width).toFixed(1)}px)`;
      box.dataset.cursor=String(ms);box.classList.add('reading');active=box;
      const head=box.querySelector('[data-lane-head]');if(head&&head._html===undefined)head._html=head.innerHTML;if(head)head.textContent=clock(ms);const said=[];
      readAt(dt.lanes||[],ms).forEach(r=>{const row=[...rows].find(x=>x.dataset.key===r.key);if(!row)return;const v=row.querySelector('[data-lane-value]'),a=row.querySelector('[data-lane-at]');
        if(v.dataset.orig===undefined){v.dataset.orig=v.textContent;a.dataset.orig=a.textContent;}v.textContent=r.text;a.textContent=r.at===null?'':r.at===ms?'':clock(r.at);
        const plotEl=row.querySelector('.lane-plot');let ring=plotEl.querySelector('.lane-ring');if(!ring){ring=doc.createElement('span');ring.className='lane-ring';ring.setAttribute('aria-hidden','true');plotEl.appendChild(ring);}
        if(r.at===null){ring.hidden=true;}else{ring.hidden=false;ring.style.left=((r.at-dt.lo)/(dt.hi-dt.lo)*100).toFixed(2)+'%';ring.style.top=(r.y===null||r.y===undefined?50:r.y)+'%';}
        said.push((row.querySelector('.lane-name')||row).textContent.trim()+' '+r.text+(r.at!==null&&r.at!==ms?' ('+clock(r.at)+')':''));});
      box._said=clock(ms)+': '+said.join('; ');};
    // 游標吸到最近一個有記錄的時點，讀到的就是實際量測，不是兩點之間的估計。
    const nearest=(box,ms)=>{data(box);const t=box._times;if(!t.length)return null;return t.reduce((a,b)=>Math.abs(b-ms)<Math.abs(a-ms)?b:a);};
    const track=e=>{const box=e.target.closest&&e.target.closest('.lanes');if(active&&active!==box)clear(active);if(!box)return;
      const plot=box.querySelector('.lane-plot');if(!plot)return;const pr=plot.getBoundingClientRect();if(e.clientX<pr.left-8||e.clientX>pr.right+8){clear(box);return;}
      const dt=data(box),ms=dt.lo+(Math.min(Math.max(e.clientX,pr.left),pr.right)-pr.left)/pr.width*(dt.hi-dt.lo),t=nearest(box,ms);if(t!==null)show(box,t);};
    // 觸控：點一下或橫向拖曳就讀值（軌上 touch-action: pan-y，直向仍捲動頁面）；手指離開後讀值留著，點軌外才收起。
    doc.addEventListener('pointermove',track);doc.addEventListener('pointerdown',track);
    doc.addEventListener('pointerout',e=>{if(e.pointerType==='touch')return;if(active&&!(e.relatedTarget&&active.contains(e.relatedTarget))&&doc.activeElement!==active)clear(active);});
    doc.addEventListener('keydown',e=>{const box=e.target.classList&&e.target.classList.contains('lanes')?e.target:null;if(!box)return;data(box);const t=box._times;if(!t.length)return;
      const now=box.dataset.cursor!==undefined?Number(box.dataset.cursor):null,i=now===null?-1:t.indexOf(now);let next=null;
      if(e.key==='ArrowRight')next=t[i<0?0:Math.min(t.length-1,i+1)];else if(e.key==='ArrowLeft')next=t[i<0?t.length-1:Math.max(0,i-1)];else if(e.key==='Home')next=t[0];else if(e.key==='End')next=t[t.length-1];
      else if(e.key==='Escape'&&now!==null){e.preventDefault();clear(box);return;}else return;
      e.preventDefault();show(box,next);const live=box.querySelector('[data-lane-live]');if(live)live.textContent=box._said||'';});
    doc.addEventListener('focusout',e=>{if(e.target.classList&&e.target.classList.contains('lanes'))clear(e.target);});
  }
  if(typeof document!=='undefined'&&typeof module==='undefined'&&!root.__icuLanesBound){root.__icuLanesBound=true;bindLanes(document);}
  const api={draw,drawTPR,drawGrowth,drawLanes,readAt,laneTimes,ageText,domain};if(typeof module!=='undefined')module.exports=api;else root.ICUTrend=api;
})(globalThis);
