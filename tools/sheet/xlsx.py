# -*- coding: utf-8 -*-
"""xlsx の1シートを、行ごとのタブ区切りで吐き出す（openpyxl が無いので自前で読む）"""
import sys, zipfile, re
import xml.etree.ElementTree as ET
M='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

def load(path):
    z=zipfile.ZipFile(path)
    wb=ET.fromstring(z.read('xl/workbook.xml'))
    rels={e.get('Id'):e.get('Target') for e in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    names={}
    for sh in wb.find(M+'sheets'):
        t=rels.get(sh.get(R+'id'),'')
        names[sh.get('name')] = 'xl/'+t.lstrip('/')
    sst=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
            sst.append(''.join(t.text or '' for t in si.iter(M+'t')))
    return z, names, sst

def col(ref):
    s=re.match(r'[A-Z]+', ref).group(0); n=0
    for ch in s: n=n*26+ord(ch)-64
    return n-1

def rows(path, sheet):
    z,names,sst=load(path)
    if sheet not in names: raise SystemExit('シートがありません: '+sheet+'  ある: '+', '.join(names))
    root=ET.fromstring(z.read(names[sheet]))
    out=[]
    for r in root.iter(M+'row'):
        cells={}
        for c in r.iter(M+'c'):
            v=c.find(M+'v'); t=c.get('t')
            if t=='inlineStr':
                s=''.join(x.text or '' for x in c.iter(M+'t'))
            elif v is None: s=''
            elif t=='s': s=sst[int(v.text)]
            else: s=v.text or ''
            s=(s or '').replace('\n',' / ').strip()
            if s: cells[col(c.get('r'))]=s
        n=max(cells)+1 if cells else 0
        out.append([cells.get(i,'') for i in range(n)])
    return out

if __name__=='__main__':
    for row in rows(sys.argv[1], sys.argv[2]):
        print('\t'.join(row))
