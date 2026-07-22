# 実連携セットアップ手順(Google Sheets / Slack)

Tobidai Cockpit はデフォルト(`DATA_MODE` 未設定 or `demo`)ではデモデータのみで全機能が動作します。
本番の Google スプレッドシート・Slack ワークスペースと連携させたい場合は、以下の手順に沿って
環境変数を設定してください。専門知識が無くても迷わないよう、画面操作ベースで説明します。

---

## 1. Google スプレッドシート連携

### 1-1. Google Cloud プロジェクトの準備

1. [Google Cloud Console](https://console.cloud.google.com/) を開き、Google アカウントでログインします。
2. 画面上部のプロジェクト選択メニューから「新しいプロジェクト」を作成します
   (既存のプロジェクトを使ってもかまいません)。プロジェクト名は任意(例: `tobidai-cockpit`)。

### 1-2. Sheets API の有効化

1. 左上のメニュー(≡)から「APIとサービス」→「ライブラリ」を開きます。
2. 検索欄に「Google Sheets API」と入力し、表示された「Google Sheets API」を開いて「有効にする」をクリックします。

### 1-3. サービスアカウントの作成

1. 「APIとサービス」→「認証情報」を開きます。
2. 上部の「+ 認証情報を作成」→「サービスアカウント」を選択します。
3. サービスアカウント名(例: `tobidai-cockpit-reader`)を入力し、「作成して続行」をクリックします。
4. ロールの付与画面は**スキップして構いません**(「完了」をクリック)。読み取りはシート共有権限で制御します。
5. 作成されたサービスアカウントの一覧から、今作ったものをクリックして詳細画面を開きます。
6. 「キー」タブ →「鍵を追加」→「新しい鍵を作成」→ 形式は **JSON** を選択して「作成」します。
   自動的に `.json` ファイルがダウンロードされます(このファイルは秘密情報なので取り扱いに注意)。
7. サービスアカウントの詳細画面上部に表示されているメールアドレス
   (`xxxxx@xxxxx.iam.gserviceaccount.com` の形式)を控えておきます。

### 1-4. スプレッドシートの準備と共有

1. `docs/SHEET_TEMPLATE.md` の6タブ(設定/メンバー/求職者/成約/プロジェクト/週次KPI)構成で
   新しい Google スプレッドシートを作成します(タブ名・列構成をテンプレート通りにしてください)。
2. 右上の「共有」ボタンをクリックし、1-3-7 で控えたサービスアカウントのメールアドレスを追加します。
   権限は「閲覧者」で構いません(このアプリはシートを読み取るのみで書き込みは行いません)。
3. スプレッドシートの URL
   `https://docs.google.com/spreadsheets/d/【この部分】/edit` の
   `【この部分】` がシートID(`SHEET_ID`)です。控えておきます。

### 1-5. 環境変数の設定

1. ダウンロードした JSON ファイルをテキストエディタで開き、中身を1行の文字列としてコピーします。
2. `.env.local` に以下を設定します(値は実際のものに置き換えてください)。

   ```
   DATA_MODE=live
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n", ...}
   SHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz...
   ```

   `private_key` 内の改行は、JSONファイルそのままの `\n` エスケープ表記でも、実際の改行でもどちらでも
   問題なく読み込めます。

---

## 2. Slack 連携

### 2-1. Slack App の作成

1. [Slack API: Your Apps](https://api.slack.com/apps) を開き、対象のワークスペースにログインします。
2. 「Create New App」→「From scratch」を選択します。
3. App Name(例: `Tobidai Cockpit`)を入力し、連携したいワークスペースを選択して「Create App」をクリックします。

### 2-2. Bot Token Scopes の設定

1. 左メニューの「OAuth & Permissions」を開きます。
2. 「Scopes」→「Bot Token Scopes」で「Add an OAuth Scope」をクリックし、以下の4つを追加します。
   - `chat:write` — 「届ける」機能でメッセージを投稿するために必要
   - `channels:history` — ダッシュボードの Slack ハイライト取得(投稿本文の読み取り)に必要
   - `channels:read` — チャンネル名の解決に必要
   - `users:read` — 投稿者の表示名解決に必要

### 2-3. ワークスペースへのインストールとトークン取得

1. 同じ「OAuth & Permissions」ページ上部の「Install to Workspace」(または「Install App」)をクリックし、
   内容を確認して「許可する」をクリックします。
2. インストール完了後、「Bot User OAuth Token」(`xoxb-` で始まる文字列)が表示されるのでコピーします。
   これが `SLACK_BOT_TOKEN` です。

### 2-4. チャンネルへのボット招待とチャンネルID取得

1. Slack アプリで、ハイライト表示したいチャンネル(例: `#成約報告` `#全社`)を開きます。
2. チャンネル名をクリック→「インテグレーション」タブ→「アプリを追加する」から、
   2-1 で作成したアプリを招待します(`/invite @Tobidai Cockpit` をチャンネルに投稿する方法でも可)。
3. チャンネルIDを確認します。チャンネル名をクリックして開く詳細パネルの一番下、
   または PC 版 Slack でチャンネル名を右クリック→「リンクをコピー」で得られる URL の末尾
   (`C0123ABCDEF` のような文字列)がチャンネルIDです。
4. 「届ける」機能でメッセージを送信する可能性があるチャンネルにも、同様にボットを招待しておいてください
   (招待されていないチャンネルには投稿できません)。

### 2-5. 環境変数の設定

`.env.local` に以下を設定します。

```
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
SLACK_HIGHLIGHT_CHANNELS=C0123ABCDEF,C0456GHIJKL
SLACK_DEFAULT_CHANNEL=C0123ABCDEF
```

- `SLACK_HIGHLIGHT_CHANNELS` はダッシュボードの「Slack 最新ハイライト」で読みに行くチャンネルIDを
  カンマ区切りで指定します(1つでも複数でも可)。
- `SLACK_DEFAULT_CHANNEL` は「届ける」でチャンネル指定が空だった場合の送信先です(任意設定)。

---

## 3. `.env` の設定と起動確認

1. リポジトリ直下の `.env.example` を `.env.local` としてコピーし、上記1・2で控えた値を埋めます。

   ```bash
   cp .env.example .env.local
   ```

2. `ANTHROPIC_API_KEY` も設定すると、AI応答が Claude API 経由になります(未設定でもルールベースで動作します)。
3. 開発サーバーを起動します。

   ```bash
   npm install
   npm run dev
   ```

4. `http://localhost:3000` を開き、ダッシュボード(今日の経営)の各セクションにあるソースバッジを確認します。
   - `Sheets(連携中)` / `Slack(連携中)`: 実データの取得に成功しています。
   - `Sheets(デモ)` / `Slack(デモ)`: `DATA_MODE` が `live` になっていない状態です(意図通りならOK)。
   - `Sheets(接続エラー・デモ表示)` / `Slack(接続エラー・デモ表示)`: `DATA_MODE=live` だが接続・認証・
     シート内容のパースのいずれかに失敗し、デモデータへフォールバックしています。
     ターミナルのサーバーログに `console.warn` で具体的なエラー内容(認証エラー/シート構成エラーなど)が
     出力されるので、それを見ながら 1・2 の手順を見直してください。よくある原因:
     - サービスアカウントにスプレッドシートを共有し忘れている
     - `SHEET_ID` の値が違う(URLの一部を取り違えている)
     - タブ名・列構成が `docs/SHEET_TEMPLATE.md` と異なる
     - Slack のボットが対象チャンネルに招待されていない
     - `SLACK_BOT_TOKEN` の Scopes 不足(2-2 の4つが必要)
5. 本番相当の動作確認をしたい場合は、ビルド後に `DATA_MODE=live` を設定して起動します。

   ```bash
   npm run build
   DATA_MODE=live npm run start
   ```

   認証情報が正しければ「連携中」、未設定・誤りがあれば自動的に「接続エラー・デモ表示」に
   フォールバックし、アプリ自体は落ちずに動作し続けます。
