// "Ver su flyer" of an action of Gestiones: the company comes to the form as if it had been searched.
import { useEffect, useRef } from "react";
import {
  digitsOf,
  normalizeName,
  searchCompanies,
  type SearchableCompany,
} from "@/shared/domain/company-registry/index.ts";
import {
  type FlyerRequest,
  useFlyerRequests,
} from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useCompanies, useSearchableCompanies } from "@/slices/company-registry/index.ts";

const HITS = 5;
const MIN_TAX_ID_DIGITS = 8;

/** First by its exact name; if not, by its CUIT; if not, the best match. */
export function companyOfRequest(
  { company, taxIds }: FlyerRequest,
  rows: readonly SearchableCompany[],
): SearchableCompany | null {
  const name = normalizeName(company);
  const hits = searchCompanies(company, rows, HITS);
  const exact = hits.find(({ empresa }) => normalizeName(empresa) === name);
  if (exact) return exact;
  const digits = digitsOf(taxIds);
  const byTaxId =
    digits.length >= MIN_TAX_ID_DIGITS
      ? rows.find(({ cuits }) => cuits.some((cuit) => digitsOf(cuit) === digits))
      : undefined;
  return byTaxId ?? hits[0] ?? null;
}

export function useCompanyRequest(bring: (company: SearchableCompany) => void): void {
  const { show } = useToast();
  const { loading, failed } = useCompanies();
  const rows = useSearchableCompanies();
  const wanted = useRef<FlyerRequest | null>(null);

  const answer = (request: FlyerRequest) => {
    const company = companyOfRequest(request, rows);
    if (company) {
      bring(company);
      show(`Listo: ${company.empresa} cargada en el armador.`);
    } else if (!failed) {
      // If they could not be read the list already said so: it is not that it is not there.
      show(`«${request.company.trim()}» no está en tus empresas.`);
    }
  };
  useFlyerRequests("flyer", (request) => {
    if (loading) wanted.current = request;
    else answer(request);
  });
  useEffect(() => {
    const request = wanted.current;
    if (loading || !request) return;
    wanted.current = null;
    answer(request);
  });
}
