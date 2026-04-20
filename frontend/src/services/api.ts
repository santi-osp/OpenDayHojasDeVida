import type {
    AnalyzeCvPayload,
    BatchAnalysisResponse,
    CvAnalysisResult,
    ExtractedCv,
} from '../types/cv'

const DEV_API_URL = 'http://localhost:7071/api'

function resolveApiBaseUrl(): string {
    const envValue = import.meta.env.VITE_API_URL?.trim()

    if (envValue) {
        return envValue.replace(/\/+$/, '')
    }

    if (import.meta.env.DEV) {
        return DEV_API_URL
    }

    throw new Error(
        'VITE_API_URL no esta configurada. Define la URL de Azure Functions en el entorno.',
    )
}

const API_BASE_URL = resolveApiBaseUrl()

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    })

    if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null
        const details = payload?.error ? ` ${payload.error}` : ''
        throw new Error(`Error HTTP ${response.status}.${details}`)
    }

    return (await response.json()) as T
}

export async function checkHealth(): Promise<{ status: string }> {
    return requestJson<{ status: string }>('/health', { method: 'GET' })
}

export async function analyzeCv(payload: ExtractedCv): Promise<CvAnalysisResult> {
    const analysis = await requestJson<CvAnalysisResult>('/analyze-cv', {
        method: 'POST',
        body: JSON.stringify(payload satisfies AnalyzeCvPayload),
    })

    return {
        ...analysis,
        fileName: analysis.fileName || payload.fileName,
    }
}

export async function analyzeBatch(
    payload: ExtractedCv[],
): Promise<BatchAnalysisResponse> {
    const response = await requestJson<BatchAnalysisResponse>('/analyze-batch', {
        method: 'POST',
        body: JSON.stringify({ items: payload }),
    })

    const normalizedResults = response.results.map((result, index) => ({
        ...result,
        fileName: result.fileName || payload[index]?.fileName || `CV-${index + 1}`,
    }))

    return {
        ...response,
        results: normalizedResults,
    }
}
