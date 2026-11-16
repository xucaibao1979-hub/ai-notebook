import { createHash } from 'crypto';
import { expect, it } from 'vitest';
import { validateBackup } from '@/lib/complete-backup';

function backupWithRevision(snapshot: string) {
    const data = {
        profile: { name: null, educationStage: null, enrollmentYear: null, currentGrade: null, examDate: null, studyPreferences: '{}' },
        subjects: [], tags: [], errors: [], schedules: [], sets: [], records: [], reports: [], attempts: [], papers: [], homework: [],
        revisions: [{ id: 'revision-1', action: '修改目录', snapshot, createdAt: '2026-10-26T00:00:00.000Z', userId: 'student-1' }],
        assets: [],
    };
    return { version: 2, kind: 'learning-backup', exportedAt: '2026-10-26T00:00:00.000Z', email: 'student@example.com', sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex'), data };
}

it('accepts a backup containing restorable catalog history', () => {
    expect(validateBackup(backupWithRevision('{}')).data.revisions).toHaveLength(1);
});

it('rejects corrupt catalog history even when the envelope checksum matches', () => {
    expect(() => validateBackup(backupWithRevision('{invalid'))).toThrow();
});

it('still accepts backups created before catalog history was included', () => {
    const old = backupWithRevision('{}');
    const { revisions: _revisions, ...data } = old.data;
    expect(validateBackup({ ...old, data, sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex') }).data.revisions).toBeUndefined();
});

it('checks new diagnosis and learning-path records before restore', () => {
    const old = backupWithRevision('{}');
    const { assets, ...base } = old.data;
    const data = { ...base, evidence: [{ id: 'e1', nodeId: 'n1', unitId: 'u1', image: null }], prerequisites: [], diagnoses: [{ id: 'd1', state: JSON.stringify({ answers: [], queue: [] }), targetIds: '["n1"]' }], paths: [{ id: 'p1', diagnosisSessionId: 'd1', state: JSON.stringify({ steps: [], current: 0 }) }], assets };
    expect(validateBackup({ ...old, data, sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex') }).data.paths).toHaveLength(1);
    const invalid = { ...data, paths: [{ ...data.paths[0], diagnosisSessionId: 'missing' }] };
    expect(() => validateBackup({ ...old, data: invalid, sha256: createHash('sha256').update(JSON.stringify(invalid)).digest('hex') })).toThrow('关联');
});
