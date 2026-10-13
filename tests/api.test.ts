import {describe,it,expect} from 'vitest';
import request from 'supertest';
import {createApp} from '../server';
describe('公開 API 基準',()=>{
  it('健康檢查不需要外部 AI API',async()=>{
    const app=await createApp({serveClient:false});
    const res=await request(app).get('/api/health');
    expect(res.status).toBe(200);expect(res.body.status).toBe('ok');
  });
  it('未知 API 與非法 JSON 回傳受控錯誤',async()=>{
    const app=await createApp({serveClient:false});
    expect((await request(app).get('/api/not-a-route')).status).toBe(404);
    const invalid=await request(app).post('/api/analyze').set('Content-Type','application/json').send('{broken');
    expect(invalid.status).toBe(400);expect(JSON.stringify(invalid.body)).not.toContain('server.ts');
  });
  it('API 頻率限制與過大上傳可控，健康檢查仍可用',async()=>{
    const app=await createApp({serveClient:false});
    for(let i=0;i<30;i++)await request(app).get('/api/system-status');
    expect((await request(app).get('/api/system-status')).status).toBe(429);
    expect((await request(app).get('/api/health')).status).toBe(200);
    const app2=await createApp({serveClient:false});
    expect((await request(app2).post('/api/analyze').send({data:'x'.repeat(13*1024*1024)})).status).toBe(413);
  });
});
