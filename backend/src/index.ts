import {
    app,
    type HttpRequest,
    type HttpResponseInit,
    type InvocationContext,
} from '@azure/functions'
import { analyzeCvWithAi, OPENAI_MODEL } from './lib/analysis.js'
import { buildConsolidatedReport } from './lib/consolidation.js'
import {
    errorResponse,
    isOriginAllowed,
    jsonResponse,
    preflightResponse,
} from './lib/cors.js'
import type { AnalyzeCvInput, CvAnalysisResult } from './lib/types.js'

const MAX_BATCH_ITEMS = 50

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function toAnalyzeInput(
    value: unknown,
    fallbackFileName: string,
): AnalyzeCvInput | null {
    if (!isRecord(value)) {
        return null
    }

    const text = typeof value.text === 'string' ? value.text.trim() : ''
    if (!text) {
        return null
    }

    const fileName =
        typeof value.fileName === 'string' && value.fileName.trim()
            ? value.fileName.trim()
            : fallbackFileName

    const mimeType = typeof value.mimeType === 'string' ? value.mimeType : undefined

    const estimatedPages =
        typeof value.estimatedPages === 'number' && Number.isFinite(value.estimatedPages)
            ? Math.max(1, Math.round(value.estimatedPages))
            : undefined

    return {
        fileName,
        mimeType,
        estimatedPages,
        text,
    }
}

function failedResult(fileName: string, reason: string): CvAnalysisResult {
    return {
        fileName,
        score: 0,
        verdict: 'No recomendado',
        summary: 'No fue posible analizar esta hoja de vida.',
        strengths: [],
        improvements: [reason],
        missing_fields: ['No se pudo validar el contenido del documento.'],
        recommendations: ['Solicitar nuevamente el archivo en PDF, DOCX o TXT.'],
        error: reason,
    }
}

function protectWithCors(request: HttpRequest): HttpResponseInit | null {
    if (request.method === 'OPTIONS') {
        return preflightResponse(request)
    }

    if (!isOriginAllowed(request)) {
        return errorResponse(
            request,
            403,
            'Origen no permitido por la politica CORS de la funcion.',
        )
    }

    return null
}

async function healthHandler(request: HttpRequest): Promise<HttpResponseInit> {
    const corsResult = protectWithCors(request)
    if (corsResult) {
        return corsResult
    }

    return jsonResponse(request, 200, {
        status: 'ok',
        service: 'openday-cv-analyzer',
        model: OPENAI_MODEL,
        timestamp: new Date().toISOString(),
    })
}

async function analyzeCvHandler(
    request: HttpRequest,
    context: InvocationContext,
): Promise<HttpResponseInit> {
    const corsResult = protectWithCors(request)
    if (corsResult) {
        return corsResult
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return errorResponse(request, 400, 'El cuerpo JSON de la solicitud es invalido.')
    }

    const payload = toAnalyzeInput(body, 'cv-sin-nombre')
    if (!payload) {
        return errorResponse(
            request,
            400,
            'Solicitud invalida. Debe incluir al menos fileName y text.',
        )
    }

    try {
        const analysis = await analyzeCvWithAi(payload)
        return jsonResponse(request, 200, {
            fileName: payload.fileName,
            ...analysis,
        })
    } catch (error) {
        context.error('Error during analyze-cv execution:', error)
        return errorResponse(
            request,
            500,
            'No fue posible analizar la hoja de vida en este momento.',
        )
    }
}

async function analyzeBatchHandler(
    request: HttpRequest,
    context: InvocationContext,
): Promise<HttpResponseInit> {
    const corsResult = protectWithCors(request)
    if (corsResult) {
        return corsResult
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return errorResponse(request, 400, 'El cuerpo JSON de la solicitud es invalido.')
    }

    if (!isRecord(body) || !Array.isArray(body.items)) {
        return errorResponse(request, 400, 'Solicitud invalida. Usa { "items": [...] }.')
    }

    const items = body.items
    if (items.length === 0) {
        return errorResponse(request, 400, 'La lista items no puede estar vacia.')
    }

    if (items.length > MAX_BATCH_ITEMS) {
        return errorResponse(
            request,
            400,
            `El maximo permitido por lote es ${MAX_BATCH_ITEMS} archivos.`,
        )
    }

    const results: CvAnalysisResult[] = []

    for (let index = 0; index < items.length; index += 1) {
        const fallbackName = `cv-${index + 1}`
        const payload = toAnalyzeInput(items[index], fallbackName)

        if (!payload) {
            results.push(
                failedResult(
                    fallbackName,
                    'El item no tiene texto util para ser procesado.',
                ),
            )
            continue
        }

        try {
            const analysis = await analyzeCvWithAi(payload)
            results.push({
                fileName: payload.fileName,
                ...analysis,
            })
        } catch (error) {
            context.error(`Error analyzing ${payload.fileName}:`, error)
            results.push(
                failedResult(payload.fileName, 'Fallo la evaluacion con IA para este archivo.'),
            )
        }
    }

    const consolidated = buildConsolidatedReport(results)

    return jsonResponse(request, 200, {
        results,
        consolidated,
        analyzedAt: new Date().toISOString(),
    })
}

app.http('health', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'health',
    handler: healthHandler,
})

app.http('analyze-cv', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'analyze-cv',
    handler: analyzeCvHandler,
})

app.http('analyze-batch', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'analyze-batch',
    handler: analyzeBatchHandler,
})
