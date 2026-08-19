import { useEffect, useState } from "react";
import {
  listPersistedSimilarityResults,
  runTitleSimilarityCheck,
  type SimilarityResultResource,
} from "./api";
import {
  Button,
  EmptyState,
  SimilarityBadge,
  SimilarityLegend,
  SimilarityRing,
} from "./components";

type SimilarityFetcher = (
  researchDocumentId: string | number,
) => Promise<SimilarityResultResource[]>;
type SimilarityChecker = (researchDocumentId: string | number) => Promise<void>;

function similarityPercentage(score: number | string): number | null {
  const normalizedScore = Number(score);
  if (
    !Number.isFinite(normalizedScore) ||
    normalizedScore < 0 ||
    normalizedScore > 1
  ) {
    return null;
  }
  return Math.round(normalizedScore * 100);
}

export default function SimilarityResults({
  researchDocumentId,
  fetchPersistedResults = listPersistedSimilarityResults,
  checkTitleSimilarity = runTitleSimilarityCheck,
}: {
  researchDocumentId?: string | number;
  fetchPersistedResults?: SimilarityFetcher;
  checkTitleSimilarity?: SimilarityChecker;
}) {
  const hasSelectedResearch =
    researchDocumentId !== undefined && researchDocumentId !== null;
  const [results, setResults] = useState<SimilarityResultResource[] | null>(
    null,
  );
  const [loading, setLoading] = useState(hasSelectedResearch);
  const [loadErrorFor, setLoadErrorFor] = useState<string | number | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const [checkErrorFor, setCheckErrorFor] = useState<string | number | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    if (!hasSelectedResearch) {
      return () => {
        active = false;
      };
    }

    void Promise.resolve()
      .then(() => {
        if (active) {
          setLoading(true);
          setLoadErrorFor(null);
        }
        return fetchPersistedResults(researchDocumentId);
      })
      .then((persistedResults) => {
        if (active) setResults(persistedResults);
      })
      .catch(() => {
        if (active) {
          setResults(null);
          setLoadErrorFor(researchDocumentId);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchPersistedResults, hasSelectedResearch, researchDocumentId]);

  const runCheck = async () => {
    if (!hasSelectedResearch || checking) return;

    setChecking(true);
    setCheckErrorFor(null);
    try {
      await checkTitleSimilarity(researchDocumentId);
      const persistedResults = await fetchPersistedResults(researchDocumentId);
      setResults(persistedResults);
      setLoadErrorFor(null);
    } catch {
      setCheckErrorFor(researchDocumentId);
    } finally {
      setChecking(false);
    }
  };

  const rankedResults = results
    ?.map((result) => ({
      result,
      percentage: similarityPercentage(result.final_similarity_score),
    }))
    .filter(
      (
        result,
      ): result is { result: SimilarityResultResource; percentage: number } =>
        result.percentage !== null,
    )
    .sort((first, second) => second.percentage - first.percentage);

  return (
    <section
      className="panel-card similarity-results"
      aria-labelledby="similarity-title"
    >
      <div className="similarity-results-header">
        <div>
          <p className="eyebrow">Title review</p>
          <h2 id="similarity-title">Similarity results</h2>
          <p>
            Ranked persisted title matches use the server&apos;s review status.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!hasSelectedResearch || checking}
          onClick={() => void runCheck()}
        >
          {checking ? "Checking title…" : "Run title similarity check"}
        </Button>
      </div>

      {!hasSelectedResearch ? (
        <EmptyState
          title="Select a research record to review title similarity"
          message="A research record must be selected before persisted matches can be loaded or a title similarity check can run."
        />
      ) : loading ? (
        <p className="similarity-status" role="status">
          Loading persisted title-similarity results…
        </p>
      ) : loadErrorFor === researchDocumentId ? (
        <p className="similarity-error" role="alert">
          Persisted title-similarity results could not be loaded. Try again
          after selecting the record again.
        </p>
      ) : rankedResults?.length === 0 ? (
        <EmptyState
          title="No persisted title-similarity candidates"
          message="This selected research record has no stored title matches yet."
        />
      ) : (
        <ol className="similarity-match-list" aria-label="Ranked title matches">
          {rankedResults?.map(({ result, percentage }, index) => (
            <li key={result.id} className="similarity-match">
              <span
                className="similarity-rank"
                aria-label={`Rank ${index + 1}`}
              >
                {index + 1}
              </span>
              <SimilarityRing score={percentage} size="small" />
              <div className="similarity-match-copy">
                <h3>{result.matched_title}</h3>
                <span className="similarity-match-tags">
                  <SimilarityBadge score={percentage} />
                  <span
                    className={`similarity-flag ${result.is_flagged ? "is-flagged" : ""}`}
                  >
                    {result.is_flagged ? "Flagged for review" : "Not flagged"}
                  </span>
                </span>
                <p>
                  <strong>FastText supporting context:</strong>{" "}
                  {result.contextual_analysis ??
                    "No FastText supporting context was provided with this result."}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {rankedResults !== undefined &&
        rankedResults !== null &&
        rankedResults.length > 0 && <SimilarityLegend />}

      {checkErrorFor === researchDocumentId && (
        <p className="similarity-error" role="alert">
          The title similarity check could not be completed. No similarity score
          was returned.
        </p>
      )}
    </section>
  );
}
