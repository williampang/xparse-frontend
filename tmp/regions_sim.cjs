/* 复刻 ExamPaperImageView.tsx 的 blocksToRegions 全流程，用于离线验证区域拆分 */
const fs = require('fs');
const { formatExamPaper } = require('./utils.bundle.cjs');

const calcBBox = (blocks) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of blocks) {
    minX = Math.min(minX, b.bbox.x);
    minY = Math.min(minY, b.bbox.y);
    maxX = Math.max(maxX, b.bbox.x + b.bbox.w);
    maxY = Math.max(maxY, b.bbox.y + b.bbox.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

const getBlockPosition = (item) => {
  const pos = item?.position || item?.pos_list?.[0];
  return Array.isArray(pos) && pos.length >= 8 ? pos : null;
};

const getBlocksByIds = (result, contentIds) => {
  const detail = result?.detail_new || result?.detail;
  if (!Array.isArray(detail) || !contentIds?.length) return [];
  const blocks = [];
  for (const id of contentIds) {
    const idx = Number(id);
    if (isNaN(idx) || !detail[idx]) continue;
    const item = detail[idx];
    const pos = getBlockPosition(item);
    const pageId = Number(item.page_id);
    if (!pos || isNaN(pageId)) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.length; i += 2) {
      minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
      minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
    }
    blocks.push({ id, pageId, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, isImage: item.type === 'image' });
  }
  return blocks;
};

const clusterBlocks = (blocks, pageWidth) => {
  if (blocks.length <= 1) return blocks.length ? [blocks] : [];
  const sorted = [...blocks].sort((a, b) => a.bbox.y - b.bbox.y);
  const clusters = [];
  const canMerge = (cluster, block) => {
    const cb = calcBBox(cluster);
    const overlapX = Math.min(cb.x + cb.w, block.bbox.x + block.bbox.w) - Math.max(cb.x, block.bbox.x);
    const overlapY = Math.min(cb.y + cb.h, block.bbox.y + block.bbox.h) - Math.max(cb.y, block.bbox.y);
    if (overlapX >= 0.3 * Math.min(cb.w, block.bbox.w)) {
      if (overlapY > 0) return true;
      const gapY = Math.max(cb.y, block.bbox.y) - Math.min(cb.y + cb.h, block.bbox.y + block.bbox.h);
      return gapY <= Math.max(30, block.bbox.h * 0.8);
    }
    const gapX = Math.max(cb.x, block.bbox.x) - Math.min(cb.x + cb.w, block.bbox.x + block.bbox.w);
    return gapX <= 0.03 * pageWidth && overlapY > 0;
  };
  for (const block of sorted) {
    let merged = false;
    for (const cluster of clusters) {
      if (canMerge(cluster, block)) { cluster.push(block); merged = true; break; }
    }
    if (!merged) clusters.push([block]);
  }
  return clusters;
};

const groupClustersIntoColumns = (clusters) => {
  const withBBox = clusters.map((blocks) => ({ blocks, bbox: calcBBox(blocks) }));
  const columns = [];
  for (const item of withBBox) {
    let target = null;
    for (const col of columns) {
      const overlapX = Math.min(col.bbox.x + col.bbox.w, item.bbox.x + item.bbox.w) - Math.max(col.bbox.x, item.bbox.x);
      const gapX = Math.max(col.bbox.x, item.bbox.x) - Math.min(col.bbox.x + col.bbox.w, item.bbox.x + item.bbox.w);
      if (overlapX >= 0.3 * Math.min(col.bbox.w, item.bbox.w) || gapX <= 0) { target = col; break; }
    }
    if (target) {
      target.items.push(item);
      target.bbox = calcBBox(target.items.map((i) => ({ bbox: i.bbox })));
    } else columns.push({ bbox: { ...item.bbox }, items: [item] });
  }
  return columns;
};

const orderClustersByReadingOrder = (clusters) => {
  if (clusters.length <= 1) return clusters;
  const columns = groupClustersIntoColumns(clusters);
  columns.sort((a, b) => a.bbox.x - b.bbox.x);
  const ordered = [];
  for (const col of columns) {
    col.items.sort((a, b) => a.bbox.y - b.bbox.y);
    for (const item of col.items) ordered.push(item.blocks);
  }
  return ordered;
};

const findGutters = (ranges, pageWidth) => {
  if (ranges.length < 4) return [];
  const edges = Array.from(new Set(ranges.flatMap((r) => [r.x0, r.x1]))).sort((a, b) => a - b);
  const minX = edges[0];
  const maxX = edges[edges.length - 1];
  const contentWidth = maxX - minX;
  if (contentWidth < 0.6 * pageWidth) return [];
  const lo = minX + 0.15 * contentWidth;
  const hi = maxX - 0.15 * contentWidth;
  const intervals = [];
  for (let i = 0; i + 1 < edges.length; i += 1) {
    if (edges[i + 1] <= lo || edges[i] >= hi) continue;
    const mid = (edges[i] + edges[i + 1]) / 2;
    const cover = ranges.reduce((n, r) => (r.x0 < mid && r.x1 > mid ? n + 1 : n), 0);
    intervals.push({ a: edges[i], b: edges[i + 1], cover });
  }
  if (!intervals.length) return [];
  const cmin = Math.min(...intervals.map((v) => v.cover));
  if (cmin > Math.max(1, Math.round(ranges.length * 0.15))) return [];
  const outside = intervals.filter((v) => v.cover > cmin).map((v) => v.cover).sort((a, b) => a - b);
  if (!outside.length) return [];
  const sideMedian = outside[Math.floor(outside.length / 2)];
  if (sideMedian < 2 * (cmin + 1)) return [];
  const segments = [];
  let seg = null;
  for (const v of intervals) {
    if (v.cover !== cmin) { if (seg) segments.push(seg); seg = null; continue; }
    if (seg && v.a <= seg.b) seg.b = v.b;
    else seg = { a: v.a, b: v.b };
  }
  if (seg) segments.push(seg);
  let best = segments[0];
  for (const s of segments) {
    if (Math.abs((s.a + s.b) / 2 - pageWidth / 2) < Math.abs((best.a + best.b) / 2 - pageWidth / 2)) best = s;
  }
  if (best.b - best.a < 0.002 * pageWidth) return [];
  return [[best.a, best.b]];
};

const pageGutterCache = new Map();
const detectPageGutters = (result, pageId, pageWidth) => {
  const cacheKey = `${pageId}_${pageWidth}`;
  const cached = pageGutterCache.get(cacheKey);
  if (cached) return cached;
  let gutters = [];
  const detail = result?.detail_new || result?.detail;
  if (Array.isArray(detail)) {
    const ranges = [];
    const centers = [];
    for (const item of detail) {
      if (Number(item.page_id) !== pageId) continue;
      const pos = getBlockPosition(item);
      if (!pos) continue;
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < pos.length; i += 2) { mn = Math.min(mn, pos[i]); mx = Math.max(mx, pos[i]); }
      ranges.push({ x0: mn, x1: mx });
      centers.push((mn + mx) / 2);
    }
    gutters = findGutters(ranges, pageWidth).filter(([g0, g1]) => {
      let left = 0;
      let right = 0;
      for (let i = 0; i < centers.length; i += 1) {
        const cx = centers[i];
        if (cx > g0 && cx < g1) {
          if (ranges[i].x0 <= g0 && ranges[i].x1 >= g1) continue;
          return false;
        }
        if (cx <= g0) left += 1;
        else right += 1;
      }
      const total = left + right;
      return left > 0 && right > 0 && Math.min(left, right) >= Math.max(2, Math.ceil(total * 0.2));
    });
  }
  pageGutterCache.set(cacheKey, gutters);
  return gutters;
};

const splitBBoxByCutLines = (bbox, cutLines) => {
  const cuts = cutLines.filter((cut) => cut > bbox.x && cut < bbox.x + bbox.w && cut - bbox.x >= 0.2 * bbox.w && bbox.x + bbox.w - cut >= 0.2 * bbox.w);
  if (!cuts.length) return [bbox];
  const parts = [];
  let x = bbox.x;
  for (const cut of cuts) { parts.push({ x, y: bbox.y, w: cut - x, h: bbox.h }); x = cut; }
  parts.push({ x, y: bbox.y, w: bbox.x + bbox.w - x, h: bbox.h });
  return parts;
};

const blocksToRegions = (result, blocks) => {
  if (!blocks.length) return [];
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const byPage = new Map();
  for (const block of blocks) {
    const list = byPage.get(block.pageId) || [];
    list.push(block);
    byPage.set(block.pageId, list);
  }
  const regions = [];
  const gutterMidsByPage = new Map();
  byPage.forEach((pageBlocks, pageId) => {
    const pageIndex = pages.findIndex((p) => p?.page_id === pageId);
    const pageNumber = pageIndex >= 0 ? pageIndex + 1 : pageId + 1;
    const pageWidth = typeof pages[pageIndex]?.width === 'number' && pages[pageIndex].width > 0 ? pages[pageIndex].width : 1190;
    const gutters = detectPageGutters(result, pageId, pageWidth);
    gutterMidsByPage.set(pageId, gutters.map(([g0, g1]) => (g0 + g1) / 2));
    const textBlocks = pageBlocks.filter((b) => !b.isImage);
    const textClusters = [];
    if (gutterMidsByPage.get(pageId).length) {
      const mids = gutterMidsByPage.get(pageId);
      const columnGroups = Array.from({ length: mids.length + 1 }, () => []);
      for (const block of textBlocks) {
        const colIdx = mids.filter((m) => block.bbox.x + block.bbox.w / 2 >= m).length;
        columnGroups[colIdx].push(block);
      }
      for (const group of columnGroups) if (group.length) textClusters.push(...clusterBlocks(group, pageWidth));
    } else if (textBlocks.length) {
      textClusters.push(...clusterBlocks(textBlocks, pageWidth));
    }
    const orderedClusters = orderClustersByReadingOrder(textClusters);
    const cutLines = gutters.length
      ? gutters.map(([g0, g1]) => (g0 + g1) / 2)
      : (() => {
          const ranges = groupClustersIntoColumns(textClusters.filter((c) => calcBBox(c).w <= 0.7 * pageWidth))
            .map((col) => col.bbox).sort((a, b) => a.x - b.x);
          const lines = [];
          for (let i = 0; i + 1 < ranges.length; i += 1) {
            const gapStart = ranges[i].x + ranges[i].w;
            const gapEnd = ranges[i + 1].x;
            if (gapEnd > gapStart) lines.push((gapStart + gapEnd) / 2);
          }
          return lines;
        })();
    const imageBlocks = pageBlocks.filter((b) => b.isImage);
    for (const block of imageBlocks) {
      for (const bbox of splitBBoxByCutLines(block.bbox, cutLines)) {
        regions.push({ pageId, pageNumber, bbox, contentIds: [block.id] });
      }
    }
    for (const cluster of orderedClusters) {
      regions.push({ pageId, pageNumber, bbox: calcBBox(cluster), contentIds: cluster.map((b) => b.id) });
    }
  });
  regions.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.pageId === b.pageId) {
      const mids = gutterMidsByPage.get(a.pageId) || [];
      const colA = mids.filter((m) => a.bbox.x + a.bbox.w / 2 >= m).length;
      const colB = mids.filter((m) => b.bbox.x + b.bbox.w / 2 >= m).length;
      if (colA !== colB) return colA - colB;
    }
    const centerA = a.bbox.y + a.bbox.h / 2;
    const centerB = b.bbox.y + b.bbox.h / 2;
    if (Math.abs(centerA - centerB) > 20) return centerA - centerB;
    return a.bbox.x - b.bbox.x;
  });
  return regions;
};

// ---------- 运行 ----------
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const parsed = formatExamPaper(data);
if (!parsed) { console.log('parse NULL'); process.exit(0); }
const pages = data.pages || [];
const r = (x) => Math.round(x);

const walk = (questions, depth = 0) => {
  for (const q of questions) {
    const groups = q.contentGroups;
    let regionGroups = [];
    if (!groups) {
      const regs = blocksToRegions(data, getBlocksByIds(data, q.contentIds));
      if (regs.length) regionGroups.push({ label: '', regions: regs });
    } else {
      const stem = blocksToRegions(data, getBlocksByIds(data, groups.stem));
      if (stem.length) regionGroups.push({ label: '题干', regions: stem });
      for (const opt of groups.options) {
        if (!opt.contentIds?.length) continue;
        const regs = blocksToRegions(data, getBlocksByIds(data, opt.contentIds));
        if (regs.length) regionGroups.push({ label: `选项${opt.label}`, regions: regs });
      }
      const ans = blocksToRegions(data, getBlocksByIds(data, groups.answer));
      if (ans.length) regionGroups.push({ label: '答案', regions: ans });
      const ana = blocksToRegions(data, getBlocksByIds(data, groups.analysis));
      if (ana.length) regionGroups.push({ label: '解析', regions: ana });
    }
    const pad = '  '.repeat(depth);
    console.log(`${pad}Q${q.index}`);
    for (const g of regionGroups) {
      for (const reg of g.regions) {
        const page = pages.find((p) => p?.page_id === reg.pageId);
        const pw = page?.width || 1190;
        const wide = reg.bbox.w > 0.6 * pw ? '  <<< 超过60%页宽' : '';
        console.log(`${pad}  [${g.label}] p${reg.pageNumber} x:${r(reg.bbox.x)} y:${r(reg.bbox.y)} w:${r(reg.bbox.w)} h:${r(reg.bbox.h)}${wide}`);
      }
    }
    if (q.subQuestions?.length) walk(q.subQuestions, depth + 1);
  }
};

for (const s of parsed.sections) {
  console.log(`== ${s.name}`);
  walk(s.questions);
}

// 输出各页探测到的栏间隙
console.log('-- gutters --');
for (const p of pages) {
  const g = detectPageGutters(data, p.page_id, p.width || 1190);
  console.log(`page ${p.page_id} (w=${p.width}):`, g.length ? g.map(([a, b]) => `${r(a)}~${r(b)}`).join(', ') : '无');
}
