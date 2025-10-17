import { Routes, Route, Navigate } from "react-router-dom";
import Menu from "./pages/Menu";
import Kitchen from "./pages/Kitchen";
import Waiter from "./pages/Waiter";
import Login from "./pages/Login";
import { CartProvider } from "./context/CartContext";
import AdminDashboard from "./pages/AdminDashboard";

// 🔹 Rol tabanlı koruma
function PrivateRoute({ children, allowedRole }) {
  const role = localStorage.getItem("role");
  return role === allowedRole ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <CartProvider>
      <Routes>
        {/* 🧾 Müşteri (QR üzerinden masa bağlantılı menü) */}
        <Route path="/" element={<Menu />} />

        {/* 🔐 Giriş ekranı */}
        <Route path="/login" element={<Login />} />

        {/* 👨‍🍳 Mutfak (sadece kitchen rolü) */}
        <Route
          path="/kitchen"
          element={
            <PrivateRoute allowedRole="kitchen">
              <Kitchen />
            </PrivateRoute>
          }
        />

        {/* 🧑‍💼 Garson (sadece waiter rolü) */}
        <Route
          path="/waiter"
          element={
            <PrivateRoute allowedRole="waiter">
              <Waiter />
            </PrivateRoute>
          }
        />

        {/* Yönetici Paneli (dashboard + masa & qr yönetimi entegre) */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute allowedRole="admin">
              <AdminDashboard />
            </PrivateRoute>
          }
        />

        {/* 🔁 Bilinmeyen URL’lerde login’e yönlendirme */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </CartProvider>
  );
}

export default App;
