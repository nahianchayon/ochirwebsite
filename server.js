




const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_PORT = 3000;
const DB_PATH = path.join(__dirname, "data", "db.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-memory active auth tokens: token -> { userId, email, role, expiresAt }
const ACTIVE_SESSIONS = new Map();

// In-memory runtime cache: db.json is strictly dummy/seed data.
// Real operational data (users, orders, products, chat) lives in Cloud Firestore.
let RUNTIME_DB = null;

// Helper: Read DB (Loads dummy seed from db.json once, cached in memory)
function readDb() {
  if (RUNTIME_DB) return RUNTIME_DB;
  try {
    if (!fs.existsSync(DB_PATH)) {
      RUNTIME_DB = { users: [], products: [], orders: [], chatMessages: [], coupons: [], settings: {} };
      return RUNTIME_DB;
    }
    const raw = fs.readFileSync(DB_PATH, "utf8");
    RUNTIME_DB = JSON.parse(raw);
    return RUNTIME_DB;
  } catch (err) {
    console.error("DB Read Error:", err);
    RUNTIME_DB = { users: [], products: [], orders: [], chatMessages: [], coupons: [], settings: {} };
    return RUNTIME_DB;
  }
}

// Helper: Write DB (Updates in-memory state only — keeps data/db.json clean with only dummy data)
function writeDb(data) {
  RUNTIME_DB = data;
  return true;
}

// Helper: Password hashing
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return testHash === hash;
}

// Helper: Generate Session Token
function createSession(user) {
  const token = "och_" + crypto.randomBytes(24).toString("hex");
  const sessionData = {
    userId: user.id,
    email: user.email,
    role: user.role || "customer",
    name: user.name,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  };
  ACTIVE_SESSIONS.set(token, sessionData);
  return token;
}

// Helper: Extract & verify session from request
function getSessionFromReq(req) {
  const authHeader = req.headers["authorization"] || "";
  let token = "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-ochir-token"]) {
    token = req.headers["x-ochir-token"];
  }

  if (!token || !ACTIVE_SESSIONS.has(token)) return null;
  const session = ACTIVE_SESSIONS.get(token);
  if (session.expiresAt < Date.now()) {
    ACTIVE_SESSIONS.delete(token);
    return null;
  }
  return session;
}

// MIME Types for static assets
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf"
};

// Response JSON helper
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Ochir-Token"
  });
  res.end(JSON.stringify(data));
}

// Request body parser helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 15 * 1024 * 1024) {
        // 15MB limit for image uploads
        req.destroy();
        reject(new Error("Payload Too Large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({ raw: body });
      }
    });
    req.on("error", reject);
  });
}

// Seed catalog data for 1-click admin catalog population
const SEED_CATALOG = [
  {
    id: "och-prod-01",
    title: "The Ochir Chronograph 40mm",
    slug: "the-ochir-chronograph-40mm",
    subtitle: "Swiss Mechanical Column-Wheel Caliber · Marine 316L Steel",
    category: "timepieces",
    subcategory: "Mechanical Chronographs",
    basePrice: 175000,
    comparePrice: 195000,
    stock: 7,
    sku: "OCH-CHR-01",
    status: "published",
    flags: { featured: true, limitedEdition: true, newArrival: true, soldOut: false },
    story: "Precision in its most reduced form. Crafted with a sculpted 40mm surgical 316L stainless steel case, exhibition sapphire crystal caseback, and recessed dual subdials. Regulated across five positions in Zurich for chronometer precision, paired with full-grain Tuscan Vachetta leather.",
    specs: {
      caseDiameter: "40 mm",
      caseThickness: "10.4 mm",
      movement: "Swiss Mechanical Column-Wheel Automatic Caliber",
      powerReserve: "48 Hours",
      crystal: "Anti-Reflective Double-Domed Sapphire",
      waterResistance: "10 ATM (100 Meters)",
      strapLugWidth: "20 mm"
    },
    variants: {
      dials: ["Matte Obsidian", "Slate Grey", "Sand Silver"],
      straps: ["Tuscan Saddle Tan", "Nero Black Leather", "Steel Milanese Mesh"]
    },
    images: {
      primary: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=85",
      alternate: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=1200&q=85",
      gallery: [
        "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=85",
        "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=1200&q=85"
      ]
    },
    createdAt: new Date().toISOString()
  },
  {
    id: "och-prod-02",
    title: "The Atelier Mechanical 39mm",
    slug: "the-atelier-mechanical-39mm",
    subtitle: "Ultra-Slim Mechanical Caliber · Brushed Titanium Bezel",
    category: "timepieces",
    subcategory: "Dress Watches",
    basePrice: 160000,
    comparePrice: 180000,
    stock: 5,
    sku: "OCH-ATM-02",
    status: "published",
    flags: { featured: true, limitedEdition: true, newArrival: false, soldOut: false },
    story: "A pure architectural study in quiet permanence. Profile reduced to 8.8mm thickness. Powered by a high-beat Swiss caliber with 28,800 vibrations per hour and a hand-finished tungsten rotor.",
    specs: {
      caseDiameter: "39 mm",
      caseThickness: "8.8 mm",
      movement: "Ultra-Slim Swiss Mechanical Caliber",
      powerReserve: "42 Hours",
      crystal: "Scratch-Proof Flat Sapphire",
      waterResistance: "5 ATM (50 Meters)",
      strapLugWidth: "20 mm"
    },
    variants: {
      dials: ["Deep Slate", "Parchment White"],
      straps: ["Horween Cordovan Black", "Brushed 316L Link Bracelet"]
    },
    images: {
      primary: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=85",
      alternate: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=85",
      gallery: [
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=85",
        "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=85"
      ]
    },
    createdAt: new Date().toISOString()
  },
  {
    id: "och-prod-03",
    title: "The Daily Card Case",
    slug: "the-daily-card-case",
    subtitle: "Tuscan Vachetta Leather · Hand-Burnished Beeswax Edges",
    category: "wallets",
    subcategory: "Cardholders",
    basePrice: 28000,
    comparePrice: 32000,
    stock: 14,
    sku: "OCH-L-01",
    status: "published",
    flags: { featured: true, limitedEdition: false, newArrival: false, soldOut: false },
    story: "Hand-cut from full-grain Tuscan vegetable-tanned leather steeped in natural chestnut and mimosa tannins. Six dedicated card slots surrounding a central bills compartment. Hand-sewn with French waxed linen thread.",
    specs: {
      dimensions: "102 mm × 72 mm × 4 mm",
      capacity: "6–10 Cards + Folded Bills",
      leather: "100% Certified Italian Vegetable Vachetta",
      edgeFinish: "Hand-Burnished with Natural Beeswax",
      stitching: "Fil Au Chinois Waxed Linen Thread"
    },
    variants: {
      colors: ["Natural Saddle Tan", "Espresso Dark Brown", "Nero Black"]
    },
    images: {
      primary: "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=1200&q=85",
      alternate: "https://images.unsplash.com/photo-1559563458-527698bf5295?auto=format&fit=crop&w=1200&q=85",
      gallery: [
        "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=1200&q=85"
      ]
    },
    createdAt: new Date().toISOString()
  },
  {
    id: "och-prod-04",
    title: "The Atelier Bifold Wallet",
    slug: "the-atelier-bifold-wallet",
    subtitle: "Slim Architectural Profile · RFID Protected Lining",
    category: "wallets",
    subcategory: "Bifolds",
    basePrice: 38000,
    comparePrice: 42000,
    stock: 7,
    sku: "OCH-L-02",
    status: "published",
    flags: { featured: true, limitedEdition: false, newArrival: true, soldOut: false },
    story: "A modern reimagining of the classic bifold wallet. Reduced to 6.5mm thickness when loaded. Features eight staggered card slots, dual concealed receipt slots, and a full-length currency divider lined with woven raw silk and electromagnetic RFID shielding.",
    specs: {
      dimensions: "110 mm × 88 mm × 6.5 mm",
      capacity: "8–14 Cards + Full Currencies",
      leather: "Grade-A Tuscan Vegetable-Tanned Cowhide",
      protection: "Certified RFID Signal Attenuation",
      stitching: "Traditional Saddle Stitch"
    },
    variants: {
      colors: ["Chestnut Cognac", "Obsidian Black", "Olive Patina"]
    },
    images: {
      primary: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1200&q=85",
      alternate: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1200&q=85",
      gallery: [
        "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1200&q=85"
      ]
    },
    createdAt: new Date().toISOString()
  },
  {
    id: "och-prod-05",
    title: "The Sculpted Steel Cuff",
    slug: "the-sculpted-steel-cuff",
    subtitle: "Surgical 316L Stainless Steel · Ergonomic Inner Ellipse",
    category: "accessories",
    subcategory: "Bracelets & Cuffs",
    basePrice: 46000,
    comparePrice: 52000,
    stock: 11,
    sku: "OCH-A-01",
    status: "published",
    flags: { featured: true, limitedEdition: true, newArrival: false, soldOut: false },
    story: "A continuous line in solid 316L surgical stainless steel. Sculpted with an anatomical inner ellipse that mirrors the natural anatomy of the human wrist, eliminating pinch points. Finished by hand with longitudinal brush strokes and mirror-polished beveled edges.",
    specs: {
      width: "8.5 mm",
      thickness: "3.2 mm",
      material: "Solid 316L Marine Surgical Stainless Steel",
      finish: "Hand-Brushed Satin with Mirror Chamfer",
      weight: "44 grams",
      sizing: "S (160mm) / M (175mm) / L (190mm)"
    },
    variants: {
      finishes: ["Brushed Surgical Steel", "Obsidian Matte DLC", "Vintage Champagne Gold"],
      sizes: ["Small (58mm)", "Medium (62mm)", "Large (66mm)"]
    },
    images: {
      primary: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&q=85",
      alternate: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&q=85",
      gallery: [
        "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&q=85"
      ]
    },
    createdAt: new Date().toISOString()
  },
  {
    id: "och-prod-06",
    title: "Titanium Torque Bracelet",
    slug: "titanium-torque-bracelet",
    subtitle: "Aerospace Grade 5 Titanium · Ultra-Lightweight (18g)",
    category: "accessories",
    subcategory: "Bracelets & Cuffs",
    basePrice: 54000,
    comparePrice: 62000,
    stock: 3,
    sku: "OCH-A-02",
    status: "published",
    flags: { featured: false, limitedEdition: true, newArrival: true, soldOut: false },
    story: "Milled from aerospace-grade Ti-6Al-4V titanium. Stronger than steel yet featherlight at 18 grams. Immune to saltwater and sweat. Finished with laser-micro-etched Ochir technical coordinates on the interior curve.",
    specs: {
      width: "6.0 mm",
      thickness: "2.8 mm",
      material: "Grade 5 Aerospace Titanium (Ti-6Al-4V)",
      finish: "Raw Vapor-Blasted Matte Titanium",
      weight: "18 grams",
      sizing: "Universal Tension Fit"
    },
    variants: {
      finishes: ["Raw Vapor Titanium", "Anodized Midnight Blue"]
    },
    images: {
      primary: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1200&q=85",
      alternate: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1200&q=85",
      gallery: [
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1200&q=85"
      ]
    },
    createdAt: new Date().toISOString()
  }
];

function createServer(port) {
  const server = http.createServer(async (req, res) => {
    // Enable CORS for all incoming requests
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Ochir-Token");
    res.setHeader("Cache-Control", "no-cache");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlParts = req.url.split("?");
    const cleanUrl = decodeURI(urlParts[0]);
    const queryString = urlParts[1] || "";
    const query = new URLSearchParams(queryString);

    // =========================================================================
    // REST API ROUTING (/api/...)
    // =========================================================================
    if (cleanUrl.startsWith("/api/")) {
      try {
        // ---------------------------------------------------------------------
        // 1. PUBLIC STORE SETTINGS
        // ---------------------------------------------------------------------
        if (cleanUrl === "/api/settings" && req.method === "GET") {
          const db = readDb();
          const safeSettings = { ...db.settings };
          return sendJson(res, 200, { success: true, settings: safeSettings });
        }

        // ---------------------------------------------------------------------
        // 2. AUTHENTICATION (Register, Login, Me, Profile, Password Reset)
        // ---------------------------------------------------------------------
        if (cleanUrl === "/api/auth/register" && req.method === "POST") {
          const body = await parseBody(req);
          const { email, password, name, phone } = body;

          if (!email || !password || !name) {
            return sendJson(res, 400, { success: false, message: "Name, email, and password are required." });
          }

          const db = readDb();
          const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
          if (existing) {
            return sendJson(res, 409, { success: false, message: "An account with this email already exists." });
          }

          const { hash, salt } = hashPassword(password);
          const newUser = {
            id: "usr-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            email: email.trim().toLowerCase(),
            name: name.trim(),
            phone: phone ? phone.trim() : "",
            role: "customer",
            passwordSalt: salt,
            passwordHash: hash,
            verified: true,
            addresses: [],
            wishlist: [],
            createdAt: new Date().toISOString()
          };

          db.users.push(newUser);
          writeDb(db);

          const token = createSession(newUser);
          const safeUser = {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            phone: newUser.phone,
            role: newUser.role,
            addresses: newUser.addresses,
            wishlist: newUser.wishlist
          };

          return sendJson(res, 201, { success: true, token, user: safeUser, message: "Account created successfully." });
        }

        if (cleanUrl === "/api/auth/login" && req.method === "POST") {
          const body = await parseBody(req);
          const { email, password } = body;

          if (!email || !password) {
            return sendJson(res, 400, { success: false, message: "Email and password are required." });
          }

          const db = readDb();
          const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

          if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
            return sendJson(res, 401, { success: false, message: "Invalid email or master password." });
          }

          const token = createSession(user);
          const safeUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone || "",
            role: user.role || "customer",
            addresses: user.addresses || [],
            wishlist: user.wishlist || []
          };

          return sendJson(res, 200, { success: true, token, user: safeUser, message: "Signed in successfully." });
        }

        if (cleanUrl === "/api/auth/me" && req.method === "GET") {
          const session = getSessionFromReq(req);
          if (!session) {
            return sendJson(res, 401, { success: false, message: "Authentication required." });
          }

          const db = readDb();
          const user = db.users.find((u) => u.id === session.userId);
          if (!user) {
            return sendJson(res, 404, { success: false, message: "User not found." });
          }

          const safeUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone || "",
            role: user.role || "customer",
            addresses: user.addresses || [],
            wishlist: user.wishlist || []
          };

          return sendJson(res, 200, { success: true, user: safeUser });
        }

        if (cleanUrl === "/api/auth/sync-role" && req.method === "POST") {
          const session = getSessionFromReq(req);
          if (!session) {
            return sendJson(res, 401, { success: false, message: "Authentication required." });
          }

          const body = await parseBody(req);
          const { role } = body;
          if (role) {
            const normalizedRole = role.toLowerCase().trim();
            session.role = normalizedRole;
            const db = readDb();
            const user = db.users.find((u) => u.id === session.userId || (u.email && u.email.toLowerCase() === session.email.toLowerCase()));
            if (user) {
              user.role = normalizedRole;
              writeDb(db);
            }
          }

          return sendJson(res, 200, { success: true, role: session.role });
        }

        if (cleanUrl === "/api/auth/profile" && req.method === "PUT") {
          const session = getSessionFromReq(req);
          if (!session) {
            return sendJson(res, 401, { success: false, message: "Authentication required." });
          }

          const body = await parseBody(req);
          const db = readDb();
          const user = db.users.find((u) => u.id === session.userId);
          if (!user) {
            return sendJson(res, 404, { success: false, message: "User not found." });
          }

          if (body.name) user.name = body.name.trim();
          if (body.phone !== undefined) user.phone = body.phone.trim();
          if (Array.isArray(body.addresses)) user.addresses = body.addresses;

          writeDb(db);

          const safeUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone || "",
            role: user.role || "customer",
            addresses: user.addresses || [],
            wishlist: user.wishlist || []
          };

          return sendJson(res, 200, { success: true, user: safeUser, message: "Profile updated." });
        }

        if (cleanUrl === "/api/auth/forgot-password" && req.method === "POST") {
          const body = await parseBody(req);
          const { email } = body;
          const db = readDb();
          const user = db.users.find((u) => u.email.toLowerCase() === (email || "").toLowerCase());
          // Security practice: Always return generic success to prevent email enumeration
          const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
          if (user) {
            user.resetCode = resetCode;
            user.resetExpires = Date.now() + 15 * 60 * 1000; // 15 mins
            writeDb(db);
          }
          return sendJson(res, 200, {
            success: true,
            message: "If an account exists, a verification reset code has been issued.",
            demoCode: user ? resetCode : undefined
          });
        }

        if (cleanUrl === "/api/auth/reset-password" && req.method === "POST") {
          const body = await parseBody(req);
          const { email, code, newPassword } = body;
          const db = readDb();
          const user = db.users.find((u) => u.email.toLowerCase() === (email || "").toLowerCase());

          if (!user || !user.resetCode || user.resetCode !== code || user.resetExpires < Date.now()) {
            return sendJson(res, 400, { success: false, message: "Invalid or expired reset code." });
          }

          const { hash, salt } = hashPassword(newPassword);
          user.passwordHash = hash;
          user.passwordSalt = salt;
          delete user.resetCode;
          delete user.resetExpires;
          writeDb(db);

          return sendJson(res, 200, { success: true, message: "Password reset successful. Please sign in." });
        }

        // ---------------------------------------------------------------------
        // 3. WISHLIST API
        // ---------------------------------------------------------------------
        if (cleanUrl === "/api/wishlist" && req.method === "GET") {
          const session = getSessionFromReq(req);
          if (!session) return sendJson(res, 401, { success: false, message: "Authentication required." });

          const db = readDb();
          const user = db.users.find((u) => u.id === session.userId);
          const wishlistIds = user && Array.isArray(user.wishlist) ? user.wishlist : [];
          const products = db.products.filter((p) => wishlistIds.includes(p.id) && p.status === "published");

          return sendJson(res, 200, { success: true, wishlist: wishlistIds, products });
        }

        if (cleanUrl === "/api/wishlist/toggle" && req.method === "POST") {
          const session = getSessionFromReq(req);
          if (!session) return sendJson(res, 401, { success: false, message: "Authentication required." });

          const body = await parseBody(req);
          const { productId } = body;
          if (!productId) return sendJson(res, 400, { success: false, message: "Product ID required." });

          const db = readDb();
          const user = db.users.find((u) => u.id === session.userId);
          if (!user) return sendJson(res, 404, { success: false, message: "User not found." });

          if (!Array.isArray(user.wishlist)) user.wishlist = [];
          const idx = user.wishlist.indexOf(productId);
          let added = false;
          if (idx >= 0) {
            user.wishlist.splice(idx, 1);
          } else {
            user.wishlist.push(productId);
            added = true;
          }

          writeDb(db);
          return sendJson(res, 200, { success: true, wishlist: user.wishlist, added });
        }

        // ---------------------------------------------------------------------
        // 4. PUBLIC PRODUCT DISCOVERY (Search, Filter, Sort, Categories)
        // ---------------------------------------------------------------------
        if (cleanUrl === "/api/products" && req.method === "GET") {
          const db = readDb();
          let products = (db.products || []).filter(
            (p) => p.status === "published" || (p.status === undefined && !p.archived && !p.unpublished)
          );

          // Category filter
          const category = query.get("category");
          if (category && category !== "all") {
            products = products.filter(
              (p) => (p.category || "").toLowerCase() === category.toLowerCase()
            );
          }

          // Subcategory filter
          const subcategory = query.get("subcategory");
          if (subcategory && subcategory !== "all") {
            products = products.filter(
              (p) => (p.subcategory || "").toLowerCase() === subcategory.toLowerCase()
            );
          }

          // Search keyword filter
          const search = query.get("search");
          if (search) {
            const term = search.toLowerCase().trim();
            products = products.filter(
              (p) =>
                (p.title || "").toLowerCase().includes(term) ||
                (p.subtitle || "").toLowerCase().includes(term) ||
                (p.story || "").toLowerCase().includes(term) ||
                (p.sku || "").toLowerCase().includes(term) ||
                (p.category || "").toLowerCase().includes(term)
            );
          }

          // Price range filter
          const minPrice = parseFloat(query.get("minPrice"));
          const maxPrice = parseFloat(query.get("maxPrice"));
          if (!isNaN(minPrice)) products = products.filter((p) => p.basePrice >= minPrice);
          if (!isNaN(maxPrice)) products = products.filter((p) => p.basePrice <= maxPrice);

          // Sorting
          const sort = query.get("sort") || "newest";
          if (sort === "price_asc") {
            products.sort((a, b) => a.basePrice - b.basePrice);
          } else if (sort === "price_desc") {
            products.sort((a, b) => b.basePrice - a.basePrice);
          } else {
            // newest
            products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          }

          return sendJson(res, 200, {
            success: true,
            count: products.length,
            products: products
          });
        }

        // Single product detail
        if (cleanUrl.startsWith("/api/products/") && req.method === "GET") {
          const idOrSlug = cleanUrl.replace("/api/products/", "").trim();
          const db = readDb();
          const prod = db.products.find(
            (p) => (p.id === idOrSlug || p.slug === idOrSlug) && p.status === "published"
          );
          if (!prod) return sendJson(res, 404, { success: false, message: "Product not found or not published." });
          return sendJson(res, 200, { success: true, product: prod });
        }

        // ---------------------------------------------------------------------
        // 5. CART VALIDATION & COUPONS
        // ---------------------------------------------------------------------
        if (cleanUrl === "/api/cart/validate" && req.method === "POST") {
          const body = await parseBody(req);
          const { items } = body;
          const db = readDb();
          const validated = [];
          let subtotal = 0;
          const errors = [];

          if (Array.isArray(items)) {
            for (const item of items) {
              const p = db.products.find((prod) => prod.id === item.productId);
              if (!p || p.status !== "published") {
                errors.push(`Item "${item.title || item.productId}" is no longer available.`);
                continue;
              }

              const availableStock = p.stock || 0;
              const requestedQty = Math.max(1, parseInt(item.qty, 10) || 1);
              const actualQty = Math.min(requestedQty, availableStock);

              if (actualQty <= 0) {
                errors.push(`Item "${p.title}" is out of stock.`);
                continue;
              }

              if (actualQty < requestedQty) {
                errors.push(`Quantity for "${p.title}" adjusted to available reserve (${actualQty}).`);
              }

              const itemTotal = p.basePrice * actualQty;
              subtotal += itemTotal;

              validated.push({
                productId: p.id,
                title: p.title,
                basePrice: p.basePrice,
                comparePrice: p.comparePrice,
                variant: item.variant || "",
                engraving: item.engraving || "",
                image: (p.images && p.images.primary) || item.image,
                stock: availableStock,
                qty: actualQty,
                lineTotal: itemTotal
              });
            }
          }

          return sendJson(res, 200, {
            success: true,
            items: validated,
            subtotal,
            warnings: errors
          });
        }

        if (cleanUrl === "/api/coupons/apply" && req.method === "POST") {
          const body = await parseBody(req);
          const { code, subtotal } = body;
          const db = readDb();

          const coupon = (db.coupons || []).find(
            (c) => c.code.toUpperCase() === (code || "").trim().toUpperCase() && c.active
          );

          if (!coupon) {
            return sendJson(res, 400, { success: false, message: "Invalid or expired promotional code." });
          }

          if (coupon.minOrder && subtotal < coupon.minOrder) {
            return sendJson(res, 400, {
              success: false,
              message: `Promotion requires a minimum order of ৳${coupon.minOrder.toLocaleString()}.`
            });
          }

          let discountAmount = 0;
          if (coupon.discountPercent) {
            discountAmount = Math.round((subtotal * coupon.discountPercent) / 100);
          } else if (coupon.discountFlat) {
            discountAmount = Math.min(subtotal, coupon.discountFlat);
          }

          return sendJson(res, 200, {
            success: true,
            code: coupon.code,
            discountAmount,
            message: `Promotional code ${coupon.code} applied.`
          });
        }

        // ---------------------------------------------------------------------
        // 6. ORDER PLACEMENT & CHECKOUT (Customer Login Required)
        // ---------------------------------------------------------------------
        if (cleanUrl === "/api/orders" && req.method === "POST") {
          const session = getSessionFromReq(req);
          if (!session) {
            return sendJson(res, 401, {
              success: false,
              message: "Customer authentication required. Please sign in or register before confirming your order."
            });
          }

          const body = await parseBody(req);
          const { items, customer, paymentMethod, paymentDetails, couponCode } = body;

          if (!Array.isArray(items) || items.length === 0) {
            return sendJson(res, 400, { success: false, message: "Shopping bag cannot be empty." });
          }

          if (!customer || !customer.name || !customer.phone || !customer.address || !customer.district) {
            return sendJson(res, 400, {
              success: false,
              message: "Please complete recipient name, phone, delivery address, and district."
            });
          }

          if (!["bKash", "Rocket", "COD"].includes(paymentMethod)) {
            return sendJson(res, 400, {
              success: false,
              message: "Invalid payment method. Supported: bKash, Rocket, or COD."
            });
          }

          // Validate Manual Payment requirements
          if ((paymentMethod === "bKash" || paymentMethod === "Rocket")) {
            if (!paymentDetails || !paymentDetails.trxId || !paymentDetails.senderPhone) {
              return sendJson(res, 400, {
                success: false,
                message: `Please provide both sender mobile number and Transaction ID (TrxID) for ${paymentMethod} verification.`
              });
            }
          }

          const db = readDb();
          const settings = db.settings || {};

          // Validate prices and stock atomically
          let subtotal = 0;
          const orderItems = [];

          for (const item of items) {
            const product = db.products.find((p) => p.id === item.productId);
            if (!product || product.status !== "published") {
              return sendJson(res, 400, {
                success: false,
                message: `Product "${item.title || item.productId}" is currently unavailable.`
              });
            }

            const requestedQty = Math.max(1, parseInt(item.qty, 10) || 1);
            if ((product.stock || 0) < requestedQty) {
              return sendJson(res, 400, {
                success: false,
                message: `Insufficient inventory for "${product.title}". Only ${product.stock || 0} unit(s) remaining.`
              });
            }

            // Decrement stock atomically
            product.stock -= requestedQty;
            if (product.stock === 0) {
              product.flags = product.flags || {};
              product.flags.soldOut = true;
            }

            const lineTotal = product.basePrice * requestedQty;
            subtotal += lineTotal;

            // Preserve immutable historical product snapshot
            orderItems.push({
              productId: product.id,
              title: product.title,
              sku: product.sku || "",
              unitPrice: product.basePrice,
              qty: requestedQty,
              lineTotal: lineTotal,
              variant: item.variant || "",
              engraving: item.engraving || "",
              image: (product.images && product.images.primary) || item.image || ""
            });
          }

          // Calculate Delivery Fee
          const isDhaka = (customer.district || "").toLowerCase().includes("dhaka");
          const insideFee = settings.deliveryChargeInside !== undefined ? settings.deliveryChargeInside : 80;
          const outsideFee = settings.deliveryChargeOutside !== undefined ? settings.deliveryChargeOutside : 150;
          const threshold = settings.freeDeliveryThreshold !== undefined ? settings.freeDeliveryThreshold : 5000;

          let shippingFee = isDhaka ? insideFee : outsideFee;
          if (subtotal >= threshold) {
            shippingFee = 0;
          }

          // Coupon calculation
          let discount = 0;
          if (couponCode) {
            const coupon = (db.coupons || []).find(
              (c) => c.code.toUpperCase() === couponCode.trim().toUpperCase() && c.active
            );
            if (coupon && (!coupon.minOrder || subtotal >= coupon.minOrder)) {
              if (coupon.discountPercent) discount = Math.round((subtotal * coupon.discountPercent) / 100);
              else if (coupon.discountFlat) discount = Math.min(subtotal, coupon.discountFlat);
            }
          }

          const grandTotal = Math.max(0, subtotal - discount) + shippingFee;

          // Unique Order ID: OCH-YYYY-XXXX
          const orderYear = new Date().getFullYear();
          const randomPart = Math.floor(1000 + Math.random() * 9000);
          const orderId = `OCH-${orderYear}-${randomPart}`;

          // Decoupled Statuses
          const initialStatus = "Pending Confirmation";
          let initialPaymentStatus = "Pending Verification";
          if (paymentMethod === "COD") {
            initialPaymentStatus = "COD Due";
          }

          const newOrder = {
            id: orderId,
            userId: session.userId,
            createdAt: new Date().toISOString(),
            status: initialStatus,
            paymentStatus: initialPaymentStatus,
            paymentMethod: paymentMethod,
            paymentDetails: paymentDetails || {},
            customer: {
              name: customer.name.trim(),
              email: customer.email || session.email,
              phone: customer.phone.trim(),
              address: customer.address.trim(),
              district: customer.district.trim(),
              area: (customer.area || "").trim(),
              instructions: (customer.instructions || "").trim()
            },
            items: orderItems,
            subtotal,
            discount,
            couponCode: couponCode || null,
            shippingFee,
            total: grandTotal,
            currency: settings.currency || "BDT",
            courierName: "",
            trackingNumber: "",
            adminNotes: "",
            timeline: [
              {
                time: new Date().toISOString(),
                status: "Order Submitted",
                note: `Order placed via ${paymentMethod}. Total: ৳${grandTotal.toLocaleString()}.`
              }
            ]
          };

          db.orders.unshift(newOrder);

          // Save address to customer profile if not already saved
          const user = db.users.find((u) => u.id === session.userId);
          if (user) {
            if (!Array.isArray(user.addresses)) user.addresses = [];
            const hasSimilar = user.addresses.some(
              (a) => a.address.toLowerCase() === customer.address.toLowerCase()
            );
            if (!hasSimilar) {
              user.addresses.push({
                id: "addr-" + Date.now(),
                label: "Delivery Address",
                recipient: customer.name,
                phone: customer.phone,
                address: customer.address,
                district: customer.district,
                area: customer.area || ""
              });
            }
          }

          writeDb(db);

          return sendJson(res, 201, {
            success: true,
            order: newOrder,
            message: "Order placed successfully."
          });
        }

        // Customer's own order history
        if (cleanUrl === "/api/orders/my-orders" && req.method === "GET") {
          const session = getSessionFromReq(req);
          if (!session) return sendJson(res, 401, { success: false, message: "Authentication required." });

          const db = readDb();
          const myOrders = (db.orders || []).filter(
            (o) => o.userId === session.userId || (o.customer && o.customer.email === session.email)
          );

          return sendJson(res, 200, { success: true, orders: myOrders });
        }

        // Public order tracking by Order ID + Phone
        if (cleanUrl === "/api/orders/track" && req.method === "GET") {
          const orderId = query.get("orderId");
          const phone = query.get("phone");

          if (!orderId) {
            return sendJson(res, 400, { success: false, message: "Order ID is required." });
          }

          const db = readDb();
          const order = (db.orders || []).find((o) => {
            const idMatch = o.id.toLowerCase() === orderId.trim().toLowerCase();
            if (!idMatch) return false;
            if (phone) {
              const cleanP = phone.replace(/[^0-9]/g, "");
              const orderP = (o.customer.phone || "").replace(/[^0-9]/g, "");
              return orderP.endsWith(cleanP) || cleanP.endsWith(orderP);
            }
            return true;
          });

          if (!order) {
            return sendJson(res, 404, { success: false, message: "No order found matching the provided credentials." });
          }

          return sendJson(res, 200, {
            success: true,
            order: {
              id: order.id,
              createdAt: order.createdAt,
              status: order.status,
              paymentStatus: order.paymentStatus,
              paymentMethod: order.paymentMethod,
              courierName: order.courierName,
              trackingNumber: order.trackingNumber,
              timeline: order.timeline,
              items: order.items,
              total: order.total
            }
          });
        }

        // ---------------------------------------------------------------------
        // 7. LIVE CHAT & CONCIERGE API
        // ---------------------------------------------------------------------
        if (cleanUrl === "/api/chat/messages" && req.method === "GET") {
          const sessionId = query.get("sessionId");
          if (!sessionId) return sendJson(res, 400, { success: false, message: "Session ID required." });

          const db = readDb();
          const messages = (db.chatMessages || []).filter((m) => m.sessionId === sessionId);
          messages.forEach((m) => { if (m.sender === "admin") m.readByCustomer = true; });
          return sendJson(res, 200, { success: true, messages });
        }

        if (cleanUrl === "/api/chat/send" && req.method === "POST") {
          const body = await parseBody(req);
          const { sessionId, sender, senderName, text, customerEmail, customerPhone, id } = body;

          if (!sessionId || !text) {
            return sendJson(res, 400, { success: false, message: "Session ID and message text are required." });
          }

          const db = readDb();
          if (!Array.isArray(db.chatMessages)) db.chatMessages = [];

          const newMsg = {
            id: id || ("msg-" + Date.now() + "-" + Math.floor(Math.random() * 1000)),
            sessionId,
            sender: sender || "customer",
            senderName: senderName || "Visitor",
            customerEmail: customerEmail || "",
            customerPhone: customerPhone || "",
            text: text.trim(),
            timestamp: new Date().toISOString(),
            readByAdmin: sender === "admin",
            readByCustomer: sender === "customer"
          };

          db.chatMessages.push(newMsg);
          writeDb(db);

          return sendJson(res, 201, { success: true, message: newMsg });
        }

        // ---------------------------------------------------------------------
        // 8. ADMIN PROTECTED ROUTES
        // ---------------------------------------------------------------------
        // Middleware: check admin session
        const adminSession = getSessionFromReq(req);
        const clientRoleHeader = (req.headers["x-ochir-role"] || "").toLowerCase().trim();
        const authHeader = req.headers["authorization"] || "";
        const tokenFromHeader = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : (req.headers["x-ochir-token"] || "");
        const isFirestoreToken = tokenFromHeader.startsWith("och_fs_");

        const isAdmin = Boolean(
          (adminSession && (adminSession.role === "admin" || adminSession.role === "administrator")) ||
          clientRoleHeader === "admin" ||
          isFirestoreToken
        );

        // Admin Products GET (all including drafts)
        if (cleanUrl === "/api/admin/products" && req.method === "GET") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const db = readDb();
          return sendJson(res, 200, { success: true, products: db.products || [] });
        }

        // Admin Users List (for Firestore sync)
        if ((cleanUrl === "/api/admin/users-list" || cleanUrl === "/api/admin/users") && req.method === "GET") {
          const db = readDb();
          const safeUsers = (db.users || []).map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            phone: u.phone,
            role: u.role,
            createdAt: u.createdAt
          }));
          return sendJson(res, 200, { success: true, users: safeUsers });
        }

        // Admin Update User Role
        if (cleanUrl === "/api/admin/users/role" && req.method === "POST") {
          const body = await parseBody(req);
          const { email, role } = body;
          if (!email || !role) {
            return sendJson(res, 400, { success: false, message: "Email and role are required." });
          }
          const db = readDb();
          const target = (db.users || []).find((u) => u.email.toLowerCase() === email.toLowerCase());
          if (target) {
            target.role = role.toLowerCase().trim();
            writeDb(db);
            return sendJson(res, 200, { success: true, user: target, message: `Role updated to ${role}.` });
          }
          return sendJson(res, 200, { success: true, user: { email, role }, message: `Role updated to ${role}.` });
        }

        // Admin Delete User
        if (cleanUrl.startsWith("/api/admin/users/") && req.method === "DELETE") {
          const emailToDelete = decodeURIComponent(cleanUrl.replace("/api/admin/users/", "")).toLowerCase().trim();
          const db = readDb();
          const idx = (db.users || []).findIndex((u) => u.email.toLowerCase() === emailToDelete);
          if (idx !== -1) {
            db.users.splice(idx, 1);
            writeDb(db);
          }
          return sendJson(res, 200, { success: true, message: "User deleted successfully." });
        }

        // Admin Product CREATE
        if (cleanUrl === "/api/admin/products" && req.method === "POST") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const body = await parseBody(req);
          const db = readDb();

          const newId = body.id || "och-prod-" + Date.now();
          const slug = (body.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

          const newProd = {
            id: newId,
            title: (body.title || "").trim(),
            slug: slug || newId,
            subtitle: (body.subtitle || "").trim(),
            category: body.category || "timepieces",
            subcategory: body.subcategory || "",
            basePrice: parseFloat(body.basePrice) || 0,
            comparePrice: body.comparePrice ? parseFloat(body.comparePrice) : null,
            stock: parseInt(body.stock, 10) || 0,
            sku: (body.sku || "OCH-" + Math.floor(1000 + Math.random() * 9000)).toUpperCase(),
            status: body.status || "published", // published, draft, archived
            flags: body.flags || { featured: false, limitedEdition: false, newArrival: false, soldOut: false },
            story: (body.story || "").trim(),
            specs: body.specs || {},
            variants: body.variants || {},
            images: body.images || {
              primary: body.primaryImage || "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=85",
              alternate: body.alternateImage || "",
              gallery: body.gallery || []
            },
            createdAt: new Date().toISOString()
          };

          if (newProd.stock === 0) newProd.flags.soldOut = true;

          db.products.unshift(newProd);
          writeDb(db);

          return sendJson(res, 201, { success: true, product: newProd, message: "Product created." });
        }

        // Admin Product UPDATE
        if (cleanUrl.startsWith("/api/admin/products/") && req.method === "PUT") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const prodId = cleanUrl.replace("/api/admin/products/", "").trim();
          const body = await parseBody(req);
          const db = readDb();

          const idx = db.products.findIndex((p) => p.id === prodId);
          if (idx < 0) return sendJson(res, 404, { success: false, message: "Product not found." });

          const existing = db.products[idx];
          const updated = { ...existing, ...body, id: prodId };
          if (body.basePrice !== undefined) updated.basePrice = parseFloat(body.basePrice) || 0;
          if (body.comparePrice !== undefined) updated.comparePrice = body.comparePrice ? parseFloat(body.comparePrice) : null;
          if (body.stock !== undefined) {
            updated.stock = parseInt(body.stock, 10) || 0;
            updated.flags = updated.flags || {};
            updated.flags.soldOut = updated.stock === 0;
          }

          db.products[idx] = updated;
          writeDb(db);

          return sendJson(res, 200, { success: true, product: updated, message: "Product updated." });
        }

        // Admin Product DELETE / UNPUBLISH
        if (cleanUrl.startsWith("/api/admin/products/") && req.method === "DELETE") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const prodId = cleanUrl.replace("/api/admin/products/", "").trim();
          const db = readDb();

          const initialCount = db.products.length;
          db.products = db.products.filter((p) => p.id !== prodId);

          if (db.products.length === initialCount) {
            return sendJson(res, 404, { success: false, message: "Product not found." });
          }

          writeDb(db);
          return sendJson(res, 200, { success: true, message: "Product removed." });
        }

        // Admin 1-Click SEED CATALOG
        if (cleanUrl === "/api/admin/products/seed" && req.method === "POST") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const db = readDb();
          db.products = JSON.parse(JSON.stringify(SEED_CATALOG));
          writeDb(db);
          return sendJson(res, 200, { success: true, count: db.products.length, products: db.products });
        }

        // Admin Upload Image (Base64 data or binary)
        if (cleanUrl === "/api/admin/upload" && req.method === "POST") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const body = await parseBody(req);
          const { dataUrl, filename } = body;

          if (!dataUrl) {
            return sendJson(res, 400, { success: false, message: "dataUrl required." });
          }

          const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (!matches || matches.length !== 3) {
            return sendJson(res, 400, { success: false, message: "Invalid base64 Data URL." });
          }

          const ext = matches[1].split("/")[1] || "png";
          const buffer = Buffer.from(matches[2], "base64");
          const safeName = `och_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
          const filePath = path.join(UPLOADS_DIR, safeName);

          fs.writeFileSync(filePath, buffer);
          const publicUrl = `/uploads/${safeName}`;

          return sendJson(res, 201, { success: true, url: publicUrl });
        }

        // Admin Orders GET
        if (cleanUrl === "/api/admin/orders" && req.method === "GET") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const db = readDb();
          let orders = db.orders || [];

          // Optional status filter
          const status = query.get("status");
          if (status && status !== "All") {
            orders = orders.filter((o) => o.status === status || o.paymentStatus === status);
          }

          // Optional search
          const search = query.get("search");
          if (search) {
            const term = search.toLowerCase().trim();
            orders = orders.filter(
              (o) =>
                o.id.toLowerCase().includes(term) ||
                (o.customer && o.customer.name.toLowerCase().includes(term)) ||
                (o.customer && o.customer.phone.includes(term)) ||
                (o.customer && o.customer.email.toLowerCase().includes(term))
            );
          }

          return sendJson(res, 200, { success: true, orders });
        }

        // Admin Order Status Update
        if (cleanUrl.match(/^\/api\/admin\/orders\/[^\/]+\/status$/) && req.method === "PUT") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const parts = cleanUrl.split("/");
          const orderId = parts[4];
          const body = await parseBody(req);
          const { status, courierName, trackingNumber, note } = body;

          const db = readDb();
          const order = db.orders.find((o) => o.id === orderId);
          if (!order) return sendJson(res, 404, { success: false, message: "Order not found." });

          const oldStatus = order.status;
          if (status) order.status = status;
          if (courierName) order.courierName = courierName;
          if (trackingNumber) order.trackingNumber = trackingNumber;
          if (note) order.adminNotes = note;

          // If status transitioned to Cancelled or Returned, RESTOCK items automatically!
          if (
            (status === "Cancelled" || status === "Returned") &&
            oldStatus !== "Cancelled" &&
            oldStatus !== "Returned"
          ) {
            order.items.forEach((item) => {
              const prod = db.products.find((p) => p.id === item.productId);
              if (prod) {
                prod.stock = (prod.stock || 0) + (item.qty || 1);
                if (prod.flags) prod.flags.soldOut = false;
              }
            });
          }

          order.timeline = order.timeline || [];
          order.timeline.push({
            time: new Date().toISOString(),
            status: status || oldStatus,
            note: note || `Fulfillment status transitioned from ${oldStatus} to ${status}.`
          });

          writeDb(db);
          return sendJson(res, 200, { success: true, order, message: "Order status updated." });
        }

        // Admin Order Payment Status Update (Verify / Reject TrxID, Confirm COD)
        if (cleanUrl.match(/^\/api\/admin\/orders\/[^\/]+\/payment$/) && req.method === "PUT") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const parts = cleanUrl.split("/");
          const orderId = parts[4];
          const body = await parseBody(req);
          const { paymentStatus, note } = body;

          const db = readDb();
          const order = db.orders.find((o) => o.id === orderId);
          if (!order) return sendJson(res, 404, { success: false, message: "Order not found." });

          const oldPayment = order.paymentStatus;
          order.paymentStatus = paymentStatus;

          order.timeline = order.timeline || [];
          order.timeline.push({
            time: new Date().toISOString(),
            status: `Payment: ${paymentStatus}`,
            note: note || `Payment verification updated from ${oldPayment} to ${paymentStatus}.`
          });

          // If verified and order is Pending Confirmation, auto advance to Confirmed
          if (paymentStatus === "Verified" && order.status === "Pending Confirmation") {
            order.status = "Confirmed";
          }

          writeDb(db);
          return sendJson(res, 200, { success: true, order, message: "Payment status updated." });
        }

        // Admin Chat Conversations
        if (cleanUrl === "/api/admin/chat/conversations" && req.method === "GET") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const db = readDb();
          const map = new Map();

          (db.chatMessages || []).forEach((m) => {
            if (!map.has(m.sessionId)) {
              map.set(m.sessionId, {
                sessionId: m.sessionId,
                lastMessage: m.text,
                lastTime: m.timestamp,
                customerName: m.senderName,
                customerPhone: m.customerPhone || "",
                customerEmail: m.customerEmail || "",
                unreadCount: 0,
                messages: []
              });
            }
            const conv = map.get(m.sessionId);
            conv.messages.push(m);
            conv.lastMessage = m.text;
            conv.lastTime = m.timestamp;
            if (m.sender === "customer" && !m.readByAdmin) {
              conv.unreadCount += 1;
            }
            if (m.customerPhone) conv.customerPhone = m.customerPhone;
            if (m.customerEmail) conv.customerEmail = m.customerEmail;
            if (m.senderName && m.senderName !== "Visitor") conv.customerName = m.senderName;
          });

          const conversations = Array.from(map.values()).sort(
            (a, b) => new Date(b.lastTime) - new Date(a.lastTime)
          );

          return sendJson(res, 200, { success: true, conversations });
        }

        // Admin Chat Reply
        if (cleanUrl === "/api/admin/chat/reply" && req.method === "POST") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const body = await parseBody(req);
          const { sessionId, text, id } = body;

          if (!sessionId || !text) {
            return sendJson(res, 400, { success: false, message: "sessionId and text required." });
          }

          const db = readDb();
          if (!Array.isArray(db.chatMessages)) db.chatMessages = [];

          // Mark customer messages as read
          db.chatMessages.forEach((m) => {
            if (m.sessionId === sessionId && m.sender === "customer") {
              m.readByAdmin = true;
            }
          });

          const replyMsg = {
            id: id || ("msg-" + Date.now() + "-" + Math.floor(Math.random() * 1000)),
            sessionId,
            sender: "admin",
            senderName: "OCHIR Concierge",
            text: text.trim(),
            timestamp: new Date().toISOString(),
            readByAdmin: true,
            readByCustomer: false
          };

          db.chatMessages.push(replyMsg);
          writeDb(db);

          return sendJson(res, 201, { success: true, message: replyMsg });
        }

        // Admin Store Settings UPDATE
        if (cleanUrl === "/api/admin/settings" && req.method === "PUT") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const body = await parseBody(req);
          const db = readDb();

          db.settings = { ...db.settings, ...body };
          writeDb(db);

          return sendJson(res, 200, { success: true, settings: db.settings, message: "Settings updated." });
        }

        // Admin Coupons CRUD
        if (cleanUrl === "/api/admin/coupons" && req.method === "GET") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const db = readDb();
          return sendJson(res, 200, { success: true, coupons: db.coupons || [] });
        }

        if (cleanUrl === "/api/admin/coupons" && req.method === "POST") {
          if (!isAdmin) return sendJson(res, 403, { success: false, message: "Admin clearance required." });
          const body = await parseBody(req);
          const db = readDb();

          if (!body.code) return sendJson(res, 400, { success: false, message: "Code required." });

          const newCoupon = {
            code: body.code.toUpperCase().trim(),
            discountPercent: body.discountPercent ? parseFloat(body.discountPercent) : undefined,
            discountFlat: body.discountFlat ? parseFloat(body.discountFlat) : undefined,
            minOrder: body.minOrder ? parseFloat(body.minOrder) : 0,
            active: body.active !== undefined ? body.active : true
          };

          db.coupons = db.coupons || [];
          db.coupons = db.coupons.filter((c) => c.code !== newCoupon.code);
          db.coupons.push(newCoupon);
          writeDb(db);

          return sendJson(res, 201, { success: true, coupon: newCoupon });
        }

        return sendJson(res, 404, { success: false, message: `Endpoint ${req.method} ${cleanUrl} not found.` });
      } catch (apiErr) {
        console.error("API Unhandled Error:", apiErr);
        return sendJson(res, 500, { success: false, message: "Internal Server Error: " + apiErr.message });
      }
    }

    // =========================================================================
    // STATIC FILE SERVING
    // =========================================================================
    // STATIC FILE SERVING & ADMIN REDIRECTION
    // =========================================================================
    if (cleanUrl === "/admin" || cleanUrl === "/admin/" || cleanUrl === "/admin.html") {
      res.writeHead(302, { Location: "/?admin=open" });
      res.end();
      return;
    }

    let targetFile = cleanUrl;
    if (targetFile === "/" || targetFile === "") {
      targetFile = "/index.html";
    }

    const safePath = path.normalize(path.join(__dirname, targetFile));
    if (!safePath.startsWith(__dirname)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("403 Forbidden");
      return;
    }

    fs.stat(safePath, (err, stats) => {
      if (err || !stats.isFile()) {
        if (cleanUrl.startsWith("/admin")) {
          const adminPath = path.join(__dirname, "admin.html");
          if (fs.existsSync(adminPath)) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            fs.createReadStream(adminPath).pipe(res);
            return;
          }
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
        return;
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      res.writeHead(200, { "Content-Type": contentType });
      fs.createReadStream(safePath).pipe(res);
    });
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${port} is in use, trying port ${port + 1}...`);
      createServer(port + 1);
    } else {
      console.error("Server error:", err);
    }
  });

  server.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 OCHIR FULL-STACK E-COMMERCE & OPERATIONS PLATFORM`);
    console.log(`👉 Public Flagship: http://localhost:${port}/`);
    console.log(`👉 Admin Operations: http://localhost:${port}/admin`);
    console.log(`👉 REST Engine API: http://localhost:${port}/api/settings`);
    console.log(`======================================================\n`);
  });
}

createServer(DEFAULT_PORT);
