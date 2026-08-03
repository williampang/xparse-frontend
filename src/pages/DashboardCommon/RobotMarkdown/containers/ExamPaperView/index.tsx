import React, { useCallback, useMemo, useRef } from 'react';
import { Tag, Empty } from 'antd';
import { scrollIntoViewIfNeeded } from '@/utils/dom';
import type { IExamPaperData, IExamPaperQuestion, IExamPaperSection } from '../../data.d';
import { formatExamPaper } from '../../utils';
import MarkdownRender from '../../MarkdownRender/MarkdownRender';
import styles from './index.less';

interface IProps {
  result: any;
}

/** 渲染单个题目 */
const QuestionItem: React.FC<{ question: IExamPaperQuestion; showIndex?: boolean }> = ({
  question,
  showIndex = true,
}) => {
  const hasOptions = question.options.length > 0;
  const questionContentId = question.contentIds.length > 0 ? question.contentIds[0] : undefined;

  return (
    <div
      className={styles.questionItem}
      data-question-content-ids={question.contentIds.join(',')}
      data-content-id={questionContentId}
    >
      {/* 题号 + 题型标签 */}
      <div className={styles.questionHeader}>
        {showIndex && <span className={styles.questionIndex}>{question.index}.</span>}
        <Tag color="blue" className={styles.questionTypeTag}>
          {question.typeDesc}
        </Tag>
      </div>

      {/* 题干 */}
      {question.stem && (
        <div className={styles.questionStem} data-content-id={questionContentId}>
          <MarkdownRender content={question.stem} />
        </div>
      )}

      {/* 试题图片 */}
      {question.images.length > 0 && (
        <div className={styles.questionImages}>
          {question.images.map((img, idx) => (
            <img key={idx} src={img} className={styles.questionImg} alt={`题图${idx + 1}`} />
          ))}
        </div>
      )}

      {/* 试题表格 */}
      {question.tables.length > 0 && (
        <div className={styles.questionTables}>
          {question.tables.map((tbl, idx) => {
            const html = typeof tbl === 'string' ? tbl : tbl?.text || '';
            if (!html) return null;
            return (
              <div
                key={idx}
                className={styles.questionTableWrapper}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          })}
        </div>
      )}

      {/* 选项（选择题） */}
      {hasOptions && (
        <div className={styles.questionOptions}>
          {question.options.map((opt) => (
            <div
              key={opt.label}
              className={styles.optionItem}
              data-content-id={opt.contentId}
            >
              <span className={styles.optionLabel}>{opt.label}.</span>
              <span className={styles.optionText}>
                <MarkdownRender content={opt.text} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 答案 */}
      {question.answer && (
        <div className={styles.questionAnswer}>
          <span className={styles.answerLabel}>【答案】</span>
          <MarkdownRender content={question.answer} />
        </div>
      )}

      {/* 解析 */}
      {question.analysis && (
        <div className={styles.questionAnalysis}>
          <span className={styles.analysisLabel}>【解析】</span>
          <MarkdownRender content={question.analysis} />
        </div>
      )}

      {/* 子题目（阅读理解等） */}
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
const SectionItem: React.FC<{ section: IExamPaperSection }> = ({ section }) => {
  return (
    <div className={styles.sectionItem}>
      <div className={styles.sectionHeader} data-content-id={section.contentId}>
        <span className={styles.sectionName}>{section.name}</span>
        <Tag className={styles.sectionCount}>共 {section.questions.length} 题</Tag>
      </div>
      <div className={styles.sectionQuestions}>
        {section.questions.map((q, idx) => (
          <QuestionItem key={idx} question={q} />
        ))}
      </div>
    </div>
  );
};

/** 清除所有高亮状态 */
const clearAllActive = (container: HTMLElement) => {
  // 清除右侧面板高亮
  const oldActiveDoms = container.querySelectorAll(`[data-content-id].${styles.active}`);
  oldActiveDoms.forEach((item) => item.classList.remove(styles.active));
  // 清除左侧视图 polygon 高亮
  const oldActivePolygons = document.querySelectorAll('#imgContainer polygon.active');
  oldActivePolygons.forEach((item) => item.classList.remove('active'));
  // 清除表格单元格高亮
  const oldCellPaths = document.querySelectorAll('#imgContainer .cell-g-wrapper path.active');
  oldCellPaths.forEach((item) => item.classList.remove('active'));
};

/** 高亮左侧视图对应的 polygon */
const highlightLeftViewRects = (contentIds: (string | number)[]) => {
  const viewerContainer = document.querySelector<HTMLElement>('#imgContainer');
  if (!viewerContainer || contentIds.length === 0) return;

  const idSelector = contentIds.map((id) => `polygon[data-content-id="${id}"]`).join(',');

  let count = 0;
  const handle = () => {
    const targetPolygons = viewerContainer.querySelectorAll<HTMLElement>(idSelector);
    if (targetPolygons.length > 0) {
      targetPolygons.forEach((item) => item.classList.add('active'));
      // 滚动左侧视图到目标位置
      const firstPolygon = targetPolygons[0];
      const pageDom = firstPolygon.closest('[data-page-number]') as HTMLElement;
      if (pageDom) {
        scrollIntoViewIfNeeded(pageDom, viewerContainer, { block: 'nearest', inline: 'nearest' });
      }
      // 精确滚动到 polygon 位置
      scrollIntoViewIfNeeded(firstPolygon, viewerContainer, {
        block: 'nearest',
        inline: 'nearest',
      });
      return true;
    }
    return false;
  };

  // 如果左侧视图使用了虚拟化，目标页面可能还未渲染，需要重试
  if (!handle()) {
    const timer = setInterval(() => {
      count++;
      if (handle() || count >= 30) {
        clearInterval(timer);
      }
    }, 100);
  }
};

/** 试卷结构视图 */
const ExamPaperView: React.FC<IProps> = ({ result }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const examData: IExamPaperData | null = useMemo(() => {
    return formatExamPaper(result);
  }, [result]);

  /** 点击内容块，高亮左侧视图对应区域 */
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;

    // 向上查找最近的带 data-content-id 的元素
    let target = e.target as HTMLElement;
    let activeTarget: HTMLElement | undefined;
    while (target && container.contains(target)) {
      if (target.dataset.contentId) {
        activeTarget = target;
        break;
      }
      target = target.parentElement as HTMLElement;
    }
    if (!activeTarget) return;

    // 清除旧的高亮
    clearAllActive(container);

    // 高亮当前点击的元素
    activeTarget.classList.add(styles.active);

    // 获取该题目的所有 contentIds，高亮左侧所有对应的 polygon
    const questionDom = activeTarget.closest('[data-question-content-ids]');
    let contentIds: (string | number)[];
    if (questionDom?.getAttribute('data-question-content-ids')) {
      contentIds = questionDom.getAttribute('data-question-content-ids')!.split(',');
    } else {
      contentIds = [activeTarget.dataset.contentId!];
    }

    // 同时高亮题目容器
    if (questionDom && questionDom !== activeTarget) {
      questionDom.classList.add(styles.active);
    }

    highlightLeftViewRects(contentIds);
  }, []);

  if (!examData) {
    return <Empty description="暂无试卷数据" />;
  }

  return (
    <div className={styles.examPaperContainer} ref={containerRef} onClick={handleContentClick}>
      {/* 试卷标题 */}
      {examData.title && <h1 className={styles.paperTitle}>{examData.title}</h1>}
      {examData.subtitle && <h3 className={styles.paperSubtitle}>{examData.subtitle}</h3>}

      {/* 试卷信息 */}
      <div className={styles.paperMeta}>
        <span>共 {examData.sections.length} 大题</span>
        <span className={styles.metaDivider}>|</span>
        <span>共 {examData.questionCount} 小题</span>
      </div>

      {/* 大题列表 */}
      <div className={styles.paperSections}>
        {examData.sections.map((section, idx) => (
          <SectionItem key={idx} section={section} />
        ))}
      </div>
    </div>
  );
};

export default ExamPaperView;
