import type { AiAction } from "./ai-assistant";

/** Default prompt library entries seeded per workspace. All are normal user-editable prompts. */
export type AiPromptSeed = {
  /** Stable suffix appended to workspace id so re-seed is idempotent. Matches AiAction when not custom. */
  key: Exclude<AiAction, "custom">;
  name: string;
  description: string;
  instruction: string;
};

/** Deterministic id for a seeded default prompt in a workspace. */
export const defaultAiPromptId = (workspaceId: string, seedKey: string) =>
  `${workspaceId}_aiprompt_${seedKey}`;

/** Parse seed key from a deterministic default prompt id, if any. */
export const parseDefaultAiPromptKey = (promptId: string): Exclude<AiAction, "custom"> | null => {
  const match = /_aiprompt_([a-z0-9-]+)$/i.exec(promptId);
  if (!match) return null;
  const key = match[1] as Exclude<AiAction, "custom">;
  return DEFAULT_AI_PROMPT_SEEDS.some((seed) => seed.key === key) ? key : null;
};

/**
 * Single source of truth for default note-processing prompts.
 * Used by: workspace seed, restore-defaults, and AI generate (when resolving built-in actions).
 * Text is user-visible and fully customizable after seeding.
 */
export const DEFAULT_AI_PROMPT_SEEDS: readonly AiPromptSeed[] = [
  {
    key: "summarize",
    name: "总结",
    description: "压缩全文，提炼主题、结论与可执行结果",
    instruction: [
      "对笔记做真正的精简总结，不要逐句改写、同义复述或回声式重写。",
      "识别中心主题、主要主张、关键结论与可执行结果。",
      "省略重复、修辞、举例、引语和次要细节，除非它们对理解关键结论必不可少。",
      "较长笔记目标约为原文 20–30% 篇幅，用 3–7 条简洁 Markdown 要点；短笔记用 1–3 句即可。",
      "不要大段照搬原文，也不要添加原文没有的信息。",
      "保持笔记原语言，只返回 Markdown 总结。",
    ].join(""),
  },
  {
    key: "extract-key-points",
    name: "提炼要点",
    description: "提取最重要观点，输出简洁要点列表",
    instruction: "提取笔记中最重要的要点，用简洁的 Markdown 列表输出。保持原语言，不要添加原文没有的信息。",
  },
  {
    key: "extract-todos",
    name: "提取待办",
    description: "识别可执行任务，生成任务清单",
    instruction: "从笔记中提取明确或隐含的可执行任务，用 Markdown 任务列表（- [ ]）输出。保持原语言，不要编造任务。若没有可执行事项，用原文语言简短说明。",
  },
  {
    key: "rewrite-proofread",
    name: "改写与校对",
    description: "润色全文并校对语法、标点与结构",
    instruction: "改写并校对完整笔记。修正拼写、语法、标点、清晰度与结构，不改变原意。保持原语言与 Markdown 格式。只返回完整修订稿。",
  },
  {
    key: "translate",
    name: "翻译",
    description: "翻译为指定目标语言，保留结构与格式",
    instruction: "将完整笔记翻译成用户指定的目标语言。保留原意、Markdown 结构、链接与代码块。只返回译文，不要评论。",
  },
  {
    key: "improve-writing",
    name: "改进表达",
    description: "提升表达清晰度与流畅度",
    instruction: "改进文字的清晰度、流畅度与用词，不改变原意。保持原语言与有用的 Markdown 格式。只返回改进后的内容。",
  },
  {
    key: "fix-spelling-grammar",
    name: "修正错别字与语法",
    description: "只修正错别字、语法与标点",
    instruction: "只修正拼写、语法与标点。不要改变语气、结构或含义。保持原语言与 Markdown 格式。只返回修正后的内容。",
  },
  {
    key: "make-shorter",
    name: "缩短内容",
    description: "删减冗余，保留关键事实",
    instruction: "把内容改写得更简洁。去掉重复与废话，保留每一个重要事实。保持原语言与有用的 Markdown 格式。只返回缩短后的内容。",
  },
  {
    key: "make-longer",
    name: "扩写内容",
    description: "在不编造事实的前提下扩写说明",
    instruction: "扩写内容，补充有用的说明与更顺畅的过渡，但不要编造事实。保持原语言与有用的 Markdown 格式。只返回扩写后的内容。",
  },
  {
    key: "simplify-language",
    name: "简化表达",
    description: "用更通俗易懂的语言改写",
    instruction: "用清晰、平实、更好懂的语言改写内容。保持原意、原语言与有用的 Markdown 格式。只返回简化后的内容。",
  },
  {
    key: "change-tone",
    name: "改变语气",
    description: "按指定语气重写，不改变含义",
    instruction: "按用户指定的语气重写内容，不改变原意。保持原语言与有用的 Markdown 格式。只返回改写后的内容。",
  },
  {
    key: "continue-writing",
    name: "继续写作",
    description: "从笔记末尾自然续写",
    instruction: "从笔记结束处自然续写。只返回新增续写内容，不要重复原文。保持原语言与 Markdown 风格。",
  },
];

export const getDefaultAiPromptSeed = (key: string) =>
  DEFAULT_AI_PROMPT_SEEDS.find((seed) => seed.key === key) ?? null;
