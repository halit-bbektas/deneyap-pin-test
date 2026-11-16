// Deneyap Pin Test - test yazilimi
//
// Ayni kaynak dort islemci icin derlenir; islemciye gore pin tablosu secilir:
//   ESP32    : Deneyap Kart, Deneyap Kart 1A           -> "kart" duzenegi
//   ESP32-S3 : Deneyap Kart v2, Deneyap Kart 1A v2     -> "kart" duzenegi
//   ESP32-S2 : Deneyap Mini, Deneyap Mini v2           -> "mini" duzenegi
//   ESP32-C3 : Deneyap Kart G                          -> "g" duzenegi
//
// GUVENLIK: Kart acilista pinlere dokunmaz. Uygulama "T:<duzenek>" komutu gonderir;
// duzenek bu kartin duzenegi degilse hicbir pine sinyal verilmez (yanlis duzenekte
// jumper'lar GPIO'yu 3V3/GND'ye baglayabilir). BUT butonu ile tekrar test ancak
// uygulama duzenegi bir kez onayladiktan sonra calisir.
//
// Seri port 115200 baud. Makine tarafindan okunan satirlar "DPT;" ile baslar.

#include <Wire.h>
#include "driver/gpio.h"
#include "esp_flash.h"

#define FW_SURUM "1.3.0"

const uint8_t YOK = 255;
const int TOLERANS_MV = 300;      // analog testte kabul edilen sapma (pratik deger)
const int MAXP = 5;
const int MAXG = 6;

struct Grup {
  const char* etiket;
  uint8_t pin[MAXP];
  const char* ad[MAXP];
  bool analog;                    // true: pin[0] DAC, digerleri sadece-giris analog pin
};

// ---------------------------------------------------------------- pin tablolari

#if CONFIG_IDF_TARGET_ESP32
#define AILE "ESP32"
#define DUZENEK "kart"
const uint8_t PIN_BUTON = 0;      // D8 / GPKEY
const uint8_t PIN_SDA = 4, PIN_SCL = 15;
const Grup G_KART[] = {           // Deneyap Kart ve 1A'da GPIO numaralari aynidir
  {"Grup 1", {23, 22, 4, YOK, YOK},  {"D0", "D1", "SDA"},              false},
  {"Grup 2", {21, 19, 15, YOK, YOK}, {"D4", "SCK", "SCL"},             false},
  {"Grup 3", {18, 5, 14, YOK, YOK},  {"MISO", "MOSI", "D14"},          false},
  {"Grup 4", {2, 12, 27, 32, 33},    {"D9", "D13", "D15", "A4", "A5"}, false},
  {"Grup 5", {25, 36, 39, YOK, YOK}, {"DAC1", "A0", "A1"},             true},
  {"Grup 6", {26, 34, 35, YOK, YOK}, {"DAC2", "A2", "A3"},             true},
};
const char* const ATLA_1A[] = {
  "TX;USB baglantisi (yukleme calistigi icin saglam)",
  "RX;USB baglantisi (yukleme calistigi icin saglam)",
  "D8;BOOT butonu (BUT'a basinca test tekrarlanirsa saglam)",
  "D12;Dahili RGB LED hatti (LED yaniyorsa saglam)"};
const char* const ATLA_KART[] = {
  "TX;USB baglantisi (yukleme calistigi icin saglam)",
  "RX;USB baglantisi (yukleme calistigi icin saglam)",
  "D8;BOOT butonu (BUT'a basinca test tekrarlanirsa saglam)",
  "D12;Dahili mikrofon saat hatti",
  "D13;Dahili mikrofon veri hatti"};

#elif CONFIG_IDF_TARGET_ESP32S3
#define AILE "ESP32-S3"
#define DUZENEK "kart"
const uint8_t PIN_BUTON = 0;
const uint8_t PIN_SDA = 47, PIN_SCL = 21;
const Grup G_V2[] = {
  {"Grup 1", {1, 2, 47, YOK, YOK},   {"D0", "D1", "SDA"},              false},
  {"Grup 2", {42, 41, 21, YOK, YOK}, {"D4", "D5", "SCL"},              false},
  {"Grup 3", {40, 39, 9, YOK, YOK},  {"D6", "D7", "D14"},              false},
  {"Grup 4", {48, 10, 8, 15, 16},    {"D9", "D13", "D15", "A4", "A5"}, false},
  {"Grup 5", {17, 4, 5, YOK, YOK},   {"A6", "A0", "A1"},               false},
  {"Grup 6", {18, 6, 7, YOK, YOK},   {"A7", "A2", "A3"},               false},
};
// 1A v2: ayni konumlar, sol 10-12. pinlerin adi ve 11. pinin GPIO'su farkli
const Grup G_1AV2[] = {
  {"Grup 1", {1, 2, 47, YOK, YOK},   {"D0", "D1", "SDA"},              false},
  {"Grup 2", {42, 41, 21, YOK, YOK}, {"D4", "SCK", "SCL"},             false},
  {"Grup 3", {40, 39, 3, YOK, YOK},  {"MISO", "MOSI", "D13"},          false},
  {"Grup 4", {48, 10, 8, 15, 16},    {"D9", "D12", "D14", "A4", "A5"}, false},
  {"Grup 5", {17, 4, 5, YOK, YOK},   {"A6", "A0", "A1"},               false},
  {"Grup 6", {18, 6, 7, YOK, YOK},   {"A7", "A2", "A3"},               false},
};
const char* const ATLA_V2[] = {
  "TX;Duzenekte bagli degil", "RX;Duzenekte bagli degil",
  "D8;Duzenekte bagli degil", "D12;Duzenekte bagli degil"};
const char* const ATLA_1AV2[] = {
  "TX;Duzenekte bagli degil", "RX;Duzenekte bagli degil", "D8;Duzenekte bagli degil"};

#elif CONFIG_IDF_TARGET_ESP32S2
#define AILE "ESP32-S2"
#define DUZENEK "mini"
const uint8_t PIN_BUTON = 0;
// Mini ve Mini v2'de GPIO'lar ayni konumda; sol 2-8. pinlerin adi bir kayiktir.
// GPIO26 (D9) Mini v2'de PSRAM secim hatti oldugu icin teste girmez.
const Grup G_MINIV2[] = {
  {"Grup 1", {8, 12, 18, 42, 38},  {"A1", "A5", "DA1", "D2", "MC"}, false},
  {"Grup 2", {9, 13, 21, 41, 37},  {"A2", "A6", "D10", "D3", "SC"}, false},
  {"Grup 3", {10, 16, 44, 40, 36}, {"A3", "A7", "RX", "MO", "SD"},  false},
  {"Grup 4", {11, 17, 43, 39, YOK}, {"A4", "DA0", "TX", "MI"},      false},
};
const Grup G_MINI[] = {
  {"Grup 1", {8, 12, 18, 42, 38},  {"A0", "A4", "DA1", "D2", "MC"}, false},
  {"Grup 2", {9, 13, 21, 41, 37},  {"A1", "A5", "D10", "D3", "SC"}, false},
  {"Grup 3", {10, 16, 44, 40, 36}, {"A2", "A6", "RX", "MO", "SD"},  false},
  {"Grup 4", {11, 17, 43, 39, YOK}, {"A3", "DA0", "TX", "MI"},      false},
};
const char* const ATLA_MINIV2[] = {"A0;Duzenekte bagli degil", "D9;PSRAM hatti (test edilmez)"};
const char* const ATLA_MINI[] = {"BT;Duzenekte bagli degil", "D9;Duzenekte bagli degil"};

#elif CONFIG_IDF_TARGET_ESP32C3
#define AILE "ESP32-C3"
#define DUZENEK "g"
const uint8_t PIN_BUTON = 9;      // D2 / GPKEY
const Grup G_G[] = {
  {"Grup 1", {0, 3, 6, 20, YOK},  {"A0", "A2", "A5", "RX"}, false},
  {"Grup 2", {1, 4, 7, 21, YOK},  {"A1", "A3", "D5", "TX"}, false},
  {"Grup 3", {2, 5, 8, YOK, YOK}, {"SCL", "A4", "SDA"},     false},
};
const char* const ATLA_G[] = {
  "D2;Buton hatti (BUT'a basinca test tekrarlanirsa saglam)",
  "D3;Dahili RGB LED hatti (LED yaniyorsa saglam)"};

#else
#error "Desteklenmeyen islemci"
#endif

// ---------------------------------------------------------------- durum

Grup gruplar[MAXG];
int GRUP = 0;
bool cikisOk[MAXG][MAXP], girisOk[MAXG][MAXP], grupCalisti[MAXG], atla[MAXG][MAXP];
bool hepLow[MAXG][MAXP];         // surulmeden, pull-up'tayken LOW okunan pin: GND'ye kisa devre izi
bool hepHigh[MAXG][MAXP];        // surulmeden, pull-down'dayken HIGH okunan pin (I2C pull-up'i da olabilir)
int olculen[MAXG][MAXP][2];

const char* modelAdi = "?";
int ledPin = -1;                  // adreslenebilir RGB LED; -1: kullanma
const char* const* atlananlar = nullptr;
int atlananSayisi = 0;
bool duzenekOnayli = false;       // uygulama dogru duzenegi bildirdi mi
bool imuSorunlu = false;          // model baska kanitla belli ama dahili IMU cevap vermiyor
uint32_t butSessiz = 0;           // BUT testinden hemen sonra dugme pin testini baslatmasin
String komut;

// (Arduino on isleyicisi sablon fonksiyonlarin prototipini bozdugu icin makro kullanilir)
#define ADET(x) (sizeof(x) / sizeof((x)[0]))
#define gruplariYukle(kaynak) gruplariKopyala(kaynak, ADET(kaynak))
#define atlananlariAyarla(liste) do { atlananlar = liste; atlananSayisi = ADET(liste); } while (0)

void gruplariKopyala(const Grup* kaynak, int n) {
  for (int i = 0; i < n; i++) gruplar[i] = kaynak[i];
  GRUP = n;
}

// ---------------------------------------------------------------- yardimcilar

bool aktif(int g, int j) { return gruplar[g].pin[j] != YOK && !atla[g][j]; }
bool sadeceGiris(int g, int j) { return gruplar[g].analog && j > 0; }   // ESP32 A0-A3

void hepsiniBirak() {
  for (int g = 0; g < GRUP; g++)
    for (int j = 0; j < MAXP; j++)
      if (gruplar[g].pin[j] != YOK) pinMode(gruplar[g].pin[j], INPUT);
}

// Test sinyali en dusuk akim ayariyla verilir (GPIO_DRIVE_CAP_0, ~5 mA). Pull direncleri ve
// kart ustundeki I2C pull-up'larini rahatca yener; ama bozuk bir kartta pin GND'ye/3V3'e ya da
// baska bir pine kisa devreyse akim sinirli kalir ve pin zorlanmaz.
void zayifCikis(uint8_t pin, uint8_t mod) {
  pinMode(pin, mod);
  gpio_set_drive_capability((gpio_num_t)pin, GPIO_DRIVE_CAP_0);
}

void ledYak(uint8_t r, uint8_t gr, uint8_t b) {
  if (ledPin >= 0) rgbLedWrite(ledPin, r, gr, b);
}

String kimlik() {
  uint64_t m = ESP.getEfuseMac();
  char s[18];
  snprintf(s, sizeof(s), "%02X:%02X:%02X:%02X:%02X:%02X",
           (uint8_t)(m), (uint8_t)(m >> 8), (uint8_t)(m >> 16),
           (uint8_t)(m >> 24), (uint8_t)(m >> 32), (uint8_t)(m >> 40));
  return String(s);
}

#if CONFIG_IDF_TARGET_ESP32 || CONFIG_IDF_TARGET_ESP32S3
// Pin testi SDA ve SCL hatlarini da oynatir. IMU bunu yarim kalmis bir I2C islemi sanip
// SDA'yi LOW tutabilir; kart yeniden baslasa da IMU'nun gucu kesilmedigi icin takili kalir
// ve model yanlis (v2 yerine 1A v2) belirlenir. 9 saat darbesi + STOP ile hat serbest kalir.
// Hatlar acik-kollektor surulur (sadece LOW'a cekilir), duzenekteki diger pinler giristedir.
void i2cKurtar() {
  pinMode(PIN_SDA, INPUT_PULLUP);
  zayifCikis(PIN_SCL, OUTPUT_OPEN_DRAIN);
  digitalWrite(PIN_SCL, HIGH);
  delayMicroseconds(10);
  for (int i = 0; i < 9; i++) {
    digitalWrite(PIN_SCL, LOW);  delayMicroseconds(10);
    digitalWrite(PIN_SCL, HIGH); delayMicroseconds(10);
  }
  zayifCikis(PIN_SDA, OUTPUT_OPEN_DRAIN);    // STOP: SCL HIGH iken SDA LOW -> HIGH
  digitalWrite(PIN_SCL, LOW);  delayMicroseconds(10);
  digitalWrite(PIN_SDA, LOW);  delayMicroseconds(10);
  digitalWrite(PIN_SCL, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_SDA, HIGH); delayMicroseconds(10);
  pinMode(PIN_SDA, INPUT);
  pinMode(PIN_SCL, INPUT);
}

// Deneyap Kart ve Kart v2'de dahili IMU (LSM6DSM) vardir; 1A ve 1A v2'de yoktur.
// Adresin cevap vermesi (ACK) yetmez: SDA hatti GND'ye kisa devreyse ACK biti de LOW okunur ve
// olmayan bir IMU "var" sanilabilir (1A, Deneyap Kart sanilip D13 test disi kalirdi). Bu yuzden
// IMU'nun WHO_AM_I (0x0F) kaydi okunur; 0x00 (hat LOW) ya da 0xFF (cevap yok) kabul edilmez.
bool imuYokla() {
  Wire.begin(PIN_SDA, PIN_SCL, 100000);
  bool var = false;
  const uint8_t adresler[2] = {0x6A, 0x6B};
  for (int i = 0; i < 2 && !var; i++) {
    Wire.beginTransmission(adresler[i]);
    Wire.write(0x0F);
    if (Wire.endTransmission(false) != 0) continue;
    if (Wire.requestFrom(adresler[i], (uint8_t)1) != 1) continue;
    uint8_t kimlik = Wire.read();
    if (kimlik != 0x00 && kimlik != 0xFF) var = true;
  }
  Wire.end();
  pinMode(PIN_SDA, INPUT);
  pinMode(PIN_SCL, INPUT);
  return var;
}

bool imuVarMi() {
  for (int deneme = 0; deneme < 3; deneme++) {
    if (imuYokla()) return true;
    i2cKurtar();                  // cevap yoksa takili hatti serbest birakip tekrar sor
    delay(5);
  }
  return false;
}
#endif

void modelBelirle() {
  memset(atla, 0, sizeof(atla));
  imuSorunlu = false;
#if CONFIG_IDF_TARGET_ESP32
  gruplariYukle(G_KART);
  hepsiniBirak();
  if (imuVarMi()) {
    modelAdi = "Deneyap Kart";
    ledPin = -1;                  // GPIO13 mikrofon saat hattidir, dokunma
    atla[3][1] = true;            // D13 = dahili mikrofon veri hatti
    atlananlariAyarla(ATLA_KART);
  } else {
    modelAdi = "Deneyap Kart 1A";
    ledPin = 13;
    atlananlariAyarla(ATLA_1A);
  }
#elif CONFIG_IDF_TARGET_ESP32S3
  gruplariYukle(G_V2);
  hepsiniBirak();
  // v2: IMU var, 8 MB flash. 1A v2: IMU yok, 4 MB flash. IMU cevap vermiyor ama flash 8 MB ise
  // bu buyuk ihtimalle IMU'su ya da SDA/SCL hatti arizali bir v2'dir: v2 tablosuyla test edilir
  // ve IMU ayrica raporlanir (yanlis tabloyla saglam pin "bozuk" gorunmesin).
  bool imu = imuVarMi();
  uint32_t flash = 0;
  if (esp_flash_get_physical_size(NULL, &flash) != ESP_OK) flash = 0;
  if (imu || flash >= 8u * 1024 * 1024) {
    modelAdi = "Deneyap Kart v2";
    ledPin = 46;
    atlananlariAyarla(ATLA_V2);
    imuSorunlu = !imu;
  } else {
    gruplariYukle(G_1AV2);
    modelAdi = "Deneyap Kart 1A v2";
    ledPin = 48;                  // D9 hattindadir; test sonrasi durum icin kullanilir
    atlananlariAyarla(ATLA_1AV2);
  }
#elif CONFIG_IDF_TARGET_ESP32S2
  if (psramFound()) {             // Mini v2'de 2 MB PSRAM var, Mini'de yok
    gruplariYukle(G_MINIV2);
    modelAdi = "Deneyap Mini v2";
    ledPin = 33;
    atlananlariAyarla(ATLA_MINIV2);
  } else {
    gruplariYukle(G_MINI);
    modelAdi = "Deneyap Mini";
    ledPin = -1;                  // Mini'de adreslenebilir olmayan 5050 RGB LED var
    atlananlariAyarla(ATLA_MINI);
  }
  hepsiniBirak();
#elif CONFIG_IDF_TARGET_ESP32C3
  gruplariYukle(G_G);
  modelAdi = "Deneyap Kart G";
  ledPin = 10;
  atlananlariAyarla(ATLA_G);
  hepsiniBirak();
#endif
}

// ---------------------------------------------------------------- testler

// surucu HIGH ve LOW verir; okuyucu her seferinde ters yone cekilir.
// Kablo kopuksa ya da pin oluyse pull direnci kazanir ve test kalir.
bool ciftTest(uint8_t surucu, uint8_t okuyucu) {
  zayifCikis(surucu, OUTPUT);
  pinMode(okuyucu, INPUT_PULLDOWN);
  digitalWrite(surucu, HIGH);
  delayMicroseconds(500);
  bool yuksek = digitalRead(okuyucu) == HIGH;

  pinMode(okuyucu, INPUT_PULLUP);
  digitalWrite(surucu, LOW);
  delayMicroseconds(500);
  bool dusuk = digitalRead(okuyucu) == LOW;

  pinMode(surucu, INPUT);
  pinMode(okuyucu, INPUT);
  return yuksek && dusuk;
}

void dijitalTest(int g) {
  for (int i = 0; i < MAXP; i++) {
    if (!aktif(g, i)) continue;
    for (int j = 0; j < MAXP; j++) {
      if (i == j || !aktif(g, j)) continue;
      if (ciftTest(gruplar[g].pin[i], gruplar[g].pin[j])) {
        cikisOk[g][i] = true;
        girisOk[g][j] = true;
        grupCalisti[g] = true;
      }
    }
  }
}

#if CONFIG_IDF_TARGET_ESP32
void analogTest(int g) {
  const uint8_t seviye[2] = {64, 160};   // yaklasik 828 mV ve 2071 mV
  bool gecti[MAXP] = {true, true, true, true, true};
  for (int s = 0; s < 2; s++) {
    dacWrite(gruplar[g].pin[0], seviye[s]);
    delay(10);
    int hedef = seviye[s] * 3300 / 255;
    for (int j = 1; j < MAXP; j++) {
      if (!aktif(g, j)) continue;
      olculen[g][j][s] = analogReadMilliVolts(gruplar[g].pin[j]);
      if (abs(olculen[g][j][s] - hedef) > TOLERANS_MV) gecti[j] = false;
    }
  }
  dacDisable(gruplar[g].pin[0]);
  for (int j = 1; j < MAXP; j++)
    if (aktif(g, j) && gecti[j]) {
      girisOk[g][j] = true;
      cikisOk[g][0] = true;
      grupCalisti[g] = true;
    }
}
#else
void analogTest(int g) { dijitalTest(g); }   // DAC'li analog grup sadece ESP32 tablosunda var
#endif

// Hicbir pin surulmeden once: hepsi pull-up'tayken LOW okunan pin, kartta GND'ye kisa devre
// (ya da GND hattina degen bir jumper) demektir. Sadece okuma yapilir.
void hepLowBul() {
  memset(hepLow, 0, sizeof(hepLow));
  for (int g = 0; g < GRUP; g++)
    for (int j = 0; j < MAXP; j++)
      if (aktif(g, j) && !sadeceGiris(g, j)) pinMode(gruplar[g].pin[j], INPUT_PULLUP);
  delay(1);
  for (int g = 0; g < GRUP; g++)
    for (int j = 0; j < MAXP; j++)
      if (aktif(g, j) && !sadeceGiris(g, j) && digitalRead(gruplar[g].pin[j]) == LOW) {
        hepLow[g][j] = true;
        Serial.printf("Uyari: %s (%s) surulmeden LOW okunuyor\n", gruplar[g].ad[j], gruplar[g].etiket);
      }
  // HIGH tarafi sadece bilgi icindir: SDA/SCL'de kart ustundeki pull-up'lar da HIGH gosterir.
  // Bu yuzden yalnizca hic sinyal gecirmeyen bir grubun mesajinda kullanilir.
  memset(hepHigh, 0, sizeof(hepHigh));
  for (int g = 0; g < GRUP; g++)
    for (int j = 0; j < MAXP; j++)
      if (aktif(g, j) && !sadeceGiris(g, j)) pinMode(gruplar[g].pin[j], INPUT_PULLDOWN);
  delay(1);
  for (int g = 0; g < GRUP; g++)
    for (int j = 0; j < MAXP; j++)
      if (aktif(g, j) && !sadeceGiris(g, j) && digitalRead(gruplar[g].pin[j]) == HIGH) hepHigh[g][j] = true;
  hepsiniBirak();
}

// Bir grup LOW'a cekilirken diger gruplar pull-up'ta bekler.
// LOW okunan pin, iki grup arasinda kisa devre demektir. Zaten hep LOW olan pinler bu testte
// bir sey soylemez; yanlis kisa devre raporu olmasin diye atlanir.
// Iki grup arasindaki bir kopru tek kisa devre olarak raporlanir.
int kisaDevreTesti() {
  int bulunan = 0;
  for (int g = 0; g < GRUP; g++) {
    for (int k = 0; k < GRUP; k++)
      for (int j = 0; j < MAXP; j++)
        if (aktif(k, j) && !sadeceGiris(k, j)) pinMode(gruplar[k].pin[j], INPUT_PULLUP);
    for (int j = 0; j < MAXP; j++)
      if (aktif(g, j) && !sadeceGiris(g, j)) {
        zayifCikis(gruplar[g].pin[j], OUTPUT);
        digitalWrite(gruplar[g].pin[j], LOW);
      }
    delayMicroseconds(500);
    for (int k = g + 1; k < GRUP; k++)
      for (int j = 0; j < MAXP; j++)
        if (aktif(k, j) && !sadeceGiris(k, j) && !hepLow[k][j] && digitalRead(gruplar[k].pin[j]) == LOW) {
          Serial.printf("KISA DEVRE: %s ile %s (%s)\n", gruplar[g].etiket, gruplar[k].etiket, gruplar[k].ad[j]);
          Serial.printf("DPT;KISA;%s;%s;%s\n", gruplar[g].etiket, gruplar[k].etiket, gruplar[k].ad[j]);
          bulunan++;
          break;                                     // bu grup cifti icin bir kez yeter
        }
    hepsiniBirak();
  }
  return bulunan;
}

// ---------------------------------------------------------------- rapor

bool grupHep(int g, bool yuksek) {
  bool var = false;
  for (int j = 0; j < MAXP; j++) {
    if (!aktif(g, j) || sadeceGiris(g, j)) continue;
    if (!(yuksek ? hepHigh[g][j] : hepLow[g][j])) return false;
    var = true;
  }
  return var;
}

void atlananlariYaz() {
  for (int i = 0; i < atlananSayisi; i++) Serial.printf("DPT;ATLA;%s\n", atlananlar[i]);
}

// donus: sorunlu pin sayisi; toplam ve calisanGrup disariya yazilir
int rapor(int& toplam, int& calisanGrup) {
  int sorunlu = 0;
  toplam = 0;
  calisanGrup = 0;
  for (int g = 0; g < GRUP; g++) if (grupCalisti[g]) calisanGrup++;

  Serial.println("\n--- SONUC ---");
  for (int g = 0; g < GRUP; g++) {
    for (int j = 0; j < MAXP; j++) {
      if (!aktif(g, j)) continue;
      const char* kod;
      const char* durum;
      char ek[40] = "";
      if (!grupCalisti[g]) {
        kod = "KONTROL";
        if (grupHep(g, false))       durum = "Grup hep LOW (bir pin GND'ye kisa devre ya da jumper GND'ye degiyor)";
        else if (grupHep(g, true)) durum = "Grup hep HIGH (bir pin 3V3'e kisa devre ya da jumper 3V3'e degiyor)";
        else                          durum = "Grup hic sinyal gecirmiyor (kablo takili mi?)";
      } else if (hepLow[g][j] && !(cikisOk[g][j] && girisOk[g][j])) {
        kod = "BOZUK"; durum = "Pin hep LOW (GND'ye kisa devre olabilir)";
      } else if (sadeceGiris(g, j)) {
        bool iyi = girisOk[g][j];
        kod = iyi ? "OK" : "BOZUK"; durum = iyi ? "Saglam" : "Analog okumuyor";
        snprintf(ek, sizeof(ek), " (%d / %d mV)", olculen[g][j][0], olculen[g][j][1]);
      } else if (gruplar[g].analog) {
        bool iyi = cikisOk[g][j];
        kod = iyi ? "OK" : "BOZUK"; durum = iyi ? "Saglam" : "DAC cikis vermiyor";
      } else if (cikisOk[g][j] && girisOk[g][j]) {
        kod = "OK"; durum = "Saglam";
      } else if (!cikisOk[g][j] && !girisOk[g][j]) {
        kod = "BOZUK"; durum = "Sinyal gecmiyor (pin ya da lehim)";
      } else if (!cikisOk[g][j]) {
        kod = "BOZUK"; durum = "Cikis vermiyor";
      } else {
        kod = "BOZUK"; durum = "Giris okumuyor";
      }
      toplam++;
      if (strcmp(kod, "OK") != 0) sorunlu++;
      Serial.printf("%-5s %s%s\n", gruplar[g].ad[j], durum, ek);
      Serial.printf("DPT;PIN;%s;%s;%s%s;%s\n", gruplar[g].ad[j], kod, durum, ek, gruplar[g].etiket);
    }
  }
  if (imuSorunlu) {
    toplam++;
    sorunlu++;
    Serial.println("IMU   Dahili hareket sensoru cevap vermiyor");
    Serial.println("DPT;PIN;IMU;KONTROL;IMU cevap vermiyor (sensor ya da SDA/SCL hatti arizali olabilir; kartta '1A v2' yaziyorsa dikkate almayin);Kart");
  }
  return sorunlu;
}

void baslikYaz() {
  String id = kimlik();
  Serial.printf("\n=== Deneyap Pin Test %s | %s | Kimlik: %s ===\n", FW_SURUM, modelAdi, id.c_str());
  Serial.printf("DPT;BASLA;%s;%s;%s\n", FW_SURUM, AILE, DUZENEK);
  Serial.printf("DPT;MODEL;%s;%s\n", modelAdi, id.c_str());
}

// Duzenek bu kartin degilse pinlere dokunmadan bunu bildirir.
void uyumsuzYaz(const String& istenen) {
  baslikYaz();
  Serial.printf("Bu kart '%s' duzenegi ister, secili duzenek '%s'. Pinlere dokunulmadi.\n", DUZENEK, istenen.c_str());
  Serial.println("DPT;OZET;DUZENEK_UYUMSUZ;0;0;0");
  Serial.println("DPT;BITTI");
}

void testiCalistir() {
  ledDurdur();
  modelBelirle();                          // her testte yeniden: acilistaki tanima yanilmis olabilir
  ledYak(0, 0, 64);                        // mavi: test suruyor
  memset(cikisOk, 0, sizeof(cikisOk));
  memset(girisOk, 0, sizeof(girisOk));
  memset(grupCalisti, 0, sizeof(grupCalisti));
  memset(olculen, 0, sizeof(olculen));
  hepsiniBirak();
  baslikYaz();
  hepLowBul();

  for (int g = 0; g < GRUP; g++) {
    if (gruplar[g].analog) analogTest(g); else dijitalTest(g);
    hepsiniBirak();
  }
  int kisa = kisaDevreTesti();
  int toplam, calisanGrup;
  int sorunlu = rapor(toplam, calisanGrup);
  atlananlariYaz();

  const char* sonuc;
  if (calisanGrup == 0) sonuc = "DUZENEK_YOK";
  else if (sorunlu == 0 && kisa == 0) sonuc = "SAGLAM";
  else sonuc = "BOZUK";

  Serial.printf("Toplam %d pin: %d saglam, %d sorunlu, %d kisa devre -> %s\n",
                toplam, toplam - sorunlu, sorunlu, kisa, sonuc);
  Serial.printf("DPT;OZET;%s;%d;%d;%d\n", sonuc, sorunlu, kisa, toplam);
  Serial.println("DPT;BITTI");

  hepsiniBirak();
#if CONFIG_IDF_TARGET_ESP32 || CONFIG_IDF_TARGET_ESP32S3
  i2cKurtar();                             // IMU'yu bosta birak; sonraki acilista dogru taninsin
#endif
  if (strcmp(sonuc, "SAGLAM") == 0) ledYak(0, 64, 0);        // yesil
  else if (strcmp(sonuc, "BOZUK") == 0) ledYak(64, 0, 0);    // kirmizi
  else ledYak(64, 32, 0);                                    // turuncu: duzenek yok
}

// Komutlar (satir sonu ile biter):
//   T:<duzenek>  ornek "T:kart" -> duzenek uyuyorsa testi calistirir
//   B:<duzenek>:<test>        -> parca testleri (bilesen.ino)
//   ?            -> kimlik bilgisini yazar (pinlere dokunmaz)
void komutIsle(String k) {
  k.trim();
  if (k.length() == 0) return;
  if (k == "?") {
    baslikYaz();
    Serial.println("DPT;OZET;KIMLIK;0;0;0");
    Serial.println("DPT;BITTI");
    return;
  }
  if (k.startsWith("B:") || k.startsWith("b:")) {
    bilesenKomut(k);
    butSessiz = millis() + 1500;
    return;
  }
  if (k.startsWith("T:") || k.startsWith("t:")) {
    String istenen = k.substring(2);
    istenen.toLowerCase();
    if (istenen == DUZENEK) {
      duzenekOnayli = true;
      testiCalistir();
    } else {
      uyumsuzYaz(istenen);
    }
  }
}

// ---------------------------------------------------------------- ana akis

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTON, INPUT_PULLUP);
  modelBelirle();                 // sadece IMU yoklamasi; test pinleri giris olarak kalir
  ledYak(8, 8, 8);                // soluk beyaz: hazir, komut bekliyor
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      komutIsle(komut);
      komut = "";
    } else if ((uint8_t)c < 0x20) {
      // kontrol karakterleri yok sayilir (LED testinde uygulama RX hattina sifir bayt gonderir)
    } else if (komut.length() < 32) {
      komut += c;
    }
  }
  ledYanipGuncelle();
  if (digitalRead(PIN_BUTON) == LOW && (int32_t)(millis() - butSessiz) > 0) {
    while (digitalRead(PIN_BUTON) == LOW) delay(10);
    if (duzenekOnayli) testiCalistir();   // duzenek uygulama tarafindan onaylanmadan test yok
  }
  delay(5);
}
