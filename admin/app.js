// 管理画面の入口: LINEログイン → 管理者の確認 → 画面の切り替え（セミナー管理・メンバー管理）
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h;
  const app = document.getElementById('app');

  // 画面の構成。views に登録された画面だけがメニューに出る
  const NAV = [
    { label: 'セミナー管理', subs: [
      { route: 'seminar/archive', label: 'セミナー一覧・アーカイブ' },
      { route: 'seminar/edit', label: '新規登録・編集' },
      { route: 'seminar/intake', label: '資料から自動登録' },
      { route: 'seminar/apps', label: '申込者' },
    ] },
    { label: 'メンバー管理', subs: [
      { route: 'members/list', label: 'メンバー一覧・編集' },
      { route: 'members/new', label: '新規登録（名刺から）' },
      { route: 'members/edit', label: '編集', hidden: true },
    ] },
  ];
  const DEFAULT_ROUTE = 'seminar/archive';

  function show(nodes) { app.replaceChildren.apply(app, [].concat(nodes).filter(Boolean)); window.scrollTo(0, 0); }

  function parseHash() {
    const raw = location.hash.replace(/^#/, '');
    const qi = raw.indexOf('?');
    const route = (qi < 0 ? raw : raw.slice(0, qi)) || DEFAULT_ROUTE;
    const params = {};
    if (qi >= 0) raw.slice(qi + 1).split('&').forEach(function (kv) {
      const p = kv.split('=');
      if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return { route: route, params: params };
  }

  function render() {
    const cur = parseHash();
    const groups = NAV.map(function (g) {
      return { label: g.label, subs: g.subs.filter(function (s) { return A.views[s.route]; }) };
    }).filter(function (g) { return g.subs.length; });
    const active = groups.filter(function (g) { return g.subs.some(function (s) { return s.route === cur.route; }); })[0] || groups[0];

    const shown = function (g) { return g.subs.filter(function (s) { return !s.hidden; }); };
    const primary = h('div', { class: 'nav1', role: 'tablist' }, groups.map(function (g) {
      return h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(g === active), onclick: function () { A.go(shown(g)[0].route); } }, g.label);
    }));
    const secondary = h('div', { class: 'nav2' }, shown(active).map(function (s) {
      return h('button', { type: 'button', class: 'subtab', 'aria-selected': String(s.route === cur.route), onclick: function () { A.go(s.route); } }, s.label);
    }));
    const box = h('div', { class: 'view' }, [h('p', { class: 'muted' }, '読み込み中…')]);
    show([primary, secondary, box]);

    const view = A.views[cur.route] || A.views[shown(active)[0].route];
    Promise.resolve(view(box, cur.params)).catch(function () {
      box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
    });
  }

  function forbiddenView(userId) {
    show(h('div', { class: 'card' }, [
      h('h2', {}, '権限がありません'),
      h('p', {}, 'このLINEアカウントは、管理者として登録されていません。'),
      h('p', {}, '柏原さんに、次のIDを「担当者」シートに追加してもらい、「管理者」列に○を付けてもらってください。'),
      h('p', { class: 'muted' }, 'あなたのLINEユーザーID：'),
      h('p', { style: 'font-family:monospace;word-break:break-all;background:#f6f1ea;padding:8px;border-radius:8px;' }, userId),
    ]));
  }

  (async function init() {
    const CFG = A.CFG;
    if (!CFG.GAS_URL || !CFG.LIFF_ID) return show(h('p', { class: 'err' }, 'GAS_URL / LIFF_ID が設定されていません（config.js）。'));
    try {
      await A.loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js');
      await liff.init({ liffId: CFG.LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      // パソコンのブラウザでは、期限切れ（約1時間）のIDトークンが残ることがあるため、期限が近ければログインし直す
      try {
        const exp = JSON.parse(atob(liff.getIDToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
        if (exp < Date.now() + 60000) { liff.logout(); liff.login({ redirectUri: location.href }); return; }
      } catch (e) { /* 読み取れないときは、そのまま進む */ }
      A.idToken = liff.getIDToken();
      const res = await A.api('adminCheck', {});
      if (!res.ok) return show(h('p', { class: 'err' }, 'ログインを確認できませんでした。もう一度お試しください。'));
      if (!res.isAdmin) return forbiddenView(res.userId);
      A.adminName = res.name;
      window.addEventListener('hashchange', render);
      render();
    } catch (e) {
      show(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
    }
  })();
})();
