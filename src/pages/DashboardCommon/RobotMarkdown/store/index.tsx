import { useEffect, useMemo, useRef, useState } from 'react';
import { createContainer } from 'unstated-next';
import lodash, { cloneDeep } from 'lodash';
import type { VirtuosoHandle } from 'react-virtuoso';
import type Vditor from 'vditor';
import type { IFileItem, IImgResult, IItemList, IRectListItem, KeyTypeEnum } from '../data';
import type { IRectItem } from '../../RobotMarkdown/utils';
import { isMarkdownHeader, jsonToMarkdown, splitMarkdownHeader } from '../../RobotMarkdown/utils';
import { getParamsSettings } from '../../components/ParamsSettings/utils';
import { useUpdateEffect } from 'ahooks';
import { ResultType } from '../containers/RightView/RightView';
import { getCatalogData } from '../containers/Catalog';
import useGetState from '@/utils/hooks/useGetState';
import { ensureArray, ensureNumber, isEmpty, isNumber } from '@/utils/objectUtils';

export interface ResultJsonUpdateParams {
  value: string;
  contentItem: IRectItem;
  markdown?: string;
}

const useStore = () => {
  const [currentFile, setCurrentFile] = useState<IFileItem | Record<string, any>>({} as any);
  const [resultJson, setResultJson] = useState<IImgResult | null>(null);
  const [resultJsonSaveLoading, setResultJsonSaveLoading] = useState(false);
  // 识别结果
  const [itemList, setItemList] = useState<IItemList[]>([]);
  const [tableList, setTableList] = useState<IItemList[][]>();
  const [key, setKey] = useState<KeyTypeEnum>();
  // 当前选中的框选id
  const [curUid, setCurUid] = useState<any>('');
  // 框选数据
  const [rectList, setRectList] = useState<IRectListItem[]>([]);

  // markdown编辑/查看模式
  const [markdownMode, setMarkdownMode] = useState<'view' | 'edit'>('view');
  const markdownEditorRef = useRef<Vditor | null>(null);

  // 试卷编辑/查看模式
  const [examPaperMode, setExamPaperMode] = useState<'view' | 'edit'>('view');

  // 试卷展示格式：markdown 格式 / 图片预览
  const [examPaperPreviewFormat, setExamPaperPreviewFormat] = useState<'markdown' | 'image'>('markdown');

  // 删除历史快照堆栈（用于撤销删除）
  const [deleteHistory, setDeleteHistory] = useState<
    {
      ids: number[];
      savedSnapshots: {
        idx: number;
        itemSnapshot: any;
        pageRectsSnapshot?: { pageIndex: number; rectItem: any }[];
      }[];
    }[]
  >([]);

  // 当切换文件时清空删除历史
  useUpdateEffect(() => {
    setDeleteHistory([]);
  }, [currentFile?.id]);

  // 是否展示markdown最新修改结果
  const [_showModifiedMarkdown, setShowModifiedMarkdown] = useState<boolean>(true);
  const showModifiedMarkdown = useMemo(
    () => _showModifiedMarkdown && resultJson?.detail_new,
    [_showModifiedMarkdown, resultJson],
  );

  const [resultType, setResultType, getLatestResultType] = useGetState<ResultType>(ResultType.md);
  const [subType, setSubType] = useState<ResultType>();

  const { hasCatalog, catalogData } = useMemo(() => {
    const catalog = currentFile?.result?.catalog;
    const catalogData = getCatalogData(catalog);
    return { hasCatalog: ensureArray(catalogData).length > 0, catalogData };
  }, [currentFile?.result?.catalog]);

  // 虚拟滚动容器
  const viewerVirtuosoRef = useRef<VirtuosoHandle>(null);
  const resultVirtuosoRef = useRef<VirtuosoHandle>(null);

  // 解析结果滚动容器
  const resultScrollerRef = useRef<HTMLDivElement>(null);

  // 切换tab滚动到开头
  useUpdateEffect(() => {
    if (resultType === ResultType.md) {
      viewerVirtuosoRef?.current?.scrollToIndex({
        index: 0,
        align: 'start',
      });
    }
    resultVirtuosoRef?.current?.scrollToIndex({
      index: 0,
      align: 'start',
    });
  }, [resultType]);

  const pagesIndexMapRef = useRef<Record<number, number>>({});
  const startPageNumberRef = useRef(1);

  const setPageIndexMap = (rects: IRectItem[][]) => {
    pagesIndexMapRef.current = {};
    const displayData: IRectItem[][] = [];
    for (let index = 0; index < rects.length; index++) {
      const item = rects[index]?.filter((e) => !(e.type === 'catalog' || e._from_split));
      if (!isEmpty(item)) {
        displayData.push(item);
        const firstPageNumber = ensureNumber(item[0]?.page_id);
        const lastPageNumber = ensureNumber(item[item.length - 1]?.page_id);
        for (let pageNumber = firstPageNumber; pageNumber <= lastPageNumber; pageNumber++) {
          pagesIndexMapRef.current[pageNumber] = displayData.length - 1;
        }
      }
    }
    return displayData;
  };

  const getStartPageNumber = () => ensureNumber(startPageNumberRef.current || 1);

  const getViewerItemIndex = (pageNumber: number) => {
    return pageNumber - getStartPageNumber();
  };

  const getResultItemIndex = (pageNumber: number) => {
    let resultItemIndex = pagesIndexMapRef.current?.[pageNumber];
    // 找不到说明是跨页合并，向前找一个最近的
    if (!isNumber(resultItemIndex)) {
      const sortedEntries = Object.entries(pagesIndexMapRef.current)
        .map(([k, v]) => ({ key: Number(k), value: v }))
        .sort((a, b) => a.key - b.key);
      let left = 0;
      let right = sortedEntries.length - 1;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const { key, value } = sortedEntries[mid];
        if (key < pageNumber) {
          resultItemIndex = value;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
    }
    return resultItemIndex;
  };

  // 文件切换重置编辑状态
  useEffect(() => {
    setMarkdownMode('view');
    setExamPaperMode('view');
    setShowModifiedMarkdown(true);
  }, [currentFile?.id]);

  const shouldSaveMarkdown = !currentFile?.isExample;
  const showAutoSave = useMemo(() => {
    return !!shouldSaveMarkdown && (markdownMode === 'edit' || examPaperMode === 'edit');
  }, [shouldSaveMarkdown, markdownMode, examPaperMode, currentFile]);

  const [autoSaveMarkdown, _setAutoSaveMarkdown] = useState<boolean>(
    (localStorage.getItem('autoSaveMarkdown') ?? 'true') === 'true',
  );
  const setAutoSaveMarkdown = (value: boolean) => {
    _setAutoSaveMarkdown(value);
    localStorage.setItem('autoSaveMarkdown', value.toString());
  };

  const autoSaveTimerRef = useRef<any>();

  const saveResultJson = async (silent = true) => {};

  useEffect(() => {
    if (showAutoSave && autoSaveMarkdown) {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setInterval(() => {
        saveResultJson();
      }, 10 * 1000);
    } else {
      clearInterval(autoSaveTimerRef.current);
    }
  }, [showAutoSave, autoSaveMarkdown, resultJson]);

  const rawResultJson = useMemo(() => {
    if (!resultJson) return {};
    const jsonData = lodash.omit(lodash.cloneDeep(resultJson), [
      'dpi',
      'remove_watermark',
      'crop_enhance',
      'detail_new',
      'markdown_new',
    ]);
    if (showModifiedMarkdown) {
      jsonData.detail = resultJson.detail_new || resultJson.detail;
      jsonData.markdown = resultJson.markdown_new || jsonToMarkdown(jsonData.detail);
    }
    const params = getParamsSettings();
    if (params?.page_details === 0) {
      delete jsonData.pages;
    }
    if (['none', 'objects'].includes(params?.get_image)) {
      if (Array.isArray(jsonData.pages)) {
        jsonData.pages.forEach((page: any) => {
          page.image_id = '';
        });
      }
      if (Array.isArray(jsonData.metrics)) {
        jsonData.metrics.forEach((page: any) => {
          page.image_id = '';
        });
      }
    }
    return jsonData;
  }, [resultJson, showModifiedMarkdown]);

  // 更新json结果
  const updateResultJson = ({ value, contentItem, markdown }: ResultJsonUpdateParams) => {    setResultJson((pre) => {
      let newDatail = cloneDeep([...(pre?.detail_new || pre?.detail)]);
      newDatail = newDatail.map((item, index) => {
        if (
          item?.type === contentItem.type &&
          String(item.position) === String(contentItem.position)
        ) {
          const isHeader = isMarkdownHeader(value);
          const res = splitMarkdownHeader(value);
          const text = isHeader ? res!.text : value;

          // 合并
          if (contentItem.custom_edit_continue) {
            let prevItemIndex = index - 1;
            let prevItem = newDatail[prevItemIndex];
            while (
              prevItem?.custom_edit_continue ||
              prevItem?.content === 1 ||
              prevItem?.type !== 'paragraph'
            ) {
              prevItemIndex = prevItemIndex - 1;
              prevItem = newDatail[prevItemIndex];
            }

            if (prevItem) {
              prevItem.custom_edit_continue_content_ids = [
                ...(prevItem.custom_edit_continue_content_ids || []),
                contentItem.content_id,
              ];
              prevItem.text = (prevItem.text?.trimEnd() || '') + text;
            }
          }
          return {
            ...item,
            ...contentItem,
            text,
            ...(isHeader
              ? {
                  outline_level: isHeader ? res!.hashes.length - 1 : -1,
                }
              : {}),
          };
        }
        return item;
      });
      return {
        ...pre,
        detail_new: newDatail,
        markdown_new: markdown,
      };
    });
  };

  // 更新指定 detail 块的 position（左侧视图调整框位置/大小后回写，支持单个或批量更新），
  // 同时同步 currentFile 的 result 与 rects，保证左侧框与右侧试卷解析数据一致
  const updateBlockPosition = (
    contentIdOrUpdates: number | string | { contentId: number | string; position: number[] }[],
    position?: number[],
  ) => {
    const updates: { idx: number; position: number[] }[] = [];
    if (Array.isArray(contentIdOrUpdates)) {
      for (const u of contentIdOrUpdates) {
        const idx = Number(u.contentId);
        if (!isNaN(idx) && Array.isArray(u.position) && u.position.length >= 8) {
          updates.push({ idx, position: u.position });
        }
      }
    } else {
      const idx = Number(contentIdOrUpdates);
      if (!isNaN(idx) && Array.isArray(position) && position.length >= 8) {
        updates.push({ idx, position });
      }
    }
    if (!updates.length) return;

    setResultJson((pre) => {
      if (!pre) return pre;
      const baseDetail = pre.detail_new || pre.detail;
      if (!Array.isArray(baseDetail)) return pre;
      const newDetail = cloneDeep([...baseDetail]);
      for (const u of updates) {
        if (newDetail[u.idx]) {
          newDetail[u.idx] = { ...newDetail[u.idx], position: u.position };
        }
      }
      return { ...pre, detail_new: newDetail };
    });

    setCurrentFile((pre: any) => {
      if (!pre?.result) return pre;
      const updateDetail = (detail?: any[]) => {
        if (!Array.isArray(detail)) return detail;
        const copy = [...detail];
        for (const u of updates) {
          if (copy[u.idx]) {
            copy[u.idx] = { ...copy[u.idx], position: u.position };
          }
        }
        return copy;
      };
      const result = { ...pre.result };
      result.detail = updateDetail(result.detail);
      if (result.detail_new) result.detail_new = updateDetail(result.detail_new);

      // 直接更新 rects/newRects 中对应块的 position，避免重新 formatResult
      const updateRects = (rects?: any[][]) => {
        if (!Array.isArray(rects)) return rects;
        return rects.map((pageRects) =>
          Array.isArray(pageRects)
            ? pageRects.map((r) => {
                const matched = updates.find((u) => Number(r?.content_id) === u.idx);
                return matched ? { ...r, position: matched.position } : r;
              })
            : pageRects,
        );
      };
      return {
        ...pre,
        result,
        rects: updateRects(pre.rects),
        newRects: updateRects(pre.newRects),
      };
    });
  };

  // 删除指定的 detail 块（支持单个或批量，通过清空 position 移除，保持 detail 数组索引不变）
  const deleteBlock = (contentIdOrIds: number | string | (number | string)[]) => {
    const ids = (Array.isArray(contentIdOrIds) ? contentIdOrIds : [contentIdOrIds])
      .map(Number)
      .filter((n) => !isNaN(n));
    if (!ids.length) return;

    // 记录快照以备撤销
    const currentDetail =
      resultJson?.detail_new ||
      resultJson?.detail ||
      currentFile?.result?.detail_new ||
      currentFile?.result?.detail;
    if (Array.isArray(currentDetail)) {
      const historyEntry: {
        ids: number[];
        savedSnapshots: {
          idx: number;
          itemSnapshot: any;
          pageRectsSnapshot?: { pageIndex: number; rectItem: any }[];
        }[];
      } = {
        ids,
        savedSnapshots: [],
      };

      for (const idx of ids) {
        if (currentDetail[idx]) {
          const item = currentDetail[idx];
          const pageRectsSnapshot: { pageIndex: number; rectItem: any }[] = [];
          const allRects = currentFile?.rects || [];
          if (Array.isArray(allRects)) {
            allRects.forEach((pageRects, pageIndex) => {
              if (Array.isArray(pageRects)) {
                pageRects.forEach((r) => {
                  if (Number(r?.content_id) === idx) {
                    pageRectsSnapshot.push({ pageIndex, rectItem: cloneDeep(r) });
                  }
                });
              }
            });
          }

          historyEntry.savedSnapshots.push({
            idx,
            itemSnapshot: {
              position: cloneDeep(item.position),
              pos_list: cloneDeep(item.pos_list),
              split_section_positions: cloneDeep(item.split_section_positions),
              split_section_page_ids: cloneDeep(item.split_section_page_ids),
            },
            pageRectsSnapshot,
          });
        }
      }
      if (historyEntry.savedSnapshots.length) {
        setDeleteHistory((prev) => [...prev, historyEntry]);
      }
    }

    setResultJson((pre) => {
      if (!pre) return pre;
      const baseDetail = pre.detail_new || pre.detail;
      if (!Array.isArray(baseDetail)) return pre;
      const newDetail = cloneDeep([...baseDetail]);
      for (const idx of ids) {
        if (newDetail[idx]) {
          newDetail[idx] = {
            ...newDetail[idx],
            position: undefined,
            pos_list: undefined,
            split_section_positions: undefined,
            split_section_page_ids: undefined,
            _deleted: true,
          };
        }
      }
      return { ...pre, detail_new: newDetail };
    });

    setCurrentFile((pre: any) => {
      if (!pre?.result) return pre;
      const updateDetail = (detail?: any[]) => {
        if (!Array.isArray(detail)) return detail;
        const copy = [...detail];
        for (const idx of ids) {
          if (copy[idx]) {
            copy[idx] = {
              ...copy[idx],
              position: undefined,
              pos_list: undefined,
              split_section_positions: undefined,
              split_section_page_ids: undefined,
              _deleted: true,
            };
          }
        }
        return copy;
      };
      const result = { ...pre.result };
      result.detail = updateDetail(result.detail);
      if (result.detail_new) result.detail_new = updateDetail(result.detail_new);

      // 从 rects/newRects 中过滤掉已删除的块
      const filterRects = (rects?: any[][]) => {
        if (!Array.isArray(rects)) return rects;
        return rects.map((pageRects) =>
          Array.isArray(pageRects)
            ? pageRects.filter((r) => !ids.includes(Number(r?.content_id)))
            : pageRects,
        );
      };
      return {
        ...pre,
        result,
        rects: filterRects(pre.rects),
        newRects: filterRects(pre.newRects),
      };
    });
  };

  // 撤销最近一次删除
  const undoDeleteBlock = () => {
    if (!deleteHistory.length) return false;
    const lastEntry = deleteHistory[deleteHistory.length - 1];
    setDeleteHistory((prev) => prev.slice(0, -1));

    setResultJson((pre) => {
      if (!pre) return pre;
      const baseDetail = pre.detail_new || pre.detail;
      if (!Array.isArray(baseDetail)) return pre;
      const newDetail = cloneDeep([...baseDetail]);
      for (const snap of lastEntry.savedSnapshots) {
        if (newDetail[snap.idx]) {
          newDetail[snap.idx] = {
            ...newDetail[snap.idx],
            ...snap.itemSnapshot,
          };
          delete newDetail[snap.idx]._deleted;
        }
      }
      return { ...pre, detail_new: newDetail };
    });

    setCurrentFile((pre: any) => {
      if (!pre?.result) return pre;
      const updateDetail = (detail?: any[]) => {
        if (!Array.isArray(detail)) return detail;
        const copy = [...detail];
        for (const snap of lastEntry.savedSnapshots) {
          if (copy[snap.idx]) {
            copy[snap.idx] = {
              ...copy[snap.idx],
              ...snap.itemSnapshot,
            };
            delete copy[snap.idx]._deleted;
          }
        }
        return copy;
      };
      const result = { ...pre.result };
      result.detail = updateDetail(result.detail);
      if (result.detail_new) result.detail_new = updateDetail(result.detail_new);

      const restoreRects = (rects?: any[][]) => {
        if (!Array.isArray(rects)) return rects;
        const copy = rects.map((p) => (Array.isArray(p) ? [...p] : []));
        for (const snap of lastEntry.savedSnapshots) {
          if (snap.pageRectsSnapshot) {
            for (const pr of snap.pageRectsSnapshot) {
              if (
                copy[pr.pageIndex] &&
                !copy[pr.pageIndex].some((r) => Number(r?.content_id) === snap.idx)
              ) {
                copy[pr.pageIndex].push(cloneDeep(pr.rectItem));
              }
            }
          }
        }
        return copy;
      };

      return {
        ...pre,
        result,
        rects: restoreRects(pre.rects),
        newRects: restoreRects(pre.newRects),
      };
    });

    return true;
  };

  return {
    type: 'new',
    currentFile,
    setCurrentFile,
    rawResultJson,
    resultJson,
    setResultJson,
    resultType,
    setResultType,
    getLatestResultType,
    subType,
    setSubType,
    itemList,
    setItemList,
    tableList,
    setTableList,
    key,
    setKey,
    curUid,
    setCurUid,
    rectList,
    setRectList,
    markdownMode,
    setMarkdownMode,
    examPaperMode,
    setExamPaperMode,
    examPaperPreviewFormat,
    setExamPaperPreviewFormat,
    updateResultJson,
    updateBlockPosition,
    deleteBlock,
    undoDeleteBlock,
    canUndoDelete: deleteHistory.length > 0,
    markdownEditorRef,
    resultScrollerRef,
    viewerVirtuosoRef,
    resultVirtuosoRef,
    showModifiedMarkdown,
    setShowModifiedMarkdown,
    showAutoSave,
    autoSaveMarkdown,
    shouldSaveMarkdown,
    setAutoSaveMarkdown,
    saveResultJson,
    resultJsonSaveLoading,
    catalogData,
    hasCatalog,
    pagesIndexMapRef,
    setPageIndexMap,
    getResultItemIndex,
    getStartPageNumber,
    getViewerItemIndex,
  };
};
export const storeContainer = createContainer(useStore);
