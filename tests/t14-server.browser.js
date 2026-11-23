// SERVER MODE on an EMPTY database (real PostgreSQL + server permissions): the owner loads the company's users,
// items and suppliers with one action; users sign in with their one-time password and must change it.
// Needs TEST_DATABASE_URL (empty database with db/schema.sql applied).
const {chromium}=require('./support/browser');
const DB=process.env.TEST_DATABASE_URL;if(!DB){console.log('SKIP t14-server.browser.js: set TEST_DATABASE_URL to an empty database with db/schema.sql applied');process.exit(0)}
const PORT=Number(process.env.TEST_SERVER_PORT||5034);const U=`http://127.0.0.1:${PORT}/`;const OWNER=require('crypto').randomBytes(32).toString('hex');const fs=require('fs');const path=require('path');
const company=JSON.parse(fs.readFileSync(path.join(__dirname,'..','seed','company.json')));
const VW=+(process.argv[2]||1366),VH=+(process.argv[3]||860),TAG=VW<700?'mob':'lap';
let fails=0,n=0;const ok=(c,m)=>{n++;console.log(c?'PASS':'FAIL',TAG,m);if(!c)fails++};
(async()=>{
 const b=await chromium.launch({env:{...process.env,LANG:'C.UTF-8',LC_ALL:'C.UTF-8'}});const ctx=await b.newContext({viewport:{width:VW,height:VH},acceptDownloads:true});const pg=await ctx.newPage();
 let cur='';let quiet=false;const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @'+cur));pg.on('console',m=>{if(quiet)return;if(m.type()==='error'&&!m.text().includes('ERR_FAILED')&&!m.text().includes('status of 401'))errs.push('CONSOLE '+m.text()+' @'+cur)});
 pg.on('response',r=>{if(!quiet&&r.status()===403&&r.url().includes('/api/data'))errs.push('HTTP403 '+r.request().method()+' '+r.url().replace(/^.*\/api\//,'/api/')+' @'+cur)});
 await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 const srv=require('child_process').spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT:String(PORT),DATABASE_URL:DB,BOOTSTRAP_OWNER_TOKEN:OWNER,REPLIT_DOMAINS:''},stdio:['ignore','pipe','pipe']});let srvOut='';srv.stdout.on('data',d=>srvOut+=d);srv.stderr.on('data',d=>srvOut+=d);
 process.on('exit',()=>{try{srv.kill()}catch(e){}});
 for(let i=0;i<60&&!srvOut.includes('listening');i++)await new Promise(r=>setTimeout(r,100));
 await pg.goto(U);await pg.locator('#setupForm').waitFor();await pg.fill('#suOwnerToken',OWNER);await pg.fill('#suName','مالك النظام');await pg.fill('#suUser','owner');await pg.fill('#suPass','Owner@2026x');await pg.fill('#suPass2','Owner@2026x');await pg.locator('#setupForm button[type=submit]').click();await pg.locator('.dash-h h1').waitFor({timeout:20000});
 const ctxA=await b.newContext();const pa=await ctxA.newPage();await pa.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());await pa.goto(U);await pa.locator('#loginForm').waitFor();await pa.fill('#lgUser','owner');await pa.fill('#lgPass','Owner@2026x');await pa.locator('#loginForm button[type=submit]').click();await pa.locator('.dash-h h1').waitFor({timeout:20000});
 const ST=async()=>{const d=await pa.evaluate(()=>fetch('/api/data').then(r=>r.json()));for(const k of ['team','items','suppliers','moves'])d[k]=d[k]||{};return d};
 const put=async(col,id,body)=>{quiet=true;try{return await pg.evaluate(async([col,id,body])=>{const r=await fetch(`/api/data/${col}/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.status},[col,id,body])}finally{await pg.waitForTimeout(60);quiet=false}};
 const vis=sel=>pg.locator(sel+':visible');
 const btn=async label=>{const l=pg.locator('#sheet footer button',{hasText:label});if(!(await l.count())){ok(false,`no sheet button «${label}» @${cur}: `+(await pg.locator('#sheet footer button').allInnerTexts()).join('|'));return}await l.first().click();await pg.waitForTimeout(500)};
 const logout=async()=>{await pg.evaluate(()=>fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));await pg.goto(U+'#home');await pg.reload();await pg.locator('#loginForm').waitFor();await pg.waitForTimeout(300)};
 const login=async(u,p)=>{cur='login '+u;for(let k=0;k<3;k++){await pg.fill('#lgUser',u);await pg.fill('#lgPass',p);await pg.waitForTimeout(80);if(await pg.inputValue('#lgUser')===u&&await pg.inputValue('#lgPass'))break;await pg.waitForTimeout(300)}await pg.locator('#loginForm button[type=submit]').first().click();await pg.waitForTimeout(900)};

 // ---- A. empty database: the owner is offered the company data
 cur='owner@home';let s=await ST();ok(Object.keys(s.items).length===0&&Object.keys(s.suppliers).length===0&&Object.keys(s.team).length===1,'A database starts with the owner only');
 await pg.goto(U+'#home');await pg.reload();await pg.locator('[data-company]').waitFor({timeout:15000});
 const note=(await pg.locator('[data-company]').innerText()).replace(/\s+/g,' ');ok(note.includes('8 مستخدم')&&note.includes('20 صنف')&&note.includes('11 مورد'),'A dashboard offers the whole company file: '+note);
 await pg.locator('[data-company] [data-act="loadCompany"]').click();await pg.waitForTimeout(300);await btn('تحميل البيانات');await pg.locator('#sheet code[data-pw]').first().waitFor({timeout:30000});
 const creds=await pg.locator('#sheet .cred').evaluateAll(rs=>rs.map(r=>[r.querySelector('b').innerText.trim(),r.querySelector('.faint').innerText.replace(/^[\s—]+/,'').trim(),r.querySelector('code[data-un]').innerText.trim(),r.querySelector('code[data-pw]').innerText.trim()]));
 ok(creds.length===8&&creds.every(c=>/^Npi-[a-z]{5}\d{4}$/.test(c[3]))&&new Set(creds.map(c=>c[3])).size===8,'A eight one-time temporary passwords shown to the owner');
 {const [dl]=await Promise.all([pg.waitForEvent('download',{timeout:20000}),pg.locator('#sheet footer button',{hasText:'تنزيل Excel'}).click()]);ok(dl.suggestedFilename().endsWith('.xlsx')&&fs.statSync(await dl.path()).size>1500,'A password list downloads as '+dl.suggestedFilename())}
 await btn('تم');
 s=await ST();const emp=company.users.map(u=>s.team[u.id]);
 ok(Object.keys(s.team).length===9&&emp.every((m,i)=>m&&m.username===company.users[i].username&&m.role===company.users[i].role&&m.mustChange===true),'A eight users created on the server with their roles');
 ok(!/password|passHash|pw_hash|salt/i.test(JSON.stringify(s.team))&&!JSON.stringify(s).includes(creds[0][3]),'A no password, hash or temporary password is readable from the data API');
 ok(Object.keys(s.items).length===20&&s.items.ipnl.name==='لوح شمسى 650 وات'&&s.items.ic16.unit==='م ط'&&s.items.iinv630.serial===true&&Object.keys(s.suppliers).length===11&&s.suppliers.sriyadh.name==='مجموعة كابلات الرياض','A 20 items and 11 suppliers stored');
 await pg.goto(U+'#home');await pg.reload();await pg.locator('.dash-h h1').waitFor();await pg.waitForTimeout(400);ok(await pg.locator('[data-company]').count()===0,'A notice gone after loading; nothing left to add');
 // ---- B. the storekeeper signs in with the one-time password
 const c7=creds.find(c=>c[2]==='mohammed.dawood');await logout();await login('mohammed.dawood',c7[3]);
 ok(await pg.locator('#forceForm').count()===1,'B temporary password signs in and a new password is demanded');
 await pg.fill('#fcPass','Dawood2026x');await pg.fill('#fcPass2','Dawood2026x');await pg.locator('#forceForm button[type=submit]').click();await pg.locator('.dash-h h1').waitFor({timeout:20000});cur='mohammed.dawood@home';
 const hello=(await pg.locator('.dash-h .sub').innerText()).replace(/\s+/g,' ');ok(hello.includes('مرحباً محمد')&&hello.includes('أمين المستودع'),'B signed in as the storekeeper: '+hello.slice(0,80));
 ok(await pg.locator('[data-company]').count()===0&&!(await vis('[data-act="loadCompany"]').count()),'B storekeeper is not offered the company load');
 ok(await put('team','hackU',{name:'دخيل',username:'intruder',role:'gm',password:'Hack2026x'})===403,'B storekeeper cannot create users through the API');
 await pg.goto(U+'#stock');await pg.reload();await pg.locator('.content').waitFor();await pg.waitForTimeout(400);await vis('[data-act="stab"][data-k="items"]').first().click().catch(()=>{});await pg.waitForTimeout(300);
 ok((await pg.locator('.content').innerText()).includes('محول فيتشى 560 كيلو'),'B the company items are in the storekeeper item list');
 await logout();await login('mohammed.dawood',c7[3]);ok(await pg.locator('.dash-h h1').count()===0&&await pg.locator('#forceForm').count()===0,'B the one-time password no longer works after the change');
 await login('mohammed.dawood','Dawood2026x');ok(await pg.locator('.dash-h h1').count()===1,'B the new password works');
 // ---- B2. selling materials: the list is the warehouse item list; nothing can be sold before balances exist
 cur='mohammed.dawood@sales';await pg.goto(U+'#sales');await pg.reload();await pg.locator('.content').waitFor();await pg.waitForTimeout(400);await vis('[data-act="newSale"]').first().click();await pg.waitForTimeout(300);
 let opts=await pg.locator('#sheet select[data-k="lines.0.itemId"] option').evaluateAll(os=>os.map(x=>({v:x.value,dis:x.disabled,t:x.textContent})));
 ok(opts.length===21&&opts.filter(x=>x.v).every(x=>x.dis&&x.t.includes('لا يوجد رصيد'))&&await pg.locator('#sheet [data-nostock]').count()===1,'B2 all 20 company items are listed, none sellable yet, with a clear reason');
 await pg.keyboard.press('Escape');
 ok(await pa.evaluate(()=>fetch('/api/data/moves/open1',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:'ipnl',qty:100,from:'ADJ',to:'MAIN',kind:'adj',ref:'جرد: رصيد افتتاحي',at:new Date().toISOString()})}).then(r=>r.status))===200,'B2 owner records an opening balance for the panels');
 await pg.goto(U+'#sales');await pg.reload();await pg.locator('.content').waitFor();await pg.waitForTimeout(400);await vis('[data-act="newSale"]').first().click();await pg.waitForTimeout(300);
 opts=await pg.locator('#sheet select[data-k="lines.0.itemId"] option').evaluateAll(os=>os.map(x=>({v:x.value,dis:x.disabled,t:x.textContent})));const pnl=opts.find(x=>x.v==='ipnl');
 ok(pnl&&!pnl.dis&&pnl.t.includes('المتاح 100')&&opts.filter(x=>x.v&&!x.dis).length===1&&await pg.locator('#sheet [data-nostock]').count()===0,'B2 the item with a balance becomes sellable: '+(pnl?.t||''));
 await pg.fill('#sheet [data-k="buyer.name"]','شركة الأفق للطاقة');await pg.fill('#sheet [data-k="buyer.country"]','الأردن');await pg.selectOption('#sheet select[data-k="lines.0.itemId"]','ipnl');await pg.waitForTimeout(150);await pg.fill('#sheet [data-k="lines.0.qty"]','101');await btn('رفع للمالية');
 ok((await pg.locator('#sheet .alert.bad').innerText().catch(()=>'')).includes('أكبر من المتاح'),'B2 cannot sell more than the warehouse balance');
 await pg.fill('#sheet [data-k="lines.0.qty"]','40');await btn('رفع للمالية');s=await ST();
 ok(Object.values(s.sales||{}).some(x=>x.status==='fin'&&x.lines[0].itemId==='ipnl'&&x.lines[0].qty===40),'B2 sale request saved against the warehouse item');
 // ---- C. finance signs in; supplier list is there
 const c3=creds.find(c=>c[2]==='ahmed.sobhy');await logout();await login('ahmed.sobhy',c3[3]);await pg.fill('#fcPass','Sobhy2026x');await pg.fill('#fcPass2','Sobhy2026x');await pg.locator('#forceForm button[type=submit]').click();await pg.locator('.dash-h h1').waitFor({timeout:20000});cur='ahmed.sobhy@settings';
 await pg.goto(U+'#settings');await pg.reload();await pg.locator('.content').waitFor();await pg.waitForTimeout(400);await vis('[data-act="settab"][data-k="suppliers"]').first().click();await pg.waitForTimeout(300);
 ok((await pg.locator('.content').innerText()).includes('شركة بحرا للكابلات'),'C finance sees the company suppliers');
 ok(!errs.length,'no page errors / unexpected 403: '+errs.join(' ; '));
 console.log(TAG,'ERRORS',errs.length?errs:'none');console.log('TOTAL',n,'FAILS',fails);await b.close();srv.kill();if(fails)process.exitCode=1})().catch(e=>{console.error(e);process.exit(1)});
