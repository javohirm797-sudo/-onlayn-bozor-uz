require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// High-speed Performance Middlewares
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Strict Zero-Cache Middleware (Browsers will ALWAYS load the latest version immediately!)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Static file serving with instant freshness
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  maxAge: 0
}));

// Configure Multer for photo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

// Explicit Unique Visitor Ping from Client (F5 will NOT increment count!)
app.post('/api/track-visit', async (req, res) => {
  const { visitorId } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const id = visitorId || ip || 'v_default';
  await db.trackUniqueVisitor(id, ip);
  const online = db.getLiveOnlineCount();
  const totalViews = await db.getUniqueVisitorsCount();
  res.json({ success: true, online, totalViews });
});

// When user closes tab / leaves page
app.post('/api/visitor-leave', (req, res) => {
  const { visitorId } = req.body;
  if (visitorId) db.removeOnlineVisitor(visitorId);
  res.json({ success: true });
});

// Admin Auth Middleware (PIN: 23232008)
async function checkAdminAuth(req, res, next) {
  const currentSettings = await db.getSettings();
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  if (pin === currentSettings.adminPin || pin === '23232008') {
    next();
  } else {
    res.status(401).json({ error: "Admin PIN-kodi noto'g'ri!" });
  }
}

// Public Live Stats Endpoint (Live Online Users & Real Unique Visitors)
app.get('/api/stats', async (req, res) => {
  try {
    const totalViews = await db.getUniqueVisitorsCount();
    const onlineUsers = db.getLiveOnlineCount();
    const result = await db.getListings({});
    res.json({
      onlineUsers: Math.max(1, onlineUsers),
      totalViews: Math.max(1, totalViews),
      totalListings: result.total || 0
    });
  } catch (err) {
    res.json({ onlineUsers: 1, totalViews: 1, totalListings: 0 });
  }
});

// 1. Get Site Settings & Info
app.get('/api/settings', async (req, res) => {
  try {
    const currentSettings = await db.getSettings();
    res.json({
      siteName: currentSettings.siteName,
      adminTelegram: currentSettings.adminTelegram,
      adminPhone: currentSettings.adminPhone,
      adminInstagram: currentSettings.adminInstagram,
      cardNumber: currentSettings.cardNumber,
      cardHolder: currentSettings.cardHolder,
      vipTariffs: currentSettings.vipTariffs
    });
  } catch (err) {
    res.status(500).json({ error: "Xatolik" });
  }
});

// 2. Get All Listings with Search & Filtering
app.get('/api/listings', async (req, res) => {
  try {
    const result = await db.getListings(req.query);
    res.json(result);
  } catch (err) {
    console.error("Get listings error:", err);
    res.status(500).json({ total: 0, listings: [] });
  }
});

// 3. Get Single Listing Detail
app.get('/api/listings/:id', async (req, res) => {
  try {
    const listing = await db.getListingById(req.params.id);
    if (!listing) {
      return res.status(404).json({ error: "E'lon topilmadi" });
    }
    res.json(listing);
  } catch (err) {
    res.status(500).json({ error: "Xatolik" });
  }
});

// 4. Create New Listing (Permanently saved to Neon PostgreSQL)
app.post('/api/listings', upload.array('photos', 6), async (req, res) => {
  try {
    const {
      title,
      brand,
      model,
      price,
      currency,
      region,
      district,
      condition,
      batteryHealth,
      storage,
      color,
      description,
      sellerName,
      sellerPhone,
      sellerTelegram
    } = req.body;

    if (!title || !brand || !price || !region || !sellerPhone) {
      return res.status(400).json({ error: "Iltimos, barcha majburiy maydonlarni to'ldiring!" });
    }

    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = req.files.map(file => '/uploads/' + file.filename);
    }

    const newListing = {
      id: 'item_' + uuidv4(),
      title: title.trim(),
      brand: brand.trim(),
      model: model ? model.trim() : title.trim(),
      price: Number(price),
      currency: currency || 'UZS',
      region: region.trim(),
      district: district ? district.trim() : '',
      condition: condition || 'Yaxshi holatda',
      batteryHealth: batteryHealth ? batteryHealth.trim() : 'Noma\'lum',
      storage: storage ? storage.trim() : '',
      color: color ? color.trim() : '',
      description: description ? description.trim() : '',
      sellerName: sellerName ? sellerName.trim() : 'Foydalanuvchi',
      sellerPhone: sellerPhone.trim(),
      sellerTelegram: sellerTelegram ? sellerTelegram.replace('@', '').trim() : '',
      images: imageUrls,
      isVip: false,
      vipExpiresAt: null,
      views: 1,
      createdAt: new Date().toISOString()
    };

    const saved = await db.createListing(newListing);
    console.log(`[Doimiy E'lon Saqlandi] ID: ${saved.id}, Nomi: ${saved.title}, Viloyat: ${saved.region}`);

    res.status(201).json({
      success: true,
      message: "E'loningiz doimiy bazaga saqlandi va barcha xaridorlarga darhol ko'rindi!",
      listing: saved
    });
  } catch (err) {
    console.error("Listing creation error:", err);
    res.status(500).json({ error: "E'lonni saqlashda xatolik yuz berdi" });
  }
});

// 5. Submit VIP / TOP Upgrade Request (Card Payment)
app.post('/api/vip-request', upload.single('receipt'), async (req, res) => {
  try {
    const { listingId, tariffKey, senderPhone, transactionCode, notes } = req.body;
    const currentSettings = await db.getSettings();
    const selectedKey = tariffKey || '7_days';
    const tariff = currentSettings.vipTariffs[selectedKey] || currentSettings.vipTariffs['7_days'];

    if (!listingId) {
      return res.status(400).json({ error: "Iltimos, e'lonni tanlang!" });
    }

    const targetListing = await db.getListingById(listingId);
    if (!targetListing) {
      return res.status(404).json({ error: "Bunday e'lon topilmadi" });
    }

    const receiptUrl = req.file ? '/uploads/' + req.file.filename : null;

    const newRequest = {
      id: 'req_' + uuidv4(),
      listingId: targetListing.id,
      listingTitle: targetListing.title,
      tariffKey: selectedKey,
      tariffName: tariff.name,
      days: tariff.days,
      amount: tariff.price,
      senderPhone: senderPhone || targetListing.sellerPhone,
      transactionCode: transactionCode || '',
      receiptUrl: receiptUrl,
      notes: notes || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const saved = await db.createVipRequest(newRequest);

    res.json({
      success: true,
      message: "VIP so'rovingiz qabul qilindi! Admin to'lovni tasdiqlashi bilan e'loningiz 1-o'ringa ko'tariladi.",
      request: saved
    });
  } catch (err) {
    console.error("VIP request error:", err);
    res.status(500).json({ error: "So'rov yuborishda xatolik yuz berdi" });
  }
});

// ================= ADMIN API (PIN: 23232008) ================= //

app.post('/api/admin/login', async (req, res) => {
  const { pin } = req.body;
  const currentSettings = await db.getSettings();
  if (pin === currentSettings.adminPin || pin === '23232008') {
    res.json({ success: true, message: "Xush kelibsiz, Admin!" });
  } else {
    res.status(401).json({ error: "PIN-kod noto'g'ri!" });
  }
});

app.get('/api/admin/stats', checkAdminAuth, async (req, res) => {
  try {
    const stats = await db.getAdminStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Stats error" });
  }
});

app.get('/api/admin/listings', checkAdminAuth, async (req, res) => {
  try {
    const listings = await db.getAllListingsAdmin();
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: "Listings error" });
  }
});

app.post('/api/admin/listings/:id/vip', checkAdminAuth, async (req, res) => {
  try {
    const { days, isVip } = req.body;
    const updated = await db.setListingVip(req.params.id, isVip, days);
    if (!updated) return res.status(404).json({ error: "E'lon topilmadi" });
    res.json({ success: true, listing: updated });
  } catch (err) {
    res.status(500).json({ error: "VIP toggle error" });
  }
});

app.delete('/api/admin/listings/:id', checkAdminAuth, async (req, res) => {
  try {
    await db.deleteListing(req.params.id);
    res.json({ success: true, message: "E'lon o'chirildi" });
  } catch (err) {
    res.status(500).json({ error: "Delete error" });
  }
});

app.get('/api/admin/vip-requests', checkAdminAuth, async (req, res) => {
  try {
    const requests = await db.getVipRequestsAdmin();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: "Requests error" });
  }
});

app.post('/api/admin/vip-requests/:id/approve', checkAdminAuth, async (req, res) => {
  try {
    const ok = await db.approveVipRequest(req.params.id);
    if (!ok) return res.status(404).json({ error: "So'rov topilmadi" });
    res.json({ success: true, message: "VIP muvaffaqiyatli tasdiqlandi va e'lon 1-o'ringa ko'tarildi!" });
  } catch (err) {
    res.status(500).json({ error: "Approve error" });
  }
});

app.post('/api/admin/vip-requests/:id/reject', checkAdminAuth, async (req, res) => {
  try {
    const ok = await db.rejectVipRequest(req.params.id);
    if (!ok) return res.status(404).json({ error: "So'rov topilmadi" });
    res.json({ success: true, message: "So'rov rad etildi" });
  } catch (err) {
    res.status(500).json({ error: "Reject error" });
  }
});

app.post('/api/admin/settings', checkAdminAuth, async (req, res) => {
  try {
    const currentSettings = await db.getSettings();
    const {
      adminPin,
      siteName,
      adminTelegram,
      adminPhone,
      adminInstagram,
      cardNumber,
      cardHolder
    } = req.body;

    if (adminPin) currentSettings.adminPin = adminPin.trim();
    if (siteName) currentSettings.siteName = siteName.trim();
    if (adminTelegram) currentSettings.adminTelegram = adminTelegram.trim();
    if (adminPhone) currentSettings.adminPhone = adminPhone.trim();
    if (adminInstagram) currentSettings.adminInstagram = adminInstagram.trim();
    if (cardNumber) currentSettings.cardNumber = cardNumber.trim();
    if (cardHolder) currentSettings.cardHolder = cardHolder.trim();

    const saved = await db.saveSettings(currentSettings);
    res.json({ success: true, message: "Sozlamalar saqlandi", settings: saved });
  } catch (err) {
    res.status(500).json({ error: "Settings save error" });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Database and Express Server
db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`================================================`);
    console.log(`🚀 Onlayn Bozor uz serveri faol!`);
    console.log(`🐘 Neon PostgreSQL doimiy bazasiga ulandi`);
    console.log(`🔒 Admin PIN: 23232008`);
    console.log(`🔗 Manzil: http://localhost:${PORT}`);
    console.log(`================================================`);
  });
}).catch(err => {
  console.error("Database init fatal error:", err);
});
