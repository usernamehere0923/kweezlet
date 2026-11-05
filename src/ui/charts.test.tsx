import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { renderUi } from "../test/render";
import { AreaChart, BarChart, Heatmap, StackedBarChart, StatTile } from "./charts";

const POINTS = [
  { label: "Mon", value: 0 },
  { label: "Tue", value: 5 },
  { label: "Wed", value: 10 },
  { label: "Thu", value: 2 },
  { label: "Fri", value: 8 },
  { label: "Sat", value: 1 },
  { label: "Sun", value: 4 },
];

describe("StatTile", () => {
  test("shows its number, label and hint", () => {
    renderUi(<StatTile label="Cards learned today" value="12" hint="3 more than yesterday" icon="star" />);
    expect(screen.getByText("Cards learned today")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("3 more than yesterday")).toBeTruthy();
  });
});

describe("BarChart", () => {
  test("is one picture with its name, one bar per point", () => {
    const { container } = renderUi(<BarChart label="Cards per day" points={POINTS.slice(0, 3)} />);
    expect(screen.getByRole("img", { name: "Cards per day" })).toBeTruthy();
    // Three bars and the baseline.
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(4);
    expect(rects[0].getAttribute("class")).toBe("fill-accent");
    // A day without study stands empty.
    expect(rects[0].getAttribute("height")).toBe("0");
    expect(Number(rects[2]!.getAttribute("height"))).toBeGreaterThan(Number(rects[1]!.getAttribute("height")));
  });

  test("every bar tells its number on hover", () => {
    const { container } = renderUi(
      <BarChart label="Cards per day" points={POINTS.slice(0, 3)} format={(v) => `${v} cards`} />,
    );
    const titles = [...container.querySelectorAll("title")].map((title) => title.textContent);
    expect(titles).toEqual(["Mon · 0 cards", "Tue · 5 cards", "Wed · 10 cards"]);
  });

  test("the axis names the first, the last and a few between", () => {
    renderUi(<BarChart label="Cards per day" points={POINTS} />);
    expect(screen.getByText("Mon")).toBeTruthy();
    expect(screen.getByText("Sun")).toBeTruthy();
    expect(screen.queryByText("Tue")).toBeNull();
  });

  test("the last label shows only when it stays clear of the one before it", () => {
    const days = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Day ${i + 1}`, value: i }));
    renderUi(<BarChart label="Cards per day" points={days(30)} />);
    expect(screen.getByText("Day 26")).toBeTruthy();
    expect(screen.getByText("Day 30")).toBeTruthy(); // four columns behind Day 26

    const tight = renderUi(<BarChart label="Cards per day" points={days(27)} />);
    // Right behind Day 26, so it steps aside (its hover tooltip still has it).
    expect(screen.queryByText("Day 27")).toBeNull();
    expect(tight.container.textContent).toContain("Day 27 · 26");
  });
});

describe("StackedBarChart", () => {
  test("stacks wrong on correct and says so in the legend", () => {
    const { container } = renderUi(
      <StackedBarChart label="Answers" points={[{ label: "Mon", correct: 4, wrong: 2 }]} />,
    );
    expect(screen.getByRole("img", { name: "Answers" })).toBeTruthy();
    expect(screen.getByText("Correct")).toBeTruthy();
    expect(screen.getByText("Incorrect")).toBeTruthy();
    // The correct segment, the wrong one, and the baseline.
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    expect(rects[0].getAttribute("class")).toBe("fill-correct");
    expect(rects[1].getAttribute("class")).toBe("fill-wrong");
  });
});

describe("AreaChart", () => {
  test("draws the trend as a filled line", () => {
    const { container } = renderUi(<AreaChart label="Cards learned" points={POINTS.slice(1)} />);
    expect(screen.getByRole("img", { name: "Cards learned" })).toBeTruthy();
    const area = container.querySelector("path.fill-accent-wash");
    expect(area?.getAttribute("d")).toMatch(/^M0\.00,/);
    const line = container.querySelector("path.stroke-accent");
    expect(line?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    // Every point tells its number on hover, like the bars do.
    const titles = [...container.querySelectorAll("title")].map((title) => title.textContent);
    expect(titles).toEqual(POINTS.slice(1).map((point) => `${point.label} · ${point.value}`));
  });

  test("a single point is a dot of area, no line; none is just the frame", () => {
    const one = renderUi(<AreaChart label="Cards learned" points={POINTS.slice(0, 1)} />);
    expect(one.container.querySelector("path.fill-accent-wash")).toBeTruthy();
    expect(one.container.querySelector("path.stroke-accent")).toBeNull();

    const none = renderUi(<AreaChart label="Cards learned" points={[]} />);
    expect(none.container.querySelector("path")).toBeNull();
    expect(none.container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Cards learned");
  });
});

describe("Heatmap", () => {
  const days = [
    { day: "2026-10-05", count: 0 }, // a Monday
    { day: "2026-10-06", count: 5 },
    { day: "2026-10-07", count: 10 },
  ];

  test("one cell per day with its number as the tooltip", () => {
    renderUi(<Heatmap label="Learning activity" days={days} />);
    expect(screen.getByRole("img", { name: "Learning activity" })).toBeTruthy();
    expect(screen.getByTitle("Oct 5, 2026 · 0 cards")).toBeTruthy();
    expect(screen.getByTitle("Oct 7, 2026 · 10 cards")).toBeTruthy();
  });

  test("the busiest day burns the brightest", () => {
    renderUi(<Heatmap label="Learning activity" days={days} />);
    expect(screen.getByTitle("Oct 7, 2026 · 10 cards").getAttribute("class")).toContain("bg-heat-4");
    expect(screen.getByTitle("Oct 6, 2026 · 5 cards").getAttribute("class")).toContain("bg-heat-2");
    expect(screen.getByTitle("Oct 5, 2026 · 0 cards").getAttribute("class")).toContain("bg-heat-0");
  });

  test("weeks start on Sunday and the legend says less and more", () => {
    const { container } = renderUi(<Heatmap label="Learning activity" days={days} />);
    // Monday's cell is preceded by one blank, so the column is one full week.
    const cells = container.querySelectorAll("span[title]");
    expect(cells).toHaveLength(3);
    expect(screen.getByText("Less")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
    expect(screen.getByText("Oct")).toBeTruthy();
  });
});
