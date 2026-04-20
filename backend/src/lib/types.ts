export type Verdict = 'Apto' | 'Revisar' | 'No recomendado'

export interface AnalyzeCvInput {
    fileName: string
    mimeType?: string
    text: string
    estimatedPages?: number
}

export interface CvAnalysis {
    score: number
    verdict: Verdict
    summary: string
    strengths: string[]
    improvements: string[]
    missing_fields: string[]
    recommendations: string[]
}

export interface CvAnalysisResult extends CvAnalysis {
    fileName: string
    error?: string
}

export interface VerdictCounts {
    Apto: number
    Revisar: number
    'No recomendado': number
}

export interface ConsolidatedReport {
    totalCv: number
    averageScore: number
    verdictCounts: VerdictCounts
    frequentObservations: string[]
    executiveSummary: string
}
