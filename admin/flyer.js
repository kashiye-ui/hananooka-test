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

  /** シートの中身（DOM）。info: { name, venue, dateTime, schedule, digest, questions[{text, choices|null}], teachers[], url } */
  function sheetNode(info, qrDataUrl) {
    const h = A.h;
    const section = function (title, text) {
      return text ? h('div', { style: 'margin:0 0 16px' }, [
        h('div', { style: 'font-size:17px;font-weight:bold;color:#a3567a;margin:0 0 6px' }, title),
        h('div', { style: WRAP + 'text-wrap:pretty;font-size:15px;line-height:1.75;white-space:pre-wrap' }, keepTogether(text)),
      ]) : null;
    };
    // 理解度確認テストの問題（〇×）。当日、この用紙で答えを考えて、QRコードから回答を送ると、点数と解説が届く
    const qs = (info.questions || []).filter(function (q) { return q.text; });
    const quiz = qs.length ? h('div', { style: 'margin:0 0 16px' }, [
      h('div', { style: 'font-size:17px;font-weight:bold;color:#a3567a;margin:0 0 6px' }, '理解度確認テスト（正しければ〇、間違いなら×）'),
    ].concat(qs.map(function (q, i) {
      return h('div', { style: 'display:flex;gap:10px;align-items:flex-start;margin:0 0 9px;font-size:15px;line-height:1.7' }, [
        h('div', { style: 'flex:none;font-weight:bold;white-space:nowrap' }, '問' + (i + 1)),
        h('div', { style: 'flex:1;' + WRAP }, [h('div', {}, keepTogether(q.text))].concat(q.choices ? [h('div', { style: 'font-size:13px;color:#555' }, q.choices.join('　／　'))] : [])),
      ]);
    }))) : null;
    return h('div', { style: 'box-sizing:border-box;width:' + PAGE_W + 'px;min-height:' + PAGE_H + 'px;padding:40px 52px;background:#fff;color:#333;font-family:"Hiragino Sans","Yu Gothic","Meiryo","Noto Sans JP",sans-serif' }, [
      h('div', { style: BALANCE + 'font-size:26px;font-weight:bold;line-height:1.4;border-bottom:3px solid #a3567a;padding:0 0 12px;margin:0 0 14px' }, keepTogether(info.name || '')),
      info.dateTime ? h('div', { style: 'font-size:16px;color:#555;margin:0 0 4px' }, '日時：' + info.dateTime) : null,
      info.venue ? h('div', { style: 'font-size:16px;color:#555;margin:0 0 20px' }, '会場：' + info.venue) : h('div', { style: 'height:16px' }),
      section('本日のタイムスケジュール', info.schedule),
      section('本日の内容', info.digest),
      quiz,
      section('担当講師', (info.teachers || []).join('　')),
      h('div', { style: 'text-align:center;margin-top:22px;border-top:2px dashed #ccc;padding-top:18px' }, [
        h('div', { style: BALANCE + 'font-size:21px;font-weight:bold;margin:0 0 6px' }, qs.length ? '答え合わせ・解説はこちらから' : '本日の理解度確認テストはこちら'),
        qs.length ? h('div', { style: BALANCE + 'font-size:13px;color:#666;margin:0 0 12px' }, 'QRコードから、上の問題の答えを送ると、点数と解説が、LINEに届きます') : null,
        h('img', { src: qrDataUrl, style: 'width:170px;height:170px', alt: 'QRコード' }),
        h('div', { style: 'font-size:12px;color:#888;margin-top:10px;word-break:break-all' }, info.url),
      ]),
    ]);
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
    const node = sheetNode(info, qrDataUrl(info.url));
    const holder = A.h('div', { style: 'position:fixed;left:-10000px;top:0;z-index:-1' }, [node]);
    document.body.appendChild(holder);
    try {
      const img = node.querySelector('img');
      if (img && !img.complete) await new Promise(function (r) { img.onload = img.onerror = r; });
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* 待てなくても続ける */ } }
      const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pw = 210, ph = 297;
      const imgH = canvas.height * pw / canvas.width; // 横幅をA4に合わせたときの高さ（mm）
      const data = canvas.toDataURL('image/jpeg', 0.92);
      if (imgH <= ph + 1) pdf.addImage(data, 'JPEG', 0, 0, pw, imgH);
      else { // 1枚に収まらないときは、縦に切って、複数ページにする
        const sliceH = Math.floor(canvas.width * ph / pw);
        for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
          const part = document.createElement('canvas');
          part.width = canvas.width; part.height = Math.min(sliceH, canvas.height - y);
          part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
          if (page) pdf.addPage();
          pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, part.height * pw / part.width);
        }
      }
      pdf.save(fileName);
      return fileName;
    } finally {
      document.body.removeChild(holder);
    }
  };
})();
