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
- **集客・広告(月内)**: 主要指標の直後に配置。外部の広告・SNS運用シート2つ(6.5参照)から集計した
  当月の集客・広告データを表示する。SourceBadge(独自の`marketing`ステータス)+ live-error 時の赤枠を
  求職者ファネル等と同じパターンで表示する。
  - 合計カード列: 広告費用合計(円表示。キャプションに「広告+SNS+送客」の内訳を一行で表示)/
    LINE登録合計 / 面談予約合計 / 面談実績合計 / 面接回数(週次KPIの1次〜最終前+最終面接数の月内合計)。
    スマホ2枚/PC(lg)5枚のグリッド
  - 媒体別テーブル(Google広告/Meta広告/SNS運用(リズリアライズ)。列: 費用/LINE登録/予約/面談/CPA/面談単価。
    スマホは横スクロール、SNSは予約数を計測しないため「—」表示)
  - **送客パートナー(成果報酬)小テーブル**: 媒体別テーブルの下に表示。成果報酬型(1人登録・面談ごとに
    費用が発生)の送客パートナー(既定4経路: KANOA/マホガニー/foresma/2peace(Tさん))の当月費用を
    経路/単価/面談人数/費用(月内)の列+合計行で表示する。対象人数は求職者台帳(`Candidate`)のうち
    流入経路(`inflowChannel`)が経路名と部分一致(trim・大文字小文字無視)し、ステージが面談以降
    (面談/企業提案/面接/内定/承諾/入社。辞退は除外)へ進んだ人数。月内判定は求職者の登録日
    (`registeredAt`。無ければ更新日で近似)。脚注に集計ルールを小さく表示する。単価マスタは
    `Settings.referralRates`(連携シートの任意タブ「送客単価」。無ければ組み込みの既定値。6.2参照)
  - 遷移率バッジ列: クリック→LINE登録率・LINE→予約率・予約→面談実行率・SNS再生→LP率
    (分母0で算出不可のものは非表示)
  - 集計は `metrics.ts` の `getMarketingSummary(data, weeklyKpis, candidates, referralRates, now)`
    (純関数。送客パートナー費用を `totalCost` に合算する)。
    データソースは `src/lib/marketing-data.ts` の `loadMarketingData()`(5分メモリキャッシュ、
    live失敗時はデモへフォールバック。詳細は6.5参照)+ `DataBundle` の `candidates` / `settings.referralRates`
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

求職者に関する2種類の情報源(Slackスレッド/スプレッドシート台帳)を切り替えて確認するための専用画面。
下部タブには含めず、ダッシュボードからのリンク経由でアクセスする(4.1 参照)。ページ上部にタブ
(セクション切替、`CandidatesTabs`)を常設し、URL遷移を伴わないクライアント側の状態切替で
2つのビューを行き来する。既定タブは「進捗データベース」。

**タブ1: 進捗データベース(#求職者)**(既定表示)

社内Slack「#求職者」チャンネル(公開チャンネル、1人の求職者につき1スレッドの運用。親メッセージ=
氏名のみ、スレッド返信に基本情報・特徴・面談履歴・進捗が書かれる)を「新着通知」ではなく
求職者のデータベース兼進捗管理として見るビュー(`CandidateThreadListView`)。

- 上部: 「← 今日の経営へ戻る」リンク+見出し+氏名検索ボックス(部分一致)
- 求職者スレッドカード(`updatedAt` 降順): 氏名(太字)/ 返信数バッジ / 登録日・最終更新日時 /
  最新投稿(無ければ親メッセージ)の抜粋2行。カード全体が個別ページ(4.1.2)へのリンク
- カード配置はスマホ1カラム、PC(lg)は2カラム、より広い画面(xl)は3カラムのグリッド
- 右上に SourceBadge(Slack連携状態)を表示。`live-error` 時は赤枠でエラー内容を表示
  (ダッシュボードの Slack ハイライトと同じパターン)
- データソース: `loadCandidateThreads()`(5分メモリキャッシュ。取得仕様は6.3参照)

**タブ2: シート台帳**

従来の求職者一覧。実体は `CandidateListView` コンポーネントをそのまま流用しており、
本タブの追加によって既存機能・見た目に変更は無い。

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

### 4.1.2 求職者個別ページ(`/candidates/t/[threadTs]`)

進捗データベース(4.1.1 タブ1)のカードから遷移する、Slackスレッド1件分の詳細ページ。
`threadTs`(Slackメッセージts。URLエンコードして埋め込む)を動的ルートパラメータに持つ
force-dynamic のサーバーコンポーネント(`page.tsx`)+ クライアント表示コンポーネント
(`CandidateThreadDetailView`)の構成。

- ヘッダー: 氏名(大)/ 登録日・最終更新・返信数 / permalink が取得できていれば
  「Slackでスレッドを開く」リンク(新規タブ)
- 「基本情報・特徴」カード: 親メッセージ全文 + 最初の返信(あれば)。運用上、最初の返信に
  基本情報がまとまって書かれることが多いための構成
- 「進捗タイムライン」: 返信を時系列(古→新)の縦タイムラインで表示。各項目は
  日付(`YYYY/M/D HH:mm`)・投稿者名・本文(改行保持)。最新の項目には「最新」バッジ+
  ブランドブルーの強調枠(2px枠+淡い影)を付ける
- API呼び出し数抑制のため返信取得がスキップされたスレッド(6.3参照)を直接開いた場合は、
  タイムラインにその旨を示す注記を表示する
- 該当スレッドが見つからない場合(削除・URL誤り等)は「見つかりません」+一覧への戻りリンクを表示する
- データソース: `loadCandidateThreads()` の結果から `threadTs` 完全一致で検索
  (個別ページ専用のAPI呼び出しは行わず、一覧と同じ5分キャッシュを共有する)

### 4.2 AIに聞く
- サジェストチップ: 「今日の成約は?」「今月の面談数は?」「LINE登録率は?」「今月の契約金額は?」「遅れているプロジェクトは?」「選考中の求職者は?」
- チャットUI。回答はデータから計算した正確な数値+一言インサイト。週次入力(今週/先週)・月次集計(今月/先月)・前月比較・担当者別(例:「清本さんの商談数は?」)の質問に対応
- 集客・広告(6.5参照)関連: 「広告費は?」「広告金額は?」(月内媒体別+合計)、「CPAは?」「登録単価は?」(媒体別CPA)、
  「ブロック率は?」(週次KPIの任意項目「ブロック数」の月内合計 ÷ 月内LINE登録人数。未入力時は案内を返す)にも対応
- CA個別実績: 「◯◯さんの結果は?」「◯◯さんの実績は?」(氏名は今井/佐藤/富田等の姓)で、担当求職者数と
  ステージ内訳・月内成約(件数・手数料合計)・週次KPIの入力担当分をまとめて回答する
  (既存の「◯◯さんの担当求職者は?」応答とは別のキーワードで共存する)

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
    page.tsx                    # 今日の経営
    candidates/page.tsx         # 求職者一覧(ダッシュボードからリンク遷移。下部タブには含めない)
    candidates/t/[threadTs]/page.tsx  # 求職者個別ページ(進捗データベースの1スレッド詳細)
    ask/page.tsx                # AIに聞く
    deliver/page.tsx            # 届ける
    meeting/page.tsx            # 面談AI
    proposal/page.tsx           # 提案書
    api/ask/route.ts
    api/deliver/route.ts
    api/meeting/route.ts
    api/proposal/route.ts
  components/                   # AppShell, Sidebar(PC左ナビ), TabBar(スマホ下部ナビ), Header, KpiCard,
                                 # ProgressBar, StatusBadge(+StageBadge), ChatBubble, DashboardView,
                                 # CandidatesTabs(進捗データベース/シート台帳の切替)、
                                 # CandidateThreadListView, CandidateThreadDetailView, CandidateListView など
  lib/
    types.ts                    # Candidate, CandidateThread(+Reply), Placement, Member, Project, SlackPost,
                                 # Stage, WeeklyKpiRecord, DataBundle, Settings, AdDailyRecord, SnsWeeklyRecord,
                                 # MarketingData...
    demo-data.ts                # デモデータ生成(実行日基準。週次KPIは直近8週分、求職者スレッドは8名分)
    metrics.ts                  # KPI集計ロジック(DataBundle/配列を引数に取る純関数。唯一の集計箇所。
                                 # 集客・広告データの集計(getMarketingSummary)もここに含む)
    data-bundle.ts              # loadDataBundle(): アダプタから DataBundle を構築(60秒メモリキャッシュ、live失敗時はデモへフォールバック)
    candidate-threads.ts        # loadCandidateThreads(): #求職者チャンネルのスレッド一覧を取得(5分メモリキャッシュ、同上のフォールバック方針)
    marketing-data.ts           # loadMarketingData(): 集客・広告データ(外部シート2つ)を取得(5分メモリキャッシュ、同上のフォールバック方針)
    next-dynamic-usage-error.ts # isNextDynamicUsageError(): DYNAMIC_SERVER_USAGE の判定(data-bundle.ts / candidate-threads.ts / marketing-data.ts で共用)
    source-status.ts            # SourceStatus → ソースバッジ文言のマッピング(クライアント安全。sheets/slack/marketingの3種)
    adapters/spreadsheet.ts     # SpreadsheetSource IF + DemoSpreadsheetSource + GoogleSheetsSource(実装)
    adapters/messenger.ts       # MessengerSource IF(getRecentPosts/postMessage/getCandidateThreads) + DemoSlackSource + SlackSource(実装)
    adapters/marketing.ts       # MarketingSource IF(getMarketingData) + DemoMarketingSource + GoogleSheetsMarketingSource(実装。
                                 # adapters/spreadsheet.ts の認証・batchGet呼び出しを共用)
    ai/client.ts                # Claude API 呼び出し(キー無しならnull)
    ai/ask-responder.ts         # 「AIに聞く」スナップショット構築+ルールベース応答(DataBundle + CandidateThread[] + MarketingData を引数に取る)
    ai/deliver-router.ts        # 「届ける」宛先ルーティング(DataBundleを引数に取る)
    ai/meeting-gen.ts           # 「面談AI」生成ロジック(DataBundleを引数に取る)
    ai/proposal-gen.ts          # 「提案書」生成ロジック(DataBundleを引数に取る)
  store/session.ts              # ロール選択(localStorage)
```

## 6. 実連携(Google Sheets / Slack / 集客・広告シート)の構成

DATA_MODE を環境変数で切り替えることで、実データ連携とデモデータを切り替えられる(セットアップ手順は
`docs/SETUP.md`、シート仕様は `docs/SHEET_TEMPLATE.md` を参照)。

### 6.1 データフロー

`src/lib/data-bundle.ts` の `loadDataBundle()` が、求職者Slackスレッド(進捗データベース)・
集客・広告データを除く全機能の唯一のデータ取得口になっている。求職者Slackスレッドは
`src/lib/candidate-threads.ts` の `loadCandidateThreads()`、集客・広告データは
`src/lib/marketing-data.ts` の `loadMarketingData()` がそれぞれ独立した取得口・キャッシュを持つ
(4.1.1/4.1.2、6.3参照。集客・広告データは4.1/6.4参照)。

1. ダッシュボード(`src/app/page.tsx`)はサーバーコンポーネントとして `loadDataBundle()` と
   `loadMarketingData()` を並行して呼び、`metrics.ts` で集計した結果をクライアントコンポーネント
   (`DashboardView`)へ props で渡す(`export const dynamic = "force-dynamic"` によりリクエストの
   たびにライブデータを再取得する。各 `load*()` 自体のメモリキャッシュにより実際のHTTP呼び出し頻度は
   抑えられる)。
2. 求職者一覧(`src/app/candidates/page.tsx`)・求職者個別ページ(`src/app/candidates/t/[threadTs]/page.tsx`)は
   `force-dynamic` のサーバーコンポーネントとして `loadDataBundle()` と `loadCandidateThreads()` を
   並行して呼び、それぞれ `CandidatesTabs` / `CandidateThreadDetailView` へ props で渡す。
3. API Routes(`api/ask` `api/deliver` `api/meeting` `api/proposal`)はリクエストのたびに
   `loadDataBundle()` を呼び、`ai/*.ts` の各生成関数へ渡す。`api/ask` はさらに `loadCandidateThreads()`・
   `loadMarketingData()` も呼び、求職者Slackスレッド・集客広告データの情報をスナップショットに含める
   (4.2 / 6.3 / 6.4参照)。
4. `loadDataBundle()` 自体もモジュールメモリに60秒キャッシュ、`loadCandidateThreads()` / `loadMarketingData()`
   は5分キャッシュを持つため、同一プロセス内では Google Sheets / Slack / 集客・広告シートへの実際の
   HTTP呼び出しはそれぞれ60秒・5分・5分に1回程度に抑えられる。

### 6.2 Google Sheets(`GoogleSheetsSource`)

- 追加npm依存なし。`node:crypto` の `createSign("RSA-SHA256")` でサービスアカウント鍵から RS256 署名の
  JWT を組み立て、`https://oauth2.googleapis.com/token` でアクセストークンを取得する(50分メモリキャッシュ)。
- Sheets Values API の `batchGet` で「設定/メンバー/求職者/成約/プロジェクト/週次KPI」6タブを1回のHTTP
  呼び出しでまとめて取得し、`types.ts` の型へパースする(数値・日付・ステージ名などをバリデーションし、
  失敗時はどの行の何が不正かを含む日本語エラーメッセージを投げる)。求職者タブのN列(任意、「登録日」)は
  送客パートナー費用集計(4.1参照)の月内判定に使う
- **送客単価**(任意タブ)は上記6タブの `batchGet` には含めない。存在しないタブを `batchGet` の
  `ranges` に含めると呼び出し全体が失敗するため、別リクエストで取得し、タブが無い・読めない場合は
  `DEFAULT_REFERRAL_RATES`(組み込みの既定単価)にフォールバックする(エラーにしない。`Settings.referralRates`
  として `DataBundle` に含まれる)
- 環境変数: `GOOGLE_SERVICE_ACCOUNT_JSON`(鍵JSON文字列)/ `SHEET_ID`。

### 6.3 Slack(`SlackSource`)

- 追加npm依存なし。Slack Web API(`chat.postMessage` / `conversations.history` /
  `conversations.replies` / `chat.getPermalink` / `conversations.info` / `users.info`)を直接
  `fetch` で呼び出す。
- 「届ける」の送信は live 時は `chat.postMessage` で実際に投稿し、demo 時は従来通りログ出力のみ。
- ダッシュボードの Slack ハイライトは `SLACK_HIGHLIGHT_CHANNELS`(カンマ区切りチャンネルID)の
  `conversations.history` を取得し、`users.info` / `conversations.info` で投稿者名・チャンネル名を解決する。
- **求職者データベース(`getCandidateThreads()`)**: `SLACK_CANDIDATE_CHANNEL`(#求職者チャンネルの
  ID)の `conversations.history`(直近100件)を取得し、`CandidateThread[]` を組み立てる。
  - subtype付き(`channel_join` など)・ボット投稿の親メッセージは除外する。親テキストの1行目
    (trim、20文字まで)を `name` とする
  - `reply_count > 0` の親には `conversations.replies` で返信(最大50件/スレッド)を取得するが、
    API呼び出し数を抑えるため「直近アクティブな30スレッド」まで(`conversations.history` が
    新しい順で返す先頭30件)に限定し、超過分は返信取得・パーマリンク取得をスキップして
    親情報(氏名・登録日時・返信数)のみを返す(`getCandidateThreads()` 内にコメントで明記)
  - `users.info` で投稿者の表示名を解決する(インスタンス内メモリキャッシュを highlight 取得と共有)
  - 本文整形(`formatMessageText`): `<@U…>` メンションは可能なら表示名へ、`<url|label>` は label へ、
    `<url>` は url(素の文字列)へ変換する
  - `chat.getPermalink` で親メッセージへのパーマリンクを取得する(失敗しても処理は継続し、
    `permalink` は省略される)
  - 取得口は `src/lib/candidate-threads.ts` の `loadCandidateThreads()`。`data-bundle.ts` と同じ
    パターン(live失敗時は `console.warn` の上でデモスレッドへフォールバックし、`SourceStatus` に
    `live-error` を設定)だが、独立して5分のモジュールメモリキャッシュを持つ(6.1参照)
- 環境変数: `SLACK_BOT_TOKEN` / `SLACK_HIGHLIGHT_CHANNELS` / `SLACK_DEFAULT_CHANNEL` /
  `SLACK_CANDIDATE_CHANNEL`。

### 6.4 集客・広告データ(`MarketingSource`)

- 経営者が個別に運用している外部スプレッドシート2つ(社内シートとは別)を読み取る。取得口・型定義は
  `src/lib/adapters/marketing.ts`(`MarketingSource` IF + `DemoMarketingSource` + `GoogleSheetsMarketingSource`)、
  `src/lib/types.ts`(`AdDailyRecord` / `SnsWeeklyRecord` / `MarketingData`)。
  - **アイドマ(広告運用シート、`MARKETING_AD_SHEET_ID`)**: タブ「Google広告 」(末尾に半角スペース)・
    「Meta広告」の日次広告実績(日付/費用/表示回数/クリック数/LINE登録数/面談予約数/面談実施数)。
    ヘッダー行・列位置はタブごとにズレることがあるため、固定位置ではなく見出し文字列で検出する。
    CTR・CPC・CPA等のシート側計算列は読まず、`metrics.ts` 側で再計算する。
  - **リズリアライズ(SNS運用シート、`MARKETING_SNS_SHEET_ID`)**: タブ「週次トラッキング」の週次実績
    (期間/合計再生数/プロフィール遷移(TikTok・IG合算)/LP閲覧合計/LINE登録(実)/面談(実))。
    費用はシートに実績列が無いため `MARKETING_SNS_MONTHLY_COST` 環境変数(円、既定495,000円)の
    月額固定値を使う。
  - 認証(サービスアカウントJWT・アクセストークン取得)・Sheets Values API 呼び出しは
    `adapters/spreadsheet.ts` の実装を関数エクスポート(`getAccessToken` / `fetchSheetsValuesBatchGet` /
    `fetchSheetTabTitles`)して再利用しており、`GoogleSheetsSource` と同じ認証情報
    (`GOOGLE_SERVICE_ACCOUNT_FILE` / `GOOGLE_SERVICE_ACCOUNT_JSON`)を共用する。
  - タブ名が trim すると同名になるものが複数存在する場合(実運用シートに旧テンプレートタブが
    残っているケースがあるため)、実データ行数が多い方を自動的に採用する。
  - 対象タブが見つからない等のエラーでは、`MARKETING_AD_SHEET_ID` と `MARKETING_SNS_SHEET_ID` の
    値が入れ替わっていないか確認するよう促すメッセージを含める。
  - 取得口は `src/lib/marketing-data.ts` の `loadMarketingData()`。`candidate-threads.ts` と同じパターン
    (live失敗時は `console.warn` の上でデモデータへフォールバックし、`SourceStatus` に `live-error` を設定)で、
    独立して5分のモジュールメモリキャッシュを持つ。
  - 集計は `metrics.ts` の `getMarketingSummary(data, weeklyKpis, candidates, referralRates, now)`
    (純関数)。媒体別(Google広告/Meta広告)・SNS運用・送客パートナー(成果報酬、4.1参照)の当月サマリ、
    遷移率(`transitionRates`)、合計値(送客パートナー費用込み)をまとめて返す。
  - 環境変数: `MARKETING_AD_SHEET_ID` / `MARKETING_SNS_SHEET_ID` / `MARKETING_SNS_MONTHLY_COST`。

### 6.5 フォールバックとソースバッジ

- `DATA_MODE=live` で接続・パースに失敗した場合、`console.warn` した上で自動的にデモデータへ
  フォールバックする(アプリ自体はエラーにならない)。この判定(`DYNAMIC_SERVER_USAGE` エラーの
  再スロー含む)は `src/lib/next-dynamic-usage-error.ts` の `isNextDynamicUsageError()` に共通化され、
  `data-bundle.ts` ・ `candidate-threads.ts` ・ `marketing-data.ts` の3者から使われる。
- 送客単価タブ(6.2参照)は上記とは別系統の、より粒度の細かいフォールバックである。`SourceStatus` は
  変更せず(6タブ本体の取得結果に影響しない)、タブ自体が存在しない・パースできない等どんな理由でも
  `DEFAULT_REFERRAL_RATES` に静かにフォールバックする(`console.warn` もしない。運用上「未設定でも困らない」
  ことを優先する任意タブのため)。
- `DataBundle` は `sourceStatus`(Sheets)と `slackStatus`(Slack)をそれぞれ独立に持ち、
  `"live" | "demo" | "live-error"` の3値を取る。求職者データベース(`loadCandidateThreads()` の
  戻り値の `status`)・集客・広告データ(`loadMarketingData()` の戻り値の `status`)も同じ
  `SourceStatus` 型を再利用する、DataBundle とは独立した状態である。
  ソースバッジは `src/lib/source-status.ts` の `sourceBadgeLabel()` で以下のように出し分けられる。
  - `live` → 「Sheets(連携中)」/「Slack(連携中)」/「集客データ(連携中)」
  - `demo` → 「Sheets(デモ)」/「Slack(デモ)」/「集客データ(デモ)」
  - `live-error` → 「Sheets(接続エラー・デモ表示)」/「Slack(接続エラー・デモ表示)」/「集客データ(接続エラー・デモ表示)」
  - 求職者データベース(進捗データベースタブ・個別ページ)のバッジは `sourceBadgeLabel("slack", status)`
    をそのまま流用しているため、表示文言はダッシュボードの Slack バッジと共通(「Slack(連携中)」等)

## 7. ロードマップ(将来構想)

今回実装した求職者データベース(4.1.1/4.1.2、`CandidateThread`)は、氏名以外の突合キーを持たない
自由記述ベースのデータ構造として意図的にシンプルにとどめている。将来、以下の拡張を見据える。

- **企業情報 × 求職者のマッチング**: 法人営業(RA)側にも `#求職者` と同様の「1社1スレッド」等の
  データベース運用(または既存のシート求職者/成約タブと対になる企業タブ)を導入し、企業の募集要件・
  特徴を蓄積する。`CandidateThread` の進捗タイムライン(自由記述)から希望条件(職種・年収・勤務地・
  転職理由など)を抽出/要約するAI処理を `ai/*.ts` に追加し、企業側の募集要件と突き合わせて
  提案候補をレコメンドする機能を検討する。既存の設計方針(`metrics.ts` / `ai/*.ts` は `DataBundle`
  や配列を引数に取る純関数とし、demo-data.ts やアダプタを直接 import しない)を踏襲し、
  実データ・デモデータの双方に同一ロジックを適用できる形で実装する想定
- **求職者データベースの構造化・要約**: 現状は Slack投稿の自由記述をそのまま表示しているが、
  AIによる要約(基本情報の抽出、現在の進捗ステージの推定など)を個別ページ上部にキャッシュ表示する案。
  シート台帳(`Candidate.stage`)との自動突合(氏名一致等)によるステータス統合も検討課題
  (突合精度の担保が前提となるため、今回は意図的に未実装)
- **API呼び出し数の最適化**: `getCandidateThreads()` の「直近アクティブな30スレッド」制限は
  現状のSlack API呼び出し回数を抑えるための簡易対策。求職者数の増加に応じて、Slackの
  Events API(Webhook)によるプッシュ型更新や、スレッド単位の差分キャッシュへの移行を検討する
