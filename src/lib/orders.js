import { db } from "./firebase";
import {
  doc,
  setDoc,
  addDoc,
  collection,
  deleteDoc,
  serverTimestamp,
  updateDoc,
  getDocs, // 🔹 aktif sipariş kontrolü için eklendi
} from "firebase/firestore";

// 🔹 Yeni sipariş oluşturma veya mevcut siparişi güncelleme
export async function submitOrder({ tableId, items, total }) {
  console.log("🔥 submitOrder çağrıldı:", { tableId, items, total });

  const ordersRef = collection(db, "tables", tableId, "orders");
  const activeOrdersSnap = await getDocs(ordersRef);

  // 🔸 Teslim edilmemiş siparişi bul
  const existingOrderDoc = activeOrdersSnap.docs.find(
    (d) => d.data().status !== "Teslim Edildi"
  );

  if (existingOrderDoc) {
    console.log("♻️ Aktif sipariş bulundu, mevcut sipariş güncelleniyor...");
    const existing = existingOrderDoc.data();
    const mergedItems = [...existing.items];

    // 🔸 Aynı üründen varsa miktar artır, yoksa yeni ekle
    items.forEach((newItem) => {
      const idx = mergedItems.findIndex((i) => i.id === newItem.id);
      if (idx >= 0) mergedItems[idx].qty += newItem.qty || 1;
      else mergedItems.push(newItem);
    });

    const newTotal = mergedItems.reduce(
      (sum, p) => sum + p.price * p.qty,
      0
    );

    await updateDoc(existingOrderDoc.ref, {
      items: mergedItems,
      total: newTotal,
      updatedAt: serverTimestamp(),
      newItemsAdded: true, // ⚠️ mutfak ve garson için uyarı göstergesi
    });

    console.log("✅ Mevcut sipariş güncellendi:", existingOrderDoc.id);
    return existingOrderDoc.id;
  }

  // 🆕 Yeni sipariş oluştur
  const orderData = {
    items,
    total,
    status: "Yeni",
    createdAt: serverTimestamp(),
    tableId,
    newItemsAdded: false,
  };

  const docRef = await addDoc(ordersRef, orderData);
  console.log("✅ Yeni sipariş oluşturuldu:", docRef.id);
  return docRef.id;
}

// 🔹 Sipariş durumunu güncelle (Hazır olduğunda readyAt ekle)
export async function updateOrderStatus(tableId, orderId, status) {
  const ref = doc(db, "tables", tableId, "orders", orderId);

  const updateData = { status };
  if (status === "Hazır") {
    updateData.readyAt = serverTimestamp();
  }

  // Durum değiştiğinde uyarı sıfırlansın
  updateData.newItemsAdded = false;

  await updateDoc(ref, updateData);
}

// 🔹 Siparişi geçmişe taşı
export async function moveToPastOrders(tableId, orderId, orderData) {
  const pastRef = doc(db, "tables", tableId, "pastOrders", orderId);
  await setDoc(pastRef, { ...orderData, movedAt: serverTimestamp() });
  await deleteDoc(doc(db, "tables", tableId, "orders", orderId));
}

// 🔹 Masa sepetini güncelle
export async function updateCart(tableId, items, total) {
  const ref = doc(db, "tables", tableId);
  await setDoc(ref, { cart: { items, total } }, { merge: true });
}
