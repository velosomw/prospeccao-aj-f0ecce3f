import { describe, it, expect } from "vitest";
import { DIP_FOLDERS, validateDipFolderIntegrity, PROSPECCAO_TOPICS_WITHOUT_DIP_FOLDER } from "@/data/dipFolders";
import { PROSPECCAO_TOPICS } from "@/data/prospeccoesTopics";

describe("DIP folders ↔ Prospeccao topics", () => {
  it("tem 60 pastas com ids sequenciais 1..60", () => {
    expect(DIP_FOLDERS).toHaveLength(60);
    expect(DIP_FOLDERS.map((f) => f.id)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it("cobre todos os tópicos Prospeccao (exceto internos)", () => {
    const topicNumbers = PROSPECCAO_TOPICS.map((t) => t.number);
    const errors = validateDipFolderIntegrity(topicNumbers);
    expect(errors).toEqual([]);
  });

  it("tópicos sem pasta DIP são marcados explicitamente", () => {
    for (const t of PROSPECCAO_TOPICS_WITHOUT_DIP_FOLDER) {
      expect(DIP_FOLDERS.find((f) => f.prospeccaoTopicNumber === t)).toBeUndefined();
    }
  });
});
