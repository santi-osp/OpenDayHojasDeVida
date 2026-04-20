# Frontend - Open Day CV Analyzer

Aplicacion React + Vite + TypeScript para cargar hojas de vida, enviar texto a Azure Functions y visualizar resultados.

## Funcionalidades

- Carga multiple por drag and drop.
- Soporte para PDF, DOCX y TXT.
- Extraccion de texto en navegador.
- Integracion HTTP con backend serverless.
- Resultados por documento (score, verdict, fortalezas, mejoras).
- Consolidado general del lote analizado.
- Descarga de reportes en CSV, JSON y PDF.
- Historial visible en la sesion del navegador.

## Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores.

```env
VITE_API_URL=http://localhost:7071/api
VITE_BASE_PATH=/OpenDayHojasDeVida/
```

## Comandos

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Produccion en GitHub Pages

El workflow del repositorio construye este frontend y publica `dist/` automaticamente.

Configuracion recomendada:

- Repositorio Variable: `VITE_API_URL`
- Fuente de GitHub Pages: `GitHub Actions`

El build usa `VITE_BASE_PATH=/<nombre-repo>/` para que la SPA cargue correctamente en Pages.
