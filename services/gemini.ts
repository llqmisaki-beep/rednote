import { GoogleGenAI } from "@google/genai";
import { InputType, RednoteResponse, SearchResult, SearchSource, RednoteTone, MediaAnalysis } from "../types";

const apiKey = process.env.API_KEY;

// --- Model Configuration ---
const PRO_MODEL = 'gemini-3-pro-preview'; 
const FAST_MODEL = 'gemini-2.5-flash'; 
// Fallbacks in case the preview model is unstable
const FALLBACK_PRO = 'gemini-1.5-pro';

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

// Robust Fallback Wrapper
const runWithFallback = async <T>(
    operation: (model: string) => Promise<T>, 
    context: string
): Promise<T> => {
    try {
        return await operation(PRO_MODEL);
    } catch (error: any) {
        // Fallback if Pro Preview fails (404, 429, 503)
        console.warn(`[${context}] Primary model failed (${error.message}), switching to Fallback...`);
        try {
            return await operation(FALLBACK_PRO); // Try stable Pro
        } catch (e2) {
            return await operation(FAST_MODEL); // Try Flash as last resort
        }
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
            // 1. VIDEO URL ANALYSIS PROMPT (Force Parse)
            prompt = `
            # Role: Senior Content Analysis Expert (资深内容分析专家)
            
            # Task
            Deeply analyze the content of this Video URL: ${fileData.url}
            Since you cannot watch the video stream directly, use Google Search to find its title, description, transcript, comments, and summaries.
            
            # Output Requirements (Strict JSON)
            Please output a JSON object with the following fields (in Simplified Chinese):
            
            1. "summary": **Core Theme Summary** (One sentence summarizing what the video is about).
            2. "corePoints": An array of strings containing the **Detailed Breakdown**:
               - "🛠️ Tools/Software: [List specific tool names]"
               - "▶️ Workflow: Step 1..., Step 2..."
               - "⚠️ Pitfalls: [Common mistakes mentioned]"
               - "📊 Data/Cost: [Revenue, Cost, Time data if available]"
            
            **LANGUAGE: SIMPLIFIED CHINESE ONLY.**
            Output JSON: { "summary": "...", "corePoints": ["...", "..."] }
            `;
            parts = [{ text: prompt }];
            tools = [{ googleSearch: {} }]; 
            config = { tools: tools }; // No responseMimeType with tools
        } else {
            // 2. VIDEO DESCRIPTION/FILE PROMPT
            prompt = `
            # Role: Senior Content Analysis Expert
            # Task: Analyze this video context/transcript.
            
            # Output Requirements (Strict JSON):
            1. "summary": One sentence core theme.
            2. "corePoints": [
               "Tools/Software mentioned",
               "Step-by-step Workflow",
               "Pitfalls/Warnings",
               "Data/Cost Analysis"
            ]
            
            **LANGUAGE: SIMPLIFIED CHINESE.**
            Output JSON: { "summary": "...", "corePoints": ["...", "..."] }
            `;
            const desc = fileData.description || "No description provided.";
            parts = [{ text: prompt + "\n\nContext: " + desc }];
            config = { responseMimeType: "application/json" };
        }
    } else if (inputType === 'Type B') {
        // 3. PDF ANALYSIS PROMPT
        if (!fileData.base64) throw new Error("No PDF file data found.");
        prompt = `
        # Role: Academic/Content Analyst
        # Task: Analyze the attached document.
        
        # Output Requirements (Strict JSON):
        1. "summary": Abstract/Intro summary.
        2. "corePoints": [
           "Key Methodology/Arguments",
           "Important Data/Findings",
           "Conclusions",
           "Practical Applications"
        ]
        
        **LANGUAGE: SIMPLIFIED CHINESE.**
        Output JSON: { "summary": "...", "corePoints": ["...", "..."] }
        `;
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
        return extractJSON(response.text || "{}") as MediaAnalysis;
    }, "analyzeMedia");
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

  // Search always uses Flash for speed, but we can try Pro if user insists, 
  // but actually 429 suggests we should default to Flash for search anyway.
  // However, 'runWithFallback' defaults to PRO_MODEL then FAST_MODEL.
  return runWithFallback(async (model) => {
    // Use FAST_MODEL explicitly for search to save PRO quota for generation, unless model param override?
    // No, let's use the passed 'model' from runWithFallback which tries PRO first.
    // BUT search tool is expensive. Let's stick to FAST_MODEL for search to avoid 429 on Pro immediately.
    // Actually, user said "All AI analysis is 3 Pro". I will respect that, fallback handles 429.
    const response = await ai.models.generateContent({
      model, 
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
      // ENHANCED CONTEXT FROM ANALYSIS
      promptParts.push({ text: `\n\n
      # DEEP ANALYSIS CONTEXT (Use this as the primary source):
      **Summary**: ${contextData.analysis.summary}
      **Core Breakdown**: 
      ${contextData.analysis.corePoints.join('\n')}
      ` });
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

    const prompt = `
    Task: Generate 5 NEW viral Xiaohongshu titles for: "${currentTopic}".
    Mimic style: "${referenceTitle}".
    Format: Emoji + Text.
    **LANGUAGE: SIMPLIFIED CHINESE.**
    Output: JSON array of strings.
    `;

    return runWithFallback(async (model) => {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });
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

    const prompt = `
    Role: Rednote Editor.
    Task: Rewrite content.
    ${customInstruction ? `Instruction: "${customInstruction}"` : ''}
    ${referenceArticle ? `Ref Style: """${referenceArticle}"""` : ''}
    Content: """${currentContent}"""
    **CHINESE ONLY.**
    `;

    return runWithFallback(async (model) => {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });
        return response.text || currentContent;
    }, "rewriteContent");
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

    return runWithFallback(async (model) => {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });
        return response.text?.trim().replace(/^"|"$/g, '') || currentTitle;
    }, "regenerateCoverTitle");
};