export type JsonModel = (system: string, input: unknown) => Promise<unknown>;

// Small shared boundary: timeouts and strict JSON; never return provider bodies/keys in errors.
export const assistantModel: JsonModel = async (system, input) => {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new Error('请先在设置中配置 DeepSeek。');
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(60_000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      response_format: { type: 'json_object' }, max_tokens: 6000,
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek 请求失败（${response.status}），请稍后重试。`);
  const data = await response.json() as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
  if (data.choices?.[0]?.finish_reason === 'length') throw new Error('整理结果过长，请拆分主题后重试。');
  try { return JSON.parse(data.choices?.[0]?.message?.content ?? ''); }
  catch { throw new Error('AI 返回格式不正确，原有内容已保留。'); }
};

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的数据格式。');
  return value as Record<string, unknown>;
}

export function textValue(value: unknown, max = 8000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`请输入 1–${max} 字符的内容。`);
  return value;
}
