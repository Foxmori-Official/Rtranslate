// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../../src/shared/config'
import { captionLabels } from '../../src/subtitles/i18n'
let change: ((changes: Record<string,unknown>, area: string) => void) | undefined
let config: typeof DEFAULT_CONFIG
let send: ReturnType<typeof vi.fn>
const host = () => [...document.querySelectorAll<HTMLElement>('[data-tv-owned]')].find(node=>node.shadowRoot)!
const apply = (patch: Partial<typeof DEFAULT_CONFIG>) => {
 config={...config,...patch}
 change!({'tv:config_v1':{newValue:config}},'local')
}
beforeEach(()=>{
 change=undefined
 vi.resetModules();vi.useFakeTimers()
 config=structuredClone(DEFAULT_CONFIG);config.uiLang='de';config.subtitles.enabled=true;config.subtitles.meet=true
 document.body.innerHTML=''
 vi.stubGlobal('location',{hostname:'teams.live.com',pathname:'/v2/',href:'https://teams.live.com/v2/'})
 send=vi.fn(async(message:any)=>message.kind==='getConfig'?{ok:true,data:config}:{ok:true,data:{text:'Lokale Übersetzung'}})
 vi.stubGlobal('chrome',{runtime:{sendMessage:send},storage:{onChanged:{addListener:(listener:NonNullable<typeof change>)=>{change=listener}}}})
})
afterEach(()=>{
 if(change)apply({subtitles:{...config.subtitles,meet:false}})
 vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();document.body.innerHTML=''
})
const boot=async()=>{(await import('../../src/subtitles/meetings')).startMeetings();await vi.advanceTimersByTimeAsync(0)}
describe('meeting subtitle panels',()=>{
 it('renders and hot-switches its UI language without changing the webpage language',async()=>{
   document.documentElement.lang='en'
   document.body.innerHTML='<button data-tid="turn-on-live-captions" aria-label="Untertitel einschalten"></button>'
   const native=vi.fn();document.querySelector('button')!.addEventListener('click',native)
   await boot()
   expect(host().lang).toBe('de')
   expect(host().shadowRoot!.querySelector('.panel')!.getAttribute('aria-label')).toBe(captionLabels('de').region)
   expect(host().shadowRoot!.querySelector('button')!.textContent).toBe(captionLabels('de').enable)
   host().shadowRoot!.querySelector<HTMLButtonElement>('button')!.click()
   expect(native).toHaveBeenCalledTimes(1)
   apply({uiLang:'fr'})
   expect(host().lang).toBe('fr')
   expect(host().shadowRoot!.querySelector('button')!.textContent).toBe(captionLabels('fr').enable)
   expect(document.documentElement.lang).toBe('en')
 })
 it.each([
   ['teams.live.com','/v2/','data-tid="closed-caption-text"'],
   ['teams.cloud.microsoft','/v2/','data-tid="closed-caption-text"'],
   ['zoom.us','/wc/123','class="live-transcription-subtitle__item"'],
   ['app.zoom.com','/wc/123','class="live-transcription-subtitle__item"'],
   ['meet.google.com','/abc-defg-hij','data-caption-text=""'],
 ])('starts %s subtitles and restores native visibility when disabled',async(hostname,pathname,attribute)=>{
   vi.stubGlobal('location',{hostname,pathname,href:`https://${hostname}${pathname}`})
   document.body.innerHTML=`<div ${attribute} style="visibility:visible">A local synthetic caption.</div>`
   const native=document.body.firstElementChild as HTMLElement
   await boot()
   expect(send.mock.calls.some(([message])=>message.kind==='translate'&&message.text==='A local synthetic caption.')).toBe(true)
   expect(host().shadowRoot!.textContent).toContain('Lokale Übersetzung')
   expect(native.style.visibility).toBe('hidden')
   apply({subtitles:{...config.subtitles,meet:false}})
   expect(host()).toBeUndefined();expect(native.style.visibility).toBe('visible')
 })
 it('starts and stops observing Zoom when SPA navigation enters and leaves a meeting',async()=>{
   vi.stubGlobal('location',{hostname:'app.zoom.com',pathname:'/',href:'https://app.zoom.com/'})
   document.body.innerHTML='<div class="live-transcription-subtitle__item">A local synthetic caption.</div>'
   const native=document.body.firstElementChild as HTMLElement
   await boot();expect(host()).toBeUndefined()
   vi.stubGlobal('location',{hostname:'app.zoom.com',pathname:'/wc/123',href:'https://app.zoom.com/wc/123'})
   await vi.advanceTimersByTimeAsync(1000)
   expect(host().shadowRoot!.textContent).toContain('Lokale Übersetzung')
   vi.stubGlobal('location',{hostname:'app.zoom.com',pathname:'/',href:'https://app.zoom.com/'})
   await vi.advanceTimersByTimeAsync(1000)
   expect(host()).toBeUndefined();expect(native.style.visibility).toBe('')
 })
 it('rejects old-language responses after switching target language',async()=>{
   const pending: Array<{lang:string;resolve:(value:unknown)=>void}>=[]
   send.mockImplementation((message:any)=>message.kind==='getConfig'
     ? Promise.resolve({ok:true,data:config})
     : new Promise(resolve=>pending.push({lang:message.targetLang,resolve})))
   document.body.innerHTML='<div data-tid="closed-caption-text">A local synthetic caption.</div>'
   await boot();expect(pending).toHaveLength(1)
   apply({general:{...config.general,targetLang:'fr'}})
   await vi.advanceTimersByTimeAsync(250)
   expect(pending).toHaveLength(2);expect(pending[1].lang).toBe('fr')
   pending[0].resolve({ok:true,data:{text:'STALE_OLD_LANGUAGE'}})
   await vi.advanceTimersByTimeAsync(0)
   expect(host().shadowRoot!.textContent).not.toContain('STALE_OLD_LANGUAGE')
   pending[1].resolve({ok:true,data:{text:'Traduction française'}})
   await vi.advanceTimersByTimeAsync(0)
   expect(host().shadowRoot!.textContent).toContain('Traduction française')
 })
 it('does not offer or click a native off/pressed control',async()=>{
   document.body.innerHTML='<button data-tid="turn-on-live-captions" aria-label="Turn off captions"></button><button data-tid="turn-on-live-captions" aria-label="Turn on captions" aria-pressed="true"></button>'
   const click=vi.fn();document.querySelectorAll('button').forEach(button=>button.addEventListener('click',click))
   await boot()
   expect(host()).toBeUndefined();expect(click).not.toHaveBeenCalled()
 })
})
