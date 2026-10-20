// 名刺シート印刷: 先生を選んで、実寸の名刺（表・裏）とひとことつきでA4に並べて印刷する（旧 web/members/ の印刷機能を、
// ログイン必須の管理画面に移設したもの。名刺の画像には電話番号などが写っているため、公開ページには置かない）。
// 「メンバー管理 → 名刺シート印刷」（全員から選ぶ）と、セミナーの詳細ページ「名刺」タブ（そのセミナーの講師・チューター）の両方で使う。
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h, api = A.api;

  /**
   * 名刺シートの選択・印刷の部品。members: 名刺のあるメンバー（adminListMembers の項目）。preselect: 最初から全員にチェックを入れるか。
   * opts（任意）: { title, sub, footer } を渡すと、毎ページの上に、セミナー情報（title=セミナー名、sub=日時・会場）、下に、footer（例：花の丘相続遺言サポート）を印刷する（セミナーで配るとき用）。
   * 戻り値: { node, setMembers(list) }（メンバーを入れ替えられる）
   */
  A.cardSheetPanel = function (members, preselect, opts) {
    let sheetOpts = opts || null;
    let withCard = members.slice();
    const sel = {};
    if (preselect) withCard.forEach(function (m) { sel[m.id] = true; });
    const list = h('div');
    const count = h('span', {});
    let loads = []; // 名刺の画像の読み込み（全部終わってから印刷する。途中で印刷すると、読み込み中の面が、空のまま印刷される）
    const printBtn = h('button', { type: 'button', class: 'btn', style: 'width:auto;padding:10px 22px', onclick: async function () {
      printBtn.disabled = true; printBtn.textContent = '名刺の画像を読み込んでいます…';
      try { await Promise.all(loads); } catch (e) { /* 読めなかった面は、「読み込めません」と出る */ }
      printBtn.disabled = false; printBtn.textContent = '選んだ先生の名刺を印刷';
      // 印刷のあいだだけ、名刺シートをページの直下に移し、ほかの部分は、場所ごと外す（「見えなくする」だけだと、場所が残り、空白のページが増える）
      const slot = sheet.parentNode, next = sheet.nextSibling;
      let restored = false;
      const restore = function () {
        if (restored) return; restored = true;
        document.body.classList.remove('printing');
        slot.insertBefore(sheet, next);
        window.removeEventListener('afterprint', restore);
      };
      window.addEventListener('afterprint', restore);
      document.body.appendChild(sheet);
      document.body.classList.add('printing');
      window.print();
      setTimeout(restore, 1000); // afterprint が来ない環境でも、画面を元に戻す（印刷の画面は、すでに作られている）
    } }, '選んだ先生の名刺を印刷');
    const sheet = h('div', { id: 'cardsheet', class: 'sheet' });

    function selected() { return withCard.filter(function (m) { return sel[m.id]; }); }

    function buildSheet() {
      const s = selected();
      loads = [];
      const pages = [];
      for (let i = 0; i < s.length; i += 4) pages.push(s.slice(i, i + 4));
      const cardImg = function (m, idx) {
        const box = h('div', { class: 'mc' }, [h('p', { class: 'muted' }, '…')]);
        loads.push(A.cardElement(m.id, idx, 'sheet').then(function (el) {
          box.replaceChildren(el);
          return el.tagName === 'IMG' && !el.complete ? new Promise(function (r) { el.onload = el.onerror = r; }) : null; // 画像の表示が終わるまで待つ
        }).catch(function () { box.replaceChildren(h('p', { class: 'muted' }, '読み込めません')); }));
        return box;
      };
      sheet.replaceChildren.apply(sheet, pages.map(function (grp) {
        const hf = !!sheetOpts;
        const head = hf && (sheetOpts.title || sheetOpts.sub) ? h('div', { class: 'ph' }, [h('b', {}, sheetOpts.title || ''), h('span', {}, sheetOpts.sub || '')]) : (hf ? h('div', { class: 'ph' }) : null);
        const foot = hf ? h('div', { class: 'pf' }, sheetOpts.footer || '') : null;
        return h('div', { class: 'pg' + (hf ? ' hf' : '') }, [head].concat(grp.map(function (m) {
          return h('div', { class: 'pb' }, [
            h('div', { class: 'pt' }, [h('b', {}, m.name), h('span', { class: 'rr' }, m.org || ''), h('span', { class: 'ff' }, m.tags.join('・'))]),
            h('div', { class: 'pm' }, m.comment || ''),
            h('div', { class: 'pc' }, [cardImg(m, 0), m.cards > 1 ? cardImg(m, 1) : h('div', { class: 'mc' }, '裏面なし')]),
          ]);
        }), [foot]));
      }));
    }

    function draw() {
      list.replaceChildren.apply(list, withCard.length ? withCard.map(function (m) {
        const check = h('input', { type: 'checkbox' }); check.checked = !!sel[m.id];
        check.addEventListener('change', function () { sel[m.id] = check.checked; count.textContent = selected().length + '名選択中'; buildSheet(); });
        return h('label', { class: 'card mcard', style: 'cursor:pointer' }, [
          check,
          h('img', { src: m.photo, alt: m.name, class: 'mphoto' }),
          h('div', { class: 'mbody' }, [h('div', { class: 'stitle' }, m.name), m.org ? h('div', { class: 'muted' }, m.org) : null, h('div', { class: 'muted' }, '名刺 ' + m.cards + '枚'), m.comment ? null : h('div', { class: 'err' }, 'ひとことが未入力です（名刺の上の行が、空になります）')]),
        ]);
      }) : [h('p', {}, '名刺が保管されているメンバーがいません。')]);
      count.textContent = selected().length + '名選択中';
    }
    draw(); buildSheet();

    return {
      setOpts: function (o) { sheetOpts = o || null; buildSheet(); }, // セミナー情報（ヘッダー）を、あとから入れ替える
      node: h('div', {}, [h('div', { class: 'sacts', style: 'margin-bottom:12px' }, [count, printBtn]), list, sheet]),
      // メンバーを入れ替える（セミナーの講師・チューターが変わったとき）。選択は、新しく加わった方を、チェックありにする
      setMembers: function (next) {
        const had = {};
        withCard.forEach(function (m) { had[m.id] = true; });
        withCard = next.slice();
        withCard.forEach(function (m) { if (!had[m.id]) sel[m.id] = true; });
        draw(); buildSheet();
      },
    };
  };

  async function listView(box) {
    const res = await api('adminListMembers', {});
    if (!res.ok) return box.replaceChildren(h('p', { class: 'err' }, '読み込めませんでした。'));
    const panel = A.cardSheetPanel(res.members.filter(function (m) { return m.hasCard; }), false);
    box.replaceChildren(
      h('p', { class: 'muted' }, '名刺を保管しているメンバーの一覧です。チェックを入れた先生を、実寸の名刺（表・裏）とひとことつきでA4に並べて印刷します（1枚に4名まで）。名刺の画像には連絡先が写っているため、この画面は管理者だけが使えます。'),
      panel.node
    );
  }

  A.views['members/cardsheet'] = listView;
})();
