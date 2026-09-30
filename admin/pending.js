// 先生からの申請（LINEの「#プロフィール」で送られた顔写真・名刺・ひとこと）を確認して、承認・却下する
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  async function listView(box) {
    const res = await api('adminListPendingProfiles', {});
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const list = h('div');

    function card(m) {
      const msg = h('p', { class: 'err' });
      const approveBtn = h('button', { type: 'button', class: 'btn', style: 'width:auto;padding:8px 20px', onclick: async function () {
        approveBtn.disabled = true; rejectBtn.disabled = true;
        try {
          const r = await api('adminApproveProfile', { memberId: m.id });
          if (!r.ok) { msg.textContent = '承認できませんでした。'; approveBtn.disabled = false; rejectBtn.disabled = false; return; }
          A.cardCache = {}; A.go('members/pending'); location.reload();
        } catch (e) { msg.textContent = '通信エラーです。'; approveBtn.disabled = false; rejectBtn.disabled = false; }
      } }, '承認して反映する');
      const rejectBtn = h('button', { type: 'button', class: 'mini danger', onclick: async function () {
        const reason = prompt((m.name || 'この方') + 'さんへの、却下の理由（先生へのメッセージに添えます。空欄でも可）');
        if (reason == null) return;
        approveBtn.disabled = true; rejectBtn.disabled = true;
        try {
          const r = await api('adminRejectProfile', { memberId: m.id, reason: reason.trim() });
          if (!r.ok) { msg.textContent = '却下できませんでした。'; approveBtn.disabled = false; rejectBtn.disabled = false; return; }
          A.go('members/pending'); location.reload();
        } catch (e) { msg.textContent = '通信エラーです。'; approveBtn.disabled = false; rejectBtn.disabled = false; }
      } }, '却下する');

      const photoRow = h('div', { class: 'mcard' }, [
        h('div', { class: 'mbody' }, [h('div', { class: 'muted' }, '今の顔写真'), h('img', { src: m.photo, alt: '今の顔写真', class: 'mphoto' })]),
        m.pendingPhoto ? h('div', { class: 'mbody' }, [h('div', { class: 'muted' }, '申請された顔写真'), h('img', { src: m.pendingPhoto, alt: '申請された顔写真', class: 'mphoto' })]) : h('p', { class: 'muted' }, '（顔写真の申請はなし）'),
      ]);

      const cardsBox = h('div', { class: 'cardthumbs' });
      if (m.pendingCards) {
        for (let i = 0; i < m.pendingCards; i++) {
          const slot = h('div', { class: 'cardslot' }, [h('p', { class: 'muted' }, '読み込み中…')]);
          cardsBox.appendChild(slot);
          A.cardElement(m.id, i, 'thumb', 'adminGetPendingCard').then(function (el) { slot.replaceChildren(el); });
        }
      }

      return h('div', { class: 'card' }, [
        h('h2', {}, m.name + ' さん'),
        photoRow,
        h('div', {}, [h('div', { class: 'muted' }, '申請された名刺（' + m.pendingCards + '枚。今の名刺は ' + m.cards + '枚）'), cardsBox]),
        h('div', {}, [
          h('div', { class: 'muted' }, '今のコメント：' + (m.comment || '（なし）')),
          h('div', { class: 'muted' }, m.pendingComment ? '申請されたコメント：' + m.pendingComment : '（コメントの申請はなし）'),
        ]),
        h('p', { class: 'muted' }, '「承認して反映する」を押すと、送られた項目（空欄でないもの）だけが、名簿・LINEの先生カードに反映されます。'),
        msg,
        h('div', { class: 'sacts' }, [approveBtn, rejectBtn]),
      ]);
    }

    list.replaceChildren.apply(list, res.members.length ? res.members.map(card) : [h('p', {}, '今、申請中の先生はいません。')]);
    box.replaceChildren(
      h('p', { class: 'muted' }, '先生がLINEで「#プロフィール」から送った、顔写真・名刺・ひとことの一覧です。内容を確認してから反映してください。'),
      list
    );
  }

  A.views['members/pending'] = listView;
})();
