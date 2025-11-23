import { GoogleGenAI } from "@google/genai";
import { InputType, RednoteResponse, SearchResult, SearchSource, RednoteTone, MediaAnalysis } from "../types";

const apiKey = process.env.API_KEY;

// --- Model Configuration ---
// As requested: Use 'gemini-3-pro-preview' for deep analysis and generation.
const PRO_MODEL = 'gemini-3-pro-preview'; 
// Use 'gemini-2.5-flash' for high-speed simple tasks (like search aggregation or simple title tweaks)
const FAST_MODEL = 'gemini-2.5-flash';

// --- System Instructions ---

const SYSTEM_INSTRUCTION = `
System Instruction: Rednote Creator Engine (Chinese Version)
1. Role: You are the "Rednote Creator". Transform inputs into viral Xiaohongshu posts.
**CRITICAL: OUTPUT MUST BE IN SIMPLIFIED CHINESE.**

2. JSON Structure (Strict):
{
  "status": "success",
  "content": {
    "title": "Main Title",
    "titles_options": ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"],
    "coreIdea": "Summary",
    "fullText": "Content...",
    "tags": ["#Tag1"]
  },
  "visualData": {
    "templateRecommendation": "card",
    "elements": {
      "coverText": { "main": "Cover Title", "sub": "Subtitle" },
      "knowledgePoints": ["Point 1", "Point 2"],
      "literatureInfo": { "titleEn": "Eng Title", "abstractCn": "Abstract", "citation": "Source" }
    }
  }
}
Return ONLY valid JSON. No markdown formatting.
`;

const SEARCH_SYSTEM_INSTRUCTION = `
You are a ULTRA-FAST news aggregator & content parser.
**CRITICAL RULES:**
1. **IMAGE IS PRIORITY**: You MUST try to find the main article image (OpenGraph Image, Hero Image) URL. Return it in 'imageUrl'.
2. If the query is a URL, summarize that specific page.
3. Return JSON only.
{
  "results": [
    { 
      "id": "1", 
      "title": "Title", 
      "url": "...", 
      "source": "...", 
      "date": "...", 
      "snippet": "...", 
      "imageUrl": "https://..." 
    }
  ]
}
`;

// --- Helpers ---

const extractJSON = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const jsonBlock = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlock) { try { return JSON.parse(jsonBlock[1]); } catch { } }
    const codeBlock = text.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlock) { try { return JSON.parse(codeBlock[1]); } catch { } }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) { try { return JSON.parse(text.substring(start, end + 1)); } catch { } }
    throw new Error("Could not extract JSON from response");
  }
};

// --- Analysis Functions (Pro Model) ---

export const analyzeMedia = async (
    inputType: 'Type A' | 'Type B', 
    fileData: any, 
    apiKey?: string
): Promise<MediaAnalysis> => {
    const finalKey = apiKey || process.env.API_KEY;
    if (!finalKey) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Analyze the attached file (Video or PDF). 
    Output a JSON object with two fields:
    1. "summary": A concise introduction of the content (max 100 words).
    2. "corePoints": An array of 3-5 key takeaways or core value points.
    Output JSON ONLY.
    `;

    // Construct parts based on input
    const parts: any[] = [{ text: prompt }];
    if (inputType === 'Type A' && fileData.description) {
        // Using description as context for video analysis in this demo
        parts.push({ text: "Video Context/Transcript: " + fileData.description });
    } else if (inputType === 'Type B' && fileData.base64) {
        parts.push({ inlineData: { mimeType: fileData.mimeType || 'application/pdf', data: fileData.base64 } });
    }

    try {
        const response = await ai.models.generateContent({
            model: PRO_MODEL, // Gemini 3 Pro for deep analysis
            contents: { parts },
            config: { responseMimeType: "application/json" }
        });
        return extractJSON(response.text || "{}") as MediaAnalysis;
    } catch (e) {
        console.error(e);
        throw new Error("Analysis failed. Please try again.");
    }
};

export const askAI = async (
    contextText: string, 
    question: string, 
    apiKey?: string
): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Context: """${contextText}"""
    User Question: "${question}"
    
    Answer the user's question based on the context provided. Be helpful, concise, and professional.
    `;

    try {
        const response = await ai.models.generateContent({
            model: PRO_MODEL, // Gemini 3 Pro for reasoning
            contents: prompt,
        });
        return response.text || "Unable to answer.";
    } catch (e) {
        return "AI Error.";
    }
};

// --- Main Functions ---

export const searchTrends = async (query: string, sources: SearchSource[], customSource?: string, apiKey?: string): Promise<SearchResult[]> => {
  const finalKey = apiKey || process.env.API_KEY;
  if (!finalKey) throw new Error("API Key 未设置。请点击右上角钥匙图标输入您的 Gemini API Key。");
  
  const ai = new GoogleGenAI({ apiKey: finalKey });

  let fullQuery = "";
  
  if (customSource && (customSource.startsWith('http') || customSource.includes('www'))) {
      fullQuery = `Analyze this specific URL: ${customSource}. 
      Task 1: Extract the Title and a 1-sentence Summary.
      Task 2: Extract the MAIN HERO IMAGE URL (start with http).`;
  } else {
      const platformKeywords: string[] = sources.map(s => {
        if (s === 'x') return 'site:twitter.com OR site:x.com';
        if (s === 'google') return ''; 
        return '';
      });
      
      if (customSource && customSource.trim()) {
          platformKeywords.push(`site:${customSource.trim()}`);
      }

      const sourceFilter = platformKeywords.filter(Boolean).join(' OR ');
      const qText = query || "Latest trending news";
      fullQuery = `"${qText}" ${sourceFilter ? `(${sourceFilter})` : ''}`;
  }

  try {
    const response = await ai.models.generateContent({
      model: FAST_MODEL, // Keep Flash for search speed
      contents: `Task: ${fullQuery}. 
      Return strictly JSON list with 'imageUrl' if found.`,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: SEARCH_SYSTEM_INSTRUCTION,
      },
    });

    const parsedData = extractJSON(response.text || "{}");
    let results: SearchResult[] = [];

    if (Array.isArray(parsedData)) results = parsedData;
    else if (parsedData.results && Array.isArray(parsedData.results)) results = parsedData.results;

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    if (results.length === 0 && groundingChunks.length > 0) {
        return groundingChunks.map((chunk: any, idx: number) => ({
          id: String(idx),
          title: chunk.web?.title || "搜索结果",
          snippet: "点击生成笔记进行深度分析...",
          source: "Web",
          url: chunk.web?.uri,
          date: ""
        }));
    }

    return results.map((r, i) => ({
        id: r.id || String(i),
        title: r.title || "无标题",
        snippet: r.snippet || "暂无预览",
        source: r.source || "Web",
        url: r.url, 
        date: r.date,
        imageUrl: r.imageUrl 
    }));
  } catch (error) {
    console.warn("Search extraction failed", error);
    return [];
  }
};

export const generateRednote = async (
  inputType: InputType,
  inputText: string,
  contextData?: any,
  tone: RednoteTone = 'emotional',
  customRequirement?: string,
  apiKey?: string
): Promise<RednoteResponse> => {
  const finalKey = apiKey || process.env.API_KEY;
  if (!finalKey) throw new Error("API Key 未设置。");
  
  const ai = new GoogleGenAI({ apiKey: finalKey });
  
  let toneInstruction = "";
  
  if (tone === 'imitate') {
      const referenceText = customRequirement || "No reference provided.";
      toneInstruction = `
      # Role: 小红书爆款拆解与重构专家
      ## Reference Style (Mimic Tone & Structure):
      """${referenceText}"""
      ## My Topic:
      "${inputText}"
      ## Output:
      1. 5 Viral Titles.
      2. Content mimicking the reference style.
      `;
  } else {
      switch (tone) {
          case 'emotional': toneInstruction = "Tone: Emotional, Empathetic (家人们)."; break;
          case 'professional': toneInstruction = "Tone: Professional, Structured (干货)."; break;
          case 'speed': toneInstruction = "Tone: News Flash, Urgent (速递)."; break;
          case 'humorous': toneInstruction = "Tone: Humorous, Sarcastic."; break;
      }
  }

  let promptParts: any[] = [
      { text: `inputType: ${inputType}\n\n${toneInstruction}` }
  ];
  
  // Pass Analysis data if available
  if (contextData && contextData.analysis) {
      promptParts.push({ text: `\n\nPre-Analysis Summary: ${contextData.analysis.summary}\nCore Points: ${contextData.analysis.corePoints.join(', ')}` });
  }

  if (inputType === 'Type C' && contextData) {
      promptParts.push({ text: `\n\nSearch Context: ${JSON.stringify(contextData, null, 2)}` });
  } else if (inputType === 'Type A' && contextData) {
       promptParts.push({ text: `\n\nVisual Context: ${contextData.frameCount} video frames.` });
  } else if (inputType === 'Type B' && contextData && contextData.fileData) {
      promptParts.push({ text: `\n\nAnalyze PDF.` });
      promptParts.push({ inlineData: { mimeType: contextData.mimeType || 'application/pdf', data: contextData.fileData } });
  } else {
      if (tone !== 'imitate') promptParts.push({ text: `Topic: ${inputText}` });
  }

  try {
    const response = await ai.models.generateContent({
      model: PRO_MODEL, // Gemini 3 Pro for best quality generation
      contents: { parts: promptParts },
      config: { 
          systemInstruction: SYSTEM_INSTRUCTION, 
      },
    });

    const safeJson = extractJSON(response.text || "{}") as any;
    
    if (!safeJson.content) safeJson.content = { title: "AI Note", fullText: response.text || "" };
    if (!safeJson.content.fullText) safeJson.content.fullText = safeJson.content.body || "";
    if (!Array.isArray(safeJson.content.titles_options)) safeJson.content.titles_options = [safeJson.content.title || "Title"];
    if (!safeJson.visualData) safeJson.visualData = { elements: { coverText: { main: safeJson.content.title, sub: "" } } };

    return safeJson as RednoteResponse;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const regenerateTitles = async (currentTopic: string, referenceTitle: string, apiKey?: string): Promise<string[]> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Task: Generate 5 NEW viral Xiaohongshu titles for: "${currentTopic}".
    Mimic style: "${referenceTitle}".
    Format: Emoji + Text.
    Output: JSON array of strings.
    `;

    try {
        const response = await ai.models.generateContent({
            model: FAST_MODEL, // Fast model for simple titles
            contents: prompt,
        });
        const json = extractJSON(response.text || "[]");
        return Array.isArray(json) ? json : (json.titles || []);
    } catch (e) {
        return ["生成失败"];
    }
};

export const rewriteContent = async (currentContent: string, referenceArticle: string, apiKey?: string): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Role: Rednote Editor.
    Task: Rewrite or Polish the content below.
    ${referenceArticle ? `Style Ref: """${referenceArticle}"""` : 'Instruction: Make it more engaging/concise/viral.'}
    Content: """${currentContent}"""
    Output the new content directly.
    `;

    try {
        const response = await ai.models.generateContent({
            model: PRO_MODEL, // Gemini 3 Pro for high quality writing
            contents: prompt,
        });
        return response.text || currentContent;
    } catch (e) {
        return currentContent;
    }
};

// Cover Title Optimizer
export const regenerateCoverTitle = async (topic: string, currentTitle: string, apiKey?: string): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Task: Create 1 highly visual, punchy Cover Title (2-6 words) for a poster.
    Topic: "${topic}"
    Current: "${currentTitle}"
    Requirement: Short, Impactful, No Punctuation.
    Output: Just the text.
    `;

    try {
        const response = await ai.models.generateContent({
            model: FAST_MODEL, // Fast model is sufficient for short text
            contents: prompt,
        });
        return response.text?.trim().replace(/^"|"$/g, '') || currentTitle;
    } catch (e) {
        return currentTitle;
    }
};