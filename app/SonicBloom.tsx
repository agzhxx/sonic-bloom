"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, OrbitControls, Sparkles } from "@react-three/drei";
import { Expand, Headphones, Pause, Play, RotateCcw, SlidersHorizontal, Upload, Volume2, VolumeX } from "lucide-react";
import * as THREE from "three";
import { ChangeEvent, DragEvent, MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

type AudioMetrics = { bass: number; mids: number; highs: number; energy: number; beat: number };
type Mood = { name: string; label: string; primary: string; secondary: string; bg: string };

const MOODS: Mood[] = [
  { name: "orchid", label: "Orchid", primary: "#b67cff", secondary: "#5ef0d2", bg: "#090711" },
  { name: "ember", label: "Ember", primary: "#ff7657", secondary: "#ffd35e", bg: "#120806" },
  { name: "abyss", label: "Abyss", primary: "#5599ff", secondary: "#d164ff", bg: "#050914" },
];

function averageRange(data: Uint8Array, from: number, to: number) {
  let sum = 0;
  for (let i = from; i < Math.min(to, data.length); i += 1) sum += data[i];
  return sum / Math.max(1, Math.min(to, data.length) - from) / 255;
}

const PETAL_COUNT = 16;
const PETAL_POINTS = 72;
const DUST_COUNT = 760;

function BloomScene({ metrics, spectrum, mood, sensitivity, isPlaying }: {
  metrics: MutableRefObject<AudioMetrics>;
  spectrum: MutableRefObject<Uint8Array>;
  mood: Mood;
  sensitivity: number;
  isPlaying: boolean;
}) {
  const sculpture = useRef<THREE.Group>(null);
  const bloom = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const petals = useRef<THREE.Group>(null);
  const dust = useRef<THREE.Points>(null);
  const halos = useRef<THREE.Group>(null);
  const material = useRef<{ distort: number; speed: number; color: THREE.Color }>(null);
  const openness = useRef(0);

  const petalBuffers = useMemo(
    () => Array.from({ length: PETAL_COUNT }, () => new Float32Array(PETAL_POINTS * 3)),
    [],
  );

  const dustData = useMemo(() => {
    const directions = new Float32Array(DUST_COUNT * 3);
    const positions = new Float32Array(DUST_COUNT * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const y = 1 - (i / (DUST_COUNT - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = golden * i;
      directions[i * 3] = Math.cos(theta) * radius;
      directions[i * 3 + 1] = y;
      directions[i * 3 + 2] = Math.sin(theta) * radius;
    }
    return { directions, positions };
  }, []);

  useFrame((state, delta) => {
    const { bass, mids, highs, energy, beat } = metrics.current;
    const data = spectrum?.current ?? new Uint8Array(512);
    const t = state.clock.elapsedTime;
    const targetOpen = isPlaying ? 1 : 0;
    openness.current = THREE.MathUtils.lerp(openness.current, targetOpen, isPlaying ? 0.035 : 0.055);
    const open = openness.current;

    if (sculpture.current) {
      sculpture.current.rotation.y += delta * (0.055 + open * (0.08 + mids * 0.24));
      sculpture.current.rotation.z = Math.sin(t * 0.13) * 0.055;
    }
    if (bloom.current) {
      const pulse = 1 + open * (bass * 0.17 * sensitivity + beat * 0.07);
      bloom.current.scale.lerp(new THREE.Vector3(pulse, pulse, pulse), 0.16);
      bloom.current.rotation.x += delta * (0.07 + mids * 0.22);
      bloom.current.rotation.y -= delta * (0.1 + highs * 0.32);
    }
    if (material.current) {
      const targetDistort = 0.12 + open * (0.18 + bass * 0.48 + mids * 0.22) * sensitivity;
      material.current.distort = THREE.MathUtils.lerp(material.current.distort, targetDistort, 0.1);
      material.current.speed = 0.7 + open * (0.7 + energy * 3.2);
      material.current.color.lerp(new THREE.Color(mood.primary), 0.06);
    }
    if (shell.current) {
      shell.current.rotation.x -= delta * (0.05 + highs * 0.17);
      shell.current.rotation.z += delta * 0.045;
      const shellScale = 1 + open * (0.08 + mids * 0.12);
      shell.current.scale.lerp(new THREE.Vector3(shellScale, shellScale, shellScale), 0.08);
    }

    if (petals.current) {
      petals.current.children.forEach((child, petalIndex) => {
        const line = child as THREE.Line;
        if (!line.geometry) return;
        const attribute = line.geometry.getAttribute("position") as THREE.BufferAttribute;
        if (!attribute) return;
        const values = attribute.array as Float32Array;
        const baseAngle = (petalIndex / PETAL_COUNT) * Math.PI * 2;
        for (let j = 0; j < PETAL_POINTS; j += 1) {
          const u = j / (PETAL_POINTS - 1);
          const fold = Math.sin(Math.PI * u);
          const bin = 2 + ((j * 2 + petalIndex * 7) % 190);
          const frequency = isPlaying ? (data[bin] || 0) / 255 : 0;
          const fineMotion = Math.sin(t * (0.7 + frequency * 1.6) + petalIndex * 1.7 + u * 7);
          const length = 0.24 + fold * (0.38 + open * (0.72 + frequency * 0.88 * sensitivity));
          const curl = (u - 0.5) * (0.75 + petalIndex % 2 * 0.18) + open * fineMotion * 0.1 * (0.25 + mids);
          const angle = baseAngle + curl;
          values[j * 3] = Math.cos(angle) * length;
          values[j * 3 + 1] = Math.sin(angle) * length;
          values[j * 3 + 2] = fold * Math.sin(petalIndex * 1.9 + u * Math.PI * 2) * (0.12 + open * (0.18 + frequency * 0.38));
        }
        attribute.needsUpdate = true;
        const lineMaterial = line.material as THREE.LineBasicMaterial;
        lineMaterial.opacity = THREE.MathUtils.lerp(lineMaterial.opacity, 0.1 + open * (0.25 + energy * 0.26), 0.08);
      });
    }

    if (dust.current?.geometry) {
      const attribute = dust.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      const positions = attribute.array as Float32Array;
      for (let i = 0; i < DUST_COUNT; i += 1) {
        const bin = 2 + ((i * 11) % 210);
        const frequency = isPlaying ? (data[bin] || 0) / 255 : 0;
        const shimmer = Math.sin(t * 1.3 + i * 0.17) * 0.025;
        const radius = 0.73 + shimmer + open * (0.24 + frequency * 1.08 * sensitivity);
        positions[i * 3] = dustData.directions[i * 3] * radius;
        positions[i * 3 + 1] = dustData.directions[i * 3 + 1] * radius;
        positions[i * 3 + 2] = dustData.directions[i * 3 + 2] * radius;
      }
      attribute.needsUpdate = true;
      dust.current.rotation.y -= delta * (0.035 + highs * 0.22);
      const dustMaterial = dust.current.material as THREE.PointsMaterial;
      dustMaterial.size = 0.012 + open * (0.006 + highs * 0.025);
      dustMaterial.opacity = 0.25 + open * (0.25 + highs * 0.3);
    }

    if (halos.current) {
      halos.current.children.forEach((child, index) => {
        const halo = child as THREE.Mesh;
        const phase = Math.max(0, beat - index * 0.16);
        const target = 1 + open * (index * 0.16 + bass * 0.18 + phase * 0.9);
        halo.scale.lerp(new THREE.Vector3(target, target, target), 0.18);
        (halo.material as THREE.MeshBasicMaterial).opacity = open * (0.045 + phase * 0.2);
      });
    }
  });

  return (
    <>
      <ambientLight intensity={0.32} />
      <pointLight position={[4.5, 3, 5]} color={mood.primary} intensity={18} distance={11} />
      <pointLight position={[-3, -2, 3]} color={mood.secondary} intensity={11} distance={9} />
      <group ref={sculpture} position={[0.72, 0.08, 0]} scale={0.92}>
        <Float speed={0.8} rotationIntensity={0.06} floatIntensity={0.16}>
          <mesh ref={bloom}>
            <icosahedronGeometry args={[0.68, 7]} />
            <MeshDistortMaterial ref={material as never} color={mood.primary} roughness={0.16} metalness={0.78} distort={0.14} speed={0.8} />
          </mesh>
          <mesh ref={shell}>
            <icosahedronGeometry args={[0.82, 3]} />
            <meshBasicMaterial color={mood.secondary} wireframe transparent opacity={0.24} blending={THREE.AdditiveBlending} />
          </mesh>
          <group ref={petals}>
            {petalBuffers.map((positions, i) => (
              <line key={i}>
                <bufferGeometry>
                  <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                </bufferGeometry>
                <lineBasicMaterial color={i % 3 === 0 ? mood.secondary : mood.primary} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
              </line>
            ))}
          </group>
          <points ref={dust}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[dustData.positions, 3]} />
            </bufferGeometry>
            <pointsMaterial color={mood.secondary} size={0.012} transparent opacity={0.3} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
          </points>
          <group ref={halos} rotation={[Math.PI / 2, 0, 0]}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} rotation={[0.16 * i, 0.22 * i, 0]}>
                <torusGeometry args={[1.03 + i * 0.12, 0.008, 5, 120]} />
                <meshBasicMaterial color={i === 1 ? mood.secondary : mood.primary} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
              </mesh>
            ))}
          </group>
        </Float>
      </group>
      <Sparkles count={42} scale={[6, 4.5, 4]} size={1.25} speed={0.16} opacity={0.24} color={mood.primary} />
      <OrbitControls target={[0.72, 0.08, 0]} enablePan={false} minDistance={5.8} maxDistance={9.5} autoRotate autoRotateSpeed={0.12} />
    </>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  return `${mins}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export function SonicBloom() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const metrics = useRef<AudioMetrics>({ bass: 0, mids: 0, highs: 0, energy: 0, beat: 0 });
  const spectrum = useRef(new Uint8Array(512));
  const previousSpectrum = useRef(new Float32Array(512));
  const fluxAverage = useRef(0.018);
  const lastBeatAt = useRef(0);
  const objectUrl = useRef<string | null>(null);
  const [track, setTrack] = useState("Untitled bloom");
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [moodIndex, setMoodIndex] = useState(0);
  const [sensitivity, setSensitivity] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const mood = MOODS[moodIndex];

  const connectAudio = useCallback(async () => {
    if (!audioRef.current) return;
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      const source = context.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceRef.current = source;
    }
    await audioContextRef.current.resume();
  }, []);

  useEffect(() => {
    let frame = 0;
    const data = new Uint8Array(512);
    const analyse = () => {
      const analyser = analyserRef.current;
      if (analyser) {
        analyser.getByteFrequencyData(data);
        spectrum.current.set(data);
        const rawBass = averageRange(data, 1, 7);
        const rawMids = averageRange(data, 7, 55);
        const rawHighs = averageRange(data, 55, 210);
        let flux = 0;
        for (let i = 2; i < 150; i += 1) {
          const normalized = data[i] / 255;
          flux += Math.max(0, normalized - previousSpectrum.current[i]);
          previousSpectrum.current[i] = normalized;
        }
        flux /= 148;
        fluxAverage.current = fluxAverage.current * 0.94 + flux * 0.06;
        const now = performance.now();
        const onset = flux > fluxAverage.current * 1.72 && rawBass > 0.16 && now - lastBeatAt.current > 190;
        if (onset) lastBeatAt.current = now;
        const previous = metrics.current;
        const bass = THREE.MathUtils.lerp(previous.bass, rawBass, 0.24);
        const mids = THREE.MathUtils.lerp(previous.mids, rawMids, 0.2);
        const highs = THREE.MathUtils.lerp(previous.highs, rawHighs, 0.17);
        const energy = bass * 0.5 + mids * 0.36 + highs * 0.14;
        const beat = onset ? 1 : previous.beat * 0.78;
        metrics.current = { bass, mids, highs, energy, beat };
      } else {
        metrics.current = { bass: 0, mids: 0, highs: 0, energy: 0, beat: 0 };
        spectrum.current.fill(0);
      }
      frame = requestAnimationFrame(analyse);
    };
    analyse();
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  const loadFile = useCallback(async (file?: File) => {
    if (!file || !file.type.startsWith("audio/")) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = objectUrl.current;
    setTrack(file.name.replace(/\.[^.]+$/, ""));
    setCurrentTime(0);
    await connectAudio();
    await audio.play();
  }, [connectAudio]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio?.src) { inputRef.current?.click(); return; }
    await connectAudio();
    if (audio.paused) await audio.play(); else audio.pause();
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files[0]);
  };

  const updateVolume = (value: number) => {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
    else void document.exitFullscreen();
  };

  return (
    <main className="sonic-app" style={{ "--mood": mood.primary, "--mood-2": mood.secondary, "--mood-bg": mood.bg } as React.CSSProperties}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <audio ref={audioRef} preload="metadata" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} onEnded={() => setIsPlaying(false)} />
      <input ref={inputRef} className="sr-only" type="file" accept="audio/*" onChange={(e: ChangeEvent<HTMLInputElement>) => void loadFile(e.target.files?.[0])} />

      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grain" />
      <section className="visual-stage" aria-label="Interactive audio-reactive 3D sculpture">
        <Canvas dpr={[1, 1.65]} camera={{ position: [0, 0, 7.4], fov: 38 }} gl={{ antialias: true, alpha: true }}>
          <BloomScene metrics={metrics} spectrum={spectrum} mood={mood} sensitivity={sensitivity} isPlaying={isPlaying} />
        </Canvas>
      </section>

      <header className="topbar">
        <a className="brand" href="#" aria-label="Sonic Bloom home"><span className="brand-mark"><i /><i /><i /></span><span>SONIC <b>BLOOM</b></span></a>
        <div className="live-status"><span /> REAL-TIME AUDIO SCULPTURE</div>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setShowSettings((v) => !v)} aria-label="Visualizer settings"><SlidersHorizontal size={18} /></button>
          <button className="icon-button" onClick={toggleFullscreen} aria-label="Enter fullscreen"><Expand size={18} /></button>
        </div>
      </header>

      <section className="hero-copy">
        <div className="eyebrow"><span>01</span> LIVING FREQUENCIES</div>
        <h1>Your music.<br /><em>In bloom.</em></h1>
        <p>Every frequency becomes form. Every beat leaves a pulse. Drop in a track and watch a one-of-one sculpture come alive.</p>
        <button className="upload-button" onClick={() => inputRef.current?.click()}><Upload size={17} /> Choose a track</button>
      </section>

      <div className="mood-switcher" aria-label="Visual mood">
        <span>VISUAL MOOD</span>
        <div>{MOODS.map((item, i) => <button key={item.name} className={i === moodIndex ? "active" : ""} onClick={() => setMoodIndex(i)}><i style={{ background: item.primary }} />{item.label}</button>)}</div>
      </div>

      {showSettings && <aside className="settings-panel">
        <div><span>RESPONSE</span><button onClick={() => setShowSettings(false)}>Close</button></div>
        <label>Sensitivity <strong>{sensitivity.toFixed(1)}×</strong><input type="range" min="0.5" max="1.8" step="0.1" value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} /></label>
        <button className="reset-button" onClick={() => setSensitivity(1)}><RotateCcw size={14} /> Reset sculpture</button>
        <small>Drag the sculpture to orbit. Scroll to move closer.</small>
      </aside>}

      <section className="player-dock" aria-label="Music player">
        <div className="track-info">
          <div className="cover"><span>SB</span><div /></div>
          <div><span>NOW BLOOMING</span><strong>{track}</strong><small>{audioRef.current?.src ? "Local audio" : "Waiting for a track"}</small></div>
        </div>
        <div className="transport">
          <button className="play-button" onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
          <div className="timeline">
            <span>{formatTime(currentTime)}</span>
            <input aria-label="Track position" type="range" min="0" max={duration || 100} value={currentTime} onChange={(e) => { const value = Number(e.target.value); if (audioRef.current) audioRef.current.currentTime = value; setCurrentTime(value); }} />
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <div className="volume">
          <button onClick={() => updateVolume(volume ? 0 : 0.82)} aria-label={volume ? "Mute" : "Unmute"}>{volume ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
          <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => updateVolume(Number(e.target.value))} />
          <Headphones size={16} />
        </div>
      </section>

      <footer><span>WEB AUDIO × THREE.JS</span><span>DRAG TO ORBIT&nbsp;&nbsp;·&nbsp;&nbsp; SCROLL TO ZOOM</span></footer>
      {dragging && <div className="drop-overlay" onDragLeave={() => setDragging(false)}><div><Upload size={28} /><strong>Release to bloom</strong><span>MP3, WAV, OGG or M4A</span></div></div>}
    </main>
  );
}
