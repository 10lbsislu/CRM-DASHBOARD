import { useRef, useState } from "react";
import { apiUpload } from "../api/client";
import { Card, fmtMoney, fmtDate, orderTierColor } from "../components/common";

export default function UploadSection() {
  const [files, setFiles] = useState([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const pick = (list) => {
    const csv = Array.from(list).filter((f) =>
      f.name.toLowerCase().endsWith(".csv")
    );
    setFiles(csv);
    setError(csv.length ? null : "Yalnızca .csv dosyaları kabul edilir.");
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files);
  };

  const submit = async () => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiUpload("/api/ingest/upload", files);
      setResult(res);
      setFiles([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <h2 className="section-title">
        <span className="num">↑</span> Veri Yükleme
      </h2>
      <Card title="Günlük CSV Yükle">
        <p className="state" style={{ marginTop: 0 }}>
          ikas sipariş export CSV'ni buraya yükle. Veriler <b>biriktirilir</b> —
          aynı sipariş tekrar gelirse güncellenir, yeni siparişler eklenir, geçmiş
          korunur. Yeni müşteriler otomatik tanınır; daha önce alışveriş yapmış
          biri (e-posta/telefon/ad eşleşmesiyle) mevcut müşteriyle birleştirilir.
        </p>

        <div
          className={`dropzone ${drag ? "drag" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            hidden
            onChange={(e) => pick(e.target.files)}
          />
          {files.length ? (
            <div>
              <b>{files.length} dosya seçildi:</b>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {files.map((f) => f.name).join(", ")}
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--muted)" }}>
              Dosyaları buraya sürükle ya da tıklayıp seç (.csv)
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" disabled={!files.length || busy} onClick={submit}>
            {busy ? "Yükleniyor…" : "Yükle ve Biriktir"}
          </button>
          {error && <span className="state error">{error}</span>}
        </div>

        {result && (
          <div className="result-box">
            <b>✓ Yükleme tamam.</b>
            <div style={{ marginTop: 8 }}>
              Yeni sipariş: <b>{result.new_orders}</b> · Güncellenen:{" "}
              <b>{result.updated_orders}</b> · Yeni ürün:{" "}
              <b>{result.new_products}</b>
              <br />
              Toplam sipariş: <b>{result.total_orders_in_db}</b> · Toplam müşteri:{" "}
              <b>{result.total_customers_in_db}</b>
            </div>
            <button
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() => window.location.reload()}
            >
              Paneli Yenile
            </button>
          </div>
        )}

        {result && result.new_order_details?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>
              Yeni Gelen Siparişler ({result.new_order_details.length})
            </h3>
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>No</th><th>Tarih</th><th>Müşteri</th>
                    <th className="num">Kaçıncı</th><th>İndirim/Kampanya</th><th className="num">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {result.new_order_details.map((o) => (
                    <tr key={o.order_number}>
                      <td style={{ background: orderTierColor(o.total), color: "#fff", fontWeight: 700 }}>#{o.order_number}</td>
                      <td>{fmtDate(o.order_date)}</td>
                      <td>{o.customer_name}</td>
                      <td className="num">
                        {o.purchase_index ? `${o.purchase_index}.` : "-"}
                        {o.purchase_index === 1 ? <span className="badge" style={{ background: "#dbeafe", color: "#1d4ed8", marginLeft: 6 }}>YENİ</span> : null}
                      </td>
                      <td>
                        {o.discounted
                          ? <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c" }}>
                              {o.coupon_code || "İndirimli"}{o.campaign_discount ? ` · ${fmtMoney(o.campaign_discount)}` : ""}
                            </span>
                          : <span style={{ color: "var(--muted)" }}>—</span>}
                      </td>
                      <td className="num">{fmtMoney(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
