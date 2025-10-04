import { db } from "./firebase";
import {
  doc,
  setDoc,
  addDoc,
  collection,
  deleteDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

// 🔹 Yeni sipariş ekle (masa altındaki orders subcollection’a)
export async function submitOrder({ tableId, items, total }) {
  console.log("🔥 submitOrder çağrıldı:", { tableId, items, total });

  const orderData = {
    items,
    total,
    status: "Yeni",
    createdAt: serverTimestamp(),
    tableId, // 🔹 admin panelde kolay takip için ekledik
  };

  const ref = collection(db, "tables", tableId, "orders");
  const docRef = await addDoc(ref, orderData);

  console.log("✅ Firestore’a yazıldı:", docRef.id);

  // 🔹 Sepeti sıfırla
  await setDoc(
    doc(db, "tables", tableId),
    { cart: { items: [], total: 0 } },
    { merge: true }
  );

  return docRef.id;
}

// 🔹 Sipariş durumunu güncelle (Hazır olduğunda readyAt ekle)
export async function updateOrderStatus(tableId, orderId, status) {
  const ref = doc(db, "tables", tableId, "orders", orderId);

  // 🔹 Eğer sipariş “Hazır” yapılıyorsa readyAt timestamp’ini ekle
  const updateData = { status };
  if (status === "Hazır") {
    updateData.readyAt = serverTimestamp();
  }

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
