# maiko

画像を別のファイル形式に変換するためのコマンドラインツールです。
JPG / PNG / WEBP / GIF / BMP / TIFF / ICO / PDF に対応しています。

## セットアップ

```bash
pip install -r requirements.txt
```

## 使い方

```bash
# 1枚を JPG に変換する（出力は入力と同じディレクトリ）
python3 convert_images.py photo.png --to jpg

# 複数ファイルをまとめて WEBP に変換し、out/ に出力する
python3 convert_images.py *.png --to webp --outdir out

# 複数の画像を1つの PDF にまとめる
python3 convert_images.py a.jpg b.png --to pdf --merge album.pdf
```

## オプション

| オプション | 説明 |
| --- | --- |
| `--to` | 変換先の拡張子（必須）。`jpg` `jpeg` `png` `webp` `gif` `bmp` `tif` `tiff` `ico` `pdf` |
| `--outdir` | 出力先ディレクトリ。既定は入力ファイルと同じ場所 |
| `--merge OUT.pdf` | すべての入力を1つの PDF にまとめる（`--to pdf` と併用） |
| `--quality` | JPEG / WEBP の品質 1〜100（既定: 90） |
| `--background` | 透過部分を塗りつぶす背景色（既定: `white`） |
| `--overwrite` | 既存の出力ファイルを上書きする |

JPG・PDF・BMP は透過を保持できないため、透過のある画像は `--background` の色で
合成してから保存します。既存ファイルは `--overwrite` を付けない限り上書きしません。
