'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StudyCourse, StudyUnit } from '@/lib/study-preferences';
import { LEARNING_SUBJECTS } from '@/lib/learning';
import { STUDENT_GRADES } from '@/lib/student-grade';

type StudyResponse = {
  units: StudyUnit[];
  courses: StudyCourse[];
  textbooks: { publisher: string; subject: string }[];
  activePublisher?: string;
};

type Props = {
  publisher: string;
  subject: string;
  grade: string;
  volume: string;
  selectedId: string;
  selectedIds: string[];
  busy: boolean;
  onPublisherChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onGradeChange: (value: string) => void;
  onVolumeChange: (value: string) => void;
  onUnitChange: (value: string) => void;
  onUnitIdsChange: (value: string[]) => void;
  onGenerate: (unitId: string, mode: 'practice' | 'review') => void;
};

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export function UnitLearning({ publisher, subject, grade, volume, selectedId, selectedIds, busy, onPublisherChange, onSubjectChange, onGradeChange, onVolumeChange, onUnitChange, onUnitIdsChange }: Props) {
  const [data, setData] = useState<StudyResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/study-units')
      .then(async (response) => {
        if (!response.ok) throw new Error('教材目录加载失败');
        return response.json() as Promise<StudyResponse>;
      })
      .then((result) => { if (!cancelled) setData(result); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '教材目录加载失败'); });
    return () => { cancelled = true; };
  }, []);

  const publishers = useMemo(() => unique([
    ...(data?.courses || []).map((item) => item.publisher),
    ...(data?.units || []).map((item) => item.publisher),
    ...(data?.textbooks || []).map((item) => item.publisher),
  ]), [data]);
  const targetPublisher = publishers.includes(publisher) ? publisher : (publishers.includes(data?.activePublisher || '') ? data!.activePublisher! : publishers[0] || '');
  const subjects = useMemo(() => unique([
    ...LEARNING_SUBJECTS,
    ...(data?.courses || []).filter((item) => item.publisher === targetPublisher).map((item) => item.subject),
    ...(data?.units || []).filter((item) => item.publisher === targetPublisher).map((item) => item.subject),
    ...(data?.textbooks || []).filter((item) => item.publisher === targetPublisher).map((item) => item.subject),
  ]), [data, targetPublisher]);
  const targetSubject = subjects.includes(subject) ? subject : subjects[0] || '';
  const grades = useMemo(() => unique([
    ...Object.values(STUDENT_GRADES),
    ...(data?.courses || []).filter((item) => item.publisher === targetPublisher && item.subject === targetSubject).map((item) => item.grade),
    ...(data?.units || []).filter((item) => item.publisher === targetPublisher && item.subject === targetSubject).map((item) => item.grade),
  ]), [data, targetPublisher, targetSubject]);
  const targetGrade = grades.includes(grade) ? grade : grades[0] || '';
  const gradeUnits = useMemo(() => (data?.units || []).filter((item) => item.publisher === targetPublisher && item.subject === targetSubject && item.grade === targetGrade), [data, targetPublisher, targetSubject, targetGrade]);
  const volumes = unique(gradeUnits.map((item) => item.volume)).sort((a, b) => a === '上册' ? -1 : b === '上册' ? 1 : 0);
  const volumeOptions = volumes.length ? volumes : ['上册', '下册'];
  const targetVolume = volumeOptions.includes(volume) ? volume : volumeOptions[0];
  const units = gradeUnits.filter((item) => item.volume === targetVolume);
  const selectedUnits = units.filter((item) => selectedIds.includes(item.id));

  useEffect(() => { if (targetPublisher && publisher !== targetPublisher) onPublisherChange(targetPublisher); }, [publisher, targetPublisher, onPublisherChange]);
  useEffect(() => { if (targetSubject && subject !== targetSubject) onSubjectChange(targetSubject); }, [subject, targetSubject, onSubjectChange]);
  useEffect(() => { if (targetGrade && grade !== targetGrade) onGradeChange(targetGrade); }, [grade, targetGrade, onGradeChange]);
  useEffect(() => { if (targetVolume && volume !== targetVolume) onVolumeChange(targetVolume); }, [volume, targetVolume, onVolumeChange]);
  useEffect(() => {
    if (!data) return;
    const valid = selectedIds.filter((id) => units.some((unit) => unit.id === id));
    if (valid.length !== selectedIds.length) onUnitIdsChange(valid);
    if (selectedId && !units.some((unit) => unit.id === selectedId)) onUnitChange('');
  }, [data, units, selectedIds, selectedId, onUnitIdsChange, onUnitChange]);

  const toggleUnit = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id];
    onUnitIdsChange(next);
    onUnitChange(next[0] || '');
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div><h2 className="font-semibold text-slate-900">教材与章节</h2><p className="mt-1 text-xs text-slate-500">按教材筛选章节，选择后查看对应知识点。</p></div>
      <Button type="button" variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('open-app-settings', { detail: { tab: 'study' } }))}>管理教材与单元</Button>
    </div>
    {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
    <div className="mb-3"><label className="mb-1 block text-xs font-medium text-slate-600">出版社</label><select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={targetPublisher} onChange={(event) => onPublisherChange(event.target.value)} disabled={busy}>{publishers.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
    <div className="grid gap-3 sm:grid-cols-4">
      <div><label className="mb-1 block text-xs font-medium text-slate-600">科目</label><select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={targetSubject} onChange={(event) => onSubjectChange(event.target.value)} disabled={busy}>{subjects.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-medium text-slate-600">年级</label><select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={targetGrade} onChange={(event) => onGradeChange(event.target.value)} disabled={busy}>{grades.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-medium text-slate-600">册别</label><select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={targetVolume} onChange={(event) => onVolumeChange(event.target.value)} disabled={busy}>{volumeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-medium text-slate-600">章节（可多选）</label><details className="relative rounded-lg border border-slate-200 bg-white text-sm"><summary className="cursor-pointer list-none px-3 py-2 text-slate-700">{selectedUnits.length ? `已选 ${selectedUnits.length} 个章节` : '展开选择章节'} <span className="float-right">⌄</span></summary><div className="absolute z-20 mt-1 max-h-64 w-full min-w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">{units.length ? units.map((unit) => <label key={unit.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(unit.id)} onChange={() => toggleUnit(unit.id)} disabled={busy} className="mt-0.5" /><span>{unit.title}</span></label>) : <p className="px-2 py-2 text-xs text-slate-500">当前教材暂无章节</p>}</div></details></div>
    </div>
    {!units.length && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">当前出版社、科目、年级和册别下暂无已录入单元。专属练习仍可按科目和年级通用知识出题；章节出题与试卷组卷需要先在“科目设置”中补充并核对知识点。</p>}
    {selectedUnits.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="mb-3 text-sm font-semibold text-slate-900">所选章节知识点</h3><div className="space-y-3">{selectedUnits.map((unit) => <div key={unit.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-sm font-medium text-slate-900">{unit.title}</h4><span className="text-xs text-slate-500">{unit.entries.length} 个知识点</span></div>{unit.entries.length ? <ul className="space-y-1.5">{unit.entries.map((entry, index) => <li key={`${unit.id}-${index}`} className="flex gap-3 text-sm text-slate-700"><span className="shrink-0 text-slate-400">{index + 1}.</span><span><strong className="font-medium">{entry.term}</strong>{entry.meaning ? <span className="text-slate-500"> · {entry.meaning}</span> : null}</span></li>)}</ul> : <p className="text-xs text-slate-500">该章节尚无知识点，可在科目设置中补充。</p>}</div>)}</div></div>}
  </section>;
}
