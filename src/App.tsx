import { useEffect, useState } from 'react';
import Home from './screens/Home';
import Scores from './screens/Scores';
import LiarGame from './games/liar/LiarGame';
import MafiaGame from './games/mafia/MafiaGame';
import OnlineApp from './screens/online/OnlineApp';
import { OnlineAuthProvider } from './lib/onlineAuth';
import { sfx } from './lib/sound';

type View = 'home' | 'liar' | 'mafia' | 'scores' | 'online';

export default function App() {
  const [view, setView] = useState<View>('home');

  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  return (
    <OnlineAuthProvider>
      <div className="app-shell">
        {view === 'home' && (
          <Home
            onLiar={() => setView('liar')}
            onMafia={() => setView('mafia')}
            onOnline={() => setView('online')}
            onScores={() => setView('scores')}
          />
        )}
        {view === 'liar' && <LiarGame onExit={() => setView('home')} />}
        {view === 'mafia' && <MafiaGame onExit={() => setView('home')} />}
        {view === 'scores' && <Scores onBack={() => setView('home')} />}
        {view === 'online' && <OnlineApp onExit={() => setView('home')} />}
      </div>
    </OnlineAuthProvider>
  );
}
