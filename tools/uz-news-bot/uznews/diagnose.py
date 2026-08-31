"""Explain why posts are being dropped, one channel at a time.

When every post fails the engagement gate, the cause is almost always upstream:
the view counter is not being parsed, so every ratio is 0. This prints the raw
values we read off the page so that can be confirmed rather than guessed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import requests
from bs4 import BeautifulSoup

from .sources import PREVIEW_URL, USER_AGENT, _extract_reactions, _median_views, parse_count


def diagnose_channel(source: dict, lookback_hours: int, baseline_window: int, verbose: bool) -> None:
    name, channel = source["name"], source["channel"]
    try:
        resp = requests.get(
            PREVIEW_URL.format(channel=channel),
            headers={"User-Agent": USER_AGENT},
            timeout=20,
        )
        resp.raise_for_status()
    except Exception as exc:
        print(f"  {name:<28} 取得失敗: {exc}")
        return

    soup = BeautifulSoup(resp.text, "html.parser")
    nodes = soup.select(".tgme_widget_message")

    raw_views: list[str] = []
    parsed: list[int] = []
    for node in nodes:
        el = node.select_one(".tgme_widget_message_views")
        raw = el.get_text(strip=True) if el else ""
        raw_views.append(raw)
        parsed.append(parse_count(raw or None))

    found = sum(1 for r in raw_views if r)
    median = _median_views(parsed, baseline_window)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    recent = sum(
        1
        for node in nodes
        if (t := node.select_one(".tgme_widget_message_date time[datetime]"))
        and datetime.fromisoformat(t["datetime"]) >= cutoff
    )

    flag = "" if found else "   ← 閲覧数が1件も取れていない"
    print(
        f"  {name:<28} 投稿{len(nodes):>3}件 / {lookback_hours}h以内{recent:>3}件 / "
        f"閲覧数取得{found:>3}件 / 中央値 {median:>9,.0f}{flag}"
    )

    if verbose and nodes:
        print(f"      HTMLサイズ: {len(resp.text):,} バイト")
        print(f"      閲覧数の生の値（先頭8件）: {raw_views[:8]}")
        print(f"      数値化した結果（先頭8件）: {parsed[:8]}")
        reactions = [_extract_reactions(n) for n in nodes]
        print(f"      リアクション数（先頭8件）: {reactions[:8]}")
        for node in nodes[-5:]:
            el = node.select_one(".tgme_widget_message_views")
            v = parse_count(el.get_text(strip=True) if el else None)
            ratio = (v / median) if median else 0.0
            print(
                f"      最新側: {v:>9,} views → 中央値の {ratio:.2f} 倍"
                f" / リアクション {_extract_reactions(node)}"
            )


def run(sources: list[dict], lookback_hours: int, baseline_window: int) -> None:
    print("=== 診断: 各チャンネルから閲覧数を読めているか ===\n")
    for i, source in enumerate(sources):
        diagnose_channel(source, lookback_hours, baseline_window, verbose=(i == 0))
    print(
        "\n『閲覧数取得』が 0 件のチャンネルばかりなら、t.me 側のHTML構造が変わっています。\n"
        "出力をそのまま貼ってください。セレクタを直します。"
    )
