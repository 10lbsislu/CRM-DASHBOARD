"""RFM segmentasyonu — saf hesaplama (DB'den bağımsız).

Girdi: müşteri başına özetlenmiş sipariş bilgisi.
Çıktı: her müşteri için Recency/Frequency/Monetary değerleri, 1-5 skorları ve segment.
"""
from dataclasses import dataclass
from datetime import datetime


@dataclass
class CustomerOrders:
    email: str
    last_order_date: datetime
    frequency: int          # net sipariş sayısı
    monetary: float         # net toplam harcama


def _score_quintile(values: list[float], reverse: bool = False) -> dict[int, int]:
    """Değerleri 1-5 arası skora böler (sıralama bazlı, eşitliklere dayanıklı).

    reverse=True → küçük değer yüksek skor (Recency için: yeni alışveriş = iyi).
    Döner: index -> skor (1..5).
    """
    n = len(values)
    order = sorted(range(n), key=lambda i: values[i], reverse=reverse)
    scores: dict[int, int] = {}
    for rank, idx in enumerate(order):
        # rank 0..n-1 -> 1..5 dilim
        scores[idx] = min(5, int(rank * 5 / n) + 1)
    return scores


def _segment(r: int, f: int) -> str:
    """R ve F skorlarından okunabilir segment etiketi (sadeleştirilmiş şema)."""
    if r >= 4 and f >= 4:
        return "Şampiyonlar"
    if r >= 3 and f >= 3:
        return "Sadık Müşteriler"
    if r >= 4 and f <= 2:
        return "Potansiyel Sadık"
    if r >= 4 and f == 1:
        return "Yeni Müşteriler"
    if r == 3 and f <= 2:
        return "Gelecek Vaat Eden"
    if r <= 2 and f >= 4:
        return "Kaybedilmemeli"
    if r <= 2 and f >= 3:
        return "Risk Altında"
    if r == 2 and f <= 2:
        return "Uykuya Dalmak Üzere"
    return "Uykuda / Kayıp"


def compute_rfm(
    customers: list[CustomerOrders], reference_date: datetime
) -> list[dict]:
    """RFM tablosunu üretir. reference_date genelde veri setindeki en son tarih."""
    if not customers:
        return []

    recency_days = [
        max(0, (reference_date - c.last_order_date).days) for c in customers
    ]
    frequency = [float(c.frequency) for c in customers]
    monetary = [c.monetary for c in customers]

    # Recency: küçük gün = daha iyi (reverse)
    r_scores = _score_quintile(recency_days, reverse=True)
    f_scores = _score_quintile(frequency)
    m_scores = _score_quintile(monetary)

    out = []
    for i, c in enumerate(customers):
        r, f, m = r_scores[i], f_scores[i], m_scores[i]
        out.append({
            "email": c.email,
            "recency_days": recency_days[i],
            "frequency": c.frequency,
            "monetary": round(c.monetary, 2),
            "r": r,
            "f": f,
            "m": m,
            "rfm_score": f"{r}{f}{m}",
            "segment": _segment(r, f),
        })
    # En değerliyi başa al (M sonra F)
    out.sort(key=lambda x: (x["m"], x["f"], x["monetary"]), reverse=True)
    return out
