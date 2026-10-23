// Un corte de red NO se guarda como "no tenés empresas / no hay flyers": la lupa, el
// autocompletado, "Generar flyers" y el Hunter muestran "No se pudo conectar · Reintentar"
// y al reintentar traen lo que corresponde. Nunca se cierra la sesión.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const FILAS=[
  {empresa:'ACME SA',cuits:['30711111111'],config:'BAU',asesores:[{nombre:'Ana Perez',celular:'11 4444 5555',email:'ana@bancogalicia.com.ar'}]},
  {empresa:'BETA SRL',cuits:['30722222222'],config:'BAU',asesores:[{nombre:'Luis Gomez',celular:'11 4444 6666',email:'luis@bancogalicia.com.ar'}]},
];
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  let modo='falla'; // 'falla' = se corta la red; 'ok' = responde
  await p.route('**/rest/v1/padron_empresas**',r=>{
    if(r.request().method()==='OPTIONS')return r.fallback();
    if(modo==='falla')return r.abort('connectionreset');
    return r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Content-Range':'0-1/2'},body:JSON.stringify(FILAS)});
  });

  // 1) Lupa con la red cortada
  await p.evaluate(()=>{_padron=null;_padLoadErr=false;_padCargando=null;openPadronPop();});
  await p.waitForFunction(()=>_padLoadErr===true,null,{timeout:8000});
  await p.waitForTimeout(300);
  const t1=await p.evaluate(()=>({lista:document.getElementById('pad-list').innerText,boton:!!document.querySelector('#pad-list button'),toast:(document.getElementById('toast')||{}).innerText||''}));
  ok(/No se pudo conectar/.test(t1.lista)&&t1.boton,'lupa: dice "No se pudo conectar" y ofrece Reintentar ('+t1.lista.replace(/\n/g,' ')+')');
  ok(!/Todav[ií]a no cargaste/.test(t1.lista),'lupa: NO dice "Todavía no cargaste empresas"');
  ok(!/Failed to fetch|TypeError/i.test(t1.toast),'aviso sin texto técnico en inglés ('+t1.toast+')');

  // 2) Reintentar con la red de vuelta
  modo='ok';
  await p.click('#pad-list button');
  await p.waitForFunction(()=>_padLoadErr===false&&_padron&&_padron.length===2,null,{timeout:8000});
  await p.waitForTimeout(200);
  const t2=await p.evaluate(()=>({items:document.querySelectorAll('#pad-list .pad-item').length}));
  ok(t2.items===2,'lupa: tras Reintentar lista las 2 empresas ('+t2.items+')');

  // 3) Autocompletado: la falla se reintenta sola al escribir
  modo='falla';
  await p.evaluate(()=>{closePadronPop();_padron=null;_padLoadErr=false;_padCargando=null;_padReintentoAt=0;loadPadron(true);});
  await p.waitForFunction(()=>_padLoadErr===true,null,{timeout:8000});
  modo='ok';
  await p.evaluate(()=>{_padReintentoAt=0;var i=document.getElementById('empresa');i.focus();i.value='acm';i.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForFunction(()=>_padLoadErr===false&&_padron&&_padron.length===2,null,{timeout:8000});
  await p.waitForTimeout(300);
  const t3=await p.evaluate(()=>({sug:!!document.getElementById('pad-sug'),n:_padSug.length}));
  ok(t3.sug&&t3.n>=1,'autocompletado: reintentó solo y sugiere ACME ('+JSON.stringify(t3)+')');

  // 4) Generar flyers con la red cortada
  modo='falla';
  await p.evaluate(()=>{_padron=null;_padLoadErr=false;_padCargando=null;_padReintentoAt=0;
    var pg=document.getElementById('padron-gen');if(!pg){pg=document.createElement('div');pg.id='padron-gen';document.body.appendChild(pg);}
    pg.style.display='block';_pgOpen=true;loadPadron(true,function(){_pgRender();});});
  await p.waitForFunction(()=>_padLoadErr===true,null,{timeout:8000});
  await p.waitForTimeout(200);
  const t4=await p.evaluate(()=>document.getElementById('padron-gen').innerText);
  ok(/No se pudo conectar/.test(t4)&&!/Todav[ií]a no cargaste/.test(t4),'Generar flyers: "No se pudo conectar" + Reintentar ('+t4.replace(/\n/g,' ')+')');
  modo='ok';
  await p.evaluate(()=>_padReintentar());
  await p.waitForFunction(()=>_padron&&_padron.length===2,null,{timeout:8000});
  await p.waitForTimeout(200);
  const t4b=await p.evaluate(()=>document.querySelectorAll('#pg-list .usr-row').length);
  ok(t4b===2,'Generar flyers: tras Reintentar aparecen las 2 empresas ('+t4b+')');
  await p.evaluate(()=>{_pgOpen=false;});

  // 5) Hunter: filas
  await p.evaluate(()=>{
    if(!document.getElementById('hun-list')){var d=document.createElement('div');d.id='hun-list';document.body.appendChild(d);var e=document.createElement('div');e.id='hun-estado';document.body.appendChild(e);}
    _hunMeta={9:true};_hunMetaOk=true;_hunMetaFalla=false;_hunRows=null;_hunErr=false;_hunCargando=false;
  });
  modo='falla';
  await p.evaluate(()=>_hunCargar(true));
  await p.waitForFunction(()=>_hunErr===true,null,{timeout:8000});
  await p.waitForTimeout(200);
  const t5=await p.evaluate(()=>({txt:document.getElementById('hun-list').innerText,rows:_hunRows}));
  ok(/No se pudo conectar/.test(t5.txt)&&!/Todav[ií]a no hay ninguna empresa/.test(t5.txt),'Hunter: cartel de conexión, no "no hay ninguna empresa" ('+t5.txt.replace(/\n/g,' ')+')');
  ok(t5.rows===null,'Hunter: la falla no queda guardada como lista vacía');
  modo='ok';
  await p.evaluate(()=>_hunReintentar());
  await p.waitForFunction(()=>_hunRows&&_hunRows.length===2,null,{timeout:8000});
  await p.waitForTimeout(200);
  const t5b=await p.evaluate(()=>({err:_hunErr,n:document.querySelectorAll('#hun-list .hun-nada').length,txt:document.getElementById('hun-list').innerText.slice(0,80)}));
  ok(!t5b.err&&t5b.n===0,'Hunter: tras Reintentar aparecen las empresas ('+t5b.txt.replace(/\n/g,' ')+')');

  // 6) Hunter: flyers (el JSON de la opción no llega)
  let flyerFalla=true;
  await p.route('**/object/public/flyers/_active9.json**',r=>flyerFalla?r.abort('connectionreset'):r.fallback());
  await p.evaluate(()=>{_hunMeta={};_hunMetaOk=false;_hunMetaFalla=false;});
  await p.evaluate(()=>new Promise(res=>_hunMetasCargar(res)));
  const t6=await p.evaluate(()=>({falla:_hunMetaFalla,meta:JSON.stringify(_hunMeta),n9:9 in _hunMeta}));
  ok(t6.falla&&!t6.n9,'Hunter: si no llega el JSON del flyer no se anota "sin flyer" ('+t6.meta+')');
  flyerFalla=false;
  await p.evaluate(()=>{_hunMetaFalla=false;return new Promise(res=>_hunMetasCargar(res));});
  const t6b=await p.evaluate(()=>({falla:_hunMetaFalla,v:_hunMeta[9]}));
  ok(!t6b.falla&&t6b.v===true,'Hunter: al reintentar se entera de que la opción 9 sí tiene flyer ('+JSON.stringify(t6b)+')');

  // 7) La sesión sigue abierta (invariante 18)
  const t7=await p.evaluate(()=>({me:!!_me,login:(document.getElementById('login-ov')||{style:{display:'none'}}).style.display}));
  ok(t7.me&&t7.login!=='flex'&&t7.login!=='block','la sesión sigue abierta ('+JSON.stringify(t7)+')');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
