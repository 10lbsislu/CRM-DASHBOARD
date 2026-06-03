"""Müşteri kimlik çözümleme (mükerrer müşteri birleştirme).

Müşteri kimliği SİPARİŞLERDEN türetilir (her siparişin ham e-posta/ad/telefonu).
Böylece aynı mantık hem ilk CSV yüklemesinde (NormalizedData) hem de biriken
DB üzerinde yeniden çözümlemede kullanılır. union-find ile e-posta/telefon/ad
ortaklığı tek kanonik müşteriye (`id` = birincil e-posta) bağlanır.
"""
import re
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.base import NormalizedData
from app.services.constants import MERGE_BY_NAME, MERGE_BY_PHONE


def _norm_email(e: str | None) -> str | None:
    return (e.strip().lower() or None) if e else None


def _norm_phone(p: str | None) -> str | None:
    """10 haneye indir; placeholder (tek rakam tekrarı) veya kısa ise yok say."""
    if not p:
        return None
    d = re.sub(r"\D", "", p)
    if d.startswith("90") and len(d) > 10:
        d = d[2:]
    if len(d) == 11 and d.startswith("0"):
        d = d[1:]
    if len(d) != 10 or len(set(d)) == 1:
        return None
    return d


def _norm_name(n: str | None) -> str | None:
    if not n:
        return None
    return re.sub(r"\s+", " ", n.strip()).lower() or None


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def add(self, x: str) -> None:
        self.parent.setdefault(x, x)

    def find(self, x: str) -> str:
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a: str, b: str) -> None:
        self.add(a)
        self.add(b)
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def _resolve_orders(orders: list[dict]) -> tuple[list[dict], dict[str, str]]:
    """Siparişlerden kanonik müşterileri üretir.

    Döner: (customers, email_to_canon). Ayrıca her siparişe 'customer_id' yazar.
    """
    # Normalize e-posta başına: en güncel ad/telefon ve sipariş sayısı
    cand: dict[str, dict] = {}
    for o in orders:
        ne = _norm_email(o.get("customer_email"))
        if not ne:
            o["customer_id"] = None
            continue
        rec = cand.setdefault(ne, {"name": None, "phone": None, "last": None, "count": 0})
        rec["count"] += 1
        od = o.get("order_date")
        if od is not None and (rec["last"] is None or od >= rec["last"]):
            rec["last"] = od
            rec["name"] = o.get("customer_name") or rec["name"]
            rec["phone"] = o.get("customer_phone") or rec["phone"]

    uf = _UnionFind()
    for ne in cand:
        uf.add(ne)

    by_phone: dict[str, list[str]] = defaultdict(list)
    by_name: dict[str, list[str]] = defaultdict(list)
    for ne, rec in cand.items():
        if MERGE_BY_PHONE and (ph := _norm_phone(rec["phone"])):
            by_phone[ph].append(ne)
        if MERGE_BY_NAME and (nm := _norm_name(rec["name"])):
            by_name[nm].append(ne)
    for group in (*by_phone.values(), *by_name.values()):
        for other in group[1:]:
            uf.union(group[0], other)

    components: dict[str, list[str]] = defaultdict(list)
    for ne in cand:
        components[uf.find(ne)].append(ne)

    email_to_canon: dict[str, str] = {}
    customers: list[dict] = []
    for emails in components.values():
        primary = max(emails, key=lambda e: (cand[e]["count"], e))
        rep = cand[primary]
        for e in emails:
            email_to_canon[e] = primary
        customers.append({
            "id": primary,
            "primary_email": primary,
            "emails": ", ".join(sorted(emails)),
            "full_name": rep["name"],
            "phone": rep["phone"],
            "city": None,   # şehir/ilçe siparişte tutuluyor; istenirse doldurulur
            "district": None,
        })

    for o in orders:
        ne = _norm_email(o.get("customer_email"))
        o["customer_id"] = email_to_canon.get(ne) if ne else None

    return customers, email_to_canon


def resolve(data: NormalizedData) -> NormalizedData:
    """İlk yükleme yolu: NormalizedData içindeki siparişlerden müşterileri üretir."""
    customers, _ = _resolve_orders(data.orders)
    before = len(data.customers)
    data.customers = customers
    if customers and before > len(customers):
        print(f"Kimlik çözümleme: {before} -> {len(customers)} müşteri")
    return data


def reresolve_db(db: Session) -> int:
    """Biriken DB üzerinde kimlik çözümlemeyi yeniden çalıştırır.

    Tüm siparişlerin ham bilgisinden müşterileri yeniden üretir, customers
    tablosunu tazeler ve orders.customer_id alanlarını günceller.
    Döner: kanonik müşteri sayısı.
    """
    from app.models import Customer, Order  # döngüsel importu önlemek için yerel

    rows = db.execute(
        select(
            Order.order_number, Order.customer_email,
            Order.customer_name, Order.customer_phone, Order.order_date,
        )
    ).all()
    orders = [
        {
            "order_number": r.order_number,
            "customer_email": r.customer_email,
            "customer_name": r.customer_name,
            "customer_phone": r.customer_phone,
            "order_date": r.order_date,
        }
        for r in rows
    ]
    customers, _ = _resolve_orders(orders)

    # customers tablosunu tazele
    db.query(Customer).delete()
    if customers:
        db.bulk_insert_mappings(Customer, customers)
    # orders.customer_id güncelle
    db.bulk_update_mappings(
        Order,
        [{"order_number": o["order_number"], "customer_id": o["customer_id"]} for o in orders],
    )
    db.commit()
    return len(customers)
