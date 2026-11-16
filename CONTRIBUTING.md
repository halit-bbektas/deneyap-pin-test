# Katkıda bulunma

Hata bildirimleri, yeni kart desteği ve düzeltmeler memnuniyetle karşılanır.

## Hata bildirmek

**Issues → New issue → Hata bildirimi** şablonunu kullanın. Kart modeli, kurulu düzenek, tarayıcı ve uygulamadaki **Gelişmiş** bölümünden kopyalanan günlük, sorunu yeniden üretmek için yeterli olur. Mümkünse sağlam olduğunu bildiğiniz bir kartla aynı düzenekte deneyip sonucunu da yazın.

Kullanım soruları için **Discussions → Q&A** bölümünü kullanın.

## Geliştirme ortamı

Uygulama derleme gerektirmez; dosyalar olduğu gibi yayınlanır. Yerelde denemek için klasörü herhangi bir statik sunucuyla açın, örneğin:

```bash
npx serve .
```

Web Serial yalnızca `localhost` ya da HTTPS üzerinde çalışır; kartla denemek için Chrome ya da Edge kullanın.

## Değişiklik göndermek

1. Ayrı bir dalda çalışın ve değişikliği küçük tutun.
2. Testleri çalıştırın, hepsi geçmeli:

   ```bash
   npm test
   ```

3. Kart ya da düzenek bilgisi (`cekirdek.js` içindeki `ETIKETLER`, `DUZENEKLER`, `MODELLER`) değiştiyse test yazılımındaki pin gruplarını da (`firmware-src/dpt_esp32/dpt_esp32.ino`) aynı şekilde güncelleyin. `tests/tutarlilik.test.js` ikisinin uyuşmadığını yakalar.
4. Test yazılımı değiştiyse `FW_SURUM` ile `firmware/manifest.json` içindeki `surum` birlikte artırılmalı ve `.bin` dosyaları README'deki komutlarla yeniden derlenmeli.
5. Pull request açıklamasında neyi, neden değiştirdiğinizi ve hangi kartla denediğinizi yazın.

## Güvenlik

Düzenek ya da pin tablosundaki bir hata, jumper'ların bir pini GND ya da 3V3 hattına bağlamasına yol açabilir. Bu tür değişiklikler gerçek kartta denenmeden birleştirilmez.
