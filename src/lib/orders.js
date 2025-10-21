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
 */
export async function submitOrder({ tableId, items, total, note = "", isModification = false }) { 
  try {
    const ordersRef = collection(db, "tables", tableId, "orders");

    const snap = await getDocs(ordersRef);
    const hasActive = snap.docs.some((d) => {
      const o = d.data() || {};
      return o.paymentStatus !== "Alındı" && o.status !== "Teslim Edildi";
    });

    const preparedItems = items.map(item => ({
        ...item,
        qty: Number(item.qty)
    }));

    const orderData = {
      tableId,
      items: preparedItems,
      total,
      status: isModification ? "Yeni" : "Yeni", 
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      newItemsAdded: hasActive, 
      paymentStatus: "Bekleniyor",
      note: note, // 🚀 NOTE BURAYA EKLENDİ!
    };

    const docRef = await addDoc(ordersRef, orderData);
    console.log(`🆕 Yeni sipariş oluşturuldu (${tableId}):`, docRef.id);
    return docRef.id;

  } catch (e) {
    console.error("❌ Sipariş oluşturulamadı:", e);
    throw e;
  }
}

/**
 * 🔹 Sipariş durumunu günceller
 */
export async function updateOrderStatus(tableId, orderId, newStatus) {
  try {
    const orderRef = doc(db, "tables", tableId, "orders", orderId);
    const updateData = {
      status: newStatus,
      updatedAt: serverTimestamp(),
      newItemsAdded: true,
    };
    if (newStatus === "Hazır") {
      updateData.readyAt = serverTimestamp();
    }
    await updateDoc(orderRef, updateData);
    console.log(`✅ ${tableId} - ${orderId} durumu '${newStatus}' olarak güncellendi.`);
  } catch (e) {
    console.error("❌ Sipariş durumu güncellenemedi:", e);
    throw e;
  }
}

/**
 * 🔹 Siparişi geçmişe taşır (ödeme alındığında)
 */
export async function moveToPastOrders(tableId, orderId, orderData) {
  try {
    const pastRef = doc(db, "tables", tableId, "pastOrders", orderId);
    await setDoc(pastRef, { ...orderData, movedAt: serverTimestamp() });
    const currentRef = doc(db, "tables", tableId, "orders", orderId);
    await deleteDoc(currentRef);
    console.log(`📦 ${tableId} - ${orderId} geçmiş siparişlere taşındı.`);
  } catch (e) {
    console.error("❌ Sipariş geçmişe taşınamadı:", e);
    throw e;
  }
}

/**
 * 🔹 Firestore’daki masanın cart alanını günceller
 */
export async function updateCart(tableId, items, total) {
  try {
    const ref = doc(db, "tables", tableId);
    await setDoc(ref, { cart: { items, total } }, { merge: true });
    console.log(`🛒 Cart güncellendi (${tableId})`);
  } catch (e) {
    console.error("❌ Cart güncellenemedi:", e);
  }
}