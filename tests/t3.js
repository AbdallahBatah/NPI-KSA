const {chromium}=require('playwright');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
const U='file://'+require('path').join(__dirname,'..','index.html');
(async()=>{
 const b=await chromium.launch();
 const res={};
 for(const [vw,vh,tag] of [[1366,860,'lap'],[390,844,'mob']]){
 const ctx=await b.newContext({viewport:{width:vw,height:vh}});const pg=await ctx.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errs.push(m.text())});
 await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
 const as=async(un,hash='home')=>{const m=Object.values(seed.team).find(t=>t.username===un);await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto(U+'#'+hash);await pg.reload();await pg.waitForTimeout(250)};
 const ovf=async(name)=>{const o=await pg.evaluate(()=>{const W=document.documentElement.clientWidth;const bad=[];if(document.documentElement.scrollWidth>W+1)bad.push('PAGE '+document.documentElement.scrollWidth);document.querySelectorAll('#sheet .sh').forEach(s=>{if(s.scrollWidth>s.clientWidth+1)bad.push('SHEET '+s.scrollWidth)});return bad});if(o.length)console.log(tag,'OVERFLOW',name,o)};
 const pages={gm:['home','pipeline','projects','stock','purchasing','finance','cycle','settings','profile'],eng1:['home','projects','stock','cycle','profile'],store:['home','projects','stock','purchasing'],finance:['home','finance','purchasing']};
 for(const [u,hs] of Object.entries(pages))for(const h of hs){await as(u,h);await ovf(u+'#'+h);if(tag==='mob'&&u==='gm')await pg.screenshot({path:`out/${tag}-${h}.png`})}
 await as('gm','settings');for(const k of ['ctpl','templates','items','suppliers','data']){await pg.click(`[data-act="settab"][data-k="${k}"]`);await pg.waitForTimeout(100);await ovf('settings-'+k)}
 // project tabs
 for(const pid of ['pdemo2','pdemo3','pdemo4']){await as('gm','project-'+pid);const tabs=await pg.locator('.tabs button').evaluateAll(e=>e.map(x=>x.dataset.k));for(const k of tabs){await pg.click(`[data-act="ptab"][data-k="${k}"]`);await pg.waitForTimeout(100);await ovf(pid+'-'+k);if(pid==='pdemo4')await pg.screenshot({path:`out/${tag}-p4-${k}.png`,fullPage:tag==='lap'})}}
 // editors on mobile/laptop
 await as('pgm','project-pdemo3');await pg.click('[data-act="ptab"][data-k="quote"]');await pg.click('[data-act="editQuote"]');await pg.waitForTimeout(150);await ovf('editQuote');await pg.screenshot({path:`out/${tag}-editQuote.png`});await pg.click('#sheet footer .ghost');
 await as('tech','project-pdemo2');
 await as('gm','project-pdemo2');await pg.click('[data-act="approveBudget"]');await pg.waitForTimeout(150);await ovf('approveBudget');await pg.locator('#sheet footer button',{hasText:'اعتماد'}).click();await pg.waitForTimeout(300);
 await as('pgm','project-pdemo2');await pg.click('[data-act="ptab"][data-k="quote"]');await pg.waitForTimeout(100);await pg.screenshot({path:`out/${tag}-p2-quote.png`,fullPage:tag==='lap'});
 await pg.click('[data-act="acceptQuote"]');await pg.fill('#sheet [data-k="ref"]','موافقة');await pg.locator('#sheet footer button',{hasText:'ترحيل'}).click();await pg.waitForTimeout(300);
 await as('gm','project-pdemo2');await pg.click('[data-act="ptab"][data-k="contract"]');await pg.click('[data-act="editContract"]');await pg.waitForTimeout(150);await ovf('editContract');await pg.screenshot({path:`out/${tag}-editContract.png`});await pg.click('#sheet footer .ghost');
 // budget editor
 await as('pgm','pipeline');await pg.click('[data-act="newLead"]');await pg.fill('#sheet [data-k="client.name"]','عميل');await pg.fill('#sheet [data-k="client.phone"]','05');await pg.fill('#sheet [data-k="client.site"]','الخرج');await pg.locator('#sheet footer button',{hasText:'حفظ'}).click();await pg.waitForTimeout(300);
 await pg.click('[data-act="setNeg"][data-v="accepted"]');await pg.waitForTimeout(150);await pg.click('[data-act="startBudget"]');await pg.waitForTimeout(150);await pg.locator('#sheet footer button',{hasText:'متابعة'}).click();await pg.waitForTimeout(400);await ovf('budgetEditor');await pg.screenshot({path:`out/${tag}-budgetEditor.png`});
 await pg.locator('#sheet footer button',{hasText:'حفظ'}).click();await pg.waitForTimeout(200);const e1=await pg.locator('#sheet .alert.bad').count();if(e1)console.log(tag,'budget save err',await pg.locator('#sheet .alert.bad').innerText());
 // daily form
 await as('eng1','projects');await pg.locator('[data-act="dailyForm"]:visible').first().click();await pg.waitForTimeout(150);await ovf('dailyForm');await pg.screenshot({path:`out/${tag}-dailyForm.png`});
 await pg.locator('#sheet input[data-k^="q."]').first().fill('5');await pg.locator('#sheet footer button',{hasText:'حفظ'}).click();await pg.waitForTimeout(1500);await ovf('docPreview');await pg.screenshot({path:`out/${tag}-docPreview.png`});
 // PR review usd
 await as('gm','purchasing');await pg.screenshot({path:`out/${tag}-purch.png`});
 await as('finance','purchasing');await pg.locator('[data-act="reviewPR"]:visible').first().click();await pg.waitForTimeout(150);await ovf('reviewPR');await pg.screenshot({path:`out/${tag}-reviewPR.png`});
 if(tag==='lap'){ // render every document and make real PDFs
  const kinds=[['budget','pdemo2'],['quote','pdemo3'],['contract','pdemo4'],['execCum','pdemo4'],['handover','pdemo4'],['execDay',seed.dlogs[Object.keys(seed.dlogs).find(k=>seed.dlogs[k].kind==='work')].date],['grn',Object.keys(seed.grns)[0]],['transfer',Object.keys(seed.issues)[0]],['mreq',Object.keys(seed.mreqs)[0]],['po',Object.keys(seed.prs)[0]],['claim',Object.keys(seed.claims)[0]]];
  await as('gm','home');
  for(const [k,id] of kinds){const r=await pg.evaluate(async([k,id])=>{try{const T=window.__npi;await T.pdfFonts();const r=await T.DOCS[k](id);await r.d.finish();const blob=await T.toPdfBlob(r.d.pages);const buf=new Uint8Array(await blob.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=32768)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+32768));return{ok:true,name:r.name,n:r.d.pages.length,b64:btoa(bin),img:r.d.pages[0].c.toDataURL('image/png')}}catch(e){return{ok:false,err:e.message+e.stack}}},[k,id]);
   if(!r.ok){console.log('DOC FAIL',k,r.err);continue}fs.writeFileSync(`out/doc-${k}.pdf`,Buffer.from(r.b64,'base64'));console.log('doc',k,r.n,'pages',Math.round(r.b64.length*0.75/1024)+'KB')}
 }
 console.log(tag,'ERRORS',errs);await ctx.close()}
 await b.close();
})();
