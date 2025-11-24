import { GoogleGenAI } from "@google/genai";
import { InputType, RednoteResponse, SearchResult, SearchSource, RednoteTone, MediaAnalysis } from "../types";

const apiKey = process.env.API_KEY;

// STRICTLY USE GEMINI 3 PRO PREVIEW FOR EVERYTHING
const PRO_MODEL = 'gemini-3-pro-preview'; 

const SYSTEM_INSTRUCTION = `
System Instruction: Rednote Creator Engine (Chinese Version)
Role: Expert Rednote Creator.
**CRITICAL: OUTPUT SIMPLIFIED CHINESE.**
JSON Format: {
  "content": { "title": "...", "titles_options": [], "coreIdea": "...", "fullText": "...", "tags": [] },
  "visualData": { "elements": { "coverText": { "main": "...", "sub": "..." }, "knowledgePoints": [] } }
}
`;

// Robust JSON extractor with String-to-Object Fallback
const extractJSON = (text: string): any => {
  let jsonString = text;
  try {
    // Try to find code block
    const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (match) jsonString = match[1];
    
    // Attempt clean parse
    return JSON.parse(jsonString);
  } catch (e) {
    console.warn("JSON Parse Failed, attempting salvage...", text);
    // If it's just a raw string, wrap it
    if (!text.trim().startsWith('{')) {
         return { 
             content: { 
                 title: "生成结果", 
                 titles_options: ["生成结果"], 
                 fullText: text, 
                 tags: [] 
             },
             visualData: { elements: { coverText: { main: "生成结果", sub: "" } } }
         };
    }
    throw new Error("无法解析返回内容，请重试");
  }
};

// --- 1. INTELLIGENT ANALYSIS (Unified for all types) ---
export const analyzeMedia = async (
    inputType: InputType, 
    data: any, 
    apiKey?: string
): Promise<MediaAnalysis> => {
    const finalKey = apiKey || process.env.API_KEY;
    if (!finalKey) throw new Error("请配置 API Key");
    const ai = new GoogleGenAI({ apiKey: finalKey });

    let prompt = "";
    let parts: any[] = [];
    let tools: any[] | undefined = undefined;
    let config: any = { responseMimeType: "application/json" };

    if (inputType === 'Type A') {
        // Video
        if (data.url) {
            prompt = `Role: Video Analyst. Analyze this URL: ${data.url}. Output JSON: { "summary": "...", "corePoints": ["..."] }`;
            parts = [{ text: prompt }];
            tools = [{ googleSearch: {} }];
            delete config.responseMimeType; // Search tool incompatible with JSON mime
        } else {
            prompt = `Role: Video Analyst. Analyze frames/description. Output JSON: { "summary": "...", "corePoints": ["..."] }`;
            parts = [{ text: prompt + `\nDesc: ${data.description}` }];
            // If frames exist (handled in App, passed as description or separate vision logic)
        }
    } else if (inputType === 'Type B') {
        // PDF
        if (!data.base64) throw new Error("PDF数据丢失");
        prompt = `Role: Academic Analyst. Analyze PDF. Output JSON: { "summary": "...", "corePoints": ["..."] }`;
        parts = [
            { text: prompt },
            { inlineData: { mimeType: data.mimeType || 'application/pdf', data: data.base64 } }
        ];
    } else if (inputType === 'Type C') {
        // Search Results Analysis
        prompt = `Role: Trend Analyst. Analyze these search results to find the core trend/story.
        Context: ${JSON.stringify(data.searchResults)}
        Output JSON: { "summary": "...", "corePoints": ["..."] }`;
        parts = [{ text: prompt }];
    }

    try {
        const response = await ai.models.generateContent({
            model: PRO_MODEL,
            contents: { parts },
            config: { ...config, tools }
        });
        
        const result = extractJSON(response.text || "{}");
        
        // Handle string fallback from extractJSON if extraction failed differently
        if (result.content && !result.summary) {
             return { summary: result.content.fullText || "Analysis Done", corePoints: ["Check content"] };
        }
        
        return result as MediaAnalysis;
    } catch (e: any) {
        throw new Error(`智能分析失败: ${e.message}`);
    }
};

// --- 2. SEARCH (Type C) ---
export const searchTrends = async (query: string, sources: SearchSource[], customSource?: string, apiKey?: string): Promise<SearchResult[]> => {
  const finalKey = apiKey || process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: finalKey });

  let searchQuery = query;
  // Platform filtering
  const siteMap: Record<string, string> = {
      'x': 'site:twitter.com OR site:x.com',
      'google': '' // General
  };
  
  const siteFilters = sources.map(s => siteMap[s]).filter(Boolean).join(' OR ');
  if (siteFilters) searchQuery += ` (${siteFilters})`;
  if (customSource) searchQuery = `site:${customSource} ${query}`;

  const prompt = `
  Find 20 latest news/posts for: "${searchQuery}".
  Return JSON List:
  [
    { "id": "1", "title": "...", "source": "Google/X", "date": "2h ago", "snippet": "...", "url": "..." }
  ]
  Strictly JSON.
  `;

  try {
    // Search MUST use Flash or Pro with Tools. Using Pro as requested for "Analysis" but Search is tool-heavy.
    // Preview models often have better tool adherence.
    const response = await ai.models.generateContent({
      model: PRO_MODEL, 
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }, // No JSON mime with tools
    });

    const json = extractJSON(response.text || "[]");
    let list = Array.isArray(json) ? json : (json.results || []);
    
    // Ensure 20 items if possible (model might return fewer)
    return list.map((item: any, i: number) => ({
        id: String(i),
        title: item.title || "No Title",
        snippet: item.snippet || "...",
        source: item.source || "Web",
        url: item.url || "#",
        date: item.date || "Recently",
        imageUrl: item.imageUrl
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
};

// --- 3. GENERATE COPY (From Analysis) ---
export const generateRednote = async (
  inputType: InputType,
  analysisResult: MediaAnalysis,
  tone: RednoteTone,
  customReq?: string,
  apiKey?: string
): Promise<RednoteResponse> => {
  const finalKey = apiKey || process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: finalKey });

  const prompt = `
  Based on this Analysis:
  Summary: ${analysisResult.summary}
  Points: ${analysisResult.corePoints.join(', ')}

  Task: Write a Viral Rednote.
  Tone: ${tone}
  ${customReq ? `Custom Requirement: ${customReq}` : ''}

  Output JSON (Strict Schema defined in System Instruction).
  `;

  try {
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: prompt,
      config: { 
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json"
      },
    });

    let data = extractJSON(response.text || "{}");
    
    // Fix: "cannot create property fulltext on string"
    // If data is a string (model failed to output JSON object), wrap it.
    if (typeof data === 'string') {
        data = {
            content: {
                title: "AI 生成内容",
                titles_options: ["AI 生成内容"],
                coreIdea: "自动生成",
                fullText: data,
                tags: []
            },
            visualData: { elements: { coverText: { main: "生成成功", sub: "" } } }
        };
    }
    
    // Double check structure
    if (!data.content) data.content = {};
    if (!data.content.fullText) data.content.fullText = data.body || "";
    
    return data as RednoteResponse;
  } catch (e: any) {
    throw new Error(`生成失败: ${e.message}`);
  }
};

// ... (Keep rewrite/regenerate functions using PRO_MODEL similar to generateRednote logic)
export const regenerateTitles = async (topic: string, ref: string, key?: string) => {
    // ... implementation using PRO_MODEL
    const finalKey = key || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const response = await ai.models.generateContent({
        model: PRO_MODEL,
        contents: `Generate 5 titles for "${topic}" mimicking "${ref}". JSON Array.`,
        config: { responseMimeType: "application/json" }
    });
    return extractJSON(response.text || "[]");
};

export const rewriteContent = async (content: string, ref: string, custom: string, key?: string) => {
     const finalKey = key || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const response = await ai.models.generateContent({
        model: PRO_MODEL,
        contents: `Rewrite this: "${content}". Custom: ${custom}. Ref: ${ref}. Output text only.`,
    });
    return response.text || content;
};

export const regenerateCoverTitle = async (topic: string, curr: string, key?: string) => {
    const finalKey = key || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const response = await ai.models.generateContent({
        model: PRO_MODEL,
        contents: `Create 1 short cover title for "${topic}". Current: "${curr}". Text only.`,
    });
    return response.text || curr;
};

export const askAI = async (context: string, question: string, key?: string) => {
    const finalKey = key || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const response = await ai.models.generateContent({
        model: PRO_MODEL,
        contents: `Context: ${context}\nQuestion: ${question}\nAnswer concisely.`,
    });
    return response.text || "No answer";
};