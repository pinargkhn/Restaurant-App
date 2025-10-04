import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCart } from "../context/CartContext";
import Cart from "./Cart";

export default function Menu() {
  const { addItem } = useCart();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const tableId = params.get("table");
  const [loading, setLoading] = useState(true);
  const [validTable, setValidTable] = useState(false);

  useEffect(() => {
    const checkTable = async () => {
      try {
        if (!tableId) {
          alert("⚠️ Geçersiz bağlantı! Masa ID bulunamadı.");
          navigate("/login");
          return;
        }

        const ref = doc(db, "tables", tableId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          alert("❌ Bu masa sistemde kayıtlı değil!");
          navigate("/login");
        } else {
          setValidTable(true);
        }
      } catch (err) {
        console.error("🔥 Masa doğrulama hatası:", err);
        alert("Sunucu bağlantısında bir hata oluştu.");
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    checkTable();
  }, [tableId, navigate]);

  // 🔹 Menü ürünleri
  const products = [
    { id: 1, name: "Pizza", price: 120 },
    { id: 2, name: "Hamburger", price: 80 },
    { id: 3, name: "Lahmacun", price: 60 },
    { id: 4, name: "Ayran", price: 20 },
    { id: 5, name: "Kola", price: 25 },
  ];

  // ⏳ Doğrulama süreci devam ediyorsa
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold text-gray-600">
        Masa doğrulanıyor...
      </div>
    );
  }

  // 🚫 Masa geçersizse (yönlendirme yapılacak)
  if (!validTable) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-red-600 font-semibold">
        Geçersiz masa bağlantısı!
      </div>
    );
  }

  // ✅ Masa geçerli — Menü render ediliyor
  return (
    <div className="flex">
      {/* Sol kısım: Menü listesi */}
      <div className="flex-1 p-6 max-w-2xl">
        <h2 className="text-2xl font-bold mb-4 text-center">
          Menü ({tableId})
        </h2>
        <ul className="space-y-3">
          {products.map((item) => (
            <li
              key={item.id}
              className="flex justify-between items-center p-4 bg-white rounded shadow"
            >
              <div className="flex flex-col">
                <span className="font-semibold">{item.name}</span>
                <span className="text-gray-600">{item.price} ₺</span>
              </div>
              <button
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={() => addItem(item)}
              >
                Sepete Ekle
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Sağ kısım: Sabit Sepet Paneli */}
      <Cart />
    </div>
  );
}
