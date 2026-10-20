// Los tres hallazgos de Codex: carrera de estados, doble publicación y número de opción ocupado.
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
function diseno(estado){
  const t=new Date().toISOString();
  const d={id:'d'+(++nube.seq)+'-0000-4000-8000-000000000000',user_id:'00000000-0000-4000-8000-000000000001',autor:'Asesor Prueba',nombre:'Diseño '+nube.seq,empresa:'',opcion:9,base_name:'',
    datos:{v:1,cambios:[{tipo:'txt',texto:'Lunes',color:'#040404',peso:500,fs:23,bfs:23,x:687,y:1374,w:89,h:53,bg:'rgb(255,254,254)',t:'Lunes',ox:691,oy:1378,ow:81,oh:45,tx:696,ty:1386,tw:71,th:30}],subidos:{}},
    miniatura:'',estado,nota_admin:'',opcion_publicada:null,pedido_at:t,revisado_at:null,created_at:t,updated_at:t};
  nube.disenos.push(d);return d;
}
module.exports=async(browser)=>{
  console.log('\n[A] Respuesta tardía no pisa un cambio más nuevo');
  const d1=diseno('pedido');
  const adm=await abrir(browser,{rol:'admin'});
  await adm.click('#apptab-estudio');await adm.waitForSelector('.est-card');
  // el autor cancela "por otro lado" mientras el admin tiene la lista abierta
  d1.estado='privado';
  await adm.click('.est-card button[data-acc=rechazar]');await adm.waitForSelector('#fg-pt-i');
  await adm.fill('#fg-pt-i','No va');await adm.click('#fg-pt-ok');await adm.waitForTimeout(800);
  ok(d1.estado==='privado'&&d1.nota_admin==='','el "No aprobar" tardío NO pisó la cancelación: '+d1.estado);
  console.log('  aviso:',await adm.evaluate(()=>[...document.querySelectorAll('.toast,#toast')].map(t=>t.textContent).join('|')));
  console.log('\n[B] Número de opción ocupado por una publicación a medias');
  const d2=diseno('pedido');
  nube.json['_active10.json']={name:'flyer_viejo_op10.jpg',imageUrl:'x',cfg:{}}; // quedó de un intento anterior
  await adm.evaluate(()=>{_EST.lista=null;_estCargar();});await adm.waitForTimeout(600);
  await adm.click('#est-fil button[data-f=pedidos]');await adm.waitForSelector('.est-card button[data-acc=aprobar]');
  // [C] doble clic en Publicar
  await adm.click('.est-card button[data-acc=aprobar]');await adm.waitForSelector('#fg-pt-i');await adm.fill('#fg-pt-i','Variante B');
  await adm.click('#fg-pt-ok');
  await adm.evaluate((id)=>{_estPublicar(id,_estBuscar(id),9,'Variante B duplicada');},d2.id); // segundo intento mientras corre el primero
  await adm.waitForFunction(()=>!_EST.publicando,null,{timeout:30000});await adm.waitForTimeout(500);
  const ops=nube.json['_opciones.json'].opts.map(o=>o.n+':'+o.nombre);
  console.log('  opciones:',ops.join(', '));
  ok(nube.json['_active10.json'].name==='flyer_viejo_op10.jpg','el _active10.json que ya existía NO se pisó');
  ok(nube.json['_active11.json']&&/_op11\.jpg$/.test(nube.json['_active11.json'].name),'usó la opción 11: '+(nube.json['_active11.json']||{}).name);
  ok(ops.filter(x=>/Variante B/.test(x)).length===1,'[C] el doble clic publicó UNA sola vez');
  ok(d2.estado==='publicado'&&d2.opcion_publicada===11,'diseño publicado como opción 11');
  console.log('  errores de página:',adm.errores.length);
};
