// Seed for NPI projects app: company reference data from the company's own forms + clearly marked demo records.
import fs from 'fs';
import crypto from 'crypto';
let n = 0; const id = (p) => p + (++n).toString(36).padStart(4, '0');
const VAT = 0.15;
const D = (o) => { const d = new Date('2026-11-03T08:00:00Z'); d.setUTCDate(d.getUTCDate() + o); return d.toISOString(); };
const day = (o) => D(o).slice(0, 10);
const S = { clients:{}, team:{}, items:{}, suppliers:{}, templates:{}, projects:{}, mreqs:{}, issues:{}, prs:{}, grns:{}, returns:{}, dlogs:{}, overruns:{}, claims:{}, moves:{}, costs:{}, spay:{}, meta:{}, ftasks:{}, audit:{} };
const put = (c, k, v) => { v.id = k; S[c][k] = v; return v; };
const hp=(salt,pw)=>crypto.createHash('sha256').update(salt+':'+pw).digest('hex');
const clone=o=>JSON.parse(JSON.stringify(o));

// ---- team (demo accounts) ----
const T = {};
[['gm','م. فهد العتيبي','gm'],['pgm','م. خالد الشمري','pgm'],['fin','عبدالرحمن الدوسري','finance'],['tech','م. ريم الحربي','tech'],['eng','م. ياسر الغامدي','eng1'],['eng2','م. أحمد منصور','eng2'],['store','سلمان الزهراني','store'],['admin','نواف القحطاني','admin']]
 .forEach(([r,nm,un],i)=>{const k='u'+String(i+1).padStart(4,'0');T[r]=k;const salt='demo'+i;put('team',k,{name:nm,role:r==='eng2'?'eng':r,username:un,salt,passHash:hp(salt,'Npi@2026'),active:true,mustChange:false,phone:'',email:'',demo:true});});
n=10;

// ---- items (from the company's estimate sheets, delivery notes and transfer forms) ----
const I = {};
const items = [
 ['PNL','MAT-PNL-650','ألواح الطاقة الشمسية 650 وات LONGi Hi-MO ضد الغبار','لوح',319,true,'panels'],
 ['STR','MAT-STR-SET','هياكل الألواح الشمسية','مجموعة',128000,false,'structure'],
 ['FND','MAT-FND-01','قواعد خرسانية','عدد',100,false,'piling'],
 ['INV630','MAT-INV-630','محول (إنفرتر) فيتشي 630 كيلو 900VDC مع فلتر 1% داخلي','جهاز',56000,true,'electrical'],
 ['INV75','MAT-INV-75','محولات الطاقة الشمسية 75 كيلو مع الرياكتور','عدد',5800,true,'electrical'],
 ['ROOM','MAT-TRF-ROOM','محول غرفة النظام / المكيف','عدد',1300,false,'electrical'],
 ['GND','MAT-GND-01','تأريض النظام وكابلات التأريض','عدد',800,false,'electrical'],
 ['ACC','MAT-ACC-01','إكسسوارات النظام من براغي وتمديدات الكهرباء','تقديرية',6500,false,'electrical'],
 ['CMB','MAT-CMB-01','مجمعات ألواح شمسية','عدد',2000,false,'electrical'],
 ['DCC','MAT-DCC-01','DC coupling صندوق تجميع البسبارات','عدد',4500,false,'electrical'],
 ['MC4','MAT-CON-01','موصلات','عدد',5,false,'electrical'],
 ['C6','MAT-CBL-6','كابلات نحاس بمقاس 6 مللي','م ط',3.8,false,'electrical'],
 ['C70','MAT-CBL-70','كابلات نحاس بمقاس 70 مللي','م ط',47,false,'electrical'],
];
items.forEach(([k,code,name,unit,cost,serial,boqCode])=>{const x='i'+k.toLowerCase();I[k]=x;put('items',x,{code,name,unit,cost,serial,boqCode});});

// ---- suppliers (from attached proforma invoices, delivery notes and tax invoices) ----
const SUP={};
[['longi','LONGi (H.K.) Trading Limited','','',0],['phila','Philadelphia Solar','','',0],['afkar','شركة أفكار العولمة للطاقة المتجددة','','311674749800003',0],['asfour','شركة محمد حبيب العصفور التجارية','','312902678900003',0]]
 .forEach(([k,nm,em,vat,cl])=>{const x='s'+k;SUP[k]=x;put('suppliers',x,{name:nm,email:em,phone:'',vat,creditLimit:cl});});

// ---- meta ----
put('meta','company',{nameAr:'شركة الطاقة والصناعة الوطنية',nameEn:'National Power & Industrial Ltd',legal:'شركة الطاقة والصناعة الوطنية المحدودة شركة شخص واحد',city:'المبرز',cr:'2252064097',unified:'7009392213',vat:'301247783800003',repName:'محمد سعد عبد العزيز الحسين',repTitle:'مدير الشركة',repId:'',addressAr:'مدينة: المبرز هاتف: 01358229 الرمز البريدي: 36422 البريد 4374-6619 المبرز 36422',addrEn:['P.O. Box 115 Ain Najm St Salam Square. Al Ahsa','(Ain Najm) Al Mubarraz 36422-NAMA','Nama tower 7th floor, Kingdom of Saudi Arabia'],phone:'+966135822969',mobile:'+966555345893',fax:'+966135820334',email:'info@npi.com.sa',web:'www.npi.com.sa'});

// ---- budget templates: exact lines of the company's two estimate sheets ----
const R=(cat,name,unit,qty,cost,o={})=>({id:id('r'),cat,name,unit,qty,cost,inQuote:true,...o});
const M=(k,name,unit,qty,cost,o={})=>R('material',name,unit,qty,cost,{itemId:I[k],...o});
const BQ=(code,name,unit,qty,share)=>({id:id('b'),code,name,unit,qty,share});
function tpl1(){const boq=[BQ('piling','دق البوستات (ماكينة الدق)','عدد',328,10),BQ('structure','تركيب الهياكل','لوح',1230,30),BQ('panels','تركيب الألواح','لوح',1230,35),BQ('electrical','تنفيذ الكهرباء','م ط',6100,25)];
 const res=[M('PNL','الواح الطاقه الشمسية','عدد',1230,319),R('indirect','نقل الألواح الشمسية من الميناء والتخليص','عدد',1230,13,{inQuote:false}),M('INV630','محولات الطاقة الشمسية','عدد',1,56000),M('GND','تأريض النظام وكابلات التأريض','عدد',6,800),
  R('labor','تنفيذ تركيب الهياكل والالواح الشمسية والكهرباء','عدد',1230,25,{inQuote:false,boqId:boq[2].id}),M('STR','هياكل الألواح الشمسية','عدد',1,128000),M('ACC','اكسسوارات النظام من براغي وتمديدات الكهرباء','تقديريه',1,6500),
  R('indirect','ايجارات نقل للموقع','عدد',1,2500,{inQuote:false}),R('indirect','مصرفات تقديريه','عدد',1,2500,{inQuote:false}),R('equipment','ايجار فوركلفت تنزيل','عدد',4,500,{inQuote:false}),R('equipment','ماكينة دق البوستات','عدد',328,15,{inQuote:false,boqId:boq[0].id}),
  M('ROOM','محول غرفه المكيف','عدد',2,1300),M('CMB','مجمعات الواح شمسية','عدد',4,2000),M('MC4','موصلات','عدد',150,5),M('C6','كابلات بمقاس 6 مللي','م ط',5500,3.8),M('C70','كابلات بمقاس 70 مللي','م ط',600,47)];
 return{boq,res}}
function tpl2(){const boq=[BQ('piling','القواعد الخرسانية (ماكينة الدق)','عدد',784,15),BQ('structure','تركيب الهياكل','لوح',1470,25),BQ('panels','تركيب الألواح','لوح',1470,30),BQ('electrical','أعمال الكهرباء','م ط',956,30)];
 const res=[M('PNL','الواح الطاقه الشمسية','عدد',1464,330,{excluded:true,inQuote:false}),R('indirect','نقل الألواح الشمسية من الميناء والتخليص','عدد',1464,13,{excluded:true,inQuote:false}),
  M('INV75','محولات الطاقة الشمسية 75 كيلو مع الرياكتور','عدد',10,5800,{price:8700}),M('ROOM','محول غرفة النظام','عدد',3,1200,{price:2400}),M('GND','تأريض النظام وكابلات التأريض','عدد',3,2400,{price:3500}),
  R('labor','تنفيذ تركيب الهياكل والالواح الشمسية','عدد',1470,33,{inQuote:false,boqId:boq[2].id}),R('labor','اعمال الكهرباء','عدد',956,25,{inQuote:false,boqId:boq[3].id}),
  M('STR','هياكل الألواح الشمسية','عدد',1,125000,{price:179000}),M('ACC','اكسسوارات النظام من براغي وتمديدات الكهرباء','تقديريه',1,8000,{price:14000}),
  R('indirect','ايجارات نقل للموقع','عدد',1,6500,{inQuote:false}),R('indirect','مصرفات تقديريه','عدد',1,9104,{inQuote:false}),R('equipment','ايجار فوركلفت تنزيل','عدد',4,500,{inQuote:false}),
  M('FND','قواعد خرسانية','عدد',784,100,{price:150}),M('CMB','مجمعات الواح شمسية','عدد',6,1700,{price:3500}),M('DCC','dc coupling صندوق تجميع البسبارات','عدد',1,4500,{price:5800}),M('MC4','موصلات','عدد',300,5,{price:8}),
  M('C6','كابلات نحاس بمقاس 6 مللي','م ط',7000,3.9,{price:6}),M('C70','كابلات نحاس بمقاس 70 مللي','م ط',460,40,{price:63})];
 return{boq,res}}
const t1=tpl1(),t2=tpl2();
put('templates','t1230',{name:'نموذج 799.50 كيلو وات — 1230 لوح',kw:799.5,panels:1230,margin:17,contractValue:846775,...t1});
put('templates','t1470',{name:'نموذج 1470 لوح — الألواح من العميل',kw:0,panels:1470,margin:17,contractValue:519833,...t2});

// ---- demo helpers ----
const remap=(t)=>{const b=clone(t);const map={};b.boq.forEach(x=>{const nid=id('b');map[x.id]=nid;x.id=nid});b.res.forEach(x=>{x.id=id('r');if(x.boqId)x.boqId=map[x.boqId]});return b};
const log=(arr)=>arr.map(([o,by,text,m])=>({t:D(o),by,text,...(m?{m:1}:{})})).reverse();
const nm=k=>S.team[T[k]].name;
function sale(b){const ql=b.res.filter(l=>l.inQuote!==false&&!l.excluded);const cost=b.res.filter(l=>!l.excluded).reduce((t,l)=>t+l.qty*l.cost,0);const target=b.contractValue||cost/(1-b.margin/100);const fixed=ql.filter(l=>l.price>0).reduce((t,l)=>t+l.qty*l.price,0);const auto=ql.filter(l=>!(l.price>0));const ac=auto.reduce((t,l)=>t+l.qty*l.cost,0);const F=ac>0?(target-fixed)/ac:0;const m={};ql.forEach(l=>m[l.id]=l.price>0?l.price:Math.round(l.cost*F*100)/100);return m}
function quoteOf(p,no,dt){const m=sale(p.budget);return{no,date:dt,validity:30,need:p.study.purpose,status:'open',schedule:[{id:id('ms'),label:'الدفعة الأولى',pct:50,trigger:'signing',at:0},{id:id('ms'),label:'الدفعة الثانية',pct:30,trigger:'materials',at:80},{id:id('ms'),label:'الدفعة الثالثة',pct:20,trigger:'handover',at:100}],lines:p.budget.res.filter(l=>m[l.id]!=null).map(l=>({resId:l.id,name:l.name,unit:l.unit,qty:l.qty,price:m[l.id]})),notes:'الأسعار بالريال السعودي.'}}
const qsub=q=>q.lines.reduce((t,l)=>t+l.qty*l.price,0);
const CL=[{title:'موضوع العقد',text:'حيث أن الطرف الثاني يرغب في تنفيذ مشروع نظام طاقة شمسية بقدرة إنتاجية {kw} كيلو وات بعدد ألواح شمسية {panels} لوح شمسي وقدرة كل لوح {panelW} وات ضد الغبار ANTI DUST لتشغيل {purpose}.'},{title:'مجال العمل وتكلفة العمل',text:'يقوم الطرف الأول بالأعمال المذكورة، وعليه اتفق الأطراف على أن تكون تكاليف العمل مبلغاً إجمالياً وقدره {total} ({totalWords}) شامل ضريبة القيمة المضافة 15%.'},{title:'الأتعاب ومدة العمل',text:'يدفع الطرف الثاني للطرف الأول أتعابه لقاء هذا العقد بواقع {count} دفعات على النحو التالي:\n{payments}'}];

// A. lead
put('projects','pdemo1',{code:'NPI-2026-001',name:'منظومة طاقة شمسية لمضخات الري — مزرعة الوادي الأخضر',client:{name:'مزرعة الوادي الأخضر',phone:'0550000001',address:'بريدة، القصيم',site:'بريدة — طريق الملك عبدالعزيز',idType:'سجل تجاري رقم'},notes:'العميل يطلب نظاماً أرضياً لتشغيل مضخات الري. زيارة الموقع الأسبوع القادم.',stage:'lead',neg:'negotiating',createdAt:D(-3),createdBy:T.pgm,demo:true,log:log([[-3,nm('pgm'),'تسجيل عميل محتمل — جاري التفاوض']])});

// B. budget review (template 1470)
{const b=remap(t2);b.status='submitted';b.version=1;b.margin=17;b.contractValue=519833;b.templateId='t1470';b.templateName=S.templates.t1470.name;b.submittedAt=D(-1);
put('projects','pdemo2',{code:'NPI-2026-002',name:'تشغيل 10 آبار بالطاقة الشمسية — مثال',client:{name:'مؤسسة مثال للزراعة',phone:'0550000002',address:'الجوف',site:'الجوف — طبرجل',idType:'سجل تجاري رقم'},notes:'الألواح يوردها العميل.',stage:'budget_review',neg:'accepted',createdAt:D(-12),createdBy:T.pgm,demo:true,study:{kw:955.5,panels:1470,panelW:650,purpose:'عدد 10 آبار',type:'أرضي',grid:'مستقل',scope:'توريد وتركيب المحولات والهياكل والقواعد والكهرباء. الألواح من العميل.',siteNotes:'المسافات بين الآبار طويلة وتحتاج كابلات إضافية.'},budget:b,
 log:log([[-12,nm('pgm'),'تسجيل عميل محتمل — جاري التفاوض'],[-8,nm('pgm'),'تم قبول العميل — تحولت لفرصة مشروع'],[-6,nm('tech'),'تحديث دراسة التكلفة'],[-4,nm('pgm'),'بدء إعداد الموازنة التقديرية من نموذج 1470'],[-1,nm('pgm'),'إرسال الموازنة التقديرية للمدير العام']])});}

// C. quote open (template 1230)
{const b=remap(t1);b.status='approved';b.version=1;b.margin=17;b.contractValue=846775;b.templateId='t1230';b.templateName=S.templates.t1230.name;b.approvedAt=D(-5);b.approvedBy=T.gm;
const p={code:'NPI-2026-003',name:'منظومة شمسية 799.5 ك.و لرأس كهربائية — مثال',client:{name:'عميل مثال للمشاريع الزراعية',phone:'0550000003',address:'حائل',site:'حائل — الطريق الدائري',idType:'هوية رقم'},notes:'',stage:'quote',neg:'accepted',createdAt:D(-25),createdBy:T.pgm,demo:true,study:{kw:799.5,panels:1230,panelW:650,purpose:'رأس كهربائية بقدرة 600 حصان',panelModel:'LONGI LR5-72HTH-650M',inverterModel:'VEICHI',inverterKw:630,type:'أرضي',grid:'مستقل',scope:'توريد وتركيب وتشغيل منظومة لتشغيل رأس البئر.'},budget:b};
p.quote=quoteOf(p,'NPI551',day(-5));p.quoteRev=1;
p.log=log([[-25,nm('pgm'),'تسجيل عميل محتمل'],[-20,nm('pgm'),'تم قبول العميل — تحولت لفرصة مشروع'],[-9,nm('pgm'),'إرسال الموازنة التقديرية للمدير العام'],[-5,nm('gm'),'اعتماد الموازنة وإصدار عرض السعر NPI551',1]]);
put('projects','pdemo3',p);}

// D. execution (template 1230)
const PD='pdemo4';
{const b=remap(t1);b.status='approved';b.version=1;b.margin=17;b.contractValue=846775;b.templateId='t1230';b.templateName=S.templates.t1230.name;b.approvedAt=D(-60);b.approvedBy=T.gm;
const p={code:'NPI-2026-004',name:'مشروع منظومة طاقة شمسية لبئر — مثال تنفيذ',client:{name:'مؤسسة مثال للتجارة',phone:'0550000004',address:'الرياض، حي الحزم',site:'القويعية — مزرعة المثال',idType:'سجل تجاري رقم',idNo:'0000000000',vat:'300000000000003'},notes:'التنفيذ على مرحلتين.',stage:'execution',neg:'accepted',createdAt:D(-75),createdBy:T.pgm,demo:true,
 study:{kw:799.5,panels:1230,panelW:650,purpose:'رأس كهربائية بقدرة 600 حصان',panelModel:'LONGI LR5-72HTH-650M',inverterModel:'VEICHI',inverterKw:630,type:'أرضي',grid:'مستقل',scope:'توريد وتركيب وتشغيل وتسليم.'},budget:b};
p.quote=quoteOf(p,'NPI548',day(-58));p.quote.status='accepted';p.quote.acceptedAt=day(-50);p.quote.approvalRef='موافقة العميل كتابياً';
p.contract={status:'approved',no:'CT-2026-004',date:day(-45),durationMonths:3,coverSub:'1 Boreholes',approvedAt:D(-45),approvedBy:T.gm,schedule:clone(p.quote.schedule),clauses:CL.map(c=>({...c,id:id('c')})),warranties:[{id:id('w'),label:'الألواح الشمسية',value:'25 سنة نوع لونجي ضد الغبار بقدرة 650 وات'},{id:id('w'),label:'المحولات',value:'سنتين من تاريخ التشغيل، نوع فيتشي VEICHI'},{id:id('w'),label:'الدعم الفني والاستجابة خلال 48 ساعة',value:'مجاناً لمدة عام'},{id:id('w'),label:'هياكل الألواح الشمسية',value:'20 سنة'}]};
p.setup={clientRegistered:true,clientCode:'C-004',costCenter:'CC-2026004',advanceReceived:true,advanceDate:day(-42),advanceRef:'TRF-DEMO-1',engineerId:T.eng,assignedAt:D(-44)};
let s0=new Date(D(-38));p.plan={status:'approved',approvedAt:D(-36),tasks:b.boq.map((x,i)=>{const st=new Date(s0.getTime()+i*10*864e5);return{id:id('k'),name:x.name,boqId:x.id,start:st.toISOString().slice(0,10),end:new Date(st.getTime()+14*864e5).toISOString().slice(0,10)}})};
p.log=log([[-75,nm('pgm'),'تسجيل عميل محتمل'],[-70,nm('pgm'),'تم قبول العميل — تحولت لفرصة مشروع'],[-58,nm('gm'),'اعتماد الموازنة وإصدار عرض السعر NPI548',1],[-50,nm('pgm'),'موافقة العميل على العرض — ترحيل العقد للمدير العام'],[-45,nm('gm'),'اعتماد العقد CT-2026-004'],[-44,nm('pgm'),'تعيين المهندس '+nm('eng')],[-42,nm('fin'),'تسجيل العميل ومركز التكلفة وتأكيد الدفعة الأولى',1],[-36,nm('pgm'),'اعتماد خطة التنفيذ — بدء التنفيذ']]);
put('projects',PD,p);
const sub=qsub(p.quote);const adv=p.contract.schedule[0];const base=Math.round(sub*0.5*100)/100;
put('claims',id('cl'),{code:'INV-2026-001',project:PD,msId:adv.id,label:adv.label,invoiceNo:'INV-DEMO-01',date:day(-42),amount:base,vat:Math.round(base*VAT*100)/100,total:Math.round(base*1.15*100)/100,status:'paid',payments:[{amount:Math.round(base*1.15*100)/100,date:day(-42),ref:'TRF-DEMO-1'}],demo:true});
// opening stock
const OPEN={PNL:1500,STR:2,FND:400,INV630:2,INV75:6,ROOM:4,GND:10,ACC:2,CMB:8,DCC:1,MC4:600,C6:9000,C70:800};
Object.entries(OPEN).forEach(([k,q])=>put('moves',id('m'),{itemId:I[k],qty:q,from:'SUP',to:'MAIN',kind:'open',ref:'رصيد افتتاحي',cost:items.find(x=>x[0]===k)[4],at:D(-60),demo:true}));
// transfer main -> site (received)
const rr=k=>b.res.find(x=>x.itemId===I[k]);
const mr1=id('mr');const L1=[['PNL',1230],['STR',1],['INV630',1],['GND',6],['CMB',4],['MC4',150],['C6',3000]].map(([k,q])=>({resId:rr(k).id,itemId:I[k],name:rr(k).name,unit:rr(k).unit,qty:q,issued:q,received:q}));
put('mreqs',mr1,{code:'MR-2026-001',project:PD,lines:L1,note:'المرحلة الأولى',status:'done',by:T.eng,at:D(-34),demo:true});
put('issues',id('is'),{code:'IS-2026-001',mreq:mr1,project:PD,lines:L1.map(l=>({itemId:l.itemId,resId:l.resId,qty:l.qty})),status:'received',by:T.store,at:D(-33),receivedAt:D(-32),receivedBy:T.eng,demo:true});
L1.forEach(l=>put('moves',id('m'),{itemId:l.itemId,qty:l.qty,from:'MAIN',to:'P:'+PD,kind:'issue',ref:'IS-2026-001',cost:S.items[l.itemId].cost,at:D(-32),demo:true}));
// pending material request
put('mreqs',id('mr'),{code:'MR-2026-002',project:PD,lines:[['C6',2500],['C70',600],['ROOM',2],['ACC',1]].map(([k,q])=>({resId:rr(k).id,itemId:I[k],name:rr(k).name,unit:rr(k).unit,qty:q,issued:0,received:0})),note:'مطلوبة لأعمال الكهرباء',status:'pgm',by:T.eng,at:D(-1),demo:true});
// daily execution forms
const B=i=>b.boq[i].id;
[[-30,[[0,120]],'بدء دق البوستات.'],[-26,[[0,140],[1,300]],''],[-21,[[0,68],[1,420],[2,200]],''],[-15,[[1,320],[2,400],[3,800]],''],[-8,[[1,190],[2,380],[3,1400]],''],[-2,[[2,120],[3,404]],'عائق: تأخر وصول كابلات 70 مللي.']]
 .forEach(([o,e,notes])=>put('dlogs',id('d'),{project:PD,kind:'work',date:day(o),entries:e.map(([i,q])=>({boqId:B(i),qty:q})),notes,obstacles:o===-2?'تأخر وصول كابلات 70 مللي':'',photos:[],by:T.eng,at:D(o),form:true,demo:true}));
[-30,-26,-21,-15,-8,-2].forEach(o=>put('dlogs',id('d'),{project:PD,kind:'labor',date:day(o),labor:[{trade:'فني تركيب',names:'',count:10,in:'06:00',out:'17:00',hours:11,rate:25},{trade:'كهربائي',names:'',count:3,in:'06:00',out:'17:00',hours:11,rate:32}],by:T.eng,at:D(o),demo:true}));
put('costs',id('x'),{project:PD,cat:'equipment',date:day(-31),amount:2000,desc:'إيجار فوركلفت تنزيل — 4 أيام',by:T.fin,demo:true});
// PO in USD awaiting receipt (panels for stock) + PR at finance stage
put('prs',id('pr'),{code:'PR-2026-001',project:'',place:'MAIN',supplierId:SUP.longi,deliveryDate:day(20),creditLimit:0,payTerms:'15% مقدم خلال 7 أيام عمل، و85% خلال 15 يوماً من بوليصة الشحن',currency:'USD',rate:3.75,vat:false,lines:[{itemId:I.PNL,name:S.items[I.PNL].name,unit:'لوح',qty:2000,price:90.35}],status:'po',poNo:'PO-2026-001',received:{},by:T.store,at:D(-10),pgmAt:D(-9),finAt:D(-9),gmAt:D(-8),sentAt:D(-8),history:[{t:D(-9),by:T.pgm,st:'pgm'},{t:D(-9),by:T.fin,st:'fin'},{t:D(-8),by:T.gm,st:'gm'}],demo:true});
put('prs',id('pr'),{code:'PR-2026-002',project:PD,place:'MAIN',supplierId:SUP.asfour,deliveryDate:day(5),creditLimit:0,payTerms:'نقداً',currency:'SAR',rate:1,vat:true,lines:[{itemId:I.STR,name:S.items[I.STR].name,unit:'مجموعة',qty:1,price:125000}],status:'fin',by:T.store,at:D(-2),pgmAt:D(-1),history:[{t:D(-1),by:T.pgm,st:'pgm'}],demo:true});
// receipt at main warehouse from Afkar (invoiced)
const g=id('g');put('grns',g,{code:'GRN-2026-001',poId:'',supplierId:SUP.afkar,place:'MAIN',project:'',date:day(-20),dn:'1331',lines:[{itemId:I.INV630,qty:2,damaged:0,price:56000}],notes:'الأرقام التسلسلية مسجلة في إشعار التسليم',status:'invoiced',invoice:{no:'AFK-DEMO-1',date:day(-19),amount:112000,vat:16800,total:128800,payments:[]},by:T.store,at:D(-20),demo:true});
put('moves',id('m'),{itemId:I.INV630,qty:2,from:'SUP',to:'MAIN',kind:'grn',ref:'GRN-2026-001',cost:56000,at:D(-20),demo:true});
}

// ---- follow-up tasks & work orders (demo) ----
[['ft1','الاتصال بمؤسسة مثال لتأكيد موعد زيارة الموقع','followup','pdemo1',T.pgm,T.pgm,0,'high','open',''],
 ['ft2','متابعة تحصيل الدفعة الثانية — مشروع البئر','collection','pdemo4',T.fin,T.gm,2,'normal','open',''],
 ['ft3','فحص نظام التأريض وتوثيق القياسات بالصور','workorder','pdemo4',T.eng,T.pgm,1,'high','doing','WO-2026-001'],
 ['ft4','تجهيز موقع التخزين المؤقت لكابلات 70 مللي','workorder','pdemo4',T.store,T.pgm,-1,'normal','open','WO-2026-002'],
 ['ft5','مراجعة كميات الهياكل لعرض العميل الزراعي','followup','pdemo3',T.tech,T.pgm,3,'low','open',''],
 ['ft6','إرسال عرض السعر المعدل للعميل','followup','pdemo3',T.pgm,T.gm,-3,'normal','done','']]
 .forEach(([k,title,type,project,assignee,by,due,priority,status,code])=>put('ftasks',k,{title,type,project,assignee,by,due:day(due),priority,status,notes:'',at:D(-4),...(code?{code}:{}),...(status==='done'?{doneAt:D(-1),doneBy:assignee}:{}),demo:true}));
Object.values(S.projects).forEach((p,i)=>{const cid='cdemo'+(i+1);put('clients',cid,{...p.client,demo:true,createdAt:p.createdAt});p.clientId=cid});
S.clients=S.clients||{};
fs.writeFileSync(process.argv[2]||'seed.json',JSON.stringify(S));
let total=0;for(const c in S){total+=Object.keys(S[c]).length;}console.log('docs',total);
