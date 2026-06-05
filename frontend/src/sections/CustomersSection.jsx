import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useApi } from "../hooks/useApi";
import {
  Card, StatCard, AsyncState, fmtMoney, fmtNum, fmtDate,
  SEGMENT_META, SEGMENT_ORDER, segColor,
  DateRangeBar, withParams, monthRange,
} from "../components/common";

// hex rengin açık tonu (rozet zemini için)
const tint = (hex) => `${hex}1a`;

function LoyaltySummary({ start, end }) {
  const { data, error, loading } = useApi(withParams("/api/customers/loyalty", { start, end }));
  if (loading || error || !data) {
    return <AsyncState loading={loading} error={error} data={data}><span /></AsyncState>;
  }
  const periodNote = start
    ? "Seçili dönemde sipariş veren müşteriler ve o dönemdeki tekrar oranı."
    : "Tüm zamanlar: birden fazla sipariş veren müşterilerin yüzdesi (tekrar oranı). Düşükse müşteri elde tutulamıyor demektir.";
  return (
    <>
      <div className="grid grid-4">
        <StatCard label="Tekrar Oranı" value={`%${data.repeat_rate}`} />
        <StatCard label="Tek Sefer Alan" value={fmtNum(data.one_time)} />
        <StatCard label="Tekrar Eden" value={fmtNum(data.repeat)} />
        <StatCard label="Müşteri Başına Sipariş" value={data.avg_orders_per_customer} />
      </div>
      <div className="help" style={{ marginTop: 12 }}>{periodNote}</div>
    </>
  );
}

function ReorderInterval() {
  const { data, error, loading } = useApi("/api/customers/reorder-interval");
  return (
    <Card title="Sipariş Yenileme Sıklığı">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Tekrar eden müşteriler kaç günde bir sipariş veriyor (ardışık siparişler arası ortalama).
      </p>
      <AsyncState loading={loading} error={error} data={data}>
        {data && (
          <>
            <div className="grid grid-2" style={{ marginBottom: 12 }}>
              <StatCard label="Ortalama Yenileme" value={data.avg_days != null ? `${data.avg_days} gün` : "-"} />
              <StatCard label="Medyan" value={data.median_days != null ? `${data.median_days} gün` : "-"} />
            </div>
            <div className="help" style={{ marginBottom: 10 }}>
              {data.repeat_customers} tekrar eden müşteri üzerinden hesaplandı. En sık yenileyenler:
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              <table>
                <thead><tr><th>Müşteri</th><th className="num">Sipariş</th><th className="num">Ort. Aralık</th></tr></thead>
                <tbody>
                  {(data.fastest || []).map((c, i) => (
                    <tr key={i}><td>{c.name}</td><td className="num">{c.orders}</td><td className="num">{c.avg_days} gün</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AsyncState>
    </Card>
  );
}

function RfmSegments() {
  const { data, error, loading } = useApi("/api/customers/rfm");
  const dist = data?.segment_distribution || [];
  const total = dist.reduce((s, x) => s + x.count, 0);
  const max = Math.max(1, ...dist.map((x) => x.count));
  const sorted = [...dist].sort((a, b) => {
    const ia = SEGMENT_ORDER.indexOf(a.segment);
    const ib = SEGMENT_ORDER.indexOf(b.segment);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return (
    <Card title="RFM Müşteri Segmentleri">
      <div className="help" style={{ marginBottom: 14 }}>
        <b>RFM</b> müşterileri 3 davranışa göre gruplar:{" "}
        <b>R</b>ecency (en son ne zaman aldı), <b>F</b>requency (ne sıklıkla aldı),{" "}
        <b>M</b>onetary (ne kadar harcadı). Her grubun yanında <b>önerilen aksiyon</b> var.
      </div>
      <AsyncState loading={loading} error={error} data={dist}>
        <div className="seg-grid">
          {sorted.map((s) => {
            const meta = SEGMENT_META[s.segment] || {};
            const color = meta.color || "#94a3b8";
            const pct = total ? Math.round((s.count * 100) / total) : 0;
            return (
              <div className="seg-card" key={s.segment} style={{ borderLeftColor: color }}>
                <div className="seg-top">
                  <span className="seg-name">{s.segment}</span>
                  <span className="seg-count"><b>{s.count}</b> kişi · %{pct}</span>
                </div>
                <div className="seg-desc">{meta.desc || "—"}</div>
                {meta.action && (
                  <span className="seg-action" style={{ background: tint(color), color }}>
                    {meta.action}
                  </span>
                )}
                <div className="seg-bar">
                  <div style={{ width: `${(s.count / max) * 100}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </AsyncState>
    </Card>
  );
}

function TopCustomers() {
  const { data, error, loading } = useApi("/api/customers/top?limit=10");
  return (
    <Card title="En Değerli Müşteriler">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Toplam net harcamaya göre ilk 10 müşteri.
      </p>
      <AsyncState loading={loading} error={error} data={data}>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Müşteri</th><th>Segment</th>
                <th className="num">Sipariş</th><th className="num">Harcama</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((c) => (
                <tr key={c.email}>
                  <td title={c.email}>{c.name}</td>
                  <td>
                    <span className="badge" style={{ background: tint(segColor(c.segment)), color: segColor(c.segment) }}>
                      {c.segment}
                    </span>
                  </td>
                  <td className="num">{c.frequency}</td>
                  <td className="num">{fmtMoney(c.monetary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncState>
    </Card>
  );
}

function ChurnRisk() {
  const { data, error, loading } = useApi("/api/customers/churn-risk?days=90");
  return (
    <Card title={`Churn (Kayıp) Riski${data ? ` — ${data.count} müşteri` : ""}`}>
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        90+ gündür alışveriş yapmayan müşteriler, harcamaya göre sıralı. En üsttekiler
        en değerli kayıp adayları — geri kazanmaya öncelik ver.
      </p>
      <AsyncState loading={loading} error={error} data={data?.customers}>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Müşteri</th><th>Son Sipariş</th>
                <th className="num">Gün</th><th className="num">Harcama</th>
              </tr>
            </thead>
            <tbody>
              {(data?.customers || []).map((c) => (
                <tr key={c.email}>
                  <td title={c.email}>{c.name}</td>
                  <td>{fmtDate(c.last_order_date)}</td>
                  <td className="num">{c.days_since_last_order}</td>
                  <td className="num">{fmtMoney(c.monetary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncState>
    </Card>
  );
}

function NewReturning() {
  const { data, error, loading } = useApi("/api/customers/new-returning?period=month");
  return (
    <Card title="Yeni vs Tekrar Eden (aylık)">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Her ay kaç <b>yeni</b> müşteri kazanıldı ve kaç <b>tekrar</b> siparişi geldi.
      </p>
      <AsyncState loading={loading} error={error} data={data}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data || []} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="period" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend />
            <Bar dataKey="new_customers" name="Yeni müşteri" stackId="a" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="repeat_orders" name="Tekrar sipariş" stackId="a" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AsyncState>
    </Card>
  );
}

function DailyActivity() {
  const [date, setDate] = useState("2026-05-31");
  const { data, error, loading } = useApi(`/api/customers/daily?date=${date}`);
  const rows = data
    ? [
        ...data.new_customers.map((c) => ({ ...c, _new: true })),
        ...data.returning_customers.map((c) => ({ ...c, _new: false })),
      ]
    : [];
  return (
    <Card title="Günlük Müşteri Aktivitesi">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Seçilen gün alışveriş yapanlar: <b>ilk kez mi</b> alıyor yoksa <b>geri mi döndü</b>?
      </p>
      <div style={{ marginBottom: 12, fontSize: 13 }}>
        Tarih:{" "}
        <input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ padding: "5px 9px", border: "1px solid var(--border)", borderRadius: 6 }}
        />
      </div>
      <AsyncState loading={loading} error={error} data={data}>
        {data && (
          <>
            <div style={{ marginBottom: 12 }}>
              <span className="badge" style={{ background: "#dbeafe", color: "#1d4ed8", marginRight: 8 }}>
                {data.new_count} yeni müşteri
              </span>
              <span className="badge" style={{ background: "#dcfce7", color: "#15803d" }}>
                {data.returning_count} tekrar eden
              </span>
            </div>
            <div style={{ maxHeight: 230, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Müşteri</th><th>Durum</th>
                    <th className="num">Önceki</th><th className="num">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.order_number}>
                      <td title={c.customer_id}>{c.name}</td>
                      <td>
                        <span className="badge" style={c._new
                          ? { background: "#dbeafe", color: "#1d4ed8" }
                          : { background: "#dcfce7", color: "#15803d" }}>
                          {c._new ? "İlk alışveriş" : "Tekrar"}
                        </span>
                      </td>
                      <td className="num">{c.previous_orders}</td>
                      <td className="num">{fmtMoney(c.total)}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={4} className="state">Bu tarihte sipariş yok</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AsyncState>
    </Card>
  );
}

export default function CustomersSection() {
  const { data: meta } = useApi("/api/stats/months");
  const [sel, setSel] = useState("all");
  const months = meta?.months || [];
  const range = sel === "all" ? { start: null, end: null } : monthRange(sel);

  return (
    <section className="section">
      <h2 className="section-title">
        <span className="num">3</span> Müşteri Alışkanlıkları
      </h2>
      <p className="section-desc">
        Müşterilerini tanı: kimler değerli, kimler kaybedilmek üzere, kim yeni geldi.
      </p>

      <div style={{ marginBottom: 16 }}>
        <DateRangeBar months={months} value={sel} onChange={setSel} />
        <p className="section-desc" style={{ margin: "8px 0 0" }}>
          Dönem seçimi yukarıdaki sadakat metriklerini (tekrar oranı, tek sefer alan…) filtreler.
        </p>
      </div>

      <LoyaltySummary start={range.start} end={range.end} />

      <div style={{ marginTop: 16 }}>
        <RfmSegments />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <TopCustomers />
        <ChurnRisk />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <ReorderInterval />
        <NewReturning />
      </div>

      <div style={{ marginTop: 16 }}>
        <DailyActivity />
      </div>
    </section>
  );
}
