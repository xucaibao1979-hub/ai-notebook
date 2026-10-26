"use client";
import {useEffect,useState} from 'react';
import {learningDateKey} from '@/lib/learning';
const quotes=['今天多懂一点，明天就多一分从容。','把大目标拆成小进步，每一步都算数。','错题是路标，带你找到下一次进步的方向。','专注眼前这一题，让努力慢慢变成实力。','不必一下走得很远，只要每天向前一点。','认真复盘的每一次错误，都会成为你的收获。','稳稳地坚持，你会看见自己的成长。','学会一道题，也是在给未来的自己加油。','允许自己慢一点，但别停下探索的脚步。','今天的积累，会在需要的时候给你底气。'];
export function DailyMotivation(){const [quote,setQuote]=useState('');useEffect(()=>{const update=()=>{const key=learningDateKey();let index=localStorage.getItem('motivation:'+key);if(index===null){index=String(Math.floor(Math.random()*quotes.length));localStorage.setItem('motivation:'+key,index);}setQuote(quotes[Number(index)] || quotes[0]);};update();const timer=setInterval(update,60000);return()=>clearInterval(timer);},[]);return <aside className="max-w-sm rounded-xl border border-indigo-100 bg-white/80 px-4 py-3 text-sm leading-6 text-indigo-600"><p className="mb-1 text-[11px] text-slate-400">每日一句</p>{quote || '每天向前一点，每一步都算数。'}</aside>;}
