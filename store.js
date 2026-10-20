/**
 * OCHIR DATA & STATE ENGINE (store.js)
 * REST-Synchronized Client-Side Reactive State Layer.
 * Bridges Storefront (index.html) and Operations Center (admin.html) with server.js.
 */

const OCHIR_STORAGE_KEYS = {
  TOKEN: "ochir_auth_token_v3",
  USER: "ochir_current_user_v3",
  CART: "ochir_cart_v3",
  CHAT_SESSION: "ochir_chat_session_v3",
  RECENTLY_VIEWED: "ochir_recent_views_v3",
  WISHLIST: "ochir_guest_wishlist_v3"
};

// Browser cryptographic utilities for Firestore user accounts
async function hashPasswordBrowser(password, saltHex) {
  if (!saltHex) {
    if (window.crypto && window.crypto.getRandomValues) {
      const saltBytes = new Uint8Array(16);
      window.crypto.getRandomValues(saltBytes);
      saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    } else {
      saltHex = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
  }

  if (window.crypto && window.crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const data = enc.encode(saltHex + ":" + password);
      const hashBuf = await window.crypto.subtle.digest("SHA-256", data);
      const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
      return { hash: hashHex, salt: saltHex };
    } catch (e) {
      console.warn("Subtle crypto fallback:", e);
    }
  }
  return { hash: btoa(saltHex + ":" + password), salt: saltHex };
}

async function verifyPasswordBrowser(password, expectedHash, saltHex) {
  if (!expectedHash) return false;
  const res = await hashPasswordBrowser(password, saltHex);
  return res.hash === expectedHash;
}

class OchirStore {
  constructor() {
    this.listeners = new Set();
    this.baseUrl = window.location.origin;

    // Reactive cache
    this.token = localStorage.getItem(OCHIR_STORAGE_KEYS.TOKEN) || null;
    this.user = this._loadLocalUser();
    this.cart = this._loadLocalCart();
    this.products = [];
    this.adminProducts = [];
    this.orders = [];
    this.chatMessages = [];
    this.settings = {
      storeName: "Ochir Atelier",
      storeStatus: "operational",
      currency: "BDT",
      currencySymbol: "৳",
      whatsappNumber: "01335852121",
      whatsappPrefill: "Hello OCHIR, I need help with a product or order.",
      phone: "+880 1335 852121",
      email: "concierge@ochir.com",
      address: "Banani Atelier, Road 11, Dhaka, Bangladesh",
      deliveryChargeInside: 80,
      deliveryChargeOutside: 150,
      freeDeliveryThreshold: 5000,
      paymentMethods: {
        bkash: {
          enabled: true,
          number: "01335852121",
          type: "Personal / Merchant",
          instructions: "Send Money or Make Payment to 01335852121 via bKash App or *247#. Copy the Transaction ID (TrxID) and enter it with your bKash sender number below."
        },
        rocket: {
          enabled: true,
          number: "01335852121-8",
          type: "Personal",
          instructions: "Send Money to Rocket account 01335852121-8 via Rocket App or *322#. Enter your 12-digit Rocket sender phone and TrxID below."
        },
        cod: {
          enabled: true,
          instructions: "Cash on Delivery is available across Bangladesh. White-glove handover with parcel inspection before cash payment."
        }
      },
      bannerText: "Complimentary insured delivery across Bangladesh on orders over ৳5,000.",
      returnPolicy: "Every Ochir piece is backed by our 7-day inspection and lifetime craftsmanship guarantee."
    };

    this.firestoreUnsubscribes = [];

    // Initialize async state
    this.init();
  }

  isFirestoreReady() {
    return Boolean(
      window.OchirFirebase &&
      window.OchirFirebase.isConfigured &&
      window.OchirFirebase.db
    );
  }

  getFirestore() {
    return this.isFirestoreReady() ? window.OchirFirebase.db : null;
  }

  async init() {
    if (this.isFirestoreReady()) {
      this.initFirestoreRealtime();
    }
    await this.fetchSettings();
    if (this.token) {
      await this.verifySession();
    }
    await this.fetchProducts();
    if (this.cart.length > 0) {
      this.validateCart();
    }
  }

  initFirestoreRealtime() {
    const db = this.getFirestore();
    if (!db) return;

    // 1. Live products stream
    try {
      const unsubProds = db.collection("products").onSnapshot(
        (snapshot) => {
          const prods = [];
          snapshot.forEach((doc) => {
            prods.push({ id: doc.id, ...doc.data() });
          });
          if (prods.length > 0) {
            this.products = prods;
            this.adminProducts = prods;
            this.notify();
          }
        },
        (err) => console.warn("Firestore products stream notice:", err)
      );
      this.firestoreUnsubscribes.push(unsubProds);
    } catch (e) {}

    // 2. Live store settings stream
    try {
      const unsubSettings = db.collection("settings").doc("store").onSnapshot(
        (doc) => {
          if (doc.exists) {
            this.settings = { ...this.settings, ...doc.data() };
            this.notify();
          }
        },
        (err) => console.warn("Firestore settings stream notice:", err)
      );
      this.firestoreUnsubscribes.push(unsubSettings);
    } catch (e) {}

    // 3. Live user role stream
    this.listenToFirestoreUserRole();
  }

  listenToFirestoreUserRole() {
    if (!this.isFirestoreReady() || !this.user || !this.user.email) return;
    const db = this.getFirestore();
    const emailKey = this.user.email.toLowerCase().trim();

    try {
      const unsubUser = db.collection("users").doc(emailKey).onSnapshot(
        (doc) => {
          window.OchirFirestorePermissionDenied = false;
          if (doc.exists) {
            const data = doc.data();
            const firestoreRole = (data && data.role) ? data.role.toLowerCase().trim() : "user";
            
            // If the role in Firestore changed, update local user role!
            if (this.user.role !== firestoreRole) {
              console.log(`🔥 Firestore role change detected for ${emailKey}: ${firestoreRole}`);
              this.user.role = firestoreRole;
              localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));
              this.syncRoleWithServer(firestoreRole).catch(() => {});
              this.notify();

              if (typeof showOchirToast === "function") {
                if (firestoreRole === "admin" || firestoreRole === "administrator") {
                  showOchirToast("⚡ Admin role granted in Cloud Firestore! Admin Control Room is ready.", "success");
                } else {
                  showOchirToast("Role updated to User from Cloud Firestore.", "info");
                }
              }
            }
          } else {
            // Document does not exist in Firestore yet: create it with default 'user' role
            db.collection("users").doc(emailKey).set({
              id: this.user.id || "usr-" + Date.now(),
              email: emailKey,
              name: this.user.name || "Client",
              phone: this.user.phone || "",
              role: this.user.role || "user",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }, { merge: true }).then(() => {
              window.OchirFirestorePermissionDenied = false;
              console.log(`🔥 Registered user doc in Firestore: users/${emailKey}`);
            }).catch((err) => {
              console.warn("Could not create user doc in Firestore:", err);
              if (err && err.code === "permission-denied") {
                window.OchirFirestorePermissionDenied = true;
                if (typeof updateDossierRoleUI === "function") {
                  updateDossierRoleUI({ code: "permission-denied" });
                }
              }
            });
          }
        },
        (err) => {
          console.warn("Firestore user role stream notice:", err);
          if (err && err.code === "permission-denied") {
            window.OchirFirestorePermissionDenied = true;
            if (typeof updateDossierRoleUI === "function") {
              updateDossierRoleUI({ code: "permission-denied" });
            }
          }
        }
      );
      this.firestoreUnsubscribes.push(unsubUser);
    } catch (e) {
      console.warn("Firestore user stream exception:", e);
    }
  }

  async syncUserWithFirestore() {
    if (!this.isFirestoreReady() || !this.user || !this.user.email) {
      return { success: false, message: "Firestore not ready or user not logged in." };
    }
    const db = this.getFirestore();
    const emailKey = this.user.email.toLowerCase().trim();

    try {
      const docRef = db.collection("users").doc(emailKey);
      
      // Attempt read
      let existingData = null;
      try {
        const snap = await docRef.get();
        if (snap.exists) {
          existingData = snap.data();
        }
      } catch (getErr) {
        console.warn("Firestore get user doc notice:", getErr);
        if (getErr.code === "permission-denied") {
          window.OchirFirestorePermissionDenied = true;
          return {
            success: false,
            code: "permission-denied",
            message: "Cloud Firestore permission denied. Please publish read/write rules in Firebase Console."
          };
        }
      }

      if (existingData) {
        window.OchirFirestorePermissionDenied = false;
        const firestoreRole = existingData.role ? existingData.role.toLowerCase().trim() : "user";
        if (this.user.role !== firestoreRole) {
          console.log(`🔥 Synchronizing user role from Firestore: ${firestoreRole}`);
          this.user.role = firestoreRole;
          localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));
          this.syncRoleWithServer(firestoreRole).catch(() => {});
          this.notify();
        }
        return { success: true, role: firestoreRole, docId: emailKey, exists: true };
      } else {
        // Create document in Firestore
        const payload = {
          id: this.user.id || "usr-" + Date.now(),
          email: emailKey,
          name: this.user.name || "Client",
          phone: this.user.phone || "",
          role: (this.user.role === "admin" || this.user.role === "administrator") ? "admin" : "user",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        try {
          await docRef.set(payload, { merge: true });
          window.OchirFirestorePermissionDenied = false;
          console.log(`🔥 Successfully created user document in Firestore: users/${emailKey}`);
          return { success: true, role: payload.role, docId: emailKey, created: true };
        } catch (setErr) {
          console.error("Firestore set user doc error:", setErr);
          if (setErr.code === "permission-denied") {
            window.OchirFirestorePermissionDenied = true;
            return {
              success: false,
              code: "permission-denied",
              message: "Cloud Firestore write permission denied. Your Firebase rules are blocking writes."
            };
          }
          throw setErr;
        }
      }
    } catch (err) {
      console.warn("Firestore user sync notice:", err);
      return { success: false, message: err.message, code: err.code };
    }
  }

  async syncRoleWithServer(role) {
    if (!this.token) return;
    try {
      await this.apiRequest("/api/auth/sync-role", "POST", { role });
    } catch (e) {}
  }

  /* ==========================================================================
     SUBSCRIPTIONS & EVENT DISPATCH
     ========================================================================== */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach((fn) => {
      try {
        fn(this);
      } catch (err) {
        console.error("Store listener error:", err);
      }
    });
  }

  /* ==========================================================================
     NETWORK REQUEST HELPER
     ========================================================================== */
  async apiRequest(endpoint, method = "GET", body = null) {
    const headers = {
      "Content-Type": "application/json"
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
      headers["X-Ochir-Token"] = this.token;
    }

    if (this.user && (this.user.role === "admin" || this.user.role === "administrator")) {
      headers["X-Ochir-Role"] = "admin";
    }

    const options = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, options);
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.warn(`Network error on ${endpoint}:`, err);
      return { ok: false, status: 0, data: { success: false, message: "Network connection error." } };
    }
  }

  /* ==========================================================================
     STORE SETTINGS
     ========================================================================== */
  async fetchSettings() {
    const res = await this.apiRequest("/api/settings");
    if (res.ok && res.data && res.data.settings) {
      this.settings = { ...this.settings, ...res.data.settings };
      this.notify();
    }
    return this.settings;
  }

  getSettings() {
    return this.settings;
  }

  async updateSettings(newSettings) {
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        await db.collection("settings").doc("store").set(newSettings, { merge: true });
        this.settings = { ...this.settings, ...newSettings };
        this.notify();
        return { success: true, settings: this.settings };
      } catch (err) {
        console.error("Firestore updateSettings error:", err);
      }
    }

    const res = await this.apiRequest("/api/admin/settings", "PUT", newSettings);
    if (res.ok && res.data && res.data.settings) {
      this.settings = { ...this.settings, ...res.data.settings };
      this.notify();
      return { success: true, settings: this.settings };
    }
    return { success: false, message: res.data.message || "Failed to save settings." };
  }

  /* ==========================================================================
     AUTHENTICATION & SESSIONS
     ========================================================================== */
  _loadLocalUser() {
    try {
      const u = localStorage.getItem(OCHIR_STORAGE_KEYS.USER);
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  isAuthenticated() {
    return !!this.token && !!this.user;
  }

  isAdmin() {
    return this.isAuthenticated() && (
      (this.user.role && (this.user.role.toLowerCase() === "admin" || this.user.role.toLowerCase() === "administrator")) ||
      this.user.email === "admin@ochir.com"
    );
  }

  canAccessAdmin() {
    return this.isAuthenticated() && (
      (this.user.role && (this.user.role.toLowerCase() === "admin" || this.user.role.toLowerCase() === "administrator")) ||
      this.user.email === "admin@ochir.com"
    );
  }

  getActiveRole() {
    if (!this.canAccessAdmin()) {
      return "customer";
    }
    const saved = localStorage.getItem("ochir_active_role_v3");
    // Default to 'customer' (User mode) unless admin was explicitly selected
    return saved === "admin" ? "admin" : "customer";
  }

  setActiveRole(role) {
    if (role === "admin") {
      if (!this.canAccessAdmin()) {
        return false;
      }
      localStorage.setItem("ochir_active_role_v3", "admin");
    } else {
      localStorage.setItem("ochir_active_role_v3", "customer");
    }
    this.notify();
    return true;
  }

  isAdminMode() {
    return this.canAccessAdmin() && this.getActiveRole() === "admin";
  }

  getCurrentUser() {
    return this.user;
  }

  async register({ email, password, name, phone }) {
    const emailKey = email.trim().toLowerCase();

    // 1. If Cloud Firestore is configured, attempt writing user account to Firestore
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        const docRef = db.collection("users").doc(emailKey);

        let existing = false;
        try {
          const snap = await docRef.get();
          if (snap.exists) existing = true;
        } catch (getErr) {
          if (getErr.code === "permission-denied") {
            window.OchirFirestorePermissionDenied = true;
          }
        }

        if (existing) {
          return { success: false, message: "An account with this email already exists." };
        }

        const { hash, salt } = await hashPasswordBrowser(password);
        const newUserDoc = {
          id: "usr-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
          email: emailKey,
          name: name.trim(),
          phone: phone ? phone.trim() : "",
          role: "customer",
          passwordHash: hash,
          passwordSalt: salt,
          verified: true,
          addresses: [],
          wishlist: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        try {
          await docRef.set(newUserDoc);
          window.OchirFirestorePermissionDenied = false;

          const safeUser = {
            id: newUserDoc.id,
            email: newUserDoc.email,
            name: newUserDoc.name,
            phone: newUserDoc.phone,
            role: newUserDoc.role,
            addresses: [],
            wishlist: []
          };

          this.token = "och_fs_" + Date.now();
          this.user = safeUser;
          localStorage.setItem(OCHIR_STORAGE_KEYS.TOKEN, this.token);
          localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));
          this.listenToFirestoreUserRole();
          this.notify();
          return { success: true, user: this.user };
        } catch (setErr) {
          if (setErr.code === "permission-denied") {
            window.OchirFirestorePermissionDenied = true;
            console.warn("Firestore rules currently locked; falling back to local session registration.");
          } else {
            throw setErr;
          }
        }
      } catch (err) {
        console.warn("Firestore registration notice:", err);
      }
    }

    // 2. Seamless fallback to local server registration (ensures customer is NEVER blocked)
    const res = await this.apiRequest("/api/auth/register", "POST", { email, password, name, phone });
    if (res.ok && res.data.success) {
      this.token = res.data.token;
      this.user = res.data.user;
      localStorage.setItem(OCHIR_STORAGE_KEYS.TOKEN, this.token);
      localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));
      this.notify();
      return { success: true, user: this.user };
    }
    return { success: false, message: res.data.message || "Registration failed." };
  }

  async login({ email, password }) {
    const emailKey = email.trim().toLowerCase();

    // 1. If Cloud Firestore is configured, authenticate directly against Firestore
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        const docRef = db.collection("users").doc(emailKey);
        const snap = await docRef.get();

        if (snap.exists) {
          const data = snap.data();
          let passwordValid = false;

          if (data.passwordHash && data.passwordSalt) {
            passwordValid = await verifyPasswordBrowser(password, data.passwordHash, data.passwordSalt);
          } else {
            // Document without browser hash (e.g. created via console): verify via server
            const sRes = await this.apiRequest("/api/auth/login", "POST", { email, password });
            passwordValid = sRes.ok && sRes.data.success;
          }

          if (!passwordValid) {
            return { success: false, message: "Invalid email or master password." };
          }

          const firestoreRole = data.role ? data.role.toLowerCase().trim() : "user";
          const safeUser = {
            id: data.id || "usr-" + Date.now(),
            email: data.email || emailKey,
            name: data.name || "Client",
            phone: data.phone || "",
            role: firestoreRole,
            addresses: data.addresses || [],
            wishlist: data.wishlist || []
          };

          this.token = "och_fs_" + Date.now();
          this.user = safeUser;
          localStorage.setItem(OCHIR_STORAGE_KEYS.TOKEN, this.token);
          localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));
          this.listenToFirestoreUserRole();
          this.notify();
          return { success: true, user: this.user };
        }
      } catch (err) {
        console.warn("Firestore login lookup error:", err);
      }
    }

    // 2. Fallback to server API (e.g. for dummy seed accounts admin@ochir.com / customer@ochir.com)
    const res = await this.apiRequest("/api/auth/login", "POST", { email, password });
    if (res.ok && res.data.success) {
      this.token = res.data.token;
      this.user = res.data.user;
      localStorage.setItem(OCHIR_STORAGE_KEYS.TOKEN, this.token);
      localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));
      if (this.isFirestoreReady()) {
        await this.syncUserWithFirestore();
        this.listenToFirestoreUserRole();
      }
      this.notify();
      return { success: true, user: this.user };
    }
    return { success: false, message: res.data.message || "Invalid credentials." };
  }

  async verifySession() {
    const savedUser = localStorage.getItem(OCHIR_STORAGE_KEYS.USER);
    if (!savedUser) return;

    try {
      this.user = JSON.parse(savedUser);
      if (this.isFirestoreReady() && this.user && this.user.email) {
        const db = this.getFirestore();
        const emailKey = this.user.email.toLowerCase().trim();
        try {
          const snap = await db.collection("users").doc(emailKey).get();
          if (snap.exists) {
            const data = snap.data();
            this.user = {
              ...this.user,
              id: data.id || this.user.id,
              name: data.name || this.user.name,
              phone: data.phone || this.user.phone,
              role: data.role ? data.role.toLowerCase().trim() : (this.user.role || "user"),
              addresses: data.addresses || this.user.addresses || [],
              wishlist: data.wishlist || this.user.wishlist || []
            };
            localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));
          }
        } catch (e) {}
        this.listenToFirestoreUserRole();
        this.notify();
        return;
      }
    } catch (e) {
      console.warn("verifySession parse error:", e);
    }

    // Fallback to server session check
    const res = await this.apiRequest("/api/auth/me");
    if (res.ok && res.data.success) {
      this.user = res.data.user;
      localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));
      this.listenToFirestoreUserRole();
      this.notify();
    } else if (!this.isFirestoreReady()) {
      this.logout();
    }
  }

  async updateProfile(profileData) {
    if (!this.user) return { success: false, message: "Not signed in." };
    this.user.name = profileData.name || this.user.name;
    if (profileData.phone !== undefined) this.user.phone = profileData.phone;
    localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));

    if (this.isFirestoreReady() && this.user.email) {
      try {
        const db = this.getFirestore();
        await db.collection("users").doc(this.user.email.toLowerCase().trim()).set({
          name: this.user.name,
          phone: this.user.phone,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn("Firestore updateProfile error:", err);
      }
    }
    this.notify();
    return { success: true, user: this.user };
  }

  async forgotPassword(email) {
    const res = await this.apiRequest("/api/auth/forgot-password", "POST", { email });
    return res.data;
  }

  async resetPassword({ email, code, newPassword }) {
    if (this.isFirestoreReady() && email) {
      try {
        const db = this.getFirestore();
        const emailKey = email.trim().toLowerCase();
        const { hash, salt } = await hashPasswordBrowser(newPassword);
        await db.collection("users").doc(emailKey).set({
          passwordHash: hash,
          passwordSalt: salt,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        return { success: true, message: "Password updated successfully in Firestore." };
      } catch (e) {}
    }
    const res = await this.apiRequest("/api/auth/reset-password", "POST", { email, code, newPassword });
    return res.data;
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem(OCHIR_STORAGE_KEYS.TOKEN);
    localStorage.removeItem(OCHIR_STORAGE_KEYS.USER);
    localStorage.removeItem("ochir_active_role_v3");
    this.notify();
  }

  /* ==========================================================================
     WISHLIST (Firestore-synced if signed in, localStorage fallback)
     ========================================================================== */
  getWishlist() {
    if (this.user && Array.isArray(this.user.wishlist)) {
      return this.user.wishlist;
    }
    try {
      const raw = localStorage.getItem(OCHIR_STORAGE_KEYS.WISHLIST);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  isInWishlist(productId) {
    const list = this.getWishlist();
    return list.includes(productId);
  }

  async toggleWishlist(productId) {
    if (this.isAuthenticated()) {
      if (!Array.isArray(this.user.wishlist)) this.user.wishlist = [];
      const idx = this.user.wishlist.indexOf(productId);
      const added = idx === -1;
      if (added) this.user.wishlist.push(productId);
      else this.user.wishlist.splice(idx, 1);

      localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));

      if (this.isFirestoreReady() && this.user.email) {
        try {
          const db = this.getFirestore();
          await db.collection("users").doc(this.user.email.toLowerCase().trim()).set({
            wishlist: this.user.wishlist,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (err) {
          console.warn("Firestore toggleWishlist error:", err);
        }
      }
      this.notify();
      return { success: true, wishlist: this.user.wishlist, added };
    }

    // Guest fallback
    let list = this.getWishlist();
    const idx = list.indexOf(productId);
    let added = false;
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(productId);
      added = true;
    }
    localStorage.setItem(OCHIR_STORAGE_KEYS.WISHLIST, JSON.stringify(list));
    this.notify();
    return { success: true, added };
  }

  /* ==========================================================================
     PRODUCTS DISCOVERY & CATALOG MANAGEMENT
     ========================================================================== */
  async fetchProducts(filters = {}) {
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        let query = db.collection("products");
        if (filters.category && filters.category !== "all") {
          query = query.where("category", "==", filters.category);
        }
        const snapshot = await query.get();
        const prods = [];
        snapshot.forEach((doc) => prods.push({ id: doc.id, ...doc.data() }));

        if (prods.length > 0) {
          // Client-side filtering for search & price range
          let filtered = prods;
          if (filters.search) {
            const q = filters.search.toLowerCase();
            filtered = filtered.filter(
              (p) =>
                (p.title && p.title.toLowerCase().includes(q)) ||
                (p.story && p.story.toLowerCase().includes(q)) ||
                (p.sku && p.sku.toLowerCase().includes(q))
            );
          }
          if (filters.minPrice !== undefined && !isNaN(filters.minPrice)) {
            filtered = filtered.filter((p) => (p.basePrice || 0) >= filters.minPrice);
          }
          if (filters.maxPrice !== undefined && !isNaN(filters.maxPrice)) {
            filtered = filtered.filter((p) => (p.basePrice || 0) <= filters.maxPrice);
          }
          if (filters.sort === "price-low") {
            filtered.sort((a, b) => (a.basePrice || 0) - (b.basePrice || 0));
          } else if (filters.sort === "price-high") {
            filtered.sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));
          } else {
            filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          }

          this.products = filtered;
          this.adminProducts = prods;
          this.notify();
          return this.products;
        }
      } catch (err) {
        console.warn("Firestore fetchProducts fallback:", err);
      }
    }

    const params = new URLSearchParams();
    if (filters.category && filters.category !== "all") params.append("category", filters.category);
    if (filters.subcategory && filters.subcategory !== "all") params.append("subcategory", filters.subcategory);
    if (filters.search) params.append("search", filters.search);
    if (filters.minPrice !== undefined) params.append("minPrice", filters.minPrice);
    if (filters.maxPrice !== undefined) params.append("maxPrice", filters.maxPrice);
    if (filters.sort) params.append("sort", filters.sort);

    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await this.apiRequest(`/api/products${qs}`);

    if (res.ok && res.data && Array.isArray(res.data.products)) {
      this.products = res.data.products;
    } else {
      this.products = [];
    }
    this.notify();
    return this.products;
  }

  getProducts() {
    return this.products;
  }

  getProductById(id) {
    return this.products.find((p) => p.id === id || p.slug === id);
  }

  // Admin Products
  async fetchAdminProducts() {
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        const snapshot = await db.collection("products").get();
        const prods = [];
        snapshot.forEach((doc) => prods.push({ id: doc.id, ...doc.data() }));
        if (prods.length > 0) {
          this.adminProducts = prods;
          this.notify();
          return this.adminProducts;
        }
      } catch (e) {}
    }

    const res = await this.apiRequest("/api/admin/products");
    if (res.ok && res.data && Array.isArray(res.data.products)) {
      this.adminProducts = res.data.products;
      this.notify();
      return this.adminProducts;
    }
    return [];
  }

  getAdminProducts() {
    return this.adminProducts.length > 0 ? this.adminProducts : this.products;
  }

  async saveProduct(productData) {
    const id = productData.id || "och-prod-" + Date.now();
    const cleanProduct = {
      ...productData,
      id,
      updatedAt: new Date().toISOString()
    };
    if (!cleanProduct.createdAt) cleanProduct.createdAt = new Date().toISOString();

    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        await db.collection("products").doc(id).set(cleanProduct, { merge: true });
        await this.fetchProducts();
        await this.fetchAdminProducts();
        return { success: true, product: cleanProduct };
      } catch (err) {
        console.error("Firestore saveProduct error:", err);
      }
    }

    const isEdit = !!productData.id && this.adminProducts.some((p) => p.id === productData.id);
    const endpoint = isEdit ? `/api/admin/products/${productData.id}` : "/api/admin/products";
    const method = isEdit ? "PUT" : "POST";

    const res = await this.apiRequest(endpoint, method, productData);
    if (res.ok && res.data.success) {
      await this.fetchProducts();
      await this.fetchAdminProducts();
      return { success: true, product: res.data.product };
    }
    return { success: false, message: res.data.message || "Could not save product." };
  }

  async deleteProduct(id) {
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        await db.collection("products").doc(id).delete();
        await this.fetchProducts();
        await this.fetchAdminProducts();
        return { success: true };
      } catch (err) {
        console.error("Firestore deleteProduct error:", err);
      }
    }

    const res = await this.apiRequest(`/api/admin/products/${id}`, "DELETE");
    if (res.ok && res.data.success) {
      await this.fetchProducts();
      await this.fetchAdminProducts();
      return { success: true };
    }
    return { success: false, message: res.data.message || "Could not remove product." };
  }

  async seedProducts() {
    const res = await this.apiRequest("/api/admin/products/seed", "POST");
    if (res.ok && res.data.success) {
      if (this.isFirestoreReady()) {
        await this.syncLocalDataToFirestore();
      }
      await this.fetchProducts();
      await this.fetchAdminProducts();
      return { success: true, count: res.data.count };
    }
    return { success: false, message: res.data.message || "Failed to seed products." };
  }

  async uploadProductImage(dataUrl, filename) {
    const res = await this.apiRequest("/api/admin/upload", "POST", { dataUrl, filename });
    return res.data;
  }

  /* ==========================================================================
     SHOPPING CART
     ========================================================================== */
  _loadLocalCart() {
    try {
      const c = localStorage.getItem(OCHIR_STORAGE_KEYS.CART);
      return c ? JSON.parse(c) : [];
    } catch (e) {
      return [];
    }
  }

  _persistCart() {
    try {
      localStorage.setItem(OCHIR_STORAGE_KEYS.CART, JSON.stringify(this.cart));
    } catch (e) {}
    this.notify();
  }

  getCart() {
    return this.cart;
  }

  addToCart(item) {
    const existing = this.cart.find(
      (i) => i.productId === item.productId && i.variant === item.variant && i.engraving === item.engraving
    );

    const addQty = Math.max(1, parseInt(item.qty, 10) || 1);

    if (existing) {
      existing.qty += addQty;
    } else {
      this.cart.push({
        productId: item.productId,
        title: item.title,
        basePrice: item.basePrice || item.price,
        variant: item.variant || "",
        engraving: item.engraving || "",
        image: item.image || "",
        qty: addQty
      });
    }

    this._persistCart();
    this.validateCart();
  }

  updateCartQty(index, delta) {
    if (this.cart[index]) {
      this.cart[index].qty += delta;
      if (this.cart[index].qty <= 0) {
        this.cart.splice(index, 1);
      }
      this._persistCart();
      this.validateCart();
    }
  }

  removeFromCart(index) {
    if (this.cart[index]) {
      this.cart.splice(index, 1);
      this._persistCart();
      this.validateCart();
    }
  }

  clearCart() {
    this.cart = [];
    this._persistCart();
  }

  async validateCart() {
    if (this.cart.length === 0) return { subtotal: 0, warnings: [] };

    const res = await this.apiRequest("/api/cart/validate", "POST", { items: this.cart });
    if (res.ok && res.data.success) {
      if (Array.isArray(res.data.items)) {
        // Sync validated items back into cart
        this.cart = res.data.items.map((vi) => ({
          productId: vi.productId,
          title: vi.title,
          basePrice: vi.basePrice,
          comparePrice: vi.comparePrice,
          variant: vi.variant,
          engraving: vi.engraving,
          image: vi.image,
          stock: vi.stock,
          qty: vi.qty
        }));
        this._persistCart();
      }
      return { subtotal: res.data.subtotal, warnings: res.data.warnings || [] };
    }
    return { subtotal: this.getCartSubtotal(), warnings: [] };
  }

  getCartSubtotal() {
    return this.cart.reduce((sum, item) => sum + (item.basePrice || item.price || 0) * (item.qty || 1), 0);
  }

  getCartCount() {
    return this.cart.reduce((count, item) => count + (item.qty || 1), 0);
  }

  /* ==========================================================================
     CHECKOUT & ORDER PLACEMENT
     ========================================================================== */
  async applyCoupon(code) {
    const subtotal = this.getCartSubtotal();
    const res = await this.apiRequest("/api/coupons/apply", "POST", { code, subtotal });
    return res.data;
  }

  async submitOrder(orderPayload) {
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        const orderId =
          "OCH-" +
          new Date().getFullYear() +
          "-" +
          Math.floor(1000 + Math.random() * 9000);

        const order = {
          id: orderId,
          ...orderPayload,
          status: "Pending Confirmation",
          paymentStatus:
            orderPayload.paymentMethod === "cod"
              ? "Pending COD Handover"
              : "Pending Manual Verification",
          createdAt: new Date().toISOString()
        };

        const batch = db.batch();
        const orderRef = db.collection("orders").doc(orderId);
        batch.set(orderRef, order);

        // Atomically decrement stock
        for (const item of order.items || []) {
          if (item.productId) {
            const prodRef = db.collection("products").doc(item.productId);
            batch.update(prodRef, {
              stock: firebase.firestore.FieldValue.increment(-item.qty)
            });
          }
        }

        await batch.commit();

        this.clearCart();
        return { success: true, order };
      } catch (err) {
        console.error("Firestore submitOrder error:", err);
      }
    }

    const res = await this.apiRequest("/api/orders", "POST", orderPayload);
    if (res.ok && res.data.success) {
      this.clearCart();
      return { success: true, order: res.data.order };
    }
    return { success: false, message: res.data.message || "Failed to confirm order." };
  }

  async getMyOrders() {
    if (this.isFirestoreReady() && this.user) {
      try {
        const db = this.getFirestore();
        const snapshot = await db
          .collection("orders")
          .where("customer.email", "==", this.user.email)
          .get();
        const ords = [];
        snapshot.forEach((doc) => ords.push({ id: doc.id, ...doc.data() }));
        ords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return ords;
      } catch (err) {
        console.warn("Firestore getMyOrders fallback:", err);
      }
    }

    const res = await this.apiRequest("/api/orders/my-orders");
    if (res.ok && res.data.success) {
      return res.data.orders;
    }
    return [];
  }

  async trackOrder(orderId, phone) {
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        const doc = await db.collection("orders").doc(orderId).get();
        if (doc.exists) {
          const ord = { id: doc.id, ...doc.data() };
          if (!phone || ord.customer?.phone?.includes(phone)) {
            return { success: true, order: ord };
          }
        }
      } catch (err) {
        console.warn("Firestore trackOrder fallback:", err);
      }
    }

    const params = new URLSearchParams({ orderId });
    if (phone) params.append("phone", phone);
    const res = await this.apiRequest(`/api/orders/track?${params.toString()}`);
    return res.data;
  }

  /* ==========================================================================
     ADMIN ORDER MANAGEMENT
     ========================================================================== */
  async fetchAdminOrders(filters = {}) {
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        let query = db.collection("orders");
        if (filters.status && filters.status !== "All") {
          query = query.where("status", "==", filters.status);
        }
        const snapshot = await query.get();
        const ords = [];
        snapshot.forEach((doc) => ords.push({ id: doc.id, ...doc.data() }));
        ords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        this.orders = ords;
        this.notify();
        return this.orders;
      } catch (err) {
        console.warn("Firestore fetchAdminOrders fallback:", err);
      }
    }

    const params = new URLSearchParams();
    if (filters.status && filters.status !== "All") params.append("status", filters.status);
    if (filters.search) params.append("search", filters.search);

    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await this.apiRequest(`/api/admin/orders${qs}`);

    if (res.ok && res.data && Array.isArray(res.data.orders)) {
      this.orders = res.data.orders;
      this.notify();
      return this.orders;
    }
    return [];
  }

  getOrders() {
    return this.orders;
  }

  async updateOrderStatus(orderId, statusData) {
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        await db.collection("orders").doc(orderId).set(statusData, { merge: true });
        await this.fetchAdminOrders();
        return { success: true };
      } catch (err) {
        console.error("Firestore updateOrderStatus error:", err);
      }
    }

    const res = await this.apiRequest(`/api/admin/orders/${orderId}/status`, "PUT", statusData);
    if (res.ok && res.data.success) {
      await this.fetchAdminOrders();
      return { success: true, order: res.data.order };
    }
    return { success: false, message: res.data.message || "Failed to update order status." };
  }

  async updateOrderPayment(orderId, paymentData) {
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        await db.collection("orders").doc(orderId).set(paymentData, { merge: true });
        await this.fetchAdminOrders();
        return { success: true };
      } catch (err) {
        console.error("Firestore updateOrderPayment error:", err);
      }
    }

    const res = await this.apiRequest(`/api/admin/orders/${orderId}/payment`, "PUT", paymentData);
    if (res.ok && res.data.success) {
      await this.fetchAdminOrders();
      return { success: true, order: res.data.order };
    }
    return { success: false, message: res.data.message || "Failed to update payment status." };
  }

  /* ==========================================================================
     CUSTOMER & ADMIN LIVE CHAT CONCIERGE
     ========================================================================== */
  getChatSessionId() {
    let sid = localStorage.getItem(OCHIR_STORAGE_KEYS.CHAT_SESSION);
    if (!sid) {
      sid = "och_chat_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
      localStorage.setItem(OCHIR_STORAGE_KEYS.CHAT_SESSION, sid);
    }
    return sid;
  }

  async fetchChatMessages() {
    const sid = this.getChatSessionId();
    let msgs = [];

    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        const snapshot = await db.collection("chatMessages").limit(100).get();
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.sessionId === sid) {
            msgs.push({ id: doc.id, ...data });
          }
        });
      } catch (e) {
        console.warn("Firestore fetchChatMessages notice:", e);
      }
    }

    if (msgs.length === 0) {
      const res = await this.apiRequest(`/api/chat/messages?sessionId=${sid}`);
      if (res.ok && res.data && Array.isArray(res.data.messages)) {
        msgs = res.data.messages;
      }
    }

    msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    this.chatMessages = msgs;
    return this.chatMessages;
  }

  async sendChatMessage(text, extraInfo = {}) {
    const sid = this.getChatSessionId();
    const payload = {
      sessionId: sid,
      sender: extraInfo.sender || "customer",
      senderName: (this.user && this.user.name) || extraInfo.name || "Valued Client",
      customerEmail: (this.user && this.user.email) || extraInfo.email || "",
      customerPhone: (this.user && this.user.phone) || extraInfo.phone || "",
      text,
      timestamp: new Date().toISOString(),
      readByAdmin: false,
      readByCustomer: true
    };

    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        await db.collection("chatMessages").add(payload);
      } catch (err) {
        console.warn("Firestore sendChatMessage notice:", err);
      }
    }

    // Also persist to server in-memory list so message is universally available
    this.apiRequest("/api/chat/send", "POST", payload).catch(() => {});
    await this.fetchChatMessages();
    return { success: true, message: payload };
  }

  /* ==========================================================================
     FIRESTORE 1-CLICK SYNCHRONIZATION ENGINE
     ========================================================================== */
  async syncLocalDataToFirestore() {
    if (!this.isFirestoreReady()) {
      return {
        success: false,
        message: "Firebase credentials not detected in firebase-config.js. Please enter your project keys first."
      };
    }

    try {
      const db = this.getFirestore();
      const batch = db.batch();

      // 1. Sync store settings
      const settingsRef = db.collection("settings").doc("store");
      batch.set(settingsRef, this.settings, { merge: true });

      // 2. Fetch current products from local API or memory
      let productsToSync = this.products;
      if (!productsToSync || productsToSync.length === 0) {
        const res = await this.apiRequest("/api/products");
        if (res.ok && res.data && Array.isArray(res.data.products)) {
          productsToSync = res.data.products;
        }
      }

      let count = 0;
      for (const prod of productsToSync || []) {
        const prodRef = db.collection("products").doc(prod.id);
        batch.set(prodRef, prod, { merge: true });
        count++;
      }

      // 3. Sync registered user accounts into Firestore users collection
      let userCount = 0;
      try {
        const usersRes = await this.apiRequest("/api/admin/users-list");
        if (usersRes.ok && usersRes.data && Array.isArray(usersRes.data.users)) {
          for (const u of usersRes.data.users) {
            if (u.email) {
              const uRef = db.collection("users").doc(u.email.toLowerCase().trim());
              batch.set(uRef, {
                id: u.id,
                email: u.email.toLowerCase().trim(),
                name: u.name || "Client",
                phone: u.phone || "",
                role: u.role || "user",
                updatedAt: new Date().toISOString()
              }, { merge: true });
              userCount++;
            }
          }
        }
      } catch (e) {}

      if (this.user && this.user.email) {
        const uRef = db.collection("users").doc(this.user.email.toLowerCase().trim());
        batch.set(uRef, {
          id: this.user.id || "usr-" + Date.now(),
          email: this.user.email.toLowerCase().trim(),
          name: this.user.name || "Client",
          phone: this.user.phone || "",
          role: (this.user.role === "admin" || this.user.role === "administrator") ? "admin" : "user",
          updatedAt: new Date().toISOString()
        }, { merge: true });
        userCount++;
      }

      await batch.commit();
      await this.fetchProducts();

      return {
        success: true,
        count,
        userCount,
        message: `Successfully synchronized ${count} products, store settings, and ${userCount} users directly to Cloud Firestore!`
      };
    } catch (err) {
      console.error("Firestore sync error:", err);
      return {
        success: false,
        message: `Firestore sync failed: ${err.message}. Please verify your Firestore Database is created and security rules allow writes.`
      };
    }
  }

  async fetchAdminChatConversations() {
    let allMessages = [];
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        const snap = await db.collection("chatMessages").limit(100).get();
        snap.forEach((doc) => {
          allMessages.push({ id: doc.id, ...doc.data() });
        });
      } catch (e) {
        console.warn("Firestore chatMessages fetch notice:", e);
      }
    }

    // Also fetch from server to merge
    try {
      const res = await this.apiRequest("/api/admin/chat/conversations");
      if (res.ok && res.data && Array.isArray(res.data.conversations)) {
        if (allMessages.length === 0) {
          return res.data.conversations;
        }
      }
    } catch (e) {}

    if (allMessages.length === 0) return [];

    // Group by sessionId
    const convMap = new Map();
    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    for (const msg of allMessages) {
      const sid = msg.sessionId || "default";
      if (!convMap.has(sid)) {
        convMap.set(sid, {
          sessionId: sid,
          customerName: msg.senderName || "Visitor",
          customerEmail: msg.customerEmail || "",
          customerPhone: msg.customerPhone || "",
          messages: [],
          unreadCount: 0,
          lastMessage: "",
          lastTimestamp: msg.timestamp
        });
      }
      const conv = convMap.get(sid);
      if (msg.sender === "customer") {
        if (msg.senderName && msg.senderName !== "Valued Client") conv.customerName = msg.senderName;
        if (msg.customerEmail) conv.customerEmail = msg.customerEmail;
        if (msg.customerPhone) conv.customerPhone = msg.customerPhone;
        if (!msg.readByAdmin) conv.unreadCount++;
      }
      conv.messages.push(msg);
      conv.lastMessage = msg.text;
      conv.lastTimestamp = msg.timestamp;
    }

    return Array.from(convMap.values()).sort(
      (a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp)
    );
  }

  async sendAdminChatReply(sessionId, text) {
    const replyPayload = {
      sessionId,
      sender: "admin",
      senderName: "OCHIR Concierge",
      text,
      timestamp: new Date().toISOString(),
      readByAdmin: true,
      readByCustomer: false
    };

    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        await db.collection("chatMessages").add(replyPayload);
      } catch (e) {
        console.warn("Firestore reply notice:", e);
      }
    }

    // Also notify server in-memory list
    this.apiRequest("/api/admin/chat/reply", "POST", { sessionId, text }).catch(() => {});
    return { success: true, message: replyPayload };
  }

  /* ==========================================================================
     USER & CLIENT MANAGEMENT (Admin Operations)
     ========================================================================== */
  async fetchAllUsers() {
    let usersMap = new Map();

    // 1. Fetch from Firestore if active
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        const snap = await db.collection("users").get();
        snap.forEach((doc) => {
          const data = doc.data();
          const email = (data.email || doc.id).toLowerCase().trim();
          usersMap.set(email, {
            id: data.id || doc.id,
            email,
            name: data.name || "Client",
            phone: data.phone || "",
            role: data.role ? data.role.toLowerCase().trim() : "customer",
            createdAt: data.createdAt || new Date().toISOString()
          });
        });
      } catch (e) {
        console.warn("Firestore fetchAllUsers notice:", e);
      }
    }

    // 2. Merge with server users list
    try {
      const res = await this.apiRequest("/api/admin/users-list");
      if (res.ok && res.data && Array.isArray(res.data.users)) {
        for (const u of res.data.users) {
          const email = (u.email || "").toLowerCase().trim();
          if (email && !usersMap.has(email)) {
            usersMap.set(email, {
              id: u.id,
              email,
              name: u.name || "Client",
              phone: u.phone || "",
              role: u.role ? u.role.toLowerCase().trim() : "customer",
              createdAt: u.createdAt || new Date().toISOString()
            });
          }
        }
      }
    } catch (e) {}

    const usersList = Array.from(usersMap.values());

    // 3. Compute orders count for each user
    const orders = this.orders || [];
    return usersList.map((u) => {
      const userOrders = orders.filter(
        (o) => o.customer && o.customer.email && o.customer.email.toLowerCase() === u.email.toLowerCase()
      );
      return {
        ...u,
        ordersCount: userOrders.length
      };
    });
  }

  async updateUserRole(email, newRole) {
    const emailKey = email.toLowerCase().trim();
    const cleanRole = newRole.toLowerCase().trim();

    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        await db.collection("users").doc(emailKey).set({
          role: cleanRole,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        console.warn("Firestore updateUserRole notice:", e);
      }
    }

    // Also sync server
    await this.apiRequest("/api/admin/users/role", "POST", { email: emailKey, role: cleanRole });

    // If updating currently logged in user, refresh local session
    if (this.user && this.user.email && this.user.email.toLowerCase() === emailKey) {
      this.user.role = cleanRole;
      localStorage.setItem(OCHIR_STORAGE_KEYS.USER, JSON.stringify(this.user));
      this.notify();
    }
    return { success: true };
  }

  async deleteUser(email) {
    const emailKey = email.toLowerCase().trim();
    if (this.isFirestoreReady()) {
      try {
        const db = this.getFirestore();
        await db.collection("users").doc(emailKey).delete();
      } catch (e) {}
    }
    await this.apiRequest(`/api/admin/users/${encodeURIComponent(emailKey)}`, "DELETE");
    return { success: true };
  }

  /* ==========================================================================
     RECENTLY VIEWED ITEMS
     ========================================================================== */
  recordRecentView(productId) {
    try {
      let list = JSON.parse(localStorage.getItem(OCHIR_STORAGE_KEYS.RECENTLY_VIEWED) || "[]");
      list = list.filter((id) => id !== productId);
      list.unshift(productId);
      if (list.length > 8) list = list.slice(0, 8);
      localStorage.setItem(OCHIR_STORAGE_KEYS.RECENTLY_VIEWED, JSON.stringify(list));
    } catch (e) {}
  }

  getRecentlyViewedIds() {
    try {
      const list = JSON.parse(localStorage.getItem(OCHIR_STORAGE_KEYS.RECENTLY_VIEWED) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  /* ==========================================================================
     CURRENCY & NUMBER FORMATTING
     ========================================================================== */
  formatMoney(amount, overrideCurrency = null) {
    const curr = overrideCurrency || this.settings.currency || "BDT";
    if (curr === "USD") {
      const usdVal = Math.round((amount || 0) / 120);
      return `$${usdVal.toLocaleString()} USD`;
    }
    const val = Math.round(amount || 0);
    return `৳${val.toLocaleString()} BDT`;
  }
}

// Global Store Singleton
window.OchirStore = new OchirStore();
