// src/pages/UserPanel.js
import { useState, useEffect } from "react";
import { 
  db, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc,
  // Yeni kullanıcı eklemek için auth (Firebase Auth) gerekir, 
  // ancak şimdilik sadece rol güncelleme ve silme ekliyoruz.
} from "../lib/firebase"; 

const ROLES = ["admin", "waiter", "kitchen", "none"]; // none = yetkisiz

export default function UserPanel({ onBack }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    // ---------------- Firestore Dinleme ----------------
    useEffect(() => {
        // 'users' koleksiyonunu dinle
        const unsub = onSnapshot(collection(db, "users"), (snap) => {
            setUsers(
                snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(u => u.id !== 'EXAMPLE_USER_ID') // Örnek/Anonim kullanıcıları filtreleyebilirsiniz
                .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email))
            );
            setLoading(false);
        }, (error) => {
            console.error("Kullanıcıları çekerken hata:", error);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // ---------------- Rol Güncelleme ----------------
    const handleRoleChange = async (userId, newRole) => {
        try {
            const userRef = doc(db, "users", userId);
            await setDoc(userRef, { role: newRole }, { merge: true });
            alert(`✅ Kullanıcı rolü başarıyla ${newRole} olarak güncellendi.`);
        } catch (error) {
            console.error("Rol güncelleme hatası:", error);
            alert("❌ Rol güncellenemedi.");
        }
    };
    
    // ---------------- Kullanıcı Silme ----------------
    const handleDeleteUser = async (userId, userEmail) => {
        if (window.confirm(`${userEmail} kullanıcısını silmek istediğinizden emin misiniz? Firestore kaydı silinecek.`)) {
            try {
                // Sadece Firestore'daki rol kaydını siliyoruz. 
                // Firebase Auth'tan silmek için sunucu tarafı işlem gerekir.
                await deleteDoc(doc(db, "users", userId)); 
                alert(`🗑️ ${userEmail} kullanıcısının rol kaydı silindi.`);
            } catch (error) {
                console.error("Kullanıcı silme hatası:", error);
                alert("❌ Kullanıcı silinemedi.");
            }
        }
    };
    
    if (loading) return <div className="p-6 max-w-4xl mx-auto">Kullanıcılar yükleniyor...</div>;

    // ---------------- Render ----------------
    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h2 className="text-3xl font-bold">👤 Kullanıcı Yönetim Paneli</h2>
                <button
                    onClick={onBack}
                    className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition"
                >
                    ← Ana Panele Dön
                </button>
            </div>
            
            <p className="mb-4 text-gray-600">
                ⚠️ **Not:** Bu panel, sadece kullanıcıların Firestore'daki rol kaydını yönetir. Firebase Auth'taki asıl kullanıcıyı veya şifreyi yönetmez.
            </p>

            <div className="space-y-3">
                {users.map((user) => (
                    <div
                        key={user.id}
                        className="flex justify-between items-center p-3 bg-white border rounded shadow-sm"
                    >
                        <div>
                            <span className="font-semibold">{user.email || user.id}</span>
                            <span className="text-sm text-gray-500 block">
                                Rol: {user.role || "none"}
                            </span>
                        </div>
                        
                        <div className="flex gap-2 items-center text-sm">
                            <select
                                value={user.role || 'none'}
                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                className="border p-1 rounded bg-white text-gray-800"
                            >
                                {ROLES.map(role => (
                                    <option key={role} value={role}>{role.toUpperCase()}</option>
                                ))}
                            </select>

                            <button
                                onClick={() => handleDeleteUser(user.id, user.email || user.id)}
                                className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                            >
                                Sil
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {!users.length && (
                <p className="text-gray-500 text-center mt-5">Kayıtlı kullanıcı rolü bulunmamaktadır.</p>
            )}
        </div>
    );
}