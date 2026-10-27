// Estudio (26-oct): el admin pregunta antes de aprobar (el autor responde) y
// comparte una copia de un diseño con una persona, aunque no tenga Estudio.
// Además: Config → Flyer junta al final las opciones sin flyer con la aclaración.
const {abrir,nube,USERS}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const tap=(p,ix,iy,centrar)=>p.evaluate(([ix,iy,centrar])=>{const prev=document.querySelector('.prev');if(centrar){const r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+iy*k0)-(pr.top+pr.height/2);}const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+ix*k,y:r.top+iy*k,k};},[ix,iy,centrar]);
const botones=p=>p.$$eval('.est-card button',x=>x.map(b=>b.textContent.trim()));
module.exports=async(browser)=>{
  nube.disenos.length=0;nube.mensajes=[];
  // ───────── 1) El asesor guarda un diseño (un texto) y pide publicarlo
  console.log('\n[1] Asesor guarda y pide publicar');
  const a=await abrir(browser,{rol:'asesor'});
  await a.evaluate(()=>{ZOOM=1.6;calcSC();redrawNow();});
  await a.click('#fg-lg-btn');
  let pt=await tap(a,730,1395,true);await a.mouse.click(pt.x,pt.y);await a.waitForSelector('#fg-lg-escribir');await a.click('#fg-lg-escribir');
  await a.fill('#fg-lg-tx','Lunes y jueves');await a.click('#fg-lg-txt-ok');await a.waitForSelector('#fg-lg-ov',{state:'detached'});
  await a.click('#fg-lg-guardar');await a.waitForSelector('#fg-est-nom');
  await a.fill('#fg-est-nom','Combustible con días');await a.click('#fg-est-ok');await a.waitForSelector('#fg-est-ov',{state:'detached',timeout:8000});
  await a.click('#apptab-estudio');await a.waitForSelector('.est-card');
  await a.click('.est-card button[data-acc=pedir]');await a.waitForSelector('#fg-cf-ok');await a.click('#fg-cf-ok');await a.waitForTimeout(600);
  const d=nube.disenos[0];
  ok(d&&d.estado==='pedido','pedido enviado: '+(d&&d.estado));

  // ───────── 2) El admin pregunta
  console.log('\n[2] Admin pregunta');
  const adm=await abrir(browser,{rol:'admin'});
  await adm.click('#apptab-estudio');await adm.waitForSelector('.est-card');
  await adm.click('#est-fil button[data-f=pedidos]');await adm.waitForTimeout(150);
  let bs=await botones(adm);
  ok(bs.includes('Preguntar')&&bs.includes('Aprobar y publicar')&&bs.includes('No aprobar'),'el pedido ofrece Aprobar · Preguntar · No aprobar: '+bs.join(' | '));
  await adm.click('.est-card button[data-acc=preguntar]');await adm.waitForSelector('#fg-pt-i');
  await adm.fill('#fg-pt-i','¿Los días son los de la promo del 25%?');await adm.click('#fg-pt-ok');
  await adm.waitForFunction(()=>document.querySelector('.est-card .est-estado.est-consulta'),null,{timeout:8000});
  await adm.waitForSelector('.est-card .est-msg');
  ok(d.estado==='consulta'&&nube.mensajes.length===1,'quedó en consulta con 1 mensaje: '+d.estado+'/'+nube.mensajes.length);
  ok(/Esperando respuesta/.test(await adm.textContent('.est-card .est-estado')),'el admin ve "Esperando respuesta"');
  ok(/25%/.test(await adm.textContent('.est-card .est-hilo')),'el admin ve su pregunta en la tarjeta');
  bs=await botones(adm);
  ok(bs.includes('Otra pregunta')&&bs.includes('Aprobar y publicar'),'en consulta igual puede aprobar o volver a preguntar: '+bs.join(' | '));
  ok((await adm.$$('.est-card')).length===1,'sigue en "Pedidos"');
  await adm.screenshot({path:__dirname+'/capturas/t86_admin_pregunto.png'});

  // ───────── 3) El autor se entera y responde
  console.log('\n[3] Autor responde');
  const a2=await abrir(browser,{rol:'asesor'});
  await a2.waitForFunction(()=>_estAv.consulta.length===1,null,{timeout:8000}).catch(()=>{});
  ok(await a2.evaluate(()=>_estAv.consulta.length===1),'al entrar sabe que tiene 1 pregunta');
  ok((await a2.textContent('#est-tab-badge').catch(()=>''))==='1','numerito 1 en la solapa Estudio');
  ok(await a2.isVisible('#hdr-msg')&&/pregunta sobre un diseño/.test(await a2.evaluate(()=>document.getElementById('hdr-msg').parentNode.title)),'numerito en el sobre del encabezado, con su explicación');
  const toast=await a2.evaluate(()=>Array.from(document.querySelectorAll('div')).map(x=>x.textContent).filter(t=>/te hizo una pregunta sobre/.test(t)).length>0);
  ok(toast,'cartel "El administrador te hizo una pregunta…"');
  await a2.click('#apptab-estudio');await a2.waitForSelector('.est-card .est-msg');
  ok(/Te hicieron una pregunta/.test(await a2.textContent('.est-card .est-estado')),'el autor ve "Te hicieron una pregunta"');
  bs=await botones(a2);
  ok(bs.includes('Responder')&&bs.includes('Cancelar pedido')&&!bs.includes('Pedir que se publique'),'ofrece Responder y Cancelar pedido: '+bs.join(' | '));
  await a2.screenshot({path:__dirname+'/capturas/t86_autor_pregunta.png'});
  await a2.click('.est-card button[data-acc=responder]');await a2.waitForSelector('#fg-pt-i');
  await a2.fill('#fg-pt-i','Sí, son los del 25%.');await a2.click('#fg-pt-ok');
  await a2.waitForFunction(()=>document.querySelector('.est-card .est-estado.est-pedido')&&document.querySelectorAll('.est-card .est-msg').length===2,null,{timeout:8000}).catch(()=>{});
  ok(d.estado==='pedido'&&nube.mensajes.length===2,'volvió a "pedido" con 2 mensajes: '+d.estado+'/'+nube.mensajes.length);
  ok((await a2.$$('.est-card .est-msg')).length===2,'el autor ve pregunta y respuesta');
  ok(await a2.evaluate(()=>_estAv.consulta.length===0&&document.getElementById('est-tab-badge').style.display==='none'),'se fue el numerito');

  // ───────── 4) El admin ve la respuesta, pregunta otra vez y no aprueba
  console.log('\n[4] Admin: otra pregunta y No aprobar desde la consulta');
  const adm2=await abrir(browser,{rol:'admin'});
  await adm2.click('#apptab-estudio');await adm2.waitForSelector('.est-card .est-msg');
  ok((await adm2.$$('.est-card .est-msg')).length===2&&/son los del 25/.test(await adm2.textContent('.est-card .est-hilo')),'el admin ve la respuesta');
  await adm2.click('.est-card button[data-acc=preguntar]');await adm2.waitForSelector('#fg-pt-i');
  await adm2.fill('#fg-pt-i','¿Y el logo de abajo?');await adm2.click('#fg-pt-ok');
  await adm2.waitForFunction(()=>document.querySelectorAll('.est-card .est-msg').length===3,null,{timeout:8000}).catch(()=>{});
  ok(d.estado==='consulta'&&nube.mensajes.length===3,'tercera vuelta: '+d.estado+'/'+nube.mensajes.length);
  // el autor tenía Estudio abierto: el refresco de 90 s trae la pregunta a la tarjeta (no sólo al numerito)
  await a2.evaluate(()=>_estPoll());
  await a2.waitForFunction(()=>Array.from(document.querySelectorAll('.est-card button')).some(b=>b.textContent==='Responder'),null,{timeout:8000}).catch(()=>{});
  ok(await a2.evaluate(()=>Array.from(document.querySelectorAll('.est-card button')).some(b=>b.textContent==='Responder')&&document.querySelectorAll('.est-card .est-msg').length===3),'con Estudio abierto, el refresco muestra la pregunta nueva y Responder');
  // y al admin con Estudio abierto le llega la respuesta sin volver a entrar
  await a2.click('.est-card button[data-acc=responder]');await a2.waitForSelector('#fg-pt-i');await a2.fill('#fg-pt-i','Lo corrijo.');await a2.click('#fg-pt-ok');
  await a2.waitForFunction(()=>document.querySelector('.est-card .est-estado.est-pedido'),null,{timeout:8000}).catch(()=>{});
  await adm2.evaluate(()=>_estPoll());
  await adm2.waitForFunction(()=>document.querySelectorAll('.est-card .est-msg').length===4,null,{timeout:8000}).catch(()=>{});
  ok((await adm2.$$('.est-card .est-msg')).length===4,'con Estudio abierto, al admin le llega la respuesta en la tarjeta');
  await adm2.click('.est-card button[data-acc=rechazar]');await adm2.waitForSelector('#fg-pt-i');
  await adm2.fill('#fg-pt-i','Falta corregir el logo');await adm2.click('#fg-pt-ok');await adm2.waitForTimeout(700);
  ok(d.estado==='rechazado'&&d.nota_admin==='Falta corregir el logo','No aprobar funciona estando en consulta: '+d.estado);
  ok((await adm2.$$('.est-card .est-msg')).length===0,'resuelto: el hilo se esconde y queda la nota');

  // ───────── 5) Compartir con una persona
  console.log('\n[5] Admin comparte el diseño con otra persona');
  nube.perfiles=Object.values(USERS).map(u=>({id:u.id,full_name:u.name,email:u.email,role:u.role,status:'active'}));
  await adm2.click('#est-fil button[data-f=todos]');await adm2.waitForTimeout(150);
  await adm2.click('.est-card button[data-acc=compartir]');await adm2.waitForSelector('#fg-comp-ov .fg-comp-it');
  const gente=await adm2.$$eval('#fg-comp-ov .fg-comp-n',x=>x.map(n=>n.textContent));
  ok(gente.length===1&&/Otra Persona/.test(gente[0]),'la lista no trae al admin ni al autor: '+gente.join(', '));
  ok(await adm2.evaluate(()=>document.getElementById('fg-comp-ok').disabled),'sin elegir a nadie, Compartir apagado');
  await adm2.fill('#fg-comp-q','zzz');await adm2.waitForTimeout(100);
  ok(/Nadie con ese nombre/.test(await adm2.textContent('#fg-comp-l')),'el buscador filtra');
  await adm2.fill('#fg-comp-q','otra');await adm2.waitForTimeout(100);
  await adm2.check('#fg-comp-ov input[type=checkbox]');
  ok(/con 1 persona/.test(await adm2.textContent('#fg-comp-ok')),'el botón dice "Compartir con 1 persona"');
  await adm2.screenshot({path:__dirname+'/capturas/t86_compartir.png'});
  await adm2.click('#fg-comp-ok');await adm2.waitForSelector('#fg-comp-ov',{state:'detached'});
  const copia=nube.disenos.find(x=>x.user_id===USERS.asesor2.id);
  ok(copia&&copia.compartido_por==='Admin Prueba'&&copia.compartido_de===d.id&&copia.estado==='privado'&&copia.datos.cambios.length===1,'la otra persona tiene su copia (privada, con el cambio)');
  await adm2.waitForFunction(()=>(_EST.lista||[]).length===2,null,{timeout:8000}).catch(()=>{});
  // volver a compartir: le llega la versión nueva, no una segunda copia
  await adm2.click('.est-card:not(:has(.est-comp)) button[data-acc=compartir]');await adm2.waitForSelector('#fg-comp-ov .fg-comp-it');
  ok(/ya tiene una copia/.test(await adm2.textContent('#fg-comp-l')),'avisa que ya tiene una copia');
  await adm2.check('#fg-comp-ov input[type=checkbox]');await adm2.click('#fg-comp-ok');await adm2.waitForSelector('#fg-comp-ov',{state:'detached'});
  ok(nube.disenos.filter(x=>x.user_id===USERS.asesor2.id).length===1,'volver a compartir no duplica');

  // ───────── 6) La otra persona, SIN la facultad Estudio
  console.log('\n[6] Quien recibe, sin la facultad Estudio');
  const fac=nube.json['_facultades.json'],antes=JSON.stringify(fac);
  fac.roles.asesor.estudio=false;
  const o=await abrir(browser,{rol:'asesor2'});
  await o.waitForFunction(()=>_estAv.comp===1,null,{timeout:8000}).catch(()=>{});
  ok(await o.isVisible('#apptab-estudio'),'ve la solapa Estudio porque le compartieron algo');
  const toast2=await o.evaluate(()=>Array.from(document.querySelectorAll('div')).map(x=>x.textContent).filter(t=>/te compartió «Combustible con días»/.test(t)).length>0);
  ok(toast2,'cartel "Admin Prueba te compartió «…»"');
  await o.click('#apptab-estudio');await o.waitForSelector('.est-card');
  ok(/Te lo compartió Admin Prueba/.test(await o.textContent('.est-card .est-comp')),'la tarjeta dice "Te lo compartió Admin Prueba"');
  bs=await botones(o);
  ok(bs.includes('Usar')&&!bs.includes('Pedir que se publique')&&!bs.includes('Compartir'),'puede usarlo pero no pedir publicarlo: '+bs.join(' | '));
  ok(!(await o.$('#est-mg-lista')),'sin la sección Marcas guardadas');
  ok(/te comparti/.test(await o.textContent('.est-sub')),'el texto de arriba explica que son diseños compartidos');
  await o.screenshot({path:__dirname+'/capturas/t86_recibe.png'});
  await o.click('.est-card button[data-acc=usar]');
  await o.waitForFunction(()=>_fgLg.list.length===1,null,{timeout:15000}).catch(()=>{});
  ok(await o.evaluate(()=>_fgLg.list.length===1),'"Usar" abre el diseño en el armador');
  ok(await o.evaluate(()=>{const g=document.getElementById('fg-lg-guardar');return !g||g.hidden;}),'sin facultad no aparece "Guardar en Estudio"');
  // a quien no le compartieron nada y no tiene la facultad, no le aparece
  const sin=await abrir(browser,{rol:'asesor'});
  await sin.waitForTimeout(800);
  ok(!(await sin.isVisible('#apptab-estudio')),'sin facultad y sin nada compartido, no hay solapa Estudio');
  nube.json['_facultades.json']=JSON.parse(antes);

  // ───────── 7) Config → Flyer: las opciones sin flyer, al final y explicadas
  console.log('\n[7] Config → Flyer');
  nube.json['_opciones.json']={opts:[{n:3,nombre:'VIEJO Algo',solapa:'flyer'},{n:9,nombre:'Combustible',solapa:'flyer'}]};
  const adm3=await abrir(browser,{rol:'admin'});
  const txt=await adm3.evaluate(async()=>{let h=document.getElementById('upload-history');if(!h){h=document.createElement('div');h.id='upload-history';document.body.appendChild(h);}
    loadUploadHistory();for(let i=0;i<40&&!/Sin flyer activo/.test(h.textContent);i++)await new Promise(r=>setTimeout(r,100));return h.textContent;});
  // la opción 1 existe siempre (sin flyer en la nube simulada): son 2
  ok(/Sin flyer activo \(2\)/.test(txt)&&/Config → Opciones → Quitar/.test(txt),'aclaración de cómo sacarlas');
  ok(txt.indexOf('Combustible')<txt.indexOf('VIEJO Algo'),'la que tiene flyer va primero, la vieja al final');
  nube.json['_opciones.json']={opts:[{n:9,nombre:'Combustible',solapa:'flyer'}]};
  delete nube.perfiles;
  for(const p of [a,adm,a2,adm2,o,sin,adm3])ok(!p.errores.length,'sin errores de la página'+(p.errores.length?': '+p.errores.join(' / '):''));
};
