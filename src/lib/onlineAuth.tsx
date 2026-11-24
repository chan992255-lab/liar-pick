import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { authErrorMessage, hasCloud, supabase } from './supabase';
import { onlineApi } from './onlineApi';
import type { Profile } from './onlineTypes';

type Result = { ok: boolean; error?: string };

type AuthValue = {
  ready: boolean;
  cloud: boolean;
  user: User | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<Result>;
  signUp: (email: string, password: string, nickname: string) => Promise<Result>;
  signOut: () => Promise<void>;
  updateNickname: (nickname: string) => Promise<Result>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function OnlineAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!hasCloud);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async () => {
    if (!supabase) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const next = await onlineApi.myProfile();
        setProfile(next);
        return;
      } catch {
        if (attempt === 2) setProfile(null);
        else await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setReady(true);
      if (data.session?.user) void loadProfile();
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void loadProfile();
      else setProfile(null);
    });

    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { ok: false, error: '온라인 기능을 사용할 수 없어요.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: authErrorMessage(error.message) };
    await loadProfile();
    return { ok: true };
  }, [loadProfile]);

  const signUp = useCallback(
    async (email: string, password: string, nickname: string) => {
      if (!supabase) return { ok: false, error: '온라인 기능을 사용할 수 없어요.' };
      const nick = nickname.trim().slice(0, 12);
      if (!nick) return { ok: false, error: '닉네임을 입력해 주세요.' };
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { nickname: nick } },
      });
      if (error) return { ok: false, error: authErrorMessage(error.message) };
      if (!data.session) {
        const login = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (login.error) return { ok: false, error: authErrorMessage(login.error.message) };
      }
      setUser(data.user ?? (await supabase.auth.getUser()).data.user ?? null);
      await loadProfile();
      return { ok: true };
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const updateNickname = useCallback(async (nickname: string) => {
    try {
      const next = await onlineApi.setNickname(nickname);
      setProfile(next);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '닉네임을 바꾸지 못했어요.' };
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      cloud: hasCloud,
      user,
      profile,
      signIn,
      signUp,
      signOut,
      updateNickname,
      refreshProfile: loadProfile,
    }),
    [ready, user, profile, signIn, signUp, signOut, updateNickname, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useOnlineAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('OnlineAuthProvider가 없습니다.');
  return value;
}
