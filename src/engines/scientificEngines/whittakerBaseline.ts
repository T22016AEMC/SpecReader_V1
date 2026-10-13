/** Independently derived banded Cholesky solver for (W + lambda D2' D2)z=Wy.
 * Eilers, A Perfect Smoother (2003), DOI 10.1021/ac034173t.
 * Asymmetric weights: p for positive residuals, 1-p otherwise.
 * No third-party implementation is copied. Complexity O(iterations * n).
 */
export function asymmetricBaseline(y:number[],lambda=1e8,p=.001,iterations=12):number[] {
  if (y.length<3) return y.slice();
  if (y.some(v=>!Number.isFinite(v)) || !(lambda>0) || !(p>0&&p<1)) throw new RangeError('Invalid baseline data');
  const n=y.length,w=new Float64Array(n).fill(1);
  let z=y.slice();
  for(let round=0;round<iterations;round++) {
    const diagonal=new Float64Array(n),off1=new Float64Array(n),off2=new Float64Array(n);
    for(let j=0;j<n-2;j++) {
      diagonal[j]+=lambda;diagonal[j+1]+=4*lambda;diagonal[j+2]+=lambda;
      off1[j+1]-=2*lambda;off1[j+2]-=2*lambda;off2[j+2]+=lambda;
    }
    const l0=new Float64Array(n),l1=new Float64Array(n),l2=new Float64Array(n),rhs=new Float64Array(n);
    for(let i=0;i<n;i++) {
      l2[i]=i>=2?off2[i]/l0[i-2]:0;
      l1[i]=i>=1?(off1[i]-l2[i]*l1[i-1])/l0[i-1]:0;
      const pivot=diagonal[i]+w[i]-l1[i]**2-l2[i]**2;
      if (!(pivot>0)) throw new RangeError('Baseline solver is ill-conditioned');
      l0[i]=Math.sqrt(pivot);
      rhs[i]=(w[i]*y[i]-(i>=1?l1[i]*rhs[i-1]:0)-(i>=2?l2[i]*rhs[i-2]:0))/l0[i];
    }
    for(let i=n-1;i>=0;i--) z[i]=(rhs[i]-(i+1<n?l1[i+1]*z[i+1]:0)-(i+2<n?l2[i+2]*z[i+2]:0))/l0[i];
    for(let i=0;i<n;i++) w[i]=y[i]>z[i]?p:1-p;
  }
  return z;
}
