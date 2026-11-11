import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import { optionColor, optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { SectionLabel, Skeleton } from "@/shared/ui/index.ts";
import { readUsage, type UsageData } from "../api/board.ts";
import {
  barWidth,
  studioInPeriod,
  type UsageBar,
  usageBoard,
  type UsageFlyers,
  type UsagePeriod,
  USAGE_PERIODS,
  usageSince,
} from "../model/usage.ts";
import { ReadProblem } from "./ReadProblem.tsx";

interface ReadUsage extends UsageData {
  readonly since: Date;
  readonly now: Date;
}
import styles from "./Usage.module.css";

function barStyle(width: number, color: string | undefined): CSSProperties {
  const style: CSSProperties & { readonly "--bar-color"?: string } = color
    ? { width: `${String(width)}%`, "--bar-color": color }
    : { width: `${String(width)}%` };
  return style;
}

function Bars({ bars }: { readonly bars: readonly UsageBar[] }) {
  return (
    <div>
      {bars.map((bar, at) => (
        <div key={`${bar.label}-${String(at)}`} className={styles.bar} data-testid="usage-bar">
          <span className={styles.label} title={bar.label} data-testid="usage-label">
            {bar.label}
          </span>
          <span className={styles.track}>
            <span className={styles.fill} style={barStyle(barWidth(bar.count, bars), bar.color)} />
          </span>
          <span className={styles.count} data-testid="usage-count">
            {bar.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function Card({
  number,
  what,
  sub,
}: {
  readonly number: string | number;
  readonly what: string;
  readonly sub?: string;
}) {
  return (
    <div className={styles.card} data-testid="usage-card">
      <div className={styles.number} data-testid="usage-number">
        {number}
      </div>
      <div className={styles.what}>{what}</div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={styles.section} data-testid="usage-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function Studio({ data, since }: { readonly data: UsageData; readonly since: Date }) {
  const { saved, asked, published } = studioInPeriod(data.studio, since);
  return (
    <section className={`${styles.section} ${styles.studio}`} data-testid="usage-section">
      <h4>Estudio en el período</h4>
      <div className={styles.cards}>
        <Card number={saved} what="diseños guardados" />
        <Card number={asked} what="pedidos de publicación" />
        <Card number={published} what="publicados" />
      </div>
    </section>
  );
}

function Board({ data }: { readonly data: ReadUsage }) {
  const { since, now } = data;
  const { options } = useFlyerOptions();
  const flyers = useMemo<UsageFlyers>(
    () => ({
      label: (option) => optionLabel(options, option),
      color: (option) => optionColor(options, option),
      exists: (option) => options.some(({ n }) => n === option),
    }),
    [options],
  );
  const board = usageBoard(data.logs, data.people, flyers, since, now);
  return (
    <>
      <div className={styles.cards} data-testid="usage-totals">
        <Card
          number={board.total.toLocaleString("es-AR")}
          what="flyers bajados"
          sub={`${String(board.oneByOne)} de a uno · ${String(board.inBatches)} en tandas (Masivo y padrón)`}
        />
        <Card number={board.people} what="usuarios que bajaron flyers" />
        <Card number={board.perPerson} what="flyers por usuario" sub="promedio del período" />
      </div>
      {board.total ? (
        <div className={styles.grid}>
          <Section title="Por flyer">
            <Bars bars={board.byFlyer} />
          </Section>
          <Section title="Por perfil">
            <Bars bars={board.byRole} />
          </Section>
          <Section title="Por semana">
            <Bars bars={board.byWeek} />
          </Section>
          <Section title="Los 10 que más bajaron">
            <Bars bars={board.top} />
          </Section>
        </div>
      ) : (
        <p className={styles.empty}>No se bajaron flyers en este período.</p>
      )}
      <Studio data={data} since={since} />
    </>
  );
}

/** Admin → Uso: how many flyers come out, of which flyer, by which profiles and week by week. */
export function UsageSheet() {
  const backend = useBackend();
  const [period, setPeriod] = useState<UsagePeriod>("30");
  const read = useQuery({
    queryKey: ["admin", "usage", period],
    // The start of the period is the one of the moment it is read.
    queryFn: async (): Promise<ReadUsage> => {
      const now = new Date();
      const since = usageSince(period, now);
      return { ...(await readUsage(backend, since)), since, now };
    },
    staleTime: 0,
  });
  return (
    <div data-testid="admin-usage">
      <div className={styles.head}>
        <SectionLabel>Uso de la app</SectionLabel>
        <fieldset className={styles.periods} aria-label="Período">
          {USAGE_PERIODS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={styles.period}
              aria-pressed={value === period}
              onClick={() => {
                setPeriod(value);
              }}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </div>
      <div data-testid="usage-body" aria-busy={read.isFetching}>
        {read.isError && (
          <ReadProblem
            message="No se pudieron leer los registros"
            detail={read.error.message}
            onRetry={() => void read.refetch()}
          />
        )}
        {read.isFetching && [1, 2, 3, 4].map((at) => <Skeleton key={at} />)}
        {read.data && !read.isFetching && !read.isError && <Board data={read.data} />}
      </div>
    </div>
  );
}
