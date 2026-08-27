#!/usr/bin/env node
// fork-diff.mjs — generate an HTML visual diff of everything this fork changes
// relative to the upstream base (00-Evan/shattered-pixel-dungeon).
//
// Usage:  node fork-diff.mjs [--no-fetch] [--no-open]
//   --no-fetch  skip refreshing upstream before diffing (works offline)
//   --no-open   just write fork-diff.html, don't open the browser
//
// The diff is taken from merge-base(HEAD, upstream/master) against the working
// tree, so uncommitted local edits are included too.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));

function git(...a) {
  return execFileSync('git', a, { cwd: repoDir, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 }).trimEnd();
}

if (!args.has('--no-fetch')) {
  try {
    process.stdout.write('Fetching upstream... ');
    git('fetch', 'upstream');
    console.log('done');
  } catch {
    console.warn('fetch failed (offline?), diffing against last-known upstream');
  }
}

const base = git('merge-base', 'HEAD', 'upstream/master');
const describe = (ref) => git('log', '-1', '--format=%h  %ad  %s', '--date=short', ref);
const baseInfo = describe(base);
const headInfo = describe('HEAD');
const upstreamInfo = describe('upstream/master');
const dirty = git('status', '--porcelain') !== '';

const rawDiff = git('diff', '--no-color', base);
const numstat = git('diff', '--numstat', base);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- parse the unified diff into files/hunks -------------------------------
const files = [];
for (const chunk of rawDiff.split(/^(?=diff --git )/m)) {
  if (!chunk.startsWith('diff --git ')) continue;
  const lines = chunk.split('\n');
  let path = lines[0].replace(/^diff --git a\/(.*) b\/.*$/, '$1');
  const renameTo = lines.find((l) => l.startsWith('rename to '));
  if (renameTo) path += ' → ' + renameTo.slice('rename to '.length);
  const file = { path, binary: /^Binary files /m.test(chunk), hunks: [], adds: 0, dels: 0 };
  let hunk = null, oldN = 0, newN = 0;
  for (const line of lines) {
    const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (m) {
      oldN = +m[1]; newN = +m[2];
      hunk = { header: line, rows: [] };
      file.hunks.push(hunk);
    } else if (hunk) {
      if (line.startsWith('+')) { hunk.rows.push(['add', '', newN++, line.slice(1)]); file.adds++; }
      else if (line.startsWith('-')) { hunk.rows.push(['del', oldN++, '', line.slice(1)]); file.dels++; }
      else if (line.startsWith(' ') || line === '') hunk.rows.push(['ctx', oldN++, newN++, line.slice(1)]);
      else if (line.startsWith('\\')) hunk.rows.push(['meta', '', '', line]);
    }
  }
  files.push(file);
}

// ---- render ----------------------------------------------------------------
const totalAdds = files.reduce((n, f) => n + f.adds, 0);
const totalDels = files.reduce((n, f) => n + f.dels, 0);
const anchor = (p) => 'f-' + p.replace(/[^\w.-]/g, '_');

const fileSections = files.map((f) => `
<details open class="file" id="${anchor(f.path)}">
<summary><span class="fp">${esc(f.path)}</span>
  <span class="counts"><span class="a">+${f.adds}</span> <span class="d">−${f.dels}</span></span></summary>
${f.binary ? '<div class="binary">binary file changed</div>' : f.hunks.map((h) => `
<div class="hunkhdr">${esc(h.header)}</div>
<table class="hunk">${h.rows.map(([cls, o, n, text]) =>
  `<tr class="${cls}"><td class="ln">${o}</td><td class="ln">${n}</td><td class="code">${esc(text)}</td></tr>`
).join('\n')}</table>`).join('\n')}
</details>`).join('\n');

const toc = files.map((f) =>
  `<li><a href="#${anchor(f.path)}">${esc(f.path)}</a> <span class="a">+${f.adds}</span> <span class="d">−${f.dels}</span></li>`
).join('\n');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<title>Fork diff vs upstream — shattered-pixel-dungeon</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.45 system-ui, sans-serif; margin: 0; background: #fff; color: #1f2328; }
  header { padding: 16px 24px; border-bottom: 1px solid #d1d9e0; background: #f6f8fa; position: sticky; top: 0; }
  header h1 { font-size: 18px; margin: 0 0 6px; }
  header .meta { font: 12px/1.6 ui-monospace, Consolas, monospace; color: #59636e; white-space: pre; }
  main { padding: 16px 24px 60px; max-width: 1200px; margin: 0 auto; }
  .a { color: #1a7f37; font-weight: 600; }
  .d { color: #cf222e; font-weight: 600; }
  ul.toc { border: 1px solid #d1d9e0; border-radius: 8px; padding: 10px 28px; background: #f6f8fa; }
  ul.toc a { text-decoration: none; }
  details.file { border: 1px solid #d1d9e0; border-radius: 8px; margin: 16px 0; overflow: hidden; }
  details.file > summary { cursor: pointer; padding: 8px 12px; background: #f6f8fa;
    font: 600 13px ui-monospace, Consolas, monospace; display: flex; justify-content: space-between; }
  .hunkhdr { font: 12px ui-monospace, Consolas, monospace; color: #59636e; background: #ddf4ff; padding: 4px 12px; }
  table.hunk { border-collapse: collapse; width: 100%; font: 12px/1.5 ui-monospace, Consolas, monospace; }
  td.ln { width: 44px; min-width: 44px; text-align: right; padding: 0 8px; color: #59636e; user-select: none;
    background: #f6f8fa; border-right: 1px solid #d1d9e0; }
  td.code { padding: 0 10px; white-space: pre-wrap; word-break: break-all; }
  tr.add td.code { background: #dafbe1; } tr.add td.ln { background: #aceebb; }
  tr.del td.code { background: #ffebe9; } tr.del td.ln { background: #ffcecb; }
  tr.meta td.code { color: #59636e; }
  .binary { padding: 12px; color: #59636e; font-style: italic; }
  .empty { padding: 40px; text-align: center; color: #59636e; font-size: 16px; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; }
    header, ul.toc, details.file > summary, td.ln { background: #161b22; }
    header, ul.toc, details.file { border-color: #30363d; }
    td.ln { border-color: #30363d; }
    .hunkhdr { background: #121d2f; }
    tr.add td.code { background: #12261e; } tr.add td.ln { background: #1b4721; }
    tr.del td.code { background: #25171c; } tr.del td.ln { background: #542426; }
  }
</style></head>
<body>
<header>
  <h1>Fork changes vs upstream base <span class="a">+${totalAdds}</span> <span class="d">−${totalDels}</span>
      <small>(${files.length} file${files.length === 1 ? '' : 's'})</small></h1>
  <div class="meta">base (merge-base): ${esc(baseInfo)}
fork HEAD:         ${esc(headInfo)}${dirty ? '  [+ uncommitted changes]' : ''}
upstream/master:   ${esc(upstreamInfo)}
generated:         ${new Date().toLocaleString()}</div>
</header>
<main>
${files.length === 0 ? '<div class="empty">No differences — fork matches the upstream base.</div>'
  : `<ul class="toc">${toc}</ul>\n${fileSections}`}
</main>
</body></html>`;

const outPath = join(repoDir, 'fork-diff.html');
writeFileSync(outPath, html);
console.log(`Wrote ${outPath}  (${files.length} changed file(s), +${totalAdds} −${totalDels})`);
if (numstat) console.log(numstat);

if (!args.has('--no-open')) {
  execFileSync('cmd', ['/c', 'start', '', outPath]);
}
