# スプレッドシートとアプリを突き合わせる道具

naru さんのスプレッドシート（Naru Fit Daily）を直したときに、
「どこが変わったのか」「アプリに入っているのか」を機械的に出すためのもの。

## 中身

| ファイル | 何をするか |
|---|---|
| `xlsx.py` | xlsx の1シートを行ごとのタブ区切りで読む（openpyxl 無しで動く） |
| `snap.py` | 前回の控え（`docs/sheet/*.tsv`）と比べて、変わった行を出す |
| `dumpapp.js` | アプリの中のメニュー（PROGRAM）を JSON に書き出す |

## 使い方

```bash
# 1. Drive からシートを xlsx で落とす（Google Drive のコネクタ）

# 2. 前回から何が変わったかを見る
python3 -I tools/sheet/snap.py /path/to/book.xlsx

# 3. アプリに反映し終わったら、控えを新しくする
python3 -I tools/sheet/snap.py /path/to/book.xlsx --save

# 4. アプリ側の中身を確かめる（ローカルサーバを 8765 で立ててから）
python3 -m http.server 8765 --bind 127.0.0.1 &
node tools/sheet/dumpapp.js /tmp/app.json
```

## 控えの置き場所

`docs/sheet/FIT1.tsv` / `FIT2.tsv` / `30Days.tsv`。
**反映が終わるまで --save しないこと。** 控えを先に進めると、何が未反映なのか分からなくなる。

## タブとアプリの対応

| シートのタブ | アプリ |
|---|---|
| FIT1【Unit 1】Day 1〜14 | `PROGRAM.fit1`（画面では Fit 1） |
| FIT1【Unit2】Day 1〜14 | 未反映 |
| FIT2【Unit1】Day 1〜14 | `PROGRAM.fit3`（画面では Fit 2） |
| FIT2【Unit2】Day 1〜7 | 未反映 |
| FIT2【動画】 | 未反映 |
| 30Days | 未反映 |
| 戦略 / 帰国後task / 講演・ワークショップ | アプリと関係なし |

列の対応は `docs/sheet/対応表.pdf`（= 「シートとアプリの対応」）を参照。
