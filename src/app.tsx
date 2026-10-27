import './ui/app.css';
import { Chronicle } from './ui/Chronicle';
import { Dock, Panel, SheetView, Toast } from './ui/Chrome';
import { CountyList } from './ui/CountyList';
import { Hud } from './ui/Hud';
import { MapView } from './ui/MapView';
import { RealmPanel } from './ui/RealmPanel';
import { boot, useGame } from './ui/store';

boot();

export function App() {
  const g = useGame();
  const { s, ui } = g;
  return (
    <>
      <div class={g.fade ? 'shell fade-' + g.fade : 'shell'}>
        <Hud s={s} />
        {!ui.full && <MapView s={s} sel={ui.sel} />}
        <Panel>
          {ui.tab === 'realm' ? <div class="pbody"><RealmPanel s={s} /></div>
            : ui.tab === 'chronicle' ? <div class="pbody"><Chronicle s={s} /></div>
            : <CountyList s={s} />}
        </Panel>
      </div>
      <Dock s={s} />
      <SheetView />
      <Toast />
    </>
  );
}
