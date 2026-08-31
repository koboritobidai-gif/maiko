"""Entry point: fetch → filter by engagement → draft with Claude → review or post."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

from . import filtering, publish, sources
from .judge import select_and_draft

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "config.yaml"
DEFAULT_OUT = ROOT / "out"
STATE_FILE = ROOT / "state" / "seen.json"


def _force_utf8_console() -> None:
    """Print Cyrillic and Japanese safely on a legacy Windows console.

    Japanese Windows defaults stdout to cp932, which raises UnicodeEncodeError
    the moment we echo a Russian or Uzbek headline. Reconfiguring to UTF-8 with
    replacement keeps the run alive even on a console that cannot render a glyph.
    """
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass


def load_seen() -> set[str]:
    if not STATE_FILE.exists():
        return set()
    return set(json.loads(STATE_FILE.read_text(encoding="utf-8")))


def save_seen(seen: set[str], keep: int = 5000) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(
        json.dumps(sorted(seen)[-keep:], ensure_ascii=False, indent=0), encoding="utf-8"
    )


def main(argv: list[str] | None = None) -> int:
    _force_utf8_console()
    parser = argparse.ArgumentParser(description="ウズベキスタン現地ニュースの収集と下書き生成")
    parser.add_argument(
        "--mode",
        choices=["draft", "auto"],
        default="draft",
        help="draft: 下書きを書き出すだけ（既定）／auto: そのままXに投稿する",
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--min-confidence",
        type=int,
        default=80,
        help="--mode auto のとき、この確度未満の下書きは投稿しない",
    )
    parser.add_argument(
        "--include-unverified",
        action="store_true",
        help="config で verified: false のチャンネルも対象にする",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Claude を呼ばず、絞り込み結果だけ表示する（無料）",
    )
    args = parser.parse_args(argv)

    config = yaml.safe_load(args.config.read_text(encoding="utf-8"))

    channels = [
        s for s in config["sources"] if args.include_unverified or s.get("verified")
    ]
    if not channels:
        print("対象チャンネルがありません。config.yaml を確認してください。", file=sys.stderr)
        return 1

    eng = config["engagement"]
    print(f"[1/4] {len(channels)} チャンネルを取得中…")
    posts, errors = sources.fetch_all(channels, eng["lookback_hours"], eng["baseline_window"])
    for err in errors:
        print(f"  ! 取得失敗: {err}", file=sys.stderr)

    print(f"[2/4] {len(posts)} 件を絞り込み中…")
    seen = load_seen()
    shortlist, stats = filtering.apply(posts, config, seen)
    print(
        f"      既出 {stats['already_seen']} / "
        f"反応が平常時以下 {stats['below_engagement']} / "
        f"対象外ジャンル {stats['excluded']} / "
        f"関連度不足 {stats['below_relevance']} → 候補 {stats['shortlisted']} 件"
    )

    if args.dry_run:
        for p in shortlist:
            print(
                f"  - [{p.relevance:2d}pt / 中央値の{p.view_ratio:.1f}倍 / {p.views:,}views] "
                f"{p.source_name}: {p.text[:70].replace(chr(10), ' ')}…"
            )
        return 0

    if not shortlist:
        print("[3/4] 候補ゼロのため終了します。")
        return 0

    print(f"[3/4] Claude が {len(shortlist)} 件から最大 {config['selection']['max_picks']} 本を選定中…")
    selection = select_and_draft(shortlist, config["selection"]["max_picks"])

    posts_by_key = {p.key: p for p in shortlist}
    path = publish.write_review_file(selection, posts_by_key, stats, errors, args.out)
    print(f"[4/4] 下書きを書き出しました: {path}")
    print(f"      採用 {len(selection.picks)} 本 — {selection.note}")

    if args.mode == "auto":
        for draft, tweet_id, error in publish.publish(selection, args.min_confidence):
            if tweet_id:
                print(f"      投稿しました: https://x.com/i/status/{tweet_id}")
            else:
                print(f"      未投稿: {error}", file=sys.stderr)

    # Mark everything we looked at as seen, so tomorrow's run does not re-offer it.
    save_seen(seen | {p.key for p in shortlist})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
