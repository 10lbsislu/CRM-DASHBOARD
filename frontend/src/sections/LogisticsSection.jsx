import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { Card, StatCard, Modal, AsyncState, fmtMoney, fmtDate } from "../components/common";

function withParams(base, params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") sp.append(k, v);
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
};
const monthRange = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const p = (n) => String(n).padStart(2, "0");
  return { start: `${ym}-01`, end: `${ny}-${p(nm)}-01` };
};

function DateRangeBar({ months, value, onChange }) {
  const idx = months.indexOf(value);
  const step = (d) => { const ni = idx + d; if (ni >= 0 && ni < months.length) onChange(months[ni]); };
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
      <b style={{ fontSize: 13 }}>Dönem:</b>
      <button className="tab" style={{ borderRadius: 8, background: value === "all" ? "var(--accent)" : "var(--bg)", color: value === "all" ? "#fff" : "var(--text)" }}
        onClick={() => onChange("all")}>Tüm Zamanlar</button>
      <button className="btn" style={{ padding: "6px 12px", background: "var(--bg)", color: "var(--text)" }}
        disabled={value === "all" || idx <= 0} onClick={() => step(-1)}>◀</button>
      <select value={value === "all" ? "" : value} onChange={(e) => onChange(e.target.value)}
        style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, minWidth: 150 }}>
        <option value="" disabled>Ay seç…</option>
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
      <button className="btn" style={{ padding: "6px 12px", background: "var(--bg)", color: "var(--text)" }}
        disabled={value === "all" || idx < 0 || idx >= months.length - 1} onClick={() => step(1)}>▶</button>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>{value === "all" ? "Tüm siparişler" : monthLabel(value)}</span>
    </div>
  );
}

function MixedModal({ row, onClose }) {
  return (
    <Modal title={`Karışık Sipariş #${row.order_number}`} onClose={onClose}>
      <div className="help" style={{ marginBottom: 14 }}>
        <b>{row.name}</b> · {fmtDate(row.date)} · {row.city || "-"} · {fmtMoney(row.total)}
        <br />Bu sipariş hem donuk hem soğuk içerdiği için <b>2 ayrı kargo</b> gerektirdi.
      </div>
      <div className="grid grid-2">
        <div>
          <h4 style={{ margin: "0 0 8px", color: "#2563eb" }}>❄️ Donuk ({row.donuk_count})</h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {row.donuk_products.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
        <div>
          <h4 style={{ margin: "0 0 8px", color: "#16a34a" }}>🧊 Soğuk ({row.soguk_count})</h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {row.soguk_products.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

function TypeBreakdown({ sum }) {
  const data = [
    { name: "Sadece Soğuk", value: sum.only_soguk, color: "#16a34a" },
    { name: "Sadece Donuk", value: sum.only_donuk, color: "#2563eb" },
    { name: "Karışık (2 kargo)", value: sum.mixed, color: "#dc2626" },
  ];
  return (
    <Card title="Sipariş Tipi Dağılımı">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={(e) => e.value}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip /><Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

function Trend() {
  const { data, error, loading } = useApi("/api/logistics/trend?period=month");
  return (
    <Card title="Karışık Sipariş & Ekstra Maliyet (aylık)">
      <AsyncState loading={loading} error={error} data={data}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data || []} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="period" fontSize={11} />
            <YAxis yAxisId="l" fontSize={11} />
            <YAxis yAxisId="r" orientation="right" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v, n) => (n === "Ekstra maliyet" ? fmtMoney(v) : v)} />
            <Legend />
            <Bar yAxisId="l" dataKey="mixed" name="Karışık sipariş" fill="#dc2626" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="r" dataKey="extra_cost" name="Ekstra maliyet" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AsyncState>
    </Card>
  );
}

function Culprits({ sum }) {
  return (
    <Card title="Karışık Siparişe En Çok Sebep Olan Ürünler">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Bu ürünler sepete eklendiğinde sipariş sıkça iki kargoya bölünüyor.
      </p>
      <div className="grid grid-2">
        <div>
          <h4 style={{ margin: "0 0 8px", color: "#2563eb", fontSize: 13 }}>❄️ Donuk taraf</h4>
          <table><tbody>
            {(sum.top_donuk_in_mixed || []).map((p) => (
              <tr key={p.product}><td>{p.product}</td><td className="num">{p.count}</td></tr>))}
          </tbody></table>
        </div>
        <div>
          <h4 style={{ margin: "0 0 8px", color: "#16a34a", fontSize: 13 }}>🧊 Soğuk taraf</h4>
          <table><tbody>
            {(sum.top_soguk_in_mixed || []).map((p) => (
              <tr key={p.product}><td>{p.product}</td><td className="num">{p.count}</td></tr>))}
          </tbody></table>
        </div>
      </div>
    </Card>
  );
}

function MixedOrders({ start, end }) {
  const { data, error, loading } = useApi(withParams("/api/logistics/mixed-orders", { start, end }));
  const [sel, setSel] = useState(null);
  return (
    <Card title={`Karışık Siparişler${data ? ` (${data.length})` : ""}`}>
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Hem donuk hem soğuk içeren, 2 kargo maliyeti doğuran siparişler. Detay için tıkla.
      </p>
      <AsyncState loading={loading} error={error} data={data}>
        <div style={{ maxHeight: 520, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>No</th><th>Tarih</th><th>Müşteri</th><th>Şehir</th>
                <th className="num">Donuk</th><th className="num">Soğuk</th><th className="num">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((o) => (
                <tr key={o.order_number} className="clickable-row" onClick={() => setSel(o)}>
                  <td>#{o.order_number}</td>
                  <td>{fmtDate(o.date)}</td>
                  <td>{o.name}</td>
                  <td>{o.city || "-"}</td>
                  <td className="num"><span className="badge" style={{ background: "#dbeafe", color: "#1d4ed8" }}>{o.donuk_count}</span></td>
                  <td className="num"><span className="badge" style={{ background: "#dcfce7", color: "#15803d" }}>{o.soguk_count}</span></td>
                  <td className="num">{fmtMoney(o.total)}</td>
                </tr>
              ))}
              {!data?.length && <tr><td colSpan={7} className="state">Bu dönemde karışık sipariş yok</td></tr>}
            </tbody>
          </table>
        </div>
      </AsyncState>
      {sel && <MixedModal row={sel} onClose={() => setSel(null)} />}
    </Card>
  );
}

export default function LogisticsSection() {
  const { data: meta } = useApi("/api/stats/months");
  const [sel, setSel] = useState("all");
  const months = meta?.months || [];
  const range = sel === "all" ? { start: null, end: null } : monthRange(sel);
  const { data: sum, error, loading } = useApi(withParams("/api/logistics/summary", range));

  return (
    <section className="section">
      <h2 className="section-title"><span className="num">⛟</span> Lojistik</h2>
      <p className="section-desc">
        Donuk ve soğuk ürünler ayrı kargoyla gönderiliyor. Hem donuk hem soğuk içeren
        "karışık" siparişler ikinci bir kargo maliyeti doğuruyor.
      </p>

      <DateRangeBar months={months} value={sel} onChange={setSel} />

      <AsyncState loading={loading} error={error} data={sum}>
        {sum && (
          <>
            <div className="grid grid-4">
              <div className="card stat-card" style={{ borderLeft: "4px solid #1b4f9b" }}>
                <div className="label">Tahmini Kargo Giderimiz</div>
                <div className="value">{fmtMoney(sum.our_shipping_cost)}</div>
                <div className="label" style={{ marginTop: 4 }}>~{fmtMoney(sum.shipping_per_order)}/gönderi</div>
              </div>
              <div className="card stat-card" style={{ borderLeft: "4px solid #16a34a" }}>
                <div className="label">Müşteriden Alınan Kargo</div>
                <div className="value" style={{ color: "#15803d" }}>{fmtMoney(sum.shipping_collected)}</div>
                <div className="label" style={{ marginTop: 4 }}>cironun %{sum.collected_pct}'i</div>
              </div>
              <div className="card stat-card" style={{ borderLeft: "4px solid #dc2626" }}>
                <div className="label">Net Kargo Maliyeti</div>
                <div className="value" style={{ color: "#dc2626" }}>{fmtMoney(sum.net_shipping_cost)}</div>
                <div className="label" style={{ marginTop: 4 }}>cironun %{sum.net_pct}'i (gider − alınan)</div>
              </div>
              <div className="card stat-card" style={{ borderLeft: "4px solid #f59e0b" }}>
                <div className="label">Karışık Sipariş</div>
                <div className="value" style={{ color: "#c2410c" }}>{sum.mixed} <span style={{ fontSize: 14, color: "var(--muted)" }}>(%{sum.mixed_pct})</span></div>
                <div className="label" style={{ marginTop: 4 }}>ekstra {fmtMoney(sum.extra_shipping_cost)}</div>
              </div>
            </div>
            <div className="help" style={{ marginTop: 12 }}>
              <b>Kargo ekonomisi:</b> Her gönderi ~{fmtMoney(sum.shipping_per_order)} maliyetli kabul edildi;
              karışık sipariş = 2 gönderi. Karışık siparişlerde müşteriden ortalama yalnızca{" "}
              <b>{fmtMoney(sum.avg_mixed_shipping)}</b> kargo alınıyor (tek tip siparişte {fmtMoney(sum.avg_single_shipping)}),
              ama maliyet 2 katına çıkıyor — bu da net zararı büyütüyor. Karışık siparişler cironun{" "}
              <b>%{sum.mixed_revenue_pct}</b>'ini oluşturuyor. Öneri: karışık sepetlerde ikinci kargo
              ücreti yansıtmak ya da ücretsiz kargo eşiğini gözden geçirmek.
            </div>

            <div className="grid grid-2" style={{ marginTop: 16 }}>
              <TypeBreakdown sum={sum} />
              <Trend />
            </div>
            <div style={{ marginTop: 16 }}><Culprits sum={sum} /></div>
            <div style={{ marginTop: 16 }}><MixedOrders start={range.start} end={range.end} /></div>
          </>
        )}
      </AsyncState>
    </section>
  );
}
