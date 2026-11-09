const {chromium}=require('playwright');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1360,height:900}});const pg=await ctx.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errs.push(m.text())});
 await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 await pg.goto('file://'+require('path').join(__dirname,'..','index.html'));
 const role=r=>Object.values(seed.team).find(m=>m.role===r).id;
 await pg.evaluate(([s])=>{localStorage.setItem('npi-local-v1',JSON.stringify(s))},[seed]);
 const as=async(r,hash='home')=>{const m=Object.values(seed.team).find(t=>t.role===r);await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto('file://'+require('path').join(__dirname,'..','index.html')+'#'+hash);await pg.reload();await pg.waitForTimeout(300)};
 const shot=async n=>pg.screenshot({path:n+'.png',fullPage:false});
 const click=async sel=>{await pg.click(sel);await pg.waitForTimeout(150)};
 const sheetBtn=async label=>{await pg.locator('#sheet footer button',{hasText:label}).first().click();await pg.waitForTimeout(250)};
 const err=async()=>{const e=await pg.locator('#sheet .alert.bad').count();if(e){console.log('SHEET ERR:',await pg.locator('#sheet .alert.bad').innerText())}};
 const P=n=>Object.values(seed.projects).find(p=>p.code===n).id;
 await as('gm');await shot('01-gm-home');
 // GM approve budget B
 await as('gm','project-'+P('NPI-2026-002'));await shot('02-gm-budget');
 await click('[data-act="approveBudget"]');await sheetBtn('اعتماد');await err();
 // PGM accept quote
 await as('pgm','project-'+P('NPI-2026-002'));await shot('03-pgm-quote');
 await click('[data-act="acceptQuote"]');await pg.fill('#sheet [data-k="ref"]','خطاب 55');await sheetBtn('ترحيل');await err();
 await as('gm','project-'+P('NPI-2026-002'));await click('[data-act="approveContract"]');
 await as('pgm','project-'+P('NPI-2026-002'));await click('[data-act="assignEng"]');await sheetBtn('تعيين');await err();
 await as('fin','home');await shot('04-fin-home');
 await click('[data-act="finSetup"]');await pg.check('#sheet [data-k="adv"]');await sheetBtn('حفظ');await err();
 let st=await pg.evaluate(id=>JSON.parse(localStorage.getItem('npi-local-v1')).projects[id].stage,P('NPI-2026-002'));console.log('stage after setup',st);
 await as('eng','project-'+P('NPI-2026-002'));await click('[data-act="editPlan"]');await shot('05-plan-sheet');await sheetBtn('حفظ');await err();await click('[data-act="submitPlan"]');
 await as('pgm','project-'+P('NPI-2026-002'));await click('[data-act="approvePlan"]');
 st=await pg.evaluate(id=>JSON.parse(localStorage.getItem('npi-local-v1')).projects[id].stage,P('NPI-2026-002'));console.log('stage after plan',st);
 // ENG daily log on D
 await as('eng','project-'+P('NPI-2026-004'));await shot('06-eng-exec');
 await click('[data-act="logWork"]');
 const inp=pg.locator('#sheet input[data-k^="q."]');await inp.nth(3).fill('50');await inp.nth(2).fill('99999');await sheetBtn('حفظ');await err();
 await inp.nth(2).fill('');await sheetBtn('حفظ');await err();
 await click('[data-act="logLabor"]');await sheetBtn('حفظ');await err();
 await click('[data-act="newMreq"]');await pg.locator('#sheet input[data-k^="q."]').nth(1).fill('1');await sheetBtn('إرسال');await err();
 // PGM approve mreqs
 await as('pgm','home');await shot('07-pgm-home');
 while(await pg.locator('[data-act="reviewMreq"]').count()){await pg.locator('[data-act="reviewMreq"]').first().click();await pg.waitForTimeout(150);await sheetBtn('اعتماد');}
 // PR chain
 await as('fin','purchasing');await shot('08-fin-purch');await click('[data-act="reviewPR"]');await sheetBtn('موافقة');await err();
 await as('gm','purchasing');await click('[data-act="reviewPR"]');await shot('09-gm-pr');await sheetBtn('اعتماد');await err();
 // store
 await as('store','home');await shot('10-store-home');
 await pg.locator('[data-act="fulfillMreq"]').first().click();await pg.waitForTimeout(150);await shot('11-fulfill');
 const cb=pg.locator('#sheet input[type=checkbox]');for(let i=0;i<await cb.count();i++)await cb.nth(i).check();
 await sheetBtn('تنفيذ');await err();
 await pg.locator('[data-act="newGrn"]').first().click();await pg.waitForTimeout(150);await sheetBtn('تسجيل');await err();
 await as('store','stock');await shot('12-stock');
 await as('eng','home');while(await pg.locator('[data-act="confirmIssue"]').count()){await pg.locator('[data-act="confirmIssue"]').first().click();await pg.waitForTimeout(200)}
 await as('eng','project-'+P('NPI-2026-004'));await click('[data-act="newReturn"]');await pg.locator('#sheet input[data-k^="q."]').first().fill('5');await sheetBtn('إرسال');await err();
 await as('store','home');await click('[data-act="receiveReturn"]');
 await as('fin','finance');await shot('13-finance');
 const ic=pg.locator('[data-act="issueClaim"]');console.log('claims due',await ic.count());
 if(await ic.count()){await ic.first().click();await pg.fill('#sheet [data-k="no"]','INV-77');await sheetBtn('إصدار');await err();await click('[data-act="payClaim"]');await sheetBtn('تسجيل');await err();}
 await click('[data-act="ftab"][data-k="supp"]');const ig=pg.locator('[data-act="invoiceGrn"]');if(await ig.count()){await ig.first().click();await pg.fill('#sheet [data-k="no"]','SUP-1');await sheetBtn('إصدار');await err()}
 // project D tabs screenshots
 await as('pgm','project-'+P('NPI-2026-004'));
 for(const k of ['overview','budget','contract','exec','materials','cost','claims','plan','labor']){await click(`[data-act="ptab"][data-k="${k}"]`);await shot('20-D-'+k)}
 // handover
 await as('eng','project-'+P('NPI-2026-004'));await click('[data-act="submitHandover"]');await sheetBtn('تقديم');await err();
 await as('pgm','project-'+P('NPI-2026-004'));await click('[data-act="approveHandover"]');
 await as('gm','project-'+P('NPI-2026-004'));await click('[data-act="closeProject"]');
 st=await pg.evaluate(id=>JSON.parse(localStorage.getItem('npi-local-v1')).projects[id].stage,P('NPI-2026-004'));console.log('D stage',st);
 // lead flow
 await as('pgm','pipeline');await shot('30-pipeline');await click('[data-act="newLead"]');await pg.fill('#sheet [data-k="client.name"]','عميل اختبار');await pg.fill('#sheet [data-k="client.phone"]','0500000000');await pg.fill('#sheet [data-k="client.site"]','الخبر');await sheetBtn('حفظ');await err();
 await click('[data-act="setNeg"][data-v="accepted"]');await click('[data-act="startBudget"]');await sheetBtn('متابعة');await pg.waitForTimeout(300);await shot('31-budget-editor');await sheetBtn('حفظ');await err();await click('[data-act="submitBudget"]');
 await as('gm','cycle');await shot('32-cycle');await as('gm','settings');await shot('33-settings');
 // mobile
 await pg.setViewportSize({width:390,height:844});await as('eng','home');await shot('40-m-eng-home');await as('pgm','project-'+P('NPI-2026-003'));await shot('41-m-project');await as('pgm','projects');await shot('42-m-projects');
 await click('[data-act="drawer"]');await shot('43-m-drawer');
 const ov=await pg.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);console.log('h-overflow mobile',ov);
 await pg.emulateMedia({colorScheme:'dark'});await pg.setViewportSize({width:1360,height:900});await as('gm','project-'+P('NPI-2026-004'));await shot('50-dark');
 const hr=await pg.evaluate(async(id)=>{try{const T=window.__npi;const r=await T.DOCS.handover(id);await r.d.finish();return r.d.pages[0].c.toDataURL('image/png')}catch(e){return 'ERR '+e.message}},P('NPI-2026-004'));require('fs').writeFileSync('out/handover.png',Buffer.from(hr.split(',')[1],'base64'));console.log('ERRORS',errs);await b.close();
})();
