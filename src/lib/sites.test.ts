import { describe, expect, it } from 'vitest'
import { manageLink } from './catalog'
import {
  brandFromDomain,
  candidateDomains,
  categoryFromText,
  isDomain,
  parseSite,
  pickOfficial,
  translit,
} from './sites'

describe('links and domains', () => {
  it('reads the site from links and bare domains', () => {
    expect(parseSite('https://tembo.io')).toEqual({ domain: 'tembo.io', url: 'https://tembo.io' })
    expect(parseSite('https://www.tembo.io/pricing?ref=1')).toEqual({
      domain: 'tembo.io',
      url: 'https://www.tembo.io/pricing?ref=1',
    })
    expect(parseSite('tembo.io')?.domain).toBe('tembo.io')
    expect(parseSite('  Netflix.com/browse ')?.domain).toBe('netflix.com')
    expect(parseSite('app.notion.so/settings')?.domain).toBe('notion.so')
    expect(parseSite('http://music.youtube.com')?.domain).toBe('music.youtube.com')
    expect(parseSite('obsidian.md')?.domain).toBe('obsidian.md')
    expect(parseSite('кинопоиск.рф')?.domain).toBe('xn--h1aaecngahu.xn--p1ai')
  })

  it('leaves plain names alone', () => {
    for (const name of [
      'Tembo',
      'Disney+',
      'iCloud+',
      'Aqua Voice',
      '1Password',
      'tembo.',
      'ftp://x.com',
    ]) {
      expect(parseSite(name)).toBeNull()
    }
    expect(isDomain('tembo.io')).toBe(true)
    expect(isDomain('tembo')).toBe(false)
  })

  it('turns a domain into a service name', () => {
    expect(brandFromDomain('tembo.io')).toBe('Tembo')
    expect(brandFromDomain('open.spotify.com')).toBe('Spotify')
    expect(brandFromDomain('aqua-voice.com')).toBe('Aqua Voice')
    expect(brandFromDomain('bbc.co.uk')).toBe('Bbc')
  })
})

describe('domain guesses', () => {
  it('tries the usual zones, .io before .ai', () => {
    const d = candidateDomains('Tembo')
    expect(d.slice(0, 4)).toEqual(['tembo.com', 'tembo.io', 'tembo.ai', 'tembo.app'])
  })

  it('drops plan words and joins words', () => {
    expect(candidateDomains('Cursor Pro')[0]).toBe('cursor.com')
    expect(candidateDomains('Aqua Voice')).toContain('aquavoice.com')
    expect(candidateDomains('Aqua Voice')).toContain('aqua-voice.com')
    expect(candidateDomains('Super Tool+')).toContain('supertoolplus.com')
  })

  it('transliterates Cyrillic and tries .ru first', () => {
    expect(translit('кинопоиск')).toBe('kinopoisk')
    expect(candidateDomains('Тембо')[0]).toBe('tembo.ru')
    expect(candidateDomains('Тембо')).toContain('tembo.com')
    expect(candidateDomains('!!')).toEqual([])
  })
})

describe('Wikidata', () => {
  const entities = {
    entities: {
      Q1: {
        claims: { P856: [{ mainsnak: { datavalue: { value: 'https://www.onepeloton.com' } } }] },
      },
      Q2: {
        claims: { P856: [{ mainsnak: { datavalue: { value: 'https://rmc.bfmtv.com/podcast' } } }] },
      },
      Q3: {
        claims: {
          P856: [{ mainsnak: { datavalue: { value: 'http://www.sega.com/games/tembo' } } }],
        },
      },
    },
  }

  it('keeps official sites of matching services only', () => {
    const search = {
      search: [
        { id: 'Q2', label: 'Peloton', description: 'French podcast' },
        {
          id: 'Q1',
          label: 'Peloton',
          description: 'American exercise equipment and media company',
        },
        { id: 'Q3', label: 'Peloton', description: '2015 video game' },
      ],
    }
    expect(pickOfficial('peloton', search, entities)).toEqual([
      { domain: 'onepeloton.com', category: 'health' },
    ])
    expect(pickOfficial('netflix', search, entities)).toEqual([])
  })
})

describe('categories from descriptions', () => {
  it('maps Wikidata descriptions to app categories', () => {
    expect(categoryFromText('knowledge base and note-taking software')).toBe('work')
    expect(categoryFromText('video on demand service')).toBe('video')
    expect(categoryFromText('VPN service')).toBe('cloud')
    expect(categoryFromText('AI chatbot developed by OpenAI')).toBe('ai')
    expect(categoryFromText('language learning website')).toBe('learning')
    expect(categoryFromText('fitness app')).toBe('health')
    expect(categoryFromText('something else')).toBeUndefined()
  })
})

describe('manage links', () => {
  it('knows where to cancel popular services', () => {
    expect(manageLink('Netflix')).toBe('https://www.netflix.com/cancelplan')
    expect(manageLink('Мой Spotify', 'spotify.com')).toBe(
      'https://www.spotify.com/account/subscription/',
    )
    expect(manageLink('iCloud+')).toContain('apps.apple.com')
    expect(manageLink('Tembo')).toBeNull()
  })
})
