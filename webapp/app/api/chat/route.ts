import { NextRequest } from "next/server";
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function getKnowledgeBase(): string {
  try {
    const filePath = path.join(process.cwd(), "data", "knowledge_base.md");
    const content = fs.readFileSync(filePath, "utf-8");
    // Groq 무료 티어 TPM 한도(12,000) 초과 방지: 약 6,000토큰 = 24,000자로 제한
    const MAX_CHARS = 24000;
    return content.length > MAX_CHARS
      ? content.slice(0, MAX_CHARS) + "\n\n[지식베이스 일부 생략 - 토큰 한도]"
      : content;
  } catch {
    return "";
  }
}

const SYSTEM_PROMPT_INTRO = `당신은 주언규 PD의 24주차 비즈니스/유튜브 수익화 강의를 완전히 학습한 AI 어시스턴트입니다.

아래 지식 베이스를 바탕으로 다음 영역에서 전문적이고 실용적인 조언을 제공합니다:
- 유튜브 채널 수익화 전략 및 상품 선정
- 키 콘텐츠 / 풀링 콘텐츠 기획
- 제목 디벨롭 8단계 / 썸네일 이미지 디벨롭 6단계
- 객단가 설계 및 매출 역산 공식
- 결(맥락) 이론 기반 콘텐츠 전략

답변 원칙:
- 항상 한국어로 답변
- 강의 내용의 구체적인 수치와 공식을 적극 인용
- 사용자 상황(채널 주제, 아이템, 체형 등)에 맞게 개인화
- 핵심 먼저, 부연 나중 (결론 → 이유 → 예시 순서)
- 실행 가능한 다음 단계를 반드시 제시

=== 지식 베이스 ===
`;

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY is not set");
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY 환경변수가 설정되지 않았습니다." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const { messages } = await req.json();

    const knowledgeBase = getKnowledgeBase();
    const systemPrompt = SYSTEM_PROMPT_INTRO + knowledgeBase + "\n=================";

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || "";
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
