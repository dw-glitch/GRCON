"""Upgrade the supplied XLSX in-place at the OOXML part level.

No business data lives in this script. Unrelated ZIP parts remain byte-identical.
Usage: python scripts/upgrade-requests-grcon-v3.py INPUT.xlsx OUTPUT.xlsx AUDIT.json
"""
import copy
import collections
import datetime as dt
import hashlib
import json
import pathlib
import re
import shutil
import sys
import zipfile
from lxml import etree as E

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
N = {'m': NS}
def tag(s): return '{%s}%s' % (NS, s)
def letters(i):
    s = ''
    while i:
        i, r = divmod(i-1, 26)
        s = chr(65+r) + s
    return s
def number(s):
    v = 0
    for c in s: v = v*26 + ord(c)-64
    return v
def shifted(text, start=24, amount=4):
    # Never rewrite quoted Excel literals or structured-reference labels.
    def segment(s):
        return re.sub(r'(?<![A-Za-z0-9_])([$]?)([A-Z]{1,3})([$]?)([1-9][0-9]*)',
            lambda m: m[1]+letters(number(m[2])+amount if number(m[2])>=start else number(m[2]))+m[3]+m[4], s)
    return ''.join(p if i%2 else segment(p) for i,p in enumerate(re.split(r'("(?:[^"]|"")*")',text or '')))
def norm(v): return ' '.join(str(v or '').replace('\xa0',' ').split()).upper()

def main(input_path, output_path, audit_path):
    src, dst = pathlib.Path(input_path), pathlib.Path(output_path)
    dst.parent.mkdir(parents=True,exist_ok=True)
    backup = dst.parent/'Controle_de_Solicitacoes_ORIGINAL_BACKUP.xlsx'
    if not backup.exists(): shutil.copy2(src,backup)
    z = zipfile.ZipFile(src)
    parts = {p:z.read(p) for p in z.namelist()}
    strings = [''.join(x.itertext()) for x in E.fromstring(parts['xl/sharedStrings.xml'])]
    def value(c):
        if c is None:return ''
        v=c.find(tag('v'))
        if c.get('t')=='inlineStr':return ''.join(c.find(tag('is')).itertext())
        if v is None or v.text is None:return ''
        if c.get('t')=='s':return strings[int(v.text)]
        if c.get('t') in ('str','e','b'):return v.text
        try:return float(v.text)
        except ValueError:return v.text
    def cells(root):return {c.get('r'):c for c in root.findall('m:sheetData/m:row/m:c',N)}
    s=E.fromstring(parts['xl/worksheets/sheet1.xml'])
    g=E.fromstring(parts['xl/worksheets/sheet5.xml'])
    old=cells(s);gc=cells(g)
    last=int(re.search(r'\d+$',E.fromstring(parts['xl/tables/table1.xml']).get('ref'))[0])
    sends=[]
    for r in range(3,10129):
        row=[value(gc.get(f'{c}{r}'))for c in 'ABCDEF']
        if row[2]:sends.append((r,row))
    requests={r:{c:value(old.get(f'{c}{r}'))for c in ('A','D','G','K','S','Z')}for r in range(6,last+1)}
    for r,q in requests.items():q['key']=norm(q['K'].split('(')[0]) if isinstance(q['K'],str) and norm(q['K'])not in('NA','N/A') else ''
    # Existing multi-document source links are preserved by their stable ITEM.
    item_to_row={q['A']:r for r,q in requests.items()}
    groups=collections.defaultdict(list)
    children={}
    for rr in range(6,last+1):
        parent=value(old.get(f'AD{rr}'));doc=value(old.get(f'AF{rr}'))
        if parent and doc:
            groups[int(parent)].append(rr);children[rr]=(int(parent),norm(doc))
    # Preserve shared formula groups by moving their anchors and ranges together.
    for c in s.findall('m:sheetData/m:row/m:c',N):
        c.set('r',shifted(c.get('r')))
    for f in s.findall('.//m:f',N)+s.findall('.//m:formula',N):
        if f.text:f.text=shifted(f.text)
        if f.get('ref'):f.set('ref',shifted(f.get('ref')))
    for el in s.iter():
        if E.QName(el).localname in ('c','f','formula'):continue
        for attr in ('ref','sqref','activeCell','topLeftCell'):
            if el.get(attr):el.set(attr,shifted(el.get(attr)))
    cols=s.find(tag('cols'))
    for col in cols:
        a,b=int(col.get('min')),int(col.get('max'))
        assert not(a<24<=b), 'Split source column span before inserting'
        if a>=24:col.set('min',str(a+4));col.set('max',str(b+4))
    for i,width in [(24,32),(25,23),(26,28),(27,28)]:
        E.SubElement(cols,tag('col'),min=str(i),max=str(i),width=str(width),customWidth='1')
    E.SubElement(cols,tag('col'),min='51',max='54',width='18',hidden='1',customWidth='1')
    cols[:]=sorted(cols,key=lambda x:int(x.get('min')))
    sd=s.find(tag('sheetData'));gd=g.find(tag('sheetData'))
    rowmaps={id(s):{int(r.get('r')):r for r in sd},id(g):{int(r.get('r')):r for r in gd}}
    def put(root,addr,val='',formula=None,style=None):
        rowno=int(re.search(r'\d+$',addr)[0]);rm=rowmaps[id(root)]
        if rowno not in rm:
            rm[rowno]=E.SubElement(root.find(tag('sheetData')),tag('row'),r=str(rowno))
        row=rm[rowno];c=next((c for c in row if c.get('r')==addr),None)
        if c is None:c=E.SubElement(row,tag('c'),r=addr)
        keepstyle=style or c.get('s');c.clear();c.set('r',addr)
        if keepstyle:c.set('s',str(keepstyle))
        if formula is not None:
            E.SubElement(c,tag('f')).text=formula
            if isinstance(val,str):c.set('t','str')
            E.SubElement(c,tag('v')).text=str(val)
        elif isinstance(val,str):
            c.set('t','inlineStr');E.SubElement(E.SubElement(c,tag('is')),tag('t')).text=val
        else:E.SubElement(c,tag('v')).text=str(val)
        return c
    # Add local styles by cloning established workbook styles.
    styles=E.fromstring(parts['xl/styles.xml']);xfs=styles.find(tag('cellXfs'))
    def style(base,numFmt=None,wrap=False):
        x=copy.deepcopy(xfs[int(base)])
        if numFmt is not None:x.set('numFmtId',str(numFmt));x.set('applyNumberFormat','1')
        if wrap:
            align=x.find(tag('alignment'))
            if align is None:align=E.SubElement(x,tag('alignment'))
            align.set('wrapText','1');align.set('vertical','center')
        xfs.append(x);xfs.set('count',str(len(xfs)));return len(xfs)-1
    headerstyle=style(old['V5'].get('s'),wrap=True)
    fmts=styles.find(tag('numFmts'))
    if fmts is None:fmts=E.Element(tag('numFmts'),count='0');styles.insert(0,fmts)
    date_format=next((int(x.get('numFmtId'))for x in fmts if x.get('formatCode')=='dd/mm/yyyy'),None)
    if date_format is None:
        date_format=max([163]+[int(x.get('numFmtId'))for x in fmts])+1
        E.SubElement(fmts,tag('numFmt'),numFmtId=str(date_format),formatCode='dd/mm/yyyy');fmts.set('count',str(len(fmts)))
    body=style(old['V6'].get('s'));date_style=style(old['S10'].get('s'),numFmt=date_format)
    ghead=gc['F2'].get('s');gbody=gc['F3'].get('s')
    gdate=gc['A3'].get('s')
    headings=['STATUS DA POSTAGEM NO SIGEM','POSTADO NO SIGEM?','REVISÃO VERIFICADA NO SIGEM','DATA DE REFERÊNCIA DA CONSULTA GERAL']
    for c,h in zip(('X','Y','Z','AA'),headings):put(s,c+'5',h,style=headerstyle)
    rowmaps[id(s)][5].set('ht','46');rowmaps[id(s)][5].set('customHeight','1')
    # Bound all lookup ranges by the numeric count pasted with the v3 header.
    # Tail rows remain as historical raw data but have blank keys after a shorter paste.
    keyname='Chave documento e envio (não colar)'
    active=len(sends)
    for c in g.findall('m:sheetData/m:row/m:c',N):
        if re.match(r'G\d+$',c.get('r')):c.set('r','L'+c.get('r')[1:])
    newheaders=['STATUS DA CONFERÊNCIA','POSTADO NO SIGEM?','REVISÃO VERIFICADA NO SIGEM','DATA DE REFERÊNCIA DA CONSULTA GERAL','SNAPSHOT DA CONSULTA GERAL']
    for c,h in zip('GHIJK',newheaders):put(g,c+'2',h,style=ghead)
    put(g,'I1','REGISTROS ATIVOS',style=ghead);put(g,'J1',active);put(g,'K1','GRCON_V3')
    rowmaps[id(g)][2].set('ht','42');rowmaps[id(g)][2].set('customHeight','1')
    source_by_row=dict(sends)
    for rr in range(3,10129):
        data=source_by_row.get(rr)
        for col,val in [('G','NÃO VERIFICADO'),('H','INDETERMINADO'),('I',''),('J',''),('K','')]:
            if data:put(g,f'{col}{rr}',val,style=gbody if col!='J' else date_style)
        f=f'IF(OR($K$1<>"GRCON_V3",NOT(ISNUMBER($J$1)),ROW()-2>$J$1,C{rr}="",NOT(ISNUMBER(A{rr}))),"",UPPER(TRIM(CLEAN(SUBSTITUTE(C{rr},CHAR(160)," "))))&"|"&TEXT(ROUND(A{rr}*86400,0),"0"))'
        cached=norm(data[2])+'|'+str(int(float(data[0])*86400+.5)) if data else ''
        put(g,f'L{rr}',cached,formula=f,style=gbody)
    gcols=g.find(tag('cols'))
    if gcols is not None:
        for col in list(gcols):
            if int(col.get('min'))>=7:gcols.remove(col)
        for i,w in [(7,32),(8,23),(9,28),(10,28),(11,38),(12,26)]:
            E.SubElement(gcols,tag('col'),min=str(i),max=str(i),width=str(w),customWidth='1',**({'hidden':'1'}if i==12 else{}))
    g.find(tag('dimension')).set('ref','A1:L10128')
    # The blank future formula rows were outside the original Table. Include them.
    gt=E.fromstring(parts['xl/tables/table3.xml']);gt.set('ref','A2:L10128')
    af=gt.find(tag('autoFilter'))
    if af is not None:
        af.set('ref','A2:L10128')
        for fc in af.findall(tag('filterColumn')):
            if fc.get('colId')=='6':fc.set('colId','11')
    tc=gt.find(tag('tableColumns'));keycol=tc[-1];tc.remove(keycol)
    for i,h in enumerate(newheaders,8):E.SubElement(tc,tag('tableColumn'),id=str(i),name=h)
    tc.append(keycol);tc.set('count','12')
    keycol.find(tag('calculatedColumnFormula')).text='IF(OR($K$1<>"GRCON_V3",NOT(ISNUMBER($J$1)),ROW()-2>$J$1,GRCON_Envios[[#This Row],[DOCUMENTO]]="",NOT(ISNUMBER(GRCON_Envios[[#This Row],[DATA DA GERAÇÃO / POSTAGEM]]))),"",UPPER(TRIM(CLEAN(SUBSTITUTE(GRCON_Envios[[#This Row],[DOCUMENTO]],CHAR(160)," "))))&"|"&TEXT(ROUND(GRCON_Envios[[#This Row],[DATA DA GERAÇÃO / POSTAGEM]]*86400,0),"0"))'
    # Excel criteria escape literal wildcards in document identifiers.
    def escaped(key):return f'SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({key},"~","~~"),"*","~*"),"?","~?")'
    def last_send(key,receipt,ownerkey=None):
        k=escaped(key)
        end=f'_xlfn.MINIFS(Tabela2[Data de Recebimento],Tabela2[Chave documento],{k},Tabela2[Data de Recebimento],">"&{receipt})'
        cutoff=f'IF({end}=0,2958466,{end})'
        if ownerkey:
            e2=f'_xlfn.MINIFS(Tabela2[Data de Recebimento],Tabela2[Chave documento],{escaped(ownerkey)},Tabela2[Data de Recebimento],">"&{receipt})'
            cutoff=f'MIN({cutoff},IF({e2}=0,2958466,{e2}))'
        mx=f'_xlfn.MAXIFS(GRCON_Envios[DATA DA GERAÇÃO / POSTAGEM],GRCON_Envios[{keyname}],{k}&"|*",GRCON_Envios[EGRDT],"<>",GRCON_Envios[DATA DA GERAÇÃO / POSTAGEM],">="&{receipt},GRCON_Envios[DATA DA GERAÇÃO / POSTAGEM],"<"&{cutoff})'
        return f'IF(OR({key}="",LEN({k})>253,NOT(ISNUMBER({receipt}))),"",IF({mx}=0,"",{mx}))'
    def pos(key,send):
        lookup=f'{key}&"|"&TEXT(ROUND({send}*86400,0),"0")'
        literal=escaped('('+lookup+')')
        return f'IF(OR({send}="",{send}=0,LEN({literal})>255),"",_xlfn.IFNA(MATCH({literal},GRCON_Envios[{keyname}],0),""))'
    def get(field,p,fallback):
        index=f'INDEX(GRCON_Envios[{field}],{p})'
        return f'IF({p}="",{fallback},IF({index}="",{fallback},{index}))'
    def status_formulas(p,key):
        literal=escaped(f'INDEX(GRCON_Envios[{keyname}],{p})')
        duplicate=f'COUNTIF(GRCON_Envios[{keyname}],{literal})>1'
        return [
          f'IF({key}="","",IF({p}="","NÃO VERIFICADO",IF({duplicate},"REQUER ANÁLISE — ENVIOS SIMULTÂNEOS",{get(newheaders[0],p,chr(34)+"NÃO VERIFICADO"+chr(34))})))',
          f'IF({key}="","",IF({p}="","INDETERMINADO",IF({duplicate},"INDETERMINADO",{get(newheaders[1],p,chr(34)+"INDETERMINADO"+chr(34))})))',
          f'IF({key}="","",{get(newheaders[2],p,chr(34)*2)})',
          f'IF({key}="","",{get(newheaders[3],p,chr(34)*2)})']
    bydoc=collections.defaultdict(list)
    for rr,data in sends:bydoc[norm(data[2])].append((rr,data))
    def cached_send(key,receipt,ownerkey=None):
        if not key or not isinstance(receipt,(int,float)):return ('','')
        later=[q['D']for q in requests.values()if q['key']in(key,ownerkey) and isinstance(q['D'],(int,float))and q['D']>receipt]
        limit=min(later)if later else 2958466
        eligible=[(rr,d)for rr,d in bydoc[key]if d[1]and isinstance(d[0],(int,float))and receipt<=d[0]<limit]
        if not eligible:return ('','')
        rr,d=max(eligible,key=lambda a:(a[1][0],-a[0]));return d[0],rr-2
    cached={};manual_dates=0;removed_false_dates=0
    for rr,q in requests.items():
        if rr in groups:continue
        send,p=cached_send(q['key'],q['D']);cached[rr]=(send,p)
        put(s,f'AB{rr}',send,formula=last_send(f'$AD{rr}',f'$D{rr}'),style=gdate)
        put(s,f'AC{rr}',p,formula=pos(f'$AD{rr}',f'$AB{rr}'))
    # Existing 524 child-document records keep their source/ITEM guards.
    for rr,(parent,key) in children.items():
        q=requests[parent];send,p=cached_send(key,q['D'],q['key'])
        receipt=f'INDEX(Tabela2[Data de Recebimento],MATCH($AH{rr}-5,Tabela2[ITEM],0))'
        guard=f'AND(COUNTIFS(Tabela2[ITEM],$AH{rr}-5)=1,EXACT(INDEX(Tabela2[Documento],MATCH($AH{rr}-5,Tabela2[ITEM],0)),INDEX($AI:$AI,MATCH($AH{rr},$AH:$AH,0))))'
        ownerkey=f'INDEX(Tabela2[Chave documento],MATCH($AH{rr}-5,Tabela2[ITEM],0))'
        put(s,f'AK{rr}',send,formula=f'IF({guard},{last_send(f"$AJ{rr}",receipt,ownerkey)},"")',style=gdate)
        put(s,f'AL{rr}',p,formula=pos(f'$AJ{rr}',f'$AK{rr}'))
        for col,f,val in zip(('AY','AZ','BA','BB'),status_formulas(f'$AL{rr}',f'$AJ{rr}'),('NÃO VERIFICADO','INDETERMINADO','','')):
            put(s,f'{col}{rr}',val,formula=f,style=date_style if col=='BB' else body)
    # The current upload has no Consulta Geral: do not populate proof from history.
    for rr,q in requests.items():
        fs=status_formulas(f'$AC{rr}',f'$AD{rr}')
        values=['NÃO VERIFICADO','INDETERMINADO','',''] if q['key'] else ['']*4
        if rr in groups:
            a,b=min(groups[rr]),max(groups[rr])
            count=b-a+1
            fs=[f'IF(COUNTA($AJ${a}:$AJ${b})=0,"NÃO VERIFICADO",IF(COUNTIF($AZ${a}:$AZ${b},"SIM")={count},"POSTADO — TODOS OS DOCUMENTOS",IF(COUNTIF($AZ${a}:$AZ${b},"SIM")>0,"POSTAGEM PARCIAL","NÃO VERIFICADO")))',
                f'IF(COUNTIF($AZ${a}:$AZ${b},"SIM")={count},"SIM","INDETERMINADO")',
                f'_xlfn.TEXTJOIN(" | ",TRUE,$BA${a}:$BA${b})',
                f'IF(COUNT($BB${a}:$BB${b})={count},MIN($BB${a}:$BB${b}),"")']
        for col,f,val in zip(('X','Y','Z','AA'),fs,values):put(s,f'{col}{rr}',val,formula=f,style=date_style if col=='AA' else body)
        sc=next((c for c in rowmaps[id(s)][rr]if c.get('r')==f'S{rr}'),None)
        if sc is not None and sc.find(tag('f'))is not None:
            removed_false_dates+=1;put(s,f'S{rr}','',style=sc.get('s'))
        elif isinstance(q['S'],(int,float)):manual_dates+=1
    st=E.fromstring(parts['xl/tables/table1.xml']);st.set('ref',f'A5:AF{last}')
    af=st.find(tag('autoFilter'))
    if af is not None:af.set('ref',f'A5:AF{last}')
    tc=st.find(tag('tableColumns'))
    for i,(h,f)in enumerate(zip(headings,status_formulas('Tabela2[[#This Row],[Posição no GRCON]]','Tabela2[[#This Row],[Chave documento]]'))):
        c=E.Element(tag('tableColumn'),id=str(29+i),name=h);E.SubElement(c,tag('calculatedColumnFormula')).text=f;tc.insert(23+i,c)
    tc.set('count','32')
    for c in tc:
        name=c.get('name');f=c.find(tag('calculatedColumnFormula'))
        if name=='Último envio GRCON':f.text=last_send('Tabela2[[#This Row],[Chave documento]]','Tabela2[[#This Row],[Data de Recebimento]]')
        if name=='Posição no GRCON':f.text=pos('Tabela2[[#This Row],[Chave documento]]','Tabela2[[#This Row],[Último envio GRCON]]')
    # Conditional formats: reject/analysis take precedence over the POSTADO prefix.
    dxfs=styles.find(tag('dxfs'))
    if dxfs is None:dxfs=E.SubElement(styles,tag('dxfs'),count='0')
    colors=[('RECUSAD','FFFCE4D6'),('DIVERGENTE','FFFCE4D6'),('ANÁLISE','FFFFF2CC'),('AGUARDANDO','FFFFF2CC'),('NÃO VERIFICADO','FFE7E6E6'),('POSTADO','FFE2F0D9')]
    priority=max([int(e.get('priority','0'))for e in s.findall('.//m:cfRule',N)]+[0])
    insert_at=list(s).index(s.find(tag('pageMargins')))
    cf=E.Element(tag('conditionalFormatting'),sqref=f'X6:X{last}');s.insert(insert_at,cf)
    for i,(word,color)in enumerate(colors):
        idx=len(dxfs);d=E.SubElement(dxfs,tag('dxf'));fill=E.SubElement(d,tag('fill'));pat=E.SubElement(fill,tag('patternFill'),patternType='solid');E.SubElement(pat,tag('fgColor'),rgb=color);E.SubElement(pat,tag('bgColor'),indexed='64')
        rule=E.SubElement(cf,tag('cfRule'),type='expression',dxfId=str(idx),priority=str(priority+i+1),stopIfTrue='1');E.SubElement(rule,tag('formula')).text=f'ISNUMBER(SEARCH("{word}",$X6))'
    dxfs.set('count',str(len(dxfs)))
    # Keep every historical raw record and all unrelated parts unchanged.
    s.find(tag('dimension')).set('ref',f'A1:BB{last}')
    for root in (s,g):
        for row in root.findall('m:sheetData/m:row',N):row[:]=sorted(row,key=lambda c:number(re.match('[A-Z]+',c.get('r'))[0]))
    workbook=E.fromstring(parts['xl/workbook.xml'])
    cp=workbook.find(tag('calcPr'))
    if cp is None:cp=E.SubElement(workbook,tag('calcPr'))
    cp.set('calcMode','auto');cp.set('fullCalcOnLoad','1');cp.set('forceFullCalc','1')
    for dn in workbook.findall('m:definedNames/m:definedName',N):
        if dn.text and 'Solicitações!'in dn.text:dn.text=shifted(dn.text)
        if dn.get('localSheetId')=='4' and dn.get('name')=='_xlnm._FilterDatabase':dn.text="'Colar GRCON'!$A$2:$L$10128"
    changes={'xl/worksheets/sheet1.xml':s,'xl/worksheets/sheet5.xml':g,'xl/tables/table1.xml':st,'xl/tables/table3.xml':gt,'xl/styles.xml':styles,'xl/workbook.xml':workbook}
    # Calculation order is rebuilt by Excel; stale calcChain references are unsafe.
    removed=[]
    if 'xl/calcChain.xml'in parts:
        removed.append('xl/calcChain.xml')
        rel=E.fromstring(parts['xl/_rels/workbook.xml.rels'])
        for e in list(rel):
            if e.get('Type','').endswith('/calcChain'):rel.remove(e)
        changes['xl/_rels/workbook.xml.rels']=rel
        content=E.fromstring(parts['[Content_Types].xml'])
        for e in list(content):
            if e.get('PartName')=='/xl/calcChain.xml':content.remove(e)
        changes['[Content_Types].xml']=content
    for path,root in changes.items():parts[path]=E.tostring(root,encoding='UTF-8',xml_declaration=True,standalone=True)
    tmp=dst.with_suffix('.tmp.xlsx')
    with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED)as out:
        for info in z.infolist():
            if info.filename not in removed:out.writestr(copy.copy(info),parts[info.filename])
    with zipfile.ZipFile(tmp)as out:
        assert out.testzip()is None
        for p in changes:E.fromstring(out.read(p))
        assert len(E.fromstring(out.read('xl/workbook.xml')).find(tag('sheets')))==6
        assert all(out.read(p)==z.read(p)for p in z.namelist()if p not in changes and p not in removed)
    tmp.replace(dst)
    audit={'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'output_sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),'requests':last-5,'history_records':active,'multi_document_requests':len(groups),'child_records':len(children),'manual_numeric_forecasts_preserved':manual_dates,'generation_dates_removed_from_forecast':removed_false_dates,'changed_parts':list(changes),'removed_parts':removed,'source_sheets':6,'native_excel_recalculation':'not_available','posting_source':'No Consulta Geral in the supplied file. All new proof fields remain unverified.'}
    pathlib.Path(audit_path).write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    history=[]
    for _,data in sends:
        history.append(data)
    (dst.parent/'history-input.json').write_text(json.dumps(history,ensure_ascii=False))
    print(json.dumps(audit,ensure_ascii=False))

if __name__=='__main__':main(*sys.argv[1:])
