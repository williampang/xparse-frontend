import { useSelector } from 'dva';
import { history } from 'umi';
import { Button, Tooltip } from 'antd';
import classNames from 'classnames';
import type { ConnectState } from '@/models/connect';
import useUploadFormat from '@/pages/DashboardCommon/components/RobotLeftView/store/useUploadFormat';
import RecognizeParamsSettings from '@/pages/DashboardCommon/components/RecognizeParamsSettings';
import RobotTour from '@/pages/DashboardCommon/components/RobotGuide/RobotTour';
import logo from '@/assets/logo-graph@2x.png';
import { ReactComponent as CollapseIcon } from '@/assets/layout/collapse.svg';
import type { IProps } from '.';
import FileContainer from '../FileContainer';
import styles from './index.less';

const Container = (props: IProps) => {
  const { showSettings } = props;

  const { Robot } = useSelector((state: ConnectState) => ({
    Robot: state.Robot,
  }));

  const { collapsed, setCollapsed } = useUploadFormat.useContainer();

  const onCollapsedHandle = () => {
    setCollapsed((pre) => !pre);
  };

  return (
    <div
      className={classNames(styles['left-container'], { [styles['collapsed-slide']]: collapsed })}
    >
      <Tooltip
        placement="right"
        title={`${collapsed ? '展开' : '折叠'}边栏`}
        overlayInnerStyle={{ borderRadius: 4, padding: '6px 12px' }}
        color="#2B2E33"
      >
        <div className={styles['collapse-btn']} onClick={onCollapsedHandle}>
          <CollapseIcon />
        </div>
      </Tooltip>

      <div className={styles['logo-header']}>
        <img
          src={logo}
          width={30}
          height={30}
          onClick={() => history.push('/dashboard/overview')}
        />
        <span className={styles['robot-name']}>怀宇慧阅</span>
      </div>
      <div className={styles['operation-btn']}>
        {showSettings && (
          <div className={styles['btn-item']}>
            <RecognizeParamsSettings currentFile={props.currentFile} inline />
            <RobotTour showSettings={showSettings} />
          </div>
        )}
      </div>

      <FileContainer {...props} className={styles['files-container']} />
    </div>
  );
};

export default Container;
