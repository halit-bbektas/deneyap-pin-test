// Parca (bilesen) testleri: pin testinden sonra kartin ustundeki parcalari dener.
//
// Komut: B:<duzenek>:<test>[:<arg>]   (duzenek uymazsa hicbir seye dokunulmaz)
//   oto          cip, flash, PSRAM, sicaklik, Wi-Fi, IMU (modelde varsa) - kullanici gerekmez
//   led:<r|g|b|0> RGB LED'i o renge ayarlar (0: kapat). Uygulama kullaniciya "goruyor musun" diye sorar.
//   but          BUT dugmesine basilmasini 15 sn bekler
//   mik          mikrofonu 4 sn dinler (Deneyap Kart); kullanici 1. saniyeden sonra el cirpar
// Cikti: DPT;BASLA / DPT;MODEL / DPT;BILESEN;<kod>;<OK|BOZUK|UYARI|BILGI>;<aciklama>;<deger> / DPT;BITTI
//
// Guvenlik: parca testleri test pinlerini surmez. LED ve IMU hatlari duzenekte baska pinlerle
// birlesik olabilir; o pinler bu sirada giriste bekler ve LED zayif surusle yakilir.

#include <WiFi.h>
#if CONFIG_IDF_TARGET_ESP32
#include <ESP_I2S.h>
#endif

// ---------------------------------------------------------------- model profili

enum LedTuru { LED_YOK, LED_WS, LED_AYRIK, LED_KART };

struct Profil {
  bool imu;             // dahili LSM6DSM
  bool mik;             // dahili MP34DT05 (sadece Deneyap Kart)
  LedTuru led;
  int8_t ledR, ledG, ledB;   // LED_AYRIK / LED_KART icin renk hatlari
  uint8_t flashMB;      // beklenen flash
  uint8_t psramMB;      // beklenen PSRAM (0: yok)
  bool psramTest;       // bu derlemede PSRAM test edilebilir mi
};

Profil p;                         // gecerli modelin profili (profilAyarla doldurur)

void profilAyarla() {
  p = {false, false, LED_YOK, -1, -1, -1, 4, 0, false};
  String m = modelAdi;
  if (m == "Deneyap Kart")            { p.imu = true; p.mik = true; p.led = LED_KART; p.ledR = 3; p.ledG = 1; p.ledB = 4; p.psramMB = 8; p.psramTest = true; }
  else if (m == "Deneyap Kart 1A")    { p.led = LED_WS; p.psramMB = 8; p.psramTest = true; }
  else if (m == "Deneyap Kart v2")    { p.imu = true; p.led = LED_WS; p.flashMB = 8; p.psramMB = 8; }
  else if (m == "Deneyap Kart 1A v2") { p.led = LED_WS; p.psramMB = 8; }
  else if (m == "Deneyap Mini")       { p.led = LED_AYRIK; p.ledR = 34; p.ledG = 33; p.ledB = 35; }
  else if (m == "Deneyap Mini v2")    { p.led = LED_WS; p.psramMB = 2; p.psramTest = true; }
  else if (m == "Deneyap Kart G")     { p.led = LED_WS; }
}

// Alanlar ';' ile ayrildigi icin metinlerdeki ';' virgule cevrilir.
void bilesenYaz(const char* kod, const char* durum, const char* aciklama, const String& deger) {
  String a = aciklama, d = deger;
  a.replace(";", ","); d.replace(";", ",");
  Serial.printf("DPT;BILESEN;%s;%s;%s;%s\n", kod, durum, a.c_str(), d.c_str());
}

// ---------------------------------------------------------------- otomatik testler

void cipTesti() {
  char s[96];
  int rev = ESP.getChipRevision();             // yeni IDF: ana*100 + ara (300 = v3.0)
  if (rev < 100) rev *= 100;
  snprintf(s, sizeof(s), "%s rev %d.%d, %d cekirdek, %d MHz", ESP.getChipModel(), rev / 100, rev % 100,
           ESP.getChipCores(), ESP.getCpuFreqMHz());
  bilesenYaz("CIP", "OK", "Islemci calisiyor, test yazilimi yuklendi ve calisti", s);
}

void flashTesti() {
  uint32_t b = 0;
  if (esp_flash_get_physical_size(NULL, &b) != ESP_OK || b == 0) {
    bilesenYaz("FLASH", "BOZUK", "Flash boyutu okunamadi", "");
    return;
  }
  uint32_t mb = b / (1024 * 1024);
  String d = String(mb) + " MB";
  if (mb == p.flashMB) bilesenYaz("FLASH", "OK", "Flash beklenen boyutta, test yazilimi buradan calisiyor", d);
  else bilesenYaz("FLASH", "UYARI", "Flash boyutu bu model icin beklenenden farkli", d + " (beklenen " + String(p.flashMB) + " MB)");
}

void psramTesti() {
  if (p.psramMB == 0) return;
  if (!p.psramTest) {
    bilesenYaz("PSRAM", "BILGI", "Bu kartin PSRAM'i bu surumde test edilmiyor", String(p.psramMB) + " MB");
    return;
  }
  if (!psramFound()) {
    bilesenYaz("PSRAM", "BOZUK", "PSRAM bulunamadi (PSRAM cipi ya da lehimi arizali olabilir)", "0 MB");
    return;
  }
  size_t boyut = ESP.getMaxAllocPsram();
  if (boyut > 4u * 1024 * 1024) boyut = 4u * 1024 * 1024;
  boyut &= ~(size_t)3;
  uint32_t* m = (uint32_t*)ps_malloc(boyut);
  if (!m) { bilesenYaz("PSRAM", "BOZUK", "PSRAM'den bellek alinamadi", String(boyut / 1024) + " KB"); return; }
  size_t n = boyut / 4, hata = 0;
  for (int tur = 0; tur < 2; tur++) {          // adres desenli yaz/oku, sonra tersiyle tekrar
    uint32_t x = tur ? 0xFFFFFFFFu : 0;
    for (size_t i = 0; i < n; i++) m[i] = ((uint32_t)i * 2654435761u) ^ x;
    for (size_t i = 0; i < n; i++) if (m[i] != (((uint32_t)i * 2654435761u) ^ x)) hata++;
  }
  free(m);
  String d = String(boyut / 1024) + " KB denendi, " + String(ESP.getPsramSize() / 1024) + " KB gorunuyor";
  if (hata == 0) bilesenYaz("PSRAM", "OK", "PSRAM yazma/okuma testi gecti", d);
  else bilesenYaz("PSRAM", "BOZUK", "PSRAM'de hatali bellek hucreleri var", d + ", " + String(hata) + " hata");
}

void sicaklikTesti() {
#if CONFIG_IDF_TARGET_ESP32S2 || CONFIG_IDF_TARGET_ESP32S3 || CONFIG_IDF_TARGET_ESP32C3
  float t = temperatureRead();
  String d = String(t, 1) + " C";
  if (t > 5 && t < 85) bilesenYaz("SICAKLIK", "OK", "Dahili sicaklik olcer calisiyor", d);
  else bilesenYaz("SICAKLIK", "UYARI", "Dahili sicaklik olcer olagan disi deger verdi", d);
#endif
}

void wifiTesti() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  int n = WiFi.scanNetworks(false, true);
  int enIyi = -127;
  for (int i = 0; i < n; i++) if (WiFi.RSSI(i) > enIyi) enIyi = WiFi.RSSI(i);
  WiFi.scanDelete();
  WiFi.mode(WIFI_OFF);
  if (n < 0) { bilesenYaz("WIFI", "BOZUK", "Wi-Fi taramasi baslatilamadi", String(n)); return; }
  String d = String(n) + " ag, en guclu " + String(enIyi) + " dBm";
  if (n == 0) bilesenYaz("WIFI", "UYARI", "Hic ag bulunamadi", "0 ag");
  else if (enIyi < -80) bilesenYaz("WIFI", "UYARI", "Aglar cok zayif gorunuyor", d);
  else bilesenYaz("WIFI", "OK", "Wi-Fi ve anten calisiyor", d);
}

#if CONFIG_IDF_TARGET_ESP32 || CONFIG_IDF_TARGET_ESP32S3
// ---------------------------------------------------------------- IMU (LSM6DSM)

uint8_t imuAdres = 0;

bool imuYazReg(uint8_t r, uint8_t v) {
  Wire.beginTransmission(imuAdres); Wire.write(r); Wire.write(v);
  return Wire.endTransmission() == 0;
}
bool imuOkuReg(uint8_t r, uint8_t* b, uint8_t n) {
  Wire.beginTransmission(imuAdres); Wire.write(r);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(imuAdres, n) != n) return false;
  for (int i = 0; i < n; i++) b[i] = Wire.read();
  return true;
}
// 5 ornegin ortalamasi; bit: STATUS_REG'deki "veri hazir" biti (0: ivme, 1: jiroskop)
bool imuOrtalama(uint8_t reg, uint8_t bit, float o[3], int adet) {
  long t[3] = {0, 0, 0};
  uint8_t b[6], s;
  for (int k = 0; k <= adet; k++) {
    uint32_t t0 = millis();
    do { if (!imuOkuReg(0x1E, &s, 1)) return false; } while (!(s & (1 << bit)) && millis() - t0 < 200);
    if (!(s & (1 << bit))) return false;
    if (!imuOkuReg(reg, b, 6)) return false;
    if (k == 0) continue;                       // ilk ornek atilir
    for (int a = 0; a < 3; a++) t[a] += (int16_t)(b[2 * a] | (b[2 * a + 1] << 8));
  }
  for (int a = 0; a < 3; a++) o[a] = (float)t[a] / adet;
  return true;
}

void imuTesti() {
  Wire.begin(PIN_SDA, PIN_SCL, 100000);
  imuAdres = 0;
  for (uint8_t a = 0x6A; a <= 0x6B && !imuAdres; a++) {
    imuAdres = a;
    uint8_t w = 0;
    if (!imuOkuReg(0x0F, &w, 1) || w == 0x00 || w == 0xFF) imuAdres = 0;
  }
  if (!imuAdres) {
    bilesenYaz("IMU", "BOZUK", "Hareket sensoru cevap vermiyor", "");
    Wire.end(); i2cKurtar(); return;
  }
  uint8_t kim = 0; imuOkuReg(0x0F, &kim, 1);
  char d[120];

  // 1) Duragan olcum: +-2 g (0.061 mg/LSB), 250 dps (8.75 mdps/LSB), 104 Hz
  imuYazReg(0x12, 0x01); delay(20);            // yazilim sifirlama
  imuYazReg(0x12, 0x44);                       // BDU + adres artisi
  imuYazReg(0x10, 0x40); imuYazReg(0x11, 0x40);
  delay(150);
  float a[3], g[3];
  bool okA = imuOrtalama(0x28, 0, a, 10), okG = imuOrtalama(0x22, 1, g, 10);
  float ax = a[0] * 0.061f, ay = a[1] * 0.061f, az = a[2] * 0.061f;
  float buyukluk = sqrtf(ax * ax + ay * ay + az * az);
  float gx = g[0] * 0.00875f, gy = g[1] * 0.00875f, gz = g[2] * 0.00875f;
  float gmax = fmaxf(fabsf(gx), fmaxf(fabsf(gy), fabsf(gz)));
  snprintf(d, sizeof(d), "WHO_AM_I 0x%02X, adres 0x%02X, ivme %.0f mg, jiroskop %.1f dps", kim, imuAdres, buyukluk, gmax);
  if (!okA || !okG) bilesenYaz("IMU_OLCUM", "BOZUK", "Sensor veri uretmiyor", d);
  else if (buyukluk < 800 || buyukluk > 1200) bilesenYaz("IMU_OLCUM", "BOZUK", "Ivmeolcer yercekimini dogru olcmuyor (duragan kartta ~1000 mg olmali)", d);
  else if (gmax > 20) bilesenYaz("IMU_OLCUM", "UYARI", "Jiroskop duragan kartta donus olcuyor (kart hareket ettiyse tekrar deneyin)", d);
  else bilesenYaz("IMU_OLCUM", "OK", "Ivmeolcer ve jiroskop olcum yapiyor", d);

  // 2) Ivmeolcer oz-testi (LSM6DSM veri sayfasi: 52 Hz, +-2 g; fark 90..1700 mg)
  float n0[3], s0[3];
  imuYazReg(0x11, 0x00); imuYazReg(0x10, 0x30); delay(100);
  bool ok1 = imuOrtalama(0x28, 0, n0, 5);
  imuYazReg(0x14, 0x01); delay(100);
  bool ok2 = imuOrtalama(0x28, 0, s0, 5);
  imuYazReg(0x14, 0x00); imuYazReg(0x10, 0x00);
  bool gecti = ok1 && ok2;
  float fark[3];
  for (int k = 0; k < 3; k++) { fark[k] = fabsf(s0[k] - n0[k]) * 0.061f; if (fark[k] < 90 || fark[k] > 1700) gecti = false; }
  snprintf(d, sizeof(d), "X %.0f, Y %.0f, Z %.0f mg (90-1700)", fark[0], fark[1], fark[2]);
  bilesenYaz("IMU_IVME_OZTEST", gecti ? "OK" : "BOZUK",
             gecti ? "Ivmeolcer oz-testi gecti" : "Ivmeolcer oz-testi gecmedi (sensor ici arizali)", d);

  // 3) Jiroskop oz-testi (208 Hz, 2000 dps, 70 mdps/LSB; fark 150..700 dps)
  imuYazReg(0x10, 0x00); imuYazReg(0x11, 0x5C); delay(150);
  ok1 = imuOrtalama(0x22, 1, n0, 5);
  imuYazReg(0x14, 0x04); delay(100);
  ok2 = imuOrtalama(0x22, 1, s0, 5);
  imuYazReg(0x14, 0x00); imuYazReg(0x11, 0x00);
  gecti = ok1 && ok2;
  for (int k = 0; k < 3; k++) { fark[k] = fabsf(s0[k] - n0[k]) * 0.070f; if (fark[k] < 150 || fark[k] > 700) gecti = false; }
  snprintf(d, sizeof(d), "X %.0f, Y %.0f, Z %.0f dps (150-700)", fark[0], fark[1], fark[2]);
  bilesenYaz("IMU_JIRO_OZTEST", gecti ? "OK" : "BOZUK",
             gecti ? "Jiroskop oz-testi gecti" : "Jiroskop oz-testi gecmedi (sensor ici arizali)", d);

  imuYazReg(0x12, 0x01); delay(20);            // sensoru varsayilan (kapali) duruma dondur
  Wire.end();
  i2cKurtar();
}
#endif

void otoTestler() {
  cipTesti();
  flashTesti();
  psramTesti();
  sicaklikTesti();
#if CONFIG_IDF_TARGET_ESP32 || CONFIG_IDF_TARGET_ESP32S3
  if (p.imu) imuTesti();
#endif
  wifiTesti();
}

// ---------------------------------------------------------------- LED

int8_t yanipPin = -1;             // yanip sonen ayrik LED hatti (kutup bilinmedigi icin yanip soner)
uint32_t yanipZaman = 0;
bool yanipDurum = false;

void ledDurdur() {
  if (yanipPin >= 0) {
    pinMode(yanipPin, INPUT);
#if CONFIG_IDF_TARGET_ESP32 || CONFIG_IDF_TARGET_ESP32S3
    if (yanipPin == PIN_SDA) i2cKurtar();
#endif
  }
  yanipPin = -1;
}

void ledYanipGuncelle() {
  if (yanipPin < 0 || millis() - yanipZaman < 300) return;
  yanipZaman = millis();
  yanipDurum = !yanipDurum;
  digitalWrite(yanipPin, yanipDurum ? HIGH : LOW);
}

void ledTesti(char renk) {
  ledDurdur();
  if (p.led == LED_WS) {
    uint8_t r = renk == 'r' ? 60 : 0, g = renk == 'g' ? 60 : 0, b = renk == 'b' ? 60 : 0;
    rgbLedWrite(ledPin, r, g, b);
    bilesenYaz("LED", "BILGI", "Adreslenebilir RGB LED ayarlandi", String(renk));
    return;
  }
  if (renk == '0') { bilesenYaz("LED", "BILGI", "LED kapatildi", "0"); return; }
  int8_t hat = renk == 'r' ? p.ledR : renk == 'g' ? p.ledG : p.ledB;
  if (p.led == LED_KART && renk == 'r') {      // RX hatti: uygulama sifir baytlar gonderir, kirmizi yanar
    bilesenYaz("LED", "BILGI", "Kirmizi LED RX hattinda; uygulama veri gondererek yakar", "UYGULAMA");
    return;
  }
  if (p.led == LED_KART && renk == 'g') {      // TX hatti: kart sifir baytlar gonderir, yesil yanar
    bilesenYaz("LED", "BILGI", "Yesil LED TX hattinda; kart 4 sn veri gonderecek", "KART");
    Serial.println("DPT;BITTI");
    Serial.flush();
    uint8_t sifir[64] = {0};
    uint32_t t0 = millis();
    while (millis() - t0 < 4000) Serial.write(sifir, sizeof(sifir));
    Serial.flush();
    Serial.println();
    return;                                    // BITTI zaten yazildi
  }
  if (hat < 0 || p.led == LED_YOK) { bilesenYaz("LED", "BILGI", "Bu modelde test edilecek LED yok", ""); return; }
  yanipPin = hat;
  zayifCikis(hat, OUTPUT);
  yanipZaman = 0;
  bilesenYaz("LED", "BILGI", "LED hatti yanip sonuyor", String(renk));
}

// ---------------------------------------------------------------- BUT

void butonTesti() {
  pinMode(PIN_BUTON, INPUT_PULLUP);
  uint32_t t0 = millis();
  bool basildi = false;
  while (millis() - t0 < 15000) {
    if (digitalRead(PIN_BUTON) == LOW) {
      delay(30);
      if (digitalRead(PIN_BUTON) == LOW) { basildi = true; break; }
    }
    delay(5);
  }
  if (!basildi) { bilesenYaz("BUT", "BOZUK", "15 saniyede dugmeye basilmadi ya da dugme algilanmadi", ""); return; }
  uint32_t t1 = millis();
  while (digitalRead(PIN_BUTON) == LOW && millis() - t1 < 5000) delay(5);
  if (digitalRead(PIN_BUTON) == LOW) bilesenYaz("BUT", "BOZUK", "Dugme basili kaliyor (birakilinca HIGH olmadi)", "");
  else bilesenYaz("BUT", "OK", "Dugme basma ve birakma algilandi", String(millis() - t1) + " ms basili");
}

// ---------------------------------------------------------------- mikrofon (Deneyap Kart)

#if CONFIG_IDF_TARGET_ESP32
void mikrofonTesti() {
  I2SClass i2s;
  i2s.setPinsPdmRx(13, 12);                    // MICC: saat, MICD: veri (Deneyap_Mikrofon ile ayni)
  if (!i2s.begin(I2S_MODE_PDM_RX, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    bilesenYaz("MIK", "BOZUK", "Mikrofon arayuzu baslatilamadi", "");
    return;
  }
  int16_t tampon[800];                          // 50 ms
  float enAz = 1e9, enCok = 0;
  int16_t ilk = 0; bool ayni = true; bool ilkVar = false;
  uint32_t t0 = millis();
  int pencere = 0;
  while (millis() - t0 < 4000) {
    size_t n = i2s.readBytes((char*)tampon, sizeof(tampon)) / 2;
    if (n == 0) continue;
    double ort = 0; for (size_t i = 0; i < n; i++) ort += tampon[i]; ort /= n;
    double e = 0; for (size_t i = 0; i < n; i++) { double x = tampon[i] - ort; e += x * x; }
    float rms = sqrt(e / n);
    for (size_t i = 0; i < n; i++) { if (!ilkVar) { ilk = tampon[i]; ilkVar = true; } else if (tampon[i] != ilk) ayni = false; }
    if (++pencere > 4) { enAz = fminf(enAz, rms); enCok = fmaxf(enCok, rms); }   // ilk 200 ms oturma
  }
  i2s.end();
  pinMode(12, INPUT); pinMode(13, INPUT);
  char d[80];
  snprintf(d, sizeof(d), "sessiz %.0f, en yuksek %.0f, oran %.1f", enAz, enCok, enAz > 0 ? enCok / enAz : 0);
  if (ayni || enCok < 1) bilesenYaz("MIK", "BOZUK", "Mikrofondan veri gelmiyor (hep ayni deger)", d);
  else if (enCok < enAz * 3) bilesenYaz("MIK", "UYARI", "Mikrofon calisiyor ama el cirpma sesi duyulmadi", d);
  else bilesenYaz("MIK", "OK", "Mikrofon sesi duyuyor", d);
}
#endif

// ---------------------------------------------------------------- komut

void bilesenKomut(String k) {        // k: "B:<duzenek>:<test>[:<arg>]"
  int a = k.indexOf(':', 2);
  String duz = a > 0 ? k.substring(2, a) : k.substring(2);
  duz.toLowerCase();
  if (duz != DUZENEK) { uyumsuzYaz(duz); return; }
  String test = a > 0 ? k.substring(a + 1) : "";
  String arg = "";
  int b = test.indexOf(':');
  if (b > 0) { arg = test.substring(b + 1); test = test.substring(0, b); }
  test.toLowerCase(); arg.toLowerCase();

  if (test != "led") ledDurdur();
  modelBelirle();
  profilAyarla();
  hepsiniBirak();
  baslikYaz();
  if (test == "oto") otoTestler();
  else if (test == "led") { ledTesti(arg.length() ? arg[0] : '0'); if (p.led == LED_KART && arg == "g") return; }
  else if (test == "but") butonTesti();
#if CONFIG_IDF_TARGET_ESP32
  else if (test == "mik" && p.mik) mikrofonTesti();
#endif
  else bilesenYaz("KOMUT", "BILGI", "Bu model icin boyle bir test yok", test);
  Serial.println("DPT;BITTI");
}
