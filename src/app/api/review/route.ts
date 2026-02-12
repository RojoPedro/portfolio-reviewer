
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
                error: 'Service account key not found',
                details: 'Please ensure service-account.json is present or GOOGLE_SERVICE_ACCOUNT_JSON env var is set.'
            }, { status: 500 });
        }

        // Read project_id from the service account file
        const keyFileContent = fs.readFileSync(keyFilePath, 'utf-8');
        const keyFileJson = JSON.parse(keyFileContent);
        const projectId = keyFileJson.project_id;

        console.log(`Using Project ID: ${projectId}`);

        const vertexAI = new VertexAI({
            project: projectId,
            location: 'us-central1',
            googleAuthOptions: {
                keyFile: keyFilePath,
                scopes: ['https://www.googleapis.com/auth/cloud-platform']
            }
        });

        const modelsToTry = [
            'gemini-2.0-flash-001',
            'gemini-1.5-flash-002',
            'gemini-1.5-pro-002'
        ];
        let lastError = null;

        // Convert PDF to Base64
        const arrayBuffer = await portfolioFile.arrayBuffer();
        const base64Pdf = Buffer.from(arrayBuffer).toString('base64');

        // Scrape Job Offer Content if provided
        let jobOfferContent = "";
        let extractedJobTitle = "";
        if (jobOfferUrl) {
            jobOfferContent = await scrapeUrl(jobOfferUrl);
            console.log("--- DEBUG: Job Offer Content ---");
            console.log(`Length: ${jobOfferContent.length} chars`);
            console.log(`First 300 chars: ${jobOfferContent.substring(0, 300)}`);
            console.log("--- END DEBUG ---");

            // Extract job title from scraped content
            const titleMatch = jobOfferContent.match(/JOB TITLE:\s*(.+?)(?:\n|COMPANY|LOCATION)/i);
            if (titleMatch) {
                extractedJobTitle = titleMatch[1].trim();
            } else {
                // Try to get first meaningful line as title, ignoring URLs
                const firstLine = jobOfferContent.split('\n').find(l => {
                    const line = l.trim();
                    return line.length > 5 &&
                        line.length < 100 &&
                        !line.startsWith('http') &&
                        !line.startsWith('www') &&
                        !line.toLowerCase().startsWith('source:');
                });
                extractedJobTitle = firstLine?.trim() || '';
            }
            console.log(`[Extracted Job Title]: "${extractedJobTitle}"`);
        }

        // Construct System Prompt - INSTRUCTIONS ONLY (job context comes later)
        const systemPrompt = `You are a strict, honest Hiring Manager. You will receive a candidate's CV (PDF) and a JOB OFFER.
You must output ONLY valid JSON — no markdown, no code blocks.

YOUR #1 RULE: Every score reflects how well the candidate fits the JOB OFFER, NOT how good their CV is in general.

STEP 1 — ROLE IDENTIFICATION (MANDATORY):
You MUST identify:
- candidate_role_detected: The candidate's professional field from their CV (e.g. "Software Developer", "Chef", "Mechanic")
- job_offer_role_detected: The professional role the job offer requires (e.g. "CNC Press Brake Operator", "Full Stack Developer")

STEP 2 — ROLE COMPATIBILITY:
Compare the TWO roles. Are they in the SAME professional field?
- "Full Stack Developer" vs "Backend Engineer" = MATCH (same tech field)
- "Software Developer" vs "CNC Machine Operator" = MISMATCH (tech vs manufacturing)
- "Software Developer" vs "Sheet Metal Worker" = MISMATCH
- "Software Developer" vs "Mechanic" = MISMATCH
- "Software Developer" vs "Cook" = MISMATCH

- IF MISMATCH (different domains, e.g. Chef vs Coder): Hard Skills/Experience/Impact must be low (0-15).
- IF SAME DOMAIN but different title (e.g. Full Stack vs IoT): Score PROPORTIONALLY to skill overlap.
    - 8/10 skills match? Score HIGH (75-85).
    - 2/10 skills match? Score LOW (20-30).
- Soft Skills / Formatting: Score FAIRLY based on the CV's quality and transferability, regardless of mismatch.
- final_score: Weighted heavily by hard skills, but allow some points for soft skills/formatting.
- STATUS COLORS: "red" (<55), "yellow" (55-74), "green" (75+).
- FEEDBACK: Explain specifically WHICH hard skills are missing (e.g. "Missing experience with MCAL and RTOS"). Do NOT use the prefix "CRITICAL MISMATCH".
- REQUIREMENTS: Check for explicit requirements (e.g. "3+ years experience", "Master's Degree"). If missing, penalize the score MODERATELY and explicitly MENTION it in the feedback, but do not automatically force a low score if other skills are strong.

IF MATCH → Evaluate normally against job requirements.

Severity Level: ${severityLevel}/10 (1-3=encouraging, 4-7=professional, 8-10=brutal)

OUTPUT JSON SCHEMA:
{
  "review_metadata": {
    "severity_applied": ${severityLevel},
    "date": "${new Date().toISOString()}",
    "candidate_role_detected": "(string: role from CV)",
    "job_offer_role_detected": "(string: role from job offer)",
    "role_match": "MATCH" | "PARTIAL_MATCH" | "MISMATCH"
  },
  "scores": {
    "final_score": (0-100),
    "categories": {
      "hard_skills": (0-100),
      "experience_relevance": (0-100),
      "impact_results": (0-100),
      "soft_skills": (0-100),
      "formatting_ats": (0-100)
    }
  },
  "feedback_cards": [
    {"category_name":"Hard Skills","score":(0-100),"short_comment":"Max 25 words about THIS job's skills.","status_color":"green|yellow|red"},
    {"category_name":"Experience Relevance","score":(0-100),"short_comment":"Max 25 words.","status_color":"green|yellow|red"},
    {"category_name":"Impact/Results","score":(0-100),"short_comment":"Max 25 words.","status_color":"green|yellow|red"},
    {"category_name":"Soft Skills","score":(0-100),"short_comment":"Max 25 words.","status_color":"green|yellow|red"},
    {"category_name":"Formatting/ATS","score":(0-100),"short_comment":"Max 25 words.","status_color":"green|yellow|red"}
  ],
  "actionable_feedback": ["action 1","action 2","action 3"]
}

REMEMBER: If MISMATCH, ALL scores 0-10. No exceptions. "Hard Skills" = skills THIS JOB requires.`;

        // Job context goes BEFORE the PDF so the model reads it before evaluating the CV
        const jobContextMessage = jobOfferContent
            ? `
========================================
JOB OFFER THE CANDIDATE IS APPLYING FOR:
========================================
${jobOfferContent.substring(0, 20000)}
========================================
END OF JOB OFFER
========================================

The candidate's CV/PDF follows below. Evaluate it AGAINST this job offer.
Identify candidate_role_detected from the CV and job_offer_role_detected from the JOB OFFER above.
If the roles are in different professional fields, it is a MISMATCH.`
            : `No specific job offer provided. Evaluate the CV against general industry standards for the role described in the CV.`;

        const requestParts: Array<{ text: string } | { inlineData: { mimeType: string, data: string } }> = [
            { text: systemPrompt },
        ];

        // If we have job context, add it BEFORE the PDF
        if (jobOfferContent) {
            requestParts.push({ text: jobContextMessage });
        }

        // Then the PDF
        requestParts.push({
            inlineData: {
                mimeType: 'application/pdf',
                data: base64Pdf
            }
        });

        // Final trigger after PDF — include the extracted job title so the model can't miss it
        requestParts.push({
            text: jobOfferContent
                ? `Above is the candidate's CV. The JOB OFFER was provided earlier.

⚠️ THE JOB TITLE IS: "${extractedJobTitle}"
⚠️ job_offer_role_detected MUST be "${extractedJobTitle}" or similar — it must come from the JOB OFFER, NOT from the CV.
⚠️ If the candidate's field does not match "${extractedJobTitle}", role_match MUST be "MISMATCH" and ALL scores must be 0-10.

Generate the JSON review now.`
                : `Generate the JSON review now.`
        });

        const request = {
            contents: [{
                role: 'user',
                parts: requestParts
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

        // === HARD GUARDRAIL: Code-level role mismatch detection ===
        // The AI model sometimes ignores role mismatches, so we enforce it in code.
        if (parsedResult.review_metadata?.candidate_role_detected && parsedResult.review_metadata?.job_offer_role_detected) {
            const candidateRole = parsedResult.review_metadata.candidate_role_detected.toLowerCase();
            const jobRole = parsedResult.review_metadata.job_offer_role_detected.toLowerCase();

            // Define professional domain groups
            const domainGroups: Record<string, string[]> = {
                tech: ['software', 'developer', 'engineer', 'programmer', 'web', 'frontend', 'backend', 'full stack', 'fullstack', 'devops', 'data scientist', 'data analyst', 'it ', 'cloud', 'mobile', 'ios', 'android', 'designer', 'ux', 'ui', 'iot', 'hardware', 'embedded', 'firmware', 'network', 'security', 'qa', 'testing'],
                manual: ['mechanic', 'meccanico', 'welder', 'saldatore', 'plumber', 'idraulico', 'electrician', 'elettricista', 'operator', 'operatore', 'operaio', 'machine', 'piegatore', 'sheet metal', 'lamiera', 'cnc', 'press', 'pressa', 'driver', 'autista', 'carpenter', 'falegname', 'painter', 'imbianchino', 'mason', 'muratore', 'tecnico officina', 'fabbro'],
                medical: ['nurse', 'infermiere', 'doctor', 'medico', 'surgeon', 'chirurgo', 'dentist', 'dentista', 'pharmacist', 'farmacista', 'therapist', 'terapista', 'veterinarian', 'veterinario', 'paramedic'],
                food: ['chef', 'cuoco', 'cook', 'baker', 'panettiere', 'pastry', 'pasticcere', 'bartender', 'barista', 'waiter', 'cameriere', 'kitchen', 'cucina', 'restaurant'],
                textile: ['seamstress', 'sarta', 'tailor', 'sarto', 'rammendatrice', 'tessile', 'textile', 'fashion', 'moda'],
                education: ['teacher', 'insegnante', 'professor', 'professore', 'tutor', 'instructor', 'istruttore'],
                legal: ['lawyer', 'avvocato', 'attorney', 'solicitor', 'paralegal', 'notary', 'notaio'],
                finance: ['accountant', 'contabile', 'auditor', 'revisore', 'financial', 'finanziario', 'banker', 'banchiere'],
            };

            function detectDomain(role: string): string | null {
                for (const [domain, keywords] of Object.entries(domainGroups)) {
                    if (keywords.some(kw => role.includes(kw))) return domain;
                }
                return null;
            }

            const candidateDomain = detectDomain(candidateRole);
            const jobDomain = detectDomain(jobRole);

            console.log(`[Guardrail] Candidate: "${candidateRole}" (domain: ${candidateDomain}), Job: "${jobRole}" (domain: ${jobDomain}), Extracted Title: "${extractedJobTitle}"`);

            // HALLUCINATION DETECTION: Check if the model copied the candidate role as the job role
            if (extractedJobTitle) {
                const extractedTitleLower = extractedJobTitle.toLowerCase();
                const titleWords = extractedTitleLower.split(/\s+/).filter((w: string) => w.length > 3);
                const jobRoleWords = jobRole.split(/\s+/).filter((w: string) => w.length > 3);

                // Check if model's job role shares ANY significant word with the extracted title
                const hasOverlap = titleWords.some((tw: string) => jobRoleWords.some((jw: string) => jw.includes(tw) || tw.includes(jw)));

                // Check if model just copied the candidate role as the job role
                const candidateWords = candidateRole.split(/\s+/).filter((w: string) => w.length > 3);
                const jobMatchesCandidate = candidateWords.length > 0 &&
                    candidateWords.every((cw: string) => jobRoleWords.some((jw: string) => jw.includes(cw) || cw.includes(jw)));

                if (!hasOverlap || jobMatchesCandidate) {
                    console.log(`[Guardrail] ⚠️ HALLUCINATION DETECTED! Model said job is "${jobRole}" but extracted title is "${extractedJobTitle}". Overriding.`);
                    // Override the model's hallucinated job role with the real one
                    parsedResult.review_metadata.job_offer_role_detected = extractedJobTitle;
                    const correctedJobRole = extractedTitleLower;
                    const correctedJobDomain = detectDomain(correctedJobRole);

                    // Re-evaluate with corrected job role
                    const correctedMismatch = (candidateDomain && correctedJobDomain && candidateDomain !== correctedJobDomain) ||
                        (candidateDomain && !correctedJobDomain);

                    if (correctedMismatch) {
                        const isCrossDomain = candidateDomain && correctedJobDomain && candidateDomain !== correctedJobDomain;

                        if (isCrossDomain) {
                            console.log(`[Guardrail] ⚠️ STRICT MISMATCH CONFIRMED after correction: ${candidateDomain} vs ${correctedJobDomain}`);
                            parsedResult.review_metadata.role_match = 'MISMATCH';
                            const maxScore = 15;

                            // Cap only relevant hard categories
                            parsedResult.scores.categories.hard_skills = Math.min(parsedResult.scores.categories.hard_skills, maxScore);
                            parsedResult.scores.categories.experience_relevance = Math.min(parsedResult.scores.categories.experience_relevance, maxScore);
                            parsedResult.scores.categories.impact_results = Math.min(parsedResult.scores.categories.impact_results, maxScore);

                            // Update specific feedback cards without overwriting soft skills
                            for (const card of parsedResult.feedback_cards) {
                                if (['Hard Skills', 'Experience Relevance', 'Impact/Results'].includes(card.category_name)) {
                                    card.score = Math.min(card.score, maxScore);
                                    card.status_color = 'red';
                                }
                            }
                        } else {
                            console.log(`[Guardrail] ℹ️ Same-domain mismatch (${candidateDomain}). Allowing LLM to score based on skill overlap.`);
                            if (parsedResult.review_metadata.role_match !== 'MATCH') {
                                parsedResult.review_metadata.role_match = 'PARTIAL_MATCH';
                            }
                        }

                        let feedbackIntro = "";
                        if (candidateDomain && correctedJobDomain && candidateDomain !== correctedJobDomain) {
                            feedbackIntro = `Your profile is in the ${candidateDomain} field, which is very different from ${correctedJobDomain}.`;
                        } else {
                            feedbackIntro = `Your profile does not align with the specific requirements of this role.`;
                        }

                        parsedResult.actionable_feedback = [
                            feedbackIntro,
                            `You are missing key technical skills required for this specific role.`,
                            `Consider roles that align closer with your demonstrated experience.`
                        ];
                    }
                }
            }

            // Trigger if: 
            // 1. Model already said MISMATCH (but might have given high scores)
            // 2. Different known domains
            // 3. Candidate is known but job is unknown (likely different field)
            const isMismatch = parsedResult.review_metadata.role_match === 'MISMATCH' ||
                (candidateDomain && jobDomain && candidateDomain !== jobDomain) ||
                (candidateDomain && !jobDomain && extractedJobTitle);

            if (isMismatch) {
                // intelligent capping: Only cap if it's a cross-domain mismatch (e.g. Manual vs Tech)
                const isCrossDomain = candidateDomain && jobDomain && candidateDomain !== jobDomain;

                if (isCrossDomain) {
                    console.log(`[Guardrail] ⚠️ STRICT MISMATCH: ${candidateDomain} vs ${jobDomain}. Capping hard scores.`);

                    // Force mismatch in metadata if not already set
                    parsedResult.review_metadata.role_match = 'MISMATCH';

                    // Cap only relevant hard categories
                    const maxScore = 15;
                    parsedResult.scores.categories.hard_skills = Math.min(parsedResult.scores.categories.hard_skills, maxScore);
                    parsedResult.scores.categories.experience_relevance = Math.min(parsedResult.scores.categories.experience_relevance, maxScore);
                    parsedResult.scores.categories.impact_results = Math.min(parsedResult.scores.categories.impact_results, maxScore);

                    // Update feedback cards ONLY if we are capping
                    for (const card of parsedResult.feedback_cards) {
                        if (['Hard Skills', 'Experience Relevance', 'Impact/Results'].includes(card.category_name)) {
                            card.score = Math.min(card.score, maxScore);
                            card.status_color = 'red';
                        }
                    }
                } else {
                    console.log(`[Guardrail] ℹ️ Same-domain mismatch (${candidateDomain}). Allowing LLM to score based on skill overlap.`);
                    // We do NOT cap scores here. We trust the LLM/Prompt instructions.
                    // However, we ensure the role match is recorded as partial/mismatch for clarity if the titles are very different.
                    if (parsedResult.review_metadata.role_match !== 'MATCH') {
                        parsedResult.review_metadata.role_match = 'PARTIAL_MATCH';
                    }
                }

                // Recalculate final score only if we capped things (or just to be safe, but usually valid)
                parsedResult.scores.final_score = Math.floor(
                    (parsedResult.scores.categories.hard_skills * 0.4) +
                    (parsedResult.scores.categories.experience_relevance * 0.3) +
                    (parsedResult.scores.categories.impact_results * 0.1) +
                    (parsedResult.scores.categories.soft_skills * 0.1) +
                    (parsedResult.scores.categories.formatting_ats * 0.1)
                );

                // Override actionable feedback
                let feedbackIntro = "";
                if (candidateDomain && jobDomain && candidateDomain !== jobDomain) {
                    feedbackIntro = `Your profile is in the ${candidateDomain} field, which is very different from ${jobDomain}.`;
                } else {
                    feedbackIntro = `Your profile does not align with the specific requirements of this role.`;
                }

                parsedResult.actionable_feedback = [
                    feedbackIntro,
                    `You are missing key technical skills required for this specific role.`,
                    `Consider roles that align closer with your demonstrated experience.`
                ];
            }

            // === COLOR THRESHOLD ENFORCEMENT ===
            // Ensure status colors match the scores strictly
            for (const card of parsedResult.feedback_cards) {
                if (card.score >= 75) {
                    card.status_color = 'green';
                } else if (card.score >= 55) {
                    card.status_color = 'yellow';
                } else {
                    card.status_color = 'red';
                }
            }
        }

        // Deduct 1 Credit
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ credits: profile.credits - 1 })
            .eq('id', user.id);

        if (updateError) {
            console.error("Failed to deduct credit:", updateError);
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
