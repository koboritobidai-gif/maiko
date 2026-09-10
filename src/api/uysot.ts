import { apiFetch, unwrap } from './client';
import { ENDPOINTS } from './endpoints';

/* ---------- shared types ---------- */

export interface Named {
  id: number | string;
  name: string;
}

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  finishDate: string; // YYYY-MM-DD
}

/** Loose object — analytics payloads vary, so we normalise defensively. */
export type Loose = Record<string, unknown>;

/* ---------- helpers ---------- */

function asArray(x: unknown): Loose[] {
  if (Array.isArray(x)) return x as Loose[];
  if (x && typeof x === 'object') {
    const o = x as Loose;
    for (const k of ['content', 'list', 'items', 'rows', 'data']) {
      if (Array.isArray(o[k])) return o[k] as Loose[];
    }
  }
  return [];
}

function firstString(o: Loose, keys: string[], fallback = ''): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return fallback;
}

function firstNumber(o: Loose, keys: string[], fallback = 0): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return fallback;
}

/* ---------- reference data ---------- */

export async function listBuildings(): Promise<Named[]> {
  const resp = await apiFetch(ENDPOINTS.building.compact);
  return asArray(unwrap(resp)).map((o) => ({
    id: (o.id as number) ?? (o.buildingId as number),
    name: firstString(o, ['name', 'title', 'buildingName'], '(名称なし)'),
  }));
}

export async function listPipes(): Promise<Named[]> {
  const resp = await apiFetch(ENDPOINTS.statistics.pipes);
  // shape: { pipes: [...] } or { data: [...] }
  const raw = unwrap<Loose>(resp);
  const arr = Array.isArray(raw)
    ? (raw as Loose[])
    : asArray((raw as Loose)?.pipes ?? raw);
  return arr.map((o) => ({
    id: (o.id as number) ?? (o.pipeId as number),
    name: firstString(o, ['name', 'title', 'pipeName'], '(パイプ)'),
  }));
}

export async function listLeadSources(): Promise<Named[]> {
  const resp = await apiFetch(ENDPOINTS.lead.sources);
  return asArray(unwrap(resp)).map((o) => ({
    id: (o.id as number | string) ?? firstString(o, ['source', 'name']),
    name: firstString(o, ['name', 'source', 'title'], '(不明)'),
  }));
}

/* ---------- funnel (customer flow) ---------- */

export interface FunnelStage {
  name: string;
  count: number;
  day: number;
  countLeadPercent: number;
}

export interface FunnelResult {
  pipeName: string;
  averageDay: number;
  stages: FunnelStage[];
}

export async function getCustomerFlow(params: {
  pipeId: number | string | null;
  range: DateRange;
  leadStatus?: string | null;
  responsibleById?: number | null;
}): Promise<FunnelResult> {
  const resp = await apiFetch(ENDPOINTS.statistics.customerFlow, {
    method: 'POST',
    body: {
      pipeId: params.pipeId || null,
      startDate: params.range.startDate,
      finishDate: params.range.finishDate,
      leadStatus: params.leadStatus ?? null,
      responsibleByIds: params.responsibleById ? [params.responsibleById] : null,
    },
  });
  const data = unwrap<Loose>(resp);
  const list = asArray((data as Loose)?.pipeStatusList ?? data);
  return {
    pipeName: firstString(data as Loose, ['pipeName'], ''),
    averageDay: firstNumber(data as Loose, ['averageDay'], 0),
    stages: list.map((o) => ({
      name: firstString(o, ['statusName', 'name', 'title', 'status'], ''),
      count: firstNumber(o, ['count', 'countLead', 'leadCount', 'value'], 0),
      day: firstNumber(o, ['day', 'averageDay', 'days'], 0),
      countLeadPercent: firstNumber(o, ['countLeadPercent', 'percent'], 0),
    })),
  };
}

/* ---------- plan vs fact (leads + cost by source) ---------- */

export interface SourceRow {
  source: string;
  leads: number;
  cost: number;
  contracts: number;
  costPerLead: number;
}

/**
 * Marketing / lead breakdown by source. The plan-fact endpoints accept a
 * filter object; shapes vary between accounts, so we normalise heavily and
 * expose the raw response through the diagnostics panel.
 */
export async function getPlanFactPipe(filter: Loose): Promise<{ rows: SourceRow[]; raw: unknown }> {
  const resp = await apiFetch(ENDPOINTS.statistics.planFactPipe, { method: 'POST', body: filter });
  const data = unwrap<Loose>(resp);
  const list = asArray((data as Loose)?.sources ?? (data as Loose)?.rows ?? data);
  const rows: SourceRow[] = list.map((o) => {
    const leads = firstNumber(o, ['leadCount', 'countLead', 'leads', 'fact', 'count'], 0);
    const cost = firstNumber(o, ['cost', 'amount', 'spend', 'factCost', 'sum'], 0);
    const contracts = firstNumber(o, ['contractCount', 'contracts', 'saleCount'], 0);
    return {
      source: firstString(o, ['sourceName', 'source', 'name', 'title'], '(不明)'),
      leads,
      cost,
      contracts,
      costPerLead: leads > 0 ? Math.round(cost / leads) : 0,
    };
  });
  return { rows, raw: resp };
}

export async function getPlanFactCost(filter: Loose): Promise<unknown> {
  return apiFetch(ENDPOINTS.statistics.planFactCost, { method: 'POST', body: filter });
}

/* ---------- contracts & revenue ---------- */

export interface ContractSummary {
  count: number;
  totalAmount: number;
  raw: unknown;
}

export async function getContracts(filter: Loose): Promise<ContractSummary> {
  const resp = await apiFetch(ENDPOINTS.contract.filter, { method: 'POST', body: filter });
  const data = unwrap<Loose>(resp);
  const list = asArray(data);
  const count = firstNumber(data as Loose, ['count', 'totalElements', 'total'], list.length);
  const totalAmount = list.reduce(
    (s, o) => s + firstNumber(o, ['amount', 'totalAmount', 'price', 'sum', 'contractAmount'], 0),
    0,
  );
  return { count, totalAmount, raw: resp };
}

export async function getContractAmount(filter: Loose): Promise<unknown> {
  return apiFetch(ENDPOINTS.contract.amount, { method: 'POST', body: filter });
}

export async function getPaymentSum(filter: Loose): Promise<unknown> {
  return apiFetch(ENDPOINTS.contract.paymentFilterSum, { method: 'POST', body: filter });
}

export async function getSaleStats(filter: Loose): Promise<unknown> {
  return apiFetch(ENDPOINTS.mobile.saleStats, { method: 'POST', body: filter });
}

/* ---------- generic diagnostics probe ---------- */

export async function probe(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const data = await apiFetch(path, { method, body });
    return { ok: true, status: 200, data };
  } catch (e) {
    const err = e as { status?: number; body?: unknown; message?: string };
    return { ok: false, status: err.status ?? 0, data: err.body ?? err.message };
  }
}
