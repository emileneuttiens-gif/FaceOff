# FaceOff

Herken de voetballer op basis van zijn gezicht – sneller dan je tegenstander.

- **1-tegen-1 live**: maak een kamer, deel de code of link, en speel van op twee verschillende toestellen.
- **Spelmodi**: bekende spelers, per competitie, per club, per land, legendes, alle spelers, vrouwenvoetbal.
- **Eerlijk**: de server (Supabase) beslist wie het eerst juist antwoordt en houdt de tijd bij.
- **Punten**: 100 per juist antwoord + snelheidsbonus tot 100. Na 8, 14, 20 en 25 seconden verschijnen hints.
- **Oefenen**: speel alleen om te trainen.

## Techniek

- Statische site (GitHub Pages): `index.html`, `css/`, `js/`.
- Supabase: tabel `players` (±5.900 voetballers met vrij gelicentieerde foto's van Wikimedia Commons) en de spellogica in `supabase/game_schema.sql`.
- Realtime-updates via Supabase Realtime, met een `tick` elke seconde als vangnet.

## Foto's

Alle spelersfoto's komen van Wikimedia Commons onder een open licentie; fotograaf en licentie staan onder elke foto.
