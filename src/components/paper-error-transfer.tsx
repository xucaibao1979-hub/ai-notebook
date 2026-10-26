"use client";
import {useState} from 'react';
import {Button} from './ui/button';
import {apiClient,friendlyApiError} from '@/lib/api-client';
import Link from 'next/link';
export function PaperErrorTransfer({paperId,number,answer}:{paperId:string;number:string;answer:string}){const [id,setId]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);async function transfer(){setBusy(true);try{const r=await apiClient.post<{id:string}>('/api/knowledge-library/error',{paperId,number,answer});setId(r.id);}catch(e){setMessage(friendlyApiError(e));}finally{setBusy(false);}}return <div className="mt-3 flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={busy||!answer.trim()||!!id} onClick={transfer}>{id?'已加入错题本':'本题答错 · 加入错题本'}</Button>{id&&<Link href={'/error-items/'+id} className="text-xs text-indigo-600">查看错题</Link>}{message&&<p role="alert" className="text-xs text-red-500">{message}</p>}</div>;}
