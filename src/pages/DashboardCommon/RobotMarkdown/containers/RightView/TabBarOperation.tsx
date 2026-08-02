import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Carousel, Dropdown, Menu, Tooltip } from 'antd';
import classNames from 'classnames';
import { useSelector } from 'dva';
import type { ConnectState } from '@/models/connect';
import { ReactComponent as EditIcon } from '@/assets/layout/edit.svg';
import { ReactComponent as CopyIcon } from '@/assets/layout/copy.svg';
import { ReactComponent as DownloadIcon } from '@/assets/layout/download.svg';
import { ReactComponent as ExportMd } from '@/assets/layout/export-md.svg';
import { ReactComponent as ExportExcel } from '@/assets/layout/export-excel.svg';
import { ReactComponent as ExportTxt } from '@/assets/layout/export-txt.svg';
import { ReactComponent as ExportZip } from '@/assets/layout/export-zip.svg';
import { ReactComponent as TableIcon } from '@/assets/layout/table.svg';
import intfinq from '@/assets/icon/dashbord/intfinq.png';
import github from '@/assets/icon/dashbord/github.svg';
import type { IProps } from './useResultOperations';
import useResultOperations from './useResultOperations';
import { ResultType } from './RightView';
import { storeContainer } from '../../store';
import styles from './index.less';

interface TabBarOperationProps extends IProps {
  tabKey: string;
}

const TabBarOperation = (props: TabBarOperationProps) => {
  const { showCopy, tabKey } = props;

  const [exportLoading, setExportLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tipsProps, setTipsProps] = useState({});

  const delayTimer = useRef<NodeJS.Timeout>();

  const {
    canBatchExport,
    canExport,
    resultExportType,
    resultCopy,
    resultExport,
    saveMarkdown,
    saveLoading,
    copyLoading,
    onExportWord,
    handleEdit,
    switchEditing,
    editable,
    showEdit,
  } = useResultOperations(props);

  const { resultType, resultJson, markdownMode } = storeContainer.useContainer();

  const { Robot } = useSelector((state: ConnectState) => ({
    Robot: state.Robot,
  }));
  const { service } = Robot.info;

  const exportTypes = useMemo(() => {
    let list = [{ text: 'md', key: 'md' }];
    if (resultType === ResultType.md) {
      list = resultExportType;
    } else if (resultType === ResultType.table) {
      list = [{ text: 'Excel', key: resultType }];
    } else if (resultType === ResultType.json) {
      list = [{ text: 'json', key: resultType }];
    } else if (resultType === ResultType.image) {
      list = [{ text: 'zip', key: resultType }];
    } else if (resultType === ResultType.exam_paper) {
      list = [{ text: 'json', key: resultType }];
    }
    const iconMap: Record<string, any> = {
      md: <ExportMd />,
      txt: <ExportTxt />,
      excel: <ExportExcel />,
      md_zip: <ExportZip />,
    };
    return list.map((item) => ({ ...item, icon: iconMap[item.key] || iconMap.txt }));
  }, [resultExportType, resultType]);

  useEffect(() => {
    if (resultType === ResultType.table && resultJson?.excel_base64) {
      setTipsProps({
        color: '#CADAFC',
        title: (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <TableIcon />
            <span style={{ paddingLeft: 8 }}>可导出Excel</span>
          </div>
        ),
        overlayInnerStyle: { color: '#000' },
      });
      setVisible(true);
      delayTimer.current = setTimeout(() => {
        setVisible(false);
      }, 2 * 1000);
    } else {
      setVisible(false);
    }

    return () => {
      if (delayTimer.current) {
        clearTimeout(delayTimer.current);
      }
    };
  }, [resultType]);

  useEffect(() => {
    if (!visible && tipsProps) {
      setTimeout(() => {
        setTipsProps({});
      }, 300);
    }
  }, [visible]);

  const tipStyle = {
    overlayInnerStyle: { borderRadius: 4, padding: '6px 12px' },
    color: '#2B2E33',
  };

  const onExport = async (e: any) => {
    setExportLoading(true);
    try {
      const startTime = Date.now();
      if (e.key === ResultType.doc_base64) {
        await onExportWord();
      } else {
        if (resultType === ResultType.md) {
          await resultExport(e.key);
        } else {
          await resultExport();
        }
      }
    } catch (error) {}
    setExportLoading(false);
  };

  const onVisibleChange = (val: boolean) => {
    if (!val) {
      setVisible(false);
    }
  };

  const onOpenVisible = () => {
    setVisible(true);
    if (delayTimer.current) {
      clearTimeout(delayTimer.current);
    }
  };

  const ads = (
    <Carousel
      className={styles['tab-bar-ads']}
      style={{ width: 160 }}
      dotPosition="right"
      dots={false}
      autoplay
      autoplaySpeed={5000}
    >
      <a href="https://intfinq.textin.com/financial" target="_blank">
        <img src={intfinq} width={18} height={18} />
        知识管理及写作助手
      </a>
      <a href="https://github.com/intsig-textin/chatdoc_stack?tab=readme-ov-file" target="_blank">
        <img src={github} width={18} height={18} />
        TextIn开源知识库
      </a>
      <a href="https://qw01obudp42.feishu.cn/docx/Bt6ZdIW2PohoNuxgsmNcWzyVn8d" target="_blank">
        前端与SDK集成攻略
      </a>
      <a href="https://qw01obudp42.feishu.cn/docx/GmEGdWTb8ozSdkxUiSgcPQi6nJH" target="_blank">
        文档解析必备Tips
      </a>
    </Carousel>
  );

  const disabled = !canBatchExport && !canExport;

  if (tabKey !== 'result') {
    return <div className={styles['tab-bar-extra']}>{ads}</div>;
  }

  return (
    <div className={styles['tab-bar-extra']}>
      {ads}

      {showEdit &&
        (markdownMode === 'view' ? (
          <Button
            type="text"
            className={styles['tab-item']}
            disabled={!editable}
            loading={switchEditing}
            onClick={handleEdit}
          >
            <EditIcon />
          </Button>
        ) : (
          <Button
            loading={saveLoading}
            onClick={saveMarkdown}
            className={classNames(styles['tab-item'], styles['tab-text'])}
            icon={<EditIcon />}
          >
            保存
          </Button>
        ))}

      <Button
        type="text"
        className={styles['tab-item']}
        disabled={!showCopy || disabled}
        onClick={() => {
          resultCopy();
        }}
        loading={copyLoading}
      >
        <CopyIcon />
      </Button>

      {canBatchExport && (
        <Dropdown
          overlay={
            <Menu onClick={onExport} className={styles['menu-box']}>
              {exportTypes.map((item) => (
                <Menu.Item key={item.key}>
                  <div className={styles['menu-item']}>
                    {item.icon}
                    <span>导出{item.text}</span>
                  </div>
                </Menu.Item>
              ))}
            </Menu>
          }
          placement="bottomRight"
          disabled={disabled}
        >
          <Button
            className={classNames(styles['tab-item'], styles['tab-text'])}
            icon={<DownloadIcon />}
            loading={exportLoading}
          >
            批量导出
          </Button>
        </Dropdown>
      )}
      {!canBatchExport && exportTypes.length > 1 && (
        <Dropdown
          overlay={
            <Menu onClick={onExport} className={styles['menu-box']}>
              {exportTypes.map((item) => (
                <Menu.Item key={item.key}>
                  <div className={styles['menu-item']}>
                    {item.icon}
                    <span>导出{item.text}</span>
                  </div>
                </Menu.Item>
              ))}
            </Menu>
          }
          placement="bottomRight"
          disabled={disabled}
        >
          <Button type="text" className={styles['tab-item']} loading={exportLoading}>
            <DownloadIcon />
          </Button>
        </Dropdown>
      )}
      {!canBatchExport && exportTypes.length === 1 && (
        <Tooltip
          {...tipStyle}
          title={`导出${exportTypes[0].text}`}
          onVisibleChange={onVisibleChange}
          visible={canExport ? visible : false}
          placement="bottomRight"
          {...tipsProps}
        >
          <Button
            type="text"
            className={styles['tab-item']}
            disabled={disabled}
            onClick={onExport}
            loading={exportLoading}
            // onMouseEnter={onOpenVisible}
          >
            <DownloadIcon />
          </Button>
        </Tooltip>
      )}
    </div>
  );
};

export default TabBarOperation;
