/* Camada de dados (Supabase). Para trocar de servidor (ex.: Hostinger), basta reescrever este arquivo
   mantendo as mesmas funções de window.DB. A chave abaixo é a chave PÚBLICA; ela sozinha não dá acesso aos dados. */
(function () {
  'use strict';
  var URL = 'https://zuxgxzqtgpyinnktanui.supabase.co';
  var KEY = 'sb_publishable_2m4TQgZSK0XeWjny6PRqQw_zvLqeffc';
  var SKEY = 'pktcg.session', S = null;
  try { S = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) {}
  function store(s) { S = s; try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) {} }
  function jwt(t) { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; } }
  function setTokens(a, r, exp) { var p = jwt(a); store({ access: a, refresh: r, exp: Date.now() + (exp || 3600) * 1000 - 60000, uid: p.sub, email: p.email || (S && S.email) || '' }); }
  function req(path, opt) {
    opt = opt || {};
    var h = { apikey: KEY, 'Content-Type': 'application/json' };
    if (opt.auth && S) h.Authorization = 'Bearer ' + S.access;
    if (opt.prefer) h.Prefer = opt.prefer;
    return fetch(URL + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }).then(function (r) {
      if (r.status === 204 || r.status === 201 && !r.headers.get('content-length')) return null;
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var m = (j && (j.msg || j.message || j.error_description || j.error)) || ('Erro ' + r.status); var er = new Error(m); er.status = r.status; throw er; }
        return j;
      });
    });
  }
  function ensure() {
    if (!S) return Promise.reject(new Error('Sem login'));
    if (Date.now() < S.exp) return Promise.resolve();
    return req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: S.refresh } }).then(function (j) {
      setTokens(j.access_token, j.refresh_token, j.expires_in);
    }, function (e) { if (e.status === 400 || e.status === 401) store(null); throw e; });
  }
  // volta do link do e-mail: o endereço traz #access_token=...
  function consumeHash() {
    var h = location.hash || '';
    if (h.indexOf('access_token=') < 0 && h.indexOf('error_description=') < 0) return null;
    var q = {};
    h.replace(/^#/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
    try { history.replaceState(null, '', location.pathname + location.search + '#mais'); } catch (e) { location.hash = 'mais'; }
    if (q.access_token) { setTokens(q.access_token, q.refresh_token, +q.expires_in); return { ok: true }; }
    return { ok: false, error: q.error_description || q.error || 'O link não funcionou' };
  }
  window.DB = {
    user: function () { return S ? { email: S.email, id: S.uid } : null; },
    consumeHash: consumeHash,
    sendLink: function (email) {
      var back = location.origin + location.pathname;
      return req('/auth/v1/otp?redirect_to=' + encodeURIComponent(back), { method: 'POST', body: { email: email, create_user: true } });
    },
    verifyCode: function (email, code) {
      return req('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: email, token: code } }).then(function (j) {
        if (j && j.access_token) { setTokens(j.access_token, j.refresh_token, j.expires_in); if (j.user && j.user.email) { S.email = j.user.email; store(S); } }
        else throw new Error('Código inválido');
      });
    },
    // entrar com e-mail e senha (sem e-mail de link)
    signInPassword: function (email, pw) {
      return req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email, password: pw } }).then(function (j) {
        if (j && j.access_token) { setTokens(j.access_token, j.refresh_token, j.expires_in); S.email = (j.user && j.user.email) || email; store(S); }
        else throw new Error('Não foi possível entrar');
      });
    },
    // define (ou troca) a senha da conta que está logada agora
    setPassword: function (pw) {
      return ensure().then(function () { return req('/auth/v1/user', { method: 'PUT', auth: true, body: { password: pw } }); });
    },
    // link do e-mail colado à mão (quando o link abriu em outro navegador): troca o token do link por uma sessão aqui
    consumeLink: function (txt) {
      var m = String(txt || '').match(/https?:\/\/[^\s"'<>]+/); if (!m) return Promise.reject(new Error('Cole o endereço completo do link'));
      var u; try { u = new window.URL(m[0].replace(/&amp;/g, '&')); } catch (e) { return Promise.reject(new Error('Link inválido')); }
      var tok = u.searchParams.get('token') || u.searchParams.get('token_hash'), type = u.searchParams.get('type') || 'magiclink';
      if (!tok) return Promise.reject(new Error('Esse link não tem o código de acesso'));
      return req('/auth/v1/verify', { method: 'POST', body: { type: type, token_hash: tok } }).then(function (j) {
        if (j && j.access_token) { setTokens(j.access_token, j.refresh_token, j.expires_in); if (j.user && j.user.email) { S.email = j.user.email; store(S); } }
        else throw new Error('Link vencido ou já usado. Peça outro');
      });
    },
    /* ---- imagens no seu Storage privado (bucket "cards") ---- */
    // nome do arquivo a partir do endereço original da imagem (o mesmo endereço sempre dá o mesmo nome)
    imgPath: function (url) {
      var k = String(url).replace(/^https?:\/\//i, ''), h = 5381, i;
      for (i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0;
      return 'i/' + k.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) + '_' + (h >>> 0).toString(36);
    },
    // devolve {caminho: endereço assinado} só para os arquivos que existem (vale por 1 hora)
    imgSign: function (paths) {
      if (!paths.length) return Promise.resolve({});
      return ensure().then(function () {
        return req('/storage/v1/object/sign/cards', { method: 'POST', auth: true, body: { expiresIn: 3600, paths: paths } });
      }).then(function (list) {
        var out = {}; (list || []).forEach(function (r) { if (r && r.signedURL && !r.error) out[r.path] = URL + '/storage/v1' + r.signedURL; });
        return out;
      });
    },
    imgPut: function (path, blob) {
      return ensure().then(function () {
        return fetch(URL + '/storage/v1/object/cards/' + path, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + S.access, 'Content-Type': blob.type || 'image/webp', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' }, body: blob }).then(function (r) {
          if (r.ok) return 'new';
          return r.text().then(function (t) { if (r.status === 409 || /Duplicate|already exists/i.test(t)) return 'dup'; throw new Error('Storage ' + r.status); });
        });
      });
    },
    signOut: function () { var p = S ? req('/auth/v1/logout', { method: 'POST', auth: true }).catch(function () {}) : Promise.resolve(); store(null); return p; },
    pull: function () {
      return ensure().then(function () { return req('/rest/v1/collection_state?select=data,t&limit=1', { auth: true }); }).then(function (rows) { return rows && rows[0] ? rows[0] : null; });
    },
    push: function (data, t) {
      return ensure().then(function () {
        return req('/rest/v1/collection_state?on_conflict=user_id', { method: 'POST', auth: true, prefer: 'resolution=merge-duplicates,return=minimal', body: { user_id: S.uid, data: data, t: t, updated_at: new Date().toISOString() } });
      });
    }
  };
})();
