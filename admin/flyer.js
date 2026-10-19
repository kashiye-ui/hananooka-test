// 当日配布用A4シート（PDF）を、ブラウザの中で作ってダウンロードする（サーバーでPDFを作ると、時間がかかったり、通信エラーになることがあったため）。
// 画面の入力内容から、そのまま作る（先に保存していなくてもよい）。QRコードも、ブラウザの中で作る（外部のQR作成サービスは使わない）。
(function () {
  'use strict';
  const A = window.Admin;
  const LIBS = [
    ['qrcode', 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'],
    ['html2canvas', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'],
    ['jspdf', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
  ];
  let libsPromise = null;
  function loadLibs() {
    if (!libsPromise) {
      libsPromise = Promise.all(LIBS.map(function (l) { return A.loadScript(l[1]); })).catch(function (e) { libsPromise = null; throw e; });
    }
    return libsPromise;
  }

  const PAGE_W = 794, PAGE_H = 1123; // A4（96dpiでの px）
  // 折り返しは、文節の切れ目で行い（auto-phrase）、行の長さをそろえて、最後の行に1〜2文字だけ残らないようにする（balance）。禁則処理は厳しめ（strict）
  const WRAP = 'word-break:auto-phrase;line-break:strict;overflow-wrap:anywhere;';
  const BALANCE = WRAP + 'text-wrap:balance;';

  // 折り返すとき、「（全3回）」「第1回」「10:05〜10:45」「渡辺先生」のような、ひとまとまりの言葉の途中では、改行しない（短い括弧・回数・時刻・数字）
  const KEEP = /（[^（）\n]{1,12}）|\([^()\n]{1,12}\)|第\d+回|\d{1,2}:\d{2}(?:[〜~～\-]\d{1,2}:\d{2})?|\d{4}\/\d{1,2}\/\d{1,2}|\d+(?:[年月日回名人時分問点枚])|[A-Za-z0-9./:_-]+/g;
  function keepTogether(text) {
    const out = [];
    let last = 0, m;
    KEEP.lastIndex = 0;
    while ((m = KEEP.exec(String(text || '')))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(A.h('span', { style: 'white-space:nowrap' }, m[0]));
      last = m.index + m[0].length;
    }
    if (last < String(text || '').length) out.push(text.slice(last));
    return out;
  }

  /**
   * シートのページ（DOM）。info: { name, venue, dateTime, schedule, digest, questions[{text, hint, choices|null}], teachers[], url }
   * 問題があるときは、表面（タイトル・スケジュール・内容・講師）と、裏面（理解度確認テスト・ヒント・QRコード）の2ページ。問題がないときは、1ページ（QRコードつき）。
   */
  function pageStyle() { return 'box-sizing:border-box;width:' + PAGE_W + 'px;min-height:' + PAGE_H + 'px;padding:44px 52px;background:#fff;color:#333;font-family:"Hiragino Sans","Yu Gothic","Meiryo","Noto Sans JP",sans-serif'; }
  function sectionNode(title, text) {
    const h = A.h;
    return text ? h('div', { style: 'margin:0 0 18px' }, [
      h('div', { style: 'font-size:17px;font-weight:bold;color:#a3567a;margin:0 0 6px' }, title),
      h('div', { style: WRAP + 'text-wrap:pretty;font-size:15px;line-height:1.75;white-space:pre-wrap' }, keepTogether(text)),
    ]) : null;
  }
  function qrNode(info, qrDataUrl, withQuiz) {
    const h = A.h;
    return h('div', { style: 'text-align:center;margin-top:26px;border-top:2px dashed #ccc;padding-top:22px' }, [
      h('div', { style: BALANCE + 'font-size:21px;font-weight:bold;margin:0 0 6px' }, withQuiz ? '答え合わせ・解説はこちらから' : '本日の理解度確認テストはこちら'),
      withQuiz ? h('div', { style: BALANCE + 'font-size:13px;color:#666;margin:0 0 12px' }, 'QRコードから、上の問題の答えを送ると、点数と解説が、LINEに届きます') : null,
      h('img', { src: qrDataUrl, style: 'width:180px;height:180px', alt: 'QRコード' }),
      h('div', { style: 'font-size:12px;color:#888;margin-top:10px;word-break:break-all' }, info.url),
    ]);
  }
  function sheetPages(info, qrDataUrl) {
    const h = A.h;
    const qs = (info.questions || []).filter(function (q) { return q.text; });
    const front = h('div', { style: pageStyle() }, [
      h('div', { style: BALANCE + 'font-size:26px;font-weight:bold;line-height:1.4;border-bottom:3px solid #a3567a;padding:0 0 12px;margin:0 0 14px' }, keepTogether(info.name || '')),
      info.dateTime ? h('div', { style: 'font-size:16px;color:#555;margin:0 0 4px' }, '日時：' + info.dateTime) : null,
      info.venue ? h('div', { style: 'font-size:16px;color:#555;margin:0 0 20px' }, '会場：' + info.venue) : h('div', { style: 'height:16px' }),
      sectionNode('本日のタイムスケジュール', info.schedule),
      sectionNode('本日の内容', info.digest),
      sectionNode('担当講師', (info.teachers || []).join('　')),
      qs.length ? h('div', { style: 'margin-top:22px;text-align:right;font-size:15px;font-weight:bold;color:#a3567a' }, '裏面に、理解度確認テストがあります →') : qrNode(info, qrDataUrl, false),
    ]);
    if (!qs.length) return [front];
    const back = h('div', { style: pageStyle() }, [
      h('div', { style: 'font-size:13px;color:#888;margin:0 0 4px' }, info.name || ''),
      h('div', { style: BALANCE + 'font-size:26px;font-weight:bold;line-height:1.4;border-bottom:3px solid #a3567a;padding:0 0 12px;margin:0 0 10px' }, '理解度確認テスト'),
      h('div', { style: 'font-size:15px;color:#555;line-height:1.7;margin:0 0 20px' }, '本日のお話を、思い出してみましょう。それぞれの文章が、正しければ〇、間違いなら×です。答えを考えたら、下のQRコードから送ってください。'),
    ].concat(qs.map(function (q, i) {
      return h('div', { style: 'margin:0 0 20px' }, [
        h('div', { style: 'display:flex;gap:12px;align-items:flex-start' }, [
          h('div', { style: 'flex:none;font-size:18px;font-weight:bold;color:#a3567a;white-space:nowrap' }, '問' + (i + 1)),
          h('div', { style: 'flex:1;' + WRAP + 'font-size:17px;line-height:1.7' }, [h('div', {}, keepTogether(q.text))].concat(q.choices ? [h('div', { style: 'font-size:14px;color:#555;margin-top:4px' }, q.choices.join('　／　'))] : [])),
        ]),
        q.hint ? h('div', { style: 'margin:6px 0 0 50px;padding:7px 12px;background:#fdf6e6;border-left:4px solid #e6b94d;border-radius:4px;' + WRAP + 'font-size:14px;line-height:1.6;color:#6b5320' }, [h('b', {}, 'ヒント　')].concat(keepTogether(q.hint))) : null,
      ]);
    }), [qrNode(info, qrDataUrl, true)]));
    return [front, back];
  }

  function qrDataUrl(text) {
    const qr = window.qrcode(0, 'M'); // 型番は、自動で決まる
    qr.addData(text);
    qr.make();
    return qr.createDataURL(8, 8);
  }

  /** PDFを作って、ダウンロードする。戻り値: ファイル名 */
  A.downloadFlyer = async function (info, fileName) {
    await loadLibs();
    const pages = sheetPages(info, qrDataUrl(info.url));
    const holder = A.h('div', { style: 'position:fixed;left:-10000px;top:0;z-index:-1' }, pages);
    document.body.appendChild(holder);
    try {
      await Promise.all([].map.call(holder.querySelectorAll('img'), function (img) { return img.complete ? null : new Promise(function (r) { img.onload = img.onerror = r; }); })); // QRコードの読み込みを待つ
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* 待てなくても続ける */ } }
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pw = 210, ph = 297;
      let first = true;
      for (const node of pages) { // 1ページ（表面・裏面）ずつ、画像にして、PDFに入れる
        const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        const imgH = canvas.height * pw / canvas.width; // 横幅をA4に合わせたときの高さ（mm）
        if (imgH <= ph + 1) {
          if (!first) pdf.addPage();
          first = false;
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, imgH);
        } else { // 1枚に収まらないときは、縦に切って、複数ページにする
          const sliceH = Math.floor(canvas.width * ph / pw);
          for (let y = 0; y < canvas.height; y += sliceH) {
            const part = document.createElement('canvas');
            part.width = canvas.width; part.height = Math.min(sliceH, canvas.height - y);
            part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
            if (!first) pdf.addPage();
            first = false;
            pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, part.height * pw / part.width);
          }
        }
      }
      pdf.save(fileName);
      return fileName;
    } finally {
      document.body.removeChild(holder);
    }
  };
})();
