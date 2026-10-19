// src/firebase.ts
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// >>> UDFYLD MED DINE NØGLER (dem du allerede brugte)
const firebaseConfig = {
  apiKey: "AIzaSyAqFrWYtDSCRYpTnHgVXRpuoYt8jDnu28c",
  authDomain: "dissk-d07b5.firebaseapp.com",
  projectId: "dissk-d07b5",
  storageBucket: "dissk-d07b5.firebasestorage.app",
  messagingSenderId: "571914541241",
  appId: "1:571914541241:web:e87bf9939dcd2a231a6368",
  measurementId: "G-5L0C5J1G4P",
};

// Explicit development-only switch: integration tests never use live user data.
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === "true";
export const app = initializeApp(useEmulators ? {
  apiKey: "demo", authDomain: "demo-dissk.firebaseapp.com", projectId: "demo-dissk",
  appId: "1:1:web:test",
} : firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(getFunctions(app, "europe-west1"), "127.0.0.1", 5001);
}
