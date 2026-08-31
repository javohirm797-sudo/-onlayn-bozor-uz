require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Local fallback files
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const LISTINGS_BACKUP_FILE = path.join(DATA_DIR, 'listings_backup.json');
const VIP_REQUESTS_FILE = path.join(DATA_DIR, 'vip_requests.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Local helper functions
function readJson(file, defaultVal = []) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2), 'utf8');
      return defaultVal;
    }
    const content = fs.readFileSync(file, 'utf8');
    if (!content || content.trim() === '') return defaultVal;
    return JSON.parse(content);
  } catch (err) {
    if (file === LISTINGS_FILE && fs.existsSync(LISTINGS_BACKUP_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(LISTINGS_BACKUP_FILE, 'utf8'));
      } catch (bErr) {}
    }
    return defaultVal;
  }
}

function writeJson(file, data) {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(file, jsonStr, 'utf8');
    if (file === LISTINGS_FILE) fs.writeFileSync(LISTINGS_BACKUP_FILE, jsonStr, 'utf8');
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
  }
}

const defaultSettings = {
  adminPin: "23232008",
  siteName: "Onlayn Bozor uz",
  adminTelegram: "@Jovidze",
  adminPhone: "+998 94 776 25 28",
  adminInstagram: "@kurgansky_",
  cardNumber: "5614 6818 7592 1300",
  cardHolder: "Mavlonov Javohir",
  vipTariffs: {
    "1_day": { name: "1 kunlik VIP", days: 1, price: 5000, label: "5 000 so'm" },
    "7_days": { name: "7 kunlik VIP", days: 7, price: 15000, label: "15 000 so'm" },
    "21_days": { name: "21 kunlik VIP", days: 21, price: 30000, label: "30 000 so'm" }
  }
};

// PostgreSQL Pool setup (Optimized for 100s - 1,000s of concurrent users)
let pool = null;
let isPgConnected = false;

const connectionString = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (connectionString || (process.env.PGUSER && process.env.PGDATABASE)) {
  const needsSsl = connectionString 
    ? (connectionString.includes('neon.tech') || connectionString.includes('supabase') || connectionString.includes('render.com') || connectionString.includes('sslmode=require') || process.env.PGSSL === 'true')
    : process.env.PGSSL === 'true';

  const poolConfig = connectionString 
    ? { 
        connectionString, 
        ssl: needsSsl ? { rejectUnauthorized: false } : false,
        max: 30,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      }
    : {
        user: process.env.PGUSER || 'postgres',
        host: process.env.PGHOST || 'localhost',
        database: process.env.PGDATABASE || 'onlayn_bozor',
        password: process.env.PGPASSWORD || 'postgres',
        port: Number(process.env.PGPORT) || 5432,
        ssl: needsSsl ? { rejectUnauthorized: false } : false,
        max: 30,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      };

  pool = new Pool(poolConfig);
}

// Initialize database
async function initDb() {
  if (!pool) {
    console.log("ℹ️  PostgreSQL ulanish ma'lumotlari (.env) topilmadi. Doimiy JSON baza ishlatilmoqda.");
    return;
  }

  try {
    const client = await pool.connect();
    console.log("🐘 ================================================");
    console.log("🐘 Neon PostgreSQL bulut bazasiga muvaffaqiyatli ulandi!");
    console.log("🐘 ================================================");
    isPgConnected = true;

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id VARCHAR(100) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        brand VARCHAR(100) NOT NULL,
        model VARCHAR(255),
        price BIGINT NOT NULL,
        currency VARCHAR(10) DEFAULT 'UZS',
        region VARCHAR(100) NOT NULL,
        district VARCHAR(100),
        item_condition VARCHAR(100),
        battery_health VARCHAR(50),
        storage VARCHAR(50),
        color VARCHAR(100),
        description TEXT,
        seller_name VARCHAR(100),
        seller_phone VARCHAR(50) NOT NULL,
        seller_telegram VARCHAR(100),
        images JSONB DEFAULT '[]'::jsonb,
        is_vip BOOLEAN DEFAULT FALSE,
        vip_expires_at TIMESTAMP WITH TIME ZONE,
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      ALTER TABLE listings ADD COLUMN IF NOT EXISTS item_condition VARCHAR(100);

      CREATE TABLE IF NOT EXISTS vip_requests (
        id VARCHAR(100) PRIMARY KEY,
        listing_id VARCHAR(100) NOT NULL,
        listing_title VARCHAR(255) NOT NULL,
        tariff_key VARCHAR(50) NOT NULL,
        tariff_name VARCHAR(100) NOT NULL,
        days INTEGER NOT NULL,
        amount BIGINT NOT NULL,
        sender_phone VARCHAR(50),
        transaction_code VARCHAR(100),
        receipt_url TEXT,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        approved_at TIMESTAMP WITH TIME ZONE,
        rejected_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS site_analytics (
        id VARCHAR(50) PRIMARY KEY,
        total_views BIGINT DEFAULT 1,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS unique_visitors (
        visitor_id VARCHAR(100) PRIMARY KEY,
        ip VARCHAR(100),
        first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      INSERT INTO site_analytics (id, total_views) VALUES ('main', 1) ON CONFLICT (id) DO NOTHING;
    `);

    // Check if settings table has default row
    const settingsCheck = await client.query('SELECT data FROM settings WHERE id = $1', ['site_settings']);
    if (settingsCheck.rows.length === 0) {
      const currentJsonSettings = readJson(SETTINGS_FILE, defaultSettings);
      await client.query('INSERT INTO settings (id, data) VALUES ($1, $2)', ['site_settings', JSON.stringify(currentJsonSettings)]);
    }

    client.release();
  } catch (err) {
    console.error("❌ PostgreSQL ga ulanishda xatolik:", err.message);
    isPgConnected = false;
  }
}

// Convert PG row to listing object
function formatListingRow(row) {
  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    model: row.model,
    price: Number(row.price),
    currency: row.currency || 'UZS',
    region: row.region,
    district: row.district || '',
    condition: row.item_condition || row.condition || 'Yaxshi holatda',
    batteryHealth: row.battery_health || '',
    storage: row.storage || '',
    color: row.color || '',
    description: row.description || '',
    sellerName: row.seller_name || '',
    sellerPhone: row.seller_phone || '',
    sellerTelegram: row.seller_telegram || '',
    images: Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images) : []),
    isVip: Boolean(row.is_vip),
    vipExpiresAt: row.vip_expires_at ? new Date(row.vip_expires_at).toISOString() : null,
    views: Number(row.views || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
  };
}

// ================= DATABASE OPERATIONS ================= //

// 1. Check VIP Expiry (Only expires VIP status when expired, NEVER deletes the ad!)
async function checkVipExpiry() {
  const now = new Date();
  if (pool) {
    try {
      await pool.query('UPDATE listings SET is_vip = FALSE, vip_expires_at = NULL WHERE is_vip = TRUE AND vip_expires_at <= $1', [now]);
    } catch (err) {
      // Ignore
    }
  } else {
    let changed = false;
    const current = readJson(LISTINGS_FILE, []);
    current.forEach(item => {
      if (item.isVip && item.vipExpiresAt && new Date(item.vipExpiresAt) <= now) {
        item.isVip = false;
        item.vipExpiresAt = null;
        changed = true;
      }
    });
    if (changed) writeJson(LISTINGS_FILE, current);
  }
}

// 2. Get Listings (Filtered & Sorted from PostgreSQL)
async function getListings(filters = {}) {
  await checkVipExpiry();

  if (pool) {
    try {
      let query = 'SELECT * FROM listings WHERE 1=1';
      const params = [];
      let paramIdx = 1;

      if (filters.region && filters.region !== 'all') {
        query += ` AND LOWER(region) = LOWER($${paramIdx++})`;
        params.push(filters.region);
      }
      if (filters.brand && filters.brand !== 'all') {
        query += ` AND LOWER(brand) = LOWER($${paramIdx++})`;
        params.push(filters.brand);
      }
      if (filters.condition && filters.condition !== 'all') {
        query += ` AND LOWER(COALESCE(item_condition, '')) LIKE LOWER($${paramIdx++})`;
        params.push(`%${filters.condition}%`);
      }
      if (filters.vipOnly === 'true' || filters.vipOnly === '1') {
        query += ` AND is_vip = TRUE`;
      }
      if (filters.minPrice && !isNaN(filters.minPrice)) {
        query += ` AND price >= $${paramIdx++}`;
        params.push(Number(filters.minPrice));
      }
      if (filters.maxPrice && !isNaN(filters.maxPrice)) {
        query += ` AND price <= $${paramIdx++}`;
        params.push(Number(filters.maxPrice));
      }
      if (filters.search && filters.search.trim() !== '') {
        const q = `%${filters.search.trim().toLowerCase()}%`;
        query += ` AND (LOWER(title) LIKE $${paramIdx} OR LOWER(brand) LIKE $${paramIdx} OR LOWER(COALESCE(model, '')) LIKE $${paramIdx} OR LOWER(COALESCE(description, '')) LIKE $${paramIdx} OR LOWER(COALESCE(district, '')) LIKE $${paramIdx})`;
        params.push(q);
        paramIdx++;
      }

      // Sort
      if (filters.sort === 'price_asc') {
        query += ' ORDER BY is_vip DESC, price ASC';
      } else if (filters.sort === 'price_desc') {
        query += ' ORDER BY is_vip DESC, price DESC';
      } else if (filters.sort === 'views') {
        query += ' ORDER BY is_vip DESC, views DESC';
      } else {
        query += ' ORDER BY is_vip DESC, created_at DESC';
      }

      const result = await pool.query(query, params);
      const items = result.rows.map(formatListingRow);
      return { total: items.length, listings: items };
    } catch (err) {
      console.error('PG query error:', err.message);
    }
  }

  // Fallback JSON implementation
  const all = readJson(LISTINGS_FILE, []);
  return { total: all.length, listings: all };
}

// 3. Get Single Listing By ID
async function getListingById(id) {
  await checkVipExpiry();

  if (pool) {
    try {
      await pool.query('UPDATE listings SET views = views + 1 WHERE id = $1', [id]);
      const res = await pool.query('SELECT * FROM listings WHERE id = $1', [id]);
      if (res.rows.length > 0) return formatListingRow(res.rows[0]);
    } catch (err) {
      console.error('PG getListingById error:', err.message);
    }
  }

  const all = readJson(LISTINGS_FILE, []);
  const idx = all.findIndex(i => i.id === id);
  if (idx === -1) return null;
  all[idx].views = (all[idx].views || 0) + 1;
  writeJson(LISTINGS_FILE, all);
  return all[idx];
}

// 4. Create Listing (Permanently saved in Neon PostgreSQL)
async function createListing(data) {
  if (pool) {
    try {
      const query = `
        INSERT INTO listings (
          id, title, brand, model, price, currency, region, district, item_condition,
          battery_health, storage, color, description, seller_name, seller_phone,
          seller_telegram, images, is_vip, vip_expires_at, views, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *;
      `;
      const values = [
        data.id, data.title, data.brand, data.model || data.title, data.price, data.currency || 'UZS',
        data.region, data.district || '', data.condition || 'Yaxshi holatda',
        data.batteryHealth || 'Noma\'lum', data.storage || '', data.color || '',
        data.description || '', data.sellerName || 'Foydalanuvchi', data.sellerPhone,
        data.sellerTelegram || '', JSON.stringify(data.images || []), data.isVip || false,
        data.vipExpiresAt || null, data.views || 1, data.createdAt || new Date().toISOString()
      ];
      const res = await pool.query(query, values);
      return formatListingRow(res.rows[0]);
    } catch (err) {
      console.error('PG createListing error:', err.message);
    }
  }

  const all = readJson(LISTINGS_FILE, []);
  all.unshift(data);
  writeJson(LISTINGS_FILE, all);
  return data;
}

// 5. Create VIP Request
async function createVipRequest(data) {
  if (pool) {
    try {
      const query = `
        INSERT INTO vip_requests (
          id, listing_id, listing_title, tariff_key, tariff_name, days, amount,
          sender_phone, transaction_code, receipt_url, notes, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *;
      `;
      const values = [
        data.id, data.listingId, data.listingTitle, data.tariffKey, data.tariffName,
        data.days, data.amount, data.senderPhone, data.transactionCode,
        data.receiptUrl, data.notes, data.status || 'pending', data.createdAt || new Date().toISOString()
      ];
      const res = await pool.query(query, values);
      return res.rows[0];
    } catch (err) {
      console.error('PG createVipRequest error:', err.message);
    }
  }

  const all = readJson(VIP_REQUESTS_FILE, []);
  all.unshift(data);
  writeJson(VIP_REQUESTS_FILE, all);
  return data;
}

// ================= LIVE UNIQUE VISITOR & REAL ONLINE TRACKING ================= //
const activeOnlineMap = new Map();

async function trackUniqueVisitor(visitorId, ip = '') {
  if (!visitorId) return;
  const now = Date.now();
  activeOnlineMap.set(visitorId, now);

  // Clean stale visitors older than 45 seconds
  for (const [id, lastSeen] of activeOnlineMap.entries()) {
    if (now - lastSeen > 45000) {
      activeOnlineMap.delete(id);
    }
  }

  // Insert into unique_visitors (Only counts unique people/devices, F5 will NOT increment count!)
  if (pool) {
    try {
      await pool.query(`
        INSERT INTO unique_visitors (visitor_id, ip, first_seen, last_seen)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (visitor_id) DO UPDATE SET last_seen = NOW();
      `, [visitorId, ip || '']);
    } catch (err) {
      // Ignore
    }
  }
}

function removeOnlineVisitor(visitorId) {
  if (visitorId) {
    activeOnlineMap.delete(visitorId);
  }
}

function getLiveOnlineCount() {
  const now = Date.now();
  for (const [id, lastSeen] of activeOnlineMap.entries()) {
    if (now - lastSeen > 45000) {
      activeOnlineMap.delete(id);
    }
  }
  return Math.max(1, activeOnlineMap.size);
}

async function getUniqueVisitorsCount() {
  if (pool) {
    try {
      const res = await pool.query("SELECT COUNT(*) FROM unique_visitors");
      if (res.rows.length > 0) return Math.max(1, Number(res.rows[0].count));
    } catch (err) {
      // Ignore
    }
  }
  return Math.max(1, activeOnlineMap.size);
}

// 6. Get Admin Stats (with Live Online Users and Real Unique Visitors)
async function getAdminStats() {
  await checkVipExpiry();
  const onlineUsers = getLiveOnlineCount();
  const totalViews = await getUniqueVisitorsCount();

  if (pool) {
    try {
      const totalListingsRes = await pool.query('SELECT COUNT(*) FROM listings');
      const activeVipRes = await pool.query('SELECT COUNT(*) FROM listings WHERE is_vip = TRUE');
      const pendingReqRes = await pool.query('SELECT COUNT(*) FROM vip_requests WHERE status = $1', ['pending']);
      const earnedRes = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM vip_requests WHERE status = $1', ['approved']);

      return {
        onlineUsers,
        totalViews,
        totalListings: Number(totalListingsRes.rows[0].count),
        activeVipListings: Number(activeVipRes.rows[0].count),
        pendingRequests: Number(pendingReqRes.rows[0].count),
        totalEarned: Number(earnedRes.rows[0].total)
      };
    } catch (err) {
      console.error('PG stats error:', err.message);
    }
  }

  const allListings = readJson(LISTINGS_FILE, []);
  const vipRequests = readJson(VIP_REQUESTS_FILE, []);
  return {
    onlineUsers,
    totalViews,
    totalListings: allListings.length,
    activeVipListings: allListings.filter(i => i.isVip).length,
    pendingRequests: vipRequests.filter(r => r.status === 'pending').length,
    totalEarned: vipRequests.filter(r => r.status === 'approved').reduce((sum, r) => sum + (r.amount || 0), 0)
  };
}

// 7. Get All Listings (Admin)
async function getAllListingsAdmin() {
  await checkVipExpiry();
  if (pool) {
    try {
      const res = await pool.query('SELECT * FROM listings ORDER BY created_at DESC');
      return res.rows.map(formatListingRow);
    } catch (err) {
      console.error(err.message);
    }
  }
  return readJson(LISTINGS_FILE, []);
}

// 8. Set Listing VIP status
async function setListingVip(listingId, isVip, days = 7) {
  if (pool) {
    try {
      if (!isVip) {
        await pool.query('UPDATE listings SET is_vip = FALSE, vip_expires_at = NULL WHERE id = $1', [listingId]);
      } else {
        const expires = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
        await pool.query('UPDATE listings SET is_vip = TRUE, vip_expires_at = $1 WHERE id = $2', [expires, listingId]);
      }
      const res = await pool.query('SELECT * FROM listings WHERE id = $1', [listingId]);
      return formatListingRow(res.rows[0]);
    } catch (err) {
      console.error(err.message);
    }
  }

  const all = readJson(LISTINGS_FILE, []);
  const idx = all.findIndex(i => i.id === listingId);
  if (idx === -1) return null;
  if (!isVip) {
    all[idx].isVip = false;
    all[idx].vipExpiresAt = null;
  } else {
    all[idx].isVip = true;
    all[idx].vipExpiresAt = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString();
  }
  writeJson(LISTINGS_FILE, all);
  return all[idx];
}

// 9. Delete Listing
async function deleteListing(listingId) {
  if (pool) {
    try {
      await pool.query('DELETE FROM listings WHERE id = $1', [listingId]);
      return true;
    } catch (err) {
      console.error(err.message);
    }
  }
  let all = readJson(LISTINGS_FILE, []);
  all = all.filter(i => i.id !== listingId);
  writeJson(LISTINGS_FILE, all);
  return true;
}

// 10. Get VIP Requests (Admin)
async function getVipRequestsAdmin() {
  if (pool) {
    try {
      const res = await pool.query('SELECT * FROM vip_requests ORDER BY created_at DESC');
      return res.rows.map(r => ({
        id: r.id,
        listingId: r.listing_id,
        listingTitle: r.listing_title,
        tariffKey: r.tariff_key,
        tariffName: r.tariff_name,
        days: Number(r.days),
        amount: Number(r.amount),
        senderPhone: r.sender_phone,
        transactionCode: r.transaction_code,
        receiptUrl: r.receipt_url,
        notes: r.notes,
        status: r.status,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
      }));
    } catch (err) {
      console.error(err.message);
    }
  }
  return readJson(VIP_REQUESTS_FILE, []);
}

// 11. Approve VIP Request
async function approveVipRequest(requestId) {
  if (pool) {
    try {
      const reqRes = await pool.query('SELECT * FROM vip_requests WHERE id = $1', [requestId]);
      if (reqRes.rows.length === 0) return null;
      const req = reqRes.rows[0];

      const expires = new Date(Date.now() + (Number(req.days) || 1) * 24 * 60 * 60 * 1000);
      await pool.query('UPDATE vip_requests SET status = $1, approved_at = $2 WHERE id = $3', ['approved', new Date(), requestId]);
      await pool.query('UPDATE listings SET is_vip = TRUE, vip_expires_at = $1 WHERE id = $2', [expires, req.listing_id]);
      return true;
    } catch (err) {
      console.error(err.message);
    }
  }

  const requests = readJson(VIP_REQUESTS_FILE, []);
  const reqIdx = requests.findIndex(r => r.id === requestId);
  if (reqIdx === -1) return null;

  requests[reqIdx].status = 'approved';
  requests[reqIdx].approvedAt = new Date().toISOString();
  writeJson(VIP_REQUESTS_FILE, requests);

  const listings = readJson(LISTINGS_FILE, []);
  const listIdx = listings.findIndex(i => i.id === requests[reqIdx].listingId);
  if (listIdx !== -1) {
    const expires = new Date(Date.now() + (requests[reqIdx].days || 1) * 24 * 60 * 60 * 1000);
    listings[listIdx].isVip = true;
    listings[listIdx].vipExpiresAt = expires.toISOString();
    writeJson(LISTINGS_FILE, listings);
  }
  return true;
}

// 12. Reject VIP Request
async function rejectVipRequest(requestId) {
  if (pool) {
    try {
      await pool.query('UPDATE vip_requests SET status = $1, rejected_at = $2 WHERE id = $3', ['rejected', new Date(), requestId]);
      return true;
    } catch (err) {
      console.error(err.message);
    }
  }

  const requests = readJson(VIP_REQUESTS_FILE, []);
  const reqIdx = requests.findIndex(r => r.id === requestId);
  if (reqIdx === -1) return null;

  requests[reqIdx].status = 'rejected';
  requests[reqIdx].rejectedAt = new Date().toISOString();
  writeJson(VIP_REQUESTS_FILE, requests);
  return true;
}

// 13. Settings
async function getSettings() {
  if (pool) {
    try {
      const res = await pool.query('SELECT data FROM settings WHERE id = $1', ['site_settings']);
      if (res.rows.length > 0) {
        return typeof res.rows[0].data === 'string' ? JSON.parse(res.rows[0].data) : res.rows[0].data;
      }
    } catch (err) {
      console.error(err.message);
    }
  }
  return readJson(SETTINGS_FILE, defaultSettings);
}

async function saveSettings(newSettings) {
  const merged = { ...defaultSettings, ...newSettings };
  if (pool) {
    try {
      await pool.query('INSERT INTO settings (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2', ['site_settings', JSON.stringify(merged)]);
    } catch (err) {
      console.error(err.message);
    }
  }
  writeJson(SETTINGS_FILE, merged);
  return merged;
}

module.exports = {
  initDb,
  isPgConnected: () => isPgConnected,
  trackUniqueVisitor,
  removeOnlineVisitor,
  getLiveOnlineCount,
  getUniqueVisitorsCount,
  getListings,
  getListingById,
  createListing,
  createVipRequest,
  getAdminStats,
  getAllListingsAdmin,
  setListingVip,
  deleteListing,
  getVipRequestsAdmin,
  approveVipRequest,
  rejectVipRequest,
  getSettings,
  saveSettings
};
