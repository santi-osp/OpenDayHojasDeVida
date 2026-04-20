import type { jsPDF } from 'jspdf'
import type { BatchAnalysisResponse, CvAnalysisResult } from '../types/cv'

function buildTimestampFragment(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    return `${year}${month}${day}-${hours}${minutes}`
}

function downloadBlob(content: Blob, fileName: string): void {
    const temporaryUrl = URL.createObjectURL(content)
    const link = document.createElement('a')
    link.href = temporaryUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(temporaryUrl)
}

function escapeCsv(value: string | number): string {
    const stringValue = String(value)
    const escaped = stringValue.replaceAll('"', '""')
    return `"${escaped}"`
}

function formatList(values: string[]): string {
    return values.join(' | ')
}

function resultToCsvRow(result: CvAnalysisResult): string {
    return [
        result.fileName,
        result.score,
        result.verdict,
        result.summary,
        formatList(result.strengths),
        formatList(result.improvements),
        formatList(result.missing_fields),
        formatList(result.recommendations),
    ]
        .map(escapeCsv)
        .join(',')
}

export function downloadConsolidatedCsv(report: BatchAnalysisResponse): void {
    const header = [
        'archivo',
        'puntaje',
        'veredicto',
        'resumen',
        'fortalezas',
        'oportunidades',
        'campos_faltantes',
        'recomendaciones',
    ]

    const content = [
        header.join(','),
        ...report.results.map(resultToCsvRow),
        '',
        `${escapeCsv('total_cv')},${escapeCsv(report.consolidated.totalCv)}`,
        `${escapeCsv('promedio_puntaje')},${escapeCsv(report.consolidated.averageScore)}`,
        `${escapeCsv('apto')},${escapeCsv(report.consolidated.verdictCounts.Apto)}`,
        `${escapeCsv('revisar')},${escapeCsv(report.consolidated.verdictCounts.Revisar)}`,
        `${escapeCsv('no_recomendado')},${escapeCsv(report.consolidated.verdictCounts['No recomendado'])}`,
    ].join('\n')

    const stamp = buildTimestampFragment(new Date())
    downloadBlob(new Blob([content], { type: 'text/csv;charset=utf-8' }), `reporte-open-day-${stamp}.csv`)
}

export function downloadConsolidatedJson(report: BatchAnalysisResponse): void {
    const stamp = buildTimestampFragment(new Date())
    const content = JSON.stringify(report, null, 2)
    downloadBlob(new Blob([content], { type: 'application/json' }), `reporte-open-day-${stamp}.json`)
}

function writeWrappedText(
    document: jsPDF,
    text: string,
    startY: number,
    maxWidth: number,
): number {
    const lines = document.splitTextToSize(text, maxWidth) as string[]
    let currentY = startY

    for (const line of lines) {
        if (currentY > 780) {
            document.addPage()
            currentY = 48
        }

        document.text(line, 48, currentY)
        currentY += 15
    }

    return currentY
}

export async function downloadConsolidatedPdf(
    report: BatchAnalysisResponse,
): Promise<void> {
    const { jsPDF } = await import('jspdf')
    const document = new jsPDF({ unit: 'pt', format: 'a4' })
    const maxWidth = 500
    let y = 52

    document.setFont('helvetica', 'bold')
    document.setFontSize(16)
    document.text('Reporte consolidado Open Day - Hojas de Vida', 48, y)

    y += 24
    document.setFont('helvetica', 'normal')
    document.setFontSize(11)
    y = writeWrappedText(
        document,
        `Total CV: ${report.consolidated.totalCv} | Promedio: ${report.consolidated.averageScore} | Apto: ${report.consolidated.verdictCounts.Apto} | Revisar: ${report.consolidated.verdictCounts.Revisar} | No recomendado: ${report.consolidated.verdictCounts['No recomendado']}`,
        y,
        maxWidth,
    )

    y += 10
    document.setFont('helvetica', 'bold')
    document.text('Resumen ejecutivo', 48, y)
    y += 18
    document.setFont('helvetica', 'normal')
    y = writeWrappedText(document, report.consolidated.executiveSummary, y, maxWidth)

    y += 14
    document.setFont('helvetica', 'bold')
    document.text('Resultados individuales', 48, y)

    document.setFont('helvetica', 'normal')
    for (const result of report.results) {
        y += 18
        if (y > 760) {
            document.addPage()
            y = 52
        }

        document.setFont('helvetica', 'bold')
        document.text(`${result.fileName} | ${result.verdict} | ${result.score}`, 48, y)
        y += 14
        document.setFont('helvetica', 'normal')
        y = writeWrappedText(document, `Resumen: ${result.summary}`, y, maxWidth)
        y = writeWrappedText(
            document,
            `Fortalezas: ${formatList(result.strengths) || 'Sin datos'}`,
            y,
            maxWidth,
        )
        y = writeWrappedText(
            document,
            `Oportunidades: ${formatList(result.improvements) || 'Sin datos'}`,
            y,
            maxWidth,
        )
    }

    const stamp = buildTimestampFragment(new Date())
    document.save(`reporte-open-day-${stamp}.pdf`)
}
