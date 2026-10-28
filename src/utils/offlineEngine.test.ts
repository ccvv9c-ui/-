import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_MODELS,
  resampleAudioLinear,
  computeAudioRMS,
  trimSilenceAndNormalizeAudio,
  getWhisperPipelineOptions,
  getWhisperTranscribeOptions,
  generateSyntheticSpeechWaveform,
  resolveTranslationModel,
  getNllbLanguageCode,
  getSpeechRecognitionLang,
  resolveActiveSpeechEngine,
  getWhisperAudioConstraints,
  detectTextScriptLanguage,
  normalizeArabicOrthography,
  prepareTextForNeuralTranslation,
  splitTextIntoTranslationSegments,
  hasRepetitiveHallucinationLoop,
  cleanRepetitiveHallucinations,
  sanitizeAndRepairTranslation,
  LatestOnlyTaskQueue,
  localInstantTranslate,
  calculatePerformanceMetrics,
} from './offlineEngine.ts';
import { getUITranslations } from './uiTranslations.ts';
import { canRegisterServiceWorkerInEnv } from './pwaRegister.ts';

test('canRegisterServiceWorkerInEnv blocks SW registration on proxied ais-dev run.app and iframes to prevent redirect errors', () => {
  assert.equal(
    canRegisterServiceWorkerInEnv({
      hasServiceWorkerSupport: true,
      isCrossOriginIframe: false,
      hostname: 'ais-dev-yhhgk26pvacndkfswblghv-372237764138.europe-west3.run.app',
      protocol: 'https:',
    }),
    false
  );
  assert.equal(
    canRegisterServiceWorkerInEnv({
      hasServiceWorkerSupport: true,
      isCrossOriginIframe: true,
      hostname: 'localhost',
      protocol: 'http:',
    }),
    false
  );
  assert.equal(
    canRegisterServiceWorkerInEnv({
      hasServiceWorkerSupport: true,
      isCrossOriginIframe: false,
      hostname: 'localhost',
      protocol: 'http:',
    }),
    true
  );
  assert.equal(
    canRegisterServiceWorkerInEnv({
      hasServiceWorkerSupport: true,
      isCrossOriginIframe: false,
      hostname: 'fast-translation-assistant.vercel.app',
      protocol: 'https:',
    }),
    true
  );
});

test('getUITranslations supports both Arabic (RTL) and English (LTR) interface languages', () => {
  const ar = getUITranslations('ar');
  const en = getUITranslations('en');

  assert.equal(ar.dir, 'rtl');
  assert.equal(ar.appTitle, 'مساعد الترجمه السريع');
  assert.equal(ar.translateBtn, 'ترجمة النص');

  assert.equal(en.dir, 'ltr');
  assert.equal(en.appTitle, 'Fast Translation Assistant');
  assert.equal(en.translateBtn, 'Translate Text');
});

test('whisper-tiny is completely removed and whisper-base + whisper-small are configured', () => {
  const asrModels = AI_MODELS.filter((m) => m.category === 'asr');
  const ids = asrModels.map((m) => m.id);
  assert.equal(ids.includes('Xenova/whisper-tiny' as any), false);
  assert.deepEqual(ids, ['Xenova/whisper-base', 'Xenova/whisper-small']);
});

test('normalizeArabicOrthography normalizes everyday Arabic Hamzas and Ta-Marbuta without breaking real Ha words', () => {
  const raw =
    'انا طالب في كليه الهندسه واحب اللغه العربيه والانجليزيه الحمدلله والمياه صافيه';
  const norm = normalizeArabicOrthography(raw);
  assert.equal(
    norm,
    'أنا طالب في كلية الهندسة وأحب اللغة العربية والإنجليزية الحمد لله والمياه صافية'
  );
});

test('splitTextIntoTranslationSegments preserves subordinate clauses and prepositional phrases while splitting unpunctuated run-on multi-clauses', () => {
  // 1. Subordinate clause with "لأنني أحتاج" and "في المعنى" must stay intact in a single coherent segment
  const subordinateSentence =
    'أريد أن أترجم نصوص طويلة وعديدة وليس نصوص قصيرة وغير عملية لأنني أحتاج إلى استخدام هذا التطبيق في العمل والدراسة يومياً بدون أي تقطيع أو نقص في المعنى.';
  const subSegs = splitTextIntoTranslationSegments(subordinateSentence, 'ar');
  assert.equal(subSegs.length, 1);
  assert.ok(subSegs[0].includes('لأنني أحتاج'));
  assert.ok(subSegs[0].includes('في المعنى.'));

  // 2. Unpunctuated multi-clause conversational & descriptive Arabic text splits cleanly at independent boundaries
  const runOnAr =
    'السلام عليكم كيف حالك يا اخي الكريم انا اسمي جعفر الصادق وانا طالب في كلية الهندسة قسم الحاسوب واحب البرمجة ما هو انطباعك حول هذا المجال';
  const arSegs = splitTextIntoTranslationSegments(runOnAr, 'ar');
  assert.ok(arSegs.length >= 3);
  assert.equal(arSegs[0], 'السلام عليكم.');
  assert.equal(arSegs[1], 'كيف حالك يا أخي الكريم؟');
  assert.equal(arSegs[arSegs.length - 1], 'ما هو انطباعك حول هذا المجال؟');

  // 3. Unpunctuated multi-clause English text splits cleanly
  const runOnEn =
    'Hello my friend how are you doing today I want to travel tomorrow to Baghdad to attend a scientific conference and I hope to see you there what is your impression about this field';
  const enSegs = splitTextIntoTranslationSegments(runOnEn, 'en');
  assert.ok(enSegs.length >= 4);
  assert.equal(enSegs[0], 'Hello my friend.');
  assert.equal(enSegs[1], 'How are you doing today?');
  assert.equal(enSegs[enSegs.length - 1], 'What is your impression about this field?');
});

test('prepareTextForNeuralTranslation fixes MarianTokenizer lowercase/unpunctuated English & Arabic prefix bugs', () => {
  assert.equal(prepareTextForNeuralTranslation('hello', 'en'), 'Hello.');
  assert.equal(
    prepareTextForNeuralTranslation('good morning', 'en'),
    'Good morning.'
  );
  assert.equal(prepareTextForNeuralTranslation('thanks', 'en'), 'Thanks.');
  assert.equal(prepareTextForNeuralTranslation('please', 'en'), 'Please.');
  assert.equal(
    prepareTextForNeuralTranslation('how are you', 'en'),
    'How are you?'
  );
  assert.equal(
    prepareTextForNeuralTranslation('how are y', 'en'),
    'How are you?'
  );

  // Incomplete Arabic typing prefixes that previously produced "Tuberculosis" ("السل") or "Salsa" ("السلا")
  assert.equal(
    prepareTextForNeuralTranslation('السل', 'ar'),
    'السلام عليكم.'
  );
  assert.equal(
    prepareTextForNeuralTranslation('السلا', 'ar'),
    'السلام عليكم.'
  );
  assert.equal(
    prepareTextForNeuralTranslation('السلام علي', 'ar'),
    'السلام عليكم.'
  );
  assert.equal(prepareTextForNeuralTranslation('كيف حا', 'ar'), 'كيف حالك؟');
});

test('hasRepetitiveHallucinationLoop and cleanRepetitiveHallucinations fix repetition loops while preserving paragraphs and sentence boundaries', () => {
  const loopedText =
    'هل أنت أحب أن أحب أن أحب أن أحب أن أحب أن أحب أن أحب أن أحب أن أحب أن أحب أن أحب أن';
  assert.equal(
    hasRepetitiveHallucinationLoop(loopedText, 'Hey, how are you?'),
    true
  );

  const cleaned = cleanRepetitiveHallucinations(loopedText);
  assert.equal(cleaned.includes('أحب أن أحب أن'), false);
  assert.equal(cleaned, 'هل أنت');

  // Consecutive duplicate word cleanup ("شكرا جزيلا جزيلا لكم.")
  assert.equal(
    cleanRepetitiveHallucinations('شكرا جزيلا جزيلا لكم.'),
    'شكرا جزيلا لكم.'
  );

  // Cross-sentence identical words must NOT be deleted ("I went to the university. The university is big.")
  const crossSentence = 'I went to the university. The university is big.';
  assert.equal(cleanRepetitiveHallucinations(crossSentence), crossSentence);

  // Multi-paragraph newlines must be preserved
  const multiPara = 'First paragraph here.\nSecond paragraph here.';
  assert.equal(cleanRepetitiveHallucinations(multiPara), multiPara);

  // UN-corpus numbered list prefix cleanup ("7 - الاتصالات.")
  assert.equal(
    cleanRepetitiveHallucinations('7 - الاتصالات.'),
    'الاتصالات.'
  );

  // UN-corpus symbol hallucinations ("& & & & &", "& مُنْسِج", "سُنّ الخير", "دال -", "باء - الإسناد")
  assert.equal(hasRepetitiveHallucinationLoop('& & & & &', 'hello'), true);
  assert.equal(hasRepetitiveHallucinationLoop('& مُنْسِج', 'hey'), true);
  assert.equal(
    hasRepetitiveHallucinationLoop('باء - الإسناد', 'please'),
    true
  );
  assert.equal(hasRepetitiveHallucinationLoop('دال -', 'thanks'), true);

  assert.equal(
    sanitizeAndRepairTranslation('& & & & &', 'hello', 'en', 'ar'),
    'مرحباً'
  );
  assert.equal(
    sanitizeAndRepairTranslation('& مُنْسِج', 'hey', 'en', 'ar'),
    'مرحباً'
  );
  assert.equal(
    sanitizeAndRepairTranslation('سُنّ الخير', 'good morning', 'en', 'ar'),
    'صباح الخير'
  );
  assert.equal(
    sanitizeAndRepairTranslation('دال -', 'thanks', 'en', 'ar'),
    'شكراً'
  );
  assert.equal(
    sanitizeAndRepairTranslation('باء - الإسناد', 'please', 'en', 'ar'),
    'من فضلك'
  );
  assert.equal(
    sanitizeAndRepairTranslation('Tuberculosis', 'السل', 'ar', 'en'),
    'Peace be upon you'
  );

  const repairedEnToAr = sanitizeAndRepairTranslation(
    loopedText,
    'Hey, how are you?',
    'en',
    'ar'
  );
  assert.equal(repairedEnToAr, 'مرحباً، كيف حالك؟');
});

test('detectTextScriptLanguage accurately detects Arabic vs Latin script to prevent wrong-direction model loops', () => {
  assert.equal(detectTextScriptLanguage('مرحبا كيف حالك', 'en'), 'ar');
  assert.equal(detectTextScriptLanguage('Hey, how are you?', 'ar'), 'en');
});

test('getSpeechRecognitionLang returns ar-IQ for Arabic and en-US for English', () => {
  assert.equal(getSpeechRecognitionLang('ar'), 'ar-IQ');
  assert.equal(getSpeechRecognitionLang('en'), 'en-US');
  assert.equal(getSpeechRecognitionLang('fr'), 'fr-FR');
});

test('resolveActiveSpeechEngine switches to whisper-offline when offline or explicitly selected', () => {
  assert.equal(
    resolveActiveSpeechEngine('dual-native', true, true),
    'native-web-speech'
  );
  assert.equal(
    resolveActiveSpeechEngine('dual-native', false, true),
    'whisper-offline'
  );
  assert.equal(
    resolveActiveSpeechEngine('whisper-offline', true, true),
    'whisper-offline'
  );
  assert.equal(
    resolveActiveSpeechEngine('dual-native', true, false),
    'whisper-offline'
  );
});

test('getWhisperAudioConstraints enforces echoCancellation, noiseSuppression, autoGainControl, 1ch, 16kHz', () => {
  const constraints = getWhisperAudioConstraints();
  assert.equal(constraints.echoCancellation, true);
  assert.equal(constraints.noiseSuppression, true);
  assert.equal(constraints.autoGainControl, true);
  assert.equal(constraints.channelCount, 1);
  assert.equal(constraints.sampleRate, 16000);
});

test('resampleAudioLinear resamples 48000Hz to 16000Hz accurately', () => {
  const input = new Float32Array(4800); // 0.1s at 48kHz
  for (let i = 0; i < input.length; i++) {
    input[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
  }
  const output = resampleAudioLinear(input, 48000, 16000);
  assert.equal(output.length, 1600);
  assert.ok(Math.abs(output[0] - input[0]) < 1e-5);
});

test('computeAudioRMS returns 0 for silent buffer and positive value for synthetic speech', () => {
  const silent = new Float32Array(512);
  assert.equal(computeAudioRMS(silent), 0);

  const synthetic = generateSyntheticSpeechWaveform(1.0, 16000);
  assert.equal(synthetic.length, 16000);
  const rms = computeAudioRMS(synthetic);
  assert.ok(rms > 0.05 && rms <= 1.0);
});

test('getWhisperPipelineOptions selects { device: webgpu, dtype: q4 } when navigator.gpu is available and wasm otherwise', () => {
  assert.deepEqual(getWhisperPipelineOptions(true, 'webgpu'), {
    device: 'webgpu',
    dtype: 'q4',
  });
  assert.deepEqual(getWhisperPipelineOptions(false, 'webgpu'), {
    device: 'wasm',
    dtype: 'q8',
  });
  assert.deepEqual(getWhisperPipelineOptions(true, 'wasm'), {
    device: 'wasm',
    dtype: 'q8',
  });
});

test('trimSilenceAndNormalizeAudio trims leading/trailing silence (< 0.01 RMS) and peak-normalizes to 0.95', () => {
  // 1600 samples leading silence (0.002), 3200 samples quiet speech (peak 0.15), 1600 samples trailing silence (0.001)
  const raw = new Float32Array(6400);
  for (let i = 0; i < 1600; i++) raw[i] = 0.002;
  for (let i = 1600; i < 4800; i++) {
    raw[i] = 0.15 * Math.sin((2 * Math.PI * 220 * (i - 1600)) / 16000);
  }
  for (let i = 4800; i < 6400; i++) raw[i] = 0.001;

  const processed = trimSilenceAndNormalizeAudio(raw, 0.01, 0.95, 16000);
  assert.ok(processed.length > 0 && processed.length <= 3200);

  let maxPeak = 0;
  for (let i = 0; i < processed.length; i++) {
    const abs = Math.abs(processed[i]);
    if (abs > maxPeak) maxPeak = abs;
  }
  assert.ok(Math.abs(maxPeak - 0.95) < 1e-4);

  // Completely silent buffer (< 0.01 RMS) returns empty Float32Array
  const allSilence = new Float32Array(1600).fill(0.003);
  assert.equal(trimSilenceAndNormalizeAudio(allSilence, 0.01, 0.95, 16000).length, 0);
});

test('getWhisperTranscribeOptions returns strict anti-hallucination Whisper config', () => {
  assert.deepEqual(getWhisperTranscribeOptions('ar'), {
    language: 'arabic',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
    no_repeat_ngram_size: 3,
    return_timestamps: false,
  });
  assert.deepEqual(getWhisperTranscribeOptions('en'), {
    language: 'english',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
    no_repeat_ngram_size: 3,
    return_timestamps: false,
  });
});

test('resolveTranslationModel selects Opus-MT for ar<->en and NLLB-200 for multilingual', () => {
  assert.equal(
    resolveTranslationModel('Xenova/opus-mt-ar-en', 'ar', 'en'),
    'Xenova/opus-mt-ar-en'
  );
  assert.equal(
    resolveTranslationModel('Xenova/opus-mt-ar-en', 'en', 'ar'),
    'Xenova/opus-mt-en-ar'
  );
  assert.equal(
    resolveTranslationModel('Xenova/opus-mt-ar-en', 'ar', 'fr'),
    'Xenova/nllb-200-distilled-600M'
  );
  assert.equal(
    resolveTranslationModel('Xenova/nllb-200-distilled-600M', 'ar', 'en'),
    'Xenova/nllb-200-distilled-600M'
  );
});

test('getNllbLanguageCode returns accurate NLLB codes (arb_Arab, eng_Latn, etc.)', () => {
  assert.equal(getNllbLanguageCode('ar'), 'arb_Arab');
  assert.equal(getNllbLanguageCode('en'), 'eng_Latn');
  assert.equal(getNllbLanguageCode('fr'), 'fra_Latn');
  assert.equal(getNllbLanguageCode('es'), 'spa_Latn');
  assert.equal(getNllbLanguageCode('de'), 'deu_Latn');
});

test('LatestOnlyTaskQueue drops intermediate requests and only executes latest pending request', async () => {
  const executedInputs: string[] = [];

  const queue = new LatestOnlyTaskQueue<string, string>(async (text) => {
    executedInputs.push(text);
    await new Promise((r) => setTimeout(r, 30));
    return `translated:${text}`;
  });

  const p1 = queue.enqueue('req-1', 'م');
  const p2 = queue.enqueue('req-2', 'مر');
  const p3 = queue.enqueue('req-3', 'مرح');
  const p4 = queue.enqueue('req-4', 'مرحبا');

  const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4]);

  assert.deepEqual(executedInputs, ['م', 'مرحبا']);
  assert.equal(r1.result, 'translated:م');
  assert.equal(r2.result, undefined);
  assert.equal(r3.result, undefined);
  assert.equal(r4.result, 'translated:مرحبا');
  assert.equal(r4.skippedCount, 2);
});

test('localInstantTranslate translates Arabic corpus and glossary words without hallucinating on 2-char inputs', () => {
  const sampleAr =
    'تمت معالجة الصوت وتحويله إلى نص محلياً بالكامل عبر نموذج Whisper داخل المتصفح دون الحاجة للاتصال بالإنترنت، مما يضمن الخصوصية التامة والسرعة الفائقة.';
  const translated = localInstantTranslate(sampleAr, 'ar', 'en');
  assert.ok(translated.includes('Whisper model inside the browser'));

  const wordTranslation = localInstantTranslate('مرحباً شكراً', 'ar', 'en');
  assert.equal(wordTranslation, 'Hello Thank you');

  const shortPrefix = localInstantTranslate('مر', 'ar', 'en');
  assert.equal(shortPrefix, 'Hello');
});

test('calculatePerformanceMetrics returns formatted speed and valid bounds', () => {
  const metrics = calculatePerformanceMetrics(120, 45, 'webgpu', 165);
  assert.ok(metrics.tokensPerSec >= 185);
  assert.equal(metrics.memoryLimitMB, 608);
  assert.ok(metrics.formattedSpeed.endsWith('/s'));
});
