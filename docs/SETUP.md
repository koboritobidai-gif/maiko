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

#### `.env.local` とは

アプリに「秘密の設定値」を渡すためのテキストファイルです。

- 置き場所: **プロジェクトの一番上のフォルダ**(`package.json` と同じ場所)
- ファイル名: `.env.local`(先頭のドットまで含めて正確にこの名前。拡張子はありません)
- 作り方: 同じ場所にある見本ファイル `.env.example` をコピーして作るのが簡単です

  ```bash
  cp .env.example .env.local
  ```

  エクスプローラー/Finder 上でコピーして「.env.local」にリネームしても同じです
  (Windows のメモ帳で保存する場合、「.env.local.txt」にならないよう注意)。
- 中身は「変数名=値」を1行ずつ書く形式です。`=` の前後にスペースは入れません。値を囲む引用符も不要です。
- このファイルは `.gitignore` により **git には保存されません**(秘密情報を誤って公開しないため)。

#### 手順(おすすめ: 鍵ファイルをそのまま置く方法)

1-3-6 でダウンロードした JSON ファイル(`プロジェクト名-xxxxxx.json` のような名前)を使います。
**ファイルを開いて中身をコピーする必要はありません。**

1. ダウンロードした JSON ファイルを、プロジェクトの一番上のフォルダ(`package.json` と同じ場所)に移動し、
   ファイル名を `service-account.json` に変更します。
   (この名前のファイルは `.gitignore` 済みなので、git に誤って入る心配はありません)
2. `.env.local` に以下の3行を書きます。

   ```
   DATA_MODE=live
   GOOGLE_SERVICE_ACCOUNT_FILE=./service-account.json
   SHEET_ID=(1-4-3で控えたシートID)
   ```

   - `DATA_MODE=live` … デモデータではなく実データ連携を使う、という切り替えスイッチです。
   - `GOOGLE_SERVICE_ACCOUNT_FILE=./service-account.json` … 手順1で置いた鍵ファイルの場所です。
     `./` は「プロジェクトの一番上のフォルダ」という意味なので、このままでOKです。
   - `SHEET_ID=` … スプレッドシートを開いたときのURL
     `https://docs.google.com/spreadsheets/d/1AbCd...XyZ/edit#gid=0`
     のうち、**`/d/` と `/edit` に挟まれた部分**(例では `1AbCd...XyZ`)だけを貼り付けます。
     URL全体を貼らないよう注意してください。

   記入例(シートIDは架空のものです):

   ```
   DATA_MODE=live
   GOOGLE_SERVICE_ACCOUNT_FILE=./service-account.json
   SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
   ```

3. 保存したら、開発サーバーを再起動します(起動中なら Ctrl+C で止めて `npm run dev` をやり直す)。
   **`.env.local` の変更は再起動するまで反映されません。**

#### 別法: JSONの中身を直接貼り付ける方法

サーバーにファイルを置けないホスティング環境(Vercel など)では、こちらを使います。

1. ダウンロードした JSON ファイルをテキストエディタ(メモ帳/テキストエディット等)で開きます。
   中身は `{` で始まり `}` で終わる、`"type"`, `"project_id"`, `"private_key"`, `"client_email"` などが
   並んだテキストです。
2. **全選択(Ctrl+A / Cmd+A)してコピー**し、`GOOGLE_SERVICE_ACCOUNT_JSON=` の直後に貼り付けます。

   ```
   DATA_MODE=live
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"tobidai-cockpit","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQ...(長い文字列)...\n-----END PRIVATE KEY-----\n","client_email":"tobidai-cockpit-reader@tobidai-cockpit.iam.gserviceaccount.com",...}
   SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
   ```

   - 注意点は1つだけ: **`{` から `}` までが `.env.local` 上で1行に収まっている**ことです。
     ダウンロード直後のファイルは複数行に整形されていることが多いので、貼り付け後に
     途中で改行されてしまっている場合は、行末で Delete を押して1行につなげてください。
   - `private_key` の値の中にある `\n` という2文字(バックスラッシュ+n)は、**そのままにしてください**。
     消したり実際の改行に直したりする必要はありません(どちらの形式でも読み込めますが、
     そのままが一番安全です)。
   - Vercel 等の管理画面から設定する場合は、環境変数 `GOOGLE_SERVICE_ACCOUNT_JSON` の値欄に
     JSONファイルの中身をそのまま貼り付ければOKです(管理画面は複数行でも受け付けます)。

#### うまくいかないとき(このステップ関連)

| 症状 | 原因と対処 |
|---|---|
| バッジが「Sheets(デモ)」のまま | `DATA_MODE=live` が書かれていない/`.env.local` の場所・ファイル名が違う/サーバーを再起動していない |
| 「GOOGLE_SERVICE_ACCOUNT_FILE のファイルを読み込めませんでした」 | パスの誤り。鍵ファイルが `package.json` と同じフォルダにあり、名前が `service-account.json` になっているか確認 |
| 「JSON 解析に失敗しました」 | 貼り付けたJSONが途中で改行されて壊れている。1行につなげ直すか、おすすめのファイル方式に切り替える |
| 「private_key で署名できませんでした」 | `private_key` の中身が欠けている(コピー漏れ)。ファイル方式に切り替えるのが確実 |
| 認証は通るがデータが出ない | シートをサービスアカウントのメールに共有していない/`SHEET_ID` がURLの別の部分を貼っている |

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
SLACK_CANDIDATE_CHANNEL=C071ZU15QBX
```

- `SLACK_HIGHLIGHT_CHANNELS` はダッシュボードの「Slack 最新ハイライト」で読みに行くチャンネルIDを
  カンマ区切りで指定します(1つでも複数でも可)。
- `SLACK_DEFAULT_CHANNEL` は「届ける」でチャンネル指定が空だった場合の送信先です(任意設定)。
- `SLACK_CANDIDATE_CHANNEL` は求職者データベース(進捗データベース画面、次項参照)が読みに行く
  `#求職者` チャンネルのIDです。

### 2-6. 求職者データベース(`#求職者` チャンネル)の設定

「求職者一覧」画面の「進捗データベース」タブは、社内Slackの `#求職者` チャンネル(公開チャンネル)を
**1人の求職者につき1スレッド**の運用で読み取ります。親メッセージは求職者名のみ(例:「宮田裕真」)、
スレッドへの返信に基本情報・特徴・面談履歴・進捗を書いていく運用を想定しています。

1. Slack アプリで `#求職者` チャンネルを開きます(無ければ新規作成してください。公開チャンネル推奨)。
2. 2-4 と同じ手順で、このチャンネルにもボットを招待します
   (`/invite @Tobidai Cockpit` をチャンネルに投稿する方法でも可)。
3. チャンネルIDを控えます(2-4 と同じ方法で確認できます)。
4. `.env.local` の `SLACK_CANDIDATE_CHANNEL` に、控えたチャンネルIDを設定します。
5. 追加の Bot Token Scope は不要です(2-2 で設定した `channels:history` / `channels:read` /
   `users:read` の3つで、スレッド本文・返信・投稿者名の取得・パーマリンク取得(`chat.getPermalink`)
   がすべて動作します)。
6. 開発サーバーを再起動し、`/candidates` の「進捗データベース(#求職者)」タブでカードが
   表示されることを確認してください。取得に失敗した場合は「Slack(接続エラー・デモ表示)」
   バッジになり、サーバーログに具体的なエラー内容が出力されます。

> **運用メモ**: API呼び出し数を抑えるため、返信本文の取得は「直近アクティブな30スレッド」までに
> 制限しています(超過分は氏名・登録日時・返信数のみ表示され、本文取得は省略されます)。
> 通常運用の求職者数であれば問題になりませんが、大量の求職者を同時に抱える場合は
> スレッドをアーカイブする等で `#求職者` チャンネル内のアクティブなスレッド数を整理してください。

---

## 4. 集客・広告シート連携

ダッシュボードの「集客・広告(月内)」セクション、および「AIに聞く」の広告費・CPA・ブロック率の
質問に答えるための連携です。以下の2つの**既存の外部スプレッドシート**(社内で別途運用しているもの)を、
1章で作成したサービスアカウントに共有するだけで連携できます(新しくシートを作る必要はありません)。

| シート | 用途 | 環境変数 |
|---|---|---|
| アイドマ(広告運用シート) | タブ「Google広告 」「Meta広告」の日次広告実績 | `MARKETING_AD_SHEET_ID` |
| リズリアライズ(SNS運用シート) | タブ「週次トラッキング」のSNS週次実績 | `MARKETING_SNS_SHEET_ID` |

### 4-1. サービスアカウントへの共有

1. 1章で作成済みのサービスアカウント(`xxxxx@xxxxx.iam.gserviceaccount.com`)のメールアドレスを、
   上記2つのスプレッドシートそれぞれの「共有」設定に**閲覧者**権限で追加します
   (`GOOGLE_SERVICE_ACCOUNT_FILE` / `GOOGLE_SERVICE_ACCOUNT_JSON` は1章のものをそのまま共用します。
   新たに鍵を作る必要はありません)。
2. 各シートのURL `https://docs.google.com/spreadsheets/d/【この部分】/edit` の `【この部分】` が
   シートIDです。控えておきます。

   参考(現行運用シートの実際のID。差し替え済みの場合は最新のものを使ってください):

   ```
   アイドマ(広告運用シート):     17EUif-ZH8mS-g09PnoGvQj0dN3xsjvGTR7YmJabqSyQ
   リズリアライズ(SNS運用シート): 1vKT7H27uAEX9X5QwpDySWapcAbxlIJC0UCJyXSroW7Q
   ```

### 4-2. タブ構成について

アプリはタブ名・見出しの表記ゆれにある程度対応するように作られています(既存運用シートをそのまま
読み取れるようにするため)。

- 広告運用シートは「日付」「費用」を含む見出し行を自動検出し、列も見出し文字列(日付/費用/表示回数/
  クリック数/LINE登録数/面談予約数/面談実施数)で位置を特定します。CTR・CPA等の計算列は読み取りません
  (アプリ側で自動計算します)。
- 「Google広告」タブが(末尾スペースの有無などで)同名のものが複数存在する場合、実データの行数が
  多い方を自動的に採用します。
- SNS運用シートは「週」「期間」を含む見出し行を自動検出します。「期間」列(例: `6/19-6/25`)には
  年を含めなくてかまいません(最初の週が2026年6月として、月が減った時点で年を繰り上げて解釈します)。

シートの列構成そのものを変更する必要はありません。上記の見出し文字列を含む列がある限り、位置がずれても
自動的に検出されます。

### 4-3. 環境変数の設定

`.env.local` に以下を設定します。

```
MARKETING_AD_SHEET_ID=17EUif-ZH8mS-g09PnoGvQj0dN3xsjvGTR7YmJabqSyQ
MARKETING_SNS_SHEET_ID=1vKT7H27uAEX9X5QwpDySWapcAbxlIJC0UCJyXSroW7Q
MARKETING_SNS_MONTHLY_COST=495000
```

- `MARKETING_SNS_MONTHLY_COST` は SNS運用(リズリアライズ)の月額固定費用(円)です。シート側に
  費用の実績列が無いため、固定値として環境変数で設定します(未設定時は495,000円)。
- 保存後、開発サーバーを再起動してください。

### うまくいかないとき(このステップ関連)

| 症状 | 原因と対処 |
|---|---|
| バッジが「集客データ(デモ)」のまま | `DATA_MODE=live` が設定されていない、または `MARKETING_AD_SHEET_ID` / `MARKETING_SNS_SHEET_ID` が未設定 |
| 「◯◯タブが見つかりません。アイドマ/リズリアライズのシートIDが入れ替わっていないか確認してください」 | `MARKETING_AD_SHEET_ID` と `MARKETING_SNS_SHEET_ID` の値が逆になっている可能性が高いです。入れ替えて再確認してください |
| 認証は通るがデータが出ない | サービスアカウントへの共有(4-1)を忘れている可能性があります |

---

## 5. `.env` の設定と起動確認

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
