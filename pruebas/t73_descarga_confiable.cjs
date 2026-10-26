// Descargar PDF / PNG confiable: el aviso "descargado" sólo sale si el archivo salió, un doble clic
// baja UN archivo, un error no deja el botón trabado, y si falla una librería el mensaje es claro
// (sin nombres técnicos) y volver a elegir el mismo Excel funciona.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  let descargas=0,logs=0;
  p.on('download',()=>{descargas++;});
  p.on('request',r=>{if(r.method()==='POST'&&/flyer_logs/.test(r.url()))logs++;});
  const toast=()=>p.evaluate(()=>(document.getElementById('toast-el')||document.getElementById('toast')||{textContent:''}).textContent);
  const quieto=ms=>p.waitForTimeout(ms);
  await p.fill('#empresa','ACME SA');await p.fill('#nombre','Ana Perez');
  await p.evaluate(()=>_lib('jspdf'));

  // 1) doble clic: un solo archivo
  await p.evaluate(()=>{dlPDF();dlPDF();});
  await quieto(1800);
  ok(descargas===1,'doble clic en Descargar PDF: baja 1 solo archivo ('+descargas+')');
  ok(logs===1,'y se registra 1 sola vez en el control de uso ('+logs+')');
  ok((await toast())==='PDF descargado!','el aviso "PDF descargado!" sale cuando salió ('+await toast()+')');
  ok(await p.evaluate(()=>!_fgDlOcupado&&!document.querySelector('#btn-dl-pdf.fg-busy')),'el botón queda libre');

  // 2) Ctrl+Enter sostenido: el primero baja, los repetidos no
  descargas=0;
  await p.evaluate(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();
    const ev=rep=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,repeat:rep,bubbles:true,cancelable:true}));
    ev(false);ev(true);ev(true);});
  await quieto(1800);
  ok(descargas===1,'Ctrl+Enter sostenido: 1 sola descarga, las repeticiones no cuentan ('+descargas+')');

  // 3) un error al generar: mensaje claro y el botón no queda trabado
  descargas=0;
  await p.evaluate(()=>{window.__fr=window.fullRes;window.fullRes=function(){throw new Error('falla simulada');};dlPDF();});
  await quieto(600);
  const t3=await toast();
  ok(/No se pudo generar el PDF/.test(t3),'un error al generar dice "No se pudo generar el PDF" ('+t3+')');
  ok(!/descargado/.test(t3)&&descargas===0,'y NO dice "descargado" ni baja nada');
  ok(await p.evaluate(()=>!_fgDlOcupado&&!document.querySelector('#btn-dl-pdf.fg-busy')),'el botón NO queda en "Un momento…"');
  await p.evaluate(()=>{window.fullRes=window.__fr;dlPDF();});
  await quieto(1500);
  ok(descargas===1,'después de arreglarse, descargar vuelve a andar');

  // 4) el aviso de rubro: no dice "descargado" hasta que se confirma
  descargas=0;
  await p.evaluate(()=>{window.__cr=window._padCheckRubro;window._padCheckRubro=function(f,que,cont){window.__cont=cont;return true;};dlPDF();});
  await quieto(700);
  const t4=await toast();
  ok(!/descargado/.test(t4)&&descargas===0,'con el aviso de rubro abierto no dice "descargado" ni baja nada ('+t4+')');
  await p.evaluate(()=>{window._padCheckRubro=window.__cr;window.__cont();});
  await quieto(1500);
  ok(descargas===1&&(await toast())==='PDF descargado!','al confirmar el aviso, baja y recién ahí dice "descargado"');

  // 5) PNG
  descargas=0;
  await p.evaluate(()=>dlPNG());
  await quieto(1500);
  ok(descargas===1&&(await toast())==='PNG descargado!','Descargar imagen (PNG) también baja y avisa al final');

  // 6) jsPDF todavía cargando: no hay falso "descargado"
  descargas=0;
  // ?t= para saltear la caché del navegador (el hash de integridad vale igual)
  await p.evaluate(()=>{_LIBS.jspdf.src+='?t='+Date.now();});
  const cdn='**/*jspdf*';
  await p.route(cdn,async r=>{await new Promise(x=>setTimeout(x,1800));r.fallback();});
  await p.evaluate(()=>{window.jspdf=undefined;_libP.jspdf=null;dlPDF();});
  await quieto(700);
  const t6=await toast();
  ok(!/descargado/.test(t6)&&descargas===0,'con la librería del PDF todavía cargando no dice "descargado" ('+t6+')');
  await p.waitForEvent('download',{timeout:15000}).catch(()=>null);
  await quieto(500);
  ok(descargas===1&&(await toast())==='PDF descargado!','cuando carga, baja y recién ahí avisa');
  await p.unroute(cdn);

  // 7) la librería de Excel no carga: mensaje claro y se puede volver a elegir el mismo archivo
  await p.evaluate(()=>{_LIBS.xlsx.src+='?t='+Date.now();});
  const xl='**/*xlsx*';
  await p.route(xl,r=>r.abort('connectionreset'));
  await p.evaluate(()=>{window.XLSX=undefined;_libP.xlsx=null;});
  await p.setInputFiles('#excel-input',{name:'a.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('no importa')});
  await quieto(1200);
  const t7=await toast();
  ok(/No se pudo preparar el Excel/.test(t7)&&!/xlsx|jspdf|jszip/i.test(t7),'si falla la librería del Excel: mensaje claro, sin nombres técnicos ('+t7+')');
  ok(await p.evaluate(()=>document.getElementById('excel-input').value===''),'el campo de archivo queda vacío (volver a elegir el mismo funciona)');
  await p.unroute(xl);

  // 8) "Generar ZIP" dos veces mientras carga JSZip: una sola tanda
  await p.evaluate(()=>{_LIBS.jszip.src+='?t='+Date.now();});
  const zc='**/*jszip*';
  await p.route(zc,async r=>{await new Promise(x=>setTimeout(x,1500));r.fallback();});
  const n8=await p.evaluate(async()=>{
    window.JSZip=undefined;_libP.jszip=null;
    window.excelData=[{empresa:'A',config:'BAU',asesor1_nombre:'X'},{empresa:'B',config:'BAU',asesor1_nombre:'Y'}];
    let zips=0;const bb=window._fgBajarBlob;window._fgBajarBlob=function(){zips++;};
    genAll();genAll();
    for(let i=0;i<60&&!zips;i++)await new Promise(r=>setTimeout(r,250));
    await new Promise(r=>setTimeout(r,1500));
    window._fgBajarBlob=bb;return zips;
  });
  ok(n8===1,'Generar ZIP con doble clic mientras carga JSZip: sale 1 ZIP ('+n8+')');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();

  // 9) con el flyer sin cargar la descarga se frena y lo explica (PDF y PNG)
  const p2=await abrir(browser,{rol:'asesor'});
  let d2=0;p2.on('download',()=>{d2++;});
  await p2.evaluate(()=>{_fgSinFlyerPoner({opt:_optN(_fgOpt),motivo:'red'});dlPDF();dlPNG();});
  await p2.waitForTimeout(1200);
  const t9=await p2.evaluate(()=>(document.getElementById('toast-el')||document.getElementById('toast')).textContent);
  ok(d2===0&&/No se pudo cargar el flyer/.test(t9),'flyer sin cargar: no baja nada y explica por qué ('+t9+')');
  await p2.evaluate(()=>{_fgSinFlyerPoner(null);savePDF(fullRes(getVals()),getVals(),true);});
  // la librería del PDF puede estar bajando todavía: se espera la descarga hasta 8 s
  for(let i=0;i<40&&d2<1;i++)await p2.waitForTimeout(200);
  ok(d2===1,'sin el cartel, vuelve a bajar');
  await p2.context().close();
};
