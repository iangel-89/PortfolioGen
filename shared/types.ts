/**
 * Shared state contract — consumed by both the Express orchestrator and the React client.
 *
 * This file is the TypeScript expression of section C.2 of the MEP-7 method
 * ("Estado compartido"): a single state object that every stage reads from and
 * writes to, where each stage owns exactly one slice.
 *
 * Method keys are Spanish; this codebase is English. The mapping is:
 *   perfil_crudo       -> rawProfile / rawProjects
 *   brief_estrategico  -> strategicBrief
 *   inventario_curado  -> curatedInventory
 *   casos_narrativos   -> caseNarratives
 *   modelo_contenido   -> contentModel
 *   sistema_visual     -> visualSystem
 *   artefacto          -> artifact
 *   reporte_calidad    -> qualityReport
 *   plan_iteracion     -> deliveryPackage.iterationPlan
 *   banderas           -> flags
 *   trazabilidad       -> trace
 */

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** Operating mode. `minimal_evidence` swaps case studies for a capability document (Router 2). */
export type Mode = 'standard' | 'minimal_evidence';

/** Provenance label every numeric claim must carry (Phase 3 truthfulness rule). */
export type SourceLabel = 'measured' | 'estimated' | 'client_reported' | 'unsourced';

/** Work classification. Must stay visible in the final artifact (Phase 2 honesty rule). */
export type WorkType = 'professional' | 'academic' | 'volunteer' | 'personal';

/** Every agent declares its own confidence (contract rule 4). */
export type Confidence = 'high' | 'medium' | 'low';

/** Composition archetype selected by Router 4 — replaces template selection. */
export type Archetype = 'editorial' | 'gallery' | 'executive_document' | 'technical';

/** Confidentiality mitigation tactic (the three documented by NN/g). */
export type ConfidentialityTactic = 'show_process' | 'redact' | 'genericize';

export type OutputFormat = 'web' | 'pdf' | 'both';

export type GateVerdict = 'pass' | 'fail';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

/* ------------------------------------------------------------------ */
/* Phase 0 — Intake (Agent 0)                                          */
/* ------------------------------------------------------------------ */

export interface RawProfile {
  profession: string;
  specialty: string;
  yearsExperience: number | null;
  goal: string;
  targetRole: string;
  referencePostings: string[];
  region: string;
  language: string;
  statedDifferentiator: string;
  desiredImpression: string;
  preferredFormat: OutputFormat | '';
  visualReferences: string[];
  existingBrand: { colors?: string[]; typefaces?: string[]; notes?: string };
  /** A sample of the user's own writing, used only to calibrate voice. */
  voiceSample: string;
}

export interface Metric {
  claim: string;
  source: SourceLabel;
}

export interface Material {
  kind: 'image' | 'document' | 'link';
  description: string;
  ref: string;
}

export interface RawProject {
  id: string;
  name: string;
  year: string;
  type: WorkType;
  problem: string;
  ownRole: string;
  teamRole: string;
  actions: string;
  outcome: string;
  metrics: Metric[];
  materials: Material[];
  confidential: boolean;
  notes: string;
}

/* ------------------------------------------------------------------ */
/* Phase 1 — Strategic framing (Agent 1)                               */
/* ------------------------------------------------------------------ */

export interface Competency {
  competency: string;
  priority: number;
  evidenceAvailable: 'yes' | 'partial' | 'no';
  sectorVocabulary: string;
}

export interface StrategicBrief {
  primaryReader: { profile: string; evaluates: string[]; timeSpent: string };
  secondaryReader: { profile: string; evaluates: string[] };
  portfolioGoal: string;
  /** Must be falsifiable: if any peer could sign it, Router 1 rejects it. */
  thesis: string;
  takeaways: string[];
  competencyMatrix: Competency[];
  /** 1 = highly expressive sector, 5 = highly conservative. */
  formalityIndex: number;
  formalityRationale: string;
  targetTone: string;
  keyVocabulary: string[];
  positioningRisks: string[];
  /** Non-empty means the goals are materially different and need separate variants. */
  recommendedVariants: string[];
  /** Claims the evidence does not yet support. Kept out of takeaways on purpose. */
  aspirational: string[];
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Curation (Agent 2)                                        */
/* ------------------------------------------------------------------ */

export interface CurationWeights {
  goalAlignment: number;
  impactEvidence: number;
  processRichness: number;
  narrative: number;
}

export interface CurationCriteria {
  weights: CurationWeights;
  hardRules: string[];
  mandatoryCoverage: string[];
}

export interface ScoredProject {
  id: string;
  name: string;
  scores: CurationWeights;
  weighted: number;
  decision: 'feature' | 'gallery' | 'excluded';
  reason: string;
}

export interface SelectedCase {
  id: string;
  order: number;
  inclusionReason: string;
  demonstratesCompetencies: string[];
  type: WorkType;
  confidentiality: { applies: boolean; tactic: ConfidentialityTactic };
  availableMaterials: string[];
  missingMaterials: string[];
}

export interface CuratedInventory {
  fullEvaluation: ScoredProject[];
  featuredSelection: SelectedCase[];
  secondaryGallery: { id: string; name: string; oneLiner: string }[];
  coverageMap: { competency: string; coveredBy: string[]; status: 'covered' | 'partial' | 'gap' }[];
  gaps: { competency: string; recommendedAction: string; effort: 'low' | 'medium' | 'high' }[];
}

/* ------------------------------------------------------------------ */
/* Phase 3 — Case narratives (Agent 3)                                 */
/* ------------------------------------------------------------------ */

export interface Assertion {
  text: string;
  kind: 'numeric' | 'qualitative';
  source: SourceLabel;
  actionApplied: 'kept' | 'rewritten_qualitative' | 'removed';
}

export interface VisualCue {
  block: number;
  kind: 'sketch' | 'wireframe' | 'process_photo' | 'before_after' | 'final_screen' | 'diagram';
  mustShow: string;
  altText: string;
  status: 'available' | 'to_capture';
  userInstruction: string;
}

/** The seven NN/g case-study elements, in order. */
export interface NarrativeBlock {
  n: number;
  heading: string;
  text: string;
  words: number;
}

export interface CaseNarrative {
  id: string;
  title: string;
  /** One sentence: the strongest verifiable result. */
  impactHeadline: string;
  starSummary: { situation: string; task: string; action: string; result: string };
  blocks: NarrativeBlock[];
  assertions: Assertion[];
  visualScript: VisualCue[];
  workType: WorkType;
  confidentialityApplied: string;
  totalWords: number;
}

/* ------------------------------------------------------------------ */
/* Phase 4 — Content model (Agent 4)                                   */
/* ------------------------------------------------------------------ */

export interface PriorityGuideBlock {
  priority: number;
  type: string;
  readerPurpose: string;
  contentRef: string;
}

export interface ContentModel {
  domainModel: { entities: string[]; relations: string[] };
  contentTypes: { type: string; requiredFields: string[]; optionalFields: string[]; cardinality: string }[];
  priorityGuides: { template: string; blocks: PriorityGuideBlock[] }[];
  siteMap: { route: string; template: string; menuLabel: string; depth: number }[];
  /** The above-the-fold block: who, what, thesis, proof, next action. */
  heroBlock: { who: string; whatTheyDo: string; thesis: string; proof: string; action: string };
  caseOrder: string[];
  metadata: {
    title: string;
    description: string;
    openGraph: Record<string, string>;
    schemaPerson: Record<string, unknown>;
  };
  altTextInventory: { ref: string; alt: string; decorative: boolean }[];
  outputVariants: { web: string[]; fullPdf: string[]; onePager: string[] };
  aboutSection: { heading: string; paragraphs: string[] };
  contactSection: { heading: string; lines: string[] };
}

/* ------------------------------------------------------------------ */
/* Phase 5 — Visual system (Agent 5)                                   */
/* ------------------------------------------------------------------ */

export interface ColorTokens {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentText: string;
  border: string;
  success: string;
  warning: string;
}

export interface TypeTokens {
  bodyFamily: string;
  headingFamily: string;
  fallbacks: string[];
  basePx: number;
  scaleRatio: number;
  scale: Record<string, number>;
  bodyLineHeight: number;
  measureCh: number;
  weights: number[];
}

export interface DesignTokens {
  color: ColorTokens;
  type: TypeTokens;
  spacing: { unit: number; scale: number[] };
  radius: Record<string, string>;
  elevation: Record<string, string>;
}

export interface ContrastCheck {
  pair: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  passes: boolean;
}

export interface VisualSystem {
  archetype: Archetype;
  tokens: DesignTokens;
  contrastChecks: ContrastCheck[];
  grid: { columns: number; gutter: string; margin: string; breakpoints: number[] };
  components: { atoms: string[]; molecules: string[]; organisms: string[]; templates: string[] };
  states: Record<string, string>;
  imageTreatment: { ratios: string[]; formats: string[]; budgetKb: Record<string, number> };
  rationale: { decision: string; because: string }[];
}

/* ------------------------------------------------------------------ */
/* Phase 6 — Artifact (Agent 6 + renderer)                             */
/* ------------------------------------------------------------------ */

export interface GeneratedFile {
  path: string;
  kind: 'html' | 'css' | 'markdown' | 'text';
  purpose: string;
  contents: string;
  bytes: number;
}

export interface Artifact {
  files: GeneratedFile[];
  manifest: { home: string; cases: string[]; fullPdfSource: string; onePager: string; caseText: string };
  lcpResource: string;
  homepageBytes: number;
  budgetOverruns: string[];
  publishingInstructions: { title: string; steps: string[]; free: boolean }[];
  buildNotes: string[];
}

/* ------------------------------------------------------------------ */
/* Phase 7 — Quality (Agent 7 + Agent 8)                               */
/* ------------------------------------------------------------------ */

/** Output of the deterministic checkers. The auditor interprets these; it does not compute them. */
export interface MachineFindings {
  contrast: ContrastCheck[];
  html: {
    file: string;
    hasLangAttribute: boolean;
    h1Count: number;
    headingSkips: string[];
    landmarks: { header: boolean; nav: boolean; main: boolean; footer: boolean };
    imagesMissingAlt: number;
    imagesMissingDimensions: number;
    hasSkipLink: boolean;
    externalResources: string[];
    scriptCount: number;
    hasTitle: boolean;
    hasMetaDescription: boolean;
    hasOpenGraph: boolean;
    hasStructuredData: boolean;
    bytes: number;
  }[];
  budgets: { item: string; actualKb: number; budgetKb: number; withinBudget: boolean }[];
  typography: { rule: string; actual: string; required: string; passes: boolean }[];
}

export interface GateFinding {
  criterion: string;
  severity: Severity;
  detail: string;
  location: string;
  correction: string;
  responsibleStage: string;
}

export interface QualityGate {
  gate: string;
  blocking: boolean;
  status: GateVerdict;
  findings: GateFinding[];
  machineVerified: string[];
  requiresHumanJudgement: string[];
}

export interface QualityReport {
  verdict: 'approved' | 'approved_with_warnings' | 'rejected';
  gates: QualityGate[];
  ninetySecondTest: { takeawaysRecovered: string[]; takeawaysLost: string[]; diagnosis: string };
  prioritizedActions: { priority: number; action: string; responsibleStage: string; impact: string }[];
  limitationStatements: string[];
}

/** Agent 8's output — this is what the user actually reads. */
export interface DeliveryPackage {
  /** Complete Markdown document following the mandated section structure. */
  markdown: string;
  summary: string;
  fileGuide: { path: string; whatItIsFor: string }[];
  publishing: { title: string; steps: string[]; free: boolean }[];
  qualityInPlainLanguage: { checked: string; result: string }[];
  improvementPlan: { action: string; impact: 'high' | 'medium' | 'low'; effort: 'low' | 'medium' | 'high' }[];
  iterationPlan: {
    whoToAsk: string[];
    threeQuestions: string[];
    whatToRecordAfterEachInterview: string[];
    updateCadence: string;
    captureTemplate: string[];
  };
  limitations: string[];
}

/* ------------------------------------------------------------------ */
/* Orchestration bookkeeping                                           */
/* ------------------------------------------------------------------ */

export interface Flags {
  nda: boolean;
  regulatedProfession: boolean;
  insufficientEvidence: boolean;
  weakCoverage: boolean;
  unsourcedAssertions: string[];
  /** Retry counters, one per gate that can send work back. All capped at 2. */
  briefRetries: number;
  narrativeRetries: number;
  visualRetries: number;
  qaRetries: number;
}

/** Contract rule 5: every stage writes what it decided and why. */
export interface TraceEntry {
  at: string;
  stageId: string;
  stageKind: 'agent' | 'router' | 'checker' | 'renderer';
  decision: string;
  reasoning: string;
  confidence?: Confidence;
  route?: string;
  durationMs?: number;
}

/** Warnings surfaced to the user in plain language (legal, confidentiality, evidence). */
export interface UserNotice {
  kind: 'legal' | 'confidentiality' | 'evidence' | 'quality';
  message: string;
}

export type SessionStatus =
  | 'intake'
  | 'ready_to_build'
  | 'building'
  | 'needs_user_input'
  | 'complete'
  | 'failed';

export interface SessionState {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  language: string;
  mode: Mode;
  status: SessionStatus;

  rawProfile: RawProfile | null;
  rawProjects: RawProject[];
  strategicBrief: StrategicBrief | null;
  curationCriteria: CurationCriteria | null;
  curatedInventory: CuratedInventory | null;
  caseNarratives: CaseNarrative[];
  contentModel: ContentModel | null;
  archetypeDecision: {
    archetype: Archetype;
    evidenceProfile: { visualRatio: number; textDensity: number; formality: number; dominantType: string };
    justification: string;
    constraints: {
      colorRange: string;
      typographicExpressiveness: 'low' | 'medium' | 'high';
      maxDecorativeRatio: number;
      existingBrand: Record<string, unknown>;
    };
  } | null;
  visualSystem: VisualSystem | null;
  machineFindings: MachineFindings | null;
  artifact: Artifact | null;
  qualityReport: QualityReport | null;
  delivery: DeliveryPackage | null;

  flags: Flags;
  notices: UserNotice[];
  trace: TraceEntry[];

  /**
   * Instructions routers hand to a downstream or re-run stage, keyed by stage id.
   * Routers never rewrite content (section E, common rule) — they write directives
   * here and give control back to the responsible stage.
   */
  directives: Record<string, string[]>;

  /** Set when a blocking gate could not be cleared within its retry budget. */
  escalation: string | null;
}

/* ------------------------------------------------------------------ */
/* Chat (Phase 0 surface)                                              */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Tap-able options offered alongside the question (spec: options over free text). */
  quickReplies?: string[];
  at?: string;
}

export interface InterviewProgress {
  questionsAsked: number;
  maxQuestions: number;
  /** Which information block the interviewer is currently working through. */
  block: 'identity' | 'projects' | 'context' | 'preferences' | 'done';
  blockLabel: string;
  readyToBuild: boolean;
  /** Plain-language checklist shown in the sidebar. */
  collected: { label: string; done: boolean }[];
}

export interface ChatResponse {
  message: ChatMessage;
  progress: InterviewProgress;
  projectsCaptured: { id: string; name: string }[];
  notices: UserNotice[];
}

/* ------------------------------------------------------------------ */
/* Pipeline streaming                                                  */
/* ------------------------------------------------------------------ */

/** The seven user-visible phases. Internal agent/router names never reach the client. */
export interface PhaseDescriptor {
  id: string;
  label: string;
  blurb: string;
}

export type PipelineEvent =
  | { type: 'phase_start'; phaseId: string; index: number; total: number }
  | { type: 'phase_detail'; phaseId: string; detail: string }
  | { type: 'phase_done'; phaseId: string; index: number; total: number }
  | { type: 'notice'; notice: UserNotice }
  | { type: 'retry'; phaseId: string; attempt: number; reason: string }
  | { type: 'escalate'; message: string }
  | { type: 'complete'; state: SessionState }
  | { type: 'error'; message: string };
