import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  listPersistedSimilarityResults,
  runTitleSimilarityCheck,
  type SimilarityResultResource,
} from "./api";
import { Button, EmptyState } from "./components";
import {
  classificationLabel,
  formatSimilarityPercentage,
  formatSimilarityValue,
  formatSimilarityWeight,
} from "./similarity";

type SimilarityFetcher = (
  researchDocumentId: string | number,
) => Promise<SimilarityResultResource[]>;
type SimilarityChecker = (researchDocumentId: string | number) => Promise<void>;

export default function SimilarityResults({
  researchDocumentId,
  fetchPersistedResults = listPersistedSimilarityResults,
  checkTitleSimilarity = runTitleSimilarityCheck,
  onOpenCatalog,
}: {
  researchDocumentId?: string | number;
  fetchPersistedResults?: SimilarityFetcher;
  checkTitleSimilarity?: SimilarityChecker;
  onOpenCatalog?: (matchedTitle: string) => void;
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [checkingFor, setCheckingFor] = useState<string | number | null>(null);
  const [checkErrorFor, setCheckErrorFor] = useState<string | number | null>(
    null,
  );
  const currentResearchDocumentId = useRef(researchDocumentId);
  const checkGeneration = useRef(0);
  const checking = checkingFor !== null && checkingFor === researchDocumentId;

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
          setResults(null);
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
  }, [
    fetchPersistedResults,
    hasSelectedResearch,
    loadAttempt,
    researchDocumentId,
  ]);

  useLayoutEffect(() => {
    currentResearchDocumentId.current = researchDocumentId;
    const selectionGeneration = ++checkGeneration.current;
    let active = true;
    queueMicrotask(() => {
      if (
        !active ||
        checkGeneration.current !== selectionGeneration ||
        currentResearchDocumentId.current !== researchDocumentId
      ) {
        return;
      }
      setCheckingFor(null);
      setCheckErrorFor(null);
    });
    return () => {
      active = false;
    };
  }, [researchDocumentId]);

  const runCheck = async () => {
    if (!hasSelectedResearch || checking) return;

    const selectedResearchDocumentId = researchDocumentId;
    const requestGeneration = ++checkGeneration.current;
    const isCurrentRequest = () =>
      checkGeneration.current === requestGeneration &&
      currentResearchDocumentId.current === selectedResearchDocumentId;
    setCheckingFor(selectedResearchDocumentId);
    setCheckErrorFor(null);
    try {
      await checkTitleSimilarity(selectedResearchDocumentId);
      if (!isCurrentRequest()) return;
      const persistedResults = await fetchPersistedResults(
        selectedResearchDocumentId,
      );
      if (!isCurrentRequest()) return;
      setResults(persistedResults);
      setLoadErrorFor(null);
    } catch {
      if (isCurrentRequest()) setCheckErrorFor(selectedResearchDocumentId);
    } finally {
      if (isCurrentRequest()) setCheckingFor(null);
    }
  };

  return (
    <section
      className="panel-card similarity-results"
      aria-labelledby="similarity-title"
    >
      <div className="similarity-results-header">
        <div>
          <p className="eyebrow">Manuscript review</p>
          <h2 id="similarity-title">Similarity results</h2>
          <p>
            Ranked results combine title and extracted manuscript text using
            TF-IDF and cosine similarity.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!hasSelectedResearch || checking}
          onClick={() => void runCheck()}
        >
          {checking
            ? "Checking manuscript…"
            : "Run manuscript similarity check"}
        </Button>
        <Button
          variant="quiet"
          disabled={!hasSelectedResearch || loading}
          onClick={() => setLoadAttempt((attempt) => attempt + 1)}
        >
          Refresh results
        </Button>
        <Button
          variant="quiet"
          disabled={!hasSelectedResearch}
          onClick={() => window.print()}
        >
          Print report
        </Button>
      </div>

      {!hasSelectedResearch ? (
        <EmptyState
          title="Select a research record to review manuscript similarity"
          message="Select a research record with a current PDF or DOCX manuscript before running the combined title and content check."
        />
      ) : loading ? (
        <p className="similarity-status" role="status">
          Loading persisted manuscript-similarity results…
        </p>
      ) : loadErrorFor === researchDocumentId ? (
        <p className="similarity-error" role="alert">
          Persisted title-similarity results could not be loaded. Try again
          after selecting the record again.{" "}
          <Button
            variant="secondary"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Retry
          </Button>
        </p>
      ) : results?.length === 0 ? (
        <EmptyState
          title="No persisted manuscript-similarity candidates"
          message="This selected research record has no stored manuscript matches yet."
        />
      ) : (
        <ol
          className="similarity-match-list"
          aria-label="Ranked manuscript matches"
        >
          {results?.map((result, index) => {
            const overall = formatSimilarityPercentage(
              result.overall_similarity_percentage,
            );
            const title = formatSimilarityPercentage(
              result.title_similarity_percentage,
            );
            const content = formatSimilarityPercentage(
              result.content_similarity_percentage,
            );
            const titleWeight = formatSimilarityWeight(result.title_weight);
            const contentWeight = formatSimilarityWeight(result.content_weight);
            const titleContribution = formatSimilarityValue(
              result.title_weighted_contribution,
            );
            const contentContribution = formatSimilarityValue(
              result.content_weighted_contribution,
            );
            const contentUnavailable =
              result.score_status === "content_unavailable" || !content;
            const showEquation =
              !!overall &&
              !contentUnavailable &&
              titleContribution !== null &&
              contentContribution !== null;
            const classification = classificationLabel(result.classification);
            return (
              <li key={result.id} className="similarity-match">
                <span
                  className="similarity-rank"
                  aria-label={`Rank ${index + 1}`}
                >
                  {index + 1}
                </span>
                <div className="similarity-match-copy">
                  <h3>{result.matched_title}</h3>
                  <span className="similarity-match-tags">
                    <span
                      className={`similarity-band similarity-band-${result.classification ?? "unavailable"}`}
                    >
                      Classification: {classification ?? "Unavailable"}
                    </span>
                    {result.adviser_review_required && (
                      <span className="similarity-flag is-flagged">
                        Adviser review required
                      </span>
                    )}
                    {result.title_match_alert && (
                      <span className="similarity-flag is-title-alert">
                        Near-exact title match alert
                      </span>
                    )}
                  </span>
                  <p>
                    <strong>Overall Similarity:</strong>{" "}
                    {overall ?? "Overall similarity unavailable"} ·{" "}
                    <strong>Classification:</strong>{" "}
                    {classification ?? "Unavailable"}
                  </p>
                  <p>
                    <strong>Title:</strong>{" "}
                    {title ?? "Title similarity unavailable"} ·{" "}
                    <strong>Weight:</strong>{" "}
                    {titleWeight ?? "Title weight unavailable"} ·{" "}
                    <strong>Contribution:</strong>{" "}
                    {titleContribution === null
                      ? "Title contribution unavailable"
                      : `${titleContribution} points`}
                  </p>
                  {contentUnavailable ? (
                    <p>Content analysis unavailable</p>
                  ) : (
                    <p>
                      <strong>Content:</strong> {content} ·{" "}
                      <strong>Weight:</strong>{" "}
                      {contentWeight ?? "Content weight unavailable"} ·{" "}
                      <strong>Contribution:</strong>{" "}
                      {contentContribution === null
                        ? "Content contribution unavailable"
                        : `${contentContribution} points`}
                    </p>
                  )}
                  {showEquation && (
                    <p>
                      <strong>
                        Displayed overall ≈ {titleContribution} +{" "}
                        {contentContribution} ≈ {overall}
                      </strong>
                    </p>
                  )}
                  {result.classification === "low" && (
                    <p>
                      The system detected low similarity based on the configured
                      comparison method. Low similarity does not prove
                      originality.
                    </p>
                  )}
                  {result.adviser_review_required && (
                    <p className="similarity-review-copy">
                      This result has been flagged for adviser review. The
                      system does not automatically reject the research.
                    </p>
                  )}
                  <p>
                    <strong>Contextual similarity note:</strong>{" "}
                    {result.contextual_analysis ??
                      "No additional contextual note was recorded with this result."}
                  </p>
                  {result.matched_terms && result.matched_terms.length > 0 && (
                    <p>
                      <strong>Shared terms:</strong>{" "}
                      {result.matched_terms.join(", ")}
                    </p>
                  )}
                  <p>
                    <strong>Analysis date:</strong>{" "}
                    {result.analyzed_at
                      ? new Date(result.analyzed_at).toLocaleString()
                      : "Not recorded"}
                  </p>
                  {onOpenCatalog && (
                    <Button
                      variant="quiet"
                      className="similarity-catalog-action"
                      onClick={() => onOpenCatalog(result.matched_title)}
                    >
                      Search catalog
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {checkErrorFor === researchDocumentId && (
        <p className="similarity-error" role="alert">
          The manuscript similarity check could not be completed. Confirm that a
          current text-based PDF or DOCX is available, then try again.
        </p>
      )}
    </section>
  );
}
