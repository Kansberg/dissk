import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAqFrWYtDSCRYpTnHgVXRpuoYt8jDnu28c",
  authDomain: "dissk-d07b5.firebaseapp.com",
  projectId: "dissk-d07b5",
  storageBucket: "dissk-d07b5.firebasestorage.app",
  messagingSenderId: "571914541241",
  appId: "1:571914541241:web:e87bf9939dcd2a231a6368",
  measurementId: "G-5L0C5J1G4P"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
