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
    ST.alt = !!sv.alt;
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} }

  var UI = { view: 'colecao', region: 0, status: 'all', fin: '', set: '', q: '', search: false };
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
    if (!m.own || !m.set || !/^\d+$/.test(m.no || '')) return [];
    var o = (window.CARD_IMG || {})[m.set + '-' + m.no];
    if (o) return [o];
    var sets = TDX[m.set];
    if (!sets) return [];
    var q = hi ? 'high' : 'low', out = [];
    ['pt', 'en'].forEach(function (lang) {
      sets.forEach(function (s) {
        var padded = m.no, raw = String(parseInt(m.no, 10));
        var unpadFirst = /\/(swsh[1-8](\.\d)?|sm\d+(\.\d)?|xy\d+|bw\d+)$/.test(s);
        (unpadFirst ? [raw, padded] : [padded, raw]).forEach(function (n, i, a) {
          if (a.indexOf(n) === i) out.push('https://assets.tcgdex.net/' + lang + '/' + s + '/' + n + '/' + q + '.webp');
        });
      });
    });
    return out;
  }
  function imgTag(m, hi) {
    var s = sources(m, hi);
    if (!s.length) return '';
    return '<img class="real" loading="lazy" alt="" src="' + esc(s[0]) + '" data-alt="' + esc(s.slice(1).join('|')) + '">';
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
    var want = !m.own && ST.wants.indexOf(m.id) >= 0 ? '<span class="want" title="Na lista de compras">' + ICON.heart + '</span>' : '';
    if (m.own) {
      return '<button class="tile" data-id="' + m.id + '" aria-label="' + esc(lab) + '">' + cardFrame(m, false) + imgTag(m, false) + tag + '</button>';
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
    var h = '<div class="scroller" role="group" aria-label="Regiões">' + chip('Todas', UI.region === 0, 'data-r="0"', S.own + '/' + S.tot);
    D.regions.forEach(function (r) { h += chip(esc(r.name), UI.region === r.g, 'data-r="' + r.g + '"', S.byR[r.g].own + '/' + S.byR[r.g].tot); });
    return h + '</div>';
  }
  function viewColecao(S) {
    var p = pct(S.own, S.tot), sets = knownSets();
    var h = '<section class="progress" aria-label="Progresso"><div class="row"><span class="big-n">' + S.own + '<small>/ ' + S.tot + (ST.alt ? ' com formas alt.' : ' Pokémon') + '</small></span><span class="pct">' + fmt(p) + '%</span></div>' +
      '<div class="bar" role="progressbar" aria-valuenow="' + p + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + p + '%"></i></div><span class="sub">' + (S.tot - S.own) + ' ainda faltam</span></section>';
    h += regionChips(S);
    h += '<div class="scroller" role="group" aria-label="Filtros">' +
      chip('Todas', UI.status === 'all', 'data-status="all"') + chip('Tenho', UI.status === 'own', 'data-status="own"') + chip('Faltam', UI.status === 'miss', 'data-status="miss"') + '<span class="divider"></span>' +
      '<select class="sel' + (UI.fin ? ' on' : '') + '" id="f-fin" aria-label="Acabamento"><option value="">Acabamento</option>' + FINS.map(function (f) { return '<option' + (UI.fin === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select>' +
      '<select class="sel' + (UI.set ? ' on' : '') + '" id="f-set" aria-label="Coleção"><option value="">Coleção</option>' + sets.map(function (s) { return '<option' + (UI.set === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
      chip('Formas alt.', ST.alt, 'data-alt="1"') + '</div>';
    var n = VISIBLE.length;
    h += '<div class="count-line"><span>' + n + (n === 1 ? ' resultado' : ' resultados') + '</span>' + (UI.status === 'miss' && n ? '<button class="link-btn" data-act="addvis">Adicionar à lista de compras</button>' : '') + '</div>';
    return h + gridHtml('grid');
  }
  function gridHtml(cls) {
    if (!VISIBLE.length) return '<div class="empty"><h2>Nada por aqui</h2><p>Mude os filtros ou a busca para ver cartas.</p></div>';
    return '<div class="grid ' + cls + '" id="grid">' + VISIBLE.map(tile).join('') + '</div>';
  }
  function viewVitrine(S) {
    return regionChips(S) + '<div class="count-line"><span>' + VISIBLE.length + ' cartas na vitrine</span></div>' + gridHtml('vitrine');
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
    var h = '<section class="panel"><h2>Progresso por região</h2>';
    D.regions.forEach(function (r) {
      var b = S.byR[r.g];
      h += '<div class="rbar"><span>' + esc(r.name) + '</span><div class="bar"><i style="width:' + pct(b.own, b.tot) + '%"></i></div><span>' + b.own + '/' + b.tot + '</span></div>';
    });
    h += '</section><section class="panel"><h2>Seus dados</h2><p>A coleção fica salva neste aparelho. Exporte um CSV no mesmo formato da planilha para atualizar o Excel.</p><div class="actions" style="padding-top:4px"><button class="primary" data-act="export">Exportar CSV</button><button class="ghost-btn" data-act="reset">' + (confirmRemove === 'reset' ? 'Confirmar: voltar à planilha' : 'Voltar aos dados da planilha') + '</button></div></section>';
    h += '<section class="panel"><h2>Imagens das cartas</h2><p>As cartas que você tem aparecem com a imagem oficial quando a coleção é encontrada na base pública. Quando não é, aparece uma ficha com a arte do Pokémon.</p></section>';
    return h;
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
    Array.prototype.forEach.call(document.querySelectorAll('.nav button'), function (b) {
      if (b.getAttribute('data-view') === UI.view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- visualizador ---------- */
  function layers(m) {
    if (!m.own) return '';
    var k = FIN_KEY[m.fin] || 'n', h = '';
    if (k === 'f') h += '<span class="layer holo"></span>';
    if (k === 'r') h += '<span class="layer holo rev"></span>';
    if (k === 'p') h += '<span class="layer holo promo"></span><span class="layer spark"></span>';
    if (k === 'b') h += '<span class="layer pokeb"></span>';
    return h + '<span class="layer glare"></span>';
  }
  function viewerRender() {
    var m = BY[V.ids[V.i]];
    if (!m) return closeViewer();
    var big = $('#big');
    big.className = 'big' + (m.own ? '' : ' miss');
    var inner;
    if (m.own) inner = cardFrame(m, true) + imgTag(m, true) + layers(m);
    else inner = '<span class="card"><span class="art">' + sp(m, 'sp') + '</span><span class="cn" style="font-weight:500">Ainda não tenho</span></span>';
    big.innerHTML = inner;
    $('#v-pos').textContent = (V.i + 1) + ' de ' + V.ids.length;
    var pills = '';
    if (m.own) { pills += '<span class="pill ok">Na coleção</span>'; if (m.fin) pills += '<span class="pill">' + esc(FIN_LABEL[m.fin] || m.fin) + '</span>'; if (m.set) pills += '<span class="pill">' + esc(m.set) + ' · ' + esc(m.no) + '</span>'; }
    else { pills += '<span class="pill warn">Faltando</span>'; if (note(m)) pills += '<span class="pill">' + esc(note(m)) + '</span>'; }
    var wanted = ST.wants.indexOf(m.id) >= 0;
    var acts = m.own
      ? '<button class="primary" data-vact="edit">Editar carta</button><button class="ghost-btn" data-vact="remove">' + (confirmRemove === m.id ? 'Confirmar remoção' : 'Remover') + '</button>'
      : '<button class="primary" data-vact="edit">Já tenho</button><button class="ghost-btn" data-vact="want">' + (wanted ? 'Na lista ✓' : 'Adicionar à lista') + '</button>';
    $('#v-info').innerHTML = '<div><h2>' + esc(m.n) + '</h2><div class="meta">#' + pad(m.d) + ' · ' + esc(REG[m.g].name) + (m.alt ? ' · forma ' + (m.kind === 'Regional' ? 'regional' : 'alternativa') : '') + '</div></div><div class="pills">' + pills + '</div><div class="v-actions">' + acts + '</div>';
    $('#v-prev').hidden = V.ids.length < 2; $('#v-next').hidden = V.ids.length < 2;
  }
  function openViewer(id, ids) {
    V.ids = ids; V.i = Math.max(0, ids.indexOf(id)); confirmRemove = false;
    $('#viewer').hidden = false; document.body.style.overflow = 'hidden';
    viewerRender(); $('#v-close').focus();
  }
  function closeViewer() { $('#viewer').hidden = true; document.body.style.overflow = ''; confirmRemove = false; render(); }
  function go(d) { if (V.ids.length < 2) return; V.i = (V.i + d + V.ids.length) % V.ids.length; confirmRemove = false; viewerRender(); }

  /* ---------- formulário de cadastro ---------- */
  function openSheet(id) {
    var m = BY[id], sets = knownSets();
    var box = '<div class="box" role="dialog" aria-modal="true" aria-label="Cadastrar carta"><h3>' + esc(m.n) + ' · #' + pad(m.d) + '</h3>' +
      '<div class="field"><label for="s-set">Coleção (código)</label><input id="s-set" list="s-sets" autocapitalize="characters" autocomplete="off" placeholder="Ex.: MEG" value="' + esc(m.set) + '"><datalist id="s-sets">' + sets.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><label for="s-no">Número da carta</label><input id="s-no" inputmode="numeric" autocomplete="off" placeholder="Ex.: 001" value="' + esc(m.no) + '"></div>' +
      '<div class="field"><label for="s-fin">Acabamento</label><select id="s-fin">' + FINS.map(function (f) { return '<option' + ((m.fin || 'Normal') === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></div>' +
      '<div class="v-actions"><button class="primary" data-sact="save" data-id="' + id + '">Salvar</button><button class="ghost-btn" data-sact="cancel">Cancelar</button></div></div>';
    var sh = $('#sheet'); sh.innerHTML = box; sh.hidden = false; $('#s-set').focus();
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }
  function saveSheet(id) {
    var s = $('#s-set').value.trim().toUpperCase().replace(/\s+/g, ''), n = $('#s-no').value.trim(), f = $('#s-fin').value;
    if (s.length > 3) s = s.replace(/PT$/, '');
    if (!s || !n) { toast('Preencha a coleção e o número'); return; }
    if (/^\d{1,2}$/.test(n)) n = n.padStart(3, '0');
    ST.edits[id] = { own: 1, set: s, no: n, fin: f };
    var k = ST.wants.indexOf(id); if (k >= 0) ST.wants.splice(k, 1);
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
    if (t.hasAttribute('data-r')) { UI.region = +t.getAttribute('data-r'); return render(); }
    if (t.hasAttribute('data-status')) { UI.status = t.getAttribute('data-status'); return render(); }
    if (t.hasAttribute('data-alt')) { ST.alt = !ST.alt; save(); return render(); }
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
        ST.edits[id] = { own: 0, set: '', no: '', fin: '' }; confirmRemove = false; save(); compute(); viewerRender(); toast('Carta removida'); return;
      }
    }
    var sa = t.getAttribute('data-sact');
    if (sa === 'cancel') return closeSheet();
    if (sa === 'save') return saveSheet(t.getAttribute('data-id'));
    if (sa === 'download') return download();
    if (sa === 'copycsv') return copyText(buildCsv(), 'CSV copiado');
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'f-fin') { UI.fin = e.target.value; render(); }
    if (e.target.id === 'f-set') { UI.set = e.target.value; render(); }
  });
  // imagem real que não carrega: tenta o próximo endereço; se acabar, some e deixa a ficha à mostra
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('real')) return;
    var alt = (t.getAttribute('data-alt') || '').split('|').filter(Boolean);
    if (alt.length) { t.setAttribute('data-alt', alt.slice(1).join('|')); t.src = alt[0]; } else t.remove();
  }, true);

  $('#btn-search').addEventListener('click', function () {
    UI.search = !UI.search; $('#search').hidden = !UI.search;
    if (UI.search) $('#q').focus(); else { UI.q = ''; $('#q').value = ''; render(); }
  });
  $('#q').addEventListener('input', function (e) { UI.q = e.target.value; render(); });
  $('#v-close').addEventListener('click', closeViewer);
  $('#v-prev').addEventListener('click', function () { go(-1); });
  $('#v-next').addEventListener('click', function () { go(1); });
  document.addEventListener('keydown', function (e) {
    if (!$('#sheet').hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if ($('#viewer').hidden) return;
    if (e.key === 'Escape') closeViewer(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1);
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
  stage.addEventListener('pointerdown', function (e) { if (e.target.closest('button')) return; down = true; sx = e.clientX; sy = e.clientY; big.classList.add('drag'); tilt(e); });
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
    if (!$('#viewer').hidden) { $('#viewer').hidden = true; document.body.style.overflow = ''; }
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
