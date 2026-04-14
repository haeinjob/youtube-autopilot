# AI 비즈니스 오토파일럿 — 서비스 설계 사양서 v0.1
> 기반: 주언규 PD 24주차 강의 수익화 철학
> 상태: 강의 학습 병행 갱신 중

---

## 아키텍처 개요

```
사용자 입력 (관심사/직업/성별/연령)
         │
         ▼
┌─────────────────────────────────────┐
│         PIPELINE ORCHESTRATOR        │
└──┬──────────────┬────────────────┬──┘
   │              │                │
   ▼              ▼                ▼
[아이템 스캐너] [콘텐츠 엔진]  [랜딩페이지 빌더]
   │              │                │
   ▼              ▼                ▼
[시장성 점수]  [풀링/키 콘텐츠] [카피라이팅]
   │              │                │
   └──────────────┴────────────────┘
                  │
                  ▼
         [수익화 파이프라인 리포트]
```

---

## Feature 1: 아이템 스캐너 & 검증 로직

### 1.1 데이터 소스 연동

```typescript
interface DataSourceConfig {
  naverDataLab: {
    endpoint: string;
    metrics: ['searchVolume', 'trend', 'seasonality'];
  };
  pandaRank: {
    endpoint: string;
    metrics: ['reviewCount', 'salesVolume', 'avgPrice'];
  };
  youtubeAPI: {
    endpoint: string;
    metrics: ['viewCount', 'subscriberGrowth', 'engagementRate'];
  };
}
```

### 1.2 시장성 판별 알고리즘

```typescript
interface MarketValidationScore {
  // 리뷰 5% 법칙: 리뷰 수 / 예상 구매자 수
  reviewConversionRate: number;       // 목표: >= 0.05 (5%)
  
  // 객단가 25만원 기준 가중치
  unitPriceScore: number;             // 25만원 이상 = 가중치 1.5x
  
  // 검색량 기반 시장 규모
  marketSizeScore: number;
  
  // 경쟁 포화도 역산
  competitionScore: number;           // 낮을수록 좋음
  
  // 최종 종합 점수 (100점 만점)
  totalScore: number;
  
  // 통과/실패 판정
  verdict: 'PASS' | 'CONDITIONAL' | 'FAIL';
}

function calculateMarketScore(item: ItemData): MarketValidationScore {
  const reviewRate = item.reviewCount / item.estimatedBuyers;
  const priceMultiplier = item.avgPrice >= 250000 ? 1.5 : 1.0;
  
  // 세부 점수 계산 로직 (강의 기준 갱신 예정)
  const marketSize = normalizeSearchVolume(item.naverSearchVolume);
  const competition = inverseNormalize(item.competitorCount);
  
  const total = (
    (reviewRate >= 0.05 ? 30 : reviewRate * 600) +
    (marketSize * 30 * priceMultiplier) +
    (competition * 40)
  );
  
  return {
    reviewConversionRate: reviewRate,
    unitPriceScore: priceMultiplier,
    marketSizeScore: marketSize,
    competitionScore: competition,
    totalScore: Math.min(total, 100),
    verdict: total >= 70 ? 'PASS' : total >= 50 ? 'CONDITIONAL' : 'FAIL'
  };
}
```

### 1.3 '나로부터 출발하는 아이템' 추천 시스템

```typescript
interface UserProfile {
  gender: 'M' | 'F' | 'OTHER';
  ageGroup: '20s' | '30s' | '40s' | '50s+';
  occupation: string;
  hobbies: string[];
  painPoints: string[];               // 사용자가 직접 겪는 문제
}

interface ItemRecommendation {
  item: string;
  matchReason: string;               // "당신의 [직업/취미/경험]에서 출발한 아이템"
  competitiveAdvantage: string;      // 이 사람이 왜 이 아이템에서 유리한가
  marketScore: MarketValidationScore;
  exampleCreator: string;            // 유사 성공 사례
}

// 추천 프롬프트 템플릿 (강의 학습 완료 시 정교화)
const ITEM_RECOMMENDATION_PROMPT = `
당신은 {userProfile.occupation}이고 {userProfile.ageGroup}대 {userProfile.gender}입니다.
당신의 일상에서 겪는 문제: {userProfile.painPoints}
당신의 강점/경험: {userProfile.hobbies + occupation}

이 사람이 "강의 없이도" 자신의 경험만으로 가르칠 수 있고,
객단가 25만원 이상이며, 시장 리뷰 전환율 5% 이상인 아이템 5개를 추천하라.
각 추천에는 반드시 "왜 이 사람이 유리한가"의 근거를 포함하라.
`;
```

---

## Feature 2: 콘텐츠 자동 생성 엔진

### 2.1 풀링 vs 키 콘텐츠 분류 알고리즘

```typescript
type ContentType = 'PULLING' | 'KEY';

interface ContentClassification {
  type: ContentType;
  topic: string;
  targetEmotion: string;             // 시청자가 느껴야 할 감정
  cta: string;                       // Call To Action
  estimatedViews: 'HIGH' | 'MEDIUM'; // 풀링=HIGH, 키=MEDIUM but CONVERT
}

function classifyContent(topic: string): ContentClassification {
  // 풀링 콘텐츠: 검색량 높음, 정보성, 넓은 타겟
  // 키 콘텐츠: 구매 의도 높음, 전환 목적, 좁은 타겟
  
  const searchVolume = getSearchVolume(topic);
  const buyingIntent = analyzeBuyingIntent(topic);
  
  if (searchVolume > THRESHOLD_HIGH && buyingIntent < THRESHOLD_LOW) {
    return { type: 'PULLING', ... };
  } else {
    return { type: 'KEY', ... };
  }
}
```

### 2.2 주언규 스타일 썸네일/제목 생성 규칙

```typescript
interface ThumbnailTitleSpec {
  // 제목 생성 규칙
  titleFormulas: [
    "숫자 + 충격 사실: [N]가지 이유로 당신은 [손실]하고 있다",
    "금기 파괴형: [업계 전문가]도 모르는 [아이템]의 진실",
    "비교 대비형: [A]는 되는데 왜 [B]는 안될까? (실험 결과)",
    "자기 고백형: 나는 왜 [기존 방법]을 버렸는가",
    "미래 공포형: 지금 [행동] 안 하면 [N년 후] 후회합니다",
  ];
  
  // 썸네일 구성 요소
  thumbnailElements: {
    faceExpression: 'SHOCK' | 'CONFIDENT' | 'CURIOUS' | 'CONCERNED';
    textOverlay: string;             // 3~5단어, 핵심 감정어
    colorPsychology: string;         // 클릭 유도 색상 조합
    arrowOrIndicator: boolean;       // 시선 유도 요소
  };
}

// 썸네일 생성 프롬프트 (Midjourney/DALL-E 호환)
const THUMBNAIL_PROMPT_TEMPLATE = `
YouTube thumbnail for Korean audience.
Topic: {topic}
Emotion trigger: {targetEmotion}
Face: Korean person with {faceExpression} expression, looking at camera
Text overlay: "{textOverlay}" in bold Korean font
Background: {colorPsychology}
Style: High contrast, CTR-optimized, hyperrealistic
--ar 16:9
`;
```

### 2.3 대본 & 고정 댓글 설계

```typescript
interface ScriptStructure {
  // 훅 (0~15초): 시청자를 붙잡는 충격 또는 공감
  hook: {
    type: 'SHOCKING_FACT' | 'RELATABLE_PAIN' | 'PROVOCATIVE_QUESTION';
    content: string;
    analogyExample: string;          // 주언규 스타일 비유
  };
  
  // 본론 (15초~): 핵심 가치 전달
  body: {
    keyPoints: string[];
    psychologyTrigger: string;       // 손실회피/사회적증거/희소성 중 선택
    evidenceType: 'DATA' | 'STORY' | 'COMPARISON';
  };
  
  // 클로징 (마지막 30초): 행동 유도
  closing: {
    cta: string;
    urgencyElement: string;          // 희소성 또는 시간 제한
    socialProof: string;
  };
}

// 고정 댓글 템플릿 (전환 최적화)
const PINNED_COMMENT_TEMPLATE = `
📌 이 영상 보신 분들께:

✅ [영상 핵심 요약 1줄]
✅ [무료 자료/링크 제공]
✅ [다음 영상 예고 — 클릭 유도]

💬 [시청자 참여 유도 질문]
→ 댓글로 알려주세요!
`;
```

---

## Feature 3: 수익화 랜딩페이지 설계

### 3.1 '결과 → 증거 → 제품' 카피라이팅 구조

```typescript
interface LandingPageStructure {
  // Section 1: RESULT (결과 먼저 보여주기)
  resultSection: {
    headline: string;                // "당신도 [구체적 결과]를 얻을 수 있습니다"
    specificNumbers: string;         // 추상 금지, 숫자로 구체화
    timeFrame: string;               // "N주 만에", "단 N일로"
  };
  
  // Section 2: EVIDENCE (증거로 신뢰 구축)
  evidenceSection: {
    beforeAfterStory: string;        // 변화 서사
    socialProof: string[];           // 실제 후기, 수강생 성과
    dataPoint: string;               // 통계/수치 근거
  };
  
  // Section 3: PRODUCT (제품 소개)
  productSection: {
    uniqueValueProp: string;         // 왜 이 제품인가
    priceAnchoring: string;          // 원래 가격 vs 현재 가격
    scarcityElement: string;         // 한정 수량/기간
    cta: string;                     // 버튼 텍스트
  };
}

// 자동 카피라이팅 프롬프트
const LANDING_PAGE_COPY_PROMPT = `
다음 구조로 한국어 랜딩페이지 카피를 작성하라:

1. [결과 헤드라인]: {item}을 통해 얻을 수 있는 가장 구체적인 결과를 숫자로 표현
2. [공감 서사]: 타겟 고객의 현재 고통 → 변화 가능성을 2~3문장으로
3. [증거]: 실제 성과 데이터 또는 사례를 제시하는 방식
4. [제품 소개]: 혜택 중심(기능 나열 금지)
5. [CTA]: 손실 회피 심리를 활용한 버튼 문구

금지사항: 추상적 표현("좋은", "완벽한"), 기능 나열, 과장 허위 광고
`;
```

---

## 마케팅 심리 트리거 매핑

| 트리거 | 적용 위치 | 구현 방식 |
|--------|-----------|-----------|
| 손실 회피 (Loss Aversion) | 제목, CTA | "안 하면 잃는다" 프레임 |
| 사회적 증거 (Social Proof) | 랜딩페이지 | 수강생 후기, 숫자 |
| 희소성 (Scarcity) | 클로징, 랜딩 | 한정 수량/시간 |
| 호기심 갭 (Curiosity Gap) | 썸네일, 제목 | 정보 일부만 공개 |
| 권위 (Authority) | 전반 | 전문가 자격, 성과 수치 |
| 일관성 (Commitment) | 댓글 유도 | 작은 동의부터 시작 |

---

## 강의 학습 완료 후 갱신 예정 항목

- [ ] 주차별 핵심 알고리즘 세분화
- [ ] 주언규 스타일 비유 DNA 라이브러리 구축
- [ ] 객단가/리뷰 기준 수치 검증 및 반영
- [ ] 풀링/키 콘텐츠 분류 임계값 보정
- [ ] 실제 API 엔드포인트 연동 사양 추가
