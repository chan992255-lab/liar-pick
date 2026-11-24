import { useEffect, useState } from 'react';
import Home from './screens/Home';
import Scores from './screens/Scores';
import LiarGame from './games/liar/LiarGame';
import MafiaGame from './games/mafia/MafiaGame';
import { sfx } from './lib/sound';

type View = 'home' | 'liar' | 'mafia' | 'scores';

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
    <div className="app-shell">
      {view === 'home' && (
        <Home
          onLiar={() => setView('liar')}
          onMafia={() => setView('mafia')}
          onScores={() => setView('scores')}
        />
      )}
      {view === 'liar' && <LiarGame onExit={() => setView('home')} />}
      {view === 'mafia' && <MafiaGame onExit={() => setView('home')} />}
      {view === 'scores' && <Scores onBack={() => setView('home')} />}
    </div>
  );
}
