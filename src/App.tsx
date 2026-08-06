import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, User, ChevronRight, CheckCircle2, Circle, Loader2, Sparkles, FolderDown, RotateCcw } from 'lucide-react';
import { SessionState } from './types';

function App() {
  const [view, setView] = useState<'welcome' | 'chat' | 'processing' | 'result'>('welcome');
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string}[]>([{
    role: 'assistant',
    content: '¡Hola! Vamos a construir tu portafolio profesional. Te haré algunas preguntas sobre tu trabajo, experiencia y objetivos. Tomará unos minutos. ¿A qué te dedicas y desde hace cuánto?'
  }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentStage, setCurrentStage] = useState(1);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const newMessages = [...messages, { role: 'user' as const, content: input }];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, messages: newMessages })
      });
      const data = await res.json();
      
      setMessages([...newMessages, { role: 'assistant', content: data.message }]);

    } catch (e) {
      console.error(e);
      setMessages([...newMessages, { role: 'assistant', content: 'Hubo un error de conexión.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const startPipeline = async () => {
    setView('processing');
    
    for (let i = 1; i <= 7; i++) {
      setCurrentStage(i);
      try {
        const res = await fetch(`/api/pipeline/${i}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });
        const data = await res.json();
        setSessionState(data.state);
      } catch (e) {
        console.error('Pipeline error at stage', i, e);
        break;
      }
    }
    
    setView('result');
  };

  const stages = [
    'Perfil y Objetivo',
    'Curación de Proyectos',
    'Redacción Estratégica',
    'Arquitectura y Diseño',
    'Producción Final'
  ];

  const getStageStatus = (idx: number) => {
    // Map the 7 internal stages to these 5 display stages
    const mappedStage = Math.ceil((currentStage / 7) * 5); 
    if (view === 'result') return 'completed';
    if (view === 'processing') {
      if (mappedStage > idx + 1) return 'completed';
      if (mappedStage === idx + 1) return 'current';
      return 'pending';
    }
    if (view === 'chat' && idx === 0) return 'current';
    return 'pending';
  };

  return (
    <div className="h-screen w-full bg-[#FDFCF9] font-sans text-[#2D2926] overflow-hidden flex">
      {/* Left Sidebar: Progress & Info */}
      <aside className="w-72 bg-[#F5F2ED] border-r border-[#E6E2DB] flex-col p-6 hidden md:flex">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-[#5A634E] rounded-lg flex items-center justify-center text-white font-bold">P</div>
          <h1 className="font-semibold text-lg tracking-tight">PortfolioGen</h1>
        </div>
        
        <div className="mb-10">
          <p className="text-sm text-[#6B665E] leading-relaxed italic">
            "Transformamos tu experiencia profesional en un portafolio listo para desplegar en minutos."
          </p>
        </div>

        <nav className="flex-1 space-y-6">
          <div className="space-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#9A948B] font-bold">Etapas del Método</h2>
            <div className="space-y-3">
              {stages.map((stage, idx) => {
                const status = getStageStatus(idx);
                return (
                  <div key={idx} className={`flex items-center gap-3 ${status === 'pending' ? 'opacity-40' : ''}`}>
                    {status === 'completed' ? (
                      <div className="w-6 h-6 rounded-full bg-[#5A634E] text-white flex items-center justify-center text-[10px]">✓</div>
                    ) : status === 'current' ? (
                      <div className="w-6 h-6 rounded-full border-2 border-[#5A634E] text-[#5A634E] flex items-center justify-center text-[10px] font-bold">{idx + 1}</div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-[#9A948B] flex items-center justify-center text-[10px]">{idx + 1}</div>
                    )}
                    <span className={`text-sm ${status === 'current' ? 'font-semibold text-[#2D2926]' : 'font-medium text-[#2D2926]'}`}>{stage}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </nav>

        <button onClick={() => window.location.reload()} className="mt-auto flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-[#D1CEC7] text-[#6B665E] text-sm hover:bg-white transition-colors">
          <RotateCcw className="w-4 h-4" />
          Reiniciar Proceso
        </button>
      </aside>

      {/* Main Chat Section */}
      <main className="flex-1 flex flex-col bg-white relative shadow-inner overflow-hidden">
        
        {view === 'welcome' && (
          <div className="flex-1 flex flex-col justify-center items-center text-center max-w-2xl mx-auto p-8 space-y-8 animate-in fade-in duration-500">
             <div className="w-16 h-16 bg-[#F5F2ED] rounded-2xl flex items-center justify-center mb-4 border border-[#E6E2DB]">
               <Bot className="w-8 h-8 text-[#5A634E]" />
             </div>
             <h2 className="text-4xl font-bold tracking-tight text-[#2D2926]">
               Construye tu portafolio sin plantillas
             </h2>
             <p className="text-lg text-[#6B665E] leading-relaxed">
               Responde unas preguntas sobre tu trabajo, experiencia y objetivos. 
               El sistema estructurará tu evidencia y creará un portafolio profesional listo para publicar.
             </p>
             <button 
               onClick={() => setView('chat')}
               className="bg-[#5A634E] text-white px-8 py-3.5 rounded-full font-medium text-lg hover:bg-[#4a5240] transition-colors flex items-center gap-2"
             >
               Comenzar Entrevista
               <ChevronRight className="w-5 h-5" />
             </button>
          </div>
        )}

        {(view === 'chat' || view === 'processing' || view === 'result') && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Topbar for mobile/chat specific actions */}
            <header className="bg-[#FDFCF9] border-b border-[#E6E2DB] py-4 px-6 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-2 md:hidden">
                 <div className="w-6 h-6 bg-[#5A634E] rounded-md flex items-center justify-center text-white font-bold text-xs">P</div>
                 <h1 className="font-semibold text-base tracking-tight text-[#2D2926]">PortfolioGen</h1>
               </div>
               <div className="hidden md:block"></div>
               {view === 'chat' && (
                 <button 
                   onClick={startPipeline}
                   className="text-xs uppercase tracking-widest bg-[#5A634E] text-white px-4 py-2 rounded-lg font-bold hover:bg-[#4a5240] transition-colors"
                 >
                   Generar Portafolio
                 </button>
               )}
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 relative">
              {view === 'processing' && (
                 <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col justify-center items-center">
                    <h3 className="text-xl font-bold text-[#2D2926] mb-6">Generando tu portafolio...</h3>
                    <div className="w-full max-w-sm bg-[#F5F2ED] rounded-2xl shadow-sm border border-[#E6E2DB] p-6 space-y-4">
                      <div className="flex items-center gap-4">
                        <Loader2 className="w-5 h-5 text-[#5A634E] animate-spin" />
                        <span className="text-sm font-medium text-[#2D2926]">Procesando fase {currentStage} de 7...</span>
                      </div>
                    </div>
                 </div>
              )}

              {view === 'result' && sessionState && (
                <div className="absolute inset-0 bg-white z-10 flex flex-col overflow-y-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
                  <div className="max-w-3xl mx-auto w-full space-y-8">
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-[#F5F2ED] border border-[#E6E2DB] rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-8 h-8 text-[#5A634E]" />
                      </div>
                      <h2 className="text-3xl font-bold text-[#2D2926]">Tu portafolio está listo</h2>
                      <p className="text-[#6B665E] text-lg">
                        Hemos estructurado tu evidencia según los estándares del sector.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-[#FDFCF9] p-6 rounded-2xl border border-[#E6E2DB] space-y-6 shadow-sm">
                        <h3 className="text-lg font-bold text-[#2D2926]">Estrategia Aplicada</h3>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs font-bold text-[#9A948B] uppercase tracking-widest mb-1">Tesis</h4>
                            <p className="text-sm text-[#2D2926] font-medium leading-relaxed">{sessionState.brief_estrategico?.tesis || 'Desarrollador enfocado en valor.'}</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-[#9A948B] uppercase tracking-widest mb-2">Takeaways</h4>
                            <ul className="space-y-2">
                              {sessionState.brief_estrategico?.takeaways?.map((t: string, i: number) => (
                                <li key={i} className="flex gap-2 text-sm text-[#2D2926]">
                                  <span className="text-[#5A634E] font-bold">•</span> {t}
                                </li>
                              )) || <li className="text-sm">Eficiencia, Claridad, Impacto</li>}
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#FDFCF9] p-6 rounded-2xl border border-[#E6E2DB] space-y-6 shadow-sm">
                        <h3 className="text-lg font-bold text-[#2D2926]">Archivos Generados</h3>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-[#E6E2DB]">
                            <div className="flex items-center gap-3">
                              <FolderDown className="w-5 h-5 text-[#9A948B]" />
                              <div>
                                <p className="font-medium text-sm text-[#2D2926]">Sitio Web (HTML/CSS)</p>
                                <p className="text-xs text-[#6B665E]">Listo para Vercel</p>
                              </div>
                            </div>
                            <button className="text-xs font-bold uppercase tracking-wide text-[#5A634E] hover:text-[#4a5240]">Descargar</button>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-[#E6E2DB]">
                            <div className="flex items-center gap-3">
                              <FolderDown className="w-5 h-5 text-[#9A948B]" />
                              <div>
                                <p className="font-medium text-sm text-[#2D2926]">Portafolio en PDF</p>
                                <p className="text-xs text-[#6B665E]">Para envíos</p>
                              </div>
                            </div>
                            <button className="text-xs font-bold uppercase tracking-wide text-[#5A634E] hover:text-[#4a5240]">Descargar</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Chat Messages */}
              {messages.map((m, i) => (
                m.role === 'user' ? (
                  <div key={i} className="flex gap-4 max-w-2xl ml-auto flex-row-reverse">
                    <div className="w-10 h-10 rounded-full bg-[#5A634E] flex-shrink-0 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">ME</span>
                    </div>
                    <div className="bg-[#5A634E] text-white p-5 rounded-2xl rounded-tr-none shadow-md">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-4 max-w-2xl">
                    <div className="w-10 h-10 rounded-full bg-[#E9E5DE] flex-shrink-0 flex items-center justify-center">
                      <span className="text-[#5A634E] text-xs font-bold">AI</span>
                    </div>
                    <div className="bg-[#F5F2ED] p-5 rounded-2xl rounded-tl-none shadow-sm text-[#2D2926]">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                )
              ))}
              
              {isTyping && (
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#E9E5DE] flex-shrink-0 flex items-center justify-center opacity-50"></div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-[#F9F7F2] rounded-full border border-[#E6E2DB]">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-[#5A634E] rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-[#5A634E] rounded-full animate-bounce delay-100 opacity-60"></span>
                      <span className="w-1.5 h-1.5 bg-[#5A634E] rounded-full animate-bounce delay-200 opacity-30"></span>
                    </span>
                    <span className="text-[11px] text-[#9A948B] font-medium">Analizando...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Chat Input */}
            <div className="p-4 md:p-6 border-t border-[#E6E2DB] bg-[#FDFCF9] shrink-0">
              <div className="max-w-3xl mx-auto flex items-center gap-3 bg-white p-2 border border-[#D1CEC7] rounded-2xl shadow-sm">
                <input 
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Escribe aquí tu respuesta..."
                  className="flex-1 px-4 py-2 text-sm focus:outline-none bg-transparent text-[#2D2926] placeholder:text-[#9A948B]"
                  disabled={isTyping || view === 'processing' || view === 'result'}
                />
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping || view === 'processing' || view === 'result'}
                  className="w-10 h-10 bg-[#5A634E] rounded-xl flex items-center justify-center text-white hover:bg-[#4a5240] transition-colors disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <p className="text-center text-[10px] text-[#9A948B] mt-3">Responde paso a paso para mejores resultados.</p>
            </div>
          </div>
        )}
      </main>

      {/* Right Panel: Output Preview */}
      <aside className="w-80 bg-[#E9E5DE] border-l border-[#E6E2DB] flex-col hidden lg:flex">
        <div className="p-6 border-b border-[#D1CEC7] flex justify-between items-center bg-[#F5F2ED]">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#5A634E]">Live Preview</h2>
          <span className="text-[10px] px-2 py-0.5 bg-white border border-[#D1CEC7] rounded text-[#6B665E]">v0.1.2</span>
        </div>
        
        <div className="flex-1 p-6">
          <div className="bg-white h-full rounded-2xl shadow-lg border border-[#D1CEC7] flex flex-col overflow-hidden">
            <div className="h-6 bg-[#F5F2ED] border-b border-[#E6E2DB] flex items-center px-3 gap-1.5 shrink-0">
              <div className="w-2 h-2 rounded-full bg-[#E07A5F]"></div>
              <div className="w-2 h-2 rounded-full bg-[#F2CC8F]"></div>
              <div className="w-2 h-2 rounded-full bg-[#81B29A]"></div>
            </div>
            
            <div className="p-4 flex-1">
              <div className="w-8 h-8 bg-[#5A634E] rounded-full mb-4"></div>
              <div className="h-3 w-3/4 bg-[#E9E5DE] rounded mb-2"></div>
              <div className="h-3 w-1/2 bg-[#E9E5DE] rounded mb-6"></div>
              
              <div className="space-y-4">
                <div className="h-24 bg-[#F5F2ED] rounded-xl border border-dashed border-[#D1CEC7] flex items-center justify-center">
                  <span className="text-[10px] text-[#9A948B] text-center px-4">
                    {sessionState?.proyectos?.length && sessionState.proyectos.length > 0 ? `Proyecto 1: ${sessionState.proyectos[0]?.nombre || 'Configurado'}` : 'Project 1: Pendiente'}
                  </span>
                </div>
                <div className="h-24 bg-[#F5F2ED] rounded-xl border border-dashed border-[#D1CEC7] flex items-center justify-center">
                  <span className="text-[10px] text-[#9A948B] text-center px-4">
                    {sessionState?.proyectos?.length && sessionState.proyectos.length > 1 ? `Proyecto 2: ${sessionState.proyectos[1]?.nombre || 'Configurado'}` : 'Project 2: Pendiente'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-[#FDFCF9] border-t border-[#E6E2DB] mt-auto shrink-0">
              <button 
                disabled={view !== 'result'}
                className={`w-full py-2 bg-[#5A634E] text-white text-[10px] font-bold rounded-lg uppercase tracking-wide transition-opacity ${view === 'result' ? 'hover:bg-[#4a5240]' : 'opacity-50 cursor-not-allowed'}`}
              >
                Desplegar en Vercel
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6 bg-[#F5F2ED] text-center border-t border-[#D1CEC7]">
          <p className="text-[11px] text-[#6B665E]">El resultado final se actualizará automáticamente conforme respondas las preguntas.</p>
        </div>
      </aside>
    </div>
  );
}

export default App;
