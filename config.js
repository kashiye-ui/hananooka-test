// デプロイ環境ごとに書き換える（秘匿情報は含めない）
// GAS_URL が空のときは、画面確認用のモックで動く（保存されない）。
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzK0Kj_iGqZ4hGUyH2yIjHDGgGdbwqaXq_Ynej3LGDNlqZ_l-gag3hL179CbPQ1ngiGFQ/exec',
  LIFF_ID: '',   // フェーズ2で設定。空ならLINEボタンは「準備中」表示
};
