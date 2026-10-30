// Nube simulada de Gestiones comerciales (migración 045), para la demo y las
// pruebas: personas de ejemplo (oficiales, hunters y una líder), empresas con
// CUIT, las tablas de Gestiones y las funciones de la base con sus mismas
// reglas (no pisar horarios, quién puede cambiar el hunter, alta con paquete,
// descarte con motivo, conversación e historial). Todo en memoria y compartido
// entre las ventanas que se abran en el mismo proceso. Nada sale a Supabase.
// Uso: const G=require('./nube_gestiones.cjs'); G.sembrar(); const p=await G.abrirComo(browser,'oficial');
const { abrir, nube, USERS } = require('./nube.cjs');
const REF = 'https://cajyjnxjbobdpltflgnb.supabase.co';

// ── Personas (inventadas) ───────────────────────────────────────────────────
const ID = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const P = {
  oficial: { id: ID(101), email: 'mariana.costa.demo@bancogalicia.com.ar', name: 'Mariana Costa', role: 'vip', lider: 'lider' },
  oficial2: { id: ID(102), email: 'diego.ruiz.demo@bancogalicia.com.ar', name: 'Diego Ruiz', role: 'asesor', lider: 'lider' },
  hunter: { id: ID(201), email: 'sofia.paz.demo@bancogalicia.com.ar', name: 'Sofía Paz', role: 'hunter', lider: 'lider' },
  hunter2: { id: ID(202), email: 'tomas.rios.demo@bancogalicia.com.ar', name: 'Tomás Ríos', role: 'hunter', lider: 'lider' },
  hunter3: { id: ID(203), email: 'julia.sosa.demo@bancogalicia.com.ar', name: 'Julia Sosa', role: 'hunter', lider: 'lider' },
  lider: { id: ID(301), email: 'laura.mendez.demo@bancogalicia.com.ar', name: 'Laura Méndez', role: 'lider' },
};
Object.keys(P).forEach((k) => { USERS[k] = { id: P[k].id, email: P[k].email, name: P[k].name, role: P[k].role }; });
const liderDe = (id) => { const k = Object.keys(P).find((x) => P[x].id === id); return k && P[k].lider ? P[P[k].lider].id : null; };
const perfiles = () => Object.values(USERS).map((u) => ({ id: u.id, nombre: u.name, rol: u.role, lider_id: liderDe(u.id), es_prueba: false }));
const perfil = (id) => perfiles().find((x) => x.id === id) || null;

// Facultades: el oficial (VIP/asesor) y el hunter ven Gestiones; el líder siempre.
const fac = nube.json['_facultades.json'].roles;
fac.vip = Object.assign({}, fac.asesor, { gestiones: true });
fac.asesor.gestiones = true;
fac.hunter = { opcion_9: true, gestiones: true, promos_buscar: true };
fac.lider = { gestiones: true };

// ── Estado ──────────────────────────────────────────────────────────────────
const DB = { gestiones: [], prospectos: [], mensajes: [], leido: [], eventos: [], padron: [], flag: 'on', seq: 1000 };
const nid = () => '00000000-0000-4000-9000-' + String(++DB.seq).padStart(12, '0');
const ahora = () => new Date().toISOString();
const p2 = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const hoy = () => iso(new Date());
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const hms = (t) => (t ? (String(t).length === 5 ? t + ':00' : String(t)) : null);
const min = (t) => { const m = /^(\d\d):(\d\d)/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const fin = (d, h) => (h ? min(h) : Math.min(min(d) + 60, 1439));
const hhmm = (m) => p2(Math.floor(m / 60)) + ':' + p2(m % 60);
class ErrBase extends Error { constructor(m) { super(m); this.code = 'P0001'; } }
const err = (m) => { throw new ErrBase(m); };

// ── Reglas de acceso (las policies de la 014/045) ───────────────────────────
const esLiderDe = (U, x) => !!x && liderDe(x) === U.id;
const puedeVer = (U, g) => U.role === 'admin' || [g.hunter_id, g.dueno_id, g.creada_por, g.lider_id].includes(U.id) || esLiderDe(U, g.hunter_id) || esLiderDe(U, g.dueno_id) || esLiderDe(U, g.creada_por);
const puedeEditar = (U, g) => U.role === 'admin' || [g.hunter_id, g.creada_por, g.lider_id].includes(U.id) || esLiderDe(U, g.hunter_id);
const prosEscribe = (U, g) => U.role === 'admin' || g.hunter_id === U.id || g.creada_por === U.id;
const participa = (U, g) => [g.hunter_id, g.dueno_id, g.creada_por, g.lider_id].includes(U.id) || esLiderDe(U, g.hunter_id);
const gDe = (id) => DB.gestiones.find((g) => g.id === id);

// ── Triggers ────────────────────────────────────────────────────────────────
function pisa(U, n, v) {
  const mirar = !v || n.hunter_id !== v.hunter_id || n.fecha !== v.fecha || hms(n.hora_desde) !== hms(v.hora_desde) || hms(n.hora_hasta) !== hms(v.hora_hasta) || v.estado === 'cancelada';
  if (!mirar || n.estado === 'cancelada' || !n.hunter_id || !n.hora_desde || n.tipo === 'datos' || U.role === 'admin' || esLiderDe(U, n.hunter_id)) return;
  const o = DB.gestiones.find((o) => o.hunter_id === n.hunter_id && o.fecha === n.fecha && o.estado !== 'cancelada' && o.id !== n.id && o.hora_desde && o.tipo !== 'datos'
    && min(o.hora_desde) < fin(n.hora_desde, n.hora_hasta) && min(n.hora_desde) < fin(o.hora_desde, o.hora_hasta));
  if (o) err('GES_PISA: ese hunter ya tiene algo de ' + hhmm(min(o.hora_desde)) + ' a ' + hhmm(fin(o.hora_desde, o.hora_hasta)) + ' ese día');
}
function antesIns(U, b) {
  const n = Object.assign({ origen: 'propia', tipo: 'accion', modalidad: 'presencial', frecuencia: 'unica', estado: 'realizada', fecha: hoy(), hora_desde: null, hora_hasta: null, lugar: null, nota: null,
    dotacion: null, asistentes: null, cada_dias: null, veces: null, vez: null, serie_id: null, vence: null, lider_id: null, hunter_id: null, dueno_id: null }, b);
  Object.assign(n, { id: nid(), creada_por: U.id, empresa: String(n.empresa || '').trim(), no_puede_at: null, no_puede_motivo: null, prueba: false, created_at: ahora(), updated_at: ahora() });
  n.empresa_key = n.empresa.toLowerCase(); n.hora_desde = hms(n.hora_desde); n.hora_hasta = hms(n.hora_hasta);
  if (n.origen === 'propia') { n.hunter_id = U.id; n.lider_id = null; n.visto_hunter = true; }
  else {
    if (!(n.dueno_id && n.dueno_id !== U.id && (U.role === 'admin' || esLiderDe(U, n.hunter_id)))) n.dueno_id = U.id;
    if (!n.hunter_id) {
      const l = perfil(n.lider_id);
      if (!l || l.rol !== 'lider') err('Elegí el hunter o el líder que la va a asignar');
      if (n.estado !== 'planificada') err('Una acción sin hunter tiene que quedar planificada');
      n.visto_hunter = true;
    } else {
      if (!perfil(n.hunter_id)) err('Ese hunter no existe o no está activo');
      n.lider_id = null; // 046: con hunter no hay "líder que reparte"
      n.visto_hunter = n.hunter_id === U.id;
    }
  }
  const pe = DB.padron.find((e) => e.user_id === n.dueno_id && e.empresa.trim().toLowerCase() === n.empresa_key);
  if (!pe) err('Esa empresa no está en la base de ese oficial');
  n.cuit = (pe.cuits || []).join(',') || null;
  n.visto_dueno = n.dueno_id === U.id;
  if (!n.serie_id) n.serie_id = nid();
  if (n.hora_hasta && !n.hora_desde) err('violates check constraint "gestiones_horario_ok"');
  pisa(U, n, null);
  return n;
}
function antesUpd(U, v, c, flags) {
  flags = flags || {};
  const n = Object.assign({}, v, c);
  ['id', 'empresa', 'empresa_key', 'dueno_id', 'creada_por', 'origen', 'serie_id', 'created_at'].forEach((k) => { n[k] = v[k]; });
  n.cuit = v.cuit; n.hora_desde = hms(n.hora_desde); n.hora_hasta = hms(n.hora_hasta);
  if (!n.cuit) { const pe = DB.padron.find((e) => e.user_id === v.dueno_id && e.empresa.trim().toLowerCase() === v.empresa_key); n.cuit = (pe && pe.cuits.join(',')) || null; } // 046
  if (U.role !== 'admin') n.lider_id = v.lider_id;
  if (!flags.marcar) { n.visto_hunter = v.visto_hunter; n.visto_dueno = v.visto_dueno; }
  if (!flags.noPuede) { n.no_puede_at = v.no_puede_at; n.no_puede_motivo = v.no_puede_motivo; }
  if (n.hunter_id !== v.hunter_id) {
    const ok = n.hunter_id && (U.role === 'admin' || (U.id === v.creada_por && v.origen === 'derivada' && v.estado !== 'realizada')
      || ((esLiderDe(U, v.hunter_id) || v.lider_id === U.id) && esLiderDe(U, n.hunter_id)));
    if (ok) { n.visto_hunter = n.hunter_id === U.id; n.no_puede_at = null; n.no_puede_motivo = null; } else n.hunter_id = v.hunter_id;
  }
  if (n.estado === 'realizada' && v.estado !== 'realizada' && U.id !== v.dueno_id) n.visto_dueno = false;
  n.updated_at = ahora();
  pisa(U, n, v);
  return n;
}
function ev(gid, U, que, detalle) { DB.eventos.push({ id: nid(), gestion_id: gid, quien: U.id, que, detalle: detalle || {}, at: ahora() }); }
function despues(U, n, v) {
  if (!v) { ev(n.id, U, n.origen === 'propia' ? 'registrada' : !n.hunter_id ? 'por_asignar' : 'derivada', { hunter: n.hunter_id, lider: n.lider_id, estado: n.estado }); return; }
  if (n.hunter_id !== v.hunter_id) ev(n.id, U, 'hunter', { de: v.hunter_id, a: n.hunter_id });
  if (n.fecha !== v.fecha || n.hora_desde !== v.hora_desde || n.hora_hasta !== v.hora_hasta)
    ev(n.id, U, 'horario', { fecha_de: v.fecha, fecha_a: n.fecha, desde_de: (v.hora_desde || '').slice(0, 5) || null, hasta_de: (v.hora_hasta || '').slice(0, 5) || null, desde_a: (n.hora_desde || '').slice(0, 5) || null, hasta_a: (n.hora_hasta || '').slice(0, 5) || null });
  if (n.estado !== v.estado) ev(n.id, U, 'estado', { de: v.estado, a: n.estado });
  if (n.no_puede_at && !v.no_puede_at) ev(n.id, U, 'no_puede', { motivo: n.no_puede_motivo });
}
function prosAntes(U, b, v) {
  const n = v ? Object.assign({}, v, b) : Object.assign({ id: nid(), estado: 'prospecto', cuil: null, paquete: null, contacto: null, referencia: null, motivo: null, proximo: null, fecha_alta: null, renta: null, created_at: ahora() }, b);
  n.nombre = String(n.nombre || '').trim();
  if (!n.nombre) err('violates check constraint "gestion_prospectos_nombre_check"');
  if (n.cuil) n.cuil = String(n.cuil).replace(/\D/g, '') || null;
  if (n.cuil && !/^\d{11}$/.test(n.cuil)) err('violates check constraint "gestion_prospectos_cuil_check"');
  n.contacto = (n.contacto && String(n.contacto).trim()) || null; n.referencia = (n.referencia && String(n.referencia).trim()) || null;
  if (v) { n.id = v.id; n.gestion_id = v.gestion_id; n.creado_por = v.creado_por; n.created_at = v.created_at; n.updated_at = ahora(); }
  else { n.creado_por = U.id; n.updated_at = ahora(); }
  const era = v ? v.estado : null, paqEra = v ? v.paquete : null;
  if (n.estado === 'alta' && !n.paquete && (era !== 'alta' || paqEra)) err('GES_PAQ: elegí con qué paquete fue el alta');
  if (n.estado === 'descartado' && !n.motivo && era !== 'descartado') err('GES_MOT: elegí por qué se descarta');
  if (n.estado !== 'descartado') n.motivo = null;
  if (n.estado === 'alta' || n.estado === 'descartado') n.proximo = null;
  if (n.estado === 'alta' && !n.fecha_alta) n.fecha_alta = hoy();
  if (n.estado !== 'alta') n.fecha_alta = null;
  return n;
}
function prosDespues(U, n, v) {
  const era = v ? v.estado : null;
  if (n.estado === 'alta' && era !== 'alta') ev(n.gestion_id, U, 'alta', { nombre: n.nombre, paquete: n.paquete });
  else if (n.estado === 'descartado' && era !== 'descartado') ev(n.gestion_id, U, 'descarte', { nombre: n.nombre, motivo: n.motivo });
}

// ── Funciones de la base (rpc) ──────────────────────────────────────────────
const conCuentas = (g) => {
  const ps = DB.prospectos.filter((p) => p.gestion_id === g.id);
  return Object.assign({}, g, { n_pros: ps.filter((p) => p.estado !== 'a_contactar').length, n_altas: ps.filter((p) => p.estado === 'alta').length, n_datos: ps.length });
};
const RPC = {
  gestiones_personas: () => perfiles(),
  gestiones_lista: (U, a) => DB.gestiones.filter((g) => puedeVer(U, g) && (!a.p_solo_mio || [g.hunter_id, g.dueno_id, g.creada_por, g.lider_id].includes(U.id)))
    .sort((x, y) => (y.fecha + y.created_at).localeCompare(x.fecha + x.created_at)).slice(0, a.p_limit || 300).map(conCuentas),
  gestiones_empresas: (U, a) => {
    const q = String(a.p_q || '').trim().toLowerCase(), d = String(a.p_q || '').replace(/\D/g, '');
    return DB.padron.filter((e) => (U.role === 'admin' || U.role === 'hunter' || e.user_id === U.id || esLiderDe(U, e.user_id))
      && (!q || e.empresa.toLowerCase().includes(q) || (d.length >= 4 && e.cuits.some((c) => c.includes(d)))))
      .sort((x, y) => x.empresa.localeCompare(y.empresa)).slice(0, a.p_limit || 30).map((e) => ({ empresa: e.empresa, dueno_id: e.user_id, cuits: e.cuits }));
  },
  gestiones_ocupado: (U, a) => DB.gestiones.filter((g) => g.hunter_id === a.p_hunter && g.fecha === a.p_fecha && g.estado !== 'cancelada' && g.tipo !== 'datos')
    .sort((x, y) => (min(x.hora_desde) ?? -1) - (min(y.hora_desde) ?? -1))
    .map((g) => ({ id: g.id, hora_desde: g.hora_desde, hora_hasta: g.hora_hasta, tipo: g.tipo, empresa: puedeVer(U, g) ? g.empresa : null })),
  // 046: no para hunters; el líder, sólo los de su equipo
  gestiones_dia: (U, a) => DB.gestiones.filter((g) => U.role !== 'hunter' && (U.role !== 'lider' || esLiderDe(U, g.hunter_id))
      && g.fecha === a.p_fecha && g.estado !== 'cancelada' && g.hunter_id && g.hora_desde && g.tipo !== 'datos')
    .map((g) => ({ hunter_id: g.hunter_id, hora_desde: g.hora_desde, hora_hasta: g.hora_hasta })),
  // 047: los horarios ocupados de toda una semana, con la empresa tapada si no
  // la puede ver. Mismos frenos de rol que gestiones_dia.
  gestiones_ocupacion: (U, a) => {
    const dias = (x, y) => Math.round((Date.parse(y + 'T00:00:00') - Date.parse(x + 'T00:00:00')) / 86400000);
    if (!a.p_desde || !a.p_hasta || dias(a.p_desde, a.p_hasta) < 0 || dias(a.p_desde, a.p_hasta) > 45) return [];
    return DB.gestiones.filter((g) => U.role !== 'hunter' && (U.role !== 'lider' || esLiderDe(U, g.hunter_id))
        && g.fecha >= a.p_desde && g.fecha <= a.p_hasta && g.estado !== 'cancelada' && g.hunter_id && g.hora_desde && g.tipo !== 'datos')
      .sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : (min(x.hora_desde) ?? -1) - (min(y.hora_desde) ?? -1)))
      .map((g) => ({ id: g.id, hunter_id: g.hunter_id, fecha: g.fecha, hora_desde: g.hora_desde, hora_hasta: g.hora_hasta, tipo: g.tipo, empresa: puedeVer(U, g) ? g.empresa : null }));
  },
  gestion_marcar_vista: (U, a) => {
    let n = 0;
    DB.gestiones.forEach((g) => {
      if (g.serie_id !== a.p_serie) return;
      if (g.hunter_id === U.id && !g.visto_hunter) { g.visto_hunter = true; n++; }
      if (g.dueno_id === U.id && g.visto_dueno === false) { g.visto_dueno = true; n++; }
    });
    return n;
  },
  gestion_marcar_leida: (U, a) => {
    const g = gDe(a.p_gestion); if (!g || !puedeVer(U, g)) return null;
    const l = DB.leido.find((x) => x.gestion_id === g.id && x.user_id === U.id);
    if (l) l.at = ahora(); else DB.leido.push({ gestion_id: g.id, user_id: U.id, at: ahora() });
    return null;
  },
  gestion_mensaje_enviar: (U, a) => {
    if (!String(a.p_texto || '').trim()) err('Escribí el mensaje');
    const g = gDe(a.p_gestion); if (!g || !puedeVer(U, g)) err('No tenés acceso a esa acción');
    const m = { id: nid(), gestion_id: g.id, autor: U.id, tipo: 'msg', texto: String(a.p_texto).trim().slice(0, 1000), created_at: ahora() };
    DB.mensajes.push(m); RPC.gestion_marcar_leida(U, { p_gestion: g.id });
    return m.id;
  },
  gestion_no_puedo: (U, a) => {
    const g = gDe(a.p_gestion);
    if (!g || g.hunter_id !== U.id) err('Sólo el hunter de esa acción puede avisar que no puede');
    if (g.estado !== 'planificada') err('Sólo se avisa en una acción planificada');
    const motivo = (a.p_motivo && String(a.p_motivo).trim().slice(0, 500)) || null;
    const n = antesUpd(U, g, { no_puede_at: ahora(), no_puede_motivo: motivo }, { noPuede: true });
    despues(U, n, g); Object.assign(g, n);
    DB.mensajes.push({ id: nid(), gestion_id: g.id, autor: U.id, tipo: 'no_puedo', texto: motivo || 'No puedo ir', created_at: ahora() });
    RPC.gestion_marcar_leida(U, { p_gestion: g.id });
    return null;
  },
  gestiones_mensajes_nuevos: (U) => {
    const out = {};
    DB.mensajes.forEach((m) => {
      const g = gDe(m.gestion_id); if (!g || m.autor === U.id || !puedeVer(U, g) || !participa(U, g)) return;
      const l = DB.leido.find((x) => x.gestion_id === g.id && x.user_id === U.id);
      if (l && m.created_at <= l.at) return;
      const o = out[g.id] || (out[g.id] = { gestion_id: g.id, serie_id: g.serie_id, empresa: g.empresa, n: 0, ultimo_autor: null, ultimo_at: '', no_puedo: false });
      o.n++; if (m.created_at > o.ultimo_at) { o.ultimo_at = m.created_at; o.ultimo_autor = m.autor; } if (m.tipo === 'no_puedo') o.no_puedo = true;
    });
    return Object.values(out).sort((x, y) => y.ultimo_at.localeCompare(x.ultimo_at));
  },
  gestiones_tablero: (U, a) => {
    const g = DB.gestiones.filter((x) => puedeVer(U, x) && (!a.p_desde || x.fecha >= a.p_desde) && (!a.p_hasta || x.fecha <= a.p_hasta) && (!a.p_tipo || x.tipo === a.p_tipo)
      && (!a.p_hunter || x.hunter_id === a.p_hunter) && (!a.p_dueno || x.dueno_id === a.p_dueno) && (!a.p_solo_mio || [x.hunter_id, x.dueno_id, x.creada_por, x.lider_id].includes(U.id)));
    const r = g.filter((x) => x.estado === 'realizada' || (x.tipo === 'datos' && x.estado !== 'cancelada'));
    const gx = Object.fromEntries(r.map((x) => [x.id, x]));
    const todos = DB.prospectos.filter((p) => gx[p.gestion_id]).map((p) => Object.assign({}, p, { g: gx[p.gestion_id] }));
    const pr = todos.filter((p) => p.estado !== 'a_contactar');
    const sumar = (filas) => ({ visitas: filas.length, prospectos: pr.filter((p) => filas.includes(p.g)).length, altas: pr.filter((p) => filas.includes(p.g) && p.estado === 'alta').length });
    const grupos = (fn) => { const m = new Map(); r.forEach((x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return [...m.entries()]; };
    const cuenta = (l, fn) => { const m = {}; l.forEach((x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; }); return m; };
    return {
      // 048: lo que nadie asignó todavía no cuenta como planificado, va aparte
      kpis: { visitas: r.length, planificadas: g.filter((x) => x.estado === 'planificada' && x.tipo !== 'datos' && x.hunter_id).length,
        sin_asignar: g.filter((x) => x.estado === 'planificada' && x.tipo !== 'datos' && !x.hunter_id).length,
        empresas: new Set(r.map((x) => x.dueno_id + '|' + x.empresa_key)).size,
        asistentes: r.reduce((s, x) => s + (+x.asistentes || 0), 0), prospectos: pr.length, altas: pr.filter((p) => p.estado === 'alta').length,
        datos: todos.filter((p) => p.g.tipo === 'datos').length, contactados: todos.filter((p) => p.g.tipo === 'datos' && p.estado !== 'a_contactar').length },
      por_mes: grupos((x) => x.fecha.slice(0, 7)).sort((a1, b1) => a1[0].localeCompare(b1[0])).map(([k, l]) => Object.assign({ mes: k }, sumar(l))),
      por_hunter: grupos((x) => x.hunter_id).map(([k, l]) => Object.assign({ id: k }, sumar(l), {
        paquetes: cuenta(pr.filter((p) => p.g.hunter_id === k && p.estado === 'alta' && p.paquete), (p) => p.paquete) })),
      por_dueno: grupos((x) => x.dueno_id).map(([k, l]) => Object.assign({ id: k }, sumar(l))),
      por_empresa: grupos((x) => x.dueno_id + '|' + x.empresa_key).map(([k, l]) => Object.assign({ empresa: l[0].empresa, dueno: l[0].dueno_id, cuit: l[0].cuit }, sumar(l)))
        .sort((a1, b1) => b1.altas - a1.altas || b1.visitas - a1.visitas).slice(0, 300),
      por_paquete: Object.entries(cuenta(pr.filter((p) => p.estado === 'alta'), (p) => p.paquete || '')).map(([k, n]) => ({ paquete: k || null, altas: n })),
      por_motivo: Object.entries(cuenta(pr.filter((p) => p.estado === 'descartado'), (p) => p.motivo || '')).map(([k, n]) => ({ motivo: k || null, n })),
      por_tipo: grupos((x) => x.tipo + '|' + x.modalidad).map(([k, l]) => Object.assign({ tipo: k.split('|')[0], modalidad: k.split('|')[1] }, sumar(l))),
      por_estado_pros: cuenta(todos, (p) => p.estado),
    };
  },
};

// ── Consultas a tablas (lo que usa la app con .from) ────────────────────────
// Filtros de PostgREST: eq, neq, gt, gte, lt, lte, is, in, not.<op> y or=(and(...),...).
function valor(v) { return v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v; }
function cond(col, expr) {
  const neg = expr.startsWith('not.'); if (neg) expr = expr.slice(4);
  const i = expr.indexOf('.'), op = expr.slice(0, i), raw = expr.slice(i + 1);
  let f;
  if (op === 'in') { const l = raw.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')); f = (r) => l.includes(String(r[col])); }
  else if (op === 'is') { const v = valor(raw); f = (r) => (v === null ? r[col] == null : r[col] === v); }
  else {
    const v = valor(raw);
    f = (r) => { const x = r[col]; if (op === 'eq') return typeof v === 'boolean' ? x === v : String(x) === String(v); if (op === 'neq') return String(x) !== String(v);
      if (x == null) return false; if (op === 'gte') return String(x) >= v; if (op === 'lte') return String(x) <= v; if (op === 'gt') return String(x) > v; if (op === 'lt') return String(x) < v; return true; };
  }
  return neg ? (r) => !f(r) : f;
}
function partir(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
function grupo(tipo, cuerpo) {
  const fs = partir(cuerpo).map((t) => {
    const m = /^(and|or)\((.*)\)$/.exec(t); if (m) return grupo(m[1], m[2]);
    const i = t.indexOf('.'); return cond(t.slice(0, i), t.slice(i + 1));
  });
  return tipo === 'and' ? (r) => fs.every((f) => f(r)) : (r) => fs.some((f) => f(r));
}
function filtrar(l, sp) {
  const fs = [];
  for (const [k, v] of sp.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    if (k === 'or') fs.push(grupo('or', v.replace(/^\(|\)$/g, '')));
    else fs.push(cond(k, v));
  }
  let out = l.filter((r) => fs.every((f) => f(r)));
  const ord = sp.get('order');
  if (ord) {
    const ks = ord.split(',').map((x) => { const [c, dir] = x.split('.'); return [c, dir === 'desc' ? -1 : 1]; });
    out = out.slice().sort((a, b) => { for (const [c, d] of ks) { const x = a[c] == null ? '' : String(a[c]), y = b[c] == null ? '' : String(b[c]); if (x !== y) return x < y ? -d : d; } return 0; });
  }
  return out;
}
function proyectar(r, sel) { if (!sel || sel === '*') return Object.assign({}, r); const o = {}; sel.split(',').forEach((k) => { k = k.trim(); if (k in r) o[k] = r[k]; else o[k] = null; }); return o; }

async function ruta(route, U) {
  const req = route.request(), u = new URL(req.url()), path = u.pathname, m = req.method();
  const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Type': 'application/json' };
  if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: H });
  const obj = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
  const ok = (data, st) => route.fulfill({ status: st || 200, body: JSON.stringify(data === undefined ? null : data), headers: H });
  const mal = (e) => route.fulfill({ status: 400, body: JSON.stringify({ message: e.message, code: e.code || 'P0001' }), headers: H });
  const sp = u.searchParams, sel = sp.get('select');
  const lista = (l) => {
    let a = +(sp.get('offset') || 0), lim = +(sp.get('limit') || 0) || 100000; const rg = req.headers()['range']; if (rg) { const x = /(\d+)-(\d+)/.exec(rg); if (x) { a = +x[1]; lim = +x[2] - a + 1; } }
    const sl = l.slice(a, a + lim).map((r) => proyectar(r, sel));
    if (obj) return sl.length === 1 ? ok(sl[0]) : route.fulfill({ status: 406, body: JSON.stringify({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: 'The result contains 0 rows', hint: null }), headers: H });
    return route.fulfill({ status: 200, body: JSON.stringify(sl), headers: Object.assign({}, H, { 'Content-Range': (sl.length ? a + '-' + (a + sl.length - 1) : '*') + '/' + l.length }) });
  };
  const cuerpo = () => { try { return JSON.parse(req.postData() || '{}'); } catch (e) { return {}; } };
  try {
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop();
      if (!RPC[fn]) return route.fallback();
      return ok(RPC[fn](U, cuerpo()));
    }
    const tabla = path.replace('/rest/v1/', '');
    if (tabla === 'app_flags') return lista([{ clave: 'gestiones', valor: DB.flag }].filter((r) => !sp.get('clave') || sp.get('clave') === 'eq.' + r.clave));
    if (tabla === 'profiles') {
      if (m === 'GET' && sp.get('id') === 'eq.' + U.id)
        return lista([{ id: U.id, role: U.role, full_name: U.name, nombre_asesor: U.name, celular_asesor: '', email_asesor: U.email, status: 'active', facultades: null, es_prueba: false, lider_id: liderDe(U.id), flyer_fav: null }]);
      return route.fallback();
    }
    if (tabla === 'padron_empresas') {
      if (m !== 'GET') return route.fallback();
      return lista(filtrar(DB.padron.filter((e) => U.role === 'admin' || U.role === 'hunter' || e.user_id === U.id), sp));
    }
    if (tabla === 'gestiones') {
      if (m === 'GET') return lista(filtrar(DB.gestiones.filter((g) => puedeVer(U, g)), sp));
      if (m === 'POST') {
        // De a una, como hace la base (una fila se puede pisar con otra del mismo
        // lote), y todo o nada: si una falla no queda ninguna.
        const b = cuerpo(), antes = DB.gestiones, tmp = antes.slice(), nuevas = [];
        try { (Array.isArray(b) ? b : [b]).forEach((x) => { DB.gestiones = tmp; const n = antesIns(U, x); tmp.push(n); nuevas.push(n); }); }
        catch (e) { DB.gestiones = antes; throw e; }
        DB.gestiones = tmp;
        nuevas.forEach((n) => despues(U, n, null));
        const out = nuevas.map((n) => proyectar(n, sel));
        return ok(obj ? out[0] : out, 201);
      }
      if (m === 'PATCH') {
        const b = cuerpo(), l = filtrar(DB.gestiones.filter((g) => puedeEditar(U, g)), sp), out = [];
        l.forEach((v) => { const n = antesUpd(U, v, b); if (!puedeEditar(U, n)) err('new row violates row-level security policy for table "gestiones"'); despues(U, n, v); Object.assign(v, n); if (puedeVer(U, v)) out.push(proyectar(v, sel)); });
        if (obj) return out.length === 1 ? ok(out[0]) : route.fulfill({ status: 406, body: JSON.stringify({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: 'The result contains 0 rows', hint: null }), headers: H });
        return ok(out);
      }
      if (m === 'DELETE') {
        const l = filtrar(DB.gestiones.filter((g) => U.role === 'admin' || g.creada_por === U.id), sp), ids = new Set(l.map((g) => g.id));
        DB.gestiones = DB.gestiones.filter((g) => !ids.has(g.id));
        ['prospectos', 'mensajes', 'leido', 'eventos'].forEach((t) => { DB[t] = DB[t].filter((x) => !ids.has(x.gestion_id)); });
        return route.fulfill({ status: 204, body: '', headers: H });
      }
    }
    if (tabla === 'gestion_prospectos') {
      const ver = (p) => { const g = gDe(p.gestion_id); return g && puedeVer(U, g); };
      if (m === 'GET') return lista(filtrar(DB.prospectos.filter(ver), sp));
      if (m === 'POST') {
        const b = cuerpo(), filas = (Array.isArray(b) ? b : [b]).map((x) => { const g = gDe(x.gestion_id); if (!g || !prosEscribe(U, g)) err('new row violates row-level security policy for table "gestion_prospectos"'); return prosAntes(U, x, null); });
        filas.forEach((n) => { DB.prospectos.push(n); prosDespues(U, n, null); });
        const out = filas.map((n) => proyectar(n, sel));
        return ok(obj ? out[0] : out, 201);
      }
      if (m === 'PATCH') {
        const b = cuerpo(), l = filtrar(DB.prospectos.filter((p) => { const g = gDe(p.gestion_id); return g && prosEscribe(U, g); }), sp), out = [];
        l.forEach((v) => { const n = prosAntes(U, b, v); prosDespues(U, n, v); Object.assign(v, n); out.push(proyectar(v, sel)); });
        if (obj) return out.length === 1 ? ok(out[0]) : route.fulfill({ status: 406, body: JSON.stringify({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: 'The result contains 0 rows', hint: null }), headers: H });
        return ok(out);
      }
      if (m === 'DELETE') {
        const l = filtrar(DB.prospectos.filter((p) => { const g = gDe(p.gestion_id); return g && prosEscribe(U, g); }), sp), ids = new Set(l.map((p) => p.id));
        DB.prospectos = DB.prospectos.filter((p) => !ids.has(p.id));
        return route.fulfill({ status: 204, body: '', headers: H });
      }
    }
    if (tabla === 'gestion_mensajes' || tabla === 'gestion_eventos') {
      if (m !== 'GET') return mal(new ErrBase('new row violates row-level security policy'));
      const l = DB[tabla === 'gestion_mensajes' ? 'mensajes' : 'eventos'].filter((x) => { const g = gDe(x.gestion_id); return g && puedeVer(U, g); });
      return lista(filtrar(l, sp));
    }
    if (tabla === 'gestion_leido') return lista(filtrar(DB.leido.filter((x) => x.user_id === U.id), sp));
  } catch (e) { return mal(e); }
  return route.fallback();
}

// ── Datos de ejemplo ────────────────────────────────────────────────────────
// Empresas y personas inventadas; CUIT del rango de prueba 30-90… (sin asignar).
function sembrar() {
  const A = (k) => USERS[k];
  const emp = (dueno, nombre, cuit) => DB.padron.push({ id: DB.padron.length + 1, user_id: P[dueno].id, empresa: nombre, cuits: [cuit], config: 'BAU', asesores: [{ nombre: P[dueno].name, celular: '11 5555-0000', email: P[dueno].email }], rubro: null, created_at: ahora() });
  emp('oficial', 'ALIMENTOS DEL SUR SA', '30900001118'); emp('oficial', 'LOGISTICA ANDINA SRL', '30900002114'); emp('oficial', 'CLINICA DEL PARQUE SA', '30900003110');
  emp('oficial', 'METALURGICA NORTE SA', '30900004117'); emp('oficial', 'TEXTIL ARGENTA SA', '30900005113'); emp('oficial', 'SUPERMERCADOS DEL VALLE SA', '30900006110');
  emp('oficial2', 'TRANSPORTES RIO SA', '30900007116'); emp('oficial2', 'CONSTRUCTORA PAMPA SA', '30900008112');
  const crear = (quien, b) => { const n = antesIns(A(quien), b); DB.gestiones.push(n); despues(A(quien), n, null); return n; };
  const pros = (quien, g, l) => l.forEach((x) => { const n = prosAntes(A(quien), Object.assign({ gestion_id: g.id }, x), null); DB.prospectos.push(n); prosDespues(A(quien), n, null); });
  const msg = (quien, g, texto, tipo, haceMin) => DB.mensajes.push({ id: nid(), gestion_id: g.id, autor: A(quien).id, tipo: tipo || 'msg', texto, created_at: new Date(Date.now() - (haceMin || 1) * 60000).toISOString() });
  // 1) Derivada a Sofía (nueva, con una pregunta suya sin leer por Mariana)
  const g1 = crear('oficial', { empresa: 'ALIMENTOS DEL SUR SA', origen: 'derivada', hunter_id: P.hunter.id, tipo: 'posicion', estado: 'planificada', fecha: dia(1), hora_desde: '10:00', hora_hasta: '12:00', lugar: 'Planta Avellaneda, comedor', nota: 'Hablar con Carla de RRHH. 180 empleados.' });
  msg('hunter', g1, '¿Llevo el flyer de combustible o el genérico? Tienen flota propia.', 'msg', 20);
  // 2) Para que la asigne la líder
  crear('oficial', { empresa: 'LOGISTICA ANDINA SRL', origen: 'derivada', lider_id: P.lider.id, tipo: 'feria', estado: 'planificada', fecha: dia(2), hora_desde: '14:00', hora_hasta: '17:00', lugar: 'Depósito central', nota: 'Feria de beneficios. Necesitamos a alguien con stand.' });
  // 3) Base de datos para Tomás (15 personas, algunas ya trabajadas)
  const g3 = crear('oficial', { empresa: 'CLINICA DEL PARQUE SA', origen: 'derivada', hunter_id: P.hunter2.id, tipo: 'datos', modalidad: 'virtual', estado: 'planificada', fecha: dia(-3), vence: dia(12), nota: 'Personal de enfermería que cobra en otro banco. Ofrecer Plus.' });
  const nombres = ['Ana Gómez', 'Bruno Díaz', 'Carla Funes', 'Daniel Ortiz', 'Elena Vidal', 'Federico Luna', 'Gabriela Ponce', 'Hernán Sáez', 'Inés Molina', 'Jorge Benítez', 'Karina Rojas', 'Lucas Herrera', 'Marta Acosta', 'Nicolás Vera', 'Olga Suárez'];
  pros('oficial', g3, nombres.map((n, i) => ({ nombre: n, contacto: '11 5' + String(100 + i) + '-' + String(2000 + i * 7), referencia: 'Legajo ' + (300 + i), estado: 'a_contactar' })));
  const p3 = DB.prospectos.filter((p) => p.gestion_id === g3.id);
  const cambiar = (quien, p, b) => { const n = prosAntes(A(quien), b, p); prosDespues(A(quien), n, p); Object.assign(p, n); };
  cambiar('hunter2', p3[0], { estado: 'alta', paquete: 'plus' }); cambiar('hunter2', p3[1], { estado: 'en_gestion', proximo: hoy() }); cambiar('hunter2', p3[2], { estado: 'descartado', motivo: 'ya_galicia' });
  cambiar('hunter2', p3[3], { estado: 'prospecto', proximo: dia(-1) }); cambiar('hunter2', p3[4], { estado: 'descartado', motivo: 'no_contesta' });
  // 4) Tomás avisó que no puede ir
  const g4 = crear('oficial', { empresa: 'METALURGICA NORTE SA', origen: 'derivada', hunter_id: P.hunter2.id, tipo: 'accion', estado: 'planificada', fecha: dia(3), hora_desde: '09:00', hora_hasta: '13:00', lugar: 'Parque industrial, nave 4' });
  RPC.gestion_no_puedo(A('hunter2'), { p_gestion: g4.id, p_motivo: 'Ese día tengo la capacitación de onboarding.' });
  // 5) Lo que ya hizo Sofía la semana pasada (con altas con y sin paquete)
  const g5 = crear('hunter', { empresa: 'TEXTIL ARGENTA SA', dueno_id: P.oficial.id, origen: 'propia', tipo: 'accion', estado: 'realizada', fecha: dia(-6), hora_desde: '09:30', hora_hasta: '12:30', dotacion: 120, asistentes: 35, nota: 'Muy buena recepción.' });
  pros('hunter', g5, [{ nombre: 'Pablo Medina', cuil: '20123456786', estado: 'prospecto' }, { nombre: 'Rocío Ledesma', estado: 'prospecto' }, { nombre: 'Sergio Paredes', estado: 'prospecto' },
    { nombre: 'Valeria Quiroga', estado: 'prospecto' }, { nombre: 'Walter Ibáñez', referencia: 'Turno noche', estado: 'prospecto' }, { nombre: 'Ximena Toledo', estado: 'prospecto' }]);
  const p5 = DB.prospectos.filter((p) => p.gestion_id === g5.id);
  cambiar('hunter', p5[0], { estado: 'alta', paquete: 'plus' }); cambiar('hunter', p5[1], { estado: 'alta', paquete: 'gold' }); cambiar('hunter', p5[2], { estado: 'alta', paquete: 'caja' });
  cambiar('hunter', p5[3], { estado: 'descartado', motivo: 'no_interesa' }); cambiar('hunter', p5[4], { estado: 'en_gestion', proximo: hoy() });
  cambiar('hunter', p5[5], { estado: 'prospecto', proximo: dia(-4) }); // se le pasó la fecha: "Para contactar" la muestra vencida
  // 6) Diego le derivó a Sofía algo hoy a la tarde (para probar que no se pise)
  crear('oficial2', { empresa: 'TRANSPORTES RIO SA', origen: 'derivada', hunter_id: P.hunter.id, tipo: 'posicion', estado: 'planificada', fecha: hoy(), hora_desde: '15:00', hora_hasta: '17:00', lugar: 'Base Barracas' });
  // 7) Tomás hace dos semanas
  const g7 = crear('hunter2', { empresa: 'SUPERMERCADOS DEL VALLE SA', dueno_id: P.oficial.id, origen: 'propia', tipo: 'feria', estado: 'realizada', fecha: dia(-13), hora_desde: '10:00', hora_hasta: '14:00', asistentes: 60 });
  pros('hunter2', g7, [{ nombre: 'Andrea Cabrera', estado: 'prospecto' }, { nombre: 'Martín Godoy', estado: 'prospecto' }, { nombre: 'Lorena Ferreyra', estado: 'prospecto' }]);
  const p7 = DB.prospectos.filter((p) => p.gestion_id === g7.id);
  cambiar('hunter2', p7[0], { estado: 'alta', paquete: 'black' }); cambiar('hunter2', p7[1], { estado: 'alta', paquete: 'platinum' });
  // Lo ya existente no aparece como novedad, salvo lo nuevo de este ejemplo.
  DB.gestiones.forEach((g) => { if (g.id !== g1.id) g.visto_hunter = true; g.visto_dueno = true; });
  return { g1, g3, g4, g5 };
}

// Abre la app como una de las personas de ejemplo, con la nube simulada y Gestiones abierto.
async function abrirComo(browser, quien, o) {
  o = o || {};
  const U = USERS[quien];
  const p = await abrir(browser, { rol: quien, sinEsperar: true, w: o.w, h: o.h, touch: o.touch, antes: async (pg) => {
    await pg.route(REF + '/rest/v1/**', (r) => ruta(r, U));
    if (o.antes) await o.antes(pg);
  } });
  await p.waitForFunction(() => window._me && window._facLoaded && typeof window._gesOn === 'function' && window._gesOn(), null, { timeout: 30000 });
  if (o.gestiones !== false) {
    await p.evaluate(() => switchApp('gestiones'));
    await p.waitForFunction(() => document.querySelector('#ges-root .ges-tabs'), null, { timeout: 20000 });
  }
  return p;
}
module.exports = { abrirComo, sembrar, DB, P, USERS, RPC, hoy, dia };
