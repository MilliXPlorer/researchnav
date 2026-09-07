import { describe, expect, it, vi } from "vitest";
import { fetchSdgTaxonomy, isSdgNumber, validateSdgTaxonomy } from "./sdgApi";

const taxonomy = Array.from({ length: 17 }, (_, index) => ({
  number: index + 1,
  title: `Goal ${index + 1}`,
}));

describe("SDG taxonomy API", () => {
  it("fetches the complete ordered 1–17 taxonomy", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: taxonomy })),
    );

    await expect(fetchSdgTaxonomy(fetchMock)).resolves.toEqual(taxonomy);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sdgs",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(isSdgNumber(1)).toBe(true);
    expect(isSdgNumber(17)).toBe(true);
    expect(isSdgNumber(0)).toBe(false);
    expect(isSdgNumber(18)).toBe(false);
  });

  it("rejects malformed or incomplete taxonomy responses", () => {
    expect(() =>
      validateSdgTaxonomy({
        data: [...taxonomy.slice(0, 3), { number: 5, title: "Skipped" }],
      }),
    ).toThrow("INVALID_SDG_TAXONOMY");
    expect(() => validateSdgTaxonomy({ data: taxonomy.slice(0, 16) })).toThrow(
      "INVALID_SDG_TAXONOMY",
    );
  });
});
