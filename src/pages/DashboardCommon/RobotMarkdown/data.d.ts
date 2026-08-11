import type { IFile } from '@/pages/DashboardCommon/components/RobotLeftView/data';

export interface IFileItem extends IFile {
  cloudOcr?: boolean; // 是否云识别
  cloudStatus?: 0 | 1 | 2 | 3; // 0:未识别 1:识别中 2:识别成功 3:识别失败
  time?: string;
  id: number;
  result?: any;
  utime?: string;
  [key: string]: any;
}

export interface IImgResult {
  image_angle?: string;
  item_list?: IItemList[];
  rotated_image_height?: string;
  rotated_image_width?: any;
  table_list?: [];
  type?: string;
  type_description?: boolean;
  details?: any;
  [key: string]: any;
}

export interface IItemList {
  uid: string;
  key: string;
  value: string;
  position?: number[];
  description: string;
  active: boolean;
  confidence?: number;
  type: 'img' | 'text' | string;
  number?: string;
  points?: number[];
  image?: string;
  [key: string]: any;
}
export interface DetailsItem {
  value: string;
  position: number[];
  image?: string;
  description?: string;
}
export type DetailsItemValue = DetailsItem | DetailsItem[];
export type DetailList = {
  key: string;
  lines: DetailsItemValue;
};
export enum KeyTypeEnum {
  ITEM_LIST = 'item_list',
  DETAILS = 'details',
}

export interface IRectListItem {
  uid: string;
  points: number[];
  value?: string;
  [index: string]: any;
}

export const QuestionTypeDesc: Record<string, any> = {
  0: '选择题',
  1: '填空题',
  2: '阅读理解（阅读+问答选择）',
  3: '完型填空（阅读+选择）',
  4: '阅读填空（阅读+填空）',
  5: '问答题',
  6: '选择题，多选多',
  7: '填空、选择题混合',
  8: '应用题',
  9: '判断题',
  10: '作图题',
  11: '材料题',
  12: '计算题',
  13: '连线题',
  14: '作文题',
  15: '解答题',
  16: '其他',
  17: '图',
  18: '表格',
};

export const QuestionCategoryDesc: Record<string, any> = {
  0: '题干',
  1: '选项',
  2: '解析',
  3: '答案',
  stem: '题干',
  option: '选项',
  analysis: '解析',
  answer: '答案',
  other: '其他',
};

/** 试卷结构相关类型 */
export interface IExamPaperOption {
  label: string; // 选项标签，如 A、B、C、D
  text: string; // 选项内容
  contentId?: number | string; // 对应 detail 数组索引，用于定位左侧视图
  contentIds?: (number | string)[]; // 该选项对应的所有 detail 块索引
}

/** 题目各部分对应的 detail 块分组（用于图片预览按选项等独立裁剪） */
export interface IExamPaperContentGroups {
  stem: (number | string)[]; // 题干（含题图、表格等）
  options: IExamPaperOption[]; // 各选项（带 contentIds）
  answer: (number | string)[]; // 答案
  analysis: (number | string)[]; // 解析
  knowledge?: (number | string)[]; // 知识点
  difficulty?: (number | string)[]; // 难度
  score?: (number | string)[]; // 分值
}

export interface IExamPaperQuestion {
  index: number; // 题号
  type: number | string; // 题目类型
  typeDesc: string; // 题目类型描述
  stem: string; // 题干内容
  options: IExamPaperOption[]; // 选项列表（选择题）
  answer: string; // 答案
  analysis: string; // 解析
  knowledge?: string; // 知识点
  difficulty?: string; // 难度
  score?: string; // 分值
  images: string[]; // 题目图片
  tables: any[]; // 题目表格
  subQuestions: IExamPaperQuestion[]; // 子题目（阅读理解等）
  element_list: any[]; // 原始元素列表
  contentIds: (number | string)[]; // 该题目对应的所有 detail 块索引
  contentGroups?: IExamPaperContentGroups; // 各部分 detail 块分组（可选）
}

export interface IExamPaperSection {
  name: string; // 大题名称，如"一、选择题"
  questionType: number | string; // 大题题型
  questionTypeDesc: string; // 题型描述
  questions: IExamPaperQuestion[]; // 小题列表
  contentId?: number | string; // 大题标题对应的 detail 块索引
}

export interface IExamPaperData {
  title: string; // 试卷标题
  subtitle: string; // 副标题
  sections: IExamPaperSection[]; // 大题列表
  questionCount: number; // 总题数
}
