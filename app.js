(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const seminarId = params.get('seminar') || '';

  const state = { test: null, answers: {}, attr: { interest: [] }, consent: false };

  // ---- DOM ヘルパー（textContent のみ使用しXSSを避ける）----
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
  function show(nodes) {
    app.replaceChildren.apply(app, [].concat(nodes).filter(Boolean));
    window.scrollTo(0, 0);
  }

  // ---- API ----
  function mockTest() {
    return {
      ok: true,
      seminar: { id: seminarId, name: 'サンプルセミナー（画面確認用）' },
      questions: [
        { no: 1, text: '相続登記は義務化されている。', choices: ['○', '×'] },
        { no: 2, text: '遺言書の種類として正しいものはどれ？', choices: ['自筆証書遺言', '公正証書遺言', '口頭遺言'] },
        { no: 3, text: '財産の一覧を作っておくと手続きの負担が減る。', choices: ['○', '×'] },
      ],
      options: {
        age: ['〜39', '40代', '50代', '60代', '70代', '80代〜'],
        interest: ['遺言', '相続手続き', '不動産・空き家', '認知症対策・後見', '生前対策・終活', '親なきあと', 'その他'],
        situation: ['親の相続が心配', '自分の終活', 'すでに相続が発生', '情報収集'],
        consult: ['今すぐ', 'いずれ', '不要'],
        source: ['チラシ', 'LP・Web', '知人の紹介', '施設・機関からの案内', 'その他'],
      },
    };
  }
  async function api(action, payload) {
    if (!CFG.GAS_URL) { // モック（保存されない）
      return action === 'getTest' ? mockTest() : { ok: true, answerId: 'mock', score: 2, total: 3 };
    }
    if (action === 'getTest') {
      const r = await fetch(CFG.GAS_URL + '?action=getTest&seminar=' + encodeURIComponent(seminarId));
      return r.json();
    }
    const r = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: payload }) });
    return r.json();
  }

  // ---- 画面 ----
  function errorView(msg) {
    show(h('div', { class: 'card' }, [h('p', { class: 'err' }, msg)]));
  }

  function consentView() {
    const box = h('input', { type: 'checkbox', id: 'consent' });
    const btn = h('button', { class: 'btn', disabled: 'disabled', onclick: testView }, '同意して確認テストへ進む');
    box.addEventListener('change', function () { state.consent = box.checked; btn.disabled = !box.checked; });
    show([
      h('h1', {}, state.test.seminar.name + ' 確認テスト'),
      h('p', {}, '約2分のかんたんなテストです。ご回答後、点数がその場で表示されます。'),
      h('div', { class: 'card' }, [
        h('h2', {}, '個人情報の取扱いについて'),
        h('div', { class: 'consent' }, [
          h('p', {}, 'ご入力いただいた内容は、次の目的にのみ利用します。'),
          h('p', {}, '①セミナーの改善　②相続・遺言に関する情報提供　③ご希望の方への個別相談対応'),
          h('p', {}, '法令に基づく場合を除き、ご本人の同意なく第三者に提供しません。お名前・連絡方法は任意です。'),
        ]),
        h('label', { class: 'choice', for: 'consent' }, [box, '上記に同意します（必須）']),
      ]),
      btn,
    ]);
  }

  function testView() {
    const qs = state.test.questions;
    const err = h('p', { class: 'err' });
    const cards = qs.map(function (q) {
      return h('div', { class: 'q' }, [
        h('p', { class: 'q-text' }, '問' + q.no + '. ' + q.text),
      ].concat(q.choices.map(function (c) {
        const r = h('input', { type: 'radio', name: 'q' + q.no, value: c });
        if (state.answers[q.no] === c) r.checked = true;
        r.addEventListener('change', function () { state.answers[q.no] = c; });
        return h('label', { class: 'choice' }, [r, c]);
      })));
    });
    show([
      h('h1', {}, '確認テスト'),
      h('div', { class: 'card' }, cards),
      err,
      h('button', { class: 'btn', onclick: function () {
        if (qs.some(function (q) { return !state.answers[q.no]; })) { err.textContent = 'すべての問題にお答えください。'; return; }
        attrView();
      } }, '次へ'),
    ]);
  }

  function select_(id, label, opts, value, onchange) {
    const s = h('select', { id: id }, [h('option', { value: '' }, '選択してください')].concat(opts.map(function (o) {
      const op = h('option', { value: o }, o);
      if (o === value) op.selected = true;
      return op;
    })));
    s.addEventListener('change', function () { onchange(s.value); });
    return [h('label', { class: 'f', for: id }, label), s];
  }
  function radios_(name, label, opts, value, onchange) {
    return [h('label', { class: 'f' }, label)].concat(opts.map(function (o) {
      const r = h('input', { type: 'radio', name: name, value: o });
      if (o === value) r.checked = true;
      r.addEventListener('change', function () { onchange(o); });
      return h('label', { class: 'choice' }, [r, o]);
    }));
  }

  function attrView() {
    const o = state.test.options, a = state.attr;
    const muni = window.MUNICIPALITIES || {};
    const citySel = h('select', { id: 'city' });
    function fillCities() {
      citySel.replaceChildren.apply(citySel, [h('option', { value: '' }, '選択してください')].concat((muni[a.prefecture] || []).map(function (c) {
        const op = h('option', { value: c }, c);
        if (c === a.city) op.selected = true;
        return op;
      })));
    }
    citySel.addEventListener('change', function () { a.city = citySel.value; });
    fillCities();

    const interestOther = h('input', { type: 'text', maxlength: '100', placeholder: '具体的にお書きください。今後の参考にさせていただきます', value: a.interestOther || '' });
    const sourceOther = h('input', { type: 'text', maxlength: '100', placeholder: '具体的にお書きください。今後の参考にさせていただきます', value: a.sourceOther || '' });
    const interestBox = h('div', {}, [interestOther]);
    const sourceBox = h('div', {}, [sourceOther]);
    function refreshOther() {
      interestBox.hidden = a.interest.indexOf('その他') < 0;
      sourceBox.hidden = a.source !== 'その他';
    }
    const interest = [h('label', { class: 'f' }, '今気になっていること（複数選べます）')].concat(o.interest.map(function (v) {
      const c = h('input', { type: 'checkbox', value: v });
      if (a.interest.indexOf(v) >= 0) c.checked = true;
      c.addEventListener('change', function () {
        a.interest = c.checked ? a.interest.concat(v) : a.interest.filter(function (x) { return x !== v; });
        refreshOther();
      });
      return h('label', { class: 'choice' }, [c, v]);
    }));

    const feedback = h('textarea', { id: 'feedback', maxlength: '1000', rows: '5', placeholder: 'セミナーを聞いてのご感想・ご質問など、自由にお書きください' }, a.feedback || '');
    const name = h('input', { type: 'text', id: 'name', maxlength: '50', autocomplete: 'off', value: a.name || '' });
    const contact = h('input', { type: 'text', id: 'contact', maxlength: '100', autocomplete: 'off', placeholder: '電話番号・メールなど', value: a.contact || '' });
    const err = h('p', { class: 'err' });
    const btn = h('button', { class: 'btn' }, '送信して点数を見る');
    btn.addEventListener('click', async function () {
      a.name = name.value; a.contact = contact.value; a.feedback = feedback.value;
      a.interestOther = interestOther.value; a.sourceOther = sourceOther.value;
      err.textContent = '';
      btn.disabled = true; btn.textContent = '送信中…';
      try {
        const res = await api('submit', {
          seminarId: seminarId, consent: state.consent,
          answers: state.test.questions.map(function (q) { return { no: q.no, answer: state.answers[q.no] }; }),
          attributes: a,
          feedback: a.feedback,
        });
        if (!res.ok) throw new Error(res.error);
        resultView(res);
      } catch (e) {
        err.textContent = '送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。';
        btn.disabled = false; btn.textContent = '送信して点数を見る';
      }
    });

    refreshOther();
    show([
      h('h1', {}, 'あと少しだけ教えてください'),
      h('p', { class: 'muted' }, 'すべて任意です。答えたくない項目は、空欄のままで大丈夫です。'),
      h('div', { class: 'card' }, [].concat(
        select_('age', '年代', o.age, a.age, function (v) { a.age = v; }),
        select_('pref', 'お住まい（都道府県）', Object.keys(muni), a.prefecture, function (v) { a.prefecture = v; a.city = ''; fillCities(); }),
        [h('label', { class: 'f', for: 'city' }, 'お住まい（市区町村）'), citySel],
        interest, [interestBox],
        radios_('situation', 'ご状況', o.situation, a.situation, function (v) { a.situation = v; }),
        radios_('consult', '個別相談のご希望', o.consult, a.consult, function (v) { a.consult = v; }),
        radios_('source', 'このセミナーを知ったきっかけ', o.source, a.source, function (v) { a.source = v; refreshOther(); }), [sourceBox],
        [h('label', { class: 'f', for: 'name' }, 'お名前（任意）'), name],
        [h('label', { class: 'f', for: 'contact' }, 'ご連絡方法（任意）'), contact],
        [h('label', { class: 'f', for: 'feedback' }, 'セミナーのご感想（任意）'), feedback]
      )),
      err,
      btn,
    ]);
  }

  function resultView(res) {
    const wantsConsult = state.attr.consult === '今すぐ' || state.attr.consult === 'いずれ';
    let lineBlock;
    if (CFG.LIFF_ID) {
      lineBlock = h('a', { class: 'btn line', href: 'https://liff.line.me/' + encodeURIComponent(CFG.LIFF_ID) + '?a=' + encodeURIComponent(res.answerId) }, wantsConsult ? '解答・解説を受け取り、相談を申し込む（LINE）' : '解答と解説をLINEで受け取る');
    } else {
      lineBlock = h('p', { class: 'muted center' }, 'LINEでの解答・解説のお届けは準備中です。');
    }
    // 個別相談を希望した方には、LINE登録→そのまま申込みへ進む案内を出す
    const consultCard = wantsConsult ? h('div', { class: 'card consult' }, [
      h('h2', {}, '個別相談をご希望の方へ'),
      h('p', {}, '公式LINEを友だち追加すると、そのままLINEから相談のお申込みができます（約1分）。'),
      h('p', { class: 'muted' }, '解答・解説もあわせてLINEでお届けします。'),
    ]) : null;
    show([
      h('h1', { class: 'center' }, 'ご回答ありがとうございました'),
      h('div', { class: 'card' }, [
        h('p', { class: 'center' }, 'あなたの点数'),
        h('p', { class: 'score' }, res.total + '問中 ' + res.score + '問正解！'),
      ]),
      consultCard,
      lineBlock,
      h('p', { class: 'muted center' }, '※解答と解説は、公式LINEの友だち追加後にLINEでお送りします。'),
    ]);
  }

  // ---- 起動 ----
  (async function init() {
    if (!seminarId) return errorView('QRコードからアクセスしてください（seminar が指定されていません）。');
    try {
      const t = await api('getTest');
      if (!t.ok) return errorView('このテストは見つかりませんでした。');
      state.test = t;
      consentView();
    } catch (e) {
      errorView('読み込めませんでした。通信状況をご確認ください。');
    }
  })();
})();
