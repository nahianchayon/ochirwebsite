/**
 * OCHIR ATELIER — FIREBASE & CLOUD FIRESTORE CONFIGURATION (firebase-config.js)
 * 
 * Instructions to connect your Firebase Firestore:
 * 1. Go to https://console.firebase.google.com/ and create or select your project.
 * 2. In Firebase Console, go to "Build" -> "Firestore Database" -> click "Create database"
 *    (Start in "Test mode" or apply the provided firestore.rules).
 * 3. Go to Project Settings (gear icon) -> General -> Under "Your apps", click Web (</>).
 * 4. Register the app and copy your firebaseConfig object.
 * 5. Paste your config values into the FIREBASE_CONFIG object below.
 */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCQl7E92DEiObPffFy1SZ8r9QivoIdm1ac",
  authDomain: "ochir-b84d3.firebaseapp.com",
  projectId: "ochir-b84d3",
  storageBucket: "ochir-b84d3.firebasestorage.app",
  messagingSenderId: "297869677873",
  appId: "1:297869677873:web:f5a0aa5b885037f5d00c10",
  measurementId: "G-1DV3PDGYW0"
};

(function () {
  const config = window.FIREBASE_CONFIG;
  const isConfigured = Boolean(
    config &&
    config.projectId &&
    config.projectId !== "YOUR_PROJECT_ID" &&
    config.apiKey &&
    config.apiKey !== "YOUR_API_KEY"
  );

  window.OchirFirebase = {
    isConfigured: isConfigured,
    app: null,
    db: null,
    auth: null,
    collections: {
      PRODUCTS: "products",
      ORDERS: "orders",
      USERS: "users",
      CHAT: "chatMessages",
      SETTINGS: "settings",
      COUPONS: "coupons"
    }
  };

  if (isConfigured && typeof firebase !== "undefined") {
    try {
      const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      const db = firebase.firestore();
      const auth = typeof firebase.auth === "function" ? firebase.auth() : null;

      // Enable offline persistence if supported in browser
      try {
        db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
          if (err.code !== "failed-precondition" && err.code !== "unimplemented") {
            console.warn("Firestore persistence notice:", err);
          }
        });
      } catch (e) {}

      window.OchirFirebase.app = app;
      window.OchirFirebase.db = db;
      window.OchirFirebase.auth = auth;
      console.log("%c🔥 OCHIR: Connected to Cloud Firestore project [" + config.projectId + "]", "color: #FF5B00; font-weight: bold;");
    } catch (err) {
      console.error("🔥 Firebase initialization failed:", err);
      window.OchirFirebase.isConfigured = false;
    }
  } else {
    console.info(
      "%cℹ️ OCHIR: Firebase Firestore is in Standby mode. Enter your credentials in firebase-config.js to activate cloud sync.",
      "color: #86868b;"
    );
  }
})();

