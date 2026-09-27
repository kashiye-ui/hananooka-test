// デプロイ環境ごとに書き換える（秘匿情報は含めない）
// GAS_URL が空のときは、画面確認用のモックで動く（保存されない）。
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzK0Kj_iGqZ4hGUyH2yIjHDGgGdbwqaXq_Ynej3LGDNlqZ_l-gag3hL179CbPQ1ngiGFQ/exec',
  LINE_ADD_FRIEND_URL: '',   // 公式LINEの友だち追加URL（例: https://lin.ee/xxxx）。LIFFの友だち追加設定が有効なら空でも可
  LIFF_ID: '2011756208-41GsKX1j',
};
