// Full 16-step cycle against the REAL shared server (PostgreSQL + server-side permissions), logging in through
// the login screen for every hand-off. Needs TEST_DATABASE_URL (empty database with db/schema.sql applied).
// EMPTY_DB=1 runs the same cycle on a database with NO imported demo data: the owner creates every user, item,
// opening balance and supplier from the screens, users change their first password, and the budget is typed by hand.
const {chromium}=require('./support/browser');
const DB=process.env.TEST_DATABASE_URL;if(!DB){console.log('SKIP t7-server.browser.js: set TEST_DATABASE_URL to an empty database with db/schema.sql applied');process.exit(0)}
const PORT=Number(process.env.TEST_SERVER_PORT||5030);const U=`http://127.0.0.1:${PORT}/`;const OWNER=require('crypto').randomBytes(32).toString('hex');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
const VW=+(process.argv[2]||1366),VH=+(process.argv[3]||860),EMPTY=process.env.EMPTY_DB==='1',TAG=(VW<700?'mob':'lap')+(EMPTY?' empty-db':'');
let fails=0,n=0;const ok=(c,m)=>{n++;console.log(c?'PASS':'FAIL',TAG,m);if(!c)fails++};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:VW,height:VH}});const pg=await ctx.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @'+cur));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED')&&!m.text().includes('status of 401'))errs.push('CONSOLE '+m.text()+' @'+cur)});
 pg.on('dialog',d=>{errs.push('DIALOG '+d.message());d.dismiss()});
 pg.on('response',r=>{if(r.status()===403&&r.url().includes('/api/'))errs.push('HTTP403 '+r.request().method()+' '+r.url().replace(/^.*\/api\//,'/api/')+' @'+cur)});
 await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 let cur='';
 const srvEnv={...process.env,PORT:String(PORT),DATABASE_URL:DB,BOOTSTRAP_OWNER_TOKEN:OWNER,REPLIT_DOMAINS:''};
 const srv=require('child_process').spawn(process.execPath,[require('path').join(__dirname,'..','server.js')],{env:srvEnv,stdio:['ignore','pipe','pipe']});let srvOut='';srv.stdout.on('data',d=>srvOut+=d);srv.stderr.on('data',d=>srvOut+=d);
 process.on('exit',()=>{try{srv.kill()}catch(e){}});
 for(let i=0;i<60&&!srvOut.includes('listening');i++)await new Promise(r=>setTimeout(r,100));
 // owner setup + one-time import of the demo snapshot, exactly as a new company would do it
 await pg.goto(U);if(!EMPTY)await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);await pg.reload();
 await pg.locator('#setupForm').waitFor();await pg.fill('#suOwnerToken',OWNER);await pg.fill('#suName','المدير العام');await pg.fill('#suUser','admin');await pg.fill('#suPass','Owner@2026x');await pg.fill('#suPass2','Owner@2026x');
 if(!EMPTY&&await pg.locator('#suImportLocal').count())await pg.locator('#suImportLocal').check();await pg.locator('#setupForm button[type=submit]').click();await pg.locator('.dash-h h1').waitFor({timeout:20000});
 // a second, independent session (the owner/GM) reads the shared database for assertions
 const ctxA=await b.newContext();const pa=await ctxA.newPage();await pa.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());await pa.goto(U);await pa.locator('#loginForm').waitFor();await pa.fill('#lgUser','admin');await pa.fill('#lgPass','Owner@2026x');await pa.locator('#loginForm button[type=submit]').click();await pa.locator('.dash-h h1').waitFor({timeout:20000});
 const ST=async()=>{const d=await pa.evaluate(()=>fetch('/api/data').then(r=>r.json()));for(const k of ['projects','clients','dlogs','overruns','mreqs','issues','prs','grns','spay','claims','costs','returns','audit','ftasks','team'])d[k]=d[k]||{};return d};
 const who={};
 const PWS={admin:'Owner@2026x'};const PW=u=>PWS[u]||'Npi@2026';let curUser='admin';
 const as=async(un,hash='home')=>{if(un==='gm')un='admin';cur=un+'@'+hash;
  if(curUser!==un){await pg.evaluate(()=>fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));await pg.goto(U);await pg.reload();await pg.locator('#loginForm').waitFor();await pg.waitForTimeout(400);
   for(let k=0;k<3;k++){await pg.fill('#lgUser',un);await pg.fill('#lgPass',PW(un));await pg.waitForTimeout(80);if(await pg.inputValue('#lgUser')===un&&await pg.inputValue('#lgPass'))break;await pg.waitForTimeout(300)}await pg.locator('#loginForm button[type=submit]').click();try{await pg.locator('.dash-h h1, #forceForm').first().waitFor({timeout:20000})}catch(e){console.log('LOGIN FAILED',un,await pg.locator('#lgErr').innerText().catch(()=>''),(await pg.locator('body').innerText()).slice(0,200));throw e}
   if(await pg.locator('#forceForm').count()){PWS[un]='Changed2026x';await pg.fill('#fcPass','Changed2026x');await pg.fill('#fcPass2','Changed2026x');await pg.locator('#forceForm button[type=submit]').click();await pg.locator('.dash-h h1').waitFor({timeout:20000})}curUser=un}
  await pg.goto(U+'#'+hash);await pg.reload();await pg.locator('.content').waitFor();await pg.waitForTimeout(350)};
 const vis=sel=>pg.locator(sel+':visible');
 const has=async sel=>(await vis(sel).count())>0;
 const click=async(sel,i=0)=>{const l=vis(sel);if(!(await l.count())){ok(false,'missing button '+sel+' for '+cur);return false}await l.nth(i).click();await pg.waitForTimeout(200);return true};
 const toastT=async()=>(await pg.locator('#toast:not([hidden])').count())?await pg.locator('#toast').innerText():'';
 const shErr=async()=>(await pg.locator('#sheet .alert.bad').count())?await pg.locator('#sheet .alert.bad').first().innerText():'';
 const btn=async(label)=>{const l=pg.locator('#sheet footer button',{hasText:label});if(!(await l.count())){ok(false,`no sheet button «${label}» ${cur} buttons=`+(await pg.locator('#sheet footer button').allInnerTexts()).join('|'));return}await l.first().click();await pg.waitForTimeout(300);const e=await shErr();if(e&&await pg.locator('#sheet .sh').count())console.log('   SHEET ERR',cur,'→',e)};
 const sheetOpen=async()=>(await pg.locator('#sheet .sh').count())>0;
 const closeSheet=async()=>{if(await sheetOpen()){await pg.keyboard.press('Escape');await pg.waitForTimeout(150)}};
 const stage=async id=>(await ST()).projects[id]?.stage;
 const go=async(un,id,tab)=>{await as(un,'project-'+id);if(tab)await click(`[data-act="ptab"][data-k="${tab}"]`)};
 const notSee=async(un,id,act,why)=>{await as(un,'project-'+id);ok(!(await has(`[data-act="${act}"]`)),`${un} cannot ${act} (${why})`)};
 // ---- empty database: the owner sets the company up from the screens, nothing is imported
 if(EMPTY){
  ok(Object.keys((await ST()).projects).length===0&&Object.keys((await ST()).items||{}).length===0,' 0 database starts empty (no demo data)');
  for(const [u,name,role] of [['pgm','م. خالد العتيبي','pgm'],['finance','عبدالرحمن الدوسري','fin'],['tech','المكتب الفني','tech'],['eng1','م. ياسر الحربي','eng'],['eng2','م. فهد القحطاني','eng'],['store','سلمان الزهراني','store']]){
   await as('admin','admin');await click('.toolbar [data-act="editMember"]');await pg.fill('#sheet [data-k="name"]',name);await pg.selectOption('#sheet [data-k="role"]',role);await pg.fill('#sheet [data-k="username"]',u);await pg.fill('#sheet [data-k="pw"]','Npi@2026');await btn('حفظ')}
  ok(Object.keys((await ST()).team).length===7,' 0 owner created the six users');
  const ITEMS=[['T-PNL','ألواح شمسية 650 وات','عدد',320,'panels',2000],['T-STR','هياكل تثبيت الألواح','مجموعة',900,'structure',0],['T-CBL','كابلات نحاس 6 مم','م ط',4,'electrical',5000],['T-INV','إنفرتر 75 كيلو','عدد',5800,'electrical',10]];
  for(const [code,name,unit,cost,boq] of ITEMS){await as('admin','settings');await click('[data-act="settab"][data-k="items"]');await click('.toolbar [data-act="editItem"]');await pg.fill('#sheet [data-k="code"]',code);await pg.fill('#sheet [data-k="name"]',name);await pg.selectOption('#sheet [data-k="unit"]',unit);await pg.fill('#sheet [data-k="cost"]',String(cost));await pg.selectOption('#sheet [data-k="boqCode"]',boq);await btn('حفظ')}
  let s0=await ST();const itemId=c=>Object.values(s0.items).find(i=>i.code===c)?.id;ok(ITEMS.every(x=>itemId(x[0])),' 0 owner added the items');
  for(const [code,,,,,qty] of ITEMS){if(!qty)continue;await as('admin','stock');await click('[data-act="stockAdjust"]');await pg.selectOption('#sheet [data-k="itemId"]',itemId(code));await pg.waitForTimeout(150);await pg.fill('#sheet [data-k="count"]',String(qty));await pg.fill('#sheet [data-k="reason"]','رصيد افتتاحي');await btn('تسجيل التسوية')}
  await as('admin','settings');await click('[data-act="settab"][data-k="suppliers"]');await click('[data-act="editSupplier"]');await pg.fill('#sheet [data-k="name"]','شركة التوريدات المتحدة');await pg.fill('#sheet [data-k="creditLimit"]','500000');await btn('حفظ');
  s0=await ST();const balOf=id=>Object.values(s0.moves||{}).reduce((t,m)=>m.itemId!==id?t:t+(m.to==='MAIN'?m.qty:0)-(m.from==='MAIN'?m.qty:0),0);
  ok(balOf(itemId('T-PNL'))===2000&&balOf(itemId('T-CBL'))===5000&&Object.keys(s0.suppliers||{}).length===1,' 0 opening balances and supplier recorded');
 }
 Object.values((await ST()).team).forEach(m=>who[m.username]=m);who.gm=who.admin;


 // 1) PGM registers lead
 await as('pgm','pipeline');await click('[data-act="newLead"]');
 await pg.fill('#sheet [data-k="client.name"]','شركة الاختبار الشامل للزراعة');await pg.fill('#sheet [data-k="client.phone"]','0559998877');await pg.selectOption('#sheet select[data-k="client.city"]','بريدة');await pg.fill('#sheet [data-k="client.site"]','القصيم — بريدة');
 await btn('حفظ');let s=await ST();const P=Object.values(s.projects).find(p=>p.client?.name==='شركة الاختبار الشامل للزراعة');ok(P&&P.stage==='lead',' 1 lead created');const id=P.id;
 ok(Object.values(s.clients).some(c=>c.name==='شركة الاختبار الشامل للزراعة'),' 1 client registered in clients list');
 await notSee('eng1',id,'setNeg','engineer');await as('finance','project-'+id);ok(await has('[data-act="setNeg"]'),' 1 finance manager can also move the lead (projects.create)');
 // 2) accept negotiation
 await go('pgm',id);await click('[data-act="setNeg"][data-v="accepted"]');ok(await stage(id)==='study',' 2 negotiation accepted → study');
 // 3) tech office: study + budget
 await go('tech',id);ok(await has('[data-act="editStudy"]'),' 3 tech office sees study');
 await click('[data-act="editStudy"]');await pg.fill('#sheet [data-k="kw"]','799.5');
 if(await pg.locator('#sheet [data-k="panels"]').count())await pg.fill('#sheet [data-k="panels"]','1230');
 await btn('حفظ');s=await ST();ok(N(s.projects[id].study?.kw)===799.5,' 3 study saved kw='+s.projects[id].study?.kw);
 await click('[data-act="startBudget"]');await btn('متابعة');await pg.waitForTimeout(300);
 if(EMPTY){ // no templates on an empty database: type the budget by hand
  const its=Object.values((await ST()).items);const iid=c=>its.find(i=>i.code===c).id;
  const RES=[['material','T-PNL',1230],['material','T-STR',10],['material','T-CBL',3000],['material','T-INV',8],['labor','عمالة التركيب',1,'مقطوعية',60000],['equipment','ماكينة الدق',1,'مقطوعية',25000]];
  for(let i=0;i<RES.length;i++){const [cat,ref,qty,unit,cost]=RES[i];await pg.locator('#sheet [data-act="addLine"][data-k="res"]').click();await pg.waitForTimeout(150);
   if(cat==='material'){await pg.selectOption(`#sheet [data-k="res.${i}.itemId"]`,iid(ref));await pg.waitForTimeout(150)}else{await pg.selectOption(`#sheet [data-k="res.${i}.cat"]`,cat);await pg.waitForTimeout(150);await pg.fill(`#sheet [data-k="res.${i}.name"]`,ref);await pg.fill(`#sheet [data-k="res.${i}.unit"]`,unit);await pg.fill(`#sheet [data-k="res.${i}.cost"]`,String(cost))}
   await pg.fill(`#sheet [data-k="res.${i}.qty"]`,String(qty))}
  const BOQ=[['دق القواعد','piling','عدد',1000],['تركيب الهياكل','structure','عدد',1000],['تركيب الألواح','panels','لوح',1230],['تنفيذ أعمال الكهرباء','electrical','م ط',3000]];
  for(let i=0;i<BOQ.length;i++){const [name,code,unit,qty]=BOQ[i];await pg.locator('#sheet [data-act="addLine"][data-k="boq"]').click();await pg.waitForTimeout(150);await pg.selectOption(`#sheet [data-k="boq.${i}.code"]`,code);await pg.waitForTimeout(150);await pg.fill(`#sheet [data-k="boq.${i}.name"]`,name);await pg.fill(`#sheet [data-k="boq.${i}.unit"]`,unit);await pg.fill(`#sheet [data-k="boq.${i}.qty"]`,String(qty));await pg.fill(`#sheet [data-k="boq.${i}.share"]`,'25')}
 }
 if(await sheetOpen()){await btn('حفظ')}
 s=await ST();ok(s.projects[id].stage==='budget'&&s.projects[id].budget?.res?.length>5,' 4 budget prepared from template ('+s.projects[id].budget?.res?.length+' lines)');
 ok(!(await has('[data-act="submitBudget"]')),' 4 tech cannot submit budget to GM (PGM only)');
 // 5) PGM submits
 await go('pgm',id);await click('[data-act="submitBudget"]');ok(await stage(id)==='budget_review',' 5 budget submitted to GM');
 await notSee('pgm',id,'approveBudget','PGM');
 // 6) GM returns then approves
 await go('gm',id);await click('[data-act="returnBudget"]');await pg.fill('#sheet [data-k="note"]','راجع هامش الربح');await btn('إعادة');ok(await stage(id)==='budget',' 6 GM returned budget');
 await go('pgm',id);ok((await pg.locator('.alert.bad').allInnerTexts()).join().includes('راجع هامش'),' 6 PGM sees return note');
 await click('[data-act="submitBudget"]');
 await go('gm',id);await click('[data-act="approveBudget"]');await btn('اعتماد');s=await ST();ok(s.projects[id].stage==='quote'&&s.projects[id].quote,' 7 GM approved budget → quote issued '+(s.projects[id].quote?.no||''));
 // 8) docs available
 await go('pgm',id,'docs');const docs=await vis('[data-act="doc"]').count();ok(docs>=2,' 8 documents tab lists '+docs+' docs');
 // 9) client accepts
 await go('pgm',id);await click('[data-act="acceptQuote"]');await pg.fill('#sheet [data-k="ref"]','خطاب موافقة 12');await btn('ترحيل');ok(await stage(id)==='contract_review',' 9 client acceptance → contract review');
 // 10) finance edits contract legal data, GM approves
 await go('finance',id);ok(await has('[data-act="editContract"]'),'10 finance can edit contract');
 await click('[data-act="editContract"]');
 for(const [k,v] of [['client.idNo','1010101010'],['client.address','بريدة، حي الريان'],['months','4']]){const l=pg.locator(`#sheet [data-k="${k}"]`);if(await l.count())await l.fill(v)}
 await btn('حفظ');
 await notSee('finance',id,'approveContract','finance');
 await go('gm',id);await click('[data-act="approveContract"]');s=await ST();ok(s.projects[id].stage==='setup'&&s.projects[id].contract?.status==='approved',' 10 GM approved contract → setup '+(s.projects[id].contract?.no||''));
 // 11) setup: PR blocked before setup completes
 // 11a) PGM assigns engineer
 await go('pgm',id);await click('[data-act="assignEng"]');const engOpts=await pg.locator('#sheet [data-k="eng"] option').evaluateAll(o=>o.map(x=>x.value+':'+x.textContent));if(await pg.locator('#sheet [data-k="eng"]').count())await pg.selectOption('#sheet [data-k="eng"]',who.eng1.id);await btn('تعيين');await pg.waitForTimeout(400);s=await ST();if(s.projects[id].setup?.engineerId!==who.eng1.id)console.log('   assign debug',JSON.stringify(s.projects[id].setup),engOpts,who.eng1.id,await toastT());ok(s.projects[id].setup?.engineerId===who.eng1.id,' 11 engineer assigned');
 // 11b) finance setup
 await as('finance','home');ok(await has('[data-act="finSetup"]'),'11 finance inbox shows setup task');
 await click('[data-act="finSetup"]');const adv=pg.locator('#sheet [data-k="adv"]');if(await adv.count())await adv.check();await btn('حفظ');
 s=await ST();ok(s.projects[id].stage==='planning',' 12 setup complete → planning ('+s.projects[id].stage+')');
 // 12) eng plan, returned once
 await go('eng1',id);await click('[data-act="editPlan"]');await btn('حفظ');await click('[data-act="submitPlan"]');
 await go('pgm',id);await click('[data-act="returnPlan"]');await pg.fill('#sheet [data-k="note"]','قدّم موعد التركيب أسبوعاً');await btn('إعادة');
 await go('eng1',id);ok((await pg.locator('.alert.bad').allInnerTexts()).join().includes('قدّم'),' 12 engineer sees plan return note');
 await click('[data-act="submitPlan"]');await go('pgm',id);await click('[data-act="approvePlan"]');ok(await stage(id)==='execution',' 13 plan approved → execution');
 // other engineer cannot see the project
 await as('eng2','projects');ok(!(await pg.locator(`[data-r="project-${id}"]`).count()),' 13 second engineer cannot see unassigned project');
 await as('eng2','project-'+id);ok((await pg.locator(".content").innerText()).length<2000&&!(await has('[data-act="logWork"]')),' 13 second engineer blocked by direct link');
 // 14) execution — eng daily + labor + mreq
 await go('eng1',id);await click('[data-act="logWork"]');const qi=pg.locator('#sheet input[data-k^="q."]');ok(await qi.count()>=4,' 14 daily form has BOQ rows '+(await qi.count()));
 await qi.nth(0).fill('100');await qi.nth(2).fill('300');await pg.fill('#sheet [data-k="notes"]','دق 100 بوست وتركيب 300 لوح').catch(()=>{});await btn('حفظ');
 s=await ST();ok(Object.values(s.dlogs).some(d=>d.project===id&&d.kind==='work'),' 14 daily work saved');
 await click('[data-act="logLabor"]');await btn('حفظ');s=await ST();ok(Object.values(s.dlogs).some(d=>d.project===id&&d.kind==='labor'),' 14 labor saved');
 // over-budget quantity rejected, then overrun requested from inside the error
 await click('[data-act="logWork"]');await qi.nth(1).fill('999999');await btn('حفظ');ok(await sheetOpen()&&(await shErr()).length>0,' 14 over-budget quantity blocked: '+(await shErr()).slice(0,60));
 if(await pg.locator('#sheet [data-act="reqOverrun"]').count()){await pg.locator('#sheet [data-act="reqOverrun"]').click();await pg.waitForTimeout(200);await pg.fill('#sheet [data-k="extra"]','5');await pg.fill('#sheet [data-k="reason"]','زيادة تربة صخرية');await btn('إرسال');s=await ST();ok(Object.values(s.overruns).some(o=>o.project===id&&o.status==='pgm'),' 14 overrun request raised')}else{ok(false,' 14 no overrun button in error');await closeSheet()}
 await go('eng1',id);await click('[data-act="newMreq"]');const mi=pg.locator('#sheet input[data-k^="q."]');ok(await mi.count()>3,' 15 mreq lists budget materials');
 await mi.nth(0).fill('50');await mi.nth(1).fill('1');await btn('إرسال');s=await ST();const mr=Object.values(s.mreqs).find(m=>m.project===id);ok(mr&&mr.status==='pgm',' 15 material request sent to PGM');
 // 15) PGM approves mreq + overrun → GM approves overrun
 await as('pgm','home');ok(await has('[data-act="reviewMreq"]'),' 15 PGM inbox has mreq');
 await go('pgm',id,'materials');await click(`[data-act="reviewMreq"][data-id="${mr.id}"]`);await btn('اعتماد');s=await ST();ok(s.mreqs[mr.id].status==='approved',' 15 mreq approved');
 await as('pgm','home');if(await has('[data-act="reviewOverrun"]')){await click('[data-act="reviewOverrun"]');await btn('موافقة');await as('gm','home');await click('[data-act="reviewOverrun"]');await btn('اعتماد');s=await ST();ok(Object.values(s.overruns).some(o=>o.project===id&&o.status==='approved'),' 15 overrun approved PGM→GM')}else ok(false,' 15 PGM no overrun task');
 // 16) store issues what's in stock; creates PR for shortage
 await as('store','home');ok(await has(`[data-act="fulfillMreq"][data-id="${mr.id}"]`),' 16 store inbox has the request');
 await click(`[data-act="fulfillMreq"][data-id="${mr.id}"]`);const cbs=pg.locator('#sheet input[type=checkbox]');for(let i=0;i<await cbs.count();i++)await cbs.nth(i).check();await btn('تنفيذ');
 s=await ST();const iss=Object.values(s.issues).filter(x=>x.mreq===mr.id);const prs=Object.values(s.prs).filter(x=>x.mreq===mr.id||x.project===id);console.log('   issues',iss.length,'prs',prs.length,'mreq status',s.mreqs[mr.id].status);
 ok(iss.length+prs.length>0,' 16 store fulfilled (issue/transfer or PR)');
 // engineer confirms receipt on site
 await as('eng1','home');let c=0;while(await has('[data-act="confirmIssue"]')&&c<5){await click('[data-act="confirmIssue"]');c++}
 s=await ST();ok(Object.values(s.issues).filter(x=>x.mreq===mr.id).every(x=>x.status==='received'||x.status==='confirmed'||x.receivedAt),' 16 engineer confirmed site receipt ('+c+')');
 // 17) PR chain: store raises manual PR for the project → PGM → finance → GM → PO
 await as('store','purchasing');await click('[data-act="newPR"]');await pg.selectOption('#sheet [data-k="project"]',id);await pg.waitForTimeout(150);
 const pq=pg.locator('#sheet [data-k="lines.0.qty"]');if(await pq.count())await pq.fill('40');
 const sp=pg.locator('#sheet [data-k="supplierId"]');if(await sp.count()){const o=await sp.locator('option').nth(1).getAttribute('value');if(o)await sp.selectOption(o)}
 await btn('رفع الطلب');s=await ST();const pr=Object.values(s.prs).filter(x=>x.project===id).sort((a,b)=>b.at.localeCompare(a.at))[0];ok(pr&&pr.status==='pgm',' 17 PR raised '+(pr?.code||''));
 if(pr){
  await notSee('store',id,'reviewPR','store');
  await as('pgm','purchasing');await click(`[data-act="reviewPR"][data-id="${pr.id}"]`);
  const sup=pg.locator('#sheet [data-k="supplierId"]');if(await sup.count()&&!(await sup.inputValue())){const o=await sup.locator('option').nth(1).getAttribute('value');await sup.selectOption(o)}
  await btn('موافقة');s=await ST();ok(s.prs[pr.id].status==='fin',' 17 PGM approved PR → finance ('+s.prs[pr.id].status+')');
  await as('finance','purchasing');await click(`[data-act="reviewPR"][data-id="${pr.id}"]`);await btn('موافقة');s=await ST();ok(['gm','po'].includes(s.prs[pr.id].status),' 17 finance matched supplier → '+s.prs[pr.id].status);
  if(s.prs[pr.id].status==='gm'){await as('gm','purchasing');await click(`[data-act="reviewPR"][data-id="${pr.id}"]`);await btn('اعتماد');s=await ST()}
  ok(s.prs[pr.id].status==='po'&&s.prs[pr.id].poNo,' 17 PO issued '+s.prs[pr.id].poNo);
  // PO pdf
  await as('store','purchasing');
  // 18) receive at site → PGM approves site GRN
  await click(`[data-act="newGrn"][data-id="${pr.id}"]`);await btn('تسجيل');s=await ST();const g=Object.values(s.grns).find(x=>x.poId===pr.id);ok(g,' 18 GRN recorded '+(g?.code||'')+' status '+g?.status);
  if(g&&g.status==='pgm'){await as('pgm','home');await click(`[data-act="approveSiteGrn"]`);await btn('اعتماد');s=await ST();ok(s.grns[g.id].status!=='pgm',' 18 PGM approved site receipt → '+s.grns[g.id].status)}
  // 19) finance books supplier invoice, requests payment → GM approves → finance transfers
  await as('finance','finance');await click('[data-act="ftab"][data-k="supp"]');
  if(await has(`[data-act="invoiceGrn"][data-id="${g.id}"]`)){await click(`[data-act="invoiceGrn"][data-id="${g.id}"]`);await pg.fill('#sheet [data-k="no"]','SUP-INV-900');await btn('إصدار ومطابقة');s=await ST();ok(s.grns[g.id].invoice,' 19 supplier invoice booked')}else ok(false,' 19 no invoiceGrn button');
  if(await has('[data-act="reqSupPay"]')){await click(`[data-act="reqSupPay"][data-grn="${g.id}"]`);await btn('رفع');s=await ST();const sp1=Object.values(s.spay).find(x=>x.grnId===g.id);ok(sp1,' 19 supplier payment requested → '+sp1?.status);
   if(sp1&&sp1.status==='gm'){await as('gm','home');await click(`[data-act="reviewSupPay"][data-id="${sp1.id}"]`);await btn('اعتماد');s=await ST();ok(s.spay[sp1.id].status==='approved',' 19 GM approved supplier payment')}
   await as('finance','finance');await click('[data-act="ftab"][data-k="spay"]');const tb=vis('[data-act="execSupPay"]');if(await tb.count()){await tb.first().click();await pg.waitForTimeout(200);await pg.fill('#sheet [data-k="ref"]','TRF-E2E-1');await btn('تسجيل التحويل');s=await ST();ok(s.spay[sp1.id].status==='paid',' 19 finance transferred payment → '+s.spay[sp1.id].status)}else ok(false,' 19 no transfer button in spay tab')}else ok(false,' 19 no reqSupPay button');
 }
 // 21) finance direct cost
 await go('finance',id);await click('[data-act="addCost"]');await pg.fill('#sheet [data-k="amount"]','3500');await pg.fill('#sheet [data-k="desc"]','نقل معدات');await btn('حفظ');s=await ST();ok(Object.values(s.costs).some(c=>c.project===id&&c.amount===3500),' 21 direct cost saved');
 // 22) return materials
 await go('eng1',id);if(await has('[data-act="newReturn"]')){await click('[data-act="newReturn"]');const rq=pg.locator('#sheet input[data-k^="q."]');if(await rq.count()){await rq.first().fill('1');await btn('إرسال');s=await ST();const rt=Object.values(s.returns).find(r=>r.project===id);ok(rt,' 22 return note sent');if(rt){await as('store','home');await click(`[data-act="receiveReturn"][data-id="${rt.id}"]`);s=await ST();ok(s.returns[rt.id].status!=='pending',' 22 store received return')}}else{ok(true,' 22 nothing on site to return');await closeSheet()}}
 // 23) project pages render for every role that can see it
 for(const un of ['gm','pgm','finance','tech','eng1','store','admin']){await as(un,'project-'+id);const tabs=await vis('[data-act="ptab"]').evaluateAll(es=>es.map(e=>e.dataset.k));for(const t of tabs){await click(`[data-act="ptab"][data-k="${t}"]`)}const txt=await pg.locator(".content").innerText();const leak=(un==='eng1'||un==='store')&&/ر\.س|﷼|SAR/.test(txt.replace(/الأسعار/g,''));ok(!leak,`23 ${un} project tabs [${tabs.join(',')}] no money leak`)}

 const doClaims=async(tag)=>{await as('finance','finance');let ic=vis(`[data-act="issueClaim"][data-id="${id}"]`);const cnt=await ic.count();if(tag!=='R')ok(cnt>0,' 20 '+tag+' claims due ('+cnt+')');let k=0;
  while(await vis(`[data-act="issueClaim"][data-id="${id}"]`).count()&&k<6){k++;await vis(`[data-act="issueClaim"][data-id="${id}"]`).first().click();await pg.waitForTimeout(200);await pg.fill('#sheet [data-k="no"]','INV-E2E-'+tag+k);await btn('إصدار');let s=await ST();const cl=Object.values(s.claims).find(x=>x.invoiceNo==='INV-E2E-'+tag+k);ok(cl,' 20 claim issued '+cl?.label+' '+cl?.total);
   if(cl){await click(`[data-act="payClaim"][data-id="${cl.id}"]`);await btn('تسجيل');s=await ST();ok(s.claims[cl.id].status==='paid',' 20 collection recorded → '+s.claims[cl.id].status)}}};
 // 24) handover → PGM → GM close
 await go('eng1',id);await click('[data-act="submitHandover"]');await btn('تقديم');ok(await stage(id)==='handover_review',' 24 handover submitted');
 await notSee('eng1',id,'approveHandover','engineer');
 await go('pgm',id);await click('[data-act="approveHandover"]');ok(await stage(id)==='close_review',' 24 PGM approved handover');
 await doClaims('H');
 await notSee('pgm',id,'closeProject','PGM');
 await go('gm',id);await click('[data-act="closeProject"]');ok(await stage(id)==='closed',' 24 GM closed project');
 await doClaims('R');
 s=await ST();const cls=Object.values(s.claims).filter(c=>c.project===id);const tot=cls.reduce((a,c)=>a+c.total,0);const qt=s.projects[id].quote;console.log('   claims',cls.length,'sum',tot.toFixed(2));const ctv=await pg.evaluate(id=>window.__npi?.qTotals?window.__npi.qTotals(JSON.parse(localStorage.getItem('npi-local-v1')).projects[id].quote).total:null,id);if(ctv!=null)ok(Math.abs(ctv-tot)<1,' 20 billed total = contract value '+ctv);ok(cls.length===(s.projects[id].contract.schedule||[]).length,' 20 every milestone billed ('+cls.length+'/'+(s.projects[id].contract.schedule||[]).length+')');
 // 25) all documents for the project build as PDF previews
 await go('gm',id,'docs');const dl=await vis('[data-act="doc"]').count();let bad=0;
 for(let i=0;i<dl;i++){await vis('[data-act="doc"]').nth(i).click();await pg.waitForTimeout(700);const okDoc=await pg.locator('#sheet canvas,#sheet img').count();if(!okDoc){bad++;console.log('   doc failed',i,await shErr())}await closeSheet()}
 ok(bad===0,' 25 all '+dl+' project documents render');
 // 26) log, audit
 s=await ST();ok((s.projects[id].log||[]).length>=15,' 26 project log has '+(s.projects[id].log||[]).length+' entries');
 await as('gm','admin');await pg.waitForTimeout(1500);await as('gm','admin');s=await ST();const ae=Object.values(s.audit||{}).flatMap(d=>d.e||d.entries||[d]);ok(ae.filter(e=>(e.id||e.recordId||e.record_id)===id||JSON.stringify(e).includes(id)).length>5,' 26 audit trail for project: '+ae.filter(e=>e.id===id).length);
 console.log(TAG,'ERRORS',errs.length?errs:'none');console.log('TOTAL',n,'FAILS',fails);if(fails||errs.length)process.exitCode=1;await b.close();try{srv.kill()}catch(e){}if(fails)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
function N(v){return +v||0}
