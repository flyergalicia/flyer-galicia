const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const png='data:image/png;base64,'+require('fs').readFileSync(__dirname+'/datos/gofarma_180.png').toString('base64');
  const t=new Date().toISOString();
  const mk=(id,nombre,texto,sub)=>({id,user_id:'00000000-0000-4000-8000-000000000001',autor:'Asesor Prueba',nombre,empresa:'',opcion:9,base_name:'',
    datos:{v:1,cambios:[{tipo:'txt',texto,color:'#040404',peso:500,fs:23,bfs:23,x:687,y:1374,w:89,h:53,bg:'rgb(255,254,254)',t:texto,ox:691,oy:1378,ow:81,oh:45,tx:696,ty:1386,tw:71,th:30}],subidos:sub?{'pc:9:x':png}:{}},
    miniatura:'',estado:'privado',nota_admin:'',opcion_publicada:null,pedido_at:null,revisado_at:null,created_at:t,updated_at:t});
  nube.disenos.push(mk('d801-0000-4000-8000-000000000000','Diseño A','AAA',true),mk('d802-0000-4000-8000-000000000000','Diseño B','BBB',false));
  const a=await abrir(browser,{rol:'asesor'});
  // cargar los dos como pestañas
  for(const id of ['d801-0000-4000-8000-000000000000','d802-0000-4000-8000-000000000000']){
    await a.click('#apptab-estudio');await a.waitForSelector('.est-card');
    await a.click('.est-card button[data-acc=usar][data-id="'+id+'"]');await a.waitForFunction((id)=>_fgProtoAct===id,id,{timeout:15000});
  }
  await a.click('#fg-optbar .fgo[data-o="9"]');await a.waitForTimeout(300);
  // carrera 1: A y enseguida B
  await a.evaluate(()=>{_fgLg.imgs={};fgProtoAbrir('d801-0000-4000-8000-000000000000');fgProtoAbrir('d802-0000-4000-8000-000000000000');});
  await a.waitForTimeout(1500);
  const r1=await a.evaluate(()=>({act:_fgProtoAct,txt:_fgLgActivos().map(e=>e.texto).join(),on:[...document.querySelectorAll('#fg-optbar .on')].map(x=>x.textContent.replace('×','').trim()),pdf:(getVals().logos||[]).map(e=>e.texto).join()}));
  console.log('  ',JSON.stringify(r1));
  ok(r1.act==='d802-0000-4000-8000-000000000000'&&r1.txt==='BBB'&&r1.pdf==='BBB'&&r1.on.join()==='Diseño B','A y enseguida B: queda B (barra, vista y descarga)');
  // carrera 2: A y enseguida el original
  await a.evaluate(()=>{_fgLg.imgs={};fgProtoAbrir('d801-0000-4000-8000-000000000000');fgOptElegir(9);});
  await a.waitForTimeout(1500);
  const r2=await a.evaluate(()=>({act:_fgProtoAct,n:_fgLgActivos().length,on:[...document.querySelectorAll('#fg-optbar .on')].map(x=>x.textContent.replace('×','').trim()),pdf:(getVals().logos||[]).length}));
  console.log('  ',JSON.stringify(r2));
  ok(!r2.act&&r2.n===0&&r2.pdf===0&&r2.on.join()==='Combustible','A y enseguida el original: queda el original sin cambios');
  console.log('  errores:',a.errores.length);
};
