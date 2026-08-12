import React, { useEffect, useMemo, useState } from 'react';
import { Spin, Tag, Empty } from 'antd';
import { downloadOcrImg } from '@/services/robot';
import { addDataToURL } from '@/utils';
import type { IExamPaperData, IExamPaperQuestion } from '../../data.d';
import { clearAllActive, highlightLeftViewRects } from './helpers';
import styles from './index.less';

interface IProps {
  result: any;
  data: IExamPaperData;
  isPdf?: boolean;
}

/** 题目在原图中的区域（页面坐标系） */
interface IQuestionRegion {
  pageId: number; // detail 块的 page_id
  pageNumber: number; // 展示用页码（pages 数组中的序号，从 1 开始）
  bbox: { x: number; y: number; w: number; h: number };
  contentIds: (string | number)[];
}

/** 题目某一角色（题干/选项/答案/解析）对应的裁剪分组 */
interface IRegionGroup {
  label?: string; // 如 "选项 A"
  regions: IQuestionRegion[];
}

interface IPageSource {
  img: CanvasImageSource;
  width: number;
  height: number;
  /** 页面坐标系宽度（position 所在空间），未知时为 0 */
  coordWidth: number;
  coordHeight: number;
}

/** 从 detail 块中取出 8 点坐标 */
const getBlockPosition = (item: any): number[] | null => {
  const pos = item?.position || item?.pos_list?.[0];
  return Array.isArray(pos) && pos.length >= 8 ? pos : null;
};

interface IBlock {
  id: string | number;
  pageId: number;
  bbox: { x: number; y: number; w: number; h: number };
  /** 是否为图片块（detail 中 type === 'image'） */
  isImage: boolean;
}

/** 根据 contentIds 从 detail 中收集带位置的块 */
const getBlocksByIds = (result: any, contentIds: (string | number)[]): IBlock[] => {
  const detail = result?.detail_new || result?.detail;
  if (!Array.isArray(detail) || !contentIds?.length) return [];
  const blocks: IBlock[] = [];
  for (const id of contentIds) {
    const idx = Number(id);
    if (isNaN(idx) || !detail[idx]) continue;
    const item = detail[idx];
    const pos = getBlockPosition(item);
    const pageId = Number(item.page_id);
    if (!pos || isNaN(pageId)) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.length; i += 2) {
      minX = Math.min(minX, pos[i]);
      maxX = Math.max(maxX, pos[i]);
      minY = Math.min(minY, pos[i + 1]);
      maxY = Math.max(maxY, pos[i + 1]);
    }
    blocks.push({
      id,
      pageId,
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      isImage: item.type === 'image',
    });
  }
  return blocks;
};

/** 计算一组块的外包矩形 */
const calcBBox = (blocks: Pick<IBlock, 'bbox'>[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of blocks) {
    minX = Math.min(minX, b.bbox.x);
    minY = Math.min(minY, b.bbox.y);
    maxX = Math.max(maxX, b.bbox.x + b.bbox.w);
    maxY = Math.max(maxY, b.bbox.y + b.bbox.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/**
 * 空间聚类：仅当两块处于同一栏（水平重叠或水平间距极小）且垂直相邻时才合并。
 * 左右分栏布局中，跨栏的块会被自动拆成多个小块，避免包围框覆盖到其他题目。
 */
const clusterBlocks = (blocks: IBlock[], pageWidth: number): IBlock[][] => {
  if (blocks.length <= 1) return blocks.length ? [blocks] : [];
  const sorted = [...blocks].sort((a, b) => a.bbox.y - b.bbox.y);
  const clusters: IBlock[][] = [];

  const canMerge = (cluster: IBlock[], block: IBlock): boolean => {
    const cb = calcBBox(cluster);
    const overlapX = Math.min(cb.x + cb.w, block.bbox.x + block.bbox.w) - Math.max(cb.x, block.bbox.x);
    const overlapY = Math.min(cb.y + cb.h, block.bbox.y + block.bbox.h) - Math.max(cb.y, block.bbox.y);

    if (overlapX >= 0.3 * Math.min(cb.w, block.bbox.w)) {
      // 水平方向明显重叠，视为同一栏：垂直方向重叠或间距较小（行间/段间距离）才合并
      if (overlapY > 0) return true;
      const gapY = Math.max(cb.y, block.bbox.y) - Math.min(cb.y + cb.h, block.bbox.y + block.bbox.h);
      return gapY <= Math.max(30, block.bbox.h * 0.8);
    }

    // 水平方向无明显重叠：仅当水平间距极小且垂直方向有重叠（如横排选项标签与选项图）
    // 才视为同一行合并；左右分栏布局中「左栏底部 + 右栏顶部」的块即使 y 相邻也不会被误合并
    const gapX = Math.max(cb.x, block.bbox.x) - Math.min(cb.x + cb.w, block.bbox.x + block.bbox.w);
    return gapX <= 0.03 * pageWidth && overlapY > 0;
  };

  for (const block of sorted) {
    let merged = false;
    for (const cluster of clusters) {
      if (canMerge(cluster, block)) {
        cluster.push(block);
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push([block]);
  }
  return clusters;
};

/** 将聚簇按栏分组：水平方向有重叠/紧邻的簇视为同一栏 */
const groupClustersIntoColumns = (clusters: IBlock[][]) => {
  const withBBox = clusters.map((blocks) => ({ blocks, bbox: calcBBox(blocks) }));
  const columns: { bbox: ReturnType<typeof calcBBox>; items: typeof withBBox }[] = [];

  for (const item of withBBox) {
    let target: (typeof columns)[number] | null = null;
    for (const col of columns) {
      const overlapX =
        Math.min(col.bbox.x + col.bbox.w, item.bbox.x + item.bbox.w) -
        Math.max(col.bbox.x, item.bbox.x);
      const gapX =
        Math.max(col.bbox.x, item.bbox.x) -
        Math.min(col.bbox.x + col.bbox.w, item.bbox.x + item.bbox.w);
      if (overlapX >= 0.3 * Math.min(col.bbox.w, item.bbox.w) || gapX <= 0) {
        target = col;
        break;
      }
    }
    if (target) {
      target.items.push(item);
      target.bbox = calcBBox(target.items.map((i) => ({ bbox: i.bbox })));
    } else {
      columns.push({ bbox: { ...item.bbox }, items: [item] });
    }
  }
  return columns;
};

/**
 * 按阅读顺序排列聚簇：栏从左到右、栏内从上到下。适配左右分栏文档
 * 「左栏从上到下，再右栏从上到下」的阅读顺序，避免右栏顶部的块因 y 值更小而排在左栏块前面。
 */
const orderClustersByReadingOrder = (clusters: IBlock[][]): IBlock[][] => {
  if (clusters.length <= 1) return clusters;
  const columns = groupClustersIntoColumns(clusters);
  columns.sort((a, b) => a.bbox.x - b.bbox.x);
  const ordered: IBlock[][] = [];
  for (const col of columns) {
    col.items.sort((a, b) => a.bbox.y - b.bbox.y);
    for (const item of col.items) ordered.push(item.blocks);
  }
  return ordered;
};

/**
 * 探测页面的栏间隙：对整页所有块做 x 方向投影扫描，取内容中部区域内覆盖块数
 * 明显低于两侧的连续窄带（适配左右分栏/双页合扫文档，栏间隙可能远小于页宽 3%）；
 * 只保留最靠近页面中心的一个间隙，避免把栏内横排选项图之间的空隙误判为栏间隙。
 */
const findGutters = (ranges: { x0: number; x1: number }[], pageWidth: number): [number, number][] => {
  if (ranges.length < 4) return [];
  const edges = Array.from(new Set(ranges.flatMap((r) => [r.x0, r.x1]))).sort((a, b) => a - b);
  const minX = edges[0];
  const maxX = edges[edges.length - 1];
  const contentWidth = maxX - minX;
  if (contentWidth < 0.6 * pageWidth) return [];

  // 仅在内容中部区域寻找：间隙两侧都须有实质内容，排除页边距
  const lo = minX + 0.15 * contentWidth;
  const hi = maxX - 0.15 * contentWidth;
  const intervals: { a: number; b: number; cover: number }[] = [];
  for (let i = 0; i + 1 < edges.length; i += 1) {
    if (edges[i + 1] <= lo || edges[i] >= hi) continue;
    const mid = (edges[i] + edges[i + 1]) / 2;
    const cover = ranges.reduce((n, r) => (r.x0 < mid && r.x1 > mid ? n + 1 : n), 0);
    intervals.push({ a: edges[i], b: edges[i + 1], cover });
  }
  if (!intervals.length) return [];

  const cmin = Math.min(...intervals.map((v) => v.cover));
  if (cmin > Math.max(1, Math.round(ranges.length * 0.15))) return [];
  // 间隙处覆盖数须与两侧内容区有落差，否则只是内容稀疏而非分栏（块中心点
  // 空隙校验是主防线，此处仅作轻量预筛，避免末页等少块页面被误杀）
  const outside = intervals
    .filter((v) => v.cover > cmin)
    .map((v) => v.cover)
    .sort((a, b) => a - b);
  if (!outside.length) return [];
  const sideMedian = outside[Math.floor(outside.length / 2)];
  if (sideMedian < 2 * (cmin + 1)) return [];

  // 合并连续的最低覆盖区间，取最靠近页面中心的一段作为栏间隙
  const segments: { a: number; b: number }[] = [];
  let seg: { a: number; b: number } | null = null;
  for (const v of intervals) {
    if (v.cover !== cmin) {
      if (seg) segments.push(seg);
      seg = null;
      continue;
    }
    if (seg && v.a <= seg.b) seg.b = v.b;
    else seg = { a: v.a, b: v.b };
  }
  if (seg) segments.push(seg);
  let best = segments[0];
  for (const s of segments) {
    if (Math.abs((s.a + s.b) / 2 - pageWidth / 2) < Math.abs((best.a + best.b) / 2 - pageWidth / 2)) {
      best = s;
    }
  }
  if (best.b - best.a < 0.002 * pageWidth) return [];
  return [[best.a, best.b]];
};

/** 栏间隙探测结果缓存，key: pageId_pageWidth */
const pageGutterCache = new Map<string, [number, number][]>();

/**
 * 清空图片预览的全部模块级缓存。缓存 key 只含 pageId/bbox 不区分来源文件，
 * 切换解析文件（如 docx → PDF）后若不清空，新文件中坐标恰好相同的区域
 * 会命中上一份文档的裁剪图/页面原图，导致预览图与实际位置完全不符
 */
export const resetExamPaperImageCaches = () => {
  cropCache.clear();
  pageSourceCache.clear();
  pageGutterCache.clear();
};

/** 探测指定页的栏间隙（基于整页所有块，比仅用题目自身块更稳健） */
const detectPageGutters = (result: any, pageId: number, pageWidth: number): [number, number][] => {
  const cacheKey = `${pageId}_${pageWidth}`;
  const cached = pageGutterCache.get(cacheKey);
  if (cached) return cached;

  let gutters: [number, number][] = [];
  const detail = result?.detail_new || result?.detail;
  if (Array.isArray(detail)) {
    const ranges: { x0: number; x1: number }[] = [];
    const centers: number[] = [];
    for (const item of detail) {
      if (Number(item.page_id) !== pageId) continue;
      const pos = getBlockPosition(item);
      if (!pos) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < pos.length; i += 2) {
        minX = Math.min(minX, pos[i]);
        maxX = Math.max(maxX, pos[i]);
      }
      ranges.push({ x0: minX, x1: maxX });
      centers.push((minX + maxX) / 2);
    }
    // 功能性校验：栏间隙是块中心点的空隙——
    // 1) 带内不能有任何块的中心（横跨间隙的页码/全宽表格/跨栏图片除外，
    //    它们恰是需要被拆分或无视间隙的块）；
    // 2) 中心点须呈两侧分布：大多数块分居带两侧（真分栏的中心点是双峰的），
    //    单栏文档右缘参差产生的低覆盖带只有极少数块中心在右侧，不构成分栏
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
      return (
        left > 0 &&
        right > 0 &&
        Math.min(left, right) >= Math.max(2, Math.ceil(total * 0.2))
      );
    });
  }
  pageGutterCache.set(cacheKey, gutters);
  return gutters;
};

/** 按切线把块拆分为各栏子区域：切线两侧宽度都须足够（≥原宽 20%），避免切出窄边 */
const splitBBoxByCutLines = (bbox: IBlock['bbox'], cutLines: number[]): IBlock['bbox'][] => {
  const cuts = cutLines.filter(
    (cut) =>
      cut > bbox.x &&
      cut < bbox.x + bbox.w &&
      cut - bbox.x >= 0.2 * bbox.w &&
      bbox.x + bbox.w - cut >= 0.2 * bbox.w,
  );
  if (!cuts.length) return [bbox];
  const parts: IBlock['bbox'][] = [];
  let x = bbox.x;
  for (const cut of cuts) {
    parts.push({ x, y: bbox.y, w: cut - x, h: bbox.h });
    x = cut;
  }
  parts.push({ x, y: bbox.y, w: bbox.x + bbox.w - x, h: bbox.h });
  return parts;
};

/**
 * 将一组块转为区域列表：按页分组，图片块独立成区域（左右并排/跨页的多张图
 * 不会被空间聚类合并或吞并），跨栏的图片块再沿栏间隙切成各栏子区域；
 * 文本块先按栏分组再栏内聚类（避免双页合扫中左右栏被合并成整页大区域），每簇一个区域
 */
const blocksToRegions = (result: any, blocks: IBlock[]): IQuestionRegion[] => {
  if (!blocks.length) return [];
  const pages = Array.isArray(result?.pages) ? result.pages : [];

  const byPage = new Map<number, IBlock[]>();
  for (const block of blocks) {
    const list = byPage.get(block.pageId) || [];
    list.push(block);
    byPage.set(block.pageId, list);
  }

  const regions: IQuestionRegion[] = [];
  const gutterMidsByPage = new Map<number, number[]>();
  byPage.forEach((pageBlocks, pageId) => {
    const pageIndex = pages.findIndex((p: any) => p?.page_id === pageId);
    const pageNumber = pageIndex >= 0 ? pageIndex + 1 : pageId + 1;
    let pageWidth =
      typeof pages[pageIndex]?.width === 'number' && pages[pageIndex].width > 0
        ? pages[pageIndex].width
        : 1190;
    // pages 尺寸单位可能与 position 不一致（如 PDF），块溢出时用块范围估算页宽，
    // 保证聚类/栏探测中的比例阈值（0.03 页宽、0.7 页宽等）在正确尺度下计算
    const blockExtent = getPageBlockExtent(result, pageId);
    if (blockExtent.maxX > pageWidth * 1.02) {
      pageWidth = Math.max(blockExtent.maxX * 1.05, 1);
    }

    // 栏间隙中点：优先用整页块探测（双页合扫/左右分栏），探测不到时用文本簇推算兜底
    const gutters = detectPageGutters(result, pageId, pageWidth);
    gutterMidsByPage.set(pageId, gutters.map(([g0, g1]) => (g0 + g1) / 2));

    const textBlocks = pageBlocks.filter((b) => !b.isImage);
    const textClusters: IBlock[][] = [];
    if (gutterMidsByPage.get(pageId)!.length) {
      // 有栏间隙：文本块先按中心点分到各栏，栏内分别聚类，避免跨栏合并
      const mids = gutterMidsByPage.get(pageId)!;
      const columnGroups: IBlock[][] = Array.from({ length: mids.length + 1 }, () => []);
      for (const block of textBlocks) {
        const colIdx = mids.filter((m) => block.bbox.x + block.bbox.w / 2 >= m).length;
        columnGroups[colIdx].push(block);
      }
      for (const group of columnGroups) {
        if (group.length) textClusters.push(...clusterBlocks(group, pageWidth));
      }
    } else if (textBlocks.length) {
      textClusters.push(...clusterBlocks(textBlocks, pageWidth));
    }
    const orderedClusters = orderClustersByReadingOrder(textClusters);

    // 图片拆分的切线：栏间隙中点；兜底用文本簇栏间空隙中点
    const cutLines = gutters.length
      ? gutters.map(([g0, g1]) => (g0 + g1) / 2)
      : (() => {
          const ranges = groupClustersIntoColumns(
            textClusters.filter((c) => calcBBox(c).w <= 0.7 * pageWidth),
          )
            .map((col) => col.bbox)
            .sort((a, b) => a.x - b.x);
          const lines: number[] = [];
          for (let i = 0; i + 1 < ranges.length; i += 1) {
            const gapStart = ranges[i].x + ranges[i].w;
            const gapEnd = ranges[i + 1].x;
            if (gapEnd > gapStart) lines.push((gapStart + gapEnd) / 2);
          }
          return lines;
        })();

    // 图片块：每块单独一个区域，不参与聚类（如横排选项图、左右结构图各自独立展示）；
    // 跨越栏间隙的图片块（OCR 将左右两栏的图合并成一块）沿栏间隙切开为各栏子区域
    const imageBlocks = pageBlocks.filter((b) => b.isImage);
    for (const block of imageBlocks) {
      for (const bbox of splitBBoxByCutLines(block.bbox, cutLines)) {
        regions.push({ pageId, pageNumber, bbox, contentIds: [block.id] });
      }
    }

    for (const cluster of orderedClusters) {
      regions.push({
        pageId,
        pageNumber,
        bbox: calcBBox(cluster),
        contentIds: cluster.map((b) => b.id),
      });
    }
  });
  // 同一页内按阅读顺序混排图片区域与文本簇区域：有栏间隙时先按栏分组（栏从左到右、
  // 栏内从上到下），否则从上到下（按垂直中心），同一行（中心 y 接近）的按 x 从左到右
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

/**
 * 计算题目的裁剪分组：
 * - 始终按角色（题干/选项/答案/解析/元信息）分组各自聚类，避免相邻的
 *   不同角色块（如【知识点】与【解析】）被空间聚类误合并成同一张裁剪图；
 * - 无分组信息的旧数据才退化为全部块一起聚类。
 */
const getQuestionRegionGroups = (result: any, question: IExamPaperQuestion): IRegionGroup[] => {
  const groups = question.contentGroups;

  if (!groups) {
    const regions = blocksToRegions(result, getBlocksByIds(result, question.contentIds));
    return regions.length ? [{ regions }] : [];
  }

  const hasOptionGroups = groups.options.some((opt) => opt.contentIds?.length);
  const resultGroups: IRegionGroup[] = [];

  const stemRegions = blocksToRegions(result, getBlocksByIds(result, groups.stem));
  if (stemRegions.length) {
    resultGroups.push({ label: '题干', regions: stemRegions });
  }

  if (hasOptionGroups) {
    for (const opt of groups.options) {
      if (!opt.contentIds?.length) continue;
      const regions = blocksToRegions(result, getBlocksByIds(result, opt.contentIds));
      if (regions.length) {
        resultGroups.push({ label: `选项 ${opt.label}`, regions });
      }
    }
  }

  const answerRegions = blocksToRegions(result, getBlocksByIds(result, groups.answer));
  if (answerRegions.length) {
    resultGroups.push({ label: '答案', regions: answerRegions });
  }

  const analysisRegions = blocksToRegions(result, getBlocksByIds(result, groups.analysis));
  if (analysisRegions.length) {
    resultGroups.push({ label: '解析', regions: analysisRegions });
  }

  // 元信息（知识点/难度/分值）
  const metaBlocks = [
    ...(groups.knowledge || []),
    ...(groups.difficulty || []),
    ...(groups.score || []),
  ];
  const metaRegions = blocksToRegions(result, getBlocksByIds(result, metaBlocks));
  if (metaRegions.length) {
    resultGroups.push({ label: '元信息', regions: metaRegions });
  }

  return resultGroups;
};

/** 加载图片为 HTMLImageElement */
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** 定位左侧视图指定页的根节点（pdf.js 的 .page 或 PDFRenderViewer 的 mask 容器） */
const getPageRoot = (pageNumber: number): HTMLElement | null => {
  const markDom = document.querySelector<HTMLElement>(
    `#imgContainer [data-page-number="${pageNumber}"]`,
  );
  if (!markDom) return null;
  return ((markDom.closest('.page') ||
    markDom.closest('[class*="mask"]') ||
    markDom.parentElement) as HTMLElement) || null;
};

/**
 * 从左侧视图已渲染的页面 DOM 中获取原图（canvas/img）。
 * position 坐标空间以左侧画框 SVG 的 viewBox 为准（识别框正是按该空间与页面
 * 对齐的）：pdf.js 的 canvas 像素尺寸随左侧视图缩放变化，而 viewBox 是固定的
 * 坐标空间，用它换算裁剪位置才能与缩放无关；取不到 viewBox 时用 pages 尺寸兜底。
 */
const getPageSourceFromDom = (
  pageNumber: number,
  fallbackCoordWidth = 0,
  fallbackCoordHeight = 0,
): IPageSource | null => {
  const markDom = document.querySelector<HTMLElement>(
    `#imgContainer [data-page-number="${pageNumber}"]`,
  );
  if (!markDom) return null;
  const pageRoot = getPageRoot(pageNumber);
  if (!pageRoot) return null;

  let coordWidth = fallbackCoordWidth;
  let coordHeight = fallbackCoordHeight;
  const svgDom =
    markDom.tagName.toLowerCase() === 'svg'
      ? (markDom as unknown as SVGSVGElement)
      : pageRoot.querySelector<SVGSVGElement>('svg.rectLayer[viewBox]') ||
        pageRoot.querySelector<SVGSVGElement>('svg[data-page-number][viewBox]') ||
        pageRoot.querySelector<SVGSVGElement>('svg[viewBox]');
  const viewBox = svgDom?.getAttribute('viewBox') || '';
  const vb = viewBox.split(/\s+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    coordWidth = vb[2];
    coordHeight = vb[3];
  }

  const canvas = pageRoot.querySelector<HTMLCanvasElement>('canvas');
  if (canvas && canvas.width > 0) {
    return { img: canvas, width: canvas.width, height: canvas.height, coordWidth, coordHeight };
  }
  const imgEl = pageRoot.querySelector<HTMLImageElement>('img[src]');
  if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
    return {
      img: imgEl,
      width: imgEl.naturalWidth,
      height: imgEl.naturalHeight,
      coordWidth,
      coordHeight,
    };
  }
  return null;
};

/**
 * 获取图源当前的像素尺寸。canvas 是活引用：左侧视图缩放后 pdf.js 会重设其
 * 宽高，必须实时读取，不能用缓存 IPageSource 时的快照数值，否则缩放后裁剪
 * 仍按旧尺寸换算导致位置偏移
 */
const getSourcePixelSize = (source: IPageSource): { width: number; height: number } => {
  if (source.img instanceof HTMLCanvasElement) {
    return { width: source.img.width, height: source.img.height };
  }
  return { width: source.width, height: source.height };
};

/**
 * 实时读取左侧视图指定页当前的显示换算比率（CSS 显示尺寸 / 画布像素尺寸）。
 * 左侧预览缩放后 canvas/img 的显示尺寸会变化，裁剪时存的快照会过时，
 * 展示层必须在渲染时重新读取
 */
const getLiveDisplayRate = (
  pageNumber: number,
): { rateX: number; rateY: number } | null => {
  const pageRoot = getPageRoot(pageNumber);
  if (!pageRoot) return null;
  const canvas = pageRoot.querySelector<HTMLCanvasElement>('canvas');
  if (canvas && canvas.width > 0) {
    const cssWidth = parseFloat(canvas.style.width) || canvas.getBoundingClientRect().width;
    const cssHeight = parseFloat(canvas.style.height) || canvas.getBoundingClientRect().height;
    if (cssWidth > 0 && cssHeight > 0) {
      return { rateX: cssWidth / canvas.width, rateY: cssHeight / canvas.height };
    }
  }
  const imgEl = pageRoot.querySelector<HTMLImageElement>('img[src]');
  if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
    const cssWidth = imgEl.width || imgEl.getBoundingClientRect().width;
    const cssHeight = imgEl.height || imgEl.getBoundingClientRect().height;
    if (cssWidth > 0 && cssHeight > 0) {
      return { rateX: cssWidth / imgEl.naturalWidth, rateY: cssHeight / imgEl.naturalHeight };
    }
  }
  return null;
};

/**
 * 跟随左侧预览尺寸变化的实时换算比率：用 ResizeObserver 监听页面根节点
 * （pdf.js 的 .page / PDFRenderViewer 的 mask 容器，缩放时尺寸都会变化），
 * 尺寸变化时触发重渲染重新读取最新比率
 */
const useLiveDisplayRate = (pageNumber: number) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const pageRoot = getPageRoot(pageNumber);
    if (!pageRoot) return undefined;
    const observer = new ResizeObserver(() => {
      setTick((t) => t + 1);
    });
    observer.observe(pageRoot);
    return () => observer.disconnect();
  }, [pageNumber]);
  return getLiveDisplayRate(pageNumber);
};

/** 页面原图缓存，key: `${pages.length}_${pageId}_${来源标识}` */
const pageSourceCache = new Map<string, Promise<IPageSource | null>>();

/** 获取指定页的原图来源：优先 pages 内嵌 base64，其次 image_id 下载，最后取左侧视图已渲染的 DOM */
const getPageImageSource = (result: any, pageId: number): Promise<IPageSource | null> => {
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const page = pages.find((p: any) => p?.page_id === pageId);
  const pageIndex = page ? pages.indexOf(page) : -1;
  const cacheKey = `${pages.length}_${pageId}_${page?.base64 ? 'b64' : ''}_${page?.image_id || ''}`;
  const cached = pageSourceCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async (): Promise<IPageSource | null> => {
    const coordWidth = typeof page?.width === 'number' ? page.width : 0;
    const coordHeight = typeof page?.height === 'number' ? page.height : 0;
    try {
      if (page?.base64) {
        const img = await loadImage(addDataToURL(page.base64, 'png'));
        return { img, width: img.naturalWidth, height: img.naturalHeight, coordWidth, coordHeight };
      }
      if (page?.image_id) {
        const { data } = await downloadOcrImg(page.image_id);
        if (data?.image) {
          const img = await loadImage(`data:image/jpeg;base64,${data.image}`);
          return { img, width: img.naturalWidth, height: img.naturalHeight, coordWidth, coordHeight };
        }
      }
    } catch (e) {
      // 继续走 DOM 兜底
    }
    // DOM 兜底：左侧视图已渲染的页面。把 pages 尺寸作为坐标空间兜底值传入，
    // 优先采用左侧画框 SVG viewBox（见 getPageSourceFromDom）
    if (pageIndex >= 0) {
      return getPageSourceFromDom(pageIndex + 1, coordWidth, coordHeight);
    }
    return null;
  })();

  // 失败不缓存，便于左侧视图渲染完成后重试；
  // 注意取不到源时 Promise 是 resolve(null) 而非 reject，两种情况都要清理，
  // 否则空结果被永久缓存导致"点击重试"永远失败
  promise
    .then((source) => {
      if (!source) pageSourceCache.delete(cacheKey);
    })
    .catch(() => pageSourceCache.delete(cacheKey));
  pageSourceCache.set(cacheKey, promise);
  return promise;
};

/** 裁剪结果（含实际像素尺寸，用于限制图片最大显示尺寸） */
interface ICropResult {
  dataUrl: string;
  width: number;
  height: number;
  /**
   * 像素 → 左侧视图当前显示的换算比率（CSS 显示尺寸 / 画布像素尺寸）。
   * 仅 PDF 的 DOM 源（canvas/img）才有：裁剪图像素尺寸随左侧缩放变化，
   * 乘以该比率后显示尺寸与区域在左侧视图中的实际显示大小一致
   */
  displayRateX?: number;
  displayRateY?: number;
}

/** 裁剪结果缓存 */
const cropCache = new Map<string, ICropResult>();

/**
 * 按区域前缀查找已缓存的裁剪图：缓存 key 附带了图源像素尺寸（区分左侧
 * 不同缩放），同步预取时只能按区域前缀模糊命中任意一份缓存
 */
const getCachedCrop = (regionKey: string): ICropResult | null => {
  const exact = cropCache.get(regionKey);
  if (exact) return exact;
  const prefix = `${regionKey}_`;
  for (const [key, value] of cropCache) {
    if (key.startsWith(prefix)) return value;
  }
  return null;
};

/** 计算指定页所有块的位置外包范围（用于校验坐标空间） */
const getPageBlockExtent = (result: any, pageId: number): { maxX: number; maxY: number } => {
  let maxX = 0;
  let maxY = 0;
  const detail = result?.detail_new || result?.detail;
  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (Number(item.page_id) !== pageId) continue;
      const pos = getBlockPosition(item);
      if (!pos) continue;
      for (let i = 0; i < pos.length; i += 2) {
        maxX = Math.max(maxX, pos[i]);
        maxY = Math.max(maxY, pos[i + 1]);
      }
    }
  }
  return { maxX, maxY };
};

/** 按区域从页面原图中裁剪出题目图片，同时返回裁剪图的实际像素尺寸 */
const cropRegion = async (
  result: any,
  region: IQuestionRegion,
  isPdf: boolean,
): Promise<ICropResult> => {
  const cacheKey = `${isPdf ? 'pdf' : 'image'}_${region.pageId}_${region.bbox.x}_${region.bbox.y}_${region.bbox.w}_${region.bbox.h}`;

  const source = await getPageImageSource(result, region.pageId);
  if (!source) throw new Error('page source not found');

  // canvas 像素尺寸随左侧视图缩放变化，必须实时读取（不能用缓存的快照值）；
  // 缩放变化后同一区域的裁剪需重算，缓存 key 附带当前像素尺寸以隔离不同缩放
  const { width: srcWidth, height: srcHeight } = getSourcePixelSize(source);
  const scaledCacheKey = `${cacheKey}_${srcWidth}x${srcHeight}`;
  const cached = cropCache.get(scaledCacheKey);
  if (cached) return cached;

  // position 与左侧识别框共用同一坐标空间（pages.width/height 或左侧画框 SVG
  // viewBox）。缩放比例 = 当前像素尺寸 / 坐标空间尺寸，天然包含了左侧视图的
  // 缩放与 DPI 差异，因此不需要额外的固定缩放系数
  const coordWidth = source.coordWidth || srcWidth;
  const coordHeight = source.coordHeight || srcHeight;

  // 页面坐标尺寸和渲染图片像素尺寸可能宽高比不同，横纵轴必须分别换算。
  const scaleX = srcWidth / coordWidth;
  const scaleY = srcHeight / coordHeight;
  const pad = 6; // 页面坐标系下向外扩边，避免裁掉边缘内容
  const x = Math.max(0, region.bbox.x - pad);
  const y = Math.max(0, region.bbox.y - pad);
  const w = Math.min(region.bbox.w + pad * 2, coordWidth - x);
  const h = Math.min(region.bbox.h + pad * 2, (coordHeight || coordWidth) - y);
  if (w <= 0 || h <= 0) throw new Error('invalid region');

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scaleX);
  canvas.height = Math.round(h * scaleY);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context not found');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    source.img,
    x * scaleX,
    y * scaleY,
    w * scaleX,
    h * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  // PDF 的 DOM 源（pdf.js canvas 或页面 img）像素尺寸包含设备像素比与左侧视图
  // 缩放，读取其 CSS 显示尺寸得到换算比率，供展示层把裁剪图还原为左侧视图
  // 当前缩放下的实际显示大小；base64/下载图源不在 DOM 中，读不到时保持缺省
  let displayRateX: number | undefined;
  let displayRateY: number | undefined;
  if (isPdf) {
    const el = source.img;
    let cssWidth = 0;
    let cssHeight = 0;
    if (el instanceof HTMLCanvasElement) {
      cssWidth = parseFloat(el.style.width) || el.getBoundingClientRect().width;
      cssHeight = parseFloat(el.style.height) || el.getBoundingClientRect().height;
    } else if (el instanceof HTMLImageElement) {
      cssWidth = el.width;
      cssHeight = el.height;
    }
    if (cssWidth > 0 && cssHeight > 0) {
      displayRateX = cssWidth / srcWidth;
      displayRateY = cssHeight / srcHeight;
    }
  }
  const cropResult: ICropResult = {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    displayRateX,
    displayRateY,
  };
  cropCache.set(scaledCacheKey, cropResult);
  return cropResult;
};

/** 单个区域的裁剪图 */
const CropRegionImage: React.FC<{ result: any; region: IQuestionRegion; isPdf: boolean }> = ({
  result,
  region,
  isPdf,
}) => {
  const regionKey = `${isPdf ? 'pdf' : 'image'}_${region.pageId}_${region.bbox.x}_${region.bbox.y}_${region.bbox.w}_${region.bbox.h}`;
  const [crop, setCrop] = useState<ICropResult | null>(() => getCachedCrop(regionKey));
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  // 实时换算比率：随左侧预览缩放变化，读不到时回退裁剪时的快照值
  const liveRate = useLiveDisplayRate(region.pageNumber);

  useEffect(() => {
    if (crop) return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    setFailed(false);
    const tryCrop = () => {
      cropRegion(result, region, isPdf)
        .then((cropResult) => {
          if (mounted) setCrop(cropResult);
        })
        .catch(() => {
          if (!mounted) return;
          // 左侧原图可能稍后才渲染完成（虚拟滚动/canvas 绘制），自动轮询重试几次
          if (attempts < 10) {
            attempts += 1;
            timer = setTimeout(tryCrop, 300);
          } else {
            setFailed(true);
          }
        });
    };
    tryCrop();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [regionKey, result, isPdf, retryKey]);

  if (crop) {
    // PDF 模式的 DOM 源裁剪图按左侧视图当前缩放的换算比率显示（与区域在
    // 左侧的实际显示大小一致）；其余情况限制为实际像素的 1/1.5，避免放大模糊。
    // 比率优先取实时值（跟随左侧预览尺寸变化），读不到时用裁剪时的快照兜底
    const rateXLive = liveRate?.rateX ?? crop.displayRateX;
    const rateYLive = liveRate?.rateY ?? crop.displayRateY;
    const rateX = isPdf && rateXLive ? (1 / 1.5) * (1 / rateXLive) : 1 / 1.5;
    const rateY = isPdf && rateYLive ? (1 / 1.5) * (1 / rateYLive) : 1 / 1.5;
    return (
      <img
        className={styles.cropImg}
        src={crop.dataUrl}
        alt={`第${region.pageNumber}页区域`}
        data-rateX={rateXLive}
        data-rateY={rateYLive}
        data-width={`${crop.width / (isPdf && rateXLive ? rateXLive : 1)}px`}
        data-height={`${crop.height / (isPdf && rateXLive ? rateXLive : 1)}px`}
        style={{ maxWidth: `${crop.width * rateX}px`, maxHeight: `${crop.height * rateY}px` }}
      />
    );
  }
  if (failed) {
    return (
      <div
        className={styles.cropFailed}
        onClick={() => {
          // 不阻止冒泡：外层 cropRegionItem 会高亮并滚动左侧到该区域，
          // 虚拟滚动随之渲染对应页面；同时 retryKey 递增触发重新裁剪
          setRetryKey((prev) => prev + 1);
        }}
      >
        暂无原图，点击重试
      </div>
    );
  }
  return (
    <div className={styles.cropLoading}>
      <Spin size="small" />
    </div>
  );
};

/** 图片模式下的单个题目 */
const ImageQuestionItem: React.FC<{
  result: any;
  question: IExamPaperQuestion;
  isPdf: boolean;
  showIndex?: boolean;
}> = ({
  result,
  question,
  isPdf,
  showIndex = true,
}) => {
  const regionGroups = useMemo(() => getQuestionRegionGroups(result, question), [result, question]);
  const questionContentId = question.contentIds.length > 0 ? question.contentIds[0] : undefined;

  return (
    <div
      className={styles.imageQuestionItem}
      data-question-content-ids={question.contentIds.join(',')}
      data-content-id={questionContentId}
    >
      <div className={styles.questionHeader}>
        {showIndex && <span className={styles.questionIndex}>{question.index}.</span>}
        {question.typeDesc && <Tag className={styles.questionTypeTag}>{question.typeDesc}</Tag>}
      </div>

      {regionGroups.length === 0 ? (
        <div className={styles.cropFailed}>该题目暂无图片定位信息</div>
      ) : (
        <div className={styles.cropRegionList}>
          {regionGroups.map((group, gIdx) =>
            group.regions.map((region, rIdx) => (
              <div
                key={`${gIdx}-${rIdx}`}
                className={styles.cropRegionItem}
                data-content-id={region.contentIds[0]}
                onClick={(e) => {
                  e.stopPropagation();
                  // 先清除两侧旧选中态，再高亮当前区域，避免多个图块同时处于选中态
                  // （多个 active polygon 会导致左侧无法进入拖拽编辑态）
                  clearAllActive(document.documentElement, styles.active);
                  e.currentTarget.classList.add(styles.active);
                  highlightLeftViewRects(region.contentIds);
                }}
                title="点击在左侧视图中定位"
              >
                <CropRegionImage
                  key={`${region.pageId}_${region.bbox.x}_${region.bbox.y}_${region.bbox.w}_${region.bbox.h}`}
                  result={result}
                  region={region}
                  isPdf={isPdf}
                />
                <div className={styles.regionPosInfo}>
                  {group.label && <span className={styles.regionLabel}>{group.label} · </span>}
                  第 {region.pageNumber} 页 · x: {Math.round(region.bbox.x)}, y: {Math.round(region.bbox.y)} ·
                  宽 {Math.round(region.bbox.w)} × 高 {Math.round(region.bbox.h)}
                </div>
              </div>
            )),
          )}
        </div>
      )}

      {question.subQuestions.length > 0 && (
        <div className={styles.subQuestions}>
          <div className={styles.subQuestionsTitle}>小题：</div>
          {question.subQuestions.map((sub, idx) => (
            <ImageQuestionItem key={idx} result={result} question={sub} isPdf={isPdf} />
          ))}
        </div>
      )}
    </div>
  );
};

/** 试卷图片预览视图：按题目展示其在原始文档中的图片与位置 */
const ExamPaperImageView: React.FC<IProps> = ({ result, data, isPdf = false }) => {
  if (!data?.sections?.length) {
    return <Empty description="暂无试卷数据" />;
  }

  return (
    <div className={styles.examPaperImageContainer}>
      <div className={styles.imageModeTip}>
        图片预览按题目展示其在原始文档中的截图与坐标位置，点击可在左侧视图中定位；在左侧选中单个识别框后可拖拽移动或调整大小，右侧图片将同步更新。
      </div>
      <div className={styles.paperSections}>
        {data.sections.map((section, idx) => (
          <div key={idx} className={styles.sectionItem}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionName}>{section.name}</span>
              <Tag className={styles.sectionCount}>共 {section.questions.length} 题</Tag>
            </div>
            <div className={styles.sectionQuestions}>
              {section.questions.map((q, qIdx) => (
                <ImageQuestionItem key={qIdx} result={result} question={q} isPdf={isPdf} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExamPaperImageView;
