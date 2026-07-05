# Word Quiz

YÖKDİL odaklı, tarayıcıda çalışan İngilizce kelime quiz uygulaması. PDF
kaynaklarından çıkarılan 500 kelimeyi Türkçe anlamları ve sağlık, sosyal bilimler ve fen
örnekleriyle sunar.

## Modüller

- **Öğren:** Dokununca İngilizceden Türkçeye dönen flashcard'lar, örnek cümleler ve
  İngilizce-Türkçe anlamı aynı satırda gösteren 30'ar kayıtlık ayrıntılı liste.
- **Test:** Hafta, 10/20/30 soru ve İngilizce-Türkçe veya Türkçe-İngilizce yön seçimi;
  anlık geri bildirim, sonuç ekranı ve yanlış inceleme.
- **Oyun:** Altı çiftlik kelime eşleştirme ve 45 saniyelik hız turu.

İlerleme, test istatistikleri, oyun rekorları ve tema tercihi tarayıcının `localStorage`
alanında saklanır. Arayüz masaüstü, tablet ve mobil için responsive tasarlanmıştır.

## Çalıştırma

Uygulama statiktir; veri dosyasını `fetch` ile okuduğu için yerel bir HTTP sunucusu gerekir.

```bash
npm run serve
```

Ardından `http://localhost:8000` adresini açın.

## Veriyi yeniden üretme

```bash
python3 -m pip install -r requirements.txt
npm run parse-data
```

Parser `Word/` altındaki dört PDF'nin ana kelime bölümlerini okuyup
`data/vocabulary.json` dosyasını üretir. PDF sonlarındaki eş anlamlı kelime ekleri quiz
havuzuna dahil edilmez.

## Kod yapısı

- `app.js`: uygulama kabuğu, bölüm navigasyonu, tema ve genel metrikler
- `modules/learn.js`: kart/liste öğrenme akışı
- `modules/test.js`: test oturumu ve sonuç akışı
- `modules/games.js`: eşleştirme ve hız oyunları
- `modules/storage.js`: sürümlü yerel ilerleme kaydı
- `modules/utils.js`: ortak filtreleme, seçenek ve DOM yardımcıları
