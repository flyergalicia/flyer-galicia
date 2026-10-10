// ══ GESTIONES COMERCIALES ═══════════════════════════════════════════════════
// Visitas, ferias y acciones en empresas, con sus prospectos y altas, y el
// tablero. Este archivo NO se carga al abrir la app: auth.js lo pide con
// _lib(['ges']) la primera vez que alguien abre "Gestiones" o toca "Registrar
// gestión" (ver "GESTIONES COMERCIALES" al final de auth.js). Depende de lo que
// auth.js ya dejó definido: _sb, _me, _admin, _esPrueba, _rolVigente(),
// _esHunter(), _esLider(), _escHtml, _escAttr, showToast, fgConfirm, _lib,
// _gesAvisoCargar, switchApp.
//
// Quién ve y quién escribe lo decide la base (migraciones 014/015): acá sólo se
// pinta. El tablero llega ya sumado (gestiones_tablero), no fila por fila.

// Estilos de estas pantallas: viajan con el módulo (no en index.html), así
// quien nunca abre Gestiones no los baja. Se inyectan una sola vez.
var GES_CSS=":root{--ges-ok:#2E7D32;--ges-ok-soft:#E6F3E7;--ges-info:#1D4070;--ges-info-soft:#E8EEF7;--ges-warn:#9A5B00;--ges-warn-soft:#FFF2DC;--ges-b1:#F5B79A;--ges-grid:#EDE7DC;}\nhtml.dark{--ges-ok:#7BC47F;--ges-ok-soft:#1C2E1E;--ges-info:#8FB3E8;--ges-info-soft:#1C2636;--ges-warn:#F0B35A;--ges-warn-soft:#33281A;--ges-b1:#7A3E22;--ges-grid:#2A2E34;}\n.ges-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;}\n.ges-h1{font-size:1.12rem;font-weight:800;margin:0 0 2px;color:var(--ink);text-wrap:balance;}\n.ges-sub{font-size:.78rem;color:var(--gray);margin:0 0 12px;line-height:1.45;}\n.ges-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:14px;flex-wrap:wrap;}\n.ges-tab{border:0;background:none;padding:9px 14px;font-size:.8rem;font-weight:700;color:var(--gray);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:inline-flex;gap:6px;align-items:center;}\n.ges-tab:hover{color:var(--ink);}\n.ges-tab.on{color:var(--accent-2,var(--accent));border-bottom-color:var(--accent);}\n.ges-tab .fg-badge{margin-left:0;}\n.ges-cargando,.ges-vacio{padding:22px;text-align:center;color:var(--gray);font-size:.8rem;line-height:1.55;}\n.ges-vacio{border:1px dashed var(--border);border-radius:var(--r-m,12px);background:var(--card);}\n.ges-vacio .btn{margin-top:10px;}\n.ges-nota,.ges-mini{font-size:.68rem;color:var(--gray);}\n.ges-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-m,12px);box-shadow:var(--sh-1);}\n.ges-pad{padding:14px 16px;}\n.ges-lbl{font-size:.62rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gray);}\n.ges-inp{border:1px solid var(--border);background:var(--field,var(--card));color:var(--ink);border-radius:var(--r-s,8px);padding:8px 10px;font-size:.8rem;min-width:0;}\n.ges-inp:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-ring,rgba(242,97,34,.16));}\n.ges-sel{min-width:150px;}\n.ges-tool{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}\n.ges-tool input[type=search]{flex:1;min-width:200px;}\n.ges-btn-sm{padding:6px 12px !important;font-size:.74rem !important;}\n.ges-link{border:0;background:none;color:var(--accent-2,var(--accent));font-weight:700;font-size:.76rem;cursor:pointer;padding:2px 0;}\n.ges-peligro{color:var(--danger) !important;}\n.ges-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:.64rem;font-weight:800;white-space:nowrap;}\n.ges-c-info{background:var(--ges-info-soft);color:var(--ges-info);}\n.ges-c-ok{background:var(--ges-ok-soft);color:var(--ges-ok);}\n.ges-c-bad{background:var(--danger-soft);color:var(--danger);}\n.ges-c-warn{background:var(--ges-warn-soft);color:var(--ges-warn);}\n.ges-ok{color:var(--ges-ok);}\n.ges-prueba{color:var(--ges-warn);font-weight:700;}\n.ges-list{display:flex;flex-direction:column;gap:8px;}\n.ges-row{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;border:1px solid var(--border);background:var(--card);border-radius:var(--r-s,8px);padding:10px 12px;cursor:pointer;box-shadow:var(--sh-1);color:var(--ink);}\n.ges-row:hover{border-color:var(--accent-line);}\n.ges-row.nueva{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-ring,rgba(242,97,34,.16));}\n.ges-row-t{display:flex;justify-content:space-between;align-items:center;gap:8px;}\n.ges-row-e{font-weight:800;font-size:.86rem;}\n.ges-row-d,.ges-row-n{font-size:.72rem;color:var(--gray);}\n.ges-row-n b{color:var(--ink);}\n.ges-row-n b.ges-ok{color:var(--ges-ok);}\n.ges-row-nueva{font-size:.72rem;color:var(--accent-2,var(--accent));font-weight:700;}\n.ges-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px;}\n.ges-kpis.ges-k4{grid-template-columns:repeat(4,minmax(0,1fr));}\n.ges-kpis.ges-k5{grid-template-columns:repeat(5,minmax(0,1fr));}\n.ges-kpi{padding:12px 14px;}\n.ges-kv{font-size:1.5rem;font-weight:800;line-height:1.1;margin-top:4px;color:var(--ink);font-variant-numeric:tabular-nums;}\n.ges-kd{font-size:.66rem;color:var(--gray);margin-top:2px;}\n.ges-kpi.hi{border-color:var(--accent-line);background:linear-gradient(180deg,var(--accent-soft),var(--card));}\n.ges-kpi.hi .ges-kv{color:var(--accent-2,var(--accent));}\n@media (max-width:1000px){.ges-kpis,.ges-kpis.ges-k5{grid-template-columns:repeat(3,minmax(0,1fr));}}\n@media (max-width:520px){.ges-kpis,.ges-kpis.ges-k4,.ges-kpis.ges-k5{grid-template-columns:repeat(2,minmax(0,1fr));}}\n.ges-tw{overflow-x:auto;}\n.ges-tbl{border-collapse:collapse;width:100%;font-size:.78rem;color:var(--ink);}\n.ges-tbl th{text-align:left;font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;color:var(--gray);font-weight:800;padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap;}\n.ges-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:middle;}\n.ges-tbl tr:last-child td{border-bottom:0;}\n.ges-tbl .r{text-align:right;font-variant-numeric:tabular-nums;}\n.ges-num{font-variant-numeric:tabular-nums;white-space:nowrap;}\n.ges-hb{display:flex;align-items:center;gap:8px;}\n.ges-hb span{font-size:.7rem;font-weight:700;min-width:34px;font-variant-numeric:tabular-nums;}\n.ges-bar{flex:1;height:6px;border-radius:3px;background:var(--ges-grid);overflow:hidden;min-width:50px;}\n.ges-bar i{display:block;height:100%;background:var(--accent);border-radius:3px;}\n.ges-est{border:1px solid var(--border);background:var(--field,var(--card));color:var(--ink);border-radius:6px;padding:4px 6px;font-size:.72rem;font-weight:700;}\n.ges-est.alta{background:var(--ges-ok-soft);color:var(--ges-ok);border-color:transparent;}\n.ges-est.desc{background:var(--danger-soft);color:var(--danger);border-color:transparent;}\n.ges-est.gest{background:var(--ges-warn-soft);color:var(--ges-warn);border-color:transparent;}\nspan.ges-est{display:inline-block;}\n.ges-x{width:26px;height:26px;border:0;border-radius:50%;background:transparent;color:var(--gray);cursor:pointer;font-size:1rem;line-height:1;}\n.ges-x:hover{background:var(--danger-soft);color:var(--danger);}\n.ges-det-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px;}\n.ges-acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}\n.ges-auto{display:flex;gap:8px;align-items:center;background:var(--ges-info-soft);color:var(--ges-info);border-radius:var(--r-s,8px);padding:9px 12px;font-size:.76rem;margin:0 0 12px;line-height:1.45;white-space:pre-wrap;}\n.ges-auto b{font-weight:800;}\n.ges-aviso{background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:var(--r-s,8px);padding:9px 12px;font-size:.76rem;margin:0 0 12px;color:var(--ink);}\n.ges-ch{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:10px;flex-wrap:wrap;}\n.ges-ct{font-weight:800;font-size:.86rem;color:var(--ink);}\n.ges-add{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) auto;gap:8px;margin-top:12px;align-items:center;}\n@media (max-width:640px){.ges-add{grid-template-columns:1fr 1fr;}.ges-add input:first-child{grid-column:1/-1;}}\n.ges-paste{margin-top:12px;border:1px dashed var(--accent-line);border-radius:var(--r-s,8px);padding:10px 12px;background:var(--accent-soft);}\n.ges-paste summary{cursor:pointer;font-weight:700;font-size:.78rem;color:var(--ink);}\n.ges-paste textarea{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:.74rem;margin:6px 0;resize:vertical;box-sizing:border-box;}\n.ges-paste-res{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;}\n.ges-filtros{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;}\n.ges-filtros label{display:flex;flex-direction:column;gap:4px;}\n.ges-filtros .ges-check{flex-direction:row;align-items:center;gap:6px;font-size:.76rem;color:var(--ink);padding-bottom:8px;}\n.ges-xls{margin-left:auto;}\n.ges-g2{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px;margin-bottom:14px;}\n.ges-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}\n@media (max-width:1000px){.ges-g2,.ges-g3{grid-template-columns:1fr;}}\n.ges-leg{display:flex;gap:12px;font-size:.68rem;color:var(--gray);}\n.ges-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px;}\n.ges-leg i.l1{background:var(--ges-b1);}\n.ges-leg i.l2{background:var(--accent);}\n.ges-svg{width:100%;height:auto;display:block;}\n.ges-svg .ges-grid{stroke:var(--ges-grid);stroke-width:1;}\n.ges-svg .ges-ax{font-size:10px;fill:var(--gray);}\n.ges-svg .ges-val{font-size:10px;font-weight:700;fill:var(--ink);}\n.ges-svg .ges-b1{fill:var(--ges-b1);}\n.ges-svg .ges-b2{fill:var(--accent);}\n.ges-fun{display:flex;flex-direction:column;gap:9px;}\n.ges-fun-r{display:grid;grid-template-columns:96px minmax(0,1fr) 64px;gap:10px;align-items:center;font-size:.76rem;color:var(--ink);}\n.ges-fun-b{height:24px;border-radius:6px;background:var(--accent);display:flex;align-items:center;padding-left:8px;color:#fff;font-weight:800;font-size:.72rem;min-width:30px;box-sizing:border-box;white-space:nowrap;}\n.ges-fun-b.f2{background:var(--accent-2,var(--accent));}\n.ges-fun-b.f3{background:var(--ges-ok);}\n.ges-fun-p{text-align:right;color:var(--gray);font-weight:700;font-size:.7rem;font-variant-numeric:tabular-nums;}\n.ges-ov{position:fixed;inset:0;background:rgba(20,18,15,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10000;}\n.ges-mod{background:var(--card);color:var(--ink);border-radius:var(--r-m,12px);box-shadow:var(--sh-3);width:min(580px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:18px 20px;box-sizing:border-box;}\n.ges-mt{margin:0 0 2px;font-size:1.02rem;font-weight:800;}\n.ges-ms{margin:0 0 12px;font-size:.78rem;color:var(--gray);}\n.ges-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0;}\n.ges-form .full{grid-column:1/-1;}\n.ges-form label,.ges-form .ges-fl{display:flex;flex-direction:column;gap:5px;font-size:.7rem;font-weight:700;color:var(--ink-2,var(--gray));}\n.ges-form textarea{resize:vertical;}\n@media (max-width:520px){.ges-form{grid-template-columns:1fr;}}\n.ges-pills{display:flex;gap:6px;flex-wrap:wrap;}\n.ges-pills button{border:1px solid var(--border);background:var(--card);color:var(--ink-2,var(--ink));border-radius:20px;padding:6px 12px;font-size:.74rem;font-weight:700;cursor:pointer;}\n.ges-pills button[aria-pressed=\"true\"]{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-2,var(--accent));}\n.ges-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:6px;}";
(function(){if(document.getElementById('ges-css'))return;var st=document.createElement('style');st.id='ges-css';st.textContent=GES_CSS;document.head.appendChild(st);})();

var GES_RENTAS=['Hasta $1,5 M','De $1,5 a 3 M','De $3 a 6 M','Más de $6 M'];
var GES_TIPO={visita:'Visita',feria:'Feria',accion:'Acción'};
var GES_MOD={presencial:'Presencial',virtual:'Virtual'};
var GES_FREC={unica:'Única',semanal:'Semanal',quincenal:'Quincenal',mensual:'Mensual'};
var GES_EST={planificada:'Planificada',realizada:'Realizada',cancelada:'Cancelada'};
var GES_PEST={prospecto:'Prospecto',en_gestion:'En gestión',alta:'Alta',descartado:'Descartado'};
var GES_MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

var GES={tab:null,lista:null,listaP:null,personas:null,perP:null,det:null,detG:null,detPros:[],
  q:'',fEst:'',empresas:null,qEmp:'',tab0:null,
  f:{per:'90',tipo:'',hun:'',due:'',prueba:true},tablero:null};

// ── Utilidades ──────────────────────────────────────────────────────────────
function gesE(s){return _escHtml(s==null?'':String(s));}
function gesP2(n){return (n<10?'0':'')+n;}
function gesIso(d){return d.getFullYear()+'-'+gesP2(d.getMonth()+1)+'-'+gesP2(d.getDate());}
function gesHoy(){return gesIso(new Date());}
function gesFecha(s){
  if(!s)return '';
  var a=String(s).slice(0,10).split('-');
  return (+a[2])+' '+GES_MES[(+a[1])-1]+(a[0]!==String(new Date().getFullYear())?' '+a[0]:'');
}
function gesPct(a,b){return b?Math.round(a*100/b)+'%':'—';}
function gesN(x){return (+x||0).toLocaleString('es-AR');}
function gesYo(){return _me?_me.id:null;}
function gesRol(){return _rolVigente();}
function gesEsAdmin(){return !!_admin;}
function gesPuedePrueba(){return !!(_admin||_esPrueba);}
function gesNom(id){
  if(!id)return '—';
  if(id===gesYo())return 'Vos';
  var p=GES.personas&&GES.personas[id];
  return p?p.nombre:'Usuario dado de baja';
}
function gesPuedeEditar(g){var y=gesYo();return !!g&&(g.hunter_id===y||g.creada_por===y||gesEsAdmin());}
function gesPuedeBorrar(g){return !!g&&(g.creada_por===gesYo()||gesEsAdmin());}

// CUIL: 11 dígitos, prefijo válido y dígito verificador.
function gesCuilLimpio(c){return String(c||'').replace(/\D/g,'');}
function gesCuilOk(c){
  c=gesCuilLimpio(c);
  if(c.length!==11||!/^(20|23|24|27|30|33|34)/.test(c))return false;
  var m=[5,4,3,2,7,6,5,4,3,2],s=0;for(var i=0;i<10;i++)s+=(+c[i])*m[i];
  var r=11-(s%11);r=r===11?0:(r===10?9:r);
  return r===+c[10];
}
function gesCuilFmt(c){c=gesCuilLimpio(c);return c.length===11?c.slice(0,2)+'-'+c.slice(2,10)+'-'+c[10]:c;}
// Renta: un importe ("2.500.000", "$ 1,2 M") cae en uno de los 4 rangos (1..4).
function gesRentaDe(v){
  var s=String(v==null?'':v).trim();if(!s)return null;
  var low=s.toLowerCase();
  for(var i=0;i<GES_RENTAS.length;i++)if(low===GES_RENTAS[i].toLowerCase())return i+1;
  var mill=/\bm(ill)?\b|millon/.test(low);
  var num=parseFloat(low.replace(/[^\d,.]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));
  if(!isFinite(num)||num<=0)return null;
  if(mill||num<1000)num=num*1000000;
  return num<=1500000?1:num<=3000000?2:num<=6000000?3:4;
}

// ── Personas (nombres para mostrar, elegir hunter y filtrar) ────────────────
function gesPersonas(){
  if(GES.personas)return Promise.resolve(GES.personas);
  if(GES.perP)return GES.perP;
  GES.perP=_sb.rpc('gestiones_personas').then(function(r){
    var m={};((r&&r.data)||[]).forEach(function(p){m[p.id]=p;});
    GES.personas=m;GES.perP=null;return m;
  }).catch(function(){GES.perP=null;GES.personas={};return GES.personas;});
  return GES.perP;
}
function gesLista(force){
  if(GES.lista&&!force)return Promise.resolve(GES.lista);
  if(GES.listaP&&!force)return GES.listaP;
  GES.listaP=_sb.rpc('gestiones_lista',{p_limit:500}).then(function(r){
    if(r&&r.error)throw r.error;
    GES.lista=(r&&r.data)||[];GES.listaP=null;return GES.lista;
  }).catch(function(e){GES.listaP=null;throw e;});
  return GES.listaP;
}

// ── Entrada: la vista "Gestiones" ───────────────────────────────────────────
function gesTabs(){
  var r=gesRol();
  if(r==='hunter')return [['lista','Mis gestiones'],['tablero','Tablero']];
  if(r==='lider')return [['tablero','Tablero del equipo'],['lista','Gestiones del equipo']];
  return [['empresas','Mis empresas'],['lista','Gestiones'],['tablero','Tablero']];
}
function gesInit(tab){
  var tabs=gesTabs();
  // Si cambió el perfil (vista previa del admin) la solapa anterior puede no existir.
  if(tab)GES.tab=tab;
  if(!GES.tab||!tabs.some(function(t){return t[0]===GES.tab;}))GES.tab=tabs[0][0];
  gesRender();
  gesPersonas().then(function(){gesRender();});
}
function gesIr(tab){GES.tab=tab;GES.det=null;gesRender();}
function gesRender(){
  var root=document.getElementById('ges-root');if(!root)return;
  var tabs=gesTabs();
  var head='<div class="ges-top"><div><h2 class="ges-h1">Gestiones comerciales</h2>'+
    '<p class="ges-sub">'+gesSubtitulo()+'</p></div>'+
    (_esPrueba?'<span class="ges-chip ges-c-warn" title="Lo que hagas con esta cuenta queda marcado como prueba y no suma en el tablero de los demás">Cuenta de prueba</span>':'')+
    '</div>'+
    '<div class="ges-tabs" role="tablist">'+tabs.map(function(t){
      return '<button type="button" role="tab" aria-selected="'+(GES.tab===t[0]&&!GES.det)+'" class="ges-tab'+(GES.tab===t[0]&&!GES.det?' on':'')+'" onclick="gesIr(\''+t[0]+'\')">'+t[1]+
        (t[0]==='lista'&&gesRol()==='hunter'&&_gesAviso?' <span class="fg-badge">'+_gesAviso+'</span>':'')+'</button>';
    }).join('')+'</div>';
  root.innerHTML=head+'<div id="ges-body" class="ges-body"><div class="ges-cargando">Cargando&hellip;</div></div>';
  if(GES.det){gesDetalle(GES.det);return;}
  if(GES.tab==='empresas')gesEmpresas();
  else if(GES.tab==='lista')gesListaRender();
  else gesTablero();
}
function gesSubtitulo(){
  var r=gesRol();
  if(r==='hunter')return 'Las visitas que te derivaron y las que registraste. Después de cada una cargá los prospectos y marcá las altas.';
  if(r==='lider')return 'Cómo viene tu equipo: visitas, prospectos, altas y conversión.';
  return 'Lo que se hizo con tus empresas. Vos derivás; la carga la hacen los hunters.';
}
function gesBody(html){var b=document.getElementById('ges-body');if(b)b.innerHTML=html;}
function gesErr(e){
  var m=(e&&e.message)||String(e||'');
  gesBody('<div class="ges-vacio">No se pudo cargar. '+gesE(m)+'<br><button type="button" class="btn bg" onclick="GES.lista=null;gesRender()">Reintentar</button></div>');
}
// Lo llama auth.js cuando cambia el número de derivadas nuevas.
function gesAvisoSync(){
  var v=document.getElementById('view-gestiones');
  if(v&&v.style.display!=='none'&&!GES.det&&GES.tab==='lista'){GES.lista=null;gesRender();}
}

// ── Chips ───────────────────────────────────────────────────────────────────
function gesChipEst(g){
  if(g.estado==='planificada')return '<span class="ges-chip ges-c-info">Planificada &middot; '+gesE(gesFecha(g.fecha))+'</span>';
  if(g.estado==='cancelada')return '<span class="ges-chip ges-c-bad">Cancelada</span>';
  return '<span class="ges-chip ges-c-ok">Realizada</span>';
}
function gesNueva(g){return g.hunter_id===gesYo()&&!g.visto_hunter;}

// ── Lista ───────────────────────────────────────────────────────────────────
function gesListaRender(){
  gesLista().then(function(l){
    var q=_padNorm(GES.q),est=GES.fEst;
    var vis=l.filter(function(g){
      if(est&&g.estado!==est)return false;
      if(q&&_padNorm(g.empresa).indexOf(q)<0&&_padNorm(gesNom(g.hunter_id)).indexOf(q)<0&&_padNorm(gesNom(g.dueno_id)).indexOf(q)<0)return false;
      return true;
    });
    // Las derivadas que todavía no abrió, primero.
    vis.sort(function(a,b){return (gesNueva(b)?1:0)-(gesNueva(a)?1:0);});
    var tool='<div class="ges-tool">'+
      '<input type="search" class="ges-inp" id="ges-q" placeholder="Buscar empresa o persona" value="'+_escAttr(GES.q)+'" oninput="GES.q=this.value;gesListaPintar()" autocomplete="off">'+
      '<select class="ges-inp ges-sel" id="ges-fest" onchange="GES.fEst=this.value;gesListaPintar()">'+
        '<option value="">Todos los estados</option>'+Object.keys(GES_EST).map(function(k){return '<option value="'+k+'"'+(GES.fEst===k?' selected':'')+'>'+GES_EST[k]+'</option>';}).join('')+
      '</select>'+
      (gesRol()==='hunter'?'<button type="button" class="btn bg" onclick="switchApp(\'hunter\')">+ Registrar desde Buscar flyer</button>':'')+
      '</div>';
    var filas=vis.length?vis.slice(0,300).map(gesFila).join(''):
      '<div class="ges-vacio">'+(l.length?'Nada coincide con el filtro.':(gesRol()==='hunter'?
        'Todavía no hay gestiones. Buscá una empresa en <b>Buscar flyer</b> y tocá <b>Registrar gestión</b>.':
        'Todavía no hay gestiones. Derivá una visita desde <b>Mis empresas</b>.'))+'</div>';
    gesBody(tool+'<div class="ges-list" id="ges-list">'+filas+'</div>'+(vis.length>300?'<p class="ges-nota">Se muestran las 300 más recientes. Usá el buscador para encontrar otras.</p>':''));
  }).catch(gesErr);
}
// Re-pinta sólo la lista (no el buscador, para no perder el foco al tipear).
function gesListaPintar(){
  var host=document.getElementById('ges-list');if(!host||!GES.lista){gesListaRender();return;}
  var q=_padNorm(GES.q),est=GES.fEst;
  var vis=GES.lista.filter(function(g){
    if(est&&g.estado!==est)return false;
    if(q&&_padNorm(g.empresa).indexOf(q)<0&&_padNorm(gesNom(g.hunter_id)).indexOf(q)<0&&_padNorm(gesNom(g.dueno_id)).indexOf(q)<0)return false;
    return true;
  });
  vis.sort(function(a,b){return (gesNueva(b)?1:0)-(gesNueva(a)?1:0);});
  host.innerHTML=vis.length?vis.slice(0,300).map(gesFila).join(''):'<div class="ges-vacio">Nada coincide con el filtro.</div>';
}
function gesFila(g){
  var r=gesRol(),quien;
  if(r==='hunter')quien=g.origen==='derivada'?'Te la derivó '+gesE(gesNom(g.creada_por)):'Empresa de '+gesE(gesNom(g.dueno_id));
  else quien='Hunter: '+gesE(gesNom(g.hunter_id))+' &middot; Oficial: '+gesE(gesNom(g.dueno_id));
  return '<button type="button" class="ges-row'+(gesNueva(g)?' nueva':'')+'" onclick="gesAbrirDet(\''+g.id+'\')">'+
    '<span class="ges-row-t"><span class="ges-row-e">'+gesE(g.empresa)+'</span>'+gesChipEst(g)+'</span>'+
    '<span class="ges-row-d">'+GES_TIPO[g.tipo]+' '+(GES_MOD[g.modalidad]||'').toLowerCase()+' &middot; '+gesE(gesFecha(g.fecha))+
      (g.frecuencia&&g.frecuencia!=='unica'?' &middot; '+GES_FREC[g.frecuencia].toLowerCase():'')+' &middot; '+quien+
      (g.prueba?' &middot; <span class="ges-prueba">prueba</span>':'')+'</span>'+
    (g.estado==='realizada'?'<span class="ges-row-n"><b>'+gesN(g.n_pros)+'</b> prospectos &middot; <b class="ges-ok">'+gesN(g.n_altas)+'</b> altas &middot; '+gesPct(g.n_altas,g.n_pros)+'</span>':'')+
    (gesNueva(g)?'<span class="ges-row-nueva">Nueva'+(g.nota?': '+gesE(g.nota):'')+'</span>':'')+
  '</button>';
}

// ── Mis empresas (oficial) ──────────────────────────────────────────────────
function gesEmpresas(){
  var pEmp=GES.empresas?Promise.resolve(GES.empresas):
    _sb.from('padron_empresas').select('empresa').eq('user_id',gesYo()).order('empresa').then(function(r){
      if(r&&r.error)throw r.error;GES.empresas=(r&&r.data)||[];return GES.empresas;});
  Promise.all([pEmp,gesLista()]).then(function(res){
    var emps=res[0],l=res[1],yo=gesYo();
    var st={};
    l.forEach(function(g){
      if(g.dueno_id!==yo)return;
      var k=_padNorm(g.empresa),x=st[k]||(st[k]={v:0,p:0,a:0,plan:0,ult:null,hun:null});
      if(g.estado==='realizada'){x.v++;x.p+=+g.n_pros||0;x.a+=+g.n_altas||0;if(!x.ult||g.fecha>x.ult){x.ult=g.fecha;x.hun=g.hunter_id;}}
      if(g.estado==='planificada')x.plan++;
    });
    var tot={v:0,p:0,a:0};Object.keys(st).forEach(function(k){tot.v+=st[k].v;tot.p+=st[k].p;tot.a+=st[k].a;});
    var kp='<div class="ges-kpis ges-k4">'+gesKpi('Visitas realizadas',gesN(tot.v),'en tus empresas')+gesKpi('Prospectos',gesN(tot.p),'')+
      gesKpi('Altas',gesN(tot.a),'sueldos en Galicia',true)+gesKpi('Conversión',gesPct(tot.a,tot.p),'altas ÷ prospectos')+'</div>';
    if(!emps.length){gesBody(kp+'<div class="ges-vacio">Todavía no tenés empresas cargadas. Cargalas en tu nombre &rarr; <b>Base de datos</b> &rarr; Mis empresas y vuelven a aparecer acá para derivarlas.</div>');return;}
    GES._emps=emps.map(function(e){var k=_padNorm(e.empresa);return {empresa:e.empresa,k:k,s:st[k]||{v:0,p:0,a:0,plan:0}};});
    gesBody(kp+'<div class="ges-tool"><input type="search" class="ges-inp" placeholder="Buscar en tus empresas" value="'+_escAttr(GES.qEmp)+'" oninput="GES.qEmp=this.value;gesEmpPintar()" autocomplete="off"></div>'+
      '<div class="ges-card"><div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Empresa</th><th class="r">Visitas</th><th class="r">Prospectos</th><th class="r">Altas</th><th>Conversión</th><th>Último hunter</th><th></th></tr></thead>'+
      '<tbody id="ges-emp-tb"></tbody></table></div></div>');
    gesEmpPintar();
  }).catch(gesErr);
}
function gesEmpPintar(){
  var tb=document.getElementById('ges-emp-tb');if(!tb||!GES._emps)return;
  var q=_padNorm(GES.qEmp);
  var vis=GES._emps.filter(function(e){return !q||e.k.indexOf(q)>=0;}).slice(0,400);
  tb.innerHTML=vis.map(function(e,i){
    var s=e.s,c=s.p?s.a/s.p:0,idx=GES._emps.indexOf(e);
    return '<tr><td><b>'+gesE(e.empresa)+'</b>'+(s.plan?'<div class="ges-mini">'+s.plan+' planificada'+(s.plan>1?'s':'')+'</div>':'')+'</td>'+
      '<td class="r">'+s.v+'</td><td class="r">'+s.p+'</td><td class="r"><b>'+s.a+'</b></td>'+
      '<td><div class="ges-hb"><div class="ges-bar"><i style="width:'+Math.round(c*100)+'%"></i></div><span>'+gesPct(s.a,s.p)+'</span></div></td>'+
      '<td>'+(s.hun?gesE(gesNom(s.hun)):'<span class="ges-mini">—</span>')+'</td>'+
      '<td class="r"><button type="button" class="btn bg ges-btn-sm" onclick="gesDerivar('+idx+')">Derivar</button></td></tr>';
  }).join('')||'<tr><td colspan="7" class="ges-mini" style="padding:14px">Ninguna empresa coincide.</td></tr>';
}

// ── Modal propio (por encima de todo, se cierra con Escape o tocando afuera) ─
function gesModal(html,ancho){
  gesCerrar();
  var ov=document.createElement('div');ov.id='ges-ov';ov.className='ges-ov';
  ov.innerHTML='<div class="ges-mod'+(ancho?' ancho':'')+'" role="dialog" aria-modal="true">'+html+'</div>';
  ov.addEventListener('mousedown',function(e){if(e.target===ov)gesCerrar();});
  document.body.appendChild(ov);
  document.addEventListener('keydown',gesEsc,true);
  var f=ov.querySelector('input:not([type=hidden]),select,textarea,button');if(f)setTimeout(function(){try{f.focus();}catch(e){}},30);
}
function gesEsc(e){if(e.key==='Escape'&&document.getElementById('ges-ov')&&!document.getElementById('fg-cf-ov')){e.stopPropagation();gesCerrar();}}
function gesCerrar(){var o=document.getElementById('ges-ov');if(o)o.remove();document.removeEventListener('keydown',gesEsc,true);}
function gesPills(name,opts,val){
  return '<div class="ges-pills" data-name="'+name+'">'+Object.keys(opts).map(function(k){
    return '<button type="button" data-v="'+k+'" aria-pressed="'+(val===k)+'" onclick="gesPill(this)">'+opts[k]+'</button>';
  }).join('')+'</div>';
}
function gesPill(b){
  var p=b.parentNode;p.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
}
function gesPillVal(name){
  var ov=document.getElementById('ges-ov');if(!ov)return null;
  var ps=ov.querySelectorAll('.ges-pills');
  for(var i=0;i<ps.length;i++){
    if(ps[i].getAttribute('data-name')!==name)continue;
    var bs=ps[i].querySelectorAll('button');
    for(var j=0;j<bs.length;j++)if(bs[j].getAttribute('aria-pressed')==='true')return bs[j].getAttribute('data-v');
  }
  return null;
}
function gesVal(id){var e=document.getElementById(id);return e?e.value:'';}
function gesInt(id){var v=gesVal(id).replace(/\D/g,'');return v===''?null:Math.min(1000000,parseInt(v,10));}

// Formulario común de registrar / derivar / editar.
function gesFormHtml(g,modo){
  g=g||{};
  var hoy=gesHoy();
  var h='<div class="ges-form">'+
    '<div class="full ges-fl"><span>Tipo</span>'+gesPills('tipo',GES_TIPO,g.tipo||'visita')+'</div>'+
    '<div class="ges-fl"><span>Modalidad</span>'+gesPills('modalidad',GES_MOD,g.modalidad||'presencial')+'</div>'+
    '<div class="ges-fl"><span>¿Se repite?</span>'+gesPills('frecuencia',GES_FREC,g.frecuencia||'unica')+'</div>'+
    '<label><span>Fecha</span><input type="date" id="gf-fecha" class="ges-inp" value="'+_escAttr(g.fecha||hoy)+'"></label>';
  if(modo==='derivar'){
    h+='<label><span>Hunter</span><select id="gf-hunter" class="ges-inp">'+gesHuntersOpts(g.hunter_id)+'</select></label>';
  }else{
    h+='<label><span>Estado</span><select id="gf-estado" class="ges-inp">'+Object.keys(GES_EST).map(function(k){
      return '<option value="'+k+'"'+((g.estado||'realizada')===k?' selected':'')+'>'+GES_EST[k]+'</option>';}).join('')+'</select></label>'+
      '<label><span>Dotación de la empresa</span><input type="text" inputmode="numeric" id="gf-dot" class="ges-inp" value="'+(g.dotacion!=null?g.dotacion:'')+'" placeholder="Empleados"></label>'+
      '<label><span>Asistentes o contactados</span><input type="text" inputmode="numeric" id="gf-asis" class="ges-inp" value="'+(g.asistentes!=null?g.asistentes:'')+'" placeholder="Personas que hablaron con vos"></label>';
    if(modo==='editar'&&(g.creada_por===gesYo()||gesEsAdmin())&&g.origen==='derivada')
      h+='<label><span>Hunter</span><select id="gf-hunter" class="ges-inp">'+gesHuntersOpts(g.hunter_id)+'</select></label>';
  }
  h+='<label class="full"><span>Nota</span><textarea id="gf-nota" class="ges-inp" rows="2" maxlength="2000" placeholder="'+
    (modo==='derivar'?'Con quién hablar, horario, qué flyer llevar':'Cómo fue, próximos pasos')+'">'+gesE(g.nota||'')+'</textarea></label>'+
  '</div>';
  return h;
}
function gesHuntersOpts(sel){
  var ps=GES.personas||{},ids=Object.keys(ps).filter(function(id){return ps[id].rol==='hunter';});
  ids.sort(function(a,b){return ps[a].nombre.localeCompare(ps[b].nombre);});
  if(!ids.length)return '<option value="">No hay hunters activos</option>';
  return ids.map(function(id){
    return '<option value="'+_escAttr(id)+'"'+(id===sel?' selected':'')+'>'+gesE(ps[id].nombre)+(ps[id].es_prueba?' (prueba)':'')+'</option>';
  }).join('');
}
function gesFormLeer(modo){
  var d={tipo:gesPillVal('tipo'),modalidad:gesPillVal('modalidad'),frecuencia:gesPillVal('frecuencia'),
    fecha:gesVal('gf-fecha')||gesHoy(),nota:gesVal('gf-nota').trim()||null};
  if(modo==='derivar'){d.hunter_id=gesVal('gf-hunter');d.estado='planificada';}
  else{
    d.estado=gesVal('gf-estado')||'realizada';d.dotacion=gesInt('gf-dot');d.asistentes=gesInt('gf-asis');
    var h=document.getElementById('gf-hunter');if(h&&h.value)d.hunter_id=h.value;
  }
  return d;
}

// ── Registrar (Hunter, desde Buscar flyer) ──────────────────────────────────
function gesRegistrar(r){
  if(!r||!r.empresa){showToast('Elegí primero una empresa.');return;}
  if(!r.user_id){showToast('No se pudo identificar al oficial de esa empresa. Volvé a buscarla.');return;}
  GES._reg=r;
  gesPersonas().then(function(){
    gesModal('<h3 class="ges-mt">Registrar gestión</h3><p class="ges-ms">'+gesE(r.empresa)+'</p>'+
      '<div class="ges-auto">Cedida por <b>'+gesE(gesNom(r.user_id))+'</b>, el oficial de esta empresa en la base. Se completa sola.</div>'+
      '<div id="ges-reg-plan"></div>'+
      gesFormHtml({},'registrar')+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ges-reg-ok" onclick="gesRegistrarOk()">Guardar y cargar prospectos</button></div>');
    // ¿Ya tenía una visita planificada (derivada) para esta empresa? Ofrecer completarla.
    _sb.from('gestiones').select('id,fecha,tipo,creada_por,origen').eq('hunter_id',gesYo()).eq('estado','planificada')
      .eq('dueno_id',r.user_id).eq('empresa_key',String(r.empresa).trim().toLowerCase()).order('fecha').limit(3)
      .then(function(q){
        var l=(q&&q.data)||[],host=document.getElementById('ges-reg-plan');if(!host||!l.length)return;
        host.innerHTML='<div class="ges-aviso">Ya tenés '+(l.length===1?'una visita planificada':l.length+' visitas planificadas')+' para esta empresa. '+
          l.map(function(g){return '<button type="button" class="ges-link" onclick="gesCerrar();gesAbrirDet(\''+g.id+'\',true)">Completar la del '+gesE(gesFecha(g.fecha))+'</button>';}).join(' ')+'</div>';
      });
  });
}
function gesRegistrarOk(){
  var r=GES._reg;if(!r)return;
  var d=gesFormLeer('registrar');
  if(d.estado==='realizada'&&d.fecha>gesHoy()){showToast('Una visita realizada no puede tener fecha futura. Ponela como Planificada o cambiá la fecha.');return;}
  var b=document.getElementById('ges-reg-ok');if(b){b.disabled=true;b.textContent='Guardando…';}
  d.empresa=r.empresa;d.dueno_id=r.user_id;d.origen='propia';
  _sb.from('gestiones').insert(d).select().single().then(function(res){
    if(res&&res.error){if(b){b.disabled=false;b.textContent='Guardar y cargar prospectos';}showToast('No se pudo guardar: '+res.error.message);return;}
    gesCerrar();GES.lista=null;
    showToast('Gestión guardada. Ahora cargá los prospectos.');
    GES.det=res.data.id;GES.tab='lista';
    switchApp('gestiones');
  });
}

// ── Derivar (oficial, desde Mis empresas) ───────────────────────────────────
function gesDerivar(idx){
  var e=GES._emps&&GES._emps[idx];if(!e)return;
  GES._der=e;
  gesPersonas().then(function(){
    gesModal('<h3 class="ges-mt">Derivar a un hunter</h3><p class="ges-ms">'+gesE(e.empresa)+'</p>'+
      gesFormHtml({},'derivar')+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ges-der-ok" onclick="gesDerivarOk()">Derivar</button></div>');
  });
}
function gesDerivarOk(){
  var e=GES._der;if(!e)return;
  var d=gesFormLeer('derivar');
  if(!d.hunter_id){showToast('Elegí a qué hunter se la derivás.');return;}
  var b=document.getElementById('ges-der-ok');if(b){b.disabled=true;b.textContent='Derivando…';}
  d.empresa=e.empresa;d.origen='derivada';
  _sb.from('gestiones').insert(d).select().single().then(function(res){
    if(res&&res.error){if(b){b.disabled=false;b.textContent='Derivar';}showToast('No se pudo derivar: '+res.error.message);return;}
    gesCerrar();GES.lista=null;
    showToast('Derivada a '+gesNom(d.hunter_id)+'. Le aparece en Gestiones y en la marca de su avatar.');
    gesRender();
  });
}

// ── Detalle de una gestión ──────────────────────────────────────────────────
function gesAbrirDet(id,editar){GES.det=id;GES._editarAlAbrir=!!editar;if(document.getElementById('view-gestiones').style.display==='none')switchApp('gestiones');else gesRender();window.scrollTo(0,0);}
function gesVolver(){GES.det=null;GES.detG=null;gesRender();}
function gesDetalle(id){
  Promise.all([
    _sb.from('gestiones').select('*').eq('id',id).maybeSingle(),
    _sb.from('gestion_prospectos').select('*').eq('gestion_id',id).order('created_at'),
    gesPersonas()
  ]).then(function(res){
    var g=res[0]&&res[0].data;
    if(!g){gesBody('<button type="button" class="ges-link" onclick="gesVolver()">&larr; Volver</button><div class="ges-vacio">Esa gestión ya no existe o no tenés acceso.</div>');return;}
    GES.detG=g;GES.detPros=(res[1]&&res[1].data)||[];
    // La abrió el hunter al que se la derivaron: deja de contar como nueva.
    if(gesNueva(g)){
      _sb.from('gestiones').update({visto_hunter:true}).eq('id',g.id).then(function(){
        g.visto_hunter=true;if(GES.lista)GES.lista.forEach(function(x){if(x.id===g.id)x.visto_hunter=true;});
        if(typeof _gesAvisoCargar==='function')_gesAvisoCargar();
      });
    }
    gesDetPintar();
    if(GES._editarAlAbrir){GES._editarAlAbrir=false;gesEditar(true);}
  }).catch(gesErr);
}
function gesDetPintar(){
  var g=GES.detG;if(!g)return;
  var l=GES.detPros,ed=gesPuedeEditar(g);
  var alt=l.filter(function(p){return p.estado==='alta';}).length;
  var acts='';
  if(ed&&g.estado==='planificada')acts+='<button type="button" class="btn bp ges-btn-sm" onclick="gesEditar(true)">Marcar como realizada</button>';
  if(ed)acts+='<button type="button" class="btn bg ges-btn-sm" onclick="gesEditar(false)">Editar datos</button>';
  if(ed&&g.frecuencia&&g.frecuencia!=='unica')acts+='<button type="button" class="btn bg ges-btn-sm" onclick="gesRepetir()">Repetir: próxima fecha</button>';
  if(gesPuedeBorrar(g))acts+='<button type="button" class="btn bg ges-btn-sm ges-peligro" onclick="gesBorrar()">Eliminar</button>';
  var h='<button type="button" class="ges-link" onclick="gesVolver()">&larr; Volver</button>'+
    '<div class="ges-det-top"><div><h3 class="ges-h1">'+gesE(g.empresa)+'</h3>'+
    '<p class="ges-sub">'+GES_TIPO[g.tipo]+' '+(GES_MOD[g.modalidad]||'').toLowerCase()+' &middot; '+gesE(gesFecha(g.fecha))+' &middot; Frecuencia: '+GES_FREC[g.frecuencia].toLowerCase()+
      ' &middot; Hunter: '+gesE(gesNom(g.hunter_id))+' &middot; Oficial: '+gesE(gesNom(g.dueno_id))+
      (g.origen==='derivada'?' &middot; Derivada por '+gesE(gesNom(g.creada_por)):'')+(g.prueba?' &middot; <span class="ges-prueba">prueba</span>':'')+'</p></div>'+
    '<div class="ges-acts">'+gesChipEst(g)+acts+'</div></div>'+
    (g.nota?'<div class="ges-auto">'+gesE(g.nota)+'</div>':'')+
    '<div class="ges-kpis ges-k5">'+gesKpi('Dotación',g.dotacion!=null?gesN(g.dotacion):'—','empleados')+
      gesKpi('Asistentes',g.asistentes!=null?gesN(g.asistentes):'—','contactados')+
      gesKpi('Prospectos',gesN(l.length),g.asistentes?gesPct(l.length,g.asistentes)+' de los asistentes':'')+
      gesKpi('Altas',gesN(alt),'sueldos en Galicia',true)+gesKpi('Conversión',gesPct(alt,l.length),'altas ÷ prospectos')+'</div>'+
    '<section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">Prospectos</span>'+
      (ed?'<span class="ges-mini">Cuando el sueldo cae en Galicia, pasá el estado a <b>Alta</b>.</span>':'')+'</div>'+
    '<div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Nombre</th><th>CUIL</th><th>Renta</th><th>Estado</th>'+(ed?'<th></th>':'')+'</tr></thead><tbody>'+
    (l.length?l.map(function(p,i){
      var cls=p.estado==='alta'?' alta':p.estado==='descartado'?' desc':p.estado==='en_gestion'?' gest':'';
      return '<tr><td>'+gesE(p.nombre)+'</td><td class="ges-num">'+(p.cuil?gesE(gesCuilFmt(p.cuil)):'<span class="ges-mini">—</span>')+'</td>'+
        '<td>'+(ed?'<select class="ges-est" onchange="gesProsCampo('+i+',\'renta\',this.value)"><option value="">—</option>'+
          GES_RENTAS.map(function(t,k){return '<option value="'+(k+1)+'"'+(p.renta===k+1?' selected':'')+'>'+t+'</option>';}).join('')+'</select>'
          :(p.renta?GES_RENTAS[p.renta-1]:'—'))+'</td>'+
        '<td>'+(ed?'<select class="ges-est'+cls+'" aria-label="Estado de '+_escAttr(p.nombre)+'" onchange="gesProsCampo('+i+',\'estado\',this.value)">'+
          Object.keys(GES_PEST).map(function(k){return '<option value="'+k+'"'+(p.estado===k?' selected':'')+'>'+GES_PEST[k]+'</option>';}).join('')+'</select>'
          :'<span class="ges-est'+cls+'">'+GES_PEST[p.estado]+'</span>')+
          (p.estado==='alta'&&p.fecha_alta?'<div class="ges-mini">desde el '+gesE(gesFecha(p.fecha_alta))+'</div>':'')+'</td>'+
        (ed?'<td class="r"><button type="button" class="ges-x" title="Quitar" aria-label="Quitar a '+_escAttr(p.nombre)+'" onclick="gesProsQuitar('+i+')">&times;</button></td>':'')+'</tr>';
    }).join(''):'<tr><td colspan="5" class="ges-mini" style="padding:14px 10px">Todavía no hay prospectos.'+(ed?' Agregalos de a uno o pegá un bloque desde Excel.':'')+'</td></tr>')+
    '</tbody></table></div>'+
    (ed?gesAltaHtml():'')+
    '</section>';
  gesBody(h);
  if(ed)gesPastePrev();
}
function gesKpi(t,v,d,hi){return '<div class="ges-card ges-kpi'+(hi?' hi':'')+'"><div class="ges-lbl">'+t+'</div><div class="ges-kv">'+v+'</div>'+(d?'<div class="ges-kd">'+d+'</div>':'')+'</div>';}

// Agregar de a uno + pegar desde Excel.
function gesAltaHtml(){
  return '<div class="ges-add">'+
    '<input type="text" class="ges-inp" id="gp-nom" placeholder="Nombre y apellido" maxlength="120">'+
    '<input type="text" class="ges-inp" id="gp-cuil" placeholder="CUIL (opcional)" inputmode="numeric" maxlength="13">'+
    '<select class="ges-inp" id="gp-renta"><option value="">Renta</option>'+GES_RENTAS.map(function(t,k){return '<option value="'+(k+1)+'">'+t+'</option>';}).join('')+'</select>'+
    '<button type="button" class="btn bp ges-btn-sm" onclick="gesProsAgregar()">Agregar</button></div>'+
    '<details class="ges-paste"><summary>Pegar varios desde Excel</summary>'+
    '<p class="ges-mini">Copiá las filas del Excel (nombre, CUIL y renta, en cualquier orden) y pegalas acá. La renta puede ser el importe: se ubica sola en su rango.</p>'+
    '<textarea class="ges-inp" id="gp-paste" rows="4" oninput="gesPastePrev()" placeholder="Ana Pérez&#9;27-12345678-3&#9;2500000"></textarea>'+
    '<div class="ges-paste-res" id="gp-prev"></div>'+
    '<button type="button" class="btn bp ges-btn-sm" id="gp-paste-ok" onclick="gesPasteOk()" disabled>Agregar a la lista</button></details>';
}
// Parser del bloque pegado: por renglón, el CUIL es la celda de 11 dígitos, la
// renta la celda numérica (o un rango escrito igual que en la lista) y el nombre
// la primera celda con letras. Saltea la fila de títulos si viene.
function gesPasteParse(t){
  var ya={};(GES.detPros||[]).forEach(function(p){if(p.cuil)ya[p.cuil]=1;});
  var vistos={};
  return String(t||'').split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean).map(function(l){
    var c=l.split(/\t|;|\s{2,}/).map(function(x){return x.trim();}).filter(Boolean);
    if(c.length&&/nombre/i.test(l)&&/cuil|cuit|renta/i.test(l))return null;
    var cuil=null,renta=null,nom=null;
    c.forEach(function(x){
      var d=gesCuilLimpio(x);
      if(!cuil&&d.length===11&&/^[\d\s.\-]+$/.test(x)){cuil=d;return;}
      if(renta==null){
        var low=x.toLowerCase(),li=GES_RENTAS.map(function(t){return t.toLowerCase();}).indexOf(low);
        if(li>=0){renta=li+1;return;}
        if(/\d/.test(x)){var rr=gesRentaDe(x);if(rr){renta=rr;return;}}
      }
      if(!nom&&/[a-záéíóúñ]/i.test(x))nom=x.replace(/\s+/g,' ');
    });
    var r={nombre:nom,cuil:cuil,renta:renta,ok:true,motivo:''};
    if(!nom){r.ok=false;r.motivo='sin nombre';}
    else if(cuil&&!gesCuilOk(cuil)){r.ok=false;r.motivo='CUIL inválido';}
    else if(cuil&&(ya[cuil]||vistos[cuil])){r.ok=false;r.motivo='ya está en la lista';}
    if(cuil)vistos[cuil]=1;
    return r;
  }).filter(Boolean);
}
function gesPastePrev(){
  var host=document.getElementById('gp-prev'),ta=document.getElementById('gp-paste');if(!host||!ta)return;
  var r=gesPasteParse(ta.value),ok=r.filter(function(x){return x.ok;}),mal=r.filter(function(x){return !x.ok;});
  var sinC=ok.filter(function(x){return !x.cuil;}).length;
  host.innerHTML=r.length?('<span class="ges-chip ges-c-ok">'+ok.length+' listos</span>'+
    (sinC?'<span class="ges-chip ges-c-warn">'+sinC+' sin CUIL</span>':'')+
    (mal.length?'<span class="ges-chip ges-c-bad">'+mal.length+' con problemas: '+mal.slice(0,4).map(function(x){return gesE((x.nombre||'?')+' ('+x.motivo+')');}).join(', ')+(mal.length>4?'…':'')+'</span>':'')):'';
  var b=document.getElementById('gp-paste-ok');if(b){b.disabled=!ok.length;b.textContent=ok.length?'Agregar '+ok.length+' a la lista':'Agregar a la lista';}
}
function gesPasteOk(){
  var ta=document.getElementById('gp-paste');if(!ta||!GES.detG)return;
  var r=gesPasteParse(ta.value),ok=r.filter(function(x){return x.ok;});if(!ok.length)return;
  var b=document.getElementById('gp-paste-ok');if(b){b.disabled=true;b.textContent='Agregando…';}
  var gid=GES.detG.id;
  _sb.from('gestion_prospectos').insert(ok.map(function(x){return {gestion_id:gid,nombre:x.nombre,cuil:x.cuil,renta:x.renta,estado:'prospecto'};})).select().then(function(res){
    if(res&&res.error){showToast('No se pudo agregar: '+res.error.message);gesPastePrev();return;}
    GES.detPros=GES.detPros.concat(res.data||[]);GES.lista=null;
    var mal=r.filter(function(x){return !x.ok;});
    gesDetPintar();
    // Lo que no entró queda en el cuadro para corregirlo.
    if(mal.length){
      var d=document.querySelector('.ges-paste');if(d)d.open=true;
      var t2=document.getElementById('gp-paste');if(t2){t2.value=mal.map(function(x){return [x.nombre||'',x.cuil?gesCuilFmt(x.cuil):''].join('\t');}).join('\n');gesPastePrev();}
    }
    showToast((res.data||[]).length+' prospectos agregados'+(mal.length?'. Quedaron '+mal.length+' en el cuadro para corregir.':'.'));
  });
}
function gesProsAgregar(){
  var nom=gesVal('gp-nom').trim(),cuil=gesCuilLimpio(gesVal('gp-cuil')),renta=gesVal('gp-renta');
  if(!nom){showToast('Escribí el nombre.');return;}
  if(cuil&&!gesCuilOk(cuil)){showToast('Ese CUIL no es válido. Revisalo o dejalo vacío.');return;}
  if(cuil&&GES.detPros.some(function(p){return p.cuil===cuil;})){showToast('Ese CUIL ya está en la lista.');return;}
  _sb.from('gestion_prospectos').insert({gestion_id:GES.detG.id,nombre:nom,cuil:cuil||null,renta:renta?+renta:null,estado:'prospecto'}).select().single().then(function(res){
    if(res&&res.error){showToast('No se pudo agregar: '+res.error.message);return;}
    GES.detPros.push(res.data);GES.lista=null;gesDetPintar();
    var n=document.getElementById('gp-nom');if(n)n.focus();
  });
}
function gesProsCampo(i,campo,val){
  var p=GES.detPros[i];if(!p)return;
  var upd={};upd[campo]=(campo==='renta')?(val?+val:null):val;
  var antes=p[campo];
  _sb.from('gestion_prospectos').update(upd).eq('id',p.id).select().single().then(function(res){
    if(res&&res.error){p[campo]=antes;gesDetPintar();showToast('No se pudo guardar: '+res.error.message);return;}
    GES.detPros[i]=res.data;GES.lista=null;gesDetPintar();
    if(campo==='estado'&&val==='alta'&&antes!=='alta')showToast('Alta registrada. Ya cuenta en el tablero.');
  });
}
function gesProsQuitar(i){
  var p=GES.detPros[i];if(!p)return;
  fgConfirm('¿Quitar a '+p.nombre+' de la lista?',{ok:'Quitar'}).then(function(ok){
    if(!ok)return;
    _sb.from('gestion_prospectos').delete().eq('id',p.id).then(function(res){
      if(res&&res.error){showToast('No se pudo quitar: '+res.error.message);return;}
      GES.detPros.splice(i,1);GES.lista=null;gesDetPintar();
    });
  });
}
function gesEditar(realizada){
  var g=GES.detG;if(!g)return;
  var base=Object.assign({},g);if(realizada){base.estado='realizada';if(base.fecha>gesHoy())base.fecha=gesHoy();}
  gesPersonas().then(function(){
    gesModal('<h3 class="ges-mt">'+(realizada?'Completar la visita':'Editar datos')+'</h3><p class="ges-ms">'+gesE(g.empresa)+'</p>'+
      gesFormHtml(base,'editar')+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ges-ed-ok" onclick="gesEditarOk()">Guardar</button></div>');
  });
}
function gesEditarOk(){
  var g=GES.detG;if(!g)return;
  var d=gesFormLeer('editar');
  if(d.estado==='realizada'&&d.fecha>gesHoy()){showToast('Una visita realizada no puede tener fecha futura.');return;}
  var b=document.getElementById('ges-ed-ok');if(b){b.disabled=true;b.textContent='Guardando…';}
  _sb.from('gestiones').update(d).eq('id',g.id).select().single().then(function(res){
    if(res&&res.error){if(b){b.disabled=false;b.textContent='Guardar';}showToast('No se pudo guardar: '+res.error.message);return;}
    gesCerrar();GES.detG=res.data;GES.lista=null;gesDetPintar();showToast('Guardado.');
  });
}
// Feria o acción que se repite: crea la próxima fecha con los mismos datos.
function gesRepetir(){
  var g=GES.detG;if(!g)return;
  var a=g.fecha.split('-'),d=new Date(+a[0],+a[1]-1,+a[2]);
  if(g.frecuencia==='semanal')d.setDate(d.getDate()+7);
  else if(g.frecuencia==='quincenal')d.setDate(d.getDate()+14);
  else d.setMonth(d.getMonth()+1);
  var yo=gesYo();
  var n={empresa:g.empresa,tipo:g.tipo,modalidad:g.modalidad,frecuencia:g.frecuencia,serie_id:g.serie_id,
    fecha:gesIso(d),estado:'planificada',dotacion:g.dotacion,nota:'Repetición de la del '+gesFecha(g.fecha)};
  // Si la repite el oficial que la derivó, sigue siendo derivada al mismo hunter;
  // si la repite el hunter, es suya (el oficial dueño se mantiene).
  if(g.origen==='derivada'&&g.creada_por===yo){n.origen='derivada';n.hunter_id=g.hunter_id;}
  else{n.origen='propia';n.dueno_id=g.dueno_id;}
  _sb.from('gestiones').insert(n).select().single().then(function(res){
    if(res&&res.error){showToast('No se pudo crear: '+res.error.message);return;}
    GES.lista=null;GES.det=res.data.id;gesRender();
    showToast('Creada la próxima fecha: '+gesFecha(n.fecha)+'. Mismos datos, prospectos en cero.');
  });
}
function gesBorrar(){
  var g=GES.detG;if(!g)return;
  fgConfirm('¿Eliminar esta gestión?\nSe borran también sus '+GES.detPros.length+' prospectos. No se puede deshacer.',{ok:'Eliminar'}).then(function(ok){
    if(!ok)return;
    _sb.from('gestiones').delete().eq('id',g.id).then(function(res){
      if(res&&res.error){showToast('No se pudo eliminar: '+res.error.message);return;}
      GES.lista=null;gesVolver();showToast('Gestión eliminada.');
    });
  });
}

// ── Tablero ─────────────────────────────────────────────────────────────────
function gesDesde(per){
  var d=new Date();
  if(per==='30'){d.setDate(d.getDate()-30);return gesIso(d);}
  if(per==='90'){d.setDate(d.getDate()-90);return gesIso(d);}
  if(per==='anio')return d.getFullYear()+'-01-01';
  return null;
}
function gesTablero(){
  var f=GES.f;
  var args={p_desde:gesDesde(f.per),p_hasta:gesHoy(),p_tipo:f.tipo||null,p_hunter:f.hun||null,p_dueno:f.due||null,p_prueba:gesPuedePrueba()&&!!f.prueba};
  Promise.all([_sb.rpc('gestiones_tablero',args),gesPersonas()]).then(function(res){
    var r=res[0];if(r&&r.error)throw r.error;
    GES.tablero=r.data;gesTableroPintar();
  }).catch(gesErr);
}
function gesTableroPintar(){
  var t=GES.tablero||{},k=t.kpis||{},f=GES.f,ps=GES.personas||{};
  var opt=function(id,arr,val,todos){return '<option value="">'+todos+'</option>'+arr.map(function(a){return '<option value="'+_escAttr(a[0])+'"'+(a[0]===val?' selected':'')+'>'+gesE(a[1])+'</option>';}).join('');};
  var huns=Object.keys(ps).filter(function(id){return ps[id].rol==='hunter';}).map(function(id){return [id,ps[id].nombre];});
  var dues=(t.por_dueno||[]).map(function(x){return [x.id,gesNom(x.id)];}).filter(function(x){return x[0];});
  if(f.due&&!dues.some(function(x){return x[0]===f.due;}))dues.push([f.due,gesNom(f.due)]);
  var filtros='<div class="ges-filtros">'+
    '<label><span class="ges-lbl">Período</span><select class="ges-inp ges-sel" onchange="GES.f.per=this.value;gesTablero()">'+
      [['30','Últimos 30 días'],['90','Últimos 90 días'],['anio','Este año'],['todo','Todo']].map(function(o){return '<option value="'+o[0]+'"'+(f.per===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label>'+
    '<label><span class="ges-lbl">Tipo</span><select class="ges-inp ges-sel" onchange="GES.f.tipo=this.value;gesTablero()">'+opt('t',[['visita','Visitas'],['feria','Ferias'],['accion','Acciones']],f.tipo,'Todos')+'</select></label>'+
    (gesRol()!=='hunter'?'<label><span class="ges-lbl">Hunter</span><select class="ges-inp ges-sel" onchange="GES.f.hun=this.value;gesTablero()">'+opt('h',huns,f.hun,'Todos')+'</select></label>':'')+
    '<label><span class="ges-lbl">Oficial que cede</span><select class="ges-inp ges-sel" onchange="GES.f.due=this.value;gesTablero()">'+opt('d',dues,f.due,'Todos')+'</select></label>'+
    (gesPuedePrueba()?'<label class="ges-check"><input type="checkbox"'+(f.prueba?' checked':'')+' onchange="GES.f.prueba=this.checked;gesTablero()"> Incluir pruebas</label>':'')+
    '<button type="button" class="btn bg ges-xls" onclick="gesExcel()">Descargar Excel</button>'+
  '</div>';
  var vis=+k.visitas||0,asis=+k.asistentes||0,pros=+k.prospectos||0,alt=+k.altas||0;
  var kpis='<div class="ges-kpis">'+gesKpi('Visitas',gesN(vis),(+k.planificadas?gesN(k.planificadas)+' planificadas':'realizadas'))+
    gesKpi('Empresas',gesN(k.empresas),'distintas')+gesKpi('Asistentes',gesN(asis),'contactados')+
    gesKpi('Prospectos',gesN(pros),asis?gesPct(pros,asis)+' de los asistentes':'')+
    gesKpi('Altas',gesN(alt),'sueldos en Galicia')+gesKpi('Conversión',gesPct(alt,pros),'altas ÷ prospectos',true)+'</div>';
  if(!vis&&!(+k.planificadas)){
    gesBody(filtros+kpis+'<div class="ges-vacio">No hay gestiones en este período. Probá con un período más largo'+(gesPuedePrueba()&&!f.prueba?' o tildá &laquo;Incluir pruebas&raquo;':'')+'.</div>');
    return;
  }
  var rankH=gesRank(gesRol()==='hunter'?'Por hunter':'Hunters',t.por_hunter||[],function(x){return gesNom(x.id);});
  var rankD=gesRank('Oficiales que ceden visitas',t.por_dueno||[],function(x){return gesNom(x.id);});
  var rankE=gesRankEmp(t.por_empresa||[]);
  gesBody(filtros+kpis+
    '<div class="ges-g2"><section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">Evolución mensual</span>'+
      '<span class="ges-leg"><span><i class="l1"></i>Prospectos</span><span><i class="l2"></i>Altas</span></span></div>'+gesChartMeses(t.por_mes||[])+'</section>'+
    '<section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">Embudo</span></div>'+gesEmbudo(asis,pros,alt)+
      '<div class="ges-ch" style="margin-top:16px"><span class="ges-ct">Altas por rango de renta</span></div>'+gesRentas(t.por_renta||[])+'</section></div>'+
    '<div class="ges-g3">'+rankH+rankD+rankE+'</div>'+
    '<section class="ges-card ges-pad" style="margin-top:14px"><div class="ges-ch"><span class="ges-ct">Por tipo de acción</span></div>'+gesPorTipo(t.por_tipo||[])+'</section>');
}
function gesChartMeses(rows){
  rows=rows.slice(-12);
  if(!rows.length)return '<div class="ges-mini">Sin datos.</div>';
  var P=rows.map(function(r){return +r.prospectos||0;}),A=rows.map(function(r){return +r.altas||0;});
  var mx=Math.max.apply(null,P.concat(A,[4]));
  var paso=mx<=10?2:mx<=50?10:mx<=200?50:mx<=1000?200:1000,top=Math.ceil(mx/paso)*paso;
  var W=560,H=220,l=40,b=26,tp=14,r=8,cw=(W-l-r)/rows.length,bw=Math.max(6,Math.min(22,cw/3.2));
  var y=function(v){return tp+(H-tp-b)*(1-v/top);};
  var s='<svg class="ges-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Prospectos y altas por mes">';
  for(var v=0;v<=top;v+=paso)s+='<line x1="'+l+'" x2="'+(W-r)+'" y1="'+y(v)+'" y2="'+y(v)+'" class="ges-grid"/><text x="'+(l-6)+'" y="'+(y(v)+4)+'" text-anchor="end" class="ges-ax">'+v+'</text>';
  rows.forEach(function(row,i){
    var cx=l+cw*i+cw/2,m=row.mes.split('-');
    s+='<rect x="'+(cx-bw-1)+'" y="'+y(P[i])+'" width="'+bw+'" height="'+Math.max(0,y(0)-y(P[i]))+'" rx="3" class="ges-b1"><title>'+GES_MES[+m[1]-1]+': '+P[i]+' prospectos</title></rect>';
    s+='<rect x="'+(cx+1)+'" y="'+y(A[i])+'" width="'+bw+'" height="'+Math.max(0,y(0)-y(A[i]))+'" rx="3" class="ges-b2"><title>'+GES_MES[+m[1]-1]+': '+A[i]+' altas</title></rect>';
    if(A[i])s+='<text x="'+(cx+1+bw/2)+'" y="'+(y(A[i])-4)+'" text-anchor="middle" class="ges-val">'+A[i]+'</text>';
    s+='<text x="'+cx+'" y="'+(H-8)+'" text-anchor="middle" class="ges-ax">'+GES_MES[+m[1]-1]+(rows.length<=6&&m[0]!==String(new Date().getFullYear())?' '+m[0].slice(2):'')+'</text>';
  });
  return s+'</svg>';
}
function gesEmbudo(a,p,al){
  var rows=[['Asistentes',a,''],['Prospectos',p,'f2'],['Altas',al,'f3']],base=a||p||1;
  return '<div class="ges-fun">'+rows.map(function(r,i){
    var w=r[1]?Math.max(8,Math.round(r[1]*100/base)):0;
    return '<div class="ges-fun-r"><span>'+r[0]+'</span><div><div class="ges-fun-b '+r[2]+'" style="width:'+w+'%">'+gesN(r[1])+'</div></div>'+
      '<span class="ges-fun-p">'+(i?gesPct(r[1],rows[i-1][1]):'')+'</span></div>';
  }).join('')+'</div>';
}
function gesRentas(rows){
  var t=[0,0,0,0],sin=0;rows.forEach(function(r){if(r.renta>=1&&r.renta<=4)t[r.renta-1]+=+r.altas;else sin+=+r.altas;});
  var tot=t.reduce(function(s,v){return s+v;},0)+sin,mx=Math.max.apply(null,t.concat([1]));
  return '<div class="ges-fun">'+t.map(function(v,i){
    return '<div class="ges-fun-r"><span class="ges-mini">'+GES_RENTAS[i]+'</span><div class="ges-bar"><i style="width:'+Math.round(v*100/mx)+'%"></i></div><span class="ges-fun-p">'+v+' &middot; '+gesPct(v,tot)+'</span></div>';
  }).join('')+(sin?'<div class="ges-mini">'+sin+' alta'+(sin>1?'s':'')+' sin renta cargada</div>':'')+'</div>';
}
function gesRank(tit,rows,nom){
  rows=rows.filter(function(x){return x.id;}).slice().sort(function(a,b){return b.altas-a.altas||b.visitas-a.visitas;});
  var mx=Math.max.apply(null,rows.map(function(r){return +r.altas;}).concat([1]));
  return '<section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">'+tit+'</span></div><div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Nombre</th><th class="r">Visitas</th><th class="r">Altas</th><th>Conv.</th></tr></thead><tbody>'+
    (rows.length?rows.slice(0,12).map(function(r){return '<tr><td>'+gesE(nom(r))+'</td><td class="r">'+r.visitas+'</td><td class="r"><b>'+r.altas+'</b></td>'+
      '<td><div class="ges-hb"><div class="ges-bar"><i style="width:'+Math.round(r.altas*100/mx)+'%"></i></div><span>'+gesPct(r.altas,r.prospectos)+'</span></div></td></tr>';}).join(''):
      '<tr><td colspan="4" class="ges-mini">Sin datos.</td></tr>')+'</tbody></table></div></section>';
}
function gesRankEmp(rows){
  return '<section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">Empresas con más altas</span></div><div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Empresa</th><th class="r">Visitas</th><th class="r">Altas</th><th class="r">Conv.</th></tr></thead><tbody>'+
    (rows.length?rows.slice(0,10).map(function(r){return '<tr><td>'+gesE(r.empresa)+'<div class="ges-mini">'+gesE(gesNom(r.dueno))+'</div></td><td class="r">'+r.visitas+'</td><td class="r"><b>'+r.altas+'</b></td><td class="r">'+gesPct(r.altas,r.prospectos)+'</td></tr>';}).join(''):
      '<tr><td colspan="4" class="ges-mini">Sin datos.</td></tr>')+'</tbody></table></div></section>';
}
function gesPorTipo(rows){
  var orden=['visita|presencial','visita|virtual','feria|presencial','feria|virtual','accion|presencial','accion|virtual'];
  rows=rows.slice().sort(function(a,b){return orden.indexOf(a.tipo+'|'+a.modalidad)-orden.indexOf(b.tipo+'|'+b.modalidad);});
  return '<div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Tipo</th><th class="r">Cantidad</th><th class="r">Prospectos</th><th class="r">Altas</th><th class="r">Altas por acción</th><th class="r">Conversión</th></tr></thead><tbody>'+
    (rows.length?rows.map(function(r){return '<tr><td>'+GES_TIPO[r.tipo]+' '+(GES_MOD[r.modalidad]||'').toLowerCase()+'</td><td class="r">'+r.visitas+'</td><td class="r">'+r.prospectos+'</td><td class="r"><b>'+r.altas+'</b></td>'+
      '<td class="r">'+(r.visitas?(r.altas/r.visitas).toFixed(1).replace('.',','):'—')+'</td><td class="r">'+gesPct(r.altas,r.prospectos)+'</td></tr>';}).join(''):
      '<tr><td colspan="6" class="ges-mini">Sin datos.</td></tr>')+'</tbody></table></div>';
}

// ── Excel: resumen + rankings + el detalle de las gestiones del filtro ──────
function gesExcel(){
  showToast('Preparando el Excel…');
  Promise.all([_lib(['xlsx']),gesLista(true)]).then(function(res){
    var t=GES.tablero||{},k=t.kpis||{},f=GES.f,desde=gesDesde(f.per),incl=gesPuedePrueba()&&!!f.prueba;
    var l=res[1].filter(function(g){
      if(desde&&g.fecha<desde)return false;
      if(g.fecha>gesHoy())return false;
      if(f.tipo&&g.tipo!==f.tipo)return false;
      if(f.hun&&g.hunter_id!==f.hun)return false;
      if(f.due&&g.dueno_id!==f.due)return false;
      if(g.prueba&&!incl)return false;
      return true;
    });
    var wb=XLSX.utils.book_new();
    var resu=[['Gestiones comerciales'],['Período',desde?('Desde '+desde):'Todo'],['Generado',new Date().toLocaleString('es-AR')],[],
      ['Visitas realizadas',+k.visitas||0],['Planificadas',+k.planificadas||0],['Empresas',+k.empresas||0],['Asistentes',+k.asistentes||0],
      ['Prospectos',+k.prospectos||0],['Altas',+k.altas||0],['Conversión',(+k.prospectos?(+k.altas/+k.prospectos):0)]];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(resu),'Resumen');
    var rk=function(rows){return rows.filter(function(x){return x.id;}).map(function(x){return {Nombre:gesNom(x.id),Visitas:x.visitas,Prospectos:x.prospectos,Altas:x.altas,'Conversión':x.prospectos?x.altas/x.prospectos:0};});};
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rk(t.por_hunter||[])),'Por hunter');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rk(t.por_dueno||[])),'Por oficial');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((t.por_empresa||[]).map(function(x){return {Empresa:x.empresa,Oficial:gesNom(x.dueno),Visitas:x.visitas,Prospectos:x.prospectos,Altas:x.altas};})),'Por empresa');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(l.map(function(g){return {
      Fecha:g.fecha,Empresa:g.empresa,Tipo:GES_TIPO[g.tipo],Modalidad:GES_MOD[g.modalidad],Frecuencia:GES_FREC[g.frecuencia],Estado:GES_EST[g.estado],
      Hunter:gesNom(g.hunter_id),'Oficial (cede)':gesNom(g.dueno_id),Origen:g.origen==='derivada'?'Derivada':'Propia',
      'Dotación':g.dotacion,Asistentes:g.asistentes,Prospectos:+g.n_pros||0,Altas:+g.n_altas||0,Nota:g.nota||'',Prueba:g.prueba?'Sí':''};})),'Gestiones');
    XLSX.writeFile(wb,'Gestiones_'+gesHoy()+'.xlsx');
  }).catch(function(e){showToast('No se pudo armar el Excel: '+((e&&e.message)||e));});
}
