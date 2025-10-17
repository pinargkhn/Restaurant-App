// src/hooks/useAdminAnalytics.js

import { useMemo } from "react";

// -------------------------------------------------------------------
// HELPER FONKSİYONLAR
// -------------------------------------------------------------------

const calculateCookingTime = (startCookingAt, readyAt) => {
  if (!startCookingAt?.seconds || !readyAt?.seconds) return null;
  const diff = readyAt.seconds - startCookingAt.seconds;
  if (diff <= 0) return null;
  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;
  return { minutes, seconds, totalSec: diff };
};

const average = (values) => {
  if (!values.length) return 0;
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
};


/**
 * 🔹 Yönetici paneli için tüm analizleri hesaplar ve döndürür.
 */
export default function useAdminAnalytics(orders) {
    
  // 7 gün öncesinin JavaScript Date objesini oluştur
  const sevenDaysAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.getTime() / 1000; 
  }, []);

  // 1. Ödemesi Alınmış Siparişler (7 GÜNLÜK FİLTRE)
  const paidOrders = useMemo(
    () =>
      orders.filter((o) => {
        const isPaid = o.paymentStatus === "Alındı" || (o.source === "pastOrders" && o.paymentStatus === "Alındı");
        if (!isPaid) return false;

        const timestamp = o.movedAt?.seconds || o.paymentAt?.seconds || 0;
        return timestamp >= sevenDaysAgo;
      }),
    [orders, sevenDaysAgo]
  );

  // 2. Hazırlanma Süresi Hesaplanan Siparişler (7 GÜNLÜK VERİ)
  const completedOrders = useMemo(
    () =>
      paidOrders
        .filter((o) => o.startCookingAt?.seconds && o.readyAt?.seconds)
        .map((o) => ({
          ...o,
          cookingTime: calculateCookingTime(o.startCookingAt, o.readyAt),
        }))
        .filter((o) => o.cookingTime),
    [paidOrders]
  );
    
  // 3. Genel İstatistikler (Aynı kalır)
  const stats = useMemo(() => {
    const durations = completedOrders.map((o) => o.cookingTime.totalSec);
    return {
      totalOrders: orders.length, 
      paidCount: paidOrders.length,
      avgPrepTime: (average(durations) / 60).toFixed(1),
    };
  }, [orders, completedOrders, paidOrders]);
  
  // 4. En Çok Satan Ürünler (Aynı kalır)
  const topProducts = useMemo(() => {
    const salesMap = {};
    paidOrders.forEach(order => {
      (order.items || []).forEach(item => {
        const id = item.id;
        const qty = Number(item.qty) || 0; 
        
        if (salesMap[id]) {
          salesMap[id].qty += qty;
        } else {
          salesMap[id] = { 
            id, 
            name: item.name, 
            qty,
            price: Number(item.price) || 0,
          };
        }
      });
    });

    return Object.values(salesMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5); 
  }, [paidOrders]);

  // 🚀 5. GÜNCELLENDİ: En Uzun Hazırlanma Süresi (Yemekler) - Top 10 ve Tarih Eklendi
  const topPrepTimeMeals = useMemo(() => {
    return completedOrders
      .filter(o => o.items.some(item => item.category === "Yemekler"))
      .sort((a, b) => b.cookingTime.totalSec - a.cookingTime.totalSec)
      .slice(0, 10) 
      .map(o => ({
          time: o.cookingTime,
          orderId: o.id,
          // 🚀 YENİ EKLEME
          orderDateTimestamp: o.movedAt?.seconds || o.paymentAt?.seconds || 0,
          itemsList: o.items.filter(item => item.category === "Yemekler").map(i => `${i.name} (${i.qty})`).join(", "),
      }));
  }, [completedOrders]);
  
  // 🚀 6. GÜNCELLENDİ: En Uzun Hazırlanma Süresi (Tatlılar) - Top 10 ve Tarih Eklendi
  const topPrepTimeDesserts = useMemo(() => {
    return completedOrders
      .filter(o => o.items.some(item => item.category === "Tatlılar"))
      .sort((a, b) => b.cookingTime.totalSec - a.cookingTime.totalSec)
      .slice(0, 10) 
      .map(o => ({
          time: o.cookingTime,
          orderId: o.id,
          // 🚀 YENİ EKLEME
          orderDateTimestamp: o.movedAt?.seconds || o.paymentAt?.seconds || 0,
          itemsList: o.items.filter(item => item.category === "Tatlılar").map(i => `${i.name} (${i.qty})`).join(", "),
      }));
  }, [completedOrders]);


  return { stats, paidOrders, completedOrders, topProducts, topPrepTimeMeals, topPrepTimeDesserts };
}