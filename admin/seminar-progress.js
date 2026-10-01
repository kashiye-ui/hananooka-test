// 進行状況: 開催前のセミナーが、運営の流れ（概要決定→募集→LINEグループ→打ち合わせ→担当確定→資料作成→資料送付→当日）の、どこまで進んだか。
// チューターの不足と、資料の送付期限（開催の2週間前）を知らせる（知らせるだけ。メールやLINEは自動では送らない）
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  function today() { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 10); }

  async function view(box, params) {
    const res = await api('adminListProgress', {});
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const list = h('div');
    let openId = (params && params.id) || '';

    function alertChips(alerts) {
      return alerts.map(function (a) { return h('div', { class: 'palert ' + a.level }, (a.level === 'over' ? '⚠ ' : '・') + a.text); });
    }

    function card(s) {
      const bar = h('div', { class: 'pbar', title: s.stepsDone + ' / ' + s.stepsTotal }, [h('div', { class: 'pfill', style: 'width:' + Math.round(s.stepsDone / s.stepsTotal * 100) + '%' })]);
      const detail = h('div');
      const c = h('div', { class: 'card scard' }, [
        h('div', { class: 'sdate' }, A.ymd(s.date) + '　あと ' + s.daysLeft + '日'),
        h('div', { class: 'stitle' }, s.name),
        h('div', { class: 'muted' }, '進み具合 ' + s.stepsDone + ' / ' + s.stepsTotal),
        bar,
        h('div', {}, alertChips(s.alerts)),
        h('div', { class: 'sacts' }, [h('button', { type: 'button', class: 'mini', onclick: function () { toggle(); } }, '進行を開く・記録する')]),
        detail,
      ]);
      let opened = false;
      async function toggle() {
        if (opened) { detail.replaceChildren(); opened = false; return; }
        opened = true;
        detail.replaceChildren(h('p', { class: 'muted' }, '読み込み中…'));
        const g = await api('adminGetProgress', { seminarId: s.id });
        if (!g.ok) { detail.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。')); return; }
        detail.replaceChildren(editor(s, g, function (fresh) { Object.assign(s, fresh); draw(); }));
      }
      if (openId === s.id) { openId = ''; setTimeout(toggle, 0); }
      return c;
    }

    function editor(s, g, onSaved) {
      const msg = h('p', { class: 'err' });
      const done = Object.assign({}, g.done);
      const steps = g.steps.map(function (st) {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!done[st.key];
        const when = h('span', { class: 'muted' }, done[st.key] ? '（' + A.ymd(done[st.key]) + '）' : '');
        cb.addEventListener('change', function () {
          if (cb.checked) done[st.key] = today(); else delete done[st.key];
          when.textContent = done[st.key] ? '（' + A.ymd(done[st.key]) + '）' : '';
        });
        const extra = st.key === 'sent' ? h('span', { class: 'muted' }, '　期限：' + (g.materialsDue ? A.ymd(g.materialsDue) : '開催日が未設定') + '（開催の2週間前）') : null;
        return h('label', { class: 'pstep' }, [cb, ' ' + st.label + ' ', when, extra]);
      });
      const tutorSel = {};
      g.tutors.forEach(function (n) { tutorSel[n] = true; });
      const tutorBoxes = g.teachers.length ? g.teachers.map(function (n) {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!tutorSel[n];
        cb.addEventListener('change', function () { tutorSel[n] = cb.checked; });
        return h('label', { class: 'pstep' }, [cb, ' ' + n]);
      }) : [h('p', { class: 'muted' }, 'このセミナーには、まだ担当の先生が登録されていません。「新規登録・編集」で、登壇講師・チューターを選んでください。')];
      const need = h('input', { type: 'number', min: '0', max: '20', value: g.tutorNeed || '', placeholder: '空欄＝確認しない', style: 'width:9em' });
      const folder = h('input', { type: 'url', value: g.folderUrl || '', placeholder: 'https://www.dropbox.com/…（レジュメ・資料のフォルダの共有リンク）' });
      const memo = h('textarea', { rows: '2', maxlength: '1000', placeholder: '打ち合わせの日程・申し送りなど' }, g.memo || '');
      const open = h('a', { href: g.folderUrl || '#', target: '_blank', rel: 'noopener', style: g.folderUrl ? '' : 'display:none' }, '資料フォルダを開く');
      folder.addEventListener('input', function () { open.style.display = /^https:\/\//.test(folder.value.trim()) ? '' : 'none'; open.href = folder.value.trim(); });
      const save = h('button', { type: 'button', class: 'btn', onclick: async function () {
        msg.className = 'err'; msg.textContent = '';
        save.disabled = true;
        const r = await api('adminSaveProgress', {
          seminarId: s.id, done: done, tutors: Object.keys(tutorSel).filter(function (k) { return tutorSel[k]; }),
          tutorNeed: need.value, folderUrl: folder.value.trim(), memo: memo.value,
        });
        save.disabled = false;
        if (!r.ok) { msg.textContent = r.error === 'invalid_url' ? '資料フォルダのリンクは、https:// で始まるものを入れてください。' : '保存できませんでした。'; return; }
        const l = await api('adminListProgress', {});
        const fresh = l.ok ? l.seminars.filter(function (x) { return x.id === s.id; })[0] : null;
        if (fresh) onSaved(fresh);
        else { msg.className = 'muted'; msg.textContent = '保存しました。'; }
      } }, 'この内容で保存');
      return h('div', { class: 'pdetail' }, [
        h('h3', {}, '運営の流れ'), h('div', {}, steps),
        h('h3', {}, 'チューター'),
        h('p', { class: 'muted' }, '担当の先生のうち、チューターを務める方にチェックを入れます（チェックのない方は、講義の担当）。'),
        h('div', {}, tutorBoxes),
        h('div', { class: 'field' }, [h('label', {}, '必要なチューターの人数'), need]),
        h('div', { class: 'field' }, [h('label', {}, '資料の置き場所（Dropboxのリンクなど）'), folder, open]),
        h('div', { class: 'field' }, [h('label', {}, 'メモ'), memo]),
        save, msg,
      ]);
    }

    function draw() {
      const nodes = [];
      const over = res.seminars.filter(function (s) { return s.alerts.length; }).length;
      nodes.push(h('p', { class: over ? 'err' : 'muted' }, over ? '確認が必要な回が ' + over + ' 件あります。' : '今、確認が必要な回はありません。'));
      res.seminars.forEach(function (s) { nodes.push(card(s)); });
      if (!res.seminars.length) nodes.push(h('p', {}, '開催日が先のセミナーは、まだ登録されていません。'));
      list.replaceChildren.apply(list, nodes);
      A.needProgress = over; if (A.setBadges) A.setBadges();
    }
    draw();
    box.replaceChildren(
      h('p', { class: 'muted' }, '開催前のセミナーの、準備の進み具合です。チューターの不足と、資料の送付期限（開催の2週間前）を、ここと上のメニューの数字でお知らせします（メールやLINEは、自動では送りません）。'),
      list
    );
  }

  A.views['seminar/progress'] = view;
})();
