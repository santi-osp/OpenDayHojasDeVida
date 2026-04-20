# Open Day CV Analyzer

Plataforma web para analizar una o varias hojas de vida y generar feedback automatico para el Open Day de Postobon.

## Arquitectura

- Frontend estatico: React + Vite + TypeScript
- Hosting frontend: GitHub Pages
- Backend API: Azure Functions (HTTP)
- IA: OpenAI `gpt-4.1-mini`
- Seguridad: `OPENAI_API_KEY` solo vive en Azure Functions

## Estructura del proyecto

```text
frontend/   # Aplicacion web (carga, extraccion, visualizacion, reportes)
backend/    # Azure Functions (health, analyze-cv, analyze-batch)
.github/workflows/deploy-frontend.yml
```

## Flujo funcional

1. El usuario carga multiples archivos PDF, DOCX o TXT.
2. El frontend extrae texto en el navegador.
3. El frontend envia texto por HTTP a Azure Functions.
4. Azure Functions analiza cada CV con OpenAI `gpt-4.1-mini`.
5. La API devuelve JSON estructurado por hoja de vida.
6. El frontend muestra cards individuales + consolidado global.
7. El usuario descarga reporte consolidado en CSV, JSON y PDF.

## Respuesta esperada de la API

```json
{
  "score": 82,
  "verdict": "Apto",
  "summary": "Perfil claro y bien estructurado.",
  "strengths": ["Describe rol en experiencia", "Buena legibilidad"],
  "improvements": ["Agregar nivel de herramientas"],
  "missing_fields": ["Hobbies"],
  "recommendations": ["Mantener extension maximo dos paginas"]
}
```

## Variables de entorno

### Frontend (`frontend/.env`)

```env
VITE_API_URL=https://<tu-funcion>.azurewebsites.net/api
VITE_BASE_PATH=/OpenDayHojasDeVida/
```

- `VITE_API_URL` no es secreto.
- Nunca guardar API keys en frontend.

### Backend (Azure Function App Settings)

- `OPENAI_API_KEY` = clave privada de OpenAI
- `ALLOWED_ORIGINS` = lista CSV de origenes permitidos
- `FUNCTIONS_WORKER_RUNTIME` = `node`

Ejemplo:

```text
ALLOWED_ORIGINS=http://localhost:5173,https://<usuario>.github.io
```

## Desarrollo local

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Backend

```bash
cd backend
cp local.settings.example.json local.settings.json
npm install
npm run build
func start
```

Endpoints locales:

- `GET http://localhost:7071/api/health`
- `POST http://localhost:7071/api/analyze-cv`
- `POST http://localhost:7071/api/analyze-batch`

## Deploy frontend en GitHub Pages

1. Subir cambios a `main`.
2. Crear variable de repositorio `VITE_API_URL` con la URL publica del backend.
3. Activar GitHub Pages con fuente `GitHub Actions`.
4. El workflow `.github/workflows/deploy-frontend.yml` construye y publica automaticamente.

El workflow inyecta:

- `VITE_BASE_PATH=/<nombre-repo>/`
- `VITE_API_URL` desde GitHub Variables

## Deploy backend en Azure Functions

Requisitos:

- Azure CLI
- Azure Functions Core Tools
- Cuenta Azure activa

Ejemplo de despliegue (Node + Linux):

```bash
az login
az group create --name rg-openday-cv --location eastus
az storage account create --name stopendaycv001 --location eastus --resource-group rg-openday-cv --sku Standard_LRS
az functionapp create --resource-group rg-openday-cv --consumption-plan-location eastus --runtime node --runtime-version 22 --functions-version 4 --name <tu-function-app> --storage-account stopendaycv001
```

Publicar codigo:

```bash
cd backend
npm install
npm run build
func azure functionapp publish <tu-function-app>
```

Configurar secretos y CORS:

```bash
az functionapp config appsettings set --name <tu-function-app> --resource-group rg-openday-cv --settings OPENAI_API_KEY=<tu-api-key> ALLOWED_ORIGINS=https://<usuario>.github.io,http://localhost:5173
az functionapp cors add --name <tu-function-app> --resource-group rg-openday-cv --allowed-origins https://<usuario>.github.io
```

Si tu pagina publica usa dominio de repositorio (sin dominio custom), el origen sigue siendo `https://<usuario>.github.io`.

## Notas de produccion

- No exponer `OPENAI_API_KEY` en frontend.
- Habilitar HTTPS en todos los endpoints.
- Ajustar limites de lote segun costo/latencia.
- Agregar monitoreo de Azure Application Insights para trazabilidad.
