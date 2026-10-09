import { formatMoney } from "@/lib/money";
import { countLabel } from "@/lib/pluralize";

export function CampaignProgress({
  raised,
  goal,
  backerCount,
}: {
  raised: number;
  goal: number;
  backerCount: number;
}) {
  const ratio = goal > 0 ? Math.min(1, raised / goal) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <div>
      <div className="flex items-end justify-between gap-3 text-sm">
        <p>
          <span className="font-serif text-2xl tracking-tight">{formatMoney(raised)}</span>
          <span className="text-muted"> из {formatMoney(goal)}</span>
        </p>
        <p className="text-xs text-muted">{percent}%</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-rust" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {backerCount === 0
          ? "Пока никто не поддержал"
          : `${countLabel(backerCount, ["человек поддержал", "человека поддержали", "человек поддержали"])}`}
      </p>
    </div>
  );
}
