export type Kind = 'spear' | 'archer' | 'knight';
export type Units = Record<Kind, number>;
export type Stock = { gold: number; grain: number; wood: number; iron: number };
export type Resource = keyof Stock;
export type Work = { farm: number; wood: number; mine: number };
export type Over = null | 'won' | 'lost';
export type Mode = 'all' | 'half' | 'strike' | Units;

/** Field names (`f`, `w`, `i`, `g`, `arr`, `mus`, `pf`) match the legacy save so old saves load unchanged. */
export interface County {
  id: number;
  name: string;
  /** soil, timber, ore (fixed) */
  f: number;
  w: number;
  i: number;
  owner: number;
  pop: number;
  mood: number;
  work: Work;
  /** garrison */
  g: Units;
  /** troops that arrived or were mustered this season and cannot march yet */
  arr: Units;
  /** troops mustered this season in this county (can be undone) */
  mus: Units;
  fort: number;
  /** index into TAX */
  tax: number;
  /** index into RATION */
  ration: number;
  /** the farm % the player chose; restored when the season's farm limit allows */
  farmPref: number;
  /** fractional population carried between seasons */
  pf: number;
}

export interface Lord {
  name: string;
  short: string;
  tax: number;
  alive: boolean;
  stock: Stock;
}

export interface LogEntry { t: number; k: string; txt: string }

export interface Market { grain: number; wood: number; iron: number }

export interface GameState {
  /** save format version */
  v: 2;
  /** the seed this game started from (the live RNG position is stored beside it in a save) */
  seed: number;
  turn: number;
  lords: Lord[];
  C: County[];
  market: Market;
  over: Over;
  log: LogEntry[];
}

export interface BattleReport {
  from: string;
  to: string;
  att: number;
  dfn: number;
  atk: number;
  def: number;
  won: boolean;
  sent: Units;
  lostA: Units;
  lostD: Units;
  turn: number;
}

export type SendResult = { kind: 'move'; m: Units } | { kind: 'battle'; report: BattleReport };
