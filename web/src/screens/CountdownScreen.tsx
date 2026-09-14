import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface CountdownScreenProps {
  readonly phaseEndsAtMs: number | null;
}

function secondsRemaining(phaseEndsAtMs: number, now: number): number {
  const msLeft = Math.max(phaseEndsAtMs - now, 0);
  return Math.ceil(msLeft / 1000);
}

export default function CountdownScreen({ phaseEndsAtMs }: CountdownScreenProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phaseEndsAtMs === null) return;
    let frame: number;
    const tick = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phaseEndsAtMs]);

  if (phaseEndsAtMs === null) return <div className="flex h-full items-center justify-center" />;

  const count = secondsRemaining(phaseEndsAtMs, now);

  return (
    <div className="flex h-full items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={count}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="font-heading text-9xl"
        >
          {count}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
