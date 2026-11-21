import { useQueryClient } from "@tanstack/react-query";
import { type ClipboardEvent, useLayoutEffect, useRef, useState } from "react";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import {
  FLYER_OPTIONS_QUERY_KEY,
  useFlyerOptions,
} from "@/shared/lib/app-config/flyer-options-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { Button, SectionLabel, Tabs } from "@/shared/ui/index.ts";
import {
  insertedAt,
  LEGAL_MARKERS,
  markerPastedText,
  pastedWithBold,
} from "../model/legal-sheet.ts";
import { type LegalSheet as Sheet, useLegalSheet } from "../model/use-legal-sheet.ts";
import { ReadProblem } from "./ReadProblem.tsx";
import styles from "./Config.module.css";
import panel from "./Panel.module.css";

/**
 * Where a chip goes. As today, the field starts listening to its cursor at the first chip pressed:
 * that one, and those before any touch, go at the end.
 */
interface ChipPlace {
  listening: boolean;
  at: number | null;
}

function Markers({ onPress }: { readonly onPress: (marker: string) => void }) {
  return (
    <div className={styles.markers}>
      <span className={styles.markersLabel}>
        Datos que se completan solos (tocá para pegarlos):
      </span>
      {LEGAL_MARKERS.map(([marker, meaning]) => (
        <button
          key={marker}
          type="button"
          className={styles.chip}
          title={meaning}
          data-testid="legal-marker"
          onClick={() => {
            onPress(marker);
          }}
        >
          {marker}
        </button>
      ))}
    </div>
  );
}

function LegalPane({
  option,
  label,
  sheet,
}: {
  readonly option: number;
  readonly label: string;
  readonly sheet: Sheet;
}) {
  const { show } = useToast();
  const field = useRef<HTMLTextAreaElement>(null);
  const place = useRef<ChipPlace>({ listening: false, at: null });
  const cursorAfter = useRef<number | null>(null);
  const legal = sheet.of(option);
  const text = legal.text ?? "";

  // The cursor goes right after what was put in, once the new text is on the field.
  useLayoutEffect(() => {
    const at = cursorAfter.current;
    if (at === null) return;
    cursorAfter.current = null;
    field.current?.focus();
    field.current?.setSelectionRange(at, at);
  });

  const remember = () => {
    if (place.current.listening && field.current) {
      place.current.at = field.current.selectionStart;
    }
  };
  const putCursor = (at: number) => {
    cursorAfter.current = at;
  };
  const pressMarker = (marker: string) => {
    if (legal.text === null) return;
    place.current.listening = true;
    const { text: next, cursor } = insertedAt(text, place.current.at, marker);
    place.current.at = cursor;
    sheet.write(option, next);
    putCursor(cursor);
    show(markerPastedText(marker));
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData("text/html");
    // Without format, it is a common paste.
    if (!html) return;
    event.preventDefault();
    const { selectionStart, selectionEnd } = event.currentTarget;
    const { text: next, cursor } = pastedWithBold(text, selectionStart, selectionEnd, html);
    sheet.write(option, next);
    putCursor(cursor);
  };

  if (legal.failure) {
    return (
      <ReadProblem
        message={`No se pudo leer el legal de ${label}`}
        detail={legal.failure}
        onRetry={() => {
          sheet.reload(option);
        }}
      />
    );
  }
  return (
    <div data-option={option}>
      <Markers onPress={pressMarker} />
      <textarea
        ref={field}
        className={styles.legalText}
        aria-label={`Legal de ${label}`}
        placeholder={`Legal de ${label}...`}
        data-testid="legal-text"
        value={text}
        readOnly={legal.text === null}
        onChange={(event) => {
          sheet.write(option, event.target.value);
        }}
        onKeyUp={remember}
        onClick={remember}
        onBlur={remember}
        onPaste={onPaste}
      />
      <div className={`${styles.said} ${styles.error}`} role="alert">
        {legal.error}
      </div>
      <div className={`${styles.said} ${styles.ok}`}>{legal.ok}</div>
      <div className={styles.legalButtons}>
        <Button
          size="sm"
          className={styles.legalSave}
          disabled={legal.text === null || legal.saving}
          onClick={() => void sheet.save(option, label)}
        >
          {legal.saving ? "Guardando..." : "Guardar y aplicar a todos"}
        </Button>
        <Button
          variant="soft-neutral"
          size="xs"
          onClick={() => {
            sheet.reload(option);
          }}
        >
          Recargar
        </Button>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <p className={`${styles.intro} ${styles.close12}`}>
      Cada <strong>opción del armador tiene su propio legal</strong>, guardado por separado. Podés{" "}
      <strong>pegar desde Word/PDF/web y las negritas se mantienen</strong> (se marcan con **).
      Guardá para impactar a todos los usuarios de esa opción; cada asesor puede después ajustar la
      fecha o algún dato en su pantalla.
      <br />
      <br />
      <strong>Marcadores:</strong> los botoncitos que están arriba de cada editor pegan un dato que
      se completa solo al armar el flyer. Los de <strong>montos</strong> (
      <code>{"{eminentblack}"}</code>, <code>{"{platinum}"}</code>, <code>{"{plusgold}"}</code>,{" "}
      <code>{"{plus}"}</code>) salen de la{" "}
      <strong>configuración que tenga elegida el asesor</strong> (BAU, Config 1…), así un mismo
      legal sirve para todas; <code>{"{eminentblack}"}</code> es además el que sale en naranja en el
      Flyer Sueldo. Los de <strong>Flyer Rubros</strong> son <code>{"{importe}"}</code>,{" "}
      <code>{"{importe2}"}</code> (el segundo tope, cuadro «Ambos») y <code>{"{total}"}</code> (la
      suma), y <code>{"{empresa}"}</code> sirve en cualquiera. Si el dato no existe (una empresa{" "}
      <em>sin cashback</em>, por ejemplo) el marcador desaparece solo y no queda impreso. Ejemplo:{" "}
      <code>
        … es de {"{importe}"} en Supermercados y {"{importe2}"} en Combustibles. Tope mensual total
        de {"{total}"}.
      </code>
    </p>
  );
}

/** Config → Legales: one legal text per option, with chips for its markers. */
export function LegalSheet() {
  const queryClient = useQueryClient();
  const { options, failed } = useFlyerOptions();
  const numbers = options.map(({ n }) => n);
  const sheet = useLegalSheet(failed ? [] : numbers);
  const [chosen, setChosen] = useState<number | null>(null);
  const current = chosen !== null && numbers.includes(chosen) ? chosen : (numbers[0] ?? 1);

  return (
    <div data-testid="admin-legal">
      <SectionLabel className={panel.label}>Términos y condiciones (legal global)</SectionLabel>
      <Intro />
      {failed ? (
        <ReadProblem
          message="No se pudo leer la lista de opciones"
          detail="sin conexión"
          onRetry={() => {
            void queryClient.invalidateQueries({ queryKey: FLYER_OPTIONS_QUERY_KEY });
          }}
        />
      ) : (
        <Tabs
          value={String(current)}
          variant="pills-inside"
          onChange={(value) => {
            setChosen(Number(value));
          }}
        >
          <div className={styles.legalTabs}>
            <Tabs.List label="Legal de cada opción">
              {numbers.map((option) => (
                <Tabs.Tab key={option} value={String(option)}>
                  {optionLabel(options, option)}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </div>
          {numbers.map((option) => (
            <Tabs.Panel key={option} value={String(option)} keepMounted>
              <LegalPane option={option} label={optionLabel(options, option)} sheet={sheet} />
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
    </div>
  );
}
