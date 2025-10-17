// src/lib/firebase.js

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
  getDocs,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
// 🚀 YENİ İMPORTLAR: Firebase Storage
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"; 

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
const auth = getAuth(app); 
// 🚀 YENİ: Storage'ı başlat
const storage = getStorage(app, "gs://restaurant-app-c4414");

export {
  db,
  auth, 
  collection,
  collectionGroup,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  // 🚀 YENİ EXPORTLAR: Storage
  storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
};