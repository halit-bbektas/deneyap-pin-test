# Güvenlik

## Açık bildirmek

Bir güvenlik açığı bulduysanız herkese açık issue açmayın. Depodaki **Security → Report a vulnerability** bölümünden gizli olarak bildirin. Bildirimde sorunun nasıl yeniden üretildiğini ve hangi tarayıcı ile kartta denediğinizi yazın.

## Uygulama neye erişir?

- **Seri port:** Web Serial yalnızca kullanıcının tarayıcının kendi penceresinden seçtiği porta bağlanır. Seçim penceresi yalnızca Deneyap kartlarında kullanılan USB yongalarını (Silicon Labs CP210x, Espressif yerleşik USB, WCH CH340) listeler.
- **Ağ:** Uygulama yalnızca kendi sitesindeki dosyaları indirir (`firmware/manifest.json` ve test yazılımı `.bin` dosyaları). Test sonuçları hiçbir sunucuya gönderilmez.
- **Depolama:** Test edilen kartların listesi yalnızca tarayıcının kendi deposunda (`localStorage`) tutulur ve **Temizle** düğmesiyle silinir.
- **Karta yazma:** Karta yalnızca bu depodaki test yazılımı yüklenir. Kartta kayıtlı önceki program bu sırada test yazılımıyla değiştirilir; kartı başka bir projede kullanmadan önce kendi programınızı yeniden yükleyin.

## Desteklenen sürüm

Yalnızca `main` dalındaki ve https://halit-bbektas.github.io/deneyap-pin-test/ adresindeki güncel sürüm desteklenir.
