import React, { useCallback, useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react';
import classNames from 'classnames';
import { Tag, Empty, Input, Button, Tooltip, message } from 'antd';
import type { IExamPaperData, IExamPaperQuestion, IExamPaperSection } from '../../data.d';
import { formatExamPaper } from '../../utils';
import MarkdownRender from '../../MarkdownRender/MarkdownRender';
import useMathJaxLoad, { useRefreshMath } from '../../MathJaxRender/useMathJaxLoad';
import { storeContainer } from '../../store';
import ExamPaperRichEditor, { textToHtml } from './ExamPaperRichEditor';
import ExamPaperImageView, { resetExamPaperImageCaches } from './ExamPaperImageView';
import useRectAdjust, { RECT_ADJUST_CLEAR_EVENT } from './useRectAdjust';
import { clearAllActive, highlightLeftViewRects } from './helpers';
import styles from './index.less';

interface IProps {
  result: any;
  isPdf?: boolean;
}

/** 从 result detail 中根据 contentId 获取图片 base64 */
const getImageSrcFromResult = (result: any, contentId: string): string => {
  if (!result) return '';
  const detail = result.detail_new || result.detail;
  if (!Array.isArray(detail)) return '';
  const idx = Number(contentId);
  if (isNaN(idx) || !detail[idx]) return '';
  const item = detail[idx];
  if (item.type === 'image') {
    if (item.base64str) return `data:image/jpg;base64,${item.base64str}`;
    return item.image_url || '';
  }
  return '';
};

// ==================== 编辑模式组件 ====================

/** editor 实例注册表 key: `${sectionIdx}-${questionIdx}` */
type EditorRegistry = Map<string, any>;

/** 内容统一按 Markdown 格式渲染，内嵌的 <img>/<table> 等 HTML 由 rehype-raw 处理 */
const RichContent: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;
  return <MarkdownRender content={content} />;
};

/** 可编辑的题目项（只有当前选中的题目才渲染 CKEditor） */
const EditableQuestionItem: React.FC<{
  question: IExamPaperQuestion;
  showIndex?: boolean;
  sectionIdx: number;
  questionIdx: number;
  isEditing: boolean;
  onSelect: (key: string) => void;
  onSaveQuestion: (key: string) => void;
  onChange: (sectionIdx: number, questionIdx: number, field: string, value: any) => void;
  onSplit: (sectionIdx: number, questionIdx: number) => void;
  onInsertImage: (sectionIdx: number, questionIdx: number, imgSrc: string) => void;
  onAddOption: (sectionIdx: number, questionIdx: number) => void;
  onRemoveOption: (sectionIdx: number, questionIdx: number, optionIdx: number) => void;
  editorRegistry: EditorRegistry;
}> = ({ question, showIndex = true, sectionIdx, questionIdx, isEditing, onSelect, onSaveQuestion, onChange, onSplit, onInsertImage, onAddOption, onRemoveOption, editorRegistry }) => {

  const editorKey = `${sectionIdx}-${questionIdx}`;
  const questionContentId = question.contentIds.length > 0 ? question.contentIds[0] : undefined;

  const handleEditorReady = useCallback((editor: any) => {
    editorRegistry.set(editorKey, editor);
  }, [editorKey, editorRegistry]);

  const handleInsertImage = useCallback(() => {
    const activePolygons = document.querySelectorAll<HTMLElement>('#imgContainer polygon.active');
    if (activePolygons.length === 0) {
      message.warning('请先在左侧选中要插入的图片');
      return;
    }
    const contentId = activePolygons[0].getAttribute('data-content-id');
    if (!contentId) return;
    onInsertImage(sectionIdx, questionIdx, contentId);
  }, [sectionIdx, questionIdx, onInsertImage]);

  // 点击题目区域：仅在非编辑态时进入编辑态；若已经在编辑态则不响应（防止点击内部或空白退出）
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isEditing) return;
    onSelect(editorKey);
  }, [isEditing, editorKey, onSelect]);

  const handleSaveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSaveQuestion(editorKey);
    },
    [editorKey, onSaveQuestion],
  );

  return (
    <div
      className={classNames(styles.questionItem, isEditing && styles.questionEditing)}
      data-question-content-ids={question.contentIds.join(',')}
      data-content-id={questionContentId}
      onClick={handleClick}
    >
      {isEditing ? (
        <>
          <div className={styles.questionHeader}>
            {showIndex && (
              <Input
                className={styles.questionIndexInput}
                value={String(question.index)}
                onChange={(e) => onChange(sectionIdx, questionIdx, 'index', e.target.value)}
                onPressEnter={() => onSplit(sectionIdx, questionIdx)}
                title="修改题号后按回车可拆分题目"
              />
            )}
            <Tooltip title="从左侧选中图片插入到光标位置">
              <Button size="small" className={styles.insertImgBtn} onClick={handleInsertImage}>
                插入图片
              </Button>
            </Tooltip>
            <Button
              size="small"
              type="primary"
              className={styles.saveQuestionBtn}
              onClick={handleSaveClick}
            >
              保存
            </Button>
          </div>

          {/* 题干富文本编辑 */}
          <div className={styles.questionStemEdit}>
            <ExamPaperRichEditor
              value={textToHtml(question.stem)}
              onChange={(html) => onChange(sectionIdx, questionIdx, 'stem', html)}
              placeholder="题干内容..."
              onEditorReady={handleEditorReady}
              minHeight={80}
            />
          </div>

          {/* 选项编辑 */}
          <div className={styles.questionOptions}>
            {question.options.map((opt, idx) => (
              <div key={idx} className={styles.optionEditItem}>
                <Input
                  className={styles.optionLabelInput}
                  value={opt.label}
                  onChange={(e) => {
                    const newOptions = [...question.options];
                    newOptions[idx] = { ...newOptions[idx], label: e.target.value };
                    onChange(sectionIdx, questionIdx, 'options', newOptions);
                  }}
                />
                <span className={styles.optionDot}>.</span>
                <div className={styles.optionRichEdit}>
                  <ExamPaperRichEditor
                    value={textToHtml(opt.text)}
                    onChange={(html) => {
                      const newOptions = [...question.options];
                      newOptions[idx] = { ...newOptions[idx], text: html };
                      onChange(sectionIdx, questionIdx, 'options', newOptions);
                    }}
                    placeholder="选项内容..."
                    minHeight={40}
                  />
                </div>
                <Tooltip title="删除此选项">
                  <Button
                    size="small"
                    type="text"
                    className={styles.removeOptionBtn}
                    onClick={() => onRemoveOption(sectionIdx, questionIdx, idx)}
                  >
                    ×
                  </Button>
                </Tooltip>
              </div>
            ))}
            <Button
              size="small"
              type="dashed"
              className={styles.addOptionBtn}
              onClick={() => onAddOption(sectionIdx, questionIdx)}
            >
              + 添加选项
            </Button>
          </div>

          {/* 答案富文本编辑 */}
          <div className={styles.questionAnswerEdit}>
            <span className={styles.answerLabel}>【答案】</span>
            <ExamPaperRichEditor
              value={textToHtml(question.answer)}
              onChange={(html) => onChange(sectionIdx, questionIdx, 'answer', html)}
              placeholder="答案..."
              minHeight={50}
            />
          </div>

          {/* 解析富文本编辑 */}
          <div className={styles.questionAnalysisEdit}>
            <span className={styles.analysisLabel}>【解析】</span>
            <ExamPaperRichEditor
              value={textToHtml(question.analysis)}
              onChange={(html) => onChange(sectionIdx, questionIdx, 'analysis', html)}
              placeholder="解析..."
              minHeight={50}
            />
          </div>
        </>
      ) : (
        <>
          {/* 只读模式：渲染内容（题号与题干同行显示） */}
          <div className={styles.questionStemRow}>
            {showIndex && <span className={styles.questionIndex}>{question.index}.</span>}
            {question.stem && (
              <div className={styles.questionStem} data-content-id={questionContentId}>
                <RichContent content={question.stem} />
              </div>
            )}
            <span className={styles.editHint}>点击编辑</span>
          </div>
          {question.options.length > 0 && (
            <div className={styles.questionOptions}>
              {question.options.map((opt, idx) => (
                <div key={idx} className={styles.optionItem}>
                  <span className={styles.optionLabel}>{opt.label}.</span>
                  <span className={styles.optionText}><RichContent content={opt.text} /></span>
                </div>
              ))}
            </div>
          )}
          {/* 元信息（知识点/难度/分值）：选择题显示在选项后面 */}
          {question.knowledge && (
            <div className={styles.questionMeta}>
              <span className={styles.knowledgeLabel}>【知识点】</span>
              <RichContent content={question.knowledge} />
            </div>
          )}
          {question.difficulty && (
            <div className={styles.questionMeta}>
              <span className={styles.difficultyLabel}>【难度】</span>
              <RichContent content={question.difficulty} />
            </div>
          )}
          {question.score && (
            <div className={styles.questionMeta}>
              <span className={styles.scoreLabel}>【分值】</span>
              <RichContent content={question.score} />
            </div>
          )}
          {question.answer && (
            <div className={styles.questionAnswer}>
              <span className={styles.answerLabel}>【答案】</span>
              <RichContent content={question.answer} />
            </div>
          )}
          {question.analysis && (
            <div className={styles.questionAnalysis}>
              <span className={styles.analysisLabel}>【解析】</span>
              <RichContent content={question.analysis} />
            </div>
          )}
        </>
      )}

      {/* 子题目 */}
      {question.subQuestions.length > 0 && (
        <div className={styles.subQuestions}>
          <div className={styles.subQuestionsTitle}>小题：</div>
          {question.subQuestions.map((sub, idx) => (
            <EditableQuestionItem
              key={idx}
              question={sub}
              sectionIdx={sectionIdx}
              questionIdx={questionIdx}
              isEditing={false}
              onSelect={onSelect}
              onSaveQuestion={onSaveQuestion}
              onChange={onChange}
              onSplit={onSplit}
              onInsertImage={onInsertImage}
              onAddOption={onAddOption}
              onRemoveOption={onRemoveOption}
              editorRegistry={editorRegistry}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== 查看模式组件 ====================

/** 渲染单个题目（只读） */
const QuestionItem: React.FC<{ question: IExamPaperQuestion; showIndex?: boolean }> = ({
  question,
  showIndex = true,
}) => {
  const questionContentId = question.contentIds.length > 0 ? question.contentIds[0] : undefined;

  return (
    <div
      className={styles.questionItem}
      data-question-content-ids={question.contentIds.join(',')}
      data-content-id={questionContentId}
    >
      {/* 只读模式：渲染内容 */}
      <div className={styles.questionStemRow}>
        {showIndex && <span className={styles.questionIndex}>{question.index}.</span>}
        {question.stem && (
          <div className={styles.questionStem} data-content-id={questionContentId}>
            <RichContent content={question.stem} />
          </div>
        )}
      </div>
      {question.options.length > 0 && (
        <div className={styles.questionOptions}>
          {question.options.map((opt, idx) => (
            <div key={idx} className={styles.optionItem}>
              <span className={styles.optionLabel}>{opt.label}.</span>
              <span className={styles.optionText}><RichContent content={opt.text} /></span>
            </div>
          ))}
        </div>
      )}
      {/* 元信息（知识点/难度/分值）：选择题显示在选项后面 */}
      {question.knowledge && (
        <div className={styles.questionMeta}>
          <span className={styles.knowledgeLabel}>【知识点】</span>
          <RichContent content={question.knowledge} />
        </div>
      )}
      {question.difficulty && (
        <div className={styles.questionMeta}>
          <span className={styles.difficultyLabel}>【难度】</span>
          <RichContent content={question.difficulty} />
        </div>
      )}
      {question.score && (
        <div className={styles.questionMeta}>
          <span className={styles.scoreLabel}>【分值】</span>
          <RichContent content={question.score} />
        </div>
      )}
      {question.answer && (
        <div className={styles.questionAnswer}>
          <span className={styles.answerLabel}>【答案】</span>
          <RichContent content={question.answer} />
        </div>
      )}
      {question.analysis && (
        <div className={styles.questionAnalysis}>
          <span className={styles.analysisLabel}>【解析】</span>
          <RichContent content={question.analysis} />
        </div>
      )}
      {question.subQuestions.length > 0 && (
        <div className={styles.subQuestions}>
          <div className={styles.subQuestionsTitle}>小题：</div>
          {question.subQuestions.map((sub, idx) => (
            <QuestionItem key={idx} question={sub} />
          ))}
        </div>
      )}
    </div>
  );
};

/** 渲染大题（section） */
const SectionItem: React.FC<{
  section: IExamPaperSection;
  editMode: boolean;
  sectionIdx: number;
  editingQuestionKey: string | null;
  onSelectQuestion: (key: string) => void;
  onSaveQuestion: (key: string) => void;
  onChange?: (sectionIdx: number, questionIdx: number, field: string, value: any) => void;
  onSplit?: (sectionIdx: number, questionIdx: number) => void;
  onInsertImage?: (sectionIdx: number, questionIdx: number, imgContentId: string) => void;
  onAddOption?: (sectionIdx: number, questionIdx: number) => void;
  onRemoveOption?: (sectionIdx: number, questionIdx: number, optionIdx: number) => void;
  editorRegistry?: EditorRegistry;
}> = ({ section, editMode, sectionIdx, editingQuestionKey, onSelectQuestion, onSaveQuestion, onChange, onSplit, onInsertImage, onAddOption, onRemoveOption, editorRegistry }) => {
  return (
    <div className={styles.sectionItem}>
      <div className={styles.sectionHeader} data-content-id={section.contentId}>
        <span className={styles.sectionName}>{section.name}</span>
        <Tag className={styles.sectionCount}>共 {section.questions.length} 题</Tag>
      </div>
      <div className={styles.sectionQuestions}>
        {section.questions.map((q, idx) => {
          const qKey = `${sectionIdx}-${idx}`;
          return editMode ? (
            <EditableQuestionItem
              key={idx}
              question={q}
              sectionIdx={sectionIdx}
              questionIdx={idx}
              isEditing={editingQuestionKey === qKey}
              onSelect={onSelectQuestion}
              onSaveQuestion={onSaveQuestion}
              onChange={onChange!}
              onSplit={onSplit!}
              onInsertImage={onInsertImage!}
              onAddOption={onAddOption!}
              onRemoveOption={onRemoveOption!}
              editorRegistry={editorRegistry!}
            />
          ) : (
            <QuestionItem key={idx} question={q} />
          );
        })}
      </div>
    </div>
  );
};

/** 题号正则 */
const QUESTION_INDEX_REGEX = /^\s*(?:[（(][^）)\d]{1,8}[）)])?(\d{1,3})\s*[.、．)\]]/;

/** 试卷结构视图 */
const ExamPaperView: React.FC<IProps> = ({ result, isPdf = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    examPaperMode,
    setResultJson,
    updateBlockPosition,
    examPaperPreviewFormat,
    setExamPaperPreviewFormat,
  } = storeContainer.useContainer();

  // 左侧预览区选中单个识别框时支持拖拽移动/手柄缩放，结束后回写 position，
  // 触发右侧 exam_paper 数据与裁剪图同步更新
  useRectAdjust({
    enabled: examPaperMode !== 'edit',
    detail: result?.detail_new || result?.detail,
    onCommit: updateBlockPosition,
  });

  // PDF 左侧视图的 pdf.js textLayer（z-index 11）盖在 rectLayer（z-index 10）之上，
  // 会拦截所有鼠标事件导致识别框无法点击/拖拽；查看模式下让其穿透指针事件，
  // 与 useRectAdjust 的启用条件保持一致（编辑模式下恢复）
  useEffect(() => {
    const className = 'exam-rect-adjust-enabled';
    if (examPaperMode !== 'edit') {
      document.body.classList.add(className);
      return () => document.body.classList.remove(className);
    }
    return undefined;
  }, [examPaperMode]);

  // 左侧点击空白处清除编辑态时，同步清除右侧高亮
  useEffect(() => {
    const handleRectAdjustClear = () => {
      if (containerRef.current) {
        clearAllActive(containerRef.current, styles.active);
      }
    };
    window.addEventListener(RECT_ADJUST_CLEAR_EVENT, handleRectAdjustClear);
    return () => window.removeEventListener(RECT_ADJUST_CLEAR_EVENT, handleRectAdjustClear);
  }, []);

  // 加载 MathJax 公式渲染引擎
  useMathJaxLoad({ show: true });

  // 编辑模式下的本地数据副本
  const [editedData, setEditedData] = useState<IExamPaperData | null>(null);

  // 当前正在编辑的题目 key（格式: `${sectionIdx}-${questionIdx}`）
  const [editingQuestionKey, setEditingQuestionKey] = useState<string | null>(null);

  // CKEditor 实例注册表，用于图片插入等操作
  const editorRegistry = useRef<EditorRegistry>(new Map()).current;

  // result 变化（切换解析文件）时清空图片预览的模块级缓存，避免上一份
  // 文档的裁剪图/页面原图因坐标相同被新文件命中，导致预览图与实际位置不符
  const lastResultRef = useRef<any>(null);
  if (lastResultRef.current !== result) {
    lastResultRef.current = result;
    resetExamPaperImageCaches();
  }

  // 当 result 变化时，重新计算 examData
  const examData: IExamPaperData | null = useMemo(() => {
    return formatExamPaper(result);
  }, [result]);

  // 进入/退出编辑模式时初始化/清除本地数据（只在模式切换时触发，保存导致的 examData 变化不重置）
  const prevModeRef = useRef(examPaperMode);
  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = examPaperMode;

    if (examPaperMode === 'edit' && examData && prevMode !== 'edit') {
      // 刚进入编辑模式：初始化本地数据
      setEditedData(JSON.parse(JSON.stringify(examData)));
      setEditingQuestionKey(null);
      // 编辑模式仅支持 markdown 格式
      setExamPaperPreviewFormat?.('markdown');
    } else if (examPaperMode !== 'edit') {
      // 退出编辑模式：清除
      setEditedData(null);
      setEditingQuestionKey(null);
    }
    // examData 变化时不重置，避免保存后丢失编辑状态
  }, [examPaperMode]);

  // 保存编辑：将 editedData 同步回 resultJson
  const handleSave = useCallback(() => {
    if (!editedData || !result) return;

    setResultJson((prev: any) => {
      if (!prev) return prev;
      const newResult = JSON.parse(JSON.stringify(prev));

      // 收集所有编辑后的题目（扁平化）
      const allEditedQuestions: any[] = [];
      for (const section of editedData.sections) {
        for (const question of section.questions) {
          const editedQ: any = {
            index: question.index,
            type: question.type || '',
            typeDesc: question.typeDesc || '',
            stem: question.stem || '',
            answer: question.answer || '',
            analysis: question.analysis || '',
            knowledge: question.knowledge || '',
            difficulty: question.difficulty || '',
            score: question.score || '',
            options: question.options.map((opt) => ({ label: opt.label, text: opt.text })),
            element_list: [], // 清空 element_list，确保 parseQuestion 从直接字段读取编辑后的内容
            contentIds: question.contentIds || [],
            contentGroups: question.contentGroups,
          };
          // 同时写入 snake_case 字段，确保 parseQuestion 能读取
          editedQ.sub_questions = (question.subQuestions || []).map((sub) => ({
            index: sub.index,
            stem: sub.stem || '',
            answer: sub.answer || '',
            analysis: sub.analysis || '',
            options: (sub.options || []).map((opt) => ({ label: opt.label, text: opt.text })),
            element_list: [],
          }));
          editedQ.image_list = question.images || [];
          editedQ.table_list = question.tables || [];
          allEditedQuestions.push(editedQ);
        }
      }

      // 始终将编辑后的 questions 写入 resultJson
      // 这样 formatExamPaper 下次渲染时会优先从 questions 读取，确保编辑结果生效；
      // _edited 标记区分用户编辑保存与后端原始 questions，避免 detail 优先策略覆盖编辑结果
      newResult.questions = allEditedQuestions;
      newResult._edited = true;

      return newResult;
    });
  }, [editedData, result, setResultJson]);

  // 单道题目点击“保存”：退出编辑态并保存
  const handleSaveQuestion = useCallback(
    (key: string) => {
      handleSave();
      setEditingQuestionKey(null);
      message.success('已保存');
    },
    [handleSave],
  );

  // 切换选中其他题目：自动保存当前内容并切换编辑目标
  const handleSelectQuestion = useCallback(
    (key: string) => {
      setEditingQuestionKey((prev) => {
        if (prev && prev !== key) {
          handleSave();
        }
        return key;
      });
    },
    [handleSave],
  );

  const displayData = examPaperMode === 'edit' ? editedData : examData;

  // 渲染完成后触发 MathJax 公式排版
  const { refreshHandle } = useRefreshMath(displayData);
  useLayoutEffect(() => {
    refreshHandle();
  }, [displayData, editingQuestionKey]);

  // 编辑模式下的字段变更
  const handleFieldChange = useCallback(
    (sectionIdx: number, questionIdx: number, field: string, value: any) => {
      setEditedData((prev) => {
        if (!prev) return prev;
        const newData = JSON.parse(JSON.stringify(prev));
        const question = newData.sections[sectionIdx].questions[questionIdx];
        if (field === 'index') {
          question.index = isNaN(Number(value)) ? value : Number(value);
        } else {
          question[field] = value;
        }
        return newData;
      });
    },
    [],
  );

  // 拆分题目：在当前题目之后创建新题目
  const handleSplitQuestion = useCallback(
    (sectionIdx: number, questionIdx: number) => {
      setEditedData((prev) => {
        if (!prev) return prev;
        const newData = JSON.parse(JSON.stringify(prev));
        const section = newData.sections[sectionIdx];
        const currentQuestion = section.questions[questionIdx];
        const stemHtml = currentQuestion.stem || '';

        // 将 HTML 转换为纯文本用于匹配题号
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = stemHtml;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';

        // 查找题干中是否有题号模式（如 "2." "3、" 等），从第二个开始拆分
        const lines = plainText.split('\n');
        let splitCharIndex = -1;
        let charOffset = 0;
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) charOffset += 1; // \n
          if (i >= 1) {
            const match = lines[i].match(QUESTION_INDEX_REGEX);
            if (match) {
              splitCharIndex = charOffset;
              break;
            }
          }
          charOffset += lines[i].length;
        }

        if (splitCharIndex === -1) {
          message.warning('未在题干中找到可拆分的题号，请在题干中输入新题号（如 "2."）后按回车');
          return prev;
        }

        // 对于 HTML 内容，按字符位置拆分
        const firstHalf = stemHtml.substring(0, splitCharIndex).trim();
        const secondHalf = stemHtml.substring(splitCharIndex).trim();

        currentQuestion.stem = firstHalf || '<p></p>';

        const newQuestion: IExamPaperQuestion = {
          index: currentQuestion.index + 1,
          type: currentQuestion.type,
          typeDesc: currentQuestion.typeDesc,
          stem: secondHalf || '<p></p>',
          options: [],
          answer: '',
          analysis: '',
          images: [],
          tables: [],
          subQuestions: [],
          element_list: [],
          contentIds: [],
        };

        // 更新后续题目的题号
        for (let i = questionIdx + 1; i < section.questions.length; i++) {
          section.questions[i].index = (section.questions[i].index || i) + 1;
        }

        section.questions.splice(questionIdx + 1, 0, newQuestion);
        newData.questionCount++;

        message.success('题目已拆分');
        return newData;
      });
    },
    [],
  );

  // 添加选项
  const handleAddOption = useCallback(
    (sectionIdx: number, questionIdx: number) => {
      setEditedData((prev) => {
        if (!prev) return prev;
        const newData = JSON.parse(JSON.stringify(prev));
        const question = newData.sections[sectionIdx].questions[questionIdx];
        const nextLabel = String.fromCharCode(65 + question.options.length); // A, B, C...
        question.options.push({ label: nextLabel, text: '' });
        return newData;
      });
    },
    [],
  );

  // 删除选项
  const handleRemoveOption = useCallback(
    (sectionIdx: number, questionIdx: number, optionIdx: number) => {
      setEditedData((prev) => {
        if (!prev) return prev;
        const newData = JSON.parse(JSON.stringify(prev));
        const question = newData.sections[sectionIdx].questions[questionIdx];
        question.options.splice(optionIdx, 1);
        // 重新计算选项标签
        question.options.forEach((opt: any, idx: number) => {
          opt.label = String.fromCharCode(65 + idx);
        });
        return newData;
      });
    },
    [],
  );

  // 插入图片到题目题干（通过 CKEditor API 插入到光标位置）
  const handleInsertImage = useCallback(
    (sectionIdx: number, questionIdx: number, imgContentId: string) => {
      const imgSrc = getImageSrcFromResult(result, imgContentId);
      if (!imgSrc) {
        message.warning('未找到对应的图片');
        return;
      }
      const editorKey = `${sectionIdx}-${questionIdx}`;
      const editor = editorRegistry.get(editorKey);
      if (editor) {
        // 使用 CKEditor model API 在光标位置插入图片
        editor.model.change((writer: any) => {
          const imgElement = writer.createElement('imageBlock', { src: imgSrc });
          editor.model.insertContent(imgElement, editor.model.document.selection);
        });
        message.success('图片已插入');
      } else {
        // fallback：直接追加到数据中
        setEditedData((prev) => {
          if (!prev) return prev;
          const newData = JSON.parse(JSON.stringify(prev));
          const question = newData.sections[sectionIdx].questions[questionIdx];
          const imgHtml = `<img src="${imgSrc}" style="max-width:100%;max-height:200px" />`;
          question.stem = (question.stem || '') + imgHtml;
          return newData;
        });
        message.success('图片已插入');
      }
    },
    [result, editorRegistry],
  );

  // 监听 Ctrl+S 保存
  useEffect(() => {
    if (examPaperMode !== 'edit') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [examPaperMode, handleSave]);

  // 监听来自 TabBarOperation/FooterButton 的保存事件
  useEffect(() => {
    const handleExamPaperSaveEvent = () => {
      handleSave();
    };
    document.addEventListener('exam-paper-save', handleExamPaperSaveEvent);
    return () => document.removeEventListener('exam-paper-save', handleExamPaperSaveEvent);
  }, [handleSave]);

  // 查看模式下的点击高亮
  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      if (examPaperMode === 'edit') return; // 编辑模式下不触发高亮
      const container = containerRef.current;
      if (!container) return;

      let target = e.target as HTMLElement;
      let activeTarget: HTMLElement | undefined;
      while (target && container.contains(target)) {
        if (target.dataset.contentId) {
          activeTarget = target;
          break;
        }
        target = target.parentElement as HTMLElement;
      }
      if (!activeTarget) {
        // 点击右侧空白处：取消两侧所有选中/编辑态
        clearAllActive(container, styles.active);
        return;
      }

      clearAllActive(container, styles.active);
      activeTarget.classList.add(styles.active);

      const questionDom = activeTarget.closest('[data-question-content-ids]');
      let contentIds: (string | number)[];
      if (questionDom?.getAttribute('data-question-content-ids')) {
        contentIds = questionDom.getAttribute('data-question-content-ids')!.split(',');
      } else {
        contentIds = [activeTarget.dataset.contentId!];
      }

      if (questionDom && questionDom !== activeTarget) {
        questionDom.classList.add(styles.active);
      }

      highlightLeftViewRects(contentIds);
    },
    [examPaperMode],
  );

  if (!displayData) {
    return <Empty description="暂无试卷数据" />;
  }

  const isImagePreview = examPaperMode !== 'edit' && examPaperPreviewFormat === 'image';

  return (
    <div
      className={`${styles.examPaperContainer} ${examPaperMode === 'edit' ? styles.editMode : ''}`}
      ref={containerRef}
      onClick={handleContentClick}
    >
      {/* 试卷标题 */}
      {displayData.title && <h1 className={styles.paperTitle}>{displayData.title}</h1>}
      {displayData.subtitle && <h3 className={styles.paperSubtitle}>{displayData.subtitle}</h3>}

      {/* 试卷信息 */}
      <div className={styles.paperMeta}>
        <span>共 {displayData.sections.length} 大题</span>
        <span className={styles.metaDivider}>|</span>
        <span>共 {displayData.questionCount} 小题</span>
      </div>

      {isImagePreview ? (
        <ExamPaperImageView result={result} data={displayData} isPdf={isPdf} />
      ) : (
        /* 大题列表 */
        <div className={styles.paperSections}>
          {displayData.sections.map((section, idx) => (
            <SectionItem
              key={idx}
              section={section}
              editMode={examPaperMode === 'edit'}
              sectionIdx={idx}
              editingQuestionKey={editingQuestionKey}
              onSelectQuestion={handleSelectQuestion}
              onSaveQuestion={handleSaveQuestion}
              onChange={handleFieldChange}
              onSplit={handleSplitQuestion}
              onInsertImage={handleInsertImage}
              onAddOption={handleAddOption}
              onRemoveOption={handleRemoveOption}
              editorRegistry={editorRegistry}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ExamPaperView;
