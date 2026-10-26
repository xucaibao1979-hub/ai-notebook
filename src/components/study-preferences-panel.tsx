"use client";
import {useEffect,useState} from 'react';
import {StudyPreferences,studyPreferencesSchema,curriculumSubject} from '@/lib/study-preferences';
import {LEARNING_SUBJECTS} from '@/lib/learning';
import {currentStudentGrade,STUDENT_GRADES,GradeProfile} from '@/lib/student-grade';
import {apiClient,friendlyApiError} from '@/lib/api-client';
import {Input} from './ui/input';
import {Button} from './ui/button';
import {StudyUnitSettings} from './study-unit-settings';
export function StudyPreferencesPanel(){
    const [value,setValue]=useState<StudyPreferences>(studyPreferencesSchema.parse({}));
    const [newSubject,setNewSubject]=useState('');
    const [adding,setAdding]=useState(false);
    const [openSubject,setOpenSubject]=useState<number|null>(null);
    const [subjects,setSubjects]=useState<string[]>([...LEARNING_SUBJECTS,'科学']);
    const [loadedGradeLabel,setGradeLabel]=useState('正在读取当前年级…');
    const gradeLabel=loadedGradeLabel;
    const [message,setMessage]=useState('');
    const [busy,setBusy]=useState(false);
    useEffect(()=>{let active=true;Promise.all([apiClient.get<GradeProfile & {studyPreferences?:string}>('/api/user'),apiClient.get<{name:string}[]>('/api/notebooks').catch(()=>[])]).then(([profile,notebooks])=>{if(!active)return;const grade=currentStudentGrade(profile);setGradeLabel(grade?STUDENT_GRADES[grade]:'请先在账户中设置当前年级');try{const prefs=studyPreferencesSchema.parse(JSON.parse(profile.studyPreferences||'{}'));setValue(prefs);setSubjects([...new Set([...LEARNING_SUBJECTS,'科学',...notebooks.map(n=>n.name),...prefs.subjectTextbooks.map(r=>r.subject)])]);}catch{setMessage('学习设置格式异常，请重新填写并保存。');}}).catch(e=>{if(active)setMessage(friendlyApiError(e));});return()=>{active=false;};},[]);
    async function save(){
        const parsed=studyPreferencesSchema.safeParse({...value,semester:'全年',chapter:'',subjectTextbooks:value.subjectTextbooks.map(row=>({...row,semester:'',chapter:''}))});
        if(!parsed.success){setMessage(parsed.error.issues[0].message);return;}
        setBusy(true);
        try{await apiClient.patch('/api/user',{studyPreferences:parsed.data});setMessage('已保存。后续 AI 出题、举一反三、周复习和批改将使用对应科目的教材版本。');}
        catch(e){setMessage(friendlyApiError(e));}finally{setBusy(false);}
    }
    function update(index:number,key:keyof StudyPreferences['subjectTextbooks'][number],text:string){setValue(v=>({...v,subjectTextbooks:v.subjectTextbooks.map((row,i)=>i===index?{...row,[key]:text}:row)}));}
    function add(){
        const subject=curriculumSubject(newSubject);
        if(!subject)return;
        if(value.subjectTextbooks.some(row=>curriculumSubject(row.subject)===subject)){setMessage('这个科目已经存在，请直接修改对应教材版本。');return;}
        setValue(v=>({...v,subjectTextbooks:[...v.subjectTextbooks,{subject,publisher:'',textbook:'',semester:'',chapter:''}]}));setOpenSubject(value.subjectTextbooks.length);setNewSubject('');setAdding(false);setMessage('已添加科目，请填写教材信息并保存学习计划。');
    }
    return <section className="space-y-4 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">教材与学习计划</h3><Button size="sm" variant="outline" disabled={busy||value.subjectTextbooks.length>=30} onClick={()=>{setAdding(v=>!v);setNewSubject('');}}>添加科目</Button></div>
        <p className="text-xs leading-6 text-slate-500">先确认当前年级，再按科目设置出版社和教材版本。科目默认收起，点击编辑后填写；单元目录在下方单独管理。</p>
        {adding&&<div className="flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-3"><select aria-label="选择新增科目" className="h-10 min-w-40 flex-1 rounded-md border bg-white px-3 text-sm" value={newSubject} onChange={e=>setNewSubject(e.target.value)}><option value="">请选择科目</option>{subjects.filter(subject=>!value.subjectTextbooks.some(row=>curriculumSubject(row.subject)===curriculumSubject(subject))).map(subject=><option key={subject}>{subject}</option>)}</select><Button size="sm" disabled={!newSubject||busy} onClick={add}>确定添加</Button><Button size="sm" variant="ghost" onClick={()=>setAdding(false)}>取消</Button></div>}
        <div className="space-y-2">{value.subjectTextbooks.map((row,index)=><div key={index} className="rounded-xl border bg-slate-50/40 p-3">
            <div className="flex items-center justify-between gap-3"><div><span className="text-sm font-medium">{row.subject||'新科目'}</span><p className="mt-1 text-xs text-slate-500">{[row.publisher,row.textbook].filter(Boolean).join(' · ')||'未设置教材'} · {gradeLabel}</p></div><button type="button" aria-expanded={openSubject===index} aria-controls={`subject-editor-${index}`} className="shrink-0 text-xs font-medium text-indigo-600" onClick={()=>setOpenSubject(openSubject===index?null:index)}>{openSubject===index?'收起':'编辑'}</button></div>
            {openSubject===index&&<div id={`subject-editor-${index}`} className="mt-3 space-y-3 border-t pt-3"><div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">科目名称<select aria-label={`科目名称（第${index+1}项）`} className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={row.subject} disabled={busy} onChange={e=>update(index,'subject',e.target.value)}>{subjects.map(subject=><option key={subject} disabled={value.subjectTextbooks.some((other,i)=>i!==index&&curriculumSubject(other.subject)===curriculumSubject(subject))}>{subject}</option>)}</select></label><label className="text-xs">年级<Input aria-label={`${row.subject}教材年级`} value={gradeLabel} readOnly className="bg-slate-100 text-slate-500" /></label>
                <label className="text-xs">出版社<Input aria-label={`${row.subject}出版社`} value={row.publisher} maxLength={100} disabled={busy} placeholder="例如：人民教育出版社" onChange={e=>update(index,'publisher',e.target.value)}/></label><label className="text-xs">教材名称 / 版本<Input aria-label={`${row.subject}教材版本`} value={row.textbook} maxLength={100} disabled={busy} placeholder="例如：五年级上册" onChange={e=>update(index,'textbook',e.target.value)}/></label>
            </div><div className="flex justify-end"><button type="button" disabled={busy} className="text-xs text-red-500" onClick={()=>{setValue(v=>({...v,subjectTextbooks:v.subjectTextbooks.filter((_,i)=>i!==index)}));setOpenSubject(null);}}>移除该科目</button></div></div>}
        </div>)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">每天学习时长（分钟）<Input type="number" min={5} max={180} value={value.dailyMinutes} onChange={e=>setValue({...value,dailyMinutes:Number(e.target.value)})}/></label>
        </div>
        <StudyUnitSettings subjects={subjects} textbooks={value.subjectTextbooks} defaultGrade={gradeLabel} />
        <details><summary className="cursor-pointer text-xs text-slate-500">其他科目的通用设置（保留原有设置）</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs">通用教材版本<Input value={value.textbook} maxLength={100} onChange={e=>setValue({...value,textbook:e.target.value})}/></label></div></details>
        <p className="text-xs leading-6 text-slate-500">已保存的旧练习保留原题。新生成和 AI 复习使用对应科目的设置；公开试卷仍以原卷为准，不视为已精确映射全部教材。</p>
        <Button disabled={busy} onClick={save}>保存学习计划</Button>
        {message&&<p role="status" className="text-sm">{message}</p>}
    </section>;
}
