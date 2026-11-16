import { test } from "node:test";
import assert from "node:assert/strict";
import { blokCoz, tr, kacis, usbTuru, sonucMesaji, olcumTr, modelBul, konumlar, ESPRESSIF } from "../cekirdek.js";

const ornekBlok = [
  "DPT;BASLA;1.3.0;ESP32;kart",
  "DPT;MODEL;Deneyap Kart 1A;A1B2C3D4E5F6",
  "DPT;PIN;D0;OK;Saglam;Grup 1",
  "DPT;PIN;D1;BOZUK;Sinyal gecmiyor (pin ya da lehim);Grup 1",
  "DPT;ATLA;VBAT;Duzenekte bagli degil",
  "DPT;KISA;Grup 1;Grup 2;SCK",
  "DPT;BILESEN;FLASH;OK;;4 MB",
  "DPT;OZET;BOZUK;1;1;24",
  "DPT;BITTI",
];

test("blokCoz kartın gönderdiği sonucu doğru çözer", () => {
  const r = blokCoz(ornekBlok);
  assert.equal(r.surum, "1.3.0");
  assert.equal(r.aile, "ESP32");
  assert.equal(r.duzenek, "kart");
  assert.equal(r.model, "Deneyap Kart 1A");
  assert.equal(r.kimlik, "A1B2C3D4E5F6");
  assert.equal(r.pinler.length, 2);
  assert.deepEqual(r.pinler[0], { ad: "D0", kod: "OK", aciklama: "Sağlam", grup: "Grup 1" });
  assert.equal(r.pinler[1].aciklama, "Sinyal geçmiyor");
  assert.deepEqual(r.atlanan, [{ ad: "VBAT", kod: "ATLA", aciklama: "Düzenekte bağlı değil" }]);
  assert.deepEqual(r.kisa, [{ a: "Grup 1", b: "Grup 2", pin: "SCK" }]);
  assert.deepEqual(r.bilesenler, [{ kod: "FLASH", durum: "OK", aciklama: "", deger: "4 MB" }]);
  assert.equal(r.sonuc, "BOZUK");
  assert.equal(r.sorunlu, 1);
  assert.equal(r.kisaSayisi, 1);
  assert.equal(r.toplam, 24);
});

test("blokCoz düzenek gelmezse işlemci ailesinden bulur", () => {
  assert.equal(blokCoz(["DPT;BASLA;1.2.0;ESP32-S2"]).duzenek, "mini");
  assert.equal(blokCoz(["DPT;BASLA;1.2.0;ESP32-C3"]).duzenek, "g");
  assert.equal(blokCoz(["DPT;BASLA;1.2.0;BILINMEYEN"]).duzenek, "");
});

test("blokCoz tanımadığı satırları yok sayar", () => {
  const r = blokCoz(["rst:0x1 (POWERON_RESET)", "DPT;BILINMEYEN;x", "DPT;OZET;SAGLAM;0;0;24"]);
  assert.equal(r.sonuc, "SAGLAM");
  assert.equal(r.pinler.length, 0);
});

test("tr kartın ASCII mesajlarını Türkçeye çevirir, ekini korur", () => {
  assert.equal(tr("Saglam"), "Sağlam");
  assert.equal(tr("Hic ag bulunamadi"), "Hiç ağ bulunamadı");
  assert.equal(tr("Cikis vermiyor (D4)"), "Çıkış vermiyor (D4)");
  assert.equal(tr("Bilinmeyen mesaj"), "Bilinmeyen mesaj");
});

test("kacis HTML özel karakterlerini zararsız hale getirir", () => {
  assert.equal(kacis(`<img src=x onerror="alert('x')">&`), "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;");
  assert.equal(kacis(42), "42");
});

test("usbTuru bağlantı türünü USB kimliğinden ayırt eder", () => {
  const port = (usbVendorId, usbProductId) => ({ getInfo: () => ({ usbVendorId, usbProductId }) });
  assert.equal(usbTuru(port(0x10c4, 0xea60)), "uart");
  assert.equal(usbTuru(port(0x1a86, 0x7523)), "uart");
  assert.equal(usbTuru(port(ESPRESSIF, 0x1001)), "jtag");
  assert.equal(usbTuru(port(ESPRESSIF, 0x0002)), "rom");
  assert.equal(usbTuru(port(ESPRESSIF, 0x80c2)), "tinyusb");
});

test("sonucMesaji her sonuç için doğru mesajı verir", () => {
  const r = { sonuc: "SAGLAM", model: "Deneyap Kart 1A", surum: "1.3.0", toplam: 24, sorunlu: 0, kisaSayisi: 0 };
  assert.match(sonucMesaji(r), /^Pinler sağlam: 24 pinin hepsi/);
  assert.match(sonucMesaji({ ...r, surum: "1.2.0" }), /^Kart sağlam/);
  assert.match(sonucMesaji({ ...r, sonuc: "DUZENEK_YOK" }), /^Hiçbir grupta sinyal geçmedi/);
  assert.match(sonucMesaji({ ...r, sonuc: "DUZENEK_UYUMSUZ" }), /başka bir düzenek/);
  assert.equal(sonucMesaji({ ...r, sonuc: "BOZUK", sorunlu: 2, kisaSayisi: 1 }), "Sorun bulundu: 2 pin, 1 kısa devre.");
  assert.equal(sonucMesaji({ ...r, sonuc: "BOZUK", sorunlu: 3, kisaSayisi: 0 }), "Sorun bulundu: 3 pin.");
});

test("olcumTr ölçüm metinlerindeki Türkçe karakterleri düzeltir", () => {
  assert.equal(olcumTr("en guclu ag -40 dBm"), "en güçlü ağ -40 dBm");
  assert.equal(olcumTr(null), "");
});

test("modelBul ve konumlar", () => {
  assert.equal(modelBul("Deneyap Kart v2").islemci, "ESP32-S3");
  assert.equal(modelBul("Yok"), undefined);
  assert.deepEqual(konumlar("g").L1, { grup: 0, sira: 0 });
  assert.deepEqual(konumlar("kart").R12, { grup: 0, sira: 2 });
});
