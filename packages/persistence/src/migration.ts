const migrate1 = `
CREATE TABLE IF NOT EXISTS file_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    parent_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT(unixepoch('subsecond') * 1000),
    updated_at INTEGER NOT NULL DEFAULT(unixepoch('subsecond') * 1000),
    status TEXT NOT NULL DEFAULT 'active'
);
CREATE UNIQUE INDEX file_tasks_path_idx ON file_tasks(path);

CREATE TABLE IF NOT EXISTS file_task_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    md5_hash TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    compiled_code TEXT NOT NULL,
    file_task_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT(unixepoch('subsecond') * 1000),
    FOREIGN KEY (file_task_id) REFERENCES file_tasks(id) ON DELETE CASCADE
);
CREATE INDEX file_task_versions_file_task_id_idx ON file_task_versions(file_task_id);

CREATE TABLE IF NOT EXISTS task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    started_at INTEGER,
    ended_at INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    file_task_id INTEGER NOT NULL,
    file_task_version_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT(unixepoch('subsecond') * 1000),
    FOREIGN KEY (file_task_id) REFERENCES file_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (file_task_version_id) REFERENCES file_task_versions(id) ON DELETE CASCADE
);
CREATE INDEX task_runs_status_idx ON task_runs(status);
CREATE INDEX task_runs_started_at_idx ON task_runs(started_at);
CREATE INDEX task_runs_ended_at_idx ON task_runs(ended_at);
CREATE INDEX task_runs_created_at_idx ON task_runs(created_at);
CREATE INDEX task_runs_file_task_id_idx ON task_runs(file_task_id);
CREATE INDEX task_runs_file_task_version_id_idx ON task_runs(file_task_version_id);

CREATE TABLE IF NOT EXISTS kvs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    file_task_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT(unixepoch('subsecond') * 1000),
    FOREIGN KEY (file_task_id) REFERENCES file_tasks(id) ON DELETE CASCADE
);
CREATE INDEX kvs_key_idx ON kvs(key);
CREATE INDEX kvs_file_task_id_idx ON kvs(file_task_id);

CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    status TEXT NOT NULL,
    value TEXT NOT NULL,
    file_task_id INTEGER NOT NULL,
    task_run_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT(unixepoch('subsecond') * 1000),
    FOREIGN KEY (file_task_id) REFERENCES file_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (task_run_id) REFERENCES task_runs(id) ON DELETE CASCADE
);
CREATE INDEX logs_status_idx ON logs(status);
CREATE INDEX logs_file_task_id_idx ON logs(file_task_id);
CREATE INDEX logs_task_run_id_idx ON logs(task_run_id);
CREATE INDEX logs_created_at_idx ON logs(created_at);

CREATE TABLE IF NOT EXISTS timings (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    label TEXT NOT NULL,
    value INTEGER NOT NULL,
    file_task_id INTEGER NOT NULL,
    task_run_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT(unixepoch('subsecond') * 1000),
    FOREIGN KEY (file_task_id) REFERENCES file_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (task_run_id) REFERENCES task_runs(id) ON DELETE CASCADE
);
CREATE INDEX timings_label_idx ON timings(label);
CREATE INDEX timings_file_task_id_idx ON timings(file_task_id);
CREATE INDEX timings_task_run_id_idx ON timings(task_run_id);
CREATE INDEX timings_created_at_idx ON timings(created_at);
`;

export const migration = [migrate1];
