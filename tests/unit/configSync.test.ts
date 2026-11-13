/**
 * 밸런스 데이터가 한 곳에서만 바뀌어 서버/클라이언트가 어긋나는 일을 막습니다.
 * src/config/*.ts 와 supabase 마이그레이션의 시드 값이 같은지 비교합니다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CROPS } from '@/config/crops';
import { FARM_LEVELS } from '@/config/farm';
import { QUESTS } from '@/config/quests';
import { growthInfo, sanitizeChat, validateChat } from '@/features/economy/rules';

const dir = path.resolve(__dirname, '../../supabase/migrations');
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n');

describe('설정 ↔ SQL 시드 일치', () => {
  it('작물 가격/성장 시간', () => {
    for (const c of CROPS) {
      const re = new RegExp(`\\('${c.id}',\\s*'${c.name}',\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`);
      const m = sql.match(re);
      expect(m, c.id).toBeTruthy();
      expect([+m![1], +m![2], +m![3], +m![4]]).toEqual([c.seedPrice, c.growSeconds, c.sellPrice, c.regrowSeconds]);
    }
    expect(CROPS.length).toBeGreaterThanOrEqual(10);
  });
  it('농장 확장 단계', () => {
    for (const l of FARM_LEVELS) expect(sql).toContain(`(${l.level}, ${l.size}, ${l.cost})`);
  });
  it('퀘스트', () => {
    for (const q of QUESTS) {
      const re = new RegExp(`\\('${q.id}',\\s*'${q.kind}',\\s*${q.cropId ? `'${q.cropId}'` : 'null'},\\s*${q.target},\\s*${q.reward},`);
      expect(sql, q.id).toMatch(re);
    }
  });
});

describe('규칙', () => {
  it('성장 단계 4단계', () => {
    const c = { x: 0, y: 0, cropId: 'carrot', plantedAt: 0, readyAt: 100_000 };
    expect(growthInfo(c, 0).stage).toBe(0);
    expect(growthInfo(c, 30_000).stage).toBe(1);
    expect(growthInfo(c, 70_000).stage).toBe(2);
    expect(growthInfo(c, 99_999).stage).toBe(2);
    expect(growthInfo(c, 100_000).stage).toBe(3);
    expect(growthInfo(c, 100_000).ready).toBe(true);
  });
  it('채팅 정리', () => {
    expect(sanitizeChat('a\u0000b‮c  d')).toBe('abc d');
    expect(validateChat('   ')).toEqual({ ok: false, code: 'CHAT_EMPTY' });
    expect(validateChat('😀'.repeat(100))).toMatchObject({ ok: true });
    expect(validateChat('😀'.repeat(101))).toEqual({ ok: false, code: 'CHAT_TOO_LONG' });
  });
});

describe('과일 나무: 설정 ↔ 지도 ↔ SQL 시드 일치', () => {
  it('세 곳의 나무 ID·종류가 같다', async () => {
    const { FRUIT_TREES } = await import('@/config/fruit');
    const { buildVillage } = await import('@/game/maps/village');
    const { buildFarm } = await import('@/game/maps/farm');
    const fromMaps = [...buildVillage().objects, ...buildFarm().objects]
      .filter((o) => o.fruitId).map((o) => `${o.fruitId}=${o.fruit}`).sort();
    const fromConfig = FRUIT_TREES.map((t) => `${t.id}=${t.fruit}`).sort();
    const fromSql = [...sql.matchAll(/\('([vf]:\d+,\d+)', '(village|farm)', '(apple|peach)', 30\)/g)].map((m) => `${m[1]}=${m[3]}`).sort();
    expect(fromMaps).toEqual(fromConfig);
    expect(fromSql).toEqual(fromConfig);
  });
});

describe('상점 품목 · 물고기 · 집: 설정 ↔ SQL 시드 일치', () => {
  const flat = sql.replace(/\s+/g, ' ');
  it('비료 / 낚싯대 / 가구 가격과 크기', async () => {
    const { FERTILIZERS, RODS, FURNITURE } = await import('@/config/shop');
    for (const f of FERTILIZERS) expect(flat).toContain(`('${f.id}', 'fertilizer', '${f.name}', ${f.price}, ${f.minutes}, 0, 1, 1, false`);
    for (const r of RODS) expect(flat).toContain(`('${r.id}', 'rod', '${r.name}', ${r.price}, 0, ${r.tier}, 1, 1, false, ${r.tier}, ${r.uses})`);
    for (const f of FURNITURE) expect(flat).toContain(`('${f.id}', 'furniture', '${f.name}', ${f.price}, 0, 0, ${f.w}, ${f.h}, ${f.walkable}`);
    expect(FERTILIZERS[1].price).toBe(FERTILIZERS[0].price * 2.5); // 10분 비료 = 4분 비료 × 2.5
  });
  it('물고기 가격 / 확률', async () => {
    const { FISH, FISH_WEIGHTS } = await import('@/config/shop');
    for (const f of FISH) expect(flat).toContain(`('${f.id}', '${f.name}', ${f.price}, `);
    for (const [tier, w] of Object.entries(FISH_WEIGHTS)) for (const [id, n] of Object.entries(w)) expect(flat).toContain(`(${tier}, '${id}', ${n})`);
  });
  it('집 확장 단계', async () => {
    const { HOUSE_LEVELS } = await import('@/config/shop');
    for (const l of HOUSE_LEVELS) expect(flat).toContain(`(${l.level}, ${l.w}, ${l.h}, ${l.cost})`);
  });
});
