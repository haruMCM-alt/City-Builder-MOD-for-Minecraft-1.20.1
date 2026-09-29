# Web プロキシ

URL を入力すると、中継サーバー経由でページを表示する Web プロキシです。

| ファイル | 役割 |
| --- | --- |
| `index.html` | 閲覧用ページ (URL バー + 表示フレーム)。ローカルで開くか GitHub Pages などに置いて使う |
| `worker.js` | 中継サーバー (Cloudflare Workers)。ページを取得し、リンク・画像・CSS などの URL をプロキシ経由に書き換える |
| `wrangler.toml` | Workers のデプロイ設定 |

ブラウザの制限 (CORS / X-Frame-Options) により HTML だけでは他サイトを取得できないため、中継サーバーが必要です。

## セットアップ

1. [Cloudflare](https://dash.cloudflare.com/) の無料アカウントを作成
2. このフォルダでデプロイ

   ```bash
   npx wrangler login
   npx wrangler deploy
   ```

   表示された `https://web-proxy.<アカウント>.workers.dev` が中継サーバー URL です。
3. (推奨) 他人に使われないようアクセスキーを設定

   ```bash
   npx wrangler secret put ACCESS_KEY
   ```

   設定後は `https://web-proxy.<アカウント>.workers.dev/<キー>` を中継サーバー URL として使います。
4. `index.html` をブラウザで開き、「設定」に中継サーバー URL を入力して「保存」

## 使い方

- URL (`example.com` など) を入力して「開く」。URL でない文字列は Bing で検索します
- 「別タブ」でフレームを使わず新しいタブに表示します (フレーム内で崩れるサイト向け)
- `index.html?url=https://example.com` で直接開くこともできます
- 中継サーバーへ直接アクセスする場合は `<中継サーバー URL>/proxy/https://example.com/`

## 制限事項

- JavaScript が実行時に送る通信 (fetch / XHR / WebSocket) は書き換えないため、動的なサイト (YouTube、SNS など) は正しく動かないことがあります
- ログインが必要なサイトの Cookie は基本的に引き継がれません
- 閲覧先サイトからは Cloudflare の IP でアクセスしているように見えます。通信内容は中継サーバーを通るため、自分でデプロイしたサーバー以外は使わないでください
- ローカルネットワーク (`localhost`, `192.168.x.x` など) への接続はブロックしています
- 学校・職場などのネットワークで使う場合は、その利用規約に従ってください
