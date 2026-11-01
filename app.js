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
  function syncState(msg) { SYNC.msg = msg; if (UI && UI.view === 'mais' && $('#viewer').hidden && $('#sheet').hidden) render(); }
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
  function mirUI() { if (UI && UI.view === 'mais' && $('#viewer').hidden && $('#sheet').hidden) render(); }
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
    var mt = document.querySelector('meta[name=theme-color]'); if (mt) mt.setAttribute('content', t === 'light' ? '#f4f3ef' : '#121316');
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

  var UI = { view: 'colecao', region: 0, status: 'all', fin: '', set: '', q: '', search: false, noimg: false };
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
    if (m.own && m.img) return hi ? [m.img + '/high.webp', m.img + '/low.webp'] : [m.img + '/low.webp'];
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
  function tile(m) {
    var lab = m.n + ', ' + pad(m.d) + ', ' + (m.own ? 'na coleção' : 'faltando');
    var tag = m.alt ? '<span class="tag">' + (m.kind === 'Regional' ? 'Reg' : 'Alt') + '</span>' : '';
    if (noImage(m)) tag += '<span class="tag noimg">Sem imagem</span>';
    var want = !m.own && ST.wants.indexOf(m.id) >= 0 ? '<span class="want" title="Na lista de compras">' + ICON.heart + '</span>' : '';
    if (m.own) {
      var md = META[metaKey(m)], ttl = m.n + (m.set ? ' · ' + (md && md.sn ? md.sn + ' ' : '') + m.set + ' ' + m.no : '');
      return '<button class="tile" data-id="' + m.id + '" title="' + esc(ttl) + '" aria-label="' + esc(lab) + '">' + cardFrame(m, false) + imgTag(m, false) + tag + '</button>';
    }
    return '<button class="tile" data-id="' + m.id + '" aria-label="' + esc(lab) + '"><span class="ghost' + (noCard(m) ? ' none' : '') + '"><span class="gn">' + esc(m.n) + '</span>' + sp(m, 'sp') + '<span class="gx">#' + pad(m.d) + '</span></span>' + tag + want + '</button>';
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
        for (var i = 0; i < q.length; i++) if (hay.indexOf(q[i].replace(/^#/, '')) < 0) return false;
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
      chip('Todas', UI.status === 'all', 'data-status="all"') + chip('Tenho', UI.status === 'own', 'data-status="own"') + chip('Faltam', UI.status === 'miss', 'data-status="miss"') + '<span class="divider"></span>' +
      '<button class="chip" data-act="filters" aria-pressed="' + (nf ? 'true' : 'false') + '">Filtros' + (nf ? ' <b>' + nf + '</b>' : '') + '</button></div>';
    var n = VISIBLE.length;
    h += '<div class="count-line"><span>' + n + (n === 1 ? ' resultado' : ' resultados') + '</span>' + sizeBtn() + (UI.status === 'miss' && n ? '<button class="link-btn" data-act="addvis">Adicionar à lista de compras</button>' : '') + '</div>';
    return h + gridHtml('grid');
  }
  function sizeBtn() { return '<button class="link-btn size-btn" data-act="size" aria-label="Mudar o tamanho das cartas">Tamanho: ' + SIZE_LABEL[PREF.size] + '</button>'; }
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
    var h = '<div class="count-line"><span>' + items.length + (items.length === 1 ? ' carta para comprar' : ' cartas para comprar') + '</span></div><div class="actions"><button class="primary" data-act="copylist">Copiar lista</button><button class="ghost-btn" data-act="clearlist">Limpar</button></div><ul class="list">';
    D.regions.forEach(function (r) {
      var g = items.filter(function (m) { return m.g === r.g; });
      if (!g.length) return;
      h += '<h3>' + esc(r.name) + ' · ' + g.length + '</h3>';
      g.forEach(function (m) {
        h += '<li class="li">' + sp(m, 'sp') + '<div class="t"><strong>' + esc(m.n) + '</strong><span>#' + pad(m.d) + (m.alt ? ' · forma alternativa' : '') + '</span></div><button class="icon-btn" data-act="unwant" data-id="' + m.id + '" aria-label="Tirar ' + esc(m.n) + ' da lista"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>';
      });
    });
    return h + '</ul>';
  }
  function viewMais(S) {
    var p = pct(S.own, S.tot);
    var cards = D.regions.map(function (r) {
      var bb = S.byR[r.g], pp = pct(bb.own, bb.tot), M = MAPS[r.g] || { c: 'var(--accent)', sub: '' };
      return '<button class="reg-card" style="--rc:' + M.c + '" data-goto="' + r.g + '" aria-label="Ver ' + esc(r.name) + ' na coleção">' + mapSvg(r.g) +
        '<span class="rn">' + esc(r.name) + '</span><span class="rs">' + esc(M.sub) + '</span><span class="rp">' + fmt(pp) + '<small>%</small></span>' +
        '<span class="rc">' + bb.own + ' de ' + bb.tot + '</span><span class="bar"><i style="width:' + pp + '%"></i></span></button>';
    }).join('');
    var main = '<section class="reg-hero"><div><span class="rh-n">' + S.own + '<small> de ' + S.tot + '</small></span><span class="rh-s">cartas na coleção · ' + fmt(p) + '%</span></div>' +
      '<div class="bar" aria-hidden="true"><i style="width:' + p + '%"></i></div></section>' +
      '<h2 class="sec">Regiões</h2><div class="reg-grid">' + cards + '</div>';
    var u = window.DB && DB.user(), acct;
    if (u) {
      acct = '<section class="panel"><h2>Conta</h2><p>Conectado como <b>' + esc(u.email || 'sua conta') + '</b>. Sua coleção é a mesma em todos os aparelhos em que você entrar.</p><p>' + esc(SYNC.msg || 'Pronto para sincronizar') + '</p><div class="actions" style="padding-top:2px"><button class="primary" data-act="syncnow">Sincronizar agora</button><button class="ghost-btn" data-act="signout">Sair</button></div>' +
        '<details style="margin-top:12px"' + (SYNC.pwOpen ? ' open' : '') + '><summary>Definir ou trocar a senha</summary><p>Com senha, você entra em outro aparelho só com e-mail e senha, sem esperar link no e-mail. Use pelo menos 10 caracteres.</p><div class="field"><label for="a-newpw">Nova senha</label><input id="a-newpw" type="password" autocomplete="new-password" minlength="8"></div><button class="primary" data-act="setpw">Salvar senha</button></details></section>' +
        '<section class="panel"><h2>Imagens no seu servidor</h2><p>' +
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
    var side = acct + '<section class="panel"><h2>Aparência</h2><div class="opt"><span>Tema</span><div class="seg">' +
      chip('Escuro', PREF.theme === 'dark', 'data-theme-set="dark"') + chip('Claro', PREF.theme === 'light', 'data-theme-set="light"') + chip('Auto', PREF.theme === 'auto', 'data-theme-set="auto"') +
      '</div></div><div class="opt"><span>Cartas</span><div class="seg">' +
      chip('Pequenas', PREF.size === 's', 'data-size-set="s"') + chip('Médias', PREF.size === 'm', 'data-size-set="m"') + chip('Grandes', PREF.size === 'l', 'data-size-set="l"') +
      '</div></div></section>' +
      '<section class="panel"><h2>Seus dados</h2><p>A coleção fica salva neste aparelho. Exporte um CSV no mesmo formato da planilha para atualizar o Excel.</p><div class="actions" style="padding-top:4px"><button class="primary" data-act="export">Exportar CSV</button><button class="ghost-btn" data-act="reset">' + (confirmRemove === 'reset' ? 'Confirmar: voltar à planilha' : 'Voltar aos dados da planilha') + '</button></div></section>' +
      '<section class="panel"><h2>Imagens das cartas</h2><p>As imagens vêm da base pública TCGdex. Se uma carta estiver errada ou sem imagem, abra a carta, toque em “Editar carta” e use a busca para escolher a certa.</p></section>';
    return '<div class="mais"><div class="mais-main">' + main + '</div><aside class="mais-side">' + side + '</aside></div>';
  }

  var SUB = { colecao: 'Coleção TCG · 1.025 Pokémon', vitrine: 'Só as cartas que tenho', lista: 'Lista de compras', mais: 'Ajustes e dados' };
  function render() {
    var S = compute(), keep = [];
    Array.prototype.forEach.call(document.querySelectorAll('#app .scroller'), function (s) { keep.push(s.scrollLeft); });
    VISIBLE = UI.view === 'lista' || UI.view === 'mais' ? [] : filtered(S.all);
    var html = UI.view === 'colecao' ? viewColecao(S) : UI.view === 'vitrine' ? viewVitrine(S) : UI.view === 'lista' ? viewLista() : viewMais(S);
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
    var box = '<div class="box" role="dialog" aria-modal="true" aria-label="Cadastrar carta"><h3>' + esc(m.n) + ' · #' + pad(m.d) + '</h3><div class="body">' +
      '<div class="finder" style="border:0;padding:0"><h4>1. Buscar a carta certa</h4><p class="hint">Digite o nome, e se quiser a coleção ou o número (ex.: “charmeleon mep” ou “charmeleon 79”). Toque na carta certa.</p>' +
      '<div class="row"><input id="f-q" type="search" autocomplete="off" value="' + esc(baseName(m.n)) + '" aria-label="Nome da carta"><button data-sact="find" type="button">Buscar</button></div>' +
      '<div class="tools" id="f-tools" hidden></div><p class="hint" id="f-msg"></p><div id="f-res" class="results" hidden></div><button type="button" class="ghost-btn more" data-sact="dex" hidden id="f-dex">Ver todas as cartas deste Pokémon</button></div>' +
      '<div class="finder"><h4>2. Conferir os dados</h4>' +
      '<div class="field"><label for="s-set">Coleção (código)</label><input id="s-set" list="s-sets" autocapitalize="characters" autocomplete="off" placeholder="Ex.: MEG" value="' + esc(m.set) + '"><datalist id="s-sets">' + sets.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><label for="s-no">Número da carta</label><input id="s-no" inputmode="numeric" autocomplete="off" placeholder="Ex.: 001" value="' + esc(m.no) + '"></div>' +
      '<div class="field"><label for="s-fin">Acabamento</label><select id="s-fin">' + FINS.map(function (f) { return '<option' + ((m.fin || 'Normal') === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="s-url">Link da imagem (opcional, para quem não está na base)</label><input id="s-url" type="url" inputmode="url" autocomplete="off" placeholder="https://…" value="' + esc(m.imgUrl || '') + '"></div></div>' +
      '</div><div class="foot"><button class="primary" data-sact="save" data-id="' + id + '">Salvar</button><button class="ghost-btn" data-sact="cancel">Cancelar</button></div></div>';
    FIND = { sel: null, set: '', no: '', list: {}, all: [], m: m }; SHEETKIND = 'edit';
    var sh = $('#sheet'); sh.innerHTML = box; sh.hidden = false; $('#f-q').focus();
  }
  var STOP = { de: 1, do: 1, da: 1, forma: 1, form: 1, the: 1, of: 1 };
  function fetchCards(qs) {
    return Promise.all(['pt', 'en'].map(function (l) { return getJSON('https://api.tcgdex.net/v2/' + l + '/cards?' + qs + '&pagination:page=1&pagination:itemsPerPage=300').catch(function () { return null; }); })).then(function (rs) {
      if (!rs[0] && !rs[1]) throw new Error('offline');
      var seen = {}, list = [];
      rs.forEach(function (r) { (r || []).forEach(function (c) { if (c && c.id && !seen[c.id]) { seen[c.id] = 1; list.push(c); } }); });
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
    $('#f-msg').textContent = msg || '';
    renderResults();
  }
  function renderResults() {
    var box = $('#f-res'), fs = $('#f-set2') ? $('#f-set2').value : '', so = $('#f-sort') ? $('#f-sort').value : 'mine';
    var list = FIND.all.filter(function (c) { return !fs || c._set === fs; });
    var mine = {}; knownSets().forEach(function (x) { mine[x] = 1; });
    list.sort(function (a, b) {
      if (so === 'mine') { var ma = mine[a._code] ? 0 : 1, mb = mine[b._code] ? 0 : 1; if (ma !== mb) return ma - mb; }
      return so === 'num' ? (a._num - b._num || a._code.localeCompare(b._code)) : (a._code.localeCompare(b._code) || a._num - b._num);
    });
    var more = list.length > 120; list = list.slice(0, 120);
    box.innerHTML = list.map(function (c) {
      return '<button type="button" class="res" data-sact="pick" data-cid="' + esc(c.id) + '" aria-pressed="' + (FIND.sel && FIND.sel.id === c.id ? 'true' : 'false') + '"><span class="im">' + (c.image ? '<img loading="lazy" alt="' + esc(c.name) + '" src="' + esc(c.image + '/low.webp') + '">' : '') + '</span><span class="cap">' + esc(c._code + ' · ' + c.localId) + '<small>' + esc(c.name) + '</small></span></button>';
    }).join('');
    box.hidden = !list.length;
    if (more) $('#f-msg').textContent += ' (mostrando 120; use o filtro de coleção)';
  }
  function runFind() {
    var raw = $('#f-q').value.trim(), msg = $('#f-msg');
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
        list = prep(list);
        if (setW) { var ids = TDX[setW].map(function (p) { return p.split('/')[1]; }); list = list.filter(function (c) { return ids.indexOf(c._set) >= 0; }); }
        if (numW) list = list.filter(function (c) { return String(c._num) === numW; });
        if (!list.length) return next(i + 1);
        showResults(list, list.length + ' cartas' + (i ? ' para “' + cands[i] + '”' : '') + '. Toque na certa.');
      }, function () { msg.textContent = 'Não consegui buscar agora. Confira a internet e tente de novo.'; });
    })(0);
  }
  function runDex() {
    var m = FIND.m, msg = $('#f-msg'); if (!m) return;
    msg.textContent = 'Buscando…';
    fetchCards('dexId=' + m.d).then(function (list) {
      list = prep(list);
      if (!list.length) return showResults([], 'Não achei cartas com esse número da Pokédex.');
      showResults(list, list.length + ' cartas de #' + pad(m.d) + '. Toque na certa.');
    }, function () { msg.textContent = 'Não consegui buscar agora. Confira a internet e tente de novo.'; });
  }
  function pickCard(cid) {
    var c = FIND.list && FIND.list[cid]; if (!c) return;
    var no = /^\d+$/.test(c.localId) ? c.localId.padStart(3, '0') : c.localId;
    $('#s-set').value = c._code; $('#s-no').value = no; $('#s-url').value = '';
    FIND.sel = { id: cid, image: c.image || '' }; FIND.set = c._code; FIND.no = no;
    Array.prototype.forEach.call(document.querySelectorAll('.res'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cid') === cid ? 'true' : 'false'); });
    $('#f-msg').textContent = 'Escolhida: ' + c._code + ' ' + no + '. Confira os dados e toque em Salvar.';
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
    if (!url && (!s || !n)) { toast('Preencha a coleção e o número'); return; }
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

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
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
    if (sa === 'find') return runFind();
    if (sa === 'dex') return runDex();
    if (sa === 'pick') return pickCard(t.getAttribute('data-cid'));
    if (sa === 'save') return saveSheet(t.getAttribute('data-id'));
    if (sa === 'download') return download();
    if (sa === 'copycsv') return copyText(buildCsv(), 'CSV copiado');
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'f-fin') { UI.fin = e.target.value; render(); }
    if (e.target.id === 'f-set') { UI.set = e.target.value; render(); }
    if (e.target.id === 'f-set2' || e.target.id === 'f-sort') renderResults();
  });
  // imagem real que não carrega: tenta o próximo endereço; se acabar, some e deixa a ficha à mostra
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('real')) return;
    var alt = (t.getAttribute('data-alt') || '').split('|').filter(Boolean);
    if (alt.length) { t.setAttribute('data-alt', alt.slice(1).join('|')); t.src = alt[0]; return; }
    var mid = t.getAttribute('data-mid');
    function giveUp() {
      if (mid) {
        NOIMG[mid] = 1;
        var tl = t.closest('.tile');
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

  $('#btn-theme').addEventListener('click', function () { PREF.theme = resolveTheme() === 'light' ? 'dark' : 'light'; savePref(); if (UI.view === 'mais') render(); });
  $('#btn-search').addEventListener('click', function () {
    UI.search = !UI.search; $('#search').hidden = !UI.search;
    if (UI.search) $('#q').focus(); else { UI.q = ''; $('#q').value = ''; render(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'f-q') { e.preventDefault(); runFind(); } });
  $('#q').addEventListener('input', function (e) { UI.q = e.target.value; render(); });
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
  stage.addEventListener('pointerdown', function (e) { if (PRES && !e.target.closest('button')) { closeViewer(); return; } if (e.target.closest('button')) return; down = true; sx = e.clientX; sy = e.clientY; big.classList.add('drag'); tilt(e); });
  stage.addEventListener('pointermove', function (e) { if (down || e.pointerType === 'mouse') { big.classList.add('drag'); tilt(e); } });
  stage.addEventListener('pointerup', function (e) {
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (down && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    down = false; untilt();
  });
  stage.addEventListener('pointercancel', function () { down = false; untilt(); });
  stage.addEventListener('pointerleave', function () { if (!down) untilt(); });

  /* ---------- rota e início ---------- */
  var VIEWS = ['colecao', 'vitrine', 'lista', 'mais'];
  function route() {
    var h = (location.hash || '').replace('#', '');
    UI.view = VIEWS.indexOf(h) >= 0 ? h : 'colecao';
    if (!$('#viewer').hidden) { stopPresent(); $('#viewer').hidden = true; document.body.style.overflow = ''; }
    if (!$('#sheet').hidden) closeSheet();
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  applyPrefs();
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
