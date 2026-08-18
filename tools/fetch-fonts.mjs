// tools/fetch-fonts.mjs — 一次性工具：从 Google Fonts 下载自托管字体并生成 css/fonts.css
// 用法：node tools/fetch-fonts.mjs
// 规则（docs/03-技术方案.md 第4节）：
//   - 拉丁字体只保留 latin 分片；Noto Serif SC 保留全部 unicode-range 分片
//   - 生成 css/fonts.css（@font-face 声明，路径指向本地 fonts/），此文件勿手改
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = join(root, 'fonts');
mkdirSync(fontsDir, { recursive: true });

const FAMILIES = [
  'Playfair+Display:wght@700;900',
  'Lora:ital,wght@0,400;0,700;1,400',
  'Inter:wght@400;600;700',
  'JetBrains+Mono:wght@400;700',
  'Noto+Serif+SC:wght@400;700;900',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const cssUrl = 'https://fonts.googleapis.com/css2?' + FAMILIES.map(f => 'family=' + f).join('&') + '&display=swap';

console.log('拉取字体 CSS…');
const res = await fetch(cssUrl, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error('HTTP ' + res.status);
const css = await res.text();

// 解析 @font-face 块（前导注释可选：CJK 分片通常没有注释）
const blocks = [];
const blockRe = /(?:\/\*\s*(.+?)\s*\*\/)?\s*@font-face\s*\{([^}]+)\}/g;
for (const m of css.matchAll(blockRe)) blocks.push({ subset: m[1] ? m[1].trim() : null, body: m[2].trim() });

// 拉丁家族只保留 latin 分片；CJK 家族全留
const isLatinFamily = body => !/Noto Serif SC/i.test(body);
const kept = blocks.filter(b => !isLatinFamily(b.body) || b.subset === 'latin');
console.log(`共 ${blocks.length} 个分片，保留 ${kept.length} 个`);

const counters = {}; // slug -> 序号
const downloads = []; // { url, file }
let out = '/* 自动生成：tools/fetch-fonts.mjs — 勿手改 */\n';

for (const b of kept) {
  const fam = (b.body.match(/font-family:\s*'([^']+)'/) || [])[1] || 'font';
  const style = /font-style:\s*italic/.test(b.body) ? 'italic' : 'normal';
  const weight = (b.body.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
  const url = (b.body.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
  if (!url) throw new Error('未找到 woff2 地址：' + b.body.slice(0, 80));
  const slug = fam.toLowerCase().replace(/\s+/g, '-');
  const key = `${slug}-${weight}${style === 'italic' ? '-italic' : ''}`;
  counters[key] = (counters[key] || 0) + 1;
  const file = `${key}-${counters[key]}.woff2`;
  downloads.push({ url, file });
  const localBody = b.body.replace(/url\(https:[^)]+\.woff2\)/, `url("../fonts/${file}")`);
  out += (b.subset ? `/* ${b.subset} */\n` : '') + `@font-face { ${localBody} }\n`;
}

writeFileSync(join(root, 'css', 'fonts.css'), out);
console.log(`已生成 css/fonts.css（${kept.length} 条 @font-face）`);

// 并发下载（限流 10）
let done = 0;
const queue = [...downloads];
async function worker() {
  while (queue.length) {
    const { url, file } = queue.shift();
    const dest = join(fontsDir, file);
    if (existsSync(dest)) { done++; continue; }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
        done++;
        if (done % 50 === 0) console.log(`已下载 ${done}/${downloads.length}`);
        break;
      } catch (e) {
        if (attempt === 2) throw new Error(`${file} 下载失败: ${e.message}`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
}
await Promise.all(Array.from({ length: 10 }, () => worker()));
console.log(`全部完成：${done} 个 woff2 → fonts/`);
