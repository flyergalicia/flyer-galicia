import { useEffect, useRef, useState } from "react";
import { titleCase } from "@/shared/domain/promotions/index.ts";
import { useIncludeModo, useSetIncludeModo } from "@/shared/lib/promotions/include-modo-context.ts";
import { Input, Select } from "@/shared/ui/index.ts";
import { ProvinceSelect } from "@/shared/ui/province-select/ProvinceSelect.tsx";
import type { BrandPicker } from "../model/brand-picker.ts";
import styles from "./LogoPicker.module.css";

const SEARCH_WAIT_MS = 120;

function SearchField({ picker, hint }: { readonly picker: BrandPicker; readonly hint: string }) {
  const [text, setText] = useState(picker.filters.search);
  const wait = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusing = setTimeout(() => {
      field.current?.focus();
    }, 30);
    return () => {
      clearTimeout(focusing);
      clearTimeout(wait.current);
    };
  }, []);
  return (
    <Input
      ref={field}
      type="search"
      aria-label="Buscar marca"
      placeholder={hint}
      autoComplete="off"
      value={text}
      onChange={(event) => {
        const { value } = event.target;
        setText(value);
        clearTimeout(wait.current);
        wait.current = setTimeout(() => {
          picker.change({ search: value });
        }, SEARCH_WAIT_MS);
      }}
    />
  );
}

interface BrandFiltersBarProps {
  readonly picker: BrandPicker;
  /** What the search box says when it is empty. */
  readonly searchHint?: string;
}

export function BrandFiltersBar({
  picker,
  searchHint = "Buscar marca (ej.: Farmacia del Pueblo)",
}: BrandFiltersBarProps) {
  const { filters, change, categories, provinces, localities } = picker;
  const includeModo = useIncludeModo();
  const setIncludeModo = useSetIncludeModo();
  return (
    <>
      <div className={styles.filters}>
        <SearchField picker={picker} hint={searchHint} />
        <Select
          appearance="native"
          aria-label="Rubro"
          value={filters.category}
          onChange={(event) => {
            change({ category: event.target.value });
          }}
        >
          <option value="">Todos los rubros</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
        {provinces.length > 0 && (
          <ProvinceSelect
            appearance="native"
            aria-label="Provincia"
            data-testid="brand-province"
            provinces={provinces}
            value={filters.province}
            allLabel="Todas las provincias"
            onChange={(province) => {
              change({ province, locality: "" });
            }}
          />
        )}
        {filters.province && localities.length > 0 && (
          <Select
            appearance="native"
            aria-label="Localidad"
            data-testid="brand-locality"
            value={filters.locality}
            onChange={(event) => {
              change({ locality: event.target.value });
            }}
          >
            <option value="">Todas las localidades</option>
            {localities.map((locality) => (
              <option key={locality} value={locality}>
                {titleCase(locality)}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className={styles.ticks}>
        <label title="Junta en una sola tarjeta las sucursales o variantes de una marca: por ejemplo, Adidas, Adidas MDQ y Adidas Nordelta. Las promos de un mismo logo (Coto: 25%, 12 y 18 cuotas) van siempre en una sola tarjeta.">
          <input
            type="checkbox"
            checked={filters.onePerBrand}
            onChange={(event) => {
              change({ onePerBrand: event.target.checked });
            }}
          />{" "}
          Juntar sucursales de la misma marca
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.hideOnline}
            onChange={(event) => {
              change({ hideOnline: event.target.checked });
            }}
          />{" "}
          Sin las de compra online
        </label>
        <label title="Sólo los supermercados con alguna promo de % de descuento (los del puntito rojo)">
          <input
            type="checkbox"
            checked={filters.onlyPercent}
            onChange={(event) => {
              change({ onlyPercent: event.target.checked });
            }}
          />{" "}
          Sólo súper con % de descuento
        </label>
        <label title="Suma las promociones de MODO que valen con Galicia y no están en la página del banco. Se pagan con MODO.">
          <input
            type="checkbox"
            checked={includeModo}
            onChange={(event) => {
              setIncludeModo(event.target.checked);
            }}
          />{" "}
          Incluir MODO
        </label>
      </div>
    </>
  );
}
