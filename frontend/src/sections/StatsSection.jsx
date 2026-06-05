import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ComposedChart, Line, Legend,
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

function TopProducts({ start, end, by }) {
  const { data, error, loading } = useApi(
    withParams("/api/stats/top-products", { limit: 8, by, start, end })
  );
  const isRev = by === "revenue";
  return (
    <Card title={`En Çok Satan Ürünler (${isRev ? "Ciro" : "Adet"})`}>
      <AsyncState loading={loading} error={error} data={data}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data || []} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis type="number" fontSize={11} tickFormatter={fmtNum} />
            <YAxis type="category" dataKey="product_name" width={150} fontSize={10} />
            <Tooltip formatter={(v) => (isRev ? fmtMoney(v) : `${fmtNum(v)} adet`)} />
            <Bar dataKey={isRev ? "revenue" : "quantity"} name={isRev ? "Ciro" : "Adet"}
              fill={isRev ? "#2563eb" : "#0891b2"} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AsyncState>
    </Card>
  );
}

function TopCustomers({ start, end }) {
  const { data, error, loading } = useApi(
    withParams("/api/stats/top-customers", { limit: 10, start, end })
  );
  return (
    <Card title="En Sık Sipariş Veren Müşteriler">
      <AsyncState loading={loading} error={error} data={data}>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          <table>
            <thead>
              <tr><th>Müşteri</th><th className="num">Sipariş</th><th className="num">Ciro</th></tr>
            </thead>
            <tbody>
              {(data || []).map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td className="num">{c.orders}</td>
                  <td className="num">{fmtMoney(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncState>
    </Card>
  );
}

function ByCity({ start, end }) {
  const { data, error, loading } = useApi(
    withParams("/api/stats/by-city", { limit: 10, start, end })
  );
  return (
    <Card title="Şehir Kırılımı — Ciro & Ortalama Sepet">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Çubuk: toplam ciro · Çizgi: ortalama sepet. Yüksek sepet = kaliteli müşteri,
        düşük sepet = büyüme potansiyeli.
      </p>
      <AsyncState loading={loading} error={error} data={data}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data || []} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="city" fontSize={10} angle={-25} textAnchor="end" height={60} />
            <YAxis yAxisId="l" fontSize={11} tickFormatter={fmtNum} />
            <YAxis yAxisId="r" orientation="right" fontSize={11} tickFormatter={fmtNum} />
            <Tooltip formatter={(v) => fmtMoney(v)} />
            <Legend />
            <Bar yAxisId="l" dataKey="revenue" name="Ciro" fill="#16a34a" radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" dataKey="avg_basket" name="Ort. Sepet" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </AsyncState>
    </Card>
  );
}

function Concentration({ start, end }) {
  const { data, error, loading } = useApi(withParams("/api/stats/concentration", { start, end }));
  const top3 = data?.levels?.find((l) => l.top === 3);
  return (
    <Card title="Konsantrasyon Risk Göstergesi">
      <AsyncState loading={loading} error={error} data={data}>
        {data && (
          <>
            <div className="help" style={{ marginBottom: 12, ...(top3?.risk ? { background: "#fef2f2", color: "#991b1b" } : {}) }}>
              {top3?.risk ? "⚠ " : ""}Top 3 müşteri toplam cironun <b>%{top3?.pct}</b>'ini oluşturuyor.
              Ciro az sayıda müşteriye bağımlıysa risk artar — eşik aşılan kutular kırmızı.
            </div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {data.levels.map((l) => (
                <div key={l.top} className="card stat-card"
                  style={{ borderLeft: `4px solid ${l.risk ? "#dc2626" : "#16a34a"}` }}>
                  <div className="label">Top {l.top} Müşteri Payı</div>
                  <div className="value" style={{ color: l.risk ? "#dc2626" : "var(--text)" }}>%{l.pct}</div>
                  <div className="label" style={{ marginTop: 4 }}>
                    eşik %{l.threshold}{l.risk ? " · RİSK" : " · normal"}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
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
          <div style={{ marginTop: 16 }}>
            <Concentration start={range.start} end={range.end} />
          </div>
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <TopProducts start={range.start} end={range.end} by="revenue" />
            <TopProducts start={range.start} end={range.end} by="quantity" />
          </div>
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <ByCity start={range.start} end={range.end} />
            <TopCustomers start={range.start} end={range.end} />
          </div>
        </>
      )}
    </section>
  );
}
