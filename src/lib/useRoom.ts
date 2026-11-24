import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMessages, onlineApi, subscribeRoom } from './onlineApi';
import { roomErrorMessage } from './supabase';
import type { ChatMessage, Snapshot } from './onlineTypes';

/**
 * 방 하나를 구독한다: 스냅샷 + 실시간 변경 + 채팅 + 서버 시각 기준 남은 시간.
 */
export function useRoom(roomId: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const reloadRef = useRef<() => void>(() => {});

  const reload = useCallback(async () => {
    try {
      const next = await onlineApi.snapshot(roomId);
      offsetRef.current = next.serverNow - Date.now();
      setSnapshot(next);
      setError(null);
    } catch (caught) {
      setError(roomErrorMessage(caught instanceof Error ? caught.message : ''));
    }
  }, [roomId]);
  reloadRef.current = () => {
    void reload();
  };

  const scheduleReload = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void reload();
    }, 180);
  }, [reload]);

  useEffect(() => {
    setSnapshot(null);
    setMessages([]);
    void reload();
    fetchMessages(roomId)
      .then(setMessages)
      .catch(() => setMessages([]));

    const unsubscribe = subscribeRoom(roomId, {
      onChange: scheduleReload,
      onMessage: (message) => {
        setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message].slice(-150)));
      },
    });
    const poll = window.setInterval(() => {
      void reload();
    }, 5000);
    const tick = window.setInterval(() => setNow(Date.now()), 500);

    return () => {
      unsubscribe();
      window.clearInterval(poll);
      window.clearInterval(tick);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [roomId, reload, scheduleReload]);

  const sendMessage = useCallback(
    async (body: string) => {
      await onlineApi.sendMessage(roomId, body);
      const next = await fetchMessages(roomId).catch(() => null);
      if (next) setMessages(next);
    },
    [roomId],
  );

  const remaining =
    snapshot?.room.phaseEndsAt != null
      ? Math.max(0, Math.round((snapshot.room.phaseEndsAt - (now + offsetRef.current)) / 1000))
      : null;

  return { snapshot, messages, error, reload, sendMessage, remaining };
}
