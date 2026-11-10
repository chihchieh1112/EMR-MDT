/* EMR整合MDT demo：每頁回饋面板（2026-11-10，P4）。右下角浮動面板，讓看 demo 的人對「目前這一頁」留下判斷（符合／要改／不需要）與意見；
   存在這台瀏覽器的 localStorage（鍵 emr-mdt-feedback-v1，與臨床示範資料分開），可匯出 JSON／CSV 或複製文字寄回。
   面板掛在 body 下、#app 之外，所以 app.js 重繪不會清掉它；文字走 i18n（英文正本，中文在 demo-dict.js）。 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const KEY = 'emr-mdt-feedback-v1';
  const E = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable: keep in memory only */ mem = list; } };
  let mem = null;
  const all = () => mem || read();
  const VERDICT = {fits: ['Fits our workflow', 'success'], change: ['Needs change', 'warning'], skip: ['Not needed', 'muted']};
  const SUB_LABEL = {agenda: "This week's agenda", cases: 'Case meetings', teams: 'Teams and sessions', records: 'Past meetings', tasks: 'Follow-up tasks', dashboard: 'Dashboard', pack: 'Summary pack', record: 'Discussion and conclusion', propose: 'Proposal', prefill: 'Pre-meeting input by discipline', prefillEdit: 'Pre-meeting input', caseDecide: 'Decision to convene', caseRecord: 'Case conference record', family: 'Family meeting record',
    consultation: 'Specialist consult', allied: 'Allied-health consult', team: 'Team overview', multi: 'Multi-physician consultation', history: 'Care history', communication: 'Essential communication', consultForms: 'Consult forms', levels: 'Levels & signatures'};
  function pageInfo() {
    const q = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
    const view = q.view || 'home', sub = view === 'mdt' ? (q.mdtTab || 'agenda') : view === 'notes' ? (q.careWork || 'consultation') : view === 'settings' ? (q.tab || 'signature') : '';
    const base = (document.title.split('|')[1] || view).trim();
    return {id: view + (sub ? '/' + sub : ''), view, sub, title: base + (sub ? ' · ' + (SUB_LABEL[sub] || sub) : ''), actor: q.actor || '', p: q.p || '', ref: q.mdtCase || q.mdtConf || q.mdtRef || ''};
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
  const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  function exportText(kind) {
    const list = all(), version = (root.DEMO || {}).version || '';
    if (kind === 'json') return JSON.stringify({exportedAt: stamp(), demoVersion: version, entries: list}, null, 2);
    const head = ['at', 'page', 'view', 'section', 'title', 'actor', 'patient', 'reference', 'verdict', 'note'];
    return [head.join(','), ...list.map(e => [e.at, e.id, e.view, e.sub, e.title, e.actor, e.p, e.ref, (VERDICT[e.verdict] || [e.verdict])[0], e.note].map(csvCell).join(','))].join('\n');
  }
  function download(name, text, type) {
    try { const blob = new Blob([text], {type}), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000); return true; } catch (e) { return false; }
  }
  // ---- DOM ----
  const box = document.createElement('aside'); box.id = 'demo-feedback'; box.className = 'demo-fb'; box.setAttribute('aria-label', 'Page feedback');
  document.body.appendChild(box);
  let open = /[?&]feedback=1/.test(location.search), listOpen = false, pendingVerdict = '';
  function render() {
    const info = pageInfo(), list = all(), cur = list.find(e => e.id === info.id) || null, verdict = pendingVerdict || (cur ? cur.verdict : '');
    box.innerHTML = `<button type="button" class="demo-fb-toggle" data-fb="toggle" aria-expanded="${open}" title="Page feedback">${open ? '✕' : '✎'} <span>Feedback</span><b data-no-i18n>${list.length}</b></button>` +
      (!open ? '' : `<section class="demo-fb-panel"><header><div><strong>Page feedback</strong><small class="demo-fb-page" data-no-i18n>${E(info.title)}${info.ref ? ' · ' + E(info.ref) : ''}</small></div>${cur ? `<span class="pill ${E(VERDICT[cur.verdict][1])}">${E(VERDICT[cur.verdict][0])}</span>` : ''}</header>
        ${listOpen ? listView(list) : `<div class="demo-fb-verdicts">${Object.entries(VERDICT).map(([k, [t]]) => `<button type="button" class="demo-fb-verdict ${verdict === k ? 'is-on tone-' + k : ''}" data-fb="verdict" data-verdict="${k}">${t}</button>`).join('')}</div>
        <textarea class="demo-fb-note" rows="3" placeholder="What should change, and why? (optional)">${E(cur ? cur.note : '')}</textarea>
        <div class="demo-fb-row"><button type="button" data-fb="save" ${verdict ? '' : 'disabled'}>Save for this page</button><button type="button" class="secondary" data-fb="list">All feedback <span data-no-i18n>(${list.length})</span></button></div>
        <p class="demo-fb-hint">Stored only in this browser; export or copy to send it back. Each page keeps one verdict (saving again replaces it).</p>`}</section>`);
  }
  function listView(list) {
    return `<div class="demo-fb-list">${list.length ? `<table><thead><tr><th>Page</th><th>Verdict</th><th>Note</th><th></th></tr></thead><tbody>${list.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).map(e => `<tr><td data-no-i18n><b>${E(e.title)}</b><br><small>${E(e.at + (e.actor ? ' · ' + e.actor : '') + (e.ref ? ' · ' + e.ref : ''))}</small></td><td><span class="pill ${E((VERDICT[e.verdict] || ['', ''])[1])}">${E((VERDICT[e.verdict] || [e.verdict])[0])}</span></td><td data-no-i18n>${E(e.note || '')}</td><td><button type="button" class="secondary compact-button" data-fb="remove" data-id="${E(e.id)}" title="Remove">✕</button></td></tr>`).join('')}</tbody></table>` : '<p class="demo-fb-hint">No feedback saved yet. Use the three buttons on any page.</p>'}
      <div class="demo-fb-row"><button type="button" data-fb="export" data-kind="json" ${list.length ? '' : 'disabled'}>Export JSON</button><button type="button" data-fb="export" data-kind="csv" ${list.length ? '' : 'disabled'}>Export CSV</button><button type="button" class="secondary" data-fb="copy" ${list.length ? '' : 'disabled'}>Copy as text</button><button type="button" class="secondary" data-fb="back">Back</button><button type="button" class="secondary demo-fb-danger" data-fb="clear" ${list.length ? '' : 'disabled'}>Clear all</button></div>
      <textarea class="demo-fb-export" rows="4" hidden readonly></textarea><p class="demo-fb-hint">Send the exported file (or the copied text) back to us; it contains only your verdicts and notes, no patient data.</p></div>`;
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-fb]'); if (!b) return; const k = b.dataset.fb, info = pageInfo();
    if (k === 'toggle') { open = !open; if (!open) { listOpen = false; pendingVerdict = ''; } render(); return; }
    if (k === 'verdict') { pendingVerdict = b.dataset.verdict; const note = box.querySelector('.demo-fb-note'); const keep = note ? note.value : null; render(); if (keep !== null) { const n2 = box.querySelector('.demo-fb-note'); if (n2) n2.value = keep; } return; }
    if (k === 'save') { const list = all().filter(x => x.id !== info.id); const note = (box.querySelector('.demo-fb-note') || {}).value || ''; list.push({...info, verdict: pendingVerdict || ((all().find(x => x.id === info.id) || {}).verdict) || 'fits', note: note.trim(), at: stamp(), demoVersion: (root.DEMO || {}).version || ''}); write(list); pendingVerdict = ''; render(); const s = box.querySelector('.demo-fb-hint'); if (s) s.textContent = 'Saved for this page.'; return; }
    if (k === 'list') { listOpen = true; render(); return; }
    if (k === 'back') { listOpen = false; render(); return; }
    if (k === 'remove') { write(all().filter(x => x.id !== b.dataset.id)); render(); return; }
    if (k === 'clear') { if (confirm('Clear all saved feedback in this browser?')) { write([]); render(); } return; }
    if (k === 'export') { const kind = b.dataset.kind, text = exportText(kind), name = 'emr-mdt-demo-feedback-' + stamp().slice(0, 10) + (kind === 'json' ? '.json' : '.csv'); const ok = download(name, text, kind === 'json' ? 'application/json' : 'text/csv'); const ta = box.querySelector('.demo-fb-export'); if (ta) { ta.hidden = ok; ta.value = text; } return; }
    if (k === 'copy') { const text = exportText('csv'); const ta = box.querySelector('.demo-fb-export'); const done = () => { if (ta) { ta.hidden = false; ta.value = text; ta.select(); } }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done); else done(); return; }
  });
  window.addEventListener('hashchange', () => { pendingVerdict = ''; if (open) render(); else render(); });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-ui-lang]')) setTimeout(render, 0); }, true);
  render();
  root.ICUDemoFeedback = {all, exportText, pageInfo};
})(typeof window !== 'undefined' ? window : globalThis);
