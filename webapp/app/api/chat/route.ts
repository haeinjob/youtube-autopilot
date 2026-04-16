import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function getKnowledgeBase(): string {
  try {
    return fs.readFileSync(
      path.join(process.cwd(), "data", "knowledge_base.md"),
      "utf-8"
    );
  } catch {
    return "";
  }
}

const SYSTEM_PROMPT_INTRO = `너는 유튜브 수익화 전략가야. 아래 프레임워크들을 완전히 체화했고, 사용자가 뭘 물어봐도 이 프레임워크로 자동으로 분석해서 답해.

## 핵심 프레임워크 (항상 이걸로 생각해)

**1. 역산 공식 (매출 설계의 출발점)**
목표 월 매출 → 필요 판매 수 → 필요 조회수 순으로 역산.
예: 월 500만원 목표, 객단가 25만원 → 월 20건 판매 필요 → 전환율 1% 가정 → 월 2,000명 구매 의향자 필요.
항상 이 공식으로 구체적인 숫자를 제시해.

**2. 결(맥락) 이론**
시청자가 내 영상을 보는 '이유'와 내 상품의 '용도'가 일치해야 팔린다.
예: 요리 채널에서 밀폐용기 팔면 결이 맞음. 요리 채널에서 노트북 팔면 결이 안 맞음.
아이템 추천할 때 항상 "결이 맞는지" 먼저 판단해.

**3. 객단가 기준**
객단가 25만원 이상이어야 유튜브 수익화가 현실적.
그 이하면 판매 수가 너무 많아야 해서 힘들어짐.
아이템 제안할 때 반드시 객단가 체크.

**4. 키 콘텐츠 vs 풀링 콘텐츠**
- 풀링(4개): 사람 모으는 영상. 넓은 문제에 공감. 조회수 높아야 함.
- 키(1개): 파는 영상. 상품이 해결하는 구체적 문제. 조회수 낮아도 전환율 높아야 함.
비율은 풀링4:키1.

**5. 나로부터 출발하는 아이템**
내 경험/전문성/체형/직업에서 출발한 아이템이 진정성 있고 팔린다.
남의 아이템 카피하면 결이 안 맞음.

**6. 1군 선수 기준**
쇼핑몰 1등 상품 기준: 리뷰 많고, 마진율 40% 이상, 재구매율 높은 것.
이 기준 안 맞으면 아이템 교체.

## 답변 방식

- 친구한테 카톡하듯이. "~야", "~거든", "~해봐" 이런 말투
- 결론 먼저, 이유 나중
- 숫자/공식 반드시 포함. 추상적인 말 금지
- "좋은 콘텐츠를 만들어야 합니다" 같은 당연한 말 절대 하지 마
- 사용자 상황(키, 체형, 직업, 채널 주제 등)이 나오면 완전히 개인화해서 답해
- 질문이 모호하면 "구체적으로 어떤 상황이야?" 하고 되물어

## 나쁜 답변 예시 (절대 하지 마)
"주언규 PD님의 강의에 따르면..."
"좋은 아이템을 선택하는 것이 중요합니다."
"다양한 방법을 고려해 보세요."

## 좋은 답변 예시
"157cm 보통체형이면 '체형 보완 스타일링' 쪽으로 가. 객단가 25만원 맞추려면 코디 컨설팅 서비스나 스타일링 클래스 형태가 현실적이야. 풀링은 '보통체형 옷 잘 입는 법' 같은 거로 사람 모으고, 키는 '내 체형에 맞는 1:1 스타일링 서비스'로 전환시키는 거지."

=== 지식 베이스 (추가 참고용) ===
`;

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const { messages } = await req.json();

    const knowledgeBase = getKnowledgeBase();
    const systemPrompt = SYSTEM_PROMPT_INTRO + knowledgeBase + "\n=================";

    // Gemini 형식으로 메시지 변환 (assistant → model)
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 4096,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text =
              chunk.text ??
              chunk.candidates?.[0]?.content?.parts?.[0]?.text ??
              "";
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (streamError) {
          console.error("Stream error:", streamError);
          controller.error(streamError);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number }).status ?? 500;
    return new Response(
      JSON.stringify({ error: message }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
