import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { assistantPreferences, setAssistantPreferences, listTopics, createTopic, captureThought, topicDetail, topicThoughts, moveThought, editTopic, organizeTopic, retryClassification } from '../services/topics.js';
import { askAssistant, conversationHistory } from '../services/assistantChat.js';
import { aiCapture } from '../services/aiCapture.js';
import { createTask } from '../services/tasks.js';
import { textValue } from '../services/assistantModel.js';
import { copyKnowledgeToTopic } from '../services/topics.js';
import { undoable } from '../services/undo.js';

export function assistantRoutes(db: DatabaseSync) {
  const router=Router();
  const wrap=(fn:(req:Request,res:Response)=>unknown)=>(req:Request,res:Response,next:NextFunction)=>{Promise.resolve().then(()=>fn(req,res)).catch(next);};
  router.get('/state',wrap((_req,res)=>res.json({preferences:assistantPreferences(db),topics:listTopics(db),unassigned:topicThoughts(db,null),messages:conversationHistory(db)})));
  router.patch('/preferences',wrap((req,res)=>res.json(setAssistantPreferences(db,req.body))));
  router.post('/topics',wrap((req,res)=>res.status(201).json(createTopic(db,req.body.title))));
  router.post('/import-knowledge/:id',wrap((req,res)=>res.json(copyKnowledgeToTopic(db,String(req.params.id)))));
  router.get('/topics/:id',wrap((req,res)=>res.json(topicDetail(db,String(req.params.id)))));
  router.patch('/topics/:id',wrap((req,res)=>res.json(editTopic(db,String(req.params.id),req.body))));
  router.post('/topics/:id/organize',wrap(async(req,res)=>res.json(await organizeTopic(db,String(req.params.id)))));
  router.post('/thoughts',wrap((req,res)=>res.status(201).json(captureThought(db,req.body))));
  router.patch('/thoughts/:id',wrap((req,res)=>{
    if (req.body.topicId !== null && typeof req.body.topicId!=='string') throw new Error('请选择目标主题。');
    res.json(undoable(db,'thought',String(req.params.id),()=>{moveThought(db,String(req.params.id),req.body.topicId);return {ok:true};}));
  }));
  router.post('/classify/retry',wrap((_req,res)=>{retryClassification(db);res.json({ok:true});}));
  router.post('/chat',wrap(async(req,res)=>res.json(await askAssistant(db,req.body))));
  router.post('/capture',wrap(async(req,res)=>{
    const text=textValue(req.body.text,4000);
    const prefs=assistantPreferences(db);
    if (!prefs.aiEnabled) {
      const task=createTask(db,{title:text},'web');
      res.json({summary:'已按原文保存任务（AI 关闭）',task});
    } else { res.json(await aiCapture(db,text)); }
  }));
  return router;
}
