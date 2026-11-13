import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = !!(url && anonKey && !url.includes('your-project'));

let client: SupabaseClient | null = null;

/** 브라우저에는 공개(anon) 키만 사용합니다. service_role 키는 절대 넣지 마세요. */
export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) throw new Error('Supabase 환경 변수가 설정되지 않았어요 (.env.example 참고).');
  client ??= createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    // worker: 연결 유지 신호를 Web Worker 에서 보내서, 창이 뒤에 있거나 오래 가만히 있어도 연결이 끊기지 않게 함
    realtime: { params: { eventsPerSecond: 20 }, worker: true },
  });
  return client;
}
