/* 設計系統說明頁（design-system.html）：色票、字級、圖示等由 tokens.css 的實際值產生，改 token 這頁就跟著變。 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const css = getComputedStyle(document.documentElement);
  const val = name => css.getPropertyValue(name).trim();
  const RAMPS = ['neutral', 'brand', 'lime', 'blue', 'amber', 'red', 'violet'];
  const STEPS = [25, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950];

  const ramps = $('#ds-ramps');
  if (ramps) {
    ramps.innerHTML = RAMPS.map(r => `<div class="ds-ramp"><b>${r}</b><div class="ds-ramp-row">${STEPS.map(s => {
      const v = val(`--${r}-${s}`);
      return `<div class="ds-swatch" title="--${r}-${s} ${v}"><span style="background:${v}"></span><small>${s}</small><code>${v}</code></div>`;
    }).join('')}</div></div>`).join('');
  }

  const sem = $('#ds-semantic');
  if (sem) {
    const names = ['--bg-canvas', '--bg-surface', '--bg-subtle', '--bg-muted', '--bg-selected', '--bg-inverse', '--text-primary', '--text-secondary', '--text-tertiary', '--text-link', '--border-subtle', '--border-default', '--border-control', '--color-primary', '--color-accent', '--color-focus'];
    sem.innerHTML = names.map(n => `<div class="ds-token"><span style="background:var(${n})"></span><code>${n}</code><small>${val(n)}</small></div>`).join('');
  }

  const tones = $('#ds-tones');
  if (tones) {
    tones.innerHTML = ['info', 'success', 'warning', 'danger', 'neutral', 'violet'].map(t => `<div class="ds-tone" style="background:var(--tone-${t}-bg);color:var(--tone-${t}-text);box-shadow:inset 0 0 0 1px var(--tone-${t}-border)"><b>${t}</b><span style="background:var(--tone-${t}-solid)"></span><code>${'--tone-' + t + '-*'}</code></div>`).join('');
  }

  const type = $('#ds-type');
  if (type) {
    const sizes = ['5', '4', '3', '2'].map(n => n + 'xl').concat(['xl', 'lg', 'base', 'md', 'sm', 'xs']);
    const sample = type.dataset.sample || '';
    type.innerHTML = sizes.map(s => `<div class="ds-type-row"><code>--text-${s}</code><small>${val('--text-' + s)}</small><span style="font-size:var(--text-${s})">${sample}</span></div>`).join('');
  }

  const space = $('#ds-space');
  if (space) {
    const steps = ['0-5', '1', '1-5', '2', '2-5', '3', '4', '5', '6', '8', '10', '12', '16'];
    space.innerHTML = steps.map(s => `<div class="ds-space-row"><code>--space-${s}</code><small>${val('--space-' + s)}</small><span style="width:var(--space-${s})"></span></div>`).join('');
  }

  const shape = $('#ds-shape');
  if (shape) {
    shape.innerHTML = ['xs', 'sm', 'md', 'lg', 'xl'].map(s => `<div class="ds-shape" style="border-radius:var(--radius-${s});box-shadow:var(--shadow-${s})"><code>--radius-${s}</code><code>--shadow-${s}</code><small>${val('--radius-' + s)}</small></div>`).join('');
  }

  const icons = $('#ds-icons');
  if (icons && window.ICUIcons) {
    icons.innerHTML = window.ICUIcons.names.map(n => `<div class="ds-icon">${window.ICUIcons.svg(n, {size: 22})}<code>${n}</code></div>`).join('');
  }

  // 元件區的互動：分段控制、頁籤、篩選鈕切換選取狀態；Toast 可重播。
  document.addEventListener('click', e => {
    const seg = e.target.closest('[data-ds-group]') && e.target.closest('a');
    if (seg) {
      e.preventDefault();
      seg.parentElement.querySelectorAll('a').forEach(a => a.classList.toggle('active', a === seg));
      return;
    }
    const replay = e.target.closest('[data-ds-toast]');
    if (replay) {
      const box = $('#message');
      const err = replay.dataset.dsToast === 'error';
      const text = replay.dataset.text || '';
      box.innerHTML = `<p class="notice toast ${err ? 'error' : 'success'}">${window.ICUIcons.svg(err ? 'alert-circle' : 'check-circle')}<span>${text}</span><button type="button" class="toast-close" data-toast-close>${window.ICUIcons.svg('x', {size: 16})}</button></p>`;
      box.querySelector('.toast-close').setAttribute('aria-label', replay.dataset.close || '');
      return;
    }
    const close = e.target.closest('[data-toast-close]');
    if (close) close.closest('.notice').remove();
  });
  const icon = (el) => { el.innerHTML = window.ICUIcons.svg(el.dataset.icon, {size: +(el.dataset.size || 18)}) + el.innerHTML; };
  document.querySelectorAll('[data-icon]').forEach(icon);
})();
