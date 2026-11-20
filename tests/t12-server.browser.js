// SERVER MODE (real PostgreSQL + server permissions). Material sales to outside buyers:
// store prepares (never sees or sets prices) → finance prices, approves, invoices → stock deducted → collection,
// plus direct API attempts that the server must refuse, PDF / Excel download in the browser, and a role change.
// Needs TEST_DATABASE_URL (empty database with db/schema.sql applied).
const {chromium}=require('./support/browser');
const DB=process.env.TEST_DATABASE_URL;if(!DB){console.log('SKIP t12-server.browser.js: set TEST_DATABASE_URL to an empty database with db/schema.sql applied');process.exit(0)}
const PORT=Number(process.env.TEST_SERVER_PORT||5032);const U=`http://127.0.0.1:${PORT}/`;const OWNER=require('crypto').randomBytes(32).toString('hex');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
const VW=+(process.argv[2]||1366),VH=+(process.argv[3]||860),TAG=VW<700?'mob':'lap';const Y=new Date().getFullYear();
let fails=0,n=0;const ok=(c,m)=>{n++;console.log(c?'PASS':'FAIL',TAG,m);if(!c)fails++};
(async()=>{
 // UTF-8 locale so the browser keeps Arabic download file names (a C locale turns them into «download»).
 const b=await chromium.launch({env:{...process.env,LANG:'C.UTF-8',LC_ALL:'C.UTF-8'}});const ctx=await b.newContext({viewport:{width:VW,height:VH},acceptDownloads:true});const pg=await ctx.newPage();
 let cur='';let quiet=false;const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @'+cur));pg.on('console',m=>{if(quiet)return;if(m.type()==='error'&&!m.text().includes('ERR_FAILED')&&!m.text().includes('status of 401'))errs.push('CONSOLE '+m.text()+' @'+cur)});
 await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 const srv=require('child_process').spawn(process.execPath,[require('path').join(__dirname,'..','server.js')],{env:{...process.env,PORT:String(PORT),DATABASE_URL:DB,BOOTSTRAP_OWNER_TOKEN:OWNER,REPLIT_DOMAINS:''},stdio:['ignore','pipe','pipe']});let srvOut='';srv.stdout.on('data',d=>srvOut+=d);srv.stderr.on('data',d=>srvOut+=d);
 process.on('exit',()=>{try{srv.kill()}catch(e){}});
 for(let i=0;i<60&&!srvOut.includes('listening');i++)await new Promise(r=>setTimeout(r,100));
 pg.on('response',r=>{if(!quiet&&r.status()===403&&r.url().includes('/api/data'))errs.push('HTTP403 '+r.request().method()+' '+r.url().replace(/^.*\/api\//,'/api/')+' @'+cur)});
 await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);await pg.reload();
 await pg.locator('#setupForm').waitFor();await pg.fill('#suOwnerToken',OWNER);await pg.fill('#suName','المدير العام');await pg.fill('#suUser','admin');await pg.fill('#suPass','Owner@2026x');await pg.fill('#suPass2','Owner@2026x');
 if(await pg.locator('#suImportLocal').count())await pg.locator('#suImportLocal').check();await pg.locator('#setupForm button[type=submit]').click();await pg.locator('.dash-h h1').waitFor({timeout:20000});
 const ctxA=await b.newContext();const pa=await ctxA.newPage();await pa.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());await pa.goto(U);await pa.locator('#loginForm').waitFor();await pa.fill('#lgUser','admin');await pa.fill('#lgPass','Owner@2026x');await pa.locator('#loginForm button[type=submit]').click();await pa.locator('.dash-h h1').waitFor({timeout:20000});
 const ST=async()=>{const d=await pa.evaluate(()=>fetch('/api/data').then(r=>r.json()));for(const k of ['sales','moves','meta','team','items'])d[k]=d[k]||{};return d};
 const mine=()=>pg.evaluate(()=>fetch('/api/data').then(r=>r.json()));
 const put=async(col,id,body)=>{quiet=true;try{return await pg.evaluate(async([col,id,body])=>{const r=await fetch(`/api/data/${col}/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.status},[col,id,body])}finally{await pg.waitForTimeout(60);quiet=false}};
 const vis=sel=>pg.locator(sel+':visible');
 const shErr=async()=>(await pg.locator('#sheet .alert.bad').count())?await pg.locator('#sheet .alert.bad').first().innerText():'';
 const btn=async label=>{const l=pg.locator('#sheet footer button',{hasText:label});if(!(await l.count())){ok(false,`no sheet button «${label}» @${cur}: `+(await pg.locator('#sheet footer button').allInnerTexts()).join('|'));return}await l.first().click();await pg.waitForTimeout(500);const e=await shErr();if(e&&await pg.locator('#sheet .sh').count())console.log('   SHEET ERR',cur,'→',e)};
 const PWS={admin:'Owner@2026x'};const PW=u=>PWS[u]||'Npi@2026';let curUser='admin';
 const logout=async()=>{await pg.evaluate(()=>fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));curUser=null;await pg.goto(U+'#home');await pg.reload();await pg.locator('#loginForm').waitFor();await pg.waitForTimeout(300)};
 const login=async(u,p)=>{cur='login '+u;for(let k=0;k<3;k++){await pg.fill('#lgUser',u);await pg.fill('#lgPass',p);await pg.waitForTimeout(80);if(await pg.inputValue('#lgUser')===u&&await pg.inputValue('#lgPass'))break;await pg.waitForTimeout(300)}await pg.locator('#loginForm button[type=submit]').first().click();await pg.waitForTimeout(900);if(await pg.locator('.dash-h h1, #forceForm').count())curUser=u};
 const as=async(un,hash='home')=>{if(un==='gm')un='admin';cur=un+'@'+hash;
  if(curUser!==un){if(curUser)await logout();else{await pg.goto(U);await pg.reload();await pg.locator('#loginForm').waitFor();await pg.waitForTimeout(300)}await login(un,PW(un));
   if(await pg.locator('#forceForm').count()){PWS[un]='Changed2026x';await pg.fill('#fcPass','Changed2026x');await pg.fill('#fcPass2','Changed2026x');await pg.locator('#forceForm button[type=submit]').click();await pg.waitForTimeout(800)}
   if(!(await pg.locator('.dash-h h1').count())){console.log('LOGIN FAILED',un,await pg.locator('#lgErr').innerText().catch(()=>''));throw new Error('login failed '+un)}curUser=un}
  await pg.goto(U+'#'+hash);await pg.reload();await pg.locator('.content').waitFor();await pg.waitForTimeout(350)};
 const who={};Object.values((await ST()).team).forEach(m=>who[m.username]=m);
 const bal=(s,id)=>Object.values(s.moves).reduce((t,m)=>m.itemId!==id?t:t+(m.to==='MAIN'?m.qty:0)-(m.from==='MAIN'?m.qty:0),0);
 const byBuyer=(s,name)=>Object.values(s.sales).find(x=>x.buyer?.name===name);
 const line=async(i,itemId,qty)=>{await pg.selectOption(`#sheet select[data-k="lines.${i}.itemId"]`,itemId);await pg.waitForTimeout(150);await pg.fill(`#sheet [data-k="lines.${i}.qty"]`,String(qty))};
 const newSale=async(name,country,lines)=>{await as('store','sales');await vis('[data-act="newSale"]').first().click();await pg.waitForTimeout(250);await pg.fill('#sheet [data-k="buyer.name"]',name);await pg.fill('#sheet [data-k="buyer.country"]',country);
  for(let i=0;i<lines.length;i++){if(i>0){await pg.locator('#sheet [data-act="addLine"]').click();await pg.waitForTimeout(150)}await line(i,lines[i][0],lines[i][1])}await btn('رفع للمالية')};

 // ---- A. store prepares; the server keeps prices out of the store's hands
 await newSale('شركة الأفق للطاقة','الأردن',[['ipnl',20],['ic6',500]]);
 let s=await ST();let s1=byBuyer(s,'شركة الأفق للطاقة');
 ok(s1&&s1.status==='fin'&&s1.code===`MS-${Y}-001`&&s1.by===who.store.id&&s1.lines.length===2,`A store request stored on the server (${s1?.code})`);
 ok(bal(s,'ipnl')===270&&!Object.values(s.moves).some(m=>m.kind==='sale'),'A nothing deducted before finance approval');
 ok(await put('sales',s1.id,{...s1,status:'invoiced',invoiceNo:'X-1',currency:'SAR',rate:1,taxType:'export',amount:1,vat:0,total:1,lines:s1.lines.map(l=>({...l,price:1}))})===403,'A store cannot invoice through the API');
 ok(await put('moves','hack1',{itemId:'ipnl',qty:20,from:'MAIN',to:'SALE',kind:'sale',ref:s1.code,saleId:s1.id})===403,'A store cannot deduct sale stock through the API');
 ok(await put('sales','hack2',{code:'MS-HACK',buyer:{name:'جهة'},lines:[{itemId:'imc4',qty:1,price:999}],status:'fin',by:who.store.id,total:999,amount:999})===200,'A store may create a request…');
 s=await ST();ok(s.sales.hack2&&s.sales.hack2.lines[0].price===undefined&&s.sales.hack2.total===undefined,'A …but prices sent by a user who cannot see money are dropped');
 ok(await put('sales','hack3',{code:'MS-H3',buyer:{name:'جهة'},lines:[{itemId:'imc4',qty:1}],status:'invoiced',by:who.store.id})===403,'A a request cannot be created already invoiced');
 ok(await put('sales','hack2',{...s.sales.hack2,status:'cancelled'})===200,'A store can cancel its pending request');

 // ---- B. other roles
 await as('eng1','home');ok(await pg.locator('.rail a[href="#sales"]').count()===0&&Object.keys((await mine()).sales||{}).length===0,'B engineer receives no sales data');
 ok(await put('sales','hack4',{code:'MS-H4',buyer:{name:'جهة'},lines:[{itemId:'imc4',qty:1}],status:'fin',by:who.eng1.id})===403,'B engineer cannot create a sale');

 // ---- C. finance prices, approves, invoices
 await as('finance','home');ok(await vis(`.task [data-act="reviewSale"][data-id="${s1.id}"]`).count()===1,'C finance gets the pricing task');
 ok(await put('moves','hack5',{itemId:'ipnl',qty:21,from:'MAIN',to:'SALE',kind:'sale',ref:s1.code,saleId:s1.id})===403,'C sale stock move above the requested quantity is refused');
 ok(await put('sales',s1.id,{...s1,status:'invoiced',invoiceNo:'X-2',currency:'SAR',rate:1,taxType:'export',amount:1050,vat:0,total:1050,lines:[{...s1.lines[0],price:30},{...s1.lines[1],price:0.9}]})===403,'C invoice refused while stock is not deducted');
 await vis(`.task [data-act="reviewSale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(300);
 await pg.selectOption('#sheet select[data-k="currency"]','JOD');await pg.waitForTimeout(150);await pg.fill('#sheet [data-k="lines.0.price"]','30');await pg.fill('#sheet [data-k="lines.1.price"]','0.9');await btn('اعتماد وإصدار الفاتورة');
 s=await ST();s1=byBuyer(s,'شركة الأفق للطاقة');const mv=Object.values(s.moves).filter(m=>m.kind==='sale'&&m.saleId===s1.id);
 ok(s1.status==='invoiced'&&s1.invoiceNo===`SI-${Y}-001`&&s1.currency==='JOD'&&s1.total===1050&&s1.vat===0&&s1.finBy===who.finance.id,`C invoice ${s1.invoiceNo} issued: ${s1.total} ${s1.currency}`);
 ok(mv.length===2&&bal(s,'ipnl')===250&&bal(s,'ic6')===5500&&mv.every(m=>Number(m.cost)>0),'C stock deducted on the server with cost kept (270→250, 6000→5500)');
 ok(await put('sales',s1.id,{...s1,lines:[{...s1.lines[0],qty:1},s1.lines[1]]})===403&&await put('sales',s1.id,{...s1,total:10})===403,'C an issued invoice cannot be altered');
 ok(await put('sales',s1.id,{...s1,status:'paid',payments:[{amount:5000,date:'2026-01-01'}]})===403,'C collection above the invoice total is refused');
 ok(await put('moves','hack6',{itemId:'ipnl',qty:1,from:'MAIN',to:'SALE',kind:'sale',ref:s1.code,saleId:s1.id})===403,'C no further stock can be deducted against an issued invoice');

 // ---- D. documents download in the browser (server mode)
 await as('finance','sales');await vis(`[data-act="viewSale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(300);await btn('الفاتورة PDF');await pg.locator('.pdf-pages img').first().waitFor({timeout:20000});
 const dlBtn=pg.locator('#sheet footer button',{hasText:'تنزيل PDF'});ok(await dlBtn.count()===1,'D PDF download button available on the server');
 if(await dlBtn.count()){const [dl]=await Promise.all([pg.waitForEvent('download',{timeout:20000}),dlBtn.click()]);const p=await dl.path();ok(dl.suggestedFilename().endsWith('.pdf')&&dl.suggestedFilename().includes(s1.invoiceNo)&&fs.statSync(p).size>20000&&fs.readFileSync(p).subarray(0,5).toString()==='%PDF-',`D invoice downloads as ${dl.suggestedFilename()}`)}
 await pg.keyboard.press('Escape');await pg.waitForTimeout(200);
 await as('finance','sales');await pg.locator('.toolbar details.dd summary').first().click();await pg.waitForTimeout(150);
 {const [dl]=await Promise.all([pg.waitForEvent('download',{timeout:20000}),pg.locator('.toolbar [data-act="exp"][data-f="xlsx"]').first().click()]);ok(dl.suggestedFilename().endsWith('.xlsx')&&fs.statSync(await dl.path()).size>1500,`D Excel export downloads as ${dl.suggestedFilename()}`)}

 // ---- E. store's view of the issued sale: no amounts at all
 await as('store','sales');const sv=(await mine()).sales[s1.id];
 ok(sv&&sv.status==='invoiced'&&sv.invoiceNo===s1.invoiceNo&&sv.total===undefined&&sv.amount===undefined&&sv.rate===undefined&&sv.lines.every(l=>l.price===undefined),'E server sends the store the sale without any amount');
 await vis(`[data-act="viewSale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(300);const fb=(await pg.locator('#sheet footer button').allInnerTexts()).join('|');
 ok(!(await pg.locator('#sheet').innerText()).includes('1,050')&&fb.includes('إذن تسليم')&&!fb.includes('الفاتورة PDF'),'E store gets the delivery note only');await pg.keyboard.press('Escape');

 // ---- F. collection
 await as('finance','sales');await vis(`[data-act="paySale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(250);await pg.fill('#sheet [data-k="amount"]','400');await pg.fill('#sheet [data-k="ref"]','TRF-881');await btn('تسجيل التحصيل');
 s=await ST();s1=byBuyer(s,'شركة الأفق للطاقة');ok(s1.status==='partial'&&s1.payments.length===1&&s1.payments[0].amount===400,'F partial collection stored');
 await as('finance','home');await vis(`.task [data-act="paySale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(250);await btn('تسجيل التحصيل');
 s=await ST();s1=byBuyer(s,'شركة الأفق للطاقة');ok(s1.status==='paid'&&s1.payments.length===2&&s1.payments[1].amount===650,'F invoice fully collected');
 ok(await put('sales',s1.id,{...s1,payments:[...s1.payments,{amount:1,date:'2026-01-01'}]})===403,'F a fully paid invoice is closed');

 // ---- G. local sale with VAT, rejection, resubmit
 await newSale('مؤسسة الرواد للمقاولات','السعودية',[['imc4',100]]);
 await as('finance','sales');let s2=byBuyer(await ST(),'مؤسسة الرواد للمقاولات');await vis(`[data-act="reviewSale"][data-id="${s2.id}"]`).first().click();await pg.waitForTimeout(300);
 await btn('رفض الطلب');ok((await shErr()).includes('سبب الرفض'),'G rejection needs a reason');await pg.fill('#sheet [data-k="decNote"]','أعد التأكد من الكمية');await btn('رفض الطلب');
 s=await ST();s2=byBuyer(s,'مؤسسة الرواد للمقاولات');ok(s2.status==='rejected'&&bal(s,'imc4')===450,'G rejected on the server, stock untouched');
 await as('store','home');await vis(`.task [data-act="editSale"][data-id="${s2.id}"]`).first().click();await pg.waitForTimeout(300);await pg.fill('#sheet [data-k="lines.0.qty"]','80');await btn('حفظ وإعادة الرفع');
 s=await ST();s2=byBuyer(s,'مؤسسة الرواد للمقاولات');ok(s2.status==='fin'&&s2.lines[0].qty===80&&!s2.rejectNote,'G store edits and resubmits');
 await as('finance','sales');await vis(`[data-act="reviewSale"][data-id="${s2.id}"]`).first().click();await pg.waitForTimeout(300);
 ok(await pg.locator('#sheet select[data-k="taxType"]').inputValue()==='local','G Saudi buyer defaults to 15% VAT');await pg.fill('#sheet [data-k="lines.0.price"]','8');await btn('اعتماد وإصدار الفاتورة');
 s=await ST();s2=byBuyer(s,'مؤسسة الرواد للمقاولات');ok(s2.status==='invoiced'&&s2.amount===640&&s2.vat===96&&s2.total===736&&s2.invoiceNo===`SI-${Y}-002`&&bal(s,'imc4')===370,'G local invoice 640 + 96 VAT = 736 SAR, stock 450→370');

 // ---- H. role change is enforced by the server
 await as('gm','admin');await pg.locator('[data-act="atab"][data-k="roles"]:visible').first().click();await pg.waitForTimeout(250);await pg.locator('[data-act="editRole"][data-id="store"]:visible').first().click();await pg.waitForTimeout(300);
 ok(await pg.locator('#sheet input[data-k="pm.sales_create"]').isChecked(),'H store role has the sale permission by default');await pg.locator('#sheet input[data-k="pm.sales_create"]').uncheck();await btn('حفظ');
 await as('store','home');ok(await pg.locator('.rail a[href="#sales"]').count()===0,'H menu entry disappears with the permission');
 ok(await put('sales','hack7',{code:'MS-H7',buyer:{name:'جهة'},lines:[{itemId:'imc4',qty:1}],status:'fin',by:who.store.id})===403,'H server refuses a sale from a role without the permission');
 ok(!errs.length,'no page errors / unexpected 403: '+errs.join(' ; '));
 console.log(TAG,'ERRORS',errs.length?errs:'none');console.log('TOTAL',n,'FAILS',fails);await b.close();srv.kill();if(fails)process.exitCode=1})().catch(e=>{console.error(e);process.exit(1)});
