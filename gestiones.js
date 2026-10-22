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
// Repetición y cabecera del admin (2026-10-11).
var GES_CSS_2=".ges-top-acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}\n.ges-rep{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;font-size:.76rem;font-weight:600;color:var(--ink);}\n.ges-rep[hidden],.ges-mini[hidden]{display:none;}\n.ges-inp-n{width:64px;text-align:center;}\n.ges-atajos{display:inline-flex;gap:4px;}\n.ges-atajos button{border:1px solid var(--border);background:var(--card);color:var(--ink-2,var(--ink));border-radius:12px;padding:3px 9px;font-size:.75rem;font-weight:700;cursor:pointer;}\n.ges-atajos button:hover{border-color:var(--accent-line);color:var(--accent-2,var(--accent));}\n#gf-rep-ayuda{margin-top:4px;font-weight:400;line-height:1.4;}\n.ges-nov{display:inline-flex;align-items:center;gap:5px;margin-left:6px;font-size:.6875rem;font-weight:800;color:var(--accent-2,var(--accent));text-transform:uppercase;letter-spacing:.04em;}\n.ges-nov::before{content:\"\";width:7px;height:7px;border-radius:50%;background:var(--accent);}\n.ges-tr-nov td{background:var(--accent-soft);}\n.ges-mod.ancho{width:min(880px,100%);}\n.ges-opc{font-style:normal;font-weight:400;color:var(--gray);}\n.ges-hor{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:.76rem;color:var(--ink);}\n.ges-hor input[type=time]{min-width:100px;}\n.ges-ocup{background:var(--ges-info-soft);color:var(--ges-info);border-radius:var(--r-s,8px);padding:8px 12px;font-size:.76rem;line-height:1.5;}\n.ges-ocup[hidden]{display:none;}\n.ges-ocup .ges-pisa{color:var(--danger);font-weight:700;}\n.ges-form-emp{margin-bottom:0;}\n.ges-emp-res{display:flex;flex-direction:column;gap:4px;max-height:190px;overflow:auto;}\n.ges-emp-res:empty{display:none;}\n.ges-emp-res button{text-align:left;border:1px solid var(--border);background:var(--card);color:var(--ink);border-radius:8px;padding:7px 10px;font-size:.78rem;font-weight:700;cursor:pointer;}\n.ges-emp-res button:hover{border-color:var(--accent-line);}\n.ges-ag-tool{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}\n.ges-ag-nav,.ges-ag-acts{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}\n.ges-ag-rango{font-weight:800;font-size:.92rem;color:var(--ink);margin-left:6px;}\n.ges-ag-sem{display:grid;grid-template-columns:repeat(var(--n,6),minmax(0,1fr));gap:8px;}\n.ges-ag-dia{background:var(--card);border:1px solid var(--border);border-radius:var(--r-m,12px);padding:8px;min-height:150px;display:flex;flex-direction:column;gap:6px;box-shadow:var(--sh-1);}\n.ges-ag-dia h4{margin:0 0 2px;font-size:.75rem;font-weight:800;color:var(--gray);text-transform:uppercase;letter-spacing:.05em;}\n.ges-ag-dia.hoy{border-color:var(--accent-line);}\n.ges-ag-dia.hoy h4{color:var(--accent-2,var(--accent));}\n.ges-ag-libre{font-size:.75rem;color:var(--ges-ok);font-weight:700;padding:2px;}\n.ges-ag-b{display:flex;flex-direction:column;gap:1px;text-align:left;width:100%;border:0;border-left:3px solid var(--ges-info);background:var(--ges-info-soft);color:var(--ink);border-radius:6px;padding:6px 8px;cursor:pointer;font-size:.75rem;line-height:1.35;font-family:inherit;}\n.ges-ag-b:hover{box-shadow:0 0 0 1px var(--accent-line);}\n.ges-ag-b.est-realizada{border-left-color:var(--ges-ok);background:var(--ges-ok-soft);}\n.ges-ag-b.est-cancelada{border-left-color:var(--border);background:transparent;color:var(--gray);text-decoration:line-through;}\n.ges-ag-b.nueva{box-shadow:0 0 0 2px var(--accent-ring,rgba(242,97,34,.16));}\n.ges-ag-h{font-weight:800;color:var(--ges-info);font-variant-numeric:tabular-nums;}\n.ges-ag-b.est-realizada .ges-ag-h{color:var(--ges-ok);}\n.ges-ag-b.est-cancelada .ges-ag-h{color:var(--gray);}\n.ges-ag-e{font-weight:700;overflow-wrap:anywhere;}\n.ges-ag-t{color:var(--gray);}\n.ges-ag-nueva{font-weight:800;color:var(--accent-2,var(--accent));text-transform:uppercase;font-size:.6875rem;letter-spacing:.04em;}\n.ges-ag-pills{display:none;gap:4px;overflow-x:auto;margin-bottom:10px;}\n.ges-ag-pills button{flex:1;min-width:46px;border:1px solid var(--border);background:var(--card);color:var(--ink);border-radius:10px;padding:6px 4px;font-size:.75rem;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:1px;}\n.ges-ag-pills button b{font-size:1rem;}\n.ges-ag-pills button[aria-pressed=\"true\"]{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-2,var(--accent));}\n.ges-ag-pills button.tiene::after{content:\"\";width:5px;height:5px;border-radius:50%;background:var(--accent);}\n@media (min-width:701px) and (max-width:1000px){.ges-ag-sem{grid-template-columns:repeat(3,minmax(0,1fr));}}\n@media (max-width:700px){.ges-ag-pills{display:flex;}.ges-ag-sem{grid-template-columns:1fr;}.ges-ag-dia{display:none;min-height:0;}.ges-ag-dia.on{display:flex;}}\n.ges-ag-fil{display:flex;flex-direction:column;gap:4px;}\n.ges-ag-ley{align-self:center;padding-top:14px;}\n.ges-ag-eq{border-collapse:collapse;width:100%;font-size:.75rem;color:var(--ink);}\n.ges-ag-eq th{text-align:left;font-size:.6875rem;letter-spacing:.06em;text-transform:uppercase;color:var(--gray);font-weight:800;padding:8px;border-bottom:1px solid var(--border);white-space:nowrap;}\n.ges-ag-eq td{border-bottom:1px solid var(--border);padding:6px;vertical-align:top;min-width:108px;}\n.ges-ag-eq tr:last-child td{border-bottom:0;}\n.ges-ag-eq td.nom{font-weight:800;font-size:.8rem;min-width:130px;}\n.ges-ag-eq th.hoy,.ges-ag-eq td.hoy{background:var(--accent-soft);}\n.ges-ag-cel{display:flex;flex-direction:column;gap:4px;}\n.ges-ag-eq .ges-ag-b{padding:4px 6px;}\n.ges-ag-mas{border:1px dashed var(--border);background:transparent;color:var(--gray);border-radius:6px;padding:3px 6px;font-size:.75rem;font-weight:700;cursor:pointer;text-align:left;font-family:inherit;}\n.ges-ag-mas.libre{border-color:transparent;color:var(--ges-ok);}\n.ges-ag-mas:hover{border:1px solid var(--accent-line);color:var(--accent-2,var(--accent));}\n.ges-ag-ta{width:100%;box-sizing:border-box;font-family:ui-monospace,Consolas,monospace;font-size:.75rem;resize:vertical;margin-bottom:8px;}\n.ges-ag-prev{margin-bottom:8px;}\n.ges-ag-prev .ges-tbl td{font-size:.75rem;}";
var GES_CSS=":root{--ges-ok:#2E7D32;--ges-ok-soft:#E6F3E7;--ges-info:#1D4070;--ges-info-soft:#E8EEF7;--ges-warn:#9A5B00;--ges-warn-soft:#FFF2DC;--ges-b1:#F5B79A;--ges-grid:#EDE7DC;}\nhtml.dark{--ges-ok:#7BC47F;--ges-ok-soft:#1C2E1E;--ges-info:#8FB3E8;--ges-info-soft:#1C2636;--ges-warn:#F0B35A;--ges-warn-soft:#33281A;--ges-b1:#7A3E22;--ges-grid:#2A2E34;}\n.ges-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;}\n.ges-h1{font-size:1.12rem;font-weight:800;margin:0 0 2px;color:var(--ink);text-wrap:balance;}\n.ges-sub{font-size:.78rem;color:var(--gray);margin:0 0 12px;line-height:1.45;}\n.ges-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:14px;flex-wrap:wrap;}\n.ges-tab{border:0;background:none;padding:9px 14px;font-size:.8rem;font-weight:700;color:var(--gray);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:inline-flex;gap:6px;align-items:center;}\n.ges-tab:hover{color:var(--ink);}\n.ges-tab.on{color:var(--accent-2,var(--accent));border-bottom-color:var(--accent);}\n.ges-tab .fg-badge{margin-left:0;}\n.ges-cargando,.ges-vacio{padding:22px;text-align:center;color:var(--gray);font-size:.8rem;line-height:1.55;}\n.ges-vacio{border:1px dashed var(--border);border-radius:var(--r-m,12px);background:var(--card);}\n.ges-vacio .btn{margin-top:10px;}\n.ges-nota,.ges-mini{font-size:.75rem;color:var(--gray);}\n.ges-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-m,12px);box-shadow:var(--sh-1);}\n.ges-pad{padding:14px 16px;}\n.ges-lbl{font-size:.6875rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gray);}\n.ges-inp{border:1px solid var(--border);background:var(--field,var(--card));color:var(--ink);border-radius:var(--r-s,8px);padding:8px 10px;font-size:.8rem;min-width:0;}\n.ges-inp:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-ring,rgba(242,97,34,.16));}\n.ges-sel{min-width:150px;}\n.ges-tool{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}\n.ges-tool input[type=search]{flex:1;min-width:200px;}\n.ges-btn-sm{padding:6px 12px !important;font-size:.75rem !important;}\n.ges-link{border:0;background:none;color:var(--accent-2,var(--accent));font-weight:700;font-size:.76rem;cursor:pointer;padding:2px 0;}\n.ges-peligro{color:var(--danger) !important;}\n.ges-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:.75rem;font-weight:800;white-space:nowrap;}\n.ges-c-info{background:var(--ges-info-soft);color:var(--ges-info);}\n.ges-c-ok{background:var(--ges-ok-soft);color:var(--ges-ok);}\n.ges-c-bad{background:var(--danger-soft);color:var(--danger);}\n.ges-c-warn{background:var(--ges-warn-soft);color:var(--ges-warn);}\n.ges-ok{color:var(--ges-ok);}\n.ges-prueba{color:var(--ges-warn);font-weight:700;}\n.ges-list{display:flex;flex-direction:column;gap:8px;}\n.ges-row{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;border:1px solid var(--border);background:var(--card);border-radius:var(--r-s,8px);padding:10px 12px;cursor:pointer;box-shadow:var(--sh-1);color:var(--ink);}\n.ges-row:hover{border-color:var(--accent-line);}\n.ges-row.nueva{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-ring,rgba(242,97,34,.16));}\n.ges-row-t{display:flex;justify-content:space-between;align-items:center;gap:8px;}\n.ges-row-e{font-weight:800;font-size:.86rem;}\n.ges-row-d,.ges-row-n{font-size:.75rem;color:var(--gray);}\n.ges-row-n b{color:var(--ink);}\n.ges-row-n b.ges-ok{color:var(--ges-ok);}\n.ges-row-nueva{font-size:.75rem;color:var(--accent-2,var(--accent));font-weight:700;}\n.ges-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px;}\n.ges-kpis.ges-k4{grid-template-columns:repeat(4,minmax(0,1fr));}\n.ges-kpis.ges-k5{grid-template-columns:repeat(5,minmax(0,1fr));}\n.ges-kpi{padding:12px 14px;}\n.ges-kv{font-size:1.5rem;font-weight:800;line-height:1.1;margin-top:4px;color:var(--ink);font-variant-numeric:tabular-nums;}\n.ges-kd{font-size:.75rem;color:var(--gray);margin-top:2px;}\n.ges-kpi.hi{border-color:var(--accent-line);background:linear-gradient(180deg,var(--accent-soft),var(--card));}\n.ges-kpi.hi .ges-kv{color:var(--accent-2,var(--accent));}\n@media (max-width:1000px){.ges-kpis,.ges-kpis.ges-k5{grid-template-columns:repeat(3,minmax(0,1fr));}}\n@media (max-width:520px){.ges-kpis,.ges-kpis.ges-k4,.ges-kpis.ges-k5{grid-template-columns:repeat(2,minmax(0,1fr));}}\n.ges-tw{overflow-x:auto;}\n.ges-tbl{border-collapse:collapse;width:100%;font-size:.78rem;color:var(--ink);}\n.ges-tbl th{text-align:left;font-size:.6875rem;letter-spacing:.06em;text-transform:uppercase;color:var(--gray);font-weight:800;padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap;}\n.ges-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:middle;}\n.ges-tbl tr:last-child td{border-bottom:0;}\n.ges-tbl .r{text-align:right;font-variant-numeric:tabular-nums;}\n.ges-num{font-variant-numeric:tabular-nums;white-space:nowrap;}\n.ges-hb{display:flex;align-items:center;gap:8px;}\n.ges-hb span{font-size:.75rem;font-weight:700;min-width:34px;font-variant-numeric:tabular-nums;}\n.ges-bar{flex:1;height:6px;border-radius:3px;background:var(--ges-grid);overflow:hidden;min-width:50px;}\n.ges-bar i{display:block;height:100%;background:var(--accent);border-radius:3px;}\n.ges-est{border:1px solid var(--border);background:var(--field,var(--card));color:var(--ink);border-radius:6px;padding:4px 6px;font-size:.75rem;font-weight:700;}\n.ges-est.alta{background:var(--ges-ok-soft);color:var(--ges-ok);border-color:transparent;}\n.ges-est.desc{background:var(--danger-soft);color:var(--danger);border-color:transparent;}\n.ges-est.gest{background:var(--ges-warn-soft);color:var(--ges-warn);border-color:transparent;}\nspan.ges-est{display:inline-block;}\n.ges-x{width:26px;height:26px;border:0;border-radius:50%;background:transparent;color:var(--gray);cursor:pointer;font-size:1rem;line-height:1;}\n.ges-x:hover{background:var(--danger-soft);color:var(--danger);}\n.ges-det-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px;}\n.ges-acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}\n.ges-auto{display:flex;gap:8px;align-items:center;background:var(--ges-info-soft);color:var(--ges-info);border-radius:var(--r-s,8px);padding:9px 12px;font-size:.76rem;margin:0 0 12px;line-height:1.45;white-space:pre-wrap;}\n.ges-auto b{font-weight:800;}\n.ges-aviso{background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:var(--r-s,8px);padding:9px 12px;font-size:.76rem;margin:0 0 12px;color:var(--ink);}\n.ges-ch{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:10px;flex-wrap:wrap;}\n.ges-ct{font-weight:800;font-size:.86rem;color:var(--ink);}\n.ges-add{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) auto;gap:8px;margin-top:12px;align-items:center;}\n@media (max-width:640px){.ges-add{grid-template-columns:1fr 1fr;}.ges-add input:first-child{grid-column:1/-1;}}\n.ges-paste{margin-top:12px;border:1px dashed var(--accent-line);border-radius:var(--r-s,8px);padding:10px 12px;background:var(--accent-soft);}\n.ges-paste summary{cursor:pointer;font-weight:700;font-size:.78rem;color:var(--ink);}\n.ges-paste textarea{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:.75rem;margin:6px 0;resize:vertical;box-sizing:border-box;}\n.ges-paste-res{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;}\n.ges-filtros{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;}\n.ges-filtros label{display:flex;flex-direction:column;gap:4px;}\n.ges-filtros .ges-check{flex-direction:row;align-items:center;gap:6px;font-size:.76rem;color:var(--ink);padding-bottom:8px;}\n.ges-xls{margin-left:auto;}\n.ges-g2{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px;margin-bottom:14px;}\n.ges-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}\n@media (max-width:1000px){.ges-g2,.ges-g3{grid-template-columns:1fr;}}\n.ges-leg{display:flex;gap:12px;font-size:.75rem;color:var(--gray);}\n.ges-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px;}\n.ges-leg i.l1{background:var(--ges-b1);}\n.ges-leg i.l2{background:var(--accent);}\n.ges-svg{width:100%;height:auto;display:block;}\n.ges-svg .ges-grid{stroke:var(--ges-grid);stroke-width:1;}\n.ges-svg .ges-ax{font-size:10px;fill:var(--gray);}\n.ges-svg .ges-val{font-size:10px;font-weight:700;fill:var(--ink);}\n.ges-svg .ges-b1{fill:var(--ges-b1);}\n.ges-svg .ges-b2{fill:var(--accent);}\n.ges-fun{display:flex;flex-direction:column;gap:9px;}\n.ges-fun-r{display:grid;grid-template-columns:96px minmax(0,1fr) 64px;gap:10px;align-items:center;font-size:.76rem;color:var(--ink);}\n.ges-fun-b{height:24px;border-radius:6px;background:var(--accent);display:flex;align-items:center;padding-left:8px;color:#fff;font-weight:800;font-size:.75rem;min-width:30px;box-sizing:border-box;white-space:nowrap;}\n.ges-fun-b.f2{background:var(--accent-2,var(--accent));}\n.ges-fun-b.f3{background:var(--ges-ok);}\n.ges-fun-p{text-align:right;color:var(--gray);font-weight:700;font-size:.75rem;font-variant-numeric:tabular-nums;}\n.ges-ov{position:fixed;inset:0;background:rgba(20,18,15,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10000;}\n.ges-mod{background:var(--card);color:var(--ink);border-radius:var(--r-m,12px);box-shadow:var(--sh-3);width:min(580px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:18px 20px;box-sizing:border-box;}\n.ges-mt{margin:0 0 2px;font-size:1.02rem;font-weight:800;}\n.ges-ms{margin:0 0 12px;font-size:.78rem;color:var(--gray);}\n.ges-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0;}\n.ges-form .full{grid-column:1/-1;}\n.ges-form label,.ges-form .ges-fl{display:flex;flex-direction:column;gap:5px;font-size:.75rem;font-weight:700;color:var(--ink-2,var(--gray));}\n.ges-form textarea{resize:vertical;}\n@media (max-width:520px){.ges-form{grid-template-columns:1fr;}}\n.ges-pills{display:flex;gap:6px;flex-wrap:wrap;}\n.ges-pills button{border:1px solid var(--border);background:var(--card);color:var(--ink-2,var(--ink));border-radius:20px;padding:6px 12px;font-size:.75rem;font-weight:700;cursor:pointer;}\n.ges-pills button[aria-pressed=\"true\"]{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-2,var(--accent));}\n.ges-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:6px;}";
(function(){if(document.getElementById('ges-css'))return;var st=document.createElement('style');st.id='ges-css';st.textContent=GES_CSS+'\n'+GES_CSS_2;document.head.appendChild(st);})();

// A los hunters se los mide por el paquete que capta cada alta (no por la renta).
// La base guarda la clave (columna paquete, migración 027); el orden es el de la pantalla.
var GES_PAQ={caja:'Caja de Ahorro',plus:'Plus',gold:'Plus Gold',platinum:'Eminent Platinum',black:'Eminent Black'};
var GES_TIPO={accion:'Acción',feria:'Feria',posicion:'Posición comercial'};
var GES_MOD={presencial:'Presencial',virtual:'Virtual'};
var GES_FREC={unica:'Única',repite:'Se repite'};
var GES_VECES_MAX=24; // tope al crear una serie de una vez (la base admite hasta 52)
var GES_EST={planificada:'Planificada',realizada:'Realizada',cancelada:'Cancelada'};
var GES_PEST={prospecto:'Prospecto',en_gestion:'En gestión',alta:'Alta',descartado:'Descartado'};
var GES_MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

var GES={verTodo:(function(){try{return localStorage.getItem('fg_ges_vertodo')==='1';}catch(e){return false;}})(),tab:null,lista:null,listaP:null,personas:null,perP:null,det:null,detG:null,detPros:[],
  q:'',fEst:'',empresas:null,qEmp:'',tab0:null,
  f:{per:'90',tipo:'',hun:'',due:'',prueba:true},tablero:null,
  ag:{lunes:null,dia:null,data:null,dataL:null,hun:''}};

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
// Horario: la base guarda "10:00:00" (time); en pantalla va "10:00–12:00".
function gesHora(t){return t?String(t).slice(0,5):'';}
function gesHorario(g){var a=gesHora(g&&g.hora_desde),b=gesHora(g&&g.hora_hasta);return a?(b?a+'–'+b:'desde '+a):'';}
function gesMin(t){var m=String(t||'').match(/^(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):null;}
// Dos gestiones se pisan si las dos tienen horario y los tramos se cruzan. Sin
// "hasta" se toma una hora. Sin horario no se compara (no se sabe).
function gesSePisan(a,b){
  var a0=gesMin(a.hora_desde),b0=gesMin(b.hora_desde);if(a0==null||b0==null)return false;
  var a1=gesMin(a.hora_hasta),b1=gesMin(b.hora_hasta);if(a1==null)a1=a0+60;if(b1==null)b1=b0+60;
  return a0<b1&&b0<a1;
}
// null si el horario está bien; si no, el aviso.
function gesHorError(d){
  if(d.hora_hasta&&!d.hora_desde)return 'Poné también la hora de inicio (o borrá la de fin).';
  if(d.hora_desde&&d.hora_hasta&&gesMin(d.hora_hasta)<=gesMin(d.hora_desde))return 'La hora de fin tiene que ser después de la de inicio.';
  return null;
}
function gesPct(a,b){return b?Math.round(a*100/b)+'%':'—';}
function gesN(x){return (+x||0).toLocaleString('es-AR');}
function gesYo(){return _me?_me.id:null;}
function gesRol(){return _rolVigente();}
function gesEsAdmin(){return !!_admin;}
// El admin entra viendo lo suyo (como un oficial más) y con "Ver todo" ve todo.
// Los demás ya ven sólo lo suyo por la RLS: para ellos no cambia nada.
function gesSoloMio(){return gesEsAdmin()&&!GES.verTodo;}
function gesVerTodo(){
  GES.verTodo=!GES.verTodo;
  try{localStorage.setItem('fg_ges_vertodo',GES.verTodo?'1':'0');}catch(e){}
  // También se descarta un pedido en curso: traería lo del filtro anterior.
  GES.lista=null;GES.listaP=null;GES.tablero=null;GES.det=null;GES.ag.data=null;gesRender();
}
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
// Paquete: la celda tiene que ser sólo el paquete ("Plus Gold", "Paquete Black",
// "Eminent Platinum", "CA"), para no confundir un apellido con un paquete.
function gesPaqDe(v){
  var s=_padNorm(v).replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim().replace(/^paquete /,'');
  if(!s)return null;
  if(/^(caja( de ahorros?)?|ca)$/.test(s))return 'caja';
  if(s==='plus')return 'plus';
  if(/^(plus )?gold$/.test(s))return 'gold';
  if(/^(eminent )?(platinum|platino)$/.test(s))return 'platinum';
  if(/^(eminent )?black$/.test(s))return 'black';
  return null;
}
function gesPaqOpts(sel){return Object.keys(GES_PAQ).map(function(k){return '<option value="'+k+'"'+(sel===k?' selected':'')+'>'+GES_PAQ[k]+'</option>';}).join('');}

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
  GES.listaP=_sb.rpc('gestiones_lista',{p_limit:500,p_solo_mio:gesSoloMio()}).then(function(r){
    if(r&&r.error)throw r.error;
    GES.lista=(r&&r.data)||[];GES.listaP=null;return GES.lista;
  }).catch(function(e){GES.listaP=null;throw e;});
  return GES.listaP;
}

// ── Entrada: la vista "Gestiones" ───────────────────────────────────────────
function gesTabs(){
  var r=gesRol();
  if(r==='hunter')return [['agenda','Mi agenda'],['lista','Mis gestiones'],['tablero','Tablero']];
  if(r==='lider')return [['agenda','Agenda del equipo'],['tablero','Tablero del equipo'],['lista','Gestiones del equipo']];
  return [['empresas','Mis empresas'],['agenda','Agenda'],['lista','Gestiones'],['tablero','Tablero']];
}
function gesInit(tab){
  if(typeof _gesOn==='function'&&!_gesOn()){
    var root=document.getElementById('ges-root');
    if(root)root.innerHTML='<div class="ges-vacio" style="margin-top:24px"><strong style="color:var(--ink)">Gestiones todav\u00eda no est\u00e1 activo</strong><span>Cuando el administrador lo active, tu tablero aparece ac\u00e1.</span></div>';
    return;
  }
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
    '<div class="ges-top-acts">'+
    (_esPrueba?'<span class="ges-chip ges-c-warn" title="Lo que hagas con esta cuenta queda marcado como prueba y no suma en el tablero de los demás">Cuenta de prueba</span>':'')+
    (gesEsAdmin()&&!_esPrueba&&GES.tab!=='agenda'?'<span class="ges-chip '+(GES.verTodo?'ges-c-info':'ges-c-ok')+'">'+(GES.verTodo?'Viendo: todo el equipo':'Viendo: lo tuyo')+'</span>'+
      '<button type="button" class="btn bg ges-btn-sm" onclick="gesVerTodo()">'+(GES.verTodo?'Sólo lo mío':'Ver todo')+'</button>':'')+
    '</div>'+
    '</div>'+
    '<div class="ges-tabs" role="tablist">'+tabs.map(function(t){
      return '<button type="button" role="tab" aria-selected="'+(GES.tab===t[0]&&!GES.det)+'" class="ges-tab'+(GES.tab===t[0]&&!GES.det?' on':'')+'" onclick="gesIr(\''+t[0]+'\')">'+t[1]+
        (t[0]==='lista'&&_gesAviso?' <span class="fg-badge">'+_gesAviso+'</span>':'')+'</button>';
    }).join('')+'</div>';
  root.innerHTML=head+'<div id="ges-body" class="ges-body"><div class="ges-cargando">Cargando&hellip;</div></div>';
  if(GES.det){gesDetalle(GES.det);return;}
  if(GES.tab==='empresas')gesEmpresas();
  else if(GES.tab==='lista')gesListaRender();
  else if(GES.tab==='agenda')gesAgenda();
  else gesTablero();
}
function gesSubtitulo(){
  var r=gesRol();
  if(r==='hunter')return 'Tu agenda con día y horario, las acciones que te derivaron y las que registraste. Después de cada una cargá los prospectos y marcá las altas.';
  if(r==='lider')return 'Cómo viene tu equipo: la agenda de cada hunter, acciones, prospectos, altas y conversión.';
  return 'Lo que se hizo con tus empresas. Vos derivás; la carga la hacen los hunters.';
}
function gesBody(html){var b=document.getElementById('ges-body');if(b)b.innerHTML=html;}
function gesErr(e){
  var m=(e&&e.message)||String(e||'');
  gesBody('<div class="ges-vacio">No se pudo cargar. '+gesE(m)+'<br><button type="button" class="btn bg" onclick="GES.lista=null;gesRender()">Reintentar</button></div>');
}
// Lo llama auth.js cuando cambia el número de derivadas nuevas.
function gesAvisoSync(){
  if(GES._ultAviso===_gesAviso)return;
  GES._ultAviso=_gesAviso;
  var v=document.getElementById('view-gestiones');
  if(v&&v.style.display!=='none'&&!GES.det&&GES.tab==='lista'){GES.lista=null;gesRender();}
}

// ── Chips ───────────────────────────────────────────────────────────────────
function gesChipEst(g){
  if(g.estado==='planificada')return '<span class="ges-chip ges-c-info">Planificada &middot; '+gesE(gesFecha(g.fecha))+'</span>';
  if(g.estado==='cancelada')return '<span class="ges-chip ges-c-bad">Cancelada</span>';
  return '<span class="ges-chip ges-c-ok">Realizada</span>';
}
function gesNuevaHun(g){return g.hunter_id===gesYo()&&!g.visto_hunter;}
function gesNuevaDue(g){return g.dueno_id===gesYo()&&g.visto_dueno===false;}
function gesNueva(g){return gesNuevaHun(g)||gesNuevaDue(g);}
function gesNuevaTxt(g){
  if(gesNuevaHun(g))return 'Nueva'+(g.nota?': '+gesE(g.nota):'');
  return 'Novedad: '+gesE(gesNom(g.hunter_id))+(g.origen==='derivada'?' la complet\u00f3':' registr\u00f3 esta acci\u00f3n');
}

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
        'Todavía no hay gestiones. Derivá una acción desde <b>Mis empresas</b>.'))+'</div>';
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
    '<span class="ges-row-d">'+GES_TIPO[g.tipo]+' '+(GES_MOD[g.modalidad]||'').toLowerCase()+' &middot; '+gesE(gesFecha(g.fecha))+(gesHorario(g)?' '+gesE(gesHorario(g)):'')+(g.lugar?' &middot; '+gesE(g.lugar):'')+
      (g.frecuencia==='repite'?' &middot; '+gesE(gesRepTxt(g)):'')+' &middot; '+quien+
      (g.prueba?' &middot; <span class="ges-prueba">prueba</span>':'')+'</span>'+
    (g.estado==='realizada'?'<span class="ges-row-n"><b>'+gesN(g.n_pros)+'</b> prospectos &middot; <b class="ges-ok">'+gesN(g.n_altas)+'</b> '+(+g.n_altas===1?'alta':'altas')+' &middot; '+gesPct(g.n_altas,g.n_pros)+'</span>':'')+
    (gesNueva(g)?'<span class="ges-row-nueva">'+gesNuevaTxt(g)+'</span>':'')+
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
      var k=_padNorm(g.empresa),x=st[k]||(st[k]={v:0,p:0,a:0,plan:0,ult:null,hun:null,nov:0});
      if(g.visto_dueno===false)x.nov++;
      if(g.estado==='realizada'){x.v++;x.p+=+g.n_pros||0;x.a+=+g.n_altas||0;if(!x.ult||g.fecha>x.ult){x.ult=g.fecha;x.hun=g.hunter_id;}}
      if(g.estado==='planificada')x.plan++;
    });
    var tot={v:0,p:0,a:0};Object.keys(st).forEach(function(k){tot.v+=st[k].v;tot.p+=st[k].p;tot.a+=st[k].a;});
    var kp='<div class="ges-kpis ges-k4">'+gesKpi('Acciones realizadas',gesN(tot.v),'en tus empresas')+gesKpi('Prospectos',gesN(tot.p),'')+
      gesKpi('Altas',gesN(tot.a),'sueldos en Galicia',true)+gesKpi('Conversión',gesPct(tot.a,tot.p),'altas ÷ prospectos')+'</div>';
    if(!emps.length){gesBody(kp+'<div class="ges-vacio">Todavía no tenés empresas cargadas. Cargalas en tu nombre &rarr; <b>Base de datos</b> &rarr; Mis empresas y vuelven a aparecer acá para derivarlas.</div>');return;}
    GES._emps=emps.map(function(e){var k=_padNorm(e.empresa);return {empresa:e.empresa,k:k,s:st[k]||{v:0,p:0,a:0,plan:0}};});
    gesBody(kp+'<div class="ges-tool"><input type="search" class="ges-inp" placeholder="Buscar en tus empresas" value="'+_escAttr(GES.qEmp)+'" oninput="GES.qEmp=this.value;gesEmpPintar()" autocomplete="off"></div>'+
      '<div class="ges-card"><div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Empresa</th><th class="r">Acciones</th><th class="r">Prospectos</th><th class="r">Altas</th><th>Conversión</th><th>Último hunter</th><th></th></tr></thead>'+
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
    return '<tr'+(s.nov?' class="ges-tr-nov"':'')+'><td><b>'+gesE(e.empresa)+'</b>'+(s.nov?' <span class="ges-nov" title="Hay novedades: abrilas en la solapa Gestiones">Novedad</span>':'')+(s.plan?'<div class="ges-mini">'+s.plan+' planificada'+(s.plan>1?'s':'')+'</div>':'')+'</td>'+
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
  if(p.getAttribute('data-name')==='frecuencia'){
    var on=b.getAttribute('data-v')==='repite';
    ['gf-rep','gf-rep-ayuda'].forEach(function(id){var e=document.getElementById(id);if(e)e.hidden=!on;});
    if(on){var c=document.getElementById('gf-cada');if(c&&!c.value)c.focus();}
  }
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
// null si está bien; si no, el texto del aviso.
function gesRepError(d){
  if(d.frecuencia!=='repite')return null;
  if(!(d.cada_dias>=1&&d.cada_dias<=365))return 'Indicá cada cuántos días se repite (de 1 a 365).';
  if(d.veces!=null&&!(d.veces>=2&&d.veces<=GES_VECES_MAX))return 'La cantidad de veces va de 2 a '+GES_VECES_MAX+' (o dejala vacía si no sabés).';
  return null;
}
function gesSumarDias(iso,n){var a=String(iso).split('-'),d=new Date(+a[0],+a[1]-1,+a[2]);d.setDate(d.getDate()+n);return gesIso(d);}
function gesRepTxt(g){
  if(!g||g.frecuencia!=='repite')return '';
  return 'Cada '+(g.cada_dias||'?')+' días'+(g.veces?' · vez '+(g.vez||1)+' de '+g.veces:(g.vez>1?' · vez '+g.vez:''));
}
// Serie con cantidad conocida: después de guardar la 1ª, crea las demás ya
// planificadas (fecha + k·N), con el mismo serie_id y vez 2..X.
function gesCrearSerie(p,cb){
  if(p.frecuencia!=='repite'||!p.veces||p.veces<2){cb(0);return;}
  var filas=[];
  for(var k=1;k<p.veces;k++){
    var n={empresa:p.empresa,tipo:p.tipo,modalidad:p.modalidad,frecuencia:'repite',cada_dias:p.cada_dias,veces:p.veces,vez:k+1,
      serie_id:p.serie_id,fecha:gesSumarDias(p.fecha,k*p.cada_dias),estado:'planificada',dotacion:p.dotacion,nota:p.nota,origen:p.origen,
      hora_desde:p.hora_desde||null,hora_hasta:p.hora_hasta||null,lugar:p.lugar||null};
    if(p.origen==='derivada'){n.hunter_id=p.hunter_id;n.dueno_id=p.dueno_id;}else n.dueno_id=p.dueno_id;
    filas.push(n);
  }
  _sb.from('gestiones').insert(filas).select().then(function(r){
    if(r&&r.error){showToast('Se guardó la primera, pero no las otras fechas: '+r.error.message);cb(-1);return;}
    cb(filas.length);
  });
}
// Serie sin fin: al completar una, ofrecer la siguiente.
function gesOfrecerProxima(g){
  if(!g||g.frecuencia!=='repite'||g.veces||!g.cada_dias||g.estado!=='realizada')return;
  var f=gesSumarDias(g.fecha,g.cada_dias);
  fgConfirm('¿Creamos la próxima para el '+gesFecha(f)+'?\nSe repite cada '+g.cada_dias+' días. Queda planificada, con los mismos datos.',{ok:'Crear la próxima',cancelar:'Ahora no',peligro:false})
    .then(function(ok){if(ok)gesRepetir(g);});
}
function gesInt(id){var v=gesVal(id).replace(/\D/g,'');return v===''?null:Math.min(1000000,parseInt(v,10));}

// Formulario común de registrar / derivar / editar.
function gesFormHtml(g,modo){
  g=g||{};
  var hoy=gesHoy();
  var h='<div class="ges-form">'+
    '<div class="ges-fl"><span>Tipo</span>'+gesPills('tipo',GES_TIPO,g.tipo||'accion')+'</div>'+
    '<div class="ges-fl"><span>Modalidad</span>'+gesPills('modalidad',GES_MOD,g.modalidad||'presencial')+'</div>'+
    gesRepHtml(g,modo)+
    '<label><span>Fecha</span><input type="date" id="gf-fecha" class="ges-inp" value="'+_escAttr(g.fecha||hoy)+'" onchange="gesOcupForm()"></label>'+
    '<div class="ges-fl"><span>Horario <i class="ges-opc">(opcional)</i></span><div class="ges-hor">'+
      '<input type="time" id="gf-hd" class="ges-inp" value="'+_escAttr(gesHora(g.hora_desde))+'" aria-label="Desde" onchange="gesOcupForm()"><span>a</span>'+
      '<input type="time" id="gf-hh" class="ges-inp" value="'+_escAttr(gesHora(g.hora_hasta))+'" aria-label="Hasta" onchange="gesOcupForm()">'+
      '<span class="ges-atajos"><button type="button" onclick="gesHorSet(\'09:00\',\'13:00\')">Mañana</button><button type="button" onclick="gesHorSet(\'14:00\',\'18:00\')">Tarde</button></span>'+
    '</div></div>'+
    '<label class="full"><span>Lugar <i class="ges-opc">(opcional)</i></span><input type="text" id="gf-lugar" class="ges-inp" maxlength="200" value="'+_escAttr(g.lugar||'')+'" placeholder="Sede, dirección, piso"></label>';
  if(modo==='derivar'||modo==='asignar'){
    h+='<label><span>Hunter</span><select id="gf-hunter" class="ges-inp" onchange="gesOcupForm()">'+gesHuntersOpts(g.hunter_id,modo==='asignar')+'</select></label>';
  }else if(modo!=='agendar'){
    h+='<label><span>Estado</span><select id="gf-estado" class="ges-inp">'+Object.keys(GES_EST).map(function(k){
      return '<option value="'+k+'"'+((g.estado||'realizada')===k?' selected':'')+'>'+GES_EST[k]+'</option>';}).join('')+'</select></label>'+
      '<label><span>Dotación de la empresa</span><input type="text" inputmode="numeric" id="gf-dot" class="ges-inp" value="'+(g.dotacion!=null?g.dotacion:'')+'" placeholder="Empleados"></label>'+
      '<label><span>Asistentes o contactados</span><input type="text" inputmode="numeric" id="gf-asis" class="ges-inp" value="'+(g.asistentes!=null?g.asistentes:'')+'" placeholder="Personas que hablaron con vos"></label>';
    if(modo==='editar'&&(g.creada_por===gesYo()||gesEsAdmin())&&g.origen==='derivada')
      h+='<label><span>Hunter</span><select id="gf-hunter" class="ges-inp" onchange="gesOcupForm()">'+gesHuntersOpts(g.hunter_id)+'</select></label>';
  }
  h+='<div class="full ges-ocup" id="gf-ocup" hidden></div>'+
    '<label class="full"><span>Nota</span><textarea id="gf-nota" class="ges-inp" rows="2" maxlength="2000" placeholder="'+
    (modo==='derivar'||modo==='asignar'||modo==='agendar'?'Con quién hablar, qué flyer llevar':'Cómo fue, próximos pasos')+'">'+gesE(g.nota||'')+'</textarea></label>'+
  '</div>';
  return h;
}
// "¿Se repite?": Única, o cada N días (atajos 7/15/30) y, si se sabe, cuántas
// veces. Con la cantidad, al guardar se crean todas las fechas juntas.
function gesRepHtml(g,modo){
  var fr=g.frecuencia==='repite'?'repite':'unica';
  var serie=modo==='editar'&&g.veces&&g.vez; // en una serie ya armada no se cambia la cantidad
  return '<div class="full ges-fl"><span>¿Se repite?</span>'+gesPills('frecuencia',GES_FREC,fr)+
    '<div class="ges-rep" id="gf-rep"'+(fr==='repite'?'':' hidden')+'>'+
      '<span>Cada</span><input type="text" inputmode="numeric" id="gf-cada" class="ges-inp ges-inp-n" maxlength="3" value="'+(g.cada_dias||'')+'" placeholder="15" aria-label="Cada cuántos días"><span>días</span>'+
      '<span class="ges-atajos">'+[7,15,30].map(function(n){return '<button type="button" onclick="gesCada('+n+')">'+n+'</button>';}).join('')+'</span>'+
      (serie?'<span class="ges-mini">Vez '+g.vez+' de '+g.veces+'</span>':
        '<span>&middot;</span><input type="text" inputmode="numeric" id="gf-veces" class="ges-inp ges-inp-n" maxlength="2" value="'+(g.veces||'')+'" placeholder="sin fin" aria-label="Cantidad de veces"><span>veces</span>')+
    '</div>'+
    (modo==='editar'?'':'<div class="ges-mini" id="gf-rep-ayuda"'+(fr==='repite'?'':' hidden')+'>Si pon&eacute;s la cantidad de veces se crean todas las fechas ya planificadas. Si la dej&aacute;s vac&iacute;a, cuando completes una te ofrece crear la siguiente.</div>')+
  '</div>';
}
function gesCada(n){var i=document.getElementById('gf-cada');if(i){i.value=n;i.focus();}}
// soloEquipo: el líder sólo asigna a los hunters de su equipo (la base no le
// deja asignar en empresas ajenas a otros).
function gesHuntersOpts(sel,soloEquipo){
  var ps=GES.personas||{},ids=gesHunters(soloEquipo);
  ids.sort(function(a,b){return ps[a].nombre.localeCompare(ps[b].nombre);});
  if(!ids.length)return '<option value="">No hay hunters activos</option>';
  if(!sel)return '<option value="">Elegí un hunter</option>'+ids.map(function(id){return '<option value="'+_escAttr(id)+'">'+gesE(ps[id].nombre)+(ps[id].es_prueba?' (prueba)':'')+'</option>';}).join('');
  return ids.map(function(id){
    return '<option value="'+_escAttr(id)+'"'+(id===sel?' selected':'')+'>'+gesE(ps[id].nombre)+(ps[id].es_prueba?' (prueba)':'')+'</option>';
  }).join('');
}
function gesFormLeer(modo){
  var d={tipo:gesPillVal('tipo')||'accion',modalidad:gesPillVal('modalidad')||'presencial',frecuencia:gesPillVal('frecuencia')||'unica',
    fecha:gesVal('gf-fecha')||gesHoy(),nota:gesVal('gf-nota').trim()||null,
    hora_desde:gesVal('gf-hd')||null,hora_hasta:gesVal('gf-hh')||null,lugar:gesVal('gf-lugar').trim()||null};
  if(d.frecuencia==='repite'){
    d.cada_dias=gesInt('gf-cada');
    if(document.getElementById('gf-veces'))d.veces=gesInt('gf-veces');
  }else{d.cada_dias=null;d.veces=null;d.vez=null;}
  if(modo==='derivar'||modo==='asignar'){d.hunter_id=gesVal('gf-hunter');d.estado='planificada';}
  else if(modo==='agendar')d.estado='planificada';
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
    gesOcupForm();
    // ¿Ya tenía una visita planificada (derivada) para esta empresa? Ofrecer completarla.
    _sb.from('gestiones').select('id,fecha,tipo,creada_por,origen').eq('hunter_id',gesYo()).eq('estado','planificada')
      .eq('dueno_id',r.user_id).eq('empresa_key',String(r.empresa).trim().toLowerCase()).order('fecha').limit(3)
      .then(function(q){
        var l=(q&&q.data)||[],host=document.getElementById('ges-reg-plan');if(!host||!l.length)return;
        host.innerHTML='<div class="ges-aviso">Ya tenés '+(l.length===1?'una acción planificada':l.length+' acciones planificadas')+' para esta empresa. '+
          l.map(function(g){return '<button type="button" class="ges-link" onclick="gesCerrar();gesAbrirDet(\''+g.id+'\',true)">Completar la del '+gesE(gesFecha(g.fecha))+'</button>';}).join(' ')+'</div>';
      });
  });
}
function gesRegistrarOk(){
  var r=GES._reg;if(!r)return;
  var d=gesFormLeer('registrar');
  if(d.estado==='realizada'&&d.fecha>gesHoy()){showToast('Una acción realizada no puede tener fecha futura. Ponela como Planificada o cambiá la fecha.');return;}
  var er=gesRepError(d)||gesHorError(d);if(er){showToast(er);return;}
  if(d.frecuencia==='repite')d.vez=1;
  var b=document.getElementById('ges-reg-ok');if(b){b.disabled=true;b.textContent='Guardando…';}
  d.empresa=r.empresa;d.dueno_id=r.user_id;d.origen='propia';
  gesChoque(gesYo(),d).then(function(seguir){
  if(!seguir){if(b){b.disabled=false;b.textContent='Guardar y cargar prospectos';}return;}
  _sb.from('gestiones').insert(d).select().single().then(function(res){
    if(res&&res.error){if(b){b.disabled=false;b.textContent='Guardar y cargar prospectos';}showToast('No se pudo guardar: '+res.error.message);return;}
    gesCerrar();GES.lista=null;
    var g=res.data;
    gesCrearSerie(g,function(n){
      showToast(n>0?'Guardada, y planificadas las otras '+n+' fechas. Ahora cargá los prospectos.':'Gestión guardada. Ahora cargá los prospectos.');
      GES.det=g.id;GES.tab='lista';
      switchApp('gestiones');
      if(!n)gesOfrecerProxima(g);
    });
  });
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
    gesOcupForm();
  });
}
function gesDerivarOk(){
  var e=GES._der;if(!e)return;
  var d=gesFormLeer('derivar');
  if(!d.hunter_id){showToast('Elegí a qué hunter se la derivás.');return;}
  var er=gesRepError(d)||gesHorError(d);if(er){showToast(er);return;}
  if(d.frecuencia==='repite')d.vez=1;
  var b=document.getElementById('ges-der-ok');if(b){b.disabled=true;b.textContent='Derivando…';}
  d.empresa=e.empresa;d.origen='derivada';
  gesChoque(d.hunter_id,d).then(function(seguir){
  if(!seguir){if(b){b.disabled=false;b.textContent='Derivar';}return;}
  _sb.from('gestiones').insert(d).select().single().then(function(res){
    if(res&&res.error){if(b){b.disabled=false;b.textContent='Derivar';}showToast('No se pudo derivar: '+res.error.message);return;}
    gesCerrar();GES.lista=null;
    gesCrearSerie(res.data,function(n){
      showToast('Derivada a '+gesNom(d.hunter_id)+(n>0?', con las '+(n+1)+' fechas planificadas':'')+'. Le aparece en su agenda y en la marca de su avatar.');
      GES.ag.data=null;gesRender();
    });
  });
  });
}

// ── Detalle de una gestión ──────────────────────────────────────────────────
function gesAbrirDet(id,editar){GES.det=id;GES._editarAlAbrir=!!editar;if(document.getElementById('view-gestiones').style.display==='none')switchApp('gestiones');else gesRender();window.scrollTo(0,0);}
function gesVolver(){GES.det=null;GES.detG=null;GES.ag.data=null;gesRender();}
function gesDetalle(id){
  Promise.all([
    _sb.from('gestiones').select('*').eq('id',id).maybeSingle(),
    _sb.from('gestion_prospectos').select('*').eq('gestion_id',id).order('created_at'),
    gesPersonas()
  ]).then(function(res){
    var g=res[0]&&res[0].data;
    if(!g){gesBody('<button type="button" class="ges-link" onclick="gesVolver()">&larr; Volver</button><div class="ges-vacio">Esa gestión ya no existe o no tenés acceso.</div>');return;}
    GES.detG=g;GES.detPros=(res[1]&&res[1].data)||[];
    // Abrirla la saca de las novedades: toda la serie, para quien la abre
    // (hunter y/o dueño). Lo hace la base: el dueño no puede editar la acción.
    if(gesNueva(g)){
      var yo=gesYo();
      _sb.rpc('gestion_marcar_vista',{p_serie:g.serie_id}).then(function(){
        (GES.lista||[]).concat([g]).forEach(function(x){
          if(x.serie_id!==g.serie_id)return;
          if(x.hunter_id===yo)x.visto_hunter=true;
          if(x.dueno_id===yo)x.visto_dueno=true;
        });
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
  if(ed&&g.frecuencia==='repite'&&!g.veces)acts+='<button type="button" class="btn bg ges-btn-sm" onclick="gesRepetir()">Crear la próxima (+'+(g.cada_dias||30)+' días)</button>';
  if(gesPuedeBorrar(g))acts+='<button type="button" class="btn bg ges-btn-sm ges-peligro" onclick="gesBorrar()">Eliminar</button>';
  var h='<button type="button" class="ges-link" onclick="gesVolver()">&larr; Volver</button>'+
    '<div class="ges-det-top"><div><h3 class="ges-h1">'+gesE(g.empresa)+'</h3>'+
    '<p class="ges-sub">'+GES_TIPO[g.tipo]+' '+(GES_MOD[g.modalidad]||'').toLowerCase()+' &middot; '+gesE(gesFecha(g.fecha))+(gesHorario(g)?' &middot; '+gesE(gesHorario(g)):'')+(g.lugar?' &middot; '+gesE(g.lugar):'')+(g.frecuencia==='repite'?' &middot; '+gesE(gesRepTxt(g)):' &middot; Única vez')+
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
    '<div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Nombre</th><th>CUIL</th><th>Paquete</th><th>Estado</th>'+(ed?'<th></th>':'')+'</tr></thead><tbody>'+
    (l.length?l.map(function(p,i){
      var cls=p.estado==='alta'?' alta':p.estado==='descartado'?' desc':p.estado==='en_gestion'?' gest':'';
      return '<tr><td>'+gesE(p.nombre)+'</td><td class="ges-num">'+(p.cuil?gesE(gesCuilFmt(p.cuil)):'<span class="ges-mini">—</span>')+'</td>'+
        '<td>'+(ed?'<select class="ges-est" aria-label="Paquete de '+_escAttr(p.nombre)+'" onchange="gesProsCampo('+i+',\'paquete\',this.value)"><option value="">—</option>'+gesPaqOpts(p.paquete)+'</select>'
          :(GES_PAQ[p.paquete]||'—'))+'</td>'+
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
    '<select class="ges-inp" id="gp-paq" aria-label="Paquete"><option value="">Paquete</option>'+gesPaqOpts()+'</select>'+
    '<button type="button" class="btn bp ges-btn-sm" onclick="gesProsAgregar()">Agregar</button></div>'+
    '<details class="ges-paste"><summary>Pegar varios desde Excel</summary>'+
    '<p class="ges-mini">Copiá las filas del Excel (nombre, CUIL y paquete, en cualquier orden) y pegalas acá. El paquete se reconoce escrito como en la lista (Plus, Plus Gold, Eminent Black…).</p>'+
    '<textarea class="ges-inp" id="gp-paste" rows="4" oninput="gesPastePrev()" placeholder="Ana Pérez&#9;27-12345678-3&#9;Plus Gold"></textarea>'+
    '<div class="ges-paste-res" id="gp-prev"></div>'+
    '<button type="button" class="btn bp ges-btn-sm" id="gp-paste-ok" onclick="gesPasteOk()" disabled>Agregar a la lista</button></details>';
}
// Parser del bloque pegado: por renglón, el CUIL es la celda de 11 dígitos, el
// paquete la celda que dice sólo un paquete (gesPaqDe) y el nombre la primera
// otra celda con letras. Saltea la fila de títulos si viene.
function gesPasteParse(t){
  var ya={};(GES.detPros||[]).forEach(function(p){if(p.cuil)ya[p.cuil]=1;});
  var vistos={};
  return String(t||'').split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean).map(function(l){
    var c=l.split(/\t|;|\s{2,}/).map(function(x){return x.trim();}).filter(Boolean);
    if(c.length&&/nombre/i.test(l)&&/cuil|cuit|paquete/i.test(l))return null;
    var cuil=null,paq=null,nom=null;
    c.forEach(function(x){
      var d=gesCuilLimpio(x);
      if(!cuil&&d.length===11&&/^[\d\s.\-]+$/.test(x)){cuil=d;return;}
      if(!paq){var pq=gesPaqDe(x);if(pq){paq=pq;return;}}
      if(!nom&&/[a-záéíóúñ]/i.test(x))nom=x.replace(/\s+/g,' ');
    });
    var r={nombre:nom,cuil:cuil,paquete:paq,ok:true,motivo:''};
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
  _sb.from('gestion_prospectos').insert(ok.map(function(x){return {gestion_id:gid,nombre:x.nombre,cuil:x.cuil,paquete:x.paquete,estado:'prospecto'};})).select().then(function(res){
    if(res&&res.error){showToast('No se pudo agregar: '+res.error.message);gesPastePrev();return;}
    GES.detPros=GES.detPros.concat(res.data||[]);GES.lista=null;
    var mal=r.filter(function(x){return !x.ok;});
    gesDetPintar();
    // Lo que no entró queda en el cuadro para corregirlo.
    if(mal.length){
      var d=document.querySelector('.ges-paste');if(d)d.open=true;
      var t2=document.getElementById('gp-paste');if(t2){t2.value=mal.map(function(x){return [x.nombre||'',x.cuil?gesCuilFmt(x.cuil):'',GES_PAQ[x.paquete]||''].join('\t');}).join('\n');gesPastePrev();}
    }
    showToast((res.data||[]).length+' prospectos agregados'+(mal.length?'. Quedaron '+mal.length+' en el cuadro para corregir.':'.'));
  });
}
function gesProsAgregar(){
  var nom=gesVal('gp-nom').trim(),cuil=gesCuilLimpio(gesVal('gp-cuil')),paq=gesVal('gp-paq');
  if(!nom){showToast('Escribí el nombre.');return;}
  if(cuil&&!gesCuilOk(cuil)){showToast('Ese CUIL no es válido. Revisalo o dejalo vacío.');return;}
  if(cuil&&GES.detPros.some(function(p){return p.cuil===cuil;})){showToast('Ese CUIL ya está en la lista.');return;}
  _sb.from('gestion_prospectos').insert({gestion_id:GES.detG.id,nombre:nom,cuil:cuil||null,paquete:paq||null,estado:'prospecto'}).select().single().then(function(res){
    if(res&&res.error){showToast('No se pudo agregar: '+res.error.message);return;}
    GES.detPros.push(res.data);GES.lista=null;gesDetPintar();
    var n=document.getElementById('gp-nom');if(n)n.focus();
  });
}
function gesProsCampo(i,campo,val){
  var p=GES.detPros[i];if(!p)return;
  var upd={};upd[campo]=(campo==='paquete')?(val||null):val;
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
    gesModal('<h3 class="ges-mt">'+(realizada?'Completar la acción':'Editar datos')+'</h3><p class="ges-ms">'+gesE(g.empresa)+'</p>'+
      gesFormHtml(base,'editar')+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ges-ed-ok" onclick="gesEditarOk()">Guardar</button></div>');
    gesOcupForm();
  });
}
function gesEditarOk(){
  var g=GES.detG;if(!g)return;
  var d=gesFormLeer('editar');
  if(d.estado==='realizada'&&d.fecha>gesHoy()){showToast('Una acción realizada no puede tener fecha futura.');return;}
  if(d.frecuencia==='repite'&&g.veces&&d.veces===undefined)d.veces=g.veces; // serie ya armada: la cantidad no se toca
  var er=gesRepError(d)||gesHorError(d);if(er){showToast(er);return;}
  if(d.frecuencia==='repite'&&!g.vez)d.vez=1;
  var antes=g.estado;
  var b=document.getElementById('ges-ed-ok');if(b){b.disabled=true;b.textContent='Guardando…';}
  var cambioHora=d.fecha!==g.fecha||gesHora(d.hora_desde)!==gesHora(g.hora_desde)||gesHora(d.hora_hasta)!==gesHora(g.hora_hasta)||(d.hunter_id&&d.hunter_id!==g.hunter_id);
  (cambioHora&&d.estado!=='cancelada'?gesChoque(d.hunter_id||g.hunter_id,d,g.id):Promise.resolve(true)).then(function(seguir){
  if(!seguir){if(b){b.disabled=false;b.textContent='Guardar';}return;}
  _sb.from('gestiones').update(d).eq('id',g.id).select().single().then(function(res){
    if(res&&res.error){if(b){b.disabled=false;b.textContent='Guardar';}showToast('No se pudo guardar: '+res.error.message);return;}
    gesCerrar();GES.detG=res.data;GES.lista=null;GES.ag.data=null;gesDetPintar();showToast('Guardado.');
    if(antes!=='realizada')gesOfrecerProxima(res.data);
  });
  });
}
// Feria o acción que se repite: crea la próxima fecha con los mismos datos.
function gesRepetir(base){
  var g=base||GES.detG;if(!g)return;
  var cada=g.cada_dias||30;
  var yo=gesYo();
  var n={empresa:g.empresa,tipo:g.tipo,modalidad:g.modalidad,frecuencia:'repite',cada_dias:cada,veces:null,vez:(g.vez||1)+1,serie_id:g.serie_id,
    fecha:gesSumarDias(g.fecha,cada),estado:'planificada',dotacion:g.dotacion,nota:'Repetición de la del '+gesFecha(g.fecha),
    hora_desde:g.hora_desde||null,hora_hasta:g.hora_hasta||null,lugar:g.lugar||null};
  // Si la repite el oficial que la derivó, sigue siendo derivada al mismo hunter;
  // si la repite el hunter, es suya (el oficial dueño se mantiene).
  if(g.origen==='derivada'&&g.creada_por===yo){n.origen='derivada';n.hunter_id=g.hunter_id;n.dueno_id=g.dueno_id;}
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

// ── Agenda ──────────────────────────────────────────────────────────────────
// La semana del hunter (lo que tiene que hacer, con horario y lugar) y, para el
// líder y el admin, la grilla hunters × días para ver quién tiene lugar y
// asignarle. Lee la tabla directo: la RLS ya decide qué ve cada uno.
var GES_DSEM=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
function gesLunes(iso){var a=String(iso).split('-'),d=new Date(+a[0],+a[1]-1,+a[2]);d.setDate(d.getDate()-((d.getDay()+6)%7));return gesIso(d);}
function gesAgDias(lunes){var r=[];for(var i=0;i<7;i++)r.push(gesSumarDias(lunes,i));return r;}
function gesAgModo(){return (gesRol()==='lider'||gesEsAdmin())?'equipo':'semana';}
function gesAgRango(a,b){
  var x=String(a).split('-'),y=String(b).split('-');
  return (+x[2])+(x[1]!==y[1]?' de '+GES_MES[+x[1]-1]:'')+' al '+(+y[2])+' de '+GES_MES[+y[1]-1]+(y[0]!==String(new Date().getFullYear())?' '+y[0]:'');
}
// "10–12", "9:30–13" (para las casillas chicas de la grilla)
function gesAgCorto(g){
  var c=function(t){return gesHora(t).replace(/^0/,'').replace(/:00$/,'');};
  return g.hora_desde?c(g.hora_desde)+(g.hora_hasta?'–'+c(g.hora_hasta):''):'';
}
function gesAgOrden(a,b){
  if(a.fecha!==b.fecha)return a.fecha<b.fecha?-1:1;
  var x=gesMin(a.hora_desde),y=gesMin(b.hora_desde);
  if(x!==y)return x==null?-1:y==null?1:x-y;
  return String(a.empresa).localeCompare(String(b.empresa));
}
// Hunters para elegir: el líder, sólo los de su equipo (soloEquipo).
function gesHunters(soloEquipo){
  var ps=GES.personas||{},yo=gesYo(),lid=soloEquipo&&!gesEsAdmin()&&gesRol()==='lider';
  var ids=Object.keys(ps).filter(function(id){return ps[id].rol==='hunter'&&(!lid||ps[id].lider_id===yo);});
  ids.sort(function(a,b){return ps[a].nombre.localeCompare(ps[b].nombre);});
  return ids;
}
function gesAgCargar(force){
  var a=GES.ag;if(!a.lunes)a.lunes=gesLunes(gesHoy());
  if(a.data&&a.dataL===a.lunes&&!force)return Promise.resolve(a.data);
  var l=a.lunes,turno=a.turno=(a.turno||0)+1;
  var q=_sb.from('gestiones').select('id,empresa,tipo,modalidad,fecha,hora_desde,hora_hasta,lugar,estado,hunter_id,dueno_id,creada_por,origen,visto_hunter,visto_dueno,prueba')
    .gte('fecha',l).lte('fecha',gesSumarDias(l,6)).order('fecha').limit(2000);
  if(gesRol()==='hunter')q=q.eq('hunter_id',gesYo());
  return q.then(function(r){
    if(r&&r.error)throw r.error;
    if(turno!==a.turno)return null; // llegó tarde: ya se pidió otra semana
    a.data=((r&&r.data)||[]).sort(gesAgOrden);a.dataL=l;return a.data;
  });
}
function gesAgenda(){gesAgCargar().then(function(l){if(l)gesAgPintar();}).catch(gesErr);}
function gesAgIr(n){
  var a=GES.ag;a.lunes=n===0?gesLunes(gesHoy()):gesSumarDias(a.lunes||gesLunes(gesHoy()),7*n);a.dia=null;
  gesBody('<div class="ges-cargando">Cargando&hellip;</div>');gesAgenda();
}
function gesAgDia(d){GES.ag.dia=d;gesAgPintar();}
function gesAgBloque(g,corto){
  var h=gesHorario(g),nueva=gesNueva(g),cls='ges-ag-b est-'+g.estado+(nueva?' nueva':'');
  var tit=GES_TIPO[g.tipo]+' · '+g.empresa+(g.lugar?' · '+g.lugar:'')+(gesRol()!=='hunter'?' · '+gesNom(g.hunter_id):'');
  if(corto)return '<button type="button" class="'+cls+'" title="'+_escAttr(tit)+'" onclick="gesAbrirDet(\''+g.id+'\')">'+
    '<span class="ges-ag-h">'+(h?gesE(gesAgCorto(g)):'Sin horario')+'</span><span class="ges-ag-e">'+gesE(g.empresa)+'</span></button>';
  return '<button type="button" class="'+cls+'" onclick="gesAbrirDet(\''+g.id+'\')">'+
    '<span class="ges-ag-h">'+(h?gesE(h):'Sin horario')+(g.estado==='realizada'?' &middot; Realizada':g.estado==='cancelada'?' &middot; Cancelada':'')+'</span>'+
    '<span class="ges-ag-e">'+gesE(g.empresa)+'</span>'+
    '<span class="ges-ag-t">'+GES_TIPO[g.tipo]+(g.modalidad==='virtual'?' virtual':'')+(g.lugar?' &middot; '+gesE(g.lugar):'')+'</span>'+
    (gesRol()!=='hunter'?'<span class="ges-ag-t">Hunter: '+gesE(gesNom(g.hunter_id))+'</span>':'')+
    (g.prueba?'<span class="ges-prueba">prueba</span>':'')+
    (nueva?'<span class="ges-ag-nueva">Nueva</span>':'')+
  '</button>';
}
function gesAgPintar(){
  var a=GES.ag,l=a.data||[],hoy=gesHoy(),modo=gesAgModo(),dias=gesAgDias(a.lunes);
  if(!l.some(function(g){return g.fecha===dias[6];}))dias=dias.slice(0,6); // el domingo, sólo si hay algo
  if(!a.dia||dias.indexOf(a.dia)<0)a.dia=dias.indexOf(hoy)>=0?hoy:dias[0];
  var esHun=gesRol()==='hunter';
  var tool='<div class="ges-ag-tool"><div class="ges-ag-nav">'+
      '<button type="button" class="btn bg ges-btn-sm" onclick="gesAgIr(-1)" aria-label="Semana anterior" title="Semana anterior">&larr;</button>'+
      '<button type="button" class="btn bg ges-btn-sm" onclick="gesAgIr(0)">Hoy</button>'+
      '<button type="button" class="btn bg ges-btn-sm" onclick="gesAgIr(1)" aria-label="Semana siguiente" title="Semana siguiente">&rarr;</button>'+
      '<span class="ges-ag-rango">'+gesE(gesAgRango(dias[0],dias[dias.length-1]))+'</span></div>'+
    '<div class="ges-ag-acts">'+
      (esHun?'<button type="button" class="btn bp ges-btn-sm" onclick="gesAgendar()">+ Agendar</button>':
        '<button type="button" class="btn bg ges-btn-sm" onclick="gesAgPegar()">Pegar desde Excel</button>'+
        '<button type="button" class="btn bp ges-btn-sm" onclick="gesAgendar()">+ Asignar</button>')+
    '</div></div>';
  gesBody(tool+(modo==='equipo'?gesAgEquipo(dias,l,hoy):gesAgSemana(dias,l,hoy)));
}
function gesAgSemana(dias,l,hoy){
  var a=GES.ag;
  var pills='<div class="ges-ag-pills" role="tablist">'+dias.map(function(d,i){
    var n=l.filter(function(g){return g.fecha===d&&g.estado!=='cancelada';}).length;
    return '<button type="button" role="tab" aria-selected="'+(d===a.dia)+'" aria-pressed="'+(d===a.dia)+'" class="'+(n?'tiene':'')+'" onclick="gesAgDia(\''+d+'\')">'+GES_DSEM[i]+'<b>'+(+d.slice(8))+'</b></button>';
  }).join('')+'</div>';
  var cols=dias.map(function(d,i){
    var its=l.filter(function(g){return g.fecha===d;});
    return '<section class="ges-ag-dia'+(d===hoy?' hoy':'')+(d===a.dia?' on':'')+'"><h4>'+GES_DSEM[i]+' '+(+d.slice(8))+(d===hoy?' &middot; hoy':'')+'</h4>'+
      (its.length?its.map(function(g){return gesAgBloque(g);}).join(''):'<div class="ges-ag-libre">Libre</div>')+'</section>';
  }).join('');
  var vacia=!l.length?'<p class="ges-nota">'+(gesRol()==='hunter'?'Esta semana no tenés nada agendado. Lo que te asignen aparece acá; vos también podés agendar con <b>+ Agendar</b>.':'No hay nada agendado esta semana.')+'</p>':'';
  return pills+'<div class="ges-ag-sem" style="--n:'+dias.length+'">'+cols+'</div>'+vacia;
}
function gesAgEquipo(dias,l,hoy){
  var a=GES.ag,ps=GES.personas||{},hs=gesHunters(true);
  // También quien tenga algo esa semana aunque ya no figure como hunter del equipo.
  l.forEach(function(g){if(g.hunter_id&&hs.indexOf(g.hunter_id)<0)hs.push(g.hunter_id);});
  var todos=hs.slice();
  if(a.hun)hs=hs.filter(function(id){return id===a.hun;});
  GES._agHun=hs;
  var filtro='<label class="ges-ag-fil"><span class="ges-lbl">Hunter</span><select class="ges-inp ges-sel" onchange="GES.ag.hun=this.value;gesAgPintar()"><option value="">Todos</option>'+
    todos.map(function(id){return '<option value="'+_escAttr(id)+'"'+(id===a.hun?' selected':'')+'>'+gesE(gesNom(id))+'</option>';}).join('')+'</select></label>';
  if(!hs.length)return '<div class="ges-vacio">'+(gesRol()==='lider'?'Todavía no tenés hunters en tu equipo. El administrador los asigna en Admin &rarr; Usuarios &rarr; &laquo;Líder a cargo&raquo;.':'No hay hunters activos.')+'</div>';
  var head='<tr><th>Hunter</th>'+dias.map(function(d,i){return '<th'+(d===hoy?' class="hoy"':'')+'>'+GES_DSEM[i]+' '+(+d.slice(8))+'</th>';}).join('')+'</tr>';
  var filas=hs.map(function(id,hi){
    var suyas=l.filter(function(g){return g.hunter_id===id;});
    var n=suyas.filter(function(g){return g.estado!=='cancelada';}).length;
    return '<tr><td class="nom">'+gesE(gesNom(id))+(ps[id]&&ps[id].es_prueba?' <span class="ges-prueba">prueba</span>':'')+'<div class="ges-mini">'+(n?n+' esta semana':'Sin nada esta semana')+'</div></td>'+
      dias.map(function(d){
        var its=suyas.filter(function(g){return g.fecha===d;}),libre=!its.some(function(g){return g.estado!=='cancelada';});
        return '<td'+(d===hoy?' class="hoy"':'')+'><div class="ges-ag-cel">'+its.map(function(g){return gesAgBloque(g,true);}).join('')+
          '<button type="button" class="ges-ag-mas'+(libre?' libre':'')+'" onclick="gesAgendar('+hi+',\''+d+'\')" title="Asignarle algo este día">'+(libre?'Libre':'+')+'</button></div></td>';
      }).join('')+'</tr>';
  }).join('');
  return '<div class="ges-filtros">'+filtro+'<span class="ges-mini ges-ag-ley">Tocá <b>Libre</b> o <b>+</b> para asignarle algo ese día. Lo cancelado se ve tachado y no ocupa lugar.</span></div>'+
    '<div class="ges-card"><div class="ges-tw"><table class="ges-ag-eq">'+head+filas+'</table></div></div>';
}

// ── Agendar (hunter) / Asignar (oficial, líder, admin) ──────────────────────
function gesAgendar(hi,fecha){
  var esHun=gesRol()==='hunter';
  GES._agEmp=null;GES._agEmps=[];
  gesPersonas().then(function(){
    var pre={fecha:fecha||gesHoy(),tipo:'posicion',estado:'planificada',hunter_id:(hi!=null&&GES._agHun)?GES._agHun[hi]:''};
    gesModal('<h3 class="ges-mt">'+(esHun?'Agendar':'Asignar a un hunter')+'</h3>'+
      '<p class="ges-ms">'+(esHun?'Queda en tu agenda como planificada. Después la marcás como realizada y cargás los prospectos.':'Le aparece en su agenda y en la marca de su avatar.')+'</p>'+
      '<div class="ges-form ges-form-emp"><label class="full"><span>Empresa</span><input type="search" id="gf-emp" class="ges-inp" placeholder="Buscá por razón social" autocomplete="off" oninput="gesAgEmpBuscar()"></label>'+
      '<div class="full ges-emp-res" id="gf-emp-res"></div></div>'+
      gesFormHtml(pre,esHun?'agendar':'asignar')+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ges-ag-ok" onclick="gesAgendarOk()">'+(esHun?'Agendar':'Asignar')+'</button></div>');
    gesOcupForm();
  });
}
function gesAgEmpBuscar(){
  clearTimeout(GES._agEmpT);GES._agEmp=null;
  var q=gesVal('gf-emp').trim(),host=document.getElementById('gf-emp-res');
  if(q.length<2){if(host)host.innerHTML='';return;}
  GES._agEmpT=setTimeout(function(){
    var t=GES._agEmpTurno=(GES._agEmpTurno||0)+1;
    _sb.rpc('gestiones_empresas',{p_q:q,p_limit:20}).then(function(r){
      var h=document.getElementById('gf-emp-res');if(t!==GES._agEmpTurno||!h)return;
      if(r&&r.error){h.innerHTML='<span class="ges-mini">No se pudo buscar: '+gesE(r.error.message)+'</span>';return;}
      GES._agEmps=(r&&r.data)||[];
      h.innerHTML=GES._agEmps.length?GES._agEmps.map(function(e,i){
        return '<button type="button" onclick="gesAgEmpElegir('+i+')">'+gesE(e.empresa)+' <span class="ges-mini">&middot; '+gesE(gesNom(e.dueno_id))+'</span></button>';
      }).join(''):'<span class="ges-mini">Ninguna empresa de la base coincide.</span>';
    });
  },200);
}
function gesAgEmpElegir(i){
  var e=GES._agEmps&&GES._agEmps[i];if(!e)return;
  GES._agEmp=e;var inp=document.getElementById('gf-emp');if(inp)inp.value=e.empresa;
  var h=document.getElementById('gf-emp-res');if(h)h.innerHTML='<span class="ges-chip ges-c-ok">Empresa de '+gesE(gesNom(e.dueno_id))+'</span>';
}
function gesAgendarOk(){
  var e=GES._agEmp;if(!e){showToast('Elegí la empresa de la lista.');return;}
  var esHun=gesRol()==='hunter',d=gesFormLeer(esHun?'agendar':'asignar');
  if(!esHun&&!d.hunter_id){showToast('Elegí el hunter.');return;}
  var er=gesRepError(d)||gesHorError(d);if(er){showToast(er);return;}
  if(d.frecuencia==='repite')d.vez=1;
  d.empresa=e.empresa;d.dueno_id=e.dueno_id;d.origen=esHun?'propia':'derivada';
  var b=document.getElementById('ges-ag-ok'),txt=b?b.textContent:'';
  var listo=function(){if(b){b.disabled=false;b.textContent=txt;}};
  if(b){b.disabled=true;b.textContent='Guardando…';}
  gesChoque(esHun?gesYo():d.hunter_id,d).then(function(seguir){
    if(!seguir){listo();return;}
    _sb.from('gestiones').insert(d).select().single().then(function(res){
      if(res&&res.error){listo();showToast('No se pudo guardar: '+res.error.message);return;}
      gesCerrar();GES.lista=null;GES.ag.data=null;
      gesCrearSerie(res.data,function(n){
        showToast((esHun?'Agendada':'Asignada a '+gesNom(d.hunter_id))+(n>0?', con las '+(n+1)+' fechas':'')+'.');
        GES.ag.lunes=gesLunes(d.fecha);GES.ag.dia=d.fecha;GES.tab='agenda';GES.det=null;gesRender();
      });
    });
  });
}

// ── Superposición de horarios ───────────────────────────────────────────────
// La base devuelve todo lo de ese hunter ese día (gestiones_ocupado): un
// oficial no ve las gestiones de otros oficiales con el mismo hunter, pero sí
// tiene que saber que está ocupado (sale "otra acción", sin la empresa).
function gesOcupTxt(x){return (gesHorario(x)||'sin horario')+' '+(x.empresa?'en '+x.empresa:'(otra acción)');}
// Promesa: true = guardar. Avisa si se pisa y deja guardar igual.
function gesChoque(hunter,d,excluir){
  if(!hunter||!d.hora_desde||!d.fecha||d.estado==='cancelada')return Promise.resolve(true);
  return _sb.rpc('gestiones_ocupado',{p_hunter:hunter,p_fecha:d.fecha}).then(function(r){
    var l=((r&&r.data)||[]).filter(function(x){return x.id!==excluir&&gesSePisan(x,d);});
    if(!l.length)return true;
    return fgConfirm((hunter===gesYo()?'Ya tenés algo a esa hora':gesNom(hunter)+' ya tiene algo a esa hora')+'\n'+
      l.map(gesOcupTxt).join(', ')+', el '+gesFecha(d.fecha)+'. ¿Guardar igual?',{ok:'Guardar igual',cancelar:'Cambiar el horario',peligro:false});
  }).catch(function(){return true;}); // sin red no se frena la carga
}
// Debajo del formulario: qué tiene ese hunter ese día (y qué se pisa).
function gesOcupForm(){
  var host=document.getElementById('gf-ocup');if(!host)return;
  var ed=!!document.getElementById('ges-ed-ok')&&GES.detG,hs=document.getElementById('gf-hunter');
  var hun=hs?hs.value:(ed?GES.detG.hunter_id:gesYo()),fecha=gesVal('gf-fecha'),excl=ed?GES.detG.id:null;
  if(!hun||!fecha){host.hidden=true;return;}
  var t=GES._ocupTurno=(GES._ocupTurno||0)+1;
  _sb.rpc('gestiones_ocupado',{p_hunter:hun,p_fecha:fecha}).then(function(r){
    var h=document.getElementById('gf-ocup');if(t!==GES._ocupTurno||!h||(r&&r.error)){if(h&&r&&r.error)h.hidden=true;return;}
    var yo=hun===gesYo(),me={hora_desde:gesVal('gf-hd')||null,hora_hasta:gesVal('gf-hh')||null};
    var l=((r&&r.data)||[]).filter(function(x){return x.id!==excl;});
    h.hidden=false;
    h.innerHTML=l.length?'<b>'+(yo?'Ese día tenés':gesE(gesNom(hun))+' ese día tiene')+':</b> '+l.map(function(x){
        var p=gesSePisan(x,me);return '<span'+(p?' class="ges-pisa"':'')+'>'+gesE(gesOcupTxt(x))+(p?' (se pisa)':'')+'</span>';
      }).join(' &middot; '):(yo?'Ese día no tenés nada agendado.':gesE(gesNom(hun))+' no tiene nada agendado ese día.');
  }).catch(function(){var h=document.getElementById('gf-ocup');if(h)h.hidden=true;});
}
function gesHorSet(a,b){var x=document.getElementById('gf-hd'),y=document.getElementById('gf-hh');if(x)x.value=a;if(y)y.value=b;gesOcupForm();}

// ── Pegar la agenda desde Excel ─────────────────────────────────────────────
// Una fila por renglón, celdas en cualquier orden: la fecha (21/10 o
// 21/10/2026), el horario ("10 a 12", "10:00-12:30", "9hs"), el hunter (por su
// nombre) y el tipo si viene; de lo demás, la primera celda es la empresa y la
// segunda el lugar.
function gesFechaDe(x){
  var s=String(x||'').trim().replace(/^[a-záéíóú]+\.?,?\s+(?=\d)/i,''),m,y,mo,d;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))){y=+m[1];mo=+m[2];d=+m[3];}
  else if((m=s.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2}|\d{4}))?$/))){d=+m[1];mo=+m[2];y=m[3]?(m[3].length===2?2000+(+m[3]):+m[3]):new Date().getFullYear();}
  else return null;
  var f=new Date(y,mo-1,d);
  return (f.getFullYear()===y&&f.getMonth()===mo-1&&f.getDate()===d)?gesIso(f):null;
}
function gesHorarioDe(x){
  var s=_padNorm(x).replace(/\s+/g,' ');
  var hm=function(h,m){h=+h;m=m==null?0:+m;return (h<24&&m<60)?gesP2(h)+':'+gesP2(m):null;};
  var m=s.match(/^(?:de )?(\d{1,2})(?:[:.](\d{2}))? ?(?:hs?\.?)? ?(?:-|–|a|al|hasta) ?(\d{1,2})(?:[:.](\d{2}))? ?(?:hs?\.?)?$/);
  if(m){var a=hm(m[1],m[2]),b=hm(m[3],m[4]);return (a&&b&&b>a)?[a,b]:null;}
  m=s.match(/^(?:desde (?:las )?)?(\d{1,2})(?:([:.])(\d{2}))? ?(hs?\.?)?$/);
  if(m&&(m[2]||m[4])){var c=hm(m[1],m[3]);return c?[c,null]:null;}
  return null;
}
function gesTipoDe(x){
  var s=_padNorm(x);
  if(s==='posicion comercial'||s==='posicion')return 'posicion';
  if(s==='accion')return 'accion';
  if(s==='feria')return 'feria';
  return null;
}
// El nombre tal cual, o palabras que sólo coinciden con un hunter ("Sofía").
function gesHunterDe(x,ids){
  var ps=GES.personas||{},n=_padNorm(x);if(!n)return null;
  var ex=ids.filter(function(id){return _padNorm(ps[id].nombre)===n;});if(ex.length===1)return ex[0];
  var pal=n.split(' ').filter(function(w){return w.length>=3;});if(!pal.length)return null;
  var c=ids.filter(function(id){var t=' '+_padNorm(ps[id].nombre)+' ';return pal.every(function(w){return t.indexOf(' '+w+' ')>=0;});});
  return c.length===1?c[0]:null;
}
function gesAgPasteParse(t){
  var ids=gesHunters(true);
  return String(t||'').split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean).map(function(l){
    var c=l.split(/\t|;|\s{2,}/).map(function(x){return x.trim();}).filter(Boolean);
    if(/empresa/i.test(l)&&/fecha|d[ií]a|hunter/i.test(l))return null; // fila de títulos
    var r={fecha:null,hora_desde:null,hora_hasta:null,hunter_id:null,tipo:'posicion',empresaTxt:'',lugar:null,ok:true,motivo:'',aviso:''},resto=[];
    c.forEach(function(x){
      if(!r.fecha){var f=gesFechaDe(x);if(f){r.fecha=f;return;}}
      if(!r.hora_desde){var h=gesHorarioDe(x);if(h){r.hora_desde=h[0];r.hora_hasta=h[1];return;}}
      var tp=gesTipoDe(x);if(tp){r.tipo=tp;return;}
      if(!r.hunter_id){var hid=gesHunterDe(x,ids);if(hid){r.hunter_id=hid;return;}}
      resto.push(x);
    });
    r.empresaTxt=resto[0]||'';r.lugar=resto[1]?resto[1].slice(0,200):null;
    if(!r.fecha){r.ok=false;r.motivo='sin fecha';}
    else if(!r.empresaTxt){r.ok=false;r.motivo='sin empresa';}
    else if(!r.hunter_id){r.ok=false;r.motivo='no se reconoce el hunter';}
    return r;
  }).filter(Boolean);
}
function gesAgPegar(){
  gesPersonas().then(function(){
    GES._agPaste=[];
    gesModal('<h3 class="ges-mt">Pegar la agenda desde Excel</h3>'+
      '<p class="ges-ms">Una fila por posición, con las columnas en cualquier orden: <b>fecha</b> (21/10), <b>horario</b> (10 a 12), <b>empresa</b>, <b>hunter</b> y, si querés, el <b>lugar</b>. Quedan planificadas como posición comercial (salvo que la fila diga Acción o Feria).</p>'+
      '<textarea class="ges-inp ges-ag-ta" id="ga-paste" rows="6" oninput="gesAgPasteEsperar()" placeholder="21/10&#9;10 a 12&#9;ACME SA&#9;Sofía&#9;Piso 3"></textarea>'+
      '<div id="ga-prev" class="ges-ag-prev"></div>'+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ga-ok" onclick="gesAgPasteOk()" disabled>Agregar a la agenda</button></div>',true);
  });
}
function gesAgPasteEsperar(){clearTimeout(GES._agPasteT);GES._agPasteTurno=(GES._agPasteTurno||0)+1;var b=document.getElementById('ga-ok');if(b)b.disabled=true;GES._agPasteT=setTimeout(gesAgPasteRevisar,400);}
// Busca cada empresa en la base (y su oficial) y las superposiciones, con lo
// ya agendado y entre las filas pegadas.
function gesAgPasteRevisar(){
  var ta=document.getElementById('ga-paste'),host=document.getElementById('ga-prev');if(!ta||!host)return;
  var rows=gesAgPasteParse(ta.value),t=GES._agPasteTurno=(GES._agPasteTurno||0)+1;
  GES._agPaste=rows;
  if(!rows.length){host.innerHTML='';gesAgPasteBoton();return;}
  host.innerHTML='<span class="ges-mini">Revisando&hellip;</span>';
  var nombres={};rows.forEach(function(r){if(r.ok)nombres[_padNorm(r.empresaTxt)]=r.empresaTxt;});
  Promise.all(Object.keys(nombres).map(function(k){
    return _sb.rpc('gestiones_empresas',{p_q:nombres[k],p_limit:20}).then(function(res){
      return [k,((res&&res.data)||[]).filter(function(e){return _padNorm(e.empresa)===k;})];
    });
  })).then(function(par){
    if(t!==GES._agPasteTurno)return;
    var m={};par.forEach(function(p){m[p[0]]=p[1];});
    rows.forEach(function(r){
      if(!r.ok)return;
      var c=m[_padNorm(r.empresaTxt)]||[],mias=c.filter(function(e){return e.dueno_id===gesYo();});
      if(!c.length){r.ok=false;r.motivo='la empresa no está en la base';return;}
      var e=c.length===1?c[0]:(mias.length?mias[0]:null);
      if(!e){r.ok=false;r.motivo='la tienen '+c.length+' oficiales: cargala de a una';return;}
      r.empresa=e.empresa;r.dueno_id=e.dueno_id;
    });
    var pares={};rows.forEach(function(r){if(r.ok&&r.hora_desde)pares[r.hunter_id+'|'+r.fecha]=1;});
    return Promise.all(Object.keys(pares).map(function(k){
      var p=k.split('|');
      return _sb.rpc('gestiones_ocupado',{p_hunter:p[0],p_fecha:p[1]}).then(function(res){return [k,(res&&res.data)||[]];},function(){return [k,[]];});
    })).then(function(oc){
      if(t!==GES._agPasteTurno)return;
      var om={};oc.forEach(function(p){om[p[0]]=p[1];});
      rows.forEach(function(r,i){
        if(!r.ok||!r.hora_desde)return;
        var ch=(om[r.hunter_id+'|'+r.fecha]||[]).filter(function(x){return gesSePisan(x,r);}).map(gesOcupTxt);
        rows.forEach(function(o,j){if(j<i&&o.ok&&o.hunter_id===r.hunter_id&&o.fecha===r.fecha&&gesSePisan(o,r))ch.push(gesHorario(o)+' en '+o.empresa+' (de esta lista)');});
        if(ch.length)r.aviso='se pisa con '+ch.join(', ');
      });
      gesAgPastePintar();
    });
  }).catch(function(e){if(t===GES._agPasteTurno)host.innerHTML='<span class="ges-mini">No se pudo revisar: '+gesE((e&&e.message)||e)+'</span>';});
}
function gesAgPasteBoton(){
  var ok=(GES._agPaste||[]).filter(function(r){return r.ok&&r.dueno_id;}).length,b=document.getElementById('ga-ok');
  if(b){b.disabled=!ok;b.textContent=ok?'Agregar '+ok+' a la agenda':'Agregar a la agenda';}
}
function gesAgPastePintar(){
  var host=document.getElementById('ga-prev');if(!host)return;
  var rows=GES._agPaste||[],ok=rows.filter(function(r){return r.ok;}),mal=rows.filter(function(r){return !r.ok;}),pis=ok.filter(function(r){return r.aviso;});
  host.innerHTML='<div class="ges-paste-res"><span class="ges-chip ges-c-ok">'+ok.length+' listas</span>'+
      (pis.length?'<span class="ges-chip ges-c-warn">'+pis.length+' se pisan con otra (se agregan igual)</span>':'')+
      (mal.length?'<span class="ges-chip ges-c-bad">'+mal.length+' con problemas (no se agregan)</span>':'')+'</div>'+
    '<div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Fecha</th><th>Horario</th><th>Empresa</th><th>Hunter</th><th>Lugar</th><th></th></tr></thead><tbody>'+
    rows.slice(0,60).map(function(r){
      return '<tr><td class="ges-num">'+(r.fecha?gesE(gesFecha(r.fecha)):'—')+'</td><td class="ges-num">'+gesE(gesHorario(r)||'—')+'</td>'+
        '<td>'+gesE(r.empresa||r.empresaTxt||'—')+'</td><td>'+(r.hunter_id?gesE(gesNom(r.hunter_id)):'—')+'</td><td>'+gesE(r.lugar||'')+'</td>'+
        '<td>'+(!r.ok?'<span class="ges-chip ges-c-bad">'+gesE(r.motivo)+'</span>':r.aviso?'<span class="ges-chip ges-c-warn">'+gesE(r.aviso)+'</span>':'<span class="ges-chip ges-c-ok">Lista</span>')+'</td></tr>';
    }).join('')+'</tbody></table></div>'+(rows.length>60?'<p class="ges-nota">Se muestran las primeras 60 de '+rows.length+'.</p>':'');
  gesAgPasteBoton();
}
function gesAgPasteOk(){
  var ok=(GES._agPaste||[]).filter(function(r){return r.ok&&r.dueno_id;});if(!ok.length)return;
  var b=document.getElementById('ga-ok');if(b){b.disabled=true;b.textContent='Agregando…';}
  var filas=ok.map(function(r){return {empresa:r.empresa,dueno_id:r.dueno_id,hunter_id:r.hunter_id,origen:'derivada',tipo:r.tipo,modalidad:'presencial',frecuencia:'unica',
    fecha:r.fecha,hora_desde:r.hora_desde,hora_hasta:r.hora_hasta,lugar:r.lugar,estado:'planificada'};});
  _sb.from('gestiones').insert(filas).select('id').then(function(res){
    if(res&&res.error){gesAgPasteBoton();showToast('No se pudo agregar: '+res.error.message);return;}
    var n=(res.data||[]).length,primera=ok.map(function(r){return r.fecha;}).sort()[0];
    gesCerrar();GES.lista=null;GES.ag.data=null;GES.ag.lunes=gesLunes(primera);GES.ag.dia=primera;GES.tab='agenda';GES.det=null;gesRender();
    showToast(n+(n===1?' posición agregada':' posiciones agregadas')+' a la agenda.');
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
  var args={p_desde:gesDesde(f.per),p_hasta:null,p_tipo:f.tipo||null,p_hunter:f.hun||null,p_dueno:f.due||null,p_prueba:gesPuedePrueba()&&!!f.prueba,p_solo_mio:gesSoloMio()};
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
    '<label><span class="ges-lbl">Tipo</span><select class="ges-inp ges-sel" onchange="GES.f.tipo=this.value;gesTablero()">'+opt('t',[['accion','Acciones'],['feria','Ferias'],['posicion','Posiciones comerciales']],f.tipo,'Todos')+'</select></label>'+
    (gesRol()!=='hunter'?'<label><span class="ges-lbl">Hunter</span><select class="ges-inp ges-sel" onchange="GES.f.hun=this.value;gesTablero()">'+opt('h',huns,f.hun,'Todos')+'</select></label>':'')+
    '<label><span class="ges-lbl">Oficial que cede</span><select class="ges-inp ges-sel" onchange="GES.f.due=this.value;gesTablero()">'+opt('d',dues,f.due,'Todos')+'</select></label>'+
    (gesPuedePrueba()?'<label class="ges-check"><input type="checkbox"'+(f.prueba?' checked':'')+' onchange="GES.f.prueba=this.checked;gesTablero()"> Incluir pruebas</label>':'')+
    '<button type="button" class="btn bg ges-xls" onclick="gesExcel()">Descargar Excel</button>'+
  '</div>';
  var vis=+k.visitas||0,asis=+k.asistentes||0,pros=+k.prospectos||0,alt=+k.altas||0;
  var kpis='<div class="ges-kpis">'+gesKpi('Acciones',gesN(vis),(+k.planificadas?gesN(k.planificadas)+' planificadas':'realizadas'))+
    gesKpi('Empresas',gesN(k.empresas),'distintas')+gesKpi('Asistentes',gesN(asis),'contactados')+
    gesKpi('Prospectos',gesN(pros),asis?gesPct(pros,asis)+' de los asistentes':'')+
    gesKpi('Altas',gesN(alt),'sueldos en Galicia')+gesKpi('Conversión',gesPct(alt,pros),'altas ÷ prospectos',true)+'</div>';
  if(!vis&&!(+k.planificadas)){
    gesBody(filtros+kpis+'<div class="ges-vacio">No hay gestiones en este período. Probá con un período más largo'+(gesPuedePrueba()&&!f.prueba?' o tildá &laquo;Incluir pruebas&raquo;':'')+'.</div>');
    return;
  }
  var rankH=gesRank(gesRol()==='hunter'?'Por hunter':'Hunters',t.por_hunter||[],function(x){return gesNom(x.id);},true);
  var rankD=gesRank('Oficiales que ceden acciones',t.por_dueno||[],function(x){return gesNom(x.id);});
  var rankE=gesRankEmp(t.por_empresa||[]);
  gesBody(filtros+kpis+
    '<div class="ges-g2"><section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">Evolución mensual</span>'+
      '<span class="ges-leg"><span><i class="l1"></i>Prospectos</span><span><i class="l2"></i>Altas</span></span></div>'+gesChartMeses(t.por_mes||[])+'</section>'+
    '<section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">Embudo</span></div>'+gesEmbudo(asis,pros,alt)+
      '<div class="ges-ch" style="margin-top:16px"><span class="ges-ct">Altas por paquete</span></div>'+gesPaquetes(t.por_paquete||[])+'</section></div>'+
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
function gesPaquetes(rows){
  var ks=Object.keys(GES_PAQ),t={},sin=0;ks.forEach(function(k){t[k]=0;});
  rows.forEach(function(r){if(GES_PAQ[r.paquete])t[r.paquete]+=+r.altas;else sin+=+r.altas;});
  var vs=ks.map(function(k){return t[k];}),tot=vs.reduce(function(s,v){return s+v;},0)+sin,mx=Math.max.apply(null,vs.concat([1]));
  return '<div class="ges-fun">'+ks.map(function(k){
    var v=t[k];
    return '<div class="ges-fun-r"><span class="ges-mini">'+GES_PAQ[k]+'</span><div class="ges-bar"><i style="width:'+Math.round(v*100/mx)+'%"></i></div><span class="ges-fun-p">'+v+' &middot; '+gesPct(v,tot)+'</span></div>';
  }).join('')+(sin?'<div class="ges-mini">'+sin+' alta'+(sin>1?'s':'')+' sin paquete cargado</div>':'')+'</div>';
}
// "2 Plus · 1 Plus Gold": las altas de un hunter según el paquete que captó.
function gesPaqTxt(m){
  m=m||{};
  return Object.keys(GES_PAQ).filter(function(k){return +m[k];}).map(function(k){return (+m[k])+' '+GES_PAQ[k];}).join(' &middot; ');
}
function gesRank(tit,rows,nom,conPaq){
  rows=rows.filter(function(x){return x.id;}).slice().sort(function(a,b){return b.altas-a.altas||b.visitas-a.visitas;});
  var mx=Math.max.apply(null,rows.map(function(r){return +r.altas;}).concat([1]));
  return '<section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">'+tit+'</span></div><div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Nombre</th><th class="r">Acciones</th><th class="r">Altas</th><th>Conv.</th></tr></thead><tbody>'+
    (rows.length?rows.slice(0,12).map(function(r){return '<tr><td>'+gesE(nom(r))+(conPaq&&gesPaqTxt(r.paquetes)?'<div class="ges-mini">'+gesPaqTxt(r.paquetes)+'</div>':'')+'</td><td class="r">'+r.visitas+'</td><td class="r"><b>'+r.altas+'</b></td>'+
      '<td><div class="ges-hb"><div class="ges-bar"><i style="width:'+Math.round(r.altas*100/mx)+'%"></i></div><span>'+gesPct(r.altas,r.prospectos)+'</span></div></td></tr>';}).join(''):
      '<tr><td colspan="4" class="ges-mini">Sin datos.</td></tr>')+'</tbody></table></div></section>';
}
function gesRankEmp(rows){
  return '<section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">Empresas con más altas</span></div><div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Empresa</th><th class="r">Acciones</th><th class="r">Altas</th><th class="r">Conv.</th></tr></thead><tbody>'+
    (rows.length?rows.slice(0,10).map(function(r){return '<tr><td>'+gesE(r.empresa)+'<div class="ges-mini">'+gesE(gesNom(r.dueno))+'</div></td><td class="r">'+r.visitas+'</td><td class="r"><b>'+r.altas+'</b></td><td class="r">'+gesPct(r.altas,r.prospectos)+'</td></tr>';}).join(''):
      '<tr><td colspan="4" class="ges-mini">Sin datos.</td></tr>')+'</tbody></table></div></section>';
}
function gesPorTipo(rows){
  var orden=['posicion|presencial','posicion|virtual','accion|presencial','accion|virtual','feria|presencial','feria|virtual'];
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
      ['Acciones realizadas',+k.visitas||0],['Planificadas',+k.planificadas||0],['Empresas',+k.empresas||0],['Asistentes',+k.asistentes||0],
      ['Prospectos',+k.prospectos||0],['Altas',+k.altas||0],['Conversión',(+k.prospectos?(+k.altas/+k.prospectos):0)],[],['Altas por paquete']];
    var porPaq={},sinPaq=0;(t.por_paquete||[]).forEach(function(r){if(GES_PAQ[r.paquete])porPaq[r.paquete]=+r.altas;else sinPaq+=+r.altas;});
    Object.keys(GES_PAQ).forEach(function(p){resu.push([GES_PAQ[p],porPaq[p]||0]);});
    if(sinPaq)resu.push(['Sin paquete cargado',sinPaq]);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(resu),'Resumen');
    var rk=function(rows,conPaq){return rows.filter(function(x){return x.id;}).map(function(x){
      var o={Nombre:gesNom(x.id),Acciones:x.visitas,Prospectos:x.prospectos,Altas:x.altas,'Conversión':x.prospectos?x.altas/x.prospectos:0};
      if(conPaq)Object.keys(GES_PAQ).forEach(function(p){o[GES_PAQ[p]]=+((x.paquetes||{})[p])||0;});
      return o;});};
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rk(t.por_hunter||[],true)),'Por hunter');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rk(t.por_dueno||[])),'Por oficial');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((t.por_empresa||[]).map(function(x){return {Empresa:x.empresa,Oficial:gesNom(x.dueno),Acciones:x.visitas,Prospectos:x.prospectos,Altas:x.altas};})),'Por empresa');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(l.map(function(g){return {
      Fecha:g.fecha,Horario:gesHorario(g),Empresa:g.empresa,Lugar:g.lugar||'',Tipo:GES_TIPO[g.tipo],Modalidad:GES_MOD[g.modalidad],'Se repite':gesRepTxt(g),Estado:GES_EST[g.estado],
      Hunter:gesNom(g.hunter_id),'Oficial (cede)':gesNom(g.dueno_id),Origen:g.origen==='derivada'?'Derivada':'Propia',
      'Dotación':g.dotacion,Asistentes:g.asistentes,Prospectos:+g.n_pros||0,Altas:+g.n_altas||0,Nota:g.nota||'',Prueba:g.prueba?'Sí':''};})),'Gestiones');
    XLSX.writeFile(wb,'Gestiones_'+gesHoy()+'.xlsx');
  }).catch(function(e){showToast('No se pudo armar el Excel: '+((e&&e.message)||e));});
}
