import fs from "fs";
import path from "path";

interface Section {
  title: string;
  content: string;
  charCount: number;
}

function splitIntoSections(content: string): Section[] {
  // ## 헤더 기준으로 분할 (### 하위 섹션은 상위 ## 블록에 포함)
  const parts = content.split(/(?=^## )/m);
  return parts
    .filter((p) => p.trim().length > 0)
    .map((part) => {
      const firstLine = part.split("\n")[0].trim();
      return {
        title: firstLine.replace(/^#+\s*/, ""),
        content: part.trim(),
        charCount: part.length,
      };
    });
}

function scoreSection(section: Section, query: string): number {
  // 쿼리에서 키워드 추출 (2자 이상)
  const terms = query
    .split(/[\s,\.!?\(\)\[\]]+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase());

  if (terms.length === 0) return 0;

  const titleLower = section.title.toLowerCase();
  const contentLower = section.content.toLowerCase();

  let score = 0;
  for (const term of terms) {
    // 제목 매칭은 가중치 5배
    if (titleLower.includes(term)) score += 5;
    // 본문 매칭
    if (contentLower.includes(term)) score += 1;
  }
  return score;
}

/**
 * 사용자 쿼리와 관련된 지식베이스 섹션만 검색하여 반환
 * @param query 사용자 질문
 * @param maxChars 최대 글자 수 (기본 10,000자 ≈ 7,200 토큰)
 */
export function retrieveRelevantContext(
  query: string,
  maxChars = 10000
): string {
  let content: string;
  try {
    content = fs.readFileSync(
      path.join(process.cwd(), "data", "knowledge_base.md"),
      "utf-8"
    );
  } catch {
    return "";
  }

  const sections = splitIntoSections(content);

  // 점수 계산 및 정렬
  const scored = sections
    .map((s) => ({ ...s, score: scoreSection(s, query) }))
    .sort((a, b) => b.score - a.score);

  let totalChars = 0;
  const selected: string[] = [];

  for (const section of scored) {
    if (totalChars + section.charCount <= maxChars) {
      selected.push(section.content);
      totalChars += section.charCount;
    }
    // 예산의 95% 이상 채워지면 중단
    if (totalChars >= maxChars * 0.95) break;
  }

  return selected.join("\n\n");
}
