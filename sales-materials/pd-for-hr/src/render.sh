#!/bin/bash
# Render slide HTML -> 1920x1080 PNG. Headless viewport is 87px shorter than window-size.
set -e
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
cd "$(dirname "$0")"
for f in "$@"; do
  base="${f%.html}"
  "$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1920,1167 \
    --default-background-color=00000000 \
    --screenshot="$PWD/out_${base}.png" "file://$PWD/$f" 2>/dev/null
  python3 - "$PWD/out_${base}.png" <<'PY'
import sys
from PIL import Image
p=sys.argv[1]
im=Image.open(p).convert('RGB')
if im.size!=(1920,1080):
    im=im.crop((0,0,1920,1080))
    im.save(p)
im.resize((1200,675)).save(p.replace('out_','prev_').replace('.png','.jpg'),quality=88)
print(p, im.size)
PY
done
