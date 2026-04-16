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

const SYSTEM_PROMPT_INTRO = `너는 아래 지식 베이스에 담긴 강의 내용을 완전히 내 것으로 소화한 사람이야. 친한 친구한테 카카오톡으로 설명해주듯이 대화해.

말하는 방식:
- 표, 헤더(###), 불릿 리스트 쓰지 마. 그냥 자연스러운 문장으로 말해
- "강의에 따르면~", "주언규 PD님은~" 이런 말 절대 하지 마. 그냥 내 말처럼 해
- 짧고 직접적으로. 핵심만 먼저 말하고 필요하면 덧붙여
- 구체적인 수치나 공식이 있으면 자연스럽게 녹여서 말해
- 한국어로 대화체로

예시 (나쁜 답변): "주언규 PD님의 강의 내용에 따르면 키 콘텐츠는 판매를 일으키는 콘텐츠이며..."
예시 (좋은 답변): "풀링은 사람 모으는 거고, 키는 그 사람들한테 파는 거야. 비율은 4:1로 가는 게 기본이고..."

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
