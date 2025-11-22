import { GoogleGenAI } from "@google/genai";
import { InputType, RednoteResponse, SearchResult, SearchSource, RednoteTone } from "../types";

const apiKey = process.env.API_KEY;

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
You are a ULTRA-FAST news aggregator.
**CRITICAL RULES:**
1. If the query is a URL, you MUST prioritize extracting information from that specific link.
2. **EXTRACT IMAGE:** Try to find the main article image URL (OG:Image) and return it in 'imageUrl'.
3. Return JSON only.
{
  "results": [
    { "id": "1", "title": "Title", "url": "...", "source": "...", "date": "...", "snippet": "...", "imageUrl": "..." }
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

// --- Main Functions ---

export const searchTrends = async (query: string, sources: SearchSource[], customSource?: string, apiKey?: string): Promise<SearchResult[]> => {
  const finalKey = apiKey || process.env.API_KEY;
  if (!finalKey) throw new Error("API Key 未设置。请点击右上角钥匙图标输入您的 Gemini API Key。");
  
  const ai = new GoogleGenAI({ apiKey: finalKey });

  let fullQuery = "";
  
  if (customSource && (customSource.startsWith('http') || customSource.includes('www'))) {
      fullQuery = `Analyze this specific URL: ${customSource}. Extract title, summary, and the Main Image URL.`;
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
      model: 'gemini-2.5-flash',
      contents: `Task: ${fullQuery}. 
      If it is a URL, extract the main content summary and imageUrl.
      If it is a keyword, list top 8 results.
      Return strictly JSON.`,
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
          title: chunk.web?.title || "搜索结果 / 链接分析",
          snippet: "已获取链接内容，点击生成笔记进行深度分析...",
          source: "Web Link",
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
      const referenceText = customRequirement || "No reference provided, use generic viral style.";
      toneInstruction = `
      # Role: 小红书爆款拆解与重构专家
      ## Reference Viral Text:
      """${referenceText}"""
      ## My Topic:
      "${inputText}"
      ## Output:
      1. 5 Viral Titles.
      2. Content mimicking the reference style exactly.
      `;
  } else {
      switch (tone) {
          case 'emotional': toneInstruction = "Tone: Emotional Resonance."; break;
          case 'professional': toneInstruction = "Tone: Professional Science."; break;
          case 'speed': toneInstruction = "Tone: News Speed."; break;
          case 'humorous': toneInstruction = "Tone: Humorous/Sarcastic."; break;
      }
  }

  let promptParts: any[] = [
      { text: `inputType: ${inputType}\n\n${toneInstruction}` }
  ];
  
  if (inputType === 'Type C' && contextData) {
      promptParts.push({ text: `\n\nSelected Search/Link Context: ${JSON.stringify(contextData, null, 2)}` });
  } else if (inputType === 'Type A' && contextData) {
       promptParts.push({ text: `\n\nVisual Context: ${contextData.frameCount} frames extracted from video.` });
  } else if (inputType === 'Type B' && contextData && contextData.fileData) {
      promptParts.push({ text: `\n\nAnalyze PDF content.` });
      promptParts.push({ inlineData: { mimeType: contextData.mimeType || 'application/pdf', data: contextData.fileData } });
  } else {
      if (tone !== 'imitate') promptParts.push({ text: `Topic: ${inputText}` });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
    Constraint: Mimic style of: "${referenceTitle || 'High Click-Through Rate styles'}".
    Format: Emoji + Keyword + Pain Point.
    Output: JSON array of strings.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        const json = extractJSON(response.text || "[]");
        return Array.isArray(json) ? json : (json.titles || []);
    } catch (e) {
        return ["生成失败", "请重试"];
    }
};

export const rewriteContent = async (currentContent: string, referenceArticle: string, apiKey?: string): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Role: Rednote Editor.
    Task: Rewrite/Improve the content below.
    ${referenceArticle ? `STYLE REFERENCE: """${referenceArticle}"""` : 'Instruction: Make it more viral.'}
    CONTENT: """${currentContent}"""
    Output the new content directly.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text || currentContent;
    } catch (e) {
        return currentContent;
    }
};

// New Function for Cover Title
export const regenerateCoverTitle = async (topic: string, currentTitle: string, apiKey?: string): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Task: Generate ONE extremely visually impactful "Cover Title" (Big Text) for a Rednote cover image.
    Topic: "${topic}"
    Current: "${currentTitle}"
    
    Requirements:
    1. Very short (2-6 words max).
    2. High impact, clickbait, emotional or shocking.
    3. Suitable for large poster text.
    
    Output: Just the text string.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text?.trim().replace(/^"|"$/g, '') || currentTitle;
    } catch (e) {
        return currentTitle;
    }
};