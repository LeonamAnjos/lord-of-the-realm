import './ui/app.css';
import { Chronicle } from './ui/Chronicle';
import { Dock, SheetView, Tabs, Toast } from './ui/Chrome';
import { FoeCounty, OwnCounty } from './ui/CountyPanel';
import { Hud } from './ui/Hud';
import { MapView } from './ui/MapView';
import { RealmPanel } from './ui/RealmPanel';
import { boot, useGame } from './ui/store';

boot();

export function App() {
  const g = useGame();
  const { s, ui } = g;
  const c = s.C[ui.sel]!;
  return (
    <>
      <div class="shell">
        <Hud s={s} />
        <MapView s={s} sel={ui.sel} />
        <Tabs tab={ui.tab} />
        <section>
          {ui.tab === 'realm' ? <RealmPanel s={s} />
            : ui.tab === 'chronicle' ? <Chronicle s={s} />
            : c.owner === 0 ? <OwnCounty s={s} c={c} /> : <FoeCounty s={s} c={c} />}
        </section>
      </div>
      <Dock s={s} />
      <SheetView />
      <Toast />
    </>
  );
}
