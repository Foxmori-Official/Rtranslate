import { describe, expect, it } from 'vitest'
import { captionLabels, isCaptionEnableLabel } from '../../src/subtitles/i18n'
import { UI_LANGS } from '../../src/shared/uiLocale'

describe('subtitle UI language and native enabling labels',()=>{
 it.each(UI_LANGS.filter(item=>item.code!=='auto'))('provides local labels for $code',({code})=>{
   const labels=captionLabels(code)
   expect(labels.lang).toBe(code)
   expect(labels.region.trim()).not.toBe('')
   expect(labels.enable.trim()).not.toBe('')
   expect(isCaptionEnableLabel(labels.enable)).toBe(true)
   if(code!=='en')expect(labels.enable).not.toBe(captionLabels('en').enable)
 })
 it('uses the same browser/legacy locale resolution as other UI pages',()=>{
   expect(captionLabels('auto','de-AT').lang).toBe('de')
   expect(captionLabels('auto','zh-Hant-HK').lang).toBe('zh-TW')
   expect(captionLabels('pt-PT').lang).toBe('pt-BR')
   expect(captionLabels('unsupported').lang).toBe('en')
 })
 it.each(['Turn on captions (c)','Show live captions','Afficher les sous-titres','Mostrar subtítulos','显示实时字幕','顯示即時字幕','자막 사용 설정'])('recognizes the page action %s',label=>expect(isCaptionEnableLabel(label)).toBe(true))
 it.each(['Captions','Turn off captions','Hide captions','Start recording','Start transcription','Untertitel ausschalten','Desactivar subtítulos','Désactiver les sous-titres','Desativar legendas','关闭字幕','關閉字幕','字幕をオフにする','자막 끄기'])('never treats off/ambiguous action %s as enabling',label=>expect(isCaptionEnableLabel(label)).toBe(false))
})
