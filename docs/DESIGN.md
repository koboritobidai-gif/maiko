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

- 組織: 拠点は無く、担当者個人単位で運用(代表1名・CA3名・RA2名の6名体制)。
  - 小堀(代表・マーケティング/経営を兼務)
  - 今井・佐藤・富田(CA。求職者面談・選考対応)
  - 清本・江崎(RA。法人新規開拓・商談)
- KPI: 週次入力(毎週月曜に前週分を入力)・月次集計。求職者集客(LINEファネル)系・法人営業系の2区分。
  - 求職者系: PV数 → LINE登録人数 → 面談予約数 → 面談数 → 1次〜最終前面接数/最終面接数 → 内定者数 → 採用決定求職者数
  - 法人系: 名刺交換数 → アポイント数(主権/非主権/外部) → 商談数(主権/非主権/外部)・既存商談数(主権/非主権) → 契約数・契約金額 → 採用決定法人数
  - 自動計算率(シートには入力せず、アプリ側で算出): LINE登録率 = LINE登録人数 / PV数、面談実行率 = 面談数 / 面談予約数、面談移行率 = 面談数 / LINE登録人数
- 求職者進捗ステージ: `新規登録 → 面談 → 企業提案 → 面接 → 内定 → 承諾 → 入社`(離脱: `辞退`)
- 成約(個別の求職者の入社確定)の売上計算: 理論年収 × 手数料率(35%)。承諾=確定売上、内定=見込み売上として集計。
  週次KPIの「契約数/契約金額」は法人営業(RA)がクライアント企業と結ぶ採用支援契約(採用決定前段階)を指し、
  求職者個別の成約(Placement)とは別の指標として扱う。

## 3. 技術構成

- Next.js (App Router) + TypeScript + Tailwind CSS。レスポンシブ対応:
  スマホ(lg未満)は下部固定タブバー+1カラムの縦積みレイアウト、
  PC(lg以上、`min-width:1024px`)は左固定サイドバーナビ+ワイドな複数カラムのグリッドレイアウトに切り替わる
  (詳細は4章参照)。max-widthでの画面幅固定は行わず、PCでは画面幅いっぱいを使う
- 日本語UI。**配色はライトテーマに一本化**(ダークモード対応は無し。`prefers-color-scheme` /
  `data-theme` によるダーク配色の分岐は持たない)。
  - 背景は常に純白(`#ffffff`)。カードも白地+薄いグレー枠(`#e5e7eb`系)+ごく薄い影
  - テキストは濃色(`#1a1a1a`系)でコントラストを高く保つ
  - アクセントカラーとして濃紺(`#16233f`系)と金(`#b08d3e`系)を使用するが、
    ヘッダー・サイドバー・タブバーの地色は白とし、濃紺・金は見出し文字・アイコン・選択状態の
    強調(バッジ、選択中ナビ項目の帯、金アイコンなど)にのみ使う。ヘッダー/ナビの面積を
    濃紺で塗りつぶす旧デザインは廃止した
- AI: `ANTHROPIC_API_KEY` があれば Claude API(claude-sonnet-5)を使用。無ければ**デモレスポンダ**(データに対するクエリエンジン+ルールベース応答)で全機能が動作
- データ層はアダプタパターン+統合バンドル(`DataBundle`)で実連携/デモを切り替え可能。詳細は6章参照
  - `SpreadsheetSource`: `DemoSpreadsheetSource`(実装) / `GoogleSheetsSource`(実装 — Google Sheets Values API を直接 fetch で呼び出し)
  - `MessengerSource`: `DemoSlackSource`(実装) / `SlackSource`(実装 — Slack Web API を直接 fetch で呼び出し)
- metrics.ts / ai/*.ts は `DataBundle`(または内包する配列)を引数に取る純関数として実装されており、
  demo-data.ts や adapters を直接 import しない(実データ・デモデータの双方に同一ロジックを適用するため)
- デモデータは実行日(`new Date()`)基準で相対生成し、「本日」「月内」「直近8週」に常にデータが存在する状態を保つ

## 4. 画面構成(下部タブ5つ+ログイン、PCは左サイドバー6項目)

### 4.0 ログイン(ロール選択)
- デモ用ロール切替: 「小堀社長(経営ビュー)」「佐藤CA(現場ビュー)」。ヘッダーに「◯◯としてログイン中」表示

### 4.0.1 ナビゲーション(レスポンシブ)

- **スマホ(lg未満)**: `AppShell`(`src/components/AppShell.tsx`)が白基調のヘッダー(挨拶+日付+ロール切替)と
  下部固定タブバー(今日の経営/AIに聞く/届ける/面談AI/提案書の5項目、`TabBar.tsx`)を表示する現行踏襲のレイアウト。
  画面幅いっぱいに1カラムで表示し、max-widthでの固定は行わない
- **PC(lg以上)**: 左に固定サイドバー(`Sidebar.tsx`、幅256px、白背景+右罫線)を表示し、
  下部タブバーは非表示にする。サイドバーの項目は今日の経営/**求職者一覧**/AIに聞く/届ける/面談AI/提案書の6つで、
  求職者一覧はPCナビでのみ一級項目に昇格させている(スマホの下部タブには含めない方針は維持)。
  選択中の項目は濃紺の帯+金色アイコンで強調する。
  ヘッダーは挨拶+日付+ロール切替のみのスリムな上部バーとしてメインカラム側に残す
  (サイドバーとロゴ・ナビが重複しないよう整理)
- メインコンテンツ幅: ダッシュボード・求職者一覧は `max-width:1280px` 程度、
  AIに聞く/届ける/面談AI/提案書は `max-width:768px`(`max-w-3xl`)程度に収め、中央寄せで表示する

### 4.1 今日の経営(ダッシュボード)

- 挨拶+日付
- 主要指標(今月): 面談数 / 内定者数 / 採用決定(求職者) / 新規契約金額(万円)。各カードに先月同値との差分(+n/-n)を小さく表示。
  カード数はスマホ/sm=2枚、PC(lg)=4枚のグリッド
- 求職者ファネル(月内): PV数 → LINE登録 → 面談予約 → 面談 → 面接(1次〜最終前+最終) → 内定 → 採用決定 を横棒ファネル表示。
  LINE登録率・面談実行率・面談移行率をバッジ表示
- 法人営業ファネル(月内): 名刺交換 → アポイント(主権/非主権/外部の内訳) → 商談(同内訳) → 契約(件数+金額)。
  PC(lg)では求職者ファネルと左右2カラムで並ぶ
- 週次推移(直近5週): 面談数・内定者数・契約金額のミニ表 + 「毎週月曜に前週分を入力」の運用注記
- **月次推移(直近6ヶ月・管理者向け)**: 月ごとに 面談数/内定者数/採用決定求職者数/契約金額(万円)/PV数/LINE登録人数を
  集計した表。当月行は太字+金アクセントで強調する。スマホでは横スクロール可能なテーブル、PCでは列が収まる幅の表として表示。
  集計は `metrics.ts` の `getMonthlyKpiHistory(records, months=6)`(純関数)。
  PC(lg)では週次推移と左右2カラムで並ぶ
- 求職者パイプライン(ステージ別、新7段階): 各ステージ人数の横棒。PC(lg)ではプロジェクト進捗と左右2カラムで並ぶ
- プロジェクト進捗カード: 状態バッジ(順調/注意/遅延)、担当部門・担当者、進捗%バー、期日、最新一言
- Slack 最新ハイライト: チャンネル名・投稿者・時刻・本文の要約フィード。全幅セクションで、PC(lg)では投稿カードを2カラムのマス目に並べる
- ロール別表示: 経営ビュー(小堀)は全体を表示。現場ビュー(佐藤CA)は自分の担当求職者数を先頭カードに追加表示
- 「求職者パイプライン(ステージ別)」セクションのヘッダー右に「一覧を見る →」リンクを表示し、4.1.1 の求職者一覧(`/candidates`)へ遷移する
  (PCではサイドバーからも直接遷移できる)

### 4.1.1 求職者一覧(`/candidates`)

社内Slack「#求職者」チャンネルに書かれる求職者情報(氏名・性別・年齢・流入経路・送客先・面接結果)を
一覧で確認するための専用画面。下部タブには含めず、ダッシュボードからのリンク経由でアクセスする
(4.1 参照)。ページ側に「← 今日の経営へ戻る」リンクを設置する。

- 上部: 検索ボックス(氏名・流入経路・送客先の部分一致)+ ステージ絞り込みチップ
  (全て/新規登録/面談/企業提案/面接/内定/承諾/入社/辞退。各チップに件数バッジ)
- 求職者カード(更新日の新しい順): 氏名(太字)/ ステージバッジ(StatusBadge風の配色。辞退はグレー)/
  性別・年齢(例「女性・26歳」。無ければ非表示)/ 希望職種 / 流入経路 / 送客先 / 面接結果 /
  担当CA名 / 更新日 / 最新メモ。性別・年齢・流入経路・送客先・面接結果は任意項目のため、
  値が無い項目は行ごと省略して詰めて表示する。カード配置はスマホ1カラム、PC(lg)は2カラム、
  より広い画面(xl)は3カラムのグリッド
- 右上に SourceBadge(Sheets連携状態)を表示
- データソース: `loadDataBundle()`(`revalidate = 60`)。求職者タブの任意列(性別/年齢/流入経路/送客先/
  面接結果)は `docs/SHEET_TEMPLATE.md` 参照

### 4.2 AIに聞く
- サジェストチップ: 「今日の成約は?」「今月の面談数は?」「LINE登録率は?」「今月の契約金額は?」「遅れているプロジェクトは?」「選考中の求職者は?」
- チャットUI。回答はデータから計算した正確な数値+一言インサイト。週次入力(今週/先週)・月次集計(今月/先月)・前月比較・担当者別(例:「清本さんの商談数は?」)の質問に対応

### 4.3 届ける
- 配信したい情報(成果報告・ニュース・相談・所感)を入力 → 「AIに宛先を考えてもらう」
- AIが宛先メンバー(理由付き)+ 配信先Slackチャンネルを提案 → 整形されたメッセージプレビュー → 送信(デモ)
- 宛先マッチングは担当領域ベース: 法人・契約・商談 → 清本・江崎、面談・求職者 → 今井・佐藤・富田、マーケ・PV・LINE → 小堀、経営数字 → 小堀

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
    candidates/page.tsx     # 求職者一覧(ダッシュボードからリンク遷移。下部タブには含めない)
    ask/page.tsx            # AIに聞く
    deliver/page.tsx        # 届ける
    meeting/page.tsx        # 面談AI
    proposal/page.tsx       # 提案書
    api/ask/route.ts
    api/deliver/route.ts
    api/meeting/route.ts
    api/proposal/route.ts
  components/               # AppShell, Sidebar(PC左ナビ), TabBar(スマホ下部ナビ), Header, KpiCard,
                             # ProgressBar, StatusBadge(+StageBadge), ChatBubble,
                             # DashboardView, CandidateListView など
  lib/
    types.ts                # Candidate, Placement, Member, Project, SlackPost, Stage, WeeklyKpiRecord, DataBundle, Settings...
    demo-data.ts            # デモデータ生成(実行日基準。週次KPIは直近8週分)
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
- Sheets Values API の `batchGet` で「設定/メンバー/求職者/成約/プロジェクト/週次KPI」6タブを1回のHTTP
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
