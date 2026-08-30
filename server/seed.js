require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { createUser, findUserByEmail, hashPassword } = require('./auth');
const { enrichContentFields } = require('./lib/place-content');
const { slugify } = require('./lib/catalog-db');
const { uniquePlaceSlug, slugFromPlace } = require('./lib/place-lookup');

const placesPath = path.join(__dirname, 'data', 'places.json');
const blogsSeed = [
  { id: 1, category: 'guide', imageUrl: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=700&q=80', catLabel: 'Yerel Rehber', title: 'Şafakta İstanbul: Kalabalık Gelmeden Önce', excerpt: "Çoğu turistin hiç görmediği bir İstanbul var — sabah 5 ile 8 arasında, Boğaz'ın üzerinden ezan sesinin yankılandığı o sessiz saatler.", author: 'Ayşe Kaya', placeId: 1, featured: true },
  { id: 2, category: 'hidden', imageUrl: 'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=500&q=80', catLabel: 'Gizli Köşe', title: 'Kyoto Sabah 6: Torii Kapıları Tamamen Senin', excerpt: "Tur grupları gelmeden Fushimi Inari'de yalnız yürümek bambaşka bir his.", author: 'Kenji Mori', placeId: 11, featured: false },
  { id: 3, category: 'nature', imageUrl: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=500&q=80', catLabel: 'Doğa & Manzara', title: 'Santorini: Kartpostalın Ötesinde', excerpt: "Oia'nın bilinen gün batımının ötesinde, yerel halkın sakladığı manzara noktaları.", author: 'Sofia K.', placeId: 18, featured: false },
  { id: 4, category: 'culture', imageUrl: 'https://images.unsplash.com/photo-1513735492246-483525079686?w=500&q=80', catLabel: 'Kültür', title: "Alfama'da Bir Akşam: Fado ve Fayanslar", excerpt: "Lizbon'un en eski mahallesinde akşam yürüyüşü ve Fado sesiyle dolanan sokaklar.", author: 'Maria Lopez', placeId: 25, featured: false },
  { id: 5, category: 'food', imageUrl: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=500&q=80', catLabel: 'Yemek & İçki', title: "Tokyo'da Ramen: Şeflerin Sırrı", excerpt: "Tokyo'nun en iyi 5 ramen dükkanı ve sipariş vermeden önce bilmeniz gerekenler.", author: 'Yuki Tanaka', placeId: 12, featured: false },
  { id: 6, category: 'guide', imageUrl: 'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=500&q=80', catLabel: 'Seyahat Rehberi', title: "Machu Picchu'ya Hazırlanmak", excerpt: 'Yükseklik hastalığından nasıl kaçınırsınız ve en az kalabalık hangi rota.', author: 'Roberto Lopez', placeId: 29, featured: false },
];

function seedPlaces(options = {}) {
  const { fatal = true } = options;
  if (!fs.existsSync(placesPath)) {
    const msg = 'places.json missing — run: npm run places:merge';
    if (fatal) {
      console.error(msg);
      process.exit(1);
    }
    throw new Error(msg);
  }
  const raw = JSON.parse(fs.readFileSync(placesPath, 'utf8'));
  const places = raw.map((p) => enrichContentFields(p, p.id));

  const insert = db.prepare(`
    INSERT OR REPLACE INTO places
    (id, name, slug, location, country, city, district, category,
     image_url, is_local, entry_fee, entry_fee_en, best_time, best_time_en,
     description, description_en, overview, overview_en,
     history, history_en, things_to_do, things_to_do_en,
     culture_food, culture_food_en, travel_tips, travel_tips_en,
     how_to_get_there, how_to_get_there_en, photos,
     tips, tips_en, tags, search_aliases, categories, lat, lng, popularity,
     faq_tr, faq_en)
    VALUES (@id, @name, @slug, @location, @country, @city, @district, @category,
            @imageUrl, @isLocal, @entryFee, @entryFeeEn, @bestTime, @bestTimeEn,
            @description, @descriptionEn, @overview, @overviewEn,
            @history, @historyEn, @thingsToDo, @thingsToDoEn,
            @cultureFood, @cultureFoodEn, @travelTips, @travelTipsEn,
            @howToGetThere, @howToGetThereEn, @photos,
            @tips, @tipsEn, @tags, @searchAliases, @categories, @lat, @lng, @popularity,
            @faqTR, @faqEN)
  `);

  const usedSlugs = new Set();
  const tx = db.transaction((rows) => {
    for (const p of rows) {
      const popularity = (p.tiolaCount || 0) * 2;
      let slug = uniquePlaceSlug(db, p.slug || slugFromPlace(p), p.id);
      let n = 2;
      const root = slug;
      while (usedSlugs.has(slug)) {
        slug = `${root}-${n}`;
        n += 1;
      }
      usedSlugs.add(slug);
      insert.run({
        ...p,
        slug,
        isLocal: p.isLocal ? 1 : 0,
        entryFeeEn: p.entryFeeEn || null,
        bestTimeEn: p.bestTimeEn || null,
        descriptionEn: p.descriptionEn || null,
        overview: p.overview || p.description,
        overviewEn: p.overviewEn || p.descriptionEn,
        historyEn: p.historyEn || null,
        thingsToDo: JSON.stringify(p.thingsToDo || []),
        thingsToDoEn: JSON.stringify(p.thingsToDoEn || []),
        cultureFood: p.cultureFood || null,
        cultureFoodEn: p.cultureFoodEn || null,
        travelTips: p.travelTips || p.tips,
        travelTipsEn: p.travelTipsEn || p.tipsEn,
        howToGetThere: p.howToGetThere || null,
        howToGetThereEn: p.howToGetThereEn || null,
        photos: JSON.stringify(p.photos || (p.imageUrl ? [p.imageUrl] : [])),
        tipsEn: p.tipsEn || null,
        tags: JSON.stringify(p.tags || []),
        searchAliases: JSON.stringify(p.searchAliases || []),
        categories: JSON.stringify(p.categories || [p.category]),
        popularity,
        faqTR: JSON.stringify(p.faqTR || []),
        faqEN: JSON.stringify(p.faqEN || []),
      });
    }
  });
  tx(places);
  console.log('Seeded', places.length, 'places');
}

function markEmailVerified(userId) {
  db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?').run(userId);
}

function clearLockout(userId) {
  db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?').run(userId);
}

function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'yasin@touristlio.local').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.ADMIN_NAME || 'Yasin';
  const existing = findUserByEmail(email);
  if (existing) {
    const hash = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, name = ?, role = ? WHERE id = ?').run(
      hash, name.trim(), 'admin', existing.id,
    );
    markEmailVerified(existing.id);
    clearLockout(existing.id);
    console.log('Admin updated from .env:', email);
    return;
  }
  const user = createUser({ name, email, password, role: 'admin' });
  markEmailVerified(user.id);
  console.log('Admin created:', email, '(password from .env or default ChangeMe123!)');
}

function syncLegacyAdminPassword(password) {
  const legacyEmail = 'yasin@touristlio.local';
  const envEmail = (process.env.ADMIN_EMAIL || legacyEmail).toLowerCase().trim();
  if (envEmail === legacyEmail) return;
  const legacy = findUserByEmail(legacyEmail);
  if (!legacy || legacy.role !== 'admin') return;
  const hash = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, legacy.id);
  markEmailVerified(legacy.id);
  clearLockout(legacy.id);
  console.log('Legacy admin password synced:', legacyEmail);
}

function seedDemoBlogs() {
  const admin = findUserByEmail((process.env.ADMIN_EMAIL || 'yasin@touristlio.local').toLowerCase());
  const userId = admin?.id || 1;
  const count = db.prepare('SELECT COUNT(*) AS c FROM blogs').get().c;
  if (count > 0) return;
  const insert = db.prepare(`
    INSERT INTO blogs (
      user_id, category, title, slug, excerpt, body, image_url, place_id,
      tags, featured, author_name, status, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', datetime('now'))
  `);
  for (const b of blogsSeed) {
    insert.run(
      userId,
      b.category,
      b.title,
      slugify(b.title) || `blog-${b.id}`,
      b.excerpt,
      b.excerpt,
      b.imageUrl,
      b.placeId,
      JSON.stringify([b.catLabel].filter(Boolean)),
      b.featured ? 1 : 0,
      b.author || null,
    );
  }
  console.log('Seeded', blogsSeed.length, 'demo blogs');
}

function runFullSeed(options = {}) {
  seedPlaces(options);
  seedAdmin();
  syncLegacyAdminPassword(process.env.ADMIN_PASSWORD || 'ChangeMe123!');
  seedDemoBlogs();
}

module.exports = {
  seedPlaces,
  seedAdmin,
  syncLegacyAdminPassword,
  seedDemoBlogs,
  runFullSeed,
};

if (require.main === module) {
  runFullSeed({ fatal: true });
  console.log('Seed complete.');
}
