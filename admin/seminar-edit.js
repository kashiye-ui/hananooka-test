(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api, fileToBase64 = A.fileToBase64, AI_ACCEPT_MIME = A.AI_ACCEPT_MIME;

  // ---- 問題エディタ ----
  function questionCard(q, onRemove) {
    const choices = q.choices; // 参照のまま操作する（state.questions[i].choices と同じ配列）
    const body = h('div', { class: 'qcard' });
    function render() {
      const rows = choices.map(function (c, i) {
        const chk = h('input', { type: 'checkbox' });
        chk.checked = c.correct;
        chk.addEventListener('change', function () { c.correct = chk.checked; });
        const txt = h('input', { type: 'text', maxlength: '60', placeholder: '選択肢', value: c.text });
        txt.addEventListener('input', function () { c.text = txt.value; });
        const rm = h('button', { type: 'button', class: 'rm', onclick: function () {
          if (choices.length <= 2) return;
          choices.splice(i, 1); render();
        } }, '×');
        return h('div', { class: 'choicerow' }, [chk, txt, rm]);
      });
      const addBtn = h('button', { type: 'button', class: 'linklike', onclick: function () {
        if (choices.length >= 6) return;
        choices.push({ text: '', correct: false }); render();
      } }, '＋ 選択肢を追加');
      const textArea = h('textarea', { rows: '2', maxlength: '300', placeholder: '問題文' }, q.text);
      textArea.addEventListener('input', function () { q.text = textArea.value; });
      const explArea = h('textarea', { rows: '5', maxlength: '600', placeholder: '解説（200字前後。理由を中心に、必要なら背景や具体例を一言）。LINEでは、行の頭に「ポイント：」を付けた行は黄色、「注意：」を付けた行はピンクのマーカー風に表示されます（改行して、1行ずつ書いてください）' }, q.explanation);
      explArea.addEventListener('input', function () { q.explanation = explArea.value; });
      body.replaceChildren.apply(body, [
        h('div', { class: 'qhead' }, [h('strong', {}, '問題'), h('button', { type: 'button', class: 'linklike', onclick: onRemove }, 'この問題を削除')]),
        textArea,
        h('p', { class: 'muted' }, 'チェックを入れた選択肢が正解です（複数可）。'),
      ].concat(rows, [addBtn, explArea]));
    }
    render();
    return { el: body, get: function () { return { text: q.text, choices: choices.map(function (c) { return c.text; }).filter(Boolean), correct: choices.filter(function (c) { return c.correct; }).map(function (c) { return c.text; }).filter(Boolean), explanation: q.explanation }; } };
  }

  function newQuestion() { return { text: '', explanation: '', choices: [{ text: '', correct: true }, { text: '', correct: false }] }; }

  // ---- 画面 ----
  async function editView(box, params) {
    const show = function (nodes) { box.replaceChildren.apply(box, [].concat(nodes).filter(Boolean)); };
    // 講師一覧・セミナー一覧・開くセミナーの中身を、1回の呼び出しでまとめて取る（順番に3回呼ぶと、そのぶん遅くなる）
    const init = await api('adminEditorInit', { seminarId: (params && params.id) || '' });
    const staffRes = { ok: init.ok, staff: init.staff }, seminarsRes = { ok: init.ok, seminars: init.seminars };
    if (!staffRes.ok || !seminarsRes.ok) return show(h('p', { class: 'err' }, '読み込みに失敗しました。再読み込みしてください。'));

    const state = { id: '', name: '', venue: '', address: '', pdf: '', schedule: '', digest: '', selected: {}, questions: [newQuestion()] };
    const msg = h('p', { class: 'err' });
    const okMsg = h('div');

    const sel = h('select', { id: 'seminarSel' }, [h('option', { value: '' }, '＋ 新しいセミナーを登録')].concat(
      seminarsRes.seminars.map(function (s) { return h('option', { value: s.id }, s.id + '（' + s.name + '）'); })
    ));

    const idInput = h('input', { type: 'text', maxlength: '40', placeholder: '例: 20260201-会場名' });
    const nameInput = h('input', { type: 'text', maxlength: '80', placeholder: 'セミナー名' });
    const venueInput = h('input', { type: 'text', maxlength: '80', placeholder: '会場名（任意）' });
    const addressInput = h('input', { type: 'text', maxlength: '120', placeholder: '会場住所（任意・距離帯の自動計算に使用）' });
    const scheduleInput = h('textarea', { rows: '4', maxlength: '600', placeholder: '例：\n13:00〜 相続の基本\n14:00〜 遺言の書き方\n（AIで問題を作成すると、レジュメから自動で下書きされます）' });
    const digestInput = h('textarea', { rows: '4', maxlength: '1000', placeholder: '本日の内容を3〜5行程度で（配布用A4シートに使います。AIで問題を作成すると自動で下書きされます）' });

    // 開催予定の案内（「予定」にすると、セミナーページの「開催予定・相談会」に出て、申込みを受け付ける）
    const typeSel = h('select', {}, [h('option', { value: 'セミナー' }, 'セミナー'), h('option', { value: '相談会' }, '相談会')]);
    const statusSel = h('select', {}, [h('option', { value: '' }, '案内には出さない（開催済み・通常）'), h('option', { value: '予定' }, '開催予定として案内し、申込みを受け付ける')]);
    if (!window.Admin.isAdmin) { statusSel.disabled = true; statusSel.title = '「開催予定として案内する」は、管理者が設定します'; } // 公開（案内）は、管理者だけ
    const dateInput = h('input', { type: 'date' });
    const timeInput = h('input', { type: 'text', maxlength: '40', placeholder: '例: 13:30〜15:30' });
    const seriesList = (init.series || []).slice();
    const courseInput = h('input', { type: 'text', maxlength: '80', placeholder: '例: 最期まで自分らしく過ごすための備え方講座（複数回の講座は、同じ講座名を入れるとまとめて管理できます）' });
    // 連続講座: 一覧から選んで紐づける（自由に書くと、表記ゆれで、別の講座になるため）。「新しく作る」を選ぶと、タイトルを入力できる
    const courseSel = h('select', {});
    function drawCourseOptions() {
      const cur = courseSel.value;
      courseSel.replaceChildren.apply(courseSel, [h('option', { value: '' }, '（連続講座ではない・単発）')].concat(
        seriesList.map(function (t) { return h('option', { value: t }, t); }),
        [h('option', { value: '__new' }, '＋ 新しい連続講座を作る…')]));
      courseSel.value = cur;
    }
    function syncCourseSel() {
      const v = courseInput.value.trim();
      if (v && seriesList.indexOf(v) < 0) seriesList.push(v);
      drawCourseOptions();
      courseSel.value = v;
      courseInput.style.display = 'none';
    }
    courseSel.addEventListener('change', function () {
      if (courseSel.value === '__new') { courseInput.value = ''; courseInput.style.display = ''; courseInput.focus(); }
      else { courseInput.value = courseSel.value; courseInput.style.display = 'none'; }
    });
    courseInput.addEventListener('blur', function () { if (courseSel.value === '__new' && courseInput.value.trim()) syncCourseSel(); });
    drawCourseOptions();
    courseInput.style.display = 'none';
    const renameBtn = !window.Admin.isAdmin ? null : h('button', { type: 'button', class: 'mini', onclick: async function () {
      const cur = courseSel.value;
      if (!cur || cur === '__new') { alert('名前を変える連続講座を、先に選んでください。'); return; }
      const to = prompt('連続講座「' + cur + '」の新しいタイトルを入力してください。紐づいているすべての回の講座名が、まとめて変わります。', cur);
      if (!to || to.trim() === cur) return;
      const r = await api('adminRenameSeries', { from: cur, to: to.trim() });
      if (!r.ok) { alert(r.error === 'duplicate_title' ? '同じタイトルの連続講座が、すでにあります。' : '変更できませんでした。'); return; }
      alert(r.renamed + '回ぶんの講座名を、「' + to.trim() + '」に変えました。画面を開き直します。');
      location.reload();
    } }, 'この連続講座の名前を変える');
    const capInput = h('input', { type: 'number', min: '0', max: '999', placeholder: '空欄＝定員なし' });
    const descInput = h('textarea', { rows: '4', maxlength: '600', placeholder: '案内の文章（内容・対象・持ち物など）。申込みの画面に表示されます。' });
    const homeworkInput = h('textarea', { rows: '3', maxlength: '1000', placeholder: '例：\n・延命治療について書いてみよう\n・戸籍集め\n（その場で行う演習・ワークではなく、次回までの宿題）' });
    const exerciseInput = h('textarea', { rows: '3', maxlength: '1000', placeholder: '例：\n・ペアで家族関係図を書く\n・遺言書の文例を読んで感想を話す\n（その場で行うもの。次回までの宿題は、上の欄に）' });

    const staffGrid = h('div', { class: 'staffgrid' });
    function renderStaff() {
      staffGrid.replaceChildren.apply(staffGrid, staffRes.staff.map(function (s) {
        const card = h('div', { class: 'staffcard' + (state.selected[s.name] ? ' on' : '') }, [
          h('img', { src: s.photo, alt: s.name }),
          h('div', { class: 'n' }, s.name),
        ]);
        card.addEventListener('click', function () {
          state.selected[s.name] = !state.selected[s.name];
          renderStaff();
        });
        return card;
      }));
    }
    renderStaff();

    const qList = h('div');
    function renderQuestions() {
      qList.replaceChildren.apply(qList, state.questions.map(function (q, i) {
        return questionCard(q, function () {
          if (state.questions.length <= 1) return;
          state.questions.splice(i, 1); renderQuestions();
        }).el;
      }));
    }
    renderQuestions();
    const addQBtn = h('button', { type: 'button', class: 'linklike', onclick: function () {
      if (state.questions.length >= 6) return;
      state.questions.push(newQuestion()); renderQuestions();
    } }, '＋ 問題を追加（1日で最大6問）');

    // ---- レジュメからAIで問題を作成（1日のコマ数に合わせて、1日6問以内に収める） ----
    // 1日のコマ数 → 1コマあたりの問題数: 1コマの日は4問、2コマの日は3問ずつ（計6問）、3コマの日は2問ずつ（計6問）
    const QUESTIONS_PER_KOMA = { 1: 4, 2: 3, 3: 2 };
    const komaSel = h('select', {}, [1, 2, 3].map(function (n) { return h('option', { value: String(n) }, n + 'コマ'); }));
    const komaInfo = h('p', { class: 'muted' });
    const aiFiles = [1, 2, 3].map(function (n) {
      const input = h('input', { type: 'file', accept: '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png' });
      const box = h('label', { class: 'f' }, [n + 'コマ目のレジュメ', input]);
      return { input: input, box: box };
    });
    function updateKoma() {
      const k = Number(komaSel.value);
      aiFiles.forEach(function (f, i) { f.box.hidden = i >= k; });
      komaInfo.textContent = k + 'コマの日は、レジュメ1つにつき ' + QUESTIONS_PER_KOMA[k] + '問ずつ作ります（1日で最大' + (QUESTIONS_PER_KOMA[k] * k) + '問）。';
    }
    komaSel.addEventListener('change', updateKoma); updateKoma();
    const aiMsg = h('p', { class: 'err', style: 'white-space:pre-line' });
    const AI_ERRORS = {
      no_api_key: 'AI機能の準備がまだできていません（APIキー未設定）。',
      unsupported_format: 'この形式には対応していません。',
      read_failed: 'ファイルを読み取れませんでした。',
      empty_document: '内容を読み取れませんでした。別のファイルでお試しください。',
      ai_failed: 'AIの呼び出しに失敗しました。もう一度お試しください。',
      parse_failed: 'AIの応答を解析できませんでした。もう一度お試しください。',
      truncated: '問題が長くなり、AIの回答が途中で切れました。問題数を減らして（例：2問ずつ）、もう一度お試しください。',
      no_questions_generated: '問題を作れませんでした。内容が少ない資料かもしれません。',
    };
    const aiBtn = h('button', { type: 'button', class: 'btn', style: 'margin-top:10px', onclick: async function () {
      aiMsg.className = 'err'; aiMsg.textContent = '';
      const k = Number(komaSel.value);
      const files = aiFiles.slice(0, k).map(function (f) { return f.input.files[0]; });
      const chosen = files.filter(Boolean);
      if (!chosen.length) { aiMsg.textContent = 'レジュメのファイルを、1つ以上選んでください。'; return; }
      for (const file of chosen) {
        if (!AI_ACCEPT_MIME[file.type]) { aiMsg.textContent = file.name + '：この形式には対応していません（PDF・Word・PowerPoint・JPG・PNGのいずれかにしてください）。'; return; }
        if (file.size > 15 * 1024 * 1024) { aiMsg.textContent = file.name + '：ファイルが大きすぎます（15MBまで）。'; return; }
      }
      aiBtn.disabled = true;
      const perKoma = QUESTIONS_PER_KOMA[k];
      const notes = [];
      let added = 0, dropped = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) continue;
          aiBtn.textContent = (i + 1) + 'コマ目をAIが読み取っています…（1コマにつき数十秒かかります）';
          const fileBase64 = await fileToBase64(file);
          const res = await api('adminGenerateQuestions', { fileBase64: fileBase64, mime: file.type, count: perKoma });
          if (!res.ok) { notes.push((i + 1) + 'コマ目：' + (AI_ERRORS[res.error] || '作成できませんでした。')); continue; }
          // 空の初期の問題欄（何も入力していない1問）は、取り除いてから追加する
          state.questions = state.questions.filter(function (q) { return q.text || q.choices.some(function (c) { return c.text; }); });
          const room = 6 - state.questions.length;
          const toAdd = res.questions.slice(0, Math.max(0, Math.min(perKoma, room)));
          dropped += res.questions.length - toAdd.length;
          toAdd.forEach(function (q) {
            state.questions.push({ text: q.text, explanation: q.explanation, choices: q.choices.map(function (c) { return { text: c, correct: q.correct.indexOf(c) >= 0 }; }) });
          });
          added += toAdd.length;
          if (res.schedule && !scheduleInput.value.trim()) scheduleInput.value = res.schedule;
          if (res.digest && !digestInput.value.trim()) digestInput.value = res.digest;
        }
        if (!state.questions.length) state.questions = [newQuestion()];
        renderQuestions();
        scheduleAuto(); // AIが作った問題も、自動で保存する
        aiMsg.className = notes.length ? 'err' : 'muted';
        aiMsg.textContent = added + '問を追加しました（いまの問題は ' + state.questions.length + '問）。内容を確認し、必要なら直してから保存してください。' +
          (dropped ? '（1日6問の上限のため、' + dropped + '問は追加しませんでした。）' : '') + (notes.length ? '\n' + notes.join('\n') : '');
      } catch (e) {
        aiMsg.className = 'err'; aiMsg.textContent = '通信エラーです。もう一度お試しください。' + (added ? '（それまでに追加した ' + added + '問は、画面に残っています。）' : '');
        if (added) renderQuestions();
      }
      aiBtn.disabled = false; aiBtn.textContent = 'AIで問題を作成';
    } }, 'AIで問題を作成');
    const aiCard = h('div', { class: 'card' }, [
      h('h2', {}, 'レジュメからAIで問題を作成'),
      h('p', { class: 'muted' }, '理解度確認テストは、1日のセミナーの最後に行います。この日のコマ数を選び、コマごとのレジュメ（PDF・Word・PowerPoint・写真）を選ぶと、その内容から、問題と解説を作ります。作られた問題は、下の「理解度確認テストの問題」に入るので、内容を確認して、必要なら直してから保存してください。'),
      h('label', { class: 'f' }, ['この日のコマ数', komaSel]),
      komaInfo,
    ].concat(aiFiles.map(function (f) { return f.box; }), [aiBtn, aiMsg]));

    function fillForm(seminarId, preloaded) {
      loading = true;
      idInput.value = seminarId; idInput.disabled = !!seminarId;
      okMsg.replaceChildren(); msg.textContent = '';
      if (!seminarId) {
        state.selected = {}; state.questions = [newQuestion()];
        nameInput.value = ''; venueInput.value = ''; addressInput.value = '';
        scheduleInput.value = ''; digestInput.value = '';
        typeSel.value = 'セミナー'; statusSel.value = ''; dateInput.value = ''; timeInput.value = ''; descInput.value = '';
        courseInput.value = ''; syncCourseSel(); capInput.value = ''; homeworkInput.value = ''; exerciseInput.value = '';
        renderStaff(); renderQuestions();
        loading = false; lastSig = currentSig();
        return;
      }
      (preloaded && preloaded.ok ? Promise.resolve(preloaded) : api('adminGetSeminar', { seminarId: seminarId })).then(function (res) {
        if (!res.ok) { msg.textContent = '読み込めませんでした。'; loading = false; return; }
        nameInput.value = res.seminar.name || ''; venueInput.value = res.seminar.venue || '';
        addressInput.value = res.seminar.address || '';
        scheduleInput.value = res.seminar.schedule || ''; digestInput.value = res.seminar.digest || '';
        typeSel.value = res.seminar.type || 'セミナー'; statusSel.value = res.seminar.status || '';
        dateInput.value = res.seminar.date || ''; timeInput.value = res.seminar.time || ''; descInput.value = res.seminar.description || '';
        courseInput.value = res.seminar.course || ''; syncCourseSel(); capInput.value = res.seminar.capacity || ''; homeworkInput.value = res.seminar.homework || ''; exerciseInput.value = res.seminar.exercise || '';
        state.selected = {}; res.teachers.forEach(function (n) { state.selected[n] = true; });
        state.questions = res.questions.length ? res.questions.map(function (q) {
          return { text: q.text, explanation: q.explanation, choices: q.choices.map(function (c) { return { text: c, correct: q.correct.indexOf(c) >= 0 }; }) };
        }) : [newQuestion()];
        renderStaff(); renderQuestions();
        loading = false; lastSig = currentSig();
      }).catch(function () { loading = false; });
    }
    sel.addEventListener('change', function () { fillForm(sel.value); });

    // ---- 保存（ボタンでも、入力をやめて少しすると自動でも、同じ処理で保存する） ----
    let saving = false, loading = false, lastSig = '', autoTimer = null;
    const autoStat = h('div', { style: 'position:fixed;right:12px;bottom:12px;background:#fff;border:1px solid #ddd;border-radius:999px;padding:4px 14px;font-size:.8em;color:#666;box-shadow:0 1px 4px rgba(0,0,0,.15);z-index:50' }, '変更すると、自動で保存されます');
    // 画面の入力内容を、1つの文字列にしたもの。保存した内容と同じなら、自動保存はしない（読み込んだだけ・何も変えていないときに、保存が走らないようにするため）
    function currentSig() {
      return JSON.stringify([idInput.value, nameInput.value, venueInput.value, addressInput.value, scheduleInput.value, digestInput.value,
        typeSel.value, statusSel.value, dateInput.value, timeInput.value, descInput.value, courseInput.value, capInput.value, homeworkInput.value, exerciseInput.value,
        Object.keys(state.selected).filter(function (k) { return state.selected[k]; }).sort(), state.questions]);
    }
    function scheduleAuto(e) {
      if (e && e.target === sel) return; // セミナーの切り替えは、保存の対象ではない
      clearTimeout(autoTimer);
      autoTimer = setTimeout(async function () {
        if (loading) { scheduleAuto(); return; }
        if (saving) { scheduleAuto(); return; }
        if (currentSig() === lastSig) return;
        await saveNow(true);
      }, 1500);
    }
    async function saveNow(auto) {
      if (saving || loading) return;
      // 自動保存は、セミナー名かIDが入ってから始める（何も入力していない新規の欄を、勝手に登録しないため）
      if (auto && !idInput.value.trim() && !nameInput.value.trim()) return;
      if (!auto) { msg.textContent = ''; okMsg.replaceChildren(); }
      saving = true;
      let id = idInput.value.trim();
      if (!id) { // IDが空のときも保存できるように、日付（なければ今日）とランダムな文字から、自動で作る
        const d = (dateInput.value || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
        id = d + '-' + Math.random().toString(36).slice(2, 6);
        idInput.value = id;
      }
      const payloadQuestions = [];
      state.questions.forEach(function (q) {
        payloadQuestions.push({ text: q.text, choices: q.choices.map(function (c) { return c.text; }).filter(Boolean), correct: q.choices.filter(function (c) { return c.correct; }).map(function (c) { return c.text; }).filter(Boolean), explanation: q.explanation });
      });
      const teachers = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
      saveBtn.style.display = 'none'; saveBtn.disabled = true;
      autoStat.style.color = '#666'; autoStat.textContent = '保存しています…';
      const sigAtSave = currentSig();
      try {
        const res = await api('adminSaveSeminar', {
          seminar: {
            id: id, name: nameInput.value.trim(), venue: venueInput.value.trim(), address: addressInput.value.trim(), pdf: '', // 「特典PDF」は廃止（空にして保存する）
            schedule: scheduleInput.value.trim(), digest: digestInput.value.trim(),
            type: typeSel.value, status: statusSel.value, date: dateInput.value, time: timeInput.value.trim(), description: descInput.value.trim(),
            course: courseInput.value.trim(), capacity: capInput.value, homework: homeworkInput.value.trim(), exercise: exerciseInput.value.trim(),
          },
          teachers: teachers, questions: payloadQuestions,
        });
        if (!res.ok) {
          if (res.error === 'invalid_seminar_id' && !auto) alert('セミナーIDは、半角英数字・ハイフンで入力してください（3文字以上）。IDの欄を直すか、空にすると自動で作ります。');
          msg.textContent = { invalid_seminar_id: 'セミナーIDは半角英数字・ハイフンで入力してください。', no_questions: '問題を1つ以上、正しく入力してください。（開催予定の案内や相談会は、問題なしでも保存できます）', date_required: '開催予定として案内するときは、開催日を入力してください。', invalid_date: '開催日の形式が正しくありません。', correct_not_in_choices: '正解には、選択肢に書いた文字と同じものを選んでください。' }[res.error] || '保存できませんでした。';
          autoStat.style.color = '#c0392b'; autoStat.textContent = '保存できませんでした（下の「もう一度保存する」を押してください）'; saveBtn.style.display = '';
        } else {
          lastSig = sigAtSave;
          // 一覧に戻ったとき、古い内容が出ないよう、覚えている一覧を、保存した内容に合わせて直しておく
          A.swrUpdate('adminListArchive', {}, function (list) {
            const validQ = state.questions.filter(function (q) { return q.text && q.choices.filter(function (c) { return c.text; }).length >= 2 && q.choices.some(function (c) { return c.correct && c.text; }); }).length;
            const vals = { id: id, name: nameInput.value.trim() || id, course: courseInput.value.trim(), type: typeSel.value, date: dateInput.value, upcoming: statusSel.value === '予定',
              questions: validQ, teachers: Object.keys(state.selected).filter(function (k) { return state.selected[k]; }) };
            const it = list.seminars.filter(function (x) { return x.id === id; })[0];
            if (it) Object.assign(it, vals); else list.seminars.push(Object.assign({ hidden: false, answers: 0, applications: 0 }, vals));
          });
          { const d = new Date(); autoStat.style.color = '#666'; autoStat.textContent = '保存しました ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ((res.warnings && res.warnings.length) ? '（確認が必要な点が' + res.warnings.length + '件あります。「このセミナーを保存」を押すと、詳しく出ます）' : ''); }
          okMsg.replaceChildren(
            h('p', {}, '保存しました。'),
            h('p', {}, [h('a', { href: res.testUrl, target: '_blank' }, '理解度確認テストを開く')]),
            h('img', { src: 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(res.testUrl), alt: '理解度確認テストのQRコード', width: '160', height: '160' })
          );
          if (!seminarsRes.seminars.some(function (s) { return s.id === id; })) {
            sel.appendChild(h('option', { value: id }, id + '（' + nameInput.value.trim() + '）'));
            seminarsRes.seminars.push({ id: id, name: nameInput.value.trim() });
          }
          sel.value = id; idInput.disabled = true;
          // 保存はできた上で、足りない点・直したほうがよい点を、アラートで知らせる
          const notes = [];
          if (!nameInput.value.trim()) notes.push('セミナー名が入力されていません。');
          if (!dateInput.value) notes.push('開催日が入力されていません。');
          if (!venueInput.value.trim()) notes.push('会場が入力されていません。');
          (res.warnings || []).forEach(function (w) { notes.push(w); });
          if (notes.length && !auto) alert('保存しました。次の点を確認してください。' + String.fromCharCode(10) + String.fromCharCode(10) + notes.map(function (n) { return '・' + n; }).join(String.fromCharCode(10)));
        }
      } catch (e) {
        msg.textContent = '通信エラーです。もう一度お試しください。';
        autoStat.style.color = '#c0392b'; autoStat.textContent = '保存できませんでした（通信エラー。下の「もう一度保存する」を押してください）'; saveBtn.style.display = '';
      }
      saving = false;
      saveBtn.disabled = false;
    }
    const saveBtn = h('button', { class: 'btn', style: 'display:none', onclick: function () { saveNow(false); } }, 'もう一度保存する'); // 自動で保存できなかったときだけ出る

    // ---- 当日配布用A4シート（PDF） ----
    const flyerMsg = h('p', { class: 'err' });
    const flyerBtn = h('button', { type: 'button', class: 'btn', onclick: async function () {
      flyerMsg.textContent = ''; flyerMsg.className = 'err';
      const id = idInput.value.trim();
      if (!id) { flyerMsg.textContent = 'セミナー名かIDを入れてください（入れると、自動で保存され、IDも決まります）。'; return; }
      flyerBtn.disabled = true; flyerBtn.textContent = '作成中…';
      try {
        // 画面に入力されている内容から、ブラウザの中で、そのまま作る（サーバーは使わない）
        const dt = [dateInput.value ? A.ymd(dateInput.value) : '', timeInput.value.trim()].filter(Boolean).join('　');
        await A.downloadFlyer({
          name: nameInput.value.trim() || id, venue: venueInput.value.trim(), dateTime: dt,
          schedule: scheduleInput.value.trim(), digest: digestInput.value.trim(),
          teachers: Object.keys(state.selected).filter(function (k) { return state.selected[k]; }),
          url: 'https://kashiye-ui.github.io/hananooka-test/?seminar=' + encodeURIComponent(id),
        }, id + '-理解度確認テスト.pdf');
        flyerMsg.className = 'muted'; flyerMsg.textContent = 'ダウンロードしました。';
      } catch (e) {
        flyerMsg.textContent = '作成できませんでした。通信状況をご確認のうえ、もう一度お試しください。';
      }
      flyerBtn.disabled = false; flyerBtn.textContent = '当日配布用A4シートをPDFでダウンロード';
    } }, '当日配布用A4シートをPDFでダウンロード');

    show([
      sel,
      h('div', { class: 'card' }, [
        h('div', { class: 'field' }, [h('label', {}, 'セミナーID（半角英数・ハイフン。例: 20260201-会場名）'), idInput]),
        h('div', { class: 'field' }, [h('label', {}, 'セミナー名'), nameInput]),
        h('div', { class: 'field' }, [h('label', {}, '会場名'), venueInput]),
        h('div', { class: 'field' }, [h('label', {}, '会場住所'), addressInput]),
        h('div', { class: 'field' }, [h('label', {}, 'タイムスケジュール（当日配布用A4シートに使用。演習・ワークの時間もここに含める）'), scheduleInput]),
        h('div', { class: 'field' }, [h('label', {}, '内容ダイジェスト（当日配布用A4シートに使用）'), digestInput]),
        h('div', { class: 'field' }, [h('label', {}, '宿題（次回までの課題。その場の演習・ワークは含めない）'), homeworkInput]),
        h('div', { class: 'field' }, [h('label', {}, '演習・ワーク（その場で行うもの。宿題とは分ける）'), exerciseInput]),
      ]),
      h('div', { class: 'card' }, [
        h('h2', {}, '開催予定の案内・申込み受付'),
        h('p', { class: 'muted' }, '「開催予定として案内する」にすると、LINEのメニュー「セミナー」の「開催予定・相談会」に載り、申込みフォームが使えます。申込みは、スプレッドシートの「申込」シートに残り、管理者に通知されます。開催が終わったら「案内には出さない」に戻すと、「過去の解答・解説」に移ります。'),
        h('div', { class: 'field' }, [h('label', {}, '種別'), typeSel]),
        h('div', { class: 'field' }, [h('label', {}, '案内'), statusSel]),
        h('div', { class: 'field' }, [h('label', {}, '開催日'), dateInput]),
        h('div', { class: 'field' }, [h('label', {}, '時間'), timeInput]),
        h('div', { class: 'field' }, [h('label', {}, '案内文'), descInput]),
        h('div', { class: 'field' }, [h('label', {}, '連続講座（複数回の講座は、同じ連続講座を選ぶと、まとまります）'), courseSel, courseInput, renameBtn, h('p', { class: 'muted' }, '連続講座の、どれか1回に登録されている講師は、その連続講座の全回を、見て・編集できます。')]),
        h('div', { class: 'field' }, [h('label', {}, '定員（人）'), capInput]),
      ]),
      h('div', { class: 'card' }, [
        h('h2', {}, '登壇・参加する講師（チューター含む）'),
        h('p', { class: 'muted' }, 'ここで選んだ講師が、このセミナーの参加者が個別相談を希望したときの、「ご希望の先生」の候補になります。'),
        staffGrid,
      ]),
      aiCard,
      h('div', { class: 'card' }, [h('h2', {}, '理解度確認テストの問題'), qList, addQBtn]),
      msg, okMsg, saveBtn,
      h('div', { class: 'card' }, [
        h('h2', {}, '当日配布用A4シート'),
        h('p', { class: 'muted' }, 'タイムスケジュール・内容ダイジェスト・担当講師・理解度確認テストのQRコードを1枚にまとめたPDFを作ります（いま画面に入力されている内容から、そのまま作ります）。'),
        flyerBtn, flyerMsg,
      ]),
    ]);

    if (params && params.id) {
      sel.value = params.id; fillForm(params.id, init.current);
    } else if (params && params.addTo) {
      // 連続講座に、回を追加する: 同じ連続講座の会場・担当・種別などを引き継いだ、新しい回の下書き（日付は、あとで入れる）
      const both = await Promise.all([api('adminGetSeminar', { seminarId: params.addTo }), A.apiSwr('adminListArchive', {})]);
      const src = both[0], arc = both[1];
      if (src.ok) {
        const sm = src.seminar;
        fillForm('');
        const n = arc && arc.ok ? arc.seminars.filter(function (x) { return x.course === sm.course; }).length : 0;
        courseInput.value = sm.course || ''; syncCourseSel();
        nameInput.value = (sm.course || sm.name) + ' 第' + (n + 1) + '回';
        venueInput.value = sm.venue || ''; addressInput.value = sm.address || ''; typeSel.value = sm.type || 'セミナー';
        descInput.value = sm.description || ''; capInput.value = sm.capacity || ''; timeInput.value = sm.time || '';
        state.selected = {}; (src.teachers || []).forEach(function (n2) { state.selected[n2] = true; });
        renderStaff();
        msg.className = 'muted'; msg.textContent = '同じ連続講座の、新しい回です。開催日などを入れてください（入力すると、自動で保存されます）。';
      }
    } else if (params && params.draft) {
      const d = params.draft;
      fillForm('');
      idInput.value = d.id || ''; nameInput.value = d.name || ''; venueInput.value = d.venue || ''; addressInput.value = d.address || '';
      scheduleInput.value = d.schedule || ''; digestInput.value = d.digest || '';
      typeSel.value = d.type || 'セミナー'; statusSel.value = ''; dateInput.value = d.date || ''; timeInput.value = d.time || ''; descInput.value = d.description || '';
      courseInput.value = d.course || ''; syncCourseSel(); capInput.value = d.capacity || '';
      state.selected = {}; (d.teachers || []).forEach(function (n) { state.selected[n] = true; });
      renderStaff();
    }

    // 入力・選択・ボタン操作のあと、少し待って、変わっていれば自動で保存する（画面の下までスクロールして「保存」を押さなくてよい）
    box.appendChild(autoStat);
    box.addEventListener('input', scheduleAuto);
    box.addEventListener('change', scheduleAuto);
    box.addEventListener('click', scheduleAuto);
  }

  // 「新規登録・編集」の中に、「手で登録・編集」と「資料から自動登録」の切り替えを置く
  function modeBar(cur) {
    const A = window.Admin;
    const btn = function (route, label) { return A.h('button', { type: 'button', class: 'mini', 'aria-selected': String(route === cur), onclick: function () { if (route !== cur) A.go(route); } }, label); };
    return A.h('div', { class: 'modebar' }, [btn('seminar/edit', '手で登録・編集'), btn('seminar/intake', '資料から自動登録')]);
  }
  window.Admin.modeBar = modeBar;
  window.Admin.views['seminar/edit'] = function (box, params) {
    const sub = window.Admin.h('div');
    box.replaceChildren(modeBar('seminar/edit'), sub);
    return editView(sub, params);
  };
})();
