import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { apiPatch } from "../api/client";
import {
  Card, StatCard, Modal, AsyncState, fmtMoney, fmtDate, segColor,
  DateRangeBar, withParams, monthRange,
} from "../components/common";

const STATUS_OPTS = ["Aktif", "Pasif", "VIP"];
const CAMPAIGN_OPTS = ["Hoşgeldin", "Sadakat", "25.000TL ve Üstüne %5"];
const OUTCOME_OPTS = ["Ulaşılamadı", "Cevap vermedi", "İlgilendi", "Olumsuz", "Sipariş sözü verdi", "Şikayet", "Diğer"];
const COUPON_USED_OPTS = ["Kullandı", "Kullanmadı", "Bilinmiyor"];

const SUBTABS = [
  { id: "musteriler", label: "Müşteriler" },
  { id: "cagri", label: "Çağrı Takibi" },
  { id: "kupon", label: "Eksik Kupon" },
  { id: "degerli", label: "En Değerli & İnaktif" },
];

// Satır içi düzenlenebilir açılır liste — değişince anında kaydeder
function InlineSelect({ value, options, onChange, placeholder = "—", color }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      style={{
        padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 6,
        fontSize: 12, maxWidth: 150,
        background: color ? color + "14" : "var(--card-bg)", color: color || "inherit",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

const patchCustomer = (id, body) =>
  apiPatch(`/api/crm/customers/${encodeURIComponent(id)}`, body);

// ---- Tam düzenleme modalı (tarihler, not, kupon kodu) ----
function EditModal({ row, onClose, onSaved }) {
  const d10 = (v) => (v ? String(v).slice(0, 10) : "");
  const [f, setF] = useState({
    coupon_code: row.coupon_code || "",
    last_call_date: d10(row.last_call_date),
    coupon_sent_date: d10(row.coupon_sent_date),
    coupon_expiry_date: d10(row.coupon_expiry_date),
    coupon_sent: !!row.coupon_sent,
    note: row.note || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { await patchCustomer(row.customer_id, f); onSaved(); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Detay · ${row.name}`} onClose={onClose}>
      <div className="help" style={{ marginBottom: 14 }}>
        {row.email} · {row.orders} sipariş · {fmtMoney(row.monetary)}
      </div>
      <div className="form-grid">
        <div className="field"><label>Kupon Kodu</label>
          <input value={f.coupon_code} onChange={(e) => set("coupon_code", e.target.value)} /></div>
        <div className="field check">
          <input id="cs" type="checkbox" checked={f.coupon_sent} onChange={(e) => set("coupon_sent", e.target.checked)} />
          <label htmlFor="cs">Kupon gönderildi</label></div>
        <div className="field"><label>Son Arama Tarihi</label>
          <input type="date" value={f.last_call_date} onChange={(e) => set("last_call_date", e.target.value)} /></div>
        <div className="field"><label>Kupon Gönderim</label>
          <input type="date" value={f.coupon_sent_date} onChange={(e) => set("coupon_sent_date", e.target.value)} /></div>
        <div className="field"><label>Kupon Bitiş</label>
          <input type="date" value={f.coupon_expiry_date} onChange={(e) => set("coupon_expiry_date", e.target.value)} /></div>
        <div className="field full"><label>Not / çağrıda ne konuşuldu</label>
          <textarea rows={3} value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
      </div>
      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="btn" style={{ background: "var(--bg)", color: "var(--text)" }} onClick={onClose}>İptal</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </Modal>
  );
}

// ---- Müşteriler: satır içi düzenlenebilir tablo ----
function CustomerTable({ focusCustomer, onFocusHandled }) {
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState("");
  const [editing, setEditing] = useState(null);

  useEffect(() => { if (focusCustomer) setSearch(focusCustomer); }, [focusCustomer]);

  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (status) params.append("status", status);
  if (campaign) params.append("campaign", campaign);
  params.append("_r", reload);
  const { data, error, loading } = useApi(`/api/crm/customers?${params}`);

  const [rows, setRows] = useState([]);
  useEffect(() => { if (data) setRows(data); }, [data]);

  useEffect(() => {
    if (focusCustomer && data) {
      const r = data.find((x) => x.customer_id === focusCustomer);
      if (r) setEditing(r);
      onFocusHandled?.();
    }
  }, [focusCustomer, data, onFocusHandled]);

  const patch = (r, field, value) => {
    setRows((rs) => rs.map((x) => x.customer_id === r.customer_id ? { ...x, [field]: value } : x));
    patchCustomer(r.customer_id, { [field]: value }).catch(() => {});
  };

  return (
    <>
      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input className="search-input" style={{ flex: "1 1 240px" }}
          placeholder="Ara: isim veya e-posta…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
          <option value="">Tüm durumlar</option>{STATUS_OPTS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
          <option value="">Tüm kampanyalar</option>{CAMPAIGN_OPTS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <Card title={`Müşteriler${rows ? ` (${rows.length})` : ""}`}>
        <p className="section-desc" style={{ margin: "0 0 10px" }}>
          Alanları <b>doğrudan satır üzerinde</b> değiştir — anında kaydolur. Detay (tarih/not/kupon kodu) için ⋯.
        </p>
        <AsyncState loading={loading} error={error} data={data}>
          <div style={{ maxHeight: 620, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Müşteri</th><th>Durum</th><th>Kampanya</th>
                  <th>Arandı</th><th>Çağrı Sonucu</th><th>Kupon Kullanıldı</th>
                  <th>Tekrar Sipariş</th><th className="num">Sipariş</th><th className="num">Harcama</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customer_id}>
                    <td title={r.email} style={{ minWidth: 130 }}>{r.name}</td>
                    <td><InlineSelect value={r.status} options={STATUS_OPTS} onChange={(v) => patch(r, "status", v)} /></td>
                    <td><InlineSelect value={r.campaign_type} options={CAMPAIGN_OPTS} color={r.campaign_type ? segColor(r.campaign_type) : null} onChange={(v) => patch(r, "campaign_type", v)} /></td>
                    <td>
                      <select value={r.called ? "Evet" : "Hayır"} onChange={(e) => patch(r, "called", e.target.value === "Evet")}
                        style={{ padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12,
                          background: r.called ? "#dcfce7" : "var(--card-bg)", color: r.called ? "#15803d" : "inherit" }}>
                        <option>Hayır</option><option>Evet</option>
                      </select>
                    </td>
                    <td><InlineSelect value={r.call_outcome} options={OUTCOME_OPTS} placeholder="—" onChange={(v) => patch(r, "call_outcome", v)} /></td>
                    <td><InlineSelect value={r.coupon_used} options={COUPON_USED_OPTS} placeholder="—"
                      color={r.coupon_used === "Kullandı" ? "#16a34a" : r.coupon_used === "Kullanmadı" ? "#dc2626" : null}
                      onChange={(v) => patch(r, "coupon_used", v)} /></td>
                    <td>{r.reordered_after_call
                      ? <span className="badge" style={{ background: "#dcfce7", color: "#15803d" }}>✓ verdi</span>
                      : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td className="num">{r.orders}</td>
                    <td className="num">{fmtMoney(r.monetary)}</td>
                    <td><button className="modal-close" style={{ width: 26, height: 26 }} onClick={() => setEditing(r)}>⋯</button></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={10} className="state">Sonuç yok</td></tr>}
              </tbody>
            </table>
          </div>
        </AsyncState>
      </Card>
      {editing && <EditModal row={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); setReload((x) => x + 1); }} />}
    </>
  );
}

// ---- Çağrı Takibi: aranacaklar + önceki ay arananlar ----
function CallTracking() {
  const { data: toCall } = useApi("/api/crm/customers?only_to_call=true");
  const { data: prev } = useApi("/api/crm/previous-month-called");
  return (
    <>
      <Card title={`Aranacaklar${toCall ? ` (${toCall.length})` : ""}`}>
        <p className="section-desc" style={{ margin: "0 0 10px" }}>"Aranacak" işaretli müşteriler.</p>
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Müşteri</th><th className="num">Son sipariş (gün)</th><th className="num">Harcama</th></tr></thead>
            <tbody>
              {(toCall || []).map((r) => (
                <tr key={r.customer_id}><td>{r.name}</td><td className="num">{r.recency_days ?? "-"}g</td><td className="num">{fmtMoney(r.monetary)}</td></tr>
              ))}
              {!(toCall || []).length && <tr><td colSpan={3} className="state">Aranacak müşteri yok</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={`Önceki Ay Arananlar${prev ? ` — ${prev.period} (${prev.count})` : ""}`} className="">
        <p className="section-desc" style={{ margin: "0 0 10px" }}>
          Geçen ay aranan müşteriler: ne cevap alındı, sonrasında tekrar sipariş verdi mi.
        </p>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Müşteri</th><th>Arama Tarihi</th><th>Çağrı Sonucu</th><th>Tekrar Sipariş</th><th className="num">Harcama</th></tr></thead>
            <tbody>
              {(prev?.customers || []).map((r) => (
                <tr key={r.customer_id}>
                  <td>{r.name}</td>
                  <td>{fmtDate(r.last_call_date)}</td>
                  <td>{r.call_outcome || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td>{r.reordered_after_call
                    ? <span className="badge" style={{ background: "#dcfce7", color: "#15803d" }}>✓ verdi</span>
                    : <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c" }}>vermedi</span>}</td>
                  <td className="num">{fmtMoney(r.monetary)}</td>
                </tr>
              ))}
              {!(prev?.customers || []).length && <tr><td colSpan={5} className="state">Geçen ay arama yok</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ---- Eksik Kupon ----
function GapsReport({ onEdit }) {
  const [camp, setCamp] = useState("");
  const qs = new URLSearchParams();
  if (camp) qs.append("campaign", camp);
  const { data, error, loading } = useApi(`/api/crm/gaps?${qs}`);
  return (
    <Card title="⚠ Eksik Kupon — Aksiyon Gerekenler">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>
        Bir kampanyaya uygun olduğu hâlde kuponu tanımlanmamış (ve aranmamış) müşteriler.
      </p>
      <AsyncState loading={loading} error={error} data={data}>
        {data && (
          <>
            <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="badge" style={{ cursor: "pointer", border: "none", background: camp === "" ? "var(--accent)" : "var(--accent-soft)", color: camp === "" ? "#fff" : "var(--accent)" }} onClick={() => setCamp("")}>Tümü ({data.gap_count})</button>
              {(data.by_campaign || []).map((c) => (
                <button key={c.campaign} className="badge" style={{ cursor: "pointer", border: "none", background: camp === c.campaign ? "var(--accent)" : "var(--accent-soft)", color: camp === c.campaign ? "#fff" : "var(--accent)" }} onClick={() => setCamp(c.campaign)}>{c.campaign} ({c.count})</button>
              ))}
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <table>
                <thead><tr><th>Müşteri</th><th>Uygun</th><th className="num">Sipariş</th><th>Son Sipariş</th><th className="num">Harcama</th></tr></thead>
                <tbody>
                  {data.customers.map((r) => (
                    <tr key={r.customer_id} className="clickable-row" onClick={() => onEdit(r)}>
                      <td>{r.name}</td>
                      <td style={{ fontSize: 11 }}>{r.eligibility.join(", ")}</td>
                      <td className="num">{r.orders}</td>
                      <td>{fmtDate(r.last_order)}</td>
                      <td className="num">{fmtMoney(r.monetary)}</td>
                    </tr>
                  ))}
                  {!data.customers.length && <tr><td colSpan={5} className="state">Eksik kupon yok 🎉</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AsyncState>
    </Card>
  );
}

// ---- En Değerli (ay filtreli) + 45/90 gün inaktif ----
function ValuableList({ months }) {
  const [sel, setSel] = useState("all");
  const range = sel === "all" ? { start: null, end: null } : monthRange(sel);
  const { data, error, loading } = useApi(withParams("/api/crm/valuable", { ...range, limit: 20 }));
  return (
    <Card title="En Değerli Müşteriler">
      <p className="section-desc" style={{ margin: "0 0 10px" }}>Seçili dönemdeki harcamaya göre ilk 20.</p>
      <div style={{ marginBottom: 12 }}><DateRangeBar months={months} value={sel} onChange={setSel} /></div>
      <AsyncState loading={loading} error={error} data={data}>
        <div style={{ maxHeight: 380, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Müşteri</th><th>Kampanya</th><th>Arandı</th><th className="num">Sipariş</th><th className="num">Harcama</th></tr></thead>
            <tbody>
              {(data || []).map((r) => (
                <tr key={r.customer_id}>
                  <td>{r.name}</td>
                  <td>{r.campaign_type ? <span className="badge" style={{ background: segColor(r.campaign_type) + "1a", color: segColor(r.campaign_type) }}>{r.campaign_type}</span> : "—"}</td>
                  <td>{r.called ? "✓" : "—"}</td>
                  <td className="num">{r.orders}</td>
                  <td className="num">{fmtMoney(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncState>
    </Card>
  );
}

function InactiveGroup({ days }) {
  const { data, error, loading } = useApi(`/api/customers/churn-risk?days=${days}`);
  return (
    <Card title={`${days} Gün Sipariş Vermeyenler${data ? ` (${data.count})` : ""}`}>
      <AsyncState loading={loading} error={error} data={data?.customers}>
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Müşteri</th><th className="num">Gün</th><th className="num">Harcama</th></tr></thead>
            <tbody>
              {(data?.customers || []).map((r) => (
                <tr key={r.email}><td>{r.name}</td><td className="num">{r.days_since_last_order}</td><td className="num">{fmtMoney(r.monetary)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncState>
    </Card>
  );
}

export default function CrmSection({ focusCustomer, onFocusHandled }) {
  const [sub, setSub] = useState("musteriler");
  const [editing, setEditing] = useState(null);
  const [reload, setReload] = useState(0);
  const { data: meta } = useApi("/api/stats/months");
  const months = meta?.months || [];

  // Siparişten "CRM'e git" ile gelinince Müşteriler alt-sekmesine geç
  useEffect(() => { if (focusCustomer) setSub("musteriler"); }, [focusCustomer]);

  return (
    <section className="section">
      <h2 className="section-title"><span className="num">★</span> CRM</h2>
      <p className="section-desc">Müşteri ilişkileri: arama, kupon ve kampanya takibi.</p>

      <div className="tabs" style={{ marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {SUBTABS.map((t) => (
          <button key={t.id} className={`tab ${sub === t.id ? "active" : ""}`} onClick={() => setSub(t.id)}>{t.label}</button>
        ))}
      </div>

      {sub === "musteriler" && <CustomerTable focusCustomer={focusCustomer} onFocusHandled={onFocusHandled} />}
      {sub === "cagri" && <div className="grid grid-2"><CallTracking /></div>}
      {sub === "kupon" && <GapsReport key={reload} onEdit={setEditing} />}
      {sub === "degerli" && (
        <>
          <ValuableList months={months} />
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <InactiveGroup days={45} />
            <InactiveGroup days={90} />
          </div>
        </>
      )}

      {editing && <EditModal row={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); setReload((x) => x + 1); }} />}
    </section>
  );
}
