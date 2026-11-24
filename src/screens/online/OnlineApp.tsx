import { useState } from 'react';
import { TopBar } from '../../components/ui';
import { useOnlineAuth } from '../../lib/onlineAuth';
import AuthScreen from './AuthScreen';
import LobbyScreen from './LobbyScreen';
import RoomScreen from './RoomScreen';

export default function OnlineApp({ onExit }: { onExit: () => void }) {
  const { cloud, ready, user } = useOnlineAuth();
  const [roomId, setRoomId] = useState<string | null>(null);

  if (!cloud) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar title="🌐 온라인 매칭" onBack={onExit} />
        <div className="app-body">
          <div className="panel mt-4 px-5 py-6 text-center">
            <p className="text-[28px]">🛠️</p>
            <p className="mt-2 text-[15px] font-extrabold">온라인 매칭을 준비 중이에요</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-sub">
              서버 연결 정보가 아직 설정되지 않았어요. 그동안 📱 폰 하나로 같이하기는 그대로 즐길 수 있어요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar title="🌐 온라인 매칭" onBack={onExit} />
        <div className="app-body flex flex-1 items-center justify-center">
          <p className="text-[12.5px] text-sub">로그인 상태를 확인하는 중…</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthScreen onExit={onExit} />;
  if (roomId) return <RoomScreen roomId={roomId} onExit={() => setRoomId(null)} />;
  return <LobbyScreen onRoom={setRoomId} onExit={onExit} />;
}
