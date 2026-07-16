import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { apiPatch } from "../api/client";
import {
  Card, Modal, AsyncState, fmtMoney, fmtDate, segColor,
  DateRangeBar, withParams, monthRange,
  useDebouncedValue, priorityColor, couponBadge, daysLeft,
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

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const patchCustomer = (id, body) => apiPatch(`/api/crm/customers/${encodeURIComponent(id)}`, body);

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.type}`}>{toast.msg}</div>;
}

// Satır içi düzenleme select'i — değişince anında kaydeder
function InlineSelect({ value, options, onChange, placeholder = "—", color }) {
  return (
    <select className="inline-sel" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}
      onClick={(e) => e.stopPropagation()} style={color ? { color, fontWeight: 600 } : undefined}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// Rows + optimistik kayıt (flash/rollback/toast) — CustomerTable ve CallTracking paylaşır
function useCrmRows(path) {
  const { data, error, loading } = useApi(path);
  const [rows, setRows] = useState([]);
  const [flash, setFlash] = useState(null);
  const [toast, setToast] = useState(null);
  useEffect(() => { if (data) setRows(data); }, [data]);
  const patch = (r, fields) => {
    const prev = { ...r };
    setRows((rs) => rs.map((x) => x.customer_id === r.customer_id ? { ...x, ...fields } : x));
    const fk = `${r.customer_id}:${Object.keys(fields)[0]}`;
    patchCustomer(r.customer_id, fields)
      .then(() => {
        setFlash(fk);
        setToast({ type: "ok", msg: "✓ Kaydedildi" });
        setTimeout(() => setFlash((f) => (f === fk ? null : f)), 900);
        setTimeout(() => setToast(null), 1200);
      })
      .catch(() => {
        setRows((rs) => rs.map((x) => x.customer_id === r.customer_id ? prev : x));
        setToast({ type: "err", msg: "✕ Kaydedilemedi — bağlantıyı kontrol et" });
        setTimeout(() => setToast(null), 3000);
      });
  };
  return { rows, setRows, error, loading, flash, toast, patch };
}

const flashCls = (flash, id, field) => (flash === `${id}:${field}` ? "saved-flash" : "");

// Arandı Evet/Hayır — Evet'te tarihi bugüne otomatik doldur
function CalledSelect({ r, patch }) {
  return (
    <select className="inline-sel" value={r.called ? "Evet" : "Hayır"}
      style={{ color: r.called ? "#15803d" : "inherit", fontWeight: 600 }}
      onChange={(e) => {
        const yes = e.target.value === "Evet";
        patch(r, yes ? { called: true, ...(r.last_call_date ? {} : { last_call_date: today() }) } : { called: false });
      }}>
      <option>Hayır</option><option>Evet</option>
    </select>
  );
}

// Müşteriyi "aranacaklar" listesine ekle/çıkar
function ToCallToggle({ r, patch }) {
  return (
    <button className="modal-close" title={r.to_call ? "Arama listesinden çıkar" : "Arama listesine ekle"}
      style={{ width: 26, height: 26, fontSize: 13, background: r.to_call ? "#fef3c7" : "var(--bg)", color: r.to_call ? "#b45309" : "var(--muted)" }}
      onClick={() => patch(r, { to_call: !r.to_call })}>☎</button>
  );
}

function CouponCell({ r }) {
  const b = couponBadge(r);
  if (!b) return <span style={{ color: "var(--muted)" }}>—</span>;
  const dl = daysLeft(r.coupon_expiry_date);
  return <span className={`badge ${b.cls}`}>{fmtDate(r.coupon_expiry_date)}{dl != null && dl >= 0 ? ` · ${dl}g` : ""}</span>;
}

// ---- Detay modalı: kupon gönderim kolaylığı + çağrı geçmişi ----
function EditModal({ row, onClose, onSaved }) {
  const d10 = (v) => (v ? String(v).slice(0, 10) : "");
  const [f, setF] = useState({
    coupon_code: row.coupon_code || "",
    coupon_sent: !!row.coupon_sent,
    last_call_date: d10(row.last_call_date),
    coupon_sent_date: d10(row.coupon_sent_date),
    coupon_expiry_date: d10(row.coupon_expiry_date),
  });
  const [newNote, setNewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const markSent = () => setF((p) => ({
    ...p, coupon_sent: true,
    coupon_sent_date: p.coupon_sent_date || today(),
    coupon_expiry_date: p.coupon_expiry_date || addDays(30),
  }));

  const save = async () => {
    setBusy(true);
    try {
      let note = row.note || "";
      if (newNote.trim()) {
        const tag = `[${new Date().toLocaleDateString("tr-TR")}${row.call_outcome ? " · " + row.call_outcome : ""}]`;
        note = `${tag} ${newNote.trim()}${note ? "\n" + note : ""}`;
      }
      await patchCustomer(row.customer_id, { ...f, note });
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Detay · ${row.name}`} onClose={onClose}>
      <div className="help" style={{ marginBottom: 14 }}>
        {row.email} · {row.phone || "telefon yok"} · {row.orders} sipariş · {fmtMoney(row.monetary)}
      </div>
      <div className="form-grid">
        <div className="field"><label>Kupon Kodu</label>
          <input value={f.coupon_code} onChange={(e) => set("coupon_code", e.target.value)} /></div>
        <div className="field"><label>Son Arama Tarihi</label>
          <input type="date" value={f.last_call_date} onChange={(e) => set("last_call_date", e.target.value)} /></div>
        <div className="field"><label>Kupon Gönderim</label>
          <input type="date" value={f.coupon_sent_date} onChange={(e) => set("coupon_sent_date", e.target.value)} /></div>
        <div className="field"><label>Kupon Bitiş</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="date" value={f.coupon_expiry_date} onChange={(e) => set("coupon_expiry_date", e.target.value)} style={{ flex: 1 }} />
            <button className="chip" type="button" onClick={() => set("coupon_expiry_date", addDays(30))}>+30g</button>
            <button className="chip" type="button" onClick={() => set("coupon_expiry_date", addDays(60))}>+60g</button>
          </div>
        </div>
      </div>
      <button className="btn" style={{ marginTop: 10, background: "var(--accent-soft)", color: "var(--accent)" }} onClick={markSent}>
        🎟️ Kupon gönderildi olarak işaretle (bugün + 30 gün)
      </button>

      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 500 }}>Çağrı / not geçmişine ekle</label>
        <textarea rows={2} value={newNote} onChange={(e) => setNewNote(e.target.value)}
          placeholder="Bu aramada ne konuşuldu…" style={{ width: "100%", padding: 8, border: "1px solid var(--border)", borderRadius: 7, marginTop: 4 }} />
        {row.note && (
          <div style={{ marginTop: 8, maxHeight: 120, overflowY: "auto", fontSize: 12, color: "var(--muted)", whiteSpace: "pre-wrap", background: "var(--bg)", padding: 8, borderRadius: 6 }}>
            {row.note}
          </div>
        )}
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
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebouncedValue(searchRaw, 300);
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState("");
  const [quick, setQuick] = useState("");   // "", to_call, expiring, expired
  const [editing, setEditing] = useState(null);

  useEffect(() => { if (focusCustomer) setSearchRaw(focusCustomer); }, [focusCustomer]);

  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (status) params.append("status", status);
  if (campaign) params.append("campaign", campaign);
  if (quick === "to_call") params.append("only_to_call", "true");
  if (quick === "expiring" || quick === "expired") params.append("coupon", quick);
  params.append("_r", reload);

  const { rows, error, loading, flash, toast, patch } = useCrmRows(`/api/crm/customers?${params}`);

  useEffect(() => {
    if (focusCustomer && rows.length) {
      const r = rows.find((x) => x.customer_id === focusCustomer);
      if (r) setEditing(r);
      onFocusHandled?.();
    }
  }, [focusCustomer, rows, onFocusHandled]);

  const chip = (id, label) => (
    <button className={`chip ${quick === id ? "on" : ""}`} onClick={() => setQuick((q) => (q === id ? "" : id))}>{label}</button>
  );

  return (
    <>
      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input className="search-input" style={{ flex: "1 1 220px" }}
          placeholder="Ara: isim veya e-posta…" value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
          <option value="">Tüm durumlar</option>{STATUS_OPTS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
          <option value="">Tüm kampanyalar</option>{CAMPAIGN_OPTS.map((s) => <option key={s}>{s}</option>)}
        </select>
        {chip("to_call", "Aranacaklar")}
        {chip("expiring", "Kuponu bitiyor")}
        {chip("expired", "Kuponu bitti")}
      </div>

      <Card title={`Müşteriler (${rows.length})`}>
        <p className="section-desc" style={{ margin: "0 0 10px" }}>
          Alanları <b>doğrudan satır üzerinde</b> değiştir — anında kaydolur (✓). Başındaki <b>☎</b> ile müşteriyi arama listesine ekle. Sol kenar rengi öncelik: 🔴 kupon bitti · 🟠 aranacak · 🟡 90+ gün sessiz. Detay/kupon için ⋯.
        </p>
        <AsyncState loading={loading} error={error} data={rows}>
          <div style={{ maxHeight: 620, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th title="Arama listesi">☎</th>
                  <th>Müşteri</th><th>Durum</th><th>Kampanya</th><th>Arandı</th>
                  <th>Çağrı Sonucu</th><th>Kupon</th><th>Kullanıldı</th>
                  <th>Tekrar</th><th className="num">Sessiz</th><th className="num">Harcama</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customer_id} style={{ borderLeft: `3px solid ${priorityColor(r)}` }}>
                    <td className={flashCls(flash, r.customer_id, "to_call")}><ToCallToggle r={r} patch={patch} /></td>
                    <td title={r.email} style={{ minWidth: 130 }}>{r.name}</td>
                    <td className={flashCls(flash, r.customer_id, "status")}><InlineSelect value={r.status} options={STATUS_OPTS} onChange={(v) => patch(r, { status: v })} /></td>
                    <td className={flashCls(flash, r.customer_id, "campaign_type")}><InlineSelect value={r.campaign_type} options={CAMPAIGN_OPTS} color={r.campaign_type ? segColor(r.campaign_type) : null} onChange={(v) => patch(r, { campaign_type: v })} /></td>
                    <td className={flashCls(flash, r.customer_id, "called")}><CalledSelect r={r} patch={patch} /></td>
                    <td className={flashCls(flash, r.customer_id, "call_outcome")}><InlineSelect value={r.call_outcome} options={OUTCOME_OPTS} onChange={(v) => patch(r, { call_outcome: v })} /></td>
                    <td><CouponCell r={r} /></td>
                    <td className={flashCls(flash, r.customer_id, "coupon_used")}><InlineSelect value={r.coupon_used} options={COUPON_USED_OPTS}
                      color={r.coupon_used === "Kullandı" ? "#16a34a" : r.coupon_used === "Kullanmadı" ? "#dc2626" : null}
                      onChange={(v) => patch(r, { coupon_used: v })} /></td>
                    <td>{r.reordered_after_call ? <span className="badge badge-ok">✓ verdi</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td className="num" style={r.recency_days > 90 ? { color: "#dc2626", fontWeight: 600 } : undefined}>{r.recency_days != null ? `${r.recency_days}g` : "-"}</td>
                    <td className="num">{fmtMoney(r.monetary)}</td>
                    <td><button className="modal-close" style={{ width: 26, height: 26 }} onClick={() => setEditing(r)}>⋯</button></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={12} className="state">Sonuç yok</td></tr>}
              </tbody>
            </table>
          </div>
        </AsyncState>
      </Card>
      {editing && <EditModal row={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); setReload((x) => x + 1); }} />}
      <Toast toast={toast} />
    </>
  );
}

// ---- Çağrı Takibi: DÜZENLENEBİLİR aranacaklar + önceki ay arananlar ----
function CallTracking() {
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const { rows: toCall, loading, error, flash, toast, patch } = useCrmRows(`/api/crm/customers?only_to_call=true&_r=${reload}`);
  const { data: prev } = useApi("/api/crm/previous-month-called");

  return (
    <>
      <Card title={`Aranacaklar (${toCall.length}) — ara ve sonucu buraya gir`}>
        <p className="section-desc" style={{ margin: "0 0 10px" }}>
          Sekme değiştirmeden: ara → <b>Arandı=Evet</b> (tarih otomatik) → <b>Çağrı Sonucu</b> seç. Anında kaydolur.
        </p>
        <AsyncState loading={loading} error={error} data={toCall}>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table>
              <thead><tr><th>Müşteri</th><th>Telefon</th><th className="num">Sessiz</th><th>Arandı</th><th>Çağrı Sonucu</th><th className="num">Harcama</th><th></th></tr></thead>
              <tbody>
                {toCall.map((r) => (
                  <tr key={r.customer_id} style={{ borderLeft: `3px solid ${priorityColor(r)}` }}>
                    <td>{r.name}</td>
                    <td>{r.phone || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td className="num">{r.recency_days ?? "-"}g</td>
                    <td className={flashCls(flash, r.customer_id, "called")}><CalledSelect r={r} patch={patch} /></td>
                    <td className={flashCls(flash, r.customer_id, "call_outcome")}><InlineSelect value={r.call_outcome} options={OUTCOME_OPTS} onChange={(v) => patch(r, { call_outcome: v })} /></td>
                    <td className="num">{fmtMoney(r.monetary)}</td>
                    <td><button className="modal-close" style={{ width: 26, height: 26 }} onClick={() => setEditing(r)}>⋯</button></td>
                  </tr>
                ))}
                {!toCall.length && <tr><td colSpan={7} className="state">Aranacak müşteri yok — “Müşteriler” sekmesinde bir satırın başındaki ☎ ile ekle.</td></tr>}
              </tbody>
            </table>
          </div>
        </AsyncState>
      </Card>

      <Card title={`Önceki Ay Arananlar${prev ? ` — ${prev.period} (${prev.count})` : ""}`}>
        <p className="section-desc" style={{ margin: "0 0 10px" }}>Ne cevap alındı, sonrasında tekrar sipariş verdi mi.</p>
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Müşteri</th><th>Arama</th><th>Çağrı Sonucu</th><th>Tekrar Sipariş</th><th className="num">Harcama</th></tr></thead>
            <tbody>
              {(prev?.customers || []).map((r) => (
                <tr key={r.customer_id}>
                  <td>{r.name}</td><td>{fmtDate(r.last_call_date)}</td>
                  <td>{r.call_outcome || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td>{r.reordered_after_call ? <span className="badge badge-ok">✓ verdi</span> : <span className="badge badge-bad">vermedi</span>}</td>
                  <td className="num">{fmtMoney(r.monetary)}</td>
                </tr>
              ))}
              {!(prev?.customers || []).length && <tr><td colSpan={5} className="state">Geçen ay arama yok</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <EditModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload((x) => x + 1); }} />}
      <Toast toast={toast} />
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
      <p className="section-desc" style={{ margin: "0 0 10px" }}>Bir kampanyaya uygun ama kuponu tanımlanmamış (ve aranmamış) müşteriler.</p>
      <AsyncState loading={loading} error={error} data={data}>
        {data && (
          <>
            <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={`chip ${camp === "" ? "on" : ""}`} onClick={() => setCamp("")}>Tümü ({data.gap_count})</button>
              {(data.by_campaign || []).map((c) => (
                <button key={c.campaign} className={`chip ${camp === c.campaign ? "on" : ""}`} onClick={() => setCamp(c.campaign)}>{c.campaign} ({c.count})</button>
              ))}
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <table>
                <thead><tr><th>Müşteri</th><th>Uygun</th><th className="num">Sipariş</th><th>Son Sipariş</th><th className="num">Harcama</th></tr></thead>
                <tbody>
                  {data.customers.map((r) => (
                    <tr key={r.customer_id} className="clickable-row" onClick={() => onEdit(r)}>
                      <td>{r.name}</td><td style={{ fontSize: 11 }}>{r.eligibility.join(", ")}</td>
                      <td className="num">{r.orders}</td><td>{fmtDate(r.last_order)}</td><td className="num">{fmtMoney(r.monetary)}</td>
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
                  <td>{r.called ? <span className="badge badge-ok">✓</span> : "—"}</td>
                  <td className="num">{r.orders}</td><td className="num">{fmtMoney(r.revenue)}</td>
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

// Üstteki aksiyon-özeti KPI şeridi
function KpiStrip({ onNav }) {
  const { data } = useApi("/api/crm/summary");
  const card = (label, value, sub, color, onClick) => (
    <div className="card stat-card kpi-alert" style={{ borderLeft: `4px solid ${value ? color : "var(--border)"}`, opacity: value ? 1 : 0.6 }} onClick={onClick}>
      <div className="label">{label}</div>
      <div className="value" style={{ color: value ? color : "var(--muted)" }}>{value ?? "…"}</div>
      {sub && <div className="label" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      {card("Aranacak", data?.to_call, "çağrı bekliyor", "#f59e0b", () => onNav("cagri"))}
      {card("Kuponu Bitiyor", data?.coupon_expiring, "yakında", "#c2410c", () => onNav("musteriler"))}
      {card("Kuponu Bitti", data?.coupon_expired, "süresi doldu", "#dc2626", () => onNav("musteriler"))}
      {card("Eksik Kupon", data?.gap_count, "uygun ama kuponsuz", "#1b4f9b", () => onNav("kupon"))}
    </div>
  );
}

export default function CrmSection({ focusCustomer, onFocusHandled }) {
  const [sub, setSub] = useState("musteriler");
  const [editing, setEditing] = useState(null);
  const [reload, setReload] = useState(0);
  const { data: meta } = useApi("/api/stats/months");
  const months = meta?.months || [];

  useEffect(() => { if (focusCustomer) setSub("musteriler"); }, [focusCustomer]);

  return (
    <section className="section">
      <h2 className="section-title"><span className="num">★</span> CRM</h2>
      <p className="section-desc">Müşteri ilişkileri: arama, kupon ve kampanya takibi. Üstteki kartlara tıkla → ilgili listeye git.</p>

      <KpiStrip onNav={setSub} />

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

      {editing && <EditModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload((x) => x + 1); }} />}
    </section>
  );
}
