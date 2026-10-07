// 開催予定のセミナー: これから開催するセミナーの一覧（進み具合と、確認が必要な点が分かる）。
// 各セミナーは「開く」で、詳細ページ（seminar-detail.js）へ。編集・進行の記録・申込者・資料・削除などは、すべて詳細ページのタブで行う。
// チューターの不足と、資料の送付期限（開催の2週間前）を知らせる（知らせるだけ。メールやLINEは自動では送らない）。
// 開催が終わったセミナーは「セミナー・アーカイブ」に移る。
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  async function view(box) {
    const out = await Promise.all([api('adminListProgress', {}), api('adminListArchive', {})]);
    const prog = out[0], arc = out[1];
    if (!prog.ok || !arc.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const byId = {};
    prog.seminars.forEach(function (x) { byId[x.id] = x; });
    // 開催日が今日以降のもの、または、開催日がまだ入っていないもの（作りこみ中）
    // 管理者以外（講師）は、自分が講師・チューターとして登録されているセミナーと、同じ連続の講座（同じ講座名）の、ほかの回すべて
    const myCourses = {};
    arc.seminars.forEach(function (x) { if (x.course && (x.teachers || []).indexOf(A.myName) >= 0) myCourses[x.course] = true; });
    const mineOnly = function (x) { return A.isAdmin || (x.teachers || []).indexOf(A.myName) >= 0 || (x.course && myCourses[x.course]); };
    const items = arc.seminars.filter(function (s) { return (!s.date || s.date >= prog.today) && mineOnly(s); }).map(function (s) {
      return Object.assign({ stepsDone: 0, stepsTotal: prog.steps.length, alerts: [], daysLeft: null }, s, byId[s.id] || {});
    });
    items.sort(function (a, b) { return a.date && b.date ? (a.date < b.date ? -1 : 1) : (a.date ? -1 : (b.date ? 1 : 0)); }); // 近い順。日付なしは、最後
    const list = h('div');

    function alertChips(alerts) {
      return alerts.map(function (a) { return h('div', { class: 'palert ' + a.level }, (a.level === 'over' ? '⚠ ' : '・') + a.text); });
    }
    function badge(text, cls) { return h('span', { class: 'chip' + (cls ? ' ' + cls : '') }, text); }

    function card(s) {
      const bar = h('div', { class: 'pbar', title: s.stepsDone + ' / ' + s.stepsTotal }, [h('div', { class: 'pfill', style: 'width:' + Math.round(s.stepsDone / s.stepsTotal * 100) + '%' })]);
      const chips = [
        s.type === '相談会' ? badge('相談会', 'green') : null,
        s.upcoming ? badge('開催予定として案内中', 'on') : badge('案内はまだ出していません', 'off'),
        !s.questions && s.type !== '相談会' ? badge('理解度確認テスト未作成', 'off') : null,
      ].filter(Boolean);
      return h('div', { class: 'card scard' }, [
        h('div', { class: 'home-sem-top' }, [
          h('div', {}, [
            h('div', { class: 'sdate' }, s.date ? A.ymd(s.date) + (s.daysLeft != null ? '　あと ' + s.daysLeft + '日' : '') : '開催日が未定'),
            h('a', { class: 'stitle lnk', href: '#seminar/detail?id=' + encodeURIComponent(s.id) }, s.name),
          ]),
        ]),
        s.course ? h('div', { class: 'muted' }, s.course) : null,
        h('div', { class: 'schips' }, chips),
        h('div', { class: 'muted' }, s.teachers && s.teachers.length ? '担当講師：' + s.teachers.join('、') : '担当講師：未設定'),
        h('div', { class: 'muted' }, '進み具合 ' + s.stepsDone + ' / ' + s.stepsTotal),
        bar,
        h('div', {}, alertChips(s.alerts)),
      ]);
    }

    const nodes = [];
    const over = items.filter(function (s) { return s.alerts.length; }).length;
    nodes.push(h('p', { class: over ? 'err' : 'muted' }, over ? '確認が必要なセミナーが ' + over + ' 件あります。' : '今、確認が必要なセミナーはありません。'));
    // 連続講座ごとにまとめる（最初の開催日が近い順）。単発・日付未定は、最後
    const groups = {}, order = [];
    items.forEach(function (s) { const k = s.course || ''; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(s); });
    order.sort(function (a, b) { if (!a) return 1; if (!b) return -1; return (groups[a][0].date || '9') < (groups[b][0].date || '9') ? -1 : 1; });
    order.forEach(function (k) {
      if (k) { // 連続講座は、枠で囲んで、単発と見分けがつくようにする
        nodes.push(h('div', { class: 'series' }, [
          h('div', { class: 'ghead-row' }, [
            h('h2', { class: 'ghead' }, [h('span', { class: 'chip on' }, '連続講座'), ' ' + k + '（' + groups[k].length + '回）']),
            h('button', { type: 'button', class: 'mini', onclick: function () { A.go('seminar/edit', { addTo: groups[k][0].id }); } }, '＋ 回を追加'),
          ]),
        ].concat(groups[k].map(card))));
      } else {
        if (order.length > 1) nodes.push(h('h2', { class: 'ghead' }, '単発のセミナー・相談会・日付未定'));
        groups[k].forEach(function (s) { nodes.push(card(s)); });
      }
    });
    if (!items.length) nodes.push(h('p', {}, '開催前のセミナーは、まだ登録されていません。「新規登録・編集」から登録してください。'));
    list.replaceChildren.apply(list, nodes);
    A.needProgress = over; if (A.setBadges) A.setBadges();

    box.replaceChildren(
      h('p', { class: 'muted' }, (A.isAdmin ? '' : 'あなたが講師・チューターとして登録されているセミナー（連続の講座は、全部の回）が表示されます。') + 'これから開催するセミナーの一覧です。タイトルをクリックすると、そのセミナーの詳細（進行・担当・資料・申込者・テスト・基本情報）を見られます。チューターの不足と、資料の送付期限（開催の2週間前）は、ここと上のメニューの数字でお知らせします（メールやLINEは、自動では送りません）。開催が終わったセミナーは、「セミナー・アーカイブ」に移ります。'),
      list
    );
  }

  A.views['seminar/progress'] = view;
})();
