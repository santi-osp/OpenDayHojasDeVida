import { useMemo, useRef, useState } from 'react'

interface FileDropzoneProps {
    files: File[]
    disabled: boolean
    onFilesAdded: (files: File[]) => void
    onClearSelection: () => void
}

export function FileDropzone({
    files,
    disabled,
    onFilesAdded,
    onClearSelection,
}: FileDropzoneProps) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    const visibleFileNames = useMemo(() => files.slice(0, 8).map((file) => file.name), [files])
    const overflowCount = Math.max(0, files.length - visibleFileNames.length)

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files ? Array.from(event.target.files) : []
        onFilesAdded(selected)
        event.target.value = ''
    }

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        if (disabled) {
            return
        }

        setIsDragging(false)
        const droppedFiles = Array.from(event.dataTransfer.files)
        onFilesAdded(droppedFiles)
    }

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        if (!disabled) {
            setIsDragging(true)
        }
    }

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return
        }
        setIsDragging(false)
    }

    const openNativePicker = () => {
        if (disabled) {
            return
        }

        inputRef.current?.click()
    }

    return (
        <div
            className={`dropzone ${isDragging ? 'dragging' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            role="region"
            aria-label="Zona de carga de archivos"
        >
            <p className="dropzone-title">Arrastra aqui tus hojas de vida</p>
            <p className="dropzone-subtitle">
                Formatos soportados: PDF, DOCX y TXT. Tamano maximo por archivo: 12 MB.
            </p>

            <div className="dropzone-actions">
                <button type="button" className="btn-primary" onClick={openNativePicker} disabled={disabled}>
                    Seleccionar archivos
                </button>
                <button
                    type="button"
                    className="btn-ghost"
                    onClick={onClearSelection}
                    disabled={disabled || files.length === 0}
                >
                    Limpiar lista
                </button>
                <span>{files.length} archivo(s) en lista</span>
            </div>

            {files.length > 0 && (
                <div className="file-chip-list" aria-live="polite">
                    {visibleFileNames.map((fileName, index) => (
                        <span key={`${fileName}-${index}`} className="file-chip" title={fileName}>
                            {fileName}
                        </span>
                    ))}
                    {overflowCount > 0 && <span className="file-chip">+{overflowCount} mas</span>}
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                hidden
                disabled={disabled}
                onChange={handleInputChange}
            />
        </div>
    )
}
