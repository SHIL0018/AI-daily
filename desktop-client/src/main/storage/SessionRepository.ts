import { LocalDatabase } from "./LocalDatabase";
import { toShanghaiIso } from "../../shared/time";

export class SessionRepository {
  constructor(private readonly database: LocalDatabase) {}

  create(deviceId: string): string {
    const id = crypto.randomUUID();
    const now = toShanghaiIso();
    this.database.db.prepare("INSERT INTO local_sessions (id, device_id, started_at, status, created_at, updated_at) VALUES (?, ?, ?, 'recording', ?, ?)").run(
      id,
      deviceId,
      now,
      now,
      now
    );
    return id;
  }

  close(id: string, status = "stopped"): void {
    const now = toShanghaiIso();
    this.database.db.prepare("UPDATE local_sessions SET ended_at=?, status=?, updated_at=? WHERE id=?").run(now, status, now, id);
  }
}


