// Admin → Uso: tablero con flyers por flyer, perfil y semana
const {abrir,nube,USERS}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const ahora=Date.now(),dia=86400000,iso=d=>new Date(ahora-d*dia).toISOString();
  const A=USERS.asesor.id,B='00000000-0000-4000-8000-0000000000b0';
  nube.perfiles=[{id:A,full_name:'Asesor Prueba',email_asesor:'asesor.prueba@bancogalicia.com.ar',role:'asesor'},
    {id:B,full_name:'Hunter Prueba',email_asesor:'hunter.prueba@bancogalicia.com.ar',role:'hunter'},
    {id:USERS.admin.id,full_name:'Admin Prueba',email_asesor:'admin.prueba@bancogalicia.com.ar',role:'admin'}];
  const ft=o=>JSON.stringify({opcion:o});
  nube.logs=[
    {user_id:A,is_bulk:false,bulk_count:0,flyer_type:ft(9),created_at:iso(2)},
    {user_id:A,is_bulk:false,bulk_count:0,flyer_type:ft(9),created_at:iso(3)},
    {user_id:A,is_bulk:true,bulk_count:10,flyer_type:ft(9),created_at:iso(10)},
    {user_id:B,is_bulk:false,bulk_count:0,flyer_type:ft(1),created_at:iso(4)},
    {user_id:B,is_bulk:false,bulk_count:0,flyer_type:ft(9),created_at:iso(60)}, // fuera de 30 días
  ];
  const p=await abrir(browser,{rol:'admin'});
  await p.evaluate(()=>{openAdminPanel&&openAdminPanel();});await p.waitForTimeout(300);
  await p.evaluate(()=>{switchAdminTab(null,'uso');});
  await p.waitForSelector('#uso-body .uso-card',{timeout:10000});await p.waitForTimeout(300);
  const R=await p.evaluate(()=>({cards:[...document.querySelectorAll('#uso-body .uso-cards:first-child .uso-card-n')].map(x=>x.textContent),
    secs:[...document.querySelectorAll('#uso-body .uso-sec')].map(s=>s.querySelector('h4').textContent+': '+[...s.querySelectorAll('.uso-fila')].map(f=>f.querySelector('.uso-et').textContent+'='+f.querySelector('.uso-n').textContent).join(', '))}));
  console.log('  30 días:',JSON.stringify(R,null,0));
  ok(R.cards[0]==='13'&&R.cards[1]==='2','30 días: 13 flyers (2+10 de una tanda+1) de 2 usuarios');
  ok(R.secs.some(s=>/Por flyer: Combustible=12/.test(s)),'por flyer: Combustible 12');
  ok(R.secs.some(s=>/Por perfil: Asesor=12, Hunter=1/.test(s)),'por perfil: Asesor 12, Hunter 1');
  await p.screenshot({path:__dirname+'/capturas/t48_uso.png'});
  await p.click('#uso-per button[data-d="90"]');await p.waitForTimeout(800);
  const t90=await p.evaluate(()=>document.querySelector('#uso-body .uso-card-n').textContent);
  ok(t90==='14','90 días: suma el de hace 60 días (14)');
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);
  ok(await p.evaluate(()=>document.getElementById('uso-body').scrollWidth<=document.getElementById('uso-body').clientWidth+1),'en el celular no hay scroll lateral');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
