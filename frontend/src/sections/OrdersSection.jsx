import { useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { Card, Modal, AsyncState, fmtMoney, fmtMoney2, fmtDate, orderTierColor } from "../components/common";

function Trend() {
  const [period, setPeriod] = useState("month");
  const { data, error, loading } = useApi(`/api/orders/trend?period=${period}`);
  return (
    <Card title="Sipariş Trendi">
      <div style={{ marginBottom: 10 }}>
        {["day", "week", "month"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className="badge"
            style={{
              cursor: "pointer", border: "none", marginRight: 6,
              background: period === p ? "var(--accent)" : "var(--accent-soft)",
              color: period === p ? "#fff" : "var(--accent)",
            }}
          >
            {p === "day" ? "Gün" : p === "week" ? "Hafta" : "Ay"}
          </button>
        ))}
      </div>
      <AsyncState loading={loading} error={error} data={data}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="period" fontSize={11} />
            <YAxis yAxisId="l" fontSize={11} />
            <YAxis yAxisId="r" orientation="right" fontSize={11} />
            <Tooltip formatter={(v, n) => (n === "Ciro" ? fmtMoney(v) : v)} />
            <Legend />
            <Line yAxisId="l" type="monotone" dataKey="orders" name="Sipariş" stroke="#1b4f9b" strokeWidth={2} />
            <Line yAxisId="r" type="monotone" dataKey="revenue" name="Ciro" stroke="#16a34a" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </AsyncState>
    </Card>
  );
}

function OrderModal({ orderNumber, onClose, onGoCrm }) {
  const { data, error, loading } = useApi(`/api/orders/${orderNumber}`);
  return (
    <Modal title={`Sipariş #${orderNumber}`} onClose={onClose}>
      <AsyncState loading={loading} error={error} data={data}>
        {data && (
          <>
            <div className="help" style={{ marginBottom: 14 }}>
              <b>{data.customer_name}</b>
              {data.customer_email ? ` · ${data.customer_email}` : ""}<br />
              {fmtDate(data.order_date)} · {data.city || "-"} · Durum:{" "}
              <b>{data.status || "-"}</b> · Ödeme: {data.payment_status || "-"}
              {data.payment_method ? ` (${data.payment_method})` : ""}
            </div>
            {data.customer_id && onGoCrm && (
              <button
                className="btn"
                style={{ background: "var(--card-bg)", color: "var(--accent)", border: "1px solid var(--accent)", marginBottom: 14 }}
                onClick={() => onGoCrm(data.customer_id)}
              >
                ★ Bu müşterinin CRM kaydına git
              </button>
            )}
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th className="num">Adet</th>
                  <th className="num">Birim</th>
                  <th className="num">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.product_name}</td>
                    <td className="num">{it.quantity ?? "-"}</td>
                    <td className="num">{fmtMoney2(it.unit_price)}</td>
                    <td className="num">{fmtMoney2(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 14 }}>
              <div className="totals-row">
                <span>Ara toplam</span><span>{fmtMoney2(data.subtotal)}</span>
              </div>
              <div className="totals-row">
                <span>Kargo</span><span>{fmtMoney2(data.shipping_price)}</span>
              </div>
              {data.campaign_discount > 0 && (
                <div className="totals-row" style={{ color: "#b91c1c" }}>
                  <span>Kampanya indirimi{data.coupon_code ? ` (${data.coupon_code})` : ""}</span>
                  <span>-{fmtMoney2(data.campaign_discount)}</span>
                </div>
              )}
              <div className="totals-row grand">
                <span>Toplam</span><span>{fmtMoney2(data.total)}</span>
              </div>
            </div>
          </>
        )}
      </AsyncState>
    </Modal>
  );
}

function AllOrders({ onGoCrm }) {
  const { data, error, loading } = useApi("/api/orders/list");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  const s = q.trim().toLowerCase();
  const filtered = (data || []).filter((o) =>
    !s ||
    (o.customer_name || "").toLowerCase().includes(s) ||
    String(o.order_number).includes(s) ||
    (o.city || "").toLowerCase().includes(s)
  );

  return (
    <Card title={`Tüm Siparişler${data ? ` (${data.length})` : ""}`}>
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Yeniden eskiye tüm siparişler. Bir siparişe tıkla → ne alındığını gör.
      </p>
      <input
        className="search-input"
        placeholder="Ara: müşteri adı, sipariş no veya şehir…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
        <span><span style={{ color: "#dc2626", fontWeight: 700 }}>●</span> &lt;10.000 ₺</span>
        <span><span style={{ color: "#2563eb", fontWeight: 700 }}>●</span> 10.000–20.000 ₺</span>
        <span><span style={{ color: "#16a34a", fontWeight: 700 }}>●</span> 20.000 ₺+</span>
      </div>
      <AsyncState loading={loading} error={error} data={data}>
        <div style={{ maxHeight: 600, overflowY: "auto", marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Tarih</th>
                <th>Müşteri</th>
                <th>Şehir</th>
                <th className="num">Kaçıncı</th>
                <th>İndirim</th>
                <th>Durum</th>
                <th className="num">Adet</th>
                <th className="num">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.order_number}
                  className="clickable-row"
                  onClick={() => setSel(o.order_number)}
                >
                  <td style={{ background: orderTierColor(o.total), color: "#fff", fontWeight: 700 }}>#{o.order_number}</td>
                  <td>{fmtDate(o.order_date)}</td>
                  <td>{o.customer_name}</td>
                  <td>{o.city || "-"}</td>
                  <td className="num">
                    {o.purchase_index
                      ? `${o.purchase_index}. ${o.customer_total_orders ? `/ ${o.customer_total_orders}` : ""}`
                      : "-"}
                  </td>
                  <td>
                    {o.discounted
                      ? <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c" }}>
                          {o.coupon_code || "İndirimli"}{o.campaign_discount ? ` · ${fmtMoney(o.campaign_discount)}` : ""}
                        </span>
                      : <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                  <td><span className="badge">{o.status || "-"}</span></td>
                  <td className="num">{o.item_count}</td>
                  <td className="num">{fmtMoney(o.total)}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={9} className="state">Sonuç yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AsyncState>
      {sel && <OrderModal orderNumber={sel} onClose={() => setSel(null)} onGoCrm={onGoCrm} />}
    </Card>
  );
}

export default function OrdersSection({ onGoCrm }) {
  return (
    <section className="section">
      <h2 className="section-title">
        <span className="num">1</span> Siparişler ve Trend
      </h2>
      <Trend />
      <div style={{ marginTop: 16 }}>
        <AllOrders onGoCrm={onGoCrm} />
      </div>
    </section>
  );
}
