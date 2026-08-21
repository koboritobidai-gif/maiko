# maiko

写真の手書き文字を、手書き風フォントの別の文字に置き換えるツール。

`retouch_handwriting.py` は、明るい面に書かれたマーカーの筆跡を検出し、
周囲の色を拡散させて消したうえで、同じ傾き・同じ文字高・同じインク色で
新しい単語を書き込みます。

## 使い方

```bash
pip install pillow numpy scipy
python3 retouch_handwriting.py 入力.jpg 出力.jpg --text maiko --debug
```

`--debug` を付けると、検出した筆跡を赤で塗った `出力_debug.png` も出力されるので、
検出位置がずれていないか確認できます。

主なオプション:

| オプション | 説明 |
| --- | --- |
| `--text` | 書き込む文字（既定: `maiko`） |
| `--font` | 手書き風フォント（`assets/fonts/` に同梱） |
| `--roi x,y,w,h` | 元の文字を探す範囲を限定する |
| `--angle` / `--flip` | 傾きを手動指定する / 180 度反転する |
| `--anchor` | `start` / `center` / `end` — 元の文字のどこに合わせるか |
| `--scale` / `--nudge du,dv` | 文字の大きさ / 文字列方向・垂直方向の微調整 |
| `--opacity` / `--softness` | インクの濃さ / にじみ具合 |
| `--threshold` | 筆跡と判定する暗さの差（検出されないときは下げる） |

## 同梱フォント

`assets/fonts/` に Google Fonts の手書き系フォントを入れてあります。

- `IndieFlower-Regular.ttf` — 丸みのある細字（既定。カップの筆跡に一番近い）
- `Caveat-Variable.ttf` — 走り書き風（`--font-weight 500` で太さ調整可）
- `PermanentMarker-Regular.ttf` — 太いマーカー風
