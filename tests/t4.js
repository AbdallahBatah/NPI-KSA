const {chromium}=require('playwright');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));const U='file://'+require('path').join(__dirname,'..','index.html');
(async()=>{const b=await chromium.launch();
for(const [vw,vh,tag] of [[390,844,'mob'],[1366,860,'lap']]){const pg=await (await b.newContext({viewport:{width:vw,height:vh}})).newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
const m=Object.values(seed.team).find(t=>t.username==='gm');await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);
await pg.goto(U+'#project-pdemo4');await pg.reload();await pg.waitForTimeout(300);await pg.click('[data-act="ptab"][data-k="docs"]');await pg.waitForTimeout(100);
await pg.locator('[data-act="doc"][data-k="contract"]').click();await pg.waitForTimeout(2500);
const o=await pg.evaluate(()=>{const s=document.querySelector('#sheet .sh');return {sheet:s.scrollWidth>s.clientWidth+1,imgs:document.querySelectorAll('.pdf-pages img').length}});console.log(tag,o,errs);
await pg.screenshot({path:`out/${tag}-contractPreview.png`});}
await b.close()})();
