// ホーム: ログインして最初に見る画面（先生ごとのダッシュボード）。
// 「次にやること」（プロフィールの入力）、「担当セミナー」（進み具合）を、1画面にまとめる。管理者には、「確認が必要なこと」も出す。
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h;

  // プロフィールの「要確認」を、ご本人向けの、やさしい言い方に直す
  const TASK_TEXT = {
    photo: '顔写真を登録しましょう', card: '名刺をアップロードしましょう（写真でも、発注データでも大丈夫です）',
    cat_none: '受けられるカテゴリーを選びましょう', skill_none: '得意分野を選びましょう（3つまで）',
    skill_many: '得意分野を、3つ以内にしましょう', skill_outside: '得意分野は、受けられるカテゴリーの中から選びましょう',
    cat_unknown: 'カテゴリー名が新しくなりました。選び直しましょう', cat_renamed: 'カテゴリー名が新しくなりました。内容を確認してください',
    comment_none: 'ひとことを入力しましょう（60字まで）', comment_long: 'ひとことを、60字以内に短くしましょう',
  };

  function section(title, kids, extra) {
    return h('div', { class: 'card home-sec' }, [h('div', { class: 'home-head' }, [h('h2', {}, title), extra || null])].concat(kids));
  }

  function link(label, route, params) {
    return h('button', { type: 'button', class: 'mini', onclick: function () { A.go(route, params); } }, label);
  }

  async function view(box) {
    const res = await A.apiSwr('adminGetHome', {}, function (fresh) { Object.keys(res).forEach(function (k) { delete res[k]; }); Object.assign(res, fresh); draw(); });
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const wrap = h('div', { class: 'home' });

    function seminarCard(s) {
      const bar = h('div', { class: 'pbar', title: s.stepsDone + ' / ' + s.stepsTotal }, [h('div', { class: 'pfill', style: 'width:' + Math.round(s.stepsDone / s.stepsTotal * 100) + '%' })]);
      return h('div', { class: 'home-sem' }, [
        h('div', { class: 'home-sem-top' }, [
          h('div', {}, [h('div', { class: 'sdate' }, A.ymd(s.date) + '　あと ' + s.daysLeft + '日'), h('a', { class: 'stitle lnk', href: '#seminar/detail?id=' + encodeURIComponent(s.id) }, s.name)]),
        ]),
        h('div', { class: 'muted' }, '準備の進み具合 ' + s.stepsDone + ' / ' + s.stepsTotal),
        bar,
        h('div', {}, (s.alerts || []).map(function (a) { return h('div', { class: 'palert ' + a.level }, (a.level === 'over' ? '⚠ ' : '・') + a.text); })),
      ]);
    }

    function draw() {
      const nodes = [h('h2', { class: 'hello' }, res.name + 'さん、こんにちは')];

      // 管理者だけ: 確認が必要なこと
      if (res.isAdmin && res.counts) {
        const c = res.counts;
        const rows = [
          [c.needConsult, '相談の確認・対応が必要です', 'consult/list'], [c.needProfile, '先生からのプロフィールの申請があります', 'members/pending'],
          [c.needProgress, '準備の確認が必要なセミナーがあります', 'seminar/progress'], [c.needMembers, 'プロフィールの確認が必要なメンバーがいます', 'members/list'],
        ].filter(function (r) { return r[0] > 0; }).map(function (r) {
          return h('div', { class: 'task' }, [h('div', {}, [h('span', { class: 'chip warn' }, String(r[0]) + '件'), ' ' + r[1]]), link('見る', r[2])]);
        });
        nodes.push(section('確認が必要なこと', rows.length ? rows : [h('p', { class: 'muted' }, '今、確認が必要なことは、ありません。')]));
      }

      // 次にやること（ご自分のプロフィール）
      const tasks = (res.myAlerts || []).filter(function (a) { return TASK_TEXT[a.key]; }).map(function (a) {
        return h('div', { class: 'task' }, [h('div', {}, TASK_TEXT[a.key]), h('button', { type: 'button', class: 'mini', onclick: function () { A.go('members/edit', { id: res.memberId }); } }, '入力する')]);
      });
      nodes.push(section('次にやること', tasks.length ? tasks : [h('p', { class: 'muted' }, '✓ プロフィールは、そろっています。')]));

      // 担当セミナー（連続講座ごとにまとめる）
      const sems = (res.seminars || []).slice();
      const groups = {}, order = [];
      sems.forEach(function (s) { const k = s.course || ''; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(s); });
      const semNodes = [];
      order.forEach(function (k) {
        if (k) semNodes.push(h('div', { class: 'home-course' }, k + '（' + groups[k].length + '回）'));
        groups[k].forEach(function (s) { semNodes.push(seminarCard(s)); });
      });
      (res.drafts || []).forEach(function (d) {
        semNodes.push(h('div', { class: 'home-sem' }, [h('div', { class: 'home-sem-top' }, [
          h('div', {}, [h('div', { class: 'sdate' }, '開催日が未定（作りこみ中）'), h('a', { class: 'stitle lnk', href: '#seminar/detail?id=' + encodeURIComponent(d.id) }, d.name)]),
        ])]));
      });
      nodes.push(section(res.isAdmin ? '開催予定のセミナー' : '担当セミナー',
        semNodes.length ? semNodes : [h('p', { class: 'muted' }, 'これから開催するセミナーは、まだありません。')],
        link('＋ 新しいセミナーを登録', 'seminar/edit')));

      // その他
      const others = [link('セミナー・アーカイブ', 'seminar/archive'), link('メンバー一覧', 'members/list'), link('相談を見る', 'consult/list')];
      if (res.isAdmin) others.push(link('メッセージ', 'messages/list'));
      nodes.push(section('その他', [h('div', { class: 'home-links' }, others)]));

      wrap.replaceChildren.apply(wrap, nodes);
      if (res.counts && A.setBadges) { A.needConsult = res.counts.needConsult; A.needProfile = res.counts.needProfile; A.needProgress = res.counts.needProgress; A.needMembers = res.counts.needMembers; A.setBadges(); }
    }
    draw();
    box.replaceChildren(wrap);
  }

  A.views['home'] = view;
})();
