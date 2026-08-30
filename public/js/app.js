// ================= ONLAYN BOZOR UZ CLIENT APP (REAL USER MODE) ================= //

let currentListings = [];
let siteSettings = {};
let currentSelectedRegion = 'all';
let currentSelectedBrand = 'all';
let debounceTimer = null;
let currentDetailListing = null;

// Initial bootstrap
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadListings();

  // Auto-sync in background every 12 seconds so new ads from anyone appear in real-time
  setInterval(loadListingsSilent, 12000);

  // Handle ESC key to close all modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.classList.remove('show');
      });
      document.body.style.overflow = '';
    }
  });

  // Enter key on search inputs
  document.getElementById('desktopSearchInput')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') handleSearchClick();
  });
  document.getElementById('mobileSearchInput')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') handleMobileSearchClick();
  });
});

// Format currency
function formatPrice(amount) {
  if (!amount && amount !== 0) return "Kelishiladi";
  return Number(amount).toLocaleString('uz-UZ').replace(/,/g, ' ') + " so'm";
}

// Format relative date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Hozirgina';
  if (diffMins < 60) return `${diffMins} daqiqa oldin`;
  if (diffHours < 24) return `Bugun, ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  if (diffDays === 1) return `Kecha, ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  return `${date.getDate()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
}

// Toggle Mobile Filter Drawer
function toggleMobileFilterDrawer() {
  const sidebar = document.getElementById('sidebarFilterContainer');
  const chevron = document.getElementById('mobileFilterChevron');
  if (sidebar) {
    const isHidden = sidebar.classList.contains('hidden');
    if (isHidden) {
      sidebar.classList.remove('hidden');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
      sidebar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      sidebar.classList.add('hidden');
      if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
  }
}

// Load Site Settings
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      siteSettings = await res.json();
      
      if (document.getElementById('displayCardNumber')) {
        document.getElementById('displayCardNumber').textContent = siteSettings.cardNumber || '8600 5304 9876 1234';
      }
      if (document.getElementById('displayCardHolder')) {
        document.getElementById('displayCardHolder').textContent = siteSettings.cardHolder || 'ONLAYN BOZOR ADMIN';
      }
    }
  } catch (err) {
    console.error('Settings load error:', err);
  }
}

// Build query parameters based on filters
function getQueryParams() {
  const params = new URLSearchParams();

  // Region
  const regionVal = document.getElementById('filterRegion')?.value || currentSelectedRegion;
  if (regionVal && regionVal !== 'all') {
    params.append('region', regionVal);
  }

  // Brand
  const brandVal = document.getElementById('filterBrand')?.value || currentSelectedBrand;
  if (brandVal && brandVal !== 'all') {
    params.append('brand', brandVal);
  }

  // Condition
  const condVal = document.getElementById('filterCondition')?.value;
  if (condVal && condVal !== 'all') {
    params.append('condition', condVal);
  }

  // Price
  const minPrice = document.getElementById('filterMinPrice')?.value;
  if (minPrice) params.append('minPrice', minPrice);
  const maxPrice = document.getElementById('filterMaxPrice')?.value;
  if (maxPrice) params.append('maxPrice', maxPrice);

  // VIP only
  const vipOnly = document.getElementById('filterVipCheckbox')?.checked;
  if (vipOnly) params.append('vipOnly', 'true');

  // Search
  const searchDesktop = document.getElementById('desktopSearchInput')?.value;
  const searchMobile = document.getElementById('mobileSearchInput')?.value;
  const searchVal = searchDesktop || searchMobile;
  if (searchVal && searchVal.trim()) {
    params.append('search', searchVal.trim());
  }

  // Sort
  const sortVal = document.getElementById('sortBy')?.value;
  if (sortVal) params.append('sort', sortVal);

  return params.toString();
}

// Load listings from API
async function loadListings() {
  try {
    const query = getQueryParams();
    const res = await fetch(`/api/listings?${query}`);
    const data = await res.json();
    currentListings = data.listings || [];

    renderListings(currentListings);
    populateVipModalSelect(currentListings);
  } catch (err) {
    console.error('Error fetching listings:', err);
  }
}

// Silent background sync
async function loadListingsSilent() {
  try {
    const query = getQueryParams();
    const res = await fetch(`/api/listings?${query}`);
    const data = await res.json();
    const newListings = data.listings || [];

    if (newListings.length !== currentListings.length) {
      currentListings = newListings;
      renderListings(currentListings);
      populateVipModalSelect(currentListings);
    }
  } catch (err) {
    // Silent
  }
}

// Render Listings in VIP Grid and All Listings Grid
function renderListings(items) {
  const vipGrid = document.getElementById('vipListingsGrid');
  const allGrid = document.getElementById('allListingsGrid');
  const countBadge = document.getElementById('listingsCountBadge');
  const noResults = document.getElementById('noResultsBlock');
  const vipSection = document.getElementById('vipSection');

  if (countBadge) {
    countBadge.textContent = `${items.length} ta e'lon`;
  }

  // Filter VIP items for the dedicated VIP top section
  const vipItems = items.filter(item => item.isVip);

  // Render VIP Section
  if (vipItems.length > 0) {
    if (vipSection) vipSection.style.display = 'block';
    if (vipGrid) vipGrid.innerHTML = vipItems.map(item => createListingCardHTML(item, true)).join('');
  } else {
    if (vipGrid) {
      vipGrid.innerHTML = `
        <div class="col-span-full py-5 text-center bg-brand-card border border-dashed border-green-500/30 rounded-2xl p-4 sm:p-5">
          <i class="fa-solid fa-crown text-xl sm:text-2xl text-brand-green mb-1.5"></i>
          <p class="text-white font-bold text-xs sm:text-sm">Hozircha VIP e'lonlar yo'q</p>
          <p class="text-[11px] sm:text-xs text-slate-400 mt-0.5">E'lon berib, uni 1-o'ringa ko'tarish orqali telefoningizni tez soting!</p>
          <button onclick="openCreateModal()" class="mt-2.5 bg-brand-green hover:bg-emerald-500 text-black font-extrabold px-3.5 py-1.5 rounded-xl text-xs transition-colors shadow">
            + Bepul E'lon Joylash
          </button>
        </div>
      `;
    }
  }

  // Render All Listings Grid
  if (items.length === 0) {
    if (allGrid) {
      allGrid.innerHTML = `
        <div class="col-span-full py-12 px-4 text-center bg-brand-card border border-brand-cardBorder rounded-3xl space-y-3">
          <div class="w-14 h-14 rounded-2xl bg-brand-darker border border-brand-cardBorder flex items-center justify-center text-brand-green text-2xl mx-auto shadow-inner">
            <i class="fa-solid fa-mobile-screen-button"></i>
          </div>
          <h3 class="text-lg font-display font-extrabold text-white">Hozircha e'lonlar mavjud emas</h3>
          <p class="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Siz birinchi bo'lib o'z telefoningizni sotuvga qo'yishingiz mumkin. E'lon berish mutlaqo <b>BEPUL</b> va barcha 12 viloyat xaridorlariga ko'rinadi!
          </p>
          <div class="pt-2">
            <button onclick="openCreateModal()" class="bg-brand-green hover:bg-emerald-500 text-black font-black px-6 py-3 rounded-2xl text-xs sm:text-sm shadow-lg shadow-green-500/25 transition-all transform hover:scale-105">
              <i class="fa-solid fa-plus mr-1"></i> Birinchi Bo'lib E'lon Joylash
            </button>
          </div>
        </div>
      `;
    }
    if (noResults) noResults.classList.add('hidden');
  } else {
    if (noResults) noResults.classList.add('hidden');
    if (allGrid) allGrid.innerHTML = items.map(item => createListingCardHTML(item, false)).join('');
  }
}

// Generate HTML for a Listing Card
function createListingCardHTML(item, isVipSection = false) {
  const hasImages = item.images && item.images.length > 0;
  const primaryImg = hasImages ? item.images[0] : null;

  const vipBadge = item.isVip ? `
    <div class="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 z-10 bg-gradient-to-r from-emerald-500 to-green-400 text-black font-black text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-md shadow-lg flex items-center gap-1 uppercase tracking-wider animate-pulse">
      <i class="fa-solid fa-crown text-[8px] sm:text-[9px]"></i> VIP
    </div>
  ` : '';

  const imageBlock = primaryImg ? `
    <img src="${escapeHtml(primaryImg)}" alt="${escapeHtml(item.title)}" 
         class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
  ` : `
    <div class="w-full h-full bg-slate-900/90 flex flex-col items-center justify-center text-slate-500 group-hover:text-brand-green transition-colors">
      <i class="fa-solid fa-camera text-2xl sm:text-3xl mb-1 opacity-70"></i>
      <span class="text-[10px] font-semibold">Rasm yuklanmagan</span>
    </div>
  `;

  return `
    <div class="listing-card rounded-2xl overflow-hidden flex flex-col justify-between relative group ${item.isVip ? 'is-vip' : ''}">
      
      <!-- Top Image & Badges -->
      <div class="relative h-40 sm:h-44 md:h-48 bg-slate-900 overflow-hidden cursor-pointer" onclick="openDetailModal('${item.id}')">
        ${vipBadge}
        
        <!-- Region Badge -->
        <div class="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-10 bg-black/80 backdrop-blur-sm text-slate-200 font-bold text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-md border border-white/10 flex items-center gap-1">
          <i class="fa-solid fa-location-dot text-brand-green text-[8px] sm:text-[9px]"></i>
          <span>${escapeHtml(item.region ? item.region.replace(' viloyati', '') : '')}</span>
        </div>

        ${imageBlock}
        
        <!-- Photo Count -->
        ${hasImages && item.images.length > 1 ? `
          <div class="absolute bottom-2 right-2 bg-black/80 text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
            <i class="fa-solid fa-images text-[8px]"></i> ${item.images.length}
          </div>
        ` : ''}
      </div>

      <!-- Card Body -->
      <div class="p-3 sm:p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <!-- Title & Model -->
          <h3 class="font-display font-extrabold text-white text-xs sm:text-sm leading-snug line-clamp-1 hover:text-brand-green cursor-pointer transition-colors" onclick="openDetailModal('${item.id}')">
            ${escapeHtml(item.title)}
          </h3>

          <!-- Price -->
          <div class="mt-1 flex items-baseline justify-between">
            <span class="text-xs sm:text-sm md:text-base font-black text-brand-green">
              ${formatPrice(item.price)}
            </span>
            ${item.condition ? `
              <span class="text-[8px] sm:text-[9px] font-bold text-slate-300 bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700">
                ${escapeHtml(item.condition)}
              </span>
            ` : ''}
          </div>

          <!-- Specs snippet -->
          <div class="mt-1.5 sm:mt-2 flex flex-wrap gap-1 text-[9px] sm:text-[10px] text-slate-400">
            ${item.storage ? `<span class="bg-brand-darker px-1.5 py-0.5 rounded border border-brand-cardBorder">${escapeHtml(item.storage)}</span>` : ''}
            ${item.batteryHealth && item.batteryHealth !== "Noma'lum" ? `<span class="bg-brand-darker px-1.5 py-0.5 rounded border border-brand-cardBorder"><i class="fa-solid fa-battery-half text-brand-green mr-0.5"></i> ${escapeHtml(item.batteryHealth)}</span>` : ''}
            ${item.district ? `<span class="bg-brand-darker px-1.5 py-0.5 rounded border border-brand-cardBorder hidden sm:inline"><i class="fa-solid fa-map-pin text-slate-500 mr-0.5"></i> ${escapeHtml(item.district)}</span>` : ''}
          </div>
        </div>

        <!-- Card Footer Actions -->
        <div class="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-brand-cardBorder/70 flex items-center justify-between gap-1.5">
          
          <!-- Call Button -->
          <a href="tel:${escapeHtml(item.sellerPhone)}" class="flex-1 bg-brand-green hover:bg-emerald-500 text-black font-extrabold py-1.5 px-2 rounded-xl text-[10px] sm:text-[11px] text-center flex items-center justify-center gap-1 shadow transition-colors" title="Qo'ng'iroq qilish">
            <i class="fa-solid fa-phone text-[9px] sm:text-[10px]"></i>
            <span>Qo'ng'iroq</span>
          </a>

          <!-- Telegram Button -->
          ${item.sellerTelegram ? `
            <a href="https://t.me/${escapeHtml(item.sellerTelegram)}" target="_blank" class="w-7 h-7 rounded-xl bg-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white border border-sky-500/30 flex items-center justify-center text-xs transition-all" title="Telegram: @${escapeHtml(item.sellerTelegram)}">
              <i class="fa-brands fa-telegram"></i>
            </a>
          ` : ''}

          <!-- VIP Boost Button -->
          ${!item.isVip ? `
            <button onclick="openVipModalForListing('${item.id}')" class="w-7 h-7 rounded-xl bg-green-500/15 text-brand-green hover:bg-brand-green hover:text-black border border-green-500/40 flex items-center justify-center text-[10px] transition-all" title="Ushbu e'lonni VIP 1-o'ringa ko'tarish">
              <i class="fa-solid fa-crown"></i>
            </button>
          ` : ''}

          <!-- View Detail Button -->
          <button onclick="openDetailModal('${item.id}')" class="w-7 h-7 rounded-xl bg-brand-darker text-slate-400 hover:text-white border border-brand-cardBorder flex items-center justify-center text-[10px] transition-colors" title="Batafsil ko'rish">
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>

      </div>

    </div>
  `;
}

// Quick Brand Selection from top bar
function selectBrandQuick(brandName) {
  currentSelectedBrand = brandName;
  
  document.querySelectorAll('.brand-pill').forEach(btn => {
    if (btn.getAttribute('data-brand') === brandName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const sidebarBrand = document.getElementById('filterBrand');
  if (sidebarBrand) sidebarBrand.value = brandName;

  loadListings();
}

// Apply sidebar filters
function applyFilters() {
  const sidebarBrand = document.getElementById('filterBrand')?.value;
  if (sidebarBrand) {
    currentSelectedBrand = sidebarBrand;
    document.querySelectorAll('.brand-pill').forEach(btn => {
      if (btn.getAttribute('data-brand') === sidebarBrand) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
  loadListings();
}

// Debounced filters for typing price
function applyFiltersDebounced() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    applyFilters();
  }, 400);
}

// Search triggers
function handleSearchClick() {
  const val = document.getElementById('desktopSearchInput')?.value;
  const mobileInput = document.getElementById('mobileSearchInput');
  if (mobileInput) mobileInput.value = val;
  loadListings();
}

function handleMobileSearchClick() {
  const val = document.getElementById('mobileSearchInput')?.value;
  const deskInput = document.getElementById('desktopSearchInput');
  if (deskInput) deskInput.value = val;
  loadListings();
}

function filterVipOnly() {
  const chk = document.getElementById('filterVipCheckbox');
  if (chk) {
    chk.checked = true;
    applyFilters();
  }
}

function resetFilters() {
  if (document.getElementById('filterRegion')) document.getElementById('filterRegion').value = 'all';
  if (document.getElementById('filterBrand')) document.getElementById('filterBrand').value = 'all';
  if (document.getElementById('filterCondition')) document.getElementById('filterCondition').value = 'all';
  if (document.getElementById('filterMinPrice')) document.getElementById('filterMinPrice').value = '';
  if (document.getElementById('filterMaxPrice')) document.getElementById('filterMaxPrice').value = '';
  if (document.getElementById('filterVipCheckbox')) document.getElementById('filterVipCheckbox').checked = false;
  if (document.getElementById('desktopSearchInput')) document.getElementById('desktopSearchInput').value = '';
  if (document.getElementById('mobileSearchInput')) document.getElementById('mobileSearchInput').value = '';
  if (document.getElementById('sortBy')) document.getElementById('sortBy').value = 'vip_newest';
  
  selectBrandQuick('all');
}

// Open modals
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
}

function handleBackdropClick(e, modalId) {
  if (e.target.id === modalId) {
    closeModal(modalId);
  }
}

function openCreateModal() {
  document.getElementById('createListingForm')?.reset();
  const preview = document.getElementById('photoPreviewContainer');
  if (preview) preview.innerHTML = '';
  openModal('createListingModal');
}

function openContactModal() {
  openModal('contactModal');
}

function openAdminModal() {
  openModal('adminModal');
  checkAdminSession();
}

// Photo preview for listing creation
function handlePhotoPreview(e) {
  const container = document.getElementById('photoPreviewContainer');
  if (!container) return;
  container.innerHTML = '';
  const files = e.target.files;

  if (files && files.length > 0) {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const div = document.createElement('div');
        div.className = 'w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden border border-brand-green relative shadow shrink-0';
        div.innerHTML = `<img src="${event.target.result}" class="w-full h-full object-cover">`;
        container.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }
}

// Handle Listing Creation Form Submit
async function handleCreateListing(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById('submitListingBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Saqlanmoqda...`;

  try {
    const formData = new FormData(form);
    const res = await fetch('/api/listings', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || "E'loningiz doimiy saqlandi va hammaga ko'rindi!", 'success');
      closeModal('createListingModal');
      form.reset();
      const preview = document.getElementById('photoPreviewContainer');
      if (preview) preview.innerHTML = '';
      
      await loadListings();

      setTimeout(() => {
        if (confirm("E'loningiz saytga joylashtirildi va hammaga ko'rindi! Uni darhol VIP (1-o'ringa) ko'tarib tezroq sotishni xohlaysizmi?")) {
          openVipModalForListing(data.listing.id);
        }
      }, 500);
    } else {
      showToast(data.error || "E'lonni saqlashda xatolik yuz berdi", 'error');
    }
  } catch (err) {
    console.error('Create listing error:', err);
    showToast("Server bilan ulanishda xatolik", 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane mr-2"></i> E'lonni Bepul Joylashtirish`;
  }
}

// Detail Modal (Responsive for Mobile, Tablet, PC)
async function openDetailModal(id) {
  const detailContainer = document.getElementById('detailContent');
  if (!detailContainer) return;

  detailContainer.innerHTML = `
    <div class="py-12 sm:py-16 text-center text-slate-400">
      <i class="fa-solid fa-spinner fa-spin text-2xl sm:text-3xl text-brand-green"></i>
      <p class="mt-2 text-xs sm:text-sm">E'lon ma'lumotlari yuklanmoqda...</p>
    </div>
  `;
  openModal('detailModal');

  try {
    const res = await fetch(`/api/listings/${id}`);
    if (!res.ok) throw new Error("E'lon topilmadi");
    const item = await res.json();
    currentDetailListing = item;

    const hasImages = item.images && item.images.length > 0;
    const images = hasImages ? item.images : [];

    const imageGalleryHTML = hasImages ? `
      <div class="space-y-2.5 sm:space-y-3">
        <div class="relative h-56 sm:h-64 md:h-72 bg-slate-900 rounded-2xl overflow-hidden border border-brand-cardBorder">
          ${item.isVip ? `
            <div class="absolute top-2.5 left-2.5 z-10 bg-gradient-to-r from-emerald-500 to-green-400 text-black font-black text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg shadow-lg flex items-center gap-1 uppercase">
              <i class="fa-solid fa-crown text-[9px]"></i> VIP TOP E'LON
            </div>
          ` : ''}
          <img id="detailMainImage" src="${escapeHtml(images[0])}" class="w-full h-full object-contain p-2">
        </div>

        ${images.length > 1 ? `
          <div class="flex gap-2 overflow-x-auto pb-1">
            ${images.map((img) => `
              <button onclick="document.getElementById('detailMainImage').src='${escapeHtml(img)}'" class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 border-brand-cardBorder hover:border-brand-green overflow-hidden shrink-0 transition-colors">
                <img src="${escapeHtml(img)}" class="w-full h-full object-cover">
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    ` : `
      <div class="h-56 sm:h-64 md:h-72 bg-slate-900 rounded-2xl border border-brand-cardBorder flex flex-col items-center justify-center text-slate-500">
        <i class="fa-solid fa-camera text-4xl mb-2"></i>
        <span class="text-xs">Rasm yuklanmagan</span>
      </div>
    `;

    detailContainer.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        
        <!-- Left: Image Gallery -->
        ${imageGalleryHTML}

        <!-- Right: Specs & Seller Info -->
        <div class="space-y-3 sm:space-y-4 flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-2 text-[11px] sm:text-xs text-brand-green font-bold uppercase">
              <i class="fa-solid fa-tag"></i> <span>${escapeHtml(item.brand)}</span>
              <span class="text-slate-500">•</span>
              <span class="text-slate-400">${formatDate(item.createdAt)}</span>
            </div>

            <h2 class="text-base sm:text-lg md:text-xl font-display font-extrabold text-white mt-1">
              ${escapeHtml(item.title)}
            </h2>

            <div class="text-lg sm:text-xl font-black text-brand-green mt-1">
              ${formatPrice(item.price)}
            </div>

            <!-- Specs Grid -->
            <div class="mt-2.5 sm:mt-3 grid grid-cols-2 gap-2 text-xs">
              <div class="bg-brand-darker p-2 rounded-xl border border-brand-cardBorder">
                <span class="text-slate-400 block text-[9px] sm:text-[10px]">Viloyat</span>
                <span class="font-bold text-white text-[11px] sm:text-xs">${escapeHtml(item.region)}</span>
              </div>
              <div class="bg-brand-darker p-2 rounded-xl border border-brand-cardBorder">
                <span class="text-slate-400 block text-[9px] sm:text-[10px]">Tuman</span>
                <span class="font-bold text-white text-[11px] sm:text-xs">${escapeHtml(item.district || "Kiritilmagan")}</span>
              </div>
              <div class="bg-brand-darker p-2 rounded-xl border border-brand-cardBorder">
                <span class="text-slate-400 block text-[9px] sm:text-[10px]">Holati</span>
                <span class="font-bold text-white text-[11px] sm:text-xs">${escapeHtml(item.condition || "Yaxshi")}</span>
              </div>
              <div class="bg-brand-darker p-2 rounded-xl border border-brand-cardBorder">
                <span class="text-slate-400 block text-[9px] sm:text-[10px]">Xotira (RAM/ROM)</span>
                <span class="font-bold text-white text-[11px] sm:text-xs">${escapeHtml(item.storage || "Noma'lum")}</span>
              </div>
              <div class="bg-brand-darker p-2 rounded-xl border border-brand-cardBorder">
                <span class="text-slate-400 block text-[9px] sm:text-[10px]">Batareya</span>
                <span class="font-bold text-white text-[11px] sm:text-xs">${escapeHtml(item.batteryHealth || "Noma'lum")}</span>
              </div>
              <div class="bg-brand-darker p-2 rounded-xl border border-brand-cardBorder">
                <span class="text-slate-400 block text-[9px] sm:text-[10px]">Rangi</span>
                <span class="font-bold text-white text-[11px] sm:text-xs">${escapeHtml(item.color || "Standart")}</span>
              </div>
            </div>

            <!-- Description -->
            ${item.description ? `
              <div class="mt-2.5 sm:mt-3 p-2.5 sm:p-3 bg-brand-darker/60 rounded-xl border border-brand-cardBorder text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                <div class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase mb-1">Qo'shimcha ma'lumot:</div>
                ${escapeHtml(item.description)}
              </div>
            ` : ''}
          </div>

          <!-- Contact Actions -->
          <div class="pt-3 border-t border-brand-cardBorder space-y-2">
            <div class="text-xs font-bold text-slate-300">Sotuvchi bilan bog'lanish:</div>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <a href="tel:${escapeHtml(item.sellerPhone)}" class="bg-brand-green hover:bg-emerald-500 text-black font-extrabold py-2.5 px-3 rounded-xl text-xs text-center flex items-center justify-center gap-1.5 shadow transition-colors">
                <i class="fa-solid fa-phone"></i>
                <span>${escapeHtml(item.sellerPhone)}</span>
              </a>

              ${item.sellerTelegram ? `
                <a href="https://t.me/${escapeHtml(item.sellerTelegram)}" target="_blank" class="bg-sky-500 hover:bg-sky-600 text-white font-extrabold py-2.5 px-3 rounded-xl text-xs text-center flex items-center justify-center gap-1.5 shadow transition-colors">
                  <i class="fa-brands fa-telegram"></i>
                  <span>@${escapeHtml(item.sellerTelegram)}</span>
                </a>
              ` : `
                <div class="bg-brand-darker text-slate-400 py-2.5 px-3 rounded-xl text-xs text-center border border-brand-cardBorder">
                  Telegram ko'rsatilmagan
                </div>
              `}
            </div>

            ${!item.isVip ? `
              <button onclick="closeModal('detailModal'); openVipModalForListing('${item.id}')" class="w-full bg-gradient-to-r from-emerald-500 to-green-400 hover:from-green-400 hover:to-emerald-500 text-black font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition-all">
                <i class="fa-solid fa-crown"></i>
                <span>Ushbu e'lonni 1-o'ringa ko'tarish (VIP)</span>
              </button>
            ` : ''}
          </div>

        </div>

      </div>
    `;
  } catch (err) {
    console.error(err);
    detailContainer.innerHTML = `<div class="p-6 text-center text-red-400">E'lon topilmadi yoki o'chirilgan</div>`;
  }
}

// Populate VIP Modal Listing Selector
function populateVipModalSelect(items) {
  const select = document.getElementById('vipListingSelect');
  if (!select) return;

  if (!items || items.length === 0) {
    select.innerHTML = `<option value="">Avval e'lon qo'shishingiz kerak</option>`;
    return;
  }

  select.innerHTML = items.map(item => `
    <option value="${item.id}">${escapeHtml(item.title)} - ${formatPrice(item.price)} (${escapeHtml(item.region)})</option>
  `).join('');
}

// Open VIP modal directly
function openVipModalDirect() {
  populateVipModalSelect(currentListings);
  openModal('vipModal');
}

// Open VIP modal for specific listing
function openVipModalForListing(listingId) {
  populateVipModalSelect(currentListings);
  const select = document.getElementById('vipListingSelect');
  if (select) select.value = listingId;
  openModal('vipModal');
}

// Select Tariff Radio and update visual card styles
function selectTariffRadio(tariffKey) {
  ['1_day', '7_days', '21_days'].forEach(key => {
    const radio = document.getElementById(`radioTariff_${key}`);
    const card = document.getElementById(`tariffCard_${key}`);
    if (radio && card) {
      if (key === tariffKey) {
        radio.checked = true;
        card.classList.add('active');
      } else {
        radio.checked = false;
        card.classList.remove('active');
      }
    }
  });
}

// Copy admin card number
function copyCardNumber() {
  const cardNum = document.getElementById('displayCardNumber')?.textContent || '8600530498761234';
  const cleanNum = cardNum.replace(/\s+/g, '');
  navigator.clipboard.writeText(cleanNum).then(() => {
    showToast("Karta raqami nusxalandi!", 'success');
  }).catch(() => {
    showToast("Karta raqami: " + cardNum, 'info');
  });
}

// Handle VIP Upgrade Form Submission
async function handleVipUpgrade(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById('submitVipBtn');
  
  const listingId = document.getElementById('vipListingSelect')?.value;
  if (!listingId) {
    showToast("Iltimos, e'lonni tanlang!", 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Yuborilmoqda...`;

  try {
    const formData = new FormData(form);
    const res = await fetch('/api/vip-request', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || "VIP so'rovingiz qabul qilindi! Admin to'lovni tasdiqlashi bilan e'loningiz 1-o'ringa ko'tariladi.", 'success');
      closeModal('vipModal');
      form.reset();
      selectTariffRadio('7_days');
    } else {
      showToast(data.error || "So'rov yuborishda xatolik yuz berdi", 'error');
    }
  } catch (err) {
    console.error('VIP submit error:', err);
    showToast("Server bilan aloqada xatolik", 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-circle-check mr-2"></i> To'lovni Tasdiqlash va VIP Olish`;
  }
}

// Show Toast Message
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgClass = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-red-600' : 'bg-brand-card border border-brand-green');
  const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle');

  toast.className = `toast ${bgClass} text-white px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl shadow-2xl flex items-center space-x-2.5 sm:space-x-3 text-xs sm:text-sm font-bold pointer-events-auto max-w-sm`;
  toast.innerHTML = `
    <i class="fa-solid ${icon} text-base"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Utility: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
