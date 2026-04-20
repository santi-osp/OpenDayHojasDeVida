# Backend Azure Functions

API HTTP para analisis de hojas de vida con OpenAI.

## Endpoints

- `GET /api/health`
- `POST /api/analyze-cv`
- `POST /api/analyze-batch`

## Configuracion local

1. Copia `local.settings.example.json` como `local.settings.json`.
2. Completa `OPENAI_API_KEY` y `ALLOWED_ORIGINS`.
3. Ejecuta:

```bash
npm install
npm run build
func start
```

## Variables de entorno requeridas

- `OPENAI_API_KEY`
- `ALLOWED_ORIGINS`

## CORS

`ALLOWED_ORIGINS` acepta una lista separada por comas.

Ejemplo:

```text
http://localhost:5173,https://<usuario>.github.io
```

## Deploy

```bash
npm install
npm run build
func azure functionapp publish <tu-function-app>
```
