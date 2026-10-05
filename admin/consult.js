// 相談: 一覧・進行状況（確認待ち／打診中／紹介済／要対応）と、自動で選んだ先生の確認、先生への打診し直し・同席の依頼
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
    not_pending: 'この相談は、すでに確認済みです（ほかの管理者の方が操作した可能性があります）。',
  };
  const STATE_CLASS = { '確認待ち': 'warn', '打診中': 'on', '紹介済': 'green', '要対応': 'warn', '終了': 'off', 'ヒアリング中': 'off' };
  const STATE_LABEL = { '終了': '対応済み' }; // 内部の状態名（相談シートの「状態」）は変えず、画面表示だけ「対応済み」にする
  const RESULT_LABEL = { '打診': '返事待ち', '受諾': '受けた', '辞退': '断った', '未連携': 'LINE未連携', '送信失敗': '届かず', '取消': '取り消し', '提案': '確認中', '見送り': '見送り', '担当変更': '担当を変更', '同席変更': '同席を変更', '該当なし': '名簿になし' };

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
    // 前回の一覧があれば、すぐ出して、最新が届いたら、静かに差し替える
    const res = await A.apiSwr('adminListConsults', {}, function (fresh) { res.consults = fresh.consults; res.staff = fresh.staff || res.staff; draw(); });
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const filter = h('select', {}, ['すべて', '要対応', '確認待ち', '打診中', '紹介済', '終了'].map(function (s) { return h('option', { value: s }, STATE_LABEL[s] || s); }));
    const list = h('div');

    const toast = h('p', { class: 'muted', style: 'font-weight:bold;min-height:1.4em' });
    let toastTimer = null;
    function say(text) { toast.textContent = text; clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.textContent = ''; }, 4000); }

    // 一覧だけを取り直して描き直す（ページ全体の読み込みはしない）
    async function refresh() {
      try {
        const fresh = await api('adminListConsults', {});
        if (fresh.ok) { res.consults = fresh.consults; res.staff = fresh.staff || res.staff; }
      } catch (e) { /* 取れなくても、いまの表示を保つ */ }
      draw();
    }

    async function act(btn, action, payload, okText) {
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = '処理中…';
      try {
        const r = await api(action, payload);
        if (!r.ok) { alert(ERRORS[r.error] || '処理できませんでした。'); btn.disabled = false; btn.textContent = orig; return; }
        say(okText(r));
        await refresh();
      } catch (e) { alert('通信エラーです。もう一度お試しください。'); btn.disabled = false; btn.textContent = orig; }
    }

    // 一覧の「対応済み」チェック。押した相談だけをその場で更新する（ページの読み込みはしない）
    async function toggleDone(c, box) {
      const closing = box.checked;
      if (closing && (c.offered || c.coOffered) && !confirm('この相談を「対応済み」にします。打診中の先生への打診は取り消されます。よろしいですか？')) { box.checked = false; return; }
      box.disabled = true;
      try {
        const r = await api('adminSetConsultState', { id: c.id, state: closing ? '終了' : '要対応' });
        if (!r.ok) { alert(ERRORS[r.error] || '処理できませんでした。'); box.checked = !closing; box.disabled = false; return; }
        c.state = closing ? '終了' : '要対応';
        if (closing) { c.offered = ''; c.coOffered = ''; }
        say(closing ? '対応済みにしました。' : '要対応に戻しました。');
        draw();
      } catch (e) { alert('通信エラーです。もう一度お試しください。'); box.checked = !closing; box.disabled = false; }
    }

    function doneCheck(c) {
      const box = h('input', { type: 'checkbox' });
      box.checked = c.state === '終了';
      box.addEventListener('change', function () { toggleDone(c, box); });
      return h('label', { class: 'arow-top', style: 'margin:6px 0' }, [box, h('span', {}, '対応済み')]);
    }

    function card(c) {
      const acts = [];
      if (A.isAdmin && c.state !== 'ヒアリング中' && c.state !== '終了') {
        const sel = teacherSelect(res.staff, { auto: '自動で選ぶ' });
        const primaryDone = c.state === '紹介済';
        const label = primaryDone ? '担当を変える' : (c.offered ? '別の先生に打診し直す' : '打診する');
        const btn = h('button', { type: 'button', class: 'mini', onclick: function () {
          const who = sel.value || '自動で選んだ先生';
          if (primaryDone && !confirm('担当を' + (c.assigned || '') + '先生から外して、' + who + 'に打診します。\nお客様への連絡は、自動では行いません。よろしいですか？')) return;
          if (!primaryDone && c.offered && !confirm(c.offered + '先生への打診を取り消して、' + who + 'に打診します。よろしいですか？')) return;
          act(btn, 'adminOfferConsult', { id: c.id, teacher: sel.value, force: primaryDone }, function (r) { return r.proposed ? r.proposed + '先生を候補にしました。下の「確認」で、打診してよいか決めてください。' : r.teacher + '先生に打診しました。'; });
        } }, label);
        acts.push(h('div', { class: 'sacts' }, [sel, btn]));
      }
      if (A.isAdmin && c.state === '確認待ち' && c.proposed) {
        const okBtn = h('button', { type: 'button', class: 'mini', onclick: function () {
          act(okBtn, 'adminConfirmProposal', { id: c.id, approve: true }, function (r) { return r.proposed ? r.skipped + '先生に届かなかったため、次の候補（' + r.proposed + '先生）を確認に出しました。' : r.teacher + '先生に打診しました。'; });
        } }, c.proposed + '先生に打診する');
        const noBtn = h('button', { type: 'button', class: 'mini', onclick: function () {
          act(noBtn, 'adminConfirmProposal', { id: c.id, approve: false }, function (r) { return '次の候補（' + r.proposed + '先生）を確認に出しました。'; });
        } }, '別の先生を提案する');
        acts.push(h('div', { class: 'card', style: 'background:#fdf0f5' }, [
          h('div', {}, [h('strong', {}, c.proposed + '先生でいいですか？'), h('span', { class: 'muted' }, '　自動で選んだ候補です。確認すると、先生に打診が届きます。')]),
          h('div', { class: 'sacts' }, [okBtn, noBtn]),
        ]));
      }
      if (A.isAdmin && c.state === '紹介済') {
        const sel = teacherSelect(res.staff, { auto: '自動でベテランを選ぶ', skip: [c.assigned] });
        const btn = h('button', { type: 'button', class: 'mini', onclick: function () {
          act(btn, 'adminOfferCo', { id: c.id, teacher: sel.value }, function (r) { return r.teacher + '先生に、同席を打診しました。'; });
        } }, c.co ? '同席を変える' : '同席を依頼する');
        acts.push(h('div', { class: 'sacts' }, [sel, btn]));
      }
      if (A.isAdmin) {
        const delBtn = h('button', { type: 'button', class: 'mini danger', onclick: async function () {
          if (!confirm((c.name || 'この方') + 'さんの相談を削除します。元に戻せません。よろしいですか？（テストで入力したものの整理用です）')) return;
          delBtn.disabled = true; delBtn.textContent = '削除中…';
          try {
            const r = await api('adminDeleteConsult', { id: c.id });
            if (!r.ok) { alert('削除できませんでした。'); delBtn.disabled = false; delBtn.textContent = '削除'; return; }
            say('削除しました。');
            await refresh();
          } catch (e) { alert('通信エラーです。もう一度お試しください。'); delBtn.disabled = false; delBtn.textContent = '削除'; }
        } }, '削除');
        acts.push(h('div', { class: 'sacts' }, [delBtn]));
      }

      return h('div', { class: 'card', 'data-state': c.state }, [
        h('div', { class: 'thead' }, [
          h('strong', {}, c.name + ' さん'),
          h('span', { class: 'chip ' + (STATE_CLASS[c.state] || 'off') }, STATE_LABEL[c.state] || c.state),
        ]),
        A.isAdmin && c.state !== 'ヒアリング中' ? doneCheck(c) : null,
        h('div', { class: 'muted' }, ago(c.at) + '　' + (c.category || 'カテゴリー未選択') + (c.seminar ? '　／　' + c.seminar : '')),
        c.memo ? h('p', { style: 'white-space:pre-wrap;margin:8px 0' }, c.memo) : null,
        h('div', { class: 'muted' }, 'ご希望の先生：' + (c.want || '未選択') + (c.contact ? '　／　ご連絡先：' + c.contact : (A.isAdmin ? '' : '　／　ご連絡先は、担当・同席の先生にだけ表示されます'))),
        h('div', {}, [
          c.assigned ? h('span', { class: 'chip green' }, '担当：' + c.assigned + '先生') : null,
          c.proposed ? h('span', { class: 'chip warn' }, '確認待ち：' + c.proposed + '先生') : null,
          c.offered ? h('span', { class: 'chip on' }, '打診中：' + c.offered + '先生') : null,
          c.co ? h('span', { class: 'chip green' }, '同席：' + c.co + '先生') : null,
          c.coOffered ? h('span', { class: 'chip on' }, '同席を打診中：' + c.coOffered + '先生') : null,
        ]),
        histLine('打診の経過', c.hist),
        histLine('同席の経過', c.coHist),
      ].concat(acts));
    }

    let draw = function () {
      const rows = res.consults.filter(function (c) { return filter.value === 'すべて' || c.state === filter.value; });
      // 対応が必要なものを先に
      const rank = { '確認待ち': 0, '要対応': 0, '打診中': 1, 'ヒアリング中': 2, '紹介済': 3, '終了': 4 };
      rows.sort(function (a, b) { return (rank[a.state] - rank[b.state]) || (a.at < b.at ? 1 : -1); });
      list.replaceChildren.apply(list, rows.length ? rows.map(card) : [h('p', {}, res.consults.length ? '該当する相談がありません。' : 'まだ相談はありません。')]);
    };
    filter.addEventListener('change', function () { draw(); });

    const needBox = h('div');
    function updateNeed() {
      const need = res.consults.filter(function (c) { return c.state === '要対応' || c.state === '確認待ち'; }).length;
      needBox.replaceChildren.apply(needBox, need ? [h('p', {}, [h('span', { class: 'chip warn' }, '要対応・確認待ち ' + need + '件'), ' あります。'])] : []);
      A.needConsult = need;
      if (A.setBadges) A.setBadges();
    }
    const drawList = draw;
    draw = function () { drawList(); updateNeed(); };
    draw();
    box.replaceChildren(
      h('p', { class: 'muted' }, (A.isAdmin ? '' : '（閲覧のみです）') + 'LINEの「相談」の受付から、先生への打診・紹介までの進み具合です。先生が受けると、お客様に紹介メッセージが自動で届きます。' +
        '先生を自動で選んだときは、先に管理者に「〇〇先生でいいですか？」と確認します（LINEにも届きます。お客様の指名があるときは、確認なしで打診します）。全員が辞退したり、打診が届かなかったときは「要対応」になります。先生を選んで打診し直してください。'),
      needBox, toast,
      h('label', { class: 'field' }, [h('span', {}, '状態で絞り込み'), filter]),
      list
    );
  }

  A.views['consult/list'] = listView;
})();
