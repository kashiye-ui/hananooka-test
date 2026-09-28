// 相談: 一覧・進行状況（打診中／紹介済／要対応）と、先生への打診し直し・同席の依頼
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  const ERRORS = {
    forbidden: '権限がありません。',
    not_found: '相談が見つかりませんでした。',
    in_hearing: 'お客様が、まだ質問に答えている途中です。',
    closed: '終了した相談です。「要対応に戻す」から再開できます。',
    already_assigned: '担当がすでに決まっています。',
    teacher_not_found: '先生が見つかりませんでした。',
    not_linked: 'この先生は、まだLINE連携していないので、打診できません。',
    send_failed: '先生のLINEに届きませんでした（ブロックの可能性があります）。',
    no_candidate: '打診できる先生がいません（全員辞退・未連携など）。先生を選んで打診してください。',
    no_primary: '担当の先生が決まってから、同席を依頼できます。',
    same_as_primary: '担当の先生と同じ方は選べません。',
  };
  const STATE_CLASS = { '打診中': 'on', '紹介済': 'green', '要対応': 'warn', '終了': 'off', 'ヒアリング中': 'off' };
  const RESULT_LABEL = { '打診': '返事待ち', '受諾': '受けた', '辞退': '断った', '未連携': 'LINE未連携', '送信失敗': '届かず', '取消': '取り消し', '担当変更': '担当を変更', '同席変更': '同席を変更', '該当なし': '名簿になし' };

  function ago(s) { return s ? s.slice(5, 16).replace('-', '/') : ''; }

  function histLine(label, hist) {
    if (!hist.length) return null;
    return h('div', { class: 'muted' }, label + '：' + hist.map(function (e) { return e.n + '（' + (RESULT_LABEL[e.r] || e.r) + '）'; }).join(' → '));
  }

  function teacherSelect(staff, opts) {
    const sel = h('select', { class: 'st csel' }, [h('option', { value: '' }, opts.auto)].concat(staff.filter(function (s) { return !opts.skip || opts.skip.indexOf(s.name) < 0; }).map(function (s) {
      return h('option', { value: s.name, disabled: s.linked ? null : '' }, s.name + '（' + s.kubun + (s.linked ? '' : '・LINE未連携') + '）');
    })));
    return sel;
  }

  async function listView(box) {
    const res = await api('adminListConsults', {});
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const filter = h('select', {}, ['すべて', '要対応', '打診中', '紹介済', '終了'].map(function (s) { return h('option', { value: s }, s); }));
    const list = h('div');

    async function act(btn, action, payload, okText) {
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = '処理中…';
      try {
        const r = await api(action, payload);
        if (!r.ok) { alert(ERRORS[r.error] || '処理できませんでした。'); btn.disabled = false; btn.textContent = orig; return; }
        alert(okText(r));
        location.reload();
      } catch (e) { alert('通信エラーです。もう一度お試しください。'); btn.disabled = false; btn.textContent = orig; }
    }

    function card(c) {
      const acts = [];
      if (c.state !== 'ヒアリング中' && c.state !== '終了') {
        const sel = teacherSelect(res.staff, { auto: '自動で選ぶ' });
        const primaryDone = c.state === '紹介済';
        const label = primaryDone ? '担当を変える' : (c.offered ? '別の先生に打診し直す' : '打診する');
        const btn = h('button', { type: 'button', class: 'mini', onclick: function () {
          const who = sel.value || '自動で選んだ先生';
          if (primaryDone && !confirm('担当を' + (c.assigned || '') + '先生から外して、' + who + 'に打診します。\nお客様への連絡は、自動では行いません。よろしいですか？')) return;
          if (!primaryDone && c.offered && !confirm(c.offered + '先生への打診を取り消して、' + who + 'に打診します。よろしいですか？')) return;
          act(btn, 'adminOfferConsult', { id: c.id, teacher: sel.value, force: primaryDone }, function (r) { return r.teacher + '先生に打診しました。'; });
        } }, label);
        acts.push(h('div', { class: 'sacts' }, [sel, btn]));
      }
      if (c.state === '紹介済') {
        const sel = teacherSelect(res.staff, { auto: '自動でベテランを選ぶ', skip: [c.assigned] });
        const btn = h('button', { type: 'button', class: 'mini', onclick: function () {
          act(btn, 'adminOfferCo', { id: c.id, teacher: sel.value }, function (r) { return r.teacher + '先生に、同席を打診しました。'; });
        } }, c.co ? '同席を変える' : '同席を依頼する');
        acts.push(h('div', { class: 'sacts' }, [sel, btn]));
      }
      if (c.state !== 'ヒアリング中') {
        const closing = c.state !== '終了';
        const btn = h('button', { type: 'button', class: 'mini' + (closing ? ' danger' : ''), onclick: function () {
          if (closing && !confirm('この相談を「終了」にします（打診中のものは取り消されます）。よろしいですか？')) return;
          act(btn, 'adminSetConsultState', { id: c.id, state: closing ? '終了' : '要対応' }, function () { return closing ? '終了にしました。' : '要対応に戻しました。'; });
        } }, closing ? '終了にする' : '要対応に戻す');
        acts.push(h('div', { class: 'sacts' }, [btn]));
      }

      return h('div', { class: 'card', 'data-state': c.state }, [
        h('div', { class: 'thead' }, [
          h('strong', {}, c.name + ' さん'),
          h('span', { class: 'chip ' + (STATE_CLASS[c.state] || 'off') }, c.state),
        ]),
        h('div', { class: 'muted' }, ago(c.at) + '　' + (c.category || 'カテゴリー未選択') + (c.seminar ? '　／　' + c.seminar : '')),
        c.memo ? h('p', { style: 'white-space:pre-wrap;margin:8px 0' }, c.memo) : null,
        h('div', { class: 'muted' }, 'ご希望の先生：' + (c.want || '未選択') + (c.contact ? '　／　ご連絡先：' + c.contact : '')),
        h('div', {}, [
          c.assigned ? h('span', { class: 'chip green' }, '担当：' + c.assigned + '先生') : null,
          c.offered ? h('span', { class: 'chip on' }, '打診中：' + c.offered + '先生') : null,
          c.co ? h('span', { class: 'chip green' }, '同席：' + c.co + '先生') : null,
          c.coOffered ? h('span', { class: 'chip on' }, '同席を打診中：' + c.coOffered + '先生') : null,
        ]),
        histLine('打診の経過', c.hist),
        histLine('同席の経過', c.coHist),
      ].concat(acts));
    }

    function draw() {
      const rows = res.consults.filter(function (c) { return filter.value === 'すべて' || c.state === filter.value; });
      // 対応が必要なものを先に
      const rank = { '要対応': 0, '打診中': 1, 'ヒアリング中': 2, '紹介済': 3, '終了': 4 };
      rows.sort(function (a, b) { return (rank[a.state] - rank[b.state]) || (a.at < b.at ? 1 : -1); });
      list.replaceChildren.apply(list, rows.length ? rows.map(card) : [h('p', {}, res.consults.length ? '該当する相談がありません。' : 'まだ相談はありません。')]);
    }
    filter.addEventListener('change', draw);
    draw();

    const need = res.consults.filter(function (c) { return c.state === '要対応'; }).length;
    box.replaceChildren(
      h('p', { class: 'muted' }, 'LINEの「相談」の受付から、先生への打診・紹介までの進み具合です。先生が受けると、お客様に紹介メッセージが自動で届きます。' +
        '全員が辞退したり、打診が届かなかったときは「要対応」になります。先生を選んで打診し直してください。'),
      need ? h('p', { class: 'err' }, '要対応の相談が ' + need + ' 件あります。') : null,
      h('label', { class: 'field' }, [h('span', {}, '状態で絞り込み'), filter]),
      list
    );
  }

  A.views['consult/list'] = listView;
})();
