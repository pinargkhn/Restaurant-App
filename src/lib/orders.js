// src/lib/orders.js
import {
  db,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
} from "./firebase";

/**
 * 🔹 Yeni sipariş oluşturur (her zaman yeni belge olarak)
 * @param {string} tableId - Masa ID'si.
 * @param {Array} items - Sipariş ürünleri dizisi.
 * @param {number} total - Toplam fiyat.
 * @param {string} [note=""] - Müşteri/Garson tarafından eklenen sipariş notu.
 * @param {boolean} [isModification=false] - Garson düzenlemesi ise true olur.
 */
export async function submitOrder({ tableId, items, total, note = "", isModification = false }) {
  try {
    const ordersRef = collection(db, "tables", tableId, "orders");

    // Mevcut aktif sipariş var mı kontrolü (İlk sipariş için gerekli)
    const snap = await getDocs(ordersRef);
    const hasActive = snap.docs.some((d) => { // hasActive olarak düzeltildi
      const o = d.data() || {};
      return o.paymentStatus !== "Alındı" && o.status !== "Teslim Edildi";
    });

    const preparedItems = items.map(item => ({
        ...item,
        qty: Number(item.qty || 0) // qty yoksa 0 kabul et
    }));

    const orderData = {
      tableId,
      items: preparedItems,
      total: Number(total || 0), // total yoksa 0 kabul et
      // Durum: Yeni sipariş veya modifikasyon her zaman 'Yeni' başlar
      status: "Yeni", // isModification kontrolü kaldırıldı, her zaman Yeni
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // ----- GÜNCELLENDİ -----
      // Eğer bu bir modifikasyon ise VEYA daha önceden aktif sipariş varsa,
      // mutfağa uyarı gönder.
      newItemsAdded: isModification || hasActive, // 'hasActive' kullanıldı
      // -----------------------
      paymentStatus: "Bekleniyor",
      note: note || "", // Notu ekle
    };

    // Her zaman yeni bir belge ekliyoruz
    const docRef = await addDoc(ordersRef, orderData);
    console.log(`🆕 Yeni sipariş belgesi oluşturuldu (${tableId}, Modifikasyon: ${isModification}):`, docRef.id);
    return docRef.id;

  } catch (e) {
    console.error(`❌ Sipariş oluşturulamadı (${tableId}):`, e);
    throw e;
  }
}

/**
 * 🔹 Sipariş durumunu günceller (Kitchen kendi içinde yapıyor olabilir)
 */
export async function updateOrderStatus(tableId, orderId, newStatus) {
  try {
    const orderRef = doc(db, "tables", tableId, "orders", orderId);
    const updateData = {
      status: newStatus,
      updatedAt: serverTimestamp(),
      // Bu fonksiyon çağrıldığında uyarıyı tetiklemiyor
      // newItemsAdded: true, // Burası mutfağı tekrar uyarabilir, dikkatli kullanılmalı
    };
    if (newStatus === "Hazır") {
      updateData.readyAt = serverTimestamp();
      updateData.newItemsAdded = false; // Hazır olunca uyarıyı kaldır
    }
    await updateDoc(orderRef, updateData);
    console.log(`✅ ${tableId} - ${orderId} durumu '${newStatus}' olarak güncellendi.`);
  } catch (e) {
    console.error(`❌ Sipariş durumu güncellenemedi (${tableId}/${orderId}):`, e);
    throw e;
  }
}

/**
 * 🔹 Siparişi geçmişe taşır (ödeme alındığında)
 */
export async function moveToPastOrders(tableId, orderId, orderData) {
  try {
    const pastRef = doc(db, "tables", tableId, "pastOrders", orderId);
    await setDoc(pastRef, {
        ...orderData,
        paymentAt: orderData.paymentAt || serverTimestamp(), // Ödeme zamanı ekle
        movedAt: serverTimestamp() // Taşıma zamanı ekle
    });
    const currentRef = doc(db, "tables", tableId, "orders", orderId);
    await deleteDoc(currentRef);
    console.log(`📦 ${tableId} - ${orderId} geçmiş siparişlere taşındı.`);
  } catch (e) {
    console.error(`❌ Sipariş geçmişe taşınamadı (${tableId}/${orderId}):`, e);
    throw e;
  }
}

/**
 * 🔹 Firestore’daki masanın ana 'cart' alanını günceller (Müşteri sepeti için)
 */
export async function updateCart(tableId, items, total, note = null) { // Notu da güncelleyebilmek için parametre eklendi (opsiyonel)
  if (!tableId) return;
  try {
    const tableRef = doc(db, "tables", tableId);
    const cartData = { items: items || [], total: total || 0 };
    if (note !== null) {
        cartData.note = note || "";
    }
    // Sadece cart ve updatedAt alanlarını güncelle
    await setDoc(tableRef, { cart: cartData, updatedAt: serverTimestamp() }, { merge: true });
    console.log(`🛒 Ana Cart güncellendi (${tableId})`);
  } catch (e) {
    console.error(`❌ Ana Cart güncellenemedi (${tableId}):`, e);
  }
}