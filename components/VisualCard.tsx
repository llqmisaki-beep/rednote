import React from 'react';
import { VisualData, VisualTemplate } from '../types';
import { Wifi, Battery, Signal } from 'lucide-react';

interface VisualCardProps {
  data: VisualData;
  backgroundImage?: string | null;
  coverTextOverride?: string; 
  coverSubOverride?: string;
  coverFontSize?: number;
}

// Wrapped in React.memo for performance optimization
export const VisualCard: React.FC<VisualCardProps> = React.memo(({ 
    data, 
    backgroundImage, 
    coverTextOverride, 
    coverSubOverride,
    coverFontSize = 1 
}) => {
  const { templateRecommendation, colorPalette, elements } = data;
  const safePalette = colorPalette && colorPalette.length >= 3 ? colorPalette : ['#ffffff', '#000000', '#ff2442'];
  const [bg, , accent] = safePalette; 

  const template = templateRecommendation as VisualTemplate;
  const coverMain = coverTextOverride !== undefined ? coverTextOverride : (elements?.coverText?.main || "标题");
  const coverSub = (coverSubOverride !== undefined ? coverSubOverride : (elements?.coverText?.sub || "")).trim();
  const points = elements?.knowledgePoints || [];

  const getTitleStyle = (baseSizeRem: number) => ({
      fontSize: `${baseSizeRem * coverFontSize}rem`,
      lineHeight: 1.1
  });

  const ImageLayer = ({ opacity = 1, filter = '' }: { opacity?: number, filter?: string }) => {
      if (!backgroundImage) return <div className="absolute inset-0 bg-gray-100 flex items-center justify-center text-gray-300 font-bold text-2xl">NO IMAGE</div>;
      return (
          <>
            <div className="absolute inset-0 bg-cover bg-center blur-xl scale-110" style={{ backgroundImage: `url(${backgroundImage})`, opacity: opacity }} />
            <div className={`absolute inset-0 flex items-center justify-center ${filter}`}>
                <img 
                    src={backgroundImage} 
                    alt="cover" 
                    className="w-full h-full object-cover" 
                    loading="lazy" // Lazy load image
                />
            </div>
          </>
      );
  };

  const containerClass = "aspect-[3/4] w-full max-w-sm mx-auto relative shadow-2xl overflow-hidden flex flex-col select-none bg-white ring-1 ring-gray-900/5";

  // 1. SYSTEM NOTIFICATION
  if (template === 'notification') {
      return (
          <div className={containerClass}>
              <ImageLayer />
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute top-12 left-0 right-0 text-center z-10">
                  <div className="text-6xl font-thin text-white drop-shadow-md font-[system-ui]">
                      {new Date().getHours()}:{new Date().getMinutes().toString().padStart(2, '0')}
                  </div>
                  <div className="text-lg text-white/90 font-medium mt-1">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
              </div>
              <div className="absolute bottom-24 left-4 right-4 z-20">
                  <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-4 shadow-xl border border-white/40">
                      <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                              <div className="w-5 h-5 bg-[#ff2442] rounded-md flex items-center justify-center">
                                  <span className="text-white text-[10px] font-bold">R</span>
                              </div>
                              <span className="text-xs font-bold text-gray-600 uppercase">NEWS ALERT</span>
                          </div>
                          <span className="text-[10px] text-gray-500">now</span>
                      </div>
                      <h3 className="font-black text-gray-900 mb-1" style={getTitleStyle(1.25)}>
                          {coverMain}
                      </h3>
                      {coverSub && <p className="text-sm text-gray-700 leading-snug line-clamp-2">{coverSub}</p>}
                  </div>
              </div>
          </div>
      );
  }

  // 2. RECEIPT
  if (template === 'receipt') {
      return (
          <div className={`${containerClass} bg-[#eee] p-6 flex flex-col items-center justify-center`}>
              <div className="w-full bg-white shadow-lg relative overflow-hidden flex flex-col">
                  <div className="absolute top-0 left-0 right-0 h-2 bg-[#eee]" style={{ clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)' }}></div>
                  <div className="p-6 pt-8 flex flex-col items-center text-center border-b-2 border-dashed border-gray-300">
                      <h2 className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-2">************ RECEIPT ************</h2>
                      <h1 className="font-mono font-black text-black uppercase mb-2" style={getTitleStyle(1.8)}>{coverMain}</h1>
                      {coverSub && <p className="font-mono text-xs text-gray-500 uppercase">{coverSub}</p>}
                  </div>
                  <div className="relative h-48 bg-gray-100 border-b-2 border-dashed border-gray-300 overflow-hidden grayscale contrast-125">
                      <ImageLayer />
                  </div>
                  <div className="p-6 font-mono text-xs space-y-2 text-gray-600">
                      <div className="flex justify-between"><span>ITEM:</span><span className="font-bold">TRENDING</span></div>
                      <div className="flex justify-between"><span>DATE:</span><span>{new Date().toLocaleDateString()}</span></div>
                      <div className="mt-4 pt-4 border-t border-black flex justify-between items-end">
                          <div className="h-8 w-32 bg-gray-800"></div>
                          <span className="font-bold text-lg">#001</span>
                      </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-2 bg-[#eee]" style={{ clipPath: 'polygon(0% 100%, 5% 0%, 10% 100%, 15% 0%, 20% 100%, 25% 0%, 30% 100%, 35% 0%, 40% 100%, 45% 0%, 50% 100%, 55% 0%, 60% 100%, 65% 0%, 70% 100%, 75% 0%, 80% 100%, 85% 0%, 90% 100%, 95% 0%, 100% 100%)' }}></div>
              </div>
          </div>
      );
  }

  // 3. POLAROID
  if (template === 'polaroid') {
      return (
          <div className={`${containerClass} bg-gray-200 p-6 flex items-center justify-center`}>
              <div className="bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] p-4 pb-16 w-full transform -rotate-2 border border-gray-100">
                  <div className="aspect-square bg-gray-100 overflow-hidden relative mb-6 shadow-inner">
                      <ImageLayer />
                  </div>
                  <div className="font-['Caveat','Handlee','cursive'] text-center">
                      <h1 className="font-bold text-gray-800 rotate-1" style={getTitleStyle(1.8)}>{coverMain}</h1>
                      {coverSub && <p className="text-gray-500 text-sm mt-1">{coverSub}</p>}
                  </div>
              </div>
          </div>
      );
  }

  // 4. CHAT
  if (template === 'chat') {
      return (
          <div className={`${containerClass} bg-gray-100 font-sans flex flex-col`}>
              <div className="h-8 bg-gray-100 flex justify-between items-center px-4 text-[10px] font-bold text-gray-500 border-b border-gray-200">
                  <span>9:41</span>
                  <div className="flex gap-1"><Signal size={10}/><Wifi size={10}/><Battery size={10}/></div>
              </div>
              <div className="flex-1 p-4 space-y-4 overflow-hidden relative">
                  <div className="text-center text-[10px] text-gray-400 my-2">Today 10:23 AM</div>
                  <div className="flex gap-2 items-end">
                      <div className="w-8 h-8 bg-gray-300 rounded-full overflow-hidden flex-shrink-0 border border-white">
                          {backgroundImage ? <img src={backgroundImage} className="w-full h-full object-cover"/> : null}
                      </div>
                      <div className="bg-white rounded-2xl rounded-bl-none p-2 shadow-sm max-w-[85%] border border-gray-200 overflow-hidden">
                          <div className="rounded-lg overflow-hidden relative h-32 mb-2">
                              <ImageLayer />
                          </div>
                          {coverSub && <p className="text-xs text-gray-500 line-clamp-2">{coverSub}</p>}
                      </div>
                  </div>
                  <div className="flex gap-2 items-end justify-end">
                      <div className="bg-[#95ec69] rounded-2xl rounded-br-none p-3 shadow-sm max-w-[80%] border border-[#8ad862]">
                          <h1 className="font-bold text-black" style={getTitleStyle(1)}>
                              {coverMain}
                          </h1>
                      </div>
                      <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold">ME</div>
                  </div>
              </div>
          </div>
      );
  }

  // 5. APPLE NOTE
  if (template === 'apple_note') {
      return (
          <div className={`${containerClass} bg-[#FBF8E9] p-6 font-sans relative`}>
              <div className="flex justify-between text-[#D4AF37] mb-6 opacity-80 text-sm font-medium">
                  <span className="flex items-center gap-1">Back</span>
                  <span className="text-gray-900 font-bold text-xs opacity-50">Notes</span>
                  <span className="text-[#D4AF37]">Done</span>
              </div>
              <h1 className="font-extrabold text-gray-900 mb-4 tracking-tight" style={getTitleStyle(2.5)}>{coverMain}</h1>
              <div className="space-y-3 mb-6">
                  {coverSub && <p className="text-gray-500 font-medium text-sm border-l-2 border-gray-300 pl-3">{coverSub}</p>}
                  {points.slice(0, 2).map((p, i) => (
                      <div key={i} className="flex items-start gap-2 text-gray-700"><span className="text-gray-400">•</span><span className="text-sm">{p}</span></div>
                  ))}
              </div>
              {backgroundImage && (
                  <div className="w-full h-40 rounded-xl overflow-hidden shadow-sm border border-black/5 relative">
                      <ImageLayer />
                  </div>
              )}
          </div>
      );
  }

  // 6. MEMO
  if (template === 'memo') {
    return (
      <div className={`${containerClass} bg-[#fffbeb] p-0`}>
        <div className="h-full w-full p-6 flex flex-col relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-8 bg-white/40 backdrop-blur-sm rotate-1 border-l border-r border-white/50 shadow-sm z-20"></div>
            <div className="mt-4 border-b-2 border-dashed border-yellow-600/20 pb-4 mb-4">
                <h1 className="font-black text-yellow-900 mb-2" style={getTitleStyle(2.5)}>{coverMain}</h1>
            </div>
            {backgroundImage && (
                <div className="w-full aspect-video bg-yellow-100 rounded-md overflow-hidden mb-4 border-4 border-white shadow-sm relative">
                    <ImageLayer />
                </div>
            )}
            <div className="flex-1 space-y-2 overflow-hidden">
                {points.map((point, idx) => (
                    <div key={idx} className="flex gap-2 items-start"><span className="text-yellow-600 mt-1">●</span><p className="text-yellow-900 font-medium text-sm">{point}</p></div>
                ))}
            </div>
        </div>
      </div>
    );
  }

  // 7. LITERATURE
  if (template === 'literature') {
    return (
      <div className={`${containerClass} bg-[#f8f5f2] text-black font-serif p-8 flex flex-col`}>
         <div className="border-b border-black pb-4 mb-6">
             <div className="flex justify-between text-[8px] uppercase tracking-[0.2em] text-gray-500 mb-4"><span>Vol. 2024</span><span>The Rednote Review</span></div>
             <h1 className="font-bold leading-none mb-4 text-left tracking-tighter" style={getTitleStyle(3)}>{coverMain}</h1>
             <div className="text-[10px] italic text-gray-600">Rednote AI Lab</div>
         </div>
         <div className="flex-1 flex flex-col gap-4 relative z-10">
            <p className="text-xs leading-loose text-justify text-gray-800 first-letter:text-4xl first-letter:font-bold first-letter:mr-1 first-letter:float-left">
                {elements.literatureInfo?.abstractCn || coverSub || points[0] || "Content loading..."}
            </p>
            {backgroundImage && (
                <div className="mt-auto w-full h-32 grayscale contrast-125 opacity-80 relative border border-black">
                    <ImageLayer filter="grayscale" />
                </div>
            )}
         </div>
      </div>
    );
  }

  // 8. MAGAZINE
  if (template === 'magazine') {
    return (
      <div className={`${containerClass} bg-gray-900`}>
         <ImageLayer />
         <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80"></div>
         <div className="relative z-10 p-5 text-center border-b border-white/20">
             <h2 className="text-white font-serif font-bold text-5xl tracking-tighter leading-none mix-blend-overlay opacity-90">VOGUE</h2>
         </div>
         <div className="relative z-10 flex-1 flex flex-col justify-end p-6 pb-10">
            <div className="bg-white/10 backdrop-blur-md border-l-2 border-[#ff2442] p-4">
                <h1 className="font-bold text-white leading-[0.9] mb-2 drop-shadow-lg uppercase" style={getTitleStyle(3)}>
                    {coverMain}
                </h1>
                {coverSub && <p className="text-white/80 text-xs font-medium uppercase tracking-widest">{coverSub}</p>}
            </div>
         </div>
      </div>
    );
  }

  return null; 
});