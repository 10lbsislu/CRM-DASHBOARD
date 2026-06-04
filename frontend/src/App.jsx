import { useState } from "react";
import OrdersSection from "./sections/OrdersSection";
import StatsSection from "./sections/StatsSection";
import CustomersSection from "./sections/CustomersSection";
import BasketSection from "./sections/BasketSection";
import CrmSection from "./sections/CrmSection";
import LogisticsSection from "./sections/LogisticsSection";
import UploadSection from "./sections/UploadSection";

const TABS = [
  { id: "orders", label: "Siparişler", el: <OrdersSection /> },
  { id: "stats", label: "İstatistikler", el: <StatsSection /> },
  { id: "customers", label: "Müşteriler", el: <CustomersSection /> },
  { id: "crm", label: "★ CRM / Kampanya", el: <CrmSection /> },
  { id: "logistics", label: "⛟ Lojistik", el: <LogisticsSection /> },
  { id: "basket", label: "Birlikte Alınanlar", el: <BasketSection /> },
  { id: "upload", label: "↑ Veri Yükle", el: <UploadSection /> },
];

export default function App() {
  const [active, setActive] = useState("orders");
  const current = TABS.find((t) => t.id === active);

  return (
    <>
      <header className="app-header">
        <div className="header-top">
          <div className="brand">
            <img src="/pakyurek-logo.png" alt="Pakyürek Şirketler Grubu" className="logo-group" />
            <div className="divider" />
            <img src="/mezzemarin-logo.png" alt="mezzeMarin" className="logo-main" />
            <div className="divider" />
            <div>
              <h1>CRM Dashboard</h1>
              <p>Sipariş, müşteri ve ürün analizleri</p>
            </div>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${active === t.id ? "active" : ""}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="container">{current?.el}</main>
    </>
  );
}
