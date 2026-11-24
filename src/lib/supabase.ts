import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Supabase 환경변수가 없으면 온라인 모드는 '준비 중'으로 표시된다. */
export const hasCloud = Boolean(url && anonKey);

/**
 * 한 기기에서 계정 두 개로 동시에 접속할 때 쓰는 슬롯별 세션 저장소.
 * 주소에 ?slot=b 를 붙이면 그 슬롯의 로그인만 따로 보관한다(기본 슬롯은 기존 키 그대로).
 */
function slotStorage(slot: string | null) {
  const key = (name: string) => (slot ? `liarpick:${slot}:${name}` : `liarpick:${name}`);
  return {
    getItem: (name: string) => window.localStorage.getItem(key(name)),
    setItem: (name: string, value: string) => window.localStorage.setItem(key(name), value),
    removeItem: (name: string) => window.localStorage.removeItem(key(name)),
  };
}

const slot = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('slot') : null;

export const supabase: SupabaseClient | null = hasCloud
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: slotStorage(slot),
      },
    })
  : null;

/** 사용자에게 보여줄 한국어 오류 문구 */
export const authErrorMessage = (message: string): string => {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않아요.';
  if (text.includes('user already registered')) return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (text.includes('password should be at least')) return '비밀번호는 6자 이상으로 입력해 주세요.';
  if (text.includes('unable to validate email') || text.includes('invalid email'))
    return '이메일 형식을 확인해 주세요.';
  if (text.includes('email not confirmed')) return '이메일 인증이 필요해요. 메일함을 확인해 주세요.';
  if (text.includes('rate limit') || text.includes('too many')) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  if (text.includes('signups not allowed')) return '지금은 새 가입을 받을 수 없어요.';
  return '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
};

/** 서버(RPC) 오류를 화면용 문구로 바꾼다. */
export const roomErrorMessage = (message: string): string => {
  const text = message.toLowerCase();
  if (text.includes('room_not_found')) return '방을 찾을 수 없어요. 코드를 다시 확인해 주세요.';
  if (text.includes('room_full')) return '방이 가득 찼어요. 다른 방에 들어가 보세요.';
  if (text.includes('room_playing')) return '이미 게임이 시작된 방이에요.';
  if (text.includes('need_more_players')) return '인원이 부족해요. 라이어는 3명, 마피아는 4명부터 시작할 수 있어요.';
  if (text.includes('not_host')) return '방장만 할 수 있는 동작이에요.';
  if (text.includes('already_started')) return '이미 시작된 게임이에요.';
  if (text.includes('not_voting')) return '지금은 투표 시간이 아니에요.';
  if (text.includes('self_vote')) return '본인에게는 투표할 수 없어요.';
  if (text.includes('not_alive')) return '이미 탈락한 참가자예요.';
  if (text.includes('not_liar')) return '라이어만 제시어를 입력할 수 있어요.';
  if (text.includes('not_night')) return '지금은 밤 행동 시간이 아니에요.';
  if (text.includes('not_guessing')) return '지금은 정답 입력 시간이 아니에요.';
  if (text.includes('not_member')) return '이 방의 참가자가 아니에요.';
  if (text.includes('no_words')) return '제시어 목록이 비어 있어요. 방장이 카테고리를 다시 골라 주세요.';
  if (text.includes('not_authenticated') || text.includes('jwt')) return '로그인이 풀렸어요. 다시 로그인해 주세요.';
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
};
