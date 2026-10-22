// Atajos de una letra en el modo edición: V = Vista previa, R = Recortar, F = Armar franja, N = Nuevo borrador.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  const est=()=>p.evaluate(()=>({limpio:!!_fgLg.limpio,rec:!!_fgRecM.modo,fr:!!_fgFr.modo}));
  for(const k of ['v','r','f','n'])await p.keyboard.press(k);
  await p.waitForTimeout(80);
  let e=await est();
  ok(!e.limpio&&!e.rec&&!e.fr,'fuera del modo edición no hacen nada');
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  const soltar=()=>p.evaluate(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
  await soltar();
  // V
  await p.keyboard.press('v');await p.waitForTimeout(80);
  ok((await est()).limpio,'V prende la vista previa');
  ok((await p.textContent('#fg-lg-ver-t'))==='Seguir editando','el botón pasa a "Seguir editando"');
  await p.keyboard.press('r');await p.keyboard.press('f');await p.waitForTimeout(80);
  e=await est();ok(e.limpio&&!e.rec&&!e.fr,'en la vista previa R y F no hacen nada');
  await p.keyboard.press('V');await p.waitForTimeout(80);
  ok(!(await est()).limpio,'V otra vez vuelve a editar');
  // R
  await p.keyboard.press('r');await p.waitForTimeout(80);
  e=await est();ok(e.rec&&!e.fr,'R prende el modo Recortar');
  ok((await p.textContent('#fg-lg-rec'))==='Cancelar recorte','el botón dice "Cancelar recorte"');
  await p.keyboard.press('r');await p.waitForTimeout(80);
  ok(!(await est()).rec,'R otra vez lo cancela');
  // F
  await p.keyboard.press('f');await p.waitForTimeout(80);
  e=await est();ok(e.fr&&!e.rec,'F prende el modo Armar franja');
  await p.keyboard.press('f');await p.waitForTimeout(80);
  ok(!(await est()).fr,'F otra vez lo cancela');
  // de un modo al otro
  await p.keyboard.press('r');await p.keyboard.press('f');await p.waitForTimeout(80);
  e=await est();ok(e.fr&&!e.rec,'de Recortar a Armar franja con F');
  await p.keyboard.press('f');await p.waitForTimeout(80);
  // N = Nuevo borrador
  const nb=()=>p.evaluate(()=>_fgProtos.filter(x=>x.temp).length);
  const nb0=await nb();
  await p.keyboard.press('n');await p.waitForTimeout(400);
  ok(await nb()===nb0+1,'N abre un borrador nuevo');
  await p.keyboard.press('v');await p.waitForTimeout(80);
  const nb1=await nb();await p.keyboard.press('n');await p.waitForTimeout(300);
  ok(await nb()===nb1,'en la vista previa N no hace nada');
  await p.keyboard.press('v');await p.waitForTimeout(80);
  await p.keyboard.press('r');await p.waitForTimeout(80);
  await p.keyboard.press('n');await p.waitForTimeout(300);
  ok(await nb()===nb1,'en el modo Recortar N no hace nada');
  await p.keyboard.press('r');await p.waitForTimeout(80);
  // escribiendo en un campo: no
  await p.evaluate(()=>{const i=document.createElement('input');i.id='zz-i';i.type='text';document.body.appendChild(i);i.focus();});
  for(const k of ['v','r','f','n'])await p.keyboard.press(k);
  await p.waitForTimeout(80);
  e=await est();ok(!e.limpio&&!e.rec&&!e.fr,'con el foco en un campo de texto no hacen nada');
  await p.evaluate(()=>document.getElementById('zz-i').remove());
  // con una ventana abierta: no
  await soltar();
  await p.evaluate(()=>{_fgLgAbrir(_fgLgManual(600,2650,300,110));});
  for(const k of ['v','r','f','n'])await p.keyboard.press(k);
  await p.waitForTimeout(80);
  e=await est();ok(!e.limpio&&!e.rec&&!e.fr,'con la ventana de un logo abierta no hacen nada');
  await p.evaluate(()=>document.getElementById('fg-lg-x').click());
  await p.keyboard.press('Control+v');await p.waitForTimeout(80);
  ok(!(await est()).limpio,'Ctrl+V (pegar) no prende la vista previa');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
