import React, { useMemo } from 'react';
import { Tag, Collapse, Empty } from 'antd';
import type { IExamPaperData, IExamPaperQuestion, IExamPaperSection } from '../../data.d';
import { formatExamPaper } from '../../utils';
import MarkdownRender from '../../MarkdownRender/MarkdownRender';
import styles from './index.less';

const { Panel } = Collapse;

interface IProps {
  result: any;
}

/** 渲染单个题目 */
const QuestionItem: React.FC<{ question: IExamPaperQuestion; showIndex?: boolean }> = ({
  question,
  showIndex = true,
}) => {
  const hasOptions = question.options.length > 0;

  return (
    <div className={styles.questionItem}>
      {/* 题号 + 题型标签 */}
      <div className={styles.questionHeader}>
        {showIndex && <span className={styles.questionIndex}>{question.index}.</span>}
        <Tag color="blue" className={styles.questionTypeTag}>
          {question.typeDesc}
        </Tag>
      </div>

      {/* 题干 */}
      {question.stem && (
        <div className={styles.questionStem}>
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

      {/* 选项（选择题） */}
      {hasOptions && (
        <div className={styles.questionOptions}>
          {question.options.map((opt) => (
            <div key={opt.label} className={styles.optionItem}>
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
      <div className={styles.sectionHeader}>
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

/** 试卷结构视图 */
const ExamPaperView: React.FC<IProps> = ({ result }) => {
  const examData: IExamPaperData | null = useMemo(() => {
    return formatExamPaper(result);
  }, [result]);

  if (!examData) {
    return <Empty description="暂无试卷数据" />;
  }

  return (
    <div className={styles.examPaperContainer}>
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
