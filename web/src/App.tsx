import { useGameConnection } from './hooks/useGameConnection.js';
import IdentityScreen from './screens/IdentityScreen.js';
import LobbyScreen from './screens/LobbyScreen.js';
import SetupScreen from './screens/SetupScreen.js';
import CountdownScreen from './screens/CountdownScreen.js';
import QuestionScreen from './screens/QuestionScreen.js';
import RevealScreen from './screens/RevealScreen.js';
import PodiumScreen from './screens/PodiumScreen.js';
import { loadSession } from './lib/session.js';

const WS_HOST = import.meta.env.VITE_WS_HOST as string;

export default function App() {
  const { state, rejection, join, send } = useGameConnection();

  async function handleJoin(params: { code: string; name: string; avatarSeed: string }) {
    if (params.code === '') {
      // Mirrors RealtimeClient's ws/wss derivation (realtimeClient.ts) so the
      // lobby-creation fetch works against a plain-HTTP local `wrangler dev`
      // server as well as the deployed https host.
      const protocol = WS_HOST?.startsWith('localhost') ? 'http' : 'https';
      const response = await fetch(`${protocol}://${WS_HOST}/api/lobby`, { method: 'POST' });
      const body = (await response.json()) as { code: string };
      join({ ...params, code: body.code });
      return;
    }
    join(params);
  }

  if (state === null) {
    return (
      <div>
        {rejection !== null && <p role="alert">{rejection}</p>}
        <IdentityScreen onJoin={handleJoin} />
      </div>
    );
  }

  const selfId = loadSession()?.playerId ?? '';

  switch (state.phase) {
    case 'LOBBY':
      return <LobbyScreen state={state} selfId={selfId} onOpenSetup={() => send({ type: 'OPEN_SETUP' })} />;
    case 'SETUP':
    case 'GENERATING':
      return (
        <SetupScreen
          state={state}
          selfId={selfId}
          onSubmit={(config, source) => send({ type: 'SUBMIT_SETUP', config, source })}
        />
      );
    case 'COUNTDOWN':
      return <CountdownScreen phaseEndsAtMs={state.phaseEndsAtMs} />;
    case 'QUESTION':
      return (
        <QuestionScreen
          state={state}
          players={state.players}
          selfId={selfId}
          onAnswer={(choiceIndex) => send({ type: 'SUBMIT_ANSWER', choiceIndex })}
        />
      );
    case 'REVEAL':
      return <RevealScreen state={state} selfId={selfId} />;
    case 'PODIUM':
      return <PodiumScreen state={state} selfId={selfId} onPlayAgain={() => send({ type: 'PLAY_AGAIN' })} />;
  }
}
