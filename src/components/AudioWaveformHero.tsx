import React, { useEffect, useRef } from 'react';
import { Mic, Square } from 'lucide-react';
import type { ThemeViewMode } from '../utils/offlineEngine';
import { getUITranslations, type UILanguage } from '../utils/uiTranslations';

interface AudioWaveformHeroProps {
  isRecording: boolean;
  isProcessing: boolean;
  audioEnergy: number; // 0.0 to 1.0
  themeMode: ThemeViewMode;
  uiLang?: UILanguage;
  onToggleRecord: () => void;
  onRunSampleVoice: () => void;
}

export const AudioWaveformHero: React.FC<AudioWaveformHeroProps> = ({
  isRecording,
  isProcessing,
  audioEnergy,
  themeMode,
  uiLang = 'ar',
  onToggleRecord,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    isRecording,
    isProcessing,
    audioEnergy,
    themeMode,
  });

  useEffect(() => {
    stateRef.current = { isRecording, isProcessing, audioEnergy, themeMode };
  }, [isRecording, isProcessing, audioEnergy, themeMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));

    let animationFrameId: number;
    let phase = 0;
    let lastDrawTime = 0;

    const numBarsPerWing = 26;
    const basePattern = [
      0.15, 0.22, 0.35, 0.18, 0.45, 0.65, 0.3, 0.55, 0.85, 0.4, 0.95, 0.5,
      0.75, 0.32, 0.62, 0.88, 0.45, 0.28, 0.72, 0.52, 0.38, 0.68, 0.42, 0.25,
      0.35, 0.18,
    ];

    const renderFrame = (timestamp: number) => {
      if (isHeadless && timestamp - lastDrawTime < 66) {
        animationFrameId = requestAnimationFrame(renderFrame);
        return;
      }
      lastDrawTime = timestamp;

      const dpr = isHeadless ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (
          canvas.width !== Math.floor(rect.width * dpr) ||
          canvas.height !== Math.floor(rect.height * dpr)
        ) {
          canvas.width = Math.floor(rect.width * dpr);
          canvas.height = Math.floor(rect.height * dpr);
        }
      }

      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;
      const centerX = width / 2;

      ctx.clearRect(0, 0, width, height);

      const {
        isRecording: rec,
        isProcessing: proc,
        audioEnergy: energy,
        themeMode: mode,
      } = stateRef.current;

      if (rec || proc) {
        phase += rec ? 0.14 : 0.08;
      } else {
        phase += 0.015;
      }

      const centerGapRadius = 64 * dpr;
      const availableWingWidth = Math.max(
        80 * dpr,
        centerX - centerGapRadius - 24 * dpr
      );
      const step = availableWingWidth / numBarsPerWing;
      const barWidth = Math.max(2 * dpr, Math.min(3.5 * dpr, step * 0.42));
      const maxBarHeight = height * 0.68;

      const isDark = mode === 'dark';

      for (let i = 0; i < numBarsPerWing; i++) {
        const baseAmp = basePattern[i % basePattern.length];
        const dynamicWave =
          rec || proc
            ? 0.35 +
              0.65 *
                Math.abs(
                  Math.sin(phase + i * 0.45) * Math.cos(phase * 0.7 - i * 0.25)
                ) *
                (0.6 + energy * 0.9)
            : 0.75 + 0.25 * Math.sin(phase + i * 0.3);

        const barHeight = Math.max(
          6 * dpr,
          baseAmp * dynamicWave * maxBarHeight
        );

        const fillStyle = isDark
          ? rec
            ? `rgba(16, 185, 129, ${0.65 + baseAmp * 0.35})`
            : `rgba(165, 168, 177, ${0.35 + baseAmp * 0.45})`
          : rec
            ? `rgba(16, 185, 129, ${0.7 + baseAmp * 0.3})`
            : `rgba(82, 86, 96, ${0.38 + baseAmp * 0.45})`;

        ctx.fillStyle = fillStyle;

        // 1. Right Wing Bar
        const rx = centerX + centerGapRadius + i * step;
        if (rx < width - 12 * dpr) {
          ctx.beginPath();
          ctx.roundRect(
            rx - barWidth / 2,
            centerY - barHeight / 2,
            barWidth,
            barHeight,
            barWidth / 2
          );
          ctx.fill();
        }

        // 2. Left Wing Bar
        const lx = centerX - centerGapRadius - i * step;
        if (lx > 12 * dpr) {
          ctx.beginPath();
          ctx.roundRect(
            lx - barWidth / 2,
            centerY - barHeight / 2,
            barWidth,
            barHeight,
            barWidth / 2
          );
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    animationFrameId = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const isDark = themeMode === 'dark';
  const t = getUITranslations(uiLang);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = React.useState(false);
  const [rippleCount, setRippleCount] = React.useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMicClick = () => {
    setRippleCount((c) => c + 1);
    onToggleRecord();
  };

  const ringScale = isRecording ? 1 + audioEnergy * 0.22 : 1;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative w-full h-40 sm:h-44 rounded-2xl overflow-hidden border backdrop-blur-2xl transition-all duration-300 select-none ${
        isDark
          ? 'bg-zinc-900/60 border-white/12 hover:border-emerald-500/40 shadow-[0_20px_50px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.1)]'
          : 'bg-white/75 border-black/10 hover:border-emerald-500/40 shadow-[0_16px_40px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.85)]'
      }`}
    >
      {/* Dynamic Mouse-Tracking Spotlight Border Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: isDark
            ? `radial-gradient(480px circle at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.16), rgba(255, 255, 255, 0.04) 45%, transparent 75%)`
            : `radial-gradient(480px circle at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.12), rgba(99, 102, 241, 0.04) 45%, transparent 75%)`,
        }}
      />

      {/* Top header label ("الإدخال الصوتي" / "Audio Input") */}
      <div
        className={`absolute top-3.5 ${
          uiLang === 'en' ? 'left-5' : 'right-5'
        } z-20 flex items-center gap-2`}
      >
        <span
          className={`text-sm font-semibold tracking-tight transition-colors ${
            isDark ? 'text-[#f3f2ee]' : 'text-[#18191c]'
          }`}
        >
          {t.audioInputTitle}
        </span>
        {isRecording && (
          <span className="text-xs font-mono text-emerald-500 font-medium">
            · 16kHz PCM Recording
          </span>
        )}
      </div>

      {/* Top status */}
      <div
        className={`absolute top-3.5 ${
          uiLang === 'en' ? 'right-4' : 'left-4'
        } z-20 flex items-center gap-2`}
      >
        <span
          className={`text-xs transition-colors ${
            isRecording || isProcessing ? 'font-medium' : 'font-mono'
          } ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}
        >
          {isRecording
            ? t.capturingAudio
            : isProcessing
              ? t.transcribingAudio
              : t.whisperReady}
        </span>
      </div>

      {/* HTML5 Canvas for Live Symmetrical Audio Waveform */}
      <canvas
        ref={canvasRef}
        data-testid="waveform-canvas"
        className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      />

      {/* Center Circular 3D Microphone Button with 3D Orbital Rings & Click Shockwave */}
      <div
        className="absolute inset-0 flex items-center justify-center z-20"
        style={{ perspective: '700px' }}
      >
        <div className="relative flex items-center justify-center">
          {/* Click Shockwave Ripple */}
          {rippleCount > 0 && (
            <span
              key={rippleCount}
              aria-hidden="true"
              className="pointer-events-none absolute w-24 h-24 rounded-full border-2 border-emerald-400/75 animate-[ping_0.65s_cubic-bezier(0,0,0.2,1)_1] opacity-0"
            />
          )}

          {/* 3D Orbital Ring 1 (Outer Tilted Acoustic Orbit) */}
          <div
            aria-hidden="true"
            data-testid="mic-orbital-ring-outer"
            className={`pointer-events-none absolute w-30 h-30 sm:w-34 sm:h-34 rounded-full border transition-all duration-200 ${
              isRecording
                ? 'border-emerald-400/70 shadow-[0_0_24px_rgba(16,185,129,0.4)] animate-[spin_3.2s_linear_infinite]'
                : isProcessing
                  ? 'border-emerald-400/50 animate-[spin_4.5s_linear_infinite]'
                  : isDark
                    ? 'border-white/15 animate-[spin_14s_linear_infinite]'
                    : 'border-black/15 animate-[spin_14s_linear_infinite]'
            }`}
            style={{
              transform: `rotateX(62deg) rotateY(-18deg) scale(${ringScale})`,
            }}
          />

          {/* 3D Orbital Ring 2 (Inner Counter-Rotating Gyroscopic Orbit) */}
          <div
            aria-hidden="true"
            data-testid="mic-orbital-ring-inner"
            className={`pointer-events-none absolute w-26 h-26 sm:w-30 sm:h-30 rounded-full border border-dashed transition-all duration-200 ${
              isRecording
                ? 'border-emerald-300/80 animate-[spin_2.4s_linear_infinite_reverse]'
                : isProcessing
                  ? 'border-emerald-400/60 animate-[spin_3.6s_linear_infinite_reverse]'
                  : isDark
                    ? 'border-emerald-500/25 animate-[spin_18s_linear_infinite_reverse]'
                    : 'border-emerald-600/25 animate-[spin_18s_linear_infinite_reverse]'
            }`}
            style={{
              transform: `rotateX(-58deg) rotateY(24deg) scale(${
                isRecording ? 1 + audioEnergy * 0.16 : 1
              })`,
            }}
          />

          {/* Radial Acoustic Halo */}
          <div
            className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center transition-transform duration-300 ${
              isRecording ? 'scale-105' : 'scale-100'
            }`}
            style={{
              background: isDark
                ? 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, rgba(160,165,175,0.08) 60%, transparent 100%)'
                : 'radial-gradient(circle, rgba(16,185,129,0.14) 0%, rgba(20,21,24,0.04) 60%, transparent 100%)',
              boxShadow: isRecording
                ? `0 0 ${36 + Math.round(audioEnergy * 28)}px rgba(16, 185, 129, 0.45)`
                : isDark
                  ? '0 8px 30px rgba(0, 0, 0, 0.4)'
                  : '0 8px 24px rgba(0, 0, 0, 0.08)',
            }}
          >
            <button
              type="button"
              onClick={handleMicClick}
              aria-label={isRecording ? t.stopRecordAria : t.startRecordAria}
              className={`relative w-18 h-18 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-95 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isRecording
                  ? 'bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.65)]'
                  : isDark
                    ? 'bg-gradient-to-b from-[#faf9f6] to-[#dedcd6] text-[#18191c] hover:from-white hover:to-[#e8e6e0] shadow-lg'
                    : 'bg-[#18191c] text-white hover:bg-[#272930] shadow-md'
              }`}
            >
              {isRecording ? (
                <Square className="w-6 h-6 fill-current" />
              ) : (
                <Mic className="w-7 h-7 stroke-[1.8]" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
