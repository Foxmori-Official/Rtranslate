// 隐私政策页：内置页面，不跳转外部站点。仅英文（商店审核语言）。

interface PrivacySection {
  title: string
  body?: string[]
  list?: string[]
}

interface PrivacyContent {
  updated: string
  sections: PrivacySection[]
}

const EN: PrivacyContent = {
  "updated": "2026-11-05",
  "sections": [
    {
      "title": "Rtranslate and Foxmori",
      "body": [
        "Rtranslate is an open-source (GPL-3.0) browser translation extension in the Foxmori product family. The extension has a background service worker, and Foxmori also provides a hosted API at https://api.foxmori.com/v1. It is not an offline-only or server-free product.",
        "The extension does not require its own account and contains no analytics or advertising code. A translation provider, including Foxmori, may require an account, an API key and paid usage. Provider-side retention, logging and onward processing are governed by that provider; this policy does not promise that servers keep no logs."
      ]
    },
    {
      "title": "Text sent to translation and AI services",
      "body": [
        "Manual translation and enabled automatic site/language rules, hover/input triggers and subtitle features can send page text, selections, input text or subtitles without clicking Translate each time. Document files are parsed locally; extracted text segments are sent for translation, not the original document as a file upload.",
        "Requests normally go from the extension background to the selected provider. Free-engine fallback or multi-engine comparison can send the same text to multiple providers. A language-detection request may send a text sample to Google even when another translation engine is selected. Providers receive ordinary request metadata such as IP address and authentication headers.",
        "AI reading assistance may include selected text and surrounding context; follow-up chat sends its conversation history. AI writing sends the supplied text; terminology extraction sends the submitted sample. Optional context-aware translation can include the page title, meta description and a body excerpt. Do not submit confidential text unless you accept these data flows."
      ],
      "list": [
        "Providers: Foxmori; Google Translate and Microsoft Translator (unofficial web endpoints); MyMemory; DeepL; OpenAI-compatible services such as OpenAI and DeepSeek; Claude; Gemini; LibreTranslate and configured custom endpoints. Availability depends on the feature and protocol.",
        "The extension uses the browser/OS speech service for read-aloud. Some installed voices may be network-backed; their processing is controlled by the browser/OS voice provider."
      ]
    },
    {
      "title": "Optional masking is not a confidentiality guarantee",
      "body": [
        "Masking is off by default. When enabled, the translation pipeline attempts to replace recognized patterns such as email addresses, phone/card/ID numbers and API keys with local placeholders, then restores them in the result. Detection is pattern-based and can miss sensitive data.",
        "Language detection, AI reading/chat, writing, terminology extraction and extra page context are not guaranteed to pass through the same masking pipeline. Unrecognized or unmasked text can leave the device. Do not rely on masking for confidential or regulated material."
      ]
    },
    {
      "title": "Keys and local storage",
      "body": [
        "Settings, API keys, site/language rules, glossary data, usage counters, wordbook and review records are kept in chrome.storage.local. Translation results are also cached locally and may contain restored, unmasked text. Local storage is not an encrypted secret vault.",
        "Keys are sent to the configured service for authentication. The options page can also query model lists directly from a configured endpoint with its key, without sending translation text. Saving a custom endpoint can require a browser host-permission grant; that grant is not a guarantee of trustworthiness. Never enter a key for an endpoint you do not trust.",
        "Foxmori requires a new key and a supported model ID. Migration does not copy the legacy AI Mao key into the Foxmori key field or send it to Foxmori automatically. The legacy key is retained locally for compatibility; remove it using browser extension storage controls or uninstall if you no longer need it."
      ]
    },
    {
      "title": "Your choices and deletion",
      "body": [
        "Disable automatic translation, subtitles and other triggers, turn off optional context sharing, change providers or remove keys in settings. A self-hosted endpoint only keeps requests in your network if its deployment and routing do so; free fallbacks, detection and other enabled services may still be external.",
        "The options page supports deleting wordbook entries and exporting/importing local data. Exported wordbook files contain the data you choose to export; keep them private. To remove all extension settings, retained legacy keys and persistent caches, clear this extension’s local storage using browser tools or uninstall it. Deletion does not remove text already received by providers or files you exported. There is currently no dedicated clear-all-cache button in options.",
        "We do not add telemetry, sell data or execute remote program code in the extension. Sending text to a provider is nevertheless a disclosure to that service."
      ]
    },
    {
      "title": "Contact",
      "body": [
        "Report questions or privacy issues through the Rtranslate repository Issues page (github.com/Foxmori-Official/Rtranslate/issues). The repository owner name is historical; the current product/service brand is Foxmori."
      ]
    }
  ]
}

document.documentElement.lang = 'en'
document.title = 'Rtranslate · Foxmori — Privacy Policy'

const app = document.getElementById('app')!
if (app) {
  app.className = 'wrap'

  const brand = document.createElement('div')
  brand.className = 'brand'
  const logo = document.createElement('img')
  logo.src = chrome.runtime.getURL('icons/icon128.png')
  logo.alt = 'Rtranslate'
  const name = document.createElement('span')
  name.className = 'brand-name'
  name.textContent = 'Rtranslate'
  brand.append(logo, name)
  app.appendChild(brand)

  const updated = document.createElement('p')
  updated.className = 'updated'
  updated.textContent = `Effective date: ${EN.updated}`
  app.appendChild(updated)

  for (const sec of EN.sections) {
    const h = document.createElement('h2')
    h.textContent = sec.title
    app.appendChild(h)
    for (const p of sec.body ?? []) {
      const el = document.createElement('p')
      el.textContent = p
      app.appendChild(el)
    }
    if (sec.list) {
      const ul = document.createElement('ul')
      for (const item of sec.list) {
        const li = document.createElement('li')
        li.textContent = item
        ul.appendChild(li)
      }
      app.appendChild(ul)
    }
  }
}

export {}
