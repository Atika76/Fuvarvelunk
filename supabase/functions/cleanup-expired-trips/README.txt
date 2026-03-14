FELTÖLTÉS / TELEPÍTÉS

1. Supabase Dashboard -> Edge Functions -> Create new function
   név: cleanup-expired-trips
2. A teljes index.ts tartalmát másold be.
3. Function secrets:
   - CRON_SECRET = adj meg egy hosszú saját titkot
4. Deploy function.
5. Ezután futtasd le a projekt gyökerében lévő:
   supabase-expired-trips-edge-cron.sql

A function minden futáskor törli a 3 napnál régebben lejárt fuvarokat,
és előtte kitakarítja a hozzájuk tartozó foglalásokat és értékeléseket is.
