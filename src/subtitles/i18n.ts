import { resolveUiLang, type ResolvedLang } from '../shared/uiLocale'

// Small subtitle-specific dictionary: do not ship the full settings dictionary
// into the always-injected subtitle bundle for these two strings.
const LABELS: Record<ResolvedLang, { region: string; enable: string }> = {
  en: { region: 'Meeting caption translation', enable: 'Turn on captions' },
  de: { region: 'Übersetzung der Besprechungsuntertitel', enable: 'Untertitel einschalten' },
  es: { region: 'Traducción de subtítulos de reuniones', enable: 'Activar subtítulos' },
  fr: { region: 'Traduction des sous-titres de réunion', enable: 'Activer les sous-titres' },
  'pt-BR': { region: 'Tradução de legendas da reunião', enable: 'Ativar legendas' },
  ja: { region: '会議字幕の翻訳', enable: '字幕をオンにする' },
  'zh-CN': { region: '会议字幕翻译', enable: '开启字幕' },
  'zh-TW': { region: '會議字幕翻譯', enable: '開啟字幕' },
  ko: { region: '회의 자막 번역', enable: '자막 켜기' },
}
export function captionLabels(uiLang: string, browserLang?: string) {
  const lang = resolveUiLang(uiLang, browserLang)
  return { lang, ...LABELS[lang] }
}

// Match explicit enabling actions only, in the page's language (which can differ
// from extension UI language). Ambiguous 'Captions', off/record/transcribe actions
// are deliberately excluded. Sites' actual labels still need live verification.
const ENABLE_ACTIONS = [
  /^(?:turn on (?:live |closed )?(?:captions|subtitles)|show (?:closed |live )?(?:captions|subtitles))$/i,
  /^(?:开启|打开|显示)(?:实时)?字幕$/,
  /^(?:開啟|打開|顯示)(?:即時)?字幕$/,
  /^untertitel (?:einschalten|aktivieren|anzeigen)$/i,
  /^(?:activar|mostrar) (?:los )?subtítulos$/i,
  /^(?:activer|afficher) (?:les )?sous-titres$/i,
  /^(?:ativar|mostrar) (?:as )?legendas$/i,
  /^字幕を(?:オンにする|有効にする|表示)$/,
  /^자막 (?:켜기|표시|사용(?: 설정)?)$/,
]
export function isCaptionEnableLabel(label: string): boolean {
  const action = label.normalize('NFC').trim().replace(/\s*\([^)]*\)\s*$/, '').trim()
  return ENABLE_ACTIONS.some(pattern => pattern.test(action))
}
