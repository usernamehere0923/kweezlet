import { useState } from "react";
import { useT, type TKey } from "../../i18n";
import type { QuestionKind } from "../../lib/quiz";
import { Button, Card, Checkbox, Heading, SegmentedControl } from "../../ui";

type LengthChoice = "5" | "10" | "all";
type TimerChoice = "off" | "5" | "10";

/** What the user picked for the next paper. */
export type TestChoices = {
  /** Questions on the paper; null = every term. */
  count: number | null;
  types: QuestionKind[];
  matching: boolean;
  /** Minutes on the clock; null = no timer. */
  minutes: number | null;
};

const KINDS: { kind: QuestionKind; label: TKey }[] = [
  { kind: "choice", label: "test.multipleChoice" },
  { kind: "truefalse", label: "test.trueFalse" },
  { kind: "written", label: "test.written" },
];

/** The settings form before a test: length, question types, timer. */
export function TestSetup({ onStart }: { onStart: (choices: TestChoices) => void }) {
  const { t, tn } = useT();
  const [length, setLength] = useState<LengthChoice>("5");
  const [kinds, setKinds] = useState<Record<QuestionKind, boolean>>({ choice: true, truefalse: true, written: true });
  const [matching, setMatching] = useState(true);
  const [timer, setTimer] = useState<TimerChoice>("off");

  const types = KINDS.filter(({ kind }) => kinds[kind]).map(({ kind }) => kind);
  const canStart = matching || types.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <Heading level={3} className="mb-3">
          {t("test.length")}
        </Heading>
        <SegmentedControl<LengthChoice>
          label={t("test.length")}
          value={length}
          onChange={setLength}
          options={[
            { value: "5", label: "5" },
            { value: "10", label: "10" },
            { value: "all", label: t("test.lengthAll") },
          ]}
        />
      </Card>

      <Card>
        <Heading level={3} className="mb-4">
          {t("test.types")}
        </Heading>
        <div className="flex flex-col gap-3">
          {KINDS.map(({ kind, label }) => (
            <Checkbox
              key={kind}
              label={t(label)}
              checked={kinds[kind]}
              onChange={(checked) => setKinds((all) => ({ ...all, [kind]: checked }))}
            />
          ))}
          <Checkbox label={t("test.matching")} checked={matching} onChange={setMatching} />
        </div>
      </Card>

      <Card>
        <Heading level={3} className="mb-3">
          {t("test.timer")}
        </Heading>
        <SegmentedControl<TimerChoice>
          label={t("test.timer")}
          value={timer}
          onChange={setTimer}
          options={[
            { value: "off", label: t("test.timerOff") },
            { value: "5", label: tn("test.minutes", 5) },
            { value: "10", label: tn("test.minutes", 10) },
          ]}
        />
      </Card>

      <div>
        <Button
          icon="checkCircle"
          disabled={!canStart}
          onClick={() =>
            onStart({
              count: length === "all" ? null : Number(length),
              types,
              matching,
              minutes: timer === "off" ? null : Number(timer),
            })
          }
        >
          {t("test.start")}
        </Button>
      </div>
    </div>
  );
}
