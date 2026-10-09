import { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { Button } from '../../components/Button/Button';
import { RedisIcon } from '../../components/Icons/Redis';
import { useApi } from '../../hooks/useApi';
import { useInstanceStore } from '../../hooks/useInstanceStore';
import { RedisInstanceDTO } from '../../services/Api';
import { InstanceModal } from './InstanceModal';
import s from './InstancesPage.module.css';

export const InstancesPage = () => {
  const history = useHistory();
  const api = useApi();
  const { setActiveInstance, setInstances: saveToStore } = useInstanceStore();

  const [instances, setInstances] = useState<RedisInstanceDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<RedisInstanceDTO | null>(null);

  const fetchInstances = async () => {
    setIsLoading(true);
    try {
      const data = await api.getInstances();
      setInstances(data);
      saveToStore(data);
    } catch (err) {
      console.error('Failed to load instances', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, []);

  const handleConnect = (instance: RedisInstanceDTO) => {
    setActiveInstance(instance.id, instance.db || 0);
    api.setInstance(instance.id, instance.db || 0);
    history.push('/board');
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await api.deleteInstance(id);
      fetchInstances();
    } catch (err) {
      console.error('Failed to delete instance', err);
    }
  };

  const handleTest = async (inst: RedisInstanceDTO) => {
    try {
      const res = await api.testConnection({
        host: inst.host,
        port: inst.port,
        username: inst.username,
        db: inst.db,
        tls: inst.tls,
      });
      alert(
        res.success
          ? `✓ Connection successful! Latency: ${res.latencyMs}ms, Redis v${res.version || 'unknown'}`
          : `✕ Connection failed: ${res.error}`
      );
      fetchInstances();
    } catch (err: any) {
      alert(`✕ Connection error: ${err.message}`);
    }
  };

  const filteredInstances = instances.filter(
    (inst) =>
      inst.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.host.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onlineCount = instances.filter((i) => i.status === 'online').length;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.titleArea}>
          <h1>
            <RedisIcon /> Redis Instances Manager
          </h1>
          <p className={s.subtitle}>
            Connect to and inspect Bull & BullMQ queues across multiple Redis servers and databases
          </p>
        </div>

        <div className={s.headerControls}>
          <input
            className={s.searchInput}
            placeholder="Search instances..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            theme="primary"
            onClick={() => {
              setEditingInstance(null);
              setModalOpen(true);
            }}
          >
            + Add Redis Instance
          </Button>
        </div>
      </div>

      <div className={s.statsGrid}>
        <div className={s.statCard}>
          <span className={s.statLabel}>Configured Instances</span>
          <span className={s.statValue}>{instances.length}</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statLabel}>Active Online</span>
          <span className={s.statValue} style={{ color: '#10b981' }}>
            {onlineCount}
          </span>
        </div>
        <div className={s.statCard}>
          <span className={s.statLabel}>Auto-Discovery</span>
          <span className={s.statValue} style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>
            Bull & BullMQ
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className={s.emptyState}>
          <div className={s.emptyStateTitle}>Loading Redis instances...</div>
        </div>
      ) : filteredInstances.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyStateTitle}>No Redis instances found</div>
          <p className={s.emptyStateDesc}>
            {searchQuery
              ? 'No instances match your search query.'
              : 'Add your first Redis instance to start monitoring and managing queues.'}
          </p>
          <Button
            theme="primary"
            onClick={() => {
              setEditingInstance(null);
              setModalOpen(true);
            }}
          >
            + Add Redis Instance
          </Button>
        </div>
      ) : (
        <div className={s.grid}>
          {filteredInstances.map((inst) => (
            <div key={inst.id} className={s.instanceCard}>
              <div>
                <div className={s.cardHeader}>
                  <div className={s.instanceInfo}>
                    <h2 className={s.instanceName}>{inst.name}</h2>
                    <span className={s.instanceEndpoint}>
                      {inst.host}:{inst.port}
                    </span>
                  </div>
                  <span
                    className={`${s.badge} ${inst.status === 'online' ? s.online : s.offline}`}
                  >
                    ● {inst.status === 'online' ? `${inst.latencyMs ?? ''}ms` : 'Offline'}
                  </span>
                </div>

                <div className={s.cardDetails} style={{ marginTop: '1rem' }}>
                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Database</span>
                    <span className={s.detailValue}>DB {inst.db}</span>
                  </div>
                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Prefixes</span>
                    <span className={s.detailValue} style={{ color: 'var(--primary)' }}>Auto-Detect</span>
                  </div>
                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Version</span>
                    <span className={s.detailValue}>{inst.version || 'Redis'}</span>
                  </div>
                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Active Keys</span>
                    <span className={s.detailValue}>{inst.activeDbKeys ?? '-'}</span>
                  </div>
                </div>
              </div>

              <div className={s.cardActions}>
                <button
                  type="button"
                  className={s.connectButton}
                  onClick={() => handleConnect(inst)}
                >
                  ⚡ Connect & Inspect
                </button>

                <div className={s.iconButtons}>
                  <Button
                    theme="basic"
                    title="Test connection"
                    onClick={() => handleTest(inst)}
                  >
                    Ping
                  </Button>
                  <Button
                    theme="basic"
                    title="Edit configuration"
                    onClick={() => {
                      setEditingInstance(inst);
                      setModalOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    theme="basic"
                    title="Delete instance"
                    onClick={() => handleDelete(inst.id, inst.name)}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <InstanceModal
        open={modalOpen}
        instance={editingInstance}
        onClose={() => setModalOpen(false)}
        onSaved={(saved, connectDirectly) => {
          fetchInstances();
          if (connectDirectly) {
            handleConnect(saved);
          }
        }}
      />
    </div>
  );
};
