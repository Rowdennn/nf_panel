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
  const PICKER_CHUNK = 120; // lot d'images chargées par scroll dans la banque d'images

  // Données (catégories) — alignées sur l'enum groupId de vorp_inventory/config/groups.lua
  const catMeta = {
    food:     { label: 'Provisions',       hue: 45  },
    medical:  { label: 'Médical',          hue: 155 },
    material: { label: 'Outils & mat.',    hue: 95  },
    weapon:   { label: 'Arme',             hue: 12  },
    ammo:     { label: 'Munitions',        hue: 62  },
    animal:   { label: 'Ressource animale',hue: 35  },
    document: { label: 'Document',         hue: 210 },
    valuable: { label: 'Objet de valeur',  hue: 48  },
    horse:    { label: 'Cheval',           hue: 28  },
    herb:     { label: 'Herbe / commerce', hue: 130 },
    misc:     { label: 'Divers',           hue: 285 },
  };
  // description du groupe (table item_group) → catégorie sémantique panel.
  const groupCatByDesc = {
    default: 'misc', medical: 'medical', foods: 'food', tools: 'material',
    weapons: 'weapon', ammo: 'ammo', documents: 'document', animals: 'animal',
    valuables: 'valuable', horse: 'horse', herbs: 'herb',
  };
  // Libellé affiché d'un groupe : label FR de la catégorie, repli sur la description brute.
  function groupLabel(g) {
    const cat = groupCatByDesc[g.description] || 'misc';
    return catMeta[cat] ? catMeta[cat].label : g.description;
  }
  function groupCat(id) {
    const g = state.groups.find((x) => Number(x.id) === Number(id));
    return g ? (groupCatByDesc[g.description] || 'misc') : 'misc';
  }


  // Modules (Grades retiré ; Inventaires renommé en Coffres)
  const moduleDef = [
    { key: 'items', label: 'Items', icon: '▦', soon: false, soonTitle: 'Gestion des items', soonDesc: '' },
    { key: 'jobs', label: 'Jobs', icon: '⚒', soon: true, soonTitle: 'Gestion des jobs', soonDesc: 'Gestion : Créer, renommer et supprimer les jobs, grades, salaires. \n Staff : Liste des jobs, nombre de joueurs dans un job, liste des joueurs qui ont ce job etc...' },
    { key: 'players', label: 'Joueurs', icon: '☻', soon: true, soonTitle: 'Gestion des joueurs', soonDesc: 'Gestion : Wipe, Gestion inventaire, Gestion argent etc... \b Staff : Rechercher un personnage, consulter son inventaire, historique de connexions, sanctions, job, crew etc...' },
    { key: 'inventory', label: 'Coffres', icon: '▢', soon: true, soonTitle: 'Gestion des coffres', soonDesc: 'Gestion : Modification des paramètres d\'un coffre, Gestion de l\'inventaire du coffre. Staff : Inspecter les coffres, owner (crew ou joueur) du coffre, derniers logs du coffre etc...' },
  ];

  // État
  const state = {
    items: [],
    groups: [],
    query: '', cat: 'all', onlyMissing: false, sort: 'recent',
    draft: null, dropActive: false, module: 'items', nav: 'gallery',
    libraryFiles: [],
    libraryLoading: false,
    libraryError: null,
    pickerOpen: false,
    pickerQuery: '',
    pickerSelectedFile: null,
    pickerVisibleCount: 120, // rendu progressif — évite 3000+ cartes DOM d'un coup
    r2Stats: null,
    cdnBase: '',

    uploading: false,
    saving: false,
    devRoOverride: false,
    flash: null,
    authChecked: false,
    user: null,
    access: null, // 'full' | 'readonly' | null
  };
  const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  function canWrite() { return !state.devRoOverride && state.access === 'full'; }
  let flashTimer = null;
  function setFlash(msg, type) {
    state.flash = { msg, type: type || 'success' };
    render();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { state.flash = null; render(); }, 2800);
  }

  function decorate(it) {
    const hue = catMeta[it.cat] ? catMeta[it.cat].hue : 285;
    const a = `oklch(0.34 0.05 ${hue})`, b = `oklch(0.285 0.045 ${hue})`;
    const imgUrl = it.hasImage && state.cdnBase
      ? (state.cdnBase.replace(/\/$/, '') + '/items/' + encodeURIComponent(it.item) + '.png' + (it.updatedAt ? '?v=' + it.updatedAt : ''))
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
      thumbStyle: `width:40px;height:40px;border-radius:8px;${thumbBg}border:${it.hasImage ? '1px solid rgba(236,231,223,0.08)' : '1.5px dashed rgba(224,161,78,0.5)'};`,
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
    state.draft = { id: null, item: '', label: '', cat: 'misc', limit: 1, weight: 0.5, can_remove: 1, usable: 0, useExpired: 0, groupId: 9, degradation: 0, desc: '', metadata: '{}', hasImage: false, size: 0 };
    render();
  }
  function closeModal() { state.draft = null; render(); }
  function finalizeDraft(d) {
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
  function saveDraft() {
    const d = state.draft;
    if (!d || state.saving) return;
    if (d.id == null) { setFlash("Création d'item non disponible pour l'instant.", 'error'); return; }

    state.saving = true;
    render();

    const fields = {
      label: d.label, groupId: Number(d.groupId), limit: Number(d.limit),
      weight: Number(d.weight), can_remove: Number(d.can_remove),
      usable: Number(d.usable), useExpired: Number(d.useExpired),
      degradation: Number(d.degradation), desc: d.desc, metadata: d.metadata,
    };

    fetch(`/api/items/${encodeURIComponent(d.item)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          state.saving = false;
          const msg = data.error === 'item_not_found' ? 'Item introuvable en base.'
            : data.error === 'invalid_group' ? 'Catégorie invalide.'
            : data.error === 'invalid_metadata' ? 'Metadata : JSON invalide.'
            : data.error === 'field_too_long' ? `Champ trop long (${data.field}).`
            : data.error === 'invalid_field' ? `Champ invalide (${data.field}).`
            : 'Erreur lors de la sauvegarde.';
          setFlash(msg, 'error');
          return;
        }
        if (!d.pendingFile) {
          state.saving = false;
          finalizeDraft(d); setFlash('Modifications enregistrées.'); return;
        }
        return fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ item: d.item, file: d.pendingFile }] }),
        })
          .then((r) => r.json())
          .then((pub) => {
            state.saving = false;
            const imgOk = pub.results && pub.results.some((r) => r.ok);
            finalizeDraft(Object.assign({}, d, { hasImage: imgOk || d.hasImage, pendingFile: null }));
            setFlash(imgOk ? 'Modifications et image enregistrées.' : 'Infos sauvegardées, image non publiée.', imgOk ? 'success' : 'warn');
            if (imgOk) { loadStats(); loadItems(); }
          });
      })
      .catch(() => { state.saving = false; setFlash('Erreur réseau.', 'error'); });
  }
  function uploadAndAttach(file) {
    if (!state.draft || !file) return;
    if (file.type !== 'image/png') { setFlash('Seuls les fichiers PNG sont acceptés.'); return; }
    state.uploading = true;
    state.dropActive = false;
    render();
    const fd = new FormData();
    fd.append('image', file);
    fetch('/api/upload', { method: 'POST', body: fd })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        state.uploading = false;
        if (!ok || !data.file) {
          const msg = data.error === 'invalid_file_type' ? 'Seuls les fichiers PNG sont acceptés.'
            : data.error === 'file_too_large' ? 'Fichier trop volumineux (max 8 Mo).'
            : "Échec de l'upload.";
          setFlash(msg, 'error');
          render();
          return;
        }
        if (state.draft) state.draft = Object.assign({}, state.draft, { pendingFile: data.file, hasImage: true, size: Math.round(file.size / 1024) });
        render();
      })
      .catch(() => { state.uploading = false; setFlash("Échec de l'upload.", 'error'); render(); });
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

    const showGalleryTab = inItems;

    const pq = state.pickerQuery.trim().toLowerCase();
    const pickerFiles = s.libraryFiles
      .filter((file) => !pq || file.toLowerCase().includes(pq))
      .sort((a, b) => a.localeCompare(b));

    return {
      q, inItems, total, onlineCount, missingCount, catCounts, items,
      showGalleryTab, showModuleSoon: !inItems,
      isEmpty: showGalleryTab && items.length === 0,
      showList: showGalleryTab && items.length > 0,
      curMod: moduleDef.find((m) => m.key === s.module) || moduleDef[0],
      pickerFiles,
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
    const spacer = v.showGalleryTab ? '' : '<div style="flex:1;"></div>';

    let storWidget = '';
    if (v.inItems) {
      const st = state.r2Stats;
      const usedBytes = st ? st.sizeBytes : 0;
      const usedMb = (usedBytes / 1024 / 1024).toFixed(2);
      const fileCount = st ? st.count : '—';
      storWidget = `<div style="padding:14px; border-top:1px solid rgba(236,231,223,0.06);">
        <div style="background:#211d16; border:1px solid rgba(236,231,223,0.07); border-radius:11px; padding:13px 14px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:7px;">
            <span style="font-size:12px; color:#a89f93;">Stockage R2</span>
            <span style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#756c60;">${st ? usedMb + ' Mo' : '…'} / 10 Go</span>
          </div>
          <div style="font-size:11px; color:#756c60;">${fileCount} fichiers</div>
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
    const importBtn = canWrite()
      ? `<button data-act="openNew" style="display:flex; align-items:center; gap:8px; height:40px; padding:0 17px; border-radius:10px; border:none; background:${GR}; color:${ON_GR}; font-weight:700; font-size:13.5px; cursor:pointer; box-shadow:0 4px 14px rgba(${GR_RGB},0.25);"><span style="font-size:17px; line-height:1; margin-top:-1px;">＋</span> Créer un item</button>`
      : '';
    const rightTools = v.showGalleryTab
      ? `<div style="display:flex; align-items:center; gap:16px;">
          <button data-act="toggleMissing" style="${missStyle}"><span style="width:7px; height:7px; border-radius:50%; background:${AMBER};"></span> Images manquantes</button>
          ${importBtn}
        </div>`
      : '';
    const readonlyBadge = !canWrite()
      ? `<span style="display:flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;background:rgba(224,161,78,0.13);border:1px solid rgba(224,161,78,0.3);color:${AMBER};font-size:12px;font-weight:600;"><span style="width:6px;height:6px;border-radius:50%;background:${AMBER};"></span> Lecture seule</span>`
      : '';
    const userChip = s.user
      ? `<div style="display:flex;align-items:center;gap:10px;">
          ${readonlyBadge}
          <div style="display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border-radius:20px;background:#211d16;border:1px solid rgba(236,231,223,0.08);">
            ${s.user.avatar
              ? `<img src="https://cdn.discordapp.com/avatars/${s.user.id}/${s.user.avatar}.png?size=32" style="width:24px;height:24px;border-radius:50%;display:block;" />`
              : `<div style="width:24px;height:24px;border-radius:50%;background:${BX};"></div>`}
            <span style="font-size:13px;color:#ece7df;font-weight:600;">${esc(s.user.username)}</span>
            <button data-act="logout" title="Se déconnecter" style="width:22px;height:22px;border:none;border-radius:6px;background:transparent;color:#756c60;cursor:pointer;font-size:13px;">⏻</button>
          </div>
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
      ${IS_DEV ? (() => {
        const on = state.devRoOverride;
        return `<button data-act="togDevRo" title="Simuler lecture seule (dev uniquement)" style="height:30px;padding:0 11px;border-radius:8px;border:1px dashed ${on ? 'rgba(224,161,78,0.6)' : 'rgba(236,231,223,0.2)'};background:${on ? 'rgba(224,161,78,0.1)' : 'transparent'};color:${on ? AMBER : '#756c60'};font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;">${on ? '👁 RO actif' : '👁 Sim. RO'}</button>`;
      })() : ''}
      ${userChip}
    </header>`;
  }

  function statsHTML(v) {
    var pct = v.total ? ((v.onlineCount / v.total) * 100).toFixed(1) : '0.0';
    var cards = [
      { label: 'Items référencés', value: String(v.total), unit: '', sub: 'total en base', color: '#ece7df' },
      { label: 'Images en ligne', value: String(v.onlineCount), unit: pct + ' %', sub: 'couverture du catalogue', color: GR_LIGHT },
      { label: 'Images manquantes', value: String(v.missingCount), unit: 'à téléverser', color: v.missingCount > 0 ? AMBER : GR_LIGHT },
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
    const opt = (val, label) => `<option value="${val}" ${s.sort === val ? 'selected' : ''}>${esc(label)}</option>`;
    return `<div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <h2 style="margin:0; font-size:18px; font-weight:700; letter-spacing:-0.01em;">${esc(v.galleryTitle)}</h2>
      <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#756c60; background:#211d16; border:1px solid rgba(236,231,223,0.07); padding:3px 9px; border-radius:7px;">${v.items.length} résultats</span>
      <div style="flex:1;"></div>
      <select data-act="sort" style="height:36px; padding:0 30px 0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16 url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22><path d=%22M1 3l4 4 4-4%22 stroke=%22%23a89f93%22 stroke-width=%221.5%22 fill=%22none%22/></svg>') no-repeat right 11px center; color:#ece7df; font-size:13px; cursor:pointer; outline:none;">
        ${opt('recent', 'Récemment modifiés')}${opt('az', 'Nom (A → Z)')}${opt('weight', 'Poids décroissant')}
      </select>
    </div>`;
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
        <span style="width:7px; height:7px; border-radius:50%; background:${AMBER};"></span> Prévu dans une prochaine mise à jour !
      </div>
    </div>`;
  }



  function modalHTML(animate) {
    const d = state.draft;
    if (!d) return '';
    const dec = decorate(d);
    const ro = !canWrite();
    const drop = sty({
      position: 'relative', aspectRatio: '1/1', borderRadius: '12px', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: ro ? 'default' : 'pointer',
      border: state.dropActive ? `2px dashed ${GR}` : '2px dashed rgba(236,231,223,0.16)',
      background: state.dropActive ? `rgba(${GR_RGB},0.08)` : '#16130f', transition: 'border-color .15s, background .15s',
    });
    const previewUrl = d.pendingFile ? `/api/library-image/${encodeURIComponent(d.pendingFile)}` : dec.imgUrl;
    const dropInner = d.hasImage && previewUrl
      ? `<img src="${previewUrl}" alt="${esc(d.label)}" style="width:100%;height:100%;object-fit:contain;display:block;background:#16130f;" loading="lazy" />`
      : `<div style="display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;padding:20px;"><span style="font-size:26px;opacity:.7;">⬆</span><span style="font-size:13px;color:#a89f93;">Glissez une image ici</span><span style="font-size:11px;color:#756c60;font-family:'JetBrains Mono',monospace;">PNG · 512×512 · &lt; 256 Ko</span></div>`;

    const fieldInp = (key, opts) => {
      opts = opts || {};
      const mono = opts.mono ? "font-family:'JetBrains Mono',monospace;" : '';
      const type = opts.type || 'text';
      const step = opts.step ? `step="${opts.step}"` : '';
      const fs = opts.fs || '14px';
      const isRo = ro || !!opts.forceRo;
      const isBlocked = !!opts.forceRo;
      return `<input id="drf-${key}" data-act="setDraft" data-key="${key}" type="${type}" ${step} ${isRo ? 'readonly' : ''} value="${esc(d[key])}" style="width:100%; height:40px; padding:0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:${fs}; ${mono} outline:none; ${isRo ? 'opacity:.7;' : ''}${isBlocked ? 'cursor:not-allowed;' : isRo ? 'cursor:default;' : ''}" />`;
    };
    const lbl = (t) => `<label style="display:block; font-size:11.5px; font-weight:600; color:#a89f93; margin-bottom:6px;">${esc(t)}</label>`;
    const groupIdOpts = state.groups.map((g) => `<option value="${g.id}" ${Number(d.groupId) === Number(g.id) ? 'selected' : ''}>${esc(groupLabel(g))}</option>`).join('');


    const toggles = [['can_remove', 'Peut être jeté'], ['usable', 'Utilisable'], ['useExpired', 'Utilisable périmé']].map(([key, label]) => {
      const on = !!+d[key];
      return `<div data-act="togDraft" data-key="${key}" style="display:flex; align-items:center; gap:10px; padding:9px 13px; border-radius:10px; border:1px solid rgba(236,231,223,0.1); background:#211d16; cursor:pointer;">${toggleHTML(on)}<span style="font-size:13px; color:#ece7df;">${esc(label)}</span></div>`;
    }).join('');

    const kicker = d.id == null ? 'Nouvel item' : 'Édition';
    const saveLabel = d.id == null ? "Créer l'item" : 'Enregistrer';
    const draftPath = `/items/${d.item || 'sans_nom'}.png`;
    const fileNameText = d.pendingFile || dec.fileName;
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
            <div data-act="triggerDrop" data-drop="1" style="${drop}">${dropInner}</div>
            <input id="file-upload-input" type="file" accept="image/png" style="display:none;" />
            <div style="display:flex; flex-direction:column; gap:7px; font-family:'JetBrains Mono',monospace; font-size:11.5px;">
              <div style="display:flex; justify-content:space-between;"><span style="color:#756c60;">fichier</span><span style="color:#a89f93;">${esc(fileNameText)}</span></div>
              <div style="display:flex; justify-content:space-between;"><span style="color:#756c60;">poids fichier</span><span style="color:#a89f93;">${esc(sizeText)}</span></div>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:auto;">
              ${ro ? '' : `<button data-act="openPicker" style="height:38px; border-radius:9px; border:1px dashed rgba(${GR_RGB},0.5); background:rgba(${GR_RGB},0.08); color:${GR_LIGHT}; font-weight:600; font-size:13px; cursor:pointer;">Ajouter depuis la banque d'images</button>`}
            </div>
          </div>
          <div style="padding:22px; overflow-y:auto;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px 16px;">
              <div style="grid-column:span 2;">${lbl('Label affiché')}${fieldInp('label')}</div>
              <div>${lbl('Identifiant (item)')}${fieldInp('item', { mono: true, fs: '13px', forceRo: d.id != null })}</div>
              <div>${lbl('Catégorie')}<select data-act="setDraft" data-key="groupId" ${ro ? 'disabled' : ''} style="width:100%; height:40px; padding:0 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:13.5px; outline:none; cursor:pointer;">${groupIdOpts}</select></div>
              <div>${lbl('Limite (stack)')}${fieldInp('limit', { type: 'number', mono: true })}</div>
              <div>${lbl('Poids (weight)')}${fieldInp('weight', { type: 'number', step: '0.01', mono: true })}</div>
              <div>${lbl('Dégradation (jours)')}${fieldInp('degradation', { type: 'number', mono: true })}</div>
              <div style="grid-column:span 2; display:flex; flex-wrap:wrap; gap:10px; margin-top:2px;">${toggles}</div>
              <div style="grid-column:span 2;">${lbl('Description (desc)')}<textarea id="drf-desc" data-act="setDraft" data-key="desc" rows="2" ${ro ? 'readonly' : ''} style="width:100%; padding:10px 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:13.5px; line-height:1.5; outline:none;">${esc(d.desc)}</textarea></div>
              <div style="grid-column:span 2;">${lbl('Metadata (JSON)')}<textarea id="drf-metadata" data-act="setDraft" data-key="metadata" rows="2" ${ro ? 'readonly' : ''} style="width:100%; padding:10px 12px; border-radius:9px; border:1px solid rgba(236,231,223,0.1); background:#16130f; color:${GR_LIGHT}; font-size:12.5px; font-family:'JetBrains Mono',monospace; line-height:1.5; outline:none;">${esc(d.metadata)}</textarea></div>
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px; padding:16px 22px; border-top:1px solid rgba(236,231,223,0.08); background:#16130f;">
          <span style="font-family:'JetBrains Mono',monospace; font-size:11.5px; color:#756c60;">${esc(draftPath)}</span>
          <div style="flex:1;"></div>
          <button data-act="closeModal" style="height:40px; padding:0 18px; border-radius:10px; border:1px solid rgba(236,231,223,0.12); background:transparent; color:#a89f93; font-weight:600; font-size:13.5px; cursor:pointer;">${ro ? 'Fermer' : 'Annuler'}</button>
          ${ro ? '' : (() => {
            const sv = state.saving;
            const spinner = `<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(0,0,0,0.25);border-top-color:${ON_GR};border-radius:50%;animation:spinBtn .7s linear infinite;vertical-align:middle;"></span>`;
            return `<button data-act="saveDraft" style="height:40px; padding:0 22px; border-radius:10px; border:none; background:${GR}; color:${ON_GR}; font-weight:700; font-size:13.5px; cursor:${sv ? 'not-allowed' : 'pointer'}; opacity:${sv ? '0.75' : '1'}; box-shadow:0 4px 14px rgba(${GR_RGB},0.25); display:inline-flex; align-items:center; gap:8px;">${sv ? spinner : ''}${sv ? 'Enregistrement…' : esc(saveLabel)}</button>`;
          })()}
        </div>
      </div>
    </div>`;
  }

  function pickerModalHTML(animate) {
    if (!state.pickerOpen || !state.draft) return '';
    const allFiles = computeVals().pickerFiles;
    const visibleCount = Math.min(state.pickerVisibleCount, allFiles.length);
    const files = allFiles.slice(0, visibleCount);
    const backdropAnim = animate ? 'animation:fadeIn .14s ease;' : '';
    const modalAnim = animate ? 'animation:popIn .2s cubic-bezier(.2,.7,.3,1);' : '';

    let body;
    if (state.libraryLoading) {
      body = `<div style="padding:60px 0; text-align:center; color:#756c60;">Chargement de la bibliothèque…</div>`;
    } else if (state.libraryError) {
      body = `<div style="padding:60px 0; text-align:center; color:#756c60;">Impossible de lire le dossier d'images.</div>`;
    } else if (!allFiles.length) {
      body = `<div style="padding:60px 0; text-align:center; color:#756c60;">Aucune image ne correspond.</div>`;
    } else {
      const cards = files.map((file) => {
        const active = file === state.pickerSelectedFile;
        const imgUrl = `/api/library-image/${encodeURIComponent(file)}`;
        const border = active ? `1px solid rgba(${GR_RGB},0.75)` : '1px solid rgba(236,231,223,0.08)';
        const bg = active ? `rgba(${GR_RGB},0.1)` : '#211d16';
        return `<button data-act="selectPickerFile" data-file="${esc(file)}" title="${esc(file)}" style="text-align:left; background:${bg}; border:${border}; border-radius:11px; padding:0; overflow:hidden; cursor:pointer; color:#ece7df;">
          <div style="aspect-ratio:1/1; background:#16130f; display:flex; align-items:center; justify-content:center; border-bottom:1px solid rgba(236,231,223,0.06);">
            <img src="${imgUrl}" alt="${esc(file)}" loading="lazy" style="width:100%; height:100%; object-fit:contain; display:block;" />
          </div>
          <div style="padding:8px 9px; font-family:'JetBrains Mono',monospace; font-size:10.5px; color:${active ? '#ece7df' : '#a89f93'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(file)}</div>
        </button>`;
      }).join('');
      const grid = `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px;">${cards}</div>`;
      const sentinel = visibleCount < allFiles.length
        ? `<div style="padding:18px 0; text-align:center; font-size:12px; color:#756c60;">Chargement de la suite au défilement…</div>`
        : '';
      body = grid + sentinel;
    }

    return `<div data-act="closePicker" style="position:fixed; inset:0; background:rgba(8,6,4,0.66); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:32px; z-index:60; ${backdropAnim}">
      <div data-act="stop" style="width:100%; max-width:780px; max-height:84vh; background:#1a1712; border:1px solid rgba(236,231,223,0.1); border-radius:16px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 30px 80px rgba(0,0,0,0.6); ${modalAnim}">
        <div style="display:flex; align-items:center; gap:12px; padding:18px 22px; border-bottom:1px solid rgba(236,231,223,0.08);">
          <div>
            <div style="font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BX_LIGHT};">Banque d'images</div>
            <div style="font-size:18px; font-weight:700; margin-top:2px;">Choisir une image pour ${esc(state.draft.label || state.draft.item || 'cet item')}</div>
            <div style="font-size:11px; color:#756c60; margin-top:2px; font-family:'JetBrains Mono',monospace;">${visibleCount} / ${allFiles.length} images</div>
          </div>
          <div style="flex:1;"></div>
          <button data-act="closePicker" style="width:34px; height:34px; border:1px solid rgba(236,231,223,0.1); border-radius:9px; background:#211d16; color:#a89f93; cursor:pointer; font-size:15px;">✕</button>
        </div>
        <div style="padding:16px 22px 0;">
          <div style="position:relative;">
            <span style="position:absolute; left:13px; top:50%; transform:translateY(-50%); color:#756c60; font-size:15px;">⌕</span>
            <input id="picker-query" data-act="pickerQuery" value="${esc(state.pickerQuery)}" placeholder="Rechercher un fichier…" style="width:100%; height:40px; padding:0 14px 0 34px; border-radius:10px; border:1px solid rgba(236,231,223,0.1); background:#211d16; color:#ece7df; font-size:14px; outline:none;" />
          </div>
        </div>
        <div data-scroll-picker style="padding:16px 22px 22px; overflow-y:auto; flex:1; min-height:0;">${body}</div>
        <div style="display:flex; align-items:center; gap:12px; padding:16px 22px; border-top:1px solid rgba(236,231,223,0.08); background:#16130f;">
          <span style="font-size:12px; color:#756c60; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${state.pickerSelectedFile ? esc(state.pickerSelectedFile) : 'Sélectionnez une image.'}</span>
          <div style="flex:1;"></div>
          <button data-act="closePicker" style="height:40px; padding:0 18px; border-radius:10px; border:1px solid rgba(236,231,223,0.12); background:transparent; color:#a89f93; font-weight:600; font-size:13.5px; cursor:pointer;">Annuler</button>
          <button data-act="confirmPicker" style="height:40px; padding:0 22px; border-radius:10px; border:none; background:${GR}; color:${ON_GR}; font-weight:700; font-size:13.5px; cursor:pointer; box-shadow:0 4px 14px rgba(${GR_RGB},0.25); opacity:${state.pickerSelectedFile ? 1 : 0.42};">Importer cette image</button>
        </div>
      </div>
    </div>`;
  }

  function contentHTML(v) {
    if (v.showModuleSoon) return moduleSoonHTML(v);
    let body = statsHTML(v) + toolbarHTML(v);
    if (v.isEmpty) body += emptyHTML();
    else if (v.showList) body += listHTML(v);
    return body;
  }

  let _modalWasOpen = false;
  let _pickerWasOpen = false;

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

  function loginHTML() {
    return `<div style="display:flex;align-items:center;justify-content:center;height:100vh;width:100%;background:#14120f;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:22px;padding:40px;text-align:center;max-width:380px;">
        <div>
          <div style="font-weight:800;font-size:20px;letter-spacing:-0.01em;color:#ece7df;margin-bottom:15px">Panel New Frontier RP</div>
        <a href="/auth/discord/login" style="display:flex;align-items:center;gap:10px;height:44px;padding:0 24px;border-radius:11px;background:#5865F2;color:#fff;font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 4px 14px rgba(88,101,242,0.3);">
          Se connecter avec Discord
        </a>
      </div>
    </div>`;
  }

  function render() {
    if (!state.authChecked) return; // attend la réponse de /api/me avant le premier rendu
    if (!state.user) { root.innerHTML = loginHTML(); return; }
    const cap = captureFocus();
    const scrollEl = root.querySelector('[data-scroll]');
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    const pickerScrollEl = root.querySelector('[data-scroll-picker]');
    const pickerScrollTop = pickerScrollEl ? pickerScrollEl.scrollTop : 0;
    const v = computeVals();
    const modalJustOpened = !!state.draft && !_modalWasOpen;
    _modalWasOpen = !!state.draft;
    const pickerJustOpened = state.pickerOpen && !_pickerWasOpen;
    _pickerWasOpen = state.pickerOpen;
    const f = state.flash;
    const toastBg   = f && f.type === 'error' ? '#c0392b' : f && f.type === 'warn' ? '#b8860b' : GR;
    const toastText = f && f.type === 'error' ? '#fff'    : f && f.type === 'warn' ? '#fff'    : ON_GR;
    const toastHTML = f ? `<div style="position:fixed;bottom:24px;right:24px;z-index:300;padding:11px 20px;border-radius:10px;background:${toastBg};color:${toastText};font-weight:600;font-size:13.5px;box-shadow:0 4px 20px rgba(0,0,0,0.35);animation:slideInToast .2s ease;pointer-events:none;">${esc(f.msg)}</div>` : '';
    root.innerHTML = `<style>@keyframes slideInToast{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@keyframes spinBtn{to{transform:rotate(360deg)}}</style>
      <div style="display:flex; height:100vh; width:100%; overflow:hidden;">
        ${sidebarHTML(v)}
        <main style="flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden;">
          ${headerHTML(v)}
          <div data-scroll style="flex:1; overflow-y:auto; padding:24px 24px 48px;">${contentHTML(v)}</div>
        </main>
      </div>${modalHTML(modalJustOpened)}${pickerModalHTML(pickerJustOpened)}${toastHTML}`;
    restoreFocus(cap);
    const newScrollEl = root.querySelector('[data-scroll]');
    if (newScrollEl && scrollTop) newScrollEl.scrollTop = scrollTop;
    const newPickerScrollEl = root.querySelector('[data-scroll-picker]');
    if (newPickerScrollEl && pickerScrollTop) newPickerScrollEl.scrollTop = pickerScrollTop;
  }

  // Dispatch des événements
  function actEl(target) { return target.closest('[data-act]'); }

  const WRITE_ACTIONS = new Set(['openNew', 'saveDraft', 'triggerDrop', 'togDraft', 'openPicker', 'confirmPicker']);

  root.addEventListener('click', (e) => {
    const el = actEl(e.target);
    if (!el) return;
    const act = el.dataset.act;
    const key = el.dataset.key;
    if (WRITE_ACTIONS.has(act) && !canWrite()) return; // garde-fou — l'UI masque déjà ces actions
    switch (act) {
      case 'togDevRo': if (IS_DEV) { state.devRoOverride = !state.devRoOverride; render(); } break;
      case 'logout':
        fetch('/auth/logout', { method: 'POST' }).then(() => { window.location.href = '/'; });
        break;
      case 'module': state.module = key; render(); break;
      case 'cat': state.cat = key; render(); break;
      case 'clearQuery': state.query = ''; render(); break;
      case 'toggleMissing': state.onlyMissing = !state.onlyMissing; render(); break;
      case 'openNew': openNew(); break;
      case 'openItem': openItem(+el.dataset.id); break;
      case 'closeModal': closeModal(); break;
      case 'stop': e.stopPropagation(); break;
      case 'saveDraft': saveDraft(); break;
      case 'triggerDrop': {
        const input = document.getElementById('file-upload-input');
        if (input) input.click();
        break;
      }
      case 'togDraft':
        if (state.draft) { state.draft = Object.assign({}, state.draft, { [key]: +state.draft[key] ? 0 : 1 }); render(); }
        break;
      case 'openPicker':
        if (!state.draft) break;
        if (!state.libraryFiles.length && !state.libraryLoading) loadLibrary();
        state.pickerOpen = true;
        state.pickerQuery = '';
        state.pickerSelectedFile = null;
        state.pickerVisibleCount = PICKER_CHUNK;
        render();
        break;
      case 'closePicker': state.pickerOpen = false; render(); break;
      case 'selectPickerFile': state.pickerSelectedFile = el.dataset.file; render(); break;
      case 'confirmPicker': {
        if (!state.pickerSelectedFile || !state.draft) break;
        state.draft = Object.assign({}, state.draft, { pendingFile: state.pickerSelectedFile, hasImage: true });
        state.pickerOpen = false;
        render();
        break;
      }
      default: break;
    }
  });

  function onValueChange(e) {
    const el = actEl(e.target);
    if (!el) return;
    const act = el.dataset.act;
    const key = el.dataset.key;
    const val = e.target.value;
    if (act === 'pickerQuery') { state.pickerQuery = val; state.pickerVisibleCount = PICKER_CHUNK; render(); }
    else if (act === 'query') { state.query = val; render(); }
    else if (act === 'sort') { state.sort = val; render(); }
    else if (act === 'setDraft' && state.draft) {
      const update = { [key]: val };
      if (key === 'groupId') update.cat = groupCat(val);
      state.draft = Object.assign({}, state.draft, update);
    }
  }
  root.addEventListener('input', onValueChange);
  root.addEventListener('change', onValueChange);

  root.addEventListener('change', (e) => {
    if (e.target.id !== 'file-upload-input' || !canWrite()) return;
    const file = e.target.files && e.target.files[0];
    if (file) uploadAndAttach(file);
    e.target.value = '';
  });

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
    if (!zone || !canWrite()) return;
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadAndAttach(file);
  });

  // Chargement progressif de la banque d'images (scroll non-bubbling -> capture)
  root.addEventListener('scroll', (e) => {
    const el = e.target;
    if (!(el instanceof Element) || !el.hasAttribute('data-scroll-picker')) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 400;
    if (!nearBottom) return;
    const total = computeVals().pickerFiles.length;
    if (state.pickerVisibleCount >= total) return;
    state.pickerVisibleCount = Math.min(total, state.pickerVisibleCount + PICKER_CHUNK);
    render();
  }, true);

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
      .then((data) => {
        if (Array.isArray(data) && data.length) { state.items = data; render(); }
      })
      .catch(() => {});
  }

  function loadGroups() {
    fetch('/api/groups')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => { if (Array.isArray(data)) { state.groups = data; render(); } })
      .catch(() => {});
  }

  function loadLibrary() {
    if (state.libraryLoading) return;
    state.libraryLoading = true;
    state.libraryError = null;
    render();
    fetch('/api/library')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        state.libraryFiles = Array.isArray(data.files) ? data.files : [];
        state.libraryLoading = false;
        render();
      })
      .catch(() => {
        state.libraryLoading = false;
        state.libraryError = 'library_error';
        render();
      });
  }

  function checkAuth() {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        state.user = data.user;
        state.access = data.access;
        state.authChecked = true;
        render();
        loadConfig();
        loadGroups();
        loadItems();
        loadLibrary();
        loadStats();
      })
      .catch(() => { state.user = null; state.authChecked = true; render(); });
  }

  // Go
  checkAuth();
})();
