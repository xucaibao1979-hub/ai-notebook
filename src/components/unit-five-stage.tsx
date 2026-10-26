"use client";

import { useEffect, useRef, useState } from 'react';
import { StudyUnit } from '@/lib/study-preferences';
import { Button } from './ui/button';
import { Input } from './ui/input';

type Stage = '学' | '读' | '练' | '拼' | '写';
type Mode = 'study' | 'practice' | 'review';
const stages: Stage[] = ['学', '读', '练', '拼', '写'];
function shuffle<T>(items: T[]) { const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }

export function UnitFiveStage({ unit, mode, onClose, onMastery }: { unit: StudyUnit; mode: Mode; onClose: () => void; onMastery: (index: number, mastered: boolean) => Promise<void> }) {
    const [order, setOrder] = useState<number[]>([]);
    const [position, setPosition] = useState(0);
    const [stage, setStage] = useState<Stage>(mode === 'practice' ? '练' : '学');
    const [answer, setAnswer] = useState('');
    const [revealed, setRevealed] = useState(false);
    const [used, setUsed] = useState<number[]>([]);
    const [pieces, setPieces] = useState<string[]>([]);
    const [options, setOptions] = useState<string[]>([]);
    const [recording, setRecording] = useState(false);
    const [recordUrl, setRecordUrl] = useState('');
    const [message, setMessage] = useState('');
    const recorder = useRef<MediaRecorder | null>(null);
    const index = order[position] ?? 0;
    const item = unit.entries[index];
    useEffect(() => {
        const all = unit.entries.map((_, i) => i);
        const pending = all.filter(i => !unit.entries[i].mastered);
        setOrder(mode === 'study' ? all : shuffle(mode === 'review' && pending.length ? pending : all));
    }, [unit.id, mode]);
    useEffect(() => {
        if (!item) return;
        const single = item.kind === '单词' || (item.kind === '知识点' && !/\s/.test(item.term));
        setPieces(shuffle(single ? [...item.term] : item.term.trim().split(/\s+/)));
        setOptions(shuffle([item.meaning, ...shuffle(unit.entries.filter((_, i) => i !== index).map(other => other.meaning)).filter(value => value !== item.meaning).slice(0, 2)]));
        if (recorder.current?.state === 'recording') recorder.current.stop();
        setRecording(false); setRecordUrl(''); setAnswer(''); setUsed([]); setRevealed(false);
    }, [unit, index]);
    useEffect(() => () => { recorder.current?.stream.getTracks().forEach(track => track.stop()); if (recordUrl) URL.revokeObjectURL(recordUrl); }, [recordUrl]);
    function speak() { if (!('speechSynthesis' in window)) { setMessage('当前浏览器不支持语音播放。'); return; } window.speechSynthesis.cancel(); const speech = new SpeechSynthesisUtterance(item.term); speech.lang = unit.subject === '英语' ? 'en-US' : 'zh-CN'; window.speechSynthesis.speak(speech); }
    async function record() {
        if (recorder.current?.state === 'recording') { recorder.current.stop(); setRecording(false); return; }
        try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const chunks: BlobPart[] = []; const next = new MediaRecorder(stream); next.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; next.onstop = () => { setRecordUrl(URL.createObjectURL(new Blob(chunks, { type: next.mimeType }))); stream.getTracks().forEach(track => track.stop()); }; recorder.current = next; next.start(); setRecording(true); }
        catch { setMessage('无法使用麦克风，请检查浏览器录音权限。'); }
    }
    function step(next: Stage) { setStage(next); setAnswer(''); setUsed([]); setRevealed(false); }
    function move(delta: number) { const next = position + delta; if (next >= order.length) { onClose(); return; } if (next < 0) return; setPosition(next); step(mode === 'practice' ? '练' : '学'); }
    if (!item || !order.length) return <div className="rounded-xl bg-white p-5 text-sm text-slate-500">正在准备单元内容…</div>;
    const single = item.kind === '单词' || (item.kind === '知识点' && !/\s/.test(item.term));
    const assembled = used.map(i => pieces[i]).join(single ? '' : ' ');
    const correct = stage === '练' ? answer === item.meaning : stage === '拼' ? assembled.toLocaleLowerCase() === item.term.toLocaleLowerCase() : answer.trim().toLocaleLowerCase() === item.term.toLocaleLowerCase();
    const displayKind = item.kind === '知识点' && unit.subject === '英语' ? /[.!?]$/.test(item.term) ? '句子' : /\s/.test(item.term) ? '短语' : '单词' : item.kind;
    return <div className="rounded-xl bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between text-xs text-slate-500"><span>{mode === 'study' ? '单元学习' : mode === 'practice' ? '随机练习' : '单元复习'} · {position + 1} / {order.length} · {displayKind}</span><button onClick={onClose}>返回单元</button></div>
        <div className="mt-5 flex justify-center gap-2">{stages.map(value => <button key={value} onClick={() => step(value)} className={`size-10 rounded-full text-sm font-medium ${stage === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{value}</button>)}</div>
        <div className="mt-7 min-h-56 text-center"><h4 className="break-words text-2xl font-semibold text-slate-800 sm:text-3xl">{stage === '写' ? '根据释义写出内容' : stage === '拼' ? '按顺序拼出内容' : item.term}</h4><p className="mt-4 text-sm text-slate-500">{stage === '练' ? '选择正确释义' : stage === '学' || stage === '读' || stage === '拼' || stage === '写' || revealed ? item.meaning : '先独立尝试，完成后再查看答案'}</p>
            {stage === '学' && <Button className="mt-6" variant="outline" onClick={speak}>播放发音</Button>}
            {stage === '读' && <div className="mt-6 space-y-3"><div className="flex justify-center gap-2"><Button variant="outline" onClick={speak}>听标准发音</Button><Button variant="outline" onClick={record}>{recording ? '停止录音' : '录音跟读'}</Button></div>{recordUrl && <audio controls src={recordUrl} aria-label="我的跟读录音" />}<p className="text-xs text-slate-400">录音仅供本次回听，不上传、不自动评分。</p></div>}
            {stage === '练' && <div className="mx-auto mt-6 grid max-w-xl gap-2">{options.length < 2 ? <p className="text-xs text-amber-700">本单元释义不足两条，请先录入更多内容，也可使用“写”自测。</p> : options.map(option => <button key={option} onClick={() => { setAnswer(option); setRevealed(true); }} className={`rounded-lg border p-3 text-left text-sm ${answer === option ? option === item.meaning ? 'border-emerald-400 bg-emerald-50' : 'border-amber-400 bg-amber-50' : ''}`}>{option}</button>)}</div>}
            {stage === '拼' && <div className="mx-auto mt-6 max-w-xl space-y-3"><div className="min-h-11 rounded-lg border p-2 text-left text-sm">{assembled || '点击下方字母或词语进行拼写'}</div><div className="flex flex-wrap justify-center gap-2">{pieces.map((piece, i) => <button key={i} disabled={used.includes(i)} onClick={() => setUsed(current => [...current, i])} className="rounded-lg border bg-slate-50 px-3 py-2 text-sm disabled:opacity-30">{piece}</button>)}</div><div className="flex justify-center gap-2"><Button size="sm" variant="outline" onClick={() => setUsed([])}>重排</Button><Button size="sm" variant="outline" onClick={() => setRevealed(true)}>核对</Button></div></div>}
            {stage === '写' && <div className="mx-auto mt-6 max-w-xl"><Input aria-label="根据释义写出内容" value={answer} onChange={event => setAnswer(event.target.value)} placeholder="输入单词、短语或句子" /><Button variant="outline" className="mt-2" onClick={() => setRevealed(true)}>核对</Button></div>}
            {revealed && <p className="mt-4 text-sm font-medium text-slate-700">{correct ? '回答正确' : stage === '练' ? `正确释义：${item.meaning}` : `参考：${item.term}`}</p>}
            {message && <p role="status" className="mt-3 text-xs text-amber-700">{message}</p>}
        </div><div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4"><Button variant="outline" disabled={position === 0} onClick={() => move(-1)}>上一项</Button><div className="flex gap-2"><Button variant="ghost" onClick={() => onMastery(index, !item.mastered)}>{item.mastered ? '改为待复习' : '标记已掌握'}</Button><Button onClick={() => move(1)}>{position + 1 === order.length ? '完成' : '下一项'}</Button></div></div>
    </div>;
}
