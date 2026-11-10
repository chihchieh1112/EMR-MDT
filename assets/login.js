/* 員工登入（示範）：沒有院方認證服務。S01 §4 狀態轉移本輪簡化為單一步驟——
   未認證 → 驗證中 → 進入工作區；工作站識別與 OTP 已於 2026-09-13 移除（見 S01 §8 待決）。
   密碼只留在記憶體，不寫入 localStorage、網址或任何紀錄；登入成功只把角色帶進 index.html 的 hash。
   失敗計數與鎖定是「展示用防呆」，純前端、可被繞過，正式防暴力嘗試須由認證服務實作。 */
(function () {
  'use strict';
  // 帳號來源（2026-10-18）：優先讀這台瀏覽器儲存的員工名單（維護檔新增、停用的員工都在裡面），讀不到才退回 staff-seed.js 的種子。
  // 密碼任意非空；不宣稱真實身分驗證。停用或不在生效期的帳號不能登入，也不列在示範帳號表。
  const SEED = window.ICUStaffSeed || {STORAGE_KEY: 'icu-day-v2', people: {}, isActive: () => true};
  function loadPeople() {
    let stored = null;
    try { const raw = window.localStorage.getItem(SEED.STORAGE_KEY); if (raw) { const v = JSON.parse(raw); if (v && v.schema === 1 && v.people) stored = v; } } catch (e) { stored = null; }
    const people = stored ? stored.people : SEED.people;
    const clock = stored && stored.demoClock ? String(stored.demoClock).slice(0, 10) : window.ICUTimeZone.wall(Date.now()).slice(0, 10);
    const out = {};
    for (const [actor, who] of Object.entries(people)) {
      if (!SEED.isActive(who, clock)) continue;
      const username = String(who.username || actor).toUpperCase();
      out[username] = {actor, name: who.name, shift: who.shift || ''};
    }
    return out;
  }
  const ACCOUNTS = loadPeople();
  // 嘗試上限與鎖定秒數：2026-09-13 使用者決定，覆蓋 S01 §5「由院方設定」；院方核定前為暫定值。
  const MAX_ATTEMPTS = 3, LOCK_SECONDS = 30;
  const KEY_USER = 'icu-login-username', KEY_LOCK = 'icu-login-lock';

  const $ = id => document.getElementById(id);
  let storage = null; try { storage = window.localStorage; } catch (e) { storage = null; }
  const get = k => { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } };
  const set = (k, v) => { try { if (!storage) return; if (v === null) storage.removeItem(k); else storage.setItem(k, v); } catch (e) { /* 儲存不可用時靜默略過 */ } };
  // 鎖定狀態放 sessionStorage：重整頁面不會立刻歸零，但仍是前端狀態，清瀏覽器資料即失效。
  let session = null; try { session = window.sessionStorage; } catch (e) { session = null; }
  const readLock = () => { try { return session ? JSON.parse(session.getItem(KEY_LOCK) || 'null') : null; } catch (e) { return null; } };
  const writeLock = v => { try { if (!session) return; if (v === null) session.removeItem(KEY_LOCK); else session.setItem(KEY_LOCK, JSON.stringify(v)); } catch (e) { /* 略過 */ } };

  const form = $('login-form'), alertBox = $('login-alert'), submit = $('submit'), lockTimer = $('lock-timer');
  let failures = 0, busy = false, lockInterval = null;

  // 記住帳號（不記密碼）
  const remembered = get(KEY_USER);
  if (remembered) { $('username').value = remembered; $('remember').checked = true; }

  // 示範帳號表：點帳號直接填入
  $('demo-account-rows').innerHTML = Object.entries(ACCOUNTS).map(([id, a]) => `<tr><td><button type="button" class="link" data-fill="${id}">${id}</button></td><td>${a.name}</td><td>${a.shift}</td></tr>`).join('');
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-fill]');
    if (!b) return;
    if (isLocked()) return;
    $('username').value = b.dataset.fill;
    $('password').focus();
  });

  // 顯示／隱藏密碼
  $('toggle-password').addEventListener('click', () => {
    const input = $('password'), show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    const btn = $('toggle-password');
    btn.setAttribute('aria-pressed', String(show));
    btn.textContent = show ? 'Hide' : 'Show';
    input.focus();
  });

  function fieldError(id, message) {
    const input = $(id), box = $(id + '-error');
    if (message) { input.classList.add('is-invalid'); input.setAttribute('aria-invalid', 'true'); box.textContent = message; box.hidden = false; }
    else { input.classList.remove('is-invalid'); input.removeAttribute('aria-invalid'); box.textContent = ''; box.hidden = true; }
  }
  function showAlert(message, kind) {
    alertBox.textContent = message || '';
    alertBox.className = 'alert' + (kind === 'info' ? ' info' : '');
    alertBox.hidden = !message;
  }
  function setBusy(button, on, label) {
    busy = on;
    button.disabled = on;
    button.classList.toggle('is-busy', on);
    if (on) { button.dataset.label = button.textContent; button.textContent = label; }
    else if (button.dataset.label) { button.textContent = button.dataset.label; delete button.dataset.label; }
  }

  function resolveAccount(raw) {
    const key = String(raw || '').trim();
    return ACCOUNTS[key.toUpperCase()] || byActor[key.toLowerCase()] || null;
  }

  /* ---- 鎖定 ---- */
  const isLocked = () => { const l = readLock(); return !!(l && l.until > Date.now()); };

  function setInputsDisabled(on) {
    ['username', 'password', 'remember', 'toggle-password'].forEach(id => { $(id).disabled = on; });
    submit.disabled = on;
  }

  // 倒數文字不放在 role="alert" 裡，避免每秒重播給螢幕報讀軟體。
  function renderCountdown() {
    const l = readLock(), left = l ? Math.ceil((l.until - Date.now()) / 1000) : 0;
    if (left <= 0) { unlock(); return; }
    lockTimer.hidden = false;
    lockTimer.textContent = `Try again in ${left}s`;
  }

  function lock() {
    const until = Date.now() + LOCK_SECONDS * 1000;
    writeLock({attempts: MAX_ATTEMPTS, until});
    setInputsDisabled(true);
    $('password').value = '';
    showAlert(`Too many failed attempts. Sign-in is locked for ${LOCK_SECONDS} seconds. If you do not know your password, contact the IT Service Desk.`);
    renderCountdown();
    if (lockInterval) window.clearInterval(lockInterval);
    lockInterval = window.setInterval(renderCountdown, 1000);
  }

  function unlock() {
    if (lockInterval) { window.clearInterval(lockInterval); lockInterval = null; }
    writeLock(null);
    failures = 0;
    lockTimer.hidden = true;
    lockTimer.textContent = '';
    setInputsDisabled(false);
    showAlert('You can try signing in again.', 'info');
    $('username').focus();
  }

  // 重整頁面後接續未走完的鎖定
  (function restoreLock() {
    const l = readLock();
    if (!l) return;
    if (l.until > Date.now()) {
      failures = MAX_ATTEMPTS;
      setInputsDisabled(true);
      showAlert(`Too many failed attempts. Sign-in is locked. If you do not know your password, contact the IT Service Desk.`);
      renderCountdown();
      lockInterval = window.setInterval(renderCountdown, 1000);
    } else { writeLock(null); }
  })();

  /* ---- 送出 ---- */
  // 失敗訊息不透露帳號是否存在；帳號不存在與密碼錯誤同樣計入次數，計數本身也不洩漏帳號存在與否。
  function submitCredentials() {
    if (isLocked()) return;
    const username = $('username').value.trim(), password = $('password').value;
    fieldError('username', username ? '' : 'Enter your username');
    fieldError('password', password ? '' : 'Enter your password');
    showAlert('');
    if (!username || !password) { (username ? $('password') : $('username')).focus(); return; }
    setBusy(submit, true, 'Verifying...');
    window.setTimeout(() => {
      const account = resolveAccount(username);
      setBusy(submit, false);
      $('password').value = '';
      if (!account) {
        failures += 1;
        if (failures >= MAX_ATTEMPTS) { lock(); return; }
        const left = MAX_ATTEMPTS - failures;
        showAlert(`Username or password verification failed. ${left} ${left === 1 ? 'attempt' : 'attempts'} remaining.`);
        $('password').focus();
        return;
      }
      failures = 0;
      writeLock(null);
      set(KEY_USER, $('remember').checked ? username : null);
      enter(account.actor);
    }, 650);
  }

  function enter(actor) {
    if (!actor) return;
    try { window.sessionStorage.setItem('icu-login', JSON.stringify({actor, at: new Date().toISOString(), source: 'Demo sign-in, not real authentication'})); } catch (e) { /* 忽略 */ }
    showAlert('Signed in. Opening the workstation...', 'info');
    window.location.href = 'index.html#' + new URLSearchParams({view: 'home', actor}).toString();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (busy || isLocked()) return;
    submitCredentials();
  });
  $('username').addEventListener('input', () => fieldError('username', ''));
  $('password').addEventListener('input', () => fieldError('password', ''));
})();
