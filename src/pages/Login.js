// src/pages/Login.js
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import './Login.css'; // 👈 YENİ CSS İÇE AKTAR

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
      if (role === "admin") navigate("/dashboard");
      else if (role === "kitchen") navigate("/kitchen");
      else if (role === "waiter") navigate("/waiter");
      else setError("Yetkisiz kullanıcı.");

    } catch (err) {
      console.error("Giriş hatası:", err);
      setError("Giriş başarısız. Bilgileri kontrol edin.");
    }
  };

  return (
    <div className="login-container">
      <h2 className="login-title">Giriş Yap</h2>
      <form onSubmit={handleLogin} className="login-form">
        <input
          type="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="form-input"
        />
        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="form-input"
        />
        <button
          type="submit"
          className="button button-primary"
        >
          Giriş Yap
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}