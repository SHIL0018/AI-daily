import type { ActivityRecord, ActivityCategory, PrivacyLevel, UploadStatus } from "../../shared/types";
import { UPLOAD_STATUSES } from "../../shared/constants";
import { LocalDatabase } from "./LocalDatabase";
import { shanghaiDate, toShanghaiIso } from "../../shared/time";

function shanghaiDateBounds(dateText: string): { start: string; end: string } {
  const start = `${dateText}T00:00:00.000+08:00`;
  const next = new Date(`${dateText}T00:00:00+08:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, end: toShanghaiIso(next) };
}

function rowToRecord(row: any): ActivityRecord {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    deviceId: row.device_id,
    sessionId: row.session_id,
    startTime: row.start_time,
    endTime: row.end_time,
    durationSeconds: row.duration_seconds,
    appName: row.app_name ?? undefined,
    windowTitle: row.window_title ?? undefined,
    processName: row.process_name ?? undefined,
    summary: row.summary,
    category: row.category as ActivityCategory,
    confidence: row.confidence ?? undefined,
    privacyLevel: row.privacy_level as PrivacyLevel,
    uploadStatus: row.upload_status as UploadStatus,
    retryCount: row.retry_count,
    serverRecordId: row.server_record_id ?? undefined,
    errorMessage: row.error_message ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ActivityRecordRepository {
  constructor(private readonly database: LocalDatabase) {}

  insert(record: ActivityRecord): void {
    this.database.db.prepare(`
      INSERT INTO local_activity_records
      (id, user_id, device_id, session_id, start_time, end_time, duration_seconds, app_name, window_title,
       process_name, summary, category, confidence, privacy_level, upload_status, retry_count, server_record_id,
       error_message, metadata, created_at, updated_at)
      VALUES (@id, @userId, @deviceId, @sessionId, @startTime, @endTime, @durationSeconds, @appName, @windowTitle,
       @processName, @summary, @category, @confidence, @privacyLevel, @uploadStatus, @retryCount, @serverRecordId,
       @errorMessage, @metadata, @createdAt, @updatedAt)
    `).run({
      id: record.id,
      userId: record.userId ?? null,
      deviceId: record.deviceId,
      sessionId: record.sessionId,
      startTime: record.startTime,
      endTime: record.endTime,
      durationSeconds: record.durationSeconds,
      appName: record.appName ?? null,
      windowTitle: record.windowTitle ?? null,
      processName: record.processName ?? null,
      summary: record.summary,
      category: record.category,
      confidence: record.confidence ?? null,
      privacyLevel: record.privacyLevel,
      uploadStatus: record.uploadStatus,
      retryCount: record.retryCount,
      serverRecordId: record.serverRecordId ?? null,
      errorMessage: record.errorMessage ?? null,
      metadata: JSON.stringify(record.metadata ?? {}),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    });
  }

  list(limit = 100, dateText = shanghaiDate()): ActivityRecord[] {
    const { start, end } = shanghaiDateBounds(dateText);
    const rows = this.database.db.prepare(`
      SELECT * FROM local_activity_records
      WHERE start_time >= ? AND start_time < ?
      ORDER BY start_time DESC LIMIT ?
    `).all(start, end, limit);
    return rows.map(rowToRecord);
  }

  listForSync(limit: number, maxRetryCount: number): ActivityRecord[] {
    const rows = this.database.db.prepare(`
      SELECT * FROM local_activity_records
      WHERE upload_status IN ('pending','failed') AND retry_count < ?
      ORDER BY created_at ASC LIMIT ?
    `).all(maxRetryCount, limit);
    return rows.map(rowToRecord);
  }

  getLast(): ActivityRecord | undefined {
    const row = this.database.db.prepare("SELECT * FROM local_activity_records ORDER BY start_time DESC LIMIT 1").get();
    return row ? rowToRecord(row) : undefined;
  }

  todaySeconds(): number {
    const { start, end } = shanghaiDateBounds(shanghaiDate());
    const row = this.database.db.prepare("SELECT COALESCE(SUM(duration_seconds), 0) AS seconds FROM local_activity_records WHERE start_time >= ? AND start_time < ?").get(start, end) as { seconds: number };
    return row.seconds;
  }

  countByStatus(status: UploadStatus): number {
    const row = this.database.db.prepare("SELECT COUNT(*) AS count FROM local_activity_records WHERE upload_status=?").get(status) as { count: number };
    return row.count;
  }

  countByUploadStatus(): Record<UploadStatus, number> {
    const counts = Object.fromEntries(UPLOAD_STATUSES.map((status) => [status, 0])) as Record<UploadStatus, number>;
    const rows = this.database.db.prepare("SELECT upload_status AS status, COUNT(*) AS count FROM local_activity_records GROUP BY upload_status").all() as Array<{ status: UploadStatus; count: number }>;
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  }

  markUploading(records: ActivityRecord[]): void {
    const stmt = this.database.db.prepare("UPDATE local_activity_records SET upload_status='uploading', updated_at=? WHERE id=?");
    const now = toShanghaiIso();
    const tx = this.database.db.transaction(() => records.forEach((record) => stmt.run(now, record.id)));
    tx();
  }

  markSynced(localId: string, serverRecordId?: string): void {
    this.database.db.prepare("UPDATE local_activity_records SET upload_status='synced', server_record_id=?, error_message=NULL, updated_at=? WHERE id=?").run(
      serverRecordId,
      toShanghaiIso(),
      localId
    );
  }

  markFailed(localId: string, error: string): void {
    this.database.db.prepare("UPDATE local_activity_records SET upload_status='failed', retry_count=retry_count+1, error_message=?, updated_at=? WHERE id=?").run(
      error,
      toShanghaiIso(),
      localId
    );
  }

  clear(): void {
    this.database.db.prepare("DELETE FROM local_activity_records").run();
  }
}


