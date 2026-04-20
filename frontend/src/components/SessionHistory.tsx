import type { SessionHistoryItem } from '../types/cv'

interface SessionHistoryProps {
    items: SessionHistoryItem[]
    onClear: () => void
}

function formatDate(isoDate: string): string {
    return new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(isoDate))
}

export function SessionHistory({ items, onClear }: SessionHistoryProps) {
    return (
        <section className="history-panel" aria-label="Historial de analisis">
            <header className="history-header">
                <p className="history-title">{items.length} registro(s) en sesion</p>
                <button type="button" className="btn-link" onClick={onClear} disabled={items.length === 0}>
                    Limpiar historial
                </button>
            </header>

            {items.length === 0 ? (
                <p className="history-empty">Aun no hay archivos analizados en esta sesion.</p>
            ) : (
                <ol className="history-list">
                    {items.map((item) => (
                        <li key={item.id} className="history-item">
                            <span className="history-file" title={item.fileName}>
                                {item.fileName}
                            </span>
                            <span>{item.score}</span>
                            <span>{item.verdict}</span>
                            <span>{formatDate(item.analyzedAt)}</span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    )
}
