import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCart } from "../context/CartContext";
import useProducts from "../hooks/useProducts";
import Cart from "../components/Cart"; // Cart'ın components klasöründen geldiğini varsayıyoruz

export default function Menu() {
  const { addItem } = useCart();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const tableId = params.get("table");
  const [loading, setLoading] = useState(true);
  const [validTable, setValidTable] = useState(false);

  // 🔹 useProducts Hook'u
  const { 
      products,
      categories: CATEGORIES,
      loading: loadingProducts,
  } = useProducts();
  
  // 🔹 State'ler
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const categoryRefs = useRef({}); // Kategori başlıklarına referans tutar

  // ---------------- Masa Doğrulama ----------------
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

  // İlk yüklemede aktif kategoriyi ayarla
  useEffect(() => {
      if (!loadingProducts && CATEGORIES.length > 0 && !activeCategory) {
          setActiveCategory(CATEGORIES[0]);
      }
  }, [loadingProducts, CATEGORIES, activeCategory]);

  // ---------------- Arama Filtreleme ----------------
  const filteredMenu = useMemo(() => {
    if (!searchQuery.trim()) return products;

    const queryText = searchQuery.trim().toLowerCase();
    const results = {};

    for (const category of CATEGORIES) {
      const filteredItems = (products[category] || []).filter(item =>
        item.name.toLowerCase().includes(queryText)
      );
      if (filteredItems.length > 0) {
        results[category] = filteredItems;
      }
    }
    return results;
  }, [searchQuery, products, CATEGORIES]);

  // ---------------- Intersection Observer ile Aktif Kategori Takibi ----------------
  useEffect(() => {
    if (!validTable || searchQuery.trim() || loadingProducts) return;

    // Sticky nav'ın (Arama Çubuğu + Kategori Navigasyonu) yüksekliğini telafi eden margin.
    // Başlık viewport'un -150px altındayken bile görünmüş kabul edilir.
    const options = {
      root: null, 
      rootMargin: "-150px 0px 0px 0px", 
      threshold: 0, 
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const category = entry.target.getAttribute("data-category");
        if (CATEGORIES.includes(category) && entry.isIntersecting) {
            setActiveCategory(category);
        }
      });
    }, options);

    // Observer'ı tüm kategori başlıklarına bağla
    CATEGORIES.forEach((category) => {
      const ref = categoryRefs.current[category];
      if (ref) {
        observer.observe(ref);
      }
    });

    return () => observer.disconnect();
  }, [validTable, searchQuery, loadingProducts, CATEGORIES]);
  
  // 🔹 Kategoriye Kaydırma Fonksiyonu
  const scrollToCategory = (category) => {
    const element = categoryRefs.current[category];
    if (element) {
        element.scrollIntoView({
            behavior: "smooth", 
            block: "start"
        });
    }
  };


  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
  };

  if (loading || loadingProducts) {
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold text-gray-600">
        Menü verileri yükleniyor...
      </div>
    );
  }

  if (!validTable) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-red-600 font-semibold">
        Geçersiz masa bağlantısı!
      </div>
    );
  }

  const categoriesToRender = searchQuery.trim() ? Object.keys(filteredMenu) : CATEGORIES;


  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <div className="flex-1 p-6 max-w-full md:max-w-2xl mx-auto md:mx-0 overflow-x-hidden"> {/* ✅ YATAY SCROLL ÖNLENDİ */}
        <h2 className="text-2xl font-bold mb-4 text-center border-b pb-2">
          Dijital Menü ({tableId})
        </h2>
        
        {/* ARAMA ÇUBUĞU (Sticky top:0) */}
        <div className="mb-6 sticky top-0 bg-white z-20 p-2 -mx-2 shadow-sm">
            <input
                type="text"
                placeholder="Yemek ara..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
        </div>


        {/* Sabit Kategori Navigasyonu (Sticky) */}
        {!searchQuery.trim() && (
            <div className="flex justify-start overflow-x-auto border-b border-gray-300 mb-6 sticky top-[75px] bg-white z-20 shadow-md p-2 -mx-2 whitespace-nowrap">
                {CATEGORIES.map((category) => (
                    <button
                    key={category}
                    onClick={() => {
                        scrollToCategory(category);
                        setActiveCategory(category); // ✅ TIKLAMADA VURGULAMAYI ANINDA GÜNCELLE
                    }} 
                    className={`px-4 py-2 font-semibold transition-colors ${
                        activeCategory === category
                        ? "border-b-2 border-blue-600 text-blue-600" // ✅ AKTİF VURGULAMA
                        : "text-gray-600 hover:text-blue-500"
                    }`}
                    >
                    {category}
                    </button>
                ))}
            </div>
        )}

        {/* TÜM KATEGORİLERİ DÖNGÜYLE GÖSTER */}
        {categoriesToRender.length > 0 ? (
          categoriesToRender.map((category) => (
            <div key={category} className="mb-8">
              {/* Başlık - Scrolling ve Intersection için reference noktası */}
              <h3
                ref={!searchQuery.trim() ? (el) => (categoryRefs.current[category] = el) : null}
                data-category={category} 
                className="text-xl font-bold mb-4 border-l-4 border-blue-600 pl-3 pt-2"
                // ✅ CSS Hilesi: Yapışkan nav'ın içeriği kapatmasını engellemek için 150px offset
                style={{ 
                    marginTop: searchQuery.trim() ? '0' : '-150px', 
                    paddingTop: searchQuery.trim() ? '0' : '150px' 
                }} 
              >
                {category}
              </h3>

              <ul className="space-y-3">
                {(searchQuery.trim() ? filteredMenu[category] : products[category]).map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between items-center p-4 bg-white rounded shadow hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-center gap-4">
                       {item.imageUrl && ( 
                            <img 
                                src={item.imageUrl} 
                                alt={item.name} 
                                className="w-16 h-16 object-cover rounded-md" 
                            />
                       )}
                       <div className="flex flex-col">
                            <span className="font-semibold text-lg">{item.name}</span>
                            <span className="text-gray-600 text-base">
                            {item.price} ₺
                            </span>
                       </div>
                    </div>
                    
                    <button
                      className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 transition"
                      onClick={() => addItem(item)}
                    >
                      + Ekle
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
             <p className="text-center text-gray-500 mt-10">Aradığınız ürün bulunamadı.</p>
        )}
      </div>

      {/* Sağ kısım: Sepet (Cart.js) */}
      <Cart />
    </div>
  );
}