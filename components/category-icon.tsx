import {
  CircleDot,
  Columns3,
  Sigma,
  type LucideProps,
} from "lucide-react";

const icons = {
  philosophy: CircleDot,
  history: Columns3,
  mathematics: Sigma,
};

export function CategoryIcon({
  category,
  ...props
}: LucideProps & { category: string }) {
  const Icon = icons[category as keyof typeof icons] || CircleDot;
  return <Icon {...props} />;
}
