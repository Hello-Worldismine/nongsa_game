-- 햇살마을 — 비료 가격 조정 (한 칸에 쓰는 것이라 더 저렴하게): 4분 비료 20G · 10분 비료 50G
-- ⚠ src/config/shop.ts 와 같아야 합니다
insert into public.shop_items (id, category, name, price, minutes, tier, w, h, walkable, sort) values
  ('fert:4',  'fertilizer', '4분 비료',  20, 4, 0, 1, 1, false, 1),
  ('fert:10', 'fertilizer', '10분 비료', 50, 10, 0, 1, 1, false, 2)
on conflict (id) do update set price = excluded.price, name = excluded.name, minutes = excluded.minutes;
