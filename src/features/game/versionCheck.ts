/**
 * 새 버전 알림: 배포할 때마다 dist/version.json 에 빌드 ID 가 기록됩니다.
 * 플레이 중인 화면이 1분마다 확인해서, 새 버전이 올라오면 "편할 때 새로고침" 안내를 띄웁니다.
 * (강제로 새로고침하지 않으므로 플레이가 끊기지 않아요)
 */
import { useGame } from '@/stores/gameStore';

declare const __BUILD_ID__: string;

let timer: ReturnType<typeof setInterval> | null = null;

async function check() {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return; // 개발 서버에는 version.json 이 없음
    const { build } = (await r.json()) as { build?: string };
    if (build && build !== __BUILD_ID__) useGame.getState().set({ newVersion: true });
  } catch { /* 네트워크 오류는 다음 확인 때 */ }
}

export function startVersionCheck() {
  if (timer || import.meta.env.DEV) return;
  timer = setInterval(check, 60_000);
}
