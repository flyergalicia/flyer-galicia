const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const tap=(p,ix,iy,centrar)=>p.evaluate(([ix,iy,centrar])=>{const prev=document.querySelector('.prev');if(centrar){const r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+iy*k0)-(pr.top+pr.height/2);}const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+ix*k,y:r.top+iy*k,k};},[ix,iy,centrar]);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.evaluate(()=>{ZOOM=1.3;calcSC();redrawNow();});
  await p.click('#fg-lg-btn');
  ok(await p.isVisible('#fg-lg-tip'),'al prender, se ve la ayuda');
  await p.waitForTimeout(7500);
  ok(!(await p.isVisible('#fg-lg-tip')),'a los 7 segundos la ayuda se va');
  await p.click('#fg-lg-franja');await p.waitForTimeout(100);
  ok(await p.isVisible('#fg-lg-tip'),'en modo franja la instrucción se queda');
  await p.click('#fg-lg-franja');
  // ventana de texto
  let pt=await tap(p,730,1395,true);await p.mouse.click(pt.x,pt.y);
  await p.waitForSelector('#fg-lg-escribir');
  ok(!(await p.isVisible('#fg-lg-txt-ok')),'en la vista de marcas no aparece "Poner el texto"');
  await p.click('#fg-lg-escribir');await p.fill('#fg-lg-tx','Lunes');await p.waitForTimeout(150);
  ok(await p.isVisible('#fg-lg-txt-ok')&&await p.isVisible('#fg-lg-txt-volver'),'en el texto: "Poner el texto" abajo y "← Elegir una marca" arriba');
  console.log('  color elegido:',await p.textContent('#fg-lg-col-nom'),'| botones de abajo:',JSON.stringify(await p.$$eval('#fg-lg-acts button:not([hidden])',b=>b.map(x=>x.textContent))));
  await p.screenshot({path:__dirname+'/capturas/t31_texto.png'});
  await p.click('#fg-lg-txt-volver');await p.waitForTimeout(100);
  ok(await p.isVisible('#fg-lg-list')&&!(await p.isVisible('#fg-lg-txt-ok')),'"← Elegir una marca" vuelve a la lista');
  await p.click('#fg-lg-escribir');await p.click('#fg-lg-txt-ok');await p.waitForSelector('#fg-lg-ov',{state:'detached'});await p.waitForTimeout(300);
  // barrita al pie
  const pos=await p.evaluate(()=>{const h=document.getElementById('fg-lg-herr').getBoundingClientRect(),pr=document.querySelector('.prev').getBoundingClientRect();return {h:[Math.round(h.top),Math.round(h.bottom)],prev:[Math.round(pr.top),Math.round(pr.bottom)],nom:document.getElementById('fg-lg-herr-nom').textContent};});
  console.log('  barrita:',JSON.stringify(pos));
  ok(pos.h[1]<=pos.prev[1]&&pos.prev[1]-pos.h[1]<60,'la barrita queda al pie de la vista previa, a la vista');
  await p.screenshot({path:__dirname+'/capturas/t31_barrita.png'});
  // al recorrer el flyer sigue a la vista
  await p.evaluate(()=>{document.querySelector('.prev').scrollTop+=900;});await p.waitForTimeout(200);
  ok(await p.evaluate(()=>{const h=document.getElementById('fg-lg-herr').getBoundingClientRect();return h.top>0&&h.bottom<innerHeight;}),'al recorrer el flyer la barrita sigue a la vista');
  await p.click('#fg-lg-herr .fg-lg-herr-x');await p.waitForTimeout(100);
  ok(!(await p.isVisible('#fg-lg-herr')),'la × de la barrita suelta el elemento');
  // pestaña de prototipo
  const t=new Date().toISOString();
  nube.disenos.push({id:'d950-0000-4000-8000-000000000000',user_id:'00000000-0000-4000-8000-000000000001',autor:'Asesor Prueba',nombre:'MVP 4.0',empresa:'',opcion:9,base_name:'',datos:{v:1,cambios:[],subidos:{}},miniatura:'',estado:'privado',nota_admin:'',opcion_publicada:null,pedido_at:null,revisado_at:null,created_at:t,updated_at:t});
  await p.click('#apptab-estudio');await p.waitForSelector('.est-card');await p.click('.est-card button[data-acc=usar]');
  await p.waitForSelector('#fg-optbar .fgp');await p.waitForTimeout(400);
  await p.screenshot({path:__dirname+'/capturas/t31_proto.png',clip:{x:0,y:60,width:420,height:110}});
  await p.click('#fg-optbar .fgo');await p.waitForTimeout(300);await p.mouse.move(5,700);
  await p.screenshot({path:__dirname+'/capturas/t31_proto_inactiva.png',clip:{x:0,y:60,width:420,height:110}});
  console.log('  errores:',p.errores.length);
};
