import Link from "next/link";
import { IconArrow } from "@/components/ui/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="font-display text-7xl font-extrabold text-gradient">404</div>
      <p className="mt-3 text-lg font-semibold text-ink">页面或标的不存在</p>
      <p className="mt-1 text-sm text-muted">请检查链接，或返回首页继续研究。</p>
      <Link href="/" className="btn-neon mt-6">
        返回首页 <IconArrow width={15} height={15} />
      </Link>
    </div>
  );
}
