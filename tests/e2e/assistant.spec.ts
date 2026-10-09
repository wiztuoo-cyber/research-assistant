import {test,expect} from '@playwright/test';

test('TC-0903 screenshot capture persists extraction and post source',async({page,request})=>{
 await page.route('**/api/assistant/images/*/extract',route=>route.fulfill({json:{text:'截图观点：机械专业适合某些岗位。'}}));
 await page.goto('/');await page.getByRole('button',{name:'助理',exact:true}).click();await page.getByRole('button',{name:'💡 想法',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'post.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==','base64')});
 await expect(page.getByAltText('待保存截图')).toBeVisible();await page.getByText('帖子来源（选填）',{exact:true}).click();await page.getByLabel('帖子标题').fill('专业讨论截图');await page.getByLabel('帖子链接').fill('https://example.com/original');await page.getByRole('button',{name:'保存想法',exact:true}).click();await expect(page.getByAltText('待保存截图')).toHaveCount(0);
 const state=await(await request.get('/api/assistant/state')).json();const thought=state.unassigned.find((s:any)=>s.source_title==='专业讨论截图');expect(thought.raw_text).toContain('截图观点');expect(thought.source_url).toBe('https://example.com/original');
});

test('TC-0901 toggles, drafts, multiline and latest question first',async({page,request})=>{
 await page.goto('/');await page.getByRole('button',{name:'助理',exact:true}).click();
 const input=page.getByLabel('告诉助理');await page.getByRole('button',{name:'💡 想法',exact:true}).click();
 const text='键盘 '+Date.now();await input.fill(text);await input.press('Control+Enter');await input.pressSequentially('second line');await expect(input).toHaveValue(text+'\nsecond line');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});await expect(input).toHaveValue(text+'\nsecond line');
 await page.getByRole('button',{name:'💡 想法',exact:true}).click();await expect(input).toHaveValue('');await page.getByRole('button',{name:'💡 想法',exact:true}).click();await expect(input).toHaveValue(text+'\nsecond line');await input.press('Enter');await expect(input).toHaveValue('');
 const state=await(await request.get('/api/assistant/state')).json();expect(state.unassigned.some((t:any)=>t.raw_text===text+'\nsecond line')).toBe(true);
 await page.getByRole('button',{name:'💡 想法',exact:true}).click();await input.fill('今天先做什么？');await input.press('Enter');await expect(page.locator('.conversation-message.assistant').first()).toContainText('本地推荐');await input.fill('所有未完成任务');await input.press('Enter');await expect(page.locator('.conversation-message.user').first()).toContainText('所有未完成任务');
});
test('TC-0902 map, sources, metadata, editing, backdrop and history',async({page,request})=>{
 const topic=await(await request.post('/api/assistant/topics',{data:{title:'简历 '+Date.now()}})).json();
 await request.post('/api/assistant/thoughts',{data:{text:'按岗位调整项目经历',topicId:topic.id,sourceTitle:'帖子A',sourceUrl:'https://example.com/a'}});
 let detail=await(await request.get('/api/assistant/topics/'+topic.id)).json();await request.patch('/api/assistant/topics/'+topic.id,{data:{revision:detail.topic.revision,summary:'## 岗位匹配\n\n根据岗位调整简历。'}});
 await page.goto('/');await page.getByRole('button',{name:'知识库',exact:true}).click();await expect(page.getByLabel('知识导图')).toBeVisible();await page.locator('.library-entry').filter({hasText:topic.title}).click();await expect(page.getByRole('heading',{name:'岗位匹配',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'名称与分类',exact:true}).click();await page.getByLabel('笔记主题').fill('秋招');await page.getByRole('button',{name:'保存名称与分类'}).click();await page.getByText(/^来源（/).click();await expect(page.getByRole('link',{name:'打开原帖'})).toHaveAttribute('href','https://example.com/a');
 await page.getByRole('button',{name:'编辑正文'}).click();await page.getByLabel('编辑整理稿').fill('## 修改步骤\n\n先读岗位要求。');await page.getByRole('button',{name:'保存正文'}).click();await expect(page.getByRole('heading',{name:'修改步骤'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'知识详情'})).toHaveCount(0);
 await page.locator('.library-entry').filter({hasText:topic.title}).click();await page.locator('.drawer-backdrop').click({position:{x:5,y:5}});await expect(page.getByRole('dialog',{name:'知识详情'})).toHaveCount(0);await page.screenshot({path:'.test-data/library-029.png',fullPage:true});
});
test('TC-0904 task layout and schedule cancellation undo',async({page,request})=>{
 const title='待办 '+Date.now();await request.post('/api/tasks',{data:{task:{title,startAt:'2099-01-01',deadlineAt:'2099-01-03'}}});
 const event=(await(await request.post('/api/personal/schedule',{data:{title:'旧面试 '+Date.now(),start_at:'2020-01-01'}})).json()).item;
 await page.goto('/');await expect(page.getByRole('button',{name:'帮我排优先级'})).toHaveCount(0);await expect(page.getByRole('button',{name:'打开周挂件'})).toBeVisible();await expect(page.locator('.later-column')).toContainText(title);await page.getByText('过去或未安排的固定事项',{exact:true}).click();await page.getByRole('button',{name:new RegExp(event.title)}).click();await page.getByRole('button',{name:'取消事项',exact:true}).click();await expect(page.getByRole('dialog',{name:'事项详情'})).toHaveCount(0);await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByText('过去或未安排的固定事项',{exact:true}).click();await expect(page.getByRole('button',{name:new RegExp(event.title)})).toBeVisible();await page.screenshot({path:'.test-data/tasks-029.png',fullPage:true});
});
test('TC-0905 week calendar dots and bars; widget chat',async({page,request})=>{
 const day=new Date(),start=new Date(day.getFullYear(),day.getMonth(),day.getDate()),end=new Date(start);end.setDate(end.getDate()+2);
 const local=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 await request.post('/api/personal/schedule',{data:{title:'跨天测试',start_at:local(start),end_at:local(end)}});await request.post('/api/tasks',{data:{task:{title:'单日测试',startAt:local(start)}}});
 await page.goto('/?view=week');await expect(page.locator('.fc-daygrid-dot-event').filter({hasText:'单日测试'})).toBeVisible();await expect(page.locator('.fc-daygrid-block-event').filter({hasText:'跨天测试'}).first()).toBeVisible();await page.screenshot({path:'.test-data/week-029.png',fullPage:true});
 await page.getByRole('button',{name:'助理',exact:true}).click();await page.getByLabel('告诉助理').fill('今天先做什么？');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.locator('.conversation-message.assistant').first()).toContainText('本地推荐');await page.getByRole('button',{name:'返回周计划'}).click();await expect(page.getByPlaceholder('输入一个任务……')).toBeVisible();
});
