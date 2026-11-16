// Dropdown lists (cities, units, combos) + assistant plan UI at laptop and phone sizes (local preview mode).
const {chromium,TEST_URL:U}=require('./support/browser');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
let fails=0,n=0;const ok=(c,m)=>{n++;console.log(c?'PASS':'FAIL',m);if(!c)fails++};
const FAKE=()=>{window.__npiFakeSample=Object.assign(async function(input,opts){const plan=JSON.parse(localStorage.getItem('fakePlan')||'[]');const out=[];for(const st of plan){const t=(opts.tools||[]).find(x=>x.name===st.tool);if(!t){out.push('NO_TOOL:'+st.tool);continue}try{out.push('OK:'+JSON.stringify(await t.execute(st.args,{})).slice(0,300))}catch(e){out.push('ERR:'+e.message)}}localStorage.setItem('fakeOut',JSON.stringify(out));return{text:'جهّزت الخطة.'}},{limits:async()=>({tools:{maxCount:20}})})};
(async()=>{
 const b=await chromium.launch();
 for(const [vw,vh,tag] of [[1366,860,'lap'],[390,844,'mob']]){
  const ctx=await b.newContext({viewport:{width:vw,height:vh}});await ctx.addInitScript(FAKE);const pg=await ctx.newPage();
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
  const ST=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('npi-local-v1')));
  const as=async(un,h='home')=>{const m=Object.values(seed.team).find(t=>t.username===un);await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto(U.replace('?e2e=1','?e2e=1#'+h));await pg.reload();await pg.waitForTimeout(250)};
  const ovf=async name=>{const o=await pg.evaluate(()=>{const W=document.documentElement.clientWidth;const bad=[];if(document.documentElement.scrollWidth>W+1)bad.push('page');document.querySelectorAll('#sheet .sh,.ai-panel').forEach(s=>{if(s.scrollWidth>s.clientWidth+1)bad.push(s.className)});return bad});ok(!o.length,`${tag} no overflow ${name} ${o}`)};
  // --- lead form: city dropdown grouped by region, "other" turns into free text ---
  await as('pgm','pipeline');await pg.locator('[data-act="newLead"]:visible').first().click();await pg.waitForTimeout(150);
  const city=pg.locator('#sheet select[data-k="client.city"]');ok(await city.count()===1,`${tag} lead form has a city dropdown`);
  ok(await city.locator('optgroup').count()===13,`${tag} cities grouped in 13 regions`);
  ok(await pg.locator('#sheet select[data-k="client.idPlace"]').count()===1,`${tag} ID issue place is a city dropdown`);
  await pg.fill('#sheet [data-k="client.name"]','مزارع النخبة '+tag);await pg.fill('#sheet [data-k="client.phone"]','0551231234');
  await pg.locator('#sheet footer .btn').first().click();await pg.waitForTimeout(200);
  ok((await pg.locator('#sheet .alert.bad').innerText().catch(()=>'')).includes('المدينة'),`${tag} city is required`);
  await city.selectOption('__other');await pg.waitForTimeout(100);
  ok(await pg.locator('#sheet input[data-k="client.city"]').count()===1,`${tag} "other" switches to a text box`);
  await pg.fill('#sheet input[data-k="client.city"]','هجرة الصفاء');
  await pg.selectOption('#sheet select[data-k="client.idType"]','سجل تجاري رقم');await pg.waitForTimeout(100);
  ok(await pg.locator('#sheet [data-k="client.city"]').evaluate(e=>e.value)==='هجرة الصفاء',`${tag} custom city kept after redraw`);
  await pg.locator('#sheet select[data-k="client.city"], #sheet input[data-k="client.city"]').first().evaluate(()=>{});
  // choose a listed city instead
  if(await pg.locator('#sheet select[data-k="client.city"]').count())await pg.selectOption('#sheet select[data-k="client.city"]','بريدة');else{await pg.fill('#sheet input[data-k="client.city"]','بريدة')}
  await pg.selectOption('#sheet select[data-k="client.idPlace"]','الرياض');await ovf('lead-sheet');
  await pg.locator('#sheet footer .btn').first().click();await pg.waitForTimeout(300);
  let s=await ST();const lp=Object.values(s.projects).find(p=>p.client?.name==='مزارع النخبة '+tag);ok(lp&&lp.client.city==='بريدة'&&lp.client.idPlace==='الرياض',`${tag} lead saved with city & issue place`);
  ok(Object.values(s.clients).some(c=>c.name==='مزارع النخبة '+tag&&c.city==='بريدة'),`${tag} client record carries the city`);
  // --- filters by city ---
  await as('pgm','clients');const cf=pg.locator('#flt-clients-city');ok(await cf.count()===1,`${tag} clients list has a city filter`);
  await cf.selectOption('بريدة');await pg.waitForTimeout(200);
  const names=await pg.locator('.content').innerText();ok(names.includes('مزارع النخبة')&&!names.includes('مؤسسة مثال للتجارة'),`${tag} city filter narrows the list`);
  await cf.selectOption('');
  await as('pgm','pipeline');ok(await pg.locator('#flt-pipeline-city').count()===1,`${tag} pipeline has a city filter`);
  await as('pgm','projects');ok(await pg.locator('#flt-projects-city').count()===1,`${tag} projects have a city filter`);
  ok((await pg.locator('.content').innerText()).includes('القويعية'),`${tag} project list shows the city`);
  // --- other lists ---
  await as('store','stock');await pg.locator('[data-act="stab"][data-k="items"]:visible').first().click().catch(()=>{});await pg.locator('[data-act="editItem"]:visible').first().click();await pg.waitForTimeout(150);
  ok(await pg.locator('#sheet select[data-k="unit"] option').count()>=15,`${tag} unit is a dropdown`);await pg.keyboard.press('Escape');
  await as('tech','project-pdemo1');
  await as('gm','admin');await pg.locator('[data-act="atab"][data-k="org"]:visible').first().click();await pg.locator('[data-act="editCompany"]:visible').first().click();await pg.waitForTimeout(150);
  ok(await pg.locator('#sheet select[data-k="city"]').count()===1&&await pg.locator('#sheet input[data-k="repTitle"][list]').count()===1,`${tag} company city dropdown + title suggestions`);await ovf('company-sheet');await pg.keyboard.press('Escape');
  await as('finance','project-pdemo4');await pg.locator('[data-act="addCost"]:visible').first().click();await pg.waitForTimeout(150);
  const dl=await pg.locator('#sheet input[data-k="desc"]').getAttribute('list');ok(dl&&await pg.locator(`#sheet datalist#${dl} option`).count()>=10,`${tag} cost description suggestions`);await pg.keyboard.press('Escape');
  // --- assistant plan UI: chained steps, partial failure stops the rest, phone layout ---
  await as('pgm','home');ok(await pg.locator('.qa[data-voice]').count()===1,`${tag} dashboard has the voice tile`);
  await pg.locator('.qa[data-voice]').click();await pg.waitForTimeout(250);
  ok(await pg.locator('.ai-panel').count()===1,`${tag} voice tile opens the assistant`);
  await pg.evaluate(()=>localStorage.setItem('fakePlan',JSON.stringify([
    {tool:'workflow_action',args:{action:'client_accepted_quote',project:'NPI-2026-003',ref:'خطاب 9'}},
    {tool:'workflow_action',args:{action:'approve_budget',project:'NPI-2026-002'}},
    {tool:'workflow_action',args:{action:'submit_budget',project:'NPI-2026-001'}},
    {tool:'create_lead',args:{client_name:'شركة الأفق',phone:'0500000099',city:'خميس مشيط'}}])));
  if(await pg.locator('.ai-rec').count())await pg.click('[data-act="aiMicCancel"]');
  await pg.fill('#aiIn','العميل وافق، واعتمد موازنة 002، وارفع موازنة 001، وسجل شركة الأفق');await pg.click('.ai-in button[type=submit]');await pg.waitForTimeout(600);
  const out=await pg.evaluate(()=>JSON.parse(localStorage.getItem('fakeOut')));
  ok(out[1].startsWith('ERR')&&out[1].includes('ليس من صلاحيات'),`${tag} PGM cannot plan GM's budget approval`);
  ok(await pg.locator('.ai-plan li').count()===3,`${tag} plan lists 3 allowed steps`);
  ok((await pg.locator('.ai-plan li').nth(1).innerText()).includes('غير متاح'),`${tag} step not yet available is flagged`);
  await ovf('ai-plan');await pg.screenshot({path:require('path').join(__dirname,'out',`${tag}-ai-plan.png`)}).catch(()=>{});
  // untick the lead, run: step 1 ok, step 2 fails (pdemo1 is a lead, not a budget) and the rest is not executed
  await pg.locator('.ai-plan li').nth(2).locator('input[type=checkbox]').uncheck();await pg.waitForTimeout(100);
  await pg.click('[data-act="aiRunPlan"]');for(let i=0;i<40&&await pg.locator('.ai-plan li.running').count();i++)await pg.waitForTimeout(150);await pg.waitForTimeout(300);
  s=await ST();ok(s.projects.pdemo3.stage==='contract_review',`${tag} step 1 executed`);
  ok(await pg.locator('.ai-plan li.error').count()===1&&s.projects.pdemo1.stage==='lead',`${tag} step 2 failed cleanly`);
  ok(await pg.locator('.ai-plan li.cancelled').count()===1&&!Object.values(s.projects).some(p=>p.client?.name==='شركة الأفق'),`${tag} unticked step not executed`);
  ok(await pg.locator('[data-act="aiRunPlan"]').innerText().then(t=>t.includes('إعادة')),`${tag} retry offered for the failed step`);
  // voice without browser support
  await pg.evaluate(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition});await pg.click('.ai-in [data-act="aiMic"]');await pg.waitForTimeout(150);
  ok((await pg.locator('.ai-m.note').last().innerText()).includes('Chrome'),`${tag} unsupported browser gets clear guidance`);
  ok(!errs.length,`${tag} no page errors ${errs}`);await ctx.close()}
 await b.close();console.log('TOTAL',n,'FAILS',fails);if(fails)process.exitCode=1})();
