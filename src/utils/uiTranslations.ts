export type UILanguage = 'ar' | 'en';

export interface UITranslationStrings {
  dir: 'rtl' | 'ltr';
  appTitle: string;
  appSubtitle: string;
  disconnectedSuffix: string;
  themeLabel: string;
  themeGroupAria: string;
  darkMode: string;
  darkModeAria: string;
  lightMode: string;
  lightModeAria: string;
  uiLangLabel: string;
  uiLangGroupAria: string;
  installPwa: string;
  pwaReadyToast: string;
  closeToast: string;
  onnxStatusAria: string;
  initializingModels: (modelId: string) => string;
  modelsReadyCached: string;
  // AudioWaveformHero
  audioInputTitle: string;
  capturingAudio: string;
  transcribingAudio: string;
  whisperReady: string;
  startRecordAria: string;
  stopRecordAria: string;
  // Voice sample bar
  voiceSamplesLabel: string;
  dualModeBadge: string;
  whisperOfflineBadge: (shortLabel: string) => string;
  // Language bar
  langBarAria: string;
  sourceLangLabel: string;
  sourceLangAria: string;
  sourceLangSearchPlaceholder: string;
  swapBtn: string;
  swapBtnAria: string;
  targetLangLabel: string;
  targetLangAria: string;
  targetLangSearchPlaceholder: string;
  noSearchResults: string;
  // Input & Translation cards
  inputSectionAria: string;
  inputCardTitle: string;
  clearBtn: string;
  clearBtnAria: string;
  sourceTextareaAria: string;
  sourcePlaceholderTranscribing: string;
  sourcePlaceholderIdle: string;
  translateBtn: string;
  translateBtnAria: string;
  speakSourceAria: string;
  statusTranscribing: string;
  statusWaitingTyping: string;
  statusInitializing: string;
  statusReadyWithModel: (modelLabel: string) => string;
  translationSectionAria: string;
  translationCardTitle: string;
  translatedTextareaAria: string;
  translatedPlaceholder: string;
  speakTranslationBtn: string;
  speakTranslationAria: string;
  copyTranslationAria: string;
  exportTranslationAria: string;
  statusTranslating: string;
  statusReadyShort: string;
  // History & Code tabs
  historySectionAria: string;
  historyTitle: string;
  historySubtitle: string;
  clearHistoryBtn: string;
  emptyHistoryText: string;
  startNewTranslationBtn: string;
  codeSectionAria: string;
  codeSectionTitle: string;
  // Bottom Nav Dock
  bottomNavAria: string;
  navHomeAria: string;
  navVoiceAria: string;
  navHistoryAria: string;
  navCodeAria: string;
  // AdvancedControlPanel
  advancedSettingsTitle: string;
  modelsAccordionTitle: string;
  speechEngineLabel: string;
  dualAsrOptionLabel: string;
  whisperOfflineOptionLabel: string;
  dualAsrDesc: string;
  whisperOfflineDesc: string;
  whisperModelLabel: string;
  translationModelLabel: string;
  activeModelForPair: string;
  preloadReadyBtn: string;
  preloadDownloadingBtn: (pct: number) => string;
  preloadDownloadBtn: (mb: number) => string;
  gpuSectionTitle: string;
  autoWhenAvailable: string;
  fractionsOfSec: string;
  memorySpeedIndicatorLabel: string;
  // iOS Modal
  iosModalTitle: string;
  iosModalStep1: string;
  iosModalStep2: string;
  iosModalOk: string;
  // Toasts
  ttsUnsupportedToast: string;
  exportedToast: string;
}

export const UI_TRANSLATIONS: Record<UILanguage, UITranslationStrings> = {
  ar: {
    dir: 'rtl',
    appTitle: 'مساعد الترجمه السريع',
    appSubtitle: '100% Offline & Local',
    disconnectedSuffix: ' · وضع عدم الاتصال نشط',
    themeLabel: 'تبديل المظهر',
    themeGroupAria: 'تبديل مظهر الواجهة',
    darkMode: 'الوضع الداكن',
    darkModeAria: 'الوضع الداكن (Dark Mode)',
    lightMode: 'الوضع الفاتح',
    lightModeAria: 'الوضع الفاتح (Light Mode)',
    uiLangLabel: 'لغة الواجهة',
    uiLangGroupAria: 'تبديل لغة الواجهة (العربية / الإنجليزية)',
    installPwa: 'تثبيت PWA',
    pwaReadyToast:
      'التطبيق جاهز للتثبيت كـ PWA عبر قائمة المتصفح (Add to Home Screen / Install App) للعمل بدون إنترنت.',
    closeToast: 'إغلاق',
    onnxStatusAria: 'حالة تحميل وتخزين ملفات النماذج (.onnx)',
    initializingModels: (modelId) => `جاري تهيئة النماذج (${modelId})...`,
    modelsReadyCached: 'النماذج محملة وجاهزة في الذاكرة المحلية',
    audioInputTitle: 'الإدخال الصوتي',
    capturingAudio: 'جاري الالتقاط الصوتي...',
    transcribingAudio: 'جاري تحويل الصوت إلى نص...',
    whisperReady: 'Whisper ASR Ready',
    startRecordAria: 'بدء التسجيل الصوتي للترجمة الفورية أوفلاين',
    stopRecordAria: 'إيقاف التسجيل الصوتي وترجمة الكلام',
    voiceSamplesLabel: 'تجربة صوتية فورية (16kHz):',
    dualModeBadge: 'التقاط صوتي فوري فائق الدقة (ar-IQ + Offline)',
    whisperOfflineBadge: (shortLabel) =>
      `وضع Whisper Offline بالكامل (${shortLabel})`,
    langBarAria: 'شريط اختيار اللغات والتبديل بينها',
    sourceLangLabel: 'لغة الإدخال / التحدث:',
    sourceLangAria: 'لغة الإدخال / التحدث',
    sourceLangSearchPlaceholder: 'ابحث عن لغة الإدخال...',
    swapBtn: 'تبديل',
    swapBtnAria: 'تبديل وعكس اللغات (Swap Languages)',
    targetLangLabel: 'لغة الترجمة:',
    targetLangAria: 'لغة الترجمة',
    targetLangSearchPlaceholder: 'ابحث عن لغة الترجمة...',
    noSearchResults: 'لا توجد نتائج مطابقة',
    inputSectionAria: 'قسم النص المستخرج والمصدر',
    inputCardTitle: 'النص (الإدخال)',
    clearBtn: 'مسح النص',
    clearBtnAria: 'مسح النص (Clear)',
    sourceTextareaAria: 'النص المصدر أو المستخرج من الصوت',
    sourcePlaceholderTranscribing: 'جاري تحويل الصوت إلى نص...',
    sourcePlaceholderIdle:
      'تحدث في المايكروفون أو اكتب النص هنا (تبدأ الترجمة تلقائياً بعد التوقف عن الكتابة بـ 700ms أو بالضغط على زر ترجمة النص)...',
    translateBtn: 'ترجمة النص',
    translateBtnAria: 'ترجمة النص',
    speakSourceAria: 'نطق النص المصدر',
    statusTranscribing: 'جاري تحويل الصوت إلى نص...',
    statusWaitingTyping: 'بانتظار التوقف عن الكتابة (700ms)...',
    statusInitializing: 'جاري تهيئة النماذج...',
    statusReadyWithModel: (modelLabel) => `جاهز · ${modelLabel}`,
    translationSectionAria: 'قسم الترجمة',
    translationCardTitle: 'الترجمة',
    translatedTextareaAria: 'النص المترجم',
    translatedPlaceholder: 'ستظهر الترجمة الفورية هنا بدون إنترنت...',
    speakTranslationBtn: 'نطق الترجمة',
    speakTranslationAria: 'نطق النص المترجم صوتياً أوفلاين',
    copyTranslationAria: 'نسخ النص المترجم',
    exportTranslationAria: 'تصدير ومشاركة الترجمة',
    statusTranslating: 'جاري الترجمة...',
    statusReadyShort: 'جاهز',
    historySectionAria: 'سجل الترجمات المحلية',
    historyTitle: 'سجل الترجمات المحفوظ محلياً (Offline History)',
    historySubtitle:
      'جميع السجلات مخزنة داخل متصفحك فقط ولا تغادر جهازك أبداً',
    clearHistoryBtn: 'مسح السجل',
    emptyHistoryText: 'لا توجد ترجمات محفوظة في السجل حتى الآن.',
    startNewTranslationBtn: 'بدء ترجمة جديدة',
    codeSectionAria: 'معمارية Web Worker و Transformers.js',
    codeSectionTitle:
      'معمارية المعالجة المحلية (Dual ASR + Web Worker Queue)',
    bottomNavAria: 'شريط الأدوات السريع',
    navHomeAria: 'الرئيسية ومساحة الترجمة',
    navVoiceAria: 'تسجيل صوتي فوري',
    navHistoryAria: 'سجل الترجمات المحفوظة أوفلاين',
    navCodeAria: 'عرض كود Web Worker وإعدادات Transformers.js',
    advancedSettingsTitle: 'الإعدادات المتقدمة',
    modelsAccordionTitle: 'اختيار النماذج ومحرك الصوت',
    speechEngineLabel: 'محرك التقاط الصوت',
    dualAsrOptionLabel: 'التقاط صوتي فوري فائق الدقة',
    whisperOfflineOptionLabel: 'وضع Whisper Offline بالكامل',
    dualAsrDesc:
      'يلتقط الكلام العربي لحظياً بدقة 100% (ar-IQ) ويترجمه أوفلاين فور التوقف، وينتقل تلقائياً لـ Whisper عند انقطاع الإنترنت.',
    whisperOfflineDesc:
      'يستخدم نموذج Whisper محلياً بالكامل بتردد 16000Hz مع عزل الضوضاء وتطبيع الصوت (0.95).',
    whisperModelLabel: 'نموذج Whisper Offline',
    translationModelLabel: 'نموذج الترجمة (Opus-MT / NLLB)',
    activeModelForPair: 'النشط حالياً للغتين المختارتين:',
    preloadReadyBtn: 'النماذج محملة وجاهزة في الذاكرة المحلية',
    preloadDownloadingBtn: (pct) => `جاري تهيئة وتحميل النماذج (${pct}%)...`,
    preloadDownloadBtn: (mb) => `تحميل وتخزين النماذج (${mb}MB)`,
    gpuSectionTitle: 'تفعيل تسريع كرت الشاشة',
    autoWhenAvailable: 'تلقائي عند التوفر',
    fractionsOfSec: 'أجزاء من الثانية',
    memorySpeedIndicatorLabel: 'مؤشر استهلاك الذاكرة وسرعة الترجمة بالثانية',
    iosModalTitle: 'تثبيت التطبيق على iPhone / iPad للعمل أوفلاين',
    iosModalStep1: '1. اضغط على زر المشاركة (Share) في شريط متصفح Safari.',
    iosModalStep2:
      '2. اختر إضافة إلى الشاشة الرئيسية (Add to Home Screen).',
    iosModalOk: 'حسناً',
    ttsUnsupportedToast: 'محرك النطق الصوتي غير مدعوم في هذا المتصفح',
    exportedToast: 'تم تصدير ملف الترجمة النصي محلياً',
  },
  en: {
    dir: 'ltr',
    appTitle: 'Fast Translation Assistant',
    appSubtitle: '100% Offline & Local',
    disconnectedSuffix: ' · Disconnected Mode Active',
    themeLabel: 'Theme',
    themeGroupAria: 'Toggle Interface Theme',
    darkMode: 'Dark Mode',
    darkModeAria: 'Dark Mode',
    lightMode: 'Light Mode',
    lightModeAria: 'Light Mode',
    uiLangLabel: 'UI Language',
    uiLangGroupAria: 'Toggle Interface Language (Arabic / English)',
    installPwa: 'Install PWA',
    pwaReadyToast:
      'App is ready to install as an offline PWA via your browser menu (Add to Home Screen / Install App).',
    closeToast: 'Dismiss',
    onnxStatusAria: 'ONNX Model Weights Download & Local Cache Status',
    initializingModels: (modelId) => `Initializing models (${modelId})...`,
    modelsReadyCached: 'Models loaded & ready in local memory',
    audioInputTitle: 'Audio Input',
    capturingAudio: 'Capturing live audio...',
    transcribingAudio: 'Transcribing speech to text...',
    whisperReady: 'Whisper ASR Ready',
    startRecordAria: 'Start voice recording for instant offline translation',
    stopRecordAria: 'Stop voice recording and translate speech',
    voiceSamplesLabel: 'Instant Voice Samples (16kHz):',
    dualModeBadge: 'Ultra-Accurate Live Speech (ar-IQ + Offline)',
    whisperOfflineBadge: (shortLabel) =>
      `Full Whisper Offline Mode (${shortLabel})`,
    langBarAria: 'Language Selection & Swap Bar',
    sourceLangLabel: 'Input / Speaking Language:',
    sourceLangAria: 'Input / Speaking Language',
    sourceLangSearchPlaceholder: 'Search input language...',
    swapBtn: 'Swap',
    swapBtnAria: 'Swap Languages',
    targetLangLabel: 'Target Language:',
    targetLangAria: 'Target Language',
    targetLangSearchPlaceholder: 'Search target language...',
    noSearchResults: 'No matching languages found',
    inputSectionAria: 'Source & Extracted Text Section',
    inputCardTitle: 'Source Text (Input)',
    clearBtn: 'Clear Text',
    clearBtnAria: 'Clear Text',
    sourceTextareaAria: 'Source or speech-extracted text',
    sourcePlaceholderTranscribing: 'Transcribing speech to text...',
    sourcePlaceholderIdle:
      'Speak into the microphone or type text here (translation starts automatically 700ms after typing stops or by clicking Translate Text)...',
    translateBtn: 'Translate Text',
    translateBtnAria: 'Translate Text',
    speakSourceAria: 'Speak source text',
    statusTranscribing: 'Transcribing speech to text...',
    statusWaitingTyping: 'Waiting for typing pause (700ms)...',
    statusInitializing: 'Initializing models...',
    statusReadyWithModel: (modelLabel) => `Ready · ${modelLabel}`,
    translationSectionAria: 'Translation Output Section',
    translationCardTitle: 'Translation',
    translatedTextareaAria: 'Translated text',
    translatedPlaceholder: 'Instant offline translation will appear here...',
    speakTranslationBtn: 'Speak Translation',
    speakTranslationAria: 'Speak translated text offline',
    copyTranslationAria: 'Copy translated text',
    exportTranslationAria: 'Export and share translation',
    statusTranslating: 'Translating...',
    statusReadyShort: 'Ready',
    historySectionAria: 'Local Translation History',
    historyTitle: 'Locally Saved Translation History (Offline History)',
    historySubtitle:
      'All records are stored strictly inside your browser and never leave your device',
    clearHistoryBtn: 'Clear History',
    emptyHistoryText: 'No translations saved in history yet.',
    startNewTranslationBtn: 'Start New Translation',
    codeSectionAria: 'Web Worker & Transformers.js Architecture',
    codeSectionTitle:
      'Local Processing Architecture (Dual ASR + Web Worker Queue)',
    bottomNavAria: 'Quick Action Dock',
    navHomeAria: 'Home & Translation Workspace',
    navVoiceAria: 'Instant Voice Recording',
    navHistoryAria: 'Offline Translation History',
    navCodeAria: 'View Web Worker Code & Transformers.js Config',
    advancedSettingsTitle: 'Advanced Settings',
    modelsAccordionTitle: 'Models & Speech Engine Selection',
    speechEngineLabel: 'Speech Capture Engine',
    dualAsrOptionLabel: 'Ultra-Accurate Live Speech Capture',
    whisperOfflineOptionLabel: 'Full Whisper Offline Mode',
    dualAsrDesc:
      'Captures speech in real time with 100% accuracy and translates offline upon pause, automatically falling back to Whisper when offline.',
    whisperOfflineDesc:
      'Uses local Whisper model at 16000Hz with VAD silence trimming & peak normalization (0.95).',
    whisperModelLabel: 'Whisper Offline Model',
    translationModelLabel: 'Translation Model (Opus-MT / NLLB)',
    activeModelForPair: 'Active model for selected pair:',
    preloadReadyBtn: 'Models loaded & ready in local memory',
    preloadDownloadingBtn: (pct) =>
      `Initializing & downloading models (${pct}%)...`,
    preloadDownloadBtn: (mb) => `Download & Cache Models (${mb}MB)`,
    gpuSectionTitle: 'Enable Hardware Acceleration',
    autoWhenAvailable: 'Auto when available',
    fractionsOfSec: 'Fractions of a second',
    memorySpeedIndicatorLabel: 'Memory usage & translation speed per second',
    iosModalTitle: 'Install App on iPhone / iPad for Offline Use',
    iosModalStep1: '1. Tap the Share button in the Safari toolbar.',
    iosModalStep2: '2. Select Add to Home Screen.',
    iosModalOk: 'Got it',
    ttsUnsupportedToast: 'Speech synthesis is not supported in this browser',
    exportedToast: 'Translation file exported locally',
  },
};

export function getUITranslations(lang: UILanguage): UITranslationStrings {
  return UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.ar;
}
