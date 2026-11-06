// The left side: where things are chosen and asked for.
import {
  hasSeveralProvinces,
  localitiesOfProvince,
  NEW_PROMOTION_DAYS,
  titleCase,
} from "@/shared/domain/promotions/index.ts";
import {
  isPromotionsTab,
  PROMOTIONS_TABS,
  type PromotionsTab,
} from "@/shared/domain/promotions/tabs.ts";
import { useIncludeModo } from "@/shared/lib/promotions/include-modo-context.ts";
import {
  Button,
  Checkbox,
  Field,
  type IconName,
  Input,
  SectionLabel,
  Select,
  Tabs,
  Textarea,
  useShortcutTip,
} from "@/shared/ui/index.ts";
// Not from the index: the shell reads it on the first load, and this one needs the rules of promotions.
import { ProvinceSelect } from "@/shared/ui/province-select/ProvinceSelect.tsx";
import { catalogStatusLine, useCatalogView } from "../model/catalog-view.ts";
import { usePromotionsActions, usePromotionsState } from "../model/promotions-context.ts";
import styles from "./PromotionsView.module.css";

const TAB_ICONS: Readonly<Record<PromotionsTab, IconName>> = { search: "search", active: "list" };
const NEW_HINT = `Promociones que aparecieron en el catálogo de Galicia en los últimos ${String(NEW_PROMOTION_DAYS)} días.`;
const PERCENT_HINT =
  "Sólo los supermercados con alguna promo de % de descuento (los del puntito rojo): son los que llevan sus días en el flyer.";
const MODO_HINT =
  "Suma las promociones de MODO que valen con Galicia y no están en la página del banco (por ejemplo, combustible por marca). Se pagan con MODO. Las que están en los dos lados se ven una sola vez.";
const ONLINE_HINT =
  "Son promociones de compra por internet: no tienen local, así que valen desde cualquier provincia.";
const ONE_ROW_ACTIVE_HINT =
  'Una misma marca aparece muchas veces: una promoción por tarjeta o por plazo, y además con el nombre cambiado ("Adidas", "Adidas MDQ", "Adidas Nordelta"). Con esto queda una sola fila por marca: la que vence más tarde. El "+N" de cada fila te dice cuántas juntó y cuáles.';
const ONE_ROW_SEARCH_HINT =
  "Cada marca trae todas sus promociones (una por tarjeta o por plazo). Con el tilde queda una sola por marca: la vigente que vence más tarde.";

function OnlyPercentTick() {
  const { filters } = usePromotionsState();
  const { dispatch } = usePromotionsActions();
  return (
    <Checkbox
      className={styles.tick}
      title={PERCENT_HINT}
      checked={filters.onlyPercent}
      onChange={(event) => {
        dispatch({ type: "filters", change: { onlyPercent: event.target.checked } });
      }}
    >
      Sólo súper con % de descuento
    </Checkbox>
  );
}

function IncludeModoTick() {
  const includeModo = useIncludeModo();
  const { setIncludeModo } = usePromotionsActions();
  return (
    <Checkbox
      className={styles.tick}
      title={MODO_HINT}
      checked={includeModo}
      onChange={(event) => {
        setIncludeModo(event.target.checked);
      }}
    >
      Incluir MODO
    </Checkbox>
  );
}

function OneRowPerBrandTick({ hint }: { readonly hint: string }) {
  const { filters } = usePromotionsState();
  const { dispatch } = usePromotionsActions();
  return (
    <Checkbox
      className={styles.tick}
      title={hint}
      checked={filters.oneRowPerBrand}
      onChange={(event) => {
        dispatch({ type: "filters", change: { oneRowPerBrand: event.target.checked } });
      }}
    >
      Una sola fila por marca
    </Checkbox>
  );
}

function SearchPane() {
  const { brandsText, month, validateWork } = usePromotionsState();
  const { dispatch, validate } = usePromotionsActions();
  const tip = useShortcutTip("Enter");
  return (
    <>
      <p className={styles.hint}>
        Pegá las marcas del flyer (una por línea) y las cruzamos contra el buscador oficial de
        promociones de Galicia: te decimos cuáles siguen vigentes, cuáles vencen este mes y cuáles
        no encontramos.
      </p>
      <p className={styles.section}>Marcas del flyer</p>
      <Field>
        <Textarea
          data-testid="promotions-brands"
          rows={10}
          placeholder={"Starbucks\nFreddo\nCrocs\nUber\n..."}
          value={brandsText}
          onChange={(event) => {
            dispatch({ type: "brands", text: event.target.value });
          }}
        />
      </Field>
      <p className={styles.section}>Mes a validar</p>
      <Field>
        <Input
          type="month"
          aria-label="Mes a validar"
          data-testid="promotions-month"
          className={styles.month}
          value={month}
          onChange={(event) => {
            dispatch({ type: "month", value: event.target.value });
          }}
        />
      </Field>
      <OneRowPerBrandTick hint={ONE_ROW_SEARCH_HINT} />
      <OnlyPercentTick />
      <IncludeModoTick />
      <Button
        fullWidth
        disabled={Boolean(validateWork)}
        data-testid="promotions-validate"
        {...(validateWork ? {} : { icon: "search" as const })}
        {...tip.target}
        onClick={() => {
          void validate();
        }}
      >
        {validateWork || "Validar vigencia"}
      </Button>
      {tip.element}
    </>
  );
}

function LocalityField() {
  const { province, locality } = usePromotionsState();
  const { setLocality } = usePromotionsActions();
  const { locations } = useCatalogView();
  const localities = localitiesOfProvince(locations, province);
  let first = "Elegí una provincia primero";
  if (hasSeveralProvinces(province)) first = "Con varias provincias, sin localidad";
  else if (province) first = "Todas las localidades";
  return (
    <Field>
      <Select
        data-testid="promotions-locality"
        disabled={localities.length === 0}
        value={locality}
        onChange={(event) => {
          setLocality(event.target.value);
        }}
      >
        <option value="">{first}</option>
        {localities.map((name) => (
          <option key={name} value={name}>
            {titleCase(name)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ActivePane() {
  const { category, listWork, filters } = usePromotionsState();
  const { setCategory, dispatch, listActive } = usePromotionsActions();
  const { categories } = useCatalogView();
  return (
    <>
      <p className={styles.hint}>
        Elegí una provincia y te traemos todas las promociones que están vigentes ahí, con su fecha
        de vencimiento. Sirve para armar un flyer desde cero.
      </p>
      <p className={styles.section}>Localidad</p>
      <LocalityField />
      <p className={styles.section}>Rubro</p>
      <Field>
        <Select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
          }}
        >
          <option value="">Todos los rubros</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </Field>
      <OneRowPerBrandTick hint={ONE_ROW_ACTIVE_HINT} />
      <Checkbox
        className={styles.tick}
        title={NEW_HINT}
        checked={filters.onlyNew}
        onChange={(event) => {
          dispatch({ type: "filters", change: { onlyNew: event.target.checked } });
        }}
      >
        Sólo las nuevas (últimos {NEW_PROMOTION_DAYS} días)
      </Checkbox>
      <OnlyPercentTick />
      <IncludeModoTick />
      <Button
        fullWidth
        disabled={Boolean(listWork)}
        data-testid="promotions-list"
        {...(listWork ? {} : { icon: "list" as const })}
        onClick={() => {
          void listActive();
        }}
      >
        {listWork || "Ver promociones"}
      </Button>
    </>
  );
}

function CatalogBox() {
  const { isUpdatingCatalog } = usePromotionsState();
  const { updateCatalog } = usePromotionsActions();
  const { catalog, readAt } = useCatalogView();
  return (
    <div className={styles.catalogBox}>
      <div className={styles.catalogStatus} data-testid="promotions-catalog-status">
        {catalogStatusLine(catalog, readAt)}
      </div>
      <Button
        variant="ghost"
        fullWidth
        busy={isUpdatingCatalog}
        className={styles.updateCatalog}
        data-testid="promotions-update-catalog"
        {...(isUpdatingCatalog ? {} : { icon: "restore" as const })}
        onClick={() => {
          void updateCatalog(true);
        }}
      >
        {isUpdatingCatalog ? "Actualizando catálogo…" : "Actualizar catálogo ahora"}
      </Button>
    </div>
  );
}

export function PromotionsPanel() {
  const { tab, province, filters } = usePromotionsState();
  const { switchTab, setProvince, dispatch } = usePromotionsActions();
  const { provinces, canFilterByProvince } = useCatalogView();
  return (
    <aside className={styles.panel}>
      <SectionLabel kind="panel">Buscador de Promociones</SectionLabel>
      <Tabs
        value={tab}
        onChange={(value) => {
          if (isPromotionsTab(value)) switchTab(value);
        }}
      >
        <Tabs.List label="Modo de promociones">
          {PROMOTIONS_TABS.map(([value, label]) => (
            <Tabs.Tab key={value} value={value} icon={TAB_ICONS[value]}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <p className={styles.section}>Provincia</p>
        <Field>
          <ProvinceSelect
            data-testid="promotions-province"
            provinces={provinces}
            value={province}
            allLabel="Todas las provincias"
            disabled={!canFilterByProvince}
            disabledLabel="Actualizá el catálogo para filtrar por provincia"
            onChange={setProvince}
          />
        </Field>
        <Checkbox
          className={styles.tick}
          title={ONLINE_HINT}
          checked={filters.hideOnline}
          onChange={(event) => {
            dispatch({ type: "filters", change: { hideOnline: event.target.checked } });
          }}
        >
          Ocultar las de compra online
        </Checkbox>
        <Tabs.Panel value="search" keepMounted>
          <SearchPane />
        </Tabs.Panel>
        <Tabs.Panel value="active" keepMounted>
          <ActivePane />
        </Tabs.Panel>
      </Tabs>
      <CatalogBox />
    </aside>
  );
}
