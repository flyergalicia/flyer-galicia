// Gestiones v2 (migración 045) de punta a punta, con tres personas a la vez
// (oficial, hunter y líder) sobre la misma nube simulada: CUIT de la empresa,
// Base de datos con su lista pegada, "que la asigne el líder", horario que no
// se puede pisar (y quién está libre), conversación, "No puedo ir", cambiar el
// hunter (líder sí, hunter no), alta con paquete, descarte con motivo,
// historial y tablero con / sin paquete.
const G = require('./nube_gestiones.cjs');
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); };
const espera = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 15000 }).then(() => true, () => false);
const quieto = (ms) => new Promise((r) => setTimeout(r, ms || 400));

module.exports = async (browser) => {
  const S = G.sembrar(), DB = G.DB, P = G.P;
  const of = await G.abrirComo(browser, 'oficial');
  const cap = (p, n) => p.screenshot({ path: __dirname + '/capturas/t93_' + n + '.png', fullPage: false }).catch(() => {});

  // ── Oficial: Mis empresas y la lista con CUIT ──
  ok(await espera(of, () => /30-90000111-8/.test(document.getElementById('ges-body').innerHTML)), 'Mis empresas muestra el CUIT de cada empresa');
  await of.evaluate(() => gesIr('lista'));
  ok(await espera(of, () => /ALIMENTOS DEL SUR SA/.test(document.getElementById('ges-list') && document.getElementById('ges-list').innerHTML)), 'la lista carga');
  let h = await of.evaluate(() => document.getElementById('ges-list').innerHTML);
  ok(/CUIT 30-90000111-8/.test(h), 'la lista muestra el CUIT');
  ok(/Por asignar/.test(h) && /Pidió que se la pasen a otro/.test(h), 'se ven "Por asignar" y "Pidió que se la pasen a otro"');
  ok(/1 mensaje nuevo/.test(h), 'la acción con una pregunta del hunter avisa "1 mensaje nuevo"');
  ok(/Base de datos/.test(h) && /de 15 contactados/.test(h), 'la base de datos muestra cuántos se contactaron de cuántos');
  await of.evaluate(() => { GES.q = '9000011'; gesListaPintar(); });
  h = await of.evaluate(() => document.getElementById('ges-list').innerHTML);
  ok(/ALIMENTOS DEL SUR/.test(h) && !/TEXTIL/.test(h), 'buscar por parte del CUIT encuentra la empresa');
  await of.evaluate(() => { GES.q = ''; gesListaPintar(); });
  await cap(of, '1_lista_oficial');

  // ── Oficial: detalle con la conversación, responde ──
  await of.evaluate((id) => gesAbrirDet(id), S.g1.id);
  ok(await espera(of, () => /flyer de combustible/.test(document.getElementById('ges-body').innerHTML)), 'el detalle muestra la pregunta de Sofía en la conversación');
  ok(await espera(of, () => !GES.msgN || !GES.msgN[GES.detG.id]), 'al abrirla, el mensaje queda leído');
  await of.evaluate(() => { document.getElementById('ges-msg-t').value = 'Llevá el de combustible, tienen 40 camiones.'; gesMsgEnviar(); });
  ok(await espera(of, () => /40 camiones/.test(document.getElementById('ges-body').innerHTML)), 'el oficial responde y su mensaje aparece');
  ok(DB.mensajes.some((m) => m.autor === P.oficial.id && /camiones/.test(m.texto)), 'el mensaje queda guardado');
  h = await of.evaluate(() => document.getElementById('ges-body').innerHTML);
  ok(/Historial/.test(h) && /se la deriv/.test(h), 'el historial cuenta quién se la derivó a quién');
  await cap(of, '2_detalle_conversacion');

  // ── Oficial: deriva una Base de datos pegando la lista ──
  await of.evaluate(() => gesIr('empresas'));
  await espera(of, () => document.getElementById('ges-emp-tb') && /SUPERMERCADOS/.test(document.getElementById('ges-emp-tb').innerHTML));
  await of.evaluate(() => { const i = GES._emps.findIndex((e) => /SUPERMERCADOS/.test(e.empresa)); gesDerivar(i); });
  await espera(of, () => document.getElementById('ges-der-ok'));
  await of.evaluate(() => { const b = [...document.querySelectorAll('.ges-pills[data-name=tipo] button')].find((x) => x.dataset.v === 'datos'); gesPill(b); });
  ok(await of.evaluate(() => document.querySelector('[data-ges-sec=hor]').hidden && !document.querySelector('[data-ges-sec=datos]').hidden), 'Base de datos esconde horario y lugar y muestra la lista');
  await of.evaluate((hid) => {
    document.getElementById('gf-hunter').value = hid; gesHunterCambio();
    document.getElementById('gf-datos').value = 'Nombre\tTeléfono\tCUIL o referencia\nLucía Pérez\t11 4444-1111\t27-11111111-7\nRamón Díaz\tramon.diaz@mail.com\tLegajo 55\nSin Nombre 123\t\t\n\t11 2222-3333\tSector B';
    gesDatosPrev();
  }, P.hunter3.id);
  h = await of.evaluate(() => document.getElementById('gf-datos-prev').innerHTML);
  ok(/3 personas listas/.test(h) && /1 con problemas/.test(h), 'vista previa de la lista: listas y con problemas (' + h.replace(/<[^>]+>/g, ' ').slice(0, 90) + ')');
  const antes = DB.gestiones.length;
  await of.evaluate(() => gesDerivarOk());
  ok(await espera(of, (n) => !document.getElementById('ges-ov'), antes), 'se deriva la base');
  const base = DB.gestiones.find((g) => g.tipo === 'datos' && /SUPERMERCADOS/.test(g.empresa));
  const per = base ? DB.prospectos.filter((p) => p.gestion_id === base.id) : [];
  ok(base && base.hunter_id === P.hunter3.id && !base.hora_desde && base.cuit === '30900006110', 'la base queda para Julia, sin horario y con el CUIT copiado del padrón');
  ok(per.length === 3 && per.every((p) => p.estado === 'a_contactar') && per.some((p) => p.cuil === '27111111117') && per.some((p) => p.contacto === 'ramon.diaz@mail.com' && p.referencia === 'Legajo 55'), 'las personas quedan "A contactar" con contacto, CUIL o referencia');

  // Una base de más de 1000 personas se lee entera (Supabase corta de a 1000).
  for (let i = 0; i < 1100; i++) DB.prospectos.push({ id: 'pp' + String(i).padStart(5, '0'), gestion_id: base.id, nombre: 'Persona ' + i, estado: i < 10 ? 'prospecto' : 'a_contactar', created_at: '2026-01-01T00:00:00Z' });
  await of.evaluate((id) => gesAbrirDet(id), base.id);
  ok(await espera(of, () => GES.detPros && GES.detPros.length === 1103), 'el detalle de una base de 1103 personas las trae todas');
  await of.evaluate(() => gesIr('agenda'));
  ok(await espera(of, () => /13 de 1103 contactados|0 de 1103 contactados|de 1103 contactados/.test(document.getElementById('ges-body').innerHTML)), 'la agenda cuenta las 1103 personas de la base');
  DB.prospectos = DB.prospectos.filter((p) => !/^pp/.test(p.id));
  // Si la lista de una base no se puede cargar, queda pegada en la acción para reintentar.
  await of.evaluate(() => gesIr('empresas'));
  await espera(of, () => document.getElementById('ges-emp-tb') && /CLINICA/.test(document.getElementById('ges-emp-tb').innerHTML));
  await of.route('**/rest/v1/gestion_prospectos**', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, body: JSON.stringify({ message: 'falla simulada' }), headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) : r.fallback()));
  await of.evaluate(() => { const i = GES._emps.findIndex((e) => /CLINICA/.test(e.empresa)); gesDerivar(i); });
  await espera(of, () => document.getElementById('ges-der-ok'));
  await of.evaluate((hid) => { const b = [...document.querySelectorAll('.ges-pills[data-name=tipo] button')].find((x) => x.dataset.v === 'datos'); gesPill(b);
    document.getElementById('gf-hunter').value = hid; gesHunterCambio(); document.getElementById('gf-datos').value = 'Mario Paz\t11 4444-0001\nNora Gil\t11 4444-0002'; gesDatosPrev(); gesDerivarOk(); }, P.hunter3.id);
  ok(await espera(of, () => document.getElementById('gp-paste') && /Mario Paz/.test(document.getElementById('gp-paste').value) && document.querySelector('.ges-paste').open), 'falla la carga de la lista: se abre la acción con la lista pegada para reintentar');
  await of.unroute('**/rest/v1/gestion_prospectos**');
  await of.evaluate(() => gesPasteOk());
  ok(await espera(of, () => GES.detPros.length === 2 && GES.detPros.every((p) => p.estado === 'a_contactar')), 'con un toque se cargan las dos personas, "A contactar"');

  // ── Oficial: no puede pisar el horario de Sofía; ve quién está libre ──
  await of.evaluate(() => { const i = GES._emps.findIndex((e) => /TEXTIL/.test(e.empresa)); gesDerivar(i); });
  await espera(of, () => document.getElementById('ges-der-ok'));
  await of.evaluate((a) => {
    document.getElementById('gf-hunter').value = a.h; document.getElementById('gf-fecha').value = a.f;
    document.getElementById('gf-hd').value = '16:00'; document.getElementById('gf-hh').value = '18:00'; gesHunterCambio();
  }, { h: P.hunter.id, f: G.hoy() });
  ok(await espera(of, () => /Libres a esa hora/.test((document.getElementById('gf-libres') || {}).innerHTML || '')), 'avisa que se pisa y muestra quién está libre a esa hora');
  h = await of.evaluate(() => document.getElementById('gf-ocup').innerHTML);
  ok(/Así no se puede guardar/.test(h) && /Tomás Ríos/.test(h) && !/>Sofía Paz</.test(h), 'el oficial no puede guardar así; Tomás aparece libre');
  await cap(of, '3_no_se_pisa');
  const n0 = DB.gestiones.length;
  await of.evaluate(() => gesDerivarOk()); await quieto(600);
  ok(DB.gestiones.length === n0 && await of.evaluate(() => !!document.getElementById('ges-ov')), 'al guardar se frena y la ventana queda abierta');
  await of.evaluate((id) => gesElegirHunter(id), P.hunter2.id);
  await of.evaluate(() => gesDerivarOk());
  ok(await espera(of, () => !document.getElementById('ges-ov')), 'eligiendo a Tomás (libre) se deriva');
  ok(DB.gestiones.some((g) => /TEXTIL/.test(g.empresa) && g.hunter_id === P.hunter2.id && g.hora_desde === '16:00:00'), 'queda para Tomás de 16 a 18');
  // La base también lo frena si alguien lo intenta igual.
  const intento = await of.evaluate(async (a) => (await _sb.from('gestiones').insert({ empresa: 'TEXTIL ARGENTA SA', origen: 'derivada', hunter_id: a.h, tipo: 'accion', estado: 'planificada', fecha: a.f, hora_desde: '16:30', hora_hasta: '17:00' }).select().single()).error, { h: P.hunter.id, f: G.hoy() });
  ok(intento && /GES_PISA/.test(intento.message), 'la base no deja pisar el horario aunque se salteé la pantalla');

  // ── Oficial: "Que la asigne el líder" ──
  await of.evaluate(() => { const i = GES._emps.findIndex((e) => /METALURGICA/.test(e.empresa)); gesDerivar(i); });
  await espera(of, () => document.getElementById('ges-der-ok'));
  ok(await of.evaluate(() => /Que la asigne el l/.test(document.getElementById('gf-hunter').innerHTML)), 'el oficial puede elegir "Que la asigne el líder"');
  await of.evaluate((f) => { document.getElementById('gf-hunter').value = '__lider'; gesHunterCambio(); document.getElementById('gf-fecha').value = f; }, G.dia(5));
  ok(await of.evaluate(() => !document.querySelector('[data-ges-sec=lider]').hidden && /Laura Méndez/.test(document.getElementById('gf-lider').innerHTML)), 'aparece el líder (el suyo primero)');
  await of.evaluate(() => gesDerivarOk());
  ok(await espera(of, () => !document.getElementById('ges-ov')), 'se manda al equipo');
  ok(DB.gestiones.filter((g) => !g.hunter_id && g.lider_id === P.lider.id).length === 2, 'queda sin hunter, para Laura');

  // ── Oficial: la agenda de los hunters (047) ──
  await of.evaluate(() => { GES.ag.ver = 'sem'; GES.ag.hun = ''; gesIr('agenda'); });
  ok(await espera(of, () => document.querySelector('#ges-body .ges-hcol')), 'el oficial ve la agenda por horarios (horas × días)');
  h = await of.evaluate(() => document.getElementById('ges-body').innerHTML);
  ok(/Sofía Paz/.test(h) && /Tomás Ríos/.test(h) && /Julia Sosa/.test(h), 'y arriba elige de qué hunter es la agenda, entre todos');
  ok(/08:00/.test(h) && /17:00/.test(h), 'la franja horaria va de 8 a 18');
  // Sofía: lo propio entero y lo del otro oficial, tapado y en rojo
  await of.evaluate(async () => { GES.ag.hun = (await _sb.rpc('gestiones_personas')).data.find((p) => /Sofía/.test(p.nombre)).id; gesAgPintar(); });
  h = await of.evaluate(() => document.getElementById('ges-body').innerHTML);
  ok(/ALIMENTOS DEL SUR/.test(h), 'lo de sus empresas se ve entero');
  ok(/Ocupado/.test(h) && !/TRANSPORTES RIO/.test(h), 'lo de otro oficial se ve como "Ocupado", sin la empresa');
  ok(await of.evaluate(() => { const o = document.querySelector('#ges-body .ges-hbl.tapado'); return !!o && o.tagName !== 'BUTTON' && !o.getAttribute('onclick'); }), 'un bloque "Ocupado" no se puede abrir');
  ok(/ocupados con empresas que no son tuyas/.test(h), 'la leyenda explica qué es el rojo');
  await cap(of, '7_agenda_oficial');
  // Día del equipo: una fila por hunter, una columna por hora
  await of.evaluate(() => gesAgVer('equipo'));
  ok(await espera(of, () => document.querySelector('#ges-body .ges-eqh')), 'el botón "Día del equipo" muestra hunters por hora');
  h = await of.evaluate(() => document.getElementById('ges-body').innerHTML);
  ok(/Sofía Paz/.test(h) && />Libre</.test(h), 'con los huecos libres de cada uno');
  await cap(of, '7b_dia_equipo');
  // Semana / Mes
  await of.evaluate(() => gesAgVer('mes'));
  ok(await espera(of, () => document.querySelector('#ges-body .ges-mes')), 'el botón Mes muestra el calendario del mes');
  h = await of.evaluate(() => document.getElementById('ges-body').innerHTML);
  ok(/ALIMENTOS DEL SUR/.test(h) && !/ges-hbl.*tapado/.test(h), 'en el mes va lo propio, sin los "Ocupado"');
  ok(await of.evaluate(() => /^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) \d{4}$/.test(document.querySelector('.ges-ag-rango').textContent)), 'y el rótulo dice el mes y el año');
  await cap(of, '8_mes_oficial');
  const mes0 = await of.evaluate(() => GES.ag.mes);
  await of.evaluate(() => gesAgIr(1));
  ok(await espera(of, (m) => GES.ag.mes !== m, mes0) && await of.evaluate(() => GES.ag.mes) > mes0, 'la flecha mueve de a un mes');
  await of.evaluate(() => { gesAgIr(0); gesAgVer('sem'); });
  ok(await espera(of, () => !!document.querySelector('#ges-body .ges-hcol') && !document.querySelector('.ges-mes')), 'y se vuelve a la semana por horarios');
  // Al asignar: elegir el hunter abre su agenda al lado, y tocar un hueco pone el horario
  await of.evaluate(() => gesAgendar());
  ok(await espera(of, () => document.getElementById('gf-hunter')), 'se abre "Asignar a un hunter"');
  await of.evaluate(async () => {
    const h = (await _sb.rpc('gestiones_personas')).data.find((p) => /Sofía/.test(p.nombre)).id;
    document.getElementById('gf-hunter').value = h; gesHunterCambio();
  });
  ok(await espera(of, () => { const p = document.getElementById('gf-ag'); return p && !p.hidden && /La semana de/.test(p.innerHTML); }), 'al elegir el hunter se ve su semana en la misma ventana');
  ok(await of.evaluate(() => !document.querySelector('#gf-ag .ges-hbl button') && !!document.querySelector('#gf-ag .ges-hbl')), 'los bloques del panel son sólo para mirar');
  await cap(of, '7c_panel_agenda');
  await of.evaluate(() => {
    const c = document.querySelector('#gf-ag .ges-hcol'), r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: r.top + 46 * 2 + 5, clientX: r.left + 5 }));
  });
  ok(await espera(of, () => /^\d\d:\d\d$/.test(document.getElementById('gf-hd').value)), 'tocar un hueco libre completa el horario (' + await of.evaluate(() => document.getElementById('gf-hd').value + ' a ' + document.getElementById('gf-hh').value) + ')');
  await of.evaluate(() => gesCerrar());

  // ── Hunter (Sofía): agenda, mensaje, "No puedo ir", alta con paquete, descarte con motivo ──
  const hu = await G.abrirComo(browser, 'hunter');
  await hu.evaluate(() => gesIr('agenda'));
  ok(await espera(hu, () => /Para contactar \(/.test(document.getElementById('ges-body').innerHTML)), 'la agenda del hunter muestra "Para contactar"');
  // El hunter arma su propia base de datos y ve SU semana al hacerlo
  await hu.evaluate(() => gesAgendar());
  ok(await espera(hu, () => document.querySelector('.ges-pills [data-v="datos"]')), 'el hunter puede elegir "Base de datos" al agendar');
  await hu.evaluate(() => { gesPill(document.querySelector('.ges-pills [data-v="datos"]')); });
  ok(await hu.evaluate(() => !!document.getElementById('gf-datos')), 'y le aparece dónde pegar la lista de personas');
  await hu.evaluate(() => { gesPill(document.querySelector('.ges-pills [data-v="accion"]')); gesOcupForm(); });
  ok(await espera(hu, () => { const p = document.getElementById('gf-ag'); return p && !p.hidden && /Tu semana/.test(p.innerHTML); }), 'y al agendar algo con horario ve su propia semana');
  await hu.evaluate(() => gesCerrar());
  h = await hu.evaluate(() => document.getElementById('ges-body').innerHTML);
  ok(/Walter Ibáñez/.test(h) && /TRANSPORTES RIO SA/.test(h), 'con la persona a llamar y lo que tiene hoy');
  ok(/Ximena Toledo/.test(h) && /desde el/.test(h), 'y la que quedó vencida, marcada "desde el …"');
  await cap(hu, '4_agenda_hunter');
  // Ver todas: vencidas y de hoy, y al tocar una se abre su acción con esa persona marcada
  await hu.evaluate(() => gesContactarTodas());
  ok(await espera(hu, () => /Vencidas \(1\)/.test((document.getElementById('ges-ov') || {}).innerHTML || '')), '"Ver todas" separa las vencidas');
  h = await hu.evaluate(() => document.getElementById('ges-ov').innerHTML);
  ok(/Hoy \(1\)/.test(h) && /Ximena Toledo/.test(h) && /Walter Ibáñez/.test(h), 'y las de hoy, con todas las personas');
  await cap(hu, '9_contactar_todas');
  await hu.evaluate(() => { const b = Array.prototype.find.call(document.querySelectorAll('#ges-ov .ges-band-i'), (x) => /Ximena/.test(x.textContent)); b.click(); });
  ok(await espera(hu, () => document.querySelector('#ges-body .ges-foco')), 'al tocarla se abre la acción con esa persona marcada');
  ok(await hu.evaluate(() => /Ximena/.test(document.querySelector('#ges-body .ges-foco').textContent)), 'y la marcada es ella');
  await hu.evaluate(() => gesVolver());
  await espera(hu, () => !document.querySelector('#ges-body .ges-foco'));
  ok(await hu.evaluate(async () => { await gesMsgNuevos(true); return !!(GES.msgN && Object.keys(GES.msgN).length); }), 'le llega el mensaje del oficial como novedad');
  await hu.evaluate((id) => gesAbrirDet(id), S.g1.id);
  ok(await espera(hu, () => /40 camiones/.test(document.getElementById('ges-body').innerHTML)), 've la respuesta del oficial');
  ok(await hu.evaluate(() => !/Cambiar hunter|Asignar a un hunter/.test(document.querySelector('.ges-acts').innerHTML) && /No puedo ir/.test(document.querySelector('.ges-acts').innerHTML)), 'el hunter no puede cambiar el hunter, pero sí avisar que no puede');
  await hu.evaluate(() => gesNoPuedo());
  await espera(hu, () => document.getElementById('ges-np-ok'));
  await hu.evaluate(() => { document.getElementById('gf-np').value = 'Me superpone con una capacitación'; gesNoPuedoOk(); });
  ok(await espera(hu, () => /Avisaste que no podés/.test(document.getElementById('ges-body').innerHTML)), 'queda "Avisaste que no podés" y sigue en su agenda');
  ok(G.DB.gestiones.find((g) => g.id === S.g1.id).no_puede_at && G.DB.mensajes.some((m) => m.tipo === 'no_puedo' && /capacitaci/.test(m.texto)), 'se guarda el aviso y llega como mensaje');
  // El hunter no puede cambiarse el hunter ni pasándole por arriba a la pantalla.
  await hu.evaluate(async (a) => { await _sb.from('gestiones').update({ hunter_id: a.h }).eq('id', a.id); }, { h: P.hunter3.id, id: S.g1.id });
  ok(G.DB.gestiones.find((g) => g.id === S.g1.id).hunter_id === P.hunter.id, 'la base no deja que el hunter se la pase a otro');
  // Alta con paquete
  await hu.evaluate((id) => gesAbrirDet(id), S.g5.id);
  await espera(hu, () => /Walter Ibáñez/.test(document.getElementById('ges-body').innerHTML));
  await hu.evaluate(() => { const i = GES.detPros.findIndex((p) => /Walter/.test(p.nombre)); gesProsCampo(i, 'estado', 'alta'); });
  ok(await espera(hu, () => /Con qué paquete fue el alta/.test((document.getElementById('ges-ov') || {}).innerHTML || '')), 'pasar a Alta pregunta con qué paquete fue');
  h = await hu.evaluate(() => document.getElementById('ges-ov').innerHTML);
  ok(/Sin paquete \(Caja de Ahorro\)/.test(h) && /Eminent Black/.test(h), 'ofrece "Sin paquete (Caja de Ahorro)" y los paquetes');
  await cap(hu, '5_alta_con_paquete');
  await hu.evaluate(() => gesElegido('caja'));
  ok(await espera(hu, () => GES.detPros.some((p) => /Walter/.test(p.nombre) && p.estado === 'alta' && p.paquete === 'caja')), 'queda el alta sin paquete');
  // Cancelar la pregunta no cambia nada
  await hu.evaluate(() => { const i = GES.detPros.findIndex((p) => /Ximena/.test(p.nombre)); gesProsCampo(i, 'estado', 'alta'); });
  await espera(hu, () => document.getElementById('ges-ov'));
  await hu.evaluate(() => gesElegido(null)); await quieto();
  ok(G.DB.prospectos.find((p) => /Ximena/.test(p.nombre)).estado === 'prospecto', 'si cancela, el prospecto queda como estaba');
  await hu.evaluate(() => { const i = GES.detPros.findIndex((p) => /Ximena/.test(p.nombre)); gesProsCampo(i, 'estado', 'descartado'); });
  ok(await espera(hu, () => /Por qué se descarta/.test((document.getElementById('ges-ov') || {}).innerHTML || '')), 'descartar pregunta el motivo');
  await hu.evaluate(() => gesElegido('no_contesta'));
  ok(await espera(hu, () => GES.detPros.some((p) => /Ximena/.test(p.nombre) && p.motivo === 'no_contesta')), 'queda descartada por "No contesta"');
  // La base exige el paquete del alta.
  const sinPaq = await hu.evaluate(async () => { const p = GES.detPros.find((x) => /Valeria/.test(x.nombre)); return (await _sb.from('gestion_prospectos').update({ estado: 'alta', paquete: null }).eq('id', p.id).select().single()).error; });
  ok(sinPaq && /GES_PAQ/.test(sinPaq.message), 'la base no acepta un alta sin paquete');
  ok(await espera(hu, () => /marcó el alta de Walter/.test(document.getElementById('ges-body').innerHTML)), 'el historial anota el alta con su paquete');

  // ── Líder: bandejas, asignar, cambiar hunter ──
  const li = await G.abrirComo(browser, 'lider');
  ok(await li.evaluate(() => GES.tab === 'agenda'), 'la líder entra en la agenda del equipo');
  ok(await espera(li, () => /Por asignar \(2\)/.test(document.getElementById('ges-body').innerHTML)), 've "Por asignar (2)"');
  h = await li.evaluate(() => document.getElementById('ges-body').innerHTML);
  ok(/Piden que se la pasen a otro \(2\)/.test(h) && /capacitaci/.test(h), 've "Piden que se la pasen a otro (2)" con el motivo');
  await cap(li, '6_agenda_lider');
  // Asignar la feria de LOGISTICA (por asignar) a Julia
  const feria = DB.gestiones.find((g) => /LOGISTICA/.test(g.empresa));
  await li.evaluate((id) => gesAbrirDet(id, false, true), feria.id);
  ok(await espera(li, () => document.getElementById('ges-ra-ok')), 'desde la bandeja abre "Asignar a un hunter"');
  h = await li.evaluate(() => document.getElementById('gf-hunter').innerHTML);
  ok(/Julia Sosa/.test(h) && /Tomás Ríos/.test(h) && /Sofía Paz/.test(h), 'elige entre los hunters de su equipo');
  await li.evaluate((id) => { document.getElementById('gf-hunter').value = id; gesOcupForm(); gesReasignarOk(); }, P.hunter3.id);
  ok(await espera(li, (a) => { return true; }) && await (async () => { await quieto(800); return DB.gestiones.find((g) => g.id === feria.id).hunter_id === P.hunter3.id; })(), 'queda asignada a Julia');
  // Pasar la de METALURGICA (Tomás no puede) a Sofía
  await li.evaluate((id) => gesAbrirDet(id, false, true), S.g4.id);
  await espera(li, () => document.getElementById('ges-ra-ok'));
  await li.evaluate((id) => { document.getElementById('gf-hunter').value = id; gesOcupForm(); gesReasignarOk(); }, P.hunter.id);
  await quieto(900);
  const g4 = DB.gestiones.find((g) => g.id === S.g4.id);
  ok(g4.hunter_id === P.hunter.id && !g4.no_puede_at && g4.visto_hunter === false, 'la líder se la pasa a Sofía: se borra el "no puedo" y a Sofía le aparece como nueva');
  ok(DB.eventos.some((e) => e.gestion_id === g4.id && e.que === 'hunter' && e.detalle.de === P.hunter2.id && e.detalle.a === P.hunter.id && e.quien === P.lider.id), 'el historial anota de quién a quién y quién la pasó');
  // La líder puede guardar aunque se pise (con aviso)
  const forz = await li.evaluate(async (a) => (await _sb.from('gestiones').update({ hora_desde: '15:30', hora_hasta: '16:30', fecha: a.f }).eq('id', a.id).select().single()).error, { f: G.hoy(), id: S.g1.id });
  ok(!forz, 'la líder sí puede guardar en un horario que se pisa (lo decide ella)');

  // ── Oficial: tablero con / sin paquete y motivos ──
  await of.evaluate(() => { GES.f.per = 'todo'; gesIr('tablero'); });
  ok(await espera(of, () => /Con paquete:/.test(document.getElementById('ges-body').innerHTML)), 'el tablero separa con paquete y sin paquete');
  h = await of.evaluate(() => document.getElementById('ges-body').innerHTML);
  ok(/Sin paquete: 2/.test(h) && /Por qué se descartan/.test(h) && /No contesta/.test(h), 'cuenta las altas sin paquete y muestra los motivos de descarte');
  ok(/Bases de datos:/.test(h), 'muestra cuántas personas de bases de datos se contactaron');
  // 048: lo derivado que nadie asignó va aparte y no infla las planificadas
  const kp = await of.evaluate(() => GES.tablero.kpis);
  const sinA = DB.gestiones.filter((g) => g.estado === 'planificada' && g.tipo !== 'datos' && !g.hunter_id && (g.dueno_id === P.oficial.id || g.creada_por === P.oficial.id)).length;
  ok(kp.sin_asignar === sinA && sinA > 0, 'cuenta aparte lo derivado que nadie asignó (' + kp.sin_asignar + ')');
  ok(/sin asignar/.test(h) && /No cuenta en los n/.test(h), 'y lo avisa, aclarando que no entra en los números');
  ok(await of.evaluate(() => !GES.tablero.por_hunter.some((x) => !x.id)), 'ninguna fila de hunter queda sin dueño');
  ok(!/NaN|undefined/.test(h), 'tablero sin NaN ni undefined');
  await cap(of, '7_tablero');

  // ── 049: filtro de oficiales que no se achica, y la nota de por qué el
  //         tablero da menos que la lista ──
  h = await of.evaluate(() => document.getElementById('ges-body').innerHTML);
  ok(/El tablero cuenta/.test(h) && /se ve todo, sin per/.test(h), 'el tablero explica que cuenta sólo el período y las acciones con hunter');
  // La líder ve lo de los dos oficiales: con uno elegido, el desplegable no se achica.
  await li.evaluate(() => gesIr('tablero'));
  await espera(li, () => GES.tablero);
  const duenos0 = await li.evaluate(() => (GES.tablero.duenos || []).length);
  await li.evaluate((id) => { GES.f.due = id; gesTablero(); }, P.oficial.id);
  await espera(li, () => GES.f.due && GES.tablero);
  ok(await li.evaluate((n) => (GES.tablero.duenos || []).length === n, duenos0) && duenos0 >= 2,
    'con un oficial elegido, el desplegable "Oficial Payroll" sigue trayendo a todos (' + duenos0 + ')');
  ok(await li.evaluate((id) => (GES.tablero.por_dueno || []).every((x) => x.id === id), P.oficial.id), 'y lo que se cuenta sí respeta el filtro');
  await li.evaluate(() => { GES.f.due = ''; gesTablero(); });

  // ── 050: período por trimestre y por mes, con Shift para sumar ──
  const sel = () => li.evaluate(() => GES.f.meses.join(','));
  await li.evaluate(() => gesPerSet('q'));
  ok(await espera(li, () => document.querySelector('.ges-qp') && GES.tablero), 'elegir "Por trimestre o mes…" muestra el panel con los trimestres');
  ok(await li.evaluate(() => [...document.querySelectorAll('.ges-q-h .ges-q-b')].map((b) => b.textContent.slice(0, 2)).join(',') === '1Q,2Q,3Q,4Q'), 'están 1Q, 2Q, 3Q y 4Q');
  ok(await li.evaluate(() => GES.f.meses.length === 3), 'arranca con el trimestre de hoy');
  await li.evaluate(() => gesQClic(1, { shiftKey: false })); await espera(li, () => GES.tablero);
  ok(await sel() === '01,02,03', 'un clic en 1Q elige enero, febrero y marzo');
  await li.evaluate(() => gesQClic(3, { shiftKey: true })); await espera(li, () => GES.tablero);
  ok(await sel() === '01,02,03,07,08,09', 'con Shift, 3Q se suma a 1Q');
  await li.evaluate(() => gesQClic(1, { shiftKey: true })); await espera(li, () => GES.tablero);
  ok(await sel() === '07,08,09', 'con Shift sobre uno ya elegido, se saca');
  await li.evaluate(() => gesQClic(2, { shiftKey: false })); await espera(li, () => GES.tablero);
  ok(await sel() === '04,05,06', 'sin Shift queda sólo lo tocado');
  await li.evaluate(() => gesQAbrir(2));
  ok(await espera(li, () => document.querySelectorAll('.ges-q-m .ges-q-b').length === 3), 'la flecha abre los 3 meses del 2Q');
  await li.evaluate(() => gesMesClic('05', { shiftKey: false })); await espera(li, () => GES.tablero);
  ok(await sel() === '05', 'un clic en un mes elige sólo ese mes');
  await li.evaluate(() => gesMesClic('06', { shiftKey: true })); await espera(li, () => GES.tablero);
  ok(await sel() === '05,06', 'con Shift se suma otro mes');
  ok(await li.evaluate(() => gesQTxt()) === 'mayo y junio de ' + new Date().getFullYear(), 'la nota dice qué meses se están mirando');
  await li.evaluate(() => gesMesClic('05', { shiftKey: true })); await li.evaluate(() => gesMesClic('06', { shiftKey: true }));
  ok(await sel() === '06', 'el último mes elegido no se puede sacar (nunca queda vacío)');
  // El pedido a la base viaja con los meses, y lo que no cae en ellos no cuenta
  const mes = await li.evaluate(() => (new Date(Date.now() - 6 * 86400000)).toISOString().slice(0, 7).slice(5));
  await li.evaluate((m) => { GES.f.meses = [m]; gesTablero(); }, mes);
  await espera(li, () => GES.tablero);
  ok(await li.evaluate(() => GES.tablero.kpis.visitas > 0), 'el mes de las acciones realizadas las cuenta');
  await li.evaluate(() => { GES.f.anio = 2019; gesTablero(); });
  ok(await espera(li, () => GES.tablero && GES.tablero.kpis.visitas === 0), 'otro año no cuenta nada');
  await cap(li, '7e_tablero_trimestre');
  await li.evaluate(() => { GES.f.per = '90'; gesTablero(); });

  // ── 049: tipo a la vista, filtros por tipo y por fecha, leído / no leído ──
  await of.evaluate(() => gesIr('lista'));
  await espera(of, () => document.getElementById('ges-list'));
  h = await of.evaluate(() => document.getElementById('ges-list').innerHTML);
  ok(/ges-c-tipo/.test(h) && /Base de datos<\/span>/.test(h), 'cada gestión de la lista muestra su tipo');
  const nTodas = await of.evaluate(() => document.querySelectorAll('#ges-list .ges-row').length);
  await of.evaluate(() => { GES.fTipo = 'datos'; gesListaPintar(); });
  ok(await of.evaluate(() => { const l = [...document.querySelectorAll('#ges-list .ges-row')]; return l.length > 0 && l.length < 99 && l.every((x) => /Base de datos/.test(x.innerHTML)); }), 'el filtro por tipo deja sólo las bases de datos');
  await of.evaluate(() => { GES.fTipo = ''; GES.fD1 = '2099-01-01'; gesListaPintar(); });
  ok(await of.evaluate(() => document.querySelectorAll('#ges-list .ges-row').length === 0), 'el filtro por fecha recorta la lista');
  await of.evaluate(() => gesListaLimpiar());
  ok(await espera(of, (n) => document.querySelectorAll('#ges-list .ges-row').length === n, nTodas), '"Limpiar filtros" las vuelve a mostrar todas');
  // Dejar sin leer: vuelve a quedar marcada
  await of.evaluate((id) => gesAbrirDet(id), S.g1.id);
  await espera(of, (id) => GES.detG && GES.detG.id === id, S.g1.id);
  await of.evaluate(() => gesNoLeida());
  ok(await espera(of, () => GES.tab === 'lista' && !GES.det), 'desde la acción, "Dejar sin leer" vuelve a la lista');
  ok(await espera(of, (id) => { const g = (GES.lista || []).find((x) => x.id === id); return g && (g.visto_dueno === false || !!(GES.msgN && GES.msgN[id])); }, S.g1.id), 'y la acción queda marcada otra vez');
  ok(await espera(of, () => { const t = document.querySelector('.ges-tool'); return !!t && /Marcar todas como le/.test(t.innerHTML); }), 'con algo marcado aparece "Marcar todas como leídas"');
  await of.evaluate(() => gesLeerTodas());
  // Se espera a que la lista esté pintada (la pantalla se repinta sola cuando
  // baja el numerito de avisos): sin el guardia, el chequeo podía caer justo en
  // un "Cargando…" y dar por fallado algo que estaba bien.
  ok(await espera(of, () => { const t = document.querySelector('.ges-tool'); return !!t && !!document.getElementById('ges-list') && !document.querySelector('#ges-list .ges-row.nueva') && !/Marcar todas como le/.test(t.innerHTML); }), '"Marcar todas como leídas" saca todos los carteles');

  // ── 049: el hunter puede ver un solo día; quien asigna arranca por el equipo ──
  ok(await of.evaluate(() => { GES.ag.ver = null; return gesAgVerDef(); }) === 'equipo', 'el oficial abre la agenda viendo el día de todos los hunters');
  ok(await hu.evaluate(() => { GES.ag.ver = null; return gesAgVerDef(); }) === 'sem', 'el hunter, su semana');
  await hu.evaluate(() => { gesIr('agenda'); });
  await espera(hu, () => document.querySelector('.ges-ag-ver'));
  await hu.evaluate(() => gesAgVer('dia'));
  ok(await espera(hu, () => GES.ag.ver === 'dia' && document.querySelectorAll('#ges-body .ges-hcol').length === 1), 'el hunter ve un solo día por horarios');
  ok(await hu.evaluate(() => { const d = GES.ag.dia, n = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][gesDiaSem(d)]; return document.querySelector('.ges-hth').textContent.indexOf(n) === 0; }), 'y el encabezado dice el día que corresponde');
  await cap(hu, '7d_hunter_dia');
  await hu.evaluate(() => gesAgVer('sem'));

  // ── Instructivo: el capítulo Gestiones del tutorial, para cada perfil ──
  const recorrer = (p) => p.evaluate(async () => {
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    _tourStart('gestiones'); await espera(300);
    const vistos = [];
    for (let k = 0; k < 12 && _tour; k++) {
      const paso = _tour.pasos[_tour.i]; if (paso.cap !== 'gestiones') break;
      const el = document.getElementById('fg-tour-hl'), tip = document.querySelector('#fg-tour-tip h4');
      const t = typeof paso.target === 'function' ? paso.target() : document.querySelector(paso.target);
      vistos.push({ titulo: tip ? tip.textContent : '', enSolapa: !!(t && t.closest && t.closest('#ges-root')) });
      _tourNext(); await espera(350);
    }
    if (window._tour) _tourEnd();
    return vistos;
  });
  let pasos = await recorrer(of);
  ok(pasos.map((x) => x.titulo).join(' | ') === 'Gestiones comerciales | Derivar una acción | La agenda | Los horarios no se pisan | Cada acción por dentro | El tablero', 'tutorial del oficial: ' + pasos.map((x) => x.titulo).join(' | '));
  ok(pasos.slice(1).every((x) => x.enSolapa), 'cada paso señala su solapa dentro de Gestiones');
  pasos = await recorrer(hu);
  ok(pasos.map((x) => x.titulo).join(' | ') === 'Registrá la gestión | Gestiones comerciales | Mi agenda | Los horarios no se pisan | Cada acción por dentro | El tablero', 'tutorial del hunter: ' + pasos.map((x) => x.titulo).join(' | '));
  pasos = await recorrer(li);
  ok(pasos.map((x) => x.titulo).join(' | ') === 'Gestiones comerciales | La agenda del equipo | Los horarios no se pisan | Cada acción por dentro | El tablero', 'tutorial de la líder: ' + pasos.map((x) => x.titulo).join(' | '));
  await li.evaluate(async () => { _tourStart('gestiones'); await new Promise((r) => setTimeout(r, 300)); _tourNext(); await new Promise((r) => setTimeout(r, 400)); });
  await cap(li, '8_tutorial_lider');
  await li.evaluate(() => { if (window._tour) _tourEnd(); });
  const errs = [of, hu, li].reduce((s, p) => s + p.errores.length, 0);
  console.log('errores: ' + errs);
};
