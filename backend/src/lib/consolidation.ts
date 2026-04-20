import type {
    ConsolidatedReport,
    CvAnalysisResult,
    Verdict,
    VerdictCounts,
} from './types.js'

const EMPTY_VERDICTS: VerdictCounts = {
    Apto: 0,
    Revisar: 0,
    'No recomendado': 0,
}

function averageScore(results: CvAnalysisResult[]): number {
    if (results.length === 0) {
        return 0
    }

    const total = results.reduce((sum, item) => sum + item.score, 0)
    return Math.round((total / results.length) * 10) / 10
}

function buildExecutiveSummary(
    totalCv: number,
    average: number,
    verdicts: VerdictCounts,
): string {
    const ranking: Array<[Verdict, number]> = [
        ['Apto', verdicts.Apto],
        ['Revisar', verdicts.Revisar],
        ['No recomendado', verdicts['No recomendado']],
    ]
    const [topVerdict, topCount] =
        ranking.sort((a, b) => b[1] - a[1])[0] ?? ['Revisar', 0]

    return `Se analizaron ${totalCv} hojas de vida. El promedio general fue ${average} y el veredicto mas frecuente fue ${topVerdict} con ${topCount} casos.`
}

export function buildConsolidatedReport(
    results: CvAnalysisResult[],
): ConsolidatedReport {
    if (results.length === 0) {
        return {
            totalCv: 0,
            averageScore: 0,
            verdictCounts: { ...EMPTY_VERDICTS },
            frequentObservations: [],
            executiveSummary: 'No existen resultados para consolidar.',
        }
    }

    const verdictCounts: VerdictCounts = { ...EMPTY_VERDICTS }
    const observationCounter = new Map<string, number>()

    for (const result of results) {
        verdictCounts[result.verdict] += 1

        for (const observation of [...result.improvements, ...result.missing_fields]) {
            const trimmed = observation.trim()
            if (!trimmed) {
                continue
            }

            observationCounter.set(trimmed, (observationCounter.get(trimmed) ?? 0) + 1)
        }
    }

    const frequentObservations = [...observationCounter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([observation]) => observation)

    const average = averageScore(results)

    return {
        totalCv: results.length,
        averageScore: average,
        verdictCounts,
        frequentObservations,
        executiveSummary: buildExecutiveSummary(results.length, average, verdictCounts),
    }
}
