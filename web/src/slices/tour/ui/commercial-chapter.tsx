// The chapter of Gestiones, rewritten by profile (officer, hunter, leader): derive, the agenda,
// schedules that do not overlap, each action inside and the dashboard. Each step goes to its solapa
// inside Gestiones; while its code is still coming down, it shows on the tab of the header.
import type { TourChapter } from "../model/plan.ts";
import { TO_HUNTER, toCommercial } from "../model/prepare.ts";
import type { TourProfile } from "../model/profile.ts";
import { commercialTarget } from "../model/targets.ts";
import type { ReactNode } from "react";

type Who = "hunter" | "leader" | "officer";

function whoOf({ isHunter, isLeader }: TourProfile): Who {
  if (isHunter) return "hunter";
  return isLeader ? "leader" : "officer";
}

const INTRO: Readonly<Record<Who, ReactNode>> = {
  hunter: (
    <>
      Acá está tu trabajo: lo que te derivaron, lo que registraste, las{" "}
      <strong>bases de datos</strong> para contactar, los prospectos y las altas de cada acción.
      Cada empresa muestra su <strong>CUIT</strong>.
    </>
  ),
  leader: (
    <>
      Acá supervisás a tu equipo de hunters: la agenda de cada uno, lo que te mandan para{" "}
      <strong>asignar</strong>, quien pidió que <strong>le pasen una acción a otro</strong>, y el
      tablero.
    </>
  ),
  officer: (
    <>
      Acá le pasás acciones a los hunters (o al líder, para que las reparta) y ves cómo les fue:
      prospectos, altas con o sin paquete y conversión. Cada empresa muestra su{" "}
      <strong>CUIT</strong>.
    </>
  ),
};

const AGENDA_TITLE: Readonly<Record<Who, string>> = {
  hunter: "Mi agenda",
  leader: "La agenda del equipo",
  officer: "La agenda",
};

const AGENDA: Readonly<Record<Who, ReactNode>> = {
  hunter: (
    <>
      Tu semana con los horarios puestos en su lugar, como un calendario (de 8 a 18; se estira sola
      si tenés algo más temprano o más tarde). Tocá un hueco libre y agendás a esa hora. Con{" "}
      <strong>Día</strong> ves un solo día y con <strong>Mes</strong> el mes entero. Arriba:{" "}
      <strong>Para contactar</strong> (las personas a las que les pusiste fecha de próximo contacto;
      las que se pasaron de fecha siguen ahí, en rojo, y con <strong>Ver todas</strong> las ves a
      todas) y <strong>Bases para trabajar</strong>.
    </>
  ),
  leader: (
    <>
      Tres formas de verla: <strong>Semana</strong> es la agenda de un hunter por horarios (elegís
      cuál arriba), <strong>Día del equipo</strong> pone una fila por hunter y una columna por hora
      para ver de un vistazo quién tiene lugar, y <strong>Mes</strong> el mes completo. Tocá un
      hueco o <strong>Libre</strong> y le asignás algo a esa hora. Arriba, las bandejas{" "}
      <strong>Por asignar</strong> (lo que los oficiales te mandan) y{" "}
      <strong>Piden que se la pasen a otro</strong>.
    </>
  ),
  officer: (
    <>
      Arranca en <strong>Día del equipo</strong>: todos los hunters, una columna por hora, para ver
      de un vistazo quién tiene lugar. Con <strong>Semana</strong> mirás la agenda de uno solo por
      horarios (lo elegís arriba) y con <strong>Mes</strong> el mes completo. Lo de tus empresas se
      ve entero; lo que tienen con otros oficiales aparece en <strong>rojo</strong> como{" "}
      <strong>Ocupado</strong>: sabés que no hay lugar, no de qué se trata. Tocá un hueco libre y le
      asignás algo a esa hora; con <strong>Pegar desde Excel</strong> cargás varias de una.
    </>
  ),
};

/** Who may save even when it overlaps, and says so: the administrator first. */
function whoSavesAnyway({ isAdmin, isLeader }: TourProfile): string | null {
  if (isAdmin) return "administrador";
  return isLeader ? "líder" : null;
}

function scheduleText(profile: TourProfile): ReactNode {
  const saver = whoSavesAnyway(profile);
  return (
    <>
      Un hunter no puede estar en dos lugares: al asignarle algo el{" "}
      <strong>horario es obligatorio</strong> (Mañana y Tarde lo completan de un toque) y si choca
      con otra cosa <strong>no se guarda</strong> y te muestra{" "}
      <strong>quién está libre a esa hora</strong>. Al elegir el hunter, en la misma ventana se abre{" "}
      <strong>su semana</strong>: tocás un hueco libre y se completan el día y el horario.
      {saver && ` Como ${saver} podés guardar igual: te pregunta antes.`} Las bases de datos no
      tienen horario.
    </>
  );
}

function insideText({ isHunter }: TourProfile): ReactNode {
  return (
    <>
      Tocá una acción para ver sus <strong>prospectos</strong>. Al pasar a alguien a{" "}
      <strong>Alta</strong> te pregunta si fue <strong>con paquete o sin paquete</strong>; al{" "}
      <strong>Descartarlo</strong>, el motivo (ya cobra en Galicia, no le interesa, no contesta…); y
      a los que siguen en gestión les ponés fecha de <strong>próximo contacto</strong>. Al pie, la{" "}
      <strong>Conversación</strong> (hunter, oficial y líder se escriben ahí) y el{" "}
      <strong>Historial</strong> (quién la derivó, a quién se la pasaron, cambios de horario,
      altas).
      {isHunter ? (
        <>
          {" "}
          Si no podés ir, <strong>No puedo ir</strong>: le avisa al oficial y al líder para que se
          la pasen a otro.
        </>
      ) : (
        " La pasan a otro hunter el líder o quien la derivó (mientras no esté realizada); el hunter, nunca."
      )}{" "}
      En la lista, cada acción muestra su <strong>tipo</strong> y podés filtrar por tipo, estado,
      hunter y <strong>fechas</strong>. Las marcadas (novedades y mensajes nuevos) se destildan al
      abrirlas: adentro, <strong>Dejar sin leer</strong> vuelve a marcarla, y arriba{" "}
      <strong>Marcar todas como leídas</strong> las saca a todas.
    </>
  );
}

const DASHBOARD: ReactNode = (
  <>
    Acciones, prospectos, altas y conversión, con las altas separadas{" "}
    <strong>con paquete / sin paquete</strong> (Caja de Ahorro) y por paquete,{" "}
    <strong>por qué se descartan</strong> y cuántos de las bases de datos ya se contactaron. Filtrás
    por período, tipo, hunter y oficial Payroll, y lo bajás en <strong>Excel</strong>. Ojo: cuenta
    sólo el período elegido y las acciones con hunter, así que da menos que la lista de la otra
    solapa (ahí está todo).
  </>
);

export function commercialChapter(profile: TourProfile): TourChapter<ReactNode> {
  const who = whoOf(profile);
  return {
    id: "gestiones",
    title: "Gestiones",
    applies: profile.commercialActionsOn,
    steps: [
      {
        target: "hunterRegister",
        applies: who === "hunter",
        title: "Registrá la gestión",
        text: (
          <>
            Después de cada visita o feria, con la empresa elegida, tocá{" "}
            <strong>Registrar gestión</strong> (o <kbd>Alt</kbd>+<kbd>G</kbd>). El oficial que te la
            cedió se completa solo.
          </>
        ),
        prepare: TO_HUNTER,
      },
      {
        target: "commercialTab",
        title: "Gestiones comerciales",
        text: INTRO[who],
        prepare: toCommercial(null),
      },
      {
        target: commercialTarget("empresas"),
        applies: who === "officer",
        title: "Derivar una acción",
        text: (
          <>
            En <strong>Mis empresas</strong>, <strong>Derivar</strong> al lado de cada una. Elegís
            el tipo: <strong>Acción</strong>, <strong>Feria</strong>,{" "}
            <strong>Posición comercial</strong> o <strong>Base de datos</strong> (pegás desde Excel
            una lista de empleados: nombre, teléfono o mail y CUIL o una referencia como el legajo;
            el hunter los contacta a distancia). Después, el hunter, o{" "}
            <strong>«Que la asigne el líder»</strong> si no sabés quién está libre.
          </>
        ),
        prepare: toCommercial("empresas"),
      },
      {
        target: commercialTarget("agenda"),
        title: AGENDA_TITLE[who],
        text: AGENDA[who],
        prepare: toCommercial("agenda"),
      },
      {
        target: commercialTarget("agenda"),
        title: "Los horarios no se pisan",
        text: scheduleText(profile),
        prepare: toCommercial("agenda"),
      },
      {
        target: commercialTarget("lista"),
        title: "Cada acción por dentro",
        text: insideText(profile),
        prepare: toCommercial("lista"),
      },
      {
        target: commercialTarget("tablero"),
        title: "El tablero",
        text: DASHBOARD,
        prepare: toCommercial("tablero"),
      },
    ],
  };
}
