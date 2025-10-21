// src/hooks/useProducts.js
import { useState, useEffect, useMemo } from "react";
// 👈 YENİ: onSnapshot ve orderBy import edildi
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * 🔹 Firebase'den ürünleri ve kategorileri GERÇEK ZAMANLI çeken, sıralayan ve yöneten Hook.
 */
export default function useProducts() {
  const [products, setProducts] = useState({}); // Kategoriye göre gruplandırılmış ve sıralanmış
  const [categories, setCategories] = useState([]); // Sıralı kategori isimleri
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let combinedData = { categories: [], products: [] }; // Geçici veri tutucu
    let categoriesLoaded = false;
    let productsLoaded = false;

    // --- Kategorileri Dinle ---
    const categoriesQuery = query(collection(db, "categories"), orderBy("order", "asc"));
    const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
      combinedData.categories = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        order: doc.data().order
      }));
      categoriesLoaded = true;
      if (productsLoaded) processData(combinedData.categories, combinedData.products); // Veriyi işle
    }, (error) => {
      console.error("🔥 Kategori dinleme hatası:", error);
      categoriesLoaded = true; // Hata olsa bile diğerinin bitmesini bekle
      if (productsLoaded) setLoading(false);
    });

    // --- Ürünleri Dinle ---
    // Ürünleri de kategori ve kendi sırasına göre çekmek performansı artırabilir.
    const productsQuery = query(collection(db, "products"));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      combinedData.products = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      productsLoaded = true;
      if (categoriesLoaded) processData(combinedData.categories, combinedData.products); // Veriyi işle
    }, (error) => {
      console.error("🔥 Ürün dinleme hatası:", error);
      productsLoaded = true; // Hata olsa bile diğerinin bitmesini bekle
      if (categoriesLoaded) setLoading(false);
    });

    // --- Veri İşleme Fonksiyonu ---
    const processData = (categoriesData, productsData) => {
      // Kategorileri isimlerine göre sıralı bir liste yap
      const orderedCategoryNames = categoriesData.map(cat => cat.name);

      // Ürünleri kategoriye göre grupla
      const grouped = productsData.reduce((acc, product) => {
        const category = product.category || "Diğer";
        if (!acc[category]) acc[category] = [];
        acc[category].push(product);
        return acc;
      }, {});

      // Her kategori içindeki ürünleri 'categoryOrder' alanına göre sırala
      for (const categoryName in grouped) {
        grouped[categoryName].sort((a, b) => {
          const orderA = a.categoryOrder ?? Infinity; // categoryOrder yoksa sona at
          const orderB = b.categoryOrder ?? Infinity;
          if (orderA === orderB) {
            return (a.name || '').localeCompare(b.name || ''); // İsim sırası
          }
          return orderA - orderB; // categoryOrder sırası
        });
      }

      // Gruplanmış ürünleri, Firestore'dan gelen kategori sırasına göre yeniden sırala
      const orderedGroupedProducts = {};
      orderedCategoryNames.forEach(catName => {
        if (grouped[catName]) {
          orderedGroupedProducts[catName] = grouped[catName];
        }
      });
      // Admin panelinde silinmiş ama üründe kalmış kategorileri (varsa) sona ekle
      Object.keys(grouped).forEach(catName => {
        if (!orderedGroupedProducts[catName]) {
          orderedGroupedProducts[catName] = grouped[catName];
        }
      });

      setCategories(Object.keys(orderedGroupedProducts)); // Sıralı kategori isimlerini state'e ata
      setProducts(orderedGroupedProducts); // Sıralı ve gruplu ürünleri state'e ata
      setLoading(false); // Veri işlendikten sonra yüklemeyi bitir
    };

    // --- Temizleme Fonksiyonu ---
    return () => {
      unsubscribeCategories();
      unsubscribeProducts();
    };
  }, []); // Sadece bileşen yüklendiğinde çalışır

  const allProducts = useMemo(() => Object.values(products).flat(), [products]);

  // products: Sıralı kategorilere göre gruplanmış, her grup kendi içinde sıralanmış ürünler
  // categories: Sıralı kategori isimleri listesi
  return { products, allProducts, categories, loading };
}