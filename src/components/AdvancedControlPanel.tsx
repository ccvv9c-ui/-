import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Check,
  Download,
  Cpu,
  Zap,
  HardDrive,
  Mic,
} from 'lucide-react';
import {
  AI_MODELS,
  resolveTranslationModel,
  type ASRModelId,
  type TranslationModelId,
  type ComputeDevice,
  type ThemeViewMode,
  type SpeechRecognitionMode,
} from '../utils/offlineEngine';
import { getUITranslations, type UILanguage } from '../utils/uiTranslations';
import { CustomDropdown } from './CustomDropdown';
import { SpotlightCard } from './SpotlightCard';

interface AdvancedControlPanelProps {
  selectedAsrModel: ASRModelId;
  selectedTranslationModel: TranslationModelId;
  speechRecognitionMode: SpeechRecognitionMode;
  sourceLang: string;
  targetLang: string;
  computeDevice: ComputeDevice;
  webGpuSupported: boolean;
  modelsReady: boolean;
  cachedModels: Record<string, boolean>;
  downloadingModelId: string | null;
  downloadProgress: number;
  downloadFile: string;
  performanceFormatted: string;
  memoryPercent: number;
  themeMode: ThemeViewMode;
  uiLang?: UILanguage;
  onSelectAsrModel: (id: ASRModelId) => void;
  onSelectTranslationModel: (id: TranslationModelId) => void;
  onSelectSpeechRecognitionMode: (mode: SpeechRecognitionMode) => void;
  onToggleComputeDevice: (device: ComputeDevice) => void;
  onPreloadOfflineBundle: () => void;
}

export const AdvancedControlPanel: React.FC<AdvancedControlPanelProps> = ({
  selectedAsrModel,
  selectedTranslationModel,
  speechRecognitionMode,
  sourceLang,
  targetLang,
  computeDevice,
  webGpuSupported,
  modelsReady,
  cachedModels,
  downloadingModelId,
  downloadProgress,
  performanceFormatted,
  memoryPercent,
  themeMode,
  uiLang = 'ar',
  onSelectAsrModel,
  onSelectTranslationModel,
  onSelectSpeechRecognitionMode,
  onToggleComputeDevice,
  onPreloadOfflineBundle,
}) => {
  const [modelsAccordionOpen, setModelsAccordionOpen] = useState(true);
  const [gpuAccordionOpen, setGpuAccordionOpen] = useState(true);

  const isDark = themeMode === 'dark';
  const t = getUITranslations(uiLang);

  const asrModels = AI_MODELS.filter((m) => m.category === 'asr');
  const translationModels = AI_MODELS.filter(
    (m) => m.category === 'translation'
  );

  const resolvedActiveTransId = resolveTranslationModel(
    selectedTranslationModel,
    sourceLang,
    targetLang
  );

  const currentAsrMeta =
    asrModels.find((m) => m.id === selectedAsrModel) || asrModels[0];
  const currentTransMeta =
    translationModels.find((m) => m.id === resolvedActiveTransId) ||
    translationModels[0];

  const totalBundleMB = currentAsrMeta.sizeMB + currentTransMeta.sizeMB;
  const isCurrentBundleCached =
    modelsReady ||
    (!!cachedModels[selectedAsrModel] && !!cachedModels[resolvedActiveTransId]);

  const speechEngineOptions = [
    {
      value: 'dual-native',
      label: t.dualAsrOptionLabel,
      sublabel: 'ar-IQ + Whisper Fallback',
      badgeText: 'Dual ASR',
      badgeVariant: 'emerald' as const,
      isCached: true,
    },
    {
      value: 'whisper-offline',
      label: t.whisperOfflineOptionLabel,
      sublabel: '16kHz VAD + Normalizer',
      badgeText: 'Local',
      badgeVariant: 'neutral' as const,
      isCached: modelsReady || !!cachedModels[selectedAsrModel],
    },
  ];

  const asrDropdownOptions = asrModels.map((m) => ({
    value: m.id,
    label: m.id,
    sublabel: m.quantization,
    badgeText: m.sizeLabel,
    badgeVariant: (m.id === 'Xenova/whisper-small' ? 'emerald' : 'neutral') as
      | 'emerald'
      | 'neutral',
    isCached: modelsReady || !!cachedModels[m.id],
    dir: 'ltr' as const,
  }));

  const translationDropdownOptions = translationModels.map((m) => ({
    value: m.id,
    label: m.shortLabel,
    sublabel: m.id.split('/')[1] || m.id,
    badgeText: m.sizeLabel,
    badgeVariant: 'emerald' as const,
    isCached: modelsReady || !!cachedModels[m.id],
  }));

  return (
    <SpotlightCard
      as="aside"
      aria-label={t.advancedSettingsTitle}
      themeMode={themeMode}
      className="w-full p-5"
    >
      <div className="space-y-4">
        {/* Panel Title */}
        <div className="flex items-center justify-between border-b pb-3 border-current/10">
          <h2 className="text-lg font-bold tracking-tight">
            {t.advancedSettingsTitle}
          </h2>
          <span className="text-xs font-mono opacity-65 tabular-nums">
            ONNX q4 / q8
          </span>
        </div>

        {/* 1. AI Models & Dual Speech Engine Selection Accordion */}
        <div
          className={`rounded-xl border transition-colors ${
            isDark
              ? 'bg-zinc-950/55 border-white/10'
              : 'bg-zinc-100/75 border-black/8'
          }`}
        >
          <button
            type="button"
            onClick={() => setModelsAccordionOpen(!modelsAccordionOpen)}
            aria-expanded={modelsAccordionOpen}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold cursor-pointer hover:opacity-85 transition-opacity"
          >
            <span>{t.modelsAccordionTitle}</span>
            {modelsAccordionOpen ? (
              <ChevronUp className="w-4 h-4 opacity-60 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
            )}
          </button>

          {modelsAccordionOpen && (
            <div className="px-2.5 pb-2.5 space-y-2">
              <div
                className={`rounded-xl p-3 space-y-3 border ${
                  isDark
                    ? 'bg-zinc-900/70 text-[#f3f2ee] border-white/10'
                    : 'bg-white/85 text-[#18191c] border-black/10'
                }`}
              >
                {/* Dual Speech Recognition Engine Custom Dropdown */}
                <div className="border-b border-current/10 pb-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold flex items-center gap-1">
                      <Mic className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{t.speechEngineLabel}</span>
                    </span>
                    <span className="font-mono text-emerald-500 font-semibold">
                      Dual ASR
                    </span>
                  </div>
                  <CustomDropdown
                    id="speech-engine-mode-select"
                    ariaLabel={t.speechEngineLabel}
                    value={speechRecognitionMode}
                    options={speechEngineOptions}
                    onChange={(val) =>
                      onSelectSpeechRecognitionMode(val as SpeechRecognitionMode)
                    }
                    themeMode={themeMode}
                    compact
                    iconType="mic"
                    dir={t.dir}
                  />
                  <p className="text-[11px] opacity-70 leading-relaxed">
                    {speechRecognitionMode === 'dual-native'
                      ? t.dualAsrDesc
                      : t.whisperOfflineDesc}
                  </p>
                </div>

                {/* Whisper ASR Model Custom Dropdown */}
                <div className="border-b border-current/10 pb-2.5">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold">{t.whisperModelLabel}</span>
                    <span className="font-mono opacity-70 tabular-nums" dir="ltr">
                      {currentAsrMeta.sizeLabel} · {currentAsrMeta.quantization}
                    </span>
                  </div>
                  <CustomDropdown
                    id="asr-model-select"
                    ariaLabel={t.whisperModelLabel}
                    value={selectedAsrModel}
                    options={asrDropdownOptions}
                    onChange={(val) => onSelectAsrModel(val as ASRModelId)}
                    themeMode={themeMode}
                    compact
                    iconType="cpu"
                    dir="ltr"
                  />
                </div>

                {/* Translation Model Custom Dropdown */}
                <div className="border-b border-current/10 pb-2.5">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold">
                      {t.translationModelLabel}
                    </span>
                    <span
                      className="font-mono text-emerald-500 flex items-center gap-1"
                      dir="ltr"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{currentTransMeta.sizeLabel}</span>
                    </span>
                  </div>
                  <CustomDropdown
                    id="translation-model-select"
                    ariaLabel={t.translationModelLabel}
                    value={selectedTranslationModel}
                    options={translationDropdownOptions}
                    onChange={(val) =>
                      onSelectTranslationModel(val as TranslationModelId)
                    }
                    themeMode={themeMode}
                    compact
                    iconType="cpu"
                    dir={t.dir}
                  />
                  <p className="text-[11px] opacity-70 mt-1.5 leading-normal">
                    {t.activeModelForPair}{' '}
                    <span className="font-mono font-semibold text-emerald-500">
                      {resolvedActiveTransId}
                    </span>
                  </p>
                </div>

                {/* Cached Status Row */}
                <div
                  className="flex items-center justify-between pt-0.5 text-xs font-mono"
                  dir="ltr"
                >
                  <span className="opacity-75 tabular-nums">
                    Total: {totalBundleMB}MB
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-500 font-medium">
                    <span>
                      {isCurrentBundleCached
                        ? 'Cached (Offline Ready)'
                        : 'Initializing...'}
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={!!downloadingModelId}
                onClick={onPreloadOfflineBundle}
                aria-label={
                  modelsReady && !downloadingModelId
                    ? `${t.preloadReadyBtn} ✓`
                    : t.preloadDownloadBtn(totalBundleMB)
                }
                className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer active:scale-[0.97] disabled:opacity-60 ${
                  modelsReady && !downloadingModelId
                    ? isDark
                      ? 'bg-emerald-950/45 hover:bg-emerald-950/65 border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
                      : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-500/40 text-emerald-800'
                    : isDark
                      ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-[#18191c] hover:bg-[#2a2c32] border-transparent text-white'
                }`}
              >
                {modelsReady && !downloadingModelId ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="whitespace-nowrap inline-flex items-center gap-1">
                      <span>{t.preloadReadyBtn}</span>
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5] shrink-0" />
                    </span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">
                      {downloadingModelId
                        ? t.preloadDownloadingBtn(downloadProgress)
                        : t.preloadDownloadBtn(totalBundleMB)}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 2. Hardware Acceleration Section */}
        <div
          className={`rounded-xl p-3.5 border transition-colors space-y-2.5 ${
            isDark
              ? 'bg-zinc-950/55 border-white/10'
              : 'bg-zinc-100/75 border-black/8'
          }`}
        >
          <button
            type="button"
            onClick={() => setGpuAccordionOpen(!gpuAccordionOpen)}
            aria-expanded={gpuAccordionOpen}
            className="w-full flex items-center justify-between cursor-pointer"
          >
            <div className={uiLang === 'en' ? 'text-left' : 'text-right'}>
              <div className="text-xs font-semibold">{t.gpuSectionTitle}</div>
              <div className="text-[11px] font-mono opacity-65" dir="ltr">
                (WebGPU vs WebAssembly)
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 opacity-60 shrink-0 transition-transform ${
                gpuAccordionOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {gpuAccordionOpen && (
            <div className="pt-1 space-y-2">
              <div
                className={`grid grid-cols-2 gap-1.5 p-1 rounded-lg ${
                  isDark ? 'bg-black/40' : 'bg-black/8'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onToggleComputeDevice('webgpu')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-mono transition-all cursor-pointer active:scale-95 ${
                    computeDevice === 'webgpu'
                      ? 'bg-[#141518] text-white shadow-xs border border-emerald-500/35'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>WebGPU</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleComputeDevice('wasm')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-mono transition-all cursor-pointer active:scale-95 ${
                    computeDevice === 'wasm'
                      ? 'bg-[#141518] text-white shadow-xs border border-emerald-500/35'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span>WASM</span>
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] opacity-70">
                <span className="font-mono">
                  {webGpuSupported ? 'GPU Ready (q4)' : 'WASM SIMD Fallback'}
                </span>
                <span>{t.autoWhenAvailable}</span>
              </div>
            </div>
          )}
        </div>

        {/* 3. Memory & Translation Speed Indicator */}
        <div
          className={`rounded-xl p-3.5 border transition-colors space-y-2.5 ${
            isDark
              ? 'bg-zinc-950/55 border-white/10'
              : 'bg-zinc-100/75 border-black/8'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span
              className="font-mono font-semibold tabular-nums"
              dir="ltr"
              data-testid="speed-metric"
            >
              {performanceFormatted}
            </span>
            <span className="opacity-70 flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5" />
              <span>{t.fractionsOfSec}</span>
            </span>
          </div>

          <div
            className={`w-full h-2 rounded-full overflow-hidden ${
              isDark ? 'bg-white/10' : 'bg-black/12'
            }`}
          >
            <div
              className="h-full bg-emerald-500 rounded-full transition-transform duration-300 origin-left"
              style={{
                transform: `scaleX(${Math.min(1, Math.max(0.15, memoryPercent / 100))})`,
              }}
            />
          </div>

          <div
            className={`text-xs font-medium leading-snug pt-0.5 ${
              uiLang === 'en' ? 'text-left' : 'text-right'
            }`}
          >
            {t.memorySpeedIndicatorLabel}
          </div>
        </div>
      </div>

      {/* Cached Status Summary Footnote */}
      <div className="mt-4 pt-3 border-t border-current/10 flex items-center justify-between text-[11px] opacity-75">
        <span className="font-mono">IndexedDB / Cache API</span>
        <span>Works 100% Offline</span>
      </div>
    </SpotlightCard>
  );
};
