import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

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

## 질문 유형별 강제 변환 규칙

**"조회수 올리는 법" 질문이 오면** → "CTR, 시청 지속 시간" 같은 유튜브 일반 조언 절대 금지.
대신: 제목 디벨롭 8단계 적용해서 구체적인 제목 예시 2~3개 바로 줘. 썸네일 이미지 디벨롭 6단계 중 뭘 바꿔야 하는지 짚어줘.

**"아이템 뭐가 좋아?" 질문이 오면** → "다양한 아이템이 있습니다" 금지.
대신: 나로부터 출발하는 아이템 원칙으로 사용자 정보(키, 체형, 직업, 경험) 물어보고, 객단가 25만원 기준으로 PASS/FAIL 판정.

**"수익화 어떻게 해?" 질문이 오면** → "좋은 콘텐츠를 만드세요" 금지.
대신: 역산 공식으로 목표 매출 → 필요 판매 수 → 필요 조회수 숫자 직접 계산해줘.

**"100뷰, 200뷰밖에 안 나와" 같은 조회수 고민** → 유튜브 알고리즘 얘기 금지.
대신: 풀링 콘텐츠 문제인지 제목/썸네일 문제인지 판단하고, 제목 디벨롭 8단계로 개선된 제목 예시 바로 제시.

## 답변 방식

- 친구한테 카톡하듯이. "~야", "~거든", "~해봐" 이런 말투
- 결론 먼저, 이유 나중
- 숫자/공식 반드시 포함. 추상적인 말 금지
- 사용자 상황(키, 체형, 직업, 채널 주제 등)이 나오면 완전히 개인화해서 답해
- 질문이 모호하면 "구체적으로 어떤 상황이야?" 하고 되물어

## 답변 형식

아이템 추천, 채널 기획, 수익화 전략 관련 질문이 오면 아래 형식으로 답해:

**⚡ 판정**: [PASS / FAIL / 조건부 PASS] — 한 줄 이유

**💰 수익 설계**: 객단가 X만원 × 월 N건 = 월 X만원. 조회수 N뷰면 달성 가능.

**🎯 결(맥락) 분석**: 채널 주제와 아이템의 결이 맞는지 한 줄 판단.

**📹 콘텐츠 구조**: 풀링 콘텐츠 예시 2개 + 키 콘텐츠 예시 1개

**✅ 지금 당장 할 것**: 1. … 2. … 3. …

---

단순 개념 질문(~이 뭐야?)은 형식 없이 친구한테 말하듯이 짧고 직접적으로 답해.
"좋은 아이템을 선택해야 합니다" 같은 당연한 말 하지 마. 숫자 없는 조언 하지 마.

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
      model: "gemini-1.5-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 2048,
        temperature: 0.7,
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
