export const ELECTRON_MASS = .000548579909065;
export const PROTON_MASS = 1.007276466621;
export type IonAdduct = '[M]+•' | '[M+H]+' | '[M+Na]+' | '[M+NH4]+' | '[M-H]-';
export function ionMz(neutralMass:number, adduct:IonAdduct, charge=1):number {
  if (!Number.isFinite(neutralMass) || neutralMass<=0 || !Number.isInteger(charge) || charge===0) throw new RangeError('Invalid mass or charge');
  const z=Math.abs(charge);
  const addition=adduct==='[M+H]+'?PROTON_MASS*z:adduct==='[M-H]-'?-PROTON_MASS*z:adduct==='[M+Na]+'?22.9897692820-ELECTRON_MASS:adduct==='[M+NH4]+'?18.033825553-ELECTRON_MASS:-ELECTRON_MASS*z;
  if (z>1 && (adduct==='[M+Na]+' || adduct==='[M+NH4]+')) throw new RangeError('Multi-adduct stoichiometry must be specified explicitly');
  return (neutralMass+addition)/z;
}
export function massError(observed:number,theoretical:number):{da:number;ppm:number} {
  if (!Number.isFinite(observed)||!Number.isFinite(theoretical)||theoretical<=0) throw new RangeError('Invalid m/z');
  return {da:observed-theoretical,ppm:1e6*(observed-theoretical)/theoretical};
}
export function neutralMassFromIon(mz:number,adduct:IonAdduct,charge=1):number {
  const z=Math.abs(charge);
  if (!Number.isFinite(mz)||mz<=0||!Number.isInteger(z)||z===0) throw new RangeError('Invalid m/z or charge');
  return mz*z-(ionMz(100,adduct,charge)*z-100);
}
