import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameState } from '../game';
import { mapMarks, type Marks } from '../ui/marks';
import { MapView } from '../ui/MapView';
import { game, setHover, tapCounty } from '../ui/store';
import type { MapScene } from './scene3d';

/** The WebGL board. It loads three.js on first use, and falls back to the flat SVG map when WebGL is not available. */
export function GlMap({ s, sel }: { s: GameState; sel: number }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MapScene | null>(null);
  const [failed, setFailed] = useState(false);
  const marks: Marks = mapMarks(s, game.ui);
  const latest = useRef({ s, sel, marks });
  latest.current = { s, sel, marks };

  useEffect(() => {
    let dead = false;
    import('./scene3d').then((m) => {
      if (dead || !host.current) return;
      try {
        scene.current = m.createScene(host.current, tapCounty, setHover);
        const l = latest.current;
        scene.current.update(l.s, l.sel, l.marks);
      } catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { dead = true; scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.update(s, sel, marks); });

  if (failed) return <div class="map-wrap dt-flat"><MapView s={s} sel={sel} /></div>;
  return <div class="gl-host" ref={host} aria-hidden="true" />;
}
