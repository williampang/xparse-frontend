import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import '@ckeditor/ckeditor5-build-classic/build/translations/zh-cn.js';
import { useRef, useCallback } from 'react';
import { Input } from 'antd';
import styles from './index.less';

interface IProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 外部获取 editor 实例，用于插入图片等 */
  onEditorReady?: (editor: any) => void;
  minHeight?: number;
}

/** 将纯文本转换为 HTML */
export const textToHtml = (text: string): string => {
  if (!text) return '';
  // 如果已经是 HTML（包含标签），直接返回
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  // 纯文本：按换行分段
  return text
    .split('\n')
    .map((line) => `<p>${line || '<br>'}</p>`)
    .join('');
};

/** 检测内容是否包含 LaTeX 公式（$...$） */
const containsLatex = (html: string): boolean => {
  if (!html) return false;
  // 匹配 $...$ 模式（排除 $$...$$ 块公式也一并保护）
  return /\$[^$\n]+\$/s.test(html);
};

/** 从 HTML 中提取纯文本（用于 textarea 编辑） */
const htmlToPlainText = (html: string): string => {
  if (!html) return '';
  // 如果不是 HTML，直接返回
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  // 简单提取：替换 <br>、</p><p> 为换行，去除其他标签
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
};

/**
 * 试卷编辑富文本编辑器
 * 基于 CKEditor Classic Build，提供基础排版和格式功能
 * 当内容包含 LaTeX 公式（$...$）时，自动切换为 textarea 以保护公式语法不被 CKEditor 破坏
 */
const ExamPaperRichEditor: React.FC<IProps> = ({
  value,
  onChange,
  placeholder,
  onEditorReady,
  minHeight = 80,
}) => {
  const editorRef = useRef<any>(null);
  const hasLatex = containsLatex(value);

  const handleReady = useCallback(
    (editor: any) => {
      editorRef.current = editor;
      onEditorReady?.(editor);

      // 设置 placeholder
      if (placeholder) {
        const editable = editor.editing.view.document.getRoot();
        editor.editing.view.change((writer: any) => {
          writer.setAttribute('data-placeholder', placeholder, editable!);
        });
      }
    },
    [placeholder, onEditorReady],
  );

  const handleChange = useCallback(
    (_event: any, editor: any) => {
      const data = editor.getData();
      onChange(data);
    },
    [onChange],
  );

  // 含 LaTeX 公式：使用 textarea 保护原始语法
  if (hasLatex) {
    const plainText = htmlToPlainText(value);
    return (
      <div className={styles.latexEditorWrapper} style={{ '--editor-min-height': `${minHeight}px` } as React.CSSProperties}>
        <Input.TextArea
          className={styles.latexTextArea}
          value={plainText}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoSize={{ minRows: 2, maxRows: 12 }}
        />
        <div className={styles.latexHint}>公式编辑模式（LaTeX 语法保护）</div>
      </div>
    );
  }

  // 不含公式：使用 CKEditor 富文本编辑
  return (
    <div className={styles.richEditorWrapper} style={{ '--editor-min-height': `${minHeight}px` } as React.CSSProperties}>
      <CKEditor
        editor={ClassicEditor as any}
        data={value}
        config={{
          language: 'zh-cn',
          toolbar: {
            items: [
              'heading',
              '|',
              'bold',
              'italic',
              'underline',
              '|',
              'bulletedList',
              'numberedList',
              '|',
              'insertTable',
              'blockQuote',
              '|',
              'undo',
              'redo',
            ],
            shouldNotGroupWhenFull: false,
          },
          table: {
            contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
          },
          placeholder,
        }}
        onReady={handleReady}
        onChange={handleChange}
      />
    </div>
  );
};

export default ExamPaperRichEditor;
