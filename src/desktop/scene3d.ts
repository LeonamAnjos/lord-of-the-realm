// The WebGL board for the desktop layout. It only reads the game state; every action goes back through the callbacks.
// County outlines are the same bent hex shapes the phone map draws (ui/hex.ts), parsed from their SVG paths and extruded.
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { NC, NEUTRAL, idlePct, season, seenTroops, troops, type County, type GameState } from '../game';
import { COUNTY_PATH, ISLANDS, LAND_PATH, center } from '../ui/hex';

export interface MapScene {
  /** Show this state: the selected county and the counties it could march on. */
  update(s: GameState, sel: number, targets: ReadonlySet<number>): void;
  dispose(): void;
}

/** One SVG unit in world units, and the size of the 2D map box. */
const S = 0.1, W = 400, D = 262;
const TOP = 0.45;
const wx = (x: number) => (x - W / 2) * S;
const wz = (y: number) => (y - D / 2) * S;

const OWNER_HEX = ['#c0412b', '#4f86d0', '#43a877', '#9b6bd0'];
const NEUTRAL_HEX = '#9a9482';
const ownerHex = (o: number) => OWNER_HEX[o] ?? NEUTRAL_HEX;

/** Grass, leaves, wheat and sea tint for Spring, Summer, Autumn, Winter. */
const GRASS = ['#6fae4a', '#58a23a', '#b39a3a', '#e1e9ec'];
const LEAF = ['#3f7a4c', '#2f6b3f', '#c27a2c', '#cfdde0'];
const LEAF2 = ['#4d8a58', '#3b7a48', '#a85f22', '#b9cbd0'];
const WHEAT = ['#9cb24a', '#d6b84a', '#c99a34', '#b9b9a8'];

/* ---------- small helpers ---------- */
function rngFor(seed: number): () => number {
  let a = seed * 2654435761 >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const loader = new SVGLoader();
/** Shapes for an SVG path, as points around (cx, cy), scaled by k about it, in world units with y flipped for the XZ plane. */
function ptsOf(d: string, cx: number, cy: number, k = 1): THREE.Vector2[][] {
  const data = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
  const out: THREE.Vector2[][] = [];
  for (const p of data.paths) for (const sh of SVGLoader.createShapes(p)) {
    out.push(sh.getPoints(8).map((v) => new THREE.Vector2((v.x - cx) * k * S, -(v.y - cy) * k * S)));
  }
  return out;
}

/** Extrude outline points upward from y = 0 and lay them on the ground plane. */
function slab(outer: THREE.Vector2[], depth: number, bevel = 0, hole?: THREE.Vector2[]): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(outer);
  if (hole) shape.holes.push(new THREE.Path(hole));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 });
  g.rotateX(-Math.PI / 2);
  return g;
}

const mat = (hex: string, rough = 0.85) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });

/* ---------- sea ---------- */
const SEA_VERT = `varying vec2 vP; void main(){ vP = (modelMatrix * vec4(position,1.)).xz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.); }`;
const SEA_FRAG = `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uEdge;
varying vec2 vP;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 p = vP;
  float d = length(p / vec2(26., 19.));
  vec3 c = mix(uShallow, uDeep, smoothstep(.55, 1.5, d));
  float a = n(p*.7 + vec2(uTime*.07, uTime*.04)) * .6 + n(p*2.1 - vec2(uTime*.09, 0.)) * .4;
  c += (a - .5) * .07;
  float glint = smoothstep(.62, .95, n(p*1.4 + vec2(uTime*.12, -uTime*.09))) * n(p*.6 - uTime*.05);
  c += glint * .16 * (1. - smoothstep(.5, 1.6, d));
  c = mix(c, uEdge, smoothstep(1.3, 3.2, d));
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* ---------- the scene ---------- */
interface CountyNode {
  id: number;
  group: THREE.Group;
  top: THREE.Mesh;
  topMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  props: THREE.Group;
  sig: string;
  lift: number;
  label: HTMLDivElement;
  labelSig: string;
  flags: THREE.Object3D[];
}

export function createScene(host: HTMLElement, onPick: (id: number) => void): MapScene {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'gl-canvas';
  host.appendChild(canvas);
  const labels = document.createElement('div');
  labels.className = 'gl-labels';
  host.appendChild(labels);

  const scene = new THREE.Scene();
  const BG = new THREE.Color('#0b171c');
  scene.background = BG;

  /* light */
  const hemi = new THREE.HemisphereLight('#cfe3ee', '#2a3a2c', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
  sun.position.set(-16, 24, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 70 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  /* sea */
  const seaU = { uTime: { value: 0 }, uDeep: { value: new THREE.Color('#0d2a36') }, uShallow: { value: new THREE.Color('#2b6b73') }, uEdge: { value: BG.clone() } };
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: seaU, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG }),
  );
  sea.position.y = 0.05;
  scene.add(sea);

  /* land: dark soil slab under everything, islands, and a pale shoreline in the shallows */
  const soilMat = mat('#2e2a22', 0.95);
  const shoreMat = new THREE.MeshBasicMaterial({ color: '#7fc3c0', transparent: true, opacity: 0.32, depthWrite: false });
  const land = new THREE.Group();
  for (let i = 0; i < NC; i++) {
    const c = center(i);
    for (const pts of ptsOf(LAND_PATH[i]!, c.x, c.y)) {
      const m = new THREE.Mesh(slab(pts, TOP - 0.05), soilMat);
      m.position.set(wx(c.x), -0.2, wz(c.y));
      m.receiveShadow = true;
      land.add(m);
    }
    for (const pts of ptsOf(LAND_PATH[i]!, c.x, c.y, 1.1)) {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2), shoreMat);
      m.position.set(wx(c.x), 0.065, wz(c.y));
      land.add(m);
    }
  }
  const islandMat = mat('#5d7a45'), sandMat = mat('#c9b987');
  for (const o of ISLANDS) {
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(o.rx * S * 1.25, o.rx * S * 1.4, 0.3, 14), sandMat);
    sand.scale.z = o.ry / o.rx;
    sand.position.set(wx(o.x), 0.1, wz(o.y));
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(o.rx * S * 0.8, o.rx * S * 1.0, 0.34, 12), islandMat);
    grass.scale.z = o.ry / o.rx;
    grass.position.set(wx(o.x), 0.17, wz(o.y));
    sand.receiveShadow = grass.receiveShadow = true;
    land.add(sand, grass);
  }
  scene.add(land);

  /* shared materials that follow the season */
  const grassCol = new THREE.Color(GRASS[1]), leafA = mat(LEAF[1]), leafB = mat(LEAF2[1]), wheat = mat(WHEAT[1], 0.9);
  const trunkMat = mat('#5b4332'), wallMat = mat('#9c9686'), roofBase = mat('#8c7a63'), doorMat = mat('#2b241c');
  const rockMat = mat('#6c7480', 0.95), mineMat = new THREE.MeshStandardMaterial({ color: '#1a1c1e', emissive: '#ff9a3c', emissiveIntensity: 0.0 });
  const ownerMats = [0, 1, 2, 3, -1].map((o) => ({ o, m: mat(ownerHex(o), 0.7), flag: new THREE.MeshStandardMaterial({ color: ownerHex(o), roughness: 0.6, side: THREE.DoubleSide }) }));
  const ownerMat = (o: number) => (ownerMats.find((x) => x.o === (o < 0 ? -1 : o)) ?? ownerMats[4]!);
  const seasonTargets = { grass: grassCol.clone(), leafA: new THREE.Color(LEAF[1]), leafB: new THREE.Color(LEAF2[1]), wheat: new THREE.Color(WHEAT[1]) };

  /* shared geometry for props */
  const G = {
    trunk: new THREE.CylinderGeometry(0.04, 0.055, 0.2, 5).translate(0, 0.1, 0),
    pine1: new THREE.ConeGeometry(0.27, 0.55, 7).translate(0, 0.42, 0),
    pine2: new THREE.ConeGeometry(0.2, 0.42, 7).translate(0, 0.72, 0),
    houseBody: new THREE.BoxGeometry(0.46, 0.28, 0.36).translate(0, 0.14, 0),
    houseRoof: new THREE.ConeGeometry(0.38, 0.26, 4).rotateY(Math.PI / 4).translate(0, 0.41, 0),
    keepBody: new THREE.BoxGeometry(0.9, 1.0, 0.9).translate(0, 0.5, 0),
    merlon: new THREE.BoxGeometry(0.2, 0.14, 0.2),
    pole: new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4).translate(0, 0.3, 0),
    flag: new THREE.PlaneGeometry(0.34, 0.2, 4, 1).translate(0.17, 0, 0),
    door: new THREE.BoxGeometry(0.2, 0.3, 0.04),
    field: new THREE.BoxGeometry(1.1, 0.04, 0.7).translate(0, 0.02, 0),
    furrow: new THREE.BoxGeometry(1.1, 0.012, 0.05).translate(0, 0.046, 0),
    rock: new THREE.ConeGeometry(0.75, 0.9, 5).translate(0, 0.45, 0),
    rock2: new THREE.ConeGeometry(0.45, 0.55, 5).translate(0, 0.27, 0),
    adit: new THREE.BoxGeometry(0.28, 0.26, 0.1),
    body: new THREE.CylinderGeometry(0.045, 0.06, 0.2, 6).translate(0, 0.1, 0),
    head: new THREE.SphereGeometry(0.05, 8, 6).translate(0, 0.25, 0),
    spear: new THREE.CylinderGeometry(0.008, 0.008, 0.42, 4).translate(0.07, 0.21, 0),
    wall: new THREE.CylinderGeometry(1, 1, 1, 18, 1, true),
    tower: new THREE.CylinderGeometry(0.17, 0.2, 0.62, 8).translate(0, 0.31, 0),
    towerTop: new THREE.ConeGeometry(0.23, 0.26, 8).translate(0, 0.75, 0),
  };
  const skin = mat('#e3c9a6', 0.9), dark = mat('#2b241c');

  const nodes: CountyNode[] = [];
  const pickables: THREE.Object3D[] = [];
  for (let i = 0; i < NC; i++) {
    const c = center(i);
    const [outline] = ptsOf(COUNTY_PATH[i]!, c.x, c.y)!;
    const [inner] = ptsOf(COUNTY_PATH[i]!, c.x, c.y, 0.9);
    const group = new THREE.Group();
    group.position.set(wx(c.x), 0, wz(c.y));
    const topMat = new THREE.MeshStandardMaterial({ color: GRASS[1], roughness: 0.9 });
    const sideMat = mat('#4a4234', 0.95);
    const top = new THREE.Mesh(slab(outline!, TOP, 0.035), [topMat, sideMat]);
    top.castShadow = true; top.receiveShadow = true;
    top.userData['id'] = i;
    const ringMat = new THREE.MeshBasicMaterial({ color: OWNER_HEX[0], toneMapped: false });
    // a coloured rim: the county outline with the middle cut out, laid on its top edge
    const ring = new THREE.Mesh(slab(outline!, 0.03, 0, inner), ringMat);
    ring.position.y = TOP + 0.035;
    const props = new THREE.Group();
    props.position.y = TOP + 0.035;
    group.add(top, ring, props);
    scene.add(group);
    pickables.push(top);
    const label = document.createElement('div');
    label.className = 'gl-label';
    labels.appendChild(label);
    nodes.push({ id: i, group, top, topMat, ring, ringMat, props, sig: '', lift: 0, label, labelSig: '', flags: [] });
  }

  /* ---------- props: what a county looks like ---------- */
  function buildProps(n: CountyNode, c: County): void {
    n.props.clear();
    n.flags = [];
    const rnd = rngFor(c.id * 977 + 13), P = n.props;
    const own = ownerMat(c.owner);
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, z: number, y = 0, ry = 0): THREE.Mesh => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true;
      P.add(o);
      return o;
    };
    const lit = c.owner !== NEUTRAL;

    // forest: more where timber is rich, more again when people cut it
    const trees = Math.min(16, 3 + Math.round(c.w * 4) + Math.floor(c.work.wood / 6));
    for (let k = 0; k < trees; k++) {
      const a = rnd() * Math.PI * 2, r = 0.5 + rnd() * 0.9;
      const x = 2.15 + Math.cos(a) * r, z = 0.1 + Math.sin(a) * r * 1.2, sc = 0.75 + rnd() * 0.55, lm = k % 2 ? leafA : leafB;
      const t = new THREE.Group();
      t.position.set(x, 0, z); t.scale.setScalar(sc);
      for (const [g, m] of [[G.trunk, trunkMat], [G.pine1, lm], [G.pine2, lm]] as const) { const o = new THREE.Mesh(g, m); o.castShadow = true; t.add(o); }
      P.add(t);
    }

    // fields: one strip per 20% of people farming
    const fields = c.work.farm > 0 ? Math.min(4, 1 + Math.floor(c.work.farm / 20)) : 0;
    for (let k = 0; k < fields; k++) {
      const f = add(G.field, wheat, -2.05 + (k % 2) * 0.1, 0.35 + k * 0.62 - 0.4);
      f.castShadow = false;
      for (let j = -1; j <= 1; j++) { const fu = add(G.furrow, trunkMat, -2.05 + (k % 2) * 0.1, 0.35 + k * 0.62 - 0.4 + j * 0.2); fu.castShadow = false; }
    }

    // village: a house for every 50 people, roofs in the lord's colour
    const houses = Math.min(6, Math.ceil(c.pop / 50));
    for (let k = 0; k < houses; k++) {
      const x = -0.2 + (k % 3) * 0.62 + (rnd() - 0.5) * 0.15, z = 1.55 + Math.floor(k / 3) * 0.55;
      add(G.houseBody, roofBase, x, z, 0, (rnd() - 0.5) * 0.4);
      add(G.houseRoof, own.m, x, z, 0, 0);
    }

    // mine: a rocky outcrop where there is ore; the entrance glows when people dig
    if (c.i > 0) {
      add(G.rock, rockMat, -2.4, -1.75, 0, 0.3);
      add(G.rock2, rockMat, -1.75, -1.95, 0, 1.2);
      if (c.work.mine > 0) { const a = add(G.adit, mineMat, -2.4, -1.28, 0.02, 0); a.castShadow = false; }
    }

    // keep, in the lord's colour; walls and towers grow with the fort
    if (lit) {
      add(G.keepBody, wallMat, 0, -0.55);
      for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const) add(G.merlon, wallMat, dx, -0.55 + dz, 1.07);
      add(G.door, doorMat, 0, -0.08, 0.15);
      const pole = add(G.pole, trunkMat, 0, -0.55, 1.14);
      pole.scale.y = 1 + c.fort * 0.2;
      const flag = new THREE.Mesh(G.flag, own.flag);
      flag.position.set(0.015, 1.14 + 0.46 * (1 + c.fort * 0.2), -0.55);
      P.add(flag);
      n.flags.push(flag);
      if (c.fort >= 1) {
        const w = new THREE.Mesh(G.wall, wallMat);
        w.scale.set(1.45, 0.22 + 0.1 * c.fort, 1.1); w.position.set(0, (0.22 + 0.1 * c.fort) / 2, -0.4);
        (w.material as THREE.Material).side = THREE.DoubleSide;
        w.castShadow = true; w.receiveShadow = true;
        P.add(w);
      }
      if (c.fort >= 2) for (const [dx, dz] of [[-1.4, -0.4], [1.4, -0.4], [-1.0, 0.55], [1.0, 0.55]] as const) { add(G.tower, wallMat, dx, dz); add(G.towerTop, own.m, dx, dz); }
    } else {
      // unclaimed: a ruined stone ring
      add(G.merlon, wallMat, 0, -0.5, 0.07).scale.set(3, 1, 3);
      add(G.rock2, rockMat, 0.3, -0.3, 0).scale.setScalar(0.5);
    }

    // soldiers drawn up in front of the keep, one per ~12
    const men = Math.min(14, Math.ceil(troops(c) / 12));
    for (let k = 0; k < men; k++) {
      const row = Math.floor(k / 7), col = k % 7;
      const x = (col - 3) * 0.2, z = 0.6 + row * 0.22;
      const m = new THREE.Group();
      m.position.set(x, 0, z);
      for (const [g, mm] of [[G.body, own.m], [G.head, skin], [G.spear, dark]] as const) { const o = new THREE.Mesh(g, mm); o.castShadow = true; m.add(o); }
      P.add(m);
    }
  }

  /* ---------- labels ---------- */
  function setLabel(n: CountyNode, s: GameState, c: County, sel: boolean): void {
    const lord = c.owner === NEUTRAL ? 'No lord' : s.lords[c.owner]!.short;
    const sig = [c.name, c.owner, c.pop, seenTroops(s, c), c.work.farm, c.work.wood, c.work.mine, sel].join('|');
    if (sig === n.labelSig) return;
    n.labelSig = sig;
    const jobs = c.owner === 0
      ? `<span class="gj"><i class="jf">${c.work.farm}</i><i class="jw">${c.work.wood}</i><i class="ji">${c.work.mine}</i><i class="jc">${idlePct(c)}</i></span>` : '';
    n.label.className = 'gl-label' + (sel ? ' sel' : '') + (c.owner === 0 ? ' mine' : '');
    n.label.style.setProperty('--oc', ownerHex(c.owner));
    n.label.innerHTML = `<b>${c.name}</b><span class="gs"><em>${lord}</em> · <u>${c.pop}</u> people · <u>${seenTroops(s, c)}</u> troops</span>${jobs}`;
  }

  /* ---------- attack arrows ---------- */
  const arrows = new THREE.Group();
  scene.add(arrows);
  let arrowKey = '';
  const arrowLines: THREE.Line[] = [];
  function setArrows(sel: number, targets: ReadonlySet<number>): void {
    const key = sel + ':' + [...targets].join(',');
    if (key === arrowKey) return;
    arrowKey = key;
    for (const l of arrowLines) { l.geometry.dispose(); (l.material as THREE.Material).dispose(); }
    arrowLines.length = 0; arrows.clear();
    const a = center(sel);
    for (const t of targets) {
      const b = center(t);
      const from = new THREE.Vector3(wx(a.x), 0.95, wz(a.y)), to = new THREE.Vector3(wx(b.x), 0.95, wz(b.y));
      const mid = from.clone().lerp(to, 0.5); mid.y += 2.2;
      const pts = new THREE.QuadraticBezierCurve3(from, mid, to).getPoints(36);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#ffe6b0', dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.9, toneMapped: false }));
      line.computeLineDistances();
      arrows.add(line); arrowLines.push(line);
    }
  }

  /* ---------- weather: rain in spring, motes in summer, leaves in autumn, snow in winter ---------- */
  const PN = 520;
  const pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3);
  const pr = rngFor(7);
  for (let k = 0; k < PN; k++) { pPos[k * 3] = (pr() - 0.5) * 50; pPos[k * 3 + 1] = pr() * 14; pPos[k * 3 + 2] = (pr() - 0.5) * 36; pVel[k * 3] = pr(); pVel[k * 3 + 1] = pr(); pVel[k * 3 + 2] = pr(); }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!; const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const pMat = new THREE.PointsMaterial({ size: 0.12, map: dot, transparent: true, depthWrite: false, opacity: 0.8, color: '#ffffff', sizeAttenuation: true });
  const weather = new THREE.Points(pGeo, pMat);
  weather.frustumCulled = false;
  scene.add(weather);
  const WEATHER = [
    { col: '#bfd8e6', size: 0.07, fall: 7, drift: 0.2, op: 0.5 },
    { col: '#fff4c4', size: 0.1, fall: -0.15, drift: 0.2, op: 0.5 },
    { col: '#e0902c', size: 0.15, fall: 1.2, drift: 1.1, op: 0.85 },
    { col: '#ffffff', size: 0.13, fall: 1.0, drift: 0.5, op: 0.95 },
  ] as const;

  /* ---------- camera ---------- */
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 300);
  const view = { yaw: reduced ? 0 : -0.6, polar: reduced ? 0.9 : 0.55, zoom: reduced ? 1 : 1.5 };
  const goal = { yaw: 0, polar: 0.9, zoom: 1 };
  const look = new THREE.Vector3(0, 0.4, 0.5);
  let width = 1, height = 1, inset = 0;
  function layout(): void {
    width = host.clientWidth || 1; height = host.clientHeight || 1;
    const side = host.parentElement?.querySelector<HTMLElement>('.dt-side');
    inset = side ? side.offsetWidth + 40 : 0;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.setViewOffset(width, height, inset / 2, 0, width, height);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(layout);
  ro.observe(host);
  layout();

  function placeCamera(): void {
    const f = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
    const aspect = Math.max(0.5, (width - inset) / height);
    const fit = Math.max(42 / (f * aspect), 22 / f);
    const d = fit * view.zoom;
    camera.position.set(look.x + d * Math.sin(view.polar) * Math.sin(view.yaw), look.y + d * Math.cos(view.polar), look.z + d * Math.sin(view.polar) * Math.cos(view.yaw));
    camera.lookAt(look);
  }

  /* ---------- pointer ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hover = -1, down: { x: number; y: number; yaw: number; polar: number } | null = null, dragged = false;
  function pick(e: PointerEvent): number {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? (hit.object.userData['id'] as number) : -1;
  }
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, yaw: goal.yaw, polar: goal.polar }; dragged = false;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (dragged || Math.hypot(dx, dy) > 5) {
        dragged = true; canvas.style.cursor = 'grabbing';
        goal.yaw = THREE.MathUtils.clamp(down.yaw - dx * 0.004, -0.7, 0.7);
        goal.polar = THREE.MathUtils.clamp(down.polar - dy * 0.004, 0.45, 1.15);
      }
      return;
    }
    hover = pick(e);
    canvas.style.cursor = hover >= 0 ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', (e) => {
    const was = dragged; down = null; dragged = false;
    canvas.style.cursor = 'grab';
    if (!was) { const id = pick(e); if (id >= 0) onPick(id); }
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); goal.zoom = THREE.MathUtils.clamp(goal.zoom * Math.exp(e.deltaY * 0.0012), 0.5, 1.2); }, { passive: false });
  canvas.addEventListener('dblclick', () => { goal.yaw = 0; goal.polar = 0.9; goal.zoom = 1; });
  canvas.style.cursor = 'grab';

  /* ---------- state in ---------- */
  let cur: { s: GameState; sel: number; targets: ReadonlySet<number> } | null = null;
  let se = 1;
  const sigOf = (c: County) => [c.owner, Math.ceil(c.pop / 50), Math.round(c.w * 4), c.work.farm, c.work.wood, c.work.mine, c.fort, Math.ceil(troops(c) / 12), c.i > 0].join(',');

  function update(s: GameState, sel: number, targets: ReadonlySet<number>): void {
    cur = { s, sel, targets };
    se = season(s);
    for (const n of nodes) {
      const c = s.C[n.id]!;
      const sig = sigOf(c);
      if (sig !== n.sig) { n.sig = sig; buildProps(n, c); }
      setLabel(n, s, c, n.id === sel);
    }
    setArrows(sel, targets);
    seasonTargets.grass.set(GRASS[se]!); seasonTargets.leafA.set(LEAF[se]!); seasonTargets.leafB.set(LEAF2[se]!); seasonTargets.wheat.set(WHEAT[se]!);
    const w = WEATHER[se]!;
    pMat.color.set(w.col); pMat.size = w.size; pMat.opacity = reduced ? 0 : w.op;
  }

  /* ---------- frame ---------- */
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3(), white = new THREE.Color('#ffffff'), c1 = new THREE.Color();
  let elapsed = 0;
  function tick(): void {
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += reduced ? 0 : dt;
    seaU.uTime.value = elapsed;
    const k = 1 - Math.exp(-dt * 5);
    view.yaw += (goal.yaw - view.yaw) * (reduced ? 1 : 1 - Math.exp(-dt * 2.6));
    view.polar += (goal.polar - view.polar) * (reduced ? 1 : 1 - Math.exp(-dt * 2.6));
    view.zoom += (goal.zoom - view.zoom) * (reduced ? 1 : 1 - Math.exp(-dt * 3));
    placeCamera();

    grassCol.lerp(seasonTargets.grass, k * 0.6);
    leafA.color.lerp(seasonTargets.leafA, k * 0.6); leafB.color.lerp(seasonTargets.leafB, k * 0.6); wheat.color.lerp(seasonTargets.wheat, k * 0.6);
    const night = se === 3 ? 0.9 : 1.0;
    hemi.intensity += (night * 0.9 - hemi.intensity) * k;

    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4);
    for (const n of nodes) {
      const c = cur?.s.C[n.id];
      const isSel = cur?.sel === n.id, isTgt = !!cur?.targets.has(n.id);
      const goalLift = isSel ? 0.3 : n.id === hover ? 0.14 : isTgt ? 0.06 : 0;
      n.lift += (goalLift - n.lift) * (1 - Math.exp(-dt * 10));
      n.group.position.y = n.lift;
      const oc = ownerHex(c ? c.owner : -1);
      n.topMat.color.copy(grassCol).lerp(c1.set(oc), 0.14);
      n.ringMat.color.set(oc);
      if (isSel) n.ringMat.color.set('#ffffff');
      else if (isTgt) n.ringMat.color.lerp(white, 0.35 + 0.65 * pulse);
      else if (n.id === hover) n.ringMat.color.lerp(white, 0.5);
      for (const f of n.flags) { f.rotation.y = Math.sin(elapsed * 3 + n.id) * 0.25; f.scale.x = 0.85 + 0.15 * Math.sin(elapsed * 5 + n.id); }
    }
    arrows.position.y = 0.3;
    for (const l of arrowLines) (l.material as THREE.LineDashedMaterial).opacity = 0.55 + 0.4 * pulse;
    mineMat.emissiveIntensity = 0.6 + 0.4 * Math.sin(elapsed * 2);

    // weather
    const w = WEATHER[se]!;
    const arr = pGeo.getAttribute('position') as THREE.BufferAttribute;
    if (!reduced) {
      for (let p = 0; p < PN; p++) {
        const i3 = p * 3;
        pPos[i3] = pPos[i3]! + Math.sin(elapsed * 0.8 + pVel[i3 + 1]! * 9) * w.drift * dt;
        pPos[i3 + 1] = pPos[i3 + 1]! - w.fall * (0.6 + pVel[i3]! * 0.8) * dt;
        pPos[i3 + 2] = pPos[i3 + 2]! + Math.cos(elapsed * 0.6 + pVel[i3]! * 9) * w.drift * 0.6 * dt;
        if (w.fall > 0 ? pPos[i3 + 1]! < 0.3 : pPos[i3 + 1]! > 12) pPos[i3 + 1] = w.fall > 0 ? 13 : 0.4;
      }
      arr.needsUpdate = true;
    }

    renderer.render(scene, camera);

    // labels follow their counties
    for (const n of nodes) {
      tmp.set(n.group.position.x, n.group.position.y + TOP + 2.0, n.group.position.z).project(camera);
      const x = (tmp.x * 0.5 + 0.5) * width, y = (-tmp.y * 0.5 + 0.5) * height;
      n.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      n.label.style.zIndex = String(1000 + Math.round(y));
      n.label.style.opacity = tmp.z < 1 ? '' : '0';
    }
  }
  renderer.setAnimationLoop(tick);

  return {
    update,
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      dot.dispose();
      renderer.dispose();
      canvas.remove(); labels.remove();
    },
  };
}
