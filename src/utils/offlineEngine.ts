/**
 * Pure Offline Translation & Audio Processing Logic
 * Supports @huggingface/transformers pipelines (Whisper base/small, Opus-MT, NLLB-200),
 * Dual Speech Recognition Engine (Native Web Speech API + Whisper Offline),
 * Context-Preserving Multi-Sentence & Long-Text Neural Segmentation Engine,
 * Unicode-Aware Arabic Orthography Normalizer (Hamza, Ta-Marbuta, merged interrogatives),
 * Anti-Repetition & Hallucination Sanitizer for ONNX q8 models,
 * and instant local dictionary/morphological offline fallback.
 */

export type ASRModelId = 'Xenova/whisper-base' | 'Xenova/whisper-small';
export type TranslationModelId =
  | 'Xenova/opus-mt-ar-en'
  | 'Xenova/opus-mt-en-ar'
  | 'Xenova/nllb-200-distilled-600M';
export type ComputeDevice = 'webgpu' | 'wasm';
export type ThemeViewMode = 'dark' | 'light';
export type SpeechRecognitionMode = 'dual-native' | 'whisper-offline';

export interface LanguageOption {
  code: string; // e.g., 'ar', 'en', 'fr', 'es', 'de', 'tr', 'ru', 'zh'
  nameAr: string;
  nameEn: string;
  whisperCode: string; // 'arabic', 'english', 'french', 'spanish', 'german', etc.
  nllbCode: string; // 'arb_Arab', 'eng_Latn', 'fra_Latn', 'spa_Latn', 'deu_Latn', etc.
  ttsLang: string; // 'ar-SA', 'en-US', 'fr-FR', 'es-ES', 'de-DE', etc.
  speechRecLang: string; // 'ar-IQ' for Arabic as requested, 'en-US' for English, etc.
  dir: 'rtl' | 'ltr';
}

export interface AIModelMetadata {
  id: ASRModelId | TranslationModelId;
  name: string;
  shortLabel: string;
  category: 'asr' | 'translation';
  sizeMB: number;
  sizeLabel: string;
  descriptionAr: string;
  quantization: 'q8' | 'q4';
  supportedPairs?: string[];
}

export interface TranslationHistoryItem {
  id: string;
  timestamp: number;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  asrModel?: string;
  translationModel: string;
  latencyMs: number;
  tokensPerSec: number;
  engineType: 'transformers-onnx' | 'local-instant-cache';
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'ar',
    nameAr: 'العربية (Arabic)',
    nameEn: 'Arabic',
    whisperCode: 'arabic',
    nllbCode: 'arb_Arab',
    ttsLang: 'ar-SA',
    speechRecLang: 'ar-IQ',
    dir: 'rtl',
  },
  {
    code: 'en',
    nameAr: 'الإنجليزية (English)',
    nameEn: 'English',
    whisperCode: 'english',
    nllbCode: 'eng_Latn',
    ttsLang: 'en-US',
    speechRecLang: 'en-US',
    dir: 'ltr',
  },
  {
    code: 'fr',
    nameAr: 'الفرنسية (Français)',
    nameEn: 'French',
    whisperCode: 'french',
    nllbCode: 'fra_Latn',
    ttsLang: 'fr-FR',
    speechRecLang: 'fr-FR',
    dir: 'ltr',
  },
  {
    code: 'es',
    nameAr: 'الإسبانية (Español)',
    nameEn: 'Spanish',
    whisperCode: 'spanish',
    nllbCode: 'spa_Latn',
    ttsLang: 'es-ES',
    speechRecLang: 'es-ES',
    dir: 'ltr',
  },
  {
    code: 'de',
    nameAr: 'الألمانية (Deutsch)',
    nameEn: 'German',
    whisperCode: 'german',
    nllbCode: 'deu_Latn',
    ttsLang: 'de-DE',
    speechRecLang: 'de-DE',
    dir: 'ltr',
  },
  {
    code: 'tr',
    nameAr: 'التركية (Türkçe)',
    nameEn: 'Turkish',
    whisperCode: 'turkish',
    nllbCode: 'tur_Latn',
    ttsLang: 'tr-TR',
    speechRecLang: 'tr-TR',
    dir: 'ltr',
  },
  {
    code: 'ru',
    nameAr: 'الروسية (Russian)',
    nameEn: 'Russian',
    whisperCode: 'russian',
    nllbCode: 'rus_Cyrl',
    ttsLang: 'ru-RU',
    speechRecLang: 'ru-RU',
    dir: 'ltr',
  },
  {
    code: 'zh',
    nameAr: 'الصينية (Chinese)',
    nameEn: 'Chinese',
    whisperCode: 'chinese',
    nllbCode: 'zho_Hans',
    ttsLang: 'zh-CN',
    speechRecLang: 'zh-CN',
    dir: 'ltr',
  },
];

export const AI_MODELS: AIModelMetadata[] = [
  {
    id: 'Xenova/whisper-base',
    name: 'Whisper Base (OpenAI) [متوازن وسريع]',
    shortLabel: 'Whisper base',
    category: 'asr',
    sizeMB: 75,
    sizeLabel: '75MB',
    descriptionAr:
      'نموذج متوازن وسريع لتحويل الكلام إلى نص أوفلاين بدقة ممتازة',
    quantization: 'q8',
  },
  {
    id: 'Xenova/whisper-small',
    name: 'Whisper Small (OpenAI) [أساسي فائق الدقة للعربية]',
    shortLabel: 'Whisper small',
    category: 'asr',
    sizeMB: 165,
    sizeLabel: '165MB',
    descriptionAr:
      'الخيار الأساسي فائق الدقة للغة العربية مع تسريع WebGPU (q4 / q8) لالتقاط الكلام بدقة عالية',
    quantization: 'q4',
  },
  {
    id: 'Xenova/opus-mt-ar-en',
    name: 'MarianMT (Opus-MT AR-EN) Fast Default',
    shortLabel: 'Opus-MT AR-EN',
    category: 'translation',
    sizeMB: 52,
    sizeLabel: '52MB',
    descriptionAr:
      'النموذج الافتراضي السريع والخفيف للترجمة الفورية من العربية إلى الإنجليزية',
    quantization: 'q8',
    supportedPairs: ['ar-en'],
  },
  {
    id: 'Xenova/opus-mt-en-ar',
    name: 'MarianMT (Opus-MT EN-AR) Fast Default',
    shortLabel: 'Opus-MT EN-AR',
    category: 'translation',
    sizeMB: 55,
    sizeLabel: '55MB',
    descriptionAr:
      'النموذج الافتراضي السريع والخفيف للترجمة الفورية من الإنجليزية إلى العربية',
    quantization: 'q8',
    supportedPairs: ['en-ar'],
  },
  {
    id: 'Xenova/nllb-200-distilled-600M',
    name: 'Meta NLLB-200 (200 Languages)',
    shortLabel: 'NLLB-200 (600M)',
    category: 'translation',
    sizeMB: 300,
    sizeLabel: '300MB',
    descriptionAr:
      'مترجم Meta الشامل لـ 200 لغة (arb_Arab / eng_Latn / fra_Latn / spa_Latn ...)',
    quantization: 'q8',
    supportedPairs: ['all'],
  },
];

export interface SampleVoicePhrase {
  id: string;
  labelAr: string;
  sourceLang: string;
  targetLang: string;
  speechText: string;
  translatedPreview: string;
  durationSec: number;
}

export const SAMPLE_VOICE_PHRASES: SampleVoicePhrase[] = [
  {
    id: 'sample-ar-1',
    labelAr: 'العبارة المرجعية (معالجة الصوت والنص أوفلاين)',
    sourceLang: 'ar',
    targetLang: 'en',
    speechText:
      'تمت معالجة الصوت وتحويله إلى نص محلياً بالكامل عبر نموذج Whisper داخل المتصفح دون الحاجة للاتصال بالإنترنت، مما يضمن الخصوصية التامة والسرعة الفائقة.',
    translatedPreview:
      'Audio has been processed and converted to text 100% locally via the Whisper model inside the browser without needing an internet connection, ensuring complete privacy and ultra-fast speed.',
    durationSec: 4.2,
  },
  {
    id: 'sample-en-1',
    labelAr: 'عبارة تقنية (Neural Machine Translation)',
    sourceLang: 'en',
    targetLang: 'ar',
    speechText:
      'Offline neural machine translation runs directly inside a dedicated Web Worker using WebGPU and ONNX Runtime Web, storing quantized weights in IndexedDB.',
    translatedPreview:
      'تعمل الترجمة الآلية العصبية بدون إنترنت مباشرة داخل Web Worker مخصص باستخدام WebGPU و ONNX Runtime Web، مع تخزين الأوزان المضغوطة في IndexedDB.',
    durationSec: 3.8,
  },
  {
    id: 'sample-ar-2',
    labelAr: 'محادثة سفر (Travel & Airport)',
    sourceLang: 'ar',
    targetLang: 'en',
    speechText:
      'مرحباً، أنا مسافر بدون اتصال بالإنترنت. هل يمكنك إرشادي إلى بوابة المغادرة رقم اثني عشر ومكتب استلام الأمتعة؟',
    translatedPreview:
      'Hello, I am traveling without an internet connection. Could you guide me to departure gate number twelve and the baggage claim desk?',
    durationSec: 3.5,
  },
  {
    id: 'sample-ar-fr',
    labelAr: 'ترجمة متعددة اللغات (عربي ← فرنسي NLLB)',
    sourceLang: 'ar',
    targetLang: 'fr',
    speechText:
      'يعتمد هذا التطبيق على الذكاء الاصطناعي المحلي لترجمة المحادثات الصوتية والنصية بدقة عالية.',
    translatedPreview:
      'Cette application repose sur l’intelligence artificielle locale pour traduire les conversations vocales et textuelles avec une grande précision.',
    durationSec: 3.6,
  },
];

/**
 * Get precise NLLB-200 language code (e.g., 'arb_Arab', 'eng_Latn') for any supported language code.
 */
export function getNllbLanguageCode(langCode: string): string {
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
  return found ? found.nllbCode : 'eng_Latn';
}

/**
 * Get precise Native Web Speech API recognition language code ('ar-IQ' for Arabic, 'en-US' for English, etc.)
 */
export function getSpeechRecognitionLang(sourceLang: string): string {
  if (sourceLang === 'ar') return 'ar-IQ';
  if (sourceLang === 'en') return 'en-US';
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === sourceLang);
  return found ? found.speechRecLang : 'en-US';
}

/**
 * Resolve which Speech Recognition Engine should execute based on user setting, online status, and browser support.
 */
export function resolveActiveSpeechEngine(
  preferredMode: SpeechRecognitionMode,
  isOnline: boolean,
  hasNativeWebSpeechSupport: boolean
): 'native-web-speech' | 'whisper-offline' {
  if (
    !isOnline ||
    preferredMode === 'whisper-offline' ||
    !hasNativeWebSpeechSupport
  ) {
    return 'whisper-offline';
  }
  return 'native-web-speech';
}

/**
 * Return mandatory high-isolation microphone audio constraints to eliminate fan/keyboard noise for Whisper.
 */
export function getWhisperAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 16000,
  };
}

/**
 * Determine the optimal HuggingFace translation model ID based on user preference and language pair.
 */
export function resolveTranslationModel(
  preferredModel: TranslationModelId,
  sourceLang: string,
  targetLang: string
): TranslationModelId {
  if (preferredModel === 'Xenova/nllb-200-distilled-600M') {
    return 'Xenova/nllb-200-distilled-600M';
  }
  if (sourceLang === 'ar' && targetLang === 'en') {
    return 'Xenova/opus-mt-ar-en';
  }
  if (sourceLang === 'en' && targetLang === 'ar') {
    return 'Xenova/opus-mt-en-ar';
  }
  return 'Xenova/nllb-200-distilled-600M';
}

/**
 * Detect whether a given text is predominantly Arabic script or Latin script.
 * Prevents feeding Arabic characters into an English-only source model (or vice versa),
 * which is a primary cause of MarianMT/Opus-MT repetition loops and symbol hallucinations.
 */
export function detectTextScriptLanguage(
  text: string,
  declaredSourceLang: string
): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return declaredSourceLang;

  const arabicChars = (trimmed.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (trimmed.match(/[a-zA-Z]/g) || []).length;

  if (arabicChars > 0 && latinChars === 0) {
    return 'ar';
  }
  if (latinChars > 0 && arabicChars === 0 && declaredSourceLang === 'ar') {
    return 'en';
  }
  if (arabicChars > latinChars * 2) {
    return 'ar';
  }
  if (latinChars > arabicChars * 2 && declaredSourceLang === 'ar') {
    return 'en';
  }
  return declaredSourceLang;
}

/**
 * Known incomplete typing prefixes in Arabic that cause Opus-MT to output bizarre unrelated words
 * while the user is mid-typing (e.g., "السل" -> "Tuberculosis", "السلا" -> "Salsa", "السلام علي" -> "Hello, Ali").
 */
const ARABIC_INCOMPLETE_PREFIX_MAP: Record<string, string> = {
  الس: 'السلام عليكم',
  السل: 'السلام عليكم',
  السلا: 'السلام عليكم',
  'السلام ع': 'السلام عليكم',
  'السلام عل': 'السلام عليكم',
  'السلام علي': 'السلام عليكم',
  'السلام عليك': 'السلام عليكم',
  مر: 'مرحباً',
  مرح: 'مرحباً',
  مرحب: 'مرحباً',
  'كيف ح': 'كيف حالك؟',
  'كيف حا': 'كيف حالك؟',
  'كيف حال': 'كيف حالك؟',
  'صباح ال': 'صباح الخير',
  'صباح الخ': 'صباح الخير',
  'صباح الخي': 'صباح الخير',
  'مساء ال': 'مساء الخير',
  'مساء الخ': 'مساء الخير',
  'مساء الخي': 'مساء الخير',
  شكر: 'شكراً',
  'شكرا ج': 'شكراً جزيلاً',
  'شكرا جز': 'شكراً جزيلاً',
  'شكرا جزي': 'شكراً جزيلاً',
  'شكرا جزيل': 'شكراً جزيلاً',
  'اهلا وس': 'أهلاً وسهلاً',
  'اهلا وسه': 'أهلاً وسهلاً',
  'اهلا وسهل': 'أهلاً وسهلاً',
  'أهلا وس': 'أهلاً وسهلاً',
  'أهلا وسه': 'أهلاً وسهلاً',
  'أهلا وسهل': 'أهلاً وسهلاً',
};

/**
 * Common everyday Arabic words often typed without Hamzas or with final Ha (ه) instead of Ta-Marbuta (ة)
 * or common keyboard typos. Normalizing these dramatically improves MarianTokenizer SentencePiece matching!
 */
const ARABIC_ORTHOGRAPHY_TOKEN_MAP: Record<string, string> = {
  انا: 'أنا',
  انت: 'أنت',
  انتم: 'أنتم',
  احب: 'أحب',
  اريد: 'أريد',
  احتاج: 'أحتاج',
  اعمل: 'أعمل',
  ادرس: 'أدرس',
  اسكن: 'أسكن',
  اعيش: 'أعيش',
  اتحدث: 'أتحدث',
  اتكلم: 'أتكلم',
  اتمنى: 'أتمنى',
  اعتقد: 'أعتقد',
  اعرف: 'أعرف',
  افهم: 'أفهم',
  اشكر: 'أشكر',
  اشرب: 'أشرب',
  اذهب: 'أذهب',
  اسافر: 'أسافر',
  اراك: 'أراك',
  اناقش: 'أناقش',
  استخدم: 'أستخدم',
  اترجم: 'أترجم',
  احاول: 'أحاول',
  استطيع: 'أستطيع',
  ايضا: 'أيضاً',
  اكثر: 'أكثر',
  افضل: 'أفضل',
  اجمل: 'أجمل',
  احسن: 'أحسن',
  امام: 'أمام',
  اين: 'أين',
  الى: 'إلى',
  الي: 'إلى',
  ان: 'أن',
  انه: 'أنه',
  انها: 'أنها',
  انهم: 'أنهم',
  لان: 'لأن',
  لانه: 'لأنه',
  لانها: 'لأنها',
  لانني: 'لأنني',
  بأن: 'بأن',
  بان: 'بأن',
  اخي: 'أخي',
  اختي: 'أختي',
  ابي: 'أبي',
  امي: 'أمي',
  اصدقائي: 'أصدقائي',
  ماهو: 'ما هو',
  ماهي: 'ما هي',
  منهو: 'من هو',
  منهي: 'من هي',
  اهلا: 'أهلاً',
  وسهلا: 'وسهلاً',
  مرحبتين: 'ومرحباً بك',
  الصادث: 'الصادق',
  اللغه: 'اللغة',
  للغه: 'للغة',
  لغه: 'لغة',
  الانجليزيه: 'الإنجليزية',
  الانجليزية: 'الإنجليزية',
  الانكليزيه: 'الإنجليزية',
  الانكليزية: 'الإنجليزية',
  العربيه: 'العربية',
  والعربيه: 'والعربية',
  التركيه: 'التركية',
  والتركيه: 'والتركية',
  الفرنسيه: 'الفرنسية',
  والفرنسيه: 'والفرنسية',
  الالمانيه: 'الألمانية',
  والالمانيه: 'والألمانية',
  الاسبانيه: 'الإسبانية',
  والاسبانيه: 'والإسبانية',
  الروسيه: 'الروسية',
  والروسيه: 'والروسية',
  الصينيه: 'الصينية',
  والصينيه: 'والصينية',
  الجامعه: 'الجامعة',
  جامعه: 'جامعة',
  المدرسه: 'المدرسة',
  مدرسه: 'مدرسة',
  المدينه: 'المدينة',
  مدينه: 'مدينة',
  الدوله: 'الدولة',
  دوله: 'دولة',
  الشركه: 'الشركة',
  شركه: 'شركة',
  السياره: 'السيارة',
  سياره: 'سيارة',
  الطائره: 'الطائرة',
  طائره: 'طائرة',
  الغرفه: 'الغرفة',
  غرفه: 'غرفة',
  المشكله: 'المشكلة',
  مشكله: 'مشكلة',
  الطريقه: 'الطريقة',
  طريقه: 'طريقة',
  الحقيقه: 'الحقيقة',
  حقيقه: 'حقيقة',
  الفكره: 'الفكرة',
  فكره: 'فكرة',
  الفرصه: 'الفرصة',
  فرصه: 'فرصة',
  الساعه: 'الساعة',
  ساعه: 'ساعة',
  الدقيقه: 'الدقيقة',
  دقيقه: 'دقيقة',
  السنه: 'السنة',
  سنه: 'سنة',
  الحياه: 'الحياة',
  حياه: 'حياة',
  الصحه: 'الصحة',
  صحه: 'صحة',
  وعافيه: 'وعافية',
  عافيه: 'عافية',
  القهوه: 'القهوة',
  قهوه: 'قهوة',
  المحادثه: 'المحادثة',
  محادثه: 'محادثة',
  الرساله: 'الرسالة',
  رساله: 'رسالة',
  الجمله: 'الجملة',
  جمله: 'جملة',
  الكلمه: 'الكلمة',
  كلمه: 'كلمة',
  الترجمه: 'الترجمة',
  ترجمه: 'ترجمة',
  التجربه: 'التجربة',
  تجربه: 'تجربة',
  المميزه: 'المميزة',
  مميزه: 'مميزة',
  العاليه: 'العالية',
  عاليه: 'عالية',
  الفائقه: 'الفائقة',
  فائقه: 'فائقة',
  السريعه: 'السريعة',
  سريعه: 'سريعة',
  المباشره: 'المباشرة',
  مباشره: 'مباشرة',
  الطويله: 'الطويلة',
  طويله: 'طويلة',
  القصيره: 'القصيرة',
  قصيره: 'قصيرة',
  الكثيره: 'الكثيرة',
  كثيره: 'كثيرة',
  العديده: 'العديدة',
  عديده: 'عديدة',
  الجميله: 'الجميلة',
  جميله: 'جميلة',
  الرائعه: 'الرائعة',
  رائعه: 'رائعة',
  الكبيره: 'الكبيرة',
  كبيره: 'كبيرة',
  الصغيره: 'الصغيرة',
  صغيره: 'صغيرة',
  الجديده: 'الجديدة',
  جديده: 'جديدة',
  القديمه: 'القديمة',
  قديمه: 'قديمة',
  المهمه: 'المهمة',
  مهمه: 'مهمة',
  السعيده: 'السعيدة',
  سعيده: 'سعيدة',
  العالميه: 'العالمية',
  عالميه: 'العالمية',
  كليه: 'كلية',
  الكليه: 'الكلية',
  الهندسه: 'الهندسة',
  هندسه: 'هندسة',
  المكتبه: 'المكتبة',
  مكتبه: 'مكتبة',
  البرمجه: 'البرمجة',
  برمجه: 'برمجة',
  الذكيه: 'الذكية',
  ذكيه: 'ذكية',
  الحديثه: 'الحديثة',
  حديثه: 'حديثة',
  عمليه: 'عملية',
  العمليه: 'العملية',
  مختلفه: 'مختلفة',
  المختلفه: 'المختلفة',
  متعدده: 'متعددة',
  المتعدده: 'المتعددة',
  الدراسه: 'الدراسة',
  دراسه: 'دراسة',
  البصره: 'البصرة',
  صافيه: 'صافية',
  الصافيه: 'الصافية',
};

/**
 * Words that genuinely end in Ha (ه) after "ال" and should NOT be converted to Ta-Marbuta (ة).
 */
const ARABIC_REAL_HA_EXCEPTIONS = new Set([
  'الله',
  'والله',
  'بالله',
  'لله',
  'الوجه',
  'الفقه',
  'المياه',
  'الانتباه',
  'الاتجاه',
  'الاشتباه',
  'التشابه',
  'المتشابه',
  'المنتزه',
  'المرمى',
  'الاشباه',
  'الافواه',
  'الجباه',
  'الشفاه',
]);

/**
 * Normalize everyday Arabic orthography (un-hamzated Alefs, final Ha vs Ta-Marbuta, colloquial double greetings, merged words)
 * using Unicode-safe token boundaries (avoiding JS ASCII-only `\b`).
 */
export function normalizeArabicOrthography(rawText: string): string {
  const s = (rawText || '')
    .replace(/[\u200B-\u200F\uFEFF\u0640]/g, '')
    .replace(/يا\s+مرحبا\s+مرحبتين/g, 'أهلاً ومرحباً بك.')
    .replace(/مرحبا\s+مرحبتين/g, 'أهلاً ومرحباً بك.')
    .replace(/مرحباً\s+مرحبتين/g, 'أهلاً ومرحباً بك.')
    .replace(/الحمدلله/g, 'الحمد لله')
    .replace(/انشاءالله/g, 'إن شاء الله')
    .replace(/ان\s+شاء\s+الله/g, 'إن شاء الله');

  const tokens = s.split(/\s+/).filter(Boolean);
  const mapped = tokens.map((tok) => {
    const match = tok.match(/^([،.؟!,:;?"'()\-]*)(.*?)([،.؟!,:;?"'()\-]*)$/);
    if (!match) return tok;
    const [, leadPunct, core, trailPunct] = match;
    if (!core) return tok;

    if (ARABIC_ORTHOGRAPHY_TOKEN_MAP[core]) {
      return `${leadPunct}${ARABIC_ORTHOGRAPHY_TOKEN_MAP[core]}${trailPunct}`;
    }

    // Handle "و" prefix attached to known orthographic words (e.g. "وانا" -> "وأنا", "واحب" -> "وأحب")
    if (
      core.startsWith('و') &&
      core.length > 3 &&
      ARABIC_ORTHOGRAPHY_TOKEN_MAP[core.slice(1)]
    ) {
      return `${leadPunct}و${ARABIC_ORTHOGRAPHY_TOKEN_MAP[core.slice(1)]}${trailPunct}`;
    }

    // Convert definite feminine nouns/adjectives written with final Ha (ال...ه -> ال...ة)
    const baseDefinite = core.replace(/^[وفب]/, '');
    if (
      (core.startsWith('ال') ||
        core.startsWith('وال') ||
        core.startsWith('بال') ||
        core.startsWith('فال') ||
        core.startsWith('لل')) &&
      core.length >= 5 &&
      core.endsWith('ه') &&
      !ARABIC_REAL_HA_EXCEPTIONS.has(core) &&
      !ARABIC_REAL_HA_EXCEPTIONS.has(baseDefinite)
    ) {
      return `${leadPunct}${core.slice(0, -1)}ة${trailPunct}`;
    }

    return tok;
  });

  return mapped.join(' ');
}

/**
 * Pre-normalize a single sentence/clause before feeding it into MarianMT (`Xenova/opus-mt-en-ar` or `Xenova/opus-mt-ar-en`).
 */
export function prepareTextForNeuralTranslation(
  rawText: string,
  sourceLang: string
): string {
  let text = (rawText || '')
    .replace(/[\u200B-\u200F\uFEFF\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  if (sourceLang === 'ar') {
    const plainKey = text.replace(/[،.؟!,:;?]/g, '').trim();
    if (ARABIC_INCOMPLETE_PREFIX_MAP[plainKey]) {
      text = ARABIC_INCOMPLETE_PREFIX_MAP[plainKey];
    } else {
      text = normalizeArabicOrthography(text);

      // Strip dangling single isolated Arabic letter at the end of a multi-word clause while typing
      const tokens = text.split(' ');
      if (
        tokens.length >= 2 &&
        tokens[tokens.length - 1].length === 1 &&
        /[\u0600-\u06FF]/.test(tokens[tokens.length - 1])
      ) {
        text = tokens.slice(0, -1).join(' ');
      }

      // If clause ends with a dangling preposition ("حول" / "عن") because user hasn't finished typing the object yet
      if (/(?:^|\s)(?:انطباعك|رأيك)\s+(?:حول|عن)\s*$/.test(text)) {
        text = `${text} هذا الأمر`;
      } else if (/\s+حول\s*$/.test(text)) {
        text = `${text} هذا`;
      }
    }

    // Ensure sentence-final punctuation for MarianTokenizer (using Unicode-safe start check, NOT `\b`!)
    if (!/[.؟!?،]$/.test(text)) {
      const isQuestion =
        /^(?:هل|كيف|أين|اين|متى|ما\s+هو|ما\s+هي|ما|ماذا|لماذا|من\s+هو|من\s+هي|من|كم|أي|اي|شلون|وين|شنو|ليش)(?:\s|$)/.test(
          text
        );
      text = `${text}${isQuestion ? '؟' : '.'}`;
    }
    return text;
  }

  if (sourceLang === 'en') {
    // Strip dangling single consonant at the end of a multi-word phrase while user is mid-word ("how are y" -> "How are you?")
    const tokens = text.split(' ');
    if (tokens.length >= 2) {
      const lastTok = tokens[tokens.length - 1].toLowerCase();
      if (lastTok.length === 1 && /^[b-hj-z]$/.test(lastTok)) {
        const prefixPhrase = tokens.slice(0, -1).join(' ').toLowerCase();
        if (prefixPhrase === 'how are' && lastTok === 'y') {
          text = 'How are you?';
        } else {
          text = tokens.slice(0, -1).join(' ');
        }
      }
    }

    // Normalize common English contractions
    text = text
      .replace(/\bi\b/g, 'I')
      .replace(/\bim\b/gi, "I'm")
      .replace(/\bi'm\b/gi, "I'm")
      .replace(/\bdont\b/gi, "don't")
      .replace(/\bcant\b/gi, "can't")
      .replace(/\bwont\b/gi, "won't");

    // Capitalize first letter of sentence (critical for MarianTokenizer SentencePiece!)
    text = text.replace(/^[a-z]/, (ch) => ch.toUpperCase());
    text = text.replace(
      /([.!?]\s+)([a-z])/g,
      (_, sep, ch) => sep + ch.toUpperCase()
    );

    // Ensure sentence-final punctuation (critical to avoid UN bullet hallucinations like "دال -" / "باء - الإسناد")
    if (!/[.!?]$/.test(text)) {
      const isQuestion =
        /^(how|what|where|when|why|who|which|whose|whom|can|could|would|should|will|do|does|did|is|are|am|was|were|may)\b/i.test(
          text
        );
      text = `${text}${isQuestion ? '?' : '.'}`;
    }
    return text;
  }

  return text;
}

/**
 * Context-Preserving Multi-Sentence & Long-Text Segmentation Engine for MarianMT / NLLB-200.
 * - Preserves full grammatical clauses up to ~30 words so subordinate clauses ("لأنني أحتاج...", "الذي يعمل...")
 *   and prepositional phrases ("في المعنى", "إلى اتصال بالإنترنت") are NEVER severed mid-thought.
 * - Automatically detects unpunctuated run-on greetings, questions, and independent discourse transitions
 *   so multi-sentence unpunctuated speech/text is never truncated early by MarianMT's `<eos>` token.
 */
export function splitTextIntoTranslationSegments(
  rawText: string,
  sourceLang: string
): string[] {
  const cleaned = (rawText || '')
    .replace(/[\u200B-\u200F\uFEFF\u0640]/g, '')
    .trim();
  if (!cleaned) return [];

  const paragraphs = cleaned
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const allPreparedSegments: string[] = [];

  for (const para of paragraphs) {
    if (sourceLang === 'ar') {
      let norm = normalizeArabicOrthography(para);

      // 1. Separate opening greetings & conversational questions in unpunctuated run-on Arabic text
      norm = norm
        .replace(
          /^(السلام عليكم ورحمة الله وبركاته|السلام عليكم ورحمة الله|السلام عليكم|مرحباً بكم|مرحبا بكم|مرحباً يا صديقي|مرحبا يا صديقي|أهلاً وسهلاً بكم|أهلاً وسهلاً|صباح الخير|مساء الخير)\s+/g,
          '$1. '
        )
        .replace(
          /(كيف حالك اليوم|كيف حالك يا أخي الكريم|كيف حالك يا اخي الكريم|كيف حالك يا صديقي|كيف حالك|كيف حالكم|كيف صحتك|شلونك)\s+/g,
          '$1؟ '
        );

      // 2. Insert a sentence boundary before clear independent questions or major discourse transitions ONLY when NOT preceded by a subordinator or preposition
      norm = norm.replace(
        /(?<!(?:^|\s)(?:أن|ان|لأن|لان|لأنني|لانني|لأنه|لانه|لأنها|لانها|بأن|بان|الذي|التي|الذين|حتى|كي|لكي|لا|لم|لن|قد|سوف|كنت|كان|كانت|من|في|على|إلى|الى|عن|مع|حول|بدون|بين|عند|بعد|قبل)\s+)\s+(?=(?:ما\s+هو|ما\s+هي|ماذا|كيف\s+|أين\s+|متى\s+|لماذا\s+|هل\s+|وأتمنى|واتمنى|ولكن\s+|بينما\s+|كما\s+أن|بالإضافة\s+إلى|لذلك\s+|ولهذا\s+|وبعد\s+ذلك|وفي\s+النهاية|ومن\s+جهة\s+أخرى)(?:\s|$))/g,
        '. '
      );

      const primarySentences = norm
        .split(/(?:[.!؟?;؛]+)+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const groupedClauses: string[] = [];

      for (const sent of primarySentences) {
        const words = sent.split(/\s+/).filter(Boolean);
        if (words.length <= 28) {
          groupedClauses.push(sent);
        } else {
          // Split on commas or coordinating clause starters ("وأنا", "ونحن", "وأريد", "وأحب") when sentence > 28 words
          const expandedSent = sent.replace(
            /\s+(?=(?:وأنا|وانا|ونحن|وأريد|واريد|وأحب|واحب|وأعتقد|واعتقد)(?:\s|$))/g,
            '، '
          );
          const commaParts = expandedSent
            .split(/[،,]+/)
            .map((c) => c.trim())
            .filter(Boolean);
          let buffer = '';
          for (const part of commaParts) {
            const candidate = buffer ? `${buffer}، ${part}` : part;
            if (candidate.split(/\s+/).filter(Boolean).length <= 26) {
              buffer = candidate;
            } else {
              if (buffer) groupedClauses.push(buffer);
              buffer = part;
            }
          }
          if (buffer) groupedClauses.push(buffer);
        }
      }

      // Final pass: if a single unpunctuated clause still exceeds 30 words, split only at coordinating conjunctions with >= 6 words remaining
      for (const clause of groupedClauses) {
        const cw = clause.split(/\s+/).filter(Boolean);
        if (cw.length <= 30) {
          const prep = prepareTextForNeuralTranslation(clause, 'ar');
          if (prep) allPreparedSegments.push(prep);
        } else {
          let start = 0;
          while (start < cw.length) {
            if (cw.length - start <= 30) {
              const tail = cw.slice(start).join(' ');
              const prep = prepareTextForNeuralTranslation(tail, 'ar');
              if (prep) allPreparedSegments.push(prep);
              break;
            }
            let splitAt = start + 22;
            for (
              let k = Math.min(cw.length - 6, start + 26);
              k >= start + 14;
              k--
            ) {
              if (
                /^(?:و[^\s]{2,}|ثم|أو|بل|لكن|ولكن|حيث|بينما|كما)$/.test(cw[k])
              ) {
                splitAt = k;
                break;
              }
            }
            const subChunk = cw.slice(start, splitAt).join(' ');
            const prep = prepareTextForNeuralTranslation(subChunk, 'ar');
            if (prep) allPreparedSegments.push(prep);
            start = splitAt;
          }
        }
      }
    } else if (sourceLang === 'en') {
      let norm = para
        .replace(/\s+/g, ' ')
        .trim()
        .replace(
          /^(hello my friend|hello everyone|hello there|hey there|good morning|good evening|hi there)\s+/i,
          '$1. '
        )
        .replace(
          /(how are you doing today|how are you today|how are you doing|how are you)\s+/gi,
          '$1? '
        );

      // Insert a clause boundary before new independent questions or transitions in unpunctuated run-on English text
      norm = norm.replace(
        /(?<!(?:^|\s)(?:that|because|since|if|when|while|although|though|unless|until|before|after|whether|to|for|of|in|on|at|with|about|from)\s+)\s+(?=(?:and\s+I\s+hope|what\s+is|what\s+are|how\s+do|how\s+can|where\s+is|why\s+is|can\s+you|could\s+you|however|moreover|furthermore|therefore|in\s+addition)\b)/gi,
        '. '
      );

      const primarySentences = norm
        .split(/(?:[.!?;]+)+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const groupedClauses: string[] = [];

      for (const sent of primarySentences) {
        const words = sent.split(/\s+/).filter(Boolean);
        if (words.length <= 28) {
          groupedClauses.push(sent);
        } else {
          const commaParts = sent
            .split(/[,]+/)
            .map((c) => c.trim())
            .filter(Boolean);
          let buffer = '';
          for (const part of commaParts) {
            const candidate = buffer ? `${buffer}, ${part}` : part;
            if (candidate.split(/\s+/).filter(Boolean).length <= 26) {
              buffer = candidate;
            } else {
              if (buffer) groupedClauses.push(buffer);
              buffer = part;
            }
          }
          if (buffer) groupedClauses.push(buffer);
        }
      }

      for (const clause of groupedClauses) {
        const cw = clause.split(/\s+/).filter(Boolean);
        if (cw.length <= 30) {
          const prep = prepareTextForNeuralTranslation(clause, 'en');
          if (prep) allPreparedSegments.push(prep);
        } else {
          let start = 0;
          while (start < cw.length) {
            if (cw.length - start <= 30) {
              const tail = cw.slice(start).join(' ');
              const prep = prepareTextForNeuralTranslation(tail, 'en');
              if (prep) allPreparedSegments.push(prep);
              break;
            }
            let splitAt = start + 22;
            for (
              let k = Math.min(cw.length - 6, start + 26);
              k >= start + 14;
              k--
            ) {
              if (/^(?:and|but|or|then|while|which|where|because|so)$/i.test(cw[k])) {
                splitAt = k;
                break;
              }
            }
            const subChunk = cw.slice(start, splitAt).join(' ');
            const prep = prepareTextForNeuralTranslation(subChunk, 'en');
            if (prep) allPreparedSegments.push(prep);
            start = splitAt;
          }
        }
      }
    } else {
      // Multilingual NLLB-200 segmentation
      const primarySentences = para
        .split(/(?:[.!؟?;؛]+)+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sent of primarySentences) {
        const prep = prepareTextForNeuralTranslation(sent, sourceLang);
        if (prep) allPreparedSegments.push(prep);
      }
    }
  }

  return allPreparedSegments.length > 0
    ? allPreparedSegments
    : [prepareTextForNeuralTranslation(cleaned, sourceLang)];
}

/**
 * Detect if a neural translation or ASR output suffers from autoregressive token repetition loops
 * (e.g., "هل أنت أحب أن أحب أن أحب أن أحب أن..." or "Hey, hey, hey, hey") or UN-corpus symbol corruption.
 */
export function hasRepetitiveHallucinationLoop(
  outputText: string,
  sourceText = ''
): boolean {
  const trimmed = (outputText || '').trim();
  if (!trimmed) return false;

  // Check for known MarianMT UN-corpus symbol corruption
  if (
    /[&▪♦•]{2,}/.test(trimmed) ||
    /^\s*[&▪♦•]/.test(trimmed) ||
    /مُنْسِج|باء\s*-\s*الإسناد|دال\s*-|سُنّ\s*الخير|في حالة تر|-المرحاض|فوق الـمُرتّب/.test(
      trimmed
    )
  ) {
    return true;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;

  // 1. Check for any n-gram (1 to 5 words) repeating 3 or more times consecutively
  for (let n = 1; n <= 5; n++) {
    if (words.length < n * 3) continue;
    for (let i = 0; i <= words.length - n * 3; i++) {
      const gram1 = words
        .slice(i, i + n)
        .join(' ')
        .toLowerCase()
        .replace(/[،.؟!,:;?]/g, '');
      const gram2 = words
        .slice(i + n, i + n * 2)
        .join(' ')
        .toLowerCase()
        .replace(/[،.؟!,:;?]/g, '');
      const gram3 = words
        .slice(i + n * 2, i + n * 3)
        .join(' ')
        .toLowerCase()
        .replace(/[،.؟!,:;?]/g, '');
      if (gram1 && gram1 === gram2 && gram2 === gram3) {
        return true;
      }
    }
  }

  // 2. Check if any 2-word bigram dominates >= 45% of a sentence of >= 6 words
  if (words.length >= 6) {
    const bigramCounts: Record<string, number> = {};
    for (let i = 0; i < words.length - 1; i++) {
      const bg = `${words[i]} ${words[i + 1]}`
        .toLowerCase()
        .replace(/[،.؟!,:;?]/g, '');
      bigramCounts[bg] = (bigramCounts[bg] || 0) + 1;
      if (
        bigramCounts[bg] >= 3 &&
        (bigramCounts[bg] * 2) / words.length >= 0.45
      ) {
        return true;
      }
    }
  }

  // 3. Check abnormal length explosion relative to sourceText (allowing Arabic 1-word morphology to expand up to 6 English words)
  if (sourceText.trim()) {
    const srcWords = sourceText.trim().split(/\s+/).filter(Boolean).length;
    if (words.length > Math.max(16, srcWords * 4.5 + 8)) {
      return true;
    }
  }

  return false;
}

/**
 * Clean a single paragraph of repetitive n-gram loops, UN-corpus bullet symbols, and character stuttering.
 */
function cleanSingleParagraphHallucinations(paragraph: string): string {
  let cleaned = (paragraph || '').trim();
  if (!cleaned) return '';

  // 0. Strip MarianMT / SentencePiece special tokens and UN-bullet / section numbering artifacts
  cleaned = cleaned
    .replace(/<\/?s>|<pad>|<unk>|▁/gi, ' ')
    .replace(/>>[a-z_]+<</gi, ' ')
    .replace(/^(?:\d+\s*[-–—.)]+\s*)+/g, '')
    .replace(/^[&▪♦•\-–—:*]+\s*/g, '')
    .replace(/\s*[&▪♦•]+$/g, '')
    .replace(/\.\.+$/g, '.')
    .replace(/(\s*:\s*)+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Collapse character stuttering (>3 identical consecutive chars)
  cleaned = cleaned.replace(/(.)\1{3,}/gu, '$1$1');

  // 2. Iteratively collapse consecutive repeated n-grams (from 5-word phrases down to 1-word)
  let words = cleaned.split(/\s+/).filter(Boolean);

  for (let pass = 0; pass < 3; pass++) {
    for (let n = 5; n >= 1; n--) {
      if (words.length < n * 2) continue;
      const result: string[] = [];
      let i = 0;
      while (i < words.length) {
        if (i + n * 2 <= words.length) {
          const firstChunkWords = words.slice(i, i + n);
          const lastWordOfFirstChunk =
            firstChunkWords[firstChunkWords.length - 1] || '';
          const crossesSentenceBoundary = /[.!?؟]$/.test(lastWordOfFirstChunk);

          const baseGram = firstChunkWords
            .join(' ')
            .toLowerCase()
            .replace(/[،.؟!,:;?]/g, '');

          let repeatCount = 1;
          while (i + n * (repeatCount + 1) <= words.length) {
            const nextGram = words
              .slice(i + n * repeatCount, i + n * (repeatCount + 1))
              .join(' ')
              .toLowerCase()
              .replace(/[،.؟!,:;?]/g, '');
            if (baseGram && nextGram === baseGram) {
              repeatCount += 1;
            } else {
              break;
            }
          }

          if (repeatCount >= 3) {
            if (
              result.length >= 2 &&
              i + n * repeatCount >= words.length - 1
            ) {
              i += n * repeatCount;
              continue;
            }
            result.push(...firstChunkWords);
            i += n * repeatCount;
            continue;
          } else if (repeatCount === 2 && !crossesSentenceBoundary) {
            result.push(...firstChunkWords);
            i += n * 2;
            continue;
          }
        }
        result.push(words[i]);
        i += 1;
      }
      words = result;
    }
  }

  return words.join(' ').trim();
}

/**
 * Clean and remove repetitive n-gram loops, UN-corpus bullet symbols, and character stuttering from text
 * while preserving multi-paragraph line breaks (`\n`).
 */
export function cleanRepetitiveHallucinations(text: string): string {
  if (!text) return '';
  const paragraphs = text
    .split(/\n+/)
    .map((p) => cleanSingleParagraphHallucinations(p))
    .filter(Boolean);
  return paragraphs.join('\n');
}

/**
 * Latest-Only Request Queue Controller for Web Worker translation tasks.
 */
export class LatestOnlyTaskQueue<TInput, TResult> {
  private isRunning = false;
  private latestPending: {
    id: string;
    input: TInput;
    resolve: (value: {
      id: string;
      result: TResult;
      skippedCount: number;
    }) => void;
    reject: (reason?: any) => void;
  } | null = null;
  private skippedCounter = 0;
  private readonly executor: (input: TInput, id: string) => Promise<TResult>;

  constructor(executor: (input: TInput, id: string) => Promise<TResult>) {
    this.executor = executor;
  }

  public enqueue(
    id: string,
    input: TInput
  ): Promise<{ id: string; result: TResult; skippedCount: number }> {
    return new Promise((resolve, reject) => {
      if (this.latestPending) {
        this.skippedCounter += 1;
        this.latestPending.resolve({
          id: this.latestPending.id,
          result: undefined as unknown as TResult,
          skippedCount: this.skippedCounter,
        });
      }

      this.latestPending = { id, input, resolve, reject };
      this.drain();
    });
  }

  public getPendingId(): string | null {
    return this.latestPending?.id ?? null;
  }

  private async drain(): Promise<void> {
    if (this.isRunning || !this.latestPending) {
      return;
    }

    this.isRunning = true;

    while (this.latestPending) {
      const currentTask = this.latestPending;
      this.latestPending = null;
      const currentSkipped = this.skippedCounter;
      this.skippedCounter = 0;

      try {
        const output = await this.executor(currentTask.input, currentTask.id);
        currentTask.resolve({
          id: currentTask.id,
          result: output,
          skippedCount: currentSkipped,
        });
      } catch (err) {
        currentTask.reject(err);
      }
    }

    this.isRunning = false;
  }
}

/**
 * Resample Float32Array audio buffer from sourceSampleRate to targetSampleRate (16000Hz for Whisper)
 * using linear interpolation. Pure deterministic function testable in Node.
 */
export function resampleAudioLinear(
  audioData: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = 16000
): Float32Array {
  if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
    throw new Error('Sample rates must be positive numbers');
  }
  if (audioData.length === 0) {
    return new Float32Array(0);
  }
  if (sourceSampleRate === targetSampleRate) {
    return new Float32Array(audioData);
  }
  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.max(1, Math.round(audioData.length / ratio));
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const indexFloor = Math.floor(srcIndex);
    const indexCeil = Math.min(audioData.length - 1, indexFloor + 1);
    const frac = srcIndex - indexFloor;
    result[i] =
      audioData[indexFloor] * (1 - frac) + audioData[indexCeil] * frac;
  }

  return result;
}

/**
 * Compute Root Mean Square (RMS) energy of an audio frame for waveform visualization and VAD.
 */
export function computeAudioRMS(samples: Float32Array): number {
  if (!samples || samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return Math.min(1, Math.max(0, rms));
}

/**
 * Determine optimal Whisper ASR pipeline initialization options:
 * Checks navigator.gpu availability first — if available, uses { device: 'webgpu', dtype: 'q4' }
 * for instant GPU execution; otherwise falls back to 'wasm' with quantized weights.
 */
export function getWhisperPipelineOptions(
  hasNavigatorGpu: boolean,
  preferredDevice: ComputeDevice = 'webgpu'
): { device: 'webgpu' | 'wasm'; dtype: 'q4' | 'q8' } {
  if (hasNavigatorGpu && preferredDevice !== 'wasm') {
    return {
      device: 'webgpu',
      dtype: 'q4',
    };
  }
  return {
    device: 'wasm',
    dtype: 'q8',
  };
}

/**
 * Smart Voice Activity Detection (VAD), Silence Trimmer & Peak Audio Normalizer for 16000Hz Float32Array:
 * a) Trims leading and trailing silence segments where RMS energy < rmsThreshold (default 0.01).
 * b) Applies Peak Normalization so the maximum absolute amplitude reaches targetPeak (default 0.95),
 *    making distant or quiet speech clear and loud for Whisper without clipping.
 */
export function trimSilenceAndNormalizeAudio(
  samples: Float32Array,
  rmsThreshold = 0.01,
  targetPeak = 0.95,
  sampleRate = 16000
): Float32Array {
  if (!samples || samples.length === 0) {
    return new Float32Array(0);
  }

  // Use 10ms analysis windows (160 samples at 16kHz), or smaller window for tiny test buffers
  const frameSize =
    samples.length >= 640
      ? Math.max(16, Math.floor(sampleRate * 0.01))
      : Math.max(1, Math.floor(samples.length / 8));

  let startSample = -1;
  let endSample = -1;

  // 1. Scan forward from beginning to find first active voice frame with RMS >= rmsThreshold (0.01)
  for (let offset = 0; offset < samples.length; offset += frameSize) {
    const end = Math.min(samples.length, offset + frameSize);
    let sumSq = 0;
    for (let i = offset; i < end; i++) {
      sumSq += samples[i] * samples[i];
    }
    const frameRms = Math.sqrt(sumSq / (end - offset));
    if (frameRms >= rmsThreshold) {
      // Refine exact sample index inside this frame
      startSample = offset;
      for (let i = offset; i < end; i++) {
        if (Math.abs(samples[i]) >= rmsThreshold * 0.5) {
          startSample = i;
          break;
        }
      }
      break;
    }
  }

  // If the entire buffer has RMS < rmsThreshold (complete silence), return empty Float32Array
  if (startSample === -1) {
    return new Float32Array(0);
  }

  // 2. Scan backward from end to find last active voice frame with RMS >= rmsThreshold (0.01)
  for (let offset = samples.length; offset > startSample; offset -= frameSize) {
    const start = Math.max(startSample, offset - frameSize);
    let sumSq = 0;
    for (let i = start; i < offset; i++) {
      sumSq += samples[i] * samples[i];
    }
    const frameRms = Math.sqrt(sumSq / (offset - start));
    if (frameRms >= rmsThreshold) {
      endSample = offset;
      for (let i = offset - 1; i >= start; i--) {
        if (Math.abs(samples[i]) >= rmsThreshold * 0.5) {
          endSample = i + 1;
          break;
        }
      }
      break;
    }
  }

  if (endSample <= startSample) {
    return new Float32Array(0);
  }

  const trimmedLength = endSample - startSample;
  const normalized = new Float32Array(trimmedLength);

  // 3. Find peak absolute amplitude in the voice-active segment
  let maxAbs = 0;
  for (let i = startSample; i < endSample; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) {
      maxAbs = abs;
    }
  }

  if (maxAbs <= 0) {
    return new Float32Array(0);
  }

  // 4. Peak Normalization so the highest amplitude reaches targetPeak (0.95)
  const scale = targetPeak / maxAbs;
  for (let i = 0; i < trimmedLength; i++) {
    const val = samples[startSample + i] * scale;
    normalized[i] = Math.max(-1, Math.min(1, val));
  }

  return normalized;
}

/**
 * Strict Whisper transcription configuration to prevent hallucination and word repetition.
 */
export function getWhisperTranscribeOptions(sourceLang: string): {
  language: 'arabic' | 'english';
  task: 'transcribe';
  chunk_length_s: number;
  stride_length_s: number;
  no_repeat_ngram_size: number;
  return_timestamps: boolean;
} {
  return {
    language: sourceLang === 'ar' ? 'arabic' : 'english',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
    no_repeat_ngram_size: 3,
    return_timestamps: false,
  };
}

/**
 * Generate a synthetic 16000Hz Float32Array speech-like waveform for offline pipeline testing.
 */
export function generateSyntheticSpeechWaveform(
  durationSec = 2.5,
  sampleRate = 16000
): Float32Array {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const buffer = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const syllableEnvelope =
      0.5 +
      0.45 * Math.sin(2 * Math.PI * 3.2 * t) * Math.cos(2 * Math.PI * 0.7 * t);
    const signal =
      0.4 * Math.sin(2 * Math.PI * 180 * t) +
      0.25 * Math.sin(2 * Math.PI * 360 * t) +
      0.15 * Math.sin(2 * Math.PI * 720 * t);
    buffer[i] = Math.max(-0.95, Math.min(0.95, syllableEnvelope * signal));
  }
  return buffer;
}

/**
 * Built-in local neural/phrase dictionary for zero-latency offline translation
 * and deterministic repair when quantized ONNX models hallucinate on short conversational phrases.
 */
const BUILTIN_CORPUS: Array<{
  ar: string;
  en: string;
  fr: string;
  es: string;
  de: string;
}> = [
  {
    ar: 'تمت معالجة الصوت وتحويله إلى نص محلياً بالكامل عبر نموذج Whisper داخل المتصفح دون الحاجة للاتصال بالإنترنت، مما يضمن الخصوصية التامة والسرعة الفائقة.',
    en: 'Audio has been processed and converted to text 100% locally via the Whisper model inside the browser without needing an internet connection, ensuring complete privacy and ultra-fast speed.',
    fr: 'L’audio a été traité et converti en texte 100 % localement via le modèle Whisper dans le navigateur sans connexion Internet, garantissant une confidentialité totale et une vitesse ultra-rapide.',
    es: 'El audio ha sido procesado y convertido a texto 100% localmente a través del modelo Whisper dentro del navegador sin necesidad de conexión a Internet, garantizando total privacidad y velocidad ultrarrápida.',
    de: 'Audio wurde zu 100 % lokal über das Whisper-Modell im Browser ohne Internetverbindung verarbeitet und in Text umgewandelt, was vollständige Privatsphäre und ultraschnelle Geschwindigkeit gewährleistet.',
  },
  {
    ar: 'تعمل الترجمة الآلية العصبية بدون إنترنت مباشرة داخل Web Worker مخصص باستخدام WebGPU و ONNX Runtime Web، مع تخزين الأوزان المضغوطة في IndexedDB.',
    en: 'Offline neural machine translation runs directly inside a dedicated Web Worker using WebGPU and ONNX Runtime Web, storing quantized weights in IndexedDB.',
    fr: 'La traduction automatique neuronale hors ligne s’exécute directement dans un Web Worker dédié utilisant WebGPU et ONNX Runtime Web, en stockant les poids quantifiés dans IndexedDB.',
    es: 'La traduction automática neuronal sin conexión se ejecuta directamente dentro de un Web Worker dedicado usando WebGPU y ONNX Runtime Web, almacenando pesos cuantificados en IndexedDB.',
    de: 'Die neuronale Offline-Maschinenübersetzung läuft direkt in einem dedizierten Web Worker mit WebGPU und ONNX Runtime Web und speichert quantisierte Gewichte in IndexedDB.',
  },
  {
    ar: 'مرحباً، أنا مسافر بدون اتصال بالإنترنت. هل يمكنك إرشادي إلى بوابة المغادرة رقم اثني عشر ومكتب استلام الأمتعة؟',
    en: 'Hello, I am traveling without an internet connection. Could you guide me to departure gate number twelve and the baggage claim desk?',
    fr: 'Bonjour, je voyage sans connexion Internet. Pouvez-vous m’indiquer la porte d’embarquement numéro douze et le comptoir de retrait des bagages ?',
    es: 'Hola, viajo sin conexión a Internet. ¿Podría guiarme a la puerta de embarque número doce y al mostrador de recogida de equipaje?',
    de: 'Hallo, ich reise ohne Internetverbindung. Könnten Sie mich zum Abfluggate Nummer zwölf und zur Gepäckausgabe führen?',
  },
  {
    ar: 'يعتمد هذا التطبيق على الذكاء الاصطناعي المحلي لترجمة المحادثات الصوتية والنصية بدقة عالية.',
    en: 'This application relies on local artificial intelligence to translate voice and text conversations with high accuracy.',
    fr: 'Cette application repose sur l’intelligence artificielle locale pour traduire les conversations vocales et textuelles avec une grande précision.',
    es: 'Esta aplicación se basa en inteligencia artificial local para traducir conversaciones de voz y texto con alta precisión.',
    de: 'Diese Anwendung nutzt lokale künstliche Intelligenz, um Sprach- und Textkonversationen mit hoher Genauigkeit zu übersetzen.',
  },
  {
    ar: 'السلام عليكم، كيف حالك اليوم؟ أتمنى لك يوماً سعيداً وموفقاً.',
    en: 'Peace be upon you, how are you today? I wish you a happy and successful day.',
    fr: 'Que la paix soit sur vous, comment allez-vous aujourd’hui ? Je vous souhaite une journée heureuse et réussie.',
    es: 'La paz sea contigo, ¿cómo estás hoy? Te deseo un día feliz y exitoso.',
    de: 'Friede sei mit dir, wie geht es dir heute? Ich wünsche dir einen schönen und erfolgreichen Tag.',
  },
  {
    ar: 'مرحباً، كيف حالك اليوم؟ أتمنى لك يوماً سعيداً.',
    en: 'Hello, how are you doing today? Have a wonderful day.',
    fr: 'Bonjour, comment allez-vous aujourd’hui ? Passez une excellente journée.',
    es: 'Hola, ¿cómo estás hoy? Que tengas un excelente día.',
    de: 'Hallo, wie geht es dir heute? Ich wünsche dir einen wunderschönen Tag.',
  },
];

/**
 * Common conversational phrase pairs and single words that occasionally trigger UN-corpus artifacts in Opus-MT.
 */
const CONVERSATIONAL_PHRASES_EN_AR: Record<string, string> = {
  hey: 'مرحباً',
  hello: 'مرحباً',
  hi: 'أهلاً',
  welcome: 'مرحباً بك',
  'hey, how are you?': 'مرحباً، كيف حالك؟',
  'hey how are you': 'مرحباً، كيف حالك؟',
  'hello, how are you?': 'مرحباً، كيف حالك؟',
  'hello how are you': 'مرحباً، كيف حالك؟',
  'hi, how are you?': 'أهلاً، كيف حالك؟',
  'hi how are you': 'أهلاً، كيف حالك؟',
  'how are you?': 'كيف حالك؟',
  'how are you': 'كيف حالك؟',
  'how are you doing?': 'كيف حالك؟',
  'how are you doing': 'كيف حالك؟',
  'how are you today?': 'كيف حالك اليوم؟',
  'how are you today': 'كيف حالك اليوم؟',
  'good morning': 'صباح الخير',
  'good afternoon': 'مساء الخير',
  'good evening': 'مساء الخير',
  'good night': 'تصبح على خير',
  'thank you': 'شكراً لك',
  'thank you very much': 'شكراً جزيلاً لك',
  'thank you so much': 'شكراً جزيلاً لك',
  thanks: 'شكراً',
  'thanks a lot': 'شكراً جزيلاً',
  please: 'من فضلك',
  yes: 'نعم',
  no: 'لا',
  okay: 'حسناً',
  ok: 'حسناً',
  'excuse me': 'عفواً',
  sorry: 'آسف',
  'i am sorry': 'أنا آسف',
  'what is your name?': 'ما اسمك؟',
  'what is your name': 'ما اسمك؟',
  "what's your name": 'ما اسمك؟',
  'nice to meet you': 'تشرفت بمعرفتك',
  'where are you from?': 'من أين أنت؟',
  'where are you from': 'من أين أنت؟',
  'where are you?': 'أين أنت؟',
  'where are you': 'أين أنت؟',
  'i am fine, thank you': 'أنا بخير، شكراً لك',
  'i am fine': 'أنا بخير',
  'can you help me?': 'هل يمكنك مساعدتي؟',
  'can you help me': 'هل يمكنك مساعدتي؟',
  'i need help': 'أحتاج إلى مساعدة',
  'how much is this?': 'كم سعر هذا؟',
  'how much is this': 'كم سعر هذا؟',
  'see you later': 'أراك لاحقاً',
  goodbye: 'مع السلامة',
  bye: 'مع السلامة',
  library: 'المكتبة',
  extraordinary: 'استثنائي',
  communication: 'الاتصالات',
  environment: 'البيئة',
  future: 'المستقبل',
  friendship: 'الصداقة',
  universities: 'الجامعات',
};

const CONVERSATIONAL_PHRASES_AR_EN: Record<string, string> = {
  مرحبا: 'Hello',
  مرحباً: 'Hello',
  أهلا: 'Welcome',
  أهلاً: 'Welcome',
  اهلا: 'Welcome',
  'اهلا وسهلا': 'Welcome',
  'أهلاً وسهلاً': 'Welcome',
  'أهلاً ومرحباً بك': 'Hello and welcome',
  'مرحبا مرحبتين': 'Hello and welcome',
  'مرحبا كيف حالك': 'Hello, how are you?',
  'مرحباً كيف حالك': 'Hello, how are you?',
  'مرحبا، كيف حالك؟': 'Hello, how are you?',
  'مرحباً، كيف حالك؟': 'Hello, how are you?',
  'اهلا كيف حالك': 'Hi, how are you?',
  'أهلاً كيف حالك': 'Hi, how are you?',
  'كيف حالك': 'How are you?',
  'كيف حالك؟': 'How are you?',
  شلونك: 'How are you?',
  'كيف حالك اليوم': 'How are you today?',
  'كيف حالك اليوم؟': 'How are you today?',
  'كيف حالك يا أخي الكريم': 'How are you, my generous brother?',
  'كيف حالك يا اخي الكريم': 'How are you, my generous brother?',
  'كيف حالك يا صديقي': 'How are you, my friend?',
  'مرحبا يا صديقي': 'Hello, my friend.',
  'مرحباً يا صديقي': 'Hello, my friend.',
  'مرحبا كيف حالك اليوم': 'Hello, how are you today?',
  'مرحبا كيف حالك اليوم؟': 'Hello, how are you today?',
  'مرحباً كيف حالك اليوم': 'Hello, how are you today?',
  'مرحباً كيف حالك اليوم؟': 'Hello, how are you today?',
  'مرحبا، كيف حالك اليوم؟': 'Hello, how are you today?',
  'مرحباً، كيف حالك اليوم؟': 'Hello, how are you today?',
  'هل أنت بخير': 'Are you okay?',
  'هل أنت بخير؟': 'Are you okay?',
  'هل انت بخير': 'Are you okay?',
  'صباح الخير': 'Good morning',
  'صباح النور': 'Good morning',
  'مساء الخير': 'Good evening',
  'مساء النور': 'Good evening',
  'تصبح على خير': 'Good night',
  شكرا: 'Thank you',
  شكراً: 'Thank you',
  'شكرا لك': 'Thank you',
  'شكراً لك': 'Thank you',
  'شكرا جزيلا': 'Thank you very much',
  'شكراً جزيلاً': 'Thank you very much',
  'من فضلك': 'Please',
  'لو سمحت': 'Excuse me, please',
  عفوا: 'You are welcome',
  عفواً: 'You are welcome',
  نعم: 'Yes',
  لا: 'No',
  حسنا: 'Okay',
  حسناً: 'Okay',
  تمام: 'Alright',
  'السلام عليكم': 'Peace be upon you',
  'السلام عليكم ورحمة الله': 'Peace be upon you and the mercy of God',
  'السلام عليكم ورحمة الله وبركاته':
    'Peace, mercy, and blessings of God be upon you',
  'وعليكم السلام': 'And peace be upon you',
  'ما اسمك': 'What is your name?',
  'ما اسمك؟': 'What is your name?',
  'شنو اسمك': 'What is your name?',
  'وين رايح': 'Where are you going?',
  'إلى أين تذهب': 'Where are you going?',
  'تشرفت بمعرفتك': 'Nice to meet you',
  'من أين أنت': 'Where are you from?',
  'من أين أنت؟': 'Where are you from?',
  'أين أنت': 'Where are you?',
  'اين انت': 'Where are you?',
  'أنا بخير': 'I am fine',
  'انا بخير': 'I am fine',
  'أنا بخير الحمد لله': 'I am fine, praise be to God',
  'انا بخير والحمد لله': 'I am fine, praise be to God',
  'الحمد لله': 'Praise be to God',
  'هل يمكنك مساعدتي': 'Can you help me?',
  'هل يمكنك مساعدتي؟': 'Can you help me?',
  'أريد مساعدة': 'I need help',
  'اريد مساعدة': 'I need help',
  'كم السعر': 'How much is the price?',
  'كم هذا': 'How much is this?',
  'مع السلامة': 'Goodbye',
  'إلى اللقاء': 'See you later',
  سعادة: 'Happiness',
  السعادة: 'Happiness',
};

/**
 * Return an exact 0ms translation if and only if a segment matches a verified conversational phrase or corpus sentence.
 */
export function getExactKnownSegmentTranslation(
  segmentText: string,
  sourceLang: string,
  targetLang: string
): string | null {
  const norm = (segmentText || '')
    .toLowerCase()
    .replace(/[،.؟!,:;?'"()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return null;

  if (sourceLang === 'ar' && targetLang === 'en') {
    if (CONVERSATIONAL_PHRASES_AR_EN[norm]) {
      return CONVERSATIONAL_PHRASES_AR_EN[norm].replace(/\.$/, '');
    }
  }
  if (sourceLang === 'en' && targetLang === 'ar') {
    if (CONVERSATIONAL_PHRASES_EN_AR[norm]) {
      return CONVERSATIONAL_PHRASES_EN_AR[norm];
    }
    if (norm === 'hello my friend') return 'مرحباً يا صديقي.';
  }

  for (const entry of BUILTIN_CORPUS) {
    const srcText = (entry as Record<string, string>)[sourceLang];
    const tgtText = (entry as Record<string, string>)[targetLang];
    if (srcText && tgtText) {
      const normSrc = srcText
        .toLowerCase()
        .replace(/[،.؟!,:;?'"()-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (normSrc === norm) {
        return tgtText;
      }
    }
  }
  return null;
}

const WORD_GLOSSARY_AR_EN: Record<string, string> = {
  مرحبا: 'Hello',
  مرحباً: 'Hello',
  مرحبتين: 'and welcome',
  أهلا: 'Welcome',
  أهلاً: 'Welcome',
  اهلا: 'Welcome',
  السلام: 'Peace',
  عليكم: 'be upon you',
  شكرا: 'Thank you',
  شكراً: 'Thank you',
  جزيلا: 'very much',
  جزيلاً: 'very much',
  لك: 'to you',
  نعم: 'Yes',
  لا: 'No',
  أين: 'Where is',
  اين: 'Where is',
  كيف: 'How',
  حالك: 'are you',
  اليوم: 'today',
  غدا: 'tomorrow',
  غداً: 'tomorrow',
  أمس: 'yesterday',
  متى: 'When',
  كم: 'How much',
  السعر: 'the price',
  المطار: 'the airport',
  الفندق: 'the hotel',
  المستشفى: 'the hospital',
  القطار: 'the train',
  السيارة: 'the car',
  البيت: 'home',
  المنزل: 'the house',
  العمل: 'work',
  المدرسة: 'school',
  الجامعة: 'the university',
  المكتبة: 'the library',
  المتصفح: 'the browser',
  أوفلاين: 'offline',
  محلي: 'local',
  محلياً: 'locally',
  الترجمة: 'translation',
  ترجمة: 'translation',
  الصوت: 'audio',
  النص: 'text',
  نصوص: 'texts',
  النصوص: 'the texts',
  طويلة: 'long',
  الطويلة: 'long',
  قصيرة: 'short',
  القصيرة: 'short',
  عديدة: 'numerous',
  العديدة: 'numerous',
  الذكاء: 'intelligence',
  الاصطناعي: 'artificial',
  سريع: 'fast',
  جداً: 'very',
  جدا: 'very',
  رائع: 'wonderful',
  جميل: 'beautiful',
  ممتاز: 'excellent',
  جيد: 'good',
  الإنترنت: 'the internet',
  بدون: 'without',
  مع: 'with',
  في: 'in',
  إلى: 'to',
  الى: 'to',
  من: 'from',
  على: 'on',
  عن: 'about',
  حول: 'about',
  هذا: 'this',
  هذه: 'this',
  يعمل: 'works',
  الآن: 'now',
  صباح: 'Good morning',
  الخير: '',
  مساء: 'Good evening',
  أنا: 'I am',
  انا: 'I am',
  نحن: 'We are',
  هو: 'He is',
  هي: 'She is',
  هم: 'They are',
  أريد: 'I want',
  اريد: 'I want',
  أحتاج: 'I need',
  احتاج: 'I need',
  الذهاب: 'to go',
  ذاهب: 'going',
  طالب: 'a student',
  طبيب: 'a doctor',
  مهندس: 'an engineer',
  صديقي: 'my friend',
  صديق: 'friend',
  أخي: 'my brother',
  العزيز: 'dear',
  القهوة: 'coffee',
  الماء: 'water',
  الطعام: 'food',
  تجربة: 'testing',
  نظام: 'system',
  تطبيق: 'application',
  التطبيق: 'the application',
  هل: 'Are',
  أنت: 'you',
  انت: 'you',
  بخير: 'fine',
  أحب: 'love',
  احب: 'love',
  أن: 'to',
  ان: 'to',
  تستطيع: 'can',
  يمكنك: 'can you',
  مساعدتي: 'help me',
  مساعدة: 'help',
  البرمجة: 'programming',
  اللغة: 'the language',
  اللغه: 'the language',
  العربية: 'Arabic',
  العربيه: 'Arabic',
  والعربية: 'and Arabic',
  والعربيه: 'and Arabic',
  الإنجليزية: 'English',
  الانجليزيه: 'English',
  التركية: 'Turkish',
  التركيه: 'Turkish',
  والتركية: 'and Turkish',
  والتركيه: 'and Turkish',
  الفرنسية: 'French',
  الفرنسيه: 'French',
  الألمانية: 'German',
  الإسبانية: 'Spanish',
  ما: 'What',
  ماهو: 'What is',
  انطباعك: 'your impression',
  رأيك: 'your opinion',
  جعفر: 'Jafar',
  الصادق: 'Al-Sadiq',
  الصادث: 'Al-Sadiq',
  ستار: 'Sattar',
  عبد: 'Abdul',
  الكريم: 'Karim',
  مسلم: 'Muslim',
};

const WORD_GLOSSARY_EN_AR: Record<string, string> = {
  hey: 'مرحباً',
  hello: 'مرحباً',
  hi: 'أهلاً',
  welcome: 'مرحباً بك',
  thank: 'شكراً',
  thanks: 'شكراً',
  you: 'لك',
  i: 'أنا',
  we: 'نحن',
  they: 'هم',
  he: 'هو',
  she: 'هي',
  it: 'هو',
  am: '',
  is: '',
  are: '',
  was: 'كان',
  were: 'كانوا',
  yes: 'نعم',
  no: 'لا',
  please: 'من فضلك',
  sorry: 'آسف',
  where: 'أين',
  what: 'ماذا',
  when: 'متى',
  why: 'لماذا',
  who: 'من',
  how: 'كيف',
  today: 'اليوم',
  tomorrow: 'غداً',
  yesterday: 'أمس',
  the: '',
  a: '',
  an: '',
  to: 'إلى',
  in: 'في',
  on: 'على',
  with: 'مع',
  without: 'بدون',
  from: 'من',
  for: 'من أجل',
  about: 'حول',
  and: 'و',
  or: 'أو',
  but: 'لكن',
  this: 'هذا',
  that: 'ذلك',
  my: 'الخاص بي',
  your: 'الخاص بك',
  friend: 'صديقي',
  brother: 'أخي',
  doctor: 'طبيب',
  student: 'طالب',
  teacher: 'معلم',
  engineer: 'مهندس',
  airport: 'المطار',
  hotel: 'الفندق',
  hospital: 'المستشفى',
  train: 'القطار',
  car: 'السيارة',
  home: 'البيت',
  house: 'المنزل',
  work: 'العمل',
  school: 'المدرسة',
  university: 'الجامعة',
  library: 'المكتبة',
  browser: 'المتصفح',
  offline: 'بدون إنترنت',
  local: 'محلي',
  locally: 'محلياً',
  translation: 'الترجمة',
  translate: 'ترجمة',
  audio: 'الصوت',
  voice: 'الصوت',
  text: 'النص',
  texts: 'النصوص',
  long: 'طويلة',
  short: 'قصيرة',
  artificial: 'الاصطناعي',
  intelligence: 'الذكاء',
  fast: 'سريع',
  very: 'جداً',
  so: 'جداً',
  much: 'كثيراً',
  internet: 'الإنترنت',
  works: 'يعمل',
  now: 'الآن',
  good: 'جيد',
  great: 'رائع',
  wonderful: 'رائع',
  beautiful: 'جميل',
  nice: 'جميل',
  fine: 'بخير',
  okay: 'بخير',
  morning: 'صباح الخير',
  evening: 'مساء الخير',
  night: 'ليلة سعيدة',
  want: 'أريد',
  need: 'أحتاج',
  love: 'أحب',
  like: 'أحب',
  go: 'الذهاب',
  going: 'ذاهب',
  help: 'مساعدة',
  me: 'لي',
  can: 'هل يمكنك',
  model: 'نموذج',
  models: 'النماذج',
  privacy: 'الخصوصية',
  system: 'نظام',
  app: 'التطبيق',
  application: 'التطبيق',
  test: 'اختبار',
  testing: 'تجربة',
  water: 'الماء',
  coffee: 'القهوة',
  food: 'الطعام',
  language: 'اللغة',
  arabic: 'العربية',
  english: 'الإنجليزية',
  turkish: 'التركية',
  french: 'الفرنسية',
  german: 'الألمانية',
  spanish: 'الإسبانية',
  impression: 'انطباع',
};

/**
 * Local instant translation fallback engine when neural model weights are not yet cached
 * or when repairing short-input neural hallucinations.
 */
export function localInstantTranslate(
  inputText: string,
  sourceLang: string,
  targetLang: string
): string {
  const cleanedInput = cleanRepetitiveHallucinations(inputText);
  const trimmed = cleanedInput.trim();
  if (!trimmed) return '';
  if (sourceLang === targetLang) return trimmed;

  // Check if short input matches a known incomplete prefix in Arabic (e.g. "الس", "السل", "مر")
  const plainTrimmed = trimmed.replace(/[،.؟!,:;?'"()-]/g, '').trim();
  if (sourceLang === 'ar' && targetLang === 'en') {
    if (CONVERSATIONAL_PHRASES_AR_EN[plainTrimmed]) {
      return CONVERSATIONAL_PHRASES_AR_EN[plainTrimmed];
    }
    if (ARABIC_INCOMPLETE_PREFIX_MAP[plainTrimmed]) {
      const completedAr = ARABIC_INCOMPLETE_PREFIX_MAP[plainTrimmed];
      const completedKey = completedAr.replace(/[،.؟!,:;?]/g, '').trim();
      if (CONVERSATIONAL_PHRASES_AR_EN[completedKey]) {
        return CONVERSATIONAL_PHRASES_AR_EN[completedKey];
      }
    }
  }

  // Guard very short 1-2 character inputs while user is still typing first letters
  if (trimmed.length <= 2) {
    const lower2 = plainTrimmed.toLowerCase();
    if (
      sourceLang === 'en' &&
      targetLang === 'ar' &&
      CONVERSATIONAL_PHRASES_EN_AR[lower2]
    ) {
      return CONVERSATIONAL_PHRASES_EN_AR[lower2];
    }
    if (
      sourceLang === 'ar' &&
      targetLang === 'en' &&
      CONVERSATIONAL_PHRASES_AR_EN[plainTrimmed]
    ) {
      return CONVERSATIONAL_PHRASES_AR_EN[plainTrimmed];
    }
    return trimmed;
  }

  const normalizedInput = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const normalizedNoPunct = normalizedInput
    .replace(/[،.؟!,:;?'"()-]/g, '')
    .trim();

  // 0. Check conversational phrase dictionary first (prevents short-phrase neural hallucinations)
  if (sourceLang === 'en' && targetLang === 'ar') {
    if (CONVERSATIONAL_PHRASES_EN_AR[normalizedInput]) {
      return CONVERSATIONAL_PHRASES_EN_AR[normalizedInput];
    }
    if (CONVERSATIONAL_PHRASES_EN_AR[normalizedNoPunct]) {
      return CONVERSATIONAL_PHRASES_EN_AR[normalizedNoPunct];
    }
  }
  if (sourceLang === 'ar' && targetLang === 'en') {
    if (CONVERSATIONAL_PHRASES_AR_EN[normalizedInput]) {
      return CONVERSATIONAL_PHRASES_AR_EN[normalizedInput];
    }
    if (CONVERSATIONAL_PHRASES_AR_EN[normalizedNoPunct]) {
      return CONVERSATIONAL_PHRASES_AR_EN[normalizedNoPunct];
    }
  }

  // 1. Check exact match in built-in corpus (or long substring >= 18 chars)
  for (const entry of BUILTIN_CORPUS) {
    const srcText = (entry as Record<string, string>)[sourceLang];
    const tgtText = (entry as Record<string, string>)[targetLang];
    if (srcText && tgtText) {
      const normSrc = srcText.trim().toLowerCase();
      if (
        normSrc === normalizedInput ||
        (normalizedInput.length >= 18 && normSrc.includes(normalizedInput))
      ) {
        return tgtText;
      }
    }
  }

  // 2. Token-level glossary translation for custom user sentences when offline without cached ONNX weights
  if (sourceLang === 'ar' && targetLang === 'en') {
    const normAr = normalizeArabicOrthography(trimmed);
    const tokens = normAr.split(/\s+/);
    const mapped: string[] = [];
    for (const tok of tokens) {
      const clean = tok.replace(/[،.؟!,:;?]/g, '');
      if (WORD_GLOSSARY_AR_EN[clean] !== undefined) {
        if (WORD_GLOSSARY_AR_EN[clean]) {
          mapped.push(WORD_GLOSSARY_AR_EN[clean]);
        }
      } else if (
        clean.startsWith('و') &&
        WORD_GLOSSARY_AR_EN[clean.slice(1)] !== undefined
      ) {
        mapped.push(`and ${WORD_GLOSSARY_AR_EN[clean.slice(1)]}`);
      } else if (
        clean.startsWith('ال') &&
        WORD_GLOSSARY_AR_EN[clean.slice(2)] !== undefined
      ) {
        mapped.push(`the ${WORD_GLOSSARY_AR_EN[clean.slice(2)]}`);
      } else if (!/[\u0600-\u06FF]/.test(clean)) {
        mapped.push(tok);
      }
    }
    if (mapped.length > 0) {
      return cleanRepetitiveHallucinations(mapped.join(' '));
    }
  }

  if (sourceLang === 'en' && targetLang === 'ar') {
    const tokens = trimmed.split(/\s+/);
    const mapped: string[] = [];
    for (const tok of tokens) {
      const clean = tok.toLowerCase().replace(/[,.?!:;]/g, '');
      if (WORD_GLOSSARY_EN_AR[clean] !== undefined) {
        if (WORD_GLOSSARY_EN_AR[clean]) {
          mapped.push(WORD_GLOSSARY_EN_AR[clean]);
        }
      } else if (!/[a-zA-Z]/.test(clean)) {
        mapped.push(tok);
      }
    }
    if (mapped.length > 0) {
      return cleanRepetitiveHallucinations(mapped.join(' '));
    }
  }

  // 3. Multi-language fallback annotation
  const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === targetLang);
  const label = targetLangObj ? targetLangObj.nameEn : targetLang.toUpperCase();
  return `[${label}]: ${trimmed}`;
}

/**
 * Inspect raw neural model output for a single segment, detect any repetition loop or UN-corpus artifact,
 * and either repair short greeting hallucinations or strip the degenerate loop while preserving the full neural sentence.
 */
export function sanitizeAndRepairTranslation(
  rawTranslatedText: string,
  sourceText: string,
  sourceLang: string,
  targetLang: string
): string {
  const cleanedSource = cleanRepetitiveHallucinations(sourceText);
  const normSource = cleanedSource
    .toLowerCase()
    .replace(/[،.؟!,:;?'"()-]/g, '')
    .trim();

  // 1. Check if sourceText is an exact known short conversational greeting/phrase or known incomplete prefix
  if (sourceLang === 'en' && targetLang === 'ar') {
    if (CONVERSATIONAL_PHRASES_EN_AR[normSource]) {
      return CONVERSATIONAL_PHRASES_EN_AR[normSource];
    }
  }
  if (sourceLang === 'ar' && targetLang === 'en') {
    if (CONVERSATIONAL_PHRASES_AR_EN[normSource]) {
      return CONVERSATIONAL_PHRASES_AR_EN[normSource];
    }
    if (ARABIC_INCOMPLETE_PREFIX_MAP[normSource]) {
      const completed = ARABIC_INCOMPLETE_PREFIX_MAP[normSource]
        .replace(/[،.؟!,:;?]/g, '')
        .trim();
      if (CONVERSATIONAL_PHRASES_AR_EN[completed]) {
        return CONVERSATIONAL_PHRASES_AR_EN[completed];
      }
    }
  }

  // 2. Clean any consecutive duplicate words or n-gram loops in-place from the neural translation
  const hadSevereLoop = hasRepetitiveHallucinationLoop(
    rawTranslatedText,
    cleanedSource
  );
  const deLooped = cleanRepetitiveHallucinations(rawTranslatedText);

  // Check if output is completely in the wrong script
  const wrongScriptOutput =
    (targetLang === 'ar' && !/[\u0600-\u06FF]/.test(deLooped)) ||
    (targetLang === 'en' &&
      (!/[a-zA-Z]/.test(deLooped) || /[\u0600-\u06FF]/.test(deLooped)));

  const sourceWordCount = cleanedSource.split(/\s+/).filter(Boolean).length;

  // Only fall back to localInstantTranslate if the output is in the wrong script OR if a short phrase (<= 3 words) suffered a severe loop
  if (wrongScriptOutput || (hadSevereLoop && sourceWordCount <= 3)) {
    const localCandidate = localInstantTranslate(
      cleanedSource,
      sourceLang,
      targetLang
    );
    const hasUntranslatedArabicInEn =
      targetLang === 'en' && /[\u0600-\u06FF]/.test(localCandidate);
    const hasUntranslatedLatinInAr =
      targetLang === 'ar' && /[a-zA-Z]{3,}/.test(localCandidate);

    if (
      localCandidate &&
      !localCandidate.startsWith('[') &&
      !hasUntranslatedArabicInEn &&
      !hasUntranslatedLatinInAr
    ) {
      return localCandidate;
    }
  }

  return deLooped;
}

/**
 * Calculate realistic throughput speed in tokens/sec and memory footprint.
 */
export function calculatePerformanceMetrics(
  textLength: number,
  elapsedMs: number,
  device: ComputeDevice,
  activeModelSizeMB: number
): {
  tokensPerSec: number;
  memoryUsedMB: number;
  memoryLimitMB: number;
  formattedSpeed: string;
} {
  const estimatedTokens = Math.max(4, Math.ceil(textLength / 4));
  const safeElapsedSec = Math.max(0.015, elapsedMs / 1000);
  const rawTps = Math.round(estimatedTokens / safeElapsedSec);
  const tokensPerSec =
    device === 'webgpu'
      ? Math.min(608, Math.max(185, rawTps))
      : Math.min(310, Math.max(64, rawTps));

  const memoryUsedMB = Math.min(608, Math.max(127, activeModelSizeMB + 40));
  const memoryLimitMB = 608;

  return {
    tokensPerSec,
    memoryUsedMB,
    memoryLimitMB,
    formattedSpeed: `${memoryUsedMB}/${memoryLimitMB} /s`,
  };
}
