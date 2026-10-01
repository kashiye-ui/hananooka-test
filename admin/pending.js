// 先生からの申請（LINEの「#プロフィール」で送られた顔写真・名刺・ひとこと）を確認して、承認・却下する
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  async function listView(box) {
    const res = await A.apiSwr('adminListPendingProfiles', {}, function (fresh) { res.members = fresh.members; updateBadge(); renderList(); });
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const list = h('div');
    const catBox = h('div');
    let catCount = 0;
    function updateBadge() { A.needProfile = res.members.length + catCount; if (A.setBadges) A.setBadges(); } // バッジの件数 = プロフィールの申請 + カテゴリー追加の申請
    updateBadge();

    // カテゴリーを増やす申請（先生がLINEで「追加 〇〇」と書いたもの）。管理者が承認すると、カテゴリーの一覧に加わる
    function catCard(rq, after) {
      const msg = h('p', { class: 'err' });
      const okBtn = h('button', { type: 'button', class: 'btn', style: 'width:auto;padding:8px 20px', onclick: async function () {
        okBtn.disabled = true; noBtn.disabled = true;
        try {
          const r = await api('adminApproveCategory', { id: rq.id });
          if (!r.ok) { msg.textContent = '承認できませんでした。'; okBtn.disabled = false; noBtn.disabled = false; return; }
          A._swr = {}; after();
        } catch (e) { msg.textContent = '通信エラーです。'; okBtn.disabled = false; noBtn.disabled = false; }
      } }, '承認して、カテゴリーに加える');
      const noBtn = h('button', { type: 'button', class: 'mini danger', onclick: async function () {
        const reason = prompt('カテゴリー「' + rq.category + '」を見送る理由（先生へのメッセージに添えます。空欄でも可）');
        if (reason == null) return;
        okBtn.disabled = true; noBtn.disabled = true;
        try {
          const r = await api('adminRejectCategory', { id: rq.id, reason: reason.trim() });
          if (!r.ok) { msg.textContent = '却下できませんでした。'; okBtn.disabled = false; noBtn.disabled = false; return; }
          after();
        } catch (e) { msg.textContent = '通信エラーです。'; okBtn.disabled = false; noBtn.disabled = false; }
      } }, '見送る');
      return h('div', { class: 'card', style: 'border:2px solid #e58aa8' }, [
        h('strong', {}, 'カテゴリーの追加の申請'),
        h('div', {}, [h('span', { class: 'chip cat-avail' }, rq.category), '　', rq.name + ' 先生' + (rq.skill ? '（得意分野にも希望）' : '')]),
        h('div', { class: 'muted' }, rq.at),
        h('p', { class: 'muted' }, '承認すると、カテゴリーの一覧に加わり、この先生の「受けられるカテゴリー」にも入ります（先生に、LINEでお知らせします）。'),
        msg, h('div', { class: 'sacts' }, [okBtn, noBtn]),
      ]);
    }
    async function loadCats() {
      try {
        const r = await api('adminListCategoryRequests', {});
        const reqs = r.ok ? r.requests : [];
        catCount = reqs.length; updateBadge();
        catBox.replaceChildren.apply(catBox, reqs.map(function (rq) { return catCard(rq, loadCats); }));
      } catch (e) { /* 申請の一覧が取れなくても、プロフィールの申請は、そのまま使える */ }
    }
    loadCats();

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

      // 申請された画像が不適格（顔が小さい・名刺が斜め・向きが違う等）のとき、管理者が切り抜き・回転して差し替える
      const pendingImg = h('img', { src: m.pendingPhoto, alt: '申請された顔写真', class: 'mphoto' });
      const editPhotoBtn = h('button', { type: 'button', class: 'mini', onclick: async function () {
        editPhotoBtn.disabled = true; editPhotoBtn.textContent = '読み込み中…';
        try {
          const r = await api('adminGetPendingPhoto', { memberId: m.id });
          if (!r.ok) { msg.textContent = '顔写真を読み込めませんでした。'; return; }
          const out = await A.editImage({ src: 'data:' + r.mime + ';base64,' + r.base64, kind: 'photo', title: m.name + ' さんの顔写真を加工' });
          if (!out) return;
          const s = await api('adminReplacePendingImage', { memberId: m.id, kind: 'photo', base64: out.base64, mime: out.mime });
          if (!s.ok) { msg.textContent = '加工した写真を保存できませんでした。'; return; }
          msg.textContent = '';
          pendingImg.src = 'data:' + out.mime + ';base64,' + out.base64;
        } catch (e) { msg.textContent = '通信エラーです。'; }
        finally { editPhotoBtn.disabled = false; editPhotoBtn.textContent = '写真を加工する'; }
      } }, '写真を加工する');
      const photoRow = h('div', { class: 'mcard' }, [
        h('div', { class: 'mbody' }, [h('div', { class: 'muted' }, '今の顔写真'), h('img', { src: m.photo, alt: '今の顔写真', class: 'mphoto' })]),
        m.pendingPhoto ? h('div', { class: 'mbody' }, [h('div', { class: 'muted' }, '申請された顔写真'), pendingImg, editPhotoBtn]) : h('p', { class: 'muted' }, '（顔写真の申請はなし）'),
      ]);

      const cardsBox = h('div', { class: 'cardthumbs' });
      if (m.pendingCards) {
        for (let i = 0; i < m.pendingCards; i++) {
          const slot = h('div', { class: 'cardslot' }, [h('p', { class: 'muted' }, '読み込み中…')]);
          cardsBox.appendChild(slot);
          A.cardElement(m.id, i, 'thumb', 'adminGetPendingCard').then(function (el) {
            if (el.tagName !== 'IMG') return slot.replaceChildren(el); // PDFなどは加工できない
            const btn = h('button', { type: 'button', class: 'mini', onclick: async function () {
              btn.disabled = true;
              try {
                const r = await A.cardData(m.id, i, 'adminGetPendingCard');
                const out = await A.editImage({ src: 'data:' + r.mime + ';base64,' + r.base64, kind: 'card', title: m.name + ' さんの名刺（' + (i + 1) + '枚目）を加工' });
                if (!out) return;
                const s = await api('adminReplacePendingImage', { memberId: m.id, kind: 'card', index: i, base64: out.base64, mime: out.mime });
                if (!s.ok) { msg.textContent = '加工した名刺を保存できませんでした。'; return; }
                msg.textContent = '';
                A.cardCache['adminGetPendingCard:' + m.id + ':' + i] = Promise.resolve({ ok: true, mime: out.mime, base64: out.base64, index: i, count: m.pendingCards });
                el.src = 'data:' + out.mime + ';base64,' + out.base64;
              } catch (e) { msg.textContent = '通信エラーです。'; }
              finally { btn.disabled = false; }
            } }, '名刺を加工する');
            slot.replaceChildren(el, btn);
          });
        }
      }

      return h('div', { class: 'card' }, [
        h('h2', {}, m.name + ' さん'),
        h('div', {}, [
          h('div', { class: 'muted' }, '今の事務所名・肩書：' + (m.org || '（なし）')),
          h('div', { class: 'muted' }, m.pendingOrg ? '申請された事務所名・肩書：' + m.pendingOrg : '（事務所名・肩書の申請はなし）'),
          h('div', { class: 'muted' }, '今の事務所の場所：' + (m.area || '（なし）')),
          h('div', { class: 'muted' }, m.pendingArea ? '申請された事務所の場所：' + m.pendingArea : '（事務所の場所の申請はなし）'),
        ]),
        photoRow,
        h('div', {}, [h('div', { class: 'muted' }, '申請された名刺（' + m.pendingCards + '枚。今の名刺は ' + m.cards + '枚）'), cardsBox]),
        h('div', {}, [
          h('div', { class: 'muted' }, '今のコメント：' + (m.comment || '（なし）')),
          h('div', { class: 'muted' }, m.pendingComment ? '申請されたコメント：' + m.pendingComment : '（コメントの申請はなし）'),
        ]),
        h('p', { class: 'muted' }, '画像が不適格なときは「加工する」で切り抜き・回転してから承認できます。「承認して反映する」を押すと、送られた項目（空欄でないもの）だけが、名簿・LINEの先生カードに反映されます。'),
        msg,
        h('div', { class: 'sacts' }, [approveBtn, rejectBtn]),
      ]);
    }

    function renderList() { list.replaceChildren.apply(list, res.members.length ? res.members.map(card) : [h('p', {}, '今、申請中の先生はいません。')]); }
    renderList();
    box.replaceChildren(
      catBox,
      h('p', { class: 'muted' }, '先生がLINEで「#プロフィール」から送った、顔写真・名刺・ひとことの一覧です。内容を確認してから反映してください。'),
      list
    );
  }

  A.views['members/pending'] = listView;
})();
