#!/bin/sh
# 画面ファイル（js/css）を直して公開するたびに実行する。古いファイルがブラウザ（LINE内を含む）に残って、修正が反映されないのを防ぐ。
V=$(date +%Y%m%d%H%M)
for f in index.html admin/index.html profile/index.html seminar/index.html members/index.html; do
  [ -f "$f" ] && sed -i -E "s#(src|href)=\"([^\":]+\.(js|css))(\?v=[0-9]+)?\"#\1=\"\2?v=$V\"#g" "$f"
done
echo "version: $V"
