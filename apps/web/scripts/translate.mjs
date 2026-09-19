/**
 * Auto-translate src/messages/ja.json → src/messages/en.json
 * using Google Translate's free (unofficial) endpoint.
 *
 * Usage:
 *   node scripts/translate.mjs
 *   # or add to package.json: "translate": "node scripts/translate.mjs"
 *
 * Already-translated keys in en.json are preserved (incremental updates).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(__dirname, '../src/messages');
const SOURCE_LANG = 'ja';
const TARGET_LANG = 'en';
const DELAY_MS = 180; // delay between requests to avoid rate limiting

/** Call Google Translate free endpoint */
async function translateText(text) {
  if (!text || typeof text !== 'string') return text;
  // Skip pure-symbol strings like "{count} / {limit}", "→", etc.
  if (/^[\s{}.\d/:→+*#@!]+$/.test(text)) return text;

  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=${SOURCE_LANG}&tl=${TARGET_LANG}&dt=t` +
    `&q=${encodeURIComponent(text)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // data[0] is an array of [translated_chunk, original_chunk] pairs
    return data[0].map((item) => item[0]).join('');
  } catch (err) {
    console.warn(`\n  ⚠ Could not translate "${text.slice(0, 40)}…": ${err.message}`);
    return text; // fall back to source
  }
}

/**
 * Recursively translate a JSON object.
 * @param {object} src  - source (ja) object
 * @param {object} ext  - existing (en) object to preserve already-translated keys
 */
async function mergeTranslate(src, ext = {}) {
  const result = {};
  for (const [key, value] of Object.entries(src)) {
    if (value !== null && typeof value === 'object') {
      result[key] = await mergeTranslate(value, ext[key] ?? {});
    } else if (typeof value === 'string') {
      const existing = ext[key];
      if (existing && existing !== value) {
        // Key already translated (different from Japanese source) — keep it
        result[key] = existing;
      } else {
        process.stdout.write(`  Translating [${key}]...   \r`);
        result[key] = await translateText(value);
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── Main ────────────────────────────────────────────────────────────────────

const sourceFile = path.join(MESSAGES_DIR, `${SOURCE_LANG}.json`);
const targetFile = path.join(MESSAGES_DIR, `${TARGET_LANG}.json`);

if (!fs.existsSync(sourceFile)) {
  console.error(`❌ Source file not found: ${sourceFile}`);
  process.exit(1);
}

console.log(`🌐  Auto-translating ${SOURCE_LANG}.json → ${TARGET_LANG}.json\n`);

const source = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));

let existing = {};
if (fs.existsSync(targetFile)) {
  try {
    existing = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    console.log('📖  Found existing en.json — already-translated keys will be preserved\n');
  } catch {
    console.warn('⚠  Could not parse existing en.json — starting fresh\n');
  }
}

const translated = await mergeTranslate(source, existing);

fs.writeFileSync(targetFile, JSON.stringify(translated, null, 2) + '\n', 'utf-8');
console.log(`\n\n✅  Done! Saved to: ${targetFile}`);
