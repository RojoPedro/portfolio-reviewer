
import { NextRequest, NextResponse } from 'next/server';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import { scrapeUrl } from '@/utils/scraper';
import path from 'path';
import fs from 'fs';

import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    let formData;
    try {
        formData = await req.formData();
        const portfolioFile = formData.get('portfolio') as File | null;
        const jobOfferUrl = formData.get('jobOfferUrl') as string | null;
        const severityLevel = parseInt(formData.get('ruthlessness') as string || '5', 10);

        if (!portfolioFile) {
            return NextResponse.json({ error: 'Portfolio PDF is required' }, { status: 400 });
        }

        // --- SUPABASE & CREDITS CHECK ---
        const supabase = await createClient(); // uses utils/supabase/server.ts
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
        }

        // Check credits
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('credits')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Failed to fetch user profile.' }, { status: 500 });
        }

        if (profile.credits < 1) {
            return NextResponse.json({
                error: 'Insufficient Credits',
                details: 'You have used all your free credits.'
            }, { status: 402 });
        }

        // --- AUTHENTICATION SETUP (Google Vertex AI) ---
        let keyFilePath = path.join(process.cwd(), 'service-account.json');

        // VERCEL SUPPORT: Use Environment Variable if local file is missing
        if (!fs.existsSync(keyFilePath) && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
            const credentialsContent = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
            keyFilePath = '/tmp/service-account.json';
            fs.writeFileSync(keyFilePath, credentialsContent);
            console.log("Created temporary service-account.json from Env Var");
        }

        if (!fs.existsSync(keyFilePath)) {
            return NextResponse.json({
                error: 'Configuration Error',
                details: 'service-account.json not found and GOOGLE_SERVICE_ACCOUNT_JSON env var not set.'
            }, { status: 500 });
        }

        process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilePath;
        const keyFileContent = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
        const projectId = keyFileContent.project_id;
        const location = 'us-central1';

        const vertexAI = new VertexAI({ project: projectId, location: location });

        // List of models to try. User requested 2.5-flash.
        const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];

        let model = null;
        let lastError = null;

        // Initialize model
        for (const modelName of modelsToTry) {
            try {
                const candidateModel = vertexAI.getGenerativeModel({
                    model: modelName,
                    safetySettings: [{
                        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                });
                model = candidateModel;
                break;
            } catch (e) {
                console.warn(`Model ${modelName} initialization failed (will try next if strictly init failed, but usually it only fails at generation):`, e);
                lastError = e;
            }
        }

        // Convert PDF to Base64
        const arrayBuffer = await portfolioFile.arrayBuffer();
        const base64Pdf = Buffer.from(arrayBuffer).toString('base64');

        // Scrape Job Offer Content if provided
        let jobOfferContent = "";
        if (jobOfferUrl) {
            jobOfferContent = await scrapeUrl(jobOfferUrl);
        }

        // Construct System Prompt based on specifications
        const systemPrompt = `
You are a Senior Design Director and Technical Hiring Manager. Your task is to review a portfolio/CV provided as a PDF.
You must output ONLY valid JSON.

**Severity Level: ${severityLevel}/10**
- Level 1-3 (Coach Mode): Encouraging, focuses on potential, forgive lack of secondary skills. Positive tone.
- Level 4-7 (Recruiter Mode): Standard market evaluation. Penalize lack of concrete results. Professional tone.
- Level 8-10 (ATS/Hard Mode): Brutal, algorithmic. Demands exact keywords and metrics (%, $). High standards for formatting and UX.

**Context:**
${jobOfferContent ? `- Job Offer Content: ${jobOfferContent.substring(0, 5000)}...` : '- General Industry Standards for Design/Tech roles.'}

**Output Schema (JSON):**
{
  "review_metadata": {
    "severity_applied": ${severityLevel},
    "date": "${new Date().toISOString()}"
  },
  "scores": {
    "final_score": (number 0-100),
    "categories": {
      "hard_skills": (number 0-100),
      "experience_relevance": (number 0-100),
      "impact_results": (number 0-100),
      "soft_skills": (number 0-100),
      "formatting_ats": (number 0-100)
    }
  },
  "feedback_cards": [
    // Array of exactly 5 objects, corresponding to the categories above
    {
      "category_name": "Hard Skills",
      "score": (number 0-100),
      "short_comment": "Max 25 words string. Direct and specific.",
      "status_color": "green" | "yellow" | "red" 
    },
    // ... repeat for Experience, Impact, Soft Skills, Formatting
  ],
  "actionable_feedback": [
    "Specific corrective action 1",
    "Specific corrective action 2",
    "Specific corrective action 3"
  ]
}

**Instructions:**
1. Analyze the PDF content thoroughly.
2. STRICTLY follow the JSON schema. Do not include markdown code blocks like \`\`\`json.
3. Adhere to the requested Severity Level for scoring and tone.
`;

        const request = {
            contents: [{
                role: 'user',
                parts: [
                    { text: systemPrompt },
                    {
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: base64Pdf
                        }
                    },
                    { text: "Generate the JSON review now." }
                ]
            }]
        };

        let result;
        // Attempt generation with fallback
        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting generation with: ${modelName}`);
                const candidateModel = vertexAI.getGenerativeModel({
                    model: modelName,
                    safetySettings: [{
                        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                });
                result = await candidateModel.generateContent(request);
                console.log(`Success with ${modelName}`);
                break;
            } catch (e) {
                console.warn(`Failed with ${modelName}:`, e);
                lastError = e;
            }
        }

        if (!result) {
            throw lastError || new Error("All models failed.");
        }

        const responseText = result.response.candidates?.[0].content.parts[0].text;

        if (!responseText) {
            throw new Error("Empty response from AI");
        }

        // Clean up markdown if present (sometimes model adds ```json ... ``` despite instructions)
        const cleanJson = responseText.replace(/^```json\n|\n```$/g, '').trim();

        // Validate JSON
        try {
            JSON.parse(cleanJson);
        } catch (e) {
            console.error("Invalid JSON received:", cleanJson);
            throw new Error("AI produced invalid JSON");
        }

        const parsedResult = JSON.parse(cleanJson);

        // Deduct 1 Credit
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ credits: profile.credits - 1 })
            .eq('id', user.id);

        if (updateError) {
            console.error("Failed to deduct credit:", updateError);
            // We don't fail the request, but we should log it.
        }

        return NextResponse.json(parsedResult);

    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({
            error: 'Analysis Failed',
            details: `Error: ${error instanceof Error ? error.message : String(error)}`
        }, { status: 500 });
    }
}
