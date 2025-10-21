// src/pages/Menu.js
import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCart } from "../context/CartContext";
import useProducts from "../hooks/useProducts";
import Cart from "../components/Cart";
import './Menu.css'; // 👈 YENİ CSS İÇE AKTAR

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
      <div className="menu-loading-screen">
        Menü verileri yükleniyor...
      </div>
    );
  }

  if (!validTable) {
    return (
      <div className="menu-loading-screen error">
        Geçersiz masa bağlantısı!
      </div>
    );
  }

  const categoriesToRender = searchQuery.trim() ? Object.keys(filteredMenu) : CATEGORIES;


  return (
    <div className="menu-container">
      <main className="menu-content">
        
        <h2 className="menu-page-title">
          Dijital Menü (Masa: {tableId})
        </h2>
        
        {/* Sticky Header (Arama + Kategori Navigasyonu) */}
        <div className="sticky-header">
            
            {/* Kategori Navigasyonu (Kırmızı bar) */}
            {!searchQuery.trim() && (
                <nav className="category-nav">
                    {CATEGORIES.map((category) => (
                        <button
                        key={category}
                        onClick={() => {
                            scrollToCategory(category);
                            setActiveCategory(category); // ✅ TIKLAMADA VURGULAMAYI ANINDA GÜNCELLE
                        }} 
                        className={`category-nav-button ${
                            activeCategory === category ? 'active' : ''
                        }`}
                        >
                        {category.toUpperCase()}
                        </button>
                    ))}
                </nav>
            )}

            {/* Arama Çubuğu */}
            <div className="search-bar-wrapper">
                <input
                    type="text"
                    placeholder="Menüde Ara..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="search-input"
                />
            </div>
        </div>


        {/* Ürün Listeleme Alanı */}
        <div className="product-list-area">
            {categoriesToRender.length > 0 ? (
            categoriesToRender.map((category) => (
                <section key={category} className="category-section">
                
                {/* Başlık - Scrolling ve Intersection için reference noktası */}
                <h3
                    ref={!searchQuery.trim() ? (el) => (categoryRefs.current[category] = el) : null}
                    data-category={category} 
                    className="category-title-banner"
                    // ✅ CSS Hilesi: Yapışkan nav'ın içeriği kapatmasını engellemek için 150px offset
                    style={{ 
                        marginTop: searchQuery.trim() ? '0' : '-150px', 
                        paddingTop: searchQuery.trim() ? '0' : '150px' 
                    }} 
                >
                    {category}
                </h3>

                <ul className="product-items-grid">
                    {(searchQuery.trim() ? filteredMenu[category] : products[category]).map((item) => (
                    <li
                        key={item.id}
                        className="product-card"
                    >
                       {item.imageUrl && ( 
                            <img 
                                src={item.imageUrl} 
                                alt={item.name} 
                                className="product-image" 
                            />
                       )}

                       <div className="product-details">
                            <span className="product-name">{item.name}</span>
                            <span className="product-price">
                            {item.price} ₺
                            </span>
                       </div>
                        
                        <button
                            className="add-to-cart-button"
                            onClick={() => addItem(item)}
                        >
                            + EKLE
                        </button>
                    </li>
                    ))}
                </ul>
                </section>
            ))
            ) : (
                 <p className="empty-text">Aradığınız ürün bulunamadı.</p>
            )}
        </div>
      </main>

      {/* Sağ kısım: Sepet (Cart.js) */}
      <Cart />
    </div>
  );
}