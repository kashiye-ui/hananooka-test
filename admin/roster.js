// 公開の専門家名簿（web/members/）の、掲載・非掲載と並び順を決める画面。
// 上下ボタンで並び替え、チェックを入れた人だけが名簿に載る（並びは、チェックの有無に関わらず自由に動かせる）。
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;
  const PUBLIC_URL = 'https://kashiye-ui.github.io/hananooka-test/members/';

  async function listView(box) {
    const res = await api('adminListRoster', {});
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    // 表示順: 今すでに公開されている人を、今の並び順で先に。まだ載っていない人は後ろに（名前順）
    const list = res.members.slice().sort(function (a, b) {
      if (!!a.public !== !!b.public) return a.public ? -1 : 1;
      if (a.public) return ((a.order == null ? Infinity : a.order) - (b.order == null ? Infinity : b.order)) || a.name.localeCompare(b.name, 'ja');
      return a.name.localeCompare(b.name, 'ja');
    });
    const msg = h('p', { class: 'err' });

    const migrateBtn = h('button', { type: 'button', class: 'mini', onclick: async function () {
      migrateBtn.disabled = true; migrateBtn.textContent = '実行中…';
      try {
        const r = await api('adminMigrateLegacyRoster', {});
        if (!r.ok) { alert('実行できませんでした。'); }
        else {
          alert('引き継ぎました（' + r.done + '/' + r.total + '件）' + (r.notFound.length ? '\n名前が一致しなかった人：' + r.notFound.join('、') : ''));
          A.go('members/roster'); location.reload();
        }
      } catch (e) { alert('通信エラーです。もう一度お試しください。'); }
      migrateBtn.disabled = false; migrateBtn.textContent = '以前の名簿を引き継ぐ（初回のみ）';
    } }, '以前の名簿を引き継ぐ（初回のみ）');

    function move(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      const t = list[i]; list[i] = list[j]; list[j] = t;
      draw();
    }

    // 端の人のボタンは無効にする（h() は値が null でも属性を付けてしまうので、無効のときだけ disabled を渡す）
    function moveBtn(label, off, i, dir) {
      const attrs = { type: 'button', class: 'mini', onclick: function () { move(i, dir); } };
      if (off) attrs.disabled = '';
      return h('button', attrs, label);
    }

    const rows = h('div');
    function draw() {
      rows.replaceChildren.apply(rows, list.map(function (m, i) {
        const check = h('input', { type: 'checkbox' }); check.checked = !!m.public;
        check.addEventListener('change', function () { m.public = check.checked; });
        return h('div', { class: 'card rrow' }, [
          h('img', { src: m.photo, alt: m.name, class: 'mphoto' }),
          h('div', { class: 'rbody' }, [
            h('div', { class: 'stitle' }, m.name),
            m.org ? h('div', { class: 'muted' }, m.org) : null,
            m.linked ? null : h('div', { class: 'schips' }, [h('span', { class: 'chip off' }, '未登録（LINE未連携）')]),
          ]),
          h('label', { class: 'arow-top', style: 'flex:none' }, [check, h('span', {}, '名簿に載せる')]),
          h('div', { class: 'rmove' }, [
            moveBtn('↑', i === 0, i, -1),
            moveBtn('↓', i === list.length - 1, i, 1),
          ]),
        ]);
      }));
    }
    draw();

    const saveBtn = h('button', { type: 'button', class: 'btn', onclick: async function () {
      msg.textContent = ''; msg.className = 'err';
      saveBtn.disabled = true; saveBtn.textContent = '保存中…';
      let n = 0;
      const items = list.map(function (m) { return { id: m.id, public: !!m.public, order: m.public ? (n += 10) : '' }; });
      try {
        const r = await api('adminSaveRoster', { items: items });
        if (!r.ok) msg.textContent = '保存できませんでした。もう一度お試しください。';
        else { msg.className = 'muted'; msg.textContent = '保存しました。'; }
      } catch (e) { msg.textContent = '通信エラーです。もう一度お試しください。'; }
      saveBtn.disabled = false; saveBtn.textContent = '保存する';
    } }, '保存する');

    box.replaceChildren(
      h('p', { class: 'muted' }, '初期状態では、登録済み（LINE連携済み）の先生は全員、公開の専門家名簿に載ります。未登録の先生は載りません。チェックで個別に載せる・外すこともできます（保存するとその選択が優先されます）。並び順は↑↓で動かせます（チェックのない人を動かしても、名簿には影響しません）。'),
      h('p', {}, [h('a', { href: PUBLIC_URL, target: '_blank' }, '公開ページを見る（別タブ）')]),
      h('p', {}, [migrateBtn]),
      rows, msg, saveBtn
    );
  }

  A.views['members/roster'] = listView;
})();
