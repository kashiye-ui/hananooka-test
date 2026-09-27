(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const app = document.getElementById('app');
  let idToken = null;

  // ---- DOM ヘルパー ----
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function show(nodes) { app.replaceChildren.apply(app, [].concat(nodes).filter(Boolean)); window.scrollTo(0, 0); }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = reject;
      document.head.appendChild(el);
    });
  }
  async function api(action, payload) {
    const r = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: Object.assign({ idToken: idToken }, payload) }) });
    return r.json();
  }
  // レジュメのファイルを、GASに送れる形（base64・data:プレフィックスなし）にする
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  const AI_ACCEPT_MIME = {
    'application/pdf': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
    'image/jpeg': true, 'image/png': true,
  };

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
      const explArea = h('textarea', { rows: '5', maxlength: '600', placeholder: '解説（300〜400字程度。理由だけでなく背景や具体例も入れて読み応えを。末尾に「詳しくは個別にご相談ください」など）' }, q.explanation);
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
  function forbiddenView(userId) {
    show(h('div', { class: 'card' }, [
      h('h2', {}, '権限がありません'),
      h('p', {}, 'このLINEアカウントは、管理者として登録されていません。'),
      h('p', {}, '柏原さんに、次のIDを「担当者」シートに追加してもらい、「管理者」列に○を付けてもらってください。'),
      h('p', { class: 'muted' }, 'あなたのLINEユーザーID：'),
      h('p', { style: 'font-family:monospace;word-break:break-all;background:#f6f1ea;padding:8px;border-radius:8px;' }, userId),
    ]));
  }

  async function mainView(name) {
    const staffRes = await api('adminListStaff', {});
    const seminarsRes = await api('adminListSeminars', {});
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
    const pdfInput = h('input', { type: 'text', maxlength: '300', placeholder: '特典PDFのURL（任意）' });
    const scheduleInput = h('textarea', { rows: '4', maxlength: '600', placeholder: '例：\n13:00〜 相続の基本\n14:00〜 遺言の書き方\n（AIで問題を作成すると、レジュメから自動で下書きされます）' });
    const digestInput = h('textarea', { rows: '4', maxlength: '1000', placeholder: '本日の内容を3〜5行程度で（配布用A4シートに使います。AIで問題を作成すると自動で下書きされます）' });

    const staffGrid = h('div', { class: 'staffgrid' });
    function renderStaff() {
      staffGrid.replaceChildren.apply(staffGrid, staffRes.staff.map(function (s) {
        const card = h('div', { class: 'staffcard' + (state.selected[s.name] ? ' on' : '') }, [
          h('img', { src: s.photo, alt: s.name }),
          h('div', { class: 'n' }, s.name),
          s.role ? h('div', { class: 'r' }, s.role) : null,
        ].filter(Boolean));
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
    } }, '＋ 問題を追加（最大6問。1コマ2〜3問が目安）');

    // ---- レジュメからAIで問題を作成 ----
    const aiFile = h('input', { type: 'file', accept: '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png' });
    const aiCount = h('select', {}, ['2', '3'].map(function (n) { const o = h('option', { value: n }, n + '問'); if (n === '3') o.selected = true; return o; }));
    const aiMsg = h('p', { class: 'err' });
    const aiBtn = h('button', { type: 'button', class: 'btn', style: 'margin-top:10px', onclick: async function () {
      aiMsg.textContent = '';
      const file = aiFile.files[0];
      if (!file) { aiMsg.textContent = 'ファイルを選んでください。'; return; }
      if (!AI_ACCEPT_MIME[file.type]) { aiMsg.textContent = 'この形式には対応していません（PDF・Word・PowerPoint・JPG・PNGのいずれかにしてください）。'; return; }
      if (file.size > 15 * 1024 * 1024) { aiMsg.textContent = 'ファイルが大きすぎます（15MBまで）。'; return; }
      aiBtn.disabled = true; aiBtn.textContent = 'AIが読み取っています…（数十秒かかります）';
      try {
        const fileBase64 = await fileToBase64(file);
        const res = await api('adminGenerateQuestions', { fileBase64: fileBase64, mime: file.type, count: Number(aiCount.value) });
        if (!res.ok) {
          aiMsg.textContent = {
            no_api_key: 'AI機能の準備がまだできていません（APIキー未設定）。',
            unsupported_format: 'この形式には対応していません。',
            read_failed: 'ファイルを読み取れませんでした。',
            empty_document: '内容を読み取れませんでした。別のファイルでお試しください。',
            ai_failed: 'AIの呼び出しに失敗しました。もう一度お試しください。',
            parse_failed: 'AIの応答を解析できませんでした。もう一度お試しください。',
            no_questions_generated: '問題を作れませんでした。内容が少ない資料かもしれません。',
          }[res.error] || '作成できませんでした。';
        } else {
          const room = 6 - state.questions.length;
          const toAdd = res.questions.slice(0, Math.max(0, room));
          toAdd.forEach(function (q) {
            state.questions.push({ text: q.text, explanation: q.explanation, choices: q.choices.map(function (c) { return { text: c, correct: q.correct.indexOf(c) >= 0 }; }) });
          });
          renderQuestions();
          let filled = '';
          if (res.schedule && !scheduleInput.value.trim()) { scheduleInput.value = res.schedule; filled += '・タイムスケジュール\n'; }
          if (res.digest && !digestInput.value.trim()) { digestInput.value = res.digest; filled += '・内容ダイジェスト\n'; }
          aiMsg.className = 'muted';
          aiMsg.textContent = toAdd.length + '問を追加しました。内容を確認し、必要なら直してから保存してください。' + (res.questions.length > toAdd.length ? '（問題数の上限のため、一部は追加されていません）' : '') + (filled ? '\n下書きも入力しました（確認・修正してください）：\n' + filled : '');
        }
      } catch (e) {
        aiMsg.className = 'err'; aiMsg.textContent = '通信エラーです。もう一度お試しください。';
      }
      aiBtn.disabled = false; aiBtn.textContent = 'AIで問題を作成';
    } }, 'AIで問題を作成');
    const aiCard = h('div', { class: 'card' }, [
      h('h2', {}, 'レジュメからAIで問題を作成'),
      h('p', { class: 'muted' }, '1コマぶんのレジュメ（PDF・Word・PowerPoint・写真）をアップロードすると、その内容から確認テストの問題を作ります。作られた問題は、下の「確認テストの問題」に追加されます。保存前に、必ず内容を確認してください。'),
      aiFile, aiCount, aiBtn, aiMsg,
    ]);

    function fillForm(seminarId) {
      idInput.value = seminarId; idInput.disabled = !!seminarId;
      okMsg.replaceChildren(); msg.textContent = '';
      if (!seminarId) {
        state.selected = {}; state.questions = [newQuestion()];
        nameInput.value = ''; venueInput.value = ''; addressInput.value = ''; pdfInput.value = '';
        scheduleInput.value = ''; digestInput.value = '';
        renderStaff(); renderQuestions();
        return;
      }
      api('adminGetSeminar', { seminarId: seminarId }).then(function (res) {
        if (!res.ok) { msg.textContent = '読み込めませんでした。'; return; }
        nameInput.value = res.seminar.name || ''; venueInput.value = res.seminar.venue || '';
        addressInput.value = res.seminar.address || ''; pdfInput.value = res.seminar.pdf || '';
        scheduleInput.value = res.seminar.schedule || ''; digestInput.value = res.seminar.digest || '';
        state.selected = {}; res.teachers.forEach(function (n) { state.selected[n] = true; });
        state.questions = res.questions.length ? res.questions.map(function (q) {
          return { text: q.text, explanation: q.explanation, choices: q.choices.map(function (c) { return { text: c, correct: q.correct.indexOf(c) >= 0 }; }) };
        }) : [newQuestion()];
        renderStaff(); renderQuestions();
      });
    }
    sel.addEventListener('change', function () { fillForm(sel.value); });

    const saveBtn = h('button', { class: 'btn', onclick: async function () {
      msg.textContent = ''; okMsg.replaceChildren();
      const id = idInput.value.trim();
      if (!id) { msg.textContent = 'セミナーIDを入力してください。'; return; }
      const payloadQuestions = [];
      state.questions.forEach(function (q) {
        payloadQuestions.push({ text: q.text, choices: q.choices.map(function (c) { return c.text; }).filter(Boolean), correct: q.choices.filter(function (c) { return c.correct; }).map(function (c) { return c.text; }).filter(Boolean), explanation: q.explanation });
      });
      const teachers = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
      saveBtn.disabled = true; saveBtn.textContent = '保存中…';
      try {
        const res = await api('adminSaveSeminar', {
          seminar: {
            id: id, name: nameInput.value.trim(), venue: venueInput.value.trim(), address: addressInput.value.trim(), pdf: pdfInput.value.trim(),
            schedule: scheduleInput.value.trim(), digest: digestInput.value.trim(),
          },
          teachers: teachers, questions: payloadQuestions,
        });
        if (!res.ok) {
          msg.textContent = { invalid_seminar_id: 'セミナーIDは半角英数字・ハイフンで入力してください。', no_questions: '問題を1つ以上、正しく入力してください。', correct_not_in_choices: '正解には、選択肢に書いた文字と同じものを選んでください。' }[res.error] || '保存できませんでした。';
        } else {
          okMsg.replaceChildren(
            h('p', {}, '保存しました。'),
            h('p', {}, [h('a', { href: res.testUrl, target: '_blank' }, '確認テストを開く')]),
            h('img', { src: 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(res.testUrl), alt: '確認テストのQRコード', width: '160', height: '160' })
          );
          if (!seminarsRes.seminars.some(function (s) { return s.id === id; })) {
            sel.appendChild(h('option', { value: id }, id + '（' + nameInput.value.trim() + '）'));
            seminarsRes.seminars.push({ id: id, name: nameInput.value.trim() });
          }
          sel.value = id; idInput.disabled = true;
        }
      } catch (e) {
        msg.textContent = '通信エラーです。もう一度お試しください。';
      }
      saveBtn.disabled = false; saveBtn.textContent = 'このセミナーを保存';
    } }, 'このセミナーを保存');

    // ---- 当日配布用A4シート（PDF） ----
    const flyerMsg = h('p', { class: 'err' });
    const flyerBtn = h('button', { type: 'button', class: 'btn', onclick: async function () {
      flyerMsg.textContent = '';
      const id = idInput.value.trim();
      if (!id) { flyerMsg.textContent = 'セミナーIDがありません。先に保存してください。'; return; }
      flyerBtn.disabled = true; flyerBtn.textContent = '作成中…';
      try {
        const res = await api('adminBuildFlyer', { seminarId: id });
        if (!res.ok) {
          flyerMsg.textContent = res.error === 'not_found' ? '先にこのセミナーを保存してください。' : '作成できませんでした。もう一度お試しください。';
        } else {
          const bytes = atob(res.pdfBase64);
          const arr = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }));
          const a = h('a', { href: url, download: res.fileName });
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        }
      } catch (e) {
        flyerMsg.textContent = '通信エラーです。もう一度お試しください。';
      }
      flyerBtn.disabled = false; flyerBtn.textContent = '当日配布用A4シートをPDFでダウンロード';
    } }, '当日配布用A4シートをPDFでダウンロード');

    show([
      h('p', {}, name ? name + 'さん、こんにちは。' : ''),
      sel,
      h('div', { class: 'card' }, [
        h('div', { class: 'field' }, [h('label', {}, 'セミナーID（半角英数・ハイフン。例: 20260201-会場名）'), idInput]),
        h('div', { class: 'field' }, [h('label', {}, 'セミナー名'), nameInput]),
        h('div', { class: 'field' }, [h('label', {}, '会場名'), venueInput]),
        h('div', { class: 'field' }, [h('label', {}, '会場住所'), addressInput]),
        h('div', { class: 'field' }, [h('label', {}, '特典PDF URL'), pdfInput]),
        h('div', { class: 'field' }, [h('label', {}, 'タイムスケジュール（当日配布用A4シートに使用）'), scheduleInput]),
        h('div', { class: 'field' }, [h('label', {}, '内容ダイジェスト（当日配布用A4シートに使用）'), digestInput]),
      ]),
      h('div', { class: 'card' }, [h('h2', {}, '登壇する講師'), staffGrid]),
      aiCard,
      h('div', { class: 'card' }, [h('h2', {}, '確認テストの問題'), qList, addQBtn]),
      msg, okMsg, saveBtn,
      h('div', { class: 'card' }, [
        h('h2', {}, '当日配布用A4シート'),
        h('p', { class: 'muted' }, 'タイムスケジュール・内容ダイジェスト・担当講師・確認テストのQRコードを1枚にまとめたPDFを作ります（先にこのセミナーを保存してください）。'),
        flyerBtn, flyerMsg,
      ]),
    ]);
  }

  (async function init() {
    if (!CFG.GAS_URL || !CFG.LIFF_ID) return show(h('p', { class: 'err' }, 'GAS_URL / LIFF_ID が設定されていません（config.js）。'));
    try {
      await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js');
      await liff.init({ liffId: CFG.LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      idToken = liff.getIDToken();
      const res = await api('adminCheck', {});
      if (!res.ok) return show(h('p', { class: 'err' }, 'ログインを確認できませんでした。もう一度お試しください。'));
      if (!res.isAdmin) return forbiddenView(res.userId);
      await mainView(res.name);
    } catch (e) {
      show(h('p', { class: 'err' }, '読み込めませんでした。通信状況をご確認ください。'));
    }
  })();
})();
