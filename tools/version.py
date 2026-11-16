# -*- coding: utf-8 -*-
"""index.html の BIZ.build を読んで version.json を作り直す。

アプリは index.html 1枚でできているので、ブラウザがページを読み込み直すまで
古いままになる。アプリ側は version.json の build を見て「新しいのが出た」と
気づくので、BIZ.build を変えたら必ずこれを実行して version.json をそろえる。

    python3 tools/version.py
"""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

m = re.search(r'\bbuild:\s*"(\d{4}\.\d{2}\.\d{2}-\d+)"', html)
if not m:
    sys.exit("index.html の中に BIZ.build（例 build: \"2026.11.16-20\"）が見つかりません")

build = m.group(1)
path = os.path.join(ROOT, "version.json")
io.open(path, "w", encoding="utf-8").write(json.dumps({"build": build}) + "\n")
print("version.json =", build)
