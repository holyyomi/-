import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { CopySuggestion, LandingPageBlueprint } from "../types";

// Optimize image to reduce token usage (mitigate 429 errors)
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
            // Resize logic to limit token usage
            const MAX_DIMENSION = 1024;
            let width = img.width;
            let height = img.height;
            
            // Only resize if significantly larger
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                if (width > height) {
                    height = Math.round((height * MAX_DIMENSION) / width);
                    width = MAX_DIMENSION;
                } else {
                    width = Math.round((width * MAX_DIMENSION) / height);
                    height = MAX_DIMENSION;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Use JPEG with 0.8 quality for good balance of size/quality
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8); 
                resolve(dataUrl.split(',')[1]);
            } else {
                reject(new Error("Canvas context failed"));
            }
        };
        img.onerror = (e) => reject(e);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Helper: Wait function for delay
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: Retry operation with exponential backoff
 * Default retries set to 0 as per user request (fail fast).
 */
async function retryOperation<T>(operation: () => Promise<T>, retries = 0, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const msg = error?.message || "";
    // Check for 429 or quota related errors, or JSON parsing errors
    const isQuotaError = msg.includes("429") || msg.includes("quota") || msg.includes("resource has been exhausted") || error.status === 429;
    const isJsonError = msg.includes("JSON") || msg.includes("Unexpected token") || msg.includes("Unterminated string");
    
    if (retries > 0 && (isQuotaError || isJsonError)) {
      console.warn(`Gemini API Error (${msg}). Retrying in ${delay}ms... (${retries} attempts left)`);
      await wait(delay);
      return retryOperation(operation, retries - 1, delay * 2); // Double the delay for next retry
    }
    throw error;
  }
}

/**
 * Step 0: Validate API Key (Lightweight call)
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
    const ai = new GoogleGenAI({ apiKey });
    try {
        // Very minimal call just to check authentication and basic access
        await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: 'Hi' }] },
            config: { maxOutputTokens: 1 }
        });
        return true;
    } catch (error) {
        throw error;
    }
}

/**
 * Step 1: Analyze product and suggest background + copy
 */
export async function analyzeProductAndSuggest(apiKey: string, base64Image: string, additionalInfo?: string, desiredTone?: string): Promise<LandingPageBlueprint> {
  // Debug log to confirm which key is being used
  console.log(`[Gemini Service] Initializing analyzeProductAndSuggest with API Key starting: ${apiKey.substring(0, 8)}...`);
  
  const ai = new GoogleGenAI({ apiKey });
  
  const operation = async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg', 
              data: base64Image
            }
          },
          {
            text: `
              이 제품 이미지를 분석하여 4~6개의 핵심 섹션으로 구성된 상세페이지 전체 블루프린트를 설계해주세요.
              ${additionalInfo ? `[사용자 추가 정보]: ${additionalInfo}` : ''}
              ${desiredTone ? `[원하는 디자인 톤]: ${desiredTone}` : ''}
              
              # 섹션 템플릿(필수 필드)
              - section_id: S1~S6
              - section_name: (예: 히어로/체크리스트/베네핏/근거/사용법/후기 등)
              - goal: 이 섹션의 역할(짧은 한 문장)
              - headline: 1줄(강하게)
              - subheadline: 1줄(명확하게)
              - bullets: 3개(스캔용, 각 1줄)
              - trust_or_objection_line: 불안 제거/신뢰 1문장
              - CTA: (있으면) 1줄
              - layout_notes: 이미지 레이아웃 지시(짧게)
              - compliance_notes: 카테고리별 규제/표현 주의(짧게)

              # 섹션 구성 원칙(강제)
              - 베네핏은 “3개 고정”
              - 근거 섹션은 반드시 결과→조건→해석 3단으로 작성
              - 리뷰 섹션은 “전/후 사진”보다 “사용감 문장 후기 카드 6~12개” 우선
              - 사용법/루틴은 선택지를 2~3개로 줄여 선택 피로를 없앨 것
              - CTA는 최소 2회 이상 배치
              - 각 섹션의 이미지는 단순한 제품 누끼나 그래픽이 아닌, 소비자의 구매 전환을 유도할 수 있는 매력적인 **고품질 광고 사진(High-end Commercial Photography)** 느낌으로 기획할 것.
              - 특히 첫 번째 섹션(히어로 섹션)은 구매 전환에 가장 중요하므로, **반드시 매력적인 모델(인물)이 제품과 함께 연출된 컷**으로 프롬프트를 작성할 것.
              - 각 섹션의 이미지는 해당 섹션의 헤드라인과 서브헤드라인의 메시지를 시각적으로 완벽하게 전달해야 함.

              # 섹션별 “이미지 생성 프롬프트” 생성 (필수)
              - 각 섹션마다 이미지 1장을 만들 수 있게 아래를 출력하라.
              - image_id: IMG_S1~IMG_S6
              - purpose: 이 이미지가 전달해야 하는 메시지(짧은 한 문장)
              - prompt_ko: 한국어 이미지 생성 프롬프트(1~2문장으로 간결하게)
              - prompt_en: 영어 프롬프트(동일 내용, 실제 이미지 생성 API에 사용됨, 간결하게)
              - on_image_text: 이미지에 들어갈 문구(제목/불릿/CTA) — “텍스트 레이아웃”도 함께 지시
              - negative_prompt: 피해야 할 요소(과장, 복잡한 배경, 작은 글씨, 저해상도 등)
              - style_guide: 전체 통일 스타일(색/톤/여백/폰트 느낌/아이콘 스타일)
              - reference_usage: 업로드된 기존 상세페이지를 어떻게 참조할지(짧게)

              # 이미지 생성 공통 규칙
              - 세로형 상세페이지용
              - **이미지 내에 어떠한 텍스트(타이포그래피, 로고, 워터마크, 글자)도 포함하지 말 것.** 오직 시각적인 이미지와 분위기만 전달할 것.
              - 배경은 단순하게, 제품/핵심 오브젝트에 시선 집중
              - “한 장에 메시지 하나”
              - 카테고리별 금지표현/규제 리스크가 있으면 안전한 표현으로 수정
              - **CRITICAL**: JSON 응답 내에 base64 이미지 데이터나 매우 긴 문자열을 절대 포함하지 마세요. 모든 텍스트 필드는 최대한 간결하게(1~2문장 이내) 작성하여 전체 JSON 길이를 줄이세요. 토큰 한도를 초과하지 않도록 주의하세요.

              응답은 반드시 제공된 JSON 스키마를 준수해야 합니다.
            `
          }
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING, description: "Executive Summary (2~3줄)" },
            scorecard: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  score: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            },
            blueprintList: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "New Page Blueprint (섹션 순서 리스트)"
            },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  section_id: { type: Type.STRING },
                  section_name: { type: Type.STRING },
                  goal: { type: Type.STRING },
                  headline: { type: Type.STRING },
                  subheadline: { type: Type.STRING },
                  bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                  trust_or_objection_line: { type: Type.STRING },
                  CTA: { type: Type.STRING },
                  layout_notes: { type: Type.STRING },
                  compliance_notes: { type: Type.STRING },
                  image_id: { type: Type.STRING },
                  purpose: { type: Type.STRING },
                  prompt_ko: { type: Type.STRING },
                  prompt_en: { type: Type.STRING },
                  on_image_text: { type: Type.STRING },
                  negative_prompt: { type: Type.STRING },
                  style_guide: { type: Type.STRING },
                  reference_usage: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    if (response.text) {
      try {
        let text = response.text.trim();
        if (text.startsWith('```json')) {
          text = text.substring(7);
        } else if (text.startsWith('```')) {
          text = text.substring(3);
        }
        if (text.endsWith('```')) {
          text = text.substring(0, text.length - 3);
        }
        return JSON.parse(text.trim());
      } catch (e) {
        console.error("Failed to parse JSON. Length:", response.text.length);
        throw e;
      }
    }
    throw new Error("No response text from Gemini");
  };

  try {
    // Wrap with retry logic (retry up to 2 times for JSON errors)
    return await retryOperation(operation, 2);
  } catch (error) {
    console.error("Error analyzing product:", error);
    throw error;
  }
}

/**
 * Step 2: Generate background image preserving the product
 */
export async function generateProductBackground(
  apiKey: string, 
  base64Image: string, 
  prompt: string, 
  aspectRatio: string = "1:1", 
  desiredTone?: string,
  options?: {
    style?: 'studio' | 'lifestyle' | 'outdoor';
    withModel?: boolean;
    modelGender?: 'female' | 'male';
    headline?: string;
    subheadline?: string;
    isRegeneration?: boolean;
  }
): Promise<string> {
  // Debug log to confirm which key is being used
  console.log(`[Gemini Service] Initializing generateProductBackground with API Key starting: ${apiKey.substring(0, 8)}...`);
  
  const ai = new GoogleGenAI({ apiKey });

  let enhancedPrompt = `Create a high-end, conversion-optimized commercial advertising photograph. `;
  
  if (options?.headline) {
    enhancedPrompt += `Context: The image should visually represent the advertising headline "${options.headline}" and subheadline "${options.subheadline}". `;
  }

  if (options?.isRegeneration) {
    enhancedPrompt += `\n[USER OVERRIDE INSTRUCTIONS - STRICTLY FOLLOW THESE OVER ANY CONFLICTING BASE INSTRUCTIONS]\n`;
    if (options?.style === 'studio') {
      enhancedPrompt += `- Setting: Professional studio lighting, clean and premium studio background.\n`;
    } else if (options?.style === 'lifestyle') {
      enhancedPrompt += `- Setting: Authentic, aspirational lifestyle environment, natural lighting, real-world context.\n`;
    } else if (options?.style === 'outdoor') {
      enhancedPrompt += `- Setting: Beautiful outdoor environment, cinematic natural lighting, scenic background.\n`;
    }

    if (options?.withModel) {
      const genderDesc = options.modelGender === 'male' 
        ? "handsome 20s Korean man" 
        : "beautiful 20s Korean woman";
      enhancedPrompt += `- Subject: MUST feature an attractive, professional model (${genderDesc}) posing with and interacting naturally with the product. Even if the base instructions say no people, YOU MUST INCLUDE THIS MODEL.\n`;
    } else {
      enhancedPrompt += `- Subject: DO NOT include any people or models. Focus entirely on the product and background.\n`;
    }
    enhancedPrompt += `[END USER OVERRIDE INSTRUCTIONS]\n\n`;
    
    enhancedPrompt += `Base Instructions (Adapt these to fit the user overrides above): Keep the product exactly as is. Change the background to: ${prompt}. ${desiredTone ? `The overall style and tone should be ${desiredTone}. ` : ''}`;
  } else {
    // First generation: rely heavily on the generated prompt, but gently suggest the options if applicable.
    enhancedPrompt += `\nBase Instructions: Keep the product exactly as is. Change the background to: ${prompt}. ${desiredTone ? `The overall style and tone should be ${desiredTone}. ` : ''}`;
    
    let gentleSuggestions = "";
    if (options?.style === 'studio') gentleSuggestions += `Professional studio lighting. `;
    else if (options?.style === 'lifestyle') gentleSuggestions += `Authentic lifestyle environment. `;
    else if (options?.style === 'outdoor') gentleSuggestions += `Outdoor environment. `;
    
    if (options?.withModel) {
      const genderDesc = options.modelGender === 'male' ? "handsome 20s Korean man" : "beautiful 20s Korean woman";
      gentleSuggestions += `If appropriate for the scene, feature a model (${genderDesc}). `;
    }
    if (gentleSuggestions) {
      enhancedPrompt += `\nStyle Preferences: ${gentleSuggestions}`;
    }
  }

  enhancedPrompt += `\nCRITICAL: The final image must look like a top-tier magazine advertisement or a premium brand's landing page hero shot. It should be highly attractive and induce purchase conversion.`;
  enhancedPrompt += `\nIMPORTANT: DO NOT include any text, words, letters, typography, or logos in the generated image. The image should be purely visual without any overlay text.`;

  const operation = async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image
            }
          },
          {
            text: enhancedPrompt
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio
        }
      }
    });

    // Check for image in response
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("No image generated");
  };

  try {
    // Wrap with retry logic (retry up to 2 times)
    return await retryOperation(operation, 2);
  } catch (error) {
    console.error("Error generating background:", error);
    throw error;
  }
}