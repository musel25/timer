import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { RunSpec } from '../../lib/types';
import { unlockAudio } from '../../engine/audio';
import { RunScreen } from './RunScreen';

interface RunCtx {
  startRun: (spec: RunSpec) => void;
}

const Ctx = createContext<RunCtx>({ startRun: () => {} });
export const useRun = () => useContext(Ctx);

export function RunProvider({ children }: { children: ReactNode }) {
  const [spec, setSpec] = useState<RunSpec | null>(null);
  const [key, setKey] = useState(0);

  const startRun = useCallback((s: RunSpec) => {
    unlockAudio(); // we're inside the click gesture — unlock audio for mobile
    setSpec(s);
    setKey((k) => k + 1);
  }, []);

  const close = useCallback(() => setSpec(null), []);

  return (
    <Ctx.Provider value={{ startRun }}>
      {children}
      {spec && <RunScreen key={key} spec={spec} onClose={close} onAgain={startRun} />}
    </Ctx.Provider>
  );
}
