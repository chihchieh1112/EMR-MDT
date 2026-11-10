/* Laboratory and examination results: one dense analyte-per-row worklist with a query rail,
   quick date ranges, category/specimen/keyword filters, plus the existing trend view.
   Abnormal/normal comes ONLY from the source flag (ICUClinical.resultClass).
   參考範圍 is displayed for context and is never used to derive a classification. */
(function (root) {
  'use strict';

  const labels = {all:'All', normal:'Normal', abnormal:'Abnormal', pending:'Pending result', unknown:'Undetermined / missing'};
  const quickRanges = [['14d','14 days'],['1m','1 month'],['3m','3 months'],['6m','6 months'],['1y','1 year'],['2y','2 years'],['all','All']];
  const href = (route, changes) => '#'+new URLSearchParams({...route, ...changes}).toString();
  const clinical = () => root.ICUClinical;
  // 趨勢挑選（2026-10-31）：數值矩陣一列一個檢驗項目，勾一或多列再看趨勢；鍵＝項目代碼＋單位，同名不同單位分開。
  const pickKey = row => (row.analyteId || row.name) + '|' + (row.unit || '');
  const picks = route => String(route.labPick || '').split(',').map(x => x.trim()).filter(Boolean);
  // 參考範圍是來源的文字；只認「低–高」這種寫法，其他寫法不畫色帶。
  const rangeOf = text => { const m = /^\s*(-?\d+(?:\.\d+)?)\s*[-–~]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(text || '')); return m ? {lo: Number(m[1]), hi: Number(m[2]), text: String(text).trim()} : null; };
  // 表格左上角的複製鈕：整張表複製成可貼進 Excel 的文字；不再佔一欄。
  const copyCorner = () => `<button type="button" class="copy-corner" data-copy-results title="Copy the whole table as text (pastable into Excel)" aria-label="Copy table"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>`;

  // 閱讀狀態以「本人 × 本版本」計算：報告改版（v2）之後，先前的已閱不再算數。
  function readState(report, actorId) {
    const seen = (report && report.seen) || [];
    const thisVersion = seen.filter(item => item.version === report.version);
    const mine = thisVersion.filter(item => item.actor === actorId).slice(-1)[0] || null;
    return {mine, readers: [...new Set(thisVersion.map(item => item.actor))], unread: !mine};
  }
  // 清單上一眼看得出讀過沒有；未讀的旁邊直接給一顆「標為已閱」。
  function readBadge(ctx, report) {
    const {badge, source, actors, route, act} = ctx;
    if (!report) return '<span class="source">—</span>';
    if (report.status === 'cancelled') return badge('Stopped');
    if (report.status !== 'returned') return badge('Pending result', true);
    const state = readState(report, route.actor);
    const names = state.readers.map(id => actors[id]?.name || 'Not provided by source');
    const processed = (report.processed || []).length;
    const tail = processed ? source(processed + ' follow-up records') : '';
    if (state.unread) return `<span class="read-cell is-unread">${badge('Unread', true)}${act('readReport', 'Mark as read', {id: report.id}, false, true)}</span>`
      + (names.length ? source('Read by others: ' + names.join(', ')) : '') + tail;
    return `<span class="read-cell">${badge('Read')}</span>`
      + source('You ' + String(state.mine.at || '').replace('T', ' ').slice(0, 16) + (names.length > 1 ? ' · plus ' + (names.length - 1) + ' others read' : '')) + tail;
  }

  function title(report, order) {
    return report.catalog?.zh || report.catalog?.name || order?.catalog?.zh || order?.name || report.kind || 'Untitled lab / exam';
  }
  function orderOf(state, report) {
    return state.orders.find(item => item.id === report.order) || state.orders.find(item => item.id === report.id) || null;
  }
  // 檢查（影像、內視鏡、超音波、心電圖…）與檢驗分開：檢查沒有數值子項，結果是一份文字報告（2026-09-11 R6）。
  function isExam(report) {
    if (report.examType) return true;
    const kind = String(report.kind || '');
    if (/檢驗|^Lab/i.test(kind)) return false;
    if (/影像|內視鏡|檢查|超音波|心電圖|Imaging|Endoscopy|Exam|Ultrasound|ECG/i.test(kind)) return true;
    if (report.catalog && report.catalog.isLab === false && root.ICUOrderTaxonomy && ['lab','imaging'].includes(root.ICUOrderTaxonomy.categoryOfEntry(report.catalog))) return true;
    return report.status !== 'pending' && !(report.components || []).length && !(report.catalog && report.catalog.isLab);
  }
  // Explicit start/end dates win over the quick range chips.
  function activeBounds(route) {
    if (route.labDateFrom || route.labDateTo) {
      const lo = route.labDateFrom ? clinical().millis(route.labDateFrom + 'T00:00') : -Infinity;
      const hi = route.labDateTo ? clinical().millis(route.labDateTo + 'T23:59') : Infinity;
      return [lo, hi];
    }
    return clinical().bounds(route.labRange);
  }

  // One row per analyte; pending reports contribute a single 待回 row (never a zero).
  function analyteRows(ctx) {
    const {state, patient, route} = ctx;
    const bounds = activeBounds(route);
    const rows = [];
    state.reports.filter(report => report.p === patient.id).forEach(report => {
      const order = orderOf(state, report);
      const basisAt = route.labDateBasis === 'order' ? (order?.orderedAt || report.collectedAt || report.at) : report.at;
      if (report.status === 'cancelled' || report.status === 'entered-in-error') return;  // 醫囑已停止或人工結果已作廢：不是結果（作廢的在病歷頁「作廢紀錄」）
      if (report.status !== 'pending' && !clinical().within(basisAt, bounds)) return;
      // basisAt is what the range filter used, so it is also what the matrix columns key on;
      // keying columns on reportAt while filtering on orderedAt produced out-of-window columns.
      const shared = {report, order, reportAt: report.at, orderedAt: order?.orderedAt || report.collectedAt || '', basisAt, panel: title(report, order), exam: isExam(report)};
      if (shared.exam) {
        rows.push({...shared, name: title(report, order), value: null, unit: '', reference: null, category: report.examType || 'Exam', specimen: 'N/A',
          interpretation: null, classification: report.status === 'pending' ? 'pending' : 'unknown', note: report.text || 'No text report from source'});
        return;
      }
      if (report.status === 'pending') {
        rows.push({...shared, name: title(report, order), value: null, unit: '', reference: null,
          category: report.catalog ? clinical().labInfo(report.catalog.key, state).category : 'Uncategorized',
          specimen: report.catalog ? clinical().labInfo(report.catalog.key, state).specimen : 'Not provided by source',
          interpretation: null, classification: 'pending', note: 'Report not yet returned'});
        return;
      }
      const components = report.components || [];
      if (!components.length) {
        rows.push({...shared, name: title(report, order), value: null, unit: '', reference: null,
          category: report.catalog ? clinical().labInfo(report.catalog.key, state).category : 'Uncategorized',
          specimen: 'N/A', interpretation: null, classification: 'unknown', note: report.text || 'No structured values from source'});
        return;
      }
      components.forEach(component => rows.push({...shared, analyteId: component.id || component.name, name: component.name || component.id || 'Unnamed in source',
        value: component.value, unit: component.unit || '', reference: component.reference || null,
        category: component.category || 'Uncategorized', specimen: component.specimen || 'Not provided by source',
        interpretation: component.interpretation || null, classification: clinical().resultClass(component),
        note: component.interpretationSource || component.mapping || ''}));
    });
    return rows.sort((a, b) => String(b.reportAt || '').localeCompare(String(a.reportAt || '')) || String(a.name).localeCompare(String(b.name)));
  }

  function matchRow(route, row) {
    if (route.labCategory !== 'all' && row.category !== route.labCategory) return false;
    if (route.labSpecimen !== 'all' && row.specimen !== route.labSpecimen) return false;
    if (route.labAbnormalOnly === '1' && row.classification !== 'abnormal') return false;
    if (route.labAbnormalOnly !== '1' && route.resultFilter !== 'all' && row.classification !== route.resultFilter) return false;
    const query = String(route.resultQuery || '').trim().toLowerCase();
    if (!query) return true;
    const hay = [row.name, row.panel, row.report.id, row.order?.id, row.report.catalog?.code].filter(Boolean).map(x => String(x).toLowerCase());
    return route.labExact === '1' ? hay.some(x => x === query) : hay.some(x => x.includes(query));
  }

  // 查詢條件可以收合，讓右側的數值矩陣整片展開。
  function railToggle(ctx, open) {
    const {route, esc} = ctx;
    return `<a class="button secondary rail-toggle" data-keep-filter href="${esc(href(route, {labRail: open ? '0' : '1', result: '', record: ''}))}" aria-expanded="${open}" aria-controls="lab-query-rail">${open ? 'Collapse advanced' : 'Advanced search'}</a>`;
  }
  function queryRail(ctx, categories) {
    const {route, esc, source} = ctx;
    const categoryLink = (value, text, count) => `<a class="rail-item${route.labCategory === value ? ' active' : ''}" data-keep-filter href="${esc(href(route, {labCategory: value, result: '', record: ''}))}"${route.labCategory === value ? ' aria-current="true"' : ''}>${esc(text)}${count === undefined ? '' : `<span class="rail-count">${count}</span>`}</a>`;
    return `<aside class="results-rail" id="lab-query-rail" aria-label="Lab search criteria">
      <div class="rail-head"><h3>Search criteria</h3>${railToggle(ctx, true)}</div>
      <form class="rail-form" data-form="labSearch">
        <fieldset class="rail-basis"><legend>Date basis</legend>
          <label class="check"><input type="radio" name="labDateBasis" value="report" ${route.labDateBasis === 'report' ? 'checked' : ''}>Report date</label>
          <label class="check"><input type="radio" name="labDateBasis" value="order" ${route.labDateBasis === 'order' ? 'checked' : ''}>Order date</label>
        </fieldset>
        <label>Start date<input type="date" name="labDateFrom" value="${esc(route.labDateFrom)}"></label>
        <label>End date<input type="date" name="labDateTo" value="${esc(route.labDateTo)}"></label>
        <input type="hidden" name="labCategory" value="${esc(route.labCategory)}">
        <input type="hidden" name="labSpecimen" value="${esc(route.labSpecimen)}">
        <input type="hidden" name="resultQuery" value="${esc(route.resultQuery || '')}">
        <div class="row"><button type="submit" class="secondary">Search</button><a class="button secondary" data-keep-filter href="${esc(href(route, {labDateFrom: '', labDateTo: '', labRange: '1m', labCategory: 'all', labSpecimen: 'all', resultQuery: '', labExact: '0', labAbnormalOnly: '0', resultFilter: 'all', result: '', record: ''}))}">Clear</a></div>
        ${source('Entering start / end dates overrides the quick range above.')}
      </form>
      <nav class="rail-list" aria-label="Category tree"><h3>Category tree</h3>
        ${categoryLink('all', 'All Tests')}
        ${[...categories.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => categoryLink(name, name, count)).join('')}
      </nav></aside>`;
  }

  function denseTable(ctx, rows) {
    const {esc, badge, source, empty, state, actors} = ctx;
    if (!rows.length) return empty('No lab or exam results for the current criteria; this does not mean there is no other source data, nor that results are normal.');
    const byReport = new Map();
    rows.forEach(row => {
      if (!byReport.has(row.report.id)) byReport.set(row.report.id, []);
      byReport.get(row.report.id).push(row);
    });
    const body = [...byReport.entries()].map(([reportId, group]) => {
      const report = group[0].report, order = group[0].order, detailId = 'result-detail-' + reportId;
      const patient = ctx.patient;
      const cells = group.map((row, index) => {
        const abnormal = row.classification === 'abnormal';
        return `<tr class="analyte-row${abnormal ? ' is-abnormal' : ''}">`
          + `<td>${esc(row.category)}</td>`
          + `<td>${esc(row.specimen)}</td>`
          + `<td class="col-analyte"><strong>${esc(row.name)}</strong>${index === 0 ? source(row.panel + (report.entry === 'manual' ? ' · Manual entry' : '')) : ''}</td>`
          + `<td class="col-date">${esc(String(row.reportAt || 'Not yet reported').replace('T', ' '))}</td>`
          + `<td class="col-value ${esc(row.classification)}">${row.value === null || row.value === undefined || row.value === '' ? (row.classification === 'pending' ? 'Pending result' : 'Missing') : esc(row.value)}</td>`
          + `<td>${esc(row.unit || '—')}</td>`
          + `<td class="col-ref">${esc(row.reference || 'Not provided by source')}</td>`
          + `<td class="col-note">${badge(labels[row.classification], abnormal || row.classification === 'pending')}${source('Source flag: ' + (row.interpretation || 'Not provided'))}</td>`
          + `<td class="col-report">${index === 0 ? `<button type="button" class="secondary compact-button" data-keep-label data-disclosure-toggle="${esc(detailId)}" aria-expanded="false" aria-controls="${esc(detailId)}">Report details</button>` : '<span class="source">·</span>'}</td>`
          + `<td class="col-code">${esc(patient.visitNo || 'Not provided by source')}</td>`
          + `<td class="col-date">${esc((row.orderedAt || '').slice(0, 10) || 'Not provided by source')}</td></tr>`;
      }).join('');
      const detail = `<tr id="${esc(detailId)}" class="result-detail-row" hidden><td colspan="11"><div class="result-detail-grid">
        <section><h3>Order and report source</h3><dl><dt>Ordered at</dt><dd>${esc(order?.orderedAt || 'Not provided by source')}</dd><dt>Collected at</dt><dd>${esc(report.collectedAt || 'Not provided by source')}</dd><dt>Reported at</dt><dd>${esc(report.at || 'Not yet reported')}</dd><dt>Report version</dt><dd>${esc('v' + report.version)}</dd><dt>Source order</dt><dd>${order ? esc(order.id) : 'Source order link not provided'}</dd></dl>${source(report.source || 'Not provided by source')}${report.text ? `<p class="preserve-lines">${esc(report.text)}</p>` : ''}</section>
        <section><h3>Full report and items</h3>${report.catalog ? source('HIS service code ' + report.catalog.code + ' · ' + (report.catalog.zh || report.catalog.name)) : source('Item mapping not provided by source')}<p class="source">Reference ranges are for display only; normal / abnormal always follows the source flag.</p></section>
        <section><h3>Read status and follow-up</h3><p>${esc((report.seen || []).length + ' read; ' + (report.processed || []).length + ' follow-up records')}</p>${(report.processed || []).map(item => `<p class="notice">${esc(item.note)}${source((actors[item.actor]?.name || 'Not provided by source') + ' · ' + item.at)}</p>`).join('')}${reportActions(ctx, report)}</section></div></td></tr>`;
      return `<tbody class="result-row-group" id="record-${esc(reportId)}">${cells}${detail}</tbody>`;
    }).join('');
    return `<div class="table-wrap"><table class="result-worklist dense-table" data-copyable><thead><tr><th scope="col" class="corner-cell" data-copy-label="Category">${copyCorner()}Category</th><th scope="col">Specimen</th><th scope="col">Lab test</th><th scope="col">Report date</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Reference range</th><th scope="col">Interpretation</th><th scope="col">Report</th><th scope="col">Encounter no.</th><th scope="col">Order date</th></tr></thead>${body}</table></div>`;
  }

  // 檢驗數值: rows are analytes, columns are dates. This is the comparison view doctors expect;
  // the analyte-per-row list stays available for the full per-row detail.
  function matrixView(ctx, rows) {
    const {route, esc, badge, source, empty} = ctx;
    const usable = rows.filter(row => row.analyteId && row.report.status === 'returned' && row.basisAt);
    if (!usable.length) return empty('No numeric results to arrange in a matrix for the current criteria. For text reports, pending results, and missing values, switch to the “Lab reports” tab.');
    const basisLabel = route.labDateBasis === 'order' ? 'Order date' : 'Report date';
    const allDates = [...new Set(usable.map(row => row.basisAt.slice(0, 10)))].sort().reverse();
    const dates = allDates.slice(0, 14);
    const shown = new Set(dates);
    const byAnalyte = new Map();
    usable.forEach(row => {
      if (!shown.has(row.basisAt.slice(0, 10))) return;
      const key = row.analyteId + '|' + (row.unit || '');
      if (!byAnalyte.has(key)) byAnalyte.set(key, {name: row.name, unit: row.unit, category: row.category, specimen: row.specimen, reference: row.reference, cells: new Map()});
      const bucket = byAnalyte.get(key);
      const day = row.basisAt.slice(0, 10);
      if (!bucket.cells.has(day)) bucket.cells.set(day, []);
      bucket.cells.get(day).push(row);
    });
    const analytes = [...byAnalyte.entries()].sort((a, b) => String(a[1].category).localeCompare(String(b[1].category)) || String(a[1].name).localeCompare(String(b[1].name)));
    // 高低分開標（2026-11-02）：來源旗標 H／HH 是 ▲、L／LL 是 ▼，其他異常（A／AA）是 !。
    const labFlag = flag => /^H/.test(flag || '') ? '<span class="lab-cell-flag" aria-label="High per source flag" title="High per source flag">▲</span>' : /^L/.test(flag || '') ? '<span class="lab-cell-flag" aria-label="Low per source flag" title="Low per source flag">▼</span>' : '<span class="lab-cell-flag" aria-label="Abnormal per source flag" title="Abnormal per source flag">!</span>';
    const head = `<tr><th scope="col" class="lab-matrix-head corner-cell" data-copy-label="Lab test">${copyCorner()}Lab test</th>${dates.map(day => `<th scope="col" class="col-date">${esc(day)}</th>`).join('')}</tr>`;
    const chosen = new Set(picks(route));
    const body = analytes.map(([key, bucket]) => {
      const cells = dates.map(day => {
        const list = (bucket.cells.get(day) || []).slice().sort((a, b) => String(b.basisAt).localeCompare(String(a.basisAt)));
        if (!list.length) return '<td class="lab-cell empty-cell"><span class="source">—</span></td>';
        const latest = list[0];
        const value = latest.value === null || latest.value === undefined || latest.value === '' ? 'Missing' : latest.value;
        const extra = list.length > 1 ? `<span class="lab-cell-more" title="${esc('Same day: ' + list.length + ' times, showing the last')}">+${list.length - 1}</span>` : '';
        return `<td class="lab-cell ${esc(latest.classification)}"><a href="${esc(href(route, {result: latest.report.id, record: latest.report.id, labView: 'values', resultView: 'table'}))}">${esc(value)}</a>${extra}${latest.classification === 'abnormal' ? labFlag(latest.interpretation) : ''}</td>`;
      }).join('');
      return `<tr><th scope="row" class="lab-matrix-head"><label class="lab-pick"><input type="checkbox" data-lab-pick value="${esc(key)}"${chosen.has(key) ? ' checked' : ''}><strong>${esc(bucket.name)}</strong></label><span class="lab-matrix-unit">${esc(bucket.unit || 'Unit not provided')}${bucket.reference ? ' · Ref ' + esc(bucket.reference) : ''}</span></th>${cells}</tr>`;
    }).join('');
    const trendBar = `<div class="lab-trend-bar"><button type="button" data-lab-trend${chosen.size ? '' : ' disabled'}>Trend of selected items <b data-lab-pick-count>${chosen.size}</b></button></div>`;
    return trendBar + `<div class="table-wrap"><table class="lab-matrix dense-table" data-copyable><caption class="visually-hidden">Lab value matrix, columns by ${esc(basisLabel)}</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>`
      + source('Columns by ' + basisLabel + '; multiple draws on the same day show the last one marked +n; ▲ marks abnormal per source flag, not calculated from the reference range.')
      + (allDates.length > dates.length ? `<p class="catalog-more">There are ${allDates.length} columns by ${esc(basisLabel)}; showing the latest ${dates.length} columns. Use the start / end dates on the left or the range above to narrow the range and see earlier columns.</p>` : '');
  }

  // 檢查報告：一列一份檢查（影像、內視鏡…），結果是文字，直接顯示在列上；展開看全文、時間與已閱處理。
  function examTable(ctx, rows) {
    const {actors, esc, badge, source, empty} = ctx;
    if (!rows.length) return empty('No exam reports (imaging, endoscopy, ultrasound, ECG, etc.) for the current criteria; this does not mean no exams were scheduled.');
    const groups = rows.slice().sort((a, b) => String(b.basisAt || b.reportAt || '').localeCompare(String(a.basisAt || a.reportAt || '')));
    const body = groups.map(row => {
      const report = row.report, order = row.order, detailId = 'exam-detail-' + report.id;
      const pending = report.status === 'pending';
      const text = pending ? '' : (report.text || 'No text report from source');
      const short = text.length > 180 ? text.slice(0, 180) + '…' : text;
      const unread = !pending && readState(report, ctx.route.actor).unread;
      return `<tbody class="result-row-group" id="record-${esc(report.id)}"><tr class="exam-row${pending ? ' is-pending' : ''}${unread ? ' is-unread' : ''}">
        <td class="col-exam-name"><strong>${esc(row.panel)}</strong>${source(report.id + ' v' + report.version + (order ? ' · Source order ' + order.id : ' · No source order linked') + (report.entry === 'manual' ? ' · Manual entry' : ''))}</td>
        <td><span class="exam-type">${esc(report.examType || row.category || 'Exam')}</span></td>
        <td class="col-date">${esc((order?.orderedAt || '').slice(0, 10) || 'Not provided by source')}</td>
        <td class="col-date">${esc(String(report.collectedAt || 'Not yet given').replace('T', ' '))}<span class="source">Report ${esc(String(report.at || 'Not yet reported').replace('T', ' '))}</span></td>
        <td class="col-exam-result">${pending ? '<span class="pill warning">Pending result</span>' : `<p class="exam-text preserve-lines">${esc(short)}</p>${report.impression ? `<p class="exam-impression"><b>Impression</b>${esc(report.impression)}</p>` : ''}`}</td>
        <td>${pending ? badge('Pending result', true) : badge('Reported')}</td>
        <td class="col-read">${readBadge(ctx, report)}</td>
        <td><button type="button" class="secondary compact-button" data-keep-label data-disclosure-toggle="${esc(detailId)}" aria-expanded="false" aria-controls="${esc(detailId)}">Report details</button></td>
      </tr><tr id="${esc(detailId)}" class="result-detail-row" hidden><td colspan="8"><div class="result-detail-grid exam-detail">
        <section><h3>Order and exam times</h3><dl><dt>Ordered at</dt><dd>${esc(order?.orderedAt || 'Not provided by source')}</dd><dt>Exam time</dt><dd>${esc(report.collectedAt || 'Not provided by source')}</dd><dt>Report time</dt><dd>${esc(report.at || 'Not yet reported')}</dd><dt>Report version</dt><dd>${esc('v' + report.version)}</dd><dt>Source order</dt><dd>${order ? esc(order.id) : 'Source order link not provided'}</dd><dt>Reported by</dt><dd>${esc(report.reporter || 'Not provided by source')}</dd></dl>${source(report.source || 'Not provided by source')}${report.catalog ? source('HIS service code ' + report.catalog.code + ' · ' + (report.catalog.zh || report.catalog.name)) : ''}</section>
        <section class="exam-fulltext"><h3>Full exam result</h3>${pending ? '<p class="source">Report not yet returned; pending does not mean normal.</p>' : `<p class="preserve-lines">${esc(text)}</p>`}${report.impression ? `<p><strong>Conclusion / recommendation: </strong>${esc(report.impression)}</p>` : ''}<p class="source">Original images, endoscopy images, and PACS are not integrated; only text reports are shown here.</p></section>
        <section><h3>Read status and follow-up</h3><p>${esc((report.seen || []).length + ' read; ' + (report.processed || []).length + ' follow-up records')}</p>${(report.processed || []).map(item => `<p class="notice">${esc(item.note)}${source((actors[item.actor]?.name || 'Not provided by source') + ' · ' + item.at)}</p>`).join('')}${reportActions(ctx, report)}</section></div></td></tr></tbody>`;
    }).join('');
    return `<div class="table-wrap"><table class="exam-worklist dense-table" data-copyable><thead><tr><th scope="col" class="corner-cell" data-copy-label="Exam">${copyCorner()}Exam</th><th scope="col">Type</th><th scope="col">Order date</th><th scope="col">Exam time / report</th><th scope="col">Exam result</th><th scope="col">Status</th><th scope="col">Read</th><th scope="col">Details</th></tr></thead>${body}</table></div>`;
  }

  // 單份報告的明細（時間、數值或全文、已閱處理與操作），給「開立紀錄與結果」清單的展開列重用。
  function reportDetail(ctx, report, order) {
    const {esc, badge, source, actors} = ctx;
    const comps = report.components || [];
    const values = report.status === 'pending' ? '<p class="source">Report not yet returned; pending does not mean normal.</p>' : comps.length ? ctx.table(['Lab test', 'Value', 'Unit', 'Reference range', 'Source flag'], comps.map(c => { const cls = clinical().resultClass(c); return [`<strong>${esc(c.name || c.id)}</strong>`, `<span class="col-value ${esc(cls)}">${c.value === null || c.value === undefined || c.value === '' ? 'Missing' : esc(c.value)}</span>`, esc(c.unit || '—'), esc(c.reference || 'Not provided by source'), badge(labels[cls], cls === 'abnormal')]; })) : `<p class="preserve-lines">${esc(report.text || 'No text report from source')}</p>${report.impression ? `<p><strong>Conclusion / recommendation: </strong>${esc(report.impression)}</p>` : ''}`;
    return `<dl><dt>Collected / exam</dt><dd>${esc(report.collectedAt || 'Not provided by source')}</dd><dt>Reported</dt><dd>${esc(report.at || 'Not yet reported')}</dd><dt>Version</dt><dd>v${esc(report.version)}</dd>${report.reporter ? `<dt>Reported by</dt><dd>${esc(report.reporter)}</dd>` : ''}</dl>${values}${source(report.id + ' · ' + (report.source || 'Not provided by source'))}<p>${esc((report.seen || []).length + ' read; ' + (report.processed || []).length + ' follow-up records')}</p>${(report.processed || []).map(item => `<p class="notice">${esc(item.note)}${source((actors[item.actor]?.name || 'Not provided by source') + ' · ' + item.at)}</p>`).join('')}${reportActions(ctx, report)}`;
  }
  root.ICUResultViews = {reportDetail, readState, readBadge};

  function reportActions(ctx, report) {
    const {state, actor, act, form, field} = ctx;
    if (report.status === 'pending') return form('reportReturn', field('at', 'Demo report time', '2026-08-31T17:00', 'datetime-local', 'required'), 'Simulate report return', {id: report.id});
    if (state.scenario === 'missing') return '';
    const W = root.ICUWorkflow, voidable = report.entry === 'manual' && report.enteredBy === ctx.route.actor && W && W.archiveState(state, report.p) === 'open';
    // 作廢（2026-10-24，C2）：只限人工補登、登錄者本人；補在待回醫囑上的結果作廢後報告回到待回。
    const voidBox = voidable ? `<details class="void-box"><summary>Void this manually entered result</summary><p class="source">Only for a result entered in error. If it was entered on a pending order, the order goes back to awaiting its result; the voided entry can be restored from the Medical record tab until the record is completed for archiving.</p>${form('voidRecord', field('reason', 'Reason for voiding', '', 'text', 'required'), 'Void result', {kind: 'report', id: report.id, p: report.p})}</details>` : '';
    return `<div class="result-actions">${act('readReport', 'Mark as read', {id: report.id})}${ctx.canOrder ? form('processReport', field('note', 'Interpretation / follow-up note', '', 'text', 'required'), 'Save follow-up', {id: report.id}) : ''}</div>${voidBox}`;
  }

  // 手動登錄檢驗檢查結果（2026-09-26）：還不確定院方有沒有可串接的 API，醫師或護理師照紙本或外部報告登錄。
  // 可補上一筆待回報告（連回原醫囑），或新增一筆沒有醫囑關聯的結果。正常／異常只看登錄者選的旗標。
  const FLAGS = [['', 'Not provided'], ['N', 'Normal N'], ['H', 'High H'], ['L', 'Low L'], ['HH', 'Critical high HH'], ['LL', 'Critical low LL'], ['A', 'Abnormal A']];
  function entryDialog(ctx, exam) {
    const {state, patient, esc, form} = ctx;
    const now = String(state.demoClock || '2026-08-31T09:00').slice(0, 16);
    const pending = state.reports.filter(r => r.p === patient.id && r.status === 'pending' && (exam ? isExam(r) : !isExam(r)));
    const pick = `<label class="wide">Linked pending ${exam ? 'Exam' : 'Lab'}<select name="reportId"><option value="">Not linked to an order, add new</option>${pending.map(r => `<option value="${esc(r.id)}">${esc(title(r, orderOf(state, r)))} · ${esc(r.id)}${r.order ? ' · Order ' + esc(r.order) : ''}</option>`).join('')}</select></label>`;
    const names = [...new Set(state.reports.filter(r => exam ? isExam(r) : !isExam(r)).map(r => r.catalog?.zh || r.catalog?.name).filter(Boolean))];
    const opt = list => list.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    const times = `<label>${exam ? 'Exam' : 'Collection'} time<input name="collectedAt" type="datetime-local" required value="${esc(now)}"></label><label>Report time<input name="at" type="datetime-local" required value="${esc(now)}"></label>`;
    const body = exam
      ? `<div class="entry-grid">${pick}<label>Exam name (required if not linked to an order)<input name="name" list="entry-names" autocomplete="off"></label><label>Exam type<select name="examType">${opt(['Imaging', 'Ultrasound', 'Endoscopy', 'ECG', 'Other'])}</select></label>${times}<label class="wide">Full exam result<textarea name="text" required rows="5"></textarea></label><label class="wide">Conclusion / recommendation<input name="impression"></label></div>`
      : `<div class="entry-grid">${pick}<label>Lab name (required if not linked to an order)<input name="name" list="entry-names" autocomplete="off"></label><label>Category<select name="category">${opt(clinical().labCategories.filter(c => c !== 'Imaging'))}</select></label><label>Specimen<select name="specimen">${opt(clinical().labSpecimens)}</select></label>${times}</div>
        <div class="table-wrap"><table class="dense-table entry-rows"><thead><tr><th scope="col">Lab test</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Reference range</th><th scope="col">Flag</th></tr></thead><tbody>${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<tr><td><input name="cName:${i}" aria-label="Row ${i + 1} lab test" autocomplete="off"></td><td><input name="cValue:${i}" aria-label="Row ${i + 1} value" inputmode="decimal" autocomplete="off"></td><td><input name="cUnit:${i}" aria-label="Row ${i + 1} unit" autocomplete="off"></td><td><input name="cRef:${i}" aria-label="Row ${i + 1} reference range" autocomplete="off"></td><td><select name="cFlag:${i}" aria-label="Row ${i + 1} flag">${FLAGS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
        <label class="wide">Note<input name="text"></label>`;
    const id = 'lab-entry-dialog', heading = exam ? 'Add exam report' : 'Add lab result';
    return `<dialog id="${id}" class="entry-dialog" aria-labelledby="${id}-title"><div class="dialog-head"><h2 id="${id}-title">${heading}</h2><button type="button" class="secondary" data-dialog-close="${id}">Cancel</button></div><div data-dialog-message></div><datalist id="entry-names">${opt(names)}</datalist>${form('labResultManual', body, 'Save ', {kind: exam ? 'exam' : 'lab'})}</dialog>`;
  }

  function trendView(ctx, rows) {
    const {route, esc, source, empty} = ctx;
    const numeric = rows.filter(row => typeof row.value === 'number' && Number.isFinite(row.value) && row.reportAt);
    const keys = [...new Set(numeric.map(pickKey))];
    if (!keys.length) return empty('No numeric time series to plot for the current criteria; pending results, text reports, and missing values are not plotted as zero.');
    // 沒勾任何項目時看單一指標（舊連結的 labMetric 是「名稱|單位」，照樣認得），都沒有就第一項。
    const legacy = numeric.find(row => row.name + '|' + (row.unit || '') === route.labMetric);
    const chosen = picks(route).filter(key => keys.includes(key));
    const selected = chosen.length ? chosen : [keys.includes(route.labMetric) ? route.labMetric : legacy ? pickKey(legacy) : keys[0]];
    const series = selected.map(key => {
      const list = numeric.filter(row => pickKey(row) === key).sort((a, b) => clinical().millis(a.reportAt) - clinical().millis(b.reportAt));
      const refs = [...new Set(list.map(row => String(row.reference || '').trim()))];
      return {name: list[0].name, unit: list[0].unit || '—', band: refs.length === 1 ? rangeOf(refs[0]) : null,
        points: list.map(row => ({at: row.reportAt, value: row.value, flag: row.classification === 'abnormal', id: row.report.id, sourceId: row.report.id, report: row.report.id}))};
    });
    const chart = root.ICUTrend.draw({series, bounds: activeBounds(route), mode: route.plot, href: point => href(route, {result: point.report, record: point.report})});
    const picker = keys.map(key => { const row = numeric.find(x => pickKey(x) === key); return `<label class="check"><input type="checkbox" data-lab-pick value="${esc(key)}"${selected.includes(key) ? ' checked' : ''}><span data-no-i18n>${esc(row.name)}</span><small data-no-i18n>${esc(row.unit || '')}</small></label>`; }).join('');
    return `<div class="lab-trend-picker"><div class="lab-trend-items">${picker}</div><div class="lab-trend-actions"><button type="button" data-lab-trend>Trend of selected items <b data-lab-pick-count>${selected.length}</b></button><label>Chart<select id="lab-plot"><option value="line" ${route.plot === 'line' ? 'selected' : ''}>Line chart</option><option value="scatter" ${route.plot === 'scatter' ? 'selected' : ''}>Scatter plot</option></select></label></div></div>`
      + source('One chart per item with its own scale, on a shared time axis. Shaded band: the reference range carried by the results, drawn only when every result has the same range. Ringed points: abnormal per source flag. Missing values break the line and are not filled with 0.') + chart;
  }

  root.ICUPatientViews.register('results', function (ctx) {
    const {route, esc, badge, source} = ctx;
    const every = analyteRows(ctx), examRows = every.filter(row => row.exam), all = every.filter(row => !row.exam);
    const q = String(route.resultQuery || '').trim().toLowerCase();
    const shownExams = examRows.filter(row => !q || [row.name, row.panel, row.report.id, row.order?.id, row.report.examType].filter(Boolean).some(x => String(x).toLowerCase().includes(q)));
    const examPending = examRows.filter(row => row.classification === 'pending').length;
    const categories = new Map();
    all.forEach(row => categories.set(row.category, (categories.get(row.category) || 0) + 1));
    const specimens = [...new Set(all.map(row => row.specimen))].sort();
    const rows = all.filter(row => matchRow(route, row));
    const pending = all.filter(row => row.classification === 'pending').length;
    const abnormal = all.filter(row => row.classification === 'abnormal').length;
    const railOpen = route.labRail === '1';
    const labView = route.labView === 'exams' ? 'exams' : 'values';
    const view = labView === 'exams' ? 'exams' : (['matrix', 'table', 'trend'].includes(route.resultView) ? route.resultView : 'matrix');
    const rangeChips = quickRanges.map(([value, text]) => `<a class="filter-chip${route.labRange === value && !route.labDateFrom && !route.labDateTo ? ' active' : ''}" data-keep-filter href="${esc(href(route, {labRange: value, labDateFrom: '', labDateTo: '', result: '', record: ''}))}">${esc(text)}</a>`).join('');
    const subtab = (target, text, count) => `<a data-keep-filter href="${esc(href(route, {labView: target, result: '', record: ''}))}" class="${labView === target ? 'active' : ''}"${labView === target ? ' aria-current="page"' : ''}>${esc(text)}<b class="tab-count">${count}</b></a>`;
    // 明確的數字，不留灰色說明字。
    const stats = `<div class="lab-stats">${badge(pending + ' labs pending result', pending > 0)}${badge(abnormal + ' abnormal', abnormal > 0)}${badge(examRows.length + ' exam reports' + (examPending ? ' · ' + examPending + ' pending result' : ''), examPending > 0)}${route.labDateFrom || route.labDateTo ? badge((route.labDateBasis === 'order' ? 'Order date ' : 'Report date ') + (route.labDateFrom || 'Any') + ' – ' + (route.labDateTo || 'Any')) : ''}</div>`;
    const selects = labView === 'values'
      ? `<label class="lab-select">Category<select name="labCategory">${['all', ...categories.keys()].map(value => `<option value="${esc(value)}" ${route.labCategory === value ? 'selected' : ''}>${value === 'all' ? 'All' : esc(value)}</option>`).join('')}</select></label><label class="lab-select">Specimen<select name="labSpecimen">${['all', ...specimens].map(value => `<option value="${esc(value)}" ${route.labSpecimen === value ? 'selected' : ''}>${value === 'all' ? 'All' : esc(value)}</option>`).join('')}</select></label>`
      : '<input type="hidden" name="labCategory" value="all"><input type="hidden" name="labSpecimen" value="all">';
    const canEnter = ctx.canOrder || ctx.canNurse;
    const addButton = canEnter ? `<button type="button" class="lab-add" data-dialog-open="lab-entry-dialog">${labView === 'exams' ? 'Add exam report' : 'Add lab result'}</button>` : '';
    const rightSide = labView === 'values'
      ? `<label class="lab-select">Result status<select id="result-filter">${Object.entries(labels).map(([value, text]) => `<option value="${value}" ${route.resultFilter === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label><label class="lab-select">View<select id="result-view"><option value="matrix" ${view === 'matrix' ? 'selected' : ''}>Value matrix</option><option value="table" ${view === 'table' ? 'selected' : ''}>Item list</option><option value="trend" ${view === 'trend' ? 'selected' : ''}>Trend chart</option></select></label>`
      : '';
    // 篩選條件同一列：區間、分類、檢體、關鍵字、查詢；右手邊是結果狀態與呈現方式。日期依據與起訖收在「進階查詢」。
    const toolbar = `<form class="lab-toolbar" data-form="labSearch"><input type="hidden" name="labDateBasis" value="${esc(route.labDateBasis)}"><input type="hidden" name="labDateFrom" value="${esc(route.labDateFrom)}"><input type="hidden" name="labDateTo" value="${esc(route.labDateTo)}"><span class="lab-ranges"><span class="filter-label">Range</span>${rangeChips}</span>${selects}<label class="lab-keyword">Keyword<input name="resultQuery" value="${esc(route.resultQuery || '')}" placeholder="${labView === 'exams' ? 'Exam, type, report no.' : 'Metric, item, report or order no.'}"></label><button type="submit" class="secondary">Search</button>${railToggle(ctx, railOpen)}<span class="lab-toolbar-end">${rightSide}${addButton}</span></form>`;
    const count = `<p role="status" class="results-count">${labView === 'exams' ? shownExams.length + ' / ' + examRows.length + ' exam reports' : rows.length + ' / ' + all.length + ' lab results'} match the current criteria</p>`;
    const content = view === 'exams' ? examTable(ctx, shownExams) : view === 'trend' ? trendView(ctx, rows) : view === 'table' ? denseTable(ctx, rows) : matrixView(ctx, rows);
    return `<div class="results-layout${railOpen ? '' : ' rail-collapsed'}">
        ${railOpen ? queryRail(ctx, categories) : ''}
        <section class="card results-main">
          <div class="lab-head"><nav class="lab-view-tabs" aria-label="Labs and exams tabs">${subtab('values', 'Lab values', all.filter(row => row.report.status === 'returned').length)}${subtab('exams', 'Exam reports', examRows.length)}</nav>${stats}</div>
          ${toolbar}
          ${count}
          ${content}
        </section>
        ${canEnter ? entryDialog(ctx, labView === 'exams') : ''}
      </div>`;
  });
})(globalThis);
