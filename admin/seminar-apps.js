// 申込者: 一覧、状態の変更、LINEでの個別連絡
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  const TEMPLATES = [
    { label: 'お申込みの確認', text: 'お申込みありがとうございます。当日のご参加を、スタッフ一同、お待ちしております。ご不明な点があれば、このトークでお気軽にご連絡ください。' },
    { label: '開催前のご案内', text: 'まもなく開催です。筆記用具をお持ちください。お気をつけてお越しください。' },
    { label: '日程・会場の変更', text: '開催について、変更のご連絡です。詳細は、あらためてお知らせいたします。ご不便をおかけし、申し訳ございません。' },
  ];

  async function view(box, params) {
    const listRes = await api('adminListArchive', {});
    if (!listRes.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));

    const sel = h('select', { class: 'wide' }, [h('option', { value: '' }, 'すべてのセミナー')].concat(
      listRes.seminars.filter(function (s) { return s.applications > 0 || s.upcoming; }).map(function (s) {
        return h('option', { value: s.id }, (s.date ? A.ymd(s.date) + '　' : '') + s.name + '（' + s.applications + '件）');
      })));
    if (params && params.id) sel.value = params.id;

    const body = h('div');
    let apps = [];
    const checked = {};

    const msgBox = h('textarea', { rows: '5', maxlength: '1000', placeholder: '送るメッセージ（冒頭に「○○さん」と自動で付きます）' });
    const sendMsg = h('p', { class: 'err' });
    const sendBtn = h('button', { type: 'button', class: 'btn', onclick: send }, 'LINEで送る');
    const tplRow = h('div', { class: 'tpls' }, TEMPLATES.map(function (t) {
      return h('button', { type: 'button', class: 'mini', onclick: function () { msgBox.value = t.text; } }, t.label);
    }));

    async function load() {
      body.replaceChildren(h('p', { class: 'muted' }, '読み込み中…'));
      const r = await api('adminListApplications', { seminarId: sel.value });
      if (!r.ok) return body.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
      apps = r.applications;
      Object.keys(checked).forEach(function (k) { delete checked[k]; });
      draw();
    }

    function contactLink(c) {
      if (c.indexOf('@') >= 0) return h('a', { href: 'mailto:' + c }, c);
      return h('a', { href: 'tel:' + c.replace(/[^0-9+]/g, '') }, c);
    }

    function draw() {
      if (!apps.length) return body.replaceChildren(h('p', {}, '申込みはまだありません。'));
      const total = apps.filter(function (a) { return a.status !== 'キャンセル'; }).reduce(function (n, a) { return n + a.count; }, 0);
      const lineCount = apps.filter(function (a) { return a.hasLine; }).length;
      const rows = apps.map(function (a) {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!checked[a.applyId];
        cb.addEventListener('change', function () { checked[a.applyId] = cb.checked; updateSend(); });
        const st = h('select', { class: 'st' }, ['受付', '確認済み', 'キャンセル'].map(function (v) { const o = h('option', { value: v }, v); if (v === a.status) o.selected = true; return o; }));
        st.addEventListener('change', async function () {
          const r = await api('adminUpdateApplication', { applyId: a.applyId, status: st.value });
          if (r.ok) a.status = st.value; else st.value = a.status;
        });
        return h('div', { class: 'card arow' }, [
          h('label', { class: 'arow-top' }, [cb, h('strong', {}, a.name + 'さん（' + a.count + '名）')]),
          h('div', { class: 'muted' }, (a.seminarName ? a.seminarName + '／' : '') + a.at.slice(0, 16)),
          h('div', {}, ['連絡先：', contactLink(a.contact)]),
          a.note ? h('div', {}, 'ご質問：' + a.note) : null,
          h('div', { class: 'arow-bot' }, [
            h('span', { class: 'chip ' + (a.hasLine ? 'on' : 'off') }, a.hasLine ? 'LINEで連絡できます' : 'LINEなし（連絡先へ直接）'),
            st,
          ]),
          a.history ? h('div', { class: 'muted hist' }, a.history) : null,
        ]);
      });
      body.replaceChildren.apply(body, [
        h('p', {}, '申込み ' + apps.length + '件（キャンセルを除く ' + total + '名）／LINEで連絡できる方 ' + lineCount + '件'),
        h('button', { type: 'button', class: 'mini', onclick: function () {
          apps.forEach(function (a) { if (a.hasLine && a.status !== 'キャンセル') checked[a.applyId] = true; });
          draw(); updateSend();
        } }, 'LINEで連絡できる方を全員選ぶ'),
      ].concat(rows, [
        h('div', { class: 'card' }, [
          h('h2', {}, 'LINEで個別に連絡する'),
          h('p', { class: 'muted' }, 'チェックした方に、公式LINEから個別にメッセージを送ります。LINEなしの方には送れません。'),
          tplRow, msgBox, sendMsg, sendBtn,
        ]),
      ]));
      updateSend();
    }

    function selectedIds() { return apps.filter(function (a) { return checked[a.applyId]; }).map(function (a) { return a.applyId; }); }
    function updateSend() { sendBtn.textContent = selectedIds().length ? '選んだ' + selectedIds().length + '名にLINEで送る' : 'LINEで送る'; }

    async function send() {
      sendMsg.textContent = ''; sendMsg.className = 'err';
      const ids = selectedIds();
      if (!ids.length) { sendMsg.textContent = '送る相手にチェックを入れてください。'; return; }
      if (!msgBox.value.trim()) { sendMsg.textContent = 'メッセージを入力してください。'; return; }
      const names = apps.filter(function (a) { return checked[a.applyId]; }).map(function (a) { return a.name + 'さん'; }).join('、');
      if (!confirm('次の' + ids.length + '名に、公式LINEでメッセージを送ります。\n' + names + '\n\n送りますか？')) return;
      sendBtn.disabled = true; sendBtn.textContent = '送信中…';
      try {
        const r = await api('adminSendToApplicants', { applyIds: ids, message: msgBox.value });
        if (!r.ok) {
          sendMsg.textContent = { too_long: 'メッセージが長すぎます（1000字まで）。', empty_message: 'メッセージを入力してください。', no_recipients: '送る相手がいません。' }[r.error] || '送れませんでした。';
        } else {
          const n = function (k) { return r.results.filter(function (x) { return x.result === k; }).length; };
          sendMsg.className = 'muted';
          sendMsg.textContent = '送信しました：' + n('sent') + '名' + (n('no_line') ? '／LINEなしのため送れず：' + n('no_line') + '名' : '') + (n('failed') ? '／失敗（ブロック中の可能性）：' + n('failed') + '名' : '');
          msgBox.value = '';
          await load();
          sendMsg.className = 'muted'; // load() の再描画で消えないよう、結果は下で再表示
        }
      } catch (e) {
        sendMsg.textContent = '通信エラーです。もう一度お試しください。';
      }
      sendBtn.disabled = false; updateSend();
    }

    sel.addEventListener('change', load);
    box.replaceChildren(h('p', { class: 'muted' }, 'セミナー・相談会の申込みフォームから届いた申込みです。'), sel, body);
    await load();
  }

  A.views['seminar/apps'] = view;
})();
