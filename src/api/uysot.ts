import { apiFetch, ApiError, unwrap } from './client';
import { ENDPOINTS } from './endpoints';

/* ---------- shared types ---------- */

export interface Named {
  id: number | string;
  name: string;
}

export interface DateRange {
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
}

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

// uysot localized-name object: { uz, ru, en, ... }
function localized(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, string>;
    return o.ru || o.en || o.uz || o.default || fallback;
  }
  return fallback;
}

function num(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

// Coerce a numeric string ("815") to a number; leave other ids as-is.
function idVal(v: number | string): number | string {
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

/** True when the error is a uysot "no permission" response (HTTP 403). */
export function isPermissionError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403;
}

/* ---------- reference data ---------- */

export async function listHouses(): Promise<Named[]> {
  const resp = await apiFetch(ENDPOINTS.house.compact);
  return asArray(unwrap(resp)).map((o) => ({
    id: (o.id as number) ?? 0,
    name: localized(o.name, '(名称なし)'),
  }));
}

export interface PipeStatusMeta {
  id: number;
  name: string;
  order: number;
}
export interface Pipe extends Named {
  statuses: PipeStatusMeta[];
}

export async function listPipes(): Promise<Pipe[]> {
  const resp = await apiFetch(ENDPOINTS.statistics.pipes);
  return asArray(unwrap(resp)).map((o) => ({
    id: (o.id as number) ?? 0,
    name: localized(o.name, '(パイプ)'),
    statuses: asArray(o.pipeStatuses).map((s) => ({
      id: num(s.id),
      name: localized(s.name),
      order: num(s.order ?? s.orders),
    })),
  }));
}

/* ---------- funnel (customer flow) ---------- */

export interface FunnelStage {
  id: number;
  name: string;
  order: number;
  count: number;
  countLeadPercent: number;
  day: number;
}
export interface FunnelResult {
  averageDay: number;
  stages: FunnelStage[];
}

export async function getCustomerFlow(pipeId: number | string, range: DateRange): Promise<FunnelResult> {
  const resp = await apiFetch(ENDPOINTS.statistics.customerFlow, {
    method: 'POST',
    body: { pipeId: idVal(pipeId), fromDate: range.fromDate, toDate: range.toDate },
  });
  const data = unwrap<Loose>(resp);
  const list = asArray((data as Loose)?.pipeStatusList);
  return {
    averageDay: num((data as Loose)?.averageDay),
    stages: list.map((o) => ({
      id: num(o.id),
      name: localized(o.name),
      order: num(o.order ?? o.orders),
      count: num(o.countLead ?? o.count),
      countLeadPercent: num(o.countLeadPercent),
      day: num(o.day),
    })),
  };
}

/* ---------- contracts & revenue ---------- */

export interface Contract {
  id: number;
  number: string;
  amount: number;
  payedAmount: number;
  residue: number;
  discount: number;
  status: string;
  createdTimestamp: number; // unix seconds
  deleted: boolean;
  responsibleBy: string;
  totalArea: number;
}

export interface ContractsResult {
  contracts: Contract[];
  raw: unknown;
}

export async function getContracts(houseId: number | string | null): Promise<ContractsResult> {
  const body: Loose = { page: '1', size: '2000' };
  if (houseId) body.houses = [idVal(houseId)];
  const resp = await apiFetch(ENDPOINTS.contract.filter, { method: 'POST', body });
  const data = unwrap<Loose>(resp);
  const list = asArray((data as Loose)?.data ?? data);
  const contracts: Contract[] = list.map((o) => ({
    id: num(o.id),
    number: String(o.number ?? ''),
    amount: num(o.amount),
    payedAmount: num(o.payedAmount),
    residue: num(o.residue),
    discount: num(o.discount),
    status: String(o.status ?? ''),
    createdTimestamp: num(o.createdTimestamp),
    deleted: !!o.deletedTimestamp,
    responsibleBy: String(o.responsibleBy ?? ''),
    totalArea: num(o.totalArea),
  }));
  return { contracts, raw: resp };
}

/* ---------- lead sources ---------- */

export async function listLeadSources(): Promise<Named[]> {
  const resp = await apiFetch(ENDPOINTS.lead.sources);
  return asArray(unwrap(resp)).map((o) => ({
    id: String(o.key ?? o.id ?? ''),
    name: localized(o.name, String(o.key ?? '不明')),
  }));
}

/* ---------- diagnostics probe ---------- */

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
