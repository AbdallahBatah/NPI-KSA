// Company master data (seed/company.json → the app): an administrator loads the company's users, items and suppliers
// with one action; existing records are not duplicated; users get one-time temporary passwords and must change them.
const {chromium,TEST_URL:U}=require('./support/browser');const fs=require('fs');const path=require('path');
const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'..','seed','seed.json')));
const company=JSON.parse(fs.readFileSync(path.join(__dirname,'..','seed','company.json')));
let fails=0,n=0;const ok=(c,m)=>{n++;console.log(c?'PASS':'FAIL',m);if(!c)fails++};
(async()=>{
 const sync=require('child_process').spawnSync('python3',[path.join(__dirname,'..','tools','sync-company.py'),'--check']);
 ok(sync.status===0,'app source carries the same data as seed/company.json '+(sync.stderr||'').toString().trim());
 ok(company.users.length===8&&company.items.length===20&&company.suppliers.length===11,'company file: 8 users, 20 items, 11 suppliers');
 ok(!JSON.stringify(company).match(/pass|pw|salt/i),'company file holds no passwords');
 const b=await chromium.launch();
 for(const [vw,vh,tag] of [[1366,860,'lap'],[390,844,'mob']]){
  const ctx=await b.newContext({viewport:{width:vw,height:vh}});const pg=await ctx.newPage();
  const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
  const ST=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('npi-local-v1')));
  const as=async(un,h='home')=>{const m=Object.values(seed.team).find(t=>t.username===un);await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto(U.replace('?e2e=1','?e2e=1#'+h));await pg.reload();await pg.waitForTimeout(300)};
  const vis=sel=>pg.locator(sel+':visible');
  const btn=async label=>{const l=pg.locator('#sheet footer button',{hasText:label});if(!(await l.count())){ok(false,`${tag} no sheet button «${label}»: `+(await pg.locator('#sheet footer button').allInnerTexts()).join('|'));return}await l.first().click();await pg.waitForTimeout(450)};
  const ovf=async name=>{const o=await pg.evaluate(()=>{const W=document.documentElement.clientWidth;const bad=[];if(document.documentElement.scrollWidth>W+1)bad.push('page');document.querySelectorAll('#sheet .sh').forEach(s=>{if(s.scrollWidth>s.clientWidth+1)bad.push(s.className)});return bad});ok(!o.length,`${tag} no overflow ${name} ${o}`)};
  // who is offered the load
  for(const un of ['pgm','finance','store','eng1']){await as(un,'home');if(await pg.locator('[data-company]').count()||await vis('[data-act="loadCompany"]').count())ok(false,`${tag} ${un} must not be offered the company load`)}
  ok(true,`${tag} only administrators are offered the company load`);
  await as('gm','home');const note=pg.locator('[data-company]');
  ok(await note.count()===1&&(await note.innerText()).includes('8 مستخدم')&&(await note.innerText()).includes('14 صنف')&&(await note.innerText()).includes('8 مورد'),`${tag} dashboard offers what is missing: ${(await note.innerText().catch(()=>'')).replace(/\s+/g,' ')}`);await ovf('home');
  await note.locator('[data-act="loadCompany"]').click();await pg.waitForTimeout(300);
  const txt=await pg.locator('#sheet').innerText();ok(txt.includes('عمار الصريطى')&&txt.includes('mohammed.dawood')&&txt.includes('كابلات 16 مم')&&txt.includes('شركة بحرا للكابلات')&&!txt.includes('كابلات 70 مم'),`${tag} review lists new records only (existing 70 mm cable not repeated)`);await ovf('review');
  await btn('تحميل البيانات');await pg.locator('#sheet code[data-pw]').first().waitFor({timeout:8000});
  const creds=await pg.locator('#sheet .cred').evaluateAll(rs=>rs.map(r=>[r.querySelector('b').innerText.trim(),r.querySelector('.faint').innerText.replace(/^[\s—]+/,'').trim(),r.querySelector('code[data-un]').innerText.trim(),r.querySelector('code[data-pw]').innerText.trim()]));
  ok(creds.length===8&&creds.every(c=>/^Npi-[a-z]{5}\d{4}$/.test(c[3]))&&new Set(creds.map(c=>c[3])).size===8,`${tag} eight one-time temporary passwords shown`);await ovf('passwords');
  let s=await ST();const emp=company.users.map(u=>s.team[u.id]);
  ok(emp.every(m=>m&&m.mustChange===true&&m.active===true&&m.passHash&&m.salt&&m.password===undefined&&m.pw===undefined)&&emp[1].role==='pgm'&&emp[6].role==='store',`${tag} users stored with hashed passwords and forced change`);
  ok(!JSON.stringify(s).includes(creds[0][3]),`${tag} temporary passwords are not stored anywhere`);
  ok(Object.keys(s.items).length===27&&s.items.ic16?.name==='كابلات 16 مم'&&s.items.ic16.unit==='م ط'&&s.items.iinv315.serial===true&&s.items.ipnl.cost===319&&s.items.ipnl.name===seed.items.ipnl.name,`${tag} 14 items added, existing items untouched`);
  ok(Object.keys(s.suppliers).length===12&&s.suppliers.sbahra?.name==='شركة بحرا للكابلات'&&s.suppliers.slongi.name===seed.suppliers.slongi.name,`${tag} 8 suppliers added, existing suppliers untouched`);
  await btn('تم');await as('gm','home');ok(await pg.locator('[data-company]').count()===0,`${tag} dashboard notice disappears once loaded`);
  await as('gm','settings');await vis('[data-act="settab"][data-k="data"]').first().click();await pg.waitForTimeout(200);
  ok((await pg.locator('.content').innerText()).includes('كلها موجودة')&&await pg.locator('.content [data-act="loadCompany"]').isDisabled(),`${tag} settings show everything is present`);
  await as('gm','admin');ok((await pg.locator('.content').innerText()).includes('م. عمار الصريطى')&&!(await vis('.toolbar [data-act="loadCompany"]').count()),`${tag} users appear in the admin list`);
  await as('gm','stock');await vis('[data-act="stockAdjust"]').first().click();await pg.waitForTimeout(250);ok(await pg.locator('#sheet [data-k="itemId"] option[value="ibat16"]').count()===1,`${tag} new items are available to stock screens`);await pg.keyboard.press('Escape');
  // a company user signs in with the temporary password and is forced to change it
  const ammar=creds.find(c=>c[2]==='ammar');await pg.evaluate(()=>{localStorage.removeItem('npi-sess');sessionStorage.removeItem('npi-sess')});await pg.goto(U.replace('?e2e=1','?e2e=1#home'));await pg.reload();await pg.locator('#loginForm').waitFor();
  await pg.fill('#lgUser','ammar');await pg.fill('#lgPass','wrong-pass1');await pg.locator('#loginForm button[type=submit]').click();await pg.waitForTimeout(500);ok(await pg.locator('#loginForm').count()===1,`${tag} wrong password is refused`);
  await pg.fill('#lgUser','ammar');await pg.fill('#lgPass',ammar[3]);await pg.locator('#loginForm button[type=submit]').click();await pg.locator('#forceForm').waitFor({timeout:8000});
  ok(true,`${tag} temporary password works once and demands a new one`);
  await pg.fill('#fcPass','Ammar2026x');await pg.fill('#fcPass2','Ammar2026x');await pg.locator('#forceForm button[type=submit]').click();await pg.locator('.dash-h h1').waitFor({timeout:8000});
  const hello=await pg.locator('.dash-h .sub').innerText();ok(hello.includes('مرحباً عمار')&&hello.includes('مدير عام المشاريع'),`${tag} signed in as the project manager: ${hello.replace(/\s+/g,' ').slice(0,70)}`);
  ok(await vis('[data-act="newLead"]').count()>0&&await pg.locator('[data-company]').count()===0,`${tag} project manager gets his own actions, not the company load`);
  s=await ST();ok(s.team.emp02.mustChange===false||s.team.emp02.mustChange===undefined,`${tag} forced change cleared after the new password`);
  // a person already in the system under the same name is not created twice
  await pg.waitForTimeout(1600); // let the audit flush finish before replacing storage
  await pg.evaluate(s=>{const x=JSON.parse(JSON.stringify(s));x.team.old1={id:'old1',name:'محمد سعد',username:'msaad',role:'gm',active:true,salt:'s',passHash:'h'.repeat(64)};localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(x))},seed);
  await as('gm','home');ok((await pg.locator('[data-company]').innerText()).includes('7 مستخدم'),`${tag} existing person with the same name is skipped`);
  ok(!errs.length,`${tag} no page errors ${errs.join(' ; ')}`);await ctx.close()}
 await b.close();console.log('TOTAL',n,'FAILS',fails);if(fails)process.exitCode=1})();
