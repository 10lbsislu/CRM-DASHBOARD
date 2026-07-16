import { useState } from "react";
import OrdersSection from "./sections/OrdersSection";
import StatsSection from "./sections/StatsSection";
import CustomersSection from "./sections/CustomersSection";
import BasketSection from "./sections/BasketSection";
import CrmSection from "./sections/CrmSection";
import KampanyaSection from "./sections/KampanyaSection";
import LogisticsSection from "./sections/LogisticsSection";
import UploadSection from "./sections/UploadSection";

const TABS = [
  { id: "orders", label: "Siparişler" },
  { id: "stats", label: "İstatistikler" },
  { id: "customers", label: "Müşteriler" },
  { id: "crm", label: "★ CRM" },
  { id: "kampanya", label: "◆ Kampanya" },
  { id: "logistics", label: "⛟ Lojistik" },
  { id: "basket", label: "Birlikte Alınanlar" },
  { id: "upload", label: "↑ Veri Yükle" },
];

export default function App() {
  const [active, setActive] = useState("orders");
  const [focusCustomer, setFocusCustomer] = useState(null);

  const goToCrm = (customerId) => {
    setFocusCustomer(customerId);
    setActive("crm");
  };

  const renderTab = () => {
    switch (active) {
      case "orders": return <OrdersSection onGoCrm={goToCrm} />;
      case "stats": return <StatsSection />;
      case "customers": return <CustomersSection />;
      case "crm": return <CrmSection focusCustomer={focusCustomer} onFocusHandled={() => setFocusCustomer(null)} />;
      case "kampanya": return <KampanyaSection />;
      case "logistics": return <LogisticsSection />;
      case "basket": return <BasketSection />;
      case "upload": return <UploadSection />;
      default: return null;
    }
  };

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
      <main className="container">{renderTab()}</main>
    </>
  );
}
