/**
 * CSP-safe event wiring. Replaces onclick/onchange/oninput/onerror attributes.
 * data-act="fn" + data-arg / data-arg2 / data-arg3 / data-el / data-event
 * data-stop, data-prevent, data-before, data-then
 * Image fallbacks: data-fallback or data-img-fallback + data-fallback-cat/id
 */
(function (global) {
  function lookup(name) {
    if (!name) return null;
    return String(name).split('.').reduce(function (obj, key) {
      return obj == null ? obj : obj[key];
    }, global);
  }

  function coerce(s) {
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (s === '') return '';
    if (/^-?\d+$/.test(s)) return Number(s);
    if (/^-?\d+\.\d+$/.test(s)) return Number(s);
    return s;
  }

  function resolveArgs(el, ev) {
    const raw = el.getAttribute('data-args');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return parsed.map(function (v) {
          if (v === '$el') return el;
          if (v === '$value') return el.value;
          if (v === '$event') return ev;
          return v;
        });
      } catch {
        /* fall through */
      }
    }
    const args = [];
    const a1 = el.getAttribute('data-arg');
    const a2 = el.getAttribute('data-arg2');
    const a3 = el.getAttribute('data-arg3');
    if (el.hasAttribute('data-el-first')) args.push(el);
    if (a1 !== null) args.push(coerce(a1));
    if (a2 !== null) args.push(coerce(a2));
    if (a3 !== null) args.push(coerce(a3));
    if (el.hasAttribute('data-el') && !el.hasAttribute('data-el-first')) args.push(el);
    if (el.hasAttribute('data-value')) args.push(el.value);
    if (el.hasAttribute('data-event')) args.push(ev);
    return args;
  }

  function callNamed(name, el, ev) {
    const fn = lookup(name);
    if (typeof fn !== 'function') return;
    fn.apply(el, resolveArgs(el, ev));
  }

  function runAction(el, ev, actAttr) {
    const act = el.getAttribute(actAttr || 'data-act');
    if (el.hasAttribute('data-stop') || (el.closest && el.closest('[data-stop]'))) ev.stopPropagation();
    if (el.hasAttribute('data-prevent') || (el.closest && el.closest('[data-prevent]'))) ev.preventDefault();
    const before = el.getAttribute('data-before');
    if (before) {
      const pre = lookup(before);
      if (typeof pre === 'function') pre.call(el);
    }
    if (act) callNamed(act, el, ev);
    const then = el.getAttribute('data-then');
    if (then) {
      const post = lookup(then);
      if (typeof post === 'function') post.call(el);
    }
  }

  function shouldHandle(el, type) {
    const on = el.getAttribute('data-on');
    if (on) return on === type;
    const tag = el.tagName;
    if (tag === 'SELECT') return type === 'change';
    if (tag === 'TEXTAREA') return type === 'input';
    if (tag === 'INPUT') {
      const t = String(el.type || '').toLowerCase();
      if (t === 'file' || t === 'checkbox' || t === 'radio') return type === 'change';
      return type === 'input';
    }
    return type === 'click';
  }

  function closestAct(target, attr) {
    if (!target || !target.closest) return null;
    return target.closest('[' + attr + '], [data-stop], [data-prevent]');
  }

  function onDelegated(type) {
    return function (ev) {
      const el = closestAct(ev.target, type === 'mousedown' ? 'data-act-mousedown' : 'data-act');
      if (!el) return;
      if (type === 'mousedown') {
        if (!el.hasAttribute('data-act-mousedown')) return;
        runAction(el, ev, 'data-act-mousedown');
        return;
      }
      if (!el.hasAttribute('data-act') && !el.hasAttribute('data-stop') && !el.hasAttribute('data-prevent')) return;
      if (el.hasAttribute('data-act') && !shouldHandle(el, type) && type !== 'click') return;
      if (el.hasAttribute('data-act') && !shouldHandle(el, type) && type === 'click') return;
      if (!el.hasAttribute('data-act') && type !== 'click') return;
      runAction(el, ev, 'data-act');
    };
  }

  document.addEventListener('click', onDelegated('click'));
  document.addEventListener('change', onDelegated('change'));
  document.addEventListener('input', onDelegated('input'));
  document.addEventListener('mousedown', onDelegated('mousedown'));

  document.addEventListener('error', function (ev) {
    const el = ev.target;
    if (!el || el.tagName !== 'IMG') return;
    const fallback = el.getAttribute('data-fallback');
    if (fallback) {
      el.removeAttribute('data-fallback');
      el.src = fallback;
      return;
    }
    if (el.hasAttribute('data-img-fallback') && typeof global.imgFallback === 'function') {
      el.removeAttribute('data-img-fallback');
      global.imgFallback(el, el.getAttribute('data-fallback-cat') || '', el.getAttribute('data-fallback-id'));
    }
  }, true);

  function tlToggleOn(el) {
    (el || this).classList.toggle('on');
  }

  function tlReload() {
    location.reload();
  }

  function toggleActivePlaceSave(el) {
    const node = el || this;
    if (global.activePlace && typeof global.toggleSave === 'function') {
      global.toggleSave(global.activePlace.id, node);
    }
  }

  global.tlToggleOn = tlToggleOn;
  global.tlReload = tlReload;
  global.toggleActivePlaceSave = toggleActivePlaceSave;
  global.TL_BIND = { lookup: lookup, runAction: runAction };
})(typeof window !== 'undefined' ? window : globalThis);
