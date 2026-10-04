// メンバー管理: 一覧、名刺からの新規登録、編集（コメント・得意分野タグ・顔写真・名刺画像）
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;
  // 名刺画像の縮小サイズ。開くたびにドライブから読み込むため、印刷して配る名刺程度に読めれば十分な軽さにする
  const CARD_MAX_DIM = 1280, CARD_QUALITY = 0.8;

  const SAVE_ERRORS = {
    name_required: 'お名前を入力してください。',
    invalid_email: 'メールアドレスの形式が正しくありません。',
    duplicate_name: 'すでに同じお名前のメンバーがいます。お名前で区別できるようにしてください。',
    invalid_line_url: 'LINEの友だち追加リンクは、https://line.me/ti/p/… または https://lin.ee/… の形で入れてください。',
    cannot_remove_self_admin: 'ご自分の管理者の権限は、外せません（他の管理者の方にお願いしてください）。',
    last_admin: '管理者が1人もいなくなるため、外せません。',
    image_too_large: '画像が大きすぎます。',
    image_failed: '画像を保存できませんでした。Googleドライブの利用の承認が済んでいるかを確認してください。',
    not_found: 'メンバーが見つかりませんでした。',
  };
  const EXTRACT_ERRORS = {
    no_api_key: 'AI機能の準備がまだできていません（APIキー未設定）。',
    unsupported_format: '名刺は、写真（JPG・PNG）かPDFでアップロードしてください。',
    ai_failed: 'AIの呼び出しに失敗しました。もう一度お試しください。',
    parse_failed: 'AIの応答を解析できませんでした。もう一度お試しください。',
    read_failed: 'ファイルを読み取れませんでした。',
  };

  // ---- 一覧 ----
  async function listView(box) {
    const res = await A.apiSwr('adminListMembers', {}, function (fresh) { res.members = fresh.members; draw(); });
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const q = h('input', { type: 'text', placeholder: 'お名前・得意分野で絞り込み' });
    const onlyAlert = h('input', { type: 'checkbox' });
    const alertCount = h('span', { class: 'muted' });
    const list = h('div');

    // 一覧は、1人あたり3行（名前／事務所名・肩書／得意分野）にコンパクトに。タップすると編集画面が開く
    // 一覧に出す「得意分野」: 管理者が入れたタグに、先生がLINEで答えた「得意」（相談の自動マッチング用）を加える。同じものは1つにまとめる
    function specialties(m) {
      const out = [];
      (m.skill || []).concat(m.avail || []).forEach(function (t) { if (t && out.indexOf(t) < 0) out.push(t); });
      return out;
    }
    // 一覧のチップ: 得意分野＝緑、受けられるカテゴリー（得意以外）＝ピンク、管理者が付けた名簿用のタグ＝これまでの色
    function chipsFor(m) {
      const skill = m.skill || [], avail = (m.avail || []).filter(function (t) { return skill.indexOf(t) < 0; });
      return skill.map(function (t) { return h('span', { class: 'chip cat-skill' }, t); })
        .concat(avail.map(function (t) { return h('span', { class: 'chip cat-avail' }, t); }));
    }

    function card(m) {
      return h('div', { class: 'card mrow', onclick: function () { A.go('members/edit', { id: m.id }); } }, [
        h('img', { src: m.photo, alt: m.name, class: 'mphoto sm' }),
        h('div', { class: 'mbody' }, [
          h('div', { class: 'mline1' }, [
            h('strong', {}, m.name),
            m.isAdmin ? h('span', { class: 'chip green' }, '管理者') : null,
            m.kubun === '新会員' ? h('span', { class: 'chip on' }, '新会員') : null,
            !m.linked ? h('span', { class: 'chip off' }, '未連携') : null,
          ]),
          h('div', { class: (m.org || (m.blankOk || []).indexOf('org') >= 0) ? 'muted' : 'muted none' }, (m.org || ((m.blankOk || []).indexOf('org') >= 0 ? '－' : '（事務所名・肩書 未入力）')) + (m.area ? '　／　' + m.area : '')),
          h('div', { class: 'schips', style: 'margin:2px 0 0' }, specialties(m).length ? chipsFor(m) : [h('span', { class: 'muted none' }, '（得意分野なし）')]),
          (m.alerts || []).length ? h('div', {}, m.alerts.map(function (a) { return h('div', { class: 'palert soon' }, '⚠ ' + a.text); })) : null,
        ]),
      ]);
    }

    // 入力のない項目（「空欄でよい」の「－」で答えていないもの）がある先生にだけ、案内を送る。送る前に、対象を見せて確認する
    // カテゴリーの名前を新しいものに更新する（初回のみ。何度押しても、同じ結果）。確認のあと、実行する
    const migrateBtn = h('button', { type: 'button', class: 'mini', onclick: async function () {
      const label = 'カテゴリー名を新しい名前に更新（初回のみ）';
      migrateBtn.disabled = true; migrateBtn.textContent = '確認中…';
      try {
        const pre = await api('adminMigrateCategories', { dryRun: true });
        if (!pre.ok) alert('確認できませんでした。');
        else if (!pre.staff && !pre.consults && !pre.tagsChanged) alert('すでに、新しい名前になっています。更新の必要はありません。');
        else if (confirm('カテゴリーの名前を、新しいものに更新します。' + String.fromCharCode(10) + String.fromCharCode(10) + '・先生の「受けられるカテゴリー」「得意分野」: ' + pre.staff + '名' + String.fromCharCode(10) + '・相談の記録の「カテゴリー」: ' + pre.consults + '件' + String.fromCharCode(10) + '・カテゴリーの一覧: ' + (pre.tagsChanged ? '更新あり' : '変更なし') + String.fromCharCode(10) + String.fromCharCode(10) + '（不動産・空き家→空き家、認知症対策・後見→認知症対策／後見、会社・法人→法人、生前対策・終活→終活、医療・介護→医療／介護、葬儀・供養→葬儀／供養、在宅介護・リフォーム→リフォーム）' + String.fromCharCode(10) + '得意分野は、3つまでに収めます。よろしいですか？')) {
          migrateBtn.textContent = '更新中…';
          const r = await api('adminMigrateCategories', {});
          alert(r.ok ? '更新しました。' : '更新できませんでした。');
          if (r.ok) { A._swr = {}; try { localStorage.removeItem('kl_swr_v1'); } catch (e) { /* 消せなくてもよい */ } location.reload(); return; }
        }
      } catch (e) { alert('通信エラーです。'); }
      migrateBtn.disabled = false; migrateBtn.textContent = label;
    } }, 'カテゴリー名を新しい名前に更新（初回のみ）');

    const profileAllBtn = h('button', { type: 'button', class: 'mini', onclick: async function () {
      const label = '入力のない先生に「#プロフィール」の案内を送る';
      profileAllBtn.disabled = true; profileAllBtn.textContent = '確認中…';
      try {
        const pre = await api('adminSendProfileInvite', { all: true, dryRun: true });
        if (!pre.ok) { alert('対象を確認できませんでした。'); }
        else if (!pre.total) { alert('入力のない項目がある先生は、いません。送る必要はありません。'); }
        else if (confirm('入力のない項目がある先生、' + pre.total + '名に、プロフィール入力の案内をLINEで送ります。\n\n' + pre.names.join('、') + '\n\nよろしいですか？')) {
          profileAllBtn.textContent = '送信中…';
          const r = await api('adminSendProfileInvite', { all: true });
          alert(r.ok ? r.sent + '/' + r.total + '名に送りました。' : '送れませんでした。');
        }
      } catch (e) { alert('通信エラーです。'); }
      profileAllBtn.disabled = false; profileAllBtn.textContent = label;
    } }, '入力のない先生に「#プロフィール」の案内を送る');

    function draw() {
      const k = q.value.trim();
      const nAlert = res.members.filter(function (m) { return (m.alerts || []).length; }).length;
      alertCount.textContent = '確認が必要なメンバー ' + nAlert + '名';
      A.needMembers = nAlert; if (A.setBadges) A.setBadges();
      const rows = res.members.filter(function (m) { return (!onlyAlert.checked || (m.alerts || []).length) && (!k || m.name.indexOf(k) >= 0 || specialties(m).concat(m.avail || []).some(function (t) { return t.indexOf(k) >= 0; }) || m.org.indexOf(k) >= 0); });
      list.replaceChildren.apply(list, rows.length ? rows.map(card) : [h('p', {}, k ? '該当するメンバーがいません。' : 'まだメンバーが登録されていません。')]);
    }
    q.addEventListener('input', draw);
    onlyAlert.addEventListener('change', draw);
    draw();
    box.replaceChildren(
      h('p', { class: 'muted' }, 'メンバー ' + res.members.length + '名。タップすると、編集画面が開きます（名刺の確認、LINEへの案内の送信もそちらから）。'),
      h('div', { class: 'sacts' }, [profileAllBtn, migrateBtn]),
      h('label', { class: 'arow-top', style: 'margin:6px 0' }, [onlyAlert, h('span', {}, '確認が必要な人だけを出す　'), alertCount]),
      q, list
    );
  }

  async function sendOne(action, id, btn) {
    btn.disabled = true; const orig = btn.textContent; btn.textContent = '送信中…';
    try {
      const r = await api(action, { memberId: id });
      alert(r.ok ? 'LINEに送りました。' : '送れませんでした。');
    } catch (e) { alert('通信エラーです。'); }
    btn.disabled = false; btn.textContent = orig;
  }

  // ---- 入力フォーム（新規・編集で共通） ----
  function memberForm(box, opts) {
    const m = opts.member, vocab = opts.vocab.slice();
    const isNew = opts.isNew;
    const state = { tags: {}, photo: null, removePhoto: false, cards: opts.card ? [opts.card] : [], removeCards: [] };
    (m.tags || []).forEach(function (t) { state.tags[t] = true; });

    const nameIn = h('input', { type: 'text', maxlength: '50', value: m.name || '', placeholder: '例: 柏原 雅幸' });
    const orgIn = h('input', { type: 'text', maxlength: '100', value: m.org || '', placeholder: '例: 司法書士法人かしのき事務所　司法書士' });
    const areaIn = h('input', { type: 'text', maxlength: '30', value: m.area || '', placeholder: '例: さいたま市西区（市区町村まで）' });
    const emailIn = h('input', { type: 'text', maxlength: '100', value: m.email || '' });
    const phoneIn = h('input', { type: 'text', maxlength: '30', value: m.phone || '' });
    const lineUrlIn = h('input', { type: 'text', maxlength: '200', value: m.lineUrl || '', placeholder: 'https://line.me/ti/p/…' });
    const COMMENT_MAX = 60; // 名刺シート印刷の1行に収まる長さ（LINEの「#プロフィール」でも、同じ60字まで）
    const commentIn = h('textarea', { rows: '2', maxlength: String(COMMENT_MAX), placeholder: 'お客様へのひとこと（60字まで）。名刺シートの印刷、専門家名簿、相談の紹介カードに使います。例: 相続のお悩みを、やさしくお聞きします。' }, m.comment || '');
    const commentCount = h('p', { class: 'muted' });
    const updateCommentCount = function () {
      const n = commentIn.value.length;
      commentCount.textContent = n + ' / ' + COMMENT_MAX + '字' + (n > COMMENT_MAX ? '（名刺シートには、先頭の' + COMMENT_MAX + '字ほどしか入りません。短くすることをおすすめします）' : '');
      commentCount.className = n > COMMENT_MAX ? 'err' : 'muted';
    };
    commentIn.addEventListener('input', updateCommentCount);
    updateCommentCount();
    const memoIn = h('textarea', { rows: '3', maxlength: '500', placeholder: '内部用のメモ（名刺の住所・URL・FAXなど）。お客様には表示されません。' }, m.memo || '');
    const blankKeys = {};
    (m.blankOk || []).forEach(function (k) { blankKeys[k] = true; });
    const blankBoxes = [['org', '事務所名・肩書'], ['area', '事務所の場所'], ['photo', '顔写真'], ['cards', '名刺'], ['comment', 'ひとこと']].map(function (it) {
      const cb = h('input', { type: 'checkbox' }); cb.checked = !!blankKeys[it[0]];
      return { key: it[0], cb: cb, el: h('label', { class: 'arow-top' }, [cb, h('span', {}, it[1])]) };
    });
    const kubunIn = h('select', {}, ['ベテラン', '新会員'].map(function (k) { return h('option', { value: k }, k); })); kubunIn.value = m.kubun === '新会員' ? '新会員' : 'ベテラン';
    const isAdmin = h('input', { type: 'checkbox' }); isAdmin.checked = !!m.isAdmin; isAdmin.disabled = !!m.isSelf;
    const msg = h('p', { class: 'err' });

    // 受けられるカテゴリー（複数可）と、得意分野（その中から3つまで）。相談の自動マッチングに使う。先生がLINEで答えた内容が、最初から入っていて、ここで直せる
    const availState = {}, skillState = {};
    (m.avail || []).forEach(function (t) { availState[t] = true; });
    (m.skill || []).forEach(function (t) { skillState[t] = true; });
    const catVocab = vocab.slice();
    (m.avail || []).concat(m.skill || []).forEach(function (t) { if (catVocab.indexOf(t) < 0) catVocab.push(t); }); // 一覧にない分野を答えていた先生も、そのまま選ばれた状態で出す
    const availBox = h('div', { class: 'schips tagbox' });
    const skillBox = h('div', { class: 'schips tagbox' });
    const skillMsg = h('p', { class: 'muted' });
    const SKILL_MAX = 3;
    function drawCats() {
      availBox.replaceChildren.apply(availBox, catVocab.map(function (t) {
        return h('button', { type: 'button', class: 'chip tagbtn cat-avail' + (availState[t] ? ' on' : ''), onclick: function () {
          availState[t] = !availState[t];
          if (!availState[t]) delete skillState[t]; // 受けられなくなった分野は、得意からも外す
          drawCats();
        } }, t);
      }));
      const avail = catVocab.filter(function (t) { return availState[t]; });
      const nSkill = avail.filter(function (t) { return skillState[t]; }).length;
      skillBox.replaceChildren.apply(skillBox, avail.length ? avail.map(function (t) {
        return h('button', { type: 'button', class: 'chip tagbtn cat-skill' + (skillState[t] ? ' on' : ''), onclick: function () {
          if (!skillState[t] && nSkill >= SKILL_MAX) { skillMsg.textContent = '得意分野は、' + SKILL_MAX + 'つまでです。先に、どれかを外してください。'; return; }
          skillMsg.textContent = '';
          skillState[t] = !skillState[t]; drawCats();
        } }, t);
      }) : [h('span', { class: 'muted' }, '先に、上で「受けられるカテゴリー」を選んでください。')]);
    }

    // 得意分野タグ
    const tagBox = h('div', { class: 'schips tagbox' });
    const newTag = h('input', { type: 'text', maxlength: '20', placeholder: '新しいカテゴリー（例: 農地の相続）' });
    const suggestBox = h('div', { class: 'schips' });
    function drawTags() {
      tagBox.replaceChildren.apply(tagBox, vocab.map(function (t) {
        return h('button', { type: 'button', class: 'chip tagbtn' + (state.tags[t] ? ' on' : ''), onclick: function () { state.tags[t] = !state.tags[t]; drawTags(); } }, t);
      }));
      suggestBox.replaceChildren.apply(suggestBox, (opts.suggest || []).filter(function (t) { return vocab.indexOf(t) < 0; }).map(function (t) {
        return h('button', { type: 'button', class: 'chip tagbtn suggest', onclick: function () { addTag(t); } }, '＋ 提案: ' + t);
      }));
    }
    async function addTag(name) {
      const t = (name || '').trim();
      if (!t) return;
      const r = await api('adminAddTag', { name: t });
      if (!r.ok) { msg.textContent = 'カテゴリーを追加できませんでした（20文字まで。「/」「、」「,」は使えません）。'; return; }
      msg.textContent = '';
      r.tags.forEach(function (x) { if (vocab.indexOf(x) < 0) vocab.push(x); });
      // 新しいカテゴリーは、一覧に加えて、この先生の「受けられるカテゴリー」に入れる
      if (catVocab.indexOf(t) < 0) catVocab.push(t);
      availState[t] = true; newTag.value = ''; drawCats();
    }
    drawTags(); drawCats();

    // 顔写真
    const photoImg = h('img', { class: 'mphoto big', src: m.photo || '', alt: '顔写真', hidden: !m.photo });
    const photoIn = h('input', { type: 'file', accept: 'image/jpeg,image/png' });
    const photoNote = h('p', { class: 'muted' }, m.hasPhoto ? '登録済みの顔写真があります。差し替えるときは、新しい写真を選んでください。' : '顔写真は任意です（未登録のときは、名前から作った仮アイコンが出ます）。');
    photoIn.addEventListener('change', async function () {
      const f = photoIn.files[0]; if (!f) return;
      try {
        state.photo = await A.resizeImage(f, 600, 0.85); state.removePhoto = false;
        photoImg.src = 'data:image/jpeg;base64,' + state.photo.base64; photoImg.hidden = false;
        photoNote.textContent = '新しい顔写真を保存時にアップロードします。';
      } catch (e) { msg.textContent = '画像を読み込めませんでした。'; }
    });
    const removePhotoBtn = m.hasPhoto ? h('button', { type: 'button', class: 'mini danger', onclick: function () {
      state.removePhoto = true; state.photo = null; photoImg.hidden = true; photoNote.textContent = '保存すると、顔写真を外します。';
    } }, '登録済みの顔写真を外す') : null;

    // 名刺画像（非公開で保管）
    const cardBox = h('div', { class: 'cardthumbs' });
    const cardIn = h('input', { type: 'file', accept: 'image/jpeg,image/png,application/pdf', multiple: '' });
    const cardNote = h('p', { class: 'muted' }, '名刺の画像は、非公開のフォルダに保管され、管理者だけが、この画面で見られます（お客様には表示されません）。表・裏など、複数枚を追加できます。');
    function drawCards() {
      const kids = [];
      for (let i = 0; i < (m.cards || 0); i++) {
        if (state.removeCards.indexOf(i) >= 0) continue;
        const slot = h('div', { class: 'cardslot' }, [h('p', { class: 'muted' }, '読み込み中…')]);
        kids.push(slot);
        (function (idx, slot) {
          A.cardElement(m.id, idx, 'thumb').then(function (el) {
            el.style.cursor = 'zoom-in';
            el.addEventListener('click', function () { A.showCards((m.name || '') + 'さんの名刺', m.id, m.cards); });
            slot.replaceChildren(el, h('button', { type: 'button', class: 'mini danger', onclick: function () { state.removeCards.push(idx); drawCards(); } }, 'この画像を外す'));
          });
        })(i, slot);
      }
      state.cards.forEach(function (c, i) {
        kids.push(h('div', { class: 'cardslot' }, [
          c.mime === 'application/pdf' ? h('p', {}, 'PDF（保存時に保管します）') : h('img', { class: 'cardimg thumb', src: 'data:' + c.mime + ';base64,' + c.base64, alt: '追加する名刺' }),
          h('span', { class: 'chip on' }, '保存時に追加'),
          h('button', { type: 'button', class: 'mini danger', onclick: function () { state.cards.splice(i, 1); drawCards(); } }, '取り消し'),
        ]));
      });
      cardBox.replaceChildren.apply(cardBox, kids.length ? kids : [h('p', { class: 'muted' }, '保管している名刺の画像は、ありません。')]);
    }
    drawCards();
    cardIn.addEventListener('change', async function () {
      try {
        for (const f of Array.from(cardIn.files)) {
          if (state.cards.length >= 4) { msg.textContent = '一度に追加できるのは、4枚までです。'; break; }
          state.cards.push(f.type === 'application/pdf' ? { base64: await A.fileToBase64(f), mime: f.type } : await A.resizeImage(f, CARD_MAX_DIM, CARD_QUALITY));
        }
        cardIn.value = ''; drawCards();
      } catch (e) { msg.textContent = '名刺の画像を読み込めませんでした。'; }
    });

    const saveBtn = h('button', { type: 'button', class: 'btn', onclick: async function () {
      msg.textContent = ''; msg.className = 'err';
      if (!nameIn.value.trim()) { msg.textContent = SAVE_ERRORS.name_required; return; }
      saveBtn.disabled = true; saveBtn.textContent = '保存中…';
      try {
        const r = await api('adminSaveMember', { member: {
          id: m.id || '', name: nameIn.value, org: orgIn.value, area: areaIn.value, blankOk: blankBoxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return b.key; }), email: emailIn.value, phone: phoneIn.value, lineUrl: lineUrlIn.value.trim(), comment: commentIn.value, memo: memoIn.value,
          avail: catVocab.filter(function (t) { return availState[t]; }), skill: catVocab.filter(function (t) { return availState[t] && skillState[t]; }).slice(0, SKILL_MAX), isAdmin: isAdmin.checked, kubun: kubunIn.value,
          photo: state.photo, removePhoto: state.removePhoto, cards: state.cards, removeCardIndexes: state.removeCards,
        } });
        if (!r.ok) { msg.textContent = SAVE_ERRORS[r.error] || '保存できませんでした。'; }
        else { A.cardCache = {}; A.go('members/list'); return; }
      } catch (e) { msg.textContent = '通信エラーです。もう一度お試しください。'; }
      saveBtn.disabled = false; saveBtn.textContent = isNew ? 'このメンバーを登録する' : '保存する';
    } }, isNew ? 'このメンバーを登録する' : '保存する');

    const field = function (label, el, hint) { return h('div', { class: 'field' }, [h('label', {}, label), el, hint ? h('p', { class: 'muted' }, hint) : null]); };
    const alertCard = !isNew && (m.alerts || []).length ? h('div', { class: 'card', style: 'border:2px solid #e0a23a' }, [h('strong', {}, '確認・修正が必要な点'), h('ul', {}, m.alerts.map(function (a) { return h('li', {}, a.text); })), h('p', { class: 'muted' }, 'カテゴリーを確認して、「保存」を押すと、カテゴリーの「要確認」は消えます。')]) : null;
    box.replaceChildren(
      alertCard,
      isNew ? h('p', { class: 'muted' }, 'AIが名刺から読み取った内容です。間違いがないか確認して、必要なら直してください。') : null,
      h('div', { class: 'card' }, [
        field('お名前（必須）', nameIn, 'セミナー登壇・ご希望の先生の選択に使う名前です。'),
        field('所属・肩書き', orgIn),
        field('事務所の場所（市区町村）', areaIn, '専門家名簿に出ます。例: さいたま市西区'),
        field('メールアドレス', emailIn),
        field('電話番号', phoneIn),
        field('LINEの友だち追加リンク（任意）', lineUrlIn, '相談を受けたとき、お客様に渡して、LINEで直接つながれるようにします。先生のLINEアプリの「ホーム → 友だち追加 → 招待（またはQRコード）」から、リンクをコピーして貼ります。'),
      ]),
      h('div', { class: 'card' }, [
        h('h2', {}, '受けられるカテゴリー（複数可）'),
        h('p', { class: 'muted' }, 'この先生が、相談を受けられる分野です。相談の自動マッチングは、この分野で、先生を選びます。先生がLINEで答えた内容が、最初から入っています。'),
        availBox,
        h('div', { class: 'tagadd' }, [newTag, h('button', { type: 'button', class: 'mini', onclick: function () { addTag(newTag.value); } }, 'カテゴリーを追加')]),
        h('h2', { style: 'margin-top:14px' }, '得意分野（3つまで）'),
        h('p', { class: 'muted' }, '受けられるカテゴリーの中から、特に得意なものを、3つまで選びます。同じ条件なら、得意な先生が優先されます。'),
        skillBox, skillMsg,
      ]),
      h('div', { class: 'card' }, [
        h('h2', {}, 'ひとこと（コメント）'),
        commentIn, commentCount,
        h('h2', { style: 'margin-top:14px' }, '顔写真'),
        photoImg, photoNote, photoIn, removePhotoBtn,
        h('h2', { style: 'margin-top:14px' }, '名刺画像'),
        cardBox, cardNote, cardIn,
        field('内部メモ', memoIn),
      ]),
      h('div', { class: 'card' }, [
        h('div', { class: 'f' }, [h('div', { class: 'lab' }, '空欄でよい項目'), h('div', { class: 'muted' }, 'チェックした項目は、入力がなくても「これでよい」とみなして、プロフィール入力の案内の対象から外します。')].concat(blankBoxes.map(function (b) { return b.el; }))),
        field('区分', kubunIn, '新会員の先生が相談を担当するとき、ベテランの先生にも同席をお願いします（LINEで打診します）。'),
        h('label', { class: 'arow-top' }, [isAdmin, h('span', {}, '管理者にする（この管理画面に入れて、相談の通知が届きます）')]),
        m.isSelf ? h('p', { class: 'muted' }, 'ご自分の管理者の権限は、ここでは外せません。') : null,
        !isNew && m.id && m.linked ? h('div', { class: 'sacts' }, [
          !(m.avail && m.avail.length) ? h('button', { type: 'button', class: 'mini', onclick: function () { sendOne('adminSendSkillSurvey', m.id, this); } }, '対応可能・得意の質問を送る') : null,
          !(m.hasPhoto || m.hasCard || m.comment) ? h('button', { type: 'button', class: 'mini', onclick: function () { sendOne('adminSendProfileInvite', m.id, this); } }, '「#プロフィール」の案内を送る') : null,
        ]) : null,
        h('p', { class: 'muted' }, m.linked ? 'LINE連携：済み（LINEで「#プロフィール」と送ると、ご本人が顔写真・名刺・ひとことを申請できます。反映は「先生からの申請」で承認）' : 'LINE連携：未（ご本人が公式LINEで「#登録 合言葉 お名前」と送ると、このメンバーに連携されます）'),
      ]),
      msg, saveBtn
    );
  }

  // ---- 編集 ----
  async function editView(box, params) {
    const res = await api('adminListMembers', {});
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const m = res.members.filter(function (x) { return x.id === (params && params.id); })[0];
    if (!m) return box.replaceChildren(h('p', { class: 'err' }, 'メンバーが見つかりませんでした。'), h('button', { type: 'button', class: 'mini', onclick: function () { A.go('members/list'); } }, '一覧へ戻る'));
    memberForm(box, { member: m, vocab: res.tags, isNew: false });
  }

  // ---- 新規登録（名刺から） ----
  async function newView(box) {
    const res = await api('adminListMembers', {});
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,application/pdf' });
    const msg = h('p', { class: 'err' });
    const btn = h('button', { type: 'button', class: 'btn', onclick: async function () {
      msg.textContent = '';
      const f = file.files[0];
      if (!f) { msg.textContent = '名刺の写真かPDFを選んでください。'; return; }
      if (f.type !== 'application/pdf' && f.type.indexOf('image/') !== 0) { msg.textContent = '名刺は、写真（JPG・PNG）かPDFでアップロードしてください。'; return; }
      if (f.type === 'application/pdf' && f.size > 5 * 1024 * 1024) { msg.textContent = 'PDFが大きすぎます（5MBまで）。'; return; }
      btn.disabled = true; btn.textContent = 'AIが読み取っています…';
      try {
        const card = f.type === 'application/pdf' ? { base64: await A.fileToBase64(f), mime: f.type } : await A.resizeImage(f, CARD_MAX_DIM, CARD_QUALITY);
        const r = await api('adminExtractCard', { fileBase64: card.base64, mime: card.mime });
        if (!r.ok) msg.textContent = EXTRACT_ERRORS[r.error] || '読み取れませんでした。手入力もできます。';
        else { memberForm(box, { member: Object.assign({ comment: '', isAdmin: false }, r.member, { avail: (r.member.tags || []).slice() }), vocab: res.tags, isNew: true, card: card, suggest: r.member.suggestTags }); return; }
      } catch (e) { msg.textContent = '通信エラーです。もう一度お試しください。'; }
      btn.disabled = false; btn.textContent = '名刺を読み取る';
    } }, '名刺を読み取る');
    box.replaceChildren(h('div', { class: 'card' }, [
      h('h2', {}, '名刺から新規登録'),
      h('p', { class: 'muted' }, '名刺の写真（またはPDF）をアップロードすると、AIが、お名前・所属・連絡先・得意分野の候補を読み取ります。読み取り結果は、必ず確認してから登録してください。名刺の画像は、非公開のフォルダに保管します。'),
      file, btn, msg,
      h('button', { type: 'button', class: 'mini', style: 'margin-top:12px', onclick: function () {
        memberForm(box, { member: { comment: '', isAdmin: false, tags: [] }, vocab: res.tags, isNew: true });
      } }, '名刺なしで、手入力で登録する'),
    ]));
  }

  A.views['members/list'] = listView;
  A.views['members/new'] = newView;
  A.views['members/edit'] = editView;
})();
