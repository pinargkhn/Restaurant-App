// ✅ Firebase yapılandırması (Auth + Firestore dahil)

import { initializeApp } from "firebase/app";
import { getDoc } from "firebase/firestore";

import {
  getFirestore,
  serverTimestamp,
  addDoc,
  collectionGroup,
  collection,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
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

// 🔹 Firebase başlat
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app); // 🔹 Auth sistemini dışa aktar

// 🔹 Firestore fonksiyonlarını export et
export {
  serverTimestamp,
  addDoc,
  collection,
  collectionGroup,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  getDoc,
};
