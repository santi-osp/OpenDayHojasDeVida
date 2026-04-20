import type { ConsolidatedReport } from '../types/cv'

interface ConsolidatedPanelProps {
    report: ConsolidatedReport | null
}

export function ConsolidatedPanel({ report }: ConsolidatedPanelProps) {
    if (!report) {
        return (
            <div className="empty-state">
                Todavia no hay resultados para consolidar. Ejecuta un analisis para ver
                metricas globales.
            </div>
        )
    }

    return (
        <div className="consolidated-text">
            <div className="consolidated-grid">
                <article className="kpi-card">
                    <p className="kpi-label">Total de hojas analizadas</p>
                    <p className="kpi-value">{report.totalCv}</p>
                </article>

                <article className="kpi-card">
                    <p className="kpi-label">Promedio de puntuacion</p>
                    <p className="kpi-value">{report.averageScore}</p>
                </article>

                <article className="kpi-card">
                    <p className="kpi-label">Veredicto Apto</p>
                    <p className="kpi-value">{report.verdictCounts.Apto}</p>
                </article>

                <article className="kpi-card">
                    <p className="kpi-label">Veredicto Revisar</p>
                    <p className="kpi-value">{report.verdictCounts.Revisar}</p>
                </article>

                <article className="kpi-card">
                    <p className="kpi-label">Veredicto No recomendado</p>
                    <p className="kpi-value">{report.verdictCounts['No recomendado']}</p>
                </article>
            </div>

            <div>
                <h3>Observaciones frecuentes</h3>
                {report.frequentObservations.length > 0 ? (
                    <ul className="observation-list">
                        {report.frequentObservations.map((observation, index) => (
                            <li key={`${observation}-${index}`}>{observation}</li>
                        ))}
                    </ul>
                ) : (
                    <p>No se encontraron observaciones repetidas.</p>
                )}
            </div>

            <div>
                <h3>Resumen ejecutivo</h3>
                <p>{report.executiveSummary}</p>
            </div>
        </div>
    )
}
