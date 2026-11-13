# 🌱 햇살마을 (Haetsal Village)

친구 **최대 10명**이 하나의 귀여운 픽셀 마을에서 함께 돌아다니고 채팅하면서, 각자의 농장을 키워 가는 2D 멀티플레이 힐링 농장 게임입니다.

- **React + TypeScript + Vite** — 로그인, 캐릭터 선택, 상점·가방·주민 목록 등 UI
- **Phaser 3** — 탑다운 픽셀 게임 화면 (마을 · 농장 · 캐릭터 · 작물)
- **Supabase** — Auth(로그인), PostgreSQL(영구 저장 + 서버 검증 RPC), Realtime(이동·접속자·채팅)
- **Zustand** 상태 관리 · **Tailwind CSS 4** · **Vitest + PGlite + Playwright** 테스트 · **Netlify** 배포

> 모든 그래픽(캐릭터, 작물 40종 스프라이트, 건물, 지형)과 효과음은 **코드로 직접 그린/합성한 오리지널**입니다. 외부 이미지·사운드 에셋을 쓰지 않습니다. (폰트만 OFL 라이선스의 Galmuri11 사용 — 아래 "에셋 출처" 참고)

---

## ✨ 주요 기능

| 분류 | 내용 |
|---|---|
| 로그인 | 이메일 회원가입/로그인, 로그인 유지, 로그아웃, 비밀번호 재설정(/reset-password), 이메일 인증 지원, 한국어 오류 메시지 |
| 정원 | 서버에서 **원자적으로** 플레이어 슬롯 배정(기본 10명, 설정 변경 가능) · 초대 이메일 전용 모드(allowlist) · 관리자 슬롯 해제/비활성화 |
| 캐릭터 | SD 2등신 캐릭터, 헤어 8종 · 머리색 8 · 피부 5 · 의상 4종 · 옷 색 8, 4방향 걷기 애니메이션, 앉기 |
| 마을 | 단 하나의 공용 "햇살마을" — 중앙 광장/분수(스폰), 씨앗 상점, 농산물 판매소(판매는 여기서만), 마을 안내판, **분수대 위 주민 게시판**(주민이 쓰고 모두가 읽기), 연못과 나무다리, 벤치, 농장 가는 길 아치 |
| 농장 | 플레이어별 독립 농장, 3×3에서 10×10까지 8단계 확장(미리보기 · 울타리 이동 애니메이션), **보관함**(주인만 넣고/빼기, 다른 주민은 내용과 최근 기록 구경), 다른 주민 농장 방문(구경만 가능) |
| 작물 | 10종 × 4단계 고유 스프라이트, **서버 시간 기준 성장**(오프라인 중에도 자람), 수확 가능 시 반짝임·흔들림 |
| 경제 | 씨앗 구매 · 심기 · 수확 · 판매(개별/전체) · 확장 · 일일 퀘스트 — **전부 서버 RPC에서 검증** |
| 멀티플레이 | 공간별(마을/각 농장) Realtime 채널, 7Hz 이동 전송 + 수신 측 보간, 접속자 Presence, 중복 로그인 처리, 재연결 |
| 채팅 | Enter 채팅 → 머리 위 말풍선(5초), 채팅 기록 패널(접기), 100자 제한, 도배 방지, 차단·신고, 닉네임 사칭 방지 |
| 기타 | 튜토리얼 6단계, 농장 통계, 감정표현(인사/하트/손 흔들기/콧노래), 효과음 + 음량/음소거, 모바일 가상 조이스틱 |

### 조작법
| 입력 | 기능 |
|---|---|
| 방향키 / W A S D | 이동 (대각선 속도 정규화) |
| E / Space | 상호작용 · 씨앗 심기 · 수확 · 벤치 앉기 |
| 마우스 클릭 | 가까운 밭 칸 심기/수확, 다른 주민 클릭 → 농장 방문/차단/신고 |
| R | 친구 농장에서 누르면 자라는 작물 전체에 물 주기 (작물마다 수확 5분 단축, 친구마다 30분에 한 번) |
| I | 가방 |
| Enter | 채팅 입력 (입력 중에는 캐릭터가 움직이지 않음) |
| Esc | 창 닫기 |
| 1 ~ 8 | 퀵슬롯 씨앗 선택 |

---

## 🚀 빠르게 실행하기 (서버 없이 체험 모드)

```bash
npm install
npm run dev
```

http://localhost:5173 을 열면 됩니다. Supabase 환경 변수가 없으면 자동으로 **체험 모드(local)** 로 동작합니다.

- 데이터는 브라우저 localStorage 에 저장되고, 서버 RPC 와 **같은 규칙을 TypeScript 로 재현한 로컬 서버**(`src/services/backend/localServer.ts`)가 검증합니다.
- 같은 브라우저의 **여러 탭끼리 멀티플레이**가 됩니다 (BroadcastChannel). 두 번째 탭에서는 캐릭터 화면의 "로그아웃" 후 다른 계정으로 가입하세요.
- 친구들과 실제로 함께 하려면 아래 Supabase 설정이 필요합니다.

---

## 🗄️ Supabase 설정 (실제 서버)

### 1) 프로젝트 만들기
1. https://supabase.com 에서 새 프로젝트를 만듭니다.
2. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사합니다.
   - ⚠ `service_role` 키는 절대 프론트엔드/깃허브에 넣지 마세요. 이 게임은 service_role 키가 필요 없습니다.

### 2) 데이터베이스 마이그레이션
`supabase/migrations/` 의 SQL 파일을 **이름 순서대로** 모두 적용합니다.
1. `20261112000000_haetsal_village.sql` — 기본 스키마·보안·경제 RPC
2. `20261113000000_storage_and_board.sql` — 농장 보관함 + 주민 게시판

둘 중 하나를 선택하세요.

- **대시보드**: SQL Editor → New query → 파일 내용을 붙여넣고 Run
- **CLI**: `npx supabase link --project-ref <ref>` 후 `npx supabase db push`

이 마이그레이션이 만드는 것:
- 테이블: `game_settings, player_allowlist, player_slots, profiles, farms, farm_plots, crop_types, farm_levels, planted_crops, inventory_items, economy_transactions, player_statistics, quest_defs, quest_claims, chat_messages, player_reports, player_blocks`
- 모든 테이블 RLS 활성화 + 조회 정책만 부여 (클라이언트 직접 쓰기 권한 없음)
- 서버 RPC (SECURITY DEFINER): `claim_player_slot, save_character, get_my_state, buy_seed, plant_crop, harvest_crop, sell_crop, sell_all_crops, expand_farm, get_daily_quests, claim_quest, send_chat, enter_space, report_player, set_block, admin_*` 등
- `chat_messages` 를 Realtime publication 에 추가, `realtime.messages` 에 private 채널 권한 정책

### 3) Auth 설정 (Authentication 메뉴)
| 위치 | 값 |
|---|---|
| Sign In / Providers → Email | Enable Email provider ✅, (권장) Confirm email ✅ |
| URL Configuration → **Site URL** | 배포 주소 (예: `https://haetsal-village.netlify.app`) |
| URL Configuration → **Redirect URLs** | `https://<배포주소>/**`, `http://localhost:5173/**` |

- 이메일 인증을 켜면 가입 후 메일 링크를 눌러야 로그인할 수 있습니다. 비밀번호 재설정 링크는 `/reset-password` 로 돌아옵니다.
- 기본 Supabase 메일 서버는 시간당 발송량 제한이 있으니, 친구들이 한꺼번에 가입한다면 Auth → SMTP 설정을 고려하세요.

### 4) Realtime 설정
- **Realtime → Settings → "Allow public access"를 끄기**(private 채널만 허용) — 그래야 `realtime.messages` 정책(활성 주민만 접속)이 강제됩니다.
- Database → Publications 의 `supabase_realtime` 에 `chat_messages` 가 포함되어 있는지 확인 (마이그레이션이 자동 추가).

### 5) 운영 설정 (SQL Editor)
```sql
-- 정원 변경
update public.game_settings set max_players = 10;
-- 초대한 사람만 받기
update public.game_settings set signup_mode = 'allowlist';
insert into public.player_allowlist (email) values ('friend1@example.com'), ('friend2@example.com');
-- 관리자 지정 (가입 + 캐릭터 생성 후)
update public.profiles set is_admin = true where nickname = '내닉네임';
-- 슬롯 비활성화(로그인은 되지만 게임 입장·모든 RPC 차단) / 다시 활성화
update public.player_slots set active = false where user_id = '<user uuid>';
update public.player_slots set active = true  where user_id = '<user uuid>';
-- 슬롯 완전 해제 (그 자리를 다른 사람이 쓸 수 있음, 농장 데이터는 남음)
delete from public.player_slots where user_id = '<user uuid>';
-- (게임 클라이언트에서 is_admin 계정이 호출할 수 있는 RPC: admin_set_slot_active / admin_release_slot / admin_update_settings)
-- 신고 확인
select * from public.player_reports order by created_at desc;
```
- 작물 가격·성장시간은 `crop_types`, 확장 비용은 `farm_levels`, 퀘스트는 `quest_defs` 가 **서버 기준값**입니다. 바꿀 때는 `src/config/*.ts` 도 같이 바꾸세요 (`tests/unit/configSync.test.ts` 가 불일치를 잡아줍니다).

### 6) 로컬에서 Supabase 로 실행
```bash
cp .env.example .env.local   # 값 채우기
npm run dev
```

---

## ☁️ Netlify 배포

**현재 배포 주소: https://haetsal-village.netlify.app**

### 업데이트 배포 (이 컴퓨터에서)
```bash
npm run deploy
```
`.env.local` 의 공개 값(Supabase URL / 공개 키)으로 빌드한 뒤 Netlify 에 올립니다. 처음 한 번 `npx netlify login` 으로 계정 허락이 필요합니다.

### (선택) GitHub 연동 자동 배포

1. 이 폴더를 GitHub 저장소로 올립니다 (`.env*` 는 `.gitignore` 로 제외됨).
2. Netlify → **Add new site → Import an existing project** → 저장소 선택.
3. 빌드 설정은 `netlify.toml` 에 들어 있습니다 (build: `npm run build`, publish: `dist`, SPA 리디렉션 포함).
4. **Site configuration → Environment variables** 에 추가:

| 변수 | 값 | 비고 |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public 키 | 공개돼도 되는 키 (RLS 로 보호) |
| `VITE_BACKEND` | `supabase` | 설정 누락 시 체험 모드로 빠지는 것을 막음 |

5. Deploy → 배포 주소를 Supabase **Site URL / Redirect URLs** 에 등록 (위 3번 표).

> Netlify 에 넣는 값은 모두 **공개 가능한 값**뿐입니다. 비밀키(service_role, DB 비밀번호)는 Netlify 에도 넣지 않습니다.

---

## 🔒 보안 설계

| 위협 | 대응 |
|---|---|
| 골드/인벤토리 직접 수정 | 모든 테이블에서 `authenticated` 의 INSERT/UPDATE/DELETE 권한 회수 + RLS 쓰기 정책 없음 |
| 가격·성장 완료 조작 | RPC 가 `crop_types` 기준값과 DB `now()` 만 사용. 클라이언트는 작물 ID·좌표·수량만 보냄 |
| 남의 농장 수확/심기 | RPC 가 항상 `owner_id = auth.uid()` 농장만 대상으로 함 (타인 농장을 지정하는 파라미터 자체가 없음) |
| 중복 수확 (무한 골드) | `DELETE ... WHERE ready_at <= now() RETURNING` 으로 삭제된 경우에만 지급 |
| 동시 구매로 잔액 초과 | 플레이어 행 `FOR UPDATE` 잠금 + `UPDATE ... WHERE gold >= cost` 조건부 차감, `gold >= 0` 체크 제약 |
| 네트워크 재시도 중복 처리 | 모든 경제 RPC 에 `request_id` (`unique(player_id, request_id)`), 같은 요청은 이전 결과 반환. 클라이언트는 같은 ID 로 1회 재시도 |
| 정원 초과 동시 가입 | `game_settings` 행 잠금으로 슬롯 배정 직렬화 |
| 미승인 계정 | 슬롯 없으면 모든 RPC 가 `NO_SLOT`, allowlist 모드 지원, 관리자 비활성화 |
| 채팅 사칭/스크립트 | 서버가 프로필 닉네임으로 저장, 길이·제어문자·도배(5초 5개)·현재 공간 검증, React 는 항상 텍스트로 렌더링 |
| 차단 | `chat_messages` RLS 가 차단한 사람의 메시지를 서버에서 걸러냄 |
| 비로그인 접근 | anon 역할 테이블 권한 전부 회수, RPC 실행 권한은 authenticated 에만 |
| 내부 헬퍼 호출 | `_add_item` 등 내부 함수 실행 권한 회수 |

---

## 🧪 테스트

```bash
npm test            # Vitest: SQL(PGlite) + 로컬 서버 + 설정 동기화
npm run test:e2e    # Playwright E2E (설치된 Edge 사용, PW_CHANNEL=chrome 으로 변경 가능)
npm run build       # 타입 검사 + 프로덕션 빌드
```

### 실제 실행 결과 (2026-11-12, Windows 11 / Node 24 / Edge 헤드리스)
| 테스트 | 결과 |
|---|---|
| `tests/unit/sql.test.ts` — 마이그레이션 SQL 을 **PGlite(실제 PostgreSQL WASM)** 에서 실행해 RPC·RLS 검증 (슬롯 정원/allowlist/비활성, 닉네임, 멱등 구매, 잔액 초과, 연속 구매, 심기 검증, 서버시간 수확, 중복 수확, 판매, 전체 판매, 확장 순서, 직접 UPDATE/INSERT/DELETE 거부, 타인 데이터 비노출, 내부 함수 차단, 채팅 검증/도배/차단, 퀘스트, Realtime 정책) | ✅ 24/24 |
| `tests/unit/localServer.test.ts` — 체험 모드 서버가 같은 규칙을 지키는지 | ✅ 11/11 |
| `tests/unit/configSync.test.ts` — TS 설정 ↔ SQL 시드 일치, 성장 단계, 채팅 정리 | ✅ 5/5 |
| `tests/e2e/game.spec.ts` — 가입 → 캐릭터 → 마을 스폰 → 상점까지 걸어가 구매 → 농장 이동 → 키보드/마우스로 심기 → 2번째 플레이어 접속(2/10) → 농장 방문 → 서로 보임 → 이동 동기화 → 말풍선 채팅 → 방문자 심기 거부 → 30초 성장 → 새로고침 후 유지 → 수확 → 출하 상자 전체 판매(+70G) → 튜토리얼 완료 | ✅ 1/1 (약 1.2분) |
| `npm run build` | ✅ |

### 실행하지 못한 것 (정직한 미검증 목록)
- **실제 Supabase 프로젝트 연결은 테스트하지 못했습니다** (인증 정보 없음). SQL 은 PGlite 로 검증했지만, Supabase 의 Auth 메일 발송, Realtime private 채널 권한, `postgres_changes` 채팅 전달, Presence 동작은 실서버에서 확인이 필요합니다. `SupabaseBackend` 코드는 타입 검사만 통과한 상태입니다.
- PGlite 는 단일 연결이라 **진짜 동시 트랜잭션 경합**은 재현할 수 없습니다 (잠금 SQL 구조로 설계, 연속 요청 테스트만 수행).
- Netlify 실제 배포는 하지 않았습니다 (빌드만 확인).
- 다른 기기/다른 브라우저 간 멀티플레이는 Supabase 연결 후 확인해야 합니다. (E2E 는 체험 모드에서 두 탭으로 검증)

---

## ⚠️ 알려진 제한 사항
- 이동/감정표현 브로드캐스트는 Realtime 채널 접속 권한(활성 주민만)으로 보호되지만, 패킷 안의 `id` 자체는 서버가 서명하지 않습니다. 소규모 친구 게임 기준으로 허용한 트레이드오프이며, **채팅·경제는 서버 검증**이라 영향이 없습니다.
- 체험 모드(local)는 한 브라우저 안에서만 공유되며, 개발자 도구로 localStorage 를 고치면 값이 바뀝니다 (실서비스는 Supabase 모드 사용).
- 집 내부, 꾸미기, 반복 수확 작물은 아직 없습니다 (`regrow_seconds` 컬럼 등 확장 구조는 준비됨).
- 배경 음악은 없고 효과음만 있습니다.

---

## 📁 폴더 구조

```text
src/
  app/            App(화면 전환), ArtGallery(개발용 스프라이트 갤러리: /?gallery)
  audio/          WebAudio 효과음 합성
  components/ui/  패널·모달·픽셀 아이콘·캐릭터 미리보기
  config/         게임/작물/확장/퀘스트/외형 설정 (밸런스는 여기서)
  features/
    auth/ character/ chat/ economy/ farm/ game/ inventory/ multiplayer/ shop/ village/
  game/
    art/          픽셀 아트 엔진 + 캐릭터/작물/지형/건물/소품 그리기
    maps/         마을·농장 지도 정의
    entities/     Avatar (보간 포함)
    systems/      FarmLayer, Overlay(이름표/말풍선), textures
    scenes/       WorldScene
    bus.ts        React ↔ Phaser 이벤트 버스
  services/
    backend/      GameBackend 인터페이스, SupabaseBackend, LocalBackend(+LocalServer)
    supabase/     클라이언트
  stores/         Zustand 스토어
  types/
supabase/migrations/   스키마 · RLS · RPC
tests/unit, tests/e2e
docs/ASSETS.md         에셋 출처
```

---

## 🎨 에셋 출처
`docs/ASSETS.md` 참고. 요약: 그래픽/효과음은 모두 이 저장소의 코드가 생성하는 오리지널, 폰트는 **Galmuri11** (© Lee Minseo, SIL Open Font License 1.1, 상업적 사용 가능).
