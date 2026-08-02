import { useState, useEffect, useMemo } from 'react';
import { message, Modal } from 'antd';
// import * as XLSX from 'xlsx';
import saveAs from 'file-saver';
import PQueue from 'p-queue';
import JSZip from 'jszip';
import { flatten } from 'lodash';
import {
  base64ToBlob,
  copy,
  downloadFile,
  getDownloadName,
  getFileNameAndType,
  replaceFileSuffixName,
  requestWidthCache,
} from '@/utils';
import type { IFileItem } from '../../data';
import { storeContainer } from '../../store';
import { ResultType } from './RightView';
import { loadXLSX } from '@/utils/xlsx';
import type { IRectItem } from '../../utils';
import { jsonToMarkdown, formatExamPaper } from '../../utils';
import { isEmpty, omit } from '@/utils/objectUtils';
import md2html, { encodeMath, mdRender } from '../../../RobotMarkdown/MarkdownRender/md2html';

const mdTypes = [
  {
    text: 'md',
    key: 'md',
  },
  {
    text: 'txt',
    key: 'txt',
  },
];

export interface IProps {
  current: IFileItem;
  // 左侧批量选中的列表
  currentChoosenList: any;
  titleName: string;
  currentTab: ResultType;
  disabled?: boolean;
  service: string;
  markdown?: boolean;
  showCopy?: boolean;
  showEdit?: boolean;
  onOpenSurvey?: () => void;
}

interface FileExportParams {
  filetype: string;
  filename: string;
}

function useResultOperations(props: IProps) {
  const { service, current, titleName, currentTab, currentChoosenList = [] } = props;
  const {
    currentFile,
    resultJson,
    rawResultJson: rawResultJsonFromStore,
    resultType,
    showModifiedMarkdown,
    markdownEditorRef,
    setMarkdownMode,
    shouldSaveMarkdown,
    saveResultJson,
  } = storeContainer.useContainer();
  const rawResultJson = omit(rawResultJsonFromStore, ['x_request_id']);

  const [wordLoading, setWordLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);

  const saveMarkdown = async () => {
    setSaveLoading(true);
    try {
      if (shouldSaveMarkdown) {
        await saveResultJson?.(false);
      }
      setMarkdownMode?.('view');
    } catch (error) {
      console.log(error);
    }
    setSaveLoading(false);
  };

  const resultExportType = useMemo(() => {
    const mdResultTypes = mdTypes;
    if (rawResultJson?.doc_base64 && !currentChoosenList.length) {
      return [...mdResultTypes, { text: 'docx', key: ResultType.doc_base64 }];
    }
    return mdResultTypes;
  }, [rawResultJson, currentChoosenList, currentFile]);

  const getMarkdownContent = async () => {
    if (showModifiedMarkdown && markdownEditorRef.current) {
      return jsonToMarkdown(flatten(current.newRects));
    }
    const markdown = rawResultJson?.markdown;
    return markdown;
  };

  // 是否可以批量导出
  const [canBatchExport, setCanBatchExport] = useState(false);
  // 是否可以单张导出
  const [canExport, setCanExport] = useState(false);

  const getFileTypeAndName = (key?: string): FileExportParams => {
    const typeMap: Record<string, string> = {
      [ResultType.table]: 'xlsx',
      [ResultType.formula]: 'md',
      [ResultType.handwriting]: 'md',
      [ResultType.image]: 'zip',
      [ResultType.header_footer]: 'md',
      [ResultType.question]: 'md',
      [ResultType.exam_paper]: 'json',
    };
    const filetype = key || typeMap[currentTab] || currentTab;
    const filename: string = current?.name
      ? replaceFileSuffixName(current.name, filetype)
      : getDownloadName(titleName, filetype);
    return {
      filetype,
      filename,
    };
  };

  const exportDocBase64 = async ({ filename }: { filename: string }) => {
    const docBase64 = rawResultJson.doc_base64;
    const blob = base64ToBlob(docBase64);
    downloadFile(blob, filename);
  };

  const exportJson = async ({ filetype, filename }: FileExportParams) => {
    const content = JSON.stringify(rawResultJson);
    const blob = new Blob([content], {
      type: `text/${filetype}`,
    });
    downloadFile(blob, filename);
  };

  const exportMarkdown = async ({ filetype, filename }: FileExportParams) => {
    const content = await getMarkdownContent();
    const blob = new Blob([content], {
      type: `text/${filetype}`,
    });
    downloadFile(blob, filename);
  };

  const exportTable = async ({ filename }: { filename: string }) => {
    const excelBase64 = rawResultJson?.excel_base64;
    if (excelBase64) {
      const blob = base64ToBlob(excelBase64);
      downloadFile(blob, filename);
    } else {
      const confirm = await new Promise((resolve) => {
        Modal.confirm({
          centered: true,
          title: '提示',
          content:
            '当前未启用后端生成Excel功能（get_excel），继续使用前端导出可能会影响效果。是否确认继续？',
          onOk: () => {
            resolve(true);
          },
          onCancel: () => {
            resolve(false);
          },
        });
      });
      if (!confirm) return;
      await exportTableByDom(current.rects, filename);
    }
  };

  const exportFormula = async ({ filetype, filename }: FileExportParams) => {
    const latestCurrentFile = current;
    const rects = showModifiedMarkdown
      ? latestCurrentFile.newRects || latestCurrentFile.new_rects || latestCurrentFile.rects
      : latestCurrentFile.rects;
    let content = '';
    if (rects) {
      for (const page of rects) {
        for (const item of page || []) {
          content += (item.text || '') + '\n';
        }
      }
    }
    if (!content) {
      message.warning('没有内容可导出');
      return;
    }
    const blob = new Blob([content], {
      type: `text/${filetype}`,
    });
    downloadFile(blob, filename);
  };

  const exportImages = async ({ filename }: { filename: string }) => {
    const currentRects = current?.rects;
    const urls: string[] = [];
    if (Array.isArray(currentRects)) {
      for (const page of currentRects) {
        if (Array.isArray(page)) {
          for (const line of page) {
            if (line.image_url) {
              urls.push(line.image_url);
            }
          }
        }
      }
    }
    const zip = new JSZip();
    const imgFolder = zip.folder('images');
    const queue = new PQueue({ concurrency: 5 });
    for (let index = 0; index < urls.length; index += 1) {
      queue.add(async () => {
        try {
          const imgBlob = await requestWidthCache.get(urls[index], {
            responseType: 'blob',
            prefix: '',
          });
          imgFolder?.file(`${filename.replace(/\.[a-z]+$/i, '')}_image_${index + 1}.png`, imgBlob);
        } catch (error) {
          console.log('img download error', error);
        }
      });
    }

    if (!urls.length) {
      message.warning('没有内容可导出');
      return;
    }

    await new Promise((resolve) => {
      queue.on('idle', async () => {
        const blob = await zip.generateAsync({ type: 'blob' });
        saveAs(blob, filename);
        resolve(true);
      });
    });
  };

  const exportText = async ({ filetype, filename }: FileExportParams) => {
    const text = rawResultJson.markdown;
    if (!text.length) {
      message.warning('没有内容可导出');
      return;
    }
    const blob = new Blob([text], {
      type: `text/${filetype}`,
    });
    downloadFile(blob, filename);
  };

  const exportExamPaper = async ({ filetype, filename }: FileExportParams) => {
    const examData = formatExamPaper(rawResultJson);
    if (!examData) {
      message.warning('没有试卷数据可导出');
      return;
    }
    const content = JSON.stringify(examData, null, 2);
    const blob = new Blob([content], {
      type: `application/${filetype}`,
    });
    downloadFile(blob, filename);
  };

  const resultExport = async (key?: string) => {
    const { filetype, filename } = getFileTypeAndName(key);
    if (key === ResultType.doc_base64) {
      await exportDocBase64({ filename });
    } else if (currentTab === ResultType.json) {
      await exportJson({ filetype, filename });
    } else if (currentTab === ResultType.md) {
      await exportMarkdown({ filetype, filename });
    } else if (currentTab === ResultType.table) {
      await exportTable({ filename });
    } else if (currentTab === ResultType.formula) {
      await exportFormula({ filetype, filename });
    } else if (currentTab === ResultType.image) {
      await exportImages({ filename });
    } else if (currentTab === ResultType.exam_paper) {
      await exportExamPaper({ filetype, filename });
    } else {
      await exportText({ filetype, filename });
    }
  };

  /**
   * 复制识别结果
   */
  const resultCopy = async () => {
    setCopyLoading(true);
    try {
      if (currentTab === ResultType.json) {
        const isTooLarge = rawResultJson.total_count >= 40;
        if (isTooLarge) {
          message.info('数据过多，无法复制，正在为您导出');
        }
        if (isTooLarge) {
          await resultExport();
        } else {
          copy(JSON.stringify(rawResultJson));
          message.success('复制成功', 1);
        }
      } else {
        copy(await getMarkdownContent());
        message.success('复制成功', 1);
      }
    } catch (error) {
      message.error('复制失败', 1);
      console.error('复制失败', error);
    }
    setCopyLoading(false);
  };

  useEffect(() => {
    // 只要多选列表，即可导出
    if (currentChoosenList.length && [ResultType.md, ResultType.json].includes(currentTab)) {
      // 选中文件大于1，则可以批量导出
      setCanExport(false);
      setCanBatchExport(true);
    } else if ([ResultType.md].includes(currentTab)) {
      setCanBatchExport(false);
      setCanExport(!!resultJson);
    } else if ([ResultType.json].includes(currentTab)) {
      setCanBatchExport(false);
      setCanExport(!!resultJson);
    } else if ([ResultType.image].includes(currentTab)) {
      setCanExport(
        Array.isArray(current?.rects) &&
          current.rects.some(
            (page) =>
              !!page?.filter(
                (i: any) => !['catalog'].includes(i.type) && (i.base64str || i.image_url),
              )?.length,
          ),
      );
      setCanBatchExport(false);
    } else {
      setCanExport(
        Array.isArray(current?.rects) &&
          current.rects.some(
            (page) => !!page?.filter((i: any) => !['catalog'].includes(i.type))?.length,
          ),
      );
      setCanBatchExport(false);
    }
  }, [current, resultJson, currentChoosenList, currentTab]);

  const onExportWord = async () => {
    setWordLoading(true);
    await resultExport(ResultType.doc_base64);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setWordLoading(false);
  };

  const showEdit = useMemo(() => {
    const { type } = getFileNameAndType(currentFile?.name || '');
    const isExcel = ['xlsx', 'xls'].includes(type);
    if (isExcel) {
      return false;
    }
    return true;
  }, [currentFile]);

  const editable = useMemo(() => {
    if (resultType !== ResultType.md) {
      return false;
    }
    if (resultJson?.detail && !resultJson.detail_new) {
      return true;
    }
    if (resultJson?.detail_new && showModifiedMarkdown) {
      return true;
    }
    return false;
  }, [resultJson, resultType, showModifiedMarkdown]);
  const [switchEditing, setSwitchEditing] = useState(false);
  const handleEdit = async () => {
    try {
      setSwitchEditing(true);
      setMarkdownMode?.('edit');
    } catch (error) {
      console.error(error);
    } finally {
      setSwitchEditing(false);
    }
  };

  return {
    canBatchExport,
    canExport,
    resultExportType,
    resultCopy,
    resultExport,
    saveMarkdown,
    saveLoading,
    wordLoading,
    copyLoading,
    onExportWord,
    switchEditing,
    showEdit,
    editable,
    handleEdit,
  };
}

export default useResultOperations;

async function exportTableByDom(data: IRectItem[][], filename: string) {
  const tableHtmls = flatten(data)
    .map((line) => {
      const text = line.text;
      const isTable = line.type === 'table';
      const isMarkdown = text && line.content !== 1 && !/^<[a-z]+/.test(text);
      if (isTable) {
        return isMarkdown ? md2html(text, { keepRawHtml: true }) : mdRender(encodeMath(text));
      }
      return '';
    })
    .filter(Boolean);

  if (isEmpty(tableHtmls)) {
    message.warning('没有内容可导出');
    return;
  }

  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const tableStr of tableHtmls) {
    const div = document.createElement('div');
    div.innerHTML = tableStr;
    const table = div.querySelector('table');
    if (!table) return;
    const ws = XLSX.utils.table_to_sheet(table, { raw: true });
    XLSX.utils.book_append_sheet(wb, ws);
  }
  const wb_out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([wb_out], { type: 'application/octet-stream' }), filename);
}
