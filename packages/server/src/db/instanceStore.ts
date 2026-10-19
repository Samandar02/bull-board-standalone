import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface RedisInstanceRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls: number;
  prefix: string;
  created_at: string;
  updated_at: string;
}

export type CreateInstanceDTO = {
  name: string;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: boolean;
  prefix?: string;
};

export type UpdateInstanceDTO = Partial<CreateInstanceDTO>;

class InstanceStore {
  private db: DatabaseSync;

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'instances.db');
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL DEFAULT 'localhost',
        port INTEGER NOT NULL DEFAULT 6379,
        username TEXT DEFAULT '',
        password TEXT DEFAULT '',
        db INTEGER NOT NULL DEFAULT 0,
        tls INTEGER NOT NULL DEFAULT 0,
        prefix TEXT NOT NULL DEFAULT 'bull',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Seed default instance if empty
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM instances').get() as {
      count: number | bigint;
    };
    if (Number(countRow.count) === 0) {
      const now = new Date().toISOString();
      const isDocker = fs.existsSync('/.dockerenv');
      const defaultHost =
        process.env.REDIS_HOST || (isDocker ? 'host.docker.internal' : 'localhost');
      this.db
        .prepare(`
        INSERT INTO instances (id, name, host, port, username, password, db, tls, prefix, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .run('local-default', 'Local Redis', defaultHost, 6379, '', '', 0, 0, 'bull', now, now);
    }
  }

  public getAll(): RedisInstanceRecord[] {
    return this.db
      .prepare('SELECT * FROM instances ORDER BY created_at ASC')
      .all() as unknown as RedisInstanceRecord[];
  }

  public getById(id: string): RedisInstanceRecord | undefined {
    return this.db.prepare('SELECT * FROM instances WHERE id = ?').get(id) as unknown as
      | RedisInstanceRecord
      | undefined;
  }

  public create(data: CreateInstanceDTO): RedisInstanceRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const host = data.host.trim() || 'localhost';
    const port = Number(data.port) || 6379;
    const name = data.name.trim() || `${host}:${port}`;
    const username = data.username?.trim() || '';
    const password = data.password || '';
    const db = Number(data.db) || 0;
    const tls = data.tls ? 1 : 0;
    const prefix = data.prefix?.trim() || 'bull';

    this.db
      .prepare(`
      INSERT INTO instances (id, name, host, port, username, password, db, tls, prefix, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(id, name, host, port, username, password, db, tls, prefix, now, now);

    return this.getById(id)!;
  }

  public update(id: string, data: UpdateInstanceDTO): RedisInstanceRecord | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const host = data.host !== undefined ? data.host.trim() || 'localhost' : existing.host;
    const port = data.port !== undefined ? Number(data.port) || 6379 : existing.port;
    const name = data.name !== undefined ? data.name.trim() || `${host}:${port}` : existing.name;
    const username = data.username !== undefined ? data.username.trim() : existing.username || '';
    const password = data.password !== undefined ? data.password : existing.password || '';
    const db = data.db !== undefined ? Number(data.db) || 0 : existing.db;
    const tls = data.tls !== undefined ? (data.tls ? 1 : 0) : existing.tls;
    const prefix = data.prefix !== undefined ? data.prefix.trim() || 'bull' : existing.prefix;

    this.db
      .prepare(`
      UPDATE instances
      SET name = ?, host = ?, port = ?, username = ?, password = ?, db = ?, tls = ?, prefix = ?, updated_at = ?
      WHERE id = ?
    `)
      .run(name, host, port, username, password, db, tls, prefix, now, id);

    return this.getById(id);
  }

  public delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM instances WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }
}

export const instanceStore = new InstanceStore();
