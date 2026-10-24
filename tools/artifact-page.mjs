// Turns dist/ into a page body suitable for publishing as a hosted artifact (the host supplies <html>/<head>/<body>).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const js = (html.match(/src="\.\/(assets\/[^"]+\.js)"/) || [])[1];
const css = (html.match(/href="\.\/(assets\/[^"]+\.css)"/) || [])[1];
if (!js || !css) throw new Error('could not find built assets in dist/index.html');
const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'Princess Park'])[1];
const icon = (html.match(/<link rel="icon"[^>]*>/) || [''])[0];
const page = `<title>${title}</title>
${icon}
<link rel="stylesheet" href="${css}" />
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}</style>
<div id="app">
  <canvas id="game"></canvas>
  <div id="ui-root"></div>
</div>
<script type="module" src="${js}"></script>
`;
writeFileSync('dist/artifact.html', page);
console.log(JSON.stringify({ js, css, files: readdirSync('dist/assets') }));
