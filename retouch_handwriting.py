#!/usr/bin/env python3
"""Replace handwriting on a photo with new text in a matching handwriting font.

Finds the marker strokes on a light surface, erases them by diffusing the
surrounding colour into the stroke pixels, then writes the replacement word
along the same axis, at the same stroke height and in the same ink colour.

    python3 retouch_handwriting.py cup.jpg out.jpg --text maiko
    python3 retouch_handwriting.py cup.jpg out.jpg --text maiko --debug
"""

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_FONT = os.path.join(HERE, "assets", "fonts", "IndieFlower-Regular.ttf")


def parse_box(value):
    if value is None:
        return None
    parts = [int(round(float(p))) for p in value.replace(" ", "").split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("expected x,y,w,h")
    return tuple(parts)


def detect_strokes(gray, roi, args):
    """Return a boolean mask (full-image size) of the handwriting strokes."""
    x0, y0, w, h = roi
    patch = gray[y0:y0 + h, x0:x0 + w]

    # Background = the surface without the thin strokes.
    bg = ndimage.median_filter(patch, size=args.bg_size)
    dark = bg - patch
    mask = (dark > args.threshold) & (bg > args.min_background)

    # Drop specks, then join strokes into words so we can pick the right blob.
    mask = ndimage.binary_opening(mask, np.ones((3, 3)))
    labels, n = ndimage.label(ndimage.binary_dilation(mask, np.ones((args.join, args.join))))
    if n == 0:
        raise SystemExit("no handwriting found in the search region; try --roi or a lower --threshold")
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    mask &= labels == (int(np.argmax(sizes)) + 1)

    full = np.zeros(gray.shape, bool)
    full[y0:y0 + h, x0:x0 + w] = mask
    return full


def stroke_geometry(mask):
    """Centroid, baseline angle (radians) and extent of the stroke mask."""
    ys, xs = np.nonzero(mask)
    cx, cy = xs.mean(), ys.mean()
    cov = np.cov(np.vstack([xs - cx, ys - cy]))
    vals, vecs = np.linalg.eigh(cov)
    vx, vy = vecs[:, int(np.argmax(vals))]
    angle = math.atan2(vy, vx)

    # Extent measured in the text's own frame: length along the baseline,
    # height across it.
    ca, sa = math.cos(-angle), math.sin(-angle)
    u = (xs - cx) * ca - (ys - cy) * sa
    v = (xs - cx) * sa + (ys - cy) * ca
    return (cx, cy), angle, (u.min(), u.max(), v.min(), v.max())


def inpaint(rgb, mask, iters, margin=24):
    """Erase masked pixels by diffusing the surrounding colour inward."""
    ys, xs = np.nonzero(mask)
    y0, y1 = max(int(ys.min()) - margin, 0), min(int(ys.max()) + margin + 1, rgb.shape[0])
    x0, x1 = max(int(xs.min()) - margin, 0), min(int(xs.max()) + margin + 1, rgb.shape[1])

    hole = mask[y0:y1, x0:x1]
    tile = rgb[y0:y1, x0:x1].astype(np.float64)
    known = ~hole

    # Seed the hole with the mean of the surrounding surface, then relax.
    seed = tile[known].mean(axis=0)
    tile[hole] = seed
    for _ in range(iters):
        blur = ndimage.uniform_filter(tile, size=(3, 3, 1))
        tile[hole] = blur[hole]

    # A perfectly smooth patch reads as plastic; match the local grain.
    noise_std = float(np.std(ndimage.laplace(rgb[y0:y1, x0:x1, 1].astype(np.float64))[known])) / 4.0
    if noise_std > 0:
        rng = np.random.default_rng(0)
        tile[hole] += rng.normal(0.0, min(noise_std, 4.0), size=(int(hole.sum()), 1))

    out = rgb.copy()
    out[y0:y1, x0:x1] = np.clip(tile, 0, 255).astype(np.uint8)
    return out


def ink_colour(rgb, mask):
    px = rgb[mask].astype(np.float64)
    darkest = px[np.argsort(px.sum(axis=1))[: max(1, len(px) // 5)]]
    return tuple(int(round(c)) for c in darkest.mean(axis=0))


def render_word(text, font_path, height_px, colour, weight=None):
    """Render `text` upright, scaled so its stroke band is `height_px` tall."""
    probe = 400
    font = ImageFont.truetype(font_path, probe)
    if weight is not None:
        try:
            font.set_variation_by_axes([weight])
        except OSError:
            pass
    pad = probe
    canvas = Image.new("L", (probe * len(text) + 2 * pad, probe * 3), 0)
    ImageDraw.Draw(canvas).text((pad, pad), text, font=font, fill=255)
    box = canvas.getbbox()
    canvas = canvas.crop(box)

    scale = height_px / canvas.height
    size = (max(1, int(round(canvas.width * scale))), max(1, int(round(canvas.height * scale))))
    alpha = canvas.resize(size, Image.LANCZOS)

    word = Image.new("RGBA", size, colour + (0,))
    word.putalpha(alpha)
    return word


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--text", default="maiko", help="replacement word (default: maiko)")
    ap.add_argument("--font", default=DEFAULT_FONT, help="handwriting .ttf to write it in")
    ap.add_argument("--font-weight", type=float, default=None, help="weight axis for variable fonts, e.g. 500")
    ap.add_argument("--roi", type=parse_box, help="x,y,w,h region to search for the old writing")
    ap.add_argument("--box", type=parse_box, help="x,y,w,h of the old writing; skips detection")
    ap.add_argument("--angle", type=float, help="baseline angle in degrees; overrides the detected one")
    ap.add_argument("--flip", action="store_true", help="write the other way along the baseline (180 deg)")
    ap.add_argument("--anchor", choices=["start", "center", "end"], default="center",
                    help="which end of the old word the new one lines up with")
    ap.add_argument("--scale", type=float, default=1.0, help="multiply the detected text height")
    ap.add_argument("--nudge", default="0,0", help="du,dv shift along/across the baseline, in pixels")
    ap.add_argument("--opacity", type=float, default=0.92, help="ink opacity (marker on plastic is not solid)")
    ap.add_argument("--softness", type=float, default=1.0, help="blur radius applied to the new strokes")
    ap.add_argument("--threshold", type=float, default=38.0, help="how much darker than the surface a stroke is")
    ap.add_argument("--min-background", type=float, default=105.0, help="ignore strokes on dark surfaces")
    ap.add_argument("--bg-size", type=int, default=41, help="median-filter size used to model the surface")
    ap.add_argument("--join", type=int, default=25, help="dilation used to group strokes into one word")
    ap.add_argument("--iters", type=int, default=400, help="diffusion iterations used to erase the old writing")
    ap.add_argument("--debug", action="store_true", help="also write *_debug.png showing what was detected")
    args = ap.parse_args(argv)

    img = Image.open(args.input)
    img = Image.fromarray(np.asarray(img.convert("RGB")))
    rgb = np.asarray(img).astype(np.uint8)
    gray = np.asarray(img.convert("L")).astype(np.float64)

    if args.box:
        x, y, w, h = args.box
        mask = detect_strokes(gray, (x, y, w, h), args)
    else:
        roi = args.roi or (0, 0, rgb.shape[1], rgb.shape[0])
        mask = detect_strokes(gray, roi, args)

    (cx, cy), angle, (umin, umax, vmin, vmax) = stroke_geometry(mask)
    colour = ink_colour(rgb, mask)
    if args.angle is not None:
        angle = math.radians(args.angle)
    if args.flip:
        angle += math.pi
    height = (vmax - vmin) * args.scale
    length = umax - umin

    print(f"found writing: centre=({cx:.0f},{cy:.0f}) angle={math.degrees(angle):.1f}deg "
          f"length={length:.0f}px height={height:.0f}px ink=rgb{colour}")

    # Erase, then write the replacement along the same baseline.
    erased = inpaint(rgb, ndimage.binary_dilation(mask, np.ones((5, 5))), args.iters)
    out = Image.fromarray(erased)

    word = render_word(args.text, args.font, height, colour, args.font_weight)
    if args.softness > 0:
        word.putalpha(word.getchannel("A").filter(ImageFilter.GaussianBlur(args.softness)))
    if args.opacity < 1.0:
        word.putalpha(word.getchannel("A").point(lambda a: int(a * args.opacity)))

    du = {"start": (word.width - length) / 2.0, "center": 0.0, "end": (length - word.width) / 2.0}[args.anchor]
    dv = 0.0
    nu, nv = (float(v) for v in args.nudge.split(","))
    du, dv = du + nu, dv + nv

    ca, sa = math.cos(angle), math.sin(angle)
    px, py = cx + du * ca - dv * sa, cy + du * sa + dv * ca

    rotated = word.rotate(-math.degrees(angle), expand=True, resample=Image.BICUBIC)
    out.paste(rotated, (int(round(px - rotated.width / 2)), int(round(py - rotated.height / 2))), rotated)

    out.save(args.output, quality=95, subsampling=0)
    print(f"wrote {args.output}")

    if args.debug:
        dbg = np.asarray(img).copy()
        dbg[mask] = [255, 0, 0]
        path = os.path.splitext(args.output)[0] + "_debug.png"
        Image.fromarray(dbg).save(path)
        print(f"wrote {path}")


if __name__ == "__main__":
    sys.exit(main())
