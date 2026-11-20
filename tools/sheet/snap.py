# -*- coding: utf-8 -*-
"""スプレッドシートの中身を、docs/sheet/ に控え（スナップショット）として書き出す。

なぜ要るか
  naru さんがシートを直したとき、「どこを直したのか」が分からないと
  アプリに反映し忘れる。前回の控えと比べれば、変わった行だけが出せる。

使い方
  1. Drive からシートを xlsx で落とす（Google Drive のコネクタでできる）
  2. python3 tools/sheet/snap.py <落とした.xlsx>        … いまの中身と比べて差分を出す
  3. python3 tools/sheet/snap.py <落とした.xlsx> --save … 控えを新しくする
"""
import os, sys, io, difflib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xlsx

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'sheet')
TABS = ['FIT1', 'FIT2', '30Days']          # アプリの中身に関係するタブだけ見る


def text(path, tab):
    return '\n'.join('\t'.join(r) for r in xlsx.rows(path, tab)) + '\n'


def main(path, save):
    os.makedirs(OUT, exist_ok=True)
    changed = 0
    for tab in TABS:
        new = text(path, tab)
        f = os.path.join(OUT, tab + '.tsv')
        old = io.open(f, encoding='utf-8').read() if os.path.exists(f) else ''
        if old == new:
            print('  %-8s 変わっていません' % tab)
            continue
        changed += 1
        print('  %-8s 変わりました' % tab)
        if old:
            for ln in difflib.unified_diff(old.splitlines(), new.splitlines(),
                                           '前回', '今回', lineterm='', n=0):
                if ln.startswith(('---', '+++', '@@')):
                    continue
                print('     ' + ln[:300])
        if save:
            io.open(f, 'w', encoding='utf-8').write(new)
    if save:
        print('控えを新しくしました')
    elif changed:
        print('※ 控えは更新していません。反映が終わったら --save を付けて実行してください')


if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    if not a:
        raise SystemExit('使い方: python3 tools/sheet/snap.py <xlsxのパス> [--save]')
    main(a[0], '--save' in sys.argv)
