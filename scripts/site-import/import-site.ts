#!/usr/bin/env npx tsx
/**
 * OrangeCat Site Import — scrape an existing website into a structured manifest.
 *
 * First step of the site factory pipeline. Output is reviewed by a human before
 * any content lands in a repo or database.
 *
 * Usage:
 *   npx tsx scripts/site-import/import-site.ts https://example.ch
 *   npx tsx scripts/site-import/import-site.ts https://example.ch --out imports/example.json
 *   npx tsx scripts/site-import/import-site.ts https://example.ch --max-pages 8
 *
 * See docs/architecture/site-factory.md
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'

const TIMEOUT_MS = 15_000
const DEFAULT_MAX_PAGES = 12
const COMMON_PATHS = ['/', '/kontakt', '/contact', '/about', '/ueber-uns', '/team', '/services', '/leistungen', '/impressum']

interface SitePage {
  path: string
  url: string
  title: string
  headings: string[]
  paragraphs: string[]
  links: { href: string; text: string }[]
}

interface SiteManifest {
  sourceUrl: string
  scrapedAt: string
  title: string
  description: string
  language: string
  nav: { label: string; href: string }[]
  pages: SitePage[]
  assets: { url: string; type: 'image' | 'icon' | 'stylesheet'; alt?: string }[]
  contact: { emails: string[]; phones: string[]; addresses: string[] }
  styleHints: { primaryColor: string | null; fontFamilies: string[] }
  openSource: { detected: boolean; repoUrl: string | null; license: string | null }
}

function fetchHtml(url: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'))

  const client = url.startsWith('https') ? https : http

  return new Promise((resolve, reject) => {
    const req = client.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'OrangeCatSiteImport/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const loc = res.headers.location
        if (!loc) return reject(new Error('Redirect without location'))
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href
        fetchHtml(next, redirectCount + 1).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function matchAll(html: string, re: RegExp): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  while ((m = r.exec(html))) out.push(m[1] ?? m[0])
  return out
}

function extractNav(html: string, origin: string): { label: string; href: string }[] {
  const navBlock = html.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? html.slice(0, 12000)
  const links: { label: string; href: string }[] = []
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(navBlock))) {
    const href = m[1]
    const label = stripTags(m[2]).slice(0, 80)
    if (!label || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
    try {
      const abs = new URL(href, origin)
      if (abs.origin !== new URL(origin).origin) continue
      links.push({ label, href: abs.pathname + abs.search })
    } catch { /* skip bad URLs */ }
  }
  const seen = new Set<string>()
  return links.filter((l) => {
    if (seen.has(l.href)) return false
    seen.add(l.href)
    return true
  }).slice(0, 20)
}

function extractPage(url: string, html: string): SitePage {
  const origin = new URL(url).origin
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  const headings = matchAll(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi).map(stripTags).filter(Boolean).slice(0, 30)
  const paragraphs = matchAll(html, /<p[^>]*>([\s\S]*?)<\/p>/gi).map(stripTags).filter((p) => p.length > 20).slice(0, 40)

  const links: { href: string; text: string }[] = []
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = m[1]
    const text = stripTags(m[2]).slice(0, 80)
    if (!text || href.startsWith('#')) continue
    try {
      const abs = new URL(href, origin)
      if (abs.origin !== origin) continue
      links.push({ href: abs.pathname, text })
    } catch { /* skip */ }
  }

  return {
    path: new URL(url).pathname || '/',
    url,
    title,
    headings,
    paragraphs,
    links: links.slice(0, 50),
  }
}

function extractAssets(html: string, origin: string): SiteManifest['assets'] {
  const assets: SiteManifest['assets'] = []
  for (const src of matchAll(html, /<img[^>]+src=["']([^"']+)["']/gi)) {
    try {
      assets.push({ url: new URL(src, origin).href, type: 'image', alt: undefined })
    } catch { /* skip */ }
  }
  for (const href of matchAll(html, /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)) {
    try {
      assets.push({ url: new URL(href, origin).href, type: 'stylesheet' })
    } catch { /* skip */ }
  }
  return assets.slice(0, 40)
}

function extractContact(text: string): SiteManifest['contact'] {
  const emails = [...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])].slice(0, 5)
  const phones = [...new Set(text.match(/(?:\+41|0)[\s\d]{8,16}/g) ?? [])].map((p) => p.trim()).slice(0, 5)
  return { emails, phones, addresses: [] }
}

function extractStyleHints(html: string): SiteManifest['styleHints'] {
  const colors = matchAll(html, /#(?:[0-9a-fA-F]{3}){1,2}\b/g).slice(0, 10)
  const fonts = matchAll(html, /font-family:\s*([^;"']+)/gi).map((f) => f.split(',')[0].trim()).filter(Boolean)
  return {
    primaryColor: colors[0] ?? null,
    fontFamilies: [...new Set(fonts)].slice(0, 5),
  }
}

function detectOpenSource(html: string): SiteManifest['openSource'] {
  const gh = html.match(/https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/)?.[0] ?? null
  const license = html.match(/MIT License|Apache License 2\.0|GPL-3\.0|BSD-3-Clause/i)?.[0] ?? null
  return {
    detected: !!(gh && license),
    repoUrl: gh,
    license,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const urlArg = args.find((a) => a.startsWith('http'))
  if (!urlArg) {
    console.error('Usage: import-site.ts <url> [--out path.json] [--max-pages N]')
    process.exit(1)
  }

  const outIdx = args.indexOf('--out')
  const maxIdx = args.indexOf('--max-pages')
  const maxPages = maxIdx >= 0 ? parseInt(args[maxIdx + 1] ?? '', 10) : DEFAULT_MAX_PAGES
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null

  const origin = new URL(urlArg).origin
  console.error(`Fetching ${urlArg}...`)
  const homeHtml = await fetchHtml(urlArg)

  const lang = homeHtml.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] ?? 'de'
  const description = stripTags(
    homeHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    homeHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ??
    ''
  )

  const nav = extractNav(homeHtml, origin)
  const pathsToFetch = new Set<string>(['/', ...COMMON_PATHS, ...nav.map((n) => n.href)])
  const pages: SitePage[] = []
  const allAssets: SiteManifest['assets'] = []
  let allText = stripTags(homeHtml)

  for (const p of [...pathsToFetch].slice(0, maxPages)) {
    const pageUrl = new URL(p, origin).href
    try {
      const html = p === '/' || pageUrl === urlArg ? homeHtml : await fetchHtml(pageUrl)
      pages.push(extractPage(pageUrl, html))
      allAssets.push(...extractAssets(html, origin))
      allText += ' ' + stripTags(html)
      console.error(`  ✓ ${p}`)
    } catch (e) {
      console.error(`  ✗ ${p}: ${e instanceof Error ? e.message : e}`)
    }
  }

  const manifest: SiteManifest = {
    sourceUrl: urlArg,
    scrapedAt: new Date().toISOString(),
    title: stripTags(homeHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    description,
    language: lang,
    nav,
    pages,
    assets: [...new Map(allAssets.map((a) => [a.url, a])).values()],
    contact: extractContact(allText),
    styleHints: extractStyleHints(homeHtml),
    openSource: detectOpenSource(homeHtml),
  }

  const json = JSON.stringify(manifest, null, 2)
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, json)
    console.error(`Wrote ${outPath}`)
  } else {
    console.log(json)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
