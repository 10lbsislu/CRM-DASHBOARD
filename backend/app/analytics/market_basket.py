"""Market-basket analizi — basit co-occurrence + lift/confidence (saf hesap).

Girdi: her sipariş için o siparişteki tekil ürün adları kümesi.
Çıktı: birlikte en çok alınan ürün çiftleri (support, confidence, lift).
"""
from collections import Counter
from itertools import combinations


def compute_pairs(
    transactions: list[set[str]],
    min_pair_count: int = 2,
    top_n: int = 50,
) -> list[dict]:
    """Birlikte alınan ürün çiftlerini hesaplar.

    - support      = çiftin geçtiği sipariş oranı
    - confidence   = P(B | A) = pair_count / count(A)  (yön: a -> b)
    - lift         = support(pair) / (support(A) * support(B)); >1 ise pozitif ilişki
    """
    total = len(transactions)
    if total == 0:
        return []

    item_count: Counter = Counter()
    pair_count: Counter = Counter()

    for items in transactions:
        unique = sorted(set(items))
        for it in unique:
            item_count[it] += 1
        for a, b in combinations(unique, 2):
            pair_count[(a, b)] += 1

    results = []
    for (a, b), c in pair_count.items():
        if c < min_pair_count:
            continue
        support = c / total
        conf_a_b = c / item_count[a]
        conf_b_a = c / item_count[b]
        lift = support / ((item_count[a] / total) * (item_count[b] / total))
        results.append({
            "product_a": a,
            "product_b": b,
            "pair_count": c,
            "support": round(support, 4),
            "confidence_a_to_b": round(conf_a_b, 4),
            "confidence_b_to_a": round(conf_b_a, 4),
            "lift": round(lift, 3),
        })

    # Önce lift, sonra birlikte görülme sayısına göre sırala
    results.sort(key=lambda x: (x["lift"], x["pair_count"]), reverse=True)
    return results[:top_n]
