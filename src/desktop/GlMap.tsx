import { useEffect, useRef, useState } from 'preact/hooks';
import { NB, type GameState } from '../game';
import { MapView } from '../ui/MapView';
import { tapCounty } from '../ui/store';
import type { MapScene } from './scene3d';

/** The WebGL board. It loads three.js on first use, and falls back to the flat SVG map when WebGL is not available. */
export function GlMap({ s, sel }: { s: GameState; sel: number }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MapScene | null>(null);
  const [failed, setFailed] = useState(false);
  const selected = s.C[sel];
  const targets = new Set<number>();
  if (selected && selected.owner === 0) for (const n of NB[selected.id]!) if (s.C[n]!.owner !== 0) targets.add(n);
  const latest = useRef({ s, sel, targets });
  latest.current = { s, sel, targets };

  useEffect(() => {
    let dead = false;
    import('./scene3d').then((m) => {
      if (dead || !host.current) return;
      try {
        scene.current = m.createScene(host.current, tapCounty);
        const l = latest.current;
        scene.current.update(l.s, l.sel, l.targets);
      } catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { dead = true; scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.update(s, sel, targets); });

  if (failed) return <div class="map-wrap dt-flat"><MapView s={s} sel={sel} /></div>;
  return <div class="gl-host" ref={host} aria-hidden="true" />;
}
