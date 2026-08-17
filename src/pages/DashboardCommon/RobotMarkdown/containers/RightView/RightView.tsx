import classNames from 'classnames';
import type { FC, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Radio, Tooltip, Switch, Tabs, Row, Badge } from 'antd';
import ReactJson from 'react-json-view';
import { connect } from 'umi';
import type { ConnectState } from '@/models/connect';
import markdownSwitchOld from '@/assets/images/markdown_switch_old.png';
import markdownSwitchNew from '@/assets/images/markdown_switch_new.png';
import Loading, { DotsLoading } from '@/components/Loading';
import styles from './index.less';
import { storeContainer } from '../../store';
// import { ReactComponent as ParagraphIcon } from '@/assets/layout/paragraph.svg';
import { ReactComponent as TableIcon } from '@/assets/layout/table.svg';
import { ReactComponent as ImageIcon } from '@/assets/layout/image.svg';
import { ReactComponent as FormulaIcon } from '@/assets/layout/formula.svg';
import { ReactComponent as HandwritingIcon } from '@/assets/layout/handwriting.svg';
import { ReactComponent as HeaderFooterIcon } from '@/assets/layout/header_footer.svg';
import AllIcon from '@/assets/images/pic_bg@2x.png';
import StampIcon from '@/assets/images/pic_seal@2x.png';
import QrcodeIcon from '@/assets/images/pic_QRcode@2x.png';
import BarcodeIcon from '@/assets/images/pic_barcode@2x.png';
import TabBarOperation from './TabBarOperation';
import ExamPaperView from '../ExamPaperView';
import { ensureArray } from '@/utils/objectUtils';
import { useImageTips } from '../../hooks/useImageTips';
import { isEmpty } from '@/utils/objectUtils';

enum ResultType {
  json = 'json',
  md = 'md',
  table = 'table',
  image = 'image',
  stamp = 'stamp',
  qrcode = 'qrcode',
  barcode = 'barcode',
  formula = 'formula',
  handwriting = 'handwriting',
  header_footer = 'header_footer',
  doc_base64 = 'docx',
  question = 'question',
  exam_paper = 'exam_paper',
  all = 'all',
}

const IconMap: Record<string, ReactNode> = {
  [ResultType.table]: <TableIcon />,
  [ResultType.image]: <ImageIcon />,
  [ResultType.formula]: <FormulaIcon />,
  [ResultType.handwriting]: <HandwritingIcon />,
  [ResultType.header_footer]: <HeaderFooterIcon />,
};

const SubTypeIconMap: Record<string, any> = {
  [ResultType.all]: AllIcon,
  [ResultType.stamp]: StampIcon,
  [ResultType.qrcode]: QrcodeIcon,
  [ResultType.barcode]: BarcodeIcon,
};

export { ResultType };

export const resultScrollerClass = 'result-content-body';

interface IProps {
  renderFooter: (curType: ResultType) => ReactNode;
  onTabChange?: (curType: ResultType, subType?: ResultType) => void;
  resultTabName?: string;
  wrapperClassName?: string;
  result: any;
  fileType?: string;
  Common: ConnectState['Common'];
  Robot: ConnectState['Robot'];
  children?: any;
  operationProps: any;
}

const tabMap: Record<string, any> = {
  [ResultType.md]: 'Markdown',
  [ResultType.table]: '表格',
  [ResultType.image]: '图片',
  [ResultType.stamp]: '印章',
  [ResultType.qrcode]: '二维码',
  [ResultType.barcode]: '条形码',
  [ResultType.formula]: '公式',
  [ResultType.json]: 'JSON',
  [ResultType.handwriting]: '手写',
  [ResultType.header_footer]: '页眉页脚',
  [ResultType.question]: '切题',
  [ResultType.exam_paper]: '试卷',
  [ResultType.all]: '全部',
};
const RightContainer: FC<IProps> = ({
  operationProps,
  renderFooter,
  onTabChange,
  children,
  wrapperClassName,
  result,
  fileType,
  Common,
  Robot,
}) => {
  const { resultLoading } = Common;
  const [tabKey, setTabKey] = useState('result');

  const {
    type,
    resultType,
    setResultType,
    subType,
    setSubType,
    currentFile,
    rawResultJson,
    showModifiedMarkdown,
    setShowModifiedMarkdown,
    markdownMode,
    showAutoSave,
    autoSaveMarkdown,
    setAutoSaveMarkdown,
    resultJsonSaveLoading,
    resultScrollerRef,
  } = storeContainer.useContainer();

  const { showImageDot, setShowImageDot, imageTipVisible, setImageTipVisible, hasSubImages } =
    useImageTips(currentFile);

  // 试卷采用单题编辑/保存模式，不展示自动保存开关
  const showAutoSaveSwitch = resultType === ResultType.md && showAutoSave;

  const options = useMemo(() => {
    const list = [
      ResultType.md,
      ResultType.exam_paper,
      ResultType.table,
      ResultType.formula,
      ResultType.image,
      ResultType.handwriting,
      ResultType.header_footer,
      ResultType.json,
    ];
    if (type === 'new') {
      const json = list.pop();
      list.splice(2, 0, json as ResultType);
    }
    if (!isEmpty(result?.questions) || result?.with_questions) {
      list.splice(0, 0, ResultType.question);
    }
    return list.map((item) => ({
      label: tabMap[item],
      value: item,
      className: item,
      icon: type === 'new' ? IconMap[item] : undefined,
    }));
  }, [result]);

  const subOptions = useMemo(() => {
    const subTypeMap: Record<string, ResultType[]> = {
      [ResultType.image]: [ResultType.all, ResultType.stamp, ResultType.qrcode, ResultType.barcode],
    };
    return subTypeMap[resultType]?.map((item) => ({
      label: tabMap[item],
      value: item === ResultType.all ? undefined : item,
      className: item,
      icon: SubTypeIconMap[item],
    }));
  }, [resultType]);

  const showMarkdownSwitcher = useMemo(() => {
    return resultType === ResultType.md && result?.detail_new && markdownMode === 'view';
  }, [result, resultType, markdownMode]);

  useEffect(() => {
    setTabKey('result');
  }, [currentFile?.id, currentFile?.status]);

  const changeTab = (type: any) => {
    setResultType(type);
    if (onTabChange) {
      onTabChange(type);
    }
    if (type === ResultType.image) {
      setImageTipVisible(false);
      setShowImageDot(false);
    }
  };

  const handleChangeTab = (e: any) => {
    const type = e.target.value;
    setSubType(undefined);
    changeTab(type);
  };

  const changeSubType = (type?: ResultType) => {
    setSubType(type);
    if (onTabChange) {
      onTabChange(resultType, type);
    }
  };

  const tabBarExtraContent =
    type === 'new' ? <TabBarOperation {...operationProps} tabKey={tabKey} /> : null;

  const subTypeTabs = useMemo(() => {
    if (!subOptions) return null;

    const allContents = ensureArray(currentFile?.result?.detail).filter(
      (item: any) => item.type === resultType,
    );
    return (
      <div className={styles.subTabWrapper}>
        {subOptions.map((item) => {
          const isActive = subType === item.value;

          const count = item.value
            ? allContents.filter((content: any) => content.sub_type === item.value).length
            : allContents.length;
          return (
            <div
              key={item.value}
              onClick={() => changeSubType(item.value)}
              className={classNames(styles.subTab, isActive && styles.active)}
            >
              <Row className={styles.subTabLabelRow}>
                <div className={styles.subTabLabel}>{item.label}</div>
                <div className={styles.count}>{count || 0}</div>
              </Row>
              <img className={styles.icon} src={item.icon} />
            </div>
          );
        })}
      </div>
    );
  }, [resultType, subType, subOptions, currentFile?.result?.detail]);

  const renderContent = () => {
    if (resultLoading) {
      return (
        <div className={styles.contentWrapper}>
          <Loading type="normal" />
        </div>
      );
    }
    if (resultType === ResultType.json) {
      return (
        <div className={classNames(styles.contentWrapper, styles.jsonViewWrapper)}>
          <ReactJson
            src={rawResultJson}
            enableClipboard={false}
            onEdit={false}
            name={null}
            collapsed={3}
            onAdd={false}
            style={{
              fontFamily: 'Monaco, Menlo, Consolas, monospace',
              color: '#9b0c79',
            }}
            displayDataTypes={false}
            displayObjectSize={false}
            collapseStringsAfterLength={1000}
          />
        </div>
      );
    }
    if (resultType === ResultType.exam_paper) {
      return (
        <div
          ref={resultScrollerRef}
          className={classNames(styles.contentWrapper, resultScrollerClass)}
        >
          <ExamPaperView result={rawResultJson} isPdf={fileType === 'PDF'} />
        </div>
      );
    }
    return (
      <div
        ref={resultScrollerRef}
        className={classNames(styles.contentWrapper, resultScrollerClass)}
      >
        {children}
      </div>
    );
  };

  return (
    <div
      id="robotRightViewContainer"
      className={classNames(wrapperClassName, styles.rightContainer)}
    >
      <Tabs
        key={`${currentFile?.id}`}
        style={{ height: '100%' }}
        tabBarExtraContent={tabBarExtraContent}
        activeKey={tabKey}
        onChange={setTabKey}
      >
        <Tabs.TabPane style={{ height: '100%' }} tab="解析结果" key="result">
          <div
            style={{ height: '100%' }}
            className={classNames('robotResultTabContainer', 'tour_step_2', styles.resultContainer)}
          >
            <div
              className={styles.header}
              style={{ marginBottom: result?.detail_new && resultType === ResultType.md ? 15 : 0 }}
            >
              <Radio.Group
                className={styles.radioBtnGroup}
                value={resultType}
                optionType="button"
                buttonStyle="solid"
                onChange={handleChangeTab}
              >
                {options.map((item) => {
                  return item.value === ResultType.image ? (
                    <Tooltip
                      key={item.value}
                      visible={imageTipVisible}
                      overlayInnerStyle={{ borderRadius: 4, padding: '6px 12px', color: '#000' }}
                      color="#CADAFC"
                      title="文件含印章/二维码/条形码等图片类型，点击查看"
                    >
                      <Radio.Button value={item.value} className={item.className}>
                        <div className="radio-content">
                          {item.icon}
                          <span>
                            <Badge dot={showImageDot} offset={[2, 0]}>
                              {item.label}
                            </Badge>
                          </span>
                        </div>
                      </Radio.Button>
                    </Tooltip>
                  ) : (
                    <Radio.Button key={item.value} value={item.value} className={item.className}>
                      <div className="radio-content">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                    </Radio.Button>
                  );
                })}
              </Radio.Group>
              <div className={styles['edit-btn-wrapper']}>
                {showMarkdownSwitcher && (
                  <Tooltip
                    title={showModifiedMarkdown ? '展示原始识别结果' : '展示最新修改结果'}
                    placement="topRight"
                  >
                    <img
                      className={styles.markdownSwitch}
                      src={showModifiedMarkdown ? markdownSwitchNew : markdownSwitchOld}
                      onClick={() => {
                        setShowModifiedMarkdown(!showModifiedMarkdown);
                      }}
                    />
                  </Tooltip>
                )}
                {showAutoSaveSwitch && (
                  <div className={styles.autoSave}>
                    <div>
                      {resultJsonSaveLoading ? (
                        <span>
                          保存中
                          <DotsLoading />
                        </span>
                      ) : (
                        '自动保存'
                      )}
                    </div>
                    <div style={{ width: 8 }} />
                    <Switch
                      checked={autoSaveMarkdown}
                      onChange={(value) => setAutoSaveMarkdown(value)}
                    />
                  </div>
                )}
              </div>
            </div>
            {subTypeTabs}
            {renderContent()}
            {renderFooter(resultType)}
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default connect((state: ConnectState) => state)(RightContainer);
