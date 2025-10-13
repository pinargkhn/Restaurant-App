import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  collectionGroup,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  getDocs, // 🔹 EKLENDİ
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth"; // 🔹 Authentication eklendi

// 🔐 .env dosyandaki Firebase bilgilerini kullan
const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID,
};

// 🔹 Firebase başlatma
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); // ✅ getAuth uygulamaya bağlandı

export {
  db,
  auth, // ✅ eklendi
  collection,
  collectionGroup,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  getDocs, // 🔹 EKLENDİ
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
};
