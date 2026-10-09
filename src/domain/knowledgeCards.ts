export interface KnowledgePoint {kind:'idea'|'decision'|'question'|'alternative';text:string;sourceIds:string[];chapter?:string;title?:string;category?:string;categoryLocked?:boolean}
export function knowledgeCards(topic:{title:string;summary:string;points_json:string}):KnowledgePoint[]{
  try{const points=JSON.parse(topic.points_json) as KnowledgePoint[];if(Array.isArray(points)&&points.length)return points;}catch{/* Legacy summaries remain readable. */}
  return [{kind:'idea',title:topic.title,text:topic.summary,sourceIds:[]}];
}
export function cardTitle(point:KnowledgePoint){return point.title||point.text.replace(/[#*`>]/g,'').split(/[。！\n]/)[0].slice(0,48)||'待整理笔记';}
