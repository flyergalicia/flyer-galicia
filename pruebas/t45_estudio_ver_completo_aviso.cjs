// Estudio: "Ver completo" y aviso al admin cuando llega un pedido
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  // un diseño con recorte y un texto
  await p.click('#fg-lg-btn');
  await p.evaluate(()=>{fgRecAplicar(669,340);});await p.waitForTimeout(300);
  await p.click('#fg-lg-guardar');await p.fill('#fg-est-nom','Sin cashback');await p.click('#fg-est-ok');await p.waitForTimeout(800);
  const d=nube.disenos[nube.disenos.length-1];
  ok(!!d,'diseño guardado');
  await p.click('#apptab-estudio');await p.waitForSelector('.est-card button[data-acc=ver]');
  await p.click('.est-card button[data-acc=ver]');await p.waitForSelector('#fg-ver-ov canvas',{timeout:15000});
  const alto=await p.evaluate(()=>document.querySelector('#fg-ver-ov canvas').height);
  ok(alto===7382-340,'"Ver completo" muestra el flyer entero del diseño, con el recorte ('+alto+' px)');
  await p.screenshot({path:__dirname+'/capturas/t45_ver.png'});
  await p.click('#fg-ver-ok');await p.waitForTimeout(200);
  ok(!(await p.$('#fg-ver-ov')),'se cierra con "Cerrar"');
  // pedir publicación → aviso al admin
  nube.llamadasAdmin=[];
  await p.click('.est-card button[data-acc=pedir]');await p.waitForSelector('#fg-cf-ok');await p.click('#fg-cf-ok');await p.waitForTimeout(1200);
  console.log('  llamadas a auth-admin:',JSON.stringify(nube.llamadasAdmin));
  ok(d.estado==='pedido'&&(nube.llamadasAdmin||[]).some(b=>b.action==='notify_estudio_pedido'&&b.id===d.id),'al pedir publicación se avisa al admin (notify_estudio_pedido)');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
  await p.context().close();
  // el admin ve "Ver completo" con el botón de aprobar
  const a=await abrir(browser,{rol:'admin'});
  await a.click('#apptab-estudio');await a.waitForSelector('.est-card button[data-acc=ver]');
  await a.click('.est-card button[data-acc=ver]');await a.waitForSelector('#fg-ver-ov canvas',{timeout:15000});
  ok(await a.isVisible('#fg-ver-apr'),'el admin puede aprobar desde la vista completa');
  console.log('  errores admin:',a.errores.length,a.errores.slice(0,3));
};
