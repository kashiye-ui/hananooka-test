// セミナーの詳細ページ: 1つのセミナーに関することを、タブにまとめて開く。
//   進行／担当・チューター／資料（Dropbox）／申込者（管理者のみ）／テスト／基本情報／その他（案内・削除など）
// 進行・チューター・資料の記録は、入力すると自動で保存する。基本情報・テスト・担当講師は、編集フォーム（seminar-edit.js）をそのまま使う（こちらも自動保存）。
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  function today() { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 10); }
  function badge(text, cls) { return h('span', { class: 'chip' + (cls ? ' ' + cls : '') }, text); }

  async function view(box, params) {
    const id = (params && params.id) || '';
    if (!id) return A.go('seminar/progress');
    const out = await Promise.all([api('adminListProgress', {}), api('adminListArchive', {}), api('adminGetProgress', { seminarId: id })]);
    const prog = out[0], arc = out[1], g = out[2];
    if (!prog.ok || !arc.ok || !g.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const found = arc.seminars.filter(function (x) { return x.id === id; })[0];
    if (!found) return box.replaceChildren(h('p', { class: 'err' }, 'このセミナーが見つかりませんでした（削除されたか、閲覧できないセミナーです）。'));
    const pr = prog.seminars.filter(function (x) { return x.id === id; })[0] || {};
    const s = Object.assign({ stepsDone: 0, stepsTotal: prog.steps.length, alerts: [], daysLeft: null }, found, pr);
    const msg = h('p', { class: 'err' });

    // ---- 見出し（日付・名前・進み具合・アラート） ----
    const head = h('div', { class: 'card scard' });
    function drawHead() {
      const bar = h('div', { class: 'pbar', title: s.stepsDone + ' / ' + s.stepsTotal }, [h('div', { class: 'pfill', style: 'width:' + Math.round(s.stepsDone / s.stepsTotal * 100) + '%' })]);
      head.replaceChildren.apply(head, [
        h('div', { class: 'sdate' }, s.date ? A.ymd(s.date) + (s.daysLeft != null && s.daysLeft >= 0 ? '　あと ' + s.daysLeft + '日' : '') : '開催日が未定'),
        h('div', { class: 'stitle' }, s.name),
        s.course ? h('div', { class: 'muted' }, s.course) : null,
        h('div', { class: 'schips' }, [
          s.type === '相談会' ? badge('相談会', 'green') : null,
          s.upcoming ? badge('開催予定として案内中', 'on') : badge('案内はまだ出していません', 'off'),
          !s.questions && s.type !== '相談会' ? badge('理解度確認テスト未作成', 'off') : null,
        ].filter(Boolean)),
        h('div', { class: 'muted' }, '準備の進み具合 ' + s.stepsDone + ' / ' + s.stepsTotal),
        bar,
        h('div', {}, (s.alerts || []).map(function (a) { return h('div', { class: 'palert ' + a.level }, (a.level === 'over' ? '⚠ ' : '・') + a.text); })),
      ].filter(Boolean));
    }
    drawHead();

    // ---- 進行・チューター・資料の記録（入力すると、自動で保存する） ----
    const done = Object.assign({}, g.done);
    const steps = g.steps.map(function (st) {
      const cb = h('input', { type: 'checkbox' });
      const auto = st.key === 'assign' && g.autoAssign && !done[st.key]; // 登録されている担当者がそろっていれば、自動で「確定」とみなす
      cb.checked = !!done[st.key] || auto;
      if (auto) cb.disabled = true;
      const when = h('span', { class: 'muted' }, done[st.key] ? '（' + A.ymd(done[st.key]) + '）' : '');
      cb.addEventListener('change', function () {
        if (cb.checked) done[st.key] = today(); else delete done[st.key];
        when.textContent = done[st.key] ? '（' + A.ymd(done[st.key]) + '）' : '';
      });
      const extra = st.key === 'sent' ? h('span', { class: 'muted' }, '　期限：' + (g.materialsDue ? A.ymd(g.materialsDue) : '開催日が未設定') + '（開催の2週間前）') : null;
      return h('label', { class: 'pstep' }, [cb, ' ' + st.label + ' ', when, auto ? h('span', { class: 'muted' }, '（登録されている担当者・チューターが、そろっています）') : null, extra]);
    });
    // 画面では「講師にチェックを入れる」（チェックのない方は、チューター）。保存するのは、これまでどおり、チューターの名前の一覧。
    // 進行の記録を、まだ一度も保存していないセミナーは、全員チェックなしから始める（講師になる方に、チェックを入れる）。
    // 保存済みのセミナーは、チューター以外の方に、チェックが付いた状態から始まる
    const tutorSel = {};
    g.tutors.forEach(function (n) { tutorSel[n] = true; });
    const lecSel = {};
    if (g.saved) g.teachers.forEach(function (n) { if (!tutorSel[n]) lecSel[n] = true; });
    const tutorList = h('div');
    function drawTutorBoxes() {
      const boxes = g.teachers.length ? g.teachers.map(function (n) {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!lecSel[n];
        cb.addEventListener('change', function () {
          lecSel[n] = cb.checked;
          g.teachers.forEach(function (m) { tutorSel[m] = !lecSel[m]; }); // チェックのない方は、チューター
          if (contactPanel) drawCards(); // 名刺の並び（講師→チューター）も、変える
        });
        return h('label', { class: 'pstep' }, [cb, ' ' + n]);
      }) : [h('p', { class: 'muted' }, 'まだ担当の先生が登録されていません。下の「登壇・参加する講師」で選んでください。')];
      tutorList.replaceChildren.apply(tutorList, boxes);
    }
    drawTutorBoxes();
    // 「登壇・参加する講師」を選び直したら、この一覧も、すぐに変える（新しく加わった方は、チェックなし＝チューターから始まる）
    function onTeachersChanged(names) {
      g.teachers = names.slice();
      g.teachers.forEach(function (m) { tutorSel[m] = !lecSel[m]; });
      drawTutorBoxes();
      if (contactPanel) drawCards();
      touch(3500); // 担当の先生の保存（自動）が終わってから、チューターの記録を保存する
    }
    const need = h('input', { type: 'number', min: '0', max: '20', value: g.tutorNeed || '', placeholder: '空欄＝確認しない', style: 'width:9em' });
    const folder = h('input', { type: 'url', value: g.folderUrl || '', placeholder: 'https://www.dropbox.com/…（レジュメ・資料のフォルダの共有リンク）' });
    const memo = h('textarea', { rows: '3', maxlength: '1000', placeholder: '打ち合わせの日程・申し送りなど' }, g.memo || '');
    const open = h('a', { href: g.folderUrl || '#', target: '_blank', rel: 'noopener', style: g.folderUrl ? '' : 'display:none' }, '資料フォルダを開く');
    folder.addEventListener('input', function () { open.style.display = /^https:\/\//.test(folder.value.trim()) ? '' : 'none'; open.href = folder.value.trim(); });
    const dbPath = h('input', { type: 'text', value: g.dropboxPath || '', placeholder: '/花の丘セミナー資料/_ひな型' });

    // 自動保存（保存に失敗したときは、自動でやり直さない。二重に保存されないよう、「もう一度保存する」を押してもらう）
    const stat = h('p', { class: 'muted autosave' }, '入力すると、自動で保存されます');
    const retry = h('button', { type: 'button', class: 'mini', style: 'display:none' }, 'もう一度保存する');
    let timer = null, saving = false, dirty = false;
    function touch(ms) { dirty = true; stat.className = 'muted autosave'; stat.textContent = '…'; retry.style.display = 'none'; clearTimeout(timer); timer = setTimeout(flush, typeof ms === 'number' ? ms : 1200); }
    async function flush() {
      if (saving) { timer = setTimeout(flush, 500); return; }
      if (!dirty) return;
      dirty = false; saving = true;
      stat.className = 'muted autosave'; stat.textContent = '保存しています…';
      let r;
      try {
        r = await api('adminSaveProgress', {
          seminarId: id, done: done, tutors: Object.keys(tutorSel).filter(function (k) { return tutorSel[k]; }),
          tutorNeed: need.value, folderUrl: folder.value.trim(), memo: memo.value, dropboxPath: dbPath.value.trim(),
        });
      } catch (e) { r = { ok: false }; }
      saving = false;
      if (!r.ok) {
        dirty = true;
        stat.className = 'err autosave';
        stat.textContent = r.error === 'invalid_url' ? '資料フォルダのリンクは、https:// で始まるものを入れてください（まだ保存されていません）。' : (r.error === 'invalid_path' ? 'Dropboxのフォルダの場所は、「/」から書いてください（まだ保存されていません）。' : '保存できませんでした。');
        retry.style.display = '';
        return;
      }
      const d = new Date();
      stat.textContent = '保存しました ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      try { // 見出しの、進み具合とアラートも、新しくする
        const l = await api('adminListProgress', {});
        const fresh = l.ok ? l.seminars.filter(function (x) { return x.id === id; })[0] : null;
        if (fresh) { Object.assign(s, fresh); drawHead(); }
      } catch (e) { /* 見出しが古いままでも、保存はできている */ }
    }
    retry.addEventListener('click', function () { clearTimeout(timer); flush(); });

    // ---- Dropbox の資料フォルダ: フッターを調べる／フッターを変えたコピーを作る ----
    const dbDest = h('input', { type: 'text', value: '', placeholder: '/花の丘セミナー資料/（新しい講座）/第1回' });
    const dbOld = h('input', { type: 'text', placeholder: '今のフッターの文字（下の一覧から選べます）' });
    const dbNew = h('input', { type: 'text', value: g.name || '' });
    const dbOut = h('div');
    const dbErr = { dropbox_not_configured: 'Dropboxとの接続が、まだ設定されていません（管理者の設定が必要です）。', invalid_path: 'フォルダの場所が正しくありません。決められた資料フォルダの中の場所を、「/」から書いてください。', folder_not_found: 'そのフォルダが見つかりませんでした。', dest_exists: 'コピー先に、同じ名前のフォルダがすでにあります。別の名前にしてください。', dest_inside_src: 'コピー先は、元のフォルダの外にしてください。', copy_failed: 'フォルダをコピーできませんでした。', empty_text: '今のフッターの文字と、新しいフッターの文字の、両方を入れてください。', forbidden: '権限がありません。' };
    const resText = { changed: '書き換えました', no_match: '該当なし（そのままコピー）', too_large: '大きすぎるため、書き換えず、コピーのまま', download_failed: '読み込めず、コピーのまま', read_failed: '開けず、コピーのまま', upload_failed: '書き込めませんでした', skipped_limit: '1回の上限を超えたため、コピーのまま' };
    const fname = function (x) { return x.split('/').slice(-2).join('/'); };
    const scanBtn = h('button', { type: 'button', class: 'mini', onclick: async function () {
      dbOut.replaceChildren(h('p', { class: 'muted' }, '調べています…（ファイルが多いと、少しかかります）'));
      scanBtn.disabled = true;
      const r = await api('adminDropboxFooterScan', { seminarId: id, path: dbPath.value.trim() });
      scanBtn.disabled = false;
      if (!r.ok) { dbOut.replaceChildren(h('p', { class: 'err' }, dbErr[r.error] || '調べられませんでした。')); return; }
      const items = r.footers.length ? r.footers.map(function (f) {
        return h('div', {}, [h('button', { type: 'button', class: 'mini', onclick: function () { dbOld.value = f.text; } }, 'これを変える'), ' 「' + f.text + '」 ' + f.files + 'ファイル']);
      }) : [h('p', { class: 'muted' }, 'Word・PowerPointのフッターの文字は、見つかりませんでした。')];
      dbOut.replaceChildren.apply(dbOut, [h('p', { class: 'muted' }, 'Word・PowerPoint ' + r.files + ' ファイル中、' + r.scanned + ' ファイルを調べました。' + (r.tooMany ? '（多いため、先頭のぶんだけです）' : ''))].concat(items, r.unsupported.length ? [h('p', { class: 'err' }, '自動では書き換えられないファイル（PDF・Excelなど）：' + r.unsupported.map(fname).join('、') + '　→ 手作業で直してください。')] : []));
    } }, 'フッターを調べる');
    const applyBtn = h('button', { type: 'button', class: 'btn', onclick: async function () {
      if (!confirm('「' + dbPath.value.trim() + '」を、「' + dbDest.value.trim() + '」にコピーして、フッター「' + dbOld.value + '」→「' + dbNew.value + '」に書き換えます。元のフォルダは変わりません。よろしいですか？')) return;
      dbOut.replaceChildren(h('p', { class: 'muted' }, 'コピーして、書き換えています…（1分ほどかかることがあります）'));
      applyBtn.disabled = true;
      const r = await api('adminDropboxFooterApply', { seminarId: id, path: dbPath.value.trim(), destPath: dbDest.value.trim(), oldText: dbOld.value, newText: dbNew.value.trim() });
      applyBtn.disabled = false;
      if (!r.ok) { dbOut.replaceChildren(h('p', { class: 'err' }, dbErr[r.error] || '実行できませんでした。')); return; }
      const changed = r.results.filter(function (x) { return x.result === 'changed'; }).length;
      dbOut.replaceChildren.apply(dbOut, [h('p', {}, 'コピー先：' + r.destPath + '　（' + changed + ' ファイルのフッターを書き換えました）')].concat(
        r.results.map(function (x) { return h('div', { class: x.result === 'changed' || x.result === 'no_match' ? 'muted' : 'err' }, fname(x.path) + '：' + (resText[x.result] || x.result)); }),
        r.unsupported.length ? [h('p', { class: 'err' }, '自動では書き換えられないファイル（PDF・Excelなど）：' + r.unsupported.map(fname).join('、') + '　→ コピー先で、手作業で直してください。')] : []));
    } }, 'コピーして、フッターを書き換える');

    // ---- タブごとの中身 ----
    const panes = {
      progress: h('div', { class: 'card' }, [h('h2', {}, '運営の流れ'), h('div', {}, steps), h('div', { class: 'field' }, [h('label', {}, 'メモ'), memo])]),
      tutors: h('div', { class: 'card' }, [
        h('h2', {}, '講師・チューター'),
        h('p', { class: 'muted' }, '下の「登壇・参加する講師」で選んだ方（チューターも含みます）のうち、講師を務める方にチェックを入れます。チェックのない方は、チューターになります。'),
        tutorList,
        h('div', { class: 'field' }, [h('label', {}, '必要なチューターの人数'), need]),
      ]),
      materials: h('div', {}, [
        h('div', { class: 'card' }, [h('h2', {}, '資料の置き場所'), h('div', { class: 'field' }, [h('label', {}, 'Dropboxのリンクなど（レジュメ・資料のフォルダ）'), folder, open])]),
        h('div', { class: 'card' }, [
          h('h2', {}, '資料フォルダ（Dropbox）のフッター'),
          g.dropboxReady ? null : h('p', { class: 'err' }, 'Dropboxとの接続が、まだ設定されていません。設定後に使えます。'),
          h('div', { class: 'field' }, [h('label', {}, 'このセミナーの資料フォルダ（元にするフォルダ。ひな型など）'), dbPath, h('p', { class: 'muted' }, '入力すると、自動で保存され、次回から、この場所を覚えています。')]),
          h('p', {}, [scanBtn]), dbOut,
          h('div', { class: 'field' }, [h('label', {}, '今のフッターの文字'), dbOld]),
          h('div', { class: 'field' }, [h('label', {}, '新しいフッターの文字（初期値：このセミナーの名前）'), dbNew]),
          h('div', { class: 'field' }, [h('label', {}, 'コピー先のフォルダ（まだ無い場所。元のフォルダは、変わりません）'), dbDest]),
          h('p', {}, [applyBtn]),
        ]),
      ]),
      apps: h('div'),
      cards: h('div'),
      more: h('div'),
    };
    [panes.progress, panes.tutors, panes.materials].forEach(function (p) { p.addEventListener('input', touch); p.addEventListener('change', touch); });

    // 申込者（開いたときに、読み込む）
    let appsLoaded = false;
    function loadApps() {
      if (appsLoaded) return;
      appsLoaded = true;
      const p = A.applicantsPanel(id);
      panes.apps.replaceChildren(h('div', { class: 'card' }, [h('h2', {}, '申込者（' + s.applications + '）'), p.node]));
      p.load();
    }

    // 名刺タブ（管理者以外も、自分のセミナーなら使える）: このセミナーの講師・チューター（講師が先）の、配りもの
    //  ・連絡先シート（おすすめ）: 写真・名前・肩書き・事務所・住所・電話・メール・Webサイト・QR を、1人1枚のカードにして、A4に2×2で並べる（文字が大きく、読みやすい）
    //  ・名刺画像シート: 名刺の画像（表・裏）を、実寸で、A4に並べる（セミナー名・日時・会場のヘッダーと、「花の丘相続遺言サポート」のフッターつき）
    const normName = function (x) { return String(x || '').replace(/[\s　]/g, ''); };
    let contactPanel = null, cardsPanel = null, allMembers = null, cardsLoading = false, cardsMode = 'contact';
    function seminarMembers() { // 講師が先、そのあとチューター（チェックのある方が講師）
      const order = g.teachers.filter(function (n) { return lecSel[n]; }).concat(g.teachers.filter(function (n) { return !lecSel[n]; }));
      const byName = {};
      (allMembers || []).forEach(function (m) { byName[normName(m.name)] = m; });
      const all = order.map(function (n) { return byName[normName(n)]; }).filter(Boolean);
      return {
        all: all, withCard: all.filter(function (m) { return m.hasCard; }),
        noCard: order.filter(function (n) { const m = byName[normName(n)]; return !m || !m.hasCard; }),
      };
    }
    const cardsNote = h('p', { class: 'muted' });
    const cardsBody = h('div');
    const modeBar = h('div', { class: 'modebar' });
    function drawCards() {
      const c = seminarMembers();
      cardsNote.className = c.noCard.length && cardsMode === 'card' ? 'err' : 'muted';
      cardsNote.textContent = cardsMode === 'card' && c.noCard.length ? '名刺が保管されていない方がいます（印刷されません）：' + c.noCard.join('、') : '';
      if (cardsPanel) cardsPanel.setMembers(c.withCard);
      if (contactPanel) contactPanel.setMembers(c.all);
    }
    function showMode(mode) {
      cardsMode = mode;
      [].forEach.call(modeBar.children, function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-mode') === mode)); });
      if (contactPanel) contactPanel.node.style.display = mode === 'contact' ? '' : 'none';
      if (cardsPanel) cardsPanel.node.style.display = mode === 'card' ? '' : 'none';
      drawCards();
    }
    async function loadCards() {
      if (contactPanel || cardsLoading) { drawCards(); return; }
      cardsLoading = true;
      panes.cards.replaceChildren(h('p', { class: 'muted' }, '読み込み中…'));
      const r = await api('adminListMembers', {});
      cardsLoading = false;
      if (!r.ok) { panes.cards.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。')); return; }
      allMembers = r.members;
      // 配るときのヘッダー（セミナー情報）。日時・会場は、セミナーの登録内容から
      const semRes = await api('adminGetSeminar', { seminarId: id });
      const sem = semRes && semRes.ok ? semRes.seminar : {};
      const semInfo = [s.date ? A.ymd(s.date) : '', sem.time || '', sem.venue || ''].filter(Boolean).join('　');
      const m0 = seminarMembers();
      contactPanel = A.cardSheetPanel(m0.all, true, { layout: 'contact', title: s.course || s.name }); // 見出し: 「（連続講座の名前、なければセミナー名）　担当講師一覧」
      cardsPanel = A.cardSheetPanel(m0.withCard, true, { title: s.name, sub: semInfo, footer: '花の丘相続遺言サポート' });
      modeBar.replaceChildren(
        h('button', { type: 'button', class: 'mini', 'data-mode': 'contact', onclick: function () { showMode('contact'); } }, '連絡先シート（おすすめ）'),
        h('button', { type: 'button', class: 'mini', 'data-mode': 'card', onclick: function () { showMode('card'); } }, '名刺画像シート（実寸）'));
      cardsBody.replaceChildren(contactPanel.node, cardsPanel.node);
      panes.cards.replaceChildren(h('div', { class: 'card' }, [
        h('h2', {}, '講師・チューターの配りものを印刷する'),
        h('p', { class: 'muted' }, 'このセミナーの講師・チューター（講師が先）の連絡先を、A4に並べて印刷します（1枚に4名まで）。「連絡先シート」は、写真・名前・肩書き・事務所・住所・電話・メール・Webサイトを、大きな文字で載せます（項目は、メンバー管理の「連絡先シート用の項目」と、電話・メールの欄から）。「名刺画像シート」は、名刺そのものを実寸で並べます。電話・メールが載るので、配る以外には、使わないでください。'),
        modeBar, cardsNote, cardsBody,
      ]));
      showMode('contact');
    }

    // その他（案内の切り替え・連続講座から外す・削除）
    function drawMore() {
      const rows = [];
      if (s.date) {
        rows.push(h('div', { class: 'task' }, [
          h('div', {}, [h('b', {}, s.upcoming ? '開催予定として案内中です' : '案内はまだ出していません'), h('div', { class: 'muted' }, '案内すると、LINEの「開催予定・相談会」に載り、申込みを受け付けます。')]),
          h('button', { type: 'button', class: 'mini', onclick: async function () {
            msg.textContent = '';
            const r = await api('adminSetSeminarFlag', { seminarId: id, upcoming: !s.upcoming });
            if (!r.ok) { msg.textContent = r.error === 'date_required' ? '開催日が入っていないため、案内できません。先に「基本情報」で開催日を入れてください。' : '変更できませんでした。'; return; }
            s.upcoming = !s.upcoming; drawHead(); drawMore();
          } }, s.upcoming ? '案内をやめる' : '開催予定として案内する'),
        ]));
      }
      if (!s.date) rows.push(h('p', { class: 'muted' }, '開催日が入っていないため、案内できません。先に「基本情報」で開催日を入れてください。'));
      if (s.course) {
        rows.push(h('div', { class: 'task' }, [
          h('div', {}, [h('b', {}, '連続講座「' + s.course + '」の一部です'), h('div', { class: 'muted' }, 'セミナー自体は、削除されません。')]),
          h('button', { type: 'button', class: 'mini', onclick: async function () {
            if (!confirm('「' + s.name + '」を、連続講座「' + s.course + '」から外して、単発のセミナーにします。（セミナー自体は、削除されません）よろしいですか？')) return;
            const r = await api('adminSetSeminarCourse', { seminarId: id, course: '' });
            if (!r.ok) { msg.textContent = '変更できませんでした。'; return; }
            s.course = ''; drawHead(); drawMore();
          } }, '連続講座から外す'),
        ]));
      }
      { // 削除（このセミナーを編集できる人なら）
        rows.push(h('div', { class: 'task' }, [
          h('div', {}, [h('b', {}, 'このセミナーを削除する'), h('div', { class: 'muted' }, 'セミナー本体・理解度確認テストの問題・進行の記録が消え、元に戻せません（回答・申込みの記録は残ります）。')]),
          h('button', { type: 'button', class: 'mini danger', onclick: async function () {
            msg.textContent = '';
            const typed = prompt('「' + s.name + '」を削除します。セミナー本体・理解度確認テストの問題・進行の記録が消え、元に戻せません（回答・申込みの記録は残ります）。' + String.fromCharCode(10) + '削除する場合は、セミナーID「' + id + '」を入力してください。');
            if (typed == null) return;
            const r = await api('adminDeleteSeminar', { seminarId: id, confirmId: typed.trim() });
            if (!r.ok) { msg.textContent = r.error === 'confirm_mismatch' ? 'セミナーIDが一致しないため、削除しませんでした。' : '削除できませんでした。'; return; }
            A._swr = {}; try { localStorage.removeItem('kl_swr_v1'); } catch (e) { /* 消せなくてもよい */ }
            A.go('seminar/progress');
          } }, '削除'),
        ]));
      }
      panes.more.replaceChildren(h('div', { class: 'card' }, [h('h2', {}, 'その他')].concat(rows.length ? rows : [h('p', { class: 'muted' }, 'ここで行える操作は、ありません。')])));
    }
    drawMore();

    // 基本情報・テスト・担当講師は、編集フォームを、そのまま埋め込む（タブごとに、見せるカードを切り替える）
    const formBox = h('div', { class: 'edwrap' });
    let formLoading = false;
    function loadForm() {
      if (formLoading) return;
      formLoading = true;
      formBox.replaceChildren(h('p', { class: 'muted' }, '読み込み中…'));
      Promise.resolve(A.seminarForm(formBox, { id: id, embed: true, onTeachers: onTeachersChanged })).catch(function () {
        formBox.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
      });
    }

    // ---- タブ ----
    const TABS = [
      { key: 'progress', label: '進行', show: ['progress'] },
      { key: 'staff', label: '担当・チューター', show: ['tutors'], form: 'staff' },
      { key: 'materials', label: '資料', show: ['materials'] },
      { key: 'apps', label: '申込者（' + s.applications + '）', show: ['apps'], on: loadApps },
      { key: 'cards', label: '名刺', show: ['cards'], on: loadCards },
      { key: 'test', label: 'テスト', show: [], form: 'test' },
      { key: 'info', label: '基本情報', show: [], form: 'info' },
      { key: 'more', label: 'その他', show: ['more'] },
    ].filter(function (t) { return !t.adminOnly || A.isAdmin; });
    let cur = (params && params.tab) || 'progress';
    if (!TABS.some(function (t) { return t.key === cur; })) cur = 'progress';
    const tabBar = h('div', { class: 'nav2 dtabs' });
    const body = h('div', { class: 'dbody' }, [panes.progress, panes.tutors, panes.materials, panes.apps, panes.cards, panes.more, formBox]);
    // 進行・チューター・資料の記録の、保存の状態（この3つのタブにだけ出す）
    const saveRow = h('div', { class: 'saverow' }, [stat, retry]);
    function select(key) {
      cur = key;
      const t = TABS.filter(function (x) { return x.key === key; })[0];
      [].forEach.call(tabBar.children, function (b, i) { b.setAttribute('aria-selected', String(TABS[i].key === key)); });
      Object.keys(panes).forEach(function (k) { panes[k].style.display = t.show.indexOf(k) >= 0 ? '' : 'none'; });
      formBox.style.display = t.form ? '' : 'none';
      formBox.className = 'edwrap' + (t.form ? ' ed-' + t.form : '');
      if (t.form) loadForm();
      if (t.on) t.on();
      saveRow.style.display = ['progress', 'staff', 'materials'].indexOf(key) >= 0 ? '' : 'none';
    }
    TABS.forEach(function (t) { tabBar.appendChild(h('button', { type: 'button', class: 'subtab', onclick: function () { select(t.key); } }, t.label)); });

    box.replaceChildren(head, tabBar, msg, saveRow, body);
    select(cur);
  }

  A.views['seminar/detail'] = view;
})();
