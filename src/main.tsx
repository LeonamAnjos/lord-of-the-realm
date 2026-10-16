import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/im-fell-english-sc/latin-400.css';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';

// Keep the app up to date and usable offline (the single-file build swaps this for a stub).
registerSW({ immediate: true });

render(<App />, document.getElementById('app')!);
