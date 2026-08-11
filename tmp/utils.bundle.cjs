var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[Object.keys(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __reExport = (target, module2, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && key !== "default")
        __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
  }
  return target;
};
var __toModule = (module2) => {
  return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, "default", module2 && module2.__esModule && "default" in module2 ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
};

// tmp/rightview-stub.cjs
var require_rightview_stub = __commonJS({
  "tmp/rightview-stub.cjs"(exports) {
    exports.ResultType = void 0;
  }
});

// src/pages/DashboardCommon/RobotMarkdown/utils.ts
__export(exports, {
  formatExamPaper: () => formatExamPaper,
  formatResult: () => formatResult,
  getQuestionsRenderList: () => getQuestionsRenderList,
  isMarkdownHeader: () => isMarkdownHeader,
  jsonToMarkdown: () => jsonToMarkdown,
  removeFormula$: () => removeFormula$,
  setCellId: () => setCellId,
  splitMarkdownHeader: () => splitMarkdownHeader
});
var import_RightView = __toModule(require_rightview_stub());

// src/pages/DashboardCommon/RobotMarkdown/data.d.ts
var KeyTypeEnum;
(function(KeyTypeEnum2) {
  KeyTypeEnum2["ITEM_LIST"] = "item_list";
  KeyTypeEnum2["DETAILS"] = "details";
})(KeyTypeEnum || (KeyTypeEnum = {}));
var QuestionTypeDesc = {
  0: "\u9009\u62E9\u9898",
  1: "\u586B\u7A7A\u9898",
  2: "\u9605\u8BFB\u7406\u89E3\uFF08\u9605\u8BFB+\u95EE\u7B54\u9009\u62E9\uFF09",
  3: "\u5B8C\u578B\u586B\u7A7A\uFF08\u9605\u8BFB+\u9009\u62E9\uFF09",
  4: "\u9605\u8BFB\u586B\u7A7A\uFF08\u9605\u8BFB+\u586B\u7A7A\uFF09",
  5: "\u95EE\u7B54\u9898",
  6: "\u9009\u62E9\u9898\uFF0C\u591A\u9009\u591A",
  7: "\u586B\u7A7A\u3001\u9009\u62E9\u9898\u6DF7\u5408",
  8: "\u5E94\u7528\u9898",
  9: "\u5224\u65AD\u9898",
  10: "\u4F5C\u56FE\u9898",
  11: "\u6750\u6599\u9898",
  12: "\u8BA1\u7B97\u9898",
  13: "\u8FDE\u7EBF\u9898",
  14: "\u4F5C\u6587\u9898",
  15: "\u89E3\u7B54\u9898",
  16: "\u5176\u4ED6",
  17: "\u56FE",
  18: "\u8868\u683C"
};

// src/pages/DashboardCommon/RobotMarkdown/utils.ts
var formatResult = (res, dataType, options) => {
  const metrics = {};
  if (Array.isArray(res.metrics)) {
    for (let i = 0; i < res.metrics.length; i++) {
      const cur = res.metrics[i];
      metrics[cur.page_id] = cur;
    }
  }
  if (dataType && [import_RightView.ResultType.handwriting, import_RightView.ResultType.formula].includes(dataType)) {
    if (!Array.isArray(res.pages))
      return void 0;
    let isFromZero = false;
    const pageRects = [];
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
          if (line.sub_type === "handwriting" && dataType === import_RightView.ResultType.handwriting || line.sub_type === "formula" && dataType === import_RightView.ResultType.formula) {
            const row = {
              text: line.text,
              position: line.pos,
              type: dataType,
              page_id: cur.page_id
            };
            if (metrics[cur.page_id] && options?.angle !== false) {
              row.angle = metrics[cur.page_id].angle;
            }
            row.content_id = `${idx}_${line.id}`;
            pageRects[page_num].push(row);
          }
        }
      }
    }
    return pageRects;
  } else if (import_RightView.ResultType.question === dataType) {
    if (!Array.isArray(res.questions))
      return void 0;
    let isFromZero = false;
    let pre_index = 0;
    let cur_page = 0;
    let image_num = 1;
    let table_num = 1;
    const pageRects = [];
    for (let idx = 0; idx < res.questions.length; idx++) {
      const cur = res.questions[idx];
      if (!cur.hasOwnProperty("page_id")) {
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
      if (cur.type === 0 && cur.pos_list?.length && Array.isArray(cur.pos_list[0])) {
        pageRects[page_num].push({
          content_id: `${idx}_${cur.index}_border`,
          position: cur.pos_list[0],
          type: "question_border",
          question_type: cur.type,
          question_index: idx
        });
      }
      if (cur.element_list) {
        for (let index = 0; index < cur.element_list.length; index++) {
          const line = cur.element_list[index];
          const row = {
            text: line.text,
            position: Array.isArray(line.pos_list?.[0]) ? line.pos_list[0] : [],
            type: "question_" + (line.type === 0 || line.type === "stem" ? "stem" : "content"),
            question_type: cur.type,
            question_category: line.type,
            question_index: idx,
            content_id: `${idx}_${cur.index}_${index}`,
            page_id: cur.page_id
          };
          pageRects[page_num].push(row);
        }
      }
      if (cur.image_list) {
        for (let index = 0; index < cur.image_list.length; index++) {
          const row = {
            text: `\u56FE${image_num}`,
            position: Array.isArray(cur.image_list[index]) ? cur.image_list[index] : [],
            type: "question_image",
            rect_type: "image",
            question_type: cur.type,
            question_category: "\u9898\u56FE",
            question_index: idx,
            _from_split: index > 0,
            content_id: `${idx}_${cur.index}_${index}_img`,
            page_id: cur.page_id
          };
          image_num += 1;
          pageRects[page_num].push(row);
        }
      }
      if (cur.table_list) {
        for (let index = 0; index < cur.table_list.length; index++) {
          const row = {
            text: `\u8868${table_num}`,
            position: Array.isArray(cur.table_list[index]) ? cur.table_list[index] : [],
            type: "question_table",
            rect_type: "table",
            question_type: cur.type,
            question_category: "\u8868\u683C",
            question_index: idx,
            _from_split: index > 0,
            content_id: `${idx}_${cur.index}_${index}_table`,
            page_id: cur.page_id
          };
          table_num += 1;
          pageRects[page_num].push(row);
        }
      }
    }
    return pageRects;
  }
  let tablesFromPages = {};
  if (dataType && [import_RightView.ResultType.md, import_RightView.ResultType.table, import_RightView.ResultType.json].includes(dataType) && Array.isArray(res.pages)) {
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
          if (row.type === "table") {
            let col_index = 0;
            let pre_row = 0;
            const cells = [];
            for (let k = 0; k < row.cells.length; k++) {
              const item = row.cells[k];
              if (item.col === 0 || item.row !== pre_row) {
                col_index = 0;
              }
              pre_row = item.row;
              const cell = {};
              for (const key in item) {
                if (key !== "pos" && Object.prototype.hasOwnProperty.call(item, key)) {
                  cell[key] = item[key];
                }
              }
              cell.col_index = col_index;
              cell.row_index = item.row;
              cell.position = item.pos;
              cell.cell_id = setCellId(cell);
              col_index += 1;
              cells.push(cell);
            }
            const tableRow = {
              page_id: cur.page_id,
              cells
            };
            Object.keys(row).forEach((key) => {
              if (key !== "cells" && !tableRow.hasOwnProperty(key)) {
                tableRow[key] = row[key];
              }
            });
            tablesFromPages[pageId].push(tableRow);
          }
        }
      }
    }
  }
  if (Array.isArray(res.detail)) {
    let isFromZero = false;
    const splitMap = {};
    const pageParagraphContentMap = {};
    const pageRects = [];
    for (let idx = 0; idx < res.detail.length; idx++) {
      const cur = res.detail[idx];
      if (cur.page_id === 0) {
        isFromZero = true;
      }
      const page_num = isFromZero ? cur.page_id : cur.page_id - 1;
      if (!pageRects[page_num]) {
        pageRects[page_num] = [];
      }
      if (dataType) {
        if (dataType === "table" && cur.type !== "table")
          continue;
        if (dataType === "image" && cur.type !== "image")
          continue;
        if (dataType === import_RightView.ResultType.header_footer && cur.content !== 1)
          continue;
      }
      const row = {
        content_id: idx,
        position: cur.position,
        text: cur.text,
        page_id: cur.page_id
      };
      const pickFields = [
        "type",
        "sub_type",
        "image_url",
        "base64str",
        "outline_level",
        "split_section_page_ids",
        "split_section_positions",
        "custom_edit_continue",
        "custom_edit_continue_content_ids"
      ];
      for (let i = 0; i < pickFields.length; i++) {
        const field = pickFields[i];
        if (cur[field] !== void 0) {
          row[field] = cur[field];
        }
      }
      if (cur.content === 1) {
        row.rect_type = import_RightView.ResultType.header_footer;
        row.content = cur.content;
      } else if (cur.sub_type && cur.sub_type === "catalog") {
      } else if (cur.sub_type && cur.sub_type === "stamp") {
      } else if (cur.outline_level !== -1) {
        row.rect_type = "title";
      }
      if (metrics[cur.page_id] && options?.angle !== false) {
        row.angle = metrics[cur.page_id].angle;
      }
      if (row.custom_edit_continue) {
        continue;
      }
      if (cur.type === "table" && cur.cells && tablesFromPages[cur.page_id]) {
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
            const pageSet = new Set(cur.split_section_page_ids);
            const allPages = [];
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
              row.split_cells = allPages.slice(tableIndex, tableIndex + cur.split_section_positions.length);
            }
          }
        }
      }
      if (cur.split_section_page_ids && cur.split_section_positions) {
        const rectPosition = String(cur.position);
        let table_rows = 0;
        let skipRow = 0;
        if (cur.cells && row.split_cells) {
          const lastCell = cur.cells[cur.cells.length - 1];
          const validRows = lastCell.row + lastCell.row_span;
          const totalRows = row.split_cells?.reduce((pre, t) => pre + t.rows, 0);
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
              position: cur.split_section_positions[i + 1]
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
            const newRow = {
              position: newPosition,
              points: newPosition,
              next_section,
              _from_split: true
            };
            for (const key in row) {
              if (!["position", "points", "next_section", "_from_split"].includes(key) && Object.prototype.hasOwnProperty.call(row, key)) {
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
                  cell.cell_id = setCellId(cell);
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
      if (![import_RightView.ResultType.question].includes(dataType) && (Array.isArray(cur.tags) && cur.tags.some((t) => ["formula", "handwritten"].includes(t)) || cur.type === "table") && Array.isArray(res.pages)) {
        if (!pageParagraphContentMap[page_num] && res.pages[page_num]) {
          const contentIdMap = {};
          const pageContent = res.pages[page_num].content;
          for (let i = 0; i < pageContent.length; i++) {
            const cur2 = pageContent[i];
            if (["formula", "handwriting"].includes(cur2.sub_type)) {
              contentIdMap[cur2.id] = { position: cur2.pos, type: cur2.sub_type };
            }
          }
          pageParagraphContentMap[page_num] = {};
          const pageStructured = res.pages[page_num].structured;
          for (let i = 0; i < pageStructured.length; i++) {
            const cur2 = pageStructured[i];
            if (cur2.content) {
              const content = [];
              for (let j = 0; j < cur2.content.length; j++) {
                content.push(contentIdMap[cur2.content[j]]);
              }
              pageParagraphContentMap[page_num][cur2.id] = { content };
            } else if (cur2.type === "table" && cur2.cells) {
              const content = [];
              try {
                for (let j = 0; j < cur2.cells.length; j++) {
                  const cell = cur2.cells[j];
                  for (let k = 0; k < cell.content.length; k++) {
                    const ct = cell.content[k];
                    for (let l = 0; l < ct.content.length; l++) {
                      const i2 = ct.content[l];
                      if (contentIdMap[i2]) {
                        content.push(Object.assign(contentIdMap[i2], { content_id: cell.cell_id }));
                      }
                    }
                  }
                }
              } catch (error) {
                console.error("pageParagraphContentMap error", error);
              }
              pageParagraphContentMap[page_num][cur2.id] = { content };
            }
          }
        }
        const paragraphContents = pageParagraphContentMap[page_num]?.[cur.paragraph_id]?.content;
        if (Array.isArray(paragraphContents) && paragraphContents.length) {
          const contents = [];
          let contentType = paragraphContents[0]?.type;
          for (let i = 0; i < paragraphContents.length; i++) {
            const item = paragraphContents[i];
            if (item?.type !== contentType) {
              contentType = "multiple";
            }
            if (item) {
              contents.push({
                content_id: item.content_id || row.content_id,
                angle: row.angle,
                text: item.text,
                type: item.type,
                position: item.position,
                _from_split: true,
                page_id: cur.page_id
              });
            }
          }
          if (contentType && contentType !== "multiple") {
            if (row.type !== "table") {
              row.type = contentType;
            }
          } else {
            for (let i = 0; i < contents.length; i++) {
              pageRects[page_num].push(contents[i]);
            }
          }
        }
      }
    }
    for (let index = 0; index < pageRects.length; index++) {
      if (!Array.isArray(pageRects[index])) {
        pageRects[index] = [];
      }
      if (splitMap[index + 1]) {
        const splitItems = splitMap[index + 1];
        pageRects[index].unshift(...splitItems);
      }
    }
    if (res.catalog?.generate && Array.isArray(res.catalog.generate)) {
      const catalog = res.catalog.generate;
      for (let index = 0; index < catalog.length; index++) {
        const item = catalog[index];
        const dataIndex = item.pageNum;
        if (typeof item.pageNum === "number" && Array.isArray(pageRects[dataIndex])) {
          pageRects[dataIndex].push({
            type: "catalog",
            position: item.pos,
            content_id: "catalog" + index,
            page_id: dataIndex + 1
          });
        }
      }
    } else if (res.catalog?.toc && Array.isArray(res.catalog.toc)) {
      const catalog = [];
      for (let i = 0; i < res.catalog.toc.length; i++) {
        const item = res.catalog.toc[i];
        if (!["image_title", "table_title"].includes(item.sub_type)) {
          catalog.push(item);
        }
      }
      for (let index = 0; index < catalog.length; index++) {
        const item = catalog[index];
        const dataIndex = item.page_id - 1;
        if (typeof item.page_id === "number" && Array.isArray(pageRects[dataIndex])) {
          pageRects[dataIndex].push({
            type: "catalog",
            position: item.pos || item.position,
            content_id: "catalog" + index,
            page_id: item.page_id
          });
        }
      }
    }
    return pageRects.length ? pageRects : [];
  }
  return void 0;
};
var getQuestionsRenderList = (page) => {
  return page.reduce((pre, line) => {
    if (!pre[line.question_index]) {
      pre[line.question_index] = {
        data: [],
        question_type: line.question_type,
        question_index: line.question_index,
        images: [],
        tables: []
      };
    }
    const { images, tables, data } = pre[line.question_index];
    if (line.type === "question_image") {
      images.push(line);
    } else if (line.type === "question_table") {
      tables.push(line);
    } else if (line.type === "question_border") {
      Object.assign(pre[line.question_index], { border: line });
    } else {
      data.push(line);
    }
    return pre;
  }, []);
};
var jsonToMarkdown = (json) => {
  let markdown = "";
  json.forEach((item) => {
    if (!item) {
      return;
    }
    const text = item.text || "";
    if (item.type === "image") {
      markdown += `![${text}](${item.image_url})

`;
    } else if (item.type === "table") {
      markdown += `${text || ""}

`;
    } else if (item.type === "formula") {
      markdown += `$${text}$`;
    } else if (item.type === "paragraph" && (item.outline_level || 0) >= 0) {
      markdown += `${"#".repeat((item.outline_level || 0) + 1)} ${text}

`;
    } else if (["catalog"].includes(item.type) || item.content === 1) {
    } else {
      markdown += `${text}

`;
    }
  });
  return markdown;
};
function splitMarkdownHeader(markdown) {
  const headerRegex = /^(#+)\s*([\s\S]+?)$/;
  const match = markdown.match(headerRegex);
  if (match) {
    const hashes = match[1];
    const text = match[2];
    return { hashes, text };
  } else {
    return null;
  }
}
function isMarkdownHeader(markdown) {
  const headerRegex = /^#+\s+[\s\S]+/;
  return headerRegex.test(markdown);
}
var setCellId = (cell) => {
  return `${cell.row_index}_${cell.col_index}_cell_${cell.row}_${cell.row_span}_cell_${cell.col}_${cell.col_span}`;
};
var removeFormula$ = (text) => text.replace(/^\$/, "").replace(/\$$/, "");
var formatExamPaper = (res) => {
  if (!res)
    return null;
  const detail = res.detail_new || res.detail;
  const hasGenuineSections = Array.isArray(detail) && detail.some((item) => typeof item?.text === "string" && SECTION_TITLE_REGEX.test(item.text.trim()));
  const hasEditedQuestions = Array.isArray(res.questions) && res.questions.length > 0 && res._edited === true;
  if ((!hasGenuineSections || hasEditedQuestions) && Array.isArray(res.questions) && res.questions.length > 0) {
    return formatExamPaperFromQuestions(res);
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return formatExamPaperFromDetail(res, detail);
  }
  if (Array.isArray(res.questions) && res.questions.length > 0) {
    return formatExamPaperFromQuestions(res);
  }
  if (res.markdown) {
    return formatExamPaperFromMarkdown(res);
  }
  return null;
};
var formatExamPaperFromQuestions = (res) => {
  const questions = res.questions;
  const sections = [];
  let currentSection = null;
  let questionCount = 0;
  let title = "";
  let subtitle = "";
  const detail = res.detail_new || res.detail;
  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (typeof item.outline_level === "number" && item.outline_level >= 0 && item.text) {
        if (!title)
          title = item.text;
        else if (!subtitle) {
          subtitle = item.text;
          break;
        }
      }
    }
  }
  for (let idx = 0; idx < questions.length; idx++) {
    const cur = questions[idx];
    const questionType = cur.type;
    const typeDesc = QuestionTypeDesc[questionType] || `\u9898\u578B${questionType}`;
    if (!currentSection || currentSection.questionType !== questionType) {
      const sectionIndex = sections.length + 1;
      currentSection = {
        name: `${numberToChinese(sectionIndex)}\u3001${typeDesc}`,
        questionType,
        questionTypeDesc: typeDesc,
        questions: []
      };
      sections.push(currentSection);
    }
    const question = parseQuestion(cur, idx);
    currentSection.questions.push(question);
    questionCount++;
  }
  return { title, subtitle, sections, questionCount };
};
var QUESTION_INDEX_REGEX = /^\s*(?:[（(][^）)\d]{1,8}[）)])?(\d{1,3})\s*[.、．)\]]/;
var SECTION_TITLE_REGEX = /^\s*([一二三四五六七八九十]{1,3})\s*[.、．)\]]\s*(.+)/;
var OPTION_REGEX = /^\s*([A-Za-z])\s*[.、．)\]]\s*(.*)/;
var OPTION_INLINE_SPLIT_REGEX = /\s+([A-Da-d])\s*[.、．)\]]\s+/g;
var MD_EMPHASIS_REGEX = new RegExp("\\*{1,3}([^*\\n]+?)\\*{1,3}|_{1,3}([^_\\n]+?)_{1,3}|~~([^~\\n]+?)~~|==([^=\\n]+?)==|`([^`\\n]+?)`", "g");
var stripMdEmphasis = (text) => {
  const stripped = text.replace(MD_EMPHASIS_REGEX, (...args) => {
    const groups = args.slice(1, 6);
    return groups.find((g) => g !== void 0) ?? "";
  });
  if (stripped !== text) {
    return stripped.replace(/^(\s*[A-Ha-h])(?=\s)/, "$1.");
  }
  return stripped;
};
var CHOICE_SECTION_REGEX = /(?<!非)选择题|单选题|多选题/;
var META_MARKER_HEAD_REGEX = /^\s*[【\[]?(知识点|难度|分值|答案|解析)[】\]]?\s*[:：]?/;
var META_MARKER_SPLIT_REGEX = /[【\[]?(知识点|难度|分值|答案|解析)[】\]]?\s*[:：]?/g;
var META_MARKER_INLINE_REGEX = /[【\[](知识点|难度|分值|答案|解析)[】\]]\s*[:：]?/;
var META_FIELD_MAP = {
  \u77E5\u8BC6\u70B9: "knowledge",
  \u96BE\u5EA6: "difficulty",
  \u5206\u503C: "score",
  \u7B54\u6848: "answer",
  \u89E3\u6790: "analysis"
};
var applyMetaMarkers = (question, metaText, idx) => {
  const marks = [];
  const splitRegex = new RegExp(META_MARKER_SPLIT_REGEX.source, "g");
  let marker;
  while ((marker = splitRegex.exec(metaText)) !== null) {
    marks.push({ label: marker[1], start: marker.index, end: marker.index + marker[0].length });
  }
  for (let i = 0; i < marks.length; i++) {
    const segEnd = i + 1 < marks.length ? marks[i + 1].start : metaText.length;
    const value = metaText.slice(marks[i].end, segEnd).trim();
    if (!value)
      continue;
    const field = META_FIELD_MAP[marks[i].label];
    question[field] = (question[field] ? `${question[field]}
` : "") + value;
    question.contentGroups?.[field]?.push(idx);
  }
};
var formatExamPaperFromDetail = (res, detail) => {
  let title = "";
  let subtitle = "";
  const sections = [];
  let currentSection = null;
  let currentQuestion = null;
  let questionCount = 0;
  let lastQuestionIndex = 0;
  let seenQuestionIndexes = new Set();
  let seenMinQuestionIndex = Infinity;
  let isChoiceSection = false;
  let currentOption = null;
  for (let idx = 0; idx < detail.length; idx++) {
    const item = detail[idx];
    const rawText = (item.text || "").trim();
    const text = stripMdEmphasis(rawText);
    const outlineLevel = item.outline_level;
    const itemType = item.type;
    if (item.content === 1)
      continue;
    if (itemType === "image") {
      if (currentQuestion) {
        const imgSrc = item.base64str ? `data:image/jpg;base64,${item.base64str}` : item.image_url || "";
        if (imgSrc) {
          currentQuestion.stem += (currentQuestion.stem ? "\n" : "") + `<img src="${imgSrc}" style="max-width:100%;max-height:200px" />`;
        }
        currentQuestion.contentIds.push(idx);
        if (currentOption) {
          currentOption.contentIds?.push(idx);
        } else {
          currentQuestion.contentGroups?.stem.push(idx);
        }
      }
      continue;
    }
    if (itemType === "table") {
      if (currentQuestion) {
        const tableHtml = item.text || "";
        if (tableHtml) {
          currentQuestion.stem += (currentQuestion.stem ? "\n\n" : "") + tableHtml + "\n\n";
        }
        currentQuestion.contentIds.push(idx);
        if (currentOption) {
          currentOption.contentIds?.push(idx);
        } else {
          currentQuestion.contentGroups?.stem.push(idx);
        }
      }
      continue;
    }
    if (!text)
      continue;
    const sectionMatch = text.match(SECTION_TITLE_REGEX);
    if (sectionMatch) {
      currentSection = {
        name: text,
        questionType: "section",
        questionTypeDesc: sectionMatch[2],
        questions: [],
        contentId: idx
      };
      sections.push(currentSection);
      currentQuestion = null;
      currentOption = null;
      lastQuestionIndex = 0;
      seenQuestionIndexes = new Set();
      seenMinQuestionIndex = Infinity;
      isChoiceSection = CHOICE_SECTION_REGEX.test(text);
      continue;
    }
    const questionMatch = text.match(QUESTION_INDEX_REGEX);
    if (questionMatch) {
      const qIndex = parseInt(questionMatch[1], 10);
      const expectedNext = lastQuestionIndex + 1;
      const isOutOfOrderFill = lastQuestionIndex > 0 && qIndex < lastQuestionIndex && !seenQuestionIndexes.has(qIndex) && qIndex >= seenMinQuestionIndex;
      const isContinuation = currentQuestion && (qIndex <= lastQuestionIndex && !isOutOfOrderFill || lastQuestionIndex > 0 && qIndex > expectedNext + 3);
      if (!isContinuation) {
        if (!currentSection) {
          currentSection = {
            name: "\u8BD5\u9898",
            questionType: "default",
            questionTypeDesc: "\u8BD5\u9898",
            questions: []
          };
          sections.push(currentSection);
        }
        questionCount++;
        seenQuestionIndexes.add(qIndex);
        seenMinQuestionIndex = Math.min(seenMinQuestionIndex, qIndex);
        let stemText = text.replace(QUESTION_INDEX_REGEX, "").trim();
        let inlineMetaText = "";
        const stemInlineMatch = stemText.match(META_MARKER_INLINE_REGEX);
        if (stemInlineMatch && typeof stemInlineMatch.index === "number") {
          inlineMetaText = stemText.slice(stemInlineMatch.index);
          stemText = stemText.slice(0, stemInlineMatch.index).trim();
        }
        const newQuestion = {
          index: qIndex,
          type: isChoiceSection ? "choice" : "unknown",
          typeDesc: isChoiceSection ? "\u9009\u62E9\u9898" : "",
          stem: stemText,
          options: [],
          answer: "",
          analysis: "",
          knowledge: "",
          difficulty: "",
          score: "",
          images: [],
          tables: [],
          subQuestions: [],
          element_list: [],
          contentIds: [idx],
          contentGroups: {
            stem: [idx],
            options: [],
            answer: [],
            analysis: [],
            knowledge: [],
            difficulty: [],
            score: []
          }
        };
        currentSection.questions.push(newQuestion);
        if (inlineMetaText) {
          applyMetaMarkers(newQuestion, inlineMetaText, idx);
        }
        if (!isOutOfOrderFill) {
          lastQuestionIndex = qIndex;
          currentQuestion = newQuestion;
          currentOption = null;
        }
        continue;
      }
    }
    const optionMatch = text.match(OPTION_REGEX);
    if (optionMatch && currentQuestion) {
      currentQuestion.contentIds.push(idx);
      const optionSegments = [
        { label: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() }
      ];
      const inlineMarks = [];
      let m;
      const inlineRegex = new RegExp(OPTION_INLINE_SPLIT_REGEX.source, "g");
      while ((m = inlineRegex.exec(optionMatch[2])) !== null) {
        inlineMarks.push({ index: m.index, label: m[1].toUpperCase() });
      }
      for (let i = 0; i < inlineMarks.length; i++) {
        const mark = inlineMarks[i];
        const end = i + 1 < inlineMarks.length ? inlineMarks[i + 1].index : optionMatch[2].length;
        const segment = optionMatch[2].slice(mark.index, end).replace(/^\s*[A-Da-d]\s*[.、．)\]]\s*/, "").trim();
        optionSegments.push({ label: mark.label, text: segment });
      }
      if (isChoiceSection) {
        for (const seg of optionSegments) {
          const option = { label: seg.label, text: seg.text, contentIds: [idx] };
          currentQuestion.options.push(option);
          currentQuestion.contentGroups?.options.push(option);
          currentOption = option;
        }
      } else {
        currentQuestion.stem += (currentQuestion.stem ? "\n" : "") + rawText;
        currentQuestion.contentGroups?.stem.push(idx);
        currentOption = null;
      }
      continue;
    }
    let metaText = text;
    if (!META_MARKER_HEAD_REGEX.test(text) && currentQuestion) {
      const inlineMatch = text.match(META_MARKER_INLINE_REGEX);
      if (inlineMatch && typeof inlineMatch.index === "number") {
        const stemPart = text.slice(0, inlineMatch.index).trim();
        if (stemPart) {
          currentQuestion.stem += (currentQuestion.stem ? "\n" : "") + stemPart;
          currentQuestion.contentGroups?.stem.push(idx);
        }
        metaText = text.slice(inlineMatch.index);
      }
    }
    if (META_MARKER_HEAD_REGEX.test(metaText) && currentQuestion) {
      applyMetaMarkers(currentQuestion, metaText, idx);
      currentQuestion.contentIds.push(idx);
      currentOption = null;
      continue;
    }
    if (typeof outlineLevel === "number" && outlineLevel >= 0) {
      if (!title && !currentQuestion) {
        title = text;
      } else if (!subtitle && !currentQuestion && outlineLevel <= 1) {
        subtitle = text;
      } else if (!currentQuestion || sections.length === 0) {
        currentSection = {
          name: text,
          questionType: "section",
          questionTypeDesc: text,
          questions: [],
          contentId: idx
        };
        sections.push(currentSection);
        currentQuestion = null;
        currentOption = null;
        lastQuestionIndex = 0;
        seenQuestionIndexes = new Set();
        seenMinQuestionIndex = Infinity;
        isChoiceSection = CHOICE_SECTION_REGEX.test(text);
      } else {
        currentQuestion.stem += (currentQuestion.stem ? "\n" : "") + text;
        currentQuestion.contentIds.push(idx);
        currentQuestion.contentGroups?.stem.push(idx);
        currentOption = null;
      }
      continue;
    }
    if (currentQuestion) {
      currentQuestion.stem += (currentQuestion.stem ? "\n" : "") + text;
      currentQuestion.contentIds.push(idx);
      if (currentOption) {
        currentOption.contentIds?.push(idx);
      } else {
        currentQuestion.contentGroups?.stem.push(idx);
      }
    } else if (!currentSection) {
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
  for (const section of sections) {
    section.questions.sort((a, b) => a.index - b.index);
  }
  return { title, subtitle, sections, questionCount };
};
var formatExamPaperFromMarkdown = (res) => {
  const markdown = res.markdown;
  if (!markdown)
    return null;
  const lines = markdown.split("\n");
  const detailLike = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed)
      continue;
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      detailLike.push({
        text: headerMatch[2],
        outline_level: headerMatch[1].length - 1,
        type: "paragraph"
      });
    } else if (trimmed.startsWith("![")) {
      const imgMatch = trimmed.match(/!\[.*?\]\((.*?)\)/);
      detailLike.push({
        text: "",
        type: "image",
        image_url: imgMatch?.[1] || ""
      });
    } else {
      detailLike.push({
        text: trimmed,
        type: "paragraph",
        outline_level: -1
      });
    }
  }
  if (detailLike.length === 0)
    return null;
  return formatExamPaperFromDetail(res, detailLike);
};
var parseQuestion = (cur, idx) => {
  const questionType = cur.type;
  const typeDesc = QuestionTypeDesc[questionType] || `\u9898\u578B${questionType}`;
  let stem = "";
  let answer = "";
  let analysis = "";
  const options = [];
  const images = [];
  const tables = [];
  const subQuestions = [];
  if (Array.isArray(cur.element_list) && cur.element_list.length > 0) {
    for (const element of cur.element_list) {
      const category = element.type;
      const text = element.text || "";
      if (category === 0 || category === "stem") {
        stem += (stem ? "\n" : "") + text;
      } else if (category === 1 || category === "option") {
        const optionMatch = text.match(/^([A-Za-z])\s*[.、．)\]]\s*(.*)/s);
        if (optionMatch) {
          options.push({ label: optionMatch[1], text: optionMatch[2] });
        } else {
          options.push({ label: String.fromCharCode(65 + options.length), text });
        }
      } else if (category === 2 || category === "analysis") {
        analysis += (analysis ? "\n" : "") + text;
      } else if (category === 3 || category === "answer") {
        answer += (answer ? "\n" : "") + text;
      } else {
        stem += (stem ? "\n" : "") + text;
      }
    }
  }
  if (!stem && cur.stem)
    stem = cur.stem;
  if (!answer && cur.answer)
    answer = cur.answer;
  if (!analysis && cur.analysis)
    analysis = cur.analysis;
  if (options.length === 0 && Array.isArray(cur.options)) {
    for (const opt of cur.options) {
      if (opt.label && opt.text !== void 0) {
        options.push({ label: opt.label, text: opt.text });
      }
    }
  }
  const imageList = Array.isArray(cur.image_list) ? cur.image_list : Array.isArray(cur.images) ? cur.images : [];
  if (imageList.length > 0) {
    for (const img of imageList) {
      if (typeof img === "string") {
        images.push(img);
      } else if (img?.image_url) {
        images.push(img.image_url);
      } else if (img?.base64) {
        images.push(`data:image/png;base64,${img.base64}`);
      }
    }
  }
  const tableList = Array.isArray(cur.table_list) ? cur.table_list : Array.isArray(cur.tables) ? cur.tables : [];
  if (tableList.length > 0) {
    for (const table of tableList) {
      tables.push(table);
    }
  }
  const subQuestionsList = Array.isArray(cur.sub_questions) ? cur.sub_questions : Array.isArray(cur.subQuestions) ? cur.subQuestions : [];
  if (subQuestionsList.length > 0) {
    for (let i = 0; i < subQuestionsList.length; i++) {
      subQuestions.push(parseQuestion(subQuestionsList[i], i));
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
    knowledge: cur.knowledge || "",
    difficulty: cur.difficulty || "",
    score: cur.score || "",
    images,
    tables,
    subQuestions,
    element_list: cur.element_list || [],
    contentIds: Array.isArray(cur.contentIds) ? cur.contentIds : [],
    contentGroups: cur.contentGroups
  };
};
var numberToChinese = (num) => {
  const chineseNumbers = [
    "\u4E00",
    "\u4E8C",
    "\u4E09",
    "\u56DB",
    "\u4E94",
    "\u516D",
    "\u4E03",
    "\u516B",
    "\u4E5D",
    "\u5341",
    "\u5341\u4E00",
    "\u5341\u4E8C",
    "\u5341\u4E09",
    "\u5341\u56DB",
    "\u5341\u4E94",
    "\u5341\u516D",
    "\u5341\u4E03",
    "\u5341\u516B",
    "\u5341\u4E5D",
    "\u4E8C\u5341"
  ];
  if (num >= 1 && num <= 20) {
    return chineseNumbers[num - 1];
  }
  return String(num);
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  formatExamPaper,
  formatResult,
  getQuestionsRenderList,
  isMarkdownHeader,
  jsonToMarkdown,
  removeFormula$,
  setCellId,
  splitMarkdownHeader
});
