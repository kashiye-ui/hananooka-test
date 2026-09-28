// 管理画面の共通部品。各画面（seminar-*.js など）は window.Admin.views に自分を登録し、app.js が切り替える。
(function () {
  'use strict';
  const A = { CFG: window.APP_CONFIG || {}, views: {}, idToken: null };

  A.h = function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  };

  A.loadScript = function (src) {
    return new Promise(function (resolve, reject) {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = reject;
      document.head.appendChild(el);
    });
  };

  A.api = async function (action, payload) {
    const r = await fetch(A.CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: Object.assign({ idToken: A.idToken }, payload) }) });
    return r.json();
  };

  // ファイルを、GASに送れる形（base64・data:プレフィックスなし）にする
  A.fileToBase64 = function (file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  A.AI_ACCEPT_MIME = {
    'application/pdf': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
    'image/jpeg': true, 'image/png': true,
  };

  // 画面を切り替える（#route?key=value）
  A.go = function (route, params) {
    const q = Object.keys(params || {}).filter(function (k) { return params[k] != null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    location.hash = '#' + route + (q ? '?' + q : '');
  };

  A.ymd = function (s) { return s ? String(s).replace(/-/g, '/') : ''; };

  window.Admin = A;
})();
