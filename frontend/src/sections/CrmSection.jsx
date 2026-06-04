import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { apiPatch } from "../api/client";
import {
  Card, StatCard, Modal, AsyncState, fmtMoney, fmtDate, segColor,
} from "../components/common";

const CAMPAIGN_OPTS = ["Hoşgeldin", "Sadakat", "Nerdesin", "25.000TL ve Üstüne %5"];
const STATUS_OPTS = ["Aktif", "Pasif", "VIP"];

const d10 = (v) => (v ? String(v).slice(0, 10) : "");

const COUPON_LABEL = { expired: "Süresi doldu", expiring: "Yakında bitiyor", active: "Aktif" };
const COUPON_CLASS = { expired: "cs-expired", expiring: "cs-expiring", active: "cs-active" };

function EditModal({ row, onClose, onSaved }) {
  const [f, setF] = useState({
    status: row.status || "",
    campaign_type: row.campaign_type || "",
    to_call: !!row.to_call,
    called: !!row.called,
    last_call_date: d10(row.last_call_date),
    coupon_sent: !!row.coupon_sent,
    coupon_code: row.coupon_code || "",
    coupon_sent_date: d10(row.coupon_sent_date),
    coupon_expiry_date: d10(row.coupon_expiry_date),
    note: row.note || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await apiPatch(`/api/crm/customers/${encodeURIComponent(row.customer_id)}`, f);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`CRM · ${row.name}`} onClose={onClose}>
      <div className="help" style={{ marginBottom: 14 }}>
        {row.email} · {row.orders} sipariş · {fmtMoney(row.monetary)}
        {row.eligibility?.length ? <><br />Uygun kampanyalar: <b>{row.eligibility.join(", ")}</b></> : null}
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Durum</label>
          <select value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">—</option>
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Kampanya Türü</label>
          <select value={f.campaign_type} onChange={(e) => set("campaign_type", e.target.value)}>
            <option value="">—</option>
            {CAMPAIGN_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field check">
          <input type="checkbox" checked={f.to_call} onChange={(e) => set("to_call", e.target.checked)} id="tc" />
          <label htmlFor="tc">Aranacak</label>
        </div>
        <div className="field check">
          <input type="checkbox" checked={f.called} onChange={(e) => set("called", e.target.checked)} id="cl" />
          <label htmlFor="cl">Arandı</label>
        </div>
        <div className="field">
          <label>Son Arama Tarihi</label>
          <input type="date" value={f.last_call_date} onChange={(e) => set("last_call_date", e.target.value)} />
        </div>
        <div className="field check">
          <input type="checkbox" checked={f.coupon_sent} onChange={(e) => set("coupon_sent", e.target.checked)} id="cs" />
          <label htmlFor="cs">Kupon gönderildi</label>
        </div>
        <div className="field">
          <label>Kupon Kodu</label>
          <input value={f.coupon_code} onChange={(e) => set("coupon_code", e.target.value)} />
        </div>
        <div className="field">
          <label>Kupon Gönderim Tarihi</label>
          <input type="date" value={f.coupon_sent_date} onChange={(e) => set("coupon_sent_date", e.target.value)} />
        </div>
        <div className="field">
          <label>Kupon Bitiş Tarihi</label>
          <input type="date" value={f.coupon_expiry_date} onChange={(e) => set("coupon_expiry_date", e.target.value)} />
        </div>
        <div className="field full">
          <label>Not</label>
          <textarea rows={3} value={f.note} onChange={(e) => set("note", e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn" style={{ background: "var(--bg)", color: "var(--text)" }} onClick={onClose}>İptal</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </Modal>
  );
}

function Roi() {
  const { data, error, loading } = useApi("/api/crm/campaign-roi?period=month");
  return (
    <Card title="Kampanya İndiriminin Etkisi (aylık)">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Siparişlerdeki kampanya indirimi toplamı — kampanyaların maliyeti.
      </p>
      <AsyncState loading={loading} error={error} data={data}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data || []} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="period" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v, n) => (n === "İndirim" ? fmtMoney(v) : v)} />
            <Bar dataKey="total_discount" name="İndirim" fill="#ea580c" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AsyncState>
    </Card>
  );
}

function GapsReport({ reload, onEdit }) {
  const [camp, setCamp] = useState("");
  const qs = new URLSearchParams();
  if (camp) qs.append("campaign", camp);
  qs.append("_r", reload);
  const { data, error, loading } = useApi(`/api/crm/gaps?${qs}`);

  return (
    <Card title="⚠ Eksik Kupon — Aksiyon Gerekenler">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Bir kampanyaya <b>uygun olduğu hâlde kuponu tanımlanmamış</b> müşteriler.
        Akış kuralı: ilk sipariş → Hoşgeldin, 5+ sipariş → Sadakat, 90+ gün → Nerdesin
        kuponu olmalı. Tutarsızlık bırakmamak için bu listeyi kapat.
      </p>
      <AsyncState loading={loading} error={error} data={data}>
        {data && (
          <>
            <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c" }}>
                {data.gap_count} kayıt
              </span>
              <button className="badge" style={{ cursor: "pointer", border: "none",
                background: camp === "" ? "var(--accent)" : "var(--accent-soft)", color: camp === "" ? "#fff" : "var(--accent)" }}
                onClick={() => setCamp("")}>Tümü</button>
              {(data.by_campaign || []).map((c) => (
                <button key={c.campaign} className="badge" style={{ cursor: "pointer", border: "none",
                  background: camp === c.campaign ? "var(--accent)" : "var(--accent-soft)", color: camp === c.campaign ? "#fff" : "var(--accent)" }}
                  onClick={() => setCamp(c.campaign)}>{c.campaign} ({c.count})</button>
              ))}
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Müşteri</th><th>Uygun Kampanya</th>
                    <th className="num">Sipariş</th><th>Son Sipariş</th>
                    <th className="num">Harcama</th><th>Arandı</th>
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((r) => (
                    <tr key={r.customer_id} className="clickable-row" onClick={() => onEdit(r)}>
                      <td title={r.email}>{r.name}</td>
                      <td style={{ fontSize: 11 }}>{r.eligibility.join(", ")}</td>
                      <td className="num">{r.orders}</td>
                      <td>{fmtDate(r.last_order)}{r.recency_days != null ? ` (${r.recency_days}g)` : ""}</td>
                      <td className="num">{fmtMoney(r.monetary)}</td>
                      <td>{r.called ? "✓" : "—"}</td>
                    </tr>
                  ))}
                  {!data.customers.length && <tr><td colSpan={6} className="state">Eksik kupon yok 🎉</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AsyncState>
    </Card>
  );
}

export default function CrmSection() {
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState("");
  const [coupon, setCoupon] = useState("");
  const [onlyToCall, setOnlyToCall] = useState(false);

  const bump = () => setReload((r) => r + 1);

  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (status) params.append("status", status);
  if (campaign) params.append("campaign", campaign);
  if (coupon) params.append("coupon", coupon);
  if (onlyToCall) params.append("only_to_call", "true");
  params.append("_r", reload);

  const { data, error, loading } = useApi(`/api/crm/customers?${params}`);
  const { data: sum } = useApi(`/api/crm/summary?_r=${reload}`);

  const toggleCall = async (row, field, value) => {
    await apiPatch(`/api/crm/customers/${encodeURIComponent(row.customer_id)}`, { [field]: value });
    bump();
  };

  const setCouponFilter = (v) => setCoupon(coupon === v ? "" : v);

  return (
    <section className="section">
      <h2 className="section-title">
        <span className="num">★</span> CRM / Kampanya Takibi
      </h2>
      <p className="section-desc">
        Müşteri arama, kupon ve kampanya takibi. Bir müşteriye tıkla → düzenle.
        Süresi dolan kuponlar ve aranacaklar otomatik işaretlenir.
      </p>

      {/* KPI'lar */}
      <div className="grid grid-4">
        <StatCard label="Toplam Müşteri" value={sum?.total_customers ?? "…"} />
        <div className={`card stat-card kpi-alert ${onlyToCall ? "active" : ""}`}
          onClick={() => setOnlyToCall((v) => !v)}>
          <div className="label">Aranacak</div>
          <div className="value">{sum?.to_call ?? "…"}</div>
        </div>
        <div className={`card stat-card kpi-alert ${coupon === "expired" ? "active" : ""}`}
          style={{ borderLeftColor: "#dc2626" }} onClick={() => setCouponFilter("expired")}>
          <div className="label">Süresi Dolmuş Kupon</div>
          <div className="value" style={{ color: "#dc2626" }}>{sum?.coupon_expired ?? "…"}</div>
        </div>
        <div className={`card stat-card kpi-alert ${coupon === "expiring" ? "active" : ""}`}
          style={{ borderLeftColor: "#ea580c" }} onClick={() => setCouponFilter("expiring")}>
          <div className="label">Yakında Bitecek Kupon</div>
          <div className="value" style={{ color: "#ea580c" }}>{sum?.coupon_expiring ?? "…"}</div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <GapsReport reload={reload} onEdit={setEditing} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Roi />
        <Card title="Kampanya Dağılımı (atanmış)">
          <p className="section-desc" style={{ margin: "0 0 10px" }}>
            Müşterilere atanmış kampanya türlerinin dağılımı.
          </p>
          <AsyncState loading={!sum} error={null} data={sum?.campaign_distribution}>
            <table>
              <thead><tr><th>Kampanya</th><th className="num">Müşteri</th></tr></thead>
              <tbody>
                {(sum?.campaign_distribution || []).map((c) => (
                  <tr key={c.campaign}>
                    <td>{c.campaign}</td>
                    <td className="num">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AsyncState>
        </Card>
      </div>

      {/* Filtreler */}
      <div className="card" style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input className="search-input" style={{ flex: "1 1 220px" }}
          placeholder="Ara: isim veya e-posta…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          style={{ padding: "8px", border: "1px solid var(--border)", borderRadius: 8 }}>
          <option value="">Tüm durumlar</option>
          {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)}
          style={{ padding: "8px", border: "1px solid var(--border)", borderRadius: 8 }}>
          <option value="">Tüm kampanyalar</option>
          {CAMPAIGN_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {coupon && (
          <button className="badge" style={{ cursor: "pointer", border: "none" }}
            onClick={() => setCoupon("")}>Kupon: {COUPON_LABEL[coupon]} ✕</button>
        )}
      </div>

      {/* Tablo */}
      <Card title={`Müşteriler${data ? ` (${data.length})` : ""}`} className="">
        <AsyncState loading={loading} error={error} data={data}>
          <div style={{ maxHeight: 560, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Kampanya</th>
                  <th>Aranacak</th>
                  <th>Arandı</th>
                  <th>Kupon</th>
                  <th>Bitiş</th>
                  <th className="num">Sipariş</th>
                  <th className="num">Harcama</th>
                </tr>
              </thead>
              <tbody>
                {(data || []).map((r) => (
                  <tr key={r.customer_id} className="clickable-row" onClick={() => setEditing(r)}>
                    <td title={r.email}>{r.name}</td>
                    <td>{r.campaign_type
                      ? <span className="badge" style={{ background: segColor(r.campaign_type) + "1a", color: segColor(r.campaign_type) }}>{r.campaign_type}</span>
                      : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={r.to_call} onChange={(e) => toggleCall(r, "to_call", e.target.checked)} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={r.called} onChange={(e) => toggleCall(r, "called", e.target.checked)} />
                    </td>
                    <td>{r.coupon_code || "—"}</td>
                    <td>
                      {r.coupon_status
                        ? <span className={`badge ${COUPON_CLASS[r.coupon_status]}`}>
                            {fmtDate(r.coupon_expiry_date)} · {COUPON_LABEL[r.coupon_status]}
                          </span>
                        : "—"}
                    </td>
                    <td className="num">{r.orders}</td>
                    <td className="num">{fmtMoney(r.monetary)}</td>
                  </tr>
                ))}
                {!data?.length && <tr><td colSpan={8} className="state">Sonuç yok</td></tr>}
              </tbody>
            </table>
          </div>
        </AsyncState>
      </Card>

      {editing && (
        <EditModal row={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); bump(); }} />
      )}
    </section>
  );
}
