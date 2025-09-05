/**
 * generate-3d-calendar.js
 * - Fetches the public contributions SVG from github.com/users/<owner>/contributions
 * - Parses the <rect> day nodes and builds a simple "3D" block SVG (solid color)
 * - Writes to dist/profile-3d-contrib.svg
 *
 * No tokens required.
 */

const fs = require('fs');
const path = require('path');

const owner = process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_REPOSITORY.split('/')[0]
  : 'foevertigo'; // fallback - replace if needed

const outDir = path.join(process.cwd(), 'dist');
const outFile = path.join(outDir, 'profile-3d-contrib.svg');

const CONTRIBUTIONS_URL = `https://github.com/users/${owner}/contributions`;

// Map count -> height and color intensity (solid green palette)
function countToHeight(count) {
  if (count <= 0) return 0;
  if (count <= 1) return 6;
  if (count <= 3) return 10;
  if (count <= 6) return 16;
  if (count <= 12) return 24;
  return 32;
}
function countToColor(count) {
  if (count <= 0) return '#ebedf0'; // empty light background
  if (count <= 1) return '#9be9a8';
  if (count <= 3) return '#40c463';
  if (count <= 6) return '#30a14e';
  return '#216e39';
}

(async () => {
  try {
    const res = await fetch(CONTRIBUTIONS_URL, { headers: { 'User-Agent': 'calendar-generator' }});
    if (!res.ok) throw new Error(`Failed to fetch contributions page: ${res.status}`);
    const html = await res.text();

    // find all <rect ... data-date="..." data-count="N" ... />
    const rectRegex = /<rect[^>]*data-date="([^"]+)"[^>]*data-count="([^"]+)"[^>]*fill="([^"]+)"[^>]*\/>/g;
    const days = [];
    let match;
    while ((match = rectRegex.exec(html)) !== null) {
      const date = match[1];
      const count = parseInt(match[2], 10);
      days.push({ date, count });
    }

    if (!days.length) {
      // older GH markup sometimes has <rect ... /> but different attributes - fallback to simpler regex
      const rectRegex2 = /<rect[^>]*data-count="([^"]+)"[^>]*data-date="([^"]+)"[^>]*\/>/g;
      rectRegex2.lastIndex = 0;
      let m;
      while ((m = rectRegex2.exec(html)) !== null) {
        const count = parseInt(m[1], 10);
        const date = m[2];
        days.push({ date, count });
      }
    }

    if (!days.length) throw new Error('Could not parse contribution rects from GitHub page.');

    // The contributions svg is usually 53 columns (weeks) x 7 rows (days)
    // We'll lay them out ourselves by mapping position in sequence.
    const weeks = [];
    for (let i = 0; i < 53; i++) weeks.push([]);
    // GitHub provides days in column-major (week by week). We'll place them sequentially.
    for (let i = 0; i < days.length; i++) {
      const weekIdx = Math.floor(i / 7);
      const dayIdx = i % 7;
      if (!weeks[weekIdx]) weeks[weekIdx] = [];
      weeks[weekIdx][dayIdx] = days[i];
    }

    // Now render a simple isometric-ish block per day. We'll create a grid with spacing.
    const blockW = 12;
    const blockGap = 4;
    const blockBaseH = 12; // base vertical offset (front face)
    const svgWidth = (blockW + blockGap) * weeks.length + 40;
    const svgHeight = 200; // enough space for 3D blocks

    // draw blocks: for each week x day draw a "prism" (flat top + front)
    let svg = [];
    svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`);
    svg.push(`<rect width="100%" height="100%" fill="transparent"/>`);
    svg.push(`<g transform="translate(20,40)">`); // margin

    for (let x = 0; x < weeks.length; x++) {
      for (let y = 0; y < 7; y++) {
        const d = weeks[x] && weeks[x][y];
        if (!d) continue;
        const count = d.count || 0;
        const h = countToHeight(count);
        const color = countToColor(count);

        const xpos = x * (blockW + blockGap);
        // we lift higher days up to create 3D stacking illusion: higher count => taller block (y axis up)
        const ypos = y * (blockW + 2); // vertical spacing
        const frontHeight = h;

        // For 3D-ish look we draw two rectangles: top (slightly offset) + front (solid)
        // top: a slightly skewed rectangle (we'll simulate with polygon)
        const topX = xpos;
        const topY = ypos - frontHeight;
        const topW = blockW;
        const topH = blockW / 3;

        // front rectangle (the visible face)
        const frontX = xpos;
        const frontY = ypos - frontHeight;
        const frontW = blockW;
        const frontH = frontHeight;

        // draw top (slight darker or same) - keep it solid (user wanted solid)
        svg.push(`<rect x="${topX}" y="${topY - topH}" width="${topW}" height="${topH}" fill="${color}" rx="2" ry="2" />`);
        // draw front face
        svg.push(`<rect x="${frontX}" y="${frontY}" width="${frontW}" height="${frontH}" fill="${color}" rx="2" ry="2" />`);
      }
    }

    svg.push(`</g>`);
    svg.push(`</svg>`);

    // Ensure dist directory exists
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(outFile, svg.join('\n'), 'utf8');
    console.log('Wrote', outFile);
    process.exit(0);
  } catch (err) {
    console.error('Error generating calendar:', err);
    // To avoid the workflow failing and drawing attention: we exit non-zero so it shows failed action
    // but your README will show previous file (if any). Alternatively, create a blank safe SVG.
    // We'll also create a safe fallback small SVG (no error text).
    try {
      const fallback = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="100%" height="100%" fill="#0b1220"/><text x="10" y="35" font-size="12" fill="#9aa6b2">Calendar temporarily unavailable</text></svg>`;
      fs.writeFileSync(outFile, fallback, 'utf8');
      console.log('Wrote fallback', outFile);
    } catch (e) {
      console.error('Failed to write fallback', e);
    }
    process.exit(1);
  }
})();
