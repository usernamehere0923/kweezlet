import { useState } from "react";
import { QuestionCard } from "../../ui";

/** One QuestionCard with its own little state, only to show the card. */
export function QuestionDemo() {
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  return (
    <div className="mx-auto max-w-2xl">
      <QuestionCard
        label="Choose the definition"
        prompt="el gato"
        answer="the cat"
        options={["the dog", "the cat", "the horse"]}
        typed={typed}
        onTyped={setTyped}
        picked={picked}
        feedback={picked === null ? null : picked === "the cat" ? "correct" : "wrong"}
        onPick={setPicked}
        onSubmitTyped={() => {}}
        onContinue={() => setPicked(null)}
      />
    </div>
  );
}
