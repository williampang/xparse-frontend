import type { FC } from 'react';
import classNames from 'classnames';
import type { IFileItem } from '../../data';
import FooterButton from './FooterButton';
import { ResultType } from './RightView';
import RightView from './RightView';
import { storeContainer } from '../../store';
import styles from './index.less';

interface IProps {
  markdown?: boolean;
  current: IFileItem;
  titleName: string;
  // 左侧批量选中的列表
  currentChoosenList: any;
  onTabChange?: (type: ResultType, subType?: ResultType) => void;
  resultJson: any;
  service: string;
  disableEdit?: boolean;
  onOpenSurvey?: () => void;
}

export const RobotRightView: FC<IProps> = ({
  current,
  titleName,
  currentChoosenList,
  onTabChange,
  children,
  // component,
  resultJson,
  service,
  markdown,
  disableEdit,
  onOpenSurvey,
}) => {
  const { type, resultType } = storeContainer.useContainer();
  const operationProps = {
    current,
    titleName,
    currentChoosenList,
    currentTab: resultType,
    service,
    markdown,
    showCopy: [ResultType.md, ResultType.json].includes(resultType),
    showEdit: [ResultType.md].includes(resultType) && !disableEdit,
    onOpenSurvey: onOpenSurvey,
  };

  return (
    <RightView
      onTabChange={onTabChange}
      result={resultJson}
      fileType={current.fileType}
      wrapperClassName={classNames('rightViewWrapper', 'result-struct-right-wrapper', {
        [styles['new-right-view']]: type === 'new',
      })}
      renderFooter={() => {
        if (type === 'new') return null;
        return <FooterButton {...operationProps} />;
      }}
      operationProps={operationProps}
    >
      {children}
    </RightView>
  );
};

export default RobotRightView;
