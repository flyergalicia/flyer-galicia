// Convertir un PDF a imagen con la política de seguridad real: el lector de PDF se baja
// verificado (módulo, worker y WASM con su hash), dibuja cada cosa que traen los flyers
// (ver pdf_muestra.cjs) y, si alguno de sus archivos viene alterado, no lo ejecuta.
const {abrir}=require('./nube.cjs');
const fs=require('fs');
const {armarPdfMuestra,ALTO_MUESTRA}=require('./pdf_muestra.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const VERSION='6.5.438';
module.exports=async(browser)=>{
  const pdf=armarPdfMuestra({jp2:fs.readFileSync(__dirname+'/datos/muestra.jp2'),jp2W:32,jp2H:32}).toString('base64');
  const convertir=(p)=>p.evaluate(async(b64)=>{
    const file=new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'muestra.pdf',{type:'application/pdf'});
    const c=await new Promise(res=>{const t=setTimeout(()=>res(null),15000);_rasterizeFlyer(file,(b,cv)=>{clearTimeout(t);res(cv);});});
    if(!c)return null;
    const x=c.getContext('2d');
    const color=(px,py)=>Array.from(x.getImageData(px,py,1,1).data).slice(0,3);
    return {w:c.width,h:c.height,fax:[color(52,140),color(77,140)],jpx:color(380,140),ps:color(620,140),cmyk:color(860,140),grupo:color(1100,140),
      letra:(()=>{const d=x.getImageData(280,340,500,70).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]<80)n++;return n;})()};
  },pdf);
  const toast=(p)=>p.evaluate(()=>(document.getElementById('toast-el')||document.getElementById('toast')||{textContent:''}).textContent);
  const rojo=(c,m)=>c&&c[0]>190&&c[1]<80&&c[2]<80;

  // 1) todo bien, con la CSP de index.html
  let p=await abrir(browser,{rol:'admin'});
  const urls=[],bloqueos=[];
  p.on('requestfinished',r=>urls.push(r.url()));
  p.on('console',m=>{if(/Content Security Policy|Refused/i.test(m.text()))bloqueos.push(m.text().slice(0,180));});
  const r=await convertir(p);
  ok(!!r,'el PDF se convierte');
  if(r){
    console.log('  colores:',JSON.stringify(r));
    ok(await p.evaluate(()=>window.pdfjsLib.version)===VERSION,'usa pdf.js '+VERSION);
    ok(r.w===1240&&r.h===ALTO_MUESTRA*2,'sale a 1240 px de ancho y alto proporcional ('+r.w+'×'+r.h+')');
    ok(r.fax[0][0]>240&&r.fax[1][0]<20,'fax CCITT: rayas blancas y negras '+JSON.stringify(r.fax));
    ok(rojo(r.jpx),'JPEG 2000: el cuadrado rojo se ve '+JSON.stringify(r.jpx));
    ok(rojo(r.ps),'tinta con función PostScript: rojo '+JSON.stringify(r.ps));
    ok(rojo(r.cmyk),'CMYK: rojo '+JSON.stringify(r.cmyk));
    ok(r.grupo[0]>200&&r.grupo[1]>90&&r.grupo[1]<170,'grupo de transparencia con máscara: rojo al 50 % '+JSON.stringify(r.grupo));
    ok(r.letra>300,'texto sin fuente incrustada: se dibuja ('+r.letra+' px oscuros)');
  }
  const wasm=urls.filter(u=>/\.wasm$/.test(u));
  ok(wasm.some(u=>/openjpeg\.wasm$/.test(u))&&wasm.some(u=>/jbig2\.wasm$/.test(u)),'baja los WASM que hacen falta: '+wasm.map(u=>u.split('/').pop()).join(', '));
  ok(!urls.some(u=>/nowasm_fallback|qcms|\.bcmap/.test(u)),'no baja nada más que no esté verificado');
  ok(bloqueos.length===0,'la política de seguridad no bloquea nada '+JSON.stringify(bloqueos.slice(0,2)));
  const r2=await convertir(p);
  ok(r2&&JSON.stringify(r2)===JSON.stringify(r),'un segundo PDF sale igual (el lector ya está cargado)');
  ok(await p.evaluate(()=>{const m=document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;return /wasm-unsafe-eval/.test(m)&&!/'unsafe-eval'/.test(m);}),'la CSP deja compilar WASM, sin abrir eval');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
  await p.context().close();

  // 2) un WASM alterado no se ejecuta: esa imagen no sale, pero la conversión termina
  p=await abrir(browser,{rol:'admin',antes:async(pg)=>{
    await pg.route('**/openjpeg.wasm',async route=>{const res=await route.fetch();const b=await res.body();b[b.length-1]^=255;route.fulfill({response:res,body:b});});
  }});
  const r3=await convertir(p);
  ok(!!r3&&!rojo(r3.jpx),'con openjpeg.wasm alterado el JPEG 2000 no se decodifica '+JSON.stringify(r3&&r3.jpx));
  ok(!!r3&&rojo(r3.cmyk),'y el resto del PDF sale igual');
  await p.context().close();

  // 3) un worker alterado no se ejecuta y se avisa
  p=await abrir(browser,{rol:'admin',antes:async(pg)=>{
    await pg.route('**/pdf.worker.min.mjs',async route=>{const res=await route.fetch();route.fulfill({response:res,body:(await res.text())+'\n// alterado'});});
  }});
  const pedidos=[];p.on('request',q=>{if(/pdf\.worker/.test(q.url()))pedidos.push(q.url());});
  await p.evaluate((b64)=>{const file=new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'m.pdf',{type:'application/pdf'});window.__sale=false;_rasterizeFlyer(file,()=>{window.__sale=true;});},pdf);
  await p.waitForTimeout(2500);
  ok(/No se pudo cargar el lector de PDF/.test(await toast(p)),'con el worker alterado avisa ('+await toast(p)+')');
  ok(!await p.evaluate(()=>window.__sale),'y no convierte nada');
  ok(pedidos.length===1,'no lo vuelve a pedir por otro camino sin verificar ('+pedidos.length+')');
  await p.context().close();
};
