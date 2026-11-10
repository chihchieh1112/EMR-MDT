/* Patient-detail screen seam. Each screen owns its composition behind render(context). */
(function (root) {
  'use strict';
  const screens = Object.create(null);

  function register(name, render) {
    if (!name || typeof render !== 'function') throw Error('Invalid patient screen module format');
    screens[name] = render;
  }

  function render(name, context) {
    const screen = screens[name];
    if (!screen) return context.empty('This patient screen module has not been loaded.');
    return screen(context);
  }

  root.ICUPatientViews = {register, render, names: () => Object.keys(screens)};
})(globalThis);
