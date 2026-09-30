// 画像の加工画面（切り抜き・拡大縮小・回転）。先生から申請された顔写真・名刺を、管理者が整えるのに使う
// A.editImage({ src, kind: 'photo'|'card', title }) → 決定なら { base64, mime }、やめたら null
(function () {
  'use strict';
  const A = window.Admin;
  const h = A.h;

  A.editImage = function (opt) {
    return new Promise(function (resolve) {
      const isPhoto = opt.kind === 'photo';
      const img = new Image();
      img.onerror = function () { alert('画像を読み込めませんでした。'); resolve(null); };
      img.onload = function () { start(img); };
      img.src = opt.src;

      function start(img) {
        // 枠（出力範囲）。顔写真は正方形(600px)、名刺は横長 91:55（長辺1280px）。名刺は縦横を切り替えられる
        let landscape = true;
        const st = { rot: 0, zoom: 1, cx: 0, cy: 0 }; // cx,cy: 画像の中心の位置（枠の中心からのずれ・枠の幅に対する割合）
        const PW = Math.min(360, window.innerWidth - 64);
        function frame() { return isPhoto ? { w: 1, h: 1 } : (landscape ? { w: 91, h: 55 } : { w: 55, h: 91 }); }
        function previewSize() { const f = frame(); const k = PW / Math.max(f.w, f.h); return { w: Math.round(f.w * k), h: Math.round(f.h * k) }; }
        function outSize() { const f = frame(); const L = isPhoto ? 600 : 1280; const k = L / Math.max(f.w, f.h); return { w: Math.round(f.w * k), h: Math.round(f.h * k) }; }

        // 回転後の画像の大きさ
        function rotSize() { return st.rot % 2 ? { w: img.height, h: img.width } : { w: img.width, h: img.height }; }
        // 「zoom=1」のときの倍率。顔写真は枠いっぱい（はみ出す）、名刺は全体が入る大きさ
        function baseScale(fw, fh) {
          const r = rotSize();
          return isPhoto ? Math.max(fw / r.w, fh / r.h) : Math.min(fw / r.w, fh / r.h);
        }
        function draw(cv, guide) {
          const fw = cv.width, fh = cv.height, ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, fw, fh);
          const s = baseScale(fw, fh) * st.zoom;
          ctx.save();
          ctx.translate(fw / 2 + st.cx * fw, fh / 2 + st.cy * fw);
          ctx.rotate(st.rot * Math.PI / 2);
          ctx.scale(s, s);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
          ctx.restore();
          if (guide && isPhoto) {
            // 頭のてっぺん（上から20%）とあご（上から70%）の目安。頭が全体の約半分になるように合わせる
            ctx.strokeStyle = 'rgba(232,90,140,.9)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
            [0.2, 0.7].forEach(function (y) { ctx.beginPath(); ctx.moveTo(0, fh * y); ctx.lineTo(fw, fh * y); ctx.stroke(); });
            ctx.beginPath(); ctx.moveTo(fw / 2, 0); ctx.lineTo(fw / 2, fh); ctx.stroke();
          }
        }

        const cv = h('canvas', { style: 'display:block;margin:0 auto;border:2px solid #d9cbb8;border-radius:8px;touch-action:none;cursor:grab;background:#fff' });
        function redraw() { const p = previewSize(); cv.width = p.w; cv.height = p.h; draw(cv, true); }

        // ドラッグで位置を動かす
        let drag = null;
        cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: st.cx, cy: st.cy }; cv.style.cursor = 'grabbing'; });
        cv.addEventListener('pointermove', function (e) { if (!drag) return; st.cx = drag.cx + (e.clientX - drag.x) / cv.width; st.cy = drag.cy + (e.clientY - drag.y) / cv.width; draw(cv, true); });
        function endDrag() { drag = null; cv.style.cursor = 'grab'; }
        cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
        cv.addEventListener('wheel', function (e) { e.preventDefault(); setZoom(st.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });

        const range = h('input', { type: 'range', min: '0.2', max: '4', step: '0.01', value: '1', style: 'width:100%' });
        function setZoom(z) { st.zoom = Math.max(0.2, Math.min(4, z)); range.value = String(st.zoom); draw(cv, true); }
        range.addEventListener('input', function () { st.zoom = parseFloat(range.value); draw(cv, true); });

        function rotate(d) { st.rot = (st.rot + d + 4) % 4; if (!isPhoto) st.cx = st.cy = 0; redraw(); }
        const orientBtn = isPhoto ? null : h('button', { type: 'button', class: 'mini', onclick: function () {
          landscape = !landscape; st.cx = st.cy = 0; orientBtn.textContent = landscape ? '枠：横長（クリックで縦長）' : '枠：縦長（クリックで横長）'; redraw();
        } }, '枠：横長（クリックで縦長）');

        const close = function (v) { ov.remove(); resolve(v); };
        const okBtn = h('button', { type: 'button', class: 'btn', style: 'width:auto;padding:10px 24px', onclick: function () {
          const o = outSize(), out = document.createElement('canvas');
          out.width = o.w; out.height = o.h;
          // プレビューと同じ見た目になるよう、出力の大きさに合わせて描く（位置は枠の幅に対する割合なので、そのまま使える）
          draw(out, false);
          close({ base64: out.toDataURL('image/jpeg', 0.88).split(',')[1], mime: 'image/jpeg' });
        } }, 'この加工で決定');

        const tips = isPhoto
          ? '点線の上の線に頭のてっぺん、下の線にあごが来るように、ドラッグで位置を、下のバーで大きさを合わせてください（頭が全体の約半分になります）。'
          : '名刺だけが大きく映るように、ドラッグで位置を、下のバーで大きさを合わせてください。斜めの写真は、回転で向きを直せます（背景は白で埋まります）。';

        const ov = h('div', { class: 'overlay' }, [
          h('div', { class: 'ovbox' }, [
            h('div', { class: 'ovhead' }, [h('strong', {}, opt.title || '画像の加工'), h('button', { type: 'button', class: 'mini', onclick: function () { close(null); } }, 'やめる')]),
            h('p', { class: 'muted' }, tips),
            cv,
            h('div', { style: 'margin:10px 0 4px' }, [h('div', { class: 'muted' }, '大きさ'), range]),
            h('div', { class: 'sacts' }, [
              h('button', { type: 'button', class: 'mini', onclick: function () { rotate(-1); } }, '⟲ 左に回す'),
              h('button', { type: 'button', class: 'mini', onclick: function () { rotate(1); } }, '⟳ 右に回す'),
              orientBtn,
              h('button', { type: 'button', class: 'mini', onclick: function () { st.zoom = 1; st.cx = st.cy = 0; range.value = '1'; draw(cv, true); } }, '最初の状態に戻す'),
            ]),
            h('div', { class: 'sacts', style: 'margin-top:12px' }, [okBtn]),
          ]),
        ]);
        document.body.appendChild(ov);
        redraw();
      }
    });
  };
})();
