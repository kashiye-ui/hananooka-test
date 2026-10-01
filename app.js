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
        { no: 1, text: '相続登記は義務化されている。', choices: ['そのとおり', 'そんなことはない'] },
        { no: 2, text: '法律で認められている遺言の方式はどれ？（あてはまるものをすべて選んでください）', choices: ['自筆証書遺言', '公正証書遺言', '口頭遺言'], multi: true },
        { no: 3, text: '財産の一覧を作っておくと手続きの負担が減る。', choices: ['そのとおり', 'そんなことはない'] },
      ],
      options: {
        age: ['〜39', '40代', '50代', '60代', '70代', '80代〜'],
        interest: ['遺言', '相続手続き', '相続税', '空き家', '認知症対策', '後見', '終活', '親なきあと', 'その他'],
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
    const btn = h('button', { class: 'btn', disabled: 'disabled', onclick: testView }, '同意して理解度確認テストへ進みましょう');
    box.addEventListener('change', function () { state.consent = box.checked; btn.disabled = !box.checked; });
    show([
      h('h1', {}, state.test.seminar.name + ' 理解度確認テスト'),
      h('p', {}, '本日のセミナーのポイント、いくつ覚えてますか？？'),
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
      const picked = state.answers[q.no] || (state.answers[q.no] = []);
      const hint = q.multi ? h('p', { class: 'muted' }, 'あてはまるものをすべて選んでください') : null;
      return h('div', { class: 'q' }, [
        h('p', { class: 'q-text' }, '問' + q.no + '. ' + q.text),
        hint,
      ].filter(Boolean).concat(q.choices.map(function (c) {
        const r = h('input', { type: q.multi ? 'checkbox' : 'radio', name: 'q' + q.no, value: c });
        if (picked.indexOf(c) >= 0) r.checked = true;
        r.addEventListener('change', function () {
          if (q.multi) {
            state.answers[q.no] = r.checked ? picked.concat(c) : picked.filter(function (v) { return v !== c; });
          } else {
            state.answers[q.no] = [c];
          }
        });
        return h('label', { class: 'choice' }, [r, h('span', {}, c)]);
      })));
    });
    show([
      h('h1', {}, '理解度確認テスト'),
      h('div', { class: 'card' }, cards),
      err,
      h('button', { class: 'btn', onclick: function () {
        if (qs.some(function (q) { return !(state.answers[q.no] || []).length; })) { err.textContent = 'すべての問題に、答えてみましょう。'; return; }
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
    const city = h('input', { type: 'text', id: 'city', maxlength: '40', autocomplete: 'off', placeholder: '例: さいたま市西区', value: a.city || '' });
    city.addEventListener('input', function () { a.city = city.value; });

    const interestOther = h('input', { type: 'text', maxlength: '100', placeholder: '差し支えなければ教えてください。今後の参考にさせていただきますね', value: a.interestOther || '' });
    const sourceOther = h('input', { type: 'text', maxlength: '100', placeholder: '差し支えなければ教えてください。今後の参考にさせていただきますね', value: a.sourceOther || '' });
    const interestBox = h('div', {}, [interestOther]);
    const sourceBox = h('div', {}, [sourceOther]);
    function refreshOther() {
      interestBox.hidden = a.interest.indexOf('その他') < 0;
      sourceBox.hidden = a.source !== 'その他';
    }
    const interest = [h('label', { class: 'f' }, '今気になっていること（いくつでも選べます）')].concat(o.interest.map(function (v) {
      const c = h('input', { type: 'checkbox', value: v });
      if (a.interest.indexOf(v) >= 0) c.checked = true;
      c.addEventListener('change', function () {
        a.interest = c.checked ? a.interest.concat(v) : a.interest.filter(function (x) { return x !== v; });
        refreshOther();
      });
      return h('label', { class: 'choice' }, [c, v]);
    }));

    const feedback = h('textarea', { id: 'feedback', maxlength: '1000', rows: '5', placeholder: 'セミナーを聞いての感想や気になったことを、自由に書いてみてください' }, a.feedback || '');
    const name = h('input', { type: 'text', id: 'name', maxlength: '50', autocomplete: 'off', value: a.name || '' });
    const contact = h('input', { type: 'text', id: 'contact', maxlength: '100', autocomplete: 'off', placeholder: '電話番号・メールなど', value: a.contact || '' });
    const err = h('p', { class: 'err' });
    const btn = h('button', { class: 'btn' }, '送信して点数を見てみましょう');
    btn.addEventListener('click', async function () {
      a.name = name.value; a.contact = contact.value; a.feedback = feedback.value;
      a.interestOther = interestOther.value; a.sourceOther = sourceOther.value;
      err.textContent = '';
      btn.disabled = true; btn.textContent = '送信中…';
      try {
        const res = await api('submit', {
          seminarId: seminarId, consent: state.consent,
          answers: state.test.questions.map(function (q) { return { no: q.no, answer: (state.answers[q.no] || []).join('/') }; }),
          attributes: a,
          feedback: a.feedback,
        });
        if (!res.ok) throw new Error(res.error);
        resultView(res);
      } catch (e) {
        err.textContent = '送信できませんでした。少し時間をおいて、もう一度お試しくださいね。';
        btn.disabled = false; btn.textContent = '送信して点数を見てみましょう';
      }
    });

    refreshOther();
    show([
      h('h1', {}, 'あと少しだけ教えてください'),
      h('p', { class: 'muted' }, 'すべて任意です。答えたくない項目は空欄のままで大丈夫ですよ。'),
      h('div', { class: 'card' }, [].concat(
        select_('age', '年代', o.age, a.age, function (v) { a.age = v; }),
        [h('label', { class: 'f', for: 'city' }, 'お住まい'), city],
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
    const perfect = res.score === res.total;
    // 解答・解説をLINEで、という案内はこの1箇所だけにする（ページ内で繰り返さない）。
    // すでに公式LINEの友だちの方（リピーター）にも、はじめての方にも不自然にならない書き方にする
    const scoreMessage = perfect
      ? 'お疲れさまでした！よかったら解説も確認してみてくださいね。'
      : 'お疲れさまでした！間違えたところは、解説でおさらいしてみてくださいね。';

    let lineBlock;
    if (CFG.LIFF_ID) {
      lineBlock = h('div', {}, [
        h('a', { class: 'btn line', href: 'https://liff.line.me/' + encodeURIComponent(CFG.LIFF_ID) + '?a=' + encodeURIComponent(res.answerId) }, '公式LINEで解答・解説を受け取る'),
        h('p', { class: 'muted center' }, 'すでに公式LINEのお友だちの方は、そのままトークに届きます。はじめての方は、友だち追加をお願いします。'),
      ]);
    } else {
      lineBlock = h('p', { class: 'muted center' }, 'LINEでのお届けは準備中です。');
    }
    // 個別相談を希望した方には、相談のお申込みについてだけ案内する（解答・解説の話は上の1箇所で済んでいるため繰り返さない）
    const consultCard = wantsConsult ? h('div', { class: 'card consult' }, [
      h('h2', {}, '個別相談をご希望の方へ'),
      h('p', {}, '個別相談も、そのまま公式LINEからお申込みいただけます。初回45分は無料です。'),
    ]) : null;
    show([
      h('h1', { class: 'center' }, 'ご回答ありがとうございました'),
      h('div', { class: 'card' }, [
        h('p', { class: 'center' }, 'あなたの点数'),
        h('p', { class: 'score' }, res.total + '問中 ' + res.score + '問正解！'),
        h('p', { class: 'center' }, scoreMessage),
      ]),
      consultCard,
      lineBlock,
    ]);
  }

  // ---- 起動 ----
  // ---- LINE連携（LIFFで開かれたとき: ?a=回答ID または liff.state） ----
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = reject;
      document.head.appendChild(el);
    });
  }
  function answerIdFromUrl() {
    const q = new URLSearchParams(location.search);
    if (q.get('a')) return q.get('a');
    const st = q.get('liff.state'); // 例: "?a=xxxx"
    return st ? new URLSearchParams(st.replace(/^\//, '').replace(/^\?/, '')).get('a') : null;
  }
  function linkMessage(title, lines, extra) {
    show([h('h1', { class: 'center' }, title)].concat(
      [h('div', { class: 'card' }, lines.map(function (t) { return h('p', {}, t); }))], extra || []));
  }
  async function linkFlow() {
    show(h('p', { class: 'muted center' }, 'LINEと連携しています…'));
    try {
      await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js');
      await liff.init({ liffId: CFG.LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      const answerId = answerIdFromUrl();
      if (!answerId) return linkMessage('URLが正しくありません', ['お手数ですが、理解度確認テストの完了画面のボタンから、もう一度お試しくださいね。']);
      const res = await api('link', { idToken: liff.getIDToken(), answerId: answerId });
      if (!res.ok) {
        const msg = res.error === 'already_linked' ? 'この回答は、すでに別のLINEアカウントと連携されています。'
          : '連携できませんでした。お手数ですが、もう一度お試しくださいね。';
        return linkMessage('連携できませんでした', [msg]);
      }
      const close = liff.isInClient() ? [h('button', { class: 'btn', onclick: function () { liff.closeWindow(); } }, 'トーク画面へ戻る')] : [];
      if (res.sent) {
        linkMessage('お送りしました', ['LINEのトークに、点数と解答・解説をお送りしました。トーク画面をのぞいてみてくださいね。'], close);
      } else if (res.friend) {
        linkMessage('準備中です', ['解答・解説の送信に失敗しました。少し時間をおいて、トーク画面をご確認くださいね。届かない場合は、トークで「相談」と送ってみてください。'], close);
      } else {
        const add = CFG.LINE_ADD_FRIEND_URL
          ? [h('a', { class: 'btn line', href: CFG.LINE_ADD_FRIEND_URL }, '友だち追加して解答・解説を受け取りましょう')] : [];
        linkMessage('友だち追加をお願いします', ['友だち追加すると、自動で点数と解答・解説が届きますよ。'], add);
      }
    } catch (e) {
      linkMessage('読み込めませんでした', ['通信状況をご確認のうえ、もう一度お試しくださいね。']);
    }
  }

  (async function init() {
    if (CFG.LIFF_ID && (new URLSearchParams(location.search).has('a') || new URLSearchParams(location.search).has('liff.state'))) return linkFlow();
    if (!seminarId) return errorView('QRコードからアクセスしてくださいね（seminar が指定されていません）。');
    try {
      const t = await api('getTest');
      if (!t.ok) return errorView('このテストは見つかりませんでした。QRコードをご確認くださいね。');
      state.test = t;
      consentView();
    } catch (e) {
      errorView('読み込めませんでした。通信状況をご確認くださいね。');
    }
  })();
})();
