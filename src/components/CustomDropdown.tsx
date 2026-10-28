import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, Search, Sparkles, Cpu, Globe } from 'lucide-react';
import type { ThemeViewMode } from '../utils/offlineEngine';

export interface CustomDropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  badgeText?: string;
  badgeVariant?: 'emerald' | 'indigo' | 'neutral';
  isCached?: boolean;
  dir?: 'rtl' | 'ltr';
}

interface CustomDropdownProps {
  id?: string;
  ariaLabel: string;
  value: string;
  options: CustomDropdownOption[];
  onChange: (value: string) => void;
  themeMode: ThemeViewMode;
  searchable?: boolean;
  searchPlaceholder?: string;
  noResultsText?: string;
  dir?: 'rtl' | 'ltr';
  compact?: boolean;
  iconType?: 'globe' | 'cpu' | 'mic';
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  id,
  ariaLabel,
  value,
  options,
  onChange,
  themeMode,
  searchable = false,
  searchPlaceholder = 'ابحث عن اللغة...',
  noResultsText = 'لا توجد نتائج مطابقة',
  dir = 'rtl',
  compact = false,
  iconType = 'globe',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const isDark = themeMode === 'dark';

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) || options[0],
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  }, [options, searchQuery]);

  // Close menu on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && searchable) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 40);
    }
  }, [isOpen, searchable]);

  const uniqueMenuId = id || ariaLabel.replace(/\s+/g, '-');

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 select-none"
      dir={dir}
    >
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group relative w-full flex items-center justify-between gap-2 rounded-xl border transition-all duration-300 cursor-pointer active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          compact ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-xs sm:text-sm'
        } ${
          isDark
            ? isOpen
              ? 'bg-zinc-900/95 text-white border-emerald-500/60 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
              : 'bg-zinc-950/75 hover:bg-zinc-900/90 text-white border-white/12 hover:border-emerald-500/40 shadow-inner'
            : isOpen
              ? 'bg-white text-zinc-900 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.14)]'
              : 'bg-white/85 hover:bg-white text-zinc-900 border-black/10 hover:border-emerald-500/40 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {iconType === 'globe' ? (
            <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0 opacity-85 group-hover:scale-110 transition-transform" />
          ) : iconType === 'cpu' ? (
            <Cpu className="w-3.5 h-3.5 text-emerald-500 shrink-0 opacity-85 group-hover:scale-110 transition-transform" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0 opacity-85 group-hover:scale-110 transition-transform" />
          )}

          <span className="font-semibold truncate">{selectedOption?.label}</span>

          {selectedOption?.badgeText && (
            <span
              dir="ltr"
              className={`hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium shrink-0 ${
                isDark
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-500/25'
              }`}
            >
              {selectedOption.badgeText}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 shrink-0 opacity-65 transition-transform duration-300 ${
            isOpen ? 'rotate-180 text-emerald-500 opacity-100' : ''
          }`}
        />
      </button>

      {/* Floating Glass Dropdown Menu with Spring Physics */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="listbox"
            aria-label={ariaLabel}
            initial={{ opacity: 0, scale: 0.94, y: -8, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, y: -6, filter: 'blur(4px)' }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 28,
              mass: 0.7,
            }}
            className={`absolute z-[100] mt-2 w-full min-w-[285px] sm:min-w-[310px] rounded-2xl border p-2.5 shadow-2xl backdrop-blur-2xl ${
              dir === 'ltr' ? 'left-0' : 'right-0'
            } ${
              isDark
                ? 'bg-[#0e1015]/98 border-emerald-500/30 text-zinc-100 shadow-[0_28px_70px_rgba(0,0,0,0.92),0_0_30px_rgba(16,185,129,0.16)]'
                : 'bg-white/98 border-black/12 text-zinc-900 shadow-[0_24px_60px_rgba(15,23,42,0.22),0_0_24px_rgba(16,185,129,0.10)]'
            }`}
          >
            {/* Optional Instant Search Bar */}
            {searchable && (
              <div className="relative mb-2">
                <Search
                  className={`w-3.5 h-3.5 text-emerald-500 absolute top-1/2 -translate-y-1/2 ${
                    dir === 'ltr' ? 'left-3' : 'right-3'
                  } pointer-events-none opacity-80`}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className={`w-full rounded-xl ${
                    dir === 'ltr' ? 'pl-8 pr-3' : 'pr-8 pl-3'
                  } py-1.5 text-xs border focus:outline-none focus:border-emerald-500 transition-colors ${
                    isDark
                      ? 'bg-zinc-950/80 border-white/10 text-white placeholder:text-zinc-500'
                      : 'bg-zinc-100/90 border-black/10 text-zinc-900 placeholder:text-zinc-400'
                  }`}
                />
              </div>
            )}

            {/* Options List */}
            <div className="max-h-[240px] overflow-y-auto space-y-1 pr-0.5">
              {filteredOptions.length === 0 ? (
                <div className="py-4 text-center text-xs opacity-60">
                  {noResultsText}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  const isHovered = hoveredValue === opt.value;

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHoveredValue(opt.value)}
                      onMouseLeave={() => setHoveredValue(null)}
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      className={`relative w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                        dir === 'ltr' ? 'text-left' : 'text-right'
                      } ${
                        isSelected
                          ? isDark
                            ? 'text-emerald-300 font-bold'
                            : 'text-emerald-800 font-bold'
                          : isDark
                            ? 'text-zinc-200 hover:text-white'
                            : 'text-zinc-700 hover:text-zinc-950'
                      }`}
                    >
                      {/* Smooth Sliding Background Highlight */}
                      {(isHovered || isSelected) && (
                        <motion.div
                          layoutId={`dropdown-highlight-${uniqueMenuId}`}
                          transition={{
                            type: 'spring',
                            stiffness: 480,
                            damping: 34,
                          }}
                          className={`absolute inset-0 rounded-xl -z-10 ${
                            isSelected
                              ? isDark
                                ? 'bg-emerald-500/18 border border-emerald-500/35'
                                : 'bg-emerald-500/12 border border-emerald-500/30'
                              : isDark
                                ? 'bg-white/8'
                                : 'bg-black/5'
                          }`}
                        />
                      )}

                      <div
                        className={`flex flex-col min-w-0 flex-1 ${
                          dir === 'ltr' ? 'text-left' : 'text-right'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{opt.label}</span>
                          {opt.sublabel && (
                            <span
                              dir="ltr"
                              className="text-[10px] font-mono opacity-60 shrink-0"
                            >
                              {opt.sublabel}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        dir="ltr"
                      >
                        {opt.isCached && (
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium ${
                              isDark
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-500/25'
                            }`}
                          >
                            Cached ✓
                          </span>
                        )}
                        {opt.badgeText && (
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                              opt.badgeVariant === 'emerald'
                                ? isDark
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-emerald-100 text-emerald-800'
                                : isDark
                                  ? 'bg-white/10 text-zinc-300'
                                  : 'bg-zinc-200/80 text-zinc-700'
                            }`}
                          >
                            {opt.badgeText}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
