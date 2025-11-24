import React, { useState, useEffect, Suspense } from 'react';
import { generateRednote, searchTrends, regenerateTitles, rewriteContent, regenerateCoverTitle, analyzeMedia, askAI } from './services/gemini';
import { InputType, RednoteResponse, SearchResult, SearchSource, VideoFrame, VisualTemplate, RednoteTone, MediaAnalysis } from './types';
// Lazy load VisualCard
const VisualCard = React.lazy(() => import('./components/VisualCard').then(module => ({ default: module.VisualCard })));
import { Sparkles, Copy, Loader2, Video, Type, Search, Check, Upload, Image as ImageIcon, Globe, Youtube, Twitter, ArrowLeft, PenTool, FileText, RefreshCw, Wand2, Link as LinkIcon, Key, X, PlayCircle, Dice5, CheckCircle, AlertCircle, Layout, Type as TypeIcon, MessageSquare, BrainCircuit, Plus, Trash2, Zap, BarChart2, User, Settings, Menu } from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<'input' | 'result'>('input');

  // API Key State
  const [userApiKey, setUserApiKey] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile Sidebar State

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
  const [searchSources, setSearchSources] = useState<SearchSource[]>([]);
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
          }
          
          const analysis = await analyzeMedia(inputType as 'Type A'|'Type B', data, userApiKey);
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

  const handleGenerate = async () => {
    if (!userApiKey) { setIsKeyModalOpen(true); return; }

    const hasInput = !!inputText.trim() || !!videoUrlInput.trim();
    const hasCustomLink = !!customSearchSource.trim();
    const hasContextTypeC = inputType === 'Type C' && selectedResultIds.size > 0;
    
    if (inputType === 'Type C' && !hasContextTypeC && !hasCustomLink) { alert("请先搜索并选择素材，或输入自定义链接"); return; }
    if (selectedTone === 'imitate' && !imitateText) { alert("请在下方文本框粘贴要模仿的爆款文案"); return; }

    setIsLoading(true); setResult(null);

    try {
      let contextData: any = {};
      if (analysisResult) {
          contextData.analysis = analysisResult;
      }

      if (inputType === 'Type C') {
          if (selectedResultIds.size > 0) {
              contextData.searchResults = searchResults.filter(r => selectedResultIds.has(r.id));
              if (!customCoverImage) {
                  const img = contextData.searchResults.find((r: any) => r.imageUrl);
                  if (img) setCustomCoverImage(img.imageUrl);
              }
          } else if (hasCustomLink) {
              contextData.searchResults = [{ url: customSearchSource, title: "Custom Link content" }];
          }
      } else if (inputType === 'Type A') {
          contextData.frameCount = frames.length;
          contextData.hasVideo = !!videoFile;
      } else if (inputType === 'Type B' && pdfBase64) {
          contextData.fileData = pdfBase64;
          contextData.mimeType = pdfFile?.type;
      }

      const finalInputText = inputText || videoUrlInput || "Based on the provided analysis/content";
      
      const data = await generateRednote(inputType, finalInputText, contextData, selectedTone, imitateText, userApiKey);
      
      setResult(data);
      setEditableTitle(data.content.title);
      setEditableCoverText(data.visualData.elements.coverText.main);
      setEditableCoverSub(data.visualData.elements.coverText.sub);
      setEditablePoints(data.visualData.elements.knowledgePoints || []);
      setEditableBody(data.content.fullText);
      setSelectedTemplate(data.visualData.templateRecommendation as VisualTemplate);
      
      setStep('result'); window.scrollTo(0, 0);
  
      // Close sidebar on mobile after generation
      setIsSidebarOpen(false);
    } catch (error: any) {
      console.error(error); 
      alert(`生成失败: ${error.message}`);
    } finally { setIsLoading(false); }
  };

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
        onClick={() => {setStep('input'); setInputType(type); setIsSidebarOpen(false);}} 
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive(type) ? 'bg-white/10 text-white shadow-lg border border-white/10 backdrop-blur-md' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
      >
          <Icon size={18} className={isActive(type) ? 'text-[#D9F99D]' : ''} /> 
          {label}
      </button>
  );

  return (
    <div className="min-h-screen font-sans text-gray-200 flex overflow-hidden bg-[#0F1115]">
      
      {/* --- SIDEBAR (Desktop) --- */}
      <aside className="w-64 h-screen flex-col border-r border-white/5 glass-panel z-30 hidden md:flex">
          <div className="p-8 flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-[#D9F99D] to-[#A7F3D0] rounded-lg flex items-center justify-center text-black font-bold text-xl shadow-lg shadow-green-900/20">R</div>
              <h1 className="text-lg font-medium tracking-wide text-white/90">Rednote AI</h1>
          </div>
          
          <nav className="flex-1 px-4 space-y-1">
              <p className="px-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 mt-2">创作中心</p>
              <NavButton type="Type A" label="视频分析" icon={Video} />
              <NavButton type="Type B" label="文献生成" icon={FileText} />
              <NavButton type="Type C" label="热点搜索" icon={Search} />

              <p className="px-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 mt-8">系统设置</p>
              <button onClick={() => setIsKeyModalOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-all">
                  <Key size={18}/> <span>API 密钥</span>
              </button>
          </nav>

          <div className="p-6 border-t border-white/5">
              <div className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400"><User size={16}/></div>
                  <div>
                      <p className="text-xs font-bold text-gray-300">访客用户</p>
                      <p className="text-[10px] text-gray-500">专业版计划</p>
                  </div>
              </div>
          </div>
      </aside>

      {/* --- MOBILE SIDEBAR OVERLAY --- */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>
            <aside className="absolute left-0 top-0 h-full w-64 bg-[#151921] border-r border-white/10 shadow-2xl flex flex-col z-50 animate-fade-in-up">
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-[#D9F99D] to-[#A7F3D0] rounded-lg flex items-center justify-center text-black font-bold text-xl">R</div>
                        <h1 className="text-lg font-medium tracking-wide text-white">Rednote AI</h1>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400"><X size={20}/></button>
                </div>
                <nav className="flex-1 px-4 py-6 space-y-2">
                    <NavButton type="Type A" label="视频分析" icon={Video} />
                    <NavButton type="Type B" label="文献生成" icon={FileText} />
                    <NavButton type="Type C" label="热点搜索" icon={Search} />
                    <div className="h-px bg-white/5 my-4"></div>
                    <button onClick={() => {setIsKeyModalOpen(true); setIsSidebarOpen(false)}} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:text-white">
                        <Key size={18}/> <span>API 密钥</span>
                    </button>
                </nav>
            </aside>
        </div>
      )}

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 h-screen overflow-y-auto relative scroll-smooth bg-gradient-to-br from-[#0F1115] to-[#13161c]">
        
        {/* Top Bar */}
        <header className="sticky top-0 z-20 px-4 md:px-8 py-4 md:py-6 flex justify-between items-center glass-panel border-b border-white/5 bg-[#0F1115]/80">
            <div className="flex items-center gap-3">
                <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setIsSidebarOpen(true)}>
                    <Menu size={24} />
                </button>
                <div>
                    <h2 className="text-lg md:text-xl font-light tracking-wide text-white">{step === 'input' ? '仪表盘' : '创作工作室'}</h2>
                    <p className="text-[10px] md:text-xs text-gray-500 font-mono mt-0.5 hidden sm:block">AI 爆款内容创作引擎 v2.0</p>
                </div>
            </div>
            <div className="flex gap-3">
                {step === 'result' && (
                    <button onClick={() => setStep('input')} className="glass-button px-3 py-1.5 rounded-lg text-xs font-bold text-gray-300 flex items-center gap-2 hover:text-white">
                        <ArrowLeft size={14}/> <span className="hidden sm:inline">返回</span>
                    </button>
                )}
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full glass-button flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"><Settings size={16}/></div>
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
                        <div className="glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-[#D9F99D] blur-[100px] opacity-10 rounded-full group-hover:opacity-20 transition-opacity duration-700"></div>
                            <div className="relative z-10 flex justify-between items-end">
                                <div className="w-full">
                                    <h3 className="text-xl md:text-2xl font-light text-white mb-2 tracking-tight">开始创作</h3>
                                    <p className="text-gray-400 text-xs md:text-sm max-w-md font-light">使用 Gemini 3 Pro Preview 进行深度分析和爆款内容生成。</p>
                                    <button onClick={handleGenerate} disabled={isLoading} className="mt-6 md:mt-8 bg-[#D9F99D] text-black w-full md:w-auto px-6 py-3 rounded-xl font-bold text-xs tracking-wide flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(217,249,157,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase">
                                        {isLoading ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16}/>}
                                        生成爆款笔记
                                    </button>
                                </div>
                                <div className="hidden sm:block text-[#D9F99D] opacity-20">
                                    <Zap size={64} strokeWidth={1} />
                                </div>
                            </div>
                        </div>

                        {/* Input Widget */}
                        <div className="glass-panel rounded-3xl p-6 md:p-8">
                             <div className="flex justify-between items-center mb-6 md:mb-8 border-b border-white/5 pb-4">
                                 <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                                     {inputType === 'Type A' ? <Video size={16} className="text-purple-400"/> : inputType === 'Type B' ? <FileText size={16} className="text-blue-400"/> : <Search size={16} className="text-green-400"/>}
                                     {inputType === 'Type A' ? '视频来源' : inputType === 'Type B' ? '文档来源' : '话题搜索'}
                                 </h3>
                                 <span className="text-[10px] font-bold bg-white/5 px-2 py-1 rounded border border-white/10 text-gray-500">步骤 1</span>
                             </div>

                             {/* INPUT FORMS */}
                             {inputType === 'Type A' && (
                                 <div className="space-y-6">
                                     <div className="flex gap-4 flex-col sm:flex-row">
                                         <div className="flex-1 relative">
                                             <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                             <input 
                                                 className="w-full pl-11 pr-4 py-4 glass-input rounded-xl text-sm font-light placeholder-gray-600"
                                                 placeholder="粘贴视频链接 (B站/YouTube)..."
                                                 value={videoUrlInput}
                                                 onChange={(e) => setVideoUrlInput(e.target.value)}
                                             />
                                         </div>
                                         <div className="relative group h-12 sm:h-auto">
                                             <input type="file" accept="video/*" onChange={handleVideoUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                                             <button className="w-full h-full px-6 glass-button rounded-xl font-bold text-xs text-gray-300 hover:text-white flex items-center justify-center gap-2 whitespace-nowrap">
                                                 <Upload size={16}/> 上传文件
                                             </button>
                                         </div>
                                     </div>
                                     {frames.length > 0 && (
                                         <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-2">
                                             {frames.map(frame => (
                                                 <div key={frame.id} onClick={() => setSelectedFrameId(selectedFrameId === frame.id ? null : frame.id)} className={`aspect-video rounded-lg overflow-hidden cursor-pointer relative transition-all border ${selectedFrameId === frame.id ? 'border-[#D9F99D] shadow-[0_0_10px_rgba(217,249,157,0.3)]' : 'border-transparent opacity-50 hover:opacity-100'}`}>
                                                     <img src={frame.url} className="w-full h-full object-cover" />
                                                 </div>
                                             ))}
                                         </div>
                                     )}
                                 </div>
                             )}

                             {inputType === 'Type B' && (
                                 <div className="border border-dashed border-white/20 rounded-2xl p-8 md:p-10 text-center hover:border-blue-400/50 hover:bg-blue-900/10 transition-all cursor-pointer relative group">
                                     <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                                     <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                         <FileText size={20}/>
                                     </div>
                                     <h4 className="font-medium text-gray-200 mb-1">{pdfFile ? pdfFile.name : "点击上传 PDF"}</h4>
                                     <p className="text-xs text-gray-500 font-mono">支持学术论文、研报等</p>
                                 </div>
                             )}

                             {inputType === 'Type C' && (
                                 <div className="space-y-4">
                                     <div className="flex gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
                                         {(['google', 'x'] as SearchSource[]).map(s => (
                                             <button key={s} onClick={() => toggleSource(s)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider transition-all flex items-center gap-2 ${searchSources.includes(s) ? 'bg-white text-black border-white' : 'glass-button text-gray-500 border-white/10'}`}>
                                                 {s === 'x' ? <Twitter size={12}/> : <Globe size={12}/>} {s.toUpperCase()}
                                             </button>
                                         ))}
                                     </div>
                                     <div className="relative">
                                         <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                         <input 
                                             className="w-full pl-11 pr-32 py-4 glass-input rounded-xl text-sm font-light placeholder-gray-600"
                                             placeholder="搜索话题或粘贴文章链接..."
                                             value={inputText || customSearchSource}
                                             onChange={(e) => {
                                                 if (e.target.value.startsWith('http')) setCustomSearchSource(e.target.value);
                                                 else setInputText(e.target.value);
                                             }}
                                             onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                         />
                                         <button onClick={handleSearch} disabled={isSearching} className="absolute right-2 top-2 bottom-2 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold border border-white/10 transition-colors disabled:opacity-50">
                                             {isSearching ? <Loader2 className="animate-spin" size={14}/> : '搜索'}
                                         </button>
                                     </div>
                                     
                                     {/* Search Results */}
                                     {searchResults.length > 0 && (
                                         <div className="space-y-2 mt-6">
                                             {searchResults.map(res => (
                                                 <div key={res.id} onClick={() => toggleResultSelection(res.id)} className={`p-4 rounded-xl border flex gap-4 cursor-pointer transition-all hover:bg-white/5 ${selectedResultIds.has(res.id) ? 'border-[#D9F99D]/50 bg-[#D9F99D]/5' : 'border-white/5 bg-black/20'}`}>
                                                     <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${selectedResultIds.has(res.id) ? 'border-[#D9F99D] bg-[#D9F99D] text-black' : 'border-gray-600'}`}>
                                                         {selectedResultIds.has(res.id) && <Check size={10} strokeWidth={4}/>}
                                                     </div>
                                                     <div>
                                                         <h4 className={`font-medium text-sm line-clamp-1 ${selectedResultIds.has(res.id) ? 'text-[#D9F99D]' : 'text-gray-300'}`}>{res.title}</h4>
                                                         <p className="text-xs text-gray-500 mt-1 line-clamp-2 font-light">{res.snippet}</p>
                                                         {res.imageUrl && <div className="mt-2 text-[9px] text-blue-400 flex items-center gap-1 opacity-80"><ImageIcon size={10}/> 包含图片</div>}
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
                        <div className="glass-panel rounded-3xl p-6 relative overflow-hidden min-h-[200px]">
                            <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">智能分析</h3>
                                { (videoFile || pdfFile || videoUrlInput) && (
                                    <button onClick={handleAnalyze} disabled={isAnalyzing} className="text-[#D9F99D] hover:text-white transition-colors disabled:opacity-50">
                                        {isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <PlayCircle size={18}/>}
                                    </button>
                                )}
                            </div>
                            
                            {analysisResult ? (
                                <div className="space-y-4 text-sm animate-fade-in">
                                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">摘要</p>
                                        <p className="text-gray-300 font-light leading-relaxed text-xs">{analysisResult.summary}</p>
                                    </div>
                                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">核心要点</p>
                                        <ul className="list-none space-y-2 text-gray-400 text-xs font-light">
                                            {analysisResult.corePoints.slice(0,3).map((p, i) => <li key={i} className="flex gap-2"><span className="text-[#D9F99D]">•</span>{p}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-32 flex flex-col items-center justify-center text-gray-600 text-center">
                                    <BarChart2 size={24} className="mb-2 opacity-30"/>
                                    <p className="text-[10px] uppercase tracking-widest">暂无数据</p>
                                </div>
                            )}
                        </div>

                        {/* Tone Selector */}
                        <div className="glass-panel rounded-3xl p-6">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">文案风格</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setSelectedTone('emotional')} className={`px-3 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${selectedTone === 'emotional' ? 'bg-white text-black border-white' : 'glass-button text-gray-500 border-white/5 hover:text-gray-300'}`}>😭 情感共鸣</button>
                                <button onClick={() => setSelectedTone('professional')} className={`px-3 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${selectedTone === 'professional' ? 'bg-white text-black border-white' : 'glass-button text-gray-500 border-white/5 hover:text-gray-300'}`}>🎓 干货科普</button>
                                <button onClick={() => setSelectedTone('speed')} className={`px-3 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${selectedTone === 'speed' ? 'bg-white text-black border-white' : 'glass-button text-gray-500 border-white/5 hover:text-gray-300'}`}>⚡ 速递新闻</button>
                                <button onClick={() => setSelectedTone('humorous')} className={`px-3 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${selectedTone === 'humorous' ? 'bg-white text-black border-white' : 'glass-button text-gray-500 border-white/5 hover:text-gray-300'}`}>🤣 幽默吐槽</button>
                                <button onClick={() => setSelectedTone('imitate')} className={`col-span-2 px-3 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${selectedTone === 'imitate' ? 'bg-purple-500 text-white border-purple-500' : 'glass-button text-purple-400 border-purple-500/30 hover:border-purple-500'}`}>
                                    🤖 模仿爆款
                                </button>
                            </div>
                            {selectedTone === 'imitate' && (
                                <textarea 
                                    className="w-full mt-3 p-3 glass-input rounded-lg text-xs resize-none font-mono text-gray-300"
                                    rows={3}
                                    placeholder="在此粘贴你想模仿的爆款文案..."
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
                    
                    {/* LEFT COL: Visuals */}
                    <div className="lg:col-span-5 space-y-6 order-2 lg:order-1">
                        <div className="glass-panel p-6 rounded-[2rem] relative">
                            <div className="absolute top-4 right-4 z-10 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[10px] font-bold text-white/80 uppercase">
                                预览
                            </div>
                            <Suspense fallback={<div className="aspect-[3/4] bg-white/5 animate-pulse rounded-xl"/>}>
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
                            <div className="mt-8 space-y-4 border-t border-white/5 pt-6">
                                 <div className="flex gap-2">
                                     <button onClick={() => document.getElementById('cover-upload')?.click()} className="flex-1 py-3 glass-button text-gray-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2 hover:text-white">
                                         <ImageIcon size={14}/> 更换封面
                                         <input id="cover-upload" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                     </button>
                                     <button onClick={handleRandomImage} className="px-4 glass-button text-purple-400 rounded-xl flex items-center hover:text-purple-300"><Dice5 size={18}/></button>
                                 </div>
                                 
                                 <div className="bg-black/20 p-4 rounded-xl space-y-3 border border-white/5">
                                     <div className="flex justify-between items-center">
                                         <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">封面文字</label>
                                         <button onClick={onRegenerateCoverTitle} className="text-[10px] text-purple-400 font-bold hover:text-purple-300 flex items-center gap-1">{isRegeneratingCover ? <Loader2 size={10} className="animate-spin"/> : <Wand2 size={10}/>} AI 优化</button>
                                     </div>
                                     <input value={editableCoverText} onChange={e => setEditableCoverText(e.target.value)} className="w-full bg-transparent border-b border-white/10 py-1 text-sm font-bold text-white outline-none focus:border-purple-500 transition-colors placeholder-gray-600" placeholder="主标题" />
                                     <input value={editableCoverSub} onChange={e => setEditableCoverSub(e.target.value)} className="w-full bg-transparent border-b border-white/10 py-1 text-xs text-gray-400 outline-none focus:border-purple-500 transition-colors placeholder-gray-700" placeholder="副标题 (可选，清空即删除)" />
                                     
                                     {/* Points List Editor */}
                                     <div className="space-y-2 mt-2">
                                         <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">核心亮点</label>
                                         {editablePoints.map((p, idx) => (
                                            <div key={idx} className="flex gap-2 group">
                                                <input value={p} onChange={(e) => updatePoint(idx, e.target.value)} className="flex-1 bg-transparent border-b border-white/5 text-[10px] text-gray-400 focus:text-white focus:border-white/20 outline-none py-1" />
                                                <button onClick={() => removePoint(idx)} className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                                            </div>
                                         ))}
                                         <button onClick={addPoint} className="w-full py-2 border border-dashed border-white/10 rounded-lg text-[10px] text-gray-500 hover:text-gray-300 hover:border-white/20 flex items-center justify-center gap-1 transition-all"><Plus size={10}/> 添加亮点</button>
                                     </div>

                                     <div className="flex justify-between mt-4 items-center pt-2 border-t border-white/5">
                                         <label className="text-[10px] font-bold text-gray-500 uppercase">字号</label>
                                         <input type="range" min="0.5" max="3" step="0.1" value={coverFontSize} onChange={e => setCoverFontSize(parseFloat(e.target.value))} className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white" />
                                     </div>
                                 </div>
                                 
                                 <div className="grid grid-cols-4 gap-2">
                                    {['apple_note', 'memo', 'literature', 'magazine', 'notification', 'receipt', 'polaroid', 'chat'].map(t => (
                                        <button key={t} onClick={() => setSelectedTemplate(t as VisualTemplate)} className={`py-2 text-[8px] font-bold uppercase rounded-lg border transition-all ${selectedTemplate === t ? 'bg-white text-black border-white' : 'glass-button text-gray-500 border-white/5 hover:text-gray-300'}`}>
                                            {t.split('_')[0]}
                                        </button>
                                    ))}
                                 </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-7 space-y-6 order-1 lg:order-2">
                        {/* Titles */}
                        <div className="glass-panel p-6 rounded-[2rem]">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">爆款标题库</h3>
                                <button onClick={onRegenerateTitles} disabled={isRegeneratingTitle} className="text-[10px] bg-white/10 text-white px-3 py-1.5 rounded-lg hover:bg-white/20 flex items-center gap-1 transition-colors border border-white/10">
                                    {isRegeneratingTitle ? <Loader2 size={10} className="animate-spin"/> : <RefreshCw size={10}/>} 换一批
                                </button>
                            </div>
                            <div className="space-y-2">
                                {result.content.titles_options?.map((t, i) => (
                                    <div key={i} onClick={() => setEditableTitle(t)} className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-3 group ${editableTitle === t ? 'border-[#D9F99D]/50 bg-[#D9F99D]/5' : 'border-white/5 bg-black/20 hover:bg-black/40'}`}>
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${editableTitle === t ? 'border-[#D9F99D] text-[#D9F99D]' : 'border-gray-600 group-hover:border-gray-400'}`}>
                                            {editableTitle === t && <div className="w-2 h-2 bg-[#D9F99D] rounded-full"/>}
                                        </div>
                                        <span className={`text-sm font-medium ${editableTitle === t ? 'text-[#D9F99D]' : 'text-gray-400 group-hover:text-gray-200'}`}>{t}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Editor */}
                        <div className="glass-panel p-6 rounded-[2rem] flex-1 flex flex-col min-h-[500px]">
                            <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                                <div className="flex gap-2">
                                    <button onClick={() => setShowAskModal(true)} className="glass-button px-3 py-1.5 rounded-lg text-[10px] font-bold text-blue-400 flex items-center gap-1 hover:bg-blue-500/10 hover:border-blue-500/30"><MessageSquare size={12}/> 问 AI</button>
                                    <button onClick={() => setShowRewriteModal(true)} className="glass-button px-3 py-1.5 rounded-lg text-[10px] font-bold text-purple-400 flex items-center gap-1 hover:bg-purple-500/10 hover:border-purple-500/30"><Wand2 size={12}/> 全文重写</button>
                                </div>
                                <button onClick={() => {navigator.clipboard.writeText(`${editableTitle}\n\n${editableBody}`); setCopied(true); setTimeout(()=>setCopied(false),2000)}} className="text-[10px] font-bold text-gray-500 hover:text-white flex items-center gap-1 transition-colors">
                                    {copied ? <Check size={12} className="text-green-400"/> : <Copy size={12}/>} 复制正文
                                </button>
                            </div>
                            
                            <input value={editableTitle} onChange={e => setEditableTitle(e.target.value)} className="text-xl md:text-2xl font-bold text-white bg-transparent outline-none mb-6 placeholder-gray-700" placeholder="点击编辑标题..." />
                            
                            <div className="flex-1 relative">
                                <div className="w-full h-full outline-none text-gray-300 leading-8 text-sm md:text-base font-light" contentEditable suppressContentEditableWarning onBlur={e => setEditableBody(e.currentTarget.innerText)}>
                                    {bodyParagraphs.map((p, i) => (
                                        <div key={i} className="group relative mb-6 hover:bg-white/5 rounded px-2 py-1 -mx-2 transition-colors border border-transparent hover:border-white/5">
                                            {rewritingIndex === i ? <div className="flex gap-2 text-purple-400 text-sm items-center py-2"><Loader2 className="animate-spin" size={14}/> AI 重写中...</div> : <p>{p}</p>}
                                            <button onClick={() => onRegenerateParagraph(p, i)} className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-purple-400 transition-opacity"><RefreshCw size={14}/></button>
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

      {/* MODALS */}
      {isKeyModalOpen && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm p-4">
              <div className="glass-panel bg-[#1A1A1A] rounded-2xl p-8 w-full max-w-md shadow-2xl border border-white/10">
                  <h3 className="text-lg font-bold text-white mb-6">设置</h3>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Gemini API 密钥</label>
                  <input type="password" className="w-full p-4 glass-input rounded-xl text-sm mb-6 font-mono" placeholder="AIzaSy..." value={tempKey} onChange={e => setTempKey(e.target.value)} />
                  <div className="flex gap-3">
                      <button onClick={() => setIsKeyModalOpen(false)} className="flex-1 py-3 glass-button rounded-xl text-sm font-bold text-gray-400 hover:text-white">取消</button>
                      <button onClick={saveApiKey} className="flex-1 py-3 bg-white text-black rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors">保存</button>
                  </div>
              </div>
          </div>
      )}
      
      {showRewriteModal && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="glass-panel bg-[#1A1A1A] rounded-2xl p-8 w-full max-w-md border border-white/10">
                  <h3 className="font-bold text-white mb-4">全文重写要求</h3>
                  <textarea className="w-full p-4 glass-input rounded-xl h-32 mb-6 resize-none focus:border-purple-500/50 text-sm" placeholder="例如：更幽默一点，增加 emoji，强调性价比..." value={rewriteInstruction} onChange={e => setRewriteInstruction(e.target.value)} />
                  <div className="flex justify-end gap-3">
                      <button onClick={() => setShowRewriteModal(false)} className="px-4 py-2 text-gray-500 hover:text-white font-bold text-xs">取消</button>
                      <button onClick={onRegenerateBody} className="px-6 py-2 bg-purple-600 text-white rounded-xl font-bold text-xs hover:bg-purple-500">开始重写</button>
                  </div>
              </div>
          </div>
      )}

      {showAskModal && (
           <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="glass-panel bg-[#1A1A1A] rounded-2xl p-6 w-full max-w-lg border border-white/10">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-white flex items-center gap-2"><BrainCircuit className="text-blue-400"/> 问 AI</h3>
                      <button onClick={() => setShowAskModal(false)} className="text-gray-500 hover:text-white"><X size={18}/></button>
                  </div>
                  <div className="bg-black/30 p-4 rounded-xl text-xs text-gray-400 max-h-32 overflow-y-auto mb-4 border border-white/5">
                      {editableBody}
                  </div>
                  {askAnswer && <div className="bg-blue-500/10 p-4 rounded-xl text-sm text-blue-200 mb-4 border border-blue-500/20 leading-relaxed">{askAnswer}</div>}
                  <div className="flex gap-2">
                      <input className="flex-1 p-3 glass-input rounded-xl text-sm focus:border-blue-500/50" placeholder="针对内容提问..." value={askQuestion} onChange={e => setAskQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAskAI()} />
                      <button onClick={onAskAI} disabled={isAsking} className="px-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 disabled:opacity-50">{isAsking ? <Loader2 className="animate-spin" size={18}/> : <ArrowLeft className="rotate-180" size={18}/>}</button>
                  </div>
              </div>
           </div>
      )}

    </div>
  );
};

export default App;