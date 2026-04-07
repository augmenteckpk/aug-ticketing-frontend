import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../src/', import.meta.url))
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html'])
const badPatterns = [
  'â†',
  'â€”',
  'â€¦',
  'â€œ',
  'â€',
  'â€¢',
  'Â·',
  'Â«',
  'Â»',
  'Ø',
  'Ù',
  'Û',
]

/** Skip known-safe minified/vendor content; scan app source only */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (exts.has(extname(p))) out.push(p)
  }
  return out
}

const files = walk(ROOT)
const hits = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const p of badPatterns) {
    if (text.includes(p)) {
      hits.push({ file, pattern: p })
      break
    }
  }
}

if (hits.length) {
  console.error('Mojibake check failed. Found likely broken text encoding:')
  for (const h of hits) console.error(`- ${h.file} (contains "${h.pattern}")`)
  process.exit(1)
}

console.log('Mojibake check passed.')
