import {listKnowledgeCategories,createKnowledgeCategory,renameKnowledgeCategory,deleteKnowledgeCategory} from '../services/knowledgeCategories.js';
import {listReviews,getReview,startReview,respondReview,saveReview,exportReview} from '../services/reviews.js';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { assistantPreferences, setAssistantPreferences, listTopics, createTopic, captureThought, topicDetail, topicThoughts, moveThought, editTopic, organizeTopic, retryClassification, assignThoughtCategory } from '../services/topics.js';
import { askAssistant, conversationHistory } from '../services/assistantChat.js';
import { aiCapture } from '../services/aiCapture.js';
import { createTask } from '../services/tasks.js';
import { textValue } from '../services/assistantModel.js';
import { copyKnowledgeToTopic } from '../services/topics.js';
import { undoable } from '../services/undo.js';
import {saveImage,extractImage} from '../services/knowledgeSources.js';
import {visionSettings,saveVisionSettings} from '../services/settings.js';
import {mergeTopics,moveKnowledgeCard} from '../services/libraryManagement.js';

export function assistantRoutes(db: DatabaseSync) {
  const router=Router();
  const wrap=(fn:(req:Request,res:Response)=>unknown)=>(req:Request,res:Response,next:NextFunction)=>{Promise.resolve().then(()=>fn(req,res)).catch(next);};
  router.get('/reviews',wrap((_req,res)=>res.json(listReviews(db))));
  router.post('/reviews',wrap((req,res)=>res.json(startReview(db,req.body))));
  router.get('/reviews/:id',wrap((req,res)=>res.json(getReview(db,String(req.params.id)))));
  router.post('/reviews/:id/respond',wrap(async(req,res)=>res.json(await respondReview(db,String(req.params.id),req.body))));
  router.patch('/reviews/:id',wrap((req,res)=>res.json(saveReview(db,String(req.params.id),req.body))));
  router.post('/reviews/:id/export',wrap((req,res)=>res.json(exportReview(db,String(req.params.id),req.body))));
  router.get('/vision',wrap((_req,res)=>res.json(visionSettings())));
  router.post('/vision',wrap((req,res)=>res.json(saveVisionSettings(req.body))));
  router.post('/images',wrap((req,res)=>res.status(201).json(saveImage(db,req.body.dataUrl))));
  router.post('/images/:id/extract',wrap(async(req,res)=>res.json({text:await extractImage(db,String(req.params.id))})));
  router.get('/images/:id',wrap((req,res)=>{const row=db.prepare('select mime,data from knowledge_images where id=?').get(String(req.params.id));if(!row){res.sendStatus(404);return;}res.set('content-type',String(row.mime)).set('X-Content-Type-Options','nosniff').send(Buffer.from(String(row.data),'base64'));}));
  router.get('/state',wrap((_req,res)=>res.json({categories:listKnowledgeCategories(db),preferences:assistantPreferences(db),topics:listTopics(db),unassigned:topicThoughts(db,null),messages:conversationHistory(db)})));
  router.post('/categories',wrap((req,res)=>res.json(createKnowledgeCategory(db,req.body.name))));
  router.delete('/categories',wrap((req,res)=>res.json(deleteKnowledgeCategory(db,req.body.from,req.body.to))));
  router.patch('/categories',wrap((req,res)=>res.json(renameKnowledgeCategory(db,req.body.from,req.body.name))));
  router.patch('/preferences',wrap((req,res)=>res.json(setAssistantPreferences(db,req.body))));
  router.post('/cards/move',wrap((req,res)=>{const kind=req.body.kind==='legacy'?'knowledge':'card';res.json(undoable(db,kind,String(req.body.id),()=>moveKnowledgeCard(db,req.body)));}));
  router.post('/topics',wrap((req,res)=>res.status(201).json(createTopic(db,req.body.title))));
  router.post('/topics/:id/merge',wrap((req,res)=>res.json(mergeTopics(db,String(req.params.id),String(req.body.targetId)))));
  router.post('/import-knowledge/:id',wrap((req,res)=>res.json(copyKnowledgeToTopic(db,String(req.params.id)))));
  router.get('/topics/:id',wrap((req,res)=>res.json(topicDetail(db,String(req.params.id)))));
  router.patch('/topics/:id',wrap((req,res)=>{const id=String(req.params.id);const metadata=['title','category','kind'].some(k=>Object.hasOwn(req.body,k));res.json(metadata?undoable(db,'topic',id,()=>editTopic(db,id,req.body)):editTopic(db,id,req.body));}));
  router.post('/topics/:id/organize',wrap(async(req,res)=>res.json(await organizeTopic(db,String(req.params.id)))));
  router.post('/thoughts',wrap((req,res)=>res.status(201).json(captureThought(db,req.body))));
  router.patch('/thoughts/:id',wrap((req,res)=>{
    if (req.body.topicId !== null && typeof req.body.topicId!=='string') throw new Error('请选择目标主题。');
    res.json(undoable(db,'thought',String(req.params.id),()=>{moveThought(db,String(req.params.id),req.body.topicId);return {ok:true};}));
  }));
  router.post('/classify/retry',wrap(async(_req,res)=>res.json(await retryClassification(db))));
  router.post('/thoughts/:id/category',wrap((req,res)=>res.json(assignThoughtCategory(db,String(req.params.id),req.body.category))));
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
