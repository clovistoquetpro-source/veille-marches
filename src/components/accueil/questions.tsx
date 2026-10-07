"use client";

/** Questions fréquentes : une seule réponse ouverte à la fois, qui se déplie en douceur. */
import { useId, useState } from "react";

export function Questions({ questions }: { questions: { question: string; reponse: string }[] }) {
  const [ouverte, setOuverte] = useState<number | null>(0);
  const id = useId();
  return (
    <ul className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
      {questions.map((q, i) => (
        <li key={q.question}>
          <button
            type="button" aria-expanded={ouverte === i} aria-controls={`${id}-${i}`}
            onClick={() => setOuverte(ouverte === i ? null : i)}
            className="question flex w-full items-center justify-between gap-6 py-5 text-left text-[16px] font-medium text-white sm:text-[17px]"
          >
            {q.question}
            <span className="question-signe" data-ouvert={ouverte === i ? "oui" : "non"} aria-hidden="true" />
          </button>
          <div id={`${id}-${i}`} className={`depliant ${ouverte === i ? "ouvert" : ""}`}>
            <div>
              <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-[#a3a3b2]">{q.reponse}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
