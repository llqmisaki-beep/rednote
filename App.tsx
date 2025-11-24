import React, { useState, useEffect, Suspense } from 'react';
import { generateRednote, searchTrends, regenerateTitles, rewriteContent, regenerateCoverTitle, analyzeMedia, askAI } from './services/gemini';
import { InputType, RednoteResponse, SearchResult, SearchSource, VideoFrame, VisualTemplate, RednoteTone, MediaAnalysis } from './types';
// Lazy load VisualCard
const VisualCard = React.lazy(() => import('./components/VisualCard').then(module => ({ default: module.VisualCard })));
import { Sparkles, Copy, Loader2, Video, Type, Search, Check, Upload, Image as ImageIcon, Globe, Youtube, Twitter, ArrowLeft, PenTool, FileText, RefreshCw, Wand2, Link as LinkIcon, Key, X, PlayCircle, Dice5, CheckCircle, AlertCircle, Layout, Type as TypeIcon, MessageSquare, BrainCircuit, Plus, Trash2, Zap, BarChart2, User, Settings, Menu, ExternalLink, Clock } from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<'input' | 'result'>('input');

  // API Key State
  const [userApiKey, setUserApiKey] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Input State
  const [inputType, setInputType] = useState<InputType>('Type A');
  const [inputText, setInputText] = useState('');
  const [videoUrlInput, setVideoUrlInput] = useState(''); 
  const [selectedTone, setSelectedTone] = useState<RednoteTone>('emotional');
  const [imitateText, setImitateText] = useState(''); 
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<MediaAnalysis | null>(null);

  // Media State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  
  // Type B (PDF) State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);

  // Search State
  const [searchSources, setSearchSources] = useState<SearchSource[]>(['google']);
  const [customSearchSource, setCustomSearchSource] = useState('');
  const [linkParseStatus, setLinkParseStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);

  // Generation & Edit State
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RednoteResponse | null>(null);
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
  const [isRegeneratingBody, setIsRegeneratingBody] = useState(false);
  const [isRegeneratingCover, setIsRegeneratingCover] = useState(false);
  const [rewritingIndex, setRewritingIndex] = useState<number | null>(null);
  
  // Rewrite Custom State
  const [showRewriteModal, setShowRewriteModal] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  
  // Ask AI State
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [showAskModal, setShowAskModal] = useState(false);

  // Independent Editing States
  const [editableTitle, setEditableTitle] = useState('');
  const [editableCoverText, setEditableCoverText] = useState('');
  const [editableCoverSub, setEditableCoverSub] = useState('');
  const [editablePoints, setEditablePoints] = useState<string[]>([]); 
  const [editableBody, setEditableBody] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<VisualTemplate>('apple_note');
  const [customCoverImage, setCustomCoverImage] = useState<string | null>(null);
  
  // Visual Controls
  const [coverFontSize, setCoverFontSize] = useState<number>(1);

  const [copied, setCopied] = useState(false);

  // --- Init ---
  useEffect(() => {
      const storedKey = localStorage.getItem('rednote_gemini_key');
      if (storedKey) setUserApiKey(storedKey);
  }, []);

  const saveApiKey = () => {
      if (tempKey.trim()) {
          setUserApiKey(tempKey.trim());
          localStorage.setItem('rednote_gemini_key', tempKey.trim());
          setIsKeyModalOpen(false);
      }
  };

  // --- Handlers ---
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setFrames([]); 
      setAnalysisResult(null);
      processVideo(file);
    }
  };
  
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setPdfFile(file);
          setAnalysisResult(null);
          const reader = new FileReader();
          reader.onload = () => {
              const base64String = (reader.result as string).split(',')[1];
              setPdfBase64(base64String);
          };
          reader.readAsDataURL(file);
      }
  };
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const url = URL.createObjectURL(file);
          setCustomCoverImage(url);
      }
  };

  const handleRandomImage = () => {
      const randomId = Math.floor(Math.random() * 1000);
      setCustomCoverImage(`https://picsum.photos/seed/${randomId}/800/1000`);
  };

  const processVideo = async (file: File) => {
    setIsProcessingVideo(true);
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = videoUrl; video.muted = true; video.crossOrigin = "anonymous";
    await new Promise((resolve) => { video.onloadedmetadata = resolve; });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const extractedFrames: VideoFrame[] = [];
    const duration = video.duration;
    const count = 12; const interval = duration / (count + 1);
    for (let i = 1; i <= count; i++) {
        const time = interval * i; video.currentTime = time;
        await new Promise((resolve) => { video.onseeked = resolve; });
        canvas.width = video.videoWidth / 2; canvas.height = video.videoHeight / 2;
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        extractedFrames.push({ id: `frame-${i}`, url: canvas.toDataURL('image/jpeg', 0.8), timestamp: time });
    }
    setFrames(extractedFrames); setIsProcessingVideo(false);
  };

  const toggleSource = (source: SearchSource) => {
      setSearchSources(prev => prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]);
  };

  // --- ANALYSIS & SEARCH ---

  const handleAnalyze = async () => {
      if (!userApiKey) { setIsKeyModalOpen(true); return; }
      setIsAnalyzing(true);
      try {
          let data: any = {};
          if (inputType === 'Type A') {
              if (videoUrlInput.trim()) {
                  data = { url: videoUrlInput.trim() };
              } else {
                  data = { 
                      description: inputText || "Video content",
                      frames: frames.map(f => f.url) 
                  }; 
              }
          } else if (inputType === 'Type B' && pdfBase64) {
              data = { base64: pdfBase64, mimeType: pdfFile?.type };
          } else if (inputType === 'Type C') {
              // For Type C, we analyze the Search Results
              if (selectedResultIds.size === 0 && !customSearchSource) {
                  throw new Error("请先选择搜索结果或输入链接");
              }
              const selectedItems = searchResults.filter(r => selectedResultIds.has(r.id));
              data = { searchResults: selectedItems };
          }
          
          const analysis = await analyzeMedia(inputType, data, userApiKey);
          setAnalysisResult(analysis);
      } catch (e: any) {
          alert(`分析失败: ${e.message}`);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleSearch = async () => {
      if (!inputText.trim() && !customSearchSource) return;
      if (!userApiKey) { setIsKeyModalOpen(true); return; } 
      
      setIsSearching(true); setSearchResults([]); setSelectedResultIds(new Set());
      if (customSearchSource) setLinkParseStatus('loading');
      
      try {
          const query = customSearchSource ? "" : inputText; 
          const results = await searchTrends(query, searchSources, customSearchSource, userApiKey);
          setSearchResults(results || []);
          
          if (results.length > 0 && results[0].imageUrl && results[0].imageUrl.startsWith('http')) {
              setCustomCoverImage(results[0].imageUrl);
          }

          if (customSearchSource) {
              if (results.length > 0) {
                  setLinkParseStatus('success');
                  setSelectedResultIds(new Set([results[0].id]));
              } else {
                  setLinkParseStatus('error');
              }
          }
      } catch (e: any) {
          console.error(e); 
          if (customSearchSource) setLinkParseStatus('error');
          alert(`搜索失败: ${e.message}`);
      } finally { setIsSearching(false); }
  };

  const toggleResultSelection = (id: string) => {
      const newSet = new Set(selectedResultIds);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      setSelectedResultIds(newSet);
  };

  // --- GENERATION ---

  const handleGenerate = async () => {
    if (!userApiKey) { setIsKeyModalOpen(true); return; }
    if (!analysisResult) { alert("请先点击“开始智能分析”获取内容摘要"); return; }

    setIsLoading(true); setResult(null);

    try {
      // We rely purely on the Analysis Result for content generation now, as requested.
      // contextData holds the raw data if needed, but prompt uses analysis.
      let contextData: any = { analysis: analysisResult };

      const finalInputText = inputText || videoUrlInput || "Generate based on analysis";
      
      const data = await generateRednote(inputType, finalInputText, contextData, selectedTone, imitateText, userApiKey);
      
      setResult(data);
      setEditableTitle(data.content.title);
      setEditableCoverText(data.visualData.elements.coverText.main);
      setEditableCoverSub(data.visualData.elements.coverText.sub);
      setEditablePoints(data.visualData.elements.knowledgePoints || []);
      setEditableBody(data.content.fullText);
      setSelectedTemplate(data.visualData.templateRecommendation as VisualTemplate);
      
      setStep('result'); window.scrollTo(0, 0);
      setIsSidebarOpen(false);
    } catch (error: any) {
      console.error(error); 
      alert(`生成失败: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  // --- RESULT PAGE ACTIONS ---
  const onRegenerateTitles = async () => { if(!userApiKey){setIsKeyModalOpen(true);return} setIsRegeneratingTitle(true); try{ const t=await regenerateTitles(inputText||"Idea",editableTitle,userApiKey); if(result)setResult({...result,content:{...result.content,titles_options:t}}); }catch(e){alert("Failed")} setIsRegeneratingTitle(false); };
  const onRegenerateBody = async () => { if(!userApiKey){setIsKeyModalOpen(true);return} setIsRegeneratingBody(true); try{ const b=await rewriteContent(editableBody,selectedTone==='imitate'?imitateText:"",rewriteInstruction,userApiKey); setEditableBody(b); }catch(e){alert("Failed")} setIsRegeneratingBody(false); setShowRewriteModal(false); };
  const onRegenerateParagraph = async (p:string, i:number) => { if(!userApiKey){setIsKeyModalOpen(true);return} setRewritingIndex(i); try{ const t=await rewriteContent(p,selectedTone==='imitate'?imitateText:"","",userApiKey); setEditableBody(prev=>prev.replace(p,t)); }catch(e){alert("Failed")} setRewritingIndex(null); };
  const onRegenerateCoverTitle = async () => { if(!userApiKey){setIsKeyModalOpen(true);return} setIsRegeneratingCover(true); try{ const t=await regenerateCoverTitle(editableTitle,editableCoverText,userApiKey); setEditableCoverText(t); }catch(e){alert("Failed")} setIsRegeneratingCover(false); };
  const onAskAI = async () => { if(!userApiKey||!askQuestion.trim())return; setIsAsking(true); try{ const a=await askAI(editableBody,askQuestion,userApiKey); setAskAnswer(a); }catch(e){setAskAnswer("Error");} setIsAsking(false); };

  const updatePoint = (idx: number, val: string) => { const newPoints = [...editablePoints]; newPoints[idx] = val; setEditablePoints(newPoints); };
  const addPoint = () => setEditablePoints([...editablePoints, "新亮点"]);
  const removePoint = (idx: number) => setEditablePoints(editablePoints.filter((_, i) => i !== idx));

  const getVisualBackground = () => { if(customCoverImage) return customCoverImage; if(inputType === 'Type A') return frames.find(f => f.id === selectedFrameId)?.url || null; return null; };
  const visualDataForPreview = result && result.visualData ? { ...result.visualData, templateRecommendation: selectedTemplate } : null;
  const bodyParagraphs = editableBody.split('\n').filter(p => p.trim().length > 0);

  const isActive = (type: InputType) => inputType === type;

  // --- UI COMPONENTS ---

  const NavButton = ({ type, label, icon: Icon }: {type: InputType, label: string, icon: any}) => (
      <button 
        onClick={() => {setStep('input'); setInputType(type); setIsSidebarOpen(false); setAnalysisResult(null); setSearchResults([]); }} 
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive(type) ? 'bg-neon-lime text-black shadow-[0_0_15px_rgba(204,255,0,0.3)] font-bold' : 'text-gray-500 hover:bg-white/5 hover:text-gray-200'}`}
      >
          <Icon size={18} /> 
          {label}
      </button>
  );

  return (
    <div className="min-h-screen font-sans text-gray-300 flex overflow-hidden bg-[#050505]">
      
      {/* --- SIDEBAR (Desktop) --- */}
      <aside className="w-64 h-screen flex-col border-r border-white/10 glass-panel z-30 hidden md:flex">
          <div className="p-8 flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-neon-lime rounded-sm flex items-center justify-center text-black font-black text-xl shadow-[0_0_10px_#ccff00]">R</div>
              <h1 className="text-lg font-serif font-black tracking-wider text-white">REDNOTE</h1>
          </div>
          
          <nav className="flex-1 px-4 space-y-2">
              <p className="px-4 text-[10px] font-mono font-bold text-gray-600 uppercase tracking-widest mb-2 mt-4">/ MODULES</p>
              <NavButton type="Type A" label="VIDEO.ANALYSIS" icon={Video} />
              <NavButton type="Type B" label="DOC.GENERATE" icon={FileText} />
              <NavButton type="Type C" label="TREND.SEARCH" icon={Search} />

              <p className="px-4 text-[10px] font-mono font-bold text-gray-600 uppercase tracking-widest mb-2 mt-8">/ CONFIG</p>
              <button onClick={() => setIsKeyModalOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-all">
                  <Key size={18}/> <span className="font-mono">API_KEY</span>
              </button>
          </nav>

          <div className="p-6 border-t border-white/5">
              <div className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 font-mono text-xs border border-white/20">USER</div>
                  <div>
                      <p className="text-xs font-bold text-gray-300">PRO_MEMBER</p>
                      <p className="text-[10px] text-gray-500 font-mono">v2.1.0</p>
                  </div>
              </div>
          </div>
      </aside>

      {/* --- MOBILE SIDEBAR OVERLAY --- */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsSidebarOpen(false)}></div>
            <aside className="absolute left-0 top-0 h-full w-72 bg-[#0A0A0A] border-r border-white/10 shadow-2xl flex flex-col z-50 animate-slide-in-left">
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-neon-lime rounded-sm flex items-center justify-center text-black font-black text-lg">R</div>
                        <h1 className="text-lg font-serif font-black tracking-wider text-white">REDNOTE</h1>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400"><X size={24}/></button>
                </div>
                <nav className="flex-1 px-4 py-6 space-y-2">
                    <NavButton type="Type A" label="VIDEO.ANALYSIS" icon={Video} />
                    <NavButton type="Type B" label="DOC.GENERATE" icon={FileText} />
                    <NavButton type="Type C" label="TREND.SEARCH" icon={Search} />
                    <div className="h-px bg-white/5 my-6"></div>
                    <button onClick={() => {setIsKeyModalOpen(true); setIsSidebarOpen(false)}} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-mono text-gray-400 hover:text-white border border-white/10">
                        <Key size={18}/> <span>CONFIGURE_KEY</span>
                    </button>
                </nav>
            </aside>
        </div>
      )}

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 h-screen overflow-y-auto relative scroll-smooth bg-[#050505] bg-opacity-95">
        
        {/* Top Bar */}
        <header className="sticky top-0 z-20 px-4 md:px-8 py-4 flex justify-between items-center border-b border-white/10 bg-[#050505]/80 backdrop-blur-xl">
            <div className="flex items-center gap-4">
                <button className="md:hidden text-white" onClick={() => setIsSidebarOpen(true)}>
                    <Menu size={24} />
                </button>
                <div>
                    <h2 className="text-lg font-mono font-bold tracking-wider text-white">{step === 'input' ? '// DASHBOARD' : '// STUDIO'}</h2>
                </div>
            </div>
            <div className="flex gap-3">
                {step === 'result' && (
                    <button onClick={() => setStep('input')} className="border border-white/20 px-3 py-1.5 rounded text-xs font-mono font-bold text-gray-300 flex items-center gap-2 hover:bg-white/10 hover:text-white transition-all">
                        <ArrowLeft size={14}/> BACK
                    </button>
                )}
                <div className="w-8 h-8 rounded border border-white/20 flex items-center justify-center text-gray-400 hover:text-white hover:border-neon-lime cursor-pointer transition-all"><Settings size={14}/></div>
            </div>
        </header>

        {/* CONTENT AREA */}
        <div className="px-4 md:px-8 py-6 md:py-8 pb-24 max-w-7xl mx-auto">
            
            {/* === INPUT STEP === */}
            {step === 'input' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in-up">
                    
                    {/* LEFT COL: Main Input */}
                    <div className="xl:col-span-2 space-y-6">
                        
                        {/* Welcome Banner */}
                        <div className="artifact-card p-6 md:p-8 relative overflow-hidden group border border-white/10 rounded-sm">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-neon-lime blur-[150px] opacity-5 rounded-full group-hover:opacity-10 transition-opacity duration-700"></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-3xl md:text-4xl font-serif font-black text-white mb-2 tracking-tight">CREATE <br/>ARTIFACTS.</h3>
                                        <p className="text-gray-500 font-mono text-xs md:text-sm mt-2 max-w-md border-l-2 border-neon-lime pl-3">
                                            Powered by Gemini 3 Pro Preview. <br/>
                                            Deep Analysis -> Strategic Copywriting.
                                        </p>
                                    </div>
                                    <Zap size={48} strokeWidth={1} className="text-neon-lime opacity-50 hidden sm:block"/>
                                </div>
                            </div>
                        </div>

                        {/* Input Widget */}
                        <div className="artifact-card p-6 md:p-8 rounded-sm border border-white/10">
                             <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
                                 <h3 className="text-sm font-mono font-bold text-gray-300 flex items-center gap-2">
                                     <span className="text-neon-lime">01.</span> INPUT SOURCE
                                 </h3>
                                 <span className="text-[10px] font-mono font-bold bg-white/5 px-2 py-1 rounded text-gray-500">
                                     {inputType.toUpperCase()}
                                 </span>
                             </div>

                             {/* INPUT FORMS */}
                             {inputType === 'Type A' && (
                                 <div className="space-y-6">
                                     <div className="flex gap-4 flex-col sm:flex-row">
                                         <div className="flex-1 relative">
                                             <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                             <input 
                                                 className="w-full pl-11 pr-4 py-4 bg-black/50 border border-white/20 rounded-none text-sm font-mono text-white focus:border-neon-lime outline-none transition-all placeholder-gray-700"
                                                 placeholder="Paste Video URL..."
                                                 value={videoUrlInput}
                                                 onChange={(e) => setVideoUrlInput(e.target.value)}
                                             />
                                         </div>
                                         <div className="relative group h-12 sm:h-auto">
                                             <input type="file" accept="video/*" onChange={handleVideoUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                                             <button className="w-full h-full px-6 bg-white/5 border border-white/20 hover:border-white/50 text-gray-300 rounded-none font-mono text-xs flex items-center justify-center gap-2 whitespace-nowrap transition-all">
                                                 <Upload size={16}/> UPLOAD_FILE
                                             </button>
                                         </div>
                                     </div>
                                 </div>
                             )}

                             {inputType === 'Type B' && (
                                 <div className="border border-dashed border-white/20 p-12 text-center hover:border-neon-lime/50 hover:bg-neon-lime/5 transition-all cursor-pointer relative group">
                                     <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                                     <FileText size={32} className="mx-auto mb-4 text-gray-600 group-hover:text-neon-lime transition-colors"/>
                                     <h4 className="font-mono font-bold text-gray-300 mb-1">{pdfFile ? pdfFile.name : "DROP PDF HERE"}</h4>
                                 </div>
                             )}

                             {inputType === 'Type C' && (
                                 <div className="space-y-4">
                                     <div className="flex gap-2 mb-2">
                                         {(['google', 'x'] as SearchSource[]).map(s => (
                                             <button key={s} onClick={() => toggleSource(s)} className={`px-4 py-1 text-[10px] font-mono font-bold border transition-all ${searchSources.includes(s) ? 'bg-white text-black border-white' : 'bg-transparent text-gray-600 border-white/10'}`}>
                                                 {s.toUpperCase()}
                                             </button>
                                         ))}
                                     </div>
                                     <div className="relative">
                                         <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                         <input 
                                             className="w-full pl-11 pr-32 py-4 bg-black/50 border border-white/20 rounded-none text-sm font-mono text-white focus:border-neon-lime outline-none placeholder-gray-700"
                                             placeholder="Search keywords or paste link..."
                                             value={inputText || customSearchSource}
                                             onChange={(e) => {
                                                 if (e.target.value.startsWith('http')) setCustomSearchSource(e.target.value);
                                                 else setInputText(e.target.value);
                                             }}
                                             onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                         />
                                         <button onClick={handleSearch} disabled={isSearching} className="absolute right-2 top-2 bottom-2 px-4 bg-white/10 hover:bg-white/20 text-white text-[10px] font-mono font-bold border border-white/10 transition-colors disabled:opacity-50">
                                             {isSearching ? <Loader2 className="animate-spin" size={14}/> : 'SEARCH'}
                                         </button>
                                     </div>
                                     
                                     {/* Search Results */}
                                     {searchResults.length > 0 && (
                                         <div className="mt-4 border-t border-white/10 pt-4 space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                                             {searchResults.map(res => (
                                                 <div key={res.id} onClick={() => toggleResultSelection(res.id)} className={`p-3 border transition-all cursor-pointer group ${selectedResultIds.has(res.id) ? 'border-neon-lime bg-neon-lime/5' : 'border-white/5 bg-black hover:border-white/20'}`}>
                                                     <div className="flex justify-between items-start mb-2">
                                                         <span className="text-[10px] font-mono text-neon-lime border border-neon-lime/30 px-1">{res.source.toUpperCase()}</span>
                                                         <span className="text-[10px] text-gray-600 font-mono">{res.date}</span>
                                                     </div>
                                                     <div className="flex items-start gap-3">
                                                         <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center mt-1 ${selectedResultIds.has(res.id) ? 'bg-neon-lime border-neon-lime text-black' : 'border-gray-600'}`}>
                                                             {selectedResultIds.has(res.id) && <Check size={10} strokeWidth={4}/>}
                                                         </div>
                                                         <div className="flex-1 min-w-0">
                                                             <a href={res.url} target="_blank" onClick={(e) => e.stopPropagation()} className="text-sm font-bold text-white hover:underline line-clamp-1 block mb-1">{res.title}</a>
                                                             <p className="text-xs text-gray-500 font-mono line-clamp-2">{res.snippet}</p>
                                                         </div>
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     )}
                                 </div>
                             )}
                        </div>
                    </div>

                    {/* RIGHT COL: Analysis & Settings */}
                    <div className="space-y-6">
                        
                        {/* Analysis Widget */}
                        <div className="artifact-card p-6 relative overflow-hidden min-h-[200px] border border-white/10">
                            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                                <h3 className="text-sm font-mono font-bold text-gray-300 flex items-center gap-2">
                                    <span className="text-neon-lime">02.</span> INTELLIGENCE
                                </h3>
                                { (videoFile || pdfFile || videoUrlInput || searchResults.length > 0) && (
                                    <button onClick={handleAnalyze} disabled={isAnalyzing} className="text-neon-lime hover:text-white transition-colors disabled:opacity-50">
                                        {isAnalyzing ? <Loader2 className="animate-spin" size={18}/> : <PlayCircle size={20}/>}
                                    </button>
                                )}
                            </div>
                            
                            {analysisResult ? (
                                <div className="space-y-4 text-sm animate-fade-in">
                                    <div className="bg-black border border-white/10 p-4">
                                        <p className="text-[10px] text-neon-lime font-mono mb-2">// SUMMARY</p>
                                        <p className="text-gray-300 font-light leading-relaxed text-xs">{analysisResult.summary}</p>
                                    </div>
                                    <div className="bg-black border border-white/10 p-4">
                                        <p className="text-[10px] text-neon-lime font-mono mb-2">// KEY POINTS</p>
                                        <ul className="space-y-2">
                                            {analysisResult.corePoints.map((p, i) => (
                                                <li key={i} className="flex gap-3 text-xs text-gray-400 font-mono">
                                                    <span className="text-gray-600">0{i+1}</span>
                                                    <span>{p}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    
                                    {/* GENERATE BUTTON - Now inside Analysis to enforce workflow */}
                                    <div className="pt-4 border-t border-white/10">
                                        <button onClick={handleGenerate} disabled={isGenerating} className="w-full bg-neon-lime text-black font-black py-4 text-sm uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-50 flex justify-center gap-2 items-center shadow-[0_0_15px_rgba(204,255,0,0.3)]">
                                            {isGenerating ? <Loader2 className="animate-spin"/> : <Sparkles/>}
                                            INITIALIZE GENERATION
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-40 flex flex-col items-center justify-center text-gray-700 text-center border border-dashed border-white/5">
                                    <BarChart2 size={24} className="mb-2 opacity-30"/>
                                    <p className="text-[10px] font-mono uppercase">AWAITING DATA...</p>
                                </div>
                            )}
                        </div>

                        {/* Tone Selector */}
                        <div className="artifact-card p-6 border border-white/10">
                            <h3 className="text-sm font-mono font-bold text-gray-300 mb-4">STYLE.CONFIG</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {(['emotional', 'professional', 'speed', 'humorous'] as RednoteTone[]).map(t => (
                                    <button key={t} onClick={() => setSelectedTone(t)} className={`px-2 py-3 text-[10px] font-mono font-bold uppercase border transition-all ${selectedTone === t ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'}`}>
                                        {t}
                                    </button>
                                ))}
                                <button onClick={() => setSelectedTone('imitate')} className={`col-span-2 px-2 py-3 text-[10px] font-mono font-bold uppercase border transition-all ${selectedTone === 'imitate' ? 'bg-purple-900/50 text-purple-300 border-purple-500' : 'bg-transparent text-purple-900/50 border-white/10'}`}>
                                    MIMICRY_MODE
                                </button>
                            </div>
                            {selectedTone === 'imitate' && (
                                <textarea 
                                    className="w-full mt-2 p-3 bg-black border border-white/10 text-xs font-mono text-gray-400 outline-none focus:border-purple-500 h-20"
                                    placeholder="Paste text to mimic..."
                                    value={imitateText}
                                    onChange={e => setImitateText(e.target.value)}
                                />
                            )}
                        </div>

                    </div>
                </div>
            )}

            {/* === RESULT STEP === */}
            {step === 'result' && result && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in-up">
                    {/* Same Result Logic, Updated Styling */}
                    {/* LEFT COL: Visuals */}
                    <div className="lg:col-span-5 space-y-6 order-2 lg:order-1">
                        <div className="artifact-card p-6 relative">
                            <div className="absolute top-4 right-4 z-10 bg-black border border-neon-lime px-2 py-1 text-[10px] font-mono font-bold text-neon-lime">LIVE PREVIEW</div>
                            <Suspense fallback={<div className="aspect-[3/4] bg-white/5 animate-pulse"/>}>
                                {visualDataForPreview && (
                                    <div className="transform scale-95 hover:scale-100 transition-transform duration-500">
                                        <VisualCard 
                                            data={visualDataForPreview} 
                                            backgroundImage={getVisualBackground()} 
                                            coverTextOverride={editableCoverText} 
                                            coverSubOverride={editableCoverSub}
                                            pointsOverride={editablePoints}
                                            coverFontSize={coverFontSize} 
                                        />
                                    </div>
                                )}
                            </Suspense>
                            
                            {/* Controls */}
                            <div className="mt-8 space-y-4 border-t border-white/10 pt-6">
                                 <div className="flex gap-2">
                                     <button onClick={() => document.getElementById('cover-upload')?.click()} className="flex-1 py-3 border border-white/20 text-gray-300 text-xs font-mono font-bold hover:bg-white/5 flex items-center justify-center gap-2">
                                         <ImageIcon size={14}/> UPLOAD IMG
                                         <input id="cover-upload" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                     </button>
                                     <button onClick={handleRandomImage} className="px-4 border border-white/20 text-purple-400 hover:text-white hover:border-purple-500"><Dice5 size={18}/></button>
                                 </div>
                                 
                                 <div className="bg-black p-4 border border-white/10 space-y-3">
                                     <div className="flex justify-between items-center">
                                         <label className="text-[10px] font-mono font-bold text-gray-500">COVER.TEXT</label>
                                         <button onClick={onRegenerateCoverTitle} className="text-[10px] text-neon-lime font-bold hover:text-white flex items-center gap-1">{isRegeneratingCover ? <Loader2 size={10} className="animate-spin"/> : <Wand2 size={10}/>} AUTO</button>
                                     </div>
                                     <input value={editableCoverText} onChange={e => setEditableCoverText(e.target.value)} className="w-full bg-transparent border-b border-white/20 py-1 text-sm font-bold text-white outline-none focus:border-neon-lime transition-colors placeholder-gray-700" />
                                     <input value={editableCoverSub} onChange={e => setEditableCoverSub(e.target.value)} className="w-full bg-transparent border-b border-white/20 py-1 text-xs text-gray-500 outline-none focus:border-neon-lime transition-colors placeholder-gray-800" />
                                     
                                     {/* Points List Editor */}
                                     <div className="space-y-2 mt-2">
                                         <label className="text-[10px] font-mono font-bold text-gray-500">HIGHLIGHTS</label>
                                         {editablePoints.map((p, idx) => (
                                            <div key={idx} className="flex gap-2 group">
                                                <input value={p} onChange={(e) => updatePoint(idx, e.target.value)} className="flex-1 bg-transparent border-b border-white/10 text-[10px] text-gray-400 focus:text-white focus:border-white/30 outline-none py-1" />
                                                <button onClick={() => removePoint(idx)} className="text-gray-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                                            </div>
                                         ))}
                                         <button onClick={addPoint} className="w-full py-2 border border-dashed border-white/10 text-[10px] text-gray-500 hover:text-white hover:border-white/30 flex items-center justify-center gap-1"><Plus size={10}/> ADD ROW</button>
                                     </div>

                                     <div className="flex justify-between mt-4 items-center pt-2 border-t border-white/10">
                                         <label className="text-[10px] font-mono font-bold text-gray-500">SIZE</label>
                                         <input type="range" min="0.5" max="3" step="0.1" value={coverFontSize} onChange={e => setCoverFontSize(parseFloat(e.target.value))} className="w-24 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-neon-lime" />
                                     </div>
                                 </div>
                                 
                                 <div className="grid grid-cols-4 gap-2">
                                    {['apple_note', 'memo', 'literature', 'magazine', 'notification', 'receipt', 'polaroid', 'chat'].map(t => (
                                        <button key={t} onClick={() => setSelectedTemplate(t as VisualTemplate)} className={`py-2 text-[8px] font-mono font-bold uppercase border transition-all ${selectedTemplate === t ? 'bg-white text-black border-white' : 'bg-transparent text-gray-600 border-white/10 hover:text-white'}`}>
                                            {t.split('_')[0]}
                                        </button>
                                    ))}
                                 </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-7 space-y-6 order-1 lg:order-2">
                        {/* Titles */}
                        <div className="artifact-card p-6 border border-white/10">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-mono font-bold text-gray-300">TITLE_VARIANTS</h3>
                                <button onClick={onRegenerateTitles} disabled={isRegeneratingTitle} className="text-[10px] border border-white/20 text-gray-400 px-3 py-1.5 hover:bg-white/5 hover:text-white flex items-center gap-1 transition-colors">
                                    {isRegeneratingTitle ? <Loader2 size={10} className="animate-spin"/> : <RefreshCw size={10}/>} REFRESH
                                </button>
                            </div>
                            <div className="space-y-2">
                                {result.content.titles_options?.map((t, i) => (
                                    <div key={i} onClick={() => setEditableTitle(t)} className={`p-4 border cursor-pointer transition-all flex items-center gap-3 group ${editableTitle === t ? 'border-neon-lime bg-neon-lime/5' : 'border-white/10 bg-black hover:border-white/30'}`}>
                                        <div className={`w-3 h-3 flex items-center justify-center ${editableTitle === t ? 'bg-neon-lime' : 'bg-gray-800'}`}></div>
                                        <span className={`text-sm font-serif font-bold ${editableTitle === t ? 'text-neon-lime' : 'text-gray-400 group-hover:text-white'}`}>{t}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Editor */}
                        <div className="artifact-card p-6 flex-1 flex flex-col min-h-[600px] border border-white/10">
                            <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                                <div className="flex gap-2">
                                    <button onClick={() => setShowAskModal(true)} className="px-3 py-1.5 border border-blue-900/50 text-[10px] font-bold text-blue-400 flex items-center gap-1 hover:bg-blue-900/20"><MessageSquare size={12}/> QUERY AI</button>
                                    <button onClick={() => setShowRewriteModal(true)} className="px-3 py-1.5 border border-purple-900/50 text-[10px] font-bold text-purple-400 flex items-center gap-1 hover:bg-purple-900/20"><Wand2 size={12}/> REWRITE</button>
                                </div>
                                <button onClick={() => {navigator.clipboard.writeText(`${editableTitle}\n\n${editableBody}`); setCopied(true); setTimeout(()=>setCopied(false),2000)}} className="text-[10px] font-mono font-bold text-gray-500 hover:text-white flex items-center gap-1 transition-colors">
                                    {copied ? <Check size={12} className="text-neon-lime"/> : <Copy size={12}/>} COPY_ALL
                                </button>
                            </div>
                            
                            <input value={editableTitle} onChange={e => setEditableTitle(e.target.value)} className="text-2xl md:text-3xl font-serif font-black text-white bg-transparent outline-none mb-6 placeholder-gray-700" />
                            
                            <div className="flex-1 relative">
                                <div className="w-full h-full outline-none text-gray-300 leading-8 text-sm md:text-base font-light font-mono" contentEditable suppressContentEditableWarning onBlur={e => setEditableBody(e.currentTarget.innerText)}>
                                    {bodyParagraphs.map((p, i) => (
                                        <div key={i} className="group relative mb-6 hover:bg-white/5 p-2 -mx-2 transition-colors border-l-2 border-transparent hover:border-white/20">
                                            {rewritingIndex === i ? <div className="flex gap-2 text-purple-400 text-sm items-center py-2"><Loader2 className="animate-spin" size={14}/> PROCESSING...</div> : <p>{p}</p>}
                                            <button onClick={() => onRegenerateParagraph(p, i)} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-neon-lime transition-opacity"><RefreshCw size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
      </main>

      {/* MODALS (Keeping basic structure, styling to match artifact theme) */}
      {/* ... Key Modal, Rewrite Modal, Ask AI Modal (Updated styles inline above logic applied) ... */}
      {isKeyModalOpen && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
              <div className="artifact-card p-8 w-full max-w-md border-l-4 border-neon-lime shadow-[0_0_50px_rgba(0,0,0,1)]">
                  <h3 className="font-serif text-2xl text-white mb-6">SYSTEM ACCESS</h3>
                  <p className="text-xs font-mono text-gray-500 mb-2">ENTER GEMINI_API_KEY</p>
                  <input type="password" className="w-full bg-black border border-white/20 p-4 text-white font-mono text-sm focus:border-neon-lime outline-none mb-6" value={tempKey} onChange={e => setTempKey(e.target.value)} />
                  <div className="flex gap-4">
                      <button onClick={() => setIsKeyModalOpen(false)} className="flex-1 py-3 border border-white/20 text-gray-400 font-mono text-xs hover:text-white">ABORT</button>
                      <button onClick={saveApiKey} className="flex-1 py-3 bg-neon-lime text-black font-bold font-mono text-xs hover:bg-white transition-colors">AUTHENTICATE</button>
                  </div>
              </div>
          </div>
      )}

      {showRewriteModal && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
              <div className="artifact-card p-8 w-full max-w-md border border-purple-500/30">
                  <h3 className="font-serif text-xl text-white mb-4">REWRITE PROTOCOL</h3>
                  <textarea className="w-full p-4 bg-black border border-white/20 h-32 mb-6 resize-none focus:border-purple-500 text-sm font-mono text-gray-300" placeholder="> Enter instructions (e.g., Make it punchier)..." value={rewriteInstruction} onChange={e => setRewriteInstruction(e.target.value)} />
                  <div className="flex justify-end gap-3">
                      <button onClick={() => setShowRewriteModal(false)} className="px-6 py-3 text-gray-500 font-mono text-xs hover:text-white">CANCEL</button>
                      <button onClick={onRegenerateBody} className="px-6 py-3 bg-purple-600 text-white font-bold font-mono text-xs hover:bg-purple-500">EXECUTE</button>
                  </div>
              </div>
          </div>
      )}

      {showAskModal && (
           <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
              <div className="artifact-card p-6 w-full max-w-lg border border-blue-500/30">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-white flex items-center gap-2"><BrainCircuit className="text-blue-500"/> QUERY_CORE</h3>
                      <button onClick={() => setShowAskModal(false)} className="text-gray-500 hover:text-white"><X size={18}/></button>
                  </div>
                  <div className="bg-black border border-white/10 p-4 text-xs text-gray-500 max-h-32 overflow-y-auto mb-4 font-mono">
                      {editableBody}
                  </div>
                  {askAnswer && <div className="bg-blue-900/20 border border-blue-500/30 p-4 text-sm text-blue-200 mb-4 font-mono leading-relaxed">{askAnswer}</div>}
                  <div className="flex gap-2">
                      <input className="flex-1 p-3 bg-black border border-white/20 text-sm font-mono text-white focus:border-blue-500 outline-none" placeholder="> Input query..." value={askQuestion} onChange={e => setAskQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAskAI()} />
                      <button onClick={onAskAI} disabled={isAsking} className="px-4 bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50">{isAsking ? <Loader2 className="animate-spin" size={18}/> : <ArrowLeft className="rotate-180" size={18}/>}</button>
                  </div>
              </div>
           </div>
      )}

    </div>
  );
};

export default App;