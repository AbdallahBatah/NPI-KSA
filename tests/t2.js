const {chromium}=require('playwright');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
const U='file://'+require('path').join(__dirname,'..','index.html');
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1360,height:900}});const pg=await ctx.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errs.push(m.text())});
 await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 const check=(c,msg)=>console.log((c?'PASS ':'FAIL ')+msg);
 // 1. empty -> setup
 await pg.goto(U);await pg.waitForTimeout(300);
 check(await pg.locator('#setupForm').count()===1,'empty system shows setup page');await pg.screenshot({path:'a1-setup.png'});
 await pg.fill('#suName','مدير تجربة');await pg.fill('#suUser','boss');await pg.fill('#suPass','short');await pg.fill('#suPass2','short');await pg.click('#setupForm button[type=submit]');await pg.waitForTimeout(200);
 check(await pg.locator('#lgErr').isVisible(),'weak password rejected');
 await pg.fill('#suPass','Strong123');await pg.fill('#suPass2','Strong123');await pg.click('#setupForm button[type=submit]');await pg.waitForTimeout(400);
 check(await pg.locator('.rail').count()===1,'setup creates GM and logs in');
 // 2. load seed, login page
 await pg.evaluate(s=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);await pg.goto(U+'#home');await pg.reload();await pg.waitForTimeout(300);
 check(await pg.locator('#loginForm').count()===1,'login page shown');await pg.screenshot({path:'a2-login.png'});
 await pg.fill('#lgUser','gm');await pg.fill('#lgPass','wrong');await pg.click('#loginForm button[type=submit]');await pg.waitForTimeout(300);
 check((await pg.locator('#lgErr').innerText()).includes('غير صحيحة'),'wrong password error');await pg.screenshot({path:'a3-login-err.png'});
 await pg.fill('#lgPass','Npi@2026');await pg.click('#loginForm button[type=submit]');await pg.waitForTimeout(400);
 check(await pg.locator('.rail').count()===1,'gm login works');
 const as=async(un,hash='home')=>{const m=Object.values(seed.team).find(t=>t.username===un);await pg.evaluate(m=>{sessionStorage.clear();localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)}))},m);await pg.goto(U+'#'+hash);await pg.reload();await pg.waitForTimeout(300)};
 const sheetBtn=async label=>{await pg.locator('#sheet footer button',{hasText:label}).first().click();await pg.waitForTimeout(300)};
 const err=async()=>{if(await pg.locator('#sheet .alert.bad').count())console.log('  SHEET ERR:',await pg.locator('#sheet .alert.bad').innerText())};
 const P=n=>Object.values(seed.projects).find(p=>p.code===n).id;
 // 3. GM creates user with temp password -> forced change
 await as('gm','admin');await pg.click('.toolbar [data-act="editMember"]:not([data-id])');await pg.waitForTimeout(150);
 await pg.fill('#sheet [data-k="name"]','م. سامي');await pg.fill('#sheet [data-k="username"]','eng1');await pg.fill('#sheet [data-k="pw"]','Temp1234');await sheetBtn('حفظ');
 check((await pg.locator('#sheet .alert.bad').innerText().catch(()=>'')).includes('مستخدم لموظف آخر'),'duplicate username rejected');
 await pg.fill('#sheet [data-k="username"]','sami');await sheetBtn('حفظ');await err();
 await pg.evaluate(()=>{localStorage.removeItem('npi-sess')});await pg.reload();await pg.waitForTimeout(300);
 await pg.fill('#lgUser','sami');await pg.fill('#lgPass','Temp1234');await pg.click('#loginForm button[type=submit]');await pg.waitForTimeout(400);
 check(await pg.locator('#forceForm').count()===1,'temp password forces change');await pg.screenshot({path:'a4-force.png'});
 await pg.fill('#fcPass','MyNewPass9');await pg.fill('#fcPass2','MyNewPass9');await pg.click('#forceForm button[type=submit]');await pg.waitForTimeout(400);
 check(await pg.locator('.rail').count()===1,'new password saved, logged in');
 await pg.goto(U+'#profile');await pg.waitForTimeout(300);await pg.screenshot({path:'a5-profile.png'});
 // 4. eng restrictions
 await as('eng1','finance');check((await pg.locator('.state h1').innerText().catch(()=>'')).includes('غير متاحة'),'eng blocked from finance');
 await as('eng1','project-'+P('NPI-2026-003'));check((await pg.locator('.state h1').innerText().catch(()=>'')).includes('صلاحية'),'eng blocked from other project');
 await as('eng1','project-'+P('NPI-2026-004'));
 const tabs=await pg.locator('.tabs button').allInnerTexts();check(!tabs.some(t=>/عرض السعر|العقد|المستخلصات|التكلفة/.test(t)),'eng tabs hide money: '+tabs.join('|'));
 check(!(await pg.locator('#content').innerText()).includes('ر.س'),'eng project page shows no SAR amounts');await pg.screenshot({path:'a6-eng-project.png'});
 await pg.click('[data-act="ptab"][data-k="budget"]');await pg.waitForTimeout(150);check(!(await pg.locator('#content').innerText()).includes('ر.س'),'eng budget tab no money');
 await pg.click('[data-act="ptab"][data-k="labor"]');await pg.waitForTimeout(150);check(!(await pg.locator('#content').innerText()).includes('التكلفة'),'eng labor hides cost');
 // delete log
 await pg.click('[data-act="ptab"][data-k="exec"]');await pg.waitForTimeout(150);
 await pg.click('[data-act="logWork"]');await pg.waitForTimeout(150);await pg.locator('#sheet input[data-k^="q."]').nth(2).fill('10');await sheetBtn('حفظ');await err();
 const n1=await pg.locator('[data-act="delLog"]').count();check(n1===1,'only fresh own log deletable ('+n1+')');
 await pg.click('[data-act="delLog"]');await pg.waitForTimeout(150);await sheetBtn('حذف');
 check(await pg.locator('[data-act="delLog"]').count()===0,'log deleted');
 // 5. store: transfer, no prices
 await as('store','purchasing');check(!(await pg.locator('#content').innerText()).includes('ر.س'),'store purchasing no money');
 await as('store','stock');await pg.click('[data-act="newTransfer"]');await pg.waitForTimeout(150);await pg.screenshot({path:'a7-transfer.png'});
 await pg.locator('#sheet input[data-k^="q."]').first().fill('10');await sheetBtn('إصدار');await err();
 await as('eng1','home');const ci=await pg.locator('[data-act="confirmIssue"]').count();check(ci===1,'eng sees transfer to confirm');
 if(ci){await pg.click('[data-act="confirmIssue"]');await pg.waitForTimeout(300)}
 // 6. supplier payment chain
 await as('finance','finance');await pg.click('[data-act="ftab"][data-k="supp"]');await pg.waitForTimeout(150);
 await pg.click('[data-act="reqSupPay"]');await pg.waitForTimeout(150);await sheetBtn('رفع');await err();
 await as('gm','home');check(await pg.locator('[data-act="reviewSupPay"]').count()===1,'gm gets payment approval task');
 await pg.click('[data-act="reviewSupPay"]');await pg.waitForTimeout(150);await sheetBtn('اعتماد');
 await as('finance','home');await pg.click('[data-act="execSupPay"]');await pg.waitForTimeout(150);await sheetBtn('تسجيل');
 check((await pg.locator('#sheet .alert.bad').innerText().catch(()=>'')).includes('مرجع'),'payment requires transfer ref');
 await pg.fill('#sheet [data-k="ref"]','TRF-1');await sheetBtn('تسجيل');await err();
 await pg.goto(U+'#finance');await pg.waitForTimeout(200);await pg.click('[data-act="ftab"][data-k="spay"]');await pg.waitForTimeout(150);await pg.screenshot({path:'a8-spay.png'});
 check((await pg.locator('#content').innerText()).includes('مدفوعة'),'payment marked paid');
 // 7. purchasing PO advance
 await pg.goto(U+'#purchasing');await pg.waitForTimeout(200);check(await pg.locator('[data-act="reqSupPay"]').count()>=1,'fin can request PO advance');
 // 8. logout
 await pg.goto(U+'#profile');await pg.waitForTimeout(200);await pg.click('.ph [data-act="logout"]');await pg.waitForTimeout(300);check(await pg.locator('#loginForm').count()===1,'logout returns to login');
 // 9. 404
 await as('pgm','nothing-here');check((await pg.locator('.state h1').innerText().catch(()=>'')).includes('غير موجودة'),'404 page');
 // mobile login
 await pg.evaluate(()=>localStorage.removeItem('npi-sess'));await pg.setViewportSize({width:390,height:844});await pg.reload();await pg.waitForTimeout(300);await pg.screenshot({path:'a9-m-login.png'});
 await pg.emulateMedia({colorScheme:'dark'});await pg.setViewportSize({width:1360,height:900});await pg.reload();await pg.waitForTimeout(300);await pg.screenshot({path:'a10-dark-login.png'});
 console.log('ERRORS',errs);await b.close();
})();
