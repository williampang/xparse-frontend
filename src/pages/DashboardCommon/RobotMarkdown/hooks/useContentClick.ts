import { scrollIntoViewIfNeeded } from '@/utils/dom';
import useLatest from '@/utils/hooks/useLatest';
import { ensureNumber, isNumber } from '@/utils/objectUtils';
import { useEffect, useRef } from 'react';
import type { VirtuosoGridHandle } from 'react-virtuoso';

interface IProps {
  onRectClick?: (e: any) => void;
  onContentClick?: (e: any) => void;
  scrollToCenter?: boolean;
  run?: boolean;
  data?: { [key: string]: any; content_id: any }[][];
  viewerVirtuosoRef?: React.RefObject<VirtuosoGridHandle>;
  getViewerItemIndex?: (pageNumber: number) => number;
}

const useContentClick = ({
  onRectClick,
  onContentClick,
  scrollToCenter,
  run = true,
  data,
  viewerVirtuosoRef,
  getViewerItemIndex,
}: IProps = {}) => {
  const latestRectClick = useLatest(onRectClick);
  const latestContentClick = useLatest(onContentClick);
  const findActivePageTimerRef = useRef<any>(null);
  const findActiveCellTimerRef = useRef<any>(null);

  useEffect(() => {
    const dom = document.querySelector('.result-content-body');
    if (dom && run) {
      dom.addEventListener('click', clickHandle);
      dom.addEventListener('rect-click', rectClickHandle);

      return () => {
        dom.removeEventListener('click', clickHandle);
        dom.removeEventListener('rect-click', rectClickHandle);
      };
    }
  }, [run, data]);

  function clickHandle(e: any, { scrollOnly = false }: { scrollOnly?: boolean } = {}) {
    const wrapper = e.currentTarget as HTMLDivElement;
    let target: any = e.target;
    let activeTarget: HTMLDivElement | undefined;
    let cellTarget: HTMLTableCellElement | undefined;
    while (target && wrapper.contains(target)) {
      if (!cellTarget && (target.tagName === 'TD' || target.tagName === 'TH')) {
        cellTarget = target;
      }
      if (target.dataset.contentId) {
        activeTarget = target;
        break;
      } else {
        target = target.parentElement;
      }
    }
    if (activeTarget?.dataset.active === '0') return;
    if (!scrollOnly) {
      const oldActiveDoms = wrapper.querySelectorAll<HTMLDivElement>(`[data-content-id].active`);
      if (oldActiveDoms) {
        oldActiveDoms.forEach((item) => {
          if (item !== activeTarget) {
            item.classList.remove('active');
          }
        });
      }
      const oldCellDoms = wrapper.querySelectorAll<HTMLTableCellElement>(`table .active`);
      oldCellDoms.forEach((item) => {
        if (item !== e.target) {
          item.classList.remove('active');
        }
      });
    }

    if (activeTarget) {
      if (!scrollOnly) {
        activeTarget.classList.add('active');
      }

      let pageNumber = '';
      let pageTarget = activeTarget.parentElement;
      let loopNum = 1;
      while (pageTarget) {
        const page = pageTarget.dataset.pageNumber;
        if (page) {
          pageNumber = page;
          break;
        } else {
          pageTarget = pageTarget.parentElement;
        }
        loopNum += 1;
        if (loopNum > 10) {
          break;
        }
      }

      scrollToTarget({
        pageNumber,
        contentId: activeTarget.dataset.contentId,
        triggerTarget: cellTarget,
        scrollOnly,
      });
    }
  }

  function scrollToTarget(params: {
    pageNumber?: string | number;
    contentId?: string;
    scrollToCenter?: boolean;
    triggerTarget?: HTMLTableCellElement;
    scrollOnly?: boolean;
  }) {
    const { contentId, triggerTarget, scrollOnly } = params;
    let pageNumber = params.pageNumber;
    let activeCellId: any;
    const triggerParent = triggerTarget?.parentElement;
    if (
      (triggerTarget?.tagName === 'TD' || triggerTarget?.tagName === 'TH') &&
      triggerParent &&
      data
    ) {
      let table = triggerParent;
      let loopNum = 0;
      while (table?.parentElement && !table.dataset.contentId) {
        table = table?.parentElement;
        loopNum += 1;
        if (loopNum > 10) {
          break;
        }
      }
      const isMdTable = table?.classList.contains('md-table');
      const rows = table?.querySelectorAll('tr');
      let row_index: number = 0;
      if (rows) {
        for (let index = 0; index < rows.length; index++) {
          const cell = rows[index];
          if (cell === triggerParent) {
            row_index = index;
            break;
          }
        }
      }
      let col_index: number = 0;
      for (let index = 0; index < triggerParent.children.length; index++) {
        const cell: any = triggerParent.children[index];
        if (cell === triggerTarget) {
          col_index = index;
          break;
        }
      }
      const tableItem = data[Number(pageNumber) - 1]?.find(
        (item) => String(item.content_id) === contentId,
      );
      const cellList = Array.isArray(tableItem?.split_cells)
        ? tableItem.split_cells.reduce(
            (pre: any[], arr: any) => [
              ...pre,
              ...arr.cells.map((cell: any) => ({ ...cell, page_id: arr.page_id })),
            ],
            [],
          )
        : tableItem?.cells?.cells || [];
      let targetCell;
      if (isMdTable) {
        targetCell = cellList.find(
          (cell: any) =>
            cell.row <= row_index &&
            cell.row + cell.row_span > row_index &&
            cell.col <= col_index &&
            cell.col + cell.col_span > col_index,
        );
      } else {
        const cellIdReg = new RegExp(`^${row_index}_${col_index}_cell_`);
        targetCell = cellList.find((cell: any) => cellIdReg.test(cell.cell_id));
      }
      if (targetCell) {
        if (targetCell.page_id && targetCell.page_id !== pageNumber) {
          pageNumber = targetCell.page_id;
        }
        activeCellId = `#imgContainer .cell-g-wrapper [data-content-id="${contentId}_cell_${targetCell.cell_id}"]`;
      }
    }

    const scrollToCenterView = params.hasOwnProperty('scrollToCenter')
      ? params.scrollToCenter
      : scrollToCenter;
    const viewerContainer = document.querySelector<HTMLElement>('#imgContainer');
    const getActivePage = () =>
      viewerContainer?.querySelector<HTMLElement>(`[data-page-number="${pageNumber}"]`);
    let activePage = getActivePage();
    if (!activePage) {
      if (viewerVirtuosoRef?.current && pageNumber) {
        const targetPageIndex = getViewerItemIndex?.(ensureNumber(pageNumber));
        viewerVirtuosoRef.current.scrollToIndex({
          index: isNumber(targetPageIndex) ? targetPageIndex : ensureNumber(pageNumber) - 1,
          align: 'center',
        });
      }
      let count = 0;
      if (findActivePageTimerRef.current) {
        clearInterval(findActivePageTimerRef.current);
      }
      findActivePageTimerRef.current = setInterval(() => {
        if (activePage || count > 30) {
          clearInterval(findActivePageTimerRef.current);
          findActivePageTimerRef.current = null;
          count = 0;
          scrollTargetPageAndContent();
        } else {
          activePage = getActivePage();
        }
      }, 100);
    } else {
      scrollTargetPageAndContent();
    }

    function scrollTargetPageAndContent() {
      const oldActivePolygons = document.querySelectorAll('#imgContainer polygon.active');
      if (oldActivePolygons) {
        oldActivePolygons.forEach((item) => {
          item.classList.remove('active');
        });
      }
      if (scrollToCenterView) {
        activePage?.scrollIntoView();
      } else {
        if (activePage && viewerContainer) {
          scrollIntoViewIfNeeded(activePage, viewerContainer, {
            block: 'nearest',
            inline: 'nearest',
          });
        }

        // activePage?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }

      if (scrollOnly) {
        return;
      }

      if (latestContentClick.current) {
        latestContentClick.current(params);
      }

      const handle = () => {
        const targetPolygon = document.querySelectorAll<HTMLElement>(
          `#imgContainer polygon[data-content-id="${contentId}"]`,
        );

        const activeCell = document.querySelector(activeCellId);
        if (activeCellId && !activeCell && !targetPolygon.length && triggerTarget) {
          triggerTarget.classList.add('active');
        }
        if (targetPolygon?.length) {
          targetPolygon.forEach((item) => {
            item.classList.add('active');
          });
          const scrollToTargetPolygon = () => {
            scrollIntoViewIfNeeded(
              targetPolygon[targetPolygon.length - 1],
              viewerContainer!,
              {
                block: 'nearest',
                inline: 'nearest',
              },
            );
          };

          const oldCellPaths = document.querySelectorAll<SVGPathElement>(
            `#imgContainer .cell-g-wrapper path.active`,
          );
          oldCellPaths.forEach((item) => {
            item.classList.remove('active');
          });
          if (activeCell && triggerTarget) {
            const cellGroup = document.querySelector<SVGPathElement>(
              `#imgContainer .cell-g-wrapper[data-content-id="${contentId}"]`,
            );
            if (!cellGroup?.classList.contains('cell-g-hidden')) {
              triggerTarget.classList.add('active');
              activeCell.classList.add('active');
              scrollIntoViewIfNeeded(
                activeCell,
                viewerContainer!,
                {
                  block: 'nearest',
                  inline: 'nearest',
                },
                activeCell?.getBoundingClientRect().height,
              );
              // activeCell.scrollIntoView({ block: 'center', inline: 'nearest' });
            } else {
              scrollToTargetPolygon();
            }
          } else {
            scrollToTargetPolygon();
          }
          if (!activeCell && triggerTarget && activeCellId) {
            return false;
          }
          return true;
        }
        return false;
      };

      let count = 0;
      if (findActiveCellTimerRef.current) {
        clearInterval(findActiveCellTimerRef.current);
      }
      findActiveCellTimerRef.current = setInterval(() => {
        count++;
        if (handle() || count >= 100) {
          clearInterval(findActiveCellTimerRef.current);
          count = 0;
          findActiveCellTimerRef.current = null;
        }
      }, 100);

      // requestAnimationFrame(() => {
      //   if (!handle()) {
      //     requestAnimationFrame(() => {
      //       handle();
      //     });
      //   }
      // });
    }
  }

  function rectClickHandle(e: any) {
    latestRectClick.current?.(e);
  }

  return { scrollToTarget, clickHandle };
};

export default useContentClick;
