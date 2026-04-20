interface StatusBannerProps {
    tone: 'info' | 'success' | 'error'
    messages: string[]
}

export function StatusBanner({ tone, messages }: StatusBannerProps) {
    if (messages.length === 0) {
        return null
    }

    return (
        <div className={`status-banner ${tone}`} role="status" aria-live="polite">
            {messages.map((message, index) => (
                <p key={`${message}-${index}`}>{message}</p>
            ))}
        </div>
    )
}
