/** Tur planlayıcı — şehir + gün → gerçekçi günlük rota */
window.TL_TOUR = (function () {
  const VISIT_MIN = {
    landmark: 90, museum: 120, religious: 60, nature: 150, beach: 120,
    viewpoint: 75, park: 90, market: 70, adventure: 180, restaurant: 75,
    cafe: 45, spa: 120, shopping: 90, nightlife: 120, default: 75,
  };

  const DAY = { start: 9 * 60, end: 21 * 60, lunch: 13 * 60, lunchEnd: 14 * 60 };

  const PACE = { relaxed: 0.75, normal: 1, busy: 1.25 };

  /** dakika → "09:30" */
  function fmt(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** İlçe/bölge bazlı yol süresi (dakika) — kabaca gerçekçi */
  function travelMin(a, b) {
    if (!a || !b || a === b) return 12;
    const key = [a, b].sort().join('|');
    const known = {
      'Sultanahmet|Beyoglu': 25, 'Sultanahmet|Karakoy': 20, 'Sultanahmet|Besiktas': 35,
      'Beyoglu|Karakoy': 15, 'Beyoglu|Kadikoy': 40, 'Karakoy|Besiktas': 18,
      'Centro Storico|Vatican': 25, 'Centro Storico|Trastevere': 20,
      'Marais|Montmartre': 30, 'Marais|Louvre': 15,
      'Shibuya|Shinjuku': 18, 'Shibuya|Asakusa': 35,
      'Manhattan|Brooklyn': 35,
    };
    if (known[key]) return known[key];
    return 22;
  }

  function normCity(s) {
    return String(s || '').toLowerCase()
      .replace(/istanbul|İstanbul|constantinople/gi, 'istanbul')
      .replace(/paris/gi, 'paris')
      .replace(/tokyo/gi, 'tokyo')
      .replace(/roma|rome/gi, 'rome')
      .replace(/london/gi, 'london')
      .trim();
  }

  function cityPlaces(all, cityQuery) {
    const q = normCity(cityQuery);
    return all.filter((p) => {
      const ci = normCity(p.city);
      const aliases = (p.searchAliases || []).map(normCity);
      return ci.includes(q) || q.includes(ci) || aliases.some((a) => a.includes(q) || q.includes(a));
    });
  }

  function scorePlace(p) {
    let s = (p.tiolaRating || 0) * 10 + (p.tiolaCount || 0);
    if (p.category === 'landmark') s += 15;
    if (p.category === 'museum') s += 8;
    return s;
  }

  function pickDaily(pool, used, maxStops, pace) {
    const sorted = [...pool].sort((a, b) => scorePlace(b) - scorePlace(a));
    const day = [];
    let cursor = DAY.start;
    let lastDistrict = null;

    for (const p of sorted) {
      if (day.length >= maxStops) break;
      if (used.has(p.id)) continue;

      const visit = Math.round((VISIT_MIN[p.category] || VISIT_MIN.default) * PACE[pace]);
      const trip = lastDistrict ? travelMin(lastDistrict, p.district || p.city) : 0;

      if (cursor + trip + visit > DAY.end) continue;
      if (cursor + trip >= DAY.lunch && cursor < DAY.lunchEnd) {
        cursor = DAY.lunchEnd;
      }
      if (cursor + trip + visit > DAY.end) continue;

      cursor += trip;
      const start = cursor;
      cursor += visit;
      if (cursor > DAY.lunch && start < DAY.lunch) {
        cursor = Math.max(cursor, DAY.lunchEnd);
      }

      day.push({
        place: p,
        travelMin: trip,
        visitMin: visit,
        startMin: start,
        endMin: cursor,
        start: fmt(start),
        end: fmt(cursor),
      });
      used.add(p.id);
      lastDistrict = p.district || p.city;
    }
    return day;
  }

  function generate(allPlaces, opts) {
    const { city, days, pace = 'normal', lang = 'tr' } = opts;
    const nDays = Math.min(14, Math.max(1, Number(days) || 3));
    const pool = cityPlaces(allPlaces, city);
    if (!pool.length) {
      return { ok: false, message: lang === 'en' ? 'No places found for this city.' : 'Bu şehir için yer bulunamadı. Farklı yazım deneyin (ör. Istanbul).' };
    }

    const maxStops = pace === 'relaxed' ? 3 : pace === 'busy' ? 5 : 4;
    const used = new Set();
    const itinerary = [];

    for (let d = 1; d <= nDays; d += 1) {
      const stops = pickDaily(pool, used, maxStops, pace);
      if (!stops.length && d === 1) {
        return { ok: false, message: lang === 'en' ? 'Could not build a plan.' : 'Plan oluşturulamadı.' };
      }
      if (!stops.length) break;
      itinerary.push({ day: d, stops });
    }

    const cityLabel = pool[0]?.city || city;
    return {
      ok: true,
      city: cityLabel,
      days: itinerary.length,
      pace,
      itinerary,
      note: lang === 'en'
        ? 'Times are estimates (walking + public transport). Adjust for tickets and queues.'
        : 'Saatler tahminidir (yürüyüş + toplu taşıma). Bilet ve kuyruk sürelerini ekleyin.',
    };
  }

  function renderPlan(container, plan) {
    if (!plan.ok) {
      container.innerHTML = `<div class="tour-empty">${plan.message}</div>`;
      return;
    }
    let html = `<div class="tour-summary"><strong>${plan.city}</strong> · ${plan.days} gün · ${plan.pace === 'relaxed' ? 'Rahat' : plan.pace === 'busy' ? 'Yoğun' : 'Normal'} tempo</div>`;
    html += `<p class="tour-note">${plan.note}</p>`;
    plan.itinerary.forEach((day) => {
      html += `<div class="tour-day"><div class="tour-day-h">Gün ${day.day}</div><div class="tour-stops">`;
      day.stops.forEach((s, i) => {
        const p = s.place;
        html += `<div class="tour-stop" onclick="openDetail(${p.id})">
          <div class="tour-time">${s.start} – ${s.end}</div>
          <div class="tour-stop-body">
            <div class="tour-stop-name">${p.name}</div>
            <div class="tour-stop-meta">${s.travelMin ? `🚶 ~${s.travelMin} dk yol · ` : ''}⏱ ~${s.visitMin} dk · ${catLabel(p.category)}</div>
          </div></div>`;
      });
      html += '</div></div>';
    });
    container.innerHTML = html;
  }

  function catLabel(c) {
    const m = {
      landmark: 'Tarihi', museum: 'Müze', restaurant: 'Restoran', cafe: 'Kafe',
      beach: 'Plaj', nature: 'Doğa', park: 'Park', viewpoint: 'Manzara',
      religious: 'Dini', market: 'Pazar', adventure: 'Macera', spa: 'Spa',
      shopping: 'Alışveriş', nightlife: 'Gece',
    };
    return m[c] || c;
  }

  return { generate, renderPlan, cityPlaces };
})();
