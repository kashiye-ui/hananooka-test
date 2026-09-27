(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const btn = document.getElementById('lineBtn');
  if (!btn) return;
  if (CFG.LINE_ADD_FRIEND_URL) {
    btn.href = CFG.LINE_ADD_FRIEND_URL;
  } else {
    btn.removeAttribute('href');
    btn.textContent = '公式LINEは準備中です';
    btn.classList.add('disabled');
  }
})();
