import React, { useRef, useState } from 'react';
import type { ThemeViewMode } from '../utils/offlineEngine';

interface SpotlightCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'section' | 'aside' | 'div' | 'nav';
  themeMode: ThemeViewMode;
  flashTrigger?: number;
  className?: string;
  children: React.ReactNode;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  as: Component = 'section',
  themeMode,
  flashTrigger = 0,
  className = '',
  children,
  ...rest
}) => {
  const cardRef = useRef<HTMLElement | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const isDark = themeMode === 'dark';

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <Component
      ref={cardRef as any}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-spotlight-card="true"
      className={`group/card relative rounded-2xl border backdrop-blur-2xl transition-all duration-300 ${
        isDark
          ? 'bg-zinc-900/45 text-[#f3f2ee] border-white/14 hover:border-emerald-500/45 shadow-[0_20px_50px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]'
          : 'bg-white/62 text-[#18191c] border-black/10 hover:border-emerald-500/45 shadow-[0_16px_40px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,0.85)]'
      } ${className}`}
      {...rest}
    >
      {/* Dynamic Mouse-Tracking Spotlight Border & Ambient Surface Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300 overflow-hidden"
        style={{
          opacity: isHovered ? 1 : 0,
          background: isDark
            ? `radial-gradient(460px circle at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.16), rgba(255, 255, 255, 0.05) 42%, transparent 75%)`
            : `radial-gradient(460px circle at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.13), rgba(99, 102, 241, 0.05) 42%, transparent 75%)`,
        }}
      />

      {/* Perimeter Edge Spotlight Highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          boxShadow: isDark
            ? 'inset 0 0 22px rgba(16, 185, 129, 0.14)'
            : 'inset 0 0 18px rgba(16, 185, 129, 0.10)',
        }}
      />

      {/* Subtle Flash Shimmer when a new translation arrives */}
      {flashTrigger > 0 && (
        <div
          key={flashTrigger}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl animate-[ping_0.75s_cubic-bezier(0,0,0.2,1)_1] opacity-0 border border-emerald-400/55 bg-emerald-500/8"
        />
      )}

      <div className="relative z-10 flex flex-col justify-between h-full w-full">
        {children}
      </div>
    </Component>
  );
};
