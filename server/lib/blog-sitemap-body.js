/**
 * Sitemap lists an approved blog only when btrim(body) is longer than 200
 * characters. Demo posts stored the excerpt in the body (about 70–140
 * characters), so the live sitemap dropped every blog URL.
 *
 * This module lengthens that body from the post's own title and excerpt.
 * It does not add shop names, rankings, ticket prices, or medical advice.
 * Verify leftovers such as "FAZ2-4 verify blog…" stay unpublished.
 */

const BLOG_BODY_MIN_CHARS = 200;

/** Topic notes for the six demo posts in server/seed.js. Keyed by title. */
const TOPIC_NOTES = {
  'Şafakta İstanbul: Kalabalık Gelmeden Önce':
    'Şafakta İstanbul için bu not, kalabalık birikmeden önceki erken saatleri genel bir yürüyüş çerçevesinde anlatır. Şehir uyanırken sokaklar daha sakin olabilir; tempo güne ve mevsime göre değişir. Belirli bir kapı saati, ücret veya gizli bir rota burada yoktur. Erken çıkmayı düşünen gezgin, o günün ulaşımını ve mekânın açık olup olmadığını yerinde kontrol etmelidir. Yazı, başlıktaki sabah yürüyüşü fikrini özetten öteye taşıyan kısa bir giriştir.',
  'Kyoto Sabah 6: Torii Kapıları Tamamen Senin':
    'Kyoto’da sabah erken bir tapınak yolu, günün ilerleyen saatlerine göre daha sakin kalabilir. Bu, her gün ve her mevsim için verilmiş bir söz değildir. Yazı belirli bir kapı, ücret, sıra süresi veya yalnızca yerelin bildiği bir sapak eklemez. Günü planlayan kişi, yolun açık olup olmadığını ve yürüyüş koşullarını yerinde kontrol etmelidir. Not, başlıktaki erken yürüyüş fikrinin genel bir çerçevesidir.',
  'Santorini: Kartpostalın Ötesinde':
    'Santorini notu, kartpostal karesinin ötesinde sakin bir bakış arayan gezgin için genel bir çerçevedir. Gün batımı kalabalıklaşabilir; daha sakin bir an, güne ve mevsime göre değişir. Bu metin yeni bir koy, teras adı veya gizli nokta listesi vermez. Manzara için yola çıkmadan önce o günün rüzgârına ve mekânın açık olup olmadığına bakmak yerinde olur. Yazı, başlıktaki fikirden yeni bir iddia üretmez.',
  "Alfama'da Bir Akşam: Fado ve Fayanslar":
    'Alfama’da bir akşam için bu not, eski bir mahallede yürüyüş ve Fado’nun duyulabildiği sokaklar üzerine genel bir giriştir. Hangi kapıdan hangi sesin geleceği güne göre değişir. Yazı belirli bir ev, masa veya fiyat eklemez. Akşam planı yapan kişi, o günün programını yerinde kontrol etmelidir. Metin, başlık ve özetteki yürüyüş fikrini kısa bir çerçevede tutar.',
  "Tokyo'da Ramen: Şeflerin Sırrı":
    'Tokyo’da ramen üzerine bu not, siparişten önce genel bir hatırlatmadır. Başlık bir liste çağrıştırsa da gövde dükkân adı, adres veya sıralama eklemez. Sıra, fiyat ve açık saat güne göre değişir. Ne sipariş edileceği mekâna bırakılır. Öğünü planlarken o günün duyurusuna bakmak yerinde olur. Yazı, eldeki özetten daha uzun bir giriş olarak durur; yeni bir keşif iddiası taşımaz.',
  "Machu Picchu'ya Hazırlanmak":
    'Machu Picchu’ya hazırlık notu, yüksek bir gezi için genel bir çerçevedir. Tempo, su ve mola ihtiyacı kişiye göre değişir. Bu metin tıbbi tavsiye, izin kuralı veya en sakin rota tarifi değildir. Kalabalık ve hava güne göre değişir. Yola çıkmadan önce güncel koşulları yerinde kontrol etmek gerekir. Not, başlık ve özetteki hazırlık fikrini kısa tutar; ayrı bir sağlık veya izin iddiası eklemez.',
};

const GENERIC_TR =
  'Bu yazı, başlığındaki gezi konusuna kısa bir giriş notudur. Saat, ücret, sıra, hava ve açık adres güne ve mekâna göre değişir. Metin yeni bir marka, dükkân adı veya sıralama listesi eklemez. Yola çıkmadan önce o günün duyurusunu yerinde kontrol etmek gerekir. Not, eldeki başlık ve özetten daha geniş bir çerçeve sunar; ayrı bir haber veya gezi iddiası taşımaz.';

const GENERIC_EN =
  'This is a short travel note based only on the post title and the summary already saved with it. Hours, prices, queues, weather, and street addresses change by day and place. The text adds no shop name, brand, or ranked list. Check the day’s notice before you go. The paragraph is a general introduction, not a new travel claim.';

function isTestBlogPollution(row) {
  const title = String(row?.title || '').trim();
  const excerpt = String(row?.excerpt || '').trim();
  const body = String(row?.body || '').trim();
  if (/^FAZ2-4 verify blog\b/i.test(title)) return true;
  if (/^ORTA-6 Pending\b/i.test(title)) return true;
  if (excerpt === 'Özet' && body === 'Gövde') return true;
  if (excerpt === 'hidden excerpt' && body === 'hidden body') return true;
  return false;
}

function prefersEnglish(title, excerpt, body) {
  const sample = `${title || ''}\n${excerpt || ''}\n${body || ''}`;
  if (/[çğıöşüÇĞİÖŞÜıİ]/.test(sample)) return false;
  const trHits = (sample.match(/\b(bir|ve|ile|icin|için|bu|olan|gibi|sonra|once|önce|yok)\b/gi) || []).length;
  const enHits = (sample.match(/\b(the|and|with|from|this|that|your|before|after|travel|guide|when|where)\b/gi) || []).length;
  return enHits >= 2 && enHits > trHits;
}

function continuationFor(title, excerpt, body) {
  const known = TOPIC_NOTES[String(title || '').trim()];
  if (known) return known;
  return prefersEnglish(title, excerpt, body) ? GENERIC_EN : GENERIC_TR;
}

/**
 * Approved short posts grow past the sitemap minimum.
 * Test rows are unpublished instead of being filled with fake articles.
 * Returns { action: 'keep' | 'expand' | 'unpublish', body }.
 */
function planSitemapBlog(row) {
  const excerpt = String(row?.excerpt || '').trim();
  const current = String(row?.body || '').trim();
  const status = String(row?.status || '').trim();
  if (isTestBlogPollution(row)) {
    const publishedAt = row?.published_at ?? row?.publishedAt;
    const scheduled = publishedAt != null && String(publishedAt).trim() !== '';
    // Pending rows with a past published_at are published again on boot.
    const liveOrDue = status === 'approved'
      || (scheduled && (status === 'pending' || status === 'draft'));
    return {
      action: liveOrDue ? 'unpublish' : 'keep',
      body: current,
    };
  }
  if (current.length > BLOG_BODY_MIN_CHARS) {
    return { action: 'keep', body: current };
  }
  const note = continuationFor(row?.title, excerpt, current);
  let base = current;
  if (!base && excerpt) base = excerpt;
  let next = base ? `${base}\n\n${note}` : note;
  if (next.length <= BLOG_BODY_MIN_CHARS) {
    const extra = prefersEnglish(row?.title, excerpt, current) ? GENERIC_EN : GENERIC_TR;
    if (!next.includes(extra)) next = `${next}\n\n${extra}`;
  }
  return { action: 'expand', body: next.trim() };
}

module.exports = {
  BLOG_BODY_MIN_CHARS,
  TOPIC_NOTES,
  GENERIC_TR,
  GENERIC_EN,
  isTestBlogPollution,
  prefersEnglish,
  planSitemapBlog,
};
