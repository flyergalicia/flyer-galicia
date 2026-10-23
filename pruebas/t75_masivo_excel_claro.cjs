// Masivo por Excel más claro: los encabezados se reconocen aunque vengan distintos ("EMPRESA",
// "Asesor1_Nombre ", "Cashback"), los avisos dicen qué falta con el número de fila REAL del Excel,
// mientras corre la tanda no se mezcla (Limpiar / otra opción), y el ZIP trae un Resumen.txt.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const XLS='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  const subir=async(aoa)=>{
    const b64=await p.evaluate(async(aoa)=>{
      await _lib('xlsx');window.excelData=[];
      const ws=XLSX.utils.aoa_to_sheet(aoa),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Hoja1');
      return XLSX.write(wb,{type:'base64',bookType:'xlsx'});
    },aoa);
    await p.setInputFiles('#excel-input',{name:'t.xlsx',mimeType:XLS,buffer:Buffer.from(b64,'base64')});
    await p.waitForFunction(()=>window.excelData&&excelData.length>0,null,{timeout:8000});
    await p.waitForTimeout(200);
    return p.evaluate(()=>({txt:document.getElementById('val-sum').innerText,cls:document.getElementById('val-sum').className,gen:document.getElementById('btn-gen').disabled,n:excelData.length,
      filas:excelData.map(r=>r.__fila),cols:Object.keys(excelData[0])}));
  };

  // 1) encabezados distintos, una fila vacía en el medio y una empresa vacía
  const r1=await subir([
    ['EMPRESA','Asesor1_Nombre ','Asesor 1 Celular','Cashback','Columna rara'],
    ['Acme','Ana Perez','11 4444 5555','BAU','x'],
    ['','','','',''],
    ['','Luis','11 3333 4444','BAU','y'],
    ['Beta','','','','']]);
  console.log('  validación 1:',JSON.stringify(r1.txt.replace(/\n/g,' | ')));
  ok(JSON.stringify(r1.filas)==='[2,4,5]','el lector guarda el número de fila REAL del Excel ('+JSON.stringify(r1.filas)+')');
  ok(!r1.cols.some(c=>/rownum|__fila/i.test(c)),'el número de fila no aparece como columna');
  ok(/Fila 4: empresa vac/.test(r1.txt)&&!/Fila 3/.test(r1.txt),'"empresa vacía" dice Fila 4 (la del Excel, no la 3 de la lista)');
  ok(r1.gen===true&&/err/.test(r1.cls),'con una empresa vacía no deja generar');
  ok(!/No encontr.{1,3} la columna/.test(r1.txt),'reconoce EMPRESA / Cashback / Asesor1_Nombre aunque estén escritas distinto');

  // 2) mismo Excel con la empresa completa: avisos que no bloquean
  const r2=await subir([
    ['EMPRESA','Asesor1_Nombre ','Asesor 1 Celular','Cashback','Columna rara'],
    ['Acme','Ana Perez','11 4444 5555','BAU','x'],
    ['Gamma','Luis','11 3333 4444','BAU','y'],
    ['Beta','','','','']]);
  ok(r2.gen===false&&/warn/.test(r2.cls),'sólo con avisos: se puede generar');
  ok(/Columnas que ignor/.test(r2.txt)&&/Columna rara/.test(r2.txt),'lista las columnas que ignora ("Columna rara")');
  ok(/1 fila sin cashback/.test(r2.txt),'cuenta las filas sin cashback ('+r2.txt.replace(/\n/g,' | ').slice(0,160)+')');

  // 3) los datos de las columnas "raras" llegan al flyer
  const g=await p.evaluate(async()=>{
    const vistos=[];const fr=window.fullRes;window.fullRes=function(v){vistos.push({e:v.empresa,n:v.nombre,c:v.celular,m1:v.m1,nocb:v.nocb});return fr(v);};
    let zip=null;window._fgBajarBlob=function(b){zip=b;};
    genAll();
    for(let i=0;i<80&&!zip;i++)await new Promise(r=>setTimeout(r,250));
    window.fullRes=fr;
    const z=await JSZip.loadAsync(zip);
    return {vistos,resumen:await z.file('Resumen.txt').async('string'),pdfs:Object.keys(z.files).filter(n=>/\.pdf$/.test(n)).length};
  });
  const acme=g.vistos.find(v=>v.e==='Acme'),beta=g.vistos.find(v=>v.e==='Beta');
  ok(acme&&acme.n==='Ana Perez'&&/4444 5555/.test(acme.c)&&acme.m1&&!acme.nocb,'"Asesor1_Nombre " y "Cashback" llegan al flyer: oficial y montos ('+JSON.stringify(acme)+')');
  ok(beta&&beta.nocb===true,'la fila sin cashback sale sin montos');
  ok(g.pdfs===3&&/Filas del Excel: 3/.test(g.resumen)&&/sin cashback.*Beta/.test(g.resumen)&&/sin oficiales.*Beta/.test(g.resumen),'Resumen.txt dentro del ZIP: totales y observaciones');

  // 4) sin columna de cashback: aviso, no bloquea
  const r4=await subir([['empresa','nombre','celular'],['Acme','Ana','11 4444 5555']]);
  ok(/No encontr.{1,3} la columna del cashback/.test(r4.txt)&&r4.gen===false,'sin columna de cashback: avisa que salen sin montos y deja generar');

  // 5) sin columna empresa: UN solo error, no uno por fila
  const r5=await subir([['razon','nombre'],['Acme','Ana'],['Beta','Luis'],['Gamma','Eva']]);
  ok(/No encontr.{1,3} la columna empresa/.test(r5.txt)&&!/Fila \d/.test(r5.txt)&&r5.gen===true,'sin columna "empresa": un solo mensaje claro y no deja generar ('+r5.txt.replace(/\n/g,' | ').slice(0,100)+')');

  // 6) mientras corre la tanda no se mezcla: Limpiar y cambiar de opción se rechazan
  await subir([['empresa','nombre','config'],['A','x','BAU'],['B','y','BAU'],['C','z','BAU'],['D','w','BAU']]);
  const r6=await p.evaluate(async()=>{
    let zip=null;window._fgBajarBlob=function(b){zip=b;};
    const t=()=>(document.getElementById('toast-el')||document.getElementById('toast')).textContent;
    genAll();
    clearExcel();const a=t();const quedan=excelData.length;
    fgOptElegir(_optN(_fgOpt));const b=t();
    for(let i=0;i<80&&!zip;i++)await new Promise(r=>setTimeout(r,250));
    const z=await JSZip.loadAsync(zip);
    return {a,b,quedan,pdfs:Object.keys(z.files).filter(n=>/\.pdf$/.test(n)).length,libre:!_fgEnTanda()};
  });
  ok(/Esper/.test(r6.a)&&r6.quedan===4,'Limpiar a mitad de la tanda se rechaza ('+r6.a+')');
  ok(/Esper/.test(r6.b),'cambiar de opción a mitad de la tanda se rechaza');
  ok(r6.pdfs===4&&r6.libre,'la tanda termina con las 4 filas y después todo vuelve a estar libre');

  // 7) una fila que falla: queda en Resumen.txt con su número de fila y el motivo
  const r7=await p.evaluate(async()=>{
    window.excelData=[{empresa:'Buena 1',config:'BAU',asesor1_nombre:'X'},{empresa:'Rota',config:'BAU',asesor1_nombre:'Y'},{empresa:'Buena 2',config:'BAU',asesor1_nombre:'Z'}];
    window.excelData[1].__x=0;
    Object.defineProperty(window.excelData[1],'__fila',{value:7,enumerable:false});
    const fr=window.fullRes;window.fullRes=function(v){if(v.empresa==='Rota')throw new Error('falla simulada');return fr(v);};
    let zip=null;window._fgBajarBlob=function(b){zip=b;};
    genAll();
    for(let i=0;i<80&&!zip;i++)await new Promise(r=>setTimeout(r,250));
    window.fullRes=fr;
    const z=await JSZip.loadAsync(zip);
    return {resumen:await z.file('Resumen.txt').async('string'),pdfs:Object.keys(z.files).filter(n=>/\.pdf$/.test(n)),txt:document.getElementById('prog-text').textContent,libre:!_fgEnTanda()};
  });
  ok(r7.pdfs.length===2&&!r7.pdfs.some(n=>/Rota/.test(n)),'una fila que falla no corta la tanda');
  ok(/Fila 7 — Rota: no se pudo dibujar \(falla simulada\)/.test(r7.resumen),'Resumen.txt: "Fila 7 — Rota: no se pudo dibujar (falla simulada)"');
  ok(/1 no salió/.test(r7.txt)&&r7.libre,'la barra lo cuenta y el botón queda libre ('+r7.txt.slice(0,110)+')');

  // 8) el Excel de empresas también usa el número de fila real
  const r8=await p.evaluate(()=>{
    const raw=[{empresa:'Uno',config:'BAU',cuit:'123'}];
    Object.defineProperty(raw[0],'__rowNum__',{value:9,enumerable:false});
    const v=_padValidate(raw);return v.problemas.map(x=>x.txt).join(' | ');
  });
  ok(/fila 10/.test(r8),'importar empresas: el aviso del CUIT dice fila 10 (la del Excel) ('+r8.replace(/<[^>]+>/g,'').slice(0,80)+')');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
