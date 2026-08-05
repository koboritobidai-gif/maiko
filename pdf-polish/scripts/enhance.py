#!/usr/bin/env python3
"""Scan enhancement pipeline for the Gofuku brochure PDFs.

Steps per page:
  1. Edge cleanup   - crop scanner shadow strips at the page borders
  2. Descreen       - light gaussian to kill halftone moire
  3. Denoise        - chroma-only smoothing to remove JPEG/scan color noise
  4. Levels         - per-channel white/black point so paper reads white
  5. Saturation     - mild boost to recover the flat scanned colors
  6. Unsharp mask   - restore text/photo edge crispness
"""
import cv2
import numpy as np
import os

SRC = "orig"
DST = "enh"
os.makedirs(DST, exist_ok=True)

EDGE_CROP = 14  # px trimmed on every side (scanner shadow)


def measure_skew(gray):
    """Median angle of long near-horizontal lines, in degrees."""
    edges = cv2.Canny(gray, 60, 160)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 720, 200,
                            minLineLength=gray.shape[1] // 3, maxLineGap=8)
    if lines is None:
        return 0.0
    angs = []
    for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
        a = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(a) < 3:
            angs.append(a)
    if len(angs) < 5:
        return 0.0
    return float(np.median(angs))


def enhance(path_in, path_out):
    img = cv2.imread(path_in)
    h, w = img.shape[:2]

    # 1. edge cleanup
    img = img[EDGE_CROP:h - EDGE_CROP, EDGE_CROP:w - EDGE_CROP]

    # deskew when measurable and small
    ang = measure_skew(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    if 0.12 < abs(ang) < 1.5:
        M = cv2.getRotationMatrix2D((img.shape[1] / 2, img.shape[0] / 2), ang, 1.0)
        img = cv2.warpAffine(img, M, (img.shape[1], img.shape[0]),
                             flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    # 2. descreen: gentle blur that averages the ~2px halftone rosette
    des = cv2.GaussianBlur(img, (0, 0), 1.1)

    # 3. chroma denoise (keep luma sharp)
    ycc = cv2.cvtColor(des, cv2.COLOR_BGR2YCrCb)
    y, cr, cb = cv2.split(ycc)
    cr = cv2.medianBlur(cr, 5)
    cb = cv2.medianBlur(cb, 5)
    cr = cv2.GaussianBlur(cr, (0, 0), 2.0)
    cb = cv2.GaussianBlur(cb, (0, 0), 2.0)
    des = cv2.cvtColor(cv2.merge([y, cr, cb]), cv2.COLOR_YCrCb2BGR)

    # 4. levels: white point from bright paper pixels, conservative gains
    f = des.astype(np.float32)
    gray = cv2.cvtColor(des, cv2.COLOR_BGR2GRAY)
    bright = gray > 180
    out = np.empty_like(f)
    for c in range(3):
        ch = f[:, :, c]
        if bright.sum() > des.size * 0.01:
            wp = np.percentile(ch[bright], 97.0)
        else:
            wp = np.percentile(ch, 99.7)
        wp = max(wp, 205.0)                     # never stretch harder than x1.24
        bp = np.percentile(ch, 0.3)
        bp = min(bp, 18.0)
        out[:, :, c] = (ch - bp) * (255.0 / max(wp - bp, 1.0))
    out = np.clip(out, 0, 255).astype(np.uint8)

    # 5. mild saturation boost
    hsv = cv2.cvtColor(out, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] *= 1.10
    hsv[:, :, 1] = np.clip(hsv[:, :, 1], 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    # 6. unsharp mask
    blur = cv2.GaussianBlur(out, (0, 0), 2.2)
    out = cv2.addWeighted(out, 1.55, blur, -0.55, 0)

    cv2.imwrite(path_out, out, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return ang


if __name__ == "__main__":
    for f in sorted(os.listdir(SRC)):
        if f.endswith(".jpg"):
            ang = enhance(os.path.join(SRC, f), os.path.join(DST, f))
            print(f, f"skew={ang:+.2f}deg")
