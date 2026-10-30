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
// Versión 2 (migración 045): CUIT, Base de datos, conversación e historial, "No puedo ir", bandeja del líder.
var GES_CSS_3=".ges-form [hidden],.ges-band [hidden]{display:none !important;}\n.ges-cuit{font-size:.75rem;color:var(--gray);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;}\n.ges-chips{display:flex;gap:6px;flex-wrap:wrap;}\n.ges-add{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) auto;}\n@media (max-width:640px){.ges-add{grid-template-columns:1fr 1fr;}}\n.ges-elegir{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin:12px 0;}\n.ges-elegir .btn{justify-content:center;text-align:center;}\n.ges-libres{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;}\n.ges-libres button{border:1px solid var(--ges-ok);background:var(--ges-ok-soft);color:var(--ges-ok);border-radius:14px;padding:4px 10px;font-size:.75rem;font-weight:800;cursor:pointer;font-family:inherit;}\n.ges-prox{margin-top:4px;padding:3px 5px;font-weight:600;}\n.ges-prox.vencido{border-color:var(--danger);color:var(--danger);}\n.ges-motivo{font-size:.75rem;color:var(--gray);margin-top:2px;}\n.ges-tel{color:var(--ink);text-decoration:none;border-bottom:1px dotted var(--gray);}\n.ges-chat{margin-top:14px;}\n.ges-msgs{display:flex;flex-direction:column;gap:8px;max-height:340px;overflow:auto;margin-bottom:10px;padding:2px;}\n.ges-msg{max-width:78%;background:var(--ges-info-soft);color:var(--ink);border-radius:12px 12px 12px 4px;padding:8px 11px;font-size:.8rem;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;}\n.ges-msg.mio{align-self:flex-end;background:var(--accent-soft);border-radius:12px 12px 4px 12px;}\n.ges-msg.np{background:var(--ges-warn-soft);border:1px solid var(--ges-warn);}\n.ges-msg-q{display:block;font-size:.75rem;font-weight:800;color:var(--gray);margin-bottom:2px;white-space:normal;}\n.ges-msg-new{display:flex;gap:8px;align-items:flex-end;}\n.ges-msg-new textarea{flex:1;resize:vertical;}\n.ges-hist{margin-top:12px;font-size:.78rem;color:var(--ink);}\n.ges-hist summary{cursor:pointer;font-weight:800;font-size:.8rem;}\n.ges-hist ol{list-style:none;margin:8px 0 0;padding:0 0 0 10px;border-left:2px solid var(--border);display:flex;flex-direction:column;gap:6px;}\n.ges-hist li{line-height:1.45;}\n.ges-bands{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:12px;}\n.ges-band{background:var(--card);border:1px solid var(--border);border-radius:var(--r-m,12px);padding:10px 12px;box-shadow:var(--sh-1);}\n.ges-band.warn{border-color:var(--ges-warn);background:var(--ges-warn-soft);}\n.ges-band.info{border-color:var(--accent-line);}\n.ges-band h4{margin:0 0 6px;font-size:.75rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--gray);}\n.ges-band-l{display:flex;flex-direction:column;gap:5px;}\n.ges-band-i{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;border:1px solid var(--border);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 9px;font-size:.76rem;cursor:pointer;font-family:inherit;line-height:1.35;}\n.ges-band-i:hover{border-color:var(--accent-line);}\n.ges-band-i b{font-weight:800;}\n.ges-band-i .ges-mini{display:block;}\n.ges-ag-b.nopuede{border-left-color:var(--ges-warn);background:var(--ges-warn-soft);}";
// Agenda compartida (grilla del oficial), vista mensual y "Para contactar".
var GES_CSS_4=".ges-band-mas{align-self:flex-start;border:0;background:none;color:var(--accent);font-size:.78rem;font-weight:800;cursor:pointer;font-family:inherit;padding:4px 2px;text-decoration:underline;}\n.ges-contactar{max-height:60vh;overflow:auto;padding:2px;}\n.ges-grupo{display:flex;align-items:baseline;gap:8px;margin:12px 0 6px;font-size:.8rem;font-weight:800;}\n.ges-grupo:first-child{margin-top:4px;}\n.ges-grupo .ges-mini{font-weight:600;}\n.ges-foco td{background:var(--accent-soft);}\n.ges-foco td:first-child{box-shadow:inset 3px 0 0 var(--accent);}\n"+
".ges-ag-ocup{display:flex;flex-direction:column;gap:1px;width:100%;text-align:left;border:1px dashed var(--border);background:var(--bg-soft,transparent);color:var(--gray);border-radius:8px;padding:5px 7px;font-size:.75rem;line-height:1.3;}\n.ges-ag-ocup .ges-ag-h{font-weight:800;}\n"+
".ges-ag-ver{display:flex;gap:0;border:1px solid var(--border);border-radius:999px;overflow:hidden;}\n.ges-ag-ver button{border:0;background:var(--card);color:var(--gray);font-family:inherit;font-size:.78rem;font-weight:800;padding:5px 13px;cursor:pointer;}\n.ges-ag-ver button[aria-pressed=true]{background:var(--accent);color:#fff;}\n"+
".ges-rojo{color:var(--danger);}\n.ges-auto-w{border-color:var(--ges-warn);background:var(--ges-warn-soft);}\n"+
".ges-hor{padding:10px;overflow-x:auto;}\n.ges-hin{width:max-content;min-width:100%;}\n.ges-hhead{display:grid;grid-template-columns:58px repeat(var(--n,6),minmax(96px,1fr));gap:2px;}\n.ges-hth{text-align:center;font-size:.75rem;font-weight:700;color:var(--gray);padding:4px 2px;border-radius:8px;}\n.ges-hth b{display:block;font-size:.95rem;color:var(--ink);}\n.ges-hth.hoy,.ges-hth.sel{background:var(--accent-soft);}\n.ges-hth.hoy b,.ges-hth.sel b{color:var(--accent-2,var(--accent));}\n.ges-hsins{margin-top:2px;}\n.ges-hsin{display:flex;flex-direction:column;gap:2px;min-height:4px;}\n.ges-hbody{display:grid;grid-template-columns:58px 1fr;gap:2px;margin-top:2px;}\n.ges-hhoras{display:flex;flex-direction:column;}\n.ges-hhora{position:relative;border-top:1px solid var(--border);}\n.ges-hhora span{position:absolute;top:-8px;right:6px;font-size:.75rem;color:var(--gray);background:var(--card);padding:0 2px;}\n.ges-hcols{display:grid;grid-template-columns:repeat(var(--n,6),minmax(96px,1fr));gap:2px;}\n.ges-hcol{position:relative;border-left:1px solid var(--border);background:repeating-linear-gradient(to bottom,transparent 0,transparent 45px,var(--border) 45px,var(--border) 46px);border-radius:6px;}\n.ges-hcol.clicable{cursor:copy;}\n.ges-hcol.clicable:hover{background-color:var(--accent-soft);}\n.ges-hb{position:absolute;display:flex;flex-direction:column;gap:1px;overflow:hidden;border:0;border-left:3px solid var(--ges-info);background:var(--ges-info-soft);color:var(--ink);border-radius:6px;padding:3px 5px;font-size:.75rem;line-height:1.25;text-align:left;font-family:inherit;cursor:pointer;}\n.ges-hb.est-realizada{border-left-color:var(--ges-ok);background:var(--ges-ok-soft);}\n.ges-hb.est-cancelada{border-left-color:var(--border);background:var(--light);color:var(--gray);text-decoration:line-through;}\n.ges-hb.nopuede{border-left-color:var(--ges-warn);background:var(--ges-warn-soft);}\n.ges-hb.tapado{border-left-color:var(--danger);background:var(--danger-soft,rgba(211,47,47,.12));color:var(--danger);cursor:default;}\n.ges-hb-h{font-weight:800;font-variant-numeric:tabular-nums;}\n.ges-hb-e{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n"+
".ges-hpanel{margin-top:10px;}\n.ges-hpanel[hidden]{display:none;}\n.ges-hpanel-t{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px;font-size:.8rem;}\n.ges-hor-mini{padding:6px;border:1px solid var(--border);border-radius:var(--r-m,12px);max-height:340px;overflow:auto;}\n.ges-hor-mini .ges-hhead{grid-template-columns:44px repeat(var(--n,6),minmax(64px,1fr));}\n.ges-hor-mini .ges-hbody{grid-template-columns:44px 1fr;}\n.ges-hor-mini .ges-hcols{grid-template-columns:repeat(var(--n,6),minmax(64px,1fr));}\n.ges-hor-mini .ges-hb{font-size:.75rem;}\n"+
".ges-eqh{border-collapse:collapse;width:100%;font-size:.75rem;color:var(--ink);}\n.ges-eqh th{text-align:center;font-size:.75rem;letter-spacing:.02em;color:var(--gray);font-weight:800;padding:6px 4px;border-bottom:1px solid var(--border);white-space:nowrap;}\n.ges-eqh th.nom{text-align:left;min-width:150px;}\n.ges-eqh td{border-bottom:1px solid var(--border);border-left:1px solid var(--border);padding:0;text-align:center;min-width:64px;height:38px;}\n.ges-eqh td.nom{border-left:0;text-align:left;padding:6px 8px;font-weight:800;font-size:.8rem;}\n.ges-eqh tr:last-child td{border-bottom:0;}\n.ges-eqh td.libre button{width:100%;height:100%;min-height:36px;border:0;background:none;color:var(--ges-ok);font-size:.75rem;font-weight:700;font-family:inherit;cursor:pointer;}\n.ges-eqh td.libre button:hover{background:var(--ges-ok-soft);}\n.ges-eqh td.ocupado{background:var(--ges-info-soft);}\n.ges-eqh td.ocupado button{width:100%;height:100%;min-height:36px;border:0;background:none;color:var(--ink);font-size:.75rem;font-weight:700;font-family:inherit;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;}\n.ges-eqh td.tapado{background:var(--danger-soft,rgba(211,47,47,.12));color:var(--danger);font-weight:800;}\n"+
".ges-mes{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;}\n.ges-mes-h{font-size:.75rem;font-weight:800;color:var(--gray);text-transform:uppercase;letter-spacing:.04em;text-align:center;padding:2px 0;}\n.ges-mes-d{min-height:86px;border:1px solid var(--border);border-radius:10px;background:var(--card);padding:4px;display:flex;flex-direction:column;gap:3px;}\n.ges-mes-d.otro{opacity:.45;}\n.ges-mes-d.hoy{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent);}\n.ges-mes-n{font-size:.75rem;font-weight:800;color:var(--gray);}\n.ges-mes-d.hoy .ges-mes-n{color:var(--accent);}\n@media (max-width:700px){.ges-mes{grid-template-columns:repeat(7,minmax(42px,1fr));overflow-x:auto;}.ges-mes-d{min-height:64px;}}\n";
(function(){if(document.getElementById('ges-css'))return;var st=document.createElement('style');st.id='ges-css';st.textContent=GES_CSS+'\n'+GES_CSS_2+'\n'+GES_CSS_3+'\n'+GES_CSS_4;document.head.appendChild(st);})();

// A los hunters se los mide por el paquete que capta cada alta (no por la renta).
// La base guarda la clave (columna paquete, migración 027); el orden es el de la pantalla.
// "Caja de Ahorro" es el alta sin paquete: así se separan con paquete / sin paquete.
var GES_PAQ={caja:'Sin paquete (Caja de Ahorro)',plus:'Plus',gold:'Plus Gold',platinum:'Eminent Platinum',black:'Eminent Black'};
var GES_PAQ_CORTO={caja:'Sin paquete',plus:'Plus',gold:'Plus Gold',platinum:'Eminent Platinum',black:'Eminent Black'};
var GES_TIPO={accion:'Acción',feria:'Feria',posicion:'Posición comercial',datos:'Base de datos'};
var GES_MOD={presencial:'Presencial',virtual:'Virtual'};
var GES_FREC={unica:'Única',repite:'Se repite'};
var GES_VECES_MAX=24; // tope al crear una serie de una vez (la base admite hasta 52)
var GES_EST={planificada:'Planificada',realizada:'Realizada',cancelada:'Cancelada'};
var GES_EST_DATOS={planificada:'En curso',realizada:'Terminada',cancelada:'Cancelada'};
var GES_PEST={a_contactar:'A contactar',prospecto:'Prospecto',en_gestion:'En gestión',alta:'Alta',descartado:'Descartado'};
var GES_ABIERTO={a_contactar:1,prospecto:1,en_gestion:1}; // estados en los que se agenda un próximo contacto
var GES_MOTIVO={ya_galicia:'Ya cobra en Galicia',no_interesa:'No le interesa',no_contesta:'No contesta',no_califica:'No califica',otro:'Otro motivo'};
var GES_DATOS_MAX=1000; // personas por base de datos
var GES_MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

var GES={verTodo:(function(){try{return localStorage.getItem('fg_ges_vertodo')==='1';}catch(e){return false;}})(),tab:null,lista:null,listaP:null,personas:null,perP:null,det:null,detG:null,detPros:[],
  q:'',fEst:'',empresas:null,qEmp:'',tab0:null,
  f:{per:'90',tipo:'',hun:'',due:'',prueba:true},tablero:null,
  // ver: null = todavía no eligió, y se decide por perfil al abrir la agenda
  // (el líder arranca viendo a todo su equipo; el resto, la semana).
  ag:{lunes:null,mes:null,ver:(function(){try{var v=localStorage.getItem('fg_ges_agver');return (v==='mes'||v==='sem'||v==='equipo')?v:null;}catch(e){return null;}})(),
      dia:null,data:null,dataL:null,ocup:null,hun:''}};

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
// ¿Es un hunter de mi equipo? (el líder lo ve en lider_id de cada persona)
function gesDeMiEquipo(h){var p=GES.personas&&GES.personas[h];return !!(h&&p&&p.lider_id&&p.lider_id===gesYo());}
// Guardar aunque el horario se pise: sólo el admin o el líder de ese hunter (lo frena la base).
function gesPuedeForzar(h){return gesEsAdmin()||(gesRol()==='lider'&&gesDeMiEquipo(h));}
// Cambiar el hunter: admin, el oficial que la derivó (mientras no esté realizada)
// y el líder (el que la reparte o el del hunter). El hunter nunca.
function gesPuedeReasignar(g){
  if(!g)return false;
  if(gesEsAdmin())return true;
  if(g.estado==='realizada')return false;
  var y=gesYo();
  if(g.origen==='derivada'&&g.creada_por===y)return true;
  return gesRol()==='lider'&&(g.lider_id===y||gesDeMiEquipo(g.hunter_id));
}
function gesLideres(){
  var ps=GES.personas||{};
  return Object.keys(ps).filter(function(id){return ps[id].rol==='lider';}).sort(function(a,b){return ps[a].nombre.localeCompare(ps[b].nombre);});
}
// El oficial puede mandarla "al equipo" para que la asigne el líder.
function gesPuedeAlLider(){var r=gesRol();return r!=='hunter'&&r!=='lider'&&!gesEsAdmin()&&gesLideres().length>0;}
// Lo que la base frena con un código (045) se cuenta en castellano.
function gesErrTxt(e){
  var m=String((e&&e.message)||e||'');
  if(/GES_PISA/.test(m))return 'el horario se pisa con otra acción de ese hunter'+((m.match(/de (\d\d:\d\d a \d\d:\d\d)/)||[])[1]?' ('+m.match(/de (\d\d:\d\d a \d\d:\d\d)/)[1]+')':'')+'. Cambiá el horario o elegí otro hunter.';
  if(/GES_PAQ/.test(m))return 'elegí con qué paquete fue el alta.';
  if(/GES_MOT/.test(m))return 'elegí por qué se descarta.';
  return m;
}
// CUIT de la empresa: la base guarda los dígitos separados por coma ("30712345678,30709876543").
function gesCuitLista(c){return (Array.isArray(c)?c:String(c||'').split(/[,;\s]+/)).map(gesCuilLimpio).filter(Boolean);}
function gesCuitTxt(c){var l=gesCuitLista(c);return l.length?'CUIT '+l.map(gesCuilFmt).join(' · '):'';}
function gesCuitHtml(c){var t=gesCuitTxt(c);return t?'<span class="ges-cuit">'+gesE(t)+'</span>':'';}
// "CUIL o referencia" en un solo campo: un CUIL válido se guarda como CUIL; un
// número de 11 cifras que no es un CUIL válido se avisa; cualquier otra cosa
// (legajo, sector, DNI) queda como referencia.
function gesCuilORef(v){
  v=String(v||'').trim();if(!v)return {};
  var d=gesCuilLimpio(v);
  if(/^[\d\s.\-]+$/.test(v)&&d.length===11)return gesCuilOk(d)?{cuil:d}:{error:'Ese CUIL no es válido. Revisalo, o escribí otra cosa como referencia.'};
  return {referencia:v.slice(0,120)};
}
function gesCuilRefTxt(p){return p.cuil?gesCuilFmt(p.cuil):(p.referencia||'');}
// Teléfono o mail, con link para llamar o escribir desde el celular.
function gesContactoHtml(c){
  c=String(c||'').trim();if(!c)return '<span class="ges-mini">—</span>';
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))return '<a class="ges-tel" href="mailto:'+_escAttr(c)+'">'+gesE(c)+'</a>';
  var d=c.replace(/[^\d+]/g,'');
  if(d.replace(/\D/g,'').length>=6)return '<a class="ges-tel" href="tel:'+_escAttr(d)+'">'+gesE(c)+'</a>';
  return gesE(c);
}

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
  if(/^(caja( de ahorros?)?|ca)$/.test(s)||/^sin paquete( caja( de ahorros?)?)?$/.test(s))return 'caja';
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
// Lecturas que pueden pasar de 1000 filas (una base de datos grande): de a 1000,
// porque Supabase corta ahí. fab(a,b) arma la consulta con .range(a,b).
function gesTodas(fab){
  var out=[];
  function pagina(a){return fab(a,a+999).then(function(r){
    if(r&&r.error)throw r.error;var l=(r&&r.data)||[];out=out.concat(l);return l.length===1000?pagina(a+1000):out;});}
  return pagina(0);
}
// Mensajes de otros sin leer, por gestión (de lo que participo). Si falla, ninguno.
function gesMsgNuevos(force){
  if(GES.msgN&&!force)return Promise.resolve(GES.msgN);
  return _sb.rpc('gestiones_mensajes_nuevos').then(function(r){
    var m={};((r&&!r.error&&r.data)||[]).forEach(function(x){m[x.gestion_id]=x;});GES.msgN=m;return m;
  },function(){GES.msgN={};return GES.msgN;});
}
function gesMsgDe(g){return (GES.msgN&&g&&GES.msgN[g.id])||null;}
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
  if(r==='hunter')return 'Tu agenda con día y horario, las bases de datos para contactar y lo que te derivaron. Después de cada acción cargá los prospectos y marcá las altas (con o sin paquete). Si algo no está claro, preguntá en la conversación de la acción.';
  if(r==='lider')return 'Cómo viene tu equipo: la agenda de cada hunter, lo que hay que asignar, quién pidió que se la pasen a otro, prospectos, altas y conversión.';
  return 'Lo que se hizo con tus empresas. Vos derivás (a un hunter, o al líder para que la reparta); la carga la hacen los hunters.';
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
  GES.msgN=null;
  var v=document.getElementById('view-gestiones');
  if(v&&v.style.display!=='none'&&!GES.det&&(GES.tab==='lista'||GES.tab==='agenda')){GES.lista=null;GES.ag.data=null;gesRender();}
}

// ── Chips ───────────────────────────────────────────────────────────────────
function gesChipEst(g){
  if(g.estado==='planificada'&&!g.hunter_id)return '<span class="ges-chip ges-c-warn">Por asignar'+(g.tipo==='datos'?'':' &middot; '+gesE(gesFecha(g.fecha)))+'</span>';
  if(g.tipo==='datos'){
    if(g.estado==='planificada')return '<span class="ges-chip ges-c-info">En curso'+(g.vence?' &middot; hasta el '+gesE(gesFecha(g.vence)):'')+'</span>';
    if(g.estado==='cancelada')return '<span class="ges-chip ges-c-bad">Cancelada</span>';
    return '<span class="ges-chip ges-c-ok">Terminada</span>';
  }
  if(g.estado==='planificada')return '<span class="ges-chip ges-c-info">Planificada &middot; '+gesE(gesFecha(g.fecha))+'</span>';
  if(g.estado==='cancelada')return '<span class="ges-chip ges-c-bad">Cancelada</span>';
  return '<span class="ges-chip ges-c-ok">Realizada</span>';
}
// Chips de lo que espera a alguien: pidió reasignación, mensajes sin leer.
function gesChipsExtra(g){
  var h='',m=gesMsgDe(g);
  if(g.no_puede_at&&g.estado==='planificada')h+='<span class="ges-chip ges-c-warn" title="'+_escAttr(g.no_puede_motivo||'')+'">'+(g.hunter_id===gesYo()?'Avisaste que no podés':'Pidió que se la pasen a otro')+'</span>';
  if(m)h+='<span class="ges-chip ges-c-info">'+(m.n===1?'1 mensaje nuevo':m.n+' mensajes nuevos')+'</span>';
  return h?'<span class="ges-chips">'+h+'</span>':'';
}
function gesNuevaHun(g){return g.hunter_id===gesYo()&&!g.visto_hunter;}
function gesNuevaDue(g){return g.dueno_id===gesYo()&&g.visto_dueno===false;}
function gesNueva(g){return gesNuevaHun(g)||gesNuevaDue(g);}
// Lo que pide atención va primero en la lista: novedades y mensajes sin leer.
function gesAtencion(g){return gesNueva(g)||!!gesMsgDe(g);}
function gesNuevaTxt(g){
  if(gesNuevaHun(g))return 'Nueva'+(g.nota?': '+gesE(g.nota):'');
  return 'Novedad: '+gesE(gesNom(g.hunter_id))+(g.origen==='derivada'?' la complet\u00f3':' registr\u00f3 esta acci\u00f3n');
}

// ── Lista ───────────────────────────────────────────────────────────────────
// Filtro de la lista: estado, "por asignar", "pidió reasignación" y texto
// (empresa, CUIT o persona).
function gesListaFiltrar(l){
  var q=_padNorm(GES.q),qd=gesCuilLimpio(GES.q),est=GES.fEst;
  var vis=l.filter(function(g){
    if(est==='por_asignar'){if(g.hunter_id||g.estado!=='planificada')return false;}
    else if(est==='no_puede'){if(!g.no_puede_at||g.estado!=='planificada')return false;}
    else if(est==='datos'){if(g.tipo!=='datos')return false;}
    else if(est&&g.estado!==est)return false;
    if(q&&_padNorm(g.empresa).indexOf(q)<0&&_padNorm(gesNom(g.hunter_id)).indexOf(q)<0&&_padNorm(gesNom(g.dueno_id)).indexOf(q)<0
       &&!(qd.length>=4&&gesCuitLista(g.cuit).some(function(c){return c.indexOf(qd)>=0;})))return false;
    return true;
  });
  // Lo que pide atención (novedades, mensajes sin leer), primero.
  vis.sort(function(a,b){return (gesAtencion(b)?1:0)-(gesAtencion(a)?1:0);});
  return vis;
}
function gesListaRender(){
  var pm=gesMsgNuevos(!GES.lista);
  Promise.all([gesLista(),pm]).then(function(res){
    var l=res[0],vis=gesListaFiltrar(l);
    var ests=[['','Todos los estados']].concat(Object.keys(GES_EST).map(function(k){return [k,GES_EST[k]];}),[['datos','Bases de datos']],
      gesRol()==='hunter'?[]:[['por_asignar','Por asignar'],['no_puede','Pidieron que se la pasen a otro']]);
    var tool='<div class="ges-tool">'+
      '<input type="search" class="ges-inp" id="ges-q" placeholder="Buscar empresa, CUIT o persona" value="'+_escAttr(GES.q)+'" oninput="GES.q=this.value;gesListaPintar()" autocomplete="off">'+
      '<select class="ges-inp ges-sel" id="ges-fest" onchange="GES.fEst=this.value;gesListaPintar()">'+
        ests.map(function(o){return '<option value="'+o[0]+'"'+(GES.fEst===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+
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
  var vis=gesListaFiltrar(GES.lista);
  host.innerHTML=vis.length?vis.slice(0,300).map(gesFila).join(''):'<div class="ges-vacio">Nada coincide con el filtro.</div>';
}
// "Hunter: Sofía" o "Hunter: por asignar (Laura)".
function gesHunterTxt(g){
  if(g.hunter_id)return gesE(gesNom(g.hunter_id));
  return '<b>por asignar</b>'+(g.lider_id?' ('+gesE(gesNom(g.lider_id))+')':'');
}
// Tipo, día y horario en una línea. Una base de datos no tiene horario: va desde / hasta.
function gesCuandoTxt(g){
  if(g.tipo==='datos')return GES_TIPO.datos+' &middot; desde el '+gesE(gesFecha(g.fecha))+(g.vence?' hasta el '+gesE(gesFecha(g.vence)):'');
  return GES_TIPO[g.tipo]+' '+(GES_MOD[g.modalidad]||'').toLowerCase()+' &middot; '+gesE(gesFecha(g.fecha))+(gesHorario(g)?' '+gesE(gesHorario(g)):'')+(g.lugar?' &middot; '+gesE(g.lugar):'')+
    (g.frecuencia==='repite'?' &middot; '+gesE(gesRepTxt(g)):'');
}
function gesFila(g){
  var r=gesRol(),quien;
  if(r==='hunter')quien=g.origen==='derivada'?'Te la derivó '+gesE(gesNom(g.creada_por)):'Empresa de '+gesE(gesNom(g.dueno_id));
  else quien='Hunter: '+gesHunterTxt(g)+' &middot; Oficial: '+gesE(gesNom(g.dueno_id));
  var nums='';
  if(g.tipo==='datos')nums='<span class="ges-row-n"><b>'+gesN(g.n_pros)+'</b> de '+gesN(g.n_datos)+' contactados &middot; <b class="ges-ok">'+gesN(g.n_altas)+'</b> '+(+g.n_altas===1?'alta':'altas')+'</span>';
  else if(g.estado==='realizada')nums='<span class="ges-row-n"><b>'+gesN(g.n_pros)+'</b> prospectos &middot; <b class="ges-ok">'+gesN(g.n_altas)+'</b> '+(+g.n_altas===1?'alta':'altas')+' &middot; '+gesPct(g.n_altas,g.n_pros)+'</span>';
  return '<button type="button" class="ges-row'+(gesAtencion(g)?' nueva':'')+'" onclick="gesAbrirDet(\''+g.id+'\')">'+
    '<span class="ges-row-t"><span class="ges-row-e">'+gesE(g.empresa)+' '+gesCuitHtml(g.cuit)+'</span>'+gesChipEst(g)+'</span>'+
    '<span class="ges-row-d">'+gesCuandoTxt(g)+' &middot; '+quien+
      (g.prueba?' &middot; <span class="ges-prueba">prueba</span>':'')+'</span>'+
    nums+gesChipsExtra(g)+
    (gesNueva(g)?'<span class="ges-row-nueva">'+gesNuevaTxt(g)+'</span>':'')+
  '</button>';
}

// ── Mis empresas (oficial) ──────────────────────────────────────────────────
function gesEmpresas(){
  var pEmp=GES.empresas?Promise.resolve(GES.empresas):
    _sb.from('padron_empresas').select('empresa,cuits').eq('user_id',gesYo()).order('empresa').then(function(r){
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
    GES._emps=emps.map(function(e){var k=_padNorm(e.empresa);return {empresa:e.empresa,cuits:gesCuitLista(e.cuits),k:k,s:st[k]||{v:0,p:0,a:0,plan:0}};});
    gesBody(kp+'<div class="ges-tool"><input type="search" class="ges-inp" placeholder="Buscar en tus empresas (nombre o CUIT)" value="'+_escAttr(GES.qEmp)+'" oninput="GES.qEmp=this.value;gesEmpPintar()" autocomplete="off"></div>'+
      '<div class="ges-card"><div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Empresa</th><th class="r">Acciones</th><th class="r">Prospectos</th><th class="r">Altas</th><th>Conversión</th><th>Último hunter</th><th></th></tr></thead>'+
      '<tbody id="ges-emp-tb"></tbody></table></div></div>');
    gesEmpPintar();
  }).catch(gesErr);
}
function gesEmpPintar(){
  var tb=document.getElementById('ges-emp-tb');if(!tb||!GES._emps)return;
  var q=_padNorm(GES.qEmp),qd=gesCuilLimpio(GES.qEmp);
  var vis=GES._emps.filter(function(e){return !q||e.k.indexOf(q)>=0||(qd.length>=4&&e.cuits.some(function(c){return c.indexOf(qd)>=0;}));}).slice(0,400);
  tb.innerHTML=vis.map(function(e,i){
    var s=e.s,c=s.p?s.a/s.p:0,idx=GES._emps.indexOf(e);
    return '<tr'+(s.nov?' class="ges-tr-nov"':'')+'><td><b>'+gesE(e.empresa)+'</b>'+(s.nov?' <span class="ges-nov" title="Hay novedades: abrilas en la solapa Gestiones">Novedad</span>':'')+
      (e.cuits.length?'<div>'+gesCuitHtml(e.cuits)+'</div>':'')+(s.plan?'<div class="ges-mini">'+s.plan+' planificada'+(s.plan>1?'s':'')+'</div>':'')+'</td>'+
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
function gesCerrar(){
  var o=document.getElementById('ges-ov');if(o)o.remove();document.removeEventListener('keydown',gesEsc,true);
  GES._ocupHun=null;GES._ocupExcl=null;
  var r=GES._elegirRes;GES._elegirRes=null;if(r)r(null); // una elección abierta se cancela
}
// Ventanita "elegí una opción" (paquete del alta, motivo del descarte). Promesa: la clave o null.
function gesElegir(titulo,sub,opts){
  return new Promise(function(res){
    gesModal('<h3 class="ges-mt">'+titulo+'</h3>'+(sub?'<p class="ges-ms">'+sub+'</p>':'')+
      '<div class="ges-elegir">'+Object.keys(opts).map(function(k){return '<button type="button" class="btn bg" onclick="gesElegido(\''+k+'\')">'+gesE(opts[k])+'</button>';}).join('')+'</div>'+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesElegido(null)">Cancelar</button></div>');
    GES._elegirRes=res; // después de abrir: gesModal cierra lo anterior
  });
}
function gesElegido(k){var r=GES._elegirRes;GES._elegirRes=null;gesCerrar();if(r)r(k);}
function gesPills(name,opts,val){
  return '<div class="ges-pills" data-name="'+name+'">'+Object.keys(opts).map(function(k){
    return '<button type="button" data-v="'+k+'" aria-pressed="'+(val===k)+'" onclick="gesPill(this)">'+opts[k]+'</button>';
  }).join('')+'</div>';
}
function gesPill(b){
  var p=b.parentNode;p.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
  if(p.getAttribute('data-name')==='tipo')gesTipoCambio(b.getAttribute('data-v')==='datos');
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
    if(p.origen==='derivada'){n.hunter_id=p.hunter_id;n.dueno_id=p.dueno_id;if(!p.hunter_id)n.lider_id=p.lider_id;}else n.dueno_id=p.dueno_id;
    filas.push(n);
  }
  // De a una: si una fecha choca con otra cosa del hunter, las demás igual se crean
  // y se avisa cuáles faltan. cb(cuántas se crearon, las que no).
  var hechas=0,fallas=[];
  (function sig(i){
    if(i>=filas.length){
      if(fallas.length)showToast('Se crearon '+(hechas+1)+' de '+(filas.length+1)+' fechas. No se pudo: '+fallas.map(function(f){return gesFecha(f.fecha)+' ('+f.motivo+')';}).join('; ')+'. Agregalas a mano desde la agenda.');
      cb(hechas,fallas);return;
    }
    var mal=function(e){fallas.push({fecha:filas[i].fecha,motivo:gesErrTxt(e)});sig(i+1);};
    _sb.from('gestiones').insert(filas[i]).select('id').single().then(function(r){
      if(r&&r.error){mal(r.error);return;}
      hechas++;sig(i+1);
    },mal);
  })(0);
}
// Serie sin fin: al completar una, ofrecer la siguiente.
function gesOfrecerProxima(g){
  if(!g||g.frecuencia!=='repite'||g.veces||!g.cada_dias||g.estado!=='realizada')return;
  var f=gesSumarDias(g.fecha,g.cada_dias);
  fgConfirm('¿Creamos la próxima para el '+gesFecha(f)+'?\nSe repite cada '+g.cada_dias+' días. Queda planificada, con los mismos datos.',{ok:'Crear la próxima',cancelar:'Ahora no',peligro:false})
    .then(function(ok){if(ok)gesRepetir(g);});
}
function gesInt(id){var v=gesVal(id).replace(/\D/g,'');return v===''?null:Math.min(1000000,parseInt(v,10));}

// Formulario común de registrar / derivar / asignar / agendar / editar.
// Base de datos (tipo 'datos'): sin horario, lugar, modalidad ni repetición;
// lleva "desde", "trabajarla hasta" y, al crearla, la lista de personas.
function gesTiposDe(modo,g){
  if(modo==='editar')return g.tipo==='datos'?{datos:GES_TIPO.datos}:{accion:GES_TIPO.accion,feria:GES_TIPO.feria,posicion:GES_TIPO.posicion};
  if(modo==='derivar'||modo==='asignar')return GES_TIPO;
  return {accion:GES_TIPO.accion,feria:GES_TIPO.feria,posicion:GES_TIPO.posicion};
}
function gesFormHtml(g,modo){
  g=g||{};
  var hoy=gesHoy(),tipo=g.tipo||'accion',dt=tipo==='datos',asig=modo==='derivar'||modo==='asignar';
  var oc=function(si){return si?' hidden':'';};
  var h='<div class="ges-form">'+
    '<div class="ges-fl'+(asig?' full':'')+'"><span>Tipo</span>'+gesPills('tipo',gesTiposDe(modo,g),tipo)+'</div>'+
    '<div class="ges-fl" data-ges-sec="mod"'+oc(dt)+'><span>Modalidad</span>'+gesPills('modalidad',GES_MOD,g.modalidad||'presencial')+'</div>'+
    gesRepHtml(g,modo,dt)+
    '<label><span id="gf-fecha-l">'+(dt?'Desde':'Fecha')+'</span><input type="date" id="gf-fecha" class="ges-inp" value="'+_escAttr(g.fecha||hoy)+'" onchange="gesOcupForm()"></label>'+
    '<label data-ges-sec="datos"'+oc(!dt)+'><span>Trabajarla hasta <i class="ges-opc">(opcional)</i></span><input type="date" id="gf-vence" class="ges-inp" value="'+_escAttr(g.vence||'')+'"></label>'+
    '<div class="ges-fl" data-ges-sec="hor"'+oc(dt)+'><span>Horario '+(asig?'':'<i class="ges-opc">(opcional)</i>')+'</span><div class="ges-hor">'+
      '<input type="time" id="gf-hd" class="ges-inp" value="'+_escAttr(gesHora(g.hora_desde))+'" aria-label="Desde" onchange="gesOcupForm()"><span>a</span>'+
      '<input type="time" id="gf-hh" class="ges-inp" value="'+_escAttr(gesHora(g.hora_hasta))+'" aria-label="Hasta" onchange="gesOcupForm()">'+
      '<span class="ges-atajos"><button type="button" onclick="gesHorSet(\'09:00\',\'13:00\')">Mañana</button><button type="button" onclick="gesHorSet(\'14:00\',\'18:00\')">Tarde</button></span>'+
    '</div></div>'+
    '<label class="full" data-ges-sec="hor"'+oc(dt)+'><span>Lugar <i class="ges-opc">(opcional)</i></span><input type="text" id="gf-lugar" class="ges-inp" maxlength="200" value="'+_escAttr(g.lugar||'')+'" placeholder="Sede, dirección, piso"></label>';
  if(asig){
    h+='<label><span>Hunter</span><select id="gf-hunter" class="ges-inp" onchange="gesHunterCambio()">'+gesHuntersOpts(g.hunter_id,modo==='asignar',gesPuedeAlLider())+'</select></label>'+
      '<label data-ges-sec="lider" hidden><span>Líder que la asigna</span><select id="gf-lider" class="ges-inp">'+gesLideresOpts()+'</select></label>'+
      '<div class="full ges-fl" data-ges-sec="datos"'+oc(!dt)+'><span>Personas para contactar</span>'+
        '<span class="ges-mini" style="font-weight:400">Peg&aacute; desde Excel una fila por persona: <b>nombre</b>, <b>tel&eacute;fono o mail</b> y <b>CUIL o referencia</b> (legajo, sector, DNI&hellip;), en cualquier orden. S&oacute;lo el nombre es obligatorio.</span>'+
        '<textarea id="gf-datos" class="ges-inp ges-ag-ta" rows="5" oninput="gesDatosPrev()" placeholder="Ana P&eacute;rez&#9;11 5555-1234&#9;Legajo 302"></textarea>'+
        '<div id="gf-datos-prev"></div></div>';
  }else if(modo!=='agendar'){
    var est=dt?GES_EST_DATOS:GES_EST;
    h+='<label><span>Estado</span><select id="gf-estado" class="ges-inp">'+Object.keys(est).map(function(k){
      return '<option value="'+k+'"'+((g.estado||'realizada')===k?' selected':'')+'>'+est[k]+'</option>';}).join('')+'</select></label>'+
      '<label data-ges-sec="hor"'+oc(dt)+'><span>Dotación de la empresa</span><input type="text" inputmode="numeric" id="gf-dot" class="ges-inp" value="'+(g.dotacion!=null?g.dotacion:'')+'" placeholder="Empleados"></label>'+
      '<label data-ges-sec="hor"'+oc(dt)+'><span>Asistentes o contactados</span><input type="text" inputmode="numeric" id="gf-asis" class="ges-inp" value="'+(g.asistentes!=null?g.asistentes:'')+'" placeholder="Personas que hablaron con vos"></label>';
  }
  h+='<div class="full ges-ocup" id="gf-ocup" hidden></div>'+
    '<label class="full"><span>Nota</span><textarea id="gf-nota" class="ges-inp" rows="2" maxlength="2000" placeholder="'+
    (dt?'Qué ofrecerles, con quién hablar en la empresa':asig||modo==='agendar'?'Con quién hablar, qué flyer llevar':'Cómo fue, próximos pasos')+'">'+gesE(g.nota||'')+'</textarea></label>'+
  '</div>';
  return h;
}
// Cambió el tipo en el formulario: una base de datos esconde horario, lugar,
// modalidad y repetición y muestra "trabajarla hasta" y la lista.
function gesTipoCambio(dt){
  var ov=document.getElementById('ges-ov');if(!ov)return;
  ov.querySelectorAll('[data-ges-sec]').forEach(function(e){
    var s=e.getAttribute('data-ges-sec');
    if(s==='datos')e.hidden=!dt;else if(s==='hor'||s==='mod'||s==='rep')e.hidden=dt;
  });
  var l=document.getElementById('gf-fecha-l');if(l)l.textContent=dt?'Desde':'Fecha';
  gesOcupForm();
}
// "¿Se repite?": Única, o cada N días (atajos 7/15/30) y, si se sabe, cuántas
// veces. Con la cantidad, al guardar se crean todas las fechas juntas.
function gesRepHtml(g,modo,oculto){
  var fr=g.frecuencia==='repite'?'repite':'unica';
  var serie=modo==='editar'&&g.veces&&g.vez; // en una serie ya armada no se cambia la cantidad
  return '<div class="full ges-fl" data-ges-sec="rep"'+(oculto?' hidden':'')+'><span>¿Se repite?</span>'+gesPills('frecuencia',GES_FREC,fr)+
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
// deja asignar en empresas ajenas a otros). conLider: el oficial puede dejarla
// "para que la asigne el líder".
function gesHuntersOpts(sel,soloEquipo,conLider){
  var ps=GES.personas||{},ids=gesHunters(soloEquipo);
  ids.sort(function(a,b){return ps[a].nombre.localeCompare(ps[b].nombre);});
  var lid=conLider?'<option value="__lider">Que la asigne el l&iacute;der</option>':'';
  if(!ids.length)return '<option value="">No hay hunters activos</option>'+lid;
  if(!sel)return '<option value="">Elegí un hunter</option>'+lid+ids.map(function(id){return '<option value="'+_escAttr(id)+'">'+gesE(ps[id].nombre)+(ps[id].es_prueba?' (prueba)':'')+'</option>';}).join('');
  return ids.map(function(id){
    return '<option value="'+_escAttr(id)+'"'+(id===sel?' selected':'')+'>'+gesE(ps[id].nombre)+(ps[id].es_prueba?' (prueba)':'')+'</option>';
  }).join('')+lid;
}
// Líderes para "que la asigne el líder": primero el mío.
function gesLideresOpts(){
  var ps=GES.personas||{},ids=gesLideres(),mio=(typeof _myLiderId!=='undefined'&&_myLiderId&&ids.indexOf(_myLiderId)>=0)?_myLiderId:null;
  if(mio)ids=[mio].concat(ids.filter(function(x){return x!==mio;}));
  return ids.map(function(id){return '<option value="'+_escAttr(id)+'">'+gesE(ps[id].nombre)+(id===mio?' (tu l&iacute;der)':'')+'</option>';}).join('');
}
function gesHunterCambio(){
  var hs=document.getElementById('gf-hunter'),ov=document.getElementById('ges-ov');
  if(ov&&hs)ov.querySelectorAll('[data-ges-sec="lider"]').forEach(function(e){e.hidden=hs.value!=='__lider';});
  gesOcupForm();
}
function gesElegirHunter(id){var hs=document.getElementById('gf-hunter');if(hs){hs.value=id;gesHunterCambio();}}
function gesFormLeer(modo){
  var d={tipo:gesPillVal('tipo')||'accion',modalidad:gesPillVal('modalidad')||'presencial',frecuencia:gesPillVal('frecuencia')||'unica',
    fecha:gesVal('gf-fecha')||gesHoy(),nota:gesVal('gf-nota').trim()||null,
    hora_desde:gesVal('gf-hd')||null,hora_hasta:gesVal('gf-hh')||null,lugar:gesVal('gf-lugar').trim()||null,vence:null};
  if(d.tipo==='datos'){
    // a distancia, sin horario ni repetición
    d.modalidad='virtual';d.hora_desde=null;d.hora_hasta=null;d.lugar=null;d.frecuencia='unica';
    d.vence=gesVal('gf-vence')||null;
  }
  if(d.frecuencia==='repite'){
    d.cada_dias=gesInt('gf-cada');
    if(document.getElementById('gf-veces'))d.veces=gesInt('gf-veces');
  }else{d.cada_dias=null;d.veces=null;d.vez=null;}
  if(modo==='derivar'||modo==='asignar'){
    var hv=gesVal('gf-hunter');
    if(hv==='__lider'){d.hunter_id=null;d.lider_id=gesVal('gf-lider')||null;}else d.hunter_id=hv;
    d.estado='planificada';
  }
  else if(modo==='agendar')d.estado='planificada';
  else{d.estado=gesVal('gf-estado')||'realizada';d.dotacion=gesInt('gf-dot');d.asistentes=gesInt('gf-asis');}
  return d;
}
// Lo que falta para derivar o asignar (null = está bien). Para que nadie le
// pise la agenda a un hunter, con un hunter elegido el horario es obligatorio.
function gesAsigError(d){
  if(!d.hunter_id&&!d.lider_id)return 'Elegí el hunter (o que la asigne el líder).';
  if(d.tipo!=='datos'&&d.hunter_id&&!d.hora_desde)return 'Poné el horario: así nadie le pisa la agenda al hunter. (Mañana y Tarde lo completan de un toque.)';
  if(d.tipo==='datos'&&d.vence&&d.vence<d.fecha)return '"Trabajarla hasta" tiene que ser después de "Desde".';
  return null;
}

// ── Personas pegadas desde Excel (prospectos y bases de datos) ──────────────
// Una persona por renglón, celdas en cualquier orden. Cada celda se toma por
// lo que parece: un paquete = paquete, 11 cifras que empiezan como un CUIL =
// CUIL, un mail o un número de 10 cifras o más = contacto, la primera celda con
// letras = nombre y otro texto (o un número corto, como un legajo o un DNI) =
// referencia. Si la primera fila trae títulos, desempatan: en la columna
// "Teléfono" un número corto es contacto, en "Legajo" es referencia, etc.
function gesTitulos(c){
  var t=[],n=0,nom=false;
  c.forEach(function(x,i){
    var s=_padNorm(x),k=null;
    if(/^(nombre|apellido|nombre y apellido|apellido y nombre|empleado|persona)$/.test(s)){k='nombre';nom=true;}
    else if(/tel|cel|mail|correo|contacto|whats/.test(s))k='contacto';
    else if(/^(cuil|cuit)/.test(s))k='cuil';
    else if(/ref|legajo|sector|dni|dato|area/.test(s))k='ref';
    else if(/paquete/.test(s))k='paq';
    if(k){t[i]=k;n++;}
  });
  return (nom&&n>=2)?t:null;
}
function gesCelda(x){
  var d=gesCuilLimpio(x);
  if(/@/.test(x))return 'contacto';
  if(/^[\d\s.\-+()\/]+$/.test(x)&&d.length){
    if(d.length===11&&/^(20|23|24|27|30|33|34)/.test(d))return 'cuil';
    if(d.length>=10)return 'contacto';
    return 'ref';
  }
  return 'texto';
}
// conPaq: también lee el paquete (prospectos). ya: los que ya están (para no repetir CUIL).
function gesPersonasParse(t,conPaq,ya){
  var tiene={};(ya||[]).forEach(function(p){if(p.cuil)tiene[p.cuil]=1;});
  var vistos={},cols=null,out=[];
  String(t||'').split(/\r?\n/).forEach(function(l){
    if(!l.trim())return;
    var crudo=l.indexOf('\t')>=0?l.split('\t'):l.split(/;|\s{2,}/);
    var c=crudo.map(function(x){return x.trim();});
    if(!cols&&!out.length){var hc=gesTitulos(c);if(hc){cols=hc;return;}}
    var r={nombre:null,contacto:null,cuil:null,referencia:null,paquete:null,ok:true,motivo:''};
    // Con títulos y la celda del nombre vacía, un texto de otra columna no pasa a ser el nombre.
    var iNom=cols?cols.indexOf('nombre'):-1,sinNom=iNom>=0&&!c[iNom];
    c.forEach(function(x,i){
      if(!x)return;
      var hk=cols?cols[i]:null,k=gesCelda(x),letras=/[a-záéíóúñ]/i.test(x);
      if(sinNom&&k==='texto'&&(hk==='cuil'||hk==='ref')){if(!r.referencia)r.referencia=x.slice(0,120);return;}
      if(conPaq&&!r.paquete){var pq=gesPaqDe(x);if(pq){r.paquete=pq;return;}}
      if(hk==='contacto'&&!r.contacto&&(k!=='texto'||/@/.test(x))){r.contacto=x.slice(0,120);return;}
      if(hk==='ref'&&!r.referencia&&k!=='cuil'){r.referencia=x.slice(0,120);return;}
      if(hk==='nombre'&&!r.nombre&&k==='texto'&&letras){r.nombre=x.replace(/\s+/g,' ').slice(0,120);return;}
      if(k==='cuil'&&!r.cuil){r.cuil=gesCuilLimpio(x);return;}
      if(k==='contacto'&&!r.contacto){r.contacto=x.slice(0,120);return;}
      if(k==='texto'&&!r.nombre&&letras){r.nombre=x.replace(/\s+/g,' ').slice(0,120);return;}
      if(!r.referencia)r.referencia=x.slice(0,120);
    });
    if(!r.nombre){r.ok=false;r.motivo='sin nombre';}
    else if(r.cuil&&!gesCuilOk(r.cuil)){r.ok=false;r.motivo='CUIL inválido';}
    else if(r.cuil&&(tiene[r.cuil]||vistos[r.cuil])){r.ok=false;r.motivo='ya está en la lista';}
    if(r.cuil)vistos[r.cuil]=1;
    out.push(r);
  });
  return out;
}
// Vista previa de la lista de una base de datos (en el formulario de derivar/asignar).
function gesDatosPrev(){
  var host=document.getElementById('gf-datos-prev');if(!host)return;
  var r=gesPersonasParse(gesVal('gf-datos'),false,[]),ok=r.filter(function(x){return x.ok;}),mal=r.filter(function(x){return !x.ok;});
  if(!r.length){host.innerHTML='';return;}
  host.innerHTML='<div class="ges-paste-res"><span class="ges-chip ges-c-ok">'+ok.length+(ok.length===1?' persona lista':' personas listas')+'</span>'+
      (mal.length?'<span class="ges-chip ges-c-bad">'+mal.length+' con problemas (no se agregan): '+mal.slice(0,3).map(function(x){return gesE((x.nombre||'?')+' ('+x.motivo+')');}).join(', ')+(mal.length>3?'…':'')+'</span>':'')+
      (ok.length>GES_DATOS_MAX?'<span class="ges-chip ges-c-warn">Se cargan las primeras '+GES_DATOS_MAX+'</span>':'')+'</div>'+
    '<div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Nombre</th><th>Contacto</th><th>CUIL / Ref.</th></tr></thead><tbody>'+
    ok.slice(0,6).map(function(x){return '<tr><td>'+gesE(x.nombre)+'</td><td>'+gesE(x.contacto||'—')+'</td><td class="ges-num">'+gesE(gesCuilRefTxt(x)||'—')+'</td></tr>';}).join('')+
    '</tbody></table></div>'+(ok.length>6?'<p class="ges-nota">Y '+(ok.length-6)+' más.</p>':'');
}
function gesDatosOk(){return gesPersonasParse(gesVal('gf-datos'),false,[]).filter(function(x){return x.ok;}).slice(0,GES_DATOS_MAX);}
// Después de crear la base: sus personas, todas "A contactar".
function gesDatosGuardar(g,lista,cb){
  if(!g||g.tipo!=='datos'||!lista||!lista.length){cb(true);return;}
  var fallo=function(e){
    // La lista no se pierde: queda pegada en la acción para reintentar con un toque.
    GES._pegarPend={gid:g.id,txt:lista.map(function(x){return [x.nombre,x.contacto||'',x.cuil?gesCuilFmt(x.cuil):(x.referencia||'')].join('\t');}).join('\n')};
    showToast('Se creó la base, pero no se pudieron cargar las personas ('+gesErrTxt(e)+'). Te dejé la lista pegada en la acción: tocá «Agregar» para reintentar.');
    cb(false);
  };
  _sb.from('gestion_prospectos').insert(lista.map(function(x){return {gestion_id:g.id,nombre:x.nombre,contacto:x.contacto,cuil:x.cuil,referencia:x.referencia,estado:'a_contactar'};})).select('id').then(function(r){
    if(r&&r.error){fallo(r.error);return;}
    cb(true);
  },fallo);
}

// ── Registrar (Hunter, desde Buscar flyer) ──────────────────────────────────
function gesRegistrar(r){
  if(!r||!r.empresa){showToast('Elegí primero una empresa.');return;}
  if(!r.user_id){showToast('No se pudo identificar al oficial de esa empresa. Volvé a buscarla.');return;}
  GES._reg=r;
  gesPersonas().then(function(){
    gesModal('<h3 class="ges-mt">Registrar gestión</h3><p class="ges-ms">'+gesE(r.empresa)+' '+gesCuitHtml(r.cuits)+'</p>'+
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
    if(res&&res.error){if(b){b.disabled=false;b.textContent='Guardar y cargar prospectos';}showToast('No se pudo guardar: '+gesErrTxt(res.error));return;}
    gesCerrar();GES.lista=null;
    var g=res.data;
    gesCrearSerie(g,function(n,fallas){
      if(!(fallas&&fallas.length))showToast(n>0?'Guardada, y planificadas las otras '+n+' fechas. Ahora cargá los prospectos.':'Gestión guardada. Ahora cargá los prospectos.');
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
    gesModal('<h3 class="ges-mt">Derivar a un hunter</h3><p class="ges-ms">'+gesE(e.empresa)+' '+gesCuitHtml(e.cuits)+'</p>'+
      gesFormHtml({},'derivar')+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ges-der-ok" onclick="gesDerivarOk()">Derivar</button></div>',true);
    gesOcupForm();
  });
}
// Guarda una acción nueva derivada o asignada: revisa que no se pise, la crea,
// carga la lista si es una base de datos y arma las otras fechas si se repite.
// listo(g,n) después de guardar; volver() si no se guardó (rehabilita el botón).
function gesGuardarNueva(d,lista,volver,listo){
  gesChoque(d.hunter_id,d).then(function(seguir){
    if(!seguir){volver();return;}
    _sb.from('gestiones').insert(d).select().single().then(function(res){
      if(res&&res.error){volver();showToast('No se pudo guardar: '+gesErrTxt(res.error));return;}
      var g=res.data;
      gesDatosGuardar(g,lista,function(okDatos){gesCrearSerie(g,function(n,fallas){
        // Si algo no salió, el aviso ya lo dio quien falló: se abre la acción para seguir ahí.
        if(!okDatos||(fallas&&fallas.length)){gesCerrar();GES.lista=null;GES.ag.data=null;GES.det=g.id;GES.tab='lista';gesRender();return;}
        listo(g,n);
      });});
    },function(e){volver();showToast('No se pudo guardar: '+gesErrTxt(e));});
  });
}
function gesAsignadaTxt(d,n,lista){
  var a=d.hunter_id?gesNom(d.hunter_id):null;
  return (a?'Derivada a '+a:'Queda para que la asigne '+gesNom(d.lider_id))+
    (lista&&lista.length?', con '+lista.length+(lista.length===1?' persona para contactar':' personas para contactar'):'')+
    (n>0?', con las '+(n+1)+' fechas planificadas':'')+'.'+(a?' Le aparece en su agenda y en la marca de su avatar.':' Le aparece en su bandeja "Por asignar".');
}
function gesDerivarOk(){
  var e=GES._der;if(!e)return;
  var d=gesFormLeer('derivar');
  var er=gesAsigError(d)||gesRepError(d)||gesHorError(d);if(er){showToast(er);return;}
  var lista=d.tipo==='datos'?gesDatosOk():null;
  if(d.tipo==='datos'&&!lista.length){showToast('Pegá al menos una persona para contactar.');return;}
  if(d.frecuencia==='repite')d.vez=1;
  var b=document.getElementById('ges-der-ok');if(b){b.disabled=true;b.textContent='Derivando…';}
  d.empresa=e.empresa;d.origen='derivada';
  gesGuardarNueva(d,lista,function(){if(b){b.disabled=false;b.textContent='Derivar';}},function(g,n){
    gesCerrar();GES.lista=null;GES.ag.data=null;
    showToast(gesAsignadaTxt(d,n,lista));
    gesRender();
  });
}

// ── Detalle de una gestión ──────────────────────────────────────────────────
// Además de los prospectos: la conversación (hunter, oficial y líder se
// escriben ahí) y el historial (lo anota la base: quién la derivó, a quién se
// la pasaron, cambios de horario, altas y descartes).
// foco = id de una persona de la lista: se abre la acción y esa fila queda
// marcada (si no, en una base de 300 personas no se la encuentra).
function gesAbrirDet(id,editar,reasignar,foco){GES.det=id;GES._editarAlAbrir=!!editar;GES._reasigAlAbrir=!!reasignar;GES._prosFoco=foco||null;GES._prosFocoIr=!!foco;if(document.getElementById('view-gestiones').style.display==='none')switchApp('gestiones');else gesRender();window.scrollTo(0,0);}
function gesVolver(){GES.det=null;GES.detG=null;GES._prosFoco=null;GES.ag.data=null;gesRender();}
// Si la tabla todavía no existe (migración sin aplicar) o falla, lista vacía.
function gesFilas(p){return p.then(function(r){return (r&&!r.error&&r.data)||[];},function(){return [];});}
function gesDetalle(id){
  Promise.all([
    _sb.from('gestiones').select('*').eq('id',id).maybeSingle(),
    gesTodas(function(a,b){return _sb.from('gestion_prospectos').select('*').eq('gestion_id',id).order('created_at').order('id').range(a,b);}).then(function(l){return {data:l};}),
    gesPersonas(),
    gesFilas(_sb.from('gestion_mensajes').select('*').eq('gestion_id',id).order('created_at')),
    gesFilas(_sb.from('gestion_eventos').select('*').eq('gestion_id',id).order('at'))
  ]).then(function(res){
    var g=res[0]&&res[0].data;
    if(!g){gesBody('<button type="button" class="ges-link" onclick="gesVolver()">&larr; Volver</button><div class="ges-vacio">Esa gestión ya no existe o no tenés acceso.</div>');return;}
    GES.detG=g;GES.detPros=(res[1]&&res[1].data)||[];GES.detMsg=res[3];GES.detEv=res[4];
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
    // Y los mensajes quedan leídos.
    var yo2=gesYo(),hayMsg=GES.detMsg.some(function(m){return m.autor!==yo2;});
    if(hayMsg)_sb.rpc('gestion_marcar_leida',{p_gestion:g.id}).then(function(){
      if(GES.msgN)delete GES.msgN[g.id];
      if(typeof _gesAvisoCargar==='function')_gesAvisoCargar(); // el numerito baja enseguida
    },function(){});
    gesDetPintar();
    if(GES._editarAlAbrir){GES._editarAlAbrir=false;gesEditar(true);}
    else if(GES._reasigAlAbrir){GES._reasigAlAbrir=false;if(gesPuedeReasignar(g))gesReasignar();}
  }).catch(gesErr);
}
// Recarga sólo la conversación y el historial (después de escribir o de un alta).
function gesDetHilo(){
  var g=GES.detG;if(!g)return Promise.resolve();
  return Promise.all([
    gesFilas(_sb.from('gestion_mensajes').select('*').eq('gestion_id',g.id).order('created_at')),
    gesFilas(_sb.from('gestion_eventos').select('*').eq('gestion_id',g.id).order('at'))
  ]).then(function(r){if(GES.detG!==g)return;GES.detMsg=r[0];GES.detEv=r[1];gesDetPintar();});
}
function gesDetPintar(){
  var g=GES.detG;if(!g)return;
  var l=GES.detPros,ed=gesPuedeEditar(g),dt=g.tipo==='datos',yo=gesYo();
  var alt=l.filter(function(p){return p.estado==='alta';}).length;
  var cont=l.filter(function(p){return p.estado!=='a_contactar';}).length;
  var acts='';
  if(ed&&g.estado==='planificada'&&g.hunter_id)acts+='<button type="button" class="btn bp ges-btn-sm" onclick="gesEditar(true)">'+(dt?'Terminar la base':'Marcar como realizada')+'</button>';
  if(gesPuedeReasignar(g)&&g.estado!=='cancelada')acts+='<button type="button" class="btn '+(!g.hunter_id||g.no_puede_at?'bp':'bg')+' ges-btn-sm" onclick="gesReasignar()">'+(g.hunter_id?'Cambiar hunter':'Asignar a un hunter')+'</button>';
  if(g.hunter_id===yo&&g.estado==='planificada'&&!g.no_puede_at)acts+='<button type="button" class="btn bg ges-btn-sm" onclick="gesNoPuedo()">No puedo ir</button>';
  if(ed)acts+='<button type="button" class="btn bg ges-btn-sm" onclick="gesEditar(false)">Editar datos</button>';
  if(ed&&g.frecuencia==='repite'&&!g.veces)acts+='<button type="button" class="btn bg ges-btn-sm" onclick="gesRepetir()">Crear la próxima (+'+(g.cada_dias||30)+' días)</button>';
  if(gesPuedeBorrar(g))acts+='<button type="button" class="btn bg ges-btn-sm ges-peligro" onclick="gesBorrar()">Eliminar</button>';
  var cu=gesCuitTxt(g.cuit);
  var aviso='';
  if(!g.hunter_id&&g.estado==='planificada')aviso='<div class="ges-aviso">Está esperando que la asigne <b>'+gesE(gesNom(g.lider_id))+'</b>.'+(gesPuedeReasignar(g)?' Tocá <b>Asignar a un hunter</b>: te muestra quién está libre a esa hora.':'')+'</div>';
  else if(g.no_puede_at&&g.estado==='planificada')aviso='<div class="ges-aviso">'+(g.hunter_id===yo?'Avisaste que no podés ir'+(g.no_puede_motivo?' ('+gesE(g.no_puede_motivo)+')':'')+'. Sigue en tu agenda hasta que te la saquen.':
    '<b>'+gesE(gesNom(g.hunter_id))+'</b> avisó que no puede ir'+(g.no_puede_motivo?': '+gesE(String(g.no_puede_motivo).replace(/[.\s]+$/,'')):'')+'.'+(gesPuedeReasignar(g)?' Tocá <b>Cambiar hunter</b> para pasársela a otro.':' La reasigna el líder o quien la derivó.'))+'</div>';
  var kpis=dt?
    '<div class="ges-kpis ges-k5">'+gesKpi('Personas',gesN(l.length),'en la base')+gesKpi('Contactados',gesN(cont),gesPct(cont,l.length)+' de la base')+
      gesKpi('Prospectos',gesN(l.filter(function(p){return p.estado==='prospecto'||p.estado==='en_gestion';}).length),'en curso')+
      gesKpi('Altas',gesN(alt),gesPaqResumen(l),true)+gesKpi('Conversión',gesPct(alt,cont),'altas ÷ contactados')+'</div>':
    '<div class="ges-kpis ges-k5">'+gesKpi('Dotación',g.dotacion!=null?gesN(g.dotacion):'—','empleados')+
      gesKpi('Asistentes',g.asistentes!=null?gesN(g.asistentes):'—','contactados')+
      gesKpi('Prospectos',gesN(l.length),g.asistentes?gesPct(l.length,g.asistentes)+' de los asistentes':'')+
      gesKpi('Altas',gesN(alt),gesPaqResumen(l),true)+gesKpi('Conversión',gesPct(alt,l.length),'altas ÷ prospectos')+'</div>';
  var h='<button type="button" class="ges-link" onclick="gesVolver()">&larr; Volver</button>'+
    '<div class="ges-det-top"><div><h3 class="ges-h1">'+gesE(g.empresa)+'</h3>'+
    '<p class="ges-sub">'+(cu?'<b class="ges-num">'+gesE(cu)+'</b> &middot; ':'')+
      (dt?GES_TIPO.datos+' &middot; desde el '+gesE(gesFecha(g.fecha))+(g.vence?' &middot; hasta el '+gesE(gesFecha(g.vence)):''):
        GES_TIPO[g.tipo]+' '+(GES_MOD[g.modalidad]||'').toLowerCase()+' &middot; '+gesE(gesFecha(g.fecha))+(gesHorario(g)?' &middot; '+gesE(gesHorario(g)):'')+(g.lugar?' &middot; '+gesE(g.lugar):'')+(g.frecuencia==='repite'?' &middot; '+gesE(gesRepTxt(g)):' &middot; Única vez'))+
      ' &middot; Hunter: '+gesHunterTxt(g)+' &middot; Oficial: '+gesE(gesNom(g.dueno_id))+
      (g.origen==='derivada'?' &middot; Derivada por '+gesE(gesNom(g.creada_por)):'')+(g.prueba?' &middot; <span class="ges-prueba">prueba</span>':'')+'</p></div>'+
    '<div class="ges-acts">'+gesChipEst(g)+acts+'</div></div>'+
    aviso+(g.nota?'<div class="ges-auto">'+gesE(g.nota)+'</div>':'')+kpis+
    '<section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">'+(dt?'Personas para contactar':'Prospectos')+'</span>'+
      (ed?'<span class="ges-mini">'+(dt?'Pasá cada persona a <b>Prospecto</b> o <b>En gestión</b> cuando la contactes, y a <b>Alta</b> cuando el sueldo cae en Galicia.':'Cuando el sueldo cae en Galicia, pasá el estado a <b>Alta</b> (te pregunta si fue con paquete o sin paquete).')+'</span>':'')+'</div>'+
    '<div class="ges-tw"><table class="ges-tbl"><thead><tr><th>Nombre</th><th>Contacto</th><th>CUIL / Ref.</th><th>Paquete</th><th>Estado</th>'+(ed?'<th></th>':'')+'</tr></thead><tbody>'+
    (l.length?l.map(function(p,i){return gesProsFila(p,i,ed,dt);}).join(''):'<tr><td colspan="6" class="ges-mini" style="padding:14px 10px">'+(dt?'La base no tiene personas cargadas.':'Todavía no hay prospectos.')+(ed?' Agregalos de a uno o pegá un bloque desde Excel.':'')+'</td></tr>')+
    '</tbody></table></div>'+
    (ed?gesAltaHtml():'')+
    '</section>'+gesChatHtml()+gesHistHtml();
  gesBody(h);
  // La lista de una base que no se pudo cargar al crearla: queda pegada para reintentar.
  var pend=GES._pegarPend;
  if(ed&&pend&&pend.gid===g.id){
    GES._pegarPend=null;
    var ta=document.getElementById('gp-paste'),det=document.querySelector('.ges-paste');
    if(ta)ta.value=pend.txt;if(det)det.open=true;
  }
  if(ed)gesPastePrev();
  // Se vino desde "Para contactar": llevar la vista hasta esa persona. Sólo la
  // primera vez: la fila queda marcada, pero repintar no vuelve a saltar.
  if(GES._prosFoco&&GES._prosFocoIr){
    GES._prosFocoIr=false;
    var fila=document.querySelector('#ges-root .ges-foco');
    if(fila)try{fila.scrollIntoView({block:'center'});}catch(e){fila.scrollIntoView();}
  }
}
function gesProsFila(p,i,ed,dt){
  var cls=p.estado==='alta'?' alta':p.estado==='descartado'?' desc':p.estado==='en_gestion'?' gest':'';
  var ests=Object.keys(GES_PEST).filter(function(k){return k!=='a_contactar'||dt||p.estado==='a_contactar';});
  var hoy=gesHoy(),prox='';
  if(GES_ABIERTO[p.estado]){
    if(ed)prox='<div><input type="date" class="ges-est ges-prox'+(p.proximo&&p.proximo<=hoy?' vencido':'')+'" value="'+_escAttr(p.proximo||'')+'" title="Próximo contacto" aria-label="Próximo contacto con '+_escAttr(p.nombre)+'" onchange="gesProsCampo('+i+',\'proximo\',this.value)"></div>';
    else if(p.proximo)prox='<div class="ges-motivo">Volver a contactar el '+gesE(gesFecha(p.proximo))+'</div>';
  }
  return '<tr'+(GES._prosFoco&&p.id===GES._prosFoco?' class="ges-foco"':'')+'><td>'+gesE(p.nombre)+'</td><td>'+gesContactoHtml(p.contacto)+'</td>'+
    '<td class="ges-num">'+(gesCuilRefTxt(p)?gesE(gesCuilRefTxt(p)):'<span class="ges-mini">—</span>')+'</td>'+
    '<td>'+(ed?'<select class="ges-est" aria-label="Paquete de '+_escAttr(p.nombre)+'" onchange="gesProsCampo('+i+',\'paquete\',this.value)">'+(p.estado==='alta'&&p.paquete?'':'<option value="">—</option>')+gesPaqOpts(p.paquete)+'</select>'
      :(GES_PAQ_CORTO[p.paquete]||'—'))+'</td>'+
    '<td>'+(ed?'<select class="ges-est'+cls+'" aria-label="Estado de '+_escAttr(p.nombre)+'" onchange="gesProsCampo('+i+',\'estado\',this.value)">'+
      ests.map(function(k){return '<option value="'+k+'"'+(p.estado===k?' selected':'')+'>'+GES_PEST[k]+'</option>';}).join('')+'</select>'
      :'<span class="ges-est'+cls+'">'+GES_PEST[p.estado]+'</span>')+
      (p.estado==='alta'&&p.fecha_alta?'<div class="ges-mini">desde el '+gesE(gesFecha(p.fecha_alta))+'</div>':'')+
      (p.estado==='descartado'&&p.motivo?'<div class="ges-motivo">'+gesE(GES_MOTIVO[p.motivo]||p.motivo)+'</div>':'')+prox+'</td>'+
    (ed?'<td class="r"><button type="button" class="ges-x" title="Quitar" aria-label="Quitar a '+_escAttr(p.nombre)+'" onclick="gesProsQuitar('+i+')">&times;</button></td>':'')+'</tr>';
}
// "3 con paquete · 1 sin paquete" de una lista de prospectos.
function gesPaqResumen(l){
  var a=l.filter(function(p){return p.estado==='alta';}),sin=a.filter(function(p){return p.paquete==='caja';}).length,con=a.filter(function(p){return p.paquete&&p.paquete!=='caja';}).length;
  if(!a.length)return 'sueldos en Galicia';
  return con+' con paquete &middot; '+sin+' sin paquete'+(a.length-con-sin?' &middot; '+(a.length-con-sin)+' sin cargar':'');
}
function gesKpi(t,v,d,hi){return '<div class="ges-card ges-kpi'+(hi?' hi':'')+'"><div class="ges-lbl">'+t+'</div><div class="ges-kv">'+v+'</div>'+(d?'<div class="ges-kd">'+d+'</div>':'')+'</div>';}

// ── Conversación e historial ────────────────────────────────────────────────
function gesFechaHora(iso){
  if(!iso)return '';
  var d=new Date(iso);if(isNaN(d))return '';
  return gesFecha(gesIso(d))+' '+gesP2(d.getHours())+':'+gesP2(d.getMinutes());
}
function gesChatHtml(){
  var ms=GES.detMsg||[],yo=gesYo();
  return '<section class="ges-card ges-pad ges-chat"><div class="ges-ch"><span class="ges-ct">Conversación</span><span class="ges-mini">La ven el hunter, el oficial y el líder. Para preguntar qué hay que hacer o avisar algo.</span></div>'+
    (ms.length?'<div class="ges-msgs" id="ges-msgs">'+ms.map(function(m){
      return '<div class="ges-msg'+(m.autor===yo?' mio':'')+(m.tipo==='no_puedo'?' np':'')+'"><span class="ges-msg-q">'+gesE(m.autor===yo?'Vos':gesNom(m.autor))+' &middot; '+gesE(gesFechaHora(m.created_at))+(m.tipo==='no_puedo'?' &middot; avisó que no puede ir':'')+'</span>'+gesE(m.texto)+'</div>';
    }).join('')+'</div>':'<p class="ges-mini">Todavía no hay mensajes.</p>')+
    '<div class="ges-msg-new"><textarea id="ges-msg-t" class="ges-inp" rows="2" maxlength="1000" placeholder="Escribí una pregunta o un aviso"></textarea>'+
    '<button type="button" class="btn bp ges-btn-sm" id="ges-msg-ok" onclick="gesMsgEnviar()">Enviar</button></div></section>';
}
function gesMsgEnviar(){
  var g=GES.detG,ta=document.getElementById('ges-msg-t');if(!g||!ta)return;
  var t=ta.value.trim();if(!t){showToast('Escribí el mensaje.');return;}
  var b=document.getElementById('ges-msg-ok');if(b){b.disabled=true;b.textContent='Enviando…';}
  _sb.rpc('gestion_mensaje_enviar',{p_gestion:g.id,p_texto:t}).then(function(r){
    if(r&&r.error){if(b){b.disabled=false;b.textContent='Enviar';}showToast('No se pudo enviar: '+gesErrTxt(r.error));return;}
    gesDetHilo().then(function(){var m=document.getElementById('ges-msgs');if(m)m.scrollTop=m.scrollHeight;});
  },function(e){if(b){b.disabled=false;b.textContent='Enviar';}showToast('No se pudo enviar: '+gesErrTxt(e));});
}
// Lo que pasó con la acción, en castellano.
function gesEvTxt(e){
  // Siempre con el nombre (también el propio): "Vos se la derivó" no se lee bien.
  var N=function(id){var p=GES.personas&&GES.personas[id];return p?p.nombre:gesNom(id);},d=e.detalle||{},q=N(e.quien);
  if(e.que==='registrada')return q+' la registró.';
  if(e.que==='derivada')return q+' se la derivó a '+N(d.hunter)+'.';
  if(e.que==='por_asignar')return q+' la mandó al equipo para que la asigne '+N(d.lider)+'.';
  if(e.que==='hunter')return d.de?q+' se la pasó de '+N(d.de)+' a '+N(d.a)+'.':q+' se la asignó a '+N(d.a)+'.';
  if(e.que==='horario'){
    var h=function(f,a,b){return (f?gesFecha(f):'')+(a?' '+a+(b?'–'+b:''):'');};
    return q+' cambió el día u horario: '+h(d.fecha_de,d.desde_de,d.hasta_de)+' → '+h(d.fecha_a,d.desde_a,d.hasta_a)+'.';
  }
  if(e.que==='estado')return q+' la marcó como '+String(GES_EST[d.a]||d.a).toLowerCase()+'.';
  if(e.que==='no_puede')return q+' avisó que no puede ir'+(d.motivo?': '+d.motivo:'')+'.';
  if(e.que==='alta')return q+' marcó el alta de '+d.nombre+' ('+(GES_PAQ_CORTO[d.paquete]||'sin paquete cargado')+').';
  if(e.que==='descarte')return q+' descartó a '+d.nombre+' ('+(GES_MOTIVO[d.motivo]||'sin motivo')+').';
  return q+': '+e.que;
}
function gesHistHtml(){
  var ev=GES.detEv||[];if(!ev.length)return '';
  return '<details class="ges-hist"><summary>Historial ('+ev.length+')</summary><ol>'+ev.map(function(e){
    return '<li><span class="ges-mini">'+gesE(gesFechaHora(e.at))+'</span> &middot; '+gesE(gesEvTxt(e))+'</li>';
  }).join('')+'</ol></details>';
}

// ── "No puedo ir" (hunter) y cambiar el hunter (líder, admin, quien la derivó) ─
function gesNoPuedo(){
  var g=GES.detG;if(!g)return;
  var lid=GES.personas&&GES.personas[g.hunter_id]&&GES.personas[g.hunter_id].lider_id;
  gesModal('<h3 class="ges-mt">No puedo ir</h3><p class="ges-ms">'+gesE(g.empresa)+' &middot; '+gesE(gesFecha(g.fecha))+(gesHorario(g)?' '+gesE(gesHorario(g)):'')+'</p>'+
    '<div class="ges-auto">Le avisamos a <b>'+gesE(gesNom(g.creada_por))+'</b>'+(lid&&lid!==g.creada_por?' y a <b>'+gesE(gesNom(lid))+'</b>':'')+' para que se la pasen a otro hunter. Mientras tanto sigue en tu agenda.</div>'+
    '<div class="ges-form"><label class="full"><span>¿Por qué? <i class="ges-opc">(opcional)</i></span><textarea id="gf-np" class="ges-inp" rows="2" maxlength="500" placeholder="Tengo otra visita, estoy de licencia…"></textarea></label></div>'+
    '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
    '<button type="button" class="btn bp" id="ges-np-ok" onclick="gesNoPuedoOk()">Avisar</button></div>');
}
function gesNoPuedoOk(){
  var g=GES.detG;if(!g)return;
  var b=document.getElementById('ges-np-ok');if(b){b.disabled=true;b.textContent='Avisando…';}
  _sb.rpc('gestion_no_puedo',{p_gestion:g.id,p_motivo:gesVal('gf-np').trim()||null}).then(function(r){
    if(r&&r.error){if(b){b.disabled=false;b.textContent='Avisar';}showToast('No se pudo avisar: '+gesErrTxt(r.error));return;}
    gesCerrar();GES.lista=null;GES.ag.data=null;
    showToast('Listo: les avisamos. Sigue en tu agenda hasta que la pasen a otro hunter.');
    gesDetalle(g.id);
  });
}
function gesReasignar(){
  var g=GES.detG;if(!g)return;
  var dt=g.tipo==='datos';
  gesPersonas().then(function(){
    gesModal('<h3 class="ges-mt">'+(g.hunter_id?'Cambiar el hunter':'Asignar a un hunter')+'</h3><p class="ges-ms">'+gesE(g.empresa)+' '+gesCuitHtml(g.cuit)+'</p>'+
      (g.no_puede_at?'<div class="ges-aviso"><b>'+gesE(gesNom(g.hunter_id))+'</b> avisó que no puede'+(g.no_puede_motivo?': '+gesE(String(g.no_puede_motivo).replace(/[.\s]+$/,'')):'')+'.</div>':'')+
      '<div class="ges-form">'+
        '<label class="full"><span>Hunter</span><select id="gf-hunter" class="ges-inp" onchange="gesOcupForm()">'+
          (g.hunter_id?'':'<option value="">Elegí un hunter</option>')+gesHuntersOpts(g.hunter_id||'x',gesRol()==='lider'&&!gesEsAdmin()&&!(g.origen==='derivada'&&g.creada_por===gesYo()))+'</select></label>'+
        (dt?'':'<label><span>Fecha</span><input type="date" id="gf-fecha" class="ges-inp" value="'+_escAttr(g.fecha)+'" onchange="gesOcupForm()"></label>'+
          '<div class="ges-fl"><span>Horario</span><div class="ges-hor">'+
            '<input type="time" id="gf-hd" class="ges-inp" value="'+_escAttr(gesHora(g.hora_desde))+'" aria-label="Desde" onchange="gesOcupForm()"><span>a</span>'+
            '<input type="time" id="gf-hh" class="ges-inp" value="'+_escAttr(gesHora(g.hora_hasta))+'" aria-label="Hasta" onchange="gesOcupForm()">'+
            '<span class="ges-atajos"><button type="button" onclick="gesHorSet(\'09:00\',\'13:00\')">Mañana</button><button type="button" onclick="gesHorSet(\'14:00\',\'18:00\')">Tarde</button></span>'+
          '</div></div>')+
        '<div class="full ges-ocup" id="gf-ocup" hidden></div>'+
      '</div>'+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ges-ra-ok" onclick="gesReasignarOk()">'+(g.hunter_id?'Guardar':'Asignar')+'</button></div>');
    GES._ocupExcl=g.id;
    gesOcupForm();
  });
}
function gesReasignarOk(){
  var g=GES.detG;if(!g)return;
  var dt=g.tipo==='datos',hv=gesVal('gf-hunter');
  if(!hv){showToast('Elegí el hunter.');return;}
  var upd={hunter_id:hv};
  if(!dt){
    upd.fecha=gesVal('gf-fecha')||g.fecha;upd.hora_desde=gesVal('gf-hd')||null;upd.hora_hasta=gesVal('gf-hh')||null;
    if(!upd.hora_desde){showToast('Poné el horario: así nadie le pisa la agenda al hunter.');return;}
    var er=gesHorError(upd);if(er){showToast(er);return;}
  }
  var igual=hv===g.hunter_id&&(dt||(upd.fecha===g.fecha&&gesHora(upd.hora_desde)===gesHora(g.hora_desde)&&gesHora(upd.hora_hasta)===gesHora(g.hora_hasta)));
  if(igual){gesCerrar();return;}
  var b=document.getElementById('ges-ra-ok'),txt=b?b.textContent:'';
  var volver=function(){if(b){b.disabled=false;b.textContent=txt;}};
  if(b){b.disabled=true;b.textContent='Guardando…';}
  gesChoque(hv,{fecha:upd.fecha||g.fecha,hora_desde:upd.hora_desde,hora_hasta:upd.hora_hasta,tipo:g.tipo,estado:g.estado},g.id).then(function(seguir){
    if(!seguir){volver();return;}
    _sb.from('gestiones').update(upd).eq('id',g.id).select().maybeSingle().then(function(res){
      if(res&&res.error){volver();showToast('No se pudo guardar: '+gesErrTxt(res.error));return;}
      // La base deja el hunter como estaba si quien guarda no puede cambiarlo.
      if(res&&res.data&&res.data.hunter_id!==hv){volver();showToast('No podés cambiar el hunter de esta acción: lo hace el líder o quien la derivó.');return;}
      gesCerrar();GES.lista=null;GES.ag.data=null;
      showToast('Listo: ahora la tiene '+gesNom(hv)+'. Le aparece en su agenda.');
      if(res&&res.data)gesDetalle(g.id);else gesVolver(); // si ya no la ve, vuelve a la lista
    });
  });
}

// Agregar de a uno + pegar desde Excel.
function gesAltaHtml(){
  return '<div class="ges-add">'+
    '<input type="text" class="ges-inp" id="gp-nom" placeholder="Nombre y apellido" maxlength="120">'+
    '<input type="text" class="ges-inp" id="gp-contacto" placeholder="Teléfono o mail (opcional)" maxlength="120">'+
    '<input type="text" class="ges-inp" id="gp-cuil" placeholder="CUIL o referencia (opcional)" maxlength="120">'+
    '<select class="ges-inp" id="gp-paq" aria-label="Paquete"><option value="">Paquete</option>'+gesPaqOpts()+'</select>'+
    '<button type="button" class="btn bp ges-btn-sm" onclick="gesProsAgregar()">Agregar</button></div>'+
    '<details class="ges-paste"><summary>Pegar varios desde Excel</summary>'+
    '<p class="ges-mini">Copiá las filas del Excel (nombre, teléfono o mail, CUIL o referencia y paquete, en cualquier orden) y pegalas acá. El paquete se reconoce escrito como en la lista (Sin paquete, Plus, Plus Gold, Eminent Black…).</p>'+
    '<textarea class="ges-inp" id="gp-paste" rows="4" oninput="gesPastePrev()" placeholder="Ana Pérez&#9;11 5555-1234&#9;27-12345678-3&#9;Plus Gold"></textarea>'+
    '<div class="ges-paste-res" id="gp-prev"></div>'+
    '<button type="button" class="btn bp ges-btn-sm" id="gp-paste-ok" onclick="gesPasteOk()" disabled>Agregar a la lista</button></details>';
}
// Prospectos pegados: el mismo lector que el de las bases de datos, con paquete
// y sin repetir los CUIL que ya están en la lista.
function gesPasteParse(t){return gesPersonasParse(t,true,GES.detPros||[]);}
function gesPastePrev(){
  var host=document.getElementById('gp-prev'),ta=document.getElementById('gp-paste');if(!host||!ta)return;
  var r=gesPasteParse(ta.value),ok=r.filter(function(x){return x.ok;}),mal=r.filter(function(x){return !x.ok;});
  var sinC=ok.filter(function(x){return !x.cuil&&!x.referencia;}).length;
  host.innerHTML=r.length?('<span class="ges-chip ges-c-ok">'+ok.length+' listos</span>'+
    (sinC?'<span class="ges-chip ges-c-warn">'+sinC+' sin CUIL ni referencia</span>':'')+
    (mal.length?'<span class="ges-chip ges-c-bad">'+mal.length+' con problemas: '+mal.slice(0,4).map(function(x){return gesE((x.nombre||'?')+' ('+x.motivo+')');}).join(', ')+(mal.length>4?'…':'')+'</span>':'')):'';
  var b=document.getElementById('gp-paste-ok');if(b){b.disabled=!ok.length;b.textContent=ok.length?'Agregar '+ok.length+' a la lista':'Agregar a la lista';}
}
function gesEstadoNuevo(){return GES.detG&&GES.detG.tipo==='datos'?'a_contactar':'prospecto';}
function gesPasteOk(){
  var ta=document.getElementById('gp-paste');if(!ta||!GES.detG)return;
  var r=gesPasteParse(ta.value),ok=r.filter(function(x){return x.ok;});if(!ok.length)return;
  var b=document.getElementById('gp-paste-ok');if(b){b.disabled=true;b.textContent='Agregando…';}
  var gid=GES.detG.id,est=gesEstadoNuevo();
  _sb.from('gestion_prospectos').insert(ok.map(function(x){return {gestion_id:gid,nombre:x.nombre,contacto:x.contacto,cuil:x.cuil,referencia:x.referencia,paquete:x.paquete,estado:est};})).select().then(function(res){
    if(res&&res.error){showToast('No se pudo agregar: '+gesErrTxt(res.error));gesPastePrev();return;}
    GES.detPros=GES.detPros.concat(res.data||[]);GES.lista=null;
    var mal=r.filter(function(x){return !x.ok;});
    gesDetPintar();
    // Lo que no entró queda en el cuadro para corregirlo.
    if(mal.length){
      var d=document.querySelector('.ges-paste');if(d)d.open=true;
      var t2=document.getElementById('gp-paste');if(t2){t2.value=mal.map(function(x){return [x.nombre||'',x.contacto||'',x.cuil?gesCuilFmt(x.cuil):(x.referencia||''),GES_PAQ_CORTO[x.paquete]||''].join('\t');}).join('\n');gesPastePrev();}
    }
    showToast((res.data||[]).length+' agregados'+(mal.length?'. Quedaron '+mal.length+' en el cuadro para corregir.':'.'));
  });
}
function gesProsAgregar(){
  var nom=gesVal('gp-nom').trim(),contacto=gesVal('gp-contacto').trim(),cr=gesCuilORef(gesVal('gp-cuil')),paq=gesVal('gp-paq');
  if(!nom){showToast('Escribí el nombre.');return;}
  if(cr.error){showToast(cr.error);return;}
  if(cr.cuil&&GES.detPros.some(function(p){return p.cuil===cr.cuil;})){showToast('Ese CUIL ya está en la lista.');return;}
  _sb.from('gestion_prospectos').insert({gestion_id:GES.detG.id,nombre:nom,contacto:contacto||null,cuil:cr.cuil||null,referencia:cr.referencia||null,paquete:paq||null,estado:gesEstadoNuevo()}).select().single().then(function(res){
    if(res&&res.error){showToast('No se pudo agregar: '+gesErrTxt(res.error));return;}
    GES.detPros.push(res.data);GES.lista=null;gesDetPintar();
    var n=document.getElementById('gp-nom');if(n)n.focus();
  });
}
// Pasar a Alta pregunta con qué paquete fue (si no lo tenía); pasar a
// Descartado, por qué. La base exige las dos cosas (045).
function gesProsCampo(i,campo,val){
  var p=GES.detPros[i];if(!p)return;
  var upd={};upd[campo]=(campo==='paquete'||campo==='proximo')?(val||null):val;
  var pre=Promise.resolve(true);
  if(campo==='estado'&&val==='alta'&&!p.paquete)
    pre=gesElegir('¿Con qué paquete fue el alta?',gesE(p.nombre),GES_PAQ).then(function(k){if(!k)return false;upd.paquete=k;return true;});
  else if(campo==='estado'&&val==='descartado'&&p.estado!=='descartado')
    pre=gesElegir('¿Por qué se descarta?',gesE(p.nombre),GES_MOTIVO).then(function(k){if(!k)return false;upd.motivo=k;return true;});
  else if(campo==='paquete'&&!val&&p.estado==='alta'){showToast('Un alta tiene que decir con qué paquete fue.');gesDetPintar();return;}
  pre.then(function(seguir){
    if(!seguir){gesDetPintar();return;}
    _sb.from('gestion_prospectos').update(upd).eq('id',p.id).select().single().then(function(res){
      if(res&&res.error){gesDetPintar();showToast('No se pudo guardar: '+gesErrTxt(res.error));return;}
      GES.detPros[i]=res.data;GES.lista=null;gesDetPintar();
      if(campo==='estado'&&val==='alta'&&p.estado!=='alta')showToast('Alta registrada ('+(GES_PAQ_CORTO[res.data.paquete]||'sin paquete')+'). Ya cuenta en el tablero.');
      if(campo==='estado'&&(val==='alta'||val==='descartado'))gesDetHilo();
    });
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
    gesModal('<h3 class="ges-mt">'+(realizada?(g.tipo==='datos'?'Terminar la base':'Completar la acción'):'Editar datos')+'</h3><p class="ges-ms">'+gesE(g.empresa)+' '+gesCuitHtml(g.cuit)+'</p>'+
      gesFormHtml(base,'editar')+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ges-ed-ok" onclick="gesEditarOk()">Guardar</button></div>');
    GES._ocupHun=g.hunter_id;GES._ocupExcl=g.id;
    gesOcupForm();
  });
}
function gesEditarOk(){
  var g=GES.detG;if(!g)return;
  var d=gesFormLeer('editar');
  if(d.estado==='realizada'&&d.fecha>gesHoy()&&d.tipo!=='datos'){showToast('Una acción realizada no puede tener fecha futura.');return;}
  if(d.frecuencia==='repite'&&g.veces&&d.veces===undefined)d.veces=g.veces; // serie ya armada: la cantidad no se toca
  var er=gesRepError(d)||gesHorError(d);if(er){showToast(er);return;}
  if(d.frecuencia==='repite'&&!g.vez)d.vez=1;
  var antes=g.estado;
  var b=document.getElementById('ges-ed-ok');if(b){b.disabled=true;b.textContent='Guardando…';}
  var cambioHora=d.fecha!==g.fecha||gesHora(d.hora_desde)!==gesHora(g.hora_desde)||gesHora(d.hora_hasta)!==gesHora(g.hora_hasta)||(antes==='cancelada'&&d.estado!=='cancelada');
  (cambioHora&&d.estado!=='cancelada'?gesChoque(g.hunter_id,d,g.id):Promise.resolve(true)).then(function(seguir){
  if(!seguir){if(b){b.disabled=false;b.textContent='Guardar';}return;}
  _sb.from('gestiones').update(d).eq('id',g.id).select().single().then(function(res){
    if(res&&res.error){if(b){b.disabled=false;b.textContent='Guardar';}showToast('No se pudo guardar: '+gesErrTxt(res.error));return;}
    gesCerrar();GES.detG=res.data;GES.lista=null;GES.ag.data=null;gesDetPintar();showToast('Guardado.');gesDetHilo();
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
  gesChoque(n.origen==='derivada'?n.hunter_id:yo,n).then(function(seguir){
    if(!seguir)return;
    _sb.from('gestiones').insert(n).select().single().then(function(res){
      if(res&&res.error){showToast('No se pudo crear: '+gesErrTxt(res.error));return;}
      GES.lista=null;GES.det=res.data.id;gesRender();
      showToast('Creada la próxima fecha: '+gesFecha(n.fecha)+'. Mismos datos, prospectos en cero.');
    });
  });
}
function gesBorrar(){
  var g=GES.detG;if(!g)return;
  fgConfirm('¿Eliminar esta gestión?\nSe borran también sus '+GES.detPros.length+' prospectos, la conversación y el historial. No se puede deshacer.',{ok:'Eliminar'}).then(function(ok){
    if(!ok)return;
    _sb.from('gestiones').delete().eq('id',g.id).then(function(res){
      if(res&&res.error){showToast('No se pudo eliminar: '+res.error.message);return;}
      GES.lista=null;gesVolver();showToast('Gestión eliminada.');
    });
  });
}

// ── Agenda ──────────────────────────────────────────────────────────────────
// La semana del hunter (lo que tiene que hacer, con horario y lugar) y, para el
// oficial, el líder y el admin, la grilla hunters × días para ver quién tiene
// lugar y asignarle. Lee la tabla directo: la RLS ya decide qué ve cada uno; al
// oficial, además, gestiones_ocupacion le dice en qué horarios NO hay lugar, sin
// decirle de qué se trata (la empresa viene tapada). Con el botón Semana / Mes
// la misma solapa muestra el mes entero.
var GES_DSEM=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
var GES_MESL=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function gesLunes(iso){var a=String(iso).split('-'),d=new Date(+a[0],+a[1]-1,+a[2]);d.setDate(d.getDate()-((d.getDay()+6)%7));return gesIso(d);}
function gesAgDias(lunes){var r=[];for(var i=0;i<7;i++)r.push(gesSumarDias(lunes,i));return r;}
// Primer y último día del mes 'AAAA-MM'.
function gesMesIni(m){return m+'-01';}
function gesMesFin(m){var a=m.split('-');return gesIso(new Date(+a[0],+a[1],0));}
function gesMesSumar(m,n){var a=m.split('-'),d=new Date(+a[0],+a[1]-1+n,1);return d.getFullYear()+'-'+gesP2(d.getMonth()+1);}
// Qué vista corresponde si el usuario todavía no eligió ninguna: el líder ve de
// entrada a TODO su equipo (es lo que necesita para repartir); los demás, la
// semana por horarios. Una vez que toca un botón, se recuerda lo que eligió.
function gesAgVerDef(){
  if(!GES.ag.ver)GES.ag.ver=(gesRol()==='lider'&&!gesEsAdmin())?'equipo':'sem';
  return GES.ag.ver;
}
function gesEnMes(){return gesAgVerDef()==='mes';}
// Qué rango de fechas se está mirando.
function gesAgRangoAct(){
  var a=GES.ag;
  if(gesEnMes()){var m=a.mes||gesHoy().slice(0,7);return {desde:gesMesIni(m),hasta:gesMesFin(m)};}
  var l=a.lunes||gesLunes(gesHoy());
  return {desde:l,hasta:gesSumarDias(l,6)};
}
// ¿Hay que pedir la ocupación tapada? Sólo el oficial: el líder y el admin ya ven
// todo lo de su gente por la RLS, y al hunter la base no le contesta.
function gesAgPideOcup(){var r=gesRol();return !gesEsAdmin()&&r!=='hunter'&&r!=='lider';}
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
  var a=GES.ag;gesAgVerDef();if(!a.lunes)a.lunes=gesLunes(gesHoy());if(!a.mes)a.mes=gesHoy().slice(0,7);
  var ran=gesAgRangoAct(),clave=a.ver+'|'+ran.desde;
  // El turno sube SIEMPRE, también cuando esto sale por memoria: si quedó un
  // pedido de otro período en el aire, su respuesta tiene que caer al vacío y no
  // pisar lo que se está mirando (ir a la semana que viene y volver enseguida).
  var turno=a.turno=(a.turno||0)+1;
  if(a.data&&a.dataL===clave&&!force)return Promise.resolve(a.data);
  var q=_sb.from('gestiones').select('id,empresa,cuit,tipo,modalidad,fecha,vence,hora_desde,hora_hasta,lugar,estado,hunter_id,dueno_id,creada_por,origen,lider_id,no_puede_at,visto_hunter,visto_dueno,prueba')
    .gte('fecha',ran.desde).lte('fecha',ran.hasta).order('fecha').limit(2000);
  if(gesRol()==='hunter')q=q.eq('hunter_id',gesYo());
  // Los horarios ocupados con otras empresas: sólo en la grilla de la semana (en
  // el mes serían ilegibles). Si falla, la agenda igual se muestra.
  var oc=(gesAgPideOcup()&&!gesEnMes())
    ? _sb.rpc('gestiones_ocupacion',{p_desde:ran.desde,p_hasta:ran.hasta}).then(function(r){return (r&&!r.error&&r.data)||[];},function(){return [];})
    : Promise.resolve([]);
  return Promise.all([q,gesAgExtras(),oc]).then(function(res){
    var r=res[0];
    if(r&&r.error)throw r.error;
    if(turno!==a.turno)return null; // llegó tarde: ya se pidió otro período
    // En la grilla, lo que tiene día y hunter; las bases de datos y lo "por asignar" van en las bandejas.
    a.data=((r&&r.data)||[]).filter(function(g){return g.tipo!=='datos'&&g.hunter_id;}).sort(gesAgOrden);
    // De la ocupación queda sólo lo ajeno: lo propio ya vino completo.
    var mios={};a.data.forEach(function(g){mios[g.id]=1;});
    a.ocup=res[2].filter(function(x){return !mios[x.id];}).sort(gesAgOrden);
    a.dataL=clave;a.extras=res[1];return a.data;
  });
}
// Bandejas de arriba de la agenda (no dependen de la semana):
//   hunter: para contactar hoy, bases de datos abiertas, lo que avisó que no puede;
//   oficial, líder, admin: por asignar, piden que se la pasen a otro, bases abiertas.
function gesAgExtras(){
  var vacio={bases:[],porAsignar:[],noPuede:[],hoy:[],avance:{},empresas:{}};
  try{return gesAgExtrasPedir();}catch(e){return Promise.resolve(vacio);} // las bandejas nunca traban la agenda
}
function gesAgExtrasPedir(){
  var esHun=gesRol()==='hunter',yo=gesYo(),hoy=gesHoy();
  var cols='id,empresa,cuit,tipo,fecha,vence,hora_desde,hora_hasta,estado,hunter_id,dueno_id,creada_por,lider_id,no_puede_at,no_puede_motivo,origen';
  var bas=_sb.from('gestiones').select(cols).eq('tipo','datos').eq('estado','planificada').order('fecha').limit(200);
  if(esHun)bas=bas.eq('hunter_id',yo);
  var pedidos=[gesFilas(bas)];
  // Tope a propósito (y no paginado): esto se vuelve a pedir en cada cambio de
  // semana o de mes. Con más de GES_DATOS_MAX, la ventana lo aclara.
  if(esHun)pedidos.push(Promise.resolve([]),Promise.resolve([]),
    gesFilas(_sb.from('gestion_prospectos').select('id,nombre,contacto,proximo,estado,gestion_id')
      .lte('proximo',hoy).in('estado',['a_contactar','prospecto','en_gestion']).order('proximo').order('id').limit(GES_DATOS_MAX)));
  else pedidos.push(
    gesFilas(_sb.from('gestiones').select(cols).is('hunter_id',null).eq('estado','planificada').order('fecha').limit(100)),
    gesFilas(_sb.from('gestiones').select(cols).not('no_puede_at','is',null).eq('estado','planificada').order('fecha').limit(100)),
    Promise.resolve([]));
  return Promise.all(pedidos).then(function(r){
    var x={bases:r[0],porAsignar:r[1],noPuede:r[2],hoy:r[3],avance:{},empresas:{}};
    // Avance de cada base (contactados / total) y empresa de cada "para contactar hoy".
    var ids=x.bases.map(function(g){return g.id;}),gids=x.hoy.map(function(p){return p.gestion_id;}).filter(function(id){return ids.indexOf(id)<0;});
    x.bases.forEach(function(g){x.empresas[g.id]=g.empresa;});
    return Promise.all([
      ids.length?gesTodas(function(a,b){return _sb.from('gestion_prospectos').select('id,gestion_id,estado').in('gestion_id',ids).order('id').range(a,b);}).catch(function(){return [];}):Promise.resolve([]),
      gids.length?gesFilas(_sb.from('gestiones').select('id,empresa').in('id',gids)):Promise.resolve([])
    ]).then(function(rr){
      rr[0].forEach(function(p){var v=x.avance[p.gestion_id]||(x.avance[p.gestion_id]={n:0,c:0,a:0});v.n++;if(p.estado!=='a_contactar')v.c++;if(p.estado==='alta')v.a++;});
      rr[1].forEach(function(g){x.empresas[g.id]=g.empresa;});
      return x;
    });
  }).catch(function(){return {bases:[],porAsignar:[],noPuede:[],hoy:[],avance:{},empresas:{}};});
}
// Si mientras carga se cambió de solapa o se abrió una acción, no se pinta: la
// agenda taparía lo que el usuario está mirando.
function gesAgenda(){gesAgCargar().then(function(l){if(l&&GES.tab==='agenda'&&!GES.det)gesAgPintar();}).catch(gesErr);}
function gesAgIr(n){
  var a=GES.ag;
  if(gesEnMes())a.mes=n===0?gesHoy().slice(0,7):gesMesSumar(a.mes||gesHoy().slice(0,7),n);
  else if(a.ver==='equipo'){
    // El día del equipo se mueve de a un día; si se sale de la semana, la cambia.
    var d=n===0?gesHoy():gesSumarDias(a.dia||gesHoy(),n);
    a.dia=d;a.lunes=gesLunes(d);
  }
  else {a.lunes=n===0?gesLunes(gesHoy()):gesSumarDias(a.lunes||gesLunes(gesHoy()),7*n);a.dia=null;}
  gesBody('<div class="ges-cargando">Cargando&hellip;</div>');gesAgenda();
}
// Semana / Día del equipo / Mes. Al cambiar, el período nuevo se para donde
// estaba el anterior, para no perder de vista lo que se estaba mirando.
function gesAgVer(v){
  var a=GES.ag;if(a.ver===v)return;
  var ancla=gesEnMes()?(a.mes===gesHoy().slice(0,7)?gesHoy():gesMesIni(a.mes||gesHoy().slice(0,7))):(a.dia||a.lunes||gesHoy());
  if(v==='mes')a.mes=ancla.slice(0,7);
  else {a.lunes=gesLunes(ancla);a.dia=(v==='equipo')?ancla:null;}
  a.ver=v;
  try{localStorage.setItem('fg_ges_agver',v);}catch(e){}
  gesBody('<div class="ges-cargando">Cargando&hellip;</div>');gesAgenda();
}
// Rótulo: "27 al 2 de nov", "Jueves 30 de oct" o "Noviembre 2026".
function gesAgTitulo(dias){
  var a=GES.ag;
  if(gesEnMes()){
    var m=(a.mes||gesHoy().slice(0,7)).split('-');
    return GES_MESL[+m[1]-1].charAt(0).toUpperCase()+GES_MESL[+m[1]-1].slice(1)+' '+m[0];
  }
  if(a.ver==='equipo'&&a.dia)return gesFecha(a.dia);
  return gesAgRango(dias[0],dias[dias.length-1]);
}
function gesAgDia(d){GES.ag.dia=d;gesAgPintar();}
function gesAgBloque(g,corto){
  var h=gesHorario(g),nueva=gesNueva(g),np=g.no_puede_at&&g.estado==='planificada',cls='ges-ag-b est-'+g.estado+(nueva?' nueva':'')+(np?' nopuede':'');
  var tit=GES_TIPO[g.tipo]+' · '+g.empresa+(g.cuit?' · '+gesCuitTxt(g.cuit):'')+(g.lugar?' · '+g.lugar:'')+(gesRol()!=='hunter'?' · '+gesNom(g.hunter_id):'')+(np?' · pidió que se la pasen a otro':'');
  if(corto)return '<button type="button" class="'+cls+'" title="'+_escAttr(tit)+'" onclick="gesAbrirDet(\''+g.id+'\')">'+
    '<span class="ges-ag-h">'+(h?gesE(gesAgCorto(g)):'Sin horario')+'</span><span class="ges-ag-e">'+gesE(g.empresa)+'</span></button>';
  return '<button type="button" class="'+cls+'" title="'+_escAttr(tit)+'" onclick="gesAbrirDet(\''+g.id+'\')">'+
    '<span class="ges-ag-h">'+(h?gesE(h):'Sin horario')+(g.estado==='realizada'?' &middot; Realizada':g.estado==='cancelada'?' &middot; Cancelada':'')+'</span>'+
    '<span class="ges-ag-e">'+gesE(g.empresa)+'</span>'+
    '<span class="ges-ag-t">'+GES_TIPO[g.tipo]+(g.modalidad==='virtual'?' virtual':'')+(g.lugar?' &middot; '+gesE(g.lugar):'')+'</span>'+
    (gesRol()!=='hunter'?'<span class="ges-ag-t">Hunter: '+gesE(gesNom(g.hunter_id))+'</span>':'')+
    (g.prueba?'<span class="ges-prueba">prueba</span>':'')+
    (np?'<span class="ges-ag-nueva">'+(g.hunter_id===gesYo()?'Avisaste que no podés':'No puede ir')+'</span>':nueva?'<span class="ges-ag-nueva">Nueva</span>':'')+
  '</button>';
}
// Bandejas: "Para contactar hoy", "Bases para trabajar", "Por asignar", "Piden que se la pasen a otro".
function gesAgBandas(){
  var x=GES.ag.extras;if(!x)return '';
  var esHun=gesRol()==='hunter',hoy=gesHoy(),h='';
  var item=function(id,tit,sub,boton,reasig){
    return '<button type="button" class="ges-band-i" onclick="gesAbrirDet(\''+id+'\',false,'+(reasig?'true':'false')+')"><span><b>'+tit+'</b><span class="ges-mini">'+sub+'</span></span>'+(boton?'<span class="ges-link">'+boton+'</span>':'')+'</button>';
  };
  var cuando=function(g){return gesE(gesFecha(g.fecha))+(gesHorario(g)?' '+gesE(gesHorario(g)):'');};
  var mas=function(l,n){return l.length>n?'<span class="ges-mini">Y '+(l.length-n)+' más.</span>':'';};
  if(esHun&&x.hoy.length)h+='<section class="ges-band info"><h4>Para contactar ('+x.hoy.length+')</h4><div class="ges-band-l">'+x.hoy.slice(0,6).map(function(p){
    return gesContactarItem(p,x.empresas,hoy);
  }).join('')+(x.hoy.length>6?'<button type="button" class="ges-band-mas" onclick="gesContactarTodas()">Ver todas ('+x.hoy.length+')</button>':'')+'</div></section>';
  if(!esHun&&x.porAsignar.length)h+='<section class="ges-band warn"><h4>Por asignar ('+x.porAsignar.length+')</h4><div class="ges-band-l">'+x.porAsignar.slice(0,6).map(function(g){
    return item(g.id,gesE(g.empresa),(GES_TIPO[g.tipo]||'')+' &middot; '+(g.tipo==='datos'?'base de datos':cuando(g))+' &middot; de '+gesE(gesNom(g.creada_por)),gesPuedeReasignar(g)?'Asignar':'',true);
  }).join('')+mas(x.porAsignar,6)+'</div></section>';
  var np=x.noPuede.filter(function(g){return g.hunter_id;});
  if(np.length)h+='<section class="ges-band warn"><h4>'+(esHun?'Avisaste que no podés ('+np.length+')':'Piden que se la pasen a otro ('+np.length+')')+'</h4><div class="ges-band-l">'+np.slice(0,6).map(function(g){
    return item(g.id,gesE(g.empresa),(esHun?'':gesE(gesNom(g.hunter_id))+' &middot; ')+cuando(g)+(g.no_puede_motivo?' &middot; '+gesE(g.no_puede_motivo):''),!esHun&&gesPuedeReasignar(g)?'Cambiar hunter':'',!esHun);
  }).join('')+mas(np,6)+'</div></section>';
  var bs=x.bases.filter(function(g){return g.hunter_id;});
  if(bs.length)h+='<section class="ges-band"><h4>Bases para trabajar ('+bs.length+')</h4><div class="ges-band-l">'+bs.slice(0,6).map(function(g){
    var v=x.avance[g.id]||{n:0,c:0,a:0};
    return item(g.id,gesE(g.empresa),(esHun?'':gesE(gesNom(g.hunter_id))+' &middot; ')+v.c+' de '+v.n+' contactados'+(v.a?' &middot; '+v.a+(v.a===1?' alta':' altas'):'')+(g.vence?' &middot; <span'+(g.vence<hoy?' class="ges-pisa"':'')+'>hasta el '+gesE(gesFecha(g.vence))+'</span>':''),'Abrir');
  }).join('')+mas(bs,6)+'</div></section>';
  return h?'<div class="ges-bands">'+h+'</div>':'';
}
// Una persona de "Para contactar": abre su acción y la deja marcada en la lista.
function gesContactarItem(p,empresas,hoy){
  var atras=gesDias(p.proximo,hoy);
  return '<button type="button" class="ges-band-i" onclick="gesAbrirDet(\''+p.gestion_id+'\',false,false,\''+p.id+'\')">'+
    '<span><b>'+gesE(p.nombre)+'</b><span class="ges-mini">'+gesE(empresas[p.gestion_id]||'')+
      (p.contacto?' &middot; '+gesE(p.contacto):'')+
      (atras>0?' &middot; <span class="ges-pisa">desde el '+gesE(gesFecha(p.proximo))+'</span>':'')+'</span></span>'+
    '<span class="ges-link">Abrir</span></button>';
}
// Días entre dos fechas ISO (b - a), 0 si alguna falta.
function gesDias(a,b){
  if(!a||!b)return 0;
  return Math.round((Date.parse(b+'T00:00:00')-Date.parse(a+'T00:00:00'))/86400000);
}
// Ventana con TODAS las personas para contactar: las vencidas primero y después
// las de hoy. Las de fecha futura no entran (decisión del dueño).
function gesContactarTodas(){
  var x=GES.ag.extras;if(!x||!x.hoy)return;
  var hoy=gesHoy(),emp=x.empresas||{};
  var vencidas=x.hoy.filter(function(p){return p.proximo<hoy;}),deHoy=x.hoy.filter(function(p){return p.proximo>=hoy;});
  var tope=x.hoy.length>=GES_DATOS_MAX?'<p class="ges-ms">Son muchas: se muestran las primeras '+gesN(GES_DATOS_MAX)+'.</p>':'';
  var grupo=function(tit,sub,l){
    if(!l.length)return '';
    return '<h4 class="ges-grupo">'+tit+' ('+l.length+')<span class="ges-mini">'+sub+'</span></h4>'+
      '<div class="ges-band-l">'+l.map(function(p){return gesContactarItem(p,emp,hoy);}).join('')+'</div>';
  };
  gesModal('<h3 class="ges-mt">Para contactar</h3>'+
    '<p class="ges-ms">Las personas a las que les pusiste fecha de pr&oacute;ximo contacto. Toc&aacute; una y se abre su acci&oacute;n con esa persona marcada.</p>'+tope+
    '<div class="ges-contactar">'+
      grupo('Vencidas','ten&iacute;an fecha anterior a hoy',vencidas)+
      grupo('Hoy','les toca hoy',deHoy)+
    '</div>'+
    '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cerrar</button></div>',true);
}
function gesAgPintar(){
  var a=GES.ag,l=a.data||[],hoy=gesHoy(),mes=gesEnMes(),eq=gesAgVerDef()==='equipo',dias=gesAgDias(a.lunes);
  if(eq&&!a.dia)a.dia=hoy;
  if(!mes){
    if(!l.some(function(g){return g.fecha===dias[6];}))dias=dias.slice(0,6); // el domingo, sólo si hay algo
    if(!a.dia||dias.indexOf(a.dia)<0)a.dia=dias.indexOf(hoy)>=0?hoy:dias[0];
  }
  var esHun=gesRol()==='hunter';
  var que=mes?'Mes':eq?'Día':'Semana';
  var tool='<div class="ges-ag-tool"><div class="ges-ag-nav">'+
      '<button type="button" class="btn bg ges-btn-sm" onclick="gesAgIr(-1)" aria-label="'+que+' anterior" title="'+que+' anterior">&larr;</button>'+
      '<button type="button" class="btn bg ges-btn-sm" onclick="gesAgIr(0)">Hoy</button>'+
      '<button type="button" class="btn bg ges-btn-sm" onclick="gesAgIr(1)" aria-label="'+que+' siguiente" title="'+que+' siguiente">&rarr;</button>'+
      '<span class="ges-ag-rango">'+gesE(gesAgTitulo(dias))+'</span></div>'+
    '<div class="ges-ag-acts">'+
      '<div class="ges-ag-ver" role="group" aria-label="C&oacute;mo ver la agenda">'+
        '<button type="button" aria-pressed="'+(!mes&&!eq)+'" onclick="gesAgVer(\'sem\')">Semana</button>'+
        (esHun?'':'<button type="button" aria-pressed="'+eq+'" onclick="gesAgVer(\'equipo\')">D&iacute;a del equipo</button>')+
        '<button type="button" aria-pressed="'+mes+'" onclick="gesAgVer(\'mes\')">Mes</button></div>'+
      (esHun?'<button type="button" class="btn bp ges-btn-sm" onclick="gesAgendar()">+ Agendar</button>':
        '<button type="button" class="btn bg ges-btn-sm" onclick="gesAgPegar()">Pegar desde Excel</button>'+
        '<button type="button" class="btn bp ges-btn-sm" onclick="gesAgendar()">+ Asignar</button>')+
    '</div></div>';
  var pills=(!mes&&eq)?'<div class="ges-ag-pills" role="tablist">'+dias.map(function(d,i){
      return '<button type="button" role="tab" aria-selected="'+(d===a.dia)+'" aria-pressed="'+(d===a.dia)+'" onclick="gesAgDia(\''+d+'\')">'+GES_DSEM[i]+'<b>'+(+d.slice(8))+'</b></button>';
    }).join('')+'</div>':'';
  gesBody(tool+gesAgBandas()+pills+(mes?gesAgMes(l,hoy):eq?gesAgDiaEquipo(a.dia,l,hoy):gesAgHoras(dias,l,hoy)));
}
// Calendario del mes: lunes a domingo, con los días de los meses de al lado
// apagados. Cada día lista sus acciones cortas, como las casillas de la grilla.
function gesAgMes(l,hoy){
  var a=GES.ag,m=a.mes||hoy.slice(0,7),ini=gesMesIni(m),fin=gesMesFin(m);
  var desde=gesLunes(ini),filas=[],d=desde;
  while(d<=fin||gesDias(desde,d)%7!==0)filas.push(d),d=gesSumarDias(d,1);
  var items=a.hun?l.filter(function(g){return g.hunter_id===a.hun;}):l;
  var cel=filas.map(function(f){
    var its=items.filter(function(g){return g.fecha===f;});
    return '<div class="ges-mes-d'+(f<ini||f>fin?' otro':'')+(f===hoy?' hoy':'')+'">'+
      '<span class="ges-mes-n">'+(+f.slice(8))+(f===hoy?' &middot; hoy':'')+'</span>'+
      its.map(function(g){return gesAgBloque(g,true);}).join('')+'</div>';
  }).join('');
  var filtro=(gesRol()==='hunter')?'':gesAgFiltroHunter();
  var vacio=!items.length?'<p class="ges-nota">'+(gesRol()==='hunter'?'Este mes no ten&eacute;s nada agendado.':'No hay nada agendado este mes.')+'</p>':'';
  return (filtro?'<div class="ges-filtros">'+filtro+'<span class="ges-mini ges-ag-ley">En el mes se ve lo que ten&eacute;s cargado. Para ver los horarios y d&oacute;nde hay lugar, pas&aacute; a <b>Semana</b> o <b>D&iacute;a del equipo</b>.</span></div>':'')+
    '<div class="ges-card ges-pad"><div class="ges-mes">'+
    GES_DSEM.map(function(n){return '<div class="ges-mes-h">'+n+'</div>';}).join('')+cel+'</div></div>'+vacio;
}
// Selector "Hunter: todos / uno", compartido por la grilla de la semana y el mes.
function gesAgFiltroHunter(todos){
  var a=GES.ag,ids=todos||gesHunters(gesRol()==='lider'&&!gesEsAdmin());
  return '<label class="ges-ag-fil"><span class="ges-lbl">Hunter</span><select class="ges-inp ges-sel" onchange="GES.ag.hun=this.value;gesAgPintar()"><option value="">Todos</option>'+
    ids.map(function(id){return '<option value="'+_escAttr(id)+'"'+(id===a.hun?' selected':'')+'>'+gesE(gesNom(id))+'</option>';}).join('')+'</select></label>';
}
// Un horario ocupado con una empresa que quien mira no puede ver: no es un botón,
// no hay nada que abrir. Va en rojo: es tiempo que NO está disponible.
function gesAgOcupado(x){
  return '<span class="ges-ag-ocup" title="Ocupado: ya tiene algo a esa hora">'+
    '<span class="ges-ag-h">'+(gesAgCorto(x)?gesE(gesAgCorto(x)):'Sin horario')+'</span><span>Ocupado</span></span>';
}

// ── Agenda por horarios (como un calendario) ────────────────────────────────
// Dos vistas: la SEMANA de una persona (horas × días) y el DÍA del equipo
// (hunters × horas). La franja va de 8 a 18, y se estira sola si hay algo
// fuera de ese rango para que nunca quede nada escondido.
var GES_H0=8,GES_H1=18,GES_HH=46;
function gesHorRango(l){
  var h0=GES_H0,h1=GES_H1;
  (l||[]).forEach(function(g){
    var a=gesMin(g.hora_desde);if(a==null)return;
    var b=gesMin(g.hora_hasta);if(b==null||b<=a)b=Math.min(a+60,1440);
    h0=Math.min(h0,Math.floor(a/60));h1=Math.max(h1,Math.ceil(b/60));
  });
  if(h1<=h0)h1=h0+1;
  return [Math.max(0,h0),Math.min(24,h1)];
}
// Lo que se pisa se reparte en columnas, para que no se tapen entre sí. Las
// columnas se cuentan por grupo de superposición: una sola acción ocupa todo.
function gesHorColumnas(items){
  var l=(items||[]).filter(function(g){return gesMin(g.hora_desde)!=null;})
    .map(function(g){var a=gesMin(g.hora_desde),b=gesMin(g.hora_hasta);if(b==null||b<=a)b=a+60;return {g:g,a:a,b:b};})
    .sort(function(x,y){return x.a-y.a||x.b-y.b;});
  var out=[],grupo=[],finG=-1,fin=[];
  var cerrar=function(){
    var n=Math.max(1,fin.length);
    grupo.forEach(function(x){x.n=n;out.push(x);});
    grupo=[];fin=[];
  };
  l.forEach(function(x){
    if(grupo.length&&x.a>=finG)cerrar();
    var c=0;while(fin[c]!=null&&fin[c]>x.a)c++;
    fin[c]=x.b;x.col=c;grupo.push(x);
    finG=Math.max(finG===-1?x.b:finG,x.b);
    if(grupo.length===1)finG=x.b;
  });
  if(grupo.length)cerrar();
  return out;
}
function gesHorEtiqueta(h){return (h<10?'0':'')+h+':00';}
// Una columna de día con sus bloques puestos a la hora que van.
function gesHorCol(d,items,h0,h1,clic,hi,soloVer){
  var alto=(h1-h0)*GES_HH;
  var cols=gesHorColumnas(items);
  var html=cols.map(function(x){
    var g=x.g,top=(x.a-h0*60)*GES_HH/60,alt=Math.max(20,(x.b-x.a)*GES_HH/60);
    var ancho=100/x.n,izq=ancho*x.col;
    var tapado=!!g._tapado;
    var cls='ges-hb'+(tapado?' tapado':' est-'+g.estado)+(g.no_puede_at&&g.estado==='planificada'?' nopuede':'');
    var tit=tapado?'Ocupado: ya tiene algo a esa hora':(GES_TIPO[g.tipo]+' · '+(g.empresa||'')+(g.lugar?' · '+g.lugar:''));
    var cuerpo='<span class="ges-hb-h">'+gesE(gesAgCorto(g)||'')+'</span>'+
      '<span class="ges-hb-e">'+(tapado?'Ocupado':gesE(g.empresa||''))+'</span>';
    if(tapado||soloVer)return '<span class="'+cls+'" style="top:'+top+'px;height:'+alt+'px;left:'+izq+'%;width:'+ancho+'%" title="'+_escAttr(tit)+'">'+cuerpo+'</span>';
    return '<button type="button" class="'+cls+'" style="top:'+top+'px;height:'+alt+'px;left:'+izq+'%;width:'+ancho+'%" title="'+_escAttr(tit)+'" onclick="event.stopPropagation();gesAbrirDet(\''+g.id+'\')">'+cuerpo+'</button>';
  }).join('');
  var on=clic?' onclick="'+clic+'(event,\''+d+'\','+(hi==null?'null':hi)+')" role="button" tabindex="0" title="Tocá un hueco libre para asignar algo a esa hora"':'';
  return '<div class="ges-hcol'+(clic?' clicable':'')+'" data-d="'+d+'" data-h0="'+h0+'" style="height:'+alto+'px"'+on+'>'+html+'</div>';
}
// De dónde se tocó a qué hora (redondeado a la media hora de arriba).
function gesHorClicMin(ev,h0){
  var c=ev.currentTarget,r=c.getBoundingClientRect();
  var y=Math.max(0,Math.min(r.height-1,(ev.clientY||0)-r.top));
  var m=h0*60+Math.floor(y/GES_HH*60);
  return Math.floor(m/30)*30;
}
function gesHorHHMM(m){return gesP2(Math.floor(m/60))+':'+gesP2(m%60);}

// Vista 1: la semana de UNA persona, horas × días.
function gesAgHoras(dias,l,hoy){
  var a=GES.ag,esHun=gesRol()==='hunter';
  var quien=esHun?gesYo():(a.hun||null);
  var todos=gesHunters(gesRol()==='lider'&&!gesEsAdmin());
  (l||[]).concat(a.ocup||[]).forEach(function(g){if(g.hunter_id&&todos.indexOf(g.hunter_id)<0)todos.push(g.hunter_id);});
  if(!esHun&&!quien&&todos.length){quien=todos[0];a.hun=quien;}
  var propias=(l||[]).filter(function(g){return !quien||g.hunter_id===quien;});
  var tapadas=(a.ocup||[]).filter(function(g){return !quien||g.hunter_id===quien;}).map(function(g){g._tapado=true;return g;});
  var items=propias.concat(tapadas);
  var r=gesHorRango(items),h0=r[0],h1=r[1];
  var horas='';for(var h=h0;h<h1;h++)horas+='<div class="ges-hhora" style="height:'+GES_HH+'px"><span>'+gesHorEtiqueta(h)+'</span></div>';
  var sinH=dias.map(function(d){
    var s=items.filter(function(g){return g.fecha===d&&gesMin(g.hora_desde)==null;});
    return '<div class="ges-hsin">'+s.map(function(g){return gesAgBloque(g,true);}).join('')+'</div>';
  }).join('');
  var haySin=items.some(function(g){return gesMin(g.hora_desde)==null;});
  var cols=dias.map(function(d,i){
    return gesHorCol(d,items.filter(function(g){return g.fecha===d;}),h0,h1,esHun?'gesHorClicPropio':'gesHorClicAsignar',null);
  }).join('');
  var head=dias.map(function(d,i){return '<div class="ges-hth'+(d===hoy?' hoy':'')+'">'+GES_DSEM[i]+' <b>'+(+d.slice(8))+'</b></div>';}).join('');
  var sel=esHun?'':'<label class="ges-ag-fil"><span class="ges-lbl">Agenda de</span><select class="ges-inp ges-sel" onchange="GES.ag.hun=this.value;gesAgPintar()">'+
    todos.map(function(id){return '<option value="'+_escAttr(id)+'"'+(id===quien?' selected':'')+'>'+gesE(gesNom(id))+'</option>';}).join('')+'</select></label>';
  if(!esHun&&!todos.length)return '<div class="ges-vacio">'+(gesRol()==='lider'?'Todavía no tenés hunters en tu equipo. El administrador los asigna en Admin &rarr; Usuarios &rarr; &laquo;Líder a cargo&raquo;.':'No hay hunters activos.')+'</div>';
  var ley=esHun?'Tocá un hueco libre para agendar algo a esa hora.':
    'Tocá un hueco libre para asignarle algo a esa hora.'+(gesAgPideOcup()?' En <b class="ges-rojo">rojo</b>, horarios ya ocupados con empresas que no son tuyas: ves que no hay lugar, no de qué se trata.':'');
  return (sel?'<div class="ges-filtros">'+sel+'<span class="ges-mini ges-ag-ley">'+ley+'</span></div>':'<p class="ges-nota">'+ley+'</p>')+
    '<div class="ges-card ges-hor" style="--n:'+dias.length+'"><div class="ges-hin">'+
      '<div class="ges-hhead"><div class="ges-hesq"></div>'+head+'</div>'+
      (haySin?'<div class="ges-hhead ges-hsins"><div class="ges-hesq"><span class="ges-mini">Sin horario</span></div>'+sinH+'</div>':'')+
      '<div class="ges-hbody"><div class="ges-hhoras">'+horas+'</div><div class="ges-hcols">'+cols+'</div></div>'+
    '</div></div>';
}
function gesHorClicAsignar(ev,d){
  var m=gesHorClicMin(ev,+ev.currentTarget.getAttribute('data-h0'));
  var hs=GES._agHun||[],i=hs.indexOf(GES.ag.hun);
  gesAgendar(i>=0?i:null,d,gesHorHHMM(m),GES.ag.hun||null);
}
function gesHorClicPropio(ev,d){
  var m=gesHorClicMin(ev,+ev.currentTarget.getAttribute('data-h0'));
  gesAgendar(null,d,gesHorHHMM(m));
}

// Vista 2: el día del equipo, hunters × horas. Para ver de un vistazo quién
// tiene lugar a cada hora.
function gesAgDiaEquipo(dia,l,hoy){
  var a=GES.ag,ps=GES.personas||{},ocup=a.ocup||[];
  var hs=gesHunters(gesRol()==='lider'&&!gesEsAdmin());
  l.concat(ocup).forEach(function(g){if(g.hunter_id&&hs.indexOf(g.hunter_id)<0)hs.push(g.hunter_id);});
  GES._agHun=hs;
  if(!hs.length)return '<div class="ges-vacio">'+(gesRol()==='lider'?'Todavía no tenés hunters en tu equipo. El administrador los asigna en Admin &rarr; Usuarios &rarr; &laquo;Líder a cargo&raquo;.':'No hay hunters activos.')+'</div>';
  var deHoy=l.filter(function(g){return g.fecha===dia&&g.estado!=='cancelada';});
  var ocHoy=ocup.filter(function(g){return g.fecha===dia;}).map(function(g){g._tapado=true;return g;});
  var todo=deHoy.concat(ocHoy);
  var r=gesHorRango(todo),h0=r[0],h1=r[1];
  var head='<tr><th class="nom">Hunter</th>';
  for(var h=h0;h<h1;h++)head+='<th>'+gesHorEtiqueta(h)+'</th>';
  head+='</tr>';
  var filas=hs.map(function(id,hi){
    var suyas=todo.filter(function(g){return g.hunter_id===id;});
    // Qué ocupa cada hora; después las horas seguidas de lo mismo se unen en
    // una sola celda, para que el nombre de la empresa no se repita.
    var porHora=[],h;
    for(h=h0;h<h1;h++){
      var a0=h*60,a1=a0+60;
      porHora.push(suyas.filter(function(g){
        var x=gesMin(g.hora_desde);if(x==null)return false;
        var y=gesMin(g.hora_hasta);if(y==null||y<=x)y=x+60;
        return x<a1&&y>a0;
      })[0]||null);
    }
    var f='<tr><td class="nom">'+gesE(gesNom(id))+(ps[id]&&ps[id].es_prueba?' <span class="ges-prueba">prueba</span>':'')+'</td>';
    var i=0;
    while(i<porHora.length){
      var g=porHora[i],n=1;
      while(i+n<porHora.length&&((g&&porHora[i+n]&&porHora[i+n].id===g.id)||(!g&&!porHora[i+n])))n++;
      var cs=n>1?' colspan="'+n+'"':'';
      if(!g){
        for(var k=0;k<n;k++){
          var hh=gesHorEtiqueta(h0+i+k);
          f+='<td class="libre"><button type="button" title="Libre: asignarle algo a las '+hh+'" onclick="gesAgendar('+hi+',\''+dia+'\',\''+hh+'\')">Libre</button></td>';
        }
      }else{
        var tap=!!g._tapado;
        f+='<td'+cs+' class="'+(tap?'tapado':'ocupado')+'" title="'+_escAttr(tap?'Ocupado: ya tiene algo a esa hora':((GES_TIPO[g.tipo]||'')+' · '+(g.empresa||'')))+'">'+
          (tap?'<span>Ocupado</span>':'<button type="button" onclick="gesAbrirDet(\''+g.id+'\')">'+gesE(g.empresa||'')+'</button>')+'</td>';
      }
      i+=n;
    }
    return f+'</tr>';
  }).join('');
  var ley='Tocá <b>Libre</b> para asignarle algo a esa hora.'+(gesAgPideOcup()?' En <b class="ges-rojo">rojo</b>, horarios ocupados con empresas que no son tuyas.':'');
  return '<div class="ges-filtros"><span class="ges-mini ges-ag-ley">'+ley+'</span></div>'+
    '<div class="ges-card"><div class="ges-tw"><table class="ges-eqh">'+head+filas+'</table></div></div>';
}

// ── Agendar (hunter) / Asignar (oficial, líder, admin) ──────────────────────
// hi = índice del hunter en la grilla (o null); hora = "10:00" si se tocó un
// hueco de la agenda; hun = id del hunter cuando no viene por índice.
function gesAgendar(hi,fecha,hora,hun){
  var esHun=gesRol()==='hunter';
  GES._agEmp=null;GES._agEmps=[];
  gesPersonas().then(function(){
    var quien=hun||((hi!=null&&GES._agHun)?GES._agHun[hi]:'');
    var pre={fecha:fecha||gesHoy(),tipo:'posicion',estado:'planificada',hunter_id:quien||''};
    if(hora){pre.hora_desde=hora;pre.hora_hasta=gesHorHHMM(Math.min(23*60+59,(gesMin(hora)||0)+60));}
    gesModal('<h3 class="ges-mt">'+(esHun?'Agendar':'Asignar a un hunter')+'</h3>'+
      '<p class="ges-ms">'+(esHun?'Queda en tu agenda como planificada. Después la marcás como realizada y cargás los prospectos.':'Le aparece en su agenda y en la marca de su avatar.')+'</p>'+
      '<div class="ges-form ges-form-emp"><label class="full"><span>Empresa</span><input type="search" id="gf-emp" class="ges-inp" placeholder="Buscá por razón social o CUIT" autocomplete="off" oninput="gesAgEmpBuscar()"></label>'+
      '<div class="full ges-emp-res" id="gf-emp-res"></div></div>'+
      gesFormHtml(pre,esHun?'agendar':'asignar')+
      '<div class="ges-foot"><button type="button" class="btn bg" onclick="gesCerrar()">Cancelar</button>'+
      '<button type="button" class="btn bp" id="ges-ag-ok" onclick="gesAgendarOk()">'+(esHun?'Agendar':'Asignar')+'</button></div>',!esHun);
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
        return '<button type="button" onclick="gesAgEmpElegir('+i+')">'+gesE(e.empresa)+' '+gesCuitHtml(e.cuits)+' <span class="ges-mini">&middot; '+gesE(gesNom(e.dueno_id))+'</span></button>';
      }).join(''):'<span class="ges-mini">Ninguna empresa de la base coincide.</span>';
    });
  },200);
}
function gesAgEmpElegir(i){
  var e=GES._agEmps&&GES._agEmps[i];if(!e)return;
  GES._agEmp=e;var inp=document.getElementById('gf-emp');if(inp)inp.value=e.empresa;
  var h=document.getElementById('gf-emp-res');if(h)h.innerHTML='<span class="ges-chip ges-c-ok">Empresa de '+gesE(gesNom(e.dueno_id))+(gesCuitTxt(e.cuits)?' &middot; '+gesE(gesCuitTxt(e.cuits)):'')+'</span>';
}
function gesAgendarOk(){
  var e=GES._agEmp;if(!e){showToast('Elegí la empresa de la lista.');return;}
  var esHun=gesRol()==='hunter',d=gesFormLeer(esHun?'agendar':'asignar');
  var er=(esHun?null:gesAsigError(d))||gesRepError(d)||gesHorError(d);if(er){showToast(er);return;}
  var lista=d.tipo==='datos'?gesDatosOk():null;
  if(d.tipo==='datos'&&!lista.length){showToast('Pegá al menos una persona para contactar.');return;}
  if(d.frecuencia==='repite')d.vez=1;
  d.empresa=e.empresa;d.dueno_id=e.dueno_id;d.origen=esHun?'propia':'derivada';
  if(esHun)d.hunter_id=gesYo();
  var b=document.getElementById('ges-ag-ok'),txt=b?b.textContent:'';
  if(b){b.disabled=true;b.textContent='Guardando…';}
  gesGuardarNueva(d,lista,function(){if(b){b.disabled=false;b.textContent=txt;}},function(g,n){
    gesCerrar();GES.lista=null;GES.ag.data=null;
    showToast(esHun?'Agendada'+(n>0?', con las '+(n+1)+' fechas':'')+'.':gesAsignadaTxt(d,n,lista).replace(/^Derivada/,'Asignada'));
    if(d.tipo!=='datos'&&d.hunter_id){GES.ag.lunes=gesLunes(d.fecha);GES.ag.mes=d.fecha.slice(0,7);GES.ag.dia=d.fecha;}
    GES.tab='agenda';GES.det=null;gesRender();
  });
}

// ── Superposición de horarios ───────────────────────────────────────────────
// La base devuelve todo lo de ese hunter ese día (gestiones_ocupado): un
// oficial no ve las gestiones de otros oficiales con el mismo hunter, pero sí
// tiene que saber que está ocupado (sale "otra acción", sin la empresa).
// Desde la 045 la base no deja pisar un horario: sólo el admin o el líder de
// ese hunter pueden guardar igual. A los demás se les muestra quién está libre.
function gesOcupTxt(x){return (gesHorario(x)||'sin horario')+' '+(x.empresa?'en '+x.empresa:'(otra acción)');}
// Promesa: true = guardar.
function gesChoque(hunter,d,excluir){
  if(!hunter||!d.hora_desde||!d.fecha||d.estado==='cancelada'||d.tipo==='datos')return Promise.resolve(true);
  return _sb.rpc('gestiones_ocupado',{p_hunter:hunter,p_fecha:d.fecha}).then(function(r){
    var l=((r&&r.data)||[]).filter(function(x){return x.id!==excluir&&x.tipo!=='datos'&&gesSePisan(x,d);});
    if(!l.length)return true;
    var quien=hunter===gesYo()?'Ya tenés algo a esa hora':gesNom(hunter)+' ya tiene algo a esa hora';
    var txt=l.map(gesOcupTxt).join(', ')+', el '+gesFecha(d.fecha);
    if(gesPuedeForzar(hunter))return fgConfirm(quien+'\n'+txt+'. ¿Guardar igual?',{ok:'Guardar igual',cancelar:'Cambiar el horario',peligro:false});
    showToast(quien+' ('+txt+'). Cambiá el horario'+(document.getElementById('gf-hunter')?' o elegí otro hunter':'')+'.');
    gesOcupForm();
    return false;
  }).catch(function(){return true;}); // sin red no se frena acá (igual lo frena la base)
}
// Hunters libres en un tramo (para sugerir otro cuando el elegido está ocupado).
function gesLibres(fecha,desde,hasta,menos){
  return _sb.rpc('gestiones_dia',{p_fecha:fecha}).then(function(r){
    var oc=(r&&!r.error&&r.data)||[],me={hora_desde:desde,hora_hasta:hasta};
    return gesHunters(gesRol()==='lider'&&!gesEsAdmin()).filter(function(id){
      return id!==menos&&!oc.some(function(x){return x.hunter_id===id&&gesSePisan(x,me);});
    });
  },function(){return [];});
}
// Debajo del formulario: qué tiene ese hunter ese día, qué se pisa y, si no se
// puede guardar así, quién está libre a esa hora.
function gesOcupForm(){
  var host=document.getElementById('gf-ocup');if(!host)return;
  var hs=document.getElementById('gf-hunter');
  var hun=hs?hs.value:(GES._ocupHun||gesYo()),fecha=gesVal('gf-fecha'),excl=GES._ocupExcl||null;
  if(!hun||hun==='__lider'||!fecha||gesPillVal('tipo')==='datos'||(GES.detG&&GES.detG.id===excl&&GES.detG.tipo==='datos')){host.hidden=true;return;}
  var t=GES._ocupTurno=(GES._ocupTurno||0)+1;
  _sb.rpc('gestiones_ocupado',{p_hunter:hun,p_fecha:fecha}).then(function(r){
    var h=document.getElementById('gf-ocup');if(t!==GES._ocupTurno||!h||(r&&r.error)){if(h&&r&&r.error)h.hidden=true;return;}
    var yo=hun===gesYo(),me={hora_desde:gesVal('gf-hd')||null,hora_hasta:gesVal('gf-hh')||null};
    var l=((r&&r.data)||[]).filter(function(x){return x.id!==excl&&x.tipo!=='datos';});
    var pisa=l.some(function(x){return gesSePisan(x,me);}),bloq=pisa&&!gesPuedeForzar(hun);
    h.hidden=false;
    h.innerHTML=(l.length?'<b>'+(yo?'Ese día tenés':gesE(gesNom(hun))+' ese día tiene')+':</b> '+l.map(function(x){
        var p=gesSePisan(x,me);return '<span'+(p?' class="ges-pisa"':'')+'>'+gesE(gesOcupTxt(x))+(p?' (se pisa)':'')+'</span>';
      }).join(' &middot; '):(yo?'Ese día no tenés nada agendado.':gesE(gesNom(hun))+' no tiene nada agendado ese día.'))+
      (pisa?'<div class="ges-pisa">'+(bloq?'Así no se puede guardar: cambiá el horario'+(hs?' o elegí otro hunter':'')+'.':'Como líder podés guardar igual, pero el hunter va a tener dos cosas a la vez.')+'</div>':'')+
      '<div class="ges-libres" id="gf-libres"></div>';
    if(bloq&&hs&&me.hora_desde)gesLibres(fecha,me.hora_desde,me.hora_hasta,hun).then(function(ids){
      var x=document.getElementById('gf-libres');if(!x||t!==GES._ocupTurno)return;
      x.innerHTML=ids.length?'<span class="ges-mini">Libres a esa hora:</span>'+ids.slice(0,8).map(function(id){return '<button type="button" onclick="gesElegirHunter(\''+_escAttr(id)+'\')">'+gesE(gesNom(id))+'</button>';}).join(''):
        '<span class="ges-mini">Ningún hunter está libre a esa hora.</span>';
    });
  }).catch(function(){var h=document.getElementById('gf-ocup');if(h)h.hidden=true;});
  gesAgPanel();
}
function gesHorSet(a,b){var x=document.getElementById('gf-hd'),y=document.getElementById('gf-hh');if(x)x.value=a;if(y)y.value=b;gesOcupForm();}

// ── "Ver cómo tiene la agenda" dentro de la ventana de asignar ──────────────
// Al elegir el hunter aparece debajo su semana por horarios (la de la fecha que
// esté puesta). Tocás un hueco libre y se completan el día y el horario, sin
// perder lo que ya cargaste. Sólo para quien asigna: al hunter la base no le
// contesta la ocupación de los demás (y la suya ya la ve en su agenda).
function gesAgPanel(){
  var oc=document.getElementById('gf-ocup');if(!oc||!oc.parentNode)return;
  var host=document.getElementById('gf-ag');
  if(!host){host=document.createElement('div');host.id='gf-ag';host.className='ges-hpanel';oc.parentNode.insertBefore(host,oc.nextSibling);}
  var hs=document.getElementById('gf-hunter');
  var hun=hs?hs.value:(GES._ocupHun||null),fecha=gesVal('gf-fecha');
  if(!hun||hun==='__lider'||!fecha||gesRol()==='hunter'||gesPillVal('tipo')==='datos'){host.hidden=true;host.innerHTML='';return;}
  var t=GES._panelT=(GES._panelT||0)+1,lunes=gesLunes(fecha);
  _sb.rpc('gestiones_ocupacion',{p_desde:lunes,p_hasta:gesSumarDias(lunes,6)}).then(function(r){
    var h=document.getElementById('gf-ag');if(!h||t!==GES._panelT)return;
    if(r&&r.error){h.hidden=true;return;}
    var excl=GES._ocupExcl||null;
    var l=((r&&r.data)||[]).filter(function(x){return x.hunter_id===hun&&x.id!==excl;});
    l.forEach(function(x){if(!x.empresa)x._tapado=true;});
    var dias=gesAgDias(lunes),rr=gesHorRango(l),h0=rr[0],h1=rr[1],i;
    var horas='';for(i=h0;i<h1;i++)horas+='<div class="ges-hhora" style="height:'+GES_HH+'px"><span>'+gesHorEtiqueta(i)+'</span></div>';
    var cols=dias.map(function(d){return gesHorCol(d,l.filter(function(x){return x.fecha===d;}),h0,h1,'gesHorClicPanel',null,true);}).join('');
    var head=dias.map(function(d,n){return '<div class="ges-hth'+(d===fecha?' sel':'')+'">'+GES_DSEM[n]+' <b>'+(+d.slice(8))+'</b></div>';}).join('');
    h.hidden=false;
    h.innerHTML='<div class="ges-hpanel-t"><b>La semana de '+gesE(gesNom(hun))+'</b><span class="ges-mini">Toc&aacute; un hueco libre y se completan el d&iacute;a y el horario.</span></div>'+
      '<div class="ges-hor ges-hor-mini" style="--n:'+dias.length+'"><div class="ges-hin">'+
        '<div class="ges-hhead"><div class="ges-hesq"></div>'+head+'</div>'+
        '<div class="ges-hbody"><div class="ges-hhoras">'+horas+'</div><div class="ges-hcols">'+cols+'</div></div></div></div>';
  },function(){var h=document.getElementById('gf-ag');if(h)h.hidden=true;});
}
function gesHorClicPanel(ev,d){
  var m=gesHorClicMin(ev,+ev.currentTarget.getAttribute('data-h0'));
  var f=document.getElementById('gf-fecha');if(f)f.value=d;
  gesHorSet(gesHorHHMM(m),gesHorHHMM(Math.min(23*60+59,m+60)));
}


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
    else if(!r.hora_desde){r.ok=false;r.motivo='sin horario';} // sin horario no se puede cuidar que no se pise
    return r;
  }).filter(Boolean);
}
function gesAgPegar(){
  gesPersonas().then(function(){
    GES._agPaste=[];
    gesModal('<h3 class="ges-mt">Pegar la agenda desde Excel</h3>'+
      '<p class="ges-ms">Una fila por posición, con las columnas en cualquier orden: <b>fecha</b> (21/10), <b>horario</b> (10 a 12), <b>empresa</b>, <b>hunter</b> y, si querés, el <b>lugar</b>. Quedan planificadas como posición comercial (salvo que la fila diga Acción o Feria). Las que se pisan con otra cosa del hunter no se agregan'+(gesRol()==='lider'||gesEsAdmin()?' (como líder, las de tu equipo sí, con aviso)':'')+'.</p>'+
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
        // El líder (de ese hunter) o el admin pueden cargarla igual; los demás no.
        if(ch.length){if(gesPuedeForzar(r.hunter_id))r.aviso='se pisa con '+ch.join(', ');else{r.ok=false;r.motivo='se pisa con '+ch.join(', ');}}
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
    if(res&&res.error){gesAgPasteBoton();showToast('No se pudo agregar: '+gesErrTxt(res.error));return;}
    var n=(res.data||[]).length,primera=ok.map(function(r){return r.fecha;}).sort()[0];
    gesCerrar();GES.lista=null;GES.ag.data=null;GES.ag.lunes=gesLunes(primera);GES.ag.mes=primera.slice(0,7);GES.ag.dia=primera;GES.tab='agenda';GES.det=null;gesRender();
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
    '<label><span class="ges-lbl">Tipo</span><select class="ges-inp ges-sel" onchange="GES.f.tipo=this.value;gesTablero()">'+opt('t',[['accion','Acciones'],['feria','Ferias'],['posicion','Posiciones comerciales'],['datos','Bases de datos']],f.tipo,'Todos')+'</select></label>'+
    (gesRol()!=='hunter'?'<label><span class="ges-lbl">Hunter</span><select class="ges-inp ges-sel" onchange="GES.f.hun=this.value;gesTablero()">'+opt('h',huns,f.hun,'Todos')+'</select></label>':'')+
    '<label><span class="ges-lbl">Oficial que cede</span><select class="ges-inp ges-sel" onchange="GES.f.due=this.value;gesTablero()">'+opt('d',dues,f.due,'Todos')+'</select></label>'+
    (gesPuedePrueba()?'<label class="ges-check"><input type="checkbox"'+(f.prueba?' checked':'')+' onchange="GES.f.prueba=this.checked;gesTablero()"> Incluir pruebas</label>':'')+
    '<button type="button" class="btn bg ges-xls" onclick="gesExcel()">Descargar Excel</button>'+
  '</div>';
  var vis=+k.visitas||0,asis=+k.asistentes||0,pros=+k.prospectos||0,alt=+k.altas||0;
  var cs=gesConSin(t.por_paquete||[]);
  var kpis='<div class="ges-kpis">'+gesKpi('Acciones',gesN(vis),(+k.planificadas?gesN(k.planificadas)+' planificadas':'realizadas'))+
    gesKpi('Empresas',gesN(k.empresas),'distintas')+gesKpi('Asistentes',gesN(asis),'contactados')+
    gesKpi('Prospectos',gesN(pros),asis?gesPct(pros,asis)+' de los asistentes':'')+
    gesKpi('Altas',gesN(alt),alt?gesN(cs.con)+' con paquete &middot; '+gesN(cs.sin)+' sin':'sueldos en Galicia')+gesKpi('Conversión',gesPct(alt,pros),'altas ÷ prospectos',true)+'</div>'+
    // Lo derivado que nadie asignó todavía no cuenta en los números (no es
    // trabajo de nadie): va aparte, como recordatorio.
    (+k.sin_asignar?'<div class="ges-auto ges-auto-w"><span><b>'+gesN(k.sin_asignar)+(+k.sin_asignar===1?' acción derivada sin asignar':' acciones derivadas sin asignar')+'.</b> No cuenta en los números de arriba hasta que tenga hunter. Está en la bandeja <b>Por asignar</b> de la agenda.</span></div>':'')+
    (+k.datos?'<div class="ges-auto"><span><b>Bases de datos:</b> '+gesN(k.datos)+' personas, '+gesN(k.contactados)+' ya contactadas ('+gesPct(+k.contactados,+k.datos)+').</span></div>':'');
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
    '<div class="ges-g2" style="margin-top:14px"><section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">Por tipo de acción</span></div>'+gesPorTipo(t.por_tipo||[])+'</section>'+
    '<section class="ges-card ges-pad"><div class="ges-ch"><span class="ges-ct">Por qué se descartan</span></div>'+gesMotivos(t.por_motivo||[])+'</section></div>');
}
// Altas con paquete / sin paquete (Caja de Ahorro) / sin cargar, desde por_paquete.
function gesConSin(rows){
  var r={con:0,sin:0,nada:0};
  rows.forEach(function(x){var n=+x.altas||0;if(x.paquete==='caja')r.sin+=n;else if(GES_PAQ[x.paquete])r.con+=n;else r.nada+=n;});
  return r;
}
function gesMotivos(rows){
  var t={},tot=0;rows.forEach(function(r){var k=GES_MOTIVO[r.motivo]?r.motivo:'otro';t[k]=(t[k]||0)+(+r.n||0);tot+=+r.n||0;});
  if(!tot)return '<div class="ges-mini">Todavía no hay descartes con motivo.</div>';
  var mx=Math.max.apply(null,Object.keys(t).map(function(k){return t[k];}).concat([1]));
  return '<div class="ges-fun">'+Object.keys(GES_MOTIVO).filter(function(k){return t[k];}).sort(function(a,b){return t[b]-t[a];}).map(function(k){
    return '<div class="ges-fun-r"><span class="ges-mini">'+GES_MOTIVO[k]+'</span><div class="ges-bar"><i style="width:'+Math.round(t[k]*100/mx)+'%"></i></div><span class="ges-fun-p">'+t[k]+' &middot; '+gesPct(t[k],tot)+'</span></div>';
  }).join('')+'</div>';
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
  var cs=gesConSin(rows);
  return '<div class="ges-mini" style="margin-bottom:8px"><b style="color:var(--ink)">Con paquete: '+cs.con+'</b> ('+gesPct(cs.con,tot)+') &middot; <b style="color:var(--ink)">Sin paquete: '+cs.sin+'</b> ('+gesPct(cs.sin,tot)+')</div>'+
    '<div class="ges-fun">'+ks.map(function(k){
    var v=t[k];
    return '<div class="ges-fun-r"><span class="ges-mini">'+GES_PAQ_CORTO[k]+'</span><div class="ges-bar"><i style="width:'+Math.round(v*100/mx)+'%"></i></div><span class="ges-fun-p">'+v+' &middot; '+gesPct(v,tot)+'</span></div>';
  }).join('')+(sin?'<div class="ges-mini">'+sin+' alta'+(sin>1?'s':'')+' sin paquete cargado</div>':'')+'</div>';
}
// "7 con paquete (5 Plus · 2 Plus Gold) · 1 sin paquete": las altas de un hunter.
function gesPaqTxt(m){
  m=m||{};
  var con=Object.keys(GES_PAQ).filter(function(k){return k!=='caja'&&+m[k];}),nc=con.reduce(function(s,k){return s+(+m[k]);},0),ns=+m.caja||0;
  if(!nc&&!ns)return '';
  return (nc?nc+' con paquete ('+con.map(function(k){return (+m[k])+' '+GES_PAQ[k];}).join(' &middot; ')+')':'')+(nc&&ns?' &middot; ':'')+(ns?ns+' sin paquete':'');
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
    (rows.length?rows.slice(0,10).map(function(r){return '<tr><td>'+gesE(r.empresa)+'<div class="ges-mini">'+gesE(gesNom(r.dueno))+(gesCuitTxt(r.cuit)?' &middot; '+gesE(gesCuitTxt(r.cuit)):'')+'</div></td><td class="r">'+r.visitas+'</td><td class="r"><b>'+r.altas+'</b></td><td class="r">'+gesPct(r.altas,r.prospectos)+'</td></tr>';}).join(''):
      '<tr><td colspan="4" class="ges-mini">Sin datos.</td></tr>')+'</tbody></table></div></section>';
}
function gesPorTipo(rows){
  var orden=['posicion|presencial','posicion|virtual','accion|presencial','accion|virtual','feria|presencial','feria|virtual','datos|virtual','datos|presencial'];
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
      ['Prospectos',+k.prospectos||0],['Altas',+k.altas||0],['Conversión',(+k.prospectos?(+k.altas/+k.prospectos):0)],[]];
    var cs=gesConSin(t.por_paquete||[]);
    resu.push(['Altas con paquete',cs.con],['Altas sin paquete (Caja de Ahorro)',cs.sin]);
    if(cs.nada)resu.push(['Altas sin paquete cargado',cs.nada]);
    resu.push([],['Altas por paquete']);
    var porPaq={};(t.por_paquete||[]).forEach(function(r){if(GES_PAQ[r.paquete])porPaq[r.paquete]=+r.altas;});
    Object.keys(GES_PAQ).forEach(function(p){resu.push([GES_PAQ[p],porPaq[p]||0]);});
    if(+k.datos)resu.push([],['Bases de datos: personas',+k.datos],['Bases de datos: contactadas',+k.contactados||0]);
    var mot={};(t.por_motivo||[]).forEach(function(r){var m=GES_MOTIVO[r.motivo]?r.motivo:'otro';mot[m]=(mot[m]||0)+(+r.n||0);});
    if(Object.keys(mot).length){resu.push([],['Descartes por motivo']);Object.keys(GES_MOTIVO).forEach(function(m){if(mot[m])resu.push([GES_MOTIVO[m],mot[m]]);});}
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(resu),'Resumen');
    var rk=function(rows,conPaq){return rows.filter(function(x){return x.id;}).map(function(x){
      var o={Nombre:gesNom(x.id),Acciones:x.visitas,Prospectos:x.prospectos,Altas:x.altas,'Conversión':x.prospectos?x.altas/x.prospectos:0};
      if(conPaq){var m=x.paquetes||{};o['Con paquete']=Object.keys(GES_PAQ).reduce(function(s,p){return s+(p!=='caja'?+m[p]||0:0);},0);o['Sin paquete']=+m.caja||0;
        Object.keys(GES_PAQ).forEach(function(p){if(p!=='caja')o[GES_PAQ[p]]=+m[p]||0;});}
      return o;});};
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rk(t.por_hunter||[],true)),'Por hunter');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rk(t.por_dueno||[])),'Por oficial');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((t.por_empresa||[]).map(function(x){return {Empresa:x.empresa,CUIT:gesCuitLista(x.cuit).map(gesCuilFmt).join(', '),Oficial:gesNom(x.dueno),Acciones:x.visitas,Prospectos:x.prospectos,Altas:x.altas};})),'Por empresa');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(l.map(function(g){var dt=g.tipo==='datos';return {
      Fecha:g.fecha,'Hasta':g.vence||'',Horario:gesHorario(g),Empresa:g.empresa,CUIT:gesCuitLista(g.cuit).map(gesCuilFmt).join(', '),Lugar:g.lugar||'',Tipo:GES_TIPO[g.tipo],Modalidad:dt?'':GES_MOD[g.modalidad],'Se repite':gesRepTxt(g),Estado:(dt?GES_EST_DATOS:GES_EST)[g.estado],
      Hunter:g.hunter_id?gesNom(g.hunter_id):'Por asignar',
      'Oficial (cede)':gesNom(g.dueno_id),Origen:g.origen==='derivada'?'Derivada':'Propia','Pidió reasignación':g.no_puede_at?'Sí':'',
      'Dotación':g.dotacion,Asistentes:g.asistentes,Personas:dt?+g.n_datos||0:'',Prospectos:+g.n_pros||0,Altas:+g.n_altas||0,Nota:g.nota||'',Prueba:g.prueba?'Sí':''};})),'Gestiones');
    XLSX.writeFile(wb,'Gestiones_'+gesHoy()+'.xlsx');
  }).catch(function(e){showToast('No se pudo armar el Excel: '+((e&&e.message)||e));});
}
