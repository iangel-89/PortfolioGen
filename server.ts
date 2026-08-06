import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { SessionState } from './src/types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory store for sessions (MVP)
  const sessions = new Map<string, SessionState>();

  // Helper to initialize session
  const initSession = (id: string): SessionState => {
    if (!sessions.has(id)) {
      sessions.set(id, {
        session_id: id,
        idioma: 'es',
        modo: 'normal',
        perfil_crudo: null,
        proyectos: [],
        casos_narrativos: [],
        banderas: { nda: false, profesion_regulada: false, evidencia_insuficiente: false, aserciones_sin_fuente: [], reintentos_qa: 0 },
        trazabilidad: []
      });
    }
    return sessions.get(id)!;
  };

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { sessionId, messages } = req.body;
      if (!sessionId || !messages) return res.status(400).json({ error: 'Missing parameters' });
      
      const state = initSession(sessionId);

      // We use Gemini to act as Agent 0 (Entrevistador / Ingesta)
      // For MVP, we instruct the model to reply conversationally and, when ready, emit the JSON block.
      const prompt = `Eres el entrevistador de un sistema que construye portafolios (MEP-7 Agente 0).
Tu única función es obtener información del usuario. No diseñas.
Reglas:
- Preguntas cortas, una por turno. Lenguaje cotidiano.
- Necesitas: Profesión/objetivo (Bloque A), Proyectos (Bloque B, mín 2 proyectos), Contexto (Bloque C), Formato preferido (Bloque D).
- Nunca menciones fases o métodos.
- Al final de cada respuesta tuya, puedes incluir (oculto al usuario, nosotros lo parsearemos) un JSON dentro de bloques \`\`\`json ... \`\`\` que represente la recolección actual de perfil_crudo y proyectos. Pero sólo si hay nueva información estructurada que guardar.

Conversación anterior:
${messages.map((m: any) => `${m.role === 'user' ? 'Usuario' : 'Tú'}: ${m.content}`).join('\n')}

Por favor, da tu próxima respuesta como el Entrevistador.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const rawText = response.text || '';
      
      // Basic extraction logic for MVP
      let nextMessage = rawText;
      let jsonUpdate = null;
      
      const jsonMatch = rawText.match(/```json([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          jsonUpdate = JSON.parse(jsonMatch[1]);
          nextMessage = rawText.replace(/```json[\s\S]*?```/, '').trim();
          
          if (jsonUpdate.perfil_crudo) state.perfil_crudo = { ...state.perfil_crudo, ...jsonUpdate.perfil_crudo };
          if (jsonUpdate.proyectos) state.proyectos = jsonUpdate.proyectos;
          if (jsonUpdate.banderas) state.banderas = { ...state.banderas, ...jsonUpdate.banderas };
        } catch(e) {
          console.error("Failed to parse inner JSON", e);
        }
      }

      res.json({ message: nextMessage, stateUpdate: jsonUpdate });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/pipeline/:stage', async (req, res) => {
    const { sessionId } = req.body;
    const { stage } = req.params;
    
    // Simulate pipeline execution (Agents 1-8 and Routers 1-7)
    // For MVP, we'll implement a mock structure that returns dummy MEP-7 valid state 
    // to show the architectural flow and frontend integration.
    
    const state = initSession(sessionId);

    try {
      if (stage === '1') {
        // Mock Agent 1 + Router 1
        await new Promise(r => setTimeout(r, 1500));
        state.brief_estrategico = {
          lector_primario: { perfil: 'Reclutador IT', que_evalua: ['experiencia', 'impacto'], cuanto_tiempo_dedica: '5 min' },
          lector_secundario: { perfil: 'CTO', que_evalua: ['tecnologia'] },
          objetivo_portafolio: 'Conseguir trabajo Fullstack',
          tesis: 'Desarrollador capaz de entender producto',
          takeaways: ['Eficiente', 'Limpio', 'Comunicativo'],
          matriz_competencias: [{ competencia: 'React', prioridad: 1, evidencia_disponible: 'si', vocabulario_sector: 'frontend' }],
          indice_formalidad: 3,
          justificacion_formalidad: 'Estándar tech',
          tono_objetivo: 'Profesional',
          vocabulario_clave: ['desarrollo', 'startup'],
          riesgos_posicionamiento: [],
          variantes_recomendadas: []
        };
      } else if (stage === '2') {
        // Mock Agent 2 + Router 2
        await new Promise(r => setTimeout(r, 1500));
        state.inventario_curado = {
          evaluacion_completa: [],
          seleccion_principal: [
            {
              id: 'p1', orden: 1, razon_de_inclusion: 'Fuerte', competencias_que_demuestra: ['React'], 
              tipo: 'profesional', confidencialidad: { aplica: false, tactica: 'mostrar_proceso' }, 
              materiales_disponibles: [], materiales_faltantes: []
            }
          ],
          galeria_secundaria: [],
          mapa_cobertura: [],
          brechas: []
        };
      } else if (stage === '3') {
        // Mock Agent 3 + Router 3
        await new Promise(r => setTimeout(r, 2000));
        state.casos_narrativos = [
          {
            id: 'p1', titulo: 'E-commerce', titular_impacto: 'Aumentó ventas 20%',
            resumen_star: { situacion: 'S', tarea: 'T', accion: 'A', resultado: 'R' },
            bloques: [{ n: 1, encabezado: 'El Reto', texto: 'Hacerlo rápido.', palabras: 10 }],
            aserciones: [], guion_visual: [], etiqueta_tipo: 'profesional', confidencialidad_aplicada: 'ninguna', palabras_totales: 10
          }
        ];
      } else if (stage === '4') {
        await new Promise(r => setTimeout(r, 1500));
        state.modelo_contenido = {
          modelo_dominio: { entidades: [], relaciones: [] },
          tipos_contenido: [], priority_guides: [], mapa_sitio: [],
          bloque_superior_portada: { quien: 'Dev', que_hace: 'Code', tesis: 'Rapido', prueba: 'Exito', accion: 'Ver' },
          orden_casos: ['p1'], metadatos: { title: 'Portafolio', description: '', og: {}, schema_person: {} },
          inventario_alt_text: [], variantes_salida: { web: [], pdf_completo: [], version_corta: [] }
        };
      } else if (stage === '5') {
        await new Promise(r => setTimeout(r, 1500));
        state.sistema_visual = {
          arquetipo: 'tecnico',
          tokens: {
            color: { fondo: '#ffffff', superficie: '#f3f4f6', texto_primario: '#111827', texto_secundario: '#4b5563', acento: '#2563eb', borde: '#e5e7eb', exito: '#10b981', advertencia: '#f59e0b' },
            tipografia: { familia_texto: 'Inter', familia_titulos: 'Inter', fallbacks: [], base_px: 16, razon_escala: 1.25, escala: {}, interlineado_texto: 1.5, ancho_linea_ch: 65 },
            espaciado: { unidad: 8, escala: [4,8,16,24] },
            radio: '8px', sombra: 'none'
          },
          verificacion_contraste: [],
          reticula: { columnas: 12, medianil: '16px', margen: '16px', breakpoints: [320] },
          componentes: { atomos: [], moleculas: [], organismos: [], plantillas: [] },
          estados: {}, tratamiento_imagen: { proporciones: [], formatos: [], presupuesto_kb: {} },
          racional: []
        };
      } else if (stage === '6') {
        await new Promise(r => setTimeout(r, 2000));
        state.artefacto = {
          archivos: [{ ruta: 'index.html', tipo: 'html', proposito: 'Principal', peso_kb: 50 }],
          manifiesto: { portada: 'index.html', casos: [], pdf_completo: '', version_corta: '' },
          recurso_lcp: '', peso_total_portada_kb: 50, excedencias: [], instrucciones_publicacion: ['Sube a Vercel'], notas_construccion: []
        };
      } else if (stage === '7') {
        await new Promise(r => setTimeout(r, 1500));
        state.reporte_calidad = {
          veredicto: 'aprobado',
          puertas: [],
          prueba_90_segundos: { takeaways_recuperados: [], takeaways_perdidos: [], diagnostico: 'OK' },
          acciones_priorizadas: [], declaraciones_de_limitacion: []
        };
      }

      res.json({ success: true, stage, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/session/:sessionId', (req, res) => {
    const state = initSession(req.params.sessionId);
    res.json(state);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
