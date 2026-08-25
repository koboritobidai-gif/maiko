#!/usr/bin/env python3
"""浜屋様 ウズベキスタン ビジネスミッションツアー日程表 を生成する。
出典: Hamaya_Team.pdf（8/24〜8/29）＋ 8/25 の変更連絡。"""
import base64, pathlib

HERE = pathlib.Path(__file__).parent

def b64(name):
    return base64.b64encode((HERE / 'photos' / name).read_bytes()).decode()

PHOTOS = [('samarkand.jpg', 'サマルカンド'), ('tashkent.jpg', 'タシケント新都心'),
          ('mosque.jpg', 'モスク'), ('apartment.jpg', '高層マンション')]

# (アイコン, 時刻, 本文, 補足)
DAYS = [
 dict(n=1, date='8月24日（月）', city='タシケント', foot='hotel', items=[
   ('plane', '16:40', 'タシケント着', ''),
   ('bed',   '',      'ホテルチェックイン', ''),
   ('meal',  '',      '夕食', ''),
 ]),
 dict(n=2, date='8月25日（火）', city='タシケント', foot='hotel', items=[
   ('meal',  '',      'ホテルにて朝食', ''),
   ('users', '10:00', '打ち合わせ（本間）', ''),
   ('users', '13:00', '打ち合わせ（ブニヨド）', ''),
   ('bank',  '17:00', 'タシケント市役所で打合せ', ''),
   ('meal',  '19:00', '夕食', ''),
 ]),
 dict(n=3, date='8月26日（水）', city='タシケント', foot='hotel', items=[
   ('meal',  '',      'ホテルにて朝食', ''),
   ('car',   '10:30', 'ホテルから出発', ''),
   ('bank',  '11:30', 'JICAウズベキスタンで打合せ', ''),
   ('meal',  '12:30', '昼食', ''),
   ('acc',   '15:00', '「NUR」と打合せ', 'より現場レベルの障碍者就労支援団体'),
   ('acc',   '17:00', '「Inklyuziv Hayot」と打合せ', 'より現場レベルの障碍者就労支援団体'),
   ('meal',  '19:00', '夕食', ''),
 ]),
 dict(n=4, date='8月27日（木）', city='タシケント→ウルゲンチ', foot='hotel', items=[
   ('meal',  '',      'ホテルにて朝食', ''),
   ('car',   '9:30',  'ホテルから出発', ''),
   ('acc',   '10:00', '「Sharoit Plyus」と打合せ', 'より現場レベルの障碍者就労支援団体'),
   ('meal',  '12:00', '昼食', ''),
   ('plane', '13:45', 'タシケント発', ''),
   ('plane', '15:15', 'ウルゲンチ着', ''),
   ('bldg',  '15:45', '「Japan Plaza」販売事務所訪問', ''),
   ('bank',  '17:00', 'ホレズム州役所で打合せ', ''),
   ('mosque','',      '世界遺産「イチャンカラ・ヒバ城」視察', ''),
   ('meal',  '',      '夕食', ''),
   ('plane', '23:10', 'ウルゲンチ発', ''),
   ('plane', '0:30',  'タシケント着', '翌8月28日（金）'),
 ]),
 dict(n=5, date='8月28日（金）', city='タシケント', foot='hotel', items=[
   ('meal',  '',      'ホテルにて朝食', ''),
   ('car',   '10:30', 'ホテルから出発', ''),
   ('truck', '11:00', '「Makhsus Trans」と打合せ', 'ゴミ収集・特殊車両運行の実務主体'),
   ('meal',  '12:30', '昼食', ''),
   ('chip',  '14:00', '「Uzeltexsanoat」と打合せ', '電子・電気産業および計測機器製造業コンツェルン'),
   ('tv',    '16:00', '「MediaPark」と打合せ', '家電チェーン'),
   ('meal',  '18:00', '夕食', ''),
 ]),
 dict(n=6, date='8月29日（土）', city='タシケント', foot='dep', items=[
   ('meal',  '',      'ホテルにて朝食', ''),
   ('car',   '11:00', 'ホテルから出発', ''),
   ('mosque','12:00', '旧市街モスク視察', ''),
   ('meal',  '12:30', '昼食', ''),
   ('bldg',  '14:00', '日本人墓地・日本人資料館視察', ''),
   ('bldg',  '16:00', 'Japan Uz Trade House 事務所訪問', ''),
   ('plane', '19:30', 'タシケント空港着', ''),
   ('meal',  '',      '夕食', ''),
   ('plane', '',      'タシケント発', ''),
 ]),
]

BENEFITS = [
 ('bank',  '政府機関との<br>関係構築ができる',        '政府関係者との面談を通じて現地制度や投資動向を把握できます'),
 ('hand',  '現地企業・パートナー<br>企業と直接商談できる', '現地企業との交流を通じて新たなビジネス機会を創出します'),
 ('chart', 'ウズベキスタン市場を<br>理解できる',        '市場規模や消費動向、商流の実態を把握できます'),
 ('truck', '輸出入・物流環境を<br>確認できる',          '物流インフラや通関環境など実態面を確認できます'),
 ('globe', '現地ビジネス環境を<br>把握できる',          '法制度や投資環境、人材事情などを理解できます'),
 ('users', '新たなビジネス機会を<br>創出できる',        '官民双方とのネットワーク構築を通じて事業機会を広げます'),
]

# 固有名詞・語尾は途中で改行させない
NOWRAP = ['JICAウズベキスタン', '「Sharoit Plyus」', '「Makhsus Trans」', '「Inklyuziv Hayot」',
          '「Uzeltexsanoat」', '「MediaPark」', '「Japan Plaza」', '「NUR」', 'タシケント市役所',
          'ホレズム州役所', 'と打合せ', 'で打合せ', 'コンツェルン', '販売事務所訪問',
          '日本人資料館視察', '旧市街モスク視察', '事務所訪問', 'タシケント空港着', 'ホテルから出発',
          'ホテルにて朝食', 'ホテルチェックイン', '「イチャンカラ・ヒバ城」視察']

def nb(text):
    for w in NOWRAP:
        text = text.replace(w, f'<span class="nb">{w}</span>')
    return text

def icon(name, cls='ic'):
    return f'<svg class="{cls}"><use href="#i-{name}"/></svg>'

def render_day(d):
    items = ''.join(
        f'<div class="it">{icon(ic)}'
        + (f'<span class="t">{t}</span>' if t else '')
        + nb(txt)
        + (f'<span class="n">{nb(note)}</span>' if note else '')
        + '</div>'
        for ic, t, txt, note in d['items'])
    foot = ('<div class="dfoot">' + icon('hotel2', 'fi')
            + '<span>LOTTE CITY HOTEL<br>TASHKENT PALACE</span></div>'
            if d['foot'] == 'hotel' else
            '<div class="dfoot dep">' + icon('plane', 'fi')
            + '<span>タシケント発／ご帰国</span></div>')
    return (f'<div class="day"><div class="dhead"><span class="badge">DAY</span>'
            f'<span class="num">{d["n"]}</span>'
            f'<span class="dt"><b>{d["date"]}</b><i>{d["city"]}</i></span></div>'
            f'<div class="items">{items}</div>{foot}</div>')

photos = ''.join(
    f'<div class="ph"><img src="data:image/jpeg;base64,{b64(f)}" alt="{cap}">'
    f'<div class="cap">{cap}</div></div>' for f, cap in PHOTOS)

benefits = ''.join(
    f'<div class="b">{icon(ic, "bi")}<div class="bt">{title}</div>'
    f'<div class="bd">{desc}</div></div>' for ic, title, desc in BENEFITS)

days = ''.join(render_day(d) for d in DAYS)

html = (HERE / 'template.html').read_text(encoding='utf-8')
html = (html.replace('<!--PHOTOS-->', photos)
            .replace('<!--DAYS-->', days)
            .replace('<!--BENEFITS-->', benefits))
(HERE / 'hamaya-uzbekistan-2026.html').write_text(html, encoding='utf-8')
print('built:', HERE / 'hamaya-uzbekistan-2026.html')
