import { test, expect } from '@playwright/test';

test('TC-TOPIC-010 captures a thought, inspects source, edits and restores a topic',async({page,request})=>{
  const title='论文主题 '+Date.now();
  await page.goto('/');
  await page.getByLabel('新主题名称').fill(title);
  await page.getByRole('button',{name:'新建主题',exact:true}).click();
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await page.getByLabel('操作类型').selectOption('idea');
  await page.getByLabel('告诉助理').fill('可能补两种边界条件，还没决定。');
  await page.getByRole('button',{name:'保存记录',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('已保存原文');
  await page.getByText('原始记录（1）',{exact:true}).click();
  await expect(page.getByText('可能补两种边界条件，还没决定。',{exact:true})).toBeVisible();
  const state=await (await request.get('/api/assistant/state')).json();
  const t=state.topics.find((item:any)=>item.title===title);
  await request.patch('/api/assistant/topics/'+t.id,{data:{revision:t.revision,summary:'方案：可能补两种，尚未决定。'}});
  await page.reload();await page.getByLabel('当前主题').selectOption(t.id);
  await expect(page.getByText('方案：可能补两种，尚未决定。',{exact:true})).toBeVisible();
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
