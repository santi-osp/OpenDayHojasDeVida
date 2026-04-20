import type { CvAnalysisResult } from '../types/cv'

interface ResultCardProps {
    result: CvAnalysisResult
}

function getVerdictClass(verdict: CvAnalysisResult['verdict']): string {
    if (verdict === 'Apto') {
        return 'apto'
    }

    if (verdict === 'Revisar') {
        return 'revisar'
    }

    return 'no-recomendado'
}

function renderList(items: string[]) {
    if (items.length === 0) {
        return <li>Sin elementos destacados.</li>
    }

    return (
        <>
            {items.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
            ))}
        </>
    )
}

export function ResultCard({ result }: ResultCardProps) {
    return (
        <article className="result-card">
            <header className="result-header">
                <div>
                    <h3 className="result-title" title={result.fileName}>
                        {result.fileName}
                    </h3>
                    <p className="result-score">Puntaje: {result.score} / 100</p>
                </div>
                <span className={`verdict-badge ${getVerdictClass(result.verdict)}`}>
                    {result.verdict}
                </span>
            </header>

            <p className="result-summary">{result.summary}</p>

            <section className="result-section">
                <h4>Fortalezas</h4>
                <ul>{renderList(result.strengths)}</ul>
            </section>

            <section className="result-section">
                <h4>Oportunidades de mejora</h4>
                <ul>{renderList(result.improvements)}</ul>
            </section>

            <section className="result-section">
                <h4>Campos faltantes</h4>
                <ul>{renderList(result.missing_fields)}</ul>
            </section>

            <section className="result-section">
                <h4>Recomendaciones</h4>
                <ul>{renderList(result.recommendations)}</ul>
            </section>
        </article>
    )
}
