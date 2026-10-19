import { Router, Request, Response } from 'express';
import { instanceStore, RedisInstanceRecord } from '../db/instanceStore.js';
import { boardManager } from '../services/boardManager.js';
import { redisManager } from '../services/redisManager.js';

export const instanceRouter = Router();

function sanitizeInstance(instance: RedisInstanceRecord) {
  return {
    ...instance,
    hasPassword: Boolean(instance.password),
    password: instance.password ? '••••••••' : '',
  };
}

// GET all instances
instanceRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const instances = instanceStore.getAll();

    // Enrich with quick ping status
    const enriched = await Promise.all(
      instances.map(async (inst) => {
        const sanitized = sanitizeInstance(inst);
        try {
          const testRes = await redisManager.testConnection({
            host: inst.host,
            port: inst.port,
            username: inst.username,
            password: inst.password,
            db: inst.db,
            tls: Boolean(inst.tls),
          });
          return {
            ...sanitized,
            status: testRes.success ? 'online' : 'offline',
            latencyMs: testRes.latencyMs,
            version: testRes.version,
            activeDbKeys: testRes.databases?.find((d) => d.index === inst.db)?.keysCount || 0,
            error: testRes.error,
          };
        } catch (e: any) {
          return {
            ...sanitized,
            status: 'offline',
            error: e.message,
          };
        }
      })
    );

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single instance
instanceRouter.get('/:id', (req: Request, res: Response) => {
  const instance = instanceStore.getById(req.params.id as string);
  if (!instance) {
    res.status(404).json({ error: 'Instance not found' });
    return;
  }
  res.json(sanitizeInstance(instance));
});

// CREATE instance
instanceRouter.post('/', (req: Request, res: Response) => {
  try {
    const { name, host, port, username, password, db, tls, prefix } = req.body;
    if (!host) {
      res.status(400).json({ error: 'Host is required' });
      return;
    }
    const created = instanceStore.create({
      name,
      host,
      port,
      username,
      password,
      db,
      tls,
      prefix,
    });
    res.status(201).json(sanitizeInstance(created));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE instance
instanceRouter.put('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, host, port, username, password, db, tls, prefix } = req.body;

    // If password was sent as mask placeholder or undefined, don't overwrite with placeholder
    const updateData: any = { name, host, port, username, db, tls, prefix };
    if (password !== undefined && password !== '••••••••') {
      updateData.password = password;
    }

    const updated = instanceStore.update(id, updateData);
    if (!updated) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    boardManager.invalidateInstance(id);
    res.json(sanitizeInstance(updated));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE instance
instanceRouter.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = instanceStore.delete(id);
  if (!deleted) {
    res.status(404).json({ error: 'Instance not found' });
    return;
  }
  boardManager.invalidateInstance(id);
  res.json({ success: true, id });
});

// TEST connection
instanceRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const { host, port, username, password, db, tls } = req.body;
    const testResult = await redisManager.testConnection({
      host: host || 'localhost',
      port: Number(port) || 6379,
      username,
      password,
      db: Number(db) || 0,
      tls: Boolean(tls),
    });
    res.json(testResult);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET databases for an instance
instanceRouter.get('/:id/databases', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const databases = await redisManager.getDatabases(id);
    res.json(databases);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET discovered queues for an instance
instanceRouter.get('/:id/queues', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = req.query.db !== undefined ? Number(req.query.db) : undefined;
    const queues = await redisManager.discoverQueues(id, db);
    res.json(queues);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
