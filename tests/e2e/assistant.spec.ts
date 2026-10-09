import { test, expect } from '@playwright/test';

test('TC-TOPIC-010 captures a thought, inspects source, edits and restores a topic',async({page,request})=>{
  const title='论文主题 '+Date.now();
  await page.goto('/');
  await page.getByRole('button',{name:'助理',exact:true}).click();
  await page.getByRole('button',{name:'记想法',exact:true}).click();
  await page.getByText('新建笔记',{exact:true}).click();
  await page.getByLabel('新主题名称').fill(title);
  await page.getByRole('button',{name:'新建主题',exact:true}).click();
  await expect(page.getByLabel('当前主题').first()).not.toHaveValue('');
  await page.getByLabel('告诉助理').fill('可能补两种边界条件，还没决定。');
  await page.getByLabel('告诉助理').press('Enter');
  await expect(page.getByRole('status')).toContainText('原文已保存');
  await page.getByRole('button',{name:'查看保存位置'}).click();
  await page.getByText('原始记录（1）',{exact:true}).click();
  await expect(page.getByText('可能补两种边界条件，还没决定。',{exact:true})).toBeVisible();
  const state=await (await request.get('/api/assistant/state')).json();
  const t=state.topics.find((item:any)=>item.title===title);
  await request.patch('/api/assistant/topics/'+t.id,{data:{revision:t.revision,summary:'方案：可能补两种，尚未决定。'}});
  await page.reload();await page.getByRole('button',{name:'知识库',exact:true}).click();
  await page.locator('.library-entry').filter({hasText:title}).click();
  await expect(page.getByText('方案：可能补两种，尚未决定。',{exact:true})).toBeVisible();
  await page.getByText('更多',{exact:true}).click();
  await page.getByRole('button',{name:'编辑整理稿',exact:true}).click();
  await page.getByLabel('编辑整理稿').fill('改为先验证一种。');
  await page.getByRole('button',{name:'保存整理稿',exact:true}).click();
  await expect(page.getByText('改为先验证一种。',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'历史版本',exact:true}).click();
  const history=page.locator('.topic-history details').last();await history.locator('summary').click();
  await history.getByRole('button',{name:'恢复此版本并暂停自动改写'}).click();
  await expect(page.locator('.topic-summary')).toHaveText('方案：可能补两种，尚未决定。');
  await expect(page.getByRole('button',{name:'恢复自动整理',exact:true})).toBeVisible();
  await page.screenshot({path:'.test-data/topic-desktop.png',fullPage:true});
});

test('assistant opens from small week widget and supports a local question',async({page})=>{
  await page.setViewportSize({width:440,height:620});await page.goto('/?view=week');
  await page.getByRole('button',{name:'问助理 / 想法'}).click();
  await page.getByLabel('告诉助理').fill('今天先做什么？');await page.getByRole('button',{name:'发送问题'}).click();
  await expect(page.locator('.conversation-message.assistant').last()).toContainText('本地推荐');
  await page.screenshot({path:'.test-data/assistant-widget.png'});
  await page.getByRole('button',{name:'返回周计划'}).click();
  await expect(page.getByPlaceholder('输入一个任务……')).toBeVisible();
});

test('TC-UX-002 keyboard capture respects multiline and composition; drafts stay separate',async({page,request})=>{
  await page.goto('/');await page.getByRole('button',{name:'助理',exact:true}).click();
  await page.getByRole('button',{name:'记想法',exact:true}).click();
  const input=page.getByLabel('告诉助理');const prefix='键盘测试 '+Date.now();
  await input.fill(prefix);await input.press('Control+Enter');await input.pressSequentially('second line');
  await expect(input).toHaveValue(prefix+'\nsecond line');
  await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});
  await expect(input).toHaveValue(prefix+'\nsecond line');
  await page.getByRole('button',{name:'问助理',exact:true}).click();await expect(input).toHaveValue('');
  await page.getByRole('button',{name:'记想法',exact:true}).click();await expect(input).toHaveValue(prefix+'\nsecond line');
  await input.press('Enter');await expect(input).toHaveValue('');await expect(input).toBeFocused();
  const state=await(await request.get('/api/assistant/state')).json();expect(state.unassigned.filter((t:any)=>t.raw_text===prefix+'\nsecond line')).toHaveLength(1);
});

test('TC-UX-001/003 library metadata and three pages; TC-UX-006 complete and undo',async({page,request})=>{
  const title='待办 '+Date.now();const task=(await(await request.post('/api/tasks',{data:{task:{title,status:'scheduled',startAt:'2099-01-01',deadlineAt:'2099-01-03'}}})).json()).task;
  const topic=await(await request.post('/api/assistant/topics',{data:{title:'秋招 '+Date.now()}})).json();
  await page.goto('/');await expect(page.getByRole('heading',{name:'秋招进展',exact:true})).toHaveCount(0);
  const row=page.locator('.simple-task-row').filter({hasText:title});await expect(row).toContainText('距截止');
  await row.getByTitle('完成',{exact:true}).click();await expect(row).toHaveCount(0);
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(row).toBeVisible();
  const restored=await(await request.get('/api/tasks/'+task.id+'/details')).json();expect(restored.task.status).toBe('scheduled');
  await page.getByRole('button',{name:'知识库',exact:true}).click();await page.locator('.library-entry').filter({hasText:topic.title}).click();
  await page.getByText('更多',{exact:true}).click();await page.getByRole('button',{name:'名称与分类'}).click();
  await page.getByLabel('笔记名称').fill('岗位匹配与简历调整');await page.getByLabel('笔记主题').fill('秋招');await page.getByLabel('笔记类型').selectOption('sop');await page.getByRole('button',{name:'保存名称与分类'}).click();
  await expect(page.getByRole('heading',{name:'岗位匹配与简历调整',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.getByLabel('搜索知识库').fill('岗位匹配');
  await expect(page.locator('.library-entry')).toHaveCount(1);await expect(page.locator('.library-entry')).toContainText('秋招 · SOP');
  await page.screenshot({path:'.test-data/library-redesign.png',fullPage:true});
});
