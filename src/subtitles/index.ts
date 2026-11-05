// 字幕翻译内容脚本入口：按站点分发到 YouTube / 会议平台
import { startYouTube } from './youtube'
import { startMeetings } from './meetings'
import { subtitlePlatform } from './platforms'

const platform = subtitlePlatform(location.hostname)

const w = window as unknown as { __TV_SUBTITLES_INJECTED__?: boolean }
if (!w.__TV_SUBTITLES_INJECTED__) {
  w.__TV_SUBTITLES_INJECTED__ = true
  if (platform === 'youtube') startYouTube()
  else if (platform) startMeetings()
}

export {}
