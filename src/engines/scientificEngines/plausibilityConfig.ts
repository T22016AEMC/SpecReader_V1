/**
 * Chemical-plausibility gate (v1.1.7-hotfix.1). Windows for the specific evidence that allows otherwise unstable
 * linkages. Engineering defaults; not calibrated.
 */
export const PLAUSIBILITY_CONFIG = {
  /** N–O single-bond stretch (hydroxylamines, oximes, N–O–N) (cm⁻¹); presence of a marked band is required. */
  irNOStretchRange: [900, 1000] as [number, number],
  /** N-oxide N→O stretch (cm⁻¹); presence of a marked band is required. */
  irNOxideRange: [1200, 1300] as [number, number],
  /** Azide / diazo cumulated N stretch (cm⁻¹); a strong band is required. */
  irCumulatedNRange: [2100, 2160] as [number, number],
  /** Ketene C=C=O stretch (cm⁻¹, ~2150); a strong band is required. */
  irKeteneRange: [2120, 2180] as [number, number],
  /** "Strong": at least this fraction of the strongest marked IR band; unknown intensity is not strong. */
  strongRelativeIntensity: 0.5,
} as const;
