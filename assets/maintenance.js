/* 維護檔（2026-10-18）：掛在「Maintenance settings」檢視底下的子分頁。左清單右明細，篩選與選列走 hash 導覽，
   存檔一律送 store.dispatch。這支只組 HTML，不寫入；node 可 require 供驗證器渲染。 */
(function (root) {
  'use strict';
  const W = typeof module !== 'undefined' ? require('./workflow.js') : root.ICUWorkflow;
  const SEED = typeof module !== 'undefined' ? require('./staff-seed.js') : root.ICUStaffSeed;
  const clinical = () => typeof module !== 'undefined' ? require('./clinical.js') : root.ICUClinical;
  const taxonomy = () => typeof module !== 'undefined' ? require('./order-taxonomy.js') : root.ICUOrderTaxonomy;
  const SCHEMA = () => typeof module !== 'undefined' ? require('./master-schema.js') : root.ICUMasterSchema;
  const TZ = typeof module !== 'undefined' ? require('./timezone.js') : root.ICUTimeZone;
  const E = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const h = (c, d) => '#' + new URLSearchParams({...c.route, record: '', orderModal: '0', preview: '0', ...d}).toString();
  const PAGE = 20;
  const ROLE_LABEL = {doctor: 'Doctor', nurse: 'Nurse', admin: 'Administrator', allied: 'Allied health'};
  const clockDate = s => String(s.demoClock || '2026-08-31').slice(0, 10);

  // ---- 小工具：驗證器的最小 context 沒有 table／options，這裡自備 ----
  const opts = (entries, value) => entries.map(([v, t]) => `<option value="${E(v)}"${String(v) === String(value) ? ' selected' : ''}>${E(t)}</option>`).join('');
  const sel = (name, title, entries, value, extra = '') => `<label>${E(title)}<select name="${name}" ${extra}>${opts(entries, value)}</select></label>`;
  const txt = (name, title, value = '', extra = '', type = 'text') => `<label>${E(title)}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;
  // 勾選框前面放一個 value=0 的隱藏欄：沒勾也會送出，store 才分得出「取消勾選」與「沒送這欄」。
  const flag = (name, title, on) => `<label class="check"><input type="hidden" name="${name}" value="0"><input type="checkbox" name="${name}" value="1"${on ? ' checked' : ''}>${E(title)}</label>`;
  // 字典下拉（2026-10-23）：groups＝[[群組標題或 null, [[值, 顯示]]]]；大小寫不同視為同一值。存著不在字典的舊值時多列一個「（不在字典中）」讓人看見，存檔由 validate 擋下。
  const pick = (name, title, groups, value, required) => {
    const all = groups.flatMap(g => g[1]), raw = String(value ?? ''), hit = all.find(o => String(o[0]) === raw) || all.find(o => String(o[0]).toLowerCase() === raw.toLowerCase());
    const cur = hit ? hit[0] : raw, body = groups.map(([label, list]) => label ? `<optgroup label="${E(label)}">${opts(list, cur)}</optgroup>` : opts(list, cur)).join('');
    return `<label>${E(title)}<select name="${name}"${required ? ' required' : ''}><option value="">${required ? 'Select…' : '—'}</option>${raw && !hit ? `<option value="${E(raw)}" selected>${E(raw + ' (not in dictionary)')}</option>` : ''}${body}</select></label>`;
  };
  const tbl = (head, rows, cls = '') => rows.length
    ? `<div class="table-wrap"><table class="dense-table ${cls}"><thead><tr>${head.map(t => `<th scope="col">${E(t)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : '';
  const pill = (t, warn) => `<span class="pill${warn ? ' warning' : ''}">${E(t)}</span>`;

  // ---- 子分頁：之後的輪次往這裡加（favorites／drugs／orders／labs／dict） ----
  // 「我的簽名檔」每個帳號都有；基本設定 2026-11-08 拿掉（參數改由我方部署時設定）。
  function tabs(c) {
    const own = [['signature', 'My signature'], ['staff', 'Staff & permissions'], ['favorites', 'Department favorites'], ['flowsheet', 'Flowsheet items'], ['drugs', 'Drugs'], ['orders', 'Order items'], ['labs', 'Lab items'], ['dict', 'Dictionaries']];
    return own;
  }

  // ---- 通用 master-detail：工具列（篩選一列，新增鈕在右端）＋清單＋分頁｜右側明細 ----
  function masterDetail(c, o) {
    const r = c.route;
    const toolbar = `<form class="filter-row maint-filter" data-ui-form="masterFilter"><input type="hidden" name="tab" value="${E(r.tab)}">${o.filters}<button type="submit" class="secondary">Filter</button>${o.add ? `<span class="maint-add">${o.add}</span>` : ''}</form>`;
    const pages = Math.max(1, Math.ceil(o.total / PAGE)), page = Math.min(Math.max(0, Number(r.mpage) || 0), pages - 1);
    const rows = o.rows.slice(page * PAGE, page * PAGE + PAGE).map(x => `<tr data-open="${E(h(c, {mid: x.id, mtab: r.mtab || ''}))}"${x.selected ? ' class="is-selected" aria-current="true"' : ''}>${x.cells.map(v => `<td>${v}</td>`).join('')}</tr>`);
    const list = rows.length ? tbl(o.head, rows, 'maint-list') : `<div class="empty">${E(o.emptyText || 'No records match the filter.')}</div>`;
    const pager = `<div class="row between maint-pager"><span>${o.total} records${pages > 1 ? ` · page ${page + 1} / ${pages}` : ''}</span><span>${page > 0 ? `<a class="button secondary" href="${E(h(c, {mpage: String(page - 1)}))}">Previous</a>` : ''}${page < pages - 1 ? `<a class="button secondary" href="${E(h(c, {mpage: String(page + 1)}))}">Next</a>` : ''}</span></div>`;
    return `<div class="master-layout${o.layout ? ' ' + o.layout : ''}"><section class="card master-list">${toolbar}${list}${pager}</section><section class="card master-detail">${o.detail}</section></div>`;
  }

  // ---- 我的簽名檔（2026-10-28）：每個帳號只維護自己的；簽章時存當下的圖，之後換圖不回頭改已簽的文件 ----
  function mySignature(c) {
    const cur = c.actor && c.actor.signature;
    const shown = cur ? `<div class="signature-current"><img src="${E(cur.image)}" alt="My signature"><div class="source">Updated ${E(cur.updatedAt ? TZ.wall(Date.parse(cur.updatedAt)).replace('T', ' ') : '—')}</div></div>`
      : `<div class="empty">No signature image on file. Documents you sign show your name only.</div>`;
    const upload = c.form('signatureSave', `<label>Signature image (PNG or JPEG)<input type="file" accept="image/png,image/jpeg" data-signature-input></label><input type="hidden" name="image" value=""><div class="signature-preview" data-signature-preview></div>`, cur ? 'Replace signature' : 'Save signature');
    const remove = cur ? c.form('signatureSave', '', 'Remove signature', {remove: '1'}) : '';
    return `<section class="card my-signature"><h2>My signature</h2>${shown}${upload.replace('<button type="submit">', '<button type="submit" disabled>')}${remove}</section>`;
  }

  // ---- 員工與權限 ----
  const roleKey = who => who.role === 'doctor' && who.consultationOnly ? 'consult' : who.role;
  const roleText = who => who.role === 'doctor' && who.consultationOnly ? 'Doctor · consultation only' : ROLE_LABEL[who.role] || who.role;
  // 帳號狀態只有啟用／停用（2026-10-28 拿掉生效日與失效日）。
  const statusOf = who => who.status === 'disabled' ? ['Disabled', true] : ['Active', false];
  function departments(s) {
    const set = new Set(Object.values(s.people).map(x => x.department).filter(Boolean));
    (root.ICUOrderTaxonomy?.departments || []).forEach(([, name]) => set.add(name));
    return [...set].sort();
  }

  function staff(c) {
    const s = c.state, r = c.route, admin = c.actor.role === 'admin', clock = clockDate(s);
    const q = String(r.mq || '').trim().toLowerCase(), roleF = r.mrole || 'all', deptF = r.mdept || 'all', statusF = r.mstatus || 'all';
    const all = Object.entries(s.people).map(([id, who]) => ({id, who, status: statusOf(who)}))
      .sort((a, b) => (a.who.role === b.who.role ? 0 : a.who.role === 'admin' ? -1 : b.who.role === 'admin' ? 1 : a.who.role < b.who.role ? -1 : 1) || String(a.who.name).localeCompare(String(b.who.name)));
    const list = all.filter(x => (!q || [x.who.username, x.id, x.who.name, x.who.department, x.who.title, ...(x.who.licenses || []).map(l => l.number)].some(v => String(v || '').toLowerCase().includes(q)))
      && (roleF === 'all' || (roleF === 'consult' ? roleKey(x.who) === 'consult' : x.who.role === roleF && roleKey(x.who) !== 'consult'))
      && (deptF === 'all' || x.who.department === deptF)
      && (statusF === 'all' || (statusF === 'active' ? !x.status[1] : x.status[1])));
    const isNew = r.mid === 'new';
    const selectedId = s.people[r.mid] ? r.mid : (isNew ? '' : (list[0]?.id || ''));
    const filters = txt('mq', 'Search', r.mq || '', 'placeholder="Username, name, department"')
      + sel('mrole', 'Role', [['all', 'All roles'], ['doctor', 'Doctor'], ['consult', 'Consultant'], ['nurse', 'Nurse'], ['allied', 'Allied health'], ['admin', 'Administrator']], roleF)
      + sel('mdept', 'Department', [['all', 'All departments'], ...departments(s).map(d => [d, d])], deptF)
      + sel('mstatus', 'Status', [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']], statusF);
    const add = admin ? `<a class="button" href="${E(h(c, {mid: 'new', mtab: ''}))}">Add staff</a>` : '';
    const rows = list.map(x => ({id: x.id, selected: x.id === selectedId && !isNew, cells: [
      `<strong>${E(x.who.username || x.id)}</strong>`, E(x.who.name), E(roleText(x.who)), E(x.who.department || '—'),
      x.who.deptAdmin ? pill('Dept admin') : '—', licenseCell(s, x.id, x.who, clock), pill(x.status[0], x.status[1])]}));
    const detail = isNew ? staffDetail(c, null, '', admin) : selectedId ? staffDetail(c, s.people[selectedId], selectedId, admin) : `<div class="empty">Select a staff member on the left, or add one.</div>`;
    return masterDetail(c, {filters, add, head: ['Username', 'Name', 'Role', 'Department', 'Dept admin', 'Practice license', 'Status'], rows, total: list.length, detail, emptyText: 'No staff match the filter.'});
  }
  // 執業證（2026-10-24，B2）：清單顯示今天有效的證號；醫護沒有有效證時標 Missing／Expired，照樣可簽，簽章記為無證號。
  const licenseStatus = (l, clock) => l.validFrom > clock ? ['Not yet valid', true] : l.validTo && l.validTo < clock ? ['Expired', true] : ['Valid', false];
  function licenseCell(s, id, who, clock) {
    if (who.role === 'admin') return '—';
    const lic = W.licenseOf(s, id, clock);
    return lic ? E(lic.number) : pill((who.licenses || []).length ? 'Expired' : 'Not on file', true);
  }

  // 員工明細（2026-11-08 摘要在前）：帳號、執業證、照護關係三段；「Edit staff」展開表單。職稱、科別、專科改用下拉。
  const TITLES = ['Physician', 'Surgeon', 'Consultant', 'Resident', 'Registered nurse', 'Nurse', 'System administrator'];
  const uniqSorted = list => [...new Set(list.filter(Boolean))].sort((x, y) => x.localeCompare(y));
  function staffDetail(c, who, id, admin) {
    const s = c.state, clock = clockDate(s);
    if (!who) return headBlock('New staff account', pill('Not saved', true)) + staffEditForm(c, null, '', admin);
    const w = who, st = statusOf(w), lic = w.role === 'admin' ? null : W.licenseOf(s, id, clock), cur = (w.licenses || []).at(-1);
    const head = headBlock(E(w.name), pill(st[0], st[1]) + (w.deptAdmin ? pill('Dept admin') : ''), `<div class="source">${E((w.username || id) + ' · ' + roleText(w) + ' · ' + (w.department || 'No department'))}${w.createdAt ? E(' · created ' + String(w.createdAt).slice(0, 10) + (w.createdBy ? ' by ' + (s.people[w.createdBy]?.name || w.createdBy) : '')) : ''}${w.updatedAt ? E(' · updated ' + String(w.updatedAt).slice(0, 10) + (w.updatedBy ? ' by ' + (s.people[w.updatedBy]?.name || w.updatedBy) : '')) : ''}</div>`);
    const account = facts([['Username', E(w.username || id)], ['Role', E(roleText(w))], ['Title', w.title ? E(w.title) : NONE], ['Department', w.department ? E(w.department) : NONE], ['Specialty', w.specialty ? E(w.specialty) : NONE], ['Department administrator', w.deptAdmin ? 'Yes' : 'No']])
      + editBox(admin, 'Edit staff', staffEditForm(c, w, id, admin));
    const license = w.role === 'admin' ? '' : section('staff-license', 'Practice license', facts([['License number', lic ? E(lic.number) : pill(cur ? 'Expired' : 'Not on file', true)], ['Issued by', lic && lic.issuer ? E(lic.issuer) : NONE], ['Valid', lic ? E((lic.validFrom || '…') + ' → ' + (lic.validTo || '…')) : NONE]]) + licenseHistory(w, clock));
    const rel = (s.relationships || []).filter(x => x.actor === id && x.active);
    const care = section('staff-care', `Active care relationships (${rel.length})`, rel.length ? tbl(['Patient', 'Relationship'], rel.map(x => { const p = s.patients.find(y => y.id === x.p); return `<tr><td>${E(p ? p.bed + ' ' + p.name : x.p)}</td><td>${E(W.labels[x.role] || x.role)}</td></tr>`; })) : '<p class="maint-none">No active care relationships.</p>');
    return head + section('staff-account', 'Account', account) + license + care + (admin ? '' : '<div class="source">Read-only: only administrators can change staff accounts and permissions.</div>');
  }
  function staffEditForm(c, who, id, admin) {
    const s = c.state, isNew = !who, w = who || {role: 'doctor', status: 'active', patients: []}, people = Object.values(s.people);
    const withCur = (list, v) => uniqSorted([...list, v]).map(x => [x, x]);
    const depts = withCur(departments(s), w.department), specs = withCur([...people.map(p => p.specialty), ...departments(s).filter(d => d !== 'IT department')], w.specialty), titles = withCur([...TITLES, ...people.map(p => p.title)], w.title);
    const body = `<div class="form-grid maint-form">
      ${txt('username', 'Username', w.username || id, isNew ? 'required pattern="[A-Za-z][A-Za-z0-9_\\-]{1,15}" placeholder="e.g. D005"' : 'readonly')}
      ${txt('name', 'Display name', w.name || '', 'required')}
      ${sel('role', 'Role', [['doctor', 'Doctor'], ['nurse', 'Nurse'], ['admin', 'Administrator']], w.role)}
      ${sel('title', 'Title', [['', '—'], ...titles], w.title || '')}
      ${sel('department', 'Department', [['', 'Select…'], ...depts], w.department || '', 'required')}
      ${sel('specialty', 'Specialty', [['', '—'], ...specs], w.specialty || '')}
      ${sel('status', 'Account status', [['active', 'Active'], ['disabled', 'Disabled']], w.status || 'active')}
      ${w.role === 'admin' ? '' : licenseFields(w)}
      <div class="maint-flags">${flag('consultationOnly', 'Consultation-only doctor (replies to consults, does not write records or order)', !!w.consultationOnly)}${flag('deptAdmin', 'Department administrator (maintains this department\'s favorites)', !!w.deptAdmin)}</div>
    </div>`;
    return `<fieldset ${admin ? '' : 'disabled'}>${c.form('personSave', body, isNew ? 'Create account' : 'Save staff', {actor: isNew ? '' : id})}</fieldset>`;
  }
  // 現行一張可直接改；換號就新增一列，舊證留在歷程（G9 practitioner_qualification）。
  function licenseFields(w) {
    const cur = (w.licenses || []).at(-1) || {};
    return `<fieldset class="maint-license"><legend>Practice license</legend><div class="form-grid">${txt('licenseNumber', 'License number', cur.number || '', 'maxlength="32" placeholder="Leave empty if none on file"')}${txt('licenseIssuer', 'Issued by', cur.issuer || '')}${txt('licenseFrom', 'Valid from', cur.validFrom || '', '', 'date')}${txt('licenseTo', 'Valid to (leave empty if no end date)', cur.validTo || '', '', 'date')}</div><div class="source">Enter a different number to record a renewed license; the previous one stays in the history.</div></fieldset>`;
  }
  function licenseHistory(w, clock) {
    const list = w.licenses || [];
    if (w.role === 'admin' || !list.length) return w.role === 'admin' ? '' : '<h4>Practice license history</h4><div class="source">No practice license on file; signatures are recorded without a license number.</div>';
    return `<h4>Practice license history (${list.length})</h4>${tbl(['License number', 'Issued by', 'Valid from', 'Valid to', 'Status'], list.slice().reverse().map(l => { const st = licenseStatus(l, clock); return `<tr><td>${E(l.number)}</td><td>${E(l.issuer)}</td><td>${E(l.validFrom)}</td><td>${E(l.validTo || '—')}</td><td>${pill(st[0], st[1])}</td></tr>`; }), 'maint-rows')}`;
  }

  // ---- 科常用（部門的我的最愛） ----
  // 左：這個部門目前的清單（順序＝開單選單的順序），可上下移、移除；右：目錄搜尋，逐列加入。
  // 管理者可切部門；部門管理員固定自己的部門；其他人唯讀看自己部門。
  const KIND_LABEL = {medication: 'Medication', service: 'Service', lab: 'Lab', supply: 'Supply', diet: 'Diet'};
  function favorites(c) {
    const s = c.state, r = c.route, who = c.actor, admin = who.role === 'admin', C = clinical(), T = taxonomy();
    const depts = departments(s); if (!depts.includes('ICU')) depts.push('ICU'); if (who.department && !depts.includes(who.department)) depts.push(who.department);
    const dept = admin ? (r.mdept && r.mdept !== 'all' && depts.includes(r.mdept) ? r.mdept : (who.department && depts.includes(who.department) ? who.department : 'ICU')) : (who.department || 'Department not specified');
    const owner = 'dept:' + dept, canEdit = W.canMaintainDept(s, r.actor, dept);
    const saved = s.master && s.master.deptFavorite && s.master.deptFavorite[owner];
    const keys = T.favouriteKeys('department', s, r.actor, {department: dept});
    const kindOf = e => e.kind === 'service' && e.isLab ? 'lab' : e.kind;
    const act = (title, data, disabled, secondary) => canEdit ? c.act('masterSave', title, {table: 'deptFavorite', id: owner, ...data}, disabled, secondary) : '';
    const deptPick = admin
      ? `<form class="filter-row maint-filter" data-ui-form="masterFilter"><input type="hidden" name="tab" value="favorites">${sel('mdept', 'Department', depts.sort().map(d => [d, d]), dept)}<button type="submit" class="secondary">Show</button></form>`
      : `<div class="source">Department: ${E(dept)}${canEdit ? ' · you are a department administrator' : ' · read-only'}</div>`;
    const rows = keys.map((key, i) => { const e = C.entry(key); const name = e ? (e.zh || e.name) : key; return `<tr><td>${i + 1}</td><td><strong>${E(name)}</strong><div class="source">${E(e ? (e.kind === 'medication' ? [e.strength, 'Drug code ' + e.code, e.atc ? 'ATC ' + e.atc : ''].filter(Boolean).join(' · ') : 'Service code ' + e.code + (e.group ? ' · ' + e.group : '')) : 'Not in catalog')}</div></td><td>${e ? pill(KIND_LABEL[kindOf(e)] || e.kind) : pill('Missing', true)}</td><td class="maint-actions">${act('Up', {op: 'move', key, direction: -1}, i === 0, true)}${act('Down', {op: 'move', key, direction: 1}, i === keys.length - 1, true)}${act('Remove', {op: 'remove', key}, false, true)}</td></tr>`; });
    const listCard = `<section class="card master-list"><div class="row between"><h2>${E(dept)} favorites</h2>${pill(keys.length + ' / 100')}${saved ? pill('Saved list') : pill('Demo defaults · not saved yet', true)}</div>${deptPick}${rows.length ? tbl(['#', 'Item', 'Type', ''], rows, 'maint-list maint-fav') : `<div class="empty">No department favorites yet${canEdit ? '; add items from the catalog on the right.' : '.'}</div>`}${saved ? `<div class="source">Last saved ${E(String(saved.updatedAt || '').slice(0, 16).replace('T', ' '))} by ${E(s.people[saved.updatedBy]?.name || saved.updatedBy || '—')}</div>` : ''}</section>`;
    const kind = ['medication', 'service', 'lab', 'supply', 'diet'].includes(r.mkind) ? r.mkind : 'medication';
    const found = C.search(kind, r.mq || '', Number(r.mpage) || 0);
    const searchForm = `<form class="filter-row maint-filter" data-ui-form="masterFilter"><input type="hidden" name="tab" value="favorites"><input type="hidden" name="mdept" value="${E(dept)}">${txt('mq', 'Search catalog B', r.mq || '', 'placeholder="Name, code, ingredient, ATC"')}${sel('mkind', 'Kind', Object.entries(KIND_LABEL), kind)}<button type="submit" class="secondary">Search</button></form>`;
    const results = found.rows.map(e => { const inList = keys.includes(e.key); return `<tr><td><strong>${E(e.zh || e.name)}</strong><div class="source">${E(e.kind === 'medication' ? [e.strength, 'Drug code ' + e.code, e.ingredient ? 'Ingredient ' + e.ingredient : '', e.atc ? 'ATC ' + e.atc : ''].filter(Boolean).join(' · ') : 'Service code ' + e.code + (e.group ? ' · ' + e.group : ''))}</div></td><td>${e.active ? '' : pill('Inactive', true)}</td><td class="maint-actions">${canEdit ? c.act('masterSave', inList ? 'Added' : 'Add', {table: 'deptFavorite', id: owner, op: 'add', key: e.key}, inList || !e.active || keys.length >= 100, inList) : ''}</td></tr>`; });
    const pager = `<div class="row between maint-pager"><span>${found.count} items${found.pages > 1 ? ` · page ${found.page + 1} / ${found.pages}` : ''}</span><span>${found.page > 0 ? `<a class="button secondary" href="${E(h(c, {mpage: String(found.page - 1)}))}">Previous</a>` : ''}${found.page < found.pages - 1 ? `<a class="button secondary" href="${E(h(c, {mpage: String(found.page + 1)}))}">Next</a>` : ''}</span></div>`;
    const searchCard = `<section class="card master-detail"><h2>Add from catalog B</h2>${searchForm}${results.length ? tbl(['Item', '', ''], results, 'maint-list') : `<div class="empty">${r.mq ? 'No catalog items match.' : 'Type a keyword to search the catalog.'}</div>`}${pager}${canEdit ? '' : '<div class="source">Read-only: only this department\'s administrators or system administrators can change the list.</div>'}</section>`;
    return `<div class="master-layout">${listCard}${searchCard}</div>`;
  }

  // ---- 流程表項目（2026-10-31）：部門管理員勾選本科護理流程表要記錄的項目並排順序；ICU 預設整張 I-D-01-003，其他科預設基本生命徵象 ----
  function flowsheetItems(c) {
    const s = c.state, r = c.route, who = c.actor, admin = who.role === 'admin', FS = root.ICUFlowsheet || (typeof module !== 'undefined' ? require('./flowsheet.js') : null);
    const depts = ((s.settings && s.settings.departments) || []).map(d => d.name); if (who.department && !depts.includes(who.department)) depts.push(who.department);
    const dept = admin ? (r.mdept && depts.includes(r.mdept) ? r.mdept : depts[0] || 'ICU') : (who.department || 'Department not specified');
    const owner = 'dept:' + dept, canEdit = W.canMaintainDept(s, r.actor, dept), saved = s.master && s.master.deptFlowsheet && s.master.deptFlowsheet[owner];
    const chosen = FS.templateKeys(s, dept), order = k => chosen.indexOf(k);
    const deptPick = admin ? `<form class="filter-row maint-filter" data-ui-form="masterFilter"><input type="hidden" name="tab" value="flowsheet">${sel('mdept', 'Department', depts.map(d => [d, d]), dept)}<button type="submit" class="secondary">Show</button></form>` : `<div class="source">Department: ${E(dept)}${canEdit ? ' · you are a department administrator' : ' · read-only'}</div>`;
    const rows = FS.GROUPS.map(([g, title]) => { const list = FS.ITEMS.filter(i => i.group === g); return `<tr class="fs-group"><th colspan="3">${E(title)}</th></tr>` + list.map(i => `<tr><td><label class="check"><input type="checkbox" name="pick:${E(i.key)}" value="on"${order(i.key) >= 0 ? ' checked' : ''}${canEdit ? '' : ' disabled'}><span>${E(i.label)}</span></label></td><td data-no-i18n>${E(i.unit || '')}</td><td><input type="number" min="1" step="1" name="order:${E(i.key)}" value="${order(i.key) >= 0 ? order(i.key) + 1 : ''}" aria-label="Order"${canEdit ? '' : ' disabled'}></td></tr>`).join(''); }).join('');
    // 2026-11-08 摘要在前：先列已選的項目（依順序），「Edit items」才展開勾選表。
    const summary = chosen.length ? `<ol class="maint-chosen">${chosen.map(k => { const i = FS.ITEMS.find(x => x.key === k); return `<li>${E(i ? i.label : k)}${i && i.unit ? ` <span class="source" data-no-i18n>${E(i.unit)}</span>` : ''}</li>`; }).join('')}</ol>` : '<p class="maint-none">No items chosen.</p>';
    const form = canEdit ? editBox(true, 'Edit items', `<form data-ui-form="flowsheetItems" data-owner="${E(owner)}">${tbl(['Item', 'Unit', 'Order'], [rows], 'maint-list')}<button type="submit">Save flowsheet items</button></form>`) : '<div class="source">Read-only: only this department\'s administrators or system administrators can change it.</div>';
    return `<section class="card master-list"><div class="row between"><h2>${E(dept)} flowsheet items</h2>${pill(chosen.length + ' items')}${saved ? pill('Saved list') : pill('Default template · not saved yet', true)}</div>${deptPick}${summary}${form}</section>`;
  }

  // ---- 依表定義（master-schema.js）畫欄位、單列表單與多列面板：藥品明細與三個字典共用 ----
  const when = v => String(v || '').slice(0, 16).replace('T', ' ');
  // 能選就用選的（2026-11-08）：字典與清單欄是下拉；小範圍整數是下拉；指向藥品的欄位是可搜尋的挑選器；
  // 值依另一欄而定的（限制的值依限制類型）每種類型各一個欄位，只有對應的那個顯示並送出（data-show-when，app.js 切換）。
  const showWhen = (field, values, on, html) => html.replace(/^<label/, `<label data-show-when="${E(field)}=${E(values.join(','))}"${on ? '' : ' hidden'}`).replace(on ? /^$/ : /(<(?:select|input) )/, on ? '' : '$1disabled ');
  const pickText = e => e.code + ' · ' + (e.zh || e.name) + (e.ingredient ? ' (' + e.ingredient + ')' : '');
  function fieldInput(f, value, c, row) {
    const v = value ?? '', req = f.required ? 'required' : '';
    if (f.picker) { const cur = v ? clinical().entry(v) : null;
      return `<div class="catalog-pick" data-kind="${E(f.kind)}"><label>${E(f.label)}<input type="search" class="catalog-pick-q" placeholder="Search code, name or ingredient" autocomplete="off"></label><select name="${f.name}" size="6"${f.required ? ' required' : ''} aria-label="${E(f.label)}" data-no-i18n>${cur ? `<option value="${E(v)}" selected>${E(pickText(cur))}</option>` : ''}</select><span class="source">Type at least two letters, then choose one.</span></div>`; }
    if (f.choicesBy) {
      const by = String((row && row[f.choicesBy]) || ''), map = SCHEMA().restrictionChoices(c && c.state), LABEL = {role: 'Allowed role', department: 'Allowed department', specialty: 'Allowed specialty'};
      const listed = Object.keys(map), byDef = SCHEMA().tables[Object.keys(SCHEMA().tables).find(t => SCHEMA().tables[t].fields.includes(f))].fields.find(x => x.name === f.choicesBy);
      const textTypes = ['', ...byDef.options.map(o => o[0]).filter(t => !listed.includes(t))];
      return listed.map(t => showWhen(f.choicesBy, [t], by === t, pick(f.name, LABEL[t] || f.label, [[null, map[t]]], by === t ? v : '', true))).join('')
        + showWhen(f.choicesBy, textTypes, !listed.includes(by), txt(f.name, 'Approver or indication', listed.includes(by) ? '' : v, 'required placeholder="Who approves, or the required indication"'));
    }
    const choices = SCHEMA().fieldChoices(f, c && c.state, clinical());
    if (choices) return pick(f.name, f.label, choices, v, f.required);
    switch (f.type) {
      case 'bool': return flag(f.name, f.label, !!value);
      case 'enum': return sel(f.name, f.label, [['', '—'], ...f.options], v, req);
      case 'number': if (f.integer && f.min !== undefined && f.max !== undefined && f.max - f.min <= 10) return sel(f.name, f.label, [['', '—'], ...Array.from({length: f.max - f.min + 1}, (_, i) => [String(f.min + i), String(f.min + i)])], v, req);
        return txt(f.name, f.label, v, `${req} step="${f.integer ? '1' : 'any'}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}`, 'number');
      case 'date': return txt(f.name, f.label, v, req, 'date');
      case 'time': return txt(f.name, f.label, v, req, 'time');
      case 'catalogKey': return txt(f.name, f.label, v, `${req} placeholder="${f.kind === 'medication' ? 'Key or drug code, e.g. medication:50631 or 26ET19' : f.kind === 'supply' ? 'Supply key or code' : 'Catalog key or code'}"`);
      case 'keys': return txt(f.name, f.label, Array.isArray(value) ? value.join(',') : v, req);
      default: return (f.max && f.max > 200) ? `<label>${E(f.label)}<textarea name="${f.name}" ${req} rows="3">${E(v)}</textarea></label>` : txt(f.name, f.label, v, req);
    }
  }
  const fmtValue = (f, v) => f.choices && v ? ((f.choices.find(o => o[0] === v) || [])[1] ?? v) : f.type === 'bool' ? (v ? 'Yes' : '—') : f.type === 'enum' ? ((f.options.find(o => o[0] === v) || [])[1] ?? (v || '—')) : f.type === 'catalogKey' ? (v ? ((clinical().entry(v) || {}).zh || (clinical().entry(v) || {}).name || v) : '—') : (v === null || v === undefined || v === '' ? '—' : String(v));
  // ---- 摘要在前、按鈕展開表單（2026-11-08，從藥品明細推到所有維護明細）：每段先寫現值，管理者按段內的按鈕才展開表單；非管理者只看現值 ----
  const NONE = '<span class="muted">—</span>';
  const facts = list => `<dl class="maint-facts">${list.map(([t, v]) => `<div><dt>${E(t)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const editBox = (admin, label, body, open) => admin ? `<details class="maint-disclosure"${open ? ' open' : ''}><summary class="button secondary">${E(label)}</summary><div class="maint-row-edit">${body}</div></details>` : '';
  const section = (id, title, body) => `<section class="maint-section" id="${E(id)}"><h3>${E(title)}</h3>${body}</section>`;
  const headBlock = (title, pills, sub) => `<div class="maint-head"><div class="row between"><h2>${title}</h2><span class="maint-pills">${pills || ''}</span></div>${sub || ''}</div>`;
  const srcTitle = '<p class="maint-src-title">From HIS (read-only)</p>';
  // 依表定義列現值：清單欄顯示標籤、布林寫 Yes／No、空的寫 —；自由文字是資料，不翻譯。
  const valueOf = (f, v) => f.type === 'bool' ? (v ? 'Yes' : 'No') : !has(v) ? NONE : f.type === 'text' && !f.choices ? `<span data-no-i18n>${E(v)}</span>` : E(fmtValue(f, v));
  const rowFacts = (table, row, names) => facts(SCHEMA().tables[table].fields.filter(f => !names || names.includes(f.name)).map(f => [f.label, valueOf(f, row ? row[f.name] : null)]));
  // 一鍵一列的表（開立屬性、字典）：整張表單送 masterSave；only 可只放一部分欄位。
  // o.group（藥品明細，2026-11-08）：勾選框排成一列、生效／失效日收進最後一組，o.groups 可再分組；o.hidden 是一起送出的隱藏欄（第一次存檔帶 HIS 預設值）。
  const DATE_FIELDS = ['effective_from', 'effective_to'];
  function formFields(c, fields, row, o) {
    const input = f => fieldInput(f, row ? row[f.name] : undefined, c, row);
    const grid = list => { const bools = list.filter(f => f.type === 'bool'), rest = list.filter(f => f.type !== 'bool');
      return `<div class="form-grid maint-form">${rest.map(input).join('')}${bools.length ? `<div class="maint-flags">${bools.map(input).join('')}</div>` : ''}</div>`; };
    const dates = fields.filter(f => DATE_FIELDS.includes(f.name)), main = fields.filter(f => !DATE_FIELDS.includes(f.name));
    const groups = o.groups ? o.groups.map(([legend, names]) => [legend, main.filter(f => names.includes(f.name))]).filter(g => g[1].length) : [[null, main]];
    const used = new Set(groups.flatMap(g => g[1].map(f => f.name))), left = main.filter(f => !used.has(f.name));
    return groups.map(([legend, list]) => legend ? `<fieldset class="maint-group"><legend>${E(legend)}</legend>${grid(list)}</fieldset>` : grid(list)).join('') + (left.length ? grid(left) : '')
      + (dates.length ? `<fieldset class="maint-group maint-dates"><legend>Effective period (optional)</legend>${grid(dates)}</fieldset>` : '');
  }
  const hiddenInputs = obj => Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `<input type="hidden" name="${E(k)}" value="${E(v)}">`).join('');
  function keyedForm(c, table, id, row, canEdit, only, o) {
    const def = SCHEMA().tables[table], fields = def.fields.filter(f => !only || only.includes(f.name));
    const body = o && o.group ? hiddenInputs(o.hidden) + formFields(c, fields, row, o) : `<div class="form-grid maint-form">${fields.map(f => fieldInput(f, row ? row[f.name] : undefined, c)).join('')}</div>`;
    return `<fieldset ${canEdit ? '' : 'disabled'}>${c.form('masterSave', body, 'Save', {table, id})}</fieldset>${row && row.updatedAt ? `<div class="source">Updated ${E(when(row.updatedAt))} by ${E(c.state.people[row.updatedBy]?.name || row.updatedBy)}</div>` : ''}`;
  }
  // 多列的表（屬性、換算…）：列表＋新增表單；Edit 用 mrow 帶出那一列改。
  // o.add（藥品明細）：新增表單收在一顆按鈕後面（<details>），改某一列時自動展開；o.empty 是沒有資料時的一句話。
  function rowsPanel(c, table, parentField, parentValue, canEdit, columns, o) {
    o = o || {};
    const def = SCHEMA().tables[table], M = c.state.master || {};
    const rows = Object.entries(M[table] || {}).filter(([, r]) => r[parentField] === parentValue).sort((a, b) => String(a[1].createdAt || '').localeCompare(String(b[1].createdAt || '')));
    const show = def.fields.filter(f => f.name !== parentField);
    const editing = c.route.mrow && M[table] && M[table][c.route.mrow] && M[table][c.route.mrow][parentField] === parentValue ? c.route.mrow : '';
    const editRow = editing ? M[table][editing] : null;
    const cols = columns || show.map(f => [f.label, r => fmtValue(f, r[f.name])]);
    const list = rows.length ? tbl([...cols.map(x => x[0]), ''], rows.map(([id, r]) => `<tr${editing === id ? ' class="is-selected"' : ''}>${cols.map(x => `<td>${E(x[1](r))}</td>`).join('')}<td class="maint-actions">${canEdit ? `<a class="button secondary" href="${E(h(c, {mrow: id}))}">Edit</a>${c.act('masterRemove', 'Remove', {table, id}, false, true)}` : ''}</td></tr>`), 'maint-rows') : o.add ? `<p class="maint-none">${E(o.empty || 'None.')}</p>` : `<div class="empty">No ${E(def.label.toLowerCase())} recorded for this item.</div>`;
    if (!canEdit) return list;
    const cancel = editRow ? `<a class="button secondary" href="${E(h(c, {mrow: ''}))}">Cancel edit</a>` : '';
    if (!o.add) {
      const formBody = `<div class="form-grid maint-form"><input type="hidden" name="${parentField}" value="${E(parentValue)}">${show.map(f => fieldInput(f, editRow ? editRow[f.name] : undefined, c)).join('')}</div>`;
      return list + `<div class="maint-row-edit"><h4>${editRow ? 'Edit row' : 'Add row'}</h4>${c.form('masterSave', formBody, editRow ? 'Save row' : 'Add row', {table, id: editing || ''})}${cancel}</div>`;
    }
    const formBody = `<input type="hidden" name="${parentField}" value="${E(parentValue)}">` + formFields(c, show, editRow || o.defaults || null, o);
    return list + `<details class="maint-disclosure"${editRow ? ' open' : ''}><summary class="button secondary">${E(editRow ? 'Edit row' : o.add)}</summary><div class="maint-row-edit">${c.form('masterSave', formBody, editRow ? 'Save row' : 'Save', {table, id: editing || ''})}${cancel}</div></details>`;
  }

  // ---- 藥品維護檔：左清單（代碼、品名與成分、狀態）＋右明細 ----
  function drugs(c) {
    const s = c.state, r = c.route, admin = c.actor.role === 'admin', C = clinical(), T = taxonomy(), M = s.master || {};
    const q = String(r.mq || '').trim(), cat = r.mcat || 'all', statusF = r.mstatus || 'all';
    const supplyI = key => (M.medicationSupplyStatus || {})[key] || null;
    const stoppedHere = key => { const st = supplyI(key); return !!(st && st.status === 'stopped'); };
    const all = C.catalog.entries.filter(e => e.kind === 'medication' && (!q || C.matches(e.key, q)) && (cat === 'all' || String(e.atc || '').toUpperCase().startsWith(cat))
      && (statusF === 'all' || (statusF === 'active' ? (e.active && !stoppedHere(e.key)) : (!e.active || stoppedHere(e.key)))));
    const facets = (T.facets && T.facets().atc) || [];
    const filters = txt('mq', 'Search', q, 'placeholder="Code, name, ingredient, ATC"') + sel('mcat', 'ATC group', [['all', 'All ATC groups'], ...facets.map(f => [f.code, f.code + ' · ' + f.total])], cat) + sel('mstatus', 'Status', [['all', 'All'], ['active', 'Active'], ['inactive', 'Stopped / inactive']], statusF);
    const picked = C.entry(r.mid);
    const selectedId = picked && picked.kind === 'medication' ? r.mid : (all[0] ? all[0].key : '');
    // 2026-11-08：清單收成三欄；成分與 ATC 放品名下一行（最多兩行），是否已維護併進狀態欄。
    const rows = all.map(e => { const stopped = stoppedHere(e.key), inactive = !e.active || stopped, kept = !!(M.medicationKnowledge && M.medicationKnowledge[e.key]);
      const sub = [e.ingredient, e.atc].filter(Boolean).join(', ');
      return {id: e.key, selected: e.key === selectedId, cells: [`<strong>${E(e.code)}</strong>`, `<span class="drug-name">${E(e.zh || e.name)}</span>${sub ? `<span class="drug-sub" data-no-i18n>${E(sub)}</span>` : ''}`, `<span class="drug-status">${pill(inactive ? (stopped ? 'Stopped (inpatient)' : 'Inactive in B') : 'Active', inactive)}${kept ? pill('Maintained') : ''}</span>`]}; });
    const detail = selectedId ? drugDetail(c, selectedId, admin) : '<div class="empty">Select a medication on the left.</div>';
    return masterDetail(c, {filters, add: '', head: ['Code', 'Drug name', 'Status'], rows, total: all.length, detail, emptyText: 'No medications match the filter.', layout: 'drug-layout'});
  }
  // ---- 藥品明細（2026-11-08 重整）：不分頁籤，一頁由上而下六段（DRUG_SECTIONS）。每段先寫出開立時會發生什麼，
  //      管理者按段內的按鈕才展開表單；HIS 欄位只在表頭列一次。欄位取捨見 docs/reference/藥品維護欄位_標準對照.md。 ----
  function drugDetail(c, key, admin) {
    const s = c.state, C = clinical(), T = taxonomy(), S = SCHEMA(), M = s.master || {}, e = C.entry(key);
    const k = (M.medicationKnowledge || {})[key] || null, supply = (M.medicationSupplyStatus || {})[key] || null;
    const rowsOf = t => Object.values(M[t] || {}).filter(x => x.medication === key);
    const routeName = v => { const x = v && C.entry(v); return x ? x.code + ' ' + (x.zh || x.name) : ''; };
    const hisRoute = e.routeId ? (routeName('route:' + e.routeId) || e.routeCode || '') : '';
    const base = {order_unit_code: e.unit || '', decimal_places: 0, atc_source: 'HIS', atc_code: e.atc || '', default_route_code: e.routeId ? 'route:' + e.routeId : ''};
    const atcFields = ['atc_code', 'atc_source', 'atc_note'], limitFields = ['max_single_dose', 'max_daily_dose'];
    const orderFields = S.tables.medicationKnowledge.fields.map(f => f.name).filter(n => !atcFields.includes(n) && !limitFields.includes(n));
    const unit = (k && k.order_unit_code) || '';
    const none = NONE, edit = (label, body) => editBox(admin, label, body);
    const part = (id, body) => section('drug-' + id, S.DRUG_SECTIONS.find(x => x[0] === id)[1], body);
    const firstSave = k ? null : base; // 還沒維護過：哪一段先存，都帶 HIS 的單位與途徑一起建這一列
    const today = clockDate(s), live = !k || S.effectiveOn(k, today);
    const attrs = rowsOf('medicationAttribute').map(x => x.attribute_code).filter(code => S.ATTRIBUTE_TAGS[code]);
    const stopped = !!(supply && supply.status === 'stopped');

    // 表頭：品名、B 目錄狀態與已設定的標記；HIS 帶來的欄位一行，唯讀。
    const head = headBlock(E(e.zh || e.name), pill(e.active ? 'Active in B' : 'Inactive in B', !e.active) + (stopped ? pill('Stopped (inpatient)', true) : '') + attrs.map(code => pill(S.ATTRIBUTE_TAGS[code], code === 'A08')).join(''),
      (e.zh && e.zh !== e.name ? `<div class="source" data-no-i18n>${E(e.name)}</div>` : '') + srcTitle
      + facts([['Drug code', E(e.code)], ['Ingredient', e.ingredient ? `<span data-no-i18n>${E(e.ingredient)}</span>` : none], ['Strength', e.strength ? E(e.strength) : none], ['Unit', e.unit ? E(e.unit) : none], ['ATC', e.atc ? E(e.atc) : none], ['Route', hisRoute ? `<span data-no-i18n>${E(hisRoute)}</span>` : none]]));

    // 1 開立預設：途徑、頻率、醫囑單位、小數位、管灌／磨粉／剝半限制；生效期間管整列（含上限）。
    const freq = k && k.default_frequency_code ? (((M.frequency || {})[k.default_frequency_code] || {}).desc_en ? k.default_frequency_code + ' · ' + M.frequency[k.default_frequency_code].desc_en : k.default_frequency_code) : '';
    const limitsOn = k ? [['no_crush', 'Do not crush'], ['no_split', 'Do not split'], ['no_tube', 'Not for tube administration']].filter(([f]) => k[f]) : [];
    const ordering = (k ? '' : '<p class="source">Not maintained yet. Ordering starts from the HIS unit and has no limits.</p>')
      + (!live ? `<p class="notice warning">Not in effect on ${E(today)}: defaults, limits and flags below are not applied.</p>` : '')
      + facts([['Default route', k && k.default_route_code ? `<span data-no-i18n>${E(routeName(k.default_route_code) || k.default_route_code)}</span>` : none], ['Default frequency', freq ? E(freq) : none],
        ['Order unit', unit ? E(unit) : none], ['Decimal places', k && has(k.decimal_places) ? E(k.decimal_places) : none],
        ['Administration', limitsOn.length ? limitsOn.map(([, t]) => pill(t, true)).join('') : '<span class="muted">No limits</span>'],
        ...(k && (k.effective_from || k.effective_to) ? [['Effective period', E((k.effective_from || '…') + ' → ' + (k.effective_to || '…'))]] : [])])
      + edit('Edit ordering defaults', keyedForm(c, 'medicationKnowledge', key, k || base, admin, orderFields, {group: true, groups: [['Defaults', ['default_route_code', 'default_frequency_code', 'order_unit_code', 'decimal_places']], ['Administration', ['no_crush', 'no_split', 'no_tube']]]}));

    // 2 劑量上限：全體上限（醫囑單位）與每公斤上限（依體重／年齡區間）放在同一段。
    const perKg = rowsOf('medicationWeightDose');
    const limits = facts([['Max single dose', k && has(k.max_single_dose) ? E(k.max_single_dose + ' ' + unit) : none], ['Max daily dose', k && has(k.max_daily_dose) ? E(k.max_daily_dose + ' ' + unit) : none]])
      + edit('Edit overall limits', keyedForm(c, 'medicationKnowledge', key, k || base, admin, limitFields, {group: true, hidden: firstSave}))
      + '<h4>Per-kg limits' + (perKg.length ? `<span class="tab-count">${perKg.length}</span>` : '') + '</h4>'
      + rowsPanel(c, 'medicationWeightDose', 'medication', key, admin, WEIGHT_DOSE_COLUMNS, {group: true, add: 'Add per-kg band', empty: 'No per-kg limits.',
        groups: [['Applies to', ['weight_min_kg', 'weight_max_kg', 'age_min', 'age_max', 'age_unit']], ['Limit', ['dose_unit_code', 'max_single_per_kg', 'max_daily_per_kg', 'absolute_max_single', 'absolute_max_daily']]]});

    // 3 劑量換算：1 醫囑單位 = 係數 給藥單位。
    const conversion = rowsPanel(c, 'medicationDoseConversion', 'medication', key, admin, [['Conversion', r => '1 ' + r.order_unit_code + ' = ' + r.factor + ' ' + r.dispense_unit_code]], {group: true, add: 'Add conversion', empty: 'No conversions.', defaults: {order_unit_code: unit, dispense_unit_code: e.unit}});

    // 4 供應與限制：住院供應狀態、醫令限制、醫囑注意事項。
    const span = r => r.effective_from || r.effective_to ? (r.effective_from || '…') + ' → ' + (r.effective_to || '…') : '—';
    const STATUS = {normal: 'Normal', stopped: 'Stopped', restricted: 'Restricted'};
    const rules = facts([['Inpatient supply', supply ? pill(STATUS[supply.status] || supply.status, supply.status !== 'normal') : '<span class="muted">Normal</span>'],
        ['Default days', supply && has(supply.default_days) ? E(supply.default_days) : none], ['Max days per order', supply && has(supply.max_days) ? E(supply.max_days) : none],
        ...(supply && supply.message ? [['Message to prescriber', E(supply.message)]] : []), ...(supply && (supply.effective_from || supply.effective_to) ? [['Effective period', E(span(supply))]] : [])])
      + edit('Edit supply status', keyedForm(c, 'medicationSupplyStatus', key, supply, admin, null, {group: true}))
      + '<h4>Order restrictions</h4>' + rowsPanel(c, 'medicationOrderRestriction', 'medication', key, admin, [['Restriction', r => S.restrictionText(r)], ['Effective', span]], {group: true, add: 'Add restriction', empty: 'Anyone who can order may order this drug.'})
      + '<h4>Order notes</h4>' + rowsPanel(c, 'medicationCaution', 'medication', key, admin, [['Note', r => r.text], ['Effective', span]], {group: true, add: 'Add note', empty: 'No notes.'});

    // 5 標記：開立卡片標題會標示的屬性。
    const flags = rowsPanel(c, 'medicationAttribute', 'medication', key, admin, [['Flag', r => S.ATTRIBUTE_TAGS[r.attribute_code] || r.attribute_code], ['Note', r => r.note || '—']], {group: true, add: 'Add flag', empty: 'No flags.'});

    // 6 用藥安全分類與交互作用：ATC 一律用 HIS；HIS 沒有 ATC 才能在這裡補（2026-11-08）。
    const effAtc = S.effectiveAtc(s, key, e.atc), group = facetFor(T, effAtc), local = !!effAtc && effAtc !== String(e.atc || '');
    const level1 = group ? (SCHEMA().atcGroupName(s, group.major, root.ICUi18n && root.ICUi18n.lang ? root.ICUi18n.lang() : 'en') || group.majorLabel) : '';
    const safety = facts([['Effective ATC (medication safety)', effAtc ? E(effAtc) + (local ? ' ' + pill('Local ATC') : '') : none], ['ATC level 1', level1 ? `<span data-no-i18n>${E(level1)}</span>` : none], ['ATC group (3)', group ? E(group.code + ' · ' + group.total + ' drugs in catalog') : none]])
      + (e.atc ? '<p class="source">ATC comes from HIS. Report a wrong code to HIS.</p>' : edit('Fill in ATC', keyedForm(c, 'medicationKnowledge', key, k || base, admin, ['atc_code', 'atc_note'], {group: true, hidden: {...(firstSave || {}), atc_source: 'LOCAL'}})))
      + interactionRules({...e, atc: effAtc}) + '<h4>Maintained interactions (drug pair)</h4>' + rowsPanel(c, 'medicationInteraction', 'medication', key, admin, [['Interacting medication', r => { const x = C.entry(r.interacting_medication); return x ? (x.zh || x.name) : r.interacting_medication; }], ['Severity', r => fmtValue(S.tables.medicationInteraction.fields.find(f => f.name === 'severity'), r.severity)], ['Summary', r => r.description || '—']], {group: true, add: 'Add interaction', empty: 'No maintained interactions.'});

    return head + part('ordering', ordering) + part('limits', limits) + part('conversion', conversion) + part('rules', rules) + part('flags', flags) + part('interaction', safety)
      + (admin ? '' : '<div class="source">Read-only: only administrators maintain drug attributes. Catalog B fields are never edited here.</div>');
  }
  // 每公斤劑量上限（2026-10-18）：清單只列區間與上限摘要；下限含、上限不含。
  const has = v => v !== null && v !== undefined && v !== '';
  const AGE_UNIT = {d: 'days', mo: 'months', a: 'years'};
  const bandText = r => { const span = (lo, hi, u) => has(lo) && has(hi) ? lo + '–<' + hi + ' ' + u : has(lo) ? '≥ ' + lo + ' ' + u : '< ' + hi + ' ' + u;
    const parts = [has(r.age_min) || has(r.age_max) ? 'Age ' + span(r.age_min, r.age_max, AGE_UNIT[r.age_unit] || '') : '', has(r.weight_min_kg) || has(r.weight_max_kg) ? 'Weight ' + span(r.weight_min_kg, r.weight_max_kg, 'kg') : ''].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'All patients with a weight'; };
  const perKgText = (perKg, cap, unit, per) => [has(perKg) ? perKg + ' ' + unit + '/kg' + per : '', has(cap) ? 'cap ' + cap + ' ' + unit + per : ''].filter(Boolean).join(', ') || '—';
  const WEIGHT_DOSE_COLUMNS = [['Band', bandText], ['Per dose', r => perKgText(r.max_single_per_kg, r.absolute_max_single, r.dose_unit_code, '')], ['Per day', r => perKgText(r.max_daily_per_kg, r.absolute_max_daily, r.dose_unit_code, '/day')],
    ['Effective', r => [r.effective_from || '', r.effective_to || ''].some(Boolean) ? (r.effective_from || '…') + ' → ' + (r.effective_to || '…') : '—']];
  const facetFor = (T, code) => { if (!code || !T.facets) return null; const list = T.facets().atc || []; return list.find(f => f.code === code.slice(0, 3)) || null; };
  // 交互作用頁籤的唯讀部分：開立時用的規則集（drug-safety.js）裡牽涉到這個藥的藥理類別的規則。
  function interactionRules(e) {
    const RX = root.ICUDrugSafety || (typeof module !== 'undefined' ? require('./drug-safety.js') : null); if (!RX) return '';
    const mine = RX.classesOf(e);
    if (!mine.length) return '<h4>Rule-based interactions (read-only)</h4><div class="source">This drug\'s ATC code is not in any medication-safety class, so no class-level rules apply at ordering.</div>';
    const sev = s => RX.severityLabel ? RX.severityLabel(s) : s;
    const pairs = (RX.rules || []).filter(x => mine.includes(x.a) || mine.includes(x.b)).map(x => `<tr><td>${E(x.id)}</td><td>${E((RX.classes[x.a] || {}).label || x.a)} ↔ ${E((RX.classes[x.b] || {}).label || x.b)}</td><td>${pill(sev(x.severity), x.severity === 'high' || x.severity === 'contraindicated')}</td><td>${E(x.risk)}</td></tr>`);
    const conds = (RX.conditionRules || []).filter(x => mine.includes(x.drug)).map(x => `<tr><td>${E(x.id)}</td><td>${E((RX.classes[x.drug] || {}).label || x.drug)} × ${E((RX.conditionGroups[x.cond] || {}).label || x.cond)}</td><td>${pill(sev(x.severity), true)}</td><td>${E(x.risk)}</td></tr>`);
    return `<h4>Rule-based interactions (read-only)</h4><div class="source">Classes: ${E(mine.map(id => (RX.classes[id] || {}).label || id).join(', '))}. These rules belong to the medication-safety rule set used at ordering (S11) and are not edited per drug.</div>${pairs.length || conds.length ? tbl(['Rule', 'Pair / condition', 'Severity', 'Risk'], [...pairs, ...conds], 'maint-rows') : '<div class="source">No rules reference these classes.</div>'}`;
  }

  // ---- 字典：頻率（含住院服藥時間）、途徑、單位 ----
  function dict(c) {
    const s = c.state, r = c.route, admin = c.actor.role === 'admin', C = clinical(), M = s.master || {};
    const kindSel = v => sel('mkind', 'Dictionary', [['frequency', 'Frequency'], ['route', 'Route'], ['unit', 'Unit'], ['option', 'Clinical options'], ['atc', 'ATC groups'], ['codesystem', 'Code systems']], v);
    if (r.mkind === 'codesystem') return codeSystems(c, admin, kindSel('codesystem'));
    if (r.mkind === 'atc') return atcGroups(c, admin, kindSel('atc'));
    if (r.mkind === 'option') return clinicalOptions(c, admin, kindSel('option'));
    const kind = ['frequency', 'route', 'unit'].includes(r.mkind) ? r.mkind : 'frequency';
    const q = String(r.mq || '').trim().toLowerCase(), statusF = r.mstatus || 'all';
    let items;
    if (kind === 'frequency') items = Object.entries(M.frequency || {}).map(([id, row]) => ({id, code: id, name: row.desc_en, extra: row.fhir_timing_code ? 'FHIR ' + row.fhir_timing_code : (row.as_needed ? 'PRN' : ''), active: row.active !== false, row})).sort((a, b) => a.code.localeCompare(b.code));
    else items = C.catalog.entries.filter(e => e.kind === kind).map(e => { const row = (M[kind] || {})[e.key] || null; return {id: e.key, code: e.code, name: (row && row.desc_en) || e.zh || e.name, extra: e.name, active: e.active && !(row && row.active === false), row}; });
    const list = items.filter(x => (!q || [x.code, x.name, x.extra].some(v => String(v || '').toLowerCase().includes(q))) && (statusF === 'all' || (statusF === 'active' ? x.active : !x.active)));
    const isNew = kind === 'frequency' && r.mid === 'new';
    const selectedId = items.some(x => x.id === r.mid) ? r.mid : (isNew ? '' : (list[0] ? list[0].id : ''));
    const filters = kindSel(kind) + txt('mq', 'Search', r.mq || '', 'placeholder="Code or description"') + sel('mstatus', 'Status', [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']], statusF);
    const add = admin && kind === 'frequency' ? `<a class="button" href="${E(h(c, {mid: 'new', mrow: ''}))}">Add frequency</a>` : '';
    const rows = list.map(x => ({id: x.id, selected: x.id === selectedId && !isNew, cells: [`<strong>${E(x.code)}</strong>`, E(x.name || '—'), E(x.extra || ''), pill(x.active ? 'Active' : 'Inactive', !x.active), x.row ? pill('Maintained') : '—']}));
    let detail;
    if (kind === 'frequency') {
      if (isNew) detail = '<h2>New frequency</h2>' + newFrequencyForm(c, admin);
      else if (selectedId) { const row = M.frequency[selectedId];
        detail = headBlock(`<span data-no-i18n>${E(selectedId)}</span> · <span data-no-i18n>${E(row.desc_en || '')}</span>`, pill(row.active !== false ? 'Active' : 'Inactive', row.active === false), row.createdBy === 'seed' ? '<div class="source">Demo seed from the ordering frequency table; not hospital-approved.</div>' : '')
          + section('freq-def', 'Definition', rowFacts('frequency', row) + editBox(admin, 'Edit frequency', keyedForm(c, 'frequency', selectedId, row, admin, null, {group: true, groups: [['Description', ['desc_en', 'desc_vi', 'desc_zh']], ['Timing', ['fhir_timing_code', 'timing_frequency', 'timing_period', 'timing_period_unit', 'when_code', 'as_needed']], ['Use', ['is_long_term', 'extend_hours', 'his_times_per_day', 'active']]]})))
          + section('freq-times', 'Inpatient administration times', rowsPanel(c, 'frequencyAdminTime', 'frequency_code', selectedId, admin, [['Sequence', r => String(r.seq)], ['Dispense time', r => r.dispense_time || '—'], ['Administration time', r => r.admin_time || '—'], ['Non-medication execution time', r => r.nonmed_exec_time || '—']], {group: true, add: 'Add time', empty: 'No administration times.'}))
          + (admin ? `<div class="row maint-danger">${c.act('masterRemove', 'Delete this frequency', {table: 'frequency', id: selectedId}, false, true)}</div>` : ''); }
      else detail = '<div class="empty">Select a frequency, or add one.</div>';
    } else if (selectedId) { const e = C.entry(selectedId), row = (M[kind] || {})[selectedId];
      detail = headBlock(`${E(e.code)} · <span data-no-i18n>${E(e.zh || e.name)}</span>`, pill(e.active ? 'Active in B' : 'Inactive in B', !e.active), srcTitle + facts([['Catalog B code', E(e.code)], ['Name (VI)', `<span data-no-i18n>${E(e.name)}</span>`], ['Name (EN, source)', e.zh ? `<span data-no-i18n>${E(e.zh)}</span>` : NONE]]))
        + section(kind + '-local', 'Local attributes', (row ? '' : '<p class="maint-none">Not maintained yet.</p>') + rowFacts(kind, row || {active: true}) + editBox(admin, 'Edit local attributes', keyedForm(c, kind, selectedId, row || {active: true}, admin, null, {group: true})))
        + (admin ? '' : '<div class="source">Read-only: only administrators maintain dictionaries.</div>'); }
    else detail = '<div class="empty">Select an item.</div>';
    return masterDetail(c, {filters, add, head: ['Code', 'Description', 'Detail', 'Status', 'Local'], rows, total: list.length, detail, emptyText: 'No dictionary entries match.'});
  }
  // ---- 代碼表版本（2026-10-24，B3）：B 目錄快照唯讀；對應的衛生部或國際標準由管理者登錄，未確認前標 Unconfirmed（G9 code_system_version）----
  function codeSystems(c, admin, filters) {
    const s = c.state, r = c.route, S = SCHEMA(), M = s.master || {}, PUB = Object.fromEntries(S.PUBLISHERS);
    const items = S.CODE_SYSTEMS.map(([id, name]) => ({id, name, info: S.codeSystemInfo(clinical().catalog, id), row: (M.codeSystem || {})[id] || null}));
    const selectedId = items.some(x => x.id === r.mid) ? r.mid : items[0].id, x = items.find(i => i.id === selectedId);
    const pub = i => { const p = (i.row && i.row.publisher) || 'UNCONFIRMED'; return pill(PUB[p] || p, p === 'UNCONFIRMED'); };
    const rows = items.map(i => ({id: i.id, selected: i.id === selectedId, cells: [`<strong>${E(i.name)}</strong>`, E(i.info.version), E(String(i.info.rows)), pub(i), E((i.row && [i.row.standard_ref, i.row.standard_version].filter(Boolean).join(' · ')) || '—')]}));
    const files = x.info.files.map(f => `<tr><td>${E(f.file)}</td><td class="col-num">${E(String(f.rows))}</td><td><code>${E(String(f.sha256).slice(0, 16))}</code></td></tr>`);
    const detail = headBlock(E(x.name), pub(x))
      + section('cs-snapshot', 'Catalog B snapshot (read-only)', facts([['Snapshot version', E(x.info.version)], ['Rows in this snapshot', E(String(x.info.rows))]]) + tbl(['Source file', 'Rows', 'SHA-256 (first 16)'], files, 'maint-rows'))
      + section('cs-standard', 'Standard this code set follows', rowFacts('codeSystem', x.row || {publisher: 'UNCONFIRMED'}) + editBox(admin, 'Edit standard', keyedForm(c, 'codeSystem', x.id, x.row || {publisher: 'UNCONFIRMED'}, admin, null, {group: true})) + '<div class="source">Orders and diagnoses keep the snapshot version in force when they were entered.</div>');
    return masterDetail(c, {filters, add: '', head: ['Code system', 'Snapshot version', 'Rows', 'Publisher', 'Standard'], rows, total: items.length, detail});
  }
  // ---- 臨床選項（2026-10-24）：院內自訂選單（生產方式、哺餵方式、照護場所、疫苗）；病歷存代碼，所以只能停用不能刪 ----
  // ATC 群名（2026-11-01）：院方在這裡填中／越文群名，開立頁的藥理群篩選依介面語言顯示；一碼群預先帶 WHO 英文原名。
  function atcGroups(c, admin, kindFilter) {
    const s = c.state, r = c.route, S = SCHEMA(), M = s.master || {};
    const q = String(r.mq || '').trim().toLowerCase(), statusF = r.mstatus || 'all';
    const items = Object.entries(M.atcGroup || {}).map(([id, row]) => ({id, row, active: row.active !== false})).sort((a, b) => a.id.localeCompare(b.id));
    const list = items.filter(x => (!q || [x.id, x.row.name_en, x.row.name_vi, x.row.name_zh].some(v => String(v || '').toLowerCase().includes(q))) && (statusF === 'all' || (statusF === 'active' ? x.active : !x.active)));
    const isNew = r.mid === 'new', selectedId = items.some(x => x.id === r.mid) ? r.mid : (isNew ? '' : (list[0] ? list[0].id : ''));
    const filters = kindFilter + txt('mq', 'Search', r.mq || '', 'placeholder="Code or name"') + sel('mstatus', 'Status', [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']], statusF);
    const add = admin ? `<a class="button" href="${E(h(c, {mid: 'new', mrow: ''}))}">Add ATC group</a>` : '';
    const rows = list.map(x => ({id: x.id, selected: x.id === selectedId && !isNew, cells: [`<strong>${E(x.id)}</strong>`, `<span data-no-i18n>${E(x.row.name_en || '—')}</span>`, `<span data-no-i18n>${E(x.row.name_zh || '—')}</span>`, `<span data-no-i18n>${E(x.row.name_vi || '—')}</span>`, pill(x.active ? 'Active' : 'Inactive', !x.active)]}));
    let detail;
    if (isNew) {
      const def = S.tables.atcGroup, body = `<div class="form-grid maint-form">${txt('id', 'Code', '', 'required pattern="[A-Z]([0-9]{2})?" placeholder="e.g. J01"')}${def.fields.map(f => fieldInput(f, f.name === 'active' ? true : undefined, c)).join('')}</div>`;
      detail = `<h2>New ATC group</h2><fieldset ${admin ? '' : 'disabled'}>${c.form('masterSave', body, 'Create ATC group', {table: 'atcGroup'})}</fieldset>`;
    } else if (selectedId) {
      const row = M.atcGroup[selectedId];
      detail = headBlock(`<span data-no-i18n>${E(selectedId)}</span> · <span data-no-i18n>${E(row.name_en || '')}</span>`, pill(row.active !== false ? 'Active' : 'Inactive', row.active === false))
        + section('atc-names', 'Names', rowFacts('atcGroup', row, ['name_en', 'name_zh', 'name_vi', 'active']) + editBox(admin, 'Edit names', keyedForm(c, 'atcGroup', selectedId, row, admin, ['name_en', 'name_zh', 'name_vi', 'active'], {group: true})));
    } else detail = '<div class="empty">Select an ATC group, or add one.</div>';
    return masterDetail(c, {filters, add, head: ['Code', 'WHO name (EN)', 'Name (ZH)', 'Name (VI)', 'Status'], rows, total: list.length, detail, emptyText: 'No ATC groups match the filter.'});
  }
  function clinicalOptions(c, admin, kindFilter) {
    const s = c.state, r = c.route, S = SCHEMA(), M = s.master || {}, SETS = Object.fromEntries(S.CLINICAL_VALUE_SETS);
    const q = String(r.mq || '').trim().toLowerCase(), statusF = r.mstatus || 'all', setF = SETS[r.mcat] ? r.mcat : 'all';
    const items = Object.entries(M.clinicalOption || {}).map(([id, row]) => ({id, row, active: row.active !== false}))
      .sort((a, b) => String(a.row.value_set).localeCompare(String(b.row.value_set)) || (a.row.sort_order ?? 999) - (b.row.sort_order ?? 999) || a.id.localeCompare(b.id));
    const list = items.filter(x => (setF === 'all' || x.row.value_set === setF) && (!q || [x.id, x.row.desc_en, x.row.desc_vi, x.row.desc_zh].some(v => String(v || '').toLowerCase().includes(q))) && (statusF === 'all' || (statusF === 'active' ? x.active : !x.active)));
    const isNew = r.mid === 'new', selectedId = items.some(x => x.id === r.mid) ? r.mid : (isNew ? '' : (list[0] ? list[0].id : ''));
    const filters = kindFilter + sel('mcat', 'Option set', [['all', 'All option sets'], ...S.CLINICAL_VALUE_SETS], setF) + txt('mq', 'Search', r.mq || '', 'placeholder="Code or description"') + sel('mstatus', 'Status', [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']], statusF);
    const add = admin ? `<a class="button" href="${E(h(c, {mid: 'new', mrow: ''}))}">Add option</a>` : '';
    const rows = list.map(x => ({id: x.id, selected: x.id === selectedId && !isNew, cells: [`<strong>${E(x.id)}</strong>`, E(SETS[x.row.value_set] || x.row.value_set), `<span data-no-i18n>${E(x.row.desc_en || '—')}</span>`, E(x.row.desc_zh || '—'), pill(x.active ? 'Active' : 'Inactive', !x.active)]}));
    let detail;
    if (isNew) {
      const def = S.tables.clinicalOption, body = `<div class="form-grid maint-form">${txt('id', 'Code', '', 'required pattern="[A-Z][A-Z0-9_]{1,23}" placeholder="e.g. BM_WATER"')}${def.fields.map(f => fieldInput(f, f.name === 'active' ? true : f.name === 'value_set' && setF !== 'all' ? setF : undefined, c)).join('')}</div>`;
      detail = `<h2>New clinical option</h2><fieldset ${admin ? '' : 'disabled'}>${c.form('masterSave', body, 'Create option', {table: 'clinicalOption'})}</fieldset>`;
    } else if (selectedId) {
      const row = M.clinicalOption[selectedId];
      detail = headBlock(`<span data-no-i18n>${E(selectedId)}</span> · <span data-no-i18n>${E(row.desc_en || '')}</span>`, pill(row.active !== false ? 'Active' : 'Inactive', row.active === false))
        + section('opt-desc', 'Option', facts([['Option set', E(SETS[row.value_set] || row.value_set)]]) + rowFacts('clinicalOption', row, ['desc_en', 'desc_vi', 'desc_zh', 'sort_order', 'active']) + editBox(admin, 'Edit option', keyedForm(c, 'clinicalOption', selectedId, row, admin, ['desc_en', 'desc_vi', 'desc_zh', 'sort_order', 'active'], {group: true})));
    } else detail = '<div class="empty">Select an option, or add one.</div>';
    return masterDetail(c, {filters, add, head: ['Code', 'Option set', 'Description (EN)', 'Description (ZH)', 'Status'], rows, total: list.length, detail, emptyText: 'No options match the filter.'});
  }
  function newFrequencyForm(c, admin) {
    const def = SCHEMA().tables.frequency;
    const body = `<div class="form-grid maint-form">${txt('id', 'Code (uppercase letters / digits)', '', 'required pattern="[A-Z0-9]{1,16}" placeholder="e.g. Q36H"')}${def.fields.map(f => fieldInput(f, f.name === 'active' ? true : undefined, c)).join('')}</div>`;
    return `<fieldset ${admin ? '' : 'disabled'}>${c.form('masterSave', body, 'Create frequency', {table: 'frequency'})}</fieldset>`;
  }

  // ---- 醫令品項（service 非檢驗、衛材、飲食）與檢驗品項：來源欄唯讀，本地擴充可編 ----
  const CAT_LABEL = {lab: 'Lab tests', imaging: 'Exams', care: 'Care orders', other: 'Other'};
  function serviceItems(c, lab) {
    const s = c.state, r = c.route, admin = c.actor.role === 'admin', C = clinical(), T = taxonomy(), M = s.master || {};
    const q = String(r.mq || '').trim(), cat = r.mcat || 'all', statusF = r.mstatus || 'all', kind = ['service', 'supply', 'diet'].includes(r.mkind) ? r.mkind : 'service';
    const ext = e => (M.serviceExt || {})[e.key] || null;
    const all = C.catalog.entries.filter(e => (lab ? (e.kind === 'service' && e.isLab) : (e.kind === kind && !(e.kind === 'service' && e.isLab)))
      && (!q || C.matches(e.key, q)) && (cat === 'all' || (T.categoryOfEntry(e, s) || 'other') === cat)
      && (statusF === 'all' || (statusF === 'active' ? (e.active && T.isOrderable(e, s)) : (!e.active || !T.isOrderable(e, s)))));
    const cats = lab ? [] : [['lab', 'Lab tests'], ['imaging', 'Exams'], ['care', 'Care orders']];
    const filters = (lab ? '' : sel('mkind', 'Kind', [['service', 'Services'], ['supply', 'Supplies'], ['diet', 'Diet']], kind)) + txt('mq', 'Search', q, 'placeholder="Code, name, group"')
      + (lab ? '' : sel('mcat', 'Category', [['all', 'All categories'], ...cats], cat)) + sel('mstatus', 'Status', [['all', 'All'], ['active', 'Orderable'], ['inactive', 'Closed / inactive']], statusF);
    const picked = C.entry(r.mid);
    const selectedId = picked && (lab ? picked.kind === 'service' && picked.isLab : picked.kind === kind) ? r.mid : (all[0] ? all[0].key : '');
    const rows = all.map(e => { const x = ext(e), closed = !T.isOrderable(e, s); return {id: e.key, selected: e.key === selectedId, cells: [`<strong>${E(e.code)}</strong>`, `${E(T.displayName(e, s))}${x && x.name_en ? `<div class="source">${E(e.zh || e.name)}</div>` : ''}`, E(e.group || '—'), E(e.unit || '—'), lab ? E(C.labInfo(e.key, s).category) : E(CAT_LABEL[T.categoryOfEntry(e, s) || 'other'] + (x && x.order_category_override ? ' *' : '')), pill(!e.active ? 'Inactive in B' : closed ? 'Closed' : 'Orderable', !e.active || closed), (x || (lab && (M.labItem || {})[e.key])) ? pill('Maintained') : '—']}; });
    const detail = selectedId ? serviceDetail(c, selectedId, admin, lab) : '<div class="empty">Select an item on the left.</div>';
    return masterDetail(c, {filters, add: '', head: ['Code', 'Item name', 'Group', 'Unit', lab ? 'Lab category' : 'Category', 'Status', 'Local'], rows, total: all.length, detail, emptyText: 'No items match the filter.'});
  }
  // 醫令／檢驗明細（2026-11-08 摘要在前）：HIS 欄位一組唯讀；本地擴充、檢驗定義各一段，按鈕展開表單。
  function serviceDetail(c, key, admin, lab) {
    const s = c.state, C = clinical(), T = taxonomy(), M = s.master || {}, e = C.entry(key), x = (M.serviceExt || {})[key] || null, li = lab ? (M.labItem || {})[key] || null : null, info = lab ? C.labInfo(key, s) : null;
    const head = headBlock(E(T.displayName(e, s)), pill(e.active ? 'Active in B' : 'Inactive in B', !e.active) + (T.isOrderable(e, s) ? '' : pill('Closed for ordering', true)),
      srcTitle + facts([['Service code', E(e.code)], ['Name (VI)', `<span data-no-i18n>${E(e.name)}</span>`], ['Name (EN, source)', e.zh ? `<span data-no-i18n>${E(e.zh)}</span>` : NONE], ['Group', e.group ? `<span data-no-i18n>${E(e.group)}</span>` : NONE], ['Unit', e.unit ? E(e.unit) : NONE], ['Input code', e.inputCode ? E(e.inputCode) : NONE], ['Report code', e.reportCode ? E(e.reportCode) : NONE], ['Lab item', e.isLab ? 'Yes' : 'No']]));
    const ext = section('svc-ext', 'Local extension', facts([['Category (effective)', E(CAT_LABEL[T.categoryOfEntry(e, s) || 'other']) + (x && x.order_category_override ? ' ' + pill('Override') : '')]]) + rowFacts('serviceExt', x || {is_orderable: true})
      + editBox(admin, 'Edit local extension', keyedForm(c, 'serviceExt', key, x || {is_orderable: true}, admin, null, {group: true})));
    const def = li || {lab_category: info && info.category, specimen_code: info && info.specimen};
    const labPart = lab ? section('svc-lab', 'Lab definition', (info.maintained ? '' : '<p class="maint-none">From the built-in demo mapping; edit to override.</p>') + rowFacts('labItem', def) + editBox(admin, 'Edit lab definition', keyedForm(c, 'labItem', key, def, admin, null, {group: true}))) : '';
    return head + ext + labPart + (admin ? '' : '<div class="source">Read-only: only administrators maintain order and lab items. Catalog B fields are never edited here.</div>');
  }

  function render(c, tab) {
    if (tab === 'signature') return mySignature(c);
    if (tab === 'staff') return staff(c);
    if (tab === 'favorites') return favorites(c);
    if (tab === 'flowsheet') return flowsheetItems(c);
    if (tab === 'drugs') return drugs(c);
    if (tab === 'orders') return serviceItems(c, false);
    if (tab === 'labs') return serviceItems(c, true);
    if (tab === 'dict') return dict(c);
    return `<div class="empty">Unknown maintenance section.</div>`;
  }

  const api = {tabs, render, masterDetail, statusOf, helpers: {E, h, sel, txt, flag, tbl, pill, opts}};
  if (typeof module !== 'undefined') module.exports = api; else root.ICUMaintenance = api;
})(typeof window !== 'undefined' ? window : globalThis);
