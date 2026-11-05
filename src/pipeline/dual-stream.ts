export interface AffectUpdateHeader {
  dp: number;
  da: number;
  dd: number;
  dTrust: number;
  userFeedbackScore: number;
  salience: number;
  memorySummary: string;
}

const clampNum = (val: number, min: number, max: number) =>
  Number.isFinite(val) ? Math.max(min, Math.min(max, val)) : 0;

export class DualStreamParser {
  private buffer = '';
  // 状态机阶段：INIT (等待探测前缀) -> IN_THINK (增量吐出思考流) -> SEEKING_AFFECT (探测标签) -> IN_AFFECT (收集标签) -> PASSTHROUGH (直通)
  private state: 'INIT' | 'IN_THINK' | 'SEEKING_AFFECT' | 'IN_AFFECT' | 'PASSTHROUGH' = 'INIT';
  private readonly targetPrefix = '<affect_update';
  private readonly thinkTagEnd = '</think>';

  public pushChunk(
    chunk: string,
    onHeaderExtracted: (header: AffectUpdateHeader) => void
  ): string {
    if (this.state === 'PASSTHROUGH') return chunk;

    this.buffer += chunk;
    let output = '';

    while (this.buffer.length > 0) {
      if (this.state === 'INIT') {
        const trimmed = this.buffer.trimStart();
        if (!trimmed) {
          if (this.buffer.length > 32) {
            this.state = 'PASSTHROUGH';
            output += this.buffer;
            this.buffer = '';
          }
          break;
        }

        const couldBeThink = '<think>'.startsWith(trimmed.slice(0, Math.min(trimmed.length, 7)));
        const couldBeAffect = this.targetPrefix.startsWith(trimmed.slice(0, Math.min(trimmed.length, this.targetPrefix.length)));

        // 1. 匹配到 <think>
        if (trimmed.startsWith('<think>')) {
          this.state = 'IN_THINK';
          const thinkStartIdx = this.buffer.indexOf('<think>');
          if (thinkStartIdx > 0) output += this.buffer.slice(0, thinkStartIdx);
          this.buffer = this.buffer.slice(thinkStartIdx + 7);
          output += '<think>';
          continue;
        }

        // 2. 匹配到 <affect_update
        if (trimmed.startsWith(this.targetPrefix)) {
          this.state = 'IN_AFFECT';
          const affectStartIdx = this.buffer.indexOf(this.targetPrefix);
          this.buffer = this.buffer.slice(affectStartIdx);
          continue;
        }

        // 3. 仍可能处于前缀输入中，等待更多 chunk
        if ((couldBeThink || couldBeAffect) && trimmed.length < Math.max(7, this.targetPrefix.length)) {
          break;
        }

        // 4. 两者皆非，直接转入直通模式
        this.state = 'PASSTHROUGH';
        output += this.buffer;
        this.buffer = '';
        break;
      }

      if (this.state === 'IN_THINK') {
        const closeIdx = this.buffer.indexOf(this.thinkTagEnd);
        if (closeIdx !== -1) {
          // 思考标签闭合，实时吐出思考链尾部及 </think>
          output += this.buffer.slice(0, closeIdx + this.thinkTagEnd.length);
          this.buffer = this.buffer.slice(closeIdx + this.thinkTagEnd.length);
          this.state = 'SEEKING_AFFECT';
          continue;
        } else {
          // 实时增量流出思考内容，仅保留尾部 7 字符防止 </think> 被跨 chunk 截断
          const safeLen = Math.max(0, this.buffer.length - (this.thinkTagEnd.length - 1));
          if (safeLen > 0) {
            output += this.buffer.slice(0, safeLen);
            this.buffer = this.buffer.slice(safeLen);
          }
          break;
        }
      }

      if (this.state === 'SEEKING_AFFECT') {
        const trimmed = this.buffer.trimStart();
        if (!trimmed) break;

        const couldBeAffect = this.targetPrefix.startsWith(trimmed.slice(0, Math.min(trimmed.length, this.targetPrefix.length)));
        if (trimmed.startsWith(this.targetPrefix)) {
          this.state = 'IN_AFFECT';
          const startIdx = this.buffer.indexOf(this.targetPrefix);
          this.buffer = this.buffer.slice(startIdx);
          continue;
        }

        if (couldBeAffect && trimmed.length < this.targetPrefix.length) {
          break; // 继续等待标签前缀完全到达
        }

        // 思考块后无协议标签，直接转直通
        this.state = 'PASSTHROUGH';
        output += this.buffer;
        this.buffer = '';
        break;
      }

      if (this.state === 'IN_AFFECT') {
        // 引号感知的闭合标记扫描，杜绝属性内部包含 > 导致的截断
        let inDouble = false;
        let inSingle = false;
        let closeIdx = -1;

        for (let i = 0; i < this.buffer.length; i++) {
          const ch = this.buffer[i];
          if (ch === '"' && !inSingle) inDouble = !inDouble;
          else if (ch === "'" && !inDouble) inSingle = !inSingle;
          else if (ch === '>' && !inDouble && !inSingle) {
            closeIdx = i;
            break;
          }
        }

        if (closeIdx === -1) {
          if (this.buffer.length > 512) {
            this.state = 'PASSTHROUGH';
            output += this.buffer;
            this.buffer = '';
          }
          break;
        }

        const tagText = this.buffer.slice(0, closeIdx + 1);
        this.buffer = this.buffer.slice(closeIdx + 1).replace(/^\r?\n/, '');
        this.state = 'PASSTHROUGH';

        const attrs: Record<string, string> = {};
        const attrRegex = /([a-zA-Z_]\w*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
        let match: RegExpExecArray | null;
        while ((match = attrRegex.exec(tagText)) !== null) {
          const key = match[1].toLowerCase();
          const val = match[2] ?? match[3] ?? match[4] ?? '';
          attrs[key] = val;
        }

        const getAttr = (name: string, fallback = '0') => attrs[name.toLowerCase()] ?? fallback;

        onHeaderExtracted({
          dp: clampNum(parseFloat(getAttr('dp')), -0.4, 0.4),
          da: clampNum(parseFloat(getAttr('da')), -0.4, 0.4),
          dd: clampNum(parseFloat(getAttr('dd')), -0.4, 0.4),
          dTrust: clampNum(parseFloat(getAttr('d_trust')), -0.05, 0.05),
          userFeedbackScore: clampNum(parseFloat(getAttr('user_feedback_score')), -1.0, 1.0),
          salience: clampNum(parseFloat(getAttr('salience')), 0.0, 1.0),
          memorySummary: getAttr('memory_summary', '').trim().slice(0, 45),
        });

        output += this.buffer;
        this.buffer = '';
        break;
      }
    }

    return output;
  }

  public flush(): string {
    const remaining = this.buffer;
    this.buffer = '';
    this.state = 'PASSTHROUGH';
    return remaining;
  }
}
