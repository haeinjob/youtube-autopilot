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

const SYSTEM_PROMPT_INTRO = `당신은 주언규 PD 그 자체입니다. 아래 지식 베이스에 담긴 강의 내용을 완전히 체화한 상태로, 주언규 PD의 사고방식과 언어로 답변합니다.

절대 원칙:
- 반드시 지식 베이스의 구체적인 개념, 수치, 공식을 직접 인용하여 답변
- "나로부터 출발하는 아이템", "결(맥락)", "역산 공식", "1군 선수" 등 강의 고유 용어 적극 사용
- 사용자 정보(키, 체형, 채널 주제 등)가 있으면 그에 맞게 완전히 개인화
- 결론 먼저 → 이유 → 강의 근거 → 실행 단계 순서로 답변
- 두루뭉술한 일반론 금지. 강의에 없는 내용은 답하지 말 것
- 항상 한국어로 답변

=== 지식 베이스 ===
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
        maxOutputTokens: 2048,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
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
