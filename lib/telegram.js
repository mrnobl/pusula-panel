const http = require('https');

class TelegramNotifier {
  constructor(config) {
    this.updateConfig(config);
  }

  updateConfig(config) {
    const tg = (config && config.telegram) || {};
    this.enabled = !!tg.enabled;
    this.botToken = tg.botToken || '';
    this.chatId = tg.chatId || '';

    // Unattended running needs alerts for problems, not a message per fill.
    // With many bots, trade alerts are off unless explicitly asked for.
    this.notifyCritical = tg.notifyCritical !== false;  // kill-switch, çökme
    this.notifyErrors = tg.notifyErrors !== false;      // borsa/veri hataları
    this.notifyLifecycle = tg.notifyLifecycle !== false; // başlatma/durdurma
    this.notifyTrades = tg.notifyTrades === true;        // her işlem (varsayılan kapalı)

    if (!this._sent) this._sent = {};
  }

  /**
   * Sends at most one message per key in the given window, so a repeating
   * failure cannot flood the chat the way it flooded the log buffer.
   */
  async notify(level, title, lines = [], options = {}) {
    const { key = title, throttleMs = 15 * 60 * 1000 } = options;

    // Bildirim merkezi bağlıysa (lib/bildirimMerkezi.js) aç/kapat orada, mesajın türüne göre — eski bayraklar yalnız merkezsiz.
    const allowed = this.merkez ? ['critical', 'error', 'lifecycle', 'trade'].includes(level) : {
      critical: this.notifyCritical,
      error: this.notifyErrors,
      lifecycle: this.notifyLifecycle,
      trade: this.notifyTrades
    }[level];

    if (!allowed) return false;

    const now = Date.now();
    if (this._sent[key] && (now - this._sent[key]) < throttleMs) return false;
    this._sent[key] = now;

    const icon = { critical: '🚨', error: '⚠️', lifecycle: 'ℹ️', trade: '💱' }[level] || 'ℹ️';
    const body = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines);
    const stamp = new Date().toLocaleString('tr-TR');

    const ok = await this.sendMessage(
      `${icon} <b>${title}</b>\n\n${body}\n\n<i>🧭 Pusula · ${stamp}</i>`
    );
    // Altyapı Y3 (61.8): gönderilemeyen uyarı kısıt süresince susturulmasın — ağ dönünce aynı uyarı yeniden gidebilsin.
    if (!ok && this._sent[key] === now) delete this._sent[key];
    return ok;
  }

  /**
   * Sends a message and reports why it failed.
   * Telegram answers with a descriptive `description` field ("chat not found",
   * "Unauthorized", ...). Throwing that away left the user with a silent
   * failure and nothing to act on, so it is returned to the caller.
   *
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async sendMessageDetailed(message, secenek = {}) {
    // PLAN-PANEL-2 bildirim merkezi: bütün gönderim yolları buradan geçer — tür kapalıysa gönderilmez (çağırana "gönderildi
    // sayılır" döner ki giden kutusu yeniden denemesin), her deneme merkezin kaydına düşer.
    // 73.5: kararı merkez verir (`hazirla`): tür (yeni üreticiler `secenek.tur` verir), şablon metni, kanal (Telegram / ntfy /
    // ikisi), sessiz saat (bekle → sonra tek özet / düşür). Kritik türler kapatılamaz ve sessiz saati deler (merkezde kilitli).
    const m = this.merkez;
    const kurulu = !!(this.enabled && this.botToken && this.chatId);
    if (!m) return this._gonderHam(message);
    let h = null;
    try { h = typeof m.hazirla === 'function' ? m.hazirla(message, secenek || {}) : null; } catch (e) { h = null; }
    const kaydet = (k) => { try { m.kaydet(k); } catch (e) { /* kayıt yok */ } };
    if (!h) {
      // Merkez karar veremedi (beklenmeyen hata): eski davranış — mesaj aynen gider.
      const r = await this._gonderHam(message);
      if (kurulu) kaydet({ tur: 'diger', metin: message, sonuc: r.ok ? 'gonderildi' : 'hata', hata: r.ok ? null : r.error });
      return r;
    }
    if (!kurulu) {
      // Telegram hiç kurulmamışsa (kapalı / token / chat id yok) kayda düşmez — "son gönderilenler" yalnız gerçek denemeler.
      // 73.5: tür ntfy'a da yönlendirildiyse ve ntfy kuruluysa ntfy'dan gider.
      if (h.karar === 'gonder' && h.kanallar && h.kanallar.ntfy) {
        const n = await m.ntfyGonder(h);
        if (!n.atlandi) kaydet({ tur: h.tur, metin: h.metin, sonuc: n.ok ? 'gonderildi' : 'hata', hata: n.ok ? null : n.hata, kanal: 'ntfy', ozel: h.ozel });
        if (n.ok) return { ok: true, kanal: 'ntfy' };
      }
      return this._gonderHam(message);
    }
    if (h.karar === 'kapali') { kaydet({ tur: h.tur, metin: message, sonuc: 'kapali' }); return { ok: true, atlandi: true, neden: 'bildirim merkezinde kapalı' }; }
    if (h.karar === 'bekle') {
      try { m.beklet(h); } catch (e) { /* bekletilemedi */ }
      kaydet({ tur: h.tur, metin: h.metin, sonuc: 'bekletildi' });
      return { ok: true, atlandi: true, neden: 'sessiz saat — bitince özet olarak gönderilecek' };
    }
    if (h.karar === 'dusur') { kaydet({ tur: h.tur, metin: h.metin, sonuc: 'dusuruldu' }); return { ok: true, atlandi: true, neden: 'sessiz saat — düşürüldü' }; }
    const kanal = h.kanallar.telegram && h.kanallar.ntfy ? 'ikisi' : h.kanallar.ntfy ? 'ntfy' : 'telegram';
    let r = { ok: true }, gonderilen = h.metin, ozel = h.ozel;
    if (h.kanallar.telegram) {
      // 74.0: alarm / uyarı mesajına düğmeler (Ayrıntı · Panelde çöz ↗ · 1 saat sessize al) — lib/telegramMenu.js bildirimKlavyesi.
      let klavye = null;
      try { klavye = h.bag && typeof this.klavyeFn === 'function' ? this.klavyeFn(h.bag, h) : null; } catch (e) { klavye = null; }
      r = await this._gonderHam(h.metin, klavye ? { reply_markup: klavye } : null);
      // Düğmeyi Telegram reddederse (400: ör. panel adresi Telegram'ın kabul etmediği bir adres) aynı mesaj düğmesiz — bildirim kaybolmaz.
      if (!r.ok && klavye && r.status === 400) r = await this._gonderHam(h.metin);
      // Düzenlenmiş metni Telegram biçim hatasıyla reddederse (400) bir kez bugünkü varsayılan metinle — bildirim kaybolmaz.
      if (!r.ok && h.ozel && r.status === 400) { const r2 = await this._gonderHam(h.varsayilanMetin); if (r2.ok) { r = r2; gonderilen = h.varsayilanMetin; ozel = false; } }
    }
    if (h.kanallar.ntfy) {
      const n = await m.ntfyGonder(h);
      if (!h.kanallar.telegram) r = n.ok ? { ok: true } : { ok: false, error: `ntfy'a gönderilemedi: ${n.hata || 'bilinmeyen'}` };
    }
    kaydet({ tur: h.tur, metin: gonderilen, sonuc: r.ok ? 'gonderildi' : 'hata', hata: r.ok ? null : r.error, kanal, ozel });
    return r;
  }

  /** Bildirim merkezini bağlar (server.js açılışta). null → eski davranış. */
  merkezBagla(m) { this.merkez = m || null; }

  async _gonderHam(message, ek = null) {
    // 67.5: geliştirme bilgisayarında gönderim yok (aynı jeton sunucuda kullanılıyor) — yalnız TELEGRAM_GELISTIRME=1 ile açılır.
    if (this.gelistirmeEngeli) return { ok: false, atlandi: true, error: `Bu bilgisayar geliştirme bilgisayarı — Telegram gönderimi kapalı (${this.gelistirmeEngeli}). Bildirimleri sunucu gönderir.` };
    if (!this.enabled) return { ok: false, error: 'Telegram bildirimleri kapalı. Ayarlar sekmesinden etkinleştirin.' };
    if (!this.botToken) return { ok: false, error: 'Bot token girilmemiş.' };
    if (!this.chatId) return { ok: false, error: 'Chat ID girilmemiş.' };
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(this.botToken)) {
      return { ok: false, error: 'Bot token biçimi hatalı. BotFather\'ın verdiği tam metni yapıştırın (örnek: 8123456789:AAH...).' };
    }
    if (!/^-?\d+$/.test(String(this.chatId).trim())) {
      return { ok: false, error: `Chat ID sayısal olmalı (girilen: "${this.chatId}"). Gruplar için eksi işaretiyle birlikte yazın.` };
    }

    const govde = { chat_id: this.chatId, text: message, parse_mode: 'HTML' };
    if (ek && ek.reply_markup) govde.reply_markup = ek.reply_markup;   // 74.0 bildirim düğmeleri
    const payload = JSON.stringify(govde);

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${this.botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    return new Promise((resolve) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) return resolve({ ok: true });

          let description = `HTTP ${res.statusCode}`;
          try {
            const body = JSON.parse(data);
            if (body.description) description = body.description;
          } catch (_) { /* gövde JSON değilse kod yeterli */ }

          resolve({ ok: false, status: res.statusCode, error: this.explain(res.statusCode, description) });
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: `Telegram sunucusuna ulaşılamadı: ${err.message}` });
      });

      req.setTimeout(15000, () => {
        req.destroy();
        resolve({ ok: false, error: 'Telegram sunucusu 15 saniyede yanıt vermedi (internet/engel kontrolü).' });
      });

      req.write(payload);
      req.end();
    });
  }

  /** Telegram'ın teknik hatasını ne yapılması gerektiğine çevirir. */
  explain(statusCode, description) {
    const d = String(description).toLowerCase();

    if (statusCode === 401 || d.includes('unauthorized')) {
      return 'Bot token geçersiz. BotFather\'dan aldığınız token\'ı kontrol edin.';
    }
    if (d.includes('chat not found')) {
      return 'Chat ID bulunamadı. Botunuza Telegram\'dan /start yazdınız mı? Bot, kendisine hiç yazmamış kişiye mesaj gönderemez.';
    }
    if (d.includes('bot was blocked')) {
      return 'Botu engellemişsiniz. Telegram\'da sohbeti açıp engeli kaldırın.';
    }
    if (d.includes('bot can\'t initiate') || d.includes("can't initiate conversation")) {
      return 'Bot sohbeti başlatamaz. Önce siz botunuza /start yazın.';
    }
    if (statusCode === 429) {
      return 'Telegram hız sınırı aşıldı. Bir süre sonra tekrar deneyin.';
    }
    return `Telegram hatası: ${description}`;
  }

  /**
   * Genel Bot API çağrısı (komut yoklaması için: getUpdates, sendMessage).
   * Testlerde `this.apiFn` ile değiştirilir — gerçek Telegram'a gidilmez.
   * Hata metinleri token TAŞIMAZ (yol yalnız istek seçeneğinde; ağ hatasından yalnız kod alınır).
   * @returns {Promise<{ ok, result?, description?, error_code? }>} — ağ hatası/zaman aşımında istisna.
   */
  apiCagir(yontem, parametre = {}, { zamanAsimiMs = 15000 } = {}) {
    if (this.gelistirmeEngeli) return Promise.resolve({ ok: false, description: `geliştirme bilgisayarı — Telegram kapalı (${this.gelistirmeEngeli})` });
    if (typeof this.apiFn === 'function') return this.apiFn(yontem, parametre, { zamanAsimiMs });
    const payload = JSON.stringify(parametre);
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'api.telegram.org', port: 443, path: `/bot${this.botToken}/${yontem}`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, error_code: res.statusCode, description: `HTTP ${res.statusCode}` }); }
        });
      });
      req.on('error', (e) => reject(new Error(`Telegram'a ulaşılamadı (${e.code || 'ağ hatası'})`)));
      req.setTimeout(zamanAsimiMs, () => req.destroy(Object.assign(new Error('zaman aşımı'), { code: `${Math.round(zamanAsimiMs / 1000)} sn zaman aşımı` })));
      req.write(payload);
      req.end();
    });
  }

  /** Geriye dönük uyumluluk: yalnızca başarı/başarısızlık döndürür. */
  async sendMessage(message) {
    const result = await this.sendMessageDetailed(message);
    if (!result.ok) console.error('Telegram gönderilemedi:', result.error);
    return result.ok;
  }

  async sendTradeAlert(side, symbol, price, amount, profit = null) {
    if (!this.merkez && !this.notifyTrades) return false;

    const icon = side.toUpperCase() === 'BUY' ? '🟢' : '🔴';
    let text = `${icon} <b>TRADE ALERTI [${side.toUpperCase()}]</b>\n\n`;
    text += `<b>Sembol:</b> ${symbol}\n`;
    text += `<b>Fiyat:</b> $${price}\n`;
    text += `<b>Miktar:</b> ${amount}\n`;
    if (profit !== null) {
      const profitIcon = profit >= 0 ? '💰' : '🔻';
      text += `<b>Net Kâr/Zarar:</b> ${profitIcon} $${profit.toFixed(2)}\n`;
    }
    text += `\n<i>🧭 Pusula</i>`;
    return this.sendMessage(text);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KOMUT YOKLAMASI — getUpdates uzun yoklama (long polling). YALNIZ OKUMA komutları.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');

const TELEGRAM_SINIR = 4096;

/** Uzun metni Telegram'ın 4096 karakter sınırına göre satır sınırından böler. */
function metniBol(metin, sinir = TELEGRAM_SINIR) {
  const parcalar = [];
  let cari = '';
  for (let satir of String(metin == null ? '' : metin).split('\n')) {
    while (satir.length > sinir) {                   // tek satır sınırı aşıyorsa sert böl
      if (cari) { parcalar.push(cari); cari = ''; }
      parcalar.push(satir.slice(0, sinir));
      satir = satir.slice(sinir);
    }
    const aday = cari ? `${cari}\n${satir}` : satir;
    if (aday.length > sinir) { parcalar.push(cari); cari = satir; } else cari = aday;
  }
  if (cari || !parcalar.length) parcalar.push(cari);
  return parcalar;
}

/** 74.0: düğme satırlarında URL düğmesi var mı / URL düğmeleri atılmış kopya (Telegram adresi reddederse yedek). */
const urlDugmeVar = (kl) => Array.isArray(kl) && kl.some(s => Array.isArray(s) && s.some(b => b && b.url));
const urlsuz = (kl) => (kl || []).map(s => (s || []).filter(b => b && !b.url)).filter(s => s.length);

const tokenGecerli = (t) => /^\d+:[A-Za-z0-9_-]+$/.test(String(t || ''));
const botNo = (t) => String(t || '').split(':')[0];   // botun herkese açık sayısal kimliği (sır DEĞİL)

class TelegramYoklayici {
  /**
   * @param ayar { notifierFn: () → TelegramNotifier (enabled, botToken, chatId, apiCagir),
   *               isleyici: async (komut, { metin, mesaj }) → string | null,
   *               offsetDosya (data/telegram-offset.json), kaydet(seviye, metin),
   *               zamanAsimiSn (50), hizSiniriMs (10000), kapaliBeklemeMs (30000), simdiFn }
   */
  constructor(ayar = {}) {
    this.notifierFn = ayar.notifierFn || (() => null);
    this.isleyici = ayar.isleyici || (async () => null);
    this.offsetDosya = ayar.offsetDosya || null;
    this.kaydet = ayar.kaydet || (() => {});
    this.zamanAsimiSn = ayar.zamanAsimiSn ?? 50;
    this.hizSiniriMs = ayar.hizSiniriMs ?? 10000;
    this.kapaliBeklemeMs = ayar.kapaliBeklemeMs ?? 30000;
    this.simdiFn = ayar.simdiFn || Date.now;
    // 67.5: () → null | neden. Neden varsa (geliştirme bilgisayarı) yoklama BAŞLAMAZ ve getUpdates hiç çağrılmaz — sunucudaki
    // yoklamayla 409 çakışması olmasın.
    this.engelFn = typeof ayar.engel === 'function' ? ayar.engel : () => null;
    // 74.0 MENÜ (lib/telegramMenu.js): menu = { cozumle(veri, { mesajId }), menuGonderildi(id), komutlar() } | null.
    // Düğme basışı (callback_query) yalnız yetkili sohbetten; hız sınırı: iki basış arası ≥ cbAralikMs, dakikada en çok cbDakika.
    this.menu = ayar.menu || null;
    this.cbAralikMs = ayar.cbAralikMs ?? 700;
    this.cbDakika = ayar.cbDakika ?? 30;
    this._cbZamanlar = [];
    this._tanitildi = false;   // setMyCommands + setChatMenuButton bu süreçte yapıldı mı
    this._tanitDeneme = 0;
    this.offset = null;        // bir sonraki beklenen update_id
    this._botNo = null;
    this._sonKomut = {};
    this._calisiyor = false;
    this._dur = false;
    this._bekleme = 0;
    this._sonHataMetni = null;
    this.sayac = { islenen: 0, yetkisiz: 0, hizSiniri: 0, hata: 0 };
    this.sonYoklama = null;
    this.sonHata = null;
  }

  // ── offset kalıcılığı ──────────────────────────────────────────────────
  _offsetOku(no) {
    if (!this.offsetDosya) return null;
    try {
      const d = JSON.parse(fs.readFileSync(this.offsetDosya, 'utf8'));
      return d && d.botNo === no && Number.isInteger(d.offset) ? d.offset : null;   // başka bot → yok say
    } catch { return null; }
  }
  _offsetYaz() {
    if (!this.offsetDosya) return;
    try {
      fs.mkdirSync(path.dirname(this.offsetDosya), { recursive: true });
      const gecici = this.offsetDosya + '.tmp';
      fs.writeFileSync(gecici, JSON.stringify({ botNo: this._botNo, offset: this.offset, zaman: this.simdiFn() }), 'utf8');
      fs.renameSync(gecici, this.offsetDosya);
    } catch (e) { this.kaydet('WARN', `Telegram offset yazılamadı: ${e.code || e.message}`); }
  }

  /** Yoklama yapılabilir mi (etkin + geçerli token + chat id). */
  _hazir() {
    const n = this.notifierFn();
    if (!n || !n.enabled || !tokenGecerli(n.botToken) || !/^-?\d+$/.test(String(n.chatId || '').trim())) return null;
    return n;
  }

  /**
   * Tek yoklama turu. Ağ hatası İSTİSNA olarak yukarı çıkar (döngü yakalar, artan bekleme).
   * @returns {{ durum: 'kapali' | 'ilk' | 'tamam', islenen?, atlanan? }}
   */
  async tekTur() {
    const engel = this.engelFn();
    if (engel) return { durum: 'kapali', neden: engel };
    const n = this._hazir();
    if (!n) return { durum: 'kapali' };
    const no = botNo(n.botToken);
    if (this._botNo !== no) { this._botNo = no; this.offset = this._offsetOku(no); }

    // İlk kurulum (offset dosyası yok / bot değişti): birikmiş eski mesajlara CEVAP VERİLMEZ, atlanır.
    if (this.offset == null) {
      const r = await n.apiCagir('getUpdates', { offset: -1, timeout: 0 }, { zamanAsimiMs: 15000 });
      if (!r || !r.ok) throw new Error(`getUpdates: ${(r && r.description) || 'yanıt yok'}`);
      const son = (r.result || []).reduce((m, u) => Math.max(m, u.update_id), -1);
      this.offset = son + 1;
      this._offsetYaz();
      this.sonYoklama = this.simdiFn();
      return { durum: 'ilk', atlanan: (r.result || []).length };
    }

    await this._tanit(n);
    const r = await n.apiCagir('getUpdates', { offset: this.offset, timeout: this.zamanAsimiSn, allowed_updates: this.menu ? ['message', 'callback_query'] : ['message'] },
      { zamanAsimiMs: (this.zamanAsimiSn + 15) * 1000 });
    if (!r || !r.ok) {
      throw new Error(r && r.error_code === 409
        ? 'getUpdates çakışması (409) — aynı bot token başka bir bilgisayarda/programda da yoklanıyor ya da webhook kurulu'
        : `getUpdates: ${(r && r.description) || 'yanıt yok'}`);
    }
    this.sonYoklama = this.simdiFn();
    let islenen = 0;
    for (const u of (r.result || []).slice().sort((a, b) => a.update_id - b.update_id)) {
      if (u.update_id < this.offset) continue;
      // Önce offset ilerler ve YAZILIR (en çok bir kez): çökme/yeniden başlatma eski komutu tekrar işlemez.
      this.offset = u.update_id + 1;
      this._offsetYaz();
      if (u.callback_query) { if (await this._callbackIsle(n, u.callback_query)) islenen++; continue; }
      if (await this._mesajIsle(n, u.message)) islenen++;
    }
    return { durum: 'tamam', islenen };
  }

  /**
   * 74.0: Telegram'ın "/" komut listesi ve sohbetin menü düğmesi — süreç başına BİR kez (başarısızsa en çok saatte bir yeniden).
   * Yalnız yoklama çalışırken (sunucu) çağrılır; geliştirme bilgisayarında tekTur buraya hiç gelmez. Hata yoklamayı durdurmaz.
   */
  async _tanit(n) {
    if (this._tanitildi || !this.menu || typeof this.menu.komutlar !== 'function') return;
    const simdi = this.simdiFn();
    if (this._tanitDeneme && simdi - this._tanitDeneme < 60 * 60000) return;
    this._tanitDeneme = simdi;
    try {
      const a = await n.apiCagir('setMyCommands', { commands: this.menu.komutlar() }, { zamanAsimiMs: 15000 });
      const b = await n.apiCagir('setChatMenuButton', { chat_id: n.chatId, menu_button: { type: 'commands' } }, { zamanAsimiMs: 15000 });
      if (a && a.ok) { this._tanitildi = true; this.kaydet('INFO', `Telegram komut listesi tanıtıldı (${this.menu.komutlar().length} komut)${b && b.ok ? ' + menü düğmesi' : ''}.`); }
      else this.kaydet('WARN', `Telegram komut listesi tanıtılamadı: ${(a && a.description) || 'yanıt yok'} — 1 saat sonra yeniden denenir`);
    } catch (e) { this.kaydet('WARN', `Telegram komut listesi tanıtılamadı: ${(e && e.message) || 'hata'}`); }
  }

  /** 74.0: tek parça ya da bölünmüş gönderim; `klavye` son parçaya. @returns son gönderilen mesajın message_id | null */
  async _gonder(n, metin, klavye) {
    const parcalar = metniBol(metin);
    let id = null;
    for (let i = 0; i < parcalar.length; i++) {
      const p = { chat_id: n.chatId, text: parcalar[i], disable_web_page_preview: true };
      if (klavye && klavye.length && i === parcalar.length - 1) p.reply_markup = { inline_keyboard: klavye };
      let s = await n.apiCagir('sendMessage', p, { zamanAsimiMs: 15000 });
      // Telegram panel adresini (URL düğmesi) kabul etmezse aynı mesaj ↗ düğmeleri olmadan — ekran kaybolmaz.
      if (s && s.ok === false && p.reply_markup && urlDugmeVar(p.reply_markup.inline_keyboard)) s = await n.apiCagir('sendMessage', { ...p, reply_markup: { inline_keyboard: urlsuz(p.reply_markup.inline_keyboard) } }, { zamanAsimiMs: 15000 });
      if (s && s.ok === false) this.kaydet('WARN', `Telegram komut cevabı gönderilemedi: ${s.description || 'hata'}`);
      else if (s && s.result && Number.isInteger(s.result.message_id)) id = s.result.message_id;
    }
    return id;
  }

  /**
   * 74.0: düğme basışı. GÜVENLİK: yalnız yapılandırılmış sohbetin mesajındaki düğme; başkası SESSİZCE yok sayılır. Veri menü
   * modülünde imza + beyaz liste + süre ile çözülür (bilinmeyen veri hiçbir şey yaptırmaz). Her basışa answerCallbackQuery.
   */
  async _callbackIsle(n, cq) {
    if (!cq || !this.menu) return false;
    const m = cq.message;
    if (!m || !m.chat || String(m.chat.id) !== String(n.chatId).trim()) { this.sayac.yetkisiz++; return false; }
    const cevapla = (text, alarm = false) => n.apiCagir('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text: String(text).slice(0, 190), show_alert: !!alarm } : {}) }, { zamanAsimiMs: 15000 }).catch(() => null);
    const simdi = this.simdiFn();
    this._cbZamanlar = this._cbZamanlar.filter(t => simdi - t < 60000);
    const son = this._cbZamanlar[this._cbZamanlar.length - 1];
    if ((son != null && simdi - son < this.cbAralikMs) || this._cbZamanlar.length >= this.cbDakika) {
      this.sayac.hizSiniri++;
      await cevapla('Çok hızlı — birkaç saniye bekleyip yeniden basın.');
      return false;
    }
    this._cbZamanlar.push(simdi);
    let k;
    try { k = this.menu.cozumle(cq.data, { mesajId: m.message_id }); } catch (e) { k = { gecerli: false, uyari: 'Bu düğme işlenemedi — /menu yazın.' }; }
    await cevapla(k.alarm || k.uyari || null, !!k.alarm);
    if (!k.gecerli || typeof k.calistir !== 'function') { this.sayac.islenen += k.gecerli ? 1 : 0; return !!k.gecerli; }
    let e;
    try { e = await k.calistir(); } catch (x) { e = { metin: `Ekran hazırlanamadı: ${(x && x.message) || 'hata'}`, klavye: [] }; }
    if (!e || !e.metin) return false;
    if (!k.yeni) {
      const metin = String(e.metin).slice(0, TELEGRAM_SINIR);
      const duzenle = (kl) => n.apiCagir('editMessageText', { chat_id: n.chatId, message_id: m.message_id, text: metin, disable_web_page_preview: true,
        reply_markup: { inline_keyboard: kl } }, { zamanAsimiMs: 15000 }).catch((x) => ({ ok: false, description: x.message }));
      let r = await duzenle(e.klavye || []);
      if (r && r.ok === false && !/not modified|not found/i.test(String(r.description)) && urlDugmeVar(e.klavye)) r = await duzenle(urlsuz(e.klavye));
      if (r && r.ok !== false) { this.menu.menuGonderildi(m.message_id); this.sayac.islenen++; return true; }
      if (/not modified/i.test(String(r && r.description))) { this.sayac.islenen++; return true; }
      // Düzenlenemedi (mesaj çok eski / silinmiş): yeni mesaj olarak gönderilir.
    }
    const id = await this._gonder(n, e.metin, e.klavye);
    if (id != null) this.menu.menuGonderildi(id);
    this.sayac.islenen++;
    return true;
  }

  async _mesajIsle(n, m) {
    if (!m || !m.chat) return false;
    // GÜVENLİK: yalnız yapılandırılmış sohbet. Diğerleri SESSİZCE yok sayılır (cevap yok, log yok).
    if (String(m.chat.id) !== String(n.chatId).trim()) { this.sayac.yetkisiz++; return false; }
    const metin = typeof m.text === 'string' ? m.text.trim() : '';
    if (!metin.startsWith('/')) return false;
    const komut = metin.split(/\s+/)[0].slice(1).split('@')[0].toLocaleLowerCase('tr-TR');
    if (!komut) return false;
    const simdi = this.simdiFn();
    if (this._sonKomut[komut] != null && simdi - this._sonKomut[komut] < this.hizSiniriMs) { this.sayac.hizSiniri++; return false; }
    this._sonKomut[komut] = simdi;
    let cevap;
    try { cevap = await this.isleyici(komut, { metin, mesaj: m }); } catch (e) { cevap = `Komut işlenemedi: ${(e && e.message) || 'bilinmeyen hata'}`; }
    if (!cevap) return false;
    if (typeof cevap === 'object' && cevap.metin) {
      // 74.0 menü ekranı: düğmeli yeni mesaj; en son menü mesajı olur (eski menülerin düğmeleri "süresi doldu").
      const id = await this._gonder(n, String(cevap.metin), cevap.klavye);
      if (id != null && this.menu) this.menu.menuGonderildi(id);
    } else await this._gonder(n, String(cevap), null);
    this.sayac.islenen++;
    return true;
  }

  // ── döngü ──────────────────────────────────────────────────────────────
  baslat() {
    const engel = this.engelFn();
    if (engel) { this.kaydet('INFO', `Telegram komut yoklaması başlatılmadı: ${engel} (sunucudaki yoklamayla çakışmasın diye).`); return false; }
    if (this._calisiyor) return true;
    this._calisiyor = true; this._dur = false;
    this._dongu().catch(() => { /* döngü kendi hatalarını yakalar */ }).finally(() => { this._calisiyor = false; });
    return true;
  }
  durdur() { this._dur = true; if (this._uyandir) this._uyandir(); }

  _bekle(ms) {
    return new Promise((r) => {
      const t = setTimeout(() => { this._uyandir = null; r(); }, ms);
      if (t.unref) t.unref();
      this._uyandir = () => { clearTimeout(t); this._uyandir = null; r(); };
    });
  }

  async _dongu() {
    while (!this._dur) {
      let bekle = 0;
      try {
        const r = await this.tekTur();
        if (r.durum === 'kapali') bekle = this.kapaliBeklemeMs;   // panelden etkinleştirilince kendiliğinden başlar
        else {
          this._bekleme = 0;
          if (this._sonHataMetni) this.kaydet('INFO', 'Telegram komut yoklaması yeniden çalışıyor.');
          this._sonHataMetni = null; this.sonHata = null;
        }
      } catch (e) {
        // Yoklama hatası sunucuyu ETKİLEMEZ: artan bekleme 5 sn → 5 dk; aynı hata bir kez loglanır.
        this.sayac.hata++;
        this._bekleme = Math.min(this._bekleme ? this._bekleme * 2 : 5000, 5 * 60000);
        bekle = this._bekleme;
        const m = (e && e.message) || 'hata';
        this.sonHata = { zaman: this.simdiFn(), metin: m };
        if (m !== this._sonHataMetni) { this.kaydet('WARN', `Telegram komut yoklaması: ${m} — ${Math.round(bekle / 1000)} sn sonra tekrar`); this._sonHataMetni = m; }
      }
      if (bekle && !this._dur) await this._bekle(bekle);
    }
  }

  durum() {
    return { calisiyor: this._calisiyor, hazir: !!this._hazir(), engel: this.engelFn() || null, sonYoklama: this.sonYoklama, sonHata: this.sonHata, bekleme: this._bekleme, sayac: { ...this.sayac }, menu: !!this.menu, komutListesiTanitildi: this._tanitildi };
  }
}

module.exports = TelegramNotifier;
module.exports.TelegramYoklayici = TelegramYoklayici;

/**
 * 67.5 — GELİŞTİRME BİLGİSAYARI mı? (Telegram yoklama + gönderim kapalı.) Aynı bot jetonu sunucuda yoklanırken bu bilgisayar da
 * getUpdates yaparsa Telegram 409 döner ("başka bilgisayarda da yoklanıyor"). Ölçüt (biri yeter):
 *   · ARASTIRMA_MODU=1 (Pusula-Baslat data/makine.json'dan verir)
 *   · data/makine.json { arastirmaModu: true } — sunucu başlatıcı dışından (scripts/start-bot.cmd, npm start) açılsa da
 *   · data/ev-baglanti.json geçerli (bu bilgisayar sunucuya bağlı geliştirme kopyası — lib/evOkuma.ayarOku)
 * TELEGRAM_GELISTIRME=1 açıkça izin verir (deneme için). Sunucuda bu dosyalar yoktur → davranış değişmez.
 * @returns {string|null} engel nedeni (Türkçe) ya da null
 */
function gelistirmeEngeli({ env = process.env, kok, arastirma = false } = {}) {
  if (env && env.TELEGRAM_GELISTIRME === '1') return null;
  if (arastirma || (env && env.ARASTIRMA_MODU === '1')) return 'araştırma modu';
  if (kok) {
    try { if (JSON.parse(fs.readFileSync(yollar.programVeri(kok, 'makine.json'), 'utf8').replace(/^\uFEFF/, '')).arastirmaModu) return 'data/makine.json geliştirme bilgisayarı'; } catch { /* dosya yok */ }
    try { if (require('./evOkuma').ayarOku(kok)) return 'sunucu bağlantısı kurulu (data/ev-baglanti.json)'; } catch { /* yok */ }
  }
  return null;
}
module.exports.gelistirmeEngeli = gelistirmeEngeli;
module.exports.metniBol = metniBol;
module.exports.TELEGRAM_SINIR = TELEGRAM_SINIR;
