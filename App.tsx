import React, { useState, useEffect, Suspense } from 'react';
import { generateRednote, searchTrends, regenerateTitles, rewriteContent, regenerateCoverTitle } from './services/gemini';
import { InputType, RednoteResponse, SearchResult, SearchSource, VideoFrame, VisualTemplate, RednoteTone } from './types';
// Lazy load VisualCard
const VisualCard = React.lazy(() => import('./components/VisualCard').then(module => ({ default: module.VisualCard })));
import { Sparkles, Copy, Loader2, Video, Type, Search, Check, Upload, Image as ImageIcon, Globe, Youtube, Twitter, ArrowLeft, PenTool, FileText, RefreshCw, Wand2, Link as LinkIcon, Key, X, PlayCircle, Dice5, CheckCircle, AlertCircle, Layout, Type as TypeIcon } from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<'input' | 'result'>('input');

  // API Key State
  const [userApiKey, setUserApiKey] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [tempKey, setTempKey] = useState('');

  // Input State
  const [inputType, setInputType] = useState<InputType>('Type A');
  const [inputText, setInputText] = useState('');
  const [selectedTone, setSelectedTone] = useState<RednoteTone>('emotional');
  const [imitateText, setImitateText] = useState(''); 
  
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
  
  // Independent Editing States
  const [editableTitle, setEditableTitle] = useState('');
  const [editableCoverText, setEditableCoverText] = useState('');
  const [editableCoverSub, setEditableCoverSub] = useState('');
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
      processVideo(file);
    }
  };
  
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setPdfFile(file);
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
    const count = 6; const interval = duration / (count + 1);
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

  const handleSearch = async () => {
      if (!inputText.trim() && !customSearchSource) return;
      if (!userApiKey) { setIsKeyModalOpen(true); return; } 
      
      setIsSearching(true); setSearchResults([]); setSelectedResultIds(new Set());
      if (customSearchSource) setLinkParseStatus('loading');
      
      try {
          const query = customSearchSource ? "" : inputText; 
          const results = await searchTrends(query, searchSources, customSearchSource, userApiKey);
          setSearchResults(results || []);
          
          // FORCE IMAGE LOGIC:
          // Iterate through results to find the first valid image URL
          const bestImage = results.find(r => r.imageUrl && r.imageUrl.startsWith('http'));
          if (bestImage) {
              setCustomCoverImage(bestImage.imageUrl);
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

    const hasInput = !!inputText.trim();
    const hasCustomLink = !!customSearchSource.trim();
    const hasContextTypeC = inputType === 'Type C' && selectedResultIds.size > 0;
    
    if (inputType === 'Type C' && !hasContextTypeC && !hasCustomLink) { alert("请先搜索并选择素材，或输入自定义链接"); return; }
    if (selectedTone === 'imitate' && !imitateText) { alert("请在下方文本框粘贴要模仿的爆款文案"); return; }

    setIsLoading(true); setResult(null);

    try {
      let contextData: any = null;
      if (inputType === 'Type C') {
          if (selectedResultIds.size > 0) {
              contextData = searchResults.filter(r => selectedResultIds.has(r.id));
              // Backup image set if not done in search
              if (!customCoverImage) {
                  const img = contextData.find((r: any) => r.imageUrl);
                  if (img) setCustomCoverImage(img.imageUrl);
              }
          } else if (hasCustomLink) {
              contextData = [{ url: customSearchSource, title: "Custom Link content" }];
          }
      } else if (inputType === 'Type A') {
          contextData = { frameCount: frames.length, hasVideo: !!videoFile };
      } else if (inputType === 'Type B' && pdfBase64) {
          contextData = { fileData: pdfBase64, mimeType: pdfFile?.type };
      }

      const finalInputText = inputText || "Generate content based on provided context";
      
      const data = await generateRednote(inputType, finalInputText, contextData, selectedTone, imitateText, userApiKey);
      
      setResult(data);
      setEditableTitle(data.content.title);
      setEditableCoverText(data.visualData.elements.coverText.main);
      setEditableCoverSub(data.visualData.elements.coverText.sub);
      setEditableBody(data.content.fullText);
      setSelectedTemplate(data.visualData.templateRecommendation as VisualTemplate);
      
      setStep('result'); window.scrollTo(0, 0);
    } catch (error: any) {
      console.error(error); 
      alert(`生成失败: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  // --- Result Page Actions ---

  const onRegenerateTitles = async () => {
      if (!userApiKey) { setIsKeyModalOpen(true); return; }
      setIsRegeneratingTitle(true);
      try {
          const newTitles = await regenerateTitles(inputText || "New Idea", editableTitle, userApiKey); 
          if (result) setResult({ ...result, content: { ...result.content, titles_options: newTitles } });
      } catch (e) { alert("生成失败"); }
      setIsRegeneratingTitle(false);
  };

  const onRegenerateBody = async () => {
      if (!userApiKey) { setIsKeyModalOpen(true); return; }
      setIsRegeneratingBody(true);
      try {
          const styleRef = selectedTone === 'imitate' ? imitateText : "";
          const newBody = await rewriteContent(editableBody, styleRef, userApiKey);
          setEditableBody(newBody);
      } catch (e) { alert("生成失败"); }
      setIsRegeneratingBody(false);
  };

  const onRegenerateCoverTitle = async () => {
      if (!userApiKey) { setIsKeyModalOpen(true); return; }
      setIsRegeneratingCover(true);
      try {
          const newCover = await regenerateCoverTitle(editableTitle, editableCoverText, userApiKey);
          setEditableCoverText(newCover);
      } catch (e) { alert("生成失败"); }
      setIsRegeneratingCover(false);
  };

  const getVisualBackground = () => {
      if (customCoverImage) return customCoverImage;
      if (inputType === 'Type A') return frames.find(f => f.id === selectedFrameId)?.url || null;
      return null; 
  };

  const visualDataForPreview = result && result.visualData ? {
      ...result.visualData,
      templateRecommendation: selectedTemplate
  } : null;

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 font-sans relative">
      {/* Modal & Header (Same as before) */}
      {isKeyModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Key size={20}/>设置 Gemini API Key</h3>
                      <button onClick={() => setIsKeyModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">请在下方输入您的 Google Gemini API Key。</p>
                  <input type="password" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#ff2442] outline-none mb-4 font-mono" placeholder="AIzaSy..." value={tempKey} onChange={(e) => setTempKey(e.target.value)} />
                  <button onClick={saveApiKey} disabled={!tempKey} className="w-full py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50 transition-colors">保存并开始使用</button>
                  <div className="mt-4 text-xs text-gray-400 text-center"><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline text-blue-500">去获取免费 Key</a></div>
              </div>
          </div>
      )}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStep('input')}>
                <div className="w-8 h-8 bg-[#ff2442] rounded-lg flex items-center justify-center text-white font-bold shadow-md shadow-red-200">R</div>
                <h1 className="text-xl font-bold tracking-tight hidden sm:block">Rednote Creator</h1>
            </div>
            <div className="flex items-center gap-2">
                {step === 'result' && (<button onClick={() => setStep('input')} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#ff2442] bg-gray-100 px-4 py-2 rounded-full"><ArrowLeft size={16} /> 返回修改</button>)}
                <button onClick={() => { setTempKey(userApiKey); setIsKeyModalOpen(true); }} className={`p-2 rounded-full border transition-colors ${userApiKey ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-500 border-red-200 bg-red-50 animate-pulse'}`}><Key size={20} /></button>
            </div>
        </div>
      </div>

      {/* === PAGE 1: INPUT === */}
      {step === 'input' && (
          <div className="max-w-3xl mx-auto p-6 md:p-10 animate-fade-in">
            <div className="text-center mb-10">
                <h2 className="text-3xl font-extrabold text-gray-900 mb-3">打造你的下一篇爆款笔记</h2>
                <p className="text-gray-500">选择创作模式，AI 帮你搞定文案与设计</p>
            </div>
            <div className="flex p-1.5 bg-white rounded-2xl mb-8 shadow-sm border border-gray-100">
            {(['Type A', 'Type B', 'Type C'] as InputType[]).map((type) => (
                <button key={type} onClick={() => { setInputType(type); if(type!=='Type C') setSearchResults([]); }} className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl transition-all ${inputType === type ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}>
                {type === 'Type A' && <Video size={18} />}{type === 'Type B' && <FileText size={18} />}{type === 'Type C' && <Search size={18} />}
                <span>{type === 'Type A' ? '视频提取' : type === 'Type B' ? '文献生成' : '热点搜索'}</span>
                </button>
            ))}
            </div>
            <div className="bg-white rounded-3xl shadow-xl shadow-gray-100 border border-gray-100 p-6 md:p-8">
                {inputType === 'Type C' && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 relative">
                                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input className={`w-full pl-9 pr-8 py-3 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-[#ff2442] outline-none ${linkParseStatus === 'success' ? 'border-green-300 bg-green-50' : linkParseStatus === 'error' ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} placeholder="粘贴文章链接 (强制解析)..." value={customSearchSource} onChange={(e) => { setCustomSearchSource(e.target.value); setLinkParseStatus('idle'); }} />
                                {linkParseStatus === 'success' && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" size={16}/>}
                                {linkParseStatus === 'error' && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500" size={16}/>}
                            </div>
                            <span className="text-xs text-gray-400 font-bold">OR</span>
                            <div className="flex gap-1">
                                {(['x', 'google'] as SearchSource[]).map(s => (
                                    <button key={s} onClick={() => toggleSource(s)} className={`p-2 rounded-full border transition-all ${searchSources.includes(s) ? 'bg-black text-white border-black' : 'bg-white text-gray-400'}`}>
                                        {s === 'x' && <Twitter size={16} />}
                                        {s === 'google' && <Globe size={16} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <input className="w-full p-4 pl-11 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#ff2442] focus:outline-none" placeholder="输入话题 (例如: iPhone 16 评测)" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            </div>
                            <button onClick={handleSearch} disabled={isSearching} className="px-6 py-2 bg-gray-900 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-black disabled:opacity-50">
                                {isSearching ? <Loader2 className="animate-spin" size={18}/> : (customSearchSource ? <Wand2 size={18}/> : <Search size={18} />)} 
                                {customSearchSource ? '解析链接' : '搜索'}
                            </button>
                        </div>
                        {searchResults.length > 0 && (
                            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-[300px] overflow-y-auto custom-scrollbar">
                                <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 flex justify-between sticky top-0">
                                    <span>找到 {searchResults.length} 条结果</span>
                                    <span className="text-[#ff2442]">已选: {selectedResultIds.size}</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {searchResults.map(res => (
                                        <div key={res.id} className={`p-3 hover:bg-gray-50 cursor-pointer flex gap-3 items-start ${selectedResultIds.has(res.id) ? 'bg-red-50/40' : ''}`} onClick={() => toggleResultSelection(res.id)}>
                                            <div className={`mt-1 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selectedResultIds.has(res.id) ? 'bg-[#ff2442] border-[#ff2442]' : 'border-gray-300'}`}>
                                                {selectedResultIds.has(res.id) && <Check size={10} className="text-white" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-bold leading-tight mb-1 text-gray-900">{res.title}</h4>
                                                <div className="flex gap-2 text-[10px] text-gray-400 mb-1"><span>{res.source}</span></div>
                                                {res.imageUrl && <div className="mt-1 text-[9px] text-blue-500 flex items-center gap-1"><ImageIcon size={8}/> 包含图片</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {inputType === 'Type A' && (
                    <div className="space-y-6">
                        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:bg-gray-50 relative group cursor-pointer">
                            <input type="file" accept="video/*" onChange={handleVideoUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                            <Upload className="mx-auto text-gray-400 mb-2" size={28} />
                            <span className="text-sm font-bold text-gray-700">{videoFile ? videoFile.name : "点击上传视频"}</span>
                        </div>
                        {frames.length > 0 && (
                            <div className="grid grid-cols-3 gap-2">
                                {frames.map(frame => (
                                    <div key={frame.id} onClick={() => setSelectedFrameId(selectedFrameId === frame.id ? null : frame.id)} className={`aspect-video rounded-lg overflow-hidden border-2 cursor-pointer relative ${selectedFrameId === frame.id ? 'border-[#ff2442]' : 'border-transparent'}`}><img src={frame.url} className="w-full h-full object-cover" />{selectedFrameId === frame.id && <div className="absolute inset-0 bg-[#ff2442]/30 flex items-center justify-center"><Check className="text-white" /></div>}</div>
                                ))}
                            </div>
                        )}
                        <textarea className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl" placeholder="补充描述..." value={inputText} onChange={(e) => setInputText(e.target.value)} rows={3} />
                    </div>
                )}
                {inputType === 'Type B' && (
                    <div className="space-y-6">
                        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:bg-gray-50 relative group cursor-pointer bg-blue-50/30">
                             <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                             <FileText className="mx-auto text-blue-400 mb-2" size={28} />
                             <span className="text-sm font-bold text-gray-700">{pdfFile ? pdfFile.name : "点击上传论文 PDF"}</span>
                        </div>
                        <textarea className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl h-32" placeholder="或者在此处粘贴论文摘要/笔记内容..." value={inputText} onChange={(e) => setInputText(e.target.value)} />
                    </div>
                )}
                <div className="mt-8 pt-6 border-t border-gray-100">
                    <div className="mb-4">
                        <div className="flex justify-between items-center mb-2">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">选择文案风格</label>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-3">
                            <button onClick={() => setSelectedTone('emotional')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${selectedTone === 'emotional' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}>😭 情感共鸣</button>
                            <button onClick={() => setSelectedTone('professional')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${selectedTone === 'professional' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}>🎓 干货科普</button>
                            <button onClick={() => setSelectedTone('speed')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${selectedTone === 'speed' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}>⚡ 速递新闻</button>
                            <button onClick={() => setSelectedTone('imitate')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${selectedTone === 'imitate' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-600 border-purple-200'}`}>🤖 模仿爆款</button>
                        </div>
                        {selectedTone === 'imitate' && (
                            <textarea className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none h-32 resize-none" placeholder="请在此粘贴您想模仿的【参考爆文】内容..." value={imitateText} onChange={(e) => setImitateText(e.target.value)} />
                        )}
                    </div>
                    <button onClick={handleGenerate} disabled={isLoading} className={`w-full py-4 rounded-2xl font-bold text-white text-xl flex items-center justify-center gap-3 shadow-xl ${isLoading ? 'bg-gray-300' : 'bg-[#ff2442] hover:bg-[#e01f3a]'}`}>
                        {isLoading ? <Loader2 className="animate-spin" /> : <><Sparkles fill="currentColor" className="text-yellow-200" /> 一键生成笔记</>}
                    </button>
                </div>
            </div>
          </div>
      )}

      {/* === PAGE 2: RESULT === */}
      {step === 'result' && result && (
        <div className="max-w-7xl mx-auto p-6 md:p-10 animate-fade-in-up">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 sticky top-24">
                        <div className="mb-6 transform hover:scale-[1.02] transition-transform">
                            <Suspense fallback={<div className="aspect-[3/4] bg-gray-100 animate-pulse rounded-xl"/>}>
                                {visualDataForPreview && (
                                    <VisualCard data={visualDataForPreview} backgroundImage={getVisualBackground()} coverTextOverride={editableCoverText} coverSubOverride={editableCoverSub} coverFontSize={coverFontSize} />
                                )}
                            </Suspense>
                        </div>
                        <div className="space-y-4">
                             <div>
                                 <label className="text-xs font-bold text-gray-900 block mb-2 flex items-center gap-1"><ImageIcon size={12}/> 封面背景图</label>
                                 <div className="flex gap-2">
                                     <div className="relative flex-1">
                                         <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full z-10" />
                                         <button className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-xs font-bold rounded-lg text-gray-600 flex items-center justify-center gap-1"><Upload size={12}/> 上传图片</button>
                                     </div>
                                     <button onClick={handleRandomImage} className="px-3 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center hover:bg-purple-200">
                                         <Dice5 size={16}/>
                                     </button>
                                     <input placeholder="或输入图片链接..." className="flex-[2] bg-gray-50 border border-gray-200 rounded-lg px-3 text-xs outline-none focus:border-gray-400" onChange={(e) => setCustomCoverImage(e.target.value)} />
                                 </div>
                             </div>
                             <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-bold text-gray-900">封面大标题</label>
                                    <div className="flex items-center gap-2">
                                        <TypeIcon size={12} className="text-gray-400"/>
                                        <input type="range" min="0.5" max="3" step="0.1" value={coverFontSize} onChange={(e) => setCoverFontSize(parseFloat(e.target.value))} className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#ff2442]" />
                                    </div>
                                </div>
                                <div className="flex gap-2 mb-2">
                                    <input value={editableCoverText} onChange={(e) => setEditableCoverText(e.target.value)} className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-[#ff2442] outline-none" placeholder="主标题" />
                                    <button onClick={onRegenerateCoverTitle} disabled={isRegeneratingCover} className="px-3 bg-black text-white rounded-xl flex items-center justify-center hover:bg-gray-800" title="AI 重写封面标题">
                                        {isRegeneratingCover ? <Loader2 size={14} className="animate-spin"/> : <Wand2 size={14}/>}
                                    </button>
                                </div>
                                <input value={editableCoverSub} onChange={(e) => setEditableCoverSub(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#ff2442] outline-none" placeholder="副标题 (可选，清空即删除)" />
                             </div>
                             <div>
                                <label className="text-xs font-bold text-gray-900 block mb-2">设计风格</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['apple_note', 'canva_viral', 'card', 'memo', 'literature', 'subtitle', 'notification', 'receipt', 'polaroid', 'chat'].map((t) => (
                                        <button key={t} onClick={() => setSelectedTemplate(t as VisualTemplate)} className={`py-2 text-[9px] font-bold uppercase rounded border ${selectedTemplate === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-100'}`}>{t.replace('_',' ')}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-gray-400 uppercase flex items-center gap-2"><Type size={16}/> 选择标题</h3>
                            <button onClick={onRegenerateTitles} disabled={isRegeneratingTitle} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-gray-800">
                                {isRegeneratingTitle ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} 换一批
                            </button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2 mb-4">
                            {result.content.titles_options?.map((t, i) => (
                                <div key={i} onClick={() => setEditableTitle(t)} className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 group ${editableTitle === t ? 'border-[#ff2442] bg-red-50/30' : 'border-transparent hover:bg-gray-50'}`}>
                                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${editableTitle === t ? 'border-[#ff2442] bg-[#ff2442]' : 'border-gray-300 group-hover:border-gray-400'}`}>
                                        {editableTitle === t && <div className="w-1 h-1 bg-white rounded-full"/>}
                                    </div>
                                    <span className={`text-sm font-bold ${editableTitle === t ? 'text-[#ff2442]' : 'text-gray-700'}`}>{t}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                            <span className="text-sm font-bold text-gray-700 flex gap-2"><PenTool size={16} className="text-[#ff2442]"/> 内容编辑</span>
                            <div className="flex gap-2">
                                <button onClick={onRegenerateBody} disabled={isRegeneratingBody} className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-xs font-bold flex gap-2 hover:bg-purple-200">
                                    {isRegeneratingBody ? <Loader2 size={14} className="animate-spin"/> : <Wand2 size={14}/>} AI 润色/重写
                                </button>
                                <button onClick={() => { navigator.clipboard.writeText(`${editableTitle}\n\n${editableBody}`); setCopied(true); setTimeout(()=>setCopied(false),2000); }} className="bg-gray-900 text-white px-4 py-2 rounded-full text-xs font-bold flex gap-2 hover:bg-black">
                                    {copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? '已复制' : '复制全文'}
                                </button>
                            </div>
                        </div>
                        <div className="p-8 flex flex-col gap-6">
                             <div>
                                 <label className="text-xs font-bold text-gray-400 uppercase">当前标题</label>
                                 <input value={editableTitle} onChange={(e) => setEditableTitle(e.target.value)} className="w-full text-xl font-extrabold border-b-2 border-gray-100 py-2 focus:border-[#ff2442] outline-none bg-transparent" />
                             </div>
                             <div className="flex-1">
                                 <label className="text-xs font-bold text-gray-400 uppercase">正文内容</label>
                                 <textarea value={editableBody} onChange={(e) => setEditableBody(e.target.value)} className="w-full text-lg leading-8 text-gray-800 resize-none outline-none bg-transparent mt-2" style={{ minHeight: '300px' }} />
                             </div>
                             <div className="flex flex-wrap gap-2 border-t border-dashed border-gray-200 pt-4">
                                {result.content.tags?.map(tag => <span key={tag} className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">{tag}</span>)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;