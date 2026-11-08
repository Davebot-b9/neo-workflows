import type { DecisionRoute } from "../../api/types";
import { ROUTE_META } from "../../domain/meta";
import { Badge } from "../ui/Badge";

export function RouteBadge({ route, short }: { route: DecisionRoute; short?: boolean }) {
  const meta = ROUTE_META[route];
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {short ? meta.short : meta.label}
    </Badge>
  );
}
