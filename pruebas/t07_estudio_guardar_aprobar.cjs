const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const tap=(p,ix,iy,centrar)=>p.evaluate(([ix,iy,centrar])=>{const prev=document.querySelector('.prev');if(centrar){const r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+iy*k0)-(pr.top+pr.height/2);}const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+ix*k,y:r.top+iy*k,k};},[ix,iy,centrar]);
module.exports=async(browser)=>{
  // ───────── 1) El asesor arma un diseño y lo guarda
  console.log('\n[1] Asesor arma y guarda');
  const a=await abrir(browser,{rol:'asesor'});
  console.log('  solapa Estudio visible para asesor:',await a.isVisible('#apptab-estudio'));
  await a.evaluate(()=>{ZOOM=1.6;calcSC();redrawNow();});
  await a.click('#fg-lg-btn');
  ok(!(await a.isVisible('#fg-lg-guardar')),'sin cambios no hay botón Guardar');
  let pt=await tap(a,850,2708,true);await a.mouse.click(pt.x,pt.y);
  await a.waitForSelector('#fg-lg-ov .fg-lg-it');await a.fill('#fg-lg-q','farmacia del pueblo');await a.waitForTimeout(400);
  await a.click('#fg-lg-ov .fg-lg-it >> nth=0');await a.waitForSelector('#fg-lg-ov',{state:'detached'});
  // subir un logo de la PC en Megatlon
  pt=await tap(a,668,2708,false);await a.mouse.click(pt.x,pt.y);await a.waitForSelector('#fg-lg-file',{state:'attached'});
  await a.setInputFiles('#fg-lg-file',__dirname+'/datos/gofarma_180.png');await a.waitForSelector('#fg-lg-ov',{state:'detached'});
  // texto
  pt=await tap(a,730,1395,true);await a.mouse.click(pt.x,pt.y);await a.waitForSelector('#fg-lg-escribir');await a.click('#fg-lg-escribir');
  await a.fill('#fg-lg-tx','Lunes y jueves');await a.click('#fg-lg-txt-ok');await a.waitForSelector('#fg-lg-ov',{state:'detached'});
  ok(await a.isVisible('#fg-lg-guardar'),'con cambios aparece "Guardar en Estudio"');
  await a.click('#fg-lg-guardar');await a.waitForSelector('#fg-est-nom');
  await a.fill('#fg-est-nom','Combustible con farmacias');await a.fill('#fg-est-emp','Farmacias del Sur');
  await a.click('#fg-est-ok');await a.waitForSelector('#fg-est-ov',{state:'detached',timeout:8000});
  ok(nube.disenos.length===1,'quedó 1 diseño en la tabla');
  const d=nube.disenos[0];
  ok(d.user_id.endsWith('01')&&d.autor==='Asesor Prueba'&&d.estado==='privado','dueño/autor/estado correctos: '+d.autor+'/'+d.estado);
  ok(d.datos.cambios.length===3&&Object.keys(d.datos.subidos).length===1,'3 cambios y 1 logo subido guardado adentro: '+d.datos.cambios.length+'/'+Object.keys(d.datos.subidos).length);
  ok(/^data:image\/jpeg;base64,/.test(d.miniatura)&&d.miniatura.length<400000,'miniatura chica: '+Math.round(d.miniatura.length/1000)+' KB');
  require('fs').writeFileSync(__dirname+'/capturas/t7_mini.jpg',Buffer.from(d.miniatura.split(',')[1],'base64'));
  console.log('  barra dice:',await a.textContent('#fg-lg-proy'),'| botón:',await a.textContent('#fg-lg-guardar'));
  // editar y guardar los cambios en el mismo
  await a.evaluate(()=>{_fgLg.sel=0;_fgLgTam(120);});await a.waitForTimeout(200);
  await a.click('#fg-lg-guardar');await a.waitForSelector('#fg-est-nom');
  console.log('  ofrece "mismo":',await a.$('input[name=fg-est-modo][value=mismo]').then(x=>!!x));
  await a.click('#fg-est-ok');await a.waitForSelector('#fg-est-ov',{state:'detached'});
  ok(nube.disenos.length===1,'guardar cambios no duplica');
  // ───────── 2) Estudio: lista, usar, pedir
  console.log('\n[2] Solapa Estudio del asesor');
  await a.click('#apptab-estudio');await a.waitForSelector('.est-card');
  ok((await a.$$('.est-card')).length===1,'ve 1 diseño');
  console.log('  botones:',await a.$$eval('.est-card button',x=>x.map(b=>b.textContent)));
  await a.screenshot({path:__dirname+'/capturas/t7_estudio_asesor.png'});
  await a.click('.est-card button[data-acc=pedir]');await a.waitForSelector('#fg-cf-ok');await a.click('#fg-cf-ok');await a.waitForTimeout(600);
  ok(nube.disenos[0].estado==='pedido'&&!!nube.disenos[0].pedido_at,'pedido enviado: '+nube.disenos[0].estado);
  console.log('  botones ahora:',await a.$$eval('.est-card button',x=>x.map(b=>b.textContent)));
  // Usar en una pestaña limpia (como otro día)
  const a2=await abrir(browser,{rol:'asesor'});
  await a2.click('#apptab-estudio');await a2.waitForSelector('.est-card');
  await a2.click('.est-card button[data-acc=usar]');
  await a2.waitForFunction(()=>_fgLg.list.length===3,null,{timeout:15000});
  await a2.waitForTimeout(500);
  ok(await a2.evaluate(()=>_fgLg.list.length===3&&_fgLg.proy&&_fgLg.proy.nombre==='Combustible con farmacias'),'"Usar" aplicó los 3 cambios y recuerda el diseño');
  ok(await a2.evaluate(()=>!!_fgLg.imgs[Object.keys(_fgLg.imgs).find(k=>k.indexOf('pc:')===0)]),'el logo subido de la PC volvió desde la nube');
  ok(await a2.evaluate(()=>document.getElementById('empresa').value==='Farmacias del Sur'),'completó la empresa (estaba vacía)');
  const r=await a2.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=1240;c.height=240;c.getContext('2d').drawImage(fc,0,2620,1240,240,0,0,1240,240);return c.toDataURL('image/png');});
  require('fs').writeFileSync(__dirname+'/capturas/t7_usar.png',Buffer.from(r.split(',')[1],'base64'));
  // ───────── 3) Otro asesor no ve nada; el admin ve todo
  console.log('\n[3] Privacidad');
  const o=await abrir(browser,{rol:'asesor2'});
  await o.click('#apptab-estudio');await o.waitForTimeout(1200);
  ok((await o.$$('.est-card')).length===0,'otro asesor NO ve el diseño ajeno');
  const adm=await abrir(browser,{rol:'admin'});
  await adm.waitForTimeout(800);
  console.log('  numerito de pedidos en la solapa:',await adm.textContent('#est-tab-badge').catch(()=>'(sin)'));
  await adm.click('#apptab-estudio');await adm.waitForSelector('.est-card');
  console.log('  filtros admin:',await adm.$$eval('#est-fil button',x=>x.map(b=>b.textContent.replace(/\s+/g,' '))));
  await adm.click('#est-fil button[data-f=pedidos]');await adm.waitForTimeout(150);
  ok((await adm.$$('.est-card')).length===1,'admin ve el pedido en "Pedidos"');
  await adm.screenshot({path:__dirname+'/capturas/t7_estudio_admin.png'});
  // ───────── 4) Aprobar
  console.log('\n[4] Admin aprueba');
  await adm.click('.est-card button[data-acc=aprobar]');await adm.waitForSelector('#fg-pt-i');
  await adm.fill('#fg-pt-i','Combustible farmacias');await adm.click('#fg-pt-ok');
  await adm.waitForFunction(()=>_FG_OPTS.length===2,null,{timeout:30000}).catch(()=>{});
  await adm.waitForTimeout(1500);
  console.log('  subidas:',nube.subidas.map(s=>s.nombre+' ('+s.bytes+')').join(', '));
  console.log('  opciones en nube:',JSON.stringify(nube.json['_opciones.json']).slice(0,500));
  const n2=nube.json['_opciones.json'].opts.map(x=>x.n).filter(n=>n!==9&&n!==1)[0];
  ok(!!n2,'se creó una opción nueva: '+n2);
  ok(nube.json['_active'+n2+'.json']&&/flyer_\d+_op\d+\.jpg/.test(nube.json['_active'+n2+'.json'].name),'_active'+n2+'.json apunta a una imagen nueva: '+(nube.json['_active'+n2+'.json']||{}).name);
  ok(nube.json['_active9.json'].name===JSON.parse(require('fs').readFileSync(__dirname+'/datos/active9.json','utf8')).name,'el flyer original (opción 9) NO se tocó');
  ok(nube.json['_legal'+n2+'.json']&&nube.json['_legal'+n2+'.json'].text==='Legal de prueba para la opción 9.','el legal se copió de la original');
  ok(nube.json['_facultades.json'].roles.asesor['opcion_'+n2]===true,'el asesor ve la variante nueva (igual que la original)');
  ok(nube.disenos[0].estado==='publicado'&&nube.disenos[0].opcion_publicada===n2,'diseño marcado publicado → opción '+n2);
  const opN=nube.json['_opciones.json'].opts.find(x=>x.n===n2);
  ok(opN&&opN.rubro==='ninguno'&&opN.nombre==='Combustible farmacias','queda fuera del ruteo por rubro, nombre elegido');
  // la imagen publicada tiene los cambios pegados
  const bin=nube.bin[nube.json['_active'+n2+'.json'].name];
  if(bin){const pg=await adm.context().newPage();await pg.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'}).catch(()=>{});
    const url='data:image/jpeg;base64,'+bin.toString('base64');
    const png=await pg.evaluate(async(u)=>{const i=new Image();i.src=u;await i.decode();const c=document.createElement('canvas');c.width=1240;c.height=240;c.getContext('2d').drawImage(i,0,2620,1240,240,0,0,1240,240);return {w:i.naturalWidth,h:i.naturalHeight,d:c.toDataURL('image/png')};},url);
    console.log('  imagen publicada:',png.w+'x'+png.h);require('fs').writeFileSync(__dirname+'/capturas/t7_publicada.png',Buffer.from(png.d.split(',')[1],'base64'));await pg.close();}
  // el asesor, al recargar, ve las dos opciones en la barra
  const a3=await abrir(browser,{rol:'asesor'});
  await a3.waitForFunction(()=>document.querySelectorAll('#fg-optbar .fgo').length===2,null,{timeout:10000}).catch(()=>{});
  console.log('  barra del asesor:',await a3.$$eval('#fg-optbar .fgo',x=>x.map(b=>b.textContent)));
  await a3.click('#apptab-estudio');await a3.waitForSelector('.est-card');
  console.log('  su diseño ahora:',await a3.$$eval('.est-estado',x=>x.map(b=>b.textContent)),'| botones:',await a3.$$eval('.est-card button',x=>x.map(b=>b.textContent)));
  await a3.screenshot({path:__dirname+'/capturas/t7_publicado.png'});
  console.log('\nerrores de página:',[a,a2,o,adm,a3].map(p=>p.errores.length).join(','));
};
