/**
 * 从 CHANGELOG.md 中取出当前版本的说明，写入 release-notes.md。
 * 供 .github/workflows/release.yml 使用；独立成文件比在 YAML 里内嵌
 * 一大段带转义的 JS 可靠得多。
 */
import fs from 'node:fs';

/**
 * 取出与 version 对应的 CHANGELOG 段落。
 * @param {string} md CHANGELOG 全文
 * @param {string} version 形如 0.4.0
 * @returns {string|undefined}
 */
function sectionOf(md, version) {
  const escaped = version.replace(/\./g, '\\.');
  // 从本版本标题开始，直到下一个版本标题或文件末尾
  const re = new RegExp(`^## \\[${escaped}\\][\\s\\S]*?(?=^## \\[|(?![\\s\\S]))`, 'm');
  const match = md.match(re);
  return match === null ? undefined : match[0].trim();
}

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
let body = `本次发布 ${version}。`;

if (fs.existsSync('CHANGELOG.md')) {
  const section = sectionOf(fs.readFileSync('CHANGELOG.md', 'utf8'), version);
  if (section !== undefined) {
    body = section;
  } else {
    // 没有对应条目时说清楚，避免发出一个空白 Release
    console.warn(`CHANGELOG.md 中没有 ${version} 的条目，使用默认说明`);
  }
}

fs.writeFileSync('release-notes.md', `${body}\n`, 'utf8');
console.log(`已写入 release-notes.md（${body.length} 字符）`);
