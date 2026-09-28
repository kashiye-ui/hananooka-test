// メッセージ: 公式LINEに届いた自由なメッセージの履歴（人ごと）と、個別返信
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  const TEMPLATES = [
    { label: '確認しました', text: 'メッセージありがとうございます。内容を確認しました。あらためてご連絡します。' },
    { label: '折り返します', text: 'お問い合わせありがとうございます。担当者から、お電話でご連絡します。つながりやすい時間帯を、このトークで教えていただけますか。' },
    { label: '相談のご案内', text: 'ご相談をご希望でしたら、トーク画面のメニュー「ご相談はこちら」から、簡単な質問にお答えください。初回45分は無料です。' },
  ];

  function ago(s) { return s ? s.slice(5, 16).replace('-', '/') : ''; } // 「MM/DD HH:mm」

  // ---- 一覧（人ごと） ----
  async function listView(box) {
    const res = await api('adminListThreads', {});
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const only = h('input', { type: 'checkbox' });
    const q = h('input', { type: 'text', placeholder: 'お名前・本文で絞り込み' });
    const list = h('div');

    function draw() {
      const k = q.value.trim();
      const rows = res.threads.filter(function (t) {
        return (!only.checked || t.pending > 0) && (!k || t.name.indexOf(k) >= 0 || t.lastText.indexOf(k) >= 0);
      });
      list.replaceChildren.apply(list, rows.length ? rows.map(function (t) {
        return h('div', { class: 'card thread', onclick: function () { A.go('messages/thread', { k: t.key }); } }, [
          h('div', { class: 'thead' }, [
            h('strong', {}, t.name),
            t.pending ? h('span', { class: 'chip on' }, '未対応 ' + t.pending) : h('span', { class: 'chip off' }, '対応済み'),
          ]),
          h('div', { class: 'muted' }, (t.lastDir === '返信' ? '↩ ' : '') + t.lastText),
          h('div', { class: 'muted' }, ago(t.lastAt) + '　（やりとり ' + t.total + '件）'),
        ]);
      }) : [h('p', {}, res.threads.length ? '該当するメッセージがありません。' : 'まだメッセージは届いていません。')]);
    }
    only.addEventListener('change', draw); q.addEventListener('input', draw);
    draw();
    box.replaceChildren(
      h('p', { class: 'muted' }, '公式LINEに届いた、自由なメッセージの履歴です。「相談」の質問への入力は、含まれません。人を選ぶと、やりとりを見て、その人のLINEに返信できます。'),
      h('label', { class: 'arow-top', style: 'margin:8px 0' }, [only, h('span', {}, '未対応だけを表示')]),
      q, list
    );
  }

  // ---- 1人ぶんの会話と返信 ----
  async function threadView(box, params) {
    const key = params && params.k;
    const res = await api('adminGetThread', { key: key });
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '会話が見つかりませんでした。'), h('button', { type: 'button', class: 'mini', onclick: function () { A.go('messages/list'); } }, '一覧へ戻る'));

    const log = h('div', { class: 'chatlog' });
    function drawLog(msgs) {
      log.replaceChildren.apply(log, msgs.map(function (m) {
        const cls = m.dir === '受信' ? 'in' : (m.dir === '返信' ? 'out' : 'auto');
        const meta = ago(m.at) + (m.dir === '返信' ? '　' + (m.by || '') + (m.sent === '失敗' ? '　⚠届いていません' : '') : (m.dir === '自動応答' ? '　自動応答' : (m.status === '未対応' ? '　未対応' : '')));
        return h('div', { class: 'bubble ' + cls }, [h('div', { class: 'btext' }, m.text), h('div', { class: 'bmeta' }, meta)]);
      }));
      log.scrollTop = log.scrollHeight;
    }
    drawLog(res.messages);

    const ta = h('textarea', { rows: '4', maxlength: '1800', placeholder: 'この方に送るメッセージ（LINEに届きます）' });
    const msg = h('p', { class: 'err' });
    const sendBtn = h('button', { type: 'button', class: 'btn', onclick: async function () {
      msg.textContent = ''; msg.className = 'err';
      if (!ta.value.trim()) { msg.textContent = 'メッセージを入力してください。'; return; }
      sendBtn.disabled = true; sendBtn.textContent = '送信中…';
      try {
        const r = await api('adminReplyMessage', { key: key, text: ta.value });
        if (!r.ok) msg.textContent = { too_long: 'メッセージが長すぎます（1800字まで）。', empty_message: 'メッセージを入力してください。' }[r.error] || '送信できませんでした。';
        else {
          if (!r.sent) msg.textContent = 'LINEに届きませんでした（ブロックされているか、友だちでない可能性があります）。履歴には残しました。';
          else { msg.className = 'muted'; msg.textContent = '送信しました。'; }
          ta.value = '';
          const again = await api('adminGetThread', { key: key });
          if (again.ok) drawLog(again.messages);
        }
      } catch (e) { msg.textContent = '通信エラーです。もう一度お試しください。'; }
      sendBtn.disabled = false; sendBtn.textContent = 'LINEで送る';
    } }, 'LINEで送る');
    const statusBtn = h('button', { type: 'button', class: 'mini', onclick: async function () {
      const pending = res.messages.some(function (m) { return m.dir === '受信' && m.status === '未対応'; });
      const r = await api('adminSetThreadStatus', { key: key, status: pending ? '対応済み' : '未対応' });
      if (r.ok) A.go('messages/list');
    } }, '対応済みにする／未対応に戻す');

    box.replaceChildren(
      h('button', { type: 'button', class: 'mini', onclick: function () { A.go('messages/list'); } }, '← 一覧へ'),
      h('h2', { style: 'margin-top:10px' }, res.name + ' さん'),
      res.display && res.display !== res.name ? h('p', { class: 'muted' }, 'LINEの表示名：' + res.display) : null,
      log,
      h('div', { class: 'card' }, [
        h('div', { class: 'tpls' }, TEMPLATES.map(function (t) { return h('button', { type: 'button', class: 'mini', onclick: function () { ta.value = t.text; } }, t.label); })),
        ta, msg, sendBtn,
        h('p', { class: 'muted' }, '送信は、公式LINEの月間の通数に数えられます（無料プランは、月200通まで）。'),
      ]),
      statusBtn
    );
  }

  A.views['messages/list'] = listView;
  A.views['messages/thread'] = threadView;
})();
