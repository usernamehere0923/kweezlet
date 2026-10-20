import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { SetDetail, SetTerm } from "../../worker/sets";
import { api } from "./api";
import { useLive } from "./live";

type Topic = "sets" | "study" | "match";

type Options = {
  /** Runs after every load; `first` is the page's first one. */
  onLoad?: (data: SetDetail, first: boolean) => void;
  /** The set could not be loaded. Default: back to the set's page. */
  onFail?: (status: number) => void;
};

/**
 * The set a page works on, kept fresh: refetched when another device changes
 * one of `topics`. A set that cannot be loaded sends the user back to it,
 * unless `onFail` decides otherwise.
 */
export function useStudySet(id: string, topics: Topic[], options: Options = {}) {
  const navigate = useNavigate();
  const [set, setSet] = useState<SetDetail | null>(null);
  const request = useRef(0);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const load = useCallback(
    (first: boolean) => {
      const mine = ++request.current;
      return api.sets[":id"].$get({ param: { id } }).then(async (res) => {
        // An older answer must not overwrite a newer one.
        if (!res.ok) {
          if (mine !== request.current) return;
          if (latest.current.onFail) latest.current.onFail(res.status);
          else navigate(`/sets/${id}`);
          return;
        }
        const data = await res.json();
        if (mine !== request.current) return;
        setSet(data);
        latest.current.onLoad?.(data, first);
      });
    },
    [id, navigate],
  );

  useEffect(() => void load(true), [load]);
  const refresh = (topic: Topic) => () => {
    if (topics.includes(topic)) void load(false);
  };
  useLive("sets", refresh("sets"));
  useLive("study", refresh("study"));
  useLive("match", refresh("match"));

  /** Changes one term here, after the server saved it. */
  const updateTerm = useCallback((termId: number, patch: Partial<SetTerm>) => {
    setSet((s) => s && { ...s, terms: s.terms.map((term) => (term.id === termId ? { ...term, ...patch } : term)) });
  }, []);

  return { set, setSet, updateTerm };
}
