import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { SetDetail } from "../../worker/sets";
import { api } from "./api";
import { useLive } from "./live";

type Topic = "sets" | "study" | "match";

/**
 * The set a study page works on, kept fresh: refetched when another device
 * changes one of `topics`. A set that is gone sends the user back to it.
 * `onLoad(data, first)` runs after every load; `first` is the page's first one.
 */
export function useStudySet(id: string, topics: Topic[], onLoad?: (data: SetDetail, first: boolean) => void) {
  const navigate = useNavigate();
  const [set, setSet] = useState<SetDetail | null>(null);
  const request = useRef(0);
  const latestOnLoad = useRef(onLoad);
  useEffect(() => {
    latestOnLoad.current = onLoad;
  });

  const load = useCallback(
    (first: boolean) => {
      const mine = ++request.current;
      return api.sets[":id"].$get({ param: { id } }).then(async (res) => {
        if (!res.ok) {
          navigate(`/sets/${id}`);
          return;
        }
        const data = await res.json();
        // An older answer must not overwrite a newer one.
        if (mine !== request.current) return;
        setSet(data);
        latestOnLoad.current?.(data, first);
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

  return [set, setSet] as const;
}
