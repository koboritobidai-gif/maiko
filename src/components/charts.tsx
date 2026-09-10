import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDark } from '../hooks/useDark';
import { seriesColor } from '../theme';
import { formatNumber, formatCompact } from '../utils/format';
import type { FunnelStage, SourceRow } from '../api/uysot';

function useAxis() {
  const dark = useDark();
  return {
    dark,
    grid: dark ? '#2c342f' : '#e4e5e1',
    tick: dark ? '#b7c0ba' : '#55605b',
    surface: dark ? '#1a201d' : '#ffffff',
    border: dark ? '#3a443e' : '#d3d4cf',
  };
}

function TipBox({ active, payload, label, unit }: any) {
  const a = useAxis();
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: a.surface,
        border: `1px solid ${a.border}`,
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 12,
        color: a.tick,
        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
      }}
    >
      {label != null && <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span
            style={{ width: 9, height: 9, borderRadius: 2, background: p.color, display: 'inline-block' }}
          />
          <span>{p.name}</span>
          <strong style={{ marginLeft: 'auto' }}>
            {formatNumber(p.value)}
            {unit || ''}
          </strong>
        </div>
      ))}
    </div>
  );
}

/* ---------- funnel: stages as horizontal bars ---------- */
export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const a = useAxis();
  if (!stages.length) return <div className="empty">データがありません</div>;
  const data = stages.map((s, i) => ({ ...s, fill: seriesColor(0, a.dark), _i: i }));
  return (
    <div className="chart-wrap tall">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={a.grid} />
          <XAxis type="number" tick={{ fill: a.tick, fontSize: 11 }} stroke={a.grid} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fill: a.tick, fontSize: 11 }}
            stroke={a.grid}
          />
          <Tooltip content={<TipBox unit=" 件" />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" name="件数" radius={[0, 4, 4, 0]} maxBarSize={26} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d._i} fill={seriesColor(0, a.dark)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- lead sources: leads per source ---------- */
export function SourceLeadsChart({ rows }: { rows: SourceRow[] }) {
  const a = useAxis();
  if (!rows.length) return <div className="empty">データがありません</div>;
  const data = rows.map((r, i) => ({ ...r, _i: i }));
  return (
    <div className="chart-wrap">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={a.grid} />
          <XAxis type="number" tick={{ fill: a.tick, fontSize: 11 }} stroke={a.grid} />
          <YAxis
            type="category"
            dataKey="source"
            width={110}
            tick={{ fill: a.tick, fontSize: 11 }}
            stroke={a.grid}
          />
          <Tooltip content={<TipBox unit=" 件" />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="leads" name="リスト数" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d._i} fill={seriesColor(d._i, a.dark)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- lead sources: share pie ---------- */
export function SourcePie({ rows }: { rows: SourceRow[] }) {
  const a = useAxis();
  const data = rows.filter((r) => r.leads > 0);
  if (!data.length) return <div className="empty">データがありません</div>;
  return (
    <div className="chart-wrap">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="leads"
            nameKey="source"
            innerRadius="52%"
            outerRadius="82%"
            paddingAngle={2}
            isAnimationActive={false}
            stroke={a.surface}
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={seriesColor(i, a.dark)} />
            ))}
          </Pie>
          <Tooltip content={<TipBox unit=" 件" />} />
          <Legend wrapperStyle={{ fontSize: 11, color: a.tick }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- monthly trend: grouped counts ---------- */
export interface MonthlyPoint {
  month: string;
  leads: number;
  visits: number;
  contracts: number;
  revenue: number;
}

export function MonthlyCountsChart({ data }: { data: MonthlyPoint[] }) {
  const a = useAxis();
  if (!data.length) return <div className="empty">データがありません</div>;
  return (
    <div className="chart-wrap">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 4 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={a.grid} />
          <XAxis dataKey="month" tick={{ fill: a.tick, fontSize: 11 }} stroke={a.grid} />
          <YAxis tick={{ fill: a.tick, fontSize: 11 }} stroke={a.grid} />
          <Tooltip content={<TipBox unit=" 件" />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Legend wrapperStyle={{ fontSize: 11, color: a.tick }} />
          <Bar dataKey="leads" name="リスト数" fill={seriesColor(0, a.dark)} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="visits" name="来店数" fill={seriesColor(2, a.dark)} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="contracts" name="契約数" fill={seriesColor(1, a.dark)} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyRevenueChart({ data }: { data: MonthlyPoint[] }) {
  const a = useAxis();
  if (!data.length) return <div className="empty">データがありません</div>;
  // running cumulative total for the trend line
  let cum = 0;
  const d2 = data.map((p) => ({ ...p, cumulative: (cum += p.revenue) }));
  return (
    <div className="chart-wrap">
      <ResponsiveContainer>
        <ComposedChart data={d2} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={a.grid} />
          <XAxis dataKey="month" tick={{ fill: a.tick, fontSize: 11 }} stroke={a.grid} />
          <YAxis tick={{ fill: a.tick, fontSize: 11 }} stroke={a.grid} tickFormatter={(v) => formatCompact(v)} />
          <Tooltip content={<TipBox unit=" soʼm" />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Legend wrapperStyle={{ fontSize: 11, color: a.tick }} />
          <Bar dataKey="revenue" name="月次売上" fill={seriesColor(0, a.dark)} radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false} />
          <Line
            dataKey="cumulative"
            name="累計売上"
            type="monotone"
            stroke={seriesColor(1, a.dark)}
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
