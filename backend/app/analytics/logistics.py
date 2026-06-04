"""Ürün kargo kategorisi sınıflandırması: donuk vs soğuk.

Kural: ürün adında soğuk göstergesi (marine/pişmiş/füme/salata...) varsa SOĞUK
(öncelikli — "Somon Füme Donuk Dilimli" adında 'donuk' geçse de soğuktur).
Yoksa ve 'donuk/burger/cips' geçiyorsa DONUK. Geri kalan her şey SOĞUK.
"""

# Soğuk göstergeleri (donuk anahtarından ÖNCE kontrol edilir)
_SOGUK_KW = [
    "marine", "pişmiş", "füme", "börülce", "koruğu", "lakerda",
    "salata", "midye",
]
# Donuk göstergeleri
_DONUK_KW = ["donuk", "burger", "cips"]
# Anahtar kelimeye uymayan ama donuk olan ürünler (açık eşleştirme)
_DONUK_OVERRIDE = ["kalamar kirli", "karides et yerli kuyruklu"]


def classify_category(name: str | None) -> str:
    """Ürün adından kargo kategorisi: 'donuk' veya 'soguk'."""
    if not name:
        return "soguk"
    s = name.lower()
    if any(k in s for k in _SOGUK_KW):
        return "soguk"
    if any(k in s for k in _DONUK_KW) or any(k in s for k in _DONUK_OVERRIDE):
        return "donuk"
    return "soguk"  # diğer her şey soğuk
