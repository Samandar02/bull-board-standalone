import { Router, Request, Response, NextFunction } from 'express';
import { boardManager } from '../services/boardManager.js';

export const boardRouter = Router({ mergeParams: true });

// Dynamic board handler per instance
boardRouter.use('/:instanceId/board', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instanceId = req.params.instanceId as string;
    const dbQuery = req.query.db !== undefined ? Number(req.query.db) : undefined;
    const dbHeader =
      req.headers['x-redis-db'] !== undefined ? Number(req.headers['x-redis-db']) : undefined;
    const db = dbQuery !== undefined ? dbQuery : dbHeader;
    const forceRefresh = req.query.refresh === 'true';

    const router = await boardManager.getBoardRouter(instanceId, db, forceRefresh);
    return router(req, res, next);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error executing board operation' });
  }
});
