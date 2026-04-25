import * as THREE from "three";
import { HAND_CONNECTIONS } from "./tracking";

// Court / hoop geometry constants (real basketball arcade-ish dimensions, scaled down a touch).
export const HOOP_Z = -3.6;          // backboard sits at this Z (away from user)
export const RIM_HEIGHT = 2.7;       // arcade hoops are lower than 3.05m for accessibility
export const RIM_RADIUS = 0.23;      // standard ~46cm dia
export const RIM_OFFSET_FROM_BOARD = 0.32;
export const BOARD_WIDTH = 1.5;
export const BOARD_HEIGHT = 0.95;
export const BOARD_THICKNESS = 0.04;
export const BACKBOARD_Z = HOOP_Z;
export const RIM_Z = HOOP_Z + RIM_OFFSET_FROM_BOARD;
export const BALL_RADIUS = 0.12;
export const USER_Z = 1.4;            // user stands here (player's Z)
export const FLOOR_RADIUS = 14;

export type Hand3D = {
  root: THREE.Group;
  joints: THREE.Mesh[];          // 21 joint spheres
  bones: THREE.Mesh[];           // 21 cylinder bones (one per HAND_CONNECTIONS entry)
};

export type SceneBundle = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  floor: THREE.Mesh;
  hoop: THREE.Group;
  ballMesh: THREE.Mesh;
  ballTrail: THREE.Line;
  swishSpark: THREE.Points;
  leftHand: Hand3D;
  rightHand: Hand3D;
};

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
  scene.fog = new THREE.Fog(0x05070b, 10, 28);

  // PMREM env scene (chrome rim, backboard glass catch a soft highlight).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x1a1f2c);
  const envSun = new THREE.Mesh(
    new THREE.SphereGeometry(2, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff4c0 }),
  );
  envSun.position.set(4, 8, -4);
  envScene.add(envSun);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  // Camera — over-the-shoulder behind the user, looking at the rim.
  const camera = new THREE.PerspectiveCamera(52, container.clientWidth / container.clientHeight, 0.05, 80);
  camera.position.set(0, 1.85, USER_Z + 1.6);
  camera.lookAt(0, RIM_HEIGHT - 0.2, HOOP_Z * 0.6);

  // Lighting — moody but readable.
  scene.add(new THREE.AmbientLight(0x6b7fa8, 0.4));

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.5, 6, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 22;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0003;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xff8a3c, 0.7);
  rim.position.set(-3, 3, -4);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0x7fdcff, 0.35);
  fill.position.set(4, 2, 1);
  scene.add(fill);

  const floor = makeFloor();
  scene.add(floor);

  // Subtle stage ring on the floor where the user shoots from.
  const stage = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 0.92, 64),
    new THREE.MeshBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  );
  stage.rotation.x = -Math.PI / 2;
  stage.position.set(0, 0.001, USER_Z);
  scene.add(stage);

  const hoop = makeHoop();
  scene.add(hoop);

  const ballMesh = makeBall();
  scene.add(ballMesh);

  const ballTrail = makeBallTrail();
  scene.add(ballTrail);

  const swishSpark = makeSpark();
  swishSpark.visible = false;
  scene.add(swishSpark);

  const leftHand = makeHand3D(0x22d3ee);   // cyan
  const rightHand = makeHand3D(0xff8a3c);  // orange (matches court ring + hoop)
  leftHand.root.visible = false;
  rightHand.root.visible = false;
  scene.add(leftHand.root);
  scene.add(rightHand.root);

  return { renderer, scene, camera, floor, hoop, ballMesh, ballTrail, swishSpark, leftHand, rightHand };
}

// ------------------------------- Hand3D — animated 21-joint hand -------------------------------

function makeHand3D(accent: number): Hand3D {
  const root = new THREE.Group();

  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xfdebd0,
    roughness: 0.5,
    metalness: 0.0,
    emissive: accent,
    emissiveIntensity: 0.18,
  });
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xfdebd0,
    roughness: 0.55,
    metalness: 0.0,
    emissive: accent,
    emissiveIntensity: 0.14,
  });

  // Joint sphere sizing — slightly bigger for wrist + finger tips, smaller for mid-finger joints.
  const jointRadius = (i: number): number => {
    if (i === 0) return 0.022;                                // wrist
    if (i === 4 || i === 8 || i === 12 || i === 16 || i === 20) return 0.014; // tips
    return 0.011;
  };

  const joints: THREE.Mesh[] = [];
  for (let i = 0; i < 21; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(jointRadius(i), 16, 12), jointMat);
    m.castShadow = true;
    root.add(m);
    joints.push(m);
  }

  // One cylinder per connection. We'll position+orient each per frame.
  const bones: THREE.Mesh[] = [];
  for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
    const bone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 1, 10),
      boneMat,
    );
    bone.castShadow = true;
    root.add(bone);
    bones.push(bone);
  }

  // Soft accent halo around the wrist for visibility.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 12),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  joints[0].add(halo);

  return { root, joints, bones };
}

// Place the 21 joints at the given world positions, then re-orient all 21 bones to span them.
export function updateHand3D(
  hand: Hand3D,
  worldPositions: THREE.Vector3[],   // length 21
): void {
  if (worldPositions.length < 21) return;
  for (let i = 0; i < 21; i++) {
    hand.joints[i].position.copy(worldPositions[i]);
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
    const [a, b] = HAND_CONNECTIONS[i];
    const pa = worldPositions[a];
    const pb = worldPositions[b];
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    const dir = pb.clone().sub(pa);
    const len = dir.length();
    const bone = hand.bones[i];
    bone.position.copy(mid);
    bone.scale.set(1, Math.max(len, 0.0001), 1);
    if (len > 1e-6) {
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.divideScalar(len));
      bone.quaternion.copy(q);
    }
  }
  hand.root.visible = true;
}

export function hideHand3D(hand: Hand3D): void {
  hand.root.visible = false;
}

// ------------------------------- Floor (reused from table tennis) -------------------------------

function makeFloor(): THREE.Mesh {
  const tex = makeWoodTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.35,
    metalness: 0.1,
    envMapIntensity: 0.6,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_RADIUS, 96), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  // Painted court ring — orange to match the basketball theme.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.8, 3.95, 96),
    new THREE.MeshStandardMaterial({ color: 0xff8a3c, roughness: 0.5, metalness: 0.1 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  floor.add(ring);

  // Inner court infill — slight tint so the court reads.
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(3.8, 96),
    new THREE.MeshStandardMaterial({ color: 0x2d3142, roughness: 0.6, metalness: 0.05 }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.0005;
  floor.add(inner);

  return floor;
}

function makeWoodTexture(): THREE.CanvasTexture {
  const W = 1024, H = 1024;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#a87242";
  ctx.fillRect(0, 0, W, H);
  const plankH = 96;
  for (let y = 0; y < H; y += plankH) {
    const shade = 0.85 + Math.random() * 0.3;
    ctx.fillStyle = `rgba(120,70,30,${0.25 * shade})`;
    ctx.fillRect(0, y, W, 2);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(70,40,15,${0.08 + Math.random() * 0.08})`;
      ctx.lineWidth = 1 + Math.random() * 1.5;
      ctx.beginPath();
      const yy = y + Math.random() * plankH;
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(W / 3, yy + (Math.random() - 0.5) * 8, 2 * W / 3, yy + (Math.random() - 0.5) * 8, W, yy);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// ------------------------------- Hoop (backboard + rim + net + post) -------------------------------

function makeHoop(): THREE.Group {
  const g = new THREE.Group();

  // Backboard — translucent white acrylic with a black border.
  const boardMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.35,
    opacity: 0.9,
    transparent: true,
    roughness: 0.05,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.0,
  });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_THICKNESS),
    boardMat,
  );
  board.position.set(0, RIM_HEIGHT + 0.18, BACKBOARD_Z);
  board.castShadow = true;
  board.receiveShadow = true;
  g.add(board);

  // Black border around the backboard.
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 });
  const borderTop = new THREE.Mesh(new THREE.BoxGeometry(BOARD_WIDTH + 0.04, 0.04, BOARD_THICKNESS + 0.01), borderMat);
  borderTop.position.set(0, RIM_HEIGHT + 0.18 + BOARD_HEIGHT / 2, BACKBOARD_Z);
  g.add(borderTop);
  const borderBottom = borderTop.clone();
  borderBottom.position.y = RIM_HEIGHT + 0.18 - BOARD_HEIGHT / 2;
  g.add(borderBottom);
  const borderLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, BOARD_HEIGHT, BOARD_THICKNESS + 0.01), borderMat);
  borderLeft.position.set(-BOARD_WIDTH / 2, RIM_HEIGHT + 0.18, BACKBOARD_Z);
  g.add(borderLeft);
  const borderRight = borderLeft.clone();
  borderRight.position.x = BOARD_WIDTH / 2;
  g.add(borderRight);

  // White inner rectangle (the shooter's square above the rim).
  const innerSquare = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.45),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 }),
  );
  // Hollow rectangle outline using 4 thin meshes so it reads as a frame, not a fill.
  innerSquare.visible = false;
  void innerSquare;
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const innerW = 0.6, innerH = 0.45, innerLW = 0.012;
  const innerY = RIM_HEIGHT + 0.18;
  const innerZ = BACKBOARD_Z + BOARD_THICKNESS / 2 + 0.001;
  const innerTop = new THREE.Mesh(new THREE.BoxGeometry(innerW, innerLW, 0.002), outlineMat);
  innerTop.position.set(0, innerY + innerH / 2, innerZ);
  g.add(innerTop);
  const innerBottom = innerTop.clone();
  innerBottom.position.y = innerY - innerH / 2;
  g.add(innerBottom);
  const innerLeft = new THREE.Mesh(new THREE.BoxGeometry(innerLW, innerH, 0.002), outlineMat);
  innerLeft.position.set(-innerW / 2, innerY, innerZ);
  g.add(innerLeft);
  const innerRight = innerLeft.clone();
  innerRight.position.x = innerW / 2;
  g.add(innerRight);

  // Rim — torus, bright orange, slightly emissive so it pops in low light.
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xff5722,
    roughness: 0.32,
    metalness: 0.6,
    emissive: 0xff5722,
    emissiveIntensity: 0.25,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_RADIUS, 0.018, 16, 64), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, RIM_HEIGHT, RIM_Z);
  rim.castShadow = true;
  g.add(rim);

  // Backplate connecting rim to board.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.06, RIM_OFFSET_FROM_BOARD - 0.05),
    new THREE.MeshStandardMaterial({ color: 0xc8323a, roughness: 0.5, metalness: 0.4 }),
  );
  plate.position.set(0, RIM_HEIGHT - 0.005, RIM_Z - (RIM_OFFSET_FROM_BOARD - 0.05) / 2 - 0.05);
  g.add(plate);

  // Net — 12 vertical strands hanging from the rim, slightly tapered inward.
  const netMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const NET_SEGMENTS = 12;
  const NET_TOP = RIM_HEIGHT;
  const NET_BOTTOM = RIM_HEIGHT - 0.4;
  const NET_TOP_R = RIM_RADIUS - 0.005;
  const NET_BOTTOM_R = RIM_RADIUS * 0.6;
  for (let i = 0; i < NET_SEGMENTS; i++) {
    const a = (i / NET_SEGMENTS) * Math.PI * 2;
    const x1 = Math.cos(a) * NET_TOP_R;
    const z1 = Math.sin(a) * NET_TOP_R;
    const x2 = Math.cos(a) * NET_BOTTOM_R;
    const z2 = Math.sin(a) * NET_BOTTOM_R;
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, NET_TOP, z1),
      new THREE.Vector3(x1 * 0.85, (NET_TOP + NET_BOTTOM) / 2 + 0.05, z1 * 0.85),
      new THREE.Vector3(x2, NET_BOTTOM, z2),
    ]);
    const line = new THREE.Line(geom, netMat);
    line.position.set(0, 0, RIM_Z);
    g.add(line);
  }
  // Cross strands — connect adjacent verticals at mid-height for the woven look.
  for (let i = 0; i < NET_SEGMENTS; i++) {
    const a = (i / NET_SEGMENTS) * Math.PI * 2;
    const a2 = ((i + 1) / NET_SEGMENTS) * Math.PI * 2;
    const r = (NET_TOP_R + NET_BOTTOM_R) / 2 * 0.92;
    const y = (NET_TOP + NET_BOTTOM) / 2 + 0.05;
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
      new THREE.Vector3(Math.cos(a2) * r, y, Math.sin(a2) * r),
    ]);
    const line = new THREE.Line(geom, netMat);
    line.position.set(0, 0, RIM_Z);
    g.add(line);
  }

  // Post + arm — pole behind the backboard.
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5, metalness: 0.7 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, RIM_HEIGHT + 0.3, 20), postMat);
  post.position.set(0, (RIM_HEIGHT + 0.3) / 2, BACKBOARD_Z - 0.5);
  post.castShadow = true;
  g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), postMat);
  arm.position.set(0, RIM_HEIGHT + 0.18, BACKBOARD_Z - 0.27);
  arm.castShadow = true;
  g.add(arm);

  // Base plate.
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.7, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.7, metalness: 0.5 }),
  );
  base.position.set(0, 0.04, BACKBOARD_Z - 0.5);
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  return g;
}

// ------------------------------- Ball -------------------------------

function makeBall(): THREE.Mesh {
  const tex = makeBasketballTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.65,
    metalness: 0.05,
    envMapIntensity: 0.5,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 24), mat);
  ball.castShadow = true;
  ball.receiveShadow = true;
  return ball;
}

function makeBasketballTexture(): THREE.CanvasTexture {
  const W = 512, H = 256;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  // Base orange.
  ctx.fillStyle = "#e06b1f";
  ctx.fillRect(0, 0, W, H);
  // Subtle grain (random dots) for that pebbled basketball look.
  ctx.fillStyle = "rgba(140, 60, 15, 0.35)";
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 0.5 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Black seams (lengthwise + crossways across the spherical UV).
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineWidth = 4;
  // Horizontal equator.
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  // Vertical seams (4 evenly spaced).
  for (let i = 0; i < 4; i++) {
    const x = (i / 4) * W + W / 8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // Side curves to suggest panel separation.
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const x = (i / 4) * W + W / 8;
    ctx.beginPath();
    ctx.moveTo(x - 30, 0);
    ctx.bezierCurveTo(x - 5, H / 4, x + 5, (3 * H) / 4, x - 30, H);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------- Effects -------------------------------

function makeBallTrail(): THREE.Line {
  const maxPoints = 22;
  const positions = new Float32Array(maxPoints * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.6 });
  const line = new THREE.Line(geom, mat);
  line.userData.maxPoints = maxPoints;
  line.userData.points = [] as THREE.Vector3[];
  return line;
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

function makeSpark(): THREE.Points {
  const n = 60;
  const positions = new Float32Array(n * 3);
  const velocities = new Float32Array(n * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xfff5c4,
    size: 0.05,
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
    vels[i * 3 + 1] = Math.random() * 4;
    vels[i * 3 + 2] = (Math.random() - 0.5) * 4;
  }
  posAttr.needsUpdate = true;
  spark.visible = true;
  spark.userData.life = 0.6;
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
  (spark.material as THREE.PointsMaterial).opacity = Math.max(0, spark.userData.life / 0.6) * 0.9;
  if (spark.userData.life <= 0) spark.visible = false;
}

export function fitRendererToContainer(bundle: SceneBundle, container: HTMLElement): void {
  const w = container.clientWidth;
  const h = container.clientHeight;
  bundle.renderer.setSize(w, h);
  bundle.camera.aspect = w / h;
  bundle.camera.updateProjectionMatrix();
}
