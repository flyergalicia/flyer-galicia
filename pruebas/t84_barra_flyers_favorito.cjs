// Barra de flyers con muchos (26-oct): fijos los 2 primeros del orden del admin, un
// tercero que elige cada uno con la estrellita ("Tu favorito", se guarda en su cuenta:
// profiles.flyer_fav) y el resto en "Otros" (lista con buscador). Con 4 o menos, como siempre.
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const NOMBRES={2:'Flyer',3:'Flyer sin cashback',4:'Flyer Sueldo',5:'Combustible YPF',6:'Súper zona norte',7:'Día de la madre',8:'Rubros Córdoba',10:'Prueba Martín',11:'Verano 2027',12:'Hot Sale'};
const NS=Object.keys(NOMBRES).map(Number);
// cada solapa (Flyer / Flyer Eminent / Flyer Rubros) tiene su propia barra: estos dos no se mezclan
const RUB={13:'Rubros Combustible',14:'Rubros Súper'},NR=[13,14];
module.exports=async(browser)=>{
  const guard={op:nube.json['_opciones.json'],fac:nube.json['_facultades.json']};
  const act9=nube.json['_active9.json'];
  nube.json['_opciones.json']={opts:NS.map(n=>({n,nombre:NOMBRES[n],solapa:'flyer'})).concat(NR.map(n=>({n,nombre:RUB[n],solapa:'rubros'})))};
  const fac={opcion_1:false,opcion_9:false,promos_buscar:true};NS.concat(NR).forEach(n=>{fac['opcion_'+n]=true;});
  nube.json['_facultades.json']={roles:{asesor:fac}};
  NS.concat(NR).forEach(n=>{nube.json['_active'+n+'.json']=Object.assign({},act9,{imageUrl:act9.imageUrl.replace('flyer_t9','flyer_t'+(n%10))});nube.json['_legal'+n+'.json']={text:'Legal '+n};});
  delete nube.favs['00000000-0000-4000-8000-000000000001'];
  try{
    const p=await abrir(browser,{rol:'asesor',opt:2});
    await p.waitForSelector('#fg-optbar .fgo-mas',{timeout:10000});
    const a=await p.evaluate(()=>{const b=document.getElementById('fg-optbar');
      return {fijas:[...b.querySelectorAll('.fgo')].map(x=>x.textContent),vacio:!!b.querySelector('.fgo-vacio'),n:String(b.querySelector('.fgo-mas').getAttribute('data-otras').split(',').length),mas:b.querySelector('.fgo-mas-t').textContent};});
    console.log('  ',JSON.stringify(a));
    ok(a.fijas.join('|')==='Flyer|Flyer sin cashback','fijos los 2 primeros del orden ('+a.fijas.join(', ')+')');
    ok(a.vacio,'sin favorito elegido se ve el lugar "Tu favorito" punteado');
    ok(a.mas==='Otros'&&a.n==='8','"Otros" con el número de los demás ('+a.n+')');
    // abrir "Otros": la lista con los 8, con buscador (más de 6)
    await p.click('#fg-optbar .fgo-mas');
    const b=await p.evaluate(()=>{const pop=document.getElementById('fg-optmas');
      return {vis:!!pop&&!pop.hidden,items:[...pop.querySelectorAll('.fgm-it .fgm-t')].map(x=>x.textContent),buscar:!document.getElementById('fg-optmas-q').hidden,foco:document.activeElement&&document.activeElement.id};});
    ok(b.vis&&b.items.length===8&&b.items[0]==='Flyer Sueldo','la lista de "Otros" muestra los 8 en orden ('+b.items.join(', ')+')');
    ok(b.buscar&&b.foco==='fg-optmas-q','con más de 6 hay buscador y queda listo para escribir');
    await p.fill('#fg-optmas-q','super');
    const c=await p.evaluate(()=>[...document.querySelectorAll('#fg-optmas .fgm-it .fgm-t')].map(x=>x.textContent));
    ok(c.length===1&&c[0]==='Súper zona norte','el buscador ignora tildes y mayúsculas ("super" → '+c.join(', ')+')');
    // elegir uno de la lista: el botón "Otros" pasa a llevar su nombre y queda marcado
    await p.keyboard.press('Enter');
    await p.waitForFunction(()=>_optN(_fgOpt)===6&&!_fgOptCargando(),null,{timeout:10000});
    const d=await p.evaluate(()=>{const m=document.querySelector('#fg-optbar .fgo-mas');return {on:m.classList.contains('on'),t:m.querySelector('.fgo-mas-t').textContent,abierta:!document.getElementById('fg-optmas').hidden};});
    ok(d.on&&d.t==='Súper zona norte'&&!d.abierta,'Enter elige: se cierra la lista y "Otros" muestra «Súper zona norte» marcado');
    // estrellita: queda como favorito, a la vista, y se guarda en la cuenta
    await p.click('#fg-optbar .fgo-mas');
    await p.click("#fg-optmas .fgm-st[data-o=\"5\"]");
    await p.waitForTimeout(300);
    const e=await p.evaluate(()=>{const b=document.getElementById('fg-optbar'),f=b.querySelector('.fgo-fav');
      return {fav:f&&f.textContent,vacio:!!b.querySelector('.fgo-vacio'),n:String(b.querySelector('.fgo-mas').getAttribute('data-otras').split(',').length),abierta:!document.getElementById('fg-optmas').hidden,
        estrella:!!document.querySelector('#fg-optmas .fgm-st.on[data-o="5"]'),total:b.querySelectorAll('.fgo,.fgo-mas,.fgo-vacio').length};});
    console.log('  ',JSON.stringify(e),JSON.stringify(nube.favs));
    ok(e.fav==='Combustible YPF'&&!e.vacio&&e.total===4,'la estrellita deja «Combustible YPF» como tercero, a la vista (4 botones en la barra)');
    ok(e.n==='7'&&e.abierta&&e.estrella,'"Otros" pasa a 7 y la lista sigue abierta con su estrella marcada');
    ok(JSON.stringify(nube.favs['00000000-0000-4000-8000-000000000001'])==='[5]','se guardó en la cuenta (flyer_fav = [5])');
    // tocar el favorito lo elige
    await p.keyboard.press('Escape');
    const f0=await p.evaluate(()=>document.getElementById('fg-optmas').hidden);
    ok(f0,'Escape cierra la lista');
    await p.click('#fg-optbar .fgo-fav');
    await p.waitForFunction(()=>_optN(_fgOpt)===5&&!_fgOptCargando(),null,{timeout:10000});
    const f=await p.evaluate(()=>({fav:document.querySelector('#fg-optbar .fgo-fav').classList.contains('on'),mas:document.querySelector('#fg-optbar .fgo-mas-t').textContent}));
    ok(f.fav&&f.mas==='Otros','tocar el favorito lo elige y "Otros" vuelve a decir Otros');
    // un borrador abierto sobre el favorito: su pestaña se lee (antes quedaba aplastada, sólo el lápiz)
    const bo=await p.evaluate(()=>{_fgProtos.push({id:'t84b',opcion:5,nombre:'Borrador 1',temp:true,logos:[]});_facSyncOptBar();_fgRenderOptBar();
      const b=document.getElementById('fg-optbar'),x=b.querySelector('.fgp[data-p="t84b"]'),t=x.querySelector('.fgp-t');
      const r={ancho:Math.round(x.getBoundingClientRect().width),entra:t.scrollWidth<=t.clientWidth+1,barra:b.scrollWidth<=b.clientWidth+1};
      return r;});
    await p.screenshot({path:__dirname+'/capturas/t84_borrador.png',clip:await p.evaluate(()=>{const r=document.getElementById('fg-optbar').getBoundingClientRect();return {x:r.x-10,y:r.y-10,width:r.width+20,height:r.height+20};})});
    ok(bo.ancho>=96&&bo.barra,'con un borrador abierto su pestaña se ve entera o con "…" ('+bo.ancho+' px) y la barra entra');
    await p.evaluate(()=>{_fgProtos=_fgProtos.filter(x=>x.id!=='t84b');_facSyncOptBar();_fgRenderOptBar();});
    // tocar afuera cierra la lista
    await p.click('#fg-optbar .fgo-mas');
    await p.mouse.click(5,700);
    ok(await p.evaluate(()=>document.getElementById('fg-optmas').hidden),'tocar afuera cierra la lista');
    ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
    await p.context().close();
    // otra PC / recargar: el favorito vuelve desde la cuenta; y en el celular la barra entra
    const q=await abrir(browser,{rol:'asesor',opt:2,w:375,h:760,touch:true});
    await q.waitForSelector('#fg-optbar .fgo-mas',{timeout:10000});
    const g=await q.evaluate(()=>{const b=document.getElementById('fg-optbar');return {fav:(b.querySelector('.fgo-fav')||{}).textContent,ancho:b.scrollWidth<=b.clientWidth+1,alto:b.getBoundingClientRect().height};});
    ok(g.fav==='Combustible YPF','al volver a entrar, el favorito sigue (viene de la cuenta)');
    ok(g.ancho&&g.alto<60,'en el celular la barra entra en una línea (alto '+Math.round(g.alto)+' px)');
    await q.screenshot({path:__dirname+'/capturas/t84_celular.png'});
    // sacar el favorito con la estrella
    await q.click('#fg-optbar .fgo-mas');await q.click('#fg-optmas .fgm-st[data-o="5"]');await q.waitForTimeout(300);
    ok(await q.evaluate(()=>!!document.querySelector('#fg-optbar .fgo-vacio')),'tocar de nuevo la estrella lo saca y vuelve "Tu favorito"');
    ok(JSON.stringify(nube.favs['00000000-0000-4000-8000-000000000001'])==='[]','y se guarda vacío');
    // un favorito que ya no está habilitado no cuenta; con 4 o menos flyers, todos a la vista
    const h=await q.evaluate(()=>{_fgFav=[99];const a=_fgOptPartes([2,3,4,5,6]);return {fav:a.fav,otras:a.otras.length,cuatro:_fgOptPartes([2,3,4,5])};});
    ok(h.fav===null&&h.otras===3,'un favorito que ya no está habilitado no ocupa lugar');
    ok(h.cuatro===null,'con 4 flyers o menos la barra queda como siempre');
    // solapas separadas: la lista de Flyer no trae los de Rubros, y el favorito es uno por solapa
    const s=await q.evaluate(()=>{_fgFav=[5];fgOptFav(13);const fav=_fgFav.slice();
      return {flyer:_facOptsDe('flyer').indexOf(13)<0,rubros:_facOptsDe('rubros').join(','),fav,otras:document.querySelector('#fg-optbar .fgo-mas').getAttribute('data-otras')};});
    ok(s.flyer&&s.rubros==='13,14'&&!/1[34]/.test(s.otras),'cada solapa tiene su barra: los de Flyer Rubros no aparecen en la de Flyer');
    ok(s.fav.join(',')==='5,13','el favorito es uno por solapa (fijar uno de Rubros no saca el de Flyer)');
    ok(q.errores.length===0,'sin errores de JavaScript ('+q.errores.join(' | ')+')');
    await q.context().close();
  }finally{
    nube.json['_opciones.json']=guard.op;nube.json['_facultades.json']=guard.fac;
    NS.concat(NR).filter(n=>n!==9).forEach(n=>{delete nube.json['_active'+n+'.json'];delete nube.json['_legal'+n+'.json'];});
  }
};
