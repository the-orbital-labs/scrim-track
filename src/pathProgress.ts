import { getStorageValue, setStorageValue, updateStorageValue } from './storage'
import type { AverageWindowDays, PathProgress } from './storage'

const averageWindowValues = new Set<AverageWindowDays>([7, 14, 30, 'all'])

export const parseAverageWindowDays = (value: string): AverageWindowDays =>
  value === 'all' ? 'all' : Number(value) as 7 | 14 | 30

export const isValidAverageWindowDays = (value: unknown): value is AverageWindowDays =>
  averageWindowValues.has(value as AverageWindowDays)

export const isValidPathName = (value: string): boolean =>
  value.trim().length > 0

export const isValidProgressPercentage = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 100

export const isValidTotalEstimatedHours = (value: number): boolean =>
  Number.isFinite(value) && value > 0

const normalizePercentage = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(100, Math.max(0, value))
}

const normalizeTotalHours = (
  value: number,
  fallback: number,
): number => (Number.isFinite(value) && value > 0 ? value : fallback)

const normalizeAverageWindow = (value: unknown): AverageWindowDays =>
  isValidAverageWindowDays(value)
    ? (value as AverageWindowDays)
    : 7

const normalizePathProgress = (pathProgress: PathProgress): PathProgress => ({
  pathName: pathProgress.pathName.trim(),
  totalEstimatedHours: normalizeTotalHours(pathProgress.totalEstimatedHours, 1),
  progressPercentage: normalizePercentage(pathProgress.progressPercentage),
  averageWindowDays: normalizeAverageWindow(pathProgress.averageWindowDays),
})

export const getPathProgress = async (): Promise<PathProgress> =>
  normalizePathProgress(await getStorageValue('pathProgress'))

export const savePathName = (pathName: string): Promise<PathProgress> =>
  updateStorageValue('pathProgress', (pathProgress) =>
    normalizePathProgress({
      ...pathProgress,
      pathName,
    }),
  )

export const saveTotalEstimatedHours = (
  totalEstimatedHours: number,
): Promise<PathProgress> =>
  updateStorageValue('pathProgress', (pathProgress) =>
    normalizePathProgress({
      ...pathProgress,
      totalEstimatedHours: normalizeTotalHours(
        totalEstimatedHours,
        pathProgress.totalEstimatedHours,
      ),
    }),
  )

export const saveProgressPercentage = (
  progressPercentage: number,
): Promise<PathProgress> =>
  updateStorageValue('pathProgress', (pathProgress) =>
    normalizePathProgress({
      ...pathProgress,
      progressPercentage,
    }),
  )

export const saveAverageWindowDays = (
  averageWindowDays: AverageWindowDays,
): Promise<PathProgress> =>
  updateStorageValue('pathProgress', (pathProgress) =>
    normalizePathProgress({
      ...pathProgress,
      averageWindowDays,
    }),
  )

export const ensurePathProgress = async (): Promise<PathProgress> => {
  const pathProgress = await getPathProgress()

  await setStorageValue('pathProgress', pathProgress)

  return pathProgress
}
