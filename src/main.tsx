import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/im-fell-english-sc/latin-400.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { DesktopApp } from './desktop/DesktopApp';

// Keep the app up to date and usable offline (the single-file build swaps this for a stub).
registerSW({ immediate: true });

/** A wide window gets the desktop layout; ?ui=desktop or ?ui=mobile forces one for testing. */
const wideQuery = matchMedia('(min-width: 1100px) and (min-height: 620px)');
function wantDesktop(): boolean {
  const forced = new URLSearchParams(location.search).get('ui');
  return forced === 'desktop' ? true : forced === 'mobile' ? false : wideQuery.matches;
}

function Root() {
  const [wide, setWide] = useState(wantDesktop);
  useEffect(() => {
    const f = () => setWide(wantDesktop());
    wideQuery.addEventListener('change', f);
    return () => wideQuery.removeEventListener('change', f);
  }, []);
  useEffect(() => { document.body.classList.toggle('desktop', wide); }, [wide]);
  return wide ? <DesktopApp /> : <App />;
}

render(<Root />, document.getElementById('app')!);
