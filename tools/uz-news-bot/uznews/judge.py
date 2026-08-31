"""Ask Claude to pick the best posts and draft them as Japanese X posts.

One request per run: the whole shortlist goes in, the picks come back as
validated JSON. Structured output means the caller never has to parse prose.
"""

from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, Field

import anthropic

from .sources import Post

MODEL = "claude-opus-5"

# USD per 1M tokens for claude-opus-5. Update if Anthropic changes pricing.
PRICE_INPUT = 5.00
PRICE_OUTPUT = 25.00
PRICE_CACHE_READ = 0.50


@dataclass
class Cost:
    """What the one Claude request of this run actually cost."""

    input_tokens: int
    output_tokens: int
    cache_read_tokens: int = 0

    @property
    def usd(self) -> float:
        return (
            self.input_tokens / 1e6 * PRICE_INPUT
            + self.output_tokens / 1e6 * PRICE_OUTPUT
            + self.cache_read_tokens / 1e6 * PRICE_CACHE_READ
        )

    def summary(self, jpy_per_usd: float = 150.0) -> str:
        return (
            f"入力 {self.input_tokens:,} tok / 出力 {self.output_tokens:,} tok "
            f"→ ${self.usd:.4f}（約{self.usd * jpy_per_usd:.1f}円 / 1ドル{jpy_per_usd:.0f}円換算）"
        )

SYSTEM = """\
あなたは「ウズベキスタンNOW」という日本語メディアの編集者です。
ウズベキスタン現地のTelegramニュースから、日本人読者に出す価値のあるものを選び、
X（旧Twitter）の投稿文を書きます。

## 読者
ウズベキスタンに関心を持ち始めた日本人。将来的に不動産投資・視察を検討しうる層。
専門家ではありません。

## 選ぶ基準（この順に厳しく）
1. 日本人の「この国をどう見るか」の判断に効くか
2. 経済・都市開発・不動産・物価・制度に関わるか
3. 数字や固有名詞があり、検証できるか
選ばない: 事故・事件・スポーツ・芸能、日本人に関係のない国内政局、既出の焼き直し。

## 投稿文の形式（厳守）
🇺🇿 今日のウズベキスタンNEWS

【何が】(事実。誇張しない)
【なぜ重要】(現地の文脈)
【日本人にどう関係】(読者の立場に翻訳する)
【不動産への影響】(わからない場合は「現時点では影響を判断できない」と書く)

出典：(媒体名)

## 絶対のルール
- 断定しない。「〜と報じられています」「〜と発表されました」と書く。
- 原文にない数字を作らない。原文の数字はそのまま、単位も原文どおり。
- 通貨はスム表記のままにし、円換算は勝手にしない（レートを持っていないため）。
- 投稿文は全角140文字以内に収める。超える場合は【なぜ重要】を削る。
- 煽らない。「爆益」「今すぐ」「絶対」は使わない。
- 少しでも怪しい内容なら選ばない。1本も選ばないことは正しい判断です。
"""


class Draft(BaseModel):
    source_key: str = Field(description="候補リストで示された key をそのまま返す")
    post_text: str = Field(description="投稿する本文。全角140文字以内")
    pick_reason: str = Field(description="なぜこれを選んだかを一文で")
    confidence: int = Field(description="この内容を出してよいと思う確度 0-100")
    needs_verification: list[str] = Field(
        description="投稿前に人が裏を取るべき数字・固有名詞。無ければ空配列"
    )


class Selection(BaseModel):
    picks: list[Draft]
    note: str = Field(description="全体の判断メモ。1本も選ばなかった場合はその理由")


def _render_candidates(posts: list[Post]) -> str:
    blocks = []
    for p in posts:
        blocks.append(
            "\n".join(
                [
                    f"key: {p.key}",
                    f"媒体: {p.source_name}",
                    f"URL: {p.url}",
                    f"時刻: {p.published_at.isoformat()}",
                    f"閲覧数: {p.views:,}（このチャンネル中央値の{p.view_ratio:.1f}倍）",
                    f"関連キーワード: {', '.join(p.matched) or 'なし'}",
                    "本文:",
                    p.text[:1500],
                ]
            )
        )
    return "\n\n---\n\n".join(blocks)


def select_and_draft(
    posts: list[Post],
    max_picks: int,
    client: anthropic.Anthropic | None = None,
) -> tuple[Selection, Cost]:
    """Pick up to `max_picks` posts and return the drafts plus what they cost.

    This is the only place in the pipeline that spends money — fetching and
    filtering are local work.
    """
    if not posts:
        return Selection(picks=[], note="候補が0件でした。"), Cost(0, 0)

    client = client or anthropic.Anthropic()
    prompt = (
        f"以下はウズベキスタン現地Telegramの直近投稿のうち、"
        f"「そのチャンネルの平常時より明らかに読まれている」ものだけを機械的に絞った候補です。\n"
        f"この中から日本人読者に出す価値があるものを最大{max_picks}本選び、投稿文を書いてください。\n"
        f"価値のあるものが無ければ0本で構いません。\n\n"
        f"=== 候補 ===\n\n{_render_candidates(posts)}"
    )

    response = client.messages.parse(
        model=MODEL,
        max_tokens=8000,
        system=SYSTEM,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": prompt}],
        output_format=Selection,
    )
    usage = response.usage
    cost = Cost(
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
    )
    return response.parsed_output, cost
