// Topes con nombre en el Excel de empresas y el editor en línea (23-oct): las
// columnas son tope_combustible / tope_supermercado (antes tope / tope2) y se
// traducen según el rubro de cada empresa; bajar y volver a subir no cambia nada;
// un Excel viejo se sigue leyendo; el tope en la columna del otro rubro se avisa.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});

  // 1) Encabezados
  const h=await p.evaluate(()=>_PAD_HEAD.slice(-3));
  ok(JSON.stringify(h)===JSON.stringify(['rubro','tope_combustible','tope_supermercado']),'encabezados: rubro, tope_combustible, tope_supermercado ('+h.join(', ')+')');

  // 2) Bajar y volver a subir: queda igual, y cada tope cae en su columna
  const r2=await p.evaluate(()=>{
    const rows=[
      {empresa:'COMB SA',cuits:[],config:'BAU',asesores:[],rubro:{opcion:0,txt:'Combustible',importe:'24000',importe2:''}},
      {empresa:'SUPER SA',cuits:[],config:'BAU',asesores:[],rubro:{opcion:0,txt:'Supermercado',importe:'15000',importe2:''}},
      {empresa:'AMBOS DIST SA',cuits:[],config:'BAU',asesores:[],rubro:{opcion:0,txt:'Ambos',importe:'20000',importe2:'30000'}},
      {empresa:'AMBOS IGUAL SA',cuits:[],config:'BAU',asesores:[],rubro:{opcion:0,txt:'Ambos',importe:'25000',importe2:''}},
      {empresa:'SIN RUBRO SA',cuits:[],config:'BAU',asesores:[],rubro:{}},
    ];
    const aoa=_padToAoa(_padSane(rows)),head=aoa[0];
    const ic=head.indexOf('tope_combustible'),is=head.indexOf('tope_supermercado');
    const celdas=aoa.slice(1).map(l=>[l[head.indexOf('rubro')],l[ic],l[is]]);
    const vuelta=aoa.slice(1).map(l=>{const o={};head.forEach((k,j)=>o[k]=l[j]);return _padRow(o);});
    const igual=vuelta.map((v,j)=>{const a=_padRubroSane(rows[j].rubro),b=v.rubro;return a.importe===b.importe&&a.importe2===b.importe2&&a.txt===b.txt;});
    return {celdas,igual};
  });
  const c=r2.celdas;
  ok(c[0][1]==='24.000'&&c[0][2]==='','combustible: el tope va en tope_combustible ('+JSON.stringify(c[0])+')');
  ok(c[1][1]===''&&c[1][2]==='15.000','supermercado: el tope va en tope_supermercado ('+JSON.stringify(c[1])+')');
  ok(c[2][1]==='30.000'&&c[2][2]==='20.000','Ambos: combustible 30.000 y súper 20.000, cada uno en su columna ('+JSON.stringify(c[2])+')');
  ok(c[3][1]==='25.000'&&c[3][2]==='25.000','Ambos con el mismo tope: los dos escritos ('+JSON.stringify(c[3])+')');
  ok(c[0][0]==='Combustible','el rubro sin opción configurada sale con su nombre ('+c[0][0]+')');
  ok(r2.igual.every(Boolean),'bajar y volver a subir no cambia ningún tope ('+JSON.stringify(r2.igual)+')');

  // 3) Excel viejo (tope / tope2) se sigue leyendo igual
  const r3=await p.evaluate(()=>_padRow({empresa:'VIEJA SA',config:'BAU',rubro:'Ambos',tope:'20000',tope2:'30000'}).rubro);
  ok(r3.importe==='20000'&&r3.importe2==='30000','Excel viejo con tope/tope2: se lee igual ('+JSON.stringify(r3)+')');

  // 4) Tope en la columna del otro rubro: se toma como el de su rubro y se avisa
  const r4=await p.evaluate(()=>{
    const raw=[{empresa:'CRUZADA SA',config:'BAU',rubro:'Combustible',tope_supermercado:'24000'},
               {empresa:'BIEN SA',config:'BAU',rubro:'Combustible',tope_combustible:'24000'}];
    const inf=_padValidate(raw);
    return {imp:inf.rows[0].rubro.importe,avisos:inf.problemas.map(x=>x.txt).join(' || ')};
  });
  ok(r4.imp==='24000','columna equivocada: igual toma el tope ('+r4.imp+')');
  ok(/en la columna del otro rubro/.test(r4.avisos)&&/fila 2/.test(r4.avisos)&&!/fila 3 \(rubro/.test(r4.avisos),'columna equivocada: avisa sólo esa fila');

  // 5) Editor en línea: campos con nombre, habilitados según el rubro
  const r5=await p.evaluate(async()=>{
    openMiPadron();await new Promise(r=>setTimeout(r,300));
    const o=_FG_OPTS[0];window._padRubroOpts=function(){return [o];};window._optVigente=function(x){return x;};
    _OPC[_optN(o)]=Object.assign({},_OPC[_optN(o)],{rubro:'combustible'}); // el flyer de prueba es de combustible
    _padEdit=_padSane([{empresa:'EDIT SA',cuits:[],config:'BAU',asesores:[],rubro:{opcion:o,importe:'24000',importe2:''}}]).map(_padCloneRow);
    _padEditAsOpen={};_padEditQ='';
    const ed=document.getElementById('padron-editor');if(ed)ed.style.display='block';
    _padEditRenderShell();_padEditRenderList();
    const ins=()=>[...document.querySelectorAll('#padron-edit-list .pad-erow[data-i="0"] .pad-tope')].map(x=>({ph:x.placeholder,v:x.value,d:x.disabled}));
    const comb=ins();
    // el mismo flyer pasa a ser de "Ambos": se habilitan los dos y se escriben con nombre
    _OPC[_optN(o)]=Object.assign({},_OPC[_optN(o)],{rubro:'ambos'});
    _padEditRenderList();
    const amb=ins();
    const f=document.querySelectorAll('#padron-edit-list .pad-erow[data-i="0"] .pad-tope');
    f[0].value='30000';f[1].value='20000';
    _padEditRubro(0,'topes');
    return {comb,amb,ru:_padEdit[0].rubro};
  });
  ok(r5.comb[0].ph==='Tope combustible'&&r5.comb[1].ph==='Tope súper','editor: los campos se llaman "Tope combustible" y "Tope súper"');
  ok(!r5.comb[0].d&&r5.comb[1].d&&r5.comb[0].v==='24.000','editor, rubro combustible: sólo se escribe el de combustible y trae su tope ('+JSON.stringify(r5.comb)+')');
  ok(!r5.amb[0].d&&!r5.amb[1].d,'editor, Ambos: se habilitan los dos');
  ok(r5.ru.importe==='20000'&&r5.ru.importe2==='30000','editor, Ambos: súper 20.000 y combustible 30.000 quedan bien guardados ('+JSON.stringify(r5.ru)+')');

  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
