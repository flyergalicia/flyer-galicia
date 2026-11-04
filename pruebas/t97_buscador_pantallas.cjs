// Buscador de pantallas (Cmd+K en Mac, Ctrl+K en Windows): abre con las dos teclas y con
// el botón del header, busca sin importar los acentos, lleva a cada pantalla, muestra sólo
// lo que ve cada perfil y no deja nada a medias por debajo.
const {abrir}=require('./nube.cjs');
const G=require('./nube_gestiones.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const quieto=(p,ms)=>p.waitForTimeout(ms||300);
const abierta=(p)=>p.isVisible('#cmdk-fondo');
const titulos=(p)=>p.$$eval('.cmdk-it .cmdk-tx',(e)=>e.map((x)=>x.textContent));
async function buscar(p,txt){
  if(!await abierta(p))await p.keyboard.press('Control+k');
  await p.fill('#cmdk-q',txt);
}
async function ir(p,txt){await buscar(p,txt);await p.keyboard.press('Enter');await quieto(p);}
const seVe=(p,sel)=>p.evaluate((s)=>{const e=document.querySelector(s);return !!e&&e.getClientRects().length>0;},sel);

module.exports=async(browser)=>{
  // ── Asesor: abrir y cerrar ──
  let p=await abrir(browser,{rol:'asesor'});
  await p.waitForFunction(()=>typeof fgCmdK==='function'&&window._facLoaded);
  await p.focus('#empresa').catch(()=>{});
  const foco0=await p.evaluate(()=>document.activeElement&&document.activeElement.id);
  await p.keyboard.press('Control+k');
  ok(await abierta(p),'Ctrl+K abre el buscador (Windows)');
  ok(await p.evaluate(()=>document.activeElement.id==='cmdk-q'),'el cursor queda en el campo de búsqueda');
  ok(await p.evaluate(()=>{const c=getComputedStyle(document.getElementById('cmdk-q'));return c.boxShadow==='none'&&c.borderTopWidth==='0px';}),'el campo no lleva el recuadro de foco de los formularios');
  await p.keyboard.press('Escape');
  ok(!await abierta(p),'Escape lo cierra');
  ok(await p.evaluate(()=>document.activeElement&&document.activeElement.id)===foco0,'al cancelar el foco vuelve a donde estaba');
  await p.keyboard.press('Meta+k');
  ok(await abierta(p),'Cmd+K abre el buscador (Mac)');
  await p.keyboard.press('Meta+k');
  ok(!await abierta(p),'la misma tecla lo cierra');
  await p.click('#hdr-cmdk');
  ok(await abierta(p),'el botón del header lo abre');
  await p.mouse.click(5,700);
  ok(!await abierta(p),'tocar afuera lo cierra');

  // ── El botón muestra la tecla de cada sistema ──
  const teclas=await p.evaluate(()=>{const de=(v)=>{Object.defineProperty(navigator,'platform',{value:v,configurable:true});return _cmdTecla();};return {win:de('Win32'),mac:de('MacIntel')};});
  ok(teclas.win==='Ctrl K'&&teclas.mac==='\u2318K','el rótulo dice Ctrl K en Windows y ⌘K en Mac');

  // ── Permisos ──
  await buscar(p,'');
  let t=await titulos(p);
  ok(t.includes('Masivo')&&t.includes('Historial'),'el asesor ve el armador');
  ok(!t.includes('Usuarios')&&!t.includes('Auditoría')&&!t.includes('Facultades'),'el asesor no ve el panel de administración');
  await p.keyboard.press('Escape');

  // ── Lleva a cada lugar ──
  await ir(p,'masivo');
  ok(await seVe(p,'#tab-masivo'),'«masivo» + Enter abre la solapa Masivo');
  await buscar(p,'promo');
  ok((await titulos(p))[0]==='Promociones','lo que empieza igual va primero («promo» = Promociones)');
  await p.keyboard.press('Enter');await quieto(p);
  ok(await seVe(p,'#view-promos')&&!await abierta(p),'Enter lleva a Promociones y cierra el buscador');
  await ir(p,'activas');
  ok(await p.evaluate(()=>_promosModo==='activas')&&await seVe(p,'#ptab-activas'),'«activas» abre Promociones → Activas');
  await ir(p,'individual');
  ok(await seVe(p,'#layout')&&await seVe(p,'#tab-individual'),'«individual» vuelve al armador');

  // ── Búsqueda ──
  await buscar(p,'CAMBIAR CLAVE');
  ok((await titulos(p))[0]==='Cambiar mi clave','no importan las mayúsculas y alcanza con palabras sueltas');
  await buscar(p,'prmociones');
  ok((await titulos(p)).includes('Promociones'),'tolera una letra de menos');
  await buscar(p,'zzzzq');
  ok((await p.textContent('#cmdk-l')).includes('No encontré nada')&&(await titulos(p)).length===0,'sin resultados lo dice');
  await p.keyboard.press('Enter');
  ok(await abierta(p),'Enter sin resultados no hace nada');
  await buscar(p,'<img src=x onerror=window.__xss=1>');await quieto(p,100);
  ok(!await p.evaluate(()=>window.__xss||document.querySelector('#cmdk-l img')),'lo escrito no se interpreta como HTML');

  // ── Teclado ──
  await buscar(p,'');
  const total=(await titulos(p)).length;
  ok(await p.evaluate(()=>document.getElementById('cmdk-q').getAttribute('aria-activedescendant')==='cmdk-o0'),'arranca marcada la primera');
  await p.keyboard.press('ArrowUp');
  ok(await p.evaluate(()=>_CMD.sel)===total-1,'flecha arriba desde la primera va a la última');
  await p.keyboard.press('ArrowDown');
  ok(await p.evaluate(()=>_CMD.sel)===0,'flecha abajo desde la última vuelve a la primera');
  await p.keyboard.press('Tab');
  ok(await p.evaluate(()=>document.activeElement.id==='cmdk-q'),'Tab no saca el foco del buscador');
  await p.keyboard.press('Escape');

  // ── Recientes ──
  await buscar(p,'');
  const sec=await p.$$eval('.cmdk-sec',(e)=>e.map((x)=>x.textContent));
  t=await titulos(p);
  ok(sec[0]==='Recientes'&&t[0]==='Individual','lo último usado aparece primero');
  ok(t.filter((x)=>x==='Individual').length===1,'lo reciente no se repite más abajo');
  await p.keyboard.press('Escape');

  // ── Con el mouse ──
  await buscar(p,'historial');
  await p.click('.cmdk-it');await quieto(p);
  ok(await seVe(p,'#tab-historial'),'también se elige con un clic');

  // ── Abre funciones del armador ──
  await ir(p,'cambiar logos');
  ok(await p.evaluate(()=>_fgLg.on)&&await seVe(p,'#tab-individual'),'«cambiar logos» entra al modo edición desde cualquier solapa');
  await p.evaluate(()=>fgLogosModo(false));

  // ── No pisa las teclas de Cambiar logos ──
  await p.evaluate(()=>{switchTab('individual');fgLogosModo(true);});
  await buscar(p,'');
  await p.keyboard.type('vrfni');
  ok(await p.evaluate(()=>!_fgLg.limpio&&!_fgFr.modo&&!_fgRecM.modo&&!_fgIns.modo),'escribir no dispara los atajos V, R, F, N, I');
  ok(await p.inputValue('#cmdk-q')==='vrfni','las letras quedan en el campo');
  await p.keyboard.press('Escape');
  ok(await p.evaluate(()=>_fgLg.on),'Escape cierra el buscador y no sale de Cambiar logos');
  await p.evaluate(()=>fgLogosModo(false));

  // ── Ventanas abiertas ──
  await p.evaluate(()=>{fgConfirm('¿Seguro?',function(){});});
  await quieto(p,150);
  await p.keyboard.press('Control+k');await quieto(p,100);
  ok(!await abierta(p),'con una ventana abierta no se abre encima');
  ok((await p.textContent('body')).includes('Cerrá la ventana abierta'),'y avisa por qué');
  await p.keyboard.press('Escape');await quieto(p,150);
  await p.evaluate(()=>document.querySelectorAll('.fg-cf-ov').forEach((e)=>e.remove()));

  // ── Tanda en curso ──
  await p.evaluate(()=>{_masBusy=true;});
  await p.keyboard.press('Control+k');await quieto(p,100);
  ok(!await abierta(p),'generando un ZIP no deja salir de la pantalla');
  await p.evaluate(()=>{_masBusy=false;});

  // ── Sin sesión ──
  await p.evaluate(()=>{document.getElementById('hdr-right').style.display='none';});
  const def=await p.evaluate(()=>{const e=new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});
  ok(!await abierta(p)&&!def,'sin sesión no se abre y la tecla sigue siendo del navegador');
  await p.evaluate(()=>{document.getElementById('hdr-right').style.display='flex';});
  const ctxA=p.context();await ctxA.close().catch(()=>{});

  // ── Admin ──
  p=await abrir(browser,{rol:'admin'});
  await p.waitForFunction(()=>typeof fgCmdK==='function'&&window._facLoaded);
  await buscar(p,'auditoria');
  ok((await titulos(p))[0]==='Auditoría','busca sin acentos («auditoria» = Auditoría)');
  await p.keyboard.press('Enter');await quieto(p,500);
  ok(await p.evaluate(()=>document.getElementById('admin-panel').classList.contains('open'))&&await seVe(p,'#at-auditoria'),'abre el panel en Auditoría');
  await ir(p,'legales');await quieto(p,300);
  ok(await seVe(p,'#at-legales'),'con el panel abierto salta a otra hoja');
  await ir(p,'benchmark');await quieto(p,500);
  ok(await p.evaluate(()=>!document.getElementById('admin-panel').classList.contains('open'))&&await seVe(p,'#view-benchmark'),'ir a otra pantalla cierra el panel');
  await buscar(p,'tarjetas');await p.keyboard.press('Enter');
  await p.waitForFunction(()=>window.BEN&&BEN.vista==='tarjetas',null,{timeout:8000}).catch(()=>{});
  ok(await p.evaluate(()=>window.BEN&&BEN.vista==='tarjetas'),'lleva a una vista interna de Benchmark');

  // Un flyer por su nombre, desde otra pantalla
  const destino=await p.evaluate(()=>{const o=_facOpts().filter((n)=>n!==_optN(_fgOpt))[0];return {n:o,nom:_optLabel(o)};});
  await ir(p,destino.nom);
  await p.waitForFunction((n)=>_optN(_fgOpt)===n&&document.body.classList.contains('en-armador'),destino.n,{timeout:8000}).catch(()=>{});
  ok(await p.evaluate((n)=>_optN(_fgOpt)===n&&document.body.classList.contains('en-armador'),destino.n),'el nombre de un flyer lleva a ese flyer ('+destino.nom+')');

  // Base de datos: se abre, cambia de panel y se cierra sola al ir a otra pantalla
  await ir(p,'mis asesores');await quieto(p,400);
  await buscar(p,'mis asesores');
  ok((await p.$$eval('.cmdk-it',(e)=>e.map((x)=>x.textContent))).some((x)=>/Mis asesores.*Base de datos/.test(x)),'cada resultado dice de dónde es');
  await p.keyboard.press('Escape');
  await p.evaluate(()=>{closeAdminPanel();openMiPadron('asesores');});await quieto(p,400);
  ok(await seVe(p,'#pad-mine-ov'),'Base de datos abierta');
  await ir(p,'promociones');await quieto(p,400);
  ok(!await seVe(p,'#pad-mine-ov')&&await seVe(p,'#view-promos'),'ir a otra pantalla cierra Base de datos');

  // Un nombre con caracteres raros, cargado por el admin, se pinta como texto
  await p.evaluate(()=>{_OPC[_facOpts()[0]].nombre='<img src=x onerror=window.__xss2=1>';});
  await buscar(p,'');await quieto(p,150);
  ok(!await p.evaluate(()=>window.__xss2||document.querySelector('#cmdk-l img')),'el nombre de un flyer no se interpreta como HTML');
  await p.keyboard.press('Escape');

  // Modo oscuro: se aplica sin moverse de pantalla, y el buscador se sigue leyendo
  await ir(p,'modo oscuro');
  ok(await p.evaluate(()=>document.documentElement.classList.contains('dark'))&&await seVe(p,'#view-promos'),'cambia el tema sin moverse de pantalla');
  await buscar(p,'');await quieto(p,150);
  const col=await p.evaluate(()=>{const c=getComputedStyle(document.querySelector('.cmdk'));return {f:c.backgroundColor,t:c.color};});
  ok(col.f!=='rgb(255, 255, 255)'&&col.t!==col.f,'en oscuro el fondo es oscuro y la letra se distingue');
  await p.screenshot({path:__dirname+'/capturas/t97_oscuro.png'}).catch(()=>{});
  await p.keyboard.press('Escape');
  await p.evaluate(()=>toggleTheme());

  // ── El header no se desborda con todas las solapas del admin ──
  for(const w of [1920,1366,1180,1024]){
    await p.setViewportSize({width:w,height:800});await quieto(p,120);
    const m=await p.evaluate(()=>{const h=document.querySelector('header'),b=document.getElementById('hdr-cmdk').getBoundingClientRect();return {sc:h.scrollWidth,cw:h.clientWidth,der:b.right,ww:window.innerWidth,alto:h.offsetHeight};});
    ok(m.sc<=m.cw+1&&m.der<=m.ww,w+'px: el header entra con el botón ('+m.sc+' ≤ '+m.cw+')');
    await p.screenshot({path:__dirname+'/capturas/t97_header_'+w+'.png',clip:{x:0,y:0,width:w,height:90}}).catch(()=>{});
  }
  await p.setViewportSize({width:1366,height:800});
  await buscar(p,'');await quieto(p,100);
  await p.screenshot({path:__dirname+'/capturas/t97_admin.png'}).catch(()=>{});
  await p.context().close().catch(()=>{});

  // ── Hunter y líder: sólo lo suyo ──
  G.sembrar();
  let h=await G.abrirComo(browser,'hunter',{gestiones:false});
  await buscar(h,'');
  t=await titulos(h);
  ok(t.includes('Buscar flyer')&&t.includes('Mi agenda'),'el hunter ve Buscar flyer y su agenda');
  ok(!t.includes('Masivo')&&!t.includes('Individual')&&!t.includes('Usuarios'),'el hunter no ve el armador ni el panel');
  await h.fill('#cmdk-q','mi agenda');await h.keyboard.press('Enter');
  await h.waitForFunction(()=>window.GES&&GES.tab==='agenda'&&document.querySelector('#ges-root .ges-tabs'),null,{timeout:15000}).catch(()=>{});
  ok(await h.evaluate(()=>window.GES&&GES.tab==='agenda')&&await seVe(h,'#view-gestiones'),'«mi agenda» baja Gestiones y abre la agenda');
  await h.context().close().catch(()=>{});
  let l=await G.abrirComo(browser,'lider',{gestiones:false});
  await buscar(l,'');
  t=await titulos(l);
  ok(t.includes('Agenda del equipo')&&!t.includes('Mis empresas')&&!t.includes('Masivo'),'el líder ve lo de su equipo y no el armador');
  await l.context().close().catch(()=>{});

  // ── Celular ──
  let c=await abrir(browser,{rol:'admin',w:390,h:800,touch:true});
  await c.waitForFunction(()=>typeof fgCmdK==='function'&&window._facLoaded);
  await c.tap('#hdr-cmdk');await quieto(c,150);
  const cel=await c.evaluate(()=>{const b=document.querySelector('.cmdk').getBoundingClientRect(),i=getComputedStyle(document.getElementById('cmdk-q'));return {izq:b.left,der:b.right,ww:window.innerWidth,doc:document.documentElement.scrollWidth,fs:parseFloat(i.fontSize)};});
  ok(cel.izq>=0&&cel.der<=cel.ww&&cel.doc<=cel.ww,'en el celular entra sin barra de costado');
  ok(cel.fs>=16,'el campo tiene 16 px (el iPhone no hace zoom al tocarlo)');
  await c.fill('#cmdk-q','promo');
  await c.tap('.cmdk-it');await quieto(c,300);
  ok(await seVe(c,'#view-promos'),'con el dedo también lleva a la pantalla');
  await c.tap('#hdr-cmdk');await quieto(c,100);
  await c.screenshot({path:__dirname+'/capturas/t97_celular.png'}).catch(()=>{});
  await c.context().close().catch(()=>{});
};
