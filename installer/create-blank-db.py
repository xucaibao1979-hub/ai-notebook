"""Create an empty release database from the local migrated SQLite schema.

Only SQL schema and Prisma migration metadata are copied. User rows never enter
the release database.
"""
import sqlite3
import sys
from pathlib import Path

source_path, target_path = map(Path, sys.argv[1:3])
if target_path.exists():
    target_path.unlink()

source = sqlite3.connect(f"file:{source_path.resolve().as_posix()}?mode=ro", uri=True)
target = sqlite3.connect(target_path)
try:
    schema = source.execute(
        "SELECT type, name, sql FROM sqlite_master "
        "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' "
        "ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END"
    ).fetchall()
    for _, _, sql in schema:
        target.execute(sql)

    migrations = source.execute("SELECT * FROM _prisma_migrations").fetchall()
    placeholders = ','.join('?' for _ in source.execute('PRAGMA table_info(_prisma_migrations)'))
    target.executemany(f"INSERT INTO _prisma_migrations VALUES ({placeholders})", migrations)
    target.commit()
    target.execute('PRAGMA foreign_keys=ON')
    if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('Release database integrity check failed')
    for (table,) in target.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
        if table != '_prisma_migrations' and target.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]:
            raise RuntimeError(f'Release database contains rows in {table}')
    print(f'Created empty database: {target_path} ({len(schema)} schema objects, {len(migrations)} migrations)')
finally:
    target.close()
    source.close()
