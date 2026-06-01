window.TL_I18N = (function () {
  const dict = {
    tr: {
      login: 'Giriş Yap', join: 'Katıl', explore: 'Keşfet', blog: 'Blog', profile: 'Profilim', admin: 'Admin',
      heroPill: '🌍 Dünyanın en kişisel seyahat rehberi',
      heroTitle: 'Sadece Ziyaret Etme.', heroTitleEm: 'Hisset.',
      heroSub: 'Gizli yerel köşelerden ikonik yapılara — gerçek gezginler tarafından derlendi.',
      searchPh: 'İstanbul, Eiffel Kulesi, Tokyo, Machu Picchu...',
      searchBtn: '🔍 Keşfet',
      tabDiscover: '🗺️ Destinasyonlar', tabFilter: '⚙️ Gelişmiş Filtrele', tabTiolas: "✨ Tiola'lar", tabCategories: '📂 Kategoriler', tabTour: '🧳 Tur Planla',
      tourTitle: 'Tur planla', tourSub: 'Şehir ve gün sayısını seç — gerçekçi günlük rota ve yol süreleri.',
      tourCity: 'Nereye?', tourDays: 'Kaç gün?', tourPace: 'Tempo', tourBuild: 'Rotayı oluştur',
      tourCityPh: 'İstanbul, Paris, Tokyo...',
      tourDay1: '1 gün', tourDay2: '2 gün', tourDay3: '3 gün', tourDay4: '4 gün', tourDay5: '5 gün', tourDay7: '7 gün',
      tourPaceRelaxed: 'Rahat (günde ~3 yer)', tourPaceNormal: 'Normal (~4 yer)', tourPaceBusy: 'Yoğun (~5 yer)',
      tourEnterCity: 'Şehir adı yazın (ör. İstanbul).',
      placesFound: 'yer bulundu', noResults: '🔍 Sonuç bulunamadı. Farklı filtreler deneyin.',
      osmSearchSoon: "OSM'den ara (yakında)",
      osmHint: 'Aradığınız yer listede yok mu? OpenStreetMap entegrasyonu VPS sonrası açılacak.',
      sortTiola: 'En Yüksek Tiola Puanı', sortReviewed: 'En Çok Tiola', filterMinTiola: 'Minimum Tiola puanı',
      sortLocal: 'Önce Yerel Seçimler', sortAz: 'A → Z',
      authSub: 'Seyahatini puanla, kaydet ve paylaş', authTabLogin: 'Giriş Yap', authTabReg: 'Kayıt Ol',
      authNote: 'Misafirler okuyabilir · Tiola yazmak için üye olun',
      authSecure: '🔒 AES-256 şifreleme · KVKK & GDPR uyumlu',
      authOr: '— veya —',
      authEmail: 'E-posta', authPass: 'Şifre', authName: 'Ad Soyad', authPassMin: 'Şifre (min 8 karakter)',
      authCreate: 'Hesap Oluştur', authKvkkLabel: 'KVKK ve Kullanım Şartları kabul ediyorum',
      tiolaPending: "Tiola'n alındı. Onay sonrası yayınlanacak.",
      tiolaNeedLogin: 'Tiola yazmak için giriş yapın', writeSomething: 'Lütfen bir şeyler yazın',
      titleRequired: 'Başlık ve içerik gerekli',
      footerTag: 'Sadece ziyaret etme. Hisset.', footerCopy: '© 2026 Touristlio · Tüm hakları saklıdır',
      legalKvkk: 'KVKK', legalTerms: 'Kullanım Şartları', termsShort: 'Kullanım Şartları',
      osmAttrib: 'Harita verisi © OpenStreetMap katkıda bulunanları',
      touristlio: 'Touristlio',
      profileLoginTitle: 'Giriş Yapın', profileLoginSub: 'Seyahat günlüğünüz, Tiola ve favorileriniz',
      profileLoginBtn: 'Giriş Yap / Kayıt Ol',
      back: '← Geri Dön', sendTiola: 'Tiola Gönder', pending: 'Onay bekliyor',
      kvkkRequired: 'KVKK onayı zorunludur.',
      requestFailed: 'İstek başarısız',
      serverDown: 'Sunucuya bağlanılamadı. npm start ile sunucuyu başlatın.',
      localPick: '👤 Yerel',
      tiolaLabel: 'Tiola',
      tiolaCount: 'Tiola',
      all: 'Tümü',
      catAll: '🌐 Tümü', catLandmark: '🏛️ Tarihi Yerler', catMuseum: '🏺 Müzeler', catRestaurant: '🍽️ Restoranlar',
      catCafe: '☕ Kafeler', catBeach: '🏖️ Plajlar', catNature: '⛰️ Doğa', catPark: '🌳 Parklar',
      catViewpoint: '🔭 Manzara', catReligious: '⛪ Dini Yerler', catMarket: '🏪 Pazarlar',
      catShopping: '🛍️ Alışveriş', catNightlife: '🌙 Gece Hayatı', catAdventure: '🪂 Macera', catSpa: '🧘 Spa & Wellness',
      filterTitle: '🎛️ Gelişmiş Filtreleme', filterSub: 'Ülke, şehir, ilçe ve daha fazlasına göre filtrele',
      filterContinent: 'Kıta', filterCountry: 'Ülke', filterCity: 'Şehir', filterDistrict: 'İlçe / Bölge',
      allContinents: 'Tüm Kıtalar', allCountries: 'Tüm Ülkeler', allCities: 'Tüm Şehirler', allDistricts: 'Tüm İlçeler',
      filterEntry: 'Giriş Ücreti', entryFree: '🆓 Ücretsiz', entryPaid: '💳 Ücretli',
      filterPlaces: 'Yerler', filterLocalPicks: '👤 Yerel Seçimleri',
      filterWeather: 'Hava Durumuna Göre', weatherOutdoor: '☀️ Açık Hava', weatherIndoor: '🌧️ Kapalı Mekan',
      weatherWinter: '❄️ Kış Aktivitesi', weatherSunrise: '🌅 Gün Doğumu/Batımı', weatherNight: '🌙 Gece',
      filterAccess: 'Erişilebilirlik', accessWheel: '♿ Engelli Erişimi', accessFamily: '👨‍👩‍👧 Aile Dostu',
      accessPet: '🐶 Evcil Hayvan', accessParking: '🅿️ Otopark Var',
      filterShow: '🔍 Sonuçları Göster', filterReset: '↺ Sıfırla',
      tiolaFeedTitle: 'Gezginlerden', tiolaFeedEm: 'Tiola', tiolaFeedSub: 'Onaylı kısa deneyimler',
      tiolaEmpty: 'Henüz onaylı Tiola yok. İlk sen yaz!',
      generalTiola: 'Genel Tiola',
      catSectionEy: 'Tüm Kategoriler', catSectionTitle: 'Ne', catSectionEm: 'arıyorsun?',
      statCountries: 'Kapsanan Ülke', statPlaces: 'Listelenen Yer', statTiola: 'Topluluk Puanı',
      placesCount: 'yer', placesCountZero: '0 yer',
      blogTitle: 'Seyahat', blogTitleEm: 'Hikayeleri',
      blogSub: 'Yerel yazarlardan özenle seçilmiş gezi rehberleri, gizli köşeler ve kültürel keşifler.',
      blogCatAll: 'Tümü', blogCatGuide: '🗺️ Rehberler', blogCatHidden: '💎 Gizli Köşeler',
      blogCatFood: '🍜 Yemek', blogCatNature: '🌿 Doğa', blogCatCulture: '🎭 Kültür',
      blogEmpty: 'Henüz blog yok.',
      detailAbout: '📍 Hakkında', detailHistory: '🏛️ Tarihçe & Kültürel Önemi',
      detailTips: '💡 Ziyaretçi Tavsiyeleri', detailTags: '🏷️ Etiketler',
      detailTiolas: "✨ Tiola'lar", antiFraud: '🛡️ Sahte oy koruması',
      yourRating: 'Puanınız', category: 'Kategori', selectCat: 'Seçin...',
      starOptional: '1. Yıldız (isteğe bağlı)', tiolaPlaceholder: '2. Deneyimini yaz (Tiola)...',
      photoOptional: '3. Fotoğraf (isteğe bağlı)',
      notLoggedIn: 'Giriş yapmadınız', writeTiola: '✨ Tiola yaz',
      loginToTiola: 'Giriş yap', loginToTiolaNote: '— Tiola yazmak için üye olun',
      tiolaModeration: 'Tiola onay sonrası yayınlanır',
      noApprovedTiola: 'Henüz onaylı Tiola yok. İlk sen yaz!',
      noRating: 'Puansız',
      infoTitle: '📋 Bilgiler', infoCountry: 'Ülke', infoCity: 'Şehir', infoCategory: 'Kategori',
      infoEntry: 'Giriş', infoBest: 'En İyi Dönem', nearbyTitle: '📍 Aynı Ülkede',
      readMore: 'Devamını oku', readLess: 'Daha az göster',
      profileTabTiolas: "✨ Tiola'larım", profileTabBlogs: '📝 Bloglarım',
      profileTabPending: '⏳ Bekleyenler', profileTabSaved: '❤️ Kaydedilenler', profileTabWrite: '✏️ Tiola / Blog Yaz',
      profileMyTiolas: 'Tiola', profileMyTiolasEm: 'larım',
      profileMyTiolasSub: "Yazdığın onaylı ve bekleyen Tiola'lar",
      profileStatReviews: 'Yorum', profileStatSaved: 'Kaydedilen', profileStatCountries: 'Ülke',
      profileMember: 'Üye',
      emptyTiola: 'Henüz seyahat günlüğü yok.<br>Bir yere yorum yazdığında burada görünür.',
      emptyBlog: 'Henüz blog yazmadınız.', emptyPending: 'Onay bekleyen içerik yok.',
      emptySaved: 'Henüz yer kaydetmediniz.<br>Kartlardaki 🤍 ikonuna tıklayın.',
      writeNew: 'Yeni Tiola veya Blog', writeTiolaTab: '✨ Tiola', writeBlogTab: '📝 Blog',
      placeOptional: 'Mekân (isteğe bağlı)', cityTagPh: 'Şehir etiketi (genel Tiola için, isteğe bağlı)',
      memberRating: 'Puanınız (Üyeler)', memberCategory: 'Kategori (Üyeler)',
      shareExperience: 'Deneyiminizi paylaşın...', oneRatingPer: '🛡️ Kişi başı bir puan',
      blogTitlePh: 'Blog başlığı', blogBodyPh: 'Uzun rehber yazınız...', submitBlog: 'Blog Gönder',
      blogCatGuideOpt: 'Rehber', blogCatHiddenOpt: 'Gizli Köşe', blogCatFoodOpt: 'Yemek',
      blogCatNatureOpt: 'Doğa', blogCatCultureOpt: 'Kültür',
      statusPending: 'Onay bekliyor', statusApproved: 'Yayında', statusRejected: 'Reddedildi',
      menuAria: 'Menü',
    },
    en: {
      login: 'Log in', join: 'Join', explore: 'Explore', blog: 'Blog', profile: 'My profile', admin: 'Admin',
      heroPill: "🌍 The world's most personal travel guide",
      heroTitle: "Don't just visit.", heroTitleEm: 'Feel it.',
      heroSub: 'From hidden local gems to iconic landmarks — curated by real travelers.',
      searchPh: 'Istanbul, Eiffel Tower, Tokyo, Machu Picchu...',
      searchBtn: '🔍 Explore',
      tabDiscover: '🗺️ Destinations', tabFilter: '⚙️ Advanced filters', tabTiolas: '✨ Tiolas', tabCategories: '📂 Categories', tabTour: '🧳 Plan a trip',
      tourTitle: 'Plan your trip', tourSub: 'Pick city and days — realistic daily routes with travel times.',
      tourCity: 'Where to?', tourDays: 'How many days?', tourPace: 'Pace', tourBuild: 'Build itinerary',
      tourCityPh: 'Istanbul, Paris, Tokyo...',
      tourDay1: '1 day', tourDay2: '2 days', tourDay3: '3 days', tourDay4: '4 days', tourDay5: '5 days', tourDay7: '7 days',
      tourPaceRelaxed: 'Relaxed (~3 stops/day)', tourPaceNormal: 'Normal (~4 stops)', tourPaceBusy: 'Busy (~5 stops)',
      tourEnterCity: 'Enter a city name.',
      placesFound: 'places found', noResults: '🔍 No results. Try different filters.',
      osmSearchSoon: 'Search OSM (coming soon)',
      osmHint: 'Place not in our list? OpenStreetMap search opens after VPS deployment.',
      sortTiola: 'Highest Tiola rating', sortReviewed: 'Most Tiolas', filterMinTiola: 'Minimum Tiola rating',
      sortLocal: 'Local picks first', sortAz: 'A → Z',
      authSub: 'Rate, save and share your trips', authTabLogin: 'Log in', authTabReg: 'Sign up',
      authNote: 'Guests can browse · Sign up to write a Tiola',
      authSecure: '🔒 AES-256 encryption · GDPR compliant',
      authOr: '— or —',
      authEmail: 'Email', authPass: 'Password', authName: 'Full name', authPassMin: 'Password (min 8 characters)',
      authCreate: 'Create account', authKvkkLabel: 'I accept the Privacy Policy and Terms of Use',
      tiolaPending: 'Your Tiola was received. It will be published after review.',
      tiolaNeedLogin: 'Log in to write a Tiola', writeSomething: 'Please write something',
      titleRequired: 'Title and body are required',
      footerTag: "Don't just visit. Feel it.", footerCopy: '© 2026 Touristlio · All rights reserved',
      legalKvkk: 'Privacy (KVKK)', legalTerms: 'Terms of use', termsShort: 'Terms of Use',
      osmAttrib: 'Map data © OpenStreetMap contributors',
      touristlio: 'Touristlio',
      profileLoginTitle: 'Log in', profileLoginSub: 'Your travel log, Tiolas and saved places',
      profileLoginBtn: 'Log in / Sign up',
      back: '← Go back', sendTiola: 'Submit Tiola', pending: 'Pending review',
      kvkkRequired: 'Privacy consent is required.',
      requestFailed: 'Request failed',
      serverDown: 'Could not reach server. Start it with npm start.',
      localPick: '👤 Local pick',
      tiolaLabel: 'Tiola',
      tiolaCount: 'Tiolas',
      all: 'All',
      catAll: '🌐 All', catLandmark: '🏛️ Historic sites', catMuseum: '🏺 Museums', catRestaurant: '🍽️ Restaurants',
      catCafe: '☕ Cafés', catBeach: '🏖️ Beaches', catNature: '⛰️ Nature', catPark: '🌳 Parks',
      catViewpoint: '🔭 Viewpoints', catReligious: '⛪ Religious sites', catMarket: '🏪 Markets',
      catShopping: '🛍️ Shopping', catNightlife: '🌙 Nightlife', catAdventure: '🪂 Adventure', catSpa: '🧘 Spa & wellness',
      filterTitle: '🎛️ Advanced filters', filterSub: 'Filter by country, city, district and more',
      filterContinent: 'Continent', filterCountry: 'Country', filterCity: 'City', filterDistrict: 'District / area',
      allContinents: 'All continents', allCountries: 'All countries', allCities: 'All cities', allDistricts: 'All districts',
      filterEntry: 'Entry fee', entryFree: '🆓 Free', entryPaid: '💳 Paid',
      filterPlaces: 'Places', filterLocalPicks: '👤 Local picks',
      filterWeather: 'By weather', weatherOutdoor: '☀️ Outdoors', weatherIndoor: '🌧️ Indoors',
      weatherWinter: '❄️ Winter activity', weatherSunrise: '🌅 Sunrise/sunset', weatherNight: '🌙 Night',
      filterAccess: 'Accessibility', accessWheel: '♿ Wheelchair access', accessFamily: '👨‍👩‍👧 Family friendly',
      accessPet: '🐶 Pet friendly', accessParking: '🅿️ Parking',
      filterShow: '🔍 Show results', filterReset: '↺ Reset',
      tiolaFeedTitle: 'From travelers', tiolaFeedEm: 'Tiolas', tiolaFeedSub: 'Approved short experiences',
      tiolaEmpty: 'No approved Tiolas yet. Be the first!',
      generalTiola: 'General Tiola',
      catSectionEy: 'All categories', catSectionTitle: 'What are you', catSectionEm: 'looking for?',
      statCountries: 'Countries covered', statPlaces: 'Places listed', statTiola: 'Community rating',
      placesCount: 'places', placesCountZero: '0 places',
      blogTitle: 'Travel', blogTitleEm: 'Stories',
      blogSub: 'Curated guides, hidden gems and cultural discoveries from local writers.',
      blogCatAll: 'All', blogCatGuide: '🗺️ Guides', blogCatHidden: '💎 Hidden gems',
      blogCatFood: '🍜 Food', blogCatNature: '🌿 Nature', blogCatCulture: '🎭 Culture',
      blogEmpty: 'No blog posts yet.',
      detailAbout: '📍 About', detailHistory: '🏛️ History & cultural significance',
      detailTips: '💡 Visitor tips', detailTags: '🏷️ Tags',
      detailTiolas: '✨ Tiolas', antiFraud: '🛡️ Anti-fraud protection',
      yourRating: 'Your rating', category: 'Category', selectCat: 'Select...',
      starOptional: '1. Stars (optional)', tiolaPlaceholder: '2. Write your experience (Tiola)...',
      photoOptional: '3. Photo (optional)',
      notLoggedIn: 'Not logged in', writeTiola: '✨ Write a Tiola',
      loginToTiola: 'Log in', loginToTiolaNote: '— sign up to write a Tiola',
      tiolaModeration: 'Tiolas are published after review',
      noApprovedTiola: 'No approved Tiolas yet. Be the first!',
      noRating: 'No rating',
      infoTitle: '📋 Details', infoCountry: 'Country', infoCity: 'City', infoCategory: 'Category',
      infoEntry: 'Entry', infoBest: 'Best time', nearbyTitle: '📍 Same country',
      readMore: 'Read more', readLess: 'Show less',
      profileTabTiolas: '✨ My Tiolas', profileTabBlogs: '📝 My blogs',
      profileTabPending: '⏳ Pending', profileTabSaved: '❤️ Saved', profileTabWrite: '✏️ Write Tiola / blog',
      profileMyTiolas: 'My', profileMyTiolasEm: 'Tiolas',
      profileMyTiolasSub: 'Your approved and pending Tiolas',
      profileStatReviews: 'Reviews', profileStatSaved: 'Saved', profileStatCountries: 'Countries',
      profileMember: 'Member',
      emptyTiola: 'No travel log yet.<br>Your reviews will appear here.',
      emptyBlog: 'You have not written a blog yet.', emptyPending: 'Nothing pending review.',
      emptySaved: 'No saved places yet.<br>Tap 🤍 on place cards.',
      writeNew: 'New Tiola or blog', writeTiolaTab: '✨ Tiola', writeBlogTab: '📝 Blog',
      placeOptional: 'Place (optional)', cityTagPh: 'City tag (for general Tiola, optional)',
      memberRating: 'Your rating (members)', memberCategory: 'Category (members)',
      shareExperience: 'Share your experience...', oneRatingPer: '🛡️ One rating per person',
      blogTitlePh: 'Blog title', blogBodyPh: 'Write your long-form guide...', submitBlog: 'Submit blog',
      blogCatGuideOpt: 'Guide', blogCatHiddenOpt: 'Hidden gem', blogCatFoodOpt: 'Food',
      blogCatNatureOpt: 'Nature', blogCatCultureOpt: 'Culture',
      statusPending: 'Pending review', statusApproved: 'Published', statusRejected: 'Rejected',
      menuAria: 'Menu',
    },
  };

  const CAT_KEYS = {
    all: 'catAll', landmark: 'catLandmark', museum: 'catMuseum', restaurant: 'catRestaurant',
    cafe: 'catCafe', beach: 'catBeach', nature: 'catNature', park: 'catPark',
    viewpoint: 'catViewpoint', religious: 'catReligious', market: 'catMarket',
    shopping: 'catShopping', nightlife: 'catNightlife', adventure: 'catAdventure', spa: 'catSpa',
  };

  function t(lang, key) {
    return dict[lang]?.[key] ?? dict.tr[key] ?? key;
  }

  function catLabel(lang, cat) {
    return t(lang, CAT_KEYS[cat] || 'catAll');
  }

  function apply(lang) {
    document.documentElement.lang = lang;
    document.title = lang === 'en'
      ? 'Touristlio — Don\'t Just Visit. Feel It.'
      : 'Touristlio — Sadece Ziyaret Etme. Hisset.';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = t(lang, key);
      if (val) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = t(lang, key);
      if (val) el.placeholder = val;
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      if (key === 'heroTitle') {
        el.innerHTML = `${t(lang, 'heroTitle')}<br><em>${t(lang, 'heroTitleEm')}</em>`;
      } else if (key === 'blogHeroTitle') {
        el.innerHTML = `${t(lang, 'blogTitle')} <em>${t(lang, 'blogTitleEm')}</em>`;
      } else if (key === 'tiolaFeedTitle') {
        el.innerHTML = `${t(lang, 'tiolaFeedTitle')} <em style="font-style:italic;color:var(--b)">${t(lang, 'tiolaFeedEm')}</em>`;
      } else if (key === 'catSectionTitle') {
        el.innerHTML = `${t(lang, 'catSectionTitle')} <em>${t(lang, 'catSectionEm')}</em>`;
      } else if (key === 'profileMyTiolas') {
        el.innerHTML = `${t(lang, 'profileMyTiolas')} <em style="font-style:italic;color:var(--b)">${t(lang, 'profileMyTiolasEm')}</em>`;
      } else if (key === 'tourTitle') {
        el.innerHTML = `${t(lang, 'tourTitle').replace('planla', '').replace('trip', '').trim()} <em>${lang === 'en' ? 'trip' : 'planla'}</em>`;
      } else {
        const val = t(lang, key);
        if (val) el.innerHTML = val;
      }
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(lang, el.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('select.sort-sel option').forEach((opt) => {
      const map = { tiola: 'sortTiola', reviewed: 'sortReviewed', local: 'sortLocal', az: 'sortAz' };
      const k = map[opt.value];
      if (k) opt.textContent = t(lang, k);
    });
    document.querySelectorAll('#tourDays option').forEach((opt) => {
      const map = { 1: 'tourDay1', 2: 'tourDay2', 3: 'tourDay3', 4: 'tourDay4', 5: 'tourDay5', 7: 'tourDay7' };
      const k = map[opt.value];
      if (k) opt.textContent = t(lang, k);
    });
    document.querySelectorAll('#tourPace option').forEach((opt) => {
      const map = { relaxed: 'tourPaceRelaxed', normal: 'tourPaceNormal', busy: 'tourPaceBusy' };
      const k = map[opt.value];
      if (k) opt.textContent = t(lang, k);
    });
    document.querySelectorAll('.cpill[data-cat]').forEach((el) => {
      el.textContent = catLabel(lang, el.getAttribute('data-cat'));
    });
    document.querySelectorAll('.ccard[data-cat] .cname').forEach((el) => {
      const card = el.closest('.ccard');
      if (card) el.textContent = catLabel(lang, card.getAttribute('data-cat')).replace(/^[^\s]+\s/, '');
    });
  }

  return { dict, t, catLabel, CAT_KEYS, apply };
})();
