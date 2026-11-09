// Alternative paths: real login form, first login, lost lead, rejected / revised quote, stock shortage → PR → PO → GRN → issue,
// returned handover, custom role user doing engineer work, matrix change routing supplier payment to PGM.
const {chromium}=require('playwright');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
const U='file://'+require('path').join(__dirname,'..','index.html');
const VW=+(process.argv[2]||1366),VH=+(process.argv[3]||860),TAG=VW<700?'mob':'lap';
let fails=0,n=0;const ok=(c,m)=>{n++;console.log(c?'PASS':'FAIL',TAG,m);if(!c)fails++};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:VW,height:VH}});const pg=await ctx.newPage();
 let cur='';const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @'+cur));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errs.push('CONSOLE '+m.text()+' @'+cur)});
 await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
 const ST=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('npi-local-v1')));
 const who={};Object.values(seed.team).forEach(m=>who[m.username]=m);
 const vis=sel=>pg.locator(sel+':visible');const has=async sel=>(await vis(sel).count())>0;
 const click=async(sel,i=0)=>{const l=vis(sel);if(!(await l.count())){ok(false,'missing '+sel+' @'+cur);return false}await l.nth(i).click();await pg.waitForTimeout(220);return true};
 const shErr=async()=>(await pg.locator('#sheet .alert.bad').count())?await pg.locator('#sheet .alert.bad').first().innerText():'';
 const btn=async label=>{const l=pg.locator('#sheet footer button',{hasText:label});if(!(await l.count())){ok(false,`no sheet button «${label}» @${cur}: `+(await pg.locator('#sheet footer button').allInnerTexts()).join('|'));return}await l.first().click();await pg.waitForTimeout(300);const e=await shErr();if(e&&await pg.locator('#sheet .sh').count())console.log('   SHEET ERR',cur,'→',e)};
 const logout=async()=>{await pg.evaluate(()=>{localStorage.removeItem('npi-sess');sessionStorage.removeItem('npi-sess')});await pg.goto(U+'#home');await pg.reload();await pg.waitForTimeout(250)};
 const login=async(u,p)=>{cur='login '+u;await pg.fill('#lgUser',u);await pg.fill('#lgPass',p);await pg.locator('#loginForm button[type=submit], form.auth button[type=submit]').first().click();await pg.waitForTimeout(500)};
 const as=async(un,hash='home')=>{cur=un+'@'+hash;const s=await ST();const m=Object.values(s.team).find(t=>t.username===un);await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto(U+'#'+hash);await pg.reload();await pg.waitForTimeout(250);if(await pg.locator('#forceForm').count()){await pg.fill('#fcPass','Changed2026x');await pg.fill('#fcPass2','Changed2026x');await pg.locator('#forceForm button[type=submit]').click();await pg.waitForTimeout(500);await pg.goto(U+'#'+hash);await pg.reload();await pg.waitForTimeout(250)}};
 const stage=async id=>(await ST()).projects[id]?.stage;

 // ---- A. real login form
 await logout();ok(await pg.locator('#lgUser').count()===1,'A login screen shown when signed out');
 await login('pgm','wrongpass1');ok(!(await pg.locator('#lgErr').isHidden()),'A wrong password rejected: '+(await pg.locator('#lgErr').innerText()));
 await login('PGM ','Npi@2026');ok(await pg.locator('.dash-h h1').count()===1,'A login works (username case/space tolerant)');
 ok((await pg.locator('.me, .rail').first().innerText()).includes('مدير عام المشاريع'),'A rail shows role');
 if(VW<900)await click('[data-act="drawer"]');await click('[data-act="logout"]');ok(await pg.locator('#lgUser').count()===1,'A logout returns to login');
 // suspended user
 await as('gm','admin');await pg.locator(`[data-act="editMember"][data-id="${who.eng2.id}"]:visible`).first().click();await pg.waitForTimeout(150);await pg.locator('#sheet [data-k="active"]').uncheck();await btn('حفظ');
 await logout();await login('eng2','Npi@2026');ok(!(await pg.locator('#lgErr').isHidden())&&await pg.locator('#lgUser').count()===1,'A suspended user cannot log in: '+(await pg.locator('#lgErr').innerText().catch(()=>'')));
 // new user → first login forces password change
 await as('gm','admin');await click('.toolbar [data-act="editMember"]');await pg.fill('#sheet [data-k="name"]','م. رامي الدوسري');await pg.selectOption('#sheet [data-k="role"]','eng');await pg.fill('#sheet [data-k="username"]','rami');await pg.fill('#sheet [data-k="pw"]','Temp2026x');await btn('حفظ');
 await logout();await login('rami','Temp2026x');ok(await pg.locator('#forceForm').count()===1,'A first login forces new password');
 await pg.fill('#fcPass','short');await pg.fill('#fcPass2','short');await pg.locator('#forceForm button[type=submit]').click();await pg.waitForTimeout(250);ok(!(await pg.locator('#lgErr').isHidden()),'A weak password rejected');
 await pg.fill('#fcPass','Rami2026new');await pg.fill('#fcPass2','Rami2026new');await pg.locator('#forceForm button[type=submit]').click();await pg.waitForTimeout(500);ok(await pg.locator('.dash-h h1').count()===1,'A new password accepted → dashboard');
 await logout();await login('rami','Rami2026new');ok(await pg.locator('.dash-h h1').count()===1,'A logs in with the new password');
 // profile password change
 await pg.goto(U+'#profile');await pg.waitForTimeout(250);ok((await pg.locator('.content').innerText()).includes('رامي'),'A profile page shows the user');

 // ---- B. lost lead + reopen
 const p1='pdemo1';await as('pgm','project-'+p1);await click('[data-act="setNeg"][data-v="rejected"]');if(await pg.locator('#sheet .sh').count()){const r=pg.locator('#sheet [data-k="reason"]');if(await r.count())await r.fill('السعر مرتفع');await pg.locator('#sheet footer button').first().click();await pg.waitForTimeout(300)}
 ok(await stage(p1)==='lost','B lead rejected → lost');
 await as('pgm','pipeline');
 await as('pgm','project-'+p1);await click('[data-act="reopenLead"]');ok(await stage(p1)==='lead','B lost lead reopened');

 // ---- C. quote revised then rejected
 const p3='pdemo3';await as('pgm','project-'+p3);await click('[data-act="reviseQuote"]');await pg.locator('#sheet footer button').first().click();await pg.waitForTimeout(300);ok(await stage(p3)==='budget','C quote revision → back to budget ('+await stage(p3)+')');
 await click('[data-act="submitBudget"]');await as('gm','project-'+p3);await click('[data-act="approveBudget"]');await btn('اعتماد');let s=await ST();ok(s.projects[p3].stage==='quote','C re-approved → new quote '+s.projects[p3].quote?.no+' v'+(s.projects[p3].budget?.version||''));
 await as('pgm','project-'+p3);await click('[data-act="rejectQuote"]');await pg.fill('#sheet [data-k="reason"]','اختار منافساً');await btn('إغلاق الفرصة');ok(await stage(p3)==='lost','C client rejected quote → lost');

 // ---- E. site transfer between execution projects (if any) & stock adjust
 await as('store','stock');ok((await pg.locator('.content').innerText()).length>200,'E stock page renders');
 // ---- F. handover returned then resubmitted
 {const p4='pdemo4';
 await as('eng1','project-'+p4);await click('[data-act="submitHandover"]');await btn('تقديم');ok(await stage(p4)==='handover_review','F handover submitted');
 await as('pgm','project-'+p4);await click('[data-act="returnHandover"]');await pg.fill('#sheet [data-k="note"]','صور التأريض ناقصة');await btn('إعادة');ok(await stage(p4)==='execution','F PGM returned handover');
 await as('eng1','project-'+p4);ok((await pg.locator('.alert.warn').allInnerTexts()).join().includes('التأريض'),'F engineer sees handover note');
 await click('[data-act="submitHandover"]');await btn('تقديم');await as('pgm','project-'+p4);await click('[data-act="approveHandover"]');ok(await stage(p4)==='close_review','F resubmitted & approved');
 // GM returns at close review
 await as('gm','project-'+p4);await click('[data-act="returnHandover"]');await pg.fill('#sheet [data-k="note"]','تأكد من المستخلص الأخير');await btn('إعادة');ok(await stage(p4)!=='closed','F GM can return at close review → '+await stage(p4));
 }
 // ---- G. custom role (base engineer) assigned to a project and working
 await as('gm','admin');await click('[data-act="atab"][data-k="roles"]');await click('[data-act="editRole"]:not([data-id])');await pg.fill('#sheet [data-k="name"]','مشرف موقع');await pg.selectOption('#sheet [data-k="base"]','eng');await pg.waitForTimeout(150);await btn('حفظ');
 s=await ST();const rk=Object.entries(s.meta.roles.defs).find(([k,v])=>v.name==='مشرف موقع')[0];
 await click('[data-act="atab"][data-k="users"]');await click('.toolbar [data-act="editMember"]');await pg.fill('#sheet [data-k="name"]','سعيد المشرف');await pg.selectOption('#sheet [data-k="role"]',rk);await pg.fill('#sheet [data-k="username"]','saeed');await pg.fill('#sheet [data-k="pw"]','Saeed2026x');await btn('حفظ');
 s=await ST();const sid=Object.values(s.team).find(t=>t.username==='saeed').id;
 // the opportunity created in B (pdemo1) → push it to setup quickly through state to test assignment list
 await as('pgm','project-pdemo2');
 s=await ST();ok(s.projects.pdemo2.stage==='budget_review','G pdemo2 at budget review');
 await as('gm','project-pdemo2');await click('[data-act="approveBudget"]');await btn('اعتماد');await as('pgm','project-pdemo2');await click('[data-act="acceptQuote"]');await pg.fill('#sheet [data-k="ref"]','بريد 3');await btn('ترحيل');await as('gm','project-pdemo2');await click('[data-act="approveContract"]');
 await as('pgm','project-pdemo2');await click('[data-act="assignEng"]');const opts=await pg.locator('#sheet [data-k="eng"] option').allInnerTexts();ok(opts.some(o=>o.includes('سعيد')),'G custom engineer-type role appears in engineer list');
 await pg.selectOption('#sheet [data-k="eng"]',sid);await btn('تعيين');
 await as('finance','home');await click('[data-act="finSetup"]');const adv=pg.locator('#sheet [data-k="adv"]');if(await adv.count())await adv.check();await btn('حفظ');
 await as('saeed','project-pdemo2');ok(await has('[data-act="editPlan"]'),'G custom-role user can plan his project');
 await click('[data-act="editPlan"]');await btn('حفظ');await click('[data-act="submitPlan"]');ok((await ST()).projects.pdemo2.plan.status==='submitted','G plan submitted by custom-role user');
 await as('saeed','home');ok(!(await pg.locator('.qa b',{hasText:'الفواتير'}).count()),'G custom role hides money tiles');
 // ---- D. shortage: engineer requests more than store holds → PR → PO → receive → issue
 const p4='pdemo2';await as('pgm','project-'+p4);await click('[data-act="approvePlan"]');ok(await stage(p4)==='execution','D plan approved → execution');s=await ST();
 const av=await pg.evaluate(()=>0);
 await as('saeed','project-'+p4);await click('[data-act="newMreq"]');
 const rows=await pg.locator('#sheet tbody tr').evaluateAll(trs=>trs.map(tr=>tr.innerText.replace(/\s+/g,' ')));
 // choose the cable 70mm row (index by name)
 const idx=rows.findIndex(r=>/ألواح|الواح/.test(r));const inp=pg.locator('#sheet input[data-k^="q."]');
 const remTxt=rows[idx];console.log('   row',remTxt);
 await inp.nth(idx).fill('500');await btn('إرسال');s=await ST();const mr=Object.values(s.mreqs).filter(m=>m.project===p4).sort((a,b)=>b.at.localeCompare(a.at))[0];ok(mr&&mr.status==='pgm','D material request sent '+mr?.code);
 await as('pgm','home');await click(`[data-act="reviewMreq"][data-id="${mr.id}"]`);await btn('اعتماد');
 await as('store','home');await click(`[data-act="fulfillMreq"][data-id="${mr.id}"]`);
 const fr=await pg.locator('#sheet tbody tr').first().innerText();console.log('   fulfil row',fr.replace(/\s+/g,' '));
 const buy=pg.locator('#sheet input[data-k^="buy."]');ok(await buy.count()===1,'D shortage offered for purchase');
 if(await buy.count())await buy.check();await btn('تنفيذ');s=await ST();
 const spr=Object.values(s.prs).find(x=>x.mreq===mr.id);ok(spr&&spr.status==='pgm','D shortage PR raised '+spr?.code+' qty '+spr?.lines?.[0]?.qty);
 ok(['partial','issued'].includes(s.mreqs[mr.id].status),'D mreq status '+s.mreqs[mr.id].status);
 await as('pgm','purchasing');await click(`[data-act="reviewPR"][data-id="${spr.id}"]`);const sup=pg.locator('#sheet [data-k="supplierId"]');if(await sup.count()){const o=await sup.locator('option').nth(1).getAttribute('value');await sup.selectOption(o);await pg.waitForTimeout(120)}
 await btn('موافقة');await as('finance','purchasing');await click(`[data-act="reviewPR"][data-id="${spr.id}"]`);await btn('موافقة');s=await ST();
 if(s.prs[spr.id].status==='gm'){await as('gm','purchasing');await click(`[data-act="reviewPR"][data-id="${spr.id}"]`);await btn('اعتماد');s=await ST()}
 ok(s.prs[spr.id].status==='po','D PO issued '+s.prs[spr.id].poNo);
 await as('store','purchasing');await click(`[data-act="newGrn"][data-id="${spr.id}"]`);await btn('تسجيل');s=await ST();const g=Object.values(s.grns).find(x=>x.poId===spr.id);ok(g&&s.prs[spr.id].status==='received','D received in main store '+g?.code+' → '+s.prs[spr.id].status);
 await as('store','home');ok(await has(`[data-act="fulfillMreq"][data-id="${mr.id}"]`),'D request back in store inbox after receipt');
 if(await has(`[data-act="fulfillMreq"][data-id="${mr.id}"]`)){await click(`[data-act="fulfillMreq"][data-id="${mr.id}"]`);await btn('تنفيذ');s=await ST();ok(s.mreqs[mr.id].status==='issued','D remaining quantity issued → '+s.mreqs[mr.id].status)}
 await as('saeed','home');let c=0;while(await has('[data-act="confirmIssue"]')&&c<6){await click('[data-act="confirmIssue"]');c++}ok(c>=1,'D engineer confirmed '+c+' issue(s)');
 // ---- H. matrix change: supplier payments approved by PGM instead of GM
 await as('gm','admin');await click('[data-act="atab"][data-k="matrix"]');await click('[data-act="editMatrix"]');await pg.locator('#sheet [data-k="st.spay.pgm"]').check();await pg.locator('#sheet [data-k="st.spay.gm"]').uncheck();await btn('حفظ');
 s=await ST();ok(JSON.stringify(s.meta.matrix.steps.spay)==='["pgm"]','H matrix: supplier payments → PGM only');
 await as('finance','finance');await click('[data-act="ftab"][data-k="supp"]');const rq=vis('[data-act="reqSupPay"]');ok(await rq.count()>0,'H finance can request a supplier payment');
 if(await rq.count()){await rq.first().click();await pg.waitForTimeout(200);await btn('رفع');s=await ST();const sp=Object.values(s.spay).sort((a,b)=>b.at.localeCompare(a.at))[0];ok(sp.status==='gm','H payment pending approval');
  await as('gm','home');ok(!(await has(`[data-act="reviewSupPay"][data-id="${sp.id}"]`)),'H GM no longer gets the payment task');
  await as('pgm','home');ok(await has(`[data-act="reviewSupPay"][data-id="${sp.id}"]`),'H PGM gets the payment task');
  await click(`[data-act="reviewSupPay"][data-id="${sp.id}"]`);await btn('اعتماد');s=await ST();ok(s.spay[sp.id].status==='approved','H PGM approved payment')}
 // ---- I. admin cannot remove last user-admin; system admin account works
 await as('admin','admin');ok(await pg.locator('.tabs button').count()===5,'I system admin sees admin tabs');
 await pg.locator(`[data-act="editMember"][data-id="${who.admin.id}"]:visible`).first().click();await pg.waitForTimeout(150);await pg.selectOption('#sheet [data-k="role"]','store');await btn('حفظ');ok((await shErr()).includes('حسابك'),'I admin cannot demote himself: '+(await shErr()).slice(0,50));await pg.keyboard.press('Escape');
 console.log(TAG,'ERRORS',errs.length?errs:'none');console.log('TOTAL',n,'FAILS',fails);await b.close();
})();
