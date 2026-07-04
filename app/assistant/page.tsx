import { Suspense } from "react";
import { AssistantConsole } from "@/components/ai/AssistantConsole";
import { SectionTitle } from "@/components/ui/GlassCard";

export const metadata = {
  title: "AI 研究助手 · FinSight",
};

export default function AssistantPage() {
  return (
    <div className="animate-rise">
      <SectionTitle
        kicker="AI Research Copilot"
        title="AI 研究助手"
        desc="自然语言提问，AI 自动调用实时行情、技术指标、财务与资讯数据，多步调研并生成结构化研报。"
      />
      <Suspense
        fallback={<div className="skeleton h-[480px] w-full rounded-2xl" />}
      >
        <AssistantConsole />
      </Suspense>
    </div>
  );
}
