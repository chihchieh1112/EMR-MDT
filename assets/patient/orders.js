/* Medical-order worklist and doctor-only prescribing dialog. */
(function (root) {
  'use strict';

  // 主套 → 組套 → 醫令（C1 §8.1「主要標準化醫囑套組」／需求 R-074「醫囑組套三個 Bundle」）。
  // 一個「組套」就是一個組合，按一下開出裡面的多個醫令；一個「主套」收數個組套，可整套加入。
  // Bundle 名稱與內容項目照抄 C1；**哪一筆 B 目錄品項對應哪一項內容是本原型的對照，未經院方核准**。
  // C1 有列、但 B 目錄查無對應品項的，記在 gaps 於畫面明說待補，不虛構品項湊數。
  // EMR整合MDT demo（2026-11-10）：組套由英文資料集提供（乳癌團隊方案、化療前基準、FOLFOX、支持性治療）；沒有資料集時用原型的 ICU 三個 bundle。
  const mainSets = (root.ICUDemoSeed && root.ICUDemoSeed.orderSets) || [
    {
      id: 'BUNDLE-ADMISSION', name: 'ICU Admission Bundle (admission)', source: 'C1 §8.1 Order Set 1',
      groups: [
        {id: 'GRP-ADM-LAB', name: 'Baseline admission blood labs', keys: ['service:1020', 'service:646', 'service:680', 'service:685']},
        {id: 'GRP-ADM-ABG', name: 'STAT blood gas analysis', keys: ['service:537']},
        {id: 'GRP-ADM-COAG', name: 'Coagulation panel', keys: ['service:1000', 'service:1002', 'service:1063']},
        {id: 'GRP-ADM-CULT', name: 'Specimen cultures', keys: ['service:839']},
        {id: 'GRP-ADM-IMG', name: 'Bedside imaging', keys: ['service:2512', 'service:8919']}
      ],
      gaps: ['Nursing care mode']
    },
    {
      id: 'BUNDLE-DETERIORATION', name: 'ICU Deterioration Resuscitation Bundle (deterioration resuscitation)', source: 'C1 §8.1 Order Set 2',
      groups: [
        {id: 'GRP-DET-VENT', name: 'Lung-protective ventilation', keys: ['service:7631']},
        {id: 'GRP-DET-FLUID', name: 'Fluid challenge 5-10 mL/kg', keys: ['medication:33698', 'medication:35613']},
        {id: 'GRP-DET-PRESSOR', name: 'Vasopressors / inotropes', keys: ['medication:35471', 'medication:34721']},
        {id: 'GRP-DET-ABG', name: 'STAT blood gas analysis', keys: ['service:537']},
        {id: 'GRP-DET-ECG', name: 'Bedside ECG monitoring', keys: ['service:8070', 'service:8067']}
      ],
      gaps: []
    },
    {
      id: 'BUNDLE-DISCHARGE', name: 'ICU Discharge & Transfer Bundle (ICU discharge / transfer out)', source: 'C1 §8.1 Order Set 3',
      groups: [
        {id: 'GRP-DIS-ORAL', name: 'Switch to oral medications', keys: ['medication:44978', 'medication:50631']},
        {id: 'GRP-DIS-LAB', name: 'Pre-transfer repeat labs', keys: ['service:1020', 'service:646']}
      ],
      gaps: ['Remove catheter / central venous catheter (CVC) order', 'Transfer form']
    }
  ];

  const injectionPattern = /注射|施打|針|inject|tiêm|\bIV\b|\bIM\b/i;
  // 院方 B 目錄的途徑同時帶了給藥方法（2.xx 注射、2.05／2.14／2.15 輸注、1.01 口服…）；用它帶出 FHIR Dosage.method 的建議值，醫師可改。
  function methodForRoute(code) {
    const c = String(code || ''), major = c.split('.')[0];
    if (['2.05', '2.14', '2.15'].includes(c)) return '764794000';
    if (major === '2') return '740685003';
    if (c === '1.03') return '738992009';
    if (c === '1.01') return '738995006';
    if (major === '3') return '738991002';
    if (major === '4') return '738993004';
    if (['5.01', '5.04', '5.07', '5.08'].includes(c)) return '738996007';
    if (major === '5') return c === '5.10' ? '738994005' : '740666001';
    if (major === '6') return '738994005';
    return '';
  }
  const href = (route, changes) => '#'+new URLSearchParams({...route, ...changes}).toString();
  // The worklist used to carry its own 4-way split while the picker had 7 categories, so the
  // 醫囑類型 column and the 醫囑類型 filter disagreed. Both now read the same taxonomy.
  const orderType = order => root.ICUOrderTaxonomy.categoryOfOrder(order);
  const typeLabel = type => root.ICUOrderTaxonomy.labelOf(type);
  const isMedication = order => order.kind === 'medication';

  const isLabImaging = order => ['lab','imaging'].includes(orderType(order));

  function actionArea(ctx, order) {
    const {actor, act} = ctx;
    if (!ctx.canOrder) return '';
    // 檢驗檢查開立即為護理端可執行：沒有簽署、送出與 HIS 回應這三步，要中止就用「停止」。
    if (isLabImaging(order)) return order.consultSource ? ctx.source('Consultation recommendation source: ' + order.consultSource) : '';
    return `<div class="row order-actions">
      
      ${['sent','unknown'].includes(order.his) ? act('hisResponse','Simulate HIS accept / clarify',{id:order.id,status:'accepted'})+act('hisResponse','Simulate HIS reject',{id:order.id,status:'rejected'},false,true) : ''}
      ${order.clinical==='active'?`<details><summary>Stop order</summary>${ctx.form('stopOrder',ctx.field('end','Stop time','2026-08-31T18:00','datetime-local','required')+ctx.area('reason','Reason for stopping'),'Confirm stop',{id:order.id})}</details>`:''}
      ${order.consultSource?ctx.source('Consultation recommendation source: '+order.consultSource):''}
    </div>`;
  }

  // 「還沒有人執行」才可以取消：只要有一筆完成的執行紀錄，就只能另行停止，不能當作沒發生過。
  const hasDone = executions => executions.some(item => item.status === 'done');
  // 檢驗檢查另加一道：報告一旦回覆就只能判讀處理，不能當作沒開過。
  const labReported = (ctx, order) => isLabImaging(order)
    && ctx.state.reports.some(r => (r.order === order.id || r.id === order.id) && r.status === 'returned');
  const cancellable = (ctx, order, executions) => ctx.canOrder
    && order.clinical !== 'cancelled' && !hasDone(executions) && !labReported(ctx, order);
  // 已簽署生效的醫囑，取消要留下原因；還沒簽署的草稿一鍵取消即可。
  const cancelNeedsReason = order => order.local === 'signed';
  // 列首只留展開箭頭（2026-11-02）；取消、停止放在展開後的明細，列高不再被兩顆按鈕撐開。
  const chevron = root.ICUIcons ? root.ICUIcons.svg('chevron-down') : '▾';
  const orderStage = order => order.clinical==='cancelled'?'Cancelled':order.clinical==='stopped'?'Stopped':order.clinical==='active'?'Ready for nursing':'Not yet effective';
  // 送 HIS 另列（2026-10-30）：醫囑簽署即生效，HIS 只負責計費與藥局；檢驗檢查開立即送，處置、照護等一期不送。
  const hisText = order => order.signatureExempt ? 'Sent to HIS when ordered'
    : order.kind === 'medication' ? ({notSent:'Waiting for the daily HIS batch',sent:'Sent to HIS in the daily batch',accepted:'HIS accepted the daily batch',rejected:'HIS rejected the daily batch; follow up with HIS',unknown:'HIS response unknown; clarify with HIS before resending'})[order.his] || ''
    : order.his === 'none' ? 'Not exchanged with HIS (phase 1)' : '';

  function cancelArea(ctx, order, executions) {
    const {actor, actors, esc, form, field, source} = ctx;
    if (!ctx.canOrder) return '';
    const lab = isLabImaging(order), word = lab ? 'Stop' : 'Cancel';
    if (order.clinical === 'cancelled') {
      const info = order.cancel || {};
      return `<div class="order-cancelled-note"><p><strong>${word} reason</strong>: ${esc(info.reason || ('Not entered: ' + word + ' reason'))}</p>${source((lab ? 'Stopped by: ' : 'Cancelled by: ') + (actors[info.actor]?.name || 'Not provided by source') + ' · ' + (info.at || 'Time not provided by source'))}</div>`;
    }
    if (lab && labReported(ctx, order)) return `<p class="order-cancel-blocked">Report already returned; cannot stop. Close it with an interpretation and follow-up record instead.</p>`;
    if (hasDone(executions)) return `<p class="order-cancel-blocked">${lab ? 'A completed collection / performance record exists; cannot stop. Close it with an interpretation and follow-up record instead.' : 'A completed administration record exists; cannot cancel. To discontinue, order a separate stop order.'}</p>`;
    const needs = cancelNeedsReason(order);
    const hint = lab ? 'Not yet collected / performed; stopping keeps the record and voids the pending report. Reason for stopping is required.'
      : needs ? 'Already ready for nursing; a reason for cancelling is required and stays on the record.'
      : ['sent','unknown'].includes(order.his) ? 'Local cancellation keeps the record; the production system must still confirm the HIS withdrawal result.'
      : 'Not yet effective; cancelling keeps the record and removes it from the pending list.';
    return `<div class="order-cancel-form"><h4>${word} this ${lab ? 'Labs & exams' : 'Orders'}</h4><p class="order-cancel-hint">${hint}</p>${form('cancelOrder',
      field('reason', word + ' reason' + (needs ? ' (required)' : ' (optional)'), '', 'text', needs ? 'required' : ''),
      lab ? 'Confirm stop' : 'Confirm cancel', {id: order.id})}</div>`;
  }

  // 明細頂端一行（2026-11-08）：狀態與送 HIS 情形在左，停止、取消兩顆鈕在右；按了才在下方展開原因欄，
  // 一次只開一個；紅色只留給最後的確認鈕。已完成給藥或報告已回、不能取消的，就不出取消鈕。
  function detailHead(ctx, order, executions) {
    const {esc, badge, act} = ctx;
    const lab = isLabImaging(order), id = esc(order.id);
    const canStop = ctx.canOrder && !lab && order.clinical === 'active';
    const canCancel = cancellable(ctx, order, executions);
    const his = ctx.canOrder && !lab && ['sent','unknown'].includes(order.his) ? act('hisResponse','Simulate HIS accept / clarify',{id:order.id,status:'accepted'})+act('hisResponse','Simulate HIS reject',{id:order.id,status:'rejected'},false,true) : '';
    const toggle = (kind, text) => `<button type="button" class="secondary compact-button order-act-toggle" data-detail-act="order-act-${kind}-${id}" aria-expanded="false" aria-controls="order-act-${kind}-${id}">${text}</button>`;
    const hisNote = order.local === 'signed' && hisText(order) ? `<span class="order-detail-his">${esc(hisText(order))}${order.hisOrderNumber ? ` · <span data-no-i18n>${esc(order.hisOrderNumber)}</span>` : ''}</span>` : '';
    const actions = his + (canStop ? toggle('stop', 'Stop order') : '') + (canCancel ? toggle('cancel', lab ? 'Stop order' : 'Cancel order') : '');
    return `<div class="order-detail-head"><p class="order-detail-state">${badge(orderStage(order), ['unknown','rejected'].includes(order.his))}${hisNote}</p>${actions ? `<div class="order-detail-actions">${actions}</div>` : ''}</div>
      ${order.his === 'unknown' ? '<p class="notice error">System response unconfirmed; clarify the original request instead of creating a duplicate.</p>' : ''}
      ${canStop ? `<div class="order-act-panel" id="order-act-stop-${id}" data-detail-panel hidden>${ctx.form('stopOrder',ctx.field('end','Stop time','2026-08-31T18:00','datetime-local','required')+ctx.area('reason','Reason for stopping'),'Confirm stop',{id:order.id})}</div>` : ''}
      ${canCancel ? `<div class="order-act-panel" id="order-act-cancel-${id}" data-detail-panel hidden>${cancelArea(ctx,order,executions)}</div>` : ''}`;
  }

  function executionForm(ctx, order, executions) {
    const {actor, form, field, select} = ctx;
    if (!ctx.canNurse || order.clinical !== 'active' || executions.some(item=>item.status==='done')) return '';
    const type = orderType(order);
    const title = type === 'medication' ? (injectionPattern.test(order.route || '') ? 'Record this injection' : 'Record this administration') : ['lab','imaging'].includes(type) ? 'Record this collection / performance' : 'Record this performance';
    // 藥品＝MedicationAdministration（occurence、status、dosage.dose／route、statusReason）；
    // 檢驗檢查與其他醫囑＝執行紀錄（Procedure.status），沒有劑量與途徑，所以不收這兩欄。
    const medication = type === 'medication';
    const checks = medication ? `<label class="check identity-check"><input type="checkbox" name="identityConfirmed">Patient identity confirmed</label>` : '';
    const dispense = order.dispenseQuantity ? ' (' + order.dispenseQuantity.value + ' ' + order.dispenseQuantity.unit + ')' : '';
    const guidance = medication ? [order.dose ? order.dose + dispense : 'Dose not provided', order.route || 'Route not provided', order.frequency || 'Timing not provided'] : [order.frequency || 'Timing not provided'];
    // 給藥端（2026-11-01 院方定案）：高警訊藥要第二位護理師核對；經管灌與給藥量一眼看得到。
    const highAlert = medication && (order.attributes || []).includes('A08'), people = (ctx.state && ctx.state.people) || ctx.actors || {}, me = ctx.route && ctx.route.actor;
    const flags = medication ? [highAlert ? '<span class="pill danger">High-alert medication</span>' : '', order.viaTube ? '<span class="pill info">Via feeding tube</span>' : '', order.dispenseQuantity ? `<span class="pill muted">Dispense ${ctx.esc(order.dispenseQuantity.value + ' ' + order.dispenseQuantity.unit)}</span>` : ''].filter(Boolean).join(' ') : '';
    const witnesses = highAlert ? Object.entries(people).filter(([k, x]) => x && x.role === 'nurse' && x.active !== false && k !== me).map(([k, x]) => [k, x.name]) : [];
    const witness = highAlert ? `<label>Second nurse who double-checked (required for high-alert medication)<select name="witness" data-no-i18n><option value="">—</option>${witnesses.map(([k, v]) => `<option value="${ctx.esc(k)}">${ctx.esc(v)}</option>`).join('')}</select></label>` : '';
    return `<details class="execution-entry"><summary>${title}</summary>${flags ? `<p class="order-flags">${flags}</p>` : ''}<p class="order-guidance"><strong>Order instructions: </strong>${guidance.map(ctx.esc).join(' · ')}</p>${form('execute',
      field('at',medication ? 'Administration time' : ['lab','imaging'].includes(type) ? 'Collection / performed time' : 'Performed time','2026-08-31T09:00','datetime-local','required')+
      select('status','Status',[['done','Completed'],['held','On hold'],['notDone','Not done']])+
      (medication ? field('actual','Dose (prefilled from order; please verify)',order.dose || '')+
        field('route','Route (prefilled from order; please verify)',order.route || '') : '')+
      field('reason',medication ? 'Status reason (dose / route variance, on hold or not done)' : 'Status reason (on hold or not done)')+checks+witness,
      medication ? 'Save administration record' : 'Save performance record',{id:order.id,p:order.p})}</details>`;
  }

  function executionHistory(ctx, order, executions) {
    const {actor, actors, esc, label, badge, source, form, select, field, empty} = ctx;
    if (!executions.length) return empty('No actual administration record yet; cannot be assumed done.');
    const completedLabel = order.kind === 'medication' && injectionPattern.test(order.route || '') ? 'Given by' : 'Performed by';
    return executions.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(item => `<article class="execution-history">
      <div class="row between"><strong>${item.status === 'done' ? completedLabel : 'Recorded by'}: ${esc(actors[item.actor]?.name || 'Not provided by source')}</strong>${badge(label(item.status), item.status !== 'done')}</div>
      ${order.kind === 'medication' ? `<p>Dose / route: ${esc((item.actual || '—')+' / '+(item.route || '—'))}</p>` : ''}
      <p>${item.reason ? 'Status reason: '+esc(item.reason) : 'No status reason recorded'}</p>
      ${item.witness ? `<p>Double-checked by: <span data-no-i18n>${esc(actors[item.witness]?.name || item.witness)}</span></p>` : ''}
      ${source(item.id+' · Actual time '+root.ICUTimeZone.full(item.at)+' · Recorded at '+(item.recorded ? root.ICUTimeZone.full(item.recorded) : 'Not provided by source'))}
      ${item.review ? `<p>Doctor review: ${badge(label(item.review.outcome),item.review.outcome==='difference')} ${esc(item.review.note)}</p>` : ctx.canOrder ? form('reviewExecution',select('outcome','Manual review outcome',[['reviewed','Reviewed'],['difference','Discrepancy to follow up']])+field('note','Review basis / discrepancy note','','text','required'),'Save review',{id:item.id}) : ''}
    </article>`).join('');
  }

  // Every actor with a completed execution counts, not just the most recent one. Held or
  // not-done rows keep their recorder separate: H8 forbids inventing an executor.
  // 最後一次給藥：MedicationAdministration.status（completed／not-done／on-hold）＋時間＋記錄者；沒有紀錄就是「—」。
  // 2026-11-07：列上只放時間與實際量；已完成不另標狀態，未執行／暫停才用醒目標籤；記錄者在明細的給藥歷程。
  function administrationCell(ctx, executions, today) {
    const {esc, badge, label} = ctx;
    const latest = executions.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0];
    if (!latest) return '<span class="performer-none">—</span>';
    return (latest.status === 'done' ? '' : badge(label(latest.status), true)) + `<span class="ordered-at">${timeCell(esc, latest.at, today)}</span>` + (latest.actual ? `<span class="ordered-by">${esc(latest.actual)}</span>` : '');
  }
  // 清單時間（2026-11-07）：列上用短格式（今天只寫時:分），滑過看完整時間；完整時間也在明細。今天以醫院牆上日期為準。
  const todayOf = state => { const TZ = root.ICUTimeZone, c = state.demoClock; return c ? TZ.wall(TZ.millis(c)).slice(0, 10) : ''; };
  const timeCell = (esc, at, today) => at ? `<time datetime="${esc(at)}" title="${esc(root.ICUTimeZone.full(at))}">${esc(root.ICUTimeZone.short(at, today))}</time>` : '';
  function performerCell(ctx, executions) {
    const {actors, esc, source} = ctx;
    const done = executions.filter(item => item.status === 'done');
    if (!done.length) {
      const recorders = [...new Set(executions.map(item => item.actor))];
      return `<span class="performer-none">No performer yet</span>` + (recorders.length ? source('Recorders only: '+recorders.map(id => actors[id]?.name || 'Not provided by source').join(', ')+'; delayed or not-given entries don\'t count as performers.') : '');
    }
    const counts = new Map();
    done.forEach(item => counts.set(item.actor, (counts.get(item.actor) || 0) + 1));
    return `<div class="performer-list">${[...counts.entries()].map(([id, n]) => `<span class="performer-chip">${esc(actors[id]?.name || 'Not provided by source')}${n > 1 ? `<b>×${n}</b>` : ''}</span>`).join('')}</div>`;
  }

  // --- 表頭排序（純函式；狀態排序：有效→尚未生效→已停止→已取消） -----
  const sortCols = {
    ordered: order => order.orderedAt || order.start || '',
    type: order => typeLabel(orderType(order)),
    name: order => order.catalog?.zh || order.name || ''
  };
  function statusRank(order, executions) {
    if (order.clinical === 'cancelled') return 6;
    if (order.clinical === 'stopped') return 5;
    return order.clinical === 'active' ? 0 : 1;
  }
  function sortOrders(list, state, col, dir) {
    const sign = dir === 'asc' ? 1 : -1;
    const exOf = order => state.executions.filter(e => e.order === order.id && e.version === order.version);
    const key = sortCols[col] || sortCols.ordered;
    return list.slice().sort((a,b) => {
      let r = col === 'status' ? statusRank(a, exOf(a)) - statusRank(b, exOf(b)) : String(key(a)).localeCompare(String(key(b)), 'en', {numeric:true});
      if (!r) r = String(b.orderedAt || b.start || '').localeCompare(String(a.orderedAt || a.start || ''));
      return sign * r;
    });
  }
  function sortableTh(ctx, col, text) {
    const {route, esc} = ctx;
    const active = route.orderSort === col;
    const next = active ? (route.orderDir === 'asc' ? 'desc' : 'asc') : (col === 'ordered' ? 'desc' : 'asc');
    const mark = active ? (route.orderDir === 'asc' ? '▲' : '▼') : '⇅';
    return `<th scope="col" aria-sort="${active ? (route.orderDir === 'asc' ? 'ascending' : 'descending') : 'none'}"><a class="sort-link" data-keep-filter href="${esc(href(route, {orderSort: col, orderDir: next, record: ''}))}" title="Sort by ${text}">${text}<span class="sort-indicator" aria-hidden="true">${mark}</span></a></th>`;
  }

  function worklist(ctx) {
    const {state, route, patient, actors, esc, label, badge, source, empty} = ctx;
    const exec = execOf(state, route);
    const filtered = sortOrders(state.orders.filter(order => order.p === patient.id && (route.orderKind === 'all' || orderType(order) === route.orderKind) && (exec === 'all' || execState(order, state.executions.filter(e => e.order === order.id && e.version === order.version)) === exec)), state, route.orderSort, route.orderDir);
    if (!filtered.length) return empty('No orders match the current filter.');
    // 分三層（2026-11-07）：列上是掃一眼要看的值；醫囑編號與版本、開立人、完整時間在明細；篩選已限定一種類型就不列類型欄，藥物清單把劑量、途徑放上列。
    const showType = route.orderKind === 'all', med = route.orderKind === 'medication', today = todayOf(state), cols = 7 + (showType ? 1 : 0) + (med ? 2 : 0);
    return `<div class="table-wrap"><table class="order-worklist${med ? ' med-worklist' : ''}"><thead><tr>
      <th scope="col" class="col-order-actions-head"><span class="visually-hidden">Details</span></th>${sortableTh(ctx,'name','Order')}${showType ? sortableTh(ctx,'type','Order type') : ''}${med ? '<th scope="col">Dose</th><th scope="col">Route</th>' : ''}<th scope="col">Frequency</th><th scope="col" title="FHIR MedicationRequest.effectiveDosePeriod">Start / End</th>${sortableTh(ctx,'ordered','Ordered at')}${sortableTh(ctx,'status','Status')}<th scope="col" title="FHIR MedicationAdministration.status">Last administration</th>
    </tr></thead>${filtered.map(order => {
      const executions = state.executions.filter(item => item.order === order.id && item.version === order.version);
      const detailId = 'order-detail-'+order.id;
      const type = orderType(order);
      const justAdded = root.ICUUIState && root.ICUUIState.lastBatch && order.batch === root.ICUUIState.lastBatch;
      const cancelled = order.clinical === 'cancelled';
      return `<tbody class="order-row-group${justAdded ? ' just-added' : ''}${cancelled ? ' order-cancelled' : ''}" id="record-${esc(order.id)}" data-order-id="${esc(order.id)}"${order.catalog && addable(order.catalog) ? ` data-repeat-key="${esc(order.catalog.key)}"` : ''}><tr>
        <td class="col-order-actions"><button type="button" class="tertiary order-toggle" data-keep-label data-order-toggle="${esc(detailId)}" aria-expanded="false" aria-controls="${esc(detailId)}" aria-label="Show details" title="Show details">${chevron}</button></td>
        <td><strong>${esc(order.catalog?.zh || order.name)}</strong></td>
        ${showType ? `<td><span class="order-type-tag tone-${esc(type)}">${esc(typeLabel(type))}</span></td>` : ''}${med ? `<td class="col-dose">${esc(order.dose || '—')}</td><td class="col-route">${esc(order.route || '—')}</td>` : ''}<td class="col-frequency">${esc(order.frequency || 'Not provided by source')}</td>
        <td class="col-period"><span class="ordered-at">${order.start ? timeCell(esc, order.start, today) : esc('Not provided by source')}</span><span class="ordered-by">${order.end ? timeCell(esc, order.end, today) : esc('Until stopped')}</span></td>
        <td class="col-ordered"><span class="ordered-at">${order.orderedAt ? timeCell(esc, order.orderedAt, today) : esc('Order time not provided by source')}</span></td>
        <td>${order.clinical === 'active' ? '<span class="status-quiet">Active</span>' : badge(requestStatus(order), true)}</td>
        <td>${administrationCell(ctx, executions, today)}</td>
      </tr><tr id="${esc(detailId)}" class="order-detail-row" hidden><td colspan="${cols}">${detailHead(ctx, order, executions)}<div class="order-detail-grid is-two">
        <section><h3>Order details</h3><dl><dt>Order ID / version</dt><dd data-no-i18n>${esc(order.id + ' v' + order.version)}</dd><dt>Ordered at</dt><dd>${esc(order.orderedAt ? root.ICUTimeZone.full(order.orderedAt) : 'Order time not provided by source')}</dd><dt>Dose / content</dt><dd>${esc(order.dose || 'Not provided by source')}</dd>${order.dispenseQuantity ? `<dt>Dispense quantity</dt><dd data-no-i18n>${esc(order.dispenseQuantity.value + ' ' + order.dispenseQuantity.unit + ' (' + (order.dose || '') + ' × ' + order.dispenseQuantity.factor + ')')}</dd>` : ''}<dt>Route / method</dt><dd>${esc(order.route || 'Not provided by source')}</dd>${order.dosageInstruction ? `<dt>Administration method</dt><dd>${esc(order.dosageInstruction[0].method?.text || 'Not specified')}</dd><dt>Priority</dt><dd>${esc((root.ICUStore?.priorities || {})[order.priority] || order.priority || 'Routine')}</dd>` : ''}${order.dosePerKg ? `<dt>Per-kg dose</dt><dd>${esc(order.dosePerKg.value + ' ' + order.dosePerKg.unit + ' × ' + order.dosePerKg.kg + ' kg' + (order.dosePerKg.mode === 'daily' ? ' ÷ ' + order.dosePerKg.perDay + '/day' : '') + ' = ' + order.dosePerKg.rounded + ' ' + order.dosePerKg.unit.split('/')[0] + (order.dosePerKg.raw !== order.dosePerKg.rounded ? ' (rounded from ' + order.dosePerKg.raw + ')' : ''))}</dd>` : ''}${order.dosingWeight ? `<dt>Dosing weight</dt><dd>${esc(order.dosingWeight.kg + ' kg (' + (order.dosingWeight.basis === 'admission' ? 'admission weight' : 'measured weight') + ', ' + String(order.dosingWeight.at || '').replace('T', ' ') + ')')}</dd>` : ''}<dt>How often</dt><dd>${esc(order.frequency || 'Not provided by source')}</dd><dt>Valid period</dt><dd>${esc(root.ICUTimeZone.full(order.start)+' – '+(order.end ? root.ICUTimeZone.full(order.end) : 'Open-ended'))}</dd></dl>${source('Ordered by: '+(actors[order.author]?.name || 'Not provided by source')+(order.fromSet ? ' · Order set source: '+order.fromSet.mainName+(order.fromSet.groupName && order.fromSet.groupName !== 'Whole set' ? ' / '+order.fromSet.groupName : '') : ''))}${(order.safety || []).length ? `<div class="order-safety-record"><h4>Medication safety alert handling</h4>${order.safety.map(item => `<p>${esc(item.handling)}${item.reason ? ': ' + esc(item.reason) : ''}${source(item.pair + ' · ' + (actors[item.by]?.name || 'Not provided by source') + ' · ' + item.at)}</p>`).join('')}</div>` : ''}${order.consultSource ? ctx.source('Consultation recommendation source: ' + order.consultSource) : ''}${order.mdtSource ? ctx.source('Team meeting (MDT) conclusion source: hand-off task ' + order.mdtSource) : ''}${order.refSource ? ctx.source('Allied-health consult source: ' + order.refSource) : ''}${order.dosePerBsa ? `<dl><dt>Per-m² dose</dt><dd data-no-i18n>${esc(order.dosePerBsa.value + ' ' + order.dosePerBsa.unit + ' × BSA ' + order.dosePerBsa.bsa + ' m² (' + order.dosePerBsa.cm + ' cm, ' + order.dosePerBsa.kg + ' kg, ' + order.dosePerBsa.formula + ') = ' + order.dosePerBsa.rounded + ' ' + order.dosePerBsa.unit.split('/')[0] + (order.dosePerBsa.raw !== order.dosePerBsa.rounded ? ' (rounded from ' + order.dosePerBsa.raw + ')' : ''))}</dd></dl>` : ''}${order.clinical === 'cancelled' ? cancelArea(ctx, order, executions) : ''}</section>
        <section class="order-execution-panel"><h3>Actual administration</h3>${executionHistory(ctx,order,executions)}${executionForm(ctx,order,executions)}</section>
      </div></td></tr></tbody>`;
    }).join('')}</table></div>`;
  }

  function patientId(ctx) { return ctx.patient.id; }

  // --- 開立頁 ------------------------------------------------------------------------
  // 醫師的核心任務只有一件：快速找到品項、放進來、確認。畫面只放搜尋、一列類型 chips、
  // 結果清單與本次新增清單；提醒與備註只在有內容時才出現（2026-09-06 回饋）。
  const taxonomy = () => root.ICUOrderTaxonomy;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const foldText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  // The store only accepts service/medication into the cart; supply and diet stay read-only reference.
  // 可加入：B 目錄啟用、可開立種類，且醫令維護檔沒有把它關掉（2026-10-18）。
  const SCHEMA = () => root.ICUMasterSchema || (typeof module !== 'undefined' ? require('../master-schema.js') : null);
  // 這個藥在維護檔裡的開立屬性（預設值、上限、屬性、注意事項、限制、供應狀態）；store 的 cartAdd／catalogOrder 讀同一份。
  const rxOf = (state, key) => { const S = SCHEMA(); return S && state ? S.prescribing(state, key) : null; };
  const addable = (entry, state) => !!entry && entry.active && ['service','medication'].includes(entry.kind) && taxonomy().isOrderable(entry) && !(entry.kind === 'medication' && state && rxOf(state, entry.key).stopped);
  const cartKey = (route, patient) => route.actor + ':' + patient.id + ':cart';
  const RESULT_LIMIT = 80;
  // 只列有可開立品項的類型；套組是 UI 構造，另外處理。
  const pickerTypes = ['medication','lab','imaging','care'];
  const shortType = id => ({medication:'Medication', lab:'Lab', imaging:'Exam', care:'Care', set:'Order set'})[id] || taxonomy().labelOf(id);

  // 左欄的一列（2026-11-08）：兩行，品名；含量、成分、ATC、上次劑量。成分與 ATC 一定列，看得出兩個商品名是不是同一個東西；
  // 代碼只在搜尋命中代碼時列出；類型標籤只在「全部醫令」出現（已選一種類型時每列都一樣）。
  function entryRow(entry, inCart, extra, favourite, rx, opts = {}) {
    const type = taxonomy().categoryOfEntry(entry) || 'other';
    const name = taxonomy().displayName(entry);
    const stopped = !!(rx && rx.stopped);
    const med = entry.kind === 'medication', q = foldText(opts.q).trim();
    const codeHit = !!q && foldText(entry.code).includes(q);
    const meta = [med ? entry.strength : '', med ? (entry.ingredient || 'Ingredient not provided by source') : '', med ? (entry.atc ? 'ATC ' + entry.atc : 'ATC not tagged') : '',
      codeHit ? (med ? 'Drug code ' : 'Service code ') + entry.code : '', extra].filter(Boolean).join(' · ');
    // 維護檔標示（2026-10-18）：高警訊與管制抗生素在清單就標出來；住院供應停止的列不可加入，標 Stopped。
    const TAGS = (SCHEMA() && SCHEMA().ATTRIBUTE_TAGS) || {};
    const flags = rx ? rx.attributes.filter(c => c === 'A08' || c === 'A04').map(c => `<span class="pick-flag flag-${esc(c)}">${esc(TAGS[c] || c)}</span>`).join('')
      + (stopped ? `<span class="pick-flag flag-stopped" title="${esc((rx.supply && rx.supply.message) || '')}">Stopped (inpatient)</span>` : rx.supply && rx.supply.status === 'restricted' ? `<span class="pick-flag flag-restricted" title="${esc(rx.supply.message || '')}">Restricted supply</span>` : '') : '';
    const star = favourite === undefined ? '' : `<button type="button" class="pick-star${favourite ? ' on' : ''}" data-action="toggleFavorite" data-payload="${esc(JSON.stringify({key: entry.key, scope: 'doctor', on: !favourite}))}" title="${favourite ? 'Remove from favorites' : 'Add to favorites'}" aria-label="${favourite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${favourite}">${favourite ? '★' : '☆'}</button>`;
    return `<div class="pick-line"><button type="button" class="pick-row${opts.showType ? '' : ' no-tag'}${inCart ? ' in-cart' : ''}${stopped ? ' is-stopped' : ''}" data-type="${esc(type)}" data-action="cartAdd" data-payload="${esc(JSON.stringify(opts.fromOrder ? {key: entry.key, fromOrder: opts.fromOrder} : {key: entry.key}))}"${inCart || stopped ? ' disabled' : ''} title="${esc(stopped ? 'Stopped for inpatient supply; cannot be ordered' : name)}">${opts.showType ? `<span class="type-tag tone-${esc(type)}">${esc(shortType(type))}</span>` : ''}<span class="pick-name">${esc(name)}${flags}</span>${meta ? `<span class="pick-meta">${esc(meta)}</span>` : ''}<span class="pick-add">${inCart ? 'Added' : stopped ? 'Stopped' : 'Add'}</span></button>${star}</div>`;
  }
  // 組套 → 醫令：只認 B 目錄裡還在啟用、且可開立的品項；查無或停用的另外列出，不默默吞掉。
  function groupItems(group, state) {
    const clinical = root.ICUClinical;
    const items = [], missing = [];
    group.keys.forEach(key => {
      const entry = clinical.entry(key);
      if (addable(entry, state)) items.push({key, name: taxonomy().displayName(entry), type: taxonomy().categoryOfEntry(entry) || 'other'});
      else missing.push(key);
    });
    return {items, missing};
  }
  const mainSetItems = (set, state) => set.groups.flatMap(group => groupItems(group, state).items);

  // 來源：左欄的第二個維度。既有醫囑／個人常用／部門常用／組套四選一，與上方的類型交叉生效
  // （組套除外，C1 的 Bundle 本來就跨類型）。搜尋與藥品篩選是整本目錄的查詢，會暫時蓋掉來源。
  const SOURCES = [['recent', 'Existing orders'], ['doctor', 'Favorites'], ['department', 'Department favorites'], ['set', 'Order sets']];
  const sourceLabel = id => (SOURCES.find(x => x[0] === id) || SOURCES[0])[1];
  const sourceOf = route => SOURCES.some(x => x[0] === route.favScope) ? route.favScope : 'recent';
  // 科常用以員工所屬部門為鍵（G9 practitioner_organization），不是病人所在病房（2026-10-18）。
  const deptOf = (state, patient, actorId) => (state.people && state.people[actorId] && state.people[actorId].department) || patient.department || 'Department not specified';

  // 類型 chips 與藥囑的三個下拉共同決定一個品項算不算「目前可見」。
  function fitsFor(route, state) {
    const tax = taxonomy(), catFilter = catSet(pickerCat(route)), drugFilter = drugFilterOf(route);
    return entry => addable(entry) && (!catFilter || catFilter.has(tax.categoryOfEntry(entry) || 'other'))
      && (entry.kind !== 'medication' || tax.matchesDrugFilter(entry, drugFilter));
  }

  // 一個來源吐出的品項；組套自成一格，交給 setBody 畫。
  function sourceItems(state, route, patient, actorId, scope) {
    const clinical = root.ICUClinical, fits = fitsFor(route, state);
    if (scope === 'doctor' || scope === 'department') {
      return taxonomy().favouriteKeys(scope, state, actorId, {department: deptOf(state, patient, actorId)})
        .map(key => clinical.entry(key)).filter(entry => fits(entry)).map(entry => ({entry, extra: ''}));
    }
    const seen = new Set();
    return state.orders
      .filter(order => order.p === patient.id && order.catalog && fits(order.catalog))
      .sort((a, b) => String(b.orderedAt || b.start || '').localeCompare(String(a.orderedAt || a.start || '')))
      .filter(order => { if (seen.has(order.catalog.key)) return false; seen.add(order.catalog.key); return true; })
      .slice(0, 12)
      .map(order => ({entry: clinical.entry(order.catalog.key) || order.catalog, extra: 'Last: ' + [order.dose, order.frequency].filter(Boolean).join(' '), order: order.id}));
  }
  const sourceCount = (state, route, patient, actorId, scope) =>
    scope === 'set' ? chosenSet(route).groups.length : sourceItems(state, route, patient, actorId, scope).length;

  function emptySource(scope, cat) {
    const typeNote = cat === 'all' ? '' : 'Showing only “' + (catLabels.find(x => x[0] === cat) || ['', 'All order items'])[1] + '”; switch to “All order items” to see other items. ';
    if (scope === 'doctor') return `<div class="pick-empty"><strong>No matching items in favorites.</strong><p>${typeNote}In search results, click ☆ at the end of any row to add it to favorites.</p></div>`;
    if (scope === 'department') return `<div class="pick-empty"><strong>No matching items in department favorites.</strong><p>${typeNote}Department favorites are maintained by department administrators under Maintenance settings → Department favorites.</p></div>`;
    return `<div class="pick-empty"><strong>No existing orders of this type for this patient.</strong><p>${typeNote}Switch to “Favorites”, “Department favorites” or “Order sets”, or type a keyword to search catalog B.</p></div>`;
  }

  // 結果清單獨立成純函式：輸入框逐字搜尋時 app.js 只重畫這一塊，不重畫整頁（游標才不會跳掉）。
  function results(state, route, patient, actorId) {
    const tax = taxonomy(), clinical = root.ICUClinical;
    const cart = state.drafts[cartKey(route, patient)] || [];
    const cat = pickerCat(route);
    const q = String(route.q || '').trim();
    const inCart = key => cart.some(item => item.key === key);
    const fits = fitsFor(route, state);
    const personal = new Set(tax.favouriteKeys('doctor', state, actorId, {}));
    const row = (entry, extra, fromOrder) => entryRow(entry, inCart(entry.key), extra, personal.has(entry.key), entry.kind === 'medication' ? rxOf(state, entry.key) : null, {showType: cat === 'all', q, fromOrder: entry.kind === 'medication' ? fromOrder : ''});
    const scope = sourceOf(route);
    // 清掉關鍵字與藥品篩選就回到原來選的來源；提示寫在清單裡，逐字搜尋時才會跟著重畫。
    const back = `<a class="pick-back" data-keep-filter href="${esc(href(route, {view: 'order', record: '', q: '', rxAtc: 'all', rxRoute: 'all', rxForm: 'all'}))}">Clear and return to “${esc(sourceLabel(scope))}”</a>`;
    const scan = matches => {
      const hits = [];
      for (const entry of clinical.catalog.entries) {
        if (!fits(entry) || !matches(entry)) continue;
        hits.push(entry);
        if (hits.length >= RESULT_LIMIT) break;
      }
      return hits;
    };
    if (q) {
      const hits = scan(entry => clinical.matches(entry.key, q));
      const head = `<p class="pick-count pick-takeover" role="status"><span>Search “${esc(q)}” · full catalog: ${hits.length >= RESULT_LIMIT ? 'Top ' + RESULT_LIMIT + ' records; please narrow your keywords' : hits.length + ' records'}</span>${back}</p>`;
      if (!hits.length) return head + `<div class="pick-empty"><strong>No items match “${esc(q)}”.</strong><p>Try Vietnamese or English ingredient names, or HIS codes; ${cat === 'all' ? '' : 'or switch the type above back to “All order items”; '}supplies and diet are reference only in this prototype and cannot be ordered.</p></div>`;
      return head + hits.map(entry => row(entry)).join('');
    }
    // 沒有關鍵字但有藥品篩選：直接列出符合篩選的品項，這是「不用每次都搜尋」的第二條路。
    if (drugFilterOn(route)) {
      const hits = scan(() => true);
      const head = `<p class="pick-count pick-takeover" role="status"><span>Medication filter · full catalog: ${hits.length >= RESULT_LIMIT ? 'Top ' + RESULT_LIMIT + ' records; please narrow the filters or add a keyword' : hits.length + ' records'}</span>${back}</p>`;
      if (!hits.length) return head + '<div class="pick-empty"><strong>No items match the current filters.</strong><p>Broaden the drug class, route or dosage form, or type a keyword to search.</p></div>';
      return head + hits.map(entry => row(entry)).join('');
    }
    if (scope === 'set') return setBody({state, route, patient});
    const items = sourceItems(state, route, patient, actorId, scope);
    if (!items.length) return emptySource(scope, cat);
    return `<p class="pick-count visually-hidden" role="status">${esc(sourceLabel(scope))} · ${items.length} records${cat === 'all' ? '' : ' (filtered by type)'}</p>`
      + items.map(item => row(item.entry, item.extra, item.order)).join('');
  }

  // 來源那一列：跟類型同一欄、同一種 tab 樣式，帶筆數讓醫師點下去之前就知道有沒有東西。
  function sourceRow(ctx) {
    const {state, route, patient} = ctx;
    const scope = sourceOf(route);
    const jump = changes => esc(href(route, Object.assign({view: 'order', record: ''}, changes)));
    const tab = ([id, text]) => {
      const total = sourceCount(state, route, patient, route.actor, id);
      return `<a class="fav-tab${scope === id ? ' active' : ''}${total ? '' : ' is-empty'}" data-keep-filter role="tab" href="${jump({favScope: id})}"${scope === id ? ' aria-current="true" aria-selected="true"' : ' aria-selected="false"'}>${esc(text)}<b>${total}</b></a>`;
    };
    const locked = scope === 'department' ? (() => {
      const dept = deptOf(state, patient, route.actor), W = root.ICUWorkflow, can = !!(W && W.canMaintainDept && W.canMaintainDept(state, route.actor, dept));
      return `<span class="fav-locked" title="Department favorites are maintained by department administrators in Maintenance settings">${esc(dept)} · ${can ? `<a href="${esc(href(route, {view: 'settings', tab: 'favorites', mdept: dept, record: ''}))}">maintain in Maintenance settings</a>` : 'maintained by department administrators, read-only here'}</span>`; })() : '';
    return `<div class="pick-source-row"><span class="filter-label">Source</span><div class="fav-tabs pick-sources" role="tablist" aria-label="Item source">${SOURCES.map(tab).join('')}</div>${locked}</div>`;
  }

  // 組套分頁：頭列選主套並可整套加入，內容一列一個組套——按一下開出該組套裡的多個醫令。
  // 主套與組套本來就跨類型（C1 的 Bundle 同時含檢驗、影像、藥品），所以不受上方類型 chips 影響。
  const chosenSet = route => mainSets.find(set => set.id === route.orderSet) || mainSets[0];
  const setPayload = (chosen, keys, group) => esc(JSON.stringify({keys, setId: chosen.id, setName: chosen.name, groupId: group ? group.id : '', groupName: group ? group.name : 'Whole set'}));

  function setHead(ctx) {
    const {state, route, patient} = ctx;
    const cart = state.drafts[cartKey(route, patient)] || [];
    const chosen = chosenSet(route);
    const remaining = mainSetItems(chosen, state).filter(item => !cart.some(x => x.key === item.key));
    return `<div class="fav-setpick"><label class="visually-hidden" for="order-set">Main set</label>
      <select id="order-set" aria-controls="order-set-groups">${mainSets.map(set => `<option value="${esc(set.id)}"${set.id === chosen.id ? ' selected' : ''}>${esc(set.name)} (${set.groups.length} order sets · ${mainSetItems(set, state).length} order items)</option>`).join('')}</select>
      <button type="button" class="setbar-add" data-action="cartAddSet" data-payload="${setPayload(chosen, remaining.map(item => item.key), null)}"${remaining.length ? '' : ' disabled'}>${remaining.length ? 'Add whole set: ' + remaining.length + ' items)' : 'Whole set added'}</button></div>`;
  }

  function setBody(ctx) {
    const {state, route, patient} = ctx;
    const cart = state.drafts[cartKey(route, patient)] || [];
    const inCart = key => cart.some(item => item.key === key);
    const chosen = chosenSet(route);
    const rows = chosen.groups.map(group => {
      const {items, missing} = groupItems(group, state);
      const remaining = items.filter(item => !inCart(item.key));
      const types = [...new Set(items.map(item => item.type))];
      return `<div class="setgroup-row">
        <span class="setgroup-tags">${types.map(type => `<span class="type-tag tone-${esc(type)}">${esc(shortType(type))}</span>`).join('') || '<span class="type-tag">—</span>'}</span>
        <span class="setgroup-name">${esc(group.name)}<b>${items.length} order items</b></span>
        <span class="setgroup-items">${items.map(item => `<span class="setbar-item${inCart(item.key) ? ' in-cart' : ''}">${esc(item.name)}</span>`).join('')}${missing.length ? `<span class="setgroup-missing">${missing.length} items not found or discontinued in catalog B; not included</span>` : ''}</span>
        <button type="button" class="setgroup-add" data-action="cartAddSet" data-payload="${setPayload(chosen, remaining.map(item => item.key), group)}"${remaining.length ? '' : ' disabled'}>${remaining.length ? 'Add ' + remaining.length + ' items)' : 'Added'}</button>
      </div>`;
    }).join('');
    return `<div class="setgroup-list" id="order-set-groups" aria-label="Order set list">${rows}</div>
      <p class="setbar-note">Each row is one <strong>order set</strong>; click to order all its order items. Order sets span types and ignore the type filter above. ${chosen.gaps.length ? 'In this main set, “' + chosen.gaps.map(esc).join('”, “') + '” have no matching item in catalog B and are not yet included. ' : ''}Source: ${esc(chosen.source)}; item mapping not approved by the hospital.</p>`;
  }

  // --- 對話框兩欄（2026-09-15 v9）：左＝找項目（類型＋搜尋＋來源＋清單）；右＝核對與確認（本次新增） ---
  // 四種醫囑（2026-11-08）：藥囑、檢驗、檢查、照護；舊網址的 labimaging／orders／處置等分類導到檢驗或照護。
  const catGroups = {all: null};
  const catSet = cat => catGroups[cat] === null ? null : (catGroups[cat] || new Set([cat]));
  function pickerCat(route) {
    const cat = route.orderCat;
    if (['all','medication','lab','imaging','care'].includes(cat)) return cat;
    return cat === 'labimaging' ? 'lab' : ['orders','procedure','surgery','supply','diet','other'].includes(cat) ? 'care' : 'all';
  }
  const catLabels = [['medication','Medication'],['lab','Lab'],['imaging','Exam'],['care','Care'],['all','All order items']];

  // 藥囑分頁的篩選列：B 目錄沒有分類欄位，三個下拉都由既有欄位統計而來。
  // 劑型用目錄現有的「單位」當代理值（Lọ／Viên／Ống…），不從越文品名推測劑型。
  const drugFilterOf = route => ({atc: route.rxAtc || 'all', route: route.rxRoute || 'all', form: route.rxForm || 'all'});
  const drugFilterOn = route => Object.values(drugFilterOf(route)).some(v => v !== 'all');

  function drugFilterRow(ctx) {
    const {route} = ctx;
    const f = drugFilterOf(route), facets = taxonomy().facets();
    // 群名用院方在字典維護的名稱（依介面語言），沒維護就用 WHO 英文原名（2026-11-01）。
    const S = SCHEMA(), lang = root.ICUi18n && root.ICUi18n.lang ? root.ICUi18n.lang() : 'en', atcName = code => S && S.atcGroupName ? S.atcGroupName(ctx.state, code, lang) : null;
    const sel = (name, value, options, label) => `<label class="rx-filter"><span>${esc(label)}</span><select data-filter-nav="${esc(name)}">${options}</select></label>`;
    const opt = (value, text, on) => `<option value="${esc(value)}"${on ? ' selected' : ''}>${esc(text)}</option>`;
    const byMajor = new Map();
    facets.atc.forEach(g => { if (!byMajor.has(g.major)) byMajor.set(g.major, []); byMajor.get(g.major).push(g); });
    const atcOptions = opt('all', 'All drug classes', f.atc === 'all') + [...byMajor.entries()].map(([major, list]) =>
      `<optgroup label="${esc(major + ' · ' + (atcName(major) || list[0].majorLabel))}" data-no-i18n>${list.map(g => opt(g.code, g.code + (atcName(g.code) ? ' ' + atcName(g.code) : '') + ' (' + g.total + ')', f.atc === g.code)).join('')}</optgroup>`).join('');
    const routeOptions = opt('all', 'All routes', f.route === 'all') +
      facets.routes.filter(r => r.entry).map(r => opt(r.id, r.entry.name + ' (' + r.total + ')', f.route === r.id)).join('');
    const formOptions = opt('all', 'All dosage forms', f.form === 'all') +
      facets.forms.map(x => opt(x.name, x.name + ' (' + x.total + ')', f.form === x.name)).join('');
    const reset = drugFilterOn(route)
      ? `<a class="rx-filter-reset" data-keep-filter href="${esc(href(route, {view: 'order', record: '', rxAtc: 'all', rxRoute: 'all', rxForm: 'all'}))}">Clear filters</a>` : '';
    return `<div class="filter-row rx-filter-row">${sel('rxAtc', f.atc, atcOptions, 'Drug class')}${sel('rxRoute', f.route, routeOptions, 'Route')}${sel('rxForm', f.form, formOptions, 'Dosage form')}${reset}</div>`;
  }

  // 左欄三層（2026-11-08）：類型（短名一列）→ 搜尋加「篩選」鈕 → 來源 → 清單。藥品三個篩選收在「篩選」裡，
  // 有套用時才展開並在鈕上標數字；Enter 加入第一筆寫在搜尋框的說明，不另佔一格。
  function catalogPane(ctx) {
    const {state, route, patient} = ctx;
    const cat = pickerCat(route);
    const jump = changes => esc(href(route, Object.assign({view: 'order', record: ''}, changes)));
    // 主套與組套跨類型，切換分類只篩下面的醫令清單，不重設已選主套。
    const seg = (id, text) => `<a class="fav-tab${cat === id ? ' active' : ''}" data-keep-filter role="tab" href="${jump({orderCat: id})}"${cat === id ? ' aria-current="true" aria-selected="true"' : ' aria-selected="false"'}>${esc(text)}</a>`;
    const med = cat === 'medication', nOn = Object.values(drugFilterOf(route)).filter(v => v !== 'all').length;
    const filterBtn = med ? `<button type="button" class="secondary rx-filter-toggle${nOn ? ' is-on' : ''}" data-disclosure-toggle="rx-filter-panel" data-keep-label aria-expanded="${nOn ? 'true' : 'false'}" aria-controls="rx-filter-panel"><span>Filter</span>${nOn ? `<b data-no-i18n>${nOn}</b>` : ''}</button>` : '';
    return `<div class="pick-cats-row"><span class="filter-label">Type</span><div class="fav-tabs pick-cats" role="tablist" aria-label="Orderable item categories">${catLabels.map(([id, text]) => seg(id, text)).join('')}</div></div>
      <div class="pick-search"><label class="visually-hidden" for="order-keyword">Search items</label><input id="order-keyword" type="search" autocomplete="off" value="${esc(route.q || '')}" placeholder="Drug or lab name, or code" aria-describedby="order-keyword-hint" title="Enter adds the first result"><span id="order-keyword-hint" class="visually-hidden">Enter adds the first result</span>${filterBtn}</div>
      ${med ? `<div id="rx-filter-panel" class="rx-filter-panel"${nOn ? '' : ' hidden'}>${drugFilterRow(ctx)}</div>` : ''}
      ${sourceRow(ctx)}
      ${sourceOf(route) === 'set' ? setHead(ctx) : ''}
      <div id="order-results" class="pick-results" aria-live="polite">${results(state, route, patient, route.actor)}</div>`;
  }

  // 總結表：分類沿用左欄的藥囑／檢驗檢查／醫囑三分，數字對得起來；空車不顯示。
  function cartSummary(cart) {
    if (!cart.length) return '';
    const tax = taxonomy();
    const cell = (label, n, extra = '') => `<div class="cart-sum-cell${n ? '' : ' is-zero'}${extra}"><dt>${esc(label)}</dt><dd>${n}</dd></div>`;
    const cells = [['medication', 'Medication'], ['lab', 'Lab'], ['imaging', 'Exam'], ['care', 'Care']].map(([id, label]) => {
      const set = catSet(id);
      return cell(label, cart.filter(item => set.has(tax.categoryOfEntry(item) || 'other')).length);
    }).join('');
    return `<dl class="cart-summary" aria-label="Summary of new items">${cells}<div class="cart-sum-cell cart-sum-total"><dt>Total</dt><dd>${cart.length}<small> order items</small></dd></div></dl>`;
  }

  function sidePane(ctx) {
    const {state, route, patient} = ctx;
    const cart = state.drafts[cartKey(route, patient)] || [];
    // 未送出的這一批只存在這台裝置、依醫師＋病人分開（2026-10-24）；交班或 24 小時沒動會被清掉，這裡說一次清了什麼。
    const cleared = state.drafts[route.actor + ':' + patient.id + ':cartCleared'];
    const clearedNote = cleared ? `<p class="notice cart-cleared" role="status">${cleared.reason === 'handover'
      ? `${cleared.items.length} unsent items were cleared at ${esc(String(cleared.at || '').slice(0, 16).replace('T', ' '))} after your handover: ${esc(cleared.items.join(', '))}`
      : cleared.reason === 'logout'
      ? `${cleared.items.length} unsent items were cleared at ${esc(String(cleared.at || '').slice(0, 16).replace('T', ' '))} when you signed out: ${esc(cleared.items.join(', '))}`
      : `${cleared.items.length} unsent items were cleared at ${esc(String(cleared.at || '').slice(0, 16).replace('T', ' '))} after 24 hours without changes: ${esc(cleared.items.join(', '))}`}</p>` : '';
    const clear = cart.length ? `<button type="button" class="secondary compact-button cart-clear" data-cart-clear>Clear batch</button>` : '';
    return `<section class="order-cart" aria-labelledby="order-cart-title"><div class="order-cart-inner"><div class="order-cart-head"><h3 id="order-cart-title">New items <b>${cart.length}</b></h3>${clear}</div>${clearedNote}${cartForm(ctx)}</div></section>`;
  }

  // --- 本次新增清單 ------------------------------------------------------------------
  // 途徑清單：B 目錄啟用，且途徑字典沒有把它停用（2026-10-18）。
  const activeRoutes = (state) => root.ICUClinical.catalog.entries.filter(item => item.kind === 'route' && item.active && !(state && state.master && state.master.route && state.master.route[item.key] && state.master.route[item.key].active === false));
  const routeText = entry => entry ? entry.code + ' ' + (entry.zh || entry.name) : '';

  // 從既有醫囑加入（2026-11-08）：卡片帶上次的劑量、單位、途徑、給藥模式與頻率（輸注帶速率），
  // 上次用每公斤開的就帶回每公斤值；對不上字典的頻率留空讓醫師選，不拿維護預設頂替。
  function lastDosing(state, item) {
    const order = item.fromOrder ? state.orders.find(o => o.id === item.fromOrder && o.catalog && o.catalog.key === item.key) : null;
    if (!order) return null;
    const S = root.ICUStore || {}, rates = (((order.dosageInstruction || [])[0] || {}).doseAndRate) || [];
    const typed = code => (rates.find(r => (((r.type || {}).coding || [])[0] || {}).code === code) || {}).doseQuantity;
    const ordered = typed('ordered'), calc = typed('calculated');
    const m = /^\s*(\d+(?:\.\d+)?)\s*([^\s()]+)/.exec(String(order.dose || ''));
    const values = (S.timingGroups || []).flatMap(([, list]) => list.map(x => x[0]));
    const rawFreq = String((order.dosing && order.dosing.frequency) || order.frequency || '').trim();
    const rate = /^\s*(\d+(?:\.\d+)?)\s*(\S+)/.exec(String((order.dosing && order.dosing.rate) || ''));
    const routeEntry = order.routeCatalog ? (root.ICUClinical.entry(order.routeCatalog.key) || order.routeCatalog) : null;
    return {
      id: order.id,
      qty: ordered && ordered.value != null ? ordered.value : m ? Number(m[1]) : null,
      unit: (ordered && ordered.unit) || (m ? m[2] : ''),
      perKg: calc && /\/kg/.test(calc.unit || '') ? {value: calc.value, mode: /day$/.test(calc.unit) ? 'daily' : 'dose'} : null,
      route: routeEntry && routeEntry.code ? routeEntry : null,
      mode: order.dosing && (S.dosingModes || {})[order.dosing.mode] ? order.dosing.mode : 'scheduled',
      frequency: values.includes(rawFreq) ? rawFreq : values.find(v => rawFreq.split(/[\s(]/)[0] === v) || '',
      rate: rate ? rate[1] : '', rateUnit: rate && (S.rateUnits || {})[rate[2]] ? rate[2] : '',
    };
  }

  function datalists(state) {
    const units = root.ICUClinical.catalog.entries.filter(item => item.kind === 'unit' && item.active);
    const seen = new Set();
    const unitOptions = units.map(item => item.name).filter(name => { const key = foldText(name); if (!name || seen.has(key)) return false; seen.add(key); return true; });
    return `<datalist id="order-unit-options">${unitOptions.map(name => `<option value="${esc(name)}"></option>`).join('')}</datalist>
      <datalist id="order-route-options">${activeRoutes(state).map(entry => `<option value="${esc(routeText(entry))}"></option>`).join('')}</datalist>`;
  }

  // 只有真的比對到衝突才出現，而且只列跟「本次新增」有關的那幾條。
  // 一行式（2026-11-08）：等級、衝突種類、跟誰衝突與處理方式下拉在同一行；風險、監測與備註收進「說明」，選「其他」時自動展開。
  // 禁忌要寫覆寫理由，理由欄一直展開。高風險者必須選處理方式（含「調整劑量」「調整頻率」「其他＋說明」），否則整張不能送出。
  function conflictLines(ctx, item, conflicts, want) {
    const rx = root.ICUDrugSafety;
    // 過敏與禁忌排最前，其次成分重複，最後交互作用；同類再依嚴重度（assess 已排好）。
    const weight = c => c.kind === 'allergy' ? 0 : c.kind === 'condition' ? 1 : c.kind === 'duplicate' ? 2 : 3;
    // 開立頁（2026-10-24）：禁忌與需處理（要填理由或選處理方式）放 want='act'，其餘放 want='ref' 收進卡片的「參考」。
    const mine = conflicts.filter(c => c.involvesCart && (c.left.id === item.key || (c.right && c.right.id === item.key)))
      .filter(c => !want || (want === 'act') === (rx.needsOverride(c) || rx.needsHandling(c)))
      .sort((a, b) => weight(a) - weight(b));
    if (!mine.length) return '';
    return mine.map(c => {
      const other = c.left.id === item.key ? c.right : c.left;
      const blocked = rx.needsOverride(c), handle = !blocked && rx.needsHandling(c);
      const options = [...new Set([...(c.handling || []), 'Adjust dose', 'Adjust frequency'])];
      // 字串分段，介面語言才翻得到每一段（藥理類別、「現行醫囑 M2」）；藥名與劑量是資料。
      const kind = String(c.label || '').split(' × ').map(part => `<span>${esc(part)}</span>`).join(' × ');
      const origin = String(other.originLabel || '').trim();
      const withText = `<span class="rx-with">${origin ? `<span>${esc(origin)}</span> ` : ''}<span>${esc(other.name)}</span>${other.detail ? ` (<span>${esc(other.detail)}</span>)` : ''}${c.maintained ? ' <span>· maintained drug pair</span>' : ''}</span>`;
      const select = handle ? `<label class="rx-inline rx-handling"><span class="visually-hidden">Handling</span><select name="rxHandling:${esc(c.pair)}" class="rx-handling-select" required><option value="">Choose handling</option>${options.map(text => `<option value="${esc(text)}">${esc(text)}</option>`).join('')}<option value="__other__">Other</option></select></label>` : '';
      const why = (c.risk ? `<p>${esc(c.risk)}</p>` : '') + (c.monitor ? `<p>Monitoring: ${esc(c.monitor)}</p>` : '');
      const note = handle ? `<label class="rx-inline rx-inline-reason">Note<input name="rxReason:${esc(c.pair)}" class="rx-reason" placeholder="Optional: additional notes"></label>` : '';
      const more = why || note ? `<details class="rx-more"><summary>${note ? 'Details and note' : 'Risk and monitoring'}</summary>${why}${note}</details>` : '';
      const override = blocked ? `<div class="rx-actions rx-actions-block"><label class="rx-inline rx-inline-reason">Override reason (required; kept on the order)<input name="rxOverride:${esc(c.pair)}" class="rx-override" required placeholder="Explain why you are still ordering it and what safeguards you will take"></label></div>` : '';
      return `<div class="rx-line rx-compact tone-${esc(c.severity)}" data-rx-conflict="${esc(c.pair)}"><p class="rx-title"><strong class="rx-level">${esc(rx.severityLabel(c.severity))}</strong><span class="rx-kind">${kind}</span>${withText}</p>${select}${more}${override}</div>`;
    }).join('');
  }

  // 體重更新後回看（2026-10-22）：只在有尚未停用的藥囑依最新體重超過每公斤上限時出現；純參考，沒有任何處理動作。病人總覽也畫同一條。
  function weightRecheckNote(state, patient) {
    const r = SCHEMA() && patient ? SCHEMA().weightRecheck(state, patient.id) : null;
    if (!r || !r.orders.length) return '';
    return `<details class="rx-line tone-low rx-recheck" data-rx-recheck><summary><strong class="rx-level">Info</strong><span class="rx-kind">${esc(SCHEMA().weightRecheckText(r))}</span></summary><ul>${r.orders.map(o => `<li>${esc(o.name + ' · ' + o.dose + ' (ordered at ' + o.previous.kg + ' kg): ')}${o.over.map(x => `<span class="rx-recheck-over">${esc(x.label)}</span> — <span data-no-i18n>${esc(x.detail)}</span>`).join('; ')}</li>`).join('')}</ul><p class="source">Existing orders are not recalculated; review them when you next prescribe.</p></details>`;
  }
  // 每公斤上限（2026-10-18）：算得出就列用哪一筆體重與換算後的上限；沒有體重、區間外、沒有出生日期就明說未檢核（不是通過）。
  function kgLine(wd) {
    const S = SCHEMA();
    if (wd.status !== 'checked') return `<div class="rx-line rx-kg" data-rx-kg-unchecked><p class="rx-title"><strong class="rx-level">Not checked</strong><span class="rx-kind">Per-kg dose limit</span></p><p class="rx-with">${esc(S.weightDoseReason(wd))}; the per-kg limit is not checked for this order.</p></div>`;
    const part = (l, k) => { const perKg = k === 'single' ? l.perKgSingle : l.perKgDaily, cap = k === 'single' ? l.capSingle : l.capDaily, per = k === 'single' ? '' : '/day';
      return l[k] === null ? '' : (k === 'single' ? 'single' : 'daily') + ' ≤ ' + l[k] + ' ' + l.unit + per + ' (' + [perKg !== null ? perKg + ' ' + l.unit + '/kg' + per : '', cap !== null ? 'cap ' + cap + ' ' + l.unit + per : ''].filter(Boolean).join(', ') + ')'; };
    const limits = wd.limits.map(l => [part(l, 'single'), part(l, 'daily')].filter(Boolean).join(' · ')).join(' | ');
    return `<p class="rx-caution rx-kg" data-rx-kg>${esc('Per-kg limits at ' + S.weightLabel(wd.weight) + ' (' + (wd.weight.basis === 'admission' ? 'recorded ' : 'weighed ') + String(wd.weight.at || '').replace('T', ' ') + '): ' + limits)}</p><p class="rx-caution" data-rx-kg-unit hidden>${esc('Per-kg limit not checked: the dose unit differs from “' + wd.limits[0].unit + '”.')}</p>`;
  }
  // 維護檔在卡片上的提示（2026-10-18）：劑量上限（超過時要填說明，app.js 即時算每日總量）、注意事項、
  // 醫令限制（身分／部門／專科不符直接擋；需核准、需適應症要填並留在醫囑上；最大天數提示）。store 的 catalogOrder 再算一次，畫面漏掉不等於通過。
  function rxNoteLines(ctx, item, rx, K) {
    const S = SCHEMA(), actor = ctx.state.people && ctx.state.people[ctx.route.actor];
    // 開立頁（2026-10-24）：out＝要醫師動手的（需處理、Blocked、必填理由／核准／適應症、管灌剝半）；ref＝參考（上限、每公斤換算、注意事項、天數）。
    const key = esc(item.key), out = [], ref = [];
    const hasLimits = !!(K && (K.max_single_dose || K.max_daily_dose)), wd = S.weightDose(ctx.state, item.key, ctx.patient && ctx.patient.id);
    if (hasLimits) {
      const u = K.order_unit_code || item.unit || '';
      ref.push(`<p class="rx-caution rx-limits">Maintained limits: ${[K.max_single_dose ? 'single ≤ ' + K.max_single_dose + ' ' + u : '', K.max_daily_dose ? 'daily ≤ ' + K.max_daily_dose + ' ' + u : ''].filter(Boolean).map(esc).join(' · ')}</p>`);
    }
    if (wd) ref.push(kgLine(wd));
    if (hasLimits || (wd && wd.status === 'checked')) {
      out.push(`<div class="rx-line tone-high rx-dose" data-rx-dose hidden><p class="rx-title"><strong class="rx-level">Action required</strong><span class="rx-kind rx-dose-text"></span></p><div class="rx-actions"><label class="rx-inline rx-inline-reason">Reason (required; kept on the order)<input name="doseReason:${key}" class="rx-dose-reason" disabled placeholder="Explain why this dose is needed and what monitoring you will add"></label></div></div>`);
    }
    // 管灌與剝半（2026-10-18）：有維護就顯示；經管灌給藥或劑量不是整數單位時，store 要求填理由。
    const prep = K ? [K.no_crush ? 'Do not crush' : '', K.no_split ? 'Do not split' : '', K.no_tube ? 'Not for tube administration' : ''].filter(Boolean) : [];
    if (prep.length) out.push(`<div class="rx-line tone-moderate rx-prep" data-rx-prep data-no-crush="${K.no_crush ? 1 : 0}" data-no-split="${K.no_split ? 1 : 0}" data-no-tube="${K.no_tube ? 1 : 0}" data-order-unit="${esc(K.order_unit_code || '')}"><p class="rx-title"><strong class="rx-level">Preparation</strong><span class="rx-kind">${esc(prep.join(' · '))}</span></p><p class="rx-with rx-prep-block" hidden>Cannot be given via feeding tube; choose another drug or route.</p>${K.no_split ? `<div class="rx-actions"><label class="rx-inline rx-inline-reason">Reason if given as a split dose (required then; kept on the order)<input name="prepReason:${key}" class="rx-prep-reason" disabled placeholder="Why this is needed and what was checked with pharmacy"></label></div>` : ''}</div>`);
    rx.cautions.forEach(c => ref.push(`<p class="rx-caution">${esc(c.text)}</p>`));
    S.restrictionBlocks(rx, actor).forEach(r => out.push(`<div class="rx-line tone-contraindicated" data-rx-blocked><p class="rx-title"><strong class="rx-level">Blocked</strong><span class="rx-kind">Order restriction</span></p><p class="rx-with">${esc(S.restrictionText(r))}</p></div>`));
    rx.restrictions.filter(r => r.restriction_type === 'approval').forEach(r => out.push(`<div class="rx-line tone-high"><p class="rx-title"><strong class="rx-level">Action required</strong><span class="rx-kind">Approval required</span></p><p class="rx-with">${esc(S.restrictionText(r))}</p><div class="rx-actions"><label class="rx-inline rx-inline-reason">Approval reference (required; kept on the order)<input name="rxApproval:${key}" class="rx-required" required placeholder="Approver or approval number"></label></div></div>`));
    rx.restrictions.filter(r => r.restriction_type === 'indication').forEach(r => out.push(`<div class="rx-line tone-high"><p class="rx-title"><strong class="rx-level">Action required</strong><span class="rx-kind">Indication required</span></p><p class="rx-with">${esc(S.restrictionText(r))}</p><div class="rx-actions"><label class="rx-inline rx-inline-reason">Indication (required; kept on the order)<input name="rxIndication:${key}" class="rx-required" required placeholder="Why this medication is indicated"></label></div></div>`));
    if (rx.maxDays) ref.push(`<p class="rx-caution">Course limited to ${esc(rx.maxDays)} days per order; enter a duration or end time within the limit.</p>`);
    return {act: out.join(''), ref: ref.join(''), refCount: ref.length};
  }

  function cartForm(ctx) {
    const {state, route, patient, act, form} = ctx;
    const cart = state.drafts[cartKey(route, patient)] || [];
    if (!cart.length) return `<div class="pick-empty cart-empty"><strong>No items added yet.</strong><p>Click an item in the left list to add it; you can remove items until you confirm.</p></div>`;
    const tax = taxonomy();
    // ATC 本地覆寫（2026-10-18）：比對與涵蓋範圍都用生效 ATC，和 store 的 catalogOrder 同一份。
    const atcCart = SCHEMA() ? SCHEMA().withLocalAtc(state, cart) : cart;
    const atcOrders = SCHEMA() ? SCHEMA().withLocalAtc(state, state.orders.filter(order => order.p === patient.id)) : state.orders.filter(order => order.p === patient.id);
    const conflicts = root.ICUDrugSafety ? root.ICUDrugSafety.assess(atcCart, atcOrders, patient, SCHEMA() ? SCHEMA().interactionRows(state) : []) : [];
    const kgByKey = SCHEMA() ? Object.fromEntries(cart.filter(c => c.kind === 'medication').map(c => [c.key, SCHEMA().weightDose(state, c.key, patient.id)])) : {};
    // 劑量體重與每公斤輸入（2026-10-22）：卡片帶這位病人目前的劑量體重；沒有體重時每公斤模式停用；有體重時預設每公斤每次（2026-10-28 拿掉維護設定）。
    const dw = SCHEMA() ? SCHEMA().dosingWeight(state, patient.id) : null;
    // EMR整合MDT demo（P2）：腫瘤病房的化療劑量以體表面積開（mg/m²）；有身高體重就預設每 m²，單位相容時才開放。
    const bsa = SCHEMA() && SCHEMA().bodySurface ? SCHEMA().bodySurface(state, patient.id) : null;
    const doseModeSelect = (key, unitOk, last) => { const start = !dw || !unitOk ? 'absolute' : last ? (last.perKg ? last.perKg.mode : 'absolute') : (bsa && globalThis.DEMO ? 'bsa' : 'dose');
      return `<label class="cart-field cart-dose-mode-field">Dose entry<select name="doseMode:${esc(key)}" class="cart-dose-mode" data-kg-weight="${dw ? esc(dw.kg) : ''}" data-bsa="${bsa ? esc(bsa.m2) : ''}"${dw ? '' : ' disabled'} title="${dw ? 'Per-kg and per-m² entry use the dosing weight (and height) shown below' : 'No dosing weight recorded for this patient'}">${[['absolute', 'Absolute dose'], ['bsa', 'Per m² (BSA)'], ['dose', 'Per kg per dose'], ['daily', 'Per kg per day']].map(([v, t]) => `<option value="${v}"${v === start ? ' selected' : ''}${v === 'bsa' && !bsa ? ' disabled' : ''}>${t}</option>`).join('')}</select></label>`
        + `<label class="cart-field cart-num cart-perkg-field" data-perkg-field${start === 'absolute' ? ' hidden' : ''}><span data-perkg-label>${start === 'bsa' ? 'Per m²' : 'Per kg'}</span><input name="perKg:${esc(key)}" class="cart-perkg" type="number" min="0" step="any" inputmode="decimal" placeholder="10"${start !== 'absolute' && last && last.perKg ? ` value="${esc(last.perKg.value)}"` : ''}${start === 'absolute' ? ' disabled' : ' required'}><span class="cart-perkg-unit" data-perkg-unit></span></label>`; };
    const weightLine = () => !dw ? `<p class="rx-caution rx-weight" data-rx-weight>No dosing weight: no admission weight or measured weight is recorded, so per-kg entry and per-kg limits are unavailable.</p>`
      : `<p class="rx-caution rx-weight" data-rx-weight>${esc('Dosing weight: ' + SCHEMA().weightLabel(dw) + ' (' + (dw.basis === 'admission' ? 'recorded ' : 'weighed ') + String(dw.at || '').replace('T', ' ') + ', ' + SCHEMA().weightAgeText(dw) + ')')}${bsa ? esc(' · BSA ' + bsa.m2 + ' m² (height ' + bsa.cm + ' cm, Mosteller)') : esc(' · No height recorded: per-m² entry unavailable')}</p>` + `<p class="rx-caution rx-perkg-calc" data-perkg-calc hidden></p>`;
    const weightStale = () => dw && dw.stale ? `<p class="rx-caution rx-weight-stale" data-rx-weight-stale>${esc(SCHEMA().weightStaleText(dw))}</p>` : '';
    const gaps = root.ICUDrugSafety ? root.ICUDrugSafety.coverage(atcCart, patient, state.master && state.master.medicationKnowledge, kgByKey).gaps : [];
    const freq = (key, current) => `<label class="cart-field cart-freq">Frequency<select name="frequency:${esc(key)}" data-freq-key="${esc(key)}" required><option value="">Select</option>${tax.frequencies.map(([group, options]) => `<optgroup label="${esc(group)}">${options.map(([value, text]) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(text)}</option>`).join('')}</optgroup>`).join('')}<option value="${esc(tax.CUSTOM_FREQUENCY)}">Custom…</option></select></label><label class="cart-field" data-freq-custom hidden>Custom<input name="frequencyCustom:${esc(key)}" placeholder="e.g., every 36 h"></label>`;
    const S = root.ICUStore || {};
    const modes = S.dosingModes || {};
    const opts = (map, current, blank) => (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') + Object.entries(map || {}).map(([v, t]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}${Array.isArray(t) ? ` title="${esc(t[0])}"` : ''}>${esc(Array.isArray(t) ? t[1] : t)}</option>`).join('');
    // 逐項的生效／結束是整批欄位的覆寫，九成留空：開關放在卡片標題列，展開才多一排，藥囑卡片平常維持兩排。
    const saved = state.drafts[route.actor + ':' + patient.id + ':orderDetails'] || {};
    const whenOpen = (key, withEnd) => !!(saved['start:' + key] || (withEnd && saved['end:' + key]));
    const whenPanel = (key, withEnd, open, occurrence) => `<div class="cart-when-fields" data-when-panel${open ? '' : ' hidden'}><label class="cart-field cart-item-start"${occurrence ? ' title="FHIR ServiceRequest.occurrenceDateTime"' : ''}>${occurrence ? 'Occurrence (blank = batch default)' : 'Start (blank = batch default)'}<input name="start:${esc(key)}" type="datetime-local"></label>${withEnd ? `<label class="cart-field cart-item-end">End (blank = until stopped)<input name="end:${esc(key)}" type="datetime-local"></label>` : ''}</div>`;
    // 檢驗檢查只有 ServiceRequest.priority 與 occurrence；沒有 method、frequency（R5 沒有 method，ICU 檢驗一次一筆）。
    const prioritySelect = key => `<label class="cart-field cart-priority" title="FHIR ServiceRequest.priority">Priority<select name="priority:${esc(key)}">${opts(S.priorities, 'routine')}</select></label>`;
    const modeSelect = (key, current = 'scheduled') => `<label class="cart-field cart-mode">Schedule<select name="mode:${esc(key)}" data-mode-key="${esc(key)}">${Object.entries(modes).map(([id, m]) => `<option value="${esc(id)}"${id === current ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>`;
    // 頻率＝FHIR Timing.code（TimingAbbreviation）；對照表沒有的用「自訂」填 Timing.repeat 的次數／間隔／單位。
    const unitHours = {min: 1 / 60, h: 1, d: 24, wk: 168, mo: 720};
    const rxFreq = (key, current) => `<label class="cart-field cart-freq">Frequency<select name="frequency:${esc(key)}" data-freq-key="${esc(key)}" data-mode-required="1" required><option value="">Select</option>${(S.timingGroups || []).map(([group, list]) => `<optgroup label="${esc(group)}">${list.filter(([value]) => !(state.master && state.master.frequency && state.master.frequency[value] && state.master.frequency[value].active === false)).map(([value, code, label, repeat]) => `<option value="${esc(value)}"${value === current ? ' selected' : ''} data-per-day="${repeat ? repeat.frequency * 24 / (repeat.period * unitHours[repeat.periodUnit]) : ''}" title="${esc(S.timingLabel(value))}">${esc((code ? code + ' · ' : '') + label)}</option>`).join('')}</optgroup>`).join('')}<option value="__custom__">Custom…</option></select></label>`
      + `<span class="cart-freq-custom" data-freq-custom hidden><label class="cart-field cart-num">Every<input name="freqPeriod:${esc(key)}" type="number" min="0" step="any" inputmode="decimal" placeholder="36"></label><label class="cart-field cart-unit-pick">Unit<select name="freqUnit:${esc(key)}">${opts({h: 'h', d: 'days', wk: 'weeks', mo: 'months'}, 'h')}</select></label><label class="cart-field cart-num">Doses<input name="freqCount:${esc(key)}" type="number" min="1" max="24" step="1" inputmode="numeric" placeholder="1"></label></span>`;
    // 非作用中的模式欄位一律 disabled：隱藏但仍必填的欄位會讓整張表單送不出去，也不該把值帶進醫囑。
    const group = (mode, body, on) => `<div class="cart-mode-group" data-mode-group="${esc(mode)}"${on ? '' : ' hidden'}>${on ? body : body.replace(/<(input|select)\s/g, '<$1 disabled ')}</div>`;
    const modeFields = (key, defaults = {}) => group('scheduled',
        rxFreq(key, defaults.frequency || '')
        + `<label class="cart-field cart-num">Duration<input name="days:${esc(key)}" type="number" min="0" step="any" inputmode="decimal" placeholder="Ongoing" title="Blank = until stopped" value="${esc(defaults.days || '')}"></label><label class="cart-field cart-unit-pick">Unit<select name="daysUnit:${esc(key)}">${opts(S.boundsUnits, 'd')}</select></label>`
, (defaults.mode || 'scheduled') === 'scheduled')
      + group('prn',
        `<label class="cart-field cart-prn-indication">Indication<input name="prnIndication:${esc(key)}" data-mode-required="1" required placeholder="e.g., pain score ≥ 4"></label>`
        + `<label class="cart-field cart-num">Min interval<input name="prnInterval:${esc(key)}" data-mode-required="1" required type="number" min="0" step="any" inputmode="decimal" placeholder="4"></label><label class="cart-field cart-unit-pick">Unit<select name="prnIntervalUnit:${esc(key)}">${opts(S.intervalUnits, 'h')}</select></label>`
        + `<label class="cart-field cart-num cart-max" title="Maximum dose in 24 h, in the same unit as a single dose">24h max<input name="prnMax:${esc(key)}" data-mode-required="1" required type="number" min="0" step="any" inputmode="decimal" placeholder="4"></label>`, defaults.mode === 'prn')
      + group('infusion',
        `<label class="cart-field cart-num">Rate<input name="rate:${esc(key)}" data-mode-required="1" required type="number" min="0" step="any" inputmode="decimal" placeholder="5" value="${esc(defaults.rate || '')}"></label><label class="cart-field cart-unit-pick">Unit<select name="rateUnit:${esc(key)}">${opts(S.rateUnits, defaults.rateUnit || 'mL/h')}</select></label>`
        + `<label class="cart-field cart-conc">Concentration<input name="concentration:${esc(key)}" placeholder="e.g., 4 mg/50 mL"></label>`, defaults.mode === 'infusion');
    // 一次只展開一張（2026-10-24）：記在 ICUUIState.cartOpen；還沒記過時只有一張就展開它，否則全收。
    const ui = root.ICUUIState || {};
    const openKey = ui.cartOpen !== undefined && cart.some(item => item.key === ui.cartOpen) ? ui.cartOpen : cart.length === 1 ? cart[0].key : '';
    // 卡片標題的類型標籤只在這一批混了不同類型時才有意義（2026-11-08）。
    const mixed = new Set(cart.map(item => tax.categoryOfEntry(item) || 'other')).size > 1;
    // 更多選項（2026-11-08）：給藥方法、經管灌、優先序、時機與逐項起訖收在這裡；改過預設的值寫在標題旁，收著也看得到。
    const timingField = key => `<label class="cart-field cart-when-pick">Timing<select name="when:${esc(key)}" title="Administration timing (optional)">${opts(S.eventTimings, '', '—')}</select></label>`;
    const more = (fields, open) => `<details class="cart-more" data-cart-more${open ? ' open' : ''}><summary><span>More options</span><span class="cart-more-values" data-more-values data-no-i18n></span></summary><div class="rx-row cart-more-fields">${fields}</div></details>`;
    const rows = cart.map(item => {
      const type = tax.categoryOfEntry(item) || 'other';
      const medication = item.kind === 'medication';
      const defaultRoute = item.routeId ? root.ICUClinical.entry('route:' + item.routeId) : null;
      // 維護檔預帶（2026-10-18）：途徑、頻率、單位、療程天數用藥品開立屬性的預設值；劑量 step 由小數位數決定；上限掛在劑量欄供即時檢核。
      const rx = medication ? rxOf(state, item.key) : null;
      const K = rx && rx.knowledge, TAGS = (SCHEMA() && SCHEMA().ATTRIBUTE_TAGS) || {};
      const flagTags = rx ? rx.attributes.map(c => `<span class="cart-flag flag-${esc(c)}">${esc(TAGS[c] || c)}</span>`).join('') + (rx.supply && rx.supply.status === 'restricted' ? `<span class="cart-flag flag-restricted" title="${esc(rx.supply.message || '')}">Restricted supply</span>` : '') : '';
      const maintainedRoute = rx && rx.defaults.route ? root.ICUClinical.entry(rx.defaults.route) : null;
      const last = medication ? lastDosing(state, item) : null;
      const startRoute = (last && last.route) || maintainedRoute || defaultRoute;
      const dp = K && Number.isInteger(K.decimal_places) ? K.decimal_places : null;
      const doseStep = dp === null ? 'any' : dp === 0 ? '1' : '0.' + '0'.repeat(dp - 1) + '1';
      const doseUnit = (last && last.unit) || (rx && rx.defaults.unit) || item.unit || '';
      const limitAttrs = K && (K.max_single_dose || K.max_daily_dose) ? ` data-max-single="${esc(K.max_single_dose || '')}" data-max-daily="${esc(K.max_daily_dose || '')}" data-order-unit="${esc(K.order_unit_code || '')}"` : '';
      const wdCard = rx ? SCHEMA().weightDose(state, item.key, patient.id) : null;
      const kgAttr = wdCard && wdCard.status === 'checked' ? ` data-kg="${esc(JSON.stringify(wdCard))}"` : '';
      const conv = rx && rx.conversion;
      // 給藥單位換算（2026-10-25）：劑量列下方獨立一行，寫換算規則與即時算出的給藥量（app.js 的 syncDispense 依劑量與單位重算）。
      const dq0 = conv ? SCHEMA().dispenseQuantity(conv, {value: 1, unit: doseUnit}) : null;
      const convLine = conv ? `<p class="rx-conv" data-rx-conv data-factor="${esc(conv.factor)}" data-order-unit="${esc(conv.order_unit_code)}" data-dispense-unit="${esc(conv.dispense_unit_code)}"><span class="rx-conv-label">Dispense conversion</span><span class="rx-conv-rule" data-no-i18n>1 ${esc(conv.order_unit_code)} = ${esc(conv.factor)} ${esc(conv.dispense_unit_code)}</span><span class="rx-conv-qty" data-rx-conv-qty data-qty="${esc(SCHEMA().dispenseText(dq0))}">${dq0 ? `Dispense quantity: ${esc(SCHEMA().dispenseText(dq0))}` : ''}</span></p>` : '';
      const rxDefaults = Object.assign(rx ? {frequency: rx.defaults.frequency, days: rx.defaults.days} : {}, last ? {frequency: last.frequency, mode: last.mode, rate: last.rate, rateUnit: last.rateUnit} : {});
      // EMR整合MDT demo（P2）：抗腫瘤藥（ATC L01）沒有維護頻率、也沒有上一次醫囑時，排程預設「單次」（療程日給藥），不讓空白頻率擋住送出。
      if (globalThis.DEMO && !rxDefaults.mode && !rxDefaults.frequency && /^L01/.test(String(item.atc || ''))) rxDefaults.mode = 'once';
      const rxNotes = rx ? rxNoteLines(ctx, item, rx, K) : {act: '', ref: '', refCount: 0};
      const refConflicts = conflictLines(ctx, item, conflicts, 'ref');
      const refCount = (medication ? 1 : 0) + rxNotes.refCount + (refConflicts.match(/data-rx-conflict=/g) || []).length;
      const refLines = (medication ? weightLine() : '') + rxNotes.ref + refConflicts;
      const open = item.key === openKey;
      const moreBlock = medication
        ? more(`<label class="cart-field cart-method">Administration method<select name="method:${esc(item.key)}" data-method-auto="1">${opts(S.methods, methodForRoute(startRoute && startRoute.code), 'Not specified')}</select></label><label class="check cart-tube"><input type="checkbox" name="tube:${esc(item.key)}" value="1">Via feeding tube</label><label class="cart-field cart-priority">Priority<select name="priority:${esc(item.key)}">${opts(S.priorities, 'routine')}</select></label>${group('scheduled', timingField(item.key), (rxDefaults.mode || 'scheduled') === 'scheduled')}${whenPanel(item.key, true, true)}`, whenOpen(item.key, true))
        : more(whenPanel(item.key, false, true, ['lab','imaging'].includes(type)), whenOpen(item.key, false));
      return `<article class="cart-item${open ? ' is-open' : ''}" data-safety-item="${esc(item.key)}" data-strength="${esc(medication ? item.strength || '' : '')}">
        <div class="cart-item-head${mixed ? '' : ' no-tag'}">${mixed ? `<span class="type-tag tone-${esc(type)}">${esc(shortType(type))}</span>` : ''}<strong class="cart-name"><span class="cart-name-text">${esc(item.zh || item.name)}</span>${flagTags}</strong><span class="cart-meta">${esc([medication ? item.strength : '', item.code].filter(Boolean).join(' · '))}${item.fromSet ? `<span class="cart-fromset">Order set: ${esc(item.fromSet.groupName || item.fromSet.mainName)}</span>` : ''}${last ? `<span class="cart-fromset" data-from-order="${esc(last.id)}">Same as last order ${esc(last.id)}</span>` : ''}</span><span class="cart-badges"><span class="cart-badge tone-todo" data-cart-todo hidden></span>${refCount ? `<span class="cart-badge tone-ref">Reference info ${refCount}</span>` : ''}</span><span class="cart-head-actions">${act('cartRemove', 'Remove', {key: item.key}, false, true)}<button type="button" class="secondary compact-button cart-toggle" data-cart-toggle aria-expanded="${open}" aria-label="Show or hide this item’s fields"></button></span></div>
        <p class="cart-line" data-cart-line data-no-i18n></p><div class="cart-body">
        ${medication
          ? `<div class="cart-fields rx-fields"><div class="rx-row rx-row-dose">${doseModeSelect(item.key, SCHEMA() && SCHEMA().perKgUnitOk(doseUnit), last)}<label class="cart-field cart-qty-field">Dose<input name="qty:${esc(item.key)}" class="cart-qty" data-cart-step type="number" min="0" step="${esc(doseStep)}" inputmode="decimal" value="${esc(last && last.qty != null ? last.qty : 1)}" required${limitAttrs}${kgAttr}></label><label class="cart-field cart-unit-field">Unit<input name="unit:${esc(item.key)}" class="cart-unit" data-cart-step list="order-unit-options" autocomplete="off" value="${esc(doseUnit)}" required></label><label class="cart-field cart-route-field">Route${defaultRoute ? `<span class="cart-route-default">Catalog: ${esc(defaultRoute.name)}</span>` : ''}<input name="routeText:${esc(item.key)}" class="cart-route" list="order-route-options" autocomplete="off" value="${esc(routeText(startRoute))}" placeholder="Type to filter routes" required></label></div>${convLine}<div class="rx-row rx-row-timing">${modeSelect(item.key, rxDefaults.mode)}${modeFields(item.key, rxDefaults)}</div></div>`
          : `<div class="cart-fields cart-fields-service"><span class="cart-fixed">${/^l[ầa]n$/i.test(item.unit || '') || !item.unit ? 'Qty 1' : '1 ' + esc(item.unit)}</span>${['lab','imaging'].includes(type) ? prioritySelect(item.key) : freq(item.key, 'Once now')}</div>`}
        ${medication ? weightStale() : ''}${rxNotes.act}${conflictLines(ctx, item, conflicts, 'act')}${moreBlock}
        ${refCount ? `<details class="rx-ref" data-rx-ref><summary>Reference info <b>${refCount}</b></summary>${refLines}</details>` : ''}</div>
      </article>`;
    }).join('');
    // 送出列（2026-10-24）：總結表與未涵蓋檢核併進固定在底部的這一排，卡片上方不再佔高度。
    const gapNote = gaps.length ? `<details class="rx-gaps"><summary>Checks not covered <b>${gaps.length}</b></summary><ul>${gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul></details>` : '';
    // 送出列一行（2026-11-08）：總結、未涵蓋、整批生效時間（點開改生效、結束與備註）、預覽、確認加入。
    // EMR整合MDT demo（P2）：整批生效時間預設為示範時鐘的現在（原型寫死 2026-08-31 09:00）。
    const today = todayOf(state), startAt = (globalThis.DEMO && state.demoClock && root.ICUTimeZone && Number.isFinite(root.ICUTimeZone.millis(state.demoClock))) ? root.ICUTimeZone.wall(root.ICUTimeZone.millis(state.demoClock)).slice(0, 16) : '2026-08-31T09:00';
    const batch = `<details class="pin-pop cart-batch-pop"><summary class="button secondary cart-batch-summary" data-batch-summary data-today="${esc(today)}" title="Batch time and notes"><span>Starts at</span> <b data-batch-start data-no-i18n>${esc(root.ICUTimeZone.short(startAt, today))}</b><span class="cart-batch-note" data-batch-note hidden>Note</span></summary><div class="pin-pop-panel cart-batch-panel"><p class="pin-pop-title">Batch time and notes</p><label class="cart-field cart-start">Effective date / time<input name="start" type="datetime-local" value="${startAt}" required></label><label class="cart-field cart-end" title="Batch defaults: a blank end means until stopped; for an item with different timing, use “More options” on its card">Batch end time<input name="end" type="datetime-local"></label><label class="cart-field cart-note-field">Notes (optional)<textarea name="clinicalInfo" placeholder="Clinical info for this order or instructions for nursing"></textarea></label></div></details>`;
    const footer = `<div class="cart-footer"><div class="cart-commit">${cartSummary(cart)}${gapNote}${batch}<button type="button" class="secondary cart-preview" data-cart-preview>Preview batch</button><button type="submit" class="cart-submit" title="Orders take effect as soon as they are added">Confirm and add ${cart.length} items</button></div>
      <input name="consultSource" type="hidden" value="${esc(route.consultSource||'')}"><input name="mdtSource" type="hidden" value="${esc(route.mdtSource||'')}"><input name="refSource" type="hidden" value="${esc(route.refSource||'')}"></div>`;
    // 品項包一層 .cart-scroll：清單自己捲動，底下的送出列不會被推出畫面。
    return datalists(state) + weightRecheckNote(state, patient) + form('catalogOrder', `<div class="cart-scroll" tabindex="0" aria-label="New items">${rows}</div>` + footer, '');
  }

  // 開立頁（2026-10-24）：從對話框改成病人頁底下的獨立頁面（view=order），左右兩欄與可拖曳分隔線沿用；
  // 錯誤訊息寫在頁首 #message，頁面本來就看得到，不再需要對話框內的訊息位置。
  function orderPage(ctx) {
    const {route, patient, state} = ctx;
    if (!ctx.canOrder) return `<section class="card order-page-denied"><p>Only doctors caring for this patient can order.</p></section>`;
    const cart = state.drafts[cartKey(route, patient)] || [];
    return `<section id="order-page" class="order-page" aria-label="Order entry"><button type="button" class="secondary cart-jump" data-scroll-to="order-cart-title">New items: ${cart.length} ↓</button>
      <div class="order-dialog-layout order-page-body"><section class="dialog-section order-catalog" aria-label="Orderable items">${catalogPane(ctx)}</section>
      <div class="pane-divider" role="separator" aria-orientation="vertical" aria-label="Drag to resize the “New items” pane on the right; arrow keys fine-tune, double-click to reset" tabindex="0" data-pane-divider></div><section class="dialog-section order-side" aria-label="New items">${sidePane(ctx)}</section></div>
      <p class="order-page-foot source">Items and codes come from a catalog B snapshot; medication safety alerts use a demo rule table for this prototype, and no alert does not mean confirmed safe.</p></section>`;
  }

  // 醫囑類型 filter. Counts sit on the chips so the doctor can see what was ordered at a glance.
  function typeFilter(ctx) {
    const {state, patient, route, helpers} = ctx;
    const chip = helpers.filterChip;
    const mine = state.orders.filter(order => order.p === patient.id);
    const counts = new Map();
    mine.forEach(order => { const id = orderType(order); counts.set(id, (counts.get(id) || 0) + 1); });
    const ids = state.settings.categories.map(x=>x[0]).filter(id => id !== 'set' && (counts.get(id) || route.orderKind === id));
    return `<div class="filter-row"><span class="filter-label">Type</span>${chip('All ' + mine.length, {orderKind: 'all'}, route.orderKind === 'all')}${ids.map(id => chip((state.settings.categories.find(x=>x[0]===id)?.[1]||typeLabel(id)) + ' ' + (counts.get(id) || 0), {orderKind: id}, route.orderKind === id)).join('')}</div>`;
  }

  // 醫囑狀態篩選（2026-10-08）：照 FHIR MedicationRequest.status——有效（active 且 HIS 已接受）、尚未生效（草稿／待送出／HIS 未接受）、已停止／取消。
  // 給藥紀錄是 MedicationAdministration，不混進醫囑狀態；最後一次給藥另成一欄。
  const execState = (order, executions) => (order.clinical === 'cancelled' || order.clinical === 'stopped') ? 'ended' : order.clinical === 'active' ? 'active' : 'inactive';
  const execLabels = [['all', 'All'], ['active', 'Active'], ['inactive', 'Not yet effective'], ['ended', 'Stopped / cancelled']];
  const requestStatus = order => order.clinical === 'cancelled' ? 'Cancelled' : order.clinical === 'stopped' ? 'Stopped' : order.clinical === 'active' ? 'Active' : 'Not yet effective';
  const execOf = (state, route) => execLabels.some(([k]) => k === route.orderExec) ? route.orderExec : 'all';
  function execFilter(ctx) {
    const {state, patient, route, helpers} = ctx;
    const mine = state.orders.filter(o => o.p === patient.id && (route.orderKind === 'all' || orderType(o) === route.orderKind));
    const counts = new Map();
    mine.forEach(o => { const k = execState(o, state.executions.filter(e => e.order === o.id && e.version === o.version)); counts.set(k, (counts.get(k) || 0) + 1); });
    const current = execOf(state, route);
    return `<div class="filter-row"><span class="filter-label">Status</span>${execLabels.map(([k, t]) => helpers.filterChip(t + ' ' + (k === 'all' ? mine.length : (counts.get(k) || 0)), {orderExec: k}, current === k)).join('')}</div>`;
  }

  // --- 檢驗檢查頁：開立紀錄與結果（2026-09-11 R7）----------------------------------------
  // 一列一筆檢驗／檢查醫囑：前面是曾開過的醫囑內容，中間是結果（數值子項或文字報告，待回照實顯示），後面是報告時間與已閱／處理。
  function resultSummary(ctx, order, report) {
    const {esc} = ctx;
    if (!report) return order.clinical === 'active' ? '<span class="pill warning">Pending result</span><span class="source">Ordered, no report yet</span>' : order.clinical === 'cancelled' ? '<span class="pill muted">Stopped</span>' : `<span class="pill muted">${esc(orderStage(order))}</span>`;
    if (report.status === 'cancelled') return '<span class="pill muted">Stopped</span><span class="source">Order stopped; no report will be returned</span>';
    if (report.status === 'pending') return '<span class="pill warning">Pending result</span>';
    const comps = report.components || [];
    if (comps.length) return `<ul class="lab-result-inline">${comps.map(c => { const cls = root.ICUClinical.resultClass(c); return `<li class="${cls}"><span>${esc(c.name || c.id)}</span><b>${c.value === null || c.value === undefined || c.value === '' ? 'Missing' : esc(c.value)}</b><small>${esc(c.unit || '')}${cls === 'abnormal' ? ' ▲' : ''}</small></li>`; }).join('')}</ul>`;
    const text = report.text || 'No text report from source';
    return `<p class="exam-text preserve-lines">${esc(text.length > 160 ? text.slice(0, 160) + '…' : text)}</p>${report.impression ? `<p class="exam-impression"><b>Impression</b>${esc(report.impression)}</p>` : ''}`;
  }
  function labOrderList(ctx) {
    const {state, route, patient, actors, badge, source, empty} = ctx;
    const orders = state.orders.filter(o => o.p === patient.id && ['lab','imaging'].includes(orderType(o))).sort((a, b) => String(b.orderedAt || b.start || '').localeCompare(String(a.orderedAt || a.start || '')));
    // 新增鈕只留識別列那一顆（2026-11-02），它在這一頁已預選檢驗與影像。
    const head = `<div class="orders-toolbar"><h2 class="lab-list-title">Orders and results<small>${orders.length} records</small></h2></div>`;
    const menu = ctx.canOrder ? 'data-context-menu="orders"' : '';
    if (!orders.length) return `<section class="card lab-order-card" ${menu}>${head}${empty('No lab or exam orders yet; lab values and exam reports from existing sources below remain viewable.')}</section>`;
    const RV = root.ICUResultViews;
    const rows = orders.map(order => {
      const reports = state.reports.filter(r => r.order === order.id || r.id === order.id).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
      const report = reports[0] || null;
      const executions = state.executions.filter(e => e.order === order.id && e.version === order.version);
      const detailId = 'lab-detail-' + order.id;
      const justAdded = root.ICUUIState && root.ICUUIState.lastBatch && order.batch === root.ICUUIState.lastBatch;
      const stage = order.clinical === 'cancelled' ? 'Stopped' : orderStage(order);
      // 還沒採檢／執行、報告也還沒回來的，醫師可以直接停止；停止原因必填。
      return `<tbody class="order-row-group${justAdded ? ' just-added' : ''}${order.clinical === 'cancelled' ? ' order-cancelled' : ''}" id="record-${esc(order.id)}" data-order-id="${esc(order.id)}"${order.catalog && addable(order.catalog) ? ` data-repeat-key="${esc(order.catalog.key)}"` : ''}><tr>
        <td class="col-ordered"><span class="ordered-at">${esc(order.orderedAt || order.start || 'Not provided by source')}</span><span class="ordered-by">${esc(actors[order.author]?.name || 'Orderer not provided by source')}</span></td>
        <td class="col-lab-order"><strong>${esc(order.catalog?.zh || order.name)}</strong><span class="source">${esc(order.id)}${order.catalog ? (order.catalog.isLab ? ' · Lab' : ' · Exam') : ''}</span><span class="pill ${['unknown','rejected'].includes(order.his) ? 'warning' : order.clinical === 'cancelled' ? 'muted' : ''}">${esc(stage)}</span>${order.priority && order.priority !== 'routine' ? `<span class="pill warning" title="FHIR ServiceRequest.priority">${esc((root.ICUStore?.priorities || {})[order.priority] || order.priority)}</span>` : ''}</td>
        <td class="col-lab-result">${resultSummary(ctx, order, report)}</td>
        <td class="col-date">${report && report.at ? esc(String(report.at).replace('T', ' ')) : '<span class="muted">—</span>'}</td>
        <td class="col-read">${RV && RV.readBadge ? RV.readBadge(ctx, report) : ''}</td>
        <td class="col-order-actions"><button type="button" class="tertiary order-toggle" data-keep-label data-order-toggle="${esc(detailId)}" aria-expanded="false" aria-controls="${esc(detailId)}" aria-label="Show details" title="Show details">${chevron}</button></td>
      </tr><tr id="${esc(detailId)}" class="order-detail-row" hidden><td colspan="6"><div class="order-detail-grid">
        <section><h3>Order details</h3><dl><dt>Content</dt><dd>${esc(order.dose || 'Not provided by source')}</dd><dt>Category</dt><dd>${esc(order.catalog ? (order.catalog.isLab ? 'Lab' : 'Imaging / exam') : (order.route || 'Not provided by source'))}</dd><dt>Priority</dt><dd>${esc((root.ICUStore?.priorities || {})[order.priority] || 'Routine')}</dd><dt>Occurrence</dt><dd>${esc(order.start + (order.end ? ' – ' + order.end : ''))}</dd></dl>${source('Ordered by: ' + (actors[order.author]?.name || 'Not provided by source') + (order.fromSet ? ' · Order set source: ' + order.fromSet.mainName : ''))}<p>${badge(stage, ['unknown','rejected'].includes(order.his))}</p>${actionArea(ctx, order)}${cancelArea(ctx, order, executions)}</section>
        <section><h3>Results</h3>${report ? (RV ? RV.reportDetail(ctx, report, order) : '') : '<p class="muted">No linked report yet; submitted / accepted does not mean performed.</p>'}</section>
        <section class="order-execution-panel"><h3>Collection / performance</h3>${executionHistory(ctx, order, executions)}${executionForm(ctx, order, executions)}</section>
      </div></td></tr></tbody>`;
    }).join('');
    return `<section class="card lab-order-card" ${menu}>${head}<div class="table-wrap"><table class="order-worklist lab-order-list"><thead><tr><th scope="col">Ordered at / by</th><th scope="col">Order</th><th scope="col">Result</th><th scope="col">Report time</th><th scope="col">Read</th><th scope="col" class="col-order-actions-head"><span class="visually-hidden">Details</span></th></tr></thead>${rows}</table></div></section>`;
  }

  root.ICUOrderPicker = {results, summary: cartSummary, page: orderPage, methodForRoute, sourceRow};
  root.ICUOrderViews = {executionForm, executionHistory, labOrderList};

  root.ICUPatientViews.register('order', orderPage);
  root.ICUPatientViews.register('orders', function (ctx) {
    const {route} = ctx;
    const doctor = ctx.canOrder;
    // 新增鈕只留識別列那一顆（2026-11-02）；清單上按右鍵也能新增。
    return `<section class="card orders-card" ${doctor ? 'data-context-menu="orders"' : ''}><div class="orders-toolbar">${route.view === 'orders' ? '' : typeFilter(ctx)}${execFilter(ctx)}</div>${worklist(ctx)}</section>`;
  });
})(globalThis);
