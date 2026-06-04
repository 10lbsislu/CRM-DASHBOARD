import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { apiPut } from "../api/client";
import {
  Card, StatCard, Modal, AsyncState, fmtMoney,
  DateRangeBar, withParams, monthRange, monthLabel,
} from "../components/common";

const DEFAULTS = { shipping_cost: 1419, low_threshold: 5000, low_fee: 1500, mid_fee: 800, free_threshold: 20000 };

function ConfigEdit({ month, initial, onBack, onSaved }) {
  const [f, setF] = useState({ ...DEFAULTS, ...(initial || {}) });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v === "" ? "" : Number(v) }));

  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      const body = {
        shipping_cost: Number(f.shipping_cost),
        low_threshold: f.low_threshold === "" ? null : Number(f.low_threshold),
        low_fee: f.low_fee === "" ? null : Number(f.low_fee),
        mid_fee: f.mid_fee === "" ? null : Number(f.mid_fee),
        free_threshold: f.free_threshold === "" ? null : Number(f.free_threshold),
      };
      const r = await apiPut(`/api/logistics/config/${month}`, body);
      setResult(r);
      if (r.ok) onSaved();
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, ph) => (
    <div className="field">
      <label>{label}</label>
      <input type="number" value={f[key]} placeholder={ph} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <button className="btn" style={{ background: "var(--bg)", color: "var(--text)", padding: "5px 12px" }} onClick={onBack}>← Aylar</button>
        <b style={{ marginLeft: 10 }}>{monthLabel(month)}</b>
      </div>
      <div className="help" style={{ marginBottom: 14 }}>
        Bizim gönderi maliyetimiz + müşteriden alınacak kademeli kargo kuralı.
        Kural: tutar ≥ ücretsiz eşiği → 0; tutar &lt; alt eşik → alt ücret; arada → orta ücret.
      </div>
      <div className="form-grid">
        {field("shipping_cost", "Bizim Gönderi Maliyeti (₺)", "1419")}
        <div />
        {field("low_threshold", "Alt Eşik (₺)", "5000")}
        {field("low_fee", "Alt Ücret (₺)", "1500")}
        {field("free_threshold", "Ücretsiz Eşiği (₺)", "20000")}
        {field("mid_fee", "Orta Ücret (₺)", "800")}
      </div>
      <div className="help" style={{ marginTop: 12, background: "#eff6ff" }}>
        Özet: <b>{fmtMoney(f.free_threshold)}</b> ve üzeri ücretsiz · <b>{fmtMoney(f.low_threshold)}</b> altı{" "}
        <b>{fmtMoney(f.low_fee)}</b> · arası <b>{fmtMoney(f.mid_fee)}</b> · gönderi maliyeti{" "}
        <b>{fmtMoney(f.shipping_cost)}</b>
      </div>
      {result && !result.ok && (
        <div className="result-box" style={{ background: "#fee2e2", color: "#b91c1c" }}>
          {result.errors.map((e, i) => <div key={i}>⛔ {e}</div>)}
        </div>
      )}
      {result && result.ok && (
        <div className="result-box" style={{ background: "#dcfce7" }}>
          ✓ Kaydedildi.
          {result.warnings.map((w, i) => <div key={i} style={{ color: "#c2410c" }}>⚠ {w}</div>)}
        </div>
      )}
      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="btn" disabled={busy} onClick={save}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </>
  );
}

function ConfigModal({ onClose, onSaved }) {
  const [reload, setReload] = useState(0);
  const [month, setMonth] = useState(null);
  const { data: meta } = useApi("/api/stats/months");
  const { data: configs } = useApi(`/api/logistics/config?_r=${reload}`);
  const months = meta?.months || [];

  return (
    <Modal title="Lojistik Bedelini Düzenle" onClose={onClose}>
      {month ? (
        <ConfigEdit
          month={month}
          initial={configs?.[month]}
          onBack={() => setMonth(null)}
          onSaved={() => { setReload((r) => r + 1); onSaved(); }}
        />
      ) : (
        <>
          <p className="section-desc" style={{ marginTop: 0 }}>
            Düzenlemek istediğin ayı seç. ✓ olanlarda özel kural tanımlı.
          </p>
          <div className="seg-grid">
            {months.map((m) => {
              const c = configs?.[m];
              return (
                <div key={m} className="seg-card clickable-row" style={{ borderLeftColor: c ? "#16a34a" : "var(--border)" }}
                  onClick={() => setMonth(m)}>
                  <div className="seg-top">
                    <span className="seg-name">{monthLabel(m)}</span>
                    <span className="seg-count">{c ? "✓" : "—"}</span>
                  </div>
                  <div className="seg-desc">
                    {c ? `Maliyet ${fmtMoney(c.shipping_cost)} · ücretsiz ${fmtMoney(c.free_threshold)}+` : "Kural tanımsız"}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

function TierBreakdown({ sum }) {
  const tb = sum.tier_breakdown || [];
  if (!tb.length || !sum.rule_based_shipping) return null;
  const free = tb.find((t) => t.key === "free");
  const colors = { free: "#dc2626", mid: "#f59e0b", low: "#2563eb", none: "#94a3b8" };
  return (
    <Card title="Kargo Bedeli Kademe Dağılımı">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Girilen kurala göre siparişler hangi kademeye düşüyor ve net kargo maliyetinin
        ne kadarını oluşturuyor.
      </p>
      {free && (
        <div className="help" style={{ marginBottom: 12, background: "#fef2f2", color: "#991b1b" }}>
          <b>Ücretsiz kargo</b> siparişleri ({free.orders} sipariş) net kargo maliyetinin{" "}
          <b>%{free.net_pct}</b>'ini ({fmtMoney(free.net)}) oluşturuyor — bu siparişlerden
          kargo alınmıyor, maliyetin tamamı bize kalıyor.
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Kademe</th>
            <th className="num">Sipariş</th>
            <th className="num">Bizim Gider</th>
            <th className="num">Alınan</th>
            <th className="num">Net</th>
            <th className="num">Net %</th>
          </tr>
        </thead>
        <tbody>
          {tb.map((t) => (
            <tr key={t.key}>
              <td>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2,
                  background: colors[t.key], marginRight: 8 }} />
                {t.label}
              </td>
              <td className="num">{t.orders}</td>
              <td className="num">{fmtMoney(t.our_cost)}</td>
              <td className="num">{fmtMoney(t.collected)}</td>
              <td className="num"><b>{fmtMoney(t.net)}</b></td>
              <td className="num">%{t.net_pct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
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
      <ResponsiveContainer width="100%" height={320}>
        <PieChart margin={{ top: 24, bottom: 8, left: 8, right: 8 }}>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="48%" outerRadius={88} label={(e) => e.value}>
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
        <ResponsiveContainer width="100%" height={300}>
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

export default function LogisticsSection() {
  const { data: meta } = useApi("/api/stats/months");
  const [sel, setSel] = useState("all");
  const [reload, setReload] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const months = meta?.months || [];
  const range = sel === "all" ? { start: null, end: null } : monthRange(sel);
  const { data: sum, error, loading } = useApi(
    withParams("/api/logistics/summary", { ...range, _r: reload })
  );

  return (
    <section className="section">
      <h2 className="section-title"><span className="num">⛟</span> Lojistik</h2>
      <p className="section-desc">
        Donuk ve soğuk ürünler ayrı kargoyla gönderiliyor. Aya özel kargo kuralları
        "Lojistik Bedelini Düzenle" ile tanımlanır; veriler buna göre hesaplanır.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div style={{ flex: "1 1 320px" }}>
          <DateRangeBar months={months} value={sel} onChange={setSel} />
        </div>
        <button
          className="btn"
          style={{ background: "var(--card-bg)", color: "var(--accent)", border: "1px solid var(--accent)", whiteSpace: "nowrap" }}
          onClick={() => setShowConfig(true)}
        >
          ⚙ Lojistik Bedelini Düzenle
        </button>
      </div>

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
                <div className="label" style={{ marginTop: 4 }}>
                  {sum.rule_based_shipping ? "aya özel kurala göre" : "veriden (kural tanımsız)"} · cironun %{sum.collected_pct}'i
                </div>
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
            {!sum.rule_based_shipping && (
              <div className="help" style={{ marginTop: 12, background: "#fff7ed", color: "#9a3412" }}>
                Bu dönem için aya özel kargo kuralı tanımlı değil — müşteri kargosu sipariş verisindeki
                "Kargo Fiyatı"ndan alınıyor. Daha doğru sonuç için "⚙ Lojistik Bedelini Düzenle"den o ayın kuralını gir.
              </div>
            )}

            {sum.tier_breakdown?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <TierBreakdown sum={sum} />
              </div>
            )}

            <div className="grid grid-2" style={{ marginTop: 16 }}>
              <TypeBreakdown sum={sum} />
              <Trend />
            </div>
          </>
        )}
      </AsyncState>

      {showConfig && (
        <ConfigModal onClose={() => setShowConfig(false)} onSaved={() => setReload((r) => r + 1)} />
      )}
    </section>
  );
}
