// Restore only missing English catalog records from a local snapshot.
// Usage: node scripts/recover-english-catalog.js <user-id> <snapshot-json> [--apply]
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const [userId, snapshotPath, mode] = process.argv.slice(2);
if (!userId || !snapshotPath || (mode && mode !== '--apply')) {
  console.error('Usage: node scripts/recover-english-catalog.js <user-id> <snapshot-json> [--apply]');
  process.exit(2);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const courses = (snapshot.studyCourses || []).filter(item => item.subject === '英语' && ['上册', '下册'].includes(item.volume) && item.publisher === '上海教育出版社');
const units = (snapshot.studyUnits || []).filter(item => item.subject === '英语' && item.volume === '上册' && item.publisher === '上海教育出版社' && !item.title.startsWith('建议主题：'));
if (courses.length !== 2 || !units.length || units.some(item => item.grade !== courses[0].grade || item.region !== courses[0].region)) {
  throw new Error('Snapshot English upper volume is incomplete or inconsistent');
}

const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, studyPreferences: true } });
  if (!user) throw new Error('User not found');
  const current = JSON.parse(user.studyPreferences || '{}');
  const key = item => [item.region, item.publisher, item.subject, item.grade, item.volume, item.schoolSystem, item.textbook, item.edition, item.isbn].join('\u0000');
  const presentCourses = current.studyCourses || [];
  const presentUnits = current.studyUnits || [];
  const addCourses = courses.filter(item => !presentCourses.some(existing => key(existing) === key(item)));
  const addUnits = units.filter(item => !presentUnits.some(existing => key(existing) === key(item) && existing.title === item.title));
  console.log(JSON.stringify({ existingCourses: presentCourses.length, existingUnits: presentUnits.length, addCourses: addCourses.length, addUnits: addUnits.length, addEntries: addUnits.reduce((n, item) => n + item.entries.length, 0), apply: mode === '--apply' }));
  if (mode !== '--apply' || (!addCourses.length && !addUnits.length)) return;
  const beforePath = path.join('data', 'backups', `before-english-recovery-${Date.now()}.json`);
  fs.writeFileSync(beforePath, JSON.stringify({ userId, studyPreferences: current }, null, 2));
  const next = { ...current, studyCourses: [...presentCourses, ...addCourses], studyUnits: [...presentUnits, ...addUnits] };
  await prisma.$transaction(async tx => {
    const updated = await tx.user.updateMany({ where: { id: userId, studyPreferences: user.studyPreferences }, data: { studyPreferences: JSON.stringify(next) } });
    if (updated.count !== 1) throw new Error('Catalog changed during recovery; retry after inspection');
    await tx.studyCatalogRevision.create({ data: { userId, action: '从本地快照恢复英语上册目录', snapshot: user.studyPreferences } });
  });
  console.log(`Saved previous preferences to ${beforePath}`);
}
main().finally(() => prisma.$disconnect());
