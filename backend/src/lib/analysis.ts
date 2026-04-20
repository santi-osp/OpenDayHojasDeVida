import OpenAI from 'openai'
import { ANALYSIS_SYSTEM_PROMPT } from './prompts.js'
import type { AnalyzeCvInput, CvAnalysis, Verdict } from './types.js'

export const OPENAI_MODEL = 'gpt-4.1-mini'

let cachedClient: OpenAI | undefined

function getClient(): OpenAI {
    if (cachedClient) {
        return cachedClient
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY no esta configurada en el entorno.')
    }

    cachedClient = new OpenAI({ apiKey })
    return cachedClient
}

function clampScore(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) {
        return 0
    }

    const rounded = Math.round(numeric)
    return Math.min(100, Math.max(0, rounded))
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }

    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
}

function normalizeVerdict(candidate: unknown, score: number): Verdict {
    if (
        candidate === 'Apto' ||
        candidate === 'Revisar' ||
        candidate === 'No recomendado'
    ) {
        return candidate
    }

    if (score >= 80) {
        return 'Apto'
    }

    if (score >= 55) {
        return 'Revisar'
    }

    return 'No recomendado'
}

function parseJsonRecord(content: string): Record<string, unknown> {
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('La respuesta de IA no tiene formato JSON valido.')
    }

    return parsed as Record<string, unknown>
}

function buildUserPrompt(input: AnalyzeCvInput): string {
    const pages = input.estimatedPages ? String(input.estimatedPages) : 'no informado'
    const text = input.text.length > 24000 ? `${input.text.slice(0, 24000)}\n\n[Contenido truncado para control de contexto]` : input.text

    return `
Archivo: ${input.fileName}
MimeType: ${input.mimeType ?? 'no informado'}
Paginas estimadas: ${pages}

Analiza esta hoja de vida y responde con el JSON solicitado:
${text}
`
}

export async function analyzeCvWithAi(input: AnalyzeCvInput): Promise<CvAnalysis> {
    const client = getClient()
    const completion = await client.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input) },
        ],
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
        throw new Error('OpenAI retorno una respuesta vacia.')
    }

    const payload = parseJsonRecord(content)
    const score = clampScore(payload.score)
    const summary =
        typeof payload.summary === 'string' && payload.summary.trim()
            ? payload.summary.trim()
            : 'No fue posible generar un resumen confiable.'

    return {
        score,
        verdict: normalizeVerdict(payload.verdict, score),
        summary,
        strengths: toStringArray(payload.strengths),
        improvements: toStringArray(payload.improvements),
        missing_fields: toStringArray(payload.missing_fields),
        recommendations: toStringArray(payload.recommendations),
    }
}
