/**
 * COIN TARAMA — uyarılar (saf): kaynak hatası / erişilemezlik, kısmi veri, yeni kırmızı bayrak, liste zinciri
 * bozulması, tarama gecikmesi. Panel bunları bildirim + rozet olarak, Telegram (ayarla açılırsa) mesaj olarak gösterir.
 *
 *   uyarilar({ durum, ozet, zincir, ayar, simdi }) → [{ kod, seviye: 'tehlike'|'uyari'|'bilgi', metin, anahtar, href }]
 * `anahtar` aynı uyarının tekrarını tanır (Telegram kısıtı, panelde bir kez gösterim).
 */
'use strict';
const { KAYNAK_TANIM } = require('./ayarlar');

const SIRA = { tehlike: 0, uyari: 1, bilgi: 2 };
const saatMetni = (h) => (h < 1 ? `${Math.round(h * 60)} dk` : h < 48 ? `${Math.round(h)} saat` : `${Math.round(h / 24)} gün`);

/**
 * Kaynak hatası → sade cümle (B-31, 61.1). "HTTP 429" kullanıcıya açıklanmıyordu.
 * Saf; bilinmeyen hata kısa olarak aynen kalır.
 */
function hataSade(h) {
  const m = String(h || '').trim();
  if (!m) return '';
  if (/\b429\b/.test(m)) return 'istek sınırına takıldı (429) — bir sonraki taramada yeniden denenir';
  if (/zaman a[şs][ıi]m|timeout|ETIMEDOUT|AbortError/i.test(m)) return 'zamanında yanıt vermedi — bir sonraki taramada yeniden denenir';
  if (/\b5\d\d\b/.test(m)) return `kaynağın sunucusu hata verdi (${(m.match(/\b5\d\d\b/) || [''])[0]}) — bir sonraki taramada yeniden denenir`;
  if (/\b40[13]\b/.test(m)) return 'erişim reddedildi (anahtar ya da izin sorunu)';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|getaddrinfo/i.test(m)) return 'bağlantı kurulamadı (internet ya da kaynak kapalı)';
  return `son hata: ${m.length > 80 ? m.slice(0, 77) + '…' : m}`;
}

function uyarilar({ durum, ozet, zincir, ayar, simdi = Date.now() } = {}) {
  const l = [];
  const ekle = (kod, seviye, metin, anahtar, href = '#/tarama') => l.push({ kod, seviye, metin, anahtar: `${kod}:${anahtar || ''}`, href });
  const d = durum || {};
  const son = d.sonTarama || null;

  // Gecikme
  const sonB = Date.parse(d.sonBasari || '');
  if (!Number.isFinite(sonB)) {
    if (!d.calisiyor) ekle('gecikme', son ? 'uyari' : 'bilgi', son ? 'Henüz başarılı bir coin taraması yok (son deneme hatalı).' : 'Coin taraması henüz hiç çalışmadı.', 'hic');
  } else {
    const h = (simdi - sonB) / 3600e3;
    if (h > ((ayar && ayar.gecikmeSaat) || 36)) ekle('gecikme', 'uyari', `Coin taraması gecikti: son başarılı tarama ${saatMetni(h)} önce (eşik ${ayar ? ayar.gecikmeSaat : 36} saat).`, String(d.sonBasari).slice(0, 13));
  }

  // Son taramanın sonucu
  if (son) {
    if (son.durum === 'hata') ekle('tarama_hatasi', 'tehlike', `Son coin taraması hiçbir kaynaktan veri alamadı${son.hata ? `: ${son.hata}` : ''}.`, son.id);
    const ko = son.kaynakOzet || {};
    for (const [k, s] of Object.entries(ko)) {
      if (!s || !s.hata) continue;
      const deneme = (s.ok || 0) + (s.bos || 0) + (s.hata || 0) + (s.onbellek || 0);
      const ad = (KAYNAK_TANIM[k] && KAYNAK_TANIM[k].ad) || k;
      const tamami = deneme > 0 && s.hata === deneme;
      const sade = hataSade(s.sonHata);
      ekle('kaynak_hatasi', tamami ? 'tehlike' : 'uyari', tamami ? `${ad} erişilemedi: ${s.hata}/${deneme} istek başarısız${sade ? ` — ${sade}` : ''}.`
        : `${ad}: ${s.hata}/${deneme} coinde veri alınamadı${sade ? ` — ${sade}` : ''}.`, `${son.id}:${k}`);
    }
    if (son.kismi && son.durum !== 'hata') ekle('kismi_veri', 'bilgi', `Son tarama kısmi: ${son.eksikCoin || 0}/${son.coin || 0} coinde en az bir kaynak veri vermedi.`, son.id);
  }

  // Yeni kırmızı bayraklar (yok sayılanlar hariç)
  for (const c of ((ozet && ozet.coinler) || [])) {
    if (!c.izlemede) continue;
    const yeni = (c.bayraklar || []).filter(b => b.yeni && !b.yokSayildi);
    if (yeni.length) ekle('yeni_bayrak', 'uyari', `Yeni kırmızı bayrak — ${c.sembol}: ${yeni.map(b => b.metin).join('; ')}. (Alım/satım sinyali değildir.)`, `${c.id}:${c.son ? c.son.zaman : ''}:${yeni.map(b => b.kod).join(',')}`);
  }

  // Liste kayıt zinciri
  if (zincir) {
    if (zincir.gecerli === false) ekle('zincir_bozuk', 'tehlike', `Liste kayıt zinciri bozuk: ${(zincir.hatalar || []).slice(0, 2).map(h => `kayıt #${h.no}: ${h.neden}`).join(' · ') || 'doğrulanamadı'}.`, (zincir.hatalar || []).map(h => h.no).join(','), '#/tarama/listeler');
    if (zincir.catisma) ekle('zincir_catisma', 'tehlike', `Liste kaydı ile depodaki dışa aktarım çelişiyor (${zincir.catisma}). İki bilgisayarda ayrı liste girilmiş olabilir.`, String(zincir.catisma), '#/tarama/listeler');
    const da = zincir.disaAktarim || {};
    if ((da.farkli || []).length) ekle('disa_aktarim', 'uyari', `Dışa aktarılan liste dosyası kayıttan farklı: #${da.farkli.join(', #')} (kayitlar/listeler).`, da.farkli.join(','), '#/tarama/listeler');
    if ((zincir.ekler || []).length) ekle('piyasa_dosyasi', 'uyari', `Liste piyasa anlık görüntüsü eksik/değişmiş: ${zincir.ekler.map(e => `#${e.no}`).join(', ')}.`, zincir.ekler.map(e => e.no).join(','), '#/tarama/listeler');
  }
  return l.sort((a, b) => SIRA[a.seviye] - SIRA[b.seviye]);
}

module.exports = { uyarilar, saatMetni, hataSade };
