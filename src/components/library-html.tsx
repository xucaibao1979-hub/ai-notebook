"use client";
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle} from './ui/dialog';
import {Button} from './ui/button';
export function LibraryHtml({html}:{html:string}){
    const [image,setImage]=useState('');const [zoom,setZoom]=useState(1);const [failed,setFailed]=useState(false);
    const images=[...html.matchAll(/<img\b[^>]*src=["']([^"']+)["']/gi)].map(m=>m[1]);
    const open=(src:string)=>{setZoom(1);setImage(src);};
    return <>
        {images.length>0&&<div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>共 {images.length} 张图片 · 点击图片可放大</span><Button size="sm" variant="outline" onClick={()=>open(images[0])}>放大查看原卷 / 题图</Button></div>}
        <div className="library-question-content" onClickCapture={e=>{if(e.target instanceof HTMLImageElement)open(e.target.src);}} onErrorCapture={()=>setFailed(true)} dangerouslySetInnerHTML={{__html:html}}/>
        {failed&&<p role="alert" className="mt-3 text-xs text-amber-700">部分题图加载失败，请尝试其他来源或查看原始出处。</p>}
        <Dialog open={!!image} onOpenChange={open=>{if(!open)setImage('');}}><DialogContent className="max-h-[90vh] max-w-[95vw] overflow-auto sm:max-w-[1100px]"><DialogTitle>原卷与题图放大查看</DialogTitle><div className="flex flex-wrap items-center gap-3"><label className="text-sm">缩放<select aria-label="原卷图片缩放" className="ml-2 rounded border p-1" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[1,1.5,2,3].map(v=><option key={v} value={v}>{v*100}%</option>)}</select></label>{images.length>1&&<select aria-label="原卷图片页码" className="rounded border p-1 text-sm" value={images.findIndex(src=>image===src||image.endsWith(src))} onChange={e=>open(images[Number(e.target.value)])}>{images.map((_,i)=><option key={i} value={i}>第 {i+1} 页</option>)}</select>}<a href={image} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">打开原尺寸图片</a></div><div className="max-h-[65vh] overflow-auto">{/* Public exam originals keep their native dimensions for zooming. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image||undefined} alt="放大的原卷或题图" style={{width:`${zoom*100}%`,maxWidth:'none'}} /></div></DialogContent></Dialog>
    </>;
}
