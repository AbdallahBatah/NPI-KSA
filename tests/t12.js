// Material sales to outside buyers (local preview mode), laptop and phone sizes:
// store prepares → stock reserved → finance prices / approves / invoices → stock deducted → collection,
// plus rejection, resubmit, cancel, stock shortage at approval, visibility per role, PDF documents and the assistant tools.
const {chromium,TEST_URL:U}=require('./support/browser');const fs=require('fs');
const seed=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','seed','seed.json')));
let fails=0,n=0;const ok=(c,m)=>{n++;console.log(c?'PASS':'FAIL',m);if(!c)fails++};
const Y=new Date().getFullYear();
const FAKE=()=>{window.__npiFakeSample=Object.assign(async function(input,opts){const plan=JSON.parse(localStorage.getItem('fakePlan')||'[]');const out=[];for(const st of plan){const t=(opts.tools||[]).find(x=>x.name===st.tool);if(!t){out.push('NO_TOOL:'+st.tool);continue}try{out.push('OK:'+JSON.stringify(await t.execute(st.args,{})).slice(0,300))}catch(e){out.push('ERR:'+e.message)}}localStorage.setItem('fakeOut',JSON.stringify(out));return{text:'جهّزت الخطة.'}},{limits:async()=>({tools:{maxCount:20}})})};
(async()=>{
 const b=await chromium.launch();
 for(const [vw,vh,tag] of [[1366,860,'lap'],[390,844,'mob']]){
  const ctx=await b.newContext({viewport:{width:vw,height:vh}});await ctx.addInitScript(FAKE);const pg=await ctx.newPage();
  let cur='';const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @'+cur));pg.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errs.push('CONSOLE '+m.text()+' @'+cur)});
  await pg.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await pg.goto(U);await pg.evaluate(s=>{localStorage.clear();localStorage.setItem('npi-local-v1',JSON.stringify(s))},seed);
  const ST=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('npi-local-v1')));
  const as=async(un,h='home')=>{cur=un+'@'+h;const m=Object.values(seed.team).find(t=>t.username===un);await pg.evaluate(m=>localStorage.setItem('npi-sess',JSON.stringify({id:m.id,sig:m.passHash.slice(0,16)})),m);await pg.goto(U.replace('?e2e=1','?e2e=1#'+h));await pg.reload();await pg.waitForTimeout(280)};
  const vis=sel=>pg.locator(sel+':visible');
  const shErr=async()=>(await pg.locator('#sheet .alert.bad').count())?await pg.locator('#sheet .alert.bad').first().innerText():'';
  const btn=async label=>{const l=pg.locator('#sheet footer button',{hasText:label});if(!(await l.count())){ok(false,`${tag} no sheet button «${label}» @${cur}: `+(await pg.locator('#sheet footer button').allInnerTexts()).join('|'));return}await l.first().click();await pg.waitForTimeout(350)};
  const ovf=async name=>{const o=await pg.evaluate(()=>{const W=document.documentElement.clientWidth;const bad=[];if(document.documentElement.scrollWidth>W+1)bad.push('page');document.querySelectorAll('#sheet .sh,.ai-panel').forEach(s=>{if(s.scrollWidth>s.clientWidth+1)bad.push(s.className)});return bad});ok(!o.length,`${tag} no overflow ${name} ${o}`)};
  const bal=(s,id)=>Object.values(s.moves).reduce((t,m)=>m.itemId!==id?t:t+(m.to==='MAIN'?m.qty:0)-(m.from==='MAIN'?m.qty:0),0);
  const sales=s=>Object.values(s.sales||{});const byBuyer=(s,name)=>sales(s).find(x=>x.buyer?.name===name);
  const line=async(i,itemId,qty)=>{await pg.selectOption(`#sheet select[data-k="lines.${i}.itemId"]`,itemId);await pg.waitForTimeout(120);await pg.fill(`#sheet [data-k="lines.${i}.qty"]`,String(qty))};
  const newSale=async(name,country,lines,extra={})=>{await as('store','sales');await vis('[data-act="newSale"]').first().click();await pg.waitForTimeout(200);await pg.fill('#sheet [data-k="buyer.name"]',name);if(country!=null)await pg.fill('#sheet [data-k="buyer.country"]',country);for(const [k,v] of Object.entries(extra))await pg.fill(`#sheet [data-k="${k}"]`,v);
   for(let i=0;i<lines.length;i++){if(i>0){await pg.locator('#sheet [data-act="addLine"]').click();await pg.waitForTimeout(120)}await line(i,lines[i][0],lines[i][1])}};
  const review=async name=>{await as('finance','sales');const s=byBuyer(await ST(),name);await vis(`[data-act="reviewSale"][data-id="${s.id}"]`).first().click();await pg.waitForTimeout(250);return s};

  // ---------- 1) store prepares the request ----------
  await as('store','home');
  ok(await pg.locator('.rail a[href="#sales"]').count()===1,`${tag} store has «بيع المواد» in the menu`);
  ok(await vis('.qa[data-act="newSale"]').count()===1,`${tag} store dashboard has the sale shortcut`);
  await as('store','sales');ok((await pg.locator('.content h1').innerText()).includes('بيع المواد'),`${tag} sales page opens`);await ovf('sales-empty');
  await vis('[data-act="newSale"]').first().click();await pg.waitForTimeout(200);
  await btn('رفع للمالية');ok((await shErr()).includes('اسم الجهة'),`${tag} buyer name is required`);
  await pg.fill('#sheet [data-k="buyer.name"]','شركة الأفق للطاقة');await pg.fill('#sheet [data-k="buyer.country"]','الأردن');await pg.fill('#sheet [data-k="buyer.city"]','عمّان');await pg.fill('#sheet [data-k="buyer.vat"]','JO-778812');await pg.fill('#sheet [data-k="buyer.phone"]','+96265550000');
  await btn('رفع للمالية');ok((await shErr()).includes('صنفاً'),`${tag} at least one item is required`);
  await line(0,'ipnl',5000);await btn('رفع للمالية');ok((await shErr()).includes('أكبر من المتاح'),`${tag} quantity above stock is refused`);
  await line(0,'ipnl',20);await pg.locator('#sheet [data-act="addLine"]').click();await pg.waitForTimeout(120);await line(1,'ic6',500);await ovf('sale-sheet');
  await btn('رفع للمالية');
  let s=await ST();let s1=byBuyer(s,'شركة الأفق للطاقة');
  ok(s1&&s1.status==='fin'&&s1.code===`MS-${Y}-001`&&s1.lines.length===2&&s1.lines[0].price===undefined,`${tag} request saved for finance without prices (${s1?.code})`);
  ok(bal(s,'ipnl')===270&&!Object.values(s.moves).some(m=>m.kind==='sale'),`${tag} stock is not deducted before finance approval`);
  await vis('[data-act="newSale"]').first().click();await pg.waitForTimeout(200);await pg.selectOption('#sheet select[data-k="lines.0.itemId"]','ipnl');await pg.waitForTimeout(120);
  ok((await pg.locator('#sheet .sale-line .avail b').first().innerText()).trim()==='250',`${tag} pending sale reserves stock (available 250)`);
  ok(await pg.locator('#sheet select[data-k="prev"] option').count()===2,`${tag} earlier buyer offered for reuse`);await pg.keyboard.press('Escape');
  ok(!(await vis('[data-act="reviewSale"]').count()),`${tag} store cannot price or approve`);
  await as('store','stock');ok((await pg.locator('.content table').first().innerText()).includes('محجوز'),`${tag} stock balances show reserved column`);

  // ---------- 2) who sees what ----------
  await as('eng1','home');ok(await pg.locator('.rail a[href="#sales"]').count()===0,`${tag} engineer has no sales menu`);
  await as('eng1','sales');ok(await pg.locator('.state h1').count()===1,`${tag} engineer is denied the sales page`);
  await as('pgm','sales');ok(await pg.locator('.content h1').count()===1&&!(await vis('[data-act="newSale"]').count())&&!(await vis('[data-act="reviewSale"]').count()),`${tag} PGM can follow sales but not create or approve`);

  // ---------- 3) finance prices, approves, invoices ----------
  await as('finance','home');ok(await vis(`.task [data-act="reviewSale"][data-id="${s1.id}"]`).count()===1,`${tag} finance gets a pricing task`);
  await vis(`.task [data-act="reviewSale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(250);
  ok(await pg.locator('#sheet select[data-k="taxType"]').inputValue()==='export',`${tag} foreign buyer defaults to export 0%`);
  await btn('اعتماد وإصدار الفاتورة');ok((await shErr()).includes('سعر'),`${tag} approval needs a price for every item`);
  await pg.selectOption('#sheet select[data-k="currency"]','JOD');await pg.waitForTimeout(150);
  ok(await pg.locator('#sheet [data-k="rate"]').inputValue()==='5.29',`${tag} JOD rate prefilled`);
  await pg.fill('#sheet [data-k="lines.0.price"]','30');await pg.fill('#sheet [data-k="lines.1.price"]','0.9');await pg.waitForTimeout(150);
  ok((await pg.locator('#sheet [data-out="tot"]').innerText()).includes('1,050.00')&&(await pg.locator('#sheet [data-out="sar"]').innerText()).includes('5,55'),`${tag} totals: 1,050 JOD ≈ 5,554.5 SAR`);await ovf('review-sheet');
  await pg.selectOption('#sheet select[data-k="payMode"]','credit');await pg.waitForTimeout(150);ok(await pg.locator('#sheet [data-k="dueDate"]').count()===1,`${tag} credit sale asks for a due date`);
  await btn('اعتماد وإصدار الفاتورة');
  s=await ST();s1=byBuyer(s,'شركة الأفق للطاقة');const mv=Object.values(s.moves).filter(m=>m.kind==='sale'&&m.saleId===s1.id);
  ok(s1.status==='invoiced'&&s1.invoiceNo===`SI-${Y}-001`&&s1.currency==='JOD'&&s1.rate===5.29&&s1.taxType==='export'&&s1.total===1050&&s1.vat===0,`${tag} invoice issued ${s1.invoiceNo} total ${s1.total} ${s1.currency}`);
  ok(mv.length===2&&mv.every(m=>m.from==='MAIN'&&m.to==='SALE'&&m.ref===s1.code)&&bal(s,'ipnl')===250&&bal(s,'ic6')===5500,`${tag} sold quantities deducted from main stock (270→250, 6000→5500)`);
  await as('store','stock');await pg.locator('[data-act="stab"][data-k="moves"]:visible').first().click();await pg.waitForTimeout(200);ok((await pg.locator('.content').innerText()).includes('بيع لجهة خارجية'),`${tag} stock movement log shows the sale`);

  // ---------- 4) documents ----------
  await as('finance','sales');await vis(`[data-act="viewSale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(250);await ovf('view-sheet');
  await btn('الفاتورة PDF');await pg.locator('.pdf-pages img').first().waitFor({timeout:15000});ok(await pg.locator('.pdf-pages img').count()>=1,`${tag} invoice PDF preview renders`);await ovf('invoice-pdf');
  await pg.screenshot({path:require('path').join(__dirname,'out',`${tag}-sale-invoice.png`)}).catch(()=>{});await pg.keyboard.press('Escape');
  const pdf=await pg.evaluate(async id=>{const N=window.__npi;await N.pdfFonts();const out={};for(const k of ['saleInvoice','saleNote']){const r=await N.DOCS[k](id);await r.d.finish();const blob=await N.toPdfBlob(r.d.pages);out[k]={name:r.name,size:blob.size,pages:r.d.pages.length}}return out},s1.id);
  ok(pdf.saleInvoice.size>20000&&pdf.saleInvoice.name.includes(s1.invoiceNo)&&pdf.saleNote.size>20000,`${tag} invoice and delivery-note PDFs build (${pdf.saleInvoice.pages}p, ${Math.round(pdf.saleInvoice.size/1024)}KB)`);
  const exp=await pg.evaluate(()=>{const x=window.__npi.EXPORTS.sales();return{cols:x.cols.length,rows:x.rows.length,first:x.rows.find(r=>r[1])}});
  ok(exp.rows>=1&&exp.cols===15&&exp.first.includes(1050),`${tag} Excel export lists the sale with amounts`);
  await as('store','sales');await vis(`[data-act="viewSale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(250);
  const stTxt=await pg.locator('#sheet').innerText();const stBtns=(await pg.locator('#sheet footer button').allInnerTexts()).join('|');
  ok(!stTxt.includes('1,050')&&!stBtns.includes('الفاتورة PDF')&&stBtns.includes('إذن تسليم'),`${tag} store sees quantities and the delivery note only, no amounts`);await pg.keyboard.press('Escape');

  // ---------- 5) collection ----------
  await as('finance','home');ok(await vis(`.task [data-act="paySale"][data-id="${s1.id}"]`).count()===1,`${tag} finance gets a collection task`);
  await vis(`.task [data-act="paySale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(200);
  await pg.fill('#sheet [data-k="amount"]','2000');await btn('تسجيل التحصيل');ok((await shErr()).includes('المتبقي'),`${tag} cannot collect more than the remaining amount`);
  await pg.fill('#sheet [data-k="amount"]','400');await pg.fill('#sheet [data-k="ref"]','TRF-881');await btn('تسجيل التحصيل');
  s=await ST();s1=byBuyer(s,'شركة الأفق للطاقة');ok(s1.status==='partial'&&s1.payments.length===1&&s1.payments[0].amount===400,`${tag} partial collection recorded`);
  await as('finance','sales');await vis(`[data-act="paySale"][data-id="${s1.id}"]`).first().click();await pg.waitForTimeout(200);
  ok(await pg.locator('#sheet [data-k="amount"]').inputValue()==='650',`${tag} remaining amount prefilled (650)`);await btn('تسجيل التحصيل');
  s=await ST();s1=byBuyer(s,'شركة الأفق للطاقة');ok(s1.status==='paid'&&s1.payments.length===2,`${tag} invoice fully collected`);
  await as('finance','sales');ok(!(await vis(`[data-act="paySale"][data-id="${s1.id}"]`).count()),`${tag} no collection button once paid`);await ovf('sales-list');
  await as('gm','home');ok((await pg.locator('.cash').innerText()).length>0,`${tag} GM dashboard renders with sales in cash flow`);

  // ---------- 6) local sale: 15% VAT, SAR ----------
  await newSale('مؤسسة الرواد للمقاولات',null,[['imc4',100]]);await btn('رفع للمالية');
  await review('مؤسسة الرواد للمقاولات');
  ok(await pg.locator('#sheet select[data-k="taxType"]').inputValue()==='local'&&await pg.locator('#sheet [data-k="invoiceNo"]').inputValue()===`SI-${Y}-002`,`${tag} Saudi buyer defaults to 15% VAT; next invoice number suggested`);
  await pg.fill('#sheet [data-k="lines.0.price"]','8');await btn('اعتماد وإصدار الفاتورة');
  s=await ST();const s2=byBuyer(s,'مؤسسة الرواد للمقاولات');ok(s2.status==='invoiced'&&s2.amount===800&&s2.vat===120&&s2.total===920&&s2.currency==='SAR'&&bal(s,'imc4')===350,`${tag} local invoice 800 + 120 VAT = 920 SAR`);

  // ---------- 7) rejection → edit → resubmit → cancel ----------
  await newSale('شركة البناء الحديث','الإمارات',[['ifnd',50]]);await btn('رفع للمالية');
  await review('شركة البناء الحديث');await btn('رفض الطلب');ok((await shErr()).includes('سبب الرفض'),`${tag} rejection needs a reason`);
  await pg.fill('#sheet [data-k="decNote"]','السعر المتفق عليه غير موثق');await btn('رفض الطلب');
  s=await ST();let s3=byBuyer(s,'شركة البناء الحديث');ok(s3.status==='rejected'&&s3.rejectNote.includes('غير موثق')&&bal(s,'ifnd')===400,`${tag} request rejected, nothing deducted`);
  await as('store','home');ok(await vis(`.task [data-act="editSale"][data-id="${s3.id}"]`).count()===1,`${tag} store is told about the rejection`);
  await vis(`.task [data-act="editSale"][data-id="${s3.id}"]`).first().click();await pg.waitForTimeout(200);ok((await pg.locator('#sheet .alert[data-rejected]').innerText()).includes('غير موثق'),`${tag} rejection reason shown while editing`);
  await pg.fill('#sheet [data-k="lines.0.qty"]','40');await btn('حفظ وإعادة الرفع');
  s=await ST();s3=byBuyer(s,'شركة البناء الحديث');ok(s3.status==='fin'&&s3.lines[0].qty===40&&!s3.rejectNote,`${tag} edited request goes back to finance`);
  await as('store','sales');await vis(`[data-act="editSale"][data-id="${s3.id}"]`).first().click();await pg.waitForTimeout(200);await btn('إلغاء الطلب');
  s=await ST();s3=byBuyer(s,'شركة البناء الحديث');ok(s3.status==='cancelled',`${tag} store can cancel a pending request`);
  await as('finance','sales');ok(!(await vis(`[data-act="reviewSale"][data-id="${s3.id}"]`).count()),`${tag} cancelled request leaves the finance queue`);

  // ---------- 8) stock drops before approval → approval refused, nothing half-done ----------
  await newSale('شركة الشرق للتوريدات','الأردن',[['iinv630',3]]);await btn('رفع للمالية');await pg.waitForTimeout(1600); // let the audit flush finish before editing storage directly
  await pg.evaluate(()=>{const s=JSON.parse(localStorage.getItem('npi-local-v1'));s.moves.tshort={id:'tshort',itemId:'iinv630',qty:2,from:'MAIN',to:'ADJ',kind:'adj',ref:'جرد: اختبار',at:new Date().toISOString()};localStorage.setItem('npi-local-v1',JSON.stringify(s))});
  const s4=await review('شركة الشرق للتوريدات');await pg.fill('#sheet [data-k="lines.0.price"]','60000');await btn('اعتماد وإصدار الفاتورة');
  ok((await shErr()).includes('لا يكفي'),`${tag} approval refused when stock no longer covers the request`);
  s=await ST();ok(byBuyer(s,'شركة الشرق للتوريدات').status==='fin'&&!Object.values(s.moves).some(m=>m.saleId===s4.id),`${tag} refused approval leaves stock and request untouched`);await pg.keyboard.press('Escape');

  // ---------- 9) assistant: plan → approve → same rules ----------
  await as('store','home');await pg.locator('.qa[data-voice]').click();await pg.waitForTimeout(250);if(await pg.locator('.ai-rec').count())await pg.click('[data-act="aiMicCancel"]');
  await pg.evaluate(()=>localStorage.setItem('fakePlan',JSON.stringify([{tool:'create_material_sale',args:{buyer_name:'شركة النور الأردنية',country:'الأردن',city:'إربد',lines:[{item:'MAT-CON-01',qty:50}]}},{tool:'approve_material_sale',args:{sale:'x',prices:[]}}])));
  await pg.fill('#aiIn','بع 50 موصل لشركة النور الأردنية في إربد');await pg.click('.ai-in button[type=submit]');await pg.waitForTimeout(600);
  let out=await pg.evaluate(()=>JSON.parse(localStorage.getItem('fakeOut')));
  ok(out[0].startsWith('OK')&&out[1].startsWith('NO_TOOL')&&await pg.locator('.ai-plan li').count()===1,`${tag} assistant: store can plan a sale but has no approval tool`);await ovf('ai-plan');
  s=await ST();ok(!byBuyer(s,'شركة النور الأردنية'),`${tag} assistant: nothing saved before approval of the plan`);
  await pg.click('[data-act="aiRunPlan"]');for(let i=0;i<40&&await pg.locator('.ai-plan li.running').count();i++)await pg.waitForTimeout(150);await pg.waitForTimeout(350);
  s=await ST();let s5=byBuyer(s,'شركة النور الأردنية');ok(s5&&s5.status==='fin'&&s5.lines[0].qty===50&&s5.buyer.city==='إربد',`${tag} assistant: sale request created after approval (${s5?.code})`);
  await as('finance','home');await pg.locator('.qa[data-voice]').click();await pg.waitForTimeout(250);if(await pg.locator('.ai-rec').count())await pg.click('[data-act="aiMicCancel"]');
  await pg.evaluate(c=>localStorage.setItem('fakePlan',JSON.stringify([{tool:'approve_material_sale',args:{sale:c,prices:[]}},{tool:'approve_material_sale',args:{sale:c,prices:[{item:'MAT-CON-01',unit_price:2}],currency:'USD'}}])),s5.code);
  await pg.fill('#aiIn','اعتمد بيع شركة النور بسعر 2 دولار للموصل');await pg.click('.ai-in button[type=submit]');await pg.waitForTimeout(600);
  out=await pg.evaluate(()=>JSON.parse(localStorage.getItem('fakeOut')));ok(out[0].startsWith('ERR')&&out[0].includes('سعر')&&out[1].startsWith('OK'),`${tag} assistant: approval without prices is refused, with prices is planned`);
  await pg.click('[data-act="aiRunPlan"]');for(let i=0;i<40&&await pg.locator('.ai-plan li.running').count();i++)await pg.waitForTimeout(150);await pg.waitForTimeout(350);
  s=await ST();s5=byBuyer(s,'شركة النور الأردنية');ok(s5.status==='invoiced'&&s5.currency==='USD'&&s5.rate===3.75&&s5.total===100&&s5.taxType==='export'&&bal(s,'imc4')===300,`${tag} assistant: invoice ${s5.invoiceNo} issued and stock deducted`);
  await pg.evaluate(c=>localStorage.setItem('fakePlan',JSON.stringify([{tool:'record_collection',args:{invoice:c,amount:100,ref:'SWIFT-1'}}])),s5.invoiceNo);
  await pg.fill('#aiIn','حصّلنا 100 دولار من شركة النور');await pg.click('.ai-in button[type=submit]');await pg.waitForTimeout(600);
  await pg.click('[data-act="aiRunPlan"]');for(let i=0;i<40&&await pg.locator('.ai-plan li.running').count();i++)await pg.waitForTimeout(150);await pg.waitForTimeout(350);
  s=await ST();ok(byBuyer(s,'شركة النور الأردنية').status==='paid',`${tag} assistant: collection recorded on the sale invoice`);

  // ---------- 10) permissions screen and custom removal ----------
  await as('gm','admin');await pg.locator('[data-act="atab"][data-k="roles"]:visible').first().click();await pg.waitForTimeout(200);
  await pg.locator('[data-act="editRole"][data-id="store"]:visible').first().click().catch(()=>{});await pg.waitForTimeout(250);
  const box=pg.locator('#sheet input[data-k="pm.sales_create"]');
  if(await box.count()){ok(await box.first().isChecked(),`${tag} store role has the sale permission by default`);await box.first().uncheck();await btn('حفظ');
   await as('store','home');ok(await pg.locator('.rail a[href="#sales"]').count()===0&&!(await vis('.qa[data-act="newSale"]').count()),`${tag} removing the permission hides sales from the store`)}
  else{console.log('   NOTE role editor checkbox selector not found: '+(await pg.locator('#sheet input[type=checkbox]').first().getAttribute('data-k').catch(()=>'')));ok(false,`${tag} role editor exposes sales.create`)}
  ok(!errs.length,`${tag} no page errors ${errs.join(' ; ')}`);await ctx.close()}
 await b.close();console.log('TOTAL',n,'FAILS',fails);if(fails)process.exitCode=1})();
