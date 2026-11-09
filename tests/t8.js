// Crawler: every account × every route × every tab × every visible button; writes are frozen so clicks can't cascade.
const {chromium}=require('playwright');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
const U='file://'+require('path').join(__dirname,'..','index.html');
const VW=+(process.argv[2]||1366),VH=+(process.argv[3]||860),TAG=VW<700?'mob':'lap';
const ONLY=process.argv[4];
const ROUTES=['home','pipeline','clients','projects','stock','purchasing','finance','cycle','settings','admin','profile'];
const SKIP=new Set(['logout','drawer','aiToggle','ptab','ftab','settab','atab','stab','nav','noop','closeSheet','aiMic','lang','theme','dd']);
const issues=[];const note=(k,m)=>{issues.push(`[${TAG}] ${k}: ${m}`)};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:VW,height:VH},acceptDownloads:true});const pg=await ctx.newPage();
 let cur='';pg.on('pageerror',e=>note(cur,'PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))note(cur,'CONSOLE '+m.text().slice(0,200))});
 pg.on('dialog',d=>{note(cur,'DIALOG '+d.message());d.dismiss()});pg.on('download',d=>d.cancel().catch(()=>{}));
 await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
 const as=async(m,hash)=>{await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto(U+'#'+hash);await pg.reload();await pg.evaluate(()=>window.__npiFreeze=true);await pg.waitForTimeout(150)};
 const overflow=()=>pg.evaluate(()=>{const W=document.documentElement.clientWidth;const bad=[];if(document.documentElement.scrollWidth>W+1)bad.push('page '+document.documentElement.scrollWidth+'>'+W);document.querySelectorAll('.card,.sh,.sh-body,.ph,.toolbar').forEach(e=>{const r=e.getBoundingClientRect();if(r.width>0&&(r.right>W+1||r.left<-1))bad.push((e.className||e.tagName).toString().slice(0,30)+' x='+Math.round(r.left)+'..'+Math.round(r.right))});return [...new Set(bad)].slice(0,4)});
 const sheetOpen=async()=>(await pg.locator('#sheet .sh').count())>0;
 const closeSheet=async()=>{for(let i=0;i<3&&await sheetOpen();i++){await pg.keyboard.press('Escape');await pg.waitForTimeout(120)}if(await pg.locator('.doc-view,#docview').count())await pg.keyboard.press('Escape')};
 const users=Object.values(seed.team).filter(u=>!ONLY||u.username===ONLY);
 let clicks=0;
 for(const u of users){
  const projIds=Object.values(seed.projects).map(p=>p.id);
  const routes=[...ROUTES,...projIds.map(i=>'project-'+i)];
  const seen=new Set();
  for(const r of routes){
   cur=`${u.username}@${r}`;await as(u,r);
   const denied=await pg.locator('.state h1').count();if(denied){continue}
   // tabs
   const tabSel='[data-act="ptab"],[data-act="ftab"],[data-act="settab"],[data-act="atab"],[data-act="stab"]';
   const tabs=await pg.locator(tabSel+':visible').evaluateAll(es=>es.map(e=>[e.dataset.act,e.dataset.k]));
   const states=[[null,null],...tabs];
   for(const [ta,tk] of states){
    const key=r+'|'+(tk||'');cur=`${u.username}@${r}${tk?'/'+tk:''}`;
    const goState=async()=>{await as(u,r);if(ta)await pg.locator(`[data-act="${ta}"][data-k="${tk}"]:visible`).first().click().catch(()=>{});await pg.waitForTimeout(120)};
    await goState();
    const ov=await overflow();if(ov.length)note(cur,'OVERFLOW '+ov.join(' ; '));
    // mobile card vs table action parity
    if(TAG==='mob'){const gap=await pg.evaluate(()=>{const out=[];document.querySelectorAll('.tcards').forEach(tc=>{const t=new Set([...tc.querySelectorAll('table [data-act]')].map(e=>e.dataset.act));const m=new Set([...tc.querySelectorAll('.mcards [data-act]')].map(e=>e.dataset.act));const miss=[...t].filter(a=>!m.has(a)&&a!=='noop');if(miss.length)out.push(miss.join(','))});return out});if(gap.length)note(cur,'MOBILE CARDS MISSING ACTIONS '+gap.join(' | '))}
    // buttons
    const btns=await pg.locator('.content [data-act]:visible').evaluateAll(es=>es.map((e,i)=>({i,act:e.dataset.act,sig:e.dataset.act+'|'+(e.dataset.k||'')+'|'+(e.dataset.v||'')+'|'+(e.dataset.kind||''),txt:(e.innerText||'').trim().slice(0,30)})));
    const todo=[];const local=new Set();for(const x of btns){if(SKIP.has(x.act))continue;const sg=r.startsWith('project-')?'P|'+tk+'|'+x.sig:key+'|'+x.sig;if(seen.has(sg)||local.has(sg))continue;local.add(sg);seen.add(sg);todo.push(x)}
    for(const x of todo){
     cur=`${u.username}@${r}${tk?'/'+tk:''} ▶ ${x.act}(${x.txt})`;
     const loc=pg.locator('.content [data-act]:visible').nth(x.i);
     if(!(await loc.count())){await goState();}
     const before=await pg.evaluate(()=>location.hash);
     try{await pg.locator('.content [data-act]:visible').nth(x.i).click({timeout:2500})}catch(e){note(cur,'CLICK FAIL '+e.message.split('\n')[0]);await goState();continue}
     clicks++;await pg.waitForTimeout(x.act==='doc'?900:220);
     if(await sheetOpen()){const ov2=await overflow();if(ov2.length)note(cur,'SHEET OVERFLOW '+ov2.join(' ; '));
       // exercise selects in sheet (redraws)
       const sels=pg.locator('#sheet select:visible');const ns=Math.min(await sels.count(),3);for(let k=0;k<ns;k++){const opts=await sels.nth(k).locator('option').evaluateAll(o=>o.map(x=>x.value));if(opts.length>1){await sels.nth(k).selectOption(opts[opts.length-1]).catch(()=>{});await pg.waitForTimeout(80)}}
       const bad=await pg.locator('#sheet .alert.bad').count();if(bad)note(cur,'SHEET OPENS WITH ERROR '+(await pg.locator('#sheet .alert.bad').first().innerText()).slice(0,80));
       await closeSheet()}
     const after=await pg.evaluate(()=>location.hash);
     if(after!==before||await sheetOpen()||(await pg.locator('details[open]').count())){await goState()}
    }
   }
  }
  console.log(TAG,u.username,'done; clicks so far',clicks,'issues',issues.length);
 }
 fs.writeFileSync(`out8-${TAG}.txt`,issues.join('\n'));
 console.log('ISSUES',issues.length);console.log([...new Set(issues.map(i=>i.replace(/project-[a-z0-9]+/g,'project-X')))].slice(0,120).join('\n'));await b.close();
})();
