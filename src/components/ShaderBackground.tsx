import React, { useEffect, useRef } from 'react';
import type { ThemeViewMode } from '../utils/offlineEngine';

interface ShaderBackgroundProps {
  themeMode: ThemeViewMode;
  isRecording: boolean;
  isProcessing: boolean;
  audioEnergy: number;
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform vec3 uClickRipple;
  uniform float uAudioEnergy;
  uniform float uRecording;
  uniform float uProcessing;
  uniform float uThemeMix;

  // Smooth 2D hash & value noise for 3D Liquid Morphing Silk
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Domain-warped 3D elevation field (Liquid Silk + Acoustic Ripples)
  float liquidElevation(vec2 p, float t, float energy, float rec) {
    vec2 q = vec2(
      noise2D(p * 1.35 + vec2(t * 0.22, -t * 0.18)),
      noise2D(p * 1.35 + vec2(-t * 0.19, t * 0.24) + 4.2)
    );
    float waveAmp = 1.0 + rec * (0.85 + energy * 1.65);
    vec2 warped = p + q * (0.65 * waveAmp);

    float h = 0.0;
    h += 0.50 * sin(warped.x * 2.4 + t * 0.75) * cos(warped.y * 2.1 - t * 0.55);
    h += 0.28 * sin((warped.x - warped.y) * 3.8 - t * 1.15);
    h += 0.22 * noise2D(warped * 3.1 + t * 0.35);
    return h * waveAmp;
  }

  void main() {
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 uv = vUv;
    vec2 st = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 mouseSt = (uMouse - 0.5) * vec2(aspect, 1.0);

    // Mouse parallax camera offset
    vec2 parallaxSt = st - mouseSt * 0.14;

    // Dynamic time speed based on Idle / Processing / Recording states
    float t = uTime;

    // Mouse proximity ripple
    float mouseDist = length(st - mouseSt);
    float mouseWave = sin(mouseDist * 18.0 - t * 3.2) * exp(-mouseDist * 3.4) * 0.16;

    // Click shockwave ripple
    vec2 clickSt = (uClickRipple.xy - 0.5) * vec2(aspect, 1.0);
    float clickAge = uClickRipple.z;
    float clickDist = length(st - clickSt);
    float clickRing = 0.0;
    if (clickAge > 0.0 && clickAge < 2.5) {
      float radius = clickAge * 1.15;
      clickRing = exp(-pow((clickDist - radius) * 9.5, 2.0)) * (1.0 - clickAge / 2.5);
    }

    // Compute 3D Liquid Silk height & surface normal via finite differences
    float eps = 0.015;
    float hCenter = liquidElevation(parallaxSt * 1.6, t, uAudioEnergy, uRecording) + mouseWave + clickRing * 0.35;
    float hRight  = liquidElevation((parallaxSt + vec2(eps, 0.0)) * 1.6, t, uAudioEnergy, uRecording);
    float hUp     = liquidElevation((parallaxSt + vec2(0.0, eps)) * 1.6, t, uAudioEnergy, uRecording);

    vec3 normal = normalize(vec3((hCenter - hRight) / eps, (hCenter - hUp) / eps, 1.4));
    vec3 lightDir = normalize(vec3(mouseSt.x * 1.4, mouseSt.y * 1.4 + 0.5, 1.2));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfVec = normalize(lightDir + viewDir);

    float diff = max(0.0, dot(normal, lightDir));
    float spec = pow(max(0.0, dot(normal, halfVec)), 28.0);
    float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.0);

    // 3D Perspective Cyber-Acoustic Grid warped by liquid elevation
    vec2 gridUv = parallaxSt * vec2(11.0, 11.0) + normal.xy * 0.36;
    vec2 gridFract = abs(fract(gridUv - 0.5) - 0.5);
    float gridLine = smoothstep(0.055, 0.008, min(gridFract.x, gridFract.y));
    float radialFade = exp(-dot(st, st) * 0.72);
    float gridMask = gridLine * radialFade * (0.42 + uRecording * 0.45 + uProcessing * 0.30 + clickRing * 0.75);

    // Volumetric Aurora Ribbon across the horizon
    float auroraWave = sin(parallaxSt.x * 2.5 + hCenter * 2.1 + t * 0.65) * 0.25;
    float auroraBand = exp(-pow((parallaxSt.y - auroraWave) * 2.6, 2.0));
    float secondAurora = exp(-pow((parallaxSt.y + auroraWave * 0.85 - 0.18) * 3.1, 2.0));

    // Voice frequency pulse rings when recording
    float voicePulse = 0.0;
    if (uRecording > 0.01) {
      float ringDist = length(st);
      voicePulse = (0.5 + 0.5 * sin(ringDist * 22.0 - t * 7.5)) * exp(-ringDist * 1.9) * uRecording * (0.45 + uAudioEnergy * 0.95);
    }

    // Dark Mode Palette: Obsidian Black (#050507), Deep Slate (#111b2e), Silver & Emerald (#10b981)
    vec3 darkBase = vec3(0.018, 0.022, 0.032);
    vec3 darkSlate = vec3(0.055, 0.115, 0.185);
    vec3 emeraldGlow = vec3(0.063, 0.785, 0.535);
    vec3 silverSheen = vec3(0.82, 0.88, 0.94);
    vec3 cyanNeural = vec3(0.08, 0.74, 0.84);

    vec3 darkCol = mix(darkBase, darkSlate, clamp(diff * 0.85 + uv.y * 0.40, 0.0, 1.0));
    darkCol += silverSheen * (spec * 0.34 + fresnel * 0.20);
    darkCol += emeraldGlow * auroraBand * (0.28 + uRecording * (0.35 + uAudioEnergy * 0.50));
    darkCol += cyanNeural * secondAurora * (0.18 + uProcessing * 0.28);
    darkCol += mix(emeraldGlow, cyanNeural, 0.35 + 0.45 * uProcessing) * gridMask * 0.62;
    darkCol += emeraldGlow * (voicePulse * 0.65 + clickRing * 0.55);
    darkCol += emeraldGlow * exp(-mouseDist * 3.6) * (0.16 + uRecording * 0.20);

    // Light Mode Palette: Pearl White (#f8fafc), Soft Platinum (#e2e8f0), Subtle Indigo/Emerald Iridescence
    vec3 lightBase = vec3(0.965, 0.978, 0.990);
    vec3 lightPlatinum = vec3(0.855, 0.895, 0.938);
    vec3 lightIndigo = vec3(0.80, 0.87, 0.96);
    vec3 lightEmerald = vec3(0.063, 0.725, 0.506);

    vec3 lightCol = mix(lightPlatinum, lightBase, clamp(diff * 0.70 + uv.y * 0.45, 0.0, 1.0));
    lightCol = mix(lightCol, lightIndigo, fresnel * 0.42);
    lightCol += vec3(1.0) * spec * 0.38;
    lightCol = mix(lightCol, lightEmerald, (auroraBand + secondAurora * 0.5) * (0.14 + uRecording * (0.22 + uAudioEnergy * 0.28)));
    lightCol = mix(lightCol, lightEmerald * 0.85, gridMask * 0.28 + voicePulse * 0.32 + clickRing * 0.28);

    vec3 finalColor = mix(darkCol, lightCol, uThemeMix);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export const ShaderBackground: React.FC<ShaderBackgroundProps> = ({
  themeMode,
  isRecording,
  isProcessing,
  audioEnergy,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({
    themeMode,
    isRecording,
    isProcessing,
    audioEnergy,
  });

  useEffect(() => {
    propsRef.current = { themeMode, isRecording, isProcessing, audioEnergy };
  }, [themeMode, isRecording, isProcessing, audioEnergy]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      (canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      }) as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) return;

    const isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    gl.useProgram(program);

    // Full-screen quad buffer
    const quadVertices = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const aPositionLoc = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uTimeLoc = gl.getUniformLocation(program, 'uTime');
    const uResolutionLoc = gl.getUniformLocation(program, 'uResolution');
    const uMouseLoc = gl.getUniformLocation(program, 'uMouse');
    const uClickRippleLoc = gl.getUniformLocation(program, 'uClickRipple');
    const uAudioEnergyLoc = gl.getUniformLocation(program, 'uAudioEnergy');
    const uRecordingLoc = gl.getUniformLocation(program, 'uRecording');
    const uProcessingLoc = gl.getUniformLocation(program, 'uProcessing');
    const uThemeMixLoc = gl.getUniformLocation(program, 'uThemeMix');

    // Damped interactive state
    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let curMouseX = 0.5;
    let curMouseY = 0.5;

    let clickX = 0.5;
    let clickY = 0.5;
    let clickTimestamp = -10;

    let dampedEnergy = 0;
    let dampedRecording = 0;
    let dampedProcessing = 0;
    let dampedTheme = propsRef.current.themeMode === 'light' ? 1 : 0;

    let accumulatedTime = 0;
    let lastFrameTime = performance.now();
    let rafId = 0;

    const handlePointerMove = (e: MouseEvent) => {
      targetMouseX = e.clientX / Math.max(1, window.innerWidth);
      targetMouseY = 1.0 - e.clientY / Math.max(1, window.innerHeight);
    };

    const handlePointerDown = (e: MouseEvent) => {
      clickX = e.clientX / Math.max(1, window.innerWidth);
      clickY = 1.0 - e.clientY / Math.max(1, window.innerHeight);
      clickTimestamp = accumulatedTime;
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('mousedown', handlePointerDown, { passive: true });

    const resize = () => {
      const dpr = isHeadless ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    const render = (now: number) => {
      if (isHeadless && now - lastFrameTime < 80) {
        rafId = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min(0.1, Math.max(0.001, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      const {
        themeMode: mode,
        isRecording: rec,
        isProcessing: proc,
        audioEnergy: energy,
      } = propsRef.current;

      const dampFactor = 1.0 - Math.exp(-6.5 * dt);
      curMouseX += (targetMouseX - curMouseX) * dampFactor;
      curMouseY += (targetMouseY - curMouseY) * dampFactor;

      dampedRecording += ((rec ? 1.0 : 0.0) - dampedRecording) * dampFactor;
      dampedProcessing += ((proc ? 1.0 : 0.0) - dampedProcessing) * dampFactor;
      dampedEnergy += ((rec ? energy : 0.0) - dampedEnergy) * (1.0 - Math.exp(-10.0 * dt));
      dampedTheme += ((mode === 'light' ? 1.0 : 0.0) - dampedTheme) * dampFactor;

      const speedMult =
        1.0 + dampedRecording * (1.35 + dampedEnergy * 1.4) + dampedProcessing * 0.75;
      accumulatedTime += dt * speedMult;

      const clickAge =
        clickTimestamp >= 0 ? Math.max(0, accumulatedTime - clickTimestamp) : 10.0;

      gl.useProgram(program);
      gl.uniform1f(uTimeLoc, accumulatedTime);
      gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
      gl.uniform2f(uMouseLoc, curMouseX, curMouseY);
      gl.uniform3f(uClickRippleLoc, clickX, clickY, clickAge);
      gl.uniform1f(uAudioEnergyLoc, dampedEnergy);
      gl.uniform1f(uRecordingLoc, dampedRecording);
      gl.uniform1f(uProcessingLoc, dampedProcessing);
      gl.uniform1f(uThemeMixLoc, dampedTheme);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = requestAnimationFrame(render);
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(rafId);
    };

    const handleContextRestored = () => {
      resize();
      lastFrameTime = performance.now();
      rafId = requestAnimationFrame(render);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  const isDark = themeMode === 'dark';

  return (
    <div
      className={`fixed inset-0 -z-10 pointer-events-none overflow-hidden transition-colors duration-500 ${
        isDark ? 'bg-[#050507]' : 'bg-[#f8fafc]'
      }`}
      aria-hidden="true"
      data-testid="shader-background"
      data-recording={isRecording ? 'true' : 'false'}
      data-processing={isProcessing ? 'true' : 'false'}
      data-theme={themeMode}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
    </div>
  );
};
