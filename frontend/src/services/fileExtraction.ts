import type { ExtractedCv, ExtractionError } from '../types/cv'

const PDF_TYPE = 'pdf'
const DOCX_TYPE = 'docx'
const TXT_TYPE = 'txt'
const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024

type PdfModule = {
    getDocument: typeof import('pdfjs-dist')['getDocument']
}

let cachedPdfModule: Promise<PdfModule> | undefined

async function loadPdfModule(): Promise<PdfModule> {
    if (!cachedPdfModule) {
        cachedPdfModule = (async () => {
            const pdfjs = await import('pdfjs-dist')
            const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')

            pdfjs.GlobalWorkerOptions.workerSrc = worker.default

            return {
                getDocument: pdfjs.getDocument,
            }
        })()
    }

    return cachedPdfModule
}

export interface ExtractionProgress {
    processed: number
    total: number
    currentFile: string
}

export interface BatchExtractionResult {
    extracted: ExtractedCv[]
    errors: ExtractionError[]
}

type SupportedFileType = typeof PDF_TYPE | typeof DOCX_TYPE | typeof TXT_TYPE

function getFileExtension(fileName: string): string {
    const parts = fileName.toLowerCase().split('.')
    return parts.length > 1 ? parts[parts.length - 1] : ''
}

function detectSupportedType(file: File): SupportedFileType | null {
    const extension = getFileExtension(file.name)

    if (extension === PDF_TYPE || file.type === 'application/pdf') {
        return PDF_TYPE
    }

    if (
        extension === DOCX_TYPE ||
        file.type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
        return DOCX_TYPE
    }

    if (extension === TXT_TYPE || file.type === 'text/plain') {
        return TXT_TYPE
    }

    return null
}

function estimatePagesByLength(text: string): number {
    if (!text.trim()) {
        return 1
    }

    return Math.max(1, Math.ceil(text.length / 2800))
}

async function extractPdf(file: File): Promise<ExtractedCv> {
    const { getDocument } = await loadPdfModule()
    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) })
    const document = await loadingTask.promise
    const pages: string[] = []

    for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
        const page = await document.getPage(pageIndex)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
        if (pageText) {
            pages.push(pageText)
        }
    }

    return {
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        text: pages.join('\n\n').trim(),
        estimatedPages: document.numPages,
    }
}

async function extractDocx(file: File): Promise<ExtractedCv> {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    const text = result.value.replace(/\s+/g, ' ').trim()

    return {
        fileName: file.name,
        mimeType:
            file.type ||
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        text,
        estimatedPages: estimatePagesByLength(text),
    }
}

async function extractTxt(file: File): Promise<ExtractedCv> {
    const text = (await file.text()).replace(/\s+/g, ' ').trim()

    return {
        fileName: file.name,
        mimeType: file.type || 'text/plain',
        text,
        estimatedPages: estimatePagesByLength(text),
    }
}

async function extractSingle(file: File): Promise<ExtractedCv> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error('El archivo supera el limite de 12 MB.')
    }

    const fileType = detectSupportedType(file)
    if (!fileType) {
        throw new Error('Formato no soportado. Usa PDF, DOCX o TXT.')
    }

    if (fileType === PDF_TYPE) {
        return extractPdf(file)
    }

    if (fileType === DOCX_TYPE) {
        return extractDocx(file)
    }

    return extractTxt(file)
}

export async function extractFiles(
    files: File[],
    onProgress?: (progress: ExtractionProgress) => void,
): Promise<BatchExtractionResult> {
    const extracted: ExtractedCv[] = []
    const errors: ExtractionError[] = []

    for (let index = 0; index < files.length; index += 1) {
        const file = files[index]

        try {
            const document = await extractSingle(file)
            if (!document.text) {
                errors.push({
                    fileName: file.name,
                    reason: 'No se encontro texto legible en el archivo.',
                })
            } else {
                extracted.push(document)
            }
        } catch (error) {
            errors.push({
                fileName: file.name,
                reason:
                    error instanceof Error
                        ? error.message
                        : 'No fue posible leer este archivo.',
            })
        }

        onProgress?.({
            processed: index + 1,
            total: files.length,
            currentFile: file.name,
        })
    }

    return {
        extracted,
        errors,
    }
}
