"""Output the drafts: a Markdown review file, and optionally a post to X."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from .judge import Draft, Selection
from .sources import Post


def write_review_file(
    selection: Selection,
    posts_by_key: dict[str, Post],
    stats: dict,
    errors: list[str],
    out_dir: Path,
) -> Path:
    """Write the day's drafts as a Markdown file a human can review and copy from."""
    out_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    path = out_dir / f"{today}.md"

    lines = [
        f"# ウズベキスタンNOW 下書き — {today}",
        "",
        f"収集 {stats['fetched']} 件 → エンゲージメント通過後 {stats['shortlisted']} 件 "
        f"→ 採用 {len(selection.picks)} 件",
        "",
        f"> {selection.note}",
        "",
    ]

    if not selection.picks:
        lines += ["## 本日は採用なし", "", "無理に出さないほうがよい日です。", ""]

    for i, draft in enumerate(selection.picks, 1):
        post = posts_by_key.get(draft.source_key)
        lines += [
            f"## {i}. 確度 {draft.confidence}／100",
            "",
            "```",
            draft.post_text,
            "```",
            "",
            f"- **選んだ理由**: {draft.pick_reason}",
        ]
        if post:
            lines += [
                f"- **出典**: {post.source_name} — {post.url}",
                f"- **閲覧数**: {post.views:,}（チャンネル中央値の {post.view_ratio:.1f} 倍）",
            ]
        if draft.needs_verification:
            lines += ["- **投稿前に要確認**:"]
            lines += [f"  - {item}" for item in draft.needs_verification]
        else:
            lines.append("- **投稿前に要確認**: なし")
        lines.append("")

    if errors:
        lines += ["---", "", "## 取得に失敗したチャンネル", ""]
        lines += [f"- {e}" for e in errors]
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def post_to_x(text: str) -> str:
    """Post one tweet and return its id. Requires the four X API credentials."""
    import tweepy

    required = (
        "X_API_KEY",
        "X_API_SECRET",
        "X_ACCESS_TOKEN",
        "X_ACCESS_TOKEN_SECRET",
    )
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError(f"X credentials missing: {', '.join(missing)}")

    client = tweepy.Client(
        consumer_key=os.environ["X_API_KEY"],
        consumer_secret=os.environ["X_API_SECRET"],
        access_token=os.environ["X_ACCESS_TOKEN"],
        access_token_secret=os.environ["X_ACCESS_TOKEN_SECRET"],
    )
    response = client.create_tweet(text=text)
    return response.data["id"]


def publish(selection: Selection, min_confidence: int) -> list[tuple[Draft, str | None, str | None]]:
    """Post every draft that clears `min_confidence`.

    Returns (draft, tweet_id, error) triples so the caller can report on each.
    """
    results = []
    for draft in selection.picks:
        if draft.confidence < min_confidence:
            results.append((draft, None, f"確度 {draft.confidence} < {min_confidence} のため送信せず"))
            continue
        try:
            results.append((draft, post_to_x(draft.post_text), None))
        except Exception as exc:
            results.append((draft, None, str(exc)))
    return results
