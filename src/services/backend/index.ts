import { supabaseConfigured } from '@/services/supabase/client';
import { LocalBackend } from './localBackend';
import { SupabaseBackend } from './supabaseBackend';
import type { GameBackend } from './types';

const mode = (import.meta.env.VITE_BACKEND as string | undefined)?.trim();

/**
 * 백엔드 선택:
 *  - VITE_BACKEND=local     → 브라우저 내장 체험 모드
 *  - VITE_BACKEND=supabase  → Supabase (환경 변수 필수)
 *  - 미설정                 → Supabase 설정이 있으면 supabase, 없으면 local
 *
 * 인스턴스는 globalThis 에 보관해서, 개발 중 코드가 바뀌어(HMR) 이 모듈이 다시 불려도
 * 로그인 세션·실시간 연결이 끊기지 않도록 합니다.
 */
const holder = globalThis as unknown as { __haetsalBackend?: GameBackend };

export function backend(): GameBackend {
  if (!holder.__haetsalBackend) {
    const useSupabase = mode === 'supabase' || (mode !== 'local' && supabaseConfigured);
    holder.__haetsalBackend = useSupabase ? new SupabaseBackend() : new LocalBackend();
  }
  return holder.__haetsalBackend;
}

export async function getBackend(): Promise<GameBackend> {
  return backend();
}
