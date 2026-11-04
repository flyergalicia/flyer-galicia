// Valida que el mensaje del commit siga Conventional Commits (lo llama el hook
// .githooks/commit-msg). Sin dependencias: el proyecto no tiene package.json.
// La prueba está en pruebas/u06_commit_msg.mjs.
import { readFileSync, realpathSync } from 'fs';
import { fileURLToPath } from 'url';

export const TIPOS = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const FORMATO = new RegExp(`^(?:${TIPOS.join('|')})(?:\\([^\\s()]+(?: [^\\s()]+)*\\))?!?: \\S`);
// Mensajes que arma Git solo: merge, revert y los de `git commit --fixup` (se van con el autosquash)
const AUTOMATICO = /^(?:Merge (?:branch|branches|remote-tracking branch|tag|commit|pull request)\b|(?:Revert|Reapply) ".+"|(?:fixup|squash|amend)! )/;

// Git le pasa al hook el texto sin limpiar: al escribirlo en el editor trae los
// comentarios (a veces antes del asunto, como en un squash) y con `commit -v` el diff.
function renglones(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const tijera = lineas.findIndex((l) => /^# -+ >8 -+$/.test(l));
  const sinDiff = tijera < 0 ? lineas : lineas.slice(0, tijera);
  const utiles = sinDiff.filter((l) => !l.startsWith('#'));
  return utiles.slice(utiles.findIndex((l) => l.trim()));
}

// Devuelve null si el mensaje está bien, o el motivo por el que no.
export function validarMensaje(texto) {
  const lineas = renglones(texto);
  const asunto = lineas[0] || '';
  if (!asunto.trim()) return 'El mensaje está vacío.';
  if (AUTOMATICO.test(asunto)) return null;
  if (!FORMATO.test(asunto)) return `La primera línea no tiene el formato pedido: "${asunto}"`;
  if (lineas[1] && lineas[1].trim()) return 'Después de la primera línea tiene que ir una línea en blanco.';
  return null;
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const motivo = validarMensaje(readFileSync(process.argv[2], 'utf8'));
  if (motivo) {
    console.error(`\nCommit rechazado. ${motivo}

Formato:  <tipo>[(alcance)][!]: <descripción>
Tipos:    ${TIPOS.join(', ')}
Ejemplo:  feat(promos): agrega el filtro por provincia
`);
    process.exit(1);
  }
}
