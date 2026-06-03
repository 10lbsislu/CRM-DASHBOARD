import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import { useApi } from "../hooks/useApi";
import {
  Card, StatCard, AsyncState, fmtMoney, fmtMoney2, fmtNum,
} from "../components/common";

// base + parametreleri birleştirip URL üretir (boş değerleri atar)
function withParams(base, params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.append(k, v);
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
  });
}

function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const p = (n) => String(n).padStart(2, "0");
  return { start: `${ym}-01`, end: `${ny}-${p(nm)}-01` };
}

function DateRangeBar({ months, value, onChange }) {
  const idx = months.indexOf(value);
  const step = (d) => {
    const ni = idx + d;
    if (ni >= 0 && ni < months.length) onChange(months[ni]);
  };
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <b style={{ fontSize: 13 }}>Dönem:</b>
      <button
        className="tab"
        style={{ borderRadius: 8, background: value === "all" ? "var(--accent)" : "var(--bg)", color: value === "all" ? "#fff" : "var(--text)" }}
        onClick={() => onChange("all")}
      >
        Tüm Zamanlar
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button className="btn" style={{ padding: "6px 12px", background: "var(--bg)", color: "var(--text)" }}
          disabled={value === "all" || idx <= 0} onClick={() => step(-1)}>◀</button>
        <select
          value={value === "all" ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, minWidth: 150 }}
        >
          <option value="" disabled>Ay seç…</option>
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <button className="btn" style={{ padding: "6px 12px", background: "var(--bg)", color: "var(--text)" }}
          disabled={value === "all" || idx < 0 || idx >= months.length - 1} onClick={() => step(1)}>▶</button>
      </div>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>
        {value === "all" ? "Tüm siparişler" : monthLabel(value)}
      </span>
    </div>
  );
}

function Summary({ start, end }) {
  const { data, error, loading } = useApi(withParams("/api/stats/summary", { start, end }));
  if (loading || error || !data) {
    return (
      <div className="grid grid-4">
        <AsyncState loading={loading} error={error} data={data}><span /></AsyncState>
      </div>
    );
  }
  return (
    <div className="grid grid-4">
      <StatCard label="Net Ciro" value={fmtMoney(data.net_revenue)} />
      <StatCard label="Sipariş Sayısı" value={fmtNum(data.order_count)} />
      <StatCard label="Ortalama Sepet" value={fmtMoney2(data.avg_basket)} />
      <StatCard label="Tekil Müşteri" value={fmtNum(data.unique_customers)} />
    </div>
  );
}

function TopProducts({ start, end }) {
  const { data, error, loading } = useApi(
    withParams("/api/stats/top-products", { limit: 8, by: "revenue", start, end })
  );
  return (
    <Card title="En Çok Satan Ürünler (Ciro)">
      <AsyncState loading={loading} error={error} data={data}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data || []} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis type="number" fontSize={11} tickFormatter={fmtNum} />
            <YAxis type="category" dataKey="product_name" width={150} fontSize={10} />
            <Tooltip formatter={(v) => fmtMoney(v)} />
            <Bar dataKey="revenue" name="Ciro" fill="#2563eb" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AsyncState>
    </Card>
  );
}

function ByCity({ start, end }) {
  const { data, error, loading } = useApi(
    withParams("/api/stats/by-city", { limit: 10, start, end })
  );
  return (
    <Card title="Şehir Kırılımı (Ciro)">
      <AsyncState loading={loading} error={error} data={data}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data || []} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="city" fontSize={10} angle={-25} textAnchor="end" height={60} />
            <YAxis fontSize={11} tickFormatter={fmtNum} />
            <Tooltip formatter={(v) => fmtMoney(v)} />
            <Bar dataKey="revenue" name="Ciro" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AsyncState>
    </Card>
  );
}

export default function StatsSection() {
  const { data: meta } = useApi("/api/stats/months");
  const [sel, setSel] = useState(null); // null=henüz belirlenmedi, 'all' veya 'YYYY-MM'
  const months = meta?.months || [];

  // Açılışta en güncel ay seçili gelsin (kullanıcı sonra değiştirebilir)
  useEffect(() => {
    if (sel === null && months.length) setSel(months[months.length - 1]);
  }, [months, sel]);

  const range = sel && sel !== "all" ? monthRange(sel) : { start: null, end: null };

  return (
    <section className="section">
      <h2 className="section-title">
        <span className="num">2</span> Sipariş İstatistikleri
      </h2>
      <div style={{ marginBottom: 16 }}>
        <DateRangeBar months={months} value={sel ?? "all"} onChange={setSel} />
      </div>
      {sel === null ? (
        <div className="state">Yükleniyor…</div>
      ) : (
        <>
          <Summary start={range.start} end={range.end} />
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <TopProducts start={range.start} end={range.end} />
            <ByCity start={range.start} end={range.end} />
          </div>
        </>
      )}
    </section>
  );
}
