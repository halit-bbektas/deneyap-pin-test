// Deneyap Pin Test - tarayıcı uygulaması
// Karta bağlanır, gerekirse test yazılımını yükler, testi çalıştırır ve sonucu gösterir.
import { ESPLoader, Transport } from "./lib/esptool-js-0.7.0.js";
import {
  ESPRESSIF, ETIKETLER, MODELLER, modelBul, GRUP_RENKLERI, DUZENEKLER, AILE_DUZENEK, CEVIRI, SONUC, KOD_SINIF, tr, kacis, usbTuru, blokCoz, sonucMesaji, konumlar, PARCALAR, olcumTr,
} from "./cekirdek.js";

const PORT_FILTRELERI = [
  { usbVendorId: 0x10c4 }, // Silicon Labs CP210x (Deneyap Kart, 1A)
  { usbVendorId: ESPRESSIF }, // Espressif yerleşik USB (v2, 1A v2, Mini, Mini v2, G)
  { usbVendorId: 0x1a86 }, // WCH CH340 (bazı klon kartlar)
];
const YUKLEME_HIZLARI = [460800, 115200];
const LISTE_ANAHTARI = "dpt-liste-v1";
const DUZENEK_ANAHTARI = "dpt-duzenek";

class KullaniciHatasi extends Error {}

const $ = (id) => document.getElementById(id);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

let manifest = null;
let calisiyor = false;
let sonPort = null;
let sonSonuc = null;
let liste = listeOku();
let duzenek = depoOku(DUZENEK_ANAHTARI) || "kart";
let semaEtiketi = null;

// ------------------------------------------------------------------ küçük yardımcılar

function depoOku(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function depoYaz(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* tarayıcı izin vermiyor */ } }

function log(metin) {
  const el = $("log");
  el.textContent += metin + "\n";
  if (el.textContent.length > 80000) el.textContent = el.textContent.slice(-50000);
  el.scrollTop = el.scrollHeight;
}

function adim(ad, durum) {
  const li = document.querySelector(`#adimlar [data-adim="${ad}"]`);
  if (li) li.className = durum || "";
}

// Sihirbazın dört aşaması: hazirlik, pin, parca, rapor. durum: "", aktif, tamam, uyari, hata
function asama(ad, durum) {
  const li = document.querySelector(`#asamalar [data-asama="${ad}"]`);
  if (li) li.className = durum || "";
}

function asamalariSifirla() {
  document.querySelectorAll("#asamalar li").forEach((li) => (li.className = ""));
}

function adimlariSifirla() {
  document.querySelectorAll("#adimlar li").forEach((li) => (li.className = ""));
  ilerleme(null);
}

function mesaj(metin, hata = false) {
  const el = $("mesaj");
  el.textContent = metin;
  el.className = "mesaj" + (hata ? " hata" : "");
}

function ilerleme(oran) {
  const kap = $("ilerleme");
  if (oran === null) { kap.hidden = true; $("ilerleme-cubuk").style.width = "0"; return; }
  kap.hidden = false;
  $("ilerleme-cubuk").style.width = Math.round(Math.max(0, Math.min(1, oran)) * 100) + "%";
}

function butonlar(etkin) {
  $("btn-test").disabled = !etkin;
  $("btn-tekrar").disabled = !etkin;
  document.querySelectorAll("#duzenek-secim button").forEach((b) => (b.disabled = !etkin));
}

// ------------------------------------------------------------------ USB ve seri port

class SeriOkuyucu {
  constructor(port) {
    this.port = port;
    this.satirlar = [];
    this.tampon = "";
    this.okuyucu = null;
    this.dongu = null;
    this.koptu = false;       // okuma beklenmedik şekilde bitti (yerleşik USB'li kart yeniden başladı ya da çıkarıldı)
    this.kapaniyor = false;
  }

  async ac() {
    await this.port.open({ baudRate: 115200 });
    const tur = usbTuru(this.port);
    try {
      // uart: iki hat pasif = kart normal çalışır. tinyusb: veri için DTR gerekir.
      // jtag: hatları değiştirmek kartı sıfırlar, dokunulmaz.
      if (tur === "uart") await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
      if (tur === "tinyusb") await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
    } catch (e) { /* bazı sürücüler desteklemez */ }
    this.okuyucu = this.port.readable.getReader();
    this.dongu = this.oku();
  }

  async oku() {
    const coz = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await this.okuyucu.read();
        if (done) break;
        this.tampon += coz.decode(value, { stream: true }).replace(/\0/g, "");
        let i;
        while ((i = this.tampon.indexOf("\n")) >= 0) {
          const satir = this.tampon.slice(0, i).replace(/\r$/, "");
          this.tampon = this.tampon.slice(i + 1);
          this.satirlar.push(satir);
          log(satir);
        }
      }
    } catch (e) { /* port kapandı ya da kart çıkarıldı */ }
    if (!this.kapaniyor) this.koptu = true;
  }

  async yaz(metin) {
    const yazici = this.port.writable.getWriter();
    try { await yazici.write(new TextEncoder().encode(metin)); } finally { yazici.releaseLock(); }
  }

  async kapat() {
    this.kapaniyor = true;
    try { await this.okuyucu?.cancel(); } catch (e) {}
    try { await this.dongu; } catch (e) {}
    try { this.okuyucu?.releaseLock(); } catch (e) {}
    try { await this.port.close(); } catch (e) {}
  }
}

// "DPT;BASLA" ile "DPT;BITTI" arasındaki satırları bekler.
async function blokBekle(ok, baslangic, baslaSuresi, toplamSure) {
  const t0 = Date.now();
  let basla = -1;
  while (Date.now() - t0 < toplamSure) {
    const s = ok.satirlar;
    if (basla < 0) {
      for (let k = baslangic; k < s.length; k++) {
        if (s[k].startsWith("DPT;BASLA;")) { basla = k; break; }
      }
      if (basla < 0 && Date.now() - t0 > baslaSuresi) return null;
    }
    if (basla >= 0) {
      for (let k = basla + 1; k < s.length; k++) {
        if (s[k] === "DPT;BITTI") return s.slice(basla, k + 1);
      }
    }
    await bekle(40);
  }
  return null;
}

// Karttaki test yazılımına "T:<düzenek>" gönderip sonucu okur. Yazılım yoksa null döner.
async function testIste(port, acilisBeklemesi) {
  const ok = new SeriOkuyucu(port);
  await ok.ac();
  try {
    await bekle(acilisBeklemesi);
    for (let deneme = 0; deneme < 2; deneme++) {
      const idx = ok.satirlar.length;
      await ok.yaz(`T:${duzenek}\n`);
      const blok = await blokBekle(ok, idx, 2500, 15000);
      if (blok) return blokCoz(blok);
    }
    return null;
  } finally {
    await ok.kapat();
  }
}

// Yerleşik USB'li kartlar sıfırlanınca USB'den kopup yeniden bağlanabilir;
// Chrome bu durumda yeni bir port nesnesi verir. Aynı kartın güncel portunu bulur.
async function guncelPort(port, sure = 8000) {
  const bilgi = port.getInfo();
  const t0 = Date.now();
  for (;;) {
    const portlar = await navigator.serial.getPorts();
    if (portlar.includes(port)) return port;
    const yeni = portlar.find((p) => {
      const b = p.getInfo();
      return b.usbVendorId === bilgi.usbVendorId && b.usbProductId === bilgi.usbProductId;
    });
    if (yeni) return yeni;
    if (Date.now() - t0 > sure) return port;
    await bekle(300);
  }
}

// Port bir süre açılamayabilir (kart yeniden başlıyor ya da başka program kısa süre tutuyor).
// bosDonusteDur: port açıldı ama kart cevap vermediyse (test yazılımı yok) beklemeden döner.
async function yenidenBaglanTest(port, acilisBeklemesi, sure = 20000, bosDonusteDur = false) {
  const t0 = Date.now();
  let sonHata = null;
  while (Date.now() - t0 < sure) {
    const aday = await guncelPort(port, 3000);
    try {
      const r = await testIste(aday, acilisBeklemesi);
      sonPort = aday;
      if (r || bosDonusteDur) return r;
    } catch (e) {
      sonHata = e;
      log(`Port henüz hazır değil: ${e && e.message ? e.message : e}`);
    }
    await bekle(800);
  }
  if (sonHata) throw sonHata;
  return null;
}

// Tarayıcı port listesini sadece kullanıcı tıklayınca açar; uzun işlemlerin ortasında
// yeni port gerekirse (Mini) kullanıcıdan bir düğmeye basması istenir.
function kullanicidanPortIste(metin, dugmeYazisi) {
  return new Promise((coz, reddet) => {
    const kutu = $("port-istek");
    $("port-istek-metin").textContent = metin;
    $("port-istek-btn").textContent = dugmeYazisi;
    kutu.hidden = false;
    kutu.scrollIntoView({ behavior: "smooth", block: "center" });
    $("port-istek-btn").onclick = async () => {
      try {
        const p = await navigator.serial.requestPort({ filters: PORT_FILTRELERI });
        kutu.hidden = true;
        coz(p);
      } catch (e) {
        mesaj("Port seçilmedi. Listede kart yoksa birkaç saniye bekleyip tekrar deneyin.", true);
      }
    };
    $("port-istek-iptal").onclick = () => {
      kutu.hidden = true;
      reddet(new KullaniciHatasi("İşlem iptal edildi."));
    };
  });
}

// Arduino tabanlı ESP32-S2 yazılımları portu 1200 baud ile açılınca yükleme moduna geçer.
async function yuklemeModunaAl(port) {
  try {
    await port.open({ baudRate: 1200 });
    await bekle(200);
  } finally {
    try { await port.close(); } catch (e) {}
  }
  await bekle(1500);
}

// ------------------------------------------------------------------ yazılım yükleme

async function yazilimYukleHizla(port, hiz) {
  const transport = new Transport(port, false);
  const terminal = { clean() {}, writeLine: (s) => log(s), write: (s) => log(s) };
  const loader = new ESPLoader({ transport, baudrate: hiz, romBaudrate: 115200, terminal, debugLogging: false });
  try {
    const aciklama = await loader.main();
    const aile = loader.chip.CHIP_NAME;
    log(`Çip: ${aciklama} (aile: ${aile})`);
    const fw = manifest.aileler[aile];
    if (!fw) throw new KullaniciHatasi(`Bu kartın işlemcisi (${aile}) desteklenmiyor.`);
    const yanit = await fetch(`firmware/${fw.dosya}?v=${encodeURIComponent(manifest.surum)}`, { cache: "no-cache" });
    if (!yanit.ok) throw new KullaniciHatasi("Test yazılımı dosyası indirilemedi. İnternet bağlantısını kontrol edin.");
    const veri = new Uint8Array(await yanit.arrayBuffer());
    await loader.writeFlash({
      fileArray: [{ data: veri, address: fw.adres }],
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (_i, yazilan, toplam) => ilerleme(yazilan / toplam),
    });
    try { await loader.after("hard_reset"); } catch (e) { log("Yeniden başlatma komutu: " + e); }
    return aile;
  } finally {
    try { await transport.disconnect(); } catch (e) {}
  }
}

async function yazilimYukle(port) {
  let sonHata = null;
  for (const hiz of YUKLEME_HIZLARI) {
    try {
      log(`Yükleme hızı: ${hiz}`);
      return await yazilimYukleHizla(port, hiz);
    } catch (e) {
      if (e instanceof KullaniciHatasi) throw e;
      sonHata = e;
      log(`Yükleme denemesi başarısız (${hiz}): ${e && e.message ? e.message : e}`);
      await bekle(500);
    }
  }
  throw sonHata;
}

// ------------------------------------------------------------------ ana akış

async function testEt(tekrar = false) {
  if (calisiyor) return;
  calisiyor = true;
  butonlar(false);
  adimlariSifirla();
  asamalariSifirla();
  asama("hazirlik", "tamam");
  asama("pin", "aktif");
  mesaj("");
  $("sonuc").hidden = true;
  const etiket = $("etiket").value.trim();
  let port = tekrar && sonPort ? await guncelPort(sonPort, 3000) : null;

  try {
    adim("baglan", "aktif");
    if (!port) {
      try {
        port = await navigator.serial.requestPort({ filters: PORT_FILTRELERI });
      } catch (e) {
        adim("baglan", "");
        asamalariSifirla();
        asama("hazirlik", "aktif");
        mesaj("Port seçilmedi. Kart listede hiç görünmüyorsa aşağıdaki 'Kart bilgisayarda hiç görünmüyor' rehberine bakın.");
        $("gorunmuyor").open = true;
        return;
      }
    }
    sonPort = port;
    adim("baglan", "tamam");
    let tur = usbTuru(port);

    let sonuc = null;
    if (tur !== "rom" && !$("zorla-yukle").checked) {
      adim("kontrol", "aktif");
      mesaj("Kartta test yazılımı aranıyor…");
      sonuc = await yenidenBaglanTest(port, tur === "tinyusb" ? 600 : 300, 8000, true);
      port = sonPort;
      if (sonuc && sonuc.surum !== manifest.surum) {
        log(`Kartta eski test yazılımı var (${sonuc.surum}); ${manifest.surum} yüklenecek.`);
        sonuc = null;
      }
      adim("kontrol", "tamam");
    } else {
      adim("kontrol", "atlandi");
    }

    if (sonuc) {
      adim("yukle", "atlandi");
      adim("test", "tamam");
    } else {
      adim("yukle", "aktif");
      if (tur === "tinyusb") {
        mesaj("Kart yükleme moduna alınıyor…");
        await yuklemeModunaAl(port);
        port = await kullanicidanPortIste(
          "Kart yükleme moduna geçti. Aşağıdaki düğmeye basın ve listede yeni beliren portu seçin. " +
          "Yeni port çıkmazsa: karttaki BUT düğmesini basılı tutun, RESET'e basıp bırakın, sonra BUT'u bırakın.",
          "Yükleme portunu seç");
        tur = usbTuru(port);
      }
      mesaj("Test yazılımı karta yükleniyor… Kartı çıkarmayın.");
      const aile = await yazilimYukle(port);
      ilerleme(null);
      adim("yukle", "tamam");
      adim("test", "aktif");
      if (aile === "ESP32-S2") {
        port = await kullanicidanPortIste(
          "Test yazılımı yüklendi. Karttaki RESET düğmesine bir kez basın, birkaç saniye bekleyin, " +
          "sonra aşağıdaki düğmeye basıp kartı yeniden seçin.",
          "Kartı yeniden seç");
        sonPort = port;
      }
      mesaj("Pinler test ediliyor…");
      sonuc = await yenidenBaglanTest(port, aile === "ESP32-S2" ? 1000 : 1800);
      if (!sonuc) throw new KullaniciHatasi("Kart test sonucunu göndermedi. Kartı çıkarıp tekrar takın ve yeniden deneyin.");
      adim("test", "tamam");
    }

    adim("sonuc", "tamam");
    sonSonuc = { r: sonuc, etiket };
    sonucGoster(sonuc, etiket);
    if (sonuc.sonuc !== "DUZENEK_UYUMSUZ") listeyeEkle(sonuc, etiket);
    if (sonuc.sonuc === "DUZENEK_UYUMSUZ" || sonuc.sonuc === "DUZENEK_YOK") asama("pin", "hata");
    else asama("pin", sonuc.sonuc === "SAGLAM" ? "tamam" : "uyari");
    if (!$("parca-kap").hidden) asama("parca", "aktif");
    else if (sonuc.sonuc !== "DUZENEK_UYUMSUZ") asama("rapor", "tamam");
    mesaj(sonucMesaji(sonuc));
    $("btn-tekrar").hidden = false;
  } catch (e) {
    hataGoster(e);
  } finally {
    $("port-istek").hidden = true;
    calisiyor = false;
    butonlar(true);
  }
}

function hataGoster(e) {
  log("HATA: " + (e && e.stack ? e.stack : e));
  const aktifAsama = document.querySelector("#asamalar li.aktif");
  if (aktifAsama) aktifAsama.className = "hata";
  const aktif = document.querySelector("#adimlar li.aktif");
  if (aktif) aktif.className = "hata";
  ilerleme(null);
  const m = (e && e.message) || String(e);
  let metin;
  if (e instanceof KullaniciHatasi) metin = m;
  else if (/Failed to open|in use|already open|Access denied/i.test(m)) {
    metin = "Port açılamadı. Deneyap Kart IDE'nin Seri Monitörü ya da başka bir program portu kullanıyor olabilir; kapatıp tekrar deneyin.";
  } else if (/connect|sync|Timeout|timed out/i.test(m)) {
    metin = "Karta bağlanılamadı. Karttaki BUT düğmesini basılı tutun, RESET'e basıp bırakın, BUT'u bırakın ve tekrar deneyin.";
  } else if (/disconnect|device has been lost|lost/i.test(m)) {
    metin = "Kart bağlantısı koptu. USB kablosunu kontrol edip tekrar deneyin.";
  } else {
    metin = "Beklenmeyen hata: " + m;
  }
  mesaj(metin, true);
}

// ------------------------------------------------------------------ sonuç ekranı

function sonucGoster(r, etiket) {
  const model = modelBul(r.model);
  const gerekli = r.duzenek || model?.duzenek || AILE_DUZENEK[r.aile];
  const s = SONUC[r.sonuc] || { ad: r.sonuc, sinif: "kontrol" };
  const karar = $("karar");
  karar.className = "karar " + s.sinif;
  $("karar-baslik").textContent = s.ad;
  $("karar-alt").textContent = r.sonuc === "DUZENEK_UYUMSUZ" ? "Pinlere dokunulmadı"
    : r.toplam ? `${r.toplam - r.sorunlu} / ${r.toplam} pin sağlam` : "";
  $("s-model").textContent = r.model || "–";
  $("s-kimlik").textContent = r.kimlik || "–";
  $("s-etiket").textContent = etiket || "–";
  $("s-surum").textContent = r.surum || "–";

  let html = "";
  if (r.sonuc === "DUZENEK_UYUMSUZ") {
    const d = DUZENEKLER[gerekli];
    html = `<div class="not uyari"><b>Bu kart ${kacis(d ? d.ad : gerekli)} düzeneği ister.</b> Şu an ` +
      `${kacis(DUZENEKLER[duzenek].ad)} düzeneği seçili. Yanlış düzenekte bazı jumper'lar pinleri güç hattına ` +
      `bağlayabileceği için kart test edilmedi. Breadboard'u aşağıdaki şemaya göre kurun, sonra tekrar test edin.` +
      (d ? ` <button type="button" class="baglanti-buton" data-duzenek="${gerekli}">${kacis(d.ad)} düzeneğini seç</button>` : "") + `</div>`;
  } else if (r.sonuc === "DUZENEK_YOK") {
    html = `<div class="not uyari">Hiçbir grup sinyal geçirmedi. Kartın breadboard'a tam oturduğunu ve jumper'ların ` +
      `şemadaki deliklerde olduğunu kontrol edin. Düzenek doğruysa sağlam olduğunu bildiğiniz bir kartı test edin: ` +
      `o kart geçiyorsa bu kartın pinleri çalışmıyor demektir.</div>`;
  } else {
    const sorunlar = r.pinler.filter((p) => p.kod !== "OK");
    if (sorunlar.length || r.kisa.length) {
      html = `<ul class="sorunlar">` +
        sorunlar.map((p) => `<li><span class="rozet bozuk">${kacis(p.ad)}</span>${kacis(p.aciklama)}</li>`).join("") +
        r.kisa.map((k) => `<li><span class="rozet bozuk">Kısa devre</span>${kacis(k.a)} ile ${kacis(k.b)} arasında (${kacis(k.pin)})</li>`).join("") +
        `</ul><p class="ipucu">Emin olmak için: aynı düzenekte sağlam olduğunu bildiğiniz bir kartı test edin. O da aynı pinlerde hata verirse sorun jumper'dadır.</p>`;
    }
  }
  $("sorun-listesi").innerHTML = html;
  $("sorun-listesi").querySelector("[data-duzenek]")?.addEventListener("click", (ev) => duzenekSec(ev.target.dataset.duzenek));

  const durumlar = {};
  for (const p of [...r.pinler, ...r.atlanan]) durumlar[p.ad] = p;
  if (r.sonuc !== "DUZENEK_UYUMSUZ" && model && DUZENEKLER[model.duzenek]) {
    $("sonuc-kart").innerHTML = kartSemasi(model.duzenek, model.etiket, durumlar);
    $("sonuc-kart-kap").hidden = false;
  } else {
    $("sonuc-kart-kap").hidden = true;
  }
  $("karar-parca").hidden = true;
  parcaHazirla(r);
  $("sonuc").hidden = false;
  $("sonuc").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ------------------------------------------------------------------ kart şeması (SVG)

// durumlar verilirse pinler test sonucuna göre, verilmezse jumper grubuna göre boyanır.
function kartSemasi(duzenekAdi, etiketAdi, durumlar = null) {
  const et = ETIKETLER[etiketAdi];
  const konum = konumlar(duzenekAdi);
  const n = Math.max(et.sol.length, et.sag.length);
  const adimY = 24, ustY = 70, solX = 46, sagX = 254, gen = 300;
  const yuk = ustY + (n - 1) * adimY + 64;
  const renk = { ok: "var(--ok)", bozuk: "var(--bozuk)", kontrol: "var(--kontrol)", atla: "var(--atla)" };

  let s = `<svg viewBox="0 0 ${gen} ${yuk}" width="${gen}" height="${yuk}" role="img" aria-label="Kart pin şeması" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect x="16" y="10" width="${gen - 32}" height="${yuk - 20}" rx="14" class="sema-kart"/>`;
  s += `<rect x="${gen / 2 - 54}" y="22" width="108" height="30" rx="6" class="sema-modul"/>`;
  s += `<text x="${gen / 2}" y="41" text-anchor="middle" class="sema-yazi">anten</text>`;
  s += `<rect x="${gen / 2 - 20}" y="${yuk - 30}" width="40" height="20" rx="4" class="sema-usb"/>`;
  s += `<text x="${gen / 2}" y="${yuk - 36}" text-anchor="middle" class="sema-yazi">USB</text>`;

  const pin = (ad, taraf, satir) => {
    const x = taraf === "L" ? solX : sagX;
    const y = ustY + (satir - 1) * adimY;
    const k = konum[`${taraf}${satir}`];
    let daire, yazi = "", kalin = false;
    if (durumlar) {
      const d = durumlar[ad];
      if (d) {
        const sinif = KOD_SINIF[d.kod] || "kontrol";
        daire = `<circle cx="${x}" cy="${y}" r="8" fill="${renk[sinif]}"><title>${kacis(ad)}: ${kacis(d.aciklama)}</title></circle>`;
        kalin = sinif === "bozuk" || sinif === "kontrol";
      } else {
        daire = `<circle cx="${x}" cy="${y}" r="5" class="sema-bos"/>`;
      }
    } else if (k) {
      daire = `<circle cx="${x}" cy="${y}" r="9" fill="${GRUP_RENKLERI[k.grup]}"/>`;
      yazi = `<text x="${x}" y="${y + 4}" text-anchor="middle" class="sema-no">${k.grup + 1}</text>`;
      kalin = true;
    } else {
      daire = `<circle cx="${x}" cy="${y}" r="5" class="sema-bos"/>`;
    }
    const tx = taraf === "L" ? x + 16 : x - 16;
    const sinif = kalin ? "sema-ad kalin" : (durumlar && !durumlar[ad]) || (!durumlar && !k) ? "sema-ad soluk" : "sema-ad";
    return daire + yazi + `<text x="${tx}" y="${y + 4}" text-anchor="${taraf === "L" ? "start" : "end"}" class="${sinif}">${kacis(ad)}</text>`;
  };
  et.sol.forEach((ad, i) => (s += pin(ad, "L", i + 1)));
  et.sag.forEach((ad, i) => (s += pin(ad, "R", i + 1)));
  return s + "</svg>";
}

// ------------------------------------------------------------------ düzenek bölümü

function delik(taraf, satir) { return (taraf === "L" ? "a" : "j") + satir; }

function duzenekCiz() {
  const d = DUZENEKLER[duzenek];
  if (!semaEtiketi || !d.etiketSecenekleri.some(([k]) => k === semaEtiketi)) semaEtiketi = d.etiketSecenekleri[0][0];
  const et = ETIKETLER[semaEtiketi];

  document.querySelectorAll("#duzenek-secim button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.duzenek === duzenek)));
  $("duzenek-modeller").textContent = d.modeller;
  $("duzenek-yerlesim").innerHTML = d.yerlesim;
  const toplam = d.gruplar.reduce((a, g) => a + g.pinler.length, 0);
  $("jumper-sayisi").textContent = toplam;

  $("etiket-secim").innerHTML = d.etiketSecenekleri.length > 1
    ? d.etiketSecenekleri.map(([k, ad]) => `<button type="button" class="cip" data-etiket="${k}" aria-pressed="${k === semaEtiketi}">${ad}</button>`).join("")
    : "";
  $("etiket-secim").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { semaEtiketi = b.dataset.etiket; duzenekCiz(); }));

  $("duzenek-sema").innerHTML = kartSemasi(duzenek, semaEtiketi);

  $("kablo-listesi").innerHTML = d.gruplar.map((g, gi) => {
    const sutunlar = g.yari === "sol" ? "abcde" : "fghij";
    const satirlar = g.pinler.map(([t, n], i) => {
      const ad = (t === "L" ? et.sol : et.sag)[n - 1];
      return `<tr><td><b>${kacis(ad)}</b></td><td>${delik(t, n)}</td><td>→</td><td>${sutunlar[i]}${g.satir}</td></tr>`;
    }).join("");
    return `<div class="grup-kart" style="--grup:${GRUP_RENKLERI[gi]}">
      <div class="grup-baslik"><span class="grup-nokta"></span>Grup ${gi + 1}<span class="grup-satir">${g.satir}. satır · ${g.yari === "sol" ? "sol yarı (a–e)" : "sağ yarı (f–j)"}</span></div>
      <table><tbody>${satirlar}</tbody></table></div>`;
  }).join("");

  const bos = [];
  const dolu = new Set(d.gruplar.map((g) => g.satir));
  for (let r = Math.min(...dolu); r <= Math.max(...dolu); r++) if (!dolu.has(r)) bos.push(r);
  $("bos-satirlar").textContent = bos.length ? bos.join(", ") : "–";
}

function duzenekSec(ad) {
  if (!DUZENEKLER[ad] || calisiyor) return;
  duzenek = ad;
  depoYaz(DUZENEK_ANAHTARI, ad);
  semaEtiketi = null;
  duzenekCiz();
  $("duzenek-bolum").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ------------------------------------------------------------------ desteklenen kartlar

function modelleriCiz() {
  $("model-izgara").innerHTML = MODELLER.map((m) => `
    <div class="model-kart">
      <div class="model-ad">${kacis(m.ad)}</div>
      <div class="model-bilgi">${m.islemci} · ${m.usb}</div>
      <div class="model-bilgi">${kacis(PARCALAR[m.ad]?.liste || "")}</div>
      <div class="model-rozetler">
        <span class="rozet">${kacis(DUZENEKLER[m.duzenek].ad)} düzeneği</span>
        ${m.denendi ? '<span class="rozet ok">Kartla denendi</span>' : '<span class="rozet soluk">Henüz kartla denenmedi</span>'}
        ${m.satista ? "" : '<span class="rozet soluk">Satıştan kalktı</span>'}
      </div>
    </div>`).join("");
}

// ------------------------------------------------------------------ test listesi

function listeOku() {
  try { return JSON.parse(localStorage.getItem(LISTE_ANAHTARI) || "[]"); } catch (e) { return []; }
}

function listeKaydet() { depoYaz(LISTE_ANAHTARI, JSON.stringify(liste)); }

function listeyeEkle(r, etiket) {
  const kayit = {
    zaman: new Date().toISOString(),
    etiket,
    model: r.model,
    kimlik: r.kimlik,
    sonuc: r.sonuc,
    sorunlu: r.pinler.filter((p) => p.kod !== "OK").map((p) => `${p.ad} (${p.aciklama})`),
    kisa: r.kisa.map((k) => `${k.a}-${k.b} (${k.pin})`),
    surum: r.surum,
  };
  const son = liste[liste.length - 1];
  if (son && son.kimlik && son.kimlik === kayit.kimlik) liste[liste.length - 1] = kayit; // aynı kart tekrar test edildi
  else liste.push(kayit);
  listeKaydet();
  listeCiz();
}

function listeCiz() {
  const saglam = liste.filter((k) => k.sonuc === "SAGLAM").length;
  const bozuk = liste.filter((k) => k.sonuc === "BOZUK").length;
  $("say-toplam").textContent = liste.length;
  $("say-saglam").textContent = saglam;
  $("say-bozuk").textContent = bozuk;
  $("liste-bos").hidden = liste.length > 0;
  $("liste-tablo").hidden = liste.length === 0;
  $("liste-govde").innerHTML = liste.map((k, i) => ({ k, i })).reverse().map(({ k, i }) => {
    const saat = new Date(k.zaman).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const sorunlar = [...k.sorunlu, ...k.kisa.map((x) => "Kısa devre " + x)].join(", ");
    const s = SONUC[k.sonuc] || { ad: k.sonuc, sinif: "kontrol" };
    return `<tr><td>${i + 1}</td><td>${saat}</td><td>${kacis(k.etiket || "–")}</td><td>${kacis(k.model)}</td>` +
      `<td class="kod">${kacis(k.kimlik)}</td><td><span class="rozet ${s.sinif}">${kacis(s.ad)}</span></td>` +
      `<td class="sorunlu">${kacis(sorunlar || "–")}</td><td class="sorunlu">${kacis(parcaOzeti(k))}</td></tr>`;
  }).join("");
}

function csvIndir() {
  if (!liste.length) { mesaj("İndirilecek kayıt yok."); return; }
  const basliklar = ["Sıra", "Tarih", "Saat", "Etiket", "Model", "Kart kimliği", "Sonuç", "Sorunlu pinler", "Kısa devre", "Parçalar", "Test yazılımı"];
  const satirlar = liste.map((k, i) => {
    const t = new Date(k.zaman);
    return [i + 1, t.toLocaleDateString("tr-TR"), t.toLocaleTimeString("tr-TR"), k.etiket, k.model, k.kimlik,
      (SONUC[k.sonuc] || { ad: k.sonuc }).ad, k.sorunlu.join(", "), k.kisa.join(", "), parcaOzeti(k), k.surum];
  });
  const hucre = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [basliklar, ...satirlar].map((s) => s.map(hucre).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `deneyap-pin-test-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ------------------------------------------------------------------ parça testleri
// Pin testinden sonra kartın üstündeki parçalar denenir. Otomatik testlerin listesini kart kendisi
// gönderir; LED, düğme ve mikrofon için kullanıcıdan yardım istenir.

const PARCA_DURUM = {
  OK: { ad: "Çalışıyor", sinif: "ok" },
  BOZUK: { ad: "Arızalı", sinif: "bozuk" },
  UYARI: { ad: "Kontrol et", sinif: "kontrol" },
  BILGI: { ad: "Bilgi", sinif: "soluk" },
  ATLANDI: { ad: "Atlandı", sinif: "soluk" },
};

// ad: ekrandaki adı, ok: çalışıyorsa yazılacak metin, tani: durum -> [olası sebep, ne yapmalı]
const PARCA_BILGI = {
  CIP: { ad: "İşlemci", ok: "Çalışıyor; test yazılımı yüklendi ve çalıştı." },
  FLASH: {
    ad: "Flash bellek", ok: "Beklenen boyutta; test yazılımı buradan çalışıyor.",
    tani: {
      UYARI: ["Kartın üzerindeki modül bu model için beklenenden farklı, ya da model yanlış tanındı.",
        "Kartın üstündeki model yazısına bakın. Model doğruysa kart kullanılabilir; kayda not düşün."],
      BOZUK: ["Flash çipiyle iletişim kurulamadı.", "Testi tekrarlayın. Sonuç değişmezse kartı ayırın."],
    },
  },
  PSRAM: {
    ad: "PSRAM (ek bellek)", ok: "Yazma/okuma testi geçti.",
    tani: {
      BOZUK: ["PSRAM çipi ya da modül içindeki bağlantısı arızalı (çoğunlukla düşme ya da aşırı ısınma).",
        "Kart LED, sensör ve basit Wi-Fi projelerinde kullanılabilir; kamera ve büyük bellek isteyen projelerde kullanmayın. Kartı \"PSRAM arızalı\" diye etiketleyin."],
    },
  },
  SICAKLIK: {
    ad: "Sıcaklık ölçer", ok: "Çalışıyor.",
    tani: {
      UYARI: ["İşlemcinin iç sıcaklık ölçeri olağan dışı bir değer verdi.",
        "Karta dokunun. Elle tutulamayacak kadar sıcaksa hemen USB'den çıkarın, kartta kısa devre olabilir. Değilse önemli değildir; bu ölçer hassas değildir."],
    },
  },
  WIFI: {
    ad: "Wi-Fi ve anten", ok: "Çevredeki ağları görüyor.",
    tani: {
      UYARI: ["Ortamda kablosuz ağ olmayabilir, ağlar uzak olabilir ya da anten bölgesi hasarlıdır.",
        "Telefonunuzun kişisel erişim noktasını açın ve karta 1 metre mesafede testi tekrarlayın; en güçlü ağ -60 dBm'den iyi çıkmalı. Yine olmazsa anten bölgesi (modülün uç kısmı) hasarlıdır: kart Wi-Fi ve Bluetooth istemeyen projelerde kullanılabilir."],
      BOZUK: ["Wi-Fi donanımı başlatılamadı (modül ya da RF devresi arızalı).",
        "Testi tekrarlayın. Sonuç değişmezse kart kablosuz projelerde kullanılamaz."],
    },
  },
  IMU: {
    ad: "Hareket sensörü (IMU)", ok: "Cevap veriyor.",
    tani: {
      BOZUK: ["Sensör SDA/SCL hattında cevap vermiyor: bu pinlerde kısa devre, sensörün lehimi ya da sensörün kendisi arızalı.",
        "Pin testinde SDA ve SCL'nin bulunduğu gruplara bakın; orada sorun varsa önce onu giderin. Pinler sağlamsa sensör arızalıdır; kart sensör istemeyen projelerde kullanılabilir."],
    },
  },
  IMU_OLCUM: {
    ad: "Hareket sensörü ölçümü", ok: "İvmeölçer yerçekimini, jiroskop durağanlığı doğru ölçüyor.",
    tani: {
      BOZUK: ["Sensör cevap veriyor ama ölçümü yanlış; ivmeölçer hasarlı (çoğunlukla düşme).",
        "Kartı düz bir yerde, kıpırdatmadan testi tekrarlayın. Yine geçmezse hareket sensörü isteyen projelerde kullanmayın."],
      UYARI: ["Jiroskop, kart dururken dönüş ölçtü.", "Kartı hiç kıpırdatmadan testi tekrarlayın. Tekrar ederse jiroskopta kayma var."],
    },
  },
  IMU_IVME_OZTEST: {
    ad: "İvmeölçer öz-testi", ok: "Sensörün kendi iç testi geçti.",
    tani: { BOZUK: ["Sensörün içindeki mekanik yapı hasarlı (çoğunlukla düşme).", "Testi tekrarlayın. Yine geçmezse ivmeölçer arızalıdır; kart sensör istemeyen projelerde kullanılabilir."] },
  },
  IMU_JIRO_OZTEST: {
    ad: "Jiroskop öz-testi", ok: "Sensörün kendi iç testi geçti.",
    tani: { BOZUK: ["Sensörün içindeki mekanik yapı hasarlı (çoğunlukla düşme).", "Testi tekrarlayın. Yine geçmezse jiroskop arızalıdır; kart sensör istemeyen projelerde kullanılabilir."] },
  },
  LED_R: { ad: "RGB LED – kırmızı", ok: "Yanıyor." },
  LED_G: { ad: "RGB LED – yeşil", ok: "Yanıyor." },
  LED_B: { ad: "RGB LED – mavi", ok: "Yanıyor." },
  RESET: { ad: "RESET düğmesi", ok: "Basınca kart yeniden başladı." },
  BUT: {
    ad: "BUT düğmesi", ok: "Basma ve bırakma algılandı.",
    tani: {
      BOZUK: ["Düğme basışı algılanmadı (ya da 15 saniye içinde basılmadı): düğmenin mekanizması ya da lehimi arızalı.",
        "Testi tekrarlayın, düğmeye tam ortasından basın. Yine algılanmazsa kart bu uygulamayla test ve yükleme için yine kullanılabilir, ama düğmeli projelerde kullanmayın. Düğme basılı kalıyorsa kart açılışta yükleme moduna girebilir; ayırın."],
    },
  },
  MIK: {
    ad: "Mikrofon", ok: "Sesi duyuyor.",
    tani: {
      BOZUK: ["Mikrofondan veri gelmiyor: mikrofon ya da saat/veri hattı (D12/D13) arızalı.", "Kart ses istemeyen projelerde kullanılabilir."],
      UYARI: ["Mikrofon veri gönderiyor ama el çırpma sesi duyulmadı.",
        "Kartın 10-20 cm yakınında daha yüksek sesle el çırparak testi tekrarlayın. Mikrofonun ses deliği tıkalı olmasın."],
    },
  },
};

const LED_TANI = {
  ws: ["LED'in bu rengi yanmıyor: LED'in o bölümü arızalı.",
    "Kart LED kullanmayan projelerde sorunsuz kullanılabilir. Onarım için LED değiştirilmeli (lehim gerektirir)."],
  wsHepsi: ["LED hiç yanmıyor: LED'in veri hattı ya da beslemesi kopuk, ya da LED tamamen arızalı.",
    "Kart LED kullanmayan projelerde sorunsuz kullanılabilir. Onarım için LED değiştirilmeli (lehim gerektirir)."],
  ayrik: ["LED'in bu renk bacağı ya da önündeki direnç arızalı.", "Kart LED kullanmayan projelerde sorunsuz kullanılabilir."],
};

const RENK_AD = { r: "kırmızı", g: "yeşil", b: "mavi" };

let parcaSonuclari = [];

function parcaSatirCiz() {
  $("parca-liste").innerHTML = parcaSonuclari.map((s) => {
    const bilgi = PARCA_BILGI[s.kod] || { ad: s.kod };
    const d = PARCA_DURUM[s.durum] || PARCA_DURUM.BILGI;
    const metin = s.durum === "OK" ? (bilgi.ok || "") : (s.metin || "");
    const tani = s.tani || bilgi.tani?.[s.durum];
    return `<li class="parca-satir"><div class="parca-ust"><span class="rozet ${d.sinif}">${d.ad}</span>` +
      `<span class="parca-ad">${kacis(bilgi.ad)}</span>` +
      (s.deger ? `<span class="parca-olcum">${kacis(olcumTr(s.deger))}</span>` : "") + `</div>` +
      (metin ? `<p class="parca-metin">${kacis(metin)}</p>` : "") +
      (tani && s.durum !== "OK" ? `<div class="tani"><p><b>Olası sebep:</b> ${kacis(tani[0])}</p><p><b>Ne yapmalı:</b> ${kacis(tani[1])}</p></div>` : "") +
      `</li>`;
  }).join("");
}

// Gerçek kartta henüz doğrulanmamış testler: "arızalı" yerine en fazla "kontrol et" denir.
const DOGRULANMAMIS = new Set(["MIK"]);   // IMU testleri Deneyap Kart v2 ile doğrulandı (2026-11-14)

function parcaEkle(kod, durum, metin, deger, tani) {
  if (DOGRULANMAMIS.has(kod) && durum === "BOZUK") {
    durum = "UYARI";
    metin = `${metin || ""} Bu test henüz gerçek kartla doğrulanmadı; testi tekrarlayarak teyit edin.`.trim();
    tani = tani || PARCA_BILGI[kod]?.tani?.BOZUK;
  }
  parcaSonuclari.push({ kod, durum, metin, deger, tani });
  parcaSatirCiz();
}

// Kullanıcıya soru sorar; seçilen düğmenin anahtarıyla çözülür. secenekler: [[anahtar, yazı, sınıf]]
function parcaSor(metin, secenekler) {
  return new Promise((coz) => {
    $("parca-soru-metin").textContent = metin;
    $("parca-soru-butonlar").innerHTML = secenekler.map(([k, y, c]) =>
      `<button type="button" class="${c || "ikincil-buton kucuk"}" data-k="${k}">${kacis(y)}</button>`).join("");
    $("parca-soru").hidden = false;
    $("parca-soru-butonlar").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      $("parca-soru").hidden = true;
      coz(b.dataset.k);
    }));
  });
}

function parcaBilgi(metin) {
  $("parca-soru-metin").textContent = metin;
  $("parca-soru-butonlar").innerHTML = "";
  $("parca-soru").hidden = !metin;
}

class KartSifirlandi extends Error {}

// ESP32 açılış (ROM) satırları: CP210x'li kartlarda RESET'e basılınca seri porttan gelir.
const ACILIS_SATIRI = /^ets [A-Z][a-z]{2} +\d+ \d{4}|^rst:0x[0-9a-f]+/;

// blokBekle gibi, ama kart yeniden başlarsa (RESET) hemen KartSifirlandi fırlatır.
async function parcaBekle(ok, baslangic, sure) {
  const t0 = Date.now();
  let basla = -1;
  while (Date.now() - t0 < sure) {
    if (ok.koptu) throw new KartSifirlandi("bağlantı koptu");
    const s = ok.satirlar;
    for (let k = baslangic; k < s.length; k++) {
      if (ACILIS_SATIRI.test(s[k])) throw new KartSifirlandi("kart yeniden başladı");
      if (basla < 0 && s[k].startsWith("DPT;BASLA;")) basla = k;
      if (basla >= 0 && s[k] === "DPT;BITTI") return s.slice(basla, k + 1);
    }
    await bekle(40);
  }
  return null;
}

async function parcaYenidenBaglan(eski) {
  try { await eski.kapat(); } catch (e) {}
  await bekle(1500);
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const port = await guncelPort(sonPort, 3000);
    const ok = new SeriOkuyucu(port);
    try {
      await ok.ac();
      sonPort = port;
      await bekle(usbTuru(port) === "tinyusb" ? 1200 : 800);
      return ok;
    } catch (e) {
      try { await ok.kapat(); } catch (e2) {}
      await bekle(700);
    }
  }
  throw new KullaniciHatasi("Kart yeniden başladıktan sonra bağlantı kurulamadı. Kartı çıkarıp takın ve parça testlerini yeniden başlatın.");
}

async function parcaKomut(ok, komut, sure) {
  const idx = ok.satirlar.length;
  await ok.yaz(komut + "\n");
  const blok = await parcaBekle(ok, idx, sure);
  if (!blok) throw new KullaniciHatasi("Kart parça testine cevap vermedi. Kartı çıkarıp takın ve pin testinden başlayın.");
  const r = blokCoz(blok);
  if (r.sonuc === "DUZENEK_UYUMSUZ") throw new KullaniciHatasi("Kart bu düzeneğe uymuyor; parça testi yapılmadı.");
  return r;
}

function parcaHazirla(r) {
  const p = PARCALAR[r.model];
  const kap = $("parca-kap");
  if (!p || r.sonuc === "DUZENEK_UYUMSUZ" || !r.surum || r.surum < "1.3.0") { kap.hidden = true; return; }
  parcaSonuclari = [];
  parcaSatirCiz();
  parcaBilgi("");
  $("parca-aciklama").textContent = `Bu modelde denenecek parçalar: ${p.liste}. Otomatik testlerden sonra LED ve düğme için sizden yardım istenir.`;
  $("btn-parca").disabled = false;
  $("btn-parca").textContent = "Parça testlerini başlat";
  kap.hidden = false;
}

async function parcaTestEt() {
  if (calisiyor || !sonSonuc || !sonPort) return;
  const model = sonSonuc.r.model;
  const p = PARCALAR[model];
  if (!p) return;
  calisiyor = true;
  butonlar(false);
  $("btn-parca").disabled = true;
  asama("parca", "aktif");
  asama("rapor", "");
  parcaSonuclari = [];
  parcaSatirCiz();
  let ok = null;
  let akis = null;
  try {
    const port = await guncelPort(sonPort, 3000);
    sonPort = port;
    ok = new SeriOkuyucu(port);
    await ok.ac();
    await bekle(usbTuru(port) === "tinyusb" ? 600 : 300);

    // 1) otomatik testler
    parcaBilgi("Otomatik testler yapılıyor: işlemci, bellek, sensörler ve Wi-Fi taraması (10-20 saniye)…");
    const oto = await parcaKomut(ok, `B:${duzenek}:oto`, 40000);
    for (const b of oto.bilesenler) parcaEkle(b.kod, b.durum, tr(b.aciklama), b.deger);

    // 2) RGB LED
    const ledCevap = {};
    for (const c of ["r", "g", "b"]) {
      const renk = RENK_AD[c];
      if (p.led === "kart" && c === "r") {
        await parcaKomut(ok, `B:${duzenek}:led:r`, 5000);
        akis = setInterval(() => { ok.yaz("\0".repeat(64)).catch(() => {}); }, 15);
      } else if (p.led === "kart" && c === "g") {
        await parcaKomut(ok, `B:${duzenek}:led:g`, 5000);
      } else {
        await parcaKomut(ok, `B:${duzenek}:led:${c}`, 5000);
      }
      const yanip = p.led === "ayrik" || (p.led === "kart" && c === "b");
      const soru = p.led === "kart" && c !== "b"
        ? `Karttaki RGB LED şu an ${renk} yanıyor mu? (Birkaç saniye sürer, soluk olabilir.)`
        : `Karttaki RGB LED şu an ${renk} ${yanip ? "yanıp sönüyor" : "yanıyor"} mu?`;
      const t0 = Date.now();
      ledCevap[c] = await parcaSor(soru, [["e", "Evet", "ana-buton kucuk"], ["h", "Hayır"]]);
      if (akis) { clearInterval(akis); akis = null; }
      if (p.led === "kart" && c === "g") await bekle(Math.max(0, 4500 - (Date.now() - t0)));   // kartın veri akışı bitsin
    }
    await parcaKomut(ok, `B:${duzenek}:led:0`, 5000);
    const yanmayan = Object.values(ledCevap).filter((x) => x === "h").length;
    for (const c of ["r", "g", "b"]) {
      const iyi = ledCevap[c] === "e";
      const tani = iyi ? null : (yanmayan === 3 && p.led === "ws" ? LED_TANI.wsHepsi : (p.led === "ws" ? LED_TANI.ws : LED_TANI.ayrik));
      parcaEkle(`LED_${c.toUpperCase()}`, iyi ? "OK" : "BOZUK", iyi ? "" : `${RENK_AD[c][0].toUpperCase() + RENK_AD[c].slice(1)} renk görülmedi.`, "", tani);
    }

    // 3) BUT düğmesi. RESET'e basılırsa kart yeniden başlar: bu BUT arızası değildir.
    let butSonuc = null;
    let resetGoruldu = false;
    for (let deneme = 0; deneme < 5 && !butSonuc; deneme++) {
      parcaBilgi(resetGoruldu
        ? "Şimdi kartın üzerinde BUT yazan düğmeye bir kez basıp bırakın (RESET'e değil)."
        : "Şimdi kartın üzerinde BUT yazan düğmeye bir kez basıp bırakın (15 saniye içinde). RESET düğmesine basmayın.");
      try {
        const but = await parcaKomut(ok, `B:${duzenek}:but`, 20000);
        const b = but.bilesenler.find((x) => x.kod === "BUT") || { kod: "BUT", durum: "UYARI", aciklama: "Kart sonuç göndermedi", deger: "" };
        if (b.durum === "BOZUK" && /basilmadi/.test(b.aciklama)) {
          const c = await parcaSor("15 saniye içinde düğme basışı algılanmadı. BUT düğmesine bastınız mı?",
            [["t", "Tekrar dene", "ana-buton kucuk"], ["b", "Bastım, algılanmadı"], ["a", "Atla"]]);
          if (c === "t") continue;
          butSonuc = c === "a" ? { kod: "BUT", durum: "ATLANDI", aciklama: "BUT testi atlandı.", deger: "" }
            : { ...b, aciklama: "Düğmeye basıldı ama kart basışı algılamadı" };
        } else {
          butSonuc = b;
        }
      } catch (e) {
        if (!(e instanceof KartSifirlandi)) throw e;
        if (!resetGoruldu) {
          resetGoruldu = true;
          parcaEkle("RESET", "OK", "", "");
        }
        parcaBilgi("Kart yeniden başladı: RESET düğmesine basıldı. Bağlantı yeniden kuruluyor…");
        ok = await parcaYenidenBaglan(ok);
      }
    }
    parcaBilgi("");
    if (!butSonuc) butSonuc = { kod: "BUT", durum: "ATLANDI", aciklama: "BUT testi tamamlanamadı.", deger: "" };
    parcaEkle(butSonuc.kod, butSonuc.durum, tr(butSonuc.aciklama), butSonuc.deger);

    // 4) mikrofon (Deneyap Kart)
    if (p.mik) {
      const c = await parcaSor("Mikrofon testi: \"Başlat\"a basın, 1 saniye sonra karta 10-20 cm yakından 2-3 kez el çırpın.",
        [["b", "Başlat", "ana-buton kucuk"], ["a", "Atla"]]);
      if (c === "b") {
        parcaBilgi("Dinleniyor… Şimdi el çırpın.");
        const mik = await parcaKomut(ok, `B:${duzenek}:mik`, 9000);
        parcaBilgi("");
        for (const b of mik.bilesenler) parcaEkle(b.kod, b.durum, tr(b.aciklama), b.deger);
      } else {
        parcaEkle("MIK", "ATLANDI", "Mikrofon testi atlandı.", "");
      }
    }

    const sorunlu = parcaSonuclari.filter((s) => s.durum === "BOZUK" || s.durum === "UYARI");
    parcaBilgi(sorunlu.length ? `Parça testi bitti: ${sorunlu.length} parçada sorun ya da uyarı var. Ayrıntılar aşağıda.` : "Parça testi bitti: bütün parçalar çalışıyor.");
    listeyeParcaEkle(sonSonuc.r.kimlik, parcaSonuclari);
    asama("parca", sorunlu.length ? "uyari" : "tamam");
    asama("rapor", "tamam");
    const kp = $("karar-parca");
    const arizali = parcaSonuclari.filter((x) => x.durum === "BOZUK").length;
    const uyari = parcaSonuclari.filter((x) => x.durum === "UYARI").length;
    kp.textContent = arizali ? `Parçalar: ${arizali} arızalı${uyari ? `, ${uyari} uyarı` : ""}`
      : uyari ? `Parçalar: ${uyari} uyarı, diğerleri çalışıyor` : "Parçalar: hepsi çalışıyor";
    kp.hidden = false;
    if (arizali && sonSonuc.r.sonuc === "SAGLAM") {        // pinler sağlam ama bir parça arızalı
      $("karar").className = "karar kontrol";
      $("karar-baslik").textContent = "KISMEN SAĞLAM";
    }
  } catch (e) {
    parcaBilgi("");
    if (e instanceof KartSifirlandi) {
      e = new KullaniciHatasi("Kart parça testi sırasında yeniden başladı (RESET'e basılmış ya da USB bağlantısı kopmuş olabilir). Parça testlerini yeniden başlatın.");
    }
    hataGoster(e);
  } finally {
    if (akis) clearInterval(akis);
    if (ok) await ok.kapat();
    calisiyor = false;
    butonlar(true);
    $("btn-parca").disabled = false;
    $("btn-parca").textContent = "Parça testlerini tekrarla";
  }
}

function listeyeParcaEkle(kimlik, sonuclar) {
  const k = [...liste].reverse().find((x) => x.kimlik === kimlik);
  if (!k) return;
  k.parcalar = sonuclar.map((s) => ({ kod: s.kod, durum: s.durum }));
  listeKaydet();
  listeCiz();
}

function parcaOzeti(k) {
  if (!k.parcalar) return "–";
  const sorun = k.parcalar.filter((s) => s.durum === "BOZUK" || s.durum === "UYARI");
  if (!sorun.length) return "Hepsi çalışıyor";
  return sorun.map((s) => `${(PARCA_BILGI[s.kod] || { ad: s.kod }).ad} (${PARCA_DURUM[s.durum].ad.toLowerCase()})`).join(", ");
}

// ------------------------------------------------------------------ başlangıç

async function baslat() {
  if (!DUZENEKLER[duzenek]) duzenek = "kart";
  document.querySelectorAll("#duzenek-secim button").forEach((b) => b.addEventListener("click", () => duzenekSec(b.dataset.duzenek)));
  duzenekCiz();
  modelleriCiz();
  listeCiz();
  asama("hazirlik", "aktif");

  $("btn-test").addEventListener("click", () => testEt(false));
  $("btn-tekrar").addEventListener("click", () => testEt(true));
  $("btn-parca").addEventListener("click", parcaTestEt);
  $("btn-csv").addEventListener("click", csvIndir);
  $("btn-temizle").addEventListener("click", () => {
    if (!liste.length) return;
    if (confirm("Test listesindeki tüm kayıtlar silinsin mi? (Önce Excel'e indirmeniz önerilir.)")) {
      liste = [];
      listeKaydet();
      listeCiz();
    }
  });

  if (!("serial" in navigator)) {
    $("destek-uyari").hidden = false;
    $("btn-test").disabled = true;
    return;
  }

  navigator.serial.addEventListener("disconnect", (e) => {
    if (e.target === sonPort && !calisiyor) {
      sonPort = null;
      $("btn-tekrar").hidden = true;
    }
  });

  try {
    const yanit = await fetch("firmware/manifest.json", { cache: "no-cache" });
    manifest = await yanit.json();
    $("fw-surum").textContent = manifest.surum;
  } catch (e) {
    mesaj("Uygulama dosyaları yüklenemedi. Sayfayı yenileyin.", true);
    $("btn-test").disabled = true;
  }
}

baslat();
