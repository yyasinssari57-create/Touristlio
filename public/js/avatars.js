(function () {

  const ICON_ATTRS = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const ANIMAL_ATTRS = 'viewBox="0 0 32 32" aria-hidden="true" focusable="false" class="tl-avatar-animal"';

  const NONE_ICON_SVG = `<svg class="tl-avatar-icon tl-avatar-none-icon" ${ICON_ATTRS}><circle cx="12" cy="12" r="9"/><line x1="7" y1="17" x2="17" y2="7"/></svg>`;

  const PRESET_PATHS = {
    traveler: '<rect x="6" y="7" width="12" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M9 13h6"/>',
    compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
    wave: '<path d="M2 12c2-2 6-2 8 0s6 2 8 0"/><path d="M2 17c2-2 6-2 8 0s6 2 8 0"/>',
    robot: '<rect x="5" y="9" width="14" height="10" rx="2"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><circle cx="9.5" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="14" r="1" fill="currentColor" stroke="none"/><path d="M9 18h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  };

  const ANIMAL_SVGS = {
    fox: `<svg ${ANIMAL_ATTRS}>
      <path fill="#E8642A" d="M6 15 9 5 13 13Z"/><path fill="#E8642A" d="M26 15 23 5 19 13Z"/>
      <path fill="#FFB07A" d="M8 13 9.5 7.5 12 12Z"/><path fill="#FFB07A" d="M24 13 22.5 7.5 20 12Z"/>
      <ellipse fill="#F97316" cx="16" cy="18.5" rx="10.5" ry="9.5"/>
      <ellipse fill="#FFF7ED" cx="16" cy="21.5" rx="5.5" ry="4.5"/>
      <circle fill="#1F2937" cx="11.5" cy="17" r="2.2"/><circle fill="#1F2937" cx="20.5" cy="17" r="2.2"/>
      <circle fill="#FFF" cx="12.3" cy="16.2" r="0.8"/><circle fill="#FFF" cx="21.3" cy="16.2" r="0.8"/>
      <ellipse fill="#1F2937" cx="16" cy="20.5" rx="1.8" ry="1.2"/>
      <path fill="none" stroke="#C2410C" stroke-width="1.2" stroke-linecap="round" d="M13 23.5 Q16 25 19 23.5"/>
    </svg>`,
    owl: `<svg ${ANIMAL_ATTRS}>
      <ellipse fill="#92400E" cx="16" cy="20" rx="11" ry="10"/>
      <ellipse fill="#D97706" cx="16" cy="20" rx="8.5" ry="7.5"/>
      <ellipse fill="#FEF3C7" cx="16" cy="21" rx="6" ry="5"/>
      <circle fill="#FBBF24" cx="11" cy="17" r="4.2"/><circle fill="#FBBF24" cx="21" cy="17" r="4.2"/>
      <circle fill="#FEF9C3" cx="11" cy="17" r="2.8"/><circle fill="#FEF9C3" cx="21" cy="17" r="2.8"/>
      <circle fill="#1F2937" cx="11" cy="17.5" r="1.6"/><circle fill="#1F2937" cx="21" cy="17.5" r="1.6"/>
      <circle fill="#FFF" cx="11.6" cy="16.8" r="0.55"/><circle fill="#FFF" cx="21.6" cy="16.8" r="0.55"/>
      <path fill="#F59E0B" d="M16 13 L18.5 17.5 H13.5 Z"/>
      <ellipse fill="#F97316" cx="16" cy="22.5" rx="2.2" ry="1.4"/>
      <path fill="#78350F" d="M7 11 Q9 8 11 11"/><path fill="#78350F" d="M25 11 Q23 8 21 11"/>
    </svg>`,
    penguin: `<svg ${ANIMAL_ATTRS}>
      <ellipse fill="#1F2937" cx="16" cy="19" rx="9" ry="11"/>
      <ellipse fill="#F9FAFB" cx="16" cy="20.5" rx="5.5" ry="8"/>
      <ellipse fill="#1F2937" cx="16" cy="9.5" rx="6" ry="5.5"/>
      <circle fill="#FFF" cx="13" cy="9" r="2"/><circle fill="#FFF" cx="19" cy="9" r="2"/>
      <circle fill="#1F2937" cx="13" cy="9.2" r="1.1"/><circle fill="#1F2937" cx="19" cy="9.2" r="1.1"/>
      <ellipse fill="#F97316" cx="16" cy="12" rx="2.2" ry="1.5"/>
      <ellipse fill="#F97316" cx="11.5" cy="28.5" rx="2.5" ry="1.2"/><ellipse fill="#F97316" cx="20.5" cy="28.5" rx="2.5" ry="1.2"/>
      <path fill="#374151" d="M9 16 Q7 20 9 24"/><path fill="#374151" d="M23 16 Q25 20 23 24"/>
    </svg>`,
    cat: `<svg ${ANIMAL_ATTRS}>
      <path fill="#F97316" d="M7 14 L6 6 L12 12 Z"/><path fill="#F97316" d="M25 14 L26 6 L20 12 Z"/>
      <path fill="#FDBA74" d="M8 12 L8.5 8 L11 12 Z"/><path fill="#FDBA74" d="M24 12 L23.5 8 L21 12 Z"/>
      <ellipse fill="#FB923C" cx="16" cy="19" rx="10" ry="9"/>
      <ellipse fill="#FFF7ED" cx="16" cy="22" rx="5" ry="4"/>
      <path fill="#C2410C" d="M11 17 h1.5 v4 H11z M15 16.5 h2 v5 h-2z M19.5 17 H21 v4 h-1.5z"/>
      <ellipse fill="#1F2937" cx="11.5" cy="17.5" rx="2" ry="2.3"/><ellipse fill="#1F2937" cx="20.5" cy="17.5" rx="2" ry="2.3"/>
      <circle fill="#FFF" cx="12.2" cy="16.8" r="0.7"/><circle fill="#FFF" cx="21.2" cy="16.8" r="0.7"/>
      <ellipse fill="#F9A8D4" cx="16" cy="21.5" rx="1.5" ry="1"/>
      <path fill="none" stroke="#9A3412" stroke-width="1" d="M8 20.5 L11 21 M24 20.5 L21 21"/>
    </svg>`,
    dog: `<svg ${ANIMAL_ATTRS}>
      <ellipse fill="#D97706" cx="8.5" cy="14" rx="4" ry="6" transform="rotate(-15 8.5 14)"/>
      <ellipse fill="#D97706" cx="23.5" cy="14" rx="4" ry="6" transform="rotate(15 23.5 14)"/>
      <ellipse fill="#FBBF24" cx="16" cy="18.5" rx="10.5" ry="9"/>
      <ellipse fill="#FEF3C7" cx="16" cy="21.5" rx="5.5" ry="4.5"/>
      <circle fill="#1F2937" cx="11.5" cy="17" r="2"/><circle fill="#1F2937" cx="20.5" cy="17" r="2"/>
      <circle fill="#FFF" cx="12.2" cy="16.3" r="0.7"/><circle fill="#FFF" cx="21.2" cy="16.3" r="0.7"/>
      <ellipse fill="#1F2937" cx="16" cy="20.5" rx="2.5" ry="1.8"/>
      <ellipse fill="#F472B6" cx="16" cy="23.5" rx="2.8" ry="2"/>
    </svg>`,
    bear: `<svg ${ANIMAL_ATTRS}>
      <circle fill="#92400E" cx="8.5" cy="10" r="4"/><circle fill="#92400E" cx="23.5" cy="10" r="4"/>
      <circle fill="#B45309" cx="8.5" cy="10" r="2.5"/><circle fill="#B45309" cx="23.5" cy="10" r="2.5"/>
      <ellipse fill="#A16207" cx="16" cy="19" rx="11" ry="10"/>
      <ellipse fill="#D97706" cx="16" cy="22" rx="6" ry="5"/>
      <circle fill="#1F2937" cx="11.5" cy="17" r="2"/><circle fill="#1F2937" cx="20.5" cy="17" r="2"/>
      <circle fill="#FFF" cx="12.2" cy="16.3" r="0.6"/><circle fill="#FFF" cx="21.2" cy="16.3" r="0.6"/>
      <ellipse fill="#78350F" cx="16" cy="21" rx="3" ry="2.2"/>
      <ellipse fill="#1F2937" cx="14.2" cy="20.5" rx="0.9" ry="0.7"/><ellipse fill="#1F2937" cx="17.8" cy="20.5" rx="0.9" ry="0.7"/>
    </svg>`,
    lion: `<svg ${ANIMAL_ATTRS}>
      <circle fill="#F59E0B" cx="7" cy="9" r="3.5"/><circle fill="#F59E0B" cx="25" cy="9" r="3.5"/>
      <circle fill="#FBBF24" cx="7" cy="9" r="2"/><circle fill="#FBBF24" cx="25" cy="9" r="2"/>
      <circle fill="#D97706" cx="16" cy="18" r="12"/>
      <circle fill="#FCD34D" cx="10" cy="14" r="2.5"/><circle fill="#FCD34D" cx="22" cy="14" r="2.5"/>
      <circle fill="#FCD34D" cx="8" cy="19" r="2"/><circle fill="#FCD34D" cx="24" cy="19" r="2"/>
      <circle fill="#FCD34D" cx="12" cy="24" r="2"/><circle fill="#FCD34D" cx="20" cy="24" r="2"/>
      <ellipse fill="#FEF3C7" cx="16" cy="19.5" rx="7" ry="6.5"/>
      <circle fill="#1F2937" cx="12" cy="18" r="2"/><circle fill="#1F2937" cx="20" cy="18" r="2"/>
      <circle fill="#FFF" cx="12.6" cy="17.3" r="0.65"/><circle fill="#FFF" cx="20.6" cy="17.3" r="0.65"/>
      <ellipse fill="#1F2937" cx="16" cy="21.5" rx="2" ry="1.4"/>
      <path fill="none" stroke="#B45309" stroke-width="1.2" stroke-linecap="round" d="M13 23.5 Q16 25.5 19 23.5"/>
    </svg>`,
    rabbit: `<svg ${ANIMAL_ATTRS}>
      <ellipse fill="#FFF" cx="10.5" cy="8" rx="3" ry="7" transform="rotate(-8 10.5 8)"/>
      <ellipse fill="#FFF" cx="21.5" cy="8" rx="3" ry="7" transform="rotate(8 21.5 8)"/>
      <ellipse fill="#FBCFE8" cx="10.5" cy="9" rx="1.8" ry="5" transform="rotate(-8 10.5 9)"/>
      <ellipse fill="#FBCFE8" cx="21.5" cy="9" rx="1.8" ry="5" transform="rotate(8 21.5 9)"/>
      <ellipse fill="#F9FAFB" cx="16" cy="20" rx="10" ry="9"/>
      <circle fill="#1F2937" cx="11.5" cy="18.5" r="2"/><circle fill="#1F2937" cx="20.5" cy="18.5" r="2"/>
      <circle fill="#FFF" cx="12.2" cy="17.8" r="0.7"/><circle fill="#FFF" cx="21.2" cy="17.8" r="0.7"/>
      <ellipse fill="#F9A8D4" cx="16" cy="21.5" rx="1.5" ry="1"/>
      <path fill="none" stroke="#E5E7EB" stroke-width="1.2" stroke-linecap="round" d="M13.5 23.5 Q16 25 18.5 23.5"/>
      <circle fill="#F3F4F6" cx="16" cy="25.5" r="1.2"/>
    </svg>`,
    panda: `<svg ${ANIMAL_ATTRS}>
      <circle fill="#1F2937" cx="8" cy="10" r="4.5"/><circle fill="#1F2937" cx="24" cy="10" r="4.5"/>
      <ellipse fill="#F9FAFB" cx="16" cy="19" rx="11" ry="10"/>
      <ellipse fill="#1F2937" cx="10.5" cy="17.5" rx="3.5" ry="4"/><ellipse fill="#1F2937" cx="21.5" cy="17.5" rx="3.5" ry="4"/>
      <circle fill="#FFF" cx="10.5" cy="17" r="1.3"/><circle fill="#FFF" cx="21.5" cy="17" r="1.3"/>
      <ellipse fill="#1F2937" cx="16" cy="21.5" rx="2.5" ry="2"/>
      <path fill="none" stroke="#9CA3AF" stroke-width="1.2" stroke-linecap="round" d="M13.5 24 Q16 25.5 18.5 24"/>
    </svg>`,
    butterfly: `<svg ${ANIMAL_ATTRS}>
      <ellipse fill="#C084FC" cx="9" cy="14" rx="7" ry="5.5" transform="rotate(-20 9 14)"/>
      <ellipse fill="#E879F9" cx="23" cy="14" rx="7" ry="5.5" transform="rotate(20 23 14)"/>
      <ellipse fill="#A855F7" cx="8" cy="22" rx="5" ry="4" transform="rotate(-15 8 22)"/>
      <ellipse fill="#D946EF" cx="24" cy="22" rx="5" ry="4" transform="rotate(15 24 22)"/>
      <ellipse fill="#F0ABFC" cx="9" cy="14" rx="3.5" ry="2.5" transform="rotate(-20 9 14)"/>
      <ellipse fill="#F0ABFC" cx="23" cy="14" rx="3.5" ry="2.5" transform="rotate(20 23 14)"/>
      <ellipse fill="#7C3AED" cx="16" cy="17" rx="1.8" ry="5"/>
      <circle fill="#4C1D95" cx="16" cy="11" r="2.2"/>
      <path fill="none" stroke="#6D28D9" stroke-width="1" stroke-linecap="round" d="M14.5 9 Q16 7.5 17.5 9"/>
      <circle fill="#1F2937" cx="15.2" cy="10.8" r="0.5"/><circle fill="#1F2937" cx="16.8" cy="10.8" r="0.5"/>
    </svg>`,
  };

  const ANIMAL_IDS = new Set(Object.keys(ANIMAL_SVGS));

  const PRESETS = [
    { id: 'none', label: 'Sembolsüz', initialOnly: true, category: 'none' },
    { id: 'traveler', label: 'Gezgin', anim: 'bounce', category: 'travel' },
    { id: 'compass', label: 'Pusula', anim: 'spin', category: 'travel' },
    { id: 'plane', label: 'Uçak', anim: 'fly', category: 'travel' },
    { id: 'camera', label: 'Fotoğrafçı', anim: 'pulse', category: 'travel' },
    { id: 'mountain', label: 'Dağcı', anim: 'bounce', category: 'travel' },
    { id: 'wave', label: 'Deniz', anim: 'wave', category: 'travel' },
    { id: 'robot', label: 'Robot', anim: 'pulse', category: 'travel' },
    { id: 'sun', label: 'Güneş', anim: 'glow', category: 'travel' },
    { id: 'moon', label: 'Ay', anim: 'glow', category: 'travel' },
    { id: 'fox', label: 'Tilki', anim: 'wiggle', category: 'animal', defaultColor: '#FFEDD5' },
    { id: 'owl', label: 'Baykuş', anim: 'blink', category: 'animal', defaultColor: '#FEF3C7' },
    { id: 'penguin', label: 'Penguen', anim: 'waddle', category: 'animal', defaultColor: '#DBEAFE' },
    { id: 'cat', label: 'Kedi', anim: 'wiggle', category: 'animal', defaultColor: '#FFEDD5' },
    { id: 'dog', label: 'Köpek', anim: 'bounce', category: 'animal', defaultColor: '#FEF9C3' },
    { id: 'bear', label: 'Ayı', anim: 'pulse', category: 'animal', defaultColor: '#FDE68A' },
    { id: 'lion', label: 'Aslan', anim: 'bounce', category: 'animal', defaultColor: '#FEF3C7' },
    { id: 'rabbit', label: 'Tavşan', anim: 'bounce', category: 'animal', defaultColor: '#FFF1F2' },
    { id: 'panda', label: 'Panda', anim: 'pulse', category: 'animal', defaultColor: '#F3F4F6' },
    { id: 'butterfly', label: 'Kelebek', anim: 'fly', category: 'animal', defaultColor: '#FAE8FF' },
  ];

  const COLORS = [
    '#0ea5e9', '#0d9488', '#b45309', '#e8642a', '#7c3aed',
    '#db2777', '#059669', '#dc2626', '#4f46e5', '#0891b2',
  ];

  const PICKER_SECTIONS = [
    { key: 'none', label: null, filter: (p) => p.initialOnly },
    { key: 'travel', label: 'Gezi', filter: (p) => p.category === 'travel' },
    { key: 'animal', label: 'Hayvanlar', filter: (p) => p.category === 'animal' },
  ];

  function presetById(id) {
    return PRESETS.find((p) => p.id === id) || null;
  }

  function isAnimalPreset(id) {
    return ANIMAL_IDS.has(id);
  }

  function presetDisplayColor(presetId, userColor) {
    const p = presetById(presetId);
    if (p?.category === 'animal' && p.defaultColor) return p.defaultColor;
    return userColor || '#0ea5e9';
  }

  function presetIconSvg(id) {
    if (ANIMAL_SVGS[id]) return ANIMAL_SVGS[id];
    const paths = PRESET_PATHS[id] || PRESET_PATHS.traveler;
    return `<svg class="tl-avatar-icon" ${ICON_ATTRS}>${paths}</svg>`;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function resolveAvatarUrl(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url) || url.startsWith('//')) return url;
    if (url.startsWith('/')) return url;
    return `/${url.replace(/^\/+/, '')}`;
  }

  function userAvatarData(user) {
    if (!user) return { type: 'initial', initial: '?', color: '#0ea5e9' };
    const color = user.avatarColor || '#0ea5e9';
    if (user.avatarUrl) {
      return { type: 'photo', url: resolveAvatarUrl(user.avatarUrl), color };
    }
    if (user.avatarPreset && user.avatarPreset !== 'none') {
      const p = presetById(user.avatarPreset);
      const presetId = p ? p.id : 'traveler';
      return {
        type: 'preset',
        presetId,
        anim: p ? p.anim : 'bounce',
        color: presetDisplayColor(presetId, color),
        isAnimal: isAnimalPreset(presetId),
      };
    }
    return {
      type: 'initial',
      initial: ((user.name || '?').trim()[0] || '?').toUpperCase(),
      color,
    };
  }

  function presetIconHtml(presetId) {
    return presetIconSvg(presetId);
  }

  function renderHtml(user, extraClass) {
    const d = userAvatarData(user);
    const cls = ['tl-avatar', extraClass].filter(Boolean).join(' ');
    if (d.type === 'photo') {
      return `<div class="${cls}" style="background:${d.color}">${window.TL_IMG?.tag ? window.TL_IMG.tag(d.url, { className: 'tl-avatar-img', kind: 'avatar' }) : `<img src="${escapeHtml(d.url)}" alt="" class="tl-avatar-img" loading="lazy" decoding="async"/>`}</div>`;
    }
    if (d.type === 'preset') {
      const animalCls = d.isAnimal ? ' tl-avatar-animal-preset' : '';
      return `<div class="${cls} tl-avatar-preset${animalCls} av-anim-${d.anim}" style="background:${d.color}">${presetIconHtml(d.presetId)}</div>`;
    }
    return `<div class="${cls}" style="background:${d.color}"><span class="tl-avatar-initial">${escapeHtml(d.initial)}</span></div>`;
  }

  function applyToElement(el, user) {
    if (!el) return;
    const d = userAvatarData(user);
    el.className = el.className.replace(/\btl-avatar\S*/g, '').replace(/\bav-anim-\S+/g, '').trim();
    el.classList.add('tl-avatar');
    el.style.background = d.color;
    el.innerHTML = '';
    if (d.type === 'photo') {
      const img = document.createElement('img');
      img.src = d.url;
      img.alt = '';
      img.className = 'tl-avatar-img';
      img.loading = 'lazy';
      img.decoding = 'async';
      el.appendChild(img);
    } else if (d.type === 'preset') {
      el.classList.add('tl-avatar-preset', `av-anim-${d.anim}`);
      if (d.isAnimal) el.classList.add('tl-avatar-animal-preset');
      el.insertAdjacentHTML('beforeend', presetIconHtml(d.presetId));
    } else {
      const span = document.createElement('span');
      span.className = 'tl-avatar-initial';
      span.textContent = d.initial;
      el.appendChild(span);
    }
  }

  function presetPickerInner(p, selectedColor) {
    const bg = presetDisplayColor(p.id, selectedColor);
    if (p.initialOnly) {
      return `<span class="tl-avatar tl-avatar-none-pick" style="background:${selectedColor}">${NONE_ICON_SVG}</span>`;
    }
    const animalCls = p.category === 'animal' ? ' tl-avatar-animal-preset' : '';
    return `<span class="tl-avatar tl-avatar-preset${animalCls} av-anim-${p.anim}" style="background:${bg}">${presetIconHtml(p.id)}</span>`;
  }

  function renderPickerSection(section, selectedPreset, selectedColor) {
    const items = PRESETS.filter(section.filter);
    if (!items.length) return '';
    const buttons = items.map((p) => `
      <button type="button" class="av-pick-item${selectedPreset === p.id ? ' on' : ''}" data-preset="${p.id}" title="${escapeHtml(p.label)}" aria-label="${escapeHtml(p.label)}">
        ${presetPickerInner(p, selectedColor)}
      </button>`).join('');
    if (!section.label) {
      return `<div class="av-pick-section av-pick-section-none">${buttons}</div>`;
    }
    return `
      <div class="av-pick-section">
        <div class="av-pick-section-label">${escapeHtml(section.label)}</div>
        <div class="av-pick-section-grid">${buttons}</div>
      </div>`;
  }

  function renderPickerGrid(selectedPreset, selectedColor, onPick) {
    const presetHtml = PICKER_SECTIONS.map((section) => renderPickerSection(section, selectedPreset, selectedColor)).join('');
    const colorHtml = COLORS.map((c) => `
      <button type="button" class="av-color-swatch${selectedColor === c ? ' on' : ''}" data-color="${c}" style="background:${c}" aria-label="Renk ${c}"></button>`).join('');
    return { presetHtml, colorHtml, bind(root) {
      root.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.onclick = () => {
          const preset = btn.dataset.preset;
          const p = presetById(preset);
          const patch = { preset };
          if (p?.category === 'animal' && p.defaultColor) patch.color = p.defaultColor;
          onPick(patch);
        };
      });
      root.querySelectorAll('[data-color]').forEach((btn) => {
        btn.onclick = () => onPick({ color: btn.dataset.color });
      });
    } };
  }

  window.TL_AVATARS = {
    PRESETS,
    COLORS,
    presetById,
    presetIconSvg,
    presetDisplayColor,
    isAnimalPreset,
    resolveAvatarUrl,
    userAvatarData,
    renderHtml,
    applyToElement,
    renderPickerGrid,
  };

})();
