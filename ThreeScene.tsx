import { Canvas, useFrame } from '@react-three/fiber/native';
import { TextureLoader } from 'expo-three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import {
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';

const T = 0.08; // wall / floor thickness
const LID_OPEN = -1.9; // radians the hinged lid swings open (~109°)
const FLOOR_Y = -0.3675; // world y where the box bottom rests (0.525 * 0.7 scale)

type Tex = {
  lidtop: Texture;
  lidskirt: Texture;
  front: Texture;
  side: Texture;
  back: Texture;
  red: Texture;
  kraft: Texture;
  lidinner: Texture;
  bump: Texture;
};

// Shared, mutable state written by the PanResponder and read in useFrame.
type Controls = {
  rotX: number;
  rotY: number;
  dragging: boolean;
  startX: number;
  startY: number;
  open: boolean;
  lidAmt: number; // 0 = closed, 1 = fully open
  lidVel: number; // spring velocity
};

function cardboard(map: Texture, bump: Texture) {
  return new MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.025,
    roughness: 0.82,
    metalness: 0,
  });
}

function ShoeBox({ tex, controls }: { tex: Tex; controls: Controls }) {
  const group = useRef<Group>(null);
  const lid = useRef<Group>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (group.current) {
      // turntable spin while closed and untouched
      if (!controls.dragging && !controls.open) controls.rotY += dt * 0.4;
      group.current.rotation.x = controls.rotX;
      group.current.rotation.y = controls.rotY;
      // keep the box roughly on the floor when tilted
      group.current.position.y = Math.sin(Math.abs(controls.rotX)) * 0.55;
    }
    if (lid.current) {
      // under-damped spring: slight overshoot, like cardboard flexing open
      const target = controls.open ? 1 : 0;
      controls.lidVel += (70 * (target - controls.lidAmt) - 9 * controls.lidVel) * dt;
      controls.lidAmt += controls.lidVel * dt;
      lid.current.rotation.x = controls.lidAmt * LID_OPEN;
    }
  });

  const M = useMemo(
    () => ({
      red: cardboard(tex.red, tex.bump),
      kraft: cardboard(tex.kraft, tex.bump),
      lidinner: cardboard(tex.lidinner, tex.bump),
      lidtop: cardboard(tex.lidtop, tex.bump),
      lidskirt: cardboard(tex.lidskirt, tex.bump),
      front: cardboard(tex.front, tex.bump),
      side: cardboard(tex.side, tex.bump),
      back: cardboard(tex.back, tex.bump),
    }),
    [tex],
  );

  // 6-material array (order +X,-X,+Y,-Y,+Z,-Z): kraft on the interior face and on
  // the top rim (idx 2) — the visible cut edge of real cardboard.
  const panel = (
    outer: MeshStandardMaterial,
    outerIdx: number,
    interiorIdx: number,
  ) =>
    [0, 1, 2, 3, 4, 5].map((i) =>
      i === outerIdx ? outer : i === interiorIdx || i === 2 ? M.kraft : M.red,
    );

  const mats = useMemo(
    () => ({
      floor: [0, 1, 2, 3, 4, 5].map((i) => (i === 2 ? M.kraft : M.red)),
      frontZ: panel(M.front, 4, 5), // +Z pill logo + size label
      backZ: panel(M.back, 5, 4), // -Z NIKE lockup
      rightX: panel(M.side, 0, 1), // +X NIKE + barcode
      leftX: panel(M.side, 1, 0), // -X NIKE + barcode
      spine: [M.red, M.red, M.kraft, M.red, M.kraft, M.red],
      lidTop: [0, 1, 2, 3, 4, 5].map((i) =>
        i === 2 ? M.lidtop : i === 3 ? M.lidinner : M.red,
      ),
      lidSkirtSide: (idx: number) =>
        [0, 1, 2, 3, 4, 5].map((i) => (i === idx ? M.kraft : M.red)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [M],
  );

  const yBot = -0.525;
  const wallH = 0.95 - T;
  const wallY = yBot + T + wallH / 2;
  const sideDepth = 1.4 - 2 * T;

  // Lid front skirt with a semicircular thumb notch die-cut into its bottom edge.
  const skirt = useMemo(() => {
    const w = 2.44;
    const h = 0.2;
    const r = 0.1; // notch radius
    const s = new Shape();
    s.moveTo(-w / 2, -h / 2);
    s.lineTo(-r, -h / 2);
    s.absarc(0, -h / 2, r, Math.PI, 0, true); // U-shaped dip up into the skirt
    s.lineTo(w / 2, -h / 2);
    s.lineTo(w / 2, h / 2);
    s.lineTo(-w / 2, h / 2);
    s.closePath();

    const body = new ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
    const skin = new ShapeGeometry(s);
    // Remap ShapeGeometry's raw x/y UVs to 0..1 over the skirt bounds.
    const p = skin.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = (p.getX(i) + w / 2) / w;
      uv[i * 2 + 1] = (p.getY(i) + h / 2) / h;
    }
    skin.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    return { body, skin };
  }, []);

  return (
    <group ref={group} scale={0.7}>
      <mesh material={mats.floor} position={[0, yBot + T / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, T, 1.4]} />
      </mesh>
      <mesh material={mats.frontZ} position={[0, wallY, 0.7 - T / 2]} castShadow receiveShadow>
        <boxGeometry args={[2.2, wallH, T]} />
      </mesh>
      <mesh material={mats.backZ} position={[0, wallY, -0.7 + T / 2]} castShadow receiveShadow>
        <boxGeometry args={[2.2, wallH, T]} />
      </mesh>
      {/* static back spine: extends the back wall up to just under the lid panel */}
      <mesh material={mats.spine} position={[0, 0.4775, -0.7 + T / 2]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.105, T]} />
      </mesh>
      <mesh material={mats.rightX} position={[1.1 - T / 2, wallY, 0]} castShadow receiveShadow>
        <boxGeometry args={[T, wallH, sideDepth]} />
      </mesh>
      <mesh material={mats.leftX} position={[-1.1 + T / 2, wallY, 0]} castShadow receiveShadow>
        <boxGeometry args={[T, wallH, sideDepth]} />
      </mesh>
      {/* lid = book cover hinged at the crease (top of spine); flush at the back */}
      <group ref={lid} position={[0, 0.54, -0.7]}>
        <mesh material={mats.lidTop} position={[0, 0.04, 0.76]} castShadow receiveShadow>
          <boxGeometry args={[2.44, T, 1.52]} />
        </mesh>
        {/* front skirt with die-cut thumb notch; art continues over from the lid top */}
        <group position={[0, -0.1, 1.44]}>
          <mesh geometry={skirt.body} material={[M.red, M.kraft]} castShadow receiveShadow />
          <mesh geometry={skirt.skin} material={M.lidskirt} position={[0, 0, T + 0.002]} castShadow />
          <mesh
            geometry={skirt.skin}
            material={M.kraft}
            position={[0, 0, -0.002]}
            rotation={[0, Math.PI, 0]}
          />
        </group>
        <mesh material={mats.lidSkirtSide(1)} position={[1.18, -0.1, 0.78]} castShadow receiveShadow>
          <boxGeometry args={[T, 0.2, 1.48]} />
        </mesh>
        <mesh material={mats.lidSkirtSide(0)} position={[-1.18, -0.1, 0.78]} castShadow receiveShadow>
          <boxGeometry args={[T, 0.2, 1.48]} />
        </mesh>
        {/* folded locking tabs at the back corners of the lid interior */}
        <mesh material={M.kraft} position={[0.88, -0.03, 0.16]} rotation={[-0.55, 0, 0]}>
          <boxGeometry args={[0.24, 0.016, 0.15]} />
        </mesh>
        <mesh material={M.kraft} position={[-0.88, -0.03, 0.16]} rotation={[-0.55, 0, 0]}>
          <boxGeometry args={[0.24, 0.016, 0.15]} />
        </mesh>
      </group>
    </group>
  );
}

export default function ThreeScene() {
  const [tex, setTex] = useState<Tex | null>(null);

  const controls = useRef<Controls>({
    rotX: 0.05,
    rotY: 0.6,
    dragging: false,
    startX: 0.05,
    startY: 0.6,
    open: false,
    lidAmt: 0,
    lidVel: 0,
  }).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          controls.dragging = true;
          controls.startX = controls.rotX;
          controls.startY = controls.rotY;
        },
        onPanResponderMove: (_e, g) => {
          controls.rotY = controls.startY + g.dx * 0.01;
          controls.rotX = MathUtils.clamp(
            controls.startX + g.dy * 0.01,
            -0.05,
            0.5,
          );
        },
        onPanResponderRelease: (_e, g) => {
          controls.dragging = false;
          if (Math.hypot(g.dx, g.dy) < 8) controls.open = !controls.open;
        },
        onPanResponderTerminate: () => {
          controls.dragging = false;
        },
      }),
    [controls],
  );

  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    Promise.all([
      loader.loadAsync(require('./assets/box/lidtop.png')),
      loader.loadAsync(require('./assets/box/lidskirt.png')),
      loader.loadAsync(require('./assets/box/front.png')),
      loader.loadAsync(require('./assets/box/side.png')),
      loader.loadAsync(require('./assets/box/logo.png')),
      loader.loadAsync(require('./assets/box/red.png')),
      loader.loadAsync(require('./assets/box/kraft.png')),
      loader.loadAsync(require('./assets/box/lidinner.png')),
      loader.loadAsync(require('./assets/box/bump.png')),
    ]).then(([lidtop, lidskirt, front, side, back, red, kraft, lidinner, bump]) => {
      [lidtop, lidskirt, front, side, back, red, kraft, lidinner].forEach((t) => {
        t.colorSpace = SRGBColorSpace; // color maps
        t.anisotropy = 8;
      });
      bump.anisotropy = 8; // bump stays linear
      if (alive) setTex({ lidtop, lidskirt, front, side, back, red, kraft, lidinner, bump });
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <Canvas
        shadows
        gl={{ logarithmicDepthBuffer: true }}
        camera={{ position: [3.1, 1.6, 3.4], fov: 45, near: 1.5, far: 40 }}
      >
        <color attach="background" args={['#e9e7e3']} />
        <hemisphereLight args={['#ffffff', '#b8b0a4', 0.9]} />
        <ambientLight intensity={0.25} />
        <directionalLight
          castShadow
          position={[4, 8, 5]}
          intensity={1.6}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-3}
          shadow-camera-right={3}
          shadow-camera-top={3}
          shadow-camera-bottom={-3}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-5, 3, -2]} intensity={0.35} color="#ffe4cf" />
        {/* studio floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#dedad5" roughness={0.95} metalness={0} />
        </mesh>
        {tex && <ShoeBox tex={tex} controls={controls} />}
      </Canvas>
    </View>
  );
}
