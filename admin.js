/**
 * OCHIR ADMIN OPERATIONS CONTROLLER (admin.js)
 * Architecture: Executive Telemetry, Full Product Catalog CRUD (Publish/Unpublish/Archive),
 * Order Fulfillment & Manual Payment Verification (bKash/Rocket TrxID verification, COD confirmation),
 * Real-Time Concierge Chat Inbox, and Dynamic Store Settings.
 * Operates as the Integrated Admin Control Room inside index.html.
 */

let activeSelectedOrder = null;
let activeChatSessionId = null;
let adminChatPollTimer = null;
let activeOrderFilter = "All";
let adminInitialized = false;

document.addEventListener("DOMContentLoaded", () => {
  initAdminControlRoom();
});

function initAdminControlRoom() {
  if (adminInitialized) return;
  if (!window.OchirStore) {
    console.error("OchirStore not loaded.");
    return;
  }
  adminInitialized = true;

  initAdminNavigation();
  initOrdersTable();
  initProductManager();
  initUserManager();
  initChatInbox();
  initSettingsView();
  initFirestoreAdminControls();
  initAdminRoomDismissal();

  // Re-render when store updates if admin room is open
  window.OchirStore.subscribe(() => {
    const modal = document.getElementById("admin-control-room-modal");
    if (modal && modal.classList.contains("is-open")) {
      initDashboardKPIs();
      renderOrders();
      renderProducts();
      renderUsersTable();
    }
  });

  // Check if URL specifies ?admin=open
  if (window.location.search.includes("admin=open")) {
    setTimeout(() => {
      const store = window.OchirStore;
      if (store.canAccessAdmin()) {
        window.openAdminControlRoom();
      } else {
        if (typeof openAuthModal === "function") {
          openAuthModal("signin");
          if (typeof showOchirToast === "function") {
            showOchirToast("Please sign in as Administrator to access the Control Room.", "info");
          }
        }
      }
    }, 400);
  }
}

window.openAdminControlRoom = async function () {
  const store = window.OchirStore;
  if (!store || !store.canAccessAdmin()) {
    if (typeof showOchirToast === "function") {
      showOchirToast("Admin clearance required. Please sign in as Administrator.", "warning");
    } else {
      alert("Admin clearance required. Please sign in as Administrator.");
    }
    return;
  }

  const modal = document.getElementById("admin-control-room-modal");
  if (!modal) return;

  // Set active role to admin
  store.setActiveRole("admin");

  modal.hidden = false;
  modal.removeAttribute("hidden");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-open");

  // Update sidebar info
  const user = store.getCurrentUser();
  const avatarEl = document.getElementById("admin-sidebar-avatar");
  const nameEl = document.getElementById("admin-sidebar-name");
  if (avatarEl && user) {
    avatarEl.textContent = (user.name || "Admin").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  }
  if (nameEl && user) {
    nameEl.textContent = user.name;
  }

  // Refresh admin data
  await initDashboardKPIs();
  renderOrders();
  renderProducts();
  renderUsersTable();
  await pollAdminChat();
  loadSettingsIntoForm();

  // Start live polling for concierge chat while admin room is open
  if (!adminChatPollTimer) {
    adminChatPollTimer = setInterval(() => {
      const modal = document.getElementById("admin-control-room-modal");
      if (modal && (modal.classList.contains("is-open") || !modal.hidden)) {
        pollAdminChat();
      }
    }, 2500);
  }
};

window.closeAdminControlRoom = function () {
  const modal = document.getElementById("admin-control-room-modal");
  if (modal) {
    modal.classList.remove("is-open");
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("admin-open");
  if (adminChatPollTimer) {
    clearInterval(adminChatPollTimer);
    adminChatPollTimer = null;
  }
};

function initAdminRoomDismissal() {
  const closeBtn = document.getElementById("btn-close-admin-room");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.closeAdminControlRoom();
    });
  }

  const switchToUserBtn = document.getElementById("btn-admin-switch-to-user");
  if (switchToUserBtn) {
    switchToUserBtn.addEventListener("click", () => {
      const store = window.OchirStore;
      store.setActiveRole("customer");
      window.closeAdminControlRoom();
      if (typeof showOchirToast === "function") {
        showOchirToast("Switched to User mode. Viewing store as client.", "info");
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("admin-control-room-modal");
      if (modal && modal.classList.contains("is-open")) {
        const orderModal = document.getElementById("order-detail-modal");
        const prodModal = document.getElementById("product-modal");
        if (orderModal && orderModal.classList.contains("is-active")) return;
        if (prodModal && prodModal.classList.contains("is-active")) return;
        window.closeAdminControlRoom();
      }
    }
  });
}

/* ==========================================================================
   1. ADMIN NAVIGATION & TAB SWITCHING
   ========================================================================== */
function initAdminNavigation() {
  const navItems = document.querySelectorAll(".admin-nav-item");
  const views = document.querySelectorAll(".admin-view");

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetView = btn.dataset.view;

      navItems.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      views.forEach((v) => {
        v.hidden = v.id !== `view-${targetView}`;
      });

      if (targetView === "orders") renderOrders();
      if (targetView === "products") renderProducts();
      if (targetView === "customers") renderUsersTable();
      if (targetView === "chat") pollAdminChat();
      if (targetView === "settings") loadSettingsIntoForm();
    });
  });

  const refreshBtn = document.getElementById("refresh-dashboard-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      const store = window.OchirStore;
      await store.fetchAdminOrders();
      await store.fetchAdminProducts();
      initDashboardKPIs();
      renderOrders();
      renderProducts();
    });
  }
}

/* ==========================================================================
   1.1 FIRESTORE STATUS & CATALOG SYNC CONTROLLER
   ========================================================================== */
function initFirestoreAdminControls() {
  const store = window.OchirStore;
  const pill = document.getElementById("firestore-status-pill");
  const dot = document.getElementById("firestore-dot");
  const label = document.getElementById("firestore-status-label");
  const syncBtn = document.getElementById("btn-sync-firestore");

  const updateUI = () => {
    const isReady = store.isFirestoreReady();
    if (isReady && window.FIREBASE_CONFIG) {
      if (pill) {
        pill.style.background = "rgba(52, 211, 153, 0.12)";
        pill.style.borderColor = "rgba(52, 211, 153, 0.35)";
        pill.style.color = "#34d399";
        pill.title = `Connected to Cloud Firestore Project [${window.FIREBASE_CONFIG.projectId}]`;
      }
      if (dot) dot.style.background = "#34d399";
      if (label) label.textContent = `Firestore: ${window.FIREBASE_CONFIG.projectId}`;
    } else {
      if (pill) {
        pill.style.background = "rgba(255, 91, 0, 0.12)";
        pill.style.borderColor = "rgba(255, 91, 0, 0.25)";
        pill.style.color = "#FF5B00";
        pill.title = "Click for setup guide";
      }
      if (dot) dot.style.background = "#FF5B00";
      if (label) label.textContent = "Firestore: Standby";
    }
  };

  updateUI();

  if (pill) {
    pill.addEventListener("click", () => {
      if (store.isFirestoreReady()) {
        alert(
          `🔥 Cloud Firestore is ACTIVE!\n\nConnected Project: ${window.FIREBASE_CONFIG.projectId}\n\nYour products, orders, chat messages, and store settings are now operating on Google Cloud Firestore in real time!`
        );
      } else {
        alert(
          "🔥 Cloud Firestore Setup Guide:\n\n1. Open 'firebase-config.js' in the root directory.\n2. Replace apiKey, projectId, etc. with your Firebase Web App credentials.\n3. Ensure your Firestore Database is created in the Firebase Console.\n4. Refresh this page to activate real-time Cloud Firestore syncing!"
        );
      }
    });
  }

  if (syncBtn) {
    syncBtn.addEventListener("click", async () => {
      if (!store.isFirestoreReady()) {
        alert(
          "🔥 Firebase credentials not yet configured in firebase-config.js.\n\nPlease enter your Firebase project keys into firebase-config.js first, then click Sync to push your entire catalog into Firestore!"
        );
        return;
      }

      const confirmSync = confirm(
        "Upload all current catalog products and store settings directly into your Cloud Firestore database?"
      );
      if (!confirmSync) return;

      syncBtn.disabled = true;
      syncBtn.innerHTML = `<span>⏳ Syncing to Cloud...</span>`;

      const res = await store.syncLocalDataToFirestore();
      syncBtn.disabled = false;
      syncBtn.innerHTML = `<span>🔥 Sync to Firestore</span>`;

      if (res.success) {
        alert(res.message);
        initDashboardKPIs();
        renderProducts();
      } else {
        alert(res.message);
      }
    });
  }
}

/* ==========================================================================
   2. EXECUTIVE DASHBOARD & KPIS
   ========================================================================== */
async function initDashboardKPIs() {
  const store = window.OchirStore;
  await store.fetchAdminOrders();
  await store.fetchAdminProducts();

  const orders = store.getOrders();
  const products = store.getAdminProducts();

  // Metrics
  const validOrders = orders.filter((o) => o.status !== "Cancelled");
  const totalRevenue = validOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const pendingCount = orders.filter(
    (o) => o.status === "Pending Confirmation" || o.status === "Processing" || o.paymentStatus === "Pending Verification"
  ).length;
  const aov = validOrders.length ? Math.round(totalRevenue / validOrders.length) : 0;
  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);

  // Update KPI Cards
  const kpiRev = document.getElementById("kpi-revenue");
  const kpiPend = document.getElementById("kpi-pending-orders");
  const kpiAov = document.getElementById("kpi-aov");
  const kpiStock = document.getElementById("kpi-total-stock");

  if (kpiRev) kpiRev.textContent = store.formatMoney(totalRevenue);
  if (kpiPend) kpiPend.textContent = pendingCount;
  if (kpiAov) kpiAov.textContent = store.formatMoney(aov);
  if (kpiStock) kpiStock.textContent = totalStock;

  // Sidebar badges
  const sidebarOrderBadge = document.getElementById("sidebar-order-badge");
  const sidebarProdBadge = document.getElementById("sidebar-prod-badge");
  const sidebarInqBadge = document.getElementById("sidebar-inq-badge");

  if (sidebarOrderBadge) sidebarOrderBadge.textContent = pendingCount;
  if (sidebarProdBadge) sidebarProdBadge.textContent = products.length;

  // Low Stock Alert Banner
  const lowStockBanner = document.getElementById("low-stock-alert-banner");
  const lowStockText = document.getElementById("low-stock-items-text");
  const lowStockItems = products.filter((p) => (p.stock || 0) <= 5);

  if (lowStockBanner && lowStockText) {
    if (lowStockItems.length > 0) {
      lowStockBanner.hidden = false;
      lowStockText.textContent = lowStockItems.map((p) => `${p.title} (${p.stock || 0} remaining)`).join(", ");
    } else {
      lowStockBanner.hidden = true;
    }
  }

  renderRevenueChart(orders);
  renderActivityFeed(orders);
}

function renderRevenueChart(orders) {
  const wrap = document.getElementById("chart-bars-wrap");
  if (!wrap) return;

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const amounts = [120000, 45000, 180000, 95000, 320000, 165000, 240000];
  const maxVal = Math.max(...amounts);

  wrap.innerHTML = days
    .map((day, idx) => {
      const amt = amounts[idx];
      const pct = Math.round((amt / maxVal) * 100);
      return `
      <div class="chart-bar-col">
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="height: ${pct}%;" title="৳${amt.toLocaleString()} BDT"></div>
        </div>
        <span class="chart-day-label">${day}</span>
      </div>
    `;
    })
    .join("");
}

function renderActivityFeed(orders) {
  const feed = document.getElementById("activity-feed-list");
  if (!feed) return;

  if (orders.length === 0) {
    feed.innerHTML = `<p style="color:#86868b;font-size:0.85rem;padding:16px;">No recent order transactions.</p>`;
    return;
  }

  feed.innerHTML = orders
    .slice(0, 5)
    .map((o) => `
    <div class="activity-feed-item">
      <div class="activity-icon">📦</div>
      <div class="activity-meta">
        <strong>${o.id} · ${o.status}</strong>
        <span>${o.customer.name} placed order via ${o.paymentMethod} (৳${o.total.toLocaleString()})</span>
      </div>
      <span class="activity-time">${new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  `)
    .join("");
}

/* ==========================================================================
   3. ORDER MANAGEMENT & MANUAL PAYMENT VERIFICATION
   ========================================================================== */
function initOrdersTable() {
  const searchInput = document.getElementById("orders-search-input");
  const filterPills = document.querySelectorAll("#order-status-filters .filter-pill");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderOrders();
    });
  }

  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      activeOrderFilter = pill.dataset.status;
      renderOrders();
    });
  });

  initOrderDetailModal();
  renderOrders();
}

async function renderOrders() {
  const store = window.OchirStore;
  const tbody = document.getElementById("orders-tbody");
  if (!tbody) return;

  const searchVal = document.getElementById("orders-search-input")?.value.trim().toLowerCase() || "";
  const orders = await store.fetchAdminOrders();

  let filtered = orders;
  if (activeOrderFilter !== "All") {
    filtered = filtered.filter(
      (o) => o.status === activeOrderFilter || o.paymentStatus === activeOrderFilter
    );
  }

  if (searchVal) {
    filtered = filtered.filter(
      (o) =>
        o.id.toLowerCase().includes(searchVal) ||
        (o.customer?.name || "").toLowerCase().includes(searchVal) ||
        (o.customer?.phone || "").includes(searchVal) ||
        (o.paymentDetails?.trxId || "").toLowerCase().includes(searchVal)
    );
  }

  // Update counts
  const countAll = document.getElementById("count-all");
  const countPending = document.getElementById("count-pending");
  const countProcessing = document.getElementById("count-processing");
  const countDispatched = document.getElementById("count-dispatched");
  const countDelivered = document.getElementById("count-delivered");

  if (countAll) countAll.textContent = orders.length;
  if (countPending)
    countPending.textContent = orders.filter(
      (o) => o.status === "Pending Confirmation" || o.paymentStatus === "Pending Verification"
    ).length;
  if (countProcessing) countProcessing.textContent = orders.filter((o) => o.status === "Processing").length;
  if (countDispatched) countDispatched.textContent = orders.filter((o) => o.status === "Shipped").length;
  if (countDelivered) countDelivered.textContent = orders.filter((o) => o.status === "Delivered").length;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#86868b;">No matching orders found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((o) => {
      const payStatusClass =
        o.paymentStatus === "Verified" || o.paymentStatus === "Paid"
          ? "status-paid"
          : o.paymentStatus === "Failed"
          ? "status-failed"
          : "status-pending";

      const fulfillmentClass = `status-${(o.status || "").toLowerCase().replace(/\s+/g, "-")}`;

      return `
      <tr class="order-row-clickable" onclick="openAdminOrderDetail('${o.id}')">
        <td><strong style="font-family:'JetBrains Mono', monospace;">${o.id}</strong></td>
        <td>${new Date(o.createdAt).toLocaleDateString()}</td>
        <td>
          <div style="font-weight:600;">${o.customer.name}</div>
          <div style="font-size:0.75rem;color:#86868b;">${o.customer.phone}</div>
        </td>
        <td>${(o.items || []).length} piece(s)</td>
        <td><strong>${store.formatMoney(o.total)}</strong></td>
        <td>
          <span style="font-size:0.75rem;display:block;margin-bottom:2px;">${o.paymentMethod}</span>
          <span class="table-status-pill ${payStatusClass}">${o.paymentStatus}</span>
        </td>
        <td>
          <span class="table-status-pill ${fulfillmentClass}">${o.status}</span>
        </td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openAdminOrderDetail('${o.id}'); event.stopPropagation();">
            Inspect Dossier
          </button>
        </td>
      </tr>
    `;
    })
    .join("");
}

function initOrderDetailModal() {
  const modal = document.getElementById("order-detail-modal");
  const closeBtn = document.getElementById("order-modal-close");
  const printBtn = document.getElementById("btn-print-slip");
  const updateBtn = document.getElementById("btn-update-status-action");

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
    });
  }

  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }

  if (updateBtn) {
    updateBtn.addEventListener("click", async () => {
      if (!activeSelectedOrder) return;
      const store = window.OchirStore;

      const newStatus = document.getElementById("modal-fulfillment-status")?.value;
      const courier = document.getElementById("modal-courier-name")?.value.trim();
      const tracking = document.getElementById("modal-tracking-num")?.value.trim();
      const note = document.getElementById("modal-admin-notes")?.value.trim();

      const res = await store.updateOrderStatus(activeSelectedOrder.id, {
        status: newStatus,
        courierName: courier,
        trackingNumber: tracking,
        note
      });

      if (res.success) {
        alert("Order fulfillment status updated.");
        openAdminOrderDetail(activeSelectedOrder.id);
        renderOrders();
      }
    });
  }
}

window.openAdminOrderDetail = function (orderId) {
  const store = window.OchirStore;
  const orders = store.getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return;

  activeSelectedOrder = order;

  const modal = document.getElementById("order-detail-modal");
  const orderIdTitle = document.getElementById("modal-order-id");
  const body = document.getElementById("order-modal-body");

  if (orderIdTitle) orderIdTitle.textContent = `${order.id} · ${order.status}`;

  if (body) {
    const payDetails = order.paymentDetails || {};
    const isManualPay = order.paymentMethod === "bKash" || order.paymentMethod === "Rocket";

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
        <div class="admin-card" style="padding:16px;">
          <h4 style="margin:0 0 10px;font-size:0.95rem;">Client &amp; Recipient Dossier</h4>
          <p style="margin:4px 0;"><strong>Name:</strong> ${order.customer.name}</p>
          <p style="margin:4px 0;"><strong>Mobile:</strong> <a href="tel:${order.customer.phone}" style="color:#FF5B00;">${order.customer.phone}</a></p>
          <p style="margin:4px 0;"><strong>Email:</strong> ${order.customer.email}</p>
          <p style="margin:4px 0;"><strong>Address:</strong> ${order.customer.address}</p>
          <p style="margin:4px 0;"><strong>Zone / District:</strong> ${order.customer.district} (${order.customer.area || ""})</p>
          ${order.customer.instructions ? `<p style="margin:4px 0;color:#e65100;"><strong>Instructions:</strong> ${order.customer.instructions}</p>` : ""}
        </div>

        <div class="admin-card" style="padding:16px;">
          <h4 style="margin:0 0 10px;font-size:0.95rem;">Payment Verification Engine</h4>
          <p style="margin:4px 0;"><strong>Method:</strong> ${order.paymentMethod}</p>
          <p style="margin:4px 0;"><strong>Current Status:</strong> <span class="table-status-pill status-${order.paymentStatus.toLowerCase()}">${order.paymentStatus}</span></p>

          ${
            isManualPay
              ? `
            <div style="margin-top:12px;padding:12px;background:#202228;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
              <p style="margin:2px 0;"><strong>Sender Mobile:</strong> <span style="font-family:'JetBrains Mono', monospace;color:#FF5B00;">${payDetails.senderPhone || "N/A"}</span></p>
              <p style="margin:2px 0;"><strong>Transaction ID (TrxID):</strong> <span style="font-family:'JetBrains Mono', monospace;font-weight:700;letter-spacing:0.04em;">${payDetails.trxId || "N/A"}</span></p>
              
              <div style="display:flex;gap:8px;margin-top:10px;">
                <button type="button" class="btn btn-primary btn-sm" onclick="adminVerifyPayment('${order.id}', 'Verified')">✓ Verify TrxID</button>
                <button type="button" class="btn btn-secondary btn-sm" style="color:#e02424;" onclick="adminVerifyPayment('${order.id}', 'Failed')">✕ Reject Payment</button>
              </div>
            </div>
          `
              : order.paymentMethod === "COD"
              ? `
            <div style="margin-top:12px;padding:12px;background:#202228;border-radius:8px;">
              <p style="margin:2px 0;"><strong>COD Status:</strong> ${order.paymentStatus}</p>
              <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="adminVerifyPayment('${order.id}', 'Paid')">✓ Mark COD Collected</button>
            </div>
          `
              : ""
          }
        </div>
      </div>

      <div class="admin-card" style="padding:16px;margin-bottom:20px;">
        <h4 style="margin:0 0 12px;font-size:0.95rem;">Fulfillment &amp; Dispatch Protocol</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
          <div class="field-group">
            <label for="modal-fulfillment-status">Fulfillment Status</label>
            <select id="modal-fulfillment-status" class="select-input">
              <option value="Pending Confirmation" ${order.status === "Pending Confirmation" ? "selected" : ""}>Pending Confirmation</option>
              <option value="Confirmed" ${order.status === "Confirmed" ? "selected" : ""}>Confirmed</option>
              <option value="Processing" ${order.status === "Processing" ? "selected" : ""}>Processing / Regulation</option>
              <option value="Packed" ${order.status === "Packed" ? "selected" : ""}>Packed in Cedar Box</option>
              <option value="Shipped" ${order.status === "Shipped" ? "selected" : ""}>Shipped / In Transit</option>
              <option value="Delivered" ${order.status === "Delivered" ? "selected" : ""}>Delivered</option>
              <option value="Cancelled" ${order.status === "Cancelled" ? "selected" : ""}>Cancelled (Auto-Restock)</option>
              <option value="Returned" ${order.status === "Returned" ? "selected" : ""}>Returned (Auto-Restock)</option>
            </select>
          </div>
          <div class="field-group">
            <label for="modal-courier-name">Courier Service</label>
            <input type="text" id="modal-courier-name" class="text-input" value="${order.courierName || "Steadfast Courier"}" placeholder="e.g. Steadfast / Pathao / DHL" />
          </div>
          <div class="field-group">
            <label for="modal-tracking-num">Tracking Reference #</label>
            <input type="text" id="modal-tracking-num" class="text-input" value="${order.trackingNumber || ""}" placeholder="e.g. SF-928471049" />
          </div>
        </div>

        <div class="field-group" style="margin-top:12px;">
          <label for="modal-admin-notes">Internal Atelier Notes</label>
          <textarea id="modal-admin-notes" class="text-input" rows="2" placeholder="Private internal comments...">${order.adminNotes || ""}</textarea>
        </div>
      </div>

      <div class="admin-card" style="padding:16px;">
        <h4 style="margin:0 0 10px;font-size:0.95rem;">Acquired Items Snapshot</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Piece Title</th>
              <th>Variant / Monogram</th>
              <th>Unit Price</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${(order.items || [])
              .map(
                (item) => `
              <tr>
                <td><strong>${item.title}</strong></td>
                <td>${item.variant || "Standard"} ${item.engraving ? `<br /><small>Monogram: "${item.engraving}"</small>` : ""}</td>
                <td>${store.formatMoney(item.unitPrice)}</td>
                <td>${item.qty}</td>
                <td><strong>${store.formatMoney(item.unitPrice * item.qty)}</strong></td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        <div style="text-align:right;margin-top:12px;font-size:1.1rem;font-weight:700;">
          Grand Total: ${store.formatMoney(order.total)}
        </div>
      </div>
    `;
  }

  modal.classList.add("is-active");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
};

window.adminVerifyPayment = async function (orderId, newStatus) {
  const store = window.OchirStore;
  const res = await store.updateOrderPayment(orderId, {
    paymentStatus: newStatus,
    note: `Admin marked payment as ${newStatus}.`
  });

  if (res.success) {
    alert(`Payment status updated to ${newStatus}.`);
    openAdminOrderDetail(orderId);
    renderOrders();
  }
};

/* ==========================================================================
   4. PRODUCT CATALOG MANAGER (Full CRUD, Seed, Multi-Image Upload)
   ========================================================================== */
function initProductManager() {
  const addBtn = document.getElementById("btn-add-new-product");
  const seedBtn = document.getElementById("btn-seed-catalog");
  const modal = document.getElementById("product-modal");
  const closeBtn = document.getElementById("product-modal-close");
  const form = document.getElementById("product-form");
  const fileInput = document.getElementById("prod-form-img-file");

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      openProductEditModal(null);
    });
  }

  if (seedBtn) {
    seedBtn.addEventListener("click", async () => {
      if (confirm("Seed the authentic Ochir luxury catalog with genuine watches, wallets, and cuffs?")) {
        const store = window.OchirStore;
        const res = await store.seedProducts();
        if (res.success) {
          alert(`Successfully seeded ${res.count} authentic Ochir luxury pieces.`);
          renderProducts();
        }
      }
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
    });
  }

  // File Upload listener
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        const store = window.OchirStore;
        const uploadRes = await store.uploadProductImage(dataUrl, file.name);

        if (uploadRes && uploadRes.success && uploadRes.url) {
          const primaryImgInput = document.getElementById("prod-form-img-primary");
          if (primaryImgInput) primaryImgInput.value = uploadRes.url;
          alert("Image uploaded successfully to server!");
        } else {
          alert("Could not upload image.");
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const store = window.OchirStore;

      const id = document.getElementById("prod-form-id")?.value;
      const title = document.getElementById("prod-form-title")?.value.trim();
      const subtitle = document.getElementById("prod-form-subtitle")?.value.trim();
      const category = document.getElementById("prod-form-category")?.value;
      const subcategory = document.getElementById("prod-form-subcat")?.value.trim();
      const sku = document.getElementById("prod-form-sku")?.value.trim().toUpperCase();
      const status = document.getElementById("prod-form-status")?.value || "published";
      const basePrice = parseFloat(document.getElementById("prod-form-price")?.value) || 0;
      const comparePrice = parseFloat(document.getElementById("prod-form-compare")?.value) || null;
      const stock = parseInt(document.getElementById("prod-form-stock")?.value, 10) || 0;
      const story = document.getElementById("prod-form-story")?.value.trim();
      const primaryImg = document.getElementById("prod-form-img-primary")?.value.trim();
      const altImg = document.getElementById("prod-form-img-alt")?.value.trim() || primaryImg;
      const variantsStr = document.getElementById("prod-form-variants-str")?.value.trim();

      const flagFeatured = document.getElementById("flag-featured")?.checked || false;
      const flagLimited = document.getElementById("flag-limited")?.checked || false;
      const flagNew = document.getElementById("flag-new")?.checked || false;
      const flagSoldout = document.getElementById("flag-soldout")?.checked || stock === 0;

      const variants = {};
      if (variantsStr) {
        variants.colors = variantsStr.split(",").map((s) => s.trim());
      }

      const prodPayload = {
        id: id || undefined,
        title,
        subtitle,
        category,
        subcategory,
        sku,
        status,
        basePrice,
        comparePrice,
        stock,
        story,
        images: {
          primary: primaryImg,
          alternate: altImg
        },
        variants,
        flags: {
          featured: flagFeatured,
          limitedEdition: flagLimited,
          newArrival: flagNew,
          soldOut: flagSoldout
        }
      };

      const res = await store.saveProduct(prodPayload);
      if (res.success) {
        modal.classList.remove("is-active");
        document.body.classList.remove("modal-open");
        renderProducts();
        alert("Product piece saved and updated successfully.");
      } else {
        alert(res.message || "Failed to save product.");
      }
    });
  }

  renderProducts();
}

async function renderProducts() {
  const store = window.OchirStore;
  const grid = document.getElementById("products-admin-grid");
  if (!grid) return;

  const products = await store.fetchAdminProducts();

  if (products.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px;background:#16171b;border-radius:16px;border:1px dashed rgba(255,255,255,0.1);">
        <h3>Your Atelier Catalog is Currently Empty</h3>
        <p style="color:#86868b;max-width:480px;margin:10px auto 20px;">No products exist in your database yet. Add a new piece manually, or click Seed Initial Catalog to populate authentic luxury pieces.</p>
        <button type="button" class="btn btn-primary" onclick="document.getElementById('btn-seed-catalog').click()">✦ Seed Initial Atelier Catalog</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = products
    .map((p) => {
      const isPub = p.status === "published";
      const statusPill = isPub
        ? `<span class="table-status-pill status-paid">PUBLISHED</span>`
        : `<span class="table-status-pill status-pending">UNPUBLISHED / DRAFT</span>`;

      return `
      <div class="product-admin-card" style="background:#16171b;padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;gap:12px;">
          <img src="${p.images?.primary || ""}" alt="${p.title}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;" />
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <h4 style="margin:0;font-size:0.95rem;">${p.title}</h4>
              ${statusPill}
            </div>
            <span style="font-size:0.75rem;color:#86868b;">SKU: ${p.sku || ""} · ${p.category}</span>
            <div style="margin-top:4px;font-weight:700;">${store.formatMoney(p.basePrice)} <span style="font-size:0.75rem;color:#FF5B00;">(Stock: ${p.stock})</span></div>
          </div>
        </div>

        <div style="display:flex;gap:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleProductPublish('${p.id}')">
            ${isPub ? "Unpublish" : "Publish"}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openProductEditModal('${p.id}')">Edit</button>
          <button type="button" class="btn btn-secondary btn-sm" style="color:#e02424;" onclick="adminDeleteProduct('${p.id}')">Delete</button>
        </div>
      </div>
    `;
    })
    .join("");
}

window.toggleProductPublish = async function (id) {
  const store = window.OchirStore;
  const prod = store.getAdminProducts().find((p) => p.id === id);
  if (!prod) return;

  const nextStatus = prod.status === "published" ? "draft" : "published";
  await store.saveProduct({ ...prod, status: nextStatus });
  renderProducts();
};

window.openProductEditModal = function (id) {
  const store = window.OchirStore;
  const modal = document.getElementById("product-modal");
  const modalTitle = document.getElementById("product-modal-title");

  const idField = document.getElementById("prod-form-id");
  const titleField = document.getElementById("prod-form-title");
  const subtitleField = document.getElementById("prod-form-subtitle");
  const categoryField = document.getElementById("prod-form-category");
  const subcatField = document.getElementById("prod-form-subcat");
  const skuField = document.getElementById("prod-form-sku");
  const statusField = document.getElementById("prod-form-status");
  const priceField = document.getElementById("prod-form-price");
  const compareField = document.getElementById("prod-form-compare");
  const stockField = document.getElementById("prod-form-stock");
  const storyField = document.getElementById("prod-form-story");
  const primaryImgField = document.getElementById("prod-form-img-primary");
  const altImgField = document.getElementById("prod-form-img-alt");
  const variantsField = document.getElementById("prod-form-variants-str");

  const flagFeatured = document.getElementById("flag-featured");
  const flagLimited = document.getElementById("flag-limited");
  const flagNew = document.getElementById("flag-new");
  const flagSoldout = document.getElementById("flag-soldout");

  if (!id) {
    if (modalTitle) modalTitle.textContent = "Add New Atelier Piece";
    if (idField) idField.value = "";
    if (titleField) titleField.value = "";
    if (subtitleField) subtitleField.value = "";
    if (subcatField) subcatField.value = "";
    if (skuField) skuField.value = "OCH-" + Math.floor(1000 + Math.random() * 9000);
    if (statusField) statusField.value = "published";
    if (priceField) priceField.value = "";
    if (compareField) compareField.value = "";
    if (stockField) stockField.value = "10";
    if (storyField) storyField.value = "";
    if (primaryImgField) primaryImgField.value = "";
    if (altImgField) altImgField.value = "";
    if (variantsField) variantsField.value = "";
  } else {
    const prod = store.getAdminProducts().find((p) => p.id === id);
    if (!prod) return;

    if (modalTitle) modalTitle.textContent = `Edit: ${prod.title}`;
    if (idField) idField.value = prod.id;
    if (titleField) titleField.value = prod.title;
    if (subtitleField) subtitleField.value = prod.subtitle || "";
    if (categoryField) categoryField.value = prod.category || "timepieces";
    if (subcatField) subcatField.value = prod.subcategory || "";
    if (skuField) skuField.value = prod.sku || "";
    if (statusField) statusField.value = prod.status || "published";
    if (priceField) priceField.value = prod.basePrice;
    if (compareField) compareField.value = prod.comparePrice || "";
    if (stockField) stockField.value = prod.stock;
    if (storyField) storyField.value = prod.story || "";
    if (primaryImgField) primaryImgField.value = prod.images?.primary || "";
    if (altImgField) altImgField.value = prod.images?.alternate || "";

    const vars = prod.variants?.colors || prod.variants?.dials || [];
    if (variantsField) variantsField.value = vars.join(", ");

    if (flagFeatured) flagFeatured.checked = !!prod.flags?.featured;
    if (flagLimited) flagLimited.checked = !!prod.flags?.limitedEdition;
    if (flagNew) flagNew.checked = !!prod.flags?.newArrival;
    if (flagSoldout) flagSoldout.checked = !!prod.flags?.soldOut;
  }

  modal.classList.add("is-active");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
};

window.adminDeleteProduct = async function (id) {
  if (confirm("Are you sure you want to permanently delete this product piece?")) {
    const store = window.OchirStore;
    const res = await store.deleteProduct(id);
    if (res.success) {
      renderProducts();
    }
  }
};

/* ==========================================================================
   4.5. USER & CLIENTELE MANAGEMENT (Admin Operations)
   ========================================================================== */
let activeUserRoleFilter = "All";
let userSearchQuery = "";
let adminUsersList = [];

function initUserManager() {
  const searchInput = document.getElementById("users-search-input");
  const refreshBtn = document.getElementById("btn-refresh-users");
  const filterPills = document.querySelectorAll("#user-role-filters .filter-pill");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      userSearchQuery = e.target.value.trim().toLowerCase();
      applyUserFiltersAndRender();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "⟳ Loading...";
      await renderUsersTable();
      refreshBtn.disabled = false;
      refreshBtn.textContent = "⟳ Refresh Accounts";
    });
  }

  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      activeUserRoleFilter = pill.dataset.role || "All";
      applyUserFiltersAndRender();
    });
  });
}

async function renderUsersTable() {
  const store = window.OchirStore;
  adminUsersList = await store.fetchAllUsers();
  updateUserBadges();
  applyUserFiltersAndRender();
}

function updateUserBadges() {
  const allCountEl = document.getElementById("user-count-all");
  const adminCountEl = document.getElementById("user-count-admin");
  const clientCountEl = document.getElementById("user-count-clients");
  const sidebarBadge = document.getElementById("sidebar-users-badge");

  const total = adminUsersList.length;
  const adminCount = adminUsersList.filter((u) => u.role === "admin" || u.role === "administrator").length;
  const clientCount = total - adminCount;

  if (allCountEl) allCountEl.textContent = total;
  if (adminCountEl) adminCountEl.textContent = adminCount;
  if (clientCountEl) clientCountEl.textContent = clientCount;
  if (sidebarBadge) sidebarBadge.textContent = total;
}

function applyUserFiltersAndRender() {
  const tbody = document.getElementById("users-tbody");
  if (!tbody) return;

  let filtered = adminUsersList.slice();

  if (activeUserRoleFilter !== "All") {
    if (activeUserRoleFilter === "admin") {
      filtered = filtered.filter((u) => u.role === "admin" || u.role === "administrator");
    } else {
      filtered = filtered.filter((u) => u.role !== "admin" && u.role !== "administrator");
    }
  }

  if (userSearchQuery) {
    filtered = filtered.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(userSearchQuery)) ||
        (u.email && u.email.toLowerCase().includes(userSearchQuery)) ||
        (u.phone && u.phone.includes(userSearchQuery))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:32px;color:#86868b;">
          No atelier user accounts match the current filter.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((u) => {
      const isAdmin = u.role === "admin" || u.role === "administrator";
      const initials = (u.name || "CL")
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Active";

      return `
      <tr>
        <td>
          <div class="user-cell-meta">
            <span class="user-table-avatar" style="${isAdmin ? 'border-color:rgba(255,91,0,0.4);color:#ff5b00;' : ''}">${initials}</span>
            <div>
              <strong>${u.name || "Client"}</strong>
            </div>
          </div>
        </td>
        <td><code>${u.email}</code></td>
        <td>${u.phone || "—"}</td>
        <td>
          <span class="table-status-pill ${isAdmin ? 'status-admin' : 'status-customer'}">
            ${isAdmin ? '⚡ ADMINISTRATOR' : '👤 CLIENT'}
          </span>
        </td>
        <td><span style="font-size:0.75rem;color:#86868b;">${dateStr}</span></td>
        <td>
          <strong>${u.ordersCount || 0}</strong> order${u.ordersCount === 1 ? '' : 's'}
        </td>
        <td style="text-align:right;">
          <div style="display:inline-flex;gap:6px;align-items:center;">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              style="padding:4px 8px;font-size:0.72rem;${isAdmin ? 'color:#86868b;' : 'color:#ff5b00;border-color:rgba(255,91,0,0.3);'}"
              onclick="toggleUserRole('${u.email}', '${isAdmin ? 'admin' : 'customer'}')"
              title="${isAdmin ? 'Demote to regular customer' : 'Promote to Master Administrator'}"
            >
              ${isAdmin ? 'Demote to User' : '⚡ Make Admin'}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              style="padding:4px 8px;font-size:0.72rem;"
              onclick="viewUserOrders('${u.email}')"
              title="Filter order management by this customer"
            >
              Orders
            </button>
            ${u.email !== 'admin@ochir.com' ? `
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              style="padding:4px 6px;font-size:0.72rem;color:#ef4444;border-color:rgba(239,68,68,0.25);"
              onclick="deleteUserAccount('${u.email}')"
              title="Delete user"
            >
              ✕
            </button>` : ''}
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

window.toggleUserRole = async function (email, currentRole) {
  const store = window.OchirStore;
  const newRole = currentRole === "admin" ? "customer" : "admin";
  const actionName = newRole === "admin" ? "Promote this account to Administrator" : "Remove Administrator privileges and return to Client";

  const confirmed = confirm(`${actionName} for ${email}?`);
  if (!confirmed) return;

  const res = await store.updateUserRole(email, newRole);
  if (res.success) {
    if (typeof showOchirToast === "function") {
      showOchirToast(`Role updated for ${email} to ${newRole === 'admin' ? 'Administrator' : 'Client'}.`, "success");
    } else {
      alert(`Role updated for ${email} to ${newRole}.`);
    }
    await renderUsersTable();
  }
};

window.viewUserOrders = function (email) {
  const ordersNavBtn = document.querySelector('.admin-nav-item[data-view="orders"]');
  if (ordersNavBtn) ordersNavBtn.click();
  const searchInput = document.getElementById("orders-search-input");
  if (searchInput) {
    searchInput.value = email;
    searchInput.dispatchEvent(new Event("input"));
  }
};

window.deleteUserAccount = async function (email) {
  if (email === "admin@ochir.com") {
    alert("Cannot delete primary Atelier Master administrator.");
    return;
  }
  const confirmed = confirm(`Are you sure you want to delete user ${email}?`);
  if (!confirmed) return;

  const store = window.OchirStore;
  await store.deleteUser(email);
  if (typeof showOchirToast === "function") {
    showOchirToast(`Account ${email} deleted.`, "info");
  }
  await renderUsersTable();
};

/* ==========================================================================
   5. LIVE CONCIERGE CHAT INBOX
   ========================================================================== */
function initChatInbox() {
  const replyForm = document.getElementById("admin-chat-reply-form");
  const refreshChatBtn = document.getElementById("btn-refresh-admin-chat");

  if (refreshChatBtn) {
    refreshChatBtn.addEventListener("click", () => {
      pollAdminChat();
    });
  }

  if (replyForm) {
    replyForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("admin-chat-reply-input");
      const text = input ? input.value.trim() : "";
      if (!text) return;

      const store = window.OchirStore;
      if (!activeChatSessionId) {
        const convs = await store.fetchAdminChatConversations();
        if (convs.length > 0) {
          activeChatSessionId = convs[0].sessionId;
        } else {
          if (typeof showOchirToast === "function") {
            showOchirToast("Please select a customer dialogue before replying.", "error");
          }
          return;
        }
      }

      input.value = "";
      const replyBtn = document.getElementById("btn-admin-reply");
      if (replyBtn) replyBtn.disabled = true;

      try {
        const res = await store.sendAdminChatReply(activeChatSessionId, text);
        if (res && res.success) {
          await pollAdminChat();
          if (typeof showOchirToast === "function") {
            showOchirToast("Concierge reply sent to customer.", "success");
          }
        } else {
          if (typeof showOchirToast === "function") {
            showOchirToast("Failed to deliver reply. Please check connection.", "error");
          }
        }
      } catch (err) {
        console.error("Admin chat reply error:", err);
      } finally {
        if (replyBtn) replyBtn.disabled = false;
        if (input) input.focus();
      }
    });
  }
}

async function pollAdminChat() {
  const store = window.OchirStore;
  const convList = document.getElementById("admin-chat-conv-list");
  const inqBadge = document.getElementById("sidebar-inq-badge");
  const replyInput = document.getElementById("admin-chat-reply-input");
  const replyBtn = document.getElementById("btn-admin-reply");

  if (!convList) return;

  const convs = await store.fetchAdminChatConversations();

  if (inqBadge) {
    const unreadTotal = convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    inqBadge.textContent = unreadTotal > 0 ? unreadTotal : convs.length;
  }

  if (convs.length === 0) {
    convList.innerHTML = `<p style="color:#86868b;font-size:0.85rem;padding:16px;">No customer concierge chats active yet.</p>`;
    const threadBody = document.getElementById("admin-chat-thread-body");
    if (threadBody) {
      threadBody.innerHTML = `<p style="color:#86868b;text-align:center;margin:auto;">When customers send questions from the storefront, their conversation will appear here.</p>`;
    }
    if (replyInput) replyInput.disabled = true;
    if (replyBtn) replyBtn.disabled = true;
    return;
  }

  // Auto-select the first conversation if none selected yet
  if (!activeChatSessionId || !convs.some((c) => c.sessionId === activeChatSessionId)) {
    activeChatSessionId = convs[0].sessionId;
  }

  convList.innerHTML = convs
    .map(
      (c) => `
    <div class="inquiry-item ${c.sessionId === activeChatSessionId ? "is-active" : ""}" style="cursor:pointer;padding:12px;border-bottom:1px solid rgba(255,255,255,0.06);background:${c.sessionId === activeChatSessionId ? "rgba(255,91,0,0.12)" : "transparent"};border-left:${c.sessionId === activeChatSessionId ? "3px solid #ff5b00" : "3px solid transparent"};transition:all 0.2s ease;" onclick="selectAdminChatSession('${c.sessionId}')">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <strong>${c.customerName || "Visitor"}</strong>
        ${c.unreadCount > 0 ? `<span class="table-status-pill status-pending">${c.unreadCount} NEW</span>` : ""}
      </div>
      <p style="margin:0;font-size:0.8rem;color:#86868b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.lastMessage || "No messages"}</p>
      <span style="font-size:0.7rem;color:#555;">${c.lastTimestamp ? new Date(c.lastTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
    </div>
  `
    )
    .join("");

  if (replyInput) replyInput.disabled = false;
  if (replyBtn) replyBtn.disabled = false;

  if (activeChatSessionId) {
    const activeConv = convs.find((c) => c.sessionId === activeChatSessionId);
    if (activeConv) renderChatThread(activeConv);
  }
}

window.selectAdminChatSession = async function (sessionId) {
  activeChatSessionId = sessionId;

  const replyInput = document.getElementById("admin-chat-reply-input");
  const replyBtn = document.getElementById("btn-admin-reply");
  if (replyInput) replyInput.disabled = false;
  if (replyBtn) replyBtn.disabled = false;

  await pollAdminChat();
  if (replyInput) replyInput.focus();
};

function renderChatThread(conv) {
  const threadBody = document.getElementById("admin-chat-thread-body");
  const activeTitle = document.getElementById("admin-active-chat-title");
  const activeMeta = document.getElementById("admin-active-chat-meta");

  if (activeTitle) activeTitle.textContent = `Client: ${conv.customerName || "Visitor"}`;
  if (activeMeta) activeMeta.textContent = conv.customerPhone ? `Phone: ${conv.customerPhone} | Email: ${conv.customerEmail || "N/A"}` : `Email: ${conv.customerEmail || "Storefront Visitor"}`;

  if (threadBody) {
    threadBody.innerHTML = (conv.messages || [])
      .map(
        (m) => `
      <div style="max-width:80%;padding:10px 14px;border-radius:12px;font-size:0.85rem;align-self:${
        m.sender === "admin" ? "flex-end" : "flex-start"
      };background:${m.sender === "admin" ? "#FF5B00" : "#22252c"};color:#ffffff;">
        <div>${m.text}</div>
        <span style="font-size:0.65rem;opacity:0.6;display:block;margin-top:4px;">${new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${m.senderName}</span>
      </div>
    `
      )
      .join("");

    threadBody.scrollTop = threadBody.scrollHeight;
  }
}

/* ==========================================================================
   6. STORE SETTINGS CONTROLLER
   ========================================================================== */
function initSettingsView() {
  const saveBtn = document.getElementById("btn-save-settings");
  loadSettingsIntoForm();

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const store = window.OchirStore;

      const storeName = document.getElementById("set-store-name")?.value.trim();
      const whatsappNumber = document.getElementById("set-whatsapp-num")?.value.trim();
      const whatsappPrefill = document.getElementById("set-whatsapp-prefill")?.value.trim();
      const phone = document.getElementById("set-store-phone")?.value.trim();
      const email = document.getElementById("set-store-email")?.value.trim();
      const address = document.getElementById("set-store-address")?.value.trim();

      const bkashNum = document.getElementById("set-bkash-num")?.value.trim();
      const rocketNum = document.getElementById("set-rocket-num")?.value.trim();
      const insideCharge = parseFloat(document.getElementById("set-charge-inside")?.value) || 80;
      const outsideCharge = parseFloat(document.getElementById("set-charge-outside")?.value) || 150;
      const freeThreshold = parseFloat(document.getElementById("set-free-threshold")?.value) || 5000;
      const bannerText = document.getElementById("set-banner-text")?.value.trim();

      const updatedSettings = {
        storeName,
        whatsappNumber,
        whatsappPrefill,
        phone,
        email,
        address,
        deliveryChargeInside: insideCharge,
        deliveryChargeOutside: outsideCharge,
        freeDeliveryThreshold: freeThreshold,
        bannerText,
        paymentMethods: {
          bkash: {
            enabled: true,
            number: bkashNum,
            type: "Personal / Merchant",
            instructions: `Send Money or Make Payment to ${bkashNum} via bKash App or *247#.`
          },
          rocket: {
            enabled: true,
            number: rocketNum,
            type: "Personal",
            instructions: `Send Money to Rocket account ${rocketNum} via Rocket App or *322#.`
          },
          cod: {
            enabled: true,
            instructions: "Cash on Delivery is available across Bangladesh."
          }
        }
      };

      const res = await store.updateSettings(updatedSettings);
      if (res.success) {
        alert("Atelier store settings successfully updated and live.");
      } else {
        alert(res.message || "Failed to save settings.");
      }
    });
  }
}

function loadSettingsIntoForm() {
  const store = window.OchirStore;
  const s = store.getSettings();

  const setStoreName = document.getElementById("set-store-name");
  const setWhatsappNum = document.getElementById("set-whatsapp-num");
  const setWhatsappPrefill = document.getElementById("set-whatsapp-prefill");
  const setStorePhone = document.getElementById("set-store-phone");
  const setStoreEmail = document.getElementById("set-store-email");
  const setStoreAddress = document.getElementById("set-store-address");

  const setBkashNum = document.getElementById("set-bkash-num");
  const setRocketNum = document.getElementById("set-rocket-num");
  const setInsideCharge = document.getElementById("set-charge-inside");
  const setOutsideCharge = document.getElementById("set-charge-outside");
  const setFreeThreshold = document.getElementById("set-free-threshold");
  const setBannerText = document.getElementById("set-banner-text");

  if (setStoreName) setStoreName.value = s.storeName || "Ochir Atelier";
  if (setWhatsappNum) setWhatsappNum.value = s.whatsappNumber || "01335852121";
  if (setWhatsappPrefill) setWhatsappPrefill.value = s.whatsappPrefill || "Hello OCHIR, I need help with a product or order.";
  if (setStorePhone) setStorePhone.value = s.phone || "+880 1335 852121";
  if (setStoreEmail) setStoreEmail.value = s.email || "concierge@ochir.com";
  if (setStoreAddress) setStoreAddress.value = s.address || "Banani Atelier, Road 11, Dhaka, Bangladesh";

  if (setBkashNum) setBkashNum.value = s.paymentMethods?.bkash?.number || "01335852121";
  if (setRocketNum) setRocketNum.value = s.paymentMethods?.rocket?.number || "01335852121-8";
  if (setInsideCharge) setInsideCharge.value = s.deliveryChargeInside !== undefined ? s.deliveryChargeInside : 80;
  if (setOutsideCharge) setOutsideCharge.value = s.deliveryChargeOutside !== undefined ? s.deliveryChargeOutside : 150;
  if (setFreeThreshold) setFreeThreshold.value = s.freeDeliveryThreshold !== undefined ? s.freeDeliveryThreshold : 5000;
  if (setBannerText) setBannerText.value = s.bannerText || "";
}
