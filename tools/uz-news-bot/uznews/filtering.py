"""Narrow the day's posts down to a shortlist worth spending an API call on.

Two gates, in order:

1. Engagement — did the post outperform its own channel's median views?
   This is the signal that locals actually cared, and it is scale-free, so a
   500k-subscriber outlet and a 20k-subscriber one compete fairly.
2. Relevance — does the text touch real estate, the economy, or the city, in
   a way that could matter to a Japanese reader?

Both gates are cheap keyword/arithmetic work. Only the survivors are sent to
Claude, which keeps the daily cost to roughly one request.
"""

from __future__ import annotations

from .sources import Post

WEIGHTS = {"high": 3, "medium": 2, "low": 1}

# Latin Uzbek writes o' / g' with any of several apostrophe-like characters
# (ASCII ', U+02BB, U+02BC, U+2018, U+2019). Fold them to one form so a keyword
# written with one variant still matches text written with another.
_APOSTROPHES = str.maketrans({c: "'" for c in "ʻʼ‘’´`"})


def normalize(text: str) -> str:
    return text.translate(_APOSTROPHES).lower()


def score_relevance(text: str, keywords: dict[str, list[str]]) -> tuple[int, list[str]]:
    """Sum keyword weights. Each keyword counts once, however often it appears."""
    haystack = normalize(text)
    score = 0
    matched: list[str] = []
    for tier, weight in WEIGHTS.items():
        for kw in keywords.get(tier, []):
            if normalize(kw) in haystack:
                score += weight
                matched.append(kw)
    return score, matched


def is_excluded(text: str, exclude: list[str]) -> bool:
    haystack = normalize(text)
    return any(normalize(kw) in haystack for kw in exclude)


def apply(posts: list[Post], config: dict, seen: set[str]) -> tuple[list[Post], dict]:
    """Return (shortlist, stats). Shortlist is sorted best-first."""
    eng = config["engagement"]
    rel = config["relevance"]

    stats = {
        "fetched": len(posts),
        "already_seen": 0,
        "below_engagement": 0,
        "excluded": 0,
        "below_relevance": 0,
    }

    kept: list[Post] = []
    for post in posts:
        if post.key in seen:
            stats["already_seen"] += 1
            continue

        if post.view_ratio < eng["min_view_ratio"] or post.views < eng["min_views_absolute"]:
            stats["below_engagement"] += 1
            continue

        if is_excluded(post.text, rel.get("exclude", [])):
            stats["excluded"] += 1
            continue

        post.relevance, post.matched = score_relevance(post.text, rel["keywords"])
        if post.relevance < rel["min_score"]:
            stats["below_relevance"] += 1
            continue

        kept.append(post)

    # Rank by relevance first, then by how hard the post outperformed its channel.
    kept.sort(key=lambda p: (p.relevance, p.view_ratio), reverse=True)
    stats["shortlisted"] = len(kept)
    return kept[: config["selection"]["max_candidates"]], stats
