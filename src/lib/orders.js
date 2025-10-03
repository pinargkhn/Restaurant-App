import { db, doc, setDoc, serverTimestamp, updateDoc } from "./firebase";

// 🔹 Yeni sipariş oluştur
export async function submitOrder({ tableId, items, total }) {
  const orderId = `${tableId}_${Date.now()}`; // masa + timestamp
  const ref = doc(db, "orders", orderId);

  await setDoc(ref, {
    tableId,
    items,
    total,
    status: "Yeni", // Yeni -> Hazırlanıyor -> Hazır -> Teslim Edildi
    createdAt: serverTimestamp(),
  });

  return orderId;
}

// 🔹 Sipariş durumunu güncelle
export async function updateOrderStatus(orderId, status) {
  const ref = doc(db, "orders", orderId);
  await updateDoc(ref, { status });
}
