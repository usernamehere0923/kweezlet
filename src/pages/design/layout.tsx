import type { ReactNode } from "react";
import { Heading, Text } from "../../ui";

// Sample data. It only exists on this page.
export const ANIMALS = [
  { term: "el gato", definition: "the cat" },
  { term: "el perro", definition: "the dog" },
  { term: "el pájaro", definition: "the bird" },
  { term: "el caballo", definition: "the horse" },
  { term: "la vaca", definition: "the cow" },
  { term: "el pez", definition: "the fish" },
];

/** One block on this page: a title, the live demo, and the code to copy. */
export function Section({ title, code, children }: { title: string; code?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <Heading level={3} className="text-muted">
        {title}
      </Heading>
      <div>{children}</div>
      {code && (
        <pre className="overflow-x-auto rounded-ui border border-line-soft bg-sunken/50 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-soft">
          {code.trim()}
        </pre>
      )}
    </section>
  );
}

export function Chapter({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-8 border-t border-line-soft pt-10">
      <div>
        <Heading>{title}</Heading>
        {intro && (
          <Text variant="muted" className="mt-1">
            {intro}
          </Text>
        )}
      </div>
      {children}
    </div>
  );
}
