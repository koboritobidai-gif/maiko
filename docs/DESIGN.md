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
- AI: `ANTHROPIC_API_KEY` があれば Claude API(claude-sonnet-5)を使用。無ければ**デモレスポンダ**(デモデータに対するクエリエンジン+ルールベース応答)で全機能が動作
- データ層はアダプタパターンで実連携に差し替え可能:
  - `SpreadsheetSource`: `DemoSpreadsheetSource`(実装) / `GoogleSheetsSource`(スタブ、認証情報が用意でき次第差し替え)
  - `MessengerSource`: `DemoSlackSource`(実装) / `SlackSource`(スタブ)
- デモデータは実行日(`new Date()`)基準で相対生成し、「本日」「月内」に常にデータが存在する状態を保つ

## 4. 画面構成(下部タブ5つ+ログイン)

### 4.0 ログイン(ロール選択)
- デモ用ロール切替: 「宮崎社長(経営ビュー)」「高梨CA(現場ビュー)」。ヘッダーに「◯◯としてログイン中」表示

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
  components/               # TabBar, Header, KpiCard, ProgressBar, StatusBadge, ChatBubble など
  lib/
    types.ts                # Candidate, Placement, Branch, Project, Member, SlackPost, Stage...
    demo-data.ts            # デモデータ生成(実行日基準)
    metrics.ts              # KPI集計ロジック(唯一の集計箇所)
    adapters/spreadsheet.ts # SpreadsheetSource IF + Demo実装 + GoogleSheetsスタブ
    adapters/messenger.ts   # MessengerSource IF + DemoSlack実装 + Slackスタブ
    ai/client.ts            # Claude API 呼び出し(キー無しならnull)
    ai/demo-responder.ts    # キー無し時のルールベース応答(ask/deliver/meeting/proposal)
  store/session.ts          # ロール選択(localStorage)
```

## 6. 実連携への移行手順(将来)

1. Google サービスアカウント発行 → シートID/範囲を `GoogleSheetsSource` に設定
2. Slack App 作成(bot token, `chat:write`, `channels:history`)→ `SlackSource` に設定
3. `.env` に `ANTHROPIC_API_KEY` / `SLACK_BOT_TOKEN` / `GOOGLE_SERVICE_ACCOUNT_JSON` / `SHEET_ID` を設定
4. アダプタの切替は環境変数 `DATA_MODE=live|demo` で行う
