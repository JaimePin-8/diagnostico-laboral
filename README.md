# Diagnóstico laboral · Ley Federal del Trabajo

Encuesta de 8 preguntas que compara la situación laboral de una persona con la Ley Federal del Trabajo (LFT) de México y entrega un diagnóstico con puntaje, alertas, puntos a favor y recomendaciones. Proyecto académico sobre explotación laboral encubierta. Herramienta orientativa, no constituye asesoría legal.

## Arquitectura

```
Navegador (GitHub Pages)        Supabase
public/  HTML + CSS + JS  --->  Edge Function "diagnosticar"  --->  Postgres (tabla "respuestas")
sin ninguna llave               valida, calcula, guarda          RLS activo, sin políticas
```

| Pieza | Dónde | Qué hace |
|---|---|---|
| `public/` | GitHub Pages | Formulario y presentación del resultado. No contiene llaves ni lógica legal. |
| `supabase/functions/diagnosticar/` | Supabase Edge Functions | Valida las respuestas, calcula el diagnóstico (`diagnostico.ts`), limita el uso por IP y guarda un registro anónimo. |
| `supabase/migrations/` | Supabase Postgres | Tabla `respuestas` con restricciones `check`, RLS activo y permisos revocados a `anon` y `authenticated`. |

## Seguridad

- **Llaves fuera del navegador.** El sitio solo conoce la URL pública de la función. La llave de servicio (`SUPABASE_SERVICE_ROLE_KEY`) y la sal de IPs (`IP_SALT`) existen únicamente como secretos de Supabase; no están en el repositorio.
- **Base de datos inaccesible desde fuera.** La tabla tiene RLS activo sin políticas y sin permisos para `anon`/`authenticated`: la API REST pública responde `permission denied` al leer, insertar o borrar. No hay ninguna ruta que devuelva respuestas guardadas.
- **Una sola entrada.** La función solo acepta `POST` con JSON de hasta 2 KB, valida cada campo contra listas y rangos permitidos y descarta cualquier campo extra.
- **CORS restringido.** Solo el origen del sitio (`ALLOWED_ORIGINS`) puede llamar desde un navegador; otros orígenes reciben 403.
- **Límite de uso.** Máximo 60 solicitudes por IP cada 10 minutos (429 al excederlo).
- **Privacidad.** No se pide nombre, correo ni empresa. El puesto escrito no sale del navegador. La IP solo se guarda como SHA-256 con sal secreta.
- **Política de contenido** (`Content-Security-Policy`): solo scripts y estilos propios, conexiones únicamente a `*.supabase.co`. El resultado se construye con `textContent`, sin `innerHTML`.

## Desarrollo

Pruebas (Deno, sin instalar nada):

```bash
npx -y deno@2.1.4 test dev/
```

Servidor local del sitio (`http://localhost:4173` debe estar en `ALLOWED_ORIGINS` mientras se prueba):

```bash
python3 -m http.server 4173 --directory public
```

## Despliegue

Backend (requiere `supabase login`):

```bash
npx -y supabase@2.119.0 link --project-ref omynafqhrcqqxxdivjbv
npx -y supabase@2.119.0 db push
npx -y supabase@2.119.0 secrets set IP_SALT="$(openssl rand -hex 32)" ALLOWED_ORIGINS=https://jaimepin-8.github.io
npx -y supabase@2.119.0 functions deploy diagnosticar --no-verify-jwt
```

Sitio: cada `git push` a `main` que cambie `public/` se publica con `.github/workflows/pages.yml`.

Si se recrea el proyecto de Supabase, actualizar `API_URL` en `public/config.js`.

## Reglas de la LFT implementadas

Jornada diurna de 8 h (Art. 61), tiempo extra y pago doble/triple (Arts. 66-68), descanso en la jornada (Art. 63), descanso semanal y prima dominical (Arts. 69, 71 y 73), salarios mínimos 2026 por zona (Arts. 90-91), prescripción de 1 año (Art. 516) y trato digno / riesgo psicosocial (NOM-035, Arts. 3 Bis, 51-II y 132-VI). Cuando la jornada es menor a 8 h, el salario mínimo se compara de forma proporcional.
