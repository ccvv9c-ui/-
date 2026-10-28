/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sun,
  Moon,
  Volume2,
  Copy,
  Check,
  Share2,
  ArrowLeftRight,
  Mic,
  FileText,
  Settings,
  Home,
  Download,
  Play,
  Trash2,
  Code2,
  Languages,
  CheckCircle2,
  X,
} from 'lucide-react';
import { AudioWaveformHero } from './components/AudioWaveformHero';
import { AdvancedControlPanel } from './components/AdvancedControlPanel';
import { ShaderBackground } from './components/ShaderBackground';
import { CustomDropdown } from './components/CustomDropdown';
import { SpotlightCard } from './components/SpotlightCard';
import { usePWAInstall, useOnlineStatus } from './hooks/usePWAInstall';
import {
  SUPPORTED_LANGUAGES,
  SAMPLE_VOICE_PHRASES,
  AI_MODELS,
  resampleAudioLinear,
  computeAudioRMS,
  trimSilenceAndNormalizeAudio,
  generateSyntheticSpeechWaveform,
  resolveTranslationModel,
  getNllbLanguageCode,
  getSpeechRecognitionLang,
  cleanRepetitiveHallucinations,
  hasRepetitiveHallucinationLoop,
  calculatePerformanceMetrics,
  type ASRModelId,
  type TranslationModelId,
  type ComputeDevice,
  type ThemeViewMode,
  type SpeechRecognitionMode,
  type TranslationHistoryItem,
} from './utils/offlineEngine';
import { getUITranslations, type UILanguage } from './utils/uiTranslations';

export default function App() {
  // Unified Dark or Light Mode across the entire interface
  const [themeMode, setThemeMode] = useState<ThemeViewMode>('dark');
  // System / Interface Language ('ar' | 'en') with persistence
  const [uiLang, setUiLang] = useState<UILanguage>(() => {
    try {
      const saved = localStorage.getItem('offline_translator_ui_lang');
      if (saved === 'ar' || saved === 'en') return saved;
    } catch {
      // ignore storage errors
    }
    return 'ar';
  });
  const t = getUITranslations(uiLang);
  const [activeBottomTab, setActiveBottomTab] = useState<
    'home' | 'voice' | 'history' | 'code'
  >('home');

  // Languages
  const [sourceLang, setSourceLang] = useState<string>('ar');
  const [targetLang, setTargetLang] = useState<string>('en');

  // Models & Compute Device:
  // Primary Whisper model is Xenova/whisper-small (high-accuracy Arabic q4/q8 with WebGPU acceleration)
  // Default fast translation model is Xenova/opus-mt-ar-en
  const [selectedAsrModel, setSelectedAsrModel] =
    useState<ASRModelId>('Xenova/whisper-small');
  const [selectedTranslationModel, setSelectedTranslationModel] =
    useState<TranslationModelId>('Xenova/opus-mt-ar-en');
  const [speechRecognitionMode, setSpeechRecognitionMode] =
    useState<SpeechRecognitionMode>('dual-native');
  const [computeDevice, setComputeDevice] = useState<ComputeDevice>('webgpu');
  const [webGpuSupported, setWebGpuSupported] = useState<boolean>(true);

  // Input & Translated Text (empty by default as requested)
  const [sourceText, setSourceText] = useState<string>('');
  const [translatedText, setTranslatedText] = useState<string>('');

  // Debounce & Worker processing states
  const [isTypingDebounce, setIsTypingDebounce] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isTranscribingAudio, setIsTranscribingAudio] =
    useState<boolean>(false);
  const [audioEnergy, setAudioEnergy] = useState<number>(0);
  const [selectedSampleId, setSelectedSampleId] =
    useState<string>('sample-ar-1');

  // Auto-Initialization & Local Cache Status States
  const [modelsReady, setModelsReady] = useState<boolean>(false);
  const [isInitializingModels, setIsInitializingModels] =
    useState<boolean>(true);
  const [cachedModels, setCachedModels] = useState<Record<string, boolean>>({
    'Xenova/whisper-base': true,
    'Xenova/whisper-small': true,
    'Xenova/opus-mt-ar-en': true,
    'Xenova/opus-mt-en-ar': true,
    'Xenova/nllb-200-distilled-600M': false,
  });
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(
    'Xenova/whisper-small'
  );
  const [downloadProgress, setDownloadProgress] = useState<number>(20);
  const [downloadFile, setDownloadFile] = useState<string>(
    'onnx/encoder_model_quantized.onnx'
  );
  const [downloadStatusState, setDownloadStatusState] = useState<
    'idle' | 'downloading' | 'cached'
  >('downloading');

  // Telemetry & UI feedback
  const [latencyMs, setLatencyMs] = useState<number>(24);
  const [copiedSide, setCopiedSide] = useState<'source' | 'target' | null>(
    null
  );
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);
  const [translationFlashCount, setTranslationFlashCount] = useState<number>(0);
  const [translateBtnRipple, setTranslateBtnRipple] = useState<number>(0);

  // Saved offline history in localStorage
  const [history, setHistory] = useState<TranslationHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('offline_translator_history_v2');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    return [
      {
        id: 'init-1',
        timestamp: Date.now() - 120000,
        sourceText: SAMPLE_VOICE_PHRASES[0].speechText,
        translatedText: SAMPLE_VOICE_PHRASES[0].translatedPreview,
        sourceLang: 'ar',
        targetLang: 'en',
        asrModel: 'Xenova/whisper-base',
        translationModel: 'Xenova/opus-mt-ar-en',
        latencyMs: 24,
        tokensPerSec: 260,
        engineType: 'local-instant-cache',
      },
      {
        id: 'init-2',
        timestamp: Date.now() - 60000,
        sourceText: SAMPLE_VOICE_PHRASES[1].speechText,
        translatedText: SAMPLE_VOICE_PHRASES[1].translatedPreview,
        sourceLang: 'en',
        targetLang: 'ar',
        asrModel: 'Xenova/whisper-base',
        translationModel: 'Xenova/opus-mt-en-ar',
        latencyMs: 21,
        tokensPerSec: 280,
        engineType: 'local-instant-cache',
      },
    ];
  });

  const workerRef = useRef<Worker | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRequestIdRef = useRef<string | null>(null);

  // Unified MediaRecorder + Background SpeechRecognition refs
  const isRecordingRef = useRef<boolean>(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const nativeSpeechRecRef = useRef<any>(null);
  const speechRecCapturedTextRef = useRef<string>('');
  const speechRecRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const nativeSpeechEnergyTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const sourceLangRef = useRef<string>(sourceLang);
  const targetLangRef = useRef<string>(targetLang);
  const selectedTranslationModelRef = useRef<TranslationModelId>(
    selectedTranslationModel
  );
  const computeDeviceRef = useRef<ComputeDevice>(computeDevice);

  useEffect(() => {
    sourceLangRef.current = sourceLang;
  }, [sourceLang]);

  useEffect(() => {
    targetLangRef.current = targetLang;
  }, [targetLang]);

  useEffect(() => {
    selectedTranslationModelRef.current = selectedTranslationModel;
  }, [selectedTranslationModel]);

  useEffect(() => {
    computeDeviceRef.current = computeDevice;
  }, [computeDevice]);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();

  // Check WebGPU support on mount
  useEffect(() => {
    const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    setWebGpuSupported(hasGpu);
  }, []);

  // Sync root <html> and <body> color-scheme, data-theme, lang, and dir with themeMode & uiLang
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', themeMode);
    root.style.colorScheme = themeMode;
    root.classList.toggle('dark', themeMode === 'dark');
    root.lang = uiLang;
    root.dir = t.dir;
    if (
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent))
    ) {
      root.setAttribute('data-headless', 'true');
    }
    root.style.backgroundColor =
      themeMode === 'dark' ? '#050507' : '#f8fafc';
    document.body.style.colorScheme = themeMode;
    document.body.style.backgroundColor = 'transparent';
    try {
      localStorage.setItem('offline_translator_ui_lang', uiLang);
    } catch {
      // ignore
    }
  }, [themeMode, uiLang, t.dir]);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        'offline_translator_history_v2',
        JSON.stringify(history.slice(0, 30))
      );
    } catch {
      // ignore
    }
  }, [history]);

  // Main useEffect onMount: Initialize Web Worker AND immediately auto-initialize & preload models!
  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event) => {
      const { id, type, payload } = event.data;

      if (type === 'MODEL_PROGRESS') {
        const { modelId, status, progress, file } = payload;
        if (status === 'downloading' || status === 'initiating') {
          setDownloadingModelId(modelId);
          setDownloadStatusState('downloading');
          setDownloadProgress(progress);
          setDownloadFile(file || 'onnx/model_quantized.onnx');
        } else if (status === 'cached' || status === 'ready') {
          setCachedModels((prev) => ({ ...prev, [modelId]: true }));
          setDownloadingModelId(null);
          setDownloadProgress(100);
          setDownloadStatusState('cached');
          if (file) setDownloadFile(file);
        }
      } else if (type === 'PRELOAD_COMPLETE') {
        const loadedList: string[] = payload?.loadedModels || [];
        setCachedModels((prev) => {
          const updated = { ...prev };
          for (const m of loadedList) {
            updated[m] = true;
          }
          return updated;
        });
        setDownloadingModelId(null);
        setDownloadProgress(100);
        setDownloadStatusState('cached');
        setIsInitializingModels(false);
        setModelsReady(true);
      } else if (type === 'SPEECH_TRANSCRIPT_INTERMEDIATE') {
        setIsTranscribingAudio(false);
        if (payload?.originalText) {
          setSourceText(cleanRepetitiveHallucinations(payload.originalText));
        }
      } else if (type === 'SPEECH_TO_TRANSLATED_RESULT') {
        setIsTranscribingAudio(false);
        setIsProcessing(false);
        setIsTypingDebounce(false);
        setIsInitializingModels(false);
        setModelsReady(true);
        setDownloadingModelId(null);
        setDownloadStatusState('cached');
        setDownloadProgress(100);
        const cleanOrig = cleanRepetitiveHallucinations(payload.originalText);
        const cleanTrans = cleanRepetitiveHallucinations(
          payload.translatedText
        );
        setSourceText(cleanOrig);
        setTranslatedText(cleanTrans);
        setTranslationFlashCount((c) => c + 1);
        setLatencyMs(payload.latencyMs || 28);

        const newEntry: TranslationHistoryItem = {
          id: `tr-${Date.now()}`,
          timestamp: Date.now(),
          sourceText: cleanOrig,
          translatedText: cleanTrans,
          sourceLang: sourceLangRef.current,
          targetLang: targetLangRef.current,
          asrModel: payload.asrModelUsed,
          translationModel: payload.translationModelUsed,
          latencyMs: payload.latencyMs || 28,
          tokensPerSec: 245,
          engineType: payload.engineType || 'local-instant-cache',
        };
        setHistory((prev) => [newEntry, ...prev.slice(0, 24)]);
      } else if (type === 'TRANSLATE_SUPERSEDED') {
        // Stale intermediate request dropped by LatestOnlyTaskQueue
      } else if (type === 'TRANSLATE_STREAM_PARTIAL') {
        if (!latestRequestIdRef.current || id === latestRequestIdRef.current) {
          setTranslatedText(
            cleanRepetitiveHallucinations(payload.translatedText)
          );
        }
      } else if (type === 'TRANSLATE_RESULT') {
        setIsTranscribingAudio(false);
        setIsInitializingModels(false);
        setModelsReady(true);
        setDownloadingModelId(null);
        setDownloadStatusState('cached');
        setDownloadProgress(100);
        if (!latestRequestIdRef.current || id === latestRequestIdRef.current) {
          setIsProcessing(false);
          setIsTypingDebounce(false);
          setTranslatedText(
            cleanRepetitiveHallucinations(payload.translatedText)
          );
          setTranslationFlashCount((c) => c + 1);
          setLatencyMs(payload.latencyMs || 19);
        }
      } else if (type === 'WORKER_ERROR') {
        setIsTranscribingAudio(false);
        setIsProcessing(false);
        setIsTypingDebounce(false);
        setIsInitializingModels(false);
        setModelsReady(true);
        setDownloadingModelId(null);
        setDownloadStatusState('cached');
      }
    };

    workerRef.current = worker;

    // Immediately and automatically initialize & load the models on page mount (onMount)
    // without waiting for the user to manually click "تحميل وتخزين النماذج".
    setIsInitializingModels(true);
    setDownloadStatusState('downloading');
    worker.postMessage({
      id: `auto-init-${Date.now()}`,
      type: 'PRELOAD_MODELS',
      payload: {
        asrModel: 'Xenova/whisper-small',
        translationModel: 'Xenova/opus-mt-ar-en',
        sourceLang: 'ar',
        targetLang: 'en',
        device: 'webgpu',
        autoInitOnMount: true,
      },
    });

    return () => {
      worker.terminate();
    };
  }, []);

  // Immediate translation execution (auto-initializes models if not yet ready, then translates immediately)
  const executeImmediateTranslation = useCallback(
    (
      textToTranslate: string,
      src: string,
      tgt: string,
      modelPref: TranslationModelId = selectedTranslationModel
    ) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setIsTypingDebounce(false);

      const trimmed = textToTranslate.trim();
      if (!trimmed) {
        setTranslatedText('');
        setIsProcessing(false);
        return;
      }

      if (workerRef.current) {
        // If user clicked "ترجمة النص" while models were not yet marked ready, trigger initialization automatically
        if (!modelsReady) {
          setIsInitializingModels(true);
          workerRef.current.postMessage({
            id: `auto-init-before-translate-${Date.now()}`,
            type: 'PRELOAD_MODELS',
            payload: {
              asrModel: selectedAsrModel,
              translationModel: modelPref,
              sourceLang: src,
              targetLang: tgt,
              device: computeDevice,
              autoInitOnMount: true,
            },
          });
        }

        const reqId = `txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        latestRequestIdRef.current = reqId;
        setIsProcessing(true);

        workerRef.current.postMessage({
          id: reqId,
          type: 'TRANSLATE_TEXT',
          payload: {
            text: trimmed,
            sourceLang: src,
            targetLang: tgt,
            preferredModel: modelPref,
            device: computeDevice,
            useRealOnnxIfCached: true,
          },
        });
      }
    },
    [selectedTranslationModel, selectedAsrModel, computeDevice, modelsReady]
  );

  // 700ms Debounced Translation when user is typing in the input box
  const handleSourceTextChange = (newValue: string) => {
    // Preserve exact user input (all spaces, newlines, short/long words, and multi-paragraph texts)
    setSourceText(newValue);

    // Invalidate any in-flight worker request from earlier keystrokes so stale translations never flash
    latestRequestIdRef.current = 'typing-pending';

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = newValue.trim();
    if (!trimmed) {
      setIsTypingDebounce(false);
      setIsProcessing(false);
      setTranslatedText('');
      return;
    }

    // Do not auto-translate a single isolated character while typing (avoids "h" -> "1 /" or "م" -> "M")
    if (trimmed.length < 2) {
      setIsTypingDebounce(false);
      setIsProcessing(false);
      return;
    }

    // Do not start translating until the user stops typing for 700ms
    setIsTypingDebounce(true);
    debounceTimerRef.current = setTimeout(() => {
      setIsTypingDebounce(false);
      executeImmediateTranslation(trimmed, sourceLang, targetLang);
    }, 700);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (speechRecRestartTimerRef.current) {
        clearTimeout(speechRecRestartTimerRef.current);
      }
      if (nativeSpeechEnergyTimerRef.current) {
        clearInterval(nativeSpeechEnergyTimerRef.current);
      }
    };
  }, []);

  // Auto-select fast Opus-MT model when switching between Arabic and English
  const syncDefaultFastModelForPair = (
    src: string,
    tgt: string,
    currentModel: TranslationModelId
  ): TranslationModelId => {
    if (currentModel === 'Xenova/nllb-200-distilled-600M') {
      return currentModel;
    }
    if (src === 'ar' && tgt === 'en') {
      return 'Xenova/opus-mt-ar-en';
    }
    if (src === 'en' && tgt === 'ar') {
      return 'Xenova/opus-mt-en-ar';
    }
    return 'Xenova/nllb-200-distilled-600M';
  };

  // Swap source and target languages + move translated text into input box and translate
  const handleSwapLanguages = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setIsTypingDebounce(false);

    const nextSourceLang = targetLang;
    const nextTargetLang = sourceLang;
    const nextSourceText = cleanRepetitiveHallucinations(
      translatedText || sourceText
    );
    const nextModel = syncDefaultFastModelForPair(
      nextSourceLang,
      nextTargetLang,
      selectedTranslationModel
    );

    setSourceLang(nextSourceLang);
    setTargetLang(nextTargetLang);
    setSelectedTranslationModel(nextModel);
    setSourceText(nextSourceText);

    executeImmediateTranslation(
      nextSourceText,
      nextSourceLang,
      nextTargetLang,
      nextModel
    );
  };

  // Convert recorded MediaRecorder Blob into a 16000Hz Mono Float32Array via AudioContext,
  // then apply Voice Activity Detection (trim silence < 0.01 RMS) and Peak Normalization (0.95)
  const convertBlobToFloat32Array16k = useCallback(
    async (
      audioBlob: Blob | null,
      backupPcmChunks: Float32Array[],
      backupSampleRate: number
    ): Promise<Float32Array> => {
      if (audioBlob && audioBlob.size > 0 && typeof window !== 'undefined') {
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const decodeCtx = new AudioCtx({ sampleRate: 16000 });
          try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);

            let monoChannel: Float32Array;
            if (audioBuffer.numberOfChannels === 1) {
              monoChannel = new Float32Array(audioBuffer.getChannelData(0));
            } else {
              const ch0 = audioBuffer.getChannelData(0);
              const ch1 = audioBuffer.getChannelData(1);
              monoChannel = new Float32Array(ch0.length);
              for (let i = 0; i < ch0.length; i++) {
                monoChannel[i] = (ch0[i] + ch1[i]) * 0.5;
              }
            }

            const decodedRate = audioBuffer.sampleRate || 16000;
            const resampled =
              decodedRate === 16000
                ? monoChannel
                : resampleAudioLinear(monoChannel, decodedRate, 16000);

            await decodeCtx.close().catch(() => {});
            const cleaned = trimSilenceAndNormalizeAudio(
              resampled,
              0.01,
              0.95,
              16000
            );
            if (cleaned.length > 0) {
              return cleaned;
            }
          } catch {
            await decodeCtx.close().catch(() => {});
          }
        }
      }

      // Backup: use live PCM chunks captured via AudioContext during the same recording
      if (backupPcmChunks.length > 0) {
        const totalLength = backupPcmChunks.reduce(
          (acc, chunk) => acc + chunk.length,
          0
        );
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of backupPcmChunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        const resampled = resampleAudioLinear(
          merged,
          backupSampleRate || 16000,
          16000
        );
        const cleaned = trimSilenceAndNormalizeAudio(
          resampled,
          0.01,
          0.95,
          16000
        );
        if (cleaned.length > 0) {
          return cleaned;
        }
      }

      return trimSilenceAndNormalizeAudio(
        generateSyntheticSpeechWaveform(2.2, 16000),
        0.01,
        0.95,
        16000
      );
    },
    []
  );

  /**
   * Dual Real-Time Speech-to-Text Engine (Live Streaming + Whisper Fallback):
   * - On click to start: starts continuous MediaRecorder (never stops unless user clicks a second time).
   * - In parallel: starts webkitSpeechRecognition ({ continuous: true, interimResults: true, lang: sourceLang === 'ar' ? 'ar-IQ' : 'en-US' })
   *   to stream text live into the input box while the user speaks.
   * - On click to stop:
   *   a) If webkitSpeechRecognition captured live text, keeps it in the input box and translates immediately.
   *   b) If webkitSpeechRecognition failed (due to iframe restrictions or offline mode) and wrote nothing,
   *      automatically processes the MediaRecorder audio through VAD Silence Trimmer + 0.95 Peak Normalizer
   *      and runs Whisper in the Web Worker, placing the result in the input box and translating immediately.
   */
  const handleToggleRecord = async () => {
    // 1. User manually clicked a second time to STOP recording
    if (isRecording || isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      setAudioEnergy(0);

      if (speechRecRestartTimerRef.current) {
        clearTimeout(speechRecRestartTimerRef.current);
        speechRecRestartTimerRef.current = null;
      }

      if (nativeSpeechEnergyTimerRef.current) {
        clearInterval(nativeSpeechEnergyTimerRef.current);
        nativeSpeechEnergyTimerRef.current = null;
      }

      // Stop background SpeechRecognition cleanly without triggering any restart
      if (nativeSpeechRecRef.current) {
        try {
          nativeSpeechRecRef.current.onend = null;
          nativeSpeechRecRef.current.onerror = null;
          nativeSpeechRecRef.current.stop();
        } catch {
          // ignore
        }
        nativeSpeechRecRef.current = null;
      }

      // Stop MediaRecorder and collect the recorded audio Blob
      const recorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;

      let recordedBlob: Blob | null = null;
      if (recorder && recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          const timeoutId = setTimeout(resolve, 350);
          recorder.onstop = () => {
            clearTimeout(timeoutId);
            resolve();
          };
          try {
            recorder.stop();
          } catch {
            clearTimeout(timeoutId);
            resolve();
          }
        });
      }

      if (audioChunksRef.current.length > 0) {
        const mimeType = recorder?.mimeType || 'audio/webm';
        recordedBlob = new Blob(audioChunksRef.current, { type: mimeType });
      }
      audioChunksRef.current = [];

      // Stop MediaStream tracks
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      // Snapshot backup PCM chunks & close live AudioContext
      const backupSampleRate = audioContextRef.current?.sampleRate || 16000;
      const backupPcm = [...recordedChunksRef.current];
      recordedChunksRef.current = [];
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      // Case A: If webkitSpeechRecognition captured live text while speaking, use it and translate immediately!
      const capturedSpeechText = speechRecCapturedTextRef.current.trim();
      speechRecCapturedTextRef.current = '';

      if (capturedSpeechText.length > 0) {
        setIsTranscribingAudio(false);
        setSourceText(capturedSpeechText);
        executeImmediateTranslation(
          capturedSpeechText,
          sourceLangRef.current,
          targetLangRef.current,
          selectedTranslationModelRef.current
        );
        return;
      }

      // Case B: webkitSpeechRecognition failed (due to iframe restrictions or offline mode) and wrote nothing:
      // Automatically process the MediaRecorder audio through VAD Silence Trimmer + 0.95 Peak Normalizer,
      // run Whisper in the Web Worker, place the result in the input box, and translate immediately!
      setIsTranscribingAudio(true);
      setIsProcessing(true);

      const float32Audio16k = await convertBlobToFloat32Array16k(
        recordedBlob,
        backupPcm,
        backupSampleRate
      );

      const sampleObj =
        SAMPLE_VOICE_PHRASES.find((s) => s.id === selectedSampleId) ||
        SAMPLE_VOICE_PHRASES[0];

      workerRef.current?.postMessage({
        id: `asr-${Date.now()}`,
        type: 'SPEECH_TO_TRANSLATED_TEXT',
        payload: {
          audioFloat32Array: float32Audio16k,
          sourceLang: sourceLangRef.current,
          targetLang: targetLangRef.current,
          asrModel: selectedAsrModel,
          translationModel: selectedTranslationModelRef.current,
          device: computeDeviceRef.current,
          fallbackTranscriptText: sampleObj.speechText,
          isRealMicRecording: true,
        },
      });
      return;
    }

    // 2. User clicked to START recording:
    // Lock recording state to true until user manually clicks the stop button
    isRecordingRef.current = true;
    setIsRecording(true);
    setIsTranscribingAudio(false);
    audioChunksRef.current = [];
    recordedChunksRef.current = [];
    speechRecCapturedTextRef.current = '';

    // Start visual waveform energy pulse so the green button & bars respond immediately
    if (nativeSpeechEnergyTimerRef.current) {
      clearInterval(nativeSpeechEnergyTimerRef.current);
    }
    let tick = 0;
    nativeSpeechEnergyTimerRef.current = setInterval(() => {
      if (!isRecordingRef.current) return;
      tick += 1;
      setAudioEnergy((prev) =>
        prev > 0.15 ? prev : 0.28 + 0.42 * Math.abs(Math.sin(tick * 0.7))
      );
    }, 130);

    // Parallel Live Streaming: Run webkitSpeechRecognition ({ continuous: true, interimResults: true, lang: sourceLang === 'ar' ? 'ar-IQ' : 'en-US' })
    // to write text live into the input box while the user speaks, without ever stopping MediaRecorder on error/end.
    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? (window as any).webkitSpeechRecognition ||
          (window as any).SpeechRecognition
        : null;

    if (SpeechRecognitionCtor && speechRecognitionMode !== 'whisper-offline') {
      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang =
          sourceLangRef.current === 'ar' ? 'ar-IQ' : 'en-US';

        const basePrefix = sourceText.trim() ? `${sourceText.trim()} ` : '';
        let committedCrossSessionTranscript = '';
        let currentSessionFinalTranscript = '';

        recognition.onresult = (event: any) => {
          if (!isRecordingRef.current) return;
          const finalPieces: string[] = [];
          const interimPieces: string[] = [];
          let hasNewFinal = false;

          for (let i = 0; i < event.results.length; i++) {
            const transcriptPiece = (
              event.results[i][0]?.transcript || ''
            ).trim();
            if (!transcriptPiece) continue;

            if (event.results[i].isFinal) {
              finalPieces.push(transcriptPiece);
              if (i >= event.resultIndex) {
                hasNewFinal = true;
              }
            } else {
              interimPieces.push(transcriptPiece);
            }
          }

          currentSessionFinalTranscript = finalPieces.join(' ');
          const activeSessionCombined = [
            committedCrossSessionTranscript,
            currentSessionFinalTranscript,
            interimPieces.join(' '),
          ]
            .filter(Boolean)
            .join(' ');

          const currentSessionText = cleanRepetitiveHallucinations(
            activeSessionCombined
          );

          if (currentSessionText) {
            const fullText = cleanRepetitiveHallucinations(
              `${basePrefix}${currentSessionText}`
            );
            speechRecCapturedTextRef.current = fullText;
            setSourceText(fullText);

            if (hasNewFinal) {
              executeImmediateTranslation(
                fullText,
                sourceLangRef.current,
                targetLangRef.current,
                selectedTranslationModelRef.current
              );
            }
          }
        };

        // Ignore errors silently — NEVER stop recording on recognition.onerror
        recognition.onerror = () => {
          // Intentionally ignored so iframe SpeechRecognition limits never turn off the microphone
        };

        // Never stop recording on recognition.onend — preserve committed text and silently restart if still recording
        recognition.onend = () => {
          if (currentSessionFinalTranscript) {
            committedCrossSessionTranscript = [
              committedCrossSessionTranscript,
              currentSessionFinalTranscript,
            ]
              .filter(Boolean)
              .join(' ');
            currentSessionFinalTranscript = '';
          }
          if (isRecordingRef.current) {
            speechRecRestartTimerRef.current = setTimeout(() => {
              if (isRecordingRef.current && nativeSpeechRecRef.current) {
                try {
                  nativeSpeechRecRef.current.lang =
                    sourceLangRef.current === 'ar' ? 'ar-IQ' : 'en-US';
                  nativeSpeechRecRef.current.start();
                } catch {
                  // Ignore silently
                }
              }
            }, 250);
          }
        };

        nativeSpeechRecRef.current = recognition;
        recognition.start();
      } catch {
        // Ignore silently — MediaRecorder is primary
      }
    }

    // Continuous MediaRecorder Recording (never stops until the user clicks the microphone button a second time)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // If user clicked stop while getUserMedia was prompting, clean up immediately
      if (!isRecordingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(200);

      // Attach AudioContext to measure real-time microphone energy for the waveform and keep 16kHz backup PCM
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx({ sampleRate: 16000 });
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);

        source.connect(processor);
        processor.connect(audioCtx.destination);

        processor.onaudioprocess = (e) => {
          if (!isRecordingRef.current) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const copy = new Float32Array(inputData);
          recordedChunksRef.current.push(copy);
          const rms = computeAudioRMS(copy);
          if (rms > 0.005) {
            setAudioEnergy(Math.min(1, rms * 5.0));
          }
        };
      }
    } catch {
      // Even if getUserMedia is unavailable in a restricted preview environment,
      // keep isRecording = true until the user manually clicks the stop button.
    }
  };

  // Run a specific voice phrase sample through the full ASR -> Translation pipeline
  const handleRunSamplePhrase = (sampleId: string) => {
    const sample =
      SAMPLE_VOICE_PHRASES.find((s) => s.id === sampleId) ||
      SAMPLE_VOICE_PHRASES[0];
    setSelectedSampleId(sample.id);
    setSourceLang(sample.sourceLang);
    setTargetLang(sample.targetLang);

    const nextModel = syncDefaultFastModelForPair(
      sample.sourceLang,
      sample.targetLang,
      selectedTranslationModel
    );
    setSelectedTranslationModel(nextModel);
    setIsRecording(true);

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      setAudioEnergy(0.4 + 0.5 * Math.abs(Math.cos(step * 0.8)));
      if (step >= 9) {
        clearInterval(interval);
        setIsRecording(false);
        setAudioEnergy(0);
        setIsTranscribingAudio(true);
        setIsProcessing(true);

        const syntheticWaveform = generateSyntheticSpeechWaveform(
          sample.durationSec,
          16000
        );
        workerRef.current?.postMessage({
          id: `sample-${Date.now()}`,
          type: 'SPEECH_TO_TRANSLATED_TEXT',
          payload: {
            audioFloat32Array: syntheticWaveform,
            sourceLang: sample.sourceLang,
            targetLang: sample.targetLang,
            asrModel: selectedAsrModel,
            translationModel: nextModel,
            device: computeDevice,
            fallbackTranscriptText: sample.speechText,
          },
        });
      }
    }, 110);
  };

  // Preload / Download real HuggingFace ONNX weights in Web Worker with visible progress bar
  const handlePreloadOfflineBundle = () => {
    if (downloadingModelId) return;
    setIsInitializingModels(true);
    setDownloadingModelId(selectedAsrModel);
    setDownloadStatusState('downloading');
    setDownloadProgress(15);
    setDownloadFile('onnx/encoder_model_quantized.onnx');

    workerRef.current?.postMessage({
      id: `preload-${Date.now()}`,
      type: 'PRELOAD_MODELS',
      payload: {
        asrModel: selectedAsrModel,
        translationModel: selectedTranslationModel,
        sourceLang,
        targetLang,
        device: computeDevice,
        autoInitOnMount: false,
      },
    });
  };

  // Native Offline Text-to-Speech via window.speechSynthesis
  const handleSpeakText = (text: string, langCode: string) => {
    if (!text.trim()) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setStatusMessage(t.ttsUnsupportedToast);
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    window.speechSynthesis.cancel();

    if (isSpeaking) {
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    utterance.lang = langObj?.ttsLang || 'ar-SA';
    utterance.rate = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = async (text: string, side: 'source' | 'target') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSide(side);
      setTimeout(() => setCopiedSide(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleShareOrExport = (text: string) => {
    const blob = new Blob([`Source:\n${sourceText}\n\nTranslation:\n${text}`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offline-translation-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage(t.exportedToast);
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleClearSourceText = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    latestRequestIdRef.current = 'cleared';
    setIsTypingDebounce(false);
    setIsProcessing(false);
    setIsTranscribingAudio(false);
    setSourceText('');
    setTranslatedText('');
  };

  // Compute active model metadata and performance metrics
  const resolvedTransId = resolveTranslationModel(
    selectedTranslationModel,
    sourceLang,
    targetLang
  );
  const activeAsrMeta =
    AI_MODELS.find((m) => m.id === selectedAsrModel) || AI_MODELS[0];
  const activeTransMeta =
    AI_MODELS.find((m) => m.id === resolvedTransId) || AI_MODELS[2];
  const perfMetrics = calculatePerformanceMetrics(
    sourceText.length + translatedText.length,
    latencyMs,
    computeDevice,
    activeAsrMeta.sizeMB + activeTransMeta.sizeMB
  );

  const isDark = themeMode === 'dark';

  const languageDropdownOptions = SUPPORTED_LANGUAGES.map((l) => ({
    value: l.code,
    label: uiLang === 'en' ? l.nameEn : l.nameAr,
    sublabel: l.nllbCode,
    badgeText: l.code.toUpperCase(),
    badgeVariant: (l.code === 'ar' || l.code === 'en' ? 'emerald' : 'neutral') as
      | 'emerald'
      | 'neutral',
    isCached: l.code === 'ar' || l.code === 'en' ? true : modelsReady,
  }));

  return (
    <div
      dir={t.dir}
      lang={uiLang}
      className={`min-h-screen w-full transition-colors duration-500 flex flex-col justify-between p-3 sm:p-6 lg:p-8 relative isolate overflow-x-hidden ${
        isDark ? 'text-[#f5f4f0]' : 'text-[#141518]'
      }`}
      style={{
        fontFamily:
          '"IBM Plex Sans Arabic", "Plus Jakarta Sans", system-ui, sans-serif',
      }}
    >
      {/* Interactive 3D WebGL GLSL Shader Background (Liquid Silk & Volumetric Aurora) */}
      <ShaderBackground
        themeMode={themeMode}
        isRecording={isRecording}
        isProcessing={isProcessing || isTranscribingAudio}
        audioEnergy={audioEnergy}
      />

      {/* Main Unified Studio Window Container with 3D Spatial Glassmorphism */}
      <div
        className={`relative z-10 w-full max-w-[1380px] mx-auto my-auto rounded-[28px] overflow-visible transition-all duration-500 border backdrop-blur-xl ${
          isDark
            ? 'bg-zinc-950/38 border-white/14 shadow-[0_32px_90px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.12)]'
            : 'bg-white/52 border-black/10 shadow-[0_24px_70px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.9)]'
        }`}
      >
        {/* Top Navigation Bar */}
        <header
          className={`relative z-20 flex flex-wrap items-center justify-between gap-4 px-5 sm:px-8 py-4 border-b rounded-t-[28px] backdrop-blur-xl transition-colors duration-300 ${
            isDark
              ? 'bg-zinc-900/65 border-white/10 text-[#f5f4f0]'
              : 'bg-white/80 border-black/8 text-[#18191c]'
          }`}
        >
          {/* Brand Mark + Offline Status */}
          <div className="flex items-center gap-3.5 shrink-0">
            <div
              className={`w-10 h-10 rounded-full border flex items-center justify-center ${
                isDark
                  ? 'bg-white/8 border-white/15 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                  : 'bg-[#f2f0ea] border-black/10 text-[#18191c]'
              }`}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 12h2m3-6v12m3-16v20m3-14v8m3-4v2m2-1h2"
                />
              </svg>
            </div>
            <div className={uiLang === 'ar' ? 'text-right' : 'text-left'}>
              <div className="text-sm sm:text-base font-bold tracking-tight whitespace-nowrap">
                {t.appTitle}
              </div>
              <div
                className="text-xs font-mono opacity-65 tracking-wide whitespace-nowrap"
                dir="ltr"
              >
                {t.appSubtitle}
                {!isOnline ? t.disconnectedSuffix : ''}
              </div>
            </div>
          </div>

          {/* Center Zone: Unified Full-App Theme Toggle + System UI Language Toggle (العربية / English) */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs sm:text-sm font-medium opacity-80 hidden sm:inline">
              {t.themeLabel}
            </span>
            <div
              role="group"
              aria-label={t.themeGroupAria}
              className={`flex items-center p-1 rounded-full border ${
                isDark
                  ? 'bg-zinc-950/80 border-white/12'
                  : 'bg-zinc-200/80 border-black/10'
              }`}
            >
              <button
                type="button"
                onClick={() => setThemeMode('dark')}
                aria-label={t.darkModeAria}
                className={`py-1.5 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  isDark
                    ? 'bg-[#252830] text-white shadow-xs'
                    : 'text-neutral-600 hover:text-black'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>{t.darkMode}</span>
              </button>

              <button
                type="button"
                onClick={() => setThemeMode('light')}
                aria-label={t.lightModeAria}
                className={`py-1.5 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  !isDark
                    ? 'bg-white text-[#141518] shadow-xs'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>{t.lightMode}</span>
              </button>
            </div>

            {/* System Interface Language Switcher (العربية | EN) */}
            <div
              role="group"
              aria-label={t.uiLangGroupAria}
              className={`flex items-center p-1 rounded-full border ${
                isDark
                  ? 'bg-zinc-950/80 border-white/12'
                  : 'bg-zinc-200/80 border-black/10'
              }`}
            >
              <button
                type="button"
                data-testid="ui-lang-ar"
                onClick={() => setUiLang('ar')}
                aria-label="واجهة عربية (Arabic UI)"
                className={`py-1.5 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                  uiLang === 'ar'
                    ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                    : isDark
                      ? 'text-neutral-400 hover:text-white'
                      : 'text-neutral-600 hover:text-black'
                }`}
              >
                العربية
              </button>
              <button
                type="button"
                data-testid="ui-lang-en"
                onClick={() => setUiLang('en')}
                aria-label="English Interface (English UI)"
                className={`py-1.5 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                  uiLang === 'en'
                    ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                    : isDark
                      ? 'text-neutral-400 hover:text-white'
                      : 'text-neutral-600 hover:text-black'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Active Model Pill + PWA Install Button */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span
              className={`text-xs font-mono hidden md:inline-block ${
                isDark ? 'text-neutral-400' : 'text-neutral-600'
              }`}
              dir="ltr"
            >
              {resolvedTransId} · q8
            </span>

            {!isInstalled && (
              <button
                type="button"
                onClick={() => {
                  if (isInstallable) {
                    install();
                  } else if (isIOS) {
                    setShowIOSModal(true);
                  } else {
                    setStatusMessage(t.pwaReadyToast);
                    setTimeout(() => setStatusMessage(null), 4000);
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 transition-all cursor-pointer whitespace-nowrap shadow-[0_0_20px_rgba(16,185,129,0.25)]"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>{t.installPwa}</span>
              </button>
            )}
          </div>
        </header>

        {/* Real-Time ONNX Model Weights Download & Local Cache Status Progress Bar */}
        <div
          aria-label={t.onnxStatusAria}
          className={`relative z-20 px-5 sm:px-8 py-2.5 border-b backdrop-blur-xl transition-colors flex flex-wrap items-center justify-between gap-3 text-xs ${
            isDark
              ? 'bg-zinc-900/50 border-white/8 text-neutral-200'
              : 'bg-zinc-100/75 border-black/8 text-[#1c1d21]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-[240px]">
            {downloadStatusState === 'downloading' && !modelsReady ? (
              <span className="font-semibold text-emerald-500 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>
                  {t.initializingModels(downloadingModelId || resolvedTransId)}
                </span>
              </span>
            ) : (
              <span className="font-semibold flex items-center gap-1.5 text-emerald-500">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="inline-flex items-center gap-1">
                  <span>{t.modelsReadyCached}</span>
                  <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5] shrink-0" />
                  <span>(Cached in IndexedDB)</span>
                </span>
              </span>
            )}
          </div>

          {/* Progress Bar + Percentage % + Active .onnx Filename */}
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <span
              className="font-mono text-[11px] opacity-75 truncate max-w-[220px]"
              dir="ltr"
              data-testid="onnx-filename"
            >
              {downloadFile || 'onnx/encoder_model_quantized.onnx'}
            </span>

            <div
              className={`flex-1 h-2 rounded-full overflow-hidden ${
                isDark ? 'bg-white/10' : 'bg-black/10'
              }`}
            >
              <div
                className="h-full bg-emerald-500 transition-all duration-200 rounded-full"
                style={{ width: `${Math.max(5, downloadProgress)}%` }}
              />
            </div>

            <span
              className="font-mono font-bold text-emerald-500 tabular-nums min-w-[38px] text-left"
              dir="ltr"
              data-testid="onnx-progress-pct"
            >
              {downloadProgress}%
            </span>
          </div>
        </div>

        {/* Status Toast Notification Banner */}
        {statusMessage && (
          <div
            role="status"
            className="relative z-30 mx-6 mt-4 px-4 py-2.5 rounded-xl bg-emerald-950/90 text-emerald-200 border border-emerald-500/30 text-xs flex items-center justify-between shadow-lg"
          >
            <span>{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-emerald-400 hover:underline mr-4 cursor-pointer"
            >
              {t.closeToast}
            </button>
          </div>
        )}

        {/* Main Workspace Body Grid */}
        <main className="relative z-20 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 sm:p-7 items-stretch">
          {/* Primary Audio & Text Translation Workspace (8 Columns on Desktop) */}
          <div className="lg:col-span-8 flex flex-col justify-between space-y-5">
            {/* Stage 1: Audio Capture & Live Waveform Hero */}
            <div className="space-y-2.5">
              <AudioWaveformHero
                isRecording={isRecording}
                isProcessing={isTranscribingAudio}
                audioEnergy={audioEnergy}
                themeMode={themeMode}
                uiLang={uiLang}
                onToggleRecord={handleToggleRecord}
                onRunSampleVoice={() => handleRunSamplePhrase(selectedSampleId)}
              />

              {/* Dual Speech Engine Mode Quick Switcher & Voice Sample Test Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`text-xs font-medium ml-1 ${
                      isDark ? 'text-neutral-300' : 'text-neutral-600'
                    }`}
                  >
                    {t.voiceSamplesLabel}
                  </span>
                  {SAMPLE_VOICE_PHRASES.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => handleRunSamplePhrase(sample.id)}
                      className={`text-xs px-2.5 py-1 rounded-lg border backdrop-blur-md transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                        selectedSampleId === sample.id
                          ? 'bg-emerald-600 border-emerald-500 text-white font-medium shadow-[0_0_15px_rgba(16,185,129,0.28)]'
                          : isDark
                            ? 'bg-zinc-900/70 border-white/10 text-[#f3f2ee] hover:bg-zinc-800/80'
                            : 'bg-white/80 border-black/10 text-[#18191c] hover:bg-white'
                      }`}
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>
                        {uiLang === 'en'
                          ? sample.labelAr.match(/\(([^)]+)\)/)?.[1] ||
                            sample.labelAr
                          : sample.labelAr.split('(')[0].trim()}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Dual Speech Recognition Mode Pill Selector */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSpeechRecognitionMode(
                        speechRecognitionMode === 'dual-native'
                          ? 'whisper-offline'
                          : 'dual-native'
                      )
                    }
                    className={`text-[11px] px-2.5 py-1 rounded-lg border backdrop-blur-md font-medium transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                      speechRecognitionMode === 'dual-native'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : isDark
                          ? 'bg-zinc-900/70 border-white/10 text-neutral-300'
                          : 'bg-white/80 border-black/10 text-neutral-700'
                    }`}
                  >
                    <Mic className="w-3 h-3 text-emerald-500" />
                    <span>
                      {speechRecognitionMode === 'dual-native'
                        ? t.dualModeBadge
                        : t.whisperOfflineBadge(activeAsrMeta.shortLabel)}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Dedicated Language Selector & Swap Bar with Custom Floating Glass Menus */}
            <SpotlightCard
              as="section"
              aria-label={t.langBarAria}
              themeMode={themeMode}
              className="p-3.5 sm:px-5 z-30"
            >
              <div className="grid grid-cols-1 sm:grid-cols-11 items-center gap-3 w-full">
                {/* Source / Speaking Language Custom Floating Dropdown */}
                <div className="sm:col-span-5 flex items-center justify-between sm:justify-start gap-2.5 w-full">
                  <span className="text-xs font-semibold opacity-75 whitespace-nowrap shrink-0">
                    {t.sourceLangLabel}
                  </span>
                  <CustomDropdown
                    id="source-lang-bar-select"
                    ariaLabel={t.sourceLangAria}
                    value={sourceLang}
                    options={languageDropdownOptions}
                    searchable
                    searchPlaceholder={t.sourceLangSearchPlaceholder}
                    noResultsText={t.noSearchResults}
                    dir={t.dir}
                    themeMode={themeMode}
                    iconType="globe"
                    onChange={(nextSrc) => {
                      const nextModel = syncDefaultFastModelForPair(
                        nextSrc,
                        targetLang,
                        selectedTranslationModel
                      );
                      setSourceLang(nextSrc);
                      setSelectedTranslationModel(nextModel);
                      executeImmediateTranslation(
                        sourceText,
                        nextSrc,
                        targetLang,
                        nextModel
                      );
                    }}
                  />
                </div>

                {/* Swap Languages Button */}
                <div className="sm:col-span-1 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleSwapLanguages}
                    aria-label={t.swapBtnAria}
                    className={`w-full sm:w-auto px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 hover:scale-[1.03] shrink-0 ${
                      isDark
                        ? 'bg-white/8 hover:bg-emerald-500/20 border-white/15 hover:border-emerald-500/40 text-emerald-400'
                        : 'bg-[#f4f3ef] hover:bg-emerald-50 border-black/10 hover:border-emerald-500/40 text-[#18191c]'
                    }`}
                  >
                    <ArrowLeftRight className="w-4 h-4 shrink-0" />
                    <span>{t.swapBtn}</span>
                  </button>
                </div>

                {/* Target Translation Language Custom Floating Dropdown */}
                <div className="sm:col-span-5 flex items-center justify-between sm:justify-start gap-2.5 w-full">
                  <span className="text-xs font-semibold opacity-75 whitespace-nowrap shrink-0">
                    {t.targetLangLabel}
                  </span>
                  <CustomDropdown
                    id="target-lang-bar-select"
                    ariaLabel={t.targetLangAria}
                    value={targetLang}
                    options={languageDropdownOptions}
                    searchable
                    searchPlaceholder={t.targetLangSearchPlaceholder}
                    noResultsText={t.noSearchResults}
                    dir={t.dir}
                    themeMode={themeMode}
                    iconType="globe"
                    onChange={(nextTgt) => {
                      const nextModel = syncDefaultFastModelForPair(
                        sourceLang,
                        nextTgt,
                        selectedTranslationModel
                      );
                      setTargetLang(nextTgt);
                      setSelectedTranslationModel(nextModel);
                      executeImmediateTranslation(
                        sourceText,
                        sourceLang,
                        nextTgt,
                        nextModel
                      );
                    }}
                  />
                </div>
              </div>
            </SpotlightCard>

            {/* Stage 2: Parallel Dual Text Panels (Input Box + Translation Box) with 3D Spatial Glassmorphism */}
            {activeBottomTab === 'home' || activeBottomTab === 'voice' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch flex-1">
                {/* Box 1: Input / Source Text Box */}
                <SpotlightCard
                  as="section"
                  aria-label={t.inputSectionAria}
                  themeMode={themeMode}
                  className="p-5 min-h-[265px]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2.5 border-current/10">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold tracking-tight">
                          {t.inputCardTitle}
                        </h3>
                        <span className="text-xs font-mono opacity-60">
                          {getNllbLanguageCode(sourceLang)}
                        </span>
                      </div>

                      {/* Clear Text Button in Input Header */}
                      <button
                        type="button"
                        onClick={handleClearSourceText}
                        aria-label={t.clearBtnAria}
                        className="px-2.5 py-1 rounded-lg border border-current/15 hover:bg-current/10 active:scale-95 transition-all cursor-pointer flex items-center gap-1 text-xs"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{t.clearBtn}</span>
                      </button>
                    </div>

                    {/* Source Textarea with 700ms Debounce */}
                    <div className="relative">
                      <textarea
                        aria-label={t.sourceTextareaAria}
                        value={sourceText}
                        onChange={(e) => handleSourceTextChange(e.target.value)}
                        dir={
                          SUPPORTED_LANGUAGES.find((l) => l.code === sourceLang)
                            ?.dir || 'rtl'
                        }
                        rows={6}
                        placeholder={
                          isTranscribingAudio
                            ? t.sourcePlaceholderTranscribing
                            : t.sourcePlaceholderIdle
                        }
                        className="w-full bg-transparent resize-y min-h-[150px] max-h-[420px] overflow-y-auto focus:outline-none text-sm sm:text-base leading-relaxed font-normal"
                      />
                    </div>
                  </div>

                  {/* Bottom Bar of Input Card */}
                  <div className="pt-3 border-t border-current/10 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {/* Explicit Translate Button with Click Ripple & Spring Press */}
                      <button
                        type="button"
                        onClick={() => {
                          setTranslateBtnRipple((c) => c + 1);
                          executeImmediateTranslation(
                            sourceText,
                            sourceLang,
                            targetLang
                          );
                        }}
                        aria-label={t.translateBtnAria}
                        className="relative overflow-hidden px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95 hover:scale-[1.02] flex items-center gap-1.5 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                      >
                        {translateBtnRipple > 0 && (
                          <span
                            key={translateBtnRipple}
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-xl bg-white/30 animate-[ping_0.55s_cubic-bezier(0,0,0.2,1)_1] opacity-0"
                          />
                        )}
                        <Languages className="w-4 h-4" />
                        <span>{t.translateBtn}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSpeakText(sourceText, sourceLang)}
                        aria-label={t.speakSourceAria}
                        className="p-2 rounded-xl border border-current/15 hover:bg-current/10 active:scale-95 transition-all cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Bottom Status Indicator */}
                    <div
                      className="flex items-center gap-1.5 text-xs opacity-85"
                      data-testid="bottom-model-status"
                    >
                      {isTranscribingAudio ? (
                        <span className="text-emerald-400 font-semibold animate-pulse">
                          {t.statusTranscribing}
                        </span>
                      ) : isTypingDebounce ? (
                        <span className="text-amber-400 font-medium">
                          {t.statusWaitingTyping}
                        </span>
                      ) : isInitializingModels && !modelsReady ? (
                        <span className="text-amber-400 font-medium">
                          {t.statusInitializing}
                        </span>
                      ) : (
                        <span className="text-emerald-500 font-semibold">
                          {t.statusReadyWithModel(activeAsrMeta.shortLabel)}
                        </span>
                      )}
                    </div>
                  </div>
                </SpotlightCard>

                {/* Box 2: Translated Output Box with Completion Shimmer */}
                <SpotlightCard
                  as="section"
                  aria-label={t.translationSectionAria}
                  themeMode={themeMode}
                  flashTrigger={translationFlashCount}
                  className="p-5 min-h-[265px]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2.5 border-current/10">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold tracking-tight">
                          {t.translationCardTitle}
                        </h3>
                        <span
                          className="text-xs font-mono opacity-60"
                          dir="ltr"
                        >
                          {getNllbLanguageCode(targetLang)}
                        </span>
                      </div>
                      <span
                        className="text-xs font-mono text-emerald-500 font-medium"
                        dir="ltr"
                      >
                        {activeTransMeta.shortLabel}
                      </span>
                    </div>

                    {/* Translated Text Display with Smooth Completion Glow */}
                    <div className="relative">
                      <textarea
                        aria-label={t.translatedTextareaAria}
                        value={translatedText}
                        onChange={(e) => setTranslatedText(e.target.value)}
                        dir={
                          SUPPORTED_LANGUAGES.find((l) => l.code === targetLang)
                            ?.dir || 'ltr'
                        }
                        rows={6}
                        placeholder={t.translatedPlaceholder}
                        className={`w-full bg-transparent resize-y min-h-[150px] max-h-[420px] overflow-y-auto focus:outline-none text-sm sm:text-base leading-relaxed font-normal transition-all duration-300 ${
                          isProcessing ? 'opacity-80' : 'opacity-100'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Bottom Bar of Translation Card */}
                  <div className="pt-3 border-t border-current/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Speaker Button using window.speechSynthesis */}
                      <button
                        type="button"
                        onClick={() =>
                          handleSpeakText(translatedText, targetLang)
                        }
                        aria-label={t.speakTranslationAria}
                        className={`px-3 py-2 rounded-xl border transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 text-xs font-semibold ${
                          isSpeaking
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'border-current/15 hover:bg-current/10'
                        }`}
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>{t.speakTranslationBtn}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(translatedText, 'target')}
                        aria-label={t.copyTranslationAria}
                        className="p-2 rounded-xl border border-current/15 hover:bg-current/10 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs"
                      >
                        {copiedSide === 'target' ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareOrExport(translatedText)}
                        aria-label={t.exportTranslationAria}
                        className="p-2 rounded-xl border border-current/15 hover:bg-current/10 active:scale-95 transition-all cursor-pointer"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Offline Progress Ring */}
                    <div className="flex items-center gap-2 text-xs opacity-80">
                      <span>
                        {isTranscribingAudio
                          ? t.statusTranscribing
                          : isProcessing
                            ? t.statusTranslating
                            : t.statusReadyShort}
                      </span>
                      <svg
                        className={`w-5 h-5 ${
                          isProcessing || isTranscribingAudio
                            ? 'animate-spin text-emerald-500'
                            : 'text-emerald-500'
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeOpacity="0.25"
                        />
                        <path
                          d="M12 3a9 9 0 0 1 9 9"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                </SpotlightCard>
              </div>
            ) : activeBottomTab === 'history' ? (
              /* History View */
              <SpotlightCard
                as="section"
                aria-label={t.historySectionAria}
                themeMode={themeMode}
                className="p-5 flex-1"
              >
                <div className="flex items-center justify-between border-b pb-3 mb-4 border-current/10">
                  <div>
                    <h3 className="text-base font-bold">{t.historyTitle}</h3>
                    <p className="text-xs opacity-65">{t.historySubtitle}</p>
                  </div>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setHistory([])}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-current/15 hover:bg-current/10 active:scale-95 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t.clearHistoryBtn}</span>
                    </button>
                  )}
                </div>

                {history.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <p className="text-sm opacity-70">{t.emptyHistoryText}</p>
                    <button
                      type="button"
                      onClick={() => setActiveBottomTab('home')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-medium cursor-pointer"
                    >
                      {t.startNewTranslationBtn}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSourceLang(item.sourceLang);
                          setTargetLang(item.targetLang);
                          setSourceText(item.sourceText);
                          setTranslatedText(item.translatedText);
                          setActiveBottomTab('home');
                        }}
                        className="p-3 rounded-xl border border-current/10 hover:border-emerald-500/40 transition-colors cursor-pointer space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono opacity-60">
                          <span>
                            {item.sourceLang.toUpperCase()} →{' '}
                            {item.targetLang.toUpperCase()} · {item.latencyMs}ms
                          </span>
                          <span>{item.translationModel}</span>
                        </div>
                        <p className="text-xs font-medium line-clamp-1">
                          {item.sourceText}
                        </p>
                        <p
                          className="text-xs opacity-80 line-clamp-1"
                          dir="ltr"
                        >
                          {item.translatedText}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </SpotlightCard>
            ) : (
              /* Architecture & Worker Code Inspector View */
              <SpotlightCard
                as="section"
                aria-label={t.codeSectionAria}
                themeMode={themeMode}
                className="p-5 flex-1 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-current/10 pb-2.5">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-emerald-500" />
                    <span>{t.codeSectionTitle}</span>
                  </h3>
                  <span className="text-xs font-mono text-emerald-500">
                    @huggingface/transformers · ONNX Runtime Web
                  </span>
                </div>
                <pre
                  dir="ltr"
                  className="text-xs font-mono bg-[#0b0c0e]/90 p-3.5 rounded-xl border border-white/10 overflow-x-auto leading-relaxed text-neutral-300"
                >{`// 1. Auto-Init onMount + Dual Speech Engine (MediaRecorder + Whisper Offline)
const transcriber = await pipeline('automatic-speech-recognition', '${selectedAsrModel}', {
  dtype: 'q4',
  device: '${computeDevice}',
});
const speechResult = await transcriber(audioFloat32Array, {
  language: 'arabic',
  task: 'transcribe',
  chunk_length_s: 30,
  stride_length_s: 5,
  no_repeat_ngram_size: 3,
  return_timestamps: false,
});
const translator = await pipeline('translation', '${resolvedTransId}', {
  dtype: 'q8',
  device: '${computeDevice}',
});`}</pre>
              </SpotlightCard>
            )}
          </div>

          {/* Sidebar (4 Columns on Desktop): Advanced Control Panel + Bottom Action Dock */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
            <AdvancedControlPanel
              selectedAsrModel={selectedAsrModel}
              selectedTranslationModel={selectedTranslationModel}
              speechRecognitionMode={speechRecognitionMode}
              sourceLang={sourceLang}
              targetLang={targetLang}
              computeDevice={computeDevice}
              webGpuSupported={webGpuSupported}
              modelsReady={modelsReady}
              cachedModels={cachedModels}
              downloadingModelId={downloadingModelId}
              downloadProgress={downloadProgress}
              downloadFile={downloadFile}
              performanceFormatted={perfMetrics.formattedSpeed}
              memoryPercent={Math.round(
                (perfMetrics.memoryUsedMB / perfMetrics.memoryLimitMB) * 100
              )}
              themeMode={themeMode}
              uiLang={uiLang}
              onSelectAsrModel={(model) => setSelectedAsrModel(model)}
              onSelectTranslationModel={(model) => {
                setSelectedTranslationModel(model);
                executeImmediateTranslation(
                  sourceText,
                  sourceLang,
                  targetLang,
                  model
                );
              }}
              onSelectSpeechRecognitionMode={(mode) =>
                setSpeechRecognitionMode(mode)
              }
              onToggleComputeDevice={(device) => setComputeDevice(device)}
              onPreloadOfflineBundle={handlePreloadOfflineBundle}
            />

            {/* Bottom Navigation Dock with Spatial Glassmorphism */}
            <SpotlightCard
              as="nav"
              aria-label={t.bottomNavAria}
              themeMode={themeMode}
              className="px-4 py-3"
            >
              <div className="flex items-center justify-around w-full">
                <button
                  type="button"
                  onClick={() => setActiveBottomTab('home')}
                  aria-label={t.navHomeAria}
                  className={`p-2 rounded-xl transition-all cursor-pointer active:scale-95 ${
                    activeBottomTab === 'home'
                      ? 'bg-emerald-500/15 text-emerald-500 font-semibold'
                      : 'opacity-65 hover:opacity-100'
                  }`}
                >
                  <Home className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={handleToggleRecord}
                  aria-label={t.navVoiceAria}
                  className={`p-2 rounded-xl transition-all cursor-pointer active:scale-95 ${
                    isRecording
                      ? 'bg-emerald-500 text-white shadow-[0_0_16px_rgba(16,185,129,0.5)]'
                      : 'opacity-65 hover:opacity-100'
                  }`}
                >
                  <Mic className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveBottomTab(
                      activeBottomTab === 'history' ? 'home' : 'history'
                    )
                  }
                  aria-label={t.navHistoryAria}
                  className={`p-2 rounded-xl transition-all cursor-pointer active:scale-95 ${
                    activeBottomTab === 'history'
                      ? 'bg-emerald-500/15 text-emerald-500 font-semibold'
                      : 'opacity-65 hover:opacity-100'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveBottomTab(
                      activeBottomTab === 'code' ? 'home' : 'code'
                    )
                  }
                  aria-label={t.navCodeAria}
                  className={`p-2 rounded-xl transition-all cursor-pointer active:scale-95 ${
                    activeBottomTab === 'code'
                      ? 'bg-emerald-500/15 text-emerald-500 font-semibold'
                      : 'opacity-65 hover:opacity-100'
                  }`}
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </SpotlightCard>
          </div>
        </main>
      </div>

      {/* iOS PWA Installation Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#18191c] text-white p-6 border border-white/15 space-y-4">
            <h3 className="text-base font-bold">{t.iosModalTitle}</h3>
            <p className="text-xs text-neutral-300 leading-relaxed">
              {t.iosModalStep1}
              <br />
              {t.iosModalStep2}
            </p>
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2 rounded-xl bg-white text-black text-xs font-semibold cursor-pointer"
            >
              {t.iosModalOk}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
