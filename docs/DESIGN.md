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
  - **送客パートナー(成果報酬)小テーブル**: 媒体別テーブルの下に表示。成果報酬型(**面談実施で課金**。
    1人の面談実施ごとに費用が発生)の送客パートナー(既定6経路: KANOA/マホガニー/foresma/2peace(Tさん)/人事パートナーズ/與儀)
    の費用を経路/単価/面談(今月)/費用(今月)/面談(先月)/費用(先月)の列+合計行で表示する(先月分は
    `MarketingSummary.referralPartnersLastMonth` / `referralLastMonthTotalYen`。同じ課金ルールで基準日を
    先月15日にして算出。薄い文字色で表示)。対象人数は求職者台帳(`Candidate`)
    のうち流入経路(`inflowChannel`)が経路名と部分一致(trim・大文字小文字無視)し、面談を実施した人数
    (ステージが面談以降=面談/企業提案/面接/内定/承諾/入社、または辞退でも面談日 `interviewedAt` が
    ある人。面談前の辞退は対象外)。月の帰属は面談実施月=面談日(`interviewedAt`。無ければ
    登録日 `registeredAt` →更新日で近似)。面談日はシートO列の手入力を最優先とし、未入力の場合は
    Slack「#求職者」スレッドの返信から「面談実施」等の報告を自動検出して補完する
    (`src/lib/slack-interviews.ts`。検出ルール: 「面談実施/面談を実施/面談完了/面談済み/
    面談しました」を含む最初の返信。ただし同じ行に「予定/予約/リスケ/キャンセル/延期」が
    ある行は除外。日付はその行の「8/3」「8月3日」表記を優先、無ければ返信の投稿日。年は投稿日から
    推測し2日以上未来なら前年。氏名は空白除去の完全一致で照合。返信本文が取得されるのは直近
    アクティブ100スレッドまでのため、それより古いスレッドはシートO列で補う)。
    脚注に集計ルールを小さく表示する。単価マスタは
    `Settings.referralRates`(連携シートの任意タブ「送客単価」。無ければ組み込みの既定値。6.2参照)
  - 遷移率バッジ列: クリック→LINE登録率・LINE→予約率・予約→面談実行率・SNS再生→LP率
    (分母0で算出不可のものは非表示)
  - 集計は `metrics.ts` の `getMarketingSummary(data, weeklyKpis, candidates, referralRates, now)`
    (純関数。送客パートナー費用を `totalCost` に合算する)。
    データソースは `src/lib/marketing-data.ts` の `loadMarketingData()`(5分メモリキャッシュ、
    live失敗時はデモへフォールバック。詳細は6.5参照)+ `DataBundle` の `candidates` / `settings.referralRates`
  - **請求書チェック(#請求書)カード**: 送客パートナー小テーブルの直後に表示。経営者がSlack
    「#請求書」チャンネルで受け取る各パートナーの請求書PDFを自動で読み取り(`InvoiceSource`、
    6.6参照)、`getReferralPartnerSummary` によるアプリ側の自動計算値(今月・先月)と突き合わせる
    (`metrics.ts` の `getInvoiceChecks`、純関数)。行ごとに経路名/対象月(推定の場合「(推定)」)/
    請求額/アプリ計算額/判定バッジ(一致/差異〈±金額〉/金額読取不可/経路不明/対象月が範囲外)を表示し、
    Slackパーマリンクがあれば「Slackで開く」リンクを添える。`SLACK_INVOICE_CHANNEL` 未設定時は
    機能OFFとしてカード自体を非表示にする(デモモードではデモ請求書4件が入るため表示される)
- **送客売上(貰う金額)セクション**: 請求書チェックカードの直後に表示。#請求書(送客パートナーへ
  「払う」費用)とは逆方向の、経営者が別途運用する売上シート(`RevenueSource`、6.7参照)から取得した
  「翔び台が紹介先企業から**貰う**」金額を表示する。見出し横に独立した今月/先月トグル+
  SourceBadge(独自の`revenue`ステータス)。live-error 時は赤枠でエラー内容を表示する。
  - カード1(経路別): 経路/件数/金額の表+合計行。送客売上シートの経路は流入経路そのまま
    (KANOA/マホガニー/foresma/2peace(Tさん)/人事パートナーズ/與儀等の送客パートナー経路に加え、サンシャイン/
    インフルエンサー/求人媒体/紹介等それ以外の経路も混在する)
  - カード2(企業別明細): 企業/求職者/流入経路/金額の表(金額の大きい順、最大10行。超過分は
    「他N件」脚注)
  - カード3(送客パートナー収支): `getReferralProfit(revenueMonth, referralPartners)`(純関数、
    metrics.ts)の結果を表示。rows は単価マスタ(送客パートナー既定6経路)順に経路/売上/費用/利益(売上・費用とも0円の経路は非表示)
    (プラスは`--color-good`、マイナスは`--color-bad`)。下部に「売上合計 − 送客費用合計 = 利益」
    (全経路ベースの月合計)を表示する。売上側の経路名は単価マスタの経路名(括弧書きを除いた本体)
    との部分一致(trim・大文字小文字無視)で対応付け、単価マスタに無い経路(求人媒体・紹介等)の
    売上は rows には含まないが、売上合計には含む
  - 集計は `metrics.ts` の `getRevenueSummary(records, now)`(純関数、今月・先月を返す)。
    データソースは `src/lib/revenue-data.ts` の `loadRevenueRecords()`(5分メモリキャッシュ、
    live失敗時はデモへフォールバック。詳細は6.7参照)
  - `REVENUE_SHEET_ID` 未設定時は機能OFFとしてセクション自体を非表示にする(請求書チェックカードと
    同じパターン。デモモードではデモ売上〈今月4件・先月5件〉が入るため表示される)
- 求職者ファネル(月内): PV数 → LINE登録 → 面談予約 → 面談 → 面接(1次〜最終前+最終) → 内定 → 採用決定 を横棒ファネル表示。
  LINE登録率・面談実行率・面談移行率をバッジ表示
- 法人営業ファネル(月内): 名刺交換 → アポイント(主権/非主権/外部の内訳) → 商談(同内訳) → 契約(件数+金額)。
  PC(lg)では求職者ファネルと左右2カラムで並ぶ
- **CA別実績(#求職者)**: 求職者ファネル/法人営業ファネルの2カラムの直後に配置。CA(キャリアアドバイザー。
  求職者と面談したら最後まで同じ求職者をサポートする運用)ごと×月ごとの実績を、Slack「#求職者」
  スレッドの記載から自動集計して表示する(`src/lib/slack-ca-stats.ts` の `getCaMonthlyStatsFromThreads`、
  純関数。詳細は6.3参照)。見出し横に `MonthChips`(直近6ヶ月・今月が先頭、`primaryMonths` と同じ月範囲・
  ラベルを再利用)+ SourceBadge(Slack連携状態)。テーブル列は CA / 面談 / 面接(件数) / 面接移行率 /
  内定(率) / 離脱(率)(面接列は「3名(5件)」のように人数+延べ件数、内定・離脱列は「2名(40.0%)」形式、
  率が算出不可〈分母0〉の場合は「—」)。行はその月に面談実施があったCAのみ(0行の月は「この月の面談実施の
  記録がありません」)、下に全CA計の合計行(太字)。担当CAの判定は、スレッド内で最初に「面談実施」または
  「面接実施」を報告した返信の投稿者(表示名とCA名の部分一致で解決)を優先し、無ければ返信数最多のCA
  (同数は先に投稿した方)、どちらも無ければ「その他」に集約する。脚注に判定ルールを小さく表示する。
- **営業実績(#ra・アポイント報告)**: CA別実績の直後に配置。法人営業(清本・望月)ごと×月ごとの
  架電数・アポ獲得数・商談数・契約数を、Slack「#21_ra」「#22_アポイント報告」チャンネルの記載から
  自動集計して表示する(`src/lib/sales-stats.ts` の `getSalesMonthlyStats`、純関数。詳細は6.8参照)。
  見出し横に `MonthChips`(直近6ヶ月・今月が先頭、`primaryMonths` と同じ月範囲・ラベルを再利用)+
  SourceBadge(独自の`sales`ステータス)。live-error 時は赤枠でエラー内容を表示する。テーブル列は
  営業 / 架電数 / アポ獲得 / 商談数 / 契約数(アポ獲得セルには獲得経路の内訳を「テレアポ3・紹介2」の
  ように小さく併記)+太字の合計行。行はその月に実績があった営業のみ(0行の月は「この月の報告が
  ありません」)。`SLACK_RA_CHANNEL`・`SLACK_APPOINTMENT_CHANNEL` がどちらも未設定時は機能OFFとして
  セクション自体を非表示にする(請求書チェック等と同じパターン)。脚注に集計ルールを小さく表示する。
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
                                 # MarketingData, ReferralInvoice...
    demo-data.ts                # デモデータ生成(実行日基準。週次KPIは直近8週分、求職者スレッドは8名分、送客パートナー請求書は4件)
    metrics.ts                  # KPI集計ロジック(DataBundle/配列を引数に取る純関数。唯一の集計箇所。
                                 # 集客・広告データの集計(getMarketingSummary)・請求書照合(getInvoiceChecks)もここに含む)
    data-bundle.ts              # loadDataBundle(): アダプタから DataBundle を構築(60秒メモリキャッシュ、live失敗時はデモへフォールバック)
    candidate-threads.ts        # loadCandidateThreads(): #求職者チャンネルのスレッド一覧を取得(5分メモリキャッシュ、同上のフォールバック方針)
    marketing-data.ts           # loadMarketingData(): 集客・広告データ(外部シート2つ)を取得(5分メモリキャッシュ、同上のフォールバック方針)
    invoice-data.ts             # loadReferralInvoices(): #請求書チャンネルの請求書PDF読取結果を取得(5分メモリキャッシュ。
                                 # SLACK_INVOICE_CHANNEL未設定時は機能OFFとして空配列+status:"demo"を返す点が他と異なる)
    next-dynamic-usage-error.ts # isNextDynamicUsageError(): DYNAMIC_SERVER_USAGE の判定(data-bundle.ts / candidate-threads.ts / marketing-data.ts / invoice-data.ts で共用)
    source-status.ts            # SourceStatus → ソースバッジ文言のマッピング(クライアント安全。sheets/slack/marketing/invoicesの4種)
    adapters/spreadsheet.ts     # SpreadsheetSource IF + DemoSpreadsheetSource + GoogleSheetsSource(実装)
    adapters/messenger.ts       # MessengerSource IF(getRecentPosts/postMessage/getCandidateThreads) + DemoSlackSource + SlackSource(実装)
    adapters/marketing.ts       # MarketingSource IF(getMarketingData) + DemoMarketingSource + GoogleSheetsMarketingSource(実装。
                                 # adapters/spreadsheet.ts の認証・batchGet呼び出しを共用)
    adapters/invoices.ts        # InvoiceSource IF(getReferralInvoices) + DemoInvoiceSource + SlackInvoiceSource(実装。
                                 # PDFテキスト抽出に npm パッケージ unpdf を使用)
    ai/client.ts                # Claude API 呼び出し(キー無しならnull)
    ai/ask-responder.ts         # 「AIに聞く」スナップショット構築+ルールベース応答(DataBundle + CandidateThread[] + MarketingData + InvoiceCheckRow[] を引数に取る)
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
集客・広告データ・送客パートナー請求書・送客売上を除く全機能の唯一のデータ取得口になっている。求職者Slack
スレッドは `src/lib/candidate-threads.ts` の `loadCandidateThreads()`、集客・広告データは
`src/lib/marketing-data.ts` の `loadMarketingData()`、送客パートナー請求書は
`src/lib/invoice-data.ts` の `loadReferralInvoices()`、送客売上は `src/lib/revenue-data.ts` の
`loadRevenueRecords()` がそれぞれ独立した取得口・キャッシュを持つ
(4.1.1/4.1.2、6.3参照。集客・広告データは4.1/6.4参照。送客パートナー請求書は4.1/6.6参照。
送客売上は4.1/6.7参照)。

1. ダッシュボード(`src/app/page.tsx`)はサーバーコンポーネントとして `loadDataBundle()` ・
   `loadMarketingData()` ・`loadCandidateThreads()` ・`loadReferralInvoices()` ・`loadRevenueRecords()`
   を並行して呼び、`metrics.ts` で集計した結果をクライアントコンポーネント(`DashboardView`)へ
   props で渡す(`export const dynamic = "force-dynamic"` によりリクエストの
   たびにライブデータを再取得する。各 `load*()` 自体のメモリキャッシュにより実際のHTTP呼び出し頻度は
   抑えられる)。
2. 求職者一覧(`src/app/candidates/page.tsx`)・求職者個別ページ(`src/app/candidates/t/[threadTs]/page.tsx`)は
   `force-dynamic` のサーバーコンポーネントとして `loadDataBundle()` と `loadCandidateThreads()` を
   並行して呼び、それぞれ `CandidatesTabs` / `CandidateThreadDetailView` へ props で渡す。
3. API Routes(`api/ask` `api/deliver` `api/meeting` `api/proposal`)はリクエストのたびに
   `loadDataBundle()` を呼び、`ai/*.ts` の各生成関数へ渡す。`api/ask` はさらに `loadCandidateThreads()`・
   `loadMarketingData()`・`loadReferralInvoices()`・`loadRevenueRecords()` も呼び、求職者Slackスレッド・
   集客広告データ・送客パートナー請求書チェック・送客売上の情報をスナップショットに含める
   (4.2 / 6.3 / 6.4 / 6.6 / 6.7参照)。
4. `loadDataBundle()` 自体もモジュールメモリに60秒キャッシュ、`loadCandidateThreads()` /
   `loadMarketingData()` / `loadReferralInvoices()` / `loadRevenueRecords()` は5分キャッシュを持つため、
   同一プロセス内では Google Sheets / Slack / 集客・広告シート / #請求書チャンネル / 送客売上シートへの
   実際のHTTP呼び出しはそれぞれ60秒・5分・5分・5分・5分に1回程度に抑えられる。

### 6.2 Google Sheets(`GoogleSheetsSource`)

- 追加npm依存なし。`node:crypto` の `createSign("RSA-SHA256")` でサービスアカウント鍵から RS256 署名の
  JWT を組み立て、`https://oauth2.googleapis.com/token` でアクセストークンを取得する(50分メモリキャッシュ)。
- Sheets Values API の `batchGet` で「設定/メンバー/求職者/成約/プロジェクト/週次KPI」6タブを1回のHTTP
  呼び出しでまとめて取得し、`types.ts` の型へパースする(数値・日付・ステージ名などをバリデーションし、
  失敗時はどの行の何が不正かを含む日本語エラーメッセージを投げる)。求職者タブのN列(任意、「登録日」)・
  O列(任意、「面談日」)は送客パートナー費用集計(4.1参照)の課金対象判定・月帰属に使う
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
    API呼び出し数を抑えるため「直近アクティブな100スレッド」まで(変化のないスレッドの返信はメモリキャッシュを再利用、パーマリンクは先頭1件のAPI応答からドメインを得てURLを組み立て、取得は10件ずつ+429時は Retry-After 待ちで再試行。`conversations.history` が
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
- **CA別月次実績(`src/lib/slack-ca-stats.ts`)**: `getCandidateThreads()` が組み立てた
  `CandidateThread[]` だけを入力に、追加のSlack API呼び出しなしでCAごと×月ごとの実績(面談・面接・
  内定・離脱)を集計する純関数 `getCaMonthlyStatsFromThreads(threads, now?, months?)`(4.1参照)。
  - 対象CAは `CA_NAMES`(このモジュールが持つ固定リスト。経営者申告の実在CA名簿で、`Member[]`
    〈メンバータブ由来〉とは別管理。メンバータブが実際のCA体制を反映できていないための措置)
  - 面談実施月(集計の基準月)は `slack-interviews.ts` の `getSlackInterviewDatesByName()` を再利用し、
    面談日が検出できたスレッドのみを集計対象にする(面談実施月のコホートとして数え、その後の面接・
    内定・離脱はいつ起きても面談実施月に帰属させる)
  - 担当CAの判定は返信本文を1回スキャンして決める: ①スレッド内で最初に「面談実施」
    (`slack-interviews.ts` の `INTERVIEW_DONE_RE` 相当)または「面接実施」(1次/二次/最終等+実施/
    終了/完了/通過、または「面接済み」)を報告した返信の投稿者(表示名とCA名の部分一致・大文字小文字
    無視)、②該当が無ければ返信の投稿者名がCA名と一致する数が最多のCA(同数は先に投稿した方)、
    ③どちらも一致しなければ「その他」。「予定/日程/調整/予約/リスケ/キャンセル/延期」を含む行は
    未実施として①②の判定・イベント検出から除外する
  - イベント検出(返信本文の行単位、上記の未実施語を含む行は除外): 面接実施件数はマッチする返信の数
    (延べ件数)、内定は「内定」を含み同じ行に「辞退|取り消し|見送り」を含まない返信が1件以上、離脱は
    「辞退|クローズ|離脱|お見送り」を含む返信が1件以上でそれぞれフラグを立てる
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
  戻り値の `status`)・集客・広告データ(`loadMarketingData()` の戻り値の `status`)・送客パートナー
  請求書(`loadReferralInvoices()` の戻り値の `status`)・送客売上(`loadRevenueRecords()` の
  戻り値の `status`)・営業実績(`loadSalesReports()` の戻り値の `status`)も同じ `SourceStatus`
  型を再利用する、DataBundle とは独立した状態である。
  ソースバッジは `src/lib/source-status.ts` の `sourceBadgeLabel()` で以下のように出し分けられる。
  - `live` → 「Sheets(連携中)」/「Slack(連携中)」/「集客データ(連携中)」/「請求書チェック(連携中)」/
    「送客売上(連携中)」/「営業実績(連携中)」
  - `demo` → 「Sheets(デモ)」/「Slack(デモ)」/「集客データ(デモ)」/「請求書チェック(デモ)」/
    「送客売上(デモ)」/「営業実績(デモ)」
  - `live-error` → 「Sheets(接続エラー・デモ表示)」/「Slack(接続エラー・デモ表示)」/
    「集客データ(接続エラー・デモ表示)」/「請求書チェック(接続エラー・デモ表示)」/
    「送客売上(接続エラー・デモ表示)」/「営業実績(接続エラー・デモ表示)」
  - 求職者データベース(進捗データベースタブ・個別ページ)のバッジは `sourceBadgeLabel("slack", status)`
    をそのまま流用しているため、表示文言はダッシュボードの Slack バッジと共通(「Slack(連携中)」等)
  - ただし送客パートナー請求書・送客売上・営業実績は、他の3種と異なり `SLACK_INVOICE_CHANNEL` /
    `REVENUE_SHEET_ID` / (`SLACK_RA_CHANNEL` または `SLACK_APPOINTMENT_CHANNEL`)未設定時は
    `live-error` ではなく `demo`(かつ0件)を返す「機能OFF」の扱いになる(6.6・6.7・6.8参照)。

### 6.6 送客パートナー請求書(`InvoiceSource`)

- 経営者がSlack「#請求書」チャンネルで受け取る送客パートナー(4.1参照)の請求書PDFを読み取り、
  アプリの自動計算値と突き合わせる。取得口・型定義は `src/lib/adapters/invoices.ts`
  (`InvoiceSource` IF + `DemoInvoiceSource` + `SlackInvoiceSource`)、`src/lib/types.ts`
  (`ReferralInvoice`)。
- **取得**: `conversations.history`(直近100件、`SLACK_INVOICE_CHANNEL`)から、投稿日が直近75日
  以内でPDFファイル(`filetype === "pdf"` またはファイル名が `.pdf`)を含むメッセージを対象にする。
  **スレッドの返信に添付されたPDFも対象**: 返信のあるスレッド(直近20スレッドまで)を
  `conversations.replies` で取得して同様に走査する(#請求書は「1メッセージ+返信に請求書添付」の
  運用があるため。1スレッドの取得失敗は警告ログのみでスキップ)。
  ダウンロードするPDFは API・転送量抑制のため最大15件までとし、超過分は件数のみカードの脚注に
  表示する(`skippedCount`)。各PDFは `url_private_download`(無ければ `url_private`)へ Bot Token
  付きでダウンロードする(サイズ上限8MB、超過はパース失敗扱い)。追加の Bot Token Scope
  `files:read` が必要(docs/SETUP.md 3章参照)。
- **PDFテキスト抽出**: npm パッケージ `unpdf`(pdf.jsベースの純JS実装、Vercelサーバーレスでも動作)の
  `extractText` を使用する。スキャン画像PDF等でテキストが取れない場合はエラーにせず、
  `parseNote` にその旨を記録してパース失敗として扱う(1件の失敗でページ全体を落とさないため)。
- **読み取りヒューリスティック**(いずれも正規表現ベース。`adapters/invoices.ts` に実装):
  - パートナー名: PDFテキスト→ファイル名→Slackメッセージ本文の順に、単価マスタの経路名
    (`DEFAULT_REFERRAL_RATES`)との部分一致(trim・大文字小文字無視。「2peace(Tさん)」は
    括弧前の「2peace」でも一致)で探す。
  - 対象月: 「2026年7月」「2026/07」「2026-07」「7月分」等のパターンを探す(年が無い表記は
    投稿日の年で補完し、投稿日より未来の月になれば前年)。見つからなければ「投稿月の前月」を
    推定値とし `targetMonthIsEstimated: true` を立てる(請求書は翌月に届く運用のため)。
  - 請求金額: 「合計」「ご請求金額」「請求金額」「総額」の近く(同じ行または直後の行)にある
    金額を優先し、無ければテキスト中の最大金額を採用する。
- **照合**: `metrics.ts` の `getInvoiceChecks(invoices, referralPartnersThisMonth,
  referralPartnersLastMonth, now)`(純関数)が、対象月に応じて今月・先月いずれかの
  `ReferralPartnerSummary.costYen` と請求額を比較し、`match`/`mismatch`(差額付き)/
  `unreadable`(金額読取不可)/`unknown-partner`(経路不明)/`out-of-range`(対象月が今月・先月
  以外)のいずれかを判定する。
- 取得口は `src/lib/invoice-data.ts` の `loadReferralInvoices()`。他の3種(6.5参照)と異なり、
  `SLACK_INVOICE_CHANNEL` が未設定の間は live-error にせず「機能OFF」として請求書0件・
  `status: "demo"` を返す(ダッシュボード側はこれを見てカード自体を非表示にする)。
  `DATA_MODE=live` かつチャンネルID設定済みで取得に失敗した場合のみ、他と同様に
  console.warn の上でデモ請求書(4件)へフォールバックし `status: "live-error"` を設定する。
  5分のモジュールメモリキャッシュを持つ。
- 環境変数: `SLACK_INVOICE_CHANNEL`(`SLACK_BOT_TOKEN` は既存のものを共用)。

### 6.7 送客売上(`RevenueSource`)

- 経営者が別途運用する送客売上シート(`REVENUE_SHEET_ID`)を読み取る。翔び台が紹介先企業から
  「**貰う**」金額で、6.6の送客パートナー請求書(「**払う**」費用)とは逆方向のお金の流れ。
  取得口・型定義は `src/lib/adapters/revenue.ts`(`RevenueSource` IF + `DemoRevenueSource` +
  `GoogleSheetsRevenueSource`)、`src/lib/types.ts`(`RevenueRecord`)。認証・batchGet呼び出しは
  `adapters/spreadsheet.ts` の実装(`getAccessToken` / `fetchSheetsValuesBatchGet` /
  `fetchSheetTabTitles`)を再利用する(`adapters/marketing.ts` と同じ構成)。
- **タブ構成**: 入金月ごとにタブを分ける運用で、タブ名は「2026年6月」形式(=対象月。入金は翌月末)。
  `/^(\d{4})年(\d{1,2})月$/` に一致するタブのみを対象にし(「支払い」タブ等は対象外)、新しい月順に
  最大6タブまで読む。
- **見出し行の検出**: シートの1行目がタイトル(黄色セルの「7月末入金分」等)、2行目がスマートチップ
  埋め込みセルのため、見出し行を決め打ちにせず、先頭5行の中から「金額」を含み、かつ「会社名(会社/
  企業/送客先)」または「流入経路(経路)」を含む行を見出し行として探す。見つからない場合や、
  見出し行から「会社名」「流入経路」「金額」のいずれかの列を特定できない場合は、どのタブの見出しに
  何が並んでいたかを含む日本語エラーを投げる(live-errorとしてデモへフォールバックし、画面の赤枠で
  自己診断できるようにする)。
- **列**: 会社名(「会社名」「会社」「企業」「送客先」を含む列)・流入経路(「流入経路」「経路」を
  含む列)・金額(「金額」「報酬」「売上」を含む列)を見出し文字列の部分一致で判定する。「求職者」を
  含む列があれば `RevenueRecord.candidateName` として読み取る(無くてもエラーにしない)。
  「担当者/請求書/分割/残回」等その他の列は読み取らない。
- **データ行**: 見出し行より下で、会社名・金額の両方が入っている行のみ採用する(下端にプルダウンだけ
  残った空行が多数あるための対策)。「合計」「小計」を会社名・流入経路セルに含む行は手元集計行と
  みなしスキップする。金額セルは数値セルはそのまま、文字列セル(「¥385,000」形式)は
  「¥」「￥」「円」「,」「空白」を除去し、全角数字は半角に変換してから `Number()` する。変換できない・
  0以下の行はエラーにせずスキップする。
- **分割払い**: 24回払いのような分割案件は、各月タブに「その月に請求する分」の金額がそのまま記載
  される運用のため、アプリ側は特別な按分処理をせずタブごとに単純合計するだけで正しい月次売上になる。
- **集計**: `metrics.ts` の `getRevenueSummary(records, now)`(純関数)が今月・先月それぞれの
  合計・経路別内訳(`byChannel`)・企業別明細(`records`、金額の大きい順)をまとめる。経路は
  送客パートナー既定経路以外(サンシャイン/インフルエンサー/
  求人媒体/紹介等)も混在する。さらに `getReferralProfit(revenueMonth, referralPartners)`
  (純関数)が、送客パートナー経由の売上・費用・利益(`rows`、単価マスタ順。売上側の経路名は
  括弧書きを除いた本体との部分一致〈trim・大文字小文字無視〉で対応付け)と、月全体の
  売上合計・送客費用合計・利益合計をまとめる(単価マスタに無い経路の売上は `rows` には含めないが
  `totalRevenueYen` には含む)。
- 取得口は `src/lib/revenue-data.ts` の `loadRevenueRecords()`。6.6の送客パートナー請求書と同じ
  「機能OFF」パターンで、`REVENUE_SHEET_ID` が未設定の間は live-error にせず売上0件・
  `status: "demo"` を返す(ダッシュボード側はこれを見てセクション自体を非表示にする)。
  `DATA_MODE=live` かつシートID設定済みで取得に失敗した場合のみ、他と同様に console.warn の上で
  デモ売上(今月4件・先月5件)へフォールバックし `status: "live-error"` を設定する。5分の
  モジュールメモリキャッシュを持つ。
- 環境変数: `REVENUE_SHEET_ID`(認証情報は `GOOGLE_SERVICE_ACCOUNT_FILE` / `GOOGLE_SERVICE_ACCOUNT_JSON`
  を既存のものと共用)。

### 6.8 営業実績(`SalesSource`)

- 法人営業(清本・望月)の架電数・アポイント獲得数・商談数・契約数を、社内Slackの2チャンネルから
  自動集計する。取得口・型定義は `src/lib/adapters/sales-reports.ts`(`SalesSource` IF +
  `DemoSalesSource` + `SlackSalesSource`)、`src/lib/types.ts`(`SalesDailyReport` /
  `AppointmentReport`)。集計(純関数)は `src/lib/sales-stats.ts` の
  `getSalesMonthlyStats(reports, appointments, now?, months?)`(`SALES_NAMES = ["清本", "望月"]`
  固定リストで担当を判定。`slack-ca-stats.ts` と同じ設計方針)。
- **`#21_ra`(`SLACK_RA_CHANNEL`)**: 当初は「1人1日1投稿の自由記述日報」を想定していたが、
  実際の運用は次の2系統のワークフローに分かれている。
  - **架電数報告**: ワークフローbotが毎日12:00・15:00に親メッセージ「架電数報告(12時)」
    「架電数報告(15時)」(本文に「架電数、メール数の報告お願いします」を含む)を投稿し、
    メンバーがそのスレッドの**返信**で架電数を報告する。親はワークフローbot投稿のため、
    `conversations.history` の取得時に bot 投稿を理由に除外しない(system メッセージ
    〈subtype付き〉のみ除外)。各返信は bot投稿を除外し、`/(?:架電|荷電)\s*(?:数)?\s*[::]?\s*(\d+)/`
    を優先、無ければ返信中最初の数値(全角は半角化してから判定)を架電数とみなす。12時分・15時分
    (同一メンバー・同一日)は合算する。
  - **業務報告**: メンバー自身が親メッセージ「業務報告)8/17」(タイトルのみ、対象日付き)を投稿し、
    商談数・契約数は**返信**に書く。対象日は親タイトルの「8/17」「8月17日」形式(年は投稿日から
    推測し、2日以上未来なら前年)、無ければ投稿日。担当は親の投稿者、商談数・契約数は
    「親投稿者本人による返信」のみを対象に `商談\s*(?:数)?\s*[::]?\s*(\d+)` /
    `契約\s*(?:数)?\s*[::]?\s*(\d+)` で抽出する(架電数がここに書かれていても、架電数報告
    スレッドとの二重計上を避けるため使わない)。
  - **業務予定報告**: 親本文に「予定」を含むもの(その日の予定であり実績ではない)は完全に除外する。
  - 上記いずれにも該当しない親メッセージは、フォールバックとして親本文自体から架電/商談/契約の
    数値抽出を試みる(実際の投稿書式が今後変わる可能性への保険)。
  - 返信取得(架電数報告・業務報告いずれも)はAPI呼び出し数抑制のため、直近優先で最大120スレッド
    まで、6スレッドずつ並列取得する(429時は Retry-After 秒待って1回だけ再試行。invoices.ts と
    同じパターン)。
- **`#22_アポイント報告`(`SLACK_APPOINTMENT_CHANNEL`)**: メンバーが親メッセージ
  「アポイント報告)…」をアポイント1件獲得するごとに1投稿する運用。**トップレベルの1投稿=
  アポ獲得1件**として数える(スレッド返信は祝福コメント等の想定のため数えない)。投稿者=担当、
  対象日=投稿日。獲得経路は親本文に加え、そのスレッドの返信のうち**親と同じ投稿者のもの**も対象に、
  「経路:」「獲得経路:」を含む行→無ければ括弧書き(全角・半角、20文字以内)→どちらも無ければ「不明」
  の順で探す。返信取得は直近優先で最大60スレッドまで。
- 読み取りは寛容を旨とし、いずれの書式にも当てはまらない・数値が読み取れないメッセージ/返信は
  エラーにせず黙ってスキップする(1件も読み取れなかった月は、画面側で「この月の報告がありません」
  と表示することで自己診断できるようにする)。
- 投稿者名は `users.info` で表示名解決する(インスタンス内メモリキャッシュ、messenger.ts の
  `resolveUserName` と同じパターン)。`SALES_NAMES` との判定は部分一致・大文字小文字無視のため、
  「清本晋士(Kiyomoto Shinji)」のような肩書き・英語表記付きの表示名でも「清本」に解決できる。
- 取得口は `src/lib/sales-data.ts` の `loadSalesReports()`。`SLACK_RA_CHANNEL` /
  `SLACK_APPOINTMENT_CHANNEL` はそれぞれ独立に設定・取得できるため、取得も互いに独立して try する
  (`SalesSource` は `getDailyReports()` / `getAppointmentReports()` の2メソッドに分かれている)。
  どちらも未設定の間は他の「機能OFF」系(6.6・6.7参照)と同じく `live-error` にせず日報・アポとも
  0件・`status: "demo"` を返す。`DATA_MODE=live` かつ少なくとも一方が設定済みで、設定されていた方が
  すべて取得に失敗した場合のみ、console.warn の上でデモデータへ全面フォールバックし
  `status: "live-error"` を設定する。片方だけ取得に失敗した場合は、その片方だけ空にして続行する
  (`errorMessage` に内容を残す)。5分のモジュールメモリキャッシュを持つ。
- 環境変数: `SLACK_RA_CHANNEL` / `SLACK_APPOINTMENT_CHANNEL`(`SLACK_BOT_TOKEN` は既存のものを共用)。

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
- **API呼び出し数の最適化**: `getCandidateThreads()` の「直近アクティブな100スレッド」制限は
  現状のSlack API呼び出し回数を抑えるための簡易対策。求職者数の増加に応じて、Slackの
  Events API(Webhook)によるプッシュ型更新や、スレッド単位の差分キャッシュへの移行を検討する
