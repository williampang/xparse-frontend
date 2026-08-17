import { message } from 'antd';
import { storeContainer } from '../store';

/** 新增图块在预览屏幕上的目标宽度（px） */
const TILE_SCREEN_WIDTH = 300;
/** 新增图块在预览屏幕上的目标高度（px） */
const TILE_SCREEN_HEIGHT = 100;
/** 等待新 polygon 渲染上屏的最大重试次数 */
const MAX_SELECT_RETRIES = 10;

/**
 * 「添加图块」：在当前预览屏幕中心位置创建一个 300×100（屏幕像素）的可编辑识别框。
 * 兼容 parserPages（svg[data-page-number]）与 pdf.js（.page .rectLayer）两条左侧渲染路径：
 * 通过 SVG getScreenCTM 逆矩阵把屏幕坐标换算到页面坐标系（position 所在空间）。
 */
export default function useAddTile() {
  const { addTileBlock } = storeContainer.useContainer();

  const handleAddTile = () => {
    const container = document.getElementById('imgContainer');
    if (!container) {
      message.warning('预览区未就绪，无法添加图块');
      return;
    }
    const cRect = container.getBoundingClientRect();
    if (!cRect.width || !cRect.height) {
      message.warning('预览区未就绪，无法添加图块');
      return;
    }
    const centerX = cRect.left + cRect.width / 2;
    const centerY = cRect.top + cRect.height / 2;

    // 查找预览页 svg：优先取包含屏幕中心点的页，否则取离中心点最近的页
    let svgs = Array.from(container.querySelectorAll<SVGSVGElement>('svg[data-page-number]'));
    if (!svgs.length) {
      svgs = Array.from(container.querySelectorAll<SVGSVGElement>('.page .rectLayer'));
    }
    let target: SVGSVGElement | null = null;
    let bestScore = Infinity;
    for (const svg of svgs) {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const inside =
        centerX >= r.left && centerX <= r.right && centerY >= r.top && centerY <= r.bottom;
      const dx = Math.max(r.left - centerX, 0, centerX - r.right);
      const dy = Math.max(r.top - centerY, 0, centerY - r.bottom);
      const score = inside ? 0 : Math.hypot(dx, dy);
      if (score < bestScore) {
        bestScore = score;
        target = svg;
      }
    }
    if (!target) {
      message.warning('未找到可添加图块的预览页');
      return;
    }

    const ctm = target.getScreenCTM();
    if (!ctm) {
      message.warning('预览页坐标换算失败');
      return;
    }
    const inverse = ctm.inverse();
    const toUser = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(inverse);

    // CTM 已含缩放/旋转，用固定屏幕偏移换算出「用户单位 / 屏幕像素」比率
    const center = toUser(centerX, centerY);
    const refPoint = toUser(centerX + 100, centerY);
    const userPerPx = Math.hypot(refPoint.x - center.x, refPoint.y - center.y) / 100;
    if (!Number.isFinite(userPerPx) || userPerPx <= 0) {
      message.warning('预览页坐标换算失败');
      return;
    }

    const w = TILE_SCREEN_WIDTH * userPerPx;
    const h = TILE_SCREEN_HEIGHT * userPerPx;
    let x = center.x - w / 2;
    let y = center.y - h / 2;
    // 钳制在页面范围内
    const viewBox = (target.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    const vbW = viewBox[2] || 0;
    const vbH = viewBox[3] || 0;
    if (vbW > 0 && vbH > 0) {
      x = Math.min(Math.max(x, 0), Math.max(0, vbW - w));
      y = Math.min(Math.max(y, 0), Math.max(0, vbH - h));
    }
    const position = [x, y, x + w, y, x + w, y + h, x, y + h].map((v) => Math.round(v));

    const pageNumber = Number(
      target.dataset.pageNumber ||
        target.closest('.page')?.getAttribute('data-page-number') ||
        '1',
    );
    const contentId = addTileBlock(Math.max(0, pageNumber - 1), position);
    if (contentId === null) {
      message.warning('添加图块失败');
      return;
    }
    message.success('已添加图块');

    // polygon 随状态更新渲染，轮询等待上屏后选中，让 useRectAdjust 挂载编辑手柄
    const markActive = (retries: number) => {
      const polygons = container.querySelectorAll<SVGPolygonElement>(
        `polygon[data-content-id="${contentId}"]`,
      );
      if (!polygons.length) {
        if (retries > 0) {
          setTimeout(() => markActive(retries - 1), 100);
        }
        return;
      }
      container
        .querySelectorAll('polygon.active')
        .forEach((p) => p.classList.remove('active'));
      polygons.forEach((p) => p.classList.add('active'));
      polygons[0]?.scrollIntoView({ block: 'center', inline: 'nearest' });
    };
    setTimeout(() => markActive(MAX_SELECT_RETRIES), 50);
  };

  return handleAddTile;
}
