#!/usr/bin/env python3
"""Wrap the newsletter artifact HTML into print-ready documents (proof + distribution draft)."""
import io
import os
import re
import sys

SRC = "tashkent-letter-2608.html"
body = io.open(SRC, encoding="utf-8").read()

PRINT_CSS = """
/* ---------- print adaptation ---------- */
@page { size: A4; margin: 13mm 12mm 14mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-size: 9.3pt; line-height: 1.68; background: var(--paper); }
.wrap { max-width: none; padding: 0 0 4mm; }

.masthead { padding: 0 0 5mm; }
h1 { font-size: 30pt; margin-bottom: 3px; }
.issue { font-size: 11pt; margin-bottom: 10px; }
.standfirst { font-size: 9.6pt; max-width: none; }
.masthead-meta { margin-top: 12px; font-size: 8pt; gap: 4px 18px; }
.kicker { font-size: 8.5pt; margin-bottom: 9px; }

.topthree { margin-top: 5mm; padding: 4mm 5mm 3mm; break-inside: avoid; }
.topthree h2 { font-size: 12pt; margin-bottom: 7px; }
.topthree li { font-size: 9.4pt; line-height: 1.65; margin-bottom: 5px; }

.strip { margin-top: 4mm; break-inside: avoid; }
.stat { padding: 8px 10px 9px; }
.stat .l { font-size: 7pt; margin-bottom: 3px; }
.stat .v { font-size: 14pt; }
.stat .d { font-size: 8pt; margin-top: 1px; }

.sec { padding-top: 6mm; }
.sec-head { padding-bottom: 6px; margin-bottom: 4mm; break-after: avoid; page-break-after: avoid; }
h2.sec-t { font-size: 14pt; }
.sec-num { font-size: 8.5pt; }

.arts { gap: 4mm; }
.two { gap: 4mm; }
.art, .guide { box-shadow: none; padding: 4mm 5mm; }
.topthree, .strip, .fear { box-shadow: none; }
.art-tag { font-size: 7.5pt; margin-bottom: 3px; }
.art h3 { font-size: 12pt; margin-bottom: 7px; line-height: 1.45;
          break-after: avoid; page-break-after: avoid; }
.art p { font-size: 9.3pt; margin-bottom: 7px; }
.art ul { margin-bottom: 7px; }
.art li { font-size: 9.1pt; line-height: 1.62; margin-bottom: 2px; }

/* keep small units intact, let long cards flow across pages */
.means, .slot, .warn, table.d tr, .stat { break-inside: avoid; page-break-inside: avoid; }
.means { font-size: 8.9pt; padding: 8px 11px; margin-top: 8px; }
.means b { font-size: 7.5pt; margin-bottom: 2px; }
.src { font-size: 7pt; margin-top: 7px; line-height: 1.5; }

table.d { font-size: 8.4pt; }
table.d th { font-size: 7.2pt; padding: 4px 7px; }
table.d td { padding: 4px 7px; line-height: 1.5; }
.scroller { overflow-x: visible; }

.guide h3 { font-size: 12pt; margin-bottom: 7px; }
.guide p { font-size: 9.2pt; margin-bottom: 8px; }
.warn { font-size: 8.9pt; padding: 8px 11px; }

footer { margin-top: 7mm; padding-top: 10px; font-size: 8pt; }
footer p { margin-bottom: 5px; }
footer h4 { font-size: 7.5pt; margin: 10px 0 5px; }
footer li { font-size: 7pt; line-height: 1.5; margin-bottom: 1px; word-break: break-all; }

figure.shot { margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
figure.shot img { max-height: 68mm; object-fit: cover; }
figure.shot figcaption { font-size: 8pt; margin-top: 4px; }
figure.shot figcaption .credit { font-size: 7pt; }

@media print { a { text-decoration: none; } }
"""

# Photo slot styling for the distribution draft: a real reserved frame, no internal notes.
DIST_CSS = """
/* ---------- distribution draft: reserved photo frames ---------- */
.slot { min-height: 34mm; display: flex; flex-direction: column; justify-content: flex-end;
        padding: 10px 12px; }
.slot .sh { display: none; }
.slot .where { display: none; }
.slot p { color: var(--muted); font-size: 8.4pt; }
.slot p::before { content: "▢ 写真："; color: var(--accent); font-weight: 600; }
"""


ASSET_DIR = "assets"
ASSET_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def find_asset(photo_id):
    """Return the path of assets/<id>.<ext> if a photo has been dropped in for this slot."""
    for ext in ASSET_EXTS:
        for name in (photo_id, photo_id.lstrip("0")):
            path = os.path.join(ASSET_DIR, name + ext)
            if os.path.isfile(path):
                return os.path.abspath(path)
    return None


SLOT_RE = re.compile(
    r'<div class="slot" data-photo="(?P<id>[^"]+)">(?P<inner>.*?)</div>', re.S
)
CAPTION_RE = re.compile(r'<p class="sh">.*?</p>\s*<p>(?P<cap>.*?)</p>', re.S)
CREDIT_RE = re.compile(r'<span class="where">(?P<credit>.*?)</span>', re.S)


def place_photos(html, with_credit):
    """Swap each placeholder for the real photo when one exists in assets/."""
    def repl(m):
        path = find_asset(m.group("id"))
        if not path:
            return m.group(0)
        inner = m.group("inner")
        cap = CAPTION_RE.search(inner)
        cap = cap.group("cap").strip() if cap else ""
        credit = ""
        if with_credit:
            c = CREDIT_RE.search(inner)
            if c:
                credit = '<span class="credit">%s</span>' % c.group("credit").strip()
        return (
            '<figure class="shot"><img src="file://%s" alt="%s">'
            '<figcaption>%s%s</figcaption></figure>' % (path, cap, cap, credit)
        )

    return SLOT_RE.sub(repl, html)


def split_head_body(src):
    """Return (head_part, body_part): everything up to the closing </style> is head-ish."""
    idx = src.rindex("</style>") + len("</style>")
    return src[:idx], src[idx:]


head_part, body_part = split_head_body(body)
# drop the original <title> tag from the head fragment; we set our own
head_part = re.sub(r"<title>.*?</title>\s*", "", head_part, count=1, flags=re.S)


def build(out_path, extra_css, title, strip_internal):
    b = body_part
    if strip_internal:
        # remove section 06 (社内用メモ) entirely
        start = b.find('<!-- ============ 07 写真の手当て（社内用） ============ -->')
        end = b.find("<footer>")
        if start == -1 or end == -1:
            sys.exit("could not locate internal section markers")
        b = b[:start] + b[end:]
    b = place_photos(b, with_credit=not strip_internal)
    html = (
        "<!doctype html>\n"
        '<html lang="ja" data-theme="light">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        f"<title>{title}</title>\n"
        + head_part
        + f"\n<style>{PRINT_CSS}{extra_css}</style>\n"
        "</head>\n<body>\n"
        + b
        + "\n</body>\n</html>\n"
    )
    io.open(out_path, "w", encoding="utf-8").write(html)
    print("wrote", out_path, len(html), "bytes")


build("print_proof.html", "", "タシュケント便り 2026年8月号（校正版）", False)
build("print_dist.html", DIST_CSS, "タシュケント便り 2026年8月号", True)
