(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api, fileToBase64 = A.fileToBase64, AI_ACCEPT_MIME = A.AI_ACCEPT_MIME;

  // ---- 時間割の案（開催時間と、コマ数から、概算で作る） ----
  // 1回は、基本、2時間（目標終了は、10分前）。講義が3つあるのが3コマ、2つあるのが2コマ。どちらも、あとに、ワークが付く。
  //  ・最初は固定: アイスブレイク5分・終活とは（概要）5分／最後も固定: ワーク約20分
  //  ・休憩: 3コマは5分を2回、2コマは10分を1回（コマが少ない日は、休憩を減らして、そのぶんを講義にあてる）
  //  ・残りの時間を、講義で分ける（5分きざみ。端数は、前のコマから、5分ずつ足す）
  const TT_OPEN = [['アイスブレイク（手遊び）', 5], ['終活とは（概要）', 5]];
  const TT_WORK = 20;
  const TT_BREAK = { 2: 10, 3: 5 };
  function ttDigits(v) { return String(v || '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }); }
  function ttParse(v) { // 「10:00〜11:50」→ [開始の分, 終了の分]。読めなければ null
    const m = /(\d{1,2})[:：](\d{2})\s*[〜~～\-－ー–—]\s*(\d{1,2})[:：](\d{2})/.exec(ttDigits(v));
    return m ? [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])] : null;
  }
  function ttClock(min) { return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2); }
  /** 時間割の案（文字）。n=2|3。start・end は分。枠が短すぎるときは null */
  function planTimetable(start, end, n) {
    const brk = TT_BREAK[n];
    if (!brk) return null;
    const opening = TT_OPEN.reduce(function (a, o) { return a + o[1]; }, 0);
    const total = end - start - opening - TT_WORK - brk * (n - 1); // 講義にあてる時間
    if (total < n * 10) return null;
    const base = Math.floor(total / n / 5) * 5;
    const lens = [];
    for (let i = 0; i < n; i++) lens.push(base);
    let rem = total - base * n;
    for (let i = 0; rem > 0; i = (i + 1) % n) { const add = Math.min(5, rem); lens[i] += add; rem -= add; }
    const lines = [];
    let t = start;
    TT_OPEN.forEach(function (o) { lines.push(ttClock(t) + ' ' + o[0] + o[1] + '分'); t += o[1]; });
    lens.forEach(function (len, i) {
      lines.push(ttClock(t) + ' コマ' + (i + 1) + '：（講義の内容）' + len + '分'); t += len;
      if (i < n - 1) { lines.push(ttClock(t) + ' 休憩' + brk + '分'); t += brk; }
    });
    lines.push(ttClock(t) + ' ワーク：（内容）（約' + TT_WORK + '分）'); t += TT_WORK;
    lines.push('目標終了時刻：' + ttClock(end));
    return lines.join('\n');
  }
  window.Admin.planTimetable = function (timeText, n) { // 開催時間（例「10:00〜11:50」）が空・読めないときは、10:00〜11:50 で作る
    const r = ttParse(timeText) || [600, 710];
    return planTimetable(r[0], r[1], n);
  };

  // ---- タイムスケジュールから、その日の講義（コマ）を読み取る ----
  // 時刻・休憩・ワーク・アイスブレイク・概要・目標終了などの行を除いた、残りの行を、講義（1行＝1コマ。最大3つ）と見なす。
  // 「（講義の内容）」のままの行は、内容が未入力（placeholder）。講師は、行の最後の「（○○先生）」「（○○さん）」から読む。
  const LECTURE_SKIP = /アイスブレイク|終活とは|（概要）|休憩|ワーク|目標終了|質疑|まとめ|閉会|開会|あいさつ|挨拶|受付|アンケート|オープニング|クロージング|個別相談/;
  function parseLectures(text) {
    const out = [];
    const rawLines = String(text || '').split(/\r?\n/);
    const TIMED = /^\d{1,2}[:：]\d{2}/;
    const hasTimed = rawLines.some(function (r) { return TIMED.test(r.trim()); }); // 時刻のある行があれば、時刻のある行だけを、時間割の行と見なす（時刻のない行は、メモなど）
    rawLines.forEach(function (raw) {
      let l = raw.trim();
      if (!l) return;
      if (hasTimed && !TIMED.test(l)) return;
      l = l.replace(/^\d{1,2}[:：]\d{2}(?:\s*[〜~～\-－ー]\s*\d{1,2}[:：]\d{2})?\s*/, '');
      if (!l || /^目標終了/.test(l) || LECTURE_SKIP.test(l)) return;
      l = l.replace(/^コマ\s*[0-9０-９]+\s*[：:]\s*/, '');
      let speaker = '';
      const sm = /[（(]([^（）()]*(?:先生|さん|氏)[^（）()]*)[）)]\s*$/.exec(l.replace(/\s*\d+\s*分\s*(?=[（(][^（）()]*(?:先生|さん|氏)[^（）()]*[）)]\s*$)/, ''));
      if (sm) { speaker = sm[1]; l = l.replace(/\s*[（(][^（）()]*(?:先生|さん|氏)[^（）()]*[）)]\s*$/, ''); }
      l = l.replace(/\s*\d+\s*分(?:程度|ほど|間)?\s*/g, ' ').trim().replace(/^[「『]\s*|\s*[」』]$/g, '').trim();
      const placeholder = /（講義の内容）|（内容）/.test(l) || !l;
      out.push({ title: placeholder ? '' : l.slice(0, 200), speaker: speaker, placeholder: placeholder });
    });
    return out.slice(0, 3);
  }
  window.Admin.parseLectures = parseLectures;

  /** ファイルを、ドラッグ＆ドロップでも、クリックして選ぶのでも、指定できる枠。{ input, box, title, note } */
  function makeDropzone(titleText) {
    const input = h('input', { type: 'file', accept: '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png' });
    input.style.display = 'none';
    const title = h('span', { class: 'dz-title' }, titleText);
    const note = h('span', { class: 'dz-note' });
    const hint = h('span', { class: 'dz-hint' }, 'ここにファイルをドロップ（またはクリックして選ぶ）');
    const box = h('label', { class: 'f dropzone' }, [title, note, hint, input]);
    const showName = function () { const f = input.files[0]; hint.textContent = f ? f.name : 'ここにファイルをドロップ（またはクリックして選ぶ）'; box.classList.toggle('has-file', !!f); };
    input.addEventListener('change', showName);
    ['dragenter', 'dragover'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.remove('over'); }); });
    box.addEventListener('drop', function (e) {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      const dt = new DataTransfer(); dt.items.add(f);
      input.files = dt.files; showName();
    });
    return { input: input, box: box, title: title, note: note };
  }

  // ---- 問題エディタ ----
  // 理解度確認テストは、〇×で答える問題にする（問題文は「正しいか、間違いか」で答えられる文章。選択肢は「〇」「×」の2つ、正解は1つ）。
  // 古い形式（ほかの選択肢がある問題）は、書き直されるまで、そのまま残す（「〇×の問題に書き直す」で変えられる）
  const MARU = '〇', BATSU = '×';
  const MAX_Q = 4; // 1日の問題数の上限（サーバー側の MAX_QUESTIONS と同じ）
  function isMaru(choices) { return choices.length === 2 && choices[0].text === MARU && choices[1].text === BATSU; }
  function maruChoices() { return [{ text: MARU, correct: false }, { text: BATSU, correct: false }]; }

  function questionCard(q, onRemove, opts) {
    const choices = q.choices; // 参照のまま操作する（state.questions[i].choices と同じ配列）
    const body = h('div', { class: 'qcard' });
    function render() {
      const explArea = h('textarea', { rows: '5', maxlength: '600', placeholder: '解説（200字前後。理由を中心に、必要なら背景や具体例を一言）。LINEでは、行の頭に「ポイント：」を付けた行は黄色、「注意：」を付けた行はピンクのマーカー風に表示されます（改行して、1行ずつ書いてください）' }, q.explanation);
      explArea.addEventListener('input', function () { q.explanation = explArea.value; });
      const head = h('div', { class: 'qhead' }, [h('strong', {}, '問題'), h('button', { type: 'button', class: 'linklike', onclick: onRemove }, 'この問題を削除')]);
      const textArea = h('textarea', { rows: '2', maxlength: '300', placeholder: q.legacy ? '問題文' : '〇か×で答えられる文章（例：遺言書は、書き直すことができる。）' }, q.text);
      textArea.addEventListener('input', function () { q.text = textArea.value; });
      // 考え方のヒント（当日配布用A4シートの、問題の下に印刷する。答えそのものは書かない）
      const hintIn = h('input', { type: 'text', maxlength: '120', placeholder: '考え方のヒント（任意。A4シートの問題の下に印刷されます。答えは書かないでください）', value: q.hint || '' });
      hintIn.addEventListener('input', function () { q.hint = hintIn.value; });
      // AIが付けた、レジュメの根拠（確認用。保存はしない。参加者には出ない）
      const basisNote = q.basis ? h('p', { class: 'muted basis' }, 'レジュメの根拠：「' + q.basis + '」') : null;
      const concernNote = q.concern ? h('p', { class: 'err basis' }, '⚠ AIの指摘：' + q.concern) : null;
      // 人が書いた問題に、解説とヒントを、AIが書く（opts.explain は、editView が渡す）
      const aiNote = h('span', { class: 'muted' });
      const aiBtn = opts && opts.explain ? h('button', { type: 'button', class: 'mini', onclick: async function () {
        aiNote.className = 'err'; aiNote.textContent = '';
        const picked = choices.filter(function (c) { return c.correct; })[0];
        if (!q.text.trim()) { aiNote.textContent = '先に、問題文を書いてください。'; return; }
        if (!picked) { aiNote.textContent = '先に、正解（〇か×）を選んでください。'; return; }
        if ((q.explanation || '').trim() && !confirm('いまの解説（とヒント）を、AIが書いたもので、置き換えます。よろしいですか？')) return;
        aiBtn.disabled = true; aiBtn.textContent = 'AIが書いています…';
        try {
          const r = await opts.explain(q, picked.text);
          if (!r.ok) { aiNote.textContent = { no_api_key: 'AI機能の準備がまだできていません（APIキー未設定）。', forbidden: '権限がありません。', no_text: '先に、問題文を書いてください。', no_answer: '先に、正解（〇か×）を選んでください。', read_failed: 'レジュメを読み取れませんでした。', unsupported_format: 'このレジュメの形式には対応していません。' }[r.error] || 'AIが書けませんでした。もう一度お試しください。'; return; }
          q.explanation = r.explanation; q.hint = r.hint || q.hint; q.concern = r.concern || '';
          render();
          body.dispatchEvent(new Event('input', { bubbles: true })); // 自動保存に、変更を知らせる
        } catch (e) { aiNote.textContent = '通信エラーです。もう一度お試しください。'; }
        finally { aiBtn.disabled = false; aiBtn.textContent = 'AIに解説とヒントを書いてもらう'; }
      } }, 'AIに解説とヒントを書いてもらう') : null;
      const aiRow = aiBtn ? h('div', { class: 'aiexp' }, [aiBtn, aiNote]) : null;

      if (isMaru(choices)) {
        const radios = choices.map(function (c) {
          const r = h('input', { type: 'radio', name: 'ans' + (q.uid || (q.uid = Math.random().toString(36).slice(2))) });
          r.checked = c.correct;
          r.addEventListener('change', function () { choices.forEach(function (x) { x.correct = x === c; }); });
          return h('label', { class: 'choicerow' }, [r, h('span', {}, c.text === MARU ? '〇　正しい（この文章は、正しい）' : '×　間違い（この文章は、間違い）')]);
        });
        body.replaceChildren.apply(body, [head, textArea, hintIn, basisNote, h('p', { class: 'muted' }, '正解を、〇か×のどちらかに選んでください。')].concat(radios, [aiRow, concernNote, explArea]));
        return;
      }
      // 古い形式の問題（〇×ではない）
      const rows = choices.map(function (c, i) {
        const chk = h('input', { type: 'checkbox' });
        chk.checked = c.correct;
        chk.addEventListener('change', function () { c.correct = chk.checked; });
        const txt = h('input', { type: 'text', maxlength: '60', placeholder: '選択肢', value: c.text });
        txt.addEventListener('input', function () { c.text = txt.value; });
        return h('div', { class: 'choicerow' }, [chk, txt]);
      });
      const convert = h('button', { type: 'button', class: 'mini', onclick: function () {
        if (!confirm('この問題を、〇×の問題に書き直します。いまの選択肢と正解は消えます（問題文と解説は残ります）。よろしいですか？')) return;
        choices.splice(0, choices.length); maruChoices().forEach(function (c) { choices.push(c); });
        q.legacy = false; render();
      } }, '〇×の問題に書き直す');
      body.replaceChildren.apply(body, [
        head,
        h('p', { class: 'err' }, 'これは、以前の形式の問題です。今後は、〇×で答える問題だけにします。「〇×の問題に書き直す」を押して、〇か×で答えられる文章に直してください。'),
        convert, textArea, hintIn,
      ].concat(rows, [explArea]));
    }
    render();
    return { el: body, get: function () { return { text: q.text, choices: choices.map(function (c) { return c.text; }).filter(Boolean), correct: choices.filter(function (c) { return c.correct; }).map(function (c) { return c.text; }).filter(Boolean), explanation: q.explanation }; } };
  }

  function newQuestion() { return { text: '', hint: '', explanation: '', choices: maruChoices() }; }

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
          // 詳細ページ（seminar-detail.js）に埋め込まれているときは、選び直した担当の先生を知らせる（講師・チューターの一覧が、すぐ変わる）
          if (params && params.onTeachers) params.onTeachers(staffRes.staff.map(function (x) { return x.name; }).filter(function (nm) { return state.selected[nm]; }));
        });
        return card;
      }));
    }
    renderStaff();

    // 解説をAIに書いてもらうときの、参考にするレジュメ（任意。なければ、一般に確立している事実だけで書く）
    const refDrop = makeDropzone('解説の参考にするレジュメ（任意）');
    refDrop.note.textContent = '問題を自分で書いて、AIに解説を頼むとき、このレジュメの内容にもとづいて書きます。入れなければ、AIが、一般に確立している事実だけから書きます（AIの解説は、必ず、確認してください）。';
    async function explainWithAi(q, answer) {
      const payload = { seminarName: nameInput.value.trim(), schedule: scheduleInput.value.trim(), text: q.text.trim(), correct: answer };
      const file = refDrop.input.files[0];
      if (file) {
        if (!AI_ACCEPT_MIME[file.type]) return { ok: false, error: 'unsupported_format' };
        if (file.size > 15 * 1024 * 1024) return { ok: false, error: 'read_failed' };
        payload.fileBase64 = await fileToBase64(file); payload.mime = file.type;
      }
      return api('adminDraftExplanation', payload);
    }
    const qList = h('div');
    const qOver = h('p', { class: 'err' }); // 4問を超えているときの注意（5問目以降は保存されない）
    function renderQuestions() {
      qOver.textContent = state.questions.length > MAX_Q ? '問題が' + MAX_Q + '問を超えています。' + (MAX_Q + 1) + '問目以降は、保存されません。不要な問題を削除してください。' : '';
      qList.replaceChildren.apply(qList, state.questions.map(function (q, i) {
        return questionCard(q, function () {
          state.questions.splice(i, 1);
          if (!state.questions.length) state.questions = [newQuestion()]; // 最後の1問を消したときは、空の問題欄に戻す（空の欄は、保存されない）
          renderQuestions();
        }, { explain: explainWithAi }).el;
      }));
    }
    renderQuestions();
    const addQBtn = h('button', { type: 'button', class: 'linklike', onclick: function () {
      if (state.questions.length >= MAX_Q) return;
      state.questions.push(newQuestion()); renderQuestions();
    } }, '＋ 問題を追加（1日で最大' + MAX_Q + '問）');

    // ---- レジュメからAIで問題を作成（タイムスケジュールの講義ごとに、レジュメを受け取る。1日4問以内） ----
    // 1日のコマ（講義）数 → コマごとの問題数: 1コマの日は4問、2コマの日は2問ずつ、3コマの日は2問・1問・1問（どれも計4問）
    // コマの数と、題名・講師は、タイムスケジュールから読み取る（読み取れないときだけ、コマ数を選んでもらう）
    const QUESTIONS_PER_KOMA = { 1: [4], 2: [2, 2], 3: [2, 1, 1] };
    const komaSel = h('select', {}, [1, 2, 3].map(function (n) { return h('option', { value: String(n) }, n + 'コマ'); }));
    const komaRow = h('label', { class: 'f' }, ['この日のコマ数', komaSel]);
    const komaInfo = h('p', { class: 'muted' });
    let aiLectures = []; // タイムスケジュールから読み取った講義
    const aiFiles = [1, 2, 3].map(function (n) { return makeDropzone(n + 'コマ目のレジュメ'); });
    function komaCount() { return aiLectures.length ? aiLectures.length : Number(komaSel.value); }
    function updateKoma() {
      aiLectures = parseLectures(scheduleInput.value);
      const k = komaCount();
      const plan = QUESTIONS_PER_KOMA[k];
      komaRow.hidden = aiLectures.length > 0; // タイムスケジュールから分かるときは、コマ数を選ばせない
      aiFiles.forEach(function (f, i) {
        f.box.hidden = i >= k;
        const lec = aiLectures[i];
        f.title.textContent = lec
          ? (i + 1) + 'コマ目' + (lec.title ? '：' + lec.title : '（内容が未入力）') + (lec.speaker ? '（' + lec.speaker + '）' : '') + ' のレジュメ'
          : (i + 1) + 'コマ目のレジュメ';
        f.note.textContent = lec && lec.placeholder ? '⚠ このコマの内容が、時間割に入っていません。「（講義の内容）」を直してから作ると、内容に合った問題になります。'
          : (lec ? 'この講義に関係する話題だけから、' + plan[i] + '問を作ります。' : (plan ? plan[i] + '問を作ります。' : ''));
      });
      komaInfo.textContent = aiLectures.length
        ? 'タイムスケジュールから、この日は ' + k + 'コマと分かりました。1コマ目から順に、その講義のレジュメを、下の枠に入れてください（問題は、1日で最大' + MAX_Q + '問です）。'
        : 'タイムスケジュールに、講義の行が見つかりませんでした。コマ数を選んでください（先に、「基本情報」の時間割を入れておくと、コマごとの題名が、自動で分かります）。' + k + 'コマの日は、' + plan.map(function (n, i) { return (i + 1) + 'コマ目から' + n + '問'; }).join('、') + 'を作ります（1日で最大' + MAX_Q + '問）。';
    }
    komaSel.addEventListener('change', updateKoma); scheduleInput.addEventListener('input', updateKoma); updateKoma();
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
      const k = komaCount();
      const files = aiFiles.slice(0, k).map(function (f) { return f.input.files[0]; });
      const chosen = files.filter(Boolean);
      if (!chosen.length) { aiMsg.textContent = 'レジュメのファイルを、1つ以上選んでください。'; return; }
      const unfilled = aiLectures.filter(function (l, i) { return files[i] && l.placeholder; }).length;
      if (unfilled && !confirm('時間割に、講義の内容が入っていないコマがあります。内容が分からないと、タイトルから外れた問題が出ることがあります。このまま作りますか？')) return;
      for (const file of chosen) {
        if (!AI_ACCEPT_MIME[file.type]) { aiMsg.textContent = file.name + '：この形式には対応していません（PDF・Word・PowerPoint・JPG・PNGのいずれかにしてください）。'; return; }
        if (file.size > 15 * 1024 * 1024) { aiMsg.textContent = file.name + '：ファイルが大きすぎます（15MBまで）。'; return; }
      }
      aiBtn.disabled = true;
      const plan = QUESTIONS_PER_KOMA[k];
      const notes = [];
      let added = 0, dropped = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) continue;
          aiBtn.textContent = (i + 1) + 'コマ目をAIが読み取っています…（1コマにつき数十秒かかります）';
          const fileBase64 = await fileToBase64(file);
          const lec = aiLectures[i] && !aiLectures[i].placeholder ? aiLectures[i] : null;
          // 範囲（セミナー名・このコマの題名と講師・その日の流れ）も、渡す。AIは、この講義に関係する話題だけから、出題する
          const res = await api('adminGenerateQuestions', { fileBase64: fileBase64, mime: file.type, count: plan[i], seminarName: nameInput.value.trim(), topic: lec ? lec.title : '', speaker: lec ? lec.speaker : '', komaNo: i + 1, komaCount: k, schedule: scheduleInput.value.trim() });
          if (!res.ok) { notes.push((i + 1) + 'コマ目：' + (AI_ERRORS[res.error] || '作成できませんでした。')); continue; }
          // 空の初期の問題欄（何も入力していない1問）は、取り除いてから追加する
          state.questions = state.questions.filter(function (q) { return q.text || q.choices.some(function (c) { return c.correct; }); });
          const room = MAX_Q - state.questions.length;
          const toAdd = res.questions.slice(0, Math.max(0, Math.min(plan[i], room)));
          dropped += res.questions.length - toAdd.length;
          toAdd.forEach(function (q) {
            state.questions.push({ text: q.text, hint: q.hint || '', explanation: q.explanation, basis: q.basis || '', choices: q.choices.map(function (c) { return { text: c, correct: q.correct.indexOf(c) >= 0 }; }) });
          });
          added += toAdd.length;
          if (res.droppedNoBasis) notes.push((i + 1) + 'コマ目：レジュメに根拠が見つからない問題が' + res.droppedNoBasis + '問あったため、外しました。');
          if (res.schedule && !scheduleInput.value.trim()) scheduleInput.value = res.schedule;
          if (res.digest && !digestInput.value.trim()) digestInput.value = res.digest;
        }
        if (!state.questions.length) state.questions = [newQuestion()];
        renderQuestions();
        scheduleAuto(); // AIが作った問題も、自動で保存する
        aiMsg.className = notes.length ? 'err' : 'muted';
        aiMsg.textContent = added + '問を追加しました（いまの問題は ' + state.questions.length + '問）。内容を確認し、必要なら直してから保存してください。' +
          (dropped ? '（1日' + MAX_Q + '問の上限のため、' + dropped + '問は追加しませんでした。）' : '') + (notes.length ? '\n' + notes.join('\n') : '');
      } catch (e) {
        aiMsg.className = 'err'; aiMsg.textContent = '通信エラーです。もう一度お試しください。' + (added ? '（それまでに追加した ' + added + '問は、画面に残っています。）' : '');
        if (added) renderQuestions();
      }
      aiBtn.disabled = false; aiBtn.textContent = 'AIで問題を作成';
    } }, 'AIで問題を作成');
    const aiCard = h('div', { class: 'card', 'data-sec': 'test' }, [
      h('h2', {}, 'レジュメからAIで問題を作成'),
      h('p', { class: 'muted' }, '理解度確認テストは、1日のセミナーの最後に行います。この日のタイムスケジュールの講義ごとに、レジュメ（PDF・Word・PowerPoint・写真）を選ぶと、その内容から、〇×で答える問題と解説を作ります。作られた問題は、下の「理解度確認テストの問題」に入るので、内容を確認して、必要なら直してください（変更は、自動で保存されます）。'),
      komaRow,
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
        scheduleInput.value = res.seminar.schedule || ''; digestInput.value = res.seminar.digest || ''; updateKoma();
        typeSel.value = res.seminar.type || 'セミナー'; statusSel.value = res.seminar.status || '';
        dateInput.value = res.seminar.date || ''; timeInput.value = res.seminar.time || ''; descInput.value = res.seminar.description || '';
        courseInput.value = res.seminar.course || ''; syncCourseSel(); capInput.value = res.seminar.capacity || ''; homeworkInput.value = res.seminar.homework || ''; exerciseInput.value = res.seminar.exercise || '';
        state.selected = {}; res.teachers.forEach(function (n) { state.selected[n] = true; });
        state.questions = res.questions.length ? res.questions.map(function (q) {
          return { text: q.text, hint: q.hint || '', explanation: q.explanation, choices: q.choices.map(function (c) { return { text: c, correct: q.correct.indexOf(c) >= 0 }; }) };
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
        payloadQuestions.push({ text: q.text, hint: (q.hint || '').trim(), choices: q.choices.map(function (c) { return c.text; }).filter(Boolean), correct: q.choices.filter(function (c) { return c.correct; }).map(function (c) { return c.text; }).filter(Boolean), explanation: q.explanation });
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
          questions: state.questions.filter(function (q) { return q.text.trim(); }).map(function (q) { return { text: q.text.trim(), hint: (q.hint || '').trim(), choices: isMaru(q.choices) ? null : q.choices.map(function (c) { return c.text; }).filter(Boolean) }; }),
          teachers: Object.keys(state.selected).filter(function (k) { return state.selected[k]; }),
          url: 'https://kashiye-ui.github.io/hananooka-test/?seminar=' + encodeURIComponent(id),
        }, id + '-理解度確認テスト.pdf');
        flyerMsg.className = 'muted'; flyerMsg.textContent = 'ダウンロードしました。';
      } catch (e) {
        flyerMsg.textContent = '作成できませんでした。通信状況をご確認のうえ、もう一度お試しください。';
      }
      flyerBtn.disabled = false; flyerBtn.textContent = '当日配布用A4シートをPDFでダウンロード';
    } }, '当日配布用A4シートをPDFでダウンロード');

    // ---- ほかの回の時間割を、ひな型にする（同じ連続講座の、ほかの回の、開催時間とタイムスケジュールを、コピーして、この回の内容に直す） ----
    // 開催時間（枠）は、連続講座で共通なことが多い。資料に書かれていない回でも、ほかの回の時間割をコピーして、内容だけ直せばよい
    const tplMsg = h('p', { class: 'muted' });
    const tplBox = h('div', { class: 'tplbox' });
    const tplBtn = h('button', { type: 'button', class: 'mini', onclick: async function () {
      tplMsg.className = 'muted'; tplMsg.textContent = '';
      const cur = courseInput.value.trim();
      if (!cur) { tplMsg.className = 'err'; tplMsg.textContent = '先に、「連続講座」を選んでください（同じ連続講座の、ほかの回から、コピーします）。'; return; }
      tplBtn.disabled = true;
      try {
        const arc = await api('adminListArchive', {});
        const myId = idInput.value.trim();
        const others = ((arc && arc.seminars) || []).filter(function (x) { return x.course === cur && x.id !== myId; })
          .sort(function (a, b) { return (a.date || '9') < (b.date || '9') ? -1 : 1; });
        if (!others.length) { tplMsg.className = 'err'; tplMsg.textContent = '同じ連続講座の、ほかの回が、まだありません。'; return; }
        const sel = h('select', {}, others.map(function (x) { return h('option', { value: x.id }, (x.date ? A.ymd(x.date) + '　' : '') + x.name); }));
        const go = h('button', { type: 'button', class: 'mini', onclick: async function () {
          go.disabled = true;
          try {
            const g = await api('adminGetSeminar', { seminarId: sel.value });
            if (!g.ok) { tplMsg.className = 'err'; tplMsg.textContent = '読み込めませんでした。'; return; }
            const sm = g.seminar;
            if (!String(sm.schedule || '').trim() && !String(sm.time || '').trim()) { tplMsg.className = 'err'; tplMsg.textContent = 'その回には、時間割も開催時間も、入っていません。'; return; }
            const now = scheduleInput.value.trim();
            if (now && now !== String(sm.schedule || '').trim() && !confirm('いまのタイムスケジュールを、コピーした内容で、置き換えます。よろしいですか？')) return;
            if (sm.schedule) { scheduleInput.value = sm.schedule; scheduleInput.dispatchEvent(new Event('input', { bubbles: true })); }
            if (!timeInput.value.trim() && sm.time) { timeInput.value = sm.time; timeInput.dispatchEvent(new Event('input', { bubbles: true })); }
            tplMsg.className = 'muted';
            tplMsg.textContent = 'コピーしました（自動で保存されます）。時刻は、そのまま使えます。講義やワークの内容を、この回に合わせて、直してください。';
          } catch (e) { tplMsg.className = 'err'; tplMsg.textContent = '通信エラーです。もう一度お試しください。'; }
          finally { go.disabled = false; }
        } }, 'この回にコピー');
        tplBox.replaceChildren(sel, go);
      } catch (e) { tplMsg.className = 'err'; tplMsg.textContent = '通信エラーです。もう一度お試しください。'; }
      finally { tplBtn.disabled = false; }
    } }, 'ほかの回の時間割を、ひな型にする');
    // 時間割の案を作る（開催時間と、コマ数から。講義の内容と、ワークの内容は、あとから、直す）
    const komaPick = h('select', {}, [h('option', { value: '3' }, '3コマ（講義3つ＋ワーク）'), h('option', { value: '2' }, '2コマ（講義2つ＋ワーク）')]);
    const planBtn = h('button', { type: 'button', class: 'mini', onclick: function () {
      tplMsg.className = 'muted'; tplMsg.textContent = '';
      const n = Number(komaPick.value);
      const r = ttParse(timeInput.value) || [600, 710];
      const text = planTimetable(r[0], r[1], n);
      if (!text) { tplMsg.className = 'err'; tplMsg.textContent = '開催時間の枠が短すぎて、時間割の案を作れません。'; return; }
      const now = scheduleInput.value.trim();
      if (now && !confirm('いまのタイムスケジュールを、時間割の案で、置き換えます。よろしいですか？')) return;
      scheduleInput.value = text; scheduleInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (!ttParse(timeInput.value)) { timeInput.value = ttClock(r[0]) + '〜' + ttClock(r[1]); timeInput.dispatchEvent(new Event('input', { bubbles: true })); }
      tplMsg.textContent = '時間割の案を入れました（自動で保存されます）。「（講義の内容）」と「（内容）」の所を、この回に合わせて直してください。時間は、概算です。';
    } }, '時間割の案を作る');
    const tplRow = h('div', { class: 'tplrow' }, [h('span', { class: 'muted' }, '時間割の案：'), komaPick, planBtn, h('span', { class: 'muted' }, '／'), tplBtn, tplBox, tplMsg]);

    // 詳細ページに埋め込むとき（params.embed）は、セミナーの切り替えを出さず、data-sec の付いたカードを、タブごとに出し分ける
    show([
      params && params.embed ? null : sel,
      h('div', { class: 'card', 'data-sec': 'info' }, [
        h('div', { class: 'field' }, [h('label', {}, 'セミナーID（半角英数・ハイフン。例: 20260201-会場名）'), idInput]),
        h('div', { class: 'field' }, [h('label', {}, 'セミナー名'), nameInput]),
        h('div', { class: 'field' }, [h('label', {}, '会場名'), venueInput]),
        h('div', { class: 'field' }, [h('label', {}, '会場住所'), addressInput]),
        h('div', { class: 'field' }, [h('label', {}, 'タイムスケジュール（当日配布用A4シートに使用。演習・ワークの時間もここに含める）'), scheduleInput, tplRow]),
        h('div', { class: 'field' }, [h('label', {}, '内容ダイジェスト（当日配布用A4シートに使用）'), digestInput]),
        h('div', { class: 'field' }, [h('label', {}, '宿題（次回までの課題。その場の演習・ワークは含めない）'), homeworkInput]),
        h('div', { class: 'field' }, [h('label', {}, '演習・ワーク（その場で行うもの。宿題とは分ける）'), exerciseInput]),
      ]),
      h('div', { class: 'card', 'data-sec': 'info' }, [
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
      h('div', { class: 'card', 'data-sec': 'staff' }, [
        h('h2', {}, '登壇・参加する講師（チューター含む）'),
        h('p', { class: 'muted' }, 'ここで選んだ講師が、このセミナーの参加者が個別相談を希望したときの、「ご希望の先生」の候補になります。'),
        staffGrid,
      ]),
      aiCard,
      h('div', { class: 'card', 'data-sec': 'test' }, [h('h2', {}, '理解度確認テストの問題（〇×で答える問題）'), h('p', { class: 'muted' }, '「正しいか、間違いか」で答えられる文章を書き、正解を〇か×で選びます。問題は、当日配布用A4シートにも印刷されます。AIが作った問題が合わないときは、自分で問題を書いて、解説とヒントだけ、「AIに解説とヒントを書いてもらう」で作ることもできます。'), refDrop.box, qOver, qList, addQBtn]),
      msg, okMsg, saveBtn,
      h('div', { class: 'card', 'data-sec': 'info' }, [
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
  window.Admin.seminarForm = editView; // 詳細ページ（seminar-detail.js）から、タブの中に埋め込んで使う
  window.Admin.views['seminar/edit'] = function (box, params) {
    const sub = window.Admin.h('div');
    box.replaceChildren(modeBar('seminar/edit'), sub);
    return editView(sub, params);
  };
})();
