#!/bin/sh
# style.css と app.js を index.html に埋め込んだ単一ファイル版を出力する。
# 使い方: sh build.sh > /path/to/windows-me-setup.html
set -e
cd "$(dirname "$0")"
cat <<'HEAD'
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Windows Me セットアップ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">
<style>
HEAD
cat style.css
echo '</style>'
echo '</head>'
echo '<body>'
echo '<script>'
cat app.js
echo '</script>'
echo '</body>'
echo '</html>'
