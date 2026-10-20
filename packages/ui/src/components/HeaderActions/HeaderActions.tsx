import cn from 'clsx';
import React, { Suspense } from 'react';
import { useModal } from '../../hooks/useModal';
import { useUIConfig } from '../../hooks/useUIConfig';
import { Button } from '../Button/Button';
import { CustomLinksDropdown } from '../CustomLinksDropdown/CustomLinksDropdown';
import { DatabaseSelector } from '../DatabaseSelector/DatabaseSelector';
import { DocsIcon } from '../Icons/Docs';
import { FullscreenIcon } from '../Icons/Fullscreen';
import { RedisIcon } from '../Icons/Redis';
import { Settings } from '../Icons/Settings';
import { InstanceSwitcher } from '../InstanceSwitcher/InstanceSwitcher';
import buttonStyles from '../Button/Button.module.css';
import s from './HeaderActions.module.css';

type ModalTypes = 'redis' | 'settings';

const RedisStatsModalLazy = React.lazy(() =>
  import('../RedisStatsModal/RedisStatsModal').then(({ RedisStatsModal }) => ({
    default: RedisStatsModal,
  }))
);

const SettingsModalLazy = React.lazy(() =>
  import('../SettingsModal/SettingsModal').then(({ SettingsModal }) => ({
    default: SettingsModal,
  }))
);

const onClickFullScreen = async () => {
  const el = document.documentElement;
  if (!!el && document.fullscreenElement !== el) return await el.requestFullscreen();
  return document.exitFullscreen();
};

import { useLocation, NavLink } from 'react-router-dom';

const DOCS_URL = 'https://felixmosh.github.io/bull-board/';
const DOCS_LABEL = 'Docs';

export const HeaderActions = () => {
  const { miscLinks = [], hideRedisDetails = false, hideDocsLink = false } = useUIConfig();
  const modal = useModal<ModalTypes>();
  const location = useLocation();
  const isInstancesPage = location.pathname === '/' || location.pathname === '/instances';

  return (
    <>
      <ul className={s.actions}>
        <li>
          <InstanceSwitcher />
        </li>
        {!isInstancesPage && (
          <li>
            <DatabaseSelector />
          </li>
        )}
        {!isInstancesPage && (
          <li>
            <NavLink
              to="/"
              title="All Redis Instances"
              className={cn(s.button, buttonStyles.button, buttonStyles.default)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.825rem',
                fontWeight: 600,
                color: 'var(--primary)',
                textDecoration: 'none',
              }}
            >
              🗄️ All Instances
            </NavLink>
          </li>
        )}
        {!hideRedisDetails && (
          <li>
            <Button onClick={() => modal.open('redis')} className={s.button}>
              <RedisIcon />
            </Button>
          </li>
        )}
        {!hideDocsLink && (
          <li>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={DOCS_LABEL}
              title={DOCS_LABEL}
              className={cn(s.button, buttonStyles.button, buttonStyles.default)}
            >
              <DocsIcon />
            </a>
          </li>
        )}
        <li>
          <Button onClick={onClickFullScreen} className={s.button}>
            <FullscreenIcon />
          </Button>
        </li>
        <li>
          <Button onClick={() => modal.open('settings')} className={s.button}>
            <Settings />
          </Button>
        </li>
        {miscLinks.length > 0 && (
          <li>
            <CustomLinksDropdown options={miscLinks} className={s.button} />
          </li>
        )}
      </ul>
      <Suspense fallback={null}>
        {!hideRedisDetails && modal.isMounted('redis') && (
          <RedisStatsModalLazy open={modal.isOpen('redis')} onClose={modal.close('redis')} />
        )}
        {modal.isMounted('settings') && (
          <SettingsModalLazy open={modal.isOpen('settings')} onClose={modal.close('settings')} />
        )}
      </Suspense>
    </>
  );
};
