import { useApi } from "../hooks/useApi";
import { Card, AsyncState } from "../components/common";

export default function BasketSection() {
  const { data, error, loading } = useApi(
    "/api/basket/pairs?min_count=2&top_n=20"
  );
  return (
    <section className="section">
      <h2 className="section-title">
        <span className="num">4</span> Birlikte Alınan Ürünler
      </h2>
      <Card
        title={`Ürün Çiftleri (market-basket)${
          data ? ` — ${data.total_baskets} sepet` : ""
        }`}
      >
        <AsyncState loading={loading} error={error} data={data?.pairs}>
          <p className="state" style={{ marginTop: 0 }}>
            <b>Lift</b> &gt; 1 ise iki ürün birlikte beklenenden çok satılıyor.
            <b> Güven (A→B)</b>: A alanların yüzde kaçı B'yi de alıyor.
          </p>
          <table>
            <thead>
              <tr>
                <th>Ürün A</th>
                <th>Ürün B</th>
                <th className="num">Birlikte</th>
                <th className="num">Güven A→B</th>
                <th className="num">Lift</th>
              </tr>
            </thead>
            <tbody>
              {(data?.pairs || []).map((p, i) => (
                <tr key={i}>
                  <td>{p.product_a}</td>
                  <td>{p.product_b}</td>
                  <td className="num">{p.pair_count}</td>
                  <td className="num">
                    {(p.confidence_a_to_b * 100).toFixed(0)}%
                  </td>
                  <td className="num">
                    <span className="badge">{p.lift.toFixed(1)}×</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AsyncState>
      </Card>
    </section>
  );
}
