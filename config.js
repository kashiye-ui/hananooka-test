// デプロイ環境ごとに書き換える（秘匿情報は含めない）
// GAS_URL が空のときは、画面確認用のモックで動く（保存されない）。
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzK0Kj_iGqZ4hGUyH2yIjHDGgGdbwqaXq_Ynej3LGDNlqZ_l-gag3hL179CbPQ1ngiGFQ/exec',
  // 読み込み高速化API（Cloudflare Worker）。士業・セミナーの情報を短い間記憶して速く返し、それ以外はGASに中継する。空にすると、GASに直接つなぐ
  API_URL: 'https://hananooka-api.kashiye.workers.dev/',
  LINE_ADD_FRIEND_URL: 'https://lin.ee/tcF5IIl',
  LIFF_ID: '2011756208-41GsKX1j',
};
