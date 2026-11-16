// Deneyap Pin Test - tarayıcıdan bağımsız çekirdek: kart bilgileri, düzenekler ve test sonucunu çözme.
export const ESPRESSIF = 0x303a;

// ------------------------------------------------------------------ kart ve düzenek bilgileri
// Pin sıraları Deneyap'ın resmî pin diyagramlarından alınmıştır (docs.deneyapkart.org).
// Kart üstten görünür: USB aşağıda (sana bakar), pinler yukarıdan aşağıya.

export const ETIKETLER = {
  kart1: {
    sol: ["EN", "A0", "A1", "A2", "A3", "A4", "A5", "DAC1", "DAC2", "D15", "D14", "D13", "D12", "VBAT", "5V", "GND"],
    sag: ["GND", "D0", "D1", "TX", "RX", "D4", "SCK", "MISO", "MOSI", "D8", "D9", "SDA", "SCL", "3V3", "3V3", "GND"],
  },
  kartv2: {
    sol: ["EN", "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "D15", "D14", "D13", "D12", "BAT", "5V", "GND"],
    sag: ["GND", "D0", "D1", "TX", "RX", "D4", "D5", "D6", "D7", "D8", "D9", "SDA", "SCL", "3V3", "3V3", "GND"],
  },
  kart1av2: {
    sol: ["EN", "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "D14", "D13", "D12", "3V3", "BAT", "5V", "GND"],
    sag: ["GND", "D0", "D1", "TX", "RX", "D4", "SCK", "MISO", "MOSI", "D8", "D9", "SDA", "SCL", "3V3", "3V3", "GND"],
  },
  miniv2: {
    sol: ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "DA0", "DA1", "D10", "D9", "GND", "3V3", "5V"],
    sag: ["EN", "RX", "TX", "D2", "D3", "MO", "MI", "MC", "SC", "SD", "3V3", "GND"],
  },
  mini: {
    sol: ["BT", "A0", "A1", "A2", "A3", "A4", "A5", "A6", "DA0", "DA1", "D10", "D9", "GND", "3V3", "5V"],
    sag: ["EN", "RX", "TX", "D2", "D3", "MO", "MI", "MC", "SC", "SD", "3V3", "GND"],
  },
  g: {
    sol: ["A0", "A1", "SCL", "A2", "A3", "A4", "A5", "D5", "SDA"],
    sag: ["RX", "TX", "D2", "D3", "BAT", "GND", "GND", "3V3", "3V3"],
  },
};

export const MODELLER = [
  { ad: "Deneyap Kart", islemci: "ESP32", usb: "Mikro-B", duzenek: "kart", etiket: "kart1", satista: false, denendi: true },
  { ad: "Deneyap Kart 1A", islemci: "ESP32", usb: "Mikro-B", duzenek: "kart", etiket: "kart1", satista: true, denendi: true },
  { ad: "Deneyap Kart v2", islemci: "ESP32-S3", usb: "Type-C", duzenek: "kart", etiket: "kartv2", satista: true, denendi: true },
  { ad: "Deneyap Kart 1A v2", islemci: "ESP32-S3", usb: "Type-C", duzenek: "kart", etiket: "kart1av2", satista: true, denendi: false },
  { ad: "Deneyap Mini", islemci: "ESP32-S2", usb: "Mikro-B", duzenek: "mini", etiket: "mini", satista: true, denendi: false },
  { ad: "Deneyap Mini v2", islemci: "ESP32-S2", usb: "Type-C", duzenek: "mini", etiket: "miniv2", satista: true, denendi: false },
  { ad: "Deneyap Kart G", islemci: "ESP32-C3", usb: "Type-C", duzenek: "g", etiket: "g", satista: true, denendi: false },
];
export const modelBul = (ad) => MODELLER.find((m) => m.ad === ad);

export const GRUP_RENKLERI = ["#2f6fde", "#e07b00", "#1f9d55", "#8e44ad", "#0f9aa8", "#d63384"];

// Her grup: toplama satırı, breadboard'un hangi yarısı ve pin konumları (["L"|"R", satır]).
export const DUZENEKLER = {
  kart: {
    ad: "Kart",
    modeller: "Deneyap Kart · 1A · v2 · 1A v2",
    etiketSecenekleri: [["kart1", "Kart / 1A"], ["kartv2", "v2"], ["kart1av2", "1A v2"]],
    yerlesim: "Kartın sol üst pini (EN) <b>b1</b>'e, sağ üst pini (GND) <b>i1</b>'e gelsin.",
    gruplar: [
      { satir: 40, yari: "sag", pinler: [["R", 2], ["R", 3], ["R", 12]] },
      { satir: 42, yari: "sag", pinler: [["R", 6], ["R", 7], ["R", 13]] },
      { satir: 44, yari: "sol", pinler: [["R", 8], ["R", 9], ["L", 11]] },
      { satir: 46, yari: "sol", pinler: [["L", 6], ["L", 7], ["L", 10], ["L", 12], ["R", 11]] },
      { satir: 48, yari: "sol", pinler: [["L", 2], ["L", 3], ["L", 8]] },
      { satir: 50, yari: "sol", pinler: [["L", 4], ["L", 5], ["L", 9]] },
    ],
  },
  mini: {
    ad: "Mini",
    modeller: "Deneyap Mini · Mini v2",
    etiketSecenekleri: [["miniv2", "Mini v2"], ["mini", "Mini"]],
    yerlesim: "Kartın sol üst pini (Mini v2'de A0, Mini'de BT) <b>b1</b>'e, sağ üst pini (EN) <b>i1</b>'e gelsin.",
    gruplar: [
      { satir: 40, yari: "sol", pinler: [["L", 2], ["L", 6], ["L", 10], ["R", 4], ["R", 8]] },
      { satir: 42, yari: "sol", pinler: [["L", 3], ["L", 7], ["L", 11], ["R", 5], ["R", 9]] },
      { satir: 44, yari: "sol", pinler: [["L", 4], ["L", 8], ["R", 2], ["R", 6], ["R", 10]] },
      { satir: 46, yari: "sol", pinler: [["L", 5], ["L", 9], ["R", 3], ["R", 7]] },
    ],
  },
  g: {
    ad: "G",
    modeller: "Deneyap Kart G",
    etiketSecenekleri: [["g", "Kart G"]],
    yerlesim: "Kartın sol pin sırasındaki ilk pin (A0) <b>b1</b>'e, sağ sıradaki ilk pin (RX) <b>i1</b>'e gelsin.",
    gruplar: [
      { satir: 40, yari: "sol", pinler: [["L", 1], ["L", 4], ["L", 7], ["R", 1]] },
      { satir: 42, yari: "sol", pinler: [["L", 2], ["L", 5], ["L", 8], ["R", 2]] },
      { satir: 44, yari: "sol", pinler: [["L", 3], ["L", 6], ["L", 9]] },
    ],
  },
};
export const AILE_DUZENEK = { "ESP32": "kart", "ESP32-S3": "kart", "ESP32-S2": "mini", "ESP32-C3": "g" };

// Test yazılımı Türkçe karakter kullanmaz; ekranda düzgün Türkçe gösterilir.
export const CEVIRI = [
  ["Saglam", "Sağlam"],
  ["Flash boyutu okunamadi", "Flash boyutu okunamadı"],
  ["Flash boyutu bu model icin beklenenden farkli", "Flash boyutu bu model için beklenenden farklı"],
  ["Bu kartin PSRAM'i bu surumde test edilmiyor", "Bu kartın PSRAM'i bu sürümde test edilmiyor"],
  ["PSRAM bulunamadi (PSRAM cipi ya da lehimi arizali olabilir)", "PSRAM bulunamadı (PSRAM çipi ya da lehimi arızalı olabilir)"],
  ["PSRAM'den bellek alinamadi", "PSRAM'den bellek alınamadı"],
  ["PSRAM'de hatali bellek hucreleri var", "PSRAM'de hatalı bellek hücreleri var"],
  ["Dahili sicaklik olcer olagan disi deger verdi", "Dahili sıcaklık ölçer olağan dışı değer verdi"],
  ["Wi-Fi taramasi baslatilamadi", "Wi-Fi taraması başlatılamadı"],
  ["Hic ag bulunamadi", "Hiç ağ bulunamadı"],
  ["Aglar cok zayif gorunuyor", "Ağlar çok zayıf görünüyor"],
  ["Hareket sensoru cevap vermiyor", "Hareket sensörü cevap vermiyor"],
  ["Sensor veri uretmiyor", "Sensör veri üretmiyor"],
  ["Ivmeolcer yercekimini dogru olcmuyor (duragan kartta ~1000 mg olmali)", "İvmeölçer yerçekimini doğru ölçmüyor (duran kartta yaklaşık 1000 mg olmalı)"],
  ["Jiroskop duragan kartta donus olcuyor (kart hareket ettiyse tekrar deneyin)", "Jiroskop duran kartta dönüş ölçüyor (kart kıpırdadıysa tekrar deneyin)"],
  ["Ivmeolcer oz-testi gecmedi (sensor ici arizali)", "İvmeölçer öz-testi geçmedi (sensörün içi arızalı)"],
  ["Jiroskop oz-testi gecmedi (sensor ici arizali)", "Jiroskop öz-testi geçmedi (sensörün içi arızalı)"],
  ["15 saniyede dugmeye basilmadi ya da dugme algilanmadi", "15 saniyede düğmeye basılmadı ya da düğme algılanmadı"],
  ["Dugme basili kaliyor (birakilinca HIGH olmadi)", "Düğme basılı kalıyor (bırakılınca serbest kalmadı)"],
  ["Mikrofon arayuzu baslatilamadi", "Mikrofon arayüzü başlatılamadı"],
  ["Mikrofondan veri gelmiyor (hep ayni deger)", "Mikrofondan veri gelmiyor (hep aynı değer)"],
  ["Mikrofon calisiyor ama el cirpma sesi duyulmadi", "Mikrofon çalışıyor ama el çırpma sesi duyulmadı"],
  ["Bu model icin boyle bir test yok", "Bu model için böyle bir test yok"],
  ["Grup hic sinyal gecirmiyor (kablo takili mi?)", "Grubun hiçbir pini sinyal geçirmedi (kablolar takılı mı?)"],
  ["Grup hep LOW (bir pin GND'ye kisa devre ya da jumper GND'ye degiyor)", "Grup hep 0 V'ta: bir pin GND'ye kısa devre ya da bir jumper GND hattına değiyor"],
  ["Grup hep HIGH (bir pin 3V3'e kisa devre ya da jumper 3V3'e degiyor)", "Grup hep 3,3 V'ta: bir pin 3V3'e kısa devre ya da bir jumper 3V3 hattına değiyor"],
  ["Pin hep LOW (GND'ye kisa devre olabilir)", "Pin hep 0 V'ta: GND'ye kısa devre olabilir"],
  ["IMU cevap vermiyor (sensor ya da SDA/SCL hatti arizali olabilir; kartta '1A v2' yaziyorsa dikkate almayin)",
    "Dahili hareket sensörü cevap vermiyor: sensör ya da SDA/SCL hattı arızalı olabilir (kartın üstünde '1A v2' yazıyorsa bu uyarıyı dikkate almayın)"],
  ["DAC cikis vermiyor", "DAC çıkış vermiyor"],
  ["Sinyal gecmiyor (pin ya da lehim)", "Sinyal geçmiyor"],
  ["Cikis vermiyor", "Çıkış vermiyor"],
  ["Giris okumuyor", "Giriş okumuyor"],
  ["USB baglantisi (yukleme calistigi icin saglam)", "USB hattı, yükleme çalıştıysa sağlam"],
  ["BOOT butonu (BUT'a basinca test tekrarlanirsa saglam)", "BOOT butonu, BUT'a basınca test tekrarlanıyorsa sağlam"],
  ["Buton hatti (BUT'a basinca test tekrarlanirsa saglam)", "Buton hattı, BUT'a basınca test tekrarlanıyorsa sağlam"],
  ["Dahili RGB LED hatti (LED yaniyorsa saglam)", "RGB LED hattı, LED yanıyorsa sağlam"],
  ["Dahili mikrofon saat hatti", "Dahili mikrofon hattı"],
  ["Dahili mikrofon veri hatti", "Dahili mikrofon hattı"],
  ["Duzenekte bagli degil", "Düzenekte bağlı değil"],
  ["PSRAM hatti (test edilmez)", "Dahili PSRAM hattı"],
];

export const SONUC = {
  SAGLAM: { ad: "SAĞLAM", sinif: "ok" },
  BOZUK: { ad: "BOZUK", sinif: "bozuk" },
  DUZENEK_YOK: { ad: "DÜZENEK YOK", sinif: "kontrol" },
  DUZENEK_UYUMSUZ: { ad: "DÜZENEK UYUMSUZ", sinif: "kontrol" },
};
export const KOD_SINIF = { OK: "ok", BOZUK: "bozuk", KONTROL: "kontrol", ATLA: "atla" };

export function tr(metin) {
  for (const [k, v] of CEVIRI) if (metin.startsWith(k)) return v + metin.slice(k.length);
  return metin;
}

export function kacis(metin) {
  return String(metin).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// uart: CP210x/CH340 köprülü kart, jtag: ESP32-S3/C3 yerleşik USB,
// rom: ESP32-S2 yükleme modu, tinyusb: ESP32-S2 (Mini) normal çalışma.
export function usbTuru(port) {
  const { usbVendorId: v, usbProductId: p } = port.getInfo();
  if (v !== ESPRESSIF) return "uart";
  if (p === 0x1001) return "jtag";
  if (p === 0x0002) return "rom";
  return "tinyusb";
}

export function blokCoz(satirlar) {
  const r = { surum: "", aile: "", duzenek: "", model: "", kimlik: "", pinler: [], atlanan: [], kisa: [], bilesenler: [],
    sonuc: "", sorunlu: 0, kisaSayisi: 0, toplam: 0 };
  for (const satir of satirlar) {
    const p = satir.split(";");
    switch (p[1]) {
      case "BASLA": r.surum = p[2]; r.aile = p[3]; r.duzenek = p[4] || AILE_DUZENEK[p[3]] || ""; break;
      case "MODEL": r.model = p[2]; r.kimlik = p[3]; break;
      case "PIN": r.pinler.push({ ad: p[2], kod: p[3], aciklama: tr(p[4] || ""), grup: p[5] || "" }); break;
      case "ATLA": r.atlanan.push({ ad: p[2], kod: "ATLA", aciklama: tr(p[3] || "") }); break;
      case "KISA": r.kisa.push({ a: p[2], b: p[3], pin: p[4] }); break;
      case "BILESEN": r.bilesenler.push({ kod: p[2], durum: p[3], aciklama: p[4] || "", deger: p[5] || "" }); break;
      case "OZET": r.sonuc = p[2]; r.sorunlu = +p[3]; r.kisaSayisi = +p[4]; r.toplam = +p[5]; break;
    }
  }
  return r;
}

export function sonucMesaji(r) {
  if (r.sonuc === "SAGLAM") return PARCALAR[r.model] && r.surum >= "1.3.0"
    ? `Pinler sağlam: ${r.toplam} pinin hepsi testi geçti. Şimdi aşağıdan parça testlerine geçin ya da sıradaki kartı takın.`
    : `Kart sağlam: ${r.toplam} pinin hepsi testi geçti. Sıradaki kartı takabilirsiniz.`;
  if (r.sonuc === "DUZENEK_YOK") return "Hiçbir grupta sinyal geçmedi. Kart breadboard'a tam oturmuş mu, jumper'lar takılı mı? Düzenek doğruysa kartın pinleri çalışmıyor olabilir.";
  if (r.sonuc === "DUZENEK_UYUMSUZ") return "Bu kart başka bir düzenek ister. Kart korunmak için test edilmedi.";
  return `Sorun bulundu: ${r.sorunlu} pin${r.kisaSayisi ? `, ${r.kisaSayisi} kısa devre` : ""}.`;
}

export function konumlar(duzenekAdi) {
  const harita = {};
  DUZENEKLER[duzenekAdi].gruplar.forEach((g, gi) => g.pinler.forEach(([t, n], i) => {
    harita[`${t}${n}`] = { grup: gi, sira: i };
  }));
  return harita;
}

export const PARCALAR = {
  "Deneyap Kart": { led: "kart", mik: true, liste: "hareket sensörü, mikrofon, RGB LED, BUT, PSRAM, flash, Wi-Fi" },
  "Deneyap Kart 1A": { led: "ws", liste: "RGB LED, BUT, PSRAM, flash, Wi-Fi" },
  "Deneyap Kart v2": { led: "ws", liste: "hareket sensörü, RGB LED, BUT, flash, sıcaklık ölçer, Wi-Fi" },
  "Deneyap Kart 1A v2": { led: "ws", liste: "RGB LED, BUT, flash, sıcaklık ölçer, Wi-Fi" },
  "Deneyap Mini": { led: "ayrik", liste: "RGB LED, BUT, flash, sıcaklık ölçer, Wi-Fi" },
  "Deneyap Mini v2": { led: "ws", liste: "RGB LED, BUT, PSRAM, flash, sıcaklık ölçer, Wi-Fi" },
  "Deneyap Kart G": { led: "ws", liste: "RGB LED, BUT, flash, sıcaklık ölçer, Wi-Fi" },
};

// Kartın gönderdiği ölçüm metinlerindeki Türkçe karakterleri düzeltir.
export function olcumTr(d) {
  return String(d || "")
    .replace(/en guclu/g, "en güçlü").replace(/ ag\b/g, " ağ").replace(/cekirdek/g, "çekirdek")
    .replace(/gorunuyor/g, "görünüyor").replace(/en yuksek/g, "en yüksek").replace(/basili/g, "basılı");
}

