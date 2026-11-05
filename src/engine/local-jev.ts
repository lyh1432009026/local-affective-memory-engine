import { PendingTurnSnapshot, buildStructuralDigest } from './implicit-rl';

export interface JevScoreResult {
  value: number;
  confidence: number;
  probs: number[];
}

export interface JevNoulResult {
  prob: number;
  confidence: number;
}

export interface JevTurnEvaluation {
  isTopicShift: JevNoulResult;
  isTechLogPaste: JevNoulResult;
  userFeedback: JevScoreResult;
  deltaP: JevScoreResult;
  deltaA: JevScoreResult;
  deltaD: number;
  dTrust: number;
  shouldMemorize: JevNoulResult;
  latencyMs: number;
}

function logSumExp(a: number, b: number): number {
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

export class LocalJevEngine {
  private endpoint: string;
  private timeoutMs: number;

  constructor(
    baseUrl: string = process.env.LOCAL_JEV_URL || 'http://127.0.0.1:8081/v1',
    timeoutMs: number = Number(process.env.LOCAL_JEV_TIMEOUT_MS || 450)
  ) {
    this.endpoint = `${baseUrl.replace(/\/$/, '')}/completions`;
    this.timeoutMs = timeoutMs;
  }

  /**
   * 发起单 Token 前向 Logits 提取请求（共享 statePrefix 命中 llama-server KV-Cache）
   */
  private async fetchSingleTokenLogprobs(
    prompt: string,
    signal: AbortSignal
  ): Promise<Record<string, number>> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        prompt,
        max_tokens: 1,
        temperature: 0,
        logprobs: 10,
        cache_prompt: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Jev HTTP ${res.status}`);
    }

    const data: any = await res.json();
    const map: Record<string, number> = {};

    // 兼容 OpenAI /v1/completions logprobs.top_logprobs[0] 与 llama.cpp completion_probabilities
    const topObj = data.choices?.[0]?.logprobs?.top_logprobs?.[0];
    if (topObj && typeof topObj === 'object') {
      for (const [tok, lp] of Object.entries(topObj)) {
        const key = String(tok).trim().toUpperCase();
        if (key && (map[key] === undefined || Number(lp) > map[key])) {
          map[key] = Number(lp);
        }
      }
    }

    const llamaProbs = data.completion_probabilities?.[0]?.probs;
    if (Array.isArray(llamaProbs)) {
      for (const item of llamaProbs) {
        const key = String(item.tok_str || '').trim().toUpperCase();
        const lp = typeof item.logprob === 'number' ? item.logprob : Math.log(Math.max(1e-9, item.prob || 1e-9));
        if (key && (map[key] === undefined || lp > map[key])) {
          map[key] = lp;
        }
      }
    }

    return map;
  }

  /**
   * Jev Noul 类型：二元真伪校准概率 P(Yes) ∈ [0, 1]
   */
  private async evalNoul(
    statePrefix: string,
    question: string,
    signal: AbortSignal
  ): Promise<JevNoulResult> {
    const prompt = `${statePrefix}\n[Question] ${question}\nAnswer with a single token (Y for Yes, N for No): `;
    const lpMap = await this.fetchSingleTokenLogprobs(prompt, signal);

    const lpY = logSumExp(lpMap['Y'] ?? -12.0, lpMap['YES'] ?? -12.0);
    const lpN = logSumExp(lpMap['N'] ?? -12.0, lpMap['NO'] ?? -12.0);
    const maxLp = Math.max(lpY, lpN);
    const expY = Math.exp(lpY - maxLp);
    const expN = Math.exp(lpN - maxLp);
    const prob = expY / (expY + expN);
    const confidence = Math.min(1, Math.abs(prob - 0.5) * 2);

    return {
      prob: Number(prob.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
    };
  }

  /**
   * Jev Score 类型：5 档有序量表概率分布 + 香农熵校准置信度 Confidence = 1 - H(P)/ln(5)
   */
  private async evalScore(
    statePrefix: string,
    question: string,
    rubricDesc: string,
    scaleValues: [number, number, number, number, number],
    signal: AbortSignal
  ): Promise<JevScoreResult> {
    const prompt = `${statePrefix}\n[Question] ${question}\n[Scale] ${rubricDesc}\nSelect level (single digit 1, 2, 3, 4, or 5): `;
    const lpMap = await this.fetchSingleTokenLogprobs(prompt, signal);

    const keys = ['1', '2', '3', '4', '5'];
    const rawLps = keys.map((k) => lpMap[k] ?? -9.0);
    if (!rawLps.every(Number.isFinite)) {
      return { value: 0, confidence: 0, probs: [0.2, 0.2, 0.2, 0.2, 0.2] };
    }
    const maxLp = Math.max(...rawLps);
    const exps = rawLps.map((lp) => Math.exp(lp - maxLp));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(sumExp) || sumExp <= 0) {
      return { value: 0, confidence: 0, probs: [0.2, 0.2, 0.2, 0.2, 0.2] };
    }
    const probs = exps.map((e) => e / sumExp);

    // 期望连续分值
    let expectedValue = 0;
    let entropy = 0;
    for (let i = 0; i < 5; i++) {
      const p = probs[i];
      if (!Number.isFinite(p)) {
        return { value: 0, confidence: 0, probs: [0.2, 0.2, 0.2, 0.2, 0.2] };
      }
      expectedValue += p * scaleValues[i];
      if (p > 1e-9) {
        entropy -= p * Math.log(p);
      }
    }

    const maxEntropy = Math.log(5);
    const confidence = Math.max(0, Math.min(1, 1 - entropy / maxEntropy));

    return {
      value: Number(expectedValue.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      probs: probs.map((p) => Number(p.toFixed(3))),
    };
  }

  /**
   * 单次并发评估当轮全部 6 项 System 1 决策；超时或本地服务未启动时返回 null 自动无缝回退至 Inline 模式
   */
  public async evaluateTurn(
    currentUserText: string,
    pendingTurn: PendingTurnSnapshot | null
  ): Promise<JevTurnEvaluation | null> {
    if (!currentUserText.trim()) return null;

    const startMs = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const prevUser = pendingTurn ? buildStructuralDigest(pendingTurn.userPrompt, 100) : 'None';
    const prevAssistant = pendingTurn
      ? buildStructuralDigest(pendingTurn.assistantReply, 140)
      : 'None';
    const currUser = buildStructuralDigest(currentUserText, 220);

    // 固定公共 State 前缀，确保并发子问题 100% 复用同一份 Prefix KV-Cache
    const statePrefix = `<|im_start|>system\nYou are a System-1 calibrated decision evaluator. Judge the state objectively.<|im_end|>\n<|im_start|>user\n[State]\nPrev_User: ${prevUser}\nPrev_Assistant_Digest: ${prevAssistant}\nCurrent_User: ${currUser}<|im_end|>\n<|im_start|>assistant`;

    try {
      const [isTopicShift, isTechLogPaste, userFeedback, deltaP, deltaA, shouldMemorize] =
        await Promise.all([
          this.evalNoul(
            statePrefix,
            'Is Current_User switching to a completely unrelated new topic instead of responding to Prev_Assistant_Digest?',
            controller.signal
          ),
          this.evalNoul(
            statePrefix,
            'Are any errors or stacktraces in Current_User just pasted technical debugging data rather than dissatisfaction or blame toward the assistant?',
            controller.signal
          ),
          this.evalScore(
            statePrefix,
            'How satisfied is Current_User with Prev_Assistant_Digest?',
            '1=Strong rejection/angry, 2=Unsatisfied/correcting mistake, 3=Neutral continuation, 4=Satisfied/moving forward, 5=Explicit praise/breakthrough',
            [-0.9, -0.4, 0.05, 0.45, 0.95],
            controller.signal
          ),
          this.evalScore(
            statePrefix,
            'What is the emotional pleasure/valence shift (delta_p) triggered by Current_User?',
            '1=Frustrated/hostile, 2=Slightly annoyed/impatient, 3=Calm/neutral, 4=Positive/smooth, 5=Excited/delighted',
            [-0.35, -0.15, 0.0, 0.12, 0.28],
            controller.signal
          ),
          this.evalScore(
            statePrefix,
            'What is the urgency and cognitive arousal shift (delta_a) in Current_User?',
            '1=Fatigued/closing, 2=Low energy/brief, 3=Normal pace, 4=Focused debugging, 5=High urgency/critical blocker',
            [-0.22, -0.10, 0.0, 0.14, 0.28],
            controller.signal
          ),
          this.evalNoul(
            statePrefix,
            'Does Current_User state a long-term personal preference, identity fact, or core architectural rule worth remembering across days?',
            controller.signal
          ),
        ]);

      const deltaD = deltaP.confidence >= 0.55 ? Number((deltaP.value * 0.35).toFixed(4)) : 0;
      const dTrust =
        userFeedback.confidence >= 0.55
          ? Number((userFeedback.value * 0.025).toFixed(4))
          : 0;

      return {
        isTopicShift,
        isTechLogPaste,
        userFeedback,
        deltaP,
        deltaA,
        deltaD,
        dTrust,
        shouldMemorize,
        latencyMs: Date.now() - startMs,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
