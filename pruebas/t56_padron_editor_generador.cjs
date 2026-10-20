// Padrón (revisión del 20-oct): el editor con el buscador puesto toca la fila
// correcta, eliminar no corre los desplegables, tildar en "Generar flyers" no
// repinta la lista y "Actualizar mis empresas" que falla no deja el cambio.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  const filas=()=>{const rows=[];for(let i=0;i<30;i++)rows.push({empresa:'EMPRESA '+i,cuits:['30'+String(70000000+i)+'1'],config:'Config 1',
    asesores:[{nombre:'Oficial '+i,celular:'11 5555 '+(1000+i),email:'of'+i+'@bancogalicia.com.ar'}]});return rows;};

  // 1) Editor con el buscador puesto: el rubro de una fila habilita SUS topes
  const r1=await p.evaluate(async(rows)=>{
    openMiPadron();await new Promise(r=>setTimeout(r,300));
    _padEdit=_padSane(rows).map(_padCloneRow);_padEditAsOpen={};_padEditQ='';
    const ed=document.getElementById('padron-editor');if(ed)ed.style.display='block';
    _padEditRenderShell();_padEditFilter('empresa 2');           // EMPRESA 2, 20..29
    if(!_padEditOpciones().rub.length){const o=_FG_OPTS[0];window._padRubroOpts=function(){return [o];};window._optVigente=function(x){return x;};_padEditRenderList();}
    const op=_padEditOpciones().rub;if(!op.length)return {sinRubros:true};
    _padEditRubro(25,'opcion',String(op[0]));
    const fila=i=>document.querySelector('#padron-edit-list .pad-erow[data-i="'+i+'"]');
    const tope=i=>{const f=fila(i);return f?[...f.querySelectorAll('.pad-tope')].map(x=>x.disabled):null;};
    // la 25 es la 7.ª de la pantalla filtrada: antes se tocaba la 25.ª de la pantalla (no existe) o la de al lado
    return {t25:tope(25),t2:tope(2),hay:document.querySelectorAll('#padron-edit-list .pad-erow').length};
  },filas());
  if(r1.sinRubros)console.log('  (sin opciones de rubro en la nube simulada: se saltea el punto 1)');
  else ok(r1.t25&&r1.t25.every(d=>!d)&&r1.t2&&r1.t2.every(d=>d),'editor filtrado: se habilitan los topes de la fila elegida ('+JSON.stringify(r1)+')');

  // 2) Eliminar una empresa: los desplegables abiertos siguen a su empresa
  const r2=await p.evaluate(async()=>{
    _padEditFilter('');_padEditAsOpen={3:true,7:true};_padEditRenderList();
    const antes=[_padEdit[3].empresa,_padEdit[7].empresa];
    window.fgConfirm=function(m,o,cb){cb(true);};
    _padEditRemoveRow(1);
    const abiertos=Object.keys(_padEditAsOpen).filter(k=>_padEditAsOpen[k]).map(k=>_padEdit[k].empresa);
    return {antes,abiertos,desplegados:document.querySelectorAll('#padron-edit-list .pad-eas-row').length};
  });
  ok(JSON.stringify(r2.antes)===JSON.stringify(r2.abiertos),'eliminar: los oficiales desplegados siguen en su empresa ('+JSON.stringify(r2)+')');
  ok(r2.desplegados===8,'sólo los desplegados arman sus campos de oficiales ('+r2.desplegados+')');

  // 3) Generar flyers: tildar actualiza el contador sin repintar la lista
  const r3=await p.evaluate(async(rows)=>{
    _padEdit=null;const ed=document.getElementById('padron-editor');if(ed)ed.style.display='none';
    if(!_pgOpen)_pgToggle();await new Promise(r=>setTimeout(r,400));
    _padron=_padSane(rows);_pgSel={};_pgRender();
    const primera=document.querySelector('#pg-list .usr-row');
    _pgSet(4,true);_pgSet(6,true);
    return {misma:document.querySelector('#pg-list .usr-row')===primera,cuenta:document.getElementById('pg-count').textContent};
  },filas());
  ok(r3.misma&&/^2 de 30/.test(r3.cuenta),'tildar: cuenta "2 de 30" sin repintar la lista ('+r3.cuenta+')');
  const r3b=await p.evaluate(()=>{_pgFiltrar('empresa 1');return new Promise(r=>setTimeout(()=>r(_pgFiltrados().map(i=>_padron[i].empresa)),50));});
  ok(r3b.length===12&&r3b[0]==='EMPRESA 1','filtrar el generador (1, 10-19 y 21) ('+r3b.length+')');

  // 4) "Actualizar mis empresas" que no se puede guardar: la empresa queda como estaba
  await p.route('**/rest/v1/rpc/padron_replace**',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'falla simulada',code:'XX000'})}));
  const r4=await p.evaluate(async()=>{
    const row=_padron[0];
    _padPending={row:row,empresa:row.empresa,config:'Config 3',asesores:[{nombre:'Otro',celular:'',email:''}],rubro:null};
    _padDoUpdate();await new Promise(r=>setTimeout(r,800));
    return {config:row.config,of:row.asesores[0]&&row.asesores[0].nombre};
  });
  ok(r4.config==='Config 1'&&r4.of==='Oficial 0','si falla el guardado, la empresa vuelve a como estaba ('+JSON.stringify(r4)+')');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
