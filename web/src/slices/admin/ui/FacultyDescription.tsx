import type { ReactNode } from "react";
import type { FacultyRow } from "../model/faculties.ts";

/** What each permission gives, as the old app tells it under its name. */
const DESCRIPTIONS: Readonly<Record<string, ReactNode>> = {
  padron_buscar: (
    <>
      Le da <strong>su propia lista privada de empresas</strong> (su nombre → Base de datos): carga
      las suyas y las busca con la lupa por razón social o CUIT.{" "}
      <strong>Nadie más puede ver ni editar lo que cargue</strong>; vos sí podés consultarlo desde
      Data → Empresas por usuario.
    </>
  ),
  pegar_oficial: (
    <>Botón "Pegar" en cada bloque de asesor: saca nombre, celular y mail de un texto copiado.</>
  ),
  notas: <>Ítem "Bloc de notas" en el menú del usuario.</>,
  asesores_guardados: (
    <>
      Permite guardar asesores predeterminados y cargarlos con un click desde los títulos "Asesor
      1..4". Desde su nombre → <strong>Base de datos → Mis asesores</strong> los ve, los corrige,
      los sube por Excel o se los baja. La lista viaja con su cuenta (la ve desde cualquier
      computadora) y es privada.
    </>
  ),
  promos_buscar: (
    <>
      Agrega la pestaña "Promociones": pega las marcas del flyer y las cruza contra el buscador
      oficial de Galicia, con logo, fechas de vigencia y estado (vigente / vence este mes /
      vencida).
    </>
  ),
  guardar_trabajo: (
    <>
      El <strong>Historial</strong> queda guardado en el dispositivo (hoy se borra al cerrar o
      recargar la página) y el formulario se guarda solo mientras escribe: si cierra la pestaña a
      mitad de un flyer, al volver le ofrece <em>«Seguir con ese flyer»</em>. Todo vive en su
      navegador, nada sale a la nube.
    </>
  ),
  oficiales_sede: (
    <>
      Suma una barrita en <strong>Otros → Oficiales por sede</strong>, para los flyers donde el
      banco pone un referente por zona. Prendida: puede cargar <strong>hasta 8 oficiales</strong>{" "}
      (en vez de 4), ponerle a cada uno su <strong>ubicación</strong> (sale con el pin 📍 y en
      negrita arriba del nombre) y escribir el <strong>título</strong> que va arriba del bloque.
      Apagada, el armador queda igual que siempre. Los oficiales 5 al 8 se cargan igual que los
      otros (Pegar y asesores guardados); lo único que no los alcanza es la carga masiva: la base de
      empresas y el Excel del masivo siguen trayendo hasta 4.
    </>
  ),
  benchmark: (
    <>
      Agrega la solapa <strong>Benchmark</strong>: compara las promociones de Galicia contra BBVA,
      Macro, Supervielle y Santander, por rubro, por marca y por día de la semana, con el ganador
      según lo que devuelve en una compra de referencia. Es una herramienta interna: viene{" "}
      <strong>apagada para todos</strong> y la ves vos. Los datos se actualizan solos una vez por
      semana.
    </>
  ),
  estudio: (
    <>
      Agrega la solapa <strong>Estudio</strong> y el botón <strong>Guardar en Estudio</strong> en
      «Cambiar logos». Cada uno guarda <strong>sus propios diseños</strong> (logos cambiados,
      movidos y textos) sin que nadie más los vea, y puede <strong>pedirte que se publiquen</strong>
      : el pedido te llega a vos en Estudio → Pedidos, y al aprobarlo se crea un flyer nuevo en la
      barra de opciones para todos los que usan ese flyer. Vos ves los diseños de todos.
    </>
  ),
  tutorial_auto: (
    <>
      La primera vez que entra, se le abre solo el recorrido guiado por el armador (flechas sobre
      cada botón, por capítulos, se puede omitir). Siempre puede repetirlo desde su nombre → "Ver
      tutorial". Para verlo vos antes de activarlo: tu nombre → Ver tutorial.
    </>
  ),
  proponer_oficiales: (
    <>
      Sólo aplica al perfil <strong>Hunter</strong>: le agrega un botón «✎ Oficiales» en cada
      empresa para proponer agregar, corregir o quitar un oficial. El cambio{" "}
      <strong>no impacta</strong> hasta que lo aprueba el oficial dueño de esa empresa (o su
      suplente); hasta entonces, el flyer sigue saliendo con los datos de hoy.
    </>
  ),
  gestiones: (
    <>
      Registrar visitas, ferias y acciones en empresas, con sus prospectos y altas, y ver el
      tablero. El <strong>Hunter</strong> registra (botón «Registrar gestión»), el{" "}
      <strong>oficial</strong> deriva visitas de sus empresas y ve cómo le fue, y el{" "}
      <strong>Líder</strong> ve el tablero de su equipo. Sólo cuenta si el interruptor de arriba
      está en «Activo».
    </>
  ),
};

export function FacultyDescription({ row }: { readonly row: FacultyRow }) {
  if (!row.tab) return DESCRIPTIONS[row.key] ?? null;
  return (
    <>
      Habilita ese armador (flyer + legal propios; se administra en Config → Opciones). El selector
      aparece sólo si tiene más de una habilitada.
      {row.otherTab && (
        <>
          {" "}
          Con al menos una opción de esa solapa habilitada, el perfil ve la solapa{" "}
          <strong>{row.otherTab}</strong> en el header.
        </>
      )}
    </>
  );
}
