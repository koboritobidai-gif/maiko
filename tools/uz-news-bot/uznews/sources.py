"""Fetch posts from public Telegram channels via the t.me web preview.

Telegram's Bot API can only read channels the bot administers, so it cannot be
used to follow third-party news channels. The public web preview at
``https://t.me/s/<channel>`` renders the same posts as HTML, including the view
counter we need for engagement filtering.
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import requests
from bs4 import BeautifulSoup

PREVIEW_URL = "https://t.me/s/{channel}"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)
_COUNT_RE = re.compile(r"^([\d.,]+)\s*([KMkm]?)$")


@dataclass
class Post:
    """A single Telegram post with the signals we filter on."""

    source_name: str
    channel: str
    category: str
    post_id: str
    url: str
    text: str
    published_at: datetime
    views: int
    reactions: int = 0

    # Filled in later by the filter stage.
    view_ratio: float = 0.0
    relevance: int = 0
    matched: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        return f"{self.channel}/{self.post_id}"


def parse_count(raw: str | None) -> int:
    """Turn Telegram's abbreviated counters ('1.2K', '3.4M') into an int."""
    if not raw:
        return 0
    m = _COUNT_RE.match(raw.strip())
    if not m:
        return 0
    value, suffix = m.groups()
    try:
        n = float(value.replace(",", ""))
    except ValueError:
        return 0
    multiplier = {"": 1, "k": 1_000, "m": 1_000_000}[suffix.lower()]
    return int(n * multiplier)


def _extract_reactions(node) -> int:
    """Sum the emoji reaction counters, when the preview renders them.

    The web preview does not always include reactions, so treat a miss as 0
    rather than an error — views remain the primary signal.
    """
    total = 0
    for counter in node.select(".tgme_widget_message_reactions .reactions_count"):
        total += parse_count(counter.get_text(strip=True))
    return total


def fetch_channel(
    source: dict,
    lookback_hours: int,
    baseline_window: int,
    timeout: int = 20,
) -> list[Post]:
    """Fetch recent posts from one channel and attach each post's view ratio.

    The ratio is computed against the median views of the posts on the same
    page, so a channel with 500k subscribers and one with 20k are judged on the
    same scale: "did this post outperform what this channel normally gets?"
    """
    channel = source["channel"]
    resp = requests.get(
        PREVIEW_URL.format(channel=channel),
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
    )
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    posts: list[Post] = []
    all_views: list[int] = []

    for node in soup.select(".tgme_widget_message"):
        data_post = node.get("data-post")
        if not data_post or "/" not in data_post:
            continue
        post_id = data_post.split("/", 1)[1]

        time_node = node.select_one(".tgme_widget_message_date time[datetime]")
        if not time_node:
            continue
        published_at = datetime.fromisoformat(time_node["datetime"])

        views = parse_count(
            node.select_one(".tgme_widget_message_views").get_text(strip=True)
            if node.select_one(".tgme_widget_message_views")
            else None
        )
        all_views.append(views)

        if published_at < cutoff:
            continue

        text_node = node.select_one(".tgme_widget_message_text")
        text = text_node.get_text("\n", strip=True) if text_node else ""
        if not text:
            continue

        posts.append(
            Post(
                source_name=source["name"],
                channel=channel,
                category=source.get("category", "news"),
                post_id=post_id,
                url=f"https://t.me/{data_post}",
                text=text,
                published_at=published_at,
                views=views,
                reactions=_extract_reactions(node),
            )
        )

    baseline = _median_views(all_views, baseline_window)
    for post in posts:
        post.view_ratio = (post.views / baseline) if baseline else 0.0
    return posts


def _median_views(all_views: list[int], window: int) -> float:
    """Median of the most recent `window` posts, ignoring zero-view entries.

    Very fresh posts have not accumulated views yet; including them would drag
    the baseline down and let mediocre posts clear the ratio threshold.
    """
    sample = [v for v in all_views[-window:] if v > 0]
    return statistics.median(sample) if sample else 0.0


def fetch_all(sources: list[dict], lookback_hours: int, baseline_window: int) -> tuple[list[Post], list[str]]:
    """Fetch every configured channel. Returns (posts, error messages)."""
    posts: list[Post] = []
    errors: list[str] = []
    for source in sources:
        try:
            posts.extend(fetch_channel(source, lookback_hours, baseline_window))
        except Exception as exc:  # one dead channel must not stop the run
            errors.append(f"{source['name']} (@{source['channel']}): {exc}")
    return posts, errors
