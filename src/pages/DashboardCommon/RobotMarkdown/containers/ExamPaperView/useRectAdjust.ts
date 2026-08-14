import { useEffect, useRef } from 'react';

/**
 * 左侧预览区识别框（单框或组合 Group）的拖拽移动 / 手柄缩放调整钩子。
 *
 * 左侧视图（SVGRect / PDFRenderViewer / pdf.js）统一以 `polygon[data-content-id]`
 * 渲染识别框，选中态为 `.active`。本钩子与具体渲染路径无关：
 * - 通过 MutationObserver 监听 `#imgContainer` 内 polygon 选中态（class）变化；
 * - 当有 1 个或多个 active polygon（组合 Group）时挂载 8 个缩放手柄与组合外框，支持整体拖拽移动与比例缩放；
 * - 拖拽结束（mouseup）后将新的 8 点坐标换算回页面坐标系，通过 onCommit 回写。
 */

interface IUseRectAdjustOptions {
  /** 是否启用（编辑模式下禁用） */
  enabled: boolean;
  /** detail_new || detail，用于读取块的原始 position（页面坐标系） */
  detail?: any[];
  /** 拖拽结束后的回写回调（支持单个或批量更新） */
  onCommit: (
    contentIdOrUpdates: number | string | { contentId: number | string; position: number[] }[],
    position?: number[],
  ) => void;
}

interface IBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface IAdjustTargetItem {
  polygon: SVGPolygonElement;
  contentId: string | number;
  origBBox: IBBox;
  startBBox: IBBox;
  prevPointerEvents: string;
  prevCursor: string;
}

type AdjustMode = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** 手柄定义：方向、光标样式 */
const HANDLE_DEFS: { mode: AdjustMode; cursor: string }[] = [
  { mode: 'nw', cursor: 'nwse-resize' },
  { mode: 'n', cursor: 'ns-resize' },
  { mode: 'ne', cursor: 'nesw-resize' },
  { mode: 'e', cursor: 'ew-resize' },
  { mode: 'se', cursor: 'nwse-resize' },
  { mode: 's', cursor: 'ns-resize' },
  { mode: 'sw', cursor: 'nesw-resize' },
  { mode: 'w', cursor: 'ew-resize' },
];

/** 手柄在屏幕上的固定像素大小 */
const HANDLE_SCREEN_SIZE = 8;
/** 手柄分组 DOM 类名 */
const HANDLES_CLASS = 'rect-adjust-handles';
/** 点击空白处清除全部选中/编辑态时广播的事件，右侧视图可监听以同步清除高亮 */
export const RECT_ADJUST_CLEAR_EVENT = 'rect-adjust-clear-all';
/** 容器查找轮询：最多 50 次 × 300ms */
const CONTAINER_POLL_TIMES = 50;
const CONTAINER_POLL_INTERVAL = 300;

/** 解析 polygon points 为 4 个角点（用户坐标系） */
const parsePolygonPoints = (polygon: SVGPolygonElement): { x: number; y: number }[] | null => {
  const raw = polygon.getAttribute('points');
  if (!raw) return null;
  const nums = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (nums.length < 8 || nums.some((n) => isNaN(n))) return null;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  return pts;
};

/** 由角点集合计算外包矩形 */
const pointsToBBox = (pts: { x: number; y: number }[]): IBBox => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/** 8 点坐标（页面坐标系）转 bbox */
const positionToBBox = (position: number[]): IBBox => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < position.length; i += 2) {
    minX = Math.min(minX, position[i]);
    maxX = Math.max(maxX, position[i]);
    minY = Math.min(minY, position[i + 1]);
    maxY = Math.max(maxY, position[i + 1]);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/** 屏幕坐标 → SVG 用户坐标 */
const toUserPoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
};

/** SVG 用户坐标相对屏幕的缩放比（用于保持手柄屏幕尺寸恒定） */
const getUserScale = (svg: SVGSVGElement): number => {
  const ctm = svg.getScreenCTM();
  const s = ctm ? Math.abs(ctm.a) : 1;
  return s > 0 ? s : 1;
};

/** 获取 svg viewBox 作为页面边界（用户坐标系），无 viewBox 返回 null */
const getViewBounds = (svg: SVGSVGElement): IBBox | null => {
  const viewBox = svg.getAttribute('viewBox');
  if (!viewBox) return null;
  const nums = viewBox.split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => isNaN(n)) || nums[2] <= 0 || nums[3] <= 0) {
    return null;
  }
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** 将 bbox 限制在页面边界内（保持宽高不变） */
const clampBBoxToBounds = (box: IBBox, bounds: IBBox | null): IBBox => {
  if (!bounds) return box;
  const w = Math.min(box.w, bounds.w);
  const h = Math.min(box.h, bounds.h);
  return {
    x: clamp(box.x, bounds.x, bounds.x + bounds.w - w),
    y: clamp(box.y, bounds.y, bounds.y + bounds.h - h),
    w,
    h,
  };
};

/** bbox → polygon points 字符串 */
const bboxToPoints = (box: IBBox): string =>
  `${box.x},${box.y} ${box.x + box.w},${box.y} ${box.x + box.w},${box.y + box.h} ${box.x},${
    box.y + box.h
  }`;

const useRectAdjust = ({ enabled, detail, onCommit }: IUseRectAdjustOptions) => {
  const detailRef = useRef<any[] | undefined>(detail);
  detailRef.current = detail;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let observer: MutationObserver | null = null;
    let refreshRaf = 0;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollCount = 0;
    // 自身 DOM 变更时挂起 observer，避免死循环
    let selfMutating = false;
    let selfMutateTimer: ReturnType<typeof setTimeout> | null = null;

    /** 清理函数 */
    let detach: (() => void) | null = null;
    /** 最后一个被点击的识别框 content_id */
    let lastClickedId: string | null = null;
    /** 左侧预览容器 */
    let containerEl: HTMLElement | null = null;

    const guardSelfMutation = (fn: () => void) => {
      selfMutating = true;
      fn();
      if (selfMutateTimer) clearTimeout(selfMutateTimer);
      selfMutateTimer = setTimeout(() => {
        selfMutating = false;
      }, 0);
    };

    const scheduleRefresh = () => {
      if (disposed || refreshRaf) return;
      refreshRaf = requestAnimationFrame(() => {
        refreshRaf = 0;
        refresh();
      });
    };

    /** 手柄中心坐标（用户坐标系） */
    const handleCenter = (mode: AdjustMode, box: IBBox) => {
      switch (mode) {
        case 'nw':
          return { x: box.x, y: box.y };
        case 'n':
          return { x: box.x + box.w / 2, y: box.y };
        case 'ne':
          return { x: box.x + box.w, y: box.y };
        case 'e':
          return { x: box.x + box.w, y: box.y + box.h / 2 };
        case 'se':
          return { x: box.x + box.w, y: box.y + box.h };
        case 's':
          return { x: box.x + box.w / 2, y: box.y + box.h };
        case 'sw':
          return { x: box.x, y: box.y + box.h };
        case 'w':
          return { x: box.x, y: box.y + box.h / 2 };
        default:
          return { x: box.x, y: box.y };
      }
    };

    /** 为 active polygon 组合（单个或多个）挂载手柄与拖拽逻辑 */
    const attach = (polygons: SVGPolygonElement[]) => {
      if (!polygons.length) return;
      const svg = polygons[0].closest('svg') as SVGSVGElement | null;
      const parent = polygons[0].parentNode;
      if (!svg || !parent) return;

      const items: IAdjustTargetItem[] = [];
      for (const polygon of polygons) {
        const contentId = polygon.getAttribute('data-content-id');
        if (!contentId) continue;
        const idx = Number(contentId);
        const item = Array.isArray(detailRef.current) ? detailRef.current[idx] : undefined;
        const position: number[] | undefined = item?.position || item?.pos_list?.[0];
        const startPts = parsePolygonPoints(polygon);
        if (!startPts) continue;
        const startBBox = pointsToBBox(startPts);
        if (startBBox.w <= 0 || startBBox.h <= 0) continue;

        const origBBox =
          Array.isArray(position) && position.length >= 8
            ? positionToBBox(position)
            : { ...startBBox };

        items.push({
          polygon,
          contentId,
          origBBox,
          startBBox,
          prevPointerEvents: polygon.style.pointerEvents,
          prevCursor: polygon.style.cursor,
        });
      }

      if (!items.length) return;

      const minX = Math.min(...items.map((it) => it.startBBox.x));
      const minY = Math.min(...items.map((it) => it.startBBox.y));
      const maxX = Math.max(...items.map((it) => it.startBBox.x + it.startBBox.w));
      const maxY = Math.max(...items.map((it) => it.startBBox.y + it.startBBox.h));
      const groupStartBBox: IBBox = {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
      };

      if (groupStartBBox.w <= 0 || groupStartBBox.h <= 0) return;

      const scale = getUserScale(svg);
      const handleSize = HANDLE_SCREEN_SIZE / scale;
      const minSize = 4 / scale;
      const viewBounds = getViewBounds(svg);

      // 创建手柄与外框分组
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', HANDLES_CLASS);

      // 组合外框（虚线边框，可响应整体拖拽）
      let outlineRect: SVGRectElement | null = null;
      if (items.length > 1) {
        outlineRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        outlineRect.setAttribute('fill', 'rgba(26, 102, 255, 0.04)');
        outlineRect.setAttribute('stroke', '#1a66ff');
        outlineRect.setAttribute('stroke-width', '1');
        outlineRect.setAttribute('stroke-dasharray', '4,4');
        outlineRect.setAttribute('vector-effect', 'non-scaling-stroke');
        outlineRect.style.cursor = 'move';
        group.appendChild(outlineRect);
      }

      const handleEls: { el: SVGRectElement; mode: AdjustMode }[] = [];
      for (const def of HANDLE_DEFS) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('data-adjust-mode', def.mode);
        rect.setAttribute('width', String(handleSize));
        rect.setAttribute('height', String(handleSize));
        rect.setAttribute('fill', '#fff');
        rect.setAttribute('stroke', '#1a66ff');
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        rect.style.cursor = def.cursor;
        group.appendChild(rect);
        handleEls.push({ el: rect, mode: def.mode });
      }

      /** 同步 group 中所有 polygon points 与手柄位置 */
      const paint = (box: IBBox) => {
        const scaleX = groupStartBBox.w > 0 ? box.w / groupStartBBox.w : 1;
        const scaleY = groupStartBBox.h > 0 ? box.h / groupStartBBox.h : 1;

        for (const it of items) {
          const polyBox: IBBox = {
            x: box.x + (it.startBBox.x - groupStartBBox.x) * scaleX,
            y: box.y + (it.startBBox.y - groupStartBBox.y) * scaleY,
            w: it.startBBox.w * scaleX,
            h: it.startBBox.h * scaleY,
          };
          it.polygon.setAttribute('points', bboxToPoints(polyBox));
        }

        if (outlineRect) {
          outlineRect.setAttribute('x', String(box.x));
          outlineRect.setAttribute('y', String(box.y));
          outlineRect.setAttribute('width', String(box.w));
          outlineRect.setAttribute('height', String(box.h));
        }

        for (const h of handleEls) {
          const c = handleCenter(h.mode, box);
          h.el.setAttribute('x', String(c.x - handleSize / 2));
          h.el.setAttribute('y', String(c.y - handleSize / 2));
        }
      };

      let currentBBox = { ...groupStartBBox };
      paint(currentBBox);

      // 把 active polygons 与手柄分组置顶显示
      const savedEntries = items.map((it) => ({
        polygon: it.polygon,
        prevSibling: it.polygon.previousElementSibling,
        parent: it.polygon.parentNode,
      }));

      const restoreTopMost = (() => {
        guardSelfMutation(() => {
          for (const it of items) {
            parent.appendChild(it.polygon);
          }
          parent.appendChild(group);
        });
        return () => {
          guardSelfMutation(() => {
            for (const entry of savedEntries) {
              if (!entry.polygon.parentNode || !entry.parent) continue;
              const refNode =
                entry.prevSibling && entry.prevSibling.parentNode === entry.parent
                  ? entry.prevSibling.nextSibling
                  : entry.parent.firstChild;
              if (refNode && refNode.parentNode !== entry.parent) continue;
              entry.parent.insertBefore(entry.polygon, refNode);
            }
          });
        };
      })();

      // 拖拽期间让 polygon 可命中
      for (const it of items) {
        it.polygon.style.pointerEvents = 'all';
        it.polygon.style.cursor = 'move';
      }

      let dragging = false;
      let moved = false;
      let startPt: { x: number; y: number } | null = null;
      let dragBBox: IBBox = { ...groupStartBBox };
      let dragMode: AdjustMode = 'move';

      const onWindowMove = (e: MouseEvent) => {
        if (!dragging || !startPt) return;
        const pt = toUserPoint(svg, e.clientX, e.clientY);
        if (!pt) return;
        e.preventDefault();

        let box: IBBox;
        if (dragMode === 'move') {
          box = {
            x: dragBBox.x + (pt.x - startPt.x),
            y: dragBBox.y + (pt.y - startPt.y),
            w: dragBBox.w,
            h: dragBBox.h,
          };
          box = clampBBoxToBounds(box, viewBounds);
        } else {
          let { x, y, w, h } = dragBBox;
          const right = x + w;
          const bottom = y + h;
          if (dragMode.includes('w')) {
            x = Math.min(pt.x, right - minSize);
            w = right - x;
          }
          if (dragMode.includes('e')) {
            const newRight = Math.max(pt.x, x + minSize);
            w = newRight - x;
          }
          if (dragMode.includes('n')) {
            y = Math.min(pt.y, bottom - minSize);
            h = bottom - y;
          }
          if (dragMode.includes('s')) {
            const newBottom = Math.max(pt.y, y + minSize);
            h = newBottom - y;
          }
          box = clampBBoxToBounds({ x, y, w, h }, viewBounds);
        }

        if (!moved) {
          moved =
            Math.abs(box.x - groupStartBBox.x) > 0.5 ||
            Math.abs(box.y - groupStartBBox.y) > 0.5 ||
            Math.abs(box.w - groupStartBBox.w) > 0.5 ||
            Math.abs(box.h - groupStartBBox.h) > 0.5;
        }
        currentBBox = box;
        guardSelfMutation(() => paint(box));
      };

      const suppressNextClick = () => {
        const intercept = (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          window.removeEventListener('click', intercept, { capture: true } as any);
        };
        window.addEventListener('click', intercept, { capture: true, once: true });
        setTimeout(() => {
          window.removeEventListener('click', intercept, { capture: true } as any);
        }, 0);
      };

      const onWindowUp = () => {
        if (!dragging) return;
        dragging = false;
        window.removeEventListener('mousemove', onWindowMove);
        window.removeEventListener('mouseup', onWindowUp);
        if (!moved) return;

        const scaleX = groupStartBBox.w > 0 ? currentBBox.w / groupStartBBox.w : 1;
        const scaleY = groupStartBBox.h > 0 ? currentBBox.h / groupStartBBox.h : 1;

        const updates: { contentId: string | number; position: number[] }[] = [];
        for (const it of items) {
          const finalPolyBox: IBBox = {
            x: currentBBox.x + (it.startBBox.x - groupStartBBox.x) * scaleX,
            y: currentBBox.y + (it.startBBox.y - groupStartBBox.y) * scaleY,
            w: it.startBBox.w * scaleX,
            h: it.startBBox.h * scaleY,
          };

          const ratioX = it.startBBox.w > 0 ? it.origBBox.w / it.startBBox.w : 1;
          const ratioY = it.startBBox.h > 0 ? it.origBBox.h / it.startBBox.h : 1;
          const nx = it.origBBox.x + (finalPolyBox.x - it.startBBox.x) * ratioX;
          const ny = it.origBBox.y + (finalPolyBox.y - it.startBBox.y) * ratioY;
          const nw = finalPolyBox.w * ratioX;
          const nh = finalPolyBox.h * ratioY;
          const newPosition = [nx, ny, nx + nw, ny, nx + nw, ny + nh, nx, ny + nh].map(Math.round);

          updates.push({ contentId: it.contentId, position: newPosition });
        }

        suppressNextClick();
        onCommitRef.current(updates);
        scheduleRefresh();
      };

      const startDrag = (mode: AdjustMode) => (e: MouseEvent) => {
        const pt = toUserPoint(svg, e.clientX, e.clientY);
        if (!pt) return;
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        moved = false;
        startPt = pt;
        dragBBox = { ...currentBBox };
        dragMode = mode;
        window.addEventListener('mousemove', onWindowMove);
        window.addEventListener('mouseup', onWindowUp);
      };

      const polygonDownHandlers = items.map((it) => {
        const fn = startDrag('move');
        it.polygon.addEventListener('mousedown', fn);
        return fn;
      });

      let outlineDownHandler: ((e: MouseEvent) => void) | null = null;
      if (outlineRect) {
        outlineDownHandler = startDrag('move');
        outlineRect.addEventListener('mousedown', outlineDownHandler);
      }

      const handleDowns = handleEls.map((h) => {
        const fn = startDrag(h.mode);
        h.el.addEventListener('mousedown', fn);
        return fn;
      });

      detach = () => {
        items.forEach((it, i) => it.polygon.removeEventListener('mousedown', polygonDownHandlers[i]));
        if (outlineRect && outlineDownHandler) {
          outlineRect.removeEventListener('mousedown', outlineDownHandler);
        }
        handleEls.forEach((h, i) => h.el.removeEventListener('mousedown', handleDowns[i]));
        window.removeEventListener('mousemove', onWindowMove);
        window.removeEventListener('mouseup', onWindowUp);
        for (const it of items) {
          it.polygon.style.pointerEvents = it.prevPointerEvents;
          it.polygon.style.cursor = it.prevCursor;
        }
        restoreTopMost();
        guardSelfMutation(() => {
          group.parentNode?.removeChild(group);
        });
        detach = null;
      };
    };

    /**
     * 从 active polygons 中按页面归类目标组合：
     * - 支持单个框或多个框形成的 Group 组合；
     * - 若跨页则优先选最后点击框所在页或第一页的目标。
     */
    const pickTargetGroup = (actives: SVGPolygonElement[]): SVGPolygonElement[] => {
      if (!actives.length) return [];
      let targetSvg: SVGSVGElement | null = null;
      if (lastClickedId) {
        const clicked = actives.find(
          (p) => p.getAttribute('data-content-id') === lastClickedId,
        );
        if (clicked) {
          targetSvg = clicked.closest('svg');
        }
      }
      if (!targetSvg) {
        targetSvg = actives[0].closest('svg');
      }
      if (!targetSvg) return [];
      return actives.filter((p) => p.closest('svg') === targetSvg);
    };

    /** 移除 #imgContainer 内所有残留的手柄分组（防止泄漏） */
    const removeStrayHandles = () => {
      guardSelfMutation(() => {
        document
          .querySelectorAll(`#imgContainer .${HANDLES_CLASS}`)
          .forEach((g) => g.parentNode?.removeChild(g));
      });
    };

    /** 刷新：依据当前 active polygons 挂载/卸载手柄与组合框 */
    const refresh = () => {
      if (disposed) return;
      const actives = Array.from(
        document.querySelectorAll<SVGPolygonElement>('#imgContainer polygon.active'),
      ).filter((p) => !p.classList.contains('catalog'));

      const targetGroup = pickTargetGroup(actives);
      detach?.();
      removeStrayHandles();
      if (targetGroup.length > 0) {
        attach(targetGroup);
      }
    };

    /**
     * 容器点击：
     * - 点击识别框 → 记录为最后点击的框；
     * - 点击空白处 → 清除所有选中/编辑态。
     */
    const onContainerClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target || target.closest(`.${HANDLES_CLASS}`)) return;

      const polygon = target.closest('polygon[data-content-id]');
      if (polygon) {
        lastClickedId = polygon.getAttribute('data-content-id');
        scheduleRefresh();
        return;
      }

      // 空白处：取消全部可编辑状态
      const activeEls = containerEl?.querySelectorAll('.active');
      if (activeEls?.length) {
        guardSelfMutation(() => {
          activeEls.forEach((el) => el.classList.remove('active'));
        });
      }
      lastClickedId = null;
      window.dispatchEvent(new Event(RECT_ADJUST_CLEAR_EVENT));
      scheduleRefresh();
    };

    const startObserve = (container: HTMLElement) => {
      observer = new MutationObserver(() => {
        if (selfMutating) return;
        scheduleRefresh();
      });
      observer.observe(container, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
      });
      container.addEventListener('click', onContainerClick);
      refresh();
    };

    // 容器可能晚于钩子挂载，轮询等待
    const pollContainer = () => {
      if (disposed) return;
      const container = document.getElementById('imgContainer');
      if (container) {
        containerEl = container;
        startObserve(container);
        return;
      }
      pollCount += 1;
      if (pollCount < CONTAINER_POLL_TIMES) {
        pollTimer = setTimeout(pollContainer, CONTAINER_POLL_INTERVAL);
      }
    };
    pollContainer();

    return () => {
      disposed = true;
      if (refreshRaf) cancelAnimationFrame(refreshRaf);
      if (pollTimer) clearTimeout(pollTimer);
      if (selfMutateTimer) clearTimeout(selfMutateTimer);
      observer?.disconnect();
      if (containerEl) containerEl.removeEventListener('click', onContainerClick);
      detach?.();
    };
  }, [enabled]);
};

export default useRectAdjust;
