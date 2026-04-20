import type { HttpRequest, HttpResponseInit } from '@azure/functions'

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173']

function readAllowedOrigins(): string[] {
    const fromEnv = process.env.ALLOWED_ORIGINS
    if (!fromEnv) {
        return DEFAULT_ALLOWED_ORIGINS
    }

    const parsed = fromEnv
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)

    return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS
}

function resolveAllowedOrigin(request: HttpRequest): string | undefined {
    const origin = request.headers.get('origin')
    const allowedOrigins = readAllowedOrigins()

    if (!origin) {
        return '*'
    }

    if (allowedOrigins.includes('*')) {
        return '*'
    }

    return allowedOrigins.includes(origin) ? origin : undefined
}

function baseCorsHeaders(request: HttpRequest): Record<string, string> {
    const allowOrigin = resolveAllowedOrigin(request)

    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
    }

    if (allowOrigin) {
        headers['Access-Control-Allow-Origin'] = allowOrigin
    }

    return headers
}

export function isOriginAllowed(request: HttpRequest): boolean {
    const origin = request.headers.get('origin')
    if (!origin) {
        return true
    }

    const allowedOrigins = readAllowedOrigins()
    return allowedOrigins.includes('*') || allowedOrigins.includes(origin)
}

export function preflightResponse(request: HttpRequest): HttpResponseInit {
    return {
        status: 204,
        headers: baseCorsHeaders(request),
    }
}

export function jsonResponse(
    request: HttpRequest,
    status: number,
    payload: unknown,
): HttpResponseInit {
    return {
        status,
        headers: {
            ...baseCorsHeaders(request),
            'Content-Type': 'application/json; charset=utf-8',
        },
        jsonBody: payload,
    }
}

export function errorResponse(
    request: HttpRequest,
    status: number,
    message: string,
): HttpResponseInit {
    return jsonResponse(request, status, { error: message })
}
