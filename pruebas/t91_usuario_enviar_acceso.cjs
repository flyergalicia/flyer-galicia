// Editar usuario → "Enviar usuario y contraseña por mail" (27-oct): con una
// contraseña nueva escrita aparece el tilde; tildado, el cambio de clave le pide
// a auth-admin que mande usuario + clave al mail elegido (el de la cuenta u otro).
// En el alta no aparece (el mail de alta ya trae la clave).
const {abrir,nube,USERS}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  await p.waitForFunction(()=>typeof openEditUser==='function');
  const T=USERS.asesor;
  await p.evaluate(u=>{_allUsers=[{id:u.id,email:u.email,full_name:u.name,role:'asesor',status:'active'}];},T);
  const vis=s=>p.evaluate(s=>{const e=document.querySelector(s);return !!e&&e.offsetParent!==null;},s);

  // alta: nunca aparece
  await p.evaluate(()=>openNewUser());
  await p.fill('#um-pass','ClaveNueva123');
  ok(!(await vis('#um-env-wrap')),'en Nuevo usuario no aparece el envío (el mail de alta ya trae la clave)');
  await p.evaluate(()=>closeUserModal());

  // editar sin clave: escondido; con clave: aparece
  await p.evaluate(id=>openEditUser(id),T.id);
  ok(!(await vis('#um-env-wrap')),'al editar sin escribir contraseña, el envío está escondido');
  await p.fill('#um-pass','ClaveNueva123');
  ok(await vis('#um-env-wrap'),'al escribir una contraseña nueva aparece "Enviar usuario y contraseña por mail"');
  ok(!(await vis('#um-env-campos')),'sin tildar no se ven los campos');
  await p.check('#um-env');
  ok(await vis('#um-env-campos'),'tildado aparecen "Enviar a" y el nombre');
  ok(await p.inputValue('#um-env-a')===T.email,'"Enviar a" arranca con el mail de la cuenta');
  await p.screenshot({path:__dirname+'/capturas/t91_enviar_acceso.png'});

  // mail inválido: no guarda
  await p.fill('#um-env-a','jefe-sin-arroba');
  nube.llamadasAdmin=[];
  await p.click('#um-submit');await p.waitForTimeout(300);
  ok(/a qué mail/.test(await p.textContent('#um-err'))&&!nube.llamadasAdmin.length,'con un mail inválido avisa y no cambia nada');

  // mail del jefe: va en set_password
  await p.fill('#um-env-a','jefe@bancogalicia.com.ar');await p.fill('#um-env-n','Carlos');
  await p.click('#um-submit');
  await p.waitForFunction(()=>document.getElementById('user-modal').style.display==='none',null,{timeout:5000}).catch(()=>{});
  const sp=(nube.llamadasAdmin||[]).find(b=>b.action==='set_password');
  console.log('  ',JSON.stringify(sp));
  ok(sp&&sp.uid===T.id&&sp.password==='ClaveNueva123'&&sp.enviar_a==='jefe@bancogalicia.com.ar'&&sp.enviar_nombre==='Carlos','cambia la clave y pide mandar usuario + clave al mail elegido');

  // al reabrir arranca destildado (loadUsers repintó la lista: se vuelve a poner el usuario)
  await p.evaluate(u=>{_allUsers=[{id:u.id,email:u.email,full_name:u.name,role:"asesor",status:"active"}];openEditUser(u.id);},T);
  await p.fill('#um-pass','OtraClave456');
  ok(!(await p.isChecked('#um-env'))&&!(await vis('#um-env-campos')),'al reabrir, el tilde arranca apagado');
  nube.llamadasAdmin=[];
  await p.click('#um-submit');await p.waitForTimeout(500);
  const sp2=(nube.llamadasAdmin||[]).find(b=>b.action==='set_password');
  ok(sp2&&!sp2.enviar_a,'sin tildar, el cambio de clave no manda el acceso');
};
