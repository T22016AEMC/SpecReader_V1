import {describe,it,expect,vi} from 'vitest';
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
  it('PubChem 新欄位保留立體 SMILES 與單同位素質量（模擬外部契約）',async()=>{
    const mocked=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({PropertyTable:{Properties:[{CID:1,SMILES:'N[C@@H](C)C(=O)O',ConnectivitySMILES:'CC(N)C(=O)O',MolecularFormula:'C3H7NO2',MolecularWeight:89.09,ExactMass:89.047678,MonoisotopicMass:89.047678,InChI:'test'}]}}),{status:200,headers:{'content-type':'application/json'}}));
    try{
      const app=await createApp({serveClient:false});const r=await request(app).get('/api/pubchem/compound?q=alanine');
      expect(r.status).toBe(200);expect(r.body.canonicalSmiles).toContain('@@');expect(r.body.connectivitySmiles).toBe('CC(N)C(=O)O');expect(r.body.exactMass).toBe(89.047678);
      // PubChem CID 11205 實際欄位契約；化學參考值，非實測光譜。
      mocked.mockResolvedValueOnce(new Response(JSON.stringify({PropertyTable:{Properties:[{CID:11205,SMILES:'C(Br)(Br)(Br)Br',ConnectivitySMILES:'C(Br)(Br)(Br)Br',ExactMass:'331.66925',MonoisotopicMass:'327.67335'}]}}),{status:200}));
      const brominated=await request(app).get('/api/pubchem/compound?q=carbon-tetrabromide');
      expect(brominated.body.exactMass).toBe(327.67335);expect(brominated.body.mostAbundantIsotopeMass).toBe(331.66925);
    }finally{mocked.mockRestore();}
  });
  it('PubChem 失效是受控錯誤，健康與本地科學仍可用',async()=>{
    const mocked=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('synthetic upstream failure'));
    try{const app=await createApp({serveClient:false});const r=await request(app).get('/api/pubchem/compound?q=ethanol');expect(r.status).toBe(500);expect(r.body.found).toBe(false);expect(JSON.stringify(r.body)).not.toContain('synthetic upstream');expect((await request(app).get('/api/health')).status).toBe(200);}finally{mocked.mockRestore();}
  });
});
