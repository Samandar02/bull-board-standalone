import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useInstanceStore } from '../../hooks/useInstanceStore';
import { RedisInstanceDTO } from '../../services/Api';
import s from './InstanceSwitcher.module.css';

export const InstanceSwitcher = () => {
  const history = useHistory();
  const api = useApi();
  const queryClient = useQueryClient();
  const { activeInstanceId, activeDb, setActiveInstance } = useInstanceStore();

  const [isOpen, setIsOpen] = useState(false);
  const [instances, setInstances] = useState<RedisInstanceDTO[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getInstances().then((data) => {
      setInstances(data);
      if (activeInstanceId) {
        api.setInstance(activeInstanceId, activeDb);
      }
    });
  }, [activeInstanceId, activeDb]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeInstance = instances.find((i) => i.id === activeInstanceId);

  const handleSelectInstance = (inst: RedisInstanceDTO) => {
    setActiveInstance(inst.id, 0);
    api.setInstance(inst.id, 0);
    queryClient.invalidateQueries();
    setIsOpen(false);
    history.push('/board');
  };

  return (
    <div className={s.switcherContainer} ref={dropdownRef}>
      <button
        type="button"
        className={s.triggerButton}
        onClick={() => setIsOpen(!isOpen)}
        title="Switch Redis Instance"
      >
        <span className={s.dot} />
        <span>{activeInstance ? activeInstance.name : 'Select Redis'}</span>
        <span className={`${s.chevron} ${isOpen ? s.open : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className={s.dropdown}>
          <div className={s.dropdownSection}>
            <div className={s.sectionTitle}>Redis Instances</div>
            <div className={s.instanceList}>
              {instances.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  className={`${s.instanceItem} ${inst.id === activeInstanceId ? s.active : ''}`}
                  onClick={() => handleSelectInstance(inst)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: inst.status === 'online' ? '#10b981' : '#d5433c',
                      }}
                    />
                    {inst.name}
                  </span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.65, fontFamily: 'monospace' }}>
                    {inst.host}:{inst.port}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className={s.dropdownFooter}>
            <span
              className={s.footerLink}
              onClick={() => {
                setIsOpen(false);
                history.push('/');
              }}
            >
              ⚙ Manage Instances
            </span>
            <span
              className={s.footerLink}
              onClick={() => {
                queryClient.invalidateQueries();
                setIsOpen(false);
              }}
            >
              🔄 Refresh Queues
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
