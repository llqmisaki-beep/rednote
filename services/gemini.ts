import { GoogleGenAI } from "@google/genai";
import { InputType, RednoteResponse, SearchResult, SearchSource, RednoteTone, MediaAnalysis } from "../types";

const apiKey = process.env.API_KEY;

// --- Model Configuration ---
// STRICT REQUIREMENT: Global usage of 'gemini-3-pro-preview' for ALL tasks.
const MODEL_NAME = 'gemini-3-pro-preview'; 

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
      "knowledgePoints": ["Point 1", "Point 2", "Point 3"],
      "literatureInfo": { "titleEn": "Eng Title", "abstractCn": "Abstract", "citation": "Source" }
    }
  }
}
Return ONLY valid JSON. No markdown formatting.
`;

const SEARCH_SYSTEM_INSTRUCTION = `
You are a smart news aggregator & content parser.
**CRITICAL RULES:**
1. **IMAGE IS PRIORITY**: Try to find the main article image (OpenGraph Image, Hero Image) URL. Return it in 'imageUrl'.
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

// --- Analysis Functions ---

export const analyzeMedia = async (
    inputType: 'Type A' | 'Type B', 
    fileData: any, 
    apiKey?: string
): Promise<MediaAnalysis> => {
    const finalKey = apiKey || process.env.API_KEY;
    if (!finalKey) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: finalKey });

    let prompt = "";
    let parts: any[] = [];
    let tools: any[] | undefined = undefined;

    if (inputType === 'Type A') {
        if (fileData.url) {
            // Video URL Analysis (Force Parse via Search)
            prompt = `
            Task: Analyze the content of this Video URL: ${fileData.url}
            1. What is this video about? (Summary)
            2. Extract 3-5 Core Key Points / Takeaways from the video content.
            **LANGUAGE: SIMPLIFIED CHINESE ONLY.**
            Output JSON: { "summary": "...", "corePoints": ["...", "..."] }
            `;
            parts = [{ text: prompt }];
            tools = [{ googleSearch: {} }]; // Enable search to read the URL
        } else {
            // Video Description Analysis
            prompt = `
            Analyze this video description/transcript context.
            **LANGUAGE: SIMPLIFIED CHINESE ONLY.**
            Output JSON: { "summary": "...", "corePoints": ["...", "..."] }
            `;
            const desc = fileData.description || "No description provided.";
            parts = [{ text: prompt + "\n\nContext: " + desc }];
        }
    } else if (inputType === 'Type B') {
        // PDF Analysis
        if (!fileData.base64) throw new Error("No PDF file data found.");
        prompt = `
        Analyze the attached PDF document.
        1. Summarize the abstract/intro.
        2. Extract 3-5 Core Key Points.
        **LANGUAGE: SIMPLIFIED CHINESE ONLY.**
        Output JSON: { "summary": "...", "corePoints": ["...", "..."] }
        `;
        parts = [
            { text: prompt },
            { inlineData: { mimeType: fileData.mimeType || 'application/pdf', data: fileData.base64 } }
        ];
    }

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME, 
            contents: { parts },
            config: { 
                responseMimeType: "application/json",
                tools: tools 
            }
        });
        return extractJSON(response.text || "{}") as MediaAnalysis;
    } catch (e: any) {
        console.error("Analysis failed:", e);
        throw new Error(`Analysis failed: ${e.message}`);
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
    **LANGUAGE: SIMPLIFIED CHINESE ONLY.**
    `;

    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
        return response.text || "No answer generated.";
    } catch {
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
      Task 2: Extract the MAIN HERO IMAGE URL (start with http).
      **LANGUAGE: SIMPLIFIED CHINESE.**`;
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
      model: MODEL_NAME,
      contents: `Task: ${fullQuery}. 
      Return strictly JSON list with 'imageUrl' if found.
      **LANGUAGE: SIMPLIFIED CHINESE.**`,
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
        imageUrl: r.imageUrl // Ensure this is passed
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
      **LANGUAGE: SIMPLIFIED CHINESE.**
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
      { text: `inputType: ${inputType}\n\n${toneInstruction}\n\n**IMPORTANT: OUTPUT IN SIMPLIFIED CHINESE.**` }
  ];
  
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
          model: MODEL_NAME,
          contents: { parts: promptParts },
          config: { systemInstruction: SYSTEM_INSTRUCTION },
      });
      const safeJson = extractJSON(response.text || "{}") as any;
      if (!safeJson.content) safeJson.content = { title: "AI Note", fullText: response.text || "" };
      if (!safeJson.content.fullText) safeJson.content.fullText = safeJson.content.body || "";
      if (!Array.isArray(safeJson.content.titles_options)) safeJson.content.titles_options = [safeJson.content.title || "Title"];
      if (!safeJson.visualData) safeJson.visualData = { elements: { coverText: { main: safeJson.content.title, sub: "" } } };
      return safeJson as RednoteResponse;
  } catch (e) {
      console.error("Generation failed", e);
      throw e;
  }
};

export const regenerateTitles = async (currentTopic: string, referenceTitle: string, apiKey?: string): Promise<string[]> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Task: Generate 5 NEW viral Xiaohongshu titles for: "${currentTopic}".
    Mimic style: "${referenceTitle}".
    Format: Emoji + Text.
    **LANGUAGE: SIMPLIFIED CHINESE.**
    Output: JSON array of strings.
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });
        const json = extractJSON(response.text || "[]");
        return Array.isArray(json) ? json : (json.titles || []);
    } catch (e) {
        return ["生成失败"];
    }
};

export const rewriteContent = async (
    currentContent: string, 
    referenceArticle: string, 
    customInstruction: string,
    apiKey?: string
): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Role: Rednote Editor.
    Task: Rewrite the content below.
    
    ${customInstruction ? `Custom Instruction: "${customInstruction}"` : ''}
    ${referenceArticle ? `Style Reference: """${referenceArticle}"""` : ''}
    
    Content to Rewrite:
    """${currentContent}"""
    
    **LANGUAGE: SIMPLIFIED CHINESE.**
    Output the new content directly.
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });
        return response.text || currentContent;
    } catch (e) {
        return currentContent;
    }
};

export const regenerateCoverTitle = async (topic: string, currentTitle: string, apiKey?: string): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });

    const prompt = `
    Task: Create 1 highly visual, punchy Cover Title (2-6 words) for a poster.
    Topic: "${topic}"
    Current: "${currentTitle}"
    Requirement: Short, Impactful, No Punctuation.
    **LANGUAGE: SIMPLIFIED CHINESE.**
    Output: Just the text.
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });
        return response.text?.trim().replace(/^"|"$/g, '') || currentTitle;
    } catch (e) {
        return currentTitle;
    }
};