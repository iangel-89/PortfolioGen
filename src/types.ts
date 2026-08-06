export type Mode = 'normal' | 'evidencia_minima' | 'actualizacion';

export interface PerfilCrudo {
  profesion: string;
  especialidad: string;
  anios_experiencia: number;
  objetivo: string;
  puesto_objetivo: string;
  ofertas_referencia: string[];
  region: string;
  idioma: string;
  diferenciador_declarado: string;
  impresion_deseada: string;
  formato_preferido: 'web' | 'pdf' | 'ambos';
  referencias_visuales: string[];
  marca_existente: any;
}

export interface ProyectoCrudo {
  id: string;
  nombre: string;
  anio: string;
  tipo: 'profesional' | 'academico' | 'voluntario' | 'personal';
  problema: string;
  rol_propio: string;
  rol_equipo: string;
  acciones: string;
  resultado: string;
  metricas: Array<{
    afirmacion: string;
    fuente: 'medido' | 'estimado' | 'reportado_cliente' | 'sin_fuente';
  }>;
  materiales: Array<{
    tipo: 'imagen' | 'documento' | 'enlace';
    descripcion: string;
    ref: string;
  }>;
  confidencial: boolean;
  notas: string;
}

export interface BriefEstrategico {
  lector_primario: { perfil: string; que_evalua: string[]; cuanto_tiempo_dedica: string };
  lector_secundario: { perfil: string; que_evalua: string[] };
  objetivo_portafolio: string;
  tesis: string;
  takeaways: string[];
  matriz_competencias: Array<{ competencia: string; prioridad: number; evidencia_disponible: 'si' | 'parcial' | 'no'; vocabulario_sector: string }>;
  indice_formalidad: number;
  justificacion_formalidad: string;
  tono_objetivo: string;
  vocabulario_clave: string[];
  riesgos_posicionamiento: string[];
  variantes_recomendadas: string[];
}

export interface InventarioCurado {
  evaluacion_completa: Array<{
    id: string;
    nombre: string;
    puntajes: { alineacion_objetivo: number; evidencia_impacto: number; riqueza_proceso: number; narrativa: number };
    ponderado: number;
    decision: 'principal' | 'galeria' | 'excluido';
    motivo: string;
  }>;
  seleccion_principal: Array<{
    id: string;
    orden: number;
    razon_de_inclusion: string;
    competencias_que_demuestra: string[];
    tipo: 'profesional' | 'academico' | 'voluntario' | 'personal';
    confidencialidad: { aplica: boolean; tactica: 'mostrar_proceso' | 'redactar' | 'genericizar' };
    materiales_disponibles: string[];
    materiales_faltantes: string[];
  }>;
  galeria_secundaria: any[];
  mapa_cobertura: Array<{ competencia: string; cubierta_por: string[]; estado: 'cubierta' | 'parcial' | 'brecha' }>;
  brechas: Array<{ competencia: string; accion_recomendada: string; esfuerzo_estimado: 'bajo' | 'medio' | 'alto' }>;
}

export interface CasoNarrativo {
  id: string;
  titulo: string;
  titular_impacto: string;
  resumen_star: { situacion: string; tarea: string; accion: string; resultado: string };
  bloques: Array<{ n: number; encabezado: string; texto: string; palabras: number }>;
  aserciones: Array<{
    texto: string;
    tipo: 'numerica' | 'cualitativa';
    fuente: 'medido' | 'estimado' | 'reportado_cliente' | 'sin_fuente';
    accion_aplicada: 'mantenida' | 'reescrita_cualitativa' | 'eliminada';
  }>;
  guion_visual: Array<{
    bloque: number;
    tipo: 'boceto' | 'wireframe' | 'foto_proceso' | 'antes_despues' | 'pantalla_final' | 'diagrama';
    que_debe_mostrar: string;
    alt_text: string;
    estado: 'disponible' | 'por_capturar';
    instruccion_al_usuario: string;
  }>;
  etiqueta_tipo: 'profesional' | 'academico' | 'voluntario' | 'personal';
  confidencialidad_aplicada: string;
  palabras_totales: number;
}

export interface ModeloContenido {
  modelo_dominio: { entidades: any[]; relaciones: any[] };
  tipos_contenido: any[];
  priority_guides: Array<{ plantilla: string; bloques: Array<{ prioridad: number; tipo: string; proposito_lector: string; contenido_ref: string }> }>;
  mapa_sitio: Array<{ ruta: string; plantilla: string; etiqueta_menu: string; profundidad: number }>;
  bloque_superior_portada: { quien: string; que_hace: string; tesis: string; prueba: string; accion: string };
  orden_casos: string[];
  metadatos: { title: string; description: string; og: any; schema_person: any };
  inventario_alt_text: Array<{ ref: string; alt: string; decorativa: boolean }>;
  variantes_salida: { web: string[]; pdf_completo: string[]; version_corta: string[] };
}

export interface SistemaVisual {
  arquetipo: string;
  tokens: {
    color: { fondo: string; superficie: string; texto_primario: string; texto_secundario: string; acento: string; borde: string; exito: string; advertencia: string };
    tipografia: { familia_texto: string; familia_titulos: string; fallbacks: string[]; base_px: number; razon_escala: number; escala: any; interlineado_texto: number; ancho_linea_ch: number };
    espaciado: { unidad: number; escala: number[] };
    radio: any;
    sombra: any;
  };
  verificacion_contraste: Array<{ par: string; ratio: number; requerido: number; cumple: boolean }>;
  reticula: { columnas: number; medianil: string; margen: string; breakpoints: number[] };
  componentes: { atomos: any[]; moleculas: any[]; organismos: any[]; plantillas: any[] };
  estados: any;
  tratamiento_imagen: { proporciones: string[]; formatos: string[]; presupuesto_kb: any };
  racional: Array<{ decision: string; porque: string }>;
}

export interface Artefacto {
  archivos: Array<{ ruta: string; tipo: 'html' | 'css' | 'js' | 'imagen' | 'pdf'; proposito: string; peso_kb: number }>;
  manifiesto: { portada: string; casos: string[]; pdf_completo: string; version_corta: string };
  recurso_lcp: string;
  peso_total_portada_kb: number;
  excedencias: string[];
  instrucciones_publicacion: string[];
  notas_construccion: string[];
}

export interface ReporteCalidad {
  veredicto: 'aprobado' | 'aprobado_con_advertencias' | 'rechazado';
  puertas: Array<{
    puerta: string;
    bloqueante: boolean;
    estado: 'pasa' | 'falla';
    hallazgos: Array<{ criterio: string; severidad: string; detalle: string; ubicacion: string; correccion: string; agente_responsable: string }>;
    verificado_automaticamente: string[];
    requiere_juicio_humano: string[];
  }>;
  prueba_90_segundos: { takeaways_recuperados: string[]; takeaways_perdidos: string[]; diagnostico: string };
  acciones_priorizadas: Array<{ prioridad: number; accion: string; agente_responsable: string; impacto: string }>;
  declaraciones_de_limitacion: string[];
}

export interface Banderas {
  nda: boolean;
  profesion_regulada: boolean;
  evidencia_insuficiente: boolean;
  aserciones_sin_fuente: string[];
  reintentos_qa: number;
}

export interface SessionState {
  session_id: string;
  idioma: string;
  modo: Mode;
  perfil_crudo?: PerfilCrudo | null;
  proyectos: ProyectoCrudo[];
  brief_estrategico?: BriefEstrategico | null;
  inventario_curado?: InventarioCurado | null;
  casos_narrativos: CasoNarrativo[];
  modelo_contenido?: ModeloContenido | null;
  sistema_visual?: SistemaVisual | null;
  artefacto?: Artefacto | null;
  reporte_calidad?: ReporteCalidad | null;
  banderas: Banderas;
  trazabilidad: any[];
}
