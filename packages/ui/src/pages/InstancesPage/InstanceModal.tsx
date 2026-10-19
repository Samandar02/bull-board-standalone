import { useState, useEffect } from 'react';
import { Button } from '../../components/Button/Button';
import { Modal } from '../../components/Modal/Modal';
import { useApi } from '../../hooks/useApi';
import { RedisInstanceDTO } from '../../services/Api';
import s from './InstanceModal.module.css';

interface InstanceModalProps {
  open: boolean;
  instance?: RedisInstanceDTO | null;
  onClose: () => void;
  onSaved: (savedInstance: RedisInstanceDTO, connectDirectly?: boolean) => void;
}

export const InstanceModal = ({ open, instance, onClose, onSaved }: InstanceModalProps) => {
  const api = useApi();
  const isEditing = Boolean(instance);

  const [name, setName] = useState('');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('6379');
  const [db, setDb] = useState('0');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [prefix, setPrefix] = useState('bull');
  const [tls, setTls] = useState(false);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    version?: string;
    error?: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (instance) {
      setName(instance.name || '');
      setHost(instance.host || 'localhost');
      setPort(String(instance.port || 6379));
      setDb(String(instance.db !== undefined ? instance.db : 0));
      setUsername(instance.username || '');
      setPassword(instance.hasPassword ? '••••••••' : instance.password || '');
      setPrefix(instance.prefix || 'bull');
      setTls(Boolean(instance.tls));
    } else {
      setName('');
      setHost('localhost');
      setPort('6379');
      setDb('0');
      setUsername('');
      setPassword('');
      setPrefix('bull');
      setTls(false);
    }
    setTestResult(null);
  }, [instance, open]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection({
        host: host.trim() || 'localhost',
        port: parseInt(port, 10) || 6379,
        username: username.trim() || undefined,
        password: password && password !== '••••••••' ? password : instance?.password || undefined,
        db: parseInt(db, 10) || 0,
        tls,
      });
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message || 'Connection failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (connectAfterSave = false) => {
    if (!host) return;
    setIsSaving(true);
    try {
      const payload: Partial<RedisInstanceDTO> = {
        name: name.trim() || `${host}:${port}`,
        host: host.trim(),
        port: parseInt(port, 10) || 6379,
        db: parseInt(db, 10) || 0,
        username: username.trim() || '',
        prefix: prefix.trim() || 'bull',
        tls,
      };

      if (password && password !== '••••••••') {
        payload.password = password;
      }

      let saved: RedisInstanceDTO;
      if (isEditing && instance) {
        saved = await api.updateInstance(instance.id, payload);
      } else {
        saved = await api.createInstance(payload);
      }

      onSaved(saved, connectAfterSave);
      onClose();
    } catch (e: any) {
      setTestResult({ success: false, error: e.message || 'Failed to save instance' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Redis Instance' : 'Add New Redis Instance'}
      width="medium"
    >
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(false);
        }}
      >
        <div className={s.formGroup}>
          <label className={s.label}>Instance Name</label>
          <input
            className={s.input}
            placeholder="e.g. Production Redis, Staging Hub, Local Cache"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={s.row}>
          <div className={s.formGroup} style={{ flex: 2 }}>
            <label className={s.label}>Host / Hostname *</label>
            <input
              className={s.input}
              placeholder="localhost or host.docker.internal"
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <span
              style={{
                fontSize: '0.725rem',
                color: 'var(--muted-foreground)',
                marginTop: '0.15rem',
              }}
            >
              Docker-dan host Redis-ga ulanish: <code>host.docker.internal</code>
            </span>
          </div>
          <div className={s.formGroup} style={{ flex: 1 }}>
            <label className={s.label}>Port *</label>
            <input
              type="number"
              className={s.input}
              placeholder="6379"
              required
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
        </div>

        <div className={s.row}>
          <div className={s.formGroup}>
            <label className={s.label}>Database Index (0 - 15)</label>
            <input
              type="number"
              min="0"
              max="15"
              className={s.input}
              placeholder="0"
              value={db}
              onChange={(e) => setDb(e.target.value)}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Prefix Discovery</label>
            <div
              style={{
                padding: '0.625rem 0.75rem',
                background: 'var(--card)',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                color: 'var(--muted-foreground)',
                border: '1px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                height: '38px',
              }}
            >
              ⚡ Auto-detects all prefixes
            </div>
          </div>
        </div>

        <div className={s.row}>
          <div className={s.formGroup}>
            <label className={s.label}>Username (Optional - Redis 6+ ACL)</label>
            <input
              className={s.input}
              placeholder="default"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Password (Optional)</label>
            <input
              type="password"
              className={s.input}
              placeholder={instance?.hasPassword ? '••••••••' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div className={s.formGroup}>
          <label className={s.checkboxLabel}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={tls}
              onChange={(e) => setTls(e.target.checked)}
            />
            <span>Enable TLS / SSL connection</span>
          </label>
        </div>

        {testResult && (
          <div className={`${s.testResult} ${testResult.success ? s.success : s.error}`}>
            {testResult.success ? (
              <span>
                ✓ <strong>Connected successfully!</strong> Latency: {testResult.latencyMs}ms
                {testResult.version ? ` • Redis v${testResult.version}` : ''}
              </span>
            ) : (
              <span>
                ✕ <strong>Connection failed:</strong> {testResult.error}
              </span>
            )}
          </div>
        )}

        <div className={s.actions}>
          <Button
            type="button"
            theme="basic"
            onClick={handleTestConnection}
            disabled={isTesting || !host}
          >
            {isTesting ? 'Testing Connection...' : '⚡ Test Connection'}
          </Button>

          <div className={s.actionButtons}>
            <Button type="button" theme="basic" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              theme="primary"
              disabled={isSaving || !host}
              onClick={() => handleSubmit(true)}
            >
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save & Connect'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
