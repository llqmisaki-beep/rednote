import { GoogleGenAI } from "@google/genai";
import { InputType, RednoteResponse, SearchResult, SearchSource, RednoteTone, MediaAnalysis } from "../types";

const apiKey = process.env.API_KEY;

// --- Model Configuration ---
const PRO_MODEL = 'gemini-3-pro-preview'; 
const FALLBACK_PRO = 'gemini-1.5-pro';
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

// Helper to handle Quota Exhaustion (429) by falling back
const runWithFallback = async <T>(
    primaryFn: () => Promise<T>, 
    fallbackFn: () => Promise<T>,
    contextName: string
): Promise<T> => {
    try {
        return await primaryFn();
    } catch (error: any) {
        if (error.message?.includes('429') || error.status === 429 || error.message?.includes('quota')) {
            console.warn(`[${contextName}] Quota exceeded for primary model. Switching to Fallback.`);
            return await fallbackFn();
        }
        throw error;
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
            prompt = `
            Task: Analyze Video URL: ${fileData.url}
            1. Summary
            2. 3-5 Core Points
            **LANGUAGE: SIMPLIFIED CHINESE.**
            Output JSON: { "summary": "...", "corePoints": ["..."] }
            `;
            parts = [{ text: prompt }];
            tools = [{ googleSearch: {} }]; 
        } else {
            prompt = `
            Analyze context.
            **LANGUAGE: SIMPLIFIED CHINESE.**
            Output JSON: { "summary": "...", "corePoints": ["..."] }
            `;
            const desc = fileData.description || "No description.";
            parts = [{ text: prompt + "\n\nContext: " + desc }];
        }
    } else if (inputType === 'Type B') {
        if (!fileData.base64) throw new Error("No PDF data.");
        prompt = `
        Analyze PDF.
        1. Summary
        2. 3-5 Core Points
        **LANGUAGE: SIMPLIFIED CHINESE.**
        Output JSON: { "summary": "...", "corePoints": ["..."] }
        `;
        parts = [
            { text: prompt },
            { inlineData: { mimeType: fileData.mimeType || 'application/pdf', data: fileData.base64 } }
        ];
    }

    const callModel = async (model: string) => {
        const response = await ai.models.generateContent({
            model, 
            contents: { parts },
            config: { responseMimeType: "application/json", tools }
        });
        return extractJSON(response.text || "{}") as MediaAnalysis;
    };

    return runWithFallback(
        () => callModel(PRO_MODEL),
        () => callModel(FAST_MODEL), // Fallback to Flash on 429
        "analyzeMedia"
    );
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
    Question: "${question}"
    Answer in Simplified Chinese.
    `;

    const callModel = async (model: string) => {
        const response = await ai.models.generateContent({ model, contents: prompt });
        return response.text || "No answer.";
    };

    return runWithFallback(
        () => callModel(PRO_MODEL),
        () => callModel(FAST_MODEL),
        "askAI"
    );
};

// --- Main Functions ---

export const searchTrends = async (query: string, sources: SearchSource[], customSource?: string, apiKey?: string): Promise<SearchResult[]> => {
  const finalKey = apiKey || process.env.API_KEY;
  if (!finalKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey: finalKey });

  let fullQuery = "";
  
  if (customSource && (customSource.startsWith('http') || customSource.includes('www'))) {
      fullQuery = `Analyze URL: ${customSource}. Extract Title, Summary, Main Image URL. **CHINESE**.`;
  } else {
      const platformKeywords: string[] = sources.map(s => {
        if (s === 'x') return 'site:twitter.com OR site:x.com';
        if (s === 'google') return ''; 
        return '';
      });
      if (customSource && customSource.trim()) platformKeywords.push(`site:${customSource.trim()}`);

      const sourceFilter = platformKeywords.filter(Boolean).join(' OR ');
      const qText = query || "Latest trending";
      fullQuery = `"${qText}" ${sourceFilter ? `(${sourceFilter})` : ''}`;
  }

  // Search always uses Flash for speed, but we can try Pro if user insists, 
  // but actually 429 suggests we should default to Flash for search anyway.
  // Keeping Flash as primary for search to save quota for generation.
  try {
    const response = await ai.models.generateContent({
      model: FAST_MODEL, 
      contents: `Task: ${fullQuery}. Return JSON with 'imageUrl'. **CHINESE**.`,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: SEARCH_SYSTEM_INSTRUCTION,
      },
    });
    const parsedData = extractJSON(response.text || "{}");
    let results: SearchResult[] = [];
    if (Array.isArray(parsedData)) results = parsedData;
    else if (parsedData.results && Array.isArray(parsedData.results)) results = parsedData.results;
    
    // Fallback Metadata
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    if (results.length === 0 && groundingChunks.length > 0) {
        return groundingChunks.map((chunk: any, idx: number) => ({
          id: String(idx),
          title: chunk.web?.title || "Result",
          snippet: "...",
          source: "Web",
          url: chunk.web?.uri,
          date: ""
        }));
    }
    return results.map((r, i) => ({
        id: r.id || String(i),
        title: r.title || "Title",
        snippet: r.snippet || "...",
        source: r.source || "Web",
        url: r.url, 
        date: r.date,
        imageUrl: r.imageUrl 
    }));
  } catch (error) {
    console.warn("Search failed", error);
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
  if (!finalKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey: finalKey });
  
  let toneInstruction = "";
  if (tone === 'imitate') {
      toneInstruction = `
      # Role: Viral Expert
      ## Ref Style: """${customRequirement || "Generic"}"""
      ## Topic: "${inputText}"
      ## Output: 5 Titles, Content mimicking ref.
      **CHINESE ONLY**
      `;
  } else {
      switch (tone) {
          case 'emotional': toneInstruction = "Tone: Emotional (家人们)."; break;
          case 'professional': toneInstruction = "Tone: Professional (干货)."; break;
          case 'speed': toneInstruction = "Tone: Urgent News (速递)."; break;
          case 'humorous': toneInstruction = "Tone: Funny."; break;
      }
  }

  let promptParts: any[] = [
      { text: `inputType: ${inputType}\n\n${toneInstruction}\n\n**IMPORTANT: OUTPUT IN SIMPLIFIED CHINESE.**` }
  ];
  
  if (contextData && contextData.analysis) {
      promptParts.push({ text: `\n\nAnalysis: ${contextData.analysis.summary}\nPoints: ${contextData.analysis.corePoints.join(', ')}` });
  }

  if (inputType === 'Type C' && contextData) {
      promptParts.push({ text: `\n\nSearch Context: ${JSON.stringify(contextData, null, 2)}` });
  } else if (inputType === 'Type A' && contextData) {
       promptParts.push({ text: `\n\nVisual Context: ${contextData.frameCount} frames.` });
  } else if (inputType === 'Type B' && contextData && contextData.fileData) {
      promptParts.push({ text: `\n\nAnalyze PDF.` });
      promptParts.push({ inlineData: { mimeType: contextData.mimeType || 'application/pdf', data: contextData.fileData } });
  } else {
      if (tone !== 'imitate') promptParts.push({ text: `Topic: ${inputText}` });
  }

  const callModel = async (model: string) => {
      const response = await ai.models.generateContent({
          model: model,
          contents: { parts: promptParts },
          config: { systemInstruction: SYSTEM_INSTRUCTION },
      });
      const safeJson = extractJSON(response.text || "{}") as any;
      if (!safeJson.content) safeJson.content = { title: "AI Note", fullText: response.text || "" };
      if (!safeJson.content.fullText) safeJson.content.fullText = safeJson.content.body || "";
      if (!Array.isArray(safeJson.content.titles_options)) safeJson.content.titles_options = [safeJson.content.title || "Title"];
      if (!safeJson.visualData) safeJson.visualData = { elements: { coverText: { main: safeJson.content.title, sub: "" } } };
      return safeJson as RednoteResponse;
  };

  return runWithFallback(
      () => callModel(PRO_MODEL),
      () => callModel(FAST_MODEL),
      "generateRednote"
  );
};

export const regenerateTitles = async (currentTopic: string, referenceTitle: string, apiKey?: string): Promise<string[]> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const prompt = `Generate 5 viral titles for: "${currentTopic}". Mimic: "${referenceTitle}". **CHINESE**. JSON Array.`;

    const callModel = async (model: string) => {
        const response = await ai.models.generateContent({ model, contents: prompt });
        const json = extractJSON(response.text || "[]");
        return Array.isArray(json) ? json : (json.titles || []);
    };
    // Titles are simple, default to Fast but fallback safely
    return runWithFallback(() => callModel(FAST_MODEL), () => callModel(FAST_MODEL), "regenerateTitles");
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
    Rewrite content.
    ${customInstruction ? `Instruction: "${customInstruction}"` : ''}
    ${referenceArticle ? `Ref Style: """${referenceArticle}"""` : ''}
    Content: """${currentContent}"""
    **CHINESE ONLY.**
    `;

    const callModel = async (model: string) => {
        const response = await ai.models.generateContent({ model, contents: prompt });
        return response.text || currentContent;
    };

    return runWithFallback(() => callModel(PRO_MODEL), () => callModel(FAST_MODEL), "rewriteContent");
};

export const regenerateCoverTitle = async (topic: string, currentTitle: string, apiKey?: string): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const prompt = `Create 1 punchy Cover Title (2-6 words) for "${topic}". Current: "${currentTitle}". **CHINESE**.`;

    const callModel = async (model: string) => {
        const response = await ai.models.generateContent({ model, contents: prompt });
        return response.text?.trim().replace(/^"|"$/g, '') || currentTitle;
    };
    return runWithFallback(() => callModel(FAST_MODEL), () => callModel(FAST_MODEL), "regenerateCoverTitle");
};