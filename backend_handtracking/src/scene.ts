import * as THREE from "three";
import { TABLE, USER_END_Z, OPP_END_Z } from "./types";

export type SceneBundle = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  table: THREE.Group;
  net: THREE.Mesh;
  userAvatar: Avatar;
  oppAvatar: Avatar;
  userRacket: Racket;
  oppRacket: Racket;
  ballMesh: THREE.Mesh;
  ballTrail: THREE.Line;
  hitSpark: THREE.Points;
  floor: THREE.Mesh;
};

export type Avatar = {
  root: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  // Arm chain for the playing side only; opponent has a mirrored arm driven by AI.
  shoulder: THREE.Object3D;
  elbow: THREE.Object3D;
  wrist: THREE.Object3D;
  upperArm: THREE.Mesh;
  forearm: THREE.Mesh;
};

export type Racket = {
  root: THREE.Group;     // position = wrist, orientation = palm frame
  head: THREE.Mesh;      // the round paddle
  handle: THREE.Mesh;
};

const GLASS_COLOR = 0x7fdcff;
const ACCENT_USER = 0x22d3ee;
const ACCENT_OPP = 0xf472b6;

export function createSceneBundle(container: HTMLElement): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.Fog(0x05070b, 8, 22);

  // Over-the-shoulder: camera behind user at +Z, looking toward opponent at -Z.
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.05, 60);
  camera.position.set(0.0, 1.85, USER_END_Z + 1.95);
  camera.lookAt(0, TABLE.height + 0.05, -0.4);

  // Lighting — keep it moody but clean.
  scene.add(new THREE.AmbientLight(0x6b7fa8, 0.35));

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.5, 5.5, 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0003;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x7fdcff, 0.9);
  rim.position.set(-3, 3, -4);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xf472b6, 0.35);
  fill.position.set(4, 2, -2);
  scene.add(fill);

  const floor = makeFloor();
  scene.add(floor);

  const table = makeTable();
  scene.add(table);

  const net = makeNet();
  table.add(net);

  // Arena ring — thin glowing ring on the floor for stage framing.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.5, 4.55, 96),
    new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  scene.add(ring);

  const userAvatar = makeAvatar(ACCENT_USER, /*facing*/ -1);
  userAvatar.root.position.set(0, 0, USER_END_Z + 0.18);
  scene.add(userAvatar.root);

  const oppAvatar = makeAvatar(ACCENT_OPP, /*facing*/ +1);
  oppAvatar.root.position.set(0, 0, OPP_END_Z - 0.18);
  scene.add(oppAvatar.root);

  const userRacket = makeRacket(ACCENT_USER);
  scene.add(userRacket.root);

  const oppRacket = makeRacket(ACCENT_OPP);
  scene.add(oppRacket.root);

  const ballMesh = makeBall();
  scene.add(ballMesh);

  const ballTrail = makeBallTrail();
  scene.add(ballTrail);

  const hitSpark = makeSpark();
  hitSpark.visible = false;
  scene.add(hitSpark);

  return {
    renderer,
    scene,
    camera,
    table,
    net,
    userAvatar,
    oppAvatar,
    userRacket,
    oppRacket,
    ballMesh,
    ballTrail,
    hitSpark,
    floor,
  };
}

function makeFloor(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0d14,
    roughness: 0.9,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  return floor;
}

function makeTable(): THREE.Group {
  const g = new THREE.Group();

  // Surface — saturated red for high contrast against the white net + ball.
  const topMat = new THREE.MeshStandardMaterial({
    color: 0xc8323a,
    roughness: 0.5,
    metalness: 0.1,
    emissive: 0x3a0a0d,
    emissiveIntensity: 0.25,
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.length), topMat);
  top.position.y = TABLE.height - TABLE.thickness / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  // White line border (1cm ITTF spec).
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lineW = 0.02;
  const addLine = (w: number, l: number, x: number, z: number) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.001, l),
      lineMat,
    );
    m.position.set(x, TABLE.height + 0.0005, z);
    g.add(m);
  };
  addLine(TABLE.width, lineW, 0, +TABLE.length / 2 - lineW / 2);
  addLine(TABLE.width, lineW, 0, -TABLE.length / 2 + lineW / 2);
  addLine(lineW, TABLE.length, +TABLE.width / 2 - lineW / 2, 0);
  addLine(lineW, TABLE.length, -TABLE.width / 2 + lineW / 2, 0);
  // Centre line.
  addLine(lineW * 1.5, TABLE.length, 0, 0);

  // Leg / skirt — a single dark block underneath for weight.
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x06080c, roughness: 0.8 });
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE.width * 0.94, 0.12, TABLE.length * 0.92),
    skirtMat,
  );
  skirt.position.y = TABLE.height - TABLE.thickness - 0.06;
  skirt.castShadow = true;
  g.add(skirt);

  // Four legs.
  const legMat = new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.6, metalness: 0.4 });
  const legGeom = new THREE.CylinderGeometry(0.025, 0.025, TABLE.height - 0.12);
  const legPos = [
    [+TABLE.width * 0.4, +TABLE.length * 0.42],
    [-TABLE.width * 0.4, +TABLE.length * 0.42],
    [+TABLE.width * 0.4, -TABLE.length * 0.42],
    [-TABLE.width * 0.4, -TABLE.length * 0.42],
  ];
  for (const [lx, lz] of legPos) {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(lx, (TABLE.height - 0.12) / 2, lz);
    leg.castShadow = true;
    g.add(leg);
  }

  return g;
}

function makeNet(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    roughness: 0.4,
    emissive: 0xffffff,
    emissiveIntensity: 0.2,
    side: THREE.DoubleSide,
  });
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.width + 0.1, TABLE.netHeight),
    mat,
  );
  net.position.set(0, TABLE.height + TABLE.netHeight / 2, 0);
  net.rotation.y = Math.PI / 2;
  // Top cord (slightly thicker, pure white) and bottom cord for that real-net look.
  const cordMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, TABLE.width + 0.12), cordMat);
  top.position.set(0, TABLE.netHeight / 2, 0);
  net.add(top);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, TABLE.width + 0.12), cordMat);
  bottom.position.set(0, -TABLE.netHeight / 2, 0);
  net.add(bottom);
  return net;
}

// Toggle for the body/head mascot. Off = floating racket only (arm chain still tracked invisibly).
const MASCOT_VISIBLE = false;

function makeAvatar(accent: number, facing: -1 | 1): Avatar {
  const root = new THREE.Group();

  if (!MASCOT_VISIBLE) {
    const shoulder = new THREE.Object3D();
    const elbow = new THREE.Object3D();
    const wrist = new THREE.Object3D();
    root.add(shoulder, elbow, wrist);
    // Hidden placeholder meshes so the Avatar type stays satisfied.
    const stub = () => new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), new THREE.MeshBasicMaterial({ visible: false }));
    const torso = stub(); torso.visible = false;
    const head = stub(); head.visible = false;
    const upperArm = stub(); upperArm.visible = false;
    const forearm = stub(); forearm.visible = false;
    root.rotation.y = facing === -1 ? 0 : Math.PI;
    return { root, torso, head, shoulder, elbow, wrist, upperArm, forearm };
  }

  // Translucent porcelain — frosted but readable, with accent-colored interior glow.
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xf6fbff,
    transmission: 0.6,
    opacity: 0.55,
    transparent: true,
    thickness: 0.6,
    roughness: 0.35,
    metalness: 0.0,
    ior: 1.3,
    attenuationColor: accent,
    attenuationDistance: 0.8,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });

  // Shirt material — colored translucent for at-a-glance team identification.
  const shirtMat = new THREE.MeshPhysicalMaterial({
    color: accent,
    transmission: 0.4,
    opacity: 0.7,
    transparent: true,
    thickness: 0.4,
    roughness: 0.5,
    emissive: accent,
    emissiveIntensity: 0.35,
  });

  // === Head — Mii-style oversized sphere ===
  const headRadius = 0.16;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 32, 24), skinMat);
  head.position.y = 1.62;
  root.add(head);

  // Eyes — two small dark ellipsoids on the front of the head.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0a0e16 });
  const eyeGeom = new THREE.SphereGeometry(0.018, 16, 10);
  const eyeLeft = new THREE.Mesh(eyeGeom, eyeMat);
  const eyeRight = new THREE.Mesh(eyeGeom, eyeMat);
  // Place on the -Z hemisphere of the head (the "front" of the avatar facing the opponent).
  const eyeZ = -headRadius * 0.92;
  const eyeY = headRadius * 0.05;
  const eyeX = headRadius * 0.42;
  eyeLeft.position.set(-eyeX, eyeY, eyeZ);
  eyeRight.position.set(+eyeX, eyeY, eyeZ);
  eyeLeft.scale.set(0.85, 1.25, 1);
  eyeRight.scale.set(0.85, 1.25, 1);
  head.add(eyeLeft);
  head.add(eyeRight);

  // Tiny nose dot for character.
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2c4b5, roughness: 0.6 }),
  );
  nose.position.set(0, -0.01, eyeZ - 0.005);
  head.add(nose);

  // Hair cap — accent-colored half-sphere on top.
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(headRadius * 1.02, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.55,
      emissive: accent,
      emissiveIntensity: 0.3,
    }),
  );
  hair.position.y = 0.0;
  head.add(hair);

  // Soft accent halo around the head (back-side render so it reads as a glow).
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(headRadius * 1.2, 24, 16),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  head.add(halo);

  // === Neck ===
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 0.06, 16),
    skinMat,
  );
  neck.position.y = 1.46;
  root.add(neck);

  // === Torso (shirt) — wider at shoulders, tapering toward waist ===
  const torsoH = 0.55;
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.17, torsoH, 24, 1, false),
    shirtMat,
  );
  torso.position.y = 1.46 - 0.03 - torsoH / 2;
  root.add(torso);

  // Shoulder caps for a cleaner silhouette.
  const shoulderCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 18, 14),
    shirtMat,
  );
  shoulderCap.position.set(-0.21, torso.position.y + torsoH / 2 - 0.01, 0);
  root.add(shoulderCap);
  const shoulderCap2 = shoulderCap.clone();
  shoulderCap2.position.x = +0.21;
  root.add(shoulderCap2);

  // === Hips / lower body — translucent wedge fading to floor ===
  const hipsHeight = torso.position.y - torsoH / 2 - 0.04;
  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.32, hipsHeight, 24, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: accent,
      transmission: 0.7,
      opacity: 0.32,
      transparent: true,
      thickness: 0.4,
      roughness: 0.5,
      side: THREE.DoubleSide,
      emissive: accent,
      emissiveIntensity: 0.15,
    }),
  );
  lower.position.y = hipsHeight / 2;
  root.add(lower);

  // === Arm chain ===
  // Shoulder origin (anatomical) — actual world position will be driven each frame from pose data.
  const shoulder = new THREE.Object3D();
  shoulder.position.set(0, torso.position.y + torsoH / 2 - 0.05, 0);
  root.add(shoulder);

  const upperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.045, 1, 14),
    skinMat,
  );
  upperArm.visible = false;
  root.add(upperArm);

  const elbow = new THREE.Object3D();
  root.add(elbow);

  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.04, 1, 14),
    skinMat,
  );
  forearm.visible = false;
  root.add(forearm);

  const wrist = new THREE.Object3D();
  root.add(wrist);

  // Mitten hand at the wrist — visible glove sphere so the racket grip looks attached.
  const hand = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    new THREE.MeshPhysicalMaterial({
      color: accent,
      transmission: 0.3,
      opacity: 0.85,
      transparent: true,
      roughness: 0.45,
      emissive: accent,
      emissiveIntensity: 0.5,
    }),
  );
  hand.scale.set(1.1, 1.0, 0.9);
  hand.visible = false;
  root.add(hand);
  // Stash the hand mesh on the wrist Object3D so the avatar driver can position it.
  (wrist as any).handMesh = hand;

  // The "non-playing" arm — static stub on the opposite side so the avatar isn't one-armed-looking.
  const stubShoulder = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 14, 10),
    shirtMat,
  );
  stubShoulder.position.set(0.18, torso.position.y + torsoH / 2 - 0.06, 0.0);
  (stubShoulder as any).isStub = true;
  root.add(stubShoulder);
  const stubArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.36, 14),
    skinMat,
  );
  stubArm.position.set(0.22, torso.position.y - 0.02, 0.0);
  stubArm.rotation.z = Math.PI * 0.06;
  (stubArm as any).isStub = true;
  root.add(stubArm);

  root.rotation.y = facing === -1 ? 0 : Math.PI;

  return { root, torso, head, shoulder, elbow, wrist, upperArm, forearm };
}

// Racket local axes (IMPORTANT — avatar driver depends on these):
//   +Y = from handle toward head (fingers direction)
//   +Z = forehand face normal (palm direction)
//   -Z = backhand face normal (back of hand)
//   +X = thumb-side of the paddle
function makeRacket(accent: number): Racket {
  const root = new THREE.Group();

  // Handle — cylinder along local Y, below origin (sits inside the grip).
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.55, metalness: 0.1 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.11, 20), handleMat);
  handle.position.set(0, -0.055, 0);
  handle.castShadow = true;
  root.add(handle);

  // Handle grip wrap (contrast band for readability at a glance).
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.021, 0.023, 0.07, 20),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.3, roughness: 0.6 }),
  );
  grip.position.set(0, -0.055, 0);
  root.add(grip);

  // Throat — small wedge between handle and paddle head.
  const throat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.022, 0.02, 16),
    handleMat,
  );
  throat.position.set(0, 0.0, 0);
  root.add(throat);

  // Paddle head. A cylinder whose axis is along local Z (rotate X by 90°) — flat faces perpendicular to Z.
  // Head placed above origin along +Y (the fingers direction).
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.08, 0);
  root.add(headGroup);

  const headRadius = 0.13;
  const headThickness = 0.016;

  // Forehand face (red).
  const front = new THREE.Mesh(
    new THREE.CylinderGeometry(headRadius, headRadius, headThickness * 0.5, 48, 1, false),
    new THREE.MeshStandardMaterial({
      color: 0xdc2626, roughness: 0.55, metalness: 0.05,
      emissive: 0x6b0f0f, emissiveIntensity: 0.25,
    }),
  );
  front.rotation.x = Math.PI / 2;
  front.position.z = headThickness * 0.25;
  front.castShadow = true;
  headGroup.add(front);

  // Backhand face (black).
  const back = new THREE.Mesh(
    new THREE.CylinderGeometry(headRadius, headRadius, headThickness * 0.5, 48, 1, false),
    new THREE.MeshStandardMaterial({
      color: 0x0a0a0a, roughness: 0.7,
      emissive: 0x111111, emissiveIntensity: 0.1,
    }),
  );
  back.rotation.x = Math.PI / 2;
  back.position.z = -headThickness * 0.25;
  back.castShadow = true;
  headGroup.add(back);

  // Glowing accent rim — torus around the paddle edge. Bright so the racket is always readable.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(headRadius, 0.0065, 16, 64),
    new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.4,
      roughness: 0.35,
      metalness: 0.3,
    }),
  );
  // Torus default axis is Z — align its ring around the paddle head.
  headGroup.add(rim);

  // Forehand "F" marker so the user can see which face is which while learning.
  // Simple emissive dot on the red face.
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.012, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }),
  );
  dot.position.z = headThickness * 0.5 + 0.0005;
  headGroup.add(dot);

  // Soft halo so it reads even when behind the ghost avatar.
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(headRadius * 1.6, 48),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  halo.position.z = headThickness * 0.6;
  headGroup.add(halo);
  const haloBack = halo.clone();
  haloBack.position.z = -headThickness * 0.6;
  headGroup.add(haloBack);

  return { root, head: front, handle };
}

function makeBall(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff8e0,
    emissiveIntensity: 0.35,
    roughness: 0.35,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.02, 20, 16), mat);
  mesh.castShadow = true;
  return mesh;
}

function makeBallTrail(): THREE.Line {
  const maxPoints = 24;
  const positions = new Float32Array(maxPoints * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const line = new THREE.Line(geom, mat);
  line.userData.maxPoints = maxPoints;
  line.userData.points = [] as THREE.Vector3[];
  return line;
}

function makeSpark(): THREE.Points {
  const n = 24;
  const positions = new Float32Array(n * 3);
  const velocities = new Float32Array(n * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xfff5c4,
    size: 0.04,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const pts = new THREE.Points(geom, mat);
  pts.userData.velocities = velocities;
  pts.userData.life = 0;
  return pts;
}

export function triggerSpark(spark: THREE.Points, pos: THREE.Vector3): void {
  const posAttr = spark.geometry.getAttribute("position") as THREE.BufferAttribute;
  const vels = spark.userData.velocities as Float32Array;
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setXYZ(i, pos.x, pos.y, pos.z);
    vels[i * 3] = (Math.random() - 0.5) * 4;
    vels[i * 3 + 1] = Math.random() * 3;
    vels[i * 3 + 2] = (Math.random() - 0.5) * 4;
  }
  posAttr.needsUpdate = true;
  spark.visible = true;
  spark.userData.life = 0.35;
  (spark.material as THREE.PointsMaterial).opacity = 0.9;
}

export function updateSpark(spark: THREE.Points, dt: number): void {
  if (!spark.visible) return;
  const posAttr = spark.geometry.getAttribute("position") as THREE.BufferAttribute;
  const vels = spark.userData.velocities as Float32Array;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i) + vels[i * 3] * dt;
    const y = posAttr.getY(i) + vels[i * 3 + 1] * dt;
    const z = posAttr.getZ(i) + vels[i * 3 + 2] * dt;
    vels[i * 3 + 1] -= 6 * dt;
    posAttr.setXYZ(i, x, y, z);
  }
  posAttr.needsUpdate = true;
  spark.userData.life -= dt;
  (spark.material as THREE.PointsMaterial).opacity = Math.max(0, spark.userData.life / 0.35) * 0.9;
  if (spark.userData.life <= 0) spark.visible = false;
}

export function pushTrail(trail: THREE.Line, p: THREE.Vector3): void {
  const points = trail.userData.points as THREE.Vector3[];
  const max = trail.userData.maxPoints as number;
  points.push(p.clone());
  while (points.length > max) points.shift();
  const attr = trail.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < points.length; i++) attr.setXYZ(i, points[i].x, points[i].y, points[i].z);
  attr.needsUpdate = true;
  trail.geometry.setDrawRange(0, points.length);
}

export function clearTrail(trail: THREE.Line): void {
  (trail.userData.points as THREE.Vector3[]).length = 0;
  trail.geometry.setDrawRange(0, 0);
}

export function fitRendererToContainer(bundle: SceneBundle, container: HTMLElement): void {
  const w = container.clientWidth;
  const h = container.clientHeight;
  bundle.renderer.setSize(w, h);
  bundle.camera.aspect = w / h;
  bundle.camera.updateProjectionMatrix();
}
