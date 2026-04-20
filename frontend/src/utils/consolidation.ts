import type {
    ConsolidatedReport,
    CvAnalysisResult,
    Verdict,
    VerdictCounts,
} from '../types/cv'

const EMPTY_VERDICT_COUNTS: VerdictCounts = {
    Apto: 0,
    Revisar: 0,
    'No recomendado': 0,
}

function toRoundedAverage(totalScore: number, totalCv: number): number {
    if (totalCv === 0) {
        return 0
    }

    return Math.round((totalScore / totalCv) * 10) / 10
}

function buildExecutiveSummary(
    totalCv: number,
    averageScore: number,
    verdictCounts: VerdictCounts,
): string {
    const ranking: Array<[Verdict, number]> = [
        ['Apto', verdictCounts.Apto],
        ['Revisar', verdictCounts.Revisar],
        ['No recomendado', verdictCounts['No recomendado']],
    ]

    const [topVerdict, topCount] = ranking.sort((a, b) => b[1] - a[1])[0]

    return `Se analizaron ${totalCv} hojas de vida con un promedio de ${averageScore}. El veredicto predominante fue ${topVerdict} (${topCount} casos).`
}

export function buildConsolidatedReport(
    results: CvAnalysisResult[],
): ConsolidatedReport {
    if (results.length === 0) {
        return {
            totalCv: 0,
            averageScore: 0,
            verdictCounts: { ...EMPTY_VERDICT_COUNTS },
            frequentObservations: [],
            executiveSummary: 'No hay datos disponibles para consolidar.',
        }
    }

    const verdictCounts: VerdictCounts = { ...EMPTY_VERDICT_COUNTS }
    const observationCounter = new Map<string, number>()
    let totalScore = 0

    for (const result of results) {
        totalScore += result.score
        verdictCounts[result.verdict] += 1

        for (const observation of [...result.improvements, ...result.missing_fields]) {
            const cleaned = observation.trim()
            if (!cleaned) {
                continue
            }
            observationCounter.set(cleaned, (observationCounter.get(cleaned) ?? 0) + 1)
        }
    }

    const frequentObservations = [...observationCounter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([observation]) => observation)

    const averageScore = toRoundedAverage(totalScore, results.length)

    return {
        totalCv: results.length,
        averageScore,
        verdictCounts,
        frequentObservations,
        executiveSummary: buildExecutiveSummary(
            results.length,
            averageScore,
            verdictCounts,
        ),
    }
}
