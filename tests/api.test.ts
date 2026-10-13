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
});
