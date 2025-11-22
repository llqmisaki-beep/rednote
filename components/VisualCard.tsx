import React from 'react';
import { VisualData, VisualTemplate } from '../types';

interface VisualCardProps {
  data: VisualData;
  backgroundImage?: string | null;
  coverTextOverride?: string; // Allow manual override from editor
}

export const VisualCard: React.FC<VisualCardProps> = ({ data, backgroundImage, coverTextOverride }) => {
  const { templateRecommendation, colorPalette, elements } = data;
  const safePalette = colorPalette && colorPalette.length >= 3 ? colorPalette : ['#ffffff', '#000000', '#ff2442'];
  const [bg, , accent] = safePalette; // Removed unused 'text' variable

  // Strict 3:4 aspect ratio container styles
  const containerClass = "aspect-[3/4] w-full max-w-sm mx-auto relative shadow-xl overflow-hidden flex flex-col select-none";

  const bgStyle = backgroundImage 
    ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } 
    : { backgroundColor: bg };

  const template = templateRecommendation as VisualTemplate;
  const coverMain = coverTextOverride || elements?.coverText?.main || "Title";
  const coverSub = elements?.coverText?.sub || "";
  const points = elements?.knowledgePoints || [];

  // --- 7. SUBTITLE (Cinematic) ---
  if (template === 'subtitle') {
      return (
        <div className={`${containerClass} bg-black font-sans`}>
            <div className="absolute inset-0 bg-black">
                 {backgroundImage && <div className="w-full h-full opacity-90" style={bgStyle}></div>}
            </div>
            <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent z-10"></div>
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent z-10"></div>
            <div className="absolute bottom-10 left-0 right-0 px-6 text-center z-20 flex flex-col gap-2">
                <p className="text-[#FFD700] text-xl font-medium tracking-wide leading-snug drop-shadow-md font-serif">
                    {coverMain}
                </p>
                {coverSub && <p className="text-white/90 text-xs font-light tracking-wider">{coverSub}</p>}
            </div>
        </div>
      );
  }

  // --- 2. LITERATURE (Academic) ---
  if (template === 'literature') {
    return (
      <div className={`${containerClass} bg-white text-black font-serif p-6`}>
         {backgroundImage && <div className="absolute inset-0 opacity-10 pointer-events-none" style={bgStyle}></div>}
         
         <div className="border-b-2 border-black pb-3 mb-3 flex-shrink-0 z-10">
             <div className="flex justify-between text-[9px] uppercase tracking-widest text-gray-500 mb-2">
                 <span>ORIGINAL RESEARCH</span>
                 <span>2024</span>
             </div>
             <h1 className="text-2xl font-bold leading-tight mb-2 text-left line-clamp-3">{elements.literatureInfo?.titleEn || coverMain}</h1>
             <div className="text-[10px] italic text-gray-600">Rednote AI Lab</div>
         </div>

         <div className="flex-1 flex flex-col overflow-hidden z-10 gap-2">
            <div>
                <h2 className="text-xs font-bold uppercase tracking-wide mb-1">Abstract</h2>
                <p className="text-[11px] leading-relaxed text-justify text-gray-800 line-clamp-6">
                    <span className="font-bold">Background: </span>
                    {elements.literatureInfo?.abstractCn || coverSub || "Study content placeholder..."}
                </p>
            </div>
            {points.length > 0 && (
                <div className="mt-auto bg-gray-50 p-3 border-l-2 border-black">
                    <p className="text-[10px] font-bold mb-1">KEY FINDINGS:</p>
                    <p className="text-[10px] leading-relaxed line-clamp-3">{points[0]}</p>
                </div>
            )}
         </div>
         
         <div className="mt-auto pt-2 border-t border-gray-200 text-[8px] text-gray-400 flex justify-between z-10">
            <span>doi:10.1016/rednote</span>
            <span>Page 1</span>
        </div>
      </div>
    );
  }

  // --- 1. MEMO ---
  if (template === 'memo') {
    return (
      <div className={`${containerClass} bg-[#FFF9C4]`}>
        {backgroundImage && <div className="absolute inset-0 opacity-15 mix-blend-multiply" style={bgStyle}></div>}
        <div className="relative z-10 p-6 flex flex-col h-full">
            <div className="w-24 h-6 bg-yellow-400/40 mx-auto -mt-8 mb-6 rotate-2 shadow-sm backdrop-blur-sm"></div>
            
            <div className="border-b-2 border-dashed border-gray-400/50 pb-4 mb-4 flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-900 mb-2 leading-tight line-clamp-3">{coverMain}</h1>
                {coverSub && <p className="text-gray-600 text-xs line-clamp-2">{coverSub}</p>}
            </div>
            
            <div className="flex-1 overflow-hidden">
                <ul className="space-y-3">
                {points.slice(0, 4).map((point, idx) => (
                    <li key={idx} className="flex gap-2 items-start">
                        <span className="text-yellow-600 font-bold mt-0.5">•</span>
                        <p className="text-gray-800 font-medium text-xs leading-relaxed line-clamp-2">{point}</p>
                    </li>
                ))}
                </ul>
            </div>
            
            <div className="mt-auto text-right text-[10px] text-gray-500 font-mono">
                {new Date().toLocaleDateString()}
            </div>
        </div>
      </div>
    );
  }

  // --- 3. NEON ---
  if (template === 'neon') {
    return (
      <div className={`${containerClass} bg-gray-900 text-white justify-end`}>
        <div className="absolute inset-0 opacity-60" style={backgroundImage ? bgStyle : { background: 'linear-gradient(to bottom, #222, #000)' }}></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
        
        <div className="relative z-10 p-6 pb-8 flex flex-col justify-end h-1/2">
            <h1 className="text-3xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 filter drop-shadow-[0_0_5px_rgba(236,72,153,0.5)] leading-tight line-clamp-3">
                {coverMain}
            </h1>
            <div className="h-1 w-12 bg-pink-500 mb-3 shadow-[0_0_8px_rgba(236,72,153,1)]"></div>
            <p className="text-xs font-medium text-gray-300 line-clamp-2 uppercase tracking-wider">{coverSub}</p>
        </div>
      </div>
    );
  }

  // --- 5. MAGAZINE ---
  if (template === 'magazine') {
    return (
      <div className={`${containerClass} bg-white`}>
         {backgroundImage && <div className="absolute inset-0" style={bgStyle}></div>}
         <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60"></div>
         
         {/* Top Bar */}
         <div className="relative z-10 p-4 flex justify-between text-white font-bold text-[9px] tracking-[0.2em] uppercase border-b border-white/20">
             <span>VOGUE</span>
             <span>DAILY</span>
         </div>
         
         {/* Content Area */}
         <div className="relative z-10 flex-1 flex flex-col justify-end p-6 text-center pb-12">
            {coverSub && (
                <div className="mb-4">
                    <span className="text-white text-[10px] tracking-[0.2em] uppercase bg-black/40 backdrop-blur-md px-3 py-1 inline-block">
                        {coverSub.slice(0, 20)}
                    </span>
                </div>
            )}
            <h1 className="text-4xl font-serif text-white leading-[1.1] drop-shadow-lg mix-blend-overlay line-clamp-4">
                {coverMain}
            </h1>
         </div>
      </div>
    );
  }

  // --- 4. POLAROID ---
  if (template === 'polaroid') {
      return (
          <div className={`${containerClass} bg-gray-100 p-4 pb-12`}>
              <div className="bg-white shadow-lg w-full h-full p-3 pb-10 flex flex-col transform rotate-1">
                  <div className="flex-1 bg-gray-200 overflow-hidden relative shadow-inner border border-gray-100">
                      {backgroundImage ? (
                          <div className="absolute inset-0" style={bgStyle}></div>
                      ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-gray-300">IMG</div>
                      )}
                  </div>
                  <div className="mt-4 text-center h-12 flex items-center justify-center overflow-hidden">
                      <h1 className="font-handwriting text-gray-700 text-lg leading-tight line-clamp-2">{coverMain}</h1>
                  </div>
              </div>
          </div>
      )
  }

  // --- 6. CARD (Default) ---
  return (
    <div className={`${containerClass} rounded-3xl`}
         style={{ background: `linear-gradient(135deg, ${bg} 0%, ${accent} 100%)` }}>
      {backgroundImage && (
          <div className="absolute inset-0 opacity-25 mix-blend-overlay" style={bgStyle}></div>
      )}
      
      <div className="p-6 pt-8 relative z-10 text-white flex-shrink-0">
         <span className="inline-block px-2 py-0.5 rounded bg-white/20 backdrop-blur-md text-[9px] font-bold tracking-wider mb-3 border border-white/20">
            FEATURED
         </span>
         <h1 className="text-2xl font-extrabold mb-2 tracking-tight leading-snug line-clamp-3">{coverMain}</h1>
         <h2 className="text-xs font-medium opacity-90 line-clamp-2">{coverSub}</h2>
      </div>
      
      <div className="flex-1 bg-white/95 backdrop-blur-xl m-3 mt-0 rounded-2xl shadow-lg p-5 text-gray-800 flex flex-col justify-center z-10 overflow-hidden">
        {points.length > 0 ? (
            <ul className="space-y-3">
                {points.slice(0,3).map((point, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold shadow-sm flex-shrink-0 mt-0.5" style={{ backgroundColor: accent }}>{idx + 1}</span>
                        <span className="font-bold text-xs leading-snug line-clamp-2">{point}</span>
                    </li>
                ))}
            </ul>
        ) : (
             <p className="text-center text-xs text-gray-400">Loading...</p>
        )}
      </div>
    </div>
  );
};