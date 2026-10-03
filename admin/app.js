// 管理画面の入口: LINEログイン → 管理者の確認 → 画面の切り替え（セミナー管理・メンバー管理）
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h;
  const app = document.getElementById('app');

  // 画面の構成。views に登録された画面だけがメニューに出る
  const NAV = [
    { label: 'セミナー管理', subs: [
      { route: 'seminar/progress', label: '開催予定のセミナー' },
      { route: 'seminar/archive', label: 'セミナー・アーカイブ' },
      { route: 'seminar/edit', label: '新規登録・編集', also: ['seminar/intake'] }, // 「資料から自動登録」は、この中の切り替えで開く
      { route: 'seminar/apps', label: '申込者', hidden: true }, // 申込者は、各セミナーのカードの中で開く（直接リンク用に、画面は残す）
    ] },
    { label: '相談', subs: [
      { route: 'consult/list', label: '相談の一覧・進行' },
    ] },
    { label: 'メッセージ', subs: [
      { route: 'messages/list', label: '受信メッセージ' },
      { route: 'messages/thread', label: '会話', hidden: true },
    ] },
    { label: 'メンバー管理', subs: [
      { route: 'members/list', label: 'メンバー一覧・編集' },
      { route: 'members/new', label: '新規登録（名刺から）' },
      { route: 'members/edit', label: '編集', hidden: true },
      { route: 'members/roster', label: '公開する名簿の並び順' },
      { route: 'members/preview', label: 'お客様の見え方（専門家名簿）' },
      { route: 'members/cardsheet', label: '名刺シート印刷' },
      { route: 'members/pending', label: '先生からの申請' },
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
    const active = groups.filter(function (g) { return g.subs.some(function (s) { return s.route === cur.route || (s.also || []).indexOf(cur.route) >= 0; }); })[0] || groups[0];

    const shown = function (g) { return g.subs.filter(function (s) { return !s.hidden; }); };
    const badgeCounts = { 'セミナー管理': A.needProgress, '相談': A.needConsult, 'メンバー管理': A.needProfile };
    const primary = h('div', { class: 'nav1', role: 'tablist' }, groups.map(function (g) {
      const n = badgeCounts[g.label];
      const badge = n ? h('span', { class: 'navbadge' }, String(n)) : null;
      return h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(g === active), onclick: function () { A.go(shown(g)[0].route); } }, [g.label, badge]);
    }));
    const subBadges = { 'seminar/progress': A.needProgress, 'consult/list': A.needConsult, 'members/pending': A.needProfile };
    const secondary = h('div', { class: 'nav2' }, shown(active).map(function (s) {
      const n = subBadges[s.route];
      return h('button', { type: 'button', class: 'subtab', 'aria-selected': String(s.route === cur.route || (s.also || []).indexOf(cur.route) >= 0), onclick: function () { A.go(s.route); } }, [s.label, n ? h('span', { class: 'navbadge' }, String(n)) : null]);
    }));
    // 件数のバッジを、画面を描き直さずに更新する（相談を対応済みにしたときなど）
    A.setBadges = function () {
      const setOn = function (el, n) {
        if (!el) return;
        const cur = el.querySelector('.navbadge');
        if (!n) { if (cur) cur.remove(); return; }
        if (cur) cur.textContent = String(n); else el.appendChild(h('span', { class: 'navbadge' }, String(n)));
      };
      [].forEach.call(primary.children, function (b, i) { setOn(b, badgeCounts[groups[i].label] === undefined ? 0 : { 'セミナー管理': A.needProgress, '相談': A.needConsult, 'メンバー管理': A.needProfile }[groups[i].label]); });
      [].forEach.call(secondary.children, function (b, i) { setOn(b, subBadges[shown(active)[i].route] === undefined ? 0 : { 'seminar/progress': A.needProgress, 'consult/list': A.needConsult, 'members/pending': A.needProfile }[shown(active)[i].route]); });
    };
    const box = h('div', { class: 'view' }, [h('p', { class: 'muted' }, '読み込み中…')]);
    show([primary, secondary, box]);

    const view = A.views[cur.route] || A.views[shown(active)[0].route];
    Promise.resolve(view(box, cur.params)).catch(function (e) {
      box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'), h('p', { class: 'muted' }, '（詳細：' + String((e && e.message) || e).slice(0, 120) + '）'));
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

  // カテゴリー名を新しい名前に更新する（旧名が残っているときだけ。何度行っても、結果は同じ）。
  // 更新ボタンを押し忘れて、名前が変わらないままにならないよう、管理画面を開いたとき、自動で、1回だけ行う。更新できたら、この端末では、もう確認しない
  function migrateCategoriesOnce() {
    let done = false;
    try { done = localStorage.getItem('kl_cat_migrated_v1') === '1'; } catch (e) { /* 読めなければ、確認する */ }
    if (done) return;
    const mark = function () { try { localStorage.setItem('kl_cat_migrated_v1', '1'); } catch (e) { /* 保存できなくてもよい */ } };
    // 結果のお知らせ（成功は緑・失敗は赤。画面の上に、しばらく出す）
    const notify = function (text, isErr) {
      const note = h('div', { class: 'card', style: isErr ? 'border:2px solid #c0392b;background:#fdecea' : 'border:2px solid #5bb36b;background:#e6f4e8' }, text);
      app.insertBefore(note, app.firstChild);
      setTimeout(function () { note.remove(); }, isErr ? 60000 : 12000);
    };
    A.api('adminMigrateCategories', { dryRun: true }).then(function (pre) {
      if (!pre || !pre.ok) { notify('カテゴリー名の更新を確認できませんでした（' + ((pre && (pre.detail || pre.error)) || '応答なし') + '）。', true); return; }
      if (!pre.staff && !pre.consults && !pre.tagsChanged) { mark(); return; }
      return A.api('adminMigrateCategories', {}).then(function (r) {
        if (!r || !r.ok) { notify('カテゴリー名を更新できませんでした（' + ((r && (r.detail || r.error)) || '応答なし') + '）。この内容を、開発者に伝えてください。', true); return; }
        mark();
        A._swr = {}; try { localStorage.removeItem('kl_swr_v1'); } catch (e) { /* 消せなくてもよい */ }
        if (!blocked) render(); // 画面を、新しい名前で読み直す（そのあと、お知らせを出す）
        notify('カテゴリーの名前を、新しい名前に更新しました（先生の対応・得意分野、相談の記録、カテゴリーの一覧）。', false);
      });
    }).catch(function () { /* 失敗したら、次に開いたとき、もう一度試す */ });
  }

  let blocked = false; // 管理者でなかったときなど、画面の切り替えを止める
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
      // 管理者の確認（adminCheck）と、最初の画面の読み込みを、同時に始める（順番に待つと、そのぶん遅くなるため）。
      // 画面の各データは、サーバー側でも管理者かどうかを確認している。管理者でなかったときは、確認後に「権限がありません」の画面に差し替える
      const checking = A.api('adminCheck', {});
      // タブの切り替えは、管理者の確認を待たずに、すぐ使えるようにする（確認が遅くても、画面が固まらないように）
      window.addEventListener('hashchange', function () { if (!blocked) render(); });
      render();
      const res = await checking;
      if (!res.ok) { blocked = true; return show(h('p', { class: 'err' }, 'ログインを確認できませんでした。もう一度お試しください。')); }
      if (!res.isAdmin) { blocked = true; return forbiddenView(res.userId); }
      A.adminName = res.name;
      A.needConsult = res.needConsult || 0;
      A.needProfile = res.needProfile || 0;
      A.needProgress = res.needProgress || 0;
      if (A.setBadges) A.setBadges();
      A.prefetchSoon(800); // よく開く一覧を、裏で先に読んでおく
      migrateCategoriesOnce();
    } catch (e) {
      show(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
    }
  })();
})();
