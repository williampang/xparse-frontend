import { scrollIntoViewIfNeeded } from '@/utils/dom';

/** 清除所有高亮状态 */
export const clearAllActive = (container: HTMLElement, activeClassName: string) => {
  const oldActiveDoms = container.querySelectorAll(`[data-content-id].${activeClassName}`);
  oldActiveDoms.forEach((item) => item.classList.remove(activeClassName));
  const oldActivePolygons = document.querySelectorAll('#imgContainer polygon.active');
  oldActivePolygons.forEach((item) => item.classList.remove('active'));
  const oldCellPaths = document.querySelectorAll('#imgContainer .cell-g-wrapper path.active');
  oldCellPaths.forEach((item) => item.classList.remove('active'));
};

/** 高亮任务序号：新的高亮会使之前未完成的延迟轮询失效，避免把旧选中态重新加回 */
let highlightSeq = 0;

/** 高亮左侧视图对应的 polygon */
export const highlightLeftViewRects = (
  contentIds: (string | number)[],
  preferredPageNumber?: number,
) => {
  const viewerContainer = document.querySelector<HTMLElement>('#imgContainer');
  if (!viewerContainer || contentIds.length === 0) return;

  const seq = (highlightSeq += 1);
  const idSelector = contentIds.map((id) => `polygon[data-content-id="${id}"]`).join(',');

  let count = 0;
  const handle = () => {
    const targetPolygons = viewerContainer.querySelectorAll<HTMLElement>(idSelector);
    if (targetPolygons.length > 0) {
      targetPolygons.forEach((item) => item.classList.add('active'));
      let targetPolygon = targetPolygons[0];
      if (typeof preferredPageNumber === 'number') {
        const matched = Array.from(targetPolygons).find((p) => {
          const pNum = p.closest('[data-page-number]')?.getAttribute('data-page-number');
          return pNum === String(preferredPageNumber);
        });
        if (matched) targetPolygon = matched;
      }
      const pageDom = targetPolygon.closest('[data-page-number]') as HTMLElement;
      if (pageDom) {
        scrollIntoViewIfNeeded(pageDom, viewerContainer, { block: 'nearest', inline: 'nearest' });
      }
      scrollIntoViewIfNeeded(targetPolygon, viewerContainer, {
        block: 'nearest',
        inline: 'nearest',
      });
      return true;
    }
    return false;
  };

  if (!handle()) {
    const timer = setInterval(() => {
      // 已有新的高亮请求，放弃本次延迟补加，避免覆盖最新选中态
      if (seq !== highlightSeq) {
        clearInterval(timer);
        return;
      }
      count += 1;
      if (handle() || count >= 30) {
        clearInterval(timer);
      }
    }, 100);
  }
};
