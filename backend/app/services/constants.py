"""Analiz ve servislerde paylaşılan sabitler."""

# Ciro/istatistik hesabında HARİÇ tutulacak sipariş durumları (net ciro)
EXCLUDED_STATUSES = ["İptal Edildi", "İade Edildi", "Parçalı İade"]

# Churn (kayıp müşteri) için varsayılan gün eşiği:
# son siparişinden bu kadar gün geçen müşteri "risk altında" sayılır.
DEFAULT_CHURN_DAYS = 90

# Market-basket: bir ürün çiftinin rapora girmesi için min birlikte görülme sayısı
DEFAULT_MIN_PAIR_COUNT = 2

# --- Müşteri kimlik çözümleme (mükerrer müşteri birleştirme) ---
# Aynı telefon farklı e-postaları birleştirsin mi
MERGE_BY_PHONE = True
# Aynı ad+soyad farklı e-postaları birleştirsin mi (placeholder'lara dikkat)
MERGE_BY_NAME = True
