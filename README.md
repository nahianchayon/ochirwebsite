# OCHIR — Luxury Timepiece & Heritage Atelier

A full-stack, zero-build luxury e-commerce platform and operations command room for **OCHIR**, engineered with native Node.js and Google Cloud Firestore.

---

## ✨ Key Features

- **Flagship Storefront**: Modern luxury UI designed with an Apple-inspired minimalist aesthetic, bespoke typography, responsive grid, and smooth interactive product modals.
- **Client Account Dossier**: Order history, saved addresses, personal wishlist, and profile management.
- **Dual-Role Navigation**: Administrators log in like normal users; switching to Admin mode dynamically reveals the dedicated **Admin Control Room** modal. Regular clients never see administrative tools or Firebase telemetry.
- **Admin Control Room**:
  - **Analytics & Revenue KPI overview**
  - **Product Catalog Management** (create, edit, archive, stock control, price comparator)
  - **Orders & Fulfillment Pipeline** (status workflows, timeline audit, courier dispatch)
  - **Payment Verification** (bKash & Rocket TrxID approval / rejection, Cash On Delivery confirmations)
  - **Users & Client Management** (view all registered users, promote to Admin or demote to Client, inspect customer order histories)
  - **Live Concierge Chat** (real-time customer inquiry threads and instant replies)
  - **Storefront Settings & Promotions**
- **Cloud Firestore Real-Time Sync**: Integrated with Firebase Cloud Firestore for real-time user role synchronization, live concierge chat, products, and operational records.
- **Zero-Dependency Architecture**: Built using pure Node.js core modules (`http`, `fs`, `path`, `crypto`) with zero build step required.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)

### Installation & Launch
1. Clone the repository:
   ```bash
   git clone https://github.com/nahianchayon/ochirwebsite.git
   cd ochirwebsite
   ```
2. Start the local server:
   ```bash
   npm start
   # or: node server.js
   ```
3. Open the platform in your browser:
   - **Storefront**: [http://localhost:3000/](http://localhost:3000/)
   - **Operations & Control**: Log in on the storefront and switch to Admin mode.

---

## 🔑 Default Seed Accounts

| Account | Email | Password | Role |
| :--- | :--- | :--- | :--- |
| **Master Admin** | `admin@ochir.com` | `ochir2026` | Administrator |
| **Demo Customer** | `customer@ochir.com` | `ochir2026` | Client |

*Note: You can register with any personal email on the storefront and promote your account to Admin by updating `role: "admin"` directly in your Cloud Firestore console (`users/{your-email}`). The system updates your clearance instantly in real time.*

---

## 📂 Project Structure

```
ochir-brand-website/
├── data/
│   └── db.json               # Seed dummy database
├── uploads/                  # Product imagery & uploads
├── admin.html                # Standalone operations console fallback
├── admin.js                  # Admin Control Room logic & user management
├── app.js                    # Storefront interactive engine & UI
├── firebase-config.js        # Firebase SDK initialization
├── firestore.rules           # Firestore security rules
├── index.html                # Main storefront & integrated Admin modal
├── package.json              # Project metadata & npm start script
├── server.js                 # Native Node.js REST API & static server
├── store.js                  # Reactive state store & Firestore syncing
└── styles.css                # Luxury Apple-inspired design system
```
