import { GoogleGenAI } from "@google/genai";
import { InputType, RednoteResponse, SearchResult, SearchSource, RednoteTone, MediaAnalysis } from "../types";

const apiKey = process.env.API_KEY;

const PRO_MODEL = 'gemini-3-pro-preview'; 
const FALLBACK_PRO = 'gemini-1.5-pro';
const FAST_MODEL = 'gemini-2.5-flash'; 

const SYSTEM_INSTRUCTION = `
System Instruction: Rednote Creator Engine (Chinese Version)
1. Role: You are the "Rednote Creator". Transform inputs into viral Xiaohongshu posts.
**CRITICAL: OUTPUT MUST BE IN SIMPLIFIED CHINESE.**
2. JSON Structure (Strict): { ... } (Standard JSON)
`;

const SEARCH_SYSTEM_INSTRUCTION = `
You are a smart news aggregator & content parser.
Rules:
1. IMAGE IS PRIORITY: Find OG:Image.
2. URL Analysis: Summarize specific page.
3. Return JSON only.
`;

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

const runWithFallback = async <T>(
    operation: (model: string) => Promise<T>, 
    context: string
): Promise<T> => {
    try {
        return await operation(PRO_MODEL);
    } catch (error: any) {
        if (error.message?.includes('429') || error.status === 429 || error.message?.includes('quota') || error.message?.includes('503')) {
            console.warn(`[${context}] Pro Model failed, switching to Fallback...`);
            try {
                return await operation(FAST_MODEL);
            } catch (fallbackError: any) {
                throw fallbackError;
            }
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
    let config: any = {};

    if (inputType === 'Type A') {
        if (fileData.url) {
            // 1. URL Analysis (Strict Mode)
            prompt = `
            # Role: Video Content Auditor
            # Task: Analyze this Video URL: ${fileData.url}
            
            Use Google Search to find the *specific* video title, transcript, summary, or reviews.
            
            **CRITICAL INSTRUCTION:**
            - If you CANNOT find specific details about THIS exact video, output: { "summary": "PARSE_FAILED", "corePoints": [] }
            - Do NOT hallucinate or guess.
            - If found, summarize in Simplified Chinese.
            
            Output JSON: { "summary": "...", "corePoints": ["...", "..."] }
            `;
            parts = [{ text: prompt }];
            tools = [{ googleSearch: {} }];
            config = { tools: tools }; 
        } else if (fileData.frames && Array.isArray(fileData.frames)) {
            // 2. Frame-based Visual Analysis (Multimodal)
            prompt = `
            # Role: Visual Content Expert
            # Task: Analyze these ${fileData.frames.length} keyframes extracted from a video.
            
            Context provided by user: "${fileData.description || 'None'}"
            
            **INSTRUCTIONS:**
            1. **OCR & Vision**: Read any visible text/subtitles on the frames. Analyze the visual action/scene.
            2. **Reconstruct**: Based on the visual sequence and text, infer the video's core topic.
            3. **Report**:
               - Summary: What is happening?
               - Core Points: Key visual information, text on screen, or actions observed.
            
            **LANGUAGE: SIMPLIFIED CHINESE.**
            Output JSON: { "summary": "...", "corePoints": ["...", "..."] }
            `;
            
            parts = [{ text: prompt }];
            // Append all frames as image parts
            fileData.frames.forEach((frameUrl: string) => {
                if (frameUrl.startsWith('data:image')) {
                    const base64 = frameUrl.split(',')[1];
                    const mimeType = frameUrl.substring(frameUrl.indexOf(':') + 1, frameUrl.indexOf(';'));
                    parts.push({ inlineData: { mimeType, data: base64 } });
                }
            });
            config = { responseMimeType: "application/json" };
        } else {
            // Fallback text-only
            prompt = `Analyze video context: ${fileData.description || "No context"}. JSON Output.`;
            parts = [{ text: prompt }];
            config = { responseMimeType: "application/json" };
        }
    } else if (inputType === 'Type B') {
        // PDF Analysis
        if (!fileData.base64) throw new Error("No PDF file data found.");
        prompt = `Analyze PDF. Summary + 3 Core Points. Chinese. JSON.`;
        parts = [
            { text: prompt },
            { inlineData: { mimeType: fileData.mimeType || 'application/pdf', data: fileData.base64 } }
        ];
        config = { responseMimeType: "application/json" };
    }

    return runWithFallback(async (model) => {
        const response = await ai.models.generateContent({
            model, 
            contents: { parts },
            config
        });
        const res = extractJSON(response.text || "{}") as MediaAnalysis;
        
        // Handle Explicit Failure Signal
        if (res.summary === "PARSE_FAILED") {
            throw new Error("无法解析该视频链接内容，请检查链接有效性或尝试上传本地视频。");
        }
        return res;
    }, "analyzeMedia");
};

export const askAI = async (
    contextText: string, 
    question: string, 
    apiKey?: string
): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const prompt = `Context: """${contextText}"""\nQuestion: "${question}"\nAnswer in Simplified Chinese.`;

    return runWithFallback(async (model) => {
        const response = await ai.models.generateContent({ model, contents: prompt });
        return response.text || "No answer generated.";
    }, "askAI");
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

  return runWithFallback(async (model) => {
    // Search uses FAST_MODEL by default via fallback logic if PRO fails, but usually PRO works for logic
    // Note: Using PRO for search might burn quota fast.
    // However, the instruction says "Use PRO for everything".
    const response = await ai.models.generateContent({
      model, // Will start with PRO
      contents: `Task: ${fullQuery}. Return strictly JSON list with 'imageUrl'. **CHINESE**.`,
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
  }, "searchTrends");
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
      toneInstruction = `Role: Viral Expert. Ref Style: """${customRequirement || "Generic"}""". Topic: "${inputText}". Output: 5 Titles, Content mimicking ref. **CHINESE ONLY**`;
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
      promptParts.push({ text: `\n\n# DEEP ANALYSIS CONTEXT (Primary Source):\nSummary: ${contextData.analysis.summary}\nCore Breakdown: ${contextData.analysis.corePoints.join('\n')}` });
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

  return runWithFallback(async (model) => {
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
  }, "generateRednote");
};

export const regenerateTitles = async (currentTopic: string, referenceTitle: string, apiKey?: string): Promise<string[]> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const prompt = `Generate 5 viral titles for: "${currentTopic}". Mimic: "${referenceTitle}". **CHINESE**. JSON Array.`;

    return runWithFallback(async (model) => {
        const response = await ai.models.generateContent({ model, contents: prompt });
        const json = extractJSON(response.text || "[]");
        return Array.isArray(json) ? json : (json.titles || []);
    }, "regenerateTitles");
};

export const rewriteContent = async (
    currentContent: string, 
    referenceArticle: string, 
    customInstruction: string,
    apiKey?: string
): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const prompt = `Rewrite content. ${customInstruction ? `Instruction: "${customInstruction}"` : ''} ${referenceArticle ? `Ref Style: """${referenceArticle}"""` : ''} Content: """${currentContent}""" **CHINESE ONLY.**`;

    return runWithFallback(async (model) => {
        const response = await ai.models.generateContent({ model, contents: prompt });
        return response.text || currentContent;
    }, "rewriteContent");
};

export const regenerateCoverTitle = async (topic: string, currentTitle: string, apiKey?: string): Promise<string> => {
    const finalKey = apiKey || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: finalKey });
    const prompt = `Create 1 punchy Cover Title (2-6 words) for "${topic}". Current: "${currentTitle}". **CHINESE**.`;

    return runWithFallback(async (model) => {
        const response = await ai.models.generateContent({ model, contents: prompt });
        return response.text?.trim().replace(/^"|"$/g, '') || currentTitle;
    }, "regenerateCoverTitle");
};