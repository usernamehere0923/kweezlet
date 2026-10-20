import { ButtonLink } from "../Button";
import { StreakBadge } from "./results";

/** Top row of a study screen: back to where you came from, the streak once there is one. */
export function StudyHeader({ backTo, backLabel, streak }: { backTo: string; backLabel: string; streak: number }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <ButtonLink to={backTo} variant="ghost" icon="chevronLeft" className="-ml-3">
        {backLabel}
      </ButtonLink>
      {streak > 0 && <StreakBadge days={streak} />}
    </div>
  );
}
