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
  async function api(action, payload) {
    const r = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: Object.assign({ idToken: idToken }, payload) }) });
    return r.json();
  }
  function label(s) { return (s.date ? s.date.replace(/-/g, '/') + '　' : '') + s.name; }

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

  async function main() {
    const listRes = await api('archiveList', {});
    if (!listRes.ok) return show(h('p', { class: 'err' }, 'ログインを確認できませんでした。もう一度お試しください。'));
    if (!listRes.seminars.length) return show(h('p', {}, 'まだ見返せるセミナーがありません。'));

    const sel = h('select', { id: 'sem', 'aria-label': 'セミナーを選ぶ' }, [h('option', { value: '' }, 'セミナーを選んでください')].concat(
      listRes.seminars.map(function (s) { return h('option', { value: s.id }, label(s)); })));
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
    show([
      h('h1', {}, '解答・解説を見返す'),
      h('div', { class: 'card' }, [h('label', { class: 'f', for: 'sem' }, 'セミナー'), sel]),
      out,
    ]);
  }

  (async function init() {
    if (!CFG.GAS_URL || !CFG.LIFF_ID) return show(h('p', { class: 'err' }, 'GAS_URL / LIFF_ID が設定されていません（config.js）。'));
    try {
      await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js');
      await liff.init({ liffId: CFG.LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      idToken = liff.getIDToken();
      await main();
    } catch (e) {
      show(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
    }
  })();
})();
