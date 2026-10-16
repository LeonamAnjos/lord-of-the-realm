// Loads the legacy single-file game into a Node VM with a stubbed DOM so its rules can be driven headlessly.
// Used only to prove the TypeScript port behaves identically; never imported by the app.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export interface LegacyGame {
  state: any;
  endSeason(): void;
  doSend(from: any, to: any, mode: unknown): any;
  recruit(c: any, k: string, n: number): boolean;
  aiTurn(l: number): void;
  forecast(l: number): any;
}

/** `random` replaces Math.random inside the legacy script. Optionally pre-seed localStorage with a legacy save. */
export function loadLegacy(random: () => number, savedJson?: string): LegacyGame {
  const html = readFileSync(new URL('../legacy/fief-and-crown.html', import.meta.url), 'utf8');
  const start = html.lastIndexOf('<script>') + '<script>'.length;
  const code = html.slice(start, html.lastIndexOf('</script>'));

  const stub = (): any => new Proxy(function () {}, {
    get: (_t, p) => (p === Symbol.toPrimitive ? () => '' : stub()),
    set: () => true,
    apply: () => stub(),
  });
  const store = new Map<string, string>();
  if (savedJson) store.set('fief-and-crown-v1', savedJson);
  const win: any = {};
  const context: any = {
    window: win,
    document: { querySelector: stub, querySelectorAll: () => [], getElementById: stub, addEventListener() {}, createElement: stub, body: stub() },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    console,
  };
  vm.createContext(context);
  vm.runInContext("Math", context).random = random;
  vm.runInContext(code, context);
  return win.__fief as LegacyGame;
}
