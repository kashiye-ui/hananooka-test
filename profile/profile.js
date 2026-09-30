// 先生ご本人が、公式LINEに登録してある顔写真・名刺などの「いまの登録内容」を見るページ（LINEログイン必須。自分の分だけ表示）
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const app = document.getElementById('app');
  let idToken = null;

  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null && attrs[k] !== false) { if (k === 'class') el.className = attrs[k]; else el.setAttribute(k, attrs[k]); } });
    [].concat(kids == null ? [] : kids).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
  }
  async function api(action, payload) {
    const r = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: Object.assign({ idToken: idToken }, payload) }) });
    return r.json();
  }

  // 名刺は非公開の保管庫にあるので、1枚ずつ取り出して表示する（30秒で諦める）
  function cardImg(kind, i) {
    const slot = h('div', {}, [h('p', { class: 'muted' }, '名刺を読み込み中…')]);
    const timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 30000); });
    Promise.race([api('profileGetMyCard', { kind: kind, index: i }), timeout]).then(function (r) {
      if (!r.ok) throw new Error('ng');
      slot.replaceChildren(r.mime === 'application/pdf'
        ? h('p', { class: 'muted' }, '（PDFの名刺です）')
        : h('img', { class: 'pimg', src: 'data:' + r.mime + ';base64,' + r.base64, alt: '名刺' + (i + 1) + '枚目' }));
    }).catch(function () { slot.replaceChildren(h('p', { class: 'err' }, '名刺を読み込めませんでした。少し待って、開き直してください。')); });
    return slot;
  }

  function render(d) {
    const parts = [h('h1', {}, d.name + ' さんの登録内容')];
    parts.push(h('p', { class: 'muted' }, 'いま登録されている内容と、管理者の確認を待っている内容です。直したいときは、公式LINEのトークに「#プロフィール」と送ってください。'));

    const txt = function (label, cur, pending) {
      return h('div', { class: 'row' }, [
        h('div', { class: 'lab' }, label),
        h('div', { class: cur ? '' : 'none' }, cur || '未入力'),
        pending ? h('div', { class: 'wait' }, '確認待ち：' + pending) : null,
      ]);
    };
    parts.push(h('div', { class: 'card' }, [
      txt('事務所名・肩書', d.org, d.pendingOrg),
      txt('ひとこと', d.comment, d.pendingComment),
      h('div', { class: 'row' }, [h('div', { class: 'lab' }, '対応できる分野'), h('div', { class: d.avail.length ? '' : 'none' }, d.avail.length ? d.avail.join('・') : '未回答')]),
      h('div', { class: 'row' }, [h('div', { class: 'lab' }, '得意な分野'), h('div', { class: d.skill.length ? '' : 'none' }, d.skill.length ? d.skill.join('・') : '未回答')]),
    ]));

    const photoBox = [h('h2', {}, '顔写真')];
    photoBox.push(h('div', { class: 'lab' }, '登録済み'));
    photoBox.push(d.photo ? h('img', { class: 'pimg pface', src: d.photo, alt: '登録済みの顔写真' }) : h('p', { class: 'none' }, '未登録'));
    if (d.pendingPhoto) {
      photoBox.push(h('div', { class: 'wait' }, '確認待ち（新しい写真）'));
      photoBox.push(h('img', { class: 'pimg pface', src: d.pendingPhoto, alt: '確認待ちの顔写真' }));
    }
    parts.push(h('div', { class: 'card' }, photoBox));

    const cardBox = [h('h2', {}, '名刺')];
    cardBox.push(h('div', { class: 'lab' }, '登録済み（' + d.cards + '枚）'));
    if (d.cards) for (let i = 0; i < d.cards; i++) cardBox.push(cardImg('current', i)); else cardBox.push(h('p', { class: 'none' }, '未登録'));
    if (d.pendingCards) {
      cardBox.push(h('div', { class: 'wait' }, '確認待ち（新しい名刺 ' + d.pendingCards + '枚）'));
      for (let i = 0; i < d.pendingCards; i++) cardBox.push(cardImg('pending', i));
    }
    parts.push(h('div', { class: 'card' }, cardBox));
    app.replaceChildren.apply(app, parts);
  }

  (async function init() {
    if (!CFG.GAS_URL || !CFG.LIFF_ID) { app.replaceChildren(h('p', { class: 'err' }, '設定が読み込めません。')); return; }
    try {
      await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js');
      await liff.init({ liffId: CFG.LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      try { // 期限切れ（約1時間）のIDトークンが残っていたら、ログインし直す
        const exp = JSON.parse(atob(liff.getIDToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
        if (exp < Date.now() + 60000) { liff.logout(); liff.login({ redirectUri: location.href }); return; }
      } catch (e) { /* 読み取れないときは、そのまま進む */ }
      idToken = liff.getIDToken();
      const d = await api('profileGetMine', {});
      if (d.ok) render(d);
      else app.replaceChildren(h('p', { class: d.error === 'not_staff' ? 'muted' : 'err' }, d.error === 'not_staff'
        ? 'まだ先生として登録されていないようです。公式LINEで「#登録 合言葉 お名前」を送ってからご利用ください。'
        : '読み込めませんでした。少し待って、開き直してください。'));
    } catch (e) {
      app.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
    }
  })();
})();
