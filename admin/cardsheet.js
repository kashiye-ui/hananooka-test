// 名刺シート印刷: 先生を選んで、実寸の名刺（表・裏）つきでA4に並べて印刷する（旧 web/members/ の印刷機能を、
// ログイン必須の管理画面に移設したもの。名刺の画像には電話番号などが写っているため、公開ページには置かない）。
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  async function listView(box) {
    const res = await api('adminListMembers', {});
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const withCard = res.members.filter(function (m) { return m.hasCard; });
    const sel = {};
    const list = h('div');
    const count = h('span', {});
    const printBtn = h('button', { type: 'button', class: 'btn', style: 'width:auto;padding:10px 22px', onclick: function () { window.print(); } }, '選んだ先生の名刺を印刷');
    const sheet = h('div', { id: 'cardsheet', class: 'sheet' });

    function selected() { return withCard.filter(function (m) { return sel[m.id]; }); }

    async function buildSheet() {
      const s = selected();
      const pages = [];
      for (let i = 0; i < s.length; i += 4) pages.push(s.slice(i, i + 4));
      const cardImg = function (m, idx) {
        const box = h('div', { class: 'mc' }, [h('p', { class: 'muted' }, '…')]);
        A.cardElement(m.id, idx, 'sheet').then(function (el) { box.replaceChildren(el); }).catch(function () { box.replaceChildren(h('p', { class: 'muted' }, '読み込めません')); });
        return box;
      };
      sheet.replaceChildren.apply(sheet, pages.map(function (grp) {
        return h('div', { class: 'pg' }, grp.map(function (m) {
          return h('div', { class: 'pb' }, [
            h('div', { class: 'pt' }, [h('b', {}, m.name), h('span', { class: 'rr' }, m.org || ''), h('span', { class: 'ff' }, m.tags.join('・'))]),
            h('div', { class: 'pm' }, m.comment || ''),
            h('div', { class: 'pc' }, [cardImg(m, 0), m.cards > 1 ? cardImg(m, 1) : h('div', { class: 'mc' }, '裏面なし')]),
          ]);
        }));
      }));
    }

    function draw() {
      list.replaceChildren.apply(list, withCard.length ? withCard.map(function (m) {
        const check = h('input', { type: 'checkbox' }); check.checked = !!sel[m.id];
        check.addEventListener('change', function () { sel[m.id] = check.checked; count.textContent = selected().length + '名選択中'; buildSheet(); });
        return h('label', { class: 'card mcard', style: 'cursor:pointer' }, [
          check,
          h('img', { src: m.photo, alt: m.name, class: 'mphoto' }),
          h('div', { class: 'mbody' }, [h('div', { class: 'stitle' }, m.name), m.org ? h('div', { class: 'muted' }, m.org) : null, h('div', { class: 'muted' }, '名刺 ' + m.cards + '枚')]),
        ]);
      }) : [h('p', {}, '名刺が保管されているメンバーがいません。')]);
      count.textContent = selected().length + '名選択中';
    }
    draw();

    box.replaceChildren(
      h('p', { class: 'muted' }, '名刺を保管しているメンバーの一覧です。チェックを入れた先生を、実寸の名刺（表・裏）つきでA4に並べて印刷します（1枚に4名まで）。名刺の画像には連絡先が写っているため、この画面は管理者だけが使えます。'),
      h('div', { class: 'sacts', style: 'margin-bottom:12px' }, [count, printBtn]),
      list, sheet
    );
  }

  A.views['members/cardsheet'] = listView;
})();
