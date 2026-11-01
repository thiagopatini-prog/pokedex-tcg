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
