import { type DragEvent, useRef, useState } from "react";
import { useBackend } from "@/shared/supabase/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { Button, ConfirmDialog, SectionLabel, Skeleton } from "@/shared/ui/index.ts";
import {
  ACCEPTED_FLYER_FILES,
  flyerFileKind,
  optionsOfFile,
  optionToCalibrate,
  type UploadedFlyer,
} from "../model/flyer-config.ts";
import { useCalibrator } from "../model/use-calibrator.ts";
import { useFlyerActions } from "../model/use-flyer-actions.ts";
import { type FlyerListValue, useFlyerList } from "../model/use-flyer-list.ts";
import { type UploadState, useFlyerUpload } from "../model/use-flyer-upload.ts";
import { type OptionNames, useOptionNames } from "../model/use-option-names.ts";
import { CalibratorWindow } from "./calibrator/CalibratorWindow.tsx";
import { FlyerVersions, type VersionHandlers } from "./FlyerVersions.tsx";
import { OptionQuestion } from "./OptionQuestion.tsx";
import { ReadProblem } from "./ReadProblem.tsx";
import panel from "./Panel.module.css";
import styles from "./FlyerSheet.module.css";

interface Question {
  readonly title: string;
  readonly answer: (option: number) => void;
}

/** Where the files of the bucket live: any address we gave starts like this. */
function bucketHome(listedUrl: (name: string) => string): string {
  return listedUrl("");
}

function UploadBox({
  state,
  onFile,
}: {
  readonly state: UploadState;
  readonly onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };
  return (
    <>
      <button
        type="button"
        className={over ? `${styles.drop} ${styles.over}` : styles.drop}
        disabled={state.busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => {
          setOver(false);
        }}
        onDrop={drop}
      >
        <span className={styles.icon} aria-hidden="true">
          📄
        </span>
        <span className={styles.hint}>
          Hacé clic o arrastrá el <strong>PDF</strong> del flyer aquí
        </span>
        <span className={styles.hintSub}>PDF, PNG, JPG o HTML — máx. 25 MB</span>
      </button>
      <input
        ref={input}
        type="file"
        className={styles.file}
        accept={ACCEPTED_FLYER_FILES}
        aria-label="Archivo del flyer"
        data-testid="flyer-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <div className={styles.error} role="alert" data-testid="flyer-upload-error">
        {state.error}
      </div>
      <div className={styles.ok}>{state.ok}</div>
      {state.progress !== null && (
        <div className={styles.progress}>
          <div className={styles.track}>
            <div className={styles.bar} style={{ width: `${String(state.progress)}%` }} />
          </div>
          <p className={styles.percent}>{state.progress}%</p>
        </div>
      )}
      {state.htmlUrl && <HtmlResult url={state.htmlUrl} />}
    </>
  );
}

/** Descargar: the same file, saved as index.html (the name GitHub Pages serves). */
function downloadPage(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = "index.html";
  link.click();
}

function HtmlResult({ url }: { readonly url: string }) {
  const toast = useToast();
  return (
    <div className={styles.result}>
      <p className={styles.resultLabel}>URL pública:</p>
      <a href={url} target="_blank" rel="noreferrer" className={styles.resultUrl}>
        {url}
      </a>
      <div className={styles.resultButtons}>
        <Button
          variant="soft-ok"
          size="xs"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              toast.show("URL copiada");
            });
          }}
        >
          Copiar URL
        </Button>
        <Button
          variant="soft-neutral"
          size="xs"
          onClick={() => {
            downloadPage(url);
          }}
        >
          Descargar
        </Button>
      </div>
    </div>
  );
}

function ListArea({
  value,
  names,
  home,
  busy,
  handlers,
}: {
  readonly value: FlyerListValue;
  readonly names: OptionNames;
  readonly home: string;
  readonly busy: string | null;
  readonly handlers: VersionHandlers;
}) {
  if (value.failure) {
    return (
      <div className={styles.list}>
        <ReadProblem
          message="No se pudo leer la lista de flyers"
          detail={value.failure}
          onRetry={value.retry}
        />
      </div>
    );
  }
  if (!value.list) {
    return (
      <div className={styles.list}>
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  return (
    <FlyerVersions
      list={value.list}
      options={value.numbers}
      names={names}
      home={home}
      busy={busy}
      {...handlers}
    />
  );
}

/** Config → Flyer: upload a flyer, calibrate it, and which one each option has active. */
export function FlyerSheet() {
  const { bucket } = useBackend();
  const names = useOptionNames();
  const value = useFlyerList();
  const actions = useFlyerActions(value.options);
  const calibrator = useCalibrator(value.options, actions.changed);
  const upload = useFlyerUpload(value.options, calibrator.start);
  const [question, setQuestion] = useState<Question | null>(null);
  const [deactivating, setDeactivating] = useState<number | null>(null);
  const ask = (title: string, answer: (option: number) => void) => {
    setQuestion({ title, answer });
  };

  const chooseFile = (file: File) => {
    if (flyerFileKind(file) === "html") void upload.upload(file, 0);
    else ask("¿A qué opción subís este flyer?", (option) => void upload.upload(file, option));
  };

  const handlers: VersionHandlers = {
    onDeactivate: setDeactivating,
    onActivate: (file, option) => void actions.activate(file, option, true),
    onActivateIn: (file) => {
      ask(`¿En qué otra opción activar "${file.name}"?`, (option) => {
        void actions.activate(file, option, false);
      });
    },
    onCalibrate: (file: UploadedFlyer) => {
      const active = value.list?.active ?? new Map();
      const option = optionToCalibrate(optionsOfFile(file.name, value.numbers, active));
      if (option !== null) void calibrator.startFromList(file, option);
      else
        ask(
          "¿Qué opción querés calibrar?",
          (chosen) => void calibrator.startFromList(file, chosen),
        );
    },
    onDelete: (file) => void actions.remove(file, value.list?.active ?? new Map()),
  };

  return (
    <div data-testid="admin-flyer-config">
      <SectionLabel className={panel.label}>Subir nueva versión del flyer</SectionLabel>
      <p className={styles.intro}>
        Subí el <strong>PDF limpio</strong> del flyer (sin los datos que completa cada asesor) —
        también vale PNG/JPG. Te pregunta a <strong>qué opción</strong> va (las de Flyer Galicia y
        las de Flyer Rubros, según Config → Opciones), se convierte solo y se abre el{" "}
        <strong>calibrador</strong> de esa opción para acomodar las zonas arrastrando. Para una
        opción de <strong>Flyer Rubros</strong> el PDF viene además con el{" "}
        <strong>cuadro del beneficio vacío</strong> (sólo el dibujo del surtidor/changuito, sin
        ninguna línea de texto): la app escribe todo el cuadro con la misma letra, y en el
        calibrador elegís la plantilla del rubro (Combustible / Supermercado), ajustás textos y
        tamaños y arrastrás las líneas. Qué opción ve cada perfil se define en Admin → Facultades.
        El HTML del build (<strong>index_export.html</strong>) también sirve como antes.
      </p>
      <UploadBox state={upload.state} onFile={chooseFile} />
      <ListArea
        value={value}
        names={names}
        home={bucketHome(bucket.listedUrl)}
        busy={actions.busy}
        handlers={handlers}
      />
      {question && (
        <OptionQuestion
          title={question.title}
          options={value.numbers}
          names={names}
          onCancel={() => {
            setQuestion(null);
          }}
          onChoose={(option) => {
            setQuestion(null);
            question.answer(option);
          }}
        />
      )}
      {deactivating !== null && (
        <ConfirmDialog
          title={`¿Desactivar el flyer de «${names.label(deactivating)}»?`}
          confirmLabel="Desactivar"
          danger
          onCancel={() => {
            setDeactivating(null);
          }}
          onConfirm={() => {
            setDeactivating(null);
            void actions.deactivate(deactivating);
          }}
        >
          Se saca la imagen, no la opción: sigue en la barra y quien la elija ve el cartel «todavía
          no tiene flyer» y no puede descargar. Para sacarla de la barra: Config → Opciones →
          Quitar. La imagen la podés volver a activar desde la lista de versiones de abajo.
        </ConfirmDialog>
      )}
      {calibrator.open && (
        <CalibratorWindow
          key={calibrator.open.store.name}
          calibrator={calibrator.open}
          saving={calibrator.saving}
          onSave={() => void calibrator.save()}
          onClose={calibrator.close}
        />
      )}
    </div>
  );
}
