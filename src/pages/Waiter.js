import { useEffect, useState } from "react";
import { db, collection, onSnapshot, doc } from "../lib/firebase";
import { getDoc, updateDoc } from "firebase/firestore";
import {
  submitOrder,
  updateOrderStatus,
  moveToPastOrders,
} from "../lib/orders";

export default function Waiter() {
  const [orders, setOrders] = useState([]);
  const [pastOrders, setPastOrders] = useState([]);
  const [showPast, setShowPast] = useState(false);

  // 🧾 Yeni sipariş oluşturma modalı
  const [showModal, setShowModal] = useState(false);
  const [tableIdInput, setTableIdInput] = useState("");
  const [cart, setCart] = useState([]);

  // ✏️ Sipariş düzenleme modalı
  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [editCart, setEditCart] = useState([]);

  // Menü ürünleri
  const products = [
    { id: 1, name: "Pizza", price: 120 },
    { id: 2, name: "Hamburger", price: 80 },
    { id: 3, name: "Lahmacun", price: 60 },
    { id: 4, name: "Ayran", price: 20 },
    { id: 5, name: "Kola", price: 25 },
  ];

  // 🔹 Siparişleri dinle
  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];

      tablesSnap.forEach((tableDoc) => {
        const tableId = tableDoc.id;
        const ordersRef = collection(db, "tables", tableId, "orders");
        const pastOrdersRef = collection(db, "tables", tableId, "pastOrders");

        const unsubOrders = onSnapshot(ordersRef, (ordersSnap) => {
          setOrders((prev) => {
            const filtered = prev.filter((o) => o.tableId !== tableId);
            const newOrders = ordersSnap.docs.map((d) => ({
              id: d.id,
              tableId,
              ...d.data(),
            }));
            return [...filtered, ...newOrders];
          });
        });

        const unsubPast = onSnapshot(pastOrdersRef, (pastSnap) => {
          setPastOrders((prev) => {
            const filtered = prev.filter((o) => o.tableId !== tableId);
            const newPast = pastSnap.docs.map((d) => ({
              id: d.id,
              tableId,
              ...d.data(),
            }));
            return [...filtered, ...newPast];
          });
        });

        unsubscribers.push(unsubOrders, unsubPast);
      });

      return () => unsubscribers.forEach((u) => u());
    });

    return () => unsubTables();
  }, []);

  const getBgColor = (status) =>
    status === "Hazır"
      ? "bg-green-200"
      : status === "Hazırlanıyor"
      ? "bg-yellow-100"
      : "bg-white";

  const handleDelivered = async (order) => {
    try {
      await updateOrderStatus(order.tableId, order.id, "Teslim Edildi");
      await moveToPastOrders(order.tableId, order.id, order);
      setOrders((prev) =>
        prev.filter((o) => !(o.id === order.id && o.tableId === order.tableId))
      );
    } catch (err) {
      console.error("Teslim işlemi hatası:", err);
    }
  };

  // 🧾 Yeni sipariş işlemleri
  const addToCart = (product) => {
    const existing = cart.find((p) => p.id === product.id);
    existing
      ? setCart(cart.map((p) => (p.id === product.id ? { ...p, qty: p.qty + 1 } : p)))
      : setCart([...cart, { ...product, qty: 1 }]);
  };
  const removeFromCart = (id) => setCart(cart.filter((p) => p.id !== id));
  const total = cart.reduce((sum, p) => sum + p.price * p.qty, 0);

  const handleSubmitOrder = async () => {
    const tableId = tableIdInput.trim();
    if (!tableId) return alert("Lütfen masa numarasını girin! (örnek: masa_3)");
    if (!cart.length) return alert("Sepet boş!");

    try {
      const tableRef = doc(db, "tables", tableId);
      const tableSnap = await getDoc(tableRef);
      if (!tableSnap.exists())
        return alert("❌ Bu masa sistemde kayıtlı değil. Lütfen admin panelinden oluşturun.");

      await submitOrder({ tableId, items: cart, total });
      alert(`✅ Sipariş başarıyla gönderildi (${tableId})`);
      setCart([]);
      setTableIdInput("");
      setShowModal(false);
    } catch (err) {
      console.error("Sipariş gönderme hatası:", err);
      alert("Sipariş gönderilemedi.");
    }
  };

  // ✏️ Düzenleme işlemleri
  const openEditModal = (order) => {
    setEditOrder(order);
    setEditCart(order.items || []);
    setShowEditModal(true);
  };
  const increaseQty = (id) =>
    setEditCart(editCart.map((p) => (p.id === id ? { ...p, qty: p.qty + 1 } : p)));
  const decreaseQty = (id) =>
    setEditCart(
      editCart
        .map((p) => (p.id === id ? { ...p, qty: Math.max(1, p.qty - 1) } : p))
        .filter((p) => p.qty > 0)
    );
  const removeFromEditCart = (id) =>
    setEditCart(editCart.filter((p) => p.id !== id));
  const addToEditCart = (product) => {
    const existing = editCart.find((p) => p.id === product.id);
    existing
      ? setEditCart(
          editCart.map((p) =>
            p.id === product.id ? { ...p, qty: p.qty + 1 } : p
          )
        )
      : setEditCart([...editCart, { ...product, qty: 1 }]);
  };

  const saveEditedOrder = async () => {
    if (!editOrder) return;
    if (!editCart.length) return alert("Siparişte en az bir ürün olmalı!");
    try {
      const ref = doc(db, "tables", editOrder.tableId, "orders", editOrder.id);
      const newTotal = editCart.reduce((sum, p) => sum + p.price * p.qty, 0);
      await updateDoc(ref, {
        items: editCart,
        total: newTotal,
        newItemsAdded: true,
      });
      alert("✅ Sipariş başarıyla güncellendi!");
      setShowEditModal(false);
      setEditOrder(null);
      setEditCart([]);
    } catch (err) {
      console.error("Düzenleme hatası:", err);
      alert("Sipariş güncellenemedi.");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">🧑‍🍳 Garson Paneli</h2>
        <button
          onClick={() => setShowModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          ➕ Yeni Sipariş Oluştur
        </button>
      </div>

      {/* 🔹 Aktif Siparişler */}
      {orders
        .filter((o) => o.status !== "Teslim Edildi")
        .map((o) => (
          <div key={o.id} className={`p-3 mb-3 border rounded ${getBgColor(o.status)}`}>
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">
                Masa: {o.tableId}
                {o.newItemsAdded && (
                  <span className="ml-2 text-red-600 font-semibold animate-pulse">
                    ⚠️ Yeni ürün eklendi
                  </span>
                )}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(o)}
                  className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                >
                  ✏️ Düzenle
                </button>
                <button
                  onClick={() => handleDelivered(o)}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Teslim Edildi
                </button>
              </div>
            </div>
            <p>
              <strong>Ürünler:</strong>{" "}
              {o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
            </p>
          </div>
        ))}

      {/* ✏️ DÜZENLEME MODALI */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg relative">
            <button
              onClick={() => {
                setShowEditModal(false);
                setEditOrder(null);
                setEditCart([]);
              }}
              className="absolute top-2 right-3 text-gray-600 hover:text-black text-2xl"
            >
              ✕
            </button>

            <h3 className="text-xl font-bold mb-4">
              Sipariş Düzenle (Masa: {editOrder.tableId})
            </h3>

            {editCart.map((p) => (
              <div key={p.id} className="flex justify-between mb-2">
                <span>{p.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decreaseQty(p.id)}
                    className="px-2 py-1 bg-gray-300 rounded"
                  >
                    ➖
                  </button>
                  <span>{p.qty}</span>
                  <button
                    onClick={() => increaseQty(p.id)}
                    className="px-2 py-1 bg-gray-300 rounded"
                  >
                    ➕
                  </button>
                  <span>{p.price * p.qty} ₺</span>
                  <button
                    onClick={() => removeFromEditCart(p.id)}
                    className="text-red-600 text-xs ml-1"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3 mt-4 mb-4">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="border rounded p-2 flex flex-col justify-between bg-gray-50"
                >
                  <h4 className="font-semibold">{p.name}</h4>
                  <p className="text-gray-600 text-sm">{p.price} ₺</p>
                  <button
                    onClick={() => addToEditCart(p)}
                    className="mt-2 bg-blue-600 text-white py-1 rounded hover:bg-blue-700"
                  >
                    Ekle
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center border-t pt-3">
              <strong>
                Toplam: {editCart.reduce((sum, p) => sum + p.price * p.qty, 0)} ₺
              </strong>
              <button
                onClick={saveEditedOrder}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 YENİ SİPARİŞ MODALI */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg relative">
            <button
              onClick={() => {
                setShowModal(false);
                setCart([]);
                setTableIdInput("");
              }}
              className="absolute top-2 right-3 text-gray-600 hover:text-black text-2xl"
            >
              ✕
            </button>

            <h3 className="text-xl font-bold mb-4">Yeni Sipariş Oluştur</h3>

            <input
              type="text"
              placeholder="Masa numarasını girin (ör: masa_3)"
              value={tableIdInput}
              onChange={(e) => setTableIdInput(e.target.value)}
              className="border p-2 rounded w-full mb-4"
            />

            <div className="grid grid-cols-2 gap-3 mb-4">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="border rounded p-2 flex flex-col justify-between bg-gray-50"
                >
                  <div>
                    <h4 className="font-semibold">{p.name}</h4>
                    <p className="text-gray-600 text-sm">{p.price} ₺</p>
                  </div>
                  <button
                    onClick={() => addToCart(p)}
                    className="mt-2 bg-blue-600 text-white py-1 rounded hover:bg-blue-700"
                  >
                    Sepete Ekle
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t pt-3">
              <h4 className="font-semibold mb-2">Sepet</h4>
              {cart.length === 0 && <p className="text-gray-500">Sepet boş.</p>}
              {cart.map((p) => (
                <div key={p.id} className="flex justify-between items-center mb-2">
                  <span>
                    {p.name} × {p.qty}
                  </span>
                  <div className="flex gap-2 items-center">
                    <span>{p.price * p.qty} ₺</span>
                    <button
                      onClick={() => removeFromCart(p.id)}
                      className="text-red-600 text-xs"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}

              {cart.length > 0 && (
                <div className="flex justify-between items-center mt-3">
                  <strong>Toplam: {total} ₺</strong>
                  <button
                    onClick={handleSubmitOrder}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    Siparişi Gönder
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
