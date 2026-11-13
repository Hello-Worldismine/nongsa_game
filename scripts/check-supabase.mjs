// Supabase 연결 점검 (읽기 전용 — 계정이나 데이터를 만들지 않습니다)
// 사용법: npm run check:supabase   (.env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 사용)
import { existsSync, readFileSync } from 'node:fs';

function loadEnv() {
  const env = { ...process.env };
  for (const f of ['.env', '.env.local']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const key = env.VITE_SUPABASE_ANON_KEY;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { console.log(`  ❌ ${m}`); process.exitCode = 1; };
const warn = (m) => console.log(`  ⚠️  ${m}`);

console.log('\n🌱 햇살마을 Supabase 연결 점검\n');
if (!url || !key || url.includes('your-project')) {
  bad('.env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없어요 (.env.example 참고)');
  process.exit(1);
}
if (/service_role/.test(Buffer.from(key.split('.')[1] ?? '', 'base64').toString())) {
  bad('service_role 키가 들어 있어요! 브라우저에는 anon(public) 키만 넣어야 해요.');
  process.exit(1);
}
if (env.VITE_BACKEND && env.VITE_BACKEND !== 'supabase') warn(`VITE_BACKEND=${env.VITE_BACKEND} — 실서버를 쓰려면 supabase 로 바꿔 주세요`);

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// 1) 프로젝트 / Auth 설정
try {
  const r = await fetch(`${url}/auth/v1/settings`, { headers });
  if (!r.ok) bad(`Auth 설정 조회 실패 (HTTP ${r.status}) — URL 또는 anon 키를 확인해 주세요`);
  else {
    const s = await r.json();
    ok(`프로젝트 연결 성공 (${url})`);
    s.external?.email ? ok('이메일 로그인 사용 중') : bad('Authentication → Providers 에서 Email 을 켜 주세요');
    if (s.disable_signup) bad('회원가입이 꺼져 있어요 (Authentication → Sign In / Providers → Allow new users to sign up)');
    s.mailer_autoconfirm ? warn('이메일 인증 없이 가입돼요 (Confirm email 꺼짐) — 친구끼리라면 괜찮아요') : ok('이메일 인증 사용 중');
  }
} catch (e) {
  bad(`서버에 접속할 수 없어요: ${e.message}`);
  process.exit(1);
}

// 2) 마이그레이션 적용 여부 (로그인하지 않은 anon 은 실행 권한이 없어야 정상)
const rpc = await fetch(`${url}/rest/v1/rpc/claim_player_slot`, { method: 'POST', headers, body: '{}' });
const body = await rpc.json().catch(() => ({}));
if (body.code === 'PGRST202' || /Could not find the function/i.test(body.message ?? '')) {
  bad('마이그레이션이 아직 적용되지 않았어요 → supabase/migrations/*.sql 을 SQL Editor 에서 실행해 주세요');
} else if (body.code === '42501' || /permission denied/i.test(body.message ?? '')) {
  ok('마이그레이션 적용됨 + 비로그인 사용자의 RPC 호출 차단 확인');
} else if (/NOT_AUTHENTICATED/.test(body.message ?? '')) {
  warn('RPC 는 있지만 anon 에게 실행 권한이 남아 있어요 (함수 안에서 차단되긴 함). 마이그레이션 끝부분의 권한 설정을 다시 실행해 주세요');
} else {
  warn(`예상하지 못한 응답: HTTP ${rpc.status} ${JSON.stringify(body).slice(0, 200)}`);
}

// 2-2) 두 번째 마이그레이션 (보관함 + 주민 게시판)
const rpc2 = await fetch(`${url}/rest/v1/rpc/list_board_posts`, { method: 'POST', headers, body: '{}' });
const body2 = await rpc2.json().catch(() => ({}));
if (body2.code === 'PGRST202' || /Could not find the function/i.test(body2.message ?? '')) {
  bad('보관함·주민 게시판 SQL(20261113000000_storage_and_board.sql)이 아직 적용되지 않았어요 → SQL Editor 에서 실행해 주세요');
} else if (body2.code === '42501' || /permission denied/i.test(body2.message ?? '')) {
  ok('보관함·주민 게시판 SQL 적용됨');
} else {
  warn(`보관함·게시판 확인 응답: HTTP ${rpc2.status} ${JSON.stringify(body2).slice(0, 160)}`);
}

// 2-3) 세 번째 마이그레이션 (농장 방명록)
const rpc3 = await fetch(`${url}/rest/v1/rpc/list_guestbook`, { method: 'POST', headers, body: JSON.stringify({ p_owner: '00000000-0000-0000-0000-000000000000' }) });
const body3 = await rpc3.json().catch(() => ({}));
if (body3.code === 'PGRST202' || /Could not find the function/i.test(body3.message ?? '')) {
  bad('농장 방명록 SQL(20261113010000_farm_guestbook.sql)이 아직 적용되지 않았어요 → SQL Editor 에서 실행해 주세요');
} else if (body3.code === '42501' || /permission denied/i.test(body3.message ?? '')) {
  ok('농장 방명록 SQL 적용됨');
} else {
  warn(`방명록 확인 응답: HTTP ${rpc3.status} ${JSON.stringify(body3).slice(0, 160)}`);
}

// 2-4) 네 번째 마이그레이션 (과일 나무 + 카지노)
const rpc4 = await fetch(`${url}/rest/v1/rpc/casino_state`, { method: 'POST', headers, body: '{}' });
const body4 = await rpc4.json().catch(() => ({}));
if (body4.code === 'PGRST202' || /Could not find the function/i.test(body4.message ?? '')) {
  bad('과일 나무·카지노 SQL(20261113020000_fruit_and_casino.sql)이 아직 적용되지 않았어요 → SQL Editor 에서 실행해 주세요');
} else if (body4.code === '42501' || /permission denied/i.test(body4.message ?? '')) {
  ok('과일 나무·카지노 SQL 적용됨');
} else {
  warn(`과일·카지노 확인 응답: HTTP ${rpc4.status} ${JSON.stringify(body4).slice(0, 160)}`);
}

// 2-5) 다섯 번째 마이그레이션 (물 주기 + 분수 소원)
const rpc5 = await fetch(`${url}/rest/v1/rpc/water_status`, { method: 'POST', headers, body: '{}' });
const body5 = await rpc5.json().catch(() => ({}));
if (body5.code === 'PGRST202' || /Could not find the function/i.test(body5.message ?? '')) {
  bad('물 주기·분수 SQL(20261113030000_water_and_wish.sql)이 아직 적용되지 않았어요 → SQL Editor 에서 실행해 주세요');
} else if (body5.code === '42501' || /permission denied/i.test(body5.message ?? '')) {
  ok('물 주기·분수 SQL 적용됨');
} else {
  warn(`물 주기·분수 확인 응답: HTTP ${rpc5.status} ${JSON.stringify(body5).slice(0, 160)}`);
}

// 2-6) 물 주기 알림 (notices)
const rpc6 = await fetch(`${url}/rest/v1/rpc/list_notices`, { method: 'POST', headers, body: JSON.stringify({ p_after: 0 }) });
const body6 = await rpc6.json().catch(() => ({}));
if (body6.code === 'PGRST202' || /Could not find the function/i.test(body6.message ?? '')) {
  bad('물 주기 알림 SQL(20261113060000_water_notice.sql)이 아직 적용되지 않았어요 → SQL Editor 에서 실행해 주세요');
} else if (body6.code === '42501' || /permission denied/i.test(body6.message ?? '')) {
  ok('물 주기 알림 SQL 적용됨');
} else {
  warn(`알림 확인 응답: HTTP ${rpc6.status} ${JSON.stringify(body6).slice(0, 160)}`);
}

// 2-7) 낚시 · 비료 · 집 꾸미기
const rpc7 = await fetch(`${url}/rest/v1/rpc/get_house`, { method: 'POST', headers, body: JSON.stringify({ p_owner: '00000000-0000-0000-0000-000000000000' }) });
const body7 = await rpc7.json().catch(() => ({}));
if (body7.code === 'PGRST202' || /Could not find the function/i.test(body7.message ?? '')) {
  bad('낚시·비료·집 꾸미기 SQL(20261113070000_fishing_fertilizer_house.sql)이 아직 적용되지 않았어요 → SQL Editor 에서 실행해 주세요');
} else if (body7.code === '42501' || /permission denied/i.test(body7.message ?? '')) {
  ok('낚시·비료·집 꾸미기 SQL 적용됨');
} else {
  warn(`낚시·집 확인 응답: HTTP ${rpc7.status} ${JSON.stringify(body7).slice(0, 160)}`);
}

// 2-8) 낮과 밤 · 마을 거지
const rpc8 = await fetch(`${url}/rest/v1/rpc/beggar_status`, { method: 'POST', headers, body: '{}' });
const body8 = await rpc8.json().catch(() => ({}));
if (body8.code === 'PGRST202' || /Could not find the function/i.test(body8.message ?? '')) {
  bad('낮·밤 거지 SQL(20261113100000_night_beggars.sql)이 아직 적용되지 않았어요 → SQL Editor 에서 실행해 주세요');
} else if (body8.code === '42501' || /permission denied/i.test(body8.message ?? '')) {
  ok('낮·밤 거지 SQL 적용됨');
} else {
  warn(`거지 확인 응답: HTTP ${rpc8.status} ${JSON.stringify(body8).slice(0, 160)}`);
}

// 3) anon 이 테이블을 읽을 수 없어야 함
const t = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, { headers });
const tb = await t.json().catch(() => null);
if (t.status === 401 || t.status === 403 || (tb && tb.code === '42501')) ok('비로그인 사용자의 테이블 조회 차단 확인');
else if (tb && tb.code === 'PGRST205') bad('profiles 테이블이 없어요 (마이그레이션 미적용)');
else if (Array.isArray(tb) && tb.length === 0) warn('profiles 조회가 빈 결과로 허용됨 — RLS 로 막히긴 하지만 권한 회수가 적용됐는지 확인해 주세요');
else warn(`profiles 조회 응답: HTTP ${t.status}`);

console.log('\n📋 대시보드에서 직접 확인할 것');
console.log('  - Authentication → URL Configuration: Site URL / Redirect URLs 에 배포 주소와 http://localhost:5173/**');
console.log('  - Realtime → Settings: "Allow public access" 끄기 (private 채널만)');
console.log(process.exitCode ? '\n❗ 위의 ❌ 항목을 고쳐 주세요.\n' : '\n🎉 기본 연결 점검 통과! npm run dev 로 실제 가입/플레이를 확인해 보세요.\n');
