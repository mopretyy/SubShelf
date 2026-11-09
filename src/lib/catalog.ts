import type { Category } from './dates'

/** Offline catalog: popular services, matched instantly by name or alias without any network. */
export interface CatalogEntry {
  name: string
  domain: string
  category: Category
  aliases: string[]
}

const RAW: [string, string, Category, string[]][] = [
  ['Netflix', 'netflix.com', 'video', ['нетфликс']],
  ['Spotify Premium', 'spotify.com', 'music', ['spotify', 'спотифай']],
  ['YouTube Premium', 'youtube.com', 'video', ['youtube', 'ютуб']],
  ['YouTube Music', 'music.youtube.com', 'music', ['ютуб музыка']],
  ['ChatGPT Plus', 'chatgpt.com', 'ai', ['chatgpt', 'openai', 'чатгпт', 'gpt']],
  ['Claude Pro', 'claude.ai', 'ai', ['claude', 'anthropic', 'клод']],
  ['Gemini Advanced', 'gemini.google.com', 'ai', ['gemini', 'гемини']],
  ['Perplexity Pro', 'perplexity.ai', 'ai', ['perplexity']],
  ['Cursor Pro', 'cursor.com', 'ai', ['cursor', 'курсор']],
  ['GitHub Copilot', 'github.com', 'ai', ['copilot', 'github']],
  ['Midjourney', 'midjourney.com', 'ai', ['mj']],
  ['Aqua Voice', 'aquavoice.com', 'ai', ['aqua']],
  ['Hoplite', 'hoplite.sh', 'ai', ['хоплит']],
  ['Notion Plus', 'notion.so', 'work', ['notion', 'ноушн']],
  ['Figma Professional', 'figma.com', 'work', ['figma', 'фигма']],
  ['Canva Pro', 'canva.com', 'work', ['canva', 'канва']],
  ['Adobe Creative Cloud', 'adobe.com', 'work', ['adobe', 'photoshop', 'адоб']],
  ['Dropbox Plus', 'dropbox.com', 'cloud', ['dropbox']],
  ['Google One', 'one.google.com', 'cloud', ['google', 'гугл']],
  ['iCloud+', 'icloud.com', 'cloud', ['icloud', 'айклауд']],
  ['Apple Music', 'music.apple.com', 'music', ['apple music', 'эпл']],
  ['Apple TV+', 'tv.apple.com', 'video', ['apple tv']],
  ['Disney+', 'disneyplus.com', 'video', ['disney', 'дисней']],
  ['Prime Video', 'primevideo.com', 'video', ['amazon', 'prime', 'амазон']],
  ['HBO Max', 'max.com', 'video', ['hbo', 'max']],
  ['Twitch Turbo', 'twitch.tv', 'video', ['twitch', 'твич']],
  ['Discord Nitro', 'discord.com', 'social', ['discord', 'nitro', 'дискорд']],
  ['Telegram Premium', 'telegram.org', 'social', ['telegram', 'телеграм']],
  ['Xbox Game Pass', 'xbox.com', 'games', ['xbox', 'game pass', 'иксбокс']],
  ['PlayStation Plus', 'playstation.com', 'games', ['ps plus', 'playstation', 'плейстейшен']],
  ['Nintendo Switch Online', 'nintendo.com', 'games', ['nintendo']],
  ['EA Play', 'ea.com', 'games', ['ea']],
  ['Ubisoft+', 'ubisoft.com', 'games', ['ubisoft', 'юбисофт']],
  ['Steam', 'steampowered.com', 'games', ['стим']],
  ['Chess.com', 'chess.com', 'learning', ['chess', 'шахматы']],
  ['Duolingo Super', 'duolingo.com', 'learning', ['duolingo', 'дуолинго']],
  ['Coursera Plus', 'coursera.org', 'learning', ['coursera']],
  ['LinkedIn Premium', 'linkedin.com', 'social', ['linkedin', 'линкедин']],
  ['X Premium', 'x.com', 'social', ['twitter', 'твиттер']],
  ['Yandex Plus', 'plus.yandex.ru', 'video', ['yandex', 'яндекс', 'яндекс плюс']],
  ['Кинопоиск', 'kinopoisk.ru', 'video', ['kinopoisk']],
  ['VK Музыка', 'vk.com', 'music', ['vk', 'вк', 'вконтакте']],
  ['Okko', 'okko.tv', 'video', ['окко']],
  ['IVI', 'ivi.ru', 'video', ['иви']],
  ['Boosty', 'boosty.to', 'social', ['бусти']],
  ['Patreon', 'patreon.com', 'social', ['патреон']],
  ['NordVPN', 'nordvpn.com', 'cloud', ['nord', 'vpn']],
  ['ExpressVPN', 'expressvpn.com', 'cloud', ['express']],
  ['TunnelBear', 'tunnelbear.com', 'cloud', ['tunnel']],
  ['Proton', 'proton.me', 'cloud', ['protonmail', 'proton vpn']],
  ['1Password', '1password.com', 'cloud', ['1pass']],
  ['Microsoft 365', 'microsoft.com', 'work', ['office', 'microsoft', 'майкрософт']],
  ['Zoom', 'zoom.us', 'work', ['зум']],
  ['Slack', 'slack.com', 'work', ['слак']],
  ['Gamma', 'gamma.app', 'ai', ['гамма']],
  ['ElevenLabs', 'elevenlabs.io', 'ai', ['eleven']],
  ['Grammarly', 'grammarly.com', 'work', ['грамарли']],
  ['Strava', 'strava.com', 'health', ['страва']],
  ['Headspace', 'headspace.com', 'health', []],
  ['Audible', 'audible.com', 'music', []],
  ['Kindle Unlimited', 'amazon.com', 'learning', ['kindle']],
  ['Crunchyroll', 'crunchyroll.com', 'video', ['кранчиролл']],
  ['Deezer', 'deezer.com', 'music', []],
  ['Tidal', 'tidal.com', 'music', []],
  ['SoundCloud Go', 'soundcloud.com', 'music', ['soundcloud']],
  ['Netlify Pro', 'netlify.com', 'work', ['netlify']],
  ['Vercel Pro', 'vercel.com', 'work', ['vercel']],
  ['Supabase', 'supabase.com', 'work', []],
  ['JetBrains', 'jetbrains.com', 'work', ['intellij', 'webstorm']],
  ['Apple One', 'apple.com', 'cloud', ['apple one']],
  ['Amazon Prime', 'amazon.com', 'video', ['prime membership']],
  ['Google Play Pass', 'play.google.com', 'games', ['play pass']],
  ['Paramount+', 'paramountplus.com', 'video', ['paramount']],
  ['Hulu', 'hulu.com', 'video', []],
  ['Peacock', 'peacocktv.com', 'video', []],
  ['Wink', 'wink.ru', 'video', ['винк']],
  ['START', 'start.ru', 'video', ['старт']],
  ['PREMIER', 'premier.one', 'video', ['премьер']],
  ['Яндекс Музыка', 'music.yandex.ru', 'music', ['yandex music']],
  ['Яндекс 360', '360.yandex.ru', 'cloud', ['yandex 360', 'яндекс диск']],
  ['СберПрайм', 'sberprime.sber.ru', 'video', ['sberprime', 'сбер']],
  ['Ozon Premium', 'ozon.ru', 'other', ['ozon', 'озон']],
  ['Т-Банк Pro', 'tbank.ru', 'other', ['тинькофф', 'tinkoff', 't-bank']],
  ['SuperGrok', 'grok.com', 'ai', ['grok', 'грок']],
  ['Microsoft Copilot Pro', 'copilot.microsoft.com', 'ai', ['copilot pro']],
  ['DeepL Pro', 'deepl.com', 'ai', ['deepl']],
  ['Bitwarden', 'bitwarden.com', 'cloud', []],
  ['Surfshark', 'surfshark.com', 'cloud', ['сёрфшарк']],
  ['Evernote', 'evernote.com', 'work', []],
  ['Todoist Pro', 'todoist.com', 'work', ['todoist']],
  ['Linear', 'linear.app', 'work', []],
  ['Raycast Pro', 'raycast.com', 'work', ['raycast']],
  ['Setapp', 'setapp.com', 'work', []],
  ['CapCut Pro', 'capcut.com', 'work', ['capcut']],
  ['Tinder', 'tinder.com', 'social', ['тиндер']],
  ['Bumble', 'bumble.com', 'social', []],
  ['Calm', 'calm.com', 'health', []],
  ['MyFitnessPal', 'myfitnesspal.com', 'health', ['fitnesspal']],
  ['Apple Fitness+', 'apple.com', 'health', ['fitness+', 'apple fitness']],
  ['Storytel', 'storytel.com', 'music', ['сторител']],
  ['Литрес', 'litres.ru', 'learning', ['litres', 'литрес']],
]

export const CATALOG: CatalogEntry[] = RAW.map(([name, domain, category, aliases]) => ({
  name,
  domain,
  category,
  aliases,
}))

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

/** Up to `limit` entries whose name, a word of the name, or an alias starts with the query. */
export function searchCatalog(query: string, limit = 3): CatalogEntry[] {
  const q = norm(query)
  if (!q) return []
  const scored: [number, CatalogEntry][] = []
  for (const c of CATALOG) {
    const n = norm(c.name)
    let score = -1
    if (n === q || c.aliases.some((a) => a === q)) score = 3
    else if (n.startsWith(q)) score = 2
    else if (n.split(' ').some((w) => w.startsWith(q)) || c.aliases.some((a) => a.startsWith(q)))
      score = 1
    if (score >= 0) scored.push([score, c])
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length)
    .slice(0, limit)
    .map(([, c]) => c)
}

/** Best confident match for a typed name: exact name/alias, or the only prefix hit. */
export function matchCatalog(name: string): CatalogEntry | null {
  const q = norm(name)
  if (q.length < 2) return null
  const exact = CATALOG.find((c) => norm(c.name) === q || c.aliases.includes(q))
  if (exact) return exact
  const hits = searchCatalog(q, 2)
  return hits.length === 1 ? hits[0] : null
}
