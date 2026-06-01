require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { createUser, findUserByEmail } = require('./auth');

const placesPath = path.join(__dirname, 'data', 'places.json');
const blogsSeed = [
  { id: 1, category: 'guide', imageUrl: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=700&q=80', catLabel: 'Yerel Rehber', title: 'Şafakta İstanbul: Kalabalık Gelmeden Önce', excerpt: "Çoğu turistin hiç görmediği bir İstanbul var — sabah 5 ile 8 arasında, Boğaz'ın üzerinden ezan sesinin yankılandığı o sessiz saatler.", author: 'Ayşe Kaya', placeId: 1, featured: true },
  { id: 2, category: 'hidden', imageUrl: 'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=500&q=80', catLabel: 'Gizli Köşe', title: 'Kyoto Sabah 6: Torii Kapıları Tamamen Senin', excerpt: "Tur grupları gelmeden Fushimi Inari'de yalnız yürümek bambaşka bir his.", author: 'Kenji Mori', placeId: 11, featured: false },
  { id: 3, category: 'nature', imageUrl: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=500&q=80', catLabel: 'Doğa & Manzara', title: 'Santorini: Kartpostalın Ötesinde', excerpt: "Oia'nın bilinen gün batımının ötesinde, yerel halkın sakladığı manzara noktaları.", author: 'Sofia K.', placeId: 18, featured: false },
  { id: 4, category: 'culture', imageUrl: 'https://images.unsplash.com/photo-1513735492246-483525079686?w=500&q=80', catLabel: 'Kültür', title: "Alfama'da Bir Akşam: Fado ve Fayanslar", excerpt: "Lizbon'un en eski mahallesinde akşam yürüyüşü ve Fado sesiyle dolanan sokaklar.", author: 'Maria Lopez', placeId: 25, featured: false },
  { id: 5, category: 'food', imageUrl: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=500&q=80', catLabel: 'Yemek & İçki', title: "Tokyo'da Ramen: Şeflerin Sırrı", excerpt: "Tokyo'nun en iyi 5 ramen dükkanı ve sipariş vermeden önce bilmeniz gerekenler.", author: 'Yuki Tanaka', placeId: 12, featured: false },
  { id: 6, category: 'guide', imageUrl: 'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=500&q=80', catLabel: 'Seyahat Rehberi', title: "Machu Picchu'ya Hazırlanmak", excerpt: 'Yükseklik hastalığından nasıl kaçınırsınız ve en az kalabalık hangi rota.', author: 'Roberto Lopez', placeId: 29, featured: false },
];

function seedPlaces() {
  if (!fs.existsSync(placesPath)) {
    console.error('places.json missing — run: node server/extract-places.js');
    process.exit(1);
  }
  const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'));
  const insert = db.prepare(`
    INSERT OR REPLACE INTO places
    (id, name, location, country, city, district, category, google_rating, google_count,
     image_url, is_local, entry_fee, entry_fee_en, best_time, best_time_en,
     description, description_en, history, history_en, tips, tips_en, tags, search_aliases)
    VALUES (@id, @name, @location, @country, @city, @district, @category, NULL, NULL,
            @imageUrl, @isLocal, @entryFee, @entryFeeEn, @bestTime, @bestTimeEn,
            @description, @descriptionEn, @history, @historyEn, @tips, @tipsEn, @tags, @searchAliases)
  `);
  const tx = db.transaction((rows) => {
    for (const p of rows) {
      insert.run({
        ...p,
        isLocal: p.isLocal ? 1 : 0,
        entryFeeEn: p.entryFeeEn || null,
        bestTimeEn: p.bestTimeEn || null,
        descriptionEn: p.descriptionEn || null,
        historyEn: p.historyEn || null,
        tipsEn: p.tipsEn || null,
        tags: JSON.stringify(p.tags),
        searchAliases: JSON.stringify(p.searchAliases || []),
      });
    }
  });
  tx(places);
  console.log('Seeded', places.length, 'places');
}

function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'yasin@touristlio.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.ADMIN_NAME || 'Yasin';
  if (findUserByEmail(email)) {
    console.log('Admin already exists:', email);
    return;
  }
  createUser({ name, email, password, role: 'admin' });
  console.log('Admin created:', email, '(password from .env or default ChangeMe123!)');
}

function seedDemoBlogs() {
  const admin = findUserByEmail((process.env.ADMIN_EMAIL || 'yasin@touristlio.local').toLowerCase());
  const userId = admin?.id || 1;
  const count = db.prepare('SELECT COUNT(*) AS c FROM blogs').get().c;
  if (count > 0) return;
  const insert = db.prepare(`
    INSERT INTO blogs (user_id, category, title, excerpt, body, image_url, place_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
  `);
  for (const b of blogsSeed) {
    insert.run(userId, b.category, b.title, b.excerpt, b.excerpt, b.imageUrl, b.placeId);
  }
  console.log('Seeded', blogsSeed.length, 'demo blogs');
}

seedPlaces();
seedAdmin();
seedDemoBlogs();
console.log('Seed complete.');
