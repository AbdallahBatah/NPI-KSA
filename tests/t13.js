// The app opened as a hosted Claude artifact (simulated): window.claude provides the database, the assistant and
// dictation, and there is no /api server. Checks that the page does NOT fall into server mode, that sign-in survives
// a reload, that a material sale is written to the shared database, and that voice uses the platform's dictation.
const {chromium,TEST_URL}=require('./support/browser');const fs=require('fs');
const U=TEST_URL.replace('?e2e=1','');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
let fails=0,n=0;const ok=(c,m)=>{n++;console.log(c?'PASS':'FAIL',m);if(!c)fails++};
const HOST=seedData=>{
  const store=JSON.parse(JSON.stringify(seedData));const subs={};window.__store=store;
  const emit=c=>{const cb=subs[c];if(cb)setTimeout(()=>cb({docs:Object.entries(store[c]||{}).map(([id,v])=>({id,data:()=>v})),metadata:{fromCache:false}}),0)};
  const db={collection:c=>({onSnapshot(cb){subs[c]=cb;emit(c);return()=>{}},doc:id=>({set:async data=>{(store[c]=store[c]||{})[id]=JSON.parse(JSON.stringify(data));emit(c)},delete:async()=>{if(store[c])delete store[c][id];emit(c)}})})};
  const D={calls:[],mode:'ok',h:{}};window.__dict=D;
  const dictation={start(o){D.calls.push(o||null);if(D.mode!=='ok'){const code=D.mode;setTimeout(()=>D.h.state&&D.h.state({state:'idle',reason:code}),0);return Promise.reject({code,message:code})}setTimeout(()=>D.h.state&&D.h.state({state:'listening'}),0);return Promise.resolve()},
    stop(){D.stopped=(D.stopped||0)+1;setTimeout(()=>D.h.state&&D.h.state({state:'idle',reason:'stopped'}),0);return Promise.resolve()},
    onPartial(f){D.h.partial=f;return()=>{}},onFinal(f){D.h.final=f;return()=>{}},onState(f){D.h.state=f;return()=>{}}};
  const sample=Object.assign(async function(input){window.__asked=(window.__asked||[]).concat([typeof input==='string'?input:JSON.stringify(input)]);return{text:'تم استلام الأمر.'}},{limits:async()=>({tools:{maxCount:20}})});
  window.claude={use:async name=>({db,dictation,sample}[name]||null)};
};
(async()=>{
 const b=await chromium.launch();
 for(const [vw,vh,tag] of [[1366,860,'lap'],[390,844,'mob']]){
  const ctx=await b.newContext({viewport:{width:vw,height:vh}});await ctx.addInitScript(HOST,seed);const pg=await ctx.newPage();
  const errs=[];const api=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url())});
  await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await pg.goto(U);await pg.locator('#loginForm').waitFor({timeout:15000});
  ok(await pg.locator('#setupForm').count()===0&&api.length===0,`${tag} hosted view shows the sign-in form and never calls the server API (${api.length})`);
  await pg.fill('#lgUser','store');await pg.fill('#lgPass','Npi@2026');await pg.locator('#loginForm button[type=submit]').click();await pg.locator('.dash-h h1').waitFor({timeout:15000});
  ok(true,`${tag} demo account signs in against the shared database`);
  await pg.reload();await pg.locator('.dash-h h1').waitFor({timeout:15000});ok(await pg.locator('#loginForm').count()===0,`${tag} still signed in after a reload`);
  ok(!(await pg.locator('.banner').count()),`${tag} no «preview mode» banner: data is shared, not local`);
  // a material sale goes to the shared database
  await pg.goto(U+'#sales');await pg.waitForTimeout(400);await pg.locator('[data-act="newSale"]:visible').first().click();await pg.waitForTimeout(250);
  await pg.fill('#sheet [data-k="buyer.name"]','شركة الأفق للطاقة');await pg.fill('#sheet [data-k="buyer.country"]','الأردن');await pg.selectOption('#sheet select[data-k="lines.0.itemId"]','ipnl');await pg.waitForTimeout(150);await pg.fill('#sheet [data-k="lines.0.qty"]','20');
  await pg.locator('#sheet footer button',{hasText:'رفع للمالية'}).click();await pg.waitForTimeout(500);
  const sale=await pg.evaluate(()=>Object.values(window.__store.sales||{})[0]);ok(sale&&sale.status==='fin'&&sale.buyer.name==='شركة الأفق للطاقة',`${tag} sale request saved to the shared database`);
  // voice through the platform's dictation
  await pg.goto(U+'#home');await pg.waitForTimeout(500);ok(await pg.locator('.qa[data-voice]').count()===1,`${tag} voice tile shown (assistant available)`);
  await pg.locator('.qa[data-voice]').click();await pg.waitForTimeout(200);
  let d=await pg.evaluate(()=>({calls:window.__dict.calls,rec:!!document.querySelector('.ai-rec')}));
  ok(d.calls.length===1&&d.calls[0]?.language==='ar'&&d.rec,`${tag} tile starts dictation in Arabic inside the click`);
  await pg.evaluate(()=>{const h=window.__dict.h;h.partial({text:'شركة الأفق'});});await pg.waitForTimeout(80);
  ok((await pg.locator('.ai-rec-t').innerText()).includes('شركة الأفق'),`${tag} live words appear while speaking`);
  await pg.evaluate(()=>{const h=window.__dict.h;h.final({text:'شركة الأفق دفعت المبلغ'});h.partial({text:'ابدأ المشروع'});h.final({text:'ابدأ المشروع'})});await pg.waitForTimeout(80);
  await pg.click('[data-act="aiMicStop"]');await pg.waitForTimeout(500);
  let asked=await pg.evaluate(()=>(window.__asked||[]).join('\n'));ok(asked.includes('شركة الأفق دفعت المبلغ ابدأ المشروع')&&!(await pg.locator('.ai-rec').count()),`${tag} finishing sends the whole transcript to the assistant`);
  // the viewer presses the platform's Stop
  await pg.click('.ai-in [data-act="aiMic"]');await pg.waitForTimeout(150);await pg.evaluate(()=>{const h=window.__dict.h;h.final({text:'اعتمد موازنة مشروع المزرعة'});h.state({state:'idle',reason:'viewer_stopped'})});await pg.waitForTimeout(500);
  asked=await pg.evaluate(()=>(window.__asked||[]).join('\n'));ok(asked.includes('اعتمد موازنة مشروع المزرعة'),`${tag} platform Stop also sends what was said`);
  // cancel sends nothing
  const before=await pg.evaluate(()=>(window.__asked||[]).length);await pg.click('.ai-in [data-act="aiMic"]');await pg.waitForTimeout(150);await pg.evaluate(()=>window.__dict.h.final({text:'كلام ملغى'}));await pg.click('[data-act="aiMicCancel"]');await pg.waitForTimeout(400);
  ok(await pg.evaluate(()=>(window.__asked||[]).length)===before&&!(await pg.locator('.ai-rec').count()),`${tag} cancel discards the recording`);
  // microphone refused → clear note, typing still works
  await pg.evaluate(()=>{window.__dict.mode='not_granted'});await pg.click('.ai-in [data-act="aiMic"]');await pg.waitForTimeout(400);
  ok((await pg.locator('.ai-m.note').last().innerText()).includes('الأذونات')&&!(await pg.locator('.ai-rec').count())&&await pg.locator('.ai-m.note').count()===1,`${tag} refused microphone gives one clear note`);
  await pg.evaluate(()=>{window.__dict.mode='unavailable'});await pg.click('.ai-in [data-act="aiMic"]');await pg.waitForTimeout(400);await pg.evaluate(()=>{window.__dict.mode='ok'});await pg.click('.ai-in [data-act="aiMic"]');await pg.waitForTimeout(200);
  d=await pg.evaluate(()=>window.__dict.calls);ok(d[d.length-1]===null&&await pg.locator('.ai-rec').count()===1,`${tag} if Arabic is not offered, the next try uses the account language`);await pg.click('[data-act="aiMicCancel"]');await pg.waitForTimeout(300);
  await pg.fill('#aiIn','ما المهام المطلوبة مني؟');await pg.click('.ai-in button[type=submit]');await pg.waitForTimeout(500);ok((await pg.evaluate(()=>(window.__asked||[]).join('\n'))).includes('ما المهام المطلوبة مني'),`${tag} typed commands still work`);
  ok(!errs.length&&api.length===0,`${tag} no page errors, no server calls ${errs.join(' ; ')}`);await ctx.close()}
 await b.close();console.log('TOTAL',n,'FAILS',fails);if(fails)process.exitCode=1})();
