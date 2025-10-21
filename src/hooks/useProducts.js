// src/hooks/useProducts.js
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * 🔹 Firebase'den ürünleri çeken, gruplayan ve yöneten Hook.
 */
export default function useProducts() {
  const [products, setProducts] = useState({}); // Kategoriye göre gruplandırılmış
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const q = query(collection(db, "products"));
        const snap = await getDocs(q);
        const rawProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Ürünleri kategoriye göre grupla
        const grouped = rawProducts.reduce((acc, product) => {
          // Varsayılan kategori 'Diğer'
          const category = product.category || "Diğer";
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(product);
          return acc;
        }, {});
        
        setProducts(grouped);

      } catch (error) {
        console.error("🔥 Ürünleri çekme hatası:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Gruplandırılmış veriden düz listeyi ve kategori isimlerini çıkar
  const allProducts = useMemo(() => Object.values(products).flat(), [products]);
  const categories = useMemo(() => Object.keys(products), [products]);

  return { products, allProducts, categories, loading };
}