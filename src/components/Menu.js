import { useCart } from "../context/CartContext";
import Cart from "./Cart";

export default function Menu() {
  const { addItem } = useCart();

  const products = [
    { id: 1, name: "Pizza", price: 120 },
    { id: 2, name: "Hamburger", price: 80 },
    { id: 3, name: "Lahmacun", price: 60 },
  ];

  return (
    <div className="flex">
      {/* Sol kısım: Menü listesi */}
      <div className="flex-1 p-6 max-w-2xl">
        <h2 className="text-2xl font-bold mb-4 text-center">Menü</h2>
        <ul className="space-y-3">
          {products.map((item) => (
            <li
              key={item.id}
              className="flex justify-between items-center p-4 bg-white rounded shadow"
            >
              <div className="flex flex-col">
                <span className="font-semibold">{item.name}</span>
                <span className="text-gray-600">{item.price} ₺</span>
              </div>
              <button
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={() => addItem(item)}
              >
                Sepete Ekle
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Sağ kısım: Sabit Sepet Paneli */}
      <Cart />
    </div>
  );
}
