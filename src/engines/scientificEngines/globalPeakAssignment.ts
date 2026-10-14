/** Maximum weight bipartite assignment, including unmatched dummy columns.
 * Hungarian O(n^3); bounded by the caller's measured/predicted peak lists.
 * Rows are observations, columns are independent predicted environments.
 */
export function globalPeakAssignment(weights:number[][]):Map<number,number> {
  // Protect interactive browsers against accidentally uploaded dense peak lists.
  // The ledger retains excess observations as unmatched and reports this bound.
  weights=weights.slice(0,128).map(row=>row.slice(0,128));
  const n=weights.length,m=Math.max(n,...weights.map(r=>r.length),0);
  const u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
  for(let i=1;i<=n;i++){
    p[0]=i;let j0=0;const min=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);
    do {
      used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
      for(let j=1;j<=m;j++)if(!used[j]){
        const cur=-(weights[i0-1]?.[j-1]??0)-u[i0]-v[j];
        if(cur<min[j]){min[j]=cur;way[j]=j0;}
        if(min[j]<delta){delta=min[j];j1=j;}
      }
      for(let j=0;j<=m;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;
      j0=j1;
    }while(p[j0]!==0);
    do {const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
  }
  const out=new Map<number,number>();
  for(let j=1;j<=m;j++)if(p[j]&&(weights[p[j]-1]?.[j-1]??0)>0)out.set(p[j]-1,j-1);
  return out;
}
