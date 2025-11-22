import { GoogleGenAI } from "@google/genai";
import { InputType, RednoteResponse, SearchResult, SearchSource, RednoteTone } from "../types";

const apiKey = process.env.API_KEY;

// --- System Instructions ---

const SYSTEM_INSTRUCTION = `
System Instruction: Rednote Creator Engine (Chinese Version)
1. Role: You are the "Rednote Creator". Transform inputs into viral Xiaohongshu posts.
**CRITICAL: OUTPUT MUST BE IN SIMPLIFIED CHINESE.**

2. Styles:
   - Emotional: Empathetic, use "家人们", "泪目".
   - Professional (Dry Goods): Academic, structured, "干货".
   - Speed (News): Flash news, concise, "速递", "刚刚".
   - Imitate: Strictly mimic the tone, sentence structure, and emoji usage of the provided reference text.

3. JSON Structure (Strict):
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
`;

// Optimized for extreme speed: Fewer results, shorter instruction
const SEARCH_SYSTEM_INSTRUCTION = `
FAST NEWS AGGREGATOR.
Return JSON. Snippets < 50 chars. EXACT URLs.
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

export const searchTrends = async (query: string, sources: SearchSource[], customSource?: string): Promise<SearchResult[]> => {
  if (!apiKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey });

  // Helper to extract domain for site: operator
  const getDomain = (url: string) => {
      try {
          const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
          return urlObj.hostname;
      } catch {
          return url; // Fallback to raw string if not a valid URL format
      }
  };

  const platformKeywords: string[] = sources.map(s => {
    if (s === 'x') return 'site:twitter.com OR site:x.com';
    if (s === 'youtube') return 'site:youtube.com';
    if (s === 'google') return ''; 
    return '';
  });

  // Add custom source if present
  if (customSource && customSource.trim()) {
      const domain = getDomain(customSource.trim());
      platformKeywords.push(`site:${domain}`);
  }

  const sourceFilter = platformKeywords.filter(Boolean).join(' OR ');
  const fullQuery = `"${query}" ${sourceFilter ? `(${sourceFilter})` : ''}`;

  try {
    // Optimized: Requesting top 8 results for speed (was 15)
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Search: ${fullQuery}. Return top 8 results JSON. Sort by Date.`,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: SEARCH_SYSTEM_INSTRUCTION,
      },
    });

    const parsedData = extractJSON(response.text || "{}");
    let results: SearchResult[] = [];

    if (Array.isArray(parsedData)) results = parsedData;
    else if (parsedData.results && Array.isArray(parsedData.results)) results = parsedData.results;

    // Fallback to Grounding Metadata (often faster/more reliable for URLs)
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    if (results.length === 0 && groundingChunks.length > 0) {
        return groundingChunks.map((chunk: any, idx: number) => ({
          id: String(idx),
          title: chunk.web?.title || "搜索结果",
          snippet: "点击标题查看详情...",
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
  customRequirement?: string
): Promise<RednoteResponse> => {
  if (!apiKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey });
  
  let toneInstruction = "";
  if (tone === 'imitate' && customRequirement) {
      toneInstruction = `STYLE MIMICRY MODE.
      REFERENCE TEXT TO MIMIC: """${customRequirement}"""
      INSTRUCTION: Analyze the writing style, emoji usage, sentence length, and tone of the REFERENCE TEXT. 
      Generate the new content for the User Topic strictly adhering to this style.`;
  } else {
      switch (tone) {
          case 'emotional': toneInstruction = "Tone: Emotional Resonance (情感共鸣). Focus on feelings, empathy, '家人们'."; break;
          case 'professional': toneInstruction = "Tone: Dry Goods Science (干货科普). Structured, objective, educational."; break;
          case 'speed': toneInstruction = "Tone: News Speed (速递). Urgent, 'Just in', 'Breaking', concise."; break;
          case 'humorous': toneInstruction = "Tone: Humorous/Sarcastic."; break;
      }
  }

  let promptParts: any[] = [
      { text: `inputType: ${inputType}\nUser Topic/Notes: ${inputText}\n\n${toneInstruction}` }
  ];
  
  if (inputType === 'Type C' && contextData) {
      promptParts.push({ text: `\n\nSelected Search Context: ${JSON.stringify(contextData, null, 2)}` });
  } else if (inputType === 'Type A' && contextData) {
       promptParts.push({ text: `\n\nVisual Context: ${contextData.frameCount} frames extracted from video.` });
  } else if (inputType === 'Type B' && contextData && contextData.fileData) {
      promptParts.push({ text: `\n\nAnalyze PDF. Extract title, abstract, methodology, conclusion.` });
      promptParts.push({ inlineData: { mimeType: contextData.mimeType || 'application/pdf', data: contextData.fileData } });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: promptParts },
      config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json" },
    });

    const safeJson = extractJSON(response.text || "{}") as any;
    
    // Basic Sanitization
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

// --- New Regeneration Functions ---

export const regenerateTitles = async (currentTopic: string, referenceTitle: string): Promise<string[]> => {
    if (!apiKey) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
    Task: Generate 5 viral Xiaohongshu titles for the topic: "${currentTopic}".
    Constraint: You MUST mimic the style/structure/shock-factor of this REFERENCE TITLE: "${referenceTitle}".
    Output: JSON array of strings.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const json = extractJSON(response.text || "[]");
        return Array.isArray(json) ? json : (json.titles || []);
    } catch (e) {
        console.error(e);
        return ["生成失败", "请重试"];
    }
};

export const rewriteContent = async (currentContent: string, referenceArticle: string): Promise<string> => {
    if (!apiKey) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
    Task: Rewrite the following content to match the writing style of the Reference Article.
    
    ORIGINAL CONTENT:
    ${currentContent}

    REFERENCE ARTICLE (Mimic this style):
    ${referenceArticle}

    INSTRUCTION:
    - Keep the core information of the Original Content.
    - Apply the tone, sentence structure, formatting, and emoji usage of the Reference Article.
    - Output only the rewriten text.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text || currentContent;
    } catch (e) {
        console.error(e);
        return currentContent;
    }
};