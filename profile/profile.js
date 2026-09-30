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
  // IDトークン（約1時間で期限切れ）の対策: 切れる前・切れたときに、自動でログインし直す（手で入り直さなくてよい）
  function relogin() {
    try {
      const last = Number(sessionStorage.getItem('kl_relogin') || 0);
      if (Date.now() - last < 30000) return false;
      sessionStorage.setItem('kl_relogin', String(Date.now()));
    } catch (e) { /* そのまま続ける */ }
    try {
      if (typeof liff.isInClient === 'function' && liff.isInClient()) { location.reload(); return true; }
      liff.logout(); liff.login({ redirectUri: location.href }); return true;
    } catch (e) { return false; }
  }
  function tokenExpMs() {
    try { return JSON.parse(atob(liff.getIDToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch (e) { return 0; }
  }
  function ensureFresh(marginMs) {
    if (typeof liff === 'undefined' || !idToken) return false;
    const exp = tokenExpMs();
    return !!(exp && exp < Date.now() + marginMs && relogin());
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    const el = document.activeElement;
    if (!(el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text' && el.value)))) ensureFresh(600000);
  });
  function loadScript(src) {
    return new Promise(function (resolve, reject) { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
  }
  async function api(action, payload) {
    if (ensureFresh(120000)) return new Promise(function () {}); // 期限切れ: ログインし直して、画面が読み込み直される
    // GASが依頼を処理せず、動作確認用の返事だけを返すことがある。その場合は、安全にやり直す
    for (let i = 0; i < 3; i++) {
      if (i) await new Promise(function (resolve) { setTimeout(resolve, 1200); });
      const r = await (await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: Object.assign({ idToken: idToken }, payload) }) })).json();
      if (r && r.error === 'invalid_token' && relogin()) return new Promise(function () {}); // トークン切れ: ログインし直す
      if (!(r && r.service && r.error === undefined && Object.keys(r).length <= 2)) return r;
    }
    throw new Error('gas_empty_response');
  }

  // 画像を、長辺 maxDim 以下のJPEG（base64）にする
  function resizeImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        const k = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ base64: c.toDataURL('image/jpeg', quality).split(',')[1], mime: 'image/jpeg' });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image_load_failed')); };
      img.src = url;
    });
  }

  const ERR_TEXT = { empty: '入力してください。', too_long: '文字数が多すぎます。', too_large: '画像が大きすぎます。別の写真でお試しください。', invalid_image: '画像を読み込めませんでした。写真（JPEG・PNG）を選んでください。', save_failed: '保存できませんでした。もう一度お試しください。' };

  // 「変更する」ボタンで開く修正フォーム。build(box) が { collect } を返す。送信は send(payload) → API結果
  function editor(title, build, field) {
    const wrap = h('div', { class: 'edit' });
    const msg = h('p', { class: 'err' });
    const open = h('button', { type: 'button', class: 'btn', style: 'width:auto;padding:8px 18px;font-size:.9em' }, title);
    const form = h('div', { hidden: '' });
    const built = build(form);
    const send = h('button', { type: 'button', class: 'btn', style: 'margin-top:10px' }, '送信する（管理者が確認します）');
    send.addEventListener('click', async function () {
      msg.textContent = ''; msg.className = 'err';
      send.disabled = true; send.textContent = '送信中…';
      try {
        const payload = await built.collect();
        if (!payload) { send.disabled = false; send.textContent = '送信する（管理者が確認します）'; return; }
        const r = await api('profileSaveMine', Object.assign({ field: field }, payload));
        if (r.ok) { msg.className = 'ok'; msg.textContent = '送りました。管理者が確認して、反映します。'; setTimeout(load, 1200); return; }
        msg.textContent = (ERR_TEXT[r.error] || '送れませんでした。もう一度お試しください。') + (r.max ? '（' + r.max + '字まで）' : '');
      } catch (e) { msg.textContent = '通信エラーです。もう一度お試しください。'; }
      send.disabled = false; send.textContent = '送信する（管理者が確認します）';
    });
    form.appendChild(send);
    open.addEventListener('click', function () { form.hidden = !form.hidden; });
    wrap.appendChild(open); wrap.appendChild(form); wrap.appendChild(msg);
    return wrap;
  }
  // 入力のない項目に、「空欄でよい」のチェックボックスを出す。チェックすると、その項目は「空欄でよい」と記録され、あらためてお願いされなくなる
  // （チェックを外せば、元に戻る。すでに入力のある項目には出さない）
  function blankButton(filled, okKeys, key, field) {
    if (filled) return null;
    const box = h('input', { type: 'checkbox' });
    box.checked = okKeys.indexOf(key) >= 0;
    box.addEventListener('change', async function () {
      const on = box.checked;
      box.disabled = true;
      try { const r = await api('profileSaveMine', { field: field, blankOk: on }); if (r.ok) { load(); return; } } catch (e) { /* 下で戻す */ }
      box.checked = !on; box.disabled = false;
      alert('送れませんでした。もう一度お試しください。');
    });
    return h('label', { class: 'arow-top', style: 'margin:4px 0;font-size:.9em' }, [box, h('span', {}, ' 空欄でよい（入力しない）')]);
  }

  function textEditor(title, field, current, max) {
    return editor(title, function (form) {
      const input = h('input', { type: 'text', maxlength: String(max), value: current || '', placeholder: max + '字まで' });
      form.appendChild(input);
      return { collect: async function () { return { value: input.value }; } };
    }, field);
  }
  function fileInput(label) {
    const input = h('input', { type: 'file', accept: 'image/*' });
    return { input: input, box: h('label', { class: 'f' }, [label, input]) };
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
    parts.push(h('p', { class: 'muted' }, 'いま登録されている内容と、管理者の確認を待っている内容です。下のボタンから、その場で修正できます。修正した内容は、管理者が確認してから反映します（送ると、管理者に通知が届きます）。'));

    const okKeys = d.blankOk || [];
    const txt = function (label, cur, pending, key) {
      const isOk = !cur && key && okKeys.indexOf(key) >= 0;
      return h('div', { class: 'row' }, [
        h('div', { class: 'lab' }, label),
        h('div', { class: cur || isOk ? '' : 'none' }, cur || (isOk ? '－（空欄でよい）' : '未入力')),
        pending ? h('div', { class: 'wait' }, '確認待ち：' + pending) : null,
      ]);
    };
    parts.push(h('div', { class: 'card' }, [
      txt('事務所名・肩書', d.org, d.pendingOrg, 'org'),
      blankButton(d.org || d.pendingOrg, okKeys, 'org', 'org'),
      textEditor(d.org ? '事務所名・肩書を変更する' : '事務所名・肩書を入力する', 'org', d.pendingOrg || d.org, 60),
      h('div', { style: 'height:14px' }),
      txt('事務所の場所（市区町村）', d.area, d.pendingArea, 'area'),
      blankButton(d.area || d.pendingArea, okKeys, 'area', 'area'),
      textEditor(d.area ? '事務所の場所を変更する' : '事務所の場所を入力する', 'area', d.pendingArea || d.area, 20),
      h('div', { style: 'height:14px' }),
      txt('ひとこと', d.comment, d.pendingComment, 'comment'),
      blankButton(d.comment || d.pendingComment, okKeys, 'comment', 'comment'),
      textEditor(d.comment ? 'ひとことを変更する' : 'ひとことを入力する', 'comment', d.pendingComment || d.comment, 60),
      h('div', { style: 'height:14px' }),
      h('div', { class: 'row' }, [h('div', { class: 'lab' }, '対応できる分野'), h('div', { class: d.avail.length ? '' : 'none' }, d.avail.length ? d.avail.join('・') : '未回答')]),
      h('div', { class: 'row' }, [h('div', { class: 'lab' }, '得意な分野'), h('div', { class: d.skill.length ? '' : 'none' }, d.skill.length ? d.skill.join('・') : '未回答')]),
    ]));

    const photoBox = [h('h2', {}, '顔写真')];
    if (!d.photo && !d.pendingPhoto && okKeys.indexOf('photo') >= 0) photoBox.push(h('p', {}, '－（空欄でよい）'));
    photoBox.push(h('div', { class: 'lab' }, '登録済み'));
    photoBox.push(d.photo ? h('img', { class: 'pimg pface', src: d.photo, alt: '登録済みの顔写真' }) : h('p', { class: 'none' }, '未登録'));
    if (d.pendingPhoto) {
      photoBox.push(h('div', { class: 'wait' }, '確認待ち（新しい写真）'));
      photoBox.push(h('img', { class: 'pimg pface', src: d.pendingPhoto, alt: '確認待ちの顔写真' }));
    }
    photoBox.push(editor(d.photo ? '顔写真を変更する' : '顔写真を登録する', function (form) {
      const f = fileInput('新しい顔写真（正面を向いた、はっきり写った写真）');
      form.appendChild(f.box);
      return { collect: async function () {
        if (!f.input.files[0]) { alert('写真を選んでください。'); return null; }
        return { image: await resizeImage(f.input.files[0], 800, 0.85) };
      } };
    }, 'photo'));
    if (!d.photo && !d.pendingPhoto) photoBox.push(blankButton(false, okKeys, 'photo', 'photo'));
    parts.push(h('div', { class: 'card' }, photoBox));

    const cardBox = [h('h2', {}, '名刺')];
    if (!d.cards && !d.pendingCards && okKeys.indexOf('cards') >= 0) cardBox.push(h('p', {}, '－（空欄でよい）'));
    cardBox.push(h('div', { class: 'lab' }, '登録済み（' + d.cards + '枚）'));
    if (d.cards) for (let i = 0; i < d.cards; i++) cardBox.push(cardImg('current', i)); else cardBox.push(h('p', { class: 'none' }, '未登録'));
    if (d.pendingCards) {
      cardBox.push(h('div', { class: 'wait' }, '確認待ち（新しい名刺 ' + d.pendingCards + '枚）'));
      for (let i = 0; i < d.pendingCards; i++) cardBox.push(cardImg('pending', i));
    }
    cardBox.push(editor(d.cards ? '名刺を変更する（表・裏）' : '名刺を登録する（表・裏）', function (form) {
      form.appendChild(h('p', { class: 'muted' }, '名刺は、表・裏をまとめて差し替えになります。裏面がないときは、表面だけ選んでください。'));
      const a = fileInput('名刺の表面'), b = fileInput('名刺の裏面（なければ空のまま）');
      form.appendChild(a.box); form.appendChild(b.box);
      return { collect: async function () {
        if (!a.input.files[0]) { alert('名刺の表面の写真を選んでください。'); return null; }
        const images = [await resizeImage(a.input.files[0], 1280, 0.8)];
        if (b.input.files[0]) images.push(await resizeImage(b.input.files[0], 1280, 0.8));
        return { images: images };
      } };
    }, 'cards'));
    if (!d.cards && !d.pendingCards) cardBox.push(blankButton(false, okKeys, 'cards', 'cards'));
    parts.push(h('div', { class: 'card' }, cardBox));
    app.replaceChildren.apply(app, parts);
  }

  async function load() {
    const d = await api('profileGetMine', {});
    if (d.ok) render(d);
    else app.replaceChildren(h('p', { class: d.error === 'not_staff' ? 'muted' : 'err' }, d.error === 'not_staff'
      ? 'まだ先生として登録されていないようです。公式LINEで「#登録 合言葉 お名前」を送ってからご利用ください。'
      : '読み込めませんでした。少し待って、開き直してください。'));
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
      await load();
    } catch (e) {
      app.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
    }
  })();
})();
