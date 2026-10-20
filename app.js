/**
 * OCHIR PUBLIC FLAGSHIP STOREFRONT CONTROLLER (app.js)
 * Full E-Commerce Implementation: Dynamic Catalog, Luxury Empty State,
 * Search, Price Filters, Sorting, Customer Authentication, Client Dossier,
 * Shopping Bag, Manual Checkout (bKash, Rocket, COD), Live Concierge Chat,
 * Order Tracking, and 3D Visual Showcases.
 */

let activeCategoryFilter = "all";
let activeSearchQuery = "";
let activeMinPrice = null;
let activeMaxPrice = null;
let activeSortOrder = "newest";
let appliedCouponCode = null;
let appliedDiscountAmount = 0;
let checkoutStep = 1;
let activeModalProduct = null;
let chatPollTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  if (!window.OchirStore) {
    console.error("OchirStore not loaded.");
    return;
  }

  // Visual Showcases & Interactions
  initOchirShowcase();
  initAmbientStardustCanvas();
  initPatinaSlider();
  init3DCardTilt();
  initLookbookQuickAcquire();
  initManifestoScrollReveal();
  initMagneticButton();
  initMobileDrawer();
  initHeaderScrollAdaptation();
  initCurrencySelector();

  // E-Commerce Features
  initStoreProductsGrid();
  initProductDetailModal();
  initCartDrawer();
  initCustomerAuth();
  initCustomerDossier();
  initMultiStepCheckout();
  initOrderTracking();
  initLiveConciergeChat();
  initModalBackdrops();

  // Subscribe to store updates
  window.OchirStore.subscribe(() => {
    renderStoreProducts();
    renderCartDrawer();
    updateAuthHeaderUI();
  });

  // Initial UI refresh once store finishes async initialization
  setTimeout(() => {
    renderStoreProducts();
    renderCartDrawer();
    updateAuthHeaderUI();
  }, 300);
});

/* ==========================================================================
   TOAST NOTIFICATION ENGINE
   ========================================================================== */
function showOchirToast(message, type = "info") {
  const container = document.getElementById("ochir-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `ochir-toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === "success" ? "✓" : type === "warning" ? "⚠️" : "✦"}</span>
    <span class="toast-text">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ==========================================================================
   1. STORE PRODUCTS GRID, SEARCH, FILTER, SORT & EMPTY STATE
   ========================================================================== */
function initStoreProductsGrid() {
  // Category tabs
  const filterTabs = document.querySelectorAll("#collection .pill-tab");
  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      filterTabs.forEach((t) => {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      activeCategoryFilter = tab.dataset.category;
      renderStoreProducts();
    });
  });

  // Search input
  const searchInput = document.getElementById("shop-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      activeSearchQuery = e.target.value.trim().toLowerCase();
      renderStoreProducts();
    });
  }

  // Price range filters
  const applyPriceBtn = document.getElementById("shop-apply-price");
  if (applyPriceBtn) {
    applyPriceBtn.addEventListener("click", () => {
      const minVal = parseFloat(document.getElementById("shop-min-price")?.value);
      const maxVal = parseFloat(document.getElementById("shop-max-price")?.value);
      activeMinPrice = !isNaN(minVal) ? minVal : null;
      activeMaxPrice = !isNaN(maxVal) ? maxVal : null;
      renderStoreProducts();
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById("shop-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      activeSortOrder = e.target.value;
      renderStoreProducts();
    });
  }

  renderStoreProducts();
}

function renderStoreProducts() {
  const grid = document.getElementById("store-products-grid");
  if (!grid) return;

  const store = window.OchirStore;
  const allProducts = store.getProducts();

  // Filter pipeline
  let filtered = allProducts.filter((p) => p.status === "published" || !p.status);

  // Category filter
  if (activeCategoryFilter !== "all") {
    filtered = filtered.filter((p) => (p.category || "").toLowerCase() === activeCategoryFilter.toLowerCase());
  }

  // Search filter
  if (activeSearchQuery) {
    filtered = filtered.filter(
      (p) =>
        (p.title || "").toLowerCase().includes(activeSearchQuery) ||
        (p.subtitle || "").toLowerCase().includes(activeSearchQuery) ||
        (p.story || "").toLowerCase().includes(activeSearchQuery) ||
        (p.sku || "").toLowerCase().includes(activeSearchQuery)
    );
  }

  // Price filter
  if (activeMinPrice !== null) {
    filtered = filtered.filter((p) => (p.basePrice || 0) >= activeMinPrice);
  }
  if (activeMaxPrice !== null) {
    filtered = filtered.filter((p) => (p.basePrice || 0) <= activeMaxPrice);
  }

  // Sorting
  if (activeSortOrder === "price_asc") {
    filtered.sort((a, b) => (a.basePrice || 0) - (b.basePrice || 0));
  } else if (activeSortOrder === "price_desc") {
    filtered.sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));
  } else {
    // Newest
    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  // Professional Quiet Luxury Empty State
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="shop-empty-state">
        <div class="shop-empty-symbol">✦</div>
        <h3 class="shop-empty-title">The Atelier Collection is in Preparation.</h3>
        <p class="shop-empty-desc">
          ${
            activeSearchQuery || activeMinPrice || activeMaxPrice || activeCategoryFilter !== "all"
              ? "No pieces currently match your selected filters. Please adjust your search criteria or explore our complete catalog."
              : "Our master artisans are currently handcrafting and regulating our upcoming allocations. No publicly purchasable pieces are listed at this moment. You may contact our private atelier concierge directly via WhatsApp to request priority allocation or bespoke commission availability."
          }
        </p>
        <div class="shop-empty-actions">
          <a
            href="https://wa.me/8801335852121?text=Hello%20OCHIR,%20I%20would%20like%20to%20inquire%20about%20upcoming%20product%20allocations."
            target="_blank"
            rel="noopener"
            class="btn btn-primary"
          >
            <span>Inquire via WhatsApp: 01335852121 ↗</span>
          </a>
          <button type="button" class="btn btn-secondary" onclick="openLiveConciergeChat()">
            <span>Open Live Concierge Chat</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Render authentic products
  grid.innerHTML = filtered
    .map((prod) => {
      const stock = prod.stock || 0;
      const isSoldOut = stock <= 0 || (prod.flags && prod.flags.soldOut);
      const isWishlisted = store.isInWishlist(prod.id);

      const stockBadge = isSoldOut
        ? `<span class="stock-pill sold-out">Sold Out</span>`
        : stock <= 5
        ? `<span class="stock-pill low-stock">Only ${stock} Remaining</span>`
        : `<span class="stock-pill in-stock">In Stock (${stock})</span>`;

      const primaryImg = (prod.images && prod.images.primary) || "";
      const altImg = (prod.images && prod.images.alternate) || primaryImg;
      const formattedPrice = store.formatMoney(prod.basePrice);
      const formattedCompare = prod.comparePrice ? store.formatMoney(prod.comparePrice) : null;

      return `
        <article class="store-product-card" data-id="${prod.id}">
          <div class="card-media-wrap">
            <div class="product-card-top-actions">
              <button
                type="button"
                class="btn-wishlist-heart ${isWishlisted ? "is-active" : ""}"
                onclick="handleWishlistToggle(event, '${prod.id}')"
                aria-label="${isWishlisted ? "Remove from wishlist" : "Add to wishlist"}"
                title="${isWishlisted ? "In Wishlist" : "Save to Wishlist"}"
              >
                ${isWishlisted ? "❤️" : "🤍"}
              </button>
            </div>

            <img class="card-img-primary" src="${primaryImg}" alt="${prod.title}" loading="lazy" />
            <img class="card-img-hover" src="${altImg}" alt="${prod.title} Perspective" loading="lazy" />

            <div class="card-badges-overlay">
              ${stockBadge}
              ${prod.flags && prod.flags.limitedEdition ? `<span class="card-badge-gold">Limited Edition</span>` : ""}
            </div>

            <div class="card-quick-overlay">
              <button type="button" class="btn btn-secondary btn-sm quick-view-btn" onclick="openProductDetailModal('${prod.id}')">Inspect</button>
              <button
                type="button"
                class="btn btn-primary btn-sm quick-acquire-btn"
                onclick="quickAcquireDirect('${prod.id}')"
                ${isSoldOut ? "disabled" : ""}
              >
                ${isSoldOut ? "Sold Out" : "Acquire Piece"}
              </button>
            </div>
          </div>

          <div class="card-details-wrap">
            <div class="card-topline">
              <span class="card-cat">${(prod.category || "").toUpperCase()}</span>
              <span class="card-sku">${prod.sku || ""}</span>
            </div>
            <h3 class="card-title" onclick="openProductDetailModal('${prod.id}')">${prod.title}</h3>
            <p class="card-subtitle">${prod.subtitle || ""}</p>
            <div class="card-pricing-row">
              <span class="card-price">${formattedPrice}</span>
              ${formattedCompare ? `<span class="card-compare-price">${formattedCompare}</span>` : ""}
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

// Global Wishlist Toggle Handler
window.handleWishlistToggle = async function (e, productId) {
  if (e) e.stopPropagation();
  const store = window.OchirStore;
  const res = await store.toggleWishlist(productId);
  if (res.success) {
    showOchirToast(
      res.added ? "Piece saved to your personal dossier wishlist." : "Piece removed from wishlist.",
      "info"
    );
    renderStoreProducts();
  }
};

// Global Quick Acquire Handler
window.quickAcquireDirect = function (productId) {
  const store = window.OchirStore;
  const prod = store.getProductById(productId);
  if (!prod) return;

  if (prod.stock <= 0) {
    showOchirToast("This piece is currently sold out.", "warning");
    return;
  }

  let defaultVariant = "";
  if (prod.variants?.dials && prod.variants?.straps) {
    defaultVariant = `${prod.variants.dials[0]} / ${prod.variants.straps[0]}`;
  } else if (prod.variants?.colors) {
    defaultVariant = prod.variants.colors[0];
  } else if (prod.variants?.finishes) {
    defaultVariant = prod.variants.finishes[0];
  }

  store.addToCart({
    productId: prod.id,
    title: prod.title,
    basePrice: prod.basePrice,
    variant: defaultVariant,
    engraving: "",
    image: (prod.images && prod.images.primary) || "",
    qty: 1
  });

  showOchirToast(`"${prod.title}" added to your bag.`, "success");
  openCartDrawer();
};

/* ==========================================================================
   2. INTERACTIVE PRODUCT DETAIL MODAL
   ========================================================================== */
function initProductDetailModal() {
  const modal = document.getElementById("product-detail-modal");
  const closeBtn = document.getElementById("pdm-close-btn");
  const addBagBtn = document.getElementById("pdm-add-bag-btn");

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.classList.remove("is-active");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    });
  }

  const pdmWishlistBtn = document.getElementById("pdm-wishlist-btn");
  if (pdmWishlistBtn) {
    pdmWishlistBtn.addEventListener("click", async (e) => {
      if (!activeModalProduct) return;
      await window.handleWishlistToggle(e, activeModalProduct.id);
      updatePdmWishlistState(activeModalProduct.id);
    });
  }

  if (addBagBtn) {
    addBagBtn.addEventListener("click", () => {
      if (!activeModalProduct) return;
      const store = window.OchirStore;

      if (activeModalProduct.stock <= 0) {
        showOchirToast("This piece is currently sold out.", "warning");
        return;
      }

      const select1 = document.getElementById("pdm-var-select-1");
      const select2 = document.getElementById("pdm-var-select-2");
      const engraveInput = document.getElementById("pdm-engrave-input");

      const var1 = select1 && !select1.parentElement.hidden ? select1.value : "";
      const var2 = select2 && !select2.parentElement.hidden ? select2.value : "";
      const variantStr = [var1, var2].filter(Boolean).join(" / ") || "Standard";
      const engraving = engraveInput ? engraveInput.value.trim() : "";

      store.addToCart({
        productId: activeModalProduct.id,
        title: activeModalProduct.title,
        basePrice: activeModalProduct.basePrice,
        variant: variantStr,
        engraving: engraving,
        image: (activeModalProduct.images && activeModalProduct.images.primary) || "",
        qty: 1
      });

      modal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
      showOchirToast(`"${activeModalProduct.title}" added to your shopping bag.`, "success");
      openCartDrawer();
    });
  }
}

function updatePdmWishlistState(productId) {
  const store = window.OchirStore;
  const isWishlisted = store.isInWishlist(productId);
  const btn = document.getElementById("pdm-wishlist-btn");
  const icon = document.getElementById("pdm-wishlist-icon");
  const txt = document.getElementById("pdm-wishlist-text");
  if (btn) {
    btn.classList.toggle("is-active", isWishlisted);
    btn.title = isWishlisted ? "In Wishlist (Click to Remove)" : "Save to Wishlist";
  }
  if (icon) icon.textContent = isWishlisted ? "❤️" : "🤍";
  if (txt) txt.textContent = isWishlisted ? "Saved" : "Wishlist";
}

window.openProductDetailModal = function (productId) {
  const store = window.OchirStore;
  const prod = store.getProductById(productId);
  if (!prod) return;

  activeModalProduct = prod;
  store.recordRecentView(prod.id);

  const modal = document.getElementById("product-detail-modal");
  const title = document.getElementById("pdm-title");
  const kicker = document.getElementById("pdm-kicker");
  const price = document.getElementById("pdm-price");
  const stockBadge = document.getElementById("pdm-stock-badge");
  const desc = document.getElementById("pdm-desc");
  const specsList = document.getElementById("pdm-specs-list");
  const mainImg = document.getElementById("pdm-main-img");
  const thumb1 = document.getElementById("pdm-thumb-1");
  const thumb2 = document.getElementById("pdm-thumb-2");

  if (title) title.textContent = prod.title;
  if (kicker) kicker.textContent = `${(prod.category || "").toUpperCase()} · ${prod.sku || ""}`;
  if (price) price.textContent = store.formatMoney(prod.basePrice);

  const stock = prod.stock || 0;
  if (stockBadge) {
    if (stock <= 0) {
      stockBadge.textContent = "Sold Out · Next Allocation in Preparation";
      stockBadge.className = "pdm-stock-status soldout";
    } else if (stock <= 5) {
      stockBadge.textContent = `Priority Allocation · Only ${stock} Remaining`;
      stockBadge.className = "pdm-stock-status low";
    } else {
      stockBadge.textContent = `In Stock (${stock} Pieces) · Ready for Insured Dispatch`;
      stockBadge.className = "pdm-stock-status in-stock";
    }
  }

  if (desc) desc.textContent = prod.story || "";

  // Dynamic Specs
  if (specsList) {
    const specs = prod.specs || {};
    const entries = Object.entries(specs);
    if (entries.length > 0) {
      specsList.innerHTML = entries
        .map(
          ([k, v]) => `
          <div class="pdm-spec-row">
            <span class="pdm-spec-label">${k.replace(/([A-Z])/g, " $1").toUpperCase()}</span>
            <span class="pdm-spec-val">${v}</span>
          </div>
        `
        )
        .join("");
    } else {
      specsList.innerHTML = `<p style="color:#86868b;font-size:0.8rem;">Master specifications regulated at the Ochir Atelier.</p>`;
    }
  }

  // Images & Thumbnails
  const primaryImg = (prod.images && prod.images.primary) || "";
  const altImg = (prod.images && prod.images.alternate) || primaryImg;

  if (mainImg) mainImg.src = primaryImg;
  if (thumb1) {
    thumb1.src = primaryImg;
    thumb1.onclick = () => {
      mainImg.src = primaryImg;
      thumb1.classList.add("is-active");
      if (thumb2) thumb2.classList.remove("is-active");
    };
  }
  if (thumb2) {
    thumb2.src = altImg;
    thumb2.onclick = () => {
      mainImg.src = altImg;
      thumb2.classList.add("is-active");
      if (thumb1) thumb1.classList.remove("is-active");
    };
  }

  // Dynamic Variants
  const group1 = document.getElementById("pdm-variant-group-1");
  const group2 = document.getElementById("pdm-variant-group-2");
  const label1 = document.getElementById("pdm-var-label-1");
  const label2 = document.getElementById("pdm-var-label-2");
  const select1 = document.getElementById("pdm-var-select-1");
  const select2 = document.getElementById("pdm-var-select-2");

  if (prod.variants?.dials && prod.variants?.straps) {
    if (group1) group1.hidden = false;
    if (label1) label1.textContent = "Dial Caliber Finish";
    if (select1) select1.innerHTML = prod.variants.dials.map((d) => `<option value="${d}">${d}</option>`).join("");

    if (group2) group2.hidden = false;
    if (label2) label2.textContent = "Strap Selection";
    if (select2) select2.innerHTML = prod.variants.straps.map((s) => `<option value="${s}">${s}</option>`).join("");
  } else if (prod.variants?.colors) {
    if (group1) group1.hidden = false;
    if (label1) label1.textContent = "Leather / Material Shade";
    if (select1) select1.innerHTML = prod.variants.colors.map((c) => `<option value="${c}">${c}</option>`).join("");
    if (group2) group2.hidden = true;
  } else if (prod.variants?.finishes) {
    if (group1) group1.hidden = false;
    if (label1) label1.textContent = "Metal Finish";
    if (select1) select1.innerHTML = prod.variants.finishes.map((f) => `<option value="${f}">${f}</option>`).join("");
    if (prod.variants?.sizes) {
      if (group2) group2.hidden = false;
      if (label2) label2.textContent = "Wrist Ellipse Sizing";
      if (select2) select2.innerHTML = prod.variants.sizes.map((sz) => `<option value="${sz}">${sz}</option>`).join("");
    } else {
      if (group2) group2.hidden = true;
    }
  } else {
    if (group1) group1.hidden = true;
    if (group2) group2.hidden = true;
  }

  // Button disabled state
  const addBagBtn = document.getElementById("pdm-add-bag-btn");
  if (addBagBtn) {
    addBagBtn.disabled = stock <= 0;
    addBagBtn.innerHTML = stock <= 0 ? "<span>Sold Out · Join Waitlist</span>" : "<span>Acquire Piece ↗</span>";
  }

  // Update Wishlist state on modal
  updatePdmWishlistState(prod.id);

  // Update direct WhatsApp Inquiry link
  const waBtn = document.getElementById("pdm-wa-inquire-btn");
  if (waBtn) {
    const waText = encodeURIComponent(
      `Hello OCHIR, I am interested in inquiring about "${prod.title}" (SKU: ${prod.sku || prod.id}). Could you please share more details?`
    );
    waBtn.href = `https://wa.me/8801335852121?text=${waText}`;
  }

  if (modal) {
    modal.classList.add("is-active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
};

/* ==========================================================================
   3. CUSTOMER AUTHENTICATION & HEADER ACCOUNT UI
   ========================================================================== */
function updateAuthHeaderUI() {
  const store = window.OchirStore;
  const user = store.getCurrentUser();
  const accountBtn = document.getElementById("header-account-btn");
  const avatarSpan = document.getElementById("header-user-avatar");
  const labelSpan = document.getElementById("header-account-label");
  const roleSwitcher = document.getElementById("header-role-switcher");
  const roleUserBtn = document.getElementById("header-btn-role-user");
  const roleAdminBtn = document.getElementById("header-btn-role-admin");
  const openControlRoomBtn = document.getElementById("header-btn-open-control-room");
  const topbarAdminBtn = document.getElementById("topbar-admin-room-btn");

  if (!accountBtn) return;

  if (user) {
    const initials = (user.name || "Client")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    if (avatarSpan) avatarSpan.textContent = initials;
    if (labelSpan) labelSpan.textContent = user.name.split(" ")[0];
    accountBtn.title = `Signed in as ${user.email}. Click to view dossier.`;

    // Role switcher visibility
    if (store.canAccessAdmin()) {
      if (roleSwitcher) {
        roleSwitcher.hidden = false;
        roleSwitcher.style.display = "inline-flex";
      }
      const activeRole = store.getActiveRole();
      if (roleUserBtn) roleUserBtn.classList.toggle("is-active", activeRole === "customer");
      if (roleAdminBtn) roleAdminBtn.classList.toggle("is-active", activeRole === "admin");

      if (openControlRoomBtn) {
        openControlRoomBtn.hidden = activeRole !== "admin";
        openControlRoomBtn.style.display = activeRole === "admin" ? "inline-flex" : "none";
      }
      if (topbarAdminBtn) {
        topbarAdminBtn.hidden = activeRole !== "admin";
        topbarAdminBtn.style.display = activeRole === "admin" ? "inline-flex" : "none";
      }
    } else {
      if (roleSwitcher) {
        roleSwitcher.hidden = true;
        roleSwitcher.style.display = "none";
      }
      if (openControlRoomBtn) {
        openControlRoomBtn.hidden = true;
        openControlRoomBtn.style.display = "none";
      }
      if (topbarAdminBtn) {
        topbarAdminBtn.hidden = true;
        topbarAdminBtn.style.display = "none";
      }
    }
  } else {
    if (avatarSpan) avatarSpan.textContent = "?";
    if (labelSpan) labelSpan.textContent = "Sign In";
    accountBtn.title = "Sign In or Register";

    if (roleSwitcher) {
      roleSwitcher.hidden = true;
      roleSwitcher.style.display = "none";
    }
    if (openControlRoomBtn) {
      openControlRoomBtn.hidden = true;
      openControlRoomBtn.style.display = "none";
    }
    if (topbarAdminBtn) {
      topbarAdminBtn.hidden = true;
      topbarAdminBtn.style.display = "none";
    }
  }
}

function initCustomerAuth() {
  const accountBtn = document.getElementById("header-account-btn");
  const authModal = document.getElementById("auth-modal");
  const closeBtn = document.getElementById("auth-modal-close");

  const tabSignin = document.getElementById("tab-auth-signin");
  const tabRegister = document.getElementById("tab-auth-register");
  const btnShowForgot = document.getElementById("btn-show-forgot");
  const btnBackToLogin = document.getElementById("btn-back-to-login");

  const formSignin = document.getElementById("auth-signin-form");
  const formRegister = document.getElementById("auth-register-form");
  const formForgot = document.getElementById("auth-forgot-form");

  // Header Role Switcher Controls
  const roleUserBtn = document.getElementById("header-btn-role-user");
  const roleAdminBtn = document.getElementById("header-btn-role-admin");
  const openControlRoomBtn = document.getElementById("header-btn-open-control-room");
  const topbarAdminBtn = document.getElementById("topbar-admin-room-btn");

  if (roleUserBtn) {
    roleUserBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const store = window.OchirStore;
      store.setActiveRole("customer");
      updateAuthHeaderUI();
      showOchirToast("Switched role to User (Client Mode).", "info");
    });
  }

  if (roleAdminBtn) {
    roleAdminBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const store = window.OchirStore;
      if (store.canAccessAdmin()) {
        store.setActiveRole("admin");
        updateAuthHeaderUI();
        showOchirToast("Switched role to Admin. Admin Control Room is ready.", "success");
      }
    });
  }

  if (openControlRoomBtn) {
    openControlRoomBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.openAdminControlRoom) window.openAdminControlRoom();
    });
  }

  if (topbarAdminBtn) {
    topbarAdminBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.openAdminControlRoom) window.openAdminControlRoom();
    });
  }

  const footerAdminLink = document.getElementById("footer-admin-link");
  const footerAdminBottomLink = document.getElementById("footer-admin-bottom-link");

  const handleAdminLaunch = (e) => {
    e.preventDefault();
    const store = window.OchirStore;
    if (store.canAccessAdmin()) {
      store.setActiveRole("admin");
      updateAuthHeaderUI();
      if (window.openAdminControlRoom) window.openAdminControlRoom();
    } else {
      openAuthModal("signin");
      showOchirToast("Please sign in as Administrator to access the Control Room.", "info");
    }
  };

  if (footerAdminLink) footerAdminLink.addEventListener("click", handleAdminLaunch);
  if (footerAdminBottomLink) footerAdminBottomLink.addEventListener("click", handleAdminLaunch);

  if (accountBtn) {
    accountBtn.addEventListener("click", () => {
      const store = window.OchirStore;
      if (store.isAuthenticated()) {
        openCustomerDossierModal();
      } else {
        openAuthModal("signin");
      }
    });
  }

  if (closeBtn && authModal) {
    closeBtn.addEventListener("click", () => {
      authModal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
    });
  }

  function switchAuthTab(tab) {
    if (tabSignin) tabSignin.classList.toggle("is-active", tab === "signin");
    if (tabRegister) tabRegister.classList.toggle("is-active", tab === "register");

    if (formSignin) formSignin.hidden = tab !== "signin";
    if (formRegister) formRegister.hidden = tab !== "register";
    if (formForgot) formForgot.hidden = tab !== "forgot";

    const title = document.getElementById("auth-modal-title");
    if (title) {
      title.textContent =
        tab === "signin"
          ? "Sign In to Ochir"
          : tab === "register"
          ? "Create Atelier Account"
          : "Account Password Reset";
    }
  }

  if (tabSignin) tabSignin.addEventListener("click", () => switchAuthTab("signin"));
  if (tabRegister) tabRegister.addEventListener("click", () => switchAuthTab("register"));
  if (btnShowForgot) btnShowForgot.addEventListener("click", () => switchAuthTab("forgot"));
  if (btnBackToLogin) btnBackToLogin.addEventListener("click", () => switchAuthTab("signin"));

  // Handle Sign In Submit
  if (formSignin) {
    formSignin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("signin-email")?.value.trim();
      const password = document.getElementById("signin-password")?.value;
      const errorDiv = document.getElementById("signin-error");

      const store = window.OchirStore;
      const res = await store.login({ email, password });

      if (res.success) {
        if (errorDiv) errorDiv.style.display = "none";
        authModal.classList.remove("is-active");
        document.body.classList.remove("modal-open");
        updateAuthHeaderUI();
        showOchirToast(`Welcome back, ${res.user.name}.`, "success");

        // If user was attempting checkout, proceed directly
        if (pendingCheckoutAfterAuth) {
          pendingCheckoutAfterAuth = false;
          openCheckoutModal();
        }
      } else {
        if (errorDiv) {
          errorDiv.textContent = res.message || "Invalid credentials.";
          errorDiv.style.display = "block";
        }
      }
    });
  }

  // Handle Register Submit
  if (formRegister) {
    formRegister.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("reg-name")?.value.trim();
      const email = document.getElementById("reg-email")?.value.trim();
      const phone = document.getElementById("reg-phone")?.value.trim();
      const password = document.getElementById("reg-password")?.value;
      const errorDiv = document.getElementById("register-error");

      const store = window.OchirStore;
      const res = await store.register({ name, email, phone, password });

      if (res.success) {
        if (errorDiv) errorDiv.style.display = "none";
        authModal.classList.remove("is-active");
        document.body.classList.remove("modal-open");
        updateAuthHeaderUI();
        showOchirToast(`Atelier account registered for ${res.user.name}.`, "success");

        if (pendingCheckoutAfterAuth) {
          pendingCheckoutAfterAuth = false;
          openCheckoutModal();
        }
      } else {
        if (errorDiv) {
          errorDiv.textContent = res.message || "Registration failed. Please check your details and try again.";
          errorDiv.style.display = "block";
        }
      }
    });
  }

  // Handle Forgot Password Submit
  if (formForgot) {
    let requestedEmail = "";
    formForgot.addEventListener("submit", async (e) => {
      e.preventDefault();
      const store = window.OchirStore;
      const emailInput = document.getElementById("forgot-email");
      const codeStep = document.getElementById("forgot-step-code");
      const msgDiv = document.getElementById("forgot-msg");
      const submitBtn = document.getElementById("btn-submit-forgot");

      if (codeStep.hidden) {
        requestedEmail = emailInput.value.trim();
        const res = await store.forgotPassword(requestedEmail);
        codeStep.hidden = false;
        if (msgDiv) {
          msgDiv.style.color = "#2e7d32";
          msgDiv.textContent = res.demoCode
            ? `Verification reset code issued: ${res.demoCode}`
            : "Reset code dispatched to email.";
        }
        if (submitBtn) submitBtn.innerHTML = `<span>Update Master Password →</span>`;
      } else {
        const code = document.getElementById("reset-code")?.value.trim();
        const newPassword = document.getElementById("reset-new-pass")?.value;
        const res = await store.resetPassword({ email: requestedEmail, code, newPassword });
        if (res.success) {
          showOchirToast("Password reset successful. Please sign in.", "success");
          switchAuthTab("signin");
          codeStep.hidden = true;
          if (submitBtn) submitBtn.innerHTML = `<span>Send Verification Code →</span>`;
        } else {
          if (msgDiv) {
            msgDiv.style.color = "#e02424";
            msgDiv.textContent = res.message || "Reset failed.";
          }
        }
      }
    });
  }
}

let pendingCheckoutAfterAuth = false;

function openAuthModal(defaultTab = "signin", checkoutNotice = false) {
  const modal = document.getElementById("auth-modal");
  if (!modal) return;

  const tabSignin = document.getElementById("tab-auth-signin");
  const tabRegister = document.getElementById("tab-auth-register");
  if (defaultTab === "register" && tabRegister) tabRegister.click();
  else if (tabSignin) tabSignin.click();

  if (checkoutNotice) {
    showOchirToast("Please sign in or register to secure your allocation and delivery address.", "info");
  }

  modal.classList.add("is-active");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

/* ==========================================================================
   4. CUSTOMER PROFILE & ORDER HISTORY DOSSIER
   ========================================================================== */
function initCustomerDossier() {
  const modal = document.getElementById("customer-dossier-modal");
  const closeBtn = document.getElementById("customer-dossier-close");
  const tabs = document.querySelectorAll(".dossier-tab-btn");
  const logoutBtn = document.getElementById("btn-dossier-logout");
  const profileForm = document.getElementById("dossier-profile-form");

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
    });
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      btn.classList.add("is-active");
      const target = btn.dataset.dossierTab;

      ["orders", "addresses", "wishlist", "profile"].forEach((name) => {
        const panel = document.getElementById(`dossier-panel-${name}`);
        if (panel) panel.hidden = name !== target;
      });

      if (target === "orders") renderDossierOrders();
      if (target === "wishlist") renderDossierWishlist();
    });
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      const store = window.OchirStore;
      store.logout();
      modal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
      updateAuthHeaderUI();
      showOchirToast("Signed out successfully.", "info");
    });
  }

  // Dossier Role Switcher Event Handlers
  const dossierRoleUserBtn = document.getElementById("btn-role-mode-user");
  const dossierRoleAdminBtn = document.getElementById("btn-role-mode-admin");
  const dossierLaunchAdminBtn = document.getElementById("btn-dossier-launch-control-room");

  if (dossierRoleUserBtn) {
    dossierRoleUserBtn.addEventListener("click", () => {
      const store = window.OchirStore;
      store.setActiveRole("customer");
      updateDossierRoleUI();
      updateAuthHeaderUI();
      showOchirToast("Role set to User (Client Mode).", "info");
    });
  }

  if (dossierRoleAdminBtn) {
    dossierRoleAdminBtn.addEventListener("click", () => {
      const store = window.OchirStore;
      if (store.canAccessAdmin()) {
        store.setActiveRole("admin");
        updateDossierRoleUI();
        updateAuthHeaderUI();
        showOchirToast("Role set to Admin. Control Room is ready.", "success");
      }
    });
  }

  if (dossierLaunchAdminBtn) {
    dossierLaunchAdminBtn.addEventListener("click", () => {
      modal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
      if (window.openAdminControlRoom) {
        window.openAdminControlRoom();
      }
    });
  }

  // 1-Click Push Profile to Cloud Firestore
  const btnSyncUserFirestore = document.getElementById("btn-sync-user-firestore");
  if (btnSyncUserFirestore) {
    btnSyncUserFirestore.addEventListener("click", async () => {
      const store = window.OchirStore;
      const user = store.getCurrentUser();
      if (!user) return;

      btnSyncUserFirestore.disabled = true;
      btnSyncUserFirestore.innerHTML = `<span>⏳ Writing to Cloud Firestore...</span>`;

      const result = await store.syncUserWithFirestore();
      btnSyncUserFirestore.disabled = false;
      btnSyncUserFirestore.innerHTML = `<span>🔥 Push Profile to Firestore Now</span>`;

      updateDossierRoleUI(result);

      if (result.success) {
        showOchirToast(`✓ Profile synchronized to Firestore: users/${user.email}`, "success");
      } else if (result.code === "permission-denied") {
        showOchirToast(`Firebase Security Rules blocked write (403). Follow instructions in the red box.`, "error");
      } else {
        showOchirToast(result.message || "Failed to sync with Firestore.", "warning");
      }
    });
  }

  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const store = window.OchirStore;
      const name = document.getElementById("dossier-name")?.value.trim();
      const phone = document.getElementById("dossier-phone")?.value.trim();

      const res = await store.updateProfile({ name, phone });
      if (res.success) {
        showOchirToast("Profile details updated.", "success");
        updateAuthHeaderUI();
      } else {
        showOchirToast("Could not update profile.", "warning");
      }
    });
  }
}

function updateDossierRoleUI(lastSyncResult) {
  const store = window.OchirStore;
  const user = store.getCurrentUser();
  const dossierRoleCard = document.getElementById("dossier-role-control-card");
  const dossierRoleUserBtn = document.getElementById("btn-role-mode-user");
  const dossierRoleAdminBtn = document.getElementById("btn-role-mode-admin");
  const dossierAdminActionBox = document.getElementById("role-admin-action-box");
  const dossierClearanceBadge = document.getElementById("dossier-clearance-badge");
  const firestoreRolePill = document.getElementById("dossier-firestore-role-pill");
  const firestoreDocId = document.getElementById("dossier-firestore-doc-id");
  const firestoreRoleInstruction = document.getElementById("firestore-role-instruction");
  const syncStateLabel = document.getElementById("dossier-firestore-sync-state");
  const permAlert = document.getElementById("firestore-permission-alert");
  const successAlert = document.getElementById("firestore-sync-success-alert");

  // STRICT REQUIREMENT: Only verified administrators can ever see the role switcher or Firebase telemetry.
  // Regular customers must NEVER see any Firebase staff or role switches.
  if (!user || !store.canAccessAdmin()) {
    if (dossierRoleCard) {
      dossierRoleCard.hidden = true;
      dossierRoleCard.style.display = "none";
    }
    return;
  }

  if (dossierRoleCard) {
    dossierRoleCard.hidden = false;
    dossierRoleCard.style.display = "block";
  }

  const emailKey = user.email ? user.email.toLowerCase().trim() : "";
  if (firestoreDocId) firestoreDocId.textContent = `users/${emailKey}`;

  const isUserAdmin = true;
  if (dossierClearanceBadge) {
    dossierClearanceBadge.textContent = isUserAdmin ? "ADMINISTRATOR (FIRESTORE)" : "CLIENT (USER)";
    dossierClearanceBadge.style.background = isUserAdmin ? "rgba(255, 91, 0, 0.16)" : "rgba(255, 255, 255, 0.08)";
    dossierClearanceBadge.style.color = isUserAdmin ? "#ff5b00" : "#86868b";
    dossierClearanceBadge.style.borderColor = isUserAdmin ? "rgba(255, 91, 0, 0.35)" : "rgba(255, 255, 255, 0.12)";
  }

  if (firestoreRolePill) {
    firestoreRolePill.textContent = isUserAdmin ? "ROLE: ADMIN (VERIFIED)" : "ROLE: USER";
    firestoreRolePill.style.background = isUserAdmin ? "rgba(52, 211, 153, 0.12)" : "rgba(255, 255, 255, 0.08)";
    firestoreRolePill.style.color = isUserAdmin ? "#34d399" : "#86868b";
    firestoreRolePill.style.borderColor = isUserAdmin ? "rgba(52, 211, 153, 0.3)" : "rgba(255, 255, 255, 0.12)";
  }

  // Handle Sync State and Permission Alerts
  const isPermissionDenied = window.OchirFirestorePermissionDenied || (lastSyncResult && lastSyncResult.code === "permission-denied");
  const isSyncSuccess = (lastSyncResult && lastSyncResult.success) || (!isPermissionDenied && store.isFirestoreReady() && lastSyncResult && !lastSyncResult.code);

  if (isPermissionDenied) {
    if (syncStateLabel) {
      syncStateLabel.textContent = "⚠️ Permission Blocked (403)";
      syncStateLabel.style.color = "#f87171";
    }
    if (permAlert) permAlert.style.display = "block";
    if (successAlert) successAlert.style.display = "none";
  } else if (lastSyncResult && lastSyncResult.success) {
    if (syncStateLabel) {
      syncStateLabel.textContent = "✓ Synced with Cloud";
      syncStateLabel.style.color = "#34d399";
    }
    if (permAlert) permAlert.style.display = "none";
    if (successAlert) successAlert.style.display = "block";
  } else {
    if (syncStateLabel) {
      syncStateLabel.textContent = store.isFirestoreReady() ? "Ready to sync" : "Firestore Standby";
      syncStateLabel.style.color = "#86868b";
    }
    if (permAlert) permAlert.style.display = "none";
  }

  if (firestoreRoleInstruction) {
    if (isUserAdmin) {
      firestoreRoleInstruction.innerHTML = `
        <span style="color:#34d399;font-weight:600;">✓ Master clearance verified in Cloud Firestore.</span>
        You can freely toggle between User mode and Admin Control Room mode anytime.
      `;
    } else {
      firestoreRoleInstruction.innerHTML = `
        🔥 <strong>To make this account Admin:</strong> Open your <a href="https://console.firebase.google.com/project/ochir-b84d3/firestore" target="_blank" rel="noopener" style="color:#ff5b00;text-decoration:underline;font-weight:600;">Firebase Console</a>, open collection <code>users</code>, find doc <code>${emailKey}</code>, and change <code>role: "user"</code> to <code>role: "admin"</code>. Updates reflect instantly without page reload!
      `;
    }
  }

  if (isUserAdmin) {
    const activeRole = store.getActiveRole();
    if (dossierRoleUserBtn) {
      dossierRoleUserBtn.disabled = false;
      dossierRoleUserBtn.classList.toggle("is-active", activeRole === "customer");
    }
    if (dossierRoleAdminBtn) {
      dossierRoleAdminBtn.disabled = false;
      dossierRoleAdminBtn.classList.toggle("is-active", activeRole === "admin");
    }
    if (dossierAdminActionBox) dossierAdminActionBox.hidden = activeRole !== "admin";
  } else {
    if (dossierRoleUserBtn) {
      dossierRoleUserBtn.classList.add("is-active");
      dossierRoleUserBtn.disabled = false;
    }
    if (dossierRoleAdminBtn) {
      dossierRoleAdminBtn.classList.remove("is-active");
      dossierRoleAdminBtn.disabled = true;
      dossierRoleAdminBtn.title = "To enable Admin mode, change your role to 'admin' in Firestore.";
    }
    if (dossierAdminActionBox) dossierAdminActionBox.hidden = true;
  }
}

async function openCustomerDossierModal() {
  const store = window.OchirStore;
  const user = store.getCurrentUser();
  if (!user) return openAuthModal("signin");

  const modal = document.getElementById("customer-dossier-modal");
  const nameHeader = document.getElementById("dossier-customer-name");
  const nameInput = document.getElementById("dossier-name");
  const phoneInput = document.getElementById("dossier-phone");
  const emailInput = document.getElementById("dossier-email");

  if (nameHeader) nameHeader.textContent = user.name;
  if (nameInput) nameInput.value = user.name;
  if (phoneInput) phoneInput.value = user.phone || "";
  if (emailInput) emailInput.value = user.email;

  updateDossierRoleUI();
  renderDossierOrders();
  renderDossierAddresses();
  renderDossierWishlist();

  if (modal) {
    modal.classList.add("is-active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  // Only verified admins test/sync Firestore telemetry in background
  if (store.canAccessAdmin()) {
    store.syncUserWithFirestore().then((res) => {
      updateDossierRoleUI(res);
    }).catch(() => {});
  }
}

async function renderDossierOrders() {
  const store = window.OchirStore;
  const list = document.getElementById("dossier-orders-list");
  const countBadge = document.getElementById("dossier-order-count");
  if (!list) return;

  const orders = await store.getMyOrders();
  if (countBadge) countBadge.textContent = orders.length;

  if (orders.length === 0) {
    list.innerHTML = `<p style="color:#86868b;font-size:0.9rem;text-align:center;padding:32px;">No acquisition history recorded in this dossier yet.</p>`;
    return;
  }

  list.innerHTML = orders
    .map(
      (o) => `
    <div class="order-history-card">
      <div class="order-history-header">
        <div>
          <span class="order-history-id">${o.id}</span>
          <span class="table-status-pill status-${o.status.toLowerCase().replace(/\s+/g, "-")}">${o.status}</span>
          <span style="font-size:0.75rem;color:#86868b;margin-left:8px;">Payment: <strong>${o.paymentStatus}</strong></span>
        </div>
        <span style="font-size:0.8rem;color:#86868b;">${new Date(o.createdAt).toLocaleDateString()}</span>
      </div>

      <div class="order-history-items-list">
        ${(o.items || [])
          .map(
            (item) => `
          <div class="order-history-item-row">
            <span>${item.title} (${item.variant || "Standard"}) × ${item.qty}</span>
            <strong>${store.formatMoney(item.unitPrice * item.qty)}</strong>
          </div>
        `
          )
          .join("")}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid rgba(0,0,0,0.05);flex-wrap:wrap;gap:8px;">
        <span style="font-size:0.85rem;color:#6e6e73;">Courier: <strong>${o.courierName || "Processing"}</strong> ${
        o.trackingNumber ? `(#${o.trackingNumber})` : ""
      }</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.openTrackingModal('${o.id}')" style="padding:4px 8px;font-size:0.75rem;">
            Track Order ↗
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.printOrderInvoice('${o.id}')" style="padding:4px 8px;font-size:0.75rem;">
            🖨️ Invoice
          </button>
          <strong style="font-size:1.05rem;margin-left:6px;">Total: ${store.formatMoney(o.total)}</strong>
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

function renderDossierAddresses() {
  const store = window.OchirStore;
  const user = store.getCurrentUser();
  const list = document.getElementById("dossier-addresses-list");
  if (!list || !user) return;

  const addresses = user.addresses || [];
  if (addresses.length === 0) {
    list.innerHTML = `<p style="color:#86868b;font-size:0.9rem;text-align:center;padding:24px;">No saved delivery destinations yet. Addresses are saved automatically when ordering.</p>`;
    return;
  }

  list.innerHTML = addresses
    .map(
      (a) => `
    <div style="padding:14px;border-radius:12px;background:#f5f6f8;border:1px solid rgba(0,0,0,0.06);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;">
        <strong>${a.recipient || user.name}</strong>
        <span style="font-size:0.75rem;color:#FF5B00;font-weight:600;">${a.label || "Address"}</span>
      </div>
      <p style="font-size:0.85rem;margin:6px 0;color:#1d1d1f;">${a.address}, ${a.area || ""}, ${a.district}</p>
      <span style="font-size:0.78rem;color:#86868b;">Phone: ${a.phone}</span>
    </div>
  `
    )
    .join("");
}

function renderDossierWishlist() {
  const store = window.OchirStore;
  const list = document.getElementById("dossier-wishlist-items");
  const countBadge = document.getElementById("dossier-wishlist-count");
  if (!list) return;

  const wishlistIds = store.getWishlist();
  if (countBadge) countBadge.textContent = wishlistIds.length;

  const products = store.getProducts().filter((p) => wishlistIds.includes(p.id));

  if (products.length === 0) {
    list.innerHTML = `<p style="color:#86868b;font-size:0.9rem;text-align:center;padding:24px;grid-column:1/-1;">Your personal curation wishlist is currently empty.</p>`;
    return;
  }

  list.innerHTML = products
    .map(
      (p) => `
    <div style="padding:12px;border-radius:12px;background:#ffffff;border:1px solid rgba(0,0,0,0.08);text-align:center;">
      <img src="${p.images?.primary || ""}" alt="${p.title}" style="width:100%;height:130px;object-fit:cover;border-radius:8px;margin-bottom:8px;" />
      <h4 style="font-size:0.85rem;margin:0 0 4px;font-weight:600;">${p.title}</h4>
      <span style="font-size:0.82rem;font-weight:700;color:#1d1d1f;display:block;margin-bottom:8px;">${store.formatMoney(p.basePrice)}</span>
      <button type="button" class="btn btn-primary btn-sm w-full" onclick="quickAcquireDirect('${p.id}')">Add to Bag</button>
    </div>
  `
    )
    .join("");
}

/* ==========================================================================
   5. SLIDE-OVER SHOPPING BAG & CART ENGINE
   ========================================================================== */
function initCartDrawer() {
  const drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("drawer-overlay");
  const openBtn = document.getElementById("header-cart-btn");
  const closeBtn = document.getElementById("cart-drawer-close");
  const checkoutBtn = document.getElementById("drawer-init-checkout-btn");
  const applyPromoBtn = document.getElementById("apply-promo-btn");
  const emptyShoppingBtn = document.getElementById("cart-start-shopping-btn");

  if (openBtn) openBtn.addEventListener("click", openCartDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeCartDrawer);
  if (overlay) overlay.addEventListener("click", closeCartDrawer);

  if (emptyShoppingBtn) {
    emptyShoppingBtn.addEventListener("click", () => {
      closeCartDrawer();
      const collectionSection = document.getElementById("collection");
      if (collectionSection) {
        collectionSection.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", () => {
      const store = window.OchirStore;
      const cart = store.getCart();
      if (!cart.length) return;

      closeCartDrawer();

      // Require user to sign in before final checkout submission
      if (!store.isAuthenticated()) {
        pendingCheckoutAfterAuth = true;
        openAuthModal("signin", true);
      } else {
        openCheckoutModal();
      }
    });
  }

  // Coupon handling
  if (applyPromoBtn) {
    applyPromoBtn.addEventListener("click", async () => {
      const input = document.getElementById("promo-input");
      const badge = document.getElementById("promo-discount-badge");
      const code = input ? input.value.trim() : "";
      if (!code) return;

      const store = window.OchirStore;
      const res = await store.applyCoupon(code);

      if (res.success) {
        appliedCouponCode = res.code;
        appliedDiscountAmount = res.discountAmount;
        if (badge) {
          badge.hidden = false;
          badge.textContent = `Promotion Applied: -${store.formatMoney(res.discountAmount)} (${res.code})`;
        }
        showOchirToast(res.message, "success");
        renderCartDrawer();
      } else {
        showOchirToast(res.message || "Invalid coupon code.", "warning");
      }
    });
  }
}

function openCartDrawer() {
  const drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (drawer) {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
  }
  if (overlay) overlay.hidden = false;
  document.body.classList.add("modal-open");
  renderCartDrawer();
}

function closeCartDrawer() {
  const drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (drawer) {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderCartDrawer() {
  const store = window.OchirStore;
  const cart = store.getCart();

  const emptyView = document.getElementById("cart-empty-view");
  const itemsList = document.getElementById("cart-items-list");
  const footer = document.getElementById("cart-drawer-footer");
  const countBadgeHeader = document.getElementById("header-cart-count");
  const countBadgeDrawer = document.getElementById("drawer-cart-count");
  const subtotalVal = document.getElementById("cart-subtotal-val");

  const totalCount = store.getCartCount();
  if (countBadgeHeader) countBadgeHeader.textContent = totalCount;
  if (countBadgeDrawer) countBadgeDrawer.textContent = totalCount;

  if (cart.length === 0) {
    if (emptyView) emptyView.hidden = false;
    if (itemsList) itemsList.hidden = true;
    if (footer) footer.hidden = true;
    return;
  }

  if (emptyView) emptyView.hidden = true;
  if (itemsList) itemsList.hidden = false;
  if (footer) footer.hidden = false;

  const rawSubtotal = store.getCartSubtotal();
  const grandSubtotal = Math.max(0, rawSubtotal - appliedDiscountAmount);

  if (subtotalVal) {
    subtotalVal.textContent = store.formatMoney(grandSubtotal);
  }

  itemsList.innerHTML = cart
    .map(
      (item, idx) => `
    <div class="cart-item-row" data-index="${idx}">
      <img src="${item.image || ""}" alt="${item.title}" class="cart-item-thumb" />
      <div class="cart-item-info">
        <h4 class="cart-item-title">${item.title}</h4>
        <span class="cart-item-variant">${item.variant || "Standard"}</span>
        ${item.engraving ? `<span class="cart-item-engraving">Monogram: "${item.engraving}"</span>` : ""}
        <span class="cart-item-price">${store.formatMoney((item.basePrice || item.price) * item.qty)}</span>
      </div>
      <div class="cart-item-controls">
        <button type="button" class="cart-qty-btn" onclick="updateCartQuantity(${idx}, -1)">–</button>
        <span class="cart-qty-display">${item.qty}</span>
        <button type="button" class="cart-qty-btn" onclick="updateCartQuantity(${idx}, 1)">+</button>
      </div>
    </div>
  `
    )
    .join("");
}

window.updateCartQuantity = function (index, delta) {
  const store = window.OchirStore;
  store.updateCartQty(index, delta);
  renderCartDrawer();
};

/* ==========================================================================
   6. FRICTIONLESS MANUAL CHECKOUT (Strictly bKash, Rocket, COD)
   ========================================================================== */
function openCheckoutModal() {
  const modal = document.getElementById("checkout-modal");
  const store = window.OchirStore;
  const user = store.getCurrentUser();

  checkoutStep = 1;
  updateCheckoutStepView();

  // Pre-fill user profile info if logged in
  if (user) {
    const nameField = document.getElementById("chk-name");
    const phoneField = document.getElementById("chk-phone");
    const addressField = document.getElementById("chk-address");
    const areaField = document.getElementById("chk-area");
    const districtField = document.getElementById("chk-district");

    if (nameField && !nameField.value) nameField.value = user.name || "";
    if (phoneField && !phoneField.value) phoneField.value = user.phone || "";

    if (user.addresses && user.addresses.length > 0) {
      const def = user.addresses[0];
      if (addressField && !addressField.value) addressField.value = def.address || "";
      if (areaField && !areaField.value) areaField.value = def.area || "";
      if (districtField && def.district) districtField.value = def.district;
    }
  }

  // Pre-populate bKash and Rocket official numbers from store settings
  const settings = store.getSettings();
  const bkashDisp = document.getElementById("disp-bkash-num");
  const rocketDisp = document.getElementById("disp-rocket-num");

  if (bkashDisp && settings.paymentMethods?.bkash?.number) {
    bkashDisp.textContent = settings.paymentMethods.bkash.number;
  }
  if (rocketDisp && settings.paymentMethods?.rocket?.number) {
    rocketDisp.textContent = settings.paymentMethods.rocket.number;
  }

  if (modal) {
    modal.classList.add("is-active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
}

function initMultiStepCheckout() {
  const modal = document.getElementById("checkout-modal");
  const closeBtn = document.getElementById("checkout-modal-close");
  const form = document.getElementById("checkout-form");

  const btnToStep2 = document.getElementById("btn-to-step-2");
  const btnBackToStep1 = document.getElementById("btn-back-to-step-1");
  const btnToStep3 = document.getElementById("btn-to-step-3");
  const btnBackToStep2 = document.getElementById("btn-back-to-step-2");

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
    });
  }

  // Copy number buttons
  document.querySelectorAll(".btn-copy-num").forEach((btn) => {
    btn.addEventListener("click", () => {
      const numToCopy = btn.getAttribute("data-copy");
      if (numToCopy) {
        navigator.clipboard.writeText(numToCopy);
        const originalText = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = originalText), 2000);
      }
    });
  });

  // Step 1 -> Step 2
  if (btnToStep2) {
    btnToStep2.addEventListener("click", () => {
      const name = document.getElementById("chk-name")?.value.trim();
      const phone = document.getElementById("chk-phone")?.value.trim();
      const address = document.getElementById("chk-address")?.value.trim();
      const area = document.getElementById("chk-area")?.value.trim();

      if (!name || !phone || !address || !area) {
        showOchirToast("Please complete recipient name, phone, area, and street address.", "warning");
        return;
      }
      checkoutStep = 2;
      updateCheckoutStepView();
    });
  }

  if (btnBackToStep1) {
    btnBackToStep1.addEventListener("click", () => {
      checkoutStep = 1;
      updateCheckoutStepView();
    });
  }

  // Payment radio selection toggle
  const payOptions = document.querySelectorAll(".pay-option");
  payOptions.forEach((label) => {
    label.addEventListener("click", () => {
      payOptions.forEach((l) => l.classList.remove("is-selected"));
      label.classList.add("is-selected");

      const radio = label.querySelector('input[name="payMethod"]');
      if (radio) radio.checked = true;

      const method = label.dataset.method;
      const boxBkash = document.getElementById("pay-box-bkash");
      const boxRocket = document.getElementById("pay-box-rocket");
      const boxCod = document.getElementById("pay-box-cod");

      if (boxBkash) boxBkash.hidden = method !== "bKash";
      if (boxRocket) boxRocket.hidden = method !== "Rocket";
      if (boxCod) boxCod.hidden = method !== "COD";
    });
  });

  // Step 2 -> Step 3
  if (btnToStep3) {
    btnToStep3.addEventListener("click", () => {
      const selectedPay = document.querySelector('input[name="payMethod"]:checked')?.value || "bKash";

      if (selectedPay === "bKash") {
        const sender = document.getElementById("chk-bkash-sender")?.value.trim();
        const trx = document.getElementById("chk-bkash-trx")?.value.trim();
        if (!sender || !trx) {
          showOchirToast("Please provide both your bKash sender number and Transaction ID (TrxID).", "warning");
          return;
        }
      } else if (selectedPay === "Rocket") {
        const sender = document.getElementById("chk-rocket-sender")?.value.trim();
        const trx = document.getElementById("chk-rocket-trx")?.value.trim();
        if (!sender || !trx) {
          showOchirToast("Please provide both your 12-digit Rocket phone and Transaction ID (TrxID).", "warning");
          return;
        }
      }

      checkoutStep = 3;
      renderCheckoutReviewSummary();
      updateCheckoutStepView();
    });
  }

  if (btnBackToStep2) {
    btnBackToStep2.addEventListener("click", () => {
      checkoutStep = 2;
      updateCheckoutStepView();
    });
  }

  // Final Order Submission
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const store = window.OchirStore;
      const cart = store.getCart();
      if (!cart.length) return;

      const placeBtn = document.getElementById("btn-place-order-final");
      if (placeBtn) {
        placeBtn.disabled = true;
        placeBtn.innerHTML = `<span>Securing Dispatch Order...</span>`;
      }

      const name = document.getElementById("chk-name").value.trim();
      const phone = document.getElementById("chk-phone").value.trim();
      const district = document.getElementById("chk-district").value;
      const area = document.getElementById("chk-area").value.trim();
      const address = document.getElementById("chk-address").value.trim();
      const instructions = document.getElementById("chk-instructions")?.value.trim() || "";

      const selectedPay = document.querySelector('input[name="payMethod"]:checked')?.value || "bKash";

      let paymentDetails = {};
      if (selectedPay === "bKash") {
        paymentDetails = {
          senderPhone: document.getElementById("chk-bkash-sender").value.trim(),
          trxId: document.getElementById("chk-bkash-trx").value.trim().toUpperCase()
        };
      } else if (selectedPay === "Rocket") {
        paymentDetails = {
          senderPhone: document.getElementById("chk-rocket-sender").value.trim(),
          trxId: document.getElementById("chk-rocket-trx").value.trim().toUpperCase()
        };
      }

      const orderPayload = {
        customer: {
          name,
          phone,
          district,
          area,
          address,
          instructions
        },
        items: cart.map((i) => ({
          productId: i.productId,
          variant: i.variant,
          engraving: i.engraving,
          qty: i.qty
        })),
        paymentMethod: selectedPay,
        paymentDetails,
        couponCode: appliedCouponCode
      };

      const res = await store.submitOrder(orderPayload);

      if (res.success && res.order) {
        modal.classList.remove("is-active");
        if (placeBtn) {
          placeBtn.disabled = false;
          placeBtn.innerHTML = `<span>Complete Acquisition &amp; Place Order ↗</span>`;
        }
        openSuccessReceiptModal(res.order);
      } else {
        if (placeBtn) {
          placeBtn.disabled = false;
          placeBtn.innerHTML = `<span>Complete Acquisition &amp; Place Order ↗</span>`;
        }
        showOchirToast(res.message || "Failed to confirm order.", "warning");
      }
    });
  }
}

function updateCheckoutStepView() {
  [1, 2, 3].forEach((step) => {
    const panel = document.getElementById(`checkout-step-${step}`);
    if (panel) panel.hidden = step !== checkoutStep;

    const stepNode = document.querySelector(`.step-node[data-step="${step}"]`);
    if (stepNode) {
      stepNode.classList.toggle("is-active", step === checkoutStep);
      stepNode.classList.toggle("is-done", step < checkoutStep);
    }
  });
}

function renderCheckoutReviewSummary() {
  const summaryBox = document.getElementById("checkout-review-summary");
  if (!summaryBox) return;

  const store = window.OchirStore;
  const cart = store.getCart();
  const settings = store.getSettings();

  const name = document.getElementById("chk-name")?.value || "";
  const phone = document.getElementById("chk-phone")?.value || "";
  const district = document.getElementById("chk-district")?.value || "";
  const address = document.getElementById("chk-address")?.value || "";
  const area = document.getElementById("chk-area")?.value || "";

  const selectedPay = document.querySelector('input[name="payMethod"]:checked')?.value || "bKash";

  let payMetaString = "";
  if (selectedPay === "bKash") {
    const trx = document.getElementById("chk-bkash-trx")?.value.trim() || "";
    const sender = document.getElementById("chk-bkash-sender")?.value.trim() || "";
    payMetaString = `bKash Manual (Sender: ${sender}, TrxID: ${trx.toUpperCase()})`;
  } else if (selectedPay === "Rocket") {
    const trx = document.getElementById("chk-rocket-trx")?.value.trim() || "";
    const sender = document.getElementById("chk-rocket-sender")?.value.trim() || "";
    payMetaString = `Rocket Manual (Sender: ${sender}, TrxID: ${trx.toUpperCase()})`;
  } else {
    payMetaString = "Cash on Delivery (White-Glove Courier)";
  }

  const rawSubtotal = store.getCartSubtotal();
  const isDhaka = district.toLowerCase().includes("dhaka");
  const insideFee = settings.deliveryChargeInside !== undefined ? settings.deliveryChargeInside : 80;
  const outsideFee = settings.deliveryChargeOutside !== undefined ? settings.deliveryChargeOutside : 150;
  const threshold = settings.freeDeliveryThreshold !== undefined ? settings.freeDeliveryThreshold : 5000;

  let shippingFee = isDhaka ? insideFee : outsideFee;
  if (rawSubtotal >= threshold) shippingFee = 0;

  const grandTotal = Math.max(0, rawSubtotal - appliedDiscountAmount) + shippingFee;

  summaryBox.innerHTML = `
    <div class="review-meta-grid">
      <div>
        <span class="review-label">RECIPIENT &amp; DESTINATION</span>
        <p><strong>${name}</strong> (${phone})<br />${address}, ${area}, ${district}</p>
      </div>
      <div>
        <span class="review-label">PAYMENT PROTOCOL</span>
        <p><strong>${payMetaString}</strong></p>
      </div>
    </div>

    <div class="review-items-list">
      ${cart
        .map(
          (i) => `
        <div class="review-item-row">
          <span>${i.title} (${i.variant || "Standard"}) × ${i.qty}</span>
          <strong>${store.formatMoney((i.basePrice || i.price) * i.qty)}</strong>
        </div>
      `
        )
        .join("")}
    </div>

    <div class="review-totals-box">
      <div class="review-tot-row">
        <span>Cart Subtotal</span>
        <span>${store.formatMoney(rawSubtotal)}</span>
      </div>
      ${
        appliedDiscountAmount > 0
          ? `
        <div class="review-tot-row highlight-discount">
          <span>Promotional Privilege (${appliedCouponCode})</span>
          <span>-${store.formatMoney(appliedDiscountAmount)}</span>
        </div>
      `
          : ""
      }
      <div class="review-tot-row">
        <span>Delivery Fee (${district})</span>
        <span>${shippingFee === 0 ? "Complimentary Insured Delivery" : store.formatMoney(shippingFee)}</span>
      </div>
      <div class="review-tot-row grand-total">
        <span>Total Payable</span>
        <span>${store.formatMoney(grandTotal)}</span>
      </div>
    </div>
  `;
}

/* ==========================================================================
   7. POST-PURCHASE CONFIRMATION & ARCHIVAL RECEIPT
   ========================================================================== */
function openSuccessReceiptModal(order) {
  const modal = document.getElementById("order-success-modal");
  const receiptBox = document.getElementById("success-receipt-box");
  const closeBtn = document.getElementById("btn-success-close");
  const printBtn = document.getElementById("btn-print-customer-receipt");
  const store = window.OchirStore;

  if (receiptBox) {
    const waText = encodeURIComponent(
      `Hello OCHIR, I have just placed order #${order.id}. Please verify my ${order.paymentMethod} payment.`
    );
    const waLink = `https://wa.me/8801335852121?text=${waText}`;

    receiptBox.innerHTML = `
      <div class="receipt-header">
        <div>
          <span class="receipt-order-id">${order.id}</span>
          <span class="table-status-pill status-${order.status.toLowerCase().replace(/\s+/g, "-")}">${order.status}</span>
          <span style="font-size:0.75rem;margin-left:8px;">Payment: <strong>${order.paymentStatus}</strong></span>
        </div>
        <span class="receipt-date">${new Date(order.createdAt).toLocaleDateString()}</span>
      </div>

      <div class="receipt-destination">
        <strong>Delivery Destination:</strong> ${order.customer.name} · ${order.customer.address}, ${order.customer.area || ""}, ${order.customer.district} (${order.customer.phone})
      </div>

      <div class="receipt-items-list">
        ${(order.items || [])
          .map(
            (i) => `
          <div class="receipt-item-row">
            <span>${i.title} (${i.variant || "Standard"}) × ${i.qty}</span>
            <span>${store.formatMoney(i.unitPrice * i.qty)}</span>
          </div>
        `
          )
          .join("")}
      </div>

      <div class="receipt-total-row">
        <span>Total Payable (${order.paymentMethod}):</span>
        <strong>${store.formatMoney(order.total)}</strong>
      </div>

      <div style="margin-top:16px;padding:12px;border-radius:10px;background:rgba(37,211,102,0.08);border:1px solid rgba(37,211,102,0.2);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:0.82rem;color:#128c7e;font-weight:500;">Need immediate verification or courier updates?</span>
        <a href="${waLink}" target="_blank" rel="noopener" class="header-whatsapp-pill" style="background:#25d366;color:#ffffff;border:none;">
          WhatsApp Concierge ↗
        </a>
      </div>
    `;
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
    };
  }

  if (printBtn) {
    printBtn.onclick = () => {
      window.printOrderInvoice(order.id);
    };
  }

  const adminOpenBtn = document.getElementById("btn-success-admin-open");
  if (adminOpenBtn) {
    adminOpenBtn.onclick = () => {
      modal.classList.remove("is-active");
      document.body.classList.remove("modal-open");
      if (window.openAdminControlRoom) {
        window.openAdminControlRoom();
      }
    };
  }

  if (modal) {
    modal.classList.add("is-active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
}

/* ==========================================================================
   8. REAL-TIME ORDER TRACKING CONCIERGE
   ========================================================================== */
function initOrderTracking() {
  const modal = document.getElementById("tracking-modal");
  const topBtn = document.getElementById("track-order-top-btn");
  const closeBtn = document.getElementById("tracking-modal-close");
  const searchBtn = document.getElementById("track-search-btn");
  const trackInput = document.getElementById("track-input");
  const resultsStage = document.getElementById("tracking-results-stage");

  function openTrackModal() {
    if (!modal) return;
    modal.classList.add("is-active");
    document.body.classList.add("modal-open");
  }

  function closeTrackModal() {
    if (!modal) return;
    modal.classList.remove("is-active");
    document.body.classList.remove("modal-open");
  }

  if (topBtn) topBtn.addEventListener("click", openTrackModal);
  if (closeBtn) closeBtn.addEventListener("click", closeTrackModal);

  async function executeTrack() {
    const q = trackInput ? trackInput.value.trim() : "";
    if (!q) return;

    const store = window.OchirStore;
    const res = await store.trackOrder(q);

    if (res.success && res.order) {
      const o = res.order;
      resultsStage.innerHTML = `
        <div class="tracking-result-card">
          <div class="track-card-top">
            <strong>${o.id}</strong>
            <span class="table-status-pill status-${o.status.toLowerCase().replace(/\s+/g, "-")}">${o.status}</span>
          </div>
          <p><strong>Payment Status:</strong> ${o.paymentStatus} (${o.paymentMethod})</p>
          <p><strong>Courier:</strong> ${o.courierName || "Atelier Dispatched"} ${o.trackingNumber ? `· Tracking: ${o.trackingNumber}` : ""}</p>
          
          <div class="tracking-steps-indicator" style="margin-top:16px;">
            <div class="t-step is-done">✓ Order Received</div>
            <div class="t-step ${o.status !== "Pending Confirmation" ? "is-done" : ""}">✓ Confirmed &amp; Regulated</div>
            <div class="t-step ${o.status === "Shipped" || o.status === "Delivered" ? "is-done" : ""}">✓ Courier Transit</div>
            <div class="t-step ${o.status === "Delivered" ? "is-done" : ""}">✓ Handover Complete</div>
          </div>
        </div>
      `;
    } else {
      resultsStage.innerHTML = `<p class="tracking-error" style="color:#e02424;padding:16px;text-align:center;">No active order found matching "${q}". Please verify the Order ID (e.g. OCH-2026-XXXX).</p>`;
    }
  }

  if (searchBtn) searchBtn.addEventListener("click", executeTrack);
  if (trackInput) {
    trackInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") executeTrack();
    });
  }
}

window.openTrackingModal = function (orderId) {
  const modal = document.getElementById("tracking-modal");
  const trackInput = document.getElementById("track-input");
  const searchBtn = document.getElementById("track-search-btn");
  if (!modal) return;
  modal.classList.add("is-active");
  document.body.classList.add("modal-open");
  if (orderId && trackInput) {
    trackInput.value = orderId;
    if (searchBtn) searchBtn.click();
  }
};

window.printOrderInvoice = function (orderId) {
  const store = window.OchirStore;
  let order = store.getOrders().find((o) => o.id === orderId);

  const proceedPrint = (o) => {
    if (!o) {
      showOchirToast("Order information not available for printing.", "warning");
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      showOchirToast("Please allow pop-ups to print the official invoice.", "warning");
      return;
    }
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>OCHIR Invoice - ${o.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1d1d1f; max-width: 800px; margin: 0 auto; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #141619; padding-bottom: 24px; margin-bottom: 28px; }
    .brand-logo { font-size: 28px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; margin: 0; color: #141619; }
    .brand-sub { font-size: 11px; letter-spacing: 0.12em; color: #86868b; text-transform: uppercase; margin-top: 4px; }
    .invoice-title { font-size: 22px; font-weight: 700; text-align: right; margin: 0; }
    .invoice-meta { font-size: 13px; color: #6e6e73; text-align: right; margin-top: 4px; }
    .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
    .box-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #86868b; margin-bottom: 8px; }
    .info-box p { margin: 3px 0; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    th { text-align: left; padding: 12px 10px; border-bottom: 1px solid #d2d2d7; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6e6e73; }
    td { padding: 12px 10px; border-bottom: 1px solid #f2f2f7; font-size: 14px; }
    .text-right { text-align: right; }
    .totals-area { margin-left: auto; width: 280px; margin-bottom: 32px; }
    .tot-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .tot-row.grand { border-top: 1px solid #141619; margin-top: 6px; padding-top: 10px; font-size: 18px; font-weight: 700; }
    .footer-note { font-size: 12px; color: #86868b; text-align: center; border-top: 1px solid #e5e5ea; padding-top: 24px; margin-top: 40px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #e5e5ea; }
    .badge-paid { background: #d1fae5; color: #065f46; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="brand-logo">OCHIR</h1>
      <div class="brand-sub">Quiet Luxury · Atelier Watches, Leathers &amp; Accessories</div>
      <div style="font-size: 12px; color: #86868b; margin-top: 6px;">WhatsApp: +880 1335 852121 · concierge@ochir.com</div>
    </div>
    <div>
      <h2 class="invoice-title">OFFICIAL INVOICE</h2>
      <div class="invoice-meta">Order: <strong>${o.id}</strong></div>
      <div class="invoice-meta">Date: ${new Date(o.createdAt).toLocaleDateString()}</div>
      <div class="invoice-meta" style="margin-top:6px;">Status: <span class="badge ${o.paymentStatus === "Verified" ? "badge-paid" : ""}">${o.status} (${o.paymentStatus})</span></div>
    </div>
  </div>

  <div class="section-grid">
    <div class="info-box">
      <div class="box-title">Client &amp; Delivery Destination</div>
      <p><strong>${o.customer?.name || "Client"}</strong></p>
      <p>${o.customer?.address || ""}</p>
      <p>${o.customer?.area ? o.customer.area + ", " : ""}${o.customer?.district || ""}</p>
      <p>Phone: ${o.customer?.phone || ""}</p>
      <p>Email: ${o.customer?.email || ""}</p>
    </div>
    <div class="info-box">
      <div class="box-title">Payment &amp; Logistics</div>
      <p>Method: <strong>${o.paymentMethod || "Cash on Delivery"}</strong></p>
      ${o.paymentDetails?.trxId ? `<p>Transaction ID: <code>${o.paymentDetails.trxId}</code></p>` : ""}
      ${o.paymentDetails?.senderNumber ? `<p>Sender Phone: ${o.paymentDetails.senderNumber}</p>` : ""}
      <p>Courier: ${o.courierName || "Atelier Dispatched"}</p>
      ${o.trackingNumber ? `<p>Tracking: <strong>${o.trackingNumber}</strong></p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Object Description</th>
        <th>Variant</th>
        <th class="text-right">Unit Price</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${(o.items || []).map((i) => `
        <tr>
          <td><strong>${i.title}</strong>${i.engraving ? `<br><small style="color:#86868b">Monogram: "${i.engraving}"</small>` : ""}</td>
          <td>${i.variant || "Standard"}</td>
          <td class="text-right">${store.formatMoney(i.unitPrice)}</td>
          <td class="text-right">${i.qty}</td>
          <td class="text-right">${store.formatMoney(i.unitPrice * i.qty)}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="totals-area">
    <div class="tot-row"><span>Subtotal:</span><span>${store.formatMoney(o.subtotal || 0)}</span></div>
    ${o.discount > 0 ? `<div class="tot-row" style="color:#059669"><span>Discount (${o.couponCode || "Promo"}):</span><span>-${store.formatMoney(o.discount)}</span></div>` : ""}
    <div class="tot-row"><span>Insured Shipping:</span><span>${o.shippingFee === 0 ? "Complimentary" : store.formatMoney(o.shippingFee)}</span></div>
    <div class="tot-row grand"><span>Total Payable:</span><span>${store.formatMoney(o.total || 0)}</span></div>
  </div>

  <div class="footer-note">
    <p>Thank you for choosing OCHIR. Every piece is handcrafted and individually inspected before dispatch.</p>
    <p>For inquiries or warranty care: +880 1335 852121 · concierge@ochir.com</p>
  </div>
</body>
</html>`;
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.print();
    }, 400);
  };

  if (!order) {
    store.trackOrder(orderId).then((res) => {
      if (res.success && res.order) {
        proceedPrint(res.order);
      } else {
        showOchirToast("Could not retrieve order details for printing.", "warning");
      }
    });
  } else {
    proceedPrint(order);
  }
};

/* ==========================================================================
   9. FLOATING LIVE CONCIERGE CHAT & WHATSAPP SHORTCUT
   ========================================================================== */
function initLiveConciergeChat() {
  const triggerBtn = document.getElementById("floating-chat-trigger");
  const chatWindow = document.getElementById("chat-widget-window");
  const closeBtn = document.getElementById("chat-widget-close");
  const sendForm = document.getElementById("chat-send-form");
  const chips = document.querySelectorAll(".chat-chip");

  // Guarantee closed initial state on startup
  if (chatWindow) {
    chatWindow.hidden = true;
    chatWindow.classList.add("is-hidden");
    chatWindow.style.display = "none";
  }

  function openChat() {
    if (!chatWindow) return;
    chatWindow.hidden = false;
    chatWindow.classList.remove("is-hidden");
    chatWindow.style.display = "flex";
    document.getElementById("chat-unread-dot")?.setAttribute("hidden", "true");
    pollChatMessages();
    startChatPolling();
    setTimeout(() => {
      document.getElementById("chat-user-input")?.focus();
    }, 150);
  }

  function closeChat() {
    if (!chatWindow) return;
    chatWindow.hidden = true;
    chatWindow.classList.add("is-hidden");
    chatWindow.style.display = "none";
    stopChatPolling();
  }

  if (triggerBtn && chatWindow) {
    triggerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible =
        !chatWindow.hidden &&
        chatWindow.style.display !== "none" &&
        !chatWindow.classList.contains("is-hidden");
      if (isVisible) {
        closeChat();
      } else {
        openChat();
      }
    });
  }

  if (closeBtn && chatWindow) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeChat();
    });
  }

  // Prevent inside clicks from closing chat
  if (chatWindow) {
    chatWindow.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const query = chip.dataset.query;
      const input = document.getElementById("chat-user-input");
      if (input && query) {
        input.value = query;
        sendForm?.dispatchEvent(new Event("submit"));
      }
    });
  });

  if (sendForm) {
    sendForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("chat-user-input");
      const text = input ? input.value.trim() : "";
      if (!text) return;

      input.value = "";
      const store = window.OchirStore;
      const res = await store.sendChatMessage(text);
      if (res.success) {
        pollChatMessages();
      }
    });
  }
}

window.openLiveConciergeChat = function () {
  const chatWindow = document.getElementById("chat-widget-window");
  if (chatWindow) {
    chatWindow.hidden = false;
    chatWindow.classList.remove("is-hidden");
    chatWindow.style.display = "flex";
    document.getElementById("chat-unread-dot")?.setAttribute("hidden", "true");
    pollChatMessages();
    startChatPolling();
    setTimeout(() => {
      document.getElementById("chat-user-input")?.focus();
    }, 150);
  }
};

async function pollChatMessages() {
  const store = window.OchirStore;
  const messages = await store.fetchChatMessages();
  const stream = document.getElementById("chat-messages-stream");
  if (!stream) return;

  stream.innerHTML = messages
    .map(
      (m) => `
    <div class="chat-bubble ${m.sender}">
      ${m.text}
      <span class="chat-bubble-time">${new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  `
    )
    .join("");

  const body = document.getElementById("chat-widget-body");
  if (body) body.scrollTop = body.scrollHeight;
}

function startChatPolling() {
  stopChatPolling();
  chatPollTimer = setInterval(pollChatMessages, 4000);
}

function stopChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

/* ==========================================================================
   10. CURRENCY PICKER HELPER
   ========================================================================== */
function initCurrencySelector() {
  const select = document.getElementById("currency-select");
  if (!select) return;

  select.addEventListener("change", () => {
    const cur = select.value;
    const store = window.OchirStore;
    store.updateSettings({ currency: cur });
    renderStoreProducts();
    renderCartDrawer();
  });
}

/* ==========================================================================
   11. LIVING PRODUCT SHOWCASE (Watch, Leather, Bracelet)
   ========================================================================== */
function initOchirShowcase() {
  const showcaseWrap = document.getElementById("atelier-showcase");
  if (!showcaseWrap) return;

  const tabs = document.querySelectorAll(".showcase-tab");
  const panels = document.querySelectorAll(".stage-view-panel");
  const statusText = document.getElementById("showcase-status-text");
  const tourToggleBtn = document.getElementById("tour-toggle-btn");
  const parallaxStage = document.getElementById("trilogy-parallax-stage");

  const clockHandSecond = document.getElementById("clock-hand-second");
  const clockHandMinute = document.getElementById("clock-hand-minute");
  const clockHandHour = document.getElementById("clock-hand-hour");

  const macroHandSecond = document.getElementById("macro-hand-second");
  const macroHandMinute = document.getElementById("macro-hand-minute");
  const macroHandHour = document.getElementById("macro-hand-hour");

  const viewOrder = ["trilogy", "watch", "wallet", "cuff"];
  let currentIndex = 0;
  let isTouring = true;
  let tourTimer = null;

  function switchView(viewName) {
    tabs.forEach((tab) => {
      const match = tab.getAttribute("data-target") === viewName;
      tab.classList.toggle("is-active", match);
      tab.setAttribute("aria-selected", match ? "true" : "false");
    });

    panels.forEach((panel) => {
      const match = panel.id === `view-${viewName}`;
      panel.classList.toggle("is-active", match);
      if (match) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "true");
    });

    const titles = {
      trilogy: "THE OCHIR TRILOGY · 2026",
      watch: "THE CHRONOGRAPH 40MM · CALIBER 801",
      wallet: "THE ATELIER BIFOLD · TUSCAN VACHETTA",
      cuff: "THE SCULPTED CUFF · SURGICAL 316L"
    };

    if (statusText && titles[viewName]) {
      statusText.textContent = titles[viewName];
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-target");
      if (target) {
        currentIndex = viewOrder.indexOf(target);
        switchView(target);
        if (isTouring) startTour();
      }
    });
  });

  // Clock hands live motion
  function animateClockHands() {
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;

    const sDeg = s * 6;
    const mDeg = m * 6;
    const hDeg = h * 30;

    if (clockHandSecond) clockHandSecond.style.transform = `rotate(${sDeg}deg)`;
    if (clockHandMinute) clockHandMinute.style.transform = `rotate(${mDeg}deg)`;
    if (clockHandHour) clockHandHour.style.transform = `rotate(${hDeg}deg)`;

    if (macroHandSecond) macroHandSecond.style.transform = `rotate(${sDeg}deg)`;
    if (macroHandMinute) macroHandMinute.style.transform = `rotate(${mDeg}deg)`;
    if (macroHandHour) macroHandHour.style.transform = `rotate(${hDeg}deg)`;

    requestAnimationFrame(animateClockHands);
  }
  requestAnimationFrame(animateClockHands);

  // Parallax tilt on trilogy stage
  if (parallaxStage) {
    parallaxStage.addEventListener("mousemove", (e) => {
      const rect = parallaxStage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      const layerBack = parallaxStage.querySelector(".layer-background");
      const layerMid = parallaxStage.querySelector(".layer-midground");
      const layerFore = parallaxStage.querySelector(".layer-foreground");

      if (layerBack) layerBack.style.transform = `translate(${x * -14}px, ${y * -14}px)`;
      if (layerMid) layerMid.style.transform = `translate(${x * 12}px, ${y * 12}px)`;
      if (layerFore) layerFore.style.transform = `translate(${x * 24}px, ${y * 24}px) scale(1.02)`;
    });

    parallaxStage.addEventListener("mouseleave", () => {
      const layers = parallaxStage.querySelectorAll(".parallax-layer");
      layers.forEach((l) => (l.style.transform = ""));
    });
  }

  // Auto-tour
  function startTour() {
    stopTour();
    tourTimer = setInterval(() => {
      currentIndex = (currentIndex + 1) % viewOrder.length;
      switchView(viewOrder[currentIndex]);
    }, 6000);
  }

  function stopTour() {
    if (tourTimer) clearInterval(tourTimer);
  }

  if (tourToggleBtn) {
    tourToggleBtn.addEventListener("click", () => {
      isTouring = !isTouring;
      if (isTouring) {
        startTour();
        tourToggleBtn.classList.add("is-playing");
        const icon = tourToggleBtn.querySelector(".tour-icon");
        if (icon) icon.textContent = "⏸";
        tourToggleBtn.title = "Pause Auto-Tour";
      } else {
        stopTour();
        tourToggleBtn.classList.remove("is-playing");
        const icon = tourToggleBtn.querySelector(".tour-icon");
        if (icon) icon.textContent = "▶";
        tourToggleBtn.title = "Play Auto-Tour";
      }
    });
  }

  // Living Showcase Swatches
  const swatchConfigs = [
    { group: "#watch-swatches", imgId: "solo-watch-img" },
    { group: "#wallet-swatches", imgId: "solo-wallet-img" },
    { group: "#cuff-swatches", imgId: "solo-cuff-img" }
  ];

  swatchConfigs.forEach(({ group, imgId }) => {
    const swatches = document.querySelectorAll(`${group} .color-swatch`);
    const targetImg = document.getElementById(imgId);
    swatches.forEach((swatch) => {
      swatch.addEventListener("click", () => {
        swatches.forEach((s) => s.classList.remove("is-active"));
        swatch.classList.add("is-active");
        if (targetImg && swatch.dataset.src) {
          targetImg.src = swatch.dataset.src;
        }
      });
    });
  });

  // Showcase Direct Acquire & Inspect Bindings
  const bindSoloAction = (acquireId, inspectId, prodId) => {
    const btnAcquire = document.getElementById(acquireId);
    const btnInspect = document.getElementById(inspectId);
    if (btnAcquire) {
      btnAcquire.addEventListener("click", () => quickAcquireDirect(prodId));
    }
    if (btnInspect) {
      btnInspect.addEventListener("click", () => openProductDetailModal(prodId));
    }
  };

  bindSoloAction("btn-acquire-watch", "btn-inspect-watch", "och-prod-01");
  bindSoloAction("btn-acquire-wallet", "btn-inspect-wallet", "och-prod-04");
  bindSoloAction("btn-acquire-cuff", "btn-inspect-cuff", "och-prod-05");

  startTour();
}

/* ==========================================================================
   12. ATMOSPHERIC STARDUST CANVAS (MICRO-PARTICLES)
   ========================================================================== */
function initAmbientStardustCanvas() {
  const canvas = document.getElementById("ambient-stardust-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particleCount = 42;
  const particles = [];
  let mouse = { x: -1000, y: -1000 };

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.6 + 0.6,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      alpha: Math.random() * 0.5 + 0.2,
      baseAlpha: Math.random() * 0.5 + 0.2,
      color: Math.random() > 0.4 ? "197, 168, 128" : "220, 225, 235"
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particleCount; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
        p.alpha = Math.min(1, p.baseAlpha + (1 - dist / 100) * 0.5);
        p.x -= (dx / dist) * 0.6;
        p.y -= (dy / dist) * 0.6;
      } else {
        p.alpha += (p.baseAlpha - p.alpha) * 0.05;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
      ctx.shadowBlur = 4;
      ctx.shadowColor = `rgba(${p.color}, 0.4)`;
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

/* ==========================================================================
   13. TUSCAN LEATHER PATINA COMPARISON SLIDER
   ========================================================================== */
function initPatinaSlider() {
  const container = document.getElementById("patina-container");
  if (!container) return;

  let isDragging = false;

  function updateSlider(clientX) {
    const rect = container.getBoundingClientRect();
    let offsetX = clientX - rect.left;
    let pct = (offsetX / rect.width) * 100;
    pct = Math.max(5, Math.min(95, pct));
    container.style.setProperty("--patina-pct", `${pct}%`);
  }

  container.addEventListener("pointerdown", (e) => {
    isDragging = true;
    updateSlider(e.clientX);
  });

  window.addEventListener("pointerup", () => {
    isDragging = false;
  });

  window.addEventListener("pointermove", (e) => {
    if (isDragging) updateSlider(e.clientX);
  });
}

/* ==========================================================================
   14. 3D CARD PARALLAX TILT
   ========================================================================== */
function init3DCardTilt() {
  const tiltCards = document.querySelectorAll("[data-tilt]");
  tiltCards.forEach((card) => {
    let bounds = card.getBoundingClientRect();

    card.addEventListener("mouseenter", () => {
      bounds = card.getBoundingClientRect();
    });

    card.addEventListener("mousemove", (e) => {
      const x = e.clientX - bounds.left;
      const y = e.clientY - bounds.top;
      const normX = (x / bounds.width - 0.5) * 2;
      const normY = (y / bounds.height - 0.5) * 2;

      card.style.transform = `perspective(1000px) rotateX(${-normY * 6}deg) rotateY(${normX * 8}deg) translateY(-6px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

/* ==========================================================================
   15. LOOKBOOK QUICK ACQUIRE BINDINGS
   ========================================================================== */
function initLookbookQuickAcquire() {
  const buttons = document.querySelectorAll(".lookbook-acquire-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const prodId = btn.getAttribute("data-product");
      if (!prodId) return;
      if (btn.textContent.includes("Inspect")) {
        openProductDetailModal(prodId);
      } else {
        quickAcquireDirect(prodId);
      }
    });
  });
}

/* ==========================================================================
   16. MANIFESTO SCROLL REVEAL & NAVIGATION HELPERS
   ========================================================================== */
function initManifestoScrollReveal() {
  const paragraphs = document.querySelectorAll(".manifesto-para");
  if (!paragraphs.length) return;

  function onScroll() {
    const vh = window.innerHeight;
    paragraphs.forEach((p) => {
      const r = p.getBoundingClientRect();
      const visiblePct = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.6)));
      p.style.opacity = Math.max(0.2, visiblePct);
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function initMagneticButton() {
  const zone = document.getElementById("magnetic-zone");
  const btn = document.getElementById("magnetic-inquire-btn");
  if (!zone || !btn) return;

  const threshold = 180;

  zone.addEventListener("mousemove", (e) => {
    const rect = btn.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance < threshold) {
      const pullX = deltaX * 0.35;
      const pullY = deltaY * 0.35;
      btn.style.transform = `translate(${pullX}px, ${pullY}px) scale(1.05)`;
    }
  });

  zone.addEventListener("mouseleave", () => {
    btn.style.transform = "translate(0px, 0px) scale(1)";
  });

  btn.addEventListener("click", () => {
    openProductDetailModal("och-prod-01");
  });
}

function initMobileDrawer() {
  const navLinks = document.querySelectorAll(".desktop-nav a");
  navLinks.forEach((l) => {
    l.addEventListener("click", () => {
      const filter = l.dataset.filter;
      if (filter) {
        activeCategoryFilter = filter;
        const matchingTab = document.querySelector(`#collection .pill-tab[data-category="${filter}"]`);
        if (matchingTab) matchingTab.click();
      }
    });
  });
}

function initHeaderScrollAdaptation() {
  const header = document.querySelector(".site-header");
  const darkSections = document.querySelectorAll(".dark-theme");
  if (!header || !darkSections.length) return;

  window.addEventListener(
    "scroll",
    () => {
      const headerRect = header.getBoundingClientRect();
      const headerMidY = headerRect.top + headerRect.height / 2;

      let overDark = false;
      darkSections.forEach((sec) => {
        const r = sec.getBoundingClientRect();
        if (headerMidY >= r.top && headerMidY <= r.bottom) {
          overDark = true;
        }
      });

      header.classList.toggle("scrolled-dark", overDark);
    },
    { passive: true }
  );
}

/* ==========================================================================
   17. MODAL OVERLAY BACKDROP & ESCAPE DISMISSAL
   ========================================================================== */
function initModalBackdrops() {
  const modalIds = [
    "product-detail-modal",
    "checkout-modal",
    "auth-modal",
    "customer-dossier-modal",
    "tracking-modal",
    "order-success-modal"
  ];

  modalIds.forEach((id) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("is-active");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      modalIds.forEach((id) => {
        const modal = document.getElementById(id);
        if (modal && modal.classList.contains("is-active")) {
          modal.classList.remove("is-active");
          modal.setAttribute("aria-hidden", "true");
        }
      });
      closeCartDrawer();

      const chatWindow = document.getElementById("chat-widget-window");
      if (chatWindow && !chatWindow.hidden && chatWindow.style.display !== "none") {
        chatWindow.hidden = true;
        chatWindow.classList.add("is-hidden");
        chatWindow.style.display = "none";
        if (typeof stopChatPolling === "function") stopChatPolling();
      }

      document.body.classList.remove("modal-open");
    }
  });

  // Clicking anywhere outside the chat window closes it
  document.addEventListener("click", (e) => {
    const chatWindow = document.getElementById("chat-widget-window");
    const triggerBtn = document.getElementById("floating-chat-trigger");
    if (!chatWindow || chatWindow.hidden || chatWindow.style.display === "none") return;
    if (chatWindow.contains(e.target) || triggerBtn?.contains(e.target)) return;
    if (e.target.closest("[onclick*='openLiveConciergeChat']")) return;

    chatWindow.hidden = true;
    chatWindow.classList.add("is-hidden");
    chatWindow.style.display = "none";
    if (typeof stopChatPolling === "function") stopChatPolling();
  });
}

