const {chromium}=require('playwright');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
const U='file://'+require('path').join(__dirname,'..','index.html');
let fails=0;const check=(c,m)=>{console.log(c?'PASS':'FAIL',m);if(!c)fails++};
const FAKE=()=>{window.__npiFakeSample=Object.assign(async function(input,opts){const plan=JSON.parse(localStorage.getItem('fakePlan')||'[]');window.__lastSample={n:input.length,first:input[0].content.slice(0,3000),last:input[input.length-1].content,tools:(opts.tools||[]).map(t=>t.name)};localStorage.setItem('lastSample',JSON.stringify(window.__lastSample));const out=[];for(const st of plan){const t=(opts.tools||[]).find(x=>x.name===st.tool);if(!t){out.push('NO_TOOL:'+st.tool);continue}try{const r=await t.execute(st.args,{signal:new AbortController().signal});out.push(JSON.stringify(r).slice(0,300))}catch(e){out.push('Error: '+e.message)}}opts.onText&&opts.onText({text:'…',delta:'…'});return{text:'نتيجة: '+out.join(' | ')}},{limits:async()=>({maxPromptBytes:262144,tools:{maxCount:20},images:{maxCount:1,maxInputBytes:5e6,mediaTypes:['image/jpeg','image/png']}})})};
(async()=>{
 const b=await chromium.launch();
 for(const [vw,vh,tag] of [[1366,860,'lap'],[390,844,'mob']]){
 const ctx=await b.newContext({viewport:{width:vw,height:vh}});await ctx.addInitScript(FAKE);const pg=await ctx.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errs.push(m.text())});
 await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
 const as=async(un,hash='home')=>{const m=Object.values(seed.team).find(t=>t.username===un)||(await pg.evaluate(un=>Object.values(JSON.parse(localStorage.getItem('npi-local-v1')).team).find(t=>t.username===un),un));await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto(U+'#'+hash);await pg.reload();await pg.waitForTimeout(300)};
 const st=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('npi-local-v1')));
 const sheetBtn=async l=>{await pg.locator('#sheet footer button',{hasText:l}).first().click();await pg.waitForTimeout(300)};
 const shErr=async()=>{if(await pg.locator('#sheet .alert.bad').count())console.log('  SHEET ERR:',await pg.locator('#sheet .alert.bad').innerText())};
 const ovf=async(name)=>{const o=await pg.evaluate(()=>{const W=document.documentElement.clientWidth;const bad=[];if(document.documentElement.scrollWidth>W+1)bad.push('PAGE '+document.documentElement.scrollWidth);document.querySelectorAll('#sheet .sh,.ai-panel').forEach(s=>{if(s.scrollWidth>s.clientWidth+1)bad.push('PANEL '+s.className+' '+s.scrollWidth)});return bad});check(!o.length,tag+' no overflow '+name+' '+o.join(','))};
 // ---- dashboard
 await as('gm','home');
 check((await pg.locator('.dash-h h1').innerText())==='لوحة المعلومات',tag+' dashboard title');
 check((await pg.locator('.dash-h .erp').innerText()).includes('ERP'),tag+' ERP subtitle');
 const qas=await pg.locator('.qa b').allInnerTexts();console.log('  tiles:',qas.join(' | '));
 check(['عميل محتمل جديد','عميل جديد','فرصة جديدة','أمر عمل جديد','أمر شراء جديد','مستحقات الموردين','الفواتير'].every(x=>qas.includes(x)),tag+' all 7 quick actions for GM');
 check(await pg.locator('.sbar').count()>=10&&await pg.locator('.cash>div').count()===4,tag+' stage bars & cash flow');
 check((await pg.locator('.card h3',{hasText:'مهام المتابعة'}).count())===1,tag+' follow-up panel');
 await ovf('gm-home');await pg.screenshot({path:`out6/${tag}-dash.png`,fullPage:true});
 // invoices tile -> finance claims
 await pg.locator('.qa',{hasText:'مستحقات الموردين'}).click();await pg.waitForTimeout(250);check(await pg.locator('[data-act="ftab"][data-k="supp"].on').count()===1,tag+' supplier dues tile opens finance/supp');
 await as('gm','home');
 // new opportunity
 await pg.locator('.qa',{hasText:'فرصة جديدة'}).click();await pg.waitForTimeout(150);check((await pg.locator('#sheet h2,#sheet header').first().innerText()).includes('فرصة جديدة'),tag+' opportunity sheet');
 await pg.fill('#sheet [data-k="client.name"]','مزارع الواحة '+tag);await pg.fill('#sheet [data-k="client.phone"]','0551112222');await pg.fill('#sheet [data-k="client.site"]','الأحساء');await sheetBtn('حفظ');await shErr();
 let s=await st();const op=Object.values(s.projects).find(p=>p.client?.name==='مزارع الواحة '+tag);check(op&&op.stage==='study'&&op.neg==='accepted',tag+' opportunity created at study stage');
 // work order
 await as('gm','home');await pg.locator('.qa',{hasText:'أمر عمل جديد'}).click();await pg.waitForTimeout(150);
 await pg.fill('#sheet [data-k="title"]','فحص العاكس الرئيسي');await pg.selectOption('#sheet [data-k="project"]','pdemo4');await pg.waitForTimeout(100);await sheetBtn('إنشاء');await shErr();
 s=await st();const wo=Object.values(s.ftasks).find(t=>t.title==='فحص العاكس الرئيسي');check(wo&&/^WO-\d{4}-\d{3}$/.test(wo.code)&&wo.assignee===seed.team.u0005.id,tag+' work order coded & assigned to engineer '+(wo&&wo.code));
 // eng sees it, toggles done
 await as('eng1','home');check(await pg.locator('.task.ft',{hasText:'فحص العاكس الرئيسي'}).count()===1,tag+' engineer sees work order');
 await pg.locator('.task.ft',{hasText:'فحص العاكس الرئيسي'}).locator('input[type=checkbox]').click();await pg.waitForTimeout(300);
 s=await st();check(Object.values(s.ftasks).find(t=>t.title==='فحص العاكس الرئيسي').status==='done',tag+' engineer completes it');
 check((await pg.locator('.qa b').allInnerTexts()).every(x=>!['مستحقات الموردين','الفواتير'].includes(x)),tag+' eng has no money tiles');
 check(await pg.locator('.sbars').count()===0,tag+' eng sees no financial dashboard');
 await ovf('eng-home');
 // project overview shows tasks
 await as('gm','project-pdemo4');check(await pg.locator('.card h3',{hasText:'مهام المتابعة وأوامر العمل'}).count()===1,tag+' project shows follow-up tasks');
 // ---- admin
 await as('gm','admin');const at=await pg.locator('.tabs button').allInnerTexts();check(at.length===5,tag+' admin tabs '+at.join('|'));await ovf('admin-users');await pg.screenshot({path:`out6/${tag}-admin-users.png`});
 for(const k of ['roles','matrix','org','audit']){await pg.click(`[data-act="atab"][data-k="${k}"]`);await pg.waitForTimeout(150);await ovf('admin-'+k);await pg.screenshot({path:`out6/${tag}-admin-${k}.png`,fullPage:tag==='lap'})}
 check(await pg.locator('table tbody tr').count()>3,tag+' audit has entries');
 // custom role
 await pg.click('[data-act="atab"][data-k="roles"]');await pg.click('[data-act="editRole"]:not([data-id])');await pg.waitForTimeout(150);await ovf('role-sheet');
 await pg.fill('#sheet [data-k="name"]','مشرف موقع');await pg.selectOption('#sheet [data-k="base"]','eng');await pg.waitForTimeout(150);
 await pg.locator('#sheet [data-k="pm.view_pipeline"]').check();await sheetBtn('حفظ');await shErr();
 s=await st();const rk=Object.entries(s.meta.roles.defs).find(([k,v])=>v.name==='مشرف موقع');check(rk&&rk[1].perms.includes('view.pipeline')&&rk[1].base==='eng',tag+' custom role saved');
 // matrix: PGM can approve supplier payments; PR limit 200k
 await pg.click('[data-act="atab"][data-k="matrix"]');await pg.click('[data-act="editMatrix"]');await pg.waitForTimeout(150);await ovf('matrix-sheet');
 await pg.locator('#sheet [data-k="st.spay.pgm"]').check();await pg.fill('#sheet [data-k="prGmAbove"]','200000');await sheetBtn('حفظ');await shErr();
 s=await st();check(s.meta.matrix.steps.spay.includes('pgm')&&s.meta.matrix.prGmAbove===200000,tag+' matrix saved');
 // user with custom role
 await pg.click('[data-act="atab"][data-k="users"]');await pg.locator('.toolbar [data-act="editMember"]').click();await pg.waitForTimeout(150);
 await pg.fill('#sheet [data-k="name"]','سعيد المشرف');await pg.selectOption('#sheet [data-k="role"]',rk[0]);await pg.fill('#sheet [data-k="username"]','super'+tag);await pg.fill('#sheet [data-k="pw"]','Temp1234');await sheetBtn('حفظ');await shErr();
 // last admin protection: try demoting self
 await pg.locator('table [data-act="editMember"]').first().click().catch(()=>{});
 await pg.evaluate(()=>{});
 await pg.click('#sheet footer .ghost').catch(()=>{});
 // fin approves PR under limit -> PO directly
 await as('finance','purchasing');await pg.locator('[data-act="reviewPR"]:visible').first().click();await pg.waitForTimeout(150);await sheetBtn('موافقة');await shErr();
 s=await st();const pr2=Object.values(s.prs).find(x=>x.code==='PR-2026-002');check(pr2.status==='po'&&pr2.poNo&&pr2.autoGm,tag+' PR within limit becomes PO after finance ('+pr2.status+' '+pr2.poNo+')');
 // pgm sees spay approval capability (task list built from matrix)
 await as('pgm','finance');await pg.click('[data-act="ftab"][data-k="spay"]').catch(()=>{});
 // system admin user
 await as('admin','home');const nav=await pg.locator('.nav a span').allInnerTexts();check(nav.includes('الإدارة'),tag+' admin user sees الإدارة: '+nav.join('|'));
 await as('admin','admin');check(await pg.locator('.tabs button').count()===5,tag+' admin user has all admin tabs');
 // store blocked from admin
 await as('store','admin');check((await pg.locator('.state h1').innerText().catch(()=>'')).includes('غير متاحة'),tag+' store blocked from admin');
 // ---- AI assistant
 await as('pgm','home');check(await pg.locator('.ai-fab').count()===1,tag+' AI button visible');
 await pg.click('.ai-fab');await pg.waitForTimeout(150);await ovf('ai-panel');
 await pg.evaluate(()=>localStorage.setItem('fakePlan',JSON.stringify([{tool:'create_lead',args:{client_name:'مؤسسة الريان للزراعة',phone:'0551234567',site:'الخرج',project_name:'منظومة 3 آبار',notes:'يحتاج تشغيل 3 آبار'}}])));
 await pg.fill('#aiIn','سجّل عميل محتمل: مؤسسة الريان للزراعة، جوال 0551234567، الموقع الخرج');await pg.click('.ai-in button[type=submit]');await pg.waitForTimeout(600);
 const ls=await pg.evaluate(()=>JSON.parse(localStorage.getItem('lastSample')));check(ls.first.includes('مدير عام المشاريع')&&ls.tools.includes('create_lead')&&!ls.tools.includes('log_daily_work'),tag+' AI gets role context & role tools: '+ls.tools.join(','));
 check(await pg.locator('.ai-card.pending').count()===1,tag+' AI prepared a confirm card');
 s=await st();check(!Object.values(s.projects).some(p=>p.client?.name==='مؤسسة الريان للزراعة'),tag+' nothing saved before confirm');
 await pg.screenshot({path:`out6/${tag}-ai-card.png`});
 await pg.click('.ai-card [data-act="aiRun"]');await pg.waitForTimeout(400);
 s=await st();const ai1=Object.values(s.projects).find(p=>p.client?.name==='مؤسسة الريان للزراعة');check(ai1&&ai1.stage==='lead'&&ai1.clientId,tag+' AI lead saved after confirm');
 check(await pg.locator('.ai-card.done').count()===1,tag+' card marked done');
 // eng: daily log through AI, with over-budget rejection
 await as('eng1','home');await pg.click('.ai-fab');
 await pg.evaluate(()=>localStorage.setItem('fakePlan',JSON.stringify([{tool:'log_daily_work',args:{project:'NPI-2026-004',entries:[{boq:'تركيب الألواح',qty:50},{boq:'تنفيذ الكهرباء',qty:200}],notes:'تركيب ومد كابلات',obstacles:'تأخر الكابلات'}},{tool:'log_daily_work',args:{project:'NPI-2026-004',entries:[{boq:'ماكينة الدق',qty:5}]}},{tool:'create_client',args:{name:'x'}}])));
 await pg.fill('#aiIn','إنجاز اليوم: ألواح 50 وكهرباء 200');await pg.click('.ai-in button[type=submit]');await pg.waitForTimeout(600);
 const txt=await pg.locator('.ai-m.assistant').last().innerText();check(txt.includes('Error')&&txt.includes('NO_TOOL:create_client'),tag+' over-budget rejected & no client tool for eng');
 const ls2=await pg.evaluate(()=>JSON.parse(localStorage.getItem('lastSample')));check(ls2.first.includes('لا يرى الأسعار'),tag+' AI told eng has no money');
 await pg.screenshot({path:`out6/${tag}-ai-eng.png`});await ovf('ai-eng');
 await pg.click('.ai-card [data-act="aiRun"]');await pg.waitForTimeout(400);
 s=await st();const dl=Object.values(s.dlogs).find(d=>d.ai&&d.kind==='work');check(dl&&dl.entries.length===2,tag+' AI daily log saved');
 // store: PR via AI
 await as('store','home');await pg.click('.ai-fab');
 await pg.evaluate(()=>localStorage.setItem('fakePlan',JSON.stringify([{tool:'create_purchase_request',args:{lines:[{item:'موصل',qty:500}],note:'نواقص'}}])));
 await pg.fill('#aiIn','اطلب شراء 500 موصل');await pg.click('.ai-in button[type=submit]');await pg.waitForTimeout(600);
 const t3=await pg.locator('.ai-m.assistant').last().innerText();if(!(await pg.locator('.ai-card.pending').count()))console.log('  store result:',t3);
 if(await pg.locator('.ai-card.pending').count()){await pg.click('.ai-card [data-act="aiRun"]');await pg.waitForTimeout(400)}
 s=await st();check(Object.values(s.prs).some(x=>x.ai&&x.status==='pgm'),tag+' AI purchase request raised');
 // mic fallback note
 await pg.click('[data-act="aiMic"]');await pg.waitForTimeout(300);
 // audit captured AI writes
 await as('gm','admin');await pg.waitForTimeout(1500);await pg.click('[data-act="atab"][data-k="audit"]');await pg.waitForTimeout(200);
 s=await st();const ae=Object.values(s.audit).flatMap(d=>d.e);check(ae.some(e=>e.a==='create'&&e.c==='projects'),tag+' audit has project create ('+ae.length+' entries)');
 check(ae.some(e=>e.a==='update'&&e.c==='prs'&&e.f.some(f=>f[0]==='الحالة')),tag+' audit has field diff');
 // logout clears chat
 console.log(tag,'ERRORS',errs);await ctx.close()}
 await b.close();console.log('FAILS',fails)})();
