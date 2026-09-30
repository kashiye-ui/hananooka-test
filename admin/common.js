// 管理画面の共通部品。各画面（seminar-*.js など）は window.Admin.views に自分を登録し、app.js が切り替える。
(function () {
  'use strict';
  const A = { CFG: window.APP_CONFIG || {}, views: {}, idToken: null };

  A.h = function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null || attrs[k] === false) return; // null・false の属性は付けない（disabled: null が「無効」になってしまうのを防ぐ）
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

  // LINEログインのIDトークンは、約1時間で期限が切れる。切れたまま使うと「読み込めません」になり、入り直すまで直らない。
  // そこで、期限が近い・切れたときは、自動でログインし直して、同じ画面に戻る（手で入り直さなくてよい）。
  //  ・API呼び出しの前に、期限を確認する  ・サーバーが「トークン無効」と返したときも、ログインし直す
  //  ・しばらく離れていた画面に戻ってきたとき（入力を始める前）に、先に確認する
  A.tokenExpMs = function () {
    try { return JSON.parse(atob(liff.getIDToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch (e) { return 0; }
  };
  A.relogin = function () {
    // 無限に繰り返さないよう、30秒以内に直前にやり直していたら、しない
    try {
      const last = Number(sessionStorage.getItem('kl_relogin') || 0);
      if (Date.now() - last < 30000) return false;
      sessionStorage.setItem('kl_relogin', String(Date.now()));
    } catch (e) { /* 保存できなくても続ける */ }
    try {
      if (typeof liff.isInClient === 'function' && liff.isInClient()) { location.reload(); return true; } // LINEアプリ内: 開き直すと、新しいトークンになる
      liff.logout(); liff.login({ redirectUri: location.href }); return true; // パソコンなど: ログインし直す
    } catch (e) { return false; }
  };
  // ログインし直しが始まったあと、画面が切り替わるまで待つ。8秒たっても切り替わらなかったときは、固まらないよう、エラーとして返す
  A.reloginWait = function () {
    return new Promise(function (resolve) { setTimeout(function () { resolve({ ok: false, error: 'invalid_token' }); }, 8000); });
  };
  A.ensureFreshToken = function (marginMs) {
    if (typeof liff === 'undefined' || !A.idToken) return false;
    const exp = A.tokenExpMs();
    return !!(exp && exp < Date.now() + (marginMs || 120000) && A.relogin());
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    const el = document.activeElement;
    const typing = el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text' && el.value));
    if (!typing) A.ensureFreshToken(600000); // 戻ってきたとき、期限まで10分を切っていたら、先にログインし直す
  });
  setInterval(function () { // 開いたままの画面も、期限の2分前になったら、入力中でなければ、ログインし直す
    const el = document.activeElement;
    const typing = el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text' && el.value));
    if (!typing) A.ensureFreshToken(120000);
  }, 60000);

  // 一覧の「前回の読み込み結果」を覚えておく。一覧を開いたとき、前回の結果を先に出して、最新が届いたら、静かに差し替える（待たされずに、すぐ見える）。
  //  ・覚える場所: この画面を開いている間（メモリ）。お客様の情報を含まない一覧（メンバー・セミナー・申請）だけは、端末にも残す（次に開いたとき、最初から速い）。
  //  ・端末に残したものは、画面のプログラムが新しくなったら（版番号が変わったら）捨てる。項目が増えたときに、古い形のデータで、画面が壊れないようにするため。
  //  ・編集のように、古い内容を元に書き換えてしまうと困る画面では、使わない。
  A._swr = {};
  const PERSIST_ACTIONS = { adminListArchive: 1, adminListMembers: 1, adminListPendingProfiles: 1 }; // お客様の情報は、端末に残さない
  A.ver = (function () { const el = document.querySelector('script[src*="common.js"]'); const m = el && el.src.match(/v=(\d+)/); return m ? m[1] : ''; })();
  const STORE_KEY = 'kl_swr_v1';
  (function hydrate() {
    if (!A.ver) return;
    try {
      const o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (o && o.ver === A.ver && o.data) Object.keys(o.data).forEach(function (k) { A._swr[k] = o.data[k]; });
    } catch (e) { /* 読めなければ、何も覚えていないものとして進める */ }
  })();
  let persistTimer = null;
  function persistSoon() {
    if (!A.ver) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      try {
        const data = {};
        Object.keys(A._swr).forEach(function (k) { if (PERSIST_ACTIONS[k.split('|')[0]]) data[k] = A._swr[k]; });
        localStorage.setItem(STORE_KEY, JSON.stringify({ ver: A.ver, data: data }));
      } catch (e) { /* 保存できなくても、画面は動く */ }
    }, 1500);
  }
  A.swrKey = function (action, payload) { return action + '|' + JSON.stringify(payload || {}); };
  A.apiSwr = function (action, payload, onFresh) {
    const key = A.swrKey(action, payload);
    const hit = A._swr[key];
    const fresh = A.api(action, payload).then(function (r) { if (r && r.ok) { A._swr[key] = r; persistSoon(); } return r; });
    if (hit) {
      fresh.then(function (r) { if (r && r.ok && onFresh) onFresh(r); }).catch(function () { /* 最新が取れなくても、前回の結果のまま */ });
      return Promise.resolve(hit);
    }
    return fresh;
  };
  // 保存したとき、覚えている一覧を、保存した内容に合わせて、先に直しておく（一覧に戻ったとき、古い内容が一瞬出ないように）
  A.swrUpdate = function (action, payload, fn) { const r = A._swr[A.swrKey(action, payload)]; if (r) { fn(r); persistSoon(); } };

  // 先読み: 管理画面を開いた直後と、保存などの書き込みのあとに、よく開く一覧を、裏で先に読んでおく（次に開いたとき、待たずに済む）。
  // 何も表示せず、読み込みが失敗しても、何も起きない。
  const PREFETCH = ['adminListArchive', 'adminListMembers', 'adminListConsults', 'adminListThreads', 'adminListPendingProfiles'];
  let prefetchTimer = null;
  A.prefetch = function () {
    PREFETCH.forEach(function (a) { A.apiSwr(a, {}).catch(function () { /* 先読みの失敗は、無視する */ }); });
  };
  A.prefetchSoon = function (ms) {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(function () { if (document.visibilityState === 'visible') A.prefetch(); }, ms || 3000);
  };

  // 画面の下に、読み込みの内訳を小さく表示する（記憶から速く返ったか、GASから読んだか。動作の確認用）
  A.cacheStat = { hit: 0, miss: 0, other: 0 };
  A.noteCache = function (v) {
    if (v === 'HIT') A.cacheStat.hit++; else if (v === 'MISS') A.cacheStat.miss++; else A.cacheStat.other++;
    let el = document.getElementById('cachestat');
    if (!el) { el = document.createElement('p'); el.id = 'cachestat'; el.className = 'muted'; el.style.cssText = 'text-align:center;font-size:.7em;margin:24px 0 8px'; document.body.appendChild(el); }
    el.textContent = '読み込み：記憶から ' + A.cacheStat.hit + '回 ／ GASから ' + A.cacheStat.miss + '回 ／ そのまま中継 ' + A.cacheStat.other + '回';
  };

  // GASは、混み合ったときなどに、次のような「失敗」を返すことがある。
  //  ① 処理されずに、動作確認用の返事 {ok:true, service:...} だけが返る（依頼が届かなかったので、書き込みも含めて、安全にやり直せる）
  //  ② JSONでなくエラーページ（HTML）が返る（処理されたかどうか不明なので、読むだけの操作だけ、やり直す）
  A.api = async function (action, payload) {
    const body = JSON.stringify({ action: action, payload: Object.assign({ idToken: A.idToken }, payload) });
    const post = async function (url) {
      // 返事が来ないとき、いつまでも「読み込み中」にならないよう、45秒で切り上げる（読むだけの操作は、自動でやり直す）
      const ctl = new AbortController(); const tm = setTimeout(function () { ctl.abort(); }, 45000);
      let r;
      try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, signal: ctl.signal }); } finally { clearTimeout(tm); }
      A.noteCache(r.headers.get('x-cache'));
      return r.json();
    };
    // 読み込み高速化API（Worker）経由で呼ぶ。Workerが使えないとき（通信の失敗など）は、読むだけの操作に限り、GASに直接つなぎ直す
    const once = async function () {
      if (!A.CFG.API_URL) return post(A.CFG.GAS_URL);
      try { return await post(A.CFG.API_URL); }
      catch (e) { if (!readOnly) throw e; return post(A.CFG.GAS_URL); }
    };
    const isHealth = function (r) { return !!(r && r.service && r.error === undefined && Object.keys(r).length <= 2); };
    // 読むだけの操作と、同じ内容で何度実行しても結果が変わらない保存（ID指定の上書き・状態の設定）は、失敗したとき、やり直してよい
    const readOnly = /^(adminList|adminGet|adminEditorInit|adminCheck|profileGet|adminSaveSeminar|adminSaveRoster|adminSetThreadStatus|adminSetConsultState)/.test(action);
    if (A.ensureFreshToken(120000)) return A.reloginWait(); // 期限切れ: ログインし直して、画面が読み込み直される
    let lastErr = null;
    for (let i = 0; i < 3; i++) {
      if (i) await new Promise(function (resolve) { setTimeout(resolve, 1200); });
      try {
        const r = await once();
        if (isHealth(r)) { lastErr = new Error('gas_empty_response'); continue; }
        if (r && r.error === 'invalid_token' && A.relogin()) return A.reloginWait(); // トークン切れ: ログインし直して、画面が読み込み直される
        if (r && r.ok && !/^(adminList|adminGet|adminEditorInit|adminCheck|profileGet)/.test(action)) A.prefetchSoon(3000); // 書き込みのあとは、一覧を先に読み直しておく
        return r;
      } catch (e) {
        lastErr = e;
        if (!readOnly) throw e;
      }
    }
    throw lastErr;
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
  // 失敗（通信エラー・時間切れ）はキャッシュに残さない。もう一度開いたときに読み直せるようにするため
  A.cardCache = {};
  A.cardData = function (memberId, idx, action) {
    const k = (action || 'adminGetCard') + ':' + memberId + ':' + idx;
    if (!A.cardCache[k]) {
      const req = A.api(action || 'adminGetCard', { memberId: memberId, index: idx });
      const timeout = new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 30000); });
      A.cardCache[k] = Promise.race([req, timeout]).catch(function (e) { delete A.cardCache[k]; throw e; });
    }
    return A.cardCache[k];
  };
  A.cardElement = async function (memberId, idx, size, action) {
    let r;
    try { r = await A.cardData(memberId, idx, action); }
    catch (e) { return A.h('p', { class: 'err' }, '名刺を読み込めませんでした（通信状況をご確認のうえ、もう一度お試しください）。'); }
    if (!r.ok) return A.h('p', { class: 'err' }, '名刺を読み込めませんでした。');
    if (r.mime === 'application/pdf') {
      const bytes = atob(r.base64), arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return A.h('a', { href: URL.createObjectURL(new Blob([arr], { type: 'application/pdf' })), target: '_blank', class: 'btn', style: 'display:inline-block;width:auto;padding:10px 16px' }, '名刺のPDFを開く');
    }
    return A.h('img', { class: 'cardimg ' + (size || ''), src: 'data:' + r.mime + ';base64,' + r.base64, alt: '名刺' });
  };
  // 名刺の拡大表示（画面の上に重ねて出す。表・裏は縦に並べる）
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
