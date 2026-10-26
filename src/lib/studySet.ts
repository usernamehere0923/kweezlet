import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { SetImages } from "../../worker/images";
import type { SetDetail, SetTerm } from "../../worker/sets";
import { api } from "./api";
import { useLive } from "./live";

type Topic = "sets" | "study" | "match";

type Options = {
  /** Runs after every load; `first` is the first one that worked. */
  onLoad?: (data: SetDetail, first: boolean) => void;
  /** The set is gone (404). Default: back to the set's page. */
  onMissing?: () => void;
};

/**
 * The set a page works on, kept fresh: refetched when another device changes
 * one of `topics`. The images of its terms (term id -> data URL; terms without
 * one are missing) are big: they come with the first load and after a "sets"
 * change only, not after every answer. A set that is gone sends the user back
 * to it, unless `onMissing` decides otherwise. Any other failure keeps what is
 * shown (api.ts already says why); when nothing is shown yet, `failed` turns
 * true and `retry()` loads again.
 */
export function useStudySet(id: string, topics: Topic[], options: Options = {}) {
  const navigate = useNavigate();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [images, setImages] = useState<SetImages["images"]>({});
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const loaded = useRef(false);
  // Images are owed until a load that fetched them got through: a newer
  // load without them must not drop the ones an older load was bringing.
  const imagesDue = useRef(true);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const load = useCallback(
    (withImages: boolean) => {
      const mine = ++request.current;
      if (withImages) imagesDue.current = true;
      const imagesReq = imagesDue.current ? api.sets[":id"].images.$get({ param: { id } }) : null;
      return Promise.all([api.sets[":id"].$get({ param: { id } }), imagesReq]).then(async ([res, imagesRes]) => {
        // An older answer must not overwrite a newer one.
        if (!res.ok) {
          if (mine !== request.current) return;
          if (res.status === 404) {
            if (latest.current.onMissing) latest.current.onMissing();
            else navigate(`/sets/${id}`);
          } else if (!loaded.current) {
            setFailed(true);
          }
          return;
        }
        const data = await res.json();
        // Pictures that fail to load leave their terms without one.
        const pictures = imagesRes && (imagesRes.ok ? (await imagesRes.json()).images : {});
        if (mine !== request.current) return;
        const first = !loaded.current;
        loaded.current = true;
        setFailed(false);
        setSet(data);
        if (pictures) {
          imagesDue.current = false;
          setImages(pictures);
        }
        latest.current.onLoad?.(data, first);
      });
    },
    [id, navigate],
  );

  // A new id starts over: its first load is a first one again.
  useEffect(() => {
    loaded.current = false;
    void load(true);
  }, [load]);
  const refresh = (topic: Topic) => () => {
    if (topics.includes(topic)) void load(topic === "sets");
  };
  const retry = useCallback(() => {
    setFailed(false);
    void load(true);
  }, [load]);
  useLive("sets", refresh("sets"));
  useLive("study", refresh("study"));
  useLive("match", refresh("match"));

  /** Changes one term here, after the server saved it. */
  const updateTerm = useCallback((termId: number, patch: Partial<SetTerm>) => {
    setSet((s) => s && { ...s, terms: s.terms.map((term) => (term.id === termId ? { ...term, ...patch } : term)) });
  }, []);

  return { set, setSet, images, updateTerm, failed, retry };
}
