export type Verdict = 'Apto' | 'Revisar' | 'No recomendado'

export interface AnalyzeCvPayload {
    fileName: string
    mimeType: string
    text: string
    estimatedPages?: number
}

export interface CvAnalysisResponse {
    score: number
    verdict: Verdict
    summary: string
    strengths: string[]
    improvements: string[]
    missing_fields: string[]
    recommendations: string[]
}

export interface CvAnalysisResult extends CvAnalysisResponse {
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

export interface BatchAnalysisResponse {
    results: CvAnalysisResult[]
    consolidated: ConsolidatedReport
    analyzedAt: string
}

export interface ExtractedCv {
    fileName: string
    mimeType: string
    text: string
    estimatedPages?: number
}

export interface ExtractionError {
    fileName: string
    reason: string
}

export interface SessionHistoryItem {
    id: string
    fileName: string
    score: number
    verdict: Verdict
    analyzedAt: string
}
