import React, { useState, useEffect, Suspense } from 'react';
import { generateRednote, searchTrends, regenerateTitles, rewriteContent, regenerateCoverTitle, analyzeMedia } from './services/gemini';
import { InputType, RednoteResponse, SearchResult, SearchSource, VisualTemplate, RednoteTone, MediaAnalysis } from './types';
const VisualCard = React.lazy(() => import('./components/VisualCard').then(module => ({ default: module.VisualCard })));
import { Loader2, Video, Search, Upload, Image as ImageIcon, ArrowLeft, PenTool, FileText, RefreshCw, Wand2, Link as LinkIcon, Key, X, PlayCircle, Dice5, CheckCircle, AlertCircle, Type as TypeIcon, MessageSquare, BrainCircuit, Plus, Trash2, Globe, Twitter, ExternalLink, Clock, ChevronRight, Zap } from 'lucide-react';

const App: React.FC = () => {
  // State
  const [step, setStep] = useState<'input' | 'result'>('input');
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_key') || '');
  const [showKeyModal, setShowKeyModal] = useState(false);
  
  // Data
  const [inputType, setInputType] = useState<InputType>('Type A');
  const [inputUrl, setInputUrl] = useState(''); // For Video URL or Custom Link
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string>('');
  const [inputText, setInputText] = useState(''); // Search query or extra context
  
  // Search Data
  const [searchSources, setSearchSources] = useState<SearchSource[]>(['google']);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Analysis Data
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<MediaAnalysis | null>(null);
  
  // Generation Data
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<RednoteResponse | null>(null);
  const [tone, setTone] = useState<RednoteTone>('emotional');
  
  // Edit State
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCoverMain, setEditCoverMain] = useState('');
  const [editCoverSub, setEditCoverSub] = useState('');
  const [coverImg, setCoverImg] = useState<string | null>(null);
  const [template, setTemplate] = useState<VisualTemplate>('apple_note');
  const [fontSize, setFontSize] = useState(1);
  
  // Handlers
  const saveKey = (k: string) => { localStorage.setItem('gemini_key', k); setApiKey(k); setShowKeyModal(false); };
  
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, type: 'video' | 'pdf') => {
      const f = e.target.files?.[0];
      if(!f) return;
      setInputFile(f);
      if(type === 'pdf') {
          const r = new FileReader();
          r.onload = () => setPdfBase64((r.result as string).split(',')[1]);
          r.readAsDataURL(f);
      }
  };

  // Step 1: Search (Type C only)
  const doSearch = async () => {
      if(!apiKey) { setShowKeyModal(true); return; }
      setIsSearching(true);
      try {
          const res = await searchTrends(inputText, searchSources, inputUrl, apiKey);
          setSearchResults(res);
      } catch(e) { alert("搜索失败"); }
      setIsSearching(false);
  };

  // Step 2: Analyze (All Types)
  const doAnalyze = async () => {
      if(!apiKey) { setShowKeyModal(true); return; }
      setIsAnalyzing(true);
      try {
          let data: any = {};
          if(inputType === 'Type A') data = { url: inputUrl, description: inputFile ? "Local Video" : "" }; // Real video bytes upload omitted for browser simplicity, treating as desc if no URL
          if(inputType === 'Type B') data = { base64: pdfBase64 };
          if(inputType === 'Type C') data = { searchResults }; // Pass search results for analysis
          
          const res = await analyzeMedia(inputType, data, apiKey);
          setAnalysis(res);
      } catch(e:any) { alert(e.message); }
      setIsAnalyzing(false);
  };

  // Step 3: Generate
  const doGenerate = async () => {
      if(!analysis) return;
      setIsGenerating(true);
      try {
          const res = await generateRednote(inputType, analysis, tone, "", apiKey);
          setResult(res);
          setEditTitle(res.content.title);
          setEditBody(res.content.fullText);
          setEditCoverMain(res.visualData.elements.coverText.main);
          setEditCoverSub(res.visualData.elements.coverText.sub);
          // Auto pick image from search if available
          if(inputType === 'Type C' && searchResults.length > 0) {
              const img = searchResults.find(r => r.imageUrl)?.imageUrl;
              if(img) setCoverImg(img);
          }
          setStep('result');
      } catch(e:any) { alert(e.message); }
      setIsGenerating(false);
  };

  // Render Helpers
  const SectionHeader = ({icon, title}: {icon: any, title: string}) => (
      <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
          {React.createElement(icon, {size: 16, className: "text-neon-lime"})}
          <h3 className="font-serif font-bold text-lg tracking-wider text-white">{title}</h3>
      </div>
  );

  return (
    <div className="min-h-screen font-sans text-gray-300 pb-20">
      {/* Key Modal */}
      {showKeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="artifact-card p-6 w-full max-w-md rounded-none border-l-4 border-neon-lime">
                  <h3 className="font-serif text-xl text-white mb-4">ACCESS KEY REQUIRED</h3>
                  <input type="password" className="w-full bg-black border border-white/20 p-3 text-white font-mono mb-4 focus:border-neon-lime outline-none" placeholder="sk-..." onBlur={e => saveKey(e.target.value)} />
                  <button onClick={() => setShowKeyModal(false)} className="w-full bg-neon-lime text-black font-bold py-3 hover:bg-white transition-colors">AUTHENTICATE</button>
              </div>
          </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-cyber-black/90 backdrop-blur-md border-b border-white/10 px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-neon-lime flex items-center justify-center text-black font-black text-lg">R</div>
              <span className="font-serif font-bold text-white tracking-widest hidden sm:block">REDNOTE.ENGINE</span>
          </div>
          <div className="flex gap-4">
              <button onClick={() => setShowKeyModal(true)} className="text-xs font-mono border border-white/20 px-3 py-1 rounded hover:border-neon-lime transition-colors">
                  {apiKey ? 'KEY_ACTIVE' : 'NO_KEY'}
              </button>
              {step === 'result' && <button onClick={() => setStep('input')} className="text-white"><ArrowLeft/></button>}
          </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 lg:p-8">
        
        {/* === INPUT STEP === */}
        {step === 'input' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* 1. MODE SELECTION */}
                <div className="lg:col-span-3 space-y-2">
                    <SectionHeader icon={Layout} title="MODULE" />
                    {[
                        {id: 'Type A', label: 'Video Analysis', icon: Video},
                        {id: 'Type B', label: 'Literature PDF', icon: FileText},
                        {id: 'Type C', label: 'Trend Search', icon: Search}
                    ].map(m => (
                        <button 
                            key={m.id} 
                            onClick={() => {setInputType(m.id as InputType); setAnalysis(null); setSearchResults([])}}
                            className={`w-full flex items-center gap-4 p-4 border transition-all duration-300 ${inputType === m.id ? 'border-neon-lime bg-neon-lime/5 text-white' : 'border-white/10 hover:border-white/30 text-gray-500'}`}
                        >
                            <m.icon size={20} />
                            <span className="font-mono font-bold text-sm uppercase">{m.label}</span>
                            {inputType === m.id && <div className="ml-auto w-2 h-2 bg-neon-lime rounded-full shadow-[0_0_10px_#ccff00]"></div>}
                        </button>
                    ))}
                </div>

                {/* 2. INPUT AREA */}
                <div className="lg:col-span-5 space-y-6">
                    <SectionHeader icon={Zap} title="DATA INGESTION" />
                    
                    <div className="artifact-card p-6 min-h-[300px] flex flex-col gap-4">
                        {/* Type A: Video */}
                        {inputType === 'Type A' && (
                            <>
                                <input className="w-full bg-black border border-white/20 p-4 text-white font-mono text-sm focus:border-neon-lime outline-none" placeholder="> Paste Video URL (YouTube/Bilibili)" value={videoUrlInput} onChange={e => setVideoUrlInput(e.target.value)} />
                                <div className="relative border border-dashed border-white/20 p-8 text-center hover:border-white/50 transition-colors">
                                    <input type="file" accept="video/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFile(e, 'video')} />
                                    <Upload className="mx-auto mb-2 text-gray-500"/>
                                    <p className="text-xs font-mono text-gray-500">{videoFile ? videoFile.name : "OR UPLOAD LOCAL VIDEO FILE"}</p>
                                </div>
                            </>
                        )}

                        {/* Type B: PDF */}
                        {inputType === 'Type B' && (
                             <div className="h-full flex flex-col justify-center relative border border-dashed border-white/20 p-8 text-center hover:border-neon-lime transition-colors group">
                                 <input type="file" accept="application/pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFile(e, 'pdf')} />
                                 <FileText size={48} className="mx-auto mb-4 text-gray-600 group-hover:text-neon-lime transition-colors"/>
                                 <p className="font-serif text-xl text-white mb-2">{pdfFile ? "PDF LOADED" : "DROP PDF"}</p>
                                 <p className="font-mono text-xs text-gray-500">{pdfFile ? pdfFile.name : "Academic Papers / Reports"}</p>
                             </div>
                        )}

                        {/* Type C: Search */}
                        {inputType === 'Type C' && (
                            <div className="flex flex-col h-full">
                                <div className="flex gap-2 mb-4">
                                    {['google', 'x'].map(s => (
                                        <button key={s} onClick={() => setSearchSources(prev => prev.includes(s as any) ? prev.filter(x=>x!==s) : [...prev, s as any])} className={`px-3 py-1 text-xs font-mono border ${searchSources.includes(s as any) ? 'bg-white text-black border-white' : 'border-white/20 text-gray-500'}`}>{s.toUpperCase()}</button>
                                    ))}
                                </div>
                                <div className="flex gap-2 mb-4">
                                    <input className="flex-1 bg-black border border-white/20 p-3 text-white font-mono text-sm focus:border-neon-lime outline-none" placeholder="> Enter keywords..." value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} />
                                    <button onClick={doSearch} disabled={isSearching} className="bg-white text-black px-6 font-bold hover:bg-neon-lime transition-colors disabled:opacity-50">
                                        {isSearching ? <Loader2 className="animate-spin"/> : <Search/>}
                                    </button>
                                </div>
                                {/* Search Results List - Dense & Artifact Style */}
                                <div className="flex-1 overflow-y-auto border-t border-white/10 pt-2 space-y-2 pr-2">
                                    {searchResults.map(res => (
                                        <div key={res.id} className="group p-3 border border-white/5 hover:border-neon-lime/50 bg-white/5 transition-all cursor-default">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[10px] font-mono text-neon-lime">{res.source.toUpperCase()}</span>
                                                <span className="text-[10px] text-gray-500 flex items-center gap-1"><Clock size={10}/> {res.date || 'N/A'}</span>
                                            </div>
                                            <a href={res.url} target="_blank" className="font-bold text-sm text-white hover:underline line-clamp-1 mb-1 flex items-center gap-2">
                                                {res.title} <ExternalLink size={10} className="text-gray-600"/>
                                            </a>
                                            <p className="text-xs text-gray-400 line-clamp-2 font-mono">{res.snippet}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* ANALYZE ACTION */}
                    <button 
                        onClick={doAnalyze} 
                        disabled={isAnalyzing || (!videoUrlInput && !videoFile && !pdfFile && searchResults.length === 0)}
                        className="w-full py-4 bg-white/5 border border-white/20 hover:bg-white/10 hover:border-neon-lime text-white font-serif font-bold tracking-widest flex items-center justify-center gap-3 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        {isAnalyzing ? <Loader2 className="animate-spin"/> : <BrainCircuit/>}
                        START INTELLIGENT ANALYSIS
                    </button>
                </div>

                {/* RIGHT COL: Analysis Report & Generate */}
                <div className="lg:col-span-4 space-y-6">
                    <SectionHeader icon={BarChart2} title="ANALYSIS REPORT" />
                    
                    <div className="artifact-card p-6 min-h-[400px] flex flex-col relative">
                        {analysis ? (
                            <div className="animate-fade-in h-full flex flex-col">
                                <div className="mb-6">
                                    <p className="font-mono text-xs text-neon-lime mb-2">// SUMMARY</p>
                                    <p className="text-sm leading-relaxed text-gray-200">{analysis.summary}</p>
                                </div>
                                <div className="flex-1">
                                    <p className="font-mono text-xs text-neon-lime mb-2">// CORE POINTS</p>
                                    <ul className="space-y-3">
                                        {analysis.corePoints.map((p, i) => (
                                            <li key={i} className="flex gap-3 text-xs border-l border-white/20 pl-3">
                                                <span className="text-gray-500 font-mono">0{i+1}</span>
                                                <span className="text-gray-300">{p}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                
                                {/* Generate Action */}
                                <div className="mt-6 pt-6 border-t border-white/10">
                                    <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                        {(['emotional', 'professional', 'speed', 'humorous'] as RednoteTone[]).map(t => (
                                            <button key={t} onClick={() => setTone(t)} className={`px-3 py-1 text-[10px] font-mono border uppercase ${tone===t ? 'bg-neon-lime text-black border-neon-lime' : 'border-white/20 text-gray-500'}`}>{t}</button>
                                        ))}
                                    </div>
                                    <button onClick={doGenerate} disabled={isGenerating} className="w-full bg-neon-lime text-black font-black py-4 text-sm uppercase tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50 flex justify-center gap-2 items-center shadow-[0_0_20px_rgba(204,255,0,0.2)]">
                                        {isGenerating ? <Loader2 className="animate-spin"/> : <Sparkles/>}
                                        GENERATE VIRAL COPY
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-center opacity-30">
                                <div>
                                    <div className="w-16 h-16 border-2 border-dashed border-white rounded-full flex items-center justify-center mx-auto mb-4 animate-spin-slow">
                                        <RefreshCw/>
                                    </div>
                                    <p className="font-mono text-xs">WAITING FOR ANALYSIS...</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        )}

        {/* === RESULT STEP === */}
        {step === 'result' && result && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                
                {/* Visual Editor */}
                <div className="space-y-6">
                    <SectionHeader icon={ImageIcon} title="VISUAL ARTIFACT" />
                    <div className="flex justify-center bg-[#111] p-8 rounded-lg border border-white/5 relative">
                         <Suspense fallback={<div className="w-full aspect-[3/4] bg-white/5 animate-pulse"/>}>
                             <div className="scale-90 sm:scale-100 origin-top">
                                 <VisualCard 
                                    data={{...result.visualData, templateRecommendation: template}} 
                                    backgroundImage={coverImg} 
                                    coverTextOverride={editCoverMain}
                                    coverSubOverride={editCoverSub}
                                    coverFontSize={fontSize}
                                />
                             </div>
                         </Suspense>
                    </div>
                    
                    {/* Visual Controls */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="artifact-card p-4">
                            <label className="font-mono text-[10px] text-gray-500 block mb-2">COVER TEXT</label>
                            <input value={editCoverMain} onChange={e => setEditCoverMain(e.target.value)} className="w-full bg-black border border-white/10 p-2 text-sm text-white font-bold mb-2 outline-none focus:border-neon-lime" />
                            <input value={editCoverSub} onChange={e => setEditCoverSub(e.target.value)} className="w-full bg-black border border-white/10 p-2 text-xs text-gray-400 outline-none focus:border-neon-lime" placeholder="Subtitle" />
                        </div>
                        <div className="artifact-card p-4">
                             <label className="font-mono text-[10px] text-gray-500 block mb-2">STYLE & SIZE</label>
                             <input type="range" min="0.5" max="3" step="0.1" value={fontSize} onChange={e => setFontSize(parseFloat(e.target.value))} className="w-full accent-neon-lime mb-4 h-1 bg-gray-700 appearance-none rounded-full" />
                             <div className="flex gap-1 flex-wrap">
                                 {['apple_note', 'memo', 'literature', 'magazine', 'receipt'].map(t => (
                                     <button key={t} onClick={() => setTemplate(t as VisualTemplate)} className={`w-6 h-6 rounded-full border ${template===t ? 'bg-neon-lime border-neon-lime' : 'border-white/20 bg-transparent'}`}></button>
                                 ))}
                             </div>
                        </div>
                    </div>
                </div>

                {/* Content Editor */}
                <div className="space-y-6">
                    <SectionHeader icon={PenTool} title="COPYWRITING" />
                    
                    <div className="artifact-card p-6 h-[calc(100vh-200px)] flex flex-col">
                         {/* Title Options */}
                         <div className="flex gap-2 overflow-x-auto pb-4 mb-4 border-b border-white/10">
                             {result.content.titles_options.map((t, i) => (
                                 <button key={i} onClick={() => setEditTitle(t)} className={`whitespace-nowrap px-4 py-2 text-xs font-bold border transition-all ${editTitle === t ? 'bg-white text-black border-white' : 'border-white/20 text-gray-400 hover:text-white'}`}>
                                     {t}
                                 </button>
                             ))}
                         </div>

                         <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-2xl font-serif font-black bg-transparent outline-none text-white mb-6" />
                         
                         <textarea 
                            value={editBody} 
                            onChange={e => setEditBody(e.target.value)} 
                            className="flex-1 bg-transparent outline-none text-gray-300 text-sm leading-relaxed font-mono resize-none" 
                         />

                         <div className="flex justify-end pt-4 border-t border-white/10 gap-4">
                             <button className="text-xs font-bold text-neon-lime uppercase flex items-center gap-2 hover:text-white"><Wand2 size={14}/> Rewrite</button>
                             <button onClick={() => navigator.clipboard.writeText(`${editTitle}\n\n${editBody}`)} className="bg-white text-black px-6 py-2 font-bold text-xs hover:bg-gray-200">COPY ALL</button>
                         </div>
                    </div>
                </div>

            </div>
        )}

      </div>
    </div>
  );
};

export default App;