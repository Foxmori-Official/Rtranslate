import hosts from './platforms.json'

export type SubtitlePlatform = keyof typeof hosts
export const SUBTITLE_MATCHES = Object.values(hosts).flat().map(host => `*://${host}/*`)

/** Chrome's *.example.com match includes the bare domain as well as subdomains. */
export function subtitlePlatform(hostname: string): SubtitlePlatform | null {
  const hostnameLower = hostname.toLowerCase()
  for (const [id, patterns] of Object.entries(hosts)) {
    if (patterns.some(pattern => pattern.startsWith('*.')
      ? hostnameLower === pattern.slice(2) || hostnameLower.endsWith(pattern.slice(1))
      : hostnameLower === pattern)) return id as SubtitlePlatform
  }
  return null
}
