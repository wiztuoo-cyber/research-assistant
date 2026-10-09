import React from 'react';
import DOMPurify from 'dompurify';
import {marked} from 'marked';

export function Markdown({text}:{text:string}){
  return <div className="knowledge-prose" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(marked.parse(text,{async:false}) as string)}}/>;
}
