// Every AI tool for every role: prepare → confirm → verify state; read tools return data without throwing.
const {chromium}=require('playwright');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));const U='file://'+require('path').join(__dirname,'..','index.html');
let fails=0,n=0;const ok=(c,m)=>{n++;console.log(c?'PASS':'FAIL',m);if(!c)fails++};
const FAKE=()=>{window.__npiFakeSample=Object.assign(async function(input,opts){const plan=JSON.parse(localStorage.getItem('fakePlan')||'[]');const out=[];window.__toolsSeen=(opts.tools||[]).map(t=>t.name);for(const st of plan){const t=(opts.tools||[]).find(x=>x.name===st.tool);if(!t){out.push('NO_TOOL:'+st.tool);continue}try{const r=await t.execute(st.args,{});out.push('OK:'+JSON.stringify(r).slice(0,400))}catch(e){out.push('ERR:'+e.message)}}localStorage.setItem('fakeOut',JSON.stringify(out));return{text:out.join('\n')}},{limits:async()=>({tools:{maxCount:20},images:{maxCount:1,maxInputBytes:5e6,mediaTypes:['image/png','image/jpeg']}})})};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1366,height:860}});await ctx.addInitScript(FAKE);const pg=await ctx.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errs.push(m.text())});
 await pg.route(/fonts/,r=>r.abort());await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
 const ST=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('npi-local-v1')));
 const as=async un=>{const m=Object.values(seed.team).find(t=>t.username===un);await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto(U+'#home');await pg.reload();await pg.waitForTimeout(300);await pg.click('.ai-fab');await pg.waitForTimeout(100)};
 const run=async(plan,confirm=true)=>{await pg.evaluate(p=>localStorage.setItem('fakePlan',JSON.stringify(p)),plan);await pg.fill('#aiIn','طلب');await pg.click('.ai-in button[type=submit]');await pg.waitForTimeout(500);const out=await pg.evaluate(()=>JSON.parse(localStorage.getItem('fakeOut')||'[]'));
  let done=0,bad=[];if(confirm){const cards=pg.locator('.ai-card.pending [data-act="aiRun"]');const k=await cards.count();for(let i=0;i<k;i++){await pg.locator('.ai-card.pending [data-act="aiRun"]').first().click();await pg.waitForTimeout(350)}done=await pg.locator('.ai-card.done').count();bad=await pg.locator('.ai-card.error .ai-res').allInnerTexts()}return{out,done,bad}};
 const reads=[{tool:'search',args:{entity:'projects',query:''}},{tool:'search',args:{entity:'items',query:'كابل'}},{tool:'search',args:{entity:'suppliers'}},{tool:'search',args:{entity:'team'}},{tool:'search',args:{entity:'purchase_orders'}},{tool:'project_details',args:{project:'NPI-2026-004'}},{tool:'my_pending_tasks',args:{}}];
 // GM
 await as('gm');let r=await run([...reads,{tool:'search',args:{entity:'clients'}},{tool:'search',args:{entity:'claims'}}],false);ok(r.out.every(o=>o.startsWith('OK')),'gm read tools: '+r.out.filter(o=>!o.startsWith('OK')).join(' / '));
 r=await run([{tool:'create_client',args:{name:'مؤسسة النخيل الذهبية',phone:'0561112233',site:'حائل',idType:'سجل تجاري رقم',idNo:'3350001111',vat:'311111111100003'}},{tool:'create_task',args:{title:'زيارة موقع حائل',type:'visit',assignee:'خالد',due:'2026-11-10',priority:'high'}},{tool:'create_supplier',args:{name:'شركة النور للكابلات',vat:'300000000000009',phone:'0500000001'}},{tool:'create_item',args:{code:'MAT-CBL-16',name:'كابلات نحاس 16 مللي',unit:'م ط',cost:22,boq_column:'تنفيذ الكهرباء'}},{tool:'update_client_legal',args:{project:'NPI-2026-004',idNo:'1099999999',address:'الرياض'}}]);
 let s=await ST();ok(r.out.every(o=>o.startsWith('OK'))&&r.done===5&&!r.bad.length,'gm 5 write tools done '+r.done+' '+r.out.filter(o=>!o.startsWith('OK')).join('/')+r.bad.join('/'));
 ok(Object.values(s.clients).some(c=>c.name==='مؤسسة النخيل الذهبية'&&c.idNo==='3350001111'),'gm client saved with legal data');
 ok(Object.values(s.ftasks).some(t=>t.title==='زيارة موقع حائل'&&t.assignee===seed.team.u0002.id),'gm task assigned to PGM');
 ok(Object.values(s.items).some(i=>i.code==='MAT-CBL-16'&&i.boqCode==='electrical'),'gm item saved with BOQ column '+JSON.stringify(Object.values(s.items).find(i=>i.code==='MAT-CBL-16')?.boqCode));
 ok(s.projects.pdemo4.client.idNo==='1099999999','gm updated project client legal data');
 // duplicate client → update not duplicate
 r=await run([{tool:'create_client',args:{name:'مؤسسة النخيل الذهبية',phone:'0561112233',address:'حائل - النقرة'}}]);s=await ST();ok(Object.values(s.clients).filter(c=>c.name==='مؤسسة النخيل الذهبية').length===1,'duplicate client merges');
 // PGM
 await as('pgm');r=await run([{tool:'create_lead',args:{client_name:'مزرعة الشفق',phone:'0533334444',site:'وادي الدواسر',opportunity:true}},{tool:'create_purchase_request',args:{lines:[{item:'MAT-CON-01',qty:100}]}},{tool:'create_task',args:{title:'أمر عمل: فحص العاكس',type:'workorder',project:'NPI-2026-004',assignee:'ياسر',due:'2026-11-08'}}]);
 s=await ST();ok(r.done===3&&!r.bad.length,'pgm 3 writes '+r.out.join(' / ').slice(0,300)+r.bad.join('/'));
 ok(Object.values(s.projects).some(p=>p.client?.name==='مزرعة الشفق'&&p.stage==='study'),'pgm AI opportunity at study');
 ok(Object.values(s.ftasks).some(t=>t.type==='workorder'&&/^WO-/.test(t.code||'')&&t.title.includes('العاكس')),'pgm AI work order coded');
 // engineer: labor + mreq (remaining is 0 on pdemo4 → must be refused) + over-budget log refused
 await as('eng1');r=await run([{tool:'log_labor',args:{project:'NPI-2026-004',date:'2026-11-05',rows:[{trade:'فني تركيب',count:10,in:'6:00',out:'17:00'},{trade:'كهربائي',count:3,in:'07:00',out:'16:00'}]}},{tool:'create_material_request',args:{project:'NPI-2026-004',lines:[{item:'موصلات',qty:10}]}},{tool:'search',args:{entity:'clients'}},{tool:'create_client',args:{name:'x'}}]);
 s=await ST();ok(r.out[0].startsWith('OK')&&r.done===1,'eng labor via AI');const lab=Object.values(s.dlogs).find(d=>d.ai&&d.kind==='labor');ok(lab&&lab.labor[0].in==='06:00'&&lab.labor[0].hours===11,'eng labor times normalised '+JSON.stringify(lab?.labor?.[0]));
 ok(r.out[1].startsWith('ERR')&&r.out[1].includes('المتبقي'),'eng mreq over remaining refused: '+r.out[1].slice(0,80));
 ok(r.out[2].startsWith('ERR'),'eng cannot search clients: '+r.out[2].slice(0,60));ok(r.out[3].startsWith('NO_TOOL'),'eng has no create_client tool');
 const pd=await run([{tool:'project_details',args:{project:'NPI-2026-004'}}],false);ok(pd.out[0].startsWith('OK')&&!pd.out[0].includes('contract_value'),'eng project details hide money');
 r=await run([{tool:'project_details',args:{project:'NPI-2026-003'}}],false);ok(r.out[0].startsWith('ERR'),'eng cannot read unassigned project: '+r.out[0].slice(0,70));
 // store: receive against open PO + without PO
 await as('store');s=await ST();const po=Object.values(s.prs).find(x=>x.status==='po'||x.status==='partial');
 const plan=[{tool:'receive_materials',args:{supplier:'أفكار',place:'main',delivery_note:'DN-77',lines:[{item:'MAT-CON-01',qty:20}]}}];
 if(po)plan.push({tool:'receive_materials',args:{po_number:po.poNo,lines:[{item:po.lines[0].itemId,qty:Math.min(1,po.lines[0].qty)}]}});
 r=await run(plan);s=await ST();ok(r.done===plan.length&&!r.bad.length,'store receipts via AI '+r.out.join(' / ').slice(0,300)+r.bad.join('/'));
 ok(Object.values(s.grns).some(g=>g.ai&&g.dn==='DN-77'&&g.status==='fin'),'store GRN without PO → finance');
 if(po)ok(Object.values(s.grns).some(g=>g.ai&&g.poId===po.id),'store GRN on PO '+po.poNo+' → PO '+s.prs[po.id].status);
 // finance: collection + direct cost
 await pg.evaluate(()=>{window.__npiFreeze=true;const j=JSON.parse(localStorage.getItem('npi-local-v1'));j.claims.cAI={id:'cAI',code:'INV-2026-090',project:'pdemo4',label:'دفعة اختبار',invoiceNo:'INV-AI-90',date:'2026-11-05',amount:10000,vat:1500,total:11500,status:'issued',payments:[]};localStorage.setItem('npi-local-v1',JSON.stringify(j))});
 await as('finance');s=await ST();const cl=Object.values(s.claims).find(c=>c.status!=='paid');
 const fplan=[{tool:'add_direct_cost',args:{project:'NPI-2026-004',category:'equipment',amount:4200,desc:'رافعة شوكية'}}];if(cl)fplan.push({tool:'record_collection',args:{invoice:cl.invoiceNo||cl.code,amount:1000,ref:'TRF-AI-1'}});
 r=await run(fplan);s=await ST();ok(r.done===fplan.length&&!r.bad.length,'finance AI writes '+r.out.join(' / ').slice(0,300));
 ok(Object.values(s.costs).some(c=>c.amount===4200&&c.cat==='equipment'),'finance direct cost saved');ok(s.claims.cAI.status==='partial'&&s.claims.cAI.payments.length===1,'finance AI collection → '+s.claims.cAI.status);
 r=await run([{tool:'record_collection',args:{invoice:'INV-AI-90',amount:999999}}]);ok(r.out[0].startsWith('ERR'),'over-collection refused: '+r.out[0].slice(0,60));
 // tech: limited tool set
 await as('tech');const tl=await pg.evaluate(async()=>{await (window.__npiFakeSample)([{role:'user',content:'x'}],{tools:[]});return 1});
 r=await run([{tool:'create_item',args:{code:'MAT-X-1',name:'صنف تجريبي',unit:'عدد'}}]);ok(r.out[0].startsWith('OK')||r.out[0].startsWith('NO_TOOL'),'tech item tool per permissions → '+r.out[0].slice(0,40));
 // admin
 await as('admin');r=await run(reads,false);ok(r.out.every(o=>o.startsWith('OK')),'admin read tools');
 console.log('ERRORS',errs.length?errs:'none');console.log('TOTAL',n,'FAILS',fails);await b.close();
})();
