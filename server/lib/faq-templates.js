/** Generate min 5 FAQ Q&A pairs per place (TR + EN) */
function buildFaqForPlace(p) {
  const name = p.name;
  const city = p.city || '';
  const country = p.country || '';
  const entry = p.entryFee || 'Ücretli';
  const best = p.bestTime || 'Sabah erken';
  const entryEn = p.entryFeeEn || (entry.includes('Ücretsiz') ? 'Free' : 'Paid entry');

  const faqTR = [
    { q: `${name} ziyareti ne kadar sürer?`, a: `Çoğu ziyaretçi ${name} için 1,5–3 saat ayırır. ${city} programınıza göre yarım gün de planlayabilirsiniz.` },
    { q: `${name} giriş ücreti var mı?`, a: `Güncel durum: ${entry}. Resmi site veya gişeden teyit etmenizi öneririz.` },
    { q: `${name} için en iyi ziyaret zamanı ne?`, a: `${best} genelde daha sakin ve fotoğraf için uygundur. Hafta içi sabah saatleri kalabalığı azaltır.` },
    { q: `${name}'e nasıl ulaşılır?`, a: p.howToGetThere || `${city} merkezinden toplu taşıma veya taksi ile ulaşılabilir.` },
    { q: `${name} çocuklarla uygun mu?`, a: `${country} / ${city} genelinde aile ziyaretleri yaygındır; uzun kuyruklar ve yürüyüş mesafesini göz önünde bulundurun.` },
    { q: `${name} yakınında ne yenir?`, a: p.cultureFood || `${city} çevresinde yerel kafe ve restoranlar yürüme mesafesindedir.` },
  ];

  const faqEN = [
    { q: `How long should I spend at ${name}?`, a: `Most visitors allow 1.5–3 hours at ${name}. A half-day works well if you are exploring ${city} at a relaxed pace.` },
    { q: `Is there an entry fee for ${name}?`, a: `Current info: ${entryEn}. Confirm at the ticket desk or official site before you go.` },
    { q: `When is the best time to visit ${name}?`, a: `${p.bestTimeEn || best} is usually quieter and better for photos. Weekday mornings reduce crowds.` },
    { q: `How do I get to ${name}?`, a: p.howToGetThereEn || `Reach ${name} from ${city} center by public transit or taxi.` },
    { q: `Is ${name} suitable for children?`, a: `Family visits are common in ${city}, ${country}; plan for queues and walking distance.` },
    { q: `Where to eat near ${name}?`, a: p.cultureFoodEn || `Local cafés and restaurants sit within walking distance of ${city} center.` },
  ];

  return { faqTR, faqEN };
}

module.exports = { buildFaqForPlace };
