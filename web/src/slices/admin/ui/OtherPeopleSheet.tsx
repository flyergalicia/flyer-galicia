import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  type Company,
  matchingPositions,
  taxIdCount,
} from "@/shared/domain/company-registry/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSheetLibrary } from "@/shared/lib/use-sheet-library.ts";
import { ROLE_LABELS } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Input, SectionLabel, Select } from "@/shared/ui/index.ts";
import {
  type CompanyList,
  CompanyRow,
  downloadCompanies,
  failureText,
  readCompanies,
  useRegistryContext,
} from "@/slices/company-registry/index.ts";
import { type OtherPerson, readOtherPeople } from "../api/board.ts";
import { SEPARATOR } from "../model/text.ts";
import { ReadProblem } from "./ReadProblem.tsx";
import styles from "./Panel.module.css";
import data from "./Data.module.css";

const OTHER_PEOPLE_QUERY_KEY = ["admin", "other-people"] as const;

function personLabel(person: OtherPerson): string {
  const name = person.full_name || person.email_asesor || "(sin nombre)";
  return `${name} · ${ROLE_LABELS[person.role ?? ""] ?? person.role ?? ""}`;
}

/** File names a person can save: no slashes nor what a file system refuses. */
function safeName(text: string): string {
  return text.replace(/[\\/:*?"<>|]+/g, "_").trim() || "usuario";
}

function Companies({ rows, query }: { readonly rows: readonly Company[]; readonly query: string }) {
  if (!rows.length) return null;
  const found = matchingPositions(query, rows).flatMap((at) => (rows[at] ? [rows[at]] : []));
  if (!found.length) return <p className={data.note}>Sin resultados para "{query}".</p>;
  return (
    <div data-testid="other-person-companies">
      <p className={data.listNote}>
        {query.trim()
          ? `Coincidencias: ${String(found.length)}`
          : `Mostrando ${String(found.length)}`}
      </p>
      {found.map((company, at) => (
        <CompanyRow key={`${company.empresa}-${String(at)}`} company={company} />
      ))}
    </div>
  );
}

function PersonCompanies({
  person,
  read,
}: {
  readonly person: OtherPerson;
  readonly read: UseQueryResult<CompanyList>;
}) {
  const [query, setQuery] = useState("");
  if (read.isError) {
    return (
      <ReadProblem
        message="No se pudieron cargar esas empresas"
        detail={failureText(read.error.cause)}
        onRetry={() => void read.refetch()}
      />
    );
  }
  if (!read.data) return <p className={data.stat}>Cargando...</p>;
  const { rows } = read.data;
  return (
    <div data-testid="other-person" data-person={person.id}>
      <p className={data.stat}>
        {rows.length ? (
          <>
            <strong>{rows.length}</strong> empresas{SEPARATOR}
            <strong>{taxIdCount(rows)}</strong> CUIT{SEPARATOR}sólo lectura
          </>
        ) : (
          "Este usuario todavía no cargó ninguna empresa."
        )}
      </p>
      {rows.length > 0 && (
        <Input
          placeholder="Filtrar: razón social o CUIT..."
          aria-label="Filtrar empresas"
          autoComplete="off"
          value={query}
          onChange={({ target }) => {
            setQuery(target.value);
          }}
        />
      )}
      <Companies rows={rows} query={query} />
    </div>
  );
}

function DownloadButton({
  person,
  rows,
}: {
  readonly person: OtherPerson;
  readonly rows: readonly Company[];
}) {
  const { options } = useRegistryContext();
  const { show } = useToast();
  const withLibrary = useSheetLibrary();
  const name = person.full_name || person.email_asesor || "usuario";
  return (
    <Button
      variant="soft-neutral"
      size="xs"
      onClick={() =>
        void withLibrary((api) => {
          downloadCompanies(api, rows, options, `Empresas_${safeName(name)}.xlsx`);
          show(`Excel descargado (${String(rows.length)} empresas)`);
        })
      }
    >
      ⬇ Descargar Excel
    </Button>
  );
}

/** Data → Empresas por usuario: an administrator reads the list of someone else, never edits it. */
export function OtherPeopleSheet() {
  const backend = useBackend();
  const people = useQuery({
    queryKey: OTHER_PEOPLE_QUERY_KEY,
    queryFn: () => readOtherPeople(backend.db),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [chosen, setChosen] = useState("");
  const person = people.data?.find(({ id }) => id === chosen);
  const companies = useQuery({
    queryKey: ["admin", "companies-of", chosen],
    queryFn: () => readCompanies(backend, chosen),
    enabled: Boolean(person),
    staleTime: 0,
  });
  const rows = person ? companies.data?.rows : undefined;
  return (
    <div data-testid="admin-other-companies">
      <SectionLabel className={styles.label}>Empresas de otros usuarios</SectionLabel>
      <p className={styles.intro}>
        Cada usuario tiene su <strong>lista privada de empresas</strong>: nadie puede ver ni editar
        la de otro. Desde acá podés <strong>consultar y descargar</strong> la de los asesores, VIP y
        Pro, pero <strong>no modificarla</strong>.
        <br />
        <br />
        Las empresas de un administrador son privadas incluso para los demás administradores, así
        que no aparece en esta lista.
      </p>
      {people.isError && (
        <ReadProblem
          message="No se pudo cargar la lista"
          detail={people.error.message}
          onRetry={() => void people.refetch()}
        />
      )}
      <div className={data.choose}>
        <Select
          appearance="native"
          controlSize="lg"
          className={data.person}
          aria-label="Usuario"
          value={chosen}
          onChange={({ target }) => {
            setChosen(target.value);
          }}
        >
          <option value="">Elegí un usuario...</option>
          {(people.data ?? []).map((one) => (
            <option key={one.id} value={one.id}>
              {personLabel(one)}
            </option>
          ))}
        </Select>
        {person && rows && rows.length > 0 && <DownloadButton person={person} rows={rows} />}
        <Button variant="soft-neutral" size="xs" onClick={() => void people.refetch()}>
          Recargar
        </Button>
      </div>
      {people.data?.length === 0 && (
        <p className={data.stat}>No hay usuarios (además de los administradores) todavía.</p>
      )}
      {person && <PersonCompanies key={person.id} person={person} read={companies} />}
    </div>
  );
}
