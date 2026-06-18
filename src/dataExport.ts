import { getLocalDataExport } from './storage'

const getExportFileName = (exportedAt: string): string =>
  `scrimba-learning-tracker-${exportedAt.slice(0, 10)}.json`

export const downloadLocalDataExport = async (): Promise<string> => {
  const exportData = await getLocalDataExport()
  const fileName = getExportFileName(exportData.exportedAt)
  const blob = new Blob([`${JSON.stringify(exportData, null, 2)}\n`], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)

  return fileName
}
