// Ortak küçük bileşenler ve biçimlendirme yardımcıları.

export function Card({ title, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

// Ortada açılan popup. Arka plana ya da ✕'e tıklayınca kapanır.
export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value }) {
  return (
    <div className="card stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

// Yükleme/hata/boş durumları tek yerden yönetir.
export function AsyncState({ loading, error, data, children, empty = "Veri yok" }) {
  if (loading) return <div className="state">Yükleniyor…</div>;
  if (error) return <div className="state error">Hata: {error}</div>;
  const isEmpty =
    !data || (Array.isArray(data) && data.length === 0);
  if (isEmpty) return <div className="state">{empty}</div>;
  return children;
}

const tl = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const tl2 = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtMoney = (v) => (v == null ? "-" : `${tl.format(v)} ₺`);
export const fmtMoney2 = (v) => (v == null ? "-" : `${tl2.format(v)} ₺`);
export const fmtNum = (v) => (v == null ? "-" : tl.format(v));

export function fmtDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Recharts için ortak renk paleti
export const COLORS = [
  "#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5",
];

// RFM segmentleri: renk + ne demek + ne yapmalı (rfm.py ile aynı isimler)
export const SEGMENT_META = {
  "Şampiyonlar": {
    color: "#16a34a",
    desc: "Sık, çok ve yakın zamanda alışveriş yapan en değerli müşteriler.",
    action: "Ödüllendir · VIP / sadakat",
  },
  "Sadık Müşteriler": {
    color: "#0891b2",
    desc: "Düzenli alışveriş yapıyor, markaya bağlı.",
    action: "Üst satış · yeni ürün öner",
  },
  "Potansiyel Sadık": {
    color: "#2563eb",
    desc: "Yakın zamanda birkaç kez aldı, sadıklaşabilir.",
    action: "Üyelik / teşvik ver",
  },
  "Yeni Müşteriler": {
    color: "#6366f1",
    desc: "Yeni kazanıldı, henüz az alışveriş yaptı.",
    action: "Hoş geldin · 2. sipariş teşviki",
  },
  "Gelecek Vaat Eden": {
    color: "#8b5cf6",
    desc: "Yakın zamanda az harcadı, ilgi gösteriyor.",
    action: "Marka bilinirliği · kampanya",
  },
  "Kaybedilmemeli": {
    color: "#ea580c",
    desc: "Eskiden çok değerliydi ama uzaklaştı.",
    action: "Acil geri kazan · özel teklif",
  },
  "Risk Altında": {
    color: "#f59e0b",
    desc: "Değerli müşteri ama bir süredir alışveriş yok.",
    action: "Kişisel iletişim · hatırlat",
  },
  "Uykuya Dalmak Üzere": {
    color: "#fb923c",
    desc: "Aktivitesi düşüyor, kaybedilmek üzere.",
    action: "Hatırlatma kampanyası",
  },
  "Uykuda / Kayıp": {
    color: "#ef4444",
    desc: "Uzun süredir alışveriş yok.",
    action: "Win-back denemesi",
  },
};

// Segment görüntüleme önceliği (değerli → riskli → kayıp)
export const SEGMENT_ORDER = [
  "Şampiyonlar", "Sadık Müşteriler", "Potansiyel Sadık", "Yeni Müşteriler",
  "Gelecek Vaat Eden", "Kaybedilmemeli", "Risk Altında",
  "Uykuya Dalmak Üzere", "Uykuda / Kayıp",
];

export const segColor = (seg) => SEGMENT_META[seg]?.color || "#94a3b8";

// Sipariş tutarı kademesine göre renk (<10k / 10–20k / 20k+)
export function orderTierColor(total) {
  if (total == null) return "#94a3b8";
  if (total < 10000) return "#dc2626";   // küçük — kırmızı
  if (total < 20000) return "#2563eb";   // orta — mavi
  return "#16a34a";                       // büyük — yeşil
}

// --- Dönem (ay) filtresi yardımcıları ve bileşeni ---
export function withParams(base, params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") sp.append(k, v);
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

export function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

export function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const p = (n) => String(n).padStart(2, "0");
  return { start: `${ym}-01`, end: `${ny}-${p(nm)}-01` };
}

export function DateRangeBar({ months, value, onChange }) {
  const idx = months.indexOf(value);
  const step = (d) => {
    const ni = idx + d;
    if (ni >= 0 && ni < months.length) onChange(months[ni]);
  };
  const btn = { padding: "6px 12px", background: "var(--bg)", color: "var(--text)" };
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <b style={{ fontSize: 13 }}>Dönem:</b>
      <button className="tab" style={{ borderRadius: 8, background: value === "all" ? "var(--accent)" : "var(--bg)", color: value === "all" ? "#fff" : "var(--text)" }}
        onClick={() => onChange("all")}>Tüm Zamanlar</button>
      <button className="btn" style={btn} disabled={value === "all" || idx <= 0} onClick={() => step(-1)}>◀</button>
      <select value={value === "all" ? "" : value} onChange={(e) => onChange(e.target.value)}
        style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, minWidth: 150 }}>
        <option value="" disabled>Ay seç…</option>
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
      <button className="btn" style={btn} disabled={value === "all" || idx < 0 || idx >= months.length - 1} onClick={() => step(1)}>▶</button>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>{value === "all" ? "Tüm siparişler" : monthLabel(value)}</span>
    </div>
  );
}
