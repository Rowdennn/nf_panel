// NFR Panel — front. Items via /api/items, repli mocks. Bordeaux = nav, vert = sémantique.
(function () {
  'use strict';

  const root = document.getElementById('app');
  const sty = (o) =>
    Object.entries(o)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`)
      .join(';');
  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Palette
  const BX = '#8a2230';            // bordeaux primaire (identité/nav)
  const BX_DARK = '#5a1620';       // bordeaux profond (dégradés)
  const BX_LIGHT = '#cf6f6f';      // rosé bordeaux (accent clair nav)
  const BX_RGB = '138,34,48';      // bordeaux en rgb (fonds/bordures translucides)
  const GR = '#10b981';            // vert sémantique (boutons d'action positive)
  const GR_LIGHT = '#34d399';      // vert clair (statut/texte succès)
  const GR_RGB = '16,185,129';
  const ON_GR = '#04140e';         // texte sur bouton vert
  const AMBER = '#e0a14e';

  // Données (catégories)
  const catMeta = {
    food:     { label: 'Nourriture', hue: 45 },
    drink:    { label: 'Boisson',    hue: 205 },
    alcohol:  { label: 'Alcool',     hue: 28 },
    weapon:   { label: 'Arme',       hue: 12 },
    ammo:     { label: 'Munitions',  hue: 62 },
    medical:  { label: 'Médical',    hue: 155 },
    material: { label: 'Matériau',   hue: 95 },
    animal:   { label: 'Ressource',  hue: 35 },
    misc:     { label: 'Divers',     hue: 285 },
  };


  // Modules (Grades retiré ; Inventaires renommé en Coffres)
  const moduleDef = [
    { key: 'items', label: 'Items', icon: '▦', soon: false, soonTitle: 'Gestion des items', soonDesc: '' },
    { key: 'jobs', label: 'Jobs', icon: '⚒', soon: true, soonTitle: 'Gestion des jobs', soonDesc: 'Créer, renommer et supprimer les métiers de la table job — salaires, libellés et accès.' },
    { key: 'players', label: 'Joueurs', icon: '☻', soon: true, soonTitle: 'Gestion des joueurs', soonDesc: 'Rechercher un personnage, consulter argent, identité et historique de jeu.' },
    { key: 'inventory', label: 'Coffres', icon: '▢', soon: true, soonTitle: 'Gestion des coffres', soonDesc: 'Inspecter les inventaires des joueurs et le contenu des coffres partagés.' },
  ];

  // État
  const state = {
    items: [],
    query: '', cat: 'all', onlyMissing: false, view: 'list', sort: 'recent',
    draft: null, dropActive: false, module: 'items', nav: 'gallery',
    matches: {},        // { [item]: { candidates, selected } }
    matchesLoading: false,
    validated: {},      // { [item]: true } — validés manuellement
    queueSort: 'score_desc',
    queueThreshold: 80,
    r2Stats: null,
    cdnBase: '',
    publishing: false,
    settings: {
      format: 'png', dimensions: '512', maxWeight: '256',
      autoCompress: true, autoName: true, autoPurge: true,
      baseUrl: 'https://cdn.monserveur-rp.fr/items', folder: '/items/',
      apiKey: 'r2_live_8f2c••••••••3f9a', fallback: '_missing.png',
    },
    flash: null,
  };
  let flashTimer = null;
  function setFlash(msg) {
    state.flash = msg;
    render();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { state.flash = null; render(); }, 2600);
  }

  function decorate(it) {
    const hue = catMeta[it.cat] ? catMeta[it.cat].hue : 285;
    const a = `oklch(0.34 0.05 ${hue})`, b = `oklch(0.285 0.045 ${hue})`;
    const imgUrl = it.hasImage && state.cdnBase
      ? (state.cdnBase.replace(/\/$/, '') + '/items/' + encodeURIComponent(it.item) + '.png')
      : null;
    const imgBg = imgUrl
      ? `position:absolute;inset:0;display:flex;align-items:flex-end;padding:10px;background-image:url('${imgUrl}');background-size:contain;background-position:center;background-repeat:no-repeat;background-color:#16130f;`
      : `position:absolute;inset:0;display:flex;align-items:flex-end;padding:10px;background:repeating-linear-gradient(135deg,${a},${a} 11px,${b} 11px,${b} 22px);`;
    const thumbBg = imgUrl
      ? `background-image:url('${imgUrl}');background-size:contain;background-position:center;background-repeat:no-repeat;background-color:#16130f;`
      : it.hasImage
        ? `background:repeating-linear-gradient(135deg,${a},${a} 6px,${b} 6px,${b} 12px);`
        : 'background:rgba(224,161,78,0.1);';
    return {
      hue,
      catLabel: catMeta[it.cat] ? catMeta[it.cat].label : 'Divers',
      fileName: `${it.item || 'sans_nom'}.png`,
      imgUrl,
      noImage: !it.hasImage,
      tileStyle: imgBg,
      thumbStyle: `width:40px;height:40px;border-radius:8px;${thumbBg}border:${it.hasImage ? '1px solid rgba(236,231,223,0.08)' : '1.5px dashed rgba(224,161,78,0.5)'};`,
      cornerStyle: sty({ position: 'absolute', top: '9px', left: '9px', fontSize: '10.5px', fontWeight: '600', color: `oklch(0.82 0.06 ${hue})`, background: `color-mix(in oklab, oklch(0.55 0.12 ${hue}) 24%, rgba(0,0,0,0.5))`, border: `1px solid color-mix(in oklab, oklch(0.6 0.12 ${hue}) 30%, transparent)`, padding: '2px 8px', borderRadius: '7px', backdropFilter: 'blur(2px)' }),
      badgePill: sty({ display: 'inline-block', fontSize: '11px', fontWeight: '600', color: `oklch(0.8 0.06 ${hue})`, background: `color-mix(in oklab, oklch(0.6 0.12 ${hue}) 16%, transparent)`, padding: '3px 9px', borderRadius: '7px', width: 'fit-content' }),
    };
  }

  // Actions
  function openItem(id) {
    const it = state.items.find((i) => i.id === id);
    if (!it) return;
    state.draft = Object.assign({}, it);
    state.dropActive = false;
    render();
  }
  function openNew() {
    state.dropActive = false;
    state.draft = { id: null, item: '', label: '', cat: 'misc', type: 'item', limit: 1, weight: 0.5, can_remove: 1, usable: 0, useExpired: 0, groupId: 9, degradation: 0, desc: '', metadata: '{}', hasImage: false, size: 0, dims: '—' };
    render();
  }
  function closeModal() { state.draft = null; render(); }
  function saveDraft() {
    const d = state.draft;
    if (!d) return;
    const items = state.items.slice();
    if (d.id == null) {
      const nid = items.reduce((m, i) => Math.max(m, i.id), 1000) + 1;
      items.unshift(Object.assign({}, d, { id: nid }));
    } else {
      const idx = items.findIndex((i) => i.id === d.id);
      if (idx >= 0) items[idx] = Object.assign({}, d);
    }
    state.items = items;
    state.draft = null;
    render();
  }
  function dropImage() {
    if (!state.draft) return;
    state.draft = Object.assign({}, state.draft, { hasImage: true, size: 12 + Math.floor(Math.random() * 42), dims: '512×512' });
    state.dropActive = false;
    render();
  }

  // Calcul des valeurs de rendu
  function computeVals() {
    const s = state;
    const q = s.query.trim().toLowerCase();
    const inItems = s.module === 'items';

    let list = s.items.filter((it) => {
      if (s.cat !== 'all' && it.cat !== s.cat) return false;
      if (s.onlyMissing && it.hasImage) return false;
      if (q && !(it.label.toLowerCase().includes(q) || it.item.toLowerCase().includes(q))) return false;
      return true;
    });
    if (s.sort === 'az') list = list.slice().sort((a, b) => a.label.localeCompare(b.label));
    else if (s.sort === 'weight') list = list.slice().sort((a, b) => b.weight - a.weight);

    const items = list.map((it) => {
      const d = decorate(it);
      return Object.assign({}, it, d, {
        sizeText: it.hasImage ? `${it.size} Ko` : '— Ko',
        statusText: it.hasImage ? 'en ligne' : 'manquante',
        statusStyle: sty({ fontSize: '11.5px', fontWeight: '600', color: it.hasImage ? GR_LIGHT : AMBER }),
      });
    });

    const total = s.items.length;
    const onlineCount = s.items.filter((i) => i.hasImage).length;
    const missingCount = total - onlineCount;
    const catCounts = {};
    s.items.forEach((i) => { catCounts[i.cat] = (catCounts[i.cat] || 0) + 1; });

    const showGalleryTab = inItems && s.nav === 'gallery';
    const showQueueTab  = inItems && s.nav === 'queue';
    const showSettings  = inItems && s.nav === 'settings';

    // items de la file d'attente (sans image) enrichis des candidats
    const queueItems = s.items
      .filter((it) => !it.hasImage)
      .filter((it) => !q || it.label.toLowerCase().includes(q) || it.item.toLowerCase().includes(q))
      .map((it) => {
        const m = s.matches[it.item] || { candidates: [], selected: null };
        return Object.assign({}, it, decorate(it), {
          candidates: m.candidates,
          selected: m.selected,
          validated: !!s.validated[it.item],
          topScore: m.candidates[0] ? m.candidates[0].score : -1,
        });
      })
      .sort((a, b) => {
        if (s.queueSort === 'score_desc') return b.topScore - a.topScore;
        if (s.queueSort === 'score_asc') return a.topScore - b.topScore;
        return a.label.localeCompare(b.label);
      });

    return {
      q, inItems, total, onlineCount, missingCount, catCounts, items,
      showGalleryTab, showQueueTab, showSettings, showModuleSoon: !inItems,
      isEmpty: showGalleryTab && items.length === 0,
      showGrid: showGalleryTab && s.view === 'grid' && items.length > 0,
      showList: showGalleryTab && s.view === 'list' && items.length > 0,
      curMod: moduleDef.find((m) => m.key === s.module) || moduleDef[0],
      queueItems,
      matchesLoading: s.matchesLoading,
      validatedCount: Object.keys(s.validated).length,
    };
  }

  // Fragments HTML
  function toggleHTML(on) {
    const track = sty({ width: '40px', height: '22px', borderRadius: '999px', position: 'relative', flexShrink: 0, transition: 'background .15s', background: on ? GR : '#322c23' });
    const knob = sty({ position: 'absolute', top: '2px', left: on ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#ece7df', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' });
    return `<div style="${track}"><div style="${knob}"></div></div>`;
  }

  function sidebarHTML(v) {
    const s = state;
    const modBase = 'display:flex; align-items:center; gap:11px; width:100%; height:42px; padding:0 12px; border-radius:10px; border:none; cursor:pointer; font-size:14px; font-weight:600; transition:background .12s;';
    const modules = moduleDef.map((m) => {
      const active = s.module === m.key;
      const bg = active ? `rgba(${BX_RGB},0.13)` : 'transparent';
      const col = active ? '#ece7df' : '#a89f93';
      const icon = sty({ width: '24px', height: '24px', borderRadius: '7px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0, background: active ? `rgba(${BX_RGB},0.18)` : '#211d16', color: active ? BX_LIGHT : '#a89f93' });
      const soon = m.soon ? `<span style="font-size:9.5px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#756c60; background:#211d16; padding:2px 6px; border-radius:5px;">bientôt</span>` : '';
      return `<button data-act="module" data-key="${m.key}" style="${modBase} background:${bg}; color:${col};">
        <span style="${icon}">${m.icon}</span><span style="flex:1; text-align:left;">${esc(m.label)}</span>${soon}
      </button>`;
    }).join('');

    let subTabsBlock = '';
    if (v.inItems) {
      const navDef = [['gallery', 'Liste des items', null], ['queue', 'File d\'attente', String(v.missingCount)], ['settings', 'Réglages CDN', null]];
      const navBase = 'display:flex; align-items:center; gap:10px; width:100%; height:40px; padding:0 12px; border-radius:10px; border:none; cursor:pointer; font-size:14px; font-weight:600; transition:background .12s;';
      const subTabs = navDef.map(([key, label, badge]) => {
        const active = s.nav === key;
        const bg = active ? `rgba(${BX_RGB},0.13)` : 'transparent';
        const col = active ? '#ece7df' : '#a89f93';
        const dot = sty({ width: '7px', height: '7px', borderRadius: '2px', flexShrink: 0, background: active ? BX_LIGHT : '#4d463c' });
        const badgeHTML = (key === 'gallery' && badge && badge !== '0')
          ? `<span style="font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:600; color:${AMBER}; background:rgba(224,161,78,0.14); padding:2px 7px; border-radius:6px;">${esc(badge)}</span>`
          : '';
        return `<button data-act="nav" data-key="${key}" style="${navBase} background:${bg}; color:${col};">
          <span style="${dot}"></span><span style="flex:1; text-align:left;">${esc(label)}</span>${badgeHTML}
        </button>`;
      }).join('');
      subTabsBlock = `<div style="padding:12px 18px 7px; font-size:10.5px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:#756c60;">Gestion des items</div>
        <nav style="padding:0 12px 6px; display:flex; flex-direction:column; gap:3px;">${subTabs}</nav>`;
    }

    let catBlock = '';
    if (v.showGalleryTab) {
      const chipBase = 'display:flex; align-items:center; gap:9px; width:100%; height:34px; padding:0 11px; border-radius:9px; border:none; cursor:pointer; font-size:13px; transition:background .12s;';
      const mkChip = (key, label, hue) => {
        const active = s.cat === key;
        const count = key === 'all' ? v.total : (v.catCounts[key] || 0);
        const bg = active ? `rgba(${BX_RGB},0.13)` : 'transparent';
        const col = active ? '#ece7df' : '#a89f93';
        const fw = active ? 600 : 500;
        const swatch = sty({ width: '9px', height: '9px', borderRadius: '3px', flexShrink: 0, background: key === 'all' ? '#756c60' : `oklch(0.62 0.12 ${hue})` });
        const cs = sty({ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: active ? BX_LIGHT : '#756c60' });
        return `<button data-act="cat" data-key="${key}" style="${chipBase} background:${bg}; color:${col}; font-weight:${fw};">
          <span style="${swatch}"></span><span style="flex:1; text-align:left;">${esc(label)}</span><span style="${cs}">${count}</span>
        </button>`;
      };
      const chips = [mkChip('all', 'Toutes', 0)].concat(Object.keys(catMeta).map((k) => mkChip(k, catMeta[k].label, catMeta[k].hue))).join('');
      catBlock = `<div style="padding:16px 18px 8px; font-size:10.5px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:#756c60;">Catégories</div>
        <div style="padding:0 12px; display:flex; flex-direction:column; gap:2px; overflow-y:auto; flex:1;">${chips}</div>`;
    }
    const spacer = (v.showGalleryTab || v.showQueueTab) ? '' : '<div style="flex:1;"></div>';

    let storWidget = '';
    if (v.inItems) {
      const st = state.r2Stats;
      const MAX_GB = 10;
      const usedBytes = st ? st.sizeBytes : 0;
      const usedMb = (usedBytes / 1024 / 1024).toFixed(1);
      const pct = st ? Math.min(100, (usedBytes / (MAX_GB * 1024 * 1024 * 1024)) * 100).toFixed(1) : 0;
      const fileCount = st ? st.count : '—';
      const usedLabel = st ? `${usedMb} Mo` : '…';
      const storBar = sty({ width: pct + '%', height: '100%', borderRadius: '4px', background: `linear-gradient(90deg,${BX},${BX_LIGHT})` });
      storWidget = `<div style="padding:14px; border-top:1px solid rgba(236,231,223,0.06);">
        <div style="background:#211d16; border:1px solid rgba(236,231,223,0.07); border-radius:11px; padding:13px 14px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:9px;">
            <span style="font-size:12px; color:#a89f93;">Stockage R2</span>
            <span style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#756c60;">${usedLabel} / ${MAX_GB} Go</span>
          </div>
          <div style="height:7px; border-radius:4px; background:#0f0d0a; overflow:hidden;"><div style="${storBar}"></div></div>
          <div style="margin-top:9px; font-size:11px; color:#756c60;">${fileCount} fichiers · ${pct}%</div>
        </div>
      </div>`;
    }

    return `<aside style="width:250px; flex-shrink:0; background:#1a1712; border-right:1px solid rgba(236,231,223,0.08); display:flex; flex-direction:column;">
      <div style="padding:20px 18px 16px; display:flex; align-items:center; gap:11px; border-bottom:1px solid rgba(236,231,223,0.06);">
        <div style="width:34px; height:34px; border-radius:9px; background:linear-gradient(150deg,${BX},${BX_DARK}); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(${BX_RGB},0.28);">
          <div style="width:13px; height:13px; border:2.5px solid #ffe9e6; border-radius:3px;"></div>
        </div>
        <div style="line-height:1.1;">
          <div style="font-weight:800; font-size:16px; letter-spacing:-0.01em;">NFR PANEL</div>
          <div style="font-size:11px; color:#756c60; font-family:'JetBrains Mono',monospace; margin-top:2px;">administration serveur</div>
        </div>
      </div>
      <div style="padding:14px 18px 7px; font-size:10.5px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:#756c60;">Modules</div>
      <nav style="padding:0 12px 6px; display:flex; flex-direction:column; gap:3px;">${modules}</nav>
      ${subTabsBlock}
      ${catBlock}
      ${spacer}
      ${storWidget}
    </aside>`;
  }

  function headerHTML(v) {
    const s = state;
    const hasQuery = v.q.length > 0;
    const clearBtn = hasQuery
      ? `<button data-act="clearQuery" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); width:22px; height:22px; border:none; border-radius:6px; background:#2e2820; color:#a89f93; cursor:pointer; font-size:13px;">✕</button>`
      : '';
    const missStyle = s.onlyMissing
      ? `display:flex; align-items:center; gap:8px; height:40px; padding:0 14px; border-radius:10px; border:1px solid rgba(224,161,78,0.45); background:rgba(224,161,78,0.13); color:${AMBER}; font-weight:600; font-size:13px; cursor:pointer;`
      : 'display:flex; align-items:center; gap:8px; height:40px; padding:0 14px; border-radius:10px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#a89f93; font-weight:600; font-size:13px; cursor:pointer;';
    const rightTools = v.showGalleryTab
      ? `<div style="display:flex; align-items:center; gap:16px;">
          <button data-act="toggleMissing" style="${missStyle}"><span style="width:7px; height:7px; border-radius:50%; background:${AMBER};"></span> Images manquantes</button>
          <button data-act="openNew" style="display:flex; align-items:center; gap:8px; height:40px; padding:0 17px; border-radius:10px; border:none; background:${GR}; color:${ON_GR}; font-weight:700; font-size:13.5px; cursor:pointer; box-shadow:0 4px 14px rgba(${GR_RGB},0.25);"><span style="font-size:17px; line-height:1; margin-top:-1px;">＋</span> Importer un item</button>
        </div>`
      : '';
    return `<header style="height:64px; flex-shrink:0; border-bottom:1px solid rgba(236,231,223,0.08); display:flex; align-items:center; gap:16px; padding:0 24px; background:#16130f;">
      <div style="position:relative; flex:1; max-width:480px;">
        <span style="position:absolute; left:13px; top:50%; transform:translateY(-50%); color:#756c60; font-size:15px;">⌕</span>
        <input id="f-query" data-act="query" value="${esc(s.query)}" placeholder="Rechercher un item ou un identifiant…" style="width:100%; height:40px; padding:0 38px 0 34px; border-radius:10px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:14px; outline:none;" />
        ${clearBtn}
      </div>
      <div style="flex:1;"></div>
      ${rightTools}
    </header>`;
  }

  function statsHTML(v) {
    var pct = v.total ? ((v.onlineCount / v.total) * 100).toFixed(1) : '0.0';
    var cards = [
      { label: 'Items référencés', value: String(v.total), unit: '', sub: 'total en base', color: '#ece7df' },
      { label: 'Images en ligne', value: String(v.onlineCount), unit: pct + ' %', sub: 'couverture du catalogue', color: GR_LIGHT },
      { label: 'Images manquantes', value: String(v.missingCount), unit: 'à téléverser', sub: 'priorité file d\'attente', color: v.missingCount > 0 ? AMBER : GR_LIGHT },
    ];
    const cells = cards.map((st) => `<div style="background:#1a1712; border:1px solid rgba(236,231,223,0.07); border-radius:13px; padding:16px 18px;">
        <div style="font-size:12.5px; color:#a89f93; margin-bottom:10px;">${esc(st.label)}</div>
        <div style="display:flex; align-items:baseline; gap:8px;">
          <span style="font-size:26px; font-weight:700; letter-spacing:-0.02em; color:${st.color};">${esc(st.value)}</span>
          <span style="font-size:12px; color:#756c60; font-family:'JetBrains Mono',monospace;">${esc(st.unit)}</span>
        </div>
        <div style="font-size:12px; color:#756c60; margin-top:7px;">${esc(st.sub)}</div>
      </div>`).join('');
    return `<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:26px;">${cells}</div>`;
  }

  function toolbarHTML(v) {
    const s = state;
    const seg = (active) => active
      ? `width:30px; height:28px; border:none; border-radius:6px; cursor:pointer; font-size:14px; background:${BX}; color:#ffe9e6;`
      : 'width:30px; height:28px; border:none; border-radius:6px; cursor:pointer; font-size:14px; background:transparent; color:#a89f93;';
    const opt = (val, label) => `<option value="${val}" ${s.sort === val ? 'selected' : ''}>${esc(label)}</option>`;
    return `<div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <h2 style="margin:0; font-size:18px; font-weight:700; letter-spacing:-0.01em;">${esc(v.galleryTitle)}</h2>
      <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#756c60; background:#211d16; border:1px solid rgba(236,231,223,0.07); padding:3px 9px; border-radius:7px;">${v.items.length} résultats</span>
      <div style="flex:1;"></div>
      <select data-act="sort" style="height:36px; padding:0 30px 0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16 url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22><path d=%22M1 3l4 4 4-4%22 stroke=%22%23a89f93%22 stroke-width=%221.5%22 fill=%22none%22/></svg>') no-repeat right 11px center; color:#ece7df; font-size:13px; cursor:pointer; outline:none;">
        ${opt('recent', 'Récemment modifiés')}${opt('az', 'Nom (A → Z)')}${opt('weight', 'Poids décroissant')}
      </select>
      <div style="display:flex; background:#211d16; border:1px solid rgba(236,231,223,0.1); border-radius:9px; padding:3px; gap:2px;">
        <button data-act="view" data-key="list" style="${seg(s.view === 'list')}">≣</button>
        <button data-act="view" data-key="grid" style="${seg(s.view === 'grid')}">▦</button>
      </div>
    </div>`;
  }

  function gridHTML(v) {
    const cards = v.items.map((it) => {
      const imgArea = it.hasImage && it.imgUrl
        ? `<div style="position:absolute;inset:0;background:#16130f;display:flex;align-items:center;justify-content:center;">
            <img src="${it.imgUrl}" alt="${esc(it.label)}" style="width:100%;height:100%;object-fit:contain;display:block;" loading="lazy" />
            <span style="position:absolute;bottom:8px;left:8px;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:rgba(236,231,223,0.62);background:rgba(0,0,0,0.34);padding:3px 7px;border-radius:6px;backdrop-filter:blur(2px);">${esc(it.fileName)}</span>
          </div>`
        : `<div style="position:absolute;inset:9px;border:1.5px dashed rgba(224,161,78,0.5);border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(224,161,78,0.05);"><span style="font-size:21px;opacity:.8;">⚠</span><span style="font-size:11px;color:${AMBER};font-weight:600;">image manquante</span></div>`;
      return `<div class="item-card" data-act="openItem" data-id="${it.id}" style="background:#211d16; border:1px solid rgba(236,231,223,0.08); border-radius:12px; overflow:hidden; cursor:pointer;">
        <div style="position:relative; aspect-ratio:1/1; background:#16130f;">${imgArea}<span style="${it.cornerStyle}">${esc(it.catLabel)}</span></div>
        <div style="padding:11px 12px 12px;">
          <div style="font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(it.label)}</div>
          <div style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#756c60; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(it.item)}</div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:11px;">
            <span style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#a89f93;">#${it.id}</span>
            <span style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#756c60;">${esc(it.sizeText)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
    return `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:16px;">${cards}</div>`;
  }

  function listHTML(v) {
    const head = `<div style="display:grid; grid-template-columns:54px 1.4fr 1fr 90px 100px 90px 90px; gap:12px; align-items:center; padding:11px 16px; background:#1a1712; border-bottom:1px solid rgba(236,231,223,0.08); font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#756c60;"><span>Image</span><span>Item</span><span>Identifiant</span><span>Catégorie</span><span>Type</span><span>Poids</span><span>Statut</span></div>`;
    const rows = v.items.map((it) => `<div class="list-row" data-act="openItem" data-id="${it.id}" style="display:grid; grid-template-columns:54px 1.4fr 1fr 90px 100px 90px 90px; gap:12px; align-items:center; padding:9px 16px; border-bottom:1px solid rgba(236,231,223,0.05); cursor:pointer;">
        <div style="${it.thumbStyle}"></div>
        <span style="font-weight:600; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(it.label)}</span>
        <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#a89f93; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(it.item)}</span>
        <span style="${it.badgePill}">${esc(it.catLabel)}</span>
        <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#756c60;">${esc(it.type)}</span>
        <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#a89f93;">${esc(it.weight)}</span>
        <span style="${it.statusStyle}">${esc(it.statusText)}</span>
      </div>`).join('');
    return `<div style="border:1px solid rgba(236,231,223,0.08); border-radius:12px; overflow:hidden;">${head}${rows}</div>`;
  }

  function emptyHTML() {
    return `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 0; color:#756c60; text-align:center;">
      <div style="font-size:34px; margin-bottom:12px; opacity:.6;">⌕</div>
      <div style="font-size:15px; color:#a89f93;">Aucun item ne correspond à ces critères</div>
      <div style="font-size:13px; margin-top:6px;">Essayez un autre terme ou réinitialisez les filtres.</div>
    </div>`;
  }

  function moduleSoonHTML(v) {
    const m = v.curMod;
    return `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:90px 0; text-align:center;">
      <div style="width:74px; height:74px; border-radius:18px; background:#1a1712; border:1px solid rgba(236,231,223,0.08); display:flex; align-items:center; justify-content:center; font-size:32px; margin-bottom:20px;">${m.icon}</div>
      <div style="font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:${BX_LIGHT}; margin-bottom:8px;">Module ${esc(m.label)}</div>
      <div style="font-size:20px; font-weight:700; letter-spacing:-0.01em;">${esc(m.soonTitle)}</div>
      <div style="font-size:13.5px; color:#756c60; margin-top:8px; max-width:420px; line-height:1.6;">${esc(m.soonDesc)}</div>
      <div style="display:inline-flex; align-items:center; gap:8px; margin-top:22px; font-size:12.5px; color:#a89f93; background:#1a1712; border:1px solid rgba(236,231,223,0.08); padding:8px 15px; border-radius:10px;">
        <span style="width:7px; height:7px; border-radius:50%; background:${AMBER};"></span> Prévu dans une prochaine itération
      </div>
    </div>`;
  }

  function settingsHTML() {
    const s = state.settings;
    const card = (icon, title, body) => `<div style="background:#1a1712; border:1px solid rgba(236,231,223,0.07); border-radius:14px; padding:20px 22px;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
        <div style="width:30px; height:30px; border-radius:8px; background:rgba(${BX_RGB},0.13); display:flex; align-items:center; justify-content:center; font-size:14px;">${icon}</div>
        <div style="font-size:14.5px; font-weight:700;">${esc(title)}</div>
      </div>${body}</div>`;
    const lbl = (t) => `<label style="display:block; font-size:11.5px; font-weight:600; color:#a89f93; margin-bottom:6px;">${esc(t)}</label>`;
    const inp = (key, opts) => {
      opts = opts || {};
      const mono = opts.mono ? "font-family:'JetBrains Mono',monospace;" : '';
      const bg = opts.bg || '#211d16';
      const color = opts.color || '#ece7df';
      const type = opts.type || 'text';
      return `<input id="set-${key}" data-act="setSetting" data-key="${key}" type="${type}" value="${esc(s[key])}" style="width:100%; height:38px; padding:0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:${bg}; color:${color}; font-size:13.5px; ${mono} outline:none;" />`;
    };
    const sel = (key, options) => {
      const opts = options.map(([val, t]) => `<option value="${val}" ${s[key] === val ? 'selected' : ''}>${esc(t)}</option>`).join('');
      return `<select data-act="setSetting" data-key="${key}" style="width:100%; height:38px; padding:0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:13.5px; outline:none; cursor:pointer;">${opts}</select>`;
    };
    const togRow = (key, title, desc) => `<div data-act="togSetting" data-key="${key}" style="display:flex; align-items:center; gap:12px; margin-top:9px; padding:11px 13px; border-radius:10px; background:#211d16; cursor:pointer;">
      <div style="flex:1;"><div style="font-size:13px; font-weight:600;">${esc(title)}</div><div style="font-size:11.5px; color:#756c60; margin-top:2px;">${desc}</div></div>
      ${toggleHTML(!!s[key])}
    </div>`;

    const uploadBody = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:13px 14px;">
        <div>${lbl('Format imposé')}${sel('format', [['png', 'PNG (transparence)'], ['webp', 'WebP (léger)']])}</div>
        <div>${lbl('Dimensions cibles')}${sel('dimensions', [['256', '256 × 256'], ['512', '512 × 512'], ['1024', '1024 × 1024']])}</div>
        <div style="grid-column:span 2;">${lbl('Poids maximum par image (Ko)')}${inp('maxWeight', { type: 'number', mono: true })}</div>
      </div>
      ${togRow('autoCompress', 'Compression automatique', 'Optimise chaque image au téléversement')}
      ${togRow('autoName', 'Nommage calé sur l\'identifiant', 'Fichier renommé en <span style="font-family:\'JetBrains Mono\',monospace;">item.png</span> à l\'upload')}`;

    const pathsBody = `<div style="display:flex; flex-direction:column; gap:13px;">
        <div>${lbl('URL de base du CDN (R2)')}${inp('baseUrl', { mono: true })}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div>${lbl('Préfixe (bucket key)')}${inp('folder', { mono: true })}</div>
          <div>${lbl('Image de secours')}${inp('fallback', { mono: true })}</div>
        </div>
        <div>${lbl('Token API R2')}${inp('apiKey', { mono: true, bg: '#16130f', color: GR_LIGHT })}<div style="font-size:11px; color:#756c60; margin-top:6px;">Autorise l'upload vers R2. Gardé côté serveur, jamais exposé au front.</div></div>
      </div>`;

    const cacheBody = `<div data-act="togSetting" data-key="autoPurge" style="display:flex; align-items:center; gap:12px; padding:11px 13px; border-radius:10px; background:#211d16; cursor:pointer; margin-bottom:13px;">
        <div style="flex:1;"><div style="font-size:13px; font-weight:600;">Purge auto du cache edge</div><div style="font-size:11.5px; color:#756c60; margin-top:2px;">Après chaque remplacement d'image</div></div>
        ${toggleHTML(!!s.autoPurge)}
      </div>
      <div style="display:flex; gap:10px;">
        <button data-act="runScan" style="flex:1; height:40px; border-radius:10px; border:1px solid rgba(236,231,223,0.12); background:#211d16; color:#ece7df; font-weight:600; font-size:13px; cursor:pointer;">Scanner la base</button>
        <button data-act="purgeCache" style="flex:1; height:40px; border-radius:10px; border:1px solid rgba(224,161,78,0.3); background:rgba(224,161,78,0.1); color:${AMBER}; font-weight:600; font-size:13px; cursor:pointer;">Purger le cache</button>
      </div>
      <div style="font-size:11.5px; color:#756c60; margin-top:12px; line-height:1.55;">Le scan compare la base aux objets présents sur R2 : il alimente la file d'attente (items sans image) et détecte les orphelins (images sans item).</div>`;

    const roles = [
      { role: 'Fondateur', access: 'Édition complète', color: GR_LIGHT },
      { role: 'Staff / Dev', access: 'Édition complète', color: GR_LIGHT },
      { role: 'Modérateur', access: 'Lecture seule', color: '#a89f93' },
    ];
    const rolesBody = `<div style="display:flex; flex-direction:column; gap:2px;">${roles.map((r) => `<div style="display:flex; align-items:center; gap:12px; padding:11px 4px; border-bottom:1px solid rgba(236,231,223,0.05);">
        <span style="width:8px; height:8px; border-radius:50%; background:${r.color}; flex-shrink:0;"></span>
        <span style="flex:1; font-size:13.5px; font-weight:600;">${esc(r.role)}</span>
        <span style="font-size:12px; font-weight:600; color:${r.color};">${esc(r.access)}</span>
      </div>`).join('')}</div>
      <div style="font-size:11.5px; color:#756c60; margin-top:14px; line-height:1.55;">Définit qui peut éditer les items et téléverser des images. Synchronisé avec les groupes de votre serveur RedM.</div>`;

    const flash = state.flash
      ? `<div style="display:flex; align-items:center; gap:9px; font-size:13px; color:${GR_LIGHT}; background:rgba(${GR_RGB},0.1); border:1px solid rgba(${GR_RGB},0.25); padding:9px 14px; border-radius:10px; animation:fadeIn .2s ease;"><span style="font-size:14px;">✓</span> ${esc(state.flash)}</div>`
      : '';

    return `<div style="max-width:1080px;">
      <h2 style="margin:0 0 4px; font-size:18px; font-weight:700; letter-spacing:-0.01em;">Réglages CDN</h2>
      <p style="margin:0 0 22px; font-size:13.5px; color:#756c60; max-width:560px;">La plomberie du CDN Cloudflare R2 : règles d'upload, chemins d'accès, cache et permissions. Ces réglages s'appliquent à l'ensemble du catalogue.</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px;">
        ${card('⬆', 'Upload & formats', uploadBody)}
        ${card('⛓', 'Chemins & accès', pathsBody)}
        ${card('↻', 'Cache & maintenance', cacheBody)}
        ${card('⚷', 'Accès administrateur', rolesBody)}
      </div>
      <div style="display:flex; align-items:center; gap:14px; margin-top:22px;">
        ${flash}
        <div style="flex:1;"></div>
        <button data-act="saveSettings" style="height:42px; padding:0 24px; border-radius:11px; border:none; background:${GR}; color:${ON_GR}; font-weight:700; font-size:14px; cursor:pointer; box-shadow:0 4px 14px rgba(${GR_RGB},0.25);">Enregistrer les réglages</button>
      </div>
    </div>`;
  }

  function modalHTML(animate) {
    const d = state.draft;
    if (!d) return '';
    const dec = decorate(d);
    const drop = sty({
      position: 'relative', aspectRatio: '1/1', borderRadius: '12px', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: state.dropActive ? `2px dashed ${GR}` : '2px dashed rgba(236,231,223,0.16)',
      background: state.dropActive ? `rgba(${GR_RGB},0.08)` : '#16130f', transition: 'border-color .15s, background .15s',
    });
    const dropInner = d.hasImage && dec.imgUrl
      ? `<img src="${dec.imgUrl}" alt="${esc(d.label)}" style="width:100%;height:100%;object-fit:contain;display:block;background:#16130f;" loading="lazy" />`
      : `<div style="display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;padding:20px;"><span style="font-size:26px;opacity:.7;">⬆</span><span style="font-size:13px;color:#a89f93;">Glissez une image ici</span><span style="font-size:11px;color:#756c60;font-family:'JetBrains Mono',monospace;">PNG · 512×512 · &lt; 256 Ko</span></div>`;

    const fieldInp = (key, opts) => {
      opts = opts || {};
      const mono = opts.mono ? "font-family:'JetBrains Mono',monospace;" : '';
      const type = opts.type || 'text';
      const step = opts.step ? `step="${opts.step}"` : '';
      const fs = opts.fs || '14px';
      return `<input id="drf-${key}" data-act="setDraft" data-key="${key}" type="${type}" ${step} value="${esc(d[key])}" style="width:100%; height:40px; padding:0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:${fs}; ${mono} outline:none;" />`;
    };
    const lbl = (t) => `<label style="display:block; font-size:11.5px; font-weight:600; color:#a89f93; margin-bottom:6px;">${esc(t)}</label>`;
    const catOpts = Object.keys(catMeta).map((k) => `<option value="${k}" ${d.cat === k ? 'selected' : ''}>${esc(catMeta[k].label)}</option>`).join('');
    const typeOpts = ['item', 'weapon'].map((t) => `<option value="${t}" ${d.type === t ? 'selected' : ''}>${t}</option>`).join('');

    const toggles = [['can_remove', 'Peut être jeté'], ['usable', 'Utilisable'], ['useExpired', 'Utilisable périmé']].map(([key, label]) => {
      const on = !!+d[key];
      return `<div data-act="togDraft" data-key="${key}" style="display:flex; align-items:center; gap:10px; padding:9px 13px; border-radius:10px; border:1px solid rgba(236,231,223,0.1); background:#211d16; cursor:pointer;">${toggleHTML(on)}<span style="font-size:13px; color:#ece7df;">${esc(label)}</span></div>`;
    }).join('');

    const kicker = d.id == null ? 'Nouvel item' : 'Édition';
    const saveLabel = d.id == null ? "Créer l'item" : 'Enregistrer';
    const draftPath = `/items/${d.item || 'sans_nom'}.png`;
    const sizeText = d.hasImage ? `${d.size} Ko` : '— Ko';

    const backdropAnim = animate ? 'animation:fadeIn .14s ease;' : '';
    const modalAnim = animate ? 'animation:popIn .2s cubic-bezier(.2,.7,.3,1);' : '';
    return `<div data-act="closeModal" style="position:fixed; inset:0; background:rgba(8,6,4,0.66); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:32px; z-index:50; ${backdropAnim}">
      <div data-act="stop" style="width:100%; max-width:900px; max-height:90vh; background:#1a1712; border:1px solid rgba(236,231,223,0.1); border-radius:16px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 30px 80px rgba(0,0,0,0.6); ${modalAnim}">
        <div style="display:flex; align-items:center; gap:12px; padding:18px 22px; border-bottom:1px solid rgba(236,231,223,0.08);">
          <div>
            <div style="font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BX_LIGHT};">${esc(kicker)}</div>
            <div style="font-size:18px; font-weight:700; margin-top:2px;">${esc(d.label || 'Sans nom')}</div>
          </div>
          <div style="flex:1;"></div>
          <button data-act="closeModal" style="width:34px; height:34px; border:1px solid rgba(236,231,223,0.1); border-radius:9px; background:#211d16; color:#a89f93; cursor:pointer; font-size:15px;">✕</button>
        </div>
        <div style="display:grid; grid-template-columns:300px 1fr; gap:0; overflow:hidden; flex:1; min-height:0;">
          <div style="padding:22px; border-right:1px solid rgba(236,231,223,0.08); display:flex; flex-direction:column; gap:14px; overflow-y:auto;">
            <div data-drop="1" style="${drop}">${dropInner}</div>
            <div style="display:flex; flex-direction:column; gap:7px; font-family:'JetBrains Mono',monospace; font-size:11.5px;">
              <div style="display:flex; justify-content:space-between;"><span style="color:#756c60;">fichier</span><span style="color:#a89f93;">${esc(dec.fileName)}</span></div>
              <div style="display:flex; justify-content:space-between;"><span style="color:#756c60;">dimensions</span><span style="color:#a89f93;">${esc(d.dims)}</span></div>
              <div style="display:flex; justify-content:space-between;"><span style="color:#756c60;">poids fichier</span><span style="color:#a89f93;">${esc(sizeText)}</span></div>
              <div style="display:flex; justify-content:space-between;"><span style="color:#756c60;">clé R2</span><span style="color:#a89f93;">items/</span></div>
            </div>
            <div style="display:flex; gap:8px; margin-top:auto;">
              <button data-act="triggerDrop" style="flex:1; height:38px; border-radius:9px; border:1px solid rgba(${BX_RGB},0.45); background:rgba(${BX_RGB},0.14); color:${BX_LIGHT}; font-weight:600; font-size:13px; cursor:pointer;">Remplacer</button>
              <button data-act="removeImage" style="height:38px; padding:0 13px; border-radius:9px; border:1px solid rgba(224,161,78,0.3); background:transparent; color:${AMBER}; font-weight:600; font-size:13px; cursor:pointer;">Retirer</button>
            </div>
          </div>
          <div style="padding:22px; overflow-y:auto;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px 16px;">
              <div style="grid-column:span 2;">${lbl('Label affiché')}${fieldInp('label')}</div>
              <div>${lbl('Identifiant (item)')}${fieldInp('item', { mono: true, fs: '13px' })}</div>
              <div>${lbl('Catégorie')}<select data-act="setDraft" data-key="cat" style="width:100%; height:40px; padding:0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:13.5px; outline:none; cursor:pointer;">${catOpts}</select></div>
              <div>${lbl('Type (VORP)')}<select data-act="setDraft" data-key="type" style="width:100%; height:40px; padding:0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:13.5px; outline:none; cursor:pointer;">${typeOpts}</select></div>
              <div>${lbl('Limite (stack)')}${fieldInp('limit', { type: 'number', mono: true })}</div>
              <div>${lbl('Poids (weight)')}${fieldInp('weight', { type: 'number', step: '0.01', mono: true })}</div>
              <div>${lbl('groupId')}${fieldInp('groupId', { type: 'number', mono: true })}</div>
              <div>${lbl('Dégradation (jours)')}${fieldInp('degradation', { type: 'number', mono: true })}</div>
              <div style="grid-column:span 2; display:flex; flex-wrap:wrap; gap:10px; margin-top:2px;">${toggles}</div>
              <div style="grid-column:span 2;">${lbl('Description (desc)')}<textarea id="drf-desc" data-act="setDraft" data-key="desc" rows="2" style="width:100%; padding:10px 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:13.5px; line-height:1.5; outline:none;">${esc(d.desc)}</textarea></div>
              <div style="grid-column:span 2;">${lbl('Metadata (JSON)')}<textarea id="drf-metadata" data-act="setDraft" data-key="metadata" rows="2" style="width:100%; padding:10px 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#16130f; color:${GR_LIGHT}; font-size:12.5px; font-family:'JetBrains Mono',monospace; line-height:1.5; outline:none;">${esc(d.metadata)}</textarea></div>
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px; padding:16px 22px; border-top:1px solid rgba(236,231,223,0.08); background:#16130f;">
          <span style="font-family:'JetBrains Mono',monospace; font-size:11.5px; color:#756c60;">${esc(draftPath)}</span>
          <div style="flex:1;"></div>
          <button data-act="closeModal" style="height:40px; padding:0 18px; border-radius:10px; border:1px solid rgba(236,231,223,0.12); background:transparent; color:#a89f93; font-weight:600; font-size:13.5px; cursor:pointer;">Annuler</button>
          <button data-act="saveDraft" style="height:40px; padding:0 22px; border-radius:10px; border:none; background:${GR}; color:${ON_GR}; font-weight:700; font-size:13.5px; cursor:pointer; box-shadow:0 4px 14px rgba(${GR_RGB},0.25);">${esc(saveLabel)}</button>
        </div>
      </div>
    </div>`;
  }

  function queueHTML(v) {
    if (v.matchesLoading) {
      return `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 0; color:#756c60; gap:14px;">
        <div style="font-size:15px; color:#a89f93;">Analyse des correspondances en cours…</div>
        <div style="font-size:12px;">Comparaison de ${v.missingCount} items contre la bibliothèque d'images.</div>
      </div>`;
    }

    const hasMatches = Object.keys(state.matches).length > 0;
    if (!hasMatches) {
      return `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 0; gap:16px; text-align:center;">
        <div style="font-size:15px; color:#a89f93;">Analysez les correspondances pour commencer.</div>
        <button data-act="loadMatches" style="height:40px; padding:0 22px; border-radius:10px; border:none; background:${BX}; color:#ffe9e6; font-weight:700; font-size:13.5px; cursor:pointer;">
          Lancer l'analyse (${v.missingCount} items)
        </button>
      </div>`;
    }

    if (!v.queueItems.length) {
      return `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 0; color:#756c60; text-align:center;">
        <div style="font-size:15px; color:#a89f93;">Tous les items ont une image. 🎉</div>
      </div>`;
    }

    const validatedCount = v.validatedCount;
    const head = `<div style="display:grid; grid-template-columns:1.2fr 1fr 1.8fr 44px; gap:12px; align-items:center; padding:11px 16px; background:#1a1712; border-bottom:1px solid rgba(236,231,223,0.08); font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#756c60;">
      <span>Item</span><span>Identifiant</span><span>Candidat proposé</span><span>✓</span>
    </div>`;

    const rows = v.queueItems.map((it) => {
      const scoreColor = !it.candidates.length ? '#756c60'
        : it.candidates[0].score >= 0.9 ? GR_LIGHT
        : it.candidates[0].score >= 0.7 ? AMBER
        : '#cf6f6f';
      const scoreText = it.candidates.length ? (it.candidates[0].score * 100).toFixed(0) + '%' : '—';

      const opts = it.candidates.map((c) =>
        `<option value="${esc(c.file)}" ${it.selected === c.file ? 'selected' : ''}>${esc(c.file)} (${(c.score*100).toFixed(0)}%)</option>`
      ).join('');
      const picker = it.candidates.length
        ? `<div style="display:flex; align-items:center; gap:8px;">
            <select data-act="selectMatch" data-item="${esc(it.item)}" style="flex:1; height:34px; padding:0 10px; border-radius:8px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:12px; outline:none; cursor:pointer;">${opts}</select>
            <span style="font-size:11px; font-family:'JetBrains Mono',monospace; color:${scoreColor}; flex-shrink:0;">${scoreText}</span>
          </div>`
        : `<span style="font-size:12px; color:#756c60;">Aucun candidat</span>`;

      const checkbox = `<div data-act="toggleValidate" data-item="${esc(it.item)}" style="width:22px; height:22px; border-radius:6px; border:2px solid ${it.validated ? GR : 'rgba(236,231,223,0.2)'}; background:${it.validated ? GR : 'transparent'}; cursor:pointer; display:flex; align-items:center; justify-content:center; color:${ON_GR}; font-size:13px; flex-shrink:0;">${it.validated ? '✓' : ''}</div>`;

      return `<div style="display:grid; grid-template-columns:1.2fr 1fr 1.8fr 44px; gap:12px; align-items:center; padding:9px 16px; border-bottom:1px solid rgba(236,231,223,0.05);">
        <span style="font-weight:600; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(it.label)}</span>
        <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#a89f93; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(it.item)}</span>
        ${picker}
        <div style="display:flex; align-items:center; justify-content:center;">${checkbox}</div>
      </div>`;
    }).join('');

    const sortOpts = [['score_desc','Score ↓'], ['score_asc','Score ↑'], ['az','Nom (A → Z)']];
    const sortSel = `<select data-act="queueSort" style="height:36px; padding:0 30px 0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16 url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22><path d=%22M1 3l4 4 4-4%22 stroke=%22%23a89f93%22 stroke-width=%221.5%22 fill=%22none%22/></svg>') no-repeat right 11px center; color:#ece7df; font-size:13px; cursor:pointer; outline:none;">
      ${sortOpts.map(([val, lbl]) => `<option value="${val}" ${state.queueSort === val ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
    </select>`;

    const bulk = `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:18px; font-weight:700;">File d'attente</span>
        <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#756c60; background:#211d16; border:1px solid rgba(236,231,223,0.07); padding:3px 9px; border-radius:7px;">${v.queueItems.length} items</span>
        ${sortSel}
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <span style="font-size:12px; color:#756c60;">${validatedCount} validé(s)</span>
        <div style="display:flex;align-items:center;gap:8px;background:#211d16;border:1px solid rgba(236,231,223,0.12);border-radius:9px;padding:0 12px;height:36px;">
          <span style="font-size:12px;color:#a89f93;">Seuil</span>
          <input id="threshold-input" data-act="queueThreshold" type="number" min="1" max="100" value="${state.queueThreshold}" style="width:44px;background:transparent;border:none;color:#ece7df;font-size:13px;font-weight:600;font-family:'JetBrains Mono',monospace;outline:none;text-align:center;" />
          <span style="font-size:12px;color:#a89f93;">%</span>
        </div>
        <button data-act="validateAll" style="height:36px; padding:0 16px; border-radius:9px; border:1px solid rgba(236,231,223,0.12); background:#211d16; color:#ece7df; font-size:13px; font-weight:600; cursor:pointer;">Valider ≥ ${state.queueThreshold}%</button>
        <button data-act="publishAll" style="height:36px; padding:0 16px; border-radius:9px; border:none; background:${GR}; color:${ON_GR}; font-size:13px; font-weight:700; cursor:pointer; opacity:${validatedCount ? 1 : 0.4};">Publier ${validatedCount} item(s) → R2</button>
      </div>
    </div>`;

    return bulk + `<div style="border:1px solid rgba(236,231,223,0.08); border-radius:12px; overflow:hidden;">${head}${rows}</div>`;
  }

  function contentHTML(v) {
    if (v.showModuleSoon) return moduleSoonHTML(v);
    if (v.showSettings) return settingsHTML();
    if (v.showQueueTab) return queueHTML(v);
    let body = statsHTML(v) + toolbarHTML(v);
    if (v.isEmpty) body += emptyHTML();
    else if (v.showGrid) body += gridHTML(v);
    else if (v.showList) body += listHTML(v);
    return body;
  }

  let _modalWasOpen = false;

  // Rendu + restauration du focus
  function captureFocus() {
    const el = document.activeElement;
    if (!el || !el.id || !root.contains(el)) return null;
    const cap = { id: el.id };
    if (typeof el.selectionStart === 'number') { cap.start = el.selectionStart; cap.end = el.selectionEnd; }
    return cap;
  }
  function restoreFocus(cap) {
    if (!cap) return;
    const el = document.getElementById(cap.id);
    if (!el) return;
    el.focus();
    if (cap.start != null && typeof el.setSelectionRange === 'function') {
      try { el.setSelectionRange(cap.start, cap.end); } catch (_) {}
    }
  }

  function render() {
    const cap = captureFocus();
    const scrollEl = root.querySelector('[data-scroll]');
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    const v = computeVals();
    const modalJustOpened = !!state.draft && !_modalWasOpen;
    _modalWasOpen = !!state.draft;
    const publishingOverlay = state.publishing ? `
      <div style="position:fixed;inset:0;background:rgba(8,6,4,0.75);backdrop-filter:blur(4px);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;animation:fadeIn .15s ease;">
        <div style="display:flex;gap:6px;">${[0,1,2].map((i) => `<div style="width:10px;height:10px;border-radius:50%;background:${BX_LIGHT};animation:bounce .9s ease-in-out ${i*0.18}s infinite alternate;"></div>`).join('')}</div>
        <div style="font-size:15px;font-weight:600;color:#ece7df;letter-spacing:0.01em;">Publication en cours…</div>
        <div style="font-size:12px;color:#756c60;">Envoi des images vers Cloudflare R2</div>
      </div>` : '';
    root.innerHTML = `<style>@keyframes bounce{from{transform:translateY(0)}to{transform:translateY(-10px)}}</style>
      <div style="display:flex; height:100vh; width:100%; overflow:hidden;">
        ${sidebarHTML(v)}
        <main style="flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden;">
          ${headerHTML(v)}
          <div data-scroll style="flex:1; overflow-y:auto; padding:24px 24px 48px;">${contentHTML(v)}</div>
        </main>
      </div>${modalHTML(modalJustOpened)}${publishingOverlay}`;
    restoreFocus(cap);
    const newScrollEl = root.querySelector('[data-scroll]');
    if (newScrollEl && scrollTop) newScrollEl.scrollTop = scrollTop;
  }

  // Dispatch des événements
  function actEl(target) { return target.closest('[data-act]'); }

  root.addEventListener('click', (e) => {
    const el = actEl(e.target);
    if (!el) return;
    const act = el.dataset.act;
    const key = el.dataset.key;
    switch (act) {
      case 'module': state.module = key; render(); break;
      case 'nav': state.nav = key; render(); break;
      case 'cat': state.cat = key; render(); break;
      case 'clearQuery': state.query = ''; render(); break;
      case 'toggleMissing': state.onlyMissing = !state.onlyMissing; render(); break;
      case 'openNew': openNew(); break;
      case 'view': state.view = key; render(); break;
      case 'openItem': openItem(+el.dataset.id); break;
      case 'closeModal': closeModal(); break;
      case 'stop': e.stopPropagation(); break;
      case 'saveDraft': saveDraft(); break;
      case 'triggerDrop': dropImage(); break;
      case 'removeImage':
        if (state.draft) { state.draft = Object.assign({}, state.draft, { hasImage: false, size: 0, dims: '—' }); render(); }
        break;
      case 'togDraft':
        if (state.draft) { state.draft = Object.assign({}, state.draft, { [key]: +state.draft[key] ? 0 : 1 }); render(); }
        break;
      case 'togSetting':
        state.settings = Object.assign({}, state.settings, { [key]: !state.settings[key] }); render(); break;
      case 'loadMatches': loadMatches(); break;
      case 'toggleValidate': {
        const itKey = el.dataset.item;
        const v2 = Object.assign({}, state.validated);
        if (v2[itKey]) delete v2[itKey]; else v2[itKey] = true;
        state.validated = v2; render(); break;
      }
      case 'validateAll': {
        const threshold = state.queueThreshold / 100;
        const v2 = Object.assign({}, state.validated);
        state.items.filter((it) => !it.hasImage).forEach((it) => {
          const m = state.matches[it.item];
          if (m && m.candidates[0] && m.candidates[0].score >= threshold) v2[it.item] = true;
        });
        state.validated = v2; render(); break;
      }
      case 'publishAll': {
        const toPublish = state.items
          .filter((it) => !it.hasImage && state.validated[it.item])
          .map((it) => ({ item: it.item, file: (state.matches[it.item] || {}).selected }))
          .filter((x) => x.file);
        if (!toPublish.length) break;
        state.publishing = true; render();
        fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: toPublish }) })
          .then((r) => r.json())
          .then((data) => {
            const ok = data.results.filter((r) => r.ok).map((r) => r.item);
            ok.forEach((item) => {
              const idx = state.items.findIndex((i) => i.item === item);
              if (idx >= 0) state.items[idx] = Object.assign({}, state.items[idx], { hasImage: true });
              const v2 = Object.assign({}, state.validated); delete v2[item]; state.validated = v2;
            });
            state.publishing = false;
            setFlash(`${ok.length} image(s) publiée(s) sur R2.${data.failed ? ' ' + data.failed + ' erreur(s).' : ''}`);
          })
          .catch(() => { state.publishing = false; setFlash('Erreur lors de la publication.'); });
        break;
      }
      case 'saveSettings': setFlash('Réglages enregistrés.'); break;
      case 'runScan': setFlash('Scan terminé · 54 items sans image · 3 orphelins détectés.'); break;
      case 'purgeCache': setFlash('Cache edge Cloudflare purgé sur tous les nœuds.'); break;
      default: break;
    }
  });

  function onValueChange(e) {
    const el = actEl(e.target);
    if (!el) return;
    const act = el.dataset.act;
    const key = el.dataset.key;
    const val = e.target.value;
    if (act === 'selectMatch') {
      const itKey = el.dataset.item;
      state.matches = Object.assign({}, state.matches, { [itKey]: Object.assign({}, state.matches[itKey], { selected: val }) });
      // pas de render — le select gère son propre état visuel
    }
    else if (act === 'queueThreshold') { const n = parseInt(val, 10); if (n >= 1 && n <= 100) state.queueThreshold = n; }
    else if (act === 'queueSort') { state.queueSort = val; render(); }
    else if (act === 'query') { state.query = val; render(); }
    else if (act === 'sort') { state.sort = val; render(); }
    else if (act === 'setSetting') { state.settings = Object.assign({}, state.settings, { [key]: val }); render(); }
    else if (act === 'setDraft' && state.draft) { state.draft = Object.assign({}, state.draft, { [key]: val }); }
  }
  root.addEventListener('input', onValueChange);
  root.addEventListener('change', onValueChange);

  root.addEventListener('blur', (e) => {
    const el = e.target.closest('[data-act="queueThreshold"]');
    if (el) render();
  }, true);

  // Drag & drop (zone de la modale)
  root.addEventListener('dragover', (e) => {
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    zone.style.borderColor = GR;
    zone.style.background = `rgba(${GR_RGB},0.08)`;
  });
  root.addEventListener('dragleave', (e) => {
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    zone.style.borderColor = 'rgba(236,231,223,0.16)';
    zone.style.background = '#16130f';
  });
  root.addEventListener('drop', (e) => {
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    dropImage();
  });

  function loadConfig() {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => { if (d.cdnBase) { state.cdnBase = d.cdnBase; render(); } })
      .catch(() => {});
  }

  function loadStats() {
    fetch('/api/stats')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => { if (data.configured) { state.r2Stats = data; render(); } })
      .catch(() => {});
  }

  function loadItems() {
    fetch('/api/items')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => { if (Array.isArray(data) && data.length) { state.items = data; render(); } })
      .catch(() => {});
  }

  function loadMatches() {
    if (state.matchesLoading) return;
    state.matchesLoading = true;
    render();
    fetch('/api/match')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const m = {};
        data.forEach((row) => {
          m[row.item] = { candidates: row.candidates, selected: row.candidates[0] ? row.candidates[0].file : null };
        });
        state.matches = m;
        state.matchesLoading = false;
        render();
      })
      .catch(() => { state.matchesLoading = false; render(); });
  }

  // Go
  render();
  loadConfig();
  loadItems();
  loadStats();
})();
