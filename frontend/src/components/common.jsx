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
