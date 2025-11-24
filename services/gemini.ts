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

const extractJSON = (text: string): any => {
  let jsonString = text;
  try {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (match) jsonString = match[1];
    return JSON.parse(jsonString);
  } catch (e) {
    console.warn("JSON Parse Failed, attempting salvage...", text);
    if (!text.trim().startsWith('{')) {
         return { 
             content: { 
                 title: "生成结果", 
                 titles_options: ["生成结果"], 
                 fullText: text, 
                 tags: [] 
             },
             visualData: { elements: { coverText: { main: "生成成功", sub: "" } } }
         };
    }
    throw new Error("无法解析返回内容，请重试");
  }
};

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
        if (data.url) {
            prompt = `Role: Video Analyst. Analyze this URL: ${data.url}. Output JSON: { "summary": "...", "corePoints": ["..."] }`;
            parts = [{ text: prompt }];
            tools = [{ googleSearch: {} }];
            delete config.responseMimeType; 
        } else {
            // If we have a file object (simulated here as description since we can't upload bytes easily without File API setup in node)
            // For browser, we handle file reading in App.tsx and pass base64/text here. 
            // Assuming 'description' contains text context or we rely on filename context if local.
            prompt = `Role: Video Analyst. Analyze context. Output JSON: { "summary": "...", "corePoints": ["..."] }`;
            parts = [{ text: prompt + `\nContext: ${data.description || "Local Video File"}` }];
        }
    } else if (inputType === 'Type B') {
        if (!data.base64) throw new Error("PDF数据丢失");
        prompt = `Role: Academic Analyst. Analyze PDF. Output JSON: { "summary": "...", "corePoints": ["..."] }`;
        parts = [
            { text: prompt },
            { inlineData: { mimeType: data.mimeType || 'application/pdf', data: data.base64 } }
        ];
    } else if (inputType === 'Type C') {
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
        if (result.content && !result.summary) {
             return { summary: result.content.fullText || "Analysis Done", corePoints: ["Check content"] };
        }
        return result as MediaAnalysis;
    } catch (e: any) {
        throw new Error(`智能分析失败: ${e.message}`);
    }
};

export const searchTrends = async (query: string, sources: SearchSource[], customSource?: string, apiKey?: string): Promise<SearchResult[]> => {
  const finalKey = apiKey || process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: finalKey });

  let searchQuery = query;
  const siteMap: Record<string, string> = { 'x': 'site:twitter.com OR site:x.com', 'google': '' };
  const siteFilters = sources.map(s => siteMap[s]).filter(Boolean).join(' OR ');
  if (siteFilters) searchQuery += ` (${siteFilters})`;
  if (customSource) searchQuery = `site:${customSource} ${query}`;

  const prompt = `Find 20 latest news/posts for: "${searchQuery}". Return JSON List: [{ "id": "1", "title": "...", "source": "Google/X", "date": "2h ago", "snippet": "...", "url": "..." }] Strictly JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: PRO_MODEL, 
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }, 
    });
    const json = extractJSON(response.text || "[]");
    let list = Array.isArray(json) ? json : (json.results || []);
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
    return [];
  }
};

export const generateRednote = async (
  inputType: InputType,
  analysisResult: MediaAnalysis,
  tone: RednoteTone,
  customReq?: string,
  apiKey?: string
): Promise<RednoteResponse> => {
  const finalKey = apiKey || process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: finalKey });

  // STRICT PROMPT
  const prompt = `
  # SOURCE MATERIAL (TRUTH)
  Summary: """${analysisResult.summary}"""
  Key Points: """${analysisResult.corePoints.join(', ')}"""

  # TASK
  Write a viral Little Red Book (Xiaohongshu) post based **ONLY** on the Source Material above.
  Do NOT invent facts. Do NOT hallucinate. Use the style "${tone}".
  ${customReq ? `Extra Requirement: ${customReq}` : ''}

  # OUTPUT
  Strict JSON format defined in System Instruction.
  **SIMPLIFIED CHINESE ONLY.**
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
    if (!data.content) data.content = {};
    if (!data.content.fullText) data.content.fullText = data.body || "";
    return data as RednoteResponse;
  } catch (e: any) {
    throw new Error(`生成失败: ${e.message}`);
  }
};

export const regenerateTitles = async (topic: string, ref: string, key?: string) => {
    const finalKey = key || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const response = await ai.models.generateContent({
        model: PRO_MODEL,
        contents: `Generate 5 viral titles for "${topic}" mimicking "${ref}". JSON Array. **SIMPLIFIED CHINESE ONLY.**`,
        config: { responseMimeType: "application/json" }
    });
    return extractJSON(response.text || "[]");
};

export const rewriteContent = async (content: string, ref: string, custom: string, key?: string) => {
     const finalKey = key || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const response = await ai.models.generateContent({
        model: PRO_MODEL,
        contents: `Rewrite this: "${content}". Custom: ${custom}. Ref: ${ref}. Output text only. **SIMPLIFIED CHINESE ONLY.**`,
    });
    return response.text || content;
};

export const regenerateCoverTitle = async (topic: string, curr: string, key?: string) => {
    const finalKey = key || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const response = await ai.models.generateContent({
        model: PRO_MODEL,
        contents: `Create 1 short punchy cover title for "${topic}". Current: "${curr}". Text only. **SIMPLIFIED CHINESE ONLY.**`,
    });
    return response.text || curr;
};

export const askAI = async (context: string, question: string, key?: string) => {
    const finalKey = key || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const response = await ai.models.generateContent({
        model: PRO_MODEL,
        contents: `Context: ${context}\nQuestion: ${question}\nAnswer concisely in Simplified Chinese.`,
    });
    return response.text || "无回答";
};