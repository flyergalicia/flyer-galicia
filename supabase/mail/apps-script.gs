/**
 * Armador de flyers: envío de mails de aviso.
 *
 * Vive en la cuenta de Gmail de la app (script.google.com), publicado como
 * "Aplicación web". La Edge Function auth-admin le hace un POST con
 * {secret, to, subject, body} y este script manda el mail desde ese Gmail.
 * Gratis: hasta 100 destinatarios por día.
 *
 * PASOS (una sola vez, con la sesión del Gmail de la app):
 *  1. Entrar a https://script.google.com → "Nuevo proyecto".
 *  2. Borrar lo que haya y pegar TODO este archivo. Ponerle de nombre
 *     "Avisos Armador".
 *  3. Cambiar SECRETO (abajo) por la clave larga que te pasa Claude.
 *  4. Guardar (ícono del disquete).
 *  5. "Implementar" → "Nueva implementación" → engranaje → "Aplicación web".
 *       - Ejecutar como: Yo
 *       - Quién tiene acceso: Cualquier usuario
 *     → "Implementar" → "Autorizar acceso" → elegir el Gmail de la app.
 *     Va a aparecer "Google no verificó esta app": tocar "Configuración
 *     avanzada" → "Ir a Avisos Armador (no seguro)" → "Permitir".
 *     (Es tu propio script; el cartel sale siempre para scripts personales.)
 *  6. Copiar la "URL de la aplicación web" (termina en /exec) y pasársela a
 *     Claude.
 *
 * Si algún día se cambia el código (ej. para sumar el diseño HTML de los mails): "Implementar" → "Administrar
 * implementaciones" → lápiz → Versión "Nueva versión" → "Implementar"
 * (así la URL no cambia).
 */
var SECRETO = 'PEGAR_ACA_LA_CLAVE';
var NOMBRE = 'Armador de flyers';
var MAX_DEST = 5;

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!SECRETO || SECRETO === 'PEGAR_ACA_LA_CLAVE' || d.secret !== SECRETO) return resp({ ok: false, error: 'no autorizado' });
    var to = String(d.to || '').split(',').map(function (x) { return x.trim(); })
      .filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
    if (!to.length || to.length > MAX_DEST) return resp({ ok: false, error: 'destinatarios inválidos' });
    var subject = String(d.subject || '').slice(0, 150);
    var body = String(d.body || '').slice(0, 4000);
    if (!subject || !body) return resp({ ok: false, error: 'faltan datos' });
    if (MailApp.getRemainingDailyQuota() < to.length) return resp({ ok: false, error: 'sin cupo diario' });
    // Versión con diseño (HTML, sin links ni imágenes) + texto plano de respaldo.
    // Si no llega 'html', sale sólo el texto.
    var html = String(d.html || '').slice(0, 20000);
    var op = { to: to.join(','), subject: subject, body: body, name: NOMBRE };
    if (html) op.htmlBody = html;
    MailApp.sendEmail(op);
    return resp({ ok: true });
  } catch (err) {
    return resp({ ok: false, error: String(err && err.message || err) });
  }
}

function resp(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
