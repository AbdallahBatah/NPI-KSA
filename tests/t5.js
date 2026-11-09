const {chromium}=require('playwright');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));const U='file://'+require('path').join(__dirname,'..','index.html');
(async()=>{const b=await chromium.launch();
for(const [vw,vh,tag] of [[1366,860,'lap'],[390,844,'mob']]){const ctx=await b.newContext({viewport:{width:vw,height:vh}});const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errs.push(m.text())});
await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
// fake downloads capability capture
await pg.addInitScript(()=>{window.__saved=[];});
const as=async(un,hash)=>{const m=Object.values(seed.team).find(t=>t.username===un);await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto(U+'#'+hash);await pg.reload();await pg.waitForTimeout(250)};
const ovf=async(n)=>{const o=await pg.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1||[...document.querySelectorAll('#sheet .sh')].some(s=>s.scrollWidth>s.clientWidth+1));if(o)console.log(tag,'OVERFLOW',n)};
const screens=[['gm','clients'],['gm','pipeline'],['gm','projects'],['gm','stock'],['gm','purchasing'],['gm','finance'],['gm','settings'],['store','stock'],['eng1','projects']];
for(const [u,h] of screens){await as(u,h);await ovf(u+h);const tb=await pg.locator('.toolbar').count();if(!tb)console.log(tag,'NO TOOLBAR',u,h);if(tag==='mob'&&['clients','stock','projects'].includes(h)&&u==='gm')await pg.screenshot({path:`out/${tag}-tb-${h}.png`})}
// search typing keeps focus & filters
await as('gm','projects');await pg.click('[data-act="pfilter"][data-k="all"]');await pg.waitForTimeout(100);const before=await pg.locator('.tb-count').innerText();
await pg.locator('#flt-projects-q').type('مثال',{delay:30});await pg.waitForTimeout(200);const focused=await pg.evaluate(()=>document.activeElement.id);const after=await pg.locator('.tb-count').innerText();console.log(tag,'search',before,'->',after,'focus',focused);
await pg.locator('#flt-projects-q').fill('zzzz');await pg.waitForTimeout(150);console.log(tag,'nomatch',await pg.locator('.tb-count').innerText());await pg.click('[data-act="fltClear"]');
// stock tabs toolbars
await as('gm','stock');for(const k of ['receipts','moves','items','balances']){await pg.click(`[data-act="stab"][data-k="${k}"]`);await pg.waitForTimeout(100);await ovf('stock-'+k);if(tag==='lap')await pg.screenshot({path:`out/${tag}-stock-${k}.png`})}
await as('gm','finance');for(const k of ['supp','spay','claims']){await pg.click(`[data-act="ftab"][data-k="${k}"]`);await pg.waitForTimeout(100);await ovf('fin-'+k)}
if(tag==='lap'){
 // exports through test hook
 const ex=await pg.evaluate(async()=>{const T=window.__npi;const out={};for(const k of ['projects','pipeline','clients','items','bal','moves','grns','prs','claims','supp','spay','suppliers','team']){const x=T.EXPORTS[k]();out[k]=x.rows.length+'r/'+x.cols.length+'c'}const x=T.EXPORTS.clients();const blob=T.makeXlsx(x.name,x.cols,x.rows);const u=new Uint8Array(await blob.arrayBuffer());const back=await T.readXlsx(u);const csv=await T.makeCsv(x.cols,x.rows).text();return{out,back:back.length+' rows, first='+back[0].slice(0,3).join('|'),csvBack:T.readCsv(csv).length,b64:btoa(String.fromCharCode(...u))}});
 console.log('exports',ex.out);console.log('xlsx roundtrip',ex.back,'csv rows',ex.csvBack);fs.writeFileSync('out/clients.xlsx',Buffer.from(ex.b64,'base64'));
 // import clients from a generated xlsx with header offset
 await as('gm','clients');await pg.click('[data-act="impOpen"][data-k="clients"]');await pg.waitForTimeout(150);
 const xb=await pg.evaluate(async()=>{const T=window.__npi;const rows=[['قائمة العملاء'],[],['الاسم','رقم الجوال','الموقع','الرقم الضريبي'],['عميل مستورد 1','0501111111','الأحساء',''],['عميل مستورد 2','0502222222','الدمام','300000000000001'],['','0503','',''],['مؤسسة مثال للتجارة','0550000004','','']];const cols=rows[0];const blob=T.makeXlsx('x',rows[0],rows.slice(1));return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))});
 fs.writeFileSync('out/imp.xlsx',Buffer.from(xb,'base64'));
 await pg.setInputFiles('#sheet input[data-impfile]','out/imp.xlsx');await pg.waitForTimeout(500);await pg.screenshot({path:'out/lap-import-preview.png'});
 console.log('preview',await pg.locator('#sheet .tot').innerText().catch(()=>'none'));
 await pg.check('#sheet input[data-k="leads"]');await pg.locator('#sheet footer button',{hasText:'تنفيذ'}).click();await pg.waitForTimeout(600);
 const st=await pg.evaluate(()=>{const s=JSON.parse(localStorage.getItem('npi-local-v1'));return{clients:Object.keys(s.clients).length,leads:Object.values(s.projects).filter(p=>p.stage==='lead').length}});console.log('after import',st);
 // items import csv + opening stock count
 await as('store','stock');await pg.click('[data-act="stab"][data-k="items"]');await pg.click('[data-act="impOpen"][data-k="items"]');await pg.waitForTimeout(100);
 fs.writeFileSync('out/items.csv','﻿الكود,اسم الصنف,الوحدة,بند المقايسة\nMAT-NEW-1,صنف جديد تجريبي,عدد,تنفيذ الكهرباء\nMAT-PNL-650,ألواح محدثة,لوح,تركيب الألواح\n');
 await pg.setInputFiles('#sheet input[data-impfile]','out/items.csv');await pg.waitForTimeout(300);console.log('items preview',await pg.locator('#sheet .tot').innerText());await pg.locator('#sheet footer button',{hasText:'تنفيذ'}).click();await pg.waitForTimeout(400);
 await pg.click('[data-act="stab"][data-k="balances"]');await pg.click('[data-act="impOpen"][data-k="stockOpen"]');fs.writeFileSync('out/stock.csv','كود الصنف,الكمية,نوع الحركة\nMAT-NEW-1,25,رصيد افتتاحي\nMAT-CBL-6,100,جرد\nBAD-CODE,5,\n');
 await pg.setInputFiles('#sheet input[data-impfile]','out/stock.csv');await pg.waitForTimeout(300);console.log('stock preview',await pg.locator('#sheet .tot').innerText());await pg.locator('#sheet footer button',{hasText:'تنفيذ'}).click();await pg.waitForTimeout(400);
 const bal=await pg.evaluate(()=>{const s=JSON.parse(localStorage.getItem('npi-local-v1'));const it=Object.values(s.items);const id=c=>it.find(i=>i.code===c).id;const b=(i)=>Object.values(s.moves).reduce((t,m)=>t+(m.itemId===i?(m.to==='MAIN'?m.qty:0)-(m.from==='MAIN'?m.qty:0):0),0);return{newItem:b(id('MAT-NEW-1')),cable:b(id('MAT-CBL-6')),pnlName:it.find(i=>i.code==='MAT-PNL-650').name}});console.log('stock after',bal);
 // budget import into editor
 await as('pgm','project-pdemo1');await pg.click('[data-act="setNeg"][data-v="accepted"]');await pg.waitForTimeout(150);await pg.click('[data-act="startBudget"]');await pg.waitForTimeout(100);await pg.locator('#sheet input[value="blank"]').check();await pg.locator('#sheet footer button',{hasText:'متابعة'}).click();await pg.waitForTimeout(400);
 await pg.click('#sheet [data-act="budgetImport"]');await pg.waitForTimeout(150);
 const bx=await pg.evaluate(async()=>{const T=window.__npi;const rows=[['','','','قيمة التعاقد :-','846,775'],['البيان','الوحدة','الكمية','القيمة','اجمالي'],['الواح الطاقه الشمسية','عدد',1230,319,392370],['نقل الألواح الشمسية من الميناء والتخليص','عدد',1230,13,15990],['تنفيذ تركيب الهياكل والالواح الشمسية والكهرباء','عدد',1230,25,30750],['ماكينة دق البوستات','عدد',328,15,4920],['كابلات بمقاس 6 مللي','م ط',5500,3.8,20900],['الاجمالي','','','',464930]];const blob=T.makeXlsx('x',rows[0],rows.slice(1));return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))});
 fs.writeFileSync('out/budget.xlsx',Buffer.from(bx,'base64'));await pg.setInputFiles('#sheet input[data-impfile]','out/budget.xlsx');await pg.waitForTimeout(400);console.log('budget preview',await pg.locator('#sheet .tot').innerText());
 await pg.locator('#sheet input[data-k="replace"]').check();await pg.locator('#sheet footer button',{hasText:'تنفيذ'}).click();await pg.waitForTimeout(500);
 const lines=await pg.evaluate(()=>[...document.querySelectorAll('#sheet [data-k$=".name"]')].filter(e=>e.dataset.k.startsWith('res.')).map(e=>e.value));const cats=await pg.evaluate(()=>[...document.querySelectorAll('#sheet select[data-k$=".cat"]')].map(e=>e.value));console.log('budget lines',lines.length,cats.join(','));await pg.screenshot({path:'out/lap-budget-imported.png'});
}
console.log(tag,'ERRORS',errs);await ctx.close()}
await b.close()})();
