# maiko — uysot ダッシュボード

uysot（`app.uysot.uz`）の業務データを取得して、マーケ・営業・月次の
ダッシュボードを作るためのリポジトリ。

## 現状（2026-08）

- ✅ **データ API に到達可能**：`https://mcpclient.app.uysot.uz/v1/...`
  （Cloudflare 経由。フロント `app.uysot.uz` の Vercel ボットチャレンジの外側にあるため
  ブラウザ不要で `curl` から直接叩ける）
- ✅ **認証**：`Authorization: Bearer <JWT>`
- ✅ **取得スクリプト動作確認済み**：`scripts/fetch.sh`（`conversation` で 200 / JSON 取得）
- ⏳ **未確定**：各 KPI に対応するエンドポイント（HAR/cURL キャプチャ待ち）
- ⏳ **未確定**：ログイン（トークン自動更新）エンドポイント（別ホストの認証サーバー）

### レスポンス形式（共通エンベロープ）

```json
{
  "data": { "currentPage": 1, "data": [ ... ], "totalElements": 0, "totalPages": 0 },
  "message": { "en": "Successfully!", "ja/ru/uz...": "..." },
  "errorMessage": null, "accept": true, "errors": []
}
```

一覧系は `data.data` が配列 + ページネーション（`currentPage`/`totalElements`/`totalPages`）。

## 使い方

```bash
cp .env.example .env      # UYSOT_BEARER_TOKEN を記入
bash scripts/fetch.sh     # config/endpoints.json の全件を data/*.json に保存
```

- 取得先は `config/endpoints.json` で管理。KPI エンドポイントが判明したら
  `status: "todo"` の行に `path`（または絶対 `url`）を入れて `status: "confirmed"` に変更。
- `data/*.json` と `.env` は `.gitignore` 済み（業務データ・秘密情報をコミットしない）。

## 欲しい指標（対応表・記入中）

| 区分 | 指標 | エンドポイント |
|---|---|---|
| マーケ | 使った金額 | 未定 |
| マーケ | リスト数 | 未定 |
| 営業 | 来店数 | 未定 |
| 営業 | 流入経路 | 未定 |
| 営業 | 案件ごとの状況 | 未定 |
| 営業 | 契約数 | 未定 |
| 月次 | 来客数・流入経路・契約数 | 未定 |
| 月次 | 売上 / 累計 / 翌月以降見込み | 未定 |

## トークン更新（自動化の要）

JWT は短命（数時間〜数日）。完全自動更新には**ログインエンドポイント**が必要。
DevTools でログアウト→ログインを記録し、`login`/`sign-in` 系リクエストを
「cURL (bash) としてコピー」して共有すれば、認証サーバーの URL と
リクエスト形式を特定できる。判明後 `scripts/login.sh`（未実装）で
ユーザー名/パスワードから毎回トークンを取得する。

## 今後の予定

1. HAR/cURL から KPI エンドポイントを特定 → `config/endpoints.json` に登録
2. ログインエンドポイント特定 → トークン自動更新を実装
3. `data/*.json` から自己完結型ダッシュボード（HTML/Artifact）を生成
4. 定期実行（Routine / cron）で自動更新
