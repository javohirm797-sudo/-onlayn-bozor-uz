// ================= ONLAYN BOZOR UZ ADMIN PANEL LOGIC (GREEN & BLACK THEME) ================= //

let adminPin = localStorage.getItem('adminPin') || '';
let adminAllListings = [];

// Check session on open
function checkAdminSession() {
  if (adminPin) {
    verifyAdminPin(adminPin, true);
  } else {
    showAdminLogin();
  }
}

// Show login form
function showAdminLogin() {
  const loginBlock = document.getElementById('adminLoginFormBlock');
  const dashBlock = document.getElementById('adminDashboardBlock');
  if (loginBlock) loginBlock.classList.remove('hidden');
  if (dashBlock) dashBlock.classList.add('hidden');
  const pinInput = document.getElementById('adminPinInput');
  if (pinInput) {
    pinInput.value = '';
    setTimeout(() => pinInput.focus(), 150);
  }
}

// Show dashboard
function showAdminDashboard() {
  const loginBlock = document.getElementById('adminLoginFormBlock');
  const dashBlock = document.getElementById('adminDashboardBlock');
  if (loginBlock) loginBlock.classList.add('hidden');
  if (dashBlock) dashBlock.classList.remove('hidden');
  
  loadAdminStats();
  loadAdminVipRequests();
  loadAdminListings();
  loadAdminSettingsForm();
}

// Handle Admin Login Form Submit
async function handleAdminLogin(e) {
  e.preventDefault();
  const inputPin = document.getElementById('adminPinInput')?.value.trim();
  
  if (!inputPin) {
    showToast("PIN kodni kiriting!", 'error');
    return;
  }

  const btn = document.getElementById('adminLoginBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Tekshirilmoqda...`;
  }

  await verifyAdminPin(inputPin, false);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `Kirish`;
  }
}

// Verify PIN with server
async function verifyAdminPin(pin, isAuto = false) {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      adminPin = pin;
      localStorage.setItem('adminPin', pin);
      if (!isAuto) showToast("Admin panelga muvaffaqiyatli kirdingiz!", 'success');
      showAdminDashboard();
    } else {
      adminPin = '';
      localStorage.removeItem('adminPin');
      if (!isAuto) showToast(data.error || "PIN-kod noto'g'ri!", 'error');
      showAdminLogin();
    }
  } catch (err) {
    console.error('Admin login error:', err);
    if (!isAuto) showToast("Server bilan ulanishda xatolik", 'error');
    showAdminLogin();
  }
}

// Logout
function adminLogout() {
  adminPin = '';
  localStorage.removeItem('adminPin');
  showToast("Admin paneldan chiqildi", 'info');
  showAdminLogin();
}

// Switch tabs inside Admin Panel
function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.classList.remove('border-b-2', 'border-brand-green', 'text-brand-green');
    btn.classList.add('text-slate-400');
  });

  document.getElementById('tabContentRequests')?.classList.add('hidden');
  document.getElementById('tabContentListings')?.classList.add('hidden');
  document.getElementById('tabContentSettings')?.classList.add('hidden');

  if (tabName === 'requests') {
    document.getElementById('tabBtnRequests')?.classList.add('border-b-2', 'border-brand-green', 'text-brand-green');
    document.getElementById('tabContentRequests')?.classList.remove('hidden');
    loadAdminVipRequests();
  } else if (tabName === 'listings') {
    document.getElementById('tabBtnListings')?.classList.add('border-b-2', 'border-brand-green', 'text-brand-green');
    document.getElementById('tabContentListings')?.classList.remove('hidden');
    loadAdminListings();
  } else if (tabName === 'settings') {
    document.getElementById('tabBtnSettings')?.classList.add('border-b-2', 'border-brand-green', 'text-brand-green');
    document.getElementById('tabContentSettings')?.classList.remove('hidden');
    loadAdminSettingsForm();
  }
}

// Load Stats
async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats', {
      headers: { 'x-admin-pin': adminPin }
    });
    if (res.ok) {
      const stats = await res.json();
      if (document.getElementById('statTotalListings')) document.getElementById('statTotalListings').textContent = stats.totalListings || 0;
      if (document.getElementById('statActiveVip')) document.getElementById('statActiveVip').textContent = stats.activeVipListings || 0;
      if (document.getElementById('statPendingVip')) document.getElementById('statPendingVip').textContent = stats.pendingRequests || 0;
      if (document.getElementById('statTotalEarned')) document.getElementById('statTotalEarned').textContent = formatPrice(stats.totalEarned || 0);
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// Load VIP Requests
async function loadAdminVipRequests() {
  const container = document.getElementById('adminVipRequestsList');
  if (!container) return;
  container.innerHTML = `<div class="p-6 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2 text-brand-green"></i> Yuklanmoqda...</div>`;

  try {
    const res = await fetch('/api/admin/vip-requests', {
      headers: { 'x-admin-pin': adminPin }
    });
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-slate-400 bg-brand-darker rounded-2xl border border-brand-cardBorder">
          <i class="fa-solid fa-circle-check text-2xl text-slate-500 mb-2"></i>
          <p>Hozircha yangi VIP to'lov so'rovlari mavjud emas.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.map(req => {
      const isPending = req.status === 'pending';
      const statusBadge = isPending 
        ? `<span class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-lg text-xs font-bold animate-pulse">Kutilmoqda</span>`
        : (req.status === 'approved' 
          ? `<span class="bg-green-500/20 text-green-400 border border-green-500/30 px-2.5 py-1 rounded-lg text-xs font-bold">Tasdiqlangan ✅</span>`
          : `<span class="bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-lg text-xs font-bold">Rad etilgan ❌</span>`);

      return `
        <div class="p-4 bg-brand-darker border border-brand-cardBorder rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div class="space-y-1.5 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-white text-sm sm:text-base">${escapeHtml(req.listingTitle)}</span>
              ${statusBadge}
            </div>
            <div class="text-xs text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
              <span>Tarif: <b class="text-brand-green">${escapeHtml(req.tariffName)}</b> (${formatPrice(req.amount)})</span>
              <span>Telefon: <b class="text-white">${escapeHtml(req.senderPhone)}</b></span>
              ${req.transactionCode ? `<span>To'lov kodi: <b class="text-white">${escapeHtml(req.transactionCode)}</b></span>` : ''}
              <span>Vaqt: <b class="text-slate-400">${formatDate(req.createdAt)}</b></span>
            </div>
            ${req.receiptUrl ? `
              <div class="pt-2">
                <a href="${req.receiptUrl}" target="_blank" class="inline-flex items-center gap-1.5 text-xs text-brand-green hover:underline bg-green-500/10 px-2.5 py-1 rounded-lg border border-green-500/20">
                  <i class="fa-solid fa-receipt"></i> To'lov chekini ochish
                </a>
              </div>
            ` : ''}
          </div>

          ${isPending ? `
            <div class="flex items-center space-x-2 shrink-0 w-full md:w-auto">
              <button onclick="approveVipRequest('${req.id}')" class="flex-1 md:flex-none bg-brand-green hover:bg-emerald-500 text-black font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow">
                <i class="fa-solid fa-check"></i> Tasdiqlash & VIP Qilish
              </button>
              <button onclick="rejectVipRequest('${req.id}')" class="flex-1 md:flex-none bg-red-600/30 hover:bg-red-600 text-red-200 hover:text-white border border-red-500/50 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1">
                <i class="fa-solid fa-xmark"></i> Rad etish
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('VIP requests load error:', err);
    container.innerHTML = `<div class="p-4 text-center text-red-400">So'rovlarni yuklashda xatolik</div>`;
  }
}

// Approve VIP Request
async function approveVipRequest(requestId) {
  try {
    const res = await fetch(`/api/admin/vip-requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'x-admin-pin': adminPin }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || "VIP tasdiqlandi va e'lon 1-o'ringa ko'tarildi!", 'success');
      loadAdminStats();
      loadAdminVipRequests();
      loadListings();
    } else {
      showToast(data.error || "Xatolik", 'error');
    }
  } catch (err) {
    console.error(err);
    showToast("Server bilan ulanishda xatolik", 'error');
  }
}

// Reject VIP Request
async function rejectVipRequest(requestId) {
  if (!confirm("Rostdan ham ushbu VIP to'lov so'rovini rad etmoqchimisiz?")) return;

  try {
    const res = await fetch(`/api/admin/vip-requests/${requestId}/reject`, {
      method: 'POST',
      headers: { 'x-admin-pin': adminPin }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast("So'rov rad etildi", 'info');
      loadAdminStats();
      loadAdminVipRequests();
    } else {
      showToast(data.error || "Xatolik", 'error');
    }
  } catch (err) {
    console.error(err);
    showToast("Server bilan ulanishda xatolik", 'error');
  }
}

// Load All Listings for Admin Table
async function loadAdminListings() {
  const container = document.getElementById('adminAllListingsTable');
  if (!container) return;
  container.innerHTML = `<div class="p-6 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2 text-brand-green"></i> E'lonlar yuklanmoqda...</div>`;

  try {
    const res = await fetch('/api/admin/listings', {
      headers: { 'x-admin-pin': adminPin }
    });
    const data = await res.json();
    adminAllListings = Array.isArray(data) ? data : [];
    renderAdminListingsTable(adminAllListings);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="p-4 text-center text-red-400">E'lonlarni yuklashda xatolik</div>`;
  }
}

// Filter Admin listings on search input
function filterAdminListings() {
  const q = document.getElementById('adminListingSearch')?.value.toLowerCase();
  if (!q) {
    renderAdminListingsTable(adminAllListings);
    return;
  }
  const filtered = adminAllListings.filter(item => 
    (item.title && item.title.toLowerCase().includes(q)) ||
    (item.region && item.region.toLowerCase().includes(q)) ||
    (item.sellerPhone && item.sellerPhone.includes(q))
  );
  renderAdminListingsTable(filtered);
}

// Render Admin listings items
function renderAdminListingsTable(items) {
  const container = document.getElementById('adminAllListingsTable');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-slate-400 bg-brand-darker rounded-2xl">Hech qanday e'lon topilmadi</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="p-3.5 bg-brand-darker border border-brand-cardBorder rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
      
      <!-- Info -->
      <div class="flex items-center space-x-3 flex-1">
        <img src="${(item.images && item.images[0]) || ''}" class="w-12 h-12 rounded-xl object-cover border border-brand-cardBorder shrink-0" onerror="this.src='https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&auto=format&fit=crop&q=60'">
        <div>
          <div class="font-extrabold text-white text-sm flex items-center gap-2">
            <span>${escapeHtml(item.title)}</span>
            ${item.isVip ? `<span class="bg-brand-green text-black text-[10px] font-black px-1.5 py-0.5 rounded uppercase">VIP</span>` : ''}
          </div>
          <div class="text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span class="text-brand-green font-bold">${formatPrice(item.price)}</span>
            <span>📍 ${escapeHtml(item.region)}</span>
            <span>📞 ${escapeHtml(item.sellerPhone)}</span>
            <span>👁️ ${item.views || 0} ko'rish</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center space-x-2 shrink-0">
        ${item.isVip ? `
          <button onclick="setListingVip('${item.id}', false)" class="bg-green-500/20 text-brand-green hover:bg-brand-green hover:text-black border border-green-500/40 px-3 py-1.5 rounded-xl font-bold transition-all">
            VIP Bekor Qilish
          </button>
        ` : `
          <button onclick="setListingVip('${item.id}', true, 1)" class="bg-brand-darker border border-brand-cardBorder hover:border-brand-green text-slate-200 px-2.5 py-1.5 rounded-xl font-bold transition-all" title="1 kunlik VIP berish">
            +1K
          </button>
          <button onclick="setListingVip('${item.id}', true, 7)" class="bg-brand-green hover:bg-emerald-500 text-black px-3 py-1.5 rounded-xl font-extrabold transition-all" title="7 kunlik VIP berish">
            +7 Kun VIP
          </button>
          <button onclick="setListingVip('${item.id}', true, 21)" class="bg-brand-darker border border-green-500/50 text-brand-green px-2.5 py-1.5 rounded-xl font-bold transition-all" title="21 kunlik VIP berish">
            +21K
          </button>
        `}

        <!-- Delete button -->
        <button onclick="deleteListingAdmin('${item.id}')" class="bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30 p-2 rounded-xl transition-all" title="E'lonni o'chirish">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>

    </div>
  `).join('');
}

// Toggle or Set VIP status for listing from admin
async function setListingVip(listingId, isVip, days = 7) {
  try {
    const res = await fetch(`/api/admin/listings/${listingId}/vip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': adminPin
      },
      body: JSON.stringify({ isVip, days })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(isVip ? `E'longa ${days} kunlik VIP berildi!` : "VIP o'chirildi", 'success');
      loadAdminStats();
      loadAdminListings();
      loadListings();
    } else {
      showToast(data.error || "Xatolik", 'error');
    }
  } catch (err) {
    console.error(err);
    showToast("Server bilan aloqada xatolik", 'error');
  }
}

// Delete Listing by Admin
async function deleteListingAdmin(listingId) {
  if (!confirm("Haqiqatan ham bu e'lonni butunlay o'chirmoqchimisiz?")) return;

  try {
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: 'DELETE',
      headers: { 'x-admin-pin': adminPin }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast("E'lon o'chirildi", 'info');
      loadAdminStats();
      loadAdminListings();
      loadListings();
    } else {
      showToast(data.error || "Xatolik", 'error');
    }
  } catch (err) {
    console.error(err);
    showToast("Server bilan aloqada xatolik", 'error');
  }
}

// Populate Settings Form
async function loadAdminSettingsForm() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (document.getElementById('settingSiteName')) document.getElementById('settingSiteName').value = data.siteName || '';
      if (document.getElementById('settingCardNumber')) document.getElementById('settingCardNumber').value = data.cardNumber || '';
      if (document.getElementById('settingCardHolder')) document.getElementById('settingCardHolder').value = data.cardHolder || '';
      if (document.getElementById('settingAdminTelegram')) document.getElementById('settingAdminTelegram').value = data.adminTelegram || '';
      if (document.getElementById('settingAdminPhone')) document.getElementById('settingAdminPhone').value = data.adminPhone || '';
      if (document.getElementById('settingAdminInstagram')) document.getElementById('settingAdminInstagram').value = data.adminInstagram || '';
      if (document.getElementById('settingAdminPin')) document.getElementById('settingAdminPin').value = adminPin || '1111';
    }
  } catch (err) {
    console.error(err);
  }
}

// Save Settings Handler
async function handleSaveSettings(e) {
  e.preventDefault();

  const siteName = document.getElementById('settingSiteName')?.value;
  const cardNumber = document.getElementById('settingCardNumber')?.value;
  const cardHolder = document.getElementById('settingCardHolder')?.value;
  const adminTelegram = document.getElementById('settingAdminTelegram')?.value;
  const adminPhone = document.getElementById('settingAdminPhone')?.value;
  const adminInstagram = document.getElementById('settingAdminInstagram')?.value;
  const newPin = document.getElementById('settingAdminPin')?.value;

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': adminPin
      },
      body: JSON.stringify({
        siteName,
        cardNumber,
        cardHolder,
        adminTelegram,
        adminPhone,
        adminInstagram,
        adminPin: newPin
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (newPin) {
        adminPin = newPin;
        localStorage.setItem('adminPin', newPin);
      }
      showToast("Sozlamalar muvaffaqiyatli saqlandi!", 'success');
      loadSettings();
    } else {
      showToast(data.error || "Xatolik", 'error');
    }
  } catch (err) {
    console.error(err);
    showToast("Sozlamalarni saqlashda xatolik", 'error');
  }
}
