interface ProgressBarProps {
    value: number
    label: string
    detail?: string
}

export function ProgressBar({ value, label, detail }: ProgressBarProps) {
    const boundedValue = Math.min(100, Math.max(0, value))

    return (
        <div className="progress-wrapper" role="status" aria-live="polite">
            <div className="progress-track" aria-hidden="true">
                <div className="progress-fill" style={{ width: `${boundedValue}%` }} />
            </div>
            <div className="progress-meta">
                <span>{label}</span>
                <span>{boundedValue}%</span>
            </div>
            {detail && <small>{detail}</small>}
        </div>
    )
}
