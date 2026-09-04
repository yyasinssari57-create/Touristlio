/**
 * Responsive <img> helpers: WebP srcset for Unsplash + /uploads, lazy by default.
 * Homepage hero is CSS (eager via preload); all other images use loading="lazy".
 */
(function (global) {
  const WIDTHS = [480, 800, 1080];
  const DIMS = {
    card: { width: 400, height: 300 },
    detail: { width: 1200, height: 800 },
    thumb: { width: 96, height: 72 },
    avatar: { width: 48, height: 48 },
    hero: { width: 1920, height: 1080 },
  };

  function safeUrl(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s) && !/^javascript:/i.test(s)) return s;
    if (s.startsWith('/') && !s.startsWith('//')) return s;
    return '';
  }

  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function unsplashSrcset(url) {
    try {
      const u = new URL(url);
      if (!/images\.unsplash\.com$/i.test(u.hostname)) return '';
      const photo = `${u.origin}${u.pathname}`;
      return WIDTHS.map((w) => `${photo}?auto=format&fit=crop&w=${w}&q=80&fm=webp ${w}w`).join(', ');
    } catch {
      return '';
    }
  }

  function localSrcset(url) {
    const [pathPart, query] = url.split('?');
    if (!/\.(jpe?g|png|webp)$/i.test(pathPart)) return '';
    if (/-\d+w\.(jpe?g|png|webp)$/i.test(pathPart)) return '';
    const q = query ? `?${query}` : '';
    const stem = pathPart.replace(/\.(jpe?g|png|webp)$/i, '');
    return `${stem}-480w.webp${q} 480w, ${stem}-800w.webp${q} 800w, ${pathPart}${q} 1080w`;
  }

  function srcset(url) {
    const u = safeUrl(url);
    if (!u) return '';
    if (/images\.unsplash\.com/i.test(u)) return unsplashSrcset(u);
    if (u.startsWith('/uploads/')) return localSrcset(u);
    if (/supabase\.co\/storage\/v1\/object\/public\//i.test(u)) return localSrcset(u);
    if (/\/images\/hero(\.webp)?/i.test(u)) return localSrcset(u.replace(/\/images\/hero$/i, '/images/hero.webp'));
    return '';
  }

  function defaultSizes(kind) {
    if (kind === 'hero' || kind === 'detail') return '100vw';
    if (kind === 'card') return '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px';
    if (kind === 'thumb') return '96px';
    if (kind === 'avatar') return '48px';
    return '(max-width: 640px) 100vw, 1080px';
  }

  function dimsFor(kind, o) {
    if (o && o.width && o.height) return { width: Number(o.width), height: Number(o.height) };
    return DIMS[kind] || null;
  }

  function cardAlt(raw, kind) {
    const a = String(raw || '').trim();
    if (kind === 'card') {
      if (!a) return 'Touristlio';
      if (/touristlio/i.test(a)) return a;
      return a + ' — Touristlio';
    }
    return a;
  }

  function tag(url, opts) {
    const o = opts || {};
    const src = safeUrl(url);
    if (!src) return '';
    const loading = o.eager ? 'eager' : 'lazy';
    const alt = escapeAttr(cardAlt(o.alt, o.kind));
    const cls = o.className ? ` class="${escapeAttr(o.className)}"` : '';
    const extra = o.extra ? ` ${o.extra}` : '';
    const ss = o.srcset === false ? '' : srcset(src);
    const sizes = ss ? (o.sizes || defaultSizes(o.kind)) : '';
    const dim = dimsFor(o.kind, o);
    let html = `<img src="${escapeAttr(src)}" alt="${alt}" loading="${loading}" decoding="async"${cls}`;
    if (dim) html += ` width="${dim.width}" height="${dim.height}"`;
    if (ss) html += ` srcset="${escapeAttr(ss)}" sizes="${escapeAttr(sizes)}"`;
    html += `${extra}/>`;
    return html;
  }

  function applyTo(el, url, opts) {
    if (!el) return;
    const o = opts || {};
    const src = safeUrl(url);
    el.src = src;
    if (o.alt != null) el.alt = cardAlt(o.alt, o.kind || el.dataset.imgKind);
    el.loading = o.eager ? 'eager' : 'lazy';
    el.decoding = 'async';
    const kind = o.kind || el.dataset.imgKind;
    const dim = dimsFor(kind, o);
    if (dim) {
      el.width = dim.width;
      el.height = dim.height;
    }
    if (kind) el.dataset.imgKind = kind;
    const ss = o.srcset === false ? '' : srcset(src);
    if (ss) {
      el.srcset = ss;
      el.sizes = o.sizes || defaultSizes(kind);
    } else {
      el.removeAttribute('srcset');
      el.removeAttribute('sizes');
    }
  }

  global.TL_IMG = { safeUrl, srcset, tag, applyTo, defaultSizes, DIMS };
})(typeof window !== 'undefined' ? window : globalThis);
