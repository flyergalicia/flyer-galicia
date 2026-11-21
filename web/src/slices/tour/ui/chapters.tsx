// The chapters and steps of the tutorial, with their texts as they are today (`_tourCapitulos`). What
// a profile does not have does not appear: the Hunter and the Leader have no chapter of the flyer
// editor, and each step says what applies to whom.
import type { ReactNode } from "react";
import type { TourChapter, TourStep } from "../model/plan.ts";
import {
  TO_BULK,
  TO_CATEGORY,
  TO_HISTORY,
  TO_HUNTER,
  TO_HUNTER_OTHERS,
  TO_INDIVIDUAL,
  TO_MENU,
  TO_OTHERS,
  TO_PROMOTIONS,
} from "../model/prepare.ts";
import type { TourProfile } from "../model/profile.ts";
import { commercialChapter } from "./commercial-chapter.tsx";

export type TourText = ReactNode;
type Chapter = TourChapter<TourText>;
type Step = TourStep<TourText>;

function officerText(profile: TourProfile): TourText {
  return (
    <>
      Nombre, celular y mail del asesor que va al pie del flyer. Al escribir el nombre, el{" "}
      <strong>mail se sugiere solo</strong> (nombre.apellido@bancogalicia.com.ar); si es distinto,
      corregilo. Si un celular o un mail no cierra, te lo marca ahí mismo en rojo (igual te deja
      generar).
      {profile.savesAdvisors && (
        <>
          {" "}
          <strong>Tocando este título</strong> elegís un asesor guardado y lo cargás con un click, o
          guardás el que tengas cargado con <em>«+ Guardar el actual»</em>.
        </>
      )}{" "}
      A la derecha del título, <strong>✕ Borrar</strong> vacía los campos de ese oficial.
    </>
  );
}

function companySteps(profile: TourProfile): Step[] {
  return [
    {
      target: "company",
      title: "Empezá por la empresa",
      text: (
        <>
          Escribí la razón social: el flyer de la derecha se actualiza al instante y el{" "}
          <strong>nombre del archivo</strong> se arma solo con ese nombre.
          {profile.searchesCompanies &&
            " Si la empresa ya está en tu base, mientras tipeás te la sugiere."}
        </>
      ),
      prepare: TO_INDIVIDUAL,
    },
    {
      target: "companySearch",
      applies: profile.searchesCompanies,
      title: "La lupa: tus empresas",
      text: (
        <>
          Buscá por <strong>razón social o CUIT</strong> y se completa todo de una: empresa,
          cashback y hasta 4 oficiales. Desde "Administrar" (o tu nombre →{" "}
          <strong>Base de datos</strong>) subís un Excel o las editás a mano.
        </>
      ),
      prepare: TO_INDIVIDUAL,
    },
    {
      target: "officerTitle",
      title: "Datos del oficial",
      text: officerText(profile),
      prepare: TO_INDIVIDUAL,
    },
    {
      target: "paste",
      applies: profile.pastesOfficers,
      title: "⚡ Pegar: sin tipear nada",
      text: (
        <>
          Copiá la firma de un mail o un mensaje con los datos del oficial y pegalo acá: detecta{" "}
          <strong>nombre, celular y mail</strong> y los acomoda al formato correcto. Si algo no
          cierra, <em>Deshacer</em>.
        </>
      ),
      prepare: TO_INDIVIDUAL,
    },
    {
      target: "addOfficer",
      title: `Hasta 4 asesores${profile.hasBranches ? " (u 8)" : ""}`,
      text: (
        <>
          Agregá un segundo, tercer o cuarto oficial: el flyer los acomoda solo (2 lado a lado, 3 en
          fila, 4 en dos filas). <strong>✕ Quitar</strong> lo saca del flyer y borra lo que tenía
          cargado.
          {profile.hasBranches && (
            <>
              {" "}
              Con <strong>Oficiales por sede</strong> prendido (está en <em>Otros</em>, lo vemos al
              final) llegan hasta 8.
            </>
          )}
        </>
      ),
      prepare: TO_INDIVIDUAL,
    },
  ];
}

const FORM_STEPS: readonly Step[] = [
  {
    target: "cashback",
    title: "Cashback",
    text: (
      <>
        Elegí la configuración de montos que le corresponde a la empresa (<strong>BAU</strong> o{" "}
        <strong>Config 1 a 4</strong>). Los importes vigentes los carga el administrador; acá solo
        elegís cuál.
      </>
    ),
    prepare: TO_INDIVIDUAL,
  },
  {
    target: "legal",
    title: "Texto legal",
    text: (
      <>
        Viene precargado con los términos del mes. Podés ajustar una fecha o un dato: lo que va
        entre <kbd>**dobles asteriscos**</kbd> sale en <strong>negrita</strong>. Si pegás desde
        Word, la negrita se conserva sola.
      </>
    ),
    prepare: TO_INDIVIDUAL,
  },
  {
    target: "legalBold",
    title: "El botón B: negrita sin asteriscos",
    text: (
      <>
        Seleccioná un tramo del legal y tocá <strong>B</strong> (o <kbd>Ctrl</kbd>+<kbd>B</kbd>): te
        pone los asteriscos por vos. Tocándolo de nuevo sobre el mismo texto, se los saca. Los
        asteriscos se ven acá porque son la marca; en el flyer sale la negrita.
      </>
    ),
    prepare: TO_INDIVIDUAL,
  },
  {
    target: "zoom",
    title: "Vista previa",
    text: (
      <>
        Acercá o alejá con <kbd>+</kbd> / <kbd>−</kbd> o con <kbd>Ctrl</kbd> + ruedita (pellizcando
        en el touchpad), y recorré la imagen con la ruedita o <strong>arrastrándola</strong>. Lo que
        ves acá es exactamente lo que se descarga.
      </>
    ),
    prepare: TO_INDIVIDUAL,
  },
  {
    target: "preview",
    title: "Verlo en grande",
    text: (
      <>
        Abre el flyer a pantalla completa para revisarlo con tranquilidad antes de mandarlo, con{" "}
        <strong>Descargar PDF</strong>, <strong>Compartir</strong> y <strong>PNG</strong> ahí mismo.
        Se cierra con <kbd>Esc</kbd>.
      </>
    ),
    prepare: TO_INDIVIDUAL,
  },
  {
    target: "download",
    title: "Descargar",
    text: (
      <>
        <strong>Descargar PDF</strong> (o <kbd>Ctrl</kbd>+<kbd>Enter</kbd>) lo guarda en tu equipo.
        En la PC está siempre a la vista, al pie del formulario. En <em>Otros</em> están{" "}
        <strong>Compartir el PDF</strong> y la descarga como imagen (PNG). Si quedó un celular o un
        mail raro, te avisa recién después de generar: nunca te frena el flyer. Todo queda en la
        solapa <em>Historial</em>.
      </>
    ),
    prepare: TO_INDIVIDUAL,
  },
  {
    target: "restore",
    title: "Restaurar",
    text: (
      <>
        Limpia empresa y oficiales, apaga lo que hayas prendido en <em>Otros</em> y vuelve el legal
        al texto guardado, para arrancar el próximo flyer de cero.
      </>
    ),
    prepare: TO_INDIVIDUAL,
  },
];

function otherSteps(profile: TourProfile): Step[] {
  return [
    {
      target: "others",
      title: "«Otros»: compartir y más",
      text: (
        <>
          Acá está <strong>Compartir el PDF</strong>: abre el menú del celular o de Windows y lo
          mandás directo por WhatsApp, mail o Teams (si tu navegador no sabe compartir archivos, el
          botón no aparece y usás Descargar PDF). También la descarga como{" "}
          <strong>imagen (PNG)</strong>
          {profile.hasBranches ? (
            <>
              {" "}
              y la barrita de <strong>Oficiales por sede</strong>.
            </>
          ) : (
            "."
          )}
        </>
      ),
      prepare: TO_OTHERS,
    },
    {
      target: "branches",
      applies: profile.hasBranches,
      title: "📍 Oficiales por sede",
      text: (
        <>
          Para los flyers en los que el banco pone un referente por zona. Prendida, cargás{" "}
          <strong>hasta 8 oficiales</strong>, cada uno con su <strong>ubicación</strong> (sale con
          el pin 📍 y en negrita arriba del nombre) y un <strong>título</strong> que va arriba de
          todo el bloque. Al apagarla se borran las ubicaciones, el título y los oficiales 5 al 8
          (te pregunta antes). La lupa y el Excel del masivo siguen trayendo hasta 4.
        </>
      ),
      prepare: TO_OTHERS,
    },
  ];
}

function bulkSteps(profile: TourProfile): Step[] {
  return [
    {
      target: "template",
      title: "Muchas empresas de una vez",
      text: (
        <>
          Bajá la <strong>plantilla Excel</strong>: una fila por empresa (razón social, cashback y
          hasta 4 asesores). Es el mismo formato que usás en <strong>Base de datos</strong>.
        </>
      ),
      prepare: TO_BULK,
    },
    {
      target: "excel",
      title: "Subí el Excel y generá",
      text: (
        <>
          Arrastralo acá o hacé click para elegirlo. Te muestra una vista previa y avisa si alguna
          fila tiene un problema (empresa vacía, cashback que no reconoce). Después, el botón{" "}
          <strong>⚡ Generar ZIP</strong> arma <strong>un PDF por empresa</strong> y los baja todos
          juntos.
        </>
      ),
      prepare: TO_BULK,
    },
    {
      target: "segment",
      applies: profile.searchesCompanies,
      title: "Sin Excel: desde tus empresas",
      text: (
        <>
          Si ya tenés tu base cargada, acá abajo sale <strong>«Todo el segmento»</strong>: un click
          y te baja el flyer de todas las empresas de tu base que usan <strong>este formato</strong>{" "}
          (con sus oficiales, cashback y topes). Para bajar <em>todas</em> tus empresas, cada una
          con el formato que le toca, está <strong>Base de datos → Generar flyers</strong>.
        </>
      ),
      prepare: TO_BULK,
    },
  ];
}

function historyChapter(profile: TourProfile, withoutEditor: boolean): Chapter {
  return {
    id: "historial",
    title: "Historial",
    applies: !withoutEditor,
    steps: [
      {
        target: "historyTab",
        title: profile.keepsWork
          ? "Tus flyers quedan guardados"
          : "Lo que generaste en esta sesión",
        text: (
          <>
            Cada flyer descargado queda listado acá: podés <strong>volver a bajar el PDF</strong> o{" "}
            <strong>recargar</strong> sus datos en el formulario para retocarlo.{" "}
            {profile.keepsWork ? (
              <>
                La lista queda guardada en esta computadora, así que mañana sigue estando. Y si
                cerrás la pestaña a mitad de un flyer, al volver te ofrece{" "}
                <strong>«Seguir con ese»</strong> con todo como lo dejaste.
              </>
            ) : (
              "Se vacía al cerrar la pestaña del navegador."
            )}
          </>
        ),
        prepare: TO_HISTORY,
      },
    ],
  };
}

function menuChapter(profile: TourProfile): Chapter {
  return {
    id: "menu",
    title: "Tu menú",
    steps: [
      {
        target: "menuDatabase",
        applies: profile.searchesCompanies || profile.savesAdvisors,
        title: "Base de datos",
        text: (
          <>
            Acá viven <strong>tus empresas</strong> (subí un Excel o editalas en línea, para que la
            lupa las encuentre
            {profile.searchesCompanies && (
              <>
                , y desde <strong>Generar flyers</strong> bajás las que quieras de una
              </>
            )}
            ) y <strong>tus asesores</strong> guardados (corregí un celular o un mail sin borrar y
            volver a cargar). Es <strong>privado</strong>: nadie más lo ve ni lo edita, y viaja con
            tu cuenta (lo tenés desde cualquier computadora).
          </>
        ),
        prepare: TO_MENU,
      },
      {
        target: "menuNotes",
        applies: profile.takesNotes,
        title: "Bloc de notas",
        text: "Anotaciones rápidas que quedan guardadas en este navegador, por si necesitás tener algo a mano mientras armás flyers.",
        prepare: TO_MENU,
      },
      {
        target: "menuTheme",
        title: "Modo oscuro",
        text: "Cambiá entre tema claro y oscuro. Se recuerda para la próxima vez.",
        prepare: TO_MENU,
      },
      {
        target: "menuPalette",
        title: "El color de la app",
        text: (
          <>
            Cuatro temas para elegir: <strong>Marfil</strong>, <strong>Marino</strong>,{" "}
            <strong>Grafito</strong> y <strong>Cielo</strong>. Es sólo cómo se ve la pantalla:{" "}
            <strong>el flyer que descargás no cambia</strong>. Queda guardado en este navegador.
          </>
        ),
        prepare: TO_MENU,
      },
      {
        target: "menuPassword",
        applies: !profile.isAdminNow,
        title: "Cambiar mi clave",
        text: "Cambiá tu contraseña cuando quieras (te pide la actual). Si la olvidaste, desde el login pedís una nueva y el administrador la aprueba.",
        prepare: TO_MENU,
      },
      {
        target: "menuTour",
        title: "Ver tutorial",
        text: "Este recorrido queda siempre acá para repasarlo cuando quieras.",
        prepare: TO_MENU,
      },
    ],
  };
}

function hunterChapter(profile: TourProfile): Chapter {
  return {
    id: "hunter",
    title: "Buscar flyer",
    applies: profile.isHunter,
    steps: [
      {
        target: "hunterSearch",
        title: "Buscá la empresa",
        text: (
          <>
            Escribí la razón social o el <strong>CUIT</strong>. Si algún oficial la cargó, te
            aparece en la lista.
          </>
        ),
        prepare: TO_HUNTER,
      },
      {
        target: "hunterList",
        title: "Elegí la empresa",
        text: (
          <>
            Si dos oficiales distintos cargaron la misma empresa, aparecen las{" "}
            <strong>dos filas</strong> por separado: fijáte los nombres antes de elegir. Si dice{" "}
            <strong>«No figura»</strong>, nadie la cargó todavía.
          </>
        ),
        prepare: TO_HUNTER,
      },
      {
        target: "hunterZoom",
        title: "Acercá la imagen",
        text: (
          <>
            Con <kbd>+</kbd> / <kbd>−</kbd> o <kbd>Ctrl</kbd> + ruedita acercás el flyer para
            revisar un dato; con la ruedita sola o arrastrando lo recorrés.
          </>
        ),
        prepare: TO_HUNTER,
      },
      {
        target: "hunterOthers",
        title: "«Otros»: más herramientas",
        text: (
          <>
            Acá están <strong>Beneficios Haberes</strong> (el tablero), y la{" "}
            <strong>descarga de varias empresas juntas</strong> en un ZIP. El instructivo completo
            está en tu nombre → <strong>Ver tutorial</strong>.
          </>
        ),
        prepare: TO_HUNTER_OTHERS,
      },
      {
        target: "hunterDownload",
        title: "Descargar PDF",
        text: (
          <>
            Baja el flyer con los datos que esa empresa tiene cargados <strong>hoy</strong>. Si
            propusiste un cambio de oficial, sigue saliéndo así hasta que el oficial lo apruebe.
          </>
        ),
        prepare: TO_HUNTER,
      },
    ],
  };
}

const PROMOTIONS_STEPS: readonly Step[] = [
  {
    target: "promotionsProvince",
    title: "Primero, tu provincia",
    text: (
      <>
        La provincia que elijas acá vale para las <strong>dos solapas</strong>: quedan sólo las
        promociones que corren en esa zona. Justo abajo,{" "}
        <strong>«Ocultar las de compra online»</strong> saca las de internet (no tienen local, así
        que valen desde cualquier provincia).
      </>
    ),
    prepare: TO_PROMOTIONS,
  },
  {
    target: "promotionsBrands",
    title: "¿Qué marcas siguen vigentes?",
    text: (
      <>
        Pegá la lista de marcas del flyer, <strong>una por línea</strong>. Se cruzan contra el
        buscador oficial de promociones de Galicia.
      </>
    ),
    prepare: TO_PROMOTIONS,
  },
  {
    target: "promotionsMonth",
    title: "Mes a validar",
    text: (
      <>
        El mes del flyer: una promo que vence dentro de ese mes se marca <em>"vence este mes"</em>,
        y una ya vencida, <em>"vencida"</em>.
      </>
    ),
    prepare: TO_PROMOTIONS,
  },
  {
    target: "promotionsValidate",
    title: "Validar vigencia",
    text: (
      <>
        También con <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. Devuelve una tabla con logo, nombre en
        Galicia, fechas desde/hasta y estado. Las dudosas quedan como <strong>Revisar</strong> con
        las opciones para elegir a mano; las que no están, como <strong>No encontrada</strong>. La
        columna <strong>En Galicia</strong> abre esa promoción en el sitio del banco (vigencia,
        días, tarjetas y letra chica). Arriba de la tabla podés <strong>buscar</strong> dentro del
        resultado y <strong>ordenarlo</strong>, y con <strong>Descargar Excel</strong> te llevás
        todo con el logo de cada marca.
      </>
    ),
    prepare: TO_PROMOTIONS,
  },
  {
    target: "promotionsActive",
    title: "«Activas»: armar un flyer de cero",
    text: (
      <>
        La otra solapa va al revés: no pegás nada y te trae{" "}
        <strong>todas las promociones vigentes</strong> de esa provincia. Adentro afinás por{" "}
        <strong>localidad</strong> y por <strong>rubro</strong>, y con{" "}
        <strong>«Una sola fila por marca»</strong> queda una línea por marca (la que vence más
        tarde; el <strong>+N</strong> te dice cuántas juntó y cuáles). La fecha de inicio no viene
        en el listado: la trae el botón <strong>Completar fechas «Desde»</strong>. Ojo: al cambiar
        de solapa se vacía la tabla.
      </>
    ),
    prepare: TO_PROMOTIONS,
  },
  {
    target: "promotionsCatalog",
    title: "El catálogo de Galicia",
    text: (
      <>
        La app se guarda una copia del listado de Galicia para no pedirlo cada vez (arriba te dice
        de cuándo es) y la renueva sola <strong>todos los días a las 9</strong>. Si Galicia cargó
        promociones nuevas hoy, tocá <strong>Actualizar catálogo ahora</strong> y las trae.
      </>
    ),
    prepare: TO_PROMOTIONS,
  },
];

export function tourChapters(profile: TourProfile): readonly Chapter[] {
  const { isHunter, isLeader } = profile;
  // The Leader has no flyer editor either: no chapter of it applies to them.
  const withoutEditor = isHunter || isLeader;
  return [
    {
      id: "flyer",
      title: "Armar un flyer",
      applies: !withoutEditor,
      steps: [...companySteps(profile), ...FORM_STEPS, ...otherSteps(profile)],
    },
    { id: "masivo", title: "Masivo", applies: !withoutEditor, steps: bulkSteps(profile) },
    historyChapter(profile, withoutEditor),
    menuChapter(profile),
    hunterChapter(profile),
    {
      id: "promos",
      title: "Promociones",
      applies: profile.searchesPromotions,
      steps: PROMOTIONS_STEPS,
    },
    commercialChapter(profile),
    {
      id: "opciones",
      title: "Opciones",
      applies: profile.severalFlyers && !withoutEditor,
      steps: [
        {
          target: "optionBar",
          title: "Varios armadores",
          text: "Cada opción tiene su propio flyer y su propio legal. Cambiás acá y todo lo demás (individual, masivo, historial) usa el flyer de esa opción. Los datos que cargaste no se pierden al cambiar.",
          prepare: TO_INDIVIDUAL,
        },
      ],
    },
    {
      id: "rubros",
      title: "Flyer Rubros",
      applies: profile.hasCategoryFlyers && !withoutEditor,
      steps: [
        {
          target: "categoryTab",
          title: "Flyers con beneficio exclusivo",
          text: (
            <>
              El mismo armador, pero con los flyers que traen el cuadro{" "}
              <strong>«¡Beneficio exclusivo EMPRESA!»</strong> (combustible, supermercado...).
              Elegís el rubro en la barra de arriba del formulario.
            </>
          ),
          prepare: TO_CATEGORY,
        },
        {
          target: "benefit",
          title: "Nombre y tope del beneficio",
          text: (
            <>
              El nombre del cartel se copia solo de la empresa (podés cambiarlo). El{" "}
              <strong>tope de reintegro</strong> lo escribís vos: «24000» sale como{" "}
              <strong>$24.000</strong>.
            </>
          ),
          prepare: TO_CATEGORY,
        },
      ],
    },
  ];
}
