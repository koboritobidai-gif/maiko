import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getContracts,
  getCustomerFlow,
  listHouses,
  listLeadSources,
  listPipes,
  type Contract,
  type FunnelResult,
  type Named,
  type Pipe,
} from '../api/uysot';
import { setPass, setToken } from '../api/client';
import KpiCard from './KpiCard';
import Diagnostics, { type DiagEntry } from './Diagnostics';
import { FunnelChart, MonthlyCountsChart, MonthlyRevenueChart, type MonthlyPoint } from './charts';
import { formatNumber, formatSom, formatPercent, formatCompact } from '../utils/format';
import { translateStatus } from '../utils/status';
import {
  endOfMonth,
  lastMonthsRange,
  monthsInRange,
  shortMonthLabel,
  startOfMonth,
  toISO,
  ymFromUnix,
} from '../utils/date';

interface Props {
  onLogout: () => void;
}

interface Prefs {
  houseId: string;
  pipeId: string;
  months: number;
  visitStageId: string;
}
const PREFS_KEY = 'jp-plaza-prefs';

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { houseId: '', pipeId: '', months: 6, visitStageId: '', ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { houseId: '', pipeId: '', months: 6, visitStageId: '' };
}

interface LoadResult {
  funnel: FunnelResult | null;
  contracts: Contract[];
  contractsAvailable: boolean;
  monthly: MonthlyPoint[];
  sources: Named[];
  spendAvailable: boolean;
  diag: DiagEntry[];
}

// pick a sensible default "visit" stage (商談設定 / meeting scheduled)
function defaultVisitStageId(f: FunnelResult): string {
  const byName = f.stages.find((s) => /uchrashuv|商談|meeting/i.test(s.name) || translateStatus(s.name) === '商談設定');
  if (byName) return String(byName.id);
  // else the stage before the closing ones
  const mid = f.stages[Math.max(0, Math.floor(f.stages.length / 2))];
  return mid ? String(mid.id) : '';
}

export default function Dashboard({ onLogout }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [houses, setHouses] = useState<Named[]>([]);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [refReady, setRefReady] = useState(false);
  const [refError, setRefError] = useState('');

  const [result, setResult] = useState<LoadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const loadSeq = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const range = useMemo(() => lastMonthsRange(prefs.months), [prefs.months]);

  /* reference data */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [h, p] = await Promise.allSettled([listHouses(), listPipes()]);
      if (cancelled) return;
      let anyOk = false;
      if (h.status === 'fulfilled') {
        setHouses(h.value);
        anyOk = true;
      }
      if (p.status === 'fulfilled') {
        setPipes(p.value);
        anyOk = true;
      }
      setRefReady(true);
      if (!anyOk) setRefError('基礎データを取得できませんでした（トークンの有効期限切れの可能性）');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // auto-select Japan Plaza / first entries
  useEffect(() => {
    if (pipes.length && !prefs.pipeId) {
      const jp = pipes.find((p) => /japan/i.test(p.name)) || pipes[0];
      setPrefs((p) => ({ ...p, pipeId: String(jp.id) }));
    }
  }, [pipes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (houses.length && !prefs.houseId) {
      const jp = houses.find((h) => /japan/i.test(h.name)) || houses[0];
      setPrefs((p) => ({ ...p, houseId: String(jp.id) }));
    }
  }, [houses]); // eslint-disable-line react-hooks/exhaustive-deps

  /* main load */
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError('');
    const diag: DiagEntry[] = [];
    const rec = (label: string, path: string, ok: boolean, status: number, data: unknown) =>
      diag.push({ label, path, ok, status, data });

    const pipeId = prefs.pipeId;
    const houseId = prefs.houseId || null;
    if (!pipeId) {
      setLoading(false);
      return;
    }

    // 1. funnel
    let funnel: FunnelResult | null = null;
    try {
      funnel = await getCustomerFlow(pipeId, range);
      rec('ファネル（顧客フロー）', '/v1/statistics/customer-flow/v2', true, 200, funnel);
    } catch (e) {
      const err = e as { status?: number; body?: unknown; message?: string };
      rec('ファネル（顧客フロー）', '/v1/statistics/customer-flow/v2', false, err.status ?? 0, err.body ?? err.message);
    }

    // 2. contracts (revenue)
    let contracts: Contract[] = [];
    let contractsAvailable = false;
    try {
      const c = await getContracts(houseId);
      // active contracts created within the selected range
      const fromT = new Date(range.fromDate + 'T00:00:00').getTime() / 1000;
      const toT = new Date(range.toDate + 'T23:59:59').getTime() / 1000;
      contracts = c.contracts.filter((x) => !x.deleted && x.createdTimestamp >= fromT && x.createdTimestamp <= toT);
      contractsAvailable = true;
      rec('契約一覧（売上）', '/v1/contract/filter', true, 200, c.raw);
    } catch (e) {
      const err = e as { status?: number; body?: unknown; message?: string };
      rec('契約一覧（売上）', '/v1/contract/filter', false, err.status ?? 0, err.body ?? err.message);
    }

    // 3. lead sources (list)
    let sources: Named[] = [];
    try {
      sources = await listLeadSources();
      rec('流入経路（一覧）', '/v1/lead/sources', true, 200, sources);
    } catch (e) {
      const err = e as { status?: number; body?: unknown; message?: string };
      rec('流入経路（一覧）', '/v1/lead/sources', false, err.status ?? 0, err.body ?? err.message);
    }

    // marketing spend is permission-gated (plan-fact) — probe once for the diagnostics
    let spendAvailable = false;
    try {
      const { probe } = await import('../api/uysot');
      const r = await probe('/v1/statistics/plan-fact-pipe', 'POST', {
        pipeId,
        fromDate: range.fromDate,
        toDate: range.toDate,
      });
      spendAvailable = r.ok;
      rec('広告費（プラン/実績）', '/v1/statistics/plan-fact-pipe', r.ok, r.status, r.data);
    } catch {
      /* ignore */
    }

    // 4. monthly — per-month funnel (leads/visits) + contracts (revenue/count)
    const months = monthsInRange(range);
    const visitId = prefs.visitStageId || (funnel ? defaultVisitStageId(funnel) : '');
    const monthly: MonthlyPoint[] = [];
    // contracts grouped by month
    const cByMonth = new Map<string, { rev: number; cnt: number }>();
    for (const c of contracts) {
      const k = ymFromUnix(c.createdTimestamp);
      const cur = cByMonth.get(k) || { rev: 0, cnt: 0 };
      cur.rev += c.amount;
      cur.cnt += 1;
      cByMonth.set(k, cur);
    }
    for (const ym of months) {
      const [y, m] = ym.split('-').map(Number);
      const mRange = {
        fromDate: toISO(startOfMonth(new Date(y, m - 1, 1))),
        toDate: toISO(endOfMonth(new Date(y, m - 1, 1))),
      };
      const point: MonthlyPoint = { month: shortMonthLabel(ym), leads: 0, visits: 0, contracts: 0, revenue: 0 };
      try {
        const f = await getCustomerFlow(pipeId, mRange);
        if (f.stages.length) {
          point.leads = f.stages[0].count;
          const vs = f.stages.find((s) => String(s.id) === visitId);
          point.visits = vs ? vs.count : 0;
        }
      } catch {
        /* leave zeros */
      }
      const cm = cByMonth.get(ym);
      if (cm) {
        point.revenue = cm.rev;
        point.contracts = cm.cnt;
      }
      monthly.push(point);
    }

    if (seq !== loadSeq.current) return;
    if (!funnel && !contractsAvailable) {
      setLoadError('データを取得できませんでした。トークンの有効期限切れの可能性があります。');
    }
    setResult({ funnel, contracts, contractsAvailable, monthly, sources, spendAvailable, diag });
    setLoading(false);
  }, [prefs.pipeId, prefs.houseId, prefs.visitStageId, range]);

  useEffect(() => {
    if (refReady && prefs.pipeId) load();
  }, [refReady, prefs.pipeId, load]);

  /* derived */
  const funnel = result?.funnel;
  const stages = funnel?.stages ?? [];
  const leadCount = stages[0]?.count ?? 0;
  const visitId = prefs.visitStageId || (funnel ? defaultVisitStageId(funnel) : '');
  const visitStage = stages.find((s) => String(s.id) === visitId);
  const visits = visitStage?.count ?? 0;
  const contractCount = result?.contracts.length ?? 0;
  const revenueTotal = result?.contracts.reduce((s, c) => s + c.amount, 0) ?? 0;
  const payedTotal = result?.contracts.reduce((s, c) => s + c.payedAmount, 0) ?? 0;
  const residueTotal = result?.contracts.reduce((s, c) => s + c.residue, 0) ?? 0;
  const closeRate = leadCount ? (contractCount / leadCount) * 100 : 0;
  const monthlyAvg = revenueTotal && prefs.months ? revenueTotal / prefs.months : 0;

  function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    setPrefs((p) => ({ ...p, [k]: v }));
  }

  const relog = () => {
    setToken('');
    setPass('');
    onLogout();
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand-dot">JP</div>
        <h1>ジャパンプラザ 販売進捗ダッシュボード</h1>
        <span className="spacer" />
        <button className="btn" type="button" onClick={relog}>
          ログアウト
        </button>
      </div>

      {/* filters */}
      <div className="filters">
        <div className="field">
          <label>物件</label>
          <select value={prefs.houseId} onChange={(e) => setPref('houseId', e.target.value)}>
            {houses.map((h) => (
              <option key={h.id} value={String(h.id)}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>パイプライン</label>
          <select value={prefs.pipeId} onChange={(e) => setPref('pipeId', e.target.value)}>
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
          <div className="field">
            <label>「来店」に対応する段階</label>
            <select value={visitId} onChange={(e) => setPref('visitStageId', e.target.value)}>
              {stages.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {translateStatus(s.name)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>&nbsp;</label>
          <button className="btn primary" type="button" onClick={load} disabled={loading}>
            {loading ? '読み込み中…' : '更新'}
          </button>
        </div>
      </div>

      {refError && (
        <div className="error" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div>{refError}</div>
          <button className="btn primary" type="button" onClick={relog}>
            新しいトークンを入れ直す
          </button>
        </div>
      )}
      {loadError && (
        <div className="error" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div>{loadError}</div>
          <button className="btn primary" type="button" onClick={relog}>
            新しいトークンを入れ直す
          </button>
        </div>
      )}

      {/* ===== マーケティング ===== */}
      <section className="section">
        <div className="section-head">
          <span className="pill">マーケティング</span>
          <span className="hint">
            {range.fromDate} 〜 {range.toDate}
          </span>
        </div>
        <div className="kpi-grid">
          <KpiCard
            label="使った金額（広告費）"
            value={result?.spendAvailable ? '—' : '権限なし'}
            sub={result?.spendAvailable ? '' : 'uysotの統計権限が必要です'}
          />
          <KpiCard label="リスト数（獲得数）" value={formatNumber(leadCount)} unit="件" sub={stages[0] ? translateStatus(stages[0].name) : ''} />
          <KpiCard label="有効リード（連絡済み〜）" value={formatNumber(stages.filter((s) => s.order >= 4).reduce((a, b) => a + b.count, 0))} unit="件" />
          <KpiCard label="流入経路（登録数）" value={formatNumber(result?.sources.length ?? 0)} unit="種" sub="経路別件数は権限が必要" />
        </div>
      </section>

      {/* ===== 営業 ===== */}
      <section className="section">
        <div className="section-head">
          <span className="pill">営業</span>
          <span className="hint">パイプライン: {pipes.find((p) => String(p.id) === prefs.pipeId)?.name || '—'}</span>
        </div>
        <div className="kpi-grid">
          <KpiCard label="来店数（商談）" value={formatNumber(visits)} unit="件" sub={visitStage ? translateStatus(visitStage.name) : ''} />
          <KpiCard label="契約数" value={formatNumber(contractCount)} unit="件" accent sub="成約した契約書" />
          <KpiCard label="成約率" value={formatPercent(closeRate, 1)} sub="契約 ÷ リスト" />
          <KpiCard label="平均リードタイム" value={funnel?.averageDay ? formatNumber(funnel.averageDay) : '—'} unit={funnel?.averageDay ? '日' : ''} />
        </div>

        <div className="cards" style={{ marginTop: 14 }}>
          <div className="card">
            <h3>案件ごとの状況（パイプライン段階別 件数）</h3>
            <FunnelChart stages={stages.map((s) => ({ ...s, name: translateStatus(s.name) }))} />
          </div>
          <div className="card">
            <h3>各段階の詳細</h3>
            <div className="tbl-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>段階</th>
                    <th>件数</th>
                    <th>割合</th>
                    <th>平均日数</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((s) => (
                    <tr key={s.id}>
                      <td>{translateStatus(s.name)}</td>
                      <td>{formatNumber(s.count)}</td>
                      <td>{formatPercent(s.countLeadPercent, 1)}</td>
                      <td>{s.day ? formatNumber(s.day) : '—'}</td>
                    </tr>
                  ))}
                  {!stages.length && (
                    <tr>
                      <td colSpan={4} className="muted" style={{ textAlign: 'center' }}>
                        データがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 売上 ===== */}
      <section className="section">
        <div className="section-head">
          <span className="pill">売上</span>
          <span className="hint">対象物件の契約ベース（{range.fromDate} 〜 {range.toDate}）</span>
        </div>
        <div className="kpi-grid">
          <KpiCard label="トータル売上（契約額）" value={revenueTotal ? formatCompact(revenueTotal) : '—'} unit={revenueTotal ? 'soʼm' : ''} sub={revenueTotal ? formatSom(revenueTotal) : ''} accent />
          <KpiCard label="回収済み金額" value={payedTotal ? formatCompact(payedTotal) : '—'} unit={payedTotal ? 'soʼm' : ''} sub={payedTotal ? formatSom(payedTotal) : ''} />
          <KpiCard label="次月以降の入金見込み（残額）" value={residueTotal ? formatCompact(residueTotal) : '—'} unit={residueTotal ? 'soʼm' : ''} sub={residueTotal ? formatSom(residueTotal) : ''} />
          <KpiCard label="月平均売上" value={monthlyAvg ? formatCompact(monthlyAvg) : '—'} unit={monthlyAvg ? 'soʼm' : ''} />
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
        データ提供: uysot CRM（service.app.uysot.uz）／ このダッシュボードは中継サーバー経由で API を呼び出します。
        <br />
        「使った金額」「流入経路別の件数」は uysot の統計権限が必要です（現在のアカウントでは権限なし）。
      </p>
    </div>
  );
}
