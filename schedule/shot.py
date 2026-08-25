from playwright.sync_api import sync_playwright
import sys
src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
                          args=["--font-render-hinting=none","--no-sandbox"])
    pg = b.new_page(viewport={"width":1200,"height":900}, device_scale_factor=2)
    pg.goto("file://"+src, wait_until="networkidle")
    pg.wait_for_timeout(2500)
    el = pg.query_selector(".sheet")
    box = el.bounding_box(); print("size:", box)
    el.screenshot(path=out)
    b.close()
