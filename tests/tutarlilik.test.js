import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { ETIKETLER, MODELLER, DUZENEKLER, AILE_DUZENEK, CEVIRI, GRUP_RENKLERI, PARCALAR } from "../cekirdek.js";

const kok = new URL("../", import.meta.url);
const oku = (yol) => readFileSync(new URL(yol, kok), "utf8");
const GUC_PINLERI = new Set(["EN", "GND", "3V3", "5V", "VBAT", "BAT", "BT"]);

const etiketiBul = (etiket, [taraf, satir]) => ETIKETLER[etiket][taraf === "L" ? "sol" : "sag"][satir - 1];

test("her modelin etiketi, düzeneği ve parça listesi tanımlı", () => {
  for (const m of MODELLER) {
    assert.ok(ETIKETLER[m.etiket], `${m.ad}: etiket yok`);
    assert.ok(DUZENEKLER[m.duzenek], `${m.ad}: düzenek yok`);
    assert.equal(AILE_DUZENEK[m.islemci], m.duzenek, `${m.ad}: işlemci ailesi başka düzeneğe gidiyor`);
    assert.ok(PARCALAR[m.ad], `${m.ad}: parça listesi yok`);
  }
});

test("düzeneklerin etiket seçenekleri var olan etiketleri gösterir", () => {
  for (const [ad, d] of Object.entries(DUZENEKLER)) {
    for (const [etiket] of d.etiketSecenekleri) assert.ok(ETIKETLER[etiket], `${ad}: ${etiket}`);
    assert.ok(d.gruplar.length <= GRUP_RENKLERI.length, `${ad}: grup rengi yetmiyor`);
  }
});

test("düzeneklerde bir pin iki kez kullanılmaz", () => {
  for (const [ad, d] of Object.entries(DUZENEKLER)) {
    const gorulen = new Set();
    for (const g of d.gruplar) {
      for (const [t, n] of g.pinler) {
        const k = `${t}${n}`;
        assert.ok(!gorulen.has(k), `${ad}: ${k} iki kez`);
        gorulen.add(k);
      }
    }
    const satirlar = d.gruplar.map((g) => g.satir);
    assert.equal(new Set(satirlar).size, satirlar.length, `${ad}: toplama satırı çakışıyor`);
  }
});

test("jumper'lar hiçbir kartta güç pinine bağlanmaz", () => {
  for (const [ad, d] of Object.entries(DUZENEKLER)) {
    for (const [etiket] of d.etiketSecenekleri) {
      for (const g of d.gruplar) {
        for (const konum of g.pinler) {
          const pin = etiketiBul(etiket, konum);
          assert.ok(pin, `${ad}/${etiket}: ${konum.join("")} kartta yok`);
          assert.ok(!GUC_PINLERI.has(pin), `${ad}/${etiket}: ${konum.join("")} güç pini (${pin})`);
        }
      }
    }
  }
});

test("test yazılımındaki pin grupları uygulamadaki düzeneklerle aynı", () => {
  const ino = oku("firmware-src/dpt_esp32/dpt_esp32.ino").replace(/\r\n/g, "\n");
  const tablolar = {
    G_KART: ["kart", "kart1"],
    G_V2: ["kart", "kartv2"],
    G_1AV2: ["kart", "kart1av2"],
    G_MINIV2: ["mini", "miniv2"],
    G_MINI: ["mini", "mini"],
    G_G: ["g", "g"],
  };
  for (const [tablo, [duzenek, etiket]] of Object.entries(tablolar)) {
    const govde = ino.match(new RegExp(`const Grup ${tablo}\\[\\] = \\{([\\s\\S]*?)\\n\\};`));
    assert.ok(govde, `${tablo} bulunamadı`);
    const gruplar = [...govde[1].matchAll(/\{"Grup \d+", \{[^}]*\},\s*\{([^}]*)\}/g)]
      .map((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort());
    const beklenen = DUZENEKLER[duzenek].gruplar.map((g) => g.pinler.map((k) => etiketiBul(etiket, k)).sort());
    assert.deepEqual(gruplar, beklenen, `${tablo} ile ${duzenek}/${etiket} uyuşmuyor`);
  }
});

test("çeviri anahtarları ASCII ve tekil", () => {
  const anahtarlar = CEVIRI.map(([k]) => k);
  assert.equal(new Set(anahtarlar).size, anahtarlar.length);
  for (const k of anahtarlar) assert.match(k, /^[\x20-\x7e]+$/, k);
});

test("manifest her aile için var olan bir yazılım dosyasını gösterir", () => {
  const manifest = JSON.parse(oku("firmware/manifest.json"));
  assert.match(manifest.surum, /^\d+\.\d+\.\d+$/);
  for (const [aile, a] of Object.entries(manifest.aileler)) {
    assert.ok(existsSync(new URL(`firmware/${a.dosya}`, kok)), `${aile}: ${a.dosya} yok`);
    assert.equal(a.duzenek, AILE_DUZENEK[aile], `${aile}: düzenek farklı`);
    for (const m of a.modeller) assert.equal(MODELLER.find((x) => x.ad === m)?.islemci, aile, `${aile}: ${m}`);
  }
});

test("sayfa uygulamayı, uygulama da çekirdeği modül olarak yükler", () => {
  assert.match(oku("index.html"), /<script type="module" src="app\.js"><\/script>/);
  assert.match(oku("app.js"), /from "\.\/cekirdek\.js"/);
});
