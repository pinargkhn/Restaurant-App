import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 🔹 Firestore'dan role bilgisini çek
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const role = userDoc.exists() ? userDoc.data().role : null;

      // 🔹 Rolü localStorage’a kaydet
      localStorage.setItem("role", role);

      // 🔹 Rolüne göre yönlendir
      if (role === "admin") navigate("/qr");
      else if (role === "kitchen") navigate("/kitchen");
      else if (role === "waiter") navigate("/waiter");
      else setError("Yetkisiz kullanıcı.");

    } catch (err) {
      console.error("Giriş hatası:", err);
      setError("Giriş başarısız. Bilgileri kontrol edin.");
    }
  };

  return (
    <div className="p-6 max-w-sm mx-auto mt-10 border rounded shadow">
      <h2 className="text-2xl font-bold mb-4 text-center">Giriş Yap</h2>
      <form onSubmit={handleLogin} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 rounded"
        />
        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2 rounded"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Giriş Yap
        </button>
      </form>
      {error && <p className="text-red-600 mt-3">{error}</p>}
    </div>
  );
}
