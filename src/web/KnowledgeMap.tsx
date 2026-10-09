import React,{useEffect,useRef} from 'react';
import {Transformer} from 'markmap-lib';
import {Markmap} from 'markmap-view';
import DOMPurify from 'dompurify';
import {marked} from 'marked';

export function Markdown({text}:{text:string}){
  return <div className="knowledge-prose" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(marked.parse(text,{async:false}) as string)}}/>;
}
export function KnowledgeMap({markdown,onSelect}:{markdown:string;onSelect:(id:string)=>void}){
  const ref=useRef<SVGSVGElement>(null),map=useRef<Markmap|null>(null),box=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const transformer=new Transformer();const {root}=transformer.transform(markdown);
    function sanitize(node:any){node.content=DOMPurify.sanitize(node.content,{ALLOWED_TAGS:['a','strong','em','code'],ALLOWED_ATTR:['href']});node.children?.forEach(sanitize);}sanitize(root);
    const instance=Markmap.create(ref.current,{autoFit:true,initialExpandLevel:4,duration:200,maxWidth:200,color:node=>['#647dc6','#779d82','#b38ac1','#c19866'][Math.max(0,node.state.path.split('.').length-2)%4]},root);map.current=instance;
    const observer=new ResizeObserver(()=>void instance.fit());observer.observe(ref.current);
    return()=>{observer.disconnect();instance.destroy();};
  },[markdown]);
  return <div ref={box} className="knowledge-map" onClick={e=>{const link=(e.target as Element).closest('a');if(link){e.preventDefault();const href=link.getAttribute('href')??'';if(href.startsWith('#node-'))onSelect(decodeURIComponent(href.slice(6)));}}}>
    <div className="map-tools"><button onClick={()=>void map.current?.fit()}>回到全图</button><button onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void box.current?.requestFullscreen();}}>全屏</button></div><svg ref={ref} aria-label="知识导图"/>
  </div>;
}
