import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import fs from 'node:fs';
import path from 'node:path';

export function initDatabase(dbFilePath: string): Database.Database {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbFilePath, { timeout: 5000 });
  db.pragma('busy_timeout = 5000');
  sqliteVec.load(db);

  let schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    const fallbackPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
    if (fs.existsSync(fallbackPath)) {
      schemaPath = fallbackPath;
    }
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  return db;
}
