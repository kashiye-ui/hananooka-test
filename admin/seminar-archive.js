// セミナー一覧・アーカイブ管理: 案内の公開、過去の解答・解説の公開、編集・削除
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  async function view(box) {
    // 前回の一覧があれば、すぐ出して、最新が届いたら、静かに差し替える
    const res = await A.apiSwr('adminListArchive', {}, function (fresh) { res.seminars = fresh.seminars; draw(); });
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const msg = h('p', { class: 'err' });
    const list = h('div');
    const todayStr = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const held = function () { return res.seminars.filter(function (x) { return x.date && x.date < todayStr; }); }; // 開催日が過ぎたものだけ。これからのものは「開催予定のセミナー」

    function badge(text, cls) { return h('span', { class: 'chip' + (cls ? ' ' + cls : '') }, text); }

    function card(s) {
      const chips = [
        s.type === '相談会' ? badge('相談会', 'green') : null,
        s.upcoming ? badge('開催予定として案内中', 'on') : null,
        s.hidden ? badge('解答・解説は非公開', 'off') : (s.questions && !s.upcoming ? badge('解答・解説を公開中', 'on') : null),
        !s.questions ? badge('理解度確認テスト未作成', 'off') : null,
      ].filter(Boolean);
      const acts = [
        h('button', { type: 'button', class: 'mini', onclick: function () { A.go('seminar/edit', { id: s.id }); } }, '編集'),
        s.date ? h('button', { type: 'button', class: 'mini', onclick: function () { A.go('seminar/progress', { id: s.id }); } }, '進行状況') : null,
        h('button', { type: 'button', class: 'mini', onclick: function () { A.go('seminar/apps', { id: s.id }); } }, '申込者'),
        s.date ? h('button', { type: 'button', class: 'mini', onclick: function () { setFlag(s, { upcoming: !s.upcoming }); } }, s.upcoming ? '案内をやめる' : '開催予定として案内する') : null,
        s.questions ? h('button', { type: 'button', class: 'mini', onclick: function () { setFlag(s, { hidden: !s.hidden }); } }, s.hidden ? '解答・解説を公開する' : '解答・解説を非公開にする') : null,
        h('button', { type: 'button', class: 'mini danger', onclick: function () { del(s); } }, '削除'),
      ].filter(Boolean);
      return h('div', { class: 'card scard' }, [
        h('div', { class: 'sdate' }, s.date ? A.ymd(s.date) : '日付なし'),
        h('div', { class: 'stitle' }, s.name),
        h('div', { class: 'schips' }, chips),
        h('div', { class: 'muted' }, s.teachers.length ? '担当講師：' + s.teachers.join('、') : '担当講師：未設定'),
        h('div', { class: 'muted' }, '理解度確認テスト ' + s.questions + '問／回答 ' + s.answers + '件／申込み ' + s.applications + '件'),
        h('div', { class: 'sacts' }, acts),
      ]);
    }

    function draw() {
      // 講座名ごとにまとめる（講座名のないものは「単発のセミナー」）
      const groups = {}, order = [];
      held().forEach(function (s) {
        const k = s.course || '';
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(s);
      });
      const nodes = [];
      order.forEach(function (k) {
        nodes.push(h('h2', { class: 'ghead' }, k || '単発のセミナー・相談会'));
        groups[k].forEach(function (s) { nodes.push(card(s)); });
      });
      list.replaceChildren.apply(list, nodes.length ? nodes : [h('p', {}, '開催が終わったセミナーは、まだありません。')]);
    }

    async function setFlag(s, flag) {
      msg.textContent = '';
      const r = await api('adminSetSeminarFlag', Object.assign({ seminarId: s.id }, flag));
      if (!r.ok) { msg.textContent = r.error === 'date_required' ? '開催日が入っていないため、案内できません。先に編集で開催日を入れてください。' : '変更できませんでした。'; return; }
      if ('upcoming' in flag) s.upcoming = flag.upcoming;
      if ('hidden' in flag) s.hidden = flag.hidden;
      draw();
    }

    async function del(s) {
      msg.textContent = '';
      const typed = prompt('「' + s.name + '」を削除します。セミナー本体と理解度確認テストの問題が消え、元に戻せません（回答・申込みの記録は残ります）。\n削除する場合は、セミナーID「' + s.id + '」を入力してください。');
      if (typed == null) return;
      const r = await api('adminDeleteSeminar', { seminarId: s.id, confirmId: typed.trim() });
      if (!r.ok) { msg.textContent = r.error === 'confirm_mismatch' ? 'セミナーIDが一致しないため、削除しませんでした。' : '削除できませんでした。'; return; }
      res.seminars = res.seminars.filter(function (x) { return x.id !== s.id; });
      draw();
    }

    draw();
    box.replaceChildren(
      h('p', { class: 'muted' }, '開催が終わったセミナー・相談会の一覧です（これから開催するものは、「開催予定のセミナー」にあります）。開催が終わったら「案内をやめる」にすると、セミナーページの「過去の解答・解説」に移ります。'),
      msg, list
    );
  }

  A.views['seminar/archive'] = view;
})();
