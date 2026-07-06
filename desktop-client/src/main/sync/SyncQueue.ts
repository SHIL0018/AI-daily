import { LocalDatabase } from "../storage/LocalDatabase";

export class SyncQueue {
  constructor(private readonly database: LocalDatabase) {}

  start(): string {
    const id = crypto.randomUUID();
    this.database.db.prepare("INSERT INTO local_sync_logs (id, started_at, status) VALUES (?, ?, 'running')").run(id, new Date().toISOString());
    return id;
  }

  finish(id: string, uploaded: number, failed: number): void {
    this.database.db.prepare("UPDATE local_sync_logs SET ended_at=?, status='succeeded', uploaded_count=?, failed_count=? WHERE id=?").run(
      new Date().toISOString(),
      uploaded,
      failed,
      id
    );
  }

  fail(id: string, error: string): void {
    this.database.db.prepare("UPDATE local_sync_logs SET ended_at=?, status='failed', error_message=? WHERE id=?").run(new Date().toISOString(), error, id);
  }
}
