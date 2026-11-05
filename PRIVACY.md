# Rtranslate · Foxmori 隐私政策 / Privacy Policy

生效日期 / Effective date: 2026-11-05 · Chrome / Microsoft Edge

## 中文

### 产品与服务

Rtranslate 是 Foxmori 旗下的开源（GPL-3.0）浏览器翻译扩展。扩展包含后台 service worker，Foxmori 也提供托管 API `https://api.foxmori.com/v1`；这不是纯离线或“无服务器”产品。扩展本身不要求注册账号，源码不包含遥测／分析或广告代码；Foxmori 等服务商可能需要账号、API Key 和付费额度。服务商的日志、留存、转交和处理方式由其政策决定，本政策不承诺服务端无日志。

### 哪些内容会发送到网络

- 手动翻译，以及启用的网站／语言自动翻译规则、悬停／输入框触发、字幕功能，都可能发送网页、选中文本、输入内容或字幕，不必每次点击翻译。文档在本地解析，发送的是提取的待译文本段，而非整个原始文件上传。
- 请求一般由扩展后台发送到选择的引擎。免费链失败降级或多引擎对比可能把同一文本发送给多个服务。语言检测接口可能把文本样本发给 Google，即使当前选择的是其他引擎。服务商也能接收到 IP 地址、认证头等通常的网络请求信息。
- AI 阅读辅助会发送选中内容及相关上下文；追问会发送对话历史；AI 写作发送提供的文本；术语提取发送提交的样本。开启上下文感知翻译还可能附带页面标题、meta description 和部分正文。
- 服务包括 Foxmori、Google／微软非官方网页接口、MyMemory、DeepL、OpenAI／DeepSeek 等 OpenAI 兼容接口、Claude、Gemini、LibreTranslate 和自定义端点。不同功能支持的协议／引擎不同。
- 朗读使用浏览器／操作系统的语音服务，某些语音可能依赖网络，其处理方式由对应语音服务控制。

### 脱敏不是保密保证

脱敏默认关闭。开启后，翻译管线尝试在本地把识别出的邮箱、电话、银行卡／证件号、API Key 等模式替换为占位符，返回后还原；模式识别可能遗漏敏感内容。语言检测、AI 阅读／对话、写作、术语提取及额外页面上下文不保证经过相同脱敏管线。未识别或未脱敏的文本可能离开设备；请勿依赖此功能处理机密或受监管资料。

### 密钥与本地存储

设置、API Key、网站／语言规则、术语库、用量计数、生词和复习记录保存在 `chrome.storage.local`。译文也会在本地缓存，可能包含还原后的敏感原文。本地存储不是加密密钥保险箱。

密钥会发给配置的服务作认证；设置页的“获取模型”操作也会直接请求配置端点并携带 Key（不发送待译文本）；自定义端点可能需要浏览器主机权限，授权不代表端点可信。Foxmori 需要新的 Key 和服务支持的模型 ID。迁移不会把旧 AI猫 Key 复制成 Foxmori Key 或自动发给 Foxmori；旧 Key 仅保留在本地兼容字段中。不再需要时可用浏览器扩展存储工具移除或卸载。

### 控制与删除

可关闭自动翻译、字幕及其他触发器和上下文共享，切换服务或在设置中删除 Key。只有自托管部署和路由确实限制在内网时，对应请求才不离开内网；免费降级、检测或其他启用功能仍可能访问外部服务。

设置页可以删除生词及导出／导入本地数据。导出文件含你导出的内容，请自行妥善保管。若要删除所有设置、旧 Key 和持久缓存，可在浏览器工具中清除此扩展本地存储或卸载。当前设置页没有专用的“清空全部缓存”按钮。删除本地数据不撤回服务商已接收到的文本，也不会删除已导出的文件。

扩展不添加遥测、不出售数据、不执行远程程序代码，但把文本发送给翻译／AI 服务本身就意味着向该服务披露文本。

### 联系

通过 `github.com/Foxmori-Official/Rtranslate/issues` 提问或反馈。GitHub 仓库所有者名称为历史名称，当前产品／服务品牌为 Foxmori。

---

## English

### Rtranslate and Foxmori

Rtranslate is an open-source (GPL-3.0) browser translation extension in the Foxmori product family. The extension has a background service worker, and Foxmori also provides a hosted API at https://api.foxmori.com/v1. It is not an offline-only or server-free product.

The extension does not require its own account and contains no analytics or advertising code. A translation provider, including Foxmori, may require an account, an API key and paid usage. Provider-side retention, logging and onward processing are governed by that provider; this policy does not promise that servers keep no logs.

### Text sent to translation and AI services

Manual translation and enabled automatic site/language rules, hover/input triggers and subtitle features can send page text, selections, input text or subtitles without clicking Translate each time. Document files are parsed locally; extracted text segments are sent for translation, not the original document as a file upload.

Requests normally go from the extension background to the selected provider. Free-engine fallback or multi-engine comparison can send the same text to multiple providers. A language-detection request may send a text sample to Google even when another translation engine is selected. Providers receive ordinary request metadata such as IP address and authentication headers.

AI reading assistance may include selected text and surrounding context; follow-up chat sends its conversation history. AI writing sends the supplied text; terminology extraction sends the submitted sample. Optional context-aware translation can include the page title, meta description and a body excerpt. Do not submit confidential text unless you accept these data flows.

- Providers: Foxmori; Google Translate and Microsoft Translator (unofficial web endpoints); MyMemory; DeepL; OpenAI-compatible services such as OpenAI and DeepSeek; Claude; Gemini; LibreTranslate and configured custom endpoints. Availability depends on the feature and protocol.
- The extension uses the browser/OS speech service for read-aloud. Some installed voices may be network-backed; their processing is controlled by the browser/OS voice provider.

### Optional masking is not a confidentiality guarantee

Masking is off by default. When enabled, the translation pipeline attempts to replace recognized patterns such as email addresses, phone/card/ID numbers and API keys with local placeholders, then restores them in the result. Detection is pattern-based and can miss sensitive data.

Language detection, AI reading/chat, writing, terminology extraction and extra page context are not guaranteed to pass through the same masking pipeline. Unrecognized or unmasked text can leave the device. Do not rely on masking for confidential or regulated material.

### Keys and local storage

Settings, API keys, site/language rules, glossary data, usage counters, wordbook and review records are kept in chrome.storage.local. Translation results are also cached locally and may contain restored, unmasked text. Local storage is not an encrypted secret vault.

Keys are sent to the configured service for authentication. The options page can also query model lists directly from a configured endpoint with its key, without sending translation text. Saving a custom endpoint can require a browser host-permission grant; that grant is not a guarantee of trustworthiness. Never enter a key for an endpoint you do not trust.

Foxmori requires a new key and a supported model ID. Migration does not copy the legacy AI Mao key into the Foxmori key field or send it to Foxmori automatically. The legacy key is retained locally for compatibility; remove it using browser extension storage controls or uninstall if you no longer need it.

### Your choices and deletion

Disable automatic translation, subtitles and other triggers, turn off optional context sharing, change providers or remove keys in settings. A self-hosted endpoint only keeps requests in your network if its deployment and routing do so; free fallbacks, detection and other enabled services may still be external.

The options page supports deleting wordbook entries and exporting/importing local data. Exported wordbook files contain the data you choose to export; keep them private. To remove all extension settings, retained legacy keys and persistent caches, clear this extension’s local storage using browser tools or uninstall it. Deletion does not remove text already received by providers or files you exported. There is currently no dedicated clear-all-cache button in options.

We do not add telemetry, sell data or execute remote program code in the extension. Sending text to a provider is nevertheless a disclosure to that service.

### Contact

Report questions or privacy issues through the Rtranslate repository Issues page (github.com/Foxmori-Official/Rtranslate/issues). The repository owner name is historical; the current product/service brand is Foxmori.
