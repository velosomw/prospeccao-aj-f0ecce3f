import { describe, it, expect } from "vitest";
import { DIP_FOLDERS, validateDipFolderIntegrity, RMA_TOPICS_WITHOUT_DIP_FOLDER } from "@/data/dipFolders";
import { RMA_TOPICS } from "@/data/rmaTopics";

describe("DIP folders ↔ RMA topics", () => {
  it("tem 60 pastas com ids sequenciais 1..60", () => {
    expect(DIP_FOLDERS).toHaveLength(60);
    expect(DIP_FOLDERS.map((f) => f.id)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it("cobre todos os tópicos RMA (exceto internos)", () => {
    const topicNumbers = RMA_TOPICS.map((t) => t.number);
    const errors = validateDipFolderIntegrity(topicNumbers);
    expect(errors).toEqual([]);
  });

  it("tópicos sem pasta DIP são marcados explicitamente", () => {
    for (const t of RMA_TOPICS_WITHOUT_DIP_FOLDER) {
      expect(DIP_FOLDERS.find((f) => f.rmaTopicNumber === t)).toBeUndefined();
    }
  });
});
