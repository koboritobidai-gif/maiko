import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getContracts,
  getCustomerFlow,
  getPaymentSum,
  getPlanFactPipe,
  listBuildings,
  listPipes,
  type FunnelResult,
  type Named,
  type SourceRow,
} from '../api/uysot';
import { setToken } from '../api/client';
import KpiCard from './KpiCard';
import Diagnostics, { type DiagEntry } from './Diagnostics';
import {
  FunnelChart,
  MonthlyCountsChart,
  MonthlyRevenueChart,
  SourceLeadsChart,
  SourcePie,
  type MonthlyPoint,
} from './charts';
import { seriesColor } from '../theme';
import { useDark } from '../hooks/useDark';
import { formatNumber, formatSom, formatPercent, formatCompact } from '../utils/format';
import {
  addMonths,
  endOfMonth,
  lastMonthsRange,
  monthsInRange,
  shortMonthLabel,
  startOfMonth,
  toISO,
} from '../utils/date';

interface Props {
  onLogout: () => void;
}

interface Prefs {
  buildingId: string;
  pipeId: string;
  months: number;
  visitIdx: number;
  contractIdx: number;
}

const PREFS_KEY = 'jp-plaza-prefs';

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { months: 6, visitIdx: 1, contractIdx: -1, buildingId: '', pipeId: '', ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { buildingId: '', pipeId: '', months: 6, visitIdx: 1, contractIdx: -1 };
}

interface LoadResult {
  funnel: FunnelResult | null;
  sourceRows: SourceRow[];
  monthly: MonthlyPoint[];
  contractsCount: number;
  revenueTotal: number;
  forecast: number | null;
  diag: DiagEntry[];
}

export default function Dashboard({ onLogout }: Props) {
  const dark = useDark();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [buildings, setBuildings] = useState<Named[]>([]);
  const [pipes, setPipes] = useState<Named[]>([]);
  const [refReady, setRefReady] = useState(false);
  const [refError, setRefError] = useState('');

  const [result, setResult] = useState<LoadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const loadSeq = useRef(0);

  // persist prefs
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const range = useMemo(() => lastMonthsRange(prefs.months), [prefs.months]);

  /* ---- reference data ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [b, p] = await Promise.allSettled([listBuildings(), listPipes()]);
      if (cancelled) return;
      let anyOk = false;
      if (b.status === 'fulfilled') {
        setBuildings(b.value);
        anyOk = true;
      }
      if (p.status === 'fulfilled') {
        setPipes(p.value);
        anyOk = true;
      }
      setRefReady(true);
      if (!anyOk) {
        const reason =
          b.status === 'rejected' ? (b.reason as Error)?.message : (p as PromiseRejectedResult).reason?.message;
        setRefError(reason || '基礎データを取得できませんでした（認証切れの可能性）');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // auto-select first pipe once loaded
  useEffect(() => {
    if (pipes.length && !prefs.pipeId) {
      setPrefs((p) => ({ ...p, pipeId: String(pipes[0].id) }));
    }
  }, [pipes]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- main load ---- */
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError('');
    const diag: DiagEntry[] = [];
    const record = (label: string, path: string, ok: boolean, status: number, data: unknown) =>
      diag.push({ label, path, ok, status, data });

    const pipeId = prefs.pipeId || null;
    const buildingId = prefs.buildingId || null;
    const baseFilter: Record<string, unknown> = {
      startDate: range.startDate,
      finishDate: range.finishDate,
    };
    if (pipeId) baseFilter.pipeId = pipeId;
    if (buildingId) baseFilter.buildingId = buildingId;

    // 1. funnel
    let funnel: FunnelResult | null = null;
    try {
      funnel = await getCustomerFlow({ pipeId, range });
      record('ファネル（顧客フロー）', '/v1/statistics/customer-flow/v2', true, 200, funnel);
    } catch (e) {
      const err = e as { status?: number; body?: unknown; message?: string };
      record('ファネル（顧客フロー）', '/v1/statistics/customer-flow/v2', false, err.status ?? 0, err.body ?? err.message);
    }

    // 2. source breakdown (marketing)
    let sourceRows: SourceRow[] = [];
    try {
      const r = await getPlanFactPipe(baseFilter);
      sourceRows = r.rows;
      record('流入経路・費用（プラン/実績）', '/v1/statistics/plan-fact-pipe', true, 200, r.raw);
    } catch (e) {
      const err = e as { status?: number; body?: unknown; message?: string };
      record('流入経路・費用（プラン/実績）', '/v1/statistics/plan-fact-pipe', false, err.status ?? 0, err.body ?? err.message);
    }

    // 3. contracts overall (revenue)
    let contractsCount = 0;
    let revenueTotal = 0;
    try {
      const c = await getContracts({ ...baseFilter, page: 0, size: 2000 });
      contractsCount = c.count;
      revenueTotal = c.totalAmount;
      record('契約一覧（売上）', '/v1/contract/filter', true, 200, c.raw);
    } catch (e) {
      const err = e as { status?: number; body?: unknown; message?: string };
      record('契約一覧（売上）', '/v1/contract/filter', false, err.status ?? 0, err.body ?? err.message);
    }

    // 4. monthly — reuse the confident funnel + contracts calls per month
    const months = monthsInRange(range);
    const monthly: MonthlyPoint[] = [];
    for (const ym of months) {
      const [y, m] = ym.split('-').map(Number);
      const s = startOfMonth(new Date(y, m - 1, 1));
      const e = endOfMonth(new Date(y, m - 1, 1));
      const mRange = { startDate: toISO(s), finishDate: toISO(e) };
      const point: MonthlyPoint = { month: shortMonthLabel(ym), leads: 0, visits: 0, contracts: 0, revenue: 0 };
      try {
        const f = await getCustomerFlow({ pipeId, range: mRange });
        const st = f.stages;
        if (st.length) {
          point.leads = st[0]?.count ?? 0;
          const vi = prefs.visitIdx < 0 ? st.length + prefs.visitIdx : prefs.visitIdx;
          const ci = prefs.contractIdx < 0 ? st.length + prefs.contractIdx : prefs.contractIdx;
          point.visits = st[Math.max(0, Math.min(st.length - 1, vi))]?.count ?? 0;
          point.contracts = st[Math.max(0, Math.min(st.length - 1, ci))]?.count ?? 0;
        }
      } catch {
        /* leave zeros */
      }
      try {
        const c = await getContracts({ ...baseFilter, startDate: mRange.startDate, finishDate: mRange.finishDate, page: 0, size: 2000 });
        point.revenue = c.totalAmount;
        if (!point.contracts) point.contracts = c.count;
      } catch {
        /* leave zero */
      }
      monthly.push(point);
    }

    // 5. forecast — upcoming scheduled payments (best effort)
    let forecast: number | null = null;
    try {
      const fStart = startOfMonth(addMonths(new Date(), 1));
      const fEnd = endOfMonth(addMonths(new Date(), 12));
      const raw = await getPaymentSum({
        startDate: toISO(fStart),
        finishDate: toISO(fEnd),
        ...(buildingId ? { buildingId } : {}),
      });
      record('入金予定合計（見込み）', '/v1/contract/payment/filter/sum', true, 200, raw);
      const data = (raw && typeof raw === 'object' && 'data' in raw ? (raw as any).data : raw) as any;
      const val =
        typeof data === 'number'
          ? data
          : data?.sum ?? data?.amount ?? data?.total ?? data?.totalAmount ?? null;
      if (typeof val === 'number') forecast = val;
    } catch (e) {
      const err = e as { status?: number; body?: unknown; message?: string };
      record('入金予定合計（見込み）', '/v1/contract/payment/filter/sum', false, err.status ?? 0, err.body ?? err.message);
    }

    if (seq !== loadSeq.current) return; // superseded
    if (!funnel && !sourceRows.length && !contractsCount && !revenueTotal) {
      setLoadError('データを取得できませんでした。認証（トークン）の有効期限切れの可能性があります。');
    }
    setResult({ funnel, sourceRows, monthly, contractsCount, revenueTotal, forecast, diag });
    setLoading(false);
  }, [prefs.pipeId, prefs.buildingId, prefs.visitIdx, prefs.contractIdx, range]);

  // initial + on-change load once a pipe is chosen
  useEffect(() => {
    if (refReady) load();
  }, [refReady, load]);

  /* ---- derived KPIs ---- */
  const stages = result?.funnel?.stages ?? [];
  const totalLeadsFromSource = result?.sourceRows.reduce((s, r) => s + r.leads, 0) ?? 0;
  const leadCount = totalLeadsFromSource || (stages[0]?.count ?? 0);
  const spend = result?.sourceRows.reduce((s, r) => s + r.cost, 0) ?? 0;
  const vi = prefs.visitIdx < 0 ? stages.length + prefs.visitIdx : prefs.visitIdx;
  const ci = prefs.contractIdx < 0 ? stages.length + prefs.contractIdx : prefs.contractIdx;
  const visits = stages.length ? stages[Math.max(0, Math.min(stages.length - 1, vi))]?.count ?? 0 : 0;
  const contractsFromFunnel = stages.length
    ? stages[Math.max(0, Math.min(stages.length - 1, ci))]?.count ?? 0
    : 0;
  const contracts = result?.contractsCount || contractsFromFunnel;
  const revenue = result?.revenueTotal ?? 0;
  const monthlyAvg = revenue && prefs.months ? revenue / prefs.months : 0;
  const closeRate = leadCount ? (contracts / leadCount) * 100 : 0;
  const costPerLead = leadCount && spend ? spend / leadCount : 0;

  function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    setPrefs((p) => ({ ...p, [k]: v }));
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand-dot">JP</div>
        <h1>ジャパンプラザ 販売進捗ダッシュボード</h1>
        <span className="spacer" />
        <button
          className="btn"
          type="button"
          onClick={() => {
            setToken('');
            onLogout();
          }}
        >
          ログアウト
        </button>
      </div>

      {/* filters */}
      <div className="filters">
        <div className="field">
          <label>物件（ビル）</label>
          <select value={prefs.buildingId} onChange={(e) => setPref('buildingId', e.target.value)}>
            <option value="">全物件</option>
            {buildings.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>パイプライン</label>
          <select value={prefs.pipeId} onChange={(e) => setPref('pipeId', e.target.value)}>
            <option value="">選択してください</option>
            {pipes.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>期間</label>
          <select value={prefs.months} onChange={(e) => setPref('months', Number(e.target.value))}>
            <option value={3}>直近3ヶ月</option>
            <option value={6}>直近6ヶ月</option>
            <option value={12}>直近12ヶ月</option>
          </select>
        </div>
        {stages.length > 0 && (
          <>
            <div className="field">
              <label>「来店」に対応する段階</label>
              <select value={prefs.visitIdx} onChange={(e) => setPref('visitIdx', Number(e.target.value))}>
                {stages.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name || `段階${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>「契約」に対応する段階</label>
              <select
                value={prefs.contractIdx < 0 ? stages.length + prefs.contractIdx : prefs.contractIdx}
                onChange={(e) => setPref('contractIdx', Number(e.target.value))}
              >
                {stages.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name || `段階${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label>&nbsp;</label>
          <button className="btn primary" type="button" onClick={load} disabled={loading}>
            {loading ? '読み込み中…' : '更新'}
          </button>
        </div>
      </div>

      {(refError || loadError) && (
        <div className="error" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div>{loadError || refError}</div>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              setToken('');
              onLogout();
            }}
          >
            新しいトークンを入れ直す
          </button>
        </div>
      )}

      {/* ============ マーケティング ============ */}
      <section className="section">
        <div className="section-head">
          <span className="pill">マーケティング</span>
          <span className="hint">
            {range.startDate} 〜 {range.finishDate}
          </span>
        </div>
        <div className="kpi-grid">
          <KpiCard label="使った金額（広告費）" value={spend ? formatCompact(spend) : '—'} unit={spend ? 'soʼm' : ''} sub={spend ? formatSom(spend) : '費用データ未取得'} />
          <KpiCard label="リスト数（獲得数）" value={formatNumber(leadCount)} unit="件" />
          <KpiCard label="リスト単価（CPL）" value={costPerLead ? formatCompact(costPerLead) : '—'} unit={costPerLead ? 'soʼm' : ''} sub="広告費 ÷ リスト数" />
          <KpiCard label="流入経路数" value={formatNumber(result?.sourceRows.length ?? 0)} unit="種" />
        </div>
      </section>

      {/* ============ 営業 ============ */}
      <section className="section">
        <div className="section-head">
          <span className="pill">営業</span>
          <span className="hint">パイプライン: {result?.funnel?.pipeName || pipes.find((p) => String(p.id) === prefs.pipeId)?.name || '—'}</span>
        </div>
        <div className="kpi-grid">
          <KpiCard label="来店数" value={formatNumber(visits)} unit="件" sub={stages[Math.max(0, Math.min(stages.length - 1, vi))]?.name} />
          <KpiCard label="契約数" value={formatNumber(contracts)} unit="件" accent />
          <KpiCard label="成約率" value={formatPercent(closeRate, 1)} sub="契約 ÷ リスト" />
          <KpiCard label="平均リードタイム" value={result?.funnel?.averageDay ? formatNumber(result.funnel.averageDay) : '—'} unit={result?.funnel?.averageDay ? '日' : ''} />
        </div>

        <div className="cards" style={{ marginTop: 14 }}>
          <div className="card">
            <h3>案件ごとの状況（パイプライン段階別 件数）</h3>
            <FunnelChart stages={stages} />
          </div>
          <div className="card">
            <h3>流入経路（リスト数の内訳）</h3>
            {result?.sourceRows.length ? <SourcePie rows={result.sourceRows} /> : <SourceLeadsChart rows={result?.sourceRows ?? []} />}
          </div>
        </div>

        {result?.sourceRows.length ? (
          <div className="card" style={{ marginTop: 14 }}>
            <h3>流入経路 詳細</h3>
            <div className="tbl-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>流入経路</th>
                    <th>リスト数</th>
                    <th>広告費</th>
                    <th>リスト単価</th>
                    <th>契約数</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sourceRows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <span className="swatch" style={{ background: seriesColor(i, dark) }} />
                        {r.source}
                      </td>
                      <td>{formatNumber(r.leads)}</td>
                      <td>{r.cost ? formatSom(r.cost) : '—'}</td>
                      <td>{r.costPerLead ? formatSom(r.costPerLead) : '—'}</td>
                      <td>{formatNumber(r.contracts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* ============ 売上 ============ */}
      <section className="section">
        <div className="section-head">
          <span className="pill">売上</span>
          <span className="hint">売上の認識はマーケ・営業と同一期間</span>
        </div>
        <div className="kpi-grid">
          <KpiCard label="トータル売上（期間内）" value={revenue ? formatCompact(revenue) : '—'} unit={revenue ? 'soʼm' : ''} sub={revenue ? formatSom(revenue) : '売上データ未取得'} accent />
          <KpiCard label="月平均売上" value={monthlyAvg ? formatCompact(monthlyAvg) : '—'} unit={monthlyAvg ? 'soʼm' : ''} />
          <KpiCard label="契約件数" value={formatNumber(contracts)} unit="件" />
          <KpiCard
            label="次月以降の売上見込み"
            value={result?.forecast != null ? formatCompact(result.forecast) : '—'}
            unit={result?.forecast != null ? 'soʼm' : ''}
            sub={result?.forecast != null ? '入金予定ベース' : '見込みデータ未取得'}
          />
        </div>

        <div className="cards" style={{ marginTop: 14 }}>
          <div className="card">
            <h3>月次 売上（棒）と累計（線）</h3>
            <MonthlyRevenueChart data={result?.monthly ?? []} />
          </div>
          <div className="card">
            <h3>月次 リスト数・来店数・契約数</h3>
            <MonthlyCountsChart data={result?.monthly ?? []} />
          </div>
        </div>

        {result?.monthly.length ? (
          <div className="card" style={{ marginTop: 14 }}>
            <h3>月次サマリー</h3>
            <div className="tbl-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>月</th>
                    <th>リスト数</th>
                    <th>来店数</th>
                    <th>契約数</th>
                    <th>売上</th>
                  </tr>
                </thead>
                <tbody>
                  {result.monthly.map((m, i) => (
                    <tr key={i}>
                      <td>{m.month}</td>
                      <td>{formatNumber(m.leads)}</td>
                      <td>{formatNumber(m.visits)}</td>
                      <td>{formatNumber(m.contracts)}</td>
                      <td>{m.revenue ? formatSom(m.revenue) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {result && <Diagnostics entries={result.diag} />}

      <p className="footnote">
        データ提供: uysot CRM（api.service.app.uysot.uz）／ このダッシュボードはブラウザから直接 API を呼び出します。
        <br />
        数値が実際と異なる場合は「接続診断」で生データを確認し、段階の対応付けを調整してください。
      </p>
    </div>
  );
}
