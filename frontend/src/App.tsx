import { useEffect, useMemo, useState } from 'react'
import { ConsolidatedPanel } from './components/ConsolidatedPanel'
import { FileDropzone } from './components/FileDropzone'
import { ProgressBar } from './components/ProgressBar'
import { ResultCard } from './components/ResultCard'
import { SessionHistory } from './components/SessionHistory'
import { StatusBanner } from './components/StatusBanner'
import { analyzeBatch, checkHealth } from './services/api'
import { extractFiles } from './services/fileExtraction'
import {
  downloadConsolidatedCsv,
  downloadConsolidatedJson,
  downloadConsolidatedPdf,
} from './services/reportExport'
import { buildConsolidatedReport } from './utils/consolidation'
import './App.css'
import type {
  BatchAnalysisResponse,
  ConsolidatedReport,
  CvAnalysisResult,
  SessionHistoryItem,
} from './types/cv'

const SESSION_HISTORY_KEY = 'openday-cv-history'
const MAX_FILES_PER_BATCH = 50

type BannerTone = 'info' | 'success' | 'error'

interface ProgressState {
  value: number
  label: string
  detail?: string
}

function loadSessionHistory(): SessionHistoryItem[] {
  const rawValue = sessionStorage.getItem(SESSION_HISTORY_KEY)
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue) as SessionHistoryItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveSessionHistory(items: SessionHistoryItem[]): void {
  sessionStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(items))
}

function fileIdentity(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`
}

function App() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [results, setResults] = useState<CvAnalysisResult[]>([])
  const [consolidated, setConsolidated] = useState<ConsolidatedReport | null>(
    null,
  )
  const [history, setHistory] = useState<SessionHistoryItem[]>(() =>
    loadSessionHistory(),
  )
  const [messages, setMessages] = useState<string[]>([])
  const [bannerTone, setBannerTone] = useState<BannerTone>('info')
  const [isProcessing, setIsProcessing] = useState(false)
  const [analyzedAt, setAnalyzedAt] = useState<string>('')
  const [apiState, setApiState] = useState<'checking' | 'online' | 'offline'>(
    'checking',
  )
  const [progress, setProgress] = useState<ProgressState>({
    value: 0,
    label: 'Listo para analizar',
  })

  useEffect(() => {
    const verifyHealth = async () => {
      try {
        await checkHealth()
        setApiState('online')
      } catch {
        setApiState('offline')
        setBannerTone('error')
        setMessages([
          'No fue posible conectar con el backend. Verifica VITE_API_URL y CORS.',
        ])
      }
    }

    void verifyHealth()
  }, [])

  const hasResults = results.length > 0
  const reportPayload = useMemo<BatchAnalysisResponse | null>(() => {
    if (!hasResults || !consolidated) {
      return null
    }

    return {
      results,
      consolidated,
      analyzedAt: analyzedAt || new Date().toISOString(),
    }
  }, [analyzedAt, consolidated, hasResults, results])

  const handleFilesAdded = (files: File[]) => {
    if (files.length === 0) {
      return
    }

    const incoming = files.slice(0, MAX_FILES_PER_BATCH)
    setSelectedFiles((currentFiles) => {
      const merged = [...currentFiles]
      const seen = new Set(currentFiles.map(fileIdentity))

      for (const file of incoming) {
        const identity = fileIdentity(file)
        if (!seen.has(identity)) {
          merged.push(file)
          seen.add(identity)
        }
      }

      return merged
    })

    setBannerTone('info')
    setMessages(['Archivos agregados. Puedes iniciar el analisis.'])
  }

  const handleClearSelection = () => {
    setSelectedFiles([])
    setProgress({ value: 0, label: 'Seleccion limpiada' })
  }

  const handleAnalyze = async () => {
    if (selectedFiles.length === 0) {
      setBannerTone('error')
      setMessages(['Carga al menos una hoja de vida para continuar.'])
      return
    }

    setIsProcessing(true)
    setMessages([])
    setBannerTone('info')
    setProgress({ value: 3, label: 'Preparando archivos' })

    try {
      const extraction = await extractFiles(selectedFiles, ({
        processed,
        total,
        currentFile,
      }) => {
        const value = Math.max(5, Math.round((processed / total) * 55))
        setProgress({
          value,
          label: 'Extrayendo texto',
          detail: currentFile,
        })
      })

      if (extraction.extracted.length === 0) {
        setBannerTone('error')
        setMessages([
          'Ningun archivo pudo ser procesado. Revisa el formato y vuelve a intentar.',
        ])
        setProgress({ value: 0, label: 'Sin contenido util para analizar' })
        return
      }

      setProgress({
        value: 65,
        label: 'Enviando hojas de vida al backend',
        detail: `${extraction.extracted.length} archivo(s) listo(s)`,
      })

      const response = await analyzeBatch(extraction.extracted)
      const resolvedConsolidated =
        response.consolidated ?? buildConsolidatedReport(response.results)

      setProgress({
        value: 100,
        label: 'Analisis terminado',
        detail: `${response.results.length} archivo(s) analizado(s)`,
      })
      setResults(response.results)
      setConsolidated(resolvedConsolidated)
      setAnalyzedAt(response.analyzedAt)
      setBannerTone('success')

      const extractionMessages = extraction.errors.map(
        (error) => `${error.fileName}: ${error.reason}`,
      )

      const successMessage = `Analisis completado para ${response.results.length} hoja(s) de vida.`
      setMessages(
        extractionMessages.length > 0
          ? [successMessage, ...extractionMessages]
          : [successMessage],
      )

      const newHistoryEntries: SessionHistoryItem[] = response.results.map(
        (result, index) => ({
          id: `${Date.now()}-${index}`,
          fileName: result.fileName,
          score: result.score,
          verdict: result.verdict,
          analyzedAt: response.analyzedAt,
        }),
      )

      setHistory((previous) => {
        const nextHistory = [...newHistoryEntries, ...previous].slice(0, 300)
        saveSessionHistory(nextHistory)
        return nextHistory
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Ocurrio un error inesperado durante el analisis.'
      setBannerTone('error')
      setMessages([message])
      setProgress({ value: 0, label: 'Error durante el analisis' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClearHistory = () => {
    setHistory([])
    saveSessionHistory([])
  }

  const handleDownloadCsv = () => {
    if (!reportPayload) {
      return
    }

    downloadConsolidatedCsv(reportPayload)
  }

  const handleDownloadJson = () => {
    if (!reportPayload) {
      return
    }

    downloadConsolidatedJson(reportPayload)
  }

  const handleDownloadPdf = async () => {
    if (!reportPayload) {
      return
    }

    try {
      await downloadConsolidatedPdf(reportPayload)
    } catch {
      setBannerTone('error')
      setMessages(['No fue posible generar el PDF en este momento.'])
    }
  }

  return (
    <div className="app-shell">
      <header className="hero-section">
        <p className="hero-kicker">Open Day Postobon</p>
        <h1>Evaluador inteligente de hojas de vida</h1>
        <p className="hero-description">
          Carga una o varias hojas de vida en formato Harvard y recibe feedback
          automatico para clasificar candidatos de practica.
        </p>
        <div className="hero-meta">
          <span className={`api-pill ${apiState}`}>
            Backend {apiState === 'online' ? 'en linea' : ''}
            {apiState === 'checking' ? 'verificando...' : ''}
            {apiState === 'offline' ? 'sin conexion' : ''}
          </span>
          <span className="meta-tip">
            Evalua claridad, experiencia, rol, herramientas, hobbies y ciudad.
          </span>
        </div>
      </header>

      <section className="workspace-panel">
        <div className="section-headline">
          <h2>1. Carga documentos</h2>
          <p>Soporta PDF, DOCX y TXT. Puedes arrastrar multiples archivos.</p>
        </div>

        <FileDropzone
          files={selectedFiles}
          disabled={isProcessing}
          onFilesAdded={handleFilesAdded}
          onClearSelection={handleClearSelection}
        />

        <div className="actions-row">
          <button
            type="button"
            className="btn-primary"
            onClick={handleAnalyze}
            disabled={isProcessing || selectedFiles.length === 0}
          >
            {isProcessing ? 'Analizando...' : 'Analizar hojas de vida'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleClearSelection}
            disabled={isProcessing || selectedFiles.length === 0}
          >
            Limpiar seleccion
          </button>
        </div>

        {(isProcessing || progress.value > 0) && (
          <ProgressBar
            value={progress.value}
            label={progress.label}
            detail={progress.detail}
          />
        )}

        <StatusBanner tone={bannerTone} messages={messages} />
      </section>

      <section className="workspace-panel">
        <div className="section-headline inline">
          <div>
            <h2>2. Reporte consolidado</h2>
            <p>
              Resultado global para el Open Day con metricas, observaciones y
              resumen ejecutivo.
            </p>
          </div>
          <div className="export-group">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleDownloadCsv}
              disabled={!reportPayload}
            >
              Descargar CSV
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={handleDownloadJson}
              disabled={!reportPayload}
            >
              Descargar JSON
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                void handleDownloadPdf()
              }}
              disabled={!reportPayload}
            >
              Descargar PDF
            </button>
          </div>
        </div>

        <ConsolidatedPanel report={consolidated} />
      </section>

      <section className="workspace-panel">
        <div className="section-headline">
          <h2>3. Resultados por hoja de vida</h2>
          <p>
            Tarjetas con puntaje, fortalezas y oportunidades para cada
            candidato.
          </p>
        </div>

        <div className="results-grid">
          {results.length === 0 && (
            <div className="empty-state">
              Ejecuta un analisis para ver el detalle de cada documento.
            </div>
          )}

          {results.map((result, index) => (
            <ResultCard
              key={`${result.fileName}-${result.score}-${index}`}
              result={result}
            />
          ))}
        </div>
      </section>

      <section className="workspace-panel">
        <div className="section-headline">
          <h2>4. Historial de sesion</h2>
          <p>
            Vista rapida de hojas evaluadas en esta sesion del navegador.
          </p>
        </div>
        <SessionHistory items={history} onClear={handleClearHistory} />
      </section>
    </div>
  )
}

export default App
