import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* Paste your Firebase web app config here (Project settings > Your apps). */
  const firebaseConfig = {
    apiKey: "AIzaSyARZqw91RNmiP2JolsKrsiGzJfdO75SDac",
    authDomain: "cards-f15ba.firebaseapp.com",
    projectId: "cards-f15ba",
    storageBucket: "cards-f15ba.firebasestorage.app",
    messagingSenderId: "335008809953",
    appId: "1:335008809953:web:ed7650506c86789477c8a0"
  };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
