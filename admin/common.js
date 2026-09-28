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

  // 画像を、長辺が maxDim 以下になるよう縮小し、JPEGのbase64（data:なし）にする。写真・名刺のアップロード用
  A.resizeImage = function (file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const k = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ base64: c.toDataURL('image/jpeg', quality || 0.85).split(',')[1], mime: 'image/jpeg' });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image_load_failed')); };
      img.src = url;
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

  // 保管してある名刺の画像（管理者だけが見られる）。同じ画像は、読み込み済みのものを使い回す
  A.cardCache = {};
  A.cardData = function (memberId, idx) {
    const k = memberId + ':' + idx;
    if (!A.cardCache[k]) A.cardCache[k] = A.api('adminGetCard', { memberId: memberId, index: idx });
    return A.cardCache[k];
  };
  A.cardElement = async function (memberId, idx, size) {
    const r = await A.cardData(memberId, idx);
    if (!r.ok) return A.h('p', { class: 'err' }, '名刺を読み込めませんでした。');
    if (r.mime === 'application/pdf') {
      const bytes = atob(r.base64), arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return A.h('a', { href: URL.createObjectURL(new Blob([arr], { type: 'application/pdf' })), target: '_blank', class: 'btn', style: 'display:inline-block;width:auto;padding:10px 16px' }, '名刺のPDFを開く');
    }
    return A.h('img', { class: 'cardimg ' + (size || ''), src: 'data:' + r.mime + ';base64,' + r.base64, alt: '名刺' });
  };
  // 名刺の拡大表示（画面の上に重ねて出す）
  A.showCards = function (title, memberId, count) {
    const body = A.h('div', { class: 'ovbody' });
    const ov = A.h('div', { class: 'overlay', onclick: function (e) { if (e.target === ov) ov.remove(); } }, [
      A.h('div', { class: 'ovbox' }, [
        A.h('div', { class: 'ovhead' }, [A.h('strong', {}, title), A.h('button', { type: 'button', class: 'mini', onclick: function () { ov.remove(); } }, '閉じる')]),
        body,
      ]),
    ]);
    document.body.appendChild(ov);
    for (let i = 0; i < count; i++) {
      const slot = A.h('div', { class: 'ovslot' }, [A.h('p', { class: 'muted' }, '読み込み中…')]);
      body.appendChild(slot);
      A.cardElement(memberId, i, 'full').then(function (el) { slot.replaceChildren(el); });
    }
  };

  A.ymd = function (s) { return s ? String(s).replace(/-/g, '/') : ''; };

  window.Admin = A;
})();
