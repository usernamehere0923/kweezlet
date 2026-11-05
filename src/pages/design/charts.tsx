import { useT } from "../../i18n";
import { AreaChart, BarChart, Card, Heatmap, StackedBarChart, StatTile, Text } from "../../ui";
import { Chapter, Section } from "./layout";

// Sample data. It only exists on this page.
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CARDS = [12, 5, 18, 0, 9, 22, 14].map((value, i) => ({ label: WEEK[i], value }));
const ANSWERS = [4, 11, 7, 15, 2, 9, 13].map((correct, i) => ({ label: WEEK[i], correct, wrong: (i * 3) % 5 }));
const LEARNED = [2, 5, 5, 9, 12, 14, 20].map((value, i) => ({ label: `W${i + 1}`, value }));
const HEAT_DAYS = Array.from({ length: 26 * 7 }, (_, i) => {
  const date = new Date(Date.now() - (26 * 7 - 1 - i) * 86_400_000);
  return { day: date.toISOString().slice(0, 10), count: [0, 2, 6, 12, 22][(i * 7 + 3) % 5] };
});

export function Charts() {
  const { t } = useT();
  return (
    <Chapter title={t("design.charts")}>
      <Section
        title="StatTile"
        code={`<StatTile label="Cards learned today" value="12" hint="3 more than yesterday" icon="star" />
<StatTile label="Total study time" value="4h 12m" icon="clock" />`}
      >
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Cards learned today" value="12" hint="3 more than yesterday" icon="star" />
          <StatTile label="Total study time" value="4h 12m" icon="clock" />
        </div>
      </Section>

      <Section
        title="BarChart"
        code={`<BarChart label="Cards studied per day" points={[{ label: "Mon", value: 12 }, …]} />`}
      >
        <Card>
          <Text variant="small" className="mb-2 text-muted">
            Cards studied per day
          </Text>
          <BarChart label="Cards studied per day" points={CARDS} />
        </Card>
      </Section>

      <Section
        title="StackedBarChart"
        code={`<StackedBarChart label="Answers per day" points={[{ label: "Mon", correct: 4, wrong: 1 }, …]} />`}
      >
        <Card>
          <Text variant="small" className="mb-2 text-muted">
            Correct vs. incorrect answers
          </Text>
          <StackedBarChart label="Correct and incorrect answers per day" points={ANSWERS} />
        </Card>
      </Section>

      <Section
        title="AreaChart"
        code={`<AreaChart label="Cards learned over the weeks" points={[{ label: "W1", value: 2 }, …]} />`}
      >
        <Card>
          <Text variant="small" className="mb-2 text-muted">
            Cards learned over the last weeks
          </Text>
          <AreaChart label="Cards learned over the last weeks" points={LEARNED} />
        </Card>
      </Section>

      <Section
        title="Heatmap"
        code={`<Heatmap label="Learning activity over the last weeks" days={[{ day: "2026-10-11", count: 12 }, …]} />`}
      >
        <Card>
          <Text variant="small" className="mb-2 text-muted">
            Learning activity over the last weeks
          </Text>
          <Heatmap label="Learning activity over the last weeks" days={HEAT_DAYS} />
        </Card>
      </Section>
    </Chapter>
  );
}
