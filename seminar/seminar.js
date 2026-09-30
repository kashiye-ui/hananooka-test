(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const app = document.getElementById('app');
  let idToken = null;

  // ---- DOM ヘルパー ----
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function show(nodes) { app.replaceChildren.apply(app, [].concat(nodes).filter(Boolean)); window.scrollTo(0, 0); }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = reject;
      document.head.appendChild(el);
    });
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
  async function api(action, payload) {
    if (ensureFresh(120000)) return new Promise(function () {}); // 期限切れ: ログインし直して、画面が読み込み直される
    const r = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: Object.assign({ idToken: idToken }, payload) }) });
    const j = await r.json();
    if (j && j.error === 'invalid_token' && relogin()) return new Promise(function () {}); // トークン切れ: ログインし直す
    return j;
  }
  function ymd(s) { return s ? s.replace(/-/g, '/') : ''; }
  function label(s) { return (s.date ? ymd(s.date) + '　' : '') + s.name; }

  // ---- 開催予定・相談会 ----
  const APPLY_ERRORS = {
    consent_required: '内容への同意にチェックをお願いします。',
    invalid: 'お名前と連絡先をご入力ください。',
    invalid_contact: '連絡先は、電話番号かメールアドレスでご入力ください。',
    full: '申し訳ありません。定員に達したため、受付を終了しました。',
    not_open: 'こちらは、受付を終了しました。',
    closed: 'こちらは、受付を終了しました。',
  };

  function applyForm(ev, card) {
    const nameIn = h('input', { type: 'text', id: 'ap-name', maxlength: '50', autocomplete: 'name' });
    const contactIn = h('input', { type: 'text', id: 'ap-contact', maxlength: '100', placeholder: '電話番号 または メールアドレス', autocomplete: 'off' });
    const countSel = h('select', { id: 'ap-count' }, [1, 2, 3, 4, 5].map(function (n) { return h('option', { value: String(n) }, n + '名'); }));
    const noteIn = h('textarea', { id: 'ap-note', rows: '3', maxlength: '300', placeholder: '（任意）ご質問やご要望があればお書きください' });
    const hp = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    const consent = h('input', { type: 'checkbox', id: 'ap-consent' });
    const err = h('p', { class: 'err' });
    const btn = h('button', { type: 'button', class: 'btn', onclick: async function () {
      err.textContent = '';
      if (!nameIn.value.trim() || !contactIn.value.trim()) { err.textContent = APPLY_ERRORS.invalid; return; }
      if (!consent.checked) { err.textContent = APPLY_ERRORS.consent_required; return; }
      btn.disabled = true; btn.textContent = '送信中…';
      try {
        const res = await api('apply', { seminarId: ev.id, name: nameIn.value, contact: contactIn.value, count: countSel.value, note: noteIn.value, consent: true, website: hp.value });
        if (!res.ok) {
          err.textContent = APPLY_ERRORS[res.error] || '送信できませんでした。少し時間をおいて、もう一度お試しください。';
          btn.disabled = false; btn.textContent = 'この内容で申し込む';
          return;
        }
        card.replaceChildren(
          h('h2', {}, 'お申込みを受け付けました'),
          h('p', {}, ev.name),
          h('p', {}, '担当者から、ご入力の連絡先へあらためてご連絡いたします。'),
          res.notified ? h('p', { class: 'muted' }, '公式LINEのトークにも、確認をお送りしました。') : null
        );
      } catch (e) {
        err.textContent = '通信エラーです。もう一度お試しください。';
        btn.disabled = false; btn.textContent = 'この内容で申し込む';
      }
    } }, 'この内容で申し込む');
    return h('div', { class: 'apply' }, [
      h('label', { class: 'f', for: 'ap-name' }, 'お名前'), nameIn,
      h('label', { class: 'f', for: 'ap-contact' }, 'ご連絡先'), contactIn,
      h('label', { class: 'f', for: 'ap-count' }, 'ご参加人数'), countSel,
      h('label', { class: 'f', for: 'ap-note' }, 'ご質問など'), noteIn,
      h('div', { class: 'hp' }, hp),
      h('label', { class: 'check' }, [consent, h('span', {}, 'お預かりした情報は、お申込みの確認とご連絡のためだけに使います。')]),
      err, btn,
    ]);
  }

  function eventCard(ev) {
    const card = h('div', { class: 'card ev' });
    const when = [ymd(ev.date), ev.time].filter(String).join('　');
    const where = ev.venue && ev.address ? ev.venue + '（' + ev.address + '）' : (ev.venue || ev.address);
    const formBox = h('div', {});
    const openBtn = ev.full
      ? h('p', { class: 'err' }, '定員に達したため、受付を終了しました。')
      : h('button', { type: 'button', class: 'btn', onclick: function () {
        formBox.replaceChildren(applyForm(ev, card));
        openBtn.hidden = true;
      } }, 'お申込みはこちら');
    card.append.apply(card, [
      h('span', { class: 'badge' + (ev.type === '相談会' ? ' consult' : '') }, ev.type),
      ev.course && ev.course !== ev.name ? h('p', { class: 'ev-meta muted' }, ev.course) : null,
      h('p', { class: 'ev-title' }, ev.name),
      h('p', { class: 'ev-meta' }, '日時：' + (when || '決まり次第お知らせします')),
      where ? h('p', { class: 'ev-meta' }, '会場：' + where) : null,
      ev.capacity ? h('p', { class: 'ev-meta' }, '定員：' + ev.capacity + '名') : null,
      ev.description ? h('p', { class: 'ev-desc' }, ev.description) : null,
      openBtn, formBox,
    ].filter(Boolean));
    return card;
  }

  function upcomingView(events) {
    if (!events.length) return [h('div', { class: 'card' }, [h('p', {}, '現在、お知らせできる開催予定はありません。決まりしだい、こちらに掲載します。')])];
    return events.map(eventCard);
  }

  // ---- 過去の解答・解説 ----
  function questionsView(res) {
    return res.questions.map(function (q) {
      return h('div', { class: 'card qa' }, [
        h('p', { class: 'q-text' }, '問' + q.no + '．' + q.text),
        h('div', {}, q.choices.map(function (c) {
          return h('div', { class: 'opt' + (q.correct.indexOf(c) >= 0 ? ' correct' : '') }, c);
        })),
        q.explanation ? h('p', { class: 'exp' }, q.explanation) : null,
      ]);
    });
  }

  function archiveView(seminars) {
    if (!seminars.length) return [h('div', { class: 'card' }, [h('p', {}, 'まだ見返せるセミナーがありません。')])];
    const sel = h('select', { id: 'sem', 'aria-label': 'セミナーを選ぶ' }, [h('option', { value: '' }, 'セミナーを選んでください')].concat(
      seminars.map(function (s) { return h('option', { value: s.id }, label(s)); })));
    const out = h('div', {});
    sel.addEventListener('change', async function () {
      if (!sel.value) return out.replaceChildren();
      out.replaceChildren(h('p', { class: 'muted' }, '読み込み中…'));
      try {
        const res = await api('archiveGet', { seminarId: sel.value });
        if (!res.ok) return out.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
        out.replaceChildren.apply(out, [h('h2', {}, label(res.seminar))].concat(questionsView(res)));
      } catch (e) {
        out.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
      }
    });
    return [
      h('div', { class: 'card' }, [
        h('p', {}, 'セミナーに参加された方は、いつでも解答・解説を見返せます。'),
        h('label', { class: 'f', for: 'sem' }, 'セミナー'), sel,
      ]),
      out,
    ];
  }

  async function main() {
    const results = await Promise.all([api('upcomingList', {}), api('archiveList', {})]);
    const up = results[0], ar = results[1];
    if (!up.ok || !ar.ok) return show(h('p', { class: 'err' }, 'ログインを確認できませんでした。もう一度お試しください。'));

    // 開催予定があれば「開催予定・相談会」から。旧アーカイブのURL（?tab=archive）や、予定が無いときは「過去の解答・解説」から
    let current = new URLSearchParams(location.search).get('tab') === 'archive' || (!up.events.length && ar.seminars.length) ? 'archive' : 'upcoming';
    const body = h('div', {});
    const tabUp = h('button', { type: 'button', class: 'tab', role: 'tab', onclick: function () { select('upcoming'); } }, '開催予定・相談会');
    const tabAr = h('button', { type: 'button', class: 'tab', role: 'tab', onclick: function () { select('archive'); } }, '過去の解答・解説');
    function select(which) {
      current = which;
      tabUp.setAttribute('aria-selected', String(which === 'upcoming'));
      tabAr.setAttribute('aria-selected', String(which === 'archive'));
      body.replaceChildren.apply(body, which === 'upcoming' ? upcomingView(up.events) : archiveView(ar.seminars));
    }
    show([h('h1', {}, 'セミナー・相談会'), h('div', { class: 'tabs', role: 'tablist' }, [tabUp, tabAr]), body]);
    select(current);
  }

  (async function init() {
    if (!CFG.GAS_URL || !CFG.LIFF_ID) return show(h('p', { class: 'err' }, 'GAS_URL / LIFF_ID が設定されていません（config.js）。'));
    try {
      await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js');
      await liff.init({ liffId: CFG.LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      // パソコンのブラウザでは、期限切れ（約1時間）のIDトークンが残ることがあるため、期限が近ければログインし直す
      try {
        const exp = JSON.parse(atob(liff.getIDToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
        if (exp < Date.now() + 60000) { liff.logout(); liff.login({ redirectUri: location.href }); return; }
      } catch (e) { /* 読み取れないときは、そのまま進む */ }
      idToken = liff.getIDToken();
      await main();
    } catch (e) {
      show(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
    }
  })();
})();
