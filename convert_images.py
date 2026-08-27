#!/usr/bin/env python3
"""画像を別のファイル形式に変換するコマンドラインツール。

使い方:
    # 1枚ずつ変換する
    python3 convert_images.py photo.png --to jpg

    # 複数ファイルをまとめて変換し、out/ に出力する
    python3 convert_images.py *.png --to webp --outdir out

    # 複数の画像を1つのPDFにまとめる
    python3 convert_images.py a.jpg b.png --to pdf --merge album.pdf
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

# 拡張子 -> Pillow のフォーマット名
FORMATS: dict[str, str] = {
    "jpg": "JPEG",
    "jpeg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "gif": "GIF",
    "bmp": "BMP",
    "tif": "TIFF",
    "tiff": "TIFF",
    "ico": "ICO",
    "pdf": "PDF",
}

# 透過を保持できない形式。RGBA で渡すと保存に失敗するため背景と合成する。
OPAQUE_ONLY = {"JPEG", "PDF", "BMP"}


def flatten(image: Image.Image, background: str) -> Image.Image:
    """透過チャンネルを背景色で塗りつぶして RGB 画像にする。"""
    if image.mode not in ("RGBA", "LA", "P"):
        return image.convert("RGB")
    rgba = image.convert("RGBA")
    canvas = Image.new("RGB", rgba.size, background)
    canvas.paste(rgba, mask=rgba.split()[-1])
    return canvas


def prepare(image: Image.Image, fmt: str, background: str) -> Image.Image:
    if fmt in OPAQUE_ONLY:
        return flatten(image, background)
    if fmt == "PNG" and image.mode == "P":
        return image.convert("RGBA")
    return image


def save_options(fmt: str, quality: int) -> dict:
    if fmt in ("JPEG", "WEBP"):
        return {"quality": quality}
    if fmt == "PNG":
        return {"optimize": True}
    return {}


def convert_one(src: Path, ext: str, outdir: Path | None, quality: int,
                background: str, overwrite: bool) -> Path:
    fmt = FORMATS[ext]
    dest_dir = outdir if outdir is not None else src.parent
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{src.stem}.{ext}"

    if dest.resolve() == src.resolve():
        raise ValueError(f"入力と出力が同じファイルです: {src}")
    if dest.exists() and not overwrite:
        raise FileExistsError(f"既に存在します（--overwrite で上書き）: {dest}")

    with Image.open(src) as image:
        image.load()
        prepare(image, fmt, background).save(dest, fmt, **save_options(fmt, quality))
    return dest


def merge_pdf(sources: list[Path], dest: Path, background: str,
              overwrite: bool) -> Path:
    if dest.exists() and not overwrite:
        raise FileExistsError(f"既に存在します（--overwrite で上書き）: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)

    pages: list[Image.Image] = []
    try:
        for src in sources:
            with Image.open(src) as image:
                image.load()
                pages.append(flatten(image, background))
        pages[0].save(dest, "PDF", save_all=True, append_images=pages[1:])
    finally:
        for page in pages:
            page.close()
    return dest


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="画像を別のファイル形式に変換します。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("inputs", nargs="+", type=Path, help="入力画像ファイル")
    parser.add_argument("--to", required=True, choices=sorted(FORMATS),
                        help="変換先の拡張子")
    parser.add_argument("--outdir", type=Path,
                        help="出力先ディレクトリ（既定: 入力と同じ場所）")
    parser.add_argument("--merge", type=Path, metavar="OUT.pdf",
                        help="すべての入力を1つのPDFにまとめる（--to pdf のとき）")
    parser.add_argument("--quality", type=int, default=90,
                        help="JPEG / WEBP の品質 1-100（既定: 90）")
    parser.add_argument("--background", default="white",
                        help="透過を塗りつぶす背景色（既定: white）")
    parser.add_argument("--overwrite", action="store_true",
                        help="既存の出力ファイルを上書きする")

    args = parser.parse_args(argv)
    args.to = args.to.lower()
    if not 1 <= args.quality <= 100:
        parser.error("--quality は 1 から 100 の間で指定してください")
    if args.merge is not None and args.to != "pdf":
        parser.error("--merge は --to pdf と一緒に使ってください")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    missing = [p for p in args.inputs if not p.is_file()]
    if missing:
        for path in missing:
            print(f"エラー: ファイルが見つかりません: {path}", file=sys.stderr)
        return 1

    if args.merge is not None:
        try:
            dest = merge_pdf(args.inputs, args.merge, args.background,
                             args.overwrite)
        except (OSError, ValueError) as exc:
            print(f"エラー: {exc}", file=sys.stderr)
            return 1
        print(f"{len(args.inputs)} 枚 -> {dest}")
        return 0

    failures = 0
    for src in args.inputs:
        try:
            dest = convert_one(src, args.to, args.outdir, args.quality,
                               args.background, args.overwrite)
        except (OSError, ValueError) as exc:
            print(f"エラー: {src}: {exc}", file=sys.stderr)
            failures += 1
            continue
        print(f"{src} -> {dest}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
