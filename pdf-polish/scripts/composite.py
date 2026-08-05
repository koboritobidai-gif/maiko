#!/usr/bin/env python3
"""Composite the redrawn map card onto the enhanced final pages.

A_8: repaint the brown header band flat, center the map card in it.
B_4: erase the old map area (blend-filled from surrounding paper),
     paste a larger centered map card.
"""
import cv2
import numpy as np
from PIL import Image

import enhance
# always rebuild the two target pages from the source scans first,
# so re-running this script never double-processes a composited page
enhance.enhance("orig/A_8.jpg", "enh/A_8.jpg")
enhance.enhance("orig/B_4.jpg", "enh/B_4.jpg")

card = Image.open("master_map.png")
CARD_AR = card.width / card.height

# ---------- A page 8 ----------
a = cv2.imread("enh/A_8.jpg")
h, w = a.shape[:2]
# brown band runs to ~y1805 and holds the white logo block from ~y1450 down.
# Repaint only the map zone (y < 1445) flat, feather into the untouched band.
brown = np.median(a[1300:1440:3, 100:w - 100:3].reshape(-1, 3), axis=0)
zone, feather = 1445, 60
a[0:zone] = brown
ramp = np.linspace(1, 0, feather)[:, None, None]
a[zone:zone + feather] = (brown[None, None, :] * ramp
                          + a[zone:zone + feather].astype(np.float64) * (1 - ramp)).astype(np.uint8)
mx = 90
cw = w - 2 * mx
ch = int(cw / CARD_AR)
cy = max(40, (zone - ch) // 2)
ca = np.array(card.resize((cw, ch), Image.LANCZOS))[:, :, ::-1]
a[cy:cy + ch, mx:mx + cw] = ca
cv2.imwrite("enh/A_8.jpg", a, [cv2.IMWRITE_JPEG_QUALITY, 92])
print("A_8: brown", brown.astype(int), "card", cw, ch, "at y", cy)

# ---------- B page 4 ----------
b = cv2.imread("enh/B_4.jpg")
h, w = b.shape[:2]
y0, y1 = 260, 1552          # old map vertical extent (generous)
x0, x1 = 80, 1820           # old map horizontal extent
# blend-fill: per row, interpolate from left-edge paper to right-side paper
for y in range(y0, y1):
    left = np.median(b[y, 20:70], axis=0)
    right = np.median(b[y, 1900:2150], axis=0)
    t = np.linspace(0, 1, x1 - x0)[:, None]
    b[y, x0:x1] = (left * (1 - t) + right * t).astype(np.uint8)
# light noise so the fill matches paper grain
noise = np.random.default_rng(7).normal(0, 1.6, (y1 - y0, x1 - x0, 3))
b[y0:y1, x0:x1] = np.clip(b[y0:y1, x0:x1].astype(np.float32) + noise, 0, 255).astype(np.uint8)

cw = 2100
ch = int(cw / CARD_AR)
mx = (w - cw) // 2
cy = 290
cb = np.array(card.resize((cw, ch), Image.LANCZOS))[:, :, ::-1]
b[cy:cy + ch, mx:mx + cw] = cb
cv2.imwrite("enh/B_4.jpg", b, [cv2.IMWRITE_JPEG_QUALITY, 92])
print("B_4: card", cw, ch, "at", mx, cy)
