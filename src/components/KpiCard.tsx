interface Props {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: boolean;
}

export default function KpiCard({ label, value, unit, sub, accent }: Props) {
  return (
    <div className={`kpi${accent ? ' accent' : ''}`}>
      <span className="label">{label}</span>
      <span className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}
