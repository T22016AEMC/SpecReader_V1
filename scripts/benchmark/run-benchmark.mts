import path from 'node:path';
import {DETERMINISTIC_BUDGET,UI_BUDGET,repoRoot,runBenchmark} from './benchmarkLib.mts';
// Usage: pnpm benchmark [--ui-budget] [--case <id>]...
// BENCHMARK_DIR (default ../benchmark, relative to the repository) and NOTES_DIR (default ../notes).
const args=process.argv.slice(2);
if(args.includes('--help')||args.includes('-h')){
 console.log('用法：pnpm benchmark [--ui-budget] [--case <案例id>]...\n環境變數：BENCHMARK_DIR（預設 ../benchmark）、NOTES_DIR（預設 ../notes）');
 process.exit(0);
}
const caseFilter:string[]=[];
for(let i=0;i<args.length;i++){
 if(args[i]==='--case'){const id=args[++i];if(!id){console.error('--case 需要案例 id');process.exit(2);}caseFilter.push(id);}
 else if(args[i]!=='--ui-budget'){console.error(`未知參數：${args[i]}`);process.exit(2);}
}
const fromEnv=(name:string,fallback:string)=>process.env[name]?path.resolve(process.cwd(),process.env[name]!):path.resolve(repoRoot,fallback);
const benchmarkDir=fromEnv('BENCHMARK_DIR','../benchmark'),notesDir=fromEnv('NOTES_DIR','../notes');
const budget=args.includes('--ui-budget')?UI_BUDGET:DETERMINISTIC_BUDGET;
console.log(`benchmark：${benchmarkDir}\n預算：${budget.mode==='ui'?'正式 UI（12 秒／120000 狀態）':'可重現（120000 狀態，時間上限 600 秒）'}`);
try {
 const outcome=await runBenchmark({benchmarkDir,notesDir,summaryDir:path.join(repoRoot,'validation','benchmark'),budget,caseFilter,log:message=>console.log(message)});
 if(outcome.status==='NO_CASES'){console.log(outcome.message);process.exit(0);}
 const {records,aggregate}=outcome.run!;
 console.log(`\n完成：${records.length} 個案例（已評測 ${aggregate.counts.evaluated}、略過 ${aggregate.counts.skipped}、錯誤 ${aggregate.counts.error}、synthetic ${aggregate.counts.synthetic}）`);
 for(const condition of ['noFormula','withFormula'] as const){
  const m=aggregate.aggregates[condition].overall;
  console.log(`${condition}: n=${m.n} top-1=${m.top1} top-5=${m.top5} top-10=${m.top10} 找到=${m.found} 正確分子式找到=${m.formulaFound} 執行錯誤=${m.errors}`);
 }
 console.log(`完整結果：${outcome.paths!.markdown}\n倉庫匯總：${outcome.paths!.summary??'未寫入（--case 為局部結果，不覆蓋倉庫匯總）'}`);
}catch(error){
 console.error(`評測失敗：${error instanceof Error?error.message:String(error)}`);
 process.exit(1);
}
