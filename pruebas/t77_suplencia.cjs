// Suplencia con acceso a la base (032): si Pepito me eligió como suplente, la lupa
// y el autocompletado también muestran SUS empresas ("Empresa de Pepito"); bajar
// el flyer con otros datos no guarda nada, ofrece PEDÍRSELO; "Generar flyers" y
// el guardado del padrón nunca las mezclan con las mías; cuando Pepito me saca,
// dejan de aparecer. Del lado de Pepito, el pedido muestra cashback y oficiales
// y no se le puede repreguntar.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const PEPITO='00000000-0000-4000-8000-0000000000bb';
const H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Content-Type':'application/json'};
const MIAS=[
  {empresa:'ACME SA',cuits:['30711111111'],config:'BAU',asesores:[{nombre:'Ana Perez',celular:'11 4444 5555',email:'ana@bancogalicia.com.ar'}],rubro:{}},
];
const DE_PEPITO=[
  {empresa:'DELTA LOGISTICA SA',cuits:['30900123686'],config:'BAU',asesores:[{nombre:'Pepito Gomez',celular:'11 5555 0000',email:'pepito.gomez@bancogalicia.com.ar'}],rubro:{},user_id:PEPITO,dueno_nombre:'Pepito Gomez'},
  {empresa:'DELTA FOODS SRL',cuits:['30900124615'],config:'BAU',asesores:[{nombre:'Pepito Gomez',celular:'11 5555 0000',email:'pepito.gomez@bancogalicia.com.ar'}],rubro:{},user_id:PEPITO,dueno_nombre:'Pepito Gomez'},
];
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  let suplente=true;const pedidos=[];let reemplazos=0;let propuestas=[];
  await p.route('**/rest/v1/padron_empresas**',r=>{
    if(r.request().method()==='OPTIONS')return r.fallback();
    return r.fulfill({status:200,headers:{...H,'Content-Range':'0-0/1'},body:JSON.stringify(MIAS)});
  });
  await p.route('**/rest/v1/rpc/padron_suplencias**',r=>{
    if(r.request().method()==='OPTIONS')return r.fallback();
    return r.fulfill({status:200,headers:H,body:JSON.stringify(suplente?DE_PEPITO:[])});
  });
  await p.route('**/rest/v1/rpc/padron_suplencia_proponer**',r=>{
    if(r.request().method()==='OPTIONS')return r.fallback();
    pedidos.push(JSON.parse(r.request().postData()||'{}'));
    return r.fulfill({status:200,headers:H,body:JSON.stringify({id:'p1',origen:'suplente',estado:'pendiente'})});
  });
  await p.route('**/rest/v1/rpc/padron_replace**',r=>{
    if(r.request().method()==='OPTIONS')return r.fallback();
    reemplazos++;return r.fulfill({status:200,headers:H,body:'null'});
  });
  await p.route('**/rest/v1/padron_propuestas**',r=>{
    if(r.request().method()==='OPTIONS')return r.fallback();
    return r.fulfill({status:200,headers:H,body:JSON.stringify(propuestas)});
  });

  // 1) Lupa: mis empresas + las de Pepito, marcadas
  await p.evaluate(()=>{_padron=null;_padLoadErr=false;_padCargando=null;_padSupAt=0;openPadronPop();});
  await p.waitForFunction(()=>document.querySelectorAll('#pad-list .pad-item').length===3,null,{timeout:8000});
  const t1=await p.evaluate(()=>({de:[].map.call(document.querySelectorAll('#pad-list .pad-de'),x=>x.innerText),
    primera:document.querySelector('#pad-list .pad-item .pad-emp').innerText,propias:_padron.length}));
  ok(t1.de.length===2&&t1.de.every(x=>x==='Empresa de Pepito Gomez'),'lupa: las de Pepito dicen "Empresa de Pepito Gomez" ('+t1.de.join(' | ')+')');
  ok(t1.primera==='ACME SA'&&t1.propias===1,'lupa: primero las mías y _padron sigue con 1 sola ('+t1.primera+', '+t1.propias+')');

  // 2) La lupa busca por CUIT también en la base de Pepito
  await p.fill('#pad-q','30-90012368');
  await p.waitForTimeout(150);
  const t2=await p.evaluate(()=>[].map.call(document.querySelectorAll('#pad-list .pad-emp'),x=>x.innerText));
  ok(t2.length===1&&t2[0]==='DELTA LOGISTICA SA','lupa: CUIT de una empresa de Pepito la encuentra ('+t2.join(',')+')');
  await p.evaluate(()=>closePadronPop());

  // 3) Autocompletado
  await p.evaluate(()=>{var i=document.getElementById('empresa');i.focus();i.value='delta';i.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForTimeout(200);
  const t3=await p.evaluate(()=>({n:_padSug.length,de:document.querySelectorAll('#pad-sug .pad-de').length}));
  ok(t3.n===2&&t3.de===2,'autocompletado: sugiere las 2 de Pepito con su etiqueta ('+JSON.stringify(t3)+')');
  await p.evaluate(()=>_padCloseSug());

  // 4) Generar flyers sólo con las mías
  await p.evaluate(()=>{var pg=document.getElementById('padron-gen');if(!pg){pg=document.createElement('div');pg.id='padron-gen';document.body.appendChild(pg);}
    pg.style.display='block';_pgOpen=true;_pgRender();});
  await p.waitForTimeout(200);
  const t4=await p.evaluate(()=>document.querySelectorAll('#pg-list .usr-row').length);
  ok(t4===1,'Generar flyers: sólo mis empresas ('+t4+')');
  await p.evaluate(()=>{_pgOpen=false;});

  // 5) Empresa de Pepito + otro oficial → después de bajar, ofrece PEDÍRSELO
  await p.evaluate(()=>{window._toasts=[];var o=window.showToast;window.showToast=function(m){_toasts.push(String(m));return o.apply(this,arguments);};_padApply(_padSuplencia[0]);});
  await p.waitForTimeout(400);
  const toast=await p.evaluate(()=>_toasts.join(' | '));
  ok(/de las empresas de Pepito Gomez/.test(toast),'al traerla avisa de quién es ('+toast+')');
  await p.evaluate(()=>{_setVal('nombre','Carla Nueva');_setVal('celular','11 6666 7777');_setVal('email','carla.nueva@bancogalicia.com.ar');_padAfterFlyer();});
  await p.waitForSelector('#pad-upd',{timeout:3000});
  const t5=await p.evaluate(()=>({h:document.querySelector('#pad-upd h3').innerText,txt:document.getElementById('pad-upd').innerText,cuit:!!document.getElementById('pad-cuit')}));
  ok(/Cambios en una empresa de Pepito Gomez/.test(t5.h),'ventana: "Cambios en una empresa de Pepito Gomez" ('+t5.h+')');
  ok(/Carla Nueva/.test(t5.txt)&&/Ped[ií]rselo a Pepito Gomez/.test(t5.txt)&&!/Actualizar empresa|Agregar a mis empresas/.test(t5.txt)&&!t5.cuit,'ventana: lista el cambio, ofrece pedírselo y no ofrece guardarlo en lo mío');
  await p.click('#pad-upd .pu-si');
  await p.waitForFunction(()=>!document.getElementById('pad-upd'),null,{timeout:4000});
  const b=pedidos[0]||{};
  ok(b.p_dueno===PEPITO&&b.p_empresa==='DELTA LOGISTICA SA'&&b.p_asesores&&b.p_asesores[0].nombre==='Carla Nueva','pedido: va al dueño correcto con el oficial nuevo');
  ok(b.p_config===null&&b.p_rubro===null,'pedido: no manda cashback ni rubro si no cambiaron ('+b.p_config+', '+JSON.stringify(b.p_rubro)+')');
  ok(reemplazos===0,'nunca se guardó el padrón propio ('+reemplazos+')');
  // no vuelve a preguntar por lo mismo
  await p.evaluate(()=>_padAfterFlyer());
  await p.waitForTimeout(500);
  ok(!(await p.$('#pad-upd')),'no vuelve a preguntar por el mismo cambio');

  // 6) Cambiar el cashback también viaja en el pedido
  await p.evaluate(()=>{_padApply(_padSuplencia[1]);});
  await p.waitForTimeout(400);
  await p.evaluate(()=>{_fgSetNoCB(true);_padAfterFlyer();});
  await p.waitForSelector('#pad-upd',{timeout:3000});
  const t6=await p.evaluate(()=>document.getElementById('pad-upd').innerText);
  ok(/Cashback/.test(t6),'ventana: muestra el cambio de cashback');
  await p.click('#pad-upd .pu-si');
  await p.waitForFunction(()=>!document.getElementById('pad-upd'),null,{timeout:4000});
  ok(pedidos[1]&&pedidos[1].p_config==='','pedido: manda el cashback nuevo (sin cashback = "") ('+JSON.stringify(pedidos[1]&&pedidos[1].p_config)+')');
  await p.evaluate(()=>{_fgSetNoCB(false);});

  // 7) Una empresa MÍA sigue ofreciendo "Actualizar mis empresas"
  await p.evaluate(()=>{_padApply(_padron[0]);});
  await p.waitForTimeout(400);
  await p.evaluate(()=>{_setVal('nombre','Otro Nombre');_padAfterFlyer();});
  await p.waitForSelector('#pad-upd',{timeout:3000});
  const t7=await p.evaluate(()=>document.querySelector('#pad-upd h3').innerText);
  ok(/Actualizar mis empresas/.test(t7),'empresa propia: sigue "Actualizar mis empresas" ('+t7+')');
  await p.evaluate(()=>_padCloseUpdate(0));

  // 8) Pepito me saca: dejan de aparecer
  suplente=false;
  await p.evaluate(()=>new Promise(res=>_padSupCargar(true,res)));
  await p.evaluate(()=>{openPadronPop();});
  await p.waitForTimeout(300);
  const t8=await p.evaluate(()=>({n:document.querySelectorAll('#pad-list .pad-item').length,de:document.querySelectorAll('#pad-list .pad-de').length}));
  ok(t8.n===1&&t8.de===0,'sin suplencia: la lupa vuelve a mostrar sólo las mías ('+JSON.stringify(t8)+')');
  await p.evaluate(()=>closePadronPop());

  // 9) Lado del dueño: el pedido del suplente con cashback, sin "Repreguntar"
  propuestas=[
    {id:'a1',empresa:'DELTA FOODS SRL',estado:'pendiente',origen:'suplente',creada_por:'x1',creada_por_nombre:'Admin Prueba',dueno_id:'yo',created_at:new Date().toISOString(),
     asesores_antes:[{nombre:'Pepito Gomez',celular:'11 5555 0000',email:''}],asesores:[{nombre:'Pepito Gomez',celular:'11 5555 0000',email:''}],config_antes:'BAU',config:'',rubro_antes:null,rubro:null},
    {id:'a2',empresa:'OTRA SA',estado:'pendiente',origen:'hunter',creada_por:'x2',creada_por_nombre:'Hunter Uno',dueno_id:'yo',created_at:new Date().toISOString(),
     asesores_antes:[{nombre:'Ana',celular:'',email:''}],asesores:[{nombre:'Beto',celular:'',email:''}]},
  ];
  await p.evaluate(()=>new Promise(res=>_propCargarPendientes(res)));
  await p.evaluate(()=>{var h=document.getElementById('at-propuestas');if(!h){h=document.createElement('div');h.id='at-propuestas';document.body.appendChild(h);}_propRenderPendientes();});
  await p.waitForTimeout(400);
  const t9=await p.evaluate(()=>[].map.call(document.querySelectorAll('#prop-list .prop-card'),c=>({txt:c.innerText,repreg:/Repreguntar/.test(c.innerText)})));
  ok(t9.length===2,'dueño: ve los dos pedidos ('+t9.length+')');
  ok(t9[0]&&/como suplente/.test(t9[0].txt)&&/Cashback: BAU → Sin cashback/.test(t9[0].txt)&&!t9[0].repreg,'dueño: el del suplente dice "como suplente", muestra el cashback y no tiene Repreguntar');
  ok(t9[1]&&t9[1].repreg&&/Propuesto por Hunter Uno/.test(t9[1].txt),'dueño: el del hunter sigue igual (con Repreguntar)');

  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
