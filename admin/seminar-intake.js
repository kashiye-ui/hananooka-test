// 打ち合わせ資料から、講座の各回を下書きとして自動登録する
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  const ERRORS = {
    no_api_key: 'AI機能の準備がまだできていません（APIキー未設定）。',
    unsupported_format: 'この形式には対応していません。',
    read_failed: 'ファイルを読み取れませんでした。',
    empty_document: '内容を読み取れませんでした。別のファイルでお試しください。',
    ai_failed: 'AIの呼び出しに失敗しました。もう一度お試しください。',
    parse_failed: 'AIの応答を解析できませんでした。もう一度お試しください。',
    truncated: '資料の回数・内容が多く、AIの回答が長すぎて途中で切れました。回数を分けて（例：前半・後半で資料を分けて）お試しください。',
    no_sessions_found: '各回の情報を見つけられませんでした。資料に、開催日ごとの内容が書かれているか確認してください。',
  };

  async function view(box) {
    const listRes = await api('adminListArchive', {});
    const existingIds = {};
    (listRes.ok ? listRes.seminars : []).forEach(function (s) { existingIds[s.id] = true; });

    const file = h('input', { type: 'file', accept: '.pdf,.docx,.pptx,.jpg,.jpeg,.png' });
    const msg = h('p', { class: 'err' });
    const result = h('div');
    const btn = h('button', { type: 'button', class: 'btn', onclick: async function () {
      msg.textContent = ''; msg.className = 'err'; result.replaceChildren();
      const f = file.files[0];
      if (!f) { msg.textContent = 'ファイルを選んでください。'; return; }
      if (!A.AI_ACCEPT_MIME[f.type]) { msg.textContent = 'この形式には対応していません（Word・PDF・PowerPoint・JPG・PNGのいずれかにしてください）。'; return; }
      if (f.size > 15 * 1024 * 1024) { msg.textContent = 'ファイルが大きすぎます（15MBまで）。'; return; }
      btn.disabled = true; btn.textContent = '読み取っています…（打ち合わせフォームはすぐ終わります。それ以外の資料は、AIが読むため、1分ほどかかります）';
      try {
        const res = await api('adminIntakeMeeting', { fileBase64: await A.fileToBase64(f), mime: f.type });
        if (!res.ok) msg.textContent = ERRORS[res.error] || '読み取れませんでした。';
        else showResult(res, existingIds);
      } catch (e) {
        msg.textContent = '通信エラーです。もう一度お試しください。';
      }
      btn.disabled = false; btn.textContent = '資料を読み取る';
    } }, '資料を読み取る');

    // 講座コードを、最初の回の日付（年月日）と、会場名から自動で作る。例: 20270906 と「伊奈町総合センター」→ 270906 + 4文字 → 270906k3f9
    // 会場名（日本語）は、そのまま半角英数字にできないので、同じ会場名なら同じ4文字になる短い符号に変えて付ける
    function autoCode(c, sessions) {
      const dates = sessions.map(function (s) { return s.date; }).filter(Boolean).sort();
      const d = (dates[0] || '').replace(/-/g, '').slice(2); // YYMMDD
      const src = String(c.venue || c.name || '').replace(/[\s　]/g, '');
      let hsh = 5381;
      for (let i = 0; i < src.length; i++) hsh = ((hsh * 33) ^ src.charCodeAt(i)) >>> 0;
      const sig = (src ? hsh.toString(36) : 'kouza').slice(-4).padStart(4, '0');
      return (d + sig).slice(0, 20) || 'kouza';
    }

    function showResult(res, existing) {
      const c = res.course;
      const code = h('input', { type: 'text', maxlength: '20', value: autoCode(c, res.sessions), placeholder: '半角英数字' });
      const checks = [];
      const out = h('p', { class: 'muted' });

      const cards = res.sessions.map(function (s, i) {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!s.date;
        cb.disabled = !s.date;
        checks.push(cb);
        return h('div', { class: 'card' }, [
          h('label', { class: 'arow-top' }, [cb, h('strong', {}, (s.date ? A.ymd(s.date) : '日付が読み取れません') + (s.time ? '　' + s.time : ''))]),
          h('div', { class: 'stitle' }, s.name || c.name + ' 第' + (i + 1) + '回'),
          s.theme ? h('div', {}, 'テーマ：' + s.theme) : null,
          h('div', {}, '講師・チューター：' + (s.teachers.length ? s.teachers.join('、') : '（照合できた方なし）')),
          s.unmatched.length ? h('div', { class: 'err' }, '担当者シートに見つからなかった名前：' + s.unmatched.join('、') + '（メンバー登録後に、編集画面で選んでください）') : null,
          s.komas && s.komas.length ? h('div', { class: 'muted' }, 'コマ数：' + s.komas.length + '（理解度確認テストの問題は、登録後、コマごとのレジュメからAIで作れます。1日で最大6問）') : null,
          s.schedule ? h('pre', { class: 'pre' }, s.schedule) : null,
          s.homework ? h('div', {}, [h('strong', {}, '宿題：'), h('pre', { class: 'pre' }, s.homework)]) : null,
          !s.date ? h('div', { class: 'err' }, '開催日が読み取れなかったため、この回は登録できません。') : null,
        ]);
      });

      const registeredNow = {}; // この画面で登録できた回（失敗した回だけ、もう一度押して登録し直せるように）
      const regBtn = h('button', { type: 'button', class: 'btn', onclick: async function () {
        out.className = 'err'; out.textContent = '';
        const c0 = code.value.trim();
        if (!/^[A-Za-z0-9_\-]{1,20}$/.test(c0)) { out.textContent = '講座コードは、半角英数字で入力してください。'; return; }
        const todo = res.sessions.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return checks[x.i].checked && x.s.date; });
        if (!todo.length) { out.textContent = '登録する回にチェックを入れてください。'; return; }
        regBtn.disabled = true; regBtn.textContent = '登録中…';
        const lines = [];
        const link = function (id) { return h('a', { href: '#seminar/edit?id=' + encodeURIComponent(id) }, '編集する'); };
        // まとめて1回で登録する（1件ずつ呼ぶと、そのたびに数秒かかって遅いため）。すでにあるID・この画面で登録済みの回は、送らない
        const batch = [];
        for (const x of todo) {
          const s = x.s;
          const id = s.date.replace(/-/g, '') + '-' + c0;
          if (registeredNow[id]) { lines.push(h('div', {}, [A.ymd(s.date) + '：登録済みです　', link(id)])); continue; }
          if (existing[id]) { lines.push(h('div', { class: 'err' }, A.ymd(s.date) + '：同じID（' + id + '）のセミナーがすでにあるため、登録しませんでした。')); continue; }
          const desc = [s.description || c.description, c.target ? '対象：' + c.target : '', c.applyPeriod ? '申込期間：' + c.applyPeriod : ''].filter(String).join('\n');
          batch.push({ id: id, s: s, item: {
            seminar: { id: id, name: s.name || c.name + ' 第' + (x.i + 1) + '回', venue: c.venue, address: c.address, pdf: '', schedule: s.schedule, digest: s.digest,
              type: s.type || 'セミナー', status: '', date: s.date, time: s.time, description: desc, course: c.name, capacity: c.capacity || '', draft: true, homework: s.homework },
            teachers: s.teachers, questions: [],
          } });
        }
        if (batch.length) {
          try {
            const r = await api('adminSaveSeminars', { items: batch.map(function (b) { return b.item; }) });
            const byId = {};
            (r.ok ? r.results : []).forEach(function (x) { byId[x.id] = x; });
            batch.forEach(function (b) {
              const x = byId[b.id];
              if (x && x.ok) { existing[b.id] = true; registeredNow[b.id] = true; lines.push(h('div', {}, [A.ymd(b.s.date) + '：下書きとして登録しました　', link(b.id)])); }
              else lines.push(h('div', { class: 'err' }, A.ymd(b.s.date) + '：登録できませんでした（' + ((x && x.error) || (r.ok ? 'エラー' : (r.error || 'エラー'))) + '）。'));
            });
          } catch (e) {
            batch.forEach(function (b) { lines.push(h('div', { class: 'err' }, A.ymd(b.s.date) + '：通信エラーで登録できませんでした。もう一度ボタンを押すと、登録できていない回だけ、登録し直します。')); });
          }
        }
        out.className = ''; out.replaceChildren.apply(out, lines.concat([h('p', { class: 'muted' }, '登録したものは「案内には出さない」状態の下書きです。内容を確認し、編集画面で「開催予定として案内する」にすると、セミナーページに載って申込みが始まります。')]));
        regBtn.disabled = false; regBtn.textContent = '選んだ回を下書きとして登録';
      } }, '選んだ回を下書きとして登録');

      result.replaceChildren.apply(result, [
        h('div', { class: 'card' }, [
          h('h2', {}, '読み取った講座の情報'),
          h('div', {}, '講座名：' + (c.name || '（読み取れませんでした）')),
          c.organizer ? h('div', {}, '主催：' + c.organizer) : null,
          c.venue ? h('div', {}, '会場：' + c.venue + (c.address ? '（' + c.address + '）' : '')) : null,
          c.target ? h('div', {}, '対象：' + c.target) : null,
          c.capacity ? h('div', {}, '定員：' + c.capacity + '名') : null,
          c.applyPeriod ? h('div', {}, '申込期間：' + c.applyPeriod) : null,
          h('p', { class: 'muted' }, res.source === 'form' ? '打ち合わせフォームから、AIを使わずに読み取りました。書かれていない項目は、空のままです。登録後、編集画面で内容を確認してください。' : 'AIの読み取り結果です。登録後、編集画面で必ず内容を確認してください。'),
        ]),
        (res.warnings && res.warnings.length) ? h('div', { class: 'card', style: 'border:2px solid #e0a23a' }, [h('strong', {}, '確認してください'), h('ul', {}, res.warnings.map(function (w) { return h('li', {}, w); }))]) : null,
        h('div', { class: 'card' }, [
          h('label', { class: 'f', for: 'code' }, '講座コード（日付と会場名から、自動で作りました。通常は、そのままで大丈夫です。例: 270906k3f9 → 20270906-270906k3f9）'),
          code,
        ]),
        h('h2', {}, '各回（' + res.sessions.length + '回）'),
      ].filter(Boolean).concat(cards, [out, regBtn]));
    }

    box.replaceChildren(
      h('div', { class: 'card' }, [
        h('h2', {}, '打ち合わせ資料から自動登録'),
        h('p', { class: 'muted' }, '専用の「打ち合わせフォーム（第2版）」に書いた資料は、AIを使わず、書かれたとおりに、すぐ読み取ります（講座の基本情報、各回の開催日・時間・テーマ、登壇講師・チューター、コマごとの時間・内容・講師・レジュメ、ダイジェスト、宿題など、すべての項目に対応しています）。それ以外の形式の資料（Word・PDF・PowerPoint・写真）は、AIが読み取るため、1分ほどかかります。'),
        h('p', {}, [
          h('a', { href: '../templates/meeting-form.docx?v=2', download: '花の丘セミナー_打ち合わせフォーム（第2版）.docx' }, '打ち合わせフォーム（第2版・Word）をダウンロード'),
        ]),
        file, btn, msg,
      ]),
      result
    );
  }

  A.views['seminar/intake'] = view;
})();
