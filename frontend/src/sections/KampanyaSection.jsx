import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { useApi } from "../hooks/useApi";
import {
  Card, StatCard, AsyncState, fmtMoney, fmtDate,
  DateRangeBar, withParams, monthRange, segColor,
} from "../components/common";

function DiscountImpact({ months }) {
  const [sel, setSel] = useState("all");
  const range = sel === "all" ? { start: null, end: null } : monthRange(sel);
  const { data, error, loading } = useApi(withParams("/api/crm/discount-impact", range));
  const pct = (a, b) => (b ? ((a * 100) / b).toFixed(1) : 0);
  return (
    <Card title="İndirimin Ciroya Etkisi">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Data'daki gerçek indirimli siparişlerden hesaplanır (Kampanya Toplamı &gt; 0).
      </p>
      <div style={{ marginBottom: 12 }}>
        <DateRangeBar months={months} value={sel} onChange={setSel} />
      </div>
      <AsyncState loading={loading} error={error} data={data}>
        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16 }}>
            <StatCard label="Genel Ciro" value={fmtMoney(data.total_revenue)} />
            <div className="card stat-card" style={{ borderLeft: "4px solid #dc2626" }}>
              <div className="label">İndirim Maliyeti</div>
              <div className="value" style={{ color: "#dc2626" }}>{fmtMoney(data.total_discount)}</div>
              <div className="label" style={{ marginTop: 4 }}>cironun %{data.discount_pct_of_revenue}'i</div>
            </div>
            <div className="card stat-card">
              <div className="label">İndirimli Sipariş</div>
              <div className="value">{data.discounted_orders} <span style={{ fontSize: 14, color: "var(--muted)" }}>/ {data.total_orders}</span></div>
              <div className="label" style={{ marginTop: 4 }}>%{data.discounted_order_pct}</div>
            </div>
            <div className="card stat-card">
              <div className="label">İndirimli Sipariş Cirosu</div>
              <div className="value">{fmtMoney(data.discounted_revenue)}</div>
              <div className="label" style={{ marginTop: 4 }}>genel cironun %{pct(data.discounted_revenue, data.total_revenue)}'i</div>
            </div>
          </div>
        )}
      </AsyncState>
    </Card>
  );
}

function Roi() {
  const { data, error, loading } = useApi("/api/crm/campaign-roi?period=month");
  return (
    <Card title="Kampanya İndirimi (aylık)">
      <AsyncState loading={loading} error={error} data={data}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data || []} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="period" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v) => fmtMoney(v)} />
            <Bar dataKey="total_discount" name="İndirim" fill="#ea580c" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AsyncState>
    </Card>
  );
}

function Distribution() {
  const { data } = useApi("/api/crm/summary");
  return (
    <Card title="Kampanya Dağılımı (atanmış)">
      <AsyncState loading={!data} error={null} data={data?.campaign_distribution}>
        <table>
          <thead><tr><th>Kampanya</th><th className="num">Müşteri</th></tr></thead>
          <tbody>
            {(data?.campaign_distribution || []).map((c) => (
              <tr key={c.campaign}>
                <td><span className="badge" style={{ background: segColor(c.campaign) + "1a", color: segColor(c.campaign) }}>{c.campaign}</span></td>
                <td className="num">{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AsyncState>
    </Card>
  );
}

function ExpiringCoupons() {
  const { data, error, loading } = useApi("/api/crm/customers?coupon=expiring");
  const { data: exp } = useApi("/api/crm/customers?coupon=expired");
  return (
    <Card title="Kupon Süresi">
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <span className="badge cs-expiring">{(data || []).length} yakında bitecek</span>
        <span className="badge cs-expired">{(exp || []).length} süresi dolmuş</span>
      </div>
      <AsyncState loading={loading} error={error} data={data}>
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Müşteri</th><th>Kampanya</th><th>Bitiş</th></tr></thead>
            <tbody>
              {(data || []).map((r) => (
                <tr key={r.customer_id}>
                  <td>{r.name}</td><td>{r.campaign_type || "—"}</td>
                  <td><span className="badge cs-expiring">{fmtDate(r.coupon_expiry_date)}</span></td>
                </tr>
              ))}
              {!(data || []).length && <tr><td colSpan={3} className="state">Yakında bitecek kupon yok</td></tr>}
            </tbody>
          </table>
        </div>
      </AsyncState>
    </Card>
  );
}

export default function KampanyaSection() {
  const { data: meta } = useApi("/api/stats/months");
  const months = meta?.months || [];
  return (
    <section className="section">
      <h2 className="section-title"><span className="num">◆</span> Kampanya</h2>
      <p className="section-desc">Kampanya ve indirim performansı — maliyet, etki, kupon süreleri.</p>

      <DiscountImpact months={months} />

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Roi />
        <Distribution />
      </div>
      <div style={{ marginTop: 16 }}>
        <ExpiringCoupons />
      </div>
    </section>
  );
}
