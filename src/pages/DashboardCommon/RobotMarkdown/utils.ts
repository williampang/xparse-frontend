import lodash from 'lodash';
import { ResultType } from './containers/RightView/RightView';
import type {
  IExamPaperData,
  IExamPaperSection,
  IExamPaperQuestion,
  IExamPaperOption,
} from './data.d';
import { QuestionTypeDesc, QuestionCategoryDesc } from './data.d';

export interface IRectItem {
  [key: string]: any;
  type?: string;
  sub_type?: string;
  position: number[];
  text: string;
  content_id: number | string;
  image_url?: string;
  outline_level?: number;
  angle?: number;
  render_text?: string;
  cells?: { cells: any[]; [key: string]: any };
  custom_edit_continue?: boolean; // 编辑产生的字段, 区分引擎返回的continue
  custom_edit_continue_content_ids?: number[]; // 编辑产生的字段,
  page_id?: number;
}

export const formatResult = (
  res: any,
  dataType?: ResultType,
  options?: Record<string, any>,
): IRectItem[][] | undefined => {
  // 优化 metrics 对象创建
  const metrics: Record<string, any> = {};
  if (Array.isArray(res.metrics)) {
    for (let i = 0; i < res.metrics.length; i++) {
      const cur = res.metrics[i];
      metrics[cur.page_id] = cur;
    }
  }

  // 处理 handwriting/formula 类型
  if (dataType && [ResultType.handwriting, ResultType.formula].includes(dataType)) {
    if (!Array.isArray(res.pages)) return undefined;

    let isFromZero = false;
    const pageRects: any[][] = [];

    for (let idx = 0; idx < res.pages.length; idx++) {
      const cur = res.pages[idx];

      if (cur.page_id === 0) {
        isFromZero = true;
      }

      const page_num = isFromZero ? cur.page_id : cur.page_id - 1;
      if (!pageRects[page_num]) {
        pageRects[page_num] = [];
      }

      if (Array.isArray(cur.content)) {
        for (let i = 0; i < cur.content.length; i++) {
          const line = cur.content[i];

          if (
            (line.sub_type === 'handwriting' && dataType === ResultType.handwriting) ||
            (line.sub_type === 'formula' && dataType === ResultType.formula)
          ) {
            const row: Record<string, any> = {
              text: line.text,
              position: line.pos,
              type: dataType,
              page_id: cur.page_id,
            };

            if (metrics[cur.page_id] && options?.angle !== false) {
              row.angle = metrics[cur.page_id].angle;
            }

            // 避免使用展开运算符
            row.content_id = `${idx}_${line.id}`;
            pageRects[page_num].push(row);
          }
        }
      }
    }

    return pageRects;
  }
  // 处理 question 类型
  else if (ResultType.question === dataType) {
    if (!Array.isArray(res.questions)) return undefined;

    let isFromZero = false;
    let pre_index = 0;
    let cur_page = 0;
    let image_num = 1;
    let table_num = 1;
    const pageRects: any[][] = [];

    for (let idx = 0; idx < res.questions.length; idx++) {
      const cur = res.questions[idx];

      if (!cur.hasOwnProperty('page_id')) {
        if (pre_index >= cur.index) {
          cur_page += 1;
        }
        pre_index = cur.index;
        cur.page_id = cur_page;
      }

      if (cur.page_id === 0) {
        isFromZero = true;
      }

      const page_num = isFromZero ? cur.page_id : cur.page_id - 1;
      if (!pageRects[page_num]) {
        pageRects[page_num] = [];
      }

      // 选择题，显示整体框
      if (cur.type === 0 && cur.pos_list?.length && Array.isArray(cur.pos_list[0])) {
        pageRects[page_num].push({
          content_id: `${idx}_${cur.index}_border`,
          position: cur.pos_list[0],
          type: 'question_border',
          question_type: cur.type,
          question_index: idx,
        });
      }

      // 处理 element_list
      if (cur.element_list) {
        for (let index = 0; index < cur.element_list.length; index++) {
          const line = cur.element_list[index];
          const row = {
            text: line.text,
            position: Array.isArray(line.pos_list?.[0]) ? line.pos_list[0] : [],
            type: 'question_' + (line.type === 0 || line.type === 'stem' ? 'stem' : 'content'),
            question_type: cur.type,
            question_category: line.type,
            question_index: idx,
            content_id: `${idx}_${cur.index}_${index}`,
            page_id: cur.page_id,
          };

          pageRects[page_num].push(row);
        }
      }

      // 处理 image_list
      if (cur.image_list) {
        for (let index = 0; index < cur.image_list.length; index++) {
          const row = {
            text: `图${image_num}`,
            position: Array.isArray(cur.image_list[index]) ? cur.image_list[index] : [],
            type: 'question_image',
            rect_type: 'image',
            question_type: cur.type,
            question_category: '题图',
            question_index: idx,
            _from_split: index > 0,
            content_id: `${idx}_${cur.index}_${index}_img`,
            page_id: cur.page_id,
          };

          image_num += 1;
          pageRects[page_num].push(row);
        }
      }

      // 处理 table_list
      if (cur.table_list) {
        for (let index = 0; index < cur.table_list.length; index++) {
          const row = {
            text: `表${table_num}`,
            position: Array.isArray(cur.table_list[index]) ? cur.table_list[index] : [],
            type: 'question_table',
            rect_type: 'table',
            question_type: cur.type,
            question_category: '表格',
            question_index: idx,
            _from_split: index > 0,
            content_id: `${idx}_${cur.index}_${index}_table`,
            page_id: cur.page_id,
          };

          table_num += 1;
          pageRects[page_num].push(row);
        }
      }
    }

    return pageRects;
  }

  // 处理表格数据
  let tablesFromPages: Record<string, any> = {};
  if (
    dataType &&
    [ResultType.md, ResultType.table, ResultType.json].includes(dataType) &&
    Array.isArray(res.pages)
  ) {
    tablesFromPages = {};

    for (let i = 0; i < res.pages.length; i++) {
      const cur = res.pages[i];
      const pageId = cur.page_id;

      if (!tablesFromPages[pageId]) {
        tablesFromPages[pageId] = [];
      }

      if (Array.isArray(cur.structured)) {
        for (let j = 0; j < cur.structured.length; j++) {
          const row = cur.structured[j];

          if (row.type === 'table') {
            let col_index = 0;
            let pre_row = 0;
            const cells: any[] = [];

            for (let k = 0; k < row.cells.length; k++) {
              const item = row.cells[k];

              if (item.col === 0 || item.row !== pre_row) {
                col_index = 0;
              }

              pre_row = item.row;

              const cell: any = {};

              // 1. 复制所有原始属性（排除 pos）
              for (const key in item) {
                if (key !== 'pos' && Object.prototype.hasOwnProperty.call(item, key)) {
                  cell[key] = item[key];
                }
              }

              // 2. 设置需要覆盖的字段（后执行的赋值优先级更高）
              cell.col_index = col_index;
              cell.row_index = item.row;
              cell.position = item.pos;
              cell.cell_id = setCellId(cell);

              col_index += 1;
              cells.push(cell);
            }

            const tableRow: any = {
              page_id: cur.page_id,
              cells,
            };

            // 复制其他属性（保持与第一段代码一致）
            Object.keys(row).forEach((key) => {
              if (key !== 'cells' && !tableRow.hasOwnProperty(key)) {
                tableRow[key] = row[key];
              }
            });

            tablesFromPages[pageId].push(tableRow);
          }
        }
      }
    }
  }

  // 处理 detail 数据
  if (Array.isArray(res.detail)) {
    let isFromZero = false;
    const splitMap: Record<string, any> = {};
    const pageParagraphContentMap: Record<string, any> = {};
    const pageRects: any[][] = [];

    for (let idx = 0; idx < res.detail.length; idx++) {
      const cur = res.detail[idx];

      if (cur.page_id === 0) {
        isFromZero = true;
      }

      const page_num = isFromZero ? cur.page_id : cur.page_id - 1;

      if (!pageRects[page_num]) {
        pageRects[page_num] = [];
      }

      // 类型过滤
      if (dataType) {
        if (dataType === 'table' && cur.type !== 'table') continue;
        if (dataType === 'image' && cur.type !== 'image') continue;
        if (dataType === ResultType.header_footer && cur.content !== 1) continue;
      }

      // 创建 row 对象，避免使用 lodash.pick
      const row: IRectItem = {
        content_id: idx,
        position: cur.position,
        text: cur.text,
        page_id: cur.page_id,
      };

      // 复制必要属性
      const pickFields = [
        'type',
        'sub_type',
        'image_url',
        'base64str',
        'outline_level',
        'split_section_page_ids',
        'split_section_positions',
        'custom_edit_continue',
        'custom_edit_continue_content_ids',
      ];

      for (let i = 0; i < pickFields.length; i++) {
        const field = pickFields[i];
        if (cur[field] !== undefined) {
          row[field] = cur[field];
        }
      }

      // 设置特殊属性
      if (cur.content === 1) {
        row.rect_type = ResultType.header_footer;
        row.content = cur.content;
      } else if (cur.sub_type && cur.sub_type === 'catalog') {
        // 保持原注释
      } else if (cur.sub_type && cur.sub_type === 'stamp') {
        // 保持原注释
      } else if (cur.outline_level !== -1) {
        row.rect_type = 'title';
      }

      // 添加角度信息
      if (metrics[cur.page_id] && options?.angle !== false) {
        row.angle = metrics[cur.page_id].angle;
      }

      if (row.custom_edit_continue) {
        continue;
      }

      // 处理表格单元格
      if (cur.type === 'table' && cur.cells && tablesFromPages[cur.page_id]) {
        let cellItem = null;
        const tables = tablesFromPages[cur.page_id];

        for (let i = 0; i < tables.length; i++) {
          if (tables[i].id === cur.paragraph_id) {
            cellItem = tables[i];
            break;
          }
        }

        if (cellItem) {
          row.cells = cellItem;

          if (cur.split_section_positions) {
            // 使用 Set 优化去重
            const pageSet = new Set<any>(cur.split_section_page_ids);
            const allPages: any[] = [];

            for (const page of pageSet) {
              if (tablesFromPages[page]) {
                for (let i = 0; i < tablesFromPages[page].length; i++) {
                  allPages.push(tablesFromPages[page][i]);
                }
              }
            }

            let tableIndex = -1;
            for (let i = 0; i < allPages.length; i++) {
              if (allPages[i].id === cur.paragraph_id) {
                tableIndex = i;
                break;
              }
            }

            if (tableIndex > -1) {
              row.split_cells = allPages.slice(
                tableIndex,
                tableIndex + cur.split_section_positions.length,
              );
            }
          }
        }
      }

      // 处理分页数据
      if (cur.split_section_page_ids && cur.split_section_positions) {
        const rectPosition = String(cur.position);
        let table_rows = 0;
        let skipRow = 0; // 每行需要忽略的行(跨页合并去除了重复的表头)
        if (cur.cells && row.split_cells) {
          const lastCell = cur.cells[cur.cells.length - 1];
          const validRows = lastCell.row + lastCell.row_span;
          const totalRows = row.split_cells?.reduce((pre: number, t: any) => pre + t.rows, 0);
          if (totalRows !== validRows) {
            skipRow = Math.round((totalRows - validRows) / (cur.split_section_page_ids.length - 1));
          }
        }

        const isLastItem = idx === res.detail.length - 1;

        for (let i = 0; i < cur.split_section_page_ids.length; i++) {
          const splitPage = cur.split_section_page_ids[i];

          if (isLastItem && !pageRects[splitPage]) {
            pageRects[splitPage] = [];
          }

          let next_section;
          if (cur.split_section_page_ids[i + 1]) {
            next_section = {
              next_page: cur.split_section_page_ids[i + 1] - splitPage,
              position: cur.split_section_positions[i + 1],
            };

            if (next_section && row.split_cells?.[i + 1]) {
              const { cells } = row.split_cells[i + 1];
              next_section.position[0] = cells[0].position[0];
              next_section.position[1] = cells[0].position[1];

              for (let j = 0; j < cells.length; j++) {
                const cell = cells[j];
                if (cell.row === cells[0].row) {
                  next_section.position[2] = cell.position[2];
                  next_section.position[3] = cell.position[3];
                } else {
                  break;
                }
              }
            }
          }

          if (i === 0) {
            row.next_section = next_section;
          }

          if (!(splitPage === cur.page_id && i === 0)) {
            if (!splitMap[splitPage]) {
              splitMap[splitPage] = [];
            }

            const newPosition = cur.split_section_positions[i] || [];

            // 创建 newRow，避免使用 lodash.omit
            const newRow: Record<string, any> = {
              position: newPosition,
              points: newPosition,
              next_section,
              _from_split: true,
            };

            // 复制 row 的属性，排除特定字段
            for (const key in row) {
              if (
                !['position', 'points', 'next_section', '_from_split'].includes(key) &&
                Object.prototype.hasOwnProperty.call(row, key)
              ) {
                newRow[key] = row[key];
              }
            }

            if (row.split_cells && row.split_cells[i]) {
              newRow.cells = row.split_cells[i];

              if (i > 0 && newRow.cells.cells) {
                table_rows -= skipRow;
                const cells = newRow.cells.cells;

                for (let j = 0; j < cells.length; j++) {
                  const cell = cells[j];
                  const origin_row = cell.row;
                  const plusRow = cell.row + table_rows;
                  cell.row_index = plusRow;
                  cell.row = plusRow;
                  cell.cell_id = setCellId(cell); // 合并表格，重新设置cell_id
                  if (skipRow && origin_row < skipRow) {
                    cell.cell_id += `_skip_row_${origin_row}`;
                  }
                }
              }
            }

            splitMap[splitPage].push(newRow);
          }

          table_rows += row.split_cells ? row.split_cells[i]?.rows || 0 : 0;
        }
      }

      pageRects[page_num].push(row);

      // 处理公式和手写坐标框
      if (
        ![ResultType.question].includes(dataType as any) &&
        ((Array.isArray(cur.tags) &&
          cur.tags.some((t: string) => ['formula', 'handwritten'].includes(t))) ||
          cur.type === 'table') &&
        Array.isArray(res.pages)
      ) {
        if (!pageParagraphContentMap[page_num] && res.pages[page_num]) {
          // 创建 contentIdMap
          const contentIdMap: Record<string, any> = {};
          const pageContent = res.pages[page_num].content;

          for (let i = 0; i < pageContent.length; i++) {
            const cur = pageContent[i];
            if (['formula', 'handwriting'].includes(cur.sub_type)) {
              contentIdMap[cur.id] = { position: cur.pos, type: cur.sub_type };
            }
          }

          // 创建 pageParagraphContentMap
          pageParagraphContentMap[page_num] = {};
          const pageStructured = res.pages[page_num].structured;

          for (let i = 0; i < pageStructured.length; i++) {
            const cur = pageStructured[i];

            if (cur.content) {
              const content: any[]  = [];
              for (let j = 0; j < cur.content.length; j++) {
                content.push(contentIdMap[cur.content[j]]);
              }
              pageParagraphContentMap[page_num][cur.id] = { content };
            } else if (cur.type === 'table' && cur.cells) {
              const content: any[] = [];

              try {
                // 优化嵌套 reduce
                for (let j = 0; j < cur.cells.length; j++) {
                  const cell: any = cur.cells[j];

                  for (let k = 0; k < cell.content.length; k++) {
                    const ct = cell.content[k];

                    for (let l = 0; l < ct.content.length; l++) {
                      const i = ct.content[l];
                      if (contentIdMap[i]) {
                        content.push(Object.assign(contentIdMap[i], { content_id: cell.cell_id }));
                      }
                    }
                  }
                }
              } catch (error) {
                console.error('pageParagraphContentMap error', error);
              }

              pageParagraphContentMap[page_num][cur.id] = { content };
            }
          }
        }

        const paragraphContents = pageParagraphContentMap[page_num]?.[cur.paragraph_id]?.content;

        if (Array.isArray(paragraphContents) && paragraphContents.length) {
          const contents: IRectItem[] = [];
          let contentType = paragraphContents[0]?.type;

          for (let i = 0; i < paragraphContents.length; i++) {
            const item = paragraphContents[i];

            if (item?.type !== contentType) {
              contentType = 'multiple';
            }

            if (item) {
              contents.push({
                content_id: item.content_id || row.content_id,
                angle: row.angle,
                text: item.text,
                type: item.type,
                position: item.position,
                _from_split: true,
                page_id: cur.page_id,
              });
            }
          }

          if (contentType && contentType !== 'multiple') {
            if (row.type !== 'table') {
              // 保护表格类型不被覆盖
              row.type = contentType;
            }
            // row.type = contentType;
          } else {
            for (let i = 0; i < contents.length; i++) {
              pageRects[page_num].push(contents[i]);
            }
          }
        }
      }
    }

    // 合并分页数据
    for (let index = 0; index < pageRects.length; index++) {
      if (!Array.isArray(pageRects[index])) {
        pageRects[index] = [];
      }

      if (splitMap[index + 1]) {
        const splitItems = splitMap[index + 1];
        pageRects[index].unshift(...splitItems);
      }
    }

    // 处理目录
    if (res.catalog?.generate && Array.isArray(res.catalog.generate)) {
      const catalog = res.catalog.generate;

      for (let index = 0; index < catalog.length; index++) {
        const item = catalog[index];
        const dataIndex = item.pageNum;

        if (typeof item.pageNum === 'number' && Array.isArray(pageRects[dataIndex])) {
          pageRects[dataIndex].push({
            type: 'catalog',
            position: item.pos,
            content_id: 'catalog' + index,
            page_id: dataIndex + 1,
          });
        }
      }
    } else if (res.catalog?.toc && Array.isArray(res.catalog.toc)) {
      const catalog: any[] = [];

      // 优化 filter
      for (let i = 0; i < res.catalog.toc.length; i++) {
        const item: any = res.catalog.toc[i];
        if (!['image_title', 'table_title'].includes(item.sub_type)) {
          catalog.push(item);
        }
      }

      for (let index = 0; index < catalog.length; index++) {
        const item: any = catalog[index];
        const dataIndex = item.page_id - 1;

        if (typeof item.page_id === 'number' && Array.isArray(pageRects[dataIndex])) {
          pageRects[dataIndex].push({
            type: 'catalog',
            position: item.pos || item.position,
            content_id: 'catalog' + index,
            page_id: item.page_id,
          });
        }
      }
    }

    return pageRects.length ? pageRects : [];
  }

  return undefined;
};

export interface IQuestionRenderItem {
  data: IRectItem[];
  question_type: number;
  question_index: number;
  images: IRectItem[];
  tables: IRectItem[];
  border?: IRectItem[];
}

export const getQuestionsRenderList = (page: IRectItem[]) => {
  return page.reduce((pre: IQuestionRenderItem[], line: IRectItem) => {
    if (!pre[line.question_index]) {
      pre[line.question_index] = {
        data: [],
        question_type: line.question_type,
        question_index: line.question_index,
        images: [],
        tables: [],
      };
    }
    const { images, tables, data } = pre[line.question_index];
    if (line.type === 'question_image') {
      images.push(line);
    } else if (line.type === 'question_table') {
      tables.push(line);
    } else if (line.type === 'question_border') {
      Object.assign(pre[line.question_index], { border: line });
    } else {
      data.push(line);
    }
    return pre;
  }, []);
};

export const jsonToMarkdown = (json: IRectItem[]) => {
  let markdown = '';
  json.forEach((item) => {
    if (!item) {
      return;
    }
    const text = item.text || '';
    if (item.type === 'image') {
      markdown += `![${text}](${item.image_url})\n\n`;
    } else if (item.type === 'table') {
      markdown += `${text || ''}\n\n`;
    } else if (item.type === 'formula') {
      markdown += `$${text}$`;
    } else if (item.type === 'paragraph' && (item.outline_level || 0) >= 0) {
      markdown += `${'#'.repeat((item.outline_level || 0) + 1)} ${text}\n\n`;
    } else if (['catalog'].includes(item.type as string) || item.content === 1) {
      // markdown中不包含目录，非正文内容
    } else {
      markdown += `${text}\n\n`;
    }
  });
  return markdown;
};

export function splitMarkdownHeader(markdown: string) {
  // 使用正则表达式匹配 Markdown 标题，允许标题中包含换行
  const headerRegex = /^(#+)\s*([\s\S]+?)$/;
  const match = markdown.match(headerRegex);

  if (match) {
    const hashes = match[1]; // 获取#号部分
    const text = match[2]; // 获取标题文字部分
    return { hashes, text };
  } else {
    return null; // 如果不是有效的Markdown标题，返回null
  }
}

export function isMarkdownHeader(markdown: string) {
  // 定义正则表达式来匹配 Markdown 标题，允许标题中包含换行
  const headerRegex = /^#+\s+[\s\S]+/;
  return headerRegex.test(markdown);
}

// export function splitMarkdownHeader(markdown: string) {
//   // 使用正则表达式匹配 Markdown 标题
//   const str = markdown.replace(/\n/g, '');
//   const headerRegex = /^(#+)\s*(.+)$/;
//   const match = str.match(headerRegex);

//   if (match) {
//     const hashes = match[1]; // 获取#号部分
//     const text = match[2]; // 获取标题文字部分
//     return { hashes, text };
//   } else {
//     return null; // 如果不是有效的Markdown标题，返回null
//   }
// }

// export function isMarkdownHeader(markdown: string) {
//   // 定义正则表达式来匹配 Markdown 标题
//   const headerRegex = /^#+\s+.+/;
//   return headerRegex.test(markdown);
// }

export const setCellId = (cell: any) => {
  return `${cell.row_index}_${cell.col_index}_cell_${cell.row}_${cell.row_span}_cell_${cell.col}_${cell.col_span}`;
};

export const removeFormula$ = (text: string) => text.replace(/^\$/, '').replace(/\$$/, '');

/**
 * 将 JSON 结果格式化为试卷结构
 * 支持两种数据源：
 * 1. res.questions 数组（切题接口返回）
 * 2. res.detail 数组（文档解析接口返回，通过文本模式识别试卷结构）
 */
export const formatExamPaper = (res: any): IExamPaperData | null => {
  if (!res) return null;

  // 优先使用 questions 数据
  if (Array.isArray(res.questions) && res.questions.length > 0) {
    return formatExamPaperFromQuestions(res);
  }

  // 其次从 detail 中解析试卷结构
  const detail = res.detail_new || res.detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return formatExamPaperFromDetail(res, detail);
  }

  // 最后尝试从 markdown 解析
  if (res.markdown) {
    return formatExamPaperFromMarkdown(res);
  }

  return null;
};

/**
 * 从 questions 数组生成试卷结构
 */
const formatExamPaperFromQuestions = (res: any): IExamPaperData => {
  const questions = res.questions;
  const sections: IExamPaperSection[] = [];
  let currentSection: IExamPaperSection | null = null;
  let questionCount = 0;

  let title = '';
  let subtitle = '';
  const detail = res.detail_new || res.detail;
  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (typeof item.outline_level === 'number' && item.outline_level >= 0 && item.text) {
        if (!title) title = item.text;
        else if (!subtitle) { subtitle = item.text; break; }
      }
    }
  }

  for (let idx = 0; idx < questions.length; idx++) {
    const cur = questions[idx];
    const questionType = cur.type;
    const typeDesc = QuestionTypeDesc[questionType] || `题型${questionType}`;

    if (!currentSection || currentSection.questionType !== questionType) {
      const sectionIndex = sections.length + 1;
      currentSection = {
        name: `${numberToChinese(sectionIndex)}、${typeDesc}`,
        questionType,
        questionTypeDesc: typeDesc,
        questions: [],
      };
      sections.push(currentSection);
    }

    const question = parseQuestion(cur, idx);
    currentSection.questions.push(question);
    questionCount++;
  }

  return { title, subtitle, sections, questionCount };
};

// 题号正则：匹配 "1." "2、" "16．" 以及带前缀的 "（双选）16．" "(多选)3." 等格式
const QUESTION_INDEX_REGEX = /^\s*(?:[（(][^）)\d]{1,8}[）)])?(\d{1,3})\s*[.、．)\]]/;
// 大题标题正则：匹配 "一、选择题" "二、填空题（每空2分）" 等
const SECTION_TITLE_REGEX = /^\s*([一二三四五六七八九十]{1,3})\s*[.、．)\]]\s*(.+)/;
// 选项正则：匹配 "A." "B、" "C．" "D)" 等
const OPTION_REGEX = /^\s*([A-Za-z])\s*[.、．)\]]\s*(.*)/;
// 选择题大题标题关键词：匹配 "选择题" "单选题" "多选题"，排除 "非选择题"
const CHOICE_SECTION_REGEX = /(?<!\u975e)选择题|单选题|多选题/;

/**
 * 从 detail 数组解析试卷结构
 * 匹配优先级：题号 > 选项 > 答案/解析 > 大题标题 > outline_level 标题 > 普通文本
 */
const formatExamPaperFromDetail = (res: any, detail: any[]): IExamPaperData | null => {
  let title = '';
  let subtitle = '';
  const sections: IExamPaperSection[] = [];
  let currentSection: IExamPaperSection | null = null;
  let currentQuestion: IExamPaperQuestion | null = null;
  let questionCount = 0;
  let lastQuestionIndex = 0; // 当前大题内上一题的题号，用于启发式判断
  let isChoiceSection = false; // 当前大题是否为选择题板块

  for (let idx = 0; idx < detail.length; idx++) {
    const item = detail[idx];
    const text = (item.text || '').trim();
    const outlineLevel = item.outline_level;
    const itemType = item.type;

    // 跳过非正文内容（页眉页脚等）
    if (item.content === 1) continue;

    // 处理图片类型 —— 将图片嵌入题干，保持原始位置
    if (itemType === 'image') {
      if (currentQuestion) {
        const imgSrc = item.base64str
          ? `data:image/jpg;base64,${item.base64str}`
          : item.image_url || '';
        if (imgSrc) {
          currentQuestion.stem += (currentQuestion.stem ? '\n' : '') + `<img src="${imgSrc}" style="max-width:100%;max-height:200px" />`;
        }
        currentQuestion.contentIds.push(idx);
      }
      continue;
    }

    // 处理表格类型 —— 将表格 HTML 嵌入题干，保持原始位置
    // 使用双换行分隔，确保 react-markdown 将 <table> 识别为块级 HTML 元素
    if (itemType === 'table') {
      if (currentQuestion) {
        const tableHtml = item.text || '';
        if (tableHtml) {
          currentQuestion.stem += (currentQuestion.stem ? '\n\n' : '') + tableHtml + '\n\n';
        }
        currentQuestion.contentIds.push(idx);
      }
      continue;
    }

    if (!text) continue;

    // 1. 检测大题标题（如 "一、选择题" "二．填空题"）—— 中文数字开头，优先于题号判断
    const sectionMatch = text.match(SECTION_TITLE_REGEX);
    if (sectionMatch) {
      currentSection = {
        name: text,
        questionType: 'section',
        questionTypeDesc: sectionMatch[2],
        questions: [],
        contentId: idx,
      };
      sections.push(currentSection);
      currentQuestion = null;
      lastQuestionIndex = 0;
      isChoiceSection = CHOICE_SECTION_REGEX.test(text);
      continue;
    }

    // 2. 检测新题目开始（如 "1．" "2." "19.(6分）"）
    const questionMatch = text.match(QUESTION_INDEX_REGEX);
    if (questionMatch) {
      const qIndex = parseInt(questionMatch[1], 10);

      // 启发式：如果题号不比上一题大，可能是题干续文（如 "边长均为1．点A..."）
      const isContinuation = currentQuestion && qIndex <= lastQuestionIndex;

      if (!isContinuation) {
        // 如果没有大题分组，创建默认大题
        if (!currentSection) {
          currentSection = {
            name: '试题',
            questionType: 'default',
            questionTypeDesc: '试题',
            questions: [],
          };
          sections.push(currentSection);
        }

        questionCount++;
        lastQuestionIndex = qIndex;
        const stemText = text.replace(QUESTION_INDEX_REGEX, '').trim();

        currentQuestion = {
          index: qIndex,
          type: isChoiceSection ? 'choice' : 'unknown',
          typeDesc: isChoiceSection ? '选择题' : '',
          stem: stemText,
          options: [],
          answer: '',
          analysis: '',
          images: [],
          tables: [],
          subQuestions: [],
          element_list: [],
          contentIds: [idx],
        };
        currentSection.questions.push(currentQuestion);
        continue;
      }
      // 是续文，落入下方普通文本处理
    }

    // 3. 检测选项（如 "A." "B、" "C．"）
    const optionMatch = text.match(OPTION_REGEX);
    if (optionMatch && currentQuestion) {
      currentQuestion.contentIds.push(idx);
      if (isChoiceSection) {
        // 选择题板块：提取选项，不嵌入题干
        currentQuestion.options.push({ label: optionMatch[1], text: optionMatch[2] });
      } else {
        // 综合题/非选择题板块：选项保留在题干中
        currentQuestion.stem += (currentQuestion.stem ? '\n' : '') + text;
      }
      continue;
    }

    // 4. 检测答案
    if (/^\s*[【\[]?答案[】\]]?\s*[:：]?/.test(text) && currentQuestion) {
      currentQuestion.answer = text.replace(/^\s*[【\[]?答案[】\]]?\s*[:：]?\s*/, '');
      currentQuestion.contentIds.push(idx);
      continue;
    }

    // 5. 检测解析
    if (/^\s*[【\[]?解析[】\]]?\s*[:：]?/.test(text) && currentQuestion) {
      currentQuestion.analysis = text.replace(/^\s*[【\[]?解析[】\]]?\s*[:：]?\s*/, '');
      currentQuestion.contentIds.push(idx);
      continue;
    }

    // 6. 检测标题（outline_level >= 0）—— 放在题号/选项之后，避免误判
    if (typeof outlineLevel === 'number' && outlineLevel >= 0) {
      if (!title && !currentQuestion) {
        title = text;
      } else if (!subtitle && !currentQuestion && outlineLevel <= 1) {
        subtitle = text;
      } else if (!currentQuestion || sections.length === 0) {
        // 还没有题目时，其他标题作为大题名称
        currentSection = {
          name: text,
          questionType: 'section',
          questionTypeDesc: text,
          questions: [],
          contentId: idx,
        };
        sections.push(currentSection);
        currentQuestion = null;
        lastQuestionIndex = 0;
        isChoiceSection = CHOICE_SECTION_REGEX.test(text);
      } else {
        // 已有题目上下文，归入题干
        currentQuestion.stem += (currentQuestion.stem ? '\n' : '') + text;
        currentQuestion.contentIds.push(idx);
      }
      continue;
    }

    // 7. 普通文本归入当前题目的题干
    if (currentQuestion) {
      currentQuestion.stem += (currentQuestion.stem ? '\n' : '') + text;
      currentQuestion.contentIds.push(idx);
    } else if (!currentSection) {
      // 还没有任何题目，可能是试卷说明文字
      if (!title) {
        title = text;
      } else if (!subtitle) {
        subtitle = text;
      }
    }
  }

  if (sections.length === 0 && questionCount === 0) {
    return null;
  }

  return { title, subtitle, sections, questionCount };
};

/**
 * 从 markdown 文本解析试卷结构
 */
const formatExamPaperFromMarkdown = (res: any): IExamPaperData | null => {
  const markdown: string = res.markdown;
  if (!markdown) return null;

  const lines = markdown.split('\n');
  const detailLike: any[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 解析 markdown 标题
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      detailLike.push({
        text: headerMatch[2],
        outline_level: headerMatch[1].length - 1,
        type: 'paragraph',
      });
    } else if (trimmed.startsWith('![')) {
      // 图片
      const imgMatch = trimmed.match(/!\[.*?\]\((.*?)\)/);
      detailLike.push({
        text: '',
        type: 'image',
        image_url: imgMatch?.[1] || '',
      });
    } else {
      detailLike.push({
        text: trimmed,
        type: 'paragraph',
        outline_level: -1,
      });
    }
  }

  if (detailLike.length === 0) return null;
  return formatExamPaperFromDetail(res, detailLike);
};

/**
 * 解析单个题目
 */
const parseQuestion = (cur: any, idx: number): IExamPaperQuestion => {
  const questionType = cur.type;
  const typeDesc = QuestionTypeDesc[questionType] || `题型${questionType}`;
  let stem = '';
  let answer = '';
  let analysis = '';
  const options: IExamPaperOption[] = [];
  const images: string[] = [];
  const tables: any[] = [];
  const subQuestions: IExamPaperQuestion[] = [];

  // 处理 element_list
  if (Array.isArray(cur.element_list)) {
    for (const element of cur.element_list) {
      const category = element.type;
      const text = element.text || '';

      if (category === 0 || category === 'stem') {
        stem += (stem ? '\n' : '') + text;
      } else if (category === 1 || category === 'option') {
        // 解析选项，如 "A. xxx" 或 "A、xxx"
        const optionMatch = text.match(/^([A-Za-z])\s*[.、．)\]]\s*(.*)/s);
        if (optionMatch) {
          options.push({ label: optionMatch[1], text: optionMatch[2] });
        } else {
          // 没有匹配到标准格式，直接作为一个选项
          options.push({ label: String.fromCharCode(65 + options.length), text });
        }
      } else if (category === 2 || category === 'analysis') {
        analysis += (analysis ? '\n' : '') + text;
      } else if (category === 3 || category === 'answer') {
        answer += (answer ? '\n' : '') + text;
      } else {
        // 其他类型归入题干
        stem += (stem ? '\n' : '') + text;
      }
    }
  }

  // 处理 image_list
  if (Array.isArray(cur.image_list)) {
    for (const img of cur.image_list) {
      if (typeof img === 'string') {
        images.push(img);
      } else if (img?.image_url) {
        images.push(img.image_url);
      } else if (img?.base64) {
        images.push(`data:image/png;base64,${img.base64}`);
      }
    }
  }

  // 处理 table_list
  if (Array.isArray(cur.table_list)) {
    for (const table of cur.table_list) {
      tables.push(table);
    }
  }

  // 处理子题目（阅读理解等）
  if (Array.isArray(cur.sub_questions)) {
    for (let i = 0; i < cur.sub_questions.length; i++) {
      subQuestions.push(parseQuestion(cur.sub_questions[i], i));
    }
  }

  return {
    index: cur.index ?? idx + 1,
    type: questionType,
    typeDesc,
    stem,
    options,
    answer,
    analysis,
    images,
    tables,
    subQuestions,
    element_list: cur.element_list || [],
    contentIds: [],
  };
};

/**
 * 数字转中文序号
 */
const numberToChinese = (num: number): string => {
  const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
  if (num >= 1 && num <= 20) {
    return chineseNumbers[num - 1];
  }
  return String(num);
};
