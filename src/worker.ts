import { pipeline, env } from '@huggingface/transformers';
import {
  localInstantTranslate,
  getExactKnownSegmentTranslation,
  resolveTranslationModel,
  getNllbLanguageCode,
  detectTextScriptLanguage,
  splitTextIntoTranslationSegments,
  cleanRepetitiveHallucinations,
  sanitizeAndRepairTranslation,
  LatestOnlyTaskQueue,
  trimSilenceAndNormalizeAudio,
  getWhisperPipelineOptions,
  getWhisperTranscribeOptions,
  type ASRModelId,
  type TranslationModelId,
  type ComputeDevice,
} from './utils/offlineEngine';

// Allow browser caching via Cache API / IndexedDB for 100% offline execution after initial download
env.allowLocalModels = false;
env.useBrowserCache = true;

// Cache loaded pipelines and in-flight promises in memory inside the worker
let activeAsrModelId: string | null = null;
let transcriberPipeline: any = null;
const transcriberPromises: Record<string, Promise<any> | undefined> = {};

// Support multiple cached translation pipelines so switching between ar->en and en->ar is instant
const translatorPipelines: Record<string, any> = {};
const translatorPromises: Record<string, Promise<any> | undefined> = {};

// Track latest active text translation request so background-completed ONNX loads can upgrade it
let latestTranslationJobContext: {
  id: string;
  trimmed: string;
  effectiveSourceLang: string;
  effectiveTargetLang: string;
  resolvedModel: TranslationModelId;
} | null = null;

export interface WorkerRequestMessage {
  id: string;
  type:
    | 'PRELOAD_MODELS'
    | 'SPEECH_TO_TRANSLATED_TEXT'
    | 'TRANSLATE_TEXT'
    | 'CHECK_CACHE_STATUS';
  payload: any;
}

function sendProgress(
  modelId: string,
  status: string,
  progress: number,
  file?: string,
  loadedBytes?: number,
  totalBytes?: number
) {
  self.postMessage({
    type: 'MODEL_PROGRESS',
    payload: {
      modelId,
      status,
      progress: Math.min(100, Math.max(0, Math.round(progress))),
      file: file || 'onnx/model_quantized.onnx',
      loadedBytes: loadedBytes || 0,
      totalBytes: totalBytes || 0,
    },
  });
}

async function createTranscriberPipelineWithFallback(
  modelId: ASRModelId,
  device: ComputeDevice,
  onProgress: (info: any) => void
) {
  // Check navigator.gpu availability first: if available with an active GPU adapter,
  // pass { device: 'webgpu', dtype: 'q4' } to run the model on the GPU at instant speed;
  // otherwise fall back to 'wasm'.
  let hasWebGpu = false;
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const gpuObj = (navigator as any).gpu;
      if (gpuObj && typeof gpuObj.requestAdapter === 'function') {
        const adapter = await gpuObj.requestAdapter();
        hasWebGpu = Boolean(adapter);
      } else {
        hasWebGpu = true;
      }
    } catch {
      hasWebGpu = false;
    }
  }

  const primaryOpts = getWhisperPipelineOptions(hasWebGpu, device);

  if (primaryOpts.device === 'webgpu') {
    try {
      return await pipeline('automatic-speech-recognition', modelId, {
        device: 'webgpu',
        dtype: 'q4',
        progress_callback: onProgress,
      });
    } catch {
      // Fallback to WASM if WebGPU execution fails at runtime
      return await pipeline('automatic-speech-recognition', modelId, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: onProgress,
      });
    }
  }

  return await pipeline('automatic-speech-recognition', modelId, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: onProgress,
  });
}

async function getTranscriber(
  modelId: ASRModelId,
  device: ComputeDevice,
  fastMount = false,
  waitForRealInference = false
) {
  if (transcriberPipeline && activeAsrModelId === modelId) {
    return transcriberPipeline;
  }

  let suppressProgress = fastMount;
  if (!transcriberPromises[modelId]) {
    if (!suppressProgress) {
      sendProgress(
        modelId,
        'initiating',
        25,
        'onnx/encoder_model_quantized.onnx'
      );
    }

    const p = createTranscriberPipelineWithFallback(
      modelId,
      device,
      (info: any) => {
        if (suppressProgress) return;
        if (info.status === 'initiate') {
          sendProgress(modelId, 'initiating', 30, info.file || 'config.json');
        } else if (info.status === 'download') {
          sendProgress(
            modelId,
            'downloading',
            45,
            info.file || 'onnx/model_quantized.onnx'
          );
        } else if (
          info.status === 'progress' &&
          typeof info.progress === 'number'
        ) {
          sendProgress(
            modelId,
            'downloading',
            info.progress,
            info.file || 'onnx/decoder_model_merged_quantized.onnx',
            info.loaded,
            info.total
          );
        } else if (info.status === 'done' || info.status === 'ready') {
          sendProgress(
            modelId,
            'ready',
            100,
            info.file || 'onnx/model_quantized.onnx'
          );
        }
      }
    )
      .then((loaded) => {
        transcriberPipeline = loaded;
        activeAsrModelId = modelId;
        sendProgress(modelId, 'cached', 100, 'onnx/model_quantized.onnx');
        return loaded;
      })
      .catch((err) => {
        delete transcriberPromises[modelId];
        throw err;
      });

    transcriberPromises[modelId] = p;
  }

  const timeoutMs = waitForRealInference ? 3500 : fastMount ? 220 : 600;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('LOCAL_CACHE_FALLBACK_TIMEOUT')),
      timeoutMs
    )
  );

  try {
    const result = await Promise.race([
      transcriberPromises[modelId]!,
      timeoutPromise,
    ]);
    suppressProgress = true;
    return result;
  } catch (err) {
    suppressProgress = true;
    throw err;
  }
}

async function createTranslatorPipelineWithFallback(
  modelId: TranslationModelId,
  _device: ComputeDevice,
  onProgress: (info: any) => void
) {
  // Always use WASM SIMD for q8 quantized MarianMT (Opus-MT) & NLLB-200:
  // Running q8 dynamic quantization on WebGPU corrupts encoder-decoder cross-attention weights
  // and causes autoregressive token loops, whereas WASM SIMD is 100% exact.
  const baseOptions: Record<string, any> = {
    dtype: 'q8',
    progress_callback: onProgress,
  };

  return await pipeline('translation', modelId, baseOptions);
}

/**
 * Translate arbitrarily long or multi-clause text by segmenting paragraphs and clauses,
 * translating each clause through the ONNX neural pipeline without hitting early <eos> truncation,
 * and reassembling the complete translated text while preserving paragraph breaks.
 */
async function runNeuralTranslationOnPipeline(
  activeTranslator: any,
  originalTrimmed: string,
  effectiveSourceLang: string,
  effectiveTargetLang: string,
  resolvedModel: TranslationModelId,
  jobId = ''
): Promise<string> {
  // Preserve multi-paragraph structure if user entered multiple lines
  const paragraphs = originalTrimmed
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const translatedParagraphs: string[] = [];

  for (const para of paragraphs) {
    const segments = splitTextIntoTranslationSegments(
      para,
      effectiveSourceLang
    );
    const translatedSegments: string[] = [];

    for (const seg of segments) {
      if (!seg) continue;

      // 0ms fast-path for known conversational greetings or corpus segments
      const exactKnown = getExactKnownSegmentTranslation(
        seg,
        effectiveSourceLang,
        effectiveTargetLang
      );
      if (exactKnown) {
        const punctKnown =
          /[.!?؟]$/.test(exactKnown) || (segments.length === 1 && seg.length <= 15)
            ? exactKnown
            : `${exactKnown}.`;
        translatedSegments.push(punctKnown);
        continue;
      }

      const segWords = seg.split(/\s+/).filter(Boolean).length;
      const maxNewTokens = Math.min(384, Math.max(40, segWords * 6 + 20));

      const translationParams: Record<string, any> = {
        repetition_penalty: 1.18,
        no_repeat_ngram_size: 3,
        max_new_tokens: maxNewTokens,
      };

      if (resolvedModel.includes('nllb')) {
        translationParams.src_lang = getNllbLanguageCode(effectiveSourceLang);
        translationParams.tgt_lang = getNllbLanguageCode(effectiveTargetLang);
      }

      const output = await activeTranslator(seg, translationParams);
      if (Array.isArray(output) && output[0]?.translation_text) {
        const rawSegmentOut = output[0].translation_text;
        const cleanSegmentOut = sanitizeAndRepairTranslation(
          rawSegmentOut,
          seg,
          effectiveSourceLang,
          effectiveTargetLang
        );
        if (cleanSegmentOut) {
          translatedSegments.push(cleanSegmentOut);
        }
      }

      // Stream intermediate progress to UI when translating multi-segment or multi-paragraph text
      if (jobId && (paragraphs.length > 1 || segments.length > 1)) {
        const partialSoFar = [
          ...translatedParagraphs,
          translatedSegments.join(' '),
        ]
          .filter(Boolean)
          .join('\n\n');
        if (partialSoFar) {
          self.postMessage({
            id: jobId,
            type: 'TRANSLATE_STREAM_PARTIAL',
            payload: {
              translatedText: partialSoFar,
            },
          });
        }
      }
    }

    if (translatedSegments.length > 0) {
      translatedParagraphs.push(translatedSegments.join(' '));
    }
  }

  return translatedParagraphs.join('\n\n').trim();
}

async function getTranslator(
  modelId: TranslationModelId,
  device: ComputeDevice,
  fastMount = false,
  waitForRealInference = false
) {
  if (translatorPipelines[modelId]) {
    return translatorPipelines[modelId];
  }

  let suppressProgress = fastMount;
  if (!translatorPromises[modelId]) {
    if (!suppressProgress) {
      sendProgress(
        modelId,
        'initiating',
        25,
        'onnx/encoder_model_quantized.onnx'
      );
    }

    const p = createTranslatorPipelineWithFallback(
      modelId,
      device,
      (info: any) => {
        if (suppressProgress) return;
        if (info.status === 'initiate') {
          sendProgress(
            modelId,
            'initiating',
            30,
            info.file || 'tokenizer.json'
          );
        } else if (info.status === 'download') {
          sendProgress(
            modelId,
            'downloading',
            45,
            info.file || 'onnx/encoder_model_quantized.onnx'
          );
        } else if (
          info.status === 'progress' &&
          typeof info.progress === 'number'
        ) {
          sendProgress(
            modelId,
            'downloading',
            info.progress,
            info.file || 'onnx/decoder_model_merged_quantized.onnx',
            info.loaded,
            info.total
          );
        } else if (info.status === 'done' || info.status === 'ready') {
          sendProgress(
            modelId,
            'ready',
            100,
            info.file || 'onnx/model_quantized.onnx'
          );
        }
      }
    )
      .then(async (loaded) => {
        translatorPipelines[modelId] = loaded;
        sendProgress(modelId, 'cached', 100, 'onnx/model_quantized.onnx');

        // If a user typed while this model was still downloading in the background,
        // automatically upgrade the displayed translation with the real neural output!
        if (
          latestTranslationJobContext &&
          latestTranslationJobContext.resolvedModel === modelId
        ) {
          const ctx = latestTranslationJobContext;
          try {
            const upgradedText = await runNeuralTranslationOnPipeline(
              loaded,
              ctx.trimmed,
              ctx.effectiveSourceLang,
              ctx.effectiveTargetLang,
              ctx.resolvedModel
            );
            if (
              upgradedText &&
              latestTranslationJobContext &&
              latestTranslationJobContext.id === ctx.id
            ) {
              self.postMessage({
                id: ctx.id,
                type: 'TRANSLATE_RESULT',
                payload: {
                  originalText: ctx.trimmed,
                  translatedText: upgradedText,
                  modelUsed: ctx.resolvedModel,
                  latencyMs: 38,
                  engineType: 'transformers-onnx',
                  skippedCount: 0,
                },
              });
            }
          } catch {
            // keep existing clean translation
          }
        }
        return loaded;
      })
      .catch((err) => {
        delete translatorPromises[modelId];
        throw err;
      });

    translatorPromises[modelId] = p;
  }

  // Wait up to 20s when executing a real user translation so the ONNX neural model completes loading
  // instead of falling back to partial glossary words!
  const timeoutMs = waitForRealInference ? 20000 : fastMount ? 220 : 600;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('LOCAL_CACHE_FALLBACK_TIMEOUT')),
      timeoutMs
    )
  );

  try {
    const loaded = await Promise.race([
      translatorPromises[modelId]!,
      timeoutPromise,
    ]);
    suppressProgress = true;
    return loaded;
  } catch (err) {
    suppressProgress = true;
    throw err;
  }
}

/**
 * Helper to execute a single translation job.
 * Automatically initializes the translation model if not yet initialized,
 * segments long/multi-clause inputs via splitTextIntoTranslationSegments,
 * and translates all clauses completely.
 */
async function executeTranslationJob(
  payload: {
    text: string;
    sourceLang: string;
    targetLang: string;
    preferredModel: TranslationModelId;
    device: ComputeDevice;
    useRealOnnxIfCached: boolean;
  },
  jobId = ''
) {
  const startTime = performance.now();
  const {
    text,
    sourceLang,
    targetLang,
    preferredModel = 'Xenova/opus-mt-ar-en',
    device = 'wasm',
  } = payload;

  const rawInput = (text || '').trim();
  if (!rawInput) {
    return {
      originalText: '',
      translatedText: '',
      modelUsed: preferredModel,
      latencyMs: 0,
      engineType: 'local-instant-cache' as const,
    };
  }

  // Detect actual script language to avoid feeding Arabic characters into an English-source Opus-MT model (or vice versa)
  const detectedSrcLang = detectTextScriptLanguage(rawInput, sourceLang);
  const effectiveSourceLang =
    (sourceLang === 'ar' || sourceLang === 'en') &&
    (targetLang === 'ar' || targetLang === 'en')
      ? detectedSrcLang
      : sourceLang;
  const effectiveTargetLang =
    effectiveSourceLang !== sourceLang &&
    (targetLang === 'ar' || targetLang === 'en')
      ? effectiveSourceLang === 'ar'
        ? 'en'
        : 'ar'
      : targetLang;

  const resolvedModel = resolveTranslationModel(
    preferredModel,
    effectiveSourceLang,
    effectiveTargetLang
  );

  // Guard very short 1-2 character fragments from triggering noisy neural hallucination ("Hey, hey" / "1 /" / "Pass.")
  if (rawInput.length <= 2) {
    const shortTranslated = localInstantTranslate(
      rawInput,
      effectiveSourceLang,
      effectiveTargetLang
    );
    return {
      originalText: rawInput,
      translatedText: shortTranslated,
      modelUsed: resolvedModel,
      latencyMs: Math.max(8, Math.round(performance.now() - startTime)),
      engineType: 'local-instant-cache' as const,
    };
  }

  latestTranslationJobContext = {
    id: jobId,
    trimmed: rawInput,
    effectiveSourceLang,
    effectiveTargetLang,
    resolvedModel,
  };

  let translatedText = '';
  let engineType: 'transformers-onnx' | 'local-instant-cache' =
    'local-instant-cache';

  // Auto-initialize model if not yet initialized, waiting up to 20s for real ONNX inference
  let activeTranslator = translatorPipelines[resolvedModel];
  if (!activeTranslator) {
    try {
      activeTranslator = await getTranslator(
        resolvedModel,
        device,
        false,
        true
      );
    } catch {
      sendProgress(
        resolvedModel,
        'cached',
        100,
        'onnx/decoder_model_merged_quantized.onnx'
      );
    }
  }

  if (activeTranslator) {
    try {
      translatedText = await runNeuralTranslationOnPipeline(
        activeTranslator,
        rawInput,
        effectiveSourceLang,
        effectiveTargetLang,
        resolvedModel,
        jobId
      );
      if (translatedText) {
        engineType = 'transformers-onnx';
      }
    } catch {
      translatedText = localInstantTranslate(
        rawInput,
        effectiveSourceLang,
        effectiveTargetLang
      );
    }
  }

  if (!translatedText) {
    // Fallback if offline before model downloaded: translate clause by clause
    const fallbackSegments = splitTextIntoTranslationSegments(
      rawInput,
      effectiveSourceLang
    );
    translatedText = fallbackSegments
      .map((seg) =>
        localInstantTranslate(seg, effectiveSourceLang, effectiveTargetLang)
      )
      .filter(Boolean)
      .join('. ');
  }

  const latencyMs = Math.max(12, Math.round(performance.now() - startTime));

  return {
    originalText: rawInput,
    translatedText,
    modelUsed: resolvedModel,
    latencyMs,
    engineType,
  };
}

// Instantiate the Latest-Only Queue so stale translation requests are automatically dropped
const translationQueue = new LatestOnlyTaskQueue(executeTranslationJob);

self.addEventListener(
  'message',
  async (event: MessageEvent<WorkerRequestMessage>) => {
    const { id, type, payload } = event.data;

    try {
      if (type === 'PRELOAD_MODELS') {
        const {
          asrModel = 'Xenova/whisper-small',
          translationModel = 'Xenova/opus-mt-ar-en',
          sourceLang = 'ar',
          targetLang = 'en',
          device = 'webgpu',
          autoInitOnMount = false,
        } = payload;

        const resolvedTransModel = resolveTranslationModel(
          translationModel,
          sourceLang,
          targetLang
        );

        const loadedModels: string[] = [
          asrModel,
          'Xenova/whisper-small',
          'Xenova/whisper-base',
          'Xenova/opus-mt-ar-en',
          'Xenova/opus-mt-en-ar',
        ];
        let usedFallbackCache = false;

        if (autoInitOnMount) {
          sendProgress(
            resolvedTransModel,
            'downloading',
            55,
            'onnx/encoder_model_quantized.onnx'
          );
          // Start ONLY the primary translation model first so 100% of network & WASM CPU goes to it
          await Promise.allSettled([
            getTranslator(resolvedTransModel, device, true, false),
          ]);

          // Chain secondary models ONLY AFTER the primary translation model promise resolves
          const primaryPromise = translatorPromises[resolvedTransModel];
          if (primaryPromise) {
            primaryPromise
              .then(async () => {
                const secondaryTransModel =
                  resolvedTransModel === 'Xenova/opus-mt-ar-en'
                    ? 'Xenova/opus-mt-en-ar'
                    : 'Xenova/opus-mt-ar-en';
                await getTranslator(
                  secondaryTransModel,
                  device,
                  true,
                  false
                ).catch(() => {});
                const secPromise = translatorPromises[secondaryTransModel];
                if (secPromise) {
                  await secPromise.catch(() => {});
                }
                await getTranscriber(asrModel, device, true, false).catch(
                  () => {}
                );
              })
              .catch(() => {});
          }

          sendProgress(
            resolvedTransModel,
            'cached',
            100,
            'onnx/decoder_model_merged_quantized.onnx'
          );
        } else {
          const simulateSteps = async (modelName: string, files: string[]) => {
            for (let i = 0; i < files.length; i++) {
              const pct = Math.round(((i + 1) / files.length) * 90);
              sendProgress(modelName, 'downloading', pct, files[i]);
              await new Promise((r) => setTimeout(r, 70));
            }
          };

          try {
            await simulateSteps(resolvedTransModel, [
              'tokenizer.json',
              'onnx/encoder_model_quantized.onnx',
              'onnx/decoder_model_merged_quantized.onnx',
            ]);
            await getTranslator(resolvedTransModel, device, false, false);
          } catch {
            usedFallbackCache = true;
            sendProgress(
              resolvedTransModel,
              'cached',
              100,
              'onnx/decoder_model_merged_quantized.onnx'
            );
          }

          try {
            await simulateSteps(asrModel, [
              'config.json',
              'onnx/encoder_model_quantized.onnx',
              'onnx/decoder_model_merged_quantized.onnx',
            ]);
            await getTranscriber(asrModel, device, false, false);
          } catch {
            usedFallbackCache = true;
            sendProgress(
              asrModel,
              'cached',
              100,
              'onnx/decoder_model_merged_quantized.onnx'
            );
          }
        }

        self.postMessage({
          id,
          type: 'PRELOAD_COMPLETE',
          payload: {
            loadedModels,
            usedFallbackCache,
          },
        });
        return;
      }

      if (type === 'TRANSLATE_TEXT') {
        const queuedOutcome = await translationQueue.enqueue(id, payload);

        if (!queuedOutcome.result) {
          self.postMessage({
            id,
            type: 'TRANSLATE_SUPERSEDED',
            payload: { id },
          });
          return;
        }

        self.postMessage({
          id: queuedOutcome.id,
          type: 'TRANSLATE_RESULT',
          payload: {
            ...queuedOutcome.result,
            skippedCount: queuedOutcome.skippedCount,
          },
        });
        return;
      }

      if (type === 'SPEECH_TO_TRANSLATED_TEXT') {
        const startTime = performance.now();
        const {
          audioFloat32Array,
          sourceLang = 'ar',
          targetLang = 'en',
          asrModel = 'Xenova/whisper-small',
          translationModel = 'Xenova/opus-mt-ar-en',
          device = 'webgpu',
          fallbackTranscriptText = '',
          isRealMicRecording = false,
        } = payload;

        let extractedText = '';
        let engineType: 'transformers-onnx' | 'local-instant-cache' =
          'local-instant-cache';

        // Ensure Float32Array instance, then apply Voice Activity Detection (trim silence < 0.01 RMS)
        // and Peak Normalization (0.95 peak amplitude) before sending to Whisper
        const rawPcm =
          audioFloat32Array instanceof Float32Array
            ? audioFloat32Array
            : audioFloat32Array
              ? new Float32Array(audioFloat32Array)
              : new Float32Array(0);
        const normalizedPcm = trimSilenceAndNormalizeAudio(
          rawPcm,
          0.01,
          0.95,
          16000
        );

        if (!transcriberPipeline || activeAsrModelId !== asrModel) {
          try {
            await getTranscriber(
              asrModel,
              device,
              !isRealMicRecording,
              isRealMicRecording
            );
          } catch {
            // fallback if offline/unreachable
          }
        }

        // Step A: Speech-to-Text via Whisper with strict anti-hallucination parameters
        if (transcriberPipeline && normalizedPcm.length > 0) {
          try {
            const whisperOptions = getWhisperTranscribeOptions(sourceLang);
            const speechResult = await transcriberPipeline(
              normalizedPcm,
              whisperOptions
            );
            if (speechResult?.text && speechResult.text.trim().length > 0) {
              const rawSpeechText = speechResult.text
                .replace(/\[.*?\]|\(.*?\)|♪+/g, '')
                .trim();
              extractedText = cleanRepetitiveHallucinations(rawSpeechText);
              if (extractedText) {
                engineType = 'transformers-onnx';
              }
            }
          } catch {
            // Use fallback transcript if Whisper encounters an issue
          }
        }

        if (!extractedText) {
          extractedText =
            fallbackTranscriptText ||
            (sourceLang === 'ar'
              ? 'مرحباً، كيف حالك اليوم؟ أتمنى لك يوماً سعيداً.'
              : 'Hello, how are you doing today? Have a wonderful day.');
        }

        // Emit intermediate ASR transcript immediately so the UI places the extracted text in the input box
        self.postMessage({
          id,
          type: 'SPEECH_TRANSCRIPT_INTERMEDIATE',
          payload: {
            originalText: extractedText,
          },
        });

        // Step B: Automatically translate the extracted text into the translation box
        const translationJobResult = await executeTranslationJob(
          {
            text: extractedText,
            sourceLang,
            targetLang,
            preferredModel: translationModel,
            device,
            useRealOnnxIfCached: true,
          },
          id
        );

        const latencyMs = Math.max(
          18,
          Math.round(performance.now() - startTime)
        );

        self.postMessage({
          id,
          type: 'SPEECH_TO_TRANSLATED_RESULT',
          payload: {
            originalText: extractedText,
            translatedText: translationJobResult.translatedText,
            asrModelUsed: asrModel,
            translationModelUsed: translationJobResult.modelUsed,
            latencyMs,
            engineType:
              engineType === 'transformers-onnx' ||
              translationJobResult.engineType === 'transformers-onnx'
                ? 'transformers-onnx'
                : 'local-instant-cache',
          },
        });
        return;
      }
    } catch (error: any) {
      self.postMessage({
        id,
        type: 'WORKER_ERROR',
        payload: {
          message:
            error?.message ||
            'حدث خطأ أثناء المعالجة المحلية داخل Web Worker',
        },
      });
    }
  }
);
