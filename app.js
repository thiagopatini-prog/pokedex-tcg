/* Pokédex TCG — v1. Tudo roda no navegador; os dados da coleção ficam no aparelho (localStorage). */
(function () {
  'use strict';
  var D = window.DATA, COLS = D.cols;
  var REG = {};
  D.regions.forEach(function (r) { REG[r.g] = r; });

  // Imagens das cartas: TCGdex (em português, com inglês de reserva). O código da coleção da planilha
  // (MEG, PFL...) vira o código da TCGdex pela tabela abaixo. Se nada carregar, aparece a "ficha" com a arte do Pokémon.
  // Para forçar uma imagem: window.CARD_IMG = {"MEG-001":"https://..."}
  var TDX = {
    MEG: ['me/me01'], MEP: ['me/mep'], PFL: ['me/me02'], ASC: ['me/me02.5'], POR: ['me/me03'], CRI: ['me/me04'], PBL: ['me/me05'], MEE: ['me/mee'], '30C': ['me/30th', 'me/30th-c'],
    SVI: ['sv/sv01'], PAL: ['sv/sv02'], OBF: ['sv/sv03'], MEW: ['sv/sv03.5'], PAR: ['sv/sv04'], PAF: ['sv/sv04.5'], TEF: ['sv/sv05'], TWM: ['sv/sv06'], SFA: ['sv/sv06.5'], SCR: ['sv/sv07'], SSP: ['sv/sv08'], PRE: ['sv/sv08.5'], JTG: ['sv/sv09'], DRI: ['sv/sv10'], BLK: ['sv/sv10.5b'], WHT: ['sv/sv10.5w'], SVP: ['sv/svp'],
    SSH: ['swsh/swsh1'], RCL: ['swsh/swsh2'], DAA: ['swsh/swsh3'], CPA: ['swsh/swsh3.5'], VIV: ['swsh/swsh4'], SHF: ['swsh/swsh4.5'], BST: ['swsh/swsh5'], CRE: ['swsh/swsh6'], EVS: ['swsh/swsh7'], CEL: ['swsh/cel25'], FST: ['swsh/swsh8'], BRS: ['swsh/swsh9'], ASR: ['swsh/swsh10'], PGO: ['swsh/swsh10.5'], LOR: ['swsh/swsh11'], SIT: ['swsh/swsh12'], CRZ: ['swsh/swsh12.5'],
    SUM: ['sm/sm1'], GRI: ['sm/sm2'], BUS: ['sm/sm3'], SLG: ['sm/sm3.5'], CIN: ['sm/sm4'], UPR: ['sm/sm5'], FLI: ['sm/sm6'], CES: ['sm/sm7'], DRM: ['sm/sm7.5'], LOT: ['sm/sm8'], TEU: ['sm/sm9'], UNB: ['sm/sm10'], UNM: ['sm/sm11'], HIF: ['sm/sm115'], CEC: ['sm/sm12'],
    XY: ['xy/xy1'], FLF: ['xy/xy2'], FFI: ['xy/xy3'], PHF: ['xy/xy4'], PRC: ['xy/xy5'], ROS: ['xy/xy6'], AOR: ['xy/xy7'], BKT: ['xy/xy8'], BKP: ['xy/xy9'], FCO: ['xy/xy10'], STS: ['xy/xy11'], EVO: ['xy/xy12'],
    BLW: ['bw/bw1'], EP: ['bw/bw2'], NVI: ['bw/bw3'], NXD: ['bw/bw4'], DEX: ['bw/bw5'], DRX: ['bw/bw6'], BCR: ['bw/bw7'], PLS: ['bw/bw8'], PLF: ['bw/bw9'], PLB: ['bw/bw10'], LTR: ['bw/bw11']
  };

  var KEY = 'pktcg.v1';
  var ST = { wants: [], edits: {}, alt: false };
  try {
    var sv = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (sv.wants) ST.wants = sv.wants;
    if (sv.edits) ST.edits = sv.edits;
    ST.alt = !!sv.alt; ST.t = sv.t || 0; ST.synced = !!sv.synced;
  } catch (e) {}
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} }
  function save() { ST.t = Date.now(); persist(); schedulePush(); }

  /* ---------- sincronização (Supabase, via db.js) ---------- */
  var SYNC = { msg: '', at: 0, busy: false, sent: '', email: '' }, pushTimer = null;
  function schedulePush() { if (!window.DB || !DB.user()) return; clearTimeout(pushTimer); pushTimer = setTimeout(syncNow, 1500); }
  function syncState(msg) { SYNC.msg = msg; if (UI && UI.view === 'ajustes' && $('#viewer').hidden && $('#sheet').hidden) render(); }
  function syncNow() {
    if (!window.DB || !DB.user() || SYNC.busy) return;
    SYNC.busy = true; syncState('Sincronizando…');
    DB.pull().then(function (row) {
      var mine = { wants: ST.wants, edits: ST.edits, alt: ST.alt };
      if (!row) { ST.synced = true; ST.t = ST.t || Date.now(); persist(); return DB.push(mine, ST.t); }
      var rd = row.data || {}, rt = +row.t || 0;
      if (!ST.synced) { // primeira vez neste aparelho: junta o que já existe aqui com o que veio da conta
        var w = (rd.wants || []).slice(); ST.wants.forEach(function (id) { if (w.indexOf(id) < 0) w.push(id); });
        ST.edits = Object.assign({}, ST.edits, rd.edits || {}); // se a mesma carta foi editada nos dois, vale a da conta (o aparelho novo costuma ter edição velha) ST.wants = w; ST.alt = !!(ST.alt || rd.alt);
        ST.synced = true; ST.t = Date.now(); persist(); return DB.push({ wants: ST.wants, edits: ST.edits, alt: ST.alt }, ST.t);
      }
      if (rt > ST.t) { ST.wants = rd.wants || []; ST.edits = rd.edits || {}; ST.alt = !!rd.alt; ST.t = rt; persist(); return null; }
      if (ST.t > rt) return DB.push(mine, ST.t);
      return null;
    }).then(function () { SYNC.busy = false; SYNC.at = Date.now(); syncState('Sincronizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })); render(); },
      function (e) { SYNC.busy = false; syncState('Não sincronizou: ' + (e && e.message || 'erro') + '. Tente de novo.'); });
  }

  /* ---------- cópia das imagens no seu servidor (Storage privado do Supabase) ---------- */
  var MIR = {}, MIRK = 'pktcg.mir', MIRP = { run: false, done: 0, total: 0, ok: 0, fail: 0 }, mirQ = [], mirBusy = 0, mirT = null;
  try { JSON.parse(localStorage.getItem(MIRK) || '[]').forEach(function (p) { MIR[p] = 1; }); } catch (e) {}
  function mirSave() { clearTimeout(mirT); mirT = setTimeout(function () { try { localStorage.setItem(MIRK, JSON.stringify(Object.keys(MIR))); } catch (e) {} }, 800); }
  function mirUI() { if (UI && UI.view === 'ajustes' && $('#viewer').hidden && $('#sheet').hidden) render(); }
  // baixa a imagem da fonte original e guarda no servidor; resolve se a cópia existe no fim
  function mirrorUrl(url) {
    var p = DB.imgPath(url); if (MIR[p]) return Promise.resolve(true);
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(function (b) {
      if (!b.size || !/^image\//.test(b.type)) throw new Error('não é imagem');
      return DB.imgPut(p, b);
    }).then(function () { MIR[p] = 1; mirSave(); return true; });
  }
  function mirEnqueue(url) {
    if (!window.DB || !DB.user() || !/^https:/.test(url) || MIR[DB.imgPath(url)] || mirQ.indexOf(url) >= 0) return;
    mirQ.push(url); mirPump();
  }
  function mirPump() {
    while (mirBusy < 2 && mirQ.length) {
      mirBusy++;
      mirrorUrl(mirQ.shift()).catch(function () {}).then(function () { mirBusy--; mirPump(); });
    }
  }
  function mirrorAll() {
    if (MIRP.run || !window.DB || !DB.user()) return;
    var jobs = [];
    Object.keys(BY).forEach(function (id) {
      var m = BY[id]; if (!m.own) return;
      [false, true].forEach(function (hi) { var s = sources(m, hi); if (s.length) jobs.push(s); });
    });
    MIRP = { run: true, done: 0, total: jobs.length, ok: 0, fail: 0 }; mirUI();
    var cand = {}; jobs.forEach(function (s) { s.forEach(function (u) { cand[DB.imgPath(u)] = 1; }); });
    var keys = Object.keys(cand).filter(function (p) { return !MIR[p]; }), chunks = [], i;
    for (i = 0; i < keys.length; i += 100) chunks.push(keys.slice(i, i + 100));
    function start() {
      var idx = 0, active = 0;
      function tryN(s, k) { if (k >= s.length) return Promise.resolve(false); return mirrorUrl(s[k]).then(function () { return true; }, function () { return tryN(s, k + 1); }); }
      function next() {
        if (idx >= jobs.length && active === 0) { MIRP.run = false; mirSave(); mirUI(); return; }
        while (active < 3 && idx < jobs.length) {
          (function (s) {
            active++;
            var hiOnly = s.filter(function (u) { return /\/high\.webp$/.test(u); }), rel = hiOnly.length ? hiOnly : s; // na alta resolução, só vale a cópia da alta
            var has = rel.some(function (u) { return MIR[DB.imgPath(u)]; });
            (has ? Promise.resolve(true) : tryN(s, 0)).then(function (ok) { MIRP.done++; if (ok) MIRP.ok++; else MIRP.fail++; }).then(function () { active--; if (MIRP.done % 10 === 0) mirUI(); next(); });
          })(jobs[idx++]);
        }
      }
      next();
    }
    // antes de copiar, vê o que já está no servidor (enviado por outro aparelho)
    (function chk(j) {
      if (j >= chunks.length) return start();
      DB.imgSign(chunks[j]).then(function (o) { Object.keys(o).forEach(function (p) { MIR[p] = 1; }); chk(j + 1); }, function () { chk(j + 1); });
    })(0);
  }

  /* ---------- aparência: tema e tamanho das cartas ---------- */
  var PREF = { theme: 'dark', size: 'm' };
  try { PREF.theme = localStorage.getItem('pktcg.theme') || 'dark'; PREF.size = localStorage.getItem('pktcg.size') || 'm'; } catch (e) {}
  function resolveTheme() { return PREF.theme === 'auto' ? (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : PREF.theme; }
  function applyPrefs() {
    var r = document.documentElement, t = resolveTheme();
    r.setAttribute('data-theme', t); r.setAttribute('data-size', PREF.size);
    var mt = document.querySelector('meta[name=theme-color]'); if (mt) mt.setAttribute('content', t === 'light' ? '#D9382B' : '#C62F23');
  }
  function savePref() { try { localStorage.setItem('pktcg.theme', PREF.theme); localStorage.setItem('pktcg.size', PREF.size); } catch (e) {} applyPrefs(); }
  var SIZE_LABEL = { s: 'P', m: 'M', l: 'G' };
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { if (PREF.theme === 'auto') applyPrefs(); }); } catch (e) {} }

  /* ---------- dados extras da carta (nome da coleção, total, raridade) vindos da TCGdex ---------- */
  var RTDX = {};
  Object.keys(TDX).forEach(function (code) { TDX[code].forEach(function (p) { RTDX[p.split('/')[1]] = code; }); });
  var META = {}, METAFAIL = {}, META_KEY = 'pktcg.meta.v1';
  try { META = JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (e) {}
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function metaKey(m) { return m.tid || (m.set + '-' + m.no); }
  function metaIds(m) {
    if (m.tid) return [m.tid];
    var out = [];
    (TDX[m.set] || []).forEach(function (p) {
      var sid = p.split('/')[1], raw = String(parseInt(m.no, 10));
      [m.no, raw].forEach(function (n, i, a) { if (n && a.indexOf(n) === i) out.push(sid + '-' + n); });
    });
    return out;
  }
  function loadMeta(m, cb) {
    if (!m.own || !m.set || !m.no) return;
    var k = metaKey(m); if (META[k] || METAFAIL[k]) return;
    var ids = metaIds(m), tries = [];
    ['pt', 'en'].forEach(function (l) { ids.forEach(function (id) { tries.push([l, id]); }); });
    if (!tries.length) { METAFAIL[k] = 1; return; }
    (function next(i) {
      if (i >= tries.length) { METAFAIL[k] = 1; return; }
      getJSON('https://api.tcgdex.net/v2/' + tries[i][0] + '/cards/' + tries[i][1]).then(function (c) {
        var cc = (c.set && c.set.cardCount) || {};
        META[k] = { sn: (c.set && c.set.name) || '', tot: cc.official || cc.total || '', ra: c.rarity || '', il: c.illustrator || '', hp: c.hp || '', ty: (c.types || []).join(', ') };
        try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch (e) {}
        if (cb) cb();
      }, function () { next(i + 1); });
    })(0);
  }

  var UI = { view: 'colecao', rsub: 'reg', rsel: 1, sort: 'n', region: 0, status: 'all', fin: '', set: '', q: '', search: false, noimg: false };
  var NOIMG = {}, PRES = null, SHEETKIND = '';
  var BY = {}, VISIBLE = [], V = { ids: [], i: 0 }, confirmRemove = false;
  var FIN_LABEL = { '': 'Normal', 'Normal': 'Normal', 'Reverse Foil': 'Reverse Foil', 'Foil': 'Foil', 'Promo': 'Promo', 'Pokeball Foil': 'Pokeball Foil' };
  var FIN_KEY = { '': 'n', 'Normal': 'n', 'Reverse Foil': 'r', 'Foil': 'f', 'Promo': 'p', 'Pokeball Foil': 'b' };
  var FINS = ['Normal', 'Reverse Foil', 'Foil', 'Promo', 'Pokeball Foil'];

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function pad(n) { return String(n).padStart(4, '0'); }
  function eff(m) { var e = ST.edits[m.id]; return e ? Object.assign({}, m, e) : m; }
  function inScope(m) { return ST.alt || !m.alt; }
  function note(m) { if (!m.note) return ''; return /^\d+\/\d+$/.test(m.note) ? 'Carta ' + m.note : m.note; }
  function noCard(m) { return /^n[ãa]o existe/i.test(m.note || ''); }
  var ICON = {
    heart: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5.5 6.2 5.5c2 0 3.2 1.1 3.8 2.2.6-1.1 1.8-2.2 3.8-2.2 3.2 0 5 3.1 3.7 6.3C19.5 16.4 12 21 12 21z"/></svg>'
  };


  /* ---------- mapas das regiões: contornos simplificados do lugar real que inspirou cada uma (lon, lat) ---------- */
  var MAPS = {
    1: { c: '#e5383b', sub: 'Japão · Kantō', r: [[[138.5,36.8],[139.4,37.0],[139.9,36.9],[140.3,36.9],[140.6,36.2],[140.9,35.7],[140.4,35.2],[139.85,34.9],[139.7,35.2],[139.6,35.3],[139.2,35.2],[139.0,35.2],[138.9,35.5],[138.6,35.6],[138.5,36.0]]] },
    2: { c: '#d99a1f', sub: 'Japão · Kansai', r: [[[134.3,35.6],[135.5,35.6],[135.9,35.5],[136.2,35.7],[136.4,35.3],[136.9,34.8],[136.8,34.3],[136.3,34.1],[135.9,33.5],[135.2,33.5],[135.1,33.9],[135.2,34.3],[135.4,34.6],[134.8,34.7],[134.3,34.6],[134.3,35.0]]] },
    3: { c: '#1f9d6a', sub: 'Japão · Kyūshū', r: [[[130.9,33.9],[131.7,33.6],[131.9,32.7],[131.4,31.4],[130.7,31.0],[130.2,31.3],[130.2,32.2],[129.7,32.6],[129.8,33.3],[130.3,33.6]]] },
    4: { c: '#4a73d9', sub: 'Japão · Hokkaido', r: [[[140.0,41.4],[140.9,41.2],[140.5,42.2],[141.4,42.6],[142.0,42.3],[143.3,42.0],[144.4,42.9],[145.8,43.4],[145.3,44.1],[144.4,44.0],[142.9,44.6],[141.9,45.5],[141.7,45.0],[141.6,43.9],[141.3,43.2],[140.4,43.3],[139.9,42.7],[140.2,42.0]]] },
    5: { c: '#6b7280', sub: 'Nova York · EUA', r: [[[-74.02,40.70],[-73.97,40.71],[-73.93,40.80],[-73.91,40.87],[-73.93,40.88],[-73.97,40.79],[-74.01,40.75]], [[-73.99,40.57],[-73.75,40.58],[-73.73,40.74],[-73.78,40.80],[-73.83,40.85],[-73.80,40.88],[-73.88,40.80],[-73.95,40.70],[-73.99,40.66]], [[-74.25,40.50],[-74.05,40.58],[-74.07,40.64],[-74.2,40.64]]] },
    6: { c: '#8b5cf6', sub: 'França', r: [[[2.5,51.1],[1.6,50.9],[1.6,50.2],[0.1,49.7],[-1.3,49.7],[-1.9,49.7],[-1.6,48.7],[-2.7,48.6],[-3.6,48.8],[-4.7,48.4],[-4.3,47.9],[-2.8,47.5],[-2.3,47.2],[-1.9,46.7],[-1.2,46.2],[-1.2,45.6],[-1.2,44.7],[-1.5,43.5],[-0.7,43.3],[0.7,42.8],[1.7,42.5],[3.1,42.4],[3.1,43.1],[4.0,43.5],[4.8,43.4],[6.0,43.1],[7.5,43.8],[7.0,44.3],[6.8,45.0],[7.0,45.9],[6.1,46.4],[6.9,47.5],[7.6,47.6],[8.2,48.9],[6.8,49.2],[5.9,49.5],[4.8,50.1],[4.2,49.9],[3.1,50.8]]] },
    7: { c: '#06b6d4', sub: 'Havaí', r: [[[-159.8,22.2],[-159.4,22.2],[-159.3,21.9],[-159.6,21.9]], [[-158.3,21.6],[-158.0,21.7],[-157.7,21.3],[-158.1,21.3]], [[-157.3,21.2],[-156.7,21.15],[-156.8,21.05],[-157.3,21.1]], [[-156.7,20.9],[-156.4,20.9],[-156.0,20.7],[-156.4,20.6],[-156.7,20.8]], [[-155.9,20.2],[-155.1,19.7],[-154.8,19.5],[-155.7,18.95],[-156.0,19.7]]] },
    8: { c: '#e11d8d', sub: 'Grã-Bretanha', r: [[[-5.7,50.1],[-4.2,50.4],[-3.4,50.6],[-1.9,50.7],[0.3,50.8],[1.4,51.2],[0.9,51.5],[1.7,52.6],[0.3,52.9],[0.0,53.6],[-0.1,54.0],[-1.2,54.5],[-1.6,55.3],[-2.0,55.8],[-3.0,56.0],[-2.0,57.0],[-1.8,57.6],[-3.3,57.7],[-4.0,57.5],[-3.1,58.6],[-5.0,58.6],[-5.7,57.5],[-5.6,56.5],[-5.2,55.4],[-4.8,55.0],[-3.1,54.9],[-3.4,54.2],[-2.9,53.4],[-3.2,53.3],[-4.5,53.3],[-4.2,52.8],[-4.9,52.2],[-4.2,51.6],[-3.0,51.5],[-3.1,51.2],[-4.2,51.2],[-5.3,50.7]]] },
    9: { c: '#f97316', sub: 'Península Ibérica', r: [[[-9.0,43.2],[-8.0,43.7],[-5.0,43.6],[-1.8,43.4],[-0.7,43.0],[0.7,42.8],[1.7,42.5],[3.2,42.4],[3.0,41.9],[0.9,41.0],[-0.3,39.5],[0.0,38.8],[-0.7,37.6],[-2.1,36.7],[-4.4,36.7],[-5.4,36.1],[-6.3,36.6],[-7.4,37.2],[-8.9,37.0],[-8.8,38.5],[-9.5,38.7],[-8.8,40.2],[-8.9,41.8],[-8.8,42.8],[-9.3,43.0]]] }
  };
  function mapSvg(g) {
    var M = MAPS[g]; if (!M) return '';
    var all = []; M.r.forEach(function (ring) { all = all.concat(ring); });
    var lat0 = all.reduce(function (a, p) { return a + p[1]; }, 0) / all.length, k = Math.cos(lat0 * Math.PI / 180);
    var xs = all.map(function (p) { return p[0] * k; }), ys = all.map(function (p) { return -p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var sc = Math.min(104 / ((x1 - x0) || 1), 84 / ((y1 - y0) || 1)), ox = (120 - (x1 - x0) * sc) / 2, oy = (100 - (y1 - y0) * sc) / 2;
    var d = M.r.map(function (ring) { return 'M' + ring.map(function (p) { return ((p[0] * k - x0) * sc + ox).toFixed(1) + ' ' + ((-p[1] - y0) * sc + oy).toFixed(1); }).join('L') + 'Z'; }).join('');
    return '<svg class="map" viewBox="0 0 120 100" aria-hidden="true"><path d="' + d + '" fill="' + M.c + '" fill-opacity=".2" stroke="' + M.c + '" stroke-width="2" stroke-linejoin="round"/></svg>';
  }
  /* ---------- sprites (atlas com a arte do PDF) ---------- */
  function sp(m, cls) {
    var s = D.sp[m.sp];
    if (!s) return '<span class="' + cls + '"></span>';
    var g = s[0], cc = s[1], r = s[2], R = REG[g].rows;
    var x = COLS > 1 ? cc / (COLS - 1) * 100 : 0, y = R > 1 ? r / (R - 1) * 100 : 0;
    return '<span class="' + cls + '" style="background-image:url(img/atlas-g' + g + '.webp);background-size:' + COLS * 100 + '% ' + R * 100 + '%;background-position:' + x + '% ' + y + '%"></span>';
  }

  /* ---------- imagem real da carta ---------- */
  // Lista de endereços para tentar, em ordem: português e inglês, número com e sem zeros à esquerda.
  function sources(m, hi) {
    if (m.own && m.imgUrl) return [m.imgUrl];
    if (m.own && m.img) {
      var bases = [m.img]; if (/\/pt\//.test(m.img)) bases.push(m.img.replace('/pt/', '/en/')); // se a versão em português não existir, tenta a em inglês
      var lst = []; (hi ? ['high', 'low'] : ['low']).forEach(function (q) { bases.forEach(function (b) { lst.push(b + '/' + q + '.webp'); }); });
      return lst;
    }
    if (!m.own || !m.set || !/^\d+$/.test(m.no || '')) return [];
    var o = (window.CARD_IMG || {})[m.set + '-' + m.no];
    if (o) return [o];
    var sets = TDX[m.set];
    if (!sets) return [];
    var out = [];
    // alta resolução primeiro; se a TCGdex não tiver (acontece em parte das cartas), cai para a normal
    (hi ? ['high', 'low'] : ['low']).forEach(function (q) {
      ['pt', 'en'].forEach(function (lang) {
        sets.forEach(function (s) {
          var padded = m.no, raw = String(parseInt(m.no, 10));
          var unpadFirst = /\/(swsh[1-8](\.\d)?|sm\d+(\.\d)?|xy\d+|bw\d+)$/.test(s);
          (unpadFirst ? [raw, padded] : [padded, raw]).forEach(function (n, i, a) {
            if (a.indexOf(n) === i) out.push('https://assets.tcgdex.net/' + lang + '/' + s + '/' + n + '/' + q + '.webp');
          });
        });
      });
    });
    return out;
  }
  function noImage(m) { return m.own && (!sources(m, false).length || NOIMG[m.id]); }
  function imgTag(m, hi) {
    var s = NOIMG[m.id] ? [] : sources(m, hi);
    if (!s.length) return '';
    return '<img class="real" loading="lazy" alt="" data-mid="' + esc(m.id) + '" src="' + esc(s[0]) + '" data-alt="' + esc(s.slice(1).join('|')) + '" data-all="' + esc(s.join('|')) + '">';
  }

  /* ---------- peças de HTML ---------- */
  function cardFrame(m, big) {
    var k = FIN_KEY[m.fin] || 'n';
    return '<span class="card f-' + k + '"><span class="cn">' + esc(m.n) + '</span><span class="art">' + sp(m, 'sp') + '</span><span class="ln"></span><span class="ln s"></span>' +
      (big ? '<span class="ln s"></span>' : '') + '<span class="cf"><i>' + esc(m.set) + '</i><i>' + esc(m.no) + '</i></span></span>';
  }
  function tcap(m) {
    return '<span class="tcap"><span class="tcn"><b>' + esc(m.n) + '</b><i>#' + pad(m.d) + '</i></span><span class="tbd" aria-hidden="true">' + (m.own ? '\u2713' : '+') + '</span></span>';
  }
  function tile(m) {
    var lab = m.n + ', ' + pad(m.d) + ', ' + (m.own ? 'na coleção' : 'faltando');
    var tag = m.alt ? '<span class="tag">' + (m.kind === 'Regional' ? 'Reg' : 'Alt') + '</span>' : '';
    if (noImage(m)) tag += '<span class="tag noimg">Sem imagem</span>';
    var want = !m.own && ST.wants.indexOf(m.id) >= 0 ? '<span class="want" title="Na lista de compras">' + ICON.heart + '</span>' : '';
    if (m.own) {
      var md = META[metaKey(m)], ttl = m.n + (m.set ? ' · ' + (md && md.sn ? md.sn + ' ' : '') + m.set + ' ' + m.no : '');
      return '<button class="tile own" data-id="' + m.id + '" title="' + esc(ttl) + '" aria-label="' + esc(lab) + '"><span class="tart">' + cardFrame(m, false) + imgTag(m, false) + tag + '</span>' + tcap(m) + '</button>';
    }
    return '<button class="tile miss" data-id="' + m.id + '" aria-label="' + esc(lab) + '"><span class="tart"><span class="ghost' + (noCard(m) ? ' none' : '') + '"><span class="gn">' + esc(m.n) + '</span>' + sp(m, 'sp') + '<span class="gx">#' + pad(m.d) + '</span></span>' + tag + want + '</span>' + tcap(m) + '</button>';
  }
  function chip(label, on, attrs, sub) {
    return '<button class="chip" aria-pressed="' + (on ? 'true' : 'false') + '" ' + attrs + '>' + label + (sub ? ' <b>' + sub + '</b>' : '') + '</button>';
  }

  /* ---------- dados derivados ---------- */
  function compute() {
    var all = D.mons.map(eff), own = 0, tot = 0, byR = {};
    D.regions.forEach(function (r) { byR[r.g] = { own: 0, tot: 0 }; });
    BY = {};
    all.forEach(function (m) {
      BY[m.id] = m;
      if (!inScope(m)) return;
      tot++; byR[m.g].tot++;
      if (m.own) { own++; byR[m.g].own++; }
    });
    return { all: all, own: own, tot: tot, byR: byR };
  }
  // busca tolerante a erro de digitação: trecho exato, ou palavra parecida (1 letra errada em palavras de 4+, 2 em 7+)
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var p = [], c, i, j;
    for (j = 0; j <= b.length; j++) p[j] = j;
    for (i = 1; i <= a.length; i++) {
      c = [i];
      for (j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      p = c;
    }
    return p[b.length];
  }
  function fuzzy(hay, w) {
    if (hay.indexOf(w) >= 0) return true;
    if (w.length < 4 || /^\d/.test(w)) return false;
    var max = w.length >= 7 ? 2 : 1, words = hay.split(/[^a-z0-9]+/), k, t;
    for (k = 0; k < words.length; k++) {
      t = words[k]; if (t.length < 3) continue;
      if (lev(w, t, max) <= max) return true;
      if (t.length > w.length && lev(w, t.slice(0, w.length), max) <= max) return true;
    }
    return false;
  }
  function filtered(all) {
    var q = norm(UI.q).split(/\s+/).filter(Boolean);
    return all.filter(function (m) {
      if (!inScope(m)) return false;
      if (UI.view === 'vitrine' && !m.own) return false;
      if (UI.region && m.g !== UI.region) return false;
      if (UI.view === 'colecao') {
        if (UI.status === 'own' && !m.own) return false;
        if (UI.status === 'miss' && m.own) return false;
        if (UI.fin && (m.fin || 'Normal') !== UI.fin) return false;
        if (UI.set && m.set !== UI.set) return false;
        if (UI.noimg && !noImage(m)) return false;
      }
      if (q.length) {
        var hay = norm(m.n + ' ' + m.d + ' ' + pad(m.d) + ' ' + m.set + ' ' + m.no + ' ' + REG[m.g].name + (m.alt ? ' alt forma' : ''));
        for (var i = 0; i < q.length; i++) if (!fuzzy(hay, q[i].replace(/^#/, ''))) return false;
      }
      return true;
    });
  }
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
  function fmt(n) { return String(n).replace('.', ','); }
  function knownSets() {
    var cnt = {};
    D.mons.forEach(function (m) { var e = eff(m); if (e.own && e.set) cnt[e.set] = (cnt[e.set] || 0) + 1; });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || a.localeCompare(b); });
  }

  /* ---------- telas ---------- */
  function regionChips(S) {
    var h = '<div class="scroller regions" role="group" aria-label="Regiões">' + chip('Todas', UI.region === 0, 'data-r="0"', S.own + '/' + S.tot);
    D.regions.forEach(function (r) { h += chip(esc(r.name), UI.region === r.g, 'data-r="' + r.g + '"', S.byR[r.g].own + '/' + S.byR[r.g].tot); });
    return h + '</div>';
  }
  function activeFilters() { return (UI.fin ? 1 : 0) + (UI.set ? 1 : 0) + (ST.alt ? 1 : 0) + (UI.noimg ? 1 : 0); }
  function viewColecao(S) {
    var R = UI.region ? S.byR[UI.region] : null, own = R ? R.own : S.own, tot = R ? R.tot : S.tot, p = pct(own, tot);
    var label = R ? REG[UI.region].name : (ST.alt ? 'com formas alt.' : 'Pokémon');
    var h = '<section class="progress" aria-label="Progresso"><div class="row"><span class="big-n">' + own + '<small>/ ' + tot + ' ' + esc(label) + '</small></span><span class="pct">' + fmt(p) + '%</span></div>' +
      '<div class="bar" role="progressbar" aria-valuenow="' + p + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + p + '%"></i></div><span class="sub">' + (tot - own) + ' ainda faltam' + (R ? ' nesta região' : '') + '</span></section>';
    h += regionChips(S);
    var nf = activeFilters();
    h += '<div class="scroller" role="group" aria-label="Filtros">' +
      '<span class="segc">' + chip('Todas', UI.status === 'all', 'data-status="all"') + chip('Tenho', UI.status === 'own', 'data-status="own"') + chip('Faltam', UI.status === 'miss', 'data-status="miss"') + '</span>' +
      '<button class="chip" data-act="filters" aria-pressed="' + (nf ? 'true' : 'false') + '">Filtros' + (nf ? ' <b>' + nf + '</b>' : '') + '</button></div>';
    var n = VISIBLE.length;
    h += '<div class="count-line"><span>' + n + (n === 1 ? ' resultado' : ' resultados') + '</span>' + sizeBtn() + (UI.status === 'miss' && n ? '<button class="link-btn" data-act="addvis">Adicionar à lista de compras</button>' : '') + '</div>';
    return h + gridHtml('grid');
  }
  function sizeBtn() { return ''; } // tamanho fixo: 2 colunas no celular, 5 no computador
  function gridHtml(cls) {
    if (!VISIBLE.length) return '<div class="empty"><h2>Nada por aqui</h2><p>Mude os filtros ou a busca para ver cartas.</p></div>';
    return '<div class="grid ' + cls + '" id="grid">' + VISIBLE.map(tile).join('') + '</div>';
  }
  function viewVitrine(S) {
    return regionChips(S) + '<div class="count-line"><span>' + VISIBLE.length + ' cartas na vitrine</span>' + sizeBtn() + (VISIBLE.length ? '<button class="link-btn" data-act="present">Apresentar</button>' : '') + '</div>' + gridHtml('vitrine');
  }
  function wantList() {
    return ST.wants.map(function (id) { return BY[id]; }).filter(function (m) { return m && !m.own; });
  }
  function viewLista() {
    var items = wantList();
    if (!items.length) return '<div class="empty"><h2>Lista vazia</h2><p>Abra uma carta que falta e toque em “Adicionar à lista”, ou use o filtro Faltam e adicione várias de uma vez.</p></div>';
    var h = '<div class="count-line"><span>' + items.length + (items.length === 1 ? ' carta para comprar' : ' cartas para comprar') + '</span></div><div class="actions"><button class="primary" data-act="copylist">Copiar lista</button><button class="ghost-btn" data-act="clearlist">Limpar</button></div><div class="lista">';
    D.regions.forEach(function (r) {
      var g = items.filter(function (m) { return m.g === r.g; });
      if (!g.length) return;
      h += '<h3>' + esc(r.name) + ' · ' + g.length + '</h3><div class="lgrid">';
      g.forEach(function (m) {
        h += '<div class="lc"><div class="lart">' + sp(m, 'lsp') + '</div><button class="lx" data-act="unwant" data-id="' + m.id + '" aria-label="Tirar ' + esc(m.n) + ' da lista"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
          '<div class="lt"><strong>' + esc(m.n) + '</strong><span>#' + pad(m.d) + (m.alt ? ' · forma alternativa' : '') + '</span></div>' +
          '<button class="ladd" data-act="addfromlist" data-id="' + m.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Adicionar</button></div>';
      });
      h += '</div>';
    });
    return h + '</div>';
  }

  /* ---------- regiões: texto estilo Pokédex e mapas grandes ---------- */
  var RINFO = {
    1: { jogos: 'Red, Green, Blue e Yellow', ano: '1996 (Japão)', prof: 'Carvalho', lenda: 'Mewtwo', ini: [1, 4, 7], ins: 'Japão · Kantō', d: 'Onde tudo começou. Vilarejos calmos, florestas e uma grande cidade ligam oito Ginásios até a Liga Pokémon, no Planalto Índigo. É a terra do Professor Carvalho e da Equipe Rocket.' },
    2: { jogos: 'Gold, Silver e Crystal', ano: '1999 (Japão)', prof: 'Elm', lenda: 'Ho-Oh e Lugia', ini: [152, 155, 158], ins: 'Japão · Kansai', d: 'Uma região de tradição e lendas, com templos antigos e torres históricas. Introduziu os ciclos de dia e noite, a Criação e os Pokémon do tipo Sombrio e Aço.' },
    3: { jogos: 'Ruby, Sapphire e Emerald', ano: '2002 (Japão)', prof: 'Birch', lenda: 'Groudon, Kyogre e Rayquaza', ini: [252, 255, 258], ins: 'Japão · Kyūshū', d: 'Uma região tropical, com muito mar, vulcões e clima instável. Foi palco do confronto entre as Equipes Magma e Aqua e trouxe as Habilidades e as Batalhas em Dupla.' },
    4: { jogos: 'Diamond, Pearl e Platinum', ano: '2006 (Japão)', prof: 'Rowan', lenda: 'Dialga, Palkia e Giratina', ini: [387, 390, 393], ins: 'Japão · Hokkaido', d: 'Terra fria e montanhosa, cortada pelo Monte Coroa. Mitos sobre a criação do tempo e do espaço envolvem a região, e a Equipe Galáctica quer refazer o universo.' },
    5: { jogos: 'Black, White, Black 2 e White 2', ano: '2010 (Japão)', prof: 'Juniper', lenda: 'Reshiram e Zekrom', ini: [495, 498, 501], ins: 'EUA · Nova York', d: 'Uma metrópole de arranha-céus e pontes gigantes. No começo da aventura só aparecem Pokémon novos, e a Equipe Plasma defende que Pokémon e treinadores deveriam se separar.' },
    6: { jogos: 'X e Y', ano: '2013 (Japão)', prof: 'Sycamore', lenda: 'Xerneas e Yveltal', ini: [650, 653, 656], ins: 'França', d: 'Terra de arte, moda e castelos, com a Cidade Lumiose no centro. Aqui nasceram a Mega Evolução e o tipo Fada, e a Equipe Flare sonha com um mundo “bonito”.' },
    7: { jogos: 'Sun, Moon, Ultra Sun e Ultra Moon', ano: '2016 (Japão)', prof: 'Kukui', lenda: 'Solgaleo e Lunala', ini: [722, 725, 728], ins: 'EUA · Havaí', d: 'Um arquipélago de praias e vulcões. No lugar dos Ginásios há Provas de Ilha e Pokémon Totem, e os Pokémon locais ganharam formas de Alola.' },
    8: { jogos: 'Sword e Shield', ano: '2019 (Japão)', prof: 'Magnolia', lenda: 'Zacian e Zamazenta', ini: [810, 813, 816], ins: 'Reino Unido', d: 'Campos verdes, vilas industriais e estádios lotados, onde as lutas de Ginásio são transmitidas como esporte. É a região do Dynamax, da Zona Selvagem e das batalhas gigantes.' },
    9: { jogos: 'Scarlet e Violet', ano: '2022 (Japão)', prof: 'Sada e Turo', lenda: 'Koraidon e Miraidon', ini: [906, 909, 912], ins: 'Península Ibérica', d: 'Um mundo aberto para explorar sem ordem fixa, de desertos a montanhas nevadas, com uma enorme cratera no meio. Traz a Terastalização e a Academia como ponto de partida.' }
  };
  function mapBig(g, W, H) {
    var M = MAPS[g], all = []; M.r.forEach(function (ring) { all = all.concat(ring); });
    var lat0 = all.reduce(function (s, p) { return s + p[1]; }, 0) / all.length, k = Math.cos(lat0 * Math.PI / 180);
    var xs = all.map(function (p) { return p[0] * k; }), ys = all.map(function (p) { return -p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var mx = W * .14, my = H * .14, sc = Math.min((W - 2 * mx) / ((x1 - x0) || 1), (H - 2 * my) / ((y1 - y0) || 1)), ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2, cx = 0, cy = 0, n = 0;
    var d = M.r.map(function (ring) { return 'M' + ring.map(function (p) { var X = (p[0] * k - x0) * sc + ox, Y = (-p[1] - y0) * sc + oy; cx += X; cy += Y; n++; return X.toFixed(1) + ' ' + Y.toFixed(1); }).join('L') + 'Z'; }).join('');
    return { d: d, cx: cx / n, cy: cy / n, c: M.c };
  }
  function heroMap(g) {
    var W = 320, H = 220, m = mapBig(g, W, H), grid = '', x, y;
    for (x = 0; x <= W; x += 20) grid += '<path d="M' + x + ' 0V' + H + '"/>';
    for (y = 0; y <= H; y += 20) grid += '<path d="M0 ' + y + 'H' + W + '"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g stroke="var(--rgrid)" stroke-width="1">' + grid + '</g><path d="' + m.d + '" fill="' + m.c + '" fill-opacity=".22" stroke="' + m.c + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="' + m.cx.toFixed(1) + '" cy="' + m.cy.toFixed(1) + '" r="14" fill="' + m.c + '" fill-opacity=".25"/><circle cx="' + m.cx.toFixed(1) + '" cy="' + m.cy.toFixed(1) + '" r="7" fill="' + m.c + '"/></svg>';
  }
  function miniMap(g) { var m = mapBig(g, 60, 48); return '<svg viewBox="0 0 60 48" aria-hidden="true"><path d="' + m.d + '" fill="' + m.c + '" fill-opacity=".22" stroke="' + m.c + '" stroke-width="2" stroke-linejoin="round"/></svg>'; }

  /* ---------- coleções (sets): nome e total vêm da TCGdex e ficam guardados ---------- */
  var SETI = {}, SETI_KEY = 'pktcg.sets.v1', SETFAIL = {}, setTimer = 0;
  try { SETI = JSON.parse(localStorage.getItem(SETI_KEY) || '{}'); } catch (e) {}
  function loadSetMeta(code) {
    if (SETI[code] || SETFAIL[code]) return;
    var p = (TDX[code] || [])[0]; if (!p) { SETFAIL[code] = 1; return; }
    var sid = p.split('/')[1]; SETFAIL[code] = 1;
    ['pt', 'en'].reduce(function (pr, l) {
      return pr.catch(function () { return getJSON('https://api.tcgdex.net/v2/' + l + '/sets/' + sid); });
    }, Promise.reject()).then(function (s) {
      var cc = s.cardCount || {};
      SETI[code] = { n: s.name || '', t: cc.official || cc.total || 0 };
      try { localStorage.setItem(SETI_KEY, JSON.stringify(SETI)); } catch (e) {}
      delete SETFAIL[code];
      clearTimeout(setTimer);
      setTimer = setTimeout(function () { if (UI.view === 'regioes' && UI.rsub === 'set' && $('#viewer').hidden && $('#sheet').hidden) render(); }, 250);
    }, function () {});
  }
  function setStats() {
    var cnt = {};
    D.mons.forEach(function (m) { var e = eff(m); if (e.own && e.set && e.set !== '—') cnt[e.set] = (cnt[e.set] || 0) + 1; });
    return Object.keys(cnt).map(function (c) { var i = SETI[c] || {}; return { c: c, n: i.n || '', own: cnt[c], tot: i.t || 0 }; });
  }
  function viewSets() {
    var L = setStats(); L.forEach(function (s) { loadSetMeta(s.c); });
    if (!L.length) return '<div class="empty"><h2>Sem coleções ainda</h2><p>Quando você registrar cartas, as coleções delas aparecem aqui.</p></div>';
    var top = L.slice().sort(function (a, b) { return b.own - a.own || a.c.localeCompare(b.c); })[0];
    L.sort(function (a, b) {
      if (UI.sort === 'a') return (a.n || a.c).localeCompare(b.n || b.c);
      if (UI.sort === 'p') { var pa = a.tot ? a.own / a.tot : -1, pb = b.tot ? b.own / b.tot : -1; return pb - pa || b.own - a.own; }
      return b.own - a.own || a.c.localeCompare(b.c);
    });
    var h = '<div class="st-top"><span class="st-badge">' + esc(top.c) + '</span><div><small>Sua maior coleção</small><b>' + esc(top.n || top.c) + '</b><span>' + top.own + ' cartas' + (top.tot ? ' · ' + fmt(pct(top.own, top.tot)) + '% da coleção' : '') + '</span></div></div>' +
      '<span class="segc st-seg">' + chip('Mais cartas', UI.sort === 'n', 'data-sort="n"') + chip('Maior %', UI.sort === 'p', 'data-sort="p"') + chip('A–Z', UI.sort === 'a', 'data-sort="a"') + '</span><div class="st-list">';
    L.forEach(function (s, i) {
      var p = s.tot ? pct(s.own, s.tot) : 0;
      h += '<button class="st-item' + (i === 0 && UI.sort === 'n' ? ' first' : '') + '" data-setgo="' + esc(s.c) + '"><span class="st-badge sm">' + esc(s.c) + '</span><span class="st-t"><b>' + esc(s.n || s.c) + '</b><small>' + s.own + (s.tot ? ' de ' + s.tot + ' cartas' : (s.own === 1 ? ' carta' : ' cartas')) + '</small></span>' +
        (s.tot ? '<span class="st-p">' + fmt(p) + '<small>%</small></span><span class="st-bar"><i style="width:' + Math.min(100, p) + '%"></i></span>' : '') + '</button>';
    });
    return h + '</div>';
  }
  function viewRegioes(S) {
    var p = pct(S.own, S.tot), h = '<section class="reg-hero"><div><span class="rh-n">' + S.own + '<small> de ' + S.tot + '</small></span><span class="rh-s">cartas na coleção · ' + fmt(p) + '%</span></div><div class="bar" aria-hidden="true"><i style="width:' + p + '%"></i></div></section>';
    h += '<span class="segc rg-seg">' + chip('Regiões', UI.rsub === 'reg', 'data-rsub="reg"') + chip('Coleções', UI.rsub === 'set', 'data-rsub="set"') + '</span>';
    if (UI.rsub === 'set') return h + viewSets();
    var g = UI.rsel; if (!RINFO[g]) g = UI.rsel = 1;
    var R = RINFO[g], r = REG[g], B = S.byR[g], pp = pct(B.own, B.tot), c = MAPS[g].c;
    h += '<div class="rg-chips" role="group" aria-label="Escolher região">' + D.regions.map(function (x) {
      var bb = S.byR[x.g];
      return '<button class="rg-chip' + (x.g === g ? ' on' : '') + '" style="--rc:' + MAPS[x.g].c + '" data-rsel="' + x.g + '" aria-pressed="' + (x.g === g ? 'true' : 'false') + '">' + miniMap(x.g) + '<span>' + esc(x.name) + '</span><b>' + fmt(pct(bb.own, bb.tot)) + '%</b></button>';
    }).join('') + '</div>';
    h += '<article class="rg-hero" style="--rc:' + c + '"><div class="rg-l"><div class="rg-hd"><div><div class="rg-no">Nº ' + String(r.first).padStart(3, '0') + ' – ' + String(r.last).padStart(3, '0') + '</div><h2>' + esc(r.name) + '</h2><div class="rg-ins">📍 Inspirada em: ' + esc(R.ins) + '</div></div>' +
      '<div class="rg-ring" style="--p:' + pp + '"><i>' + fmt(pp) + '%</i></div></div><div class="rg-cnt">' + B.own + ' de ' + B.tot + ' Pokémon</div>' +
      '<div class="rg-map">' + heroMap(g) + '<span class="rg-tag">' + esc(R.ins) + '</span></div></div>' +
      '<div class="rg-r"><p class="rg-desc">' + esc(R.d) + '</p><div class="rg-facts"><div class="rg-f"><span>Inicial</span><div class="rg-ini">' + R.ini.map(function (d) { var m = BY[String(d)]; return m ? '<div>' + sp(m, 'rg-st') + '<small>' + esc(m.n) + '</small></div>' : ''; }).join('') + '</div></div>' +
      '<div class="rg-f"><span>Jogos</span><b>' + esc(R.jogos) + '</b></div><div class="rg-f"><span>Lançamento</span><b>' + esc(R.ano) + '</b></div><div class="rg-f"><span>Professor</span><b>' + esc(R.prof) + '</b></div><div class="rg-f"><span>Lendários</span><b>' + esc(R.lenda) + '</b></div></div>' +
      '<button class="rg-cta" data-goto="' + g + '">Ver cartas de ' + esc(r.name) + '</button></div></article>';
    h += '<h2 class="sec">Todas as regiões</h2><div class="rg-grid">' + D.regions.map(function (x) {
      var bb = S.byR[x.g], q = pct(bb.own, bb.tot);
      return '<button class="rg-mini" style="--rc:' + MAPS[x.g].c + '" data-rsel="' + x.g + '">' + miniMap(x.g) + '<b>' + esc(x.name) + '</b><small>' + bb.own + ' de ' + bb.tot + ' · ' + fmt(q) + '%</small><span class="bar"><i style="width:' + q + '%"></i></span></button>';
    }).join('') + '</div>';
    return h;
  }
  function viewAjustes(S) {
    var u = window.DB && DB.user(), acct, mir = '';
    if (u) {
      acct = '<section class="panel"><h2>Conta</h2><p>Conectado como <b>' + esc(u.email || 'sua conta') + '</b>. Sua coleção é a mesma em todos os aparelhos em que você entrar.</p><p>' + esc(SYNC.msg || 'Pronto para sincronizar') + '</p><div class="actions" style="padding-top:2px"><button class="primary" data-act="syncnow">Sincronizar agora</button><button class="ghost-btn" data-act="signout">Sair</button></div>' +
        '<details style="margin-top:12px"' + (SYNC.pwOpen ? ' open' : '') + '><summary>Definir ou trocar a senha</summary><p>Com senha, você entra em outro aparelho só com e-mail e senha, sem esperar link no e-mail. Use pelo menos 10 caracteres.</p><div class="field"><label for="a-newpw">Nova senha</label><input id="a-newpw" type="password" autocomplete="new-password" minlength="8"></div><button class="primary" data-act="setpw">Salvar senha</button></details></section>';
      mir = '<section class="panel"><h2>Imagens no seu servidor</h2><p>' +
        (MIRP.run ? 'Copiando… ' + MIRP.done + ' de ' + MIRP.total + (MIRP.fail ? ' · ' + MIRP.fail + ' sem imagem' : '') :
          MIRP.total ? 'Pronto: ' + MIRP.ok + ' de ' + MIRP.total + ' copiadas' + (MIRP.fail ? ' · ' + MIRP.fail + ' não encontradas' : '') + '.' :
          'As imagens que você vê são copiadas sozinhas para o seu servidor (' + Object.keys(MIR).length + ' até agora). Para copiar todas as das suas cartas de uma vez, toque abaixo.') +
        '</p><div class="actions" style="padding-top:2px"><button class="primary" data-act="mirror"' + (MIRP.run ? ' disabled' : '') + '>' + (MIRP.run ? 'Copiando…' : 'Copiar imagens agora') + '</button></div></section>';
    } else {
      acct = '<section class="panel"><h2>Conta</h2><p>Entre para ver a mesma coleção em todos os aparelhos. Sem senha: você recebe um link no e-mail.</p>' +
        '<div class="field"><label for="a-email">E-mail</label><input id="a-email" type="email" autocomplete="email" inputmode="email" value="' + esc(SYNC.email) + '" placeholder="voce@email.com"></div>' +
        '<div class="field"><label for="a-pw">Senha</label><input id="a-pw" type="password" autocomplete="current-password" placeholder="se você já definiu uma"></div><button class="primary" data-act="pwlogin">Entrar com senha</button>' +
        '<p style="margin-top:14px">Ou receba um link no e-mail:</p><button class="ghost-btn" data-act="sendlink">Enviar link de acesso</button>' +
        (SYNC.sent ? '<p>Link enviado para <b>' + esc(SYNC.sent) + '</b>. No e-mail, <b>segure o botão/link e escolha “Copiar endereço do link”</b>. Depois cole aqui:</p><div class="field"><label for="a-link">Link do e-mail</label><input id="a-link" inputmode="url" autocomplete="off" autocapitalize="off" placeholder="https://…supabase.co/auth/v1/verify?…"></div><button class="primary" data-act="pastelink">Entrar com o link colado</button>' +
          '<details style="margin-top:10px"><summary>Meu e-mail trouxe um código</summary><div class="field"><label for="a-code">Código do e-mail</label><input id="a-code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456"></div><button class="ghost-btn" data-act="verify">Entrar com o código</button></details>' : '') +
        (SYNC.msg ? '<p>' + esc(SYNC.msg) + '</p>' : '') + '</section>';
    }
    var tema = '<section class="panel"><div class="opt"><span>Tema</span><div class="seg">' +
      chip('Escuro', PREF.theme === 'dark', 'data-theme-set="dark"') + chip('Claro', PREF.theme === 'light', 'data-theme-set="light"') + chip('Auto', PREF.theme === 'auto', 'data-theme-set="auto"') + '</div></div></section>';
    var dados = '<section class="panel"><h2>Impressão e planilha</h2><p>Imprima as fichas das cartas que faltam, com marca de corte, para montar a pasta. A coleção fica salva neste aparelho; exporte um CSV no mesmo formato da planilha para atualizar o Excel.</p><div class="actions" style="padding-top:4px"><button class="primary" data-act="print">Imprimir fichas</button><button class="ghost-btn" data-act="export">Exportar CSV</button><button class="ghost-btn" data-act="copylist">Copiar lista de compras</button></div></section>';
    var avanc = mir + '<section class="panel"><h2>Imagens das cartas</h2><p>As imagens vêm da base pública TCGdex. Se uma carta estiver errada ou sem imagem, abra a carta, toque em “Editar carta” e use a busca para escolher a certa.</p></section>' +
      '<section class="panel"><h2>Voltar à planilha</h2><p>Apaga o que você registrou neste aparelho e volta aos dados da planilha original.</p><div class="actions" style="padding-top:4px"><button class="ghost-btn" data-act="reset">' + (confirmRemove === 'reset' ? 'Confirmar: voltar à planilha' : 'Voltar aos dados da planilha') + '</button></div></section>';
    return '<div class="ajustes"><h2 class="sec">Conta e sincronização</h2>' + acct + '<h2 class="sec">Aparência</h2>' + tema + '<h2 class="sec">Dados e impressão</h2>' + dados + '<h2 class="sec">Avançado</h2>' + avanc + '<h2 class="sec">Sobre</h2><section class="panel"><p>Pokédex TCG · versão ' + APPV + '</p></section></div>';
  }

  var SUB = { colecao: 'Coleção TCG · 1.025 Pokémon', vitrine: 'Só as cartas que tenho', lista: 'Lista de compras', regioes: 'Regiões e coleções', ajustes: 'Conta, aparência e dados' };
  var APPV = 'v34';
  function render() {
    var S = compute(), keep = [];
    Array.prototype.forEach.call(document.querySelectorAll('#app .scroller'), function (s) { keep.push(s.scrollLeft); });
    VISIBLE = UI.view === 'lista' || UI.view === 'regioes' || UI.view === 'ajustes' ? [] : filtered(S.all);
    var html = UI.view === 'colecao' ? viewColecao(S) : UI.view === 'vitrine' ? viewVitrine(S) : UI.view === 'lista' ? viewLista() : UI.view === 'regioes' ? viewRegioes(S) : viewAjustes(S);
    $('#app').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('#app .scroller'), function (s, i) { if (keep[i]) s.scrollLeft = keep[i]; });
    $('#h-sub').textContent = SUB[UI.view];
    document.body.setAttribute('data-view', UI.view);
    Array.prototype.forEach.call(document.querySelectorAll('.nav button'), function (b) {
      if (b.getAttribute('data-view') === UI.view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- visualizador ---------- */
  function layers() { return ''; } // efeitos de brilho removidos
  function viewerRender() {
    var m = BY[V.ids[V.i]];
    if (!m) return closeViewer();
    var big = $('#big');
    big.className = 'big' + (m.own ? '' : ' miss');
    var inner;
    if (m.own) inner = cardFrame(m, true) + imgTag(m, true) + layers(m);
    else inner = '<span class="card"><span class="art">' + sp(m, 'sp') + '</span><span class="cn" style="font-weight:500">Ainda não tenho</span></span>';
    big.innerHTML = inner;
    var am = m.own && !NOIMG[m.id] ? sources(m, false)[0] : ''; $('#viewer').style.setProperty('--amb', am ? 'url("' + am + '")' : 'none');
    $('#v-pos').textContent = (V.i + 1) + ' de ' + V.ids.length;
    viewerInfo(m);
    loadMeta(m, function () { var cur = BY[V.ids[V.i]]; if (cur && cur.id === m.id && !$('#viewer').hidden) viewerInfo(cur); });
    $('#v-prev').hidden = V.ids.length < 2; $('#v-next').hidden = V.ids.length < 2;
  }
  function fact(l, v, wide) { return '<div class="fact' + (wide ? ' wide' : '') + '"><span>' + l + '</span><b>' + v + '</b></div>'; }
  function viewerInfo(m) {
    var pills = '', facts = '';
    if (m.own) {
      pills += '<span class="pill ok">Na coleção</span>';
      if (noImage(m)) pills += '<span class="pill warn">Sem imagem · use Editar carta para buscar</span>';
      var md = META[metaKey(m)] || {}, tot = md.tot ? '<small>/' + esc(md.tot) + '</small>' : '';
      if (m.set) {
        facts = '<div class="facts">' + fact('Coleção', (md.sn ? esc(md.sn) + ' <small>· ' + esc(m.set) + '</small>' : esc(m.set)), true) +
          fact('Número', esc(m.no) + tot) + fact('Acabamento', esc(FIN_LABEL[m.fin || 'Normal'] || m.fin)) +
          (md.ra ? fact('Raridade', esc(md.ra), true) : '') + (md.il ? fact('Ilustrador', esc(md.il), true) : '') +
          (md.hp ? fact('PS', esc(md.hp)) : '') + (md.ty ? fact('Tipo', esc(md.ty)) : '') + '</div>';
      }
    } else { pills += '<span class="pill warn">Faltando</span>'; if (note(m)) pills += '<span class="pill">' + esc(note(m)) + '</span>'; }
    var wanted = ST.wants.indexOf(m.id) >= 0;
    var acts = m.own
      ? '<button class="primary" data-vact="edit">Editar carta</button><button class="ghost-btn" data-vact="remove">' + (confirmRemove === m.id ? 'Confirmar remoção' : 'Remover') + '</button>'
      : '<button class="primary" data-vact="edit">Já tenho</button><button class="ghost-btn" data-vact="want">' + (wanted ? 'Na lista ✓' : 'Adicionar à lista') + '</button>';
    $('#v-info').innerHTML = '<div><h2>' + esc(m.n) + '</h2><div class="meta"><span>#' + pad(m.d) + ' · ' + esc(REG[m.g].name) + (m.alt ? ' · forma ' + (m.kind === 'Regional' ? 'regional' : 'alternativa') : '') + '</span></div></div><div class="pills">' + pills + '</div>' + facts + '<div class="v-actions">' + acts + '</div>';
  }
  function openViewer(id, ids) {
    V.ids = ids; V.i = Math.max(0, ids.indexOf(id)); confirmRemove = false;
    $('#viewer').hidden = false; document.body.style.overflow = 'hidden';
    viewerRender(); $('#v-close').focus();
  }
  function closeViewer() { stopPresent(); $('#viewer').hidden = true; document.body.style.overflow = ''; confirmRemove = false; render(); }
  function go(d) { if (V.ids.length < 2) return; V.i = (V.i + d + V.ids.length) % V.ids.length; confirmRemove = false; viewerRender(); }

  /* ---------- formulário de cadastro ---------- */
  var FIND = { sel: null, set: '', no: '', list: {}, all: [], m: null };
  function baseName(n) { return String(n).replace(/\s*\(.*?\)\s*/g, ' ').trim(); }
  function splitId(id) { var k = id.lastIndexOf('-'); return [id.slice(0, k), id.slice(k + 1)]; }
  function openSheet(id) {
    var m = BY[id], sets = knownSets();
    var box = '<div class="box" role="dialog" aria-modal="true" aria-label="Cadastrar carta"><h3>' + (m.own ? 'Editar carta' : 'Adicionar carta') + ' · ' + esc(m.n) + ' <span class="dexn">#' + pad(m.d) + '</span></h3><div class="body">' +
      '<div class="finder" style="border:0;padding:0"><h4>1. Escolha a carta</h4><p class="hint">Já busquei as cartas de ' + esc(baseName(m.n)) + '. Para refinar, digite também a coleção ou o número (ex.: “' + esc(baseName(m.n).toLowerCase()) + ' mep” ou “' + esc(baseName(m.n).toLowerCase()) + ' 79”).</p>' +
      '<div class="row"><input id="f-q" type="search" autocomplete="off" value="' + esc(baseName(m.n)) + '" aria-label="Nome da carta"><button data-sact="find" type="button">Buscar</button></div>' +
      '<div class="tools" id="f-tools" hidden></div><p class="found" id="f-msg" role="status" aria-live="polite"></p><div id="f-res" class="results" hidden></div><button type="button" class="ghost-btn more" data-sact="dex" hidden id="f-dex">Ver todas as cartas deste Pokémon</button></div>' +
      '<div class="finder fields' + (window.innerWidth < 900 ? ' collapsed' : '') + '" id="f-fields"><h4><button type="button" class="h4btn" data-sact="fields" aria-expanded="' + (window.innerWidth < 900 ? 'false' : 'true') + '">2. Conferir os dados <span class="chev" aria-hidden="true">▾</span></button></h4>' +
      '<div class="field"><label for="s-set">Coleção (código)</label><input id="s-set" list="s-sets" autocapitalize="characters" autocomplete="off" placeholder="Ex.: MEG" value="' + esc(m.set) + '"><datalist id="s-sets">' + sets.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><label for="s-no">Número da carta</label><input id="s-no" inputmode="numeric" autocomplete="off" placeholder="Ex.: 001" value="' + esc(m.no) + '"></div>' +
      '<div class="field"><label for="s-fin">Acabamento</label><select id="s-fin">' + FINS.map(function (f) { return '<option' + ((m.fin || 'Normal') === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="s-url">Link da imagem (opcional, para quem não está na base)</label><input id="s-url" type="url" inputmode="url" autocomplete="off" placeholder="https://…" value="' + esc(m.imgUrl || '') + '"></div></div>' +
      '</div><div class="foot"><div class="selbar" id="f-sel" hidden></div><button class="primary" data-sact="save" data-id="' + id + '" id="f-save">' + (m.own ? 'Salvar' : 'Adicionar') + '</button><button class="ghost-btn" data-sact="cancel">Cancelar</button></div></div>';
    FIND = { sel: null, set: '', no: '', list: {}, all: [], m: m }; SHEETKIND = 'edit';
    var sh = $('#sheet'); sh.innerHTML = box; sh.hidden = false;
    runFind(); // já busca na hora; o teclado só abre se a pessoa tocar no campo
  }
  var STOP = { de: 1, do: 1, da: 1, forma: 1, form: 1, the: 1, of: 1 };
  function fetchCards(qs) {
    return Promise.all(['pt', 'en'].map(function (l) { return getJSON('https://api.tcgdex.net/v2/' + l + '/cards?' + qs + '&pagination:page=1&pagination:itemsPerPage=300').catch(function () { return null; }); })).then(function (rs) {
      if (!rs[0] && !rs[1]) throw new Error('offline');
      var seen = {}, list = [];
      rs.forEach(function (r, li) { (r || []).forEach(function (c) {
        if (!c || !c.id) return;
        if (!seen[c.id]) { seen[c.id] = c; list.push(c); }
        else if (!seen[c.id].image && c.image) seen[c.id].image = c.image; // a versão em português às vezes vem sem imagem; a em inglês tem
        if (li === 1 && c.name) seen[c.id]._en = c.name;
      }); });
      return list;
    });
  }
  function prep(list) {
    list = list.filter(function (c) { return !/^(a\d|b\d|p-a|p-b)/i.test(c.id); }); // fora: Pokémon TCG Pocket
    return list.map(function (c) { var p = splitId(c.id); c._set = p[0]; c._code = RTDX[p[0]] || p[0].toUpperCase(); c._num = parseInt(c.localId, 10); return c; });
  }
  function showResults(list, msg) {
    FIND.all = list; FIND.list = {}; list.forEach(function (c) { FIND.list[c.id] = c; });
    var tools = $('#f-tools'), sets = {};
    list.forEach(function (c) { sets[c._set] = c._code; });
    var keys = Object.keys(sets).sort(function (a, b) { return sets[a].localeCompare(sets[b]); });
    tools.innerHTML = '<select id="f-set2" aria-label="Filtrar por coleção"><option value="">Todas as coleções (' + keys.length + ')</option>' + keys.map(function (k) { return '<option value="' + esc(k) + '">' + esc(sets[k]) + '</option>'; }).join('') + '</select>' +
      '<select id="f-sort" aria-label="Ordenar"><option value="mine">Minhas coleções primeiro</option><option value="set">Ordenar por coleção</option><option value="num">Ordenar por número</option></select>';
    tools.hidden = !list.length;
    FIND.msg = msg || '';
    renderResults();
  }
  // filtro por coleção/número: vem das palavras digitadas na busca (ex.: "pikachu svi 25") e, se a pessoa mexer, dos campos "Conferir os dados"
  function typedFilter(list, f) {
    var out = list;
    if (f.set && TDX[f.set]) { var ids = TDX[f.set].map(function (p) { return p.split('/')[1]; }); out = out.filter(function (c) { return ids.indexOf(c._set) >= 0; }); }
    if (f.num) out = out.filter(function (c) { return String(c._num) === String(parseInt(f.num, 10)); });
    return out;
  }
  function typedNow() {
    var raw = ($('#f-q') ? $('#f-q').value : '').trim().split(/\s+/), f = { set: '', num: '' };
    raw.forEach(function (w, k) {
      var u = w.toUpperCase().replace(/PT$/, '');
      if (/^\d+$/.test(w) && !f.num) f.num = w; else if (!f.set && k > 0 && TDX[u]) f.set = u;
    });
    var s2 = ($('#s-set') ? $('#s-set').value : '').trim().toUpperCase().replace(/PT$/, ''), n2 = ($('#s-no') ? $('#s-no').value : '').trim();
    if (FIND.tset && s2) f.set = s2; // só vale o campo que a pessoa mexeu (os dados atuais da carta não filtram)
    if (FIND.tno && n2) f.num = n2;
    return f;
  }
  function renderResults() {
    var box = $('#f-res'), fs = $('#f-set2') ? $('#f-set2').value : '', so = $('#f-sort') ? $('#f-sort').value : 'mine';
    var list = FIND.all.filter(function (c) { return !fs || c._set === fs; });
    var tf = typedNow(), tl = typedFilter(list, tf), tnote = '';
    if (tf.set || tf.num) {
      var lab = [tf.set, tf.num].filter(Boolean).join(' ');
      if (tl.length) { tnote = ' Mostrando ' + tl.length + ' de ' + list.length + ' (filtro: ' + lab + '). Apague para ver todas.'; list = tl; }
      else tnote = ' Nenhuma com ' + lab + '; mostrando todas.';
    }
    var mm = $('#f-msg'); if (mm && FIND.msg != null && FIND.all.length) mm.textContent = FIND.msg + tnote;
    var mine = {}; knownSets().forEach(function (x) { mine[x] = 1; });
    list.sort(function (a, b) {
      if (so === 'mine') { var ma = mine[a._code] ? 0 : 1, mb = mine[b._code] ? 0 : 1; if (ma !== mb) return ma - mb; }
      return so === 'num' ? (a._num - b._num || a._code.localeCompare(b._code)) : (a._code.localeCompare(b._code) || a._num - b._num);
    });
    var more = list.length > 120; list = list.slice(0, 120);
    box.innerHTML = list.map(function (c) {
      return '<button type="button" class="res" data-sact="pick" data-cid="' + esc(c.id) + '" aria-pressed="' + (FIND.sel && FIND.sel.id === c.id ? 'true' : 'false') + '"><span class="im">' + (c.image ? '<img loading="lazy" alt="' + esc(c.name) + '" src="' + esc(c.image + '/low.webp') + '" data-en="' + esc(c.image.replace('/pt/', '/en/') + '/low.webp') + '">' : '<span class="nopic">sem imagem na base</span>') + '</span><span class="cap">' + esc(c._code + ' · ' + c.localId) + '<small>' + esc(c.name) + '</small></span></button>';
    }).join('');
    box.hidden = !list.length;
    if (more) $('#f-msg').textContent += ' (mostrando 120; use o filtro de coleção)';
  }
  var FINDSEQ = 0, findT = null;
  function runFind() {
    var raw = $('#f-q').value.trim(), msg = $('#f-msg'), seq = ++FINDSEQ;
    if (!raw) return;
    var words = raw.split(/\s+/), setW = '', numW = '', nameW = [];
    words.forEach(function (w) {
      var u = w.toUpperCase().replace(/PT$/, '');
      if (/^\d+$/.test(w) && !numW) numW = String(parseInt(w, 10));
      else if (!setW && TDX[u]) setW = u;
      else nameW.push(w);
    });
    var name = nameW.join(' ');
    if (!name) { msg.textContent = 'Digite o nome do Pokémon.'; return; }
    var cands = [name];
    if (nameW.length > 1) nameW.filter(function (w) { return w.length >= 3 && !STOP[w.toLowerCase()]; }).forEach(function (w) { if (cands.indexOf(w) < 0) cands.push(w); });
    msg.textContent = 'Buscando…'; $('#f-res').hidden = true; $('#f-tools').hidden = true; $('#f-dex').hidden = false;
    (function next(i) {
      if (i >= cands.length) { showResults([], 'Nenhuma carta encontrada. Tente só o nome, ou toque em “Ver todas as cartas deste Pokémon”.'); return; }
      fetchCards('name=' + encodeURIComponent(cands[i])).then(function (list) {
        if (seq !== FINDSEQ || !$('#f-q')) return; // veio uma busca mais nova
        list = prep(list);
        var chk = typedFilter(list, { set: setW, num: numW });
        if (!chk.length && i + 1 < cands.length) return next(i + 1);
        FIND.name = cands[i];
        showResults(list, '✓ Encontrei ' + list.length + (list.length === 1 ? ' carta' : ' cartas') + (i ? ' para “' + cands[i] + '”' : '') + '. Toque na sua para ' + (FIND.m && FIND.m.own ? 'trocar' : 'adicionar') + '.');
      }, function () { msg.textContent = 'Não consegui buscar agora. Confira a internet e tente de novo.'; });
    })(0);
  }
  function runDex() {
    var m = FIND.m, msg = $('#f-msg'); if (!m) return;
    msg.textContent = 'Buscando…';
    fetchCards('dexId=' + m.d).then(function (list) {
      list = prep(list);
      if (!list.length) return showResults([], 'Não achei cartas com esse número da Pokédex.');
      showResults(list, '✓ Encontrei ' + list.length + ' cartas de #' + pad(m.d) + '. Toque na sua para ' + (m.own ? 'trocar' : 'adicionar') + '.');
    }, function () { msg.textContent = 'Não consegui buscar agora. Confira a internet e tente de novo.'; });
  }
  function pickCard(cid) {
    var c = FIND.list && FIND.list[cid]; if (!c) return;
    var no = /^\d+$/.test(c.localId) ? c.localId.padStart(3, '0') : c.localId;
    $('#s-set').value = c._code; $('#s-no').value = no; $('#s-url').value = '';
    FIND.sel = { id: cid, image: c.image || '' }; FIND.set = c._code; FIND.no = no;
    Array.prototype.forEach.call(document.querySelectorAll('.res'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cid') === cid ? 'true' : 'false'); });
    $('#f-msg').textContent = c.image ? '✓ Carta escolhida: ' + c._code + ' ' + no + '. Toque em ' + (FIND.m && FIND.m.own ? 'Salvar' : 'Adicionar') + ' para confirmar.' : 'Esta carta não tem imagem na base. Abra “Conferir os dados” e cole o link de uma imagem, ou escolha outra.';
    var sv = $('#f-save'); if (sv) sv.textContent = (FIND.m && FIND.m.own ? 'Salvar ' : 'Adicionar ') + c._code + ' ' + no;
    var sb = $('#f-sel');
    if (sb) { sb.hidden = false; sb.innerHTML = (c.image ? '<img alt="" src="' + esc(c.image + '/low.webp') + '">' : '<span class="nopic">?</span>') + '<span class="who"><b>' + esc(c.name) + '</b><small>' + esc(c._code + ' · ' + no) + ' · ' + esc(($('#s-fin') && $('#s-fin').value) || 'Normal') + '</small></span>'; }
  }
  function openFilters() {
    var sets = knownSets();
    var box = '<div class="box" role="dialog" aria-modal="true" aria-label="Filtros"><h3>Filtros</h3><div class="body">' +
      '<div class="field"><label for="f-fin">Acabamento</label><select id="f-fin"><option value="">Todos</option>' + FINS.map(function (f) { return '<option' + (UI.fin === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="f-set">Coleção</label><select id="f-set"><option value="">Todas</option>' + sets.map(function (x) { return '<option' + (UI.set === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="seg">' + chip('Formas alternativas', ST.alt, 'data-alt="1"') + chip('Cartas sem imagem', UI.noimg, 'data-noimg="1"') + '</div>' +
      '</div><div class="foot"><button class="primary" data-sact="cancel">Ver resultados</button><button class="ghost-btn" data-act="clearfilters">Limpar</button></div></div>';
    SHEETKIND = 'filters'; var sh = $('#sheet'); sh.innerHTML = box; sh.hidden = false;
  }
  function startPresent() {
    if (!VISIBLE.length) return;
    openViewer(VISIBLE[0].id, VISIBLE.map(function (m) { return m.id; }));
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) {}
    clearInterval(PRES); PRES = setInterval(function () { go(1); }, 4500);
    toast('Apresentação: toque ou tecle Esc para sair');
  }
  function stopPresent() { if (PRES) { clearInterval(PRES); PRES = null; try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {} } }
  function closeSheet() { var k = SHEETKIND; SHEETKIND = ''; $('#sheet').hidden = true; $('#sheet').innerHTML = ''; if (k === 'filters') render(); }
  function saveSheet(id) {
    var s = $('#s-set').value.trim().toUpperCase().replace(/\s+/g, ''), n = $('#s-no').value.trim(), f = $('#s-fin').value;
    if (s.length > 3) s = s.replace(/PT$/, '');
    var url = ($('#s-url').value || '').trim();
    if (url && !/^https:\/\//i.test(url)) { toast('O link da imagem deve começar com https://'); return; }
    if (!url && (!s || !n)) { toast('Preencha a coleção e o número'); var ff = $('#f-fields'); if (ff) { ff.classList.remove('collapsed'); var fb = ff.querySelector('.h4btn'); if (fb) fb.setAttribute('aria-expanded', 'true'); } return; }
    s = s || '—'; n = n || '—';
    if (/^\d{1,2}$/.test(n)) n = n.padStart(3, '0');
    var pick = FIND.sel && FIND.set === s && FIND.no === n ? FIND.sel : null;
    ST.edits[id] = { own: 1, set: s, no: n, fin: f, img: pick ? pick.image : '', tid: pick ? pick.id : '', imgUrl: url };
    var k = ST.wants.indexOf(id); if (k >= 0) ST.wants.splice(k, 1);
    delete NOIMG[id]; // se a imagem tinha falhado antes, tenta de novo com o endereço/carta novos
    save(); closeSheet(); compute(); viewerRender(); render(); toast('Carta salva');
  }

  /* ---------- exportar ---------- */
  var FIN_SHEET = { 'Foil': 'Foill', 'Reverse Foil': 'Reverse Foill' };
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function buildCsv() {
    var rows = [['Pokémon', 'Número', 'Orig', 'Gen', 'Código', 'Coleção', 'Tipo', 'Registrado?']];
    D.mons.forEach(function (b) {
      var m = eff(b);
      rows.push([m.n, m.alt ? m.kind : m.d, m.alt ? 'alt' : 'orig', m.g + ' - ' + REG[m.g].name, m.own ? m.no : (m.alt ? m.note : ''), m.own ? m.set + 'pt' : '', m.own ? (FIN_SHEET[m.fin] || m.fin || 'Normal') : '', m.own ? 'TRUE' : 'FALSE']);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
  }
  function openExport() {
    var csv = buildCsv();
    var sh = $('#sheet');
    sh.innerHTML = '<div class="box" role="dialog" aria-modal="true" aria-label="Exportar CSV"><h3>Exportar coleção</h3><p style="margin:0;color:var(--muted)">Mesmas colunas da planilha. Baixe o arquivo ou copie o texto e cole no Excel.</p><div class="field"><label for="s-csv">CSV</label><textarea id="s-csv" readonly></textarea></div><div class="v-actions"><button class="primary" data-sact="download">Baixar .csv</button><button class="ghost-btn" data-sact="copycsv">Copiar</button><button class="ghost-btn" data-sact="cancel">Fechar</button></div></div>';
    sh.hidden = false; $('#s-csv').value = csv;
  }
  function download() {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + buildCsv()], { type: 'text/csv;charset=utf-8' }));
      a.download = 'pokedex-tcg.csv'; document.body.appendChild(a); a.click(); a.remove();
      toast('Arquivo gerado');
    } catch (e) { toast('Não deu para baixar. Use Copiar'); }
  }
  function copyText(t, ok) {
    function fallback() { var el = $('#s-csv'); if (el) { el.select(); } toast('Selecione e copie o texto'); }
    try { navigator.clipboard.writeText(t).then(function () { toast(ok); }, fallback); } catch (e) { fallback(); }
  }

  var tt;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 2200); }

  /* ---------- menu lateral recolhível (computador) ---------- */
  var navMini = false;
  try { navMini = localStorage.getItem('pktcg.navmini') === '1'; } catch (e) {}
  function applyNav() {
    document.body.classList.toggle('nav-mini', navMini);
    var b = $('#nav-toggle'); if (b) { b.setAttribute('aria-label', navMini ? 'Expandir menu' : 'Recolher menu'); b.setAttribute('aria-expanded', navMini ? 'false' : 'true'); b.title = navMini ? 'Expandir menu' : 'Recolher menu'; }
  }
  applyNav();

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.id === 'nav-toggle') { navMini = !navMini; try { localStorage.setItem('pktcg.navmini', navMini ? '1' : '0'); } catch (e) {} return applyNav(); }
    if (t.hasAttribute('data-rsub')) { UI.rsub = t.getAttribute('data-rsub'); return render(); }
    if (t.hasAttribute('data-rsel')) { UI.rsel = +t.getAttribute('data-rsel'); render(); if (t.classList.contains('rg-mini')) window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (t.hasAttribute('data-sort')) { UI.sort = t.getAttribute('data-sort'); return render(); }
    if (t.hasAttribute('data-setgo')) { UI.set = t.getAttribute('data-setgo'); UI.region = 0; UI.status = 'own'; location.hash = 'colecao'; return; }
    if (t.hasAttribute('data-goto')) { UI.region = +t.getAttribute('data-goto'); UI.status = 'all'; location.hash = 'colecao'; return; }
    if (t.hasAttribute('data-theme-set')) { PREF.theme = t.getAttribute('data-theme-set'); savePref(); return render(); }
    if (t.hasAttribute('data-size-set')) { PREF.size = t.getAttribute('data-size-set'); savePref(); return render(); }
    if (t.hasAttribute('data-r')) { UI.region = +t.getAttribute('data-r'); return render(); }
    if (t.hasAttribute('data-status')) { UI.status = t.getAttribute('data-status'); return render(); }
    if (t.hasAttribute('data-alt')) { ST.alt = !ST.alt; save(); render(); if (SHEETKIND === 'filters') openFilters(); return; }
    if (t.hasAttribute('data-noimg')) { UI.noimg = !UI.noimg; render(); if (SHEETKIND === 'filters') openFilters(); return; }
    if (t.hasAttribute('data-view')) { location.hash = t.getAttribute('data-view'); return; }
    if (t.classList.contains('tile')) { return openViewer(t.getAttribute('data-id'), VISIBLE.map(function (m) { return m.id; })); }
    var act = t.getAttribute('data-act');
    if (act === 'addvis') {
      var n = 0; VISIBLE.forEach(function (m) { if (!m.own && !noCard(m) && ST.wants.indexOf(m.id) < 0) { ST.wants.push(m.id); n++; } });
      save(); render(); return toast(n + ' adicionadas à lista');
    }
    if (act === 'addfromlist') { V.ids = []; V.i = 0; return openSheet(t.getAttribute('data-id')); }
    if (act === 'unwant') { var k = ST.wants.indexOf(t.getAttribute('data-id')); if (k >= 0) ST.wants.splice(k, 1); save(); return render(); }
    if (act === 'clearlist') { ST.wants = []; save(); return render(); }
    if (act === 'copylist') {
      var items = wantList(), txt = 'Lista de compras · Pokédex TCG\n';
      D.regions.forEach(function (r) {
        var g = items.filter(function (m) { return m.g === r.g; });
        if (g.length) txt += '\n' + r.name + '\n' + g.map(function (m) { return '- ' + m.n + ' (#' + pad(m.d) + ')'; }).join('\n') + '\n';
      });
      return copyText(txt, 'Lista copiada');
    }
    if (act === 'sendlink') {
      var em = ($('#a-email').value || '').trim(); if (!/^\S+@\S+\.\S+$/.test(em)) return toast('Digite um e-mail válido');
      SYNC.email = em; toast('Enviando…');
      DB.sendLink(em).then(function () { SYNC.sent = em; SYNC.msg = ''; render(); toast('Link enviado. Confira o e-mail'); },
        function (e) { SYNC.msg = e.status === 429 ? 'Muitos e-mails em pouco tempo. Espere alguns minutos e tente de novo.' : 'Não foi possível enviar: ' + e.message; render(); });
      return;
    }
    if (act === 'pastelink') {
      var lk = ($('#a-link').value || '').trim(); if (!lk) return toast('Cole o link do e-mail');
      toast('Entrando…');
      DB.consumeLink(lk).then(function () { SYNC.sent = ''; SYNC.msg = ''; toast('Você entrou na conta'); syncNow(); render(); },
        function (e) { SYNC.msg = 'Não entrou: ' + e.message; render(); });
      return;
    }
    if (act === 'verify') {
      var cd = ($('#a-code').value || '').replace(/\s+/g, ''); if (!cd) return toast('Digite o código');
      DB.verifyCode(SYNC.sent, cd).then(function () { SYNC.sent = ''; SYNC.msg = ''; syncNow(); render(); }, function (e) { toast('Código inválido ou vencido'); });
      return;
    }
    if (act === 'pwlogin') {
      var pe = ($('#a-email').value || '').trim(), pp = $('#a-pw').value || '';
      if (!/^\S+@\S+\.\S+$/.test(pe)) return toast('Digite um e-mail válido'); if (!pp) return toast('Digite a senha');
      SYNC.email = pe; toast('Entrando…');
      DB.signInPassword(pe, pp).then(function () { SYNC.msg = ''; toast('Você entrou na conta'); syncNow(); render(); },
        function (e) { SYNC.msg = /invalid|credentials/i.test(e.message) ? 'E-mail ou senha incorretos. Se ainda não definiu uma senha, entre pelo link do e-mail primeiro.' : 'Não entrou: ' + e.message; render(); });
      return;
    }
    if (act === 'setpw') {
      var np = $('#a-newpw').value || ''; if (np.length < 8) return toast('Use pelo menos 8 caracteres');
      DB.setPassword(np).then(function () { SYNC.pwOpen = false; SYNC.msg = 'Senha salva. Agora você pode entrar com e-mail e senha em qualquer aparelho.'; render(); toast('Senha salva'); },
        function (e) { SYNC.pwOpen = true; SYNC.msg = 'Não salvou a senha: ' + e.message; render(); });
      return;
    }
    if (act === 'mirror') return mirrorAll();
    if (act === 'syncnow') return syncNow();
    if (act === 'signout') { DB.signOut().then(function () { ST.synced = false; persist(); SYNC.msg = ''; render(); toast('Você saiu da conta'); }); return; }
    if (act === 'filters') return openFilters();
    if (act === 'clearfilters') { UI.fin = ''; UI.set = ''; UI.noimg = false; ST.alt = false; save(); render(); return openFilters(); }
    if (act === 'present') return startPresent();
    if (act === 'size') { PREF.size = PREF.size === 's' ? 'm' : PREF.size === 'm' ? 'l' : 's'; savePref(); return render(); }
    if (act === 'export') return openExport();
    if (act === 'reset') {
      if (confirmRemove !== 'reset') { confirmRemove = 'reset'; render(); return; }
      ST.edits = {}; ST.wants = []; confirmRemove = false; save(); render(); return toast('Dados da planilha restaurados');
    }
    var va = t.getAttribute('data-vact');
    if (va) {
      var id = V.ids[V.i];
      if (va === 'edit') return openSheet(id);
      if (va === 'want') { var w = ST.wants.indexOf(id); if (w >= 0) ST.wants.splice(w, 1); else ST.wants.push(id); save(); return viewerRender(); }
      if (va === 'remove') {
        if (confirmRemove !== id) { confirmRemove = id; return viewerRender(); }
        ST.edits[id] = { own: 0, set: '', no: '', fin: '', img: '', tid: '', imgUrl: '' }; confirmRemove = false; save(); compute(); viewerRender(); toast('Carta removida'); return;
      }
    }
    var sa = t.getAttribute('data-sact');
    if (sa === 'cancel') return closeSheet();
    if (sa === 'fields') { var ff = $('#f-fields'); if (ff) { var op = ff.classList.toggle('collapsed'); t.setAttribute('aria-expanded', op ? 'false' : 'true'); } return; }
    if (sa === 'find') return runFind();
    if (sa === 'dex') return runDex();
    if (sa === 'pick') return pickCard(t.getAttribute('data-cid'));
    if (sa === 'save') return saveSheet(t.getAttribute('data-id'));
    if (sa === 'download') return download();
    if (sa === 'copycsv') return copyText(buildCsv(), 'CSV copiado');
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 's-set' || e.target.id === 's-no') { if (e.target.id === 's-set') FIND.tset = true; else FIND.tno = true; if (FIND.all && FIND.all.length) renderResults(); return; }
    if (e.target.id !== 'f-q') return;
    if (FIND.all && FIND.all.length) renderResults(); // filtra na hora quando você acrescenta coleção ou número
    clearTimeout(findT);
    if (e.target.value.trim().length >= 3) findT = setTimeout(function () { if ($('#f-q')) runFind(); }, 600); // busca sozinha depois de parar de digitar
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'f-fin') { UI.fin = e.target.value; render(); }
    if (e.target.id === 'f-set') { UI.set = e.target.value; render(); }
    if (e.target.id === 'f-set2' || e.target.id === 'f-sort') renderResults();
  });
  // imagem real que não carrega: tenta o próximo endereço; se acabar, some e deixa a ficha à mostra
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.closest && t.closest('.res') && t.getAttribute('data-en')) { var en = t.getAttribute('data-en'); t.removeAttribute('data-en'); t.src = en; return; }
    if (!t || !t.classList || !t.classList.contains('real')) return;
    var alt = (t.getAttribute('data-alt') || '').split('|').filter(Boolean);
    if (alt.length) { t.setAttribute('data-alt', alt.slice(1).join('|')); t.src = alt[0]; return; }
    var mid = t.getAttribute('data-mid');
    function giveUp() {
      if (mid) {
        NOIMG[mid] = 1;
        var tl = t.closest('.tart') || t.closest('.tile');
        if (tl && !tl.querySelector('.noimg')) tl.insertAdjacentHTML('beforeend', '<span class="tag noimg">Sem imagem</span>');
        var cur = BY[V.ids[V.i]];
        if (cur && cur.id === mid && !$('#viewer').hidden) viewerInfo(cur);
      }
      t.remove();
    }
    // nenhuma fonte original funcionou: tenta a cópia guardada no seu servidor (se estiver logado)
    var all = (t.getAttribute('data-all') || '').split('|').filter(Boolean);
    if (!t.getAttribute('data-st') && all.length && window.DB && DB.user()) {
      t.setAttribute('data-st', '1');
      var ps = all.map(DB.imgPath);
      DB.imgSign(ps).then(function (o) {
        var k = ps.filter(function (p) { return o[p]; })[0];
        if (k) { if (t.isConnected) t.src = o[k]; } else giveUp();
      }, giveUp);
      return;
    }
    giveUp();
  }, true);
  // imagem carregou da fonte original: guarda uma cópia no seu servidor (uma vez só, em segundo plano)
  document.addEventListener('load', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('real')) return;
    t.classList.add('ok'); // a foto entra com um fade suave por cima do fundo neutro
    if (t.getAttribute('data-st') || !window.DB || !DB.user()) return;
    mirEnqueue(t.currentSrc || t.src);
  }, true);

  $('#btn-theme').addEventListener('click', function () { PREF.theme = resolveTheme() === 'light' ? 'dark' : 'light'; savePref(); if (UI.view === 'ajustes') render(); });
  $('#btn-search').addEventListener('click', function () {
    UI.search = !UI.search; $('#search').hidden = !UI.search;
    if (UI.search) $('#q').focus(); else { UI.q = ''; $('#q').value = ''; render(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'f-q') { e.preventDefault(); runFind(); } });
  $('#q').addEventListener('input', function (e) { UI.q = e.target.value; render(); });
  $('#q').addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); if (this.value) { this.value = ''; UI.q = ''; render(); } else $('#btn-search').click(); } });
  $('#v-close').addEventListener('click', closeViewer);
  $('#v-prev').addEventListener('click', function () { go(-1); });
  $('#v-next').addEventListener('click', function () { go(1); });
  document.addEventListener('keydown', function (e) {
    var tg = e.target && e.target.tagName;
    if (e.key === '/' && $('#viewer').hidden && $('#sheet').hidden && tg !== 'INPUT' && tg !== 'TEXTAREA' && tg !== 'SELECT') { e.preventDefault(); if (!UI.search) $('#btn-search').click(); else $('#q').focus(); return; }
    if (!$('#sheet').hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if ($('#viewer').hidden) return;
    if (e.key === 'Escape') closeViewer(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1);
    else if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey) { stopPresent(); openSheet(V.ids[V.i]); }
  });

  // inclinação e brilho holográfico + deslizar para trocar de carta
  var stage = $('#stage'), big = $('#big'), down = false, sx = 0, sy = 0;
  function tilt(e) {
    var r = big.getBoundingClientRect();
    var x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    big.style.setProperty('--ry', ((x - .5) * 18) + 'deg'); big.style.setProperty('--rx', ((.5 - y) * 14) + 'deg');
    big.style.setProperty('--mx', (x * 100) + '%'); big.style.setProperty('--my', (y * 100) + '%');
  }
  function untilt() {
    big.classList.remove('drag');
    big.style.setProperty('--ry', '0deg'); big.style.setProperty('--rx', '0deg'); big.style.setProperty('--mx', '50%'); big.style.setProperty('--my', '50%');
  }
  stage.addEventListener('pointerdown', function (e) { if (PRES && !e.target.closest('button')) { closeViewer(); return; } if (e.target.closest('button')) return; down = true; sx = e.clientX; sy = e.clientY; if (e.pointerType !== 'touch') { big.classList.add('drag'); tilt(e); } });
  stage.addEventListener('pointermove', function (e) { if (e.pointerType !== 'touch' && (down || e.pointerType === 'mouse')) { big.classList.add('drag'); tilt(e); } });
  stage.addEventListener('pointerup', function (e) {
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (down && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    down = false; untilt();
  });
  stage.addEventListener('pointercancel', function () { down = false; untilt(); });
  stage.addEventListener('pointerleave', function () { if (!down) untilt(); });

  /* ---------- escanear cartas (câmera + leitura do número/nome) ---------- */
  var OCR_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  var SC = { open: false, mode: 'one', stream: null, busy: false, added: 0, last: null, cands: [], slot: null, dirty: false, info: null, sel: null, seq: 0, worker: null, workerP: null };
  var NAMEIDX = null, SETINFO = null;
  function alnum(s) { return norm(s).replace(/[^a-z0-9]/g, ''); }
  function nameIndex() {
    if (NAMEIDX) return NAMEIDX;
    NAMEIDX = [];
    D.mons.forEach(function (m) { if (!m.alt) { var k = alnum(baseName(m.n)); if (k.length >= 3) NAMEIDX.push({ k: k, d: m.d, id: m.id, n: baseName(m.n) }); } });
    return NAMEIDX;
  }
  // acha o Pokémon no texto lido do topo da carta (tolera letras trocadas); usa o tamanho da palavra para preferir o nome grande
  function matchMon(words) {
    var idx = nameIndex(), best = null, i, j, k, w, key, cand = [];
    for (i = 0; i < words.length; i++) {
      for (j = 0; j < 3 && i + j < words.length; j++) {
        key = ''; for (k = 0; k <= j; k++) key += alnum(words[i + k].t);
        if (key.length >= 3) cand.push({ key: key, h: words[i].h || 0, pos: i });
      }
    }
    cand.forEach(function (c) {
      for (k = 0; k < idx.length; k++) {
        var e = idx[k], max = e.k.length >= 8 ? 2 : (e.k.length >= 5 ? 1 : 0), dist;
        if (Math.abs(e.k.length - c.key.length) > max) continue;
        dist = e.k === c.key ? 0 : (max ? lev(c.key, e.k, max) : 9);
        if (dist > max) continue;
        // pontuação: menos erros é melhor; depois nome mais longo; depois palavra maior; depois mais cedo
        var sc = dist * 100 - e.k.length * 3 - Math.min(c.h, 80) * 0.5 - (c.pos === 0 ? 0 : 0);
        if (!best || sc < best.sc) best = { sc: sc, e: e, dist: dist };
      }
    });
    return best ? best.e : null;
  }
  // lê "025/165", set e promo a partir do texto do rodapé
  function parseFoot(txt) {
    var t = String(txt || '').toUpperCase().replace(/[·•]/g, ' ').replace(/[\dO]{1,3}\s*[\/\\|]\s*[\dO]{2,3}/g, function (q) { return q.replace(/O/g, '0'); }), out = { num: '', total: '', set: '' }, m;
    m = t.match(/(\d{1,3})\s*[\/\\|]\s*(\d{2,3})/) || t.match(/\b(\d{3})\s*[IL1]\s*(\d{2,3})\b/);
    if (m) { out.num = String(parseInt(m[1], 10)); out.total = String(parseInt(m[2], 10)); }
    var toks = t.split(/[^A-Z0-9]+/).filter(Boolean), i;
    for (i = 0; i < toks.length; i++) { if (TDX[toks[i]]) { out.set = toks[i]; break; } if (/^[A-Z]{2,4}$/.test(toks[i].replace(/PT$/, '')) && TDX[toks[i].replace(/PT$/, '')]) { out.set = toks[i].replace(/PT$/, ''); break; } }
    if (!out.set) {
      var cp = t.replace(/[^A-Z]/g, ''), ks = Object.keys(TDX).filter(function (x) { return /^[A-Z]{3,4}$/.test(x); }).sort(function (a, b) { return b.length - a.length; }), q;
      for (q = 0; q < ks.length; q++) { if (cp.indexOf(ks[q] + 'PT') >= 0) { out.set = ks[q]; break; } }
      if (!out.set) for (q = 0; q < ks.length; q++) { if (cp.indexOf(ks[q]) >= 0) { out.set = ks[q]; break; } }
    }
    if (!out.num) { m = t.match(/\b([A-Z]{2,4})\s?0*(\d{1,3})\b/); if (m && TDX[m[1]]) { out.set = out.set || m[1]; out.num = String(parseInt(m[2], 10)); } }
    return out;
  }
  function loadSetInfo() {
    if (SETINFO) return Promise.resolve(SETINFO);
    return getJSON('https://api.tcgdex.net/v2/pt/sets').then(function (l) {
      SETINFO = {}; (l || []).forEach(function (s) { SETINFO[s.id] = (s.cardCount && (s.cardCount.official || s.cardCount.total)) || 0; });
      return SETINFO;
    }, function () { SETINFO = {}; return SETINFO; });
  }
  function monOfCard(c) { var e = matchMon(String((c._en || c.name) || '').split(/\s+/).map(function (t) { return { t: t, h: 0 }; })); return e ? e.id : ''; }
  var REGIONAL = ['alola', 'galar', 'hisui', 'paldea'];
  // qual casa da Pokédex recebe a carta (forma regional → casa da forma)
  function slotFor(card, baseId) {
    var base = BY[baseId]; if (!base) return null;
    var nm = norm((card.name || '') + ' ' + (card._en || '')), rg = null;
    REGIONAL.forEach(function (r) { if (nm.indexOf(r) >= 0) rg = r; });
    if (rg) {
      var alt = D.mons.filter(function (x) { return x.alt && x.d === base.d && norm(x.n).indexOf(rg) >= 0; })[0];
      if (alt) return alt.id;
    }
    return base.id;
  }
  // do que foi lido (ou digitado) até a lista de cartas possíveis
  // sem o nome: procura pelo número e filtra pelas coleções que têm esse total de cartas
  function byNumber(info, si) {
    var n = +info.num, vs = ['eq:' + n, 'eq:' + String(n).padStart(2, '0'), 'eq:' + String(n).padStart(3, '0')], all = [];
    return Promise.all(vs.map(function (v) { return fetchCards('localId=' + encodeURIComponent(v)).catch(function () { return []; }); })).then(function (rs) {
      var seen = {}; rs.forEach(function (l) { l.forEach(function (c) { if (!seen[c.id]) { seen[c.id] = 1; all.push(c); } }); });
      return all;
    });
  }
  function resolveCard(info, seq) {
    return loadSetInfo().then(function (si) {
      if (seq !== SC.seq) return null;
      var mon = info.monId ? nameIndex().filter(function (e) { return e.id === info.monId; })[0] : null;
      var nameQ = mon ? mon.n : (info.name || '');
      var q0 = nameQ ? fetchCards('name=' + encodeURIComponent(nameQ)) : byNumber(info, si);
      return q0.then(function (list) {
        if (seq !== SC.seq) return null;
        list = prep(list);
        var steps = [], setIds = null, tot = info.total ? +info.total : 0, num = info.num ? +info.num : 0;
        if (info.set && TDX[info.set]) setIds = TDX[info.set].map(function (p) { return p.split('/')[1]; });
        var totSets = {}; if (tot) Object.keys(si).forEach(function (k) { if (si[k] === tot) totSets[k] = 1; });
        var hasTot = Object.keys(totSets).length > 0;
        function f(a) { return list.filter(a); }
        if (num && setIds) steps.push(f(function (c) { return c._num === num && setIds.indexOf(c._set) >= 0; }));
        if (num && hasTot) steps.push(f(function (c) { return c._num === num && totSets[c._set]; }));
        if (num) steps.push(f(function (c) { return c._num === num; }));
        if (setIds) steps.push(f(function (c) { return setIds.indexOf(c._set) >= 0; }));
        var out = null; steps.forEach(function (s) { if (!out && s.length) out = s; });
        var exact = !!out && !!num;
        if (!out) out = list;
        var mine = {}; knownSets().forEach(function (x) { mine[x] = 1; });
        out = out.slice().sort(function (a, b) { var ma = mine[a._code] ? 0 : 1, mb = mine[b._code] ? 0 : 1; return ma - mb || a._code.localeCompare(b._code) || a._num - b._num; });
        if (!nameQ && !exact) out = [];
        return { mon: mon, list: out.slice(0, 18), exact: exact, more: out.length > 18 };
      });
    });
  }

  /* câmera e leitura */
  function loadOcr() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = OCR_SRC; s.onload = res; s.onerror = function () { rej(new Error('ocr')); }; document.head.appendChild(s);
    });
  }
  function getWorker() {
    if (SC.workerP) return SC.workerP;
    SC.workerP = loadOcr().then(function () { return window.Tesseract.createWorker('eng', 1, {}); }).then(function (w) { SC.worker = w; return w; }, function (e) { SC.workerP = null; throw e; });
    return SC.workerP;
  }
  // recorta uma faixa da foto, amplia e aumenta o contraste (ajuda o OCR)
  function strip(src, sx, sy, sw, sh, outW, bin) {
    var c = document.createElement('canvas'), k = outW / sw; c.width = outW; c.height = Math.max(8, Math.round(sh * k));
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    try {
      var W = c.width, Hh = c.height, im = x.getImageData(0, 0, W, Hh), d = im.data, n = W * Hh, g = new Float32Array(n), i, lo = 255, hi = 0, v;
      for (i = 0; i < n; i++) { v = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; g[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
      var sc = hi > lo ? 255 / (hi - lo) : 1; for (i = 0; i < n; i++) g[i] = (g[i] - lo) * sc;
      if (bin) {
        // limiar local (cada ponto comparado com a média da vizinhança): aguenta reflexo e fundo colorido
        var r = Math.max(8, Math.round(W / 40)), ii = new Float64Array((W + 1) * (Hh + 1)), xx, yy, x0, x1, y0, y1, sum, cnt;
        for (yy = 0; yy < Hh; yy++) { var row = 0; for (xx = 0; xx < W; xx++) { row += g[yy * W + xx]; ii[(yy + 1) * (W + 1) + xx + 1] = ii[yy * (W + 1) + xx + 1] + row; } }
        for (yy = 0; yy < Hh; yy++) for (xx = 0; xx < W; xx++) {
          x0 = Math.max(0, xx - r); x1 = Math.min(W, xx + r + 1); y0 = Math.max(0, yy - r); y1 = Math.min(Hh, yy + r + 1);
          sum = ii[y1 * (W + 1) + x1] - ii[y0 * (W + 1) + x1] - ii[y1 * (W + 1) + x0] + ii[y0 * (W + 1) + x0]; cnt = (x1 - x0) * (y1 - y0);
          g[yy * W + xx] = g[yy * W + xx] < (sum / cnt) * 0.86 ? 0 : 255;
        }
      }
      for (i = 0; i < n; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g[i]; d[i * 4 + 3] = 255; }
      x.putImageData(im, 0, 0);
    } catch (e) {}
    return c;
  }
  function readCard(card) {
    // várias leituras de partes diferentes da carta; junta o que cada uma achou
    var W = card.width, H = card.height, tops = [], foots = [], raw = [];
    function words(r) { var w = []; ((r.data && r.data.words) || []).forEach(function (x) { if (x.text && x.confidence > 20) w.push({ t: x.text, h: x.bbox ? x.bbox.y1 - x.bbox.y0 : 0 }); }); if (!w.length) String((r.data && r.data.text) || '').split(/\s+/).forEach(function (t) { if (t) w.push({ t: t, h: 0 }); }); return w; }
    return getWorker().then(function (w) {
      function pass(psm, wl, canvas, kind) {
        return w.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: wl }).then(function () { return w.recognize(canvas); }).then(function (r) {
          raw.push(String((r.data && r.data.text) || '').replace(/\s+/g, ' ').trim());
          if (kind === 'top') tops.push(words(r)); else foots.push((r.data && r.data.text) || '');
        }, function () {});
      }
      var WL = '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
      var plan = [
        ['6', '', function () { return strip(card, 0, 0, W, H * 0.17, 1200, false); }, 'top'],
        ['6', '', function () { return strip(card, 0, 0, W, H * 0.17, 1200, true); }, 'top'],
        ['6', WL, function () { return strip(card, 0, H * 0.86, W, H * 0.14, 1500, false); }, 'foot'],
        ['6', WL, function () { return strip(card, 0, H * 0.86, W, H * 0.14, 1500, true); }, 'foot'],
        ['7', WL, function () { return strip(card, 0, H * 0.9, W * 0.5, H * 0.1, 1300, true); }, 'foot'],
        ['7', WL, function () { return strip(card, W * 0.5, H * 0.9, W * 0.5, H * 0.1, 1300, true); }, 'foot'],
        ['11', '', function () { return strip(card, 0, 0, W, H * 0.3, 1200, true); }, 'top']
      ];
      return plan.reduce(function (p, st, k) {
        return p.then(function () { var m = document.getElementById('sc-prog'); if (m) m.textContent = ' ' + (k + 1) + '/' + plan.length; return pass(st[0], st[1], st[2](), st[3]); });
      }, Promise.resolve());
    }).then(function () {
      var foot = { num: '', total: '', set: '' };
      foots.forEach(function (t) { var f = parseFoot(t); if (!foot.num && f.num) { foot.num = f.num; foot.total = f.total; } if (!foot.total && f.total) foot.total = f.total; if (!foot.set && f.set) foot.set = f.set; });
      var all = []; tops.forEach(function (a) { all = all.concat(a); });
      return { words: all, foot: foot, raw: raw.join(' ⏐ ') };
    });
  }

  function scEl(id) { return document.getElementById(id); }
  function scPanel(html) { scEl('sc-panel').innerHTML = html; }
  function scIdle() {
    SC.busy = false; SC.cands = []; SC.sel = null; SC.slot = null;
    var v = scEl('sc-video'); if (v && SC.stream) { try { v.play(); } catch (e) {} }
    scEl('sc-frozen').hidden = true;
    var last = SC.last ? '<p class="sc-last">✓ ' + esc(SC.last) + '</p>' : '';
    scPanel(last + '<div class="sc-shoot">' + (SC.stream ? '<button class="sc-shutter" data-sc="shoot" aria-label="Fotografar a carta"></button>' : '') +
      '<div class="sc-alt"><button class="ghost-btn" data-sc="pickfile">' + (SC.stream ? 'Foto da galeria' : 'Tirar foto') + '</button><button class="ghost-btn" data-sc="manual">Digitar</button></div></div>');
  }
  function scManualHtml(info) {
    return '<div class="sc-manual"><div class="field"><label for="sc-name">Pokémon</label><input id="sc-name" autocomplete="off" value="' + esc(info.name || '') + '" placeholder="Ex.: Zeraora"></div>' +
      '<div class="field"><label for="sc-num">Número</label><input id="sc-num" inputmode="numeric" autocomplete="off" value="' + esc(info.num || '') + '" placeholder="Ex.: 25"></div>' +
      '<div class="field"><label for="sc-set">Coleção</label><input id="sc-set" autocapitalize="characters" autocomplete="off" value="' + esc(info.set || '') + '" placeholder="Ex.: MEG"></div>' +
      '<button class="primary" data-sc="research">Buscar</button></div>';
  }
  function scManual(info) { SC.busy = false; scEl('sc-frozen').hidden = true; info = info || {}; scPanel('<p class="sc-msg">' + esc(info.msg || 'Digite o que está na carta.') + '</p>' + scManualHtml(info) + (SC.raw ? '<details class="sc-raw"><summary>O que o app leu</summary><p>' + esc(SC.raw) + '</p></details>' : '') + '<div class="sc-alt"><button class="ghost-btn" data-sc="again">Voltar à câmera</button></div>'); }
  function scShowCands(res, info) {
    SC.cands = res.list; SC.info = info;
    if (!res.list.length) return scManual({ name: res.mon ? res.mon.n : info.name, num: info.num, set: info.set, msg: 'Não achei essa carta. Confira o nome, o número e a coleção.' });
    var sel = res.exact && res.list.length === 1 ? res.list[0] : (res.exact ? res.list[0] : null);
    SC.sel = sel ? sel.id : null;
    var read = [res.mon ? res.mon.n : (info.name || ''), info.num ? (info.num + (info.total ? '/' + info.total : '')) : '', info.set].filter(Boolean).join(' · ');
    var h = '<p class="sc-msg">Li: <b>' + esc(read || 'nada') + '</b> · ' + (res.exact ? (res.list.length === 1 ? 'achei 1 carta' : 'achei ' + res.list.length + ' cartas') : 'toque na sua carta') + '</p><div class="sc-cands">';
    res.list.forEach(function (c) {
      var slot = slotFor(c, res.mon ? res.mon.id : monOfCard(c)), s = slot && BY[slot];
      h += '<button type="button" class="sc-c" data-sc="pick" data-cid="' + esc(c.id) + '" aria-pressed="' + (SC.sel === c.id ? 'true' : 'false') + '"><span class="im">' + (c.image ? '<img alt="" src="' + esc(c.image + '/low.webp') + '" data-en="' + esc(c.image.replace('/pt/', '/en/') + '/low.webp') + '">' : '<span class="nopic">sem imagem</span>') + '</span><span class="cap">' + esc(c._code + ' · ' + c.localId) + (s && s.own ? '<small class="own">já tem ' + esc(s.set + ' ' + s.no) + '</small>' : '<small>' + esc(c.name) + '</small>') + '</span></button>';
    });
    h += '</div><div class="sc-actions"><div class="field fin"><label for="sc-fin">Acabamento</label><select id="sc-fin">' + FINS.map(function (f) { return '<option' + (f === (SC.fin || 'Normal') ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></div>' +
      '<button class="primary" id="sc-add" data-sc="add"' + (SC.sel ? '' : ' disabled') + '>' + (SC.sel ? 'Adicionar' : 'Escolha a carta') + '</button></div>' +
      '<div class="sc-alt"><button class="ghost-btn" data-sc="again">Tentar de novo</button><button class="ghost-btn" data-sc="manual">Corrigir</button></div>';
    scPanel(h); SC.mon = res.mon; scSelLabel();
  }
  function scSelLabel() {
    var b = scEl('sc-add'); if (!b) return;
    var c = SC.cands.filter(function (x) { return x.id === SC.sel; })[0];
    b.disabled = !c; b.textContent = c ? 'Adicionar ' + c._code + ' ' + c.localId : 'Escolha a carta';
    Array.prototype.forEach.call(document.querySelectorAll('.sc-c'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-cid') === SC.sel ? 'true' : 'false'); });
  }
  function scAdd() {
    var c = SC.cands.filter(function (x) { return x.id === SC.sel; })[0]; if (!c) return;
    var monId = SC.mon ? SC.mon.id : monOfCard(c);
    var slot = monId && slotFor(c, monId);
    if (!slot) return toast('Não sei em qual Pokémon colocar. Use “Corrigir” e digite o nome');
    var fin = scEl('sc-fin') ? scEl('sc-fin').value : 'Normal'; SC.fin = fin;
    var no = /^\d+$/.test(c.localId) ? c.localId.padStart(3, '0') : c.localId;
    ST.edits[slot] = { own: 1, set: c._code, no: no, fin: fin, img: c.image || '', tid: c.id, imgUrl: '' };
    var k = ST.wants.indexOf(slot); if (k >= 0) ST.wants.splice(k, 1);
    delete NOIMG[slot]; save(); compute(); SC.dirty = true; SC.added++;
    SC.last = BY[slot].n + ' · ' + c._code + ' ' + no + ' adicionada';
    scEl('sc-count').textContent = SC.added + (SC.added === 1 ? ' adicionada' : ' adicionadas');
    if (SC.mode === 'one') { scClose(); toast(BY[slot].n + ' adicionada'); return; }
    toast(BY[slot].n + ' adicionada'); scIdle();
  }
  function scProcess(card) {
    if (SC.busy) return; SC.busy = true; var seq = ++SC.seq;
    var fz = scEl('sc-frozen'); fz.width = card.width; fz.height = card.height; fz.getContext('2d').drawImage(card, 0, 0); fz.hidden = false;
    var v = scEl('sc-video'); try { v.pause(); } catch (e) {}
    scPanel('<p class="sc-msg"><span class="spin" aria-hidden="true"></span> ' + (SC.worker ? 'Lendo a carta…<span id="sc-prog"></span>' : 'Preparando o leitor (só na primeira vez, pode levar alguns segundos)…') + '</p>');
    readCard(card).then(function (r) {
      if (seq !== SC.seq) return null;
      var mon = matchMon(r.words); SC.raw = r.raw;
      var info = { monId: mon ? mon.id : '', name: mon ? mon.n : '', num: r.foot.num, total: r.foot.total, set: r.foot.set };
      if (!mon && !(info.num && info.total)) return scManual({ num: info.num, set: info.set, msg: 'Não consegui ler essa. Tente mais perto, com luz e sem reflexo, ou digite abaixo.' });
      scPanel('<p class="sc-msg"><span class="spin" aria-hidden="true"></span> Procurando ' + esc(mon ? mon.n : info.num + '/' + info.total) + '…</p>');
      return resolveCard(info, seq).then(function (res) { if (res) { SC.busy = false; scShowCands(res, info); } });
    }).catch(function (e) {
      SC.busy = false;
      scManual({ msg: e && e.message === 'ocr' ? 'Não consegui baixar o leitor de texto. Confira a internet ou digite abaixo.' : 'Algo deu errado na leitura. Digite abaixo ou tente de novo.' });
    });
  }
  // recorta a carta no tamanho original da câmera (até 1500 px de largura)
  function cardCanvas(src, crop) {
    var w = Math.round(Math.min(crop.w, 1500)), c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * 88 / 63);
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    return c;
  }
  // nitidez: quanto maior, menos tremido/desfocado (variação de contraste nas faixas de nome e número)
  function sharp(c) {
    var t = 0, W = c.width, H = c.height;
    [[0, 0, W, H * 0.15], [0, H * 0.88, W, H * 0.12]].forEach(function (b) {
      var s = document.createElement('canvas'); s.width = 400; s.height = Math.max(8, Math.round(b[3] * 400 / b[2]));
      var x = s.getContext('2d'); x.drawImage(c, b[0], b[1], b[2], b[3], 0, 0, s.width, s.height);
      try { var d = x.getImageData(0, 0, s.width, s.height).data, i, p, q, a = 0; for (i = 0; i < d.length - 4 * s.width; i += 4) { p = d[i]; q = d[i + 4] - p; a += q * q + (d[i + 4 * s.width] - p) * (d[i + 4 * s.width] - p); } t += a / (d.length / 4); } catch (e) {}
    });
    return t;
  }
  function scShoot() {
    var v = scEl('sc-video'); if (!v || !v.videoWidth || SC.busy) return;
    var box = scEl('sc-cam').getBoundingClientRect(), g = scEl('sc-guide').getBoundingClientRect();
    var s = Math.max(box.width / v.videoWidth, box.height / v.videoHeight), ox = (box.width - v.videoWidth * s) / 2, oy = (box.height - v.videoHeight * s) / 2;
    var crop = { x: (g.left - box.left - ox) / s, y: (g.top - box.top - oy) / s, w: g.width / s, h: g.height / s };
    crop.x = Math.max(0, crop.x); crop.y = Math.max(0, crop.y); crop.w = Math.min(crop.w, v.videoWidth - crop.x); crop.h = Math.min(crop.h, v.videoHeight - crop.y);
    // tira 4 quadros em ~0,4 s e usa o mais nítido
    SC.busy = true; scPanel('<p class="sc-msg"><span class="spin" aria-hidden="true"></span> Segure firme…</p>');
    var best = null, k = 0;
    (function grab() {
      var c = cardCanvas(v, crop), sh = sharp(c);
      if (!best || sh > best.sh) best = { c: c, sh: sh };
      if (++k < 4) return setTimeout(grab, 110);
      SC.busy = false; scProcess(best.c);
    })();
  }
  function scFromFile(file) {
    if (!file || SC.busy) return;
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      // foto de galeria: usa a imagem toda, ajustando para a proporção da carta (centro)
      var W = img.naturalWidth, H = img.naturalHeight, w = W, h = H, r = 63 / 88;
      if (W / H > r) { w = H * r; } else { h = W / r; }
      scProcess(cardCanvas(img, { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h })); URL.revokeObjectURL(url);
    };
    img.onerror = function () { toast('Não consegui abrir essa foto'); URL.revokeObjectURL(url); };
    img.src = url;
  }
  function scStartCam() {
    stopCam();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { SC.stream = null; return scIdle(); }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }).then(function (st) {
      if (!SC.open) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      SC.stream = st; var v = scEl('sc-video'); try { var tr = st.getVideoTracks()[0], cp = tr.getCapabilities ? tr.getCapabilities() : {}; if (cp.focusMode && cp.focusMode.indexOf('continuous') >= 0) tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {}); } catch (e) {} v.srcObject = st; v.setAttribute('playsinline', ''); v.muted = true; v.play().catch(function () {});
      scEl('sc-cam').classList.remove('off'); if (!SC.cands.length && !SC.busy) scIdle();
    }, function () {
      SC.stream = null; scEl('sc-cam').classList.add('off');
      scEl('sc-cam').querySelector('.sc-hint').textContent = 'A câmera não abriu. Use “Tirar foto” (abre a câmera do celular) ou digite.';
      scIdle();
    });
  }
  function stopCam() { if (SC.stream) { SC.stream.getTracks().forEach(function (t) { t.stop(); }); SC.stream = null; } var v = scEl('sc-video'); if (v) v.srcObject = null; }
  function scOpen() {
    var el = scEl('scan'); SC.open = true; SC.added = 0; SC.last = null; SC.busy = false; SC.seq++;
    el.hidden = false; document.body.style.overflow = 'hidden';
    scEl('sc-count').textContent = '';
    scEl('sc-cam').querySelector('.sc-hint').textContent = 'Encaixe a carta inteira na moldura, com boa luz e sem reflexo.';
    scModeUi(); scEl('sc-frozen').hidden = true; scIdle(); scStartCam();
  }
  function scClose() {
    SC.open = false; SC.seq++; stopCam(); scEl('scan').hidden = true; document.body.style.overflow = '';
    if (SC.dirty) { SC.dirty = false; render(); }
  }
  function scModeUi() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-scmode]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-scmode') === SC.mode ? 'true' : 'false'); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sc],[data-scmode],#btn-scan'); if (!b) return;
    if (b.id === 'btn-scan') return scOpen();
    if (b.hasAttribute('data-scmode')) { SC.mode = b.getAttribute('data-scmode'); return scModeUi(); }
    var a = b.getAttribute('data-sc');
    if (a === 'close') return scClose();
    if (a === 'shoot') return scShoot();
    if (a === 'pickfile') return scEl('sc-file').click();
    if (a === 'again') { SC.seq++; return scIdle(); }
    if (a === 'manual') { SC.seq++; return scManual(SC.info || {}); }
    if (a === 'pick') { SC.sel = b.getAttribute('data-cid'); return scSelLabel(); }
    if (a === 'add') return scAdd();
    if (a === 'research') {
      var nm = (scEl('sc-name').value || '').trim(), info = { name: nm, num: String(parseInt(scEl('sc-num').value, 10) || ''), set: (scEl('sc-set').value || '').trim().toUpperCase().replace(/PT$/, ''), total: '' };
      if (!nm) return toast('Digite o nome do Pokémon');
      var hit = matchMon([{ t: nm, h: 0 }]); if (hit) { info.monId = hit.id; info.name = hit.n; }
      var seq = ++SC.seq; scPanel('<p class="sc-msg"><span class="spin" aria-hidden="true"></span> Procurando…</p>');
      resolveCard(info, seq).then(function (res) { if (res) scShowCands(res, info); }, function () { scManual({ name: nm, num: info.num, set: info.set, msg: 'Não consegui buscar agora. Confira a internet.' }); });
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'sc-file') { var f = e.target.files && e.target.files[0]; e.target.value = ''; scFromFile(f); }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && SC.open) stopCam(); else if (!document.hidden && SC.open && !SC.stream && !SC.busy) scStartCam(); });
  window.__scan = { parseFoot: parseFoot, matchMon: matchMon, lev: lev, strip: strip };

  /* ---------- cadastro em lote: digite várias cartas, confira, confirme tudo de uma vez ---------- */
  var LKEY = 'pktcg.lote', LQ = [];
  try { LQ = JSON.parse(localStorage.getItem(LKEY) || '[]'); if (!Array.isArray(LQ)) LQ = []; } catch (e) { LQ = []; }
  LQ.forEach(function (it) { if (it.st === 'busy') it.st = 'new'; });
  function lSave() { try { localStorage.setItem(LKEY, JSON.stringify(LQ)); } catch (e) {} lBadge(); }
  function lBadge() { var b = $('#btn-lote'); if (b) { var n = LQ.length; b.setAttribute('data-n', n ? String(n) : ''); } }
  function parseLine(t) {
    var info = { name: '', num: '', total: '', set: '', monId: '' }, words = [], setW = '';
    String(t).trim().split(/\s+/).forEach(function (w) {
      if (!w) return;
      var m = w.match(/^#?(\d{1,3})(?:\/(\d{2,3}))?$/);
      if (m && !info.num) { info.num = String(parseInt(m[1], 10)); if (m[2]) info.total = String(parseInt(m[2], 10)); return; }
      var u = w.toUpperCase().replace(/PT$/, '');
      if (!setW && u.length >= 2 && TDX[u] && w.length <= 5) { setW = w; info.set = u; return; }
      words.push(w);
    });
    if (!words.length && setW) { words.push(setW); info.set = ''; } // "mew 151": MEW é o nome, não a coleção
    var mon = matchMon(words.map(function (w) { return { t: w, h: 0 }; }));
    if (mon) { info.monId = mon.id; info.name = mon.n; } else info.name = words.join(' ');
    return info;
  }
  function lTrim(c) { return { id: c.id, name: c.name, _en: c._en || '', image: c.image || '', localId: c.localId, _code: c._code, _set: c._set, _num: c._num }; }
  var LRUN = false;
  function lResolve() {
    if (LRUN) return; var it = LQ.filter(function (x) { return x.st === 'new'; })[0]; if (!it) return;
    LRUN = true; it.st = 'busy'; lRender();
    var seq = SC.seq;
    resolveCard(it.info, seq).then(function (res) {
      if (!res) { it.st = 'new'; return; }
      it.cands = res.list.map(lTrim); it.monId = res.mon ? res.mon.id : '';
      if (!it.cands.length) { it.st = 'none'; it.sel = ''; }
      else if (res.exact) { it.st = 'ok'; it.sel = it.cands[0].id; }
      else if (it.cands.length === 1) { it.st = 'ok'; it.sel = it.cands[0].id; }
      else { it.st = 'pick'; it.sel = ''; it.open = true; }
    }, function () { it.st = 'err'; }).then(function () { LRUN = false; lSave(); lRender(); lResolve(); });
  }
  function lCard(it) { return (it.cands || []).filter(function (c) { return c.id === it.sel; })[0]; }
  function lSlot(it, c) { var id = it.monId || monOfCard(c); return id ? slotFor(c, id) : null; }
  function lRender() {
    var box = $('#lt-list'); if (!box) return;
    var ready = 0, h = '';
    LQ.forEach(function (it, i) {
      var c = lCard(it), slot = c && lSlot(it, c), s = slot && BY[slot], stx = '', cls = it.st;
      if (it.st === 'busy' || it.st === 'new') stx = 'Procurando…';
      else if (it.st === 'none') stx = 'Não achei. Toque em “Editar” para corrigir o texto.';
      else if (it.st === 'err') stx = 'Sem internet agora. Toque em “Tentar de novo”.';
      else if (!c) stx = 'Escolha qual é a sua carta ↓';
      else { ready++; stx = (s && s.own ? 'Já tem ' + s.set + ' ' + s.no + ' — será trocada' : 'Pronta para adicionar'); }
      var no = c ? (/^\d+$/.test(c.localId) ? c.localId.padStart(3, '0') : c.localId) : '';
      h += '<div class="lt-row ' + cls + '" data-i="' + i + '"><div class="lt-main"><span class="lt-im">' + (c && c.image ? '<img alt="" src="' + esc(c.image + '/low.webp') + '" data-en="' + esc(c.image.replace('/pt/', '/en/') + '/low.webp') + '">' : '<span>?</span>') + '</span>' +
        '<span class="lt-t"><b>' + esc(c ? c.name : (it.info.name || it.text)) + '</b><small>' + (c ? esc(c._code + ' · ' + no) : esc(it.text)) + '</small><small class="lt-st">' + esc(stx) + '</small></span>' +
        '<span class="lt-btns">' + (it.st === 'ok' || it.st === 'pick' ? '<button class="lt-b" data-lt="open" data-i="' + i + '">' + (it.open ? 'Fechar' : 'Trocar') + '</button>' : '') +
        (it.st === 'none' || it.st === 'err' ? '<button class="lt-b" data-lt="' + (it.st === 'err' ? 'retry' : 'edit') + '" data-i="' + i + '">' + (it.st === 'err' ? 'Tentar de novo' : 'Editar') + '</button>' : '') +
        '<button class="lt-x" data-lt="del" data-i="' + i + '" aria-label="Tirar da lista"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></div>';
      if (it.open && it.cands && it.cands.length) {
        h += '<div class="sc-cands lt-cands">' + it.cands.map(function (x) {
          var sl = lSlot(it, x), ss = sl && BY[sl];
          return '<button type="button" class="sc-c" data-lt="pick" data-i="' + i + '" data-cid="' + esc(x.id) + '" aria-pressed="' + (it.sel === x.id ? 'true' : 'false') + '"><span class="im">' + (x.image ? '<img alt="" src="' + esc(x.image + '/low.webp') + '" data-en="' + esc(x.image.replace('/pt/', '/en/') + '/low.webp') + '">' : '<span class="nopic">sem imagem</span>') + '</span><span class="cap">' + esc(x._code + ' · ' + x.localId) + (ss && ss.own ? '<small class="own">já tem ' + esc(ss.set + ' ' + ss.no) + '</small>' : '<small>' + esc(x.name) + '</small>') + '</span></button>';
        }).join('') + '</div>';
      }
      if (c) { h += '<div class="lt-fin"><label>Acabamento <select data-lt="fin" data-i="' + i + '">' + FINS.map(function (f) { return '<option' + (f === (it.fin || 'Normal') ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></label></div>'; }
      h += '</div>';
    });
    box.innerHTML = h || '<p class="lt-empty">A lista está vazia. Digite as cartas acima.</p>';
    var ok = $('#lt-ok'); if (ok) { ok.disabled = !ready; ok.textContent = ready ? 'Confirmar ' + ready + (ready === 1 ? ' carta' : ' cartas') : 'Confirmar'; }
    var cl = $('#lt-clear'); if (cl) cl.hidden = !LQ.length;
  }
  function openLote() {
    var sh = $('#lote');
    sh.innerHTML = '<div class="box" role="dialog" aria-modal="true" aria-label="Cadastrar em lote"><h3>Cadastrar em lote</h3><div class="body">' +
      '<p class="hint" style="margin:0">Uma carta por linha: nome, coleção e número. Ex.: <b>zeraora meg 2</b> · <b>pikachu svi 25</b> · <b>mew 151</b>. Se faltar coleção ou número, você escolhe a carta na lista. Nada é salvo até você confirmar.</p>' +
      '<div class="field"><label for="lt-in">Cartas (uma por linha)</label><textarea id="lt-in" rows="2" autocomplete="off" autocapitalize="none" placeholder="zeraora meg 2"></textarea></div>' +
      '<button class="primary" data-lt="add" type="button">Adicionar à lista</button><div id="lt-list" class="lt-list"></div></div>' +
      '<div class="foot"><button class="primary" id="lt-ok" data-lt="ok" disabled>Confirmar</button><button class="ghost-btn" id="lt-clear" data-lt="clear" hidden>Limpar lista</button><button class="ghost-btn" data-lt="close">Fechar</button></div></div>';
    sh.hidden = false; document.body.style.overflow = 'hidden'; lRender(); lResolve();
  }
  function closeLote() { $('#lote').hidden = true; $('#lote').innerHTML = ''; document.body.style.overflow = ''; if (LDIRTY) { LDIRTY = false; render(); } }
  var LDIRTY = false;
  function lAddText() {
    var ta = $('#lt-in'), lines = String(ta.value).split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return toast('Digite pelo menos uma carta');
    lines.forEach(function (l) { LQ.push({ text: l, info: parseLine(l), st: 'new', cands: [], sel: '', fin: 'Normal', monId: '' }); });
    ta.value = ''; lSave(); lRender(); lResolve();
  }
  function lConfirm() {
    var n = 0, keep = [];
    LQ.forEach(function (it) {
      var c = lCard(it), slot = c && lSlot(it, c);
      if (!c || !slot) { keep.push(it); return; }
      var no = /^\d+$/.test(c.localId) ? c.localId.padStart(3, '0') : c.localId;
      ST.edits[slot] = { own: 1, set: c._code, no: no, fin: it.fin || 'Normal', img: c.image || '', tid: c.id, imgUrl: '' };
      var k = ST.wants.indexOf(slot); if (k >= 0) ST.wants.splice(k, 1);
      delete NOIMG[slot]; n++;
    });
    if (!n) return;
    LQ = keep; save(); compute(); lSave(); LDIRTY = true; lRender();
    toast(n + (n === 1 ? ' carta adicionada' : ' cartas adicionadas') + (keep.length ? ' · ' + keep.length + ' ainda na lista' : ''));
    if (!keep.length) closeLote();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-lt],#btn-lote'); if (!b) return;
    if (b.id === 'btn-lote') return openLote();
    var a = b.getAttribute('data-lt'), i = +b.getAttribute('data-i'), it = LQ[i];
    if (a === 'close') return closeLote();
    if (a === 'add') return lAddText();
    if (a === 'ok') return lConfirm();
    if (a === 'clear') { LQ = []; lSave(); return lRender(); }
    if (!it) return;
    if (a === 'del') { LQ.splice(i, 1); lSave(); return lRender(); }
    if (a === 'open') { it.open = !it.open; return lRender(); }
    if (a === 'pick') { it.sel = b.getAttribute('data-cid'); it.st = 'ok'; it.open = false; lSave(); return lRender(); }
    if (a === 'retry') { it.st = 'new'; lSave(); lRender(); return lResolve(); }
    if (a === 'edit') { var ta = $('#lt-in'); ta.value = (ta.value ? ta.value + '\n' : '') + it.text; LQ.splice(i, 1); lSave(); lRender(); ta.focus(); return; }
  });
  document.addEventListener('change', function (e) {
    var t = e.target; if (t && t.getAttribute && t.getAttribute('data-lt') === 'fin') { var it = LQ[+t.getAttribute('data-i')]; if (it) { it.fin = t.value; lSave(); } }
  });
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'lt-in' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); lAddText(); }
    if (e.key === 'Escape' && $('#lote') && !$('#lote').hidden) closeLote();
  });
  lBadge();

  /* ---------- rota e início ---------- */
  var VIEWS = ['colecao', 'vitrine', 'lista', 'regioes', 'ajustes'];
  function route() {
    var h = (location.hash || '').replace('#', '');
    if (h === 'mais') { h = 'ajustes'; try { history.replaceState(null, '', location.pathname + location.search + '#ajustes'); } catch (e) {} }
    UI.view = VIEWS.indexOf(h) >= 0 ? h : 'colecao';
    if (!$('#viewer').hidden) { stopPresent(); $('#viewer').hidden = true; document.body.style.overflow = ''; }
    if (!$('#sheet').hidden) closeSheet();
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  applyPrefs();
  /* ---------- imprimir fichas (cartas que faltam) ---------- */
  var PR = { src: 'miss', reg: 'all', paper: 'a4', fill: 'w', marks: 1, guide: 0, region: 1, page: 0 };
  try { var _pr = JSON.parse(localStorage.getItem('pktcg.print') || 'null'); if (_pr) Object.keys(PR).forEach(function (k) { if (_pr[k] != null && k !== 'page') PR[k] = _pr[k]; }); } catch (e) {}
  var PSZ = { a4: [210, 297], letter: [215.9, 279.4] };
  function prSave() { try { localStorage.setItem('pktcg.print', JSON.stringify(PR)); } catch (e) {} }
  function prItems() {
    var l = PR.src === 'wants' ? wantList() : D.mons.map(eff).filter(function (m) { return !m.own && inScope(m); });
    l = l.filter(function (m) { return !noCard(m) && (PR.reg === 'all' || String(m.g) === String(PR.reg)); });
    return l.sort(function (a, b) { return a.d - b.d || (a.alt || 0) - (b.alt || 0); });
  }
  function prMm(n) { return (Math.round(n * 100) / 100) + 'mm'; }
  function prPages(items) {
    var W = PSZ[PR.paper][0], H = PSZ[PR.paper][1], ox = (W - 189) / 2, oy = (H - 264) / 2, out = [], n = Math.max(1, Math.ceil(items.length / 9));
    for (var p = 0; p < n; p++) {
      var h = '<div class="pgp" style="width:' + prMm(W) + ';height:' + prMm(H) + '"><div class="pgg' + (PR.guide ? ' guide' : '') + '" style="left:' + prMm(ox) + ';top:' + prMm(oy) + '">';
      items.slice(p * 9, p * 9 + 9).forEach(function (m) {
        h += '<div class="pc ' + (PR.fill === 'g' ? 'pcg' : '') + '"><div class="pcx"></div><div class="pcname">' + esc(m.n) + '</div>' + sp(m, 'pca') + '<div class="pcn">#' + pad(m.d) + (PR.region && REG[m.g] ? ' · ' + esc(REG[m.g].name) : '') + '</div></div>';
      });
      h += '</div>';
      if (PR.marks) {
        var L = 3, off = 1.6, mk = function (x, y, w, hh) { return '<i class="pm" style="left:' + prMm(x) + ';top:' + prMm(y) + ';width:' + prMm(w) + ';height:' + prMm(hh) + '"></i>'; };
        for (var i = 0; i <= 3; i++) { var x = ox + i * 63, y = oy + i * 88; h += mk(x - .1, oy - off - L, .2, L) + mk(x - .1, oy + 264 + off, .2, L) + mk(ox - off - L, y - .1, L, .2) + mk(ox + 189 + off, y - .1, L, .2); }
      }
      out.push(h + '</div>');
    }
    return out;
  }
  function prFit() {
    var st = $('#pr-stage'), pg = $('#pr-pg'); if (!st || !pg) return;
    var W = PSZ[PR.paper][0], H = PSZ[PR.paper][1], cw = Math.max(120, Math.min((st.parentNode.clientWidth || 320) - 28, 340)), sc = cw / (W * 96 / 25.4);
    pg.style.transform = 'scale(' + sc + ')'; st.style.width = cw + 'px'; st.style.height = (H * 96 / 25.4 * sc) + 'px';
  }
  function prRender() {
    var items = prItems(), pages = prPages(items), np = pages.length; if (PR.page >= np) PR.page = np - 1; if (PR.page < 0) PR.page = 0;
    var box = $('#print'); if (!box || box.hidden) return;
    $('#pr-pg').innerHTML = items.length ? pages[PR.page] : '';
    $('#pr-pg').style.width = PSZ[PR.paper][0] + 'mm'; $('#pr-pg').style.height = PSZ[PR.paper][1] + 'mm';
    $('#pr-info').textContent = items.length ? items.length + (items.length === 1 ? ' ficha' : ' fichas') + ' · ' + np + (np === 1 ? ' folha' : ' folhas') : 'Nada para imprimir com essa escolha';
    $('#pr-pl').textContent = items.length ? 'Folha ' + (PR.page + 1) + ' de ' + np : '';
    $('#pr-prev').disabled = PR.page <= 0; $('#pr-next').disabled = PR.page >= np - 1; $('#pr-go').disabled = !items.length;
    prFit();
  }
  function openPrint() {
    var sh = $('#print'), opts = '<option value="all">Todas as regiões</option>' + D.regions.map(function (r) { return '<option value="' + r.g + '">' + esc(r.name) + '</option>'; }).join('');
    sh.innerHTML = '<div class="box" role="dialog" aria-modal="true" aria-label="Imprimir fichas"><h3>Imprimir fichas</h3><div class="body">' +
      '<p class="hint" style="margin:0">Uma ficha por carta que falta, no tamanho real (63 × 88 mm), com marcas de corte. Para a pasta de cartas.</p>' +
      '<div class="field"><label for="pr-src">O que imprimir</label><select id="pr-src"><option value="miss">Cartas que faltam</option><option value="wants">Só a lista de compras</option></select></div>' +
      '<div class="field"><label for="pr-reg">Região</label><select id="pr-reg">' + opts + '</select></div>' +
      '<div class="field"><label>Folha</label><div class="seg" id="pr-paper">' + chip('A4', PR.paper === 'a4', 'data-pr="paper:a4"') + chip('Carta', PR.paper === 'letter', 'data-pr="paper:letter"') + '</div></div>' +
      '<div class="field"><label>Fundo da ficha</label><div class="seg" id="pr-fill">' + chip('Branco', PR.fill === 'w', 'data-pr="fill:w"') + chip('Cinza', PR.fill === 'g', 'data-pr="fill:g"') + '</div></div>' +
      '<div class="field"><label>Detalhes</label><div class="pr-tg">' + chip('Marcas de corte', PR.marks, 'data-pr="tog:marks"') + chip('Linha-guia', PR.guide, 'data-pr="tog:guide"') + chip('Mostrar região', PR.region, 'data-pr="tog:region"') + '</div></div>' +
      '<div class="pr-prev"><div class="pr-bar"><button class="icon-btn" id="pr-prev" aria-label="Folha anterior" data-pr="pg:-1">‹</button><span id="pr-pl"></span><button class="icon-btn" id="pr-next" aria-label="Próxima folha" data-pr="pg:1">›</button></div>' +
      '<div class="pr-desk"><div id="pr-stage" class="pr-stage"><div id="pr-pg" class="pr-sheet"></div></div></div><p class="hint" id="pr-info" style="margin:0;text-align:center"></p></div>' +
      '<p class="hint" style="margin:0">Na janela de impressão: escala <b>100%</b> (tamanho real), margens <b>Nenhuma</b>, e ative <b>gráficos de segundo plano</b> se a arte não aparecer. Teste com uma folha antes.</p></div>' +
      '<div class="foot"><button class="primary" id="pr-go" data-pr="go">Imprimir / salvar PDF</button><button class="ghost-btn" data-pr="close">Fechar</button></div></div>';
    sh.hidden = false; document.body.style.overflow = 'hidden'; PR.page = 0;
    $('#pr-src').value = PR.src; $('#pr-reg').value = PR.reg; prRender();
  }
  function closePrint() { var sh = $('#print'); if (!sh) return; sh.hidden = true; sh.innerHTML = ''; document.body.style.overflow = ''; }
  function doPrint() {
    var items = prItems(); if (!items.length) return;
    var pa = $('#printarea'); if (!pa) { pa = document.createElement('div'); pa.id = 'printarea'; document.body.appendChild(pa); }
    pa.innerHTML = prPages(items).join('');
    var ps = $('#pgstyle'); if (!ps) { ps = document.createElement('style'); ps.id = 'pgstyle'; document.head.appendChild(ps); }
    ps.textContent = '@page{size:' + (PR.paper === 'a4' ? 'A4' : 'letter') + ' portrait;margin:0}';
    var done = function () { pa.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); }, 250);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-act="print"]'); if (a) { e.preventDefault(); return openPrint(); }
    var b = e.target.closest('[data-pr]'); if (!b) return;
    var v = b.getAttribute('data-pr'), k = v.split(':')[0], x = v.split(':')[1];
    if (k === 'close') return closePrint();
    if (k === 'go') return doPrint();
    if (k === 'paper') PR.paper = x; else if (k === 'fill') PR.fill = x;
    else if (k === 'tog') PR[x] = PR[x] ? 0 : 1;
    else if (k === 'pg') { PR.page += +x; prRender(); return; }
    prSave();
    ['paper', 'fill'].forEach(function (g) { var s = $('#pr-' + g); if (s) [].forEach.call(s.querySelectorAll('.chip'), function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-pr') === g + ':' + PR[g])); }); });
    [].forEach.call(document.querySelectorAll('#print [data-pr^="tog:"]'), function (c) { c.setAttribute('aria-pressed', String(!!PR[c.getAttribute('data-pr').split(':')[1]])); });
    prRender();
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'pr-src') { PR.src = e.target.value; PR.page = 0; prSave(); prRender(); }
    else if (e.target.id === 'pr-reg') { PR.reg = e.target.value; PR.page = 0; prSave(); prRender(); }
  });
  window.addEventListener('resize', prFit);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#print') && !$('#print').hidden) closePrint(); });

  if (window.DB) {
    var back = DB.consumeHash();
    if (back) { if (back.ok) toast('Você entrou na conta'); else SYNC.msg = back.error; }
  }
  route();
  if (window.DB && DB.user()) syncNow();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) syncNow(); });
  window.addEventListener('online', syncNow);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
