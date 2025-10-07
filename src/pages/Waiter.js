import { useEffect, useState } from "react";
import { db, collection, onSnapshot, doc } from "../lib/firebase";
import {
  getDoc,
  updateDoc,
  collectionGroup,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import {
  submitOrder,
  updateOrderStatus,
  moveToPastOrders,
} from "../lib/orders";

export default function Waiter() {
  const [orders, setOrders] = useState([]);
  const [pastOrders, setPastOrders] = useState([]);
  const [showPastOrders, setShowPastOrders] = useState(false);
  const [searchTerm, setSearchTerm] = useState(""); // sadece sayı
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [cart, setCart] = useState([]);
  const [tableIdInput, setTableIdInput] = useState("");
  const [editOrder, setEditOrder] = useState(null);
  const [editCart, setEditCart] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const products = [
    { id: 1, name: "Pizza", price: 120 },
    { id: 2, name: "Hamburger", price: 80 },
    { id: 3, name: "Lahmacun", price: 60 },
    { id: 4, name: "Ayran", price: 20 },
    { id: 5, name: "Kola", price: 25 },
  ];

  // --- Helpers ---
  const getBgColor = (status) =>
    status === "Hazır"
      ? "bg-green-200"
      : status === "Hazırlanıyor"
      ? "bg-yellow-100"
      : "bg-white";

  const total = (arr) => arr.reduce((sum, p) => sum + p.price * p.qty, 0);

  // Masa ID'sinin sonundaki sayıyı al (ör: "masa_13" -> 13, "TABLE-7" -> 7)
  const getTableNumber = (id) => {
    if (!id) return null;
    const m = String(id).match(/(\d+)(?!.*\d)/);
    return m ? parseInt(m[1], 10) : null;
  };

  // Timestamp formatla (Date ya da Firestore Timestamp olabilir)
  const fmtTs = (ts) => {
    if (!ts) return "-";
    if (typeof ts === "object" && "seconds" in ts)
      return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  };

  // --- Firestore dinleyiciler ---
  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];
      tablesSnap.forEach((tableDoc) => {
        const tableId = tableDoc.id;
        const ordersRef = collection(db, "tables", tableId, "orders");
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
        unsubscribers.push(unsubOrders);
      });
      return () => unsubscribers.forEach((u) => u());
    });
    return () => unsubTables();
  }, []);

  // Geçmiş siparişler: son 24 saat
  useEffect(() => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const q = query(
      collectionGroup(db, "pastOrders"),
      where("deliveredAt", ">", twentyFourHoursAgo),
      orderBy("deliveredAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPastOrders(data);
    });
    return () => unsub();
  }, []);

  // --- Filtreler (sadece sayı) ---
  const searchNum =
    searchTerm.trim() === "" ? null : parseInt(searchTerm.trim(), 10);

  const filteredOrders =
    searchNum === null
      ? orders
      : orders.filter((o) => getTableNumber(o.tableId) === searchNum);

  const filteredPastOrders =
    searchNum === null
      ? pastOrders
      : pastOrders.filter((p) => getTableNumber(p.tableId) === searchNum);

  // --- Yeni sipariş ---
  const addToCart = (product) => {
    const existing = cart.find((p) => p.id === product.id);
    existing
      ? setCart(cart.map((p) => (p.id === product.id ? { ...p, qty: p.qty + 1 } : p)))
      : setCart([...cart, { ...product, qty: 1 }]);
  };
  const removeFromCart = (id) => setCart(cart.filter((p) => p.id !== id));

  const handleSubmitOrder = async () => {
    const tableId = tableIdInput.trim();
    if (!tableId) return alert("Lütfen masa numarasını girin!");
    if (!cart.length) return alert("Sepet boş!");
    try {
      const tableRef = doc(db, "tables", tableId);
      const snap = await getDoc(tableRef);
      if (!snap.exists()) return alert("❌ Bu masa sistemde kayıtlı değil.");
      await submitOrder({ tableId, items: cart, total: total(cart) });
      alert(`✅ Sipariş gönderildi (${tableId})`);
      setCart([]);
      setTableIdInput("");
      setShowModal(false);
    } catch (e) {
      alert("Hata: " + e.message);
    }
  };

  // --- Düzenleme ---
  const openEditModal = (order) => {
    setEditOrder(order);
    setEditCart(order.items || []);
    setShowEditModal(true);
  };
  const addToEditCart = (product) => {
    const ex = editCart.find((p) => p.id === product.id);
    ex
      ? setEditCart(
          editCart.map((p) => (p.id === product.id ? { ...p, qty: p.qty + 1 } : p))
        )
      : setEditCart([...editCart, { ...product, qty: 1 }]);
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

  const saveEditedOrder = async () => {
    if (isSaving) return;
    if (!editCart.length) return alert("Sipariş boş olamaz!");
    setIsSaving(true);
    try {
      const ref = doc(db, "tables", editOrder.tableId, "orders", editOrder.id);
      await updateDoc(ref, {
        items: editCart,
        total: total(editCart),
        newItemsAdded: true,
        updatedAt: new Date(),
      });
      alert("✅ Sipariş başarıyla güncellendi!");
      setShowEditModal(false);
      setEditOrder(null);
      setEditCart([]);
    } catch (e) {
      alert("Hata: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Teslim edildi
  const handleDelivered = async (order) => {
    try {
      await updateOrderStatus(order.tableId, order.id, "Teslim Edildi");
      await moveToPastOrders(order.tableId, order.id, {
        ...order,
        deliveredAt: new Date(),
      });
      alert(`✅ ${order.tableId} masası teslim edildi olarak işaretlendi`);
    } catch (err) {
      console.error("Teslim işlemi hatası:", err);
      alert("❌ Teslim durumu güncellenemedi.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Üst başlık + arama */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
        <h2 className="text-2xl font-bold">🧑‍🍳 Garson Paneli</h2>
        <div className="flex items-center gap-2 w-full md:w-auto relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="🔍 Masa numarası (örn: 3)"
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              setSearchTerm(val);
            }}
            className="border rounded p-2 w-full md:w-64 pr-8"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 text-gray-500 hover:text-black text-lg"
              aria-label="Temizle"
              title="Temizle"
            >
              ✕
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            ➕ Yeni Sipariş
          </button>
        </div>
      </div>

      {/* Aktif Siparişler */}
      <h3 className="text-xl font-semibold mb-2">Aktif Siparişler</h3>
      {filteredOrders.length === 0 ? (
        <p className="text-gray-500 mb-3">
          {searchNum !== null
            ? `Masa ${searchNum} için aktif sipariş bulunamadı.`
            : "Şu anda aktif sipariş bulunmuyor."}
        </p>
      ) : (
        filteredOrders.map((o) => (
          <div
            key={o.id}
            className={`p-3 border rounded mb-3 ${getBgColor(o.status)}`}
          >
            <div className="flex justify-between items-center">
              <p className="font-semibold">
                Masa: {o.tableId}
                {o.newItemsAdded && (
                  <span className="ml-2 text-red-600 font-semibold animate-pulse">
                    ⚠️ Yeni ürün eklendi
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(o)}
                  className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                >
                  ✏️ Düzenle
                </button>
                {o.status !== "Teslim Edildi" && (
                  <button
                    onClick={() => handleDelivered(o)}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    ✅ Teslim Edildi
                  </button>
                )}
              </div>
            </div>
            <p>
              <strong>Durum:</strong>{" "}
              <span
                className={`px-2 py-1 rounded ${
                  o.status === "Hazırlanıyor"
                    ? "bg-yellow-200"
                    : o.status === "Hazır"
                    ? "bg-green-200"
                    : "bg-gray-100"
                }`}
              >
                {o.status || "Hazırlanıyor"}
              </span>
            </p>
            <p>
              <strong>Ürünler:</strong>{" "}
              {o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
            </p>
          </div>
        ))
      )}

      {/* Geçmiş Siparişler (Toggle + Son 24 saat) */}
      <div className="mt-8">
        <button
          onClick={() => setShowPastOrders(!showPastOrders)}
          className="w-full flex justify-between items-center bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-md transition"
        >
          <span className="text-lg font-semibold">
            📜 Geçmiş Siparişler (Son 24 Saat)
          </span>
          <span className="text-xl">{showPastOrders ? "▲" : "▼"}</span>
        </button>

        <div
          className={`transition-all duration-300 overflow-hidden ${
            showPastOrders ? "max-h-[600px] mt-2" : "max-h-0"
          }`}
        >
          {filteredPastOrders.length === 0 ? (
            <p className="text-gray-500 mt-3 px-2">
              {searchNum !== null
                ? `Masa ${searchNum} için geçmiş sipariş bulunamadı.`
                : "Son 24 saatte teslim edilen sipariş yok."}
            </p>
          ) : (
            <div className="overflow-y-auto max-h-[500px] border rounded-lg p-3 bg-gray-50 mt-2">
              {filteredPastOrders.map((p) => (
                <div
                  key={p.id}
                  className="border-b border-gray-200 pb-2 mb-2 text-sm"
                >
                  <div className="flex justify-between">
                    <span className="font-semibold">Masa: {p.tableId}</span>
                    <span className="text-gray-600">{fmtTs(p.deliveredAt)}</span>
                  </div>
                  <p>
                    <strong>Ürünler:</strong>{" "}
                    {p.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
                  </p>
                  <p>
                    <strong>Toplam:</strong> {p.total} ₺
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ✏️ DÜZENLE MODAL (scroll + sticky footer) */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg relative max-h-[90vh] flex flex-col">
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

            <h3 className="text-xl font-bold mb-4 flex-shrink-0">
              Sipariş Düzenle (Masa: {editOrder.tableId})
            </h3>

            <div className="overflow-y-auto flex-1 pr-2">
              {editCart.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center mb-2 text-sm"
                >
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

              <h4 className="font-semibold mt-4 mb-2">Yeni Ürün Ekle</h4>
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
                      onClick={() => addToEditCart(p)}
                      className="mt-2 bg-blue-600 text-white py-1 rounded hover:bg-blue-700"
                    >
                      Ekle
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center mt-3 border-t pt-3 bg-white sticky bottom-0">
              <strong>Toplam: {total(editCart)} ₺</strong>
              <button
                onClick={saveEditedOrder}
                disabled={isSaving}
                className={`${
                  isSaving
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                } text-white px-4 py-2 rounded`}
              >
                {isSaving ? "Kaydediliyor..." : "💾 Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 YENİ SİPARİŞ MODAL (scroll + sticky footer) */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg relative max-h-[90vh] flex flex-col">
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

            <h3 className="text-xl font-bold mb-4 flex-shrink-0">
              Yeni Sipariş Oluştur
            </h3>

            <div className="overflow-y-auto flex-1 pr-2">
              <input
                type="text"
                placeholder="Masa ID (ör: masa_3)"
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
                {cart.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center mb-1 text-sm"
                  >
                    <span>
                      {p.name} × {p.qty}
                    </span>
                    <div className="flex items-center gap-2">
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
              </div>
            </div>

            <div className="flex justify-between items-center mt-3 border-t pt-3 bg-white sticky bottom-0">
              <strong>Toplam: {total(cart)} ₺</strong>
              <button
                onClick={handleSubmitOrder}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Siparişi Gönder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
