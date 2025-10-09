// src/lib/orders.js
import { db } from "./firebase";
import {
  doc,
  setDoc,
  addDoc,
  collection,
  deleteDoc,
  serverTimestamp,
  updateDoc,
  getDocs,
} from "firebase/firestore";

// 🔹 Yeni sipariş oluştur veya mevcutu güncelle
export async function submitOrder({ tableId, items, total }) {
  console.log("🔥 submitOrder çağrıldı:", { tableId, items, total });

  const ordersRef = collection(db, "tables", tableId, "orders");
  const activeOrdersSnap = await getDocs(ordersRef);

  const existingOrderDoc = activeOrdersSnap.docs.find(
    (d) => d.data().status !== "Teslim Edildi"
  );

  if (existingOrderDoc) {
    console.log("♻️ Aktif sipariş bulundu, güncelleniyor...");
    const existing = existingOrderDoc.data();
    const mergedItems = [...existing.items];

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
      newItemsAdded: true,
    });

    return existingOrderDoc.id;
  }

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

// 🔹 Sipariş durumu güncelle
export async function updateOrderStatus(tableId, orderId, status) {
  const ref = doc(db, "tables", tableId, "orders", orderId);
  const updateData = { status };
  if (status === "Hazır") updateData.readyAt = serverTimestamp();
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

// 🔹 QR ödeme başlat (Render backend’ine yönlendirildi)
export async function startQrPayment({ tableId, orderId, amount, waiterUid }) {
  const API_BASE = "https://stripe-backend-xxxxx.onrender.com"; // 🔹 kendi Render URL’inle değiştir

  const res = await fetch(`${API_BASE}/create-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId, orderId, amount, waiterUid }),
  });

  if (!res.ok) throw new Error("Ödeme oturumu oluşturulamadı");

  const data = await res.json(); // { url, sessionId, provider }

  const ref = doc(db, "tables", tableId, "orders", orderId);
  await updateDoc(ref, {
    payment: {
      status: "pending",
      method: "qr",
      provider: data.provider || "stripe",
      sessionId: data.sessionId || null,
      amount,
      currency: "TRY",
      collectedBy: waiterUid || null,
      transactionId: null,
      paidAt: null,
    },
    updatedAt: serverTimestamp(),
  });

  return data;
}
