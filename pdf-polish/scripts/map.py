#!/usr/bin/env python3
"""Redraw the Gofuku access map as a clean, high-contrast card.

Renders at 2x supersampling and downsamples for smooth edges.
Output: master_map.png (RGB, W x H below).
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 2452, 1420
SS = 2  # supersample factor
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"

# palette
BG = (255, 255, 253)
BORDER = (176, 148, 100)
ROAD_F = (238, 223, 180)
ROAD_E = (201, 181, 131)
RIVER_F = (150, 205, 235)
RIVER_E = (100, 170, 210)
TRAM = (40, 140, 70)
JR_BASE = (30, 30, 30)
SKS_BASE = (70, 100, 160)
RED = (200, 20, 27)
ORANGE = (232, 140, 74)
INK = (40, 35, 30)
TORII = (208, 64, 42)

def P(pts):
    return [(x * W * SS, y * H * SS) for x, y in pts]

def font(sz):
    return ImageFont.truetype(FONT, int(sz * SS))

img = Image.new("RGB", (W * SS, H * SS), BG)
d = ImageDraw.Draw(img)

def line(pts, fill, width, joint="curve"):
    d.line(P(pts), fill=fill, width=int(width * SS), joint=joint)

def dashes(pts, seg, fill, width):
    """White dashes along a polyline (rail style)."""
    import math
    pp = P(pts)
    # walk the polyline
    total = []
    for i in range(len(pp) - 1):
        x1, y1 = pp[i]; x2, y2 = pp[i + 1]
        L = math.hypot(x2 - x1, y2 - y1)
        n = max(1, int(L / (seg * SS)))
        for k in range(n):
            t0, t1 = k / n, (k + 1) / n
            total.append(((x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0),
                          (x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1)))
    for i, (a, b) in enumerate(total):
        if i % 2 == 0:
            d.line([a, b], fill=fill, width=int(width * SS))

def text(xy, s, sz, fill=INK, halo=(255, 255, 255), hw=4, anchor="la", bold=0):
    d.text((xy[0] * W * SS, xy[1] * H * SS), s, font=font(sz), fill=fill,
           stroke_width=int(hw * SS), stroke_fill=halo, anchor=anchor)

def vtext(xy, s, sz, fill=INK, hw=4):
    x, y = xy[0] * W * SS, xy[1] * H * SS
    f = font(sz)
    for i, ch in enumerate(s):
        d.text((x, y + i * sz * 1.12 * SS), ch, font=f, fill=fill,
               stroke_width=hw * SS, stroke_fill=(255, 255, 255), anchor="ma")

def rtext(xy, s, sz, angle, fill=INK, hw=4):
    f = font(sz)
    tmp = Image.new("RGBA", (int(sz * SS * (len(s) + 2)), int(sz * SS * 2)), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    td.text((tmp.width // 2, tmp.height // 2), s, font=f, fill=fill,
            stroke_width=hw * SS, stroke_fill=(255, 255, 255), anchor="mm")
    tmp = tmp.rotate(angle, expand=True, resample=Image.BICUBIC)
    img.paste(tmp, (int(xy[0] * W * SS - tmp.width / 2), int(xy[1] * H * SS - tmp.height / 2)), tmp)

# ---------------- roads ----------------
grid_v = [
    [(0.456, -0.02), (0.452, 0.10), (0.442, 0.30), (0.428, 0.42)],
    [(0.522, -0.02), (0.518, 0.10), (0.512, 0.24), (0.500, 0.38), (0.486, 0.47)],
    [(0.590, -0.02), (0.588, 0.06), (0.582, 0.22), (0.572, 0.36), (0.560, 0.46)],
    [(0.657, -0.02), (0.655, 0.06), (0.648, 0.20), (0.636, 0.34)],
]
grid_h = [
    [(0.428, 0.135), (0.60, 0.135), (0.72, 0.14)],
    [(0.422, 0.25), (0.62, 0.25), (0.70, 0.26)],
    [(0.432, 0.365), (0.60, 0.365), (0.648, 0.37)],
]
diag_ne = [(0.72, 0.14), (0.83, 0.24), (1.02, 0.42)]          # upper right road
sangyo = [(1.02, 0.28), (0.86, 0.42), (0.72, 0.53), (0.58, 0.645), (0.46, 0.76), (0.36, 0.88), (0.30, 0.97)]
west_rd = [(-0.02, 0.87), (0.08, 0.80), (0.20, 0.715), (0.30, 0.645), (0.385, 0.585), (0.468, 0.535)]
south_rd = [(0.33, 0.955), (0.45, 0.91), (0.58, 0.875), (0.75, 0.845), (1.02, 0.815)]
tram_rd = [(0.522, -0.02), (0.518, 0.10), (0.512, 0.24), (0.500, 0.38), (0.486, 0.47), (0.468, 0.535),
           (0.435, 0.615), (0.398, 0.70), (0.368, 0.79), (0.352, 0.878)]

allroads = grid_v + grid_h + [diag_ne, west_rd, south_rd, tram_rd]
for r in allroads:
    line(r, ROAD_E, 26)
line(sangyo, ROAD_E, 44)
for r in allroads:
    line(r, ROAD_F, 20)
line(sangyo, ROAD_F, 36)

# ---------------- rivers ----------------
tsuboi = [(0.374, -0.02), (0.386, 0.13), (0.400, 0.25), (0.420, 0.345), (0.437, 0.44),
          (0.442, 0.52), (0.436, 0.60), (0.424, 0.72), (0.415, 0.85), (0.412, 0.99)]
shira = [(0.805, -0.02), (0.745, 0.13), (0.685, 0.25), (0.630, 0.37), (0.596, 0.47),
         (0.572, 0.57), (0.548, 0.69), (0.526, 0.83), (0.514, 0.99)]
line(tsuboi, RIVER_E, 34)
line(tsuboi, RIVER_F, 26)
line(shira, RIVER_E, 66)
line(shira, RIVER_F, 56)

# ---------------- railways ----------------
sks = [(0.352, -0.02), (0.336, 0.22), (0.320, 0.42), (0.304, 0.62), (0.294, 0.78)]
kgs = [(0.368, -0.02), (0.352, 0.22), (0.336, 0.42), (0.320, 0.62), (0.308, 0.78)]
line(sks, SKS_BASE, 13)
dashes(sks, 26, (255, 255, 255), 8)
line(kgs, JR_BASE, 13)
dashes(kgs, 26, (255, 255, 255), 8)

# ---------------- tram ----------------
line(tram_rd, TRAM, 9)

# ---------------- JR station ----------------
st = Image.new("RGBA", (int(0.055 * W * SS), int(0.185 * H * SS)), (0, 0, 0, 0))
sd = ImageDraw.Draw(st)
sd.rounded_rectangle([0, 0, st.width - 1, st.height - 1], radius=8 * SS, fill=(70, 66, 78))
f = font(30)
for i, ch in enumerate("JR熊本駅"):
    sd.text((st.width // 2, int((i + 0.75) * 32 * SS * 1.28)), ch, font=f,
            fill=(255, 255, 255), anchor="mm")
st = st.rotate(-5, expand=True, resample=Image.BICUBIC)
img.paste(st, (int(0.276 * W * SS), int(0.785 * H * SS)), st)

# ---------------- tram stops ----------------
def stop(x, y, angle, label, lx, ly, anchor="la", sz=30):
    s = Image.new("RGBA", (26 * SS, 56 * SS), (0, 0, 0, 0))
    sd2 = ImageDraw.Draw(s)
    sd2.rectangle([2 * SS, 2 * SS, 24 * SS, 54 * SS], fill=(255, 255, 255), outline=INK, width=2 * SS)
    s = s.rotate(angle, expand=True, resample=Image.BICUBIC)
    img.paste(s, (int(x * W * SS - s.width / 2), int(y * H * SS - s.height / 2)), s)
    text((lx, ly), label, sz, anchor=anchor, bold=1)

stop(0.518, 0.175, 0, "呉服町", 0.532, 0.16)
stop(0.468, 0.535, -50, "祇園橋電停", 0.502, 0.60)
line([(0.478, 0.545), (0.498, 0.605)], INK, 2)
stop(0.352, 0.878, -20, "熊本駅前", 0.368, 0.90)

# ---------------- landmark dots ----------------
def dot(x, y, r, fill, outline=INK):
    cx, cy = x * W * SS, y * H * SS
    d.ellipse([cx - (r + 7) * SS, cy - (r + 7) * SS, cx + (r + 7) * SS, cy + (r + 7) * SS],
              fill=(255, 255, 255))
    d.ellipse([cx - r * SS, cy - r * SS, cx + r * SS, cy + r * SS], fill=fill,
              outline=outline, width=2 * SS)

dot(0.468, 0.44, 15, ORANGE)          # Miyamoto clinic
text((0.484, 0.415), "宮本医院", 32, bold=1)
dot(0.532, 0.405, 15, ORANGE)         # ANA hotel
line([(0.538, 0.415), (0.60, 0.485)], INK, 2)
text((0.605, 0.47), "熊本全日空ホテル\nニュースカイ", 30, bold=1)
dot(0.348, 0.755, 15, ORANGE)         # New Otani
line([(0.338, 0.748), (0.245, 0.672)], INK, 2)
text((0.115, 0.60), "ホテル\nニューオータニ\n熊本", 30, bold=1)

# ---------------- Kitaoka shrine (torii) ----------------
def torii(x, y, s):
    cx, cy = x * W * SS, y * H * SS
    u = s * SS
    d.line([(cx - 1.1 * u, cy - 1.0 * u), (cx + 1.1 * u, cy - 1.0 * u)], fill=TORII, width=int(0.38 * u))
    d.line([(cx - 0.85 * u, cy - 0.55 * u), (cx + 0.85 * u, cy - 0.55 * u)], fill=TORII, width=int(0.26 * u))
    d.line([(cx - 0.72 * u, cy - 1.1 * u), (cx - 0.55 * u, cy + 1.0 * u)], fill=TORII, width=int(0.30 * u))
    d.line([(cx + 0.72 * u, cy - 1.1 * u), (cx + 0.55 * u, cy + 1.0 * u)], fill=TORII, width=int(0.30 * u))

torii(0.355, 0.55, 22)
line([(0.338, 0.542), (0.262, 0.516)], INK, 2)
text((0.175, 0.505), "北岡神社", 32, bold=1)

# ---------------- line labels ----------------
vtext((0.294, 0.30), "九州新幹線", 30)
vtext((0.337, 0.615), "鹿児島本線", 30)
vtext((0.545, 0.24), "熊本市電", 30)
rtext((0.60, 0.655), "産業道路", 34, 38)
rtext((0.408, 0.20), "坪井川", 27, -80, fill=(30, 90, 140), hw=3)
rtext((0.652, 0.315), "白川", 30, 60, fill=(30, 90, 140), hw=3)

# ---------------- Gofuku marker + callout ----------------
dot(0.428, 0.405, 20, RED)
# pointer
d.polygon(P([(0.30, 0.245), (0.335, 0.27), (0.424, 0.398)]), fill=RED)
bx0, by0, bx1, by1 = 0.125, 0.135, 0.335, 0.275
d.rounded_rectangle([bx0 * W * SS, by0 * H * SS, bx1 * W * SS, by1 * H * SS],
                    radius=14 * SS, fill=RED, outline=(150, 10, 15), width=2 * SS)
d.text(((bx0 + bx1) / 2 * W * SS, (by0 + 0.042) * H * SS), "風流街もやい館",
       font=font(38), fill=(255, 255, 255), anchor="mm", stroke_width=SS, stroke_fill=(255, 255, 255))
d.text(((bx0 + bx1) / 2 * W * SS, (by0 + 0.098) * H * SS), "五 福",
       font=font(54), fill=(255, 255, 255), anchor="mm", stroke_width=SS, stroke_fill=(255, 255, 255))

# ---------------- north arrow ----------------
nx, ny = 0.052, 0.10
d.polygon(P([(nx, ny - 0.055), (nx - 0.016, ny + 0.02), (nx, ny - 0.002), (nx + 0.016, ny + 0.02)]),
          fill=INK)
text((nx, ny + 0.035), "N", 32, anchor="ma", bold=1)

# ---------------- legend ----------------
lx0, ly0 = 0.755, 0.865
d.rounded_rectangle([lx0 * W * SS, ly0 * H * SS, 0.978 * W * SS, 0.975 * H * SS],
                    radius=10 * SS, fill=(255, 255, 255), outline=ROAD_E, width=2 * SS)
rows = [("tram", "熊本市電"), ("jr", "JR鹿児島本線"), ("sks", "九州新幹線")]
for i, (kind, lab) in enumerate(rows):
    y = ly0 + 0.022 + i * 0.031
    seg = [(lx0 + 0.012, y), (lx0 + 0.062, y)]
    if kind == "tram":
        line(seg, TRAM, 9)
    elif kind == "jr":
        line(seg, JR_BASE, 12); dashes(seg, 16, (255, 255, 255), 7)
    else:
        line(seg, SKS_BASE, 12); dashes(seg, 16, (255, 255, 255), 7)
    text((lx0 + 0.072, y - 0.014), lab, 25, hw=0)

# ---------------- card border ----------------
d.rounded_rectangle([3 * SS, 3 * SS, W * SS - 4 * SS, H * SS - 4 * SS],
                    radius=18 * SS, outline=BORDER, width=5 * SS)

img = img.resize((W, H), Image.LANCZOS)
img.save("master_map.png")
print("saved master_map.png")
