# 株式会社翔び台 社内コックピット「Tobidai Cockpit」設計書

- 設計・企画・指揮: Claude Fable 5
- 実装: Claude Sonnet 5
- 作成日: 2026-07-22

## 1. 目的

社内のプロジェクト進捗・営業数字・求職者進捗が不透明で、確認したい時にすぐ確認できない状況を解消する。
Slack・スプレッドシート(デモ段階ではデモデータ)と連携し、

1. 知りたい情報はチャットで聞けば1発で最適な答えが返る
2. 出したい情報はAIが最適なメンバーへルーティングして届けられる

状態を実現する。

## 2. 事業ドメイン(人材紹介)

- KPI: 成約(内定承諾)件数・紹介手数料売上・月次目標達成率・売上見込み(内定/承諾ベース)
- 求職者進捗ステージ: `新規登録 → 面談 → 企業提案 → 書類選考 → 面接 → 内定 → 承諾 → 入社`(離脱: `辞退/クローズ`)
- 組織: 拠点(東京本社・横浜・大阪・名古屋・福岡)× 職種(キャリアアドバイザー CA / 法人営業 RA / 管理部門)
- 売上計算: 理論年収 × 手数料率(35%)。承諾=確定売上、内定=見込み売上として集計

## 3. 技術構成

- Next.js (App Router) + TypeScript + Tailwind CSS。モバイルファースト(PCでも崩れない)
- 日本語UI。配色は参考システム踏襲: 濃紺(#16233f 系)ヘッダー/タブバー + 生成り/白カード + 金色アクセント
- AI: `ANTHROPIC_API_KEY` があれば Claude API(claude-sonnet-5)を使用。無ければ**デモレスポンダ**(データに対するクエリエンジン+ルールベース応答)で全機能が動作
- データ層はアダプタパターン+統合バンドル(`DataBundle`)で実連携/デモを切り替え可能。詳細は6章参照
  - `SpreadsheetSource`: `DemoSpreadsheetSource`(実装) / `GoogleSheetsSource`(実装 — Google Sheets Values API を直接 fetch で呼び出し)
  - `MessengerSource`: `DemoSlackSource`(実装) / `SlackSource`(実装 — Slack Web API を直接 fetch で呼び出し)
- metrics.ts / ai/*.ts は `DataBundle`(または内包する配列)を引数に取る純関数として実装されており、
  demo-data.ts や adapters を直接 import しない(実データ・デモデータの双方に同一ロジックを適用するため)
- デモデータは実行日(`new Date()`)基準で相対生成し、「本日」「月内」に常にデータが存在する状態を保つ

## 4. 画面構成(下部タブ5つ+ログイン)

### 4.0 ログイン(ロール選択)
- デモ用ロール切替: 「小堀社長(経営ビュー)」「高梨CA(現場ビュー)」。ヘッダーに「◯◯としてログイン中」表示

### 4.1 今日の経営(ダッシュボード)
- 挨拶+日付
- 主要指標カード(スプレッドシート由来のKPI自動反映):
  本日の成約(件・金額) / 月内累計成約(件・金額) / 月次目標達成率(%・目標額) / 売上見込み(内定+承諾ベース)
- 拠点別月内実績: 実績額/目標額 + 達成率バー
- 求職者パイプライン(ステージ別): 各ステージ人数の横棒
- プロジェクト進捗カード: 状態バッジ(順調/注意/遅延)、担当部門・担当者、進捗%バー、期日、最新一言
- Slack 最新ハイライト: チャンネル名・投稿者・時刻・本文の要約フィード

### 4.2 AIに聞く
- サジェストチップ: 「今日の成約は?」「月内の売上見込みは?」「遅れているプロジェクトは?」「大阪拠点の状況は?」「選考中の求職者は?」「◯◯さんの担当求職者は?」
- チャットUI。回答はデータから計算した正確な数値+一言インサイト

### 4.3 届ける
- 配信したい情報(成果報告・ニュース・相談・所感)を入力 → 「AIに宛先を考えてもらう」
- AIが宛先メンバー(理由付き)+ 配信先Slackチャンネルを提案 → 整形されたメッセージプレビュー → 送信(デモ)

### 4.4 面談AI(面談コパイロット)
- 求職者面談・企業商談の文字起こしを貼るだけ(サンプル文字起こし2件を同梱)
- 生成物: 議事録 / 求職者・顧客インサイト / ネクストアクション / スプレッドシート更新内容(ステージ更新案) / フォローメール文面

### 4.5 提案書(AI推薦状ジェネレーター)
- 求職者条件フォーム(氏名任意・年齢層・現職種・希望職種・希望年収・希望勤務地・転職目的)
- 企業向け推薦状/提案書をA4風プレビューで生成(推薦理由・スキルサマリ・想定手数料)

## 5. ディレクトリ設計

```
src/
  app/
    layout.tsx / globals.css
    page.tsx                # 今日の経営
    ask/page.tsx            # AIに聞く
    deliver/page.tsx        # 届ける
    meeting/page.tsx        # 面談AI
    proposal/page.tsx       # 提案書
    api/ask/route.ts
    api/deliver/route.ts
    api/meeting/route.ts
    api/proposal/route.ts
  components/               # TabBar, Header, KpiCard, ProgressBar, StatusBadge, ChatBubble, DashboardView など
  lib/
    types.ts                # Candidate, Placement, Branch, Project, Member, SlackPost, Stage, DataBundle, Settings...
    demo-data.ts            # デモデータ生成(実行日基準)
    metrics.ts              # KPI集計ロジック(DataBundle/配列を引数に取る純関数。唯一の集計箇所)
    data-bundle.ts          # loadDataBundle(): アダプタから DataBundle を構築(60秒メモリキャッシュ、live失敗時はデモへフォールバック)
    source-status.ts        # SourceStatus → ソースバッジ文言のマッピング(クライアント安全)
    adapters/spreadsheet.ts # SpreadsheetSource IF + DemoSpreadsheetSource + GoogleSheetsSource(実装)
    adapters/messenger.ts   # MessengerSource IF + DemoSlackSource + SlackSource(実装)
    ai/client.ts            # Claude API 呼び出し(キー無しならnull)
    ai/ask-responder.ts     # 「AIに聞く」スナップショット構築+ルールベース応答(DataBundleを引数に取る)
    ai/deliver-router.ts    # 「届ける」宛先ルーティング(DataBundleを引数に取る)
    ai/meeting-gen.ts       # 「面談AI」生成ロジック(DataBundleを引数に取る)
    ai/proposal-gen.ts      # 「提案書」生成ロジック(DataBundleを引数に取る)
  store/session.ts          # ロール選択(localStorage)
```

## 6. 実連携(Google Sheets / Slack)の構成

DATA_MODE を環境変数で切り替えることで、実データ連携とデモデータを切り替えられる(セットアップ手順は
`docs/SETUP.md`、シート仕様は `docs/SHEET_TEMPLATE.md` を参照)。

### 6.1 データフロー

`src/lib/data-bundle.ts` の `loadDataBundle()` が全機能の唯一のデータ取得口になっている。

1. ダッシュボード(`src/app/page.tsx`)はサーバーコンポーネントとして `loadDataBundle()` を呼び、
   `metrics.ts` で集計した結果をクライアントコンポーネント(`DashboardView`)へ props で渡す
   (`export const revalidate = 60` により60秒おきにライブデータを再取得)。
2. API Routes(`api/ask` `api/deliver` `api/meeting` `api/proposal`)はリクエストのたびに
   `loadDataBundle()` を呼び、`ai/*.ts` の各生成関数へ渡す。
3. `loadDataBundle()` 自体もモジュールメモリに60秒キャッシュを持つため、同一プロセス内では
   Google Sheets / Slack への実際のHTTP呼び出しは60秒に1回程度に抑えられる。

### 6.2 Google Sheets(`GoogleSheetsSource`)

- 追加npm依存なし。`node:crypto` の `createSign("RSA-SHA256")` でサービスアカウント鍵から RS256 署名の
  JWT を組み立て、`https://oauth2.googleapis.com/token` でアクセストークンを取得する(50分メモリキャッシュ)。
- Sheets Values API の `batchGet` で「設定/拠点/メンバー/求職者/成約/プロジェクト」6タブを1回のHTTP
  呼び出しでまとめて取得し、`types.ts` の型へパースする(数値・日付・ステージ名などをバリデーションし、
  失敗時はどの行の何が不正かを含む日本語エラーメッセージを投げる)。
- 環境変数: `GOOGLE_SERVICE_ACCOUNT_JSON`(鍵JSON文字列)/ `SHEET_ID`。

### 6.3 Slack(`SlackSource`)

- 追加npm依存なし。Slack Web API(`chat.postMessage` / `conversations.history` /
  `conversations.info` / `users.info`)を直接 `fetch` で呼び出す。
- 「届ける」の送信は live 時は `chat.postMessage` で実際に投稿し、demo 時は従来通りログ出力のみ。
- ダッシュボードの Slack ハイライトは `SLACK_HIGHLIGHT_CHANNELS`(カンマ区切りチャンネルID)の
  `conversations.history` を取得し、`users.info` / `conversations.info` で投稿者名・チャンネル名を解決する。
- 環境変数: `SLACK_BOT_TOKEN` / `SLACK_HIGHLIGHT_CHANNELS` / `SLACK_DEFAULT_CHANNEL`。

### 6.4 フォールバックとソースバッジ

- `DATA_MODE=live` で接続・パースに失敗した場合、`console.warn` した上で自動的にデモデータへ
  フォールバックする(アプリ自体はエラーにならない)。
- `DataBundle` は `sourceStatus`(Sheets)と `slackStatus`(Slack)をそれぞれ独立に持ち、
  `"live" | "demo" | "live-error"` の3値を取る。ダッシュボードのソースバッジは
  `src/lib/source-status.ts` の `sourceBadgeLabel()` で以下のように出し分けられる。
  - `live` → 「Sheets(連携中)」/「Slack(連携中)」
  - `demo` → 「Sheets(デモ)」/「Slack(デモ)」
  - `live-error` → 「Sheets(接続エラー・デモ表示)」/「Slack(接続エラー・デモ表示)」
