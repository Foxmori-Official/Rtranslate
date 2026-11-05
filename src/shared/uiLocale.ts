// i18n 基础设施：9 种界面语言与 Auto 选项。界面语言（uiLang）只影响扩展自身 UI，与翻译目标语言无关。
// zh-CN 是源语言（代码内中文即原文）；auto 跟随浏览器界面语言。

export type UiLangCode = 'auto' | 'en' | 'de' | 'es' | 'fr' | 'pt-BR' | 'ja' | 'zh-CN' | 'zh-TW' | 'ko'
export type ResolvedLang = Exclude<UiLangCode, 'auto'>

/** 界面语言菜单选项（严格按需求顺序排列） */
export const UI_LANGS: ReadonlyArray<{ code: UiLangCode; name: string }> = [
  { code: 'auto', name: '跟随系统' },  // 显示名由 general.uiLangAuto 字典键按当前界面语言本地化
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'ja', name: '日本語' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'ko', name: '한국어' },
]

/** 浏览器界面语言 → 支持的语言（不匹配回退 en） */
/** 支持的界面语言集合（UI_LANGS 去 auto）；不在列表的语言一律回退英语（英语为兜底语言） */
const SUPPORTED_UI_LANGS: ReadonlySet<string> = new Set(
  UI_LANGS.filter((l) => l.code !== 'auto').map((l) => l.code),
)

/** zh 系变体归一：zh/zh-Hans/zh-CN/zh-SG → zh-CN；zh-Hant/zh-TW/zh-HK/zh-MO → zh-TW */
function zhVariant(raw: string): 'zh-CN' | 'zh-TW' | null {
  const l = String(raw).toLowerCase()
  if (!l.startsWith('zh')) return null
  return l.includes('tw') || l.includes('hk') || l.includes('mo') || l.includes('hant') ? 'zh-TW' : 'zh-CN'
}

export function resolveUiLang(uiLang: UiLangCode | string, browserLang?: string): ResolvedLang {
  if (uiLang !== 'auto') {
    // 显式值：zh 系归一；pt 系归 pt-BR；其余按主子标签匹配支持列表，不支持 → 英语兜底
    const zh = zhVariant(uiLang)
    if (zh) return zh
    const primary = String(uiLang).toLowerCase().split('-')[0]
    if (primary === 'pt') return 'pt-BR'
    return SUPPORTED_UI_LANGS.has(primary) ? (primary as ResolvedLang) : 'en'
  }
  const raw = (browserLang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en')).toLowerCase()
  if (raw.startsWith('zh')) {
    return raw.includes('tw') || raw.includes('hk') || raw.includes('mo') || raw.includes('hant') ? 'zh-TW' : 'zh-CN'
  }
  if (raw.startsWith('de')) return 'de'
  if (raw.startsWith('es')) return 'es'
  if (raw.startsWith('fr')) return 'fr'
  if (raw.startsWith('pt')) return 'pt-BR'
  if (raw.startsWith('ja')) return 'ja'
  if (raw.startsWith('ko')) return 'ko'
  return 'en'
}

