"""arduino-cli'nin urettigi merged.bin dosyasinin sonundaki bos (0xFF) kismi kirpar.

Kullanim:
    python tools/kirp.py <derleme_klasoru>/dpt_esp32.ino.merged.bin firmware/dpt_esp32.bin
"""
import sys


def main() -> None:
    kaynak, hedef = sys.argv[1], sys.argv[2]
    veri = open(kaynak, "rb").read()
    n = len(veri)
    while n > 0 and veri[n - 1] == 0xFF:
        n -= 1
    n = (n + 4095) // 4096 * 4096
    open(hedef, "wb").write(veri[:n])
    print(f"{kaynak}: {len(veri)} bayt -> {hedef}: {n} bayt")


if __name__ == "__main__":
    main()
